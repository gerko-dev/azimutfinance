// Matching serveur : rattache chaque ligne d'inventaire au référentiel du site
// (actions, obligations cotées, souverains UMOA-Titres, FCP) ou aux titres
// personnalisés de l'utilisateur. Module serveur (charge les loaders CSV).
import { loadStocks, loadListedBonds, loadUmoaEmissions } from "@/lib/dataLoader";
import { aggregateSovereignBonds } from "@/lib/listedBondsTypes";
import { loadFunds } from "@/lib/fcp";
import type { RawPosition } from "./portfolio-parse";
import {
  hrefForMatch,
  type CustomSecurity,
  type ImportedPosition,
  type MatchKind,
  type PortfolioSection,
  type ReferenceMatch,
} from "./portfolio-types";

// Normalise un code/symbole pour comparaison : trim + majuscules, espaces
// internes retirés (les codes du site n'en contiennent pas).
function normCode(s: string): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

// Normalisation "nom" tolérante (accents, ponctuation) pour les OPCVM.
const DIACRITICS = /[̀-ͯ]/g;
function normName(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Référentiel indexé, construit une fois par import.
type SiteIndex = {
  stockByCode: Map<string, { code: string; name: string }>;
  stockByIsin: Map<string, { code: string; name: string }>;
  listedByIsin: Map<string, { isin: string; name: string }>;
  listedByCode: Map<string, { isin: string; name: string }>;
  sovByIsin: Map<string, { isin: string; label: string }>;
  funds: Array<{ id: string; norm: string; nom: string }>;
};

function buildSiteIndex(): SiteIndex {
  const idx: SiteIndex = {
    stockByCode: new Map(),
    stockByIsin: new Map(),
    listedByIsin: new Map(),
    listedByCode: new Map(),
    sovByIsin: new Map(),
    funds: [],
  };

  for (const s of loadStocks()) {
    const entry = { code: s.code.trim(), name: s.name.trim() };
    if (s.code) idx.stockByCode.set(normCode(s.code), entry);
    if (s.isin && s.isin !== "0") idx.stockByIsin.set(normCode(s.isin), entry);
  }

  for (const b of loadListedBonds()) {
    const entry = { isin: b.isin, name: b.name };
    if (b.isin) idx.listedByIsin.set(normCode(b.isin), entry);
    if (b.code) idx.listedByCode.set(normCode(b.code), entry);
  }

  for (const sov of aggregateSovereignBonds(loadUmoaEmissions())) {
    if (sov.isin) {
      idx.sovByIsin.set(normCode(sov.isin), {
        isin: sov.isin,
        label: `${sov.type} ${sov.countryName} ${sov.maturityDate}`.trim(),
      });
    }
  }

  for (const f of loadFunds()) {
    idx.funds.push({ id: f.id, norm: normName(f.nom), nom: f.nom });
  }

  return idx;
}

// Recherche d'un fonds par nom (exact normalisé puis inclusion).
function findFund(index: SiteIndex, ...candidates: string[]): { id: string; nom: string } | null {
  const normed = candidates.map(normName).filter((c) => c.length >= 4);
  for (const c of normed) {
    const exact = index.funds.find((f) => f.norm === c);
    if (exact) return exact;
  }
  for (const c of normed) {
    const partial = index.funds.find((f) => f.norm.includes(c) || c.includes(f.norm));
    if (partial) return partial;
  }
  return null;
}

// Section déduite de la provenance site d'un titre personnalisé (attributs
// source). Un titre lié au site est classé selon le type du site, même si son
// `kind` stocké est resté générique (« autre »).
function sectionFromSource(source: string | undefined): PortfolioSection | null {
  switch (source) {
    case "stock":
      return "action";
    case "listed-bond":
    case "sovereign":
      return "obligation";
    case "fund":
      return "opcvm";
    default:
      return null;
  }
}

// Applique une résolution à une ligne brute. La section retenue reflète le type
// RECONNU (déduit du contenu), pas forcément l'en-tête du fichier.
function resolve(
  raw: RawPosition,
  section: PortfolioSection,
  kind: MatchKind,
  id: string,
  label: string,
  customId: string | null = null,
): ImportedPosition {
  return {
    ...raw,
    section,
    matchKind: kind,
    matchId: id,
    matchLabel: label,
    matchHref: hrefForMatch(kind, id),
    customSecurityId: customId,
  };
}

// Recherche un code et/ou un ISIN dans le référentiel du site (actions,
// obligations cotées, souverains). Renvoie la 1re correspondance, ou null.
// Utilisé à la création d'un titre pour proposer une liaison plutôt qu'un
// doublon.
export function lookupReference(code: string, isin: string): ReferenceMatch | null {
  const index = buildSiteIndex();
  const c = normCode(code);
  const i = normCode(isin);

  // Actions : par code (ticker) puis par ISIN.
  const stockByCode = c ? index.stockByCode.get(c) : undefined;
  if (stockByCode) return { kind: "stock", id: stockByCode.code, label: stockByCode.name, matchedOn: "code" };
  const stockByIsin = (i && index.stockByIsin.get(i)) || (c && index.stockByIsin.get(c)) || undefined;
  if (stockByIsin) return { kind: "stock", id: stockByIsin.code, label: stockByIsin.name, matchedOn: "isin" };

  // Obligations cotées : par ISIN puis par symbole BRVM.
  const listedByIsin = (i && index.listedByIsin.get(i)) || (c && index.listedByIsin.get(c)) || undefined;
  if (listedByIsin) return { kind: "listed-bond", id: listedByIsin.isin, label: listedByIsin.name, matchedOn: "isin" };
  const listedByCode = c ? index.listedByCode.get(c) : undefined;
  if (listedByCode) return { kind: "listed-bond", id: listedByCode.isin, label: listedByCode.name, matchedOn: "code" };

  // Souverains UMOA : par ISIN.
  const sov = (i && index.sovByIsin.get(i)) || (c && index.sovByIsin.get(c)) || undefined;
  if (sov) return { kind: "sovereign", id: sov.isin, label: sov.label, matchedOn: "isin" };

  return null;
}

// Convertit une date (JJ/MM/AAAA ou ISO) en AAAA-MM-JJ pour les champs date.
function toISODate(s: string): string {
  const t = (s ?? "").trim();
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return "";
}

const COUNTRY_NAME: Record<string, string> = {
  CI: "Côte d'Ivoire",
  BJ: "Bénin",
  BF: "Burkina Faso",
  ML: "Mali",
  NE: "Niger",
  SN: "Sénégal",
  TG: "Togo",
  GW: "Guinée-Bissau",
  GB: "Guinée-Bissau",
};
function paysName(c: string): string {
  return COUNTRY_NAME[(c ?? "").trim().toUpperCase()] ?? (c ?? "");
}

// Les loaders stockent les taux en décimal (0.0575). Le formulaire attend un
// pourcentage (5,75). Conversion avec arrondi pour éviter le bruit flottant.
function decToPct(x: number): string {
  return String(Math.round(x * 10000) / 100);
}

// Paramètres « d'origine » d'un titre reconnu du référentiel du site, mappés sur
// les clés du schéma de titre personnalisé. Sert à pré-remplir / rétablir le
// formulaire de modification d'un titre coté.
export function siteSecurityAttributes(
  source: string,
  refId: string,
): Record<string, string> | null {
  const id = normCode(refId);

  if (source === "stock") {
    const s = loadStocks().find((x) => normCode(x.code) === id || normCode(x.isin) === id);
    if (!s) return null;
    return {
      cote: "cote",
      pays: paysName(s.country),
      isin: s.isin && s.isin !== "0" ? s.isin : "",
    };
  }

  if (source === "listed-bond") {
    const b = loadListedBonds().find((x) => normCode(x.isin) === id || normCode(x.code) === id);
    if (!b) return null;
    return {
      cote: "cote",
      isin: b.isin,
      issuer: b.issuer,
      issuerType: b.issuerType,
      country: paysName(b.country),
      sector: b.sector,
      couponRate: b.couponRate != null ? decToPct(b.couponRate) : "",
      couponFrequency: String(b.couponFrequency),
      issueDate: toISODate(b.issueDate),
      maturityDate: toISODate(b.maturityDate),
      firstAmortizationDate: toISODate(b.firstAmortizationDate),
      nominalValue: b.nominalValue != null ? String(b.nominalValue) : "",
      totalIssued: b.totalIssued != null ? String(b.totalIssued) : "",
      outstanding: b.outstanding != null ? String(b.outstanding) : "",
      amortizationType: b.amortizationType,
      amortizationMode: b.amortizationMode,
      rating: b.rating,
      ratingAgency: b.ratingAgency,
      callable: b.callable ? "oui" : "non",
      callDate: toISODate(b.callDate),
      greenBond: b.greenBond ? "oui" : "non",
    };
  }

  if (source === "sovereign") {
    const sov = aggregateSovereignBonds(loadUmoaEmissions()).find(
      (x) => normCode(x.isin) === id || normCode(x.id) === id,
    );
    if (!sov) return null;
    const amort =
      sov.amortizationType === "In Fine" ? "IF" : sov.amortizationType === "Linéaire" ? "AC" : "";
    const pays = sov.countryName || paysName(sov.country);
    // Montants UMOA-Titres exprimés en millions de FCFA -> valeur absolue.
    const toAbs = (m: number) => (m ? String(Math.round(m * 1_000_000)) : "");
    return {
      cote: "noncote",
      isin: sov.isin,
      issuer: pays ? `État de ${pays}` : "",
      issuerType: "Obligation d'Etat",
      country: pays,
      sector: "Etat",
      couponRate: sov.couponRate != null ? decToPct(sov.couponRate) : "",
      couponFrequency: sov.type === "OAT" ? "1" : "",
      issueDate: toISODate(sov.firstIssueDate),
      maturityDate: toISODate(sov.maturityDate),
      nominalValue: sov.nominalValue != null ? String(sov.nominalValue) : "",
      totalIssued: toAbs(sov.totalAmount),
      outstanding: toAbs(sov.outstandingEstimate),
      differe: sov.graceYears ? String(sov.graceYears) : "",
      amortizationType: amort,
      callable: "non",
      greenBond: "non",
    };
  }

  return null;
}

// Matche toutes les lignes d'un inventaire.
export function matchPositions(
  rows: RawPosition[],
  customSecurities: CustomSecurity[],
): ImportedPosition[] {
  const index = buildSiteIndex();
  const customByCode = new Map<string, CustomSecurity>();
  // Index secondaire par NOM normalisé (et par code normalisé « nom ») : les
  // titres du référentiel (surtout OPCVM) peuvent avoir un code différent du
  // libellé de l'inventaire — on les reconnaît alors par leur nom.
  const customByName = new Map<string, CustomSecurity>();
  for (const c of customSecurities) {
    customByCode.set(normCode(c.code), c);
    for (const key of [normName(c.name), normName(c.code)]) {
      if (key.length >= 4 && !customByName.has(key)) customByName.set(key, c);
    }
  }

  return rows.map((raw) => {
    const code = normCode(raw.rawCode);

    // 1. Reconnaissance PAR CONTENU (indépendante de l'en-tête de section, qui
    //    n'est pas toujours présent dans le fichier). Le type est déduit du
    //    code/ISIN lui-même — déterministe pour actions et obligations.
    const stock = index.stockByCode.get(code) ?? index.stockByIsin.get(code);
    if (stock) return resolve(raw, "action", "stock", stock.code, stock.name);

    const listed = index.listedByIsin.get(code) ?? index.listedByCode.get(code);
    if (listed) return resolve(raw, "obligation", "listed-bond", listed.isin, listed.name);

    const sov = index.sovByIsin.get(code);
    if (sov) return resolve(raw, "obligation", "sovereign", sov.isin, sov.label);

    // 2. OPCVM par nom : uniquement si l'en-tête l'indique explicitement
    //    (évite les faux positifs quand le type n'est pas fourni).
    if (raw.section === "opcvm") {
      const fund = findFund(index, raw.rawLabel, raw.rawCode);
      if (fund) return resolve(raw, "opcvm", "fund", fund.id, fund.nom);
    }

    // 3. Titre personnalisé du référentiel utilisateur — AVANT la détection
    //    DAT/trésorerie, sinon un compte déjà enregistré en titre (mêmes
    //    caractéristiques structurelles qu'une ligne de trésorerie) serait
    //    classé « cash » et jamais reconnu. Match par code, puis par nom.
    const custom =
      customByCode.get(code) ??
      customByName.get(normName(raw.rawCode)) ??
      customByName.get(normName(raw.rawLabel));
    if (custom) {
      // Section : priorité au type du site (titre lié), puis au kind stocké s'il
      // est spécifique, sinon à la section de la ligne d'inventaire (ex. un titre
      // « autre » figurant dans la section Obligation du fichier).
      const section =
        sectionFromSource(custom.attributes?.source) ??
        (custom.kind !== "autre" ? custom.kind : raw.section);
      return resolve(raw, section, "custom", custom.id, custom.name, custom.id);
    }

    // 4. Instruments sans quantité ni cours (dépôts, espèces, comptes).
    const noQty = raw.quantity == null;
    const noPrice = raw.price == null;
    const nz = (n: number | null) => n != null && n !== 0;

    // 4a. DAT (dépôt à terme) : seulement prix de revient + intérêt couru +
    //     valorisation, tous non nuls. L'intérêt couru le distingue des espèces.
    if (noQty && noPrice && nz(raw.cost) && nz(raw.accruedInterest) && nz(raw.valuation)) {
      return resolve(raw, "dat", "dat", "", raw.rawLabel);
    }

    // 4b. Trésorerie / espèces : en-tête « Banque » OU ni quantité ni cours,
    //     mais une valorisation (intérêt couru nul ou absent).
    const looksCash =
      raw.section === "tresorerie" || (noQty && noPrice && raw.valuation != null);
    if (looksCash) return resolve(raw, "tresorerie", "cash", "", "");

    // 5. Non reconnu : on conserve l'indice de section du fichier s'il existe,
    //    sinon "autre". L'utilisateur pourra créer ou lier le titre.
    const fallback: PortfolioSection = raw.section !== "autre" ? raw.section : "autre";
    return resolve(raw, fallback, "unmatched", "", "");
  });
}

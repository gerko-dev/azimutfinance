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
import { lireAlias, SOURCES_LIEES } from "./portfolio-security-schema";

// Normalise un code/symbole pour comparaison : trim + majuscules, espaces
// internes retirés (les codes du site n'en contiennent pas).
function normCode(s: string): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Code débarrassé de toute ponctuation : « TPCI.O80 » → « TPCIO80 ». */
function normLoose(s: string): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Identifiants plausibles contenus dans un LIBELLÉ, quand le fichier ne porte
 * pas de colonne code.
 *
 * Nos propres inventaires nomment les souverains par leur ISIN
 * (« OAT ML0000004092 (08.01.026) ») et les obligations cotées par leur code
 * (« TPCI.O80 6% 2023-2030 »). Ne chercher que le nom exact laisserait ces
 * lignes non rapprochées alors que l'identifiant est là, dans le texte.
 *
 * Les chiffres doivent SUIVRE les lettres sans espace : « MALI 6,50% » est un
 * émetteur suivi d'un taux, pas un code. Sans cette contrainte, un libellé sur
 * deux produirait un faux identifiant.
 */
function identifiantsDuLibelle(label: string): string[] {
  const up = (label ?? "").toUpperCase();
  const out: string[] = [];
  // ISIN régional : deux lettres de pays puis dix chiffres.
  for (const m of up.matchAll(/\b([A-Z]{2}[0-9]{10})\b/g)) out.push(m[1]);
  // Codes BRVM : « TPCI.O80 », « TPCIO76 », « ORGT.O2 ».
  for (const m of up.matchAll(/\b([A-Z]{2,6}\.?O?\.?[0-9]{1,3})\b/g)) {
    const t = normLoose(m[1]);
    if (t.length >= 4) out.push(t);
  }
  return [...new Set(out)];
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

/**
 * Un dépôt à terme se nomme-t-il comme tel ?
 *
 * Seul signal fiable quand l'intérêt couru est nul — le lendemain d'une
 * reconduction, un DAT est structurellement indiscernable d'un compte
 * d'espèces : ni quantité, ni cours, un prix de revient égal à la
 * valorisation. Les gérants de la place écrivent « DAT … » ou « dépôt à
 * terme ».
 *
 * Bornes de mot obligatoires : sans elles, « MANDAT » ou « VALIDATION »
 * basculeraient en dépôt à terme.
 */
export function ressembleADAT(code: string, label: string): boolean {
  const t = `${code} ${label}`
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toUpperCase();
  return /(^|[^A-Z])DAT([^A-Z]|$)/.test(t) || t.includes("DEPOT A TERME");
}

/**
 * Valorisation d'un dépôt à terme : nominal PLUS intérêt couru.
 *
 * Les dépositaires de la place ne servent pas la même convention. La plupart
 * livrent une valorisation qui inclut déjà le couru — on la respecte alors
 * telle quelle. Certains livrent le seul nominal, l'intérêt couru étant porté
 * dans sa propre colonne : le dépôt ressort alors sous-valorisé de tout son
 * coupon, et la poche « Dépôts à terme » avec lui.
 *
 * On ne corrige donc QUE le cas démontrable : un couru non nul, et une
 * valorisation qui vaut le prix de revient — donc qui ne l'a pas intégré.
 * Ailleurs on ne touche à rien : additionner par principe doublerait le coupon
 * chez tous les dépositaires qui font correctement leur travail.
 */
function avecCouru(raw: RawPosition): RawPosition {
  const couru = raw.accruedInterest;
  const cout = raw.cost;
  const val = raw.valuation;
  if (couru == null || couru === 0 || cout == null || val == null) return raw;
  // Tolérance à l'arrondi du dépositaire : un écart d'un franc n'est pas un
  // coupon.
  if (Math.abs(val - cout) > 1) return raw;
  return { ...raw, valuation: cout + couru };
}

// Référentiel indexé, construit une fois par import.
type EntreeAction = { code: string; name: string; isin: string };
type EntreeObligation = { isin: string; name: string; code: string };

type SiteIndex = {
  stockByCode: Map<string, EntreeAction>;
  stockByIsin: Map<string, EntreeAction>;
  listedByIsin: Map<string, EntreeObligation>;
  listedByCode: Map<string, EntreeObligation>;
  sovByIsin: Map<string, { isin: string; label: string }>;
  /** Nom EXACT normalisé → titre. Troisième identifiant, après le code et
   *  l'ISIN : un inventaire qui ne porte que le libellé officiel doit être
   *  reconnu. Correspondance exacte uniquement — une recherche par inclusion
   *  confondrait « BOA CI » et « BOA MALI ». */
  stockByName: Map<string, EntreeAction>;
  listedByName: Map<string, EntreeObligation>;
  funds: Array<{ id: string; norm: string; nom: string }>;
};

function buildSiteIndex(): SiteIndex {
  const idx: SiteIndex = {
    stockByCode: new Map(),
    stockByIsin: new Map(),
    listedByIsin: new Map(),
    listedByCode: new Map(),
    sovByIsin: new Map(),
    stockByName: new Map(),
    listedByName: new Map(),
    funds: [],
  };

  for (const s of loadStocks()) {
    const entry = {
      code: s.code.trim(),
      name: s.name.trim(),
      isin: s.isin && s.isin !== "0" ? s.isin.trim() : "",
    };
    if (s.code) idx.stockByCode.set(normCode(s.code), entry);
    if (s.isin && s.isin !== "0") idx.stockByIsin.set(normCode(s.isin), entry);
    // Le premier inscrit gagne : deux titres de même nom normalisé seraient
    // indiscernables, autant ne pas trancher au hasard à chaque import.
    const n = normName(entry.name);
    if (n.length >= 4 && !idx.stockByName.has(n)) idx.stockByName.set(n, entry);
  }

  for (const b of loadListedBonds()) {
    const entry = { isin: b.isin, name: b.name, code: (b.code ?? "").trim() };
    if (b.isin) idx.listedByIsin.set(normCode(b.isin), entry);
    if (b.code) {
      idx.listedByCode.set(normCode(b.code), entry);
      // « TPCI.O80 » et « TPCIO80 » désignent le même titre selon qui édite le
      // fichier. On indexe donc aussi la forme sans ponctuation.
      const loose = normLoose(b.code);
      if (loose.length >= 4 && !idx.listedByCode.has(loose)) {
        idx.listedByCode.set(loose, entry);
      }
    }
    const n = normName(b.name ?? "");
    if (n.length >= 4 && !idx.listedByName.has(n)) idx.listedByName.set(n, entry);
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
  /** Symbole et ISIN du titre reconnu, hérités par la ligne d'inventaire. */
  ident: { code?: string; isin?: string } = {},
): ImportedPosition {
  const code = (ident.code ?? "").trim();
  const isin = (ident.isin ?? "").trim();
  return {
    ...raw,
    section,
    // Le fichier fait foi quand il porte un symbole ; sinon la ligne prend
    // celui du référentiel. C'est tout l'objet du rapprochement par nom : un
    // inventaire sans colonne symbole doit ressortir identifié.
    rawCode: raw.rawCode?.trim() ? raw.rawCode : code,
    matchKind: kind,
    matchId: id,
    matchLabel: label,
    matchHref: hrefForMatch(kind, id),
    customSecurityId: customId,
    matchCode: code,
    matchIsin: isin,
  };
}

/**
 * Nom officiel, symbole et ISIN d'une référence du site, par sa nature et son
 * identifiant.
 *
 * Sert à la RELECTURE d'un inventaire enregistré : le libellé du titre reconnu
 * n'est stocké nulle part, et sans cette résolution l'écran retombe sur le
 * libellé brut du fichier. On le recalcule plutôt que de le figer en base :
 * un titre renommé au référentiel doit voir son nouveau nom partout, y compris
 * sur les inventaires déjà enregistrés.
 */
export function referenceDuSite(
  kind: MatchKind,
  id: string,
): { name: string; code: string; isin: string } | null {
  const c = normCode(id);
  if (!c) return null;
  const index = buildSiteIndex();

  if (kind === "stock") {
    const s = index.stockByCode.get(c) ?? index.stockByIsin.get(c);
    return s ? { name: s.name, code: s.code, isin: s.isin } : null;
  }
  if (kind === "listed-bond") {
    const b = index.listedByIsin.get(c) ?? index.listedByCode.get(c);
    return b ? { name: b.name, code: b.code, isin: b.isin } : null;
  }
  if (kind === "sovereign") {
    const sov = index.sovByIsin.get(c);
    return sov ? { name: sov.label, code: sov.isin, isin: sov.isin } : null;
  }
  if (kind === "fund") {
    const f = index.funds.find((x) => x.id === id);
    return f ? { name: f.nom, code: "", isin: "" } : null;
  }
  return null;
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
  if (stockByCode) {
    return {
      kind: "stock",
      id: stockByCode.code,
      label: stockByCode.name,
      matchedOn: "code",
      code: stockByCode.code,
      isin: stockByCode.isin,
    };
  }
  const stockByIsin = (i && index.stockByIsin.get(i)) || (c && index.stockByIsin.get(c)) || undefined;
  if (stockByIsin) {
    return {
      kind: "stock",
      id: stockByIsin.code,
      label: stockByIsin.name,
      matchedOn: "isin",
      code: stockByIsin.code,
      isin: stockByIsin.isin,
    };
  }

  // Obligations cotées : par ISIN puis par symbole BRVM.
  const listedByIsin = (i && index.listedByIsin.get(i)) || (c && index.listedByIsin.get(c)) || undefined;
  if (listedByIsin) {
    return {
      kind: "listed-bond",
      id: listedByIsin.isin,
      label: listedByIsin.name,
      matchedOn: "isin",
      code: listedByIsin.code,
      isin: listedByIsin.isin,
    };
  }
  const listedByCode = c ? index.listedByCode.get(c) : undefined;
  if (listedByCode) {
    return {
      kind: "listed-bond",
      id: listedByCode.isin,
      label: listedByCode.name,
      matchedOn: "code",
      code: listedByCode.code,
      isin: listedByCode.isin,
    };
  }

  // Souverains UMOA : par ISIN. Ces titres n'ont pas de symbole — leur seul
  // identifiant est l'ISIN, et c'est donc légitimement lui qui s'affiche.
  const sov = (i && index.sovByIsin.get(i)) || (c && index.sovByIsin.get(c)) || undefined;
  if (sov) {
    return {
      kind: "sovereign",
      id: sov.isin,
      label: sov.label,
      matchedOn: "isin",
      code: sov.isin,
      isin: sov.isin,
    };
  }

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
      // Les titres publics UMOA-Titres amortissent TOUJOURS SUR NOMINAL : le
      // nominal par titre décroît à chaque tombée et le cours suit. Le mode
      // « sur titre » (tirage au sort, face constante à 10 000) n'existe pas
      // sur ce compartiment.
      //
      // Ce champ n'était pas renseigné, et son absence n'est pas anodine : la
      // variation d'un titre amortissable se calcule en pourcentage du nominal
      // en vigueur. Sans le mode, le rapport brut des cours affiche une chute
      // de 33 % là où l'émetteur a simplement remboursé un tiers du capital.
      amortizationMode: "N",
      callable: "non",
      greenBond: "non",
    };
  }

  // OPCVM du référentiel du site. Cette branche manquait : un FCP correctement
  // lié (source "fund") retombait sur le `return null` final, et se présentait
  // comme une référence introuvable alors que le lien était bon. La
  // resynchronisation du référentiel le signalait comme un lien cassé.
  if (source === "fund") {
    const f = loadFunds().find(
      (x) => normCode(x.id) === id || normName(x.nom) === normName(refId),
    );
    if (!f) return null;
    return {
      gestionnaire: f.gestionnaire,
      // La catégorie porte la ventilation par classe d'actif : c'est le champ
      // que l'allocation consomme pour un OPCVM.
      categorie: f.categorie,
      isin: "",
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
  // Un titre du référentiel doit être reconnu par ses TROIS identifiants :
  // code / symbole, ISIN, et nom exact. L'ISIN manquait à cet index, si bien
  // qu'une ligne d'inventaire désignée par son ISIN restait non reconnue dès
  // que le titre portait un code différent — le cas courant pour une
  // obligation, dont le mnémonique BRVM et l'ISIN ne coïncident jamais.
  const customByCode = new Map<string, CustomSecurity>();
  // Index secondaire par NOM normalisé (et par code normalisé « nom ») : les
  // titres du référentiel (surtout OPCVM) peuvent avoir un code différent du
  // libellé de l'inventaire — on les reconnaît alors par leur nom.
  const customByName = new Map<string, CustomSecurity>();
  for (const c of customSecurities) {
    customByCode.set(normCode(c.code), c);
    // L'ISIN ne se substitue pas au code : il s'ajoute. Un titre reste
    // atteignable par l'un ou par l'autre.
    const isin = normCode(c.isin ?? "");
    if (isin && !customByCode.has(isin)) customByCode.set(isin, c);
    // L'ISIN porté dans les attributs sert de repli : certains titres l'y ont
    // sans que la colonne dédiée soit remplie.
    const isinAttr = normCode(c.attributes?.isin ?? "");
    if (isinAttr && !customByCode.has(isinAttr)) customByCode.set(isinAttr, c);
    // Nom, code, ET tous les libellés sous lesquels ce titre a déjà été
    // rapproché. Sans les alias, un export qui nomme le titre autrement
    // ressort « non reconnu » alors que le gérant l'a déjà rattaché.
    for (const key of [normName(c.name), normName(c.code), ...lireAlias(c.attributes)]) {
      if (key.length >= 4 && !customByName.has(key)) customByName.set(key, c);
    }
  }

  return rows.map((raw) => {
    const code = normCode(raw.rawCode);

    const nomLigne = normName(raw.rawLabel);
    const nomCode = normName(raw.rawCode);

    // Codes à essayer. Quand le fichier ne porte PAS de colonne symbole — cas
    // de nos propres inventaires — on retombe sur les identifiants écrits dans
    // le libellé. On ne le fait qu'à défaut de code : un fichier qui en fournit
    // un fait autorité, et aller pêcher dans le texte ne pourrait que le
    // contredire.
    const codes = code ? [code] : identifiantsDuLibelle(raw.rawLabel);
    const premier = <T>(f: (c: string) => T | undefined): T | undefined => {
      for (const c of codes) {
        const r = f(c);
        if (r) return r;
      }
      return undefined;
    };

    // ── 1. LE RÉFÉRENTIEL TITRES D'ABORD ────────────────────────────────────
    //
    // L'inventaire vient de NOTRE système, pas d'un dépositaire : l'autorité
    // est le référentiel du compte, et la clé est le NOM EXACT. Quand il
    // correspond, la ligne hérite du symbole et de l'ISIN du référentiel —
    // c'est ce qui rend importable un fichier sans colonne symbole.
    //
    // Ce bloc passe AVANT le référentiel de marché : si le gérant a arrêté
    // qu'un nom désigne tel titre, aucune reconnaissance automatique ne doit
    // le contredire. Il passe aussi avant la détection DAT / trésorerie, sinon
    // un compte déjà enregistré en titre — mêmes caractéristiques
    // structurelles qu'une ligne de trésorerie — serait classé « cash » et
    // jamais reconnu.
    const custom =
      customByName.get(nomLigne) ??
      customByName.get(nomCode) ??
      premier((c) => customByCode.get(c));
    if (custom) {
      // Section : priorité au type du site (titre lié), puis au kind stocké s'il
      // est spécifique, sinon à la section de la ligne d'inventaire (ex. un titre
      // « autre » figurant dans la section Obligation du fichier).
      const section =
        sectionFromSource(custom.attributes?.source) ??
        (custom.kind !== "autre" ? custom.kind : raw.section);

      // NATURE affichée : un titre du référentiel LIÉ au site est une action
      // cotée, une obligation cotée ou un souverain — pas un « titre
      // personnalisé ». Le badge doit dire ce que la ligne EST, pas par quel
      // chemin elle a été reconnue ; sinon SONATEL, rapproché via le
      // référentiel, s'affiche comme une valeur maison et perd son lien vers
      // la fiche du site.
      //
      // Le rattachement au référentiel est conservé dans tous les cas
      // (`custom.id` en dernier argument) : c'est lui qui porte les attributs
      // saisis par le gérant.
      const source = custom.attributes?.source ?? "";
      const refId = custom.attributes?.refId ?? "";
      const nature: MatchKind =
        SOURCES_LIEES.has(source) && refId ? (source as MatchKind) : "custom";

      return resolve(
        raw,
        section,
        nature,
        nature === "custom" ? custom.id : refId,
        custom.name,
        custom.id,
        { code: custom.code, isin: custom.isin || custom.attributes?.isin },
      );
    }

    // ── 2. Référentiel de MARCHÉ, en appoint ────────────────────────────────
    //
    // Rien dans le référentiel du compte : on tente le site, qui reconnaît la
    // cote BRVM et les souverains UMOA sans qu'aucune saisie soit nécessaire.
    // Trois identifiants, par fiabilité décroissante : code / symbole, ISIN,
    // puis nom exact — deux titres peuvent partager un nom proche, jamais un
    // code ou un ISIN.
    const stock =
      premier((c) => index.stockByCode.get(c)) ??
      premier((c) => index.stockByIsin.get(c)) ??
      index.stockByName.get(nomLigne) ??
      index.stockByName.get(nomCode);
    if (stock) {
      return resolve(raw, "action", "stock", stock.code, stock.name, null, {
        code: stock.code,
        isin: stock.isin,
      });
    }

    const listed =
      premier((c) => index.listedByIsin.get(c)) ??
      premier((c) => index.listedByCode.get(c)) ??
      index.listedByName.get(nomLigne) ??
      index.listedByName.get(nomCode);
    if (listed) {
      return resolve(raw, "obligation", "listed-bond", listed.isin, listed.name, null, {
        code: listed.code,
        isin: listed.isin,
      });
    }

    const sov = premier((c) => index.sovByIsin.get(c));
    if (sov) {
      // Un souverain UMOA n'a pas de symbole : son identifiant EST l'ISIN.
      return resolve(raw, "obligation", "sovereign", sov.isin, sov.label, null, {
        code: sov.isin,
        isin: sov.isin,
      });
    }

    // OPCVM par nom : uniquement si l'en-tête l'indique explicitement (évite
    // les faux positifs quand le type n'est pas fourni).
    if (raw.section === "opcvm") {
      const fund = findFund(index, raw.rawLabel, raw.rawCode);
      if (fund) return resolve(raw, "opcvm", "fund", fund.id, fund.nom);
    }

    // 4. Instruments sans quantité ni cours (dépôts, espèces, comptes).
    const noQty = raw.quantity == null;
    const noPrice = raw.price == null;
    const nz = (n: number | null) => n != null && n !== 0;

    // 4a. DAT (dépôt à terme). Deux signatures, parce qu'aucune ne suffit
    //     seule :
    //
    //     - l'intérêt couru, qui distingue un dépôt d'un compte d'espèces ;
    //     - le LIBELLÉ, indispensable juste après une reconduction. Le dépôt
    //       repart alors d'un couru nul et se confondait avec de la trésorerie
    //       — or un DAT est reconduit régulièrement par construction, donc ce
    //       cas n'a rien d'exceptionnel : c'est la moitié de la vie du titre.
    //
    //     Le prix de revient ne discrimine PAS : les comptes d'espèces en
    //     portent un, égal a leur valorisation.
    if (
      noQty &&
      noPrice &&
      raw.valuation != null &&
      ((nz(raw.cost) && nz(raw.accruedInterest)) ||
        ressembleADAT(raw.rawCode, raw.rawLabel))
    ) {
      return resolve(avecCouru(raw), "dat", "dat", "", raw.rawLabel);
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

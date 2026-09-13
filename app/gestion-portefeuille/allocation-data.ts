import "server-only";

// === Allocation validée — lectures et calculs ===
//
// Ce fichier ne fait que lire. La chaîne est celle de la feuille
// « Allocations validées » du fichier de suivi NFD :
//
//   inventaire précédent  →  inventaire courant  →  cible du comité
//        (C, D)                    (E, F)               (G)
//                                     ↓
//                    valeur cible (J) = G × assiette
//                    montant à réaliser (K) = J − E
//                    TRO (H) = (E − C) / (J − C)
//
// L'UNIVERS D'UN AXE VIENT DU RÉFÉRENTIEL DE MARCHÉ, pas du portefeuille.
// Toutes les actions cotées figurent sur l'axe « par titre », détenues ou non :
// c'est ainsi qu'on décide d'entrer sur une valeur.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadListedBonds, loadStocks, loadUmoaEmissions } from "@/lib/dataLoader";

import { loadCustomSecurities, loadFundPortfolios } from "./portfolio-data";
import type {
  CustomSecurity,
  PortfolioSection,
  PortfolioSnapshot,
  SavedPosition,
} from "./portfolio-types";
import {
  AUTRES_EMETTEURS,
  CLASSE_DE_L_AXE,
  controlerGroupes,
  EMETTEUR_PRIVE,
  ETATS_UEMOA,
  LIBELLE_CLASSE,
  ORDRE_CLASSES,
  TRANCHES_MATURITE,
  type AxeAllocation,
  type CibleAllocation,
  type LigneAllocation,
  type LigneNonRapprochee,
  type TableauAllocation,
} from "./allocation-types";

const num = (v: unknown, d = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  return d;
};

const NON_RAPPROCHE = "__non_rapproche__";

// ── Référentiel de marché, mémoïsé au niveau du module ────────────────────
//
// PERFORMANCE — on n'appelle PAS loadAllActions() ici. Contrairement aux
// autres loaders du portail, il n'est pas mémoïsé : il refait pour les
// 47 valeurs la recherche de la dernière cotation Sika et le recalcul des
// ratios à CHAQUE appel, soit ~200 ms. La page étant en force-dynamic et
// l'appelant plusieurs fois par rendu, l'allocation coûtait près d'une
// seconde de calcul inutile par requête.
//
// Tout ce dont cet axe a besoin — code, nom, secteur — est statique et vient
// de loadStocks(), lui mémoïsé. Les cours ne servent qu'à convertir un montant
// en nombre de titres, et se prennent alors ligne à ligne.
//
// Le cache suit la convention du portail : un CSV parsé une fois par process.

type Poste = { cle: string; libelle: string; detail: string | null };

type Referentiel = {
  secteurParCode: Map<string, string>;
  /** Symbole OU ISIN → symbole canonique de l'action. */
  codeActionParId: Map<string, string>;
  obligationParId: Map<
    string,
    { issuer: string; maturityDate: string; poste: string }
  >;
  souverainParIsin: Map<string, { emetteur: string; echeance: string }>;
  universParAxe: Map<AxeAllocation, Poste[]>;
};

let _refsCache: Referentiel | null = null;

/** Retrouve l'État de l'Union nommé dans un libellé d'émetteur.
 *
 *  « Etat du Burkina Faso » → « Burkina Faso ». La comparaison ignore accents,
 *  casse et traits d'union : le référentiel obligataire écrit
 *  « Guinée-Bissau » là où les adjudications UMOA écrivent « Guinée Bissau ».
 */
function etatDepuisLibelle(libelle: string): string | null {
  const normaliser = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[-']/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const cible = normaliser(libelle);
  return ETATS_UEMOA.find((e) => cible.includes(normaliser(e))) ?? null;
}

function referentiel(): Referentiel {
  if (_refsCache) return _refsCache;

  const secteurParCode = new Map<string, string>();
  const titres: Poste[] = [];
  const compteSecteur = new Map<string, number>();

  // Symbole canonique d'une action, atteignable par son symbole OU son ISIN.
  //
  // Sans l'entrée ISIN, une action liée au site dont le référentiel porte
  // l'ISIN ne trouvait aucun secteur : `posteDe` interroge en priorité par
  // l'ISIN, absent de l'index. L'axe « par secteur » la rangeait alors dans
  // les lignes non rapprochées, alors qu'elle est parfaitement identifiée.
  // Les obligations ne souffraient pas du défaut : elles sont indexées sur
  // les deux identifiants depuis l'origine.
  const codeActionParId = new Map<string, string>();

  for (const s of loadStocks()) {
    const code = (s.code || "").trim().toUpperCase();
    if (!code) continue;
    const secteur = (s.sector || "Non classé").trim();
    secteurParCode.set(code, secteur);
    codeActionParId.set(code, code);
    const isin = (s.isin || "").trim().toUpperCase();
    if (isin && isin !== "0") codeActionParId.set(isin, code);
    titres.push({ cle: code, libelle: (s.name || code).trim(), detail: secteur });
    compteSecteur.set(secteur, (compteSecteur.get(secteur) ?? 0) + 1);
  }
  titres.sort((a, b) => a.cle.localeCompare(b.cle));

  const secteurs: Poste[] = [...compteSecteur.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "fr"))
    .map(([s, n]) => ({ cle: s, libelle: s, detail: `${n} valeur(s) cotée(s)` }));

  // Rattachement d'une obligation cotée à son poste d'émetteur. Le référentiel
  // distingue quatre natures — « Obligation d'Etat », « Sukuk Etat »,
  // « Obligation privée », « Obligation régionale » — ce qui évite de deviner.
  const obligationParId = new Map<
    string,
    { issuer: string; maturityDate: string; poste: string }
  >();
  for (const b of loadListedBonds()) {
    const issuer = (b.issuer || "").trim();
    const type = (b.issuerType || "").trim();
    let poste: string;
    if (/privée|privee/i.test(type)) {
      poste = EMETTEUR_PRIVE;
    } else if (/etat|état/i.test(type)) {
      // « Etat du Mali » → « Mali ». Un État hors Union retombe sur le
      // reliquat plutôt que de créer un poste hors univers.
      poste = etatDepuisLibelle(issuer) ?? AUTRES_EMETTEURS;
    } else {
      // Institutions régionales : ni souverain de l'Union, ni privé.
      poste = AUTRES_EMETTEURS;
    }
    const v = { issuer, maturityDate: b.maturityDate, poste };
    if (b.isin) obligationParId.set(b.isin.toUpperCase(), v);
    if (b.code) obligationParId.set(b.code.toUpperCase(), v);
  }

  // Souverains UMOA-Titres : l'ISIN mène à l'État émetteur et à l'échéance.
  const souverainParIsin = new Map<string, { emetteur: string; echeance: string }>();
  const compteEtat = new Map<string, number>();
  for (const e of loadUmoaEmissions()) {
    if (!e.countryName) continue;
    const etat = (ETATS_UEMOA as readonly string[]).includes(e.countryName)
      ? e.countryName
      : AUTRES_EMETTEURS;
    compteEtat.set(etat, (compteEtat.get(etat) ?? 0) + 1);
    if (!e.isin || e.isin === "--") continue;
    souverainParIsin.set(e.isin.toUpperCase(), {
      emetteur: etat,
      echeance: e.maturityDate,
    });
  }

  // Univers des émetteurs : les huit États de l'Union, et rien d'autre. Tout
  // le reste — entreprises, institutions régionales, États hors Union — se
  // regroupe sous « Autres États ». L'axe mesure l'exposition souveraine par
  // signature, pas l'inventaire des émetteurs de la cote.
  // Pas de compteur d'adjudications ici : il décrit le référentiel de marché,
  // pas le portefeuille. Sur une ligne d'allocation, il fait croire à une
  // information de position alors qu'il n'en est pas une.
  const emetteurs: Poste[] = [
    ...ETATS_UEMOA.map((etat) => ({
      cle: etat,
      libelle: etat,
      detail: null,
    })),
    {
      cle: EMETTEUR_PRIVE,
      libelle: EMETTEUR_PRIVE,
      detail: "entreprises et établissements de crédit",
    },
    {
      cle: AUTRES_EMETTEURS,
      libelle: AUTRES_EMETTEURS,
      detail: "institutions régionales et États hors Union",
    },
  ];

  const universParAxe = new Map<AxeAllocation, Poste[]>([
    ["classe", ORDRE_CLASSES.map((c) => ({ cle: c, libelle: LIBELLE_CLASSE[c], detail: null }))],
    ["action_secteur", secteurs],
    ["action_titre", titres],
    ["obligation_emetteur", emetteurs],
    [
      "obligation_maturite",
      TRANCHES_MATURITE.map((t) => ({ cle: t.cle, libelle: t.libelle, detail: null })),
    ],
  ]);

  _refsCache = {
    secteurParCode,
    codeActionParId,
    obligationParId,
    souverainParIsin,
    universParAxe,
  };
  return _refsCache;
}

export function universDeLAxe(axe: AxeAllocation): Poste[] {
  return referentiel().universParAxe.get(axe) ?? [];
}

// ── Rattachement d'une position à un poste de l'axe ───────────────────────

/** Identifiant de marché d'une position : code titre ou ISIN. */
function identifiant(p: SavedPosition): string {
  return (p.matchId || p.rawCode || "").trim().toUpperCase();
}

function anneesRestantes(echeance: string, dateRef: string): number | null {
  if (!echeance || !dateRef) return null;
  const ms = new Date(echeance).getTime() - new Date(dateRef).getTime();
  if (!Number.isFinite(ms)) return null;
  return ms / (365.25 * 86_400_000);
}

function trancheDe(annees: number | null): string | null {
  if (annees === null) return null;
  // Une ligne déjà échue tombe dans la tranche la plus courte : elle n'a plus
  // de maturité, mais elle est encore à l'inventaire.
  const a = Math.max(0, annees);
  const t = TRANCHES_MATURITE.find((x) => a >= x.min && a < x.max);
  return t?.cle ?? TRANCHES_MATURITE[TRANCHES_MATURITE.length - 1].cle;
}

/** Poste de l'axe auquel une position se rattache, ou null si elle n'entre pas
 *  dans le périmètre de l'axe.
 *
 *  DEUX SOURCES DE RATTACHEMENT, et il faut les deux :
 *
 *  1. Le référentiel de MARCHÉ, interrogé par code ou ISIN. Il couvre les
 *     lignes reconnues directement à l'import.
 *  2. Les attributs du TITRE PERSONNALISÉ, quand la position y est rattachée.
 *     Indispensable : le `matchId` d'une telle position est l'UUID du titre,
 *     jamais un ISIN — le chercher dans le référentiel de marché échoue par
 *     construction, et toute la ligne tombait en « non rapprochée ».
 */
function posteDe(
  p: SavedPosition,
  axe: AxeAllocation,
  dateRef: string,
  refs: {
    secteurParCode: Map<string, string>;
    codeActionParId: Map<string, string>;
    obligationParId: Map<
    string,
    { issuer: string; maturityDate: string; poste: string }
  >;
    souverainParIsin: Map<string, { emetteur: string; echeance: string }>;
  },
  customParId: Map<string, CustomSecurity>,
): string | null {
  const classe = CLASSE_DE_L_AXE[axe];
  if (classe !== null && p.section !== classe) return null;

  const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
  const attrs = custom?.attributes ?? {};

  // TOUS les identifiants disponibles, pas un seul.
  //
  // Un titre du référentiel porte à la fois un symbole et un ISIN, et les
  // index du site ne les connaissent pas toujours tous les deux. En n'en
  // retenant qu'un — l'ISIN, prioritaire — une action parfaitement identifiée
  // ressortait « non rapprochée » dès que l'index n'était bâti que sur les
  // symboles.
  const ids = [
    custom?.code,
    custom?.isin,
    attrs.isin,
    custom ? undefined : identifiant(p),
  ]
    .map((x) => (x ?? "").trim().toUpperCase())
    .filter((x) => x !== "");

  const chercher = <T>(m: Map<string, T>): T | undefined => {
    for (const i of ids) {
      const v = m.get(i);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  switch (axe) {
    case "classe":
      return p.section;

    case "action_secteur": {
      const codeAction = chercher(refs.codeActionParId);
      if (codeAction) return refs.secteurParCode.get(codeAction) ?? NON_RAPPROCHE;
      // Titre non coté saisi à la main : son secteur vient du formulaire.
      return (attrs.secteur || "").trim() || NON_RAPPROCHE;
    }

    case "action_titre":
      // La clé du poste est le SYMBOLE canonique : l'univers de l'axe est bâti
      // sur les symboles, y renvoyer un ISIN créerait une ligne fantôme.
      return chercher(refs.codeActionParId) ?? NON_RAPPROCHE;

    case "obligation_emetteur": {
      // Un titre souverain porte la signature de son État ; une obligation
      // d'entreprise relève du poste « Privé », quel que soit son pays de
      // cotation. Les confondre mélangerait risque souverain et risque
      // corporate sous un même drapeau.
      const souv = chercher(refs.souverainParIsin);
      if (souv) return souv.emetteur;
      const cote = chercher(refs.obligationParId);
      if (cote) return cote.poste;

      // Titre saisi à la main : son type d'émetteur et son pays donnent le
      // poste. C'est exactement ce que le formulaire demande de renseigner.
      const type = (attrs.issuerType || "").trim();
      if (type) {
        if (/privée|privee/i.test(type)) return EMETTEUR_PRIVE;
        if (/etat|état/i.test(type)) {
          return (
            etatDepuisLibelle(attrs.country || attrs.issuer || "") ?? AUTRES_EMETTEURS
          );
        }
        return AUTRES_EMETTEURS;
      }
      // Pas de type, mais un pays de l'Union : signature souveraine probable.
      const parPays = etatDepuisLibelle(attrs.country || attrs.issuer || "");
      if (parPays) return parPays;

      return NON_RAPPROCHE;
    }

    case "obligation_maturite": {
      const cote = chercher(refs.obligationParId);
      const echeance =
        cote?.maturityDate ??
        chercher(refs.souverainParIsin)?.echeance ??
        // Échéance saisie à la main sur le titre personnalisé.
        (attrs.maturityDate || attrs.dateEcheance || "").trim();
      if (!echeance) return NON_RAPPROCHE;
      const t = trancheDe(anneesRestantes(echeance, dateRef));
      return t ?? NON_RAPPROCHE;
    }

    default:
      return null;
  }
}

const construireRefs = referentiel;

// ── Cibles enregistrées ───────────────────────────────────────────────────

export async function chargerCibles(
  fundId: string,
  dimension: AxeAllocation,
): Promise<CibleAllocation[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("fund_allocation_targets")
    .select("*")
    .eq("fund_id", fundId)
    .eq("dimension", dimension);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    fundId: String(r.fund_id),
    dimension: r.dimension as AxeAllocation,
    bucket: String(r.bucket),
    cible: num(r.cible),
    decideLe: (r.decide_le as string) ?? null,
    note: (r.note as string) ?? null,
    updatedAt: String(r.updated_at),
  }));
}

// ── Tableau d'un axe ──────────────────────────────────────────────────────

function instruction(libelle: string, ecart: number): string {
  const pct = (Math.abs(ecart) * 100).toFixed(2).replace(".", ",");
  if (Math.abs(ecart) < 0.0001) return `Maintenir ${libelle}`;
  return ecart > 0
    ? `Renforcer ${libelle} de ${pct} %`
    : `Réduire ${libelle} de ${pct} %`;
}

/** Pourquoi cette position n'a pas pu être rattachée, en clair. */
function motifNonRapproche(
  p: SavedPosition,
  axe: AxeAllocation,
  custom: CustomSecurity | undefined,
): string {
  if (!custom) {
    if (p.matchKind === "unmatched") {
      return "Ligne non reconnue à l'import et rattachée à aucun titre du référentiel.";
    }
    return `Reconnue comme « ${p.matchKind} » mais absente du référentiel de marché : code ou ISIN introuvable dans data/.`;
  }
  const a = custom.attributes ?? {};
  if (axe === "obligation_emetteur") {
    return "Titre du référentiel sans type d'émetteur ni pays : renseigne « Type d'émetteur » ou « Pays ».";
  }
  if (axe === "obligation_maturite") {
    return "Titre du référentiel sans date d'échéance : renseigne « Date d'échéance ».";
  }
  if (axe === "action_secteur") {
    return "Titre du référentiel sans secteur : renseigne « Secteur ».";
  }
  if (axe === "action_titre") {
    return `Code « ${custom.code} » absent de la cote BRVM : l'axe par titre ne couvre que les actions cotées.`;
  }
  return `Attributs insuffisants (${Object.keys(a).length} champ(s) renseigné(s)).`;
}

function valorisations(
  snap: PortfolioSnapshot | null,
  axe: AxeAllocation,
  dateRef: string,
  refs: ReturnType<typeof construireRefs>,
  customParId: Map<string, CustomSecurity>,
  detail?: LigneNonRapprochee[],
  /** Positions par poste, pour expliquer chaque montant agrégé. */
  parPoste?: Map<string, { code: string; libelle: string; valorisation: number }[]>,
): Map<string, number> {
  const m = new Map<string, number>();
  if (!snap) return m;
  for (const p of snap.positions) {
    const v = num(p.valuation);
    if (!v) continue;
    const poste = posteDe(p, axe, dateRef, refs, customParId);
    if (poste === null) continue;
    if (parPoste) {
      const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
      const l = parPoste.get(poste) ?? [];
      l.push({
        code: (custom?.code || p.rawCode || "—").trim(),
        libelle: (custom?.name || p.matchLabel || p.rawLabel || "").trim(),
        valorisation: v,
      });
      parPoste.set(poste, l);
    }
    if (poste === NON_RAPPROCHE && detail) {
      const custom = p.customSecurityId ? customParId.get(p.customSecurityId) : undefined;
      detail.push({
        code: (custom?.code || p.rawCode || "—").trim(),
        libelle: (custom?.name || p.matchLabel || p.rawLabel || "").trim(),
        valorisation: v,
        matchKind: p.matchKind,
        motif: motifNonRapproche(p, axe, custom),
      });
    }
    m.set(poste, (m.get(poste) ?? 0) + v);
  }
  return m;
}

export async function construireTableauAllocation(
  fundId: string,
  axe: AxeAllocation = "classe",
  tresorerieAInvestir = 0,
): Promise<TableauAllocation> {
  const snapshots = [...(await loadFundPortfolios(fundId))].sort((a, b) =>
    a.asOfDate.localeCompare(b.asOfDate),
  );
  const actuel = snapshots[snapshots.length - 1] ?? null;
  const precedent = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const dateRef = actuel?.asOfDate ?? new Date().toISOString().slice(0, 10);

  const refs = construireRefs();
  const cibles = await chargerCibles(fundId, axe);
  const parBucket = new Map(cibles.map((c) => [c.bucket, c]));
  const classeParente = CLASSE_DE_L_AXE[axe];

  // Axe de niveau supérieur : les allocations par titre doivent se conformer
  // aux allocations sectorielles arrêtées par ailleurs.
  const axeGroupe: AxeAllocation | null = axe === "action_titre" ? "action_secteur" : null;
  const ciblesGroupe: Record<string, number> = {};
  if (axeGroupe) {
    for (const c of await chargerCibles(fundId, axeGroupe)) {
      ciblesGroupe[c.bucket] = c.cible;
    }
  }

  // Cible de la classe parente : elle dimensionne la poche sur les sous-axes.
  // Sans elle, une décision prise au niveau des classes ne descendrait jamais
  // jusqu'aux titres.
  let cibleClasseParente: number | null = null;
  if (classeParente !== null) {
    const c = (await chargerCibles(fundId, "classe")).find(
      (x) => x.bucket === classeParente,
    );
    cibleClasseParente = c?.cible ?? null;
  }

  const avertissements: string[] = [];
  if (!actuel) {
    avertissements.push(
      "Aucun inventaire importé pour ce fonds : l'allocation actuelle ne peut pas être calculée.",
    );
  }
  if (!precedent) {
    avertissements.push(
      "Un seul inventaire disponible : le taux de réalisation des opérations (TRO) n'est pas calculable, faute de point de départ.",
    );
  }

  // Titres personnalisés du compte : leurs attributs portent le rattachement
  // des positions que le référentiel de marché ne reconnaît pas.
  const customParId = new Map(
    (await loadCustomSecurities()).map((c) => [c.id, c]),
  );

  const nonRapprochees: LigneNonRapprochee[] = [];
  const positionsParPoste = new Map<
    string,
    { code: string; libelle: string; valorisation: number }[]
  >();
  const valActuelles = valorisations(
    actuel,
    axe,
    dateRef,
    refs,
    customParId,
    nonRapprochees,
    positionsParPoste,
  );
  nonRapprochees.sort((a, b) => b.valorisation - a.valorisation);
  for (const l of positionsParPoste.values()) {
    l.sort((a, b) => b.valorisation - a.valorisation);
  }

  // La trésorerie à investir est de la liquidité DÉTENUE qui n'est pas encore
  // à l'inventaire. Sur l'axe des classes, elle doit donc figurer sur la ligne
  // de liquidité : ne la porter que sur l'assiette cible — ce qu'on faisait —
  // gonflait les cibles sans jamais montrer d'où venait l'argent, et la somme
  // des montants à réaliser valait le montant saisi au lieu de zéro. Le plan
  // disait « achète 2 Md » sans dire « avec quoi ».
  if (classeParente === null && tresorerieAInvestir > 0) {
    valActuelles.set(
      "tresorerie",
      (valActuelles.get("tresorerie") ?? 0) + tresorerieAInvestir,
    );
  }
  const valPrecedentes = valorisations(
    precedent,
    axe,
    precedent?.asOfDate ?? dateRef,
    refs,
    customParId,
  );

  // Actif net : toutes classes confondues, quel que soit l'axe. La trésorerie
  // à investir en fait partie — elle est simplement encore en liquidités.
  const actifNet =
    (actuel?.positions ?? []).reduce((s, p) => s + num(p.valuation), 0) +
    tresorerieAInvestir;
  const actifNetPrecedent = precedent
    ? precedent.positions.reduce((s, p) => s + num(p.valuation), 0)
    : null;

  // Assiette de l'axe : la classe pour un sous-axe, l'actif net pour l'axe des
  // classes. Un sous-axe alloue L'INTÉRIEUR de sa poche, pas l'actif entier.
  const assiette =
    classeParente === null
      ? actifNet
      : [...valActuelles.values()].reduce((s, v) => s + v, 0);
  const assiettePrecedente =
    classeParente === null
      ? actifNetPrecedent
      : precedent
        ? [...valPrecedentes.values()].reduce((s, v) => s + v, 0)
        : null;

  // Assiette cible.
  //
  // Sur l'axe des classes, c'est l'actif net — trésorerie comprise, elle est
  // déjà dedans.
  //
  // Sur un SOUS-AXE, la poche ne doit pas être dimensionnée à sa taille du
  // jour : c'est précisément ce qui empêchait la trésorerie d'arriver jusqu'aux
  // opérations. Les axes « par titre » et « par émetteur » alimentent le plan
  // d'opérations ; tant que leur assiette valait la poche actuelle, un comité
  // qui décidait « actions 60 % » puis répartissait ces 60 % par titre
  // n'obtenait que des arbitrages À L'INTÉRIEUR de la poche existante, jamais
  // le déploiement de la liquidité. On dimensionne donc la poche à sa cible de
  // classe appliquée à l'actif net. Faute de cible de classe, on retombe sur
  // la taille actuelle — il n'y a alors aucune décision à répercuter.
  const assietteCible =
    classeParente === null
      ? assiette
      : cibleClasseParente !== null
        ? cibleClasseParente * actifNet
        : assiette;

  if (classeParente !== null && cibleClasseParente === null && tresorerieAInvestir > 0) {
    avertissements.push(
      `Aucune allocation validée pour la classe « ${LIBELLE_CLASSE[classeParente]} » : la trésorerie à investir ne peut pas être répartie sur cet axe. Arrêtez d'abord l'allocation par classe d'actif.`,
    );
  }

  if (actuel && assiette <= 0 && classeParente !== null) {
    avertissements.push(
      `Aucune ligne de la classe « ${LIBELLE_CLASSE[classeParente]} » à l'inventaire courant : les allocations de cet axe portent sur une poche vide.`,
    );
  }

  // Postes : l'univers de marché, plus tout poste détenu ou ciblé qui n'y
  // figurerait pas — une ligne non rapprochée ne doit pas disparaître.
  const univers = universDeLAxe(axe);
  const connus = new Map(univers.map((u) => [u.cle, u]));
  for (const cle of [...valActuelles.keys(), ...valPrecedentes.keys(), ...parBucket.keys()]) {
    if (connus.has(cle)) continue;
    connus.set(cle, {
      cle,
      libelle: cle === NON_RAPPROCHE ? "Lignes non rapprochées au référentiel" : cle,
      detail: cle === NON_RAPPROCHE ? "à rattacher dans le référentiel titres" : null,
    });
  }

  const lignes: LigneAllocation[] = [...connus.values()].map((poste) => {
    const valeurActuelle = valActuelles.get(poste.cle) ?? 0;
    const valeurPrecedente = precedent ? (valPrecedentes.get(poste.cle) ?? 0) : null;
    const allocationActuelle = assiette > 0 ? valeurActuelle / assiette : 0;
    const allocationPrecedente =
      assiettePrecedente && assiettePrecedente > 0 && valeurPrecedente !== null
        ? valeurPrecedente / assiettePrecedente
        : null;

    const cible = parBucket.get(poste.cle)?.cible ?? null;
    const valeurCible = cible !== null ? cible * assietteCible : null;
    const montantARealiser = valeurCible !== null ? valeurCible - valeurActuelle : null;
    const ecart = cible !== null ? cible - allocationActuelle : null;

    let tro: number | null = null;
    if (valeurPrecedente !== null && valeurCible !== null) {
      const denom = valeurCible - valeurPrecedente;
      tro = Math.abs(denom) > 1e-6 ? (valeurActuelle - valeurPrecedente) / denom : null;
    }

    return {
      bucket: poste.cle,
      libelle: poste.libelle,
      detail: poste.detail,
      // Sur l'axe des titres, le groupe est le secteur : c'est lui qui porte
      // le contrôle de conformité avec l'allocation sectorielle.
      groupe:
        axe === "action_titre"
          ? (refs.secteurParCode.get(poste.cle.toUpperCase()) ?? null)
          : null,
      positions: positionsParPoste.get(poste.cle) ?? [],
      detenu: valeurActuelle > 0,
      valeurPrecedente,
      allocationPrecedente,
      valeurActuelle,
      allocationActuelle,
      allocationActifNet: actifNet > 0 ? valeurActuelle / actifNet : 0,
      allocationValidee: cible,
      ecart,
      valeurCible,
      montantARealiser,
      tro,
      operation: cible !== null && ecart !== null ? instruction(poste.libelle, ecart) : null,
    };
  });

  // Tri : les postes qui portent une décision ou une position d'abord, le
  // reste de l'univers ensuite, par ordre alphabétique.
  lignes.sort((a, b) => {
    const pa = a.allocationValidee !== null ? 0 : a.detenu ? 1 : 2;
    const pb = b.allocationValidee !== null ? 0 : b.detenu ? 1 : 2;
    if (pa !== pb) return pa - pb;
    if (axe === "classe") {
      return (
        ORDRE_CLASSES.indexOf(a.bucket as PortfolioSection) -
        ORDRE_CLASSES.indexOf(b.bucket as PortfolioSection)
      );
    }
    if (axe === "obligation_maturite") {
      const ia = TRANCHES_MATURITE.findIndex((t) => t.cle === a.bucket);
      const ib = TRANCHES_MATURITE.findIndex((t) => t.cle === b.bucket);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }
    return b.valeurActuelle - a.valeurActuelle || a.libelle.localeCompare(b.libelle, "fr");
  });

  const sommeCibles = lignes.reduce((s, l) => s + (l.allocationValidee ?? 0), 0);
  if (cibles.length > 0 && Math.abs(sommeCibles - 1) > 0.0001) {
    avertissements.push(
      `La somme des allocations validées vaut ${(sommeCibles * 100).toFixed(2).replace(".", ",")} % au lieu de 100 % : les valeurs cibles ne bouclent pas.`,
    );
  }
  if (cibles.length === 0) {
    avertissements.push(
      "Aucune allocation validée enregistrée sur cet axe : saisis les cibles arrêtées en comité pour obtenir les montants à réaliser.",
    );
  }
  if (valActuelles.has(NON_RAPPROCHE)) {
    avertissements.push(
      `${nonRapprochees.length} ligne(s) de l'inventaire ne sont rattachées à aucun poste de cet axe ; le détail et la raison figurent sous le tableau.`,
    );
  }

  // Contrôle de cohérence entre les deux niveaux, signalé à la lecture et pas
  // seulement au moment d'enregistrer.
  if (axeGroupe && Object.keys(ciblesGroupe).length > 0) {
    const groupeDuBucket = new Map(
      lignes.filter((l) => l.groupe).map((l) => [l.bucket, l.groupe as string]),
    );
    const ecarts = controlerGroupes(
      lignes
        .filter((l) => l.allocationValidee !== null)
        .map((l) => ({ bucket: l.bucket, cible: l.allocationValidee as number })),
      groupeDuBucket,
      ciblesGroupe,
    ).filter((c) => !c.conforme);
    if (ecarts.length > 0) {
      avertissements.push(
        `Allocations par titre en écart avec l'allocation sectorielle : ${ecarts
          .map(
            (e) =>
              `${e.groupe} (${(e.sommeTitres * 100).toFixed(2).replace(".", ",")} % contre ${((e.cibleGroupe ?? 0) * 100).toFixed(2).replace(".", ",")} %)`,
          )
          .join(" ; ")}.`,
      );
    }
  }

  return {
    dimension: axe,
    classeParente,
    lignes,
    nonRapprochees,
    assiette,
    assiettePrecedente,
    actifNet,
    tresorerieAInvestir,
    sommeCibles,
    ciblesGroupe,
    axeGroupe,
    dateActuelle: actuel?.asOfDate ?? null,
    datePrecedente: precedent?.asOfDate ?? null,
    avertissements,
  };
}

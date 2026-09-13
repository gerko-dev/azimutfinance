import "server-only";

import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

// === Private equity — entreprises non cotees de la zone ===
//
// Source : data/pe/*.xlsx, un classeur par entreprise, consolides par
// scripts/build_pe_dataset.py en trois CSV. Ouvrir 1737 classeurs a chaque
// rendu couterait des dizaines de secondes ; les CSV sont lus une fois par
// process et memoises ici, comme le reste du portail.
//
// UNITE DES MONTANTS — etablie par recoupement, pas supposee. Aucun classeur
// ne l'indique. Le fichier Sonatel donne un chiffre d'affaires 2020 de 445278
// quand data/DB_Valeurs.csv (fondamentaux BRVM) donne 445 277 683 373 XOF pour
// le meme exercice : le rapport est de 1e6. Les montants sont donc en MILLIONS
// DE FCFA. Toute l'interface doit le dire explicitement — un chiffre d'affaires
// affiche sans son unite serait lu mille fois trop petit.

const DATA_DIR = join(process.cwd(), "data");

export type PeModele = "societe" | "banque" | "assurance";

export type PeEntreprise = {
  slug: string;
  nom: string;
  secteur: string;
  /** Code ISO-2 DEDUIT de la raison sociale, "" quand elle ne tranche pas.
   *  Voir PE_PAYS_NOTE : ce n'est pas une donnee source. */
  pays: string;
  /** "nom" = deduit de la raison sociale, "web" = verifie en ligne, "" = inconnu. */
  paysSource: string;
  modele: PeModele;
  anneeMin: number | null;
  anneeMax: number | null;
  nbExercices: number;
};

export type PeCompte = {
  slug: string;
  annee: number;
  code: string;
  valeur: number;
};

export type PeActionnaire = {
  slug: string;
  rang: number;
  actionnaire: string;
  /** Part du capital en %, null si le classeur ne la chiffre pas. */
  pct: number | null;
};

/** Unite d'affichage d'une metrique. `mfcfa` = millions de FCFA. */
export type PeUnite = "mfcfa" | "pct" | "x";

export const PE_UNITES: Record<string, PeUnite> = {
  croissance_ca: "pct",
  croissance_rn: "pct",
  croissance_pnb: "pct",
  marge_nette: "pct",
  marge_exploitation: "pct",
  roe: "pct",
  roa: "pct",
  autonomie_financiere: "pct",
  ratio_endettement_net: "pct",
  credits_depots: "pct",
  taux_rendement_placements: "pct",
  levier_financier: "x",
};

export const PE_LIBELLES: Record<string, string> = {
  ca: "Chiffre d'affaires",
  croissance_ca: "Croissance du CA",
  pnb: "Produit net bancaire",
  croissance_pnb: "Croissance du PNB",
  ebit: "EBIT",
  ebitda: "EBITDA",
  charges_exploitation: "Charges d'exploitation",
  resultat_net: "Résultat net",
  croissance_rn: "Croissance du résultat net",
  dividende: "Dividende",
  capitaux_propres: "Capitaux propres",
  dette_nette: "Dette nette",
  tresorerie: "Trésorerie",
  total_bilan: "Total bilan",
  depots_clientele: "Dépôts clientèle",
  credits_clientele: "Crédits clientèle",
  marge_nette: "Marge nette",
  marge_exploitation: "Marge d'exploitation",
  roe: "Rentabilité des capitaux propres (ROE)",
  roa: "Rentabilité des actifs (ROA)",
  levier_financier: "Levier financier",
  autonomie_financiere: "Autonomie financière",
  ratio_endettement_net: "Ratio d'endettement net",
  credits_depots: "Crédits / Dépôts",
  solde_souscription: "Solde de souscription",
  solde_assurance: "Solde d'assurance",
  solde_reassurance: "Solde de réassurance",
  resultat_avant_placements: "Résultat avant placements et IS",
  placements: "Placements",
  produits_placements: "Produits des placements",
  solde_financier: "Solde financier",
  taux_rendement_placements: "Taux de rendement des placements",
};

/** Ordre d'affichage par bloc, selon le modele de l'entreprise. */
export const PE_BLOCS: Record<PeModele, { titre: string; codes: string[] }[]> = {
  societe: [
    {
      titre: "Compte de résultat",
      codes: [
        "ca",
        "croissance_ca",
        "ebitda",
        "ebit",
        "charges_exploitation",
        "resultat_net",
        "croissance_rn",
        "dividende",
      ],
    },
    {
      titre: "Bilan",
      codes: ["capitaux_propres", "total_bilan", "dette_nette", "tresorerie"],
    },
    {
      titre: "Ratios financiers",
      codes: [
        "marge_nette",
        "marge_exploitation",
        "roe",
        "roa",
        "levier_financier",
        "autonomie_financiere",
        "ratio_endettement_net",
      ],
    },
  ],
  banque: [
    {
      titre: "Compte de résultat",
      codes: [
        "pnb",
        "croissance_pnb",
        "charges_exploitation",
        "resultat_net",
        "croissance_rn",
        "dividende",
      ],
    },
    {
      titre: "Bilan",
      codes: [
        "capitaux_propres",
        "total_bilan",
        "depots_clientele",
        "credits_clientele",
        "tresorerie",
      ],
    },
    {
      titre: "Ratios financiers",
      codes: [
        "marge_nette",
        "roe",
        "roa",
        "credits_depots",
        "autonomie_financiere",
      ],
    },
  ],
  assurance: [
    {
      titre: "Compte de résultat",
      codes: ["ca", "croissance_ca", "resultat_net", "croissance_rn", "dividende"],
    },
    {
      titre: "Bilan",
      codes: ["capitaux_propres", "total_bilan", "tresorerie", "placements"],
    },
    {
      titre: "Ratios financiers",
      codes: [
        "marge_nette",
        "roe",
        "roa",
        "autonomie_financiere",
        "solde_souscription",
        "solde_assurance",
        "solde_reassurance",
        "taux_rendement_placements",
      ],
    },
  ],
};

function parseCSV<T>(filename: string): T[] {
  const filePath = join(DATA_DIR, filename);
  let content = readFileSync(filePath, "utf-8");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  return Papa.parse<T>(content, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  }).data;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "NC") return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

let _entreprises: PeEntreprise[] | null = null;
let _comptesBySlug: Map<string, PeCompte[]> | null = null;
let _actionnairesBySlug: Map<string, PeActionnaire[]> | null = null;

export function loadPeEntreprises(): PeEntreprise[] {
  if (_entreprises) return _entreprises;
  const rows = parseCSV<Record<string, string>>("pe-entreprises.csv");
  _entreprises = rows
    .filter((r) => r.slug)
    .map((r) => ({
      slug: r.slug.trim(),
      nom: (r.nom ?? "").trim(),
      secteur: (r.secteur ?? "").trim(),
      pays: (r.pays ?? "").trim(),
      paysSource: (r.pays_source ?? "").trim(),
      modele: (["societe", "banque", "assurance"].includes(r.modele)
        ? r.modele
        : "societe") as PeModele,
      anneeMin: num(r.annee_min),
      anneeMax: num(r.annee_max),
      nbExercices: num(r.nb_exercices) ?? 0,
    }));
  return _entreprises;
}

/**
 * Comptes indexes par slug. Le fichier fait ~100 000 lignes : on l'indexe une
 * fois plutot que de le filtrer a chaque fiche consultee.
 */
function comptesIndex(): Map<string, PeCompte[]> {
  if (_comptesBySlug) return _comptesBySlug;
  const rows = parseCSV<Record<string, string>>("pe-comptes.csv");
  const map = new Map<string, PeCompte[]>();
  for (const r of rows) {
    const slug = (r.slug ?? "").trim();
    const annee = num(r.annee);
    const valeur = num(r.valeur);
    if (!slug || annee === null || valeur === null) continue;
    const list = map.get(slug);
    const entry = { slug, annee, code: (r.code ?? "").trim(), valeur };
    if (list) list.push(entry);
    else map.set(slug, [entry]);
  }
  _comptesBySlug = map;
  return map;
}

function actionnairesIndex(): Map<string, PeActionnaire[]> {
  if (_actionnairesBySlug) return _actionnairesBySlug;
  const rows = parseCSV<Record<string, string>>("pe-actionnaires.csv");
  const map = new Map<string, PeActionnaire[]>();
  for (const r of rows) {
    const slug = (r.slug ?? "").trim();
    if (!slug) continue;
    const entry: PeActionnaire = {
      slug,
      rang: num(r.rang) ?? 0,
      actionnaire: (r.actionnaire ?? "").trim(),
      pct: num(r.pct),
    };
    const list = map.get(slug);
    if (list) list.push(entry);
    else map.set(slug, [entry]);
  }
  _actionnairesBySlug = map;
  return map;
}

export function getPeEntreprise(slug: string): PeEntreprise | null {
  const s = slug.toLowerCase();
  return loadPeEntreprises().find((e) => e.slug === s) ?? null;
}

export function loadPeComptes(slug: string): PeCompte[] {
  return comptesIndex().get(slug.toLowerCase()) ?? [];
}

export function loadPeActionnaires(slug: string): PeActionnaire[] {
  return (actionnairesIndex().get(slug.toLowerCase()) ?? []).sort(
    (a, b) => a.rang - b.rang,
  );
}

/** Liste des secteurs presents, triee, sans les entreprises sans secteur. */
export function loadPeSecteurs(): string[] {
  return Array.from(
    new Set(loadPeEntreprises().map((e) => e.secteur).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "fr"));
}

export const PE_PAYS_LABEL: Record<string, string> = {
  CI: "Côte d'Ivoire",
  SN: "Sénégal",
  ML: "Mali",
  BF: "Burkina Faso",
  TG: "Togo",
  BJ: "Bénin",
  NE: "Niger",
  GW: "Guinée-Bissau",
  GH: "Ghana",
  NG: "Nigeria",
  TN: "Tunisie",
};

/** A afficher partout ou le pays apparait. Il est deduit, pas source. */
export const PE_PAYS_NOTE =
  "Les classeurs source ne portent aucun pays. Il est soit déduit de la raison sociale, soit vérifié par recherche en ligne pour les plus grandes entreprises ; la provenance est indiquée sur chaque fiche. Les entreprises sans indice fiable restent volontairement non rattachées.";

export const PE_PAYS_SOURCE_LABEL: Record<string, string> = {
  nom: "déduit de la raison sociale",
  web: "vérifié en ligne",
};

export function loadPePays(): string[] {
  return Array.from(
    new Set(loadPeEntreprises().map((e) => e.pays).filter(Boolean)),
  ).sort((a, b) =>
    (PE_PAYS_LABEL[a] ?? a).localeCompare(PE_PAYS_LABEL[b] ?? b, "fr"),
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export type PeSecteurStats = {
  secteur: string;
  effectif: number;
  medianes: Record<string, number | null>;
};

/**
 * Medianes sectorielles, calculees sur le dernier exercice publie de CHAQUE
 * entreprise du secteur.
 *
 * La mediane, pas la moyenne : sur des comptes d'entreprises non cotees, une
 * seule societe tres grande deplacerait une moyenne au point de la rendre
 * inutile comme repere. Les exercices ne sont pas alignes d'une societe a
 * l'autre — c'est le prix a payer pour comparer un referentiel dont la
 * profondeur varie, et la fiche le dit.
 */
export function computePeSecteurStats(
  secteur: string,
  codes: string[],
): PeSecteurStats {
  const idx = comptesIndex();
  const membres = loadPeEntreprises().filter((e) => e.secteur === secteur);
  const parCode: Record<string, number[]> = {};
  for (const code of codes) parCode[code] = [];

  for (const e of membres) {
    const rows = idx.get(e.slug);
    if (!rows || rows.length === 0) continue;
    const derniere = Math.max(...rows.map((r) => r.annee));
    for (const code of codes) {
      const hit = rows.find((r) => r.annee === derniere && r.code === code);
      if (hit) parCode[code].push(hit.valeur);
    }
  }

  const medianes: Record<string, number | null> = {};
  for (const code of codes) medianes[code] = median(parCode[code]);
  return { secteur, effectif: membres.length, medianes };
}

export type PePeer = {
  slug: string;
  nom: string;
  revenu: number | null;
  resultatNet: number | null;
  margeNette: number | null;
};

/**
 * Comparables : meme secteur, les plus proches par taille de revenu.
 * On compare a taille voisine — un classement du secteur entier mettrait face
 * a face une PME et un groupe, ce qui n'apprend rien.
 */
export function loadPePeers(slug: string, max = 6): PePeer[] {
  const cible = getPeEntreprise(slug);
  if (!cible || !cible.secteur) return [];
  const synthese = buildPeSynthese();
  const moi = synthese.find((l) => l.slug === cible.slug);
  if (!moi || moi.revenu === null) return [];

  return synthese
    .filter(
      (l) => l.secteur === cible.secteur && l.slug !== cible.slug && l.revenu !== null,
    )
    .sort(
      (a, b) =>
        Math.abs((a.revenu as number) - (moi.revenu as number)) -
        Math.abs((b.revenu as number) - (moi.revenu as number)),
    )
    .slice(0, max)
    .map((l) => ({
      slug: l.slug,
      nom: l.nom,
      revenu: l.revenu,
      resultatNet: l.resultatNet,
      margeNette: l.margeNette,
    }));
}

export type PeSyntheseLigne = {
  slug: string;
  nom: string;
  secteur: string;
  pays: string;
  modele: PeModele;
  anneeRef: number | null;
  /** Chiffre d'affaires, ou produit net bancaire pour une banque. */
  revenu: number | null;
  resultatNet: number | null;
  margeNette: number | null;
  roe: number | null;
  nbExercices: number;
};

/**
 * Une ligne par entreprise pour la vue liste : le dernier exercice publie.
 *
 * `revenu` agrege deux metriques differentes — le chiffre d'affaires d'une
 * societe et le produit net bancaire d'une banque. Ce sont bien deux notions
 * distinctes, et la colonne le dit dans son en-tete ; les additionner serait
 * faux, les comparer cote a cote dans un classement ne l'est pas.
 */
export function buildPeSynthese(): PeSyntheseLigne[] {
  const idx = comptesIndex();
  return loadPeEntreprises().map((e) => {
    const rows = idx.get(e.slug) ?? [];
    const anneeRef = rows.length
      ? Math.max(...rows.map((r) => r.annee))
      : null;
    const at = (code: string): number | null => {
      if (anneeRef === null) return null;
      const hit = rows.find((r) => r.annee === anneeRef && r.code === code);
      return hit ? hit.valeur : null;
    };
    return {
      slug: e.slug,
      nom: e.nom,
      secteur: e.secteur,
      pays: e.pays,
      modele: e.modele,
      anneeRef,
      revenu: e.modele === "banque" ? at("pnb") : at("ca"),
      resultatNet: at("resultat_net"),
      margeNette: at("marge_nette"),
      roe: at("roe"),
      nbExercices: e.nbExercices,
    };
  });
}

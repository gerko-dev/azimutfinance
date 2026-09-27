import "server-only";

// === Export des engagements, au format de la feuille « Autres opérations » ===
//
// LE CLASSEUR RESTE LE MAÎTRE. Ce module ne cherche pas à le remplacer : il
// produit exactement les lignes que le gérant retape aujourd'hui à la main,
// dans SON vocabulaire et dans SON ordre de colonnes, pour qu'un copier-coller
// suffise.
//
// D'où trois contraintes qui commandent tout ce fichier :
//
//   LE VOCABULAIRE N'EST PAS LE NÔTRE. La feuille attend AUTRES_ENGAGEMENTS,
//   CASH_A_RECEVOIR, FLUX_THEORIQUES — relevés dans ses propres listes de
//   validation, pas inventés. Nos quatre postes s'y traduisent un pour un.
//
//   LES LIBELLÉS NON PLUS. Le classeur nomme ses banques « BOA CI », « UBA BN »,
//   « NSIA BANQUE SN » ; le site les nomme « BOA - Côte d'Ivoire · Côte
//   d'Ivoire ». Coller un libellé étranger casserait les tableaux croisés qui
//   s'appuient dessus. On traduit donc, et l'on DIT ce qu'on a traduit.
//
//   UN NIVELLEMENT FAIT DEUX LIGNES. Le compte qui envoie est engagé, celui qui
//   reçoit attend du cash : c'est ainsi que la feuille les porte, et c'est la
//   seule écriture qui rende l'argent visible pendant son transit.

import { loadCustomSecurities } from "./portfolio-data";
import { etablissementDuCompte } from "./tresorerie-comptes";
import { fraisGestionDuMois, libelleMois, moisDesFrais } from "./frais-gestion";
import { loadFluxManuels, loadNivellements } from "./tresorerie-flux-data";
import { loadNavMois } from "./nav-data";
import type { PosteFlux } from "./tresorerie-flux-types";
import type { FundRecord } from "./types";

/** Une ligne du tableau, dans l'ordre des colonnes de la feuille. */
export type LigneEngagement = {
  fonds: string;
  date: string;
  typeOperation: string;
  description: string;
  detail: string;
  montant: number;
  banque: string;
  datePrevue: string;
  statut: string;
  dateEffective: string;
};

/** Ce qu'on a retenu comme nom de banque, et d'où ça vient. */
export type Correspondance = {
  etablissement: string;
  libelle: string;
  origine: "déclarée" | "déduite";
};

export type ExportEngagements = {
  lignes: LigneEngagement[];
  correspondances: Correspondance[];
  /** Périmètre et date, pour l'en-tête du fichier. */
  perimetre: string;
  dateArrete: string;
};

/**
 * Traduction de nos quatre postes vers le couple (type, description) du
 * classeur.
 *
 * Les valeurs de droite sont RELEVÉES dans la feuille « Étiquettes de
 * données », colonne par colonne : ce sont celles que ses listes de validation
 * acceptent. Une seule lettre de travers et la ligne collée sort des tableaux
 * croisés sans prévenir.
 */
const TRADUCTION: Record<PosteFlux, { type: string; description: string }> = {
  AUTRES: { type: "AUTRES_ENGAGEMENTS", description: "AUTRES_ENGAGEMENTS" },
  AUTRES_CASH_A_RECEVOIR: {
    type: "CASH_A_RECEVOIR",
    description: "AUTRES_CASH_A_RECEVOIR",
  },
  AUTRES_FLUX_SORTANT: { type: "FLUX_THEORIQUES", description: "AUTRES_FLUX_SORTANT" },
  AUTRES_FLUX_ENTRANT: { type: "FLUX_THEORIQUES", description: "AUTRES_FLUX_ENTRANT" },
};

/** Codes pays du classeur. Le Bénin y est BN, et non BJ. */
const CODE_PAYS: Record<string, string> = {
  "Côte d'Ivoire": "CI",
  "Côte d’Ivoire": "CI",
  Bénin: "BN",
  Benin: "BN",
  Sénégal: "SN",
  Senegal: "SN",
  Togo: "TG",
  Mali: "ML",
  "Burkina Faso": "BF",
  Burkina: "BF",
  Niger: "NE",
  "Guinée-Bissau": "GW",
  "Guinée Bissau": "GW",
  Gabon: "GB",
};

/**
 * Nom de banque tel que le classeur l'écrit, déduit de la fiche.
 *
 * Le classeur nomme court et suffixe le pays : « BOA CI », « ORABANK SN »,
 * « AFG BANK ML ». Le référentiel, lui, nomme long — « Orabank (succ.
 * Sénégal) », « AFG Bank Mali », « BOA - Côte d'Ivoire ». Trois coupes
 * suffisent à passer de l'un à l'autre : ce qui suit un tiret ou une
 * parenthèse, le nom de pays en queue, et le mot « International » que le
 * classeur omet.
 *
 * LA DÉDUCTION N'EST PAS UNE CERTITUDE, et c'est pourquoi elle se déclare :
 * l'export liste chaque correspondance retenue sur une seconde feuille, et le
 * champ « Libellé classeur » de la fiche permet de figer les cas rebelles.
 * Deviner en silence dans un fichier qu'on va coller serait le pire des deux
 * mondes.
 *
 * EXPOSÉE VOLONTAIREMENT, bien qu'appelée d'un seul endroit : c'est la seule
 * règle de ce module qui puisse se tromper, et une fonction nommée se rejoue
 * contre la liste réelle du classeur. Sur les seize banques qu'il connaît,
 * treize sortent exactes ; les trois autres — BNDE, que le classeur n'affuble
 * d'aucun pays, AFG BANK GABON dont la fiche porte « Autre » faute de Gabon
 * dans la liste des pays UEMOA, et PAPS qui s'y écrit PAPSS — se figent par le
 * champ « Libellé classeur ».
 */
export function deduireLibelle(banque: string, pays: string): string {
  let nom = banque.trim();
  const coupe = nom.search(/\s[-–(]/);
  if (coupe > 0) nom = nom.slice(0, coupe);
  nom = nom.replace(/\s+International\b/i, "");
  // Un nom de pays en queue : « AFG Bank Mali » → « AFG Bank ».
  for (const p of Object.keys(CODE_PAYS)) {
    if (nom.length > p.length && nom.toLowerCase().endsWith(` ${p.toLowerCase()}`)) {
      nom = nom.slice(0, -(p.length + 1));
      break;
    }
  }
  const code = CODE_PAYS[pays.trim()] ?? "";
  return `${nom.trim().toUpperCase()}${code ? ` ${code}` : ""}`.trim();
}

/** Le nom du fonds tel que le classeur l'écrit : « FCP » puis le nom. */
const nomClasseur = (f: { nom: string; type?: string | null }): string => {
  const nom = f.nom.trim();
  const type = (f.type ?? "").trim().toUpperCase();
  if (!type || nom.toUpperCase().startsWith(type)) return nom;
  return `${type} ${nom}`;
};

type Banques = {
  libelle: (cle: string) => string;
  correspondances: Correspondance[];
};

/**
 * Table des banques du fonds, construite une fois depuis ses fiches de compte.
 *
 * On repasse par `etablissementDuCompte` plutôt que de lire les attributs à la
 * main : c'est lui qui fabrique la clef d'établissement que portent les flux
 * et les nivellements, et deux façons de la calculer auraient fini par ne plus
 * se rejoindre.
 */
async function banquesDuFonds(fundId: string): Promise<Banques> {
  const fiches = await loadCustomSecurities();
  const parCle = new Map<string, Correspondance>();

  for (const c of fiches) {
    if (c.kind !== "tresorerie") continue;
    const proprietaire = (c.attributes?.fundId ?? "").trim();
    if (proprietaire && proprietaire !== fundId) continue;
    const etab = etablissementDuCompte(c);
    if (!etab) continue;
    const declare = (c.attributes?.libelleClasseur ?? "").trim();
    const deja = parCle.get(etab.cle);
    // Une déclaration l'emporte toujours sur une déduction, et sur une
    // déclaration antérieure : deux comptes du même établissement peuvent
    // porter la même, une seule suffit.
    if (deja && (deja.origine === "déclarée" || !declare)) continue;
    parCle.set(etab.cle, {
      etablissement: etab.cle,
      libelle: declare || deduireLibelle(etab.nom, etab.pays),
      origine: declare ? "déclarée" : "déduite",
    });
  }

  return {
    // Une clef inconnue ressort telle quelle : mieux vaut un libellé visible à
    // corriger qu'une cellule vide qu'on ne remarque pas.
    libelle: (cle) => parCle.get(cle)?.libelle ?? cle,
    correspondances: [...parCle.values()].sort((a, b) =>
      a.libelle.localeCompare(b.libelle, "fr"),
    ),
  };
}

/**
 * Les engagements d'un fonds, prêts à coller.
 *
 * TROIS GISEMENTS, ET TROIS SEULEMENT : les flux saisis, les nivellements et
 * les frais de gestion. Ce sont ceux dont le site connaît à la fois le
 * montant, la date et la banque — les trois colonnes qui font une ligne
 * collable. Les rachats vivent dans le module des parts, qui n'est pas encore
 * branché ; les y prendre produirait des lignes à moitié vides.
 */
async function engagementsDuFonds(
  fonds: FundRecord,
  dateArrete: string,
): Promise<{ lignes: LigneEngagement[]; correspondances: Correspondance[] }> {
  const [flux, nivellements, banques] = await Promise.all([
    loadFluxManuels(fonds.id),
    loadNivellements(fonds.id),
    banquesDuFonds(fonds.id),
  ]);

  const nom = nomClasseur(fonds);
  const lignes: LigneEngagement[] = [];

  for (const f of flux) {
    const t = TRADUCTION[f.poste];
    lignes.push({
      fonds: nom,
      date: f.dateFlux,
      typeOperation: t.type,
      description: t.description,
      detail: f.libelle,
      montant: f.montant,
      banque: banques.libelle(f.compte),
      datePrevue: f.dateFlux,
      // LE SITE N'A PAS D'ÉTAT « ANNULÉ » : on y supprime un flux, on ne le
      // barre pas. Tout ce qu'il porte est donc en vigueur, et « OK » est
      // l'exact reflet de ce qu'il sait.
      statut: "OK",
      dateEffective: "",
    });
  }

  for (const n of nivellements) {
    const source = banques.libelle(n.compteSource);
    const destination = banques.libelle(n.compteDestination);
    const detail = n.libelle.trim() || `NIVELLEMENT ${source} VERS ${destination}`;
    lignes.push({
      fonds: nom,
      date: n.dateNivellement,
      typeOperation: "AUTRES_ENGAGEMENTS",
      description: "AUTRES_ENGAGEMENTS",
      detail,
      montant: n.montant,
      banque: source,
      datePrevue: n.dateNivellement,
      statut: "OK",
      dateEffective: n.rapprocheDebit ?? "",
    });
    lignes.push({
      fonds: nom,
      date: n.dateNivellement,
      typeOperation: "CASH_A_RECEVOIR",
      description: "AUTRES_CASH_A_RECEVOIR",
      detail,
      montant: n.montant,
      banque: destination,
      datePrevue: n.dateNivellement,
      statut: "OK",
      dateEffective: n.rapprocheCredit ?? "",
    });
  }

  // ── Frais de gestion ──────────────────────────────────────────────────
  //
  // LE SITE CALCULE LE MONTANT, PAS LA DATE DU PRÉLÈVEMENT. Celle-ci relève
  // d'une décision, pas d'un calcul : le gérant engage les frais quand il
  // l'entend, en général dans la quinzaine qui suit le mois. On porte donc la
  // date d'arrêté, qui est celle où il regarde son point — c'est la seule
  // cellule de cet export qu'il aura peut-être à retoucher, et elle est dite
  // comme telle sur la feuille des correspondances.
  const compteFrais = (fonds.compteFraisGestion ?? "").trim();
  const taux = Number(fonds.fraisGestion ?? "") || 0;
  if (compteFrais && taux > 0) {
    const mois = moisDesFrais(dateArrete);
    // Mêmes arguments que le point de trésorerie, et dans le même ordre : deux
    // façons d'appeler le calcul finiraient par donner deux montants.
    const frais = fraisGestionDuMois(await loadNavMois(fonds.id, mois), taux, dateArrete);
    if (frais.montant > 0) {
      lignes.push({
        fonds: nom,
        date: dateArrete,
        typeOperation: "AUTRES_ENGAGEMENTS",
        description: "FRAIS_DE_GESTION",
        detail: `FRAIS DE GESTION DU MOIS DE ${libelleMois(mois).toUpperCase()}`,
        montant: Math.round(frais.montant),
        banque: banques.libelle(compteFrais),
        datePrevue: dateArrete,
        statut: "OK",
        dateEffective: "",
      });
    }
  }

  return { lignes, correspondances: banques.correspondances };
}

/** L'export, pour un fonds ou pour tous. */
export async function construireExportEngagements(
  fonds: FundRecord[],
  dateArrete: string,
): Promise<ExportEngagements> {
  const parts = await Promise.all(fonds.map((f) => engagementsDuFonds(f, dateArrete)));

  const correspondances = new Map<string, Correspondance>();
  for (const p of parts) {
    for (const c of p.correspondances) {
      const deja = correspondances.get(c.etablissement);
      if (!deja || (deja.origine === "déduite" && c.origine === "déclarée")) {
        correspondances.set(c.etablissement, c);
      }
    }
  }

  const lignes = parts
    .flatMap((p) => p.lignes)
    // Par DATE puis par fonds : c'est l'ordre du tableau, qui se remplit au
    // fil de l'eau. Coller un bloc trié autrement obligerait à retrier.
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.fonds.localeCompare(b.fonds, "fr") ||
        a.typeOperation.localeCompare(b.typeOperation),
    );

  return {
    lignes,
    correspondances: [...correspondances.values()].sort((a, b) =>
      a.libelle.localeCompare(b.libelle, "fr"),
    ),
    perimetre: fonds.length === 1 ? nomClasseur(fonds[0]) : `${fonds.length} fonds`,
    dateArrete,
  };
}

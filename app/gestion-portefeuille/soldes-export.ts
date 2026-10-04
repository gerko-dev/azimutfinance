import "server-only";

// === Export des soldes, au format de la feuille « Point de trésorerie » ====
//
// LE CLASSEUR RESTE LE MAÎTRE, comme pour les engagements. Le gérant retape
// aujourd'hui, à la main, quinze lignes de soldes réparties sur quinze blocs —
// une par fonds. Ce module produit exactement ces lignes, dans SON ordre de
// colonnes, pour qu'un copier-coller suffise.
//
// ET L'ORDRE DES COLONNES EST LE PROBLÈME. Chaque fonds a le sien dans la
// feuille : AURORE OPPORTUNITES commence par UBA CI, NSIA FONDS DIVERSIFIE par
// BOA CI, TAWFIR HALAL par NSIA BANQUE CI. Rien dans le site ne connaît cet
// ordre — il n'obéit à aucune règle, c'est l'histoire du fonds. Exporter dans
// NOTRE ordre produirait un fichier qu'il faudrait réaligner colonne par
// colonne avant de coller, c'est-à-dire exactement le travail qu'on veut
// supprimer, avec en prime le risque de poser le solde d'une banque sur une
// autre.
//
// ON LIT DONC LA STRUCTURE DANS LE CLASSEUR LUI-MÊME. Le gérant le dépose, on
// y relève pour chaque bloc le nom du fonds, la ligne « SOLDE » et l'ordre de
// ses en-têtes, et l'on rend un fichier calqué dessus — mêmes lignes, mêmes
// colonnes. Ajoute-t-il une banque le mois prochain, l'export la suit sans
// qu'on ait rien à reprendre ici.
//
// LES LIBELLÉS NE SONT PAS LES NÔTRES. Le classeur nomme « BOA CI », le site
// « BOA - Côte d'Ivoire · Côte d'Ivoire ». La traduction passe par le même
// chemin que l'export des engagements — `libelleClasseur` quand la fiche le
// déclare, déduction sinon — parce que deux façons de nommer la même banque
// auraient fini par ne plus se rejoindre.

import ExcelJS from "exceljs";

import { loadCustomSecurities } from "./portfolio-data";
import { etablissementDuCompte } from "./tresorerie-comptes";
import { deduireLibelle } from "./engagements-export";
import { construirePointTresorerie } from "./tresorerie-data";
import { fondsDansLeTexte, rattacherFonds } from "./releves-rapprochement";
import type { FundRecord } from "./types";

/** Un bloc de la feuille : un fonds, sa ligne de soldes, ses colonnes. */
export type BlocClasseur = {
  /** Nom du fonds tel que le classeur l'écrit. */
  intitule: string;
  /** Numéro de la ligne « SOLDE » dans la feuille. */
  ligneSolde: number;
  /** Première colonne de données (1 = A). */
  colonneDebut: number;
  /** Les en-têtes de banque, dans l'ordre de la feuille. */
  entetes: string[];
};

/** Une ligne de l'export : un fonds, ses soldes, dans l'ordre du classeur. */
export type LigneSoldes = {
  intitule: string;
  ligneSolde: number;
  colonneDebut: number;
  entetes: string[];
  /** Un solde par en-tête, dans le même ordre. Null quand le site n'a pas de
   *  compte pour cette colonne — une cellule vide se colle sans effacer. */
  soldes: (number | null)[];
  /** Ce que le site porte et que le classeur n'a pas de colonne pour recevoir.
   *  Le dire plutôt que de le taire : un solde qui ne part nulle part est un
   *  solde qui manquera au total. */
  sansColonne: { libelle: string; solde: number }[];
  /** Null quand le bloc n'a pas trouvé son fonds au site. */
  probleme: string | null;
};

export type ExportSoldes = {
  dateArrete: string;
  lignes: LigneSoldes[];
  /** Les blocs du classeur qu'on n'a pas su rattacher. */
  orphelins: string[];
};

const EST_SOLDE = /^SOLDE$/i;
const EST_FONDS = /^(FCP|FCPE|SICAV)\b/i;

const texte = (c: ExcelJS.Cell | undefined): string => {
  const v = c?.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return String(v.result ?? "");
    if ("formula" in v) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
};

/**
 * La structure de la feuille « Point de trésorerie », relevée dans le classeur.
 *
 * ON SE REPÈRE SUR LA LIGNE « SOLDE », et sur elle seule. C'est le seul point
 * fixe du bloc : le nom du fonds flotte quelques lignes au-dessus, le nombre de
 * postes varie, la hauteur du bloc aussi. Les en-têtes sont juste au-dessus
 * d'elle, et le nom du fonds est le premier libellé en « FCP… » qu'on trouve en
 * remontant.
 *
 * LA DERNIÈRE COLONNE EST UN TOTAL : elle se calcule dans le classeur, et y
 * coller une valeur écraserait sa formule.
 */
export async function structureDuClasseur(octets: Buffer): Promise<BlocClasseur[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(octets as unknown as ArrayBuffer);
  const ws =
    wb.worksheets.find((w) => /point/i.test(w.name) && /tr.?sor/i.test(w.name)) ?? null;
  if (!ws) {
    throw new Error(
      "Aucune feuille « Point de trésorerie » dans ce classeur : vérifie que c'est le bon fichier.",
    );
  }

  const blocs: BlocClasseur[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const ligne = ws.getRow(r);
    // Le libellé du poste se tient en colonne B dans ce classeur ; on balaie
    // les deux premières plutôt que de le figer.
    let colonneLibelle = 0;
    for (const c of [1, 2, 3]) {
      if (EST_SOLDE.test(texte(ligne.getCell(c)))) {
        colonneLibelle = c;
        break;
      }
    }
    if (!colonneLibelle) continue;

    let intitule = "";
    for (let k = r - 1; k >= Math.max(1, r - 10) && !intitule; k--) {
      for (const c of [1, 2, 3, 4]) {
        const v = texte(ws.getRow(k).getCell(c));
        if (EST_FONDS.test(v)) {
          intitule = v;
          break;
        }
      }
    }
    if (!intitule) continue;

    const colonneDebut = colonneLibelle + 1;
    const entetes: string[] = [];
    const haut = ws.getRow(r - 1);
    for (let c = colonneDebut; c <= ws.columnCount; c++) {
      const v = texte(haut.getCell(c));
      if (!v) continue;
      // LE TOTAL EST UNE FORMULE DU CLASSEUR : on s'arrête avant.
      if (/^total$/i.test(v)) break;
      entetes.push(v);
    }
    if (entetes.length > 0) blocs.push({ intitule, ligneSolde: r, colonneDebut, entetes });
  }

  if (blocs.length === 0) {
    throw new Error(
      "Aucun bloc de fonds trouvé dans la feuille : elle doit porter une ligne « SOLDE » par fonds, " +
        "avec les banques en en-tête juste au-dessus.",
    );
  }
  return blocs;
}

/** Table clef d'établissement → libellé du classeur, pour un fonds. */
async function libellesDuFonds(fundId: string): Promise<Map<string, string>> {
  const fiches = await loadCustomSecurities();
  const out = new Map<string, string>();
  for (const c of fiches) {
    if (c.kind !== "tresorerie") continue;
    const proprietaire = (c.attributes?.fundId ?? "").trim();
    if (proprietaire && proprietaire !== fundId) continue;
    const etab = etablissementDuCompte(c);
    if (!etab) continue;
    const declare = (c.attributes?.libelleClasseur ?? "").trim();
    // Une déclaration l'emporte sur une déduction, et sur une déclaration
    // antérieure : deux comptes du même établissement peuvent la porter.
    if (out.has(etab.cle) && !declare) continue;
    out.set(etab.cle, declare || deduireLibelle(etab.nom, etab.pays));
  }
  return out;
}

/** Deux libellés de banque se comparent sans casse, espaces ni ponctuation. */
const clefLibelle = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Les soldes de tous les fonds, rangés comme le classeur les attend.
 *
 * LE CLASSEUR COMMANDE L'ORDRE, le site fournit les montants. Un bloc dont on
 * ne retrouve pas le fonds ressort en orphelin plutôt que d'être rempli au
 * hasard ; une colonne sans compte au site reste VIDE — une cellule vide se
 * colle sans effacer, un zéro écraserait un solde que le gérant avait saisi.
 */
export async function construireExportSoldes(
  fonds: FundRecord[],
  blocs: BlocClasseur[],
  dateArrete: string,
): Promise<ExportSoldes> {
  const candidats = fonds.map((f) => ({ cle: f.id, libelle: f.nom }));
  const lignes: LigneSoldes[] = [];
  const orphelins: string[] = [];

  for (const bloc of blocs) {
    // DEUX SENS DE LECTURE, ET IL FAUT LES DEUX.
    //
    // Le classeur écrit tantôt PLUS que le nom du fonds — « Inventaire du FCP
    // X au … » —, tantôt MOINS : son bloc s'intitule « FCP MAC AFRICAN » quand
    // le fonds s'appelle « FCP MAC AFRICAN EPARGNE PLUS ». On cherche donc
    // d'abord le fonds contenu dans l'intitulé, puis l'intitulé contenu dans
    // un fonds.
    const rattache = (() => {
      const dans = fondsDansLeTexte(bloc.intitule, candidats);
      if (dans.trouve) return dans;
      const inverse = rattacherFonds(bloc.intitule, candidats);
      return inverse.trouve ? inverse : dans;
    })();
    if (!rattache.trouve) {
      orphelins.push(`${bloc.intitule} — ${rattache.raison}`);
      continue;
    }
    const fonds1 = fonds.find((f) => f.id === rattache.cle)!;

    const [point, libelles] = await Promise.all([
      construirePointTresorerie(fonds1.id, fonds1.nom, dateArrete),
      libellesDuFonds(fonds1.id),
    ]);
    const base: LigneSoldes = {
      intitule: bloc.intitule,
      ligneSolde: bloc.ligneSolde,
      colonneDebut: bloc.colonneDebut,
      entetes: bloc.entetes,
      soldes: bloc.entetes.map(() => null),
      sansColonne: [],
      probleme: null,
    };
    if (!point) {
      lignes.push({ ...base, probleme: "Aucun inventaire : le point ne se construit pas." });
      continue;
    }

    const parBanque = point.lignes.find((l) => l.libelle === "SOLDE")?.parBanque ?? {};
    // On indexe les soldes du site sous leur libellé de classeur.
    const soldeParLibelle = new Map<string, number>();
    for (const [cle, montant] of Object.entries(parBanque)) {
      if (typeof montant !== "number") continue;
      const lib = libelles.get(cle) ?? cle;
      const k = clefLibelle(lib);
      soldeParLibelle.set(k, (soldeParLibelle.get(k) ?? 0) + montant);
    }

    const servis = new Set<string>();
    base.soldes = bloc.entetes.map((e) => {
      const k = clefLibelle(e);
      if (!soldeParLibelle.has(k)) return null;
      servis.add(k);
      return soldeParLibelle.get(k)!;
    });
    for (const [k, montant] of soldeParLibelle) {
      if (servis.has(k) || montant === 0) continue;
      const lib =
        [...libelles.values()].find((l) => clefLibelle(l) === k) ?? k;
      base.sansColonne.push({ libelle: lib, solde: montant });
    }
    lignes.push(base);
  }

  return { dateArrete, lignes, orphelins };
}

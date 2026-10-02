import "server-only";

// === Lire le dossier des relevés, et proposer les soldes ===
//
// LE DOSSIER EST LA SOURCE. Le gérant dépose les relevés sous `Relevés/`, un
// sous-dossier par date d'arrêté, un sous-dossier par banque dedans. On prend
// TOUJOURS LA DATE LA PLUS RECENTE : c'est ce qu'il vient de déposer, et lui
// demander laquelle lire à chaque fois serait lui faire ressaisir ce que le
// nom du dossier dit déjà.
//
// CE MODULE NE DECIDE RIEN. Il lit, il rattache ce qu'il peut, et il rend le
// reste avec la raison. C'est l'écran qui montre, et le gérant qui applique :
// un solde à huit chiffres écrit sans qu'on l'ait vu passer n'est pas une
// automatisation, c'est une erreur en attente.

import { readFile, readdir } from "fs/promises";
import { join } from "path";

import { lignesDuPdf } from "@/lib/releves/pdfLignes";

import { interpreterReleve } from "./releves-parse";
import {
  fondsDuNomDeFichier,
  rattacherEtablissement,
  rattacherFonds,
  titulaireGenerique,
  type Candidat,
} from "./releves-rapprochement";
import type { GrilleSoldes } from "./tresorerie-grille";

/** Le dossier des relevés, à la racine du dépôt. */
export const DOSSIER_RELEVES = "Relevés";

/** Un relevé lu, et la cellule de la grille où il tombe. */
export type PropositionSolde = {
  /** Chemin relatif au dossier de date, pour que le gérant retrouve le PDF. */
  fichier: string;
  dossierBanque: string;
  /** Titulaire ou libellé du compte, tel que la banque l'écrit. */
  intitule: string;
  numeroCompte: string;
  solde: number | null;
  soldeDisponible: number | null;
  dateSolde: string | null;
  /** Clef de colonne, ou "" si le dossier ne désigne aucun établissement. */
  etablissement: string;
  etablissementNom: string;
  /** Identifiant du fonds, ou "" si le titulaire n'en désigne aucun. */
  fondsId: string;
  fondsNom: string;
  /** Ce qui empêche d'appliquer cette ligne, ou null. */
  probleme: string | null;
};

export type LectureReleves = {
  /** Date du sous-dossier retenu, telle qu'il se nomme. */
  dossier: string;
  /** Nombre de PDF rencontrés, lisibles ou non. */
  fichiers: number;
  /** Celles qui tombent dans une cellule de la grille. */
  propositions: PropositionSolde[];
  /** Celles qu'on ne sait pas placer, avec leur raison. */
  ecartees: PropositionSolde[];
};

/** Les sous-dossiers de date, du plus récent au plus ancien. */
async function dossiersDeDate(racine: string): Promise<string[]> {
  const entrees = await readdir(join(racine, DOSSIER_RELEVES), {
    withFileTypes: true,
  });
  return entrees
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // LE NOM DU DOSSIER EST SA DATE, donc l'ordre alphabétique est l'ordre
    // chronologique — à condition qu'il soit écrit en ISO. Un dossier nommé
    // autrement se range où il peut : on le garde, mais il ne passera pas
    // devant une date bien formée.
    .sort((a, b) => b.localeCompare(a));
}

/**
 * Lit les relevés du dossier le plus récent et les rattache à la grille.
 *
 * `racine` est le répertoire du dépôt : il est passé plutôt que déduit pour
 * que la fonction reste testable hors du serveur.
 */
export async function lireReleves(
  racine: string,
  grille: GrilleSoldes,
  dossierVoulu?: string,
): Promise<LectureReleves | { erreur: string }> {
  let dates: string[];
  try {
    dates = await dossiersDeDate(racine);
  } catch {
    return {
      erreur:
        `Aucun dossier « ${DOSSIER_RELEVES} » ici. Les relevés se lisent sur la machine ` +
        `qui fait tourner le site : en ligne, ce dossier n'existe pas.`,
    };
  }
  if (dates.length === 0) {
    return { erreur: `Le dossier « ${DOSSIER_RELEVES} » ne contient aucune date.` };
  }
  const dossier = dossierVoulu && dates.includes(dossierVoulu) ? dossierVoulu : dates[0];
  const base = join(racine, DOSSIER_RELEVES, dossier);

  const banques: Candidat[] = grille.banques.map((b) => ({
    cle: b.cle,
    libelle: `${b.nom} ${b.pays}`,
  }));
  const fonds: Candidat[] = grille.lignes.map((l) => ({
    cle: l.fondsId,
    libelle: l.fondsNom,
  }));
  const nomBanque = new Map(grille.banques.map((b) => [b.cle, b.nom]));
  const nomFonds = new Map(grille.lignes.map((l) => [l.fondsId, l.fondsNom]));
  const comptesDuFonds = new Map(grille.lignes.map((l) => [l.fondsId, new Set(l.comptes)]));

  const propositions: PropositionSolde[] = [];
  const ecartees: PropositionSolde[] = [];
  let fichiers = 0;

  for (const e of await readdir(base, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dossierBanque = e.name;
    const etab = rattacherEtablissement(dossierBanque, banques);

    for (const f of await readdir(join(base, dossierBanque))) {
      if (!f.toLowerCase().endsWith(".pdf")) continue;
      fichiers++;

      const ligne: PropositionSolde = {
        fichier: `${dossierBanque}/${f}`,
        dossierBanque,
        intitule: "",
        numeroCompte: "",
        solde: null,
        soldeDisponible: null,
        dateSolde: null,
        etablissement: etab.trouve ? etab.cle : "",
        etablissementNom: etab.trouve ? (nomBanque.get(etab.cle) ?? etab.cle) : "",
        fondsId: "",
        fondsNom: "",
        probleme: null,
      };

      let lu;
      try {
        lu = interpreterReleve(await lignesDuPdf(new Uint8Array(await readFile(join(base, dossierBanque, f)))));
      } catch (err) {
        ecartees.push({
          ...ligne,
          probleme: `PDF illisible : ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      ligne.intitule = lu.intitule;
      ligne.numeroCompte = lu.numeroCompte;
      ligne.solde = lu.solde;
      ligne.soldeDisponible = lu.soldeDisponible;
      ligne.dateSolde = lu.dateSolde;

      // LE TITULAIRE D'ABORD, LE NOM DU FICHIER ENSUITE. Six banques nomment
      // le compte par son fonds ; les autres nomment la société de gestion, et
      // seul le nom du fichier distingue alors les portefeuilles.
      let fondsTrouve = rattacherFonds(lu.intitule, fonds);
      let parFichier = false;
      if (!fondsTrouve.trouve && titulaireGenerique(lu.intitule)) {
        const suggere = fondsDuNomDeFichier(f);
        if (suggere) {
          const second = rattacherFonds(suggere, fonds);
          if (second.trouve) {
            fondsTrouve = second;
            parFichier = true;
          }
        }
      }
      if (fondsTrouve.trouve) {
        ligne.fondsId = fondsTrouve.cle;
        ligne.fondsNom =
          (nomFonds.get(fondsTrouve.cle) ?? "") + (parFichier ? " (d'après le nom du fichier)" : "");
      }

      if (lu.probleme) {
        ecartees.push({ ...ligne, probleme: lu.probleme });
        continue;
      }
      if (!etab.trouve) {
        ecartees.push({ ...ligne, probleme: etab.raison });
        continue;
      }
      if (!fondsTrouve.trouve) {
        ecartees.push({ ...ligne, probleme: fondsTrouve.raison });
        continue;
      }
      if (ligne.solde === null) {
        ecartees.push({ ...ligne, probleme: "Solde introuvable dans ce relevé." });
        continue;
      }
      // LA CELLULE DOIT EXISTER. La grille barre les croisements où le fonds
      // n'a pas de compte : y écrire un solde ferait apparaître une colonne
      // que le référentiel ignore, et le point de trésorerie la perdrait.
      if (!comptesDuFonds.get(ligne.fondsId)?.has(ligne.etablissement)) {
        ecartees.push({
          ...ligne,
          probleme:
            `Le référentiel ne donne pas de compte à ${ligne.fondsNom} chez ` +
            `${ligne.etablissementNom} : la case n'existe pas dans la grille.`,
        });
        continue;
      }

      propositions.push(ligne);
    }
  }

  const ordre = (a: PropositionSolde, b: PropositionSolde) =>
    a.dossierBanque.localeCompare(b.dossierBanque) || a.fichier.localeCompare(b.fichier);
  propositions.sort(ordre);
  ecartees.sort(ordre);

  return { dossier, fichiers, propositions, ecartees };
}

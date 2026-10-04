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

import type { ReleveLu } from "./releves-parse";
import {
  fondsDuNomDeFichier,
  rattacherEtablissement,
  rattacherFonds,
  titulaireGenerique,
  type Candidat,
} from "./releves-rapprochement";
import type { GrilleSoldes } from "./tresorerie-grille";

/**
 * Un relevé lu, AVANT tout rattachement.
 *
 * C'EST LA FRONTIERE ENTRE LES DEUX CHEMINS. Le dossier du poste et le dépôt
 * depuis le navigateur produisent exactement cela ; tout ce qui suit —
 * rattacher à une banque, à un fonds, à une case — ne sait plus d'où il vient
 * et n'a pas à le savoir.
 */
export type ReleveBrut = ReleveLu & {
  /** Chemin relatif au dossier de date : « BOA/BOA AM (79).pdf ». */
  fichier: string;
  /** Le sous-dossier, qui nomme la banque. */
  dossierBanque: string;
};

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

/**
 * Rattache des relevés déjà lus aux cases de la grille.
 *
 * PUR, ET SEUL A DECIDER. Ni fichier ni base : on lui donne ce qui a été lu et
 * la grille visée, il rend ce qui tombe dans une case et ce qui n'y tombe pas,
 * avec la raison. C'est le SEUL endroit où un relevé se voit attribuer une
 * banque, un fonds et une case : la route qui ouvre les PDF ne fait que lire.
 */
export function rattacherLectures(
  lus: ReleveBrut[],
  grille: GrilleSoldes,
  dossier: string,
): LectureReleves {
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
  // UN DOSSIER DE BANQUE NE SE RATTACHE QU'UNE FOIS, pour sept relevés : le
  // rapprochement de noms est le travail le plus cher de la boucle.
  const parDossier = new Map<string, ReturnType<typeof rattacherEtablissement>>();

  const propositions: PropositionSolde[] = [];
  const ecartees: PropositionSolde[] = [];

  for (const lu of lus) {
    let etab = parDossier.get(lu.dossierBanque);
    if (!etab) {
      etab = rattacherEtablissement(lu.dossierBanque, banques);
      parDossier.set(lu.dossierBanque, etab);
    }

    const ligne: PropositionSolde = {
      fichier: lu.fichier,
      dossierBanque: lu.dossierBanque,
      intitule: lu.intitule,
      numeroCompte: lu.numeroCompte,
      solde: lu.solde,
      soldeDisponible: lu.soldeDisponible,
      dateSolde: lu.dateSolde,
      etablissement: etab.trouve ? etab.cle : "",
      etablissementNom: etab.trouve ? (nomBanque.get(etab.cle) ?? etab.cle) : "",
      fondsId: "",
      fondsNom: "",
      probleme: null,
    };

    // LE TITULAIRE D'ABORD, LE NOM DU FICHIER ENSUITE, et seulement si le
    // titulaire ne nomme QUE la société de gestion — cf. `titulaireGenerique`.
    let fondsTrouve = rattacherFonds(lu.intitule, fonds);
    let parFichier = false;
    if (!fondsTrouve.trouve && titulaireGenerique(lu.intitule)) {
      const suggere = fondsDuNomDeFichier(lu.fichier);
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
        (nomFonds.get(fondsTrouve.cle) ?? "") +
        (parFichier ? " (d'après le nom du fichier)" : "");
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
    // LA CELLULE DOIT EXISTER. La grille barre les croisements où le fonds n'a
    // pas de compte : y écrire un solde ferait apparaître une colonne que le
    // référentiel ignore, et le point de trésorerie la perdrait.
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

  const ordre = (a: PropositionSolde, b: PropositionSolde) =>
    a.dossierBanque.localeCompare(b.dossierBanque) || a.fichier.localeCompare(b.fichier);
  propositions.sort(ordre);
  ecartees.sort(ordre);

  return { dossier, fichiers: lus.length, propositions, ecartees };
}

/** Ce qu'on retient d'un PDF qu'on n'a pas pu ouvrir. */
export const RELEVE_ILLISIBLE = {
  format: "",
  numeroCompte: "",
  intitule: "",
  solde: null,
  soldeDisponible: null,
  dateSolde: null,
  probleme: null,
} as const;


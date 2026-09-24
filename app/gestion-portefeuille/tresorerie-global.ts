import "server-only";

// === Point de trésorerie CONSOLIDÉ ===
//
// La même feuille, tous fonds confondus. C'est la vue du trésorier de la
// société de gestion : ce qu'il a en banque au total, et où.
//
// Construit en ADDITIONNANT les points de chaque fonds plutôt qu'en refaisant
// le calcul sur un inventaire fusionné. Deux raisons : la règle du slot « fin »
// et celle du dénouement s'appliquent fonds par fonds, et un inventaire
// consolidé les aurait perdues ; et une divergence entre la consolidation et
// un point individuel serait alors impossible à localiser.

import {
  LIGNES_POINT_TRESORERIE,
  type LigneTresorerie,
  type PointTresorerie,
} from "./tresorerie-types";
import { construirePointTresorerie } from "./tresorerie-data";

// L'identifiant de la vue consolidée vit dans `tresorerie-types`, qui ne lit
// rien : les composants clients en ont besoin, et l'importer d'ici leur
// faisait tirer le chargeur serveur tout entier dans leur bundle.
//
// Ré-exporté pour les appelants serveur déjà branchés ici. Un `export … from`
// ne le met PAS dans la portée du module, d'où l'import qui suit — ce fichier
// s'en sert pour lui-même.
export { FONDS_GLOBAL } from "./tresorerie-types";
import { FONDS_GLOBAL } from "./tresorerie-types";

/** Rang d'affichage d'un groupe de colonnes, repris de `ordonnerEtablissements`. */
function rangGroupe(groupe: string): number {
  if (groupe === "Comptes dépositaires") return 0;
  if (groupe === "Comptes espèce") return 1;
  return 2;
}

/**
 * Point consolidé de plusieurs fonds.
 *
 * Renvoie `null` si aucun fonds n'a d'inventaire exploitable — le même contrat
 * que `construirePointTresorerie`, pour que l'écran n'ait qu'un cas d'absence
 * à traiter.
 */
export async function construirePointGlobal(
  fonds: { id: string; nom: string }[],
  dateEngagements?: string | null,
): Promise<PointTresorerie | null> {
  const points = (
    await Promise.all(
      fonds.map((f) => construirePointTresorerie(f.id, f.nom, dateEngagements)),
    )
  ).filter((p): p is PointTresorerie => p !== null);

  if (points.length === 0) return null;

  // ── Colonnes : l'UNION des établissements, réordonnée ───────────────────
  //
  // Deux fonds partagent souvent une banque : la colonne est alors commune et
  // ses montants s'additionnent. Un fonds qui a un compte que les autres n'ont
  // pas garde sa colonne, avec les autres fonds à zéro — c'est l'information
  // utile, pas un trou à masquer.
  const parCle = new Map<string, PointTresorerie["etablissements"][number]>();
  for (const p of points) for (const e of p.etablissements) if (!parCle.has(e.cle)) parCle.set(e.cle, e);

  const etablissements = [...parCle.values()].sort(
    (a, b) =>
      rangGroupe(a.groupe) - rangGroupe(b.groupe) ||
      a.pays.localeCompare(b.pays, "fr") ||
      a.nom.localeCompare(b.nom, "fr") ||
      a.sens.localeCompare(b.sens, "fr"),
  );
  const banques = etablissements.map((e) => e.cle);

  const actifNet = points.reduce((s, p) => s + (p.actifNet ?? 0), 0);

  // ── Lignes ──────────────────────────────────────────────────────────────
  const lignes: LigneTresorerie[] = LIGNES_POINT_TRESORERIE.map((def) => {
    const source = points[0].lignes.find((l) => l.libelle === def.libelle);

    // LES RATIOS NE S'ADDITIONNENT PAS. Un pourcentage d'actif net consolidé
    // se recalcule sur le cumul, sinon on sommerait des fractions de
    // dénominateurs différents — une erreur qui grandit avec l'écart de taille
    // entre les fonds.
    if (def.nature === "pourcentage") {
      const cible = def.libelle.startsWith("Solde réél") ? "SOLDEREEL" : "SOLDETHEORIQUE";
      const cumul = points.reduce((s, p) => {
        const l = p.lignes.find((x) => x.libelle === cible);
        return s + (l?.total ?? 0);
      }, 0);
      return {
        libelle: def.libelle,
        nature: def.nature,
        source: def.source,
        parBanque: Object.fromEntries(banques.map((b) => [b, null])),
        total: actifNet > 0 ? cumul / actifNet : null,
      };
    }

    const parBanque: Record<string, number | null> = {};
    for (const b of banques) {
      let somme = 0;
      let vue = false;
      for (const p of points) {
        const v = p.lignes.find((l) => l.libelle === def.libelle)?.parBanque[b];
        if (typeof v === "number") {
          somme += v;
          vue = true;
        }
      }
      // Une colonne qu'AUCUN fonds ne renseigne reste vide, comme dans le
      // classeur : un zéro affirmerait un solde nul là où il n'y a pas de
      // compte.
      parBanque[b] = vue ? somme : null;
    }

    const total = points.reduce((s, p) => {
      const l = p.lignes.find((x) => x.libelle === def.libelle);
      return s + (l?.total ?? 0);
    }, 0);

    return {
      libelle: def.libelle,
      nature: def.nature,
      source: source?.source ?? def.source,
      parBanque,
      total,
    };
  });

  const soldesInventaire: Record<string, number> = {};
  for (const b of banques) {
    soldesInventaire[b] = points.reduce((s, p) => s + (p.soldesInventaire[b] ?? 0), 0);
  }

  // Les dates diffèrent d'un fonds à l'autre : on retient la PLUS RÉCENTE et
  // l'écran dit qu'il s'agit d'une consolidation. Inventer une date commune
  // aurait laissé croire à un arrêté simultané.
  const plusRecente = (xs: (string | null)[]) =>
    xs.filter((x): x is string => !!x).sort().pop() ?? null;

  return {
    fondsId: FONDS_GLOBAL,
    fonds: `Consolidé — ${points.length} fonds`,
    dateFin: plusRecente(points.map((p) => p.dateFin)),
    banques,
    actifNet: actifNet > 0 ? actifNet : null,
    dateInventaire: plusRecente(points.map((p) => p.dateInventaire)),
    lignes,
    // LA CONSOLIDATION SOMME LES MONTANTS, PAS LES CALCULS.
    //
    // Chaque fonds a son taux, son actif net et son compte de prélèvement :
    // une « moyenne d'actif net consolidée » ne voudrait rien dire, et un taux
    // commun encore moins. On additionne donc les montants et on efface le
    // détail plutôt que d'afficher un recoupement qui ne se recoupe pas.
    fraisGestion: {
      mois: points[0].fraisGestion.mois,
      taux: 0,
      actifNetMoyen: 0,
      points: 0,
      du: "",
      au: "",
      montant: points.reduce((s, p) => s + p.fraisGestion.montant, 0),
      provisoire: points.some((p) => p.fraisGestion.provisoire),
      indisponible: null,
      compte: "",
      applique: points.every((p) => p.fraisGestion.applique),
    },
    postesAAlimenter: points[0].postesAAlimenter,
    etablissements,
    soldesInventaire,
    // Les anomalies de chaque fonds sont CONSERVÉES et préfixées de son nom :
    // les fondre en une liste anonyme aurait rendu chacune introuvable.
    comptesNonRattaches: points.flatMap((p) =>
      p.comptesNonRattaches.map((c) => ({ ...c, libelle: `${p.fonds} · ${c.libelle}` })),
    ),
    soldesSaisisLe: plusRecente(points.map((p) => p.soldesSaisisLe)),
    operationsSansColonne: points.flatMap((p) =>
      p.operationsSansColonne.map((o) => ({ ...o, libelle: `${p.fonds} · ${o.libelle}` })),
    ),
    operationsNonDenouees: points.flatMap((p) =>
      p.operationsNonDenouees.map((o) => ({ ...o, libelle: `${p.fonds} · ${o.libelle}` })),
    ),
    remeresAVenir: points.flatMap((p) =>
      p.remeresAVenir.map((o) => ({ ...o, libelle: `${p.fonds} · ${o.libelle}` })),
    ),
    // LA SAISIE RESTE PAR FONDS, même en consolidé : un flux appartient à un
    // portefeuille, et les formulaires écrivent avec un `fundId`. La vue
    // consolidée les additionne dans le tableau mais n'ouvre pas la saisie —
    // d'où ces deux listes vides, qui referment les boutons.
    fluxSaisis: [],
    spots: [],
    nivellements: [],
    // Le calendrier ESV se lit fonds par fonds : le CUMULER perdrait la seule
    // chose qui compte, quel depositaire doit encaisser quoi. On conserve les
    // titres sans echeancier, qui sont une anomalie a corriger.
    calendrierEsv: {
      evenements: [],
      dateInventaire: plusRecente(points.map((p) => p.calendrierEsv.dateInventaire)),
      sansEcheancier: points.flatMap((p) =>
        p.calendrierEsv.sansEcheancier.map((t) => `${p.fonds} · ${t}`),
      ),
      actionsSansAvis: points.flatMap((p) =>
        p.calendrierEsv.actionsSansAvis.map((t) => `${p.fonds} · ${t}`),
      ),
      // Le même avis orphelin remonte de chaque fonds : il vient du BOC, pas
      // du portefeuille. On dédoublonne plutôt que de le répéter autant de
      // fois qu'il y a de fonds.
      avisNonRattaches: [
        ...new Set(points.flatMap((p) => p.calendrierEsv.avisNonRattaches)),
      ],
    },
    spotsAVenir: points.flatMap((p) =>
      p.spotsAVenir.map((s) => ({ ...s, libelle: `${p.fonds} · ${s.libelle}` })),
    ),
    ordresPerimes: points.flatMap((p) =>
      p.ordresPerimes.map((o) => ({ ...o, libelle: `${p.fonds} · ${o.libelle}` })),
    ),
  };
}

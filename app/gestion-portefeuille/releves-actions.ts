"use server";

// === « Lire relevé » : l'action derrière le bouton ===
//
// ELLE NE REMPLIT AUCUNE CASE ET N'ENREGISTRE RIEN. Elle lit le dossier le
// plus récent, rattache ce qu'elle peut, et rend le tout — ce qui tombe dans
// une case et ce qui n'y tombe pas, avec la raison. C'est l'écran qui montre,
// le gérant qui applique, et le bouton « Enregistrer » qui écrit.
//
// Un solde à huit chiffres posé sans qu'on l'ait vu passer n'est pas une
// automatisation : c'est une erreur en attente du mois suivant.

import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import { loadMyFunds } from "./data";
import { lireReleves, type LectureReleves } from "./releves-data";
import { chargerPoints, construireGrille } from "./tresorerie-grille";

export async function lireRelevesAction(
  dateEngagements?: string | null,
  dossierVoulu?: string,
): Promise<ActionResult<LectureReleves>> {
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const fonds = await loadMyFunds();
  if (fonds.length === 0) {
    return { ok: false, error: "Aucun fonds géré : il n'y a aucune ligne où poser un solde." };
  }

  // LA GRILLE EST LA CIBLE, donc elle se construit avant la lecture : elle dit
  // quelles colonnes existent, quelles lignes existent, et quels croisements
  // sont barrés. Rattacher un relevé sans elle, c'est proposer des cases qui
  // n'existent pas.
  const grille = construireGrille(await chargerPoints(fonds, dateEngagements ?? null));

  const lu = await lireReleves(process.cwd(), grille, dossierVoulu);
  if ("erreur" in lu) return { ok: false, error: lu.erreur };
  return { ok: true, data: lu };
}

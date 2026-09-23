import PartsPanel from "@/components/gestion-portefeuille/PartsPanel";

import { loadMyFunds } from "../data";
import { loadTousFluxParts } from "../parts-data";
import { loadDernieresVl } from "../nav-data";
import { listerPartenairesAction } from "../partenaires-actions";
import { construirePointTresorerie } from "../tresorerie-data";

export const metadata = {
  title: "Souscriptions et rachats — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

/**
 * Écran INTERFONDS des souscriptions et rachats de parts.
 *
 * Hors de la fiche d'un fonds, délibérément : une collecte se saisit par
 * bordereau, et un même bureau place sur plusieurs fonds le même jour. Le
 * fonds est donc une colonne de la saisie, pas le contexte de la page.
 *
 * La garde `requireAdmin(1)` du layout couvre cette route ; les actions
 * serveur ont la leur.
 */
export default async function SouscriptionsRachatsPage() {
  const [fonds, lecture, partenaires] = await Promise.all([
    loadMyFunds(),
    loadTousFluxParts(),
    listerPartenairesAction("client"),
  ]);
  const { lignes: flux, erreur: erreurFlux } = lecture;

  // Les clients SENSIBLES viennent du référentiel des partenaires : les
  // retaper à chaque bordereau faisait diverger leur nom d'une ligne à
  // l'autre, et tout regroupement par client devenait faux.
  const clientsSensibles = partenaires.ok
    ? partenaires.data.filter((p) => p.actif)
    : [];

  // Comptes du PREMIER fonds seulement : c'est celui que le formulaire
  // présente d'emblée. Les résoudre ici évite au client un aller-retour au
  // montage — et surtout un setState dans un effet, que le lint interdit.
  const premier = fonds[0];
  const [point, navs] = await Promise.all([
    premier ? construirePointTresorerie(premier.id, "") : null,
    premier ? loadDernieresVl(premier.id, 200) : [],
  ]);
  const comptesInitiaux = (point?.etablissements ?? []).map((e) => ({
    cle: e.cle,
    nom: e.nom,
  }));

  // Les VL publiées, la plus récente d'abord. Plafonnées à deux cents : un
  // fonds valorisé quotidiennement en accumule plusieurs milliers, et une
  // liste déroulante de plusieurs milliers d'entrées ne se parcourt pas.
  // LA VL LA PLUS RÉCENTE DE CHAQUE FONDS, pas seulement du premier : le suivi
  // des clients sensibles mesure la performance depuis l'entrée, et ses lignes
  // couvrent tous les portefeuilles. Une lecture par fonds, en parallèle.
  const historiques = await Promise.all(
    // UNE SEULE VL PAR FONDS SUFFIT : on mesure contre la dernière connue.
    fonds.map(async (f) => [f.id, await loadDernieresVl(f.id, 1)] as const),
  );
  const vlCourantes: Record<string, { date: string; vl: number }> = {};
  for (const [id, points] of historiques) {
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      if (p.vl != null && p.vl > 0) {
        vlCourantes[id] = { date: p.date, vl: p.vl };
        break;
      }
    }
  }

  // VL À LA SORTIE, pour les positions déjà closes.
  //
  // Mesurer une position fermée contre la VL d'aujourd'hui lui prêterait une
  // performance qu'elle n'a pas vécue : le client est parti avant. On retient
  // donc, pour chaque souscription dont l'échéance est PASSÉE, la dernière VL
  // publiée à cette date-là.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const parFonds = new Map(historiques);
  const vlSorties: Record<string, { date: string; vl: number }> = {};
  for (const f of flux) {
    if (!f.dateFin || f.dateFin > aujourdhui) continue;
    const points = parFonds.get(f.fondsId) ?? [];
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      if (p.vl != null && p.vl > 0 && p.date <= f.dateFin) {
        vlSorties[f.id] = { date: p.date, vl: p.vl };
        break;
      }
    }
  }

  const vlsInitiales = navs
    .flatMap((p) => (p.vl != null && p.vl > 0 ? [{ date: p.date, vl: p.vl }] : []))
    .reverse()
    .slice(0, 200);

  return (
    <PartsPanel
      fonds={fonds.map((f) => ({
        id: f.id,
        nom: f.nom,
        // Les droits du fonds, repris par défaut à la saisie. Stockés en
        // décimal comme partout dans le module.
        droitEntree: Number(f.droitEntree) || 0,
        droitSortie: Number(f.droitSortie) || 0,
      }))}
      flux={flux}
      comptesInitiaux={comptesInitiaux}
      vlsInitiales={vlsInitiales}
      vlCourantes={vlCourantes}
      vlSorties={vlSorties}
      erreurFlux={erreurFlux}
      clientsSensibles={clientsSensibles}
    />
  );
}

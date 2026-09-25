// === Lecture du marché des OPCVM pour l'analyse de place ===
//
// SERVEUR UNIQUEMENT. On s'appuie sur le calculateur du screener FCP plutôt
// que de refaire les fenêtres de performance : elles sont subtiles — la VL de
// référence est la dernière AVANT la borne, la performance à trois ans est
// annualisée quand les autres sont cumulées — et deux implémentations
// finiraient par se contredire d'un écran à l'autre.
//
// Les 35 000 VL historiques ne partent pas au navigateur : on n'en transmet
// que les performances calculées et la série TRIMESTRIELLE d'actif net, seule
// à porter un encours.

import { loadFunds } from "@/lib/fcp";
import { buildFcpScreenerPayload } from "@/lib/screeners/fcp";

import type { LigneFcp, PointActif } from "./analyse-fcp-types";

/** Les performances du screener sont des décimales ; ici, des pourcentages. */
const enPourcent = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : v * 100;

export type DonneesFcp = {
  lignes: LigneFcp[];
  /** Trimestre de référence des actifs nets. */
  trimestreReference: string;
  /** Dernière VL connue sur l'ensemble du marché. */
  derniereVl: string;
};

let _cache: DonneesFcp | null = null;

export function chargerFcp(): DonneesFcp {
  if (_cache !== null) return _cache;

  const payload = buildFcpScreenerPayload();
  const fonds = new Map(loadFunds().map((f) => [f.id, f]));

  const lignes: LigneFcp[] = payload.rows.map((r) => {
    const f = fonds.get(r.id);
    const historique: PointActif[] = (f?.observations ?? [])
      .filter((o) => o.kind === "quarter" && o.aum !== null && o.aum > 0)
      .map((o) => ({ trimestre: o.date, actifNet: o.aum as number }));

    return {
      id: r.id,
      nom: r.nom,
      gestionnaire: r.gestionnaire,
      categorie: r.categorie,
      type: r.type,
      actifNet: r.aumAtRef,
      vl: f?.latestVL?.vl ?? null,
      dateVl: r.latestVLDate,
      perimee: r.isStale,
      cadence: r.cadence,
      age: r.ageYears,
      // Le niveau de risque n'est retenu que s'il est PUBLIÉ. Le déduire de la
      // catégorie — « obligataire, donc 2 sur 7 » — produirait un chiffre
      // d'apparence officielle qu'aucune société de gestion n'a signé.
      risque: f?.risque?.niveau ?? null,
      risqueEchelle: f?.risque?.echelleMax ?? null,
      perf: {
        ytd: enPourcent(r.perf.ytd),
        m3: enPourcent(r.perf.m3),
        m6: enPourcent(r.perf.m6),
        a1: enPourcent(r.perf.y1),
        a3: enPourcent(r.perf.y3),
      },
      historique,
    };
  });

  _cache = {
    lignes,
    trimestreReference: payload.refQuarter,
    derniereVl: payload.latestVLGlobal,
  };
  return _cache;
}

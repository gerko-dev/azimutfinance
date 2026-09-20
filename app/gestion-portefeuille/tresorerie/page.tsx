import TresoreriePanel from "@/components/gestion-portefeuille/TresoreriePanel";
import SelecteurFonds from "@/components/gestion-portefeuille/SelecteurFonds";
import DateEngagements from "@/components/gestion-portefeuille/DateEngagements";

import { loadMyFunds } from "../data";
import { FONDS_GLOBAL, construirePointGlobal } from "../tresorerie-global";
import { chargerPoints, construireGrille } from "../tresorerie-grille";

export const metadata = {
  title: "Gestion de trésorerie — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Point de trésorerie, INTERFONDS.
 *
 * Deux réglages, tous deux dans l'URL plutôt que dans un état React : la page
 * est rendue au serveur, et l'URL rend la vue partageable et rechargeable —
 * un point qu'on envoie à un collègue doit s'ouvrir sur le même périmètre et
 * la même date.
 *
 *   ?fonds=<id|global>      le périmètre
 *   ?engagements=AAAA-MM-JJ jusqu'où les flux sont pris en compte
 */
export default async function TresoreriePage({
  searchParams,
}: {
  searchParams: Promise<{ fonds?: string; engagements?: string }>;
}) {
  const { fonds: choix, engagements } = await searchParams;
  const dateEngagements = engagements && EST_DATE.test(engagements) ? engagements : null;

  const fonds = await loadMyFunds();
  const options = fonds.map((f) => ({ id: f.id, nom: f.nom }));

  const fondsChoisi = options.find((f) => f.id === choix);
  const global = !fondsChoisi;

  // Les points de TOUS les fonds sont calculés dans les deux cas : la grille
  // de saisie est multi-fonds par nature — un relevé bancaire porte les
  // comptes de tous les portefeuilles — et il faut donc connaître, pour chaque
  // fonds, les établissements où il détient un compte.
  const points = await chargerPoints(options, dateEngagements);
  const grille = construireGrille(points);

  const point = global
    ? await construirePointGlobal(options, dateEngagements)
    : (points.find((p) => p.fondsId === fondsChoisi.id) ?? null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Gestion de trésorerie</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {global ? `Consolidé sur ${points.length} fonds` : fondsChoisi.nom}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <DateEngagements valeur={point?.dateFin ?? ""} />
          <SelecteurFonds
            fonds={options}
            valeur={global ? FONDS_GLOBAL : fondsChoisi.id}
            valeurGlobale={FONDS_GLOBAL}
            libelleGlobal="Tous les fonds (consolidé)"
          />
        </div>
      </div>

      <TresoreriePanel point={point} grille={grille} />
    </div>
  );
}

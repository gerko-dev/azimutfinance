import RatiosPanel from "@/components/gestion-portefeuille/RatiosPanel";
import SelecteurFonds from "@/components/gestion-portefeuille/SelecteurFonds";

import { loadMyFunds } from "../data";
import { construireTableauRatios } from "../ratios-data";

export const metadata = {
  title: "Ratios — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

/** Valeur conventionnelle du périmètre consolidé. */
const FONDS_GLOBAL = "global";

/**
 * Surveillance des ratios, INTERFONDS.
 *
 * Le périmètre vit dans l'URL plutôt que dans un état React : la page est
 * rendue au serveur, et l'URL rend la vue partageable — un écart qu'on envoie
 * à un collègue doit s'ouvrir sur le même fonds.
 *
 *   ?fonds=<id|global>
 *
 * La garde `requireAdmin(1)` du layout couvre cette route.
 */
export default async function RatiosPage({
  searchParams,
}: {
  searchParams: Promise<{ fonds?: string }>;
}) {
  const { fonds: choix } = await searchParams;
  const fonds = await loadMyFunds();
  const options = fonds.map((f) => ({ id: f.id, nom: f.nom }));

  const fondsChoisi = fonds.find((f) => f.id === choix);
  const global = !fondsChoisi;

  // TOUS LES FONDS DE FRONT sur le consolidé : chaque tableau lit l'inventaire
  // de son fonds, et les enchaîner ferait payer une latence réseau par fonds.
  const tableaux = await Promise.all(
    (global ? fonds : [fondsChoisi]).map(construireTableauRatios),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Ratios</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {global
              ? "Ce qui sort des bornes, tous fonds confondus. Choisis un fonds pour voir le détail de ses ratios."
              : "Les ratios paramétrés sur ce fonds, confrontés à son dernier inventaire."}
          </p>
        </div>
        <SelecteurFonds
          fonds={options}
          valeur={fondsChoisi?.id ?? FONDS_GLOBAL}
          valeurGlobale={FONDS_GLOBAL}
          libelleGlobal="Tous les fonds"
        />
      </div>

      <RatiosPanel tableaux={tableaux} global={global} />
    </div>
  );
}

import TresoreriePanel from "@/components/gestion-portefeuille/TresoreriePanel";
import SelecteurFonds from "@/components/gestion-portefeuille/SelecteurFonds";

import { loadMyFunds } from "../data";
import { construirePointTresorerie } from "../tresorerie-data";
import { FONDS_GLOBAL, construirePointGlobal } from "../tresorerie-global";

export const metadata = {
  title: "Gestion de trésorerie — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

/**
 * Point de trésorerie, INTERFONDS.
 *
 * Le périmètre vit dans l'URL (`?fonds=<id>` ou `?fonds=global`) et non dans
 * un état React : la page est rendue au serveur, et le passer par l'URL rend
 * la vue partageable et rechargeable — un point qu'on envoie à un collègue
 * doit s'ouvrir sur le même fonds.
 *
 * La consolidation s'ouvre par DÉFAUT : c'est la vue du trésorier de la
 * société de gestion, qui regarde d'abord ce qu'il a en banque au total.
 */
export default async function TresoreriePage({
  searchParams,
}: {
  searchParams: Promise<{ fonds?: string }>;
}) {
  const { fonds: choix } = await searchParams;
  const fonds = await loadMyFunds();
  const options = fonds.map((f) => ({ id: f.id, nom: f.nom }));

  const fondsChoisi = options.find((f) => f.id === choix);
  const global = !fondsChoisi;

  const point = global
    ? await construirePointGlobal(options)
    : await construirePointTresorerie(fondsChoisi.id, fondsChoisi.nom);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Gestion de trésorerie</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {global
              ? `Consolidé sur ${options.length} fonds. Les soldes se saisissent fonds par fonds.`
              : fondsChoisi.nom}
          </p>
        </div>
        <SelecteurFonds
          fonds={options}
          valeur={global ? FONDS_GLOBAL : fondsChoisi.id}
          valeurGlobale={FONDS_GLOBAL}
          libelleGlobal="Tous les fonds (consolidé)"
        />
      </div>

      <TresoreriePanel point={point} lectureSeule={global} />
    </div>
  );
}

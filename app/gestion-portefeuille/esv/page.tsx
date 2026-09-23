import EsvPanel from "@/components/gestion-portefeuille/EsvPanel";
import SelecteurFonds from "@/components/gestion-portefeuille/SelecteurFonds";

import { loadMyFunds } from "../data";
import { construireCalendrierEsv } from "../esv-data";
import { comptesReglementAction } from "../operations-marche-actions";

export const metadata = {
  title: "ESV — Gestion de portefeuille",
};

export const dynamic = "force-dynamic";

/**
 * ESV — événements sur valeurs.
 *
 * Ce que le portefeuille va rapporter, et quand. Le module répond à une
 * question que rien ne posait jusqu'ici : un coupon qui NE TOMBE PAS ne se
 * remarque pas. Il n'y a pas d'avis d'opéré pour un encaissement qui n'arrive
 * pas, et sans calendrier confronté aux titres détenus, l'oubli se découvre au
 * rapprochement bancaire, des semaines plus tard.
 *
 * PAR FONDS, et non interfonds : l'échéancier se lit portefeuille par
 * portefeuille — c'est le dépositaire de CE fonds qui encaisse, et c'est sur
 * SES quantités que le montant se calcule. Le fonds vit dans l'URL, ce qui
 * rend la vue partageable.
 */
export default async function EsvPage({
  searchParams,
}: {
  searchParams: Promise<{ fonds?: string }>;
}) {
  const { fonds: choix } = await searchParams;
  const fonds = await loadMyFunds();
  const options = fonds.map((f) => ({ id: f.id, nom: f.nom }));

  // À défaut de choix, le premier fonds : un calendrier vide n'apprend rien.
  const choisi = fonds.find((f) => f.id === choix) ?? fonds[0] ?? null;

  const [calendrier, comptes] = choisi
    ? await Promise.all([
        construireCalendrierEsv(choisi.id),
        // Les colonnes du point de trésorerie : c'est sur l'une d'elles que
        // l'encaissement se pointe, et il faut que la clef soit LA MÊME des
        // deux côtés, sinon le montant n'atterrit dans aucune colonne.
        comptesReglementAction(choisi.id),
      ])
    : [null, null];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            ESV — événements sur valeurs
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Coupons, dividendes et tombées de capital des titres détenus. Pointe
            ce qui est encaissé ; ce qui ne l&apos;est pas ressort en rouge.
          </p>
        </div>
        {options.length > 0 && (
          <SelecteurFonds
            fonds={options}
            valeur={choisi?.id ?? ""}
            /* Pas de vue consolidée : un échéancier appartient à un
               portefeuille, et le mélanger effacerait la seule chose qui
               compte — quelle banque doit encaisser quoi. */
            valeurGlobale={choisi?.id ?? ""}
            libelleGlobal={choisi?.nom ?? "—"}
          />
        )}
      </div>

      {choisi && calendrier ? (
        <EsvPanel
          fondsId={choisi.id}
          fondsNom={choisi.nom}
          calendrier={calendrier}
          comptes={comptes?.ok ? comptes.data : []}
        />
      ) : (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-6 text-center">
          Aucun fonds enregistré. Crée-le dans Paramètres › Fonds gérés.
        </p>
      )}
    </div>
  );
}

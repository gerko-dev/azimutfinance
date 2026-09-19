/**
 * Squelette de la liste des fonds gérés.
 *
 * Même raison que pour la fiche : une navigation App Router n'allume aucun
 * indicateur du navigateur. Cet écran lit les fonds du gérant en base, donc il
 * n'est jamais instantané.
 */
export default function ChargementListeFonds() {
  return (
    <div className="p-4 md:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement des fonds gérés…</span>
      <div className="h-7 w-56 bg-slate-200 rounded animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="h-4 w-40 bg-slate-200 rounded animate-pulse" />
            <div className="h-3 w-20 bg-slate-200 rounded animate-pulse mt-2" />
            <div className="h-6 w-32 bg-slate-200 rounded animate-pulse mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

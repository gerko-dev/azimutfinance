/**
 * Squelette de repli pour TOUT LE SITE.
 *
 * Next remonte au `loading.tsx` le plus proche : posé à la racine de `app/`,
 * celui-ci couvre chaque page qui n'en possède pas un plus spécifique. C'est
 * ce qui garantit qu'aucune navigation ne reste sans retour visible — une
 * navigation App Router ne charge pas de document, donc le navigateur
 * n'allume ni la roue de l'onglet ni sa barre de progression.
 *
 * Il reste volontairement NEUTRE : un titre, quelques cartes, un tableau.
 * C'est la forme que prennent la plupart des écrans du site, et un squelette
 * trop typé jurerait partout ailleurs. Les sections dont la mise en page
 * s'en éloigne — /pros, /admin, la fiche d'un fonds — ont le leur, qui prend
 * le pas sur celui-ci.
 */
function Barre({ className = "" }: { className?: string }) {
  return <div className={`bg-slate-200/80 rounded animate-pulse ${className}`} />;
}

export default function Chargement() {
  return (
    <div
      className="max-w-7xl mx-auto px-4 py-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Chargement de la page…</span>

      <Barre className="h-7 w-64 max-w-full" />
      <Barre className="h-4 w-40 mt-3" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-slate-200 rounded-lg p-4">
            <Barre className="h-3 w-24" />
            <Barre className="h-6 w-28 mt-3" />
          </div>
        ))}
      </div>

      <div className="border border-slate-200 rounded-lg mt-6 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0"
          >
            <Barre className="h-4 flex-1" />
            <Barre className="h-4 w-24 hidden sm:block" />
            <Barre className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

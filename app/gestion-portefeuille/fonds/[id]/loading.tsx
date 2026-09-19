/**
 * Squelette affiché pendant la construction de la fiche d'un fonds.
 *
 * POURQUOI CE FICHIER EXISTE. La fiche lance sept chargements en parallèle et
 * met une dizaine de secondes à répondre. Une navigation App Router ne
 * déclenche aucun indicateur du navigateur — pas de roue dans l'onglet, pas de
 * barre de progression — donc, sans ce fichier, le clic ne produisait
 * strictement rien de visible pendant tout ce temps : la page précédente
 * restait affichée, figée, et le gérant recliquait.
 *
 * Next affiche ce rendu INSTANTANÉMENT, puis le remplace quand la page est
 * prête. La structure reprend celle de la fiche — bandeau, cartes de synthèse,
 * onglets, tableau — pour que la bascule ne déplace rien à l'écran.
 */
function Barre({ className = "" }: { className?: string }) {
  return <div className={`bg-slate-200 rounded animate-pulse ${className}`} />;
}

export default function ChargementFicheFonds() {
  return (
    <div className="p-4 md:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement de la fiche du fonds…</span>

      {/* Bandeau : nom du fonds et repères */}
      <Barre className="h-7 w-72 max-w-full" />
      <Barre className="h-4 w-44 mt-2" />

      {/* Cartes de synthèse */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-lg p-4">
            <Barre className="h-3 w-20" />
            <Barre className="h-6 w-28 mt-3" />
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div className="flex gap-2 mt-6 border-b border-slate-200 pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Barre key={i} className="h-7 w-28" />
        ))}
      </div>

      {/* Tableau */}
      <div className="bg-white border border-slate-200 rounded-lg mt-4 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-3 py-2 border-b border-slate-100 last:border-0">
            <Barre className="h-4 flex-1" />
            <Barre className="h-4 w-24" />
            <Barre className="h-4 w-24" />
            <Barre className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

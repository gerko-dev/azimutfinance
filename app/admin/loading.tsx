/**
 * Squelette de la console d'administration.
 *
 * Toutes ses pages sont dynamiques et interrogent Supabase ; aucune n'est
 * préchargée. Sans ce fichier, passer d'une section à l'autre laissait l'écran
 * précédent figé, sans le moindre signe que quelque chose se passait — une
 * navigation App Router n'allume aucun indicateur du navigateur.
 */
export default function ChargementAdmin() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement de la section…</span>
      <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
      <div className="bg-white border border-slate-200 rounded-lg mt-4 p-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-3 py-2.5 border-b border-slate-100 last:border-0">
            <div className="h-4 flex-1 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-28 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

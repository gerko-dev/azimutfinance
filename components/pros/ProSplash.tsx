/**
 * Visuel du splash screen Pro Terminal.
 *
 * Utilise par :
 *  - app/pros/loading.tsx     : fallback instantanne pendant la transition Next
 *  - components/pros/ProShell : overlay client maintenu 3 secondes minimum
 *
 * `fading` declenche l'animation de sortie via opacity.
 */
export default function ProSplash({ fading = false }: { fading?: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950 transition-opacity duration-500 ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Halo lumineux */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-purple-600/10 blur-3xl" />
      </div>

      {/* Contenu */}
      <div className="relative text-center px-4">
        <div className="text-3xl md:text-5xl font-bold tracking-tight mb-2">
          <span className="text-blue-400">Azimut</span>
          <span className="text-white">Finance</span>
        </div>
        <div className="text-[11px] md:text-xs uppercase tracking-[0.5em] text-purple-400 mb-12">
          Pro Terminal
        </div>

        {/* Spinner double */}
        <div className="flex justify-center mb-8">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-slate-800" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 animate-spin" />
            <div
              className="absolute inset-1.5 rounded-full border-2 border-transparent border-t-purple-400 animate-spin"
              style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
            />
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-[0.4em] text-slate-500 animate-pulse">
          Chargement de l&apos;environnement
        </div>
      </div>
    </div>
  );
}

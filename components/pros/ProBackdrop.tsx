/**
 * Decor de fond pour la zone principale du Pro Terminal.
 * - Filigrane "AzimutFinance" en grand, tres faible opacite
 * - Deux orbes flous bleu/violet pour la profondeur
 * - Grille subtile pour l'aspect "terminal"
 *
 * Pointer-events-none : le fond ne bloque jamais les clics.
 */
export default function ProBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
    >
      {/* Orbes flous */}
      <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-3xl" />
      <div className="absolute bottom-0 -right-32 w-[500px] h-[500px] rounded-full bg-purple-600/10 blur-3xl" />
      <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] rounded-full bg-cyan-500/5 blur-3xl" />

      {/* Grille fine */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.035]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="pro-grid"
            width="36"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 36 0 L 0 0 0 36"
              stroke="white"
              strokeWidth="0.5"
              fill="none"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pro-grid)" />
      </svg>

      {/* Filigrane AzimutFinance, en degrade tres pale */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="text-[14vw] font-bold tracking-tighter whitespace-nowrap leading-none"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(96,165,250,0.10) 0%, rgba(168,85,247,0.10) 50%, rgba(34,211,238,0.10) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            letterSpacing: "-0.04em",
          }}
        >
          AzimutFinance
        </div>
      </div>

      {/* Petite mention "PRO" decorative */}
      <div className="absolute bottom-6 right-6 text-[10px] font-mono tracking-[0.4em] text-slate-700">
        PRO TERMINAL
      </div>
    </div>
  );
}

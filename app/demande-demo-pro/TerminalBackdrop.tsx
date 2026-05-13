/**
 * Visuel d'arriere-plan pour la baniere Pro : mock de Pro Terminal
 * (tickers BRVM + courbe de marche + grille) en pur SVG/CSS, faible
 * opacite pour laisser passer le texte au-dessus.
 *
 * Composant serveur — purement decoratif (aria-hidden), aucune interaction.
 */
export default function TerminalBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none select-none">
      {/* Grille terminal */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Bandeau tickers en haut */}
      <div className="absolute top-0 left-0 right-0 h-7 bg-black/30 border-b border-white/10 overflow-hidden flex items-center px-4 gap-6 text-[10px] font-mono whitespace-nowrap">
        {TICKERS.map((t) => (
          <span key={t.code} className="text-slate-300">
            <span className="text-white/90 font-semibold">{t.code}</span>{" "}
            <span className="tabular-nums">{t.price}</span>{" "}
            <span
              className={
                t.change.startsWith("-") ? "text-rose-400" : "text-emerald-400"
              }
            >
              {t.change}
            </span>
          </span>
        ))}
      </div>

      {/* Carte "graphique" en bas-droite (desktop only) */}
      <div className="hidden md:block absolute bottom-6 right-6 w-[420px] h-[180px] rounded-md border border-white/10 bg-black/25 backdrop-blur-[2px] p-3 overflow-hidden">
        <div className="flex items-baseline justify-between text-[10px] font-mono mb-1">
          <span className="text-emerald-300 font-semibold">BRVMC</span>
          <span className="text-slate-300 tabular-nums">407,11</span>
          <span className="text-emerald-400">+0,82 %</span>
        </div>
        <svg
          viewBox="0 0 400 140"
          preserveAspectRatio="none"
          className="w-full h-[140px]"
        >
          {/* Lignes horizontales de grille */}
          {[0.2, 0.4, 0.6, 0.8].map((p) => (
            <line
              key={p}
              x1="0"
              x2="400"
              y1={140 * p}
              y2={140 * p}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          ))}
          {/* Aire */}
          <path
            d={`${SPARKLINE_PATH} L 400 140 L 0 140 Z`}
            fill="url(#brvmGradient)"
            opacity="0.5"
          />
          {/* Courbe */}
          <path
            d={SPARKLINE_PATH}
            stroke="rgb(110, 231, 183)"
            strokeWidth="1.5"
            fill="none"
          />
          <defs>
            <linearGradient id="brvmGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(110, 231, 183)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="rgb(110, 231, 183)" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Top hausses du jour (desktop only) */}
      <div className="hidden lg:block absolute top-12 right-6 w-[260px] rounded-md border border-white/10 bg-black/25 backdrop-blur-[2px] p-3 text-[10px] font-mono">
        <div className="text-slate-300 mb-1.5 flex justify-between">
          <span>Top hausses · jour</span>
          <span className="text-amber-300">Live</span>
        </div>
        <div className="space-y-0.5">
          {TOP_MOVERS.map((m) => (
            <div key={m.code} className="flex justify-between items-baseline">
              <span className="text-white/90 font-semibold">{m.code}</span>
              <span className="text-slate-400 tabular-nums">{m.price}</span>
              <span className="text-emerald-400 tabular-nums w-14 text-right">
                {m.change}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Cours BRVM realistes (FCFA), bases sur data/titres.csv
const TICKERS = [
  { code: "BRVMC", price: "407,11", change: "+0,82 %" },
  { code: "BRVM30", price: "192,16", change: "+0,31 %" },
  { code: "BRVMPA", price: "281,76", change: "+0,42 %" },
  { code: "SNTS", price: "28 500", change: "+0,18 %" },
  { code: "SGBC", price: "34 980", change: "+0,00 %" },
  { code: "ETIT", price: "29", change: "-3,33 %" },
  { code: "ORAC", price: "14 900", change: "+0,00 %" },
  { code: "ONTBF", price: "2 710", change: "-0,37 %" },
  { code: "PALC", price: "7 700", change: "-3,63 %" },
  { code: "SLBC", price: "37 500", change: "-4,95 %" },
  { code: "EUR/XOF", price: "655,957", change: "+0,00 %" },
  { code: "USD/XOF", price: "601,32", change: "+0,21 %" },
];

const TOP_MOVERS = [
  { code: "ABJC", price: "3 655", change: "+7,55 %" },
  { code: "NEIC", price: "1 580", change: "+7,48 %" },
  { code: "UNXC", price: "2 085", change: "+7,47 %" },
  { code: "UNLC", price: "59 000", change: "+6,31 %" },
  { code: "CFAC", price: "1 595", change: "+2,90 %" },
];

// Courbe pseudo-aleatoire deterministique
const SPARKLINE_PATH =
  "M 0 95 L 20 90 L 40 82 L 60 88 L 80 76 L 100 70 L 120 78 L 140 65 L 160 60 L 180 70 L 200 55 L 220 48 L 240 58 L 260 52 L 280 40 L 300 45 L 320 35 L 340 42 L 360 30 L 380 25 L 400 32";

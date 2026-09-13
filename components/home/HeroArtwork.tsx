// === Illustration du hero ===
//
// Dessin vectoriel, pas un graphique : aucune donnee reelle ici. Les chiffres
// de seance sont portes par les cartes BRVM, plus bas. Ce que la figure
// raconte, c'est l'espace — les huit Etats de l'UEMOA relies en un seul
// marche, places sur leur geographie approximative (Senegal et Guinee-Bissau
// a l'ouest, Mali et Niger au nord, Cote d'Ivoire et le golfe au sud).
//
// Tout est en SVG inline : rien a telecharger, net a toute resolution, et les
// couleurs suivent le theme sans qu'un fichier binaire soit a regenerer le jour
// ou la charte bouge.

type Node = { id: string; x: number; y: number; label: string };

// Grille de 480 x 420. Positions calees sur la geographie reelle de la zone.
const NODES: Node[] = [
  { id: "SN", x: 88, y: 160, label: "Sénégal" },
  { id: "GW", x: 78, y: 222, label: "Guinée-Bissau" },
  { id: "ML", x: 192, y: 126, label: "Mali" },
  { id: "NE", x: 352, y: 124, label: "Niger" },
  { id: "BF", x: 262, y: 208, label: "Burkina Faso" },
  { id: "CI", x: 198, y: 292, label: "Côte d'Ivoire" },
  { id: "TG", x: 286, y: 296, label: "Togo" },
  { id: "BJ", x: 330, y: 282, label: "Bénin" },
];

const BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

// Liens de voisinage : ils dessinent le maillage, pas des frontieres.
const LINKS: [string, string][] = [
  ["SN", "GW"],
  ["SN", "ML"],
  ["ML", "NE"],
  ["ML", "BF"],
  ["BF", "NE"],
  ["BF", "CI"],
  ["BF", "TG"],
  ["BF", "BJ"],
  ["CI", "TG"],
  ["TG", "BJ"],
];

export default function HeroArtwork() {
  return (
    <svg
      viewBox="0 0 480 420"
      className="w-full h-auto max-w-[480px] mx-auto"
      role="img"
      aria-label="Illustration : les huit États de l'Union économique et monétaire ouest-africaine reliés en un marché unique."
    >
      <defs>
        <radialGradient id="haGlow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.30" />
          <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="haLink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="haCurve" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="55%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id="haRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Halo : assied la composition et decolle le dessin du fond sombre. */}
      <ellipse cx="240" cy="200" rx="220" ry="185" fill="url(#haGlow)" />

      {/* Anneaux en perspective : l'orbite d'un marche, pas un globe. */}
      <g stroke="url(#haRing)" fill="none">
        <ellipse cx="240" cy="212" rx="206" ry="76" strokeWidth="1" />
        <ellipse
          cx="240"
          cy="212"
          rx="206"
          ry="76"
          strokeWidth="1"
          transform="rotate(-22 240 212)"
        />
        <ellipse
          cx="240"
          cy="212"
          rx="206"
          ry="76"
          strokeWidth="1"
          transform="rotate(22 240 212)"
        />
      </g>

      {/* Maillage : chaque trait est une route d'echange entre deux Etats. */}
      <g stroke="url(#haLink)" strokeWidth="1.25" strokeLinecap="round">
        {LINKS.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={BY_ID[a].x}
            y1={BY_ID[a].y}
            x2={BY_ID[b].x}
            y2={BY_ID[b].y}
            strokeOpacity="0.45"
          />
        ))}
      </g>

      {/* Courbe ascendante : le fil qui traverse la zone d'ouest en est. */}
      <path
        d="M52 336 C 132 322, 168 262, 236 244 S 344 214, 430 118"
        fill="none"
        stroke="url(#haCurve)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="0"
        opacity="0.9"
      />
      {/* Pointe de la courbe */}
      <g className="az-drift">
        <circle cx="430" cy="118" r="13" fill="#fbbf24" fillOpacity="0.16" />
        <circle cx="430" cy="118" r="4.5" fill="#fbbf24" />
      </g>

      {/* Les huit Etats */}
      <g>
        {NODES.map((n, i) => (
          <g key={n.id}>
            <title>{n.label}</title>
            {/* Halo pulsant, decale noeud par noeud pour eviter le clignotement
                synchrone, qui ferait guirlande. */}
            <circle
              cx={n.x}
              cy={n.y}
              r="16"
              fill="#60a5fa"
              className="az-pulse"
              style={{ animationDelay: `${(i * 0.45).toFixed(2)}s` }}
            />
            <circle
              cx={n.x}
              cy={n.y}
              r="8.5"
              fill="#0b1220"
              stroke="#93c5fd"
              strokeWidth="1.5"
            />
            <circle cx={n.x} cy={n.y} r="3" fill="#bfdbfe" />
            <text
              x={n.x}
              y={n.y - 17}
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="#cbd5e1"
              letterSpacing="0.5"
            >
              {n.id}
            </text>
          </g>
        ))}
      </g>

      {/* Chandeliers discrets, au ras de l'orbite basse. */}
      <g opacity="0.5">
        {[
          { x: 150, h: 26, up: true },
          { x: 166, h: 16, up: false },
          { x: 182, h: 34, up: true },
          { x: 198, h: 20, up: true },
        ].map((c) => (
          <g key={c.x}>
            <line
              x1={c.x}
              x2={c.x}
              y1={368 - c.h - 6}
              y2={368 + 6}
              stroke={c.up ? "#34d399" : "#fb7185"}
              strokeWidth="1"
            />
            <rect
              x={c.x - 3}
              y={368 - c.h}
              width="6"
              height={c.h}
              rx="1.5"
              fill={c.up ? "#34d399" : "#fb7185"}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

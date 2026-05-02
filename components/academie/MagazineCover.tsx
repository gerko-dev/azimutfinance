// Composant server : genere une "couverture" de magazine en SVG inline.
// Pas d'image binaire requise — gradient + masthead + numero + theme.

type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, { w: number; h: number; fontMasthead: number; fontNumber: number; fontTheme: number; fontMonth: number; padding: number }> = {
  sm: { w: 160, h: 220, fontMasthead: 14, fontNumber: 32, fontTheme: 9, fontMonth: 10, padding: 12 },
  md: { w: 220, h: 300, fontMasthead: 18, fontNumber: 44, fontTheme: 11, fontMonth: 12, padding: 16 },
  lg: { w: 320, h: 440, fontMasthead: 26, fontNumber: 60, fontTheme: 14, fontMonth: 16, padding: 22 },
  xl: { w: 420, h: 580, fontMasthead: 34, fontNumber: 80, fontTheme: 18, fontMonth: 20, padding: 28 },
};

export default function MagazineCover({
  number,
  monthLabel,
  theme,
  gradient,
  textTone = "light",
  size = "md",
  className,
}: {
  number: number;
  monthLabel: string;
  theme: string;
  gradient: { from: string; to: string };
  textTone?: "light" | "dark";
  size?: Size;
  className?: string;
}) {
  const dim = SIZES[size];
  const text = textTone === "light" ? "#ffffff" : "#0f172a";
  const subtle = textTone === "light" ? "rgba(255,255,255,0.7)" : "rgba(15,23,42,0.6)";
  const accent = textTone === "light" ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.12)";
  const gradId = `cov-${gradient.from.replace("#", "")}-${gradient.to.replace("#", "")}`;
  const issueLabel = String(number).padStart(2, "0");

  return (
    <svg
      viewBox={`0 0 ${dim.w} ${dim.h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ display: "block" }}
      role="img"
      aria-label={`Couverture du numéro ${issueLabel} — ${monthLabel}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={gradient.from} />
          <stop offset="100%" stopColor={gradient.to} />
        </linearGradient>
        <pattern
          id={`grid-${gradId}`}
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke={accent}
            strokeWidth="0.5"
          />
        </pattern>
      </defs>

      {/* Background gradient */}
      <rect width={dim.w} height={dim.h} fill={`url(#${gradId})`} />
      <rect width={dim.w} height={dim.h} fill={`url(#grid-${gradId})`} opacity="0.45" />

      {/* Cercle decoratif (haut droit) */}
      <circle
        cx={dim.w * 0.85}
        cy={dim.h * 0.18}
        r={dim.h * 0.18}
        fill={accent}
      />
      {/* Cercle decoratif (bas gauche) */}
      <circle
        cx={-dim.w * 0.1}
        cy={dim.h * 0.95}
        r={dim.h * 0.32}
        fill={accent}
        opacity="0.6"
      />

      {/* Top bar : numero + edition */}
      <text
        x={dim.padding}
        y={dim.padding + dim.fontMonth}
        fontSize={dim.fontMonth}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="500"
        fill={subtle}
        letterSpacing="2"
      >
        N° {issueLabel}
      </text>
      <text
        x={dim.w - dim.padding}
        y={dim.padding + dim.fontMonth}
        fontSize={dim.fontMonth}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="500"
        fill={subtle}
        letterSpacing="1"
        textAnchor="end"
      >
        {monthLabel}
      </text>

      {/* Masthead */}
      <text
        x={dim.padding}
        y={dim.h * 0.4}
        fontSize={dim.fontMasthead}
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fill={text}
        letterSpacing="-0.5"
      >
        AZIMUT
      </text>
      <text
        x={dim.padding}
        y={dim.h * 0.4 + dim.fontMasthead * 1.05}
        fontSize={dim.fontMasthead}
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight="400"
        fill={text}
        letterSpacing="-0.5"
        opacity="0.9"
      >
        magazine
      </text>

      {/* Big issue number */}
      <text
        x={dim.padding}
        y={dim.h * 0.7}
        fontSize={dim.fontNumber}
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fill={text}
        letterSpacing="-2"
      >
        {issueLabel}
      </text>

      {/* Theme line — wrap manuel sur 2 lignes max si besoin */}
      <CoverTheme
        theme={theme}
        x={dim.padding}
        y={dim.h - dim.padding - dim.fontTheme - 6}
        fontSize={dim.fontTheme}
        maxWidth={dim.w - dim.padding * 2}
        fill={text}
      />

      {/* Footer thin line */}
      <line
        x1={dim.padding}
        y1={dim.h - dim.padding - 2}
        x2={dim.w - dim.padding}
        y2={dim.h - dim.padding - 2}
        stroke={subtle}
        strokeWidth="1"
      />
    </svg>
  );
}

function CoverTheme({
  theme,
  x,
  y,
  fontSize,
  maxWidth,
  fill,
}: {
  theme: string;
  x: number;
  y: number;
  fontSize: number;
  maxWidth: number;
  fill: string;
}) {
  // Wrap rudimentaire : casse mots si la chaine est longue. Pour les themes
  // Azimut Magazine on a typiquement < 40 chars. On fait simple.
  const words = theme.split(" ");
  const lines: string[] = [];
  let current = "";
  const charWidth = fontSize * 0.55;
  const charsPerLine = Math.floor(maxWidth / charWidth);
  for (const w of words) {
    const candidate = current ? current + " " + w : w;
    if (candidate.length > charsPerLine && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  const visible = lines.slice(0, 2);

  return (
    <>
      {visible.map((line, i) => (
        <text
          key={i}
          x={x}
          y={y - (visible.length - 1 - i) * fontSize * 1.2}
          fontSize={fontSize}
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="500"
          fill={fill}
          opacity="0.95"
        >
          {line}
        </text>
      ))}
    </>
  );
}

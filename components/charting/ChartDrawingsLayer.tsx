"use client";

import type { Drawing } from "@/lib/charting/drawings";
import { FIB_LEVELS } from "@/lib/charting/drawings";

/**
 * Layer SVG des dessins de l'utilisateur, injecte dans un chart Recharts via
 * <Customized component={<ChartDrawingsLayer drawings=... />} />.
 *
 * Recharts injecte automatiquement les props xAxisMap / yAxisMap / offset /
 * width / height qui nous donnent acces aux scales pour convertir
 * (date, valeur) → (x, y) en pixels.
 *
 * Tous les dessins sont rendus dans un <g> unique. Le clic sur un dessin
 * (avec onDeleteDrawing fourni) le supprime.
 */
type Props = {
  drawings: Drawing[];
  onDeleteDrawing?: (id: string) => void;
  // Recharts injecte ces props automatiquement quand utilise dans <Customized>
  xAxisMap?: Record<string, { scale: (v: string) => number | undefined }>;
  yAxisMap?: Record<string, { scale: (v: number) => number | undefined }>;
  offset?: { left: number; top: number; width: number; height: number };
};

export default function ChartDrawingsLayer(props: Props) {
  const { drawings, onDeleteDrawing, xAxisMap, yAxisMap, offset } = props;

  // Recupere les scales : Recharts utilise des cles numeriques (0, 1...) pour
  // les axes. On prend le premier disponible.
  const xAxis = xAxisMap ? Object.values(xAxisMap)[0] : undefined;
  const yAxis = yAxisMap ? Object.values(yAxisMap)[0] : undefined;
  if (!xAxis || !yAxis || !offset) return null;

  const xScale = xAxis.scale;
  const yScale = yAxis.scale;

  // Pour les categories (dates), scale renvoie le centre de bande. Si la date
  // n'existe pas exactement, on cherche la plus proche dans le domaine.
  const xOf = (v: string): number | undefined => xScale(v);
  const yOf = (v: number): number | undefined => yScale(v);

  const left = offset.left;
  const right = offset.left + offset.width;
  const top = offset.top;
  const bottom = offset.top + offset.height;

  return (
    <g pointerEvents="all">
      {drawings.map((d) => {
        const handleClick = (e: React.MouseEvent) => {
          if (!onDeleteDrawing) return;
          e.stopPropagation();
          if (window.confirm("Supprimer ce dessin ?")) {
            onDeleteDrawing(d.id);
          }
        };

        if (d.type === "horizontal") {
          const y = yOf(d.y);
          if (y === undefined) return null;
          return (
            <g key={d.id} className="cursor-pointer" onMouseDown={handleClick}>
              <line
                x1={left}
                y1={y}
                x2={right}
                y2={y}
                stroke={d.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={right - 4}
                y={y - 4}
                fontSize={10}
                textAnchor="end"
                fill={d.color}
                fontFamily="monospace"
              >
                {d.label
                  ? `${d.label} · ${formatTick(d.y)}`
                  : formatTick(d.y)}
              </text>
              {/* Hitbox elargie pour faciliter le clic */}
              <line
                x1={left}
                y1={y}
                x2={right}
                y2={y}
                stroke="transparent"
                strokeWidth={10}
              />
            </g>
          );
        }

        if (d.type === "vertical") {
          const x = xOf(d.x);
          if (x === undefined) return null;
          return (
            <g key={d.id} className="cursor-pointer" onMouseDown={handleClick}>
              <line
                x1={x}
                y1={top}
                x2={x}
                y2={bottom}
                stroke={d.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={x + 3}
                y={top + 12}
                fontSize={10}
                fill={d.color}
                fontFamily="monospace"
              >
                {d.label || d.x}
              </text>
              <line
                x1={x}
                y1={top}
                x2={x}
                y2={bottom}
                stroke="transparent"
                strokeWidth={10}
              />
            </g>
          );
        }

        if (d.type === "trendline") {
          const x1 = xOf(d.x1);
          const x2 = xOf(d.x2);
          const y1 = yOf(d.y1);
          const y2 = yOf(d.y2);
          if ([x1, x2, y1, y2].some((v) => v === undefined)) return null;
          return (
            <g key={d.id} className="cursor-pointer" onMouseDown={handleClick}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={d.color}
                strokeWidth={1.8}
              />
              <circle cx={x1} cy={y1} r={3} fill={d.color} />
              <circle cx={x2} cy={y2} r={3} fill={d.color} />
              {/* Hitbox */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth={12}
              />
            </g>
          );
        }

        if (d.type === "rect") {
          const x1 = xOf(d.x1);
          const x2 = xOf(d.x2);
          const y1 = yOf(d.y1);
          const y2 = yOf(d.y2);
          if ([x1, x2, y1, y2].some((v) => v === undefined)) return null;
          const xMin = Math.min(x1!, x2!);
          const yMin = Math.min(y1!, y2!);
          const w = Math.abs(x2! - x1!);
          const h = Math.abs(y2! - y1!);
          return (
            <g key={d.id} className="cursor-pointer" onMouseDown={handleClick}>
              <rect
                x={xMin}
                y={yMin}
                width={w}
                height={h}
                fill={d.color}
                fillOpacity={0.1}
                stroke={d.color}
                strokeWidth={1.2}
                strokeDasharray="3 2"
              />
            </g>
          );
        }

        if (d.type === "fibonacci") {
          const x1 = xOf(d.x1);
          const x2 = xOf(d.x2);
          const y1 = yOf(d.y1);
          const y2 = yOf(d.y2);
          if ([x1, x2, y1, y2].some((v) => v === undefined)) return null;
          const xLeft = Math.min(x1!, x2!);
          const xRight = Math.max(x1!, x2!);
          // Etend la bande de retracement jusqu'au bord droit du graphique
          const extendRight = right;
          return (
            <g key={d.id} className="cursor-pointer" onMouseDown={handleClick}>
              {FIB_LEVELS.map((level) => {
                const yLevel = d.y1 + (d.y2 - d.y1) * level;
                const yPx = yOf(yLevel);
                if (yPx === undefined) return null;
                const pct = (level * 100).toFixed(1).replace(/\.0$/, "");
                return (
                  <g key={level}>
                    <line
                      x1={xLeft}
                      y1={yPx}
                      x2={extendRight}
                      y2={yPx}
                      stroke={d.color}
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      opacity={0.7}
                    />
                    <text
                      x={extendRight - 4}
                      y={yPx - 3}
                      fontSize={9}
                      textAnchor="end"
                      fill={d.color}
                      fontFamily="monospace"
                    >
                      {pct}% ({formatTick(yLevel)})
                    </text>
                  </g>
                );
              })}
              {/* Trait diagonal entre les 2 points choisis */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={d.color}
                strokeWidth={1.5}
                opacity={0.4}
              />
              <circle cx={x1} cy={y1} r={3} fill={d.color} />
              <circle cx={x2} cy={y2} r={3} fill={d.color} />
            </g>
          );
        }

        if (d.type === "text") {
          const x = xOf(d.x);
          const y = yOf(d.y);
          if (x === undefined || y === undefined) return null;
          return (
            <g key={d.id} className="cursor-pointer" onMouseDown={handleClick}>
              <circle cx={x} cy={y} r={4} fill={d.color} fillOpacity={0.6} />
              <rect
                x={x + 6}
                y={y - 14}
                width={Math.max(40, d.label.length * 6 + 12)}
                height={20}
                fill="white"
                stroke={d.color}
                strokeWidth={1}
                rx={3}
              />
              <text
                x={x + 12}
                y={y}
                fontSize={11}
                fill={d.color}
                fontFamily="sans-serif"
              >
                {d.label}
              </text>
            </g>
          );
        }

        return null;
      })}
    </g>
  );
}

function formatTick(v: number): string {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

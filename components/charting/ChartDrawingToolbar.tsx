"use client";

import type {
  DrawingTool,
  DrawingColor,
} from "@/lib/charting/drawings";
import { DRAWING_COLORS } from "@/lib/charting/drawings";

const TOOLS: { key: DrawingTool; label: string; icon: string; hint: string }[] = [
  { key: "cursor", label: "Curseur", icon: "↖", hint: "Déplacer / supprimer (clic sur dessin)" },
  { key: "horizontal", label: "Horizontale", icon: "─", hint: "Support / résistance — 1 clic sur le prix" },
  { key: "vertical", label: "Verticale", icon: "│", hint: "Marqueur de date — 1 clic sur la date" },
  { key: "trendline", label: "Tendance", icon: "╱", hint: "Ligne oblique — 2 clics" },
  { key: "rect", label: "Zone", icon: "▭", hint: "Rectangle de prix — 2 clics (coins opposés)" },
  { key: "fibonacci", label: "Fibonacci", icon: "𝔽", hint: "Retracement — 2 clics (sommet → creux)" },
  { key: "text", label: "Texte", icon: "T", hint: "Annotation — 1 clic puis saisie" },
];

type Props = {
  activeTool: DrawingTool;
  setActiveTool: (t: DrawingTool) => void;
  activeColor: DrawingColor;
  setActiveColor: (c: DrawingColor) => void;
  onUndo: () => void;
  onClearAll: () => void;
  drawingsCount: number;
  pendingHint?: string;
};

export default function ChartDrawingToolbar({
  activeTool,
  setActiveTool,
  activeColor,
  setActiveColor,
  onUndo,
  onClearAll,
  drawingsCount,
  pendingHint,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 mb-3 rounded-md border border-slate-200 bg-slate-50">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium pr-1">
        Outils
      </span>

      <div className="flex flex-wrap gap-1">
        {TOOLS.map((t) => {
          const isActive = activeTool === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTool(t.key)}
              title={t.hint}
              className={`px-2 py-1 text-xs rounded border transition flex items-center gap-1 ${
                isActive
                  ? "border-blue-500 bg-blue-50 text-blue-800 shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              <span className="font-mono text-sm">{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="ml-2 pl-2 border-l border-slate-200 flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium pr-1">
          Couleur
        </span>
        {DRAWING_COLORS.map((c) => {
          const isActive = activeColor === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setActiveColor(c)}
              aria-label={`Couleur ${c}`}
              className={`w-5 h-5 rounded-full border-2 transition ${
                isActive ? "border-slate-800 scale-110" : "border-white"
              }`}
              style={{ backgroundColor: c }}
            />
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {pendingHint && (
          <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
            {pendingHint}
          </span>
        )}
        <button
          type="button"
          onClick={onUndo}
          disabled={drawingsCount === 0}
          className="text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Supprimer le dernier dessin"
        >
          ↶ Annuler
        </button>
        <button
          type="button"
          onClick={() => {
            if (drawingsCount === 0) return;
            if (window.confirm(`Effacer tous les dessins (${drawingsCount}) ?`)) {
              onClearAll();
            }
          }}
          disabled={drawingsCount === 0}
          className="text-xs px-2 py-1 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Effacer tous les dessins"
        >
          🗑 Tout effacer
        </button>
        {drawingsCount > 0 && (
          <span className="text-[11px] text-slate-500">
            {drawingsCount} dessin{drawingsCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// Types extraits de klinecharts (sans imports statiques pour rester SSR-safe).
// La lib est chargee dynamiquement dans useEffect (touche le DOM/window).
export type OhlcPoint = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

// Types KLineChart instances - on garde une reference faible
// On evite les any propages, mais on s'autorise un cast au montage.
type KLineChartInstance = {
  setSymbol: (s: { ticker: string; pricePrecision: number; volumePrecision?: number }) => void;
  setPeriod: (p: { type: string; span: number }) => void;
  setDataLoader: (dl: {
    getBars: (params: {
      type: "init" | "forward" | "backward" | "update";
      timestamp: number | null;
      callback: (data: OhlcPoint[], more?: boolean) => void;
    }) => void;
  }) => void;
  createIndicator: (
    value: string,
    isStack?: boolean,
    paneOptions?: { id?: string; height?: number },
  ) => string | null;
  removeIndicator: (filter?: { paneId?: string; name?: string; id?: string }) => boolean;
  getIndicators: () => Array<{ name: string; paneId: string }>;
  createOverlay: (value: string) => unknown;
  removeOverlay: (filter?: { name?: string }) => boolean;
  resize: () => void;
};

type KLineChartsModule = {
  init: (
    el: HTMLElement,
    options?: Record<string, unknown>,
  ) => KLineChartInstance | null;
  dispose: (el: HTMLElement) => void;
  getSupportedIndicators: () => string[];
  getSupportedOverlays: () => string[];
  registerLocale: (name: string, locale: Record<string, string>) => void;
};

// === LOCALE FR (mots-cles tooltip / boutons par defaut) ===
const FR_LOCALE: Record<string, string> = {
  open: "Ouverture",
  high: "Plus haut",
  low: "Plus bas",
  close: "Cloture",
  volume: "Volume",
  turnover: "Echange",
  change: "Variation",
  time: "Date",
};

// === GROUPES D'INDICATEURS PROPOSES (sur le pane principal vs sub-pane) ===
const MAIN_INDICATORS = ["MA", "EMA", "SMA", "BBI", "BOLL", "SAR", "BOLL"];
const SUB_INDICATORS = [
  "VOL",
  "MACD",
  "KDJ",
  "RSI",
  "BIAS",
  "BRAR",
  "CCI",
  "DMI",
  "CR",
  "PSY",
  "DMA",
  "TRIX",
  "OBV",
  "VR",
  "WR",
  "MTM",
  "EMV",
  "ROC",
  "PVT",
  "AO",
];

// === OUTILS DE DESSIN PROPOSES ===
const DRAWING_TOOLS: Array<{ name: string; label: string; group: string }> = [
  // Lignes
  { name: "horizontalStraightLine", label: "Horizontale", group: "lines" },
  { name: "verticalStraightLine", label: "Verticale", group: "lines" },
  { name: "straightLine", label: "Droite", group: "lines" },
  { name: "horizontalRayLine", label: "Demi-droite hor.", group: "lines" },
  { name: "rayLine", label: "Demi-droite", group: "lines" },
  { name: "horizontalSegment", label: "Segment hor.", group: "lines" },
  { name: "segment", label: "Segment", group: "lines" },
  { name: "priceLine", label: "Ligne de prix", group: "lines" },
  // Channels
  { name: "parallelStraightLine", label: "Paralleles", group: "channels" },
  { name: "priceChannelLine", label: "Canal de prix", group: "channels" },
  // Fibonacci
  { name: "fibonacciLine", label: "Fibo Retracement", group: "fibonacci" },
  { name: "fibonacciSegment", label: "Fibo Segment", group: "fibonacci" },
  { name: "fibonacciCircle", label: "Fibo Cercles", group: "fibonacci" },
  { name: "fibonacciSpiral", label: "Fibo Spirale", group: "fibonacci" },
  { name: "fibonacciSpeedResistanceFan", label: "Fibo Eventail", group: "fibonacci" },
  { name: "fibonacciExtension", label: "Fibo Extension", group: "fibonacci" },
  // Wave / Elliott
  { name: "threeWaves", label: "3 vagues", group: "wave" },
  { name: "fiveWaves", label: "5 vagues", group: "wave" },
  { name: "eightWaves", label: "8 vagues", group: "wave" },
  { name: "anyWaves", label: "Vagues libres", group: "wave" },
  // Gann
  { name: "xabcdPattern", label: "XABCD", group: "patterns" },
  { name: "abcdPattern", label: "ABCD", group: "patterns" },
  { name: "threeDriversPattern", label: "3 drivers", group: "patterns" },
  { name: "headAndShoulders", label: "Tete & epaules", group: "patterns" },
  { name: "cyclicLines", label: "Cycles", group: "patterns" },
  // Figures
  { name: "rect", label: "Rectangle", group: "shapes" },
  { name: "circle", label: "Cercle", group: "shapes" },
  { name: "triangle", label: "Triangle", group: "shapes" },
  { name: "arc", label: "Arc", group: "shapes" },
  // Annotations
  { name: "simpleAnnotation", label: "Annotation", group: "annotations" },
  { name: "simpleTag", label: "Etiquette", group: "annotations" },
];

const CHART_TYPES = [
  { value: "candle_solid", label: "Bougies" },
  { value: "candle_stroke", label: "Bougies creuses" },
  { value: "candle_up_stroke", label: "Bougies up creuses" },
  { value: "candle_down_stroke", label: "Bougies down creuses" },
  { value: "ohlc", label: "OHLC bars" },
  { value: "area", label: "Aire" },
] as const;
type ChartTypeValue = (typeof CHART_TYPES)[number]["value"];

type Props = {
  data: OhlcPoint[];
  /** Code du symbole (ex "BOAC", "BRVMC") */
  code: string;
  /** Nom long affiche en titre (optionnel) */
  name?: string;
  /** Hauteur en pixels du chart principal (defaut 600) */
  height?: number;
  /** Decimales d'affichage des prix (defaut: auto selon valeur) */
  pricePrecision?: number;
  /** "light" (defaut, fond clair) ou "dark" (Pro Terminal). */
  theme?: "light" | "dark";
};

export default function KlineChart({
  data,
  code,
  name,
  height = 600,
  pricePrecision,
  theme = "light",
}: Props) {
  const isDark = theme === "dark";

  // Palette par theme — alignee sur Tailwind slate/emerald/red.
  const PALETTE = isDark
    ? {
        // Pro Terminal : fond slate-900, accents emerald/red 400.
        background: "#0f172a",
        gridLine: "#1e293b",
        tickText: "#94a3b8",
        axisLine: "#334155",
        crosshair: "#475569",
        upColor: "#34d399",
        downColor: "#f87171",
        toolbarBg: "bg-slate-900",
        toolbarBorder: "border-slate-800",
        toolbarBtnBase: "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700",
        toolbarBtnActive: "border-blue-500 bg-blue-500/10 text-blue-300",
        menuBg: "bg-slate-900 border-slate-700",
        menuItemHover: "hover:bg-slate-800 text-slate-300",
        menuItemActive: "bg-blue-500/10 text-blue-300 font-medium",
        nameText: "text-slate-400",
        rootBg: "bg-slate-900",
      }
    : {
        background: "#ffffff",
        gridLine: "#e2e8f0",
        tickText: "#64748b",
        axisLine: "#cbd5e1",
        crosshair: "#94a3b8",
        upColor: "#16a34a",
        downColor: "#dc2626",
        toolbarBg: "bg-slate-50",
        toolbarBorder: "border-slate-200",
        toolbarBtnBase: "border-slate-300 bg-white text-slate-600 hover:bg-slate-100",
        toolbarBtnActive: "border-blue-500 bg-blue-50 text-blue-800",
        menuBg: "bg-white border-slate-200",
        menuItemHover: "hover:bg-slate-100 text-slate-700",
        menuItemActive: "bg-blue-50 text-blue-800 font-medium",
        nameText: "text-slate-500",
        rootBg: "bg-white",
      };
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<KLineChartInstance | null>(null);
  const moduleRef = useRef<KLineChartsModule | null>(null);

  const [chartType, setChartType] = useState<ChartTypeValue>("candle_solid");
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(
    new Set(["MA", "VOL"]),
  );
  const [activeDrawTool, setActiveDrawTool] = useState<string | null>(null);
  const [showDrawMenu, setShowDrawMenu] = useState(false);
  const [showIndMenu, setShowIndMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Flip a true quand l'init async de klinecharts a termine ; sert de gate
  // pour le useEffect [data] qui repeuple les bougies a chaque changement
  // de periode dans le composant parent.
  const [chartReady, setChartReady] = useState(false);

  // Init chart une fois par symbole. Les changements de data (selecteur de
  // periode parent) sont geres par un useEffect dedie plus bas — sinon on
  // disposerait/recreerait le chart a chaque clic, en perdant indicateurs et
  // dessins de l'utilisateur.
  useEffect(() => {
    let cancelled = false;
    let containerSnapshot: HTMLDivElement | null = null;

    (async () => {
      const klc = (await import("klinecharts")) as unknown as KLineChartsModule;
      if (cancelled || !containerRef.current) return;

      // Locale FR (registerLocale est idempotent)
      try {
        klc.registerLocale("fr-FR", FR_LOCALE);
      } catch {
        /* deja enregistre */
      }

      const chart = klc.init(containerRef.current, {
        styles: {
          // Fond pane principal + sub-panes
          candle: {
            bar: {
              upColor: PALETTE.upColor,
              downColor: PALETTE.downColor,
              upBorderColor: PALETTE.upColor,
              downBorderColor: PALETTE.downColor,
              upWickColor: PALETTE.upColor,
              downWickColor: PALETTE.downColor,
            },
            tooltip: { showRule: "follow_cross" },
            priceMark: {
              high: { color: PALETTE.tickText },
              low: { color: PALETTE.tickText },
              last: {
                upColor: PALETTE.upColor,
                downColor: PALETTE.downColor,
                noChangeColor: PALETTE.tickText,
                line: { dashedValue: [4, 4] },
                text: {
                  color: "#ffffff",
                  backgroundColor: PALETTE.upColor,
                },
              },
            },
          },
          grid: {
            horizontal: { color: PALETTE.gridLine },
            vertical: { color: PALETTE.gridLine },
          },
          xAxis: {
            tickText: { color: PALETTE.tickText },
            axisLine: { color: PALETTE.axisLine },
            tickLine: { color: PALETTE.axisLine },
          },
          yAxis: {
            tickText: { color: PALETTE.tickText },
            axisLine: { color: PALETTE.axisLine },
            tickLine: { color: PALETTE.axisLine },
          },
          crosshair: {
            horizontal: {
              line: { color: PALETTE.crosshair },
              text: {
                color: "#ffffff",
                backgroundColor: PALETTE.axisLine,
              },
            },
            vertical: {
              line: { color: PALETTE.crosshair },
              text: {
                color: "#ffffff",
                backgroundColor: PALETTE.axisLine,
              },
            },
          },
          indicator: {
            tooltip: {
              text: { color: PALETTE.tickText },
            },
          },
        },
      });
      if (!chart) return;

      // Auto-precision prix selon ordre de grandeur
      const sample = data[Math.floor(data.length / 2)]?.close ?? 0;
      const autoPrecision = pricePrecision ?? (sample < 10 ? 2 : sample < 1000 ? 0 : 0);

      chart.setSymbol({
        ticker: code,
        pricePrecision: autoPrecision,
        volumePrecision: 0,
      });
      chart.setPeriod({ type: "day", span: 1 });

      // Indicateurs initiaux — l'alimentation des bougies est faite par le
      // useEffect [data] ci-dessous.
      chart.createIndicator("MA", false, { id: "candle_pane" });
      chart.createIndicator("VOL", false, { id: "vol_pane" });

      moduleRef.current = klc;
      chartRef.current = chart;
      containerSnapshot = containerRef.current;
      // Le state existe juste pour declencher le useEffect data ci-dessous
      // sur le tout premier render (data peut avoir change avant que chart
      // soit pret).
      setChartReady(true);
    })();

    return () => {
      cancelled = true;
      setChartReady(false);
      if (moduleRef.current && containerSnapshot) {
        try {
          moduleRef.current.dispose(containerSnapshot);
        } catch {
          /* ignore */
        }
      }
      chartRef.current = null;
    };
    // `data` est lue uniquement pour calculer la precision prix initiale ;
    // les changements ulterieurs sont propages via le useEffect [data].
    // `theme` change recree le chart pour reappliquer les styles (rare, OK).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, pricePrecision, theme]);

  // Met a jour les bougies a chaque changement de `data`. setDataLoader
  // declenche resetData() puis _processDataLoad('init'), qui rappelle getBars
  // avec la nouvelle closure — la lib repeuple le chart automatiquement.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        if (type === "init") callback(data, false);
        else callback([], false);
      },
    });
    // Recale le viewport sur les dernieres bougies — sinon klinecharts garde
    // la plage visible precedente (qui peut tomber hors des nouvelles donnees).
    if (data.length > 0) {
      try {
        (chart as unknown as {
          scrollToRealTime: (ms?: number) => void;
        }).scrollToRealTime(0);
      } catch {
        /* ignore */
      }
    }
  }, [data, chartReady]);

  // Resize sur fullscreen toggle
  useEffect(() => {
    if (chartRef.current) {
      // Petit delai pour laisser le browser recalculer la taille du container
      const t = window.setTimeout(() => chartRef.current?.resize(), 100);
      return () => window.clearTimeout(t);
    }
  }, [isFullscreen]);

  // === HANDLERS ===
  const applyChartType = useCallback((type: ChartTypeValue) => {
    setChartType(type);
    const chart = chartRef.current;
    if (!chart) return;
    // Pour passer de bougies a aire/ligne on change le style "candle.type"
    const isArea = type === "area";
    const candleType = isArea ? "area" : type;
    try {
      // setStyles existe sur Store interface
      (chart as unknown as { setStyles: (s: Record<string, unknown>) => void }).setStyles({
        candle: { type: candleType },
      });
    } catch {
      /* ignore */
    }
  }, []);

  const toggleIndicator = useCallback((name: string) => {
    const chart = chartRef.current;
    if (!chart) return;
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      const isMain = MAIN_INDICATORS.includes(name);
      const paneId = isMain ? "candle_pane" : `${name.toLowerCase()}_pane`;
      if (next.has(name)) {
        chart.removeIndicator({ name, paneId });
        next.delete(name);
      } else {
        chart.createIndicator(name, false, isMain ? { id: paneId } : { id: paneId });
        next.add(name);
      }
      return next;
    });
  }, []);

  const startDrawing = useCallback((toolName: string) => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.createOverlay(toolName);
    setActiveDrawTool(toolName);
    setShowDrawMenu(false);
  }, []);

  const removeAllOverlays = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (window.confirm("Effacer tous les dessins ?")) {
      chart.removeOverlay();
      setActiveDrawTool(null);
    }
  }, []);

  const removeAllIndicators = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeIndicator();
    setActiveIndicators(new Set());
  }, []);

  return (
    <div
      className={
        isFullscreen
          ? `fixed inset-0 z-50 ${PALETTE.rootBg} p-4 flex flex-col`
          : `relative ${PALETTE.rootBg}`
      }
    >
      {/* TOOLBAR */}
      <div className={`flex flex-wrap items-center gap-2 p-2 mb-2 rounded-md border ${PALETTE.toolbarBorder} ${PALETTE.toolbarBg}`}>
        {/* Type chart */}
        <select
          value={chartType}
          onChange={(e) => applyChartType(e.target.value as ChartTypeValue)}
          className={`text-xs px-2 py-1 rounded border ${PALETTE.toolbarBtnBase}`}
          aria-label="Type de graphique"
        >
          {CHART_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {/* Indicateurs principaux : raccourcis */}
        <div className="flex gap-1">
          {["MA", "EMA", "BOLL", "SAR", "BBI"].map((ind) => (
            <button
              key={ind}
              type="button"
              onClick={() => toggleIndicator(ind)}
              className={`text-xs px-2 py-1 rounded border transition ${
                activeIndicators.has(ind)
                  ? PALETTE.toolbarBtnActive
                  : PALETTE.toolbarBtnBase
              }`}
            >
              {ind}
            </button>
          ))}
        </div>

        {/* Menu indicateurs (sub-pane) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowIndMenu((s) => !s)}
            className={`text-xs px-2 py-1 rounded border ${PALETTE.toolbarBtnBase}`}
          >
            + Oscillateurs ▾
          </button>
          {showIndMenu && (
            <div className={`absolute z-20 mt-1 left-0 ${PALETTE.menuBg} border rounded-md shadow-lg p-2 grid grid-cols-3 gap-1 min-w-[280px] max-h-72 overflow-auto`}>
              {SUB_INDICATORS.map((ind) => (
                <button
                  key={ind}
                  type="button"
                  onClick={() => {
                    toggleIndicator(ind);
                    setShowIndMenu(false);
                  }}
                  className={`text-xs px-2 py-1 rounded text-left ${
                    activeIndicators.has(ind)
                      ? PALETTE.menuItemActive
                      : PALETTE.menuItemHover
                  }`}
                >
                  {ind}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Outils de dessin */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDrawMenu((s) => !s)}
            className={`text-xs px-2 py-1 rounded border ${PALETTE.toolbarBtnBase}`}
          >
            ✎ Dessins ▾
          </button>
          {showDrawMenu && (
            <div className={`absolute z-20 mt-1 left-0 ${PALETTE.menuBg} border rounded-md shadow-lg p-3 min-w-[280px] max-h-96 overflow-auto`}>
              {Object.entries(
                DRAWING_TOOLS.reduce<Record<string, typeof DRAWING_TOOLS>>(
                  (acc, t) => {
                    (acc[t.group] ||= []).push(t);
                    return acc;
                  },
                  {},
                ),
              ).map(([group, tools]) => (
                <div key={group} className="mb-2 last:mb-0">
                  <div className={`text-[10px] uppercase font-semibold ${PALETTE.nameText} mb-1`}>
                    {group}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {tools.map((t) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => startDrawing(t.name)}
                        className={`text-xs px-2 py-1 rounded text-left ${PALETTE.menuItemHover}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <button
          type="button"
          onClick={removeAllIndicators}
          className={`text-xs px-2 py-1 rounded border ${PALETTE.toolbarBtnBase}`}
          title="Effacer tous les indicateurs"
        >
          Reset indics
        </button>
        <button
          type="button"
          onClick={removeAllOverlays}
          className={`text-xs px-2 py-1 rounded border ${
            isDark
              ? "border-red-700/50 bg-red-900/20 text-red-300 hover:bg-red-900/40"
              : "border-red-200 bg-white text-red-600 hover:bg-red-50"
          }`}
          title="Effacer tous les dessins"
        >
          🗑 Dessins
        </button>

        <div className="ml-auto flex items-center gap-2">
          {activeDrawTool && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded border ${
                isDark
                  ? "text-amber-300 bg-amber-900/20 border-amber-700/50"
                  : "text-amber-700 bg-amber-50 border-amber-200"
              }`}
            >
              ✎ {activeDrawTool} : tracez sur le graphique
            </span>
          )}
          {name && (
            <span className={`text-xs hidden md:inline ${PALETTE.nameText}`}>
              {name}
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            className={`text-xs px-2 py-1 rounded border ${PALETTE.toolbarBtnBase}`}
            title="Plein ecran"
          >
            {isFullscreen ? "⛶ Quitter" : "⛶ Plein ecran"}
          </button>
        </div>
      </div>

      {/* CONTAINER CHART */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: isFullscreen ? "calc(100vh - 100px)" : `${height}px`,
          backgroundColor: PALETTE.background,
        }}
      />

      {/* Onclick handler global pour fermer les menus */}
      {(showDrawMenu || showIndMenu) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setShowDrawMenu(false);
            setShowIndMenu(false);
          }}
        />
      )}
    </div>
  );
}

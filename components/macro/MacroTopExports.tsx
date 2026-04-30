// Composant statique (Server Component compatible) — barres horizontales pour
// le top N des produits d'exportation d'un pays UEMOA.

const NUM_FR = new Intl.NumberFormat("fr-FR");

function fmtMds(v: number): string {
  if (!isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} bn`;
  if (Math.abs(v) >= 10_000) return `${NUM_FR.format(Math.round(v))} Mds`;
  return `${v.toFixed(1).replace(".", ",")} Mds`;
}

// Palette stable par produit — couleurs distinctes inter-produits, choisies pour
// que les produits susceptibles de co-apparaitre dans un meme top n'aient pas
// de teintes proches (Or vs Anacarde, Coton vs Zinc vs Caoutchouc, etc.).
const PRODUCT_COLORS: Record<string, string> = {
  Cacao: "#5d3317", // brun chocolat
  Cafe: "#8b5a2b", // brun moyen
  Coton: "#cbd5e1", // gris très clair (fibre cotonneuse)
  "Noix d'anacarde": "#ea580c", // orange profond
  Or: "#facc15", // jaune or vif
  Petrole: "#0f172a", // noir
  Caoutchouc: "#4338ca", // indigo (pneu sombre/blueish)
  Bois: "#166534", // vert forêt
  Zinc: "#64748b", // gris bleuté
  "Acide phosphorique": "#0d9488", // teal
  Uranium: "#65a30d", // vert lime
};

function colorFor(product: string): string {
  return PRODUCT_COLORS[product] ?? "#1d4ed8";
}

export type TopExportEntry = {
  product: string;
  value: number;
  period: string;
};

export default function MacroTopExports({
  top,
  others,
  period,
  emptyLabel = "Pas de décomposition produits disponible pour ce pays.",
}: {
  top: TopExportEntry[];
  others: TopExportEntry | null;
  period: string | null;
  emptyLabel?: string;
}) {
  if (top.length === 0 && !others) {
    return (
      <div className="flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded h-40">
        {emptyLabel}
      </div>
    );
  }

  const all = [...top, ...(others ? [others] : [])];
  const max = Math.max(...all.map((e) => Math.abs(e.value)));
  const totalAll = all.reduce((s, e) => s + Math.max(0, e.value), 0);

  return (
    <div className="space-y-2">
      {top.map((e, i) => {
        const width = max > 0 ? (Math.abs(e.value) / max) * 100 : 0;
        const share = totalAll > 0 ? (e.value / totalAll) * 100 : 0;
        return (
          <div key={e.product} className="text-xs">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-400 tabular-nums w-4 shrink-0">{i + 1}</span>
                <span className="text-slate-800 truncate font-medium">{e.product}</span>
              </span>
              <span className="text-slate-900 tabular-nums shrink-0">
                {fmtMds(e.value)}
                <span className="text-slate-400 ml-1.5">({share.toFixed(0)} %)</span>
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, backgroundColor: colorFor(e.product) }}
              />
            </div>
          </div>
        );
      })}
      {others && (
        <div className="text-xs pt-1 mt-1 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-slate-400 tabular-nums w-4 shrink-0">·</span>
              <span className="text-slate-500 italic truncate">Autres exportations</span>
            </span>
            <span className="text-slate-500 tabular-nums shrink-0">
              {fmtMds(others.value)}
              <span className="text-slate-400 ml-1.5">
                ({totalAll > 0 ? ((others.value / totalAll) * 100).toFixed(0) : 0} %)
              </span>
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-slate-300"
              style={{ width: `${max > 0 ? (Math.abs(others.value) / max) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
      {period && (
        <div className="text-[10px] text-slate-400 text-right pt-1">Données {period}</div>
      )}
    </div>
  );
}

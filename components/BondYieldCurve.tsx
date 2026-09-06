"use client";

import { useMemo, useState, memo } from "react";
import {
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type { ListedBond, ListedBondPrice } from "@/lib/listedBondsTypes";
import { getBondYTMFromLatest } from "@/lib/listedBondsTypes";

// Plafond YTM pour exclure les points aberrants (calculs faussés par cours
// décotés extrêmes ou maturités résiduelles très courtes). 15 % couvre
// largement les signatures les plus risquées de la zone UEMOA.
const YTM_MAX = 0.15;

/** Tranches de maturité servant à construire une courbe observée.
 *  Bornes resserrées sur le court terme, où la structure se joue, et
 *  élargies au-delà de 7 ans où les lignes se raréfient. */
const TRANCHES: { min: number; max: number; label: string }[] = [
  { min: 0, max: 1, label: "< 1 an" },
  { min: 1, max: 2, label: "1–2 ans" },
  { min: 2, max: 3, label: "2–3 ans" },
  { min: 3, max: 5, label: "3–5 ans" },
  { min: 5, max: 7, label: "5–7 ans" },
  { min: 7, max: 10, label: "7–10 ans" },
  { min: 10, max: Infinity, label: "> 10 ans" },
];

/** En dessous, une tranche ne porte pas de point de courbe : la médiane
 *  d'une seule obligation n'est pas une observation de marché, c'est cette
 *  obligation. On l'affiche quand même en nuage, jamais en courbe. */
const MIN_PAR_TRANCHE = 2;

/** Palette des séries comparées. Ordonnée pour rester lisible en superposition
 *  et distinguable en cas d'impression noir et blanc (luminances écartées). */
const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#0891b2",
  "#dc2626",
  "#ca8a04",
  "#4f46e5",
  "#059669",
  "#db2777",
];

type EnrichedForCurve = {
  ytm: number;
  yearsToMaturity: number;
  country: string;
  issuerType: string;
  name: string;
  isin: string;
  code: string;
};

function enrichForCurve(
  bonds: ListedBond[],
  prices: ListedBondPrice[],
): EnrichedForCurve[] {
  const latestByIsin = new Map<string, ListedBondPrice>();
  for (const p of prices) {
    const cur = latestByIsin.get(p.isin);
    if (!cur || p.date > cur.date) latestByIsin.set(p.isin, p);
  }
  return bonds.map((b) => ({
    ytm: getBondYTMFromLatest(b, latestByIsin.get(b.isin) ?? null),
    yearsToMaturity: b.yearsToMaturity,
    country: b.country,
    issuerType: b.issuerType,
    name: b.name,
    isin: b.isin,
    code: b.code ?? "",
  }));
}

function mediane(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Props = {
  bonds: ListedBond[];
  prices: ListedBondPrice[];
  /** Affiche le badge "EXCLUSIVITÉ AZIMUT". Défaut: true. */
  showBadge?: boolean;
};

export default memo(function BondYieldCurve({
  bonds,
  prices,
  showBadge = true,
}: Props) {
  const enriched = useMemo(() => enrichForCurve(bonds, prices), [bonds, prices]);

  /** Points exploitables : maturité et rendement plausibles. */
  const points = useMemo(
    () =>
      enriched.filter(
        (b) => b.yearsToMaturity > 0 && b.ytm > 0 && b.ytm <= YTM_MAX,
      ),
    [enriched],
  );

  const [dimension, setDimension] = useState<"country" | "issuerType">(
    "country",
  );
  const [affichage, setAffichage] = useState<"points" | "courbe" | "les-deux">(
    "les-deux",
  );

  /** Groupes disponibles dans la dimension choisie, du plus fourni au moins
   *  fourni : l'ordre de la palette suit ainsi l'importance des séries. */
  const groupes = useMemo(() => {
    const compte = new Map<string, number>();
    for (const p of points) {
      const k = p[dimension];
      compte.set(k, (compte.get(k) ?? 0) + 1);
    }
    return Array.from(compte.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nom, n], i) => ({ nom, n, couleur: PALETTE[i % PALETTE.length] }));
  }, [points, dimension]);

  /** Sélection courante. Vide = tout afficher : on évite un écran blanc au
   *  changement de dimension, et l'utilisateur retire ce qui l'encombre. */
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const cle = dimension;
  const actifs = useMemo(() => {
    const s = selection[cle];
    if (s === undefined) return groupes.slice(0, 4).map((g) => g.nom);
    return s;
  }, [selection, cle, groupes]);

  function bascule(nom: string) {
    const courant = actifs;
    const suivant = courant.includes(nom)
      ? courant.filter((x) => x !== nom)
      : [...courant, nom];
    setSelection({ ...selection, [cle]: suivant });
  }

  /** Une série par groupe retenu : le nuage brut et la courbe observée.
   *
   *  La courbe n'est pas un ajustement : c'est la MÉDIANE des rendements
   *  constatés dans chaque tranche de maturité, posée à la maturité médiane
   *  de la tranche. Rien n'est extrapolé, rien n'est lissé — une tranche sans
   *  obligation reste un trou. C'est le seul tracé qu'un marché aussi peu
   *  liquide autorise sans inventer de structure.
   *
   *  La médiane plutôt que la moyenne : deux ou trois lignes décotées
   *  suffiraient à déplacer une moyenne calculée sur cinq observations.
   */
  const series = useMemo(() => {
    return groupes
      .filter((g) => actifs.includes(g.nom))
      .map((g) => {
        const sousEnsemble = points.filter((p) => p[dimension] === g.nom);

        const courbe = TRANCHES.map((t) => {
          const dedans = sousEnsemble.filter(
            (p) => p.yearsToMaturity >= t.min && p.yearsToMaturity < t.max,
          );
          if (dedans.length < MIN_PAR_TRANCHE) return null;
          return {
            x: mediane(dedans.map((p) => p.yearsToMaturity)),
            y: mediane(dedans.map((p) => p.ytm * 100)),
            tranche: t.label,
            effectif: dedans.length,
            groupe: g.nom,
          };
        }).filter((v): v is NonNullable<typeof v> => v !== null);

        const ys = sousEnsemble.map((p) => p.ytm * 100);
        const court = courbe.find((c) => c.x < 3);
        const long = [...courbe].reverse().find((c) => c.x >= 7);

        return {
          ...g,
          nuage: sousEnsemble.map((p) => ({
            x: p.yearsToMaturity,
            y: p.ytm * 100,
            name: p.name,
            code: p.code,
            isin: p.isin,
            type: p.issuerType,
            country: p.country,
            groupe: g.nom,
          })),
          courbe,
          medianeGlobale: mediane(ys),
          min: ys.length ? Math.min(...ys) : 0,
          max: ys.length ? Math.max(...ys) : 0,
          // Pente OBSERVÉE entre le court et le long terme, en points de base.
          // Lue sur deux médianes de tranche, pas ajustée.
          pente: court && long ? (long.y - court.y) * 100 : null,
        };
      });
  }, [groupes, actifs, points, dimension]);

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="flex justify-between items-start flex-wrap gap-2 mb-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold">Courbe des taux BRVM</h2>
          <p className="text-xs md:text-sm text-slate-600 mt-1">
            YTM actuariel par maturité résiduelle. Les courbes relient la
            médiane des rendements constatés dans chaque tranche de maturité :
            aucune extrapolation, aucun lissage.
          </p>
        </div>
        {showBadge && (
          <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
            EXCLUSIVITÉ AZIMUT
          </span>
        )}
      </div>

      {/* ---------- CONTROLES ---------- */}
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
            Comparer par
          </span>
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
            {[
              { l: "Pays", v: "country" as const },
              { l: "Type d'émetteur", v: "issuerType" as const },
            ].map((d) => (
              <button
                key={d.v}
                onClick={() => setDimension(d.v)}
                className={`px-3 py-1 rounded transition ${
                  dimension === d.v
                    ? "bg-white shadow-sm font-medium"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {d.l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
            Affichage
          </span>
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
            {[
              { l: "Points", v: "points" as const },
              { l: "Courbe", v: "courbe" as const },
              { l: "Les deux", v: "les-deux" as const },
            ].map((a) => (
              <button
                key={a.v}
                onClick={() => setAffichage(a.v)}
                className={`px-3 py-1 rounded transition ${
                  affichage === a.v
                    ? "bg-white shadow-sm font-medium"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {a.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- SERIES COMPAREES ---------- */}
      <div className="flex flex-wrap gap-2 mb-4">
        {groupes.map((g) => {
          const on = actifs.includes(g.nom);
          return (
            <button
              key={g.nom}
              type="button"
              onClick={() => bascule(g.nom)}
              aria-pressed={on}
              className={`text-xs px-2.5 py-1 rounded-md border transition ${
                on
                  ? "border-slate-300 bg-white text-slate-800"
                  : "border-slate-200 text-slate-400 bg-slate-50 hover:bg-white"
              }`}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                style={{ backgroundColor: on ? g.couleur : "#cbd5e1" }}
              />
              {g.nom}
              <span className="text-slate-400 ml-1">({g.n})</span>
            </button>
          );
        })}
      </div>

      {/* ---------- GRAPHIQUE ---------- */}
      <div className="h-72 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey="x"
              name="Durée"
              unit=" ans"
              stroke="#94a3b8"
              fontSize={11}
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => Number(value).toFixed(1)}
              label={{
                value: "Durée résiduelle (années)",
                position: "bottom",
                offset: 15,
                style: { fontSize: 12, fill: "#64748b" },
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="YTM"
              unit="%"
              stroke="#94a3b8"
              fontSize={11}
              domain={["auto", "auto"]}
              label={{
                value: "YTM (%)",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "#64748b" },
              }}
            />
            <Tooltip
              cursor={false}
              trigger="hover"
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                // Un point de courbe porte `tranche`, un point de nuage `isin`.
                const pt = payload.find((p) => p.payload?.tranche)?.payload;
                if (pt) {
                  return (
                    <div className="bg-white border border-slate-200 rounded-md shadow-md p-3 text-xs">
                      <div className="font-medium mb-1">{pt.groupe}</div>
                      <div className="text-slate-500">{pt.tranche}</div>
                      <div className="mt-1">
                        YTM médian : <b>{Number(pt.y).toFixed(2)}%</b>
                      </div>
                      <div className="text-slate-400 mt-1">
                        {pt.effectif} obligation{pt.effectif > 1 ? "s" : ""} dans
                        la tranche
                      </div>
                    </div>
                  );
                }
                const d = payload.find((p) => p.payload?.isin)?.payload;
                if (!d) return null;
                return (
                  <div className="bg-white border border-slate-200 rounded-md shadow-md p-3 text-xs">
                    <div className="font-medium mb-1">{d.name || d.code}</div>
                    <div className="text-slate-500">{d.code}</div>
                    <div className="mt-1 flex gap-3">
                      <span>
                        Durée : <b>{Number(d.x).toFixed(1)} ans</b>
                      </span>
                      <span>
                        YTM : <b>{Number(d.y).toFixed(2)}%</b>
                      </span>
                    </div>
                    <div className="text-slate-400 mt-1">
                      {d.type} · {d.country}
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              verticalAlign="top"
              height={36}
              wrapperStyle={{ fontSize: "11px" }}
            />

            {affichage !== "courbe" &&
              series.map((g) => (
                <Scatter
                  key={`n-${g.nom}`}
                  name={g.nom}
                  data={g.nuage}
                  fill={g.couleur}
                  fillOpacity={affichage === "les-deux" ? 0.45 : 0.85}
                  legendType={affichage === "les-deux" ? "none" : "circle"}
                  isAnimationActive={false}
                />
              ))}

            {affichage !== "points" &&
              series.map((g) => (
                <Line
                  key={`c-${g.nom}`}
                  type="monotone"
                  dataKey="y"
                  data={g.courbe}
                  name={g.nom}
                  stroke={g.couleur}
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: g.couleur, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  legendType="plainline"
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ---------- TABLEAU DE COMPARAISON ---------- */}
      {series.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs">
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 font-medium">Série</th>
                <th className="text-right py-2 font-medium">Lignes</th>
                <th className="text-right py-2 font-medium">YTM médian</th>
                <th className="text-right py-2 font-medium">Min – max</th>
                <th className="text-right py-2 font-medium">Points de courbe</th>
                <th className="text-right py-2 font-medium">Pente observée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {series.map((g) => (
                <tr key={g.nom}>
                  <td className="py-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                      style={{ backgroundColor: g.couleur }}
                    />
                    {g.nom}
                  </td>
                  <td className="py-2 text-right">{g.nuage.length}</td>
                  <td className="py-2 text-right">
                    {g.medianeGlobale.toFixed(2).replace(".", ",")}%
                  </td>
                  <td className="py-2 text-right text-slate-500">
                    {g.min.toFixed(2).replace(".", ",")} –{" "}
                    {g.max.toFixed(2).replace(".", ",")}%
                  </td>
                  <td className="py-2 text-right text-slate-500">
                    {g.courbe.length} / {TRANCHES.length}
                  </td>
                  <td
                    className={`py-2 text-right ${
                      g.pente === null
                        ? "text-slate-400"
                        : g.pente > 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                    }`}
                  >
                    {g.pente === null
                      ? "—"
                      : `${g.pente > 0 ? "+" : ""}${Math.round(g.pente)} pb`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});

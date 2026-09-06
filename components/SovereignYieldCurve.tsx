"use client";

import { Fragment, useMemo, useState, memo } from "react";
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

/** Piliers de maturité standard, repris de la grille publiee par l'Agence.
 *
 *  On regroupe les titres par pilier LE PLUS PROCHE, et non par intervalle.
 *  Le decoupage par intervalles produisait un artefact : 857 OAT sur 1 780 ont
 *  exactement 36 mois, si bien que la frontiere a 3 ans coupait la plus grosse
 *  concentration du gisement en deux. Les medianes des tranches « 2–3 ans » et
 *  « 3–5 ans » retombaient a 2,998 et 3,001 — deux points superposes a
 *  l'ecran, sur sept pays. Le regroupement par pilier les fusionne, et fait
 *  au passage coincider nos abscisses avec celles de la methode standard.
 */
const PILIERS_AZIMUT: { t: number; label: string }[] = [
  { t: 0.25, label: "3 mois" },
  { t: 0.5, label: "6 mois" },
  { t: 0.75, label: "9 mois" },
  { t: 1, label: "1 an" },
  { t: 2, label: "2 ans" },
  { t: 3, label: "3 ans" },
  { t: 5, label: "5 ans" },
  { t: 7, label: "7 ans" },
  { t: 10, label: "10 ans" },
  { t: 15, label: "15 ans" },
];

/** Pilier le plus proche d'une duree. */
function pilierProche(annees: number): { t: number; label: string } {
  let best = PILIERS_AZIMUT[0];
  let ecart = Math.abs(annees - best.t);
  for (const p of PILIERS_AZIMUT) {
    const e = Math.abs(annees - p.t);
    if (e < ecart) {
      ecart = e;
      best = p;
    }
  }
  return best;
}

/** En dessous, un pilier ne porte pas de point de courbe : la médiane d'une
 *  seule ligne n'est pas une observation de marché, c'est cette ligne. */
const MIN_PAR_TRANCHE = 2;

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

/** Libelle d'un pilier au format de la grille publiee : « 3 mois », « 5 ans ». */
function libellePilier(annees: number): string {
  if (annees < 1) {
    const mois = Math.round(annees * 12);
    return `${mois} mois`;
  }
  const n = Math.round(annees);
  return n === 1 ? "1 an" : `${n} ans`;
}

function mediane(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function formatFCFA(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

function formatBigFCFA(value: number): string {
  if (value >= 1e12) return (value / 1e12).toFixed(2).replace(".", ",") + " T FCFA";
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace(".", ",") + " Mds FCFA";
  if (value >= 1e6) return (value / 1e6).toFixed(0) + " M FCFA";
  return formatFCFA(value) + " FCFA";
}

function formatDate(date: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

type SovereignCurvePoint = {
  /** Duree de vie moyenne, en annees. */
  x: number;
  /** Maturite affichee, conservee pour l'infobulle : l'ecart avec la DVM est
   *  l'information utile sur un titre amortissable. */
  maturiteAffichee?: number;
  y: number;
  type: "BAT" | "OAT";
  country: string;
  isin: string;
  amount: number;
  nbRounds: number;
  date: string;
};

/** Sortie de la methode standard, calculee cote serveur. */
export type CourbeStandard = {
  /** Taux zero-coupon extraits par demembrement, en pourcentage. */
  zc: { t: number; z: number }[];
  /** Fonctionnelle Nelson-Siegel-Svensson echantillonnee. */
  lisse: { x: number; y: number }[];
  /** Table au format publie par l'Agence : un pilier par ligne. */
  table: { t: number; zc: number; lisse: number; source: string }[];
  tau1: number;
  /** Ecart type des residus de l'ajustement, en points de base. */
  rmse: number;
};

type SovereignYieldCurveProps = {
  curveData: SovereignCurvePoint[];
  availableCountries: string[];
  standard?: Record<string, CourbeStandard>;
};

const SovereignYieldCurve = memo(function SovereignYieldCurve({
  curveData,
  standard,
}: SovereignYieldCurveProps) {
  /** Deux lectures du meme gisement :
   *  - Azimut : mediane des taux observes par pilier, sans modele. Ne dit rien
   *    entre deux piliers, mais n'invente rien non plus.
   *  - Standard : demembrement en zero-coupon puis lissage Nelson-Siegel-
   *    Svensson, la methode de l'Agence UMOA-Titres. Continue partout, au prix
   *    d'une hypothese de forme. */
  const [methode, setMethode] = useState<"azimut" | "standard">("azimut");
  const [dimension, setDimension] = useState<"country" | "type">("country");
  const [affichage, setAffichage] = useState<"points" | "courbe" | "les-deux">(
    "les-deux",
  );

  /** Groupes de la dimension choisie, du plus fourni au moins fourni : la
   *  palette suit ainsi l'importance des séries. */
  // La methode standard construit une courbe par EMETTEUR : comparer des
  // instruments y serait un contresens, on force donc la dimension pays.
  const dimensionEffective = methode === "standard" ? "country" : dimension;

  const groupes = useMemo(() => {
    const compte = new Map<string, number>();
    for (const p of curveData) {
      const k = p[dimensionEffective];
      compte.set(k, (compte.get(k) ?? 0) + 1);
    }
    return Array.from(compte.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nom, n], i) => ({ nom, n, couleur: PALETTE[i % PALETTE.length] }));
  }, [curveData, dimensionEffective]);

  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const actifs = useMemo(() => {
    const s = selection[dimensionEffective];
    if (s === undefined) return groupes.slice(0, 4).map((g) => g.nom);
    return s;
  }, [selection, dimensionEffective, groupes]);

  function bascule(nom: string) {
    const suivant = actifs.includes(nom)
      ? actifs.filter((x) => x !== nom)
      : [...actifs, nom];
    setSelection({ ...selection, [dimensionEffective]: suivant });
  }

  /** Une série par groupe : le nuage brut et la courbe observée.
   *
   *  La courbe n'est pas un ajustement : c'est la MÉDIANE des taux
   *  d'adjudication constatés dans chaque tranche de maturité, posée à la
   *  maturité médiane de la tranche. Rien n'est extrapolé ; une tranche sans
   *  ligne reste un trou.
   *
   *  La médiane plutôt que la moyenne : une adjudication faite dans un moment
   *  de tension déplacerait une moyenne calculée sur cinq observations.
   */
  const series = useMemo(() => {
    return groupes
      .filter((g) => actifs.includes(g.nom))
      .map((g) => {
        const sous = curveData.filter((p) => p[dimensionEffective] === g.nom);

        const courbe = PILIERS_AZIMUT.map((pil) => {
          const dedans = sous.filter((p) => pilierProche(p.x).t === pil.t);
          if (dedans.length < MIN_PAR_TRANCHE) return null;
          return {
            // Abscisse = le pilier lui-meme. Deux piliers distincts ne peuvent
            // donc plus se superposer, quelle que soit la repartition reelle
            // des maturites a l'interieur.
            x: pil.t,
            y: mediane(dedans.map((p) => p.y)),
            tranche: pil.label,
            effectif: dedans.length,
            groupe: g.nom,
          };
        }).filter((v): v is NonNullable<typeof v> => v !== null);

        const ys = sous.map((p) => p.y);
        const court = courbe.find((c) => c.x < 1);
        const long = [...courbe].reverse().find((c) => c.x >= 5);

        return {
          ...g,
          nuage: sous,
          courbe,
          medianeGlobale: mediane(ys),
          min: ys.length ? Math.min(...ys) : 0,
          max: ys.length ? Math.max(...ys) : 0,
          encours: sous.reduce((s, p) => s + p.amount, 0),
          // Pente OBSERVÉE entre le court terme (< 1 an, domaine des BAT) et
          // le long (≥ 5 ans). Lue sur deux médianes, pas ajustée.
          pente: court && long ? (long.y - court.y) * 100 : null,
        };
      });
  }, [groupes, actifs, curveData, dimensionEffective]);

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="flex justify-between items-start flex-wrap gap-2 mb-3">
        <div>
          {/* Le detail des deux methodes est documente dans l'admin, page
              Sources & methodologies. */}
          <h2 className="text-lg md:text-xl font-semibold">
            Courbe des taux souverains UEMOA
          </h2>
        </div>
        <span className="text-[10px] md:text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
          EXCLUSIVITÉ AZIMUT
        </span>
      </div>

      {/* ---------- CONTROLES ---------- */}
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
            Méthode
          </span>
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
            {[
              { l: "Azimut", v: "azimut" as const },
              { l: "Standard", v: "standard" as const },
            ].map((m) => (
              <button
                key={m.v}
                onClick={() => setMethode(m.v)}
                disabled={m.v === "standard" && !standard}
                className={`px-3 py-1 rounded transition ${
                  methode === m.v
                    ? "bg-white shadow-sm font-medium"
                    : "text-slate-500 hover:text-slate-700 disabled:text-slate-300"
                }`}
              >
                {m.l}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`flex items-center gap-2 ${
            methode === "standard" ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
            Comparer par
          </span>
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
            {[
              { l: "Pays", v: "country" as const },
              { l: "Instrument", v: "type" as const },
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
              className={`text-xs px-2.5 py-1 rounded-md border transition inline-flex items-center justify-center min-w-[84px] ${
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
              name="DVM"
              unit=" ans"
              stroke="#94a3b8"
              fontSize={11}
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => Number(v).toFixed(1)}
              label={{
                value: "Durée de vie moyenne (années)",
                position: "bottom",
                offset: 15,
                style: { fontSize: 12, fill: "#64748b" },
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Taux"
              unit="%"
              stroke="#94a3b8"
              fontSize={11}
              domain={["auto", "auto"]}
              label={{
                value: "Taux d'adjudication (%)",
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
                const pt = payload.find((p) => p.payload?.tranche)?.payload;
                if (pt) {
                  return (
                    <div className="bg-white border border-slate-200 rounded-md shadow-md p-3 text-xs">
                      <div className="font-medium mb-1">{pt.groupe}</div>
                      <div className="text-slate-500">{pt.tranche}</div>
                      <div className="mt-1">
                        Taux médian : <b>{Number(pt.y).toFixed(2)}%</b>
                      </div>
                      <div className="text-slate-400 mt-1">
                        {pt.effectif} ligne{pt.effectif > 1 ? "s" : ""} dans la
                        tranche
                      </div>
                    </div>
                  );
                }
                const d = payload.find((p) => p.payload?.isin)?.payload;
                if (!d) return null;
                return (
                  <div className="bg-white border border-slate-200 rounded-md shadow-md p-3 text-xs">
                    <div className="font-medium mb-1">{d.isin}</div>
                    <div className="text-slate-500">
                      {d.country} · {d.type}
                    </div>
                    <div className="mt-1 flex gap-3">
                      <span>
                        DVM : <b>{Number(d.x).toFixed(2)} ans</b>
                      </span>
                      <span>
                        Taux : <b>{Number(d.y).toFixed(2)}%</b>
                      </span>
                    </div>
                    {d.maturiteAffichee != null &&
                      Math.abs(d.maturiteAffichee - d.x) > 0.01 && (
                        <div className="text-slate-400">
                          Maturité affichée : {Number(d.maturiteAffichee).toFixed(1)} ans
                        </div>
                      )}
                    <div className="text-slate-400 mt-1">
                      {formatBigFCFA(d.amount)} · {d.nbRounds} tour
                      {d.nbRounds > 1 ? "s" : ""} · {formatDate(d.date)}
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

            {/* --- METHODE STANDARD : points zero-coupon + fonctionnelle --- */}
            {methode === "standard" &&
              affichage !== "courbe" &&
              series.map((g) =>
                standard?.[g.nom] ? (
                  <Scatter
                    key={`zc-${g.nom}`}
                    name={`${g.nom} — zéro-coupon`}
                    data={standard[g.nom].zc.map((p) => ({
                      x: p.t,
                      y: p.z,
                      isin: g.nom,
                      country: g.nom,
                      type: "OAT" as const,
                      amount: 0,
                      nbRounds: 0,
                      date: "",
                      zeroCoupon: true,
                    }))}
                    fill={g.couleur}
                    fillOpacity={affichage === "les-deux" ? 0.55 : 0.9}
                    legendType={affichage === "les-deux" ? "none" : "circle"}
                    isAnimationActive={false}
                  />
                ) : null,
              )}

            {methode === "standard" &&
              affichage !== "points" &&
              series.map((g) =>
                standard?.[g.nom] ? (
                  <Line
                    key={`nss-${g.nom}`}
                    type="monotone"
                    dataKey="y"
                    data={standard[g.nom].lisse}
                    name={g.nom}
                    stroke={g.couleur}
                    strokeWidth={2}
                    dot={false}
                    legendType="plainline"
                    isAnimationActive={false}
                  />
                ) : null,
              )}

            {/* --- METHODE AZIMUT --- */}
            {methode === "azimut" &&
              affichage !== "courbe" &&
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

            {methode === "azimut" &&
              affichage !== "points" &&
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
                <th className="text-right py-2 font-medium">Encours</th>
                <th className="text-right py-2 font-medium">Taux médian</th>
                <th className="text-right py-2 font-medium">Min – max</th>
                <th className="text-right py-2 font-medium">
                  {methode === "azimut" ? "Piliers" : "Points ZC"}
                </th>
                <th className="text-right py-2 font-medium">
                  {methode === "azimut" ? "Pente observée" : "Ajustement"}
                </th>
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
                  <td className="py-2 text-right text-slate-500">
                    {formatBigFCFA(g.encours)}
                  </td>
                  <td className="py-2 text-right">
                    {g.medianeGlobale.toFixed(2).replace(".", ",")}%
                  </td>
                  <td className="py-2 text-right text-slate-500">
                    {g.min.toFixed(2).replace(".", ",")} –{" "}
                    {g.max.toFixed(2).replace(".", ",")}%
                  </td>
                  <td className="py-2 text-right text-slate-500">
                    {methode === "azimut"
                      ? `${g.courbe.length} / ${PILIERS_AZIMUT.length}`
                      : (standard?.[g.nom]?.zc.length ?? "—")}
                  </td>
                  {methode === "azimut" ? (
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
                  ) : (
                    <td className="py-2 text-right text-slate-500">
                      {standard?.[g.nom]
                        ? `τ₁ ${standard[g.nom].tau1.toFixed(2)} · résidu ${standard[
                            g.nom
                          ].rmse.toFixed(0)} pb`
                        : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {methode === "standard" && (
            <div className="mt-6">
              <h3 className="text-sm font-medium mb-2">
                Taux zéro-coupon et taux lissés
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-slate-500 text-xs">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 font-medium">Maturité</th>
                      {series.map((g) =>
                        standard?.[g.nom] ? (
                          <th
                            key={g.nom}
                            colSpan={2}
                            className="text-center py-2 font-medium border-l border-slate-100"
                          >
                            <span
                              className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                              style={{ backgroundColor: g.couleur }}
                            />
                            {g.nom}
                          </th>
                        ) : null,
                      )}
                    </tr>
                    <tr className="border-b border-slate-200 text-[10px]">
                      <th />
                      {series.map((g) =>
                        standard?.[g.nom] ? (
                          <Fragment key={g.nom}>
                            <th className="text-right py-1 font-medium border-l border-slate-100">
                              Zéro-coupon
                            </th>
                            <th className="text-right py-1 font-medium">
                              Après lissage
                            </th>
                          </Fragment>
                        ) : null,
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {/* Union des piliers renseignes : un pays peut ne pas
                        couvrir toute la grille, la cellule reste alors vide
                        plutot que d'etre extrapolee. */}
                    {Array.from(
                      new Set(
                        series.flatMap((g) =>
                          (standard?.[g.nom]?.table ?? []).map((r) => r.t),
                        ),
                      ),
                    )
                      .sort((a, b) => a - b)
                      .map((maturite) => (
                        <tr key={maturite}>
                          <td className="py-1.5 text-slate-600">
                            {libellePilier(maturite)}
                          </td>
                          {series.map((g) => {
                            const st = standard?.[g.nom];
                            if (!st) return null;
                            const ligne = st.table.find(
                              (r) => Math.abs(r.t - maturite) < 1e-6,
                            );
                            return (
                              <Fragment key={`${g.nom}-${maturite}`}>
                                <td className="py-1.5 text-right text-slate-500 border-l border-slate-100">
                                  {ligne
                                    ? ligne.zc.toFixed(2).replace(".", ",") + "%"
                                    : "—"}
                                </td>
                                <td className="py-1.5 text-right font-medium">
                                  {ligne
                                    ? ligne.lisse.toFixed(2).replace(".", ",") +
                                      "%"
                                    : "—"}
                                </td>
                              </Fragment>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}
    </section>
  );
});

export default SovereignYieldCurve;
export type { SovereignCurvePoint };

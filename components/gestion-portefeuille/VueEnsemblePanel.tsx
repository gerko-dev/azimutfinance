"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { LigneFonds, VueEnsemble } from "@/app/gestion-portefeuille/vue-ensemble-data";

/**
 * Vue d'ensemble : le poste de travail du gérant, à l'ouverture.
 *
 * QUATRE BLOCS, ET L'ORDRE EST CELUI DES QUESTIONS. Ce que pèse la maison et
 * comment elle va ; par où elle y est passée ; fonds par fonds, qui bat son
 * indice et à quel prix en risque ; et ce qui explique l'écart.
 *
 * ON NE MELANGE PAS LES FENETRES, et le tableau le dit à chaque ligne : la
 * performance se lit depuis le 1ᵉʳ janvier, l'attribution sur la période entre
 * deux inventaires. Les présenter côte à côte sans dater la seconde
 * laisserait additionner des choses qui ne s'additionnent pas.
 *
 * ET UNE PERFORMANCE N'EST JAMAIS SEULE. Volatilité et pire recul sont à côté
 * d'elle : deux fonds à + 6 % ne se valent pas si l'un y est allé droit et
 * l'autre en perdant douze points en chemin.
 */

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pct = (v: number | null) => (v == null ? "—" : `${fmt2.format(v)} %`);
const pct1 = (v: number | null) => (v == null ? "—" : `${fmt1.format(v)} %`);
const pctSigne = (v: number | null) =>
  v == null ? "—" : `${v >= 0 ? "+" : "−"}${fmt2.format(Math.abs(v))} %`;

/** Les encours se lisent en milliards, pas en unités : « 31,3 Md » se compare
 *  d'un coup d'œil là où « 31 348 816 976 F » se compte à la main. */
function montantCourt(v: number | null): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${fmt1.format(v / 1e9)} Md`;
  if (a >= 1e6) return `${fmt0.format(v / 1e6)} M`;
  return fmt0.format(v);
}
const montant = (v: number | null) => (v == null ? "—" : `${fmt0.format(Math.round(v))} F`);

/** Vert au-dessus de zéro, rouge en dessous — et rien quand on ne sait pas. */
function ton(v: number | null): string {
  if (v == null) return "text-slate-400";
  if (v > 0.005) return "text-emerald-700";
  if (v < -0.005) return "text-rose-700";
  return "text-slate-600";
}

/** Nom court : le tableau et le graphique n'ont pas la place des intitulés
 *  complets, et « FCP AURORE » répété six fois n'aide personne. */
function nomCourt(nom: string): string {
  return nom
    .replace(/^FCP\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palette lisible à six lignes, et distinguable en noir et blanc. */
const COULEURS = ["#1d4ed8", "#0891b2", "#7c3aed", "#ea580c", "#059669", "#be123c", "#4338ca"];

// ── Les briques ────────────────────────────────────────────────────────────

function Kpi({
  label,
  valeur,
  sous,
  accent,
  titre,
}: {
  label: string;
  valeur: string;
  sous?: string;
  accent?: string;
  titre?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3" title={titre}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${accent ?? "text-slate-900"}`}>
        {valeur}
      </div>
      {sous && <div className="text-[10px] text-slate-500 mt-1">{sous}</div>}
    </div>
  );
}

/**
 * L'alpha dessiné, pas seulement chiffré.
 *
 * Une colonne de pourcentages se lit ligne à ligne ; une barre se lit d'un
 * coup d'œil, et c'est exactement ce qu'on demande à une vue d'ensemble — voir
 * qui décroche avant d'avoir lu.
 */
function BarreAlpha({ valeur, echelle }: { valeur: number | null; echelle: number }) {
  if (valeur == null || echelle <= 0) return <div className="h-1.5" />;
  const part = Math.min(1, Math.abs(valeur) / echelle) * 50;
  return (
    <div className="relative h-1.5 w-full bg-slate-100 rounded-sm overflow-hidden">
      <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
      <div
        className={`absolute inset-y-0 ${valeur >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
        style={
          valeur >= 0
            ? { left: "50%", width: `${part}%` }
            : { right: "50%", width: `${part}%` }
        }
      />
    </div>
  );
}

// ── Le panneau ─────────────────────────────────────────────────────────────

export default function VueEnsemblePanel({ vue }: { vue: VueEnsemble }) {
  const { lignes, origine } = vue;
  const [triPar, setTriPar] = useState<"encours" | "perf" | "alpha" | "contribution">("encours");

  const avecAttribution = lignes.filter((l) => l.attribution != null);

  // ── La courbe : chaque fonds, plus la maison ────────────────────────────
  //
  // LES FONDS NE PUBLIENT PAS LEUR VL LE MEME JOUR. On aligne donc sur l'union
  // des dates et l'on reporte la dernière valeur connue : un trou dans la
  // courbe ferait croire à une interruption là où il n'y a qu'un jour sans
  // publication.
  const courbe = useMemo(() => {
    const dates = [
      ...new Set([
        ...vue.serieMaison.map((p) => p.date),
        ...lignes.flatMap((l) => l.serie.map((p) => p.date)),
      ]),
    ].sort();
    if (dates.length === 0) return [];
    const curseurs = new Map<string, number>();
    return dates.map((date) => {
      const ligne: Record<string, string | number | null> = { date };
      for (const l of lignes) {
        const p = l.serie.filter((x) => x.date <= date).pop();
        if (p) curseurs.set(l.fondsId, p.valeur);
        ligne[l.fondsId] = curseurs.get(l.fondsId) ?? null;
      }
      const m = vue.serieMaison.filter((x) => x.date <= date).pop();
      ligne.maison = m ? m.valeur : null;
      return ligne;
    });
  }, [lignes, vue.serieMaison]);

  const rangees = useMemo(() => {
    const clef = (l: LigneFonds): number => {
      if (triPar === "perf") return l.perfYtd ?? -Infinity;
      if (triPar === "alpha") return l.alpha ?? -Infinity;
      if (triPar === "contribution") return l.contribution ?? -Infinity;
      return l.encours ?? -Infinity;
    };
    return [...lignes].sort((a, b) => clef(b) - clef(a));
  }, [lignes, triPar]);

  const echelleAlpha = Math.max(
    1,
    ...lignes.map((l) => Math.abs(l.alpha ?? 0)).filter((v) => Number.isFinite(v)),
  );

  const collecte =
    vue.encoursOrigine > 0 ? vue.encoursTotal - vue.encoursOrigine : null;

  // Tout ce qu'il y a à corriger, rassemblé : le gérant veut UNE liste de
  // choses à faire, pas des avertissements éparpillés dans six tableaux.
  const aCorriger = lignes.flatMap((l) =>
    (l.classes ?? [])
      .filter((c) => c.reserve)
      .map((c) => ({ fonds: nomCourt(l.fondsNom), classe: c.classe, quoi: c.reserve as string })),
  );

  return (
    <div className="space-y-5">
      {/* ── Ce que pèse la maison, et comment elle va ───────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Encours sous gestion"
          valeur={`${montantCourt(vue.encoursTotal)} F`}
          sous={
            collecte != null
              ? `${collecte >= 0 ? "+" : "−"}${montantCourt(Math.abs(collecte))} F depuis le ${origine}`
              : `${lignes.length} fonds`
          }
          titre={montant(vue.encoursTotal)}
        />
        <Kpi
          label="Performance de la maison"
          valeur={pct(vue.perfPonderee)}
          sous="pondérée par les encours"
          accent={ton(vue.perfPonderee)}
        />
        <Kpi
          label="Alpha"
          valeur={pctSigne(vue.alphaPondere)}
          sous={`indice composite ${pct(vue.benchPondere)}`}
          accent={ton(vue.alphaPondere)}
        />
        <Kpi
          label="Fonds qui battent leur indice"
          valeur={vue.comparables > 0 ? `${vue.battent} / ${vue.comparables}` : "—"}
          sous={
            vue.dernierArrete
              ? `dernière VL au ${vue.dernierArrete}`
              : "aucune VL exploitable"
          }
          accent={
            vue.comparables > 0 && vue.battent * 2 >= vue.comparables
              ? "text-emerald-700"
              : "text-slate-900"
          }
        />
      </div>

      {/* ── Par où la maison est passée ─────────────────────────────── */}
      {courbe.length > 1 && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Trajectoire depuis le {origine}, base 100
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              La valeur liquidative de chaque fonds, ramenée à 100 à son origine. La ligne
              épaisse est <strong>l&apos;indice de la maison</strong> : la performance
              consolidée, chaînée pas à pas et pondérée par les encours. Un fonds créé en
              cours d&apos;année y entre le jour de sa première VL, sans faire sauter
              l&apos;indice.
            </p>
          </div>
          <div className="px-2 pt-4 pb-2 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={courbe} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  minTickGap={40}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  domain={["auto", "auto"]}
                  width={44}
                  tickFormatter={(v: number) => fmt0.format(v)}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6, borderColor: "#cbd5e1" }}
                  formatter={(v, nom) => [
                    typeof v === "number" ? `${fmt2.format(v)} (${pctSigne(v - 100)})` : "—",
                    String(nom),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} itemSorter={null} />
                <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="maison"
                  name="Maison"
                  stroke="#0f172a"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                {lignes.map((l, i) => (
                  <Line
                    key={l.fondsId}
                    type="monotone"
                    dataKey={l.fondsId}
                    name={nomCourt(l.fondsNom)}
                    stroke={COULEURS[i % COULEURS.length]}
                    strokeWidth={1.25}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── Fonds par fonds ─────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Performance et risque depuis le {origine}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              La performance vient de la VL — elle porte le passif du fonds et les
              régularisations du dépositaire, à la différence d&apos;une somme de
              valorisations. UN FONDS CRÉÉ EN COURS D&apos;ANNÉE part de sa première VL, et
              son indice est calculé sur cette même fenêtre : sa performance ne se compare
              pas à celle des autres.
            </p>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-slate-400">Trier par</span>
            {(
              [
                ["encours", "Encours"],
                ["perf", "Performance"],
                ["alpha", "Alpha"],
                ["contribution", "Contribution"],
              ] as const
            ).map(([clef, libelle]) => (
              <button
                key={clef}
                onClick={() => setTriPar(clef)}
                className={`px-1.5 py-0.5 rounded border ${
                  triPar === clef
                    ? "border-blue-300 bg-blue-50 text-blue-700 font-medium"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Fonds</th>
                <th className="text-right px-3 py-2 font-medium">Encours</th>
                <th className="text-right px-3 py-2 font-medium">Part</th>
                <th className="text-right px-3 py-2 font-medium">Performance</th>
                <th className="text-right px-3 py-2 font-medium">Indice</th>
                <th className="text-right px-3 py-2 font-medium" colSpan={2}>
                  Alpha
                </th>
                <th
                  className="text-right px-3 py-2 font-medium"
                  title="Volatilité annualisée de la valeur liquidative sur la fenêtre."
                >
                  Volatilité
                </th>
                <th
                  className="text-right px-3 py-2 font-medium"
                  title="Pire baisse entre un sommet et le creux qui le suit : ce qu'aurait perdu un porteur entré au plus haut."
                >
                  Pire recul
                </th>
                <th
                  className="text-right px-3 py-2 font-medium"
                  title="Part × performance : ce que ce fonds apporte à la performance de la maison. La somme de la colonne est la performance pondérée."
                >
                  Contribution
                </th>
                <th className="text-left px-3 py-2 font-medium">Dernière VL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rangees.map((l) => (
                <tr key={l.fondsId} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-medium text-slate-800 max-w-[22rem]">
                    {l.fondsNom}
                    {/* UN BENCHMARK A MOITIE RESOLU COMPARE LE FONDS A UN INDICE
                        AMPUTE : le dire est le minimum, puisque l'alpha affiché
                        juste à côté en dépend. */}
                    {l.couvertureBench > 0 && l.couvertureBench < 0.999 && (
                      <span
                        className="ml-1.5 text-[9px] text-amber-700"
                        title={`Composantes sans série exploitable : ${l.benchIrresolu.join(", ")}`}
                      >
                        indice à {fmt0.format(l.couvertureBench * 100)} %
                      </span>
                    )}
                    {/* NE EN COURS D'ANNEE : la fenêtre n'est pas celle des
                        autres fonds, et l'omettre ferait lire un trimestre
                        comme une année. */}
                    {l.depuisCreation && l.origine && (
                      <span
                        className="ml-1.5 text-[9px] text-slate-500"
                        title={`Fonds créé en cours d'année : performance et indice sont calculés depuis la première VL, le ${l.origine}, et non depuis le 31 décembre.`}
                      >
                        depuis le {l.origine}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-700" title={montant(l.encours)}>
                    {montantCourt(l.encours)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                    {l.part > 0 ? `${fmt0.format(l.part)} %` : "—"}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums font-medium ${ton(l.perfYtd)}`}
                  >
                    {pct(l.perfYtd)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                    {pct(l.benchYtd)}
                  </td>
                  <td
                    className={`pl-3 py-1.5 text-right tabular-nums font-semibold ${ton(l.alpha)}`}
                  >
                    {pctSigne(l.alpha)}
                  </td>
                  <td className="pr-3 py-1.5 w-20">
                    <BarreAlpha valeur={l.alpha} echelle={echelleAlpha} />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                    {pct1(l.volatilite)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                    {l.recul == null ? "—" : pct1(l.recul)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums ${ton(l.contribution)}`}
                  >
                    {l.contribution == null ? "—" : `${fmt2.format(l.contribution)} pts`}
                  </td>
                  <td className="px-3 py-1.5 text-slate-500 tabular-nums">{l.dateVl ?? "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr className="font-semibold text-slate-800">
                <td className="px-3 py-2">Maison</td>
                <td className="px-3 py-2 text-right tabular-nums" title={montant(vue.encoursTotal)}>
                  {montantCourt(vue.encoursTotal)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">100 %</td>
                <td className={`px-3 py-2 text-right tabular-nums ${ton(vue.perfPonderee)}`}>
                  {pct(vue.perfPonderee)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {pct(vue.benchPondere)}
                </td>
                <td className={`pl-3 py-2 text-right tabular-nums ${ton(vue.alphaPondere)}`}>
                  {pctSigne(vue.alphaPondere)}
                </td>
                <td colSpan={3} />
                <td className={`px-3 py-2 text-right tabular-nums ${ton(vue.perfPonderee)}`}>
                  {vue.perfPonderee == null ? "—" : `${fmt2.format(vue.perfPonderee)} pts`}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {lignes.some((l) => l.souci) && (
          <ul className="px-4 py-2 border-t border-slate-200 bg-amber-50/60 space-y-0.5">
            {lignes
              .filter((l) => l.souci)
              .map((l) => (
                <li key={l.fondsId} className="text-[10px] text-amber-800">
                  <strong>{nomCourt(l.fondsNom)}</strong> — {l.souci}
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* ── D'où vient l'écart ──────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            D&apos;où vient l&apos;écart : allocation et sélection
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Décomposition de Brinson–Fachler. L&apos;<strong>allocation</strong> est ce que
            rapporte le choix des poids entre classes d&apos;actif ; la{" "}
            <strong>sélection</strong>, ce que rapporte le choix des titres à
            l&apos;intérieur de chaque classe ; l&apos;<strong>interaction</strong>, le fait
            de surpondérer là où l&apos;on sélectionne bien.
          </p>
          <p className="text-[11px] text-amber-800 mt-1">
            Elle se calcule sur la période entre deux inventaires — pas sur l&apos;année —
            parce qu&apos;elle a besoin des poids par classe aux deux bouts. La fenêtre est
            donnée à chaque ligne : elle diffère d&apos;un fonds à l&apos;autre, et ces
            effets ne se comparent donc pas entre fonds.
          </p>
        </div>

        {avecAttribution.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-500">
            Aucune attribution calculable : il faut deux inventaires importés et un
            benchmark renseigné.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Fonds</th>
                  <th className="text-left px-3 py-2 font-medium">Période</th>
                  <th className="text-right px-3 py-2 font-medium">Portefeuille</th>
                  <th className="text-right px-3 py-2 font-medium">Benchmark</th>
                  <th className="text-right px-3 py-2 font-medium">Allocation</th>
                  <th className="text-right px-3 py-2 font-medium">Sélection</th>
                  <th className="text-right px-3 py-2 font-medium">Interaction</th>
                  <th className="text-right px-3 py-2 font-medium">Écart total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {avecAttribution.map((l) => {
                  const a = l.attribution!;
                  return (
                    <tr key={l.fondsId} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-medium text-slate-800">
                        {l.fondsNom}
                        {a.couverture < 0.999 && (
                          <span
                            className="ml-1.5 text-[9px] text-amber-700"
                            title="Les classes dont la performance ou le benchmark manquent sont écartées du calcul."
                          >
                            {fmt0.format(a.couverture * 100)} % de l&apos;actif décomposé
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500 tabular-nums whitespace-nowrap">
                        {a.debut ?? "—"} → {a.fin}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${ton(a.perf)}`}>
                        {pct(a.perf)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                        {pct(a.bench)}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${ton(a.allocation)}`}>
                        {pctSigne(a.allocation)}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${ton(a.selection)}`}>
                        {pctSigne(a.selection)}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${ton(a.interaction)}`}>
                        {pctSigne(a.interaction)}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right tabular-nums font-semibold ${ton(a.total)}`}
                      >
                        {pctSigne(a.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Ce qu'il reste à corriger ───────────────────────────────── */}
      {aCorriger.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Ce qui fragilise les chiffres
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Une fiche incomplète au référentiel, une poche à moitié vendue en cours de
              période : les chiffres restent les meilleurs disponibles, mais ils cessent
              d&apos;être des mesures au sens strict. Rassemblé ici pour qu&apos;il y ait
              UNE liste de choses à faire, et non des avertissements éparpillés.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {aCorriger.map((c, i) => (
              <li key={i} className="px-4 py-1.5 text-[11px] text-slate-600">
                <span className="font-medium text-slate-800">{c.fonds}</span>
                <span className="text-slate-400"> · </span>
                <span className="text-slate-500">{c.classe}</span>
                <span className="text-slate-400"> — </span>
                {c.quoi}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { VueEnsemble } from "@/app/gestion-portefeuille/vue-ensemble-data";

/**
 * Vue d'ensemble : les fonds, leur benchmark, et ce qui explique l'écart.
 *
 * TROIS BLOCS, ET L'ORDRE EST CELUI DES QUESTIONS qu'un gérant se pose en
 * ouvrant son poste : combien je gère et comment ça va ; fonds par fonds, qui
 * bat son indice ; et pour ceux qui le battent — ou pas —, par quoi.
 *
 * LES DEUX DERNIERS NE PARTAGENT PAS LEUR FENETRE, et le tableau le dit à
 * chaque ligne : la performance se lit depuis le 1ᵉʳ janvier, l'attribution
 * sur la période entre deux inventaires. Les présenter côte à côte sans dater
 * la seconde laisserait additionner des choses qui ne s'additionnent pas.
 */

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const montant = (v: number | null) => (v == null ? "—" : fmt0.format(Math.round(v)));
const pct = (v: number | null) => (v == null ? "—" : `${fmt2.format(v)} %`);
const pctSigne = (v: number | null) =>
  v == null ? "—" : `${v >= 0 ? "+" : "−"}${fmt2.format(Math.abs(v))} %`;

/** Vert au-dessus de zéro, rouge en dessous — et rien quand on ne sait pas. */
function ton(v: number | null): string {
  if (v == null) return "text-slate-400";
  if (v > 0.005) return "text-emerald-700";
  if (v < -0.005) return "text-rose-700";
  return "text-slate-600";
}

function Kpi({
  label,
  valeur,
  sous,
  accent,
}: {
  label: string;
  valeur: string;
  sous?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-0.5 ${accent ?? "text-slate-900"}`}>
        {valeur}
      </div>
      {sous && <div className="text-[10px] text-slate-400 mt-0.5">{sous}</div>}
    </div>
  );
}

/** Nom court : le tableau et le graphique n'ont pas la place des intitulés
 *  complets, et « FCP AURORE » répété six fois n'aide personne. */
function nomCourt(nom: string): string {
  return nom.replace(/^FCP\s+/i, "").replace(/\s+/g, " ").trim();
}

export default function VueEnsemblePanel({ vue }: { vue: VueEnsemble }) {
  const { lignes, origine } = vue;

  const donnees = lignes
    .filter((l) => l.perfYtd != null || l.benchYtd != null)
    .map((l) => ({
      nom: nomCourt(l.fondsNom),
      fonds: l.perfYtd,
      benchmark: l.benchYtd,
      alpha: l.alpha,
    }));

  const avecAttribution = lignes.filter((l) => l.attribution != null);

  return (
    <div className="space-y-5">
      {/* ── Ce que pèse la maison ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Fonds gérés"
          valeur={String(lignes.length)}
          sous={`${lignes.filter((l) => l.perfYtd != null).length} avec une VL exploitable`}
        />
        <Kpi
          label="Encours total"
          valeur={`${montant(vue.encoursTotal)} F`}
          sous="dernier actif net publié"
        />
        <Kpi
          label="Performance depuis le 1ᵉʳ janvier"
          valeur={pct(vue.perfPonderee)}
          sous="pondérée par les encours"
          accent={ton(vue.perfPonderee)}
        />
        <Kpi
          label="Alpha de la maison"
          valeur={pctSigne(vue.alphaPondere)}
          sous={`benchmark ${pct(vue.benchPondere)}`}
          accent={ton(vue.alphaPondere)}
        />
      </div>

      {/* ── Fonds contre benchmark ──────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Performance depuis le 1ᵉʳ janvier
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Du {origine} à la dernière valeur liquidative de chaque fonds. La performance
            vient de la VL — elle porte donc le passif du fonds et les régularisations du
            dépositaire, à la différence d&apos;une somme de valorisations.
          </p>
        </div>

        {donnees.length > 0 && (
          <div className="px-2 pt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={donnees} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="nom"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  interval={0}
                  height={46}
                  angle={-18}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v: number) => `${fmt0.format(v)} %`}
                  width={52}
                />
                <Tooltip
                  formatter={(v, nom) => [pct(typeof v === "number" ? v : null), String(nom)]}
                  contentStyle={{ fontSize: 11, borderRadius: 6, borderColor: "#cbd5e1" }}
                />
                {/* L'ORDRE DE MONTAGE FAIT L'ORDRE DE LA LEGENDE chez Recharts,
                    et `itemSorter` par défaut la retrie par valeur : on le
                    neutralise pour que « fonds » reste devant « benchmark ». */}
                <Legend wrapperStyle={{ fontSize: 11 }} itemSorter={null} />
                <Bar dataKey="fonds" name="Fonds" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="benchmark" name="Benchmark" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Fonds</th>
                <th className="text-right px-3 py-2 font-medium">Encours</th>
                <th className="text-right px-3 py-2 font-medium">Performance</th>
                <th className="text-right px-3 py-2 font-medium">Benchmark</th>
                <th className="text-right px-3 py-2 font-medium">Alpha</th>
                <th className="text-left px-3 py-2 font-medium">Dernière VL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lignes.map((l) => (
                <tr key={l.fondsId} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-medium text-slate-800">
                    {l.fondsNom}
                    {/* UN BENCHMARK A MOITIE RESOLU COMPARE LE FONDS A UN INDICE
                        AMPUTE : le dire est le minimum, puisque l'alpha affiché
                        juste à côté en dépend. */}
                    {l.couvertureBench > 0 && l.couvertureBench < 0.999 && (
                      <span
                        className="ml-1.5 text-[9px] text-amber-700"
                        title={`Composantes sans série exploitable : ${l.benchIrresolu.join(", ")}`}
                      >
                        benchmark à {fmt0.format(l.couvertureBench * 100)} %
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                    {montant(l.encours)}
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${ton(l.perfYtd)}`}>
                    {pct(l.perfYtd)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                    {pct(l.benchYtd)}
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${ton(l.alpha)}`}>
                    {pctSigne(l.alpha)}
                  </td>
                  <td className="px-3 py-1.5 text-slate-500 tabular-nums">{l.dateVl ?? "—"}</td>
                </tr>
              ))}
            </tbody>
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

      {/* ── Le détail par classe d'actif ────────────────────────────── */}
      {avecAttribution.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Par classe d&apos;actif
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Le poids de chaque classe dans le fonds, sa performance, et celle de son
              indice de référence. Même fenêtre que l&apos;attribution ci-dessus.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-slate-200">
            {avecAttribution.map((l) => (
              <div key={l.fondsId} className="bg-white p-3">
                <div className="text-[11px] font-semibold text-slate-800 mb-1.5">
                  {l.fondsNom}
                </div>
                <table className="w-full text-[10px]">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="text-left font-medium py-0.5">Classe</th>
                      <th className="text-right font-medium py-0.5">Poids</th>
                      <th className="text-right font-medium py-0.5">Perf.</th>
                      <th className="text-right font-medium py-0.5">Indice</th>
                      <th className="text-right font-medium py-0.5">Alpha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {l.classes.map((c) => (
                      <tr key={c.classe}>
                        <td className="py-0.5 text-slate-700">{c.classe}</td>
                        <td className="py-0.5 text-right tabular-nums text-slate-600">
                          {fmt0.format(c.poids)} %
                        </td>
                        <td className={`py-0.5 text-right tabular-nums ${ton(c.performance)}`}>
                          {pct(c.performance)}
                        </td>
                        <td className="py-0.5 text-right tabular-nums text-slate-500">
                          {pct(c.benchmark)}
                        </td>
                        <td className={`py-0.5 text-right tabular-nums font-medium ${ton(c.alpha)}`}>
                          {pctSigne(c.alpha)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

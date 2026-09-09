"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import type { CommerceExterieur } from "@/lib/commerceExterieur";

type Props = {
  data: CommerceExterieur;
  /** Parités de change, déjà calculées pour la section Change. */
  changeSpots: {
    pair: string;
    latest: number;
    latestLabel: string;
    moy2025: number;
    fev2025: number;
  }[];
};

function fmtMds(v: number | null, digits = 0): string {
  if (v === null || !Number.isFinite(v)) return "—";
  // Sans l'arrondi prealable, un solde de -0,4 Mds s'affiche « −0 », qui se lit
  // comme une erreur de signe.
  const arrondi = Number(v.toFixed(digits));
  const s = arrondi < 0 ? "−" : "";
  v = arrondi;
  return s + Math.abs(v).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).replace(/ | /g, " ");
}

function fmtPct(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return (v * 100).toFixed(digits).replace(".", ",") + " %";
}

const COULEUR = {
  exports: "#0F6E56",
  imports: "#b45309",
  balance: "#185FA5",
  services: "#7F77DD",
  courant: "#0f172a",
};

export default function CommerceExterieurSection({ data, changeSpots }: Props) {
  const [fenetre, setFenetre] = useState<10 | 25 | 0>(25);

  const serie = useMemo(() => {
    const parAnnee = new Map<string, Record<string, number>>();
    for (const s of data.umoa) {
      for (const p of s.points) {
        const ligne = parAnnee.get(p.annee) ?? {};
        ligne[s.poste] = p.valeur;
        parAnnee.set(p.annee, ligne);
      }
    }
    const tout = [...parAnnee.entries()]
      .map(([annee, v]) => ({ annee, ...v }))
      .sort((a, b) => a.annee.localeCompare(b.annee));
    return fenetre === 0 ? tout : tout.slice(-fenetre);
  }, [data, fenetre]);

  if (data.derniereAnnee === "") {
    return (
      <section className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
        Données de balance des paiements indisponibles.
      </section>
    );
  }

  const couvertureUnion =
    data.totalExports !== null && data.totalImports !== null && data.totalImports > 0
      ? data.totalExports / data.totalImports
      : null;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Chiffres de tete */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-base md:text-lg font-semibold">
              Échanges de l&apos;Union avec le reste du monde
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Balance des paiements BCEAO, format BPM6 · exercice {data.derniereAnnee}{" "}
              · milliards de FCFA
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Chiffre
            label="Exportations de biens"
            valeur={fmtMds(data.totalExports)}
            unite="Mds FCFA"
            couleur={COULEUR.exports}
          />
          <Chiffre
            label="Importations de biens"
            valeur={fmtMds(data.totalImports)}
            unite="Mds FCFA"
            couleur={COULEUR.imports}
          />
          <Chiffre
            label="Balance des biens"
            valeur={fmtMds(data.totalBalance)}
            unite="Mds FCFA"
            couleur={(data.totalBalance ?? 0) >= 0 ? COULEUR.exports : COULEUR.imports}
          />
          <Chiffre
            label="Taux de couverture"
            valeur={fmtPct(couvertureUnion, 0)}
            unite="exports ÷ imports"
            couleur={(couvertureUnion ?? 0) >= 1 ? COULEUR.exports : COULEUR.imports}
          />
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Un taux de couverture inférieur à 100 % signifie que l&apos;Union achète
          au reste du monde plus qu&apos;elle ne lui vend : l&apos;écart se finance
          par les services, les transferts des migrants et les capitaux
          extérieurs, que les deux blocs suivants détaillent.
        </p>
      </section>

      {/* Serie longue */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-base md:text-lg font-semibold">
              Biens, services et transactions courantes
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Les barres sont les flux de biens, la ligne le solde courant — biens,
              services, revenus et transferts réunis
            </p>
          </div>
          <div className="flex gap-1.5 text-xs">
            {([10, 25, 0] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFenetre(f)}
                className={`px-2.5 py-1 rounded border ${
                  fenetre === f
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                {f === 0 ? "Tout" : `${f} ans`}
              </button>
            ))}
          </div>
        </div>
        <div style={{ width: "100%", height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="annee" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={12} />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                width={58}
                tickFormatter={(v) => fmtMds(Number(v))}
              />
              <Tooltip
                formatter={(v, n) => [
                  fmtMds(Number(v), 1) + " Mds FCFA",
                  n === "exports"
                    ? "Exportations"
                    : n === "imports"
                      ? "Importations"
                      : n === "balanceBiens"
                        ? "Balance des biens"
                        : n === "balanceServices"
                          ? "Balance des services"
                          : "Transactions courantes",
                ]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(v) =>
                  v === "exports"
                    ? "Exportations"
                    : v === "imports"
                      ? "Importations"
                      : v === "balanceServices"
                        ? "Balance des services"
                        : "Transactions courantes"
                }
              />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="exports" fill={COULEUR.exports} radius={[2, 2, 0, 0]} />
              <Bar dataKey="imports" fill={COULEUR.imports} radius={[2, 2, 0, 0]} />
              <Line
                type="monotone"
                dataKey="balanceServices"
                stroke={COULEUR.services}
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="courant"
                stroke={COULEUR.courant}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Repartition par pays */}
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-3">
          <h2 className="text-base md:text-lg font-semibold">
            Qui exporte, qui importe
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Exercice {data.derniereAnnee} · milliards de FCFA · classé par
            exportations. Les parts se rapportent à la somme des huit pays
            ({fmtMds(data.sommePaysExports)} Mds), et non à l&apos;agrégat de
            l&apos;Union ({fmtMds(data.totalExports)} Mds) : celui-ci retranche
            le commerce intra-UMOA, ce qu&apos;un pays vend à son voisin
            n&apos;étant pas une exportation de la zone.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className="text-left px-4 md:px-6 py-2 text-xs font-semibold text-slate-600">
                  Pays
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                  Exportations
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                  Importations
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                  Balance
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-slate-600">
                  Couverture
                </th>
                <th className="text-right px-4 md:px-6 py-2 text-xs font-semibold text-slate-600">
                  Part des exports
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.pays.map((p) => (
                <tr key={p.code} className="hover:bg-slate-50">
                  <td className="px-4 md:px-6 py-2 font-medium text-slate-800">{p.nom}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMds(p.exports)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMds(p.imports)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${
                      p.balance === null
                        ? "text-slate-300"
                        : p.balance >= 0
                          ? "text-green-700"
                          : "text-red-700"
                    }`}
                  >
                    {fmtMds(p.balance)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      p.couverture === null
                        ? "text-slate-300"
                        : p.couverture >= 1
                          ? "text-green-700"
                          : "text-slate-700"
                    }`}
                  >
                    {fmtPct(p.couverture, 0)}
                  </td>
                  <td className="px-4 md:px-6 py-2 text-right tabular-nums text-slate-600">
                    {fmtPct(p.partExports, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 md:px-6 py-3 border-t border-slate-100" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.pays} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(v) => fmtMds(Number(v))}
              />
              <YAxis
                type="category"
                dataKey="nom"
                tick={{ fontSize: 10, fill: "#64748b" }}
                width={92}
              />
              <Tooltip
                formatter={(v) => [fmtMds(Number(v), 1) + " Mds FCFA", "Balance des biens"]}
                contentStyle={{ fontSize: 12 }}
              />
              <ReferenceLine x={0} stroke="#94a3b8" />
              <Bar dataKey="balance" radius={[0, 2, 2, 0]}>
                {data.pays.map((p) => (
                  <Cell
                    key={p.code}
                    fill={(p.balance ?? 0) >= 0 ? COULEUR.exports : COULEUR.imports}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Change */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <div className="mb-4">
          <h2 className="text-base md:text-lg font-semibold">
            Le franc CFA face aux devises de facturation
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Le FCFA est arrimé à l&apos;euro à parité fixe : c&apos;est donc
            l&apos;euro qui détermine son cours face au dollar, monnaie dans
            laquelle se facturent le cacao, le coton, l&apos;or et le pétrole.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {changeSpots.map((s) => (
            <Chiffre
              key={s.pair}
              label={s.pair}
              valeur={s.latest.toLocaleString("fr-FR", {
                minimumFractionDigits: s.pair === "EUR/FCFA" ? 3 : 4,
                maximumFractionDigits: 4,
              })}
              unite={s.latestLabel}
              couleur="#0f172a"
            />
          ))}
        </div>
      </section>

      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-xs text-blue-900">
        <span className="font-medium">Source :</span> BCEAO, balance des paiements
        au format BPM6 (feuille « BP VI »). Données <b>annuelles</b>, publiées avec
        un décalage : le reste de cette page suit le bulletin mensuel, ce bloc suit
        l&apos;exercice comptable. Les statistiques douanières mensuelles ne
        figurent pas dans nos sources.
      </div>
    </div>
  );
}

function Chiffre({
  label,
  valeur,
  unite,
  couleur,
}: {
  label: string;
  valeur: string;
  unite: string;
  couleur: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-lg md:text-xl font-semibold tabular-nums" style={{ color: couleur }}>
        {valeur}
      </div>
      <div className="text-[11px] text-slate-400 mt-0.5">{unite}</div>
    </div>
  );
}

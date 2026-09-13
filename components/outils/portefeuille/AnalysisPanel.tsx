"use client";

import type { AnalysePortefeuille } from "@/lib/comptetitre/analyse";

type Props = { analyse: AnalysePortefeuille };

const Z_95 = 1.645;
const SEANCES_AN = 252;

function fmtFcfa(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

function fmtPct(v: number | null, dec = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;
}

function fmtNum(v: number | null, dec = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/**
 * Panneau d'analyse.
 *
 * Le taux sans risque et le rendement du marche ne sont ni affiches ni
 * modifiables : ils viennent des donnees du site — taux directeur BCEAO et
 * performance annualisee du BRVM Composite sur cinq ans — et sont appliques
 * cote serveur. Rien n'est recalcule ici, le composant met en forme.
 */
export default function AnalysisPanel({ analyse }: Props) {
  // La volatilite affichee reste quotidienne ; la VaR, elle, est annuelle.
  const volAnnuelle =
    analyse.volatilitePortefeuille === null
      ? null
      : analyse.volatilitePortefeuille * Math.sqrt(SEANCES_AN);
  const var95 =
    volAnnuelle === null ? null : (Z_95 * volAnnuelle * analyse.montant) / 100;

  const kpis = [
    { l: "Montant investi", v: fmtFcfa(analyse.montant), s: "FCFA · valorisation" },
    { l: "Rentabilité espérée", v: fmtPct(analyse.rentabiliteEsperee), s: "MEDAF" },
    { l: "Bêta du portefeuille", v: fmtNum(analyse.betaPortefeuille), s: "vs BRVM Composite" },
    {
      l: "Volatilité du portefeuille",
      v: fmtPct(analyse.volatilitePortefeuille),
      s: `par séance · ${fmtPct(volAnnuelle, 1)} annualisée`,
    },
    { l: "VaR du portefeuille", v: fmtFcfa(var95), s: "95 % à 1 an" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.l} className="bg-white border border-slate-200 rounded-lg px-3.5 py-3">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="text-lg font-semibold tabular-nums mt-0.5">{k.v}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{k.s}</div>
          </div>
        ))}
      </div>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <h3 className="px-4 py-2.5 text-sm font-semibold border-b border-slate-200 bg-slate-50">
          Détail par actif
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Actif</th>
                <th className="px-2 py-2 text-right font-medium">Volatilité</th>
                <th className="px-2 py-2 text-right font-medium">Bêta</th>
                <th className="px-2 py-2 text-right font-medium">Rdt attendu</th>
                <th className="px-2 py-2 text-right font-medium">PRU</th>
                <th className="px-2 py-2 text-right font-medium">Cours</th>
                <th className="px-2 py-2 text-right font-medium">Quantité</th>
                <th className="px-2 py-2 text-right font-medium">Prix de revient</th>
                <th className="px-2 py-2 text-right font-medium">Part</th>
                <th className="px-2 py-2 text-right font-medium">Valorisation</th>
                <th className="px-2 py-2 text-right font-medium">Part</th>
                <th className="px-2 py-2 text-right font-medium">Différence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analyse.lignes.map((l) => (
                <tr key={l.code} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <span className="font-medium">{l.code}</span>
                    <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                      {l.nom}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtPct(l.volatilite)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtNum(l.beta)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtPct(l.rendementAttendu)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtFcfa(l.pru)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtFcfa(l.cours)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtFcfa(l.quantite)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtFcfa(l.prixRevient)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                    {fmtPct(l.partRevient, 1)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtFcfa(l.valorisation)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                    {fmtPct(l.partValorisation, 1)}
                  </td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums font-medium ${
                      l.difference < 0 ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {fmtFcfa(l.difference)}
                  </td>
                </tr>
              ))}
              {analyse.lignes.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-slate-500">
                    Aucune position ouverte à analyser.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-xs leading-relaxed">
        {analyse.sansHistorique.length > 0 && (
          <p className="text-amber-700">
            Historique insuffisant pour {analyse.sansHistorique.join(", ")} :
            ces lignes figurent au tableau mais n&apos;entrent pas dans la
            volatilité ni dans la VaR du portefeuille.
          </p>
        )}
      </div>
    </div>
  );
}

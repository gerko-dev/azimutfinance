import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getBrokerageStats,
  listMarketFees,
  listTpsRates,
} from "@/lib/comptetitre/queries";
import MarketFeesEditor from "@/components/admin/MarketFeesEditor";
import TpsRatesEditor from "@/components/admin/TpsRatesEditor";
import BrokerageStatsCards from "@/components/admin/BrokerageStatsCards";

export const dynamic = "force-dynamic";

export default async function AdminCompteTitrePage() {
  await requireAdmin(2);

  const [stats, marketFees, tpsRates] = await Promise.all([
    getBrokerageStats(),
    listMarketFees(),
    listTpsRates(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/admin" className="hover:text-slate-700">
            Admin
          </Link>{" "}
          &rsaquo;{" "}
          <span className="text-slate-700">Suivi de compte titre</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">
          Suivi de compte titre — administration
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Statistiques globales, frais marché (BRVM, DC/BR) et taux TPS par pays UEMOA.
          Toute modification s&apos;applique immédiatement aux nouvelles transactions.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Statistiques globales
        </h2>
        {stats ? (
          <BrokerageStatsCards stats={stats} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-500">
            Statistiques indisponibles (RPC non exécutable).
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Frais marché — BRVM &amp; DC/BR
        </h2>
        <p className="text-xs text-slate-500 mb-2">
          Commission de bourse et frais du dépositaire central. Appliqués
          automatiquement à chaque achat/vente de tous les utilisateurs.
        </p>
        <MarketFeesEditor fees={marketFees} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Taux TPS par pays UEMOA
        </h2>
        <p className="text-xs text-slate-500 mb-2">
          Taxe sur prestation de services appliquée au courtage SGI. Le pays appliqué
          est celui de la SGI choisie par l&apos;utilisateur sur son compte.
        </p>
        <TpsRatesEditor rates={tpsRates} />
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">À savoir</h3>
        <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
          <li>
            <strong>Courtage SGI</strong> : paramétré par chaque utilisateur (taux et
            minimum) sur son compte. Cette page ne le modifie pas.
          </li>
          <li>
            <strong>Frais BRVM &amp; DC/BR</strong> : appliqués sur le brut de chaque
            transaction. Modifiables ici, l&apos;effet est immédiat sur les nouvelles
            saisies.
          </li>
          <li>
            <strong>TPS</strong> : taxe appliquée sur le courtage SGI uniquement (pas
            sur le brut). Le taux dépend du pays UEMOA de la SGI sélectionné par
            l&apos;utilisateur.
          </li>
          <li>
            <strong>Vente à découvert</strong> interdite et <strong>retrait avec
            cash insuffisant</strong> refusé — vérifications systématiques côté serveur
            lors de chaque saisie.
          </li>
          <li>
            Les transactions déjà saisies <strong>ne sont pas recalculées</strong>{" "}
            rétroactivement après modification d&apos;un taux.
          </li>
        </ul>
      </section>
    </div>
  );
}

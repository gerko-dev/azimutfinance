import Link from "next/link";

export const metadata = {
  title: "Fund management — Vue d'ensemble",
};

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
      <div className="text-base md:text-lg font-semibold text-white font-mono mt-1">{value}</div>
      {sub && <div className="text-[10px] mt-0.5 text-slate-500 truncate">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-700 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
        {subtitle && <span className="text-[10px] text-slate-500">· {subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

export default function FundManagementOverviewPage() {
  return (
    <div className="space-y-5">
      {/* KPIs — placeholder tant que la donnee n'est pas branchee */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Fonds gérés" value="—" sub="aucun fonds rattaché" />
        <Kpi label="Encours total" value="—" sub="FCFA" />
        <Kpi label="Ordres en attente" value="—" sub="souscriptions / rachats" />
        <Kpi label="Investisseurs" value="—" sub="comptes actifs" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card title="Activité récente" subtitle="ordres & mouvements">
            <div className="p-10 text-center text-sm text-slate-500">
              Aucune activité pour le moment.
              <div className="mt-2 text-[12px] text-slate-600">
                Le suivi des souscriptions, rachats et valorisations apparaîtra ici une fois la
                gestion configurée.
              </div>
            </div>
          </Card>
        </div>

        <Card title="Démarrage" subtitle="à configurer">
          <ul className="p-4 space-y-2 text-sm text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">1.</span>
              <span>
                Renseigner les informations de la société de gestion dans{" "}
                <Link
                  href="/pros/fund-management/parametres"
                  className="text-blue-300 hover:text-blue-200 transition"
                >
                  Paramètres
                </Link>
                .
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-600 mt-0.5">2.</span>
              <span className="text-slate-500">Rattacher les fonds gérés (bientôt).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-600 mt-0.5">3.</span>
              <span className="text-slate-500">
                Activer le suivi des ordres et le reporting investisseurs (bientôt).
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

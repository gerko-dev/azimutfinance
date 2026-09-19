import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listPricingPlans,
  listPromoCodes,
  listTrialConfigs,
  listUserTrials,
} from "@/lib/premium/pricingQueries";
import { formatFcfa } from "@/lib/premium/plans";

export const dynamic = "force-dynamic";

export default async function TarificationOverviewPage() {
  await requireAdmin(1);

  const [plans, promos, trialConfigs, userTrials] = await Promise.all([
    listPricingPlans({ includeInactive: true }),
    listPromoCodes(),
    listTrialConfigs(),
    listUserTrials(5),
  ]);

  const activePlans = plans.filter((p) => p.active);
  const activePromos = promos.filter((p) => p.active);
  const activeTrials = trialConfigs.filter((t) => t.active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tarification</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gère les prix Premium, les codes de réduction et les périodes
          d&apos;essai gratuites. Les modifications sont visibles immédiatement
          sur la page publique <code>/premium</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SectionCard
          href="/admin/tarification/plans"
          icon="💎"
          title="Plans Premium"
          count={plans.length}
          countLabel={`${activePlans.length} actifs`}
          description="Mensuel, semestriel, annuel — prix, durée, réduction affichée."
        />
        <SectionCard
          href="/admin/tarification/promos"
          icon="🎁"
          title="Codes de réduction"
          count={promos.length}
          countLabel={`${activePromos.length} actifs`}
          description="Codes promotionnels avec % ou montant fixe, validité et quotas."
        />
        <SectionCard
          href="/admin/tarification/essai"
          icon="🎟️"
          title="Essai gratuit"
          count={trialConfigs.length}
          countLabel={`${activeTrials.length} actifs · ${userTrials.length} utilisés`}
          description="Durée de la période d'essai et utilisateurs ayant déjà essayé."
        />
      </div>

      {/* Aperçu rapide des plans */}
      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Plans actifs sur /premium
          </h2>
          <Link
            href="/admin/tarification/plans"
            className="text-xs text-blue-700 hover:underline"
          >
            Gérer les plans →
          </Link>
        </div>
        {activePlans.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-8">
            Aucun plan actif — la page /premium utilisera les valeurs par défaut
            du code.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activePlans.map((p) => (
              <div
                key={p.code}
                className="px-4 py-3 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900">
                    {p.label}
                    {p.highlight && (
                      <span className="ml-2 text-[10px] uppercase font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                        Mis en avant
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.duration_label} ·{" "}
                    <span className="font-mono text-[10px]">{p.code}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">
                    {formatFcfa(p.price_fcfa)}
                  </div>
                  {p.discount_pct > 0 && (
                    <div className="text-[10px] text-emerald-700 font-medium">
                      −{p.discount_pct}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionCard({
  href,
  icon,
  title,
  count,
  countLabel,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  count: number;
  countLabel: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition"
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-2xl" aria-hidden>
          {icon}
        </span>
        <span className="text-2xl font-bold tabular-nums text-slate-900">
          {count}
        </span>
      </div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{countLabel}</div>
      <div className="text-xs text-slate-600 mt-2 leading-relaxed">
        {description}
      </div>
    </Link>
  );
}

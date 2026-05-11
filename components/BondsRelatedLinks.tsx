import Link from "next/link";

type Slug = "courbe" | "surveillance" | "calendrier";

const PAGES: Record<
  Slug,
  { href: string; icon: string; title: string; description: string; accent: string }
> = {
  courbe: {
    href: "/marches/obligations/courbe-taux",
    icon: "📊",
    title: "Courbe des taux BRVM",
    description: "YTM actuariel, régression calibrable par signature.",
    accent: "bg-violet-500",
  },
  surveillance: {
    href: "/marches/obligations/surveillance",
    icon: "🔎",
    title: "À surveiller",
    description: "Anomalies de YTM repérées par z-score sur cohorte.",
    accent: "bg-indigo-500",
  },
  calendrier: {
    href: "/marches/obligations/calendrier",
    icon: "📅",
    title: "Calendrier obligataire",
    description: "12 mois de coupons, amortissements et remboursements.",
    accent: "bg-emerald-500",
  },
};

type Props = {
  /** Page courante, exclue de la liste affichée. */
  current: Slug;
};

/**
 * Pied de page de navigation entre les 3 outils Premium obligataires :
 * la page courante est exclue, on affiche les 2 autres en mini-cards.
 */
export default function BondsRelatedLinks({ current }: Props) {
  const others = (Object.keys(PAGES) as Slug[]).filter((k) => k !== current);
  return (
    <section className="mt-8 md:mt-10">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base md:text-lg font-semibold text-slate-900">
          Voir aussi
        </h2>
        <Link
          href="/marches/obligations"
          className="text-xs md:text-sm text-slate-500 hover:text-slate-900 transition"
        >
          ← Retour aux obligations cotées
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {others.map((slug) => {
          const p = PAGES[slug];
          return (
            <Link
              key={slug}
              href={p.href}
              className="group relative flex items-start gap-3 bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden"
            >
              <span
                className={`absolute left-0 top-0 bottom-0 w-1 ${p.accent}`}
                aria-hidden
              />
              <span
                className="text-2xl ml-1 shrink-0"
                aria-hidden
              >
                {p.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 group-hover:text-blue-700 transition">
                  {p.title}
                </div>
                <div className="text-xs md:text-sm text-slate-600 mt-0.5">
                  {p.description}
                </div>
              </div>
              <span
                className="text-slate-400 group-hover:text-blue-700 transition shrink-0"
                aria-hidden
              >
                →
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

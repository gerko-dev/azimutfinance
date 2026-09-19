import Link from "next/link";

type Crumb = { label: string; href?: string };

/**
 * Bandeau « hero » standard du site public : fond dégradé bleu nuit, fil
 * d'Ariane optionnel, H1 blanc, description optionnelle, et un emplacement
 * `children` pour des KPIs / badges éventuels.
 *
 * Reprend exactement le style des pages Actions BRVM et Obligations cotées.
 * À placer en haut de page, juste après <Header /> (et <Ticker /> le cas
 * échéant), hors du conteneur `max-w-*` — le hero gère sa propre largeur.
 */
export default function PageHero({
  title,
  subtitle,
  breadcrumb,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  breadcrumb?: Crumb[];
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="text-xs md:text-sm text-slate-400 mb-2 flex items-center flex-wrap gap-x-2 gap-y-1">
            {breadcrumb.map((c, i) => (
              <span key={i} className="flex items-center gap-x-2">
                {i > 0 && <span className="text-slate-500">›</span>}
                {c.href ? (
                  <Link href={c.href} className="hover:text-white transition">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-slate-200">{c.label}</span>
                )}
              </span>
            ))}
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-semibold text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm md:text-base text-slate-300 max-w-3xl mt-2">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}

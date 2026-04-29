import Link from "next/link";

type Crumb = { label: string; href?: string };

/**
 * En-tete de page standard pour les pages internes du Pro Terminal.
 * Utilise le ton sombre, sans dupliquer la sidebar / topbar deja
 * fournis par app/pros/layout.tsx.
 */
export default function ProPageHeader({
  title,
  subtitle,
  breadcrumb,
  badge,
  right,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: Crumb[];
  badge?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-800 pb-4 mb-5 flex items-end justify-between flex-wrap gap-3">
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="text-[11px] text-slate-500 mb-2 flex items-center flex-wrap gap-1.5">
            {breadcrumb.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-700">›</span>}
                {c.href ? (
                  <Link
                    href={c.href}
                    className="hover:text-slate-300 transition"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-slate-400">{c.label}</span>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl md:text-2xl font-semibold text-white">
            {title}
          </h1>
          {badge && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-slate-400 mt-1.5 max-w-3xl">{subtitle}</p>
        )}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

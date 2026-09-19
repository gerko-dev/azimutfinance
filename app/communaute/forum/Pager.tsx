import Link from "next/link";

/**
 * Pagination simple "Précédent / Page X sur Y / Suivant".
 * `baseHref` est l'URL sans le param p (ex: /communaute/forum/c/actions).
 */
export default function Pager({
  baseHref,
  page,
  pageSize,
  total,
}: {
  baseHref: string;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function href(p: number): string {
    if (p <= 1) return baseHref;
    const sep = baseHref.includes("?") ? "&" : "?";
    return `${baseHref}${sep}p=${p}`;
  }

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 mt-5 text-xs"
    >
      {hasPrev ? (
        <Link
          href={href(prev)}
          className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        >
          ← Précédent
        </Link>
      ) : (
        <span className="px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-slate-400">
          ← Précédent
        </span>
      )}

      <span className="text-slate-500 tabular-nums">
        Page <span className="font-semibold text-slate-900">{page}</span> sur{" "}
        <span className="font-semibold text-slate-900">{totalPages}</span>
        <span className="text-slate-400"> · {total} sujets</span>
      </span>

      {hasNext ? (
        <Link
          href={href(next)}
          className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        >
          Suivant →
        </Link>
      ) : (
        <span className="px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-slate-400">
          Suivant →
        </span>
      )}
    </nav>
  );
}

export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

import Link from "next/link";
import { getMagazineCounts } from "@/lib/magazine/queries";
import { fmtNumber } from "@/components/admin/format";

export const dynamic = "force-dynamic";

export default async function MagazineOverviewPage() {
  const counts = await getMagazineCounts();
  const totalHours = Math.round(counts.totalReadingMinutes / 60);

  const cards: {
    href: string;
    label: string;
    value: string;
    sub: string;
  }[] = [
    {
      href: "/admin/magazine/numeros",
      label: "Numéros publiés",
      value: fmtNumber(counts.issues),
      sub: "Numéros mensuels d'Azimut Magazine",
    },
    {
      href: "/admin/magazine/articles",
      label: "Articles publiés",
      value: fmtNumber(counts.articles),
      sub: `${totalHours} h de lecture cumulée`,
    },
    {
      href: "/admin/magazine/auteurs",
      label: "Auteurs",
      value: fmtNumber(counts.authors),
      sub: "Signataires du magazine",
    },
    {
      href: "/admin/magazine/newsletter",
      label: "Abonnés newsletter",
      value: fmtNumber(counts.subscribers),
      sub: "Abonnés actifs",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:shadow-sm transition"
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              {c.label}
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1 text-slate-900">
              {c.value}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{c.sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href="/admin/magazine/numeros/nouveau"
          className="bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition"
        >
          <div className="text-sm font-semibold text-slate-900">
            + Préparer un nouveau numéro
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Créez la prochaine édition mensuelle, puis ajoutez ses articles.
          </div>
        </Link>
        <Link
          href="/admin/magazine/articles/nouveau"
          className="bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition"
        >
          <div className="text-sm font-semibold text-slate-900">
            ✍️ Rédiger un article
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Construisez un article avec des paragraphes, citations, callouts et stats.
          </div>
        </Link>
      </div>
    </div>
  );
}

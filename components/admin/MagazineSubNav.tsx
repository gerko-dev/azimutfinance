"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; match?: (p: string) => boolean }[] = [
  {
    href: "/admin/magazine",
    label: "Vue d'ensemble",
    match: (p) => p === "/admin/magazine",
  },
  {
    href: "/admin/magazine/numeros",
    label: "Numéros",
    match: (p) => p.startsWith("/admin/magazine/numeros"),
  },
  {
    href: "/admin/magazine/articles",
    label: "Articles",
    match: (p) => p.startsWith("/admin/magazine/articles"),
  },
  {
    href: "/admin/magazine/auteurs",
    label: "Auteurs",
    match: (p) => p.startsWith("/admin/magazine/auteurs"),
  },
  {
    href: "/admin/magazine/newsletter",
    label: "Newsletter",
    match: (p) => p.startsWith("/admin/magazine/newsletter"),
  },
];

export default function MagazineSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
      {TABS.map((t) => {
        const active = t.match ? t.match(pathname) : pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`text-sm px-3 py-2 -mb-px border-b-2 transition whitespace-nowrap ${
              active
                ? "border-slate-900 text-slate-900 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

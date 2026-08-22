"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ModuleNavItem = {
  label: string;
  href: string;
  soon?: boolean;
};

// Menu interne du module Fund management. Les sections actives pointent vers
// une vraie page ; les sections marquees `soon` sont affichees mais inertes
// tant que leur ecran n'est pas construit.
const ITEMS: ModuleNavItem[] = [
  { label: "Vue d'ensemble", href: "/pros/fund-management" },
  { label: "Fonds gérés", href: "/pros/fund-management/fonds" },
  { label: "Investisseurs", href: "/pros/fund-management/investisseurs", soon: true },
  { label: "Reporting", href: "/pros/fund-management/reporting", soon: true },
  { label: "Paramètres", href: "/pros/fund-management/parametres" },
];

export default function FundManagementNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-slate-800 flex gap-1 overflow-x-auto -mt-1 mb-5">
      {ITEMS.map((item) => {
        const active =
          item.href === "/pros/fund-management"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");

        if (item.soon) {
          return (
            <span
              key={item.href}
              title="Bientôt disponible"
              className="px-3 py-2 text-sm whitespace-nowrap border-b-2 border-transparent -mb-px text-slate-600 cursor-not-allowed flex items-center gap-1.5"
            >
              {item.label}
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                Bientôt
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
              active
                ? "border-blue-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

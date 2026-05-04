"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminLevel } from "@/lib/admin/types";

type NavItem = {
  href: string;
  label: string;
  minLevel: AdminLevel;
  icon: string;
  badgeKey?: "openReports";
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", minLevel: 3, icon: "📊" },
  { href: "/admin/presence", label: "Présence en ligne", minLevel: 3, icon: "🟢" },
  { href: "/admin/membres", label: "Membres", minLevel: 3, icon: "👥" },
  {
    href: "/admin/signalements",
    label: "Signalements",
    minLevel: 3,
    icon: "⚑",
    badgeKey: "openReports",
  },
  { href: "/admin/moderation", label: "Modération", minLevel: 3, icon: "🛡️" },
  { href: "/admin/actualites", label: "Actualités BRVM", minLevel: 2, icon: "📰" },
  { href: "/admin/formations", label: "Formations", minLevel: 2, icon: "🎓" },
  { href: "/admin/inscriptions", label: "Inscriptions", minLevel: 3, icon: "✏️" },
  { href: "/admin/magazine", label: "Magazine", minLevel: 2, icon: "📖" },
  { href: "/admin/saisons", label: "Saisons Ligue Azimut", minLevel: 2, icon: "🎮" },
  { href: "/admin/compte-titre", label: "Suivi compte titre", minLevel: 2, icon: "💼" },
  { href: "/admin/data", label: "Fichiers de données", minLevel: 1, icon: "📁" },
  { href: "/admin/audit", label: "Journal d'audit", minLevel: 2, icon: "📜" },
];

export default function AdminSidebar({
  level,
  openReportsCount = 0,
}: {
  level: AdminLevel;
  openReportsCount?: number;
}) {
  const pathname = usePathname();
  const items = NAV.filter((it) => level <= it.minLevel);

  return (
    <nav className="lg:sticky lg:top-4">
      <ul className="space-y-0.5">
        {items.map((it) => {
          const active =
            pathname === it.href ||
            (it.href !== "/admin" && pathname.startsWith(it.href));
          const badge =
            it.badgeKey === "openReports" && openReportsCount > 0
              ? openReportsCount
              : null;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm transition ${
                  active
                    ? "bg-slate-900 text-white font-medium"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span aria-hidden>{it.icon}</span>
                <span className="flex-1">{it.label}</span>
                {badge !== null && (
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${
                      active
                        ? "bg-rose-200 text-rose-900"
                        : "bg-rose-600 text-white"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

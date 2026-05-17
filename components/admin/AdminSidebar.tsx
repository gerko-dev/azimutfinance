"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminLevel } from "@/lib/admin/types";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  badgeKey?: "openReports" | "openForumReports";
};

type NavGroup = {
  minLevel: AdminLevel;
  label: string;
  color: string;
  items: NavItem[];
};

const GROUPS: NavGroup[] = [
  {
    minLevel: 1,
    label: "Super admin",
    color: "#dc2626",
    items: [
      { href: "/admin", label: "Dashboard", icon: "📊" },
      { href: "/admin/presence", label: "Présence en ligne", icon: "🟢" },
      { href: "/admin/membres", label: "Membres", icon: "👥" },
      { href: "/admin/tarification", label: "Tarification", icon: "💰" },
      { href: "/admin/audit", label: "Journal d'audit", icon: "📜" },
      { href: "/admin/sources", label: "Sources & méthodologie", icon: "📚" },
    ],
  },
  {
    minLevel: 2,
    label: "Modérateur",
    color: "#b45309",
    items: [
      { href: "/admin/abonnements", label: "Abonnements Premium", icon: "⭐" },
      { href: "/admin/demandes-pro", label: "Demandes Pro", icon: "🏢" },
      { href: "/admin/moderation", label: "Modération", icon: "🛡️" },
      {
        href: "/admin/signalements",
        label: "Signalements",
        icon: "⚑",
        badgeKey: "openReports",
      },
      {
        href: "/admin/signalements-forum",
        label: "Signalements forum",
        icon: "💬",
        badgeKey: "openForumReports",
      },
      { href: "/admin/inscriptions", label: "Inscriptions", icon: "✏️" },
      { href: "/admin/email-templates", label: "Templates emails", icon: "✉️" },
      { href: "/admin/saisons", label: "Saisons Ligue Azimut", icon: "🎮" },
      { href: "/admin/compte-titre", label: "Suivi compte titre", icon: "💼" },
    ],
  },
  {
    minLevel: 3,
    label: "Éditeur",
    color: "#059669",
    items: [
      { href: "/admin/actualites", label: "Actualités BRVM", icon: "📰" },
      { href: "/admin/formations", label: "Formations", icon: "🎓" },
      { href: "/admin/magazine", label: "Magazine", icon: "📖" },
      { href: "/admin/data", label: "Fichiers de données", icon: "📁" },
    ],
  },
];

export default function AdminSidebar({
  level,
  openReportsCount = 0,
  openForumReportsCount = 0,
}: {
  level: AdminLevel;
  openReportsCount?: number;
  openForumReportsCount?: number;
}) {
  const pathname = usePathname();
  const visibleGroups = GROUPS.filter((g) => level <= g.minLevel);

  return (
    <nav className="lg:sticky lg:top-4">
      <div className="space-y-4">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <div className="flex items-center gap-1.5 px-3 mb-1.5">
              <span
                aria-hidden
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: group.color }}
              />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
              </span>
              <span className="text-[10px] font-medium text-slate-400 tabular-nums">
                · N{group.minLevel}
                {group.minLevel > 1 ? "+" : ""}
              </span>
            </div>
            <ul className="space-y-0.5">
              {group.items.map((it) => {
                const active =
                  pathname === it.href ||
                  (it.href !== "/admin" &&
                    pathname.startsWith(it.href + "/"));
                const badge =
                  it.badgeKey === "openReports" && openReportsCount > 0
                    ? openReportsCount
                    : it.badgeKey === "openForumReports" &&
                        openForumReportsCount > 0
                      ? openForumReportsCount
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
          </div>
        ))}
      </div>
    </nav>
  );
}

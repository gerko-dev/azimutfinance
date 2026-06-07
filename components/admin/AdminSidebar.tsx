"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AdminLevel } from "@/lib/admin/types";

// `minLevel` = niveau le moins privilégié autorisé à voir l'entrée (1 = super
// admin uniquement, 2 = super admin + modérateur, 3 = tous). Un admin voit
// l'entrée si `level <= minLevel`. Les valeurs ci-dessous reprennent à
// l'identique les autorisations historiques ; seul le REGROUPEMENT change :
// on classe désormais par domaine fonctionnel (tâche) plutôt que par rang.
type NavItem = {
  href: string;
  label: string;
  icon: string;
  minLevel: AdminLevel;
  badgeKey?: "openReports" | "openForumReports";
};

type NavGroup = {
  label: string;
  color: string;
  items: NavItem[];
};

const GROUPS: NavGroup[] = [
  {
    label: "Pilotage",
    color: "#2563eb",
    items: [
      { href: "/admin", label: "Dashboard", icon: "📊", minLevel: 1 },
      { href: "/admin/presence", label: "Présence en ligne", icon: "🟢", minLevel: 1 },
      { href: "/admin/audit", label: "Journal d'audit", icon: "📜", minLevel: 1 },
    ],
  },
  {
    label: "Membres & abonnements",
    color: "#7c3aed",
    items: [
      { href: "/admin/membres", label: "Membres", icon: "👥", minLevel: 1 },
      { href: "/admin/inscriptions", label: "Inscriptions", icon: "✏️", minLevel: 2 },
      { href: "/admin/abonnements", label: "Abonnements Premium", icon: "⭐", minLevel: 2 },
      { href: "/admin/demandes-pro", label: "Demandes Pro", icon: "🏢", minLevel: 2 },
      { href: "/admin/tarification", label: "Tarification", icon: "💰", minLevel: 1 },
      { href: "/admin/compte-titre", label: "Suivi compte titre", icon: "💼", minLevel: 2 },
    ],
  },
  {
    label: "Modération & communauté",
    color: "#b45309",
    items: [
      { href: "/admin/moderation", label: "Modération", icon: "🛡️", minLevel: 2 },
      {
        href: "/admin/signalements",
        label: "Signalements",
        icon: "⚑",
        minLevel: 2,
        badgeKey: "openReports",
      },
      {
        href: "/admin/signalements-forum",
        label: "Signalements forum",
        icon: "💬",
        minLevel: 2,
        badgeKey: "openForumReports",
      },
      { href: "/admin/saisons", label: "Saisons Ligue Azimut", icon: "🎮", minLevel: 2 },
    ],
  },
  {
    label: "Contenu",
    color: "#059669",
    items: [
      { href: "/admin/actualites", label: "Actualités BRVM", icon: "📰", minLevel: 3 },
      { href: "/admin/magazine", label: "Magazine", icon: "📖", minLevel: 3 },
      { href: "/admin/formations", label: "Formations", icon: "🎓", minLevel: 3 },
      { href: "/admin/rapports", label: "Rapports", icon: "📑", minLevel: 3 },
    ],
  },
  {
    label: "Données & configuration",
    color: "#475569",
    items: [
      { href: "/admin/data", label: "Fichiers de données", icon: "📁", minLevel: 3 },
      { href: "/admin/sources", label: "Sources & méthodologie", icon: "📚", minLevel: 1 },
      { href: "/admin/email-templates", label: "Templates emails", icon: "✉️", minLevel: 2 },
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
  // Chaque groupe n'affiche que les entrées autorisées pour le niveau courant ;
  // un groupe sans entrée visible est masqué.
  const visibleGroups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => level <= it.minLevel),
  })).filter((g) => g.items.length > 0);

  const isItemActive = (href: string) =>
    pathname === href ||
    (href !== "/admin" && pathname.startsWith(href + "/"));

  // Nombre de signalements ouverts portés par une entrée donnée.
  const itemBadge = (it: NavItem) =>
    it.badgeKey === "openReports"
      ? openReportsCount
      : it.badgeKey === "openForumReports"
        ? openForumReportsCount
        : 0;

  // Le groupe qui contient la page active.
  const activeGroupLabel = visibleGroups.find((g) =>
    g.items.some((it) => isItemActive(it.href)),
  )?.label;

  // Accordéon : un seul groupe ouvert à la fois. Par défaut celui de la page
  // active (sinon le premier). On garde la page active ouverte au fil de la
  // navigation en ajustant l'état pendant le rendu (pattern React recommandé,
  // cf. « You Might Not Need an Effect »).
  const [openLabel, setOpenLabel] = useState<string | null>(
    () => activeGroupLabel ?? visibleGroups[0]?.label ?? null,
  );
  const [prevActive, setPrevActive] = useState(activeGroupLabel);
  if (activeGroupLabel && activeGroupLabel !== prevActive) {
    setPrevActive(activeGroupLabel);
    setOpenLabel(activeGroupLabel);
  }

  return (
    <nav className="lg:sticky lg:top-4">
      <div className="space-y-1">
        {visibleGroups.map((group) => {
          const open = openLabel === group.label;
          const groupBadge = group.items.reduce((n, it) => n + itemBadge(it), 0);
          return (
            <div key={group.label}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenLabel(open ? null : group.label)}
                className="flex w-full items-center gap-2 px-3 py-2 rounded text-left transition hover:bg-slate-100"
              >
                <span
                  aria-hidden
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: group.color }}
                />
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {group.label}
                </span>
                {!open && groupBadge > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums bg-rose-600 text-white">
                    {groupBadge}
                  </span>
                )}
                <span
                  aria-hidden
                  className={`text-slate-400 text-xs transition-transform ${open ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
              </button>
              {open && (
                <ul className="space-y-0.5 mt-0.5">
                  {group.items.map((it) => {
                    const active = isItemActive(it.href);
                    const badge = itemBadge(it) > 0 ? itemBadge(it) : null;
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
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

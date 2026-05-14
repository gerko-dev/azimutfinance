"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Season } from "@/lib/simulator/types";
import { fmtFCFA } from "./format";

type NavItem = {
  href: string;
  label: string;
  badge?: string | number | null;
};

type Props = {
  children: ReactNode;
  season: Season;
  cash: number;
  marketValue: number;
  totalValue: number;
  initialCapital: number;
  myRank: number | null;
  totalPlayers: number;
  openOrdersCount: number;
  realizedPL: number;
  unrealizedPL: number;
};

export default function SimulatorShell({
  children,
  season,
  cash,
  marketValue,
  totalValue,
  initialCapital,
  myRank,
  totalPlayers,
  openOrdersCount,
  realizedPL,
  unrealizedPL,
}: Props) {
  const pathname = usePathname();
  const base = "/academie/simulateur";

  const nav: NavItem[] = [
    { href: `${base}`, label: "Aperçu" },
    { href: `${base}/marche`, label: "Marché" },
    { href: `${base}/carnet`, label: "Carnet d’ordres" },
    { href: `${base}/watchlist`, label: "Watchlist" },
    { href: `${base}/positions`, label: "Positions" },
    {
      href: `${base}/ordres`,
      label: "Ordres",
      badge: openOrdersCount > 0 ? openOrdersCount : null,
    },
    { href: `${base}/performance`, label: "Performance" },
    {
      href: `${base}/classement`,
      label: "Classement",
      badge: myRank ? `#${myRank}` : null,
    },
    { href: `${base}/journal`, label: "Journal" },
  ];

  const totalReturn =
    initialCapital > 0 ? ((totalValue - initialCapital) / initialCapital) * 100 : 0;
  const totalPL = realizedPL + unrealizedPL;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="grid grid-cols-[220px_1fr] min-h-screen">
        {/* SIDEBAR */}
        <aside className="bg-slate-900 text-slate-100 flex flex-col">
          {/* Brand */}
          <Link
            href="/"
            className="px-4 py-4 border-b border-slate-800 hover:bg-slate-800 transition"
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              AzimutFinance
            </div>
            <div className="text-sm font-bold text-white">Ligue Azimut</div>
          </Link>

          {/* Nav */}
          <nav className="flex-1 py-3 px-2 space-y-0.5">
            {nav.map((item) => {
              const isActive =
                item.href === base
                  ? pathname === base || pathname === `${base}/`
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded text-sm transition ${
                    isActive
                      ? "bg-amber-600 text-white font-semibold"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge != null && (
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-slate-700 text-slate-200"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Portfolio panel (sticky bottom) */}
          <div className="border-t border-slate-800 p-3 space-y-2 text-xs">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
              Portefeuille
            </div>
            <div className="space-y-1.5">
              <Stat label="Cash" value={`${fmtFCFA(cash)}`} />
              <Stat label="Valorisation" value={`${fmtFCFA(marketValue)}`} />
              <Stat
                label="Total"
                value={`${fmtFCFA(totalValue)}`}
                bold
              />
              <div className="h-px bg-slate-800 my-1" />
              <Stat
                label="P&L total"
                value={`${totalPL >= 0 ? "+" : ""}${fmtFCFA(totalPL)}`}
                accent={totalPL >= 0 ? "text-emerald-400" : "text-rose-400"}
              />
              <Stat
                label="Perf"
                value={`${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(2).replace(".", ",")} %`}
                accent={totalReturn >= 0 ? "text-emerald-400" : "text-rose-400"}
                bold
              />
            </div>
            <div className="h-px bg-slate-800 my-2" />
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
              Saison
            </div>
            <div className="text-[11px] text-slate-300 truncate">{season.name}</div>
            <div className="text-[10px] text-slate-500">
              {totalPlayers} joueur(s) ·{" "}
              <span
                className={`uppercase font-semibold ${
                  season.status === "intro"
                    ? "text-amber-400"
                    : season.status === "active"
                    ? "text-emerald-400"
                    : "text-slate-400"
                }`}
              >
                {season.status === "intro"
                  ? "Course intro"
                  : season.status === "active"
                  ? "Active"
                  : season.status}
              </span>
            </div>
          </div>
        </aside>

        {/* CONTENT */}
        <main className="flex flex-col min-w-0">{children}</main>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-slate-400 text-[10px] uppercase">{label}</span>
      <span
        className={`tabular-nums ${bold ? "font-bold" : ""} ${accent ?? "text-slate-100"}`}
      >
        {value}
      </span>
    </div>
  );
}

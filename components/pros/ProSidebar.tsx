"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = {
  label: string;
  href: string;
  soon?: boolean;
};

type NavSection = {
  label?: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    items: [{ label: "Tableau de bord", href: "/pros" }],
  },
  {
    label: "Marchés",
    items: [
      { label: "Synthèse de clôture", href: "/pros/marche", soon: true },
      { label: "Carte de marché", href: "/pros/heatmap", soon: true },
      { label: "Calendrier financier", href: "/pros/calendrier", soon: true },
    ],
  },
  {
    label: "Analyse",
    items: [
      { label: "Screener actions", href: "/pros/screener" },
      { label: "Screener FCP", href: "/pros/screener-fcp" },
      { label: "Simulateur YTM", href: "/pros/ytm" },
      { label: "Comparateur titres", href: "/pros/comparateur", soon: true },
      { label: "Analyse risque", href: "/pros/risque", soon: true },
    ],
  },
  {
    label: "Positions",
    items: [
      { label: "Portefeuilles", href: "/pros/portefeuilles", soon: true },
      { label: "Watchlists Pro", href: "/pros/watchlists", soon: true },
      { label: "Alertes", href: "/pros/alertes", soon: true },
    ],
  },
  {
    label: "Research",
    items: [
      { label: "Notes & rapports", href: "/pros/research" },
      { label: "Analyses macro", href: "/pros/macro", soon: true },
      { label: "Études sectorielles", href: "/pros/sectoriel", soon: true },
    ],
  },
  {
    label: "Pro tools",
    items: [
      { label: "Place de marché OTC", href: "/pros/otc" },
      { label: "API & exports", href: "/pros/api" },
      { label: "Reporting", href: "/pros/reporting", soon: true },
    ],
  },
];

const FOOTER: NavItem[] = [
  { label: "Paramètres", href: "/pros/parametres", soon: true },
  { label: "Mon entreprise", href: "/pros/entreprise", soon: true },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const base =
    "flex items-center justify-between px-3 py-1.5 rounded-md text-[13px] transition";
  if (item.soon) {
    return (
      <span
        className={`${base} text-slate-500 cursor-not-allowed`}
        title="Bientôt disponible"
      >
        <span>{item.label}</span>
        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
          Bientôt
        </span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className={`${base} ${
        active
          ? "bg-blue-600/20 text-blue-300 border-l-2 border-blue-400 -ml-px pl-[10px]"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      {item.label}
    </Link>
  );
}

export default function ProSidebar({
  collapsed,
  onClose,
}: {
  collapsed: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [openMobile, setOpenMobile] = useState(false);

  const content = (
    <nav className="flex flex-col gap-5 p-4 text-sm">
      {NAV.map((section, idx) => (
        <div key={idx} className="flex flex-col gap-0.5">
          {section.label && (
            <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              {section.label}
            </div>
          )}
          {section.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname === item.href}
            />
          ))}
        </div>
      ))}

      <div className="border-t border-slate-800 pt-4 flex flex-col gap-0.5">
        {FOOTER.map((item) => (
          <NavLink key={item.href} item={item} active={pathname === item.href} />
        ))}
      </div>

      <Link
        href="/"
        className="mt-2 px-3 py-2 text-[12px] text-slate-500 hover:text-slate-300 border border-slate-800 rounded-md hover:border-slate-700 text-center"
      >
        ← Retour au site public
      </Link>
    </nav>
  );

  return (
    <>
      {/* Bouton hamburger mobile */}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="lg:hidden fixed top-3 left-3 z-40 p-2 rounded-md bg-slate-800 text-slate-200 border border-slate-700"
        aria-label="Ouvrir le menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar desktop : fixe a gauche, repliable */}
      <aside
        className={`hidden lg:flex fixed top-0 left-0 bottom-0 w-60 bg-slate-950 border-r border-slate-800 flex-col z-30 transition-transform duration-200 ${
          collapsed ? "-translate-x-full" : "translate-x-0"
        }`}
      >
        <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <Link href="/pros" className="block min-w-0">
            <div className="text-base font-semibold tracking-tight">
              <span className="text-blue-400">Azimut</span>
              <span className="text-slate-100">Finance</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-purple-400 mt-0.5">
              Pro Terminal
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Replier le menu"
            title="Replier le menu"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pro-scrollbar">{content}</div>
      </aside>

      {/* Drawer mobile */}
      {openMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpenMobile(false)}
          />
          <aside className="relative w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
            <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
              <Link
                href="/pros"
                onClick={() => setOpenMobile(false)}
                className="block"
              >
                <div className="text-base font-semibold">
                  <span className="text-blue-400">Azimut</span>
                  <span className="text-slate-100">Finance</span>
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-purple-400 mt-0.5">
                  Pro Terminal
                </div>
              </Link>
              <button
                onClick={() => setOpenMobile(false)}
                className="p-1 text-slate-400 hover:text-white"
                aria-label="Fermer"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto"
              onClick={() => setOpenMobile(false)}
            >
              {content}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

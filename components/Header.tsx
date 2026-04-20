"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

type MenuItem = {
  label: string;
  href: string;
  badge?: "Premium" | "Pro" | "Bientôt";
};

type MenuSection = {
  label: string;
  items: MenuItem[];
};

const menuSections: MenuSection[] = [
  {
    label: "Marchés",
    items: [
      { label: "Actions BRVM", href: "/marches/actions" },
      { label: "Obligations cotées", href: "/marches/obligations" },
      { label: "Souverains non cotés", href: "/marches/souverains-non-cotes" },
      { label: "FCP / OPCVM", href: "/marches/fcp" },
    ],
  },
  {
    label: "Marché monétaire",
    items: [
      { label: "Taux BCEAO & UEMOA", href: "/marche-monetaire" },
      { label: "Courbes de taux", href: "/marche-monetaire#courbe" },
      { label: "Adjudications passées", href: "/marche-monetaire#adjudications" },
      { label: "Calendrier adjudications", href: "/marche-monetaire#calendrier" },
    ],
  },
  {
    label: "Outils Pro",
    items: [
      { label: "Simulateur YTM", href: "/outils/ytm", badge: "Premium" },
      { label: "Screener d'actions", href: "/outils/screener", badge: "Premium" },
      { label: "Comparateur sociétés", href: "/outils/comparateur", badge: "Premium" },
      { label: "Alertes personnalisées", href: "/outils/alertes", badge: "Premium" },
      { label: "Portefeuille personnel", href: "/outils/portefeuille", badge: "Bientôt" },
    ],
  },
  {
    label: "Macro",
    items: [
      { label: "Indicateurs pays UEMOA", href: "/macro/pays" },
      { label: "Matières premières", href: "/macro/matieres-premieres" },
      { label: "Devises & FX", href: "/macro/devises" },
      { label: "Immobilier Abidjan", href: "/macro/immobilier" },
    ],
  },
  {
    label: "Académie",
    items: [
      { label: "Catalogue formations", href: "/academie/formations" },
      { label: "Glossaire financier", href: "/academie/glossaire" },
      { label: "Magazine digital", href: "/academie/magazine" },
      { label: "Simulateur de trading", href: "/academie/simulateur", badge: "Bientôt" },
    ],
  },
  {
    label: "Communauté",
    items: [
      { label: "Forum investisseurs", href: "/communaute/forum", badge: "Bientôt" },
      { label: "Classements", href: "/communaute/classements", badge: "Bientôt" },
      { label: "Newsletter", href: "/communaute/newsletter" },
    ],
  },
  {
    label: "Pros",
    items: [
      { label: "Place de marché OTC", href: "/pros/otc", badge: "Pro" },
      { label: "Terminal Pro", href: "/pros/terminal", badge: "Pro" },
      { label: "API data", href: "/pros/api", badge: "Pro" },
      { label: "Research sur mesure", href: "/pros/research", badge: "Pro" },
    ],
  },
];

function BadgeLabel({ badge }: { badge: string }) {
  const styles: Record<string, string> = {
    Premium: "bg-blue-100 text-blue-700",
    Pro: "bg-purple-100 text-purple-700",
    Bientôt: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${styles[badge] || styles.Bientôt}`}>
      {badge}
    </span>
  );
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDesktopMenu, setActiveDesktopMenu] = useState<string | null>(null);
  const [activeMobileMenu, setActiveMobileMenu] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Fermer les menus au clic exterieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setActiveDesktopMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header ref={headerRef} className="bg-white border-b border-slate-200 relative z-30">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
        {/* Logo + Menu desktop */}
        <div className="flex items-center gap-4 lg:gap-8">
          <Link href="/" className="text-lg md:text-xl font-semibold tracking-tight">
            <span className="text-blue-700">Azimut</span>
            <span className="text-slate-900">Finance</span>
          </Link>

          {/* Menu desktop */}
          <nav className="hidden lg:flex gap-1 text-sm">
            {menuSections.map((section) => (
              <div key={section.label} className="relative">
                <button
                  onClick={() =>
                    setActiveDesktopMenu(
                      activeDesktopMenu === section.label ? null : section.label
                    )
                  }
                  onMouseEnter={() => setActiveDesktopMenu(section.label)}
                  className={`px-3 py-2 rounded-md hover:bg-slate-50 flex items-center gap-1 ${
                    activeDesktopMenu === section.label
                      ? "bg-slate-50 text-slate-900"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {section.label}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {/* Sous-menu */}
                {activeDesktopMenu === section.label && (
                  <div
                    onMouseLeave={() => setActiveDesktopMenu(null)}
                    className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg py-2 min-w-[240px]"
                  >
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setActiveDesktopMenu(null)}
                        className="flex items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                      >
                        <span>{item.label}</span>
                        {item.badge && <BadgeLabel badge={item.badge} />}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Boutons desktop */}
        <div className="hidden md:flex gap-2">
          <button className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50">
            Connexion
          </button>
          <button className="px-3 lg:px-4 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800">
            S&apos;abonner
          </button>
        </div>

        {/* Bouton hamburger mobile */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="lg:hidden p-2 rounded-md hover:bg-slate-100"
          aria-label="Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Menu mobile deroulant */}
      {menuOpen && (
        <nav className="lg:hidden border-t border-slate-200 bg-white max-h-[70vh] overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
            {menuSections.map((section) => (
              <div key={section.label}>
                <button
                  onClick={() =>
                    setActiveMobileMenu(
                      activeMobileMenu === section.label ? null : section.label
                    )
                  }
                  className="w-full flex items-center justify-between py-2 text-sm font-medium text-slate-900"
                >
                  {section.label}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`transition-transform ${
                      activeMobileMenu === section.label ? "rotate-180" : ""
                    }`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {activeMobileMenu === section.label && (
                  <div className="pl-4 py-1 flex flex-col gap-1 border-l-2 border-slate-100">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => {
                          setMenuOpen(false);
                          setActiveMobileMenu(null);
                        }}
                        className="flex items-center justify-between py-1.5 text-sm text-slate-600"
                      >
                        <span>{item.label}</span>
                        {item.badge && <BadgeLabel badge={item.badge} />}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-3 mt-2 border-t border-slate-100">
              <button className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-md">
                Connexion
              </button>
              <button className="flex-1 px-4 py-2 text-sm bg-blue-700 text-white rounded-md">
                S&apos;abonner
              </button>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
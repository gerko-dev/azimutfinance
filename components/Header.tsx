"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { signOutAction } from "@/lib/auth/actions";

type MenuItem = {
  label: string;
  href: string;
  badge?: "Premium" | "Pro" | "Bientôt";
  children?: MenuItem[];
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
      {
        label: "FCP / OPCVM",
        href: "/marches/fcp",
        children: [
          { label: "OPC", href: "/fcp/categories" },
          { label: "Sociétés de gestion", href: "/sgp" },
        ],
      },
    ],
  },
  {
    label: "Marché monétaire",
    items: [
      { label: "Taux BCEAO & UEMOA", href: "/marche-monetaire" },
      { label: "Récapitulatif MTP", href: "/marche-monetaire/mtp" },
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
      { label: "Terminal Pro", href: "/pros", badge: "Pro" },
      { label: "Place de marché OTC", href: "/pros/otc", badge: "Pro" },
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

function userInitials(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata as { full_name?: string; name?: string } | null;
  const name = meta?.full_name || meta?.name || user.email || "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDesktopMenu, setActiveDesktopMenu] = useState<string | null>(null);
  const [activeMobileMenu, setActiveMobileMenu] = useState<string | null>(null);
  const [activeFlyout, setActiveFlyout] = useState<string | null>(null);
  const [activeMobileFlyout, setActiveMobileFlyout] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Charger la session au montage + ecouter les changements (login / logout / refresh)
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        setUser(data.user);
        setAuthLoaded(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoaded(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // Fermer les menus au clic exterieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setActiveDesktopMenu(null);
        setUserMenuOpen(false);
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
                    onMouseLeave={() => {
                      setActiveDesktopMenu(null);
                      setActiveFlyout(null);
                    }}
                    className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg py-2 min-w-[260px]"
                  >
                    {section.items.map((item) => (
                      <div
                        key={item.href}
                        className="relative"
                        onMouseEnter={() =>
                          setActiveFlyout(item.children ? item.href : null)
                        }
                      >
                        <Link
                          href={item.href}
                          onClick={() => {
                            setActiveDesktopMenu(null);
                            setActiveFlyout(null);
                          }}
                          className={`flex items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 ${
                            activeFlyout === item.href ? "bg-slate-50" : ""
                          }`}
                        >
                          <span className={item.children ? "font-medium" : ""}>{item.label}</span>
                          <span className="flex items-center gap-1.5">
                            {item.badge && <BadgeLabel badge={item.badge} />}
                            {item.children && (
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                className="text-slate-400"
                              >
                                <path d="M9 6l6 6-6 6" />
                              </svg>
                            )}
                          </span>
                        </Link>
                        {/* Flyout enfants : visible seulement au hover sur l'item */}
                        {item.children && activeFlyout === item.href && (
                          <div className="absolute left-full top-0 ml-1 bg-white border border-slate-200 rounded-md shadow-lg py-2 min-w-[220px]">
                            {item.children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => {
                                  setActiveDesktopMenu(null);
                                  setActiveFlyout(null);
                                }}
                                className="flex items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              >
                                <span>{child.label}</span>
                                {child.badge && <BadgeLabel badge={child.badge} />}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Boutons desktop : auth-aware */}
        <div className="hidden md:flex items-center gap-2">
          {!authLoaded ? (
            <div className="h-9 w-24 bg-slate-100 rounded-md animate-pulse" />
          ) : user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50"
                aria-label="Menu utilisateur"
              >
                <span className="w-8 h-8 rounded-full bg-blue-700 text-white text-xs font-semibold flex items-center justify-center">
                  {userInitials(user)}
                </span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg py-2 min-w-[220px] z-40">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <div className="text-xs text-slate-500">Connecté en tant que</div>
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {user.email}
                    </div>
                  </div>
                  <Link
                    href="/compte"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Mon compte
                  </Link>
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Se déconnecter
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/connexion"
                className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Connexion
              </Link>
              <Link
                href="/inscription"
                className="px-3 lg:px-4 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800"
              >
                S&apos;inscrire
              </Link>
            </>
          )}
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
                      <div key={item.href}>
                        <div className="flex items-center justify-between">
                          <Link
                            href={item.href}
                            onClick={() => {
                              setMenuOpen(false);
                              setActiveMobileMenu(null);
                              setActiveMobileFlyout(null);
                            }}
                            className="flex-1 py-1.5 text-sm text-slate-600"
                          >
                            <span className={item.children ? "font-medium text-slate-800" : ""}>
                              {item.label}
                            </span>
                          </Link>
                          {item.badge && <BadgeLabel badge={item.badge} />}
                          {item.children && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMobileFlyout(
                                  activeMobileFlyout === item.href ? null : item.href
                                );
                              }}
                              aria-label="Sous-menu"
                              className="p-1.5 -mr-1.5"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                className={`text-slate-500 transition-transform ${
                                  activeMobileFlyout === item.href ? "rotate-180" : ""
                                }`}
                              >
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {item.children && activeMobileFlyout === item.href && (
                          <div className="pl-4 flex flex-col gap-0.5 border-l-2 border-slate-100 ml-1 mb-1">
                            {item.children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => {
                                  setMenuOpen(false);
                                  setActiveMobileMenu(null);
                                  setActiveMobileFlyout(null);
                                }}
                                className="flex items-center justify-between py-1 text-xs text-slate-500"
                              >
                                <span>{child.label}</span>
                                {child.badge && <BadgeLabel badge={child.badge} />}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="pt-3 mt-2 border-t border-slate-100">
              {!authLoaded ? (
                <div className="h-9 bg-slate-100 rounded-md animate-pulse" />
              ) : user ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-slate-500 px-1">
                    Connecté : <span className="text-slate-700 font-medium">{user.email}</span>
                  </div>
                  <Link
                    href="/compte"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-2 text-sm text-center bg-blue-700 text-white rounded-md"
                  >
                    Mon compte
                  </Link>
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="w-full px-4 py-2 text-sm border border-slate-300 rounded-md"
                    >
                      Se déconnecter
                    </button>
                  </form>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link
                    href="/connexion"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 px-4 py-2 text-sm text-center border border-slate-300 rounded-md"
                  >
                    Connexion
                  </Link>
                  <Link
                    href="/inscription"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 px-4 py-2 text-sm text-center bg-blue-700 text-white rounded-md"
                  >
                    S&apos;inscrire
                  </Link>
                </div>
              )}
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
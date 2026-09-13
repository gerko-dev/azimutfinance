"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { signOutAction } from "@/lib/auth/actions";
import { bestDiscountPct } from "@/lib/premium/plans";
import MessagerieIconBadge from "@/components/messagerie/MessagerieIconBadge";
import NotificationsBell from "@/components/notifications/NotificationsBell";
import HeartbeatPinger from "@/components/HeartbeatPinger";
import PremiumDiscountBadge from "@/components/premium/PremiumDiscountBadge";

type MenuItem = {
  label: string;
  href: string;
  badge?: "Premium" | "Pro" | "Bientôt";
  children?: MenuItem[];
  /** Item masqué tant que l'utilisateur n'est pas connecté (membre+). */
  requiresAuth?: boolean;
};

type MenuSection = {
  label: string;
  items: MenuItem[];
  /** Section encore en chantier : visible en `npm run dev`, jamais en ligne. */
  devOnly?: boolean;
};

// `process.env.NODE_ENV` est remplace a la compilation par Next : la section
// marquee devOnly n'est donc pas seulement masquee, elle est absente du bundle
// de production. Les previews Vercel comptent comme de la production — elles
// ne la montreront pas non plus.
const IS_DEV = process.env.NODE_ENV !== "production";

const menuSections: MenuSection[] = [
  {
    label: "Marchés",
    items: [
      { label: "Indices", href: "/marches/indices" },
      {
        label: "Actions",
        href: "/marches/actions",
        children: [
          { label: "Actions cotées", href: "/marches/actions" },
          { label: "Private equity", href: "/marches/private-equity", badge: "Premium" },
        ],
      },
      {
        label: "Obligations",
        href: "/marches/obligations",
        children: [
          { label: "Obligations cotées", href: "/marches/obligations" },
          { label: "OAT/BAT", href: "/marches/souverains-non-cotes" },
        ],
      },
      // Lien simple : la page OPC mene deja aux categories et aux societes de
      // gestion, un flyout n'aurait fait que dupliquer ses propres liens.
      { label: "OPC", href: "/marches/fcp" },
      { label: "Matières premières", href: "/marches/matieres-premieres" },
      { label: "FX", href: "/marches/devises" },
    ],
  },
  {
    label: "Macroéconomie",
    items: [
      { label: "Indicateurs", href: "/macro/pays" },
      // Le marche monetaire n'est plus une section de premier niveau : ses deux
      // pages sont de la macro, et la barre en comptait trop.
      { label: "Taux UEMOA", href: "/marche-monetaire" },
      { label: "Récapitulatif MTP", href: "/marche-monetaire/mtp" },
    ],
  },
  {
    // Porte d'entree unique vers les outils, Pro compris : un visiteur ne
    // devinait pas que le screener vivait derriere le bouton « Espace Pro ».
    // Le badge dit le niveau d'acces, il ne cache pas l'existence de l'outil.
    //
    // EN CHANTIER — masquee en ligne le temps que la section soit finie.
    // Pour la remettre en production : retirer `devOnly`.
    devOnly: true,
    label: "Outils",
    items: [
      { label: "Comparateur de titres", href: "/outils/comparateur", badge: "Premium" },
      { label: "Mon portefeuille", href: "/outils/portefeuille", badge: "Bientôt" },
      { label: "Ma watchlist", href: "/outils/watchlist", requiresAuth: true },
      { label: "Mes alertes", href: "/outils/alertes", requiresAuth: true },
      {
        label: "Simulateur d'adjudication",
        href: "/marches/souverains-non-cotes/simulateur",
      },
      { label: "Screener actions", href: "/pros/screener", badge: "Pro" },
      { label: "Screener FCP", href: "/pros/screener-fcp", badge: "Pro" },
      { label: "Simulateur YTM", href: "/pros/ytm", badge: "Pro" },
    ],
  },
  {
    label: "Académie",
    items: [
      { label: "Catalogue formations", href: "/academie/formations" },
      { label: "Glossaire financier", href: "/academie/glossaire" },
      { label: "Suivi de compte titre", href: "/academie/compte-titre" },
      { label: "Ligue Azimut", href: "/academie/simulateur" },
    ],
  },
  {
    label: "Communauté",
    items: [
      { label: "Forum investisseurs", href: "/communaute/forum" },
      { label: "Magazine digital", href: "/academie/magazine", requiresAuth: true },
      { label: "Newsletter", href: "/communaute/newsletter" },
    ],
  },
];

// Un lien est « actif » s'il est la page courante ou l'un de ses parents.
// La comparaison passe par le separateur pour que /marches/actions ne se laisse
// pas revendiquer par /marches/action-truc.
function matchesPath(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function sectionIsActive(section: MenuSection, pathname: string): boolean {
  return section.items.some(
    (item) =>
      matchesPath(item.href, pathname) ||
      (item.children ?? []).some((child) => matchesPath(child.href, pathname)),
  );
}

function BadgeLabel({ badge }: { badge: string }) {
  // Pastilles a anneau : le badge se lit sans peser autant qu'un aplat, et
  // reste lisible pose sur le bleu tres pale du survol.
  const styles: Record<string, string> = {
    Premium: "bg-amber-50 text-amber-700 ring-amber-600/20",
    Pro: "bg-violet-50 text-violet-700 ring-violet-600/20",
    "Bientôt": "bg-slate-50 text-slate-500 ring-slate-500/20",
  };
  return (
    <span
      className={`ml-2 shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1 ring-inset ${
        styles[badge] || styles["Bientôt"]
      }`}
    >
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
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [adminLevel, setAdminLevel] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<"member" | "premium" | "pro" | null>(null);
  const [hasActiveSub, setHasActiveSub] = useState(false);
  const [discountPct, setDiscountPct] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Remise Premium en cours. Requete separee de l'auth : `pricing_plans` est en
  // select public sur `active = true`, donc un visiteur anonyme la lit aussi —
  // c'est justement lui qu'on veut convaincre.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("pricing_plans")
      .select("discount_pct")
      .eq("active", true)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setDiscountPct(
          bestDiscountPct(
            (data as { discount_pct: number }[]).map((r) => ({
              discountPct: r.discount_pct,
            })),
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Charger la session au montage + ecouter les changements (login / logout / refresh)
  useEffect(() => {
    let cancelled = false;
    async function loadUserAndAdmin() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(data.user);
      setAuthLoaded(true);
      if (data.user) {
        const [{ data: lvl }, { data: profile }, { data: sub }] = await Promise.all([
          supabase.rpc("my_admin_level"),
          supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle(),
          supabase
            .from("subscriptions")
            .select("current_period_end")
            .eq("user_id", data.user.id)
            .eq("status", "active")
            .order("current_period_end", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (!cancelled) {
          setAdminLevel(typeof lvl === "number" ? lvl : null);
          const role = (profile as { role?: string } | null)?.role;
          setUserRole(
            role === "pro" || role === "premium" || role === "member" ? role : null,
          );
          const periodEnd = (sub as { current_period_end?: string } | null)?.current_period_end;
          setHasActiveSub(
            !!periodEnd && new Date(periodEnd).getTime() > Date.now(),
          );
          setProfileLoaded(true);
        }
      } else {
        setAdminLevel(null);
        setUserRole(null);
        setHasActiveSub(false);
        setProfileLoaded(true);
      }
    }
    loadUserAndAdmin();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoaded(true);
      if (!session?.user) {
        setAdminLevel(null);
        setUserRole(null);
        setHasActiveSub(false);
        setProfileLoaded(true);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const showProButton = userRole === "pro" || adminLevel !== null;
  // "Mes alertes" : reserve aux comptes premium (et au-dessus : pro, admins).
  const showAlertes =
    userRole === "premium" || userRole === "pro" || adminLevel !== null;
  // Toutes les sections sont visibles ; pour les invités on filtre les items
  // marqués `requiresAuth` (ex : Magazine digital, réservé membre+).
  const visibleMenuSections = useMemo(() => {
    const sections = menuSections.filter((s) => IS_DEV || !s.devOnly);
    if (user) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter((it) => !it.requiresAuth),
      }))
      .filter((s) => s.items.length > 0);
  }, [user]);
  // CTA Premium : permanent pour qui n'a pas encore Premium — invites comme
  // Membres. L'invite est la premiere cible de l'offre ; le lui cacher jusqu'a
  // l'inscription revenait a ne la montrer qu'a ceux qui avaient deja franchi
  // une porte.
  // - userRole null = invite, "member" = compte gratuit ; pro et premium sortis
  // - adminLevel exclut les admins, qui ont deja tout
  // - !hasActiveSub double-securise contre un userRole perime
  // - profileLoaded gate evite le flash entre auth resolve et profil resolve
  //   (il passe a true dans les deux branches, invite compris)
  // Meme portee que l'ancien CTA : invites et Membres, ni Premium ni Pro ni
  // admins — annoncer une remise a qui a deja l'abonnement n'a pas de sens.
  const showDiscount =
    authLoaded &&
    profileLoaded &&
    adminLevel === null &&
    !hasActiveSub &&
    (userRole === null || userRole === "member");

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
    // Barre collante sur verre depoli : le contenu defile dessous sans que la
    // navigation quitte l'ecran. `supports-[backdrop-filter]` garde un fond
    // opaque la ou le flou n'existe pas, sinon le texte passe sur le contenu.
    <header
      ref={headerRef}
      className="sticky top-0 z-30 bg-white/95 supports-[backdrop-filter]:bg-white/75 backdrop-blur-xl border-b border-slate-900/[0.07] shadow-[0_1px_3px_0_rgb(15_23_42_/_0.04)]"
    >
      <HeartbeatPinger user={user} />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
        {/* Logo + Menu desktop */}
        <div className="flex items-center gap-4 lg:gap-8">
          <Link
            href="/"
            className="text-lg md:text-xl font-semibold tracking-tight transition-opacity hover:opacity-80"
          >
            <span className="text-blue-700">Azimut</span>
            <span className="text-slate-900">Finance</span>
          </Link>

          {/* Menu desktop */}
          <nav className="hidden lg:flex gap-0.5 text-sm">
            {visibleMenuSections.map((section) => {
              const isOpen = activeDesktopMenu === section.label;
              const isActive = sectionIsActive(section, pathname);
              return (
              <div key={section.label} className="relative">
                <button
                  onClick={() =>
                    setActiveDesktopMenu(isOpen ? null : section.label)
                  }
                  onMouseEnter={() => setActiveDesktopMenu(section.label)}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  className={`relative px-3 py-2 rounded-lg flex items-center gap-1.5 font-medium transition-colors duration-150 ${
                    isOpen
                      ? "bg-blue-50 text-blue-700"
                      : isActive
                        ? "text-blue-700 hover:bg-blue-50/70"
                        : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
                  }`}
                >
                  {section.label}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className={`transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    } ${isOpen || isActive ? "opacity-90" : "opacity-50"}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                  {/* Soulignement de la section courante : un trait fin sous
                      l'onglet, pas un aplat — on doit savoir ou l'on est sans
                      que la barre se transforme en damier. */}
                  {isActive && (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-blue-600" />
                  )}
                </button>

                {/* Sous-menu */}
                {isOpen && (
                  <div
                    onMouseLeave={() => {
                      setActiveDesktopMenu(null);
                      setActiveFlyout(null);
                    }}
                    className="az-menu-in absolute left-0 top-full mt-2 bg-white rounded-xl ring-1 ring-slate-900/[0.07] shadow-xl shadow-slate-900/[0.08] p-1.5 min-w-[268px]"
                  >
                    {section.items.map((item) => {
                      const itemActive = matchesPath(item.href, pathname);
                      const flyoutOpen = activeFlyout === item.href;
                      return (
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
                          className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${
                            itemActive
                              ? "bg-blue-50 text-blue-700 font-medium"
                              : flyoutOpen
                                ? "bg-slate-50 text-slate-900"
                                : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                          }`}
                        >
                          <span className={item.children ? "font-medium" : ""}>
                            {item.label}
                          </span>
                          <span className="flex items-center gap-1">
                            {item.badge && <BadgeLabel badge={item.badge} />}
                            {item.children && (
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                className="text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5"
                              >
                                <path d="M9 6l6 6-6 6" />
                              </svg>
                            )}
                          </span>
                        </Link>
                        {/* Flyout enfants : visible seulement au hover sur l'item */}
                        {item.children && flyoutOpen && (
                          <div className="az-flyout-in absolute left-full top-0 ml-1.5 bg-white rounded-xl ring-1 ring-slate-900/[0.07] shadow-xl shadow-slate-900/[0.08] p-1.5 min-w-[228px]">
                            {item.children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => {
                                  setActiveDesktopMenu(null);
                                  setActiveFlyout(null);
                                }}
                                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${
                                  matchesPath(child.href, pathname)
                                    ? "bg-blue-50 text-blue-700 font-medium"
                                    : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                                }`}
                              >
                                <span>{child.label}</span>
                                {child.badge && <BadgeLabel badge={child.badge} />}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
          </nav>
        </div>

        {/* Boutons desktop : auth-aware */}
        <div className="hidden md:flex items-center gap-2">
          {showDiscount && discountPct > 0 && (
            <PremiumDiscountBadge pct={discountPct} />
          )}
          {!authLoaded ? (
            <div className="h-9 w-24 bg-slate-100 rounded-md animate-pulse" />
          ) : user ? (
            <>
              {showProButton && (
                <Link
                  href="/pros"
                  className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white shadow-sm hover:shadow transition"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2l2.39 7.36H22l-6.18 4.49 2.39 7.36L12 16.72l-6.21 4.49 2.39-7.36L2 9.36h7.61z" />
                  </svg>
                  Espace Pro
                </Link>
              )}
              <NotificationsBell user={user} />
              <MessagerieIconBadge user={user} />
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
                  <Link
                    href="/outils/watchlist"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Ma watchlist
                  </Link>
                  {showAlertes && (
                    <Link
                      href="/outils/alertes"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Mes alertes
                    </Link>
                  )}
                  <Link
                    href="/messagerie"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Messagerie
                  </Link>
                  {adminLevel !== null && (
                    <Link
                      href="/admin"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-rose-700 font-medium hover:bg-rose-50 border-t border-slate-100"
                    >
                      Administration · N{adminLevel}
                    </Link>
                  )}
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
            </>
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

        {/* Mobile : icones forum + messagerie + hamburger */}
        <div className="flex items-center gap-1 md:hidden">
          {authLoaded && user && (
            <>
              <NotificationsBell user={user} />
              <MessagerieIconBadge user={user} />
            </>
          )}
        </div>

        {/* Bouton hamburger mobile */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={`lg:hidden p-2 rounded-lg transition-colors ${
            menuOpen ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
          }`}
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
        <nav className="az-menu-in lg:hidden border-t border-slate-900/[0.07] bg-white max-h-[70vh] overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
            {showDiscount && discountPct > 0 && (
              <PremiumDiscountBadge
                pct={discountPct}
                className="justify-center mb-2"
              />
            )}
            {showProButton && (
              <Link
                href="/pros"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveMobileMenu(null);
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 mb-2 rounded-md text-sm font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2l2.39 7.36H22l-6.18 4.49 2.39 7.36L12 16.72l-6.21 4.49 2.39-7.36L2 9.36h7.61z" />
                </svg>
                Espace Pro
              </Link>
            )}
            {visibleMenuSections.map((section) => {
              const open = activeMobileMenu === section.label;
              const isActive = sectionIsActive(section, pathname);
              return (
              <div key={section.label}>
                <button
                  onClick={() =>
                    setActiveMobileMenu(open ? null : section.label)
                  }
                  aria-expanded={open}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    open || isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {section.label}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`transition-transform duration-200 ${
                      open ? "rotate-180" : "opacity-50"
                    }`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {open && (
                  <div className="az-menu-in mt-0.5 ml-3 pl-3 py-0.5 flex flex-col gap-0.5 border-l border-slate-200">
                    {section.items.map((item) => {
                      const itemActive = matchesPath(item.href, pathname);
                      const flyoutOpen = activeMobileFlyout === item.href;
                      return (
                      <div key={item.href}>
                        <div className="flex items-center">
                          <Link
                            href={item.href}
                            onClick={() => {
                              setMenuOpen(false);
                              setActiveMobileMenu(null);
                              setActiveMobileFlyout(null);
                            }}
                            className={`flex-1 flex items-center px-2.5 py-2 rounded-lg text-sm transition-colors ${
                              itemActive
                                ? "bg-blue-50 text-blue-700 font-medium"
                                : "text-slate-600 active:bg-slate-50"
                            }`}
                          >
                            <span className={item.children ? "font-medium text-slate-800" : ""}>
                              {item.label}
                            </span>
                            {item.badge && <BadgeLabel badge={item.badge} />}
                          </Link>
                          {item.children && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMobileFlyout(flyoutOpen ? null : item.href);
                              }}
                              aria-label="Sous-menu"
                              aria-expanded={flyoutOpen}
                              className="p-2 rounded-lg text-slate-400 active:bg-slate-50"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                className={`transition-transform duration-200 ${
                                  flyoutOpen ? "rotate-180" : ""
                                }`}
                              >
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {item.children && flyoutOpen && (
                          <div className="az-menu-in ml-2.5 pl-3 flex flex-col gap-0.5 border-l border-slate-200 mb-1">
                            {item.children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => {
                                  setMenuOpen(false);
                                  setActiveMobileMenu(null);
                                  setActiveMobileFlyout(null);
                                }}
                                className={`flex items-center px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${
                                  matchesPath(child.href, pathname)
                                    ? "bg-blue-50 text-blue-700 font-medium"
                                    : "text-slate-500 active:bg-slate-50"
                                }`}
                              >
                                <span>{child.label}</span>
                                {child.badge && <BadgeLabel badge={child.badge} />}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
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
                  <Link
                    href="/outils/watchlist"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-2 text-sm text-center border border-slate-300 rounded-md"
                  >
                    Ma watchlist
                  </Link>
                  {showAlertes && (
                    <Link
                      href="/outils/alertes"
                      onClick={() => setMenuOpen(false)}
                      className="px-4 py-2 text-sm text-center border border-slate-300 rounded-md"
                    >
                      Mes alertes
                    </Link>
                  )}
                  <Link
                    href="/messagerie"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-2 text-sm text-center border border-slate-300 rounded-md"
                  >
                    Messagerie
                  </Link>
                  {adminLevel !== null && (
                    <Link
                      href="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="px-4 py-2 text-sm text-center bg-rose-600 text-white rounded-md font-medium"
                    >
                      Administration · N{adminLevel}
                    </Link>
                  )}
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

"use client";

import { useEffect, useState } from "react";
import ProSidebar from "./ProSidebar";
import ProTopBar from "./ProTopBar";
import ProBackdrop from "./ProBackdrop";
import ProSplash from "./ProSplash";

const STORAGE_KEY = "pros-sidebar-collapsed";
const SPLASH_DURATION_MS = 3000;
const SPLASH_FADE_MS = 500;

/**
 * Wrapper client du layout Pro. Gere l'etat replie/deplie de la sidebar
 * (desktop) et le persiste dans localStorage. Sur mobile, la sidebar reste
 * un drawer independant de cet etat.
 */
export default function ProShell({
  children,
  userInitials,
}: {
  children: React.ReactNode;
  userInitials: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Splash : visible des le premier render (par defaut true cote SSR aussi),
  // commence a fader apres SPLASH_DURATION_MS, retire du DOM apres le fade.
  const [splashFading, setSplashFading] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);

  useEffect(() => {
    // Marque le body pour que la scrollbar de page passe en mode Pro
    // (cf. globals.css : body[data-pro="1"]).
    document.body.dataset.pro = "1";

    // Lecture localStorage repoussee dans un setTimeout pour respecter
    // react-hooks/set-state-in-effect (evite un cascade render synchrone).
    const hydrateId = setTimeout(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "1") setCollapsed(true);
      setHydrated(true);
    }, 0);

    // Splash : fade out apres 3s, demontage apres l'animation.
    const fadeId = setTimeout(() => setSplashFading(true), SPLASH_DURATION_MS);
    const unmountId = setTimeout(
      () => setSplashMounted(false),
      SPLASH_DURATION_MS + SPLASH_FADE_MS
    );

    return () => {
      clearTimeout(hydrateId);
      clearTimeout(fadeId);
      clearTimeout(unmountId);
      delete document.body.dataset.pro;
    };
  }, []);

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore localStorage failure (mode prive, quota, etc.)
      }
      return next;
    });
  }

  // Tant que le state n'est pas hydrate depuis localStorage, on rend l'etat
  // par defaut (sidebar visible) pour eviter un flash de layout au montage.
  const effectiveCollapsed = hydrated ? collapsed : false;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <ProSidebar collapsed={effectiveCollapsed} onClose={toggleSidebar} />
      <div
        className={`transition-[padding] duration-200 ${
          effectiveCollapsed ? "" : "lg:pl-60"
        }`}
      >
        <ProTopBar
          userInitials={userInitials}
          sidebarCollapsed={effectiveCollapsed}
          onToggleSidebar={toggleSidebar}
        />
        <main className="relative px-4 md:px-6 py-6 min-h-[calc(100vh-3rem)]">
          <ProBackdrop />
          <div className="relative z-10">{children}</div>
        </main>
      </div>

      {/* Splash garanti minimum 3 secondes a l'entree dans le terminal */}
      {splashMounted && <ProSplash fading={splashFading} />}
    </div>
  );
}

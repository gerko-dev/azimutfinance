"use client";

import { useEffect, useState } from "react";

/**
 * Barre de progression de lecture sticky en haut de page.
 * Calcule le pourcentage de scroll dans la zone <article id="article-body">.
 */
export default function ReadingProgressBar({ accent = "#0f172a" }: { accent?: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const target = document.getElementById("article-body");
    if (!target) return;

    let frame: number | null = null;

    function update() {
      const rect = target!.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) {
        setProgress(0);
        return;
      }
      const scrolled = -rect.top;
      const pct = Math.max(0, Math.min(1, scrolled / total));
      setProgress(pct);
    }

    function onScroll() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        update();
        frame = null;
      });
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
      style={{ height: 3 }}
    >
      <div
        className="h-full transition-[width] duration-100"
        style={{
          width: `${(progress * 100).toFixed(2)}%`,
          background: accent,
        }}
      />
    </div>
  );
}

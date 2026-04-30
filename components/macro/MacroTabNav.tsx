"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  ["overview", "Indicateurs clés"],
  ["cycle", "Cycle économique"],
  ["reel", "Économie réelle"],
  ["fiscal", "Finances publiques"],
  ["externe", "Secteur extérieur"],
  ["monetaire", "Monnaie & finance"],
  ["comparateur", "Comparateur UEMOA"],
  ["studio", "Studio d'analyse"],
] as const;

export default function MacroTabNav() {
  const [active, setActive] = useState<string>("overview");

  useEffect(() => {
    const handler = () => {
      let current = "overview";
      const offset = 120;
      for (const [id] of SECTIONS) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) current = id;
      }
      setActive(current);
    };
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
      <nav className="max-w-7xl mx-auto px-4 md:px-6 flex gap-1 overflow-x-auto py-2 text-xs">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className={`shrink-0 px-2.5 py-1 rounded-full transition ${
              active === id
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}

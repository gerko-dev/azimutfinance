"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

/**
 * Barre d'outils de la page imprimable d'un numero de magazine.
 *
 * - Pose la classe `magazine-print-active` sur <html> tant que la page est
 *   montee (cf. regles `@media print` dans globals.css qui masquent le footer,
 *   la banniere cookies et cette barre a l'impression).
 * - Ouvre automatiquement la boite d'impression une fois les illustrations
 *   chargees, pour que l'utilisateur n'ait qu'a choisir « Enregistrer en PDF ».
 *   Repli a 3 s si une image ne se charge pas.
 */
export default function MagazinePrintToolbar({ backHref }: { backHref: string }) {
  const printedRef = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("magazine-print-active");

    const triggerPrint = () => {
      if (printedRef.current) return;
      printedRef.current = true;
      window.print();
    };

    const images = Array.from(document.images);
    let pending = images.filter((img) => !img.complete).length;
    const fallback = window.setTimeout(triggerPrint, 3000);

    if (pending === 0) {
      // Laisse la mise en page se stabiliser avant d'ouvrir la boite.
      window.setTimeout(triggerPrint, 250);
    } else {
      const onSettled = () => {
        pending -= 1;
        if (pending <= 0) {
          window.clearTimeout(fallback);
          triggerPrint();
        }
      };
      for (const img of images) {
        if (img.complete) continue;
        img.addEventListener("load", onSettled);
        img.addEventListener("error", onSettled);
      }
    }

    return () => {
      root.classList.remove("magazine-print-active");
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div className="no-print fixed top-0 inset-x-0 z-50 bg-slate-900 text-white shadow-lg">
      <div className="max-w-[820px] mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="text-sm text-slate-300 hover:text-white transition"
        >
          ← Retour au numéro
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-[11px] text-slate-400">
            Astuce : choisissez « Enregistrer au format PDF » comme destination
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="text-sm bg-white text-slate-900 hover:bg-slate-200 font-medium px-4 py-1.5 rounded transition"
          >
            ↓ Enregistrer en PDF
          </button>
        </div>
      </div>
    </div>
  );
}

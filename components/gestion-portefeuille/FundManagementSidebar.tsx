"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Menu lateral du module de gestion.
 *
 * POURQUOI UN MENU LATERAL PLUTOT QUE DES ONGLETS. Les sections du module sont
 * des LIEUX ou l'on travaille longtemps — un fonds, un reporting, un
 * referentiel — pas des vues d'un meme objet. Une barre d'onglets horizontale
 * les faisait defiler et ne laissait pas voir ou l'on se trouvait ; une colonne
 * garde la carte du module sous les yeux.
 *
 * REPLIABLE parce que les tableaux du module sont larges : positions, journal,
 * attribution de performance. Replie, le menu ne garde que ses pictogrammes et
 * rend deux cents pixels a la donnee, ce qui fait souvent la difference entre
 * une colonne lisible et une colonne tronquee.
 */

type Item = {
  label: string;
  href: string;
  icone: string;
  /** Section annoncee mais pas encore construite. */
  bientot?: boolean;
};

const ITEMS: Item[] = [
  { label: "Vue d'ensemble", href: "/gestion-portefeuille", icone: "◧" },
  { label: "Fonds gérés", href: "/gestion-portefeuille/fonds", icone: "▦" },
  { label: "Investisseurs", href: "/gestion-portefeuille/investisseurs", icone: "◍", bientot: true },
  { label: "Reporting", href: "/gestion-portefeuille/reporting", icone: "▤" },
  { label: "Paramètres", href: "/gestion-portefeuille/parametres", icone: "◎" },
];

const CLE_STOCKAGE = "gp-menu-replie";
const EVENEMENT = "gp-menu-replie-change";

/**
 * Le choix est lu dans localStorage par `useSyncExternalStore`, et non dans un
 * effet qui appellerait setState.
 *
 * Deux raisons. Le rendu serveur ne connait pas localStorage : l'initialiser
 * depuis le navigateur produirait deux arbres differents et une erreur
 * d'hydratation. Et restaurer dans un useEffect enfreint la regle
 * react-hooks/set-state-in-effect — un rendu en cascade que React signale.
 * `useSyncExternalStore` couvre les deux : instantane serveur explicite, valeur
 * du navigateur des le premier rendu client.
 */
function souscrire(rappel: () => void) {
  window.addEventListener(EVENEMENT, rappel);
  // L'evenement natif « storage » couvre les autres onglets ouverts sur le
  // module : replier le menu ici le replie aussi la-bas.
  window.addEventListener("storage", rappel);
  return () => {
    window.removeEventListener(EVENEMENT, rappel);
    window.removeEventListener("storage", rappel);
  };
}

function lire(): boolean {
  try {
    return window.localStorage.getItem(CLE_STOCKAGE) === "1";
  } catch {
    // Navigation privee ou stockage bloque : le menu reste deplie.
    return false;
  }
}

const lireServeur = () => false;

export default function FundManagementSidebar() {
  const pathname = usePathname();
  const replie = useSyncExternalStore(souscrire, lire, lireServeur);

  const basculer = () => {
    try {
      window.localStorage.setItem(CLE_STOCKAGE, replie ? "0" : "1");
    } catch {
      // Sans stockage, le pli ne peut pas etre memorise : on ne bascule pas
      // plutot que de laisser l'ecran et la memoire diverger.
    }
    window.dispatchEvent(new Event(EVENEMENT));
  };

  const estActif = (href: string) =>
    href === "/gestion-portefeuille"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      className={`shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 ${
        replie ? "w-[60px]" : "w-[216px]"
      }`}
      aria-label="Sections du module"
    >
      <div className="sticky top-0 py-3">
        <nav className="px-2 space-y-0.5">
          {ITEMS.map((item) => {
            const actif = estActif(item.href);
            const contenu = (
              <>
                <span
                  aria-hidden
                  className={`shrink-0 w-5 text-center text-base leading-none ${
                    actif ? "text-blue-700" : "text-slate-400"
                  }`}
                >
                  {item.icone}
                </span>
                {!replie && <span className="truncate">{item.label}</span>}
                {!replie && item.bientot && (
                  <span className="ml-auto text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                    Bientôt
                  </span>
                )}
              </>
            );

            const base =
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition";

            if (item.bientot) {
              return (
                <span
                  key={item.href}
                  title={replie ? `${item.label} — bientôt disponible` : "Bientôt disponible"}
                  className={`${base} text-slate-400 cursor-not-allowed`}
                >
                  {contenu}
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                title={replie ? item.label : undefined}
                aria-current={actif ? "page" : undefined}
                className={`${base} ${
                  actif
                    ? "bg-blue-50 text-blue-800 font-medium"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {contenu}
              </Link>
            );
          })}
        </nav>

        <div className="px-2 mt-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={basculer}
            aria-expanded={!replie}
            title={replie ? "Déplier le menu" : "Replier le menu"}
            className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <span aria-hidden className="shrink-0 w-5 text-center text-base leading-none">
              {replie ? "»" : "«"}
            </span>
            {!replie && <span>Replier</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}

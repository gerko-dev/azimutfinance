"use client";

import { useState } from "react";

export type MacroTabDef = { id: string; label: string };

type Props = {
  tabs: MacroTabDef[];
  /**
   * Un panneau par onglet, rendu cote serveur et passe en slot. Tous sont
   * serialises quel que soit l'onglet actif — les donnees de la page sont de
   * toute facon chargees en une fois cote serveur, masquer un panneau
   * n'economiserait aucune requete, seulement du DOM.
   */
  panels: Record<string, React.ReactNode>;
  defaultTab?: string;
};

/**
 * Onglets de la page Indicateurs.
 *
 * Remplace l'ancienne navigation par ancres : elle ressemblait a des onglets
 * mais ne faisait que defiler dans une page de huit blocs empiles. Sur une
 * page macro, l'utilisateur vient chercher UN angle — les finances publiques,
 * le secteur exterieur — et devait traverser tout le reste.
 *
 * L'onglet actif est ecrit dans le fragment d'URL (#fiscal) : un lien reste
 * partageable et le bouton Retour du navigateur fonctionne, ce que des onglets
 * purement locaux perdraient.
 */
export default function MacroTabs({ tabs, panels, defaultTab }: Props) {
  const [active, setActive] = useState<string>(() => {
    const premier = defaultTab ?? tabs[0]?.id ?? "";
    if (typeof window === "undefined") return premier;
    const frag = window.location.hash.replace("#", "");
    return tabs.some((t) => t.id === frag) ? frag : premier;
  });

  function selectTab(id: string) {
    setActive(id);
    // replaceState plutot que location.hash : on met a jour l'URL sans
    // declencher le saut de defilement du navigateur vers une ancre.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <>
      <div className="sticky top-0 z-20 bg-white/90 supports-[backdrop-filter]:bg-white/75 backdrop-blur border-b border-slate-200">
        <nav
          className="max-w-7xl mx-auto px-4 md:px-6 flex gap-1 overflow-x-auto py-2 text-xs"
          aria-label="Sections macroéconomiques"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              aria-current={active === t.id ? "page" : undefined}
              className={`shrink-0 px-2.5 py-1 rounded-full transition ${
                active === t.id
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-8">
        {tabs.map((t) => (
          // `hidden` plutot qu'un demontage : les graphiques Recharts
          // remesureraient leur conteneur a chaque retour d'onglet, ce qui
          // produit un saut visible. Ils restent montes, simplement masques.
          <div key={t.id} hidden={active !== t.id}>
            {panels[t.id]}
          </div>
        ))}
      </main>
    </>
  );
}

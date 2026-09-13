"use client";

import { useState, useSyncExternalStore } from "react";

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

function subscribeHash(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function lireHash(): string {
  return window.location.hash.replace("#", "");
}

/** Instantane serveur : aucun fragment n'existe avant le montage. */
function lireHashServeur(): string {
  return "";
}

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
  // Le fragment d'URL est un etat qui vit HORS de React : le lire pendant le
  // rendu initial faisait diverger serveur et client (le serveur rendait le
  // premier onglet, le client celui du fragment), et le lire dans un effet
  // declenchait un rendu en cascade. `useSyncExternalStore` est la forme
  // prevue pour cela : elle a un instantane serveur distinct.
  const hash = useSyncExternalStore(subscribeHash, lireHash, lireHashServeur);

  // Choix explicite de l'utilisateur. Il prime sur le fragment : une fois qu'on
  // a clique, l'onglet ne doit plus bouger.
  const [choisi, setChoisi] = useState<string | null>(null);

  const parDefaut = defaultTab ?? tabs[0]?.id ?? "";
  const depuisHash = tabs.some((t) => t.id === hash) ? hash : "";
  const active = choisi || depuisHash || parDefaut;

  function selectTab(id: string) {
    setChoisi(id);
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

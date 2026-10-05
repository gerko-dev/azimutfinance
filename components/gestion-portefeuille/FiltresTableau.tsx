"use client";

// === La barre de filtres des tableaux d'opérations ===
//
// LE MÊME GESTE PARTOUT. Le carnet avait sa barre ; les rémérés, les prêts et
// le primaire n'avaient rien, et on y cherchait à l'œil en faisant défiler.
// Quinze fonds, plusieurs mois d'ordres : la liste complète ne répond pas à
// « où en est le prêt à Coris » ni à « que reste-t-il d'engagé sur Aurore ».
//
// UNE SEULE IMPLÉMENTATION, parce que quatre barres identiques, c'est quatre
// barres qui finissent par ne plus l'être. Ce qui change d'un tableau à
// l'autre, ce ne sont pas les filtres — fonds, dates, titre sont les mêmes —
// mais le VOCABULAIRE DES ÉTATS : un ordre est réalisé ou périmé, un prêt est
// repris, un réméré est dénoué, une souscription est attribuée. D'où les
// SÉLECTEURS, que chaque tableau déclare dans ses propres mots.
//
// LES FILTRES SE CUMULENT, et c'est le seul comportement qui ne surprenne
// pas : chacun retranche, aucun ne remplace.

import type { OperationAvecFonds } from "@/app/gestion-portefeuille/operations-marche-data";

/** Ce que l'utilisateur a posé. `choix` porte les sélecteurs du tableau. */
export type Filtres = {
  fonds: string;
  choix: Record<string, string>;
  du: string;
  au: string;
  texte: string;
};

export const FILTRES_VIDES: Filtres = {
  fonds: "",
  choix: {},
  du: "",
  au: "",
  texte: "",
};

/**
 * Un sélecteur propre à un tableau : son intitulé, ses valeurs, et de quoi
 * lire celle d'une ligne.
 */
export type Selecteur = {
  cle: string;
  libelle: string;
  options: { valeur: string; libelle: string }[];
  /** La valeur de cette ligne, à confronter au choix. */
  valeurDe: (o: OperationAvecFonds) => string;
};

/** Reste-t-il quelque chose à montrer une fois tous les filtres passés ? */
export function retient(
  o: OperationAvecFonds,
  f: Filtres,
  selecteurs: Selecteur[],
): boolean {
  if (f.fonds && o.fondsId !== f.fonds) return false;
  for (const s of selecteurs) {
    const choisi = f.choix[s.cle];
    if (choisi && s.valeurDe(o) !== choisi) return false;
  }
  if (f.du && o.dateOperation < f.du) return false;
  if (f.au && o.dateOperation > f.au) return false;
  // LE TEXTE CHERCHE LE TITRE, pas tout le reste : un carnet se parcourt par
  // valeur, et chercher aussi dans les notes ramènerait des lignes qu'on ne
  // saurait pas expliquer.
  const texte = f.texte.trim().toLowerCase();
  if (texte && !`${o.code} ${o.libelle}`.toLowerCase().includes(texte)) return false;
  return true;
}

/** Y a-t-il seulement un filtre posé ? */
export function filtresActifs(f: Filtres): boolean {
  return !!(
    f.fonds ||
    f.du ||
    f.au ||
    f.texte.trim() ||
    Object.values(f.choix).some(Boolean)
  );
}

const etiquette = "text-[9px] uppercase tracking-wider text-slate-500";
const controle =
  "text-[11px] border border-slate-300 rounded px-1.5 py-1 bg-white";

export default function BarreFiltres({
  fonds,
  selecteurs,
  valeurs,
  onChange,
  vus,
  total,
}: {
  fonds: { id: string; nom: string }[];
  selecteurs: Selecteur[];
  valeurs: Filtres;
  onChange: (f: Filtres) => void;
  /** Le compteur dit toujours ce qu'on regarde sur ce qu'il y a. */
  vus: number;
  total: number;
}) {
  const poser = (partiel: Partial<Filtres>) => onChange({ ...valeurs, ...partiel });

  return (
    <div className="flex flex-wrap items-end gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
      <label className="flex flex-col gap-0.5">
        <span className={etiquette}>Fonds</span>
        <select
          value={valeurs.fonds}
          onChange={(e) => poser({ fonds: e.target.value })}
          className={`${controle} max-w-[14rem]`}
        >
          <option value="">Tous</option>
          {fonds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nom}
            </option>
          ))}
        </select>
      </label>

      {selecteurs.map((s) => (
        <label key={s.cle} className="flex flex-col gap-0.5">
          <span className={etiquette}>{s.libelle}</span>
          <select
            value={valeurs.choix[s.cle] ?? ""}
            onChange={(e) =>
              poser({ choix: { ...valeurs.choix, [s.cle]: e.target.value } })
            }
            className={controle}
          >
            <option value="">Tous</option>
            {s.options.map((o) => (
              <option key={o.valeur} value={o.valeur}>
                {o.libelle}
              </option>
            ))}
          </select>
        </label>
      ))}

      <label className="flex flex-col gap-0.5">
        <span className={etiquette}>Du</span>
        <input
          type="date"
          value={valeurs.du}
          onChange={(e) => poser({ du: e.target.value })}
          className={controle}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className={etiquette}>Au</span>
        <input
          type="date"
          value={valeurs.au}
          onChange={(e) => poser({ au: e.target.value })}
          className={controle}
        />
      </label>

      <label className="flex flex-col gap-0.5 min-w-[11rem]">
        <span className={etiquette}>Titre</span>
        <input
          value={valeurs.texte}
          onChange={(e) => poser({ texte: e.target.value })}
          placeholder="SNTS, Sonatel…"
          className={controle}
        />
      </label>

      <div className="ml-auto flex items-center gap-2 pb-1">
        <span className="text-[11px] text-slate-500 tabular-nums">
          {vus} / {total}
        </span>
        {filtresActifs(valeurs) && (
          <button
            type="button"
            onClick={() => onChange(FILTRES_VIDES)}
            className="text-[11px] text-blue-700 hover:text-blue-900 underline"
          >
            tout afficher
          </button>
        )}
      </div>
    </div>
  );
}

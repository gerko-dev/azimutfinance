"use client";

// === Briques communes aux onglets d'analyse de marché ===
//
// Les quatre onglets — marché monétaire, obligations, actions, FCP — posent la
// même question sous quatre gisements : combien, où, et à quel prix. Ils
// partagent donc la même grammaire : un bandeau d'indicateurs, des filtres qui
// ne rechargent rien, et un pivot « quelque chose par X et par Y ».
//
// CE MODULE NE CONNAÎT AUCUN DOMAINE. Il ne sait ni ce qu'est une adjudication,
// ni ce qu'est un FCP : le pivot reçoit ses lignes, ses colonnes et une
// fonction qui agrège un sous-ensemble. C'est ce qui lui permet de servir un
// tableau de montants retenus par maturité comme un tableau d'actif net par
// société de gestion, sans qu'aucun des deux n'ait à décrire l'autre.

import { useMemo } from "react";

// === FORMATS ===

const format = (d: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const nf0 = format(0);
export const nf1 = format(1);
export const nf2 = format(2);

/** Millions → milliards, une décimale. Convention de tous les onglets. */
export const enMilliards = (v: number): string => nf1.format(v / 1000);

/** Unités → milliards, une décimale, pour les gisements comptés en FCFA. */
export const francsEnMilliards = (v: number): string => nf1.format(v / 1_000_000_000);

export const pourcent = (v: number | null, d = 2): string =>
  v === null || !Number.isFinite(v) ? "—" : `${format(d).format(v)} %`;

/** Signé, parce qu'une performance sans signe se lit de travers. */
export const pourcentSigne = (v: number | null, d = 2): string =>
  v === null || !Number.isFinite(v)
    ? "—"
    : `${v > 0 ? "+" : ""}${format(d).format(v)} %`;

export const teintePerf = (v: number | null): string =>
  v === null || !Number.isFinite(v) || v === 0
    ? "text-slate-500"
    : v > 0
      ? "text-emerald-700"
      : "text-rose-600";

/**
 * Recharts type son `formatter` très largement : la valeur peut être absente,
 * un tableau, une date. Plutôt que de répéter une assertion à chaque
 * graphique, on adapte la signature une fois ici.
 */
export const tooltip =
  (rendu: (valeur: number, nom: string) => [string, string]) =>
  (v: unknown, n: unknown): [string, string] =>
    rendu(Number(v), String(n));

// === STYLES PARTAGÉS ===

export const carte = "bg-white border border-slate-200 rounded-lg";
export const titreSection = "text-xs font-semibold text-slate-800";
export const aideSection = "text-[10px] text-slate-500 mt-0.5";

/**
 * Dégradé d'une série ordonnée — du plus court au plus long, du plus petit au
 * plus grand. La teinte glisse du cyan vers l'indigo en même temps que la
 * clarté baisse : sept nuances d'un même bleu ne se distinguent pas dans une
 * barre empilée.
 */
export function couleurDegradee(rang: number, total: number): string {
  const part = total <= 1 ? 0 : rang / (total - 1);
  return `hsl(${Math.round(190 + part * 45)}, ${Math.round(65 + part * 15)}%, ${Math.round(72 - part * 44)}%)`;
}

/** Palette qualitative, pour des séries sans ordre naturel. */
export const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#f97316",
  "#0d9488",
  "#7c3aed",
  "#0891b2",
  "#16a34a",
  "#db2777",
  "#ca8a04",
  "#475569",
  "#9333ea",
  "#059669",
];

export const couleurDe = (rang: number): string => PALETTE[rang % PALETTE.length];

// === INDICATEURS ET FILTRES ===

export function Indicateur({
  libelle,
  valeur,
  aide,
  accent,
  teinte,
}: {
  libelle: string;
  valeur: string;
  aide?: string;
  accent?: boolean;
  teinte?: string;
}) {
  return (
    <div className="px-3 py-2 border border-slate-200 rounded-lg bg-white" title={aide}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{libelle}</div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          teinte ?? (accent ? "text-blue-800" : "text-slate-900")
        }`}
      >
        {valeur}
      </div>
    </div>
  );
}

export function BoutonFiltre({
  actif,
  onClick,
  children,
  titre,
  couleur,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
  titre?: string;
  couleur?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      style={actif && couleur ? { backgroundColor: couleur, borderColor: couleur } : undefined}
      className={`px-2.5 py-1 text-[11px] rounded border transition ${
        actif
          ? couleur
            ? "text-white font-medium"
            : "bg-blue-700 border-blue-700 text-white font-medium"
          : "bg-white border-slate-300 text-slate-500 hover:border-slate-400"
      }`}
    >
      {children}
    </button>
  );
}

/** Une rangée de filtres, étiquetée à gauche comme les autres. */
export function RangeeFiltres({
  libelle,
  children,
}: {
  libelle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 w-20 shrink-0">
        {libelle}
      </span>
      {children}
    </div>
  );
}

// === PIVOT ===

export type AxePivot = {
  cle: string;
  titre: string;
  /** Seconde ligne d'en-tête, en plus petit. */
  sousTitre?: string;
  /** Pastille de couleur devant le libellé, pour raccrocher au graphique. */
  couleur?: string;
};

/**
 * Pivot « quelque chose par X et par Y ».
 *
 * LES TOTAUX NE SONT PAS DES SOMMES DE CELLULES, mais la même fonction
 * d'agrégation appliquée à l'ensemble des lignes concernées. La distinction est
 * tout sauf cosmétique : pour un montant les deux coïncident, mais pour un taux
 * la moyenne des moyennes est fausse dès que les poids diffèrent — et ils
 * diffèrent toujours.
 *
 * `cellule` reçoit un sous-ensemble éventuellement VIDE et doit alors rendre
 * `null`, que le tableau affiche comme une absence et non comme un zéro.
 */
export function Pivot<T>({
  donnees,
  lignes,
  colonnes,
  cleLigne,
  cleColonne,
  cellule,
  formater,
  enTeteLignes = "",
  libelleTotal,
  note,
  alerte,
}: {
  donnees: T[];
  lignes: AxePivot[];
  colonnes: AxePivot[];
  cleLigne: (t: T) => string;
  cleColonne: (t: T) => string;
  cellule: (sous: T[]) => number | null;
  /** Rend `ReactNode` et non `string` : une performance se colore. */
  formater: (v: number) => React.ReactNode;
  enTeteLignes?: string;
  libelleTotal: string;
  note?: React.ReactNode;
  alerte?: React.ReactNode;
}) {
  // Un seul balayage pour toute la grille. Filtrer à chaque cellule
  // rebalaierait le gisement lignes × colonnes fois — quelques centaines de
  // passes pour un tableau de trente cases.
  const grille = useMemo(() => {
    const parLigne = new Map<string, T[]>();
    const parCase = new Map<string, T[]>();
    const parColonne = new Map<string, T[]>();
    for (const d of donnees) {
      const l = cleLigne(d);
      const c = cleColonne(d);
      const ajoute = (m: Map<string, T[]>, k: string) => {
        const liste = m.get(k);
        if (liste) liste.push(d);
        else m.set(k, [d]);
      };
      ajoute(parLigne, l);
      ajoute(parColonne, c);
      ajoute(parCase, `${l}\u001f${c}`);
    }
    return { parLigne, parCase, parColonne };
  }, [donnees, cleLigne, cleColonne]);

  const rendre = (sous: T[] | undefined) => {
    const v = cellule(sous ?? []);
    return v === null ? <span className="text-slate-300">·</span> : formater(v);
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              {/* COLONNE DE LIBELLÉS FIXE. Un pivot par société de gestion
                  compte vingt-cinq colonnes : en faisant défiler pour atteindre
                  la dernière, on perdait le nom de la ligne qu'on lisait. */}
              <th className="text-left font-medium text-slate-500 px-2 py-1.5 sticky left-0 bg-white z-10">
                {enTeteLignes}
              </th>
              {colonnes.map((c) => (
                <th key={c.cle} className="text-right font-medium text-slate-600 px-2 py-1.5">
                  <div className="tabular-nums">{c.titre}</div>
                  {c.sousTitre && (
                    <div className="text-[9px] font-normal text-slate-400">{c.sousTitre}</div>
                  )}
                </th>
              ))}
              <th className="text-right font-semibold text-slate-700 px-2 py-1.5 border-l border-slate-200">
                {libelleTotal}
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.cle} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-1 text-slate-800 whitespace-nowrap sticky left-0 bg-white z-10">
                  {l.couleur && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                      style={{ backgroundColor: l.couleur }}
                    />
                  )}
                  {l.titre}
                </td>
                {colonnes.map((c) => (
                  <td key={c.cle} className="px-2 py-1 text-right tabular-nums text-slate-700">
                    {rendre(grille.parCase.get(`${l.cle}\u001f${c.cle}`))}
                  </td>
                ))}
                <td className="px-2 py-1 text-right tabular-nums font-semibold text-slate-900 border-l border-slate-200">
                  {rendre(grille.parLigne.get(l.cle))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="px-2 py-1.5 font-semibold text-slate-800 sticky left-0 bg-slate-50 z-10">
                Total général
              </td>
              {colonnes.map((c) => (
                <td
                  key={c.cle}
                  className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800"
                >
                  {rendre(grille.parColonne.get(c.cle))}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right tabular-nums font-bold text-blue-800 border-l border-slate-200">
                {rendre(donnees)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {note && <p className="text-[10px] text-slate-400 mt-1.5">{note}</p>}
      {alerte && <p className="text-[10px] text-amber-700 mt-0.5">{alerte}</p>}
    </div>
  );
}

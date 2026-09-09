"use client";

import { useMemo, useState } from "react";
import type { TauxRow } from "@/lib/tauxTypes";

type Props = {
  rows: TauxRow[];
  source: string;
};

/** Libellés lisibles des sections, dont les codes portent leur numéro d'ordre
 *  dans le bulletin BCEAO. « 10a_Conditions_banque_categorie » ne se met pas
 *  devant un lecteur. */
const NOMS_SECTIONS: Record<string, string> = {
  "1_Taux_directeurs_BCEAO": "Taux directeurs BCEAO",
  "2_Marche_monetaire": "Marché monétaire",
  "3_Credits_Depots_UEMOA": "Crédits et dépôts",
  "4_Inflation_pays_UEMOA": "Inflation par pays",
  "5_Reserves_Agregats": "Agrégats monétaires",
  "6_Taux_directeurs_partenaires": "Taux directeurs partenaires",
  "7_Change_EUR": "Change EUR",
  "8_Interbancaire_UMOA": "Interbancaire UMOA",
  "9_Reserves_const_vs_req": "Réserves obligatoires",
  "10a_Conditions_banque_categorie": "Conditions de banque — catégorie",
  "10b_Conditions_banque_objet": "Conditions de banque — objet",
  "11_Inflation_composante": "Inflation par composante",
  "12_Activite_economique": "Activité économique",
  "13_Climat_affaires": "Climat des affaires",
};

const UNITES: Record<string, string> = {
  pct: "%",
  Mds_FCFA: "Mds FCFA",
  M_FCFA: "M FCFA",
  rate: "",
  x: "",
};

/** Nombre de lignes affichées. Le jeu complet dépasse la dizaine de milliers ;
 *  les peindre toutes fige le navigateur pour un tableau que personne ne fait
 *  défiler jusqu'au bout. Le téléchargement, lui, n'est pas tronqué. */
const MAX_LIGNES = 400;

function fmtValeur(v: number, unit: string): string {
  if (!Number.isFinite(v)) return "—";
  const dec = unit === "Mds_FCFA" || unit === "M_FCFA" ? 1 : 2;
  return v
    .toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    .replace(/ | /g, " ");
}

export default function DonneesSection({ rows, source }: Props) {
  const [section, setSection] = useState("");
  const [pays, setPays] = useState("");
  const [recherche, setRecherche] = useState("");

  const sections = useMemo(
    () => [...new Set(rows.map((r) => r.section))].sort(),
    [rows],
  );
  const paysDispo = useMemo(() => {
    const pertinents = section ? rows.filter((r) => r.section === section) : rows;
    return [...new Set(pertinents.map((r) => r.country))].sort();
  }, [rows, section]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!section || r.section === section) &&
        (!pays || r.country === pays) &&
        (!q ||
          r.indicator.toLowerCase().includes(q) ||
          r.country.toLowerCase().includes(q)),
    );
  }, [rows, section, pays, recherche]);

  /** Le tableau montre le plus récent en premier ; le fichier reste
   *  chronologique, plus utile pour qui le rouvre dans un tableur. */
  const affichees = useMemo(
    () =>
      [...filtrees]
        .sort(
          (a, b) =>
            b.period.sortKey - a.period.sortKey ||
            a.section.localeCompare(b.section) ||
            a.indicator.localeCompare(b.indicator),
        )
        .slice(0, MAX_LIGNES),
    [filtrees],
  );

  function telecharger() {
    if (filtrees.length === 0) return;
    const entete = "Section;Indicateur;Pays;Periode;Valeur;Unite";
    const corps = [...filtrees]
      .sort(
        (a, b) =>
          a.section.localeCompare(b.section) ||
          a.indicator.localeCompare(b.indicator) ||
          a.country.localeCompare(b.country) ||
          a.period.sortKey - b.period.sortKey,
      )
      .map((r) =>
        [
          NOMS_SECTIONS[r.section] ?? r.section,
          // Le point-virgule est le séparateur : un libellé qui en contient
          // décalerait toutes les colonnes suivantes.
          r.indicator.replace(/;/g, ","),
          r.country.replace(/;/g, ","),
          r.period.iso,
          // Point décimal : le fichier est une donnée, pas un affichage.
          String(r.value),
          UNITES[r.unit] ?? r.unit,
        ].join(";"),
      );
    // BOM UTF-8, sans quoi Excel affiche « Côte d'Ivoire » en mojibake.
    const csv = "﻿" + entete + "\n" + corps.join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffixe = section ? `_${section.replace(/[^A-Za-z0-9]+/g, "-")}` : "_toutes-series";
    a.download = `azimut_taux-uemoa${suffixe}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-base md:text-lg font-semibold">
              Toutes les séries, à télécharger
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {rows.length.toLocaleString("fr-FR").replace(/ | /g, " ")}{" "}
              observations sur {sections.length} sections. Filtrez, puis emportez
              le résultat en CSV.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Section</span>
            <select
              value={section}
              onChange={(e) => {
                setSection(e.target.value);
                setPays("");
              }}
              className="px-3 py-1.5 border border-slate-200 rounded-md text-sm bg-white min-w-56"
            >
              <option value="">Toutes les sections</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {NOMS_SECTIONS[s] ?? s}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Pays / zone</span>
            <select
              value={pays}
              onChange={(e) => setPays(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-md text-sm bg-white min-w-44"
            >
              <option value="">Tous</option>
              {paysDispo.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs flex-1 min-w-52">
            <span className="block text-slate-500 mb-1">Recherche</span>
            <input
              type="text"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="TMP, inflation, réserves…"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm"
            />
          </label>

          <button
            type="button"
            onClick={telecharger}
            disabled={filtrees.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {`📥 Télécharger CSV (${filtrees.length.toLocaleString("fr-FR")} lignes)`}
          </button>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[40rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Période</th>
                <th className="text-left px-3 py-2 font-medium">Indicateur</th>
                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">
                  Section
                </th>
                <th className="text-left px-3 py-2 font-medium">Pays</th>
                <th className="text-right px-4 py-2 font-medium">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {affichees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-slate-400 text-xs py-6">
                    Aucune série ne correspond à ces filtres.
                  </td>
                </tr>
              ) : (
                affichees.map((r, i) => (
                  <tr
                    key={`${r.section}|${r.indicator}|${r.country}|${r.period.iso}|${i}`}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-1.5 text-xs font-mono text-slate-600">
                      {r.period.label}
                    </td>
                    <td className="px-3 py-1.5">{r.indicator}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500 hidden md:table-cell">
                      {NOMS_SECTIONS[r.section] ?? r.section}
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{r.country}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums font-medium">
                      {fmtValeur(r.value, r.unit)}
                      <span className="text-xs font-normal text-slate-400 ml-1">
                        {UNITES[r.unit] ?? ""}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtrees.length > MAX_LIGNES && (
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
            {MAX_LIGNES} lignes affichées sur{" "}
            {filtrees.length.toLocaleString("fr-FR")} — le fichier téléchargé
            contient la totalité.
          </div>
        )}
      </section>

      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-xs text-blue-900">
        <span className="font-medium">Source :</span> {source}. Le fichier sort en
        séparateur point-virgule et point décimal : c&apos;est une donnée, pas un
        affichage, et un tableur francophone la convertit à l&apos;import.
      </div>
    </div>
  );
}

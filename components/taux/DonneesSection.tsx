"use client";

import { useMemo, useState } from "react";
import type { TauxRow } from "@/lib/tauxTypes";
import type { FeuilleMacro } from "@/lib/commerceExterieur";
import type { UserRole } from "@/lib/auth/userRole";
import MemberGateDialog from "@/components/MemberGateDialog";

type Props = {
  rows: TauxRow[];
  source: string;
  /** Catalogue des seize feuilles de data/macro.csv. Seuls les libelles
   *  arrivent au navigateur ; les 719 000 observations restent au serveur. */
  catalogue: FeuilleMacro[];
  userRole: UserRole;
};

/** Ligne d'apercu renvoyee par /api/donnees-bceao. */
type LigneMacro = {
  feuille: string;
  indicateur: string;
  pays: string;
  periode: string;
  valeur: number;
  periodicite: string;
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

export default function DonneesSection({
  rows,
  source,
  catalogue,
  userRole,
}: Props) {
  // Le telechargement est reserve aux abonnes Premium. Ce test-ci ne fait que
  // l'interface : le controle qui compte est dans /api/donnees-bceao, cote
  // serveur. Un bouton grise n'est pas un controle d'acces.
  const premium = userRole === "premium" || userRole === "pro";
  const [gateOuverte, setGateOuverte] = useState(false);
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
    if (!premium) {
      setGateOuverte(true);
      return;
    }
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
              observations sur {sections.length} sections. Consultation libre ;
              téléchargement réservé aux abonnés Premium.
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
            {premium
              ? `📥 Télécharger CSV (${filtrees.length.toLocaleString("fr-FR")} lignes)`
              : `🔒 Télécharger CSV (${filtrees.length.toLocaleString("fr-FR")} lignes)`}
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

      <BaseMacro
        catalogue={catalogue}
        premium={premium}
        onGate={() => setGateOuverte(true)}
      />

      <MemberGateDialog
        open={gateOuverte}
        onClose={() => setGateOuverte(false)}
        tier="premium"
        title="Téléchargement réservé aux abonnés Premium"
        description="La consultation des séries BCEAO est libre. L'export CSV — jusqu'à 719 000 observations de 1960 à aujourd'hui — fait partie de l'abonnement Premium."
      />

      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 text-xs text-blue-900">
        <span className="font-medium">Source :</span> {source}. Le fichier sort en
        séparateur point-virgule et point décimal : c&apos;est une donnée, pas un
        affichage, et un tableur francophone la convertit à l&apos;import.
      </div>
    </div>
  );
}

/** Base macroeconomique complete : seize feuilles, 1960 a 2026.
 *
 *  Contrairement au bulletin, ces series ne sont PAS dans le navigateur. Le
 *  catalogue seul y arrive ; l'apercu et le fichier viennent du serveur, ce qui
 *  evite d'envoyer 719 000 lignes a qui ouvre simplement l'onglet.
 */
function BaseMacro({
  catalogue,
  premium,
  onGate,
}: {
  catalogue: FeuilleMacro[];
  premium: boolean;
  onGate: () => void;
}) {
  const [feuille, setFeuille] = useState(catalogue[0]?.feuille ?? "");
  const [indicateur, setIndicateur] = useState("");
  const [pays, setPays] = useState("");
  const [apercu, setApercu] = useState<LigneMacro[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");

  const courante = catalogue.find((f) => f.feuille === feuille);

  const params = () => {
    const p = new URLSearchParams({ source: "macro", feuille });
    if (indicateur) p.set("indicateur", indicateur);
    if (pays) p.set("pays", pays);
    return p;
  };

  async function charger() {
    if (!feuille) return;
    setChargement(true);
    setErreur("");
    try {
      const r = await fetch(`/api/donnees-bceao?${params().toString()}`);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setApercu(d.apercu ?? []);
      setTotal(d.total ?? 0);
    } catch {
      setErreur("Chargement impossible. Réessayez dans un instant.");
      setApercu([]);
      setTotal(null);
    } finally {
      setChargement(false);
    }
  }

  function telecharger() {
    if (!premium) {
      onGate();
      return;
    }
    const p = params();
    p.set("format", "csv");
    window.location.href = `/api/donnees-bceao?${p.toString()}`;
  }

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="mb-4">
        <h2 className="text-base md:text-lg font-semibold">
          Base macroéconomique BCEAO
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Seize feuilles, {catalogue
            .reduce((t, f) => t + f.lignes, 0)
            .toLocaleString("fr-FR")}{" "}
          observations de 1960 à aujourd&apos;hui : comptes nationaux, balance
          des paiements, finances publiques, crédit sectoriel, monnaie,
          inflation, change. Trop volumineuse pour le navigateur — elle se
          consulte et s&apos;exporte feuille par feuille.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-xs">
          <span className="block text-slate-500 mb-1">Feuille</span>
          <select
            value={feuille}
            onChange={(e) => {
              setFeuille(e.target.value);
              setIndicateur("");
              setPays("");
              setApercu([]);
              setTotal(null);
            }}
            className="px-3 py-1.5 border border-slate-200 rounded-md text-sm bg-white min-w-52"
          >
            {catalogue.map((f) => (
              <option key={f.feuille} value={f.feuille}>
                {f.feuille} ({f.lignes.toLocaleString("fr-FR")})
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          <span className="block text-slate-500 mb-1">Indicateur</span>
          <select
            value={indicateur}
            onChange={(e) => setIndicateur(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-md text-sm bg-white max-w-96"
          >
            <option value="">
              Tous ({courante?.indicateurs.length ?? 0})
            </option>
            {courante?.indicateurs.map((i) => (
              <option key={i} value={i}>
                {i.length > 70 ? i.slice(0, 69) + "…" : i}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          <span className="block text-slate-500 mb-1">Pays</span>
          <select
            value={pays}
            onChange={(e) => setPays(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-md text-sm bg-white"
          >
            <option value="">Tous</option>
            {courante?.pays.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={charger}
          disabled={chargement}
          className="px-3 py-1.5 rounded-md border border-slate-300 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-40"
        >
          {chargement ? "Chargement…" : "Aperçu"}
        </button>

        <button
          type="button"
          onClick={telecharger}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition"
        >
          {premium ? "📥 Télécharger CSV" : "🔒 Télécharger CSV"}
        </button>
      </div>

      {courante && (
        <p className="text-[11px] text-slate-400 mb-3">
          {courante.indicateurs.length} indicateurs ·{" "}
          {courante.pays.length} pays · {courante.premiere} → {courante.derniere}{" "}
          · périodicité {courante.periodicite}
        </p>
      )}

      {erreur && (
        <p className="text-xs text-red-700 mb-3">{erreur}</p>
      )}

      {apercu.length > 0 && (
        <div className="border border-slate-200 rounded-md overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Période</th>
                  <th className="text-left px-3 py-2 font-medium">Indicateur</th>
                  <th className="text-left px-3 py-2 font-medium">Pays</th>
                  <th className="text-right px-3 py-2 font-medium">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {apercu.map((l, i) => (
                  <tr
                    key={`${l.indicateur}|${l.pays}|${l.periode}|${i}`}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-3 py-1.5 text-xs font-mono text-slate-600">
                      {l.periode}
                    </td>
                    <td className="px-3 py-1.5">{l.indicateur}</td>
                    <td className="px-3 py-1.5 text-slate-600">{l.pays}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                      {l.valeur.toLocaleString("fr-FR", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total !== null && total > apercu.length && (
            <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
              {apercu.length} lignes affichées sur{" "}
              {total.toLocaleString("fr-FR")} — le fichier téléchargé contient la
              totalité.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

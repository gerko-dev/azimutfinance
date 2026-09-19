"use client";

import { useMemo, useState } from "react";
import Lien from "@/components/NavigationProgress";
import type { PeSyntheseLigne } from "@/lib/pe";

type Props = {
  lignes: PeSyntheseLigne[];
  secteurs: string[];
  pays: { code: string; label: string }[];
};

type SortKey = "nom" | "revenu" | "resultatNet" | "margeNette" | "roe" | "anneeRef";

const PAGE_SIZE = 50;

const PAYS_LABEL: Record<string, string> = {
  CI: "Côte d'Ivoire",
  SN: "Sénégal",
  ML: "Mali",
  BF: "Burkina Faso",
  TG: "Togo",
  BJ: "Bénin",
  NE: "Niger",
  GW: "Guinée-Bissau",
  GH: "Ghana",
  NG: "Nigeria",
  TN: "Tunisie",
};

const MODELE_LABEL: Record<string, string> = {
  societe: "Société",
  banque: "Banque",
  assurance: "Assurance",
};

function fmtMontant(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/** Tri : les valeurs absentes finissent toujours en bas, quel que soit le sens. */
function compare(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

/**
 * En-tete triable. Defini au niveau module, et non dans le rendu : un
 * composant cree pendant le rendu est une nouvelle identite a chaque frappe,
 * donc un remontage de toute la ligne d'en-tete — et la perte du focus clavier.
 */
function Th({
  k,
  children,
  align = "right",
  sortKey,
  asc,
  onSort,
}: {
  k: SortKey;
  children: React.ReactNode;
  align?: "left" | "right";
  sortKey: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      className={`px-3 py-2 font-medium whitespace-nowrap ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-slate-900 transition ${
          active ? "text-slate-900" : "text-slate-500"
        }`}
      >
        {children}
        <span aria-hidden className={active ? "opacity-70" : "opacity-25"}>
          {active && asc ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

export default function PrivateEquityView({ lignes, secteurs, pays }: Props) {
  const [q, setQ] = useState("");
  const [secteur, setSecteur] = useState("");
  const [modele, setModele] = useState("");
  // "" = tous, "?" = pays non determine. Une valeur dediee plutot qu'un filtre
  // absent : 1156 entreprises sont dans ce cas, il faut pouvoir les isoler.
  const [paysSel, setPaysSel] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("revenu");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    let out = lignes;
    if (needle) {
      out = out.filter((l) =>
        l.nom
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .includes(needle),
      );
    }
    if (secteur) out = out.filter((l) => l.secteur === secteur);
    if (modele) out = out.filter((l) => l.modele === modele);
    if (paysSel === "?") out = out.filter((l) => !l.pays);
    else if (paysSel) out = out.filter((l) => l.pays === paysSel);

    const dir: 1 | -1 = asc ? 1 : -1;
    return [...out].sort((a, b) => {
      if (sortKey === "nom") return a.nom.localeCompare(b.nom, "fr") * dir;
      if (sortKey === "anneeRef") return compare(a.anneeRef, b.anneeRef, dir);
      return compare(a[sortKey], b[sortKey], dir);
    });
  }, [lignes, q, secteur, modele, paysSel, sortKey, asc]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  function sortBy(k: SortKey) {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "nom");
    }
    setPage(0);
  }

  return (
    <div>
      {/* Filtres : une seule rangée, au-dessus du tableau. */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Rechercher une entreprise…"
          className="flex-1 min-w-[200px] text-sm border border-slate-300 rounded-md px-3 py-2"
        />
        <select
          value={secteur}
          onChange={(e) => {
            setSecteur(e.target.value);
            setPage(0);
          }}
          className="text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
        >
          <option value="">Tous les secteurs</option>
          {secteurs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={modele}
          onChange={(e) => {
            setModele(e.target.value);
            setPage(0);
          }}
          className="text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
        >
          <option value="">Tous les modèles</option>
          <option value="societe">Sociétés</option>
          <option value="banque">Banques</option>
          <option value="assurance">Assurances</option>
        </select>
        <select
          value={paysSel}
          onChange={(e) => {
            setPaysSel(e.target.value);
            setPage(0);
          }}
          title="Pays déduit de la raison sociale"
          className="text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
        >
          <option value="">Tous les pays</option>
          {pays.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
          <option value="?">Pays non déterminé</option>
        </select>
      </div>

      <div className="text-xs text-slate-500 mb-2">
        {filtered.length.toLocaleString("fr-FR")} entreprise
        {filtered.length > 1 ? "s" : ""} · montants en{" "}
        <strong className="text-slate-700">millions de FCFA</strong> · dernier
        exercice publié
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs">
              <tr>
                <Th k="nom" align="left" sortKey={sortKey} asc={asc} onSort={sortBy}>
                  Entreprise
                </Th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">
                  Secteur
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">
                  Pays
                </th>
                <Th k="anneeRef" sortKey={sortKey} asc={asc} onSort={sortBy}>Exercice</Th>
                <Th k="revenu" sortKey={sortKey} asc={asc} onSort={sortBy}>CA / PNB</Th>
                <Th k="resultatNet" sortKey={sortKey} asc={asc} onSort={sortBy}>Résultat net</Th>
                <Th k="margeNette" sortKey={sortKey} asc={asc} onSort={sortBy}>Marge nette</Th>
                <Th k="roe" sortKey={sortKey} asc={asc} onSort={sortBy}>ROE</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((l) => (
                <tr key={l.slug} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Lien
                      href={`/marches/private-equity/${l.slug}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {l.nom}
                    </Lien>
                    {l.modele !== "societe" && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {MODELE_LABEL[l.modele]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">
                    {l.secteur || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">
                    {PAYS_LABEL[l.pays] ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {l.anneeRef ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMontant(l.revenu)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      l.resultatNet !== null && l.resultatNet < 0
                        ? "text-rose-600"
                        : ""
                    }`}
                  >
                    {fmtMontant(l.resultatNet)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {fmtPct(l.margeNette)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {fmtPct(l.roe)}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    Aucune entreprise ne correspond à ces critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={current === 0}
            className="px-3 py-1.5 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
          >
            ← Précédent
          </button>
          <span className="text-slate-500">
            Page {current + 1} sur {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={current >= pages - 1}
            className="px-3 py-1.5 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}

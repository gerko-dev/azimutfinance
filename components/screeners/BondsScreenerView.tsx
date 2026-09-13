"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { BondScreenerRow, BondSegment } from "@/lib/screeners/obligations";

type Props = {
  rows: BondScreenerRow[];
  issuerTypes: string[];
  countries: string[];
  ratings: string[];
  amortizationTypes: string[];
  priceDate: string;
  pricesFromFallback: boolean;
};

type SortKey =
  | "name"
  | "couponRate"
  | "yearsToMaturity"
  | "ytm"
  | "cleanPrice"
  | "outstanding";

const PAGE = 40;

function fmtPct(v: number | null, dec = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })} %`;
}

function fmtNum(v: number | null, dec = 0): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

/** Les valeurs absentes finissent en bas, quel que soit le sens du tri. */
function cmpNullable(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onToggle(o)}
          className={`px-2 py-1 rounded-full text-[11px] border transition ${
            selected.has(o)
              ? "bg-blue-600 border-blue-600 text-white"
              : "bg-white border-slate-300 text-slate-600 hover:border-slate-400"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * En-tete triable, defini au niveau module : un composant cree pendant le
 * rendu est une nouvelle identite a chaque frappe, donc un remontage de la
 * ligne d'en-tete et la perte du focus clavier.
 */
function Th({
  k,
  children,
  sortKey,
  asc,
  onSort,
}: {
  k: SortKey;
  children: React.ReactNode;
  sortKey: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const actif = sortKey === k;
  return (
    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 transition ${
          actif ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
        }`}
      >
        {children}
        <span aria-hidden className={actif ? "opacity-70" : "opacity-25"}>
          {actif && asc ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

export default function BondsScreenerView({
  rows,
  issuerTypes,
  countries,
  ratings,
  amortizationTypes,
  priceDate,
  pricesFromFallback,
}: Props) {
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [pays, setPays] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Set<string>>(new Set());
  const [amort, setAmort] = useState<Set<string>>(new Set());
  const [couponMin, setCouponMin] = useState("");
  const [couponMax, setCouponMax] = useState("");
  const [matMin, setMatMin] = useState("");
  const [matMax, setMatMax] = useState("");
  const [ytmMin, setYtmMin] = useState("");
  const [coteesSeules, setCoteesSeules] = useState(false);
  // "" = les deux univers. Un investisseur qui cherche « du 6,5 % a 5 ans » ne
  // veut pas choisir son univers avant de chercher.
  const [segment, setSegment] = useState<BondSegment | "">("");
  const [vertesSeules, setVertesSeules] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("ytm");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, v: string) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
    setPage(0);
  }

  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cMin = num(couponMin);
    const cMax = num(couponMax);
    const mMin = num(matMin);
    const mMax = num(matMax);
    const yMin = num(ytmMin);

    const out = rows.filter((r) => {
      if (needle) {
        const hay = `${r.code} ${r.name} ${r.issuer} ${r.isin}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (segment && r.segment !== segment) return false;
      if (types.size && !types.has(r.issuerType)) return false;
      if (pays.size && !pays.has(r.country)) return false;
      if (notes.size && !notes.has(r.rating)) return false;
      if (amort.size && !amort.has(r.amortizationType)) return false;
      // Le coupon est stocke en decimal (0,0625) ; l'utilisateur saisit 6,25.
      // Les BAT sont zero-coupon : `couponRate` est null et un filtre de
      // coupon doit les exclure plutot que de les traiter comme du 0 %.
      if (cMin !== null && (r.couponRate === null || r.couponRate * 100 < cMin)) return false;
      if (cMax !== null && (r.couponRate === null || r.couponRate * 100 > cMax)) return false;
      if (mMin !== null && r.yearsToMaturity < mMin) return false;
      if (mMax !== null && r.yearsToMaturity > mMax) return false;
      if (yMin !== null && (r.ytm === null || r.ytm * 100 < yMin)) return false;
      if (coteesSeules && r.cleanPrice === null) return false;
      if (vertesSeules && !r.greenBond) return false;
      return true;
    });

    const dir: 1 | -1 = asc ? 1 : -1;
    return [...out].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "fr") * dir;
      return cmpNullable(
        a[sortKey] as number | null,
        b[sortKey] as number | null,
        dir,
      );
    });
  }, [
    rows, q, segment, types, pays, notes, amort,
    couponMin, couponMax, matMin, matMax, ytmMin,
    coteesSeules, vertesSeules, sortKey, asc,
  ]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const visible = filtered.slice(cur * PAGE, (cur + 1) * PAGE);

  // Statistiques du sous-ensemble filtre : ce que l'utilisateur vient de
  // selectionner, pas le marche entier — c'est la reponse a sa question.
  const stats = useMemo(() => {
    const avecYtm = filtered.filter((r) => r.ytm !== null).map((r) => r.ytm as number);
    const moy = avecYtm.length
      ? avecYtm.reduce((s, v) => s + v, 0) / avecYtm.length
      : null;
    const encours = filtered.reduce((s, r) => s + (r.outstanding || 0), 0);
    const matMoy = filtered.length
      ? filtered.reduce((s, r) => s + r.yearsToMaturity, 0) / filtered.length
      : null;
    return { moy, encours, matMoy, cotees: avecYtm.length };
  }, [filtered]);

  function sortBy(k: SortKey) {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "name");
    }
    setPage(0);
  }

  function reset() {
    setQ("");
    setTypes(new Set());
    setPays(new Set());
    setNotes(new Set());
    setAmort(new Set());
    setCouponMin("");
    setCouponMax("");
    setMatMin("");
    setMatMax("");
    setYtmMin("");
    setCoteesSeules(false);
    setVertesSeules(false);
    setSegment("");
    setPage(0);
  }


  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Code, émetteur, ISIN…"
            className="flex-1 min-w-[220px] text-sm border border-slate-300 rounded-md px-3 py-2"
          />
          <select
            value={segment}
            onChange={(e) => {
              setSegment(e.target.value as BondSegment | "");
              setPage(0);
            }}
            className="text-sm border border-slate-300 rounded-md px-3 py-2 bg-white"
          >
            <option value="">Cotées + souverains</option>
            <option value="cotee">Obligations cotées BRVM</option>
            <option value="souverain">Souverains UMOA-Titres (OAT / BAT)</option>
          </select>
          <button
            onClick={reset}
            className="text-xs px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Réinitialiser
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Coupon (%)
            </label>
            <div className="flex gap-1.5">
              <input value={couponMin} onChange={(e) => { setCouponMin(e.target.value); setPage(0); }}
                placeholder="min" inputMode="decimal"
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5" />
              <input value={couponMax} onChange={(e) => { setCouponMax(e.target.value); setPage(0); }}
                placeholder="max" inputMode="decimal"
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Maturité résiduelle (années)
            </label>
            <div className="flex gap-1.5">
              <input value={matMin} onChange={(e) => { setMatMin(e.target.value); setPage(0); }}
                placeholder="min" inputMode="decimal"
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5" />
              <input value={matMax} onChange={(e) => { setMatMax(e.target.value); setPage(0); }}
                placeholder="max" inputMode="decimal"
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Rendement minimum (%)
            </label>
            <input value={ytmMin} onChange={(e) => { setYtmMin(e.target.value); setPage(0); }}
              placeholder="ex : 6" inputMode="decimal"
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5" />
          </div>
          <div className="flex flex-col justify-end gap-1.5">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={coteesSeules}
                onChange={(e) => { setCoteesSeules(e.target.checked); setPage(0); }} />
              Uniquement les lignes cotées
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={vertesSeules}
                onChange={(e) => { setVertesSeules(e.target.checked); setPage(0); }} />
              Obligations vertes
            </label>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <div>
            <div className="text-[11px] font-medium text-slate-500 mb-1">Type d&apos;émetteur</div>
            <Chips options={issuerTypes} selected={types} onToggle={(v) => toggle(types, setTypes, v)} />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 mb-1">Pays</div>
            <Chips options={countries} selected={pays} onToggle={(v) => toggle(pays, setPays, v)} />
          </div>
          {ratings.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-slate-500 mb-1">Notation</div>
              <Chips options={ratings} selected={notes} onToggle={(v) => toggle(notes, setNotes, v)} />
            </div>
          )}
          <div>
            <div className="text-[11px] font-medium text-slate-500 mb-1">Amortissement</div>
            <Chips options={amortizationTypes} selected={amort} onToggle={(v) => toggle(amort, setAmort, v)} />
          </div>
        </div>
      </div>

      {/* Synthèse du sous-ensemble */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: "Lignes retenues", v: filtered.length.toLocaleString("fr-FR"), s: `sur ${rows.length}` },
          { l: "Rendement moyen", v: fmtPct(stats.moy), s: `${stats.cotees} ligne${stats.cotees > 1 ? "s" : ""} cotée${stats.cotees > 1 ? "s" : ""}` },
          { l: "Maturité moyenne", v: stats.matMoy === null ? "—" : `${stats.matMoy.toFixed(1).replace(".", ",")} ans`, s: "moyenne simple" },
          { l: "Encours cumulé", v: fmtNum(stats.encours), s: "FCFA" },
        ].map((k) => (
          <div key={k.l} className="bg-white border border-slate-200 rounded-lg px-3.5 py-3">
            <div className="text-[11px] text-slate-500">{k.l}</div>
            <div className="text-xl font-semibold tabular-nums mt-0.5">{k.v}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{k.s}</div>
          </div>
        ))}
      </div>

      {/* Tableau */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Titre</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500">Émetteur</th>
                <Th k="couponRate" sortKey={sortKey} asc={asc} onSort={sortBy}>Coupon</Th>
                <Th k="yearsToMaturity" sortKey={sortKey} asc={asc} onSort={sortBy}>Maturité</Th>
                <Th k="cleanPrice" sortKey={sortKey} asc={asc} onSort={sortBy}>Cours</Th>
                <Th k="ytm" sortKey={sortKey} asc={asc} onSort={sortBy}>Rendement</Th>
                <Th k="outstanding" sortKey={sortKey} asc={asc} onSort={sortBy}>Encours</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((r) => (
                <tr key={r.isin} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/obligation/${r.isin}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {r.code || r.isin}
                    </Link>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {r.greenBond && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          Verte
                        </span>
                      )}
                      {r.callable && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20">
                          Rappelable
                        </span>
                      )}
                      {r.rating && (
                        <span className="text-[9px] text-slate-400">{r.rating}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {r.issuer}
                    <div className="text-[10px] text-slate-400">
                      {r.issuerType}
                      {r.country ? ` · ${r.country}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.couponRate === null ? (
                      <span className="text-slate-400 text-xs">zéro coupon</span>
                    ) : (
                      fmtPct(r.couponRate)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {r.yearsToMaturity.toFixed(1).replace(".", ",")} ans
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {fmtNum(r.cleanPrice, 2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtPct(r.ytm)}
                    {r.ytmSource === "adjudication" && (
                      <div className="text-[9px] font-normal text-slate-400">
                        adjudication
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500 text-xs">
                    {fmtNum(r.outstanding)}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    Aucune obligation ne correspond à ces critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={cur === 0}
            className="px-3 py-1.5 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50">
            ← Précédent
          </button>
          <span className="text-slate-500">Page {cur + 1} sur {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={cur >= pages - 1}
            className="px-3 py-1.5 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50">
            Suivant →
          </button>
        </div>
      )}

      <p className="text-xs text-slate-500 leading-relaxed">
        {pricesFromFallback ? (
          <>
            <strong>Cote BRVM momentanément indisponible</strong> — les cours
            affichés sont les derniers connus, relevés le {priceDate}.{" "}
          </>
        ) : (
          <>Cours relevés le {priceDate} sur la cote BRVM. </>
        )}
        Deux univers cohabitent : les obligations cotées, dont le rendement est
        un YTM calculé sur le dernier cours de marché, et les souverains
        UMOA-Titres (OAT / BAT), qui n&apos;ont pas de marché secondaire — leur
        rendement est celui de la dernière adjudication, signalé comme tel. Le rendement à
        l&apos;échéance n&apos;est calculé que pour les lignes ayant coté : une
        ligne sans transaction n&apos;affiche ni cours ni rendement plutôt
        qu&apos;un zéro qui remonterait en tête du classement. Les titres échus
        sont exclus.
      </p>
    </div>
  );
}

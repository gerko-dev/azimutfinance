"use client";

import { useMemo, useState } from "react";
import Lien from "@/components/NavigationProgress";
import type { PeActionnaire, PeModele, PeUnite } from "@/lib/pe";

export type PeBloc = { titre: string; codes: string[] };
export type PePeerLigne = {
  slug: string;
  nom: string;
  revenu: number | null;
  resultatNet: number | null;
  margeNette: number | null;
};

type Props = {
  nom: string;
  secteur: string;
  paysLabel: string;
  paysNote: string;
  paysSourceLabel: string;
  modele: PeModele;
  annees: number[];
  /** valeurs[code][annee] — absent = non publie. */
  valeurs: Record<string, Record<number, number>>;
  blocs: PeBloc[];
  libelles: Record<string, string>;
  unites: Record<string, PeUnite>;
  actionnaires: PeActionnaire[];
  medianesSecteur: Record<string, number | null>;
  effectifSecteur: number;
  peers: PePeerLigne[];
};

type TabId =
  | "apercu"
  | "resultat"
  | "bilan"
  | "ratios"
  | "actionnariat"
  | "comparables";

const MODELE_LABEL: Record<PeModele, string> = {
  societe: "Société",
  banque: "Banque",
  assurance: "Assurance",
};

function fmt(v: number | undefined | null, unite: PeUnite = "mfcfa"): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  if (unite === "pct")
    return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
  if (unite === "x")
    return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ×`;
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

/** Montant compact : 1 234 567 M FCFA devient « 1 234,6 Md ». */
function fmtCompact(v: number | null | undefined): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000)
    return `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Bn`;
  if (abs >= 1_000)
    return `${(v / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Md`;
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

/* ------------------------------------------------------------------ */
/* Graphiques — SVG inline, rendus serveur, sans dependance            */
/* ------------------------------------------------------------------ */

/** Colonnes signees, une par exercice. */
function BarSeries({
  annees,
  serie,
  couleur = "#3b82f6",
  hauteur = 120,
}: {
  annees: number[];
  serie: Record<number, number> | undefined;
  couleur?: string;
  hauteur?: number;
}) {
  const pts = annees.map((a) => ({ a, v: serie?.[a] }));
  const vals = pts.map((p) => p.v).filter((v): v is number => Number.isFinite(v));
  if (vals.length === 0) return null;
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const zeroY = (max / span) * hauteur;

  const W = Math.max(240, annees.length * 64);
  const bw = W / annees.length;

  return (
    <svg viewBox={`0 0 ${W} ${hauteur + 22}`} className="w-full h-auto">
      <line
        x1="0"
        x2={W}
        y1={zeroY}
        y2={zeroY}
        stroke="#cbd5e1"
        strokeWidth="1"
      />
      {pts.map((p, i) => {
        if (!Number.isFinite(p.v)) {
          return (
            <text
              key={p.a}
              x={i * bw + bw / 2}
              y={hauteur + 16}
              textAnchor="middle"
              fontSize="10"
              fill="#94a3b8"
            >
              {p.a}
            </text>
          );
        }
        const v = p.v as number;
        const h = (Math.abs(v) / span) * hauteur;
        const y = v >= 0 ? zeroY - h : zeroY;
        return (
          <g key={p.a}>
            <rect
              x={i * bw + bw * 0.22}
              y={y}
              width={bw * 0.56}
              height={Math.max(1, h)}
              rx="3"
              fill={v < 0 ? "#fb7185" : couleur}
            />
            <text
              x={i * bw + bw / 2}
              y={hauteur + 16}
              textAnchor="middle"
              fontSize="10"
              fill="#94a3b8"
            >
              {p.a}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Ligne d'evolution, pour les series en pourcentage. */
function LineSeries({
  annees,
  serie,
  couleur = "#0ea5e9",
}: {
  annees: number[];
  serie: Record<number, number> | undefined;
  couleur?: string;
}) {
  const pts = annees
    .map((a, i) => ({ i, a, v: serie?.[a] }))
    .filter((p) => Number.isFinite(p.v)) as { i: number; a: number; v: number }[];
  if (pts.length < 2) return null;
  const W = 240;
  const H = 44;
  const vals = pts.map((p) => p.v);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const x = (i: number) => (i / (annees.length - 1)) * W;
  const y = (v: number) => 4 + (1 - (v - min) / span) * (H - 8);
  const d = pts
    .map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-[240px]">
      <path d={d} fill="none" stroke={couleur} strokeWidth="2" strokeLinecap="round" />
      <circle cx={x(pts[pts.length - 1].i)} cy={y(pts[pts.length - 1].v)} r="3" fill={couleur} />
    </svg>
  );
}

/** Barre comparative entreprise / mediane du secteur. */
function VsSecteur({
  valeur,
  mediane,
  unite,
}: {
  valeur: number | undefined;
  mediane: number | null;
  unite: PeUnite;
}) {
  if (!Number.isFinite(valeur) || mediane === null) return null;
  const v = valeur as number;
  const max = Math.max(Math.abs(v), Math.abs(mediane)) || 1;
  const wv = (Math.abs(v) / max) * 100;
  const wm = (Math.abs(mediane) / max) * 100;
  const mieux = v >= mediane;
  return (
    <div className="space-y-1 min-w-[140px]">
      <div className="flex items-center gap-2">
        <div className="h-2 rounded-full bg-slate-100 flex-1 overflow-hidden">
          <div
            className={`h-full rounded-full ${mieux ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${wv}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums w-20 text-right">
          {fmt(v, unite)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 rounded-full bg-slate-100 flex-1 overflow-hidden">
          <div className="h-full rounded-full bg-slate-300" style={{ width: `${wm}%` }} />
        </div>
        <span className="text-[11px] tabular-nums w-20 text-right text-slate-500">
          {fmt(mediane, unite)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TableauBloc({
  codes,
  annees,
  valeurs,
  libelles,
  unites,
  vedette,
}: {
  codes: string[];
  annees: number[];
  valeurs: Record<string, Record<number, number>>;
  libelles: Record<string, string>;
  unites: Record<string, PeUnite>;
  vedette?: string;
}) {
  const lignes = codes.filter((c) =>
    annees.some((a) => Number.isFinite(valeurs[c]?.[a])),
  );
  if (lignes.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-slate-500">
        Aucune de ces lignes n&apos;est publiée pour cette entreprise.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500 border-b border-slate-100">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Libellé</th>
            {annees.map((a) => (
              <th key={a} className="px-3 py-2 text-right font-medium tabular-nums">
                {a}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium w-[150px]">Tendance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lignes.map((code) => {
            const unite = unites[code] ?? "mfcfa";
            const isVedette = code === vedette;
            return (
              <tr key={code} className="hover:bg-slate-50">
                <td className={`px-4 py-2 ${isVedette ? "font-semibold" : "text-slate-700"}`}>
                  {libelles[code] ?? code}
                  {unite === "mfcfa" && (
                    <span className="ml-1.5 text-[10px] text-slate-400">M FCFA</span>
                  )}
                </td>
                {annees.map((a) => {
                  const v = valeurs[code]?.[a];
                  const neg = Number.isFinite(v) && (v as number) < 0;
                  return (
                    <td
                      key={a}
                      className={`px-3 py-2 text-right tabular-nums ${neg ? "text-rose-600" : ""} ${isVedette ? "font-semibold" : ""}`}
                    >
                      {fmt(v, unite)}
                    </td>
                  );
                })}
                <td className="px-3 py-2">
                  {unite === "mfcfa" ? (
                    <BarSeries annees={annees} serie={valeurs[code]} hauteur={26} />
                  ) : (
                    <LineSeries annees={annees} serie={valeurs[code]} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PeCompanyView({
  nom,
  secteur,
  paysLabel,
  paysNote,
  paysSourceLabel,
  modele,
  annees,
  valeurs,
  blocs,
  libelles,
  unites,
  actionnaires,
  medianesSecteur,
  effectifSecteur,
  peers,
}: Props) {
  const [tab, setTab] = useState<TabId>("apercu");

  const codeRevenu = modele === "banque" ? "pnb" : "ca";
  const hasComptes = annees.length > 0;
  const derniere = hasComptes ? annees[annees.length - 1] : null;
  const premiere = hasComptes ? annees[0] : null;

  const at = (code: string, a: number | null) =>
    a === null ? undefined : valeurs[code]?.[a];

  /** CAGR sur la fenetre publiee : la croissance annuelle moyenne, qui lisse
   *  les a-coups d'un exercice isole. Indefinie si le point de depart est nul
   *  ou negatif — un taux de croissance depuis une base negative n'a pas de
   *  sens et vaut mieux ne pas etre affiche. */
  const cagr = useMemo(() => {
    if (premiere === null || derniere === null || premiere === derniere) return null;
    const v0 = valeurs[codeRevenu]?.[premiere];
    const v1 = valeurs[codeRevenu]?.[derniere];
    if (!Number.isFinite(v0) || !Number.isFinite(v1) || (v0 as number) <= 0) return null;
    const n = derniere - premiere;
    return (Math.pow((v1 as number) / (v0 as number), 1 / n) - 1) * 100;
  }, [valeurs, codeRevenu, premiere, derniere]);

  const concentration = useMemo(() => {
    const avecPct = actionnaires.filter((a) => a.pct !== null) as (PeActionnaire & {
      pct: number;
    })[];
    if (avecPct.length === 0) return null;
    const tri = [...avecPct].sort((a, b) => b.pct - a.pct);
    return {
      premier: tri[0],
      top3: tri.slice(0, 3).reduce((s, a) => s + a.pct, 0),
      nb: avecPct.length,
    };
  }, [actionnaires]);

  const blocResultat = blocs.find((b) => b.titre === "Compte de résultat");
  const blocBilan = blocs.find((b) => b.titre === "Bilan");
  const blocRatios = blocs.find((b) => b.titre === "Ratios financiers");

  const TABS: { id: TabId; label: string; disabled?: boolean }[] = [
    { id: "apercu", label: "Aperçu" },
    { id: "resultat", label: "Compte de résultat", disabled: !hasComptes },
    { id: "bilan", label: "Bilan", disabled: !hasComptes },
    { id: "ratios", label: "Ratios", disabled: !hasComptes },
    { id: "actionnariat", label: `Actionnariat${actionnaires.length ? ` (${actionnaires.length})` : ""}` },
    { id: "comparables", label: "Comparables", disabled: peers.length === 0 },
  ];

  const kpis = [
    {
      label: modele === "banque" ? "Produit net bancaire" : "Chiffre d'affaires",
      value: fmtCompact(at(codeRevenu, derniere)),
      sub: derniere ? `${derniere} · M FCFA` : "—",
    },
    {
      label: "Résultat net",
      value: fmtCompact(at("resultat_net", derniere)),
      sub: derniere ? `${derniere} · M FCFA` : "—",
      negatif:
        Number.isFinite(at("resultat_net", derniere)) &&
        (at("resultat_net", derniere) as number) < 0,
    },
    {
      label: "Marge nette",
      value: fmt(at("marge_nette", derniere), "pct"),
      sub:
        medianesSecteur.marge_nette !== null && medianesSecteur.marge_nette !== undefined
          ? `médiane secteur ${fmt(medianesSecteur.marge_nette, "pct")}`
          : "—",
    },
    {
      label: "ROE",
      value: fmt(at("roe", derniere), "pct"),
      sub:
        medianesSecteur.roe !== null && medianesSecteur.roe !== undefined
          ? `médiane secteur ${fmt(medianesSecteur.roe, "pct")}`
          : "—",
    },
    {
      label: "Croissance annualisée",
      value: cagr === null ? "—" : `${cagr >= 0 ? "+" : ""}${cagr.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`,
      sub:
        premiere !== null && derniere !== null && premiere !== derniere
          ? `${premiere} → ${derniere}`
          : "un seul exercice",
    },
  ];

  return (
    <div>
      {/* Onglets */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => !t.disabled && setTab(t.id)}
            disabled={t.disabled}
            className={`px-3.5 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
              tab === t.id
                ? "border-blue-600 text-blue-700 font-medium"
                : t.disabled
                  ? "border-transparent text-slate-300 cursor-not-allowed"
                  : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!hasComptes && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
          Cette entreprise figure au référentiel mais{" "}
          <strong>ne publie aucun exercice</strong>. Seuls son secteur et, le cas
          échéant, son actionnariat sont connus.
        </div>
      )}

      {/* ---------------- Aperçu ---------------- */}
      {tab === "apercu" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="bg-white border border-slate-200 rounded-lg px-3.5 py-3"
              >
                <div className="text-[11px] text-slate-500">{k.label}</div>
                <div
                  className={`text-xl font-semibold tabular-nums mt-0.5 ${
                    k.negatif ? "text-rose-600" : ""
                  }`}
                >
                  {k.value}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <section className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-1">
                {modele === "banque" ? "Produit net bancaire" : "Chiffre d'affaires"}
              </h3>
              <p className="text-xs text-slate-500 mb-3">En millions de FCFA</p>
              <BarSeries annees={annees} serie={valeurs[codeRevenu]} />
            </section>
            <section className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-1">Résultat net</h3>
              <p className="text-xs text-slate-500 mb-3">
                En millions de FCFA · les barres rouges sont des pertes
              </p>
              <BarSeries annees={annees} serie={valeurs.resultat_net} couleur="#10b981" />
            </section>
          </div>

          <section className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold">Carte d&apos;identité</h3>
            <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
                <dt className="text-slate-500">Secteur</dt>
                <dd className="text-right">{secteur || "Non renseigné"}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
                <dt className="text-slate-500">Pays</dt>
                <dd className="text-right">
                  {paysLabel ? (
                    <>
                      {paysLabel}
                      {paysSourceLabel && (
                        <span className="block text-[10px] text-slate-400">
                          {paysSourceLabel}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">Non déterminé</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
                <dt className="text-slate-500">Modèle</dt>
                <dd className="text-right">{MODELE_LABEL[modele]}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
                <dt className="text-slate-500">Exercices publiés</dt>
                <dd className="text-right tabular-nums">
                  {hasComptes ? `${annees.length} (${premiere}–${derniere})` : "aucun"}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
                <dt className="text-slate-500">Entreprises du secteur</dt>
                <dd className="text-right tabular-nums">{effectifSecteur}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
                <dt className="text-slate-500">Actionnaires connus</dt>
                <dd className="text-right tabular-nums">{actionnaires.length || "—"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-slate-400">{paysNote}</p>
          </section>
        </div>
      )}

      {/* ---------------- Compte de résultat ---------------- */}
      {tab === "resultat" && blocResultat && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <TableauBloc
            codes={blocResultat.codes}
            annees={annees}
            valeurs={valeurs}
            libelles={libelles}
            unites={unites}
            vedette={codeRevenu}
          />
        </section>
      )}

      {/* ---------------- Bilan ---------------- */}
      {tab === "bilan" && blocBilan && (
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <TableauBloc
              codes={blocBilan.codes}
              annees={annees}
              valeurs={valeurs}
              libelles={libelles}
              unites={unites}
              vedette="total_bilan"
            />
          </section>
          <section className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-1">Capitaux propres</h3>
            <p className="text-xs text-slate-500 mb-3">En millions de FCFA</p>
            <BarSeries annees={annees} serie={valeurs.capitaux_propres} couleur="#6366f1" />
          </section>
        </div>
      )}

      {/* ---------------- Ratios ---------------- */}
      {tab === "ratios" && blocRatios && (
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <TableauBloc
              codes={blocRatios.codes}
              annees={annees}
              valeurs={valeurs}
              libelles={libelles}
              unites={unites}
            />
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold">
              Positionnement dans le secteur
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Barre colorée : l&apos;entreprise au dernier exercice publié. Barre
              grise : la médiane des {effectifSecteur} entreprises du secteur
              {secteur ? ` « ${secteur} »` : ""}. La médiane, et non la moyenne —
              une seule très grande société déplacerait une moyenne au point de
              la rendre inutile. Les exercices ne sont pas alignés d&apos;une
              société à l&apos;autre.
            </p>
            <div className="space-y-4">
              {blocRatios.codes
                .filter(
                  (c) =>
                    Number.isFinite(at(c, derniere)) &&
                    medianesSecteur[c] !== null &&
                    medianesSecteur[c] !== undefined,
                )
                .map((c) => (
                  <div key={c} className="flex items-center gap-4 flex-wrap">
                    <div className="text-sm text-slate-700 w-full sm:w-56 shrink-0">
                      {libelles[c] ?? c}
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <VsSecteur
                        valeur={at(c, derniere)}
                        mediane={medianesSecteur[c] ?? null}
                        unite={unites[c] ?? "mfcfa"}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}

      {/* ---------------- Actionnariat ---------------- */}
      {tab === "actionnariat" && (
        <div className="space-y-4">
          {concentration && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-3">
                <div className="text-[11px] text-slate-500">Premier actionnaire</div>
                <div className="text-xl font-semibold tabular-nums mt-0.5">
                  {fmt(concentration.premier.pct, "pct")}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                  {concentration.premier.actionnaire}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-3">
                <div className="text-[11px] text-slate-500">Top 3 cumulé</div>
                <div className="text-xl font-semibold tabular-nums mt-0.5">
                  {fmt(concentration.top3, "pct")}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {concentration.premier.pct >= 50
                    ? "contrôle majoritaire"
                    : "pas de majorité au premier"}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-3">
                <div className="text-[11px] text-slate-500">Actionnaires chiffrés</div>
                <div className="text-xl font-semibold tabular-nums mt-0.5">
                  {concentration.nb}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  sur {actionnaires.length} connus
                </div>
              </div>
            </div>
          )}

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {actionnaires.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                Actionnariat non publié pour cette entreprise.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {actionnaires.map((a) => (
                  <li
                    key={`${a.rang}-${a.actionnaire}`}
                    className="px-4 py-2.5 flex items-center gap-3"
                  >
                    <span className="flex-1 text-sm text-slate-800">
                      {a.actionnaire}
                    </span>
                    {a.pct !== null && (
                      <>
                        <span className="hidden sm:block w-40 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.min(100, Math.max(1, a.pct))}%` }}
                          />
                        </span>
                        <span className="text-sm tabular-nums font-medium w-16 text-right">
                          {fmt(a.pct, "pct")}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ---------------- Comparables ---------------- */}
      {tab === "comparables" && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-semibold">Entreprises de taille voisine</h3>
            <p className="text-xs text-slate-500 mt-1">
              Même secteur, classées par proximité de revenu au dernier exercice
              publié. Comparer à taille voisine plutôt qu&apos;au secteur entier :
              mettre une PME face à un groupe n&apos;apprend rien.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Entreprise</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {modele === "banque" ? "PNB" : "CA"}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Résultat net</th>
                  <th className="px-3 py-2 text-right font-medium">Marge nette</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-blue-50/60">
                  <td className="px-4 py-2 font-semibold">{nom} (cette fiche)</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {fmt(at(codeRevenu, derniere))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {fmt(at("resultat_net", derniere))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {fmt(at("marge_nette", derniere), "pct")}
                  </td>
                </tr>
                {peers.map((p) => (
                  <tr key={p.slug} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Lien
                        href={`/marches/private-equity/${p.slug}`}
                        className="text-blue-700 hover:underline"
                      >
                        {p.nom}
                      </Lien>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(p.revenu)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        p.resultatNet !== null && p.resultatNet < 0 ? "text-rose-600" : ""
                      }`}
                    >
                      {fmt(p.resultatNet)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(p.margeNette, "pct")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="mt-6 text-xs text-slate-500 leading-relaxed">
        Montants en millions de FCFA, issus des états financiers déposés. Les
        exercices manquants ne sont pas estimés.{" "}
        <Lien href="/marches/private-equity" className="text-blue-700 hover:underline">
          Retour à la liste
        </Lien>
        .
      </p>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ComparateurTitre } from "@/lib/screeners/comparateur";

type Props = {
  titres: ComparateurTitre[];
  dates: string[];
  series: Record<string, (number | null)[]>;
};

/** Quatre titres au maximum : au-dela, le tableau cesse d'etre lisible et la
 *  comparaison visuelle n'apprend plus rien. */
const MAX = 4;

const COULEURS = ["#1d4ed8", "#ea580c", "#16a34a", "#7c3aed"];

const FENETRES = [
  { cle: "6M", label: "6 mois", semaines: 26 },
  { cle: "1A", label: "1 an", semaines: 52 },
  { cle: "3A", label: "3 ans", semaines: 156 },
] as const;

/** `sens` dit quelle direction est favorable : +1 plus haut vaut mieux,
 *  -1 plus bas vaut mieux, 0 aucune des deux (on ne met rien en valeur). */
type Ligne = {
  cle: keyof ComparateurTitre;
  label: string;
  unite: "fcfa" | "pct" | "x" | "num";
  sens: 1 | -1 | 0;
  aide?: string;
};

const BLOCS: { titre: string; lignes: Ligne[] }[] = [
  {
    titre: "Marché",
    lignes: [
      { cle: "cours", label: "Cours", unite: "fcfa", sens: 0 },
      { cle: "capitalisation", label: "Capitalisation", unite: "fcfa", sens: 0 },
      { cle: "volumeMoyen", label: "Volume moyen 30 j", unite: "num", sens: 1,
        aide: "Titres échangés par séance. Un volume faible rend la sortie difficile." },
      { cle: "perfAn", label: "Performance 1 an", unite: "pct", sens: 1 },
      { cle: "volatilite", label: "Volatilité", unite: "pct", sens: -1,
        aide: "Écart-type annualisé des rendements quotidiens." },
    ],
  },
  {
    titre: "Valorisation",
    lignes: [
      { cle: "per", label: "PER", unite: "x", sens: -1,
        aide: "Cours rapporté au bénéfice par action. Plus bas = moins cher, à qualité égale." },
      { cle: "priceToBook", label: "Price to Book", unite: "x", sens: -1 },
      { cle: "bpa", label: "Bénéfice par action", unite: "fcfa", sens: 1 },
      { cle: "rendement", label: "Rendement du dividende", unite: "pct", sens: 1 },
      { cle: "tauxDistribution", label: "Taux de distribution", unite: "pct", sens: 0,
        aide: "Part du résultat versée en dividende. Ni haut ni bas n'est bon en soi." },
    ],
  },
  {
    titre: "Rentabilité",
    lignes: [
      { cle: "roe", label: "Rentabilité des capitaux propres", unite: "pct", sens: 1 },
      { cle: "roa", label: "Rentabilité des actifs", unite: "pct", sens: 1 },
      { cle: "margeOperationnelle", label: "Marge opérationnelle", unite: "pct", sens: 1 },
      { cle: "margeNette", label: "Marge nette", unite: "pct", sens: 1 },
    ],
  },
  {
    titre: "Croissance",
    lignes: [
      { cle: "croissanceCA", label: "Croissance du chiffre d'affaires", unite: "pct", sens: 1 },
      { cle: "croissanceRNet", label: "Croissance du résultat net", unite: "pct", sens: 1 },
    ],
  },
  {
    titre: "Structure financière",
    lignes: [
      { cle: "gearing", label: "Gearing", unite: "pct", sens: -1,
        aide: "Dette nette rapportée aux capitaux propres." },
      { cle: "autonomieFinanciere", label: "Autonomie financière", unite: "pct", sens: 1 },
      { cle: "liquiditeGenerale", label: "Liquidité générale", unite: "x", sens: 1 },
    ],
  },
];

function fmt(v: number | null | undefined, unite: Ligne["unite"]): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (unite === "pct")
    return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  if (unite === "x")
    return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ×`;
  if (unite === "fcfa") {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Md`;
    if (a >= 1e6) return `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
    return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  }
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

/** Courbes rebasees a 100 au debut de la fenetre. */
function CourbesRebasees({
  dates,
  series,
  choisis,
  semaines,
}: {
  dates: string[];
  series: Record<string, (number | null)[]>;
  choisis: ComparateurTitre[];
  semaines: number;
}) {
  const debut = Math.max(0, dates.length - semaines);
  const axe = dates.slice(debut);

  const courbes = choisis.map((t, i) => {
    const brut = (series[t.code] ?? []).slice(debut);
    const base = brut.find((v) => v !== null && v > 0) ?? null;
    const pts = brut.map((v) =>
      base && v !== null && v > 0 ? (v / base) * 100 : null,
    );
    return { code: t.code, couleur: COULEURS[i % COULEURS.length], pts };
  });

  const toutes = courbes.flatMap((c) => c.pts).filter((v): v is number => v !== null);
  if (toutes.length < 2 || axe.length < 2) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center">
        Historique insuffisant pour tracer une comparaison sur cette fenêtre.
      </p>
    );
  }

  const W = 720;
  const H = 260;
  const PAD_B = 20;
  const min = Math.min(...toutes, 100);
  const max = Math.max(...toutes, 100);
  const span = max - min || 1;
  const x = (i: number) => (i / (axe.length - 1)) * W;
  const y = (v: number) => 8 + (1 - (v - min) / span) * (H - 8 - PAD_B);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Base 100 : le repere qui rend la comparaison lisible. */}
      <line x1="0" x2={W} y1={y(100)} y2={y(100)} stroke="#cbd5e1" strokeDasharray="3 3" />
      <text x="2" y={y(100) - 4} fontSize="9" fill="#94a3b8">base 100</text>
      {courbes.map((c) => {
        let d = "";
        let ouvert = false;
        c.pts.forEach((v, i) => {
          if (v === null) { ouvert = false; return; }
          d += `${ouvert ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
          ouvert = true;
        });
        return (
          <path key={c.code} d={d.trim()} fill="none" stroke={c.couleur}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        );
      })}
      <text x="0" y={H - 4} fontSize="9" fill="#94a3b8">{axe[0]}</text>
      <text x={W} y={H - 4} fontSize="9" fill="#94a3b8" textAnchor="end">
        {axe[axe.length - 1]}
      </text>
    </svg>
  );
}

export default function ComparateurView({ titres, dates, series }: Props) {
  const [codes, setCodes] = useState<string[]>(() =>
    titres.slice(0, 2).map((t) => t.code),
  );
  const [q, setQ] = useState("");
  const [fenetre, setFenetre] = useState<(typeof FENETRES)[number]["cle"]>("1A");

  const choisis = useMemo(
    () => codes.map((c) => titres.find((t) => t.code === c)).filter(Boolean) as ComparateurTitre[],
    [codes, titres],
  );

  const suggestions = useMemo(() => {
    const n = q.trim().toLowerCase();
    return titres
      .filter((t) => !codes.includes(t.code))
      .filter((t) => !n || `${t.code} ${t.nom}`.toLowerCase().includes(n))
      .slice(0, 8);
  }, [titres, codes, q]);

  function ajouter(code: string) {
    if (codes.length >= MAX || codes.includes(code)) return;
    setCodes([...codes, code]);
    setQ("");
  }
  function retirer(code: string) {
    setCodes(codes.filter((c) => c !== code));
  }

  /** Index du meilleur titre pour une ligne, ou null si l'arbitrage n'a pas de
   *  sens ou si moins de deux valeurs sont disponibles. */
  function meilleur(l: Ligne): number | null {
    if (l.sens === 0) return null;
    const vals = choisis.map((t) => t[l.cle] as number | null);
    const dispo = vals.filter((v) => v !== null && Number.isFinite(v)) as number[];
    if (dispo.length < 2) return null;
    const cible = l.sens === 1 ? Math.max(...dispo) : Math.min(...dispo);
    return vals.findIndex((v) => v === cible);
  }

  const semaines = FENETRES.find((f) => f.cle === fenetre)!.semaines;

  return (
    <div className="space-y-5">
      {/* Sélection */}
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {choisis.map((t, i) => (
            <span
              key={t.code}
              className="inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-full text-sm font-medium text-white"
              style={{ background: COULEURS[i % COULEURS.length] }}
            >
              {t.code}
              <button
                onClick={() => retirer(t.code)}
                aria-label={`Retirer ${t.code}`}
                className="w-4 h-4 rounded-full bg-white/25 hover:bg-white/40 text-[10px] leading-none"
              >
                ×
              </button>
            </span>
          ))}
          {choisis.length === 0 && (
            <span className="text-sm text-slate-500">
              Choisissez au moins un titre.
            </span>
          )}
        </div>

        {codes.length < MAX ? (
          <>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ajouter un titre — code ou raison sociale…"
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {suggestions.map((t) => (
                <button
                  key={t.code}
                  onClick={() => ajouter(t.code)}
                  className="px-2 py-1 rounded-md text-xs border border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-700 transition"
                >
                  <span className="font-medium">{t.code}</span>
                  <span className="text-slate-400"> · {t.nom.slice(0, 26)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">
            Quatre titres au maximum — au-delà, le tableau cesse d&apos;être
            lisible.
          </p>
        )}
      </section>

      {choisis.length > 0 && (
        <>
          {/* Performance rebasée */}
          <section className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
              <h2 className="text-sm font-semibold">Performance comparée</h2>
              <div className="flex gap-1">
                {FENETRES.map((f) => (
                  <button
                    key={f.cle}
                    onClick={() => setFenetre(f.cle)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                      fenetre === f.cle
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Cours ramenés à 100 au début de la fenêtre — seule façon de
              comparer des titres dont les cours vont de quelques centaines à
              plusieurs dizaines de milliers de FCFA.
            </p>
            <CourbesRebasees
              dates={dates}
              series={series}
              choisis={choisis}
              semaines={semaines}
            />
          </section>

          {/* Tableaux thématiques */}
          {BLOCS.map((bloc) => (
            <section
              key={bloc.titre}
              className="bg-white border border-slate-200 rounded-lg overflow-hidden"
            >
              <h2 className="px-4 py-2.5 text-sm font-semibold border-b border-slate-200 bg-slate-50">
                {bloc.titre}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium w-[38%]">Indicateur</th>
                      {choisis.map((t, i) => (
                        <th key={t.code} className="px-3 py-2 text-right font-medium">
                          <span style={{ color: COULEURS[i % COULEURS.length] }}>
                            {t.code}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bloc.lignes.map((l) => {
                      const best = meilleur(l);
                      return (
                        <tr key={String(l.cle)} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-700">
                            {l.label}
                            {l.aide && (
                              <span
                                className="ml-1 text-slate-300 cursor-help"
                                title={l.aide}
                              >
                                ⓘ
                              </span>
                            )}
                          </td>
                          {choisis.map((t, i) => {
                            const v = t[l.cle] as number | null;
                            return (
                              <td
                                key={t.code}
                                className={`px-3 py-2 text-right tabular-nums ${
                                  best === i
                                    ? "font-semibold text-emerald-700"
                                    : "text-slate-700"
                                }`}
                              >
                                {fmt(v, l.unite)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          {/* Identité */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <h2 className="px-4 py-2.5 text-sm font-semibold border-b border-slate-200 bg-slate-50">
              Fiches
            </h2>
            <div className="divide-y divide-slate-100">
              {choisis.map((t, i) => (
                <div key={t.code} className="px-4 py-3 flex items-start gap-3">
                  <span
                    className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ background: COULEURS[i % COULEURS.length] }}
                  />
                  <div className="flex-1">
                    <Link
                      href={`/titre/${t.code}`}
                      className="text-sm font-medium text-blue-700 hover:underline"
                    >
                      {t.nom}
                    </Link>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t.secteur}
                      {t.pays ? ` · ${t.pays}` : ""}
                      {t.exercice ? ` · comptes ${t.exercice}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className="text-xs text-slate-500 leading-relaxed">
            La valeur mise en vert est la plus favorable des titres comparés,
            uniquement pour les indicateurs où un sens est défendable. Le taux de
            distribution et la capitalisation n&apos;en ont pas : verser beaucoup
            n&apos;est ni meilleur ni pire que réinvestir. Les ratios
            fondamentaux proviennent du dernier exercice publié, qui peut
            différer d&apos;un titre à l&apos;autre — la date figure sous chaque
            fiche.
          </p>
        </>
      )}
    </div>
  );
}

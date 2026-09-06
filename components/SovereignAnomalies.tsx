"use client";

import { useMemo, useState } from "react";
import type { SovereignBondLite } from "@/lib/listedBondsTypes";
import CountryFlag from "./CountryFlag";

/** Taille minimale de cohorte. En dessous, l'ecart type n'a pas de sens et un
 *  z de 1,6 y serait du bruit plutot qu'un signal. */
const MIN_PAIRS = 5;

/** Plancher de dispersion, en fraction (0,0020 = 20 pb). Sous ce seuil la
 *  cohorte est trop homogene pour qu'un ecart soit mesurable : diviser par un
 *  ecart type quasi nul fabrique des z-scores absurdes. */
const SD_PLANCHER = 0.002;

const Z_SEUIL = 1.5;

/** Au-dela, la derniere adjudication est trop ancienne pour que l'ecart
 *  reflete encore les conditions de marche. */
const JOURS_PERIMES = 120;

type Anomalie = {
  bond: SovereignBondLite;
  ecartBps: number;
  z: number;
  pairs: number;
  dispersionBps: number;
  moyennePairs: number;
  perimee: boolean;
};

function joursEntre(a: string, b: string): number {
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  if (isNaN(x) || isNaN(y)) return 0;
  return Math.round((y - x) / 86400000);
}

/**
 * Detection sur le gisement souverain UMOA-Titres.
 *
 * Cohorte : meme pays, meme instrument (BAT ou OAT), maturite ±1 an. On
 * compare le taux de la derniere adjudication a celui de ses pairs.
 *
 * Memes garde-fous que le detecteur des obligations cotees : variance
 * d'echantillon, cohorte d'au moins cinq lignes, plancher de dispersion. Un
 * ecart n'est pas un signal d'achat, c'est un point a instruire — sur ce
 * marche, une adjudication isolee peut refleter un besoin de tresorerie
 * ponctuel de l'emetteur plutot qu'une reevaluation du risque.
 */
function detecter(bonds: SovereignBondLite[]): {
  anomalies: Anomalie[];
  univers: number;
  rejetCohorte: number;
  rejetDispersion: number;
  reference: string;
} {
  const univers = bonds.filter(
    (b) => b.lastYield > 0 && b.maturity > 0 && b.lastTradeDate,
  );

  // Reference de fraicheur : l'adjudication la plus recente du jeu, et non la
  // date du jour — deterministe, donc identique au rendu serveur et client.
  let reference = "";
  for (const b of univers) {
    if (b.lastTradeDate > reference) reference = b.lastTradeDate;
  }

  const anomalies: Anomalie[] = [];
  let rejetCohorte = 0;
  let rejetDispersion = 0;

  for (const b of univers) {
    const pairs = univers.filter(
      (p) =>
        p.id !== b.id &&
        p.country === b.country &&
        p.type === b.type &&
        Math.abs(p.maturity - b.maturity) < 1,
    );
    if (pairs.length < MIN_PAIRS) {
      rejetCohorte++;
      continue;
    }

    const ys = pairs.map((p) => p.lastYield);
    const moyenne = ys.reduce((s, y) => s + y, 0) / ys.length;
    const variance =
      ys.reduce((s, y) => s + (y - moyenne) ** 2, 0) / (ys.length - 1);
    const sd = Math.sqrt(variance);
    if (sd < SD_PLANCHER) {
      rejetDispersion++;
      continue;
    }

    const z = (b.lastYield - moyenne) / sd;
    if (Math.abs(z) <= Z_SEUIL) continue;

    anomalies.push({
      bond: b,
      ecartBps: Math.round((b.lastYield - moyenne) * 10000),
      z,
      pairs: pairs.length,
      dispersionBps: Math.round(sd * 10000),
      moyennePairs: moyenne,
      perimee: joursEntre(b.lastTradeDate, reference) > JOURS_PERIMES,
    });
  }

  anomalies.sort((a, b) => Math.abs(b.ecartBps) - Math.abs(a.ecartBps));
  return { anomalies, univers: univers.length, rejetCohorte, rejetDispersion, reference };
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
}

export default function SovereignAnomalies({
  bonds,
}: {
  bonds: SovereignBondLite[];
}) {
  const { anomalies, univers, rejetCohorte, rejetDispersion } = useMemo(
    () => detecter(bonds),
    [bonds],
  );

  const [sens, setSens] = useState<"tous" | "haut" | "bas">("tous");
  const [pays, setPays] = useState<string>("tous");

  const paysDispo = useMemo(
    () => Array.from(new Set(anomalies.map((a) => a.bond.country))).sort(),
    [anomalies],
  );

  const affichees = anomalies.filter((a) => {
    if (sens === "haut" && a.ecartBps <= 0) return false;
    if (sens === "bas" && a.ecartBps >= 0) return false;
    if (pays !== "tous" && a.bond.country !== pays) return false;
    return true;
  });

  const hauts = anomalies.filter((a) => a.ecartBps > 0).length;
  const bas = anomalies.length - hauts;

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
        <Kpi label="Titres analysés" value={String(univers)} accent="bg-indigo-500" />
        <Kpi label="Écarts détectés" value={String(anomalies.length)} accent="bg-amber-500" />
        <Kpi
          label="Rendement supérieur"
          value={String(hauts)}
          sub="au-dessus des pairs"
          accent="bg-blue-500"
        />
        <Kpi
          label="Rendement inférieur"
          value={String(bas)}
          sub="en dessous des pairs"
          accent="bg-rose-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 mb-4 p-3 bg-slate-50 rounded-md">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Sens de l&apos;écart
          </label>
          <select
            value={sens}
            onChange={(e) => setSens(e.target.value as "tous" | "haut" | "bas")}
            className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="tous">Tous ({anomalies.length})</option>
            <option value="haut">Rendement supérieur ({hauts})</option>
            <option value="bas">Rendement inférieur ({bas})</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1 font-medium">
            Pays
          </label>
          <select
            value={pays}
            onChange={(e) => setPays(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
          >
            <option value="tous">Tous pays</option>
            {paysDispo.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {affichees.length === 0 ? (
        <div className="p-6 md:p-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-md">
          {anomalies.length === 0
            ? "Aucun écart significatif. Les taux d'adjudication sont cohérents au sein de chaque cohorte pays / instrument / maturité."
            : "Aucun écart ne correspond à ces filtres."}
        </div>
      ) : (
        <div className="space-y-2">
          {affichees.map((a) => (
            <div
              key={a.bond.id}
              className={`p-3 rounded-md border text-sm ${
                a.ecartBps > 0
                  ? "bg-blue-50 border-blue-200"
                  : "bg-rose-50 border-rose-200"
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium inline-flex items-center gap-1.5">
                    <CountryFlag country={a.bond.country} size={14} />
                    {a.bond.isin}
                    <span className="text-xs text-slate-500 font-normal">
                      {a.bond.type} · {a.bond.maturity.toFixed(1)} ans
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {(a.bond.lastYield * 100).toFixed(2).replace(".", ",")}%
                    contre{" "}
                    {(a.moyennePairs * 100).toFixed(2).replace(".", ",")}% pour{" "}
                    {a.pairs} pairs {a.bond.country}/{a.bond.type} (dispersion{" "}
                    {a.dispersionBps} pb, z = {a.z.toFixed(1)})
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Dernière adjudication le {fmtDate(a.bond.lastTradeDate)}
                    {a.perimee && (
                      <span className="ml-1.5 text-amber-700">
                        · plus de {JOURS_PERIMES} jours, écart peut-être obsolète
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div
                    className={`text-base font-semibold tabular-nums ${
                      a.ecartBps > 0 ? "text-blue-800" : "text-rose-800"
                    }`}
                  >
                    {a.ecartBps > 0 ? "+" : ""}
                    {a.ecartBps} pb
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500 mt-4">
        Cohorte : même pays, même instrument, maturité à un an près. Écartés du
        calcul : {rejetCohorte} titres faute de cohorte d&apos;au moins{" "}
        {MIN_PAIRS} pairs, {rejetDispersion} pour dispersion inférieure à 20 pb.
        Un écart n&apos;est pas un signal d&apos;achat : sur ce marché, une
        adjudication isolée peut refléter un besoin de trésorerie ponctuel de
        l&apos;émetteur plutôt qu&apos;une réévaluation du risque.
      </p>
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="relative bg-white rounded-md border border-slate-200 p-3 overflow-hidden">
      <span
        className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`}
        aria-hidden
      />
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5 ml-1">
        {label}
      </div>
      <div className="text-base md:text-lg font-semibold text-slate-900 tabular-nums ml-1">
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5 ml-1">{sub}</div>}
    </div>
  );
}

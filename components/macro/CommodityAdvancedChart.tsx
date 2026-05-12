"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { OhlcPoint } from "../charting/KlineChart";
import type { UserRole } from "@/lib/auth/userRole";

const KlineChart = dynamic(() => import("../charting/KlineChart"), {
  ssr: false,
  loading: () => (
    <div
      className="bg-slate-50 rounded animate-pulse"
      style={{ height: 520 }}
    />
  ),
});

type Period = "1M" | "3M" | "6M" | "1A" | "3A" | "5A" | "Max";
const PERIODS: Period[] = ["1M", "3M", "6M", "1A", "3A", "5A", "Max"];

function filterOhlcByPeriod(ohlc: OhlcPoint[], period: Period): OhlcPoint[] {
  if (period === "Max" || ohlc.length === 0) return ohlc;
  const cutoff = new Date(ohlc[ohlc.length - 1].timestamp);
  switch (period) {
    case "1M": cutoff.setMonth(cutoff.getMonth() - 1); break;
    case "3M": cutoff.setMonth(cutoff.getMonth() - 3); break;
    case "6M": cutoff.setMonth(cutoff.getMonth() - 6); break;
    case "1A": cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    case "3A": cutoff.setFullYear(cutoff.getFullYear() - 3); break;
    case "5A": cutoff.setFullYear(cutoff.getFullYear() - 5); break;
  }
  const cutoffTs = cutoff.getTime();
  return ohlc.filter((p) => p.timestamp >= cutoffTs);
}

type Props = {
  ohlcHistory: OhlcPoint[];
  code: string;
  name: string;
  userRole: UserRole;
};

export default function CommodityAdvancedChart({
  ohlcHistory,
  code,
  name,
  userRole,
}: Props) {
  const isMember = userRole !== null;
  const isPremium = userRole === "premium" || userRole === "pro";
  const [period, setPeriod] = useState<Period>("1A");

  const filtered = useMemo(
    () => filterOhlcByPeriod(ohlcHistory, period),
    [ohlcHistory, period],
  );

  if (ohlcHistory.length === 0) return null;

  // Visiteur non connecté : teaser avec CTA inscription
  if (!isMember) {
    return (
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
        <div className="flex justify-between items-start gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="text-base font-medium inline-flex items-center gap-2">
              📊 Graphique avancé
              <span className="text-[10px] md:text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">
                MEMBRES
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Chandeliers · 50+ indicateurs · outils de dessin (Fibonacci, Elliott, patterns…)
            </p>
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 md:p-12 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <h4 className="text-base font-semibold text-slate-900">
            Connectez-vous pour accéder au graphique avancé
          </h4>
          <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
            Chandeliers OHLC, plus de 50 indicateurs techniques et outils de dessin.
            Inscription gratuite.
          </p>
          <div className="mt-4 flex gap-2 justify-center">
            <Link
              href="/auth/login"
              className="px-4 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-700 transition"
            >
              Se connecter
            </Link>
            <Link
              href="/auth/signup"
              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm rounded hover:bg-slate-50 transition"
            >
              S&apos;inscrire
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="flex justify-between items-start gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-base font-medium inline-flex items-center gap-2">
            📊 Graphique avancé
            {!isPremium && (
              <span className="text-[10px] md:text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">
                PREMIUM
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Chandeliers · 50+ indicateurs · outils de dessin (Fibonacci, Elliott, patterns…) · zoom &amp; plein écran
          </p>
        </div>
        {isPremium && (
          <div className="flex gap-1.5 text-xs flex-wrap">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded border transition ${
                  period === p
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <div
          className={isPremium ? "" : "blur-[3px] pointer-events-none select-none"}
          aria-hidden={isPremium ? undefined : true}
        >
          <KlineChart
            key={isPremium ? "premium" : "teaser"}
            data={isPremium ? filtered : ohlcHistory}
            code={code}
            name={name}
            height={520}
          />
        </div>
        {!isPremium && (
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-xl border border-amber-200 max-w-md w-full p-5 md:p-6 pointer-events-auto">
              <div className="flex items-start gap-3 mb-3">
                <div className="text-2xl shrink-0">⭐</div>
                <div className="min-w-0">
                  <h4 className="text-base md:text-lg font-semibold text-slate-900">
                    Graphique avancé Premium
                  </h4>
                  <p className="text-sm text-slate-600 mt-1">
                    Chandeliers, plus de 50 indicateurs techniques (MACD, RSI, Bollinger…)
                    et outils de dessin (Fibonacci, Elliott…). Disponible avec
                    l&apos;abonnement Premium.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Link
                  href="/abonnements"
                  className="px-4 py-2 bg-amber-500 text-white text-sm rounded hover:bg-amber-600 transition font-medium"
                >
                  Passer Premium
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

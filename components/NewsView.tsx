"use client";

import { useState, useMemo } from "react";
import { NEWS_TYPES, NEWS_TYPE_LABELS } from "@/lib/newsTypes";
import type { NewsItem, NewsType } from "@/lib/newsTypes";

type Props = {
  ticker: string;
  news: NewsItem[];
};

const TYPE_PILLS: Record<NewsType, string> = {
  resultats: "border-blue-200 bg-blue-50 text-blue-800",
  dividende: "border-green-200 bg-green-50 text-green-800",
  assemblee: "border-purple-200 bg-purple-50 text-purple-800",
  operation: "border-amber-200 bg-amber-50 text-amber-800",
  communique: "border-slate-200 bg-slate-50 text-slate-700",
  presse: "border-rose-200 bg-rose-50 text-rose-800",
};

const TYPE_EMOJI: Record<NewsType, string> = {
  resultats: "📊",
  dividende: "💰",
  assemblee: "🏛️",
  operation: "⚙️",
  communique: "📣",
  presse: "📰",
};

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatRelative(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 0) return "à venir";
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "hier";
  if (diffDays < 7) return `il y a ${diffDays} jours`;
  if (diffDays < 30) {
    const w = Math.floor(diffDays / 7);
    return `il y a ${w} semaine${w > 1 ? "s" : ""}`;
  }
  if (diffDays < 365) {
    const m = Math.floor(diffDays / 30);
    return `il y a ${m} mois`;
  }
  const y = Math.floor(diffDays / 365);
  return `il y a ${y} an${y > 1 ? "s" : ""}`;
}

export default function NewsView({ ticker, news }: Props) {
  const [typesSel, setTypesSel] = useState<Set<NewsType>>(new Set());

  const filtered = useMemo(() => {
    if (typesSel.size === 0) return news;
    return news.filter((n) => typesSel.has(n.type));
  }, [news, typesSel]);

  // Compteur par type pour les chips de filtre
  const counts = useMemo(() => {
    const map: Partial<Record<NewsType, number>> = {};
    for (const n of news) map[n.type] = (map[n.type] ?? 0) + 1;
    return map;
  }, [news]);

  function toggleType(t: NewsType) {
    setTypesSel((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  if (news.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-10 md:p-16 text-center">
        <div className="text-4xl mb-3">📰</div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          Pas encore d&apos;actualité pour {ticker}
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Les actualités apparaîtront ici dès qu&apos;une publication concernant
          ce titre sera référencée (résultats, dividendes, assemblées,
          communiqués, presse).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* === Filtres === */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
          <h3 className="text-sm font-medium">
            {news.length} actualité{news.length > 1 ? "s" : ""}
            {typesSel.size > 0 && (
              <span className="text-slate-500 font-normal">
                {" · "}
                {filtered.length} affichée{filtered.length > 1 ? "s" : ""}
              </span>
            )}
          </h3>
          {typesSel.size > 0 && (
            <button
              type="button"
              onClick={() => setTypesSel(new Set())}
              className="text-xs px-2.5 py-1 border border-slate-300 rounded-md hover:bg-slate-50"
            >
              ↺ Tout afficher
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {NEWS_TYPES.map((t) => {
            const c = counts[t] ?? 0;
            if (c === 0) return null;
            const active = typesSel.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  active
                    ? TYPE_PILLS[t]
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="mr-1">{TYPE_EMOJI[t]}</span>
                {NEWS_TYPE_LABELS[t]}
                <span className="ml-1.5 text-slate-400">{c}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* === Liste === */}
      <section className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
            Aucune actualité de ce type pour ce filtre.
          </div>
        ) : (
          filtered.map((n, i) => (
            <article
              key={`${n.date}-${i}`}
              className="bg-white rounded-lg border border-slate-200 p-4 md:p-5 hover:border-slate-300 transition"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap ${
                      TYPE_PILLS[n.type]
                    }`}
                  >
                    {TYPE_EMOJI[n.type]} {NEWS_TYPE_LABELS[n.type]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDate(n.date)}
                  </span>
                  <span className="text-xs text-slate-400">
                    · {formatRelative(n.date)}
                  </span>
                </div>
                {n.source && (
                  <span className="text-xs text-slate-500 italic">
                    {n.source}
                  </span>
                )}
              </div>
              <h4 className="text-base font-medium text-slate-900 mb-1.5 leading-snug">
                {n.titre}
              </h4>
              {n.resume && (
                <p className="text-sm text-slate-600 leading-relaxed">
                  {n.resume}
                </p>
              )}
              {n.url && (
                <div className="mt-2">
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                  >
                    Lire la source
                    <span aria-hidden>↗</span>
                  </a>
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

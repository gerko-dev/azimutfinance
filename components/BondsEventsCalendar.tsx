"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import type { ListedBond, ListedBondEvent } from "@/lib/listedBondsTypes";
import CountryFlag from "./CountryFlag";

type Props = {
  bonds: ListedBond[];
  events: ListedBondEvent[];
  /** ISO YYYY-MM-DD — debut de la fenetre glissante (aujourd'hui). */
  startDate: string;
  /** ISO — fin de la fenetre (aujourd'hui + 12 mois). */
  endDate: string;
};

type EventType = ListedBondEvent["eventType"];

const MONTHS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];
const MONTHS_FR_SHORT = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];
const WEEKDAYS_FR_SHORT = ["L", "M", "M", "J", "V", "S", "D"];

const TYPE_LABEL: Record<EventType, string> = {
  coupon: "Coupon",
  amortissement: "Amortissement",
  remboursement: "Remboursement",
  call: "Call",
  adjudication: "Adjudication",
};
const TYPE_ICON: Record<EventType, string> = {
  coupon: "💰",
  amortissement: "📉",
  remboursement: "🏁",
  call: "📞",
  adjudication: "🔨",
};
const TYPE_COLOR: Record<EventType, string> = {
  coupon: "#2563eb",
  amortissement: "#7c3aed",
  remboursement: "#16a34a",
  call: "#9333ea",
  adjudication: "#ea580c",
};
const TYPE_BG: Record<EventType, string> = {
  coupon: "bg-blue-50 text-blue-700 ring-blue-200",
  amortissement: "bg-violet-50 text-violet-700 ring-violet-200",
  remboursement: "bg-green-50 text-green-700 ring-green-200",
  call: "bg-purple-50 text-purple-700 ring-purple-200",
  adjudication: "bg-orange-50 text-orange-700 ring-orange-200",
};

function formatFCFA(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_FR[m - 1].toLowerCase()} ${y}`;
}

function toISO(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Premier jour de la semaine du mois en convention francaise (lundi = 0).
 * getDay() : dimanche=0, samedi=6 → on shift pour avoir lundi=0.
 */
function firstWeekdayMondayBased(year: number, monthIndex: number): number {
  const sunday0 = new Date(year, monthIndex, 1).getDay();
  return (sunday0 + 6) % 7;
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export default function BondsEventsCalendar({
  bonds,
  events,
  startDate,
  endDate,
}: Props) {
  // === INDEX OBLIGATIONS ===
  const bondByIsin = useMemo(() => {
    const m = new Map<string, ListedBond>();
    for (const b of bonds) m.set(b.isin, b);
    return m;
  }, [bonds]);

  // === FILTRES ===
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(
    new Set(),
  );
  const [selectedTypes, setSelectedTypes] = useState<Set<EventType>>(new Set());
  const [search, setSearch] = useState("");

  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      const b = bondByIsin.get(e.isin);
      if (b?.country) set.add(b.country);
    }
    return Array.from(set).sort();
  }, [events, bondByIsin]);

  const availableTypes = useMemo(() => {
    const set = new Set<EventType>();
    for (const e of events) set.add(e.eventType);
    return Array.from(set);
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      const b = bondByIsin.get(e.isin);
      if (
        selectedCountries.size > 0 &&
        (!b?.country || !selectedCountries.has(b.country))
      ) {
        return false;
      }
      if (selectedTypes.size > 0 && !selectedTypes.has(e.eventType)) {
        return false;
      }
      if (q) {
        const haystack = [
          b?.name ?? "",
          b?.code ?? "",
          b?.issuer ?? "",
          e.isin,
          e.description,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, bondByIsin, selectedCountries, selectedTypes, search]);

  // === GROUPAGE PAR DATE ===
  const eventsByDate = useMemo(() => {
    const m = new Map<string, ListedBondEvent[]>();
    for (const e of filteredEvents) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date)!.push(e);
    }
    return m;
  }, [filteredEvents]);

  // === MOIS COURANT ===
  const startParts = startDate.split("-").map(Number);
  const startYear = startParts[0];
  const startMonth = startParts[1] - 1;
  const todayISO = startDate;

  const [cursor, setCursor] = useState({ year: startYear, month: startMonth });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // === BORNES NAVIGATION ===
  // On ne laisse pas naviguer hors de la fenetre [startDate, endDate].
  const endParts = endDate.split("-").map(Number);
  const endYear = endParts[0];
  const endMonth = endParts[1] - 1;
  const cursorIndex = cursor.year * 12 + cursor.month;
  const minIndex = startYear * 12 + startMonth;
  const maxIndex = endYear * 12 + endMonth;
  const canGoPrev = cursorIndex > minIndex;
  const canGoNext = cursorIndex < maxIndex;

  const goPrev = useCallback(() => {
    setCursor((c) => {
      const m = c.month - 1;
      if (m < 0) return { year: c.year - 1, month: 11 };
      return { year: c.year, month: m };
    });
  }, []);
  const goNext = useCallback(() => {
    setCursor((c) => {
      const m = c.month + 1;
      if (m > 11) return { year: c.year + 1, month: 0 };
      return { year: c.year, month: m };
    });
  }, []);
  const goToday = useCallback(() => {
    setCursor({ year: startYear, month: startMonth });
    setSelectedDay(todayISO);
  }, [startYear, startMonth, todayISO]);

  // Navigation clavier ←/→
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.target instanceof HTMLInputElement) return;
      if (ev.key === "ArrowLeft" && canGoPrev) goPrev();
      else if (ev.key === "ArrowRight" && canGoNext) goNext();
      else if (ev.key === "t" || ev.key === "T") goToday();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canGoPrev, canGoNext, goPrev, goNext, goToday]);

  // === GRILLE DU MOIS ===
  // 6 lignes × 7 colonnes. Cellules vides en debut/fin pour aligner le 1er
  // sur le bon jour de la semaine (lundi = 0).
  type Cell = { iso: string; day: number; inMonth: boolean } | null;
  const grid: Cell[] = useMemo(() => {
    const cells: Cell[] = [];
    const firstWd = firstWeekdayMondayBased(cursor.year, cursor.month);
    const nbDays = daysInMonth(cursor.year, cursor.month);
    for (let i = 0; i < firstWd; i++) cells.push(null);
    for (let d = 1; d <= nbDays; d++) {
      cells.push({
        iso: toISO(cursor.year, cursor.month, d),
        day: d,
        inMonth: true,
      });
    }
    while (cells.length < 42) cells.push(null);
    return cells;
  }, [cursor]);

  // === TIMELINE 12 MOIS ===
  const monthsTimeline = useMemo(() => {
    const out: { year: number; month: number; count: number; iso: string }[] =
      [];
    let y = startYear;
    let m = startMonth;
    while (y * 12 + m <= endYear * 12 + endMonth) {
      const prefix = `${y}-${String(m + 1).padStart(2, "0")}`;
      let count = 0;
      for (const e of filteredEvents) if (e.date.startsWith(prefix)) count++;
      out.push({
        year: y,
        month: m,
        count,
        iso: `${prefix}-01`,
      });
      m++;
      if (m > 11) {
        y++;
        m = 0;
      }
    }
    return out;
  }, [filteredEvents, startYear, startMonth, endYear, endMonth]);
  const maxMonthCount = useMemo(
    () => Math.max(1, ...monthsTimeline.map((x) => x.count)),
    [monthsTimeline],
  );

  // === EVENEMENTS DU JOUR SELECTIONNE ===
  const dayEvents: ListedBondEvent[] = selectedDay
    ? eventsByDate.get(selectedDay) ?? []
    : [];

  // === EXPORTS ===
  const exportICal = useCallback(() => {
    const dtstamp =
      new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AzimutFinance//Bonds Events//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:Calendrier obligations cotées BRVM`,
    ];
    filteredEvents.forEach((e, i) => {
      const b = bondByIsin.get(e.isin);
      const dt = e.date.replace(/-/g, "");
      const next = new Date(e.date);
      next.setDate(next.getDate() + 1);
      const dtEnd = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, "0")}${String(next.getDate()).padStart(2, "0")}`;
      const summary = `${TYPE_LABEL[e.eventType]} · ${b?.name ?? e.isin}`;
      const desc = `${e.description}\\n${formatFCFA(e.amount)} FCFA / titre\\nISIN: ${e.isin}`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:azimut-${e.isin}-${e.date}-${e.eventType}-${i}@azimutfinance.com`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${dt}`,
        `DTEND;VALUE=DATE:${dtEnd}`,
        `SUMMARY:${escapeICalText(summary)}`,
        `DESCRIPTION:${escapeICalText(desc)}`,
        "END:VEVENT",
      );
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `obligations-evenements-${todayISO}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEvents, bondByIsin, todayISO]);

  const exportCSV = useCallback(() => {
    const headers = [
      "date",
      "isin",
      "code",
      "obligation",
      "emetteur",
      "pays",
      "type",
      "montant_par_titre",
      "description",
    ];
    const rows = filteredEvents.map((e) => {
      const b = bondByIsin.get(e.isin);
      return [
        e.date,
        e.isin,
        b?.code ?? "",
        b?.name ?? "",
        b?.issuer ?? "",
        b?.country ?? "",
        TYPE_LABEL[e.eventType],
        String(e.amount),
        e.description,
      ]
        .map((v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`)
        .join(";");
    });
    const csv = [headers.join(";"), ...rows].join("\r\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `obligations-evenements-${todayISO}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEvents, bondByIsin, todayISO]);

  // === HANDLERS DE FILTRE ===
  function toggleCountry(c: string) {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }
  function toggleType(t: EventType) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }
  function clearFilters() {
    setSelectedCountries(new Set());
    setSelectedTypes(new Set());
    setSearch("");
  }
  const hasActiveFilters =
    selectedCountries.size > 0 || selectedTypes.size > 0 || search.length > 0;

  // === RENDU ===
  return (
    <>
      {/* HERO */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs md:text-sm text-slate-400 mb-2">
            <Link href="/marches/obligations" className="hover:text-white transition">
              Obligations cotées
            </Link>
            <span className="mx-2 text-slate-500">›</span>
            <span className="text-slate-200">Calendrier</span>
          </div>
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold mb-1 text-white">
                📅 Calendrier des événements
              </h1>
              <p className="text-sm md:text-base text-slate-300">
                {filteredEvents.length} événement
                {filteredEvents.length > 1 ? "s" : ""} sur les 12 prochains mois
                {hasActiveFilters
                  ? " (filtré)"
                  : ` · ${events.length} au total`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportICal}
                className="text-xs md:text-sm px-3 py-2 rounded-md bg-white border border-slate-200 hover:border-slate-300 transition inline-flex items-center gap-1.5"
                title="Exporter le calendrier filtré au format iCal (.ics) — compatible Google/Outlook/Apple Calendar"
              >
                <span aria-hidden>📤</span> iCal
              </button>
              <button
                type="button"
                onClick={exportCSV}
                className="text-xs md:text-sm px-3 py-2 rounded-md bg-white border border-slate-200 hover:border-slate-300 transition inline-flex items-center gap-1.5"
                title="Exporter au format CSV (séparateur ;)"
              >
                <span aria-hidden>📊</span> CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* FILTRES */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-start">
            <div className="lg:col-span-4">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 font-medium">
                Recherche
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom, ISIN, code, émetteur…"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="lg:col-span-4">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 font-medium">
                Type d&apos;événement
              </label>
              <div className="flex flex-wrap gap-1.5">
                {availableTypes.map((t) => {
                  const active = selectedTypes.has(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      className={`text-xs px-2.5 py-1 rounded-md ring-1 transition ${
                        active
                          ? TYPE_BG[t]
                          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                      }`}
                    >
                      {TYPE_ICON[t]} {TYPE_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-4">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1.5 font-medium">
                Pays
              </label>
              <div className="flex flex-wrap gap-1.5">
                {availableCountries.map((c) => {
                  const active = selectedCountries.has(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCountry(c)}
                      className={`text-xs px-2 py-1 rounded-md ring-1 transition inline-flex items-center gap-1 ${
                        active
                          ? "bg-blue-50 text-blue-700 ring-blue-200"
                          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                      }`}
                    >
                      <CountryFlag country={c} size={14} />
                      <span>{c}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                ✕ Réinitialiser les filtres
              </button>
            </div>
          )}
        </section>

        {/* GRILLE + PANNEAU */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* CALENDRIER */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-slate-200">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={!canGoPrev}
                  className="w-8 h-8 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center"
                  aria-label="Mois précédent"
                  title="Mois précédent (←)"
                >
                  <span aria-hidden>‹</span>
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canGoNext}
                  className="w-8 h-8 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center"
                  aria-label="Mois suivant"
                  title="Mois suivant (→)"
                >
                  <span aria-hidden>›</span>
                </button>
              </div>
              <h2 className="text-base md:text-lg font-semibold text-center">
                {MONTHS_FR[cursor.month]} {cursor.year}
              </h2>
              <button
                type="button"
                onClick={goToday}
                className="text-xs px-2.5 py-1 rounded-md border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition"
                title="Aller à aujourd'hui (T)"
              >
                Aujourd&apos;hui
              </button>
            </div>

            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500 uppercase">
              {WEEKDAYS_FR_SHORT.map((d, i) => (
                <div key={i} className="px-2 py-2 text-center">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {grid.map((cell, i) => {
                if (!cell) {
                  return (
                    <div
                      key={i}
                      className="aspect-square md:aspect-[1.1/1] border-r border-b border-slate-100 bg-slate-50/40"
                    />
                  );
                }
                const dayEvts = eventsByDate.get(cell.iso) ?? [];
                const isToday = cell.iso === todayISO;
                const isPast = cell.iso < todayISO;
                const isSelected = cell.iso === selectedDay;
                const types = Array.from(
                  new Set(dayEvts.map((e) => e.eventType)),
                ) as EventType[];

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedDay(cell.iso)}
                    disabled={dayEvts.length === 0 && isPast}
                    className={`relative aspect-square md:aspect-[1.1/1] border-r border-b border-slate-100 p-1.5 md:p-2 text-left transition group ${
                      isSelected
                        ? "bg-blue-600 text-white ring-2 ring-blue-700 ring-inset z-10"
                        : isToday
                          ? "bg-blue-50 hover:bg-blue-100"
                          : dayEvts.length > 0
                            ? "hover:bg-slate-50 cursor-pointer"
                            : isPast
                              ? "text-slate-300"
                              : "hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`text-xs md:text-sm font-medium ${
                        isSelected
                          ? ""
                          : isToday
                            ? "text-blue-700"
                            : dayEvts.length > 0
                              ? "text-slate-900"
                              : ""
                      }`}
                    >
                      {cell.day}
                    </div>
                    {dayEvts.length > 0 && (
                      <>
                        {/* Pastilles colorees par type d'evenement (max 4 visibles) */}
                        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-wrap gap-0.5">
                          {types.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{
                                backgroundColor: isSelected
                                  ? "#fff"
                                  : TYPE_COLOR[t],
                              }}
                            />
                          ))}
                        </div>
                        {/* Compteur d'evenements */}
                        {dayEvts.length > 1 && (
                          <span
                            className={`absolute top-1 right-1 text-[10px] px-1.5 rounded-full ${
                              isSelected
                                ? "bg-white/30 text-white"
                                : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                            }`}
                          >
                            {dayEvts.length}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="px-4 md:px-5 py-2.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
              {availableTypes.map((t) => (
                <div key={t} className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: TYPE_COLOR[t] }}
                  />
                  {TYPE_LABEL[t]}
                </div>
              ))}
              <div className="ml-auto text-slate-400">
                ← / → pour naviguer · T pour aujourd&apos;hui
              </div>
            </div>
          </div>

          {/* PANNEAU LATERAL : EVENEMENTS DU JOUR */}
          <aside className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-4 md:px-5 py-3 border-b border-slate-200 bg-slate-50">
              {selectedDay ? (
                <>
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                    {selectedDay === todayISO
                      ? "Aujourd'hui"
                      : "Date sélectionnée"}
                  </div>
                  <div className="text-sm md:text-base font-semibold text-slate-900">
                    {formatDateLong(selectedDay)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {dayEvents.length} événement
                    {dayEvents.length !== 1 ? "s" : ""}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
                    Aucune date sélectionnée
                  </div>
                  <div className="text-sm text-slate-500">
                    Cliquez sur un jour pour voir ses événements
                  </div>
                </>
              )}
            </div>

            <div className="flex-1 max-h-[480px] overflow-y-auto">
              {selectedDay && dayEvents.length === 0 && (
                <div className="p-6 text-center text-sm text-slate-500">
                  Aucun événement ce jour-là
                </div>
              )}
              {!selectedDay && (
                <div className="p-6 text-center text-sm text-slate-400">
                  Sélectionnez un jour avec des points colorés.
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {dayEvents.map((e, i) => {
                  const b = bondByIsin.get(e.isin);
                  return (
                    <li key={i}>
                      <Link
                        href={`/obligation/${e.isin}`}
                        className="block px-4 md:px-5 py-3 hover:bg-blue-50/40 transition"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="text-lg leading-none mt-0.5">
                            {TYPE_ICON[e.eventType]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${TYPE_BG[e.eventType]}`}
                              >
                                {TYPE_LABEL[e.eventType]}
                              </span>
                              {b?.country && (
                                <CountryFlag country={b.country} size={12} />
                              )}
                            </div>
                            <div className="text-sm font-medium text-slate-900 truncate">
                              {b?.name ?? e.isin}
                              {b?.code && (
                                <span className="ml-1.5 text-xs text-slate-500 font-normal">
                                  ({b.code})
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5">
                              {e.description}
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                              <span className="font-mono">
                                {formatFCFA(e.amount)} FCFA / titre
                              </span>
                              <span className="text-slate-300">›</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </section>

        {/* TIMELINE 12 MOIS */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="text-sm md:text-base font-semibold">
              Densité sur 12 mois
            </h3>
            <p className="text-xs text-slate-500">
              Hauteur ∝ nombre d&apos;événements · Cliquez pour aller au mois
            </p>
          </div>
          <div className="flex items-end gap-1.5 h-24 md:h-28">
            {monthsTimeline.map((m, i) => {
              const ratio = m.count / maxMonthCount;
              const isCursor =
                m.year === cursor.year && m.month === cursor.month;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCursor({ year: m.year, month: m.month })}
                  className="flex-1 group flex flex-col items-center justify-end h-full"
                  title={`${MONTHS_FR[m.month]} ${m.year} : ${m.count} événement${m.count > 1 ? "s" : ""}`}
                >
                  <div className="w-full flex items-end justify-center h-full">
                    <div
                      className={`w-full rounded-t-sm transition ${
                        isCursor
                          ? "bg-blue-600"
                          : m.count > 0
                            ? "bg-blue-300 group-hover:bg-blue-500"
                            : "bg-slate-100 group-hover:bg-slate-200"
                      }`}
                      style={{
                        height: m.count > 0 ? `${Math.max(8, ratio * 100)}%` : "4px",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            {monthsTimeline.map((m, i) => (
              <div
                key={i}
                className={`flex-1 text-center text-[10px] ${
                  m.year === cursor.year && m.month === cursor.month
                    ? "text-blue-700 font-semibold"
                    : "text-slate-500"
                }`}
              >
                {MONTHS_FR_SHORT[m.month]}
                {m.month === 0 && (
                  <div className="text-slate-400">{m.year}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

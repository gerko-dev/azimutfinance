"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buyFromPoolAction } from "@/lib/simulator/actions";
import type { IntroPosition, PoolRow } from "@/lib/simulator/queries";
import type { Season, Transaction } from "@/lib/simulator/types";
import { fmtFCFA, fmtFCFAExact } from "./format";

type Props = {
  season: Season;
  pool: PoolRow[];
  myCash: number;
  myPositions: IntroPosition[];
  myTotalSpent: number;
  myTotalUnits: number;
  myPoolTransactions: Transaction[];
  totalPoolValue: number;
  totalRemainingValue: number;
  stockNames: Record<string, string>;
};

// Plafonds de diversification — doivent rester en phase avec le SQL :
// public._simulator_check_diversification (15 % / 20 %).
const LIMIT_DEFAULT = 0.15;
const LIMIT_LARGE_CAP = 0.20;

const fmtNumber = (n: number) => n.toLocaleString("fr-FR");

function useCountdown(targetIso: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!targetIso) return { ms: 0, parts: { d: 0, h: 0, m: 0, s: 0 }, expired: true };
  const target = Date.parse(targetIso);
  if (Number.isNaN(target)) return { ms: 0, parts: { d: 0, h: 0, m: 0, s: 0 }, expired: true };
  const ms = Math.max(0, target - now);
  const totalS = Math.floor(ms / 1000);
  const d = Math.floor(totalS / 86400);
  const h = Math.floor((totalS % 86400) / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  return { ms, parts: { d, h, m, s }, expired: ms <= 0 };
}

export default function IntroPhaseView({
  season,
  pool,
  myCash,
  myPositions,
  myTotalSpent,
  myTotalUnits,
  myPoolTransactions,
  totalPoolValue,
  totalRemainingValue,
  stockNames,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<"value" | "code" | "remaining" | "price">("value");
  const [buyTarget, setBuyTarget] = useState<PoolRow | null>(null);
  const [buyUnits, setBuyUnits] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const startCountdown = useCountdown(season.intro_phase_start_at ?? null);
  const endCountdown = useCountdown(season.intro_phase_end_at ?? null);

  // Auto-refresh toutes les 30s pour voir le pool des autres joueurs évoluer
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  // useCountdown renvoie expired=true quand la cible est passée.
  // → start expired = intro a démarré
  // → end   expired = intro est terminée
  const introStarted = startCountdown.expired;
  const introOpen = startCountdown.expired && !endCountdown.expired;

  const filteredPool = useMemo(() => {
    const q = filter.trim().toUpperCase();
    let rows = pool;
    if (q) {
      rows = rows.filter(
        (r) =>
          r.code.includes(q) ||
          (stockNames[r.code] ?? "").toUpperCase().includes(q),
      );
    }
    const sorted = [...rows];
    if (sortKey === "value") {
      sorted.sort((a, b) => b.remaining_units * b.ref_price - a.remaining_units * a.ref_price);
    } else if (sortKey === "code") {
      sorted.sort((a, b) => a.code.localeCompare(b.code));
    } else if (sortKey === "remaining") {
      sorted.sort((a, b) => b.remaining_units - a.remaining_units);
    } else if (sortKey === "price") {
      sorted.sort((a, b) => b.ref_price - a.ref_price);
    }
    return sorted;
  }, [pool, filter, sortKey, stockNames]);

  const consumedPct = totalPoolValue > 0
    ? ((totalPoolValue - totalRemainingValue) / totalPoolValue) * 100
    : 0;

  // Map positions par code pour calcul du poids portefeuille
  const positionsByCode = useMemo(() => {
    const m = new Map<string, IntroPosition>();
    for (const p of myPositions) m.set(p.code, p);
    return m;
  }, [myPositions]);

  // Valeur courante du portefeuille (cash + positions valorisées au PRU).
  // Pendant la Course, PRU = ref_price → la valeur du portefeuille est
  // constante et égale au capital initial.
  const portfolioValue = useMemo(() => {
    let v = myCash;
    for (const p of myPositions) v += p.units * p.avg_cost;
    return v;
  }, [myCash, myPositions]);

  // Quantité max achetable pour un titre donné en respectant :
  // (a) cash disponible, (b) pool restant, (c) règle de diversification.
  function maxBuyableUnits(row: PoolRow): number {
    const limit = row.is_large_cap ? LIMIT_LARGE_CAP : LIMIT_DEFAULT;
    const existing = positionsByCode.get(row.code);
    const existingUnits = existing?.units ?? 0;
    // Plafond diversification : (existingUnits + du) × ref_price ≤ limit × portfolioValue
    // ⇒ du ≤ (limit × portfolioValue / ref_price) - existingUnits
    const diversMax = Math.max(
      0,
      Math.floor((limit * portfolioValue) / row.ref_price) - existingUnits,
    );
    const cashMax = Math.floor(myCash / row.ref_price);
    return Math.min(row.remaining_units, cashMax, diversMax);
  }

  function openBuy(row: PoolRow) {
    setBuyTarget(row);
    const safe = maxBuyableUnits(row);
    // Pré-remplir avec qqch de sage : la moitié du max ou un nombre rond
    setBuyUnits(safe > 0 ? Math.max(1, Math.floor(safe / 2)) : 0);
    setFeedback(null);
  }

  function confirmBuy() {
    if (!buyTarget) return;
    const units = Math.floor(Number(buyUnits));
    if (!units || units <= 0) {
      setFeedback({ ok: false, msg: "Saisis un nombre d'actions strictement positif." });
      return;
    }
    const cost = units * buyTarget.ref_price;
    if (cost > myCash) {
      setFeedback({ ok: false, msg: `Cash insuffisant : ${fmtFCFAExact(cost)} FCFA requis, tu as ${fmtFCFAExact(myCash)} FCFA.` });
      return;
    }
    if (units > buyTarget.remaining_units) {
      setFeedback({ ok: false, msg: `Le pool n'a plus que ${fmtNumber(buyTarget.remaining_units)} action(s) disponible(s).` });
      return;
    }
    // Pre-check diversification (la même règle est aussi appliquée côté SQL).
    const limitPct = buyTarget.is_large_cap ? LIMIT_LARGE_CAP : LIMIT_DEFAULT;
    const existing = positionsByCode.get(buyTarget.code);
    const newPositionValue =
      (existing?.units ?? 0) * buyTarget.ref_price + units * buyTarget.ref_price;
    const weight = portfolioValue > 0 ? newPositionValue / portfolioValue : 1;
    if (weight > limitPct + 1e-6) {
      const limitFcfa = Math.floor(limitPct * portfolioValue);
      setFeedback({
        ok: false,
        msg: `Diversification dépassée : cette position pèserait ${(weight * 100).toFixed(1).replace(".", ",")} % du portefeuille (plafond ${(limitPct * 100).toFixed(0)} %, soit ${fmtFCFAExact(limitFcfa)} FCFA).`,
      });
      return;
    }
    startTransition(async () => {
      const res = await buyFromPoolAction({
        seasonId: season.id,
        code: buyTarget.code,
        units,
      });
      if (res.ok) {
        setFeedback({
          ok: true,
          msg: `Acheté ${fmtNumber(res.data.units)} × ${buyTarget.code} à ${fmtFCFAExact(res.data.price)} FCFA = ${fmtFCFAExact(res.data.cost)} FCFA. Reste en cash : ${fmtFCFAExact(res.data.new_cash)} FCFA.`,
        });
        setBuyTarget(null);
        setBuyUnits(0);
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Bandeau : statut + countdown */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300 rounded-lg p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-800">
              Ligue Azimut · {season.name}
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-amber-900 mt-0.5">
              Course à l&apos;introduction
            </h2>
            <p className="text-xs text-amber-900/80 mt-1 max-w-2xl">
              Premier arrivé premier servi : achète les meilleures actions au prix du marché
              jusqu&apos;à épuisement du pool. Aucun frais pendant cette phase. À la fin de la
              fenêtre, le reste du pool bascule en ordres SELL dans le carnet d&apos;ordres.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-semibold text-amber-800">
              {!introStarted
                ? "Ouvre dans"
                : introOpen
                ? "Se ferme dans"
                : "Phase terminée"}
            </div>
            <div className="text-2xl md:text-3xl font-bold text-amber-900 tabular-nums leading-tight">
              {!introStarted ? (
                <>
                  {startCountdown.parts.d > 0 && `${startCountdown.parts.d}j `}
                  {String(startCountdown.parts.h).padStart(2, "0")}:
                  {String(startCountdown.parts.m).padStart(2, "0")}:
                  {String(startCountdown.parts.s).padStart(2, "0")}
                </>
              ) : introOpen ? (
                <>
                  {endCountdown.parts.d > 0 && `${endCountdown.parts.d}j `}
                  {String(endCountdown.parts.h).padStart(2, "0")}:
                  {String(endCountdown.parts.m).padStart(2, "0")}:
                  {String(endCountdown.parts.s).padStart(2, "0")}
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs joueur */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Cash disponible" value={`${fmtFCFAExact(myCash)} FCFA`} accent="emerald" />
        <Kpi label="Total dépensé" value={`${fmtFCFAExact(myTotalSpent)} FCFA`} />
        <Kpi label="Actions achetées" value={fmtNumber(myTotalUnits)} />
        <Kpi
          label="Pool consommé"
          value={`${consumedPct.toFixed(1).replace(".", ",")} %`}
          accent={consumedPct > 80 ? "rose" : "default"}
        />
      </div>

      {feedback && (
        <div
          className={`text-xs rounded px-3 py-2 border ${
            feedback.ok
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Filtre + tri */}
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer par ticker ou nom…"
            className="flex-1 min-w-[160px] text-sm border border-slate-300 rounded px-2 py-1.5"
          />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
            className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="value">Trier · valeur restante</option>
            <option value="remaining">Trier · actions restantes</option>
            <option value="price">Trier · prix unitaire</option>
            <option value="code">Trier · code (A→Z)</option>
          </select>
          <div className="text-[11px] text-slate-500">
            {filteredPool.length} titre(s) · valeur restante {fmtFCFA(totalRemainingValue)} FCFA
          </div>
        </div>
      </div>

      {/* Grille du pool */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-[10px] uppercase tracking-wider text-slate-600">
              <th className="text-left font-semibold px-3 py-2">Titre</th>
              <th className="text-right font-semibold px-3 py-2">Prix</th>
              <th className="text-right font-semibold px-3 py-2">Restant</th>
              <th className="text-right font-semibold px-3 py-2">Valeur restante</th>
              <th className="text-right font-semibold px-3 py-2 w-32">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredPool.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-sm text-slate-500 py-8">
                  Aucun titre ne correspond au filtre.
                </td>
              </tr>
            ) : (
              filteredPool.map((row) => {
                const remainingValue = row.remaining_units * row.ref_price;
                const exhausted = row.remaining_units === 0;
                const consumedPctRow =
                  row.total_units > 0
                    ? ((row.total_units - row.remaining_units) / row.total_units) * 100
                    : 0;
                const existing = positionsByCode.get(row.code);
                const myUnits = existing?.units ?? 0;
                const myPositionValue = myUnits * (existing?.avg_cost ?? row.ref_price);
                const myWeight = portfolioValue > 0 ? myPositionValue / portfolioValue : 0;
                const limit = row.is_large_cap ? LIMIT_LARGE_CAP : LIMIT_DEFAULT;
                const maxBuyable = maxBuyableUnits(row);
                const diversBlocked = maxBuyable === 0 && myUnits > 0;
                return (
                  <tr
                    key={row.code}
                    className={`border-t border-slate-100 ${exhausted ? "opacity-50" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-semibold text-slate-900">{row.code}</span>
                        {row.is_large_cap && (
                          <span
                            className="text-[9px] uppercase font-bold bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded"
                            title="Capi flottante > 10 % du marché simulé — plafond de diversification 20 % (au lieu de 15 %)"
                          >
                            Large cap
                          </span>
                        )}
                        <span
                          className="text-[9px] uppercase font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded"
                          title="Plafond de diversification appliqué à ce titre"
                        >
                          Max {(limit * 100).toFixed(0)} %
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[260px]">
                        {stockNames[row.code] ?? "—"}
                      </div>
                      {myUnits > 0 && (
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          Tu détiens {fmtNumber(myUnits)} actions (
                          <span
                            className={
                              myWeight > limit - 0.01
                                ? "text-rose-700 font-semibold"
                                : "text-slate-700"
                            }
                          >
                            {(myWeight * 100).toFixed(1).replace(".", ",")} % du portefeuille
                          </span>
                          )
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-medium">
                      {fmtFCFAExact(row.ref_price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div className={`font-medium ${exhausted ? "text-rose-700" : "text-slate-900"}`}>
                        {fmtNumber(row.remaining_units)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        sur {fmtNumber(row.total_units)} ({consumedPctRow.toFixed(0)} %)
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {fmtFCFA(remainingValue)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openBuy(row)}
                        disabled={
                          exhausted || !introOpen || myCash < row.ref_price || maxBuyable === 0
                        }
                        className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          diversBlocked
                            ? `Plafond de diversification atteint (${(limit * 100).toFixed(0)} %)`
                            : undefined
                        }
                      >
                        {exhausted
                          ? "Épuisé"
                          : !introStarted
                          ? "Bientôt"
                          : !introOpen
                          ? "Fermé"
                          : diversBlocked
                          ? "Plafond"
                          : "Acheter"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Historique d'achat */}
      {myPoolTransactions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Mes achats de la Course</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase">
                <th className="text-left font-medium py-1.5">Date</th>
                <th className="text-left font-medium py-1.5">Titre</th>
                <th className="text-right font-medium py-1.5">Unités</th>
                <th className="text-right font-medium py-1.5">Prix</th>
                <th className="text-right font-medium py-1.5">Total</th>
              </tr>
            </thead>
            <tbody>
              {myPoolTransactions.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-700 tabular-nums">
                    {new Date(t.executed_at).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-1.5 font-mono font-medium text-slate-900">{t.code}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {fmtNumber(t.units)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {fmtFCFAExact(t.price)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-900 font-medium">
                    {fmtFCFAExact(t.net_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modale d'achat */}
      {buyTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          onClick={() => {
            if (!isPending) setBuyTarget(null);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Acheter <span className="font-mono">{buyTarget.code}</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {stockNames[buyTarget.code] ?? "—"}
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-500">
                    Prix unitaire
                  </div>
                  <div className="text-slate-900 font-medium tabular-nums">
                    {fmtFCFAExact(buyTarget.ref_price)} FCFA
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-500">
                    Disponible
                  </div>
                  <div className="text-slate-900 font-medium tabular-nums">
                    {fmtNumber(buyTarget.remaining_units)} actions
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-500">
                    Cash dispo.
                  </div>
                  <div className="text-emerald-700 font-medium tabular-nums">
                    {fmtFCFAExact(myCash)} FCFA
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-500">
                    Plafond diversif.
                  </div>
                  <div className="text-slate-900 font-medium">
                    {((buyTarget.is_large_cap ? LIMIT_LARGE_CAP : LIMIT_DEFAULT) * 100).toFixed(0)} %
                    {buyTarget.is_large_cap && (
                      <span className="ml-1 text-[9px] uppercase font-bold text-violet-700">
                        large cap
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-900">
                Max achetable (cash & diversification confondus) :{" "}
                <strong>{fmtNumber(maxBuyableUnits(buyTarget))}</strong> actions
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                  Nombre d&apos;actions à acheter
                </label>
                <input
                  type="number"
                  min={1}
                  max={maxBuyableUnits(buyTarget)}
                  step={1}
                  value={buyUnits || ""}
                  onChange={(e) => setBuyUnits(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                  autoFocus
                />
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  {[10, 50, 100, 500].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setBuyUnits(q)}
                      disabled={q > maxBuyableUnits(buyTarget)}
                      className="text-[10px] border border-slate-300 text-slate-700 px-2 py-0.5 rounded hover:bg-slate-50 disabled:opacity-40"
                    >
                      {q}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setBuyUnits(maxBuyableUnits(buyTarget))}
                    className="text-[10px] border border-amber-500 text-amber-700 font-medium px-2 py-0.5 rounded hover:bg-amber-50"
                  >
                    MAX
                  </button>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-2 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span>Total à débiter</span>
                  <span className="font-bold tabular-nums text-slate-900">
                    {fmtFCFAExact((buyUnits || 0) * buyTarget.ref_price)} FCFA
                  </span>
                </div>
                <div className="flex justify-between text-slate-700 mt-1">
                  <span>Cash après achat</span>
                  <span className="font-bold tabular-nums text-emerald-700">
                    {fmtFCFAExact(myCash - (buyUnits || 0) * buyTarget.ref_price)} FCFA
                  </span>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setBuyTarget(null)}
                disabled={isPending}
                className="text-sm border border-slate-300 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmBuy}
                disabled={
                  isPending ||
                  !buyUnits ||
                  buyUnits <= 0 ||
                  buyUnits > maxBuyableUnits(buyTarget)
                }
                className="text-sm bg-amber-600 hover:bg-amber-700 text-white font-medium px-4 py-1.5 rounded disabled:opacity-50"
              >
                {isPending ? "Achat…" : "Confirmer l'achat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: string;
  accent?: "default" | "emerald" | "rose";
}) {
  const bg =
    accent === "emerald"
      ? "bg-emerald-50 border-emerald-200"
      : accent === "rose"
      ? "bg-rose-50 border-rose-200"
      : "bg-white border-slate-200";
  const txt =
    accent === "emerald"
      ? "text-emerald-900"
      : accent === "rose"
      ? "text-rose-900"
      : "text-slate-900";
  return (
    <div className={`rounded-lg p-3 border ${bg}`}>
      <div className="text-[10px] uppercase font-semibold text-slate-600">{label}</div>
      <div className={`text-lg md:text-xl font-bold tabular-nums mt-0.5 ${txt}`}>{value}</div>
    </div>
  );
}

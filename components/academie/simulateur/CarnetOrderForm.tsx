"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeOrderV2Action } from "@/lib/simulator/actions";
import type {
  OrderSide,
  OrderType,
  OrderValidity,
  Position,
} from "@/lib/simulator/types";
import { fmtFCFA, fmtFCFAExact } from "./format";

type StockOption = {
  code: string;
  name: string;
  sector: string;
  price: number;
  date: string;
};

type Props = {
  seasonId: string;
  cash: number;
  positions: Position[];
  feePct: number;
  stocks: StockOption[];
  /** Code et prix pré-remplis depuis le carnet (clic sur un niveau). */
  preset?: { code: string; price: number; side: OrderSide } | null;
};

// Tick BRVM = 5 FCFA
function roundToTick(p: number): number {
  return Math.round(p / 5) * 5;
}

// Bande BRVM : ±7,5 % autour du dernier cours scrappé
const PRICE_BAND_PCT = 0.075;
function priceBand(ref: number): { min: number; max: number } {
  return {
    min: Math.floor(ref * (1 - PRICE_BAND_PCT)),
    max: Math.ceil(ref * (1 + PRICE_BAND_PCT)),
  };
}

export default function CarnetOrderForm({
  seasonId,
  cash,
  positions,
  feePct,
  stocks,
  preset,
}: Props) {
  const router = useRouter();
  const [side, setSide] = useState<OrderSide>(preset?.side ?? "BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [validity, setValidity] = useState<OrderValidity>("DAY");
  const [code, setCode] = useState<string>(preset?.code ?? "");
  const [units, setUnits] = useState<number>(0);
  const [limitPrice, setLimitPrice] = useState<number>(preset?.price ?? 0);
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Le preset (clic sur un niveau du carnet) sert d'état initial. La parent
  // ré-monte le composant via `key={preset?.id}` quand le preset change pour
  // éviter de devoir copier preset → state via useEffect.
  void preset;

  const selectedStock = useMemo(
    () => stocks.find((s) => s.code === code) ?? null,
    [stocks, code],
  );
  const currentPosition = useMemo(
    () => positions.find((p) => p.code === code) ?? null,
    [positions, code],
  );

  const effectivePrice = orderType === "LIMIT" ? limitPrice : selectedStock?.price ?? 0;
  const grossTotal = units * effectivePrice;
  const fees = Math.round(grossTotal * feePct);
  const netCost = side === "BUY" ? grossTotal + fees : grossTotal - fees;

  // Couverture côté SELL
  const reservedSell = 0; // Simplifié — la RPC fera le check précis avec les ordres déjà ouverts
  const sellAvailable = Math.max(0, (currentPosition?.units ?? 0) - reservedSell);

  const maxBuyUnits =
    orderType === "LIMIT" && limitPrice > 0
      ? Math.floor(cash / limitPrice)
      : 0; // MARKET BUY : pas de plafond client (le serveur fillera selon le book + cash)

  const filteredStocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = stocks;
    if (side === "SELL") {
      const ownedCodes = new Set(positions.map((p) => p.code));
      arr = arr.filter((s) => ownedCodes.has(s.code));
    }
    if (q) {
      arr = arr.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q),
      );
    }
    return arr.slice(0, 25);
  }, [stocks, search, side, positions]);

  function selectStock(s: StockOption) {
    setCode(s.code);
    setShowPicker(false);
    setSearch("");
    setError(null);
    setSuccess(null);
    if (orderType === "LIMIT" && limitPrice === 0) {
      setLimitPrice(roundToTick(s.price));
    }
  }

  function submit() {
    setError(null);
    setSuccess(null);
    if (!code) {
      setError("Sélectionne un titre.");
      return;
    }
    if (units <= 0) {
      setError("Saisis un nombre d'actions strictement positif.");
      return;
    }
    if (orderType === "LIMIT") {
      if (limitPrice <= 0) {
        setError("Saisis un prix limite valide.");
        return;
      }
      if (limitPrice % 5 !== 0) {
        setError("Le prix doit être un multiple de 5 FCFA.");
        return;
      }
      if (selectedStock?.price && selectedStock.price > 0) {
        const band = priceBand(selectedStock.price);
        if (limitPrice < band.min || limitPrice > band.max) {
          setError(
            `Prix hors bande BRVM ±7,5 % : ${band.min.toLocaleString("fr-FR")} – ${band.max.toLocaleString("fr-FR")} FCFA.`,
          );
          return;
        }
      }
    }
    startTransition(async () => {
      const res = await placeOrderV2Action({
        seasonId,
        code,
        side,
        orderType,
        units: Math.floor(units),
        limitPrice: orderType === "LIMIT" ? limitPrice : null,
        validity,
      });
      if (res.ok) {
        if (res.data.status === "filled") {
          setSuccess(
            `Ordre exécuté en totalité (${res.data.units_filled}/${res.data.units} unités, ${res.data.fills} fill(s)).`,
          );
        } else if (res.data.status === "partial") {
          setSuccess(
            `Exécution partielle : ${res.data.units_filled}/${res.data.units} unités. Le reliquat reste dans le carnet.`,
          );
        } else if (res.data.status === "open") {
          setSuccess(`Ordre en attente dans le carnet (${res.data.units} unités).`);
        } else if (res.data.status === "cancelled") {
          setSuccess(
            `Ordre MARKET partiellement exécuté (${res.data.units_filled}/${res.data.units}). Le reliquat est annulé faute de liquidité.`,
          );
        }
        setUnits(0);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-semibold text-slate-900">Passer un ordre</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Carnet d&apos;ordres virtuel · frais{" "}
          {(feePct * 100).toFixed(2).replace(".", ",")} %
        </p>
      </div>

      <div className="p-4 space-y-3">
        {/* SIDE */}
        <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded">
          <button
            type="button"
            onClick={() => setSide("BUY")}
            className={`text-sm py-2 rounded font-medium transition ${
              side === "BUY"
                ? "bg-emerald-600 text-white"
                : "text-slate-700 hover:bg-white"
            }`}
          >
            Acheter
          </button>
          <button
            type="button"
            onClick={() => setSide("SELL")}
            className={`text-sm py-2 rounded font-medium transition ${
              side === "SELL"
                ? "bg-rose-600 text-white"
                : "text-slate-700 hover:bg-white"
            }`}
          >
            Vendre
          </button>
        </div>

        {/* ORDER TYPE + VALIDITY */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-600 mb-1">
              Type
            </label>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
            >
              <option value="LIMIT">LIMIT</option>
              <option value="MARKET">MARKET</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-600 mb-1">
              Validité
            </label>
            <select
              value={validity}
              onChange={(e) => setValidity(e.target.value as OrderValidity)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
            >
              <option value="DAY">DAY (jour)</option>
              <option value="GTC">GTC (jusqu&apos;à annulation)</option>
            </select>
          </div>
        </div>

        {/* CODE PICKER */}
        <div>
          <label className="block text-[10px] uppercase font-semibold text-slate-600 mb-1">
            Titre BRVM
          </label>
          {!showPicker ? (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="w-full flex items-center justify-between border border-slate-300 rounded px-2 py-1.5 text-sm hover:border-slate-500 transition"
            >
              {selectedStock ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-slate-900">
                    {selectedStock.code}
                  </span>
                  <span className="text-slate-500 text-[11px] truncate">
                    {selectedStock.name}
                  </span>
                </span>
              ) : (
                <span className="text-slate-400 text-sm">
                  {side === "SELL" && positions.length === 0
                    ? "Aucune position à vendre"
                    : "Choisir un titre…"}
                </span>
              )}
              <span className="text-slate-400 text-xs">▼</span>
            </button>
          ) : (
            <div className="border border-slate-300 rounded overflow-hidden">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                autoFocus
                className="w-full text-sm border-0 border-b border-slate-200 px-2 py-1.5"
              />
              <div className="max-h-56 overflow-y-auto">
                {filteredStocks.length === 0 ? (
                  <div className="text-xs text-slate-400 px-3 py-3">Aucun résultat.</div>
                ) : (
                  filteredStocks.map((s) => {
                    const owned = positions.find((p) => p.code === s.code);
                    return (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => selectStock(s)}
                        className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 flex justify-between gap-2 border-b border-slate-100 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900">
                            <span className="font-mono">{s.code}</span>{" "}
                            <span className="font-normal text-slate-600">{s.name}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="tabular-nums text-slate-900">
                            {s.price.toLocaleString("fr-FR")}
                          </div>
                          {owned && (
                            <div className="text-[10px] text-blue-700">
                              {owned.units} en pf
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPicker(false);
                  setSearch("");
                }}
                className="w-full text-[10px] text-slate-500 py-1 border-t border-slate-200 hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
          )}
        </div>

        {/* LIMIT PRICE */}
        {orderType === "LIMIT" && (
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-600 mb-1">
              Prix limite (FCFA, multiple de 5)
            </label>
            <input
              type="number"
              min={0}
              step={5}
              value={limitPrice || ""}
              onChange={(e) => setLimitPrice(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              onBlur={() => setLimitPrice(roundToTick(limitPrice))}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
              placeholder="0"
            />
            {selectedStock && (
              <div className="mt-1 text-[10px] text-slate-500">
                Cours BRVM :{" "}
                <button
                  type="button"
                  onClick={() => setLimitPrice(roundToTick(selectedStock.price))}
                  className="underline hover:text-slate-900"
                >
                  {selectedStock.price.toLocaleString("fr-FR")} FCFA
                </button>{" "}
                · Bande ±7,5 % autorisée :{" "}
                <span className="tabular-nums text-slate-700">
                  {priceBand(selectedStock.price).min.toLocaleString("fr-FR")}
                  {" – "}
                  {priceBand(selectedStock.price).max.toLocaleString("fr-FR")}
                </span>
              </div>
            )}
            {selectedStock && limitPrice > 0 && (() => {
              const band = priceBand(selectedStock.price);
              const out = limitPrice < band.min || limitPrice > band.max;
              return out ? (
                <div className="mt-1 text-[10px] text-rose-700 font-medium">
                  ⚠ Prix hors bande BRVM — ordre refusé.
                </div>
              ) : null;
            })()}
          </div>
        )}

        {/* UNITS */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-[10px] uppercase font-semibold text-slate-600">
              Quantité
            </label>
            {selectedStock && side === "BUY" && orderType === "LIMIT" && maxBuyUnits > 0 && (
              <button
                type="button"
                onClick={() => setUnits(maxBuyUnits)}
                className="text-[10px] text-blue-700 hover:underline"
              >
                Max ({maxBuyUnits.toLocaleString("fr-FR")})
              </button>
            )}
            {selectedStock && side === "SELL" && sellAvailable > 0 && (
              <button
                type="button"
                onClick={() => setUnits(sellAvailable)}
                className="text-[10px] text-blue-700 hover:underline"
              >
                Max ({sellAvailable.toLocaleString("fr-FR")})
              </button>
            )}
          </div>
          <input
            type="number"
            min={0}
            step={1}
            value={units || ""}
            onChange={(e) => setUnits(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            disabled={!selectedStock}
            placeholder="0"
            className="w-full text-base font-semibold tabular-nums border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-400"
          />
          {selectedStock && side === "BUY" && (
            <div className="mt-1 text-[10px] text-slate-500 tabular-nums">
              Cash : {fmtFCFA(cash)} FCFA
            </div>
          )}
          {selectedStock && side === "SELL" && (
            <div className="mt-1 text-[10px] text-slate-500 tabular-nums">
              Position : {fmtNum(currentPosition?.units ?? 0)} unités · PRU{" "}
              {currentPosition
                ? fmtFCFAExact(currentPosition.avgCost)
                : "—"}{" "}
              FCFA
            </div>
          )}
        </div>

        {/* RÉCAP */}
        {selectedStock && units > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded p-2.5 space-y-1 text-xs">
            <Row label="Prix unitaire" value={`${fmtFCFAExact(effectivePrice)} FCFA`} />
            <Row label={`Brut (${fmtNum(units)} ×)`} value={`${fmtFCFAExact(grossTotal)} FCFA`} />
            <Row label="Frais estimés" value={`${fmtFCFAExact(fees)} FCFA`} />
            <div className="h-px bg-slate-200 my-1" />
            <Row
              label={side === "BUY" ? "Total à débiter" : "Total à créditer"}
              value={`${fmtFCFAExact(netCost)} FCFA`}
              bold
              accent={side === "BUY" ? "text-rose-700" : "text-emerald-700"}
            />
            {orderType === "MARKET" && (
              <div className="text-[10px] text-slate-500 mt-1">
                Estimation au dernier cours — l&apos;exécution réelle dépend de la liquidité du book.
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5">
            {error}
          </div>
        )}
        {success && (
          <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5">
            {success}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={isPending || !code || units <= 0}
          className={`w-full text-sm font-medium py-2.5 rounded transition ${
            side === "BUY"
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : "bg-rose-600 hover:bg-rose-700 text-white"
          } disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed`}
        >
          {isPending
            ? "Envoi…"
            : `${side === "BUY" ? "Acheter" : "Vendre"} (${orderType})`}
        </button>
      </div>
    </div>
  );
}

const fmtNum = (n: number) => n.toLocaleString("fr-FR");

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-600">{label}</span>
      <span
        className={`tabular-nums ${bold ? "font-semibold" : ""} ${accent ?? "text-slate-900"}`}
      >
        {value}
      </span>
    </div>
  );
}

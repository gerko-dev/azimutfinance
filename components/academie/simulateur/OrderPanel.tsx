"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeOrder } from "@/lib/simulator/actions";
import type { Position, TransactionType } from "@/lib/simulator/types";
import { fmtFCFA } from "./format";

type StockOption = {
  code: string;
  name: string;
  sector: string;
  price: number;
  date: string;
};

export default function OrderPanel({
  seasonId,
  cash,
  positions,
  feePct,
  stocks,
}: {
  seasonId: string;
  cash: number;
  positions: Position[];
  feePct: number;
  stocks: StockOption[];
}) {
  const router = useRouter();
  const [type, setType] = useState<TransactionType>("BUY");
  const [code, setCode] = useState<string>("");
  const [units, setUnits] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Position courante pour le code selectionne (si SELL)
  const currentPosition = useMemo(
    () => positions.find((p) => p.code === code) ?? null,
    [positions, code],
  );

  const selectedStock = useMemo(
    () => stocks.find((s) => s.code === code) ?? null,
    [stocks, code],
  );

  const price = selectedStock?.price ?? 0;
  const grossTotal = units * price;
  const fees = Math.round(grossTotal * feePct);
  const netTotal = type === "BUY" ? grossTotal + fees : grossTotal - fees;

  const maxBuyUnits = price > 0 ? Math.floor(cash / (price * (1 + feePct))) : 0;
  const maxSellUnits = currentPosition?.units ?? 0;
  const maxUnits = type === "BUY" ? maxBuyUnits : maxSellUnits;

  const isValid =
    code !== "" &&
    units > 0 &&
    units <= maxUnits &&
    !isPending &&
    (type === "BUY" || maxSellUnits > 0);

  const filteredStocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = stocks;
    if (type === "SELL") {
      // SELL : seules les valeurs detenues
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
  }, [stocks, search, type, positions]);

  function selectStock(s: StockOption) {
    setCode(s.code);
    setShowPicker(false);
    setSearch("");
    setError(null);
    setSuccess(null);
  }

  function setMax() {
    setUnits(maxUnits);
  }

  function reset() {
    setCode("");
    setUnits(0);
    setError(null);
    setSuccess(null);
  }

  function submit() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await placeOrder({
        seasonId,
        type,
        code,
        units,
      });
      if (result.ok) {
        setSuccess(
          `Ordre exécuté : ${type === "BUY" ? "achat" : "vente"} de ${units} ${code} ` +
            `· net ${fmtFCFA(result.data.net_total)} FCFA`,
        );
        reset();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-semibold text-slate-900">Passer un ordre</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Exécution au dernier cours de clôture connu · frais{" "}
          {(feePct * 100).toFixed(2).replace(".", ",")} %.
        </p>
      </div>

      <div className="p-4 md:p-5 space-y-4">
        {/* Type d'ordre : BUY / SELL */}
        <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded">
          <button
            type="button"
            onClick={() => {
              setType("BUY");
              setError(null);
              setSuccess(null);
            }}
            className={`text-sm py-2 rounded font-medium transition ${
              type === "BUY"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-700 hover:bg-white"
            }`}
          >
            Acheter
          </button>
          <button
            type="button"
            onClick={() => {
              setType("SELL");
              setError(null);
              setSuccess(null);
            }}
            className={`text-sm py-2 rounded font-medium transition ${
              type === "SELL"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-slate-700 hover:bg-white"
            }`}
          >
            Vendre
          </button>
        </div>

        {/* Selecteur de valeur */}
        <div>
          <label className="text-[11px] text-slate-600 font-medium uppercase tracking-wide">
            Valeur BRVM
          </label>
          {!showPicker ? (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="mt-1.5 w-full flex items-center justify-between border border-slate-300 rounded px-3 py-2 text-sm hover:border-slate-500 transition"
            >
              {selectedStock ? (
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{selectedStock.code}</span>
                  <span className="text-slate-500 text-xs truncate">{selectedStock.name}</span>
                </span>
              ) : (
                <span className="text-slate-400">
                  {type === "SELL"
                    ? positions.length === 0
                      ? "Aucune valeur détenue à vendre"
                      : "Choisir une valeur à vendre…"
                    : "Choisir une valeur à acheter…"}
                </span>
              )}
              <span className="text-slate-400 text-xs">▼</span>
            </button>
          ) : (
            <div className="mt-1.5 border border-slate-300 rounded overflow-hidden">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par code, nom ou secteur..."
                autoFocus
                className="w-full text-sm border-0 border-b border-slate-200 px-3 py-2 focus:outline-none"
              />
              <div className="max-h-64 overflow-y-auto">
                {filteredStocks.length === 0 ? (
                  <div className="text-xs text-slate-400 px-3 py-3">
                    {type === "SELL" && positions.length === 0
                      ? "Vous ne détenez aucune valeur."
                      : "Aucun résultat."}
                  </div>
                ) : (
                  filteredStocks.map((s) => {
                    const owned = positions.find((p) => p.code === s.code);
                    return (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => selectStock(s)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 border-b border-slate-100 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900">
                            {s.code}{" "}
                            <span className="font-normal text-slate-600">{s.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">{s.sector}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="tabular-nums font-medium text-slate-900">
                            {s.price.toLocaleString("fr-FR")} FCFA
                          </div>
                          {owned && (
                            <div className="text-[10px] text-blue-700">
                              {owned.units} détenues
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
                className="w-full text-[11px] text-slate-500 py-1.5 border-t border-slate-200 hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
          )}
        </div>

        {/* Quantité */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-[11px] text-slate-600 font-medium uppercase tracking-wide">
              Quantité (unités)
            </label>
            {selectedStock && maxUnits > 0 && (
              <button
                type="button"
                onClick={setMax}
                className="text-[11px] text-blue-700 hover:underline"
              >
                Max ({maxUnits.toLocaleString("fr-FR")})
              </button>
            )}
          </div>
          <input
            type="number"
            min={0}
            max={maxUnits || undefined}
            step={1}
            value={units || ""}
            onChange={(e) => setUnits(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            disabled={!selectedStock}
            placeholder="0"
            className="w-full text-base font-semibold tabular-nums border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
          {selectedStock && type === "BUY" && (
            <div className="mt-1 text-[10px] text-slate-500 tabular-nums">
              Cash disponible : {fmtFCFA(cash)} FCFA · max {maxBuyUnits.toLocaleString("fr-FR")} unités
            </div>
          )}
          {selectedStock && type === "SELL" && (
            <div className="mt-1 text-[10px] text-slate-500 tabular-nums">
              Position : {maxSellUnits.toLocaleString("fr-FR")} unités · PRU{" "}
              {currentPosition ? Math.round(currentPosition.avgCost).toLocaleString("fr-FR") : "—"} FCFA
            </div>
          )}
        </div>

        {/* Estimation */}
        {selectedStock && units > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1 text-xs">
            <Row label="Prix unitaire" value={`${price.toLocaleString("fr-FR")} FCFA`} />
            <Row
              label={`Brut (${units.toLocaleString("fr-FR")} × prix)`}
              value={`${grossTotal.toLocaleString("fr-FR")} FCFA`}
            />
            <Row label="Frais" value={`${fees.toLocaleString("fr-FR")} FCFA`} />
            <div className="h-px bg-slate-200 my-1" />
            <Row
              label={type === "BUY" ? "Total à débiter" : "Total à créditer"}
              value={`${netTotal.toLocaleString("fr-FR")} FCFA`}
              bold
              accent={type === "BUY" ? "text-rose-700" : "text-emerald-700"}
            />
          </div>
        )}

        {/* Errors / success */}
        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
            {success}
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={submit}
          disabled={!isValid}
          className={`w-full text-sm font-medium py-2.5 rounded transition ${
            type === "BUY"
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : "bg-rose-600 hover:bg-rose-700 text-white"
          } disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed`}
        >
          {isPending
            ? "Exécution en cours…"
            : type === "BUY"
            ? "Confirmer l'achat"
            : "Confirmer la vente"}
        </button>
      </div>
    </div>
  );
}

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

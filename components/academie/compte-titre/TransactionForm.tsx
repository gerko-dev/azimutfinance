"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addBrokerageTransaction,
  deleteBrokerageTransaction,
  updateBrokerageTransaction,
} from "@/lib/comptetitre/actions";
import {
  SECURITY_TYPE_LABELS,
  TXN_TYPE_LABELS,
  UEMOA_COUNTRY_LABELS,
  type BrokerageAccount,
  type BrokerageTransaction,
  type BrokerageTxnType,
  type MarketFee,
  type SecurityType,
  type TpsRate,
} from "@/lib/comptetitre/types";
import { fmtFCFA } from "./format";

const TYPES: BrokerageTxnType[] = [
  "buy",
  "sell",
  "deposit",
  "withdrawal",
  "dividend",
  "fee",
  "interest",
  "split",
];

const SEC_TYPES: SecurityType[] = ["stock", "bond", "fcp", "other"];

type StockHint = { code: string; name: string; sector: string; price: number };

type Availability = {
  cash: number;
  unitsByCode: Record<string, number>;
};

export default function TransactionForm({
  mode,
  account,
  initial,
  stocks,
  marketFees,
  tpsRates,
  availability,
}: {
  mode: "create" | "edit";
  account: BrokerageAccount;
  initial?: BrokerageTransaction;
  stocks: StockHint[];
  marketFees: MarketFee[];
  tpsRates: TpsRate[];
  availability: Availability;
}) {
  const router = useRouter();
  const [type, setType] = useState<BrokerageTxnType>(initial?.type ?? "buy");
  const [txnDate, setTxnDate] = useState(
    initial?.txnDate ?? new Date().toISOString().slice(0, 10),
  );
  const [securityCode, setSecurityCode] = useState(initial?.securityCode ?? "");
  const [securityName, setSecurityName] = useState(initial?.securityName ?? "");
  const [securityType, setSecurityType] = useState<SecurityType>(
    initial?.securityType ?? "stock",
  );
  const [quantity, setQuantity] = useState<string>(
    initial?.quantity != null ? String(initial.quantity) : "",
  );
  const [price, setPrice] = useState<string>(
    initial?.price != null ? String(initial.price) : "",
  );
  const [grossAmount, setGrossAmount] = useState<string>(
    initial && initial.grossAmount > 0 ? String(initial.grossAmount) : "",
  );
  const [feesOther, setFeesOther] = useState<string>(
    initial?.feesOther != null ? String(initial.feesOther) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const needsSecurity = ["buy", "sell", "dividend", "split"].includes(type);
  const isTrade = type === "buy" || type === "sell";

  const brvmFee = marketFees.find((f) => f.code === "BRVM");
  const dcbrFee = marketFees.find((f) => f.code === "DCBR");
  const tpsRate = account.sgiCountry
    ? tpsRates.find((r) => r.country === account.sgiCountry)?.rate ?? 0
    : 0;

  function onCodeChange(code: string) {
    const upper = code.toUpperCase();
    setSecurityCode(upper);
    const hint = stocks.find((s) => s.code === upper);
    if (hint) {
      setSecurityName(hint.name);
      if (!price) setPrice(String(hint.price));
    }
  }

  // Calculs en live
  const computedGross = useMemo(() => {
    if (isTrade) {
      const q = parseFloat(quantity.replace(",", ".")) || 0;
      const p = parseFloat(price.replace(",", ".")) || 0;
      return q * p;
    }
    return parseFloat(grossAmount.replace(",", ".")) || 0;
  }, [isTrade, quantity, price, grossAmount]);

  const computedFees = useMemo(() => {
    if (!isTrade) return { courtage: 0, brvm: 0, dcbr: 0, tps: 0 };
    const gross = computedGross;
    const courtage = Math.round(
      Math.max(account.defaultFeeMin, gross * account.defaultFeePct),
    );
    const brvm = brvmFee
      ? Math.round(Math.max(brvmFee.minAmount, gross * brvmFee.feePct))
      : 0;
    const dcbr = dcbrFee
      ? Math.round(Math.max(dcbrFee.minAmount, gross * dcbrFee.feePct))
      : 0;
    const tps = Math.round(courtage * tpsRate);
    return { courtage, brvm, dcbr, tps };
  }, [isTrade, computedGross, account, brvmFee, dcbrFee, tpsRate]);

  const otherFeesNum = parseFloat((feesOther || "0").replace(",", ".")) || 0;
  const totalFees =
    computedFees.courtage +
    computedFees.brvm +
    computedFees.dcbr +
    computedFees.tps +
    otherFeesNum;

  const computedNet = useMemo(() => {
    switch (type) {
      case "deposit":
      case "interest":
        return computedGross - totalFees;
      case "withdrawal":
      case "buy":
      case "fee":
        return -(computedGross + totalFees);
      case "sell":
      case "dividend":
        return computedGross - totalFees;
      case "split":
        return 0;
    }
  }, [type, computedGross, totalFees]);

  // Validation client (preview, le serveur revalide)
  const clientWarning = useMemo(() => {
    if (type === "sell" && securityCode) {
      const have = availability.unitsByCode[securityCode] ?? 0;
      const want = parseFloat(quantity.replace(",", ".")) || 0;
      if (want > have && want > 0) {
        return `Vente à découvert interdite : vous détenez ${have} ${securityCode}, vous tentez d'en vendre ${want}.`;
      }
    }
    if (type === "buy" || type === "withdrawal") {
      const need = computedGross + totalFees;
      if (need > availability.cash && need > 0) {
        const missing = need - availability.cash;
        return `Cash espèce insuffisant : il manque ${fmtFCFA(missing)} FCFA. Disponible : ${fmtFCFA(availability.cash)} FCFA.`;
      }
    }
    return null;
  }, [type, securityCode, quantity, computedGross, totalFees, availability]);

  function submit() {
    setFeedback(null);
    const fd = new FormData();
    fd.append("txn_date", txnDate);
    fd.append("type", type);
    if (needsSecurity) {
      fd.append("security_code", securityCode);
      fd.append("security_name", securityName);
      fd.append("security_type", securityType);
    }
    if (quantity) fd.append("quantity", quantity);
    if (price) fd.append("price", price);
    fd.append("gross_amount", grossAmount || (isTrade ? "" : "0"));
    fd.append("fees_other", feesOther || "0");
    fd.append("notes", notes);

    startTransition(async () => {
      if (mode === "create") {
        const res = await addBrokerageTransaction(account.id, fd);
        if (res.ok) router.push(`/academie/compte-titre/${account.id}`);
        else setFeedback({ ok: false, msg: res.error });
      } else {
        const res = await updateBrokerageTransaction(initial!.id, fd);
        if (res.ok) router.push(`/academie/compte-titre/${account.id}`);
        else setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function onDelete() {
    if (!initial) return;
    if (!confirm("Supprimer cette transaction ?")) return;
    startTransition(async () => {
      const res = await deleteBrokerageTransaction(initial.id);
      if (res.ok) router.push(`/academie/compte-titre/${account.id}`);
      else setFeedback({ ok: false, msg: res.error });
    });
  }

  // Pour vente : afficher la quantité disponible
  const availableForSell =
    type === "sell" && securityCode
      ? availability.unitsByCode[securityCode] ?? 0
      : null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
      {feedback && (
        <div
          className={`text-xs px-3 py-2 rounded border ${
            feedback.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <Stat label="Cash espèce dispo" value={`${fmtFCFA(availability.cash)} FCFA`} />
        <Stat
          label="Courtage SGI"
          value={`${(account.defaultFeePct * 100).toFixed(2).replace(".", ",")} %${
            account.defaultFeeMin > 0 ? ` (min ${fmtFCFA(account.defaultFeeMin)})` : ""
          }`}
        />
        <Stat
          label="BRVM + DC/BR"
          value={`${((brvmFee?.feePct ?? 0) * 100).toFixed(3).replace(".", ",")} % + ${((dcbrFee?.feePct ?? 0) * 100).toFixed(3).replace(".", ",")} %`}
        />
        <Stat
          label="TPS"
          value={
            account.sgiCountry
              ? `${(tpsRate * 100).toFixed(2).replace(".", ",")} % · ${UEMOA_COUNTRY_LABELS[account.sgiCountry]}`
              : "Pays SGI manquant"
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Type de transaction
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`text-xs px-2.5 py-1.5 rounded border ${
                  type === t
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {TXN_TYPE_LABELS[t].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Date
          </label>
          <input
            type="date"
            value={txnDate}
            onChange={(e) => setTxnDate(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
      </div>

      {needsSecurity && (
        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_180px] gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Ticker
            </label>
            <input
              type="text"
              value={securityCode}
              onChange={(e) => onCodeChange(e.target.value)}
              list="stock-tickers"
              placeholder="SNTS, BOAS…"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono uppercase tabular-nums"
            />
            <datalist id="stock-tickers">
              {stocks.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </datalist>
            {availableForSell !== null && (
              <div className="text-[10px] text-slate-500 mt-1 tabular-nums">
                Détenu : {availableForSell}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Nom (snapshot)
            </label>
            <input
              type="text"
              value={securityName}
              onChange={(e) => setSecurityName(e.target.value)}
              placeholder="Sonatel, BOA Sénégal…"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Catégorie
            </label>
            <select
              value={securityType}
              onChange={(e) => setSecurityType(e.target.value as SecurityType)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
            >
              {SEC_TYPES.map((s) => (
                <option key={s} value={s}>
                  {SECURITY_TYPE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {isTrade ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Quantité (titres)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Prix unitaire (FCFA)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Brut calculé
            </label>
            <div className="text-sm border border-slate-200 bg-slate-50 rounded px-2 py-1.5 tabular-nums text-slate-700">
              {fmtFCFA(computedGross)} FCFA
            </div>
          </div>
        </div>
      ) : type === "split" ? (
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Ratio (ex : 2 pour split 2:1, 0.5 pour regroupement 1:2)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full md:w-1/2 text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
          />
        </div>
      ) : (
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Montant brut (FCFA)
          </label>
          <input
            type="number"
            step="1"
            min="0"
            value={grossAmount}
            onChange={(e) => setGrossAmount(e.target.value)}
            className="w-full md:w-1/2 text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
          />
        </div>
      )}

      {/* Decomposition automatique des 3 frais (achats/ventes uniquement) */}
      {isTrade && computedGross > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
            Frais auto-calculés
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[12px]">
            <FeeLine label="Courtage SGI" value={computedFees.courtage} />
            <FeeLine label="BRVM" value={computedFees.brvm} />
            <FeeLine label="DC/BR" value={computedFees.dcbr} />
            <FeeLine label="TPS" value={computedFees.tps} />
            <FeeLine
              label="Total"
              value={
                computedFees.courtage +
                computedFees.brvm +
                computedFees.dcbr +
                computedFees.tps
              }
              bold
            />
          </div>
        </div>
      )}

      {/* Frais "autres" — TVA, retenues, autres */}
      {type !== "split" && (
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Autres frais / taxes (FCFA){" "}
            <span className="text-[10px] text-slate-400 normal-case">
              — TVA, retenue, etc. Optionnel.
            </span>
          </label>
          <input
            type="number"
            step="1"
            min="0"
            value={feesOther}
            onChange={(e) => setFeesOther(e.target.value)}
            className="w-full md:w-1/2 text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
          />
        </div>
      )}

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Note (optionnelle)
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Bordereau N°…, motif, contexte"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      {clientWarning && (
        <div className="text-xs px-3 py-2 rounded border bg-amber-50 border-amber-200 text-amber-800">
          ⚠ {clientWarning}
        </div>
      )}

      <div className="bg-slate-900 text-white rounded p-3 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-300 font-semibold">
            Impact sur le cash espèce
          </div>
          <div
            className={`text-xl font-bold tabular-nums mt-0.5 ${
              computedNet > 0
                ? "text-emerald-300"
                : computedNet < 0
                  ? "text-rose-300"
                  : "text-white"
            }`}
          >
            {computedNet >= 0 ? "+" : ""}
            {fmtFCFA(computedNet)} FCFA
          </div>
        </div>
        <div className="text-[11px] text-slate-300 max-w-xs text-right">
          Brut : {fmtFCFA(computedGross)} · Frais : {fmtFCFA(totalFees)}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        {mode === "edit" && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="text-sm bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium px-3 py-2 rounded border border-rose-200 disabled:opacity-50"
          >
            Supprimer
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => router.push(`/academie/compte-titre/${account.id}`)}
            className="text-sm bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-2 rounded border border-slate-300"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !!clientWarning}
            className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : mode === "create" ? "Enregistrer" : "Mettre à jour"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div className="text-xs font-bold tabular-nums text-slate-900 mt-0.5 truncate">
        {value}
      </div>
    </div>
  );
}

function FeeLine({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between bg-white border border-slate-200 rounded px-2 py-1 ${bold ? "font-semibold" : ""}`}
    >
      <span className="text-[10px] uppercase text-slate-500">{label}</span>
      <span className="tabular-nums text-slate-900">{fmtFCFA(value)}</span>
    </div>
  );
}

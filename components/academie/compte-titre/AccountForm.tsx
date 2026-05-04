"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createBrokerageAccount,
  deleteBrokerageAccount,
  updateBrokerageAccount,
} from "@/lib/comptetitre/actions";
import {
  FREQUENCY_LABELS,
  UEMOA_COUNTRY_LABELS,
  UEMOA_COUNTRY_LIST,
  type BrokerageAccount,
  type RecurringFee,
  type RecurringFrequency,
  type TpsRate,
  type UemoaCountryCode,
} from "@/lib/comptetitre/types";
import { fmtFCFA } from "./format";

const FREQUENCIES: RecurringFrequency[] = ["monthly", "quarterly", "biannual", "annual"];

export default function AccountForm({
  mode,
  initial,
  tpsRates,
}: {
  mode: "create" | "edit";
  initial?: BrokerageAccount;
  tpsRates: TpsRate[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [broker, setBroker] = useState(initial?.broker ?? "");
  const [openingDate, setOpeningDate] = useState(
    initial?.openingDate ?? new Date().toISOString().slice(0, 10),
  );
  const [initialCash, setInitialCash] = useState<string>(
    initial ? String(initial.initialCash) : "",
  );
  const [feePct, setFeePct] = useState(
    initial ? (initial.defaultFeePct * 100).toString() : "1",
  );
  const [feeMin, setFeeMin] = useState(initial?.defaultFeeMin.toString() ?? "0");
  const [sgiCountry, setSgiCountry] = useState<UemoaCountryCode | "">(
    initial?.sgiCountry ?? "",
  );
  const [recurringFees, setRecurringFees] = useState<RecurringFee[]>(
    initial?.recurringFees ?? [],
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const tpsRateForCountry = sgiCountry
    ? tpsRates.find((r) => r.country === sgiCountry)?.rate ?? 0
    : 0;

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  function addRecurringFee() {
    setRecurringFees((prev) => [
      ...prev,
      {
        label: "Droit de garde",
        amount: 5000,
        frequency: "annual",
        startDate: openingDate,
      },
    ]);
  }

  function updateRecurringFee(i: number, patch: Partial<RecurringFee>) {
    setRecurringFees((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }

  function removeRecurringFee(i: number) {
    setRecurringFees((prev) => prev.filter((_, j) => j !== i));
  }

  function submit() {
    setFeedback(null);
    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("broker", broker.trim());
    fd.append("currency", "XOF");
    fd.append("opening_date", openingDate);
    fd.append("initial_cash", initialCash || "0");
    fd.append("default_fee_pct", feePct);
    fd.append("default_fee_min", feeMin);
    fd.append("sgi_country", sgiCountry);
    fd.append("recurring_fees_json", JSON.stringify(recurringFees));
    fd.append("notes", notes);

    startTransition(async () => {
      if (mode === "create") {
        const res = await createBrokerageAccount(fd);
        if (res.ok) router.push(`/academie/compte-titre/${res.data.id}`);
        else setFeedback({ ok: false, msg: res.error });
      } else {
        const res = await updateBrokerageAccount(initial!.id, fd);
        if (res.ok) {
          setFeedback({ ok: true, msg: "Paramètres enregistrés." });
          router.refresh();
        } else {
          setFeedback({ ok: false, msg: res.error });
        }
      }
    });
  }

  function onDelete() {
    if (!initial) return;
    if (
      !confirm(
        `Supprimer définitivement le compte « ${initial.name} » ? Toutes les transactions associées seront perdues.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteBrokerageAccount(initial.id);
      if (res.ok) router.push("/academie/compte-titre");
      else setFeedback({ ok: false, msg: res.error });
    });
  }

  const initialCashNum = parseFloat((initialCash || "0").replace(",", ".")) || 0;

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Nom du compte
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mon compte BRVM"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            SGI / intermédiaire
          </label>
          <input
            type="text"
            value={broker}
            onChange={(e) => setBroker(e.target.value)}
            placeholder="BICIBourse, BNI Finances, SGI Hudson…"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Date d&apos;ouverture
          </label>
          <input
            type="date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Devise
          </label>
          <input
            type="text"
            value="XOF (FCFA)"
            disabled
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-slate-50 text-slate-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
            Cash initial déposé (FCFA)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={initialCash}
            onChange={(e) => setInitialCash(e.target.value)}
            placeholder="500000"
            disabled={mode === "edit"}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums disabled:bg-slate-50 disabled:text-slate-500"
          />
          {mode === "create" && initialCashNum > 0 && (
            <div className="text-[10px] text-slate-500 mt-1">
              Crée auto. la transaction « Dépôt initial » :{" "}
              <span className="font-semibold tabular-nums">
                {fmtFCFA(initialCashNum)} FCFA
              </span>
            </div>
          )}
          {mode === "edit" && (
            <div className="text-[10px] text-slate-400 mt-1">
              Non modifiable après création (utilisez une transaction de dépôt).
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <h3 className="text-xs font-semibold text-slate-700 uppercase mb-2">
          Frais de courtage SGI (paramétrables)
        </h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Appliqués automatiquement à chaque achat/vente. Frais BRVM, DC/BR et taux TPS
          sont gérés globalement par l&apos;administration.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Courtage SGI (%)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="20"
              value={feePct}
              onChange={(e) => setFeePct(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Courtage min (FCFA)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={feeMin}
              onChange={(e) => setFeeMin(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Pays UEMOA de la SGI
            </label>
            <select
              value={sgiCountry}
              onChange={(e) =>
                setSgiCountry(e.target.value as UemoaCountryCode | "")
              }
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
            >
              <option value="">— Sélectionner —</option>
              {UEMOA_COUNTRY_LIST.map((c) => (
                <option key={c} value={c}>
                  {UEMOA_COUNTRY_LABELS[c]}
                </option>
              ))}
            </select>
            {sgiCountry && (
              <div className="text-[10px] text-slate-500 mt-1">
                TPS applicable :{" "}
                <span className="font-semibold tabular-nums">
                  {(tpsRateForCountry * 100).toFixed(2).replace(".", ",")} %
                </span>{" "}
                <span className="text-slate-400">(sur courtage SGI)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <h3 className="text-xs font-semibold text-slate-700 uppercase">
              Frais SGI récurrents
            </h3>
            <p className="text-[11px] text-slate-500">
              Droit de garde, frais d&apos;abonnement, etc. Auto-déduits du cash espèce
              à chaque échéance.
            </p>
          </div>
          <button
            type="button"
            onClick={addRecurringFee}
            className="text-[11px] bg-white hover:bg-slate-50 text-slate-700 font-medium px-2 py-1 rounded border border-slate-300"
          >
            + Ajouter
          </button>
        </div>

        {recurringFees.length === 0 ? (
          <div className="text-[11px] text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded">
            Aucun frais récurrent. Cliquez « + Ajouter » si votre SGI en applique.
          </div>
        ) : (
          <div className="space-y-2">
            {recurringFees.map((rf, i) => (
              <div
                key={i}
                className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px_140px_auto] gap-2 items-center bg-slate-50 border border-slate-200 rounded p-2"
              >
                <input
                  type="text"
                  value={rf.label}
                  onChange={(e) => updateRecurringFee(i, { label: e.target.value })}
                  placeholder="Libellé (ex : Droit de garde)"
                  className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                />
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={rf.amount}
                  onChange={(e) =>
                    updateRecurringFee(i, { amount: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="Montant FCFA"
                  className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white tabular-nums"
                />
                <select
                  value={rf.frequency}
                  onChange={(e) =>
                    updateRecurringFee(i, {
                      frequency: e.target.value as RecurringFrequency,
                    })
                  }
                  className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={rf.startDate}
                  onChange={(e) => updateRecurringFee(i, { startDate: e.target.value })}
                  className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-white"
                />
                <button
                  type="button"
                  onClick={() => removeRecurringFee(i)}
                  className="text-[11px] text-rose-700 hover:underline px-1"
                >
                  Suppr.
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
          Notes (privées)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Stratégie, objectifs, mémo…"
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
        />
      </div>

      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        {mode === "edit" && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="text-sm bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium px-3 py-2 rounded border border-rose-200 disabled:opacity-50"
          >
            Supprimer le compte
          </button>
        )}
        <div className="ml-auto">
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-4 py-2 rounded disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : mode === "create" ? "Créer le compte" : "Mettre à jour"}
          </button>
        </div>
      </div>
    </div>
  );
}

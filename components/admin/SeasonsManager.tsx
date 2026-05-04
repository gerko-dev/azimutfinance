"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSeason, setSeasonStatus } from "@/lib/admin/actions";
import type { AdminSeason } from "@/lib/admin/types";
import { fmtDate, fmtFCFA } from "./format";

export default function SeasonsManager({ seasons }: { seasons: AdminSeason[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().slice(0, 10);
  });
  const [capital, setCapital] = useState(10_000_000);
  const [feePct, setFeePct] = useState(1);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) {
      setFeedback({ ok: false, msg: "Le nom est obligatoire." });
      return;
    }
    if (endsAt <= startsAt) {
      setFeedback({ ok: false, msg: "La date de fin doit être après la date de début." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res = await createSeason({
        name: name.trim(),
        startsAt,
        endsAt,
        initialCapital: capital,
        feePct: feePct / 100,
      });
      if (res.ok) {
        setFeedback({ ok: true, msg: "Saison créée." });
        setShowForm(false);
        setName("");
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function changeStatus(seasonId: string, status: "upcoming" | "active" | "ended") {
    startTransition(async () => {
      const res = await setSeasonStatus({ seasonId, status });
      if (res.ok) {
        setFeedback({ ok: true, msg: "Statut mis à jour." });
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div>
      {feedback && (
        <div
          className={`mb-3 text-xs px-3 py-2 rounded border ${
            feedback.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="flex justify-end mb-3">
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          {showForm ? "Fermer" : "+ Nouvelle saison"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Nom de la saison
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Saison 2 — Juillet/Août 2026"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                Date de début
              </label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                Date de fin
              </label>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                Capital initial (FCFA)
              </label>
              <input
                type="number"
                value={capital}
                step={1_000_000}
                min={100_000}
                onChange={(e) => setCapital(Math.max(0, Number(e.target.value) || 0))}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                Frais par transaction (%)
              </label>
              <input
                type="number"
                value={feePct}
                step={0.1}
                min={0}
                max={5}
                onChange={(e) => setFeePct(Math.max(0, Number(e.target.value) || 0))}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
              />
            </div>
          </div>
          <button
            onClick={submit}
            disabled={isPending}
            className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded disabled:opacity-50"
          >
            {isPending ? "Création…" : "Créer la saison"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pl-4 pr-2">Nom</th>
              <th className="text-left font-medium py-2 px-2">Période</th>
              <th className="text-right font-medium py-2 px-2">Capital</th>
              <th className="text-right font-medium py-2 px-2">Frais</th>
              <th className="text-left font-medium py-2 px-2">Statut</th>
              <th className="text-right font-medium py-2 pr-4 pl-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {seasons.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  Aucune saison créée.
                </td>
              </tr>
            ) : (
              seasons.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pl-4 pr-2 font-medium text-slate-900">{s.name}</td>
                  <td className="py-2 px-2 text-slate-700">
                    {fmtDate(s.starts_at)} → {fmtDate(s.ends_at)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-900">
                    {fmtFCFA(s.initial_capital)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                    {(s.transaction_fee_pct * 100).toFixed(2).replace(".", ",")} %
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                        s.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : s.status === "upcoming"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {s.status === "active"
                        ? "Active"
                        : s.status === "upcoming"
                        ? "À venir"
                        : "Terminée"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 pl-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      {s.status !== "active" && (
                        <button
                          onClick={() => changeStatus(s.id, "active")}
                          disabled={isPending}
                          className="text-[11px] text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          Activer
                        </button>
                      )}
                      {s.status !== "ended" && (
                        <button
                          onClick={() => changeStatus(s.id, "ended")}
                          disabled={isPending}
                          className="text-[11px] text-rose-700 hover:underline disabled:opacity-50"
                        >
                          Clôturer
                        </button>
                      )}
                      {s.status !== "upcoming" && (
                        <button
                          onClick={() => changeStatus(s.id, "upcoming")}
                          disabled={isPending}
                          className="text-[11px] text-slate-600 hover:underline disabled:opacity-50"
                        >
                          À venir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

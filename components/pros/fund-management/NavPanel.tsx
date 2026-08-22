"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import {
  deleteNavPointAction,
  importNavAction,
  upsertNavPointAction,
  type NavPointInput,
} from "@/app/pros/fund-management/nav-actions";
import type { NavPoint } from "@/app/pros/fund-management/nav-types";

const EMPTY_ROW: NavPointInput = { date: "", vl: "", parts: "", actifNet: "", actifBrut: "" };
const navInput =
  "w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-blue-500";

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

type Metric = "vl" | "actifNet";

export default function NavPanel({
  fundId,
  initialHistory = [],
}: {
  fundId: string;
  initialHistory?: NavPoint[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("vl");
  const [importing, startImport] = useTransition();

  // Édition manuelle des points de VL.
  const [editingDate, setEditingDate] = useState<string | null>(null); // date en cours d'édition
  const [adding, setAdding] = useState(false);
  const [rowForm, setRowForm] = useState<NavPointInput>(EMPTY_ROW);
  const [rowError, setRowError] = useState<string | null>(null);
  const [savingRow, startRow] = useTransition();

  const openAdd = () => {
    setAdding(true);
    setEditingDate(null);
    setRowForm({ ...EMPTY_ROW, date: new Date().toISOString().slice(0, 10) });
    setRowError(null);
  };
  const openEdit = (p: NavPoint) => {
    setEditingDate(p.date);
    setAdding(false);
    setRowForm({
      date: p.date,
      vl: p.vl != null ? String(p.vl) : "",
      parts: p.parts != null ? String(p.parts) : "",
      actifNet: p.actifNet != null ? String(p.actifNet) : "",
      actifBrut: p.actifBrut != null ? String(p.actifBrut) : "",
    });
    setRowError(null);
  };
  const cancelRow = () => {
    setEditingDate(null);
    setAdding(false);
    setRowError(null);
  };
  const saveRow = () => {
    setRowError(null);
    startRow(async () => {
      const res = await upsertNavPointAction(fundId, rowForm);
      if (!res.ok) {
        setRowError(res.error);
        return;
      }
      cancelRow();
      router.refresh();
    });
  };
  const deleteRow = (date: string) => {
    startRow(async () => {
      const res = await deleteNavPointAction(fundId, date);
      if (res.ok) router.refresh();
    });
  };

  const history = initialHistory;
  const last = history.length ? history[history.length - 1] : null;
  const first = history.length ? history[0] : null;

  // Performance sur la période chargée (première vs dernière VL).
  const perf = useMemo(() => {
    if (!first?.vl || !last?.vl) return null;
    return (last.vl / first.vl - 1) * 100;
  }, [first, last]);

  const chartData = useMemo(
    () => history.map((p) => ({ date: p.date, value: metric === "vl" ? p.vl : p.actifNet })),
    [history, metric],
  );

  const handleImport = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Sélectionne d'abord un fichier .xlsx.");
      return;
    }
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.append("file", file);
    startImport(async () => {
      const res = await importNavAction(fundId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo(`${res.data.imported} points importés (${res.data.minDate} → ${res.data.maxDate}).`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  };

  // Tableau : les points les plus récents en premier.
  const recent = useMemo(() => [...history].reverse().slice(0, 60), [history]);

  return (
    <div className="space-y-5">
      {/* Import */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">
          Importer l&apos;historique de valeur liquidative
        </h3>
        <p className="text-[11px] text-slate-500 mb-3">
          Fichier Excel : Date · Valeur Liquidative · Nombre de Parts · Actif Net · Actif Brut.
          L&apos;import est additif : les nouvelles dates sont ajoutées, les dates déjà présentes
          sont mises à jour.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="text-[12px] text-slate-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-slate-700 file:text-slate-200 file:text-sm hover:file:bg-slate-600"
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 text-sm font-medium rounded-md border border-blue-500/50 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition disabled:opacity-50"
          >
            {importing ? "Import…" : "Importer"}
          </button>
          {error && <span className="text-[12px] text-red-400">{error}</span>}
          {info && <span className="text-[12px] text-emerald-400">✓ {info}</span>}
        </div>
      </section>

      {history.length > 0 && (
        <>
          {/* Synthèse */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Fact label="Dernière VL" value={fmt(last?.vl, 2)} sub={last?.date} />
            <Fact label="Actif net" value={fmt(last?.actifNet, 0)} sub={last?.date} />
            <Fact label="Nombre de parts" value={fmt(last?.parts, 2)} sub={last?.date} />
            <Fact
              label="Perf. période"
              value={perf == null ? "—" : `${perf > 0 ? "+" : ""}${fmt(perf, 2)} %`}
              sub={first ? `depuis ${first.date}` : undefined}
              tone={perf == null ? undefined : perf >= 0 ? "up" : "down"}
            />
          </section>

          {/* Graphique */}
          <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Évolution ({history.length} points)
              </h3>
              <div className="flex gap-1">
                {(["vl", "actifNet"] as Metric[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetric(m)}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition ${
                      metric === m
                        ? "bg-blue-600/20 text-blue-300 border border-blue-500/40"
                        : "text-slate-400 hover:text-slate-200 border border-transparent"
                    }`}
                  >
                    {m === "vl" ? "Valeur liquidative" : "Actif net"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ width: "100%", height: 288 }}>
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    minTickGap={40}
                    tickFormatter={(d: string) => d.slice(0, 7)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={70}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => fmt(v, 0)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#94a3b8" }}
                    formatter={((v: number | string) => [
                      fmt(typeof v === "number" ? v : Number(v), metric === "vl" ? 2 : 0),
                      metric === "vl" ? "VL" : "Actif net",
                    ]) as never}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#60a5fa"
                    strokeWidth={1.5}
                    fill="url(#navFill)"
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

        </>
      )}

      {/* Tableau des points : ajout / modification / suppression manuels */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            {history.length > 0 ? "Derniers points" : "Valeurs liquidatives"}
          </h3>
          <button
            type="button"
            onClick={openAdd}
            className="px-2.5 py-1 text-[11px] rounded-md border border-blue-500/50 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition"
          >
            + Ajouter une ligne
          </button>
        </div>
        {rowError && <p className="px-4 py-2 text-[12px] text-red-400">{rowError}</p>}
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900/80">
              <tr className="text-[10px] text-slate-500 border-b border-slate-800">
                <th className="px-3 py-1.5 text-left font-medium">Date</th>
                <th className="px-3 py-1.5 text-right font-medium">VL</th>
                <th className="px-3 py-1.5 text-right font-medium">Nombre de parts</th>
                <th className="px-3 py-1.5 text-right font-medium">Actif net</th>
                <th className="px-3 py-1.5 text-right font-medium">Actif brut</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {adding && (
                <NavEditRow
                  form={rowForm}
                  setForm={setRowForm}
                  onSave={saveRow}
                  onCancel={cancelRow}
                  pending={savingRow}
                  dateEditable
                />
              )}
              {history.length === 0 && !adding && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[12px] text-slate-500">
                    Aucun historique. Importe un fichier ou ajoute une ligne.
                  </td>
                </tr>
              )}
              {recent.map((p) =>
                editingDate === p.date ? (
                  <NavEditRow
                    key={p.date}
                    form={rowForm}
                    setForm={setRowForm}
                    onSave={saveRow}
                    onCancel={cancelRow}
                    pending={savingRow}
                  />
                ) : (
                  <tr key={p.date} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-3 py-2 text-slate-300">{p.date}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-200">{fmt(p.vl, 2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{fmt(p.parts, 2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">{fmt(p.actifNet, 0)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">{fmt(p.actifBrut, 0)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="text-[11px] text-blue-300 hover:text-blue-200 transition mr-3"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRow(p.date)}
                        disabled={savingRow}
                        className="text-[11px] text-red-400 hover:text-red-300 transition disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {history.length > 60 && (
          <p className="px-4 py-2 text-[10px] text-slate-600">
            Les 60 points les plus récents sont affichés ({history.length} au total).
          </p>
        )}
      </section>
    </div>
  );
}

// Ligne éditable (ajout ou modification) d'un point de VL.
function NavEditRow({
  form,
  setForm,
  onSave,
  onCancel,
  pending,
  dateEditable = false,
}: {
  form: NavPointInput;
  setForm: (f: NavPointInput) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  dateEditable?: boolean;
}) {
  const set = (k: keyof NavPointInput, v: string) => setForm({ ...form, [k]: v });
  return (
    <tr className="border-b border-slate-800 bg-blue-500/5">
      <td className="px-3 py-1.5">
        {dateEditable ? (
          <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={navInput} />
        ) : (
          <span className="text-slate-300">{form.date}</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <input inputMode="decimal" value={form.vl} onChange={(e) => set("vl", e.target.value)} className={`${navInput} text-right`} />
      </td>
      <td className="px-2 py-1.5">
        <input inputMode="decimal" value={form.parts} onChange={(e) => set("parts", e.target.value)} className={`${navInput} text-right`} />
      </td>
      <td className="px-2 py-1.5">
        <input inputMode="decimal" value={form.actifNet} onChange={(e) => set("actifNet", e.target.value)} className={`${navInput} text-right`} />
      </td>
      <td className="px-2 py-1.5">
        <input inputMode="decimal" value={form.actifBrut} onChange={(e) => set("actifBrut", e.target.value)} className={`${navInput} text-right`} />
      </td>
      <td className="px-3 py-1.5 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="text-[11px] text-emerald-300 hover:text-emerald-200 transition mr-3 disabled:opacity-50"
        >
          {pending ? "…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-[11px] text-slate-400 hover:text-slate-200 transition"
        >
          Annuler
        </button>
      </td>
    </tr>
  );
}

function Fact({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down";
}) {
  const color = tone === "up" ? "text-emerald-400" : tone === "down" ? "text-red-400" : "text-slate-200";
  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-sm font-mono mt-0.5 ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}

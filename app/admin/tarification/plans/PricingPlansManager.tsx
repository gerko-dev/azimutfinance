"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PricingPlanRow } from "@/lib/admin/types";
import {
  upsertPricingPlanAction,
  togglePricingPlanAction,
  deletePricingPlanAction,
} from "../actions";

type FormState = {
  code: string;
  label: string;
  duration_label: string;
  duration_months: string;
  price_fcfa: string;
  discount_pct: string;
  tagline: string;
  highlight: boolean;
  active: boolean;
  sort_order: string;
};

const EMPTY: FormState = {
  code: "",
  label: "",
  duration_label: "",
  duration_months: "1",
  price_fcfa: "0",
  discount_pct: "0",
  tagline: "",
  highlight: false,
  active: true,
  sort_order: "0",
};

function rowToForm(r: PricingPlanRow): FormState {
  return {
    code: r.code,
    label: r.label,
    duration_label: r.duration_label,
    duration_months: String(r.duration_months),
    price_fcfa: String(r.price_fcfa),
    discount_pct: String(r.discount_pct),
    tagline: r.tagline ?? "",
    highlight: r.highlight,
    active: r.active,
    sort_order: String(r.sort_order),
  };
}

export default function PricingPlansManager({
  plans,
}: {
  plans: PricingPlanRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function startNew() {
    setForm(EMPTY);
    setEditing("new");
    setFeedback(null);
  }
  function startEdit(p: PricingPlanRow) {
    setForm(rowToForm(p));
    setEditing(p.code);
    setFeedback(null);
  }
  function cancel() {
    setEditing(null);
    setForm(EMPTY);
  }

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === "boolean") {
          if (v) fd.set(k, "on");
        } else {
          fd.set(k, v);
        }
      }
      const res = await upsertPricingPlanAction(fd);
      if (res.ok) {
        setFeedback({ ok: true, msg: "Plan enregistré." });
        cancel();
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function toggle(code: string, active: boolean) {
    startTransition(async () => {
      const res = await togglePricingPlanAction(code, active);
      if (res.ok) {
        setFeedback({
          ok: true,
          msg: active ? "Plan activé." : "Plan désactivé.",
        });
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function remove(code: string) {
    if (!confirm(`Supprimer définitivement le plan « ${code} » ?`)) return;
    startTransition(async () => {
      const res = await deletePricingPlanAction(code);
      if (res.ok) {
        setFeedback({ ok: true, msg: "Plan supprimé." });
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="space-y-4">
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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={startNew}
          disabled={pending || editing !== null}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
        >
          + Nouveau plan
        </button>
      </div>

      {editing && (
        <div className="bg-white border border-slate-300 rounded-lg p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            {editing === "new" ? "Créer un plan" : `Modifier le plan ${editing}`}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Code (m1, m6, y1…)">
              <input
                type="text"
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toLowerCase() })
                }
                disabled={editing !== "new"}
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 disabled:bg-slate-100"
                placeholder="m1"
              />
            </Field>
            <Field label="Libellé">
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                placeholder="Mensuel"
              />
            </Field>
            <Field label="Libellé de durée">
              <input
                type="text"
                value={form.duration_label}
                onChange={(e) =>
                  setForm({ ...form, duration_label: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                placeholder="1 mois"
              />
            </Field>
            <Field label="Durée en mois">
              <input
                type="number"
                min={1}
                value={form.duration_months}
                onChange={(e) =>
                  setForm({ ...form, duration_months: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
            <Field label="Prix (FCFA)">
              <input
                type="number"
                min={0}
                value={form.price_fcfa}
                onChange={(e) =>
                  setForm({ ...form, price_fcfa: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
            <Field label="Réduction affichée (%)">
              <input
                type="number"
                min={0}
                max={100}
                value={form.discount_pct}
                onChange={(e) =>
                  setForm({ ...form, discount_pct: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
            <Field label="Ordre d'affichage" className="md:col-span-1">
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm({ ...form, sort_order: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
            <Field label="Tagline (sous-titre carte)" className="md:col-span-2">
              <input
                type="text"
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                placeholder="Économisez 19 989 FCFA"
              />
            </Field>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />
                Actif
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.highlight}
                  onChange={(e) =>
                    setForm({ ...form, highlight: e.target.checked })
                  }
                />
                Mis en avant (« Meilleur prix »)
              </label>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="px-4 py-2 rounded-md text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="px-4 py-2 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Libellé</th>
              <th className="px-3 py-2 font-semibold">Durée</th>
              <th className="px-3 py-2 font-semibold text-right">Prix</th>
              <th className="px-3 py-2 font-semibold text-right">Réduc.</th>
              <th className="px-3 py-2 font-semibold">Statut</th>
              <th className="px-3 py-2 font-semibold w-px">Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-xs text-slate-400"
                >
                  Aucun plan défini.
                </td>
              </tr>
            )}
            {plans.map((p) => (
              <tr key={p.code} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-3 py-2">
                  <div className="text-sm font-medium text-slate-900">
                    {p.label}
                  </div>
                  {p.highlight && (
                    <div className="text-[10px] uppercase font-semibold text-amber-700 mt-0.5">
                      ★ Mis en avant
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {p.duration_label}
                  <div className="text-[10px] text-slate-400">
                    {p.duration_months} mois
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {p.price_fcfa.toLocaleString("fr-FR")}{" "}
                  <span className="text-[10px] text-slate-500">FCFA</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">
                  {p.discount_pct > 0 ? `−${p.discount_pct}%` : "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                      p.active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {p.active ? "Actif" : "Inactif"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      disabled={pending || editing !== null}
                      className="px-2 py-1 text-[11px] rounded bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(p.code, !p.active)}
                      disabled={pending}
                      className="px-2 py-1 text-[11px] rounded bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                    >
                      {p.active ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.code)}
                      disabled={pending}
                      className="px-2 py-1 text-[11px] rounded bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-50"
                    >
                      Suppr.
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

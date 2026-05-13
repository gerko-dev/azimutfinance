"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  PricingPlanRow,
  PromoCodeRow,
  PromoDiscountType,
} from "@/lib/admin/types";
import {
  upsertPromoCodeAction,
  togglePromoCodeAction,
  deletePromoCodeAction,
} from "../actions";

type FormState = {
  id: string;
  code: string;
  description: string;
  discount_type: PromoDiscountType;
  discount_value: string;
  applicable_plans: string;
  valid_from: string;
  valid_until: string;
  max_uses: string;
  max_uses_per_user: string;
  active: boolean;
};

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY: FormState = {
  id: "",
  code: "",
  description: "",
  discount_type: "percent",
  discount_value: "10",
  applicable_plans: "",
  valid_from: "",
  valid_until: "",
  max_uses: "",
  max_uses_per_user: "1",
  active: true,
};

function rowToForm(r: PromoCodeRow): FormState {
  return {
    id: r.id,
    code: r.code,
    description: r.description ?? "",
    discount_type: r.discount_type,
    discount_value: String(r.discount_value),
    applicable_plans: r.applicable_plans ? r.applicable_plans.join(", ") : "",
    valid_from: isoToLocalInput(r.valid_from),
    valid_until: isoToLocalInput(r.valid_until),
    max_uses: r.max_uses === null ? "" : String(r.max_uses),
    max_uses_per_user: String(r.max_uses_per_user),
    active: r.active,
  };
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export default function PromoCodesManager({
  promos,
  allPlans,
}: {
  promos: PromoCodeRow[];
  allPlans: PricingPlanRow[];
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
  function startEdit(p: PromoCodeRow) {
    setForm(rowToForm(p));
    setEditing(p.id);
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
      const res = await upsertPromoCodeAction(fd);
      if (res.ok) {
        setFeedback({ ok: true, msg: "Code enregistré." });
        cancel();
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      const res = await togglePromoCodeAction(id, active);
      if (res.ok) {
        setFeedback({
          ok: true,
          msg: active ? "Code activé." : "Code désactivé.",
        });
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function remove(id: string, code: string) {
    if (!confirm(`Supprimer définitivement le code « ${code} » ?`)) return;
    startTransition(async () => {
      const res = await deletePromoCodeAction(id);
      if (res.ok) {
        setFeedback({ ok: true, msg: "Code supprimé." });
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
          + Nouveau code
        </button>
      </div>

      {editing && (
        <div className="bg-white border border-slate-300 rounded-lg p-4 md:p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            {editing === "new" ? "Créer un code promo" : "Modifier le code"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Code (en majuscules, sans espace)">
              <input
                type="text"
                value={form.code}
                onChange={(e) =>
                  setForm({
                    ...form,
                    code: e.target.value.toUpperCase().replace(/\s+/g, ""),
                  })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 font-mono"
                placeholder="BIENVENUE10"
              />
            </Field>
            <Field label="Type de réduction">
              <select
                value={form.discount_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discount_type: e.target.value as PromoDiscountType,
                  })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              >
                <option value="percent">Pourcentage (%)</option>
                <option value="fixed">Montant fixe (FCFA)</option>
              </select>
            </Field>
            <Field
              label={
                form.discount_type === "percent"
                  ? "Valeur (% — 0..100)"
                  : "Valeur (FCFA)"
              }
            >
              <input
                type="number"
                min={0}
                max={form.discount_type === "percent" ? 100 : undefined}
                value={form.discount_value}
                onChange={(e) =>
                  setForm({ ...form, discount_value: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
            <Field label="Plans concernés (vide = tous)">
              <input
                type="text"
                value={form.applicable_plans}
                onChange={(e) =>
                  setForm({ ...form, applicable_plans: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 font-mono"
                placeholder={`Codes plans, ex : ${allPlans
                  .slice(0, 2)
                  .map((p) => p.code)
                  .join(", ")}`}
              />
            </Field>
            <Field label="Description (interne)" className="md:col-span-2">
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                placeholder="Campagne Black Friday 2026"
              />
            </Field>
            <Field label="Valide à partir de">
              <input
                type="datetime-local"
                value={form.valid_from}
                onChange={(e) =>
                  setForm({ ...form, valid_from: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
            <Field label="Valide jusqu'au (vide = sans fin)">
              <input
                type="datetime-local"
                value={form.valid_until}
                onChange={(e) =>
                  setForm({ ...form, valid_until: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
            <Field label="Usages max total (vide = illimité)">
              <input
                type="number"
                min={1}
                value={form.max_uses}
                onChange={(e) =>
                  setForm({ ...form, max_uses: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
            <Field label="Usages max par utilisateur">
              <input
                type="number"
                min={1}
                value={form.max_uses_per_user}
                onChange={(e) =>
                  setForm({ ...form, max_uses_per_user: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
            <div className="md:col-span-2 flex items-center gap-4">
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

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Réduction</th>
              <th className="px-3 py-2 font-semibold">Plans</th>
              <th className="px-3 py-2 font-semibold">Validité</th>
              <th className="px-3 py-2 font-semibold text-right">Usages</th>
              <th className="px-3 py-2 font-semibold">Statut</th>
              <th className="px-3 py-2 font-semibold w-px">Actions</th>
            </tr>
          </thead>
          <tbody>
            {promos.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-xs text-slate-400"
                >
                  Aucun code promo défini.
                </td>
              </tr>
            )}
            {promos.map((p) => {
              const expired = isExpired(p.valid_until);
              return (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-mono text-sm font-semibold text-slate-900">
                      {p.code}
                    </div>
                    {p.description && (
                      <div className="text-[10px] text-slate-500 mt-0.5 max-w-xs truncate">
                        {p.description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {p.discount_type === "percent"
                      ? `${p.discount_value} %`
                      : `${p.discount_value.toLocaleString("fr-FR")} FCFA`}
                  </td>
                  <td className="px-3 py-2 text-[11px] font-mono text-slate-700">
                    {p.applicable_plans?.join(", ") ?? "Tous"}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-600">
                    <div>du {fmtDateTime(p.valid_from)}</div>
                    <div>
                      au{" "}
                      <span
                        className={expired ? "text-rose-600 font-medium" : ""}
                      >
                        {p.valid_until ? fmtDateTime(p.valid_until) : "∞"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {p.current_uses}
                    {p.max_uses !== null && ` / ${p.max_uses}`}
                    <div className="text-[10px] text-slate-400">
                      {p.max_uses_per_user}/user
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                        !p.active
                          ? "bg-slate-200 text-slate-600"
                          : expired
                            ? "bg-rose-100 text-rose-700"
                            : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {!p.active ? "Inactif" : expired ? "Expiré" : "Actif"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
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
                        onClick={() => toggle(p.id, !p.active)}
                        disabled={pending}
                        className="px-2 py-1 text-[11px] rounded bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                      >
                        {p.active ? "Désactiver" : "Activer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p.id, p.code)}
                        disabled={pending}
                        className="px-2 py-1 text-[11px] rounded bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Suppr.
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
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

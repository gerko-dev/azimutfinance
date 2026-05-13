"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TrialConfigRow, UserTrialWithProfile } from "@/lib/admin/types";
import {
  upsertTrialConfigAction,
  grantTrialToUserAction,
  revokeTrialAction,
} from "../actions";

type ConfigFormState = {
  id: string;
  name: string;
  duration_days: string;
  auto_grant_on_signup: boolean;
  active: boolean;
  description: string;
};

const EMPTY_CONFIG: ConfigFormState = {
  id: "",
  name: "",
  duration_days: "7",
  auto_grant_on_signup: false,
  active: true,
  description: "",
};

function configToForm(c: TrialConfigRow): ConfigFormState {
  return {
    id: c.id,
    name: c.name,
    duration_days: String(c.duration_days),
    auto_grant_on_signup: c.auto_grant_on_signup,
    active: c.active,
    description: c.description ?? "",
  };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function trialIsActive(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() > Date.now();
}

export default function TrialManager({
  configs,
  users,
}: {
  configs: TrialConfigRow[];
  users: UserTrialWithProfile[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<ConfigFormState>(EMPTY_CONFIG);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const [grantUserId, setGrantUserId] = useState("");
  const [grantConfigId, setGrantConfigId] = useState(configs[0]?.id ?? "");

  function startNew() {
    setForm(EMPTY_CONFIG);
    setEditing("new");
    setFeedback(null);
  }
  function startEdit(c: TrialConfigRow) {
    setForm(configToForm(c));
    setEditing(c.id);
    setFeedback(null);
  }
  function cancel() {
    setEditing(null);
    setForm(EMPTY_CONFIG);
  }

  function submitConfig() {
    startTransition(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === "boolean") {
          if (v) fd.set(k, "on");
        } else {
          fd.set(k, v);
        }
      }
      const res = await upsertTrialConfigAction(fd);
      if (res.ok) {
        setFeedback({ ok: true, msg: "Configuration enregistrée." });
        cancel();
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function grant() {
    if (!grantUserId.trim() || !grantConfigId) {
      setFeedback({
        ok: false,
        msg: "Identifiant utilisateur et config requis.",
      });
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("user_id", grantUserId.trim());
      fd.set("trial_config_id", grantConfigId);
      const res = await grantTrialToUserAction(fd);
      if (res.ok) {
        setFeedback({ ok: true, msg: "Essai accordé." });
        setGrantUserId("");
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function revoke(userId: string, label: string) {
    if (!confirm(`Révoquer l'essai gratuit de ${label} ?`)) return;
    startTransition(async () => {
      const res = await revokeTrialAction(userId);
      if (res.ok) {
        setFeedback({ ok: true, msg: "Essai révoqué." });
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="space-y-6">
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

      {/* SECTION 1 — Configs */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Configurations d&apos;essai
          </h2>
          <button
            type="button"
            onClick={startNew}
            disabled={pending || editing !== null}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
          >
            + Nouvelle config
          </button>
        </div>

        {editing && (
          <div className="px-4 py-4 border-b border-slate-200 bg-amber-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nom (interne, lowercase)">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value.toLowerCase() })
                  }
                  className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                  placeholder="default"
                />
              </Field>
              <Field label="Durée (jours)">
                <input
                  type="number"
                  min={1}
                  value={form.duration_days}
                  onChange={(e) =>
                    setForm({ ...form, duration_days: e.target.value })
                  }
                  className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                />
              </Field>
              <Field label="Description" className="md:col-span-2">
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
                />
              </Field>
              <div className="md:col-span-2 flex flex-wrap items-center gap-4">
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
                    checked={form.auto_grant_on_signup}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        auto_grant_on_signup: e.target.checked,
                      })
                    }
                  />
                  Attribuer automatiquement à chaque inscription
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={submitConfig}
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

        {configs.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            Aucune configuration d&apos;essai.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Nom</th>
                <th className="px-3 py-2 font-semibold text-right">Durée</th>
                <th className="px-3 py-2 font-semibold">Auto signup</th>
                <th className="px-3 py-2 font-semibold">Statut</th>
                <th className="px-3 py-2 font-semibold w-px">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{c.name}</div>
                    {c.description && (
                      <div className="text-[10px] text-slate-500 mt-0.5 max-w-md truncate">
                        {c.description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">
                    {c.duration_days} j
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {c.auto_grant_on_signup ? (
                      <span className="text-[10px] uppercase font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                        Oui
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">Non</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                        c.active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {c.active ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      disabled={pending || editing !== null}
                      className="px-2 py-1 text-[11px] rounded bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* SECTION 2 — Octroi manuel */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 md:p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Accorder un essai manuellement
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Saisis l&apos;UUID de l&apos;utilisateur (disponible dans{" "}
          <code>/admin/membres</code>) et choisis la config d&apos;essai à
          appliquer.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px_auto] gap-3 items-end">
          <Field label="User ID (UUID)">
            <input
              type="text"
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 font-mono"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </Field>
          <Field label="Config">
            <select
              value={grantConfigId}
              onChange={(e) => setGrantConfigId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
            >
              {configs
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.duration_days} j)
                  </option>
                ))}
              {configs.filter((c) => c.active).length === 0 && (
                <option value="">Aucune config active</option>
              )}
            </select>
          </Field>
          <button
            type="button"
            onClick={grant}
            disabled={pending || !grantConfigId}
            className="px-4 py-2 rounded-md text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "…" : "Accorder"}
          </button>
        </div>
      </section>

      {/* SECTION 3 — Liste des utilisateurs */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Utilisateurs ayant un essai ({users.length})
          </h2>
        </div>
        {users.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-400">
            Aucun essai gratuit n&apos;a encore été attribué.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Utilisateur</th>
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 font-semibold">Accordé le</th>
                <th className="px-3 py-2 font-semibold">Expire le</th>
                <th className="px-3 py-2 font-semibold">Statut</th>
                <th className="px-3 py-2 font-semibold w-px">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const label =
                  u.full_name || u.username || u.email || u.user_id.slice(0, 8);
                const active = trialIsActive(u.expires_at);
                return (
                  <tr key={u.user_id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-slate-900">
                        {label}
                      </div>
                      {u.email && (
                        <div className="text-[10px] text-slate-500">
                          {u.email}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {u.source === "signup" ? "Inscription" : "Admin"}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-600">
                      {fmtDate(u.granted_at)}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-600">
                      {fmtDate(u.expires_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                          active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {active ? "En cours" : "Expiré"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => revoke(u.user_id, label)}
                        disabled={pending}
                        className="px-2 py-1 text-[11px] rounded bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Révoquer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
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

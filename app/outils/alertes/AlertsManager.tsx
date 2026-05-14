"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Alert, AlertTriggerWithAlert, AlertType } from "@/lib/alerts/types";
import {
  ALERT_TYPE_DESCRIPTION,
  ALERT_TYPE_LABEL,
  describeAlert,
} from "@/lib/alerts/types";
import {
  deleteAlertAction,
  markAllAlertsReadAction,
  snoozeAlertAction,
  toggleAlertAction,
  upsertAlertAction,
} from "@/lib/alerts/actions";
import type { TargetOptionsByType } from "@/lib/watchlists/targetOptions";

const TARGET_TYPES = ["stock", "bond", "index", "currency", "commodity", "any"] as const;
const TARGET_TYPE_LABEL: Record<(typeof TARGET_TYPES)[number], string> = {
  stock: "Action",
  bond: "Obligation",
  index: "Indice",
  currency: "Devise",
  commodity: "Matière première",
  any: "Tout",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AlertsManager({
  alerts,
  triggers,
  targetOptions,
}: {
  alerts: Alert[];
  triggers: AlertTriggerWithAlert[];
  targetOptions: TargetOptionsByType;
}) {
  const [editing, setEditing] = useState<Alert | "new" | null>(null);
  const router = useRouter();
  const [pendingMark, startMarkTransition] = useTransition();

  function markAllRead() {
    startMarkTransition(async () => {
      await markAllAlertsReadAction();
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Mes alertes ({alerts.length})
          </h2>
          <button
            type="button"
            onClick={() => setEditing("new")}
            disabled={editing !== null}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
          >
            + Nouvelle alerte
          </button>
        </div>

        {editing && (
          <AlertForm
            initial={editing === "new" ? null : editing}
            targetOptions={targetOptions}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}

        {alerts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
            Aucune alerte configurée. Cliquez sur « + Nouvelle alerte » pour
            démarrer.
          </div>
        ) : (
          <ul className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {alerts.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                onEdit={() => setEditing(a)}
                onChanged={() => router.refresh()}
              />
            ))}
          </ul>
        )}
      </div>

      <aside className="space-y-3">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">
              Déclenchements récents
            </span>
            {triggers.some((t) => !t.read_at) && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={pendingMark}
                className="text-[11px] text-blue-700 hover:underline disabled:opacity-50"
              >
                Tout marquer lu
              </button>
            )}
          </div>
          {triggers.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-400">
              Aucun déclenchement pour le moment.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {triggers.map((t) => (
                <li
                  key={t.id}
                  className={`px-3 py-2.5 ${t.read_at ? "" : "bg-blue-50/40"}`}
                >
                  <div className="text-xs font-semibold text-slate-900 line-clamp-1">
                    {t.alert_name}
                  </div>
                  <div className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                    {t.message ?? "—"}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {fmtDateTime(t.triggered_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function AlertRow({
  alert,
  onEdit,
  onChanged,
}: {
  alert: Alert;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await toggleAlertAction(alert.id, !alert.active);
      if (res.ok) onChanged();
      else setError(res.error);
    });
  }
  function snooze() {
    setError(null);
    startTransition(async () => {
      const res = await snoozeAlertAction(alert.id, 24);
      if (res.ok) onChanged();
      else setError(res.error);
    });
  }
  function remove() {
    if (!confirm(`Supprimer l'alerte « ${alert.name} » ?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAlertAction(alert.id);
      if (res.ok) onChanged();
      else setError(res.error);
    });
  }

  const snoozeActive =
    alert.snooze_until && new Date(alert.snooze_until).getTime() > Date.now();

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-semibold text-slate-900">
              {alert.name}
            </span>
            {!alert.active && (
              <span className="text-[10px] uppercase font-semibold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                Inactive
              </span>
            )}
            {snoozeActive && (
              <span className="text-[10px] uppercase font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                Snooze
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600">
            {ALERT_TYPE_LABEL[alert.alert_type as AlertType]} — {describeAlert(alert)}
          </div>
          {alert.last_triggered_at && (
            <div className="text-[10px] text-slate-400 mt-0.5">
              Dernier déclenchement : {fmtDateTime(alert.last_triggered_at)}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="text-[11px] text-slate-500 hover:text-slate-900 underline"
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className="text-[11px] text-slate-500 hover:text-slate-900 underline"
          >
            {alert.active ? "Désactiver" : "Activer"}
          </button>
          {alert.active && !snoozeActive && (
            <button
              type="button"
              onClick={snooze}
              disabled={pending}
              className="text-[11px] text-slate-500 hover:text-slate-900 underline"
            >
              Snooze 24h
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="text-[11px] text-rose-600 hover:text-rose-800 underline"
          >
            Supprimer
          </button>
        </div>
      </div>
      {error && <div className="text-[11px] text-rose-700 mt-2">{error}</div>}
    </li>
  );
}

function AlertForm({
  initial,
  targetOptions,
  onCancel,
  onSaved,
}: {
  initial: Alert | null;
  targetOptions: TargetOptionsByType;
  onCancel: () => void;
  onSaved: () => void;
}) {
  type AlertParamsView = {
    direction?: string;
    price?: number;
    threshold_pct?: number;
    days_before?: number;
    include_coupons?: boolean;
    value?: number;
    note?: string;
    remind_at?: string;
  };

  const initialParams: AlertParamsView =
    (initial?.params as AlertParamsView | undefined) ?? {};

  const [name, setName] = useState(initial?.name ?? "");
  const [alertType, setAlertType] = useState<AlertType>(
    (initial?.alert_type as AlertType) ?? "price_threshold",
  );
  const [targetType, setTargetType] = useState<string>(
    initial?.target_type ?? "stock",
  );
  const [targetCode, setTargetCode] = useState<string>(
    initial?.target_code ?? "",
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [params, setParams] = useState<AlertParamsView>(initialParams);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Options de cible pour le type courant. Pour 'any', pas de liste : tout est permis (sert pour news_mention avec *).
  const currentOptions = useMemo(() => {
    if (targetType === "any") return [];
    return targetOptions[targetType as keyof TargetOptionsByType] ?? [];
  }, [targetType, targetOptions]);

  const validValues = useMemo(
    () => new Set(currentOptions.map((o) => o.value)),
    [currentOptions],
  );

  // Validation client : 'custom' et 'any/*' bypassent la liste
  const codeAcceptedAsAny =
    targetType === "any" && (targetCode === "*" || targetCode === "");
  const isCustom = alertType === "custom";
  const codeMatchesList =
    targetCode !== "" && validValues.has(targetCode);
  const codeIsValid =
    isCustom || codeAcceptedAsAny || codeMatchesList;
  const showCodeError =
    !isCustom && !codeAcceptedAsAny && targetCode !== "" && !codeMatchesList;

  // Quand le type de cible change, on remet le code à zéro (sauf en édition initiale)
  function handleTargetTypeChange(next: string) {
    setTargetType(next);
    setTargetCode("");
  }

  function handleTargetCodeChange(raw: string) {
    const trimmed = raw.replace(/\s+/g, "");
    // Commodity utilise des slugs minuscules ; le reste est en majuscules
    if (targetType === "commodity") {
      setTargetCode(trimmed.toLowerCase());
    } else {
      setTargetCode(trimmed.toUpperCase());
    }
  }

  function submit() {
    setError(null);
    const fd = new FormData();
    if (initial) fd.set("id", initial.id);
    fd.set("name", name);
    fd.set("alert_type", alertType);
    fd.set("target_type", targetType);
    fd.set("target_code", targetCode);
    if (active) fd.set("active", "on");

    // Params spécifiques au type
    if (alertType === "price_threshold") {
      fd.set("direction", params.direction ?? "above");
      fd.set("price", String(params.price ?? ""));
    } else if (alertType === "daily_pct_change") {
      fd.set("direction", params.direction ?? "either");
      fd.set("threshold_pct", String(params.threshold_pct ?? ""));
    } else if (alertType === "bond_maturity_approach") {
      fd.set("days_before", String(params.days_before ?? 30));
      if (params.include_coupons) fd.set("include_coupons", "on");
    } else if (alertType === "index_threshold" || alertType === "fx_threshold") {
      fd.set("direction", params.direction ?? "above");
      fd.set("value", String(params.value ?? ""));
    } else if (alertType === "custom") {
      fd.set("note", params.note ?? "");
      if (params.remind_at) fd.set("remind_at", params.remind_at);
    }

    startTransition(async () => {
      const res = await upsertAlertAction(fd);
      if (res.ok) onSaved();
      else setError(res.error);
    });
  }

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-4 md:p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        {initial ? "Modifier l'alerte" : "Nouvelle alerte"}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nom" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Ex: SNTS au-dessus de 30 000"
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
          />
        </Field>

        <Field label="Type d'alerte" required>
          <select
            value={alertType}
            onChange={(e) => setAlertType(e.target.value as AlertType)}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          >
            {(Object.keys(ALERT_TYPE_LABEL) as AlertType[]).map((t) => (
              <option key={t} value={t}>
                {ALERT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2 text-[11px] text-slate-500 -mt-1">
          {ALERT_TYPE_DESCRIPTION[alertType]}
        </div>

        <Field label="Type de cible" required>
          <select
            value={targetType}
            onChange={(e) => handleTargetTypeChange(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          >
            {TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {TARGET_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Code (symbole, paire, slug)" required>
          {targetType === "any" ? (
            <input
              type="text"
              value={targetCode}
              onChange={(e) => handleTargetCodeChange(e.target.value)}
              placeholder="* (toutes les cibles)"
              autoComplete="off"
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 font-mono"
            />
          ) : (
            <>
              <input
                type="text"
                value={targetCode}
                onChange={(e) => handleTargetCodeChange(e.target.value)}
                list={`target-options-${targetType}`}
                autoComplete="off"
                placeholder={
                  targetType === "stock"
                    ? "Ex: SNTS — commence à taper"
                    : targetType === "bond"
                      ? "Ex: TPBF.O12"
                      : targetType === "index"
                        ? "Ex: BRVMC"
                        : targetType === "currency"
                          ? "Ex: EUR/XOF"
                          : "Ex: cacao"
                }
                className={`w-full text-sm border rounded-md px-2 py-1.5 font-mono ${
                  showCodeError
                    ? "border-rose-400 focus:border-rose-500"
                    : codeMatchesList
                      ? "border-emerald-400"
                      : "border-slate-300"
                }`}
                aria-invalid={showCodeError}
              />
              <datalist id={`target-options-${targetType}`}>
                {currentOptions.map((o) => (
                  <option key={o.value} value={o.value} label={o.label} />
                ))}
              </datalist>
              {showCodeError && (
                <div className="text-[11px] text-rose-700 mt-1">
                  Code introuvable pour ce type. Choisis une option dans la
                  liste ({currentOptions.length} disponible
                  {currentOptions.length > 1 ? "s" : ""}).
                </div>
              )}
              {codeMatchesList && (
                <div className="text-[11px] text-emerald-700 mt-1 truncate">
                  ✓{" "}
                  {currentOptions.find((o) => o.value === targetCode)?.label}
                </div>
              )}
            </>
          )}
        </Field>

        {/* Champs spécifiques selon le type */}
        {(alertType === "price_threshold" ||
          alertType === "index_threshold" ||
          alertType === "fx_threshold") && (
          <>
            <Field label="Sens" required>
              <select
                value={params.direction ?? "above"}
                onChange={(e) =>
                  setParams({ ...params, direction: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
              >
                <option value="above">≥ (au-dessus)</option>
                <option value="below">≤ (en dessous)</option>
              </select>
            </Field>
            <Field
              label={
                alertType === "price_threshold" ? "Prix (FCFA)" : "Valeur"
              }
              required
            >
              <input
                type="number"
                step="any"
                value={
                  alertType === "price_threshold"
                    ? (params.price ?? "")
                    : (params.value ?? "")
                }
                onChange={(e) =>
                  setParams({
                    ...params,
                    [alertType === "price_threshold" ? "price" : "value"]:
                      Number(e.target.value),
                  })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
          </>
        )}

        {alertType === "daily_pct_change" && (
          <>
            <Field label="Sens" required>
              <select
                value={params.direction ?? "either"}
                onChange={(e) =>
                  setParams({ ...params, direction: e.target.value })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
              >
                <option value="either">Hausse OU baisse</option>
                <option value="above">Hausse uniquement</option>
                <option value="below">Baisse uniquement</option>
              </select>
            </Field>
            <Field label="Seuil (%)" required>
              <input
                type="number"
                step="any"
                value={params.threshold_pct ?? ""}
                onChange={(e) =>
                  setParams({ ...params, threshold_pct: Number(e.target.value) })
                }
                placeholder="5"
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              />
            </Field>
          </>
        )}

        {alertType === "bond_maturity_approach" && (
          <>
            <Field label="Jours avant échéance" required>
              <select
                value={params.days_before ?? 30}
                onChange={(e) =>
                  setParams({
                    ...params,
                    days_before: Number(e.target.value),
                  })
                }
                className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
              >
                <option value={30}>J-30</option>
                <option value={7}>J-7</option>
                <option value={1}>J-1</option>
              </select>
            </Field>
            <div className="flex items-center gap-2 mt-5">
              <input
                type="checkbox"
                id="include_coupons"
                checked={!!params.include_coupons}
                onChange={(e) =>
                  setParams({ ...params, include_coupons: e.target.checked })
                }
              />
              <label htmlFor="include_coupons" className="text-sm text-slate-700">
                Inclure les coupons (sinon : remboursement final uniquement)
              </label>
            </div>
          </>
        )}

        {alertType === "custom" && (
          <Field label="Note / rappel" required className="sm:col-span-2">
            <textarea
              value={params.note ?? ""}
              onChange={(e) => setParams({ ...params, note: e.target.value })}
              rows={3}
              maxLength={280}
              placeholder="Vérifier le rapport annuel de SNTS publié en mars."
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
            />
          </Field>
        )}

        <div className="sm:col-span-2 flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <label htmlFor="active" className="text-sm text-slate-700">
            Active
          </label>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-4 py-2 text-xs rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !codeIsValid}
          title={!codeIsValid ? "Choisis un code valide dans la liste" : undefined}
          className="px-4 py-2 text-xs rounded-md bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
        {label}
        {required && <span className="text-rose-600 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

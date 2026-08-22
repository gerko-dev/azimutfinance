"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  createFundAction,
  deleteFundAction,
  saveSgoProfileAction,
  updateFundAction,
} from "@/app/pros/fund-management/actions";
import type {
  BenchmarkComponent,
  FundInput,
  FundRecord,
  RatioLimite,
  SgoProfile,
} from "@/app/pros/fund-management/types";
import {
  CLASSES_ACTIF,
  GROUPES,
  ratiosReglementaires,
} from "@/app/pros/fund-management/reglementation";

const CATEGORIES = [
  "Obligataire",
  "Monétaire",
  "Diversifié",
  "Actions",
  "Actifs non cotés",
] as const;

const FUND_TYPES = ["FCP", "FCPE", "SICAV", "FCPR"] as const;

const CURRENCIES = [
  { value: "XOF", label: "XOF — Franc CFA (UEMOA)" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "USD", label: "USD — Dollar US" },
] as const;

// Suggestions de composantes de benchmark, fournies par le serveur et
// construites à partir des séries que le site sait déjà récupérer
// (indices BRVM, taux BCEAO, rendements souverains UMOA-Titres…).
export type BenchmarkOption = { value: string; label: string; group?: string };

type Settings = {
  sgoName: string;
  agrement: string;
  contactEmail: string;
  baseCurrency: string;
};

const DEFAULTS: Settings = {
  sgoName: "",
  agrement: "",
  contactEmail: "",
  baseCurrency: "XOF",
};

// BenchmarkComponent / FundInput / FundRecord sont partagés avec la server
// action (cf. app/pros/fund-management/types). Un benchmark composite = liste
// pondérée, ex. 35% BRVMC + 65% Rendement obligataire.

// Ratios réglementaires (Instruction 66) déduits de la catégorie du fonds.
// Les seuils du catalogue servent de valeurs par défaut, ajustables ensuite.
function buildRegRatios(categorie: string): RatioLimite[] {
  return ratiosReglementaires(categorie).map((r) => ({
    categorie: "REGLEMENTAIRE" as const,
    groupe: r.groupe,
    libelle: r.libelle,
    metrique: r.metrique,
    base: r.base,
    seuilMin: r.seuilMin != null ? String(r.seuilMin) : "",
    seuilMax: r.seuilMax != null ? String(r.seuilMax) : "",
    unite: r.unite,
    article: r.article,
  }));
}

// Ratios contractuels : une ligne d'allocation (% de l'actif net) par classe
// d'actif, seuils laissés vides à la création.
function buildCtrRatios(): RatioLimite[] {
  return CLASSES_ACTIF.map((c) => ({
    categorie: "CONTRACTUEL" as const,
    groupe: "Exposition par classe d'actif",
    libelle: `Exposition — ${c}`,
    metrique: c,
    base: "Actif net",
    seuilMin: "",
    seuilMax: "",
    unite: "%",
    article: "",
  }));
}

function emptyFund(devise: string): FundInput {
  const categorie = CATEGORIES[0];
  return {
    nom: "",
    abreviation: "",
    categorie,
    type: FUND_TYPES[0],
    vlInitiale: "",
    devise,
    objectifPerf: "",
    benchmark: [{ weight: "", ref: "" }],
    ratios: [...buildRegRatios(categorie), ...buildCtrRatios()],
  };
}

// Prépare le brouillon d'édition à partir d'un fonds existant : on régénère le
// catalogue complet de ratios pour la catégorie, puis on y applique les seuils
// enregistrés (les ratios sont stockés « allégés » en base).
function draftFromFund(f: FundRecord): FundInput {
  const full = [...buildRegRatios(f.categorie), ...buildCtrRatios()];
  const savedByKey = new Map(f.ratios.map((r) => [`${r.categorie}|${r.libelle}`, r]));
  const ratios = full.map((r) => {
    const saved = savedByKey.get(`${r.categorie}|${r.libelle}`);
    return saved ? { ...r, seuilMin: saved.seuilMin, seuilMax: saved.seuilMax } : r;
  });
  return {
    nom: f.nom,
    abreviation: f.abreviation,
    categorie: f.categorie,
    type: f.type,
    vlInitiale: f.vlInitiale,
    devise: f.devise,
    objectifPerf: f.objectifPerf,
    benchmark: f.benchmark.length ? f.benchmark : [{ weight: "", ref: "" }],
    ratios,
  };
}

// Composantes réellement renseignées (référence non vide).
function filledComponents(components: BenchmarkComponent[]): BenchmarkComponent[] {
  return components.filter((c) => c.ref.trim() !== "");
}

// Somme des poids (en %) des composantes renseignées.
function totalWeight(components: BenchmarkComponent[]): number {
  return filledComponents(components).reduce(
    (s, c) => s + (Number(c.weight.replace(",", ".")) || 0),
    0
  );
}

// "35% BRVMC · 65% Rendement obligataire"
function formatBenchmark(components: BenchmarkComponent[]): string {
  const filled = filledComponents(components);
  if (filled.length === 0) return "—";
  return filled
    .map((c) => {
      const w = c.weight.trim();
      return w ? `${w}% ${c.ref.trim()}` : c.ref.trim();
    })
    .join(" · ");
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {description && <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
    </label>
  );
}

// Sous-groupe de champs au sein d'une section (titre + filet + zone de champs).
function FieldGroup({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center justify-between gap-2 mb-2.5 pb-1 border-b border-slate-800">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          {title}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

const inputCls =
  "px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-600 focus:outline-none focus:border-blue-500";

// Petit champ de seuil (min/max) avec suffixe d'unité (%, ans) — utilisé dans
// les tableaux de ratios.
function SeuilInput({
  value,
  onChange,
  unite,
}: {
  value: string;
  onChange: (v: string) => void;
  unite: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 justify-end">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-16 px-2 py-1 text-xs text-right bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
      />
      <span className="text-[10px] text-slate-500 w-6 text-left">{unite}</span>
    </span>
  );
}

// Combobox sombre pour choisir une référence de benchmark : input + panneau
// déroulant custom (thème sombre, hauteur limitée + scroll), saisie libre
// conservée. Remplace le <datalist> natif (liste blanche, trop longue).
function BenchmarkCombobox({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: BenchmarkOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const typed = (query ?? "").trim().toLowerCase();
  const filtered = typed
    ? options.filter(
        (o) =>
          o.value.toLowerCase().includes(typed) || o.label.toLowerCase().includes(typed)
      )
    : options;

  // Regroupement par `group` en préservant l'ordre d'apparition.
  const groups: { name: string; items: BenchmarkOption[] }[] = [];
  for (const o of filtered) {
    const name = o.group ?? "Autres";
    let bucket = groups.find((g) => g.name === name);
    if (!bucket) {
      bucket = { name, items: [] };
      groups.push(bucket);
    }
    bucket.items.push(o);
  }

  const pick = (v: string) => {
    onChange(v);
    setQuery(null);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative flex-1 min-w-0">
      <input
        type="text"
        value={query ?? value}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`${inputCls} w-full`}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 left-0 right-0 max-h-52 overflow-y-auto rounded-md border border-slate-700 bg-slate-900 shadow-xl pro-scrollbar">
          {groups.map((g) => (
            <div key={g.name}>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900 sticky top-0">
                {g.name}
              </div>
              {g.items.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o.value)}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-800 transition flex items-center justify-between gap-2"
                >
                  <span className="font-mono text-[13px] text-slate-200 shrink-0">{o.value}</span>
                  <span className="text-[11px] text-slate-500 truncate">{o.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function profileToSettings(p: SgoProfile | null): Settings {
  if (!p) return DEFAULTS;
  return {
    sgoName: p.name,
    agrement: p.agrement,
    contactEmail: p.contactEmail,
    baseCurrency: p.baseCurrency || "XOF",
  };
}

export default function SettingsForm({
  benchmarkOptions = [],
  initialFunds = [],
  initialProfile = null,
}: {
  benchmarkOptions?: BenchmarkOption[];
  initialFunds?: FundRecord[];
  initialProfile?: SgoProfile | null;
}) {
  const [s, setS] = useState<Settings>(profileToSettings(initialProfile));
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, startSaveProfile] = useTransition();

  // Onglet actif du hub Paramètres.
  const [tab, setTab] = useState<"sgo" | "fonds" | "general">("sgo");

  // Fonds gérés : liste persistée en base (managed_funds via RLS).
  const [funds, setFunds] = useState<FundRecord[]>(initialFunds);
  const [draft, setDraft] = useState<FundInput>(emptyFund(DEFAULTS.baseCurrency));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const startCreate = () => {
    setEditingId(null);
    setDraft(emptyFund(s.baseCurrency));
    setFundError(null);
    setFormOpen(true);
  };

  const startEdit = (f: FundRecord) => {
    setEditingId(f.id);
    setDraft(draftFromFund(f));
    setFundError(null);
    setFormOpen(true);
    setTab("fonds");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyFund(s.baseCurrency));
    setFundError(null);
    setFormOpen(false);
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setProfileError(null);
  };

  const setDraftField = <K extends keyof FundInput>(key: K, value: FundInput[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFundError(null);
  };

  const setBenchmarkComponent = (
    index: number,
    key: keyof BenchmarkComponent,
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      benchmark: prev.benchmark.map((c, i) => (i === index ? { ...c, [key]: value } : c)),
    }));
    setFundError(null);
  };

  const addBenchmarkComponent = () =>
    setDraft((prev) => ({ ...prev, benchmark: [...prev.benchmark, { weight: "", ref: "" }] }));

  const removeBenchmarkComponent = (index: number) =>
    setDraft((prev) => {
      const next = prev.benchmark.filter((_, i) => i !== index);
      return { ...prev, benchmark: next.length ? next : [{ weight: "", ref: "" }] };
    });

  // Changer la catégorie régénère les ratios réglementaires (Instruction 66)
  // tout en conservant les ratios contractuels déjà saisis.
  const setCategorie = (categorie: string) => {
    setDraft((prev) => {
      const ctr = prev.ratios.filter((r) => r.categorie === "CONTRACTUEL");
      return { ...prev, categorie, ratios: [...buildRegRatios(categorie), ...ctr] };
    });
    setFundError(null);
  };

  const setRatioSeuil = (index: number, key: "seuilMin" | "seuilMax", value: string) => {
    setDraft((prev) => ({
      ...prev,
      ratios: prev.ratios.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    }));
    setFundError(null);
  };

  // Ratios séparés par nature, avec leur index absolu (pour la mise à jour).
  const regRatios = draft.ratios
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.categorie === "REGLEMENTAIRE");
  const ctrRatios = draft.ratios
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.categorie === "CONTRACTUEL");

  // Regroupement des ratios réglementaires par famille (ordre GROUPES).
  const regGroups = GROUPES.map((g) => ({
    name: g,
    items: regRatios.filter((x) => x.r.groupe === g),
  })).filter((grp) => grp.items.length > 0);

  const benchTotal = totalWeight(draft.benchmark);
  const benchFilledCount = filledComponents(draft.benchmark).length;
  // 100 ± 0,1 pour tolérer les arrondis de saisie (33,33 + 33,33 + 33,34).
  const benchBalanced = benchFilledCount === 0 || Math.abs(benchTotal - 100) < 0.1;

  const addFund = () => {
    if (!draft.nom.trim()) {
      setFundError("Le nom du fonds est obligatoire.");
      return;
    }
    const vl = draft.vlInitiale.trim();
    if (vl !== "" && !(Number(vl.replace(",", ".")) > 0)) {
      setFundError("La VL initiale doit être un nombre positif.");
      return;
    }
    if (!benchBalanced) {
      setFundError(
        `Le total des poids du benchmark doit faire 100 % (actuellement ${benchTotal
          .toFixed(2)
          .replace(/\.?0+$/, "")
          .replace(".", ",")} %).`
      );
      return;
    }
    setFundError(null);
    startTransition(async () => {
      if (editingId) {
        const res = await updateFundAction(editingId, draft);
        if (!res.ok) {
          setFundError(res.error);
          return;
        }
        setFunds((prev) => prev.map((f) => (f.id === editingId ? res.data : f)));
        setEditingId(null);
        setDraft(emptyFund(s.baseCurrency));
        setFormOpen(false);
        return;
      }
      const res = await createFundAction(draft);
      if (!res.ok) {
        setFundError(res.error);
        return;
      }
      setFunds((prev) => [...prev, res.data]);
      setDraft(emptyFund(s.baseCurrency));
      setFormOpen(false);
    });
  };

  const removeFund = (id: string) => {
    const snapshot = funds;
    // Optimiste : on retire tout de suite, on restaure si l'action échoue.
    setFunds((prev) => prev.filter((f) => f.id !== id));
    startTransition(async () => {
      const res = await deleteFundAction(id);
      if (!res.ok) {
        setFunds(snapshot);
        setFundError(res.error);
      }
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setSaved(false);
    startSaveProfile(async () => {
      const res = await saveSgoProfileAction({
        name: s.sgoName,
        agrement: s.agrement,
        contactEmail: s.contactEmail,
        baseCurrency: s.baseCurrency,
      });
      if (!res.ok) {
        setProfileError(res.error);
        return;
      }
      setS(profileToSettings(res.data));
      setSaved(true);
    });
  };

  const TABS = [
    ["sgo", "Société de gestion"],
    ["fonds", "Fonds gérés"],
    ["general", "Paramètres généraux"],
  ] as const;

  return (
    <div className="space-y-4">
      {/* Sous-onglets du hub Paramètres */}
      <div className="border-b border-slate-800 flex gap-1 overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
              tab === key
                ? "border-blue-400 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sgo" && (
        <form onSubmit={onSubmit} className="space-y-4">
          <Section
            title="Société de gestion"
            description="Identité de la SGO utilisée dans les rapports et les états investisseurs."
          >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Dénomination">
            <input
              type="text"
              value={s.sgoName}
              onChange={(e) => set("sgoName", e.target.value)}
              placeholder="Ex. Atlantic Asset Management"
              className={inputCls}
            />
          </Field>
          <Field label="N° d'agrément" hint="Agrément CREPMF / autorité de tutelle.">
            <input
              type="text"
              value={s.agrement}
              onChange={(e) => set("agrement", e.target.value)}
              placeholder="Ex. SGO-2017-01"
              className={inputCls}
            />
          </Field>
          <Field label="Email de contact">
            <input
              type="email"
              value={s.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              placeholder="contact@sgo.ci"
              className={inputCls}
            />
          </Field>
          <Field label="Devise de référence">
            <select
              value={s.baseCurrency}
              onChange={(e) => set("baseCurrency", e.target.value)}
              className={inputCls}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingProfile}
              className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingProfile ? "Enregistrement…" : "Enregistrer la SGO"}
            </button>
            {saved && (
              <span className="text-[12px] text-emerald-400">✓ Société de gestion enregistrée.</span>
            )}
            {profileError && <span className="text-[12px] text-red-400">{profileError}</span>}
          </div>
        </form>
      )}

      {tab === "fonds" && (
        <Section
          title="Fonds gérés"
          description="Créez, modifiez ou supprimez les fonds rattachés à la SGO."
        >
        {/* Barre d'action : créer un fonds (le formulaire n'apparaît qu'au clic) */}
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={startCreate}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-blue-500/50 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition"
          >
            + Créer un fonds
          </button>
        </div>

        {/* Récapitulatif des fonds créés */}
        {funds.length > 0 ? (
          <div className="overflow-x-auto mb-4 border border-slate-700 rounded-md">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                  <th className="px-3 py-2 text-left font-medium">Fonds</th>
                  <th className="px-3 py-2 text-left font-medium">Catégorie</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">VL initiale</th>
                  <th className="px-3 py-2 text-left font-medium">Devise</th>
                  <th className="px-3 py-2 text-left font-medium">Benchmark</th>
                  <th className="px-3 py-2 text-left font-medium">Objectif</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {funds.map((f) => (
                  <tr key={f.id} className="border-b border-slate-800 last:border-0">
                    <td className="px-3 py-2 text-slate-200">
                      {f.nom}
                      {f.abreviation && (
                        <span className="ml-1.5 text-[10px] font-mono text-slate-500">
                          {f.abreviation}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{f.categorie}</td>
                    <td className="px-3 py-2 text-slate-400">{f.type}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      {f.vlInitiale ? f.vlInitiale : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{f.devise}</td>
                    <td className="px-3 py-2 text-slate-400">{formatBenchmark(f.benchmark)}</td>
                    <td className="px-3 py-2 text-slate-400">{f.objectifPerf || "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(f)}
                        className="text-[11px] text-blue-300 hover:text-blue-200 transition mr-3"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFund(f.id)}
                        className="text-[11px] text-red-400 hover:text-red-300 transition"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mb-4 text-[12px] text-slate-500">Aucun fonds créé pour le moment.</p>
        )}

        {/* Formulaire de création / modification (affiché à la demande) */}
        {formOpen && (
        <div className="border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h4 className="text-sm font-semibold text-slate-200">
              {editingId ? "Modifier le fonds" : "Nouveau fonds"}
            </h4>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-[11px] text-slate-400 hover:text-slate-200 transition"
              >
                Annuler la modification
              </button>
            )}
          </div>

          {/* Groupe 1 : identité du fonds */}
          <FieldGroup title="Identité">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Nom du fonds">
                <input
                  type="text"
                  value={draft.nom}
                  onChange={(e) => setDraftField("nom", e.target.value)}
                  placeholder="Ex. Atlantic Obligations Plus"
                  className={inputCls}
                />
              </Field>
              <Field label="Abréviation" hint="Code court affiché dans les tableaux.">
                <input
                  type="text"
                  value={draft.abreviation}
                  onChange={(e) => setDraftField("abreviation", e.target.value)}
                  placeholder="Ex. AOP"
                  className={inputCls}
                />
              </Field>
              <Field label="Catégorie" hint="Pilote les ratios réglementaires (Instruction 66).">
                <select
                  value={draft.categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                  className={inputCls}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type d'OPC">
                <select
                  value={draft.type}
                  onChange={(e) => setDraftField("type", e.target.value)}
                  className={inputCls}
                >
                  {FUND_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </FieldGroup>

          {/* Groupe 2 : valorisation & objectif */}
          <FieldGroup title="Valorisation & objectif">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="VL initiale" hint="Valeur liquidative de lancement (optionnel).">
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.vlInitiale}
                  onChange={(e) => setDraftField("vlInitiale", e.target.value)}
                  placeholder="Ex. 10 000"
                  className={inputCls}
                />
              </Field>
              <Field label="Devise">
                <select
                  value={draft.devise}
                  onChange={(e) => setDraftField("devise", e.target.value)}
                  className={inputCls}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.value}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Objectif de performance" hint="Cible de rendement annuel (optionnel).">
                <input
                  type="text"
                  value={draft.objectifPerf}
                  onChange={(e) => setDraftField("objectifPerf", e.target.value)}
                  placeholder="Ex. 5,5 % net / an"
                  className={inputCls}
                />
              </Field>
            </div>
          </FieldGroup>

          {/* Groupe 3 : benchmark composite (poids % + référence par ligne) */}
          <FieldGroup
            title="Benchmark de référence"
            right={
              <span
                className={`text-[11px] font-mono ${
                  benchBalanced ? "text-slate-500" : "text-amber-400"
                }`}
              >
                Total : {benchTotal.toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} %
                {benchFilledCount > 0 && !benchBalanced && " (cible 100 %)"}
              </span>
            }
          >
            <div className="max-w-xl space-y-2">
            {draft.benchmark.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="relative w-28 shrink-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={c.weight}
                    onChange={(e) => setBenchmarkComponent(i, "weight", e.target.value)}
                    placeholder="35"
                    className={`${inputCls} w-full pr-7`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">
                    %
                  </span>
                </div>
                <BenchmarkCombobox
                  value={c.ref.startsWith("obldefaut") ? "obldefaut" : c.ref}
                  onChange={(v) => setBenchmarkComponent(i, "ref", v)}
                  options={benchmarkOptions}
                  placeholder="Ex. BRVMC"
                />
                {c.ref.startsWith("obldefaut") && (
                  <div className="relative w-24 shrink-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={c.ref.split(":")[1] ?? ""}
                      onChange={(e) =>
                        setBenchmarkComponent(i, "ref", `obldefaut:${e.target.value.trim()}`)
                      }
                      placeholder="Taux"
                      title="Taux obligataire par défaut (annuel)"
                      className={`${inputCls} w-full pr-6`}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">
                      %
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeBenchmarkComponent(i)}
                  aria-label="Retirer la composante"
                  title="Retirer la composante"
                  className="shrink-0 px-2.5 py-2 text-slate-500 hover:text-red-400 transition"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

            <div className="mt-2 max-w-xl flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={addBenchmarkComponent}
                className="text-[12px] text-blue-300 hover:text-blue-200 transition"
              >
                + Ajouter une composante
              </button>
              <span className="text-[10px] text-slate-600">
                Ex. 35 % BRVMC · 65 % Rendement obligataire — la somme des poids doit faire 100 %.
              </span>
            </div>
          </FieldGroup>

          {/* Groupe 4 : ratios réglementaires (Instruction 66), auto-remplis */}
          <FieldGroup
            title="Ratios réglementaires"
            right={
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Instruction 66 · {regRatios.length} ratios
              </span>
            }
          >
            <p className="text-[10px] text-slate-600 mb-3">
              Déterminés automatiquement par la <strong>catégorie</strong> du fonds
              (Instruction N°66/CREPMF/2021), regroupés par famille. Seuls les seuils
              min / max sont ajustables.
            </p>
            <div className="space-y-4">
              {regGroups.map((grp) => (
                <div key={grp.name} className="border border-slate-800 rounded-md overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-900/60 border-b border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-300">{grp.name}</span>
                    <span className="text-[10px] text-slate-500">{grp.items.length}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-slate-500 border-b border-slate-800">
                          <th className="px-3 py-1.5 text-left font-medium">Libellé</th>
                          <th className="px-3 py-1.5 text-left font-medium">Métrique</th>
                          <th className="px-3 py-1.5 text-left font-medium">% de</th>
                          <th className="px-2 py-1.5 text-right font-medium">Min</th>
                          <th className="px-2 py-1.5 text-right font-medium">Max</th>
                          <th className="px-3 py-1.5 text-left font-medium">Article</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grp.items.map(({ r, i }) => (
                          <tr key={i} className="border-b border-slate-800/60 last:border-0 align-top">
                            <td className="px-3 py-2 text-slate-300 max-w-[18rem]">{r.libelle}</td>
                            <td className="px-3 py-2 text-slate-500">{r.metrique || "—"}</td>
                            <td className="px-3 py-2 text-slate-500">{r.base || "—"}</td>
                            <td className="px-2 py-2 text-right">
                              <SeuilInput
                                value={r.seuilMin}
                                unite={r.unite}
                                onChange={(v) => setRatioSeuil(i, "seuilMin", v)}
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <SeuilInput
                                value={r.seuilMax}
                                unite={r.unite}
                                onChange={(v) => setRatioSeuil(i, "seuilMax", v)}
                              />
                            </td>
                            <td className="px-3 py-2 text-[10px] text-slate-600 whitespace-nowrap">
                              {r.article || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {regGroups.length === 0 && (
                <p className="text-[11px] text-slate-600">
                  Aucun ratio réglementaire spécifique pour cette catégorie.
                </p>
              )}
            </div>
          </FieldGroup>

          {/* Groupe 5 : ratios contractuels (allocation par classe d'actif) */}
          <FieldGroup
            title="Ratios contractuels"
            right={
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Allocation par classe d&apos;actif
              </span>
            }
          >
            <p className="text-[10px] text-slate-600 mb-3">
              Limites d&apos;allocation propres au fonds (prospectus / mandat), en
              <strong> % de l&apos;actif net</strong>. Laissez vide si la classe n&apos;est pas encadrée.
            </p>
            <div className="border border-slate-800 rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-500 border-b border-slate-800">
                    <th className="px-3 py-1.5 text-left font-medium">Classe d&apos;actif</th>
                    <th className="px-2 py-1.5 text-right font-medium">Seuil min</th>
                    <th className="px-2 py-1.5 text-right font-medium">Seuil max</th>
                  </tr>
                </thead>
                <tbody>
                  {ctrRatios.map(({ r, i }) => (
                    <tr key={i} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-3 py-2 text-slate-300">{r.metrique}</td>
                      <td className="px-2 py-2 text-right">
                        <SeuilInput
                          value={r.seuilMin}
                          unite="%"
                          onChange={(v) => setRatioSeuil(i, "seuilMin", v)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <SeuilInput
                          value={r.seuilMax}
                          unite="%"
                          onChange={(v) => setRatioSeuil(i, "seuilMax", v)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FieldGroup>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={addFund}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium rounded-md border border-blue-500/50 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending
                ? "Enregistrement…"
                : editingId
                  ? "Enregistrer les modifications"
                  : "+ Créer le fonds"}
            </button>
            {fundError && <span className="text-[12px] text-red-400">{fundError}</span>}
          </div>
        </div>
        )}
        </Section>
      )}

      {tab === "general" && (
        <Section
          title="Paramètres généraux"
          description="Réglages transverses du module de gestion."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Devise de référence (SGO)"
              hint="Définie dans l'onglet Société de gestion."
            >
              <div className={`${inputCls} bg-slate-900/40 text-slate-300`}>{s.baseCurrency}</div>
            </Field>
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            D&apos;autres réglages transverses (options d&apos;import, valorisation, reporting)
            viendront ici.
          </p>
        </Section>
      )}
    </div>
  );
}

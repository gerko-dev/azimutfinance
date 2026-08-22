"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  addSecurityToFundAction,
  getSecurityDefaultsAction,
  listFundReferentialAction,
  listFundSecuritiesAction,
  lookupReferenceAction,
  unlinkSecurityFromFundAction,
  updateCustomSecurityAction,
} from "@/app/pros/fund-management/portfolio-actions";
import type {
  CustomSecurity,
  CustomSecurityInput,
  FundOption,
  PortfolioSection,
} from "@/app/pros/fund-management/portfolio-types";
import {
  KIND_OPTIONS,
  LISTABLE_KINDS,
  SECURITY_FIELDS,
  type FieldDef,
} from "@/app/pros/fund-management/portfolio-security-schema";
import TreasuryFields from "./TreasuryFields";

const CURRENCIES = ["XOF", "EUR", "USD"] as const;
const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.map((k) => [k.value, k.label]),
);

const inputCls =
  "px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-600 focus:outline-none focus:border-blue-500";

// Champ dynamique piloté par le schéma (identique au formulaire d'import).
function AttrField({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{def.label}</span>
      {def.type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : def.type === "number" ? (
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={def.placeholder}
            className={`${inputCls} w-full ${def.unit ? "pr-7" : ""}`}
          />
          {def.unit && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">
              {def.unit}
            </span>
          )}
        </div>
      ) : (
        <input
          type={def.type === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          className={inputCls}
        />
      )}
    </label>
  );
}

// Éditeur d'un titre : création (security = null, rattaché au fonds) ou
// modification (titre partagé au niveau utilisateur).
function EditPanel({
  fundId,
  security,
  onCancel,
  onSaved,
}: {
  fundId: string;
  security: CustomSecurity | null;
  onCancel: () => void;
  onSaved: (s: CustomSecurity, created: boolean) => void;
}) {
  const [kind, setKind] = useState<PortfolioSection>(security?.kind ?? "action");
  const [code, setCode] = useState(security?.code ?? "");
  const [name, setName] = useState(security?.name ?? "");
  const [currency, setCurrency] = useState(security?.currency ?? "XOF");
  const [attrs, setAttrs] = useState<Record<string, string>>(security?.attributes ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Amène le formulaire dans la vue à l'ouverture (évite de scroller quand la
  // ligne éditée est en bas du tableau).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Titre coté / reconnu : provenance du site (pour pré-remplir depuis la base).
  const source = security?.attributes?.source ?? "";
  const refId = security?.attributes?.refId ?? "";
  const linkedToSite = !!(source && refId);
  const [defaults, setDefaults] = useState<Record<string, string> | null>(null);
  // Titre coté en cours de saisie : correspondance trouvée dans le référentiel
  // du site (affichée pour confirmer que les infos sont reprises).
  const [cotedInfo, setCotedInfo] = useState<{ label: string; id: string } | null>(null);

  // Récupère les paramètres d'origine (site) et pré-remplit les champs vides.
  useEffect(() => {
    if (!linkedToSite) return;
    let alive = true;
    getSecurityDefaultsAction(source, refId).then((res) => {
      if (!alive || !res.ok || !res.data) return;
      const d = res.data;
      setDefaults(d);
      setAttrs((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(d)) {
          if (!(next[k] ?? "").trim()) next[k] = v;
        }
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [linkedToSite, source, refId]);

  const restoreDefaults = () => {
    if (!defaults) return;
    setAttrs({ ...defaults, source, refId });
    setError(null);
  };

  const fields = SECURITY_FIELDS[kind] ?? [];

  // Statut de cotation (actions & obligations). Coté ⇒ liaison au référentiel du
  // site : seul le code/symbole (et l'ISIN) est saisi.
  const listable = LISTABLE_KINDS.has(kind);
  const listing = attrs.cote === "cote" ? "cote" : "noncote";
  const isCote = listable && listing === "cote";
  const detailFields = fields.filter((f) => f.key !== "cote");

  // Coté : recherche automatique (debounce) dans le référentiel du site à
  // partir du code/ISIN saisi, et pré-remplissage visible des caractéristiques.
  const isinVal = attrs.isin ?? "";
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (!alive) return;
      if (!isCote || (!code.trim() && !isinVal.trim())) {
        setCotedInfo(null);
        return;
      }
      const ref = await lookupReferenceAction(code, isinVal);
      if (!alive) return;
      if (!ref.ok || !ref.data) {
        setCotedInfo(null);
        return;
      }
      const m = ref.data;
      setCotedInfo({ label: m.label, id: m.id });
      const def = await getSecurityDefaultsAction(m.kind, m.id);
      if (!alive || !def.ok || !def.data) return;
      const d = def.data;
      setName(m.label);
      setAttrs((prev) => {
        const next: Record<string, string> = {
          ...prev,
          source: m.kind,
          refId: m.id,
          cote: "cote",
        };
        for (const [k, v] of Object.entries(d)) next[k] = v; // reprise des infos du site
        return next;
      });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [isCote, code, isinVal]);

  // OPCVM/FCP : même logique que la création (cascade SGO → FCP, catégorie auto).
  const [fundRef, setFundRef] = useState<FundOption[] | null>(null);
  const [mgr, setMgr] = useState("");
  const [fundId2, setFundId2] = useState("");

  useEffect(() => {
    if (kind !== "opcvm" || fundRef !== null) return;
    let alive = true;
    listFundReferentialAction().then((res) => {
      if (!alive || !res.ok) return;
      setFundRef(res.data);
      // Présélectionne le FCP actuel (via refId) s'il existe.
      const current = refId ? res.data.find((f) => f.id === refId) : undefined;
      if (current) {
        setMgr(current.gestionnaire);
        setFundId2(current.id);
      }
    });
    return () => {
      alive = false;
    };
  }, [kind, fundRef, refId]);

  const managers = fundRef ? [...new Set(fundRef.map((f) => f.gestionnaire))].sort() : [];
  const fundsOfMgr = fundRef ? fundRef.filter((f) => f.gestionnaire === mgr) : [];
  const selectedFund = fundRef?.find((f) => f.id === fundId2) ?? null;

  const submit = () => {
    // OPCVM : liaison à un FCP du référentiel (comme à la création).
    if (kind === "opcvm") {
      if (!selectedFund) {
        setError("Choisis la société de gestion puis le FCP.");
        return;
      }
      if (!code.trim()) {
        setError("Le code / symbole est obligatoire.");
        return;
      }
      setError(null);
      const input: CustomSecurityInput = {
        kind,
        code,
        name: selectedFund.nom,
        currency,
        attributes: {
          source: "fund",
          refId: selectedFund.id,
          gestionnaire: selectedFund.gestionnaire,
          categorie: selectedFund.categorie,
        },
      };
      start(async () => {
        const res = security
          ? await updateCustomSecurityAction(security.id, input)
          : await addSecurityToFundAction(fundId, input);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onSaved(res.data, !security);
      });
      return;
    }

    // Titre coté : recherche dans le référentiel du site à partir du code/ISIN,
    // puis liaison (le reste des caractéristiques provient du site).
    if (isCote) {
      if (!code.trim() && !(attrs.isin ?? "").trim()) {
        setError("Renseigne le code ou l'ISIN du titre coté.");
        return;
      }
      setError(null);
      start(async () => {
        const ref = await lookupReferenceAction(code, attrs.isin ?? "");
        if (!ref.ok || !ref.data) {
          setError(
            "Titre coté introuvable dans le référentiel. Vérifie le code / ISIN, ou choisis « Non coté ».",
          );
          return;
        }
        const m = ref.data;
        const def = await getSecurityDefaultsAction(m.kind, m.id);
        const baseAttrs = def.ok && def.data ? def.data : {};
        const input: CustomSecurityInput = {
          kind,
          code: code.trim() || m.id,
          name: m.label,
          currency,
          attributes: { ...baseAttrs, source: m.kind, refId: m.id, cote: "cote" },
        };
        const res = security
          ? await updateCustomSecurityAction(security.id, input)
          : await addSecurityToFundAction(fundId, input);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onSaved(res.data, !security);
      });
      return;
    }

    if (!code.trim() || !name.trim()) {
      setError("Le code et le nom sont obligatoires.");
      return;
    }
    setError(null);
    const input: CustomSecurityInput = { kind, code, name, currency, attributes: attrs };
    start(async () => {
      const res = security
        ? await updateCustomSecurityAction(security.id, input)
        : await addSecurityToFundAction(fundId, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved(res.data, !security);
    });
  };

  return (
    <div ref={rootRef} className="mb-4 p-3 border border-blue-500/30 bg-blue-500/5 rounded-md scroll-mt-24">
      <div className="text-[11px] font-semibold text-blue-200 mb-2">
        {security ? `Modifier « ${security.code} »` : "Nouveau titre au référentiel"}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Type</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as PortfolioSection);
              setError(null);
            }}
            className={inputCls}
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        {listable && (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Statut de cotation
            </span>
            <select
              value={listing}
              onChange={(e) => {
                setAttrs((prev) => ({ ...prev, cote: e.target.value }));
                setError(null);
              }}
              className={inputCls}
            >
              <option value="noncote">Non coté</option>
              <option value="cote">Coté (référentiel)</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Code / Symbole</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} />
        </label>
        {isCote ? (
          /* Coté : code/ISIN → recherche site + reprise visible des infos. */
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">ISIN</span>
              <input
                value={attrs.isin ?? ""}
                onChange={(e) => {
                  setAttrs((prev) => ({ ...prev, isin: e.target.value }));
                  setError(null);
                }}
                placeholder="CI0000000000"
                className={inputCls}
              />
            </label>
            {cotedInfo ? (
              <div className="md:col-span-2 lg:col-span-3 text-[12px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded px-3 py-2">
                ✓ Titre reconnu : <strong>{cotedInfo.label}</strong>{" "}
                <span className="font-mono text-[11px] text-slate-400">{cotedInfo.id}</span> — les
                caractéristiques du site sont reprises ci-dessous.
              </div>
            ) : (
              (code.trim() || (attrs.isin ?? "").trim()) && (
                <div className="md:col-span-2 lg:col-span-3 text-[11px] text-amber-400/90">
                  Recherche dans le référentiel… (vérifie le code / ISIN si rien ne remonte)
                </div>
              )
            )}
            {/* Caractéristiques reprises du site (ajustables). */}
            {cotedInfo &&
              detailFields.map((def) => (
                <AttrField
                  key={def.key}
                  def={def}
                  value={attrs[def.key] ?? ""}
                  onChange={(v) => {
                    setAttrs((prev) => ({ ...prev, [def.key]: v }));
                    setError(null);
                  }}
                />
              ))}
          </>
        ) : kind === "opcvm" ? (
          /* OPCVM/FCP : cascade SGO → FCP, catégorie auto (comme à la création). */
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Société de gestion
              </span>
              <select
                value={mgr}
                onChange={(e) => {
                  setMgr(e.target.value);
                  setFundId2("");
                  setError(null);
                }}
                className={inputCls}
              >
                <option value="">{fundRef ? "— Choisir —" : "Chargement…"}</option>
                {managers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">FCP</span>
              <select
                value={fundId2}
                disabled={!mgr}
                onChange={(e) => {
                  setFundId2(e.target.value);
                  setError(null);
                }}
                className={`${inputCls} disabled:opacity-50`}
              >
                <option value="">{mgr ? "— Choisir —" : "Choisir d'abord la SGO"}</option>
                {fundsOfMgr.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Catégorie (auto)
              </span>
              <input
                readOnly
                value={selectedFund?.categorie ?? ""}
                placeholder="—"
                className={`${inputCls} opacity-70`}
              />
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Nom</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Devise</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={inputCls}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            {kind === "tresorerie" ? (
              <TreasuryFields
                attrs={attrs}
                setAttr={(k, v) => {
                  setAttrs((prev) => ({ ...prev, [k]: v }));
                  setError(null);
                }}
                inputCls={inputCls}
              />
            ) : (
              detailFields.map((def) => (
                <AttrField
                  key={def.key}
                  def={def}
                  value={attrs[def.key] ?? ""}
                  onChange={(v) => {
                    setAttrs((prev) => ({ ...prev, [def.key]: v }));
                    setError(null);
                  }}
                />
              ))
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-blue-500/50 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : isCote ? "Rechercher et lier" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 text-sm rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 transition"
        >
          Annuler
        </button>
        {defaults && (
          <button
            type="button"
            onClick={restoreDefaults}
            disabled={pending}
            title="Rétablir les caractéristiques connues du référentiel du site"
            className="px-3 py-1.5 text-sm rounded-md border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            Paramètres d&apos;origine
          </button>
        )}
        {error && <span className="text-[12px] text-red-400">{error}</span>}
      </div>
    </div>
  );
}

export default function SecuritiesReferential({ fundId }: { fundId: string }) {
  const [items, setItems] = useState<CustomSecurity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startDelete] = useTransition();

  useEffect(() => {
    let alive = true;
    listFundSecuritiesAction(fundId).then((res) => {
      if (!alive) return;
      if (res.ok) setItems(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [fundId]);

  const remove = (id: string) => {
    const snapshot = items ?? [];
    setItems((prev) => (prev ?? []).filter((s) => s.id !== id));
    if (editingId === id) setEditingId(null);
    startDelete(async () => {
      const res = await unlinkSecurityFromFundAction(fundId, id);
      if (!res.ok) {
        setItems(snapshot);
        setError(res.error);
      }
    });
  };

  const onSaved = (saved: CustomSecurity, created: boolean) => {
    setItems((prev) => {
      const list = prev ?? [];
      if (created) return list.some((s) => s.id === saved.id) ? list : [...list, saved];
      return list.map((s) => (s.id === saved.id ? saved : s));
    });
    setEditingId(null);
    setCreating(false);
  };

  const editing = items?.find((s) => s.id === editingId) ?? null;

  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-700 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Référentiel titres</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Titres de ce fonds, alimentés par ses imports d&apos;inventaire et les ajouts manuels.
            Les caractéristiques sont partagées entre fonds ; le retrait n&apos;affecte que ce fonds.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditingId(null);
          }}
          className="shrink-0 px-3 py-1.5 text-sm font-medium rounded-md border border-blue-500/50 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition"
        >
          + Ajouter un titre
        </button>
      </div>
      <div className="p-4">
        {error && <p className="mb-3 text-[12px] text-red-400">{error}</p>}

        {creating && (
          <EditPanel
            fundId={fundId}
            security={null}
            onCancel={() => setCreating(false)}
            onSaved={onSaved}
          />
        )}

        {editing && (
          <EditPanel
            key={editing.id}
            fundId={fundId}
            security={editing}
            onCancel={() => setEditingId(null)}
            onSaved={onSaved}
          />
        )}

        {items === null ? (
          <p className="text-[12px] text-slate-500">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="text-[12px] text-slate-500">
            Aucun titre dans le référentiel de ce fonds. Ils s&apos;ajoutent à l&apos;enregistrement
            d&apos;un import, ou via « + Ajouter un titre ».
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-700 rounded-md">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] text-slate-500 border-b border-slate-700 bg-slate-900/60">
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Nom</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">ISIN</th>
                  <th className="px-3 py-2 text-left font-medium">Devise</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((sc) => (
                  <tr key={sc.id} className="border-b border-slate-800 last:border-0">
                    <td className="px-3 py-2 font-mono text-slate-200">{sc.code}</td>
                    <td className="px-3 py-2 text-slate-300">{sc.name}</td>
                    <td className="px-3 py-2 text-slate-400">{KIND_LABEL[sc.kind] ?? sc.kind}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{sc.isin || "—"}</td>
                    <td className="px-3 py-2 text-slate-400">{sc.currency}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(false);
                          setEditingId(sc.id);
                        }}
                        className="text-[11px] text-blue-300 hover:text-blue-200 transition mr-3"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(sc.id)}
                        title="Retirer ce titre du référentiel de ce fonds"
                        className="text-[11px] text-red-400 hover:text-red-300 transition"
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

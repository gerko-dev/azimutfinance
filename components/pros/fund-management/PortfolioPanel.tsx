"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createCustomSecurityAction,
  importInventoryAction,
  listFundReferentialAction,
  lookupReferenceAction,
  reclassifyFundPortfoliosAction,
  savePortfolioAction,
} from "@/app/pros/fund-management/portfolio-actions";
import {
  MATCH_LABELS,
  SECTION_LABELS,
  SLOT_LABELS,
  SLOT_ORDER,
  hrefForMatch,
  type CustomSecurityInput,
  type FundOption,
  type ImportedPosition,
  type MatchKind,
  type ParsedInventory,
  type PortfolioSection,
  type PortfolioSlot,
  type PortfolioSnapshot,
  type ReferenceMatch,
} from "@/app/pros/fund-management/portfolio-types";
import {
  KIND_OPTIONS,
  LISTABLE_KINDS,
  SECURITY_FIELDS,
  type FieldDef,
} from "@/app/pros/fund-management/portfolio-security-schema";
import TreasuryFields from "./TreasuryFields";

const CURRENCIES = ["XOF", "EUR", "USD"] as const;

const SECTION_ORDER: PortfolioSection[] = [
  "action",
  "obligation",
  "opcvm",
  "dat",
  "tresorerie",
  "autre",
];

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function normCode(s: string): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

// Pastille de statut selon la reconnaissance.
function MatchBadge({ kind }: { kind: MatchKind }) {
  const cls: Record<MatchKind, string> = {
    stock: "bg-emerald-500/15 text-emerald-300",
    "listed-bond": "bg-emerald-500/15 text-emerald-300",
    sovereign: "bg-emerald-500/15 text-emerald-300",
    fund: "bg-emerald-500/15 text-emerald-300",
    custom: "bg-blue-500/15 text-blue-300",
    dat: "bg-violet-500/15 text-violet-300",
    cash: "bg-slate-600/40 text-slate-300",
    unmatched: "bg-amber-500/15 text-amber-300",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${cls[kind]}`}>
      {MATCH_LABELS[kind]}
    </span>
  );
}

const inputCls =
  "px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-white placeholder-slate-600 focus:outline-none focus:border-blue-500";

// Rendu d'un champ (attribut) piloté par le schéma du type de titre.
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
      {def.hint && <span className="text-[10px] text-slate-600">{def.hint}</span>}
    </label>
  );
}

// Formulaire de création d'un titre personnalisé (ligne non reconnue), dont les
// paramètres dépendent du type choisi (voir portfolio-security-schema).
function CustomSecurityForm({
  initial,
  onCancel,
  onCreated,
  onLinked,
}: {
  initial: CustomSecurityInput;
  onCancel: () => void;
  onCreated: (created: { id: string; name: string; code: string }) => void;
  onLinked: (match: ReferenceMatch) => void;
}) {
  const [kind, setKind] = useState<PortfolioSection>(initial.kind);
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [currency, setCurrency] = useState(initial.currency || "XOF");
  const [attrs, setAttrs] = useState<Record<string, string>>(initial.attributes ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Correspondance trouvée dans le référentiel : on demande confirmation avant
  // de créer un doublon.
  const [refMatch, setRefMatch] = useState<ReferenceMatch | null>(null);

  // OPCVM/FCP : référentiel du site (sélection en cascade SGO → FCP).
  const [fundRef, setFundRef] = useState<FundOption[] | null>(null);
  const [mgr, setMgr] = useState("");
  const [fundId, setFundId] = useState("");

  // Charge le référentiel FCP à la demande (quand le type OPCVM est actif).
  useEffect(() => {
    if (kind !== "opcvm" || fundRef !== null) return;
    let alive = true;
    listFundReferentialAction().then((res) => {
      if (alive && res.ok) setFundRef(res.data);
    });
    return () => {
      alive = false;
    };
  }, [kind, fundRef]);

  const clear = () => {
    setError(null);
    setRefMatch(null);
  };
  const setAttr = (key: string, v: string) => {
    setAttrs((prev) => ({ ...prev, [key]: v }));
    clear();
  };

  const fields = SECURITY_FIELDS[kind] ?? [];
  // Statut de cotation (pour actions & obligations). Coté ⇒ liaison obligatoire
  // au référentiel ; Non coté ⇒ création détaillée.
  const listable = LISTABLE_KINDS.has(kind);
  const listing = attrs.cote === "cote" ? "cote" : "noncote";
  const isCote = listable && listing === "cote";
  // Les types « liés au référentiel » (coté, OPCVM) ne créent pas de custom.
  const isLink = isCote || kind === "opcvm";
  const detailFields = fields.filter((f) => f.key !== "cote");

  const buildInput = (): CustomSecurityInput => ({ kind, code, name, currency, attributes: attrs });

  // Crée effectivement le titre personnalisé (après vérif / choix explicite).
  const doCreate = () => {
    start(async () => {
      const res = await createCustomSecurityAction(buildInput());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCreated({ id: res.data.id, name: res.data.name, code: res.data.code });
    });
  };

  // Référentiel FCP dérivé (gestionnaires distincts, fonds du gestionnaire choisi).
  const managers = fundRef ? [...new Set(fundRef.map((f) => f.gestionnaire))].sort() : [];
  const fundsOfMgr = fundRef ? fundRef.filter((f) => f.gestionnaire === mgr) : [];
  const selectedFund = fundRef?.find((f) => f.id === fundId) ?? null;

  const submit = () => {
    // OPCVM/FCP : uniquement ceux du référentiel → liaison au fonds choisi.
    if (kind === "opcvm") {
      if (!selectedFund) {
        setError("Choisis la société de gestion puis le FCP dans la liste.");
        return;
      }
      onLinked({ kind: "fund", id: selectedFund.id, label: selectedFund.nom, matchedOn: "selection" });
      return;
    }

    // Titre coté : doit correspondre au référentiel → liaison obligatoire.
    if (isCote) {
      if (!code.trim() && !(attrs.isin ?? "").trim()) {
        setError("Renseigne le code ou l'ISIN du titre coté.");
        return;
      }
      setError(null);
      start(async () => {
        const res = await lookupReferenceAction(code, attrs.isin ?? "");
        if (res.ok && res.data) {
          onLinked(res.data);
          return;
        }
        setError(
          "Titre coté introuvable dans le référentiel. Vérifie le code / ISIN, ou choisis « Non coté ».",
        );
      });
      return;
    }

    // Titre non coté (ou autre type) : création, avec garde-fou anti-doublon.
    if (!code.trim() || !name.trim()) {
      setError("Le code et le nom sont obligatoires.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await lookupReferenceAction(code, attrs.isin ?? "");
      if (res.ok && res.data) {
        setRefMatch(res.data); // demande de confirmation (lier plutôt que dupliquer)
        return;
      }
      doCreate();
    });
  };

  return (
    <div className="mt-2 p-3 border border-blue-500/30 bg-blue-500/5 rounded-md">
      <div className="text-[11px] font-semibold text-blue-200 mb-2">
        {isLink ? "Lier" : "Créer le titre"} « {initial.code} »
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {/* Type */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Type</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as PortfolioSection);
              clear();
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

        {/* Statut de cotation (actions & obligations) */}
        {listable && (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Statut de cotation
            </span>
            <select value={listing} onChange={(e) => setAttr("cote", e.target.value)} className={inputCls}>
              <option value="noncote">Non coté</option>
              <option value="cote">Coté (référentiel)</option>
            </select>
          </label>
        )}

        {/* Code / Symbole (universel) */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Code / Symbole</span>
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              clear();
            }}
            className={inputCls}
          />
        </label>

        {kind === "opcvm" ? (
          /* OPCVM/FCP : sélection en cascade dans le référentiel (SGO → FCP). */
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Société de gestion
              </span>
              <select
                value={mgr}
                onChange={(e) => {
                  setMgr(e.target.value);
                  setFundId("");
                  clear();
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
                value={fundId}
                disabled={!mgr}
                onChange={(e) => {
                  setFundId(e.target.value);
                  clear();
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
        ) : isCote ? (
          /* Coté : seuls code/ISIN comptent (le reste vient du référentiel). */
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">ISIN</span>
            <input
              value={attrs.isin ?? ""}
              onChange={(e) => setAttr("isin", e.target.value)}
              placeholder="CI0000000000"
              className={inputCls}
            />
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Nom</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clear();
                }}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Devise</span>
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  clear();
                }}
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
              <TreasuryFields attrs={attrs} setAttr={setAttr} inputCls={inputCls} />
            ) : (
              detailFields.map((def) => (
                <AttrField
                  key={def.key}
                  def={def}
                  value={attrs[def.key] ?? ""}
                  onChange={(v) => setAttr(def.key, v)}
                />
              ))
            )}
          </>
        )}
      </div>
      {isCote && (
        <p className="text-[11px] text-slate-400 mt-2">
          Un titre coté doit correspondre à un code ou un ISIN du référentiel du site.
        </p>
      )}
      {refMatch ? (
        <div className="mt-3 p-3 border border-emerald-500/40 bg-emerald-500/5 rounded-md">
          <div className="text-[12px] text-emerald-200">
            L&apos;{refMatch.matchedOn === "isin" ? "ISIN" : "code"} saisi correspond déjà à un
            titre du référentiel :
          </div>
          <div className="mt-1 text-sm text-slate-100">
            <span className="font-medium">{refMatch.label}</span>{" "}
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
              {MATCH_LABELS[refMatch.kind]}
            </span>{" "}
            <span className="font-mono text-[11px] text-slate-400">{refMatch.id}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Veux-tu lier cette ligne au titre existant (recommandé) plutôt que créer un doublon ?
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              type="button"
              onClick={() => onLinked(refMatch)}
              disabled={pending}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-emerald-500/50 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25 transition disabled:opacity-50"
            >
              Lier au titre du référentiel
            </button>
            <button
              type="button"
              onClick={doCreate}
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
            >
              {pending ? "Création…" : "Créer un titre personnalisé quand même"}
            </button>
            <button
              type="button"
              onClick={() => setRefMatch(null)}
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded-md text-slate-400 hover:text-slate-200 transition"
            >
              Retour
            </button>
          </div>
          {error && <span className="text-[12px] text-red-400 block mt-2">{error}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-blue-500/50 bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition disabled:opacity-50"
          >
            {pending
              ? isLink
                ? "Recherche…"
                : "Vérification…"
              : kind === "opcvm"
                ? "Lier le FCP"
                : isCote
                  ? "Rechercher et lier"
                  : "Créer et lier"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 transition"
          >
            Annuler
          </button>
          {error && <span className="text-[12px] text-red-400">{error}</span>}
        </div>
      )}
    </div>
  );
}

// Ligne du tableau (aperçu ou portefeuille enregistré).
type RowLike = {
  rawCode: string;
  rawLabel: string;
  quantity: number | null;
  pru: number | null;
  price: number | null;
  accruedInterest: number | null;
  valuation: number | null;
  matchKind: MatchKind;
  matchId: string;
  matchLabel: string;
};

function PositionRowView({
  row,
  resolveButton,
  customForm,
}: {
  row: RowLike;
  resolveButton?: React.ReactNode;
  customForm?: React.ReactNode;
}) {
  const href = hrefForMatch(row.matchKind, row.matchId);
  return (
    <>
      <tr className="border-b border-slate-800/60 last:border-0">
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-slate-200">{row.rawCode}</span>
            <MatchBadge kind={row.matchKind} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {row.matchLabel && row.matchLabel !== row.rawLabel ? (
              href ? (
                <Link href={href} className="text-blue-300 hover:text-blue-200" target="_blank">
                  {row.matchLabel} ↗
                </Link>
              ) : (
                row.matchLabel
              )
            ) : (
              row.rawLabel
            )}
          </div>
          {customForm}
        </td>
        <td className="px-3 py-2 text-right font-mono text-slate-300">{fmt(row.quantity, 0)}</td>
        <td className="px-3 py-2 text-right font-mono text-slate-400">{fmt(row.pru, 2)}</td>
        <td className="px-3 py-2 text-right font-mono text-slate-400">{fmt(row.price, 2)}</td>
        <td className="px-3 py-2 text-right font-mono text-slate-400">{fmt(row.accruedInterest, 0)}</td>
        <td className="px-3 py-2 text-right font-mono text-slate-200">{fmt(row.valuation, 0)}</td>
        <td className="px-3 py-2 text-right">{resolveButton}</td>
      </tr>
    </>
  );
}

function SectionTable({
  section,
  children,
  subtotal,
}: {
  section: PortfolioSection;
  children: React.ReactNode;
  subtotal: number;
}) {
  return (
    <div className="border border-slate-800 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/60 border-b border-slate-800">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          {SECTION_LABELS[section]}
        </span>
        <span className="text-[11px] font-mono text-slate-400">{fmt(subtotal, 0)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500 border-b border-slate-800">
              <th className="px-3 py-1.5 text-left font-medium">Titre</th>
              <th className="px-3 py-1.5 text-right font-medium">Quantité</th>
              <th className="px-3 py-1.5 text-right font-medium">PRU</th>
              <th className="px-3 py-1.5 text-right font-medium">Cours</th>
              <th className="px-3 py-1.5 text-right font-medium">Int. courus</th>
              <th className="px-3 py-1.5 text-right font-medium">Valorisation</th>
              <th className="px-3 py-1.5"></th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function subtotalOf(rows: { section: PortfolioSection; valuation: number | null }[], section: PortfolioSection): number {
  return rows.filter((r) => r.section === section).reduce((s, r) => s + (r.valuation ?? 0), 0);
}

export default function PortfolioPanel({
  fundId,
  initialPortfolios = [],
}: {
  fundId: string;
  initialPortfolios?: PortfolioSnapshot[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [slot, setSlot] = useState<PortfolioSlot>("fin");
  const [asOfDate, setAsOfDate] = useState<string>(today);

  // Inventaires enregistrés (0 à 3), indexés par slot.
  const bySlot = new Map(initialPortfolios.map((p) => [p.slot, p]));
  const firstAvailable = SLOT_ORDER.find((sl) => bySlot.has(sl)) ?? "fin";
  const [viewSlot, setViewSlot] = useState<PortfolioSlot>(firstAvailable);
  const viewed = bySlot.get(viewSlot) ?? null;

  const [parsed, setParsed] = useState<ParsedInventory | null>(null);
  const [positions, setPositions] = useState<ImportedPosition[]>([]);
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [importing, startImport] = useTransition();
  const [savingPortfolio, startSave] = useTransition();
  const [reclassing, startReclass] = useTransition();

  const handleReclassify = () => {
    startReclass(async () => {
      const res = await reclassifyFundPortfoliosAction(fundId);
      if (res.ok) router.refresh();
    });
  };

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
      const res = await importInventoryAction(fundId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setParsed(res.data);
      setPositions(res.data.positions);
      setResolvingIndex(null);
    });
  };

  // Applique un titre custom fraîchement créé à toutes les lignes non reconnues
  // partageant le même code.
  const applyCustom = (created: { id: string; name: string; code: string }) => {
    const target = normCode(created.code);
    setPositions((prev) =>
      prev.map((p) =>
        (p.matchKind === "unmatched" || p.matchKind === "cash") &&
        normCode(p.rawCode) === target
          ? {
              ...p,
              matchKind: "custom",
              matchId: created.id,
              matchLabel: created.name,
              matchHref: "",
              customSecurityId: created.id,
            }
          : p,
      ),
    );
    setResolvingIndex(null);
  };

  // Lie la ligne en cours à un titre reconnu du référentiel (au lieu de créer
  // un titre personnalisé).
  const applyLinked = (match: ReferenceMatch) => {
    if (resolvingIndex == null) return;
    const idx = resolvingIndex;
    setPositions((prev) =>
      prev.map((p, i) =>
        i === idx
          ? {
              ...p,
              matchKind: match.kind,
              matchId: match.id,
              matchLabel: match.label,
              matchHref: hrefForMatch(match.kind, match.id),
              customSecurityId: null,
            }
          : p,
      ),
    );
    setResolvingIndex(null);
  };

  const handleSave = () => {
    if (!parsed) return;
    if (!asOfDate) {
      setError("Renseigne la date de l'inventaire.");
      return;
    }
    setError(null);
    startSave(async () => {
      const res = await savePortfolioAction(fundId, {
        slot,
        asOfDate,
        label: parsed.label,
        totalValuation: parsed.totalValuation,
        positions,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo(`« ${SLOT_LABELS[slot]} » enregistré au ${asOfDate}.`);
      setParsed(null);
      setPositions([]);
      setViewSlot(slot);
      router.refresh();
    });
  };

  const unmatchedCount = positions.filter((p) => p.matchKind === "unmatched").length;
  const matchedCount = positions.filter(
    (p) => p.matchKind !== "unmatched" && p.matchKind !== "cash",
  ).length;
  const cashCount = positions.filter((p) => p.matchKind === "cash").length;

  return (
    <div className="space-y-5">
      {/* Barre d'import */}
      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Importer un inventaire</h3>
        <p className="text-[11px] text-slate-500 mb-3">
          Dépose le fichier Excel de l&apos;inventaire du fonds (format NSIA : Code/Symbole, Titre,
          Quantité, PRU, Prix de revient, Cours, Intérêts courus, Valorisation). Les titres reconnus
          sont liés automatiquement ; les autres pourront être créés.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Type d&apos;inventaire
            </span>
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value as PortfolioSlot)}
              className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-white focus:outline-none focus:border-blue-500"
            >
              {SLOT_ORDER.map((sl) => (
                <option key={sl} value={sl}>
                  {SLOT_LABELS[sl]}
                  {bySlot.has(sl) ? ` — déjà importé (${bySlot.get(sl)!.asOfDate})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              Date de l&apos;inventaire
            </span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-white focus:outline-none focus:border-blue-500"
            />
          </label>
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
            {importing ? "Analyse…" : "Analyser le fichier"}
          </button>
          {error && <span className="text-[12px] text-red-400 self-center">{error}</span>}
          {info && <span className="text-[12px] text-emerald-400 self-center">✓ {info}</span>}
        </div>
        {bySlot.has(slot) && (
          <p className="text-[11px] text-amber-400/90 mt-2">
            ⚠️ Un « {SLOT_LABELS[slot]} » existe déjà (au {bySlot.get(slot)!.asOfDate}) : il sera
            remplacé à l&apos;enregistrement.
          </p>
        )}
      </section>

      {/* Aperçu de l'import (non enregistré) */}
      {parsed && (
        <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Aperçu — {parsed.label}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {positions.length} lignes · {matchedCount} reconnues · {cashCount} trésorerie ·{" "}
                <span className={unmatchedCount > 0 ? "text-amber-400" : ""}>
                  {unmatchedCount} à créer
                </span>{" "}
                · Total {fmt(parsed.totalValuation, 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Enregistrement : <strong className="text-slate-300">{SLOT_LABELS[slot]}</strong> au{" "}
                {asOfDate}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setParsed(null);
                  setPositions([]);
                }}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={savingPortfolio}
                className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50"
                title={unmatchedCount > 0 ? "Des lignes ne sont pas reconnues (elles seront enregistrées comme non reconnues)" : undefined}
              >
                {savingPortfolio ? "Enregistrement…" : "Enregistrer le portefeuille"}
              </button>
            </div>
          </div>

          {unmatchedCount > 0 && (
            <p className="text-[11px] text-amber-400/90 bg-amber-500/5 border border-amber-500/20 rounded px-3 py-2">
              {unmatchedCount} ligne(s) au code non reconnu. Clique sur « Créer le titre » pour les
              rattacher, ou enregistre tel quel.
            </p>
          )}

          {SECTION_ORDER.filter((sec) => positions.some((p) => p.section === sec)).map((sec) => (
            <SectionTable key={sec} section={sec} subtotal={subtotalOf(positions, sec)}>
              {positions.map((p, i) =>
                p.section === sec ? (
                  <PositionRowView
                    key={i}
                    row={p}
                    resolveButton={
                      p.matchKind === "unmatched" || p.matchKind === "cash" ? (
                        <button
                          type="button"
                          onClick={() => setResolvingIndex(resolvingIndex === i ? null : i)}
                          className={`text-[11px] transition whitespace-nowrap ${
                            p.matchKind === "cash"
                              ? "text-slate-400 hover:text-slate-200"
                              : "text-amber-300 hover:text-amber-200"
                          }`}
                        >
                          {resolvingIndex === i
                            ? "Fermer"
                            : p.matchKind === "cash"
                              ? "Enregistrer en titre"
                              : "Créer le titre"}
                        </button>
                      ) : null
                    }
                    customForm={
                      resolvingIndex === i ? (
                        <CustomSecurityForm
                          initial={{
                            kind: p.section,
                            code: p.rawCode,
                            name: p.rawLabel,
                            currency: "XOF",
                            attributes: {},
                          }}
                          onCancel={() => setResolvingIndex(null)}
                          onCreated={applyCustom}
                          onLinked={applyLinked}
                        />
                      ) : null
                    }
                  />
                ) : null,
              )}
            </SectionTable>
          ))}
        </section>
      )}

      {/* Inventaires enregistrés : navigation début / intermédiaire / fin */}
      {!parsed && initialPortfolios.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-slate-500">
              Le classement des lignes suit le référentiel titres du fonds.
            </p>
            <button
              type="button"
              onClick={handleReclassify}
              disabled={reclassing}
              title="Re-classer les inventaires selon l'état actuel du référentiel"
              className="px-3 py-1.5 text-sm rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
            >
              {reclassing ? "Actualisation…" : "↻ Actualiser le classement"}
            </button>
          </div>
          <div className="flex gap-1 border-b border-slate-800 overflow-x-auto">
            {SLOT_ORDER.map((sl) => {
              const snap = bySlot.get(sl);
              const active = sl === viewSlot;
              return (
                <button
                  key={sl}
                  type="button"
                  disabled={!snap}
                  onClick={() => snap && setViewSlot(sl)}
                  className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
                    active
                      ? "border-blue-400 text-white"
                      : snap
                        ? "border-transparent text-slate-400 hover:text-slate-200"
                        : "border-transparent text-slate-600 cursor-not-allowed"
                  }`}
                >
                  {SLOT_LABELS[sl]}
                  <span className="ml-1.5 text-[10px] text-slate-500">
                    {snap ? snap.asOfDate : "non importé"}
                  </span>
                </button>
              );
            })}
          </div>

          {viewed ? (
            <>
              <p className="text-[11px] text-slate-500">
                {viewed.positions.length} lignes · Total {fmt(viewed.totalValuation, 0)}
                {viewed.label ? ` · ${viewed.label}` : ""}
              </p>
              {SECTION_ORDER.filter((sec) => viewed.positions.some((p) => p.section === sec)).map(
                (sec) => (
                  <SectionTable key={sec} section={sec} subtotal={subtotalOf(viewed.positions, sec)}>
                    {viewed.positions.map((p) =>
                      p.section === sec ? <PositionRowView key={p.id} row={p} /> : null,
                    )}
                  </SectionTable>
                ),
              )}
            </>
          ) : (
            <p className="text-[12px] text-slate-500">Cet inventaire n&apos;a pas encore été importé.</p>
          )}
        </section>
      )}

      {/* État vide */}
      {!parsed && initialPortfolios.length === 0 && (
        <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-8 text-center text-sm text-slate-500">
          Aucun inventaire pour ce fonds. Choisis le type (début / intermédiaire / fin), la date, puis
          importe un fichier.
        </section>
      )}
    </div>
  );
}

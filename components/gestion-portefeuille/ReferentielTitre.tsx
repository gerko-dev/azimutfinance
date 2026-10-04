"use client";

// === Le référentiel titre, vu depuis une ligne d'inventaire ===============
//
// EXTRAIT DE `PortfolioPanel`, SANS UNE LIGNE DE CHANGEMENT. Ces pièces —
// le formulaire de fiche, la ligne de position, le tableau par classe — ne
// servaient qu'à l'import d'un fonds. L'import groupé en a besoin des mêmes :
// il montre les mêmes lignes, ouvre les mêmes fiches, et doit le faire
// EXACTEMENT pareil. Les réécrire aurait garanti qu'un jour les deux écrans
// divergent sur ce qu'est un titre.
//
// Elles vivent donc ici, et les deux écrans les empruntent.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  createCustomSecurityAction,
  getSecurityDefaultsAction,
  listFundReferentialAction,
  lookupReferenceAction,
  updateCustomSecurityAction,
} from "@/app/gestion-portefeuille/portfolio-actions";
import {
  MATCH_LABELS,
  SECTION_LABELS,
  hrefForMatch,
  type CustomSecurity,
  type CustomSecurityInput,
  type FundOption,
  type ImportedPosition,
  type MatchKind,
  type PortfolioSection,
  type ReferenceMatch,
} from "@/app/gestion-portefeuille/portfolio-types";
import {
  KIND_OPTIONS,
  LISTABLE_KINDS,
  SECURITY_FIELDS,
  type FieldDef,
} from "@/app/gestion-portefeuille/portfolio-security-schema";
import type { CoursSite } from "@/app/gestion-portefeuille/cours-types";
import TreasuryFields from "./TreasuryFields";

export const CURRENCIES = ["XOF", "EUR", "USD"] as const;

export const SECTION_ORDER: PortfolioSection[] = [
  "action",
  "obligation",
  "opcvm",
  "dat",
  "tresorerie",
  "autre",
];

export function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function normCode(s: string): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Même normalisation de nom que le matcher serveur : accents, ponctuation et
 *  casse ignorés. Les deux doivent rester d'accord, sinon une ligne reconnue
 *  au serveur ne le serait plus après création côté client. */
export function normName(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Pastille de statut selon la reconnaissance.
export function MatchBadge({ kind }: { kind: MatchKind }) {
  const cls: Record<MatchKind, string> = {
    stock: "bg-emerald-50 text-emerald-700",
    "listed-bond": "bg-emerald-50 text-emerald-700",
    sovereign: "bg-emerald-50 text-emerald-700",
    fund: "bg-emerald-50 text-emerald-700",
    custom: "bg-blue-50 text-blue-700",
    dat: "bg-violet-50 text-violet-700",
    cash: "bg-slate-200 text-slate-600",
    unmatched: "bg-amber-50 text-amber-700",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${cls[kind]}`}>
      {MATCH_LABELS[kind]}
    </span>
  );
}

const inputCls =
  "px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500";

// Rendu d'un champ (attribut) piloté par le schéma du type de titre.
export function AttrField({
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
export function CustomSecurityForm({
  initial,
  onCancel,
  onCreated,
  onLinked,
}: {
  initial: CustomSecurityInput;
  onCancel: () => void;
  /** Reçoit la fiche ENTIÈRE, attributs compris : l'appelant en a besoin pour
   *  que « Modifier » la retrouve ensuite telle qu'elle vient d'être saisie. */
  onCreated: (created: CustomSecurity) => void;
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

  // Caractéristiques d'origine d'un titre DÉJÀ lié au site. Un titre coté ne
  // se saisit pas — tout vient du référentiel — mais le gérant doit pouvoir
  // VÉRIFIER ce que la liaison a apporté : coupon, échéance, nominal. Sans cet
  // affichage, « Modifier » sur une ligne liée ne montre qu'un code et un
  // ISIN, et rien ne dit si le bon titre a été attrapé.
  const sourceLiee = initial.attributes?.source ?? "";
  const refLiee = initial.attributes?.refId ?? "";
  const [caracteristiques, setCaracteristiques] = useState<Record<string, string> | null>(null);
  const [caracteristiquesLues, setCaracteristiquesLues] = useState(false);

  useEffect(() => {
    if (!sourceLiee || !refLiee) return;
    let alive = true;
    getSecurityDefaultsAction(sourceLiee, refLiee)
      .then((res) => {
        if (!alive) return;
        setCaracteristiques(res.ok ? res.data : null);
      })
      .finally(() => {
        // Marqué lu même en échec : sinon l'écran resterait sur « Lecture… »
        // indéfiniment, et l'absence de référence passerait pour un chargement
        // qui n'en finit pas.
        if (alive) setCaracteristiquesLues(true);
      });
    return () => {
      alive = false;
    };
  }, [sourceLiee, refLiee]);

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

  // `initial.name` porte le libellé de l'inventaire tel qu'il a ouvert ce
  // formulaire. On le transmet même si le gérant a renommé le titre : c'est la
  // clef que le prochain import présentera.
  const buildInput = (): CustomSecurityInput => ({
    kind,
    code,
    name,
    currency,
    attributes: attrs,
    libelleInventaire: initial.name,
    // Le fonds vient de l'écran, pas du formulaire : c'est le portefeuille
    // dont on est en train de lire l'inventaire. Un compte créé ici lui
    // appartient, et le rapprochement ne le prêtera à aucun autre.
    fondsId: initial.fondsId,
  });

  // Enregistre le titre personnalisé (après vérif / choix explicite).
  //
  // CORRIGER N'EST PAS RECRÉER. Quand le formulaire a été ouvert sur une fiche
  // existante, on la MET À JOUR. Passer par la création la faisait buter sur
  // l'unicité du code, et le repli de fusion ne remplit que les champs vides :
  // changer le pays d'un compte déjà renseigné était accepté à l'écran, puis
  // silencieusement ignoré en base.
  const doCreate = () => {
    start(async () => {
      const res = initial.ficheId
        ? await updateCustomSecurityAction(initial.ficheId, buildInput())
        : await createCustomSecurityAction(buildInput());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCreated(res.data);
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
      onLinked({
        kind: "fund",
        id: selectedFund.id,
        label: selectedFund.nom,
        matchedOn: "selection",
        // Un OPCVM n'a ni symbole BRVM ni ISIN : on conserve le code saisi par
        // le gérant, qui est celui de son propre plan comptable.
        code: code.trim(),
        isin: "",
      });
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
    <div className="mt-2 p-3 border border-blue-200 bg-blue-50 rounded-md">
      <div className="text-[11px] font-semibold text-blue-800 mb-2">
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
        <p className="text-[11px] text-slate-500 mt-2">
          Un titre coté doit correspondre à un code ou un ISIN du référentiel du site.
        </p>
      )}

      {/* Ce que la liaison a apporté. En lecture seule : ces valeurs viennent du
          référentiel du site et s'y mettent à jour toutes seules — les recopier
          en dur figerait un coupon ou un encours qui bouge. */}
      {sourceLiee && refLiee && (
        <div className="mt-3 p-3 border border-slate-200 bg-slate-50 rounded-md">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            Caractéristiques héritées du site
          </div>
          {!caracteristiquesLues ? (
            <p className="text-[11px] text-slate-500">Lecture du référentiel…</p>
          ) : caracteristiques && Object.keys(caracteristiques).length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
              {(SECURITY_FIELDS[kind] ?? [])
                .filter((def) => def.key !== "cote" && (caracteristiques[def.key] ?? "") !== "")
                .map((def) => (
                  <div key={def.key}>
                    <div className="text-[10px] text-slate-600">{def.label}</div>
                    <div className="text-[12px] text-slate-600">
                      {caracteristiques[def.key]}
                      {def.unit ? ` ${def.unit}` : ""}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-[11px] text-amber-700">
              Référence introuvable au référentiel du site ({sourceLiee} · {refLiee}). La liaison
              est cassée : re-saisissez le code ou l&apos;ISIN.
            </p>
          )}
        </div>
      )}
      {refMatch ? (
        <div className="mt-3 p-3 border border-emerald-300 bg-emerald-50 rounded-md">
          <div className="text-[12px] text-emerald-800">
            L&apos;{refMatch.matchedOn === "isin" ? "ISIN" : "code"} saisi correspond déjà à un
            titre du référentiel :
          </div>
          <div className="mt-1 text-sm text-slate-900">
            <span className="font-medium">{refMatch.label}</span>{" "}
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
              {MATCH_LABELS[refMatch.kind]}
            </span>{" "}
            <span className="font-mono text-[11px] text-slate-500">{refMatch.id}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Veux-tu lier cette ligne au titre existant (recommandé) plutôt que créer un doublon ?
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              type="button"
              onClick={() => onLinked(refMatch)}
              disabled={pending}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50"
            >
              Lier au titre du référentiel
            </button>
            <button
              type="button"
              onClick={doCreate}
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
            >
              {pending ? "Création…" : "Créer un titre personnalisé quand même"}
            </button>
            <button
              type="button"
              onClick={() => setRefMatch(null)}
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded-md text-slate-500 hover:text-slate-900 transition"
            >
              Retour
            </button>
          </div>
          {error && <span className="text-[12px] text-red-600 block mt-2">{error}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition disabled:opacity-50"
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
            className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 transition"
          >
            Annuler
          </button>
          {error && <span className="text-[12px] text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}

/** Provenances qui désignent une vraie référence du référentiel de marché. */
export const KINDS_LIES = new Set<MatchKind>(["stock", "listed-bond", "sovereign", "fund"]);

/**
 * État initial du formulaire pour une ligne d'inventaire.
 *
 * LA FICHE ATTACHÉE FAIT FOI QUAND IL Y EN A UNE.
 *
 * Ce formulaire repartait de la seule ligne importée, sans jamais lire la
 * fiche à laquelle elle est pourtant rattachée. Sur un compte de trésorerie,
 * il rouvrait donc vide : pays, banque, canal, nature et type de compte —
 * tous déjà renseignés au référentiel — étaient redemandés.
 *
 * Et l'enregistrement n'écrasait pas la fiche : il en créait une SECONDE. Le
 * dédoublonnage porte sur le CODE, or le formulaire présentait celui de
 * l'inventaire (« ORASNDEC ») là où la fiche portait celui du gérant
 * (« ORANGE SN »). Dix-neuf noms du référentiel se sont ainsi retrouvés
 * portés par deux fiches, parfois trois.
 *
 * Rouvrir « Modifier » doit retrouver ce qui est enregistré — code compris,
 * puisque c'est lui qui décide si l'on corrige une fiche ou si l'on en crée
 * une autre.
 */
export function initialDeLaLigne(
  p: ImportedPosition,
  fiches: Map<string, CustomSecurity>,
): CustomSecurityInput {
  const fiche = p.customSecurityId ? fiches.get(p.customSecurityId) : undefined;
  if (fiche) {
    return {
      ficheId: fiche.id,
      kind: fiche.kind,
      code: fiche.code,
      name: fiche.name,
      currency: fiche.currency || "XOF",
      // Copie : le formulaire va les modifier, et muter l'objet du
      // référentiel ferait diverger la liste affichée de ce qui est en base.
      attributes: { ...(fiche.attributes ?? {}) },
    };
  }

  const attributes: Record<string, string> = {};
  if (KINDS_LIES.has(p.matchKind)) {
    attributes.cote = "cote";
    attributes.source = p.matchKind;
    attributes.refId = p.matchId;
    if (p.matchIsin) attributes.isin = p.matchIsin;
  }
  return {
    kind: p.section,
    code: p.rawCode,
    // Le nom de l'INVENTAIRE, pas le nom officiel du site : c'est lui qui doit
    // figurer au référentiel pour que le rapprochement par nom exact opère au
    // prochain import.
    name: p.rawLabel,
    currency: "XOF",
    attributes,
  };
}

// Ligne du tableau (aperçu ou portefeuille enregistré).
export type RowLike = {
  rawCode: string;
  rawLabel: string;
  quantity: number | null;
  pru: number | null;
  /** Prix de revient total. Importé de longue date, il n'était pas affiché :
   *  une colonne du fichier qu'on ne montre pas est indiscernable d'une
   *  colonne qu'on n'a pas lue. */
  cost: number | null;
  price: number | null;
  accruedInterest: number | null;
  valuation: number | null;
  matchKind: MatchKind;
  matchId: string;
  matchLabel: string;
  /** ISIN hérité du référentiel, quand le rapprochement l'a apporté. */
  matchIsin?: string;
};

export function PositionRowView({
  row,
  cours,
  resolveButton,
  customForm,
}: {
  row: RowLike;
  /** Dernier cours connu AU SITE, lu au rendu. Null hors cote. */
  cours?: CoursSite | null;
  resolveButton?: React.ReactNode;
  customForm?: React.ReactNode;
}) {
  const href = hrefForMatch(row.matchKind, row.matchId);
  return (
    <>
      <tr className="border-b border-slate-200 last:border-0">
        <td className="px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] text-slate-800">{row.rawCode || "—"}</span>
            {row.matchIsin && (
              <span
                className="font-mono text-[10px] text-slate-500"
                title="ISIN hérité du référentiel"
              >
                {row.matchIsin}
              </span>
            )}
            <MatchBadge kind={row.matchKind} />
          </div>
          {/* LE NOM DE L'INVENTAIRE d'abord : c'est celui que le gérant lit
              dans ses états, et celui que le référentiel enregistre. La
              dénomination officielle du site ne le remplace pas — elle
              s'ajoute en dessous, discrète, avec le lien vers la fiche. */}
          <div className="text-[11px] text-slate-500 mt-0.5">
            {row.rawLabel || row.matchLabel}
          </div>
          {row.matchLabel && row.matchLabel !== row.rawLabel && (
            <div className="text-[10px] text-slate-600 mt-0.5">
              {href ? (
                <Link href={href} className="text-blue-600 hover:text-blue-800" target="_blank">
                  {row.matchLabel} ↗
                </Link>
              ) : (
                row.matchLabel
              )}
            </div>
          )}
          {customForm}
        </td>
        <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(row.quantity, 0)}</td>
        <td className="px-3 py-2 text-right font-mono text-slate-500">{fmt(row.pru, 2)}</td>
        <td className="px-3 py-2 text-right font-mono text-slate-500">{fmt(row.cost, 0)}</td>
        {/* DEUX COURS, ET ILS NE DISENT PAS LA MÊME CHOSE. Celui de
            l'inventaire vaut à la date d'arrêté et sert à recouper avec le
            dépositaire ; celui du site est le dernier connu sur le marché.
            Remplacer l'un par l'autre aurait cassé le rapprochement ; les
            afficher côte à côte fait apparaître l'écart, qui est
            précisément ce qu'on cherche. */}
        <td className="px-3 py-2 text-right font-mono text-slate-500">{fmt(row.price, 2)}</td>
        <td className="px-3 py-2 text-right font-mono">
          {cours ? (
            <>
              <span className="text-slate-700">{fmt(cours.prix, 2)}</span>
              <div className="text-[9px] text-slate-400">{cours.date}</div>
              {row.price != null && row.price > 0 && (
                <div
                  className={`text-[9px] ${
                    cours.prix >= row.price ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {cours.prix >= row.price ? "+" : ""}
                  {(((cours.prix - row.price) / row.price) * 100).toFixed(1)} %
                </div>
              )}
            </>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right font-mono text-slate-500">{fmt(row.accruedInterest, 0)}</td>
        <td className="px-3 py-2 text-right font-mono text-slate-800">{fmt(row.valuation, 0)}</td>
        <td className="px-3 py-2 text-right">{resolveButton}</td>
      </tr>
    </>
  );
}

export function SectionTable({
  section,
  children,
  subtotal,
}: {
  section: PortfolioSection;
  children: React.ReactNode;
  subtotal: number;
}) {
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          {SECTION_LABELS[section]}
        </span>
        <span className="text-[11px] font-mono text-slate-500">{fmt(subtotal, 0)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500 border-b border-slate-200">
              <th className="px-3 py-1.5 text-left font-medium">Titre</th>
              <th className="px-3 py-1.5 text-right font-medium">Quantité</th>
              <th className="px-3 py-1.5 text-right font-medium">PRU</th>
              <th className="px-3 py-1.5 text-right font-medium">Prix de revient</th>
              <th className="px-3 py-1.5 text-right font-medium">Cours inventaire</th>
              <th className="px-3 py-1.5 text-right font-medium">Cours site</th>
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

export function subtotalOf(rows: { section: PortfolioSection; valuation: number | null }[], section: PortfolioSection): number {
  return rows.filter((r) => r.section === section).reduce((s, r) => s + (r.valuation ?? 0), 0);
}

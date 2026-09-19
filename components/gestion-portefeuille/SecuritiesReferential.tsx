"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addSecurityToFundAction,
  getSecurityDefaultsAction,
  listFundReferentialAction,
  listFundSecuritiesAction,
  lookupReferenceAction,
  resynchroniserReferentielAction,
  unlinkSecurityFromFundAction,
  updateCustomSecurityAction,
  type BilanResync,
} from "@/app/gestion-portefeuille/portfolio-actions";
import type {
  CustomSecurity,
  CustomSecurityInput,
  FundOption,
  PortfolioSection,
} from "@/app/gestion-portefeuille/portfolio-types";
import {
  champsManquants,
  estLieAuSite,
  KIND_OPTIONS,
  libelleChamp,
  LISTABLE_KINDS,
  SECURITY_FIELDS,
  type FieldDef,
} from "@/app/gestion-portefeuille/portfolio-security-schema";
import TreasuryFields from "./TreasuryFields";

const CURRENCIES = ["XOF", "EUR", "USD"] as const;
const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.map((k) => [k.value, k.label]),
);

const inputCls =
  "px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500";

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
  // Même test que le tableau : « dat » et « cash » ne sont pas des sources.
  const linkedToSite = estLieAuSite(security?.attributes);
  const [defaults, setDefaults] = useState<Record<string, string> | null>(null);
  // Titre coté en cours de saisie : correspondance trouvée dans le référentiel
  // du site (affichée pour confirmer que les infos sont reprises).
  const [cotedInfo, setCotedInfo] = useState<{ label: string; id: string } | null>(null);

  // Lecture terminée — indépendamment de son résultat. Distinguer « pas encore
  // répondu » de « a répondu sans rien trouver » est indispensable : sans cette
  // distinction, un titre dont la référence est introuvable laissait le
  // formulaire bloqué sur « Chargement du référentiel… », sans issue.
  const [lectureFaite, setLectureFaite] = useState(false);

  // Récupère les paramètres d'origine (site) et pré-remplit les champs vides.
  useEffect(() => {
    // Un titre non lié n'a aucune lecture à attendre : le cas est traité dans
    // `attenteReferentiel`, pas par un setState synchrone ici — la règle
    // react-hooks/set-state-in-effect du projet l'interdit.
    if (!linkedToSite) return;
    let alive = true;
    getSecurityDefaultsAction(source, refId)
      .then((res) => {
        if (!alive) return;
        const d = res.ok ? res.data : null;
        if (d) {
          setDefaults(d);
          setAttrs((prev) => {
            const next = { ...prev };
            for (const [k, v] of Object.entries(d)) {
              if (!(next[k] ?? "").trim()) next[k] = v;
            }
            return next;
          });
        }
      })
      // Une lecture en échec ne doit pas non plus laisser le formulaire figé.
      .finally(() => {
        if (alive) setLectureFaite(true);
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

  /** Complète les champs VIDES depuis le référentiel du site, sans toucher à
   *  ceux déjà saisis.
   *
   *  Distinct de « Paramètres d'origine », qui écrase tout : ici on répare un
   *  lien incomplet — titre marqué lié mais enregistré avant que les valeurs
   *  du site n'arrivent, ou rattaché après coup — sans perdre les corrections
   *  apportées à la main. */
  const resynchroniser = () => {
    if (!defaults) return;
    setAttrs((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(defaults)) {
        if (!(next[k] ?? "").trim() && (v ?? "").trim()) next[k] = v;
      }
      return next;
    });
    setError(null);
  };

  // Un titre lié dont les valeurs du site ne sont pas encore chargées ne doit
  // pas pouvoir être enregistré : il partirait avec `source` et `refId` mais
  // sans les attributs, et s'afficherait ensuite comme « Lié au site » tout en
  // étant vide. C'est la course qui produit des obligations liées sans date
  // d'échéance.
  // Le blocage ne dure que le temps de la lecture, jamais au-delà.
  const attenteReferentiel = linkedToSite && !lectureFaite;
  // Lien déclaré mais référence absente du site : l'enregistrement reste
  // possible — le gérant saisit à la main — mais il doit savoir que ce titre
  // n'héritera de rien.
  const referenceIntrouvable = linkedToSite && lectureFaite && defaults === null;

  // Champs requis encore vides dans le formulaire, pour proposer la
  // resynchronisation seulement quand elle a quelque chose à faire.
  const manquantsCourants = champsManquants(kind, attrs);

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
    <div ref={rootRef} className="mb-4 p-3 border border-blue-200 bg-blue-50 rounded-md scroll-mt-24">
      <div className="text-[11px] font-semibold text-blue-800 mb-2">
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
              <div className="md:col-span-2 lg:col-span-3 text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                ✓ Titre reconnu : <strong>{cotedInfo.label}</strong>{" "}
                <span className="font-mono text-[11px] text-slate-500">{cotedInfo.id}</span> — les
                caractéristiques du site sont reprises ci-dessous.
              </div>
            ) : (
              (code.trim() || (attrs.isin ?? "").trim()) && (
                <div className="md:col-span-2 lg:col-span-3 text-[11px] text-amber-600">
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
          disabled={pending || attenteReferentiel}
          title={
            attenteReferentiel
              ? "Chargement des caractéristiques du référentiel du site en cours"
              : undefined
          }
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition disabled:opacity-50"
        >
          {pending
            ? "Enregistrement…"
            : attenteReferentiel
              ? "Chargement du référentiel…"
              : isCote
                ? "Rechercher et lier"
                : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 transition"
        >
          Annuler
        </button>
        {defaults && manquantsCourants.length > 0 && (
          <button
            type="button"
            onClick={resynchroniser}
            disabled={pending}
            title={`Compléter depuis le site sans écraser la saisie : ${manquantsCourants
              .map((m) => libelleChamp(kind, m.key))
              .join(", ")}`}
            className="px-3 py-1.5 text-sm rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition"
          >
            Resynchroniser ({manquantsCourants.length})
          </button>
        )}
        {defaults && (
          <button
            type="button"
            onClick={restoreDefaults}
            disabled={pending}
            title="Rétablir les caractéristiques connues du référentiel du site — écrase la saisie"
            className="px-3 py-1.5 text-sm rounded-md border border-slate-300 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            Paramètres d&apos;origine
          </button>
        )}
        {error && <span className="text-[12px] text-red-600">{error}</span>}
        {referenceIntrouvable && !error && (
          <span className="text-[12px] text-amber-600">
            Référence du site introuvable pour ce titre — les caractéristiques ne
            peuvent pas être reprises automatiquement, saisis-les ci-dessus.
          </span>
        )}
      </div>
    </div>
  );
}

export default function SecuritiesReferential({ fundId }: { fundId: string }) {
  const [items, setItems] = useState<CustomSecurity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [bilan, setBilan] = useState<BilanResync | null>(null);
  const [resyncEnCours, startResync] = useTransition();
  const router = useRouter();
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
        return;
      }
      // Retirer un titre laisse ses lignes d'inventaire sans rattachement :
      // l'inventaire et l'allocation doivent le refléter immédiatement.
      router.refresh();
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
    // Enregistrer un titre reclasse les inventaires du fonds côté serveur
    // (reclassifyFundsLinkedTo). Sans ce refresh, l'inventaire et l'allocation
    // affichés gardent les props du chargement initial : la correction a bien
    // eu lieu en base, mais l'écran continue de montrer l'ancien classement —
    // ce qui donne l'impression qu'il faut ré-importer.
    router.refresh();
  };

  const editing = items?.find((s) => s.id === editingId) ?? null;
  // Titres dont il manque au moins un champ exploité par le module. Calculé
  // ici plutôt que dans la boucle : le compteur d'en-tête et la colonne
  // doivent dire la même chose.
  const incomplets = (items ?? []).filter(
    (s) => champsManquants(s.kind, s.attributes).length > 0,
  );

  const lancerResync = () =>
    startResync(async () => {
      setBilan(null);
      setError(null);
      const res = await resynchroniserReferentielAction(fundId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBilan(res.data);
      // Le lot a modifié la base : on relit plutôt que de recomposer l'état.
      const rafraichi = await listFundSecuritiesAction(fundId);
      if (rafraichi.ok) setItems(rafraichi.data);
      // Et les inventaires ont été reclassés côté serveur.
      router.refresh();
    });

  return (
    <section className="bg-white border border-slate-200 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Référentiel titres</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Titres de ce fonds, alimentés par ses imports d&apos;inventaire et les ajouts manuels.
            Les caractéristiques sont partagées entre fonds ; le retrait n&apos;affecte que ce fonds.
          </p>
          {items !== null && items.length > 0 && (
            <p className="text-[11px] mt-1">
              {incomplets.length === 0 ? (
                <span className="text-emerald-600">
                  {items.length} titre(s) — tous les champs exploités par le module sont
                  renseignés.
                </span>
              ) : (
                <span className="text-amber-600">
                  {incomplets.length} titre(s) sur {items.length} à compléter — des axes
                  d&apos;allocation ne peuvent pas les classer.
                </span>
              )}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {items !== null && items.length > 0 && (
            <button
              type="button"
              onClick={lancerResync}
              disabled={resyncEnCours}
              title="Complète les champs vides de tous les titres liés depuis le référentiel du site. Ne touche à aucune valeur déjà saisie."
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition disabled:opacity-50"
            >
              {resyncEnCours ? "Resynchronisation…" : "Resynchroniser le référentiel"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditingId(null);
            }}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
          >
            + Ajouter un titre
          </button>
        </div>
      </div>
      <div className="p-4">
        {error && <p className="mb-3 text-[12px] text-red-600">{error}</p>}

        {bilan && (
          <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600 font-medium">
                Resynchronisation — {bilan.examines} titre(s) examiné(s), {bilan.lies} lié(s)
                au site, <span className="text-emerald-600">{bilan.misAJour} complété(s)</span>
              </span>
              <button
                type="button"
                onClick={() => setBilan(null)}
                className="text-slate-500 hover:text-slate-700 transition"
              >
                Fermer
              </button>
            </div>

            {bilan.details.length > 0 && (
              <p className="text-slate-500">
                {bilan.details
                  .map((d) => `${d.code} (${d.champs.length} champ${d.champs.length > 1 ? "s" : ""})`)
                  .join(" · ")}
              </p>
            )}

            {bilan.liensInvalidesRetires.length > 0 && (
              <p className="text-slate-500">
                Faux liens retirés sur {bilan.liensInvalidesRetires.join(", ")} — dépôts à
                terme et comptes de trésorerie n&apos;ont pas de référence de marché ; ils
                étaient marqués « lié » par un import antérieur.
              </p>
            )}

            {bilan.referencesIntrouvables.length > 0 && (
              <p className="text-rose-700">
                Référence du site introuvable pour {bilan.referencesIntrouvables.join(", ")} —
                le lien pointe vers un titre qui n&apos;existe plus ou dont le code a changé.
              </p>
            )}

            {bilan.restentIncomplets.length > 0 && (
              <p className="text-amber-700">
                Restent à saisir à la main :{" "}
                {bilan.restentIncomplets
                  .map((r) => `${r.code} (${r.champs.length})`)
                  .join(" · ")}
                . Le site ne porte pas ces champs — titres locaux, ou paramètres absents
                de la référence.
              </p>
            )}

            {/* Un doublon de nom rend une partie du référentiel MUETTE : le
                titre existe et porte ses attributs, mais aucun inventaire ne
                l'atteindra par son nom. On le signale sans rien supprimer —
                fusionner deux titres est une décision de gestion. */}
            {bilan.nomsEnDoublon.length > 0 && (
              <div className="text-amber-700">
                <p>
                  {bilan.nomsEnDoublon.length} nom(s) en doublon : seul le premier titre de
                  chaque groupe est reconnu au rapprochement par nom, les autres sont
                  inatteignables. À fusionner ou à renommer.
                </p>
                <ul className="mt-1 space-y-0.5">
                  {bilan.nomsEnDoublon.slice(0, 12).map((d) => (
                    <li key={d.nom} className="text-[11px] text-amber-600">
                      <span className="text-slate-500">« {d.nom} »</span> — {d.codes.join(", ")}
                    </li>
                  ))}
                  {bilan.nomsEnDoublon.length > 12 && (
                    <li className="text-[11px] text-slate-500">
                      … {bilan.nomsEnDoublon.length - 12} autre(s)
                    </li>
                  )}
                </ul>
              </div>
            )}

            {bilan.misAJour === 0 &&
              bilan.liensInvalidesRetires.length === 0 &&
              bilan.referencesIntrouvables.length === 0 &&
              bilan.nomsEnDoublon.length === 0 &&
              bilan.restentIncomplets.length === 0 && (
                <p className="text-emerald-600">Rien à compléter : le référentiel est à jour.</p>
              )}
          </div>
        )}

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
          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Nom</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Alias
                    <span
                      className="block text-[9px] font-normal text-slate-400"
                      title="Libellés sous lesquels ce titre apparaît dans les inventaires importés. C'est par eux que le rapprochement se fait au prochain import."
                    >
                      libellés d&apos;inventaire
                    </span>
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">ISIN</th>
                  <th className="px-3 py-2 text-left font-medium">Devise</th>
                  <th className="px-3 py-2 text-left font-medium">Rattachement</th>
                  <th className="px-3 py-2 text-left font-medium">À compléter</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((sc) => {
                  const manquants = champsManquants(sc.kind, sc.attributes);
                  const lie = estLieAuSite(sc.attributes);
                  return (
                  <tr key={sc.id} className="border-b border-slate-200 last:border-0">
                    <td className="px-3 py-2 font-mono text-slate-800">{sc.code}</td>
                    <td className="px-3 py-2 text-slate-600">{sc.name}</td>
                    {/* L'alias est la CLEF de rapprochement : un titre sans
                        alias sera redemandé à la création au prochain import,
                        même s'il figure déjà ici. Le signaler évite de chercher
                        ailleurs une cause qui est là. */}
                    <td className="px-3 py-2 text-slate-500">
                      {(() => {
                        const alias = (sc.attributes?.alias ?? "")
                          .split("|")
                          .map((a) => a.trim())
                          .filter(Boolean);
                        if (alias.length === 0)
                          return (
                            <span
                              className="text-[10px] text-amber-600"
                              title="Aucun libellé d'inventaire mémorisé : ce titre sera redemandé à la création au prochain import."
                            >
                              aucun
                            </span>
                          );
                        return (
                          <span className="text-[11px]" title={alias.join(" · ")}>
                            {alias[0]}
                            {alias.length > 1 && (
                              <span className="text-slate-400"> +{alias.length - 1}</span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{KIND_LABEL[sc.kind] ?? sc.kind}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{sc.isin || "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{sc.currency}</td>
                    <td className="px-3 py-2">
                      {/* Un titre lié hérite des paramètres du référentiel de
                          marché ; un titre local ne tient que de la saisie. */}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${
                          lie
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {lie ? "Lié au site" : "Titre local"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {manquants.length === 0 ? (
                        <span className="text-emerald-600 text-[11px]">complet</span>
                      ) : (
                        <span
                          title={manquants
                            .map((m) => `${libelleChamp(sc.kind, m.key)} — ${m.motif}`)
                            .join("\n")}
                          className="text-[11px] text-amber-600 cursor-help"
                        >
                          {manquants
                            .map((m) => libelleChamp(sc.kind, m.key))
                            .slice(0, 3)
                            .join(", ")}
                          {manquants.length > 3 && ` +${manquants.length - 3}`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(false);
                          setEditingId(sc.id);
                        }}
                        className="text-[11px] text-blue-700 hover:text-blue-900 transition mr-3"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(sc.id)}
                        title="Retirer ce titre du référentiel de ce fonds"
                        className="text-[11px] text-red-600 hover:text-red-800 transition"
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

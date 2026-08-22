"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";
import { parseInventoryBuffer, type RawPosition } from "./portfolio-parse";
import { matchPositions, lookupReference, siteSecurityAttributes } from "./portfolio-match";
import { loadCustomSecurities } from "./portfolio-data";
import { loadFunds } from "@/lib/fcp";
import {
  type CustomSecurity,
  type CustomSecurityInput,
  type FundOption,
  type ImportedPosition,
  type ParsedInventory,
  type PortfolioSection,
  type ReferenceMatch,
  type SavePortfolioInput,
} from "./portfolio-types";
import { SECURITY_FIELDS, NUMERIC_KEYS } from "./portfolio-security-schema";

// Ne conserve que les attributs prévus au schéma du type, valeurs nettoyées
// (les champs numériques sont normalisés en notation décimale à point).
function buildAttributes(
  kind: PortfolioSection,
  raw: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of SECURITY_FIELDS[kind] ?? []) {
    let v = (raw?.[def.key] ?? "").toString().trim();
    if (!v) continue;
    if (NUMERIC_KEYS.has(def.key)) v = v.replace(/\s/g, "").replace(",", ".");
    out[def.key] = v;
  }
  // Conserve la provenance site + l'ISIN (hors schéma pour certains types comme
  // les actions) : nécessaires au rétablissement des paramètres d'origine et à
  // l'affichage du titre coté enregistré.
  for (const k of ["source", "refId", "isin"]) {
    const v = (raw?.[k] ?? "").toString().trim();
    if (v && !out[k]) out[k] = v;
  }
  return out;
}

const SECTIONS: PortfolioSection[] = [
  "action",
  "obligation",
  "opcvm",
  "dat",
  "tresorerie",
  "autre",
];

const CURRENCIES = ["XOF", "EUR", "USD"];

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// Re-classe (re-matche) les positions de TOUS les inventaires d'un fonds selon
// l'état courant du référentiel (site + titres personnalisés). Ne réécrit que
// les lignes dont le classement a changé. Best-effort.
async function reclassifyFund(
  supabase: ServerClient,
  ownerId: string,
  fundId: string,
): Promise<void> {
  const { data: snaps } = await supabase
    .from("fund_portfolio_snapshots")
    .select("id")
    .eq("fund_id", fundId)
    .eq("owner_id", ownerId);
  if (!snaps || snaps.length === 0) return;

  const customs = await loadCustomSecurities();
  const cols =
    "id, section, raw_code, raw_label, quantity, pru, cost, price, accrued_interest, valuation, match_kind, match_id, custom_security_id";

  for (const snap of snaps as { id: string }[]) {
    const { data: rows } = await supabase
      .from("fund_portfolio_positions")
      .select(cols)
      .eq("snapshot_id", snap.id);
    if (!rows || rows.length === 0) continue;

    const raws: RawPosition[] = (rows as Record<string, unknown>[]).map((r) => ({
      section: r.section as PortfolioSection,
      rawCode: (r.raw_code as string) ?? "",
      rawLabel: (r.raw_label as string) ?? "",
      quantity: r.quantity as number | null,
      pru: r.pru as number | null,
      cost: r.cost as number | null,
      price: r.price as number | null,
      accruedInterest: r.accrued_interest as number | null,
      valuation: r.valuation as number | null,
    }));

    const matched = matchPositions(raws, customs);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as Record<string, unknown>;
      const m = matched[i];
      // N'écrit que si le classement a changé.
      if (
        r.section === m.section &&
        r.match_kind === m.matchKind &&
        (r.match_id ?? "") === (m.matchId ?? "") &&
        (r.custom_security_id ?? null) === (m.customSecurityId ?? null)
      ) {
        continue;
      }
      await supabase
        .from("fund_portfolio_positions")
        .update({
          section: m.section,
          match_kind: m.matchKind,
          match_id: m.matchId,
          custom_security_id: m.customSecurityId,
        })
        .eq("id", r.id as string);
    }
  }
}

// Re-classe manuellement les inventaires d'un fonds (bouton « Actualiser »).
export async function reclassifyFundPortfoliosAction(
  fundId: string,
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  await reclassifyFund(supabase, user.id, fundId);
  revalidatePath(`/pros/fund-management/fonds/${fundId}`);
  return { ok: true, data: null };
}

// Importe un fichier d'inventaire (.xlsx) : parse + matching, SANS persistance.
// Renvoie l'aperçu que le client affiche puis fait résoudre / enregistrer.
export async function importInventoryAction(
  fundId: string,
  formData: FormData,
): Promise<ActionResult<ParsedInventory>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté pour importer un inventaire." };

  // Le fonds doit appartenir à l'utilisateur.
  const { data: fund } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fund) return { ok: false, error: "Fonds introuvable." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Aucun fichier reçu." };
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm"))
    return { ok: false, error: "Format non supporté : dépose un fichier Excel (.xlsx)." };

  let parsed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = await parseInventoryBuffer(buffer);
  } catch {
    return { ok: false, error: "Impossible de lire le fichier Excel (fichier corrompu ?)." };
  }
  if (parsed.positions.length === 0)
    return { ok: false, error: "Aucune ligne détectée dans l'inventaire." };

  const customs = await loadCustomSecurities();
  const positions = matchPositions(parsed.positions, customs);

  const counts = {
    total: positions.length,
    matched: positions.filter(
      (p) => p.matchKind !== "unmatched" && p.matchKind !== "cash",
    ).length,
    unmatched: positions.filter((p) => p.matchKind === "unmatched").length,
    cash: positions.filter((p) => p.matchKind === "cash").length,
  };

  return {
    ok: true,
    data: {
      label: file.name,
      asOfDate: new Date().toISOString().slice(0, 10),
      totalValuation: parsed.totalValuation,
      positions,
      counts,
    },
  };
}

// Liste le référentiel FCP/OPCVM du site (pour la sélection en cascade
// Société de gestion → FCP dans le formulaire).
export async function listFundReferentialAction(): Promise<ActionResult<FundOption[]>> {
  const funds = loadFunds()
    .map((f) => ({
      id: f.id,
      gestionnaire: f.gestionnaire,
      nom: f.nom,
      categorie: f.categorie,
    }))
    .sort((a, b) => a.gestionnaire.localeCompare(b.gestionnaire) || a.nom.localeCompare(b.nom));
  return { ok: true, data: funds };
}

// Vérifie si un code/ISIN correspond à un titre du référentiel du site.
// Renvoie la correspondance (pour proposer une liaison) ou null.
export async function lookupReferenceAction(
  code: string,
  isin: string,
): Promise<ActionResult<ReferenceMatch | null>> {
  const match = lookupReference(code ?? "", isin ?? "");
  return { ok: true, data: match };
}

// Paramètres « d'origine » d'un titre coté (depuis le référentiel du site),
// pour pré-remplir / rétablir le formulaire de modification. Renvoie les
// attributs mappés sur le schéma, ou null si le titre n'est plus reconnu.
export async function getSecurityDefaultsAction(
  source: string,
  refId: string,
): Promise<ActionResult<Record<string, string> | null>> {
  return { ok: true, data: siteSecurityAttributes(source ?? "", refId ?? "") };
}

// Crée un titre personnalisé réutilisable (ou renvoie l'existant si le code
// est déjà pris pour cet utilisateur).
export async function createCustomSecurityAction(
  input: CustomSecurityInput,
): Promise<ActionResult<CustomSecurity>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!code) return { ok: false, error: "Le code / symbole est obligatoire." };
  if (!name) return { ok: false, error: "Le nom du titre est obligatoire." };
  const kind: PortfolioSection = SECTIONS.includes(input.kind) ? input.kind : "autre";
  const currency = CURRENCIES.includes(input.currency) ? input.currency : "XOF";

  const attributes = buildAttributes(kind, input.attributes);
  const isin = (attributes.isin ?? "").trim();

  const cols = "id, kind, code, name, isin, currency, attributes";
  const payload = {
    owner_id: user.id,
    kind,
    code,
    name,
    isin,
    currency,
    attributes,
  };

  const { data, error } = await supabase
    .from("custom_securities")
    .insert(payload)
    .select(cols)
    .single();

  if (error) {
    // Conflit d'unicité (owner_id, lower(code)) : on renvoie l'existant.
    const { data: existing } = await supabase
      .from("custom_securities")
      .select(cols)
      .eq("owner_id", user.id)
      .ilike("code", code)
      .maybeSingle();
    if (existing) return { ok: true, data: existing as CustomSecurity };
    return { ok: false, error: error.message };
  }

  return { ok: true, data: data as CustomSecurity };
}

const CUSTOM_COLS = "id, kind, code, name, isin, currency, attributes";

// Liste les titres personnalisés de l'utilisateur (gestion du référentiel).
export async function listCustomSecuritiesAction(): Promise<ActionResult<CustomSecurity[]>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { data, error } = await supabase
    .from("custom_securities")
    .select(CUSTOM_COLS)
    .order("kind", { ascending: true })
    .order("code", { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as CustomSecurity[] };
}

// Modifie un titre personnalisé existant.
export async function updateCustomSecurityAction(
  id: string,
  input: CustomSecurityInput,
): Promise<ActionResult<CustomSecurity>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!code) return { ok: false, error: "Le code / symbole est obligatoire." };
  if (!name) return { ok: false, error: "Le nom du titre est obligatoire." };
  const kind: PortfolioSection = SECTIONS.includes(input.kind) ? input.kind : "autre";
  const currency = CURRENCIES.includes(input.currency) ? input.currency : "XOF";
  const attributes = buildAttributes(kind, input.attributes);

  const { data, error } = await supabase
    .from("custom_securities")
    .update({ kind, code, name, isin: (attributes.isin ?? "").trim(), currency, attributes })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(CUSTOM_COLS)
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Titre introuvable." };

  // Re-classe les inventaires des fonds rattachés à ce titre.
  await reclassifyFundsLinkedTo(supabase, user.id, id);

  revalidatePath("/pros/fund-management/parametres");
  return { ok: true, data: data as CustomSecurity };
}

// Re-classe les inventaires de tous les fonds rattachés à un titre personnalisé.
async function reclassifyFundsLinkedTo(
  supabase: ServerClient,
  ownerId: string,
  customSecurityId: string,
): Promise<void> {
  const { data: links } = await supabase
    .from("fund_securities")
    .select("fund_id")
    .eq("custom_security_id", customSecurityId)
    .eq("owner_id", ownerId);
  const fundIds = [...new Set((links ?? []).map((l: { fund_id: string }) => l.fund_id))];
  for (const fid of fundIds) {
    await reclassifyFund(supabase, ownerId, fid);
    revalidatePath(`/pros/fund-management/fonds/${fid}`);
  }
}

// Supprime un titre personnalisé.
export async function deleteCustomSecurityAction(id: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  // Capture les fonds rattachés AVANT la suppression (fund_securities cascade).
  const { data: links } = await supabase
    .from("fund_securities")
    .select("fund_id")
    .eq("custom_security_id", id)
    .eq("owner_id", user.id);
  const fundIds = [...new Set((links ?? []).map((l: { fund_id: string }) => l.fund_id))];

  const { error } = await supabase
    .from("custom_securities")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return { ok: false, error: error.message };

  // Les positions liées à ce titre redeviennent non reconnues / trésorerie.
  for (const fid of fundIds) {
    await reclassifyFund(supabase, user.id, fid);
    revalidatePath(`/pros/fund-management/fonds/${fid}`);
  }

  revalidatePath("/pros/fund-management/parametres");
  return { ok: true, data: null };
}

// Liste les titres du référentiel rattachés à un fonds.
export async function listFundSecuritiesAction(
  fundId: string,
): Promise<ActionResult<CustomSecurity[]>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { data: links } = await supabase
    .from("fund_securities")
    .select("custom_security_id")
    .eq("fund_id", fundId)
    .eq("owner_id", user.id);
  const ids = (links ?? []).map((l: { custom_security_id: string }) => l.custom_security_id);
  if (ids.length === 0) return { ok: true, data: [] };

  const { data, error } = await supabase
    .from("custom_securities")
    .select(CUSTOM_COLS)
    .in("id", ids)
    .order("kind", { ascending: true })
    .order("code", { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as CustomSecurity[] };
}

// Ajoute un titre au référentiel d'un fonds : crée (ou réutilise) le titre au
// niveau utilisateur, puis le rattache au fonds.
export async function addSecurityToFundAction(
  fundId: string,
  input: CustomSecurityInput,
): Promise<ActionResult<CustomSecurity>> {
  const res = await createCustomSecurityAction(input);
  if (!res.ok) return res;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  await supabase
    .from("fund_securities")
    .upsert(
      { fund_id: fundId, custom_security_id: res.data.id, owner_id: user.id },
      { onConflict: "fund_id,custom_security_id", ignoreDuplicates: true },
    );

  // Re-classe les inventaires du fonds : le nouveau titre peut reconnaître des
  // lignes jusque-là non reconnues.
  await reclassifyFund(supabase, user.id, fundId);

  revalidatePath(`/pros/fund-management/fonds/${fundId}`);
  return res;
}

// Retire un titre du référentiel d'un fonds (le titre reste au niveau
// utilisateur, réutilisable ailleurs).
export async function unlinkSecurityFromFundAction(
  fundId: string,
  customSecurityId: string,
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { error } = await supabase
    .from("fund_securities")
    .delete()
    .eq("fund_id", fundId)
    .eq("custom_security_id", customSecurityId)
    .eq("owner_id", user.id);

  if (error) return { ok: false, error: error.message };

  // Re-classe : les lignes portées par ce titre redeviennent non reconnues.
  await reclassifyFund(supabase, user.id, fundId);

  revalidatePath(`/pros/fund-management/fonds/${fundId}`);
  return { ok: true, data: null };
}

// Persiste un inventaire résolu (snapshot + positions) pour un fonds.
export async function savePortfolioAction(
  fundId: string,
  input: SavePortfolioInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };

  const { data: fund } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fund) return { ok: false, error: "Fonds introuvable." };

  if (!input.positions || input.positions.length === 0)
    return { ok: false, error: "Aucune position à enregistrer." };

  const asOf = (input.asOfDate ?? "").trim() || new Date().toISOString().slice(0, 10);
  const slot = (["debut", "intermediaire", "fin"] as const).includes(
    input.slot as "debut" | "intermediaire" | "fin",
  )
    ? input.slot
    : "fin";

  // Un inventaire par slot : le ré-import d'un slot remplace le précédent
  // (la suppression du snapshot cascade sur ses positions).
  await supabase
    .from("fund_portfolio_snapshots")
    .delete()
    .eq("fund_id", fundId)
    .eq("owner_id", user.id)
    .eq("slot", slot);

  const { data: snap, error: snapErr } = await supabase
    .from("fund_portfolio_snapshots")
    .insert({
      owner_id: user.id,
      fund_id: fundId,
      slot,
      as_of_date: asOf,
      label: (input.label ?? "").trim(),
      total_valuation: input.totalValuation ?? 0,
    })
    .select("id")
    .single();

  if (snapErr || !snap) return { ok: false, error: snapErr?.message ?? "Échec de création." };

  const rows = input.positions.map((p: ImportedPosition) => ({
    snapshot_id: snap.id,
    owner_id: user.id,
    section: SECTIONS.includes(p.section) ? p.section : "autre",
    raw_code: p.rawCode ?? "",
    raw_label: p.rawLabel ?? "",
    quantity: p.quantity,
    pru: p.pru,
    cost: p.cost,
    price: p.price,
    accrued_interest: p.accruedInterest,
    valuation: p.valuation,
    match_kind: p.matchKind ?? "unmatched",
    match_id: p.matchId ?? "",
    custom_security_id: p.customSecurityId,
  }));

  const { error: posErr } = await supabase.from("fund_portfolio_positions").insert(rows);
  if (posErr) {
    // Rollback best-effort : on retire le snapshot vide.
    await supabase.from("fund_portfolio_snapshots").delete().eq("id", snap.id);
    return { ok: false, error: posErr.message };
  }

  // Alimente le référentiel titres (partagé au niveau utilisateur, affiché par
  // fonds). On crée les titres manquants (dédupliqués par code) puis on rattache
  // TOUS les titres de l'inventaire à ce fonds via fund_securities. Espèces
  // exclues. Best-effort : n'échoue pas l'enregistrement du portefeuille.
  try {
    // 1 titre par code (dédup intra-lot). On exclut la trésorerie NON convertie
    // (matchKind "cash") ; les comptes explicitement enregistrés en titres
    // (matchKind "custom", section tresorerie) sont conservés et rattachés.
    const byCode = new Map<string, ImportedPosition>();
    for (const p of input.positions) {
      if (p.matchKind === "cash") continue;
      const key = (p.rawCode ?? "").trim().toLowerCase();
      if (key && !byCode.has(key)) byCode.set(key, p);
    }

    if (byCode.size > 0) {
      // Titres déjà présents au niveau utilisateur (code -> id).
      const { data: existing } = await supabase
        .from("custom_securities")
        .select("id, code")
        .eq("owner_id", user.id);
      const idByCode = new Map<string, string>();
      for (const r of (existing ?? []) as { id: string; code: string }[]) {
        idByCode.set((r.code ?? "").trim().toLowerCase(), r.id);
      }

      // Insère les titres manquants.
      const toInsert: Record<string, unknown>[] = [];
      for (const [key, p] of byCode) {
        if (idByCode.has(key)) continue;
        const linkedIsin = p.matchKind === "listed-bond" || p.matchKind === "sovereign";
        const known = p.matchKind !== "unmatched" && p.matchKind !== "cash";
        toInsert.push({
          owner_id: user.id,
          kind: SECTIONS.includes(p.section) ? p.section : "autre",
          code: (p.rawCode ?? "").trim(),
          name: (p.matchLabel || p.rawLabel || "").trim(),
          isin: linkedIsin ? (p.matchId ?? "") : "",
          currency: "XOF",
          attributes: known ? { source: p.matchKind, refId: p.matchId ?? "" } : {},
        });
      }
      if (toInsert.length) {
        const { data: inserted } = await supabase
          .from("custom_securities")
          .insert(toInsert)
          .select("id, code");
        for (const r of (inserted ?? []) as { id: string; code: string }[]) {
          idByCode.set((r.code ?? "").trim().toLowerCase(), r.id);
        }
      }

      // Rattache chaque titre au fonds (dédup via clé primaire composite).
      const links: Record<string, unknown>[] = [];
      for (const key of byCode.keys()) {
        const id = idByCode.get(key);
        if (id) links.push({ fund_id: fundId, custom_security_id: id, owner_id: user.id });
      }
      if (links.length) {
        await supabase
          .from("fund_securities")
          .upsert(links, { onConflict: "fund_id,custom_security_id", ignoreDuplicates: true });
      }
    }
  } catch {
    // catalogage best-effort : ignoré en cas d'erreur
  }

  revalidatePath(`/pros/fund-management/fonds/${fundId}`);
  return { ok: true, data: { id: snap.id } };
}

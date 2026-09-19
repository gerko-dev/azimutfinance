"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";
import { parseInventoryBuffer, type RawPosition } from "./portfolio-parse";
import { matchPositions, lookupReference, siteSecurityAttributes, normName } from "./portfolio-match";
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
import {
  ajouterAlias,
  champsManquants,
  cleAlias,
  estLieAuSite,
  lireAlias,
  NUMERIC_KEYS,
  SECURITY_FIELDS,
} from "./portfolio-security-schema";
import { estNiveau1, MSG_NIVEAU1 } from "./guard";

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

/** Une ligne dont le classement a changé, pour le compte rendu. */
export type LigneReclassee = {
  code: string;
  libelle: string;
  sectionAvant: PortfolioSection;
  sectionApres: PortfolioSection;
  valorisation: number | null;
};

export type BilanReclassement = {
  examinees: number;
  modifiees: LigneReclassee[];
};

// Re-classe (re-matche) les positions de TOUS les inventaires d'un fonds selon
// l'état courant du référentiel (site + titres personnalisés). Ne réécrit que
// les lignes dont le classement a changé. Best-effort.
//
// Rend compte de ce qu'il a change : un reclassement silencieux est
// indiscernable d'un reclassement sans effet, et le gerant ne peut pas savoir
// si son DAT a rejoint la bonne classe.
async function reclassifyFund(
  supabase: ServerClient,
  ownerId: string,
  fundId: string,
): Promise<BilanReclassement> {
  const bilan: BilanReclassement = { examinees: 0, modifiees: [] };
  const { data: snaps } = await supabase
    .from("fund_portfolio_snapshots")
    .select("id")
    .eq("fund_id", fundId)
    .eq("owner_id", ownerId);
  if (!snaps || snaps.length === 0) return bilan;

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
    bilan.examinees += rows.length;
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
      const { error } = await supabase
        .from("fund_portfolio_positions")
        .update({
          section: m.section,
          match_kind: m.matchKind,
          match_id: m.matchId,
          custom_security_id: m.customSecurityId,
        })
        .eq("id", r.id as string);
      if (error) continue;
      // Seul un changement de CLASSE se remarque dans l'allocation : un
      // changement de rattachement a identique n'interesse pas le gerant ici.
      const avant = (r.section as PortfolioSection) ?? "autre";
      if (avant !== m.section) {
        bilan.modifiees.push({
          code: (r.raw_code as string) ?? "",
          libelle: (r.raw_label as string) ?? "",
          sectionAvant: avant,
          sectionApres: m.section,
          valorisation: (r.valuation as number | null) ?? null,
        });
      }
    }
  }
  return bilan;
}

// Re-classe manuellement les inventaires d'un fonds (bouton « Actualiser »).
export async function reclassifyFundPortfoliosAction(
  fundId: string,
): Promise<ActionResult<BilanReclassement>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const bilan = await reclassifyFund(supabase, user.id, fundId);
  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  return { ok: true, data: bilan };
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
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

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

  const avertissements = [...parsed.avertissements];
  // Le total du fichier est calculé AVANT matching ; la valorisation d'un
  // dépôt à terme peut être redressée du coupon couru. On le dit plutôt que
  // de laisser un écart inexpliqué entre le total et la somme des lignes.
  const totalApres = positions.reduce((s, p) => s + (p.valuation ?? 0), 0);
  if (Math.abs(totalApres - parsed.totalValuation) > 1) {
    avertissements.push(
      `Valorisation redressée du coupon couru sur ${
        positions.filter((p) => p.matchKind === "dat").length
      } dépôt(s) à terme : total du fichier ${Math.round(
        parsed.totalValuation,
      ).toLocaleString("fr-FR")}, total retenu ${Math.round(totalApres).toLocaleString("fr-FR")}.`,
    );
  }

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
      totalValuation: totalApres,
      positions,
      counts,
      avertissements,
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
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!code) return { ok: false, error: "Le code / symbole est obligatoire." };
  if (!name) return { ok: false, error: "Le nom du titre est obligatoire." };
  const kind: PortfolioSection = SECTIONS.includes(input.kind) ? input.kind : "autre";
  const currency = CURRENCIES.includes(input.currency) ? input.currency : "XOF";

  const attributes = buildAttributes(kind, input.attributes);

  // Le libellé de l'inventaire entre en ALIAS, TOUJOURS.
  //
  // Sans le dernier argument à vide, `ajouterAlias` écartait l'alias dès qu'il
  // coïncidait avec le Nom — or le formulaire pré-remplit justement le Nom avec
  // le libellé d'inventaire. Le titre se créait donc sans aucun alias, et la
  // colonne du référentiel affichait « aucun ».
  //
  // Le doublon apparent n'en est pas un : Nom et Alias ne jouent pas le même
  // rôle. Le Nom est libre — le gérant le remplace souvent par la dénomination
  // officielle du site — tandis que l'Alias est la CLEF de rapprochement et
  // doit survivre à ce renommage. Les lier revenait à perdre la clef au premier
  // changement de nom.
  const libelleInventaire = (input.libelleInventaire ?? "").trim();
  if (libelleInventaire) {
    const alias = ajouterAlias(attributes, libelleInventaire, []);
    if (alias !== null) attributes.alias = alias;
  }

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
    //
    // `ilike` traite % et _ comme des jokers : un code qui en contient irait
    // chercher autre chose que lui-même. On les échappe, et on ne prend la
    // ligne que si son code correspond EXACTEMENT, casse ignorée.
    const motif = code.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: candidats } = await supabase
      .from("custom_securities")
      .select(cols)
      .eq("owner_id", user.id)
      .ilike("code", motif);
    const existing = (candidats ?? []).find(
      (c) => (c as CustomSecurity).code.trim().toLowerCase() === code.toLowerCase(),
    ) as CustomSecurity | undefined;

    if (existing) {
      // Le titre existe déjà au niveau du COMPTE — souvent parce qu'il a été
      // retiré du référentiel d'un fonds, ce qui le délie sans le supprimer.
      // On le réutilise, et on l'ENRICHIT de ce que la saisie apporte de plus :
      // sans cela, un titre orphelin resterait éternellement non lié au site,
      // et l'utilisateur ne pourrait ni le voir ni le corriger.
      const fusion = { ...(existing.attributes ?? {}) };
      let change = false;
      for (const [k, v] of Object.entries(attributes)) {
        if ((v ?? "").toString().trim() === "") continue;
        if ((fusion[k] ?? "").toString().trim() !== "") continue;
        fusion[k] = v;
        change = true;
      }
      if (change) {
        const { data: maj } = await supabase
          .from("custom_securities")
          .update({ attributes: fusion, isin: (fusion.isin ?? existing.isin ?? "").trim() })
          .eq("id", existing.id)
          .eq("owner_id", user.id)
          .select(cols)
          .single();
        if (maj) return { ok: true, data: maj as CustomSecurity };
      }
      return { ok: true, data: existing };
    }
    return { ok: false, error: error.message };
  }

  // Un titre nouvellement créé existe précisément pour reconnaître des lignes
  // d'inventaire jusque-là non rapprochées. Sans ce reclassement, il resterait
  // sans effet jusqu'au prochain import.
  await reclassifyAllFunds(supabase, user.id);
  revalidatePath("/gestion-portefeuille/parametres");

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
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

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
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!code) return { ok: false, error: "Le code / symbole est obligatoire." };
  if (!name) return { ok: false, error: "Le nom du titre est obligatoire." };
  const kind: PortfolioSection = SECTIONS.includes(input.kind) ? input.kind : "autre";
  const currency = CURRENCIES.includes(input.currency) ? input.currency : "XOF";
  const attributes = buildAttributes(kind, input.attributes);

  // Les alias ne figurent dans aucun formulaire : ils s'accumulent au fil des
  // imports. Reconstruire les attributs depuis la seule saisie les effacerait,
  // et tout le travail de rattachement serait à refaire au prochain import.
  {
    const { data: avant } = await supabase
      .from("custom_securities")
      .select("name, attributes")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    const ligne = avant as {
      name: string | null;
      attributes: Record<string, string> | null;
    } | null;
    const anciens = lireAlias(ligne?.attributes ?? undefined);
    // Le nom saisi devient lui-même une clé de rapprochement : si le gérant
    // RENOMME le titre, l'ancien nom doit survivre en alias, sinon les
    // inventaires qui l'emploient cessent brusquement d'être reconnus.
    const ancienNom = cleAlias(ligne?.name ?? "");
    const tous = [...new Set([...anciens, ancienNom].filter((a) => a.length >= 4))].filter(
      (a) => a !== cleAlias(name) && a !== cleAlias(code),
    );
    if (tous.length > 0) attributes.alias = tous.join("|");
  }

  const { data, error } = await supabase
    .from("custom_securities")
    .update({ kind, code, name, isin: (attributes.isin ?? "").trim(), currency, attributes })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(CUSTOM_COLS)
    .single();

  if (error) {
    // Conflit d'unicité (owner_id, lower(code)) : le code visé appartient déjà
    // à un AUTRE titre du référentiel. Le message brut de Postgres
    // (« duplicate key value violates unique constraint … ») ne dit ni lequel
    // ni quoi faire. On nomme le titre en cause.
    if (/duplicate key|unique constraint/i.test(error.message)) {
      const motif = code.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: candidats } = await supabase
        .from("custom_securities")
        .select(CUSTOM_COLS)
        .eq("owner_id", user.id)
        .ilike("code", motif);
      const conflit = (candidats ?? []).find(
        (c) =>
          (c as CustomSecurity).code.trim().toLowerCase() === code.toLowerCase() &&
          (c as CustomSecurity).id !== id,
      ) as CustomSecurity | undefined;
      if (conflit) {
        // Le titre en conflit peut être ORPHELIN : présent au niveau du compte
        // mais rattaché à aucun fonds, donc absent de la liste affichée. Le
        // dire évite de chercher en vain une ligne qui n'y est pas.
        const { data: rattachements } = await supabase
          .from("fund_securities")
          .select("fund_id")
          .eq("custom_security_id", conflit.id)
          .eq("owner_id", user.id);
        const orphelin = (rattachements ?? []).length === 0;
        return {
          ok: false,
          error: orphelin
            ? `Le code « ${code} » appartient à « ${conflit.name} », un titre de ton compte rattaché à AUCUN fonds — il n'apparaît donc dans aucune liste. Utilise « + Ajouter un titre » avec ce code : il sera récupéré et rattaché à ce fonds au lieu d'être recréé.`
            : `Le code « ${code} » est déjà porté par « ${conflit.name} » dans ton référentiel. Modifie ce titre-là pour le lier au site, ou donne un code distinct à celui-ci.`,
        };
      }
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Titre introuvable." };

  // Re-classe les inventaires de tous les fonds : un titre corrigé peut
  // reconnaître des lignes d'un fonds auquel il n'est pas encore rattaché.
  await reclassifyAllFunds(supabase, user.id);

  revalidatePath("/gestion-portefeuille/parametres");
  return { ok: true, data: data as CustomSecurity };
}

/**
 * Re-classe les inventaires de TOUS les fonds de l'utilisateur.
 *
 * POURQUOI TOUS, et non les seuls fonds où le titre est déjà rattaché : un
 * titre qui vient d'être créé n'est rattaché à AUCUN fonds — c'est justement
 * la ligne d'inventaire non reconnue qu'il doit permettre de rapprocher. Se
 * limiter aux fonds liés ne reclassait donc jamais rien après une création, et
 * l'utilisateur devait ré-importer son inventaire pour voir l'effet.
 *
 * Le rapprochement utilise `loadCustomSecurities()`, qui charge tous les titres
 * du compte : un titre créé depuis la page Paramètres reconnaît les lignes de
 * n'importe quel fonds, encore faut-il relancer le classement.
 */
async function reclassifyAllFunds(
  supabase: ServerClient,
  ownerId: string,
): Promise<void> {
  const { data: fonds } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("owner_id", ownerId);
  for (const f of (fonds ?? []) as { id: string }[]) {
    await reclassifyFund(supabase, ownerId, f.id);
    revalidatePath(`/gestion-portefeuille/fonds/${f.id}`);
  }
}

// Supprime un titre personnalisé.
export async function deleteCustomSecurityAction(id: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

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
    revalidatePath(`/gestion-portefeuille/fonds/${fid}`);
  }

  revalidatePath("/gestion-portefeuille/parametres");
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
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const { data: links } = await supabase
    .from("fund_securities")
    .select("custom_security_id")
    .eq("fund_id", fundId)
    .eq("owner_id", user.id);
  const ids = new Set(
    (links ?? []).map((l: { custom_security_id: string }) => l.custom_security_id),
  );

  // Titres RÉFÉRENCÉS PAR LES INVENTAIRES du fonds, même absents de
  // fund_securities.
  //
  // Sans cela, une position rattachée à un titre délié (bouton « Retirer », ou
  // titre créé automatiquement à l'import sans rattachement) pointe vers un
  // titre que la liste n'affiche pas : impossible de le compléter ou de le
  // lier au site, alors qu'il porte une part réelle du portefeuille. On les
  // rattache au passage, pour que l'incohérence ne se reproduise pas.
  const { data: snaps } = await supabase
    .from("fund_portfolio_snapshots")
    .select("id")
    .eq("fund_id", fundId)
    .eq("owner_id", user.id);
  const snapIds = (snaps ?? []).map((s: { id: string }) => s.id);
  if (snapIds.length > 0) {
    const { data: pos } = await supabase
      .from("fund_portfolio_positions")
      .select("custom_security_id")
      .in("snapshot_id", snapIds)
      .not("custom_security_id", "is", null);
    const orphelins = [
      ...new Set(
        (pos ?? [])
          .map((p: { custom_security_id: string | null }) => p.custom_security_id)
          .filter((x): x is string => !!x && !ids.has(x)),
      ),
    ];
    if (orphelins.length > 0) {
      await supabase.from("fund_securities").upsert(
        orphelins.map((cid) => ({
          fund_id: fundId,
          custom_security_id: cid,
          owner_id: user.id,
        })),
        { onConflict: "fund_id,custom_security_id", ignoreDuplicates: true },
      );
      for (const o of orphelins) ids.add(o);
    }
  }

  if (ids.size === 0) return { ok: true, data: [] };

  const { data, error } = await supabase
    .from("custom_securities")
    .select(CUSTOM_COLS)
    .in("id", [...ids])
    .order("kind", { ascending: true })
    .order("code", { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as CustomSecurity[] };
}

/** Compte rendu d'une resynchronisation de lot. */
export type BilanResync = {
  examines: number;
  /** Titres liés au site, seuls candidats à la resynchronisation. */
  lies: number;
  misAJour: number;
  /** Champs effectivement remplis, par titre. */
  details: { code: string; champs: string[] }[];
  /** Titres liés dont la référence du site est introuvable : leur lien pointe
   *  vers un titre qui n'existe plus ou dont le code a changé. */
  referencesIntrouvables: string[];
  /** Titres dont un faux lien a été retiré : « dat » ou « cash » inscrits comme
   *  source par un import antérieur au correctif. */
  liensInvalidesRetires: string[];
  /** Titres qui restent incomplets après passage : le site ne porte pas ces
   *  champs, il faut les saisir à la main. */
  restentIncomplets: { code: string; champs: string[] }[];
  /** Titres partageant un même nom normalisé.
   *
   *  L'index de rapprochement ne retient que le PREMIER : les suivants sont
   *  inatteignables par nom, quel que soit le libellé de l'inventaire. On les
   *  signale sans rien supprimer — fusionner deux titres est une décision de
   *  gestion, pas un nettoyage technique. */
  nomsEnDoublon: { nom: string; codes: string[] }[];
};

/**
 * Titres partageant un même nom normalisé — ou un même alias.
 *
 * L'index de rapprochement retient le premier inscrit et ignore les suivants.
 * Un doublon rend donc une partie du référentiel MUETTE : le titre existe,
 * porte des attributs, mais aucun inventaire ne l'atteindra jamais par son nom.
 */
function relevrDoublons(titres: CustomSecurity[]): { nom: string; codes: string[] }[] {
  const parCle = new Map<string, string[]>();
  for (const t of titres) {
    for (const cle of [cleAlias(t.name), ...lireAlias(t.attributes)]) {
      if (cle.length < 4) continue;
      const codes = parCle.get(cle) ?? [];
      if (!codes.includes(t.code)) codes.push(t.code);
      parCle.set(cle, codes);
    }
  }
  return [...parCle.entries()]
    .filter(([, codes]) => codes.length > 1)
    .map(([nom, codes]) => ({ nom, codes }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/**
 * Resynchronise tous les titres liés d'un fonds depuis le référentiel du site.
 *
 * NE REMPLIT QUE LES CHAMPS VIDES. Une valeur saisie à la main est une décision
 * du gérant — parfois une correction volontaire d'une donnée de marché erronée.
 * L'écraser en masse ferait disparaître ces arbitrages sans trace, et sur des
 * dizaines de titres personne ne s'en apercevrait.
 *
 * Les titres non liés sont laissés tels quels : il n'existe aucune source d'où
 * les compléter.
 */
export async function resynchroniserReferentielAction(
  fundId: string,
): Promise<ActionResult<BilanResync>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu dois être connecté." };
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const liste = await listFundSecuritiesAction(fundId);
  if (!liste.ok) return { ok: false, error: liste.error };

  const bilan: BilanResync = {
    examines: liste.data.length,
    lies: 0,
    misAJour: 0,
    details: [],
    nomsEnDoublon: relevrDoublons(liste.data),
    referencesIntrouvables: [],
    liensInvalidesRetires: [],
    restentIncomplets: [],
  };

  for (const sc of liste.data) {
    const source = sc.attributes?.source ?? "";
    const refId = sc.attributes?.refId ?? "";
    // Même critère que l'affichage : un DAT ou un compte de trésorerie n'a pas
    // de référence de marché, et n'est donc pas un lien cassé.
    if (!estLieAuSite(sc.attributes)) {
      // Faux lien hérité d'un import antérieur au correctif : « dat » ou
      // « cash » inscrits comme source. On le retire, sinon le titre resterait
      // badgé « Lié au site » de façon trompeuse.
      if (source && refId) {
        const nettoyes = { ...(sc.attributes ?? {}) };
        delete nettoyes.source;
        delete nettoyes.refId;
        const { error } = await supabase
          .from("custom_securities")
          .update({ attributes: nettoyes })
          .eq("id", sc.id)
          .eq("owner_id", user.id);
        if (!error) bilan.liensInvalidesRetires.push(sc.code);
      }
      const manque = champsManquants(sc.kind, sc.attributes);
      if (manque.length > 0) {
        bilan.restentIncomplets.push({
          code: sc.code,
          champs: manque.map((m) => m.key),
        });
      }
      continue;
    }
    bilan.lies++;

    const site = siteSecurityAttributes(source, refId);
    if (!site) {
      bilan.referencesIntrouvables.push(sc.code);
      continue;
    }

    const fusion = { ...(sc.attributes ?? {}) };
    const remplis: string[] = [];
    for (const [k, v] of Object.entries(site)) {
      if ((v ?? "").toString().trim() === "") continue;
      if ((fusion[k] ?? "").toString().trim() !== "") continue;
      fusion[k] = v;
      remplis.push(k);
    }

    if (remplis.length > 0) {
      const attributes = buildAttributes(sc.kind, fusion);
      const { error } = await supabase
        .from("custom_securities")
        .update({ attributes, isin: (attributes.isin ?? "").trim() })
        .eq("id", sc.id)
        .eq("owner_id", user.id);
      if (error) return { ok: false, error: `${sc.code} : ${error.message}` };
      bilan.misAJour++;
      bilan.details.push({ code: sc.code, champs: remplis });
    }

    const reste = champsManquants(sc.kind, fusion);
    if (reste.length > 0) {
      bilan.restentIncomplets.push({
        code: sc.code,
        champs: reste.map((m) => m.key),
      });
    }
  }

  // Les inventaires se reclassent : un titre qui gagne son secteur ou sa
  // maturité change de poste dans les ventilations.
  if (bilan.misAJour > 0) {
    await reclassifyFund(supabase, user.id, fundId);
    revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  }

  return { ok: true, data: bilan };
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
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  await supabase
    .from("fund_securities")
    .upsert(
      { fund_id: fundId, custom_security_id: res.data.id, owner_id: user.id },
      { onConflict: "fund_id,custom_security_id", ignoreDuplicates: true },
    );

  // Re-classe les inventaires du fonds : le nouveau titre peut reconnaître des
  // lignes jusque-là non reconnues.
  await reclassifyFund(supabase, user.id, fundId);

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
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
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  const { error } = await supabase
    .from("fund_securities")
    .delete()
    .eq("fund_id", fundId)
    .eq("custom_security_id", customSecurityId)
    .eq("owner_id", user.id);

  if (error) return { ok: false, error: error.message };

  // Re-classe : les lignes portées par ce titre redeviennent non reconnues.
  await reclassifyFund(supabase, user.id, fundId);

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  return { ok: true, data: null };
}

/**
 * Enregistre, sur chaque titre du référentiel, les libellés d'inventaire qui
 * l'ont désigné.
 *
 * Best-effort : une écriture qui échoue ne doit pas faire échouer
 * l'enregistrement de l'inventaire, qui est la vraie opération demandée.
 */
async function memoriserLibelles(
  supabase: ServerClient,
  ownerId: string,
  positions: ImportedPosition[],
): Promise<number> {
  const normCle = (s: string): string => s.trim().toLowerCase();

  // Un seul libellé par titre et par import : un inventaire ne nomme pas deux
  // fois la même ligne différemment.
  const parTitre = new Map<string, string>();
  // Lignes rapprochées via le référentiel de MARCHÉ : elles n'ont PAS de
  // customSecurityId — la liaison au site ne crée pas de fiche locale — et ce
  // sont justement celles dont le libellé doit être mémorisé. On les retrouve
  // par leur code, ou à défaut par leur nom exact quand l'inventaire ne porte
  // pas de colonne symbole (cas de nos propres états).
  const parCle = new Map<string, string>();
  for (const p of positions) {
    const libelle = (p.rawLabel ?? "").trim();
    if (libelle.length < 4) continue;
    if (p.customSecurityId) {
      if (!parTitre.has(p.customSecurityId)) parTitre.set(p.customSecurityId, libelle);
      continue;
    }
    for (const cle of [normCle(p.rawCode ?? ""), normName(libelle)]) {
      if (cle && !parCle.has(cle)) parCle.set(cle, libelle);
    }
  }
  if (parTitre.size === 0 && parCle.size === 0) return 0;

  // UNE SEULE LECTURE, ET LE RAPPROCHEMENT EN MÉMOIRE.
  //
  // La version précédente filtrait côté serveur : `.in("code", [...clefs])`
  // avec des clefs MISES EN MINUSCULES. Or ce filtre est sensible à la casse —
  // `in.(fcags.o2)` ne ramène pas la ligne dont le code est `FCAGS.O2`. Comme
  // presque tous les codes portent des majuscules, cette branche n'a JAMAIS
  // rien trouvé : les titres liés au site — les seuls qu'elle avait pour
  // mission de servir — repartaient sans alias, et l'import suivant les
  // redemandait à la création. C'est précisément le cas du FCAGS.O2.
  //
  // Le référentiel d'un gérant tient en quelques centaines de lignes, et le
  // bloc de création juste au-dessus le lit déjà en entier : on le relit ici
  // sans filtre et on compare en mémoire, casse normalisée des deux côtés.
  const { data } = await supabase
    .from("custom_securities")
    .select("id, code, name, attributes")
    .eq("owner_id", ownerId);

  let ecrits = 0;
  for (const brut of (data ?? []) as Record<string, unknown>[]) {
    const row = brut as unknown as {
      id: string;
      code: string;
      name: string;
      attributes: Record<string, string> | null;
    };
    const libelle =
      parTitre.get(row.id) ??
      parCle.get(normCle(row.code ?? "")) ??
      parCle.get(normName(row.name ?? ""));
    if (!libelle) continue;
    const attrs = row.attributes ?? {};
    // L'ALIAS EST ENREGISTRE MEME S'IL COINCIDE AVEC LE NOM.
    //
    // La version precedente l'ecartait dans ce cas, au motif que le nom est
    // deja une clef de rapprochement — vrai a l'instant T, faux des le
    // lendemain. Le gerant renomme presque toujours le titre en adoptant la
    // denomination officielle du site ; le nom cesse alors de correspondre a
    // l'inventaire, et comme aucun alias n'avait ete conserve, la ligne
    // redevenait « a creer » import apres import.
    //
    // Le nom est LIBRE, l'alias est la CLEF : les lier revenait a perdre la
    // clef au premier changement de nom.
    const alias = ajouterAlias(attrs, libelle, []);
    if (alias === null) continue;
    const { error } = await supabase
      .from("custom_securities")
      .update({ attributes: { ...attrs, alias } })
      .eq("id", row.id)
      .eq("owner_id", ownerId);
    if (!error) ecrits++;
  }
  return ecrits;
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
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

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
    // UNE FICHE PAR LIGNE D'INVENTAIRE, sans exception.
    //
    // La trésorerie « non convertie » (matchKind "cash") était écartée d'office.
    // C'est ce qui empêchait DEPOSIT_OPCVM001, MOOV MONEY DECAISSEMENT et leurs
    // semblables d'entrer au référentiel : ils n'y entraient JAMAIS, et l'écran
    // les redemandait à chaque import. Or le module a un formulaire dédié à ces
    // comptes — canal, pays, banque, nature, sens — qui n'a de sens que s'ils y
    // figurent.
    //
    // La règle est désormais celle du gérant, sans exception : tout libellé
    // d'inventaire dont le NOM EXACT est absent du référentiel y est ajouté,
    // sous ce nom-là. La liaison au site reste possible ensuite ; elle ne
    // conditionne pas l'entrée au référentiel.
    // CLEF DE CROISEMENT : le code quand il existe, le NOM EXACT sinon.
    //
    // Ne s'appuyer que sur le code écartait en silence toute ligne qui n'en
    // porte pas — et nos propres inventaires n'ont pas de colonne symbole pour
    // les comptes de trésorerie. Six comptes (DEPOSIT_OPCVM001, MOOV MONEY
    // DECAISSEMENT, MTN CI 2 OPCVM001…) n'entraient donc JAMAIS au référentiel :
    // `if (key && …)` les jetait avant examen, à chaque import, indéfiniment.
    // Le gérant les voyait « non reconnus » et n'avait aucun moyen de les faire
    // entrer, puisque c'est précisément l'import qui alimente le référentiel.
    const cleDe = (p: ImportedPosition): string => {
      const code = (p.rawCode ?? "").trim().toLowerCase();
      return code || normName(p.rawLabel ?? "");
    };

    const byCode = new Map<string, ImportedPosition>();
    for (const p of input.positions) {
      const key = cleDe(p);
      if (key && !byCode.has(key)) byCode.set(key, p);
    }

    if (byCode.size > 0) {
      // Titres déjà présents au niveau utilisateur, indexés par les DEUX clefs :
      // un titre créé jadis avec un code doit rester reconnu quand l'inventaire
      // ne le porte plus, et inversement.
      const { data: existing } = await supabase
        .from("custom_securities")
        .select("id, code, name")
        .eq("owner_id", user.id);
      const idByCode = new Map<string, string>();
      for (const r of (existing ?? []) as { id: string; code: string; name: string }[]) {
        const code = (r.code ?? "").trim().toLowerCase();
        if (code) idByCode.set(code, r.id);
        const nom = normName(r.name ?? "");
        if (nom && !idByCode.has(nom)) idByCode.set(nom, r.id);
      }

      // Insère les titres manquants.
      // TOUTE FICHE DOIT PORTER UN CODE DISTINCT.
      //
      // L'index unique de la table porte sur (owner_id, lower(code)) : la
      // chaine vide y est une valeur comme une autre, donc UN SEUL titre par
      // gerant peut etre sans code. Or nos propres inventaires ne portent pas
      // de colonne symbole pour les FCP ni pour la tresorerie — deux lignes
      // arrivaient avec un code vide, Postgres rejetait l'INSERT, et comme il
      // porte sur le LOT ENTIER, les autres fiches du meme import tombaient
      // avec elles. C'est ainsi que TPCI 5,70% 2026-2033, FCP BRIDGE CONFORT
      // et FCP BRIDGE INSTITUTIONNEL se perdaient a chaque enregistrement, en
      // compagnie des deux lignes fautives.
      //
      // A defaut de symbole, on en derive un du nom : lisible, stable d'un
      // import a l'autre, et que le gerant reste libre de corriger. Le
      // rapprochement, lui, ne depend pas du code mais de l'alias.
      const codesPris = new Set<string>();
      for (const r of (existing ?? []) as { code: string }[]) {
        const c = (r.code ?? "").trim().toLowerCase();
        if (c) codesPris.add(c);
      }
      for (const p of byCode.values()) {
        const c = (p.rawCode ?? "").trim().toLowerCase();
        if (c) codesPris.add(c);
      }
      const codeDeSecours = (nom: string): string => {
        const base = normName(nom).replace(/ /g, "").toUpperCase().slice(0, 24) || "TITRE";
        let code = base;
        for (let n = 2; codesPris.has(code.toLowerCase()); n++) code = `${base}-${n}`;
        codesPris.add(code.toLowerCase());
        return code;
      };

      const toInsert: Record<string, unknown>[] = [];
      for (const [key, p] of byCode) {
        if (idByCode.has(key)) continue;
        const linkedIsin = p.matchKind === "listed-bond" || p.matchKind === "sovereign";
        // `source` / `refId` désignent une référence du RÉFÉRENTIEL DE MARCHÉ.
        // Seules ces quatre natures en ont une ; « dat » et « cash » décrivent
        // un dépôt ou un compte bancaire, qui n'existent dans aucun référentiel,
        // et « custom » renvoie à un titre déjà local.
        //
        // Les inscrire comme liés produisait des comptes de trésorerie badgés
        // « Lié au site » dont la référence était par construction introuvable :
        // siteSecurityAttributes ne connaît ni « dat » ni « cash » et renvoie
        // null, ce que la resynchronisation signalait comme un lien cassé.
        const known =
          p.matchKind === "stock" ||
          p.matchKind === "listed-bond" ||
          p.matchKind === "sovereign" ||
          p.matchKind === "fund";
        // NOM : celui de l'INVENTAIRE, pas la dénomination officielle du site.
        //
        // C'est le libellé que le gérant lit dans ses états et que ses exports
        // réemploieront : en faire le nom du référentiel garantit que le
        // rapprochement par nom exact fonctionne au prochain import, sans
        // aucune ressaisie. Adopter le nom du site produisait l'inverse —
        // « FCTC SENELEC MEZZANINE 10 %2025-2030 » au référentiel contre
        // « FCTC SENELEC 10% 2025-2030 » à l'inventaire, et plus rien ne se
        // rapprochait.
        //
        // Le nom officiel n'est pas perdu : il part en ALIAS, invisible mais
        // actif au rapprochement.
        const nomInventaire = (p.rawLabel || p.matchLabel || "").trim();
        const nomSite = (p.matchLabel ?? "").trim();
        const attributs: Record<string, string> = known
          ? { source: p.matchKind, refId: p.matchId ?? "" }
          : {};
        // L'ALIAS porte le nom d'inventaire — c'est LUI la clef de
        // rapprochement au prochain import, et il doit survivre a tout
        // renommage ulterieur du titre. Le nom officiel du site y entre aussi,
        // pour le cas ou un export futur emploierait cette denomination.
        for (const libelle of [nomInventaire, nomSite]) {
          const alias = ajouterAlias(attributs, libelle, []);
          if (alias !== null) attributs.alias = alias;
        }

        toInsert.push({
          owner_id: user.id,
          kind: SECTIONS.includes(p.section) ? p.section : "autre",
          code: (p.rawCode ?? "").trim() || codeDeSecours(nomInventaire),
          name: nomInventaire,
          isin: linkedIsin ? (p.matchId ?? "") : "",
          currency: "XOF",
          attributes: attributs,
        });
      }
      if (toInsert.length) {
        // UN ECHEC DE LOT NE DOIT PAS EMPORTER LES FICHES SAINES.
        //
        // Un INSERT multi-lignes est atomique : une seule ligne en conflit et
        // tout le lot est perdu. On garde le lot pour sa rapidite — c'est le
        // cas courant — mais on retombe ligne a ligne des qu'il echoue, de
        // sorte qu'une fiche fautive ne coute qu'elle-meme. Et l'erreur est
        // tracee : c'est son silence qui a masque la perte pendant plusieurs
        // imports.
        const cols = "id, code, name";
        const { data: lot, error: errLot } = await supabase
          .from("custom_securities")
          .insert(toInsert)
          .select(cols);
        let inserted = lot;
        if (errLot) {
          console.error(
            `[référentiel] insertion groupée refusée (${toInsert.length} fiche(s)) : ` +
              `${errLot.message} — reprise ligne à ligne`,
          );
          const unes: { id: string; code: string; name: string }[] = [];
          for (const fiche of toInsert) {
            const { data: une, error: errUne } = await supabase
              .from("custom_securities")
              .insert(fiche)
              .select(cols)
              .single();
            if (errUne) {
              console.error(
                `[référentiel] fiche « ${String(fiche.name)} » (code ${String(
                  fiche.code,
                )}) non créée : ${errUne.message}`,
              );
              continue;
            }
            if (une) unes.push(une as { id: string; code: string; name: string });
          }
          inserted = unes;
        }
        // Meme double indexation qu'a la lecture : un titre insere SANS code ne
        // se retrouverait pas par lui, et son rattachement au fonds serait
        // perdu juste apres sa creation.
        for (const r of (inserted ?? []) as { id: string; code: string; name: string }[]) {
          const code = (r.code ?? "").trim().toLowerCase();
          if (code) idByCode.set(code, r.id);
          const nom = normName(r.name ?? "");
          if (nom && !idByCode.has(nom)) idByCode.set(nom, r.id);
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

    // ── Mémorisation des libellés ─────────────────────────────────────────
    //
    // Chaque ligne rattachée à un titre du référentiel enseigne une chose :
    // « ce libellé-là désigne ce titre-ci ». On l'enregistre, parce que le
    // libellé change d'un export à l'autre — « FCTC SENELEC 10% 2025-2030 »
    // ici, « FCTC SENELEC MEZZANINE 10 %2025-2030 » au référentiel — et que
    // le rapprochement par nom exact ne peut rien contre cet écart.
    //
    // C'est ce qui rend le travail de rattachement DÉFINITIF : fait une fois,
    // il vaut pour tous les imports suivants, quel que soit le libellé.
    await memoriserLibelles(supabase, user.id, input.positions);
  } catch (e) {
    // Best-effort : le catalogage ne doit pas faire échouer l'enregistrement du
    // portefeuille. Mais l'avaler SANS TRACE rendait tout diagnostic
    // impossible — c'est ce silence qui a masqué le filtre sensible à la casse
    // ci-dessus pendant plusieurs imports.
    console.error(
      `[référentiel] catalogage des libellés interrompu : ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  return { ok: true, data: { id: snap.id } };
}

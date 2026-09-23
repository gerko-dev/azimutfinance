"use server";

// === Rapprochement d'un avis d'exécution ===
//
// LE RAPPORT DU DÉPOSITAIRE N'EST PAS UN CARNET D'ORDRES, C'EST UN COMPTE
// RENDU. Les ordres, le gérant les a déjà saisis : ils sont au module, en
// attente d'exécution, et ils pèsent sur le point de trésorerie. Ce que le
// fichier apporte, c'est la SUITE de leur histoire — combien de titres ont été
// servis, à quelle date, à quel prix.
//
// L'import RAPPROCHE donc, il ne crée pas. Créer une ligne de plus laisserait
// l'ordre d'origine éternellement ouvert à côté de son double servi : le titre
// compterait deux fois à l'inventaire, et l'engagement ne se dénouerait jamais.
//
// Une exécution par GROUPE du rapport. Un ordre de 5 000 SONATEL servi à
// treize prix reçoit treize exécutions sur le même ordre — c'est exactement ce
// que le modèle prévoit, chaque exécution portant son prix propre.

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/admin/types";

import { autoriser } from "./operations-marche-garde";
import { parseOperationsMarcheBuffer, type OrdreImporte } from "./operations-marche-parse";
import { titresMfr } from "./operations-marche-titres";
import { loadOperationsMarche } from "./operations-marche-data";
import { chargerParametresMarche } from "./parametres-marche-data";
import { conventionDe } from "./parametres-marche-types";
import {
  dateDenouement,
  marcheDe,
  quantiteRestante,
  sensDe,
  type DescriptionOperation,
  type Instrument,
} from "./operations-marche-types";

/** Un ordre du fonds encore en attente, tel que l'écran le propose au choix. */
export type OrdreOuvert = {
  id: string;
  dateOperation: string;
  description: DescriptionOperation;
  sens: "achat" | "vente";
  code: string;
  libelle: string;
  /** Quantité ordonnée, et ce qu'il en reste à servir. */
  quantite: number;
  restante: number;
  prix: number;
};

/** Une ligne du rapport, rapprochée d'un ordre du fonds. */
export type LigneImport = OrdreImporte & {
  /** Titre reconnu au référentiel BRVM. Null quand le mnémonique est inconnu. */
  code: string;
  libelle: string;
  instrument: Instrument | null;
  /** Ordre auquel cette exécution se rattache. PROPOSÉ, et modifiable à
   *  l'écran : c'est une déduction, pas une certitude. */
  ordreId: string | null;
  /** Ce qui empêche le rapprochement, en clair. Null quand il a abouti. */
  raison: string | null;
  /** Cette exécution figure DÉJÀ sur l'ordre, à l'identique. Le fichier a déjà
   *  été passé : on la montre, on ne la rejoue pas. */
  deja: boolean;
};

export type ApercuImport = {
  lignes: LigneImport[];
  /** Les ordres MFR encore ouverts du fonds, pour la liste déroulante. */
  ordres: OrdreOuvert[];
  transactionsLues: number;
  avertissements: string[];
  /** Nom du fonds tel que le fichier l'écrit — à rapprocher de celui choisi. */
  fondsFichier: string;
};

/** Ce que le rapport apporte sur les CONDITIONS de l'opération, et que l'ordre
 *  ne portait pas encore au moment de sa saisie. */
export type ReglagesImport = {
  sgi: string;
  tauxCourtage: number;
  tauxTps: number;
  tauxBrvm: number;
  tauxDcbr: number;
  /** Reporter ces conditions sur les ordres rapprochés. Un interrupteur, et
   *  non un effet de bord : écraser en silence la SGI d'un ordre déjà
   *  renseigné serait pire que de ne rien faire. */
  appliquer: boolean;
};

export type Affectation = {
  ordreId: string;
  date: string;
  quantite: number;
  prix: number;
  /** Nombre de transactions élémentaires derrière cette exécution. Porté en
   *  note : c'est ce qui permet de recouper la ligne avec le rapport. */
  transactions: number;
};

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;
const cle = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** Un ordre porte-t-il sur ce titre ? Les désignations ne se recoupent pas
 *  toujours : l'ordre peut avoir été saisi sous son ISIN quand le dépositaire
 *  ne connaît que le mnémonique. On accepte l'une ou l'autre. */
function memeTitre(
  o: { code: string; libelle: string },
  l: { code: string; libelle: string; symbole: string },
): boolean {
  const attendues = new Set([cle(l.code), cle(l.libelle), cle(l.symbole)].filter(Boolean));
  return attendues.has(cle(o.code)) || attendues.has(cle(o.libelle));
}

/**
 * Lit le fichier et le confronte aux ordres en attente du fonds.
 *
 * RIEN N'EST ÉCRIT ICI. Le gérant doit pouvoir voir ce que le fichier
 * contient, et surtout ce qu'il n'a PAS su rapprocher, avant d'engager quoi
 * que ce soit. Une ligne sans ordre en face est presque toujours un ordre
 * oublié à la saisie — c'est une information, pas une erreur d'import.
 */
export async function previsualiserImportOperationsAction(
  fundId: string,
  formData: FormData,
): Promise<ActionResult<ApercuImport>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { ok: false, error: "Choisis le rapport d'exécution à rapprocher." };
  }

  let resultat;
  try {
    resultat = await parseOperationsMarcheBuffer(Buffer.from(await fichier.arrayBuffer()));
  } catch (e) {
    return {
      ok: false,
      error: `Fichier illisible : ${e instanceof Error ? e.message : "format inattendu"}.`,
    };
  }

  // Le référentiel BRVM, indexé par MNÉMONIQUE : c'est la seule désignation que
  // le dépositaire donne. Il sert à NOMMER la ligne, pas à la rapprocher — le
  // rapprochement se fait sur les ordres du fonds.
  const parSymbole = new Map<string, ReturnType<typeof titresMfr>[number]>();
  for (const t of titresMfr()) {
    const s = cle(t.symbole);
    if (s && !parSymbole.has(s)) parSymbole.set(s, t);
  }

  // LES ORDRES QUI ATTENDENT ENCORE. Un ordre clôturé ne se sert plus, un
  // ordre entièrement servi non plus. La PÉREMPTION, elle, n'écarte pas :
  // le rapport est daté, et un ordre « jour » du 22 septembre est périmé
  // aujourd'hui tout en ayant parfaitement été exécuté ce jour-là.
  const toutes = await loadOperationsMarche(fundId);
  const ouverts = toutes.filter(
    (o) =>
      marcheDe(o.description) === "mfr" && o.clotureLe === null && quantiteRestante(o) > 0,
  );

  const ordres: OrdreOuvert[] = ouverts
    .map((o) => ({
      id: o.id,
      dateOperation: o.dateOperation,
      description: o.description,
      sens: sensDe(o.description),
      code: o.code,
      libelle: o.libelle,
      quantite: o.quantite,
      restante: quantiteRestante(o),
      prix: o.prix,
    }))
    .sort((a, b) => a.dateOperation.localeCompare(b.dateOperation));

  // Ce que chaque ordre peut encore absorber, décompté AU FIL du rapport :
  // treize lignes SONATEL se servent sur le même ordre, et les traiter
  // indépendamment l'épuiserait treize fois.
  const reste = new Map(ordres.map((o) => [o.id, o.restante]));

  // Les exécutions DÉJÀ enregistrées, pour reconnaître un fichier repassé.
  const dejaEnregistrees = new Set<string>();
  for (const o of toutes) {
    for (const e of o.executions) {
      dejaEnregistrees.add(`${o.id}|${e.dateExecution}|${e.quantite}|${e.prix || o.prix}`);
    }
  }

  const inconnus = new Set<string>();
  const lignes: LigneImport[] = resultat.ordres.map((g) => {
    const t = parSymbole.get(cle(g.symbole));
    if (!t) inconnus.add(g.symbole);
    const base = {
      ...g,
      code: t ? t.isin || t.cle : g.symbole,
      libelle: t ? t.libelle : g.symbole,
      instrument: t ? t.instrument : null,
    };

    // Les ordres du bon sens, sur le bon titre, passés AVANT l'exécution :
    // un ordre ne peut pas être servi la veille du jour où il est donné.
    const candidats = ordres.filter(
      (o) => o.sens === g.sens && memeTitre(o, base) && o.dateOperation <= g.date,
    );

    const dejaVue = candidats.find((o) =>
      dejaEnregistrees.has(`${o.id}|${g.date}|${g.quantite}|${g.prix}`),
    );
    if (dejaVue) {
      return { ...base, ordreId: dejaVue.id, raison: null, deja: true };
    }

    // LE PLUS ANCIEN D'ABORD, parmi ceux qui ont encore la place. Un carnet se
    // sert dans l'ordre où il a été garni, et c'est la règle la moins
    // surprenante quand deux ordres portent sur le même titre.
    const retenu = candidats.find((o) => (reste.get(o.id) ?? 0) >= g.quantite);
    if (retenu) {
      reste.set(retenu.id, (reste.get(retenu.id) ?? 0) - g.quantite);
      return { ...base, ordreId: retenu.id, raison: null, deja: false };
    }

    const place = candidats.reduce((s, o) => s + (reste.get(o.id) ?? 0), 0);
    const raison = !t
      ? "titre absent du référentiel BRVM"
      : candidats.length === 0
        ? `aucun ordre de ${g.sens === "achat" ? "achat" : "vente"} ouvert sur ce titre au ${g.date}`
        : `les ordres ouverts ne laissent que ${place} titre${place > 1 ? "s" : ""} à servir`;

    return { ...base, ordreId: null, raison, deja: false };
  });

  const avertissements = [...resultat.avertissements];
  for (const s of inconnus) {
    avertissements.push(`« ${s} » ne correspond à aucun titre du référentiel BRVM.`);
  }

  return {
    ok: true,
    data: {
      lignes,
      ordres,
      transactionsLues: resultat.transactionsLues,
      avertissements,
      fondsFichier: resultat.ordres[0]?.fondsFichier ?? "",
    },
  };
}

/**
 * Écrit les exécutions sur les ordres rapprochés.
 *
 * TOUT EST REVÉRIFIÉ ICI. L'aperçu a été calculé sur un état du fonds qui peut
 * avoir changé — un autre onglet, une saisie entre-temps —, et l'affectation
 * vient du navigateur, donc elle ne fait foi de rien. On relit les ordres, on
 * recompte ce qui a déjà été servi, et on refuse ce qui déborde.
 *
 * UN REFUS N'ARRÊTE PAS LE LOT : qu'une ligne bute ne doit pas faire perdre
 * les trente-six autres. Le bilan dit laquelle, et pourquoi.
 */
export async function rapprocherImportOperationsAction(
  fundId: string,
  affectations: Affectation[],
  reglages: ReglagesImport,
): Promise<
  ActionResult<{ executions: number; doublons: number; ordresMisAJour: number; refus: string[] }>
> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  if (affectations.length === 0) {
    return { ok: false, error: "Aucune ligne rapprochée à enregistrer." };
  }

  const parametres = await chargerParametresMarche();
  const toutes = await loadOperationsMarche(fundId);
  const parId = new Map(toutes.map((o) => [o.id, o]));

  // Ce que chaque ordre a déjà servi, tenu à jour AU FIL du lot : sans ce
  // compteur, treize lignes du même ordre se compareraient chacune à l'état
  // d'avant les autres et pourraient le sur-servir.
  const servie = new Map(
    toutes.map((o) => [o.id, o.executions.reduce((s, e) => s + e.quantite, 0)]),
  );
  const dejaEnregistrees = new Set<string>();
  for (const o of toutes) {
    for (const e of o.executions) {
      dejaEnregistrees.add(`${o.id}|${e.dateExecution}|${e.quantite}|${e.prix || o.prix}`);
    }
  }

  let executions = 0;
  let doublons = 0;
  const refus: string[] = [];
  const ordresTouches = new Set<string>();

  for (const a of affectations) {
    const o = parId.get(a.ordreId);
    const ou = o ? `${o.libelle} du ${a.date} à ${a.prix}` : `ordre ${a.ordreId}`;

    if (!o) {
      refus.push(`${ou} : ordre introuvable dans ce fonds.`);
      continue;
    }
    if (!EST_DATE.test(a.date) || !(a.quantite > 0) || !(a.prix > 0)) {
      refus.push(`${ou} : date, quantité ou prix inexploitable.`);
      continue;
    }
    // Le marché primaire et le MTP ont leurs propres règles de service — une
    // adjudication est servie en totalité ou pas du tout. Ce rapport est celui
    // du marché financier : on s'y tient.
    if (marcheDe(o.description) !== "mfr") {
      refus.push(`${ou} : cet ordre n'est pas un ordre de marché financier.`);
      continue;
    }
    if (o.clotureLe) {
      refus.push(`${ou} : ordre clôturé le ${o.clotureLe}.`);
      continue;
    }
    if (a.date < o.dateOperation) {
      refus.push(`${ou} : exécution antérieure à l'ordre, passé le ${o.dateOperation}.`);
      continue;
    }

    const clefExecution = `${o.id}|${a.date}|${a.quantite}|${a.prix}`;
    if (dejaEnregistrees.has(clefExecution)) {
      doublons += 1;
      continue;
    }

    const dejaServie = servie.get(o.id) ?? 0;
    if (dejaServie + a.quantite > o.quantite) {
      refus.push(
        `${ou} : l'ordre porte sur ${o.quantite} titres, dont ${dejaServie} déjà ` +
          `servis — il n'en reste que ${o.quantite - dejaServie}.`,
      );
      continue;
    }

    const { error } = await supabase.from("fund_market_executions").insert({
      owner_id: userId,
      operation_id: o.id,
      date_execution: a.date,
      date_denouement: dateDenouement(
        a.date,
        conventionDe(parametres, o.instrument as Instrument),
      ),
      quantite: a.quantite,
      // Le prix RÉELLEMENT servi, qui n'est pas celui de l'ordre : c'est
      // précisément ce que le rapport apprend.
      prix: a.prix,
      note: `Rapproché — ${a.transactions} transaction${a.transactions > 1 ? "s" : ""}`,
    });

    if (error) {
      refus.push(`${ou} : ${error.message}`);
      continue;
    }

    dejaEnregistrees.add(clefExecution);
    servie.set(o.id, dejaServie + a.quantite);
    ordresTouches.add(o.id);
    executions += 1;
  }

  // LES CONDITIONS DE L'OPÉRATION, une fois les exécutions écrites.
  //
  // À la saisie, le gérant connaît son intention ; il ne connaît pas encore
  // l'intermédiaire retenu ni son courtage. Le rapport les apporte, et c'est
  // ici qu'ils rejoignent l'ordre — sur les ordres RAPPROCHÉS seulement, et
  // seulement si le gérant l'a demandé.
  let ordresMisAJour = 0;
  if (reglages.appliquer && ordresTouches.size > 0) {
    const { error, count } = await supabase
      .from("fund_market_operations")
      .update(
        {
          sgi: reglages.sgi.trim(),
          taux_courtage: reglages.tauxCourtage,
          taux_tps: reglages.tauxTps,
          taux_brvm: reglages.tauxBrvm,
          taux_dcbr: reglages.tauxDcbr,
        },
        { count: "exact" },
      )
      .in("id", [...ordresTouches])
      .eq("fund_id", fundId)
      .eq("owner_id", userId);
    if (error) refus.push(`Conditions non reportées : ${error.message}`);
    else ordresMisAJour = count ?? ordresTouches.size;
  }

  if (executions > 0 || ordresMisAJour > 0) {
    revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
    revalidatePath("/gestion-portefeuille/operations-marche");
    revalidatePath("/gestion-portefeuille/tresorerie");
  }

  return { ok: true, data: { executions, doublons, ordresMisAJour, refus } };
}

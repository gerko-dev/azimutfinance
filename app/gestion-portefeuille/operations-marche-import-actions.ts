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
//
// UN RAPPORT COUVRE PLUSIEURS FONDS, et l'import les suit tous. Le dépositaire
// rend compte d'une séance, pas d'un portefeuille : celui du 29 septembre
// porte des achats pour TAWFIR HALAL et des ventes pour le FONDS DIVERSIFIE et
// NSIA ASSURANCES OPTIMUM. Demander au gérant de choisir un fonds l'obligeait
// à passer trois fois le même fichier, et surtout : rien n'empêchait de poser
// les ventes d'un fonds sur les ordres d'un autre, puisque le fonds du fichier
// ne servait qu'à AVERTIR.
//
// Le fonds de chaque ligne vient donc du FICHIER, et chaque ligne est
// confrontée aux ordres de SON fonds.

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/admin/types";

import { autoriser, type ClientServeur } from "./operations-marche-garde";
import { loadMyFunds } from "./data";
import { fondsDansLeTexte, rattacherFonds } from "./releves-rapprochement";
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

/** Un ordre encore en attente, tel que l'écran le propose au choix. */
export type OrdreOuvert = {
  id: string;
  /** Le fonds qui le porte : la liste déroulante d'une ligne ne doit proposer
   *  que les ordres de SON fonds. */
  fondsId: string;
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

/** Une ligne du rapport, rapprochée d'un ordre de SON fonds. */
export type LigneImport = OrdreImporte & {
  /** Le fonds que le rapport désigne, résolu au référentiel du gérant. Vide
   *  quand le nom du fichier ne correspond à aucun fonds géré — la ligne est
   *  alors montrée, et non rapprochée. */
  fondsId: string;
  fondsNom: string;
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
  /** Les ordres MFR encore ouverts, TOUS FONDS CONFONDUS, chacun portant le
   *  sien : l'écran filtre par ligne. */
  ordres: OrdreOuvert[];
  transactionsLues: number;
  avertissements: string[];
  /** Les fonds que le fichier nomme, et ce qu'on en a fait. */
  fondsDuFichier: { intitule: string; fondsId: string; fondsNom: string; lignes: number }[];
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
  /** Le fonds de l'ordre visé. Il est REVERIFIE au serveur : une affectation
   *  vient du navigateur, et poser l'exécution d'un fonds sur l'ordre d'un
   *  autre est précisément ce qu'il ne faut jamais pouvoir faire. */
  fondsId: string;
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
 * Lit le fichier et le confronte aux ordres en attente — DE CHAQUE FONDS.
 *
 * RIEN N'EST ÉCRIT ICI. Le gérant doit pouvoir voir ce que le fichier
 * contient, et surtout ce qu'il n'a PAS su rapprocher, avant d'engager quoi
 * que ce soit. Une ligne sans ordre en face est presque toujours un ordre
 * oublié à la saisie — c'est une information, pas une erreur d'import.
 *
 * LE FONDS VIENT DU FICHIER. Le dépositaire rend compte d'une séance : son
 * rapport porte les achats d'un portefeuille et les ventes de deux autres. On
 * résout donc chaque intitulé au référentiel du gérant, et l'on confronte
 * chaque ligne aux ordres de SON fonds. Un intitulé qu'on ne sait pas rattacher
 * laisse ses lignes visibles et non rapprochées — les taire reviendrait à dire
 * que le rapport ne les portait pas.
 */
export async function previsualiserImportOperationsAction(
  formData: FormData,
): Promise<ActionResult<ApercuImport>> {
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { ok: false, error: "Choisis le rapport d'exécution à rapprocher." };
  }

  const fonds = await loadMyFunds();
  if (fonds.length === 0) {
    return { ok: false, error: "Aucun fonds géré : il n'y a aucun carnet où poser ces exécutions." };
  }
  // La garde d'accès du module, posée une fois sur le premier fonds : elle ne
  // dépend pas du portefeuille, et `loadMyFunds` ne rend déjà que les nôtres.
  const acces = await autoriser(fonds[0].id);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };

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

  // ── LES FONDS QUE LE FICHIER NOMME ──────────────────────────────────────
  //
  // DEUX SENS DE LECTURE, comme partout où l'on rapproche un nom : le
  // dépositaire écrit tantôt plus que le nom du fonds, tantôt moins — « FCP
  // Fonds Diversifie » pour « FCP NSIA FONDS DIVERSIFIE », « Tawfir Halal »
  // pour « FCP TAWFIR HALAL ».
  const candidats = fonds.map((f) => ({ cle: f.id, libelle: f.nom }));
  const resolu = new Map<string, { fondsId: string; fondsNom: string }>();
  for (const intitule of new Set(resultat.ordres.map((o) => o.fondsFichier))) {
    const r = (() => {
      const direct = rattacherFonds(intitule, candidats);
      if (direct.trouve) return direct;
      return fondsDansLeTexte(intitule, candidats);
    })();
    resolu.set(
      intitule,
      r.trouve
        ? { fondsId: r.cle, fondsNom: fonds.find((f) => f.id === r.cle)?.nom ?? "" }
        : { fondsId: "", fondsNom: "" },
    );
  }

  // ── LES CARNETS, UN PAR FONDS CONCERNE ──────────────────────────────────
  //
  // On ne charge QUE les fonds que le fichier nomme : lire les quinze carnets
  // pour un rapport qui en concerne trois ferait payer douze lectures inutiles
  // à chaque aperçu.
  const concernes = [...new Set([...resolu.values()].map((r) => r.fondsId))].filter(Boolean);
  const carnets = new Map<
    string,
    { ouverts: OrdreOuvert[]; reste: Map<string, number>; deja: Set<string> }
  >();
  for (const id of concernes) {
    const toutes = await loadOperationsMarche(id);
    // LES ORDRES QUI ATTENDENT ENCORE. Un ordre clôturé ne se sert plus, un
    // ordre entièrement servi non plus. La PÉREMPTION, elle, n'écarte pas :
    // le rapport est daté, et un ordre « jour » du 22 septembre est périmé
    // aujourd'hui tout en ayant parfaitement été exécuté ce jour-là.
    const ouverts: OrdreOuvert[] = toutes
      .filter(
        (o) =>
          marcheDe(o.description) === "mfr" && o.clotureLe === null && quantiteRestante(o) > 0,
      )
      .map((o) => ({
        id: o.id,
        fondsId: id,
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

    // Les exécutions DÉJÀ enregistrées, pour reconnaître un fichier repassé.
    const deja = new Set<string>();
    for (const o of toutes) {
      for (const e of o.executions) {
        deja.add(`${o.id}|${e.dateExecution}|${e.quantite}|${e.prix || o.prix}`);
      }
    }
    carnets.set(id, {
      ouverts,
      // Ce que chaque ordre peut encore absorber, décompté AU FIL du rapport :
      // treize lignes SONATEL se servent sur le même ordre, et les traiter
      // indépendamment l'épuiserait treize fois.
      reste: new Map(ouverts.map((o) => [o.id, o.restante])),
      deja,
    });
  }

  const inconnus = new Set<string>();
  const lignes: LigneImport[] = resultat.ordres.map((g) => {
    const t = parSymbole.get(cle(g.symbole));
    if (!t) inconnus.add(g.symbole);
    const attache = resolu.get(g.fondsFichier) ?? { fondsId: "", fondsNom: "" };
    const base = {
      ...g,
      ...attache,
      code: t ? t.isin || t.cle : g.symbole,
      libelle: t ? t.libelle : g.symbole,
      instrument: t ? t.instrument : null,
    };

    const carnet = attache.fondsId ? carnets.get(attache.fondsId) : undefined;
    if (!carnet) {
      return {
        ...base,
        ordreId: null,
        deja: false,
        raison: `« ${g.fondsFichier || "sans nom"} » ne correspond à aucun fonds géré`,
      };
    }

    // Les ordres du bon sens, sur le bon titre, passés AVANT l'exécution :
    // un ordre ne peut pas être servi la veille du jour où il est donné.
    const possibles = carnet.ouverts.filter(
      (o) => o.sens === g.sens && memeTitre(o, base) && o.dateOperation <= g.date,
    );

    const dejaVue = possibles.find((o) =>
      carnet.deja.has(`${o.id}|${g.date}|${g.quantite}|${g.prix}`),
    );
    if (dejaVue) {
      return { ...base, ordreId: dejaVue.id, raison: null, deja: true };
    }

    // LE PLUS ANCIEN D'ABORD, parmi ceux qui ont encore la place. Un carnet se
    // sert dans l'ordre où il a été garni, et c'est la règle la moins
    // surprenante quand deux ordres portent sur le même titre.
    const retenu = possibles.find((o) => (carnet.reste.get(o.id) ?? 0) >= g.quantite);
    if (retenu) {
      carnet.reste.set(retenu.id, (carnet.reste.get(retenu.id) ?? 0) - g.quantite);
      return { ...base, ordreId: retenu.id, raison: null, deja: false };
    }

    const place = possibles.reduce((s, o) => s + (carnet.reste.get(o.id) ?? 0), 0);
    const raison = !t
      ? "titre absent du référentiel BRVM"
      : possibles.length === 0
        ? `aucun ordre de ${g.sens === "achat" ? "achat" : "vente"} ouvert sur ce titre au ${g.date}`
        : `les ordres ouverts ne laissent que ${place} titre${place > 1 ? "s" : ""} à servir`;

    return { ...base, ordreId: null, raison, deja: false };
  });

  const avertissements = [...resultat.avertissements];
  for (const s of inconnus) {
    avertissements.push(`« ${s} » ne correspond à aucun titre du référentiel BRVM.`);
  }
  for (const [intitule, r] of resolu) {
    if (!r.fondsId) {
      avertissements.push(
        `« ${intitule} » ne correspond à aucun fonds géré : ses lignes sont montrées, non rapprochées.`,
      );
    }
  }

  const fondsDuFichier = [...resolu.entries()].map(([intitule, r]) => ({
    intitule,
    fondsId: r.fondsId,
    fondsNom: r.fondsNom,
    lignes: lignes.filter((l) => l.fondsFichier === intitule).length,
  }));

  return {
    ok: true,
    data: {
      lignes,
      ordres: [...carnets.values()].flatMap((c) => c.ouverts),
      transactionsLues: resultat.transactionsLues,
      avertissements,
      fondsDuFichier,
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
  affectations: Affectation[],
  reglages: ReglagesImport,
): Promise<
  ActionResult<{ executions: number; doublons: number; ordresMisAJour: number; refus: string[] }>
> {
  if (affectations.length === 0) {
    return { ok: false, error: "Aucune ligne rapprochée à enregistrer." };
  }

  // CHAQUE AFFECTATION DIT SON FONDS, ET ON LE VERIFIE. Elle vient du
  // navigateur : un identifiant de fonds qui ne serait pas celui du gérant, ou
  // un ordre qui n'appartiendrait pas au fonds annoncé, poserait l'exécution
  // d'un portefeuille sur le carnet d'un autre. `loadMyFunds` borne les fonds
  // acceptables, et le carnet de chaque fonds borne les ordres.
  const mesFonds = new Set((await loadMyFunds()).map((f) => f.id));
  const parFonds = new Map<string, Affectation[]>();
  const refusAmont: string[] = [];
  for (const a of affectations) {
    if (!mesFonds.has(a.fondsId)) {
      refusAmont.push(`Ordre ${a.ordreId} : fonds inconnu ou non géré.`);
      continue;
    }
    (parFonds.get(a.fondsId) ?? parFonds.set(a.fondsId, []).get(a.fondsId)!).push(a);
  }
  if (parFonds.size === 0) {
    return { ok: false, error: refusAmont[0] ?? "Aucune ligne rapprochée à enregistrer." };
  }

  const acces = await autoriser([...parFonds.keys()][0]);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const parametres = await chargerParametresMarche();

  let executions = 0;
  let doublons = 0;
  const refus: string[] = [...refusAmont];
  let ordresMisAJour = 0;

  // UN FONDS APRES L'AUTRE, chacun avec son carnet. Un compteur commun aurait
  // confondu deux ordres homonymes de portefeuilles différents.
  for (const [fundId, lot] of parFonds) {
    const r = await ecrireLot(
      { supabase, userId, fundId },
      lot,
      reglages,
      parametres,
    );
    executions += r.executions;
    doublons += r.doublons;
    ordresMisAJour += r.ordresMisAJour;
    refus.push(...r.refus);
  }

  if (executions > 0 || ordresMisAJour > 0) {
    for (const fundId of parFonds.keys()) {
      revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
    }
    revalidatePath("/gestion-portefeuille/operations-marche");
    revalidatePath("/gestion-portefeuille/tresorerie");
  }

  return { ok: true, data: { executions, doublons, ordresMisAJour, refus } };
}

/** Le lot d'un seul fonds : tout ce qui suit était déjà là, et ne change pas. */
async function ecrireLot(
  ctx: { supabase: ClientServeur; userId: string; fundId: string },
  affectations: Affectation[],
  reglages: ReglagesImport,
  parametres: Awaited<ReturnType<typeof chargerParametresMarche>>,
): Promise<{ executions: number; doublons: number; ordresMisAJour: number; refus: string[] }> {
  const { supabase, userId, fundId } = ctx;
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

  return { executions, doublons, ordresMisAJour, refus };
}

"use server";

// === Opérations de marché — saisie ===
//
// Même garde que les autres écritures du module : session, niveau 1, propriété
// du fonds. Une opération est une ligne de plus, jamais un remplacement : on
// n'empile pas deux fois la même négociation, mais on n'en fusionne pas deux
// non plus — deux achats du même titre le même jour à deux prix différents
// sont deux opérations, et le classeur les tient comme telles.

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/admin/types";

import { estNiveau1, MSG_NIVEAU1 } from "./guard";
import { construirePointTresorerie } from "./tresorerie-data";
import {
  adjudicationsOuvertes,
  caracteristiques,
  etatsMtp,
  titresMfr,
  titresMtp,
  type CaracteristiquesTitre,
  type OptionTitre,
} from "./operations-marche-titres";
import {
  DESCRIPTIONS,
  dateDenouement,
  marcheDe,
  sensDe,
  type DescriptionOperation,
  type Instrument,
  type SaisieOperation,
} from "./operations-marche-types";
import {
  disponibiliteCession,
  refusCession,
  titresCessibles,
} from "./operations-marche-disponibilite";
import { chargerParametresMarche } from "./parametres-marche-data";
import { conventionDe } from "./parametres-marche-types";

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;

const DESCRIPTIONS_VALIDES = new Set<string>(DESCRIPTIONS.map((d) => d.valeur));
const INSTRUMENTS_VALIDES = new Set<string>(["actions", "obligations", "mtp"]);

type ClientServeur = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// Union DISCRIMINEE, et type ecrit a la main : laisse a l'inference, le type
// de retour fusionnait les deux branches et `acces.erreur` ressortait
// `string | undefined` apres le test `in`.
type Acces =
  | { erreur: string }
  | { supabase: ClientServeur; userId: string };

/** Vérifie la session, le niveau et la propriété du fonds. */
async function autoriser(fundId: string): Promise<Acces> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: "Tu dois être connecté." };
  if (!(await estNiveau1())) return { erreur: MSG_NIVEAU1 };

  const { data: fund } = await supabase
    .from("managed_funds")
    .select("id")
    .eq("id", fundId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!fund) return { erreur: "Fonds introuvable." };
  return { supabase, userId: user.id };
}

/**
 * Comptes de règlement d'un fonds — les COLONNES de son point de trésorerie.
 *
 * Chargé à la demande, quand le gérant choisit le fonds : l'écran est
 * interfonds, et précharger les comptes de tous les fonds ferait autant de
 * lectures d'inventaire pour n'en servir qu'une.
 *
 * On passe par `construirePointTresorerie` plutôt que de refaire le calcul des
 * colonnes : les clefs doivent être IDENTIQUES des deux côtés, sinon
 * l'opération se règle sur un compte qui n'existe pas dans le tableau. Mieux
 * vaut une lecture plus lourde qu'une duplication qui divergera.
 */
export async function comptesReglementAction(
  fundId: string,
): Promise<
  ActionResult<{ cle: string; nom: string; pays: string; sens: string; groupe: string }[]>
> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };

  const point = await construirePointTresorerie(fundId, "");
  if (!point)
    return {
      ok: false,
      error:
        "Ce fonds n'a pas encore d'inventaire : ses comptes de trésorerie sont inconnus.",
    };
  return {
    ok: true,
    data: point.etablissements.map((e) => ({
      cle: e.cle,
      nom: e.nom,
      pays: e.pays,
      sens: e.sens,
      // Le groupe distingue les BANQUES du mobile money. Un BTCC est une
      // banque : c'est lui qui tient le compte-titres, un opérateur de monnaie
      // électronique n'en tient pas.
      groupe: e.groupe,
    })),
  };
}

/**
 * Titres proposables, selon le marche.
 *
 * MFR : actions et obligations COTEES du referentiel BRVM. MTP : titres
 * publics de l'Etat choisi. Ces listes se lisent dans les CSV du site, donc au
 * serveur ; elles ne sont pas assez volumineuses pour justifier une recherche
 * paginee, et une liste complete se filtre au clavier dans le navigateur.
 *
 * Pas de garde sur un fonds ici : ce sont des donnees de marche, publiques sur
 * le portail. Le niveau 1 du layout suffit.
 */
export async function listerTitresAction(
  marche: "mfr" | "mtp" | "primaire",
  pays: string,
  /** Renseigné pour une VENTE : la liste se restreint alors à ce que le fonds
   *  peut réellement céder. Absent pour un achat — on achète ce qu'on veut. */
  cession?: { fundId: string; exclureOperationId: string | null },
): Promise<
  ActionResult<{ etats: { code: string; nom: string }[]; titres: OptionTitre[] }>
> {
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };

  // LE PRIMAIRE NE SE CÈDE PAS ET NE SE FILTRE PAS PAR ÉTAT : on souscrit à
  // une émission à venir, tous émetteurs confondus. Les deux calendriers
  // UMOA-Titres y sont réunis — cf. `adjudicationsOuvertes`.
  if (marche === "primaire") {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    return { ok: true, data: { etats: [], titres: adjudicationsOuvertes(aujourdhui) } };
  }

  const etats = marche === "mtp" ? etatsMtp() : [];

  if (!cession) {
    if (marche === "mfr") return { ok: true, data: { etats: [], titres: titresMfr() } };
    const choisi = pays || etats[0]?.code || "";
    return { ok: true, data: { etats, titres: choisi ? titresMtp(choisi) : [] } };
  }

  // POUR UNE VENTE, L'ÉTAT NE FILTRE PAS. Un fonds détient souvent des titres
  // de plusieurs émetteurs, et lui demander de retrouver lequel a émis celui
  // qu'il veut vendre, c'est lui faire chercher ce que l'inventaire sait déjà.
  // On balaie donc tous les États et on ne garde que le cessible.
  const gisement =
    marche === "mfr" ? titresMfr() : etats.flatMap((e) => titresMtp(e.code));

  const titres = await titresCessibles(
    cession.fundId,
    gisement,
    cession.exclureOperationId,
  );
  return { ok: true, data: { etats, titres } };
}

/**
 * Caracteristiques d'un titre a une date : ISIN, nominal, taux facial,
 * echeance et INTERETS COURUS PAR TITRE.
 *
 * Les courus sont la raison d'etre de cette action. Les ressaisir a la main
 * etait la porte ouverte a un zero oublie sur un montant a neuf chiffres,
 * alors que le site connait le taux facial et les dates de detachement.
 */
export async function caracteristiquesTitreAction(
  marche: "mfr" | "mtp",
  cle: string,
  pays: string,
  dateOperation: string,
): Promise<ActionResult<CaracteristiquesTitre>> {
  if (!(await estNiveau1())) return { ok: false, error: MSG_NIVEAU1 };
  const c = caracteristiques(marche, cle, pays, dateOperation);
  if (!c) return { ok: false, error: "Titre introuvable dans le référentiel." };
  return { ok: true, data: c };
}

/**
 * Contrôles PARTAGÉS par la création et la modification.
 *
 * Une correction ne doit pas pouvoir produire une ligne que la saisie initiale
 * aurait refusée — c'est exactement par là que les données se dégradent.
 *
 * Ils portent sur ce qui rendrait la ligne INEXPLOITABLE : le montant se
 * déduit de la quantité et du prix, et le compte de règlement décide de la
 * colonne — sans lui, le montant n'a nulle part où tomber et disparaîtrait en
 * silence.
 *
 * Renvoie le message d'erreur, ou null si tout va bien.
 */
function valider(saisie: SaisieOperation): string | null {
  if (!EST_DATE.test(saisie.dateOperation)) return "Renseigne la date de l'opération.";
  if (!DESCRIPTIONS_VALIDES.has(saisie.description)) return "Choisis le type d'opération.";
  if (!INSTRUMENTS_VALIDES.has(saisie.instrument))
    return "Choisis la nature de l'instrument.";
  if (!(saisie.quantite > 0)) return "La quantité doit être strictement positive.";
  if (!(saisie.prix > 0)) return "Le prix doit être strictement positif.";
  if (!saisie.compteReglement.trim())
    return "Choisis le compte de règlement : sans lui, le montant n'entre dans aucune colonne du point de trésorerie.";

  // LES VOLETS SONT PROPRES AU MTP, et cela se vérifie ici aussi : l'écran
  // masque les cases sur un ordre de bourse, mais un formulaire qui a changé
  // de type après coup pourrait encore les porter.
  if ((saisie.remere || saisie.pret) && marcheDe(saisie.description) !== "mtp")
    return "Un réméré ou un prêt de titres ne se noue que sur une opération MTP.";
  if (saisie.remere && saisie.pret)
    return "Un même ordre ne peut pas être à la fois un réméré et un prêt de titres.";
  // Prêter, c'est faire SORTIR des titres : cela se saisit sur une vente MTP,
  // jamais sur un achat.
  if (saisie.pret && saisie.description !== "VENTE_MTP")
    return "Un prêt de titres ne se saisit que sur une vente MTP.";
  if (saisie.remere) {
    if (!EST_DATE.test(saisie.remere.dateFin))
      return "Renseigne la date de fin du réméré : c'est elle qui porte le remboursement.";
    if (!(saisie.remere.prixSortie > 0))
      return "Le prix de sortie du réméré doit être strictement positif.";
  }

  // UNE SOUSCRIPTION A UNE MODALITÉ, et elle seule. C'est la modalité qui dit
  // comment le titre a été désigné ; l'omettre laisserait une ligne qu'on ne
  // saurait plus rattacher ni à un calendrier ni à un placement.
  if (saisie.description === "SOUSCRIPTION_MP") {
    if (saisie.modalite === null)
      return "Choisis la modalité : adjudication ou syndication.";
    if (saisie.remere || saisie.pret)
      return "Une souscription au marché primaire ne porte ni réméré ni prêt de titres.";
  } else if (saisie.modalite !== null) {
    return "La modalité ne concerne que les souscriptions au marché primaire.";
  }

  // Une opération de dénouement SOLDE un réméré, elle n'en ouvre pas un
  // nouveau : la laisser porter un volet enchaînerait les cessions temporaires
  // sans que rien ne les distingue.
  if (saisie.denoueRemereDe) {
    if (marcheDe(saisie.description) !== "mtp")
      return "Le dénouement d'un réméré est une opération MTP.";
    if (saisie.remere || saisie.pret)
      return "Une opération de dénouement ne porte ni réméré ni prêt de titres.";
  }
  return null;
}

/**
 * Écrit — ou efface — les volets réméré et prêt d'un ordre.
 *
 * DÉCOCHER DOIT EFFACER. Sans le `delete`, un ordre dont on retire la case
 * garderait sa ligne satellite, continuerait de peser dans le poste Rémérés et
 * de ne plus alimenter les achats MTP, sans que rien ne l'affiche.
 *
 * L'ordre importe : on supprime le volet qui n'est plus, puis on écrit celui
 * qui est. Un ordre ne peut porter que l'un des deux.
 */
async function enregistrerVolets(
  supabase: ClientServeur,
  userId: string,
  operationId: string,
  saisie: SaisieOperation,
): Promise<string | null> {
  const { remere, pret } = saisie;

  if (!remere) await supabase.from("fund_market_repos").delete().eq("operation_id", operationId);
  if (!pret) await supabase.from("fund_market_loans").delete().eq("operation_id", operationId);

  // LE LIEN DE DÉNOUEMENT SE RÉÉCRIT ENTIÈREMENT, à chaque enregistrement.
  //
  // On détache d'abord ce que cette opération dénouait : sans cela, la
  // corriger pour qu'elle solde un autre réméré — ou plus aucun — en laisserait
  // deux qui se croient soldés par elle. Le lien n'étant stocké que d'un côté,
  // c'est le seul endroit où cette incohérence peut naître.
  await supabase
    .from("fund_market_repos")
    .update({ denoue_par: null })
    .eq("denoue_par", operationId)
    .eq("owner_id", userId);

  if (saisie.denoueRemereDe) {
    const { error } = await supabase
      .from("fund_market_repos")
      .update({ denoue_par: operationId })
      .eq("operation_id", saisie.denoueRemereDe)
      .eq("owner_id", userId);
    if (error) return error.message;
  }

  if (remere) {
    const { error } = await supabase.from("fund_market_repos").upsert(
      {
        operation_id: operationId,
        owner_id: userId,
        date_fin: remere.dateFin,
        contrepartie: remere.contrepartie.trim(),
        prix_sortie: remere.prixSortie,
        denoue_par: remere.denouePar,
      },
      { onConflict: "operation_id" },
    );
    if (error) return error.message;
  }

  if (pret) {
    const { error } = await supabase.from("fund_market_loans").upsert(
      {
        operation_id: operationId,
        owner_id: userId,
        contrepartie: pret.contrepartie.trim(),
        date_fin: pret.dateFin,
        taux_commission: pret.tauxCommission,
        date_reprise: pret.dateReprise,
      },
      { onConflict: "operation_id" },
    );
    if (error) return error.message;
  }

  return null;
}

/**
 * ON NE VEND PAS CE QU'ON N'A PAS.
 *
 * Contrôle asynchrone, donc à part de `valider` : il faut lire l'inventaire du
 * fonds et ses autres ordres. Il ne porte que sur les VENTES — un achat
 * n'épuise aucun stock.
 *
 * Il couvre du même coup la contrainte des prêts de titres : un titre prêté
 * reste à l'inventaire, mais il est dehors, et il ne peut pas être cédé tant
 * qu'il n'est pas repris.
 */
async function validerCession(
  fundId: string,
  saisie: SaisieOperation,
  exclureOperationId: string | null,
): Promise<string | null> {
  if (sensDe(saisie.description) !== "vente") return null;
  const dispo = await disponibiliteCession(
    fundId,
    saisie.code,
    saisie.libelle,
    exclureOperationId,
  );
  return refusCession(dispo, saisie.quantite);
}

export async function enregistrerOperationMarcheAction(
  fundId: string,
  saisie: SaisieOperation,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const invalide = valider(saisie);
  if (invalide) return { ok: false, error: invalide };

  const cessionRefusee = await validerCession(fundId, saisie, null);
  if (cessionRefusee) return { ok: false, error: cessionRefusee };

  const { data, error } = await supabase
    .from("fund_market_operations")
    .insert({
      owner_id: userId,
      fund_id: fundId,
      date_operation: saisie.dateOperation,
      description: saisie.description as DescriptionOperation,
      instrument: saisie.instrument,
      validite: saisie.validite,
      code: saisie.code.trim(),
      libelle: saisie.libelle.trim(),
      quantite: saisie.quantite,
      prix: saisie.prix,
      sgi: saisie.sgi.trim(),
      taux_courtage: saisie.tauxCourtage,
      taux_tps: saisie.tauxTps,
      taux_brvm: saisie.tauxBrvm,
      taux_dcbr: saisie.tauxDcbr,
      interets_courus: saisie.interetsCourus,
      compte_reglement: saisie.compteReglement.trim(),
      modalite: saisie.modalite,
      note: saisie.note.trim(),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const id = (data as { id: string }).id;
  const erreurVolets = await enregistrerVolets(supabase, userId, id, saisie);
  if (erreurVolets) return { ok: false, error: erreurVolets };

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  revalidatePath("/gestion-portefeuille/operations-marche");
  revalidatePath("/gestion-portefeuille/tresorerie");
  return { ok: true, data: { id } };
}

/**
 * Modifie une operation deja saisie.
 *
 * Meme validation que la creation : une correction ne doit pas pouvoir
 * produire une ligne que la saisie initiale aurait refusee.
 */
export async function modifierOperationMarcheAction(
  fundId: string,
  operationId: string,
  saisie: SaisieOperation,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const invalide = valider(saisie);
  if (invalide) return { ok: false, error: invalide };

  // On s'exclut soi-même : un ordre de vente qu'on corrige ne doit pas compter
  // sa propre quantité parmi celles déjà engagées.
  const cessionRefusee = await validerCession(fundId, saisie, operationId);
  if (cessionRefusee) return { ok: false, error: cessionRefusee };

  const { error } = await supabase
    .from("fund_market_operations")
    .update({
      date_operation: saisie.dateOperation,
      description: saisie.description as DescriptionOperation,
      instrument: saisie.instrument,
      validite: saisie.validite,
      code: saisie.code.trim(),
      libelle: saisie.libelle.trim(),
      quantite: saisie.quantite,
      prix: saisie.prix,
      sgi: saisie.sgi.trim(),
      taux_courtage: saisie.tauxCourtage,
      taux_tps: saisie.tauxTps,
      taux_brvm: saisie.tauxBrvm,
      taux_dcbr: saisie.tauxDcbr,
      interets_courus: saisie.interetsCourus,
      compte_reglement: saisie.compteReglement.trim(),
      modalite: saisie.modalite,
      note: saisie.note.trim(),
    })
    .eq("id", operationId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);

  if (error) return { ok: false, error: error.message };

  const erreurVolets = await enregistrerVolets(supabase, userId, operationId, saisie);
  if (erreurVolets) return { ok: false, error: erreurVolets };

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  revalidatePath("/gestion-portefeuille/operations-marche");
  revalidatePath("/gestion-portefeuille/tresorerie");
  return { ok: true, data: { id: operationId } };
}

/**
 * Enregistre une EXECUTION : une part servie, a sa date.
 *
 * Le denouement est calcule depuis la date d'execution selon la convention du
 * marche, et non depuis la date de l'ordre : un ordre passe lundi et servi
 * jeudi se regle a partir de jeudi.
 */
export async function ajouterExecutionAction(
  fundId: string,
  operationId: string,
  saisie: {
    dateExecution: string;
    dateDenouement?: string;
    quantite: number;
    /** Prix REELLEMENT servi. Zero signifie « prix de l'ordre ». */
    prix?: number;
    note?: string;
  },
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  if (!EST_DATE.test(saisie.dateExecution))
    return { ok: false, error: "Renseigne la date d'exécution." };
  if (!(saisie.quantite > 0))
    return { ok: false, error: "La quantité exécutée doit être strictement positive." };

  // L'ordre, et ce qui en a deja ete servi. On relit plutot que de faire
  // confiance au client : deux onglets ouverts sur le meme ordre pourraient
  // sinon le sur-executer chacun de leur cote.
  const { data: ordre } = await supabase
    .from("fund_market_operations")
    .select("id, quantite, instrument")
    .eq("id", operationId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!ordre) return { ok: false, error: "Ordre introuvable." };

  const o = ordre as unknown as { quantite: number | string; instrument: string };
  const ordonnee = Number(o.quantite) || 0;

  const { data: deja } = await supabase
    .from("fund_market_executions")
    .select("quantite")
    .eq("operation_id", operationId);
  const servie = ((deja ?? []) as unknown as { quantite: number | string }[]).reduce(
    (s, x) => s + (Number(x.quantite) || 0),
    0,
  );

  if (servie + saisie.quantite > ordonnee) {
    return {
      ok: false,
      error:
        `Cet ordre porte sur ${ordonnee} titres, dont ${servie} déjà servis : ` +
        `il n'en reste que ${ordonnee - servie}.`,
    };
  }

  // Sur le marche des titres publics, une adjudication est servie ou ne l'est
  // pas : une execution partielle y serait une saisie erronee, pas un cas de
  // marche.
  if (o.instrument === "mtp" && saisie.quantite !== ordonnee) {
    return {
      ok: false,
      error: "Sur le marché des titres publics, un ordre est servi en totalité ou pas du tout.",
    };
  }

  const denouement =
    saisie.dateDenouement && EST_DATE.test(saisie.dateDenouement)
      ? saisie.dateDenouement
      : dateDenouement(
          saisie.dateExecution,
          conventionDe(await chargerParametresMarche(), o.instrument as Instrument),
        );

  const { data, error } = await supabase
    .from("fund_market_executions")
    .insert({
      owner_id: userId,
      operation_id: operationId,
      date_execution: saisie.dateExecution,
      date_denouement: denouement,
      quantite: saisie.quantite,
      prix: Number.isFinite(saisie.prix) && (saisie.prix ?? 0) > 0 ? saisie.prix : 0,
      note: (saisie.note ?? "").trim(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestion-portefeuille/operations-marche");
  revalidatePath("/gestion-portefeuille/tresorerie");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/**
 * Clot un ordre : sa part non servie cesse d'engager la tresorerie.
 *
 * Ce qui a ete servi RESTE — il a ete regle, ou le sera. La cloture ne
 * supprime rien, elle date un renoncement.
 *
 * Passer `null` rouvre l'ordre : une cloture par erreur se corrige, et
 * l'obliger a supprimer puis ressaisir aurait fait perdre les executions.
 */
export async function cloturerOrdreAction(
  fundId: string,
  operationId: string,
  dateCloture: string | null,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  if (dateCloture !== null && !EST_DATE.test(dateCloture))
    return { ok: false, error: "Renseigne la date de clôture." };

  const { error } = await supabase
    .from("fund_market_operations")
    .update({ cloture_le: dateCloture })
    .eq("id", operationId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestion-portefeuille/operations-marche");
  revalidatePath("/gestion-portefeuille/tresorerie");
  return { ok: true, data: { id: operationId } };
}

/**
 * REPREND un pret de titres : les titres sont revenus.
 *
 * La date ne se saisit pas dans le formulaire du pret — elle n'y aurait ete
 * qu'une promesse. Elle se pose au moment ou la reprise a lieu, d'un bouton
 * sur la ligne, et c'est elle qui fait basculer le statut : un pret est repris
 * parce qu'il a une date de reprise, jamais l'inverse.
 *
 * `null` annule la reprise et rouvre le pret, pour corriger une fausse
 * manoeuvre.
 */
export async function reprendrePretAction(
  fundId: string,
  operationId: string,
  dateReprise: string | null,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  if (dateReprise !== null && !EST_DATE.test(dateReprise))
    return { ok: false, error: "Renseigne la date de reprise." };

  // Le filtre sur l'operation ET sur le fonds : la table des prets ne porte
  // pas le fonds, on passe donc par l'ordre pour verifier qu'il est bien a ce
  // gerant avant d'ecrire.
  const { data: ordre } = await supabase
    .from("fund_market_operations")
    .select("id")
    .eq("id", operationId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!ordre) return { ok: false, error: "Opération introuvable." };

  const { error } = await supabase
    .from("fund_market_loans")
    .update({ date_reprise: dateReprise })
    .eq("operation_id", operationId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestion-portefeuille/operations-marche");
  return { ok: true, data: { id: operationId } };
}

/**
 * Rapproche une execution : le reglement a ete constate sur le releve.
 *
 * Elle sort alors des postes de flux, parce que le solde bancaire saisi la
 * contient DEJA — l'y laisser la compterait deux fois. C'est un lettrage, pas
 * une annulation : l'execution reste, avec sa date de rapprochement.
 *
 * `null` defait le lettrage.
 */
export async function rapprocherExecutionAction(
  fundId: string,
  executionId: string,
  dateRapprochement: string | null,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  if (dateRapprochement !== null && !EST_DATE.test(dateRapprochement))
    return { ok: false, error: "Renseigne la date de rapprochement." };

  const { error } = await supabase
    .from("fund_market_executions")
    .update({ rapproche_le: dateRapprochement })
    .eq("id", executionId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestion-portefeuille/operations-marche");
  revalidatePath("/gestion-portefeuille/tresorerie");
  return { ok: true, data: { id: executionId } };
}

export async function supprimerExecutionAction(
  fundId: string,
  executionId: string,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const { error } = await supabase
    .from("fund_market_executions")
    .delete()
    .eq("id", executionId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gestion-portefeuille/operations-marche");
  revalidatePath("/gestion-portefeuille/tresorerie");
  return { ok: true, data: { id: executionId } };
}

export async function supprimerOperationMarcheAction(
  fundId: string,
  operationId: string,
): Promise<ActionResult<{ id: string }>> {
  const acces = await autoriser(fundId);
  if ("erreur" in acces) return { ok: false, error: acces.erreur };
  const { supabase, userId } = acces;

  const { error } = await supabase
    .from("fund_market_operations")
    .delete()
    .eq("id", operationId)
    .eq("fund_id", fundId)
    .eq("owner_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/gestion-portefeuille/fonds/${fundId}`);
  return { ok: true, data: { id: operationId } };
}

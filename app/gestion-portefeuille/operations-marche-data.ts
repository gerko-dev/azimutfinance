import "server-only";

// === Opérations de marché : lecture et agrégation ===
//
// Le point de trésorerie distingue deux choses qu'un même ordre porte à la
// fois quand il est partiellement servi :
//
//   la part NON SERVIE  pèse comme ENGAGEMENT, tant que l'ordre est au carnet.
//                       Elle ne se dénoue pas : rien n'est encore à régler.
//   la part SERVIE      pèse comme RÈGLEMENT, à la date de dénouement de son
//                       exécution.
//
// C'est la règle du classeur, étendue à l'exécution partielle : il ne
// connaissait que des lignes entièrement validées ou entièrement réalisées.

import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  alimenteAchatsVentes,
  montantDenouementRemere,
  montantExecution,
  montantOperation,
  montantRestant,
  ordreRapproche,
  partRestantePese,
  interetPret,
  interetPretPese,
  posteEngageDe,
  posteRealise,
  posteRemereDenouement,
  quantiteRestante,
  remereOuvertA,
  sensRemereDe,
  statutPretDe,
  type DescriptionOperation,
  type Execution,
  type Instrument,
  type OperationMarche,
  type SaisiePret,
  type SaisieRemere,
  type Validite,
} from "./operations-marche-types";
import {
  ajouterApport,
  fmtPrix,
  fmtQte,
  type ApportsParPoste,
} from "./tresorerie-apports";
import {
  repartir,
  ventilationSimple,
  type VentilationCompte,
} from "./ventilation-reglement";

type LigneExecution = {
  id: string;
  operation_id: string;
  date_execution: string;
  date_denouement: string;
  quantite: number | string;
  prix: number | string;
  rapproche_le: string | null;
  note: string;
};

type Ligne = {
  id: string;
  date_operation: string;
  description: string;
  instrument: string;
  validite: string;
  code: string;
  libelle: string;
  quantite: number | string;
  prix: number | string;
  sgi: string;
  taux_courtage: number | string;
  taux_tps: number | string;
  taux_brvm: number | string;
  taux_dcbr: number | string;
  interets_courus: number | string;
  compte_reglement: string;
  cloture_le: string | null;
  rapproche_le: string | null;
  modalite: string | null;
  note: string;
};

// Supabase renvoie les `numeric` en CHAÎNE pour préserver leur précision : les
// convertir ici, une fois, évite d'avoir à s'en souvenir partout ailleurs.
const nb = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const COLS_OPERATION =
  "id, fund_id, date_operation, description, instrument, validite, code, libelle, " +
  "quantite, prix, sgi, taux_courtage, taux_tps, taux_brvm, taux_dcbr, " +
  "interets_courus, compte_reglement, cloture_le, rapproche_le, modalite, note";

const COLS_EXECUTION =
  "id, operation_id, date_execution, date_denouement, quantite, prix, rapproche_le, note";

function versExecution(l: LigneExecution): Execution {
  return {
    id: l.id,
    dateExecution: l.date_execution,
    dateDenouement: l.date_denouement,
    quantite: nb(l.quantite),
    prix: nb(l.prix),
    rapprocheLe: l.rapproche_le ?? null,
    note: l.note ?? "",
  };
}

type LigneRepo = {
  operation_id: string;
  date_fin: string;
  contrepartie: string;
  prix_sortie: number | string;
  denoue_par: string | null;
};

type LignePret = {
  operation_id: string;
  contrepartie: string;
  date_fin: string | null;
  taux_commission: number | string;
  date_reprise: string | null;
  /** Absente tant que `fund-prets-interet-rapproche.sql` n'a pas été joué. */
  interet_rapproche_le?: string | null;
};

/** Le prêt tel qu'il sort de la base : sa saisie, plus son lettrage. */
type PretCharge = SaisiePret & { interetRapprocheLe: string | null };

function versRemere(l: LigneRepo): SaisieRemere {
  return {
    dateFin: l.date_fin,
    contrepartie: l.contrepartie ?? "",
    prixSortie: nb(l.prix_sortie),
    denouePar: l.denoue_par ?? null,
  };
}

function versPret(l: LignePret): PretCharge {
  return {
    dateFin: l.date_fin ?? null,
    contrepartie: l.contrepartie ?? "",
    tauxCommission: nb(l.taux_commission),
    dateReprise: l.date_reprise ?? null,
    interetRapprocheLe: l.interet_rapproche_le ?? null,
  };
}

/**
 * DÉDUIT l'état des rémérés, une fois toutes les opérations chargées.
 *
 * Trois choses se déduisent, et aucune ne se saisit :
 *
 *  - le SENS, du sens de l'ordre (acheter à réméré décaisse, vendre encaisse) ;
 *  - le STATUT : dénoué dès que l'opération de dénouement a été EXÉCUTÉE.
 *    Saisie seulement, elle ne solde rien — rien n'a encore été réglé ;
 *  - la DATE de dénouement, qui est celle du règlement de cette exécution.
 *
 * Le lien n'est stocké qu'une fois, sur le réméré. Le sens inverse — « cette
 * opération dénoue tel réméré » — se reconstruit ici, ce qui interdit aux deux
 * bouts de se contredire.
 */
function resoudreRemeres(operations: OperationMarche[]): OperationMarche[] {
  const parId = new Map(operations.map((o) => [o.id, o]));
  const denoueDe = new Map<string, string>();
  for (const o of operations) {
    if (o.remere?.denouePar) denoueDe.set(o.remere.denouePar, o.id);
  }

  for (const o of operations) {
    o.denoueRemereDe = denoueDe.get(o.id) ?? null;
    if (!o.remere) continue;

    const cloture = o.remere.denouePar ? parId.get(o.remere.denouePar) : undefined;
    // La dernière exécution fait foi : un dénouement servi en plusieurs fois
    // n'est soldé qu'une fois la dernière part réglée.
    const dates = (cloture?.executions ?? []).map((e) => e.dateDenouement).sort();
    const derniere = dates.length > 0 ? dates[dates.length - 1] : null;

    o.remere = {
      ...o.remere,
      sens: sensRemereDe(o.description),
      statut: derniere ? "denoue" : "en_cours",
      dateDenouement: derniere,
      denouementEnAttente: cloture !== undefined && derniere === null,
    };
  }
  return operations;
}

function versOperation(
  l: Ligne,
  executions: Execution[],
  remere: SaisieRemere | null = null,
  pret: PretCharge | null = null,
  comptes: VentilationCompte[] = [],
): OperationMarche {
  const base = {
    description: l.description as DescriptionOperation,
    quantite: nb(l.quantite),
    prix: nb(l.prix),
    tauxCourtage: nb(l.taux_courtage),
    tauxTps: nb(l.taux_tps),
    tauxBrvm: nb(l.taux_brvm),
    tauxDcbr: nb(l.taux_dcbr),
    interetsCourus: nb(l.interets_courus),
  };
  return {
    id: l.id,
    dateOperation: l.date_operation,
    instrument: l.instrument as Instrument,
    validite: (l.validite === "revocation90" ? "revocation90" : "jour") as Validite,
    code: l.code ?? "",
    libelle: l.libelle ?? "",
    sgi: l.sgi ?? "",
    compteReglement: l.compte_reglement ?? "",
    // SANS VENTILATION ENREGISTREE, L'ORDRE EN A QUAND MEME UNE : celle d'un
    // seul compte. Les lecteurs n'ont ainsi qu'une forme à traiter, et les
    // ordres saisis avant cette fonctionnalité se lisent comme les autres.
    comptes:
      comptes.length > 0
        ? comptes
        : ventilationSimple(l.compte_reglement ?? "", montantOperation(base)),
    clotureLe: l.cloture_le ?? null,
    rapprocheLe: l.rapproche_le ?? null,
    modalite:
      l.modalite === "adjudication" || l.modalite === "syndication" ? l.modalite : null,
    note: l.note ?? "",
    executions,
    // Les champs déduits sont posés provisoirement : `resoudreRemeres` les
    // remplit quand toutes les opérations sont là — l'opération de dénouement
    // est ailleurs dans la même liste.
    remere: remere
      ? {
          ...remere,
          sens: sensRemereDe(l.description as DescriptionOperation),
          statut: "en_cours",
          dateDenouement: null,
          denouementEnAttente: false,
        }
      : null,
    // Statut et intérêt sont DÉDUITS : le premier de la reprise, le second du
    // taux et de la durée, base 360.
    pret: pret
      ? {
          ...pret,
          statut: statutPretDe(pret),
          interetARecevoir: interetPret(
            { dateOperation: l.date_operation, quantite: base.quantite, prix: base.prix },
            pret,
          ),
        }
      : null,
    denoueRemereDe: null,
    ...base,
    montant: montantOperation(base),
  };
}

/** Une opération, augmentée du fonds auquel elle appartient. */
export type OperationAvecFonds = OperationMarche & {
  fondsId: string;
  fondsNom: string;
};

/** Exécutions d'un lot d'ordres, groupées par ordre et triées par date. */
async function chargerExecutions(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  operationIds: string[],
): Promise<Map<string, Execution[]>> {
  const parOperation = new Map<string, Execution[]>();
  if (operationIds.length === 0) return parOperation;

  const { data } = await supabase
    .from("fund_market_executions")
    .select(COLS_EXECUTION)
    .in("operation_id", operationIds)
    .order("date_execution");

  for (const brut of (data ?? []) as unknown as LigneExecution[]) {
    const liste = parOperation.get(brut.operation_id) ?? [];
    liste.push(versExecution(brut));
    parOperation.set(brut.operation_id, liste);
  }
  return parOperation;
}

/** Volets réméré et prêt d'un lot d'ordres. Un ordre en a AU PLUS un. */
/**
 * Les ventilations de reglement de plusieurs ordres, par identifiant.
 *
 * UNE SEULE REQUETE POUR TOUT L'ECRAN, comme les volets. Une lecture qui
 * echoue laisse chaque ordre a son compte unique plutot que de faire tomber
 * la page : la ventilation est un raffinement, le compte principal reste porte
 * par la table mere.
 */
async function chargerVentilations(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  operationIds: string[],
): Promise<Map<string, VentilationCompte[]>> {
  const out = new Map<string, VentilationCompte[]>();
  if (operationIds.length === 0) return out;
  const { data, error } = await supabase
    .from("fund_market_operation_accounts")
    .select("operation_id, rang, compte, montant")
    .in("operation_id", operationIds)
    .order("rang", { ascending: true });
  if (error) {
    console.error("[operations] ventilations illisibles —", error.message);
    return out;
  }
  for (const l of (data ?? []) as unknown as {
    operation_id: string;
    compte: string;
    montant: number | string;
  }[]) {
    const liste = out.get(l.operation_id) ?? [];
    liste.push({ compte: l.compte, montant: nb(l.montant) });
    out.set(l.operation_id, liste);
  }
  return out;
}

async function chargerVolets(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  operationIds: string[],
): Promise<{ repos: Map<string, SaisieRemere>; prets: Map<string, PretCharge> }> {
  const repos = new Map<string, SaisieRemere>();
  const prets = new Map<string, PretCharge>();
  if (operationIds.length === 0) return { repos, prets };

  const COLONNES_PRET = "operation_id, contrepartie, date_fin, taux_commission, date_reprise";

  const [r, p] = await Promise.all([
    supabase
      .from("fund_market_repos")
      .select("operation_id, date_fin, contrepartie, prix_sortie, denoue_par")
      .in("operation_id", operationIds),
    supabase
      .from("fund_market_loans")
      .select(`${COLONNES_PRET}, interet_rapproche_le`)
      .in("operation_id", operationIds),
  ]);

  // LE LETTRAGE DE L'INTERET EST UNE COLONNE RECENTE, et une base ou la
  // migration n'a pas encore ete jouee rendrait ici une erreur — pas des
  // lignes sans la colonne. Tout le carnet disparaitrait alors de l'ecran,
  // ordres compris, pour un champ accessoire. On relit sans lui : les prets
  // s'affichent, leurs interets pesent, et seul le lettrage attend le script.
  let lignesPret: unknown = p.data;
  if (p.error) {
    const secours = await supabase
      .from("fund_market_loans")
      .select(COLONNES_PRET)
      .in("operation_id", operationIds);
    lignesPret = secours.data;
  }

  for (const l of (r.data ?? []) as unknown as LigneRepo[]) {
    repos.set(l.operation_id, versRemere(l));
  }
  for (const l of (lignesPret ?? []) as unknown as LignePret[]) {
    prets.set(l.operation_id, versPret(l));
  }
  return { repos, prets };
}

/**
 * Opérations d'un fonds, les plus récentes d'abord.
 *
 * Mémoïsé par requête : l'écran des opérations et le point de trésorerie les
 * lisent tous deux pendant le même rendu.
 */
export const loadOperationsMarche = cache(
  async (fundId: string): Promise<OperationMarche[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("fund_market_operations")
      .select(COLS_OPERATION)
      .eq("fund_id", fundId)
      .order("date_operation", { ascending: false })
      .order("created_at", { ascending: false });

    const lignes = (data ?? []) as unknown as Ligne[];
    const ids = lignes.map((l) => l.id);
    const [executions, volets, ventilations] = await Promise.all([
      chargerExecutions(supabase, ids),
      chargerVolets(supabase, ids),
      chargerVentilations(supabase, ids),
    ]);
    return resoudreRemeres(
      lignes.map((l) =>
        versOperation(
          l,
          executions.get(l.id) ?? [],
          volets.repos.get(l.id) ?? null,
          volets.prets.get(l.id) ?? null,
          ventilations.get(l.id) ?? [],
        ),
      ),
    );
  },
);

/**
 * Toutes les opérations du gérant, tous fonds confondus.
 *
 * L'écran de saisie est INTERFONDS : le gérant y passe ses opérations de la
 * journée, qui portent souvent sur plusieurs fonds à la fois — une même
 * adjudication se répartit entre les portefeuilles.
 *
 * La RLS restreint déjà la lecture aux fonds du gérant : pas de filtre à
 * ajouter ici, et surtout pas de liste d'identifiants à tenir à jour.
 */
export const loadToutesOperationsMarche = cache(
  async (): Promise<OperationAvecFonds[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("fund_market_operations")
      .select(`${COLS_OPERATION}, managed_funds(nom)`)
      .order("date_operation", { ascending: false })
      .order("created_at", { ascending: false });

    type LigneJointe = Ligne & {
      fund_id: string;
      managed_funds: { nom: string } | { nom: string }[] | null;
    };
    const lignes = (data ?? []) as unknown as LigneJointe[];
    const ids = lignes.map((l) => l.id);
    const [executions, volets, ventilations] = await Promise.all([
      chargerExecutions(supabase, ids),
      chargerVolets(supabase, ids),
      chargerVentilations(supabase, ids),
    ]);

    const avecFonds = lignes.map((l) => {
      // PostgREST renvoie la jointure tantôt en objet, tantôt en tableau selon
      // qu'il la juge unique : les deux formes se rencontrent, on les couvre.
      const f = Array.isArray(l.managed_funds) ? l.managed_funds[0] : l.managed_funds;
      return {
        ...versOperation(
          l,
          executions.get(l.id) ?? [],
          volets.repos.get(l.id) ?? null,
          volets.prets.get(l.id) ?? null,
          ventilations.get(l.id) ?? [],
        ),
        fondsId: l.fund_id,
        fondsNom: f?.nom ?? "—",
      };
    });
    return resoudreRemeres(avecFonds) as OperationAvecFonds[];
  },
);

/**
 * Montants par POSTE puis par COMPTE DE RÈGLEMENT, à une date d'arrêté.
 *
 * Deux contributions par ordre, et deux règles de date différentes :
 *
 *  - la part NON SERVIE pèse dès la date de l'ordre et jusqu'à sa péremption.
 *    Elle ne se dénoue pas : un ordre non exécuté n'a rien à régler, et lui
 *    inventer une date de règlement l'aurait fait entrer ou sortir du point
 *    pour de mauvaises raisons.
 *  - chaque EXÉCUTION pèse à la date de dénouement qui lui est propre. Un
 *    ordre servi en trois fois se règle en trois fois, à trois dates.
 */
export function agregerParPoste(
  operations: OperationMarche[],
  dateArrete: string | null,
): ApportsParPoste {
  const parPoste: ApportsParPoste = new Map();

  // CHAQUE MONTANT SE REPARTIT SUR LES COMPTES DE L'ORDRE.
  //
  // Un seul compte — le cas ordinaire — et c'est l'ancien comportement, au
  // caractère près. Plusieurs, et la part non servie comme chaque exécution se
  // répartissent au prorata : une soumission versée depuis deux dépositaires
  // grève deux colonnes du point, chacune de sa part, au lieu d'en charger une
  // d'un montant que son relevé ne porte pas.
  const ajouter = (
    poste: string | null,
    o: OperationMarche,
    montant: number,
    detail: { date: string; libelle: string; info: string },
  ) => {
    const parts = repartir(montant, o.comptes);
    if (parts.length === 0) {
      // Aucun compte : le montant doit RESSORTIR, pas disparaître. Il part
      // sous une clef vide, que le point remonte dans « montants sans
      // colonne ».
      ajouterApport(parPoste, poste, o.compteReglement, montant, detail);
      return;
    }
    const plusieurs = parts.length > 1;
    for (const part of parts) {
      ajouterApport(parPoste, poste, part.compte, part.montant, {
        ...detail,
        info: plusieurs
          ? [detail.info, `part de ${parts.length} comptes de règlement`]
              .filter(Boolean)
              .join(" · ")
          : detail.info,
      });
    }
  };

  /** Le titre tel qu'on le reconnaît sur une ligne d'ordre. */
  const titre = (o: OperationMarche) =>
    o.libelle || o.code || "Titre sans libellé";

  for (const o of operations) {
    // UN ORDRE À RÉMÉRÉ EST UN ORDRE COMME UN AUTRE, à un poste près.
    //
    // Validé et non encore servi, il pèse dans « ACHATS / VENTES A RÉMÉRÉ
    // VALIDES » — sa ligne propre au point, que le classeur distingue déjà des
    // achats ordinaires. Une fois exécuté, il rejoint les achats et ventes
    // réalisés : le cash a bougé comme pour n'importe quelle opération.
    //
    // Le DÉNOUEMENT, lui, n'a rien de particulier : c'est une opération MTP de
    // sens inverse, qui pèse et se règle comme telle.
    //
    // Un PRÊT DE TITRES n'alimente aucun poste : il ne déplace pas de cash au
    // moment où il se noue. C'est un registre, pas un flux — le classeur n'a
    // d'ailleurs pas de poste pour lui.
    if (!alimenteAchatsVentes(o)) continue;

    // RAPPROCHÉ AU NIVEAU DE L'ORDRE : le marché primaire se règle AVANT
    // l'attribution, si bien qu'il n'y a aucune exécution sur laquelle poser
    // le lettrage. Une fois l'ordre constaté sur le relevé, le solde bancaire
    // saisi le contient déjà — ni son engagement ni ce qui en sera servi n'ont
    // plus à peser. C'est un lettrage, pas une annulation.
    if (ordreRapproche(o, dateArrete)) continue;

    // ── La part servie, exécution par exécution ──────────────────────────
    //
    // Chaque exécution est valorisée à SON prix : un ordre à cours limité est
    // rarement servi au centime près à sa limite, et un ordre servi en
    // plusieurs fois l'est souvent à plusieurs prix. Reprendre le prix de
    // l'ordre faussait le montant réellement réglé.
    for (const e of o.executions) {
      if (dateArrete && e.dateDenouement > dateArrete) continue;
      // RAPPROCHÉE : le solde bancaire saisi la contient déjà. L'y laisser la
      // compterait une seconde fois — c'est un lettrage, pas une annulation.
      if (e.rapprocheLe && (!dateArrete || e.rapprocheLe <= dateArrete)) continue;
      ajouter(posteRealise(o.description), o, montantExecution(o, e), {
        // LA DATE DU DÉNOUEMENT, pas celle de l'exécution : c'est elle qui
        // décide si le montant compte à l'arrêté, donc elle qu'il faut
        // pouvoir confronter à la date du point.
        date: e.dateDenouement,
        libelle: titre(o),
        info: [
          `${fmtQte(e.quantite)} × ${fmtPrix(e.prix || o.prix)}`,
          o.sgi,
          `exécuté le ${e.dateExecution}`,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }

    // ── La part non servie, tant que l'ordre pèse ────────────────────────
    //
    // Trois façons de cesser de peser — servie, close, périmée — et une seule
    // fonction pour les dire, partagée avec l'écran : sinon le calcul et
    // l'affichage finissent par ne plus être d'accord sur ce qui compte.
    // Les ventes ont désormais leur poste d'engagement, elles aussi : une
    // vente passée et non servie est un encaissement annoncé.
    if (!partRestantePese(o, dateArrete)) continue;

    ajouter(posteEngageDe(o), o, montantRestant(o), {
      date: o.dateOperation,
      libelle: titre(o),
      info: [
        `${fmtQte(quantiteRestante(o))} / ${fmtQte(o.quantite)} non servi(s) × ${fmtPrix(o.prix)}`,
        o.sgi,
        o.validite ? `validité ${o.validite}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  // ── Le DÉNOUEMENT des rémérés encore ouverts ──────────────────────────
  //
  // Une boucle à part, et non un troisième ajout dans la précédente : les
  // rémérés prêtés — pardon, les ordres porteurs d'un PRÊT — sortent plus haut
  // par `alimenteAchatsVentes`, et un réméré doit être compté même lorsque
  // son ordre a été entièrement servi, c'est-à-dire là où la boucle précédente
  // a déjà rendu la main.
  //
  // CE FLUX EST L'INVERSE DE L'ORDRE D'ENTRÉE. Un achat à réméré se dénoue par
  // une vente : à la date de dénouement, le fonds ENCAISSE. Une vente à réméré
  // se dénoue par un rachat : il DÉCAISSE. Cf. `posteRemereDenouement`.
  //
  // Un réméré déjà soldé avant l'arrêté n'y figure plus : son dénouement est
  // alors une opération MTP ordinaire, déjà comptée comme telle plus haut, et
  // l'y laisser compterait le même flux deux fois.
  //
  // LA DATE QUI COMPTE EST CELLE DU DÉNOUEMENT, comme pour une exécution : le
  // terme du réméré doit tomber dans l'horizon de l'arrêté. Un réméré qui se
  // dénoue le mois prochain n'a rien à faire dans un point arrêté aujourd'hui
  // — le trésorier demande de quoi il disposera À TELLE DATE, et ce cash-là
  // n'aura pas encore bougé.
  for (const o of operations) {
    if (!remereOuvertA(o, dateArrete)) continue;
    const terme = o.remere?.dateFin ?? "";
    if (dateArrete && (!terme || terme > dateArrete)) continue;
    ajouter(
      posteRemereDenouement(o.description),
      o,
      montantDenouementRemere(o, dateArrete),
      {
        date: terme,
        libelle: titre(o),
        info: [
          "dénouement de réméré",
          o.remere?.contrepartie ? `avec ${o.remere.contrepartie}` : "",
          o.remere?.prixSortie ? `rachat à ${fmtPrix(o.remere.prixSortie)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      },
    );
  }

  // ── L'INTÉRÊT DES PRÊTS DE TITRES ─────────────────────────────────────
  //
  // PRÊTER NE DÉPLACE PAS DE CASH, MAIS RAPPORTE. Le prêt lui-même n'alimente
  // aucun poste — c'est un registre, et le classeur n'en a pas —, mais au
  // terme la contrepartie paie la commission, et cet argent-là rentre.
  //
  // IL SE LOGE DANS LES AUTRES FLUX ENTRANTS, parmi les flux théoriques.
  // C'est leur définition qui le veut : certain dans son principe, pas encore
  // encaissé, donc il ne pèse que sur le solde théorique — comme les coupons
  // et les tombées de titres, qui sont dans le même cas.
  //
  // Le montant est celui du registre, calculé par `interetPret` : même
  // fonction, mêmes jours, même base 360. En réécrire une seconde version ici
  // aurait garanti que les deux divergent.
  for (const o of operations) {
    const p = o.pret;
    if (!p) continue;
    if (!interetPretPese(p, dateArrete)) continue;
    const interet = interetPret(o, p);
    if (interet <= 0) continue;
    const echeance = p.dateReprise ?? p.dateFin ?? "";
    ajouter("AUTRES_FLUX_ENTRANT", o, interet, {
      date: echeance,
      libelle: titre(o),
      info: [
        "intérêt de prêt de titres",
        p.contrepartie ? `de ${p.contrepartie}` : "",
        `${(p.tauxCommission * 100).toLocaleString("fr-FR", { maximumFractionDigits: 4 })} %`,
        p.dateReprise ? `repris le ${p.dateReprise}` : "au terme prévu",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return parPoste;
}

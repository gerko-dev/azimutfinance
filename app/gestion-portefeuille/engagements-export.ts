import "server-only";

// === Export des engagements, au format de la feuille « Autres opérations » ===
//
// LE CLASSEUR RESTE LE MAÎTRE. Ce module ne cherche pas à le remplacer : il
// produit exactement les lignes que le gérant retape aujourd'hui à la main,
// dans SON vocabulaire et dans SON ordre de colonnes, pour qu'un copier-coller
// suffise.
//
// D'où trois contraintes qui commandent tout ce fichier :
//
//   LE VOCABULAIRE N'EST PAS LE NÔTRE. La feuille attend AUTRES_ENGAGEMENTS,
//   CASH_A_RECEVOIR, FLUX_THEORIQUES — relevés dans ses propres listes de
//   validation, pas inventés. Nos quatre postes s'y traduisent un pour un.
//
//   LES LIBELLÉS NON PLUS. Le classeur nomme ses banques « BOA CI », « UBA BN »,
//   « NSIA BANQUE SN » ; le site les nomme « BOA - Côte d'Ivoire · Côte
//   d'Ivoire ». Coller un libellé étranger casserait les tableaux croisés qui
//   s'appuient dessus. On traduit donc, et l'on DIT ce qu'on a traduit.
//
//   UN NIVELLEMENT FAIT DEUX LIGNES. Le compte qui envoie est engagé, celui qui
//   reçoit attend du cash : c'est ainsi que la feuille les porte, et c'est la
//   seule écriture qui rende l'argent visible pendant son transit.

import { loadCustomSecurities } from "./portfolio-data";
import { etablissementDuCompte } from "./tresorerie-comptes";
import { fraisGestionDuMois, libelleMois, moisDesFrais } from "./frais-gestion";
import { loadFluxManuels, loadNivellements } from "./tresorerie-flux-data";
import { loadNavMois } from "./nav-data";
import { loadStocks } from "@/lib/dataLoader";

import { normName } from "./portfolio-match";
import { chargerParametresMarche } from "./parametres-marche-data";
import { loadToutesOperationsMarche } from "./operations-marche-data";
import {
  dateDenouement,
  marcheDe,
  montantExecution,
  montantRestant,
  partRestantePese,
  posteEngageDe,
  posteRealise,
  quantiteRestante,
  sensDe,
  type Instrument,
} from "./operations-marche-types";
import type { PosteFlux } from "./tresorerie-flux-types";
import type { FundRecord } from "./types";

/** Une ligne du tableau, dans l'ordre des colonnes de la feuille. */
export type LigneEngagement = {
  fonds: string;
  date: string;
  typeOperation: string;
  description: string;
  detail: string;
  montant: number;
  banque: string;
  datePrevue: string;
  statut: string;
  dateEffective: string;
};

/** Ce qu'on a retenu comme nom de banque, et d'où ça vient. */
export type Correspondance = {
  etablissement: string;
  libelle: string;
  origine: "déclarée" | "déduite";
};

/**
 * Statut du virement, dans le vocabulaire du classeur.
 *
 * SA LISTE DE VALIDATION N'ADMET QUE QUATRE VALEURS — « OK », « NON OK »,
 * « EN COURS », « ANNULÉ ». Elle est portée par la feuille elle-même, et un
 * « NOK » y serait refusé à la première correction manuelle.
 *
 * Le site n'en connaît que deux : ce qu'il a vu passer sur un relevé, et le
 * reste. Il n'a pas d'état « annulé » — on y supprime une ligne, on ne la
 * barre pas — ni d'« en cours », qui est un jugement.
 */
const statutVirement = (rapproche: string | null): string =>
  rapproche ? "OK" : "NON OK";

export type ExportEngagements = {
  lignes: LigneEngagement[];
  operations: LigneOperation[];
  correspondances: Correspondance[];
  /** Périmètre et date, pour l'en-tête du fichier. */
  perimetre: string;
  dateArrete: string;
};

/**
 * Traduction de nos quatre postes vers le couple (type, description) du
 * classeur.
 *
 * Les valeurs de droite sont RELEVÉES dans la feuille « Étiquettes de
 * données », colonne par colonne : ce sont celles que ses listes de validation
 * acceptent. Une seule lettre de travers et la ligne collée sort des tableaux
 * croisés sans prévenir.
 */
const TRADUCTION: Record<PosteFlux, { type: string; description: string }> = {
  AUTRES: { type: "AUTRES_ENGAGEMENTS", description: "AUTRES_ENGAGEMENTS" },
  AUTRES_CASH_A_RECEVOIR: {
    type: "CASH_A_RECEVOIR",
    description: "AUTRES_CASH_A_RECEVOIR",
  },
  AUTRES_FLUX_SORTANT: { type: "FLUX_THEORIQUES", description: "AUTRES_FLUX_SORTANT" },
  AUTRES_FLUX_ENTRANT: { type: "FLUX_THEORIQUES", description: "AUTRES_FLUX_ENTRANT" },
};

/** Codes pays du classeur. Le Bénin y est BN, et non BJ. */
const CODE_PAYS: Record<string, string> = {
  "Côte d'Ivoire": "CI",
  "Côte d’Ivoire": "CI",
  Bénin: "BN",
  Benin: "BN",
  Sénégal: "SN",
  Senegal: "SN",
  Togo: "TG",
  Mali: "ML",
  "Burkina Faso": "BF",
  Burkina: "BF",
  Niger: "NE",
  "Guinée-Bissau": "GW",
  "Guinée Bissau": "GW",
  Gabon: "GB",
};

/**
 * Nom de banque tel que le classeur l'écrit, déduit de la fiche.
 *
 * Le classeur nomme court et suffixe le pays : « BOA CI », « ORABANK SN »,
 * « AFG BANK ML ». Le référentiel, lui, nomme long — « Orabank (succ.
 * Sénégal) », « AFG Bank Mali », « BOA - Côte d'Ivoire ». Trois coupes
 * suffisent à passer de l'un à l'autre : ce qui suit un tiret ou une
 * parenthèse, le nom de pays en queue, et le mot « International » que le
 * classeur omet.
 *
 * LA DÉDUCTION N'EST PAS UNE CERTITUDE, et c'est pourquoi elle se déclare :
 * l'export liste chaque correspondance retenue sur une seconde feuille, et le
 * champ « Libellé classeur » de la fiche permet de figer les cas rebelles.
 * Deviner en silence dans un fichier qu'on va coller serait le pire des deux
 * mondes.
 *
 * EXPOSÉE VOLONTAIREMENT, bien qu'appelée d'un seul endroit : c'est la seule
 * règle de ce module qui puisse se tromper, et une fonction nommée se rejoue
 * contre la liste réelle du classeur. Sur les seize banques qu'il connaît,
 * treize sortent exactes ; les trois autres — BNDE, que le classeur n'affuble
 * d'aucun pays, AFG BANK GABON dont la fiche porte « Autre » faute de Gabon
 * dans la liste des pays UEMOA, et PAPS qui s'y écrit PAPSS — se figent par le
 * champ « Libellé classeur ».
 */
export function deduireLibelle(banque: string, pays: string): string {
  let nom = banque.trim();
  const coupe = nom.search(/\s[-–(]/);
  if (coupe > 0) nom = nom.slice(0, coupe);
  nom = nom.replace(/\s+International\b/i, "");
  // Un nom de pays en queue : « AFG Bank Mali » → « AFG Bank ».
  for (const p of Object.keys(CODE_PAYS)) {
    if (nom.length > p.length && nom.toLowerCase().endsWith(` ${p.toLowerCase()}`)) {
      nom = nom.slice(0, -(p.length + 1));
      break;
    }
  }
  const code = CODE_PAYS[pays.trim()] ?? "";
  return `${nom.trim().toUpperCase()}${code ? ` ${code}` : ""}`.trim();
}

/** Le nom du fonds tel que le classeur l'écrit : « FCP » puis le nom. */
const nomClasseur = (f: { nom: string; type?: string | null }): string => {
  const nom = f.nom.trim();
  const type = (f.type ?? "").trim().toUpperCase();
  if (!type || nom.toUpperCase().startsWith(type)) return nom;
  return `${type} ${nom}`;
};

type Banques = {
  libelle: (cle: string) => string;
  correspondances: Correspondance[];
};

/**
 * Table des banques du fonds, construite une fois depuis ses fiches de compte.
 *
 * On repasse par `etablissementDuCompte` plutôt que de lire les attributs à la
 * main : c'est lui qui fabrique la clef d'établissement que portent les flux
 * et les nivellements, et deux façons de la calculer auraient fini par ne plus
 * se rejoindre.
 */
async function banquesDuFonds(fundId: string): Promise<Banques> {
  const fiches = await loadCustomSecurities();
  const parCle = new Map<string, Correspondance>();

  for (const c of fiches) {
    if (c.kind !== "tresorerie") continue;
    const proprietaire = (c.attributes?.fundId ?? "").trim();
    if (proprietaire && proprietaire !== fundId) continue;
    const etab = etablissementDuCompte(c);
    if (!etab) continue;
    const declare = (c.attributes?.libelleClasseur ?? "").trim();
    const deja = parCle.get(etab.cle);
    // Une déclaration l'emporte toujours sur une déduction, et sur une
    // déclaration antérieure : deux comptes du même établissement peuvent
    // porter la même, une seule suffit.
    if (deja && (deja.origine === "déclarée" || !declare)) continue;
    parCle.set(etab.cle, {
      etablissement: etab.cle,
      libelle: declare || deduireLibelle(etab.nom, etab.pays),
      origine: declare ? "déclarée" : "déduite",
    });
  }

  return {
    // Une clef inconnue ressort telle quelle : mieux vaut un libellé visible à
    // corriger qu'une cellule vide qu'on ne remarque pas.
    libelle: (cle) => parCle.get(cle)?.libelle ?? cle,
    correspondances: [...parCle.values()].sort((a, b) =>
      a.libelle.localeCompare(b.libelle, "fr"),
    ),
  };
}

/**
 * Les engagements d'un fonds, prêts à coller.
 *
 * TROIS GISEMENTS, ET TROIS SEULEMENT : les flux saisis, les nivellements et
 * les frais de gestion. Ce sont ceux dont le site connaît à la fois le
 * montant, la date et la banque — les trois colonnes qui font une ligne
 * collable. Les rachats vivent dans le module des parts, qui n'est pas encore
 * branché ; les y prendre produirait des lignes à moitié vides.
 */
async function engagementsDuFonds(
  fonds: FundRecord,
  dateArrete: string,
): Promise<{
  lignes: LigneEngagement[];
  correspondances: Correspondance[];
  banques: Banques;
}> {
  const [flux, nivellements, banques] = await Promise.all([
    loadFluxManuels(fonds.id),
    loadNivellements(fonds.id),
    banquesDuFonds(fonds.id),
  ]);

  const nom = nomClasseur(fonds);
  const lignes: LigneEngagement[] = [];

  for (const f of flux) {
    const t = TRADUCTION[f.poste];
    lignes.push({
      fonds: nom,
      date: f.dateFlux,
      typeOperation: t.type,
      description: t.description,
      detail: f.libelle,
      montant: f.montant,
      banque: banques.libelle(f.compte),
      datePrevue: f.dateFlux,
      // UN FLUX SAISI NE SE RAPPROCHE PAS : le site n'a aucun moyen de savoir
      // si le virement est parti. Le dire « OK » aurait fait passer une
      // intention pour un fait, sur toute une colonne.
      statut: statutVirement(null),
      dateEffective: "",
    });
  }

  for (const n of nivellements) {
    const source = banques.libelle(n.compteSource);
    const destination = banques.libelle(n.compteDestination);
    const detail = n.libelle.trim() || `NIVELLEMENT ${source} VERS ${destination}`;
    lignes.push({
      fonds: nom,
      date: n.dateNivellement,
      typeOperation: "AUTRES_ENGAGEMENTS",
      description: "AUTRES_ENGAGEMENTS",
      detail,
      montant: n.montant,
      banque: source,
      datePrevue: n.dateNivellement,
      statut: statutVirement(n.rapprocheDebit),
      dateEffective: n.rapprocheDebit ?? "",
    });
    lignes.push({
      fonds: nom,
      date: n.dateNivellement,
      typeOperation: "CASH_A_RECEVOIR",
      description: "AUTRES_CASH_A_RECEVOIR",
      detail,
      montant: n.montant,
      banque: destination,
      datePrevue: n.dateNivellement,
      statut: statutVirement(n.rapprocheCredit),
      dateEffective: n.rapprocheCredit ?? "",
    });
  }

  // ── Frais de gestion ──────────────────────────────────────────────────
  //
  // LE SITE CALCULE LE MONTANT, PAS LA DATE DU PRÉLÈVEMENT. Celle-ci relève
  // d'une décision, pas d'un calcul : le gérant engage les frais quand il
  // l'entend, en général dans la quinzaine qui suit le mois. On porte donc la
  // date d'arrêté, qui est celle où il regarde son point — c'est la seule
  // cellule de cet export qu'il aura peut-être à retoucher, et elle est dite
  // comme telle sur la feuille des correspondances.
  const compteFrais = (fonds.compteFraisGestion ?? "").trim();
  const taux = Number(fonds.fraisGestion ?? "") || 0;
  if (compteFrais && taux > 0) {
    const mois = moisDesFrais(dateArrete);
    // Mêmes arguments que le point de trésorerie, et dans le même ordre : deux
    // façons d'appeler le calcul finiraient par donner deux montants.
    const frais = fraisGestionDuMois(await loadNavMois(fonds.id, mois), taux, dateArrete);
    if (frais.montant > 0) {
      lignes.push({
        fonds: nom,
        date: dateArrete,
        typeOperation: "AUTRES_ENGAGEMENTS",
        description: "FRAIS_DE_GESTION",
        detail: `FRAIS DE GESTION DU MOIS DE ${libelleMois(mois).toUpperCase()}`,
        montant: Math.round(frais.montant),
        banque: banques.libelle(compteFrais),
        datePrevue: dateArrete,
        statut: statutVirement(null),
        dateEffective: "",
      });
    }
  }

  return { lignes, correspondances: banques.correspondances, banques };
}

/** L'export, pour un fonds ou pour tous. */
export async function construireExportEngagements(
  fonds: FundRecord[],
  dateArrete: string,
): Promise<ExportEngagements> {
  const parts = await Promise.all(fonds.map((f) => engagementsDuFonds(f, dateArrete)));

  const correspondances = new Map<string, Correspondance>();
  for (const p of parts) {
    for (const c of p.correspondances) {
      const deja = correspondances.get(c.etablissement);
      if (!deja || (deja.origine === "déduite" && c.origine === "déclarée")) {
        correspondances.set(c.etablissement, c);
      }
    }
  }

  // Les tables de banques, une par fonds : un même établissement peut porter
  // un libellé déclaré chez l'un et déduit chez l'autre.
  const tables = new Map(fonds.map((f, i) => [f.id, parts[i].banques]));
  const nomsParId = new Map(fonds.map((f) => [f.id, nomClasseur(f)]));
  const { marche, primaire } = await operationsDeMarche(
    nomsParId,
    dateArrete,
    (fondsId, cle) => tables.get(fondsId)?.libelle(cle) ?? cle,
  );

  const lignes = [...parts.flatMap((p) => p.lignes), ...primaire]
    // Par DATE puis par fonds : c'est l'ordre du tableau, qui se remplit au
    // fil de l'eau. Coller un bloc trié autrement obligerait à retrier.
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.fonds.localeCompare(b.fonds, "fr") ||
        a.typeOperation.localeCompare(b.typeOperation),
    );

  return {
    lignes,
    operations: marche,
    correspondances: [...correspondances.values()].sort((a, b) =>
      a.libelle.localeCompare(b.libelle, "fr"),
    ),
    perimetre: fonds.length === 1 ? nomClasseur(fonds[0]) : `${fonds.length} fonds`,
    dateArrete,
  };
}

// ==========================================================================
// FEUILLE « OPÉRATIONS DE MARCHÉ »
// ==========================================================================
//
// Même principe, autre tableau : vingt colonnes au lieu de dix, et deux lignes
// possibles par ordre — l'ENGAGÉ tant qu'il n'est pas servi, le RÉALISÉ pour
// chaque part qui l'a été. C'est exactement la distinction que porte déjà le
// point de trésorerie, et les libellés du classeur sont les mêmes que les
// siens, aux traits de soulignement près.

/** Une ligne du tableau des opérations de marché, colonnes B à S. */
export type LigneOperation = {
  fonds: string;
  date: string;
  typeOperation: string;
  description: string;
  instrument: string;
  code: string;
  titre: string;
  quantite: number;
  prix: number;
  sgi: string;
  tauxCourtage: number;
  tauxTps: number;
  /** Les deux commissions de place, additionnées : le classeur n'en a qu'une
   *  colonne, et les y séparer ne change aucun montant. */
  tauxPlace: number;
  interetsCourus: number;
  montant: number;
  banque: string;
  statut: string;
  dateDenouement: string;
};

/**
 * Nos postes portent les mêmes mots que le classeur, à l'espace près : le
 * point de trésorerie dit « ACHATS MFR VALIDES » là où la feuille écrit
 * « ACHATS_MFR_VALIDES ». Une substitution suffit donc, et elle vaut mieux
 * qu'une seconde table de correspondance à tenir à jour en double.
 */
const enCleClasseur = (poste: string): string => poste.trim().replace(/\s+/g, "_");

/** Familles de la colonne « Type d'opération », dans l'orthographe du
 *  classeur — où les ventes validées prennent un E. */
const familleOperation = (sens: "achat" | "vente", servi: boolean): string =>
  sens === "achat"
    ? servi
      ? "ACHATS_REALISES"
      : "ACHATS_VALIDES"
    : servi
      ? "VENTES_REALISEES"
      : "VENTES_VALIDEES";

/**
 * Le classeur ne connaît pas la VENTE à réméré.
 *
 * Sa liste d'engagements n'a que la forme ACHAT — ACHATS_A_RÉMÉRÉ_VALIDES —
 * alors que le site modélise les deux sens. Le gérant range donc la vente en
 * VENTES_MTP_REALISEES, qui est bien ce qu'elle devient économiquement : une
 * cession de gré à gré qui fait entrer du cash.
 *
 * RÉSERVE ASSUMÉE : la ligne n'est pas encore servie quand elle sort sous ce
 * libellé. Elle comptera donc dans les ventes RÉALISÉES du classeur avant de
 * l'être, et l'écart se résorbera à l'exécution — qui produira, elle, la même
 * ligne. C'est le choix du gérant, pris en connaissance de cause ; le site,
 * lui, continue de la porter comme un engagement dans son propre point.
 */
const POSTE_REMPLACE: Record<string, { type: string; description: string }> = {
  VENTES_A_RÉMÉRÉ_VALIDES: {
    type: "VENTES_REALISEES",
    description: "VENTES_MTP_REALISEES",
  },
};

/** Libellés d'instrument de la feuille « Étiquettes de données ». */
const INSTRUMENT_CLASSEUR: Record<Instrument, string> = {
  actions: "Actions",
  obligations: "Obligations_et_autres_titres_de_créances",
  mtp: "Instruments_du_marché_monétaire",
};

/**
 * Le SYMBOLE d'une action, depuis ce que l'ordre en porte.
 *
 * LA COLONNE S'APPELLE « CODE ISIN », MAIS POUR UNE ACTION LE CLASSEUR Y MET
 * LE SYMBOLE : sa liste de validation y égrène ABJC, BICB, BOAC, SNTS. Le
 * site, lui, enregistre l'ISIN sur l'ordre — CI0000005864 pour ORANGE CI. Les
 * deux se valent pour désigner le titre, mais un seul passe la validation de
 * la feuille, et c'est le symbole.
 *
 * Trois clefs d'affilée, de la plus sûre à la plus large : l'ISIN, le symbole
 * lui-même — un ordre ancien peut déjà le porter — puis le NOM. Le nom sert
 * les cas où le code manque : un ordre de notre base porte « 0 » en code et
 * « BANQUE INTERNATIONALE POUR L'INDUSTRIE ET LE COMMERCE DU BENIN » en
 * libellé, et sans cette troisième passe il sortirait sous un zéro.
 *
 * Faute de tout, on rend ce qu'on avait : une cellule visiblement à corriger
 * vaut mieux qu'une cellule vide.
 */
function symboleAction(): (code: string, libelle: string) => string {
  const parIsin = new Map<string, string>();
  const parSymbole = new Map<string, string>();
  const parNom = new Map<string, string>();
  for (const s of loadStocks()) {
    const symbole = (s.code ?? "").trim().toUpperCase();
    if (!symbole) continue;
    parSymbole.set(symbole, symbole);
    const isin = (s.isin ?? "").trim().toUpperCase();
    if (isin) parIsin.set(isin, symbole);
    const nom = normName(s.name ?? "");
    if (nom && !parNom.has(nom)) parNom.set(nom, symbole);
  }
  return (code, libelle) => {
    const c = (code ?? "").trim().toUpperCase();
    return (
      parIsin.get(c) ??
      parSymbole.get(c) ??
      parNom.get(normName(libelle ?? "")) ??
      code
    );
  };
}

/**
 * Les opérations de marché d'un ensemble de fonds, prêtes à coller.
 *
 * DEUX LIGNES PAR ORDRE, AU PLUS. La part SERVIE donne une ligne par exécution
 * — c'est elle qui porte le prix réellement obtenu, la date de dénouement et
 * le rapprochement. La part NON SERVIE en donne une seule, au cours ordonné,
 * et seulement tant qu'elle pèse encore : un ordre périmé ou clôturé n'engage
 * plus rien, et le faire figurer gonflerait des engagements qui n'existent
 * pas.
 *
 * UNE SOUSCRIPTION AU PRIMAIRE NON SERVIE N'EST PAS ICI. Le classeur la porte
 * dans l'autre feuille, sous « AUTRES_ENGAGEMENTS / OPERATIONS_MARCHÉ_PRIMAIRE »
 * — parce qu'au primaire on règle AVANT d'être servi, et que l'engagement est
 * donc un décaissement, pas un ordre en carnet. Servie, elle revient ici comme
 * un achat de titres publics.
 */
async function operationsDeMarche(
  fondsParId: Map<string, string>,
  dateArrete: string,
  banques: (fondsId: string, cle: string) => string,
): Promise<{ marche: LigneOperation[]; primaire: LigneEngagement[] }> {
  const [ordres, parametres] = await Promise.all([
    loadToutesOperationsMarche(),
    chargerParametresMarche(),
  ]);

  const marche: LigneOperation[] = [];
  const primaire: LigneEngagement[] = [];
  const symbole = symboleAction();

  for (const o of ordres) {
    const nom = fondsParId.get(o.fondsId);
    if (!nom) continue;
    const sens = sensDe(o.description);
    const banque = banques(o.fondsId, o.compteReglement);
    const socle = {
      fonds: nom,
      instrument: INSTRUMENT_CLASSEUR[o.instrument] ?? o.instrument,
      // Le symbole pour une action, l'ISIN ou le mnémonique pour le reste :
      // c'est ainsi que la feuille désigne chaque famille de titre.
      code: o.instrument === "actions" ? symbole(o.code, o.libelle) : o.code,
      titre: o.libelle,
      sgi: o.sgi,
      tauxCourtage: o.tauxCourtage,
      tauxTps: o.tauxTps,
      tauxPlace: o.tauxBrvm + o.tauxDcbr,
      banque,
    };

    for (const e of o.executions) {
      // Les courus sont portés par l'ORDRE pour sa totalité : on en prend la
      // part servie, sans quoi un ordre servi en trois fois les compterait
      // trois fois.
      const courus =
        o.quantite > 0 ? (o.interetsCourus * e.quantite) / o.quantite : 0;
      marche.push({
        ...socle,
        date: e.dateExecution,
        typeOperation: familleOperation(sens, true),
        description: enCleClasseur(posteRealise(o.description)),
        quantite: e.quantite,
        prix: e.prix > 0 ? e.prix : o.prix,
        interetsCourus: Math.round(courus),
        montant: Math.round(montantExecution(o, e)),
        statut: statutVirement(e.rapprocheLe),
        dateDenouement: e.dateDenouement,
      });
    }

    if (!partRestantePese(o, dateArrete)) continue;
    const reste = quantiteRestante(o);
    const courusRestants =
      o.quantite > 0 ? (o.interetsCourus * reste) / o.quantite : 0;
    const brut = enCleClasseur(posteEngageDe(o));
    const remplace = POSTE_REMPLACE[brut];
    const poste = remplace?.description ?? brut;

    if (marcheDe(o.description) === "primaire") {
      primaire.push({
        fonds: nom,
        date: o.dateOperation,
        typeOperation: "AUTRES_ENGAGEMENTS",
        description: poste,
        detail: o.libelle || o.code,
        montant: Math.round(montantRestant(o)),
        banque,
        datePrevue: o.dateOperation,
        statut: statutVirement(o.rapprocheLe),
        dateEffective: o.rapprocheLe ?? "",
      });
      continue;
    }

    marche.push({
      ...socle,
      date: o.dateOperation,
      typeOperation: remplace?.type ?? familleOperation(sens, false),
      description: poste,
      quantite: reste,
      prix: o.prix,
      interetsCourus: Math.round(courusRestants),
      montant: Math.round(montantRestant(o)),
      // RIEN N'EST RÉGLÉ TANT QUE RIEN N'EST SERVI : la question du virement
      // ne se pose pas encore, et « NON OK » le dit sans rien affirmer.
      statut: statutVirement(null),
      // La convention du gérant, la même qu'à la saisie d'une exécution : le
      // dénouement d'un ordre non servi ne se connaît pas, il se calcule.
      dateDenouement: dateDenouement(
        o.dateOperation,
        marcheDe(o.description) === "mfr" ? parametres.mfr : parametres.mtp,
      ),
    });
  }

  marche.sort(
    (a, b) => a.date.localeCompare(b.date) || a.fonds.localeCompare(b.fonds, "fr"),
  );
  return { marche, primaire };
}

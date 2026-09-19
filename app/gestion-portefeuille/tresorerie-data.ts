import "server-only";

// === Point de trésorerie — construction depuis les données du site ===
//
// Aucun classeur à déposer : le tableau se bâtit sur l'inventaire du fonds.
// Ce qui est connu est calculé, ce qui ne l'est pas sort à ZÉRO et se dit tel
// quel (`source: "a_alimenter"`). Un tableau qui affiche zéro sans prévenir
// qu'il ne sait pas encore compter est pire qu'un tableau vide : on le croit.
//
// Ce que le site sait produire aujourd'hui :
//   SOLDE                → lignes de section « tresorerie » du dernier inventaire
//   les huit sous-totaux → formules du classeur, reprises à l'identique
//   les deux ratios      → rapportés à l'actif net de l'inventaire
//
// Tout le reste — achats et ventes validés ou réalisés, rachats, frais,
// rémérés, souscriptions bureau, flux probables, dividendes — attend sa source.

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { loadCustomSecurities, loadFundPortfolios } from "./portfolio-data";
import {
  etablissementDuCompte,
  groupeEtablissement,
  indexerParNom,
  libelleSens,
  ordonnerEtablissements,
  type Etablissement,
} from "./tresorerie-comptes";
import { normName } from "./portfolio-match";
import {
  LIGNES_POINT_TRESORERIE,
  type LigneTresorerie,
  type PointTresorerie,
} from "./tresorerie-types";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);



/**
 * Point de trésorerie d'un fonds, construit sur son dernier inventaire.
 *
 * Renvoie null quand le fonds n'a aucun inventaire : il n'y a alors pas de
 * soldes bancaires, et un tableau entierement a zero ne dirait rien.
 */
export async function construirePointTresorerie(
  fundId: string,
  nomFonds: string,
): Promise<PointTresorerie | null> {
  // L'inventaire de FIN fait foi.
  //
  // Prendre « le plus recent par date » paraissait equivalent, et ne l'est pas :
  // les trois inventaires — debut, intermediaire, fin — ne sont pas forcement
  // saisis dans l'ordre de leurs dates d'arrete, et le plus recemment date peut
  // etre l'intermediaire. On affichait alors des comptes absents de l'arrete de
  // fin, dont un DEPOSIT_OPCVM001 a -220 180 967 F que le gerant ne retrouvait
  // nulle part. Le slot est explicite : on s'y tient, et on ne retombe sur le
  // plus recent que si aucun arrete de fin n'existe encore.
  const snapshots = await loadFundPortfolios(fundId);
  const actuel =
    snapshots.find((s) => s.slot === "fin") ??
    [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).pop() ??
    null;
  if (!actuel) return null;

  // ── Colonnes : un ETABLISSEMENT par colonne ───────────────────────────────
  //
  // L'inventaire liste des COMPTES — encaissement, decaissement, compte OPCVM
  // d'un meme etablissement — la ou le point de tresorerie raisonne par
  // ETABLISSEMENT. Le rattachement ne se devine pas : il est deja declare au
  // referentiel (canal, pays, banque, nature du compte), et c'est de la qu'on
  // le lit. Un compte dont la fiche est incomplete remonte a part : la
  // correction se fait au referentiel, pas dans une table parallele.
  const fiches = await loadCustomSecurities();
  const custom = new Map(fiches.map((c) => [c.id, c]));
  // Second recours : le NOM EXACT. L'appariement de l'import fige son resultat
  // dans la position ; une ligne importee avant la creation de sa fiche reste
  // orpheline pour toujours. On refait donc la reconnaissance ici, avec la
  // meme clef et la meme normalisation qu'a l'import.
  const parNom = indexerParNom(fiches);
  const etablissements = new Map<string, Etablissement>();
  const soldesInventaire = new Map<string, number>();
  const nonRattaches = new Map<string, number>();

  for (const p of actuel.positions) {
    if (p.section !== "tresorerie") continue;
    const libelle = (p.rawLabel || p.matchLabel || p.rawCode || "Compte sans libellé").trim();
    const fiche =
      (p.customSecurityId ? custom.get(p.customSecurityId) : undefined) ??
      parNom.get(normName(libelle)) ??
      parNom.get(normName(p.rawCode ?? ""));
    const etab = etablissementDuCompte(fiche);
    const montant = num(p.valuation);
    if (!etab) {
      nonRattaches.set(libelle, (nonRattaches.get(libelle) ?? 0) + montant);
      continue;
    }
    // Un etablissement est dépositaire des qu'UN de ses comptes l'est.
    const connu = etablissements.get(etab.cle);
    etablissements.set(etab.cle, {
      ...etab,
      depositaire: (connu?.depositaire ?? false) || etab.depositaire,
    });
    soldesInventaire.set(etab.cle, (soldesInventaire.get(etab.cle) ?? 0) + montant);
  }

  // ── SOLDE : la saisie fait foi, l'inventaire sert de repere ───────────────
  //
  // Le solde comptable et le solde bancaire different presque toujours :
  // operations en cours de denouement, commissions prelevees, flux de monnaie
  // electronique non rapproches. Le tresorier travaille sur le solde BANCAIRE,
  // qu'il saisit ; l'inventaire reste affiche en regard.
  const supabase = await createSupabaseServerClient();
  const { data: saisie } = await supabase
    .from("fund_treasury_balances")
    .select("as_of_date, soldes")
    .eq("fund_id", fundId)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const soldesSaisis = new Map<string, number>();
  const brut = (saisie?.soldes ?? {}) as Record<string, unknown>;
  for (const [banque, v] of Object.entries(brut)) {
    if (typeof v === "number" && Number.isFinite(v)) soldesSaisis.set(banque, v);
  }

  // Les colonnes viennent de l'INVENTAIRE, et de lui seul.
  //
  // Le referentiel porte tous les comptes jamais ouverts, y compris ceux qu'un
  // fonds n'utilise pas ou plus ; un jeu de soldes enregistre peut lui aussi
  // garder trace d'un compte depuis ferme. Batir les colonnes la-dessus
  // afficherait a ce fonds des etablissements qui ne le concernent pas, tous a
  // zero, et noierait les comptes qui portent vraiment sa tresorerie. Le
  // referentiel sert a NOMMER et a CLASSER les comptes de l'inventaire, pas a
  // en ajouter.
  //
  // Corollaire assume : un solde saisi pour un compte absent du dernier
  // inventaire reste en base, mais ne s'affiche plus tant que le compte n'y
  // revient pas.
  const ordonnes = ordonnerEtablissements([...etablissements.values()]);
  const banques = ordonnes.map((e) => e.cle);
  const soldes = new Map<string, number>();
  for (const b of banques) soldes.set(b, soldesSaisis.get(b) ?? 0);

  const actifNet = actuel.positions.reduce((s, p) => s + num(p.valuation), 0);

  // ── Valeurs par poste ─────────────────────────────────────────────────────
  const valeurs = new Map<string, Record<string, number>>();
  const zero = (): Record<string, number> => Object.fromEntries(banques.map((b) => [b, 0]));

  for (const def of LIGNES_POINT_TRESORERIE) {
    valeurs.set(def.libelle, zero());
  }
  const soldeInitial = valeurs.get("SOLDE")!;
  for (const b of banques) soldeInitial[b] = soldes.get(b) ?? 0;

  const v = (libelle: string, banque: string): number => valeurs.get(libelle)?.[banque] ?? 0;
  const somme = (libelles: string[], banque: string): number =>
    libelles.reduce((s, l) => s + v(l, banque), 0);

  // ── Sous-totaux et soldes, formules du classeur ───────────────────────────
  //
  // Reprises a l'identique des cellules, y compris une bizarrerie qu'il faut
  // connaitre : SOLDEREEL n'ajoute que « VENTES MTP REALISEES », pas le
  // sous-total « VENTES REALISEES » — les ventes MFR realisees n'y entrent
  // donc pas, alors que SOLDETHEORIQUE, lui, prend bien le sous-total. Les
  // deux soldes ne traitent pas les ventes de la meme facon. C'est peut-etre
  // voulu (seules les MTP se denouent en cash immediatement), peut-etre une
  // erreur de formule ; on reproduit le classeur, on ne le corrige pas sans
  // arbitrage du gerant.
  for (const b of banques) {
    valeurs.get("ACHATS VALIDES")![b] = somme(
      ["ACHATS MFR VALIDES", "ACHATS MTP VALIDES", "ACHATS A RÉMÉRÉ VALIDES"], b);
    valeurs.get("ACHATS REALISES")![b] = somme(
      ["ACHATS MFR REALISES", "ACHATS MTP REALISES"], b);
    valeurs.get("VENTES REALISEES")![b] = somme(
      ["VENTES MFR REALISEES", "VENTES MTP REALISEES"], b);
    valeurs.get("AUTRES ENGAGEMENTS")![b] = somme(
      ["OPERATIONS MARCHÉ PRIMAIRE", "RACHAT", "FRAIS DE GESTION",
       "REMERES_CASH_IN", "REMBOURSEMENT_SPOT", "AUTRES"], b);
    valeurs.get("CASH A RECEVOIR")![b] = somme(
      ["SOUSCRIPTION BUREAU CI", "SOUSCRIPTION BUREAU SN", "SOUSCRIPTION BUREAU BJ",
       "REMERES_CASH_OUT", "SPOT", "AUTRES_CASH_A_RECEVOIR"], b);
    valeurs.get("FLUX THEORIQUES")![b] =
      somme(["SOUSCRIPTION PROB. BUREAU CI", "SOUSCRIPTION PROB. BUREAU SN",
             "SOUSCRIPTION PROB. BUREAU BJ", "AUTRES_FLUX_ENTRANT", "DIVIDENDES/COUPONS"], b) -
      somme(["SOUSCRIPTION PRIMAIRE PROB.", "RACHAT PROB.", "AUTRES_FLUX_SORTANT"], b);

    valeurs.get("SOLDEREEL")![b] =
      v("SOLDE", b) + v("CASH A RECEVOIR", b) + v("VENTES MTP REALISEES", b) -
      v("ACHATS VALIDES", b) - v("ACHATS REALISES", b) - v("AUTRES ENGAGEMENTS", b);

    valeurs.get("SOLDETHEORIQUE")![b] =
      v("SOLDE", b) + v("VENTES REALISEES", b) + v("FLUX THEORIQUES", b) -
      v("ACHATS VALIDES", b) - v("ACHATS REALISES", b) - v("AUTRES ENGAGEMENTS", b) -
      v("ENGAGEMENTS PROBABLES", b);
  }

  // ── Mise en forme ─────────────────────────────────────────────────────────
  const lignes: LigneTresorerie[] = LIGNES_POINT_TRESORERIE.map((def) => {
    const parBanque: Record<string, number | null> = {};
    let total = 0;

    if (def.nature === "pourcentage") {
      // Les ratios ne se ventilent pas par banque : seul le total a un sens,
      // l'actif net n'etant pas attribuable a un compte.
      for (const b of banques) parBanque[b] = null;
      const solde = def.libelle.startsWith("Solde réél") ? "SOLDEREEL" : "SOLDETHEORIQUE";
      const cumul = banques.reduce((s, b) => s + v(solde, b), 0);
      return {
        libelle: def.libelle,
        nature: def.nature,
        source: def.source,
        parBanque,
        total: actifNet > 0 ? cumul / actifNet : null,
      };
    }

    for (const b of banques) {
      const x = v(def.libelle, b);
      parBanque[b] = x;
      total += x;
    }
    return { libelle: def.libelle, nature: def.nature, source: def.source, parBanque, total };
  });

  return {
    fondsId: fundId,
    fonds: nomFonds,
    dateFin: saisie?.as_of_date ?? null,
    banques,
    actifNet: actifNet > 0 ? actifNet : null,
    dateInventaire: actuel.asOfDate,
    lignes,
    postesAAlimenter: LIGNES_POINT_TRESORERIE.filter((d) => d.source === "a_alimenter").length,
    etablissements: ordonnes.map((e) => ({
      cle: e.cle,
      nom: e.nom,
      pays: e.pays,
      sens: libelleSens(e),
      groupe: groupeEtablissement(e),
    })),
    soldesInventaire: Object.fromEntries(banques.map((b) => [b, soldesInventaire.get(b) ?? 0])),
    comptesNonRattaches: [...nonRattaches.entries()]
      .map(([libelle, montant]) => ({ libelle, montant }))
      .sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant)),
    soldesSaisisLe: saisie?.as_of_date ?? null,
  };
}

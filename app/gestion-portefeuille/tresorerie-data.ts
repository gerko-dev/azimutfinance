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

import { cache } from "react";
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
import { agregerParPoste, loadOperationsMarche } from "./operations-marche-data";
import { agregerFluxParts, loadFluxParts } from "./parts-data";
import { loadDernieresVl, loadNavMois } from "./nav-data";
import { loadMyFunds } from "./data";
import { fraisGestionDuMois, moisDesFrais } from "./frais-gestion";
import { agregerEsv, construireCalendrierEsv } from "./esv-data";
import {
  agregerFluxSaisis,
  agregerNivellements,
  loadFluxManuels,
  loadNivellements,
  loadSpots,
  spotsAVenir,
} from "./tresorerie-flux-data";
import {
  dateLimiteOrdre,
  montantDenouementRemere,
  montantRestant,
  quantiteRestante,
  remereOuvertA,
  sensDe,
} from "./operations-marche-types";
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
/** Mémoïsé par requête : l'écran de trésorerie construit le point de chaque
 *  fonds DEUX FOIS — une pour le tableau, une pour la grille de saisie des
 *  soldes. Sans cela, chaque fonds payait quatre allers-retours en double. */
export const construirePointTresorerie = cache(async function construirePoint(
  fundId: string,
  nomFonds: string,
  /**
   * Date de PRISE EN COMPTE DES ENGAGEMENTS.
   *
   * Elle ne se confond pas avec la date des soldes. Les soldes disent ce qu'il
   * y a en banque à un instant ; cette date-ci dit jusqu'où l'on regarde les
   * flux à venir. Le classeur les distingue déjà — sa cellule « DATE FIN » est
   * au 30 septembre quand les soldes sont d'un autre jour.
   *
   * Les confondre interdisait de répondre à la question qui compte pour un
   * trésorier : « de quoi vais-je disposer à telle date, une fois tout ce qui
   * est engagé passé ? »
   *
   * À défaut, on retombe sur la date des soldes saisis : c'est le comportement
   * d'avant, donc rien ne change tant que personne ne choisit.
   */
  dateEngagements?: string | null,
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
  // QUATRE LECTURES INDÉPENDANTES, menées de front.
  //
  // Enchaînées, elles faisaient payer quatre latences réseau bout à bout —
  // près d'une seconde avant que le moindre calcul ne commence — alors
  // qu'aucune n'attend le résultat des autres. Sur l'écran interfonds, ce
  // délai se multipliait par le nombre de fonds.
  const [snapshots, fiches, operations, fluxParts, fondsGeres, fluxSaisis, spots, nivellements, calendrierEsv] =
    await Promise.all([
      loadFundPortfolios(fundId),
      loadCustomSecurities(),
      loadOperationsMarche(fundId),
      loadFluxParts(fundId),
      loadMyFunds(),
      loadFluxManuels(fundId),
      loadSpots(fundId),
      loadNivellements(fundId),
      construireCalendrierEsv(fundId),
    ]);
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
  // LE COMPTE DÉPOSITAIRE : la première colonne du groupe « Comptes
  // dépositaires », dans l'ordre d'affichage déjà établi. C'est chez lui que
  // les titres sont conservés, donc chez lui que leurs revenus tombent — et
  // c'est une réalité de marché, pas une convention à paramétrer.
  const compteDepositaire =
    ordonnes.find((e) => groupeEtablissement(e) === "Comptes dépositaires")?.cle ?? "";

  const soldes = new Map<string, number>();
  for (const b of banques) soldes.set(b, soldesSaisis.get(b) ?? 0);

  // L'actif net de l'inventaire : la somme de ses lignes. Il sert de REPLI,
  // et de lui seul — cf. `actifNet` plus bas.
  const actifNetInventaire = actuel.positions.reduce((s, p) => s + num(p.valuation), 0);

  // ── Valeurs par poste ─────────────────────────────────────────────────────
  const valeurs = new Map<string, Record<string, number>>();
  const zero = (): Record<string, number> => Object.fromEntries(banques.map((b) => [b, 0]));

  for (const def of LIGNES_POINT_TRESORERIE) {
    valeurs.set(def.libelle, zero());
  }
  const soldeInitial = valeurs.get("SOLDE")!;
  for (const b of banques) soldeInitial[b] = soldes.get(b) ?? 0;

  // ── Achats et ventes, depuis les operations de marche ────────────────────
  //
  // La date d'arrete est celle du dernier jeu de soldes saisi ; a defaut,
  // celle de l'inventaire. C'est la cellule « DATE FIN » du classeur, et elle
  // decide de ce qui compte : une operation denouee APRES cette date n'a pas
  // encore bouge la tresorerie.
  const dateArrete =
    (dateEngagements && /^\d{4}-\d{2}-\d{2}$/.test(dateEngagements)
      ? dateEngagements
      : null) ??
    saisie?.as_of_date ??
    actuel.asOfDate ??
    null;
  const parPoste = agregerParPoste(operations, dateArrete);

  // DEUX SOURCES, UN SEUL TABLEAU. Les opérations de marché sont l'actif du
  // fonds, les souscriptions et rachats son passif. Elles tombent dans des
  // postes disjoints — rien ne peut donc s'écraser — mais elles partagent les
  // colonnes, puisqu'un même compte bancaire reçoit les deux.
  // TROIS SOURCES, UN SEUL TABLEAU. Les flux SAISIS rejoignent les deux
  // autres : les quatre lignes « autres » et les dénouements de spot ne
  // viennent d'aucune déduction possible — c'est leur définition —, et c'est
  // pourquoi elles ont leur propre formulaire. Tous ces postes sont disjoints,
  // rien ne peut donc s'écraser.
  const apports = [
    agregerFluxParts(fluxParts, dateArrete),
    agregerFluxSaisis(fluxSaisis, spots, dateArrete),
    // LES NIVELLEMENTS TOMBENT DANS LES MEMES DEUX LIGNES que les flux saisis
    // - decaissements pour la jambe emettrice, encaissements pour la
    // receveuse. On les AJOUTE, on ne les ecrase pas : un nivellement et une
    // regularisation peuvent viser le meme compte le meme jour.
    agregerNivellements(nivellements, dateArrete),
    // LES REVENUS ET LES TOMBEES DE TITRES, du module ESV. Ils tombent sur le
    // COMPTE DEPOSITAIRE : c'est lui qui encaisse coupons et dividendes, et
    // c'est une realite de marche, pas une convention a parametrer.
    //
    // Sans compte depositaire a l'inventaire, rien ne s'inscrit : un montant
    // qui ne designe aucune colonne n'a nulle part ou aller, et le poser sur
    // la premiere banque venue fausserait son solde.
    agregerEsv(calendrierEsv.evenements, compteDepositaire, dateArrete),
  ];
  for (const apport of apports) {
    for (const [poste, parCompte] of apport) {
      const cible = parPoste.get(poste) ?? new Map<string, number>();
      for (const [compte, m] of parCompte) {
        cible.set(compte, (cible.get(compte) ?? 0) + m);
      }
      parPoste.set(poste, cible);
    }
  }

  const colonnes = new Set(banques);
  // UNE OPERATION QUI NE TOMBE DANS AUCUNE COLONNE NE DOIT PAS DISPARAITRE.
  //
  // Son compte de reglement peut ne plus figurer dans l'inventaire de fin —
  // compte ferme, ou simplement absent de l'arrete. Le montant n'a alors nulle
  // part ou aller. L'ecarter en silence donnerait un poste qui ne bouge pas
  // sans raison visible ; on le remonte a part.
  const sansColonne: { libelle: string; compte: string; montant: number }[] = [];
  for (const [poste, parCompte] of parPoste) {
    const cible = valeurs.get(poste);
    if (!cible) continue;
    for (const [compte, m] of parCompte) {
      if (colonnes.has(compte)) cible[compte] += m;
      else sansColonne.push({ libelle: poste, compte, montant: m });
    }
  }

  // ── Frais de gestion ──────────────────────────────────────────────────────
  //
  // Moyenne mensuelle de l'actif net × taux annuel ÷ 12. Ils ne viennent
  // d'aucune saisie : le taux est sur la fiche du fonds, l'actif net dans
  // l'historique de VL importé, et les redemander chaque mois n'aurait fait
  // qu'ouvrir la porte à une faute de frappe sur un montant à huit chiffres.
  //
  // LE MOIS AFFICHÉ SUIT LA DATE D'ARRÊTÉ, pas l'horloge : le point se lit
  // aussi bien sur une date passée, et y montrer les frais du mois courant
  // aurait fait mentir un arrêté de septembre consulté en décembre.
  const fondsGere = fondsGeres.find((f) => f.id === fundId) ?? null;
  const dateFrais = dateArrete ?? new Date().toISOString().slice(0, 10);
  // UN SEUL MOIS DE VL, pas l'historique entier. Il dépend de la date
  // d'arrêté, donc il ne peut pas partir avec les lectures du début — mais
  // c'est une vingtaine de lignes, là où l'historique complet en fait deux
  // mille par fonds, et l'écran est interfonds.
  const vl = await loadNavMois(fundId, moisDesFrais(dateFrais));

  // ── L'ACTIF NET QUI FAIT FOI ────────────────────────────────────────────
  //
  // Celui de l'HISTORIQUE DE VL, pas la somme des lignes de l'inventaire.
  //
  // Les deux divergeaient de 1,1 milliard sur le Diversifié — 3,3 % — et c'est
  // l'historique qui a raison : son actif net recoupe exactement VL × nombre
  // de parts, là où la somme des valorisations ignore le passif du fonds et
  // les régularisations du dépositaire. Les ratios s'appuient déjà dessus ;
  // le point de trésorerie divergeait d'eux sans raison.
  //
  // Borné à la date d'arrêté : un arrêté de septembre consulté en décembre
  // doit rapporter ses pourcentages à l'actif net de septembre.
  const derniereVl = (await loadDernieresVl(fundId, 1, dateArrete ?? undefined))[0] ?? null;
  const actifNetHistorique = num(derniereVl?.actifNet);
  const actifNet = actifNetHistorique > 0 ? actifNetHistorique : actifNetInventaire;
  const frais = fraisGestionDuMois(vl, Number(fondsGere?.fraisGestion ?? "") || 0, dateFrais);
  // SUR LA COLONNE CHOISIE, et sur elle seule.
  //
  // Le tableau n'a pas de place pour un montant qui ne désigne aucune banque :
  // sa colonne Total est la somme des colonnes. Un montant sans compte ne peut
  // donc pas s'y inscrire — et le répartir au hasard fausserait le solde d'un
  // établissement. On le signale plutôt, comme on signale déjà les comptes non
  // rattachés : le choix se fait dans les paramètres du fonds.
  const compteFrais = (fondsGere?.compteFraisGestion ?? "").trim();
  const compteFraisValide = compteFrais !== "" && banques.includes(compteFrais);
  if (frais.montant > 0 && compteFraisValide) {
    valeurs.get("FRAIS DE GESTION")![compteFrais] += frais.montant;
  }
  const fraisGestion =
    frais.indisponible !== null
      ? { ...frais, compte: compteFrais, applique: false }
      : {
          ...frais,
          compte: compteFrais,
          applique: compteFraisValide,
          indisponible: compteFraisValide
            ? null
            : compteFrais === ""
              ? "Aucun compte de prélèvement n'est choisi : les frais se calculent mais " +
                "n'entrent dans aucune colonne. Choisis-le dans Paramètres › Fonds gérés."
              : `Le compte « ${compteFrais} » ne figure pas dans l'inventaire de ce fonds : ` +
                `les frais n'ont aucune colonne où s'inscrire.`,
        };

  // Negociees, pas encore denouees : elles ne comptent pas aujourd'hui, mais
  // le tresorier doit les voir venir.
  // Ce sont les EXÉCUTIONS qui se dénouent, pas les ordres : on liste donc
  // celles dont le règlement tombe après la date d'arrêté. Un ordre non servi
  // n'y figure pas — il n'a rien à régler, il pèse déjà comme engagement.
  const nonDenouees = operations
    .flatMap((o) =>
      o.executions
        .filter((e) => dateArrete !== null && e.dateDenouement > dateArrete)
        .map((e) => ({
          libelle:
            `${o.libelle || o.code || "Opération"} — ${o.compteReglement}` +
            (e.quantite < o.quantite ? ` (${e.quantite} / ${o.quantite})` : ""),
          dateDenouement: e.dateDenouement,
          montant: o.quantite > 0 ? (o.montant / o.quantite) * e.quantite : 0,
        })),
    )
    .sort((a, b) => a.dateDenouement.localeCompare(b.dateDenouement));

  // Rémérés dont le TERME est au-delà de l'arrêté : leur flux ne compte pas
  // encore, mais il est certain. Sans cette liste, un remboursement à sept
  // chiffres n'apparaissait qu'au moment où il tombait.
  const remeresAVenir = operations
    .filter((o) => remereOuvertA(o, dateArrete))
    .filter((o) => {
      const terme = o.remere?.dateFin ?? "";
      return dateArrete !== null && (!terme || terme > dateArrete);
    })
    .map((o) => ({
      libelle: `${o.libelle || o.code || "Réméré"} — ${o.remere?.contrepartie || "contrepartie ?"}`,
      dateFin: o.remere?.dateFin ?? "—",
      montant: montantDenouementRemere(o, dateArrete),
      // L'INVERSE DU SENS D'ENTRÉE : un achat à réméré se dénoue par une
      // vente, donc par un encaissement.
      sens: (sensDe(o.description) === "achat" ? "encaissement" : "décaissement") as
        | "encaissement"
        | "décaissement",
    }))
    .sort((a, b) => a.dateFin.localeCompare(b.dateFin));

  // Ordres dont la part non servie a expiré : ils ne pèsent plus, mais leur
  // disparition doit se voir. Sans cette liste, un engagement s'évaporait du
  // point sans qu'aucun écran ne dise pourquoi.
  const perimes = operations
    .flatMap((o) => {
      if (quantiteRestante(o) <= 0) return [];
      // Un ordre CLOS a sa propre raison de ne plus peser, et le gérant la
      // connaît : c'est lui qui l'a posée. L'annoncer comme « périmé »
      // brouillerait les deux.
      if (o.clotureLe) return [];
      // Hors bourse, pas de date limite : l'ordre ne périme jamais.
      const dateLimite = dateLimiteOrdre(o);
      if (dateLimite === null) return [];
      if (dateArrete === null || dateLimite >= dateArrete) return [];
      return [
        {
          libelle: `${o.libelle || o.code || "Ordre"} — ${o.compteReglement}`,
          dateLimite,
          montant: montantRestant(o),
        },
      ];
    })
    .sort((a, b) => b.dateLimite.localeCompare(a.dateLimite));

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
    valeurs.get("VENTES VALIDES")![b] = somme(
      ["VENTES MFR VALIDES", "VENTES MTP VALIDES", "VENTES A RÉMÉRÉ VALIDES"], b);
    valeurs.get("VENTES REALISEES")![b] = somme(
      ["VENTES MFR REALISEES", "VENTES MTP REALISEES"], b);
    valeurs.get("AUTRES ENGAGEMENTS")![b] = somme(
      ["OPERATIONS MARCHÉ PRIMAIRE", "RACHAT", "FRAIS DE GESTION",
       "REMERES_CASH_IN", "REMBOURSEMENT_SPOT", "AUTRES"], b);
    valeurs.get("CASH A RECEVOIR")![b] = somme(
      ["SOUSCRIPTION BUREAU CI", "SOUSCRIPTION BUREAU SN", "SOUSCRIPTION BUREAU BJ",
       "REMERES_CASH_OUT", "SPOT", "AUTRES_CASH_A_RECEVOIR"], b);
    // « SOUSCRIPTION PRIMAIRE PROB. » a quitté le tableau : le classeur la
    // prévoyait, rien ne l'a jamais alimentée, et une souscription primaire
    // probable n'existe pas — on soumissionne ou on ne soumissionne pas.
    valeurs.get("FLUX THEORIQUES")![b] =
      somme(["SOUSCRIPTION PROB. BUREAU CI", "SOUSCRIPTION PROB. BUREAU SN",
             "SOUSCRIPTION PROB. BUREAU BJ", "AUTRES_FLUX_ENTRANT",
             "DIVIDENDES/COUPONS"], b) -
      somme(["RACHAT PROB.", "AUTRES_FLUX_SORTANT"], b);

    valeurs.get("SOLDEREEL")![b] =
      v("SOLDE", b) + v("CASH A RECEVOIR", b) + v("VENTES MTP REALISEES", b) -
      v("ACHATS VALIDES", b) - v("ACHATS REALISES", b) - v("AUTRES ENGAGEMENTS", b);

    // « ENGAGEMENTS PROBABLES » est parti de même. C'était un sous-total que
    // rien ne calculait : ce qu'il aurait dû contenir — rachats et flux
    // sortants probables — est déjà retranché par FLUX THEORIQUES, et l'y
    // ajouter aurait compté ces sorties deux fois le jour où la ligne aurait
    // trouvé une source.
    valeurs.get("SOLDETHEORIQUE")![b] =
      v("SOLDE", b) + v("VENTES REALISEES", b) + v("FLUX THEORIQUES", b) -
      v("ACHATS VALIDES", b) - v("ACHATS REALISES", b) - v("AUTRES ENGAGEMENTS", b);
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
    // « DATE FIN » du classeur : jusqu'ou les engagements sont pris en compte.
    dateFin: dateArrete,
    banques,
    actifNet: actifNet > 0 ? actifNet : null,
    dateInventaire: actuel.asOfDate,
    lignes,
    fraisGestion,
    remeresAVenir,
    fluxSaisis,
    spots,
    nivellements,
    calendrierEsv,
    spotsAVenir: spotsAVenir(spots, dateArrete),
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
    operationsSansColonne: sansColonne.sort(
      (a, b) => Math.abs(b.montant) - Math.abs(a.montant),
    ),
    operationsNonDenouees: nonDenouees,
    ordresPerimes: perimes,
  };
});

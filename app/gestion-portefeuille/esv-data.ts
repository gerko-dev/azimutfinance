import "server-only";

// === ESV — construction du calendrier ===
//
// LE CALENDRIER NE SE STOCKE PAS, IL SE CALCULE. Il est la rencontre de deux
// choses que le site connaît déjà : ce que le fonds DÉTIENT — son inventaire —
// et ce que chaque titre DOIT PAYER — les échéanciers du référentiel.
//
// Les figer en base aurait créé une seconde vérité, qui aurait divergé du
// référentiel dès la première correction d'échéancier, et le gérant aurait eu
// deux calendriers sans savoir lequel croire.
//
// Seul le POINTAGE se stocke : qu'un flux ait été reçu, quand et pour combien.
// Aucun calcul ne peut le deviner.
//
// CINQ GISEMENTS, TROIS DEGRÉS DE CERTITUDE :
//
//   obligations cotées — échéancier complet du référentiel BRVM, coupons,
//                        amortissements et remboursement. C'est un contrat.
//   titres publics     — coupons et remboursement reconstruits par le calcul
//                        actuariel du site. Contrat aussi, mais reconstitué.
//   actions            — l'AVIS DU BOC, et lui seul : montant net par action,
//                        ex-dividende et date de paiement sur la même ligne,
//                        publiés par la Bourse. Sans avis, pas de ligne — une
//                        action détenue dont le dividende n'est pas annoncé
//                        est signalée à part plutôt que devinée.
//   NON COTÉS          — les titres du référentiel du gérant : obligations de
//                        gré à gré, FCTC, emprunts non cotés. Leur échéancier
//                        se reconstruit avec LE GÉNÉRATEUR DU SITE, celui des
//                        obligations cotées, à partir des caractéristiques
//                        saisies sur la fiche. Un calcul maison aurait fini
//                        par diverger de celui de la cote.
//   DÉPÔTS À TERME     — un seul flux : le nominal et ses intérêts, à
//                        l'échéance. Base 360, comme le reste du monétaire
//                        UEMOA.

import { cache } from "react";

import {
  loadAllActions,
  loadBocDividendes,
  loadBonds,
  loadListedBondEvents,
} from "@/lib/dataLoader";
import { getFutureCashFlows, parseDate } from "@/lib/bondMath";
import {
  generateBondLifecycleEvents,
  type AmortizationMode,
  type AmortizationType,
  type ListedBond,
} from "@/lib/listedBondsTypes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { loadCustomSecurities, loadFundPortfolios } from "./portfolio-data";
import type { CustomSecurity } from "./portfolio-types";
import type { PortfolioSnapshot, SavedPosition } from "./portfolio-types";
import {
  cleEvenement,
  DEBUT_SUIVI,
  POSTE_DE_NATURE,
  type EvenementEsv,
  type NatureEsv,
  type Reception,
} from "./esv-types";

const cle = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** Inventaire qui fait foi : le slot « fin », à défaut le plus récent. Même
 *  règle que le point de trésorerie et le contrôle de cession — trois écrans
 *  qui désigneraient trois inventaires différents seraient inexploitables. */
function snapshotDeReference(snapshots: PortfolioSnapshot[]): PortfolioSnapshot | null {
  return (
    snapshots.find((s) => s.slot === "fin") ??
    [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).pop() ??
    null
  );
}

/** Une ligne de l'inventaire vue comme un TITRE DÉTENU. */
type Detention = {
  quantite: number;
  code: string;
  isin: string;
  libelle: string;
  instrument: "actions" | "obligations" | "mtp";
};

/**
 * Titres détenus, agrégés par nature de rattachement.
 *
 * On s'appuie sur `matchKind`, qui dit à QUEL RÉFÉRENTIEL la ligne est
 * rattachée — pas sur la section de l'inventaire, qui dit seulement comment le
 * dépositaire l'a classée. Les deux divergent : un titre public figure souvent
 * en « obligation », et c'est pourtant le calendrier UMOA qui le paie.
 */
function detentions(
  snapshot: PortfolioSnapshot,
  fiches: Map<string, CustomSecurity>,
): {
  actions: Map<string, Detention>;
  obligations: Map<string, Detention>;
  souverains: Map<string, Detention>;
  /** Titres du référentiel du gérant — non cotés, indexés par identifiant de
   *  fiche. C'est la fiche, et non l'inventaire, qui porte l'échéancier. */
  nonCotes: Map<string, Detention>;
} {
  const actions = new Map<string, Detention>();
  const obligations = new Map<string, Detention>();
  const souverains = new Map<string, Detention>();
  const nonCotes = new Map<string, Detention>();

  const ajouter = (m: Map<string, Detention>, k: string, d: Detention) => {
    const deja = m.get(k);
    // Un même titre peut occuper plusieurs lignes — deux lots, deux prix de
    // revient. Les quantités s'additionnent : le coupon, lui, est unique.
    if (deja) deja.quantite += d.quantite;
    else m.set(k, d);
  };

  for (const p of snapshot.positions as SavedPosition[]) {
    const q = p.quantity ?? 0;
    if (q <= 0) continue;
    const libelle = p.matchLabel || p.rawLabel || p.rawCode || "—";
    const code = cle(p.matchCode || p.rawCode);
    const isin = cle(p.matchIsin);

    if (p.matchKind === "stock" && (code || p.matchId)) {
      const k = code || cle(p.matchId);
      ajouter(actions, k, { quantite: q, code: k, isin, libelle, instrument: "actions" });
    } else if (p.matchKind === "listed-bond") {
      // L'ISIN d'abord, le mnémonique ensuite : quatre lignes du référentiel
      // obligataire partagent l'ISIN « NC », et c'est alors le code qui les
      // sépare. Cf. le commentaire de `ListedBondEvent.code`.
      const k = isin && isin !== "NC" ? isin : code;
      if (k) {
        ajouter(obligations, k, {
          quantite: q,
          code,
          isin,
          libelle,
          instrument: "obligations",
        });
      }
    } else if (p.matchKind === "sovereign" && isin) {
      ajouter(souverains, isin, {
        quantite: q,
        code: code || isin,
        isin,
        libelle,
        instrument: "mtp",
      });
    } else if (p.customSecurityId) {
      // LES NON COTÉS — mais SEULEMENT CEUX QUI PRODUISENT DES FLUX.
      //
      // Presque toute ligne d'inventaire porte une fiche du référentiel : les
      // actions en ont une, les OPCVM aussi. Prendre toute ligne rattachée
      // aurait versé ici les parts de FCP et les actions dont le mnémonique
      // n'a pas été reconnu, pour les ressortir aussitôt comme « fiches
      // incomplètes » — un bandeau de quarante lignes qui aurait noyé les
      // cinq vraies.
      //
      // La NATURE DE LA FICHE tranche : une obligation de gré à gré et un
      // dépôt à terme ont un échéancier, une part d'OPCVM n'en a pas. Ce
      // qu'un OPCVM distribue, c'est sa VL qui le porte.
      const fiche = fiches.get(p.customSecurityId);
      if (fiche && (fiche.kind === "obligation" || fiche.kind === "dat")) {
        ajouter(nonCotes, p.customSecurityId, {
          quantite: q,
          code: code || libelle,
          isin,
          libelle,
          instrument: "obligations",
        });
      }
    }
  }

  return { actions, obligations, souverains, nonCotes };
}

/** Événements des OBLIGATIONS COTÉES détenues. */
function evenementsObligations(detenues: Map<string, Detention>): EvenementEsv[] {
  if (detenues.size === 0) return [];
  const out: EvenementEsv[] = [];

  for (const e of loadListedBondEvents()) {
    // Le référentiel indexe par ISIN ET par code : on cherche sous les deux,
    // parce que l'inventaire peut n'en porter qu'un.
    const d = detenues.get(cle(e.isin)) ?? detenues.get(cle(e.code));
    if (!d) continue;
    // Un « call » ou une « adjudication » ne produit pas de flux au porteur :
    // les compter ferait apparaître un encaissement qui n'existe pas.
    if (e.eventType !== "coupon" && e.eventType !== "amortissement" && e.eventType !== "remboursement")
      continue;
    if (!(e.amount > 0)) continue;

    const nature = e.eventType as NatureEsv;
    const titre = d.isin && d.isin !== "NC" ? d.isin : d.code;
    out.push({
      cle: cleEvenement(titre, e.date, nature),
      nature,
      date: e.date,
      code: d.code || e.code,
      libelle: d.libelle,
      isin: d.isin || e.isin,
      instrument: "obligations",
      quantite: d.quantite,
      montantParTitre: e.amount,
      montantAttendu: e.amount * d.quantite,
      source: "echeancier",
      reserve: null,
      reception: null,
    });
  }
  return out;
}

/**
 * Événements des TITRES PUBLICS détenus.
 *
 * Reconstruits par `getFutureCashFlows`, l'échéancier actuariel du site — le
 * même que le simulateur YTM. Un calcul maison ici aurait fini par diverger de
 * la fiche du titre, et le gérant aurait eu deux montants pour un coupon.
 *
 * LES BAT N'Y SONT PAS : `loadBonds` ne garde que les OAT. Un bon du Trésor
 * est escompté — un seul flux, à l'échéance — et il faudrait le reconstruire
 * autrement. On le signale plutôt que de le taire.
 */
function evenementsSouverains(detenues: Map<string, Detention>): {
  evenements: EvenementEsv[];
  sansEcheancier: string[];
} {
  const evenements: EvenementEsv[] = [];
  if (detenues.size === 0) return { evenements, sansEcheancier: [] };

  const parIsin = new Map(loadBonds().map((b) => [cle(b.isin), b]));
  const sansEcheancier: string[] = [];
  // Depuis la veille, pour ne pas perdre un coupon qui tombe aujourd'hui :
  // `getFutureCashFlows` ne garde que les dates STRICTEMENT postérieures.
  const depuis = parseDate(
    new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
  );

  for (const [isin, d] of detenues) {
    const bond = parIsin.get(isin);
    if (!bond) {
      sansEcheancier.push(`${d.libelle} (${isin})`);
      continue;
    }
    const flux = getFutureCashFlows(bond, depuis);
    for (const f of flux) {
      const date = f.date.toISOString().slice(0, 10);
      // Le dernier flux porte coupon ET nominal : on le nomme remboursement,
      // qui est ce que le trésorier attend de voir tomber.
      const nature: NatureEsv = f.isFinal ? "remboursement" : "coupon";
      evenements.push({
        cle: cleEvenement(isin, date, nature),
        nature,
        date,
        code: d.code,
        libelle: d.libelle,
        isin,
        instrument: "mtp",
        quantite: d.quantite,
        montantParTitre: f.amount,
        montantAttendu: f.amount * d.quantite,
        source: "echeancier",
        reserve: f.isFinal
          ? "Coupon final et nominal réunis, comme le porte l'échéancier."
          : null,
        reception: null,
      });
    }
  }
  return { evenements, sansEcheancier };
}

const nb = (v: string | undefined): number => {
  const n = Number((v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Une fiche du référentiel, vue comme une OBLIGATION du site.
 *
 * ON NE RÉÉCRIT PAS L'ÉCHÉANCIER. Le site sait déjà dérouler coupons,
 * amortissements et remboursement final pour les quatre profils — in fine,
 * constant, dégressif, échéancier saisi — et cette logique est délicate : le
 * différé, le mode « sur titre » ou « sur nominal », l'index k/N des tranches.
 * En écrire une seconde version pour les non cotés, c'était garantir que les
 * deux divergeraient, et que personne ne saurait laquelle croire.
 *
 * On construit donc un `ListedBond` à partir de la fiche et l'on passe le
 * générateur officiel dessus. Les champs que le référentiel du gérant n'a pas
 * — notation, caractère vert, appel — ne servent pas au calcul des flux.
 */
function ficheEnObligation(c: CustomSecurity): ListedBond | null {
  const a = c.attributes ?? {};
  const taux = nb(a.couponRate) / 100;
  const nominal = nb(a.nominalValue);
  const echeance = (a.maturityDate ?? "").trim();
  const emission = (a.issueDate ?? "").trim();

  // Sans échéance ni nominal, aucun flux ne se déroule : mieux vaut signaler
  // la fiche incomplète que produire un échéancier imaginaire.
  if (!echeance || nominal <= 0) return null;

  const freq = nb(a.couponFrequency);
  return {
    isin: c.isin || c.code || c.id,
    code: c.code || c.isin || c.id,
    name: c.name,
    issuer: (a.issuer ?? a.emetteur ?? c.name) as string,
    issuerType: (a.issuerType ?? "") as string,
    country: (a.country ?? "") as string,
    sector: (a.sector ?? "") as string,
    currency: c.currency || "XOF",
    nominalValue: nominal,
    totalIssued: nb(a.totalIssued),
    outstanding: nb(a.outstanding),
    couponRate: taux,
    couponFrequency: (freq === 2 || freq === 4 ? freq : 1) as 1 | 2 | 4,
    issueDate: emission,
    maturityDate: echeance,
    firstAmortizationDate: (a.firstAmortizationDate ?? "").trim(),
    amortizationType: ((a.amortizationType || "IF") as AmortizationType),
    amortizationMode: ((a.amortizationMode === "T" ? "T" : "N") as AmortizationMode),
    rating: "",
    ratingAgency: "",
    callable: false,
    callDate: "",
    greenBond: false,
    description: "",
    yearsToMaturity: 0,
  };
}

/**
 * Événements des TITRES NON COTÉS détenus.
 *
 * Deux natures dans le même référentiel, et deux traitements :
 *
 *   les OBLIGATIONS de gré à gré, FCTC et emprunts non cotés déroulent un
 *   échéancier complet, par le générateur du site ;
 *
 *   les DÉPÔTS À TERME n'ont qu'un flux — le nominal et ses intérêts, à
 *   l'échéance. Base 360, comme les prêts de titres et les spots : c'est la
 *   convention du monétaire UEMOA, et en changer ici aurait fait diverger
 *   trois calculs du même module.
 *
 * Une fiche trop incomplète pour dérouler quoi que ce soit est REMONTÉE, pas
 * ignorée : c'est un titre détenu dont les flux n'apparaîtront nulle part, et
 * la seule façon de le savoir est qu'on le dise.
 */
function evenementsNonCotes(
  detenues: Map<string, Detention>,
  fiches: Map<string, CustomSecurity>,
): { evenements: EvenementEsv[]; incompletes: string[] } {
  const evenements: EvenementEsv[] = [];
  const incompletes: string[] = [];
  if (detenues.size === 0) return { evenements, incompletes };

  for (const [id, d] of detenues) {
    const c = fiches.get(id);
    if (!c) {
      incompletes.push(`${d.libelle} — fiche introuvable au référentiel`);
      continue;
    }
    const a = c.attributes ?? {};

    // ── Dépôt à terme : un seul flux, à l'échéance ────────────────────
    if (c.kind === "dat") {
      const echeance = (a.dateEcheance ?? "").trim();
      const debut = (a.dateValeur ?? "").trim();
      const nominal = nb(a.montantNominal);
      const taux = nb(a.tauxInteret) / 100;
      if (!echeance || nominal <= 0) {
        incompletes.push(
          `${d.libelle} — dépôt à terme sans échéance ou sans nominal`,
        );
        continue;
      }
      const jours =
        debut
          ? Math.round(
              (new Date(`${echeance}T00:00:00Z`).getTime() -
                new Date(`${debut}T00:00:00Z`).getTime()) /
                86_400_000,
            )
          : 0;
      const interets = jours > 0 && taux > 0 ? (nominal * taux * jours) / 360 : 0;
      evenements.push({
        cle: cleEvenement(c.id, echeance, "remboursement"),
        nature: "remboursement",
        date: echeance,
        code: c.code || d.code,
        libelle: c.name || d.libelle,
        isin: c.isin || d.isin,
        instrument: "obligations",
        // LE DAT NE SE COMPTE PAS EN TITRES : son montant est le nominal de
        // la fiche, pas un prix unitaire multiplié par une quantité. On pose
        // donc une quantité de 1 pour que le montant ne soit pas multiplié.
        quantite: 1,
        montantParTitre: nominal + interets,
        montantAttendu: nominal + interets,
        source: "echeancier",
        reserve:
          `Dépôt à terme ${a.contrepartie ? `chez ${a.contrepartie} ` : ""}` +
          `au taux de ${(taux * 100).toFixed(2)} %` +
          (jours > 0
            ? ` sur ${jours} jours, base 360 — intérêts ${Math.round(
                interets,
              ).toLocaleString("fr-FR")} F.`
            : " — date de valeur manquante, intérêts non calculés."),
        reception: null,
      });
      continue;
    }

    // ── Obligation non cotée : l'échéancier du site ───────────────────
    const bond = ficheEnObligation(c);
    if (!bond) {
      incompletes.push(
        `${d.libelle} — échéance ou valeur nominale manquante sur la fiche`,
      );
      continue;
    }

    let flux;
    try {
      flux = generateBondLifecycleEvents(bond);
    } catch {
      incompletes.push(`${d.libelle} — échéancier non calculable`);
      continue;
    }

    let retenus = 0;
    for (const e of flux) {
      if (e.eventType !== "coupon" && e.eventType !== "amortissement" && e.eventType !== "remboursement")
        continue;
      if (!(e.amount > 0)) continue;
      retenus += 1;
      const nature = e.eventType as NatureEsv;
      evenements.push({
        cle: cleEvenement(c.id, e.date, nature),
        nature,
        date: e.date,
        code: c.code || d.code,
        libelle: c.name || d.libelle,
        isin: c.isin || d.isin,
        instrument: "obligations",
        quantite: d.quantite,
        montantParTitre: e.amount,
        montantAttendu: e.amount * d.quantite,
        source: "echeancier",
        // LA FICHE EST SAISIE À LA MAIN : son échéancier vaut ce que vaut ce
        // qui y a été porté. Le dire sur chaque ligne évite de prendre un
        // coupon reconstruit pour un coupon publié.
        reserve:
          "Titre non coté — échéancier reconstruit d'après les caractéristiques " +
          "saisies au référentiel.",
        reception: null,
      });
    }
    if (retenus === 0) {
      incompletes.push(`${d.libelle} — aucun flux restant à l'échéancier`);
    }
  }

  return { evenements, incompletes };
}

/**
 * Normalise une raison sociale : accents, apostrophes typographiques,
 * ponctuation, espaces multiples. Ne juge de rien, met seulement les deux
 * écritures sur le même plan.
 */
function normaliserNom(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Mots qui ne distinguent rien : ils figurent dans la moitié des raisons
 *  sociales de la cote. */
const MOTS_VIDES = new Set(["DE", "DU", "DES", "LA", "LE", "LES", "L", "ET", "POUR", "SA", "D"]);

const motsDe = (s: string): string[] =>
  normaliserNom(s).split(" ").filter((t) => t && !MOTS_VIDES.has(t));

/**
 * Le nom du BOC est-il CONTENU dans celui du référentiel ?
 *
 * Tous les mots de l'avis doivent se retrouver dans le nom candidat. C'est
 * volontairement sévère : « BOA SENEGAL » ne doit jamais tomber sur « BOA
 * MALI », et un dividende attribué au mauvais titre est bien pire qu'un
 * dividende manquant — le premier se propage au point de trésorerie sans
 * qu'on le voie, le second se signale.
 *
 * L'ABRÉVIATION EST TOLÉRÉE DANS UN SEUL SENS : « INT » vaut
 * « INTERNATIONAL », et jamais l'inverse. Dans les deux sens, le suffixe de
 * pays « CI » avalait « CIE » — et « CIE CI » trouvait trente-trois candidats.
 * Trois lettres au minimum, pour la même raison.
 */
function nomCouvert(nomAvis: string, nomCandidat: string): boolean {
  const avis = motsDe(nomAvis);
  const cand = motsDe(nomCandidat);
  if (avis.length === 0 || cand.length === 0) return false;
  return avis.every((t) =>
    cand.some((u) => u === t || (t.length >= 3 && u.startsWith(t))),
  );
}

/**
 * AVIS DU BOC QUE LE NOM SEUL NE PERMET PAS DE RATTACHER.
 *
 * La Bourse emploie deux vocabulaires dans le MÊME bulletin : sa table de
 * cotation dit « BANK OF AFRICA CI », son calendrier des dividendes « BOA
 * CÔTE D'IVOIRE ». Ailleurs elle abrège — « BIIC BN » pour la Banque
 * Internationale pour l'Industrie et le Commerce du Bénin, « SOCIETE
 * GENERALE CI » quand le mnémonique est SGBC et le nom de la cote « SGB CI ».
 *
 * Aucun algorithme ne rapproche honnêtement un sigle de sa raison sociale.
 * Cette table le fait explicitement, et elle est FAITE POUR ÊTRE ÉTENDUE : le
 * jour où la Bourse renomme une valeur, l'avis ressort dans « avis non
 * rattachés » à l'écran, et une ligne ici le règle.
 *
 * Clef : le nom du calendrier, passé par `normaliserNom` — donc SANS
 * apostrophe ni ponctuation, celles-ci devenant des espaces. Écrire
 * « BOA COTE D'IVOIRE » ici ne correspondait à rien : la clef réelle est
 * « BOA COTE D IVOIRE ». Valeur : le mnémonique BRVM.
 */
const ALIAS_AVIS_BOC: Record<string, string> = {
  "BOA BURKINA FASO": "BOABF",
  "BOA COTE D IVOIRE": "BOAC",
  "BOA BENIN": "BOAB",
  "SONATEL SENEGAL": "SNTS",
  "CORIS BANK INT BF": "CBIBF",
  "ECOBANK TRANSNATIONAL INCORPORATED TG": "ETIT",
  "BIIC BN": "BICB",
  "SOCIETE GENERALE CI": "SGBC",
};

/**
 * DIVIDENDES des actions détenues — STRICTEMENT CEUX DU BOC.
 *
 * Le bulletin officiel porte, sur une même ligne, le montant net par action,
 * l'ex-dividende et la date de mise en paiement. C'est la publication de la
 * Bourse : rien à déduire, rien à estimer.
 *
 * SANS AVIS, PAS DE LIGNE. Une action dont le dividende n'est pas encore
 * annoncé ne produit aucun événement — et elle est remontée à part, pour que
 * son absence du calendrier se voie. Une ligne approximative se serait mêlée
 * aux montants contractuels et aurait fini par être lue comme une créance ;
 * une ligne absente, elle, se remarque.
 *
 * L'appariement se fait sur la RAISON SOCIALE, le BOC ne publiant pas de
 * mnémonique.
 */
function evenementsDividendes(
  detenues: Map<string, Detention>,
  aujourdhui: string,
): { evenements: EvenementEsv[]; sansAvis: string[]; nonRattaches: string[] } {
  const evenements: EvenementEsv[] = [];
  const sansAvis: string[] = [];
  if (detenues.size === 0) return { evenements, sansAvis, nonRattaches: [] };

  const actions = loadAllActions();
  const parCode = new Map(actions.map((a) => [cle(a.code), a]));

  // ── CHAQUE AVIS EST RATTACHÉ À UN MNÉMONIQUE, UNE FOIS ────────────────
  //
  // On résout dans ce sens — de l'avis vers le titre — et non l'inverse : il
  // y a une trentaine d'avis pour deux cents valeurs cotées, et c'est ainsi
  // qu'on peut dire ce qui n'a PAS été rattaché.
  //
  // Trois passes, de la plus sûre à la plus large : la table d'alias, puis
  // l'égalité exacte des noms, puis la couverture par mots. Une correspondance
  // AMBIGUË est rejetée — deux candidats valent zéro candidat, un dividende
  // attribué au mauvais titre étant bien pire qu'un dividende manquant.
  const avisParCode = new Map<string, ReturnType<typeof loadBocDividendes>[number]>();
  const nonRattaches: string[] = [];

  for (const avis of loadBocDividendes()) {
    const norme = normaliserNom(avis.titre);
    let code = ALIAS_AVIS_BOC[norme] ?? "";

    if (!code) {
      const exact = actions.filter((a) => normaliserNom(a.name) === norme);
      if (exact.length === 1) code = cle(exact[0].code);
    }
    if (!code) {
      const couverts = actions.filter((a) => nomCouvert(avis.titre, a.name));
      if (couverts.length === 1) code = cle(couverts[0].code);
      else if (couverts.length > 1) {
        nonRattaches.push(
          `${avis.titre} (avis ${avis.avis}) — ${couverts.length} titres possibles`,
        );
        continue;
      }
    }
    if (!code) {
      nonRattaches.push(`${avis.titre} (avis ${avis.avis}) — aucun titre reconnu`);
      continue;
    }

    // Le plus RÉCENT gagne : un avis rectificatif porte un numéro différent,
    // et c'est la dernière date de paiement publiée qui vaut.
    const deja = avisParCode.get(code);
    if (!deja || avis.datePaiement > deja.datePaiement) avisParCode.set(code, avis);
  }

  for (const [k, d] of detenues) {
    const a = parCode.get(k);
    const nomMarche = a?.name ?? d.libelle;
    const avis = avisParCode.get(k) ?? null;

    if (!avis) {
      sansAvis.push(`${k} — ${d.libelle || nomMarche}`);
      continue;
    }

    evenements.push({
      cle: cleEvenement(k, avis.datePaiement, "dividende"),
      nature: "dividende",
      date: avis.datePaiement,
      code: k,
      libelle: d.libelle || nomMarche,
      isin: d.isin || String(a?.isin ?? ""),
      instrument: "actions",
      quantite: d.quantite,
      montantParTitre: avis.montant,
      montantAttendu: avis.montant * d.quantite,
      source: "avis_boc",
      reserve:
        `Avis BOC n° ${avis.avis} du ${avis.datePublication} · ex-dividende le ` +
        `${avis.exDividende}` +
        (avis.exercice ? ` · exercice ${avis.exercice}` : "") +
        (avis.brut
          ? " · dividende BRUT : l'IRVM s'y applique — 10 % pour une personne " +
            "morale, l'encaissement sera donc inférieur si le fonds y est assujetti."
          : "") +
        // LA QUANTITÉ QUI COMPTE EST CELLE DU JOUR DU DÉTACHEMENT, pas celle
        // de l'inventaire. Tant que l'ex-dividende est devant, les deux
        // coïncideront sauf mouvement ; une fois passé, l'écart est possible
        // et il vaut mieux le dire que de le découvrir au pointage.
        (avis.exDividende < aujourdhui
          ? " · détachement passé : le montant suppose que la quantité n'a pas bougé depuis."
          : ""),
      reception: null,
    });
  }

  return { evenements, sansAvis, nonRattaches };
}

type LigneReception = {
  cle: string;
  date_reception: string;
  montant_recu: number | string;
  compte: string | null;
  note: string | null;
};

/** Pointages enregistrés, indexés par clef d'événement. */
const loadReceptions = cache(
  async (fundId: string): Promise<Map<string, Reception>> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("fund_security_event_receipts")
      .select("cle, date_reception, montant_recu, compte, note")
      .eq("fund_id", fundId);

    if (error) {
      console.error("[gestion-portefeuille] loadReceptions:", error.message);
      return new Map();
    }
    const out = new Map<string, Reception>();
    for (const l of (data ?? []) as unknown as LigneReception[]) {
      out.set(l.cle, {
        dateReception: l.date_reception,
        montantRecu: Number(l.montant_recu) || 0,
        compte: l.compte ?? "",
        note: l.note ?? "",
      });
    }
    return out;
  },
);

export type CalendrierEsv = {
  /** Tous les flux connus, du plus proche au plus lointain. */
  evenements: EvenementEsv[];
  /** Date de l'inventaire d'où sortent les quantités. */
  dateInventaire: string | null;
  /** Titres détenus dont aucun échéancier n'a été trouvé. Listés plutôt que
   *  tus : leur absence du calendrier est une information. */
  sansEcheancier: string[];
  /** Actions détenues sans avis de dividende au BOC. Le module ne devine
   *  rien : leur dividende n'apparaîtra qu'une fois l'avis publié, et d'ici
   *  là c'est cette liste qui dit pourquoi le calendrier est muet. */
  actionsSansAvis: string[];
  /** Avis du BOC qu'on n'a pas su rattacher à un titre de la cote.
   *
   *  C'est le SYMÉTRIQUE du précédent, et le plus important des deux : un avis
   *  orphelin est un dividende que la Bourse a publié et que le module a
   *  laissé tomber. Sans cette liste, il disparaissait en silence — et il n'y
   *  a pas d'avis d'opéré pour un encaissement qu'on n'attendait pas. */
  avisNonRattaches: string[];
};

/**
 * Le calendrier d'un fonds.
 *
 * MÉMOÏSÉ PAR REQUÊTE : l'écran ESV et le point de trésorerie le construisent
 * tous deux pendant le même rendu.
 */
export const construireCalendrierEsv = cache(
  async (fundId: string): Promise<CalendrierEsv> => {
    const [snapshots, receptions, fichesRef] = await Promise.all([
      loadFundPortfolios(fundId),
      loadReceptions(fundId),
      loadCustomSecurities(),
    ]);
    const actuel = snapshotDeReference(snapshots);
    if (!actuel) {
      return {
        evenements: [],
        dateInventaire: null,
        sansEcheancier: [],
        actionsSansAvis: [],
        avisNonRattaches: [],
      };
    }

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const parFiche = new Map(fichesRef.map((c) => [c.id, c]));
    const { actions, obligations, souverains, nonCotes } = detentions(actuel, parFiche);
    const souv = evenementsSouverains(souverains);
    const div = evenementsDividendes(actions, aujourdhui);
    const hors = evenementsNonCotes(nonCotes, parFiche);

    const evenements = [
      ...evenementsObligations(obligations),
      ...souv.evenements,
      ...div.evenements,
      ...hors.evenements,
    ]
      // LE POINTAGE SE RACCROCHE ICI, par la clef. C'est la seule chose que la
      // base porte : tout le reste vient d'être recalculé.
      .map((e) => ({ ...e, reception: receptions.get(e.cle) ?? null }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.libelle.localeCompare(b.libelle));

    return {
      evenements,
      dateInventaire: actuel.asOfDate,
      sansEcheancier: [...souv.sansEcheancier, ...hors.incompletes],
      actionsSansAvis: div.sansAvis,
      avisNonRattaches: div.nonRattaches,
    };
  },
);

/**
 * Montants par POSTE puis par COMPTE, pour le point de trésorerie.
 *
 * Même forme que les autres apports du point. NE COMPTENT QUE LES FLUX NON
 * ENCORE REÇUS : un coupon encaissé est déjà dans le solde bancaire saisi, et
 * l'y laisser le compterait deux fois. C'est le même lettrage que partout
 * ailleurs dans le module.
 *
 * `compte` est la colonne où les revenus tombent — le compte dépositaire du
 * fonds, puisque c'est lui qui les reçoit. Un pointage peut désigner un autre
 * compte, mais un flux pointé ne compte plus : la question ne se pose que pour
 * les flux à venir.
 */
export function agregerEsv(
  evenements: EvenementEsv[],
  compte: string,
  dateArrete: string | null,
): Map<string, Map<string, number>> {
  const parPoste = new Map<string, Map<string, number>>();
  if (!compte) return parPoste;

  for (const e of evenements) {
    if (e.reception) continue;
    // AVANT LE DÉBUT DU SUIVI, le flux a été encaissé et comptabilisé hors de
    // ce module : le porter au point l'aurait compté une seconde fois, et
    // vingt coupons d'une vieille OAT auraient gonflé le cash à recevoir de
    // montants depuis longtemps sur le compte.
    if (e.date < DEBUT_SUIVI) continue;
    // Au-delà de l'horizon de l'arrêté, le flux n'aura pas encore eu lieu.
    if (dateArrete && e.date > dateArrete) continue;
    const poste = POSTE_DE_NATURE[e.nature];
    let parCompte = parPoste.get(poste);
    if (!parCompte) {
      parCompte = new Map<string, number>();
      parPoste.set(poste, parCompte);
    }
    parCompte.set(compte, (parCompte.get(compte) ?? 0) + e.montantAttendu);
  }
  return parPoste;
}

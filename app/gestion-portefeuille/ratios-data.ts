import "server-only";

// === Ratios : confrontation de l'inventaire aux normes du fonds ===
//
// Reprend la feuille « Ratios » du Fichier de suivi NFD, bloc par bloc et dans
// son ordre. Sa mécanique tient en une ligne : une valorisation rapportée à
// l'ACTIF NET, comparée à une norme.
//
// L'ACTIF NET VIENT DE L'HISTORIQUE DE VL, jamais de la somme des positions.
// Un inventaire de titres ne porte ni les créances, ni les coupons à recevoir,
// ni les dettes du fonds : sur NSIA FONDS DIVERSIFIÉ au 16/09, l'écart
// atteignait 1,1 milliard — 3,3 % — et tous les ratios en sortaient gonflés
// d'autant. L'actif net importé, lui, se recoupe au franc près avec
// VL × nombre de parts. Le classeur fait le même choix : sa feuille rapporte
// chaque poste à « Actif net à J », qu'il distingue du total des classes.
//
// LES NORMES VIENNENT DU FONDS. Les seuils sont ceux saisis dans Paramètres ›
// Fonds ; le classeur, lui, les écrit en dur. Deux fonds dont la norme par
// émetteur diffère n'affichent donc pas le même verdict sur le même
// portefeuille.
//
// CE QUI NE SE CALCULE PAS SE DIT, avec sa raison. Un ratio affiché à zéro
// parce que la donnée manque est un ratio qu'on croira conforme.

import { loadFunds, type Fund } from "@/lib/fcp";
import { poidsIndiciels } from "./proposition-hypotheses";
import { normName } from "./portfolio-match";
import { loadFundPortfolios, loadCustomSecurities } from "./portfolio-data";
import { loadDernieresVl } from "./nav-data";
import type { CustomSecurity, PortfolioSection, SavedPosition } from "./portfolio-types";
import type { FundRecord } from "./types";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type StatutRatio =
  | "conforme"
  | "sous_minimum"
  | "au_dessus_maximum"
  /** Mesuré, mais aucune norme n'est paramétrée : il n'y a rien à respecter. */
  | "non_borne"
  /** Pas mesurable du tout — la donnée manque. */
  | "inconnu";

export type LigneRatio = {
  libelle: string;
  /** Précision de lecture : nature de l'émetteur, pays, gestionnaire… */
  detail: string | null;
  /** Numérateur. Null quand le ratio ne se calcule pas. */
  valeur: number | null;
  /** Ratio en pourcentage de l'assiette. */
  taux: number | null;
  seuilMin: number | null;
  seuilMax: number | null;
  statut: StatutRatio;
  obstacle: string | null;
  /** Ce qui compose le numérateur : un montant agrégé ne dit pas ce qu'il
   *  contient, et un dépassement inexpliqué ne se corrige pas. */
  composition: { libelle: string; valorisation: number }[];
};

export type BlocRatios = {
  titre: string;
  /** Ce que la colonne de gauche désigne : une classe, ou un émetteur. */
  entete: string;
  explication: string | null;
  lignes: LigneRatio[];
  /** Assiette du bloc, quand elle diffère de l'actif net. */
  noteAssiette: string | null;
};

export type TableauRatios = {
  fondsId: string;
  fondsNom: string;
  categorie: string;
  dateInventaire: string | null;
  /** Dénominateur des ratios : l'actif net IMPORTÉ avec la VL. */
  actifNet: number;
  dateActifNet: string | null;
  /** Somme des positions. Distincte de l'actif net, et affichée à côté. */
  totalActif: number;
  liquidites: number;
  blocs: BlocRatios[];
  avertissements: string[];
};

// ── Classification ────────────────────────────────────────────────────────

type Classe =
  | "Actions"
  | "Obligations et autres titres de créances"
  | "Instruments du marché monétaire"
  | "Titres de FCTC"
  | "Dépôts et investissements liquides"
  | "Parts d'OPC"
  | "Liquidités"
  | "Autres valeurs négociables";

type Poste = {
  p: SavedPosition;
  attrs: Record<string, string>;
  classe: Classe;
  valorisation: number;
};

/** Durée d'origine d'un titre, en jours. Null si les dates manquent. */
function dureeOrigine(attrs: Record<string, string>): number | null {
  const e = Date.parse(attrs.issueDate ?? "");
  const m = Date.parse(attrs.maturityDate ?? "");
  if (Number.isNaN(e) || Number.isNaN(m)) return null;
  return Math.round((m - e) / 86_400_000);
}

/**
 * Classe réglementaire d'une position.
 *
 * ON INTERROGE LE RÉFÉRENTIEL AVANT DE LIRE LE LIBELLÉ. Les lignes de
 * l'inventaire sont liées aux titres du site : leur fiche porte le secteur, la
 * date d'émission et l'échéance, qui disent la nature du titre bien mieux que
 * son nom. Se fier au texte seul rendait la classification otage de
 * l'orthographe d'un export — un fonds nommant ses bons autrement les aurait
 * vus comptés en obligations.
 *
 * Le libellé reste en dernier recours, pour les titres sans fiche : c'est un
 * filet, plus la règle.
 */
function classeDe(p: SavedPosition, attrs: Record<string, string>): Classe {
  const texte = `${attrs.nature ?? ""} ${attrs.categorie ?? ""} ${p.rawLabel} ${p.matchLabel}`
    .toLowerCase();

  // FCTC : fonds commun de titrisation de créances. Le référentiel le marque
  // parfois d'un secteur « Titrisation » ; quand il ne le fait pas, le nom du
  // titre le porte — c'est une mention réglementaire, pas une fantaisie de
  // rédaction.
  if (sansAccent(attrs.sector ?? "") === "titrisation") return "Titres de FCTC";
  if (/fctc|titrisation/.test(texte)) return "Titres de FCTC";

  switch (p.section as PortfolioSection) {
    case "action":
      return "Actions";
    case "obligation": {
      // MARCHÉ MONÉTAIRE : la durée D'ORIGINE tranche, pas la résiduelle. Un
      // bon du Trésor naît court ; une OAT dans sa dernière année reste une
      // obligation. Les deux dates viennent de la fiche du site.
      const duree = dureeOrigine(attrs);
      if (duree !== null && duree <= 366) return "Instruments du marché monétaire";
      // Filet pour les titres sans dates au référentiel.
      if (duree === null && /\bbat\b|bon du tresor|bon du trésor|monetaire|monétaire/.test(texte))
        return "Instruments du marché monétaire";
      return "Obligations et autres titres de créances";
    }
    case "opcvm":
      return "Parts d'OPC";
    case "dat":
      return "Dépôts et investissements liquides";
    case "tresorerie":
      return "Liquidités";
    default:
      return "Autres valeurs négociables";
  }
}

/** Accents et casse retirés : sert à comparer, jamais à afficher. */
const sansAccent = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * États de l'Union, reconnus dans un texte quelconque.
 *
 * DEUX SIGNATURES SEULEMENT : le nom du pays, et le mnémonique du Trésor
 * public (TPCI, TPBF…). PAS L'ISIN.
 *
 * L'ISIN y figurait, et c'était une faute : il porte le pays d'ÉMISSION, pas
 * la qualité de l'émetteur. Toute action ivoirienne s'appelle CI0000… comme
 * une OAT de Côte d'Ivoire — CIE CI, ORANGE CI, ECOBANK CI se retrouvaient
 * donc agrégées sous « État de Côte d'Ivoire », leur capitalisation comptée
 * dans la dette souveraine.
 *
 * Un mnémonique TP** ne souffre pas cette ambiguïté : il ne désigne qu'un
 * Trésor public.
 *
 * L'ordre compte : « Guinée Bissau » avant « Guinée » n'aurait pas d'objet
 * ici, mais la table sert aussi aux mnémoniques, où TPBF doit se lire avant
 * TPB. On range donc du plus spécifique au plus général.
 */
const ETATS: { nom: string; motifs: RegExp }[] = [
  { nom: "Côte d'Ivoire", motifs: /\bcote d ?ivoire\b|\btpci/ },
  { nom: "Burkina Faso", motifs: /\bburkina\b|\btpbf/ },
  { nom: "Guinée Bissau", motifs: /\bguinee bissau\b|\btpgb/ },
  { nom: "Sénégal", motifs: /\bsenegal\b|\btpsn/ },
  { nom: "Bénin", motifs: /\bbenin\b|\btpbn/ },
  { nom: "Mali", motifs: /\bmali\b|\btpml/ },
  { nom: "Niger", motifs: /\bniger\b|\btpne/ },
  { nom: "Togo", motifs: /\btogo\b|\btptg/ },
];

function etatDansLeTexte(texte: string): string | null {
  const t = sansAccent(texte).replace(/[’']/g, " ");
  return ETATS.find((e) => e.motifs.test(t))?.nom ?? null;
}

/**
 * Ce nom canonique désigne-t-il un État de l'UNION ?
 *
 * La question décide du PLAFOND : 35 % pour une signature souveraine de
 * l'Union (art. 41.4), 15 % pour tout autre émetteur (art. 41.1 a). Les
 * confondre, c'est soit crier au dépassement sur un État à 20 %, soit laisser
 * passer un émetteur privé à 30 %.
 *
 * La table des États ne contient que les huit de l'Union : un souverain hors
 * Union retombe donc, à juste titre, sous le régime commun.
 */
function estEtatDeLUnion(libelleCanonique: string): boolean {
  return (
    /^état de /i.test(libelleCanonique) && etatDansLeTexte(libelleCanonique) !== null
  );
}

/**
 * ÉMETTEUR d'une position, sous un nom CANONIQUE.
 *
 * Trois gisements, parce que l'inventaire nomme la même chose de trois façons :
 * une obligation porte son `issuer`, un dépôt sa `contrepartie` ou sa `banque`,
 * et une action ou un OPC n'a pas d'attribut émetteur — mais n'en a pas besoin,
 * le titre et son émetteur s'y confondent.
 *
 * UN ÉTAT SE NOMME PAR SON PAYS, jamais par l'orthographe de sa fiche. Le
 * référentiel écrit tour à tour « Etat de Côte d'Ivoire » et « État de Côte
 * d'Ivoire », « État de Mali » et « Etat du Mali » : l'accent et l'article
 * suffisaient à scinder un même émetteur en deux lignes, chacune sous le
 * plafond, et la limite par émetteur ne voyait jamais le cumul. Sur ce fonds,
 * la Côte d'Ivoire ressortait à 2,58 Md au lieu de 3,87.
 *
 * Quand la fiche ne dit rien — cela arrive —, le MNÉMONIQUE ou l'ISIN tranche :
 * TPCI, TPBF, CI0000…, ML0000… désignent sans ambiguïté un Trésor public.
 */
function emetteurDe(x: Poste): string {
  // 1. Un souverain, reconnu à son type : le pays fait foi.
  const type = sansAccent(x.attrs.issuerType ?? "");
  const pays = (x.attrs.country ?? "").trim();
  if (/etat|souverain|sukuk/.test(type) && pays) {
    return `État de ${pays}`;
  }

  const direct = (x.attrs.issuer ?? x.attrs.contrepartie ?? x.attrs.banque ?? "").trim();

  // 2. Un libellé « État de … » quelconque, ramené à son pays.
  if (direct) {
    if (/^[ée]tat\b/i.test(sansAccent(direct).replace(/^etat/, "état"))) {
      const e = etatDansLeTexte(direct);
      if (e) return `État de ${e}`;
    }
    return direct;
  }

  // 3. Rien sur la fiche : le mnémonique du Trésor désigne encore l'émetteur.
  //
  // RÉSERVÉ AUX TITRES DE CRÉANCE. Une action n'a pas d'attribut émetteur et
  // tombe donc ici ; or son libellé porte souvent un pays — « SOCIETE
  // IVOIRIENNE DE BANQUE COTE D'IVOIRE » — qui en ferait une signature
  // souveraine. Une action EST son propre émetteur : son libellé suffit.
  const dette =
    x.classe === "Obligations et autres titres de créances" ||
    x.classe === "Instruments du marché monétaire";
  if (dette) {
    const e = etatDansLeTexte(`${x.p.rawCode} ${x.p.rawLabel}`);
    if (e) return `État de ${e}`;
  }

  return x.p.rawLabel || x.p.matchLabel || x.p.rawCode || "—";
}

// ── Agrégation ────────────────────────────────────────────────────────────

/**
 * Verdict d'un ratio face à ses bornes.
 *
 * UN RATIO SANS BORNE N'EST PAS CONFORME, il est SANS BORNE. Répondre
 * « conforme » à une question qu'on n'a pas posée, c'est donner un feu vert
 * qui ne repose sur rien — et dissuader d'aller paramétrer la limite
 * manquante. Le cas se produit dès qu'une métrique n'a pas d'entrée sur la
 * fiche du fonds.
 */
function verdict(taux: number | null, min: number | null, max: number | null): StatutRatio {
  if (taux === null) return "inconnu";
  if (min === null && max === null) return "non_borne";
  if (min !== null && taux < min) return "sous_minimum";
  if (max !== null && taux > max) return "au_dessus_maximum";
  return "conforme";
}

const nb = (t: string | null | undefined): number | null => {
  const brut = (t ?? "").replace(",", ".").trim();
  if (brut === "") return null;
  const v = Number(brut);
  return Number.isFinite(v) ? v : null;
};

/**
 * Nom d'un OPC, débarrassé de son enveloppe juridique.
 *
 * « FCP UNITED CAPITAL SAPPHIRE » à l'inventaire, « UNITED CAPITAL SAPPHIRE »
 * au référentiel : le même fonds, écrit des deux façons. Sans ce décapage,
 * aucun OPC ne se rapprochait de son encours et la prise de contrôle sortait
 * systématiquement « non calculable ».
 */
function nomOpc(s: string): string {
  return normName(s.replace(/^\s*(fcpe|fcpr|fcp|sicav|opcvm)\s+/i, ""));
}

/**
 * ENCOURS DE L'OPC, à la dernière date connue avant l'arrêté.
 *
 * Les encours sont TRIMESTRIELS : ils viennent des publications des sociétés
 * de gestion. Les chercher à la date EXACTE de l'inventaire, comme le faisait
 * `aumAt`, ne trouvait jamais rien — un 16 septembre n'est pas une fin de
 * trimestre. On retient le dernier point publié à cette date-là, et on dit
 * lequel : un encours vieux d'un trimestre se lit autrement qu'un encours du
 * jour.
 */
function encoursOpc(f: Fund, dateRef: string): { date: string; aum: number } | null {
  let retenu: { date: string; aum: number } | null = null;
  for (const o of f.observations) {
    if (o.kind !== "quarter" || o.aum == null || o.date > dateRef) continue;
    if (!retenu || o.date > retenu.date) retenu = { date: o.date, aum: o.aum };
  }
  return retenu;
}

/**
 * GROUPES D'ÉMETTEURS, déduits du nom.
 *
 * L'article 41.5 plafonne le cumul par MAISON MÈRE : BOA CI, BOA Sénégal et
 * Bank of Africa Bénin sont trois émetteurs mais un seul groupe, et le risque
 * se cumule. Rien dans le référentiel ne portait ce rattachement.
 *
 * Plutôt que de le déclarer incalculable, on le DÉDUIT — et on dit qu'on l'a
 * déduit. Une déduction affichée comme telle se corrige ; une déduction
 * silencieuse se croit.
 *
 * La fiche du titre l'emporte toujours : le champ « Groupe émetteur » y est
 * désormais saisissable, et c'est là que se règlent les cas que cette table
 * ignore. Elle ne prétend pas être exhaustive, seulement utile tout de suite.
 */
const GROUPES_EMETTEURS: { groupe: string; motif: RegExp }[] = [
  { groupe: "Bank of Africa", motif: /\bboa\b|bank of africa/ },
  { groupe: "Ecobank", motif: /\becobank\b/ },
  { groupe: "Coris Bank International", motif: /\bcoris\b/ },
  { groupe: "Société Générale", motif: /societe generale|\bsgb\b|societe ivoirienne de banque/ },
  { groupe: "Oragroup", motif: /\bora(group|bank)\b/ },
  { groupe: "Orange", motif: /\borange\b|\bsonatel\b/ },
  { groupe: "NSIA", motif: /\bnsia\b/ },
  { groupe: "BNP Paribas", motif: /\bbici\b|bnp paribas/ },
  { groupe: "Attijariwafa Bank", motif: /attijari/ },
  { groupe: "TotalEnergies", motif: /\btotal\b/ },
  { groupe: "Vivo Energy", motif: /\bvivo\b/ },
  { groupe: "Eranove", motif: /\bcie\b|\bsode\b|eranove/ },
  { groupe: "Bolloré", motif: /bollore/ },
  { groupe: "CFAO", motif: /\bcfao\b/ },
  { groupe: "SIFCA", motif: /\bsifca\b|\bsaph\b|\bsogb\b|sucrivoire/ },
];

/**
 * Groupe d'un poste, et d'où il vient.
 *
 * `saisi` quand la fiche le porte, `déduit` quand la table l'a reconnu,
 * `seul` quand l'émetteur ne se rattache à rien de connu — il constitue alors
 * son propre groupe, ce qui est le cas le plus fréquent et parfaitement
 * légitime. Un État est toujours son propre groupe : une signature souveraine
 * n'a pas de maison mère.
 */
function groupeDe(x: Poste, emetteur: string): { nom: string; origine: "saisi" | "déduit" | "seul" } {
  const saisi = (x.attrs.groupe ?? "").trim();
  if (saisi) return { nom: saisi, origine: "saisi" };
  if (estEtatDeLUnion(emetteur)) return { nom: emetteur, origine: "seul" };
  const t = sansAccent(emetteur);
  const trouve = GROUPES_EMETTEURS.find((g) => g.motif.test(t));
  return trouve ? { nom: trouve.groupe, origine: "déduit" } : { nom: emetteur, origine: "seul" };
}


/**
 * SEUIL DE FORTE PONDÉRATION — article 41.3.
 *
 * Un titre pesant plus de dix pour cent de son indice échappe au plafond
 * commun de 15 % et peut aller jusqu'à 20 % de l'actif net. Sans cette
 * dérogation, aucun fonds de la place ne pourrait détenir SONATEL à hauteur de
 * son poids réel — 16 % du flottant BRVM — et le tableau l'aurait déclaré en
 * dépassement alors que la loi l'autorise.
 *
 * Le poids se lit avec la MÊME fonction que l'optimiseur de propositions :
 * deux mesures du même fait finiraient par diverger, et l'écran contredirait
 * alors les ordres qu'il a lui-même suggérés.
 */
const SEUIL_FORTE_PONDERATION = 0.1;

/** Poids indiciel le plus élevé parmi les titres d'un groupe. */
function poidsDuGroupe(postes: Poste[], poids: Map<string, number>): number | null {
  let max: number | null = null;
  for (const x of postes) {
    for (const code of [x.p.matchCode, x.p.rawCode]) {
      const w = poids.get((code ?? "").trim().toUpperCase());
      if (w !== undefined && (max === null || w > max)) max = w;
    }
  }
  return max;
}


/** Regroupe des postes par clef, du plus lourd au plus léger. */
function parClef(
  postes: Poste[],
  clef: (x: Poste) => string,
): { libelle: string; valorisation: number; postes: Poste[] }[] {
  const m = new Map<string, { valorisation: number; postes: Poste[] }>();
  for (const x of postes) {
    const k = clef(x);
    const e = m.get(k) ?? { valorisation: 0, postes: [] };
    e.valorisation += x.valorisation;
    e.postes.push(x);
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([libelle, e]) => ({ libelle, ...e }))
    .sort((a, b) => b.valorisation - a.valorisation);
}

export async function construireTableauRatios(fonds: FundRecord): Promise<TableauRatios> {
  const [snapshots, customs, navs] = await Promise.all([
    loadFundPortfolios(fonds.id),
    loadCustomSecurities(),
    // SEUL L'ACTIF NET LE PLUS RÉCENT nous intéresse — mais sa date dépend de
    // l'inventaire, qu'on ne connaît pas encore. On rapatrie donc les cinq
    // cents dernières valeurs en UN aller-retour, de quoi couvrir deux ans de
    // valorisation quotidienne, et on y cherche la bonne. L'historique entier
    // coûtait deux pages de mille lignes pour en lire une.
    loadDernieresVl(fonds.id, 500),
  ]);

  // Le slot « fin » d'abord, la date ensuite : les slots ne se saisissent pas
  // dans l'ordre chronologique, et prendre le plus récemment daté peut
  // désigner l'intermédiaire.
  const actuel =
    snapshots.find((s) => s.slot === "fin") ??
    [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).pop() ??
    null;

  const avertissements: string[] = [];
  if (!actuel) {
    avertissements.push(
      "Aucun inventaire importé pour ce fonds : aucun ratio ne peut être mesuré.",
    );
  }

  const custom = new Map(customs.map((c) => [c.id, c]));
  const postes: Poste[] = (actuel?.positions ?? []).map((p) => {
    const c: CustomSecurity | undefined = p.customSecurityId
      ? custom.get(p.customSecurityId)
      : undefined;
    const attrs = (c?.attributes ?? {}) as Record<string, string>;
    return { p, attrs, classe: classeDe(p, attrs), valorisation: num(p.valuation) };
  });

  const totalActif = postes.reduce((s, x) => s + x.valorisation, 0);
  const liquidites = postes
    .filter((x) => x.classe === "Liquidités")
    .reduce((s, x) => s + x.valorisation, 0);

  // Les VL arrivent de la plus récente à la plus ancienne : la première qui
  // précède l'inventaire est la bonne.
  const utilisable = (n: (typeof navs)[number]) =>
    n.actifNet != null && n.actifNet > 0 && (!actuel || n.date <= actuel.asOfDate);
  const jalon =
    navs.find(utilisable) ??
    // L'inventaire est plus ancien que les cinq cents dernières VL : on va
    // chercher la sienne. Un aller-retour de plus, sur un cas rare.
    (actuel ? (await loadDernieresVl(fonds.id, 1, actuel.asOfDate)).find(utilisable) : undefined);
  const actifNet = jalon?.actifNet ?? totalActif;

  if (!jalon && actuel) {
    avertissements.push(
      "Aucun actif net importé à cette date : les ratios se rapportent faute de mieux à la somme des positions, qui ignore créances et dettes.",
    );
  } else if (jalon && actuel && jalon.date !== actuel.asOfDate) {
    avertissements.push(
      `L'actif net retenu est celui du ${jalon.date}, faute de VL importée au ${actuel.asOfDate}.`,
    );
  }
  if (jalon && actifNet > 0 && Math.abs(totalActif - actifNet) / actifNet > 0.005) {
    avertissements.push(
      `L'inventaire (${Math.round(totalActif).toLocaleString("fr-FR")}) s'écarte de ` +
        `${Math.round(totalActif - actifNet).toLocaleString("fr-FR")} de l'actif net ` +
        `(${Math.round(actifNet).toLocaleString("fr-FR")}). Les ratios se rapportent à l'actif net.`,
    );
  }

  /**
   * Seuil saisi sur la fiche du fonds pour une métrique donnée.
   *
   * Plusieurs noms sont acceptés : renommer une métrique au catalogue ne doit
   * pas faire perdre le seuil d'un fonds enregistré sous l'ancien nom. La
   * fiche ne se resauvegarde qu'au prochain passage dans les paramètres.
   */
  const seuil = (...metriques: string[]) => {
    // L'ORDRE EST CELUI DE L'APPELANT, pas celui de la base.
    //
    // Chercher « la première ligne du fonds dont la métrique figure dans la
    // liste » rendait la priorité au hasard du stockage : pour un État, la
    // liste demande l'art. 41.4 (35 %) avant l'art. 41.1 a (15 %), mais le
    // catalogue range le second en premier — et tous les États ressortaient
    // plafonnés à 15 %. On parcourt donc les métriques DANS L'ORDRE DEMANDÉ,
    // et la première trouvée gagne.
    for (const m of metriques) {
      const r = (fonds.ratios ?? []).find((x) => x.metrique === m);
      if (r) return { min: nb(r.seuilMin), max: nb(r.seuilMax) };
    }
    return { min: null, max: null };
  };

  const part = (v: number) => (actifNet > 0 ? (v / actifNet) * 100 : null);

  /** Ligne bâtie sur une ou plusieurs classes. */
  const ligneClasse = (
    libelle: string,
    classes: Classe[],
    metriques: string[],
    detail: string | null = null,
  ): LigneRatio => {
    const retenus = postes.filter((x) => classes.includes(x.classe));
    const valeur = retenus.reduce((s, x) => s + x.valorisation, 0);
    const taux = part(valeur);
    const { min, max } = seuil(...metriques);
    return {
      libelle,
      detail,
      valeur,
      taux,
      seuilMin: min,
      seuilMax: max,
      statut: verdict(taux, min, max),
      obstacle: null,
      composition: parClef(retenus, (x) => x.p.rawLabel || x.p.rawCode).map((g) => ({
        libelle: g.libelle,
        valorisation: g.valorisation,
      })),
    };
  };

  // ── 1. Ratios réglementaires ────────────────────────────────────────────
  const AUTRES_CLASSES: Classe[] = [
    "Obligations et autres titres de créances",
    "Instruments du marché monétaire",
    "Titres de FCTC",
    "Parts d'OPC",
  ];

  const reglementaires: BlocRatios = {
    titre: "Ratios réglementaires",
    entete: "Indicateur",
    explication: null,
    noteAssiette: null,
    lignes: [
      // L'EXPOSITION ACTIONS N'A PAS LA MÊME NORME SELON LE FONDS. Un fonds
      // Actions ou Obligataire a sa propre entrée (art. 18.2 et 18.3) ; un
      // fonds Diversifié n'en a pas, et c'est l'article 18.5 qui la plafonne —
      // le même 70 % que les autres classes. On interroge donc les deux, dans
      // cet ordre, plutôt que de laisser la ligne sans borne.
      ligneClasse("Exposition actions", ["Actions"], [
        "Total Actions",
        "Actions ou Obligations — la plus élevée",
        "Total Actions + Obligations",
      ]),
      ligneClasse(
        "Exposition — somme des autres classes",
        AUTRES_CLASSES,
        // L'ancien nom reste accepté : un fonds enregistré avant le
        // renommage garde son seuil jusqu'à sa prochaine sauvegarde.
        [
          "Obligations, MM, OPCVM ou FCTC — la plus élevée",
          "Total Obligations + MM + OPCVM + FCTC",
        ],
        "Obligations · IMM · FCTC · OPC",
      ),
      ligneClasse(
        "Autres valeurs négociables",
        ["Autres valeurs négociables"],
        ["Total VM/IMM non éligibles"],
      ),
    ],
  };

  // ── 2. Ratios contractuels ──────────────────────────────────────────────
  //
  // « Produits de taux » RASSEMBLE tout ce qui porte un taux — obligations,
  // marché monétaire, dépôts à terme et FCTC. Le classeur fait de même : sa
  // cellule ajoute explicitement les dépôts à la somme des titres de taux.
  const contractuels: BlocRatios = {
    titre: "Ratios contractuels",
    entete: "Classe d'actif",
    explication: null,
    noteAssiette: null,
    lignes: [
      ligneClasse(
        "Produits de taux",
        [
          "Obligations et autres titres de créances",
          "Instruments du marché monétaire",
          "Dépôts et investissements liquides",
          "Titres de FCTC",
        ],
        ["Obligations et autres titres de créances"],
        "Obligations · IMM · DAT · FCTC",
      ),
      ligneClasse("Actions", ["Actions"], ["Actions"]),
      ligneClasse("Parts d'OPC", ["Parts d'OPC"], ["Parts d'OPC"]),
      ligneClasse(
        "Dépôts à terme",
        ["Dépôts et investissements liquides"],
        ["Dépôts et investissements liquides"],
      ),
      ligneClasse("Liquidités", ["Liquidités"], ["Liquidités"]),
      ligneClasse(
        "Autres valeurs mobilières",
        ["Autres valeurs négociables"],
        ["Total VM/IMM non éligibles"],
      ),
    ],
  };

  /** Bloc de diversification : les N premiers d'un regroupement. */
  const blocDiversification = (
    titre: string,
    entete: string,
    explication: string,
    retenus: Poste[],
    /** Métriques à interroger POUR UNE LIGNE DONNÉE : le plafond d'un État
     *  n'est pas celui d'un émetteur privé. */
    metriquesDe: (libelle: string, postes: Poste[]) => string[],
    combien: number,
    detailDe: (libelle: string, postes: Poste[]) => string | null,
  ): BlocRatios => {
    const groupes = parClef(retenus, emetteurDe).slice(0, combien);
    return {
      titre,
      entete,
      explication,
      noteAssiette: null,
      lignes: groupes.map((g) => {
        const taux = part(g.valorisation);
        const { min, max } = seuil(...metriquesDe(g.libelle, g.postes));
        return {
          libelle: g.libelle,
          detail: detailDe(g.libelle, g.postes),
          valeur: g.valorisation,
          taux,
          seuilMin: min,
          seuilMax: max,
          statut: verdict(taux, min, max),
          obstacle: null,
          composition: g.postes
            .map((x) => ({
              libelle: x.p.rawLabel || x.p.rawCode,
              valorisation: x.valorisation,
            }))
            .sort((a, b) => b.valorisation - a.valorisation),
        };
      }),
    };
  };

  // ── 3. Diversification émetteurs titres ─────────────────────────────────
  // Poids indiciels, lus une fois : ils décident de la dérogation de
  // l'article 41.3 sur chaque ligne du bloc émetteurs.
  const poids = poidsIndiciels();

  const TITRES: Classe[] = [
    "Actions",
    "Obligations et autres titres de créances",
    "Instruments du marché monétaire",
    "Titres de FCTC",
    "Parts d'OPC",
  ];
  const emetteursTitres = blocDiversification(
    "Diversification émetteurs titres — 15 premiers",
    "Émetteur",
    "Une action ou un OPC se confond avec son émetteur ; une obligation porte le sien au référentiel.",
    postes.filter((x) => TITRES.includes(x.classe)),
    // TROIS RÉGIMES, CHOISIS LIGNE PAR LIGNE :
    //   un État de l'Union            → 35 % (art. 41.4)
    //   un titre à forte pondération  → 20 % (art. 41.3)
    //   tout autre émetteur           → 15 % (art. 41.1 a)
    //
    // Sans le deuxième, SONATEL — 16 % du flottant BRVM — serait déclaré en
    // dépassement dès 15 % de l'actif net, alors que la loi l'autorise à 20.
    (libelle, ps) =>
      estEtatDeLUnion(libelle)
        ? ["Titres souverains par émetteur", "VM/IMM par émetteur"]
        : (poidsDuGroupe(ps, poids) ?? 0) > SEUIL_FORTE_PONDERATION
          ? ["Titre à forte pondération indicielle", "VM/IMM par émetteur"]
          : ["VM/IMM par émetteur"],
    15,
    (libelle, ps) => {
      if (estEtatDeLUnion(libelle)) return "Souverain UEMOA · art. 41.4";
      const w = poidsDuGroupe(ps, poids);
      if (w !== null && w > SEUIL_FORTE_PONDERATION) {
        return `Forte pondération · ${(w * 100).toFixed(1)} % de l'indice · art. 41.3`;
      }
      return ps[0]?.attrs.issuerType || ps[0]?.attrs.country || null;
    },
  );

  // ── 4. Diversification émetteurs dépôts ─────────────────────────────────
  //
  // Dépôts À TERME et comptes : les deux sont des créances sur un
  // établissement, et le classeur les traite ensemble — sa liste mêle banques
  // et opérateurs de monnaie électronique.
  const emetteursDepots = blocDiversification(
    "Diversification émetteurs dépôts — 10 premiers",
    "Établissement",
    "Dépôts à terme et comptes : deux formes d'une même créance sur un établissement.",
    postes.filter(
      (x) => x.classe === "Dépôts et investissements liquides" || x.classe === "Liquidités",
    ),
    () => ["Dépôts par émetteur"],
    10,
    (_libelle, ps) => ps[0]?.attrs.pays || null,
  );

  // ── 5. Diversification émetteurs groupés ────────────────────────────────
  //
  // L'article 41.5 plafonne le cumul par MAISON MÈRE. Rien ne portait ce
  // rattachement au référentiel : le bloc sortait « non calculable ».
  //
  // Il se calcule désormais, et la source du rattachement est DITE ligne par
  // ligne — saisi sur la fiche, déduit du nom, ou émetteur isolé. Une
  // déduction affichée comme telle se corrige ; une déduction silencieuse se
  // croit. Le champ « Groupe émetteur » de la fiche l'emporte toujours.
  const { min: minGroupe, max: maxGroupe } = seuil("Cumul par groupe (VM + IMM)");
  const postesTitres = postes.filter((x) => TITRES.includes(x.classe));
  const parGroupe = new Map<
    string,
    { valorisation: number; postes: Poste[]; origines: Set<string> }
  >();
  for (const x of postesTitres) {
    const g = groupeDe(x, emetteurDe(x));
    const e = parGroupe.get(g.nom) ?? {
      valorisation: 0,
      postes: [],
      origines: new Set<string>(),
    };
    e.valorisation += x.valorisation;
    e.postes.push(x);
    e.origines.add(g.origine);
    parGroupe.set(g.nom, e);
  }

  const deduits = [...parGroupe.values()].filter((e) => e.origines.has("déduit")).length;
  // LES ÉMETTEURS ISOLÉS SONT LA ZONE D'OMBRE de ce bloc. La table de
  // déduction a été bâtie sur les groupes d'un portefeuille ; un autre fonds
  // détiendra des émetteurs qu'elle ignore, et ceux-là ressortiront seuls —
  // donc sous leur vrai cumul, dans le sens qui rassure à tort. On les compte,
  // pour que le trésorier sache combien de lignes reposent sur rien.
  const isoles = [...parGroupe.values()].filter(
    (e) => !e.origines.has("saisi") && !e.origines.has("déduit"),
  ).length;

  const emetteursGroupes: BlocRatios = {
    titre: "Diversification émetteurs groupés — 15 premiers",
    entete: "Groupe",
    explication:
      "Cumul par maison mère : BOA CI, BOA Sénégal et Bank of Africa BN sont trois émetteurs mais un seul groupe." +
      (deduits > 0
        ? ` ${deduits} groupe${deduits > 1 ? "s" : ""} déduit${
            deduits > 1 ? "s" : ""
          } du nom — à confirmer sur la fiche du titre, champ « Groupe émetteur ».`
        : "") +
      (isoles > 0
        ? ` ${isoles} émetteur${isoles > 1 ? "s" : ""} sans groupe connu — si l'un d'eux appartient à une maison mère, renseigne-la sur sa fiche.`
        : ""),
    noteAssiette: null,
    lignes: [...parGroupe.entries()]
      .sort((a, b) => b[1].valorisation - a[1].valorisation)
      .slice(0, 15)
      .map(([nom, e]) => {
        const taux = part(e.valorisation);
        // Un groupe d'un seul émetteur n'apprend rien de plus que le bloc
        // précédent : on le signale, pour que l'attention aille aux vrais
        // regroupements.
        const origine = e.origines.has("saisi")
          ? "rattachement saisi"
          : e.origines.has("déduit")
            ? "groupe déduit du nom"
            : "émetteur isolé";
        return {
          libelle: nom,
          detail: `${e.postes.length} ligne${e.postes.length > 1 ? "s" : ""} · ${origine}`,
          valeur: e.valorisation,
          taux,
          seuilMin: minGroupe,
          seuilMax: maxGroupe,
          statut: verdict(taux, minGroupe, maxGroupe),
          obstacle: null,
          composition: e.postes
            .map((x) => ({
              libelle: x.p.rawLabel || x.p.rawCode,
              valorisation: x.valorisation,
            }))
            .sort((a, b) => b.valorisation - a.valorisation),
        };
      }),
  };

  // ── 6. Prise de contrôle des FCP ────────────────────────────────────────
  //
  // Part DÉTENUE d'un OPC : la position du fonds rapportée à l'ACTIF NET DE
  // CET OPC, pas au sien. L'encours vient du référentiel FCP du site, celui
  // que le BOC alimente. Un OPC qu'il ne connaît pas sort « non calculable » —
  // le rapporter à autre chose donnerait un pourcentage sans signification.
  const { min: minOpc, max: maxOpc } = seuil("Parts détenues d'un OPC");
  // DEUX CLEFS PAR FONDS : son nom tel quel, et son nom sans son enveloppe
  // juridique. L'inventaire écrit « FCP X », le référentiel « X » — ou
  // l'inverse.
  const parId = new Map<string, Fund>();
  const parNom = new Map<string, Fund>();
  for (const f of loadFunds()) {
    parId.set(f.id, f);
    for (const k of [normName(f.nom), nomOpc(f.nom)]) {
      if (k && !parNom.has(k)) parNom.set(k, f);
    }
  }
  const dateRef = actuel?.asOfDate ?? new Date().toISOString().slice(0, 10);

  const priseDeControle: BlocRatios = {
    titre: "Prise de contrôle des FCP",
    entete: "OPC détenu",
    explication:
      "La position rapportée à l'actif net de l'OPC détenu — pas à celui du fonds.",
    noteAssiette: "Assiette : l'actif net de chaque OPC détenu.",
    lignes: parClef(
      postes.filter((x) => x.classe === "Parts d'OPC"),
      (x) => x.p.rawLabel || x.p.matchLabel || x.p.rawCode,
    ).map((g) => {
      // LE LIEN DU RÉFÉRENTIEL FAIT AUTORITÉ.
      //
      // Chaque fiche d'OPC porte un `refId` : le gérant a DÉJÀ désigné le
      // fonds du site auquel elle correspond. Le rapprochement par nom ne
      // sert que de repli — il déclarait « absent du référentiel » des OPC
      // explicitement liés, au seul motif que leur libellé diffère.
      const refId = g.postes.find((x) => x.attrs.refId)?.attrs.refId ?? "";
      const f =
        (refId ? parId.get(refId) : undefined) ??
        parNom.get(normName(g.libelle)) ??
        parNom.get(nomOpc(g.libelle));
      const encours = f ? encoursOpc(f, dateRef) : null;
      const taux =
        encours && encours.aum > 0 ? (g.valorisation / encours.aum) * 100 : null;
      return {
        libelle: g.libelle,
        detail:
          f && encours
            ? `${f.nom !== g.libelle ? `lié à ${f.nom} · ` : ""}${
                f.gestionnaire
              } · encours ${Math.round(encours.aum).toLocaleString(
                "fr-FR",
              )} au ${encours.date}`
            : null,
        valeur: g.valorisation,
        taux,
        seuilMin: minOpc,
        seuilMax: maxOpc,
        statut: verdict(taux, minOpc, maxOpc),
        obstacle:
          taux === null
            ? f
              ? "Aucun encours publié pour cet OPC avant cette date."
              : "OPC absent du référentiel FCP du site : son actif net est inconnu."
            : null,
        composition: [],
      };
    }),
  };

  return {
    fondsId: fonds.id,
    fondsNom: fonds.nom,
    categorie: fonds.categorie,
    dateInventaire: actuel?.asOfDate ?? null,
    actifNet,
    dateActifNet: jalon?.date ?? null,
    totalActif,
    liquidites,
    blocs: [
      reglementaires,
      contractuels,
      emetteursTitres,
      emetteursDepots,
      emetteursGroupes,
      priseDeControle,
    ],
    avertissements,
  };
}

/** Un seul écart suffit à rendre un fonds non conforme. */
export function ecarts(t: TableauRatios): { bloc: string; ligne: LigneRatio }[] {
  return t.blocs.flatMap((b) =>
    b.lignes
      .filter((l) => l.statut === "sous_minimum" || l.statut === "au_dessus_maximum")
      .map((ligne) => ({ bloc: b.titre, ligne })),
  );
}

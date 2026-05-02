// === CATALOGUE DE FORMATIONS AZIMUTFINANCE ===
//
// Catalogue statique : 14 formations couvrant la BRVM, les obligations
// UMOA-Titres, l'analyse fondamentale et technique, la macro UEMOA, la
// gestion de portefeuille et la pratique (ouverture de compte, fiscalite).
//
// Toutes les formations sont indexees par slug (URL-safe). Les modules
// sont representes en interne pour permettre l'affichage du programme
// sur la page detail et la duree totale.

export type FormationLevel = "debutant" | "intermediaire" | "avance";

export type FormationFormat = "cours" | "atelier" | "certifiant";

export type FormationCategory =
  | "bourse"
  | "obligations"
  | "analyse"
  | "macro"
  | "portefeuille"
  | "pratique";

export type FormationPricing =
  | { type: "gratuit" }
  | { type: "premium"; priceFcfa: number }
  | { type: "certifiant"; priceFcfa: number };

export type FormationModule = {
  title: string;
  durationMinutes: number;
  /** Prévisualisable gratuitement avant achat */
  preview?: boolean;
};

export type Formation = {
  slug: string;
  title: string;
  /** Description courte (≤ 200 caractères) pour la card */
  shortDescription: string;
  /** Description longue (markdown léger autorisé) pour la page détail */
  longDescription: string;
  level: FormationLevel;
  format: FormationFormat;
  category: FormationCategory;
  /** Modules / chapitres */
  modules: FormationModule[];
  /** Prérequis humains (savoir lire un graphique, etc.) */
  prerequisites: string[];
  /** Ce que l'apprenant saura faire à la fin */
  outcomes: string[];
  pricing: FormationPricing;
  /** Tags libres pour affinage et recherche */
  tags: string[];
  /** Couleur d'accent (hex) — alignée sur la catégorie par défaut */
  accentColor?: string;
  /** Formateur principal */
  instructor?: { name: string; title: string };
  /** Si la formation est mise en avant en hero */
  featured?: boolean;
  /** Date de mise à jour ISO */
  updatedAt: string;
};

// =============================================================================
// METADATA CATEGORIES
// =============================================================================

export const CATEGORY_META: Record<
  FormationCategory,
  { label: string; description: string; color: string }
> = {
  bourse: {
    label: "Bourse & BRVM",
    description: "Marché actions, fonctionnement de la BRVM, séances et carnet d'ordres",
    color: "#1d4ed8",
  },
  obligations: {
    label: "Obligations & Souverains",
    description: "Marché obligataire, OAT, BAT, UMOA-Titres, YTM et duration",
    color: "#b45309",
  },
  analyse: {
    label: "Analyse fondamentale & technique",
    description: "Lire un bilan, ratios financiers, chartisme et indicateurs",
    color: "#7c3aed",
  },
  macro: {
    label: "Macroéconomie UEMOA",
    description: "BCEAO, inflation, taux directeurs, matières premières, FCFA",
    color: "#059669",
  },
  portefeuille: {
    label: "Gestion de portefeuille",
    description: "Allocation, diversification, gestion du risque, FCP / OPCVM",
    color: "#be185d",
  },
  pratique: {
    label: "Pratique & premiers pas",
    description: "Ouvrir un compte, passer un ordre, fiscalité des plus-values",
    color: "#475569",
  },
};

export const LEVEL_META: Record<FormationLevel, { label: string; color: string }> = {
  debutant: { label: "Débutant", color: "#16a34a" },
  intermediaire: { label: "Intermédiaire", color: "#2563eb" },
  avance: { label: "Avancé", color: "#9333ea" },
};

export const FORMAT_META: Record<FormationFormat, { label: string }> = {
  cours: { label: "Cours en ligne" },
  atelier: { label: "Atelier live" },
  certifiant: { label: "Certifiant" },
};

// =============================================================================
// CATALOGUE
// =============================================================================

export const FORMATIONS: Formation[] = [
  // ---------- BOURSE / DEBUTANT ----------
  {
    slug: "initiation-brvm",
    title: "Initiation à la BRVM",
    shortDescription:
      "Comprendre le rôle, le fonctionnement et la fiche d'identité de la Bourse Régionale des Valeurs Mobilières.",
    longDescription:
      "Une mise à niveau complète et accessible pour tout investisseur qui aborde la BRVM pour la première fois. On part de l'historique de la création (1998) jusqu'aux séances modernes : cotation au fixing, statut UEMOA, organes de tutelle (CREPMF), rôle des SGI, indices BRVM Composite et BRVM 30.",
    level: "debutant",
    format: "cours",
    category: "bourse",
    modules: [
      { title: "Histoire et mission de la BRVM", durationMinutes: 25, preview: true },
      { title: "Architecture institutionnelle (CREPMF, DC/BR, SGI)", durationMinutes: 30 },
      { title: "Indices BRVM Composite, BRVM 30, BRVM Prestige", durationMinutes: 20 },
      { title: "Séance type, fixing et carnet d'ordres", durationMinutes: 35 },
      { title: "Lecture d'un cours et d'un graphique", durationMinutes: 30 },
      { title: "Quiz de validation", durationMinutes: 20 },
    ],
    prerequisites: ["Aucun prérequis financier"],
    outcomes: [
      "Décrire le fonctionnement quotidien de la BRVM",
      "Identifier les acteurs clés et leur rôle",
      "Lire un cours, comprendre un indice",
    ],
    pricing: { type: "gratuit" },
    tags: ["BRVM", "actions", "fondamentaux", "débutant"],
    instructor: { name: "AzimutFinance", title: "Équipe pédagogique" },
    featured: true,
    updatedAt: "2026-04-15",
  },

  {
    slug: "premier-ordre-brvm",
    title: "Passer son premier ordre en bourse",
    shortDescription:
      "Du choix de la SGI à la passation d'un ordre limite — un guide pratique pas-à-pas.",
    longDescription:
      "Un atelier orienté action : ouvrir un compte titres, déposer son chèque, transmettre un ordre, lire la confirmation d'exécution. On compare les principales SGI agréées et leurs frais. Cas concret avec un ordre sur SGBC ou SONATEL.",
    level: "debutant",
    format: "atelier",
    category: "pratique",
    modules: [
      { title: "Choisir sa SGI : critères et frais", durationMinutes: 25, preview: true },
      { title: "Documents pour l'ouverture de compte titres", durationMinutes: 15 },
      { title: "Anatomie d'un ordre (limite, marché, validité)", durationMinutes: 20 },
      { title: "Atelier live : passation d'un ordre fictif", durationMinutes: 45 },
      { title: "Frais de transaction, taxes, lecture du relevé", durationMinutes: 20 },
    ],
    prerequisites: ["Avoir suivi Initiation à la BRVM (recommandé)"],
    outcomes: [
      "Ouvrir un compte titres en autonomie",
      "Comparer 3 SGI et choisir selon ses besoins",
      "Passer un ordre limite et le suivre jusqu'à exécution",
    ],
    pricing: { type: "premium", priceFcfa: 25_000 },
    tags: ["pratique", "SGI", "compte titres", "ordre"],
    updatedAt: "2026-03-20",
  },

  // ---------- OBLIGATIONS ----------
  {
    slug: "marche-obligataire-uemoa",
    title: "Le marché obligataire UEMOA",
    shortDescription:
      "Distinguer obligations cotées BRVM, souverains UMOA-Titres et corporates. Lire une fiche d'émission.",
    longDescription:
      "Tour d'horizon complet du marché obligataire de la zone : segmentation, agents, calendrier d'émission. On apprend à lire une fiche d'émission souveraine (TPE, BAT, OAT) et à comparer une obligation cotée à son équivalent souverain. Cas pratique sur l'émission Sénégal 2025.",
    level: "intermediaire",
    format: "cours",
    category: "obligations",
    modules: [
      { title: "Architecture du marché obligataire UEMOA", durationMinutes: 30, preview: true },
      { title: "UMOA-Titres : OAT, BAT, TPE", durationMinutes: 35 },
      { title: "Obligations cotées BRVM (souverains, corporates)", durationMinutes: 30 },
      { title: "Lecture d'une fiche d'émission", durationMinutes: 25 },
      { title: "Cas pratique : Sénégal vs Côte d'Ivoire", durationMinutes: 40 },
      { title: "Quiz et synthèse", durationMinutes: 20 },
    ],
    prerequisites: ["Notions de base en finance (intérêt simple, capitalisation)"],
    outcomes: [
      "Identifier les types d'obligations disponibles dans l'UEMOA",
      "Lire une fiche d'émission et en extraire les paramètres clés",
      "Comparer souverains vs corporates",
    ],
    pricing: { type: "premium", priceFcfa: 35_000 },
    tags: ["obligations", "souverains", "UMOA-Titres", "OAT", "BAT"],
    instructor: { name: "AzimutFinance", title: "Équipe pédagogique" },
    featured: true,
    updatedAt: "2026-04-02",
  },

  {
    slug: "ytm-duration-sensibilite",
    title: "YTM, duration et sensibilité",
    shortDescription:
      "Maîtriser les 3 métriques actuarielles incontournables pour évaluer une obligation et son risque de taux.",
    longDescription:
      "Cours technique pour lecteurs sérieux : on dérive le YTM par bisection, on calcule la duration de Macaulay, la duration modifiée et la convexité, puis on les utilise pour estimer la variation du prix face à un mouvement de courbe. Exemples sur OAT BENIN 6,5% 2030 et CI.O 5,9% 2027.",
    level: "avance",
    format: "cours",
    category: "obligations",
    modules: [
      { title: "Rappel : actualisation et conventions Act/365", durationMinutes: 25 },
      { title: "YTM : définition et résolution numérique", durationMinutes: 35, preview: true },
      { title: "Duration de Macaulay et duration modifiée", durationMinutes: 35 },
      { title: "Convexité et approximation du second ordre", durationMinutes: 30 },
      { title: "Calculs sur OAT BENIN et CI.O", durationMinutes: 45 },
      { title: "Atelier : impact d'un choc de 100 bps sur un portefeuille", durationMinutes: 40 },
    ],
    prerequisites: [
      "Avoir suivi Le marché obligataire UEMOA",
      "À l'aise avec Excel ou un tableur",
    ],
    outcomes: [
      "Calculer un YTM à la main et avec Excel",
      "Mesurer la sensibilité d'un portefeuille obligataire",
      "Interpréter une duration en termes de risque de taux",
    ],
    pricing: { type: "premium", priceFcfa: 45_000 },
    tags: ["YTM", "duration", "sensibilité", "obligations", "risque de taux"],
    updatedAt: "2026-04-10",
  },

  // ---------- ANALYSE ----------
  {
    slug: "analyse-fondamentale-action",
    title: "Analyse fondamentale d'une action BRVM",
    shortDescription:
      "Méthode complète pour valoriser une société cotée : du bilan au DCF, en passant par les comparables.",
    longDescription:
      "Construire sa propre opinion sur une valeur cotée. On part des états financiers (bilan, compte de résultat, flux de trésorerie), on calcule les ratios de référence (ROE, ROCE, dette nette/EBITDA), puis on applique trois méthodes de valorisation : DCF, comparables boursiers et transactions. Cas pratique : SONATEL.",
    level: "intermediaire",
    format: "cours",
    category: "analyse",
    modules: [
      { title: "Lire un bilan IFRS / SYSCOHADA", durationMinutes: 40, preview: true },
      { title: "Compte de résultat et soldes intermédiaires", durationMinutes: 30 },
      { title: "Tableau des flux de trésorerie", durationMinutes: 30 },
      { title: "Ratios clés (ROE, ROCE, dette nette/EBITDA)", durationMinutes: 35 },
      { title: "DCF : étapes, hypothèses, taux d'actualisation", durationMinutes: 50 },
      { title: "Comparables boursiers (P/E, EV/EBITDA)", durationMinutes: 30 },
      { title: "Cas pratique : valoriser SONATEL", durationMinutes: 60 },
    ],
    prerequisites: ["Notions de comptabilité générale"],
    outcomes: [
      "Lire et interpréter les états financiers d'une société BRVM",
      "Construire un DCF simple et le challenger",
      "Justifier une recommandation Achat / Conserver / Vendre",
    ],
    pricing: { type: "premium", priceFcfa: 55_000 },
    tags: ["analyse fondamentale", "valorisation", "DCF", "ratios"],
    instructor: { name: "AzimutFinance", title: "Pôle recherche actions" },
    updatedAt: "2026-03-28",
  },

  {
    slug: "analyse-technique-chartisme",
    title: "Analyse technique : chartisme et indicateurs",
    shortDescription:
      "Identifier les figures classiques (têtes-épaules, double-creux), maîtriser RSI, MACD et moyennes mobiles.",
    longDescription:
      "Pour ceux qui veulent compléter l'analyse fondamentale par des signaux techniques. On apprend à lire un chandelier japonais, à identifier les supports/résistances, à mesurer la qualité d'une tendance via les moyennes mobiles, et à interpréter RSI, MACD et Bollinger. Limites assumées sur la BRVM (faible liquidité = bruit important).",
    level: "intermediaire",
    format: "cours",
    category: "analyse",
    modules: [
      { title: "Chandeliers japonais et patterns de base", durationMinutes: 30, preview: true },
      { title: "Supports, résistances, lignes de tendance", durationMinutes: 30 },
      { title: "Figures chartistes : têtes-épaules, double-fond, triangle", durationMinutes: 40 },
      { title: "Moyennes mobiles MM20, MM50, MM200", durationMinutes: 25 },
      { title: "Indicateurs : RSI, MACD, Bollinger", durationMinutes: 40 },
      { title: "Limites sur les valeurs peu liquides", durationMinutes: 20 },
      { title: "Atelier : analyse d'une valeur du BRVM 30", durationMinutes: 45 },
    ],
    prerequisites: ["Avoir suivi Initiation à la BRVM"],
    outcomes: [
      "Identifier 5 figures chartistes classiques",
      "Configurer RSI/MACD/Bollinger sur un graphique",
      "Combiner technique et fondamental",
    ],
    pricing: { type: "premium", priceFcfa: 35_000 },
    tags: ["analyse technique", "chartisme", "RSI", "MACD"],
    updatedAt: "2026-03-15",
  },

  // ---------- MACRO ----------
  {
    slug: "macro-uemoa-bceao",
    title: "Macro UEMOA : BCEAO, taux directeurs, change",
    shortDescription:
      "Décrypter les décisions de la BCEAO et leurs impacts sur la BRVM, le marché monétaire et les obligations.",
    longDescription:
      "Comprendre la politique monétaire de l'UEMOA : taux directeurs, refinancement, réserves obligatoires. On suit la chaîne de transmission jusqu'aux taux interbancaires, aux émissions souveraines et aux indices boursiers. Le rôle pivot du peg EUR/XOF est explicité. Décodage des derniers communiqués CPM.",
    level: "intermediaire",
    format: "cours",
    category: "macro",
    modules: [
      { title: "Mandat et organes de la BCEAO", durationMinutes: 25, preview: true },
      { title: "Outils de politique monétaire (TIAO, REC)", durationMinutes: 30 },
      { title: "Chaîne de transmission vers le marché", durationMinutes: 35 },
      { title: "Peg EUR/XOF : implications", durationMinutes: 25 },
      { title: "Décrypter un communiqué CPM", durationMinutes: 30 },
      { title: "Cas pratique : impact d'une hausse de 25 bps", durationMinutes: 35 },
    ],
    prerequisites: ["Notions économiques de base"],
    outcomes: [
      "Lire un communiqué CPM et anticiper l'impact marché",
      "Expliquer le peg EUR/XOF et ses implications",
      "Tracer la chaîne taux directeurs → taux courts → taux longs",
    ],
    pricing: { type: "premium", priceFcfa: 35_000 },
    tags: ["BCEAO", "politique monétaire", "FCFA", "macro UEMOA"],
    featured: true,
    updatedAt: "2026-04-22",
  },

  {
    slug: "matieres-premieres-brvm",
    title: "Matières premières et BRVM",
    shortDescription:
      "Cacao, or, brent, palme : comment ces sous-jacents influencent les valeurs cotées et les budgets UEMOA.",
    longDescription:
      "Les matières premières sont structurantes pour l'UEMOA : cacao (Côte d'Ivoire), or (Mali, Burkina), pétrole (Sénégal, Niger), palme (Côte d'Ivoire). Cette formation explique le canal d'impact MP → recettes Etat → balance courante → BRVM, et identifie les valeurs cotées les plus exposées (PALMCI, SAPH, SOGB, TOTAL CI).",
    level: "intermediaire",
    format: "cours",
    category: "macro",
    modules: [
      { title: "Cartographie des MP critiques pour l'UEMOA", durationMinutes: 25, preview: true },
      { title: "Cacao et économie ivoirienne", durationMinutes: 30 },
      { title: "Or, mines et pays sahéliens", durationMinutes: 25 },
      { title: "Brent et inflation importée", durationMinutes: 25 },
      { title: "Valeurs BRVM directement exposées", durationMinutes: 30 },
    ],
    prerequisites: [],
    outcomes: [
      "Citer les 5 MP les plus structurantes pour l'UEMOA",
      "Identifier les valeurs BRVM exposées à chaque MP",
      "Anticiper l'impact d'un mouvement de cours",
    ],
    pricing: { type: "gratuit" },
    tags: ["matières premières", "cacao", "or", "brent", "macro"],
    updatedAt: "2026-04-05",
  },

  // ---------- PORTEFEUILLE ----------
  {
    slug: "construire-portefeuille-uemoa",
    title: "Construire un portefeuille UEMOA",
    shortDescription:
      "Allocation actions / obligations / OPCVM, diversification sectorielle et géographique en zone UEMOA.",
    longDescription:
      "Méthodologie pour construire un portefeuille adapté à un investisseur particulier UEMOA : profils de risque, allocation stratégique, diversification entre BRVM, UMOA-Titres et FCP. On aborde aussi le rebalancing trimestriel et l'impact de la fiscalité sur le rendement net.",
    level: "intermediaire",
    format: "cours",
    category: "portefeuille",
    modules: [
      { title: "Profil de risque et horizon", durationMinutes: 30, preview: true },
      { title: "Allocation stratégique : actions / obligations / liquidités", durationMinutes: 35 },
      { title: "Diversification sectorielle BRVM", durationMinutes: 25 },
      { title: "Place des FCP dans une allocation", durationMinutes: 25 },
      { title: "Rebalancing : règles et fréquence", durationMinutes: 25 },
      { title: "Rendement brut vs net après fiscalité", durationMinutes: 25 },
    ],
    prerequisites: ["Avoir suivi Initiation à la BRVM"],
    outcomes: [
      "Définir une allocation cible cohérente avec son profil",
      "Diversifier entre actions, obligations et FCP",
      "Mettre en œuvre un rebalancing simple",
    ],
    pricing: { type: "premium", priceFcfa: 40_000 },
    tags: ["portefeuille", "allocation", "diversification", "FCP"],
    updatedAt: "2026-03-30",
  },

  {
    slug: "gestion-risque-var",
    title: "Gestion du risque et Value-at-Risk",
    shortDescription:
      "Quantifier le risque d'un portefeuille : volatilité, drawdown, VaR historique et paramétrique.",
    longDescription:
      "Formation avancée : on quantifie le risque à différents horizons. Volatilité annualisée, drawdown maximum, VaR historique sur 1 jour et 10 jours, VaR paramétrique gaussienne, et leurs limites sur les marchés frontières comme la BRVM. Atelier Excel avec un portefeuille de 5 valeurs.",
    level: "avance",
    format: "cours",
    category: "portefeuille",
    modules: [
      { title: "Volatilité annualisée et log-returns", durationMinutes: 30 },
      { title: "Drawdown maximum et durée de récupération", durationMinutes: 25 },
      { title: "VaR historique et paramétrique", durationMinutes: 40, preview: true },
      { title: "Limites sur marchés peu liquides", durationMinutes: 25 },
      { title: "Atelier Excel sur un portefeuille de 5 valeurs", durationMinutes: 60 },
    ],
    prerequisites: [
      "Avoir suivi Construire un portefeuille UEMOA",
      "Connaissance d'Excel à l'aise",
    ],
    outcomes: [
      "Calculer la VaR d'un portefeuille en historique et en paramétrique",
      "Interpréter un drawdown",
      "Identifier les limites de la VaR sur la BRVM",
    ],
    pricing: { type: "premium", priceFcfa: 50_000 },
    tags: ["risque", "VaR", "volatilité", "drawdown"],
    updatedAt: "2026-04-12",
  },

  {
    slug: "fcp-opcvm-uemoa",
    title: "FCP / OPCVM : choisir et combiner",
    shortDescription:
      "Comprendre les différents OPC de la zone, lire un DICI, comparer les frais et les performances nettes.",
    longDescription:
      "Tour d'horizon des FCP / OPCVM de la zone UEMOA. On apprend à lire un Document d'Information Clé pour l'Investisseur (DICI), à analyser la composition d'un fonds, à comparer les frais (entrée, gestion, sortie) et à juger une performance nette. Listing actualisé des principaux OPC commercialisés au Sénégal et en Côte d'Ivoire.",
    level: "debutant",
    format: "cours",
    category: "portefeuille",
    modules: [
      { title: "OPC : définition, types, cadre réglementaire", durationMinutes: 25, preview: true },
      { title: "Lire un DICI : 5 informations clés", durationMinutes: 30 },
      { title: "Frais : entrée, gestion annuelle, sortie", durationMinutes: 25 },
      { title: "Performance brute vs nette : ne pas se faire avoir", durationMinutes: 25 },
      { title: "Panorama des FCP UEMOA actuels", durationMinutes: 35 },
    ],
    prerequisites: [],
    outcomes: [
      "Lire et comparer 3 DICI",
      "Calculer la performance nette d'un OPC",
      "Choisir un FCP cohérent avec son profil",
    ],
    pricing: { type: "premium", priceFcfa: 30_000 },
    tags: ["FCP", "OPCVM", "DICI", "frais"],
    updatedAt: "2026-04-08",
  },

  // ---------- PRATIQUE ----------
  {
    slug: "lire-cours-graphique",
    title: "Lire un cours et un graphique de bourse",
    shortDescription:
      "Une formation express et gratuite pour décoder une cotation, un volume, un graphique et un carnet d'ordres.",
    longDescription:
      "Vidéo pédagogique courte (~30 min) qui démystifie les éléments visuels d'une fiche valeur : prix de référence, ouverture, plus haut, plus bas, volume, capitalisation, plus-value journalière. Idéal en complément de l'initiation BRVM.",
    level: "debutant",
    format: "cours",
    category: "bourse",
    modules: [
      { title: "Anatomie d'une fiche valeur", durationMinutes: 10, preview: true },
      { title: "Lire un graphique en chandelier", durationMinutes: 12 },
      { title: "Volume, capitalisation, flottant", durationMinutes: 8 },
    ],
    prerequisites: [],
    outcomes: ["Lire intuitivement n'importe quelle fiche valeur de la BRVM"],
    pricing: { type: "gratuit" },
    tags: ["bourse", "graphique", "débutant", "express"],
    updatedAt: "2026-02-18",
  },

  {
    slug: "fiscalite-plus-values-brvm",
    title: "Fiscalité des plus-values BRVM",
    shortDescription:
      "Imposition des dividendes, plus-values et coupons : règles UEMOA et conventions fiscales par pays.",
    longDescription:
      "Souvent ignorée, la fiscalité grignote 10 à 30 % du rendement brut. Cette formation détaille l'imposition des dividendes, des plus-values, et des coupons obligataires pour les 8 pays de l'UEMOA. Cas particuliers des non-résidents et des conventions fiscales bilatérales.",
    level: "intermediaire",
    format: "cours",
    category: "pratique",
    modules: [
      { title: "Cadre fiscal UEMOA : généralités", durationMinutes: 25, preview: true },
      { title: "Imposition des dividendes par pays", durationMinutes: 30 },
      { title: "Plus-values : régime et abattements", durationMinutes: 25 },
      { title: "Coupons obligataires", durationMinutes: 20 },
      { title: "Cas du non-résident et conventions", durationMinutes: 30 },
    ],
    prerequisites: [],
    outcomes: [
      "Calculer le rendement net d'un investissement BRVM",
      "Identifier les régimes d'exonération",
      "Conseiller un non-résident sur la fiscalité applicable",
    ],
    pricing: { type: "premium", priceFcfa: 30_000 },
    tags: ["fiscalité", "dividendes", "plus-values", "non-résident"],
    updatedAt: "2026-04-20",
  },

  // ---------- CERTIFIANT ----------
  {
    slug: "certification-azimut-niveau-1",
    title: "Certification AzimutFinance — Niveau 1",
    shortDescription:
      "Parcours complet 40 heures couvrant BRVM, obligations, analyse et portefeuille. Examen final certifiant.",
    longDescription:
      "Le parcours certifiant niveau 1 d'AzimutFinance, conçu pour valider une compétence opérationnelle sur les marchés financiers de l'UEMOA. 40 heures de contenu réparties en 8 modules thématiques, examen final en ligne (60 questions, 90 minutes), certificat numérique vérifiable.",
    level: "intermediaire",
    format: "certifiant",
    category: "bourse",
    modules: [
      { title: "Module 1 — BRVM : fondamentaux", durationMinutes: 240, preview: true },
      { title: "Module 2 — Marché obligataire UEMOA", durationMinutes: 300 },
      { title: "Module 3 — Analyse fondamentale", durationMinutes: 360 },
      { title: "Module 4 — Analyse technique", durationMinutes: 240 },
      { title: "Module 5 — Macro UEMOA", durationMinutes: 240 },
      { title: "Module 6 — Construction de portefeuille", durationMinutes: 300 },
      { title: "Module 7 — Gestion du risque", durationMinutes: 240 },
      { title: "Module 8 — Fiscalité et pratique", durationMinutes: 180 },
      { title: "Examen final certifiant (60 QCM, 90 min)", durationMinutes: 90 },
    ],
    prerequisites: ["Aucun prérequis fort, parcours complet et progressif"],
    outcomes: [
      "Maîtriser les marchés financiers de l'UEMOA de bout en bout",
      "Obtenir un certificat numérique vérifiable",
      "Présenter sa candidature à des postes de gestion / analyse",
    ],
    pricing: { type: "certifiant", priceFcfa: 250_000 },
    tags: ["certifiant", "parcours complet", "BRVM", "obligations", "portefeuille"],
    instructor: { name: "Pôle pédagogique AzimutFinance", title: "Équipe certifiante" },
    featured: true,
    updatedAt: "2026-04-25",
  },
];

// =============================================================================
// HELPERS
// =============================================================================

export const FORMATIONS_BY_SLUG: Record<string, Formation> = Object.fromEntries(
  FORMATIONS.map((f) => [f.slug, f]),
);

export function totalDurationMinutes(formation: Formation): number {
  return formation.modules.reduce((s, m) => s + m.durationMinutes, 0);
}

export function totalDurationLabel(formation: Formation): string {
  const m = totalDurationMinutes(formation);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (mm === 0) return `${h} h`;
  return `${h} h ${mm.toString().padStart(2, "0")}`;
}

export function pricingLabel(formation: Formation): string {
  if (formation.pricing.type === "gratuit") return "Gratuit";
  return `${formation.pricing.priceFcfa.toLocaleString("fr-FR")} FCFA`;
}

export function pricingShortLabel(formation: Formation): string {
  if (formation.pricing.type === "gratuit") return "Gratuit";
  if (formation.pricing.type === "certifiant") return "Certifiant";
  return "Premium";
}

export function getCatalogStats(): {
  total: number;
  totalHours: number;
  freeCount: number;
  premiumCount: number;
  certifyingCount: number;
  byCategory: Record<FormationCategory, number>;
  byLevel: Record<FormationLevel, number>;
} {
  const byCategory = {
    bourse: 0,
    obligations: 0,
    analyse: 0,
    macro: 0,
    portefeuille: 0,
    pratique: 0,
  } as Record<FormationCategory, number>;
  const byLevel = { debutant: 0, intermediaire: 0, avance: 0 } as Record<
    FormationLevel,
    number
  >;
  let free = 0;
  let premium = 0;
  let certifying = 0;
  let totalMinutes = 0;
  for (const f of FORMATIONS) {
    byCategory[f.category]++;
    byLevel[f.level]++;
    if (f.pricing.type === "gratuit") free++;
    else if (f.pricing.type === "premium") premium++;
    else certifying++;
    totalMinutes += totalDurationMinutes(f);
  }
  return {
    total: FORMATIONS.length,
    totalHours: Math.round(totalMinutes / 60),
    freeCount: free,
    premiumCount: premium,
    certifyingCount: certifying,
    byCategory,
    byLevel,
  };
}

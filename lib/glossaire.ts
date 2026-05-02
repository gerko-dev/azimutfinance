// === GLOSSAIRE FINANCIER UEMOA / BRVM ===
//
// Catalogue statique de ~70 termes financiers, contextualises pour la zone
// UEMOA et la BRVM. Chaque terme a un slug URL-safe, une definition courte
// (1 phrase) et une definition longue (paragraphe avec exemple). Les termes
// lies sont references par slug et resolus au render.

export type GlossCategory =
  | "bourse"
  | "obligations"
  | "analyse"
  | "macro"
  | "portefeuille"
  | "reglementation"
  | "fiscalite"
  | "general";

export type GlossTerm = {
  slug: string;
  term: string;
  /** Acronyme ou abreviation (optionnel) */
  acronym?: string;
  /** Definition courte en 1 phrase, pour la card et la liste */
  short: string;
  /** Definition longue (paragraphe), avec exemple UEMOA quand pertinent */
  long: string;
  category: GlossCategory;
  /** Slugs d'autres termes lies (resolus au render) */
  related?: string[];
  /** Tags libres pour la recherche */
  tags?: string[];
};

// =============================================================================
// METADATA CATEGORIES
// =============================================================================

export const GLOSS_CATEGORY_META: Record<
  GlossCategory,
  { label: string; color: string; description: string }
> = {
  bourse: {
    label: "Bourse & actions",
    color: "#1d4ed8",
    description: "BRVM, indices, séances, ordres, valeurs cotées",
  },
  obligations: {
    label: "Obligations & taux",
    color: "#b45309",
    description: "OAT, BAT, YTM, duration, coupons, amortissement",
  },
  analyse: {
    label: "Analyse financière",
    color: "#7c3aed",
    description: "Ratios, états financiers, valorisation",
  },
  macro: {
    label: "Macro & UEMOA",
    color: "#059669",
    description: "BCEAO, FCFA, taux directeurs, peg",
  },
  portefeuille: {
    label: "Gestion de portefeuille",
    color: "#be185d",
    description: "Allocation, risque, performance",
  },
  reglementation: {
    label: "Réglementation & acteurs",
    color: "#0369a1",
    description: "CREPMF, SGI, OPCVM, DC/BR",
  },
  fiscalite: {
    label: "Fiscalité",
    color: "#9a3412",
    description: "Dividendes, plus-values, conventions",
  },
  general: {
    label: "Général",
    color: "#475569",
    description: "Concepts financiers transverses",
  },
};

// =============================================================================
// CATALOGUE
// =============================================================================

export const GLOSSAIRE: GlossTerm[] = [
  // ---------- BOURSE & ACTIONS ----------
  {
    slug: "action",
    term: "Action",
    short: "Titre de propriété représentant une fraction du capital d'une société.",
    long:
      "Une action confère à son détenteur le statut d'actionnaire : droit aux dividendes, droit de vote en assemblée générale et droit sur l'actif net en cas de liquidation. Sur la BRVM, les actions sont cotées au fixing avec une variation maximale de ±7,5 % par séance pour la plupart des compartiments.",
    category: "bourse",
    related: ["dividende", "capitalisation-boursiere", "brvm", "fixing"],
    tags: ["action", "titre", "capital"],
  },
  {
    slug: "dividende",
    term: "Dividende",
    short: "Part du bénéfice distribuée aux actionnaires, généralement payée annuellement.",
    long:
      "Le dividende est versé sur décision de l'assemblée générale, en numéraire ou en actions. Sur la BRVM, les dividendes sont historiquement généreux (4-7 % de rendement médian) en raison de politiques de distribution stables des sociétés cotées (SONATEL, BICC, SGBC). L'imposition varie selon le pays UEMOA de résidence du bénéficiaire.",
    category: "bourse",
    related: ["action", "plus-value", "imposition-dividendes"],
    tags: ["dividende", "rendement", "distribution"],
  },
  {
    slug: "plus-value",
    term: "Plus-value",
    short: "Différence positive entre le prix de vente et le prix d'achat d'un actif financier.",
    long:
      "La plus-value boursière brute est la différence entre prix de cession et prix de revient d'un titre. Sur la BRVM, elle est imposable dans le pays de résidence selon des règles variables (exonération partielle au Sénégal, imposition au taux marginal en CI). L'horizon de détention peut donner droit à un abattement.",
    category: "bourse",
    related: ["dividende", "imposition-plus-values"],
    tags: ["plus-value", "rendement"],
  },
  {
    slug: "capitalisation-boursiere",
    term: "Capitalisation boursière",
    short: "Valeur de marché totale d'une société = nombre d'actions × cours actuel.",
    long:
      "Indicateur fondamental pour comparer les sociétés cotées. SONATEL, plus grosse capitalisation BRVM, dépasse régulièrement 2 500 Md FCFA. Une faible capitalisation associée à un faible flottant entraîne une faible liquidité et un cours qui réagit fortement aux ordres significatifs.",
    category: "bourse",
    related: ["flottant", "action", "brvm"],
    tags: ["capitalisation", "valorisation"],
  },
  {
    slug: "flottant",
    term: "Flottant",
    short: "Part du capital effectivement disponible à l'achat sur le marché.",
    long:
      "Le flottant exclut les blocs détenus par les actionnaires de référence (Etat, fondateurs, holdings de contrôle). Sur la BRVM, beaucoup de valeurs ont un flottant inférieur à 30 %, ce qui amplifie la volatilité des cours et limite la liquidité quotidienne.",
    category: "bourse",
    related: ["capitalisation-boursiere", "liquidite"],
    tags: ["flottant", "liquidité"],
  },
  {
    slug: "brvm",
    term: "BRVM",
    acronym: "Bourse Régionale des Valeurs Mobilières",
    short:
      "Place boursière unique de l'UEMOA, créée en 1998, basée à Abidjan, cotant actions et obligations des 8 pays.",
    long:
      "La BRVM cote actions et obligations en FCFA pour les 8 pays UEMOA. Elle fonctionne en cotation continue depuis 2013 (auparavant fixing) sur le compartiment principal. Elle est régulée par le CREPMF et utilise le DC/BR pour la conservation et le règlement-livraison.",
    category: "reglementation",
    related: ["crepmf", "dc-br", "sgi", "brvm-composite"],
    tags: ["BRVM", "bourse", "UEMOA"],
  },
  {
    slug: "brvm-composite",
    term: "BRVM Composite",
    short:
      "Indice principal de la BRVM, base sur l'ensemble des valeurs cotées, base 100 au 16/09/1998.",
    long:
      "Le BRVM Composite est pondéré par la capitalisation boursière flottante. C'est l'indice de référence pour mesurer la performance globale du marché actions UEMOA. Il existe également le BRVM 30 (30 valeurs les plus liquides), le BRVM Prestige (gouvernance), et des indices sectoriels.",
    category: "bourse",
    related: ["brvm", "brvm-30", "capitalisation-boursiere"],
    tags: ["indice", "BRVM", "composite"],
  },
  {
    slug: "brvm-30",
    term: "BRVM 30",
    short: "Indice des 30 valeurs les plus liquides de la BRVM, lancé en 2018.",
    long:
      "Le BRVM 30 sélectionne les 30 valeurs sur la base de critères de liquidité, capitalisation flottante et fréquence des transactions. Il est revu trimestriellement. C'est l'indice de référence pour les ETF et les fonds indiciels de la zone.",
    category: "bourse",
    related: ["brvm-composite", "brvm", "flottant"],
    tags: ["BRVM 30", "indice"],
  },
  {
    slug: "fixing",
    term: "Fixing",
    short:
      "Mode de cotation où tous les ordres sont confrontés à un instant T pour déterminer un cours unique.",
    long:
      "Sur la BRVM, certaines valeurs peu liquides cotent encore au fixing (1 à 2 fixings par jour) plutôt qu'en continu. Le cours est fixé en maximisant le volume échangé. Le fixing limite la volatilité et concentre la liquidité.",
    category: "bourse",
    related: ["seance-de-bourse", "carnet-ordres"],
    tags: ["fixing", "cotation"],
  },
  {
    slug: "carnet-ordres",
    term: "Carnet d'ordres",
    short: "Liste organisée des ordres d'achat et de vente en attente d'exécution.",
    long:
      "Le carnet présente les meilleurs ordres d'achat (à gauche, prix décroissants) face aux meilleurs ordres de vente (à droite, prix croissants). L'écart entre la meilleure offre et la meilleure demande est appelé le spread. Un carnet épais signale une bonne liquidité.",
    category: "bourse",
    related: ["ordre-limite", "fixing", "liquidite"],
    tags: ["carnet", "ordres", "liquidité"],
  },
  {
    slug: "ordre-limite",
    term: "Ordre à cours limité",
    short: "Ordre exécuté uniquement au prix limite indiqué ou meilleur.",
    long:
      "L'ordre à cours limité protège l'investisseur d'une exécution à un prix défavorable. À l'achat, l'ordre est exécuté au prix limite ou en dessous ; à la vente, au prix limite ou au-dessus. Recommandé sur la BRVM où la liquidité peut être faible.",
    category: "bourse",
    related: ["carnet-ordres", "ordre-marche"],
    tags: ["ordre", "limite"],
  },
  {
    slug: "ordre-marche",
    term: "Ordre au marché",
    short: "Ordre exécuté immédiatement au meilleur prix disponible dans le carnet.",
    long:
      "L'ordre au marché garantit l'exécution mais pas le prix. À éviter sur les valeurs peu liquides de la BRVM où l'écart entre les meilleures offres peut être large : un ordre d'achat de 1 000 titres peut être exécuté à plusieurs prix échelonnés.",
    category: "bourse",
    related: ["ordre-limite", "carnet-ordres"],
    tags: ["ordre", "marché"],
  },
  {
    slug: "seance-de-bourse",
    term: "Séance de bourse",
    short:
      "Période quotidienne pendant laquelle les transactions sont possibles sur la BRVM.",
    long:
      "La séance BRVM se déroule du lundi au vendredi, hors jours fériés UEMOA. Pré-ouverture vers 9h, ouverture à 10h, clôture entre 12h et 14h selon le segment. Les valeurs en continu cotent en cours de séance ; les valeurs au fixing ont 1 à 2 fixings.",
    category: "bourse",
    related: ["fixing", "brvm"],
    tags: ["séance", "horaires"],
  },
  {
    slug: "ipo",
    term: "Introduction en bourse",
    acronym: "IPO",
    short: "Première cotation publique d'une société sur un marché boursier.",
    long:
      "L'IPO permet à une société d'accéder aux capitaux publics et offre une porte de sortie aux actionnaires de référence. Sur la BRVM, les introductions sont rares mais marquantes : ORANGE CI (2016), BOA Côte d'Ivoire, Coris Bank, etc. Le visa CREPMF est obligatoire.",
    category: "bourse",
    related: ["brvm", "crepmf"],
    tags: ["IPO", "introduction"],
  },

  // ---------- OBLIGATIONS & TAUX ----------
  {
    slug: "obligation",
    term: "Obligation",
    short: "Titre de créance qui donne droit à des coupons périodiques et au remboursement du nominal.",
    long:
      "L'obligation représente une dette de l'émetteur (Etat, entreprise) envers le porteur. Elle est caractérisée par son nominal, son taux nominal (coupon), sa maturité et son mode d'amortissement. Sur la BRVM, on trouve des souverains UEMOA (CI.O, SN.O, BJ.O), des corporates et des supranationales (BOAD, BIDC).",
    category: "obligations",
    related: ["coupon", "ytm", "duration", "oat", "bat"],
    tags: ["obligation", "dette", "fixed income"],
  },
  {
    slug: "oat",
    term: "OAT",
    acronym: "Obligation Assimilable du Trésor",
    short: "Obligation souveraine UMOA-Titres à moyen-long terme (3 à 10 ans).",
    long:
      "Les OAT sont émises par les Trésors publics des 8 pays UEMOA via UMOA-Titres. Ce sont des obligations à coupons annuels, généralement amorties in fine. Le marché secondaire est animé par les SVT (Spécialistes en Valeurs du Trésor). Une partie est cotée à la BRVM (CI.O, SN.O, BF.O…).",
    category: "obligations",
    related: ["bat", "tpe", "umoa-titres", "obligation"],
    tags: ["OAT", "souverain"],
  },
  {
    slug: "bat",
    term: "BAT",
    acronym: "Bon Assimilable du Trésor",
    short: "Bon souverain UMOA-Titres à court terme (3, 6, 12 mois).",
    long:
      "Les BAT sont des titres de dette publique à court terme, émis à escompte (zéro-coupon). Très liquides, ils servent de référence pour la courbe des taux courts UEMOA. Leur rendement est piloté indirectement par la BCEAO via le TIAO.",
    category: "obligations",
    related: ["oat", "tiao", "umoa-titres"],
    tags: ["BAT", "court terme", "zéro coupon"],
  },
  {
    slug: "tpe",
    term: "TPE",
    acronym: "Titre Public Equivalent",
    short: "Titre souverain UEMOA réservé au marché interbancaire.",
    long:
      "Les TPE sont des titres souverains UEMOA réservés aux institutions financières dans le cadre du refinancement BCEAO. Ils ne sont pas accessibles aux investisseurs particuliers. Maturité courte, généralement 1 mois à 2 ans.",
    category: "obligations",
    related: ["oat", "bat", "bceao"],
    tags: ["TPE", "interbancaire"],
  },
  {
    slug: "umoa-titres",
    term: "UMOA-Titres",
    short: "Agence régionale qui pilote l'émission des titres souverains des 8 pays UEMOA.",
    long:
      "UMOA-Titres centralise les adjudications, fournit les calendriers d'émission et calcule les courbes de taux. C'est la source de référence pour les rendements souverains UEMOA et l'animation du marché secondaire des OAT et BAT.",
    category: "reglementation",
    related: ["oat", "bat", "tpe", "bceao"],
    tags: ["UMOA-Titres", "souverain", "agence"],
  },
  {
    slug: "coupon",
    term: "Coupon",
    short: "Intérêt périodique payé par une obligation à son porteur.",
    long:
      "Le coupon est calculé en pourcentage du nominal (ex : OAT BENIN 6,5 % paye 6 500 FCFA par an pour un nominal de 100 000). Sa fréquence est généralement annuelle dans l'UEMOA, mais peut être semestrielle. Entre 2 dates de coupon, le coupon couru augmente linéairement.",
    category: "obligations",
    related: ["coupon-couru", "obligation", "nominal"],
    tags: ["coupon", "intérêt"],
  },
  {
    slug: "coupon-couru",
    term: "Coupon couru",
    short:
      "Fraction du coupon en formation depuis la dernière date de paiement, ajoutée au prix dirty.",
    long:
      "Le coupon couru permet de séparer le prix pied de coupon (clean price) du prix avec coupon couru (dirty price). C'est la convention Act/365 dans l'UEMOA : couru = coupon × (jours écoulés / 365). À l'achat, on paye le dirty price ; le clean price est l'indicateur de marché.",
    category: "obligations",
    related: ["coupon", "prix-pied-coupon", "obligation"],
    tags: ["coupon couru", "actuariel"],
  },
  {
    slug: "nominal",
    term: "Nominal",
    short:
      "Valeur faciale d'une obligation, base de calcul du coupon et montant remboursé à l'échéance.",
    long:
      "Sur la BRVM, le nominal des obligations souveraines est typiquement 10 000 FCFA. Le coupon est calculé en % du nominal. À l'échéance, l'émetteur rembourse le nominal (in fine) ou progressivement (amortissement).",
    category: "obligations",
    related: ["coupon", "obligation", "amortissement"],
    tags: ["nominal", "valeur faciale"],
  },
  {
    slug: "prix-pied-coupon",
    term: "Prix pied de coupon",
    short: "Prix de marché d'une obligation hors coupon couru (clean price).",
    long:
      "Le prix pied de coupon (clean price) est l'indicateur publié par les marchés et utilisé pour comparer les obligations entre elles. Il est exprimé en pourcentage du nominal (ex : 102,3 % = 102 300 FCFA pour un nominal de 100 000).",
    category: "obligations",
    related: ["coupon-couru", "ytm"],
    tags: ["clean price", "prix"],
  },
  {
    slug: "ytm",
    term: "YTM",
    acronym: "Yield to Maturity",
    short:
      "Taux qui actualise tous les flux d'une obligation pour égaliser le prix payé. Rendement actuariel à l'échéance.",
    long:
      "Le YTM (rendement à l'échéance) est calculé par bisection ou Newton-Raphson : on cherche le taux r tel que la somme actualisée des coupons et du nominal égale le prix dirty. Ex : OAT BENIN 6,5 % 2030 cotée 98 % donne un YTM ≈ 6,8 %. C'est la métrique de référence pour comparer 2 obligations.",
    category: "obligations",
    related: ["duration", "obligation", "prix-pied-coupon"],
    tags: ["YTM", "rendement", "actuariel"],
  },
  {
    slug: "duration",
    term: "Duration",
    short:
      "Maturité moyenne pondérée des flux actualisés, mesure la sensibilité au taux.",
    long:
      "La duration de Macaulay est exprimée en années. La duration modifiée (≈ Macaulay / (1+YTM)) mesure la variation de prix pour 1 % de hausse du taux. Ex : duration modifiée de 4,2 ⇒ une hausse des taux de 100 bps fait baisser le prix de 4,2 %. Plus la duration est élevée, plus l'obligation est sensible.",
    category: "obligations",
    related: ["ytm", "convexite", "obligation"],
    tags: ["duration", "Macaulay", "sensibilité"],
  },
  {
    slug: "convexite",
    term: "Convexité",
    short:
      "Approximation du second ordre de la sensibilité prix/taux d'une obligation.",
    long:
      "La duration modifiée est une approximation linéaire ; la convexité corrige avec le terme quadratique : ΔP/P ≈ -DurMod × Δr + 0,5 × Conv × Δr². La convexité est positive pour les obligations classiques : un mouvement de taux fait moins baisser le prix qu'estimé par la duration seule.",
    category: "obligations",
    related: ["duration", "ytm"],
    tags: ["convexité", "actuariel"],
  },
  {
    slug: "spread-credit",
    term: "Spread de crédit",
    short:
      "Écart de rendement entre une obligation corporate ou souveraine et un benchmark sans risque.",
    long:
      "Le spread mesure la prime de risque exigée par le marché pour la signature d'un émetteur. Sur la BRVM, on calcule typiquement le spread d'un corporate vs la courbe souveraine UEMOA de même maturité. Un spread qui s'élargit signale une dégradation de la perception du risque.",
    category: "obligations",
    related: ["ytm", "obligation"],
    tags: ["spread", "crédit", "risque"],
  },
  {
    slug: "amortissement",
    term: "Amortissement",
    short:
      "Mode de remboursement du capital : in fine, constant (AC), différé (ACD).",
    long:
      "In fine (IF) : remboursement total à l'échéance, coupons périodiques sur le nominal. AC : amortissement constant du capital + intérêts sur capital restant dû. ACD : amortissement constant après une période de différé. Sur la BRVM, beaucoup d'obligations cotées sont en AC ou ACD, ce qui complique le calcul du YTM.",
    category: "obligations",
    related: ["obligation", "duration"],
    tags: ["amortissement", "IF", "AC", "ACD"],
  },
  {
    slug: "call",
    term: "Call (option de remboursement)",
    short:
      "Option pour l'émetteur de rembourser l'obligation avant l'échéance.",
    long:
      "Une obligation callable peut être remboursée à l'initiative de l'émetteur, généralement quand les taux baissent (refinancement à meilleur coût). Pour le porteur, c'est un risque : il récupère son capital à un moment où il ne peut plus le replacer au même rendement. On calcule alors le YTC (Yield to Call).",
    category: "obligations",
    related: ["obligation", "ytm"],
    tags: ["call", "remboursement anticipé"],
  },
  {
    slug: "green-bond",
    term: "Green bond",
    short:
      "Obligation dont le produit finance exclusivement des projets environnementaux.",
    long:
      "Les green bonds suivent généralement les Green Bond Principles. La BRVM accueille progressivement des green bonds africains (BOAD, Etat de Côte d'Ivoire). Souvent associés à un label externe (Climate Bonds Initiative) qui valide la conformité environnementale.",
    category: "obligations",
    related: ["obligation"],
    tags: ["green bond", "ESG"],
  },

  // ---------- ANALYSE FINANCIERE ----------
  {
    slug: "roe",
    term: "ROE",
    acronym: "Return on Equity",
    short: "Rentabilité des capitaux propres = Résultat net / Capitaux propres.",
    long:
      "Le ROE mesure la capacité d'une entreprise à rémunérer ses actionnaires. Un ROE > 15 % est généralement considéré comme bon. Sur la BRVM, les banques (SGBC, BICC) ont historiquement les ROE les plus élevés (20-25 %), suivies des télécoms (SONATEL).",
    category: "analyse",
    related: ["roa", "roce", "ebitda"],
    tags: ["ROE", "rentabilité"],
  },
  {
    slug: "roce",
    term: "ROCE",
    acronym: "Return on Capital Employed",
    short:
      "Rentabilité des capitaux investis = EBIT / (Capitaux propres + Dette nette).",
    long:
      "Le ROCE mesure l'efficacité du capital total mobilisé (fonds propres + dette). Plus pertinent que le ROE pour comparer des entreprises avec des structures financières différentes. Un ROCE supérieur au coût moyen pondéré du capital (WACC) indique de la création de valeur.",
    category: "analyse",
    related: ["roe", "ebit", "wacc"],
    tags: ["ROCE", "rentabilité"],
  },
  {
    slug: "roa",
    term: "ROA",
    acronym: "Return on Assets",
    short: "Rentabilité de l'actif total = Résultat net / Actif total.",
    long:
      "Le ROA exprime la rentabilité générée par chaque FCFA d'actif. Très utilisé pour les banques (où l'actif est essentiellement composé de prêts). Banques BRVM : ROA généralement entre 1,5 % et 3 %. Industrielles : entre 5 % et 12 %.",
    category: "analyse",
    related: ["roe", "roce"],
    tags: ["ROA", "rentabilité"],
  },
  {
    slug: "ebitda",
    term: "EBITDA",
    acronym: "Earnings Before Interest, Taxes, Depreciation, Amortization",
    short:
      "Résultat opérationnel avant intérêts, impôts et amortissements. Proxy du cash-flow opérationnel.",
    long:
      "L'EBITDA neutralise les politiques d'amortissement et de financement pour comparer la performance opérationnelle pure. Très utilisé dans les multiples de valorisation (EV/EBITDA). Sur la BRVM, marges d'EBITDA typiques : 30-40 % télécoms, 20-30 % banques, 15-25 % industrielles.",
    category: "analyse",
    related: ["ebit", "ev-ebitda", "free-cash-flow"],
    tags: ["EBITDA", "cash flow"],
  },
  {
    slug: "ebit",
    term: "EBIT",
    acronym: "Earnings Before Interest and Taxes",
    short: "Résultat d'exploitation = EBITDA − amortissements et provisions.",
    long:
      "L'EBIT (ou résultat opérationnel) reflète la performance économique du métier hors structure financière et impôts. Indicateur clé pour calculer le ROCE et le multiple EV/EBIT. Plus pertinent que l'EBITDA pour les industries capitalistiques (investissements lourds en amortissement).",
    category: "analyse",
    related: ["ebitda", "roce"],
    tags: ["EBIT", "résultat opérationnel"],
  },
  {
    slug: "free-cash-flow",
    term: "Free Cash Flow",
    acronym: "FCF",
    short:
      "Cash disponible après investissements de maintien : EBITDA − impôts − BFR − Capex.",
    long:
      "Le FCF est la trésorerie réellement disponible pour rémunérer les apporteurs de capitaux (dividende, rachat, réduction de dette). Pour une valorisation par DCF, on actualise les FCF futurs au WACC. Un FCF négatif chronique est un signal d'alerte (sauf phase d'investissement).",
    category: "analyse",
    related: ["ebitda", "ebit", "capex", "wacc"],
    tags: ["FCF", "trésorerie"],
  },
  {
    slug: "per",
    term: "PER",
    acronym: "Price Earnings Ratio",
    short:
      "Multiple cours/bénéfice = Prix de l'action / Bénéfice net par action.",
    long:
      "Le PER (P/E) indique le nombre d'années de bénéfice nécessaires pour amortir l'investissement. PER médian BRVM historique : 10-15x. Un PER élevé (> 25x) traduit des attentes de croissance fortes ou un titre cher. Comparer toujours à la moyenne sectorielle.",
    category: "analyse",
    related: ["pbr", "ev-ebitda"],
    tags: ["PER", "multiple", "valorisation"],
  },
  {
    slug: "pbr",
    term: "P/B",
    acronym: "Price-to-Book ratio",
    short:
      "Multiple cours/actif net = Prix de l'action / Valeur comptable par action.",
    long:
      "Le P/B compare la valeur de marché aux fonds propres comptables. Particulièrement utile pour les banques (P/B < 1 = bradé sous la valeur livre). Banques BRVM : P/B historique entre 1,0 et 2,5. Pour les industriels, le P/B est moins discriminant que le PER.",
    category: "analyse",
    related: ["per", "roe"],
    tags: ["P/B", "multiple"],
  },
  {
    slug: "ev-ebitda",
    term: "EV/EBITDA",
    short: "Multiple Valeur d'entreprise / EBITDA, comparable indépendant de la structure financière.",
    long:
      "EV (Enterprise Value) = capitalisation + dette nette. Le multiple EV/EBITDA neutralise l'effet de la dette pour comparer 2 entreprises. Médiane BRVM : 5-9x selon le secteur. Le DCF est plus rigoureux mais EV/EBITDA est plus rapide à calculer pour un screening.",
    category: "analyse",
    related: ["ebitda", "per"],
    tags: ["EV/EBITDA", "multiple"],
  },
  {
    slug: "dette-nette",
    term: "Dette nette",
    short:
      "Dette financière brute moins la trésorerie disponible.",
    long:
      "La dette nette est l'indicateur de référence pour mesurer le levier financier. Le ratio dette nette / EBITDA est très suivi : > 3x signale un levier élevé, > 5x un risque significatif. Sur la BRVM, beaucoup de groupes industriels diversifiés ont un levier modéré (< 2x).",
    category: "analyse",
    related: ["gearing", "ebitda"],
    tags: ["dette", "levier"],
  },
  {
    slug: "gearing",
    term: "Gearing",
    short: "Ratio Dette nette / Capitaux propres, mesure du levier d'endettement.",
    long:
      "Un gearing > 100 % indique que la dette nette dépasse les fonds propres : levier élevé, sensibilité aux taux. Pour une banque, le gearing classique est inadapté : on regarde plutôt le ratio fonds propres / actifs pondérés (Cooke / Tier 1).",
    category: "analyse",
    related: ["dette-nette"],
    tags: ["gearing", "levier"],
  },
  {
    slug: "wacc",
    term: "WACC",
    acronym: "Weighted Average Cost of Capital",
    short:
      "Coût moyen pondéré du capital, taux d'actualisation utilisé en DCF.",
    long:
      "WACC = (E/V) × Ke + (D/V) × Kd × (1 − t), où Ke est le coût des fonds propres, Kd le coût de la dette, t l'IS. Sur la BRVM, WACC typique entre 10 % et 15 % selon la prime de risque pays et la structure financière. Un projet ROCE > WACC crée de la valeur.",
    category: "analyse",
    related: ["roce", "free-cash-flow"],
    tags: ["WACC", "coût du capital"],
  },
  {
    slug: "capex",
    term: "Capex",
    acronym: "Capital Expenditure",
    short: "Investissements en immobilisations corporelles et incorporelles.",
    long:
      "Le capex se distingue des dépenses opérationnelles (opex) : il est immobilisé au bilan et amorti sur plusieurs années. Capex de maintien (renouveler l'existant) vs capex de croissance (étendre la capacité). Le capex / chiffre d'affaires donne l'intensité capitalistique du métier.",
    category: "analyse",
    related: ["free-cash-flow"],
    tags: ["capex", "investissement"],
  },

  // ---------- MACRO & UEMOA ----------
  {
    slug: "uemoa",
    term: "UEMOA",
    acronym: "Union Économique et Monétaire Ouest-Africaine",
    short:
      "Union de 8 pays partageant le FCFA et la BCEAO : Bénin, Burkina, Côte d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal, Togo.",
    long:
      "L'UEMOA est l'union économique et monétaire ; elle est doublée d'une union monétaire UMOA (sans le 'E'). Les 8 pays partagent une monnaie unique (FCFA), une banque centrale (BCEAO), une bourse (BRVM), un régulateur des marchés (CREPMF) et un cadre fiscal harmonisé.",
    category: "macro",
    related: ["bceao", "fcfa", "brvm", "crepmf"],
    tags: ["UEMOA", "union économique"],
  },
  {
    slug: "umoa",
    term: "UMOA",
    acronym: "Union Monétaire Ouest-Africaine",
    short: "Volet monétaire de l'UEMOA, qui gère l'émission du FCFA via la BCEAO.",
    long:
      "L'UMOA précède l'UEMOA. Elle est l'union monétaire stricto sensu : émission monétaire commune (FCFA), réserves de change centralisées, politique de change unique. C'est dans le cadre de l'UMOA que sont émis les titres souverains UMOA-Titres.",
    category: "macro",
    related: ["uemoa", "bceao", "fcfa"],
    tags: ["UMOA", "union monétaire"],
  },
  {
    slug: "bceao",
    term: "BCEAO",
    acronym: "Banque Centrale des États de l'Afrique de l'Ouest",
    short: "Banque centrale commune aux 8 pays de l'UEMOA, basée à Dakar.",
    long:
      "La BCEAO conduit la politique monétaire UEMOA, gère les réserves de change, supervise le système bancaire et émet le FCFA. Ses outils principaux sont le TIAO (taux directeur), les réserves obligatoires et les opérations d'open-market. Le Comité de Politique Monétaire (CPM) se réunit trimestriellement.",
    category: "macro",
    related: ["tiao", "uemoa", "fcfa", "peg-eur-xof"],
    tags: ["BCEAO", "banque centrale"],
  },
  {
    slug: "fcfa",
    term: "FCFA",
    acronym: "Franc de la Communauté Financière Africaine",
    short:
      "Monnaie commune des 8 pays UEMOA, code ISO XOF, arrimée à l'euro à 655,957.",
    long:
      "Le FCFA des 8 pays UEMOA (XOF) est distinct du FCFA des 6 pays CEMAC (XAF). Les deux sont arrimés à l'euro au même taux. Les billets et pièces sont émis par la BCEAO. La parité fixe garantit la stabilité des prix mais limite l'autonomie monétaire.",
    category: "macro",
    related: ["bceao", "peg-eur-xof", "uemoa"],
    tags: ["FCFA", "XOF"],
  },
  {
    slug: "peg-eur-xof",
    term: "Peg EUR/XOF",
    short:
      "Parité fixe du FCFA face à l'euro : 1 EUR = 655,957 XOF depuis 1999.",
    long:
      "Le peg garantit la stabilité du FCFA et l'absence de risque de change vers l'euro, mais transmet automatiquement la politique monétaire BCE à l'UEMOA. La convertibilité est garantie par le Trésor français via le compte d'opérations. Toute paire X/XOF est dérivée du cours X/EUR via cette parité.",
    category: "macro",
    related: ["fcfa", "bceao"],
    tags: ["peg", "parité", "EUR/XOF"],
  },
  {
    slug: "tiao",
    term: "TIAO",
    acronym: "Taux d'Intérêt des Appels d'Offres",
    short: "Principal taux directeur de la BCEAO.",
    long:
      "Le TIAO est le taux auquel la BCEAO refinance les banques dans ses appels d'offres hebdomadaires. Il pilote l'ensemble de la courbe de taux UEMOA via le marché interbancaire. La BCEAO l'a relevé plusieurs fois en 2022-2024 pour contenir l'inflation importée. Niveau récent : 3,50 %.",
    category: "macro",
    related: ["bceao", "reserve-obligatoire"],
    tags: ["TIAO", "taux directeur"],
  },
  {
    slug: "reserve-obligatoire",
    term: "Réserve obligatoire",
    short:
      "Pourcentage des dépôts que les banques doivent déposer auprès de la BCEAO.",
    long:
      "Outil de politique monétaire moins fin que le TIAO mais utilisé pour ajuster la liquidité bancaire. La BCEAO fixe le coefficient (typiquement 3-5 %) et le révise occasionnellement. Une hausse réduit la capacité de prêt des banques.",
    category: "macro",
    related: ["bceao", "tiao"],
    tags: ["réserve obligatoire"],
  },
  {
    slug: "inflation",
    term: "Inflation",
    short:
      "Hausse soutenue du niveau général des prix dans une économie.",
    long:
      "Mesurée par l'IHPC (Indice Harmonisé des Prix à la Consommation) en UEMOA. Cible BCEAO : 2 % avec marge ±1 %. Les chocs récents (énergie, alimentaire) l'ont poussée jusqu'à 8 % en 2022, justifiant la hausse du TIAO.",
    category: "macro",
    related: ["tiao", "bceao"],
    tags: ["inflation", "prix"],
  },
  {
    slug: "balance-courante",
    term: "Balance courante",
    short:
      "Solde des échanges de biens, services, revenus et transferts d'un pays.",
    long:
      "Indicateur clé de l'équilibre extérieur. La plupart des pays UEMOA ont une balance courante structurellement déficitaire (importations énergétiques, équipements), partiellement compensée par les transferts de la diaspora. Un déficit chronique pèse sur les réserves de change.",
    category: "macro",
    related: ["fcfa"],
    tags: ["balance courante", "extérieur"],
  },
  {
    slug: "politique-monetaire",
    term: "Politique monétaire",
    short:
      "Pilotage par la banque centrale des taux d'intérêt et de la liquidité bancaire.",
    long:
      "Les outils BCEAO incluent le TIAO, les réserves obligatoires, les opérations d'open-market, le refinancement direct. L'objectif principal est la stabilité des prix (inflation autour de 2 %), avec en arrière-plan la stabilité du peg EUR/XOF.",
    category: "macro",
    related: ["bceao", "tiao", "reserve-obligatoire"],
    tags: ["politique monétaire"],
  },

  // ---------- GESTION DE PORTEFEUILLE ----------
  {
    slug: "allocation-actifs",
    term: "Allocation d'actifs",
    short:
      "Répartition d'un portefeuille entre classes d'actifs : actions, obligations, liquidités, autres.",
    long:
      "L'allocation stratégique est la décision la plus importante en gestion : elle explique 80-90 % de la performance. Pour un investisseur UEMOA équilibré : 40 % actions BRVM + 40 % obligations souveraines + 15 % FCP + 5 % liquidités. Rebalancing trimestriel ou semestriel.",
    category: "portefeuille",
    related: ["diversification", "fcp", "rebalancing"],
    tags: ["allocation", "stratégique"],
  },
  {
    slug: "diversification",
    term: "Diversification",
    short:
      "Réduction du risque par répartition entre actifs imparfaitement corrélés.",
    long:
      "La diversification fonctionne quand les actifs ne bougent pas de la même manière. Sur la BRVM, attention : une grande partie des valeurs sont corrélées au cycle ivoirien et aux matières premières. Une vraie diversification UEMOA combine BRVM + souverains + FCP + actifs internationaux (via OPCVM).",
    category: "portefeuille",
    related: ["allocation-actifs", "correlation"],
    tags: ["diversification"],
  },
  {
    slug: "volatilite",
    term: "Volatilité",
    short:
      "Mesure de l'amplitude des variations de prix, généralement en écart-type annualisé.",
    long:
      "Calculée comme écart-type des log-rendements quotidiens × √252. Volatilité typique BRVM : 10-15 % pour les blue chips, 25 %+ pour les small caps. Une volatilité élevée signale un risque de perte plus important à court terme — pas forcément un mauvais investissement à long terme.",
    category: "portefeuille",
    related: ["sharpe", "drawdown", "var"],
    tags: ["volatilité", "risque"],
  },
  {
    slug: "drawdown",
    term: "Drawdown",
    short:
      "Recul cumulé d'un actif depuis son dernier plus haut.",
    long:
      "Le drawdown maximum est l'indicateur de risque le plus parlant : 'combien aurais-je perdu au pire moment ?'. Le BRVM Composite a connu plusieurs drawdowns > 30 % dans son histoire (2008, 2016, 2020). Mesurer aussi la durée de récupération.",
    category: "portefeuille",
    related: ["volatilite", "var"],
    tags: ["drawdown", "risque"],
  },
  {
    slug: "sharpe",
    term: "Ratio de Sharpe",
    short:
      "Mesure du rendement par unité de volatilité = (Rendement − Taux sans risque) / Volatilité.",
    long:
      "Un Sharpe > 1 est jugé bon, > 2 excellent. Le taux sans risque dans l'UEMOA est typiquement le BAT 12 mois. Sharpe sur 5 ans BRVM Composite : entre 0,3 et 0,8 selon la fenêtre. Ne pas comparer naïvement à des marchés développés.",
    category: "portefeuille",
    related: ["volatilite", "alpha", "beta"],
    tags: ["Sharpe", "performance ajustée"],
  },
  {
    slug: "alpha",
    term: "Alpha",
    short:
      "Surperformance d'un portefeuille vs son benchmark, à risque équivalent.",
    long:
      "Alpha = Rendement portefeuille − (Rf + β × (Rmarket − Rf)). C'est ce que le gérant ajoute par sa sélection de valeurs. Un alpha positif consistant sur plusieurs années témoigne d'une vraie compétence. Difficile à générer sur la BRVM peu efficiente mais peu profonde.",
    category: "portefeuille",
    related: ["beta", "sharpe"],
    tags: ["alpha", "surperformance"],
  },
  {
    slug: "beta",
    term: "Beta",
    short:
      "Sensibilité d'un titre aux mouvements du marché. β = 1 : suit le marché ; β > 1 : amplifie ; β < 1 : amortit.",
    long:
      "Le beta est calculé par régression des rendements du titre sur ceux du benchmark (BRVM Composite). Les valeurs défensives (consumer staples) ont un β < 1, les cycliques (banques, matériaux) un β > 1. Useful pour estimer la sensibilité d'un portefeuille au marché.",
    category: "portefeuille",
    related: ["alpha", "volatilite"],
    tags: ["beta", "sensibilité"],
  },
  {
    slug: "var",
    term: "VaR",
    acronym: "Value at Risk",
    short:
      "Perte maximale attendue sur un horizon donné avec un niveau de confiance fixé.",
    long:
      "VaR à 95 % sur 1 jour de 2 % signifie : 'dans 95 % des cas, je ne perdrai pas plus de 2 % en 1 jour'. Calcul historique (sur les rendements passés) ou paramétrique (gaussienne). Limites importantes sur les marchés frontières comme la BRVM : queues épaisses, sauts.",
    category: "portefeuille",
    related: ["volatilite", "drawdown"],
    tags: ["VaR", "risque"],
  },
  {
    slug: "rebalancing",
    term: "Rebalancing",
    short:
      "Action périodique de ramener un portefeuille à son allocation cible.",
    long:
      "À mesure que les actifs performent différemment, l'allocation dérive. Le rebalancing (typiquement trimestriel ou semestriel) consiste à vendre les surperformants et racheter les sous-performants pour revenir à la cible. Discipline qui force à acheter bas et vendre haut.",
    category: "portefeuille",
    related: ["allocation-actifs", "diversification"],
    tags: ["rebalancing"],
  },

  // ---------- REGLEMENTATION & ACTEURS ----------
  {
    slug: "crepmf",
    term: "CREPMF",
    acronym: "Conseil Régional de l'Épargne Publique et des Marchés Financiers",
    short:
      "Régulateur unique du marché financier UEMOA, équivalent de l'AMF en France.",
    long:
      "Le CREPMF agrée les SGI, supervise les émissions publiques (visa préalable obligatoire), surveille le bon fonctionnement de la BRVM et protège l'épargne publique. Sanctions et amendes possibles. Basé à Abidjan.",
    category: "reglementation",
    related: ["sgi", "brvm", "ipo"],
    tags: ["CREPMF", "régulateur"],
  },
  {
    slug: "sgi",
    term: "SGI",
    acronym: "Société de Gestion et d'Intermédiation",
    short:
      "Intermédiaire agréé par le CREPMF pour passer des ordres en bourse pour le compte de clients.",
    long:
      "Toute opération sur la BRVM passe par une SGI. Une vingtaine de SGI agréées dans l'UEMOA (BICI Bourse, SGI CI, Hudson and Cie, etc.). Frais variables : commission + droits + taxes (1 à 2 % par opération typique). Comparer avant de choisir.",
    category: "reglementation",
    related: ["crepmf", "brvm", "sgp"],
    tags: ["SGI", "courtage"],
  },
  {
    slug: "sgp",
    term: "SGP",
    acronym: "Société de Gestion de Patrimoine",
    short:
      "Société agréée pour la gestion de portefeuilles individuels et d'OPCVM.",
    long:
      "La SGP gère les FCP / SICAV pour le compte d'investisseurs privés et institutionnels. Différente de la SGI qui n'est qu'un intermédiaire d'exécution. Quelques SGP majeures : Phoenix Capital, NSIA Asset Management, Africaine de Bourse Asset Management.",
    category: "reglementation",
    related: ["sgi", "fcp", "opcvm"],
    tags: ["SGP", "gestion d'actifs"],
  },
  {
    slug: "dc-br",
    term: "DC/BR",
    acronym: "Dépositaire Central / Banque de Règlement",
    short:
      "Conserve les titres et règle les transactions BRVM en J+3.",
    long:
      "Le DC/BR est l'infrastructure post-marché de la BRVM : il enregistre la propriété des titres en compte et garantit le règlement-livraison. Cycle J+3 : la transaction est exécutée à J, le règlement-livraison effectif à J+3.",
    category: "reglementation",
    related: ["brvm", "sgi"],
    tags: ["DC/BR", "post-marché"],
  },
  {
    slug: "opcvm",
    term: "OPCVM",
    acronym: "Organisme de Placement Collectif en Valeurs Mobilières",
    short: "Véhicule collectif d'investissement géré par une société de gestion agréée.",
    long:
      "Catégorie qui regroupe les SICAV et les FCP. L'OPCVM est obligatoirement agréé par le CREPMF, doit respecter des règles de diversification strictes et publier régulièrement sa valeur liquidative. Frais clés : entrée, gestion annuelle, sortie.",
    category: "reglementation",
    related: ["fcp", "sgp"],
    tags: ["OPCVM"],
  },
  {
    slug: "fcp",
    term: "FCP",
    acronym: "Fonds Commun de Placement",
    short: "OPCVM sans personnalité morale, propriété indivise des porteurs de parts.",
    long:
      "Le FCP est la forme juridique la plus courante d'OPCVM dans l'UEMOA. L'investisseur achète des parts dont la valeur (VL = valeur liquidative) varie selon la performance du portefeuille sous-jacent. Pas d'AG d'actionnaires (différence avec SICAV). Listing CREPMF des FCP autorisés en commercialisation.",
    category: "reglementation",
    related: ["opcvm", "sgp"],
    tags: ["FCP"],
  },

  // ---------- FISCALITE ----------
  {
    slug: "imposition-dividendes",
    term: "Imposition des dividendes",
    short:
      "Prélèvement à la source ou imposition globale selon le pays UEMOA.",
    long:
      "Selon les pays UEMOA, le taux varie : 10-15 % de retenue à la source au Sénégal, 12 % en Côte d'Ivoire (libératoire), variable au Mali et Burkina. Pour un investisseur non-résident, application de la convention fiscale bilatérale qui peut réduire le taux à 5-10 %.",
    category: "fiscalite",
    related: ["dividende", "convention-fiscale", "retenue-source"],
    tags: ["imposition", "dividendes"],
  },
  {
    slug: "imposition-plus-values",
    term: "Imposition des plus-values",
    short:
      "Régime fiscal applicable aux gains de cession sur titres BRVM.",
    long:
      "Régimes très variables : exonération partielle au Sénégal pour les particuliers, imposition à l'IR ou à un taux libératoire dans d'autres pays. Sur les obligations souveraines UEMOA, exonération souvent prévue. Toujours vérifier dans le code général des impôts du pays de résidence.",
    category: "fiscalite",
    related: ["plus-value", "convention-fiscale"],
    tags: ["imposition", "plus-values"],
  },
  {
    slug: "convention-fiscale",
    term: "Convention fiscale",
    short:
      "Accord bilatéral entre 2 pays pour éviter la double imposition.",
    long:
      "Les pays UEMOA ont signé des conventions avec la France, l'UE, certains pays africains. Pour un investisseur non-résident, la convention fixe le taux maximal de retenue à la source sur dividendes et coupons. Prévoit aussi le mécanisme de crédit d'impôt dans le pays de résidence.",
    category: "fiscalite",
    related: ["retenue-source", "imposition-dividendes"],
    tags: ["convention", "double imposition"],
  },
  {
    slug: "retenue-source",
    term: "Retenue à la source",
    short:
      "Prélèvement fiscal effectué directement par le payeur, avant versement au bénéficiaire.",
    long:
      "Sur les dividendes BRVM, la SGI dépositaire prélève la retenue avant le crédit en compte. Pour le résident UEMOA, c'est généralement libératoire ; pour le non-résident, le taux dépend de la convention fiscale.",
    category: "fiscalite",
    related: ["imposition-dividendes", "convention-fiscale"],
    tags: ["retenue", "prélèvement"],
  },

  // ---------- GENERAL ----------
  {
    slug: "actif-financier",
    term: "Actif financier",
    short:
      "Titre de propriété ou de créance, dont la valeur dépend de revenus futurs ou de l'offre/demande.",
    long:
      "Les actifs financiers se classent en actions (capitaux propres), obligations (créance), instruments dérivés et OPCVM. Sur la BRVM, on trouve essentiellement des actions et des obligations cotées. Le marché interbancaire UEMOA gère séparément les titres souverains UMOA-Titres.",
    category: "general",
    related: ["action", "obligation", "opcvm"],
    tags: ["actif", "financier"],
  },
  {
    slug: "liquidite",
    term: "Liquidité",
    short:
      "Capacité à acheter ou vendre rapidement un actif sans impacter son prix.",
    long:
      "Sur la BRVM, la liquidité est très inégale : SONATEL et BICC s'échangent quotidiennement avec un spread serré, tandis que des small caps peuvent rester sans transaction plusieurs jours. Volume médian quotidien et fréquence des transactions sont les deux mesures clés.",
    category: "general",
    related: ["flottant", "carnet-ordres"],
    tags: ["liquidité"],
  },
  {
    slug: "rendement",
    term: "Rendement",
    short:
      "Gain total exprimé en pourcentage du capital investi, sur une période donnée.",
    long:
      "Rendement total = (Plus-value + Dividendes / Coupons) / Capital initial. Distinguer rendement brut et net (après fiscalité, frais, inflation). Pour comparer 2 actifs, ramener au même horizon (annualisé).",
    category: "general",
    related: ["plus-value", "dividende", "coupon"],
    tags: ["rendement", "performance"],
  },
  {
    slug: "correlation",
    term: "Corrélation",
    short:
      "Mesure statistique de la relation entre les variations de 2 actifs (-1 à +1).",
    long:
      "Calculée par le coefficient de Pearson sur les rendements quotidiens. +1 = parfaitement corrélés, 0 = indépendants, -1 = anti-corrélés. Beaucoup de valeurs BRVM sont fortement corrélées (cycle ivoirien, MP), ce qui limite l'effet diversification au sein de la zone.",
    category: "portefeuille",
    related: ["diversification", "beta"],
    tags: ["corrélation", "Pearson"],
  },
];

// =============================================================================
// HELPERS
// =============================================================================

export const GLOSSAIRE_BY_SLUG: Record<string, GlossTerm> = Object.fromEntries(
  GLOSSAIRE.map((t) => [t.slug, t]),
);

/** Retire les accents pour les comparaisons et l'indexation alphabétique */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function firstLetter(term: string): string {
  const n = normalizeForSearch(term);
  const c = n.charAt(0);
  return c >= "a" && c <= "z" ? c.toUpperCase() : "#";
}

export function getGlossaireStats(): {
  total: number;
  byCategory: Record<GlossCategory, number>;
  byLetter: Record<string, number>;
  uniqueLetters: number;
} {
  const byCategory = {
    bourse: 0, obligations: 0, analyse: 0, macro: 0,
    portefeuille: 0, reglementation: 0, fiscalite: 0, general: 0,
  } as Record<GlossCategory, number>;
  const byLetter: Record<string, number> = {};
  for (const t of GLOSSAIRE) {
    byCategory[t.category]++;
    const l = firstLetter(t.term);
    byLetter[l] = (byLetter[l] ?? 0) + 1;
  }
  return {
    total: GLOSSAIRE.length,
    byCategory,
    byLetter,
    uniqueLetters: Object.keys(byLetter).length,
  };
}

export function groupByLetter(terms: GlossTerm[]): { letter: string; items: GlossTerm[] }[] {
  const map = new Map<string, GlossTerm[]>();
  for (const t of terms) {
    const l = firstLetter(t.term);
    const arr = map.get(l) ?? [];
    arr.push(t);
    map.set(l, arr);
  }
  // Tri alphabetique des termes au sein de chaque lettre
  for (const arr of map.values()) {
    arr.sort((a, b) => normalizeForSearch(a.term).localeCompare(normalizeForSearch(b.term)));
  }
  // Tri des lettres
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, items]) => ({ letter, items }));
}

export function resolveRelated(term: GlossTerm): GlossTerm[] {
  if (!term.related) return [];
  return term.related
    .map((s) => GLOSSAIRE_BY_SLUG[s])
    .filter((t): t is GlossTerm => t !== undefined);
}

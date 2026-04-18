export const tickerData = [
  { label: "BRVM-C", value: "298,45", change: "+1,24%", up: true },
  { label: "BRVM-30", value: "152,87", change: "+0,89%", up: true },
  { label: "Taux BCEAO", value: "3,50%", change: null, up: null },
  { label: "Interbanc. 1S", value: "4,12%", change: null, up: null },
  { label: "EUR/XOF", value: "655,96", change: null, up: null },
  { label: "USD/XOF", value: "602,34", change: "-0,12%", up: false },
];

export const intradayData = [
  { time: "09:00", value: 294.8 },
  { time: "09:30", value: 295.1 },
  { time: "10:00", value: 295.6 },
  { time: "10:30", value: 296.0 },
  { time: "11:00", value: 295.4 },
  { time: "11:30", value: 296.8 },
  { time: "12:00", value: 297.5 },
  { time: "12:30", value: 297.2 },
  { time: "13:00", value: 298.1 },
  { time: "13:30", value: 298.4 },
  { time: "14:00", value: 298.0 },
  { time: "14:30", value: 298.45 },
];

export const topMovers = [
  { code: "SNTS", name: "Sonatel", price: "22 450", change: "+4,88%", up: true },
  { code: "SIVC", name: "SIVOA", price: "1 895", change: "+3,55%", up: true },
  { code: "BOAB", name: "BOA Benin", price: "5 230", change: "+2,14%", up: true },
  { code: "PALC", name: "Palmci", price: "7 800", change: "-1,82%", up: false },
  { code: "SGBC", name: "SGB CI", price: "14 200", change: "-2,41%", up: false },
];

export const news = [
  {
    category: "BRVM - MARCHES",
    title: "Sonatel franchit la barre des 22 000 FCFA",
    time: "Il y a 42 min",
    color: "blue",
  },
  {
    category: "MARCHE MONETAIRE",
    title: "TPCI: le Tresor leve 120 milliards FCFA a 6,25%",
    time: "Il y a 2h",
    color: "amber",
  },
  {
    category: "BANQUE - CI",
    title: "BOA CI publie un PNB en hausse de 18% au T1 2026",
    time: "Il y a 4h",
    color: "green",
  },
];

export const stocks = [
  { code: "SNTS", sector: "Telecoms", price: "22 450", change: "+4,88%", up: true, volume: "18 420", capi: "2 245 000", per: "12,4", yield: "7,8%" },
  { code: "BOAB", sector: "Banque", price: "5 230", change: "+2,14%", up: true, volume: "12 840", capi: "523 000", per: "6,8", yield: "9,2%" },
  { code: "SGBC", sector: "Banque", price: "14 200", change: "-2,41%", up: false, volume: "4 125", capi: "1 420 000", per: "8,9", yield: "6,5%" },
  { code: "PALC", sector: "Agro-ind.", price: "7 800", change: "-1,82%", up: false, volume: "3 280", capi: "780 000", per: "9,5", yield: "5,9%" },
  { code: "SIVC", sector: "Agro-ind.", price: "1 895", change: "+3,55%", up: true, volume: "24 100", capi: "189 500", per: "7,2", yield: "8,4%" },
];

// Donnees detaillees par titre
export type StockDetail = {
  code: string;
  name: string;
  sector: string;
  country: string;
  isin: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  capitalization: number;
  sharesOutstanding: number;
  float: number;
  avgVolume3M: number;
  per: number;
  yield: number;
  high52w: number;
  low52w: number;
  yearChange: number;
  volatility: number;
  description: string;
  priceHistory: { date: string; value: number }[];
};

export const stocksDetails: Record<string, StockDetail> = {
  SNTS: {
    code: "SNTS",
    name: "Sonatel",
    sector: "Telecommunications",
    country: "Senegal",
    isin: "SN0000000001",
    price: 22450,
    change: 1045,
    changePercent: 4.88,
    open: 21500,
    high: 22500,
    low: 21450,
    previousClose: 21405,
    volume: 18420,
    capitalization: 2245000,
    sharesOutstanding: 100000000,
    float: 17.8,
    avgVolume3M: 14250,
    per: 12.4,
    yield: 7.8,
    high52w: 22900,
    low52w: 17250,
    yearChange: 28.4,
    volatility: 18.2,
    description:
      "Sonatel est le premier operateur de telecommunications en Afrique de l'Ouest, filiale du groupe Orange. La societe opere au Senegal, Mali, Guinee, Guinee-Bissau et Sierra Leone.",
    priceHistory: [
      { date: "Avr 25", value: 17500 },
      { date: "Mai 25", value: 17800 },
      { date: "Juin 25", value: 18200 },
      { date: "Juil 25", value: 18900 },
      { date: "Aout 25", value: 19500 },
      { date: "Sept 25", value: 19200 },
      { date: "Oct 25", value: 20100 },
      { date: "Nov 25", value: 20800 },
      { date: "Dec 25", value: 21200 },
      { date: "Jan 26", value: 21500 },
      { date: "Fev 26", value: 21800 },
      { date: "Mar 26", value: 22100 },
      { date: "Avr 26", value: 22450 },
    ],
  },
  BOAB: {
    code: "BOAB",
    name: "BOA Benin",
    sector: "Banque",
    country: "Benin",
    isin: "BJ0000000001",
    price: 5230,
    change: 110,
    changePercent: 2.14,
    open: 5150,
    high: 5250,
    low: 5120,
    previousClose: 5120,
    volume: 12840,
    capitalization: 523000,
    sharesOutstanding: 100000000,
    float: 22.5,
    avgVolume3M: 9500,
    per: 6.8,
    yield: 9.2,
    high52w: 5400,
    low52w: 4200,
    yearChange: 15.6,
    volatility: 14.3,
    description:
      "Bank of Africa Benin, filiale du groupe BOA, est l'une des principales banques du Benin avec une forte presence dans la banque de detail et la banque d'entreprise.",
    priceHistory: [
      { date: "Avr 25", value: 4200 },
      { date: "Mai 25", value: 4350 },
      { date: "Juin 25", value: 4500 },
      { date: "Juil 25", value: 4650 },
      { date: "Aout 25", value: 4800 },
      { date: "Sept 25", value: 4950 },
      { date: "Oct 25", value: 5000 },
      { date: "Nov 25", value: 5050 },
      { date: "Dec 25", value: 5100 },
      { date: "Jan 26", value: 5150 },
      { date: "Fev 26", value: 5180 },
      { date: "Mar 26", value: 5200 },
      { date: "Avr 26", value: 5230 },
    ],
  },
  SGBC: {
    code: "SGBC",
    name: "Societe Generale CI",
    sector: "Banque",
    country: "Cote d'Ivoire",
    isin: "CI0000000001",
    price: 14200,
    change: -350,
    changePercent: -2.41,
    open: 14550,
    high: 14600,
    low: 14150,
    previousClose: 14550,
    volume: 4125,
    capitalization: 1420000,
    sharesOutstanding: 100000000,
    float: 18.2,
    avgVolume3M: 5200,
    per: 8.9,
    yield: 6.5,
    high52w: 15800,
    low52w: 12500,
    yearChange: 8.2,
    volatility: 16.8,
    description:
      "Societe Generale Cote d'Ivoire est une filiale du groupe francais Societe Generale, acteur historique du secteur bancaire ivoirien.",
    priceHistory: [
      { date: "Avr 25", value: 13100 },
      { date: "Mai 25", value: 13400 },
      { date: "Juin 25", value: 13800 },
      { date: "Juil 25", value: 14200 },
      { date: "Aout 25", value: 14500 },
      { date: "Sept 25", value: 14800 },
      { date: "Oct 25", value: 15200 },
      { date: "Nov 25", value: 15000 },
      { date: "Dec 25", value: 14800 },
      { date: "Jan 26", value: 14600 },
      { date: "Fev 26", value: 14500 },
      { date: "Mar 26", value: 14400 },
      { date: "Avr 26", value: 14200 },
    ],
  },
  PALC: {
    code: "PALC",
    name: "Palmci",
    sector: "Agro-industrie",
    country: "Cote d'Ivoire",
    isin: "CI0000000002",
    price: 7800,
    change: -145,
    changePercent: -1.82,
    open: 7945,
    high: 7950,
    low: 7750,
    previousClose: 7945,
    volume: 3280,
    capitalization: 780000,
    sharesOutstanding: 100000000,
    float: 25.3,
    avgVolume3M: 4100,
    per: 9.5,
    yield: 5.9,
    high52w: 8500,
    low52w: 7200,
    yearChange: 5.4,
    volatility: 12.1,
    description:
      "Palmci est un acteur majeur de la filiere huile de palme en Cote d'Ivoire, integre de la plantation a la production d'huile raffinee.",
    priceHistory: [
      { date: "Avr 25", value: 7400 },
      { date: "Mai 25", value: 7550 },
      { date: "Juin 25", value: 7700 },
      { date: "Juil 25", value: 7800 },
      { date: "Aout 25", value: 7900 },
      { date: "Sept 25", value: 8100 },
      { date: "Oct 25", value: 8200 },
      { date: "Nov 25", value: 8300 },
      { date: "Dec 25", value: 8200 },
      { date: "Jan 26", value: 8100 },
      { date: "Fev 26", value: 8000 },
      { date: "Mar 26", value: 7900 },
      { date: "Avr 26", value: 7800 },
    ],
  },
  SIVC: {
    code: "SIVC",
    name: "SIVOA",
    sector: "Agro-industrie",
    country: "Cote d'Ivoire",
    isin: "CI0000000003",
    price: 1895,
    change: 65,
    changePercent: 3.55,
    open: 1830,
    high: 1900,
    low: 1820,
    previousClose: 1830,
    volume: 24100,
    capitalization: 189500,
    sharesOutstanding: 100000000,
    float: 30.1,
    avgVolume3M: 18500,
    per: 7.2,
    yield: 8.4,
    high52w: 1950,
    low52w: 1450,
    yearChange: 22.8,
    volatility: 19.5,
    description:
      "SIVOA est specialisee dans la production et la commercialisation d'oleagineux et de produits derives en Cote d'Ivoire.",
    priceHistory: [
      { date: "Avr 25", value: 1500 },
      { date: "Mai 25", value: 1550 },
      { date: "Juin 25", value: 1620 },
      { date: "Juil 25", value: 1680 },
      { date: "Aout 25", value: 1720 },
      { date: "Sept 25", value: 1750 },
      { date: "Oct 25", value: 1780 },
      { date: "Nov 25", value: 1800 },
      { date: "Dec 25", value: 1820 },
      { date: "Jan 26", value: 1850 },
      { date: "Fev 26", value: 1870 },
      { date: "Mar 26", value: 1880 },
      { date: "Avr 26", value: 1895 },
    ],
  },
};

// === MARCHE MONETAIRE UEMOA ===

export const moneyMarketIndicators = [
  {
    label: "Taux directeur BCEAO",
    value: "3,50%",
    subtitle: "Inchange depuis dec. 2024",
    trend: "stable" as const,
  },
  {
    label: "Interbancaire 1 semaine",
    value: "4,12%",
    subtitle: "-5 pb / semaine",
    trend: "down" as const,
  },
  {
    label: "TPCI 10 ans (YTM)",
    value: "6,85%",
    subtitle: "+12 pb / semaine",
    trend: "up" as const,
  },
  {
    label: "Inflation UEMOA (g.a.)",
    value: "2,40%",
    subtitle: "Sept. 2026, BCEAO",
    trend: "stable" as const,
  },
];

export const yieldCurveUEMOA = [
  { maturity: "3M", rate: 4.15 },
  { maturity: "6M", rate: 4.45 },
  { maturity: "1A", rate: 5.10 },
  { maturity: "2A", rate: 5.60 },
  { maturity: "3A", rate: 6.05 },
  { maturity: "5A", rate: 6.45 },
  { maturity: "7A", rate: 6.68 },
  { maturity: "10A", rate: 6.85 },
];

export const upcomingAuctions = [
  {
    issuer: "TPCI 2026-2033",
    country: "Cote d'Ivoire",
    date: "22 avril 2026",
    amount: "50 Mds",
    maturity: "7 ans",
    type: "OAT",
  },
  {
    issuer: "BAT Senegal",
    country: "Senegal",
    date: "25 avril 2026",
    amount: "30 Mds",
    maturity: "12 mois",
    type: "BAT",
  },
  {
    issuer: "TPBF 2026-2031",
    country: "Burkina Faso",
    date: "29 avril 2026",
    amount: "40 Mds",
    maturity: "5 ans",
    type: "OAT",
  },
  {
    issuer: "TPCI 2026-2029",
    country: "Cote d'Ivoire",
    date: "6 mai 2026",
    amount: "60 Mds",
    maturity: "3 ans",
    type: "OAT",
  },
  {
    issuer: "BAT Togo",
    country: "Togo",
    date: "13 mai 2026",
    amount: "25 Mds",
    maturity: "6 mois",
    type: "BAT",
  },
];

export const recentIssuances = [
  {
    date: "15 avril 2026",
    issuer: "TPCI 2026-2033",
    country: "CI",
    amount: "120 Mds",
    requested: "185 Mds",
    coverage: "154%",
    rate: "6,25%",
    maturity: "7 ans",
  },
  {
    date: "8 avril 2026",
    issuer: "BAT Senegal",
    country: "SN",
    amount: "40 Mds",
    requested: "62 Mds",
    coverage: "155%",
    rate: "4,85%",
    maturity: "12 mois",
  },
  {
    date: "2 avril 2026",
    issuer: "TPBF 2026-2036",
    country: "BF",
    amount: "35 Mds",
    requested: "48 Mds",
    coverage: "137%",
    rate: "7,20%",
    maturity: "10 ans",
  },
  {
    date: "25 mars 2026",
    issuer: "TPCI 2026-2028",
    country: "CI",
    amount: "80 Mds",
    requested: "142 Mds",
    coverage: "178%",
    rate: "5,45%",
    maturity: "2 ans",
  },
  {
    date: "18 mars 2026",
    issuer: "BAT Mali",
    country: "ML",
    amount: "20 Mds",
    requested: "28 Mds",
    coverage: "140%",
    rate: "5,15%",
    maturity: "6 mois",
  },
  {
    date: "11 mars 2026",
    issuer: "TPTG 2026-2031",
    country: "TG",
    amount: "30 Mds",
    requested: "45 Mds",
    coverage: "150%",
    rate: "6,75%",
    maturity: "5 ans",
  },
];
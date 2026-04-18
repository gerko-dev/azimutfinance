// Données d'exemple pour AzimutFinance
// À remplacer plus tard par des vraies données BRVM

export const tickerData = [
  { label: "BRVM-C", value: "298,45", change: "+1,24%", up: true },
  { label: "BRVM-30", value: "152,87", change: "+0,89%", up: true },
  { label: "Taux BCEAO", value: "3,50%", change: null, up: null },
  { label: "Interbanc. 1S", value: "4,12%", change: null, up: null },
  { label: "EUR/XOF", value: "655,96", change: null, up: null },
  { label: "USD/XOF", value: "602,34", change: "−0,12%", up: false },
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
  { code: "BOAB", name: "BOA Bénin", price: "5 230", change: "+2,14%", up: true },
  { code: "PALC", name: "Palmci", price: "7 800", change: "−1,82%", up: false },
  { code: "SGBC", name: "SGB CI", price: "14 200", change: "−2,41%", up: false },
];

export const news = [
  {
    category: "BRVM · MARCHÉS",
    title: "Sonatel franchit la barre des 22 000 FCFA après des résultats solides",
    time: "Il y a 42 min · 3 min de lecture",
    color: "blue" as const,
  },
  {
    category: "MARCHÉ MONÉTAIRE · UEMOA",
    title: "Émission TPCI : le Trésor lève 120 milliards FCFA à 6,25%",
    time: "Il y a 2h · 4 min de lecture",
    color: "amber" as const,
  },
  {
    category: "BANQUE · CÔTE D'IVOIRE",
    title: "BOA CI publie un PNB en hausse de 18% au T1 2026",
    time: "Il y a 4h · 5 min de lecture",
    color: "green" as const,
  },
];

export const stocks = [
  { code: "SNTS", sector: "Télécoms", price: "22 450", change: "+4,88%", up: true, volume: "18 420", capi: "2 245 000", per: "12,4", yield: "7,8%" },
  { code: "BOAB", sector: "Banque", price: "5 230", change: "+2,14%", up: true, volume: "12 840", capi: "523 000", per: "6,8", yield: "9,2%" },
  { code: "SGBC", sector: "Banque", price: "14 200", change: "−2,41%", up: false, volume: "4 125", capi: "1 420 000", per: "8,9", yield: "6,5%" },
  { code: "PALC", sector: "Agro-ind.", price: "7 800", change: "−1,82%", up: false, volume: "3 280", capi: "780 000", per: "9,5", yield: "5,9%" },
  { code: "SIVC", sector: "Agro-ind.", price: "1 895", change: "+3,55%", up: true, volume: "24 100", capi: "189 500", per: "7,2", yield: "8,4%" },
];
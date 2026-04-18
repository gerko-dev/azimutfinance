"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Données d'exemple — plus tard on les remplacera par des vraies données BRVM
const intradayData = [
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

const topMovers = [
  { code: "SNTS", name: "Sonatel", price: "22 450", change: "+4,88%", up: true },
  { code: "SIVC", name: "SIVOA", price: "1 895", change: "+3,55%", up: true },
  { code: "BOAB", name: "BOA Bénin", price: "5 230", change: "+2,14%", up: true },
  { code: "PALC", name: "Palmci", price: "7 800", change: "−1,82%", up: false },
  { code: "SGBC", name: "SGB CI", price: "14 200", change: "−2,41%", up: false },
];

const news = [
  {
    category: "BRVM · MARCHÉS",
    title: "Sonatel franchit la barre des 22 000 FCFA après des résultats solides",
    time: "Il y a 42 min · 3 min de lecture",
    color: "blue",
  },
  {
    category: "MARCHÉ MONÉTAIRE · UEMOA",
    title: "Émission TPCI : le Trésor lève 120 milliards FCFA à 6,25%",
    time: "Il y a 2h · 4 min de lecture",
    color: "amber",
  },
  {
    category: "BANQUE · CÔTE D'IVOIRE",
    title: "BOA CI publie un PNB en hausse de 18% au T1 2026",
    time: "Il y a 4h · 5 min de lecture",
    color: "green",
  },
];

const stocks = [
  { code: "SNTS", sector: "Télécoms", price: "22 450", change: "+4,88%", up: true, volume: "18 420", capi: "2 245 000", per: "12,4", yield: "7,8%" },
  { code: "BOAB", sector: "Banque", price: "5 230", change: "+2,14%", up: true, volume: "12 840", capi: "523 000", per: "6,8", yield: "9,2%" },
  { code: "SGBC", sector: "Banque", price: "14 200", change: "−2,41%", up: false, volume: "4 125", capi: "1 420 000", per: "8,9", yield: "6,5%" },
  { code: "PALC", sector: "Agro-ind.", price: "7 800", change: "−1,82%", up: false, volume: "3 280", capi: "780 000", per: "9,5", yield: "5,9%" },
  { code: "SIVC", sector: "Agro-ind.", price: "1 895", change: "+3,55%", up: true, volume: "24 100", capi: "189 500", per: "7,2", yield: "8,4%" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ========== HEADER ========== */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="text-xl font-semibold tracking-tight">
              <span className="text-blue-700">Azimut</span>
              <span className="text-slate-900">Finance</span>
            </div>
            <nav className="flex gap-6 text-sm">
              <a href="#" className="text-slate-900 font-medium">Marchés</a>
              <a href="#" className="text-blue-700 font-medium">Marché monétaire</a>
              <a href="#" className="text-slate-600 hover:text-slate-900">Actualités</a>
              <a href="#" className="text-slate-600 hover:text-slate-900">Analyses</a>
              <a href="#" className="text-slate-600 hover:text-slate-900">Outils Pro</a>
              <a href="#" className="text-slate-600 hover:text-slate-900">Immobilier</a>
              <a href="#" className="text-slate-600 hover:text-slate-900">API</a>
            </nav>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50">
              Connexion
            </button>
            <button className="px-4 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800">
              S'abonner Premium
            </button>
          </div>
        </div>
      </header>

      {/* ========== TICKER ========== */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex gap-6 text-sm overflow-x-auto">
          <div className="flex gap-2 whitespace-nowrap">
            <span className="text-slate-500">BRVM-C</span>
            <span className="font-medium">298,45</span>
            <span className="text-green-600">+1,24%</span>
          </div>
          <div className="flex gap-2 whitespace-nowrap">
            <span className="text-slate-500">BRVM-30</span>
            <span className="font-medium">152,87</span>
            <span className="text-green-600">+0,89%</span>
          </div>
          <div className="flex gap-2 whitespace-nowrap">
            <span className="text-slate-500">Taux BCEAO</span>
            <span className="font-medium">3,50%</span>
          </div>
          <div className="flex gap-2 whitespace-nowrap">
            <span className="text-slate-500">Interbanc. 1S</span>
            <span className="font-medium">4,12%</span>
          </div>
          <div className="flex gap-2 whitespace-nowrap">
            <span className="text-slate-500">EUR/XOF</span>
            <span className="font-medium">655,96</span>
          </div>
          <div className="flex gap-2 whitespace-nowrap">
            <span className="text-slate-500">USD/XOF</span>
            <span className="font-medium">602,34</span>
            <span className="text-red-600">−0,12%</span>
          </div>
        </div>
      </div>

      {/* ========== CONTENU PRINCIPAL ========== */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Ligne 1 : Graphique BRVM + Top Mouvements */}
        <div className="grid grid-cols-3 gap-6">
          {/* Carte graphique BRVM */}
          <div className="col-span-2 bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex justify-between items-baseline mb-3">
              <h3 className="text-base font-medium">BRVM Composite — séance du jour</h3>
              <span className="text-xs text-slate-400">Mis à jour 14:32 GMT</span>
            </div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-3xl font-semibold">298,45</span>
              <span className="text-sm text-green-600 font-medium">+3,65 (+1,24%)</span>
            </div>

            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={intradayData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} domain={["dataMin - 1", "dataMax + 0.5"]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#16a34a"
                    strokeWidth={2}
                    fill="url(#colorValue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex gap-2 mt-3 text-xs">
              <button className="px-3 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200">1J</button>
              <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">5J</button>
              <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">1M</button>
              <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">6M</button>
              <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">1A</button>
              <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">Max</button>
            </div>
          </div>

          {/* Carte Top Mouvements */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex justify-between items-baseline mb-3">
              <h3 className="text-base font-medium">Top mouvements</h3>
              <span className="text-xs text-slate-400">Temps réel</span>
            </div>
            <div className="space-y-3">
              {topMovers.map((stock, i) => (
                <div
                  key={stock.code}
                  className={`flex justify-between items-center ${
                    i < topMovers.length - 1 ? "pb-3 border-b border-slate-100" : ""
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{stock.code}</div>
                    <div className="text-xs text-slate-400">{stock.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{stock.price}</div>
                    <div className={`text-xs ${stock.up ? "text-green-600" : "text-red-600"}`}>
                      {stock.change}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ligne 2 : Actualités + Encart Premium */}
        <div className="grid grid-cols-3 gap-6">
          {/* Actualités */}
          <div className="col-span-2 bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex justify-between items-baseline mb-4">
              <h3 className="text-base font-medium">À la une</h3>
              <a href="#" className="text-xs text-blue-700 hover:underline">Voir tout →</a>
            </div>
            <div className="space-y-4">
              {news.map((article, i) => {
                const colors: Record<string, string> = {
                  blue: "bg-blue-50 text-blue-700",
                  amber: "bg-amber-50 text-amber-700",
                  green: "bg-green-50 text-green-700",
                };
                return (
                  <div
                    key={i}
                    className={`flex gap-3 ${
                      i < news.length - 1 ? "pb-4 border-b border-slate-100" : ""
                    }`}
                  >
                    <div className={`w-24 h-16 rounded-md flex-shrink-0 ${colors[article.color].split(" ")[0]}`}></div>
                    <div>
                      <div className={`text-xs font-medium mb-1 ${colors[article.color].split(" ")[1]}`}>
                        {article.category}
                      </div>
                      <div className="text-sm font-medium mb-1">{article.title}</div>
                      <div className="text-xs text-slate-500">{article.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Encart Premium */}
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
            <div className="text-xs font-medium text-blue-700 mb-2">PREMIUM</div>
            <h3 className="text-base font-medium text-blue-900 mb-2">Outils pro UEMOA</h3>
            <p className="text-sm text-blue-800 mb-4 leading-relaxed">
              Calculateurs obligataires, screener multi-critères, alertes et API data.
            </p>
            <ul className="space-y-2 text-sm text-blue-900">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-700 rounded-full"></span>
                Calculateur YTM & Duration
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-700 rounded-full"></span>
                Screener actions & obligations
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-700 rounded-full"></span>
                Simulateur de VL FCP
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-700 rounded-full"></span>
                Alertes SMS & email
              </li>
            </ul>
            <button className="w-full mt-4 py-2 bg-blue-700 text-white text-sm rounded-md hover:bg-blue-800">
              Essai gratuit 14 jours
            </button>
          </div>
        </div>

        {/* Ligne 3 : Tableau des cotations */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex justify-between items-baseline mb-4">
            <h3 className="text-base font-medium">Cotations BRVM</h3>
            <div className="flex gap-2 text-xs">
              <button className="px-3 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200">Actions</button>
              <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">Obligations</button>
              <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">OPCVM</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 font-medium">Titre</th>
                <th className="text-left py-2 font-medium">Secteur</th>
                <th className="text-right py-2 font-medium">Cours</th>
                <th className="text-right py-2 font-medium">Var.</th>
                <th className="text-right py-2 font-medium">Volume</th>
                <th className="text-right py-2 font-medium">Capi (M)</th>
                <th className="text-right py-2 font-medium">P/E</th>
                <th className="text-right py-2 font-medium">Rend.</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s, i) => (
                <tr
                  key={s.code}
                  className={i < stocks.length - 1 ? "border-b border-slate-100" : ""}
                >
                  <td className="py-3 font-medium">{s.code}</td>
                  <td className="py-3 text-slate-500">{s.sector}</td>
                  <td className="py-3 text-right">{s.price}</td>
                  <td className={`py-3 text-right ${s.up ? "text-green-600" : "text-red-600"}`}>
                    {s.change}
                  </td>
                  <td className="py-3 text-right">{s.volume}</td>
                  <td className="py-3 text-right">{s.capi}</td>
                  <td className="py-3 text-right">{s.per}</td>
                  <td className="py-3 text-right">{s.yield}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </main>
    </div>
  );
}
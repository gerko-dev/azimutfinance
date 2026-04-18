export default function PremiumCard() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
      <div className="text-xs font-medium text-blue-700 mb-2">PREMIUM</div>
      <h3 className="text-base font-medium text-blue-900 mb-2">Outils pro UEMOA</h3>
      <p className="text-sm text-blue-800 mb-4 leading-relaxed">
        Calculateurs obligataires, screener multi-critères, alertes et API data.
      </p>
      <ul className="space-y-2 text-sm text-blue-900">
        <li className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-blue-700 rounded-full"></span>
          Calculateur YTM &amp; Duration
        </li>
        <li className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-blue-700 rounded-full"></span>
          Screener actions &amp; obligations
        </li>
        <li className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-blue-700 rounded-full"></span>
          Simulateur de VL FCP
        </li>
        <li className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-blue-700 rounded-full"></span>
          Alertes SMS &amp; email
        </li>
      </ul>
      <button className="w-full mt-4 py-2 bg-blue-700 text-white text-sm rounded-md hover:bg-blue-800">
        Essai gratuit 14 jours
      </button>
    </div>
  );
}
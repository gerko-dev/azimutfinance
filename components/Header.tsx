export default function Header() {
  return (
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
            S&apos;abonner Premium
          </button>
        </div>
      </div>
    </header>
  );
}
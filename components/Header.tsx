"use client";

import { useState } from "react";
import Link from "next/link";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
        {/* Logo + Menu bureau */}
        <div className="flex items-center gap-4 md:gap-8">
          <div className="text-lg md:text-xl font-semibold tracking-tight">
            <span className="text-blue-700">Azimut</span>
            <span className="text-slate-900">Finance</span>
          </div>

          {/* Menu visible uniquement sur desktop */}
          <nav className="hidden lg:flex gap-6 text-sm">
            <a href="#" className="text-slate-900 font-medium">Marchés</a>
            <Link href="/marche-monetaire" className="text-blue-700 font-medium">Marché monétaire</Link>
            <a href="#" className="text-slate-600 hover:text-slate-900">Actualités</a>
            <a href="#" className="text-slate-600 hover:text-slate-900">Analyses</a>
            <a href="#" className="text-slate-600 hover:text-slate-900">Outils Pro</a>
            <a href="#" className="text-slate-600 hover:text-slate-900">Immobilier</a>
            <a href="#" className="text-slate-600 hover:text-slate-900">API</a>
          </nav>
        </div>

        {/* Boutons desktop */}
        <div className="hidden md:flex gap-2">
          <button className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50">
            Connexion
          </button>
          <button className="px-3 lg:px-4 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800">
            S&apos;abonner
          </button>
        </div>

        {/* Bouton hamburger mobile */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 rounded-md hover:bg-slate-100"
          aria-label="Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Menu mobile déroulant */}
      {menuOpen && (
        <nav className="lg:hidden border-t border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-3 text-sm">
            <a href="#" className="text-slate-900 font-medium py-1">Marchés</a>
            <Link href="/marche-monetaire" className="text-blue-700 font-medium py-1">Marché monétaire</Link>
            <a href="#" className="text-slate-600 py-1">Actualités</a>
            <a href="#" className="text-slate-600 py-1">Analyses</a>
            <a href="#" className="text-slate-600 py-1">Outils Pro</a>
            <a href="#" className="text-slate-600 py-1">Immobilier</a>
            <a href="#" className="text-slate-600 py-1">API</a>
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-md">
                Connexion
              </button>
              <button className="flex-1 px-4 py-2 text-sm bg-blue-700 text-white rounded-md">
                S&apos;abonner
              </button>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
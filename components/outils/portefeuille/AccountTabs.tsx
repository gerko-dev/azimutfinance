"use client";

import { useState } from "react";

/**
 * Onglets du compte.
 *
 * Les panneaux arrivent rendus cote serveur, en slots : l'analyse lit les
 * historiques de cours, ce qui n'a rien a faire dans le navigateur.
 *
 * L'onglet inactif est masque par `hidden`, pas demonte — le graphique de
 * valorisation remesurerait son conteneur a chaque retour, ce qui produit un
 * saut visible. Et aucun fragment d'URL ici, contrairement aux onglets macro :
 * un compte est une page privee, il n'y a pas de lien a partager.
 */
export default function AccountTabs({
  suivi,
  analyse,
  optimal,
}: {
  suivi: React.ReactNode;
  analyse: React.ReactNode;
  optimal: React.ReactNode;
}) {
  const [actif, setActif] = useState<"suivi" | "analyse" | "optimal">("suivi");

  const onglets = [
    { id: "suivi" as const, label: "Suivi" },
    { id: "analyse" as const, label: "Analyse" },
    { id: "optimal" as const, label: "Portefeuille optimal" },
  ];

  return (
    <>
      <div className="flex gap-1 border-b border-slate-200">
        {onglets.map((o) => (
          <button
            key={o.id}
            onClick={() => setActif(o.id)}
            aria-current={actif === o.id ? "page" : undefined}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition ${
              actif === o.id
                ? "border-blue-600 text-blue-700 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div hidden={actif !== "suivi"}>{suivi}</div>
      <div hidden={actif !== "analyse"}>{analyse}</div>
      <div hidden={actif !== "optimal"}>{optimal}</div>
    </>
  );
}

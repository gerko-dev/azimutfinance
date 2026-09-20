"use client";

// Sélecteur de périmètre d'un écran interfonds.
//
// Le choix vit dans l'URL et non dans un état React : la page est rendue au
// serveur, elle doit donc se recharger pour changer de fonds. Le passer par
// l'URL rend aussi la vue PARTAGEABLE et rechargeable — un point de trésorerie
// qu'on envoie à un collègue doit s'ouvrir sur le même fonds.

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export default function SelecteurFonds({
  fonds,
  valeur,
  valeurGlobale,
  libelleGlobal,
  parametre = "fonds",
}: {
  fonds: { id: string; nom: string }[];
  valeur: string;
  /** Valeur conventionnelle de la vue consolidée. */
  valeurGlobale: string;
  libelleGlobal: string;
  parametre?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [enCours, demarrer] = useTransition();

  const changer = (v: string) => {
    const suivants = new URLSearchParams(params.toString());
    suivants.set(parametre, v);
    demarrer(() => router.push(`?${suivants.toString()}`));
  };

  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-600">
      <span className="uppercase tracking-wider text-[10px] text-slate-500">Périmètre</span>
      <select
        value={valeur}
        onChange={(e) => changer(e.target.value)}
        disabled={enCours}
        className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white focus:border-blue-400 focus:outline-none disabled:opacity-60"
      >
        <option value={valeurGlobale}>{libelleGlobal}</option>
        {fonds.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nom}
          </option>
        ))}
      </select>
      {enCours && <span className="text-slate-400">chargement…</span>}
    </label>
  );
}

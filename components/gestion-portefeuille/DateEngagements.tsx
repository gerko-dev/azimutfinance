"use client";

// Date de PRISE EN COMPTE DES ENGAGEMENTS.
//
// Elle ne se confond pas avec la date des soldes. Les soldes disent ce qu'il y
// a en banque à un instant ; celle-ci dit jusqu'où l'on regarde les flux à
// venir. Le classeur les distingue déjà — sa cellule « DATE FIN » est au
// 30 septembre quand les soldes sont d'un autre jour.
//
// C'est la question du trésorier : « de quoi vais-je disposer à telle date,
// une fois passé tout ce qui est engagé ? »

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export default function DateEngagements({ valeur }: { valeur: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [enCours, demarrer] = useTransition();
  // Texte local : sans lui, chaque frappe dans un champ date partiellement
  // rempli déclencherait une navigation, et le serveur recalculerait le point
  // sur une date incomplète.
  const [texte, setTexte] = useState(valeur);

  const appliquer = (v: string) => {
    setTexte(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    const suivants = new URLSearchParams(params.toString());
    suivants.set("engagements", v);
    demarrer(() => router.push(`?${suivants.toString()}`));
  };

  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-600">
      <span className="uppercase tracking-wider text-[10px] text-slate-500">
        Engagements jusqu&apos;au
      </span>
      <input
        type="date"
        value={texte}
        onChange={(e) => appliquer(e.target.value)}
        disabled={enCours}
        title="Les flux dénoués jusqu'à cette date sont comptés ; les suivants ne le sont pas."
        className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white focus:border-blue-400 focus:outline-none disabled:opacity-60"
      />
      {enCours && <span className="text-slate-400">recalcul…</span>}
    </label>
  );
}

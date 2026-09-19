"use client";

// === Paramètres — Opérations de marché ===
//
// Conventions de dénouement et commissions de place. Ces valeurs étaient
// écrites dans le code : chaque révision de la BRVM ou du DC/BR imposait un
// déploiement, et — plus grave — rien ne signalait qu'une opération ancienne
// avait été calculée sous l'ancienne règle.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { enregistrerParametresMarcheAction } from "@/app/gestion-portefeuille/parametres-marche-actions";
import {
  LIBELLES_BASE,
  PARAMETRES_DEFAUT,
  type BaseJours,
  type ConventionDenouement,
  type ParametresMarche,
} from "@/app/gestion-portefeuille/parametres-marche-types";
import { dateDenouement } from "@/app/gestion-portefeuille/operations-marche-types";

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";

/** Saisie en POURCENTAGE, stockage en décimal — personne ne pense « 0,003 ». */
const versPct = (v: number) => String(Number((v * 100).toFixed(4)));
const depuisPct = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n / 100 : 0;
};

function Champ({
  label,
  children,
  aide,
}: {
  label: string;
  children: React.ReactNode;
  aide?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={etiquette}>{label}</span>
      {children}
      {aide && <span className="text-[9px] text-slate-400">{aide}</span>}
    </label>
  );
}

/**
 * Un bloc de convention, avec son EXEMPLE CALCULÉ.
 *
 * L'exemple n'est pas décoratif : « J+2 ouvrés » ne dit pas si le jour de
 * négociation compte, ni ce qui se passe quand le délai franchit un férié.
 * Une date réelle, recalculée à chaque frappe, répond aux deux sans qu'on ait
 * à documenter la règle.
 */
function BlocConvention({
  titre,
  description,
  valeur,
  onChange,
}: {
  titre: string;
  description: string;
  valeur: ConventionDenouement;
  onChange: (c: ConventionDenouement) => void;
}) {
  const exemple = new Date().toISOString().slice(0, 10);
  return (
    <div className="border border-slate-200 rounded-md p-3">
      <h4 className="text-xs font-semibold text-slate-800">{titre}</h4>
      <p className="text-[10px] text-slate-500 mt-0.5">{description}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <Champ label="Délai">
          <input
            value={String(valeur.jours)}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
              onChange({ ...valeur, jours: Number.isFinite(n) ? n : 0 });
            }}
            inputMode="numeric"
            className={`${champ} text-right tabular-nums`}
          />
        </Champ>
        <Champ label="Base de comptage">
          <select
            value={valeur.base}
            onChange={(e) => onChange({ ...valeur, base: e.target.value as BaseJours })}
            className={champ}
          >
            {(Object.keys(LIBELLES_BASE) as BaseJours[]).map((b) => (
              <option key={b} value={b}>
                {LIBELLES_BASE[b]}
              </option>
            ))}
          </select>
        </Champ>
      </div>
      <p className="text-[10px] text-slate-500 mt-2 tabular-nums">
        Négociée le {exemple} → dénouée le{" "}
        <strong className="text-slate-800">{dateDenouement(exemple, valeur)}</strong>
      </p>
    </div>
  );
}

export default function ParametresMarchePanel({
  initial,
}: {
  initial: ParametresMarche;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [p, setP] = useState<ParametresMarche>(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const enregistrer = () => {
    setErreur(null);
    setOk(false);
    demarrer(async () => {
      const res = await enregistrerParametresMarcheAction(p);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setOk(true);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-slate-900">Opérations de marché</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Conventions de place appliquées à la saisie des opérations. Elles restent
          modifiables ligne par ligne : ce sont des valeurs de départ, pas des
          contraintes.
        </p>

        <h3 className="text-xs font-semibold text-slate-800 mt-4">
          Convention de dénouement
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-2">
          <BlocConvention
            titre="Marché financier régional"
            description="Actions et obligations cotées."
            valeur={p.mfr}
            onChange={(mfr) => setP((x) => ({ ...x, mfr }))}
          />
          <BlocConvention
            titre="Marché des titres publics"
            description="OAT et BAT des États de l'UEMOA."
            valeur={p.mtp}
            onChange={(mtp) => setP((x) => ({ ...x, mtp }))}
          />
        </div>

        <h3 className="text-xs font-semibold text-slate-800 mt-5">
          Commissions de place
        </h3>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Séparées parce qu&apos;elles sont perçues par deux institutions distinctes
          — la Bourse et le dépositaire central — et révisées indépendamment. Elles
          s&apos;ajoutent l&apos;une à l&apos;autre dans le montant de
          l&apos;opération, et ne s&apos;appliquent qu&apos;au marché financier.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          <Champ label="Commission BRVM (%)" aide="Usuel : 0,3">
            <input
              value={versPct(p.tauxBrvm)}
              onChange={(e) =>
                setP((x) => ({ ...x, tauxBrvm: depuisPct(e.target.value) }))
              }
              inputMode="decimal"
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>
          <Champ label="Commission DC/BR (%)" aide="Dépositaire central">
            <input
              value={versPct(p.tauxDcbr)}
              onChange={(e) =>
                setP((x) => ({ ...x, tauxDcbr: depuisPct(e.target.value) }))
              }
              inputMode="decimal"
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>
        </div>

        <p className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-3">
          Le <strong>courtage</strong> et la <strong>TPS</strong> ne se règlent pas
          ici : ils se négocient avec chaque SGI et vivent sur sa fiche, dans
          l&apos;onglet Partenaires.
        </p>

        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours}
            className="px-4 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
          >
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => setP(PARAMETRES_DEFAUT)}
            className="px-4 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
          >
            Rétablir les conventions de place
          </button>
        </div>

        {erreur && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-3">
            {erreur}
          </p>
        )}
        {ok && !erreur && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 mt-3">
            Paramètres enregistrés. Ils s&apos;appliquent aux prochaines saisies ; les
            opérations déjà enregistrées gardent les taux sous lesquels elles ont été
            saisies.
          </p>
        )}
      </div>
    </div>
  );
}

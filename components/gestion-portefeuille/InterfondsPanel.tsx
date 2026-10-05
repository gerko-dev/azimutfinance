"use client";

// === Opérations entre fonds ===
//
// LA CONTREPARTIE EST PARFOIS DANS LA MAISON. Quand un fonds doit alléger
// SONATEL pendant qu'un autre doit le renforcer, les envoyer tous les deux au
// carnet revient à payer deux courtages et une fourchette pour un titre qui
// n'a jamais quitté la société de gestion.
//
// Cet écran ne fait que DÉSIGNER ces rencontres, à partir des allocations
// validées de tous les fonds gérés. Rien n'est exécuté : l'ordre se saisit
// ensuite dans le carnet, DES DEUX CÔTÉS — un transfert interne reste une
// vente pour l'un et un achat pour l'autre, et la conformité exige qu'il se
// trace comme tel.

import { useEffect, useState, useTransition } from "react";

import { chargerOperationsInterfondsAction } from "@/app/gestion-portefeuille/interfonds-actions";
import {
  LIBELLE_AXE_INTERFONDS,
  type AppariementInterfonds,
  type AxeInterfonds,
  type PlanInterfonds,
} from "@/app/gestion-portefeuille/interfonds-types";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const montant = (v: number) => fmt0.format(Math.round(v));
const pct = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : fmt2.format(v * 100) + " %";
const dateFr = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

const AXES: AxeInterfonds[] = ["action_titre", "obligation_emetteur"];

export default function InterfondsPanel({ fondsId }: { fondsId: string }) {
  const [plan, setPlan] = useState<PlanInterfonds | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, start] = useTransition();
  // CE FONDS D'ABORD. Le comité instruit un portefeuille à la fois, et la
  // liste complète noierait les deux lignes qui le concernent. Le total
  // maison reste accessible d'un clic : c'est lui qui dit si l'écran vaut la
  // peine d'être ouvert.
  const [portee, setPortee] = useState<"fonds" | "maison">("fonds");

  const charger = () =>
    start(async () => {
      const r = await chargerOperationsInterfondsAction();
      if (r.ok) {
        setPlan(r.data);
        setErreur(null);
      } else setErreur(r.error);
    });

  // Au premier affichage seulement : l'appariement lit l'inventaire de tous
  // les fonds, et le relancer à chaque changement d'onglet serait coûteux pour
  // des chiffres qui ne bougent qu'à l'import d'un inventaire.
  useEffect(() => {
    charger();
  }, []);

  const tous = plan?.appariements ?? [];
  const vus =
    portee === "maison"
      ? tous
      : tous.filter((a) => a.vendeur.fondsId === fondsId || a.acheteur.fondsId === fondsId);
  const total = vus.reduce((s, a) => s + a.montant, 0);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Opérations entre fonds
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Les postes où un fonds doit alléger pendant qu&apos;un autre doit
              renforcer. La cession se fait de gré à gré, au prix du marché —
              elle épargne deux courtages, une fourchette et le risque
              d&apos;exécution. Propositions à arbitrer&nbsp;: rien n&apos;est
              exécuté, et l&apos;ordre se saisit ensuite dans le carnet des deux
              côtés.
            </p>
          </div>
          <button
            type="button"
            onClick={charger}
            disabled={enCours}
            className="px-3 py-1.5 rounded text-[11px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-40"
          >
            {enCours ? "Recherche…" : "Recalculer"}
          </button>
        </div>

        <div className="flex gap-1.5 flex-wrap mt-3 items-center">
          {(
            [
              { v: "fonds" as const, l: "Ce fonds" },
              { v: "maison" as const, l: "Tous les fonds" },
            ]
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setPortee(o.v)}
              className={`px-3 py-1 rounded text-[11px] font-medium transition ${
                portee === o.v
                  ? "bg-blue-50 text-blue-700 border border-blue-300"
                  : "text-slate-500 border border-slate-200 hover:text-slate-900 hover:border-slate-400"
              }`}
            >
              {o.l}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-slate-500 tabular-nums">
            {vus.length} appariement(s) · {montant(total)} FCFA
          </span>
        </div>

        {erreur && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-3">
            {erreur}
          </p>
        )}

        {plan && plan.avertissements.length > 0 && (
          <ul className="mt-3 space-y-1">
            {plan.avertissements.map((a) => (
              <li
                key={a}
                className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-1.5"
              >
                {a}
              </li>
            ))}
          </ul>
        )}

        {plan && (
          <p className="text-[10px] text-slate-400 mt-3">
            {plan.fonds.length} fonds confrontés —{" "}
            {plan.fonds
              .map((f) => `${f.nom} (${dateFr(f.dateInventaire)})`)
              .join(" · ")}
          </p>
        )}
      </div>

      {enCours && !plan && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          Lecture des allocations de tous les fonds…
        </div>
      )}

      {plan && vus.length === 0 && !enCours && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          Aucune contrepartie interne.
          <span className="block text-xs text-slate-400 mt-2 max-w-xl mx-auto">
            Il en faut une des deux côtés : un fonds au-dessus de sa cible sur un
            titre — ou sur un émetteur — et un autre en dessous, pour au moins un
            million de francs chacun. Sans allocation validée sur le poste, il
            n&apos;y a ni excédent ni besoin, seulement une détention.
          </span>
        </div>
      )}

      {AXES.map((axe) => {
        const lignes = vus.filter((a) => a.axe === axe);
        if (lignes.length === 0) return null;
        return (
          <Bloc
            key={axe}
            titre={LIBELLE_AXE_INTERFONDS[axe]}
            lignes={lignes}
            fondsId={fondsId}
          />
        );
      })}
    </div>
  );
}

function Bloc({
  titre,
  lignes,
  fondsId,
}: {
  titre: string;
  lignes: AppariementInterfonds[];
  fondsId: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
          {titre}
        </h4>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {montant(lignes.reduce((s, l) => s + l.montant, 0))} FCFA
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Poste</th>
              <th className="text-left px-3 py-2 font-medium">Cède</th>
              <th className="text-left px-3 py-2 font-medium">Reçoit</th>
              <th className="text-right px-3 py-2 font-medium">Montant</th>
              <th className="text-right px-3 py-2 font-medium">Quantité</th>
              <th className="text-left px-3 py-2 font-medium">Ligne à transférer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.map((a, i) => (
              <tr key={`${a.axe}-${a.poste}-${a.vendeur.fondsId}-${a.acheteur.fondsId}-${i}`}>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-slate-800">{a.libelle}</div>
                  {a.poste !== a.libelle && (
                    <div className="text-[10px] text-slate-400">{a.poste}</div>
                  )}
                </td>
                <Partie partie={a.vendeur} fondsId={fondsId} ton="rose" />
                <Partie partie={a.acheteur} fondsId={fondsId} ton="emerald" />
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900 align-top">
                  {montant(a.montant)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums align-top">
                  {a.quantite !== null ? (
                    <>
                      {fmt0.format(a.quantite)}
                      <span className="block text-[10px] text-slate-400">
                        à {fmt0.format(Math.round(a.cours ?? 0))} F
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  {a.lignes.length === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {a.lignes.map((l) => (
                        <li key={l.code} className="text-slate-700">
                          {l.libelle || l.code}
                          <span className="text-slate-400 tabular-nums">
                            {" "}
                            · {montant(l.valorisation)} F
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* LES RÉSERVES NE CACHENT PAS LA PROPOSITION, elles
                      l'accompagnent : c'est au gérant d'arbitrer, pas au
                      calcul de décider à sa place. */}
                  {a.reserves.map((r) => (
                    <p key={r} className="text-[10px] text-amber-700 mt-1">
                      {r}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Un fonds, et ce que le poste pèse chez lui aujourd'hui face à sa cible. */
function Partie({
  partie,
  fondsId,
  ton,
}: {
  partie: AppariementInterfonds["vendeur"];
  fondsId: string;
  ton: "rose" | "emerald";
}) {
  const courant = partie.fondsId === fondsId;
  return (
    <td className="px-3 py-2 align-top">
      <div
        className={`font-medium ${
          courant ? "text-slate-900" : "text-slate-600"
        }`}
      >
        {partie.fondsNom}
        {courant && (
          <span className="ml-1 text-[9px] text-blue-700 uppercase tracking-wider">
            ce fonds
          </span>
        )}
      </div>
      {/* Classes ECRITES EN TOUTES LETTRES : Tailwind lit le source, une
          classe composee a l'execution n'existe pas dans la feuille. */}
      <div
        className={`text-[10px] tabular-nums ${
          ton === "rose" ? "text-rose-700" : "text-emerald-700"
        }`}
      >
        {pct(partie.allocationActuelle)} <span className="text-slate-400">→</span>{" "}
        {pct(partie.allocationValidee)}
      </div>
      <div className="text-[10px] text-slate-400 tabular-nums">
        écart {montant(partie.montantVise)} F
      </div>
    </td>
  );
}

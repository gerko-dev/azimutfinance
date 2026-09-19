"use client";

import { useState } from "react";

import { enregistrerSoldesTresorerieAction } from "@/app/gestion-portefeuille/tresorerie-actions";
import {
  intitule,
  LIGNES_POINT_TRESORERIE,
  type LigneTresorerie,
  type PointTresorerie,
} from "@/app/gestion-portefeuille/tresorerie-types";

/**
 * Point de trésorerie — même disposition que la feuille du classeur, mais
 * alimenté par les données du site : banques en COLONNES, postes en LIGNES,
 * Total à droite.
 *
 * La colonne des libellés est figée à gauche : un fonds peut servir une
 * vingtaine de comptes, et sans cela on perd de vue le poste dès qu'on fait
 * défiler.
 *
 * Les postes qui n'ont pas encore de source sont MARQUÉS. Ils valent zéro, et
 * un zéro muet se lirait comme une absence de flux au lieu d'une absence de
 * donnée — c'est la confusion qu'il faut éviter sur un tableau de trésorerie.
 */

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const montant = (v: number | null) => (v === null ? "—" : fmt0.format(Math.round(v)));
const pourcent = (v: number | null) => (v === null ? "—" : fmt2.format(v * 100) + " %");

function classeLigne(l: { nature: LigneTresorerie["nature"]; source: LigneTresorerie["source"] }) {
  if (l.nature === "solde") return "bg-blue-50/70 font-semibold text-slate-900";
  if (l.nature === "total") return "bg-slate-50 font-medium text-slate-800";
  if (l.nature === "pourcentage") return "text-slate-500 italic";
  return l.source === "a_alimenter" ? "text-slate-400" : "text-slate-700";
}

export default function TresoreriePanel({ point }: { point: PointTresorerie | null }) {
  if (!point) {
    return (
      <p className="text-sm text-slate-500 text-center py-10 bg-white border border-slate-200 rounded-lg">
        Aucun inventaire enregistré : les soldes bancaires en sont tirés. Importe un
        inventaire dans l&apos;onglet Portefeuille pour voir le point de trésorerie.
      </p>
    );
  }

  return <Contenu point={point} />;
}

function Contenu({ point }: { point: PointTresorerie }) {
  const parLibelle = new Map(point.lignes.map((l) => [l.libelle, l]));
  const ligneSolde = parLibelle.get("SOLDE");

  const [saisie, setSaisie] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      point.banques.map((b) => [b, String(Math.round(ligneSolde?.parBanque[b] ?? 0))]),
    ),
  );
  const [dateArrete, setDateArrete] = useState(
    point.soldesSaisisLe ?? new Date().toISOString().slice(0, 10),
  );
  const [etat, setEtat] = useState<"repos" | "envoi" | "ok">("repos");
  const [erreur, setErreur] = useState<string | null>(null);

  const lu = (b: string): number => {
    const n = Number((saisie[b] ?? "").replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  // Les soldes saisis recalculent les deux soldes d'arrivee SANS aller-retour
  // serveur : tous les autres postes valent zero tant qu'ils n'ont pas de
  // source, donc le solde reel se reduit au solde bancaire. Le jour ou ces
  // postes seront alimentes, ce calcul repassera cote serveur.
  const soldeReel = point.banques.reduce((s, b) => s + lu(b), 0);
  const soldeTheorique = soldeReel;

  const enregistrer = async () => {
    setEtat("envoi");
    setErreur(null);
    const res = await enregistrerSoldesTresorerieAction(
      point.fondsId,
      dateArrete,
      Object.fromEntries(point.banques.map((b) => [b, lu(b)])),
    );
    if (!res.ok) {
      setEtat("repos");
      setErreur(res.error);
      return;
    }
    setEtat("ok");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Point de trésorerie</h2>
          <p className="text-[11px] text-slate-500 tabular-nums">
            Inventaire du {point.dateInventaire ?? "—"} · {point.banques.length} compte(s)
            {point.actifNet !== null && <> · actif net {montant(point.actifNet)} F</>}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 max-w-lg">
          <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-blue-700">Solde réel</div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
              {montant(soldeReel)} F
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-600">
              Solde théorique
            </div>
            <div className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
              {montant(soldeTheorique)} F
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <label className="text-[11px] text-slate-600">
            Date du point
            <input
              type="date"
              value={dateArrete}
              onChange={(e) => setDateArrete(e.target.value)}
              className="ml-1.5 px-2 py-1 rounded border border-slate-300 text-[11px]"
            />
          </label>
          <button
            type="button"
            onClick={enregistrer}
            disabled={etat === "envoi"}
            className="px-3 py-1 rounded text-[11px] font-medium border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition"
          >
            {etat === "envoi" ? "Enregistrement…" : "Enregistrer les soldes"}
          </button>
          {etat === "ok" && <span className="text-[11px] text-emerald-700">Enregistré.</span>}
          {point.soldesSaisisLe && (
            <span className="text-[11px] text-slate-500">
              Dernière saisie : {point.soldesSaisisLe}
            </span>
          )}
        </div>

        {erreur && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-2">
            {erreur}
          </p>
        )}

        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
          Les soldes se <strong>saisissent</strong> : le solde bancaire diffère presque
          toujours du solde comptable, que l&apos;inventaire rappelle sous chaque cellule.
          Les <strong>{point.postesAAlimenter} postes de flux</strong> — achats et ventes,
          rachats, frais, rémérés, souscriptions, dividendes — n&apos;ont pas encore de
          source et valent zéro ; ils sont grisés. Les deux soldes ne sont donc pas encore
          exploitables tels quels.
        </p>

        {point.comptesNonRattaches.length > 0 && (
          <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-2">
            <strong>{point.comptesNonRattaches.length} compte(s) non rattaché(s)</strong> à
            un établissement — leur libellé ne dit pas le pays, et les répartir au hasard
            mettrait de l&apos;argent sur la mauvaise banque :
            <ul className="mt-1 space-y-0.5">
              {point.comptesNonRattaches.map((c) => (
                <li key={c.libelle} className="tabular-nums">
                  {c.libelle} — {montant(c.montant)} F
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          {/* LARGEURS IMPOSEES.
              Sans `table-fixed`, le navigateur dimensionne chaque colonne sur
              son contenu : « UBA » tenait en quelques pixels quand « Coris Bank
              International - Sénégal (CBI-Sénégal) » en prenait dix fois plus,
              et les montants d'une même ligne ne s'alignaient sur rien. Or un
              point de trésorerie se lit en balayant une ligne du regard.
              Le `colgroup` fixe une largeur unique pour toutes les colonnes
              d'établissement ; le poste et le total, qui ne sont pas du même
              ordre, gardent la leur. */}
          <table className="text-[11px] border-collapse table-fixed">
            <colgroup>
              <col className="w-64" />
              {point.etablissements.map((e) => (
                <col key={e.cle} className="w-[7.5rem]" />
              ))}
              <col className="w-32" />
            </colgroup>
            <thead className="bg-slate-100 text-slate-600">
              {/* Regroupement : dépositaires, espèce, mobile money. Une colonne
                  par établissement, mais le trésorier raisonne d'abord par
                  famille de comptes. */}
              <tr className="text-[9px] uppercase tracking-wider text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-100 border-r border-slate-200" />
                {(() => {
                  const cases: React.ReactNode[] = [];
                  let i = 0;
                  while (i < point.etablissements.length) {
                    const g = point.etablissements[i].groupe;
                    let n = 1;
                    while (
                      i + n < point.etablissements.length &&
                      point.etablissements[i + n].groupe === g
                    ) n++;
                    cases.push(
                      <th
                        key={g + i}
                        colSpan={n}
                        className="px-3 py-1 font-semibold text-left border-l border-slate-300"
                      >
                        {g}
                      </th>,
                    );
                    i += n;
                  }
                  return cases;
                })()}
                <th className="border-l border-slate-300 bg-slate-200/70" />
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-100 text-left px-3 py-2 font-medium border-r border-slate-200 min-w-[16rem]">
                  Poste
                </th>
                {point.etablissements.map((e) => (
                  <th
                    key={e.cle}
                    className="text-right px-2 py-2 font-medium align-bottom leading-tight break-words"
                    title={e.nom}
                  >
                    {e.nom}
                    <span className="block text-[9px] font-normal text-slate-400">
                      {e.pays || "—"}
                    </span>
                    {/* Chez un opérateur de monnaie électronique, encaissement
                        et décaissement sont deux poches distinctes : le sens
                        doit se lire sans avoir à le déduire du nom. */}
                    {e.sens && (
                      <span
                        className={`block text-[9px] font-semibold ${
                          e.sens === "encaissement"
                            ? "text-emerald-600"
                            : e.sens === "décaissement"
                              ? "text-rose-600"
                              : e.sens === "à préciser"
                                ? "text-amber-600"
                                : "text-slate-400"
                        }`}
                        title={
                          e.sens === "à préciser"
                            ? "Type de compte non renseigné au référentiel — ouvre la fiche pour indiquer encaissement ou décaissement."
                            : undefined
                        }
                      >
                        {e.sens}
                      </span>
                    )}
                  </th>
                ))}
                <th className="text-right px-2 py-2 font-semibold whitespace-nowrap border-l border-slate-300 bg-slate-200/70">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {LIGNES_POINT_TRESORERIE.map((def) => {
                const l = parLibelle.get(def.libelle);
                const pct = def.nature === "pourcentage";
                const valeur = (v: number | null) => (pct ? pourcent(v) : montant(v));
                return (
                  <tr key={def.libelle} className={classeLigne(def)}>
                    <td
                      className={`sticky left-0 z-10 px-3 py-1.5 border-r border-slate-200 whitespace-nowrap ${
                        def.nature === "solde"
                          ? "bg-blue-50"
                          : def.nature === "total"
                            ? "bg-slate-50"
                            : "bg-white"
                      }`}
                    >
                      {intitule(def)}
                      {def.source === "a_alimenter" && (
                        <span
                          className="ml-1.5 text-[9px] text-amber-600"
                          title="Ce poste n'a pas encore de source dans le site : il vaut zéro."
                        >
                          à alimenter
                        </span>
                      )}
                    </td>
                    {point.banques.map((b) =>
                      def.libelle === "SOLDE" ? (
                        <td key={b} className="px-1 py-1 bg-white">
                          <input
                            value={saisie[b] ?? ""}
                            onChange={(e) =>
                              setSaisie((s) => ({ ...s, [b]: e.target.value }))
                            }
                            inputMode="numeric"
                            className="w-full text-right px-1.5 py-1 rounded border border-slate-300 tabular-nums focus:border-blue-400 focus:outline-none"
                          />
                          <span
                            className="block text-right text-[9px] text-slate-400 mt-0.5 tabular-nums"
                            title="Solde comptable à l'inventaire, pour comparaison"
                          >
                            inv. {montant(point.soldesInventaire[b] ?? 0)}
                          </span>
                        </td>
                      ) : (
                        <td key={b} className="text-right px-2 py-1.5 tabular-nums whitespace-nowrap">
                          {l ? valeur(l.parBanque[b] ?? null) : "—"}
                        </td>
                      ),
                    )}
                    <td className="text-right px-2 py-1.5 tabular-nums font-semibold border-l border-slate-300 bg-slate-50/80 whitespace-nowrap">
                      {def.libelle === "SOLDE"
                        ? montant(soldeReel)
                        : l
                          ? valeur(l.total)
                          : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

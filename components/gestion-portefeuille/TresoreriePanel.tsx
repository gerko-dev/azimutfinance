"use client";

import { useState } from "react";

import {
  FONDS_GLOBAL,
  intitule,
  LIGNES_POINT_TRESORERIE,
  type LigneTresorerie,
  type PointTresorerie,
} from "@/app/gestion-portefeuille/tresorerie-types";
import { libelleMois } from "@/app/gestion-portefeuille/frais-gestion";
import type { GrilleSoldes } from "@/app/gestion-portefeuille/tresorerie-grille";
import SaisieSoldesDialog from "./SaisieSoldesDialog";
import FluxSaisisDialog from "./FluxSaisisDialog";
import SpotsDialog from "./SpotsDialog";
import NivellementsDialog from "./NivellementsDialog";

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

/**
 * Largeurs du tableau, en pixels.
 *
 * En pixels et non en `rem` : ces nombres servent aussi à CALCULER la largeur
 * de la table, et un calcul mêlant unités relatives et absolues serait faux
 * dès que la taille de police racine change.
 *
 * 120 px pour une colonne d'établissement : le plus long montant des
 * inventaires, « -220 180 967 », occupe environ 90 px en tabulaire de 11 px,
 * padding compris. Le reste est la marge.
 */
const LARGEUR_POSTE = 256;
const LARGEUR_COLONNE = 120;
const LARGEUR_TOTAL = 128;

export default function TresoreriePanel({
  point,
  grille,
}: {
  point: PointTresorerie | null;
  /** Grille de saisie — banques en colonnes, fonds en lignes. Absente, le
   *  bouton de saisie ne s'affiche pas : c'est le cas sur un écran qui ne la
   *  charge pas. */
  grille?: GrilleSoldes | null;
}) {
  if (!point) {
    return (
      <p className="text-sm text-slate-500 text-center py-10 bg-white border border-slate-200 rounded-lg">
        Aucun inventaire enregistré : les soldes bancaires en sont tirés. Importe un
        inventaire dans l&apos;onglet Portefeuille pour voir le point de trésorerie.
      </p>
    );
  }

  return <Contenu point={point} grille={grille ?? null} />;
}

function Contenu({
  point,
  grille,
}: {
  point: PointTresorerie;
  grille: GrilleSoldes | null;
}) {
  const [saisieOuverte, setSaisieOuverte] = useState(false);
  const [fluxOuverts, setFluxOuverts] = useState(false);
  const [spotsOuverts, setSpotsOuverts] = useState(false);
  const [nivellementsOuverts, setNivellementsOuverts] = useState(false);
  // LA SAISIE EST PAR FONDS. En vue consolidée, le tableau additionne les
  // flux de tous les portefeuilles, mais il n'y a aucun fonds à qui
  // attribuer une nouvelle ligne : les deux portes restent fermées plutôt
  // que d'ouvrir sur un formulaire qui échouerait à l'enregistrement.
  const parFonds = point.fondsId !== FONDS_GLOBAL;
  const parLibelle = new Map(point.lignes.map((l) => [l.libelle, l]));
  const ligneSolde = parLibelle.get("SOLDE");

  // Les soldes viennent DU SERVEUR, plus d'un état local.
  //
  // Ils étaient recalculés à la frappe tant que la saisie vivait dans le
  // tableau ; maintenant qu'elle se fait dans une grille à part, la page se
  // rafraîchit à l'enregistrement et les valeurs affichées sont celles
  // enregistrées. Un état local n'aurait fait que dupliquer la source, avec
  // le risque qu'ils divergent après un échec d'écriture.
  const soldeDe = (b: string): number => {
    const v = ligneSolde?.parBanque[b];
    return typeof v === "number" ? v : 0;
  };

  // Tous les autres postes valent zéro tant qu'ils n'ont pas de source, donc
  // le solde réel se réduit au solde bancaire. Le jour où ils seront
  // alimentés, ce calcul repassera côté serveur.
  const soldeReel = point.banques.reduce((s, b) => s + soldeDe(b), 0);
  const soldeTheorique = soldeReel;

  return (
    <div className="space-y-4">
      {saisieOuverte && grille && (
        <SaisieSoldesDialog grille={grille} onFermer={() => setSaisieOuverte(false)} />
      )}
      {fluxOuverts && (
        <FluxSaisisDialog
          fondsId={point.fondsId}
          fondsNom={point.fonds}
          comptes={point.etablissements}
          flux={point.fluxSaisis}
          onFermer={() => setFluxOuverts(false)}
        />
      )}
      {nivellementsOuverts && (
        <NivellementsDialog
          fondsId={point.fondsId}
          fondsNom={point.fonds}
          comptes={point.etablissements}
          nivellements={point.nivellements}
          onFermer={() => setNivellementsOuverts(false)}
        />
      )}
      {spotsOuverts && (
        <SpotsDialog
          fondsId={point.fondsId}
          fondsNom={point.fonds}
          comptes={point.etablissements}
          spots={point.spots}
          contreparties={point.etablissements.map((e) => e.nom)}
          onFermer={() => setSpotsOuverts(false)}
        />
      )}
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

        <div className="flex flex-wrap items-center gap-3 mt-3">
          {/* LA SAISIE SORT DU TABLEAU.
              Le tableau est une RESTITUTION : y mêler des champs rendait
              chaque cellule ambiguë — celle-ci se corrige, celle-là se
              calcule, et rien ne les distinguait qu'une bordure. Elle se fait
              désormais dans une grille dédiée, banques en colonnes et fonds en
              lignes, qui est la forme d'un relevé bancaire. */}
          {grille && (
            <button
              type="button"
              onClick={() => setSaisieOuverte(true)}
              className="px-3 py-1 rounded text-[11px] font-medium border border-blue-300 text-blue-700 hover:bg-blue-50 transition"
            >
              Saisir les soldes
            </button>
          )}
          {/* LES FLUX QUI NE SE DEDUIRONT JAMAIS ont leur propre porte.
              Quatre lignes du classeur ne viennent d'aucune source du site et
              n'en viendront pas : appel de marge, regularisation, commission
              exceptionnelle. Leur formulaire n'est pas un pis-aller en
              attendant mieux, c'est leur place. */}
          {parFonds && (
          <button
            type="button"
            onClick={() => setFluxOuverts(true)}
            className="px-3 py-1 rounded text-[11px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            Flux saisis
            {point.fluxSaisis.length > 0 && (
              <span className="ml-1.5 text-slate-400">{point.fluxSaisis.length}</span>
            )}
          </button>
          )}
          {parFonds && (
          <button
            type="button"
            onClick={() => setSpotsOuverts(true)}
            className="px-3 py-1 rounded text-[11px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            Opérations spot
            {point.spots.filter((s) => !s.dateDenouement).length > 0 && (
              <span className="ml-1.5 text-slate-400">
                {point.spots.filter((s) => !s.dateDenouement).length}
              </span>
            )}
          </button>
          )}
          {/* LE NIVELLEMENT NE DEPLACE PAS D'ARGENT HORS DU FONDS : ses deux
              jambes se compensent au total. Il a pourtant sa propre porte,
              parce qu'il se RAPPROCHE en deux fois - debit puis credit - et
              qu'une ligne de flux isolee n'aurait pas su porter cela. */}
          {parFonds && (
          <button
            type="button"
            onClick={() => setNivellementsOuverts(true)}
            className="px-3 py-1 rounded text-[11px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            Nivellements
            {point.nivellements.filter((n) => !n.rapprocheDebit || !n.rapprocheCredit)
              .length > 0 && (
              <span className="ml-1.5 text-slate-400">
                {
                  point.nivellements.filter(
                    (n) => !n.rapprocheDebit || !n.rapprocheCredit,
                  ).length
                }
              </span>
            )}
          </button>
          )}
          {point.soldesSaisisLe && (
            <span className="text-[11px] text-slate-500">
              Derniers soldes saisis : {point.soldesSaisisLe}
            </span>
          )}
        </div>


        {/* LES FRAIS DE GESTION SE RECOUPENT, OU ILS NE VALENT RIEN.
            Un montant à huit chiffres calculé en coulisse ne se vérifie pas.
            On donne donc le mois retenu, la moyenne d'actif net, le nombre de
            valorisations qui la composent et le taux : moyenne × taux ÷ 12,
            que le gérant refait de tête. */}
        {(point.fraisGestion.montant > 0 || point.fraisGestion.indisponible) && (
          <div
            className={`text-[11px] rounded px-3 py-2 mt-2 border ${
              point.fraisGestion.indisponible
                ? "text-amber-800 bg-amber-50 border-amber-200"
                : "text-slate-700 bg-slate-50 border-slate-200"
            }`}
          >
            <strong>Frais de gestion — {libelleMois(point.fraisGestion.mois)}</strong>
            {point.fraisGestion.provisoire && (
              <span className="text-slate-500"> (mois en cours, provisoire)</span>
            )}
            {point.fraisGestion.montant > 0 && (
              <span className="tabular-nums">
                {" "}
                : {montant(point.fraisGestion.montant)} F
                {point.fraisGestion.points > 0 && (
                  <span className="text-slate-500">
                    {" "}
                    — moyenne d&apos;actif net {montant(point.fraisGestion.actifNetMoyen)} F
                    sur {point.fraisGestion.points} valorisation
                    {point.fraisGestion.points > 1 ? "s" : ""} (du {point.fraisGestion.du} au{" "}
                    {point.fraisGestion.au}) × {(point.fraisGestion.taux * 100).toFixed(2)} %
                    ÷ 12
                  </span>
                )}
              </span>
            )}
            {point.fraisGestion.indisponible && (
              <span className="block mt-0.5">{point.fraisGestion.indisponible}</span>
            )}
          </div>
        )}

        {/* CE QUI N'EST PAS ENCORE COMPTÉ, ET POURQUOI.
            Le point ne retient que les opérations DÉNOUÉES à la date
            d'arrêté — la règle du classeur. Sans cet encart, une opération
            saisie le jour même semblait s'être perdue : elle est simplement
            en attente de règlement, et le dire vaut mieux que de laisser
            chercher. */}
        {point.operationsNonDenouees.length > 0 && (
          <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-2">
            <strong>
              {point.operationsNonDenouees.length} opération(s) négociée(s) mais pas
              encore dénouée(s)
            </strong>{" "}
            au {point.dateFin ?? point.dateInventaire ?? "—"} : elles ne comptent pas
            encore dans les soldes ci-dessous.
            <ul className="mt-1 space-y-0.5">
              {point.operationsNonDenouees.map((o, i) => (
                <li key={i} className="tabular-nums">
                  dénouement {o.dateDenouement} · {o.libelle} — {montant(o.montant)} F
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* LES SPOTS DONT L'ÉCHÉANCE EST ENCORE DEVANT. Même raison que les
            rémérés : le flux est certain, il n'entre simplement pas dans
            l'horizon de l'arrêté. */}
        {point.spotsAVenir.length > 0 && (
          <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-2">
            <strong>
              {point.spotsAVenir.length} spot(s) à échoir après le{" "}
              {point.dateFin ?? point.dateInventaire ?? "—"}
            </strong>{" "}
            : intérêts compris, ils ne comptent pas encore.
            <ul className="mt-1 space-y-0.5">
              {point.spotsAVenir.map((s, i) => (
                <li key={i} className="tabular-nums">
                  échéance {s.dateEcheance} · {s.libelle} —{" "}
                  <span
                    className={
                      s.sens === "placement" ? "text-emerald-700" : "text-rose-700"
                    }
                  >
                    {s.sens === "placement" ? "encaissement" : "décaissement"} de{" "}
                    {montant(s.montant)} F
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* LES RÉMÉRÉS DONT LE TERME EST ENCORE DEVANT.
            Leur flux est certain — un réméré se dénoue toujours — mais il ne
            tombe pas dans l'horizon de l'arrêté, donc il ne compte pas encore.
            Sans ce bandeau, un remboursement à sept chiffres n'apparaissait
            qu'au moment où il devenait exigible. */}
        {point.remeresAVenir.length > 0 && (
          <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-2">
            <strong>
              {point.remeresAVenir.length} réméré(s) à dénouer après le{" "}
              {point.dateFin ?? point.dateInventaire ?? "—"}
            </strong>{" "}
            : leur terme est au-delà de l&apos;arrêté, ils ne comptent pas encore.
            <ul className="mt-1 space-y-0.5">
              {point.remeresAVenir.map((r, i) => (
                <li key={i} className="tabular-nums">
                  dénouement {r.dateFin} · {r.libelle} —{" "}
                  <span
                    className={
                      r.sens === "encaissement" ? "text-emerald-700" : "text-rose-700"
                    }
                  >
                    {r.sens} de {montant(r.montant)} F
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* UN ENGAGEMENT QUI S'EVAPORE DOIT SE VOIR.
            La part non servie d'un ordre sort du point dès que sa validité est
            passée — c'est la règle. Mais sans ce bandeau, le gérant constatait
            seulement qu'un montant n'était plus là, sans rien pour lui dire
            que c'était voulu ni depuis quand. */}
        {point.operationsSansColonne.length > 0 && (
          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-2">
            <strong>
              {point.operationsSansColonne.length} montant(s) sans colonne
            </strong>{" "}
            — leur compte de règlement ne figure pas dans l&apos;inventaire de fin, donc
            le montant n&apos;entre nulle part :
            <ul className="mt-1 space-y-0.5">
              {point.operationsSansColonne.map((o) => (
                <li key={`${o.libelle}-${o.compte}`} className="tabular-nums">
                  {o.libelle} · {o.compte} — {montant(o.montant)} F
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          {/* LARGEURS IMPOSEES, EN PIXELS ET EN DUR.
              Sans contrainte, le navigateur dimensionne chaque colonne sur son
              contenu : « UBA » tenait en quelques pixels quand « Coris Bank
              International - Sénégal (CBI-Sénégal) » en prenait dix fois plus,
              et les montants d'une même ligne ne s'alignaient sur rien. Or un
              point de trésorerie se lit en balayant la ligne du regard.

              LA LARGEUR DE LA TABLE EST CALCULEE, pas laissée à « auto ».
              C'est ce qui manquait à la première tentative : en disposition
              `fixed`, une table de largeur auto se cale sur son conteneur puis
              redistribue l'espace entre les colonnes — les largeurs du
              `colgroup` n'étaient plus que des suggestions, et rien ne
              s'harmonisait. En donnant à la table exactement la somme de ses
              colonnes, il n'y a plus rien à redistribuer. Le conteneur parent
              défile horizontalement, ce qui est de toute façon nécessaire
              au-delà d'une dizaine d'établissements. */}
          <table
            className="text-[11px] border-collapse table-fixed"
            style={{ width: LARGEUR_POSTE + point.etablissements.length * LARGEUR_COLONNE + LARGEUR_TOTAL }}
          >
            <colgroup>
              <col style={{ width: LARGEUR_POSTE }} />
              {point.etablissements.map((e) => (
                <col key={e.cle} style={{ width: LARGEUR_COLONNE }} />
              ))}
              <col style={{ width: LARGEUR_TOTAL }} />
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
                <th className="sticky left-0 z-10 bg-slate-100 text-left px-3 py-2 font-medium border-r border-slate-200">
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
                        <td key={b} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {montant(l ? (l.parBanque[b] ?? null) : null)}
                          {/* Le solde COMPTABLE de l'inventaire reste en
                              regard : l'écart entre les deux est
                              l'information utile du tableau. */}
                          <span
                            className="block text-[9px] text-slate-400 mt-0.5 tabular-nums"
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

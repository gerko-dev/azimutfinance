"use client";

// === Récapitulatif des souscriptions au marché primaire ===
//
// ON Y VOIT, ET ON Y CONSTATE L'ADJUDICATION. Une souscription se saisit dans
// « Saisir un ordre » : c'est un ordre comme un autre. Mais ce qui lui arrive
// ensuite ne ressemble à rien d'autre, et c'est pour cela que cet onglet
// existe — on soumet un montant, on le règle, PUIS l'adjudication dit ce qu'on
// obtient, souvent moins que demandé.
//
// LE NOMBRE DE TITRES ATTRIBUÉS SE MET DONC ICI. Le carnet propose bien un
// formulaire d'exécution, mais il refuse le service partiel sur les titres
// publics — « servi en totalité ou pas du tout » — ce qui est vrai d'un ordre
// au guichet secondaire et faux d'une adjudication. Au primaire, la quantité
// attribuée se saisit librement, parce qu'elle ne se déduit de rien.
//
// Deux colonnes n'existent que pour lui, et elles disent le cycle propre au
// primaire : la MODALITÉ, qui dit comment le titre a été désigné, et le
// RÈGLEMENT, qui arrive AVANT l'attribution — on verse sa soumission, puis
// l'adjudication dit ce qu'on obtient.

import { useMemo, useState } from "react";

import {
  LIBELLES_MODALITE,
  dateDenouement,
  montantExecution,
  montantOperation,
  quantiteExecutee,
  quantiteRestante,
  type OperationMarche,
} from "@/app/gestion-portefeuille/operations-marche-types";
import {
  conventionDe,
  type ParametresMarche,
} from "@/app/gestion-portefeuille/parametres-marche-types";
import type { OperationAvecFonds } from "@/app/gestion-portefeuille/operations-marche-data";
import ChampMontant from "./ChampMontant";
import EnTeteTri, { type Tri } from "./EnTeteTri";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));
const dateFr = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR") : "—";
const nombre = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0;

const th = "text-left px-3 py-2 font-medium";
const td = "px-3 py-2";
const tdNum = "px-3 py-2 text-right tabular-nums";
const champ =
  "text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";
const aide = "text-[9px] text-slate-400";

/** Les colonnes sur lesquelles le récapitulatif se trie. */
type ColonnePrimaire =
  | "date"
  | "fonds"
  | "modalite"
  | "emission"
  | "intermediaire"
  | "souscrite"
  | "attribuee"
  | "montant"
  | "etat";

/**
 * Où en est la souscription, dans l'ordre où les choses arrivent.
 *
 * Le règlement précède l'attribution : « Réglé » n'est donc pas un état final
 * mais une étape, et il peut coexister avec une attribution encore attendue.
 */
function etape(o: OperationMarche): { libelle: string; ton: string; rang: number } {
  const servie = quantiteExecutee(o);
  if (o.clotureLe)
    return { libelle: "Clôturée", ton: "bg-slate-100 text-slate-500", rang: 4 };
  if (servie >= o.quantite)
    return { libelle: "Attribuée", ton: "bg-emerald-100 text-emerald-800", rang: 3 };
  if (servie > 0)
    return { libelle: "Servie en partie", ton: "bg-emerald-50 text-emerald-700", rang: 2 };
  if (o.rapprocheLe)
    return { libelle: "Réglée, en attente", ton: "bg-blue-100 text-blue-800", rang: 1 };
  return { libelle: "Engagée", ton: "bg-amber-100 text-amber-800", rang: 0 };
}

export default function RecapPrimaire({
  operations,
  parametres,
  enCours,
  onModifier,
  onRapprocher,
  onSupprimer,
  onAttribuer,
  onSupprimerExecution,
}: {
  operations: OperationAvecFonds[];
  parametres: ParametresMarche;
  enCours: boolean;
  onModifier: (o: OperationAvecFonds) => void;
  /** Le règlement de l'ORDRE, celui qui précède l'attribution. */
  onRapprocher: (o: OperationAvecFonds, date: string | null) => void;
  onSupprimer: (o: OperationAvecFonds) => void;
  /** L'adjudication : ce que le guichet a réellement attribué. */
  onAttribuer: (
    o: OperationAvecFonds,
    saisie: {
      dateExecution: string;
      dateDenouement: string;
      quantite: number;
      prix: number;
    },
  ) => void;
  onSupprimerExecution: (o: OperationAvecFonds, executionId: string) => void;
}) {
  const [tri, setTri] = useState<Tri<ColonnePrimaire>>({ col: "date", desc: true });
  const [attribution, setAttribution] = useState<string | null>(null);
  // SUPPRIMER DEMANDE DEUX CLICS. Le carnet, lui, supprime au premier : on y
  // travaille au milieu de dizaines de lignes et la sélection multiple sert de
  // garde-fou. Ici chaque ligne est un engagement de trésorerie qu'on vient de
  // régler, et il n'y a pas de sélection : le bouton se confirme.
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  const lignes = useMemo(() => {
    const souscriptions = operations.filter((o) => o.description === "SOUSCRIPTION_MP");
    const valeur = (o: OperationAvecFonds): string | number => {
      switch (tri.col) {
        case "fonds":
          return o.fondsNom ?? "";
        case "modalite":
          return o.modalite ? LIBELLES_MODALITE[o.modalite] : "";
        case "emission":
          return o.libelle || o.code || "";
        case "intermediaire":
          return o.sgi ?? "";
        case "souscrite":
          return o.quantite;
        case "attribuee":
          return quantiteExecutee(o);
        case "montant":
          return montantOperation(o);
        case "etat":
          return etape(o).rang;
        default:
          return o.dateOperation;
      }
    };
    const signe = tri.desc ? -1 : 1;
    return [...souscriptions].sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "fr");
      // À valeur égale, la date départage, et toujours dans le même sens :
      // sans cela deux soumissions du même fonds s'échangeraient à chaque
      // rendu.
      return c !== 0 ? c * signe : -a.dateOperation.localeCompare(b.dateOperation);
    });
  }, [operations, tri]);

  const trierPar = (col: ColonnePrimaire) =>
    setTri((p) => (p.col === col ? { col, desc: !p.desc } : { col, desc: col === "date" }));

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Souscrire, c&apos;est acheter à l&apos;émission. Tant qu&apos;elle n&apos;est ni
        réglée ni clôturée, la souscription pèse dans{" "}
        <strong>Opérations marché primaire</strong> au point de trésorerie. Elle en sort
        dès que la soumission est constatée sur le relevé — le solde bancaire la contient
        alors déjà.
      </p>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <EnTeteTri col="date" tri={tri} onTrier={trierPar}>
                  Date
                </EnTeteTri>
                <EnTeteTri col="fonds" tri={tri} onTrier={trierPar}>
                  Fonds
                </EnTeteTri>
                <EnTeteTri col="modalite" tri={tri} onTrier={trierPar}>
                  Modalité
                </EnTeteTri>
                <EnTeteTri col="emission" tri={tri} onTrier={trierPar}>
                  Émission
                </EnTeteTri>
                <EnTeteTri col="intermediaire" tri={tri} onTrier={trierPar}>
                  Intermédiaire
                </EnTeteTri>
                <EnTeteTri col="souscrite" tri={tri} onTrier={trierPar} aDroite>
                  Souscrite
                </EnTeteTri>
                <EnTeteTri col="attribuee" tri={tri} onTrier={trierPar} aDroite>
                  Attribuée
                </EnTeteTri>
                <EnTeteTri col="montant" tri={tri} onTrier={trierPar} aDroite>
                  Montant
                </EnTeteTri>
                <th className={th}>Règlement</th>
                <EnTeteTri col="etat" tri={tri} onTrier={trierPar}>
                  État
                </EnTeteTri>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-slate-400">
                    Aucune souscription au primaire. Choisis «&nbsp;Souscription marché
                    primaire&nbsp;» dans l&apos;onglet «&nbsp;Saisir un ordre&nbsp;».
                  </td>
                </tr>
              ) : (
                lignes.map((o) => (
                  <LignePrimaire
                    key={o.id}
                    o={o}
                    parametres={parametres}
                    enCours={enCours}
                    ouverte={attribution === o.id}
                    aConfirmer={aSupprimer === o.id}
                    onBasculer={() => setAttribution((a) => (a === o.id ? null : o.id))}
                    onModifier={() => onModifier(o)}
                    onRapprocher={(d) => onRapprocher(o, d)}
                    onDemanderSuppression={() =>
                      setASupprimer((s) => (s === o.id ? null : o.id))
                    }
                    onSupprimer={() => {
                      setASupprimer(null);
                      onSupprimer(o);
                    }}
                    onAttribuer={(saisie) => {
                      setAttribution(null);
                      onAttribuer(o, saisie);
                    }}
                    onSupprimerExecution={(id) => onSupprimerExecution(o, id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Une souscription, ses attributions, et le formulaire qui les ajoute. */
function LignePrimaire({
  o,
  parametres,
  enCours,
  ouverte,
  aConfirmer,
  onBasculer,
  onModifier,
  onRapprocher,
  onDemanderSuppression,
  onSupprimer,
  onAttribuer,
  onSupprimerExecution,
}: {
  o: OperationAvecFonds;
  parametres: ParametresMarche;
  enCours: boolean;
  ouverte: boolean;
  aConfirmer: boolean;
  onBasculer: () => void;
  onModifier: () => void;
  onRapprocher: (date: string | null) => void;
  onDemanderSuppression: () => void;
  onSupprimer: () => void;
  onAttribuer: (s: {
    dateExecution: string;
    dateDenouement: string;
    quantite: number;
    prix: number;
  }) => void;
  onSupprimerExecution: (id: string) => void;
}) {
  const servie = quantiteExecutee(o);
  const reste = quantiteRestante(o);
  const e = etape(o);

  // L'ADJUDICATION SERT RAREMENT TOUT : la quantité se propose au reste à
  // servir, mais elle se retape — c'est précisément ce qu'on vient saisir.
  const [quantite, setQuantite] = useState(String(reste));
  const [prix, setPrix] = useState(String(o.prix));
  const [dateAttribution, setDateAttribution] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [denouementManuel, setDenouementManuel] = useState<string | null>(null);

  const calcule = dateDenouement(dateAttribution, conventionDe(parametres, o.instrument));
  const denouement = denouementManuel ?? calcule;
  const q = nombre(quantite);
  const p = nombre(prix);
  const montantSaisi = montantExecution(o, { quantite: q, prix: p });

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className={td}>{dateFr(o.dateOperation)}</td>
        <td className={td}>{o.fondsNom}</td>
        <td className={td}>
          {o.modalite ? LIBELLES_MODALITE[o.modalite].split(" — ")[0] : "—"}
        </td>
        <td className={td}>
          <div className="font-medium text-slate-800">{o.libelle}</div>
          {o.code && <div className="text-[10px] text-slate-400">{o.code}</div>}
        </td>
        <td className={td}>{o.sgi || "—"}</td>
        <td className={tdNum}>{fmt0.format(o.quantite)}</td>
        <td className={tdNum}>
          {servie > 0 ? fmt0.format(servie) : "—"}
          {/* CE QUI MANQUE N'EST PAS UNE ERREUR au primaire : l'adjudication
              sert ce qu'elle veut. On le dit, sans l'alerter. */}
          {servie > 0 && reste > 0 && (
            <span className="block text-[9px] text-slate-400">
              non servi {fmt0.format(reste)}
            </span>
          )}
        </td>
        <td className={`${tdNum} font-medium`}>{montantFr(o.montant)}</td>
        <td className={td}>
          {o.compteReglement || "—"}
          {/* UNE SOUMISSION VERSEE DEPUIS PLUSIEURS COMPTES doit
              le dire : le compte principal seul laisserait croire
              que tout est parti de la meme banque. */}
          {o.comptes.length > 1 && (
            <span
              className="ml-1 text-[9px] text-slate-400"
              title={o.comptes
                .map(
                  (c) =>
                    `${c.compte} : ${Math.round(c.montant).toLocaleString("fr-FR")} F`,
                )
                .join(" · ")}
            >
              +{o.comptes.length - 1}
            </span>
          )}
        </td>
        <td className={td}>
          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${e.ton}`}>
            {e.libelle}
          </span>
          {o.rapprocheLe && (
            <div className="text-[10px] text-slate-400">
              réglée le {dateFr(o.rapprocheLe)}
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {/* ATTRIBUER : le geste propre au primaire. Il reste offert tant
              qu'il manque des titres ; sur une souscription clôturée on ne le
              propose plus — renoncer au reste, c'est renoncer. */}
          {reste > 0 && !o.clotureLe && (
            <button
              type="button"
              onClick={onBasculer}
              disabled={enCours}
              className="text-[11px] font-medium text-emerald-700 hover:underline disabled:opacity-50 mr-3"
            >
              {ouverte ? "Fermer" : "Attribuer"}
            </button>
          )}
          {/* LE RÈGLEMENT PRÉCÈDE L'ATTRIBUTION : le bouton est
              donc disponible dès la saisie, sans attendre la
              moindre exécution. */}
          {o.rapprocheLe ? (
            <button
              type="button"
              onClick={() => onRapprocher(null)}
              disabled={enCours}
              className="text-[11px] text-emerald-700 hover:underline disabled:opacity-50 mr-3"
              title={`Réglée le ${o.rapprocheLe} — défaire`}
            >
              ✓ réglée
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onRapprocher(new Date().toISOString().slice(0, 10))}
              disabled={enCours}
              className="text-[11px] font-medium text-blue-700 hover:underline disabled:opacity-50 mr-3"
            >
              Rapprocher
            </button>
          )}
          <button
            type="button"
            onClick={onModifier}
            disabled={enCours}
            className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline disabled:opacity-50 mr-3"
          >
            Modifier
          </button>
          {aConfirmer ? (
            <>
              <button
                type="button"
                onClick={onSupprimer}
                disabled={enCours}
                className="text-[11px] font-medium text-rose-700 hover:underline disabled:opacity-50 mr-2"
                title="Supprimer définitivement cette souscription"
              >
                Confirmer
              </button>
              <button
                type="button"
                onClick={onDemanderSuppression}
                disabled={enCours}
                className="text-[11px] text-slate-500 hover:underline disabled:opacity-50"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onDemanderSuppression}
              disabled={enCours}
              className="text-[11px] text-rose-600 hover:text-rose-800 hover:underline disabled:opacity-50"
            >
              Supprimer
            </button>
          )}
        </td>
      </tr>

      {/* Les attributions déjà constatées. Une adjudication se corrige : le
          guichet publie ses résultats, et on les recopie — à la main. */}
      {o.executions.length > 0 && (
        <tr className="bg-slate-50/60">
          <td colSpan={11} className="px-3 py-1.5">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-600">
              {o.executions.map((x) => (
                <span key={x.id} className="tabular-nums">
                  {fmt0.format(x.quantite)} attribués à{" "}
                  {fmt0.format(x.prix > 0 ? x.prix : o.prix)} le {dateFr(x.dateExecution)}{" "}
                  · règlement {dateFr(x.dateDenouement)} ·{" "}
                  {montantFr(montantExecution(o, x))} F
                  <button
                    type="button"
                    onClick={() => onSupprimerExecution(x.id)}
                    disabled={enCours}
                    className="ml-1.5 text-rose-600 hover:text-rose-800 disabled:opacity-50"
                    title="Retirer cette attribution"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}

      {ouverte && (
        <tr className="bg-emerald-50/50">
          <td colSpan={11} className="px-3 py-2">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className={etiquette}>Titres attribués</span>
                <ChampMontant
                  valeur={quantite}
                  onChange={setQuantite}
                  className={`${champ} w-32 text-right tabular-nums`}
                />
                <span className={aide}>
                  souscrit {fmt0.format(o.quantite)} · reste {fmt0.format(reste)}
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className={etiquette}>Prix d&apos;attribution</span>
                <ChampMontant
                  valeur={prix}
                  onChange={setPrix}
                  className={`${champ} w-32 text-right tabular-nums`}
                />
                <span className={aide}>
                  {p !== o.prix
                    ? `soumis à ${fmt0.format(o.prix)}`
                    : "prix de la soumission"}
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className={etiquette}>Date d&apos;attribution</span>
                <input
                  type="date"
                  value={dateAttribution}
                  onChange={(ev) => {
                    setDateAttribution(ev.target.value);
                    setDenouementManuel(null);
                  }}
                  className={`${champ} w-40`}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className={etiquette}>Dénouement</span>
                <input
                  type="date"
                  value={denouement}
                  onChange={(ev) => setDenouementManuel(ev.target.value)}
                  className={`${champ} w-40`}
                />
                <span className={aide}>
                  calculé depuis la date d&apos;attribution
                  {denouementManuel && denouementManuel !== calcule && " · forcé"}
                </span>
              </label>

              <div className="text-[11px] text-slate-600 mb-1.5">
                Montant{" "}
                <span className="font-semibold tabular-nums text-slate-900">
                  {montantFr(montantSaisi)} F
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  onAttribuer({
                    dateExecution: dateAttribution,
                    dateDenouement: denouement,
                    quantite: q,
                    prix: p,
                  })
                }
                disabled={enCours || q <= 0 || p <= 0}
                className="mb-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-50"
              >
                Enregistrer l&apos;attribution
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

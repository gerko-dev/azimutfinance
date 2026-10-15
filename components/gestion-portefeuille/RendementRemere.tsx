"use client";

// === Outil — rendement de réméré ==========================================
//
// CE QU'UN RÉMÉRÉ COÛTE, TITRE PAR TITRE. Mettre une OAT en pension, c'est
// céder un titre aujourd'hui et le racheter à terme : entre les deux, la
// contrepartie encaisse ce que le titre rapporte, et la différence entre les
// deux prix fait le reste de son rendement. Ce rendement n'est pas le même
// d'un titre à l'autre — un 7,50 % qui détache son coupon dans la fenêtre
// coûte bien plus cher qu'un 5,75 % qui ne détache rien.
//
// ON POSE DEUX DATES, ET LE TABLEAU RÉPOND. C'est la seule façon de choisir
// quel titre mettre en pension : celui qui donne le moins. Le calcul est
// ENTIÈREMENT CLIENT — mêmes fonctions actuarielles que le reste du site,
// importées de `lib/bondMath` — pour que le tableau suive la frappe au lieu
// d'attendre un aller-retour à chaque changement de date.
//
// LES OAT SEULEMENT. Les BAT sont des titres à moins d'un an qu'on porte
// jusqu'au terme, et les emprunts cotés ont leur propre marché. Ce qui se met
// en pension, ce sont les OAT.
//
// LES QUANTITÉS SONT CELLES QU'ON PEUT RÉELLEMENT LIVRER : prêtés, pris en
// réméré et déjà engagés à la vente en sont déduits. Un rendement calculé sur
// des titres qu'on ne peut pas céder n'est pas une proposition.

import { useEffect, useMemo, useState, useTransition } from "react";

import { chargerTitresDunFondsAction } from "@/app/gestion-portefeuille/titres-detenus-actions";
import type { TitreDetenu } from "@/app/gestion-portefeuille/titres-detenus-types";
import { calculateAccruedInterest, getFutureCashFlows, parseDate } from "@/lib/bondMath";
import type { Bond } from "@/lib/bondsUEMOA";
import EnTeteTri, { type Tri } from "./EnTeteTri";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const qte = (v: number) => fmt0.format(Math.round(v));
const dec = (v: number) => fmt2.format(v);
const pct = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : `${fmt2.format(v * 100)} %`;
const dateFr = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR") : "—";

const JOUR = 86_400_000;
const joursEntre = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / JOUR,
  );

/** Le prix auquel on suppose la cession. */
type ModePrix = "pair" | "inventaire" | "decote";

const td = "px-3 py-1.5";
const tdNum = "px-3 py-1.5 text-right tabular-nums";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";
const champ =
  "text-xs border border-slate-300 rounded px-2 py-1.5 bg-white focus:border-blue-400 focus:outline-none";

type Colonne =
  | "fonds"
  | "titre"
  | "etat"
  | "facial"
  | "echeance"
  | "quantite"
  | "prix"
  | "courusDebut"
  | "flux"
  | "courusFin"
  | "gain"
  | "rendement"
  | "montant";

const DESCENDANTES: Colonne[] = [
  "facial",
  "quantite",
  "prix",
  "courusDebut",
  "flux",
  "courusFin",
  "gain",
  "rendement",
  "montant",
];

/** Une OAT, et ce que la pension lui ferait rapporter. */
type LigneRemere = {
  t: TitreDetenu;
  /** Prix de cession retenu, par titre. */
  prix: number;
  courusDebut: number;
  courusFin: number;
  /** Coupons détachés et capital remboursé pendant la fenêtre. */
  flux: number;
  /** Ce que la contrepartie débourse par titre : prix + courus du jour. */
  debourse: number;
  /** Ce qu'elle reçoit au terme, courus compris. */
  encaisse: number;
  /** Rendement annualisé qu'elle obtient. Null si la fenêtre est vide. */
  rendement: number | null;
  /** Ce que l'opération rapporte en francs, pour la quantité disponible. */
  montant: number;
  /** Le titre échoit-il avant le terme du réméré ? */
  echu: boolean;
};

export default function RendementRemere({
  fonds,
}: {
  fonds: { id: string; nom: string }[];
}) {
  const [parFonds, setParFonds] = useState<Record<string, TitreDetenu[]>>({});
  const [lus, setLus] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, start] = useTransition();

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [debut, setDebut] = useState(aujourdhui);
  const [fin, setFin] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [modePrix, setModePrix] = useState<ModePrix>("pair");
  const [decote, setDecote] = useState("0");
  const [fFonds, setFFonds] = useState<string[]>([]);
  const [seulementDispo, setSeulementDispo] = useState(true);
  const [tri, setTri] = useState<Tri<Colonne>>({ col: "rendement", desc: false });

  const charger = () =>
    start(async () => {
      setParFonds({});
      setLus(0);
      setErreur(null);
      for (const f of fonds) {
        const r = await chargerTitresDunFondsAction(f.id, f.nom);
        if (!r.ok) {
          setErreur(r.error);
          return;
        }
        const data = r.data;
        setParFonds((m) => ({ ...m, [data.fondsId]: data.titres }));
        setLus((n) => n + 1);
      }
    });

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Les OAT, et elles seules. */
  const oat = useMemo(
    () => fonds.flatMap((f) => (parFonds[f.id] ?? []).filter((t) => t.nature === "OAT")),
    [fonds, parFonds],
  );

  const jours = joursEntre(debut, fin);
  const decoteNum = Number(decote.replace(",", ".")) / 100 || 0;

  const lignes = useMemo(() => {
    const retenues = oat.filter((t) => {
      if (fFonds.length > 0 && !fFonds.includes(t.fondsId)) return false;
      if (seulementDispo && t.disponible <= 0) return false;
      return true;
    });

    const calculees = retenues.map((t) => calculer(t, debut, fin, jours, modePrix, decoteNum));

    const valeur = (l: LigneRemere): string | number => {
      switch (tri.col) {
        case "fonds":
          return l.t.fondsNom;
        case "titre":
          return l.t.libelle || l.t.isin;
        case "etat":
          return l.t.etat;
        case "facial":
          return l.t.facial;
        case "echeance":
          return l.t.echeance || "9999";
        case "quantite":
          return l.t.disponible;
        case "prix":
          return l.prix;
        case "courusDebut":
          return l.courusDebut;
        case "flux":
          return l.flux;
        case "courusFin":
          return l.courusFin;
        case "gain":
          return l.encaisse - l.debourse;
        case "montant":
          return l.montant;
        default:
          // LE RENDEMENT INDISPONIBLE PASSE EN DERNIER, dans les deux sens :
          // une ligne qu'on ne sait pas chiffrer n'a pas à occuper la tête du
          // classement sous prétexte qu'elle vaut « rien ».
          return l.rendement ?? (tri.desc ? -Infinity : Infinity);
      }
    };
    const signe = tri.desc ? -1 : 1;
    return calculees.sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "fr");
      return c !== 0 ? c * signe : b.montant - a.montant;
    });
  }, [oat, fFonds, seulementDispo, debut, fin, jours, modePrix, decoteNum, tri]);

  const trierPar = (col: Colonne) =>
    setTri((p) =>
      p.col === col ? { col, desc: !p.desc } : { col, desc: DESCENDANTES.includes(col) },
    );

  const totalMontant = lignes.reduce((s, l) => s + l.montant, 0);
  const totalDebourse = lignes.reduce((s, l) => s + l.debourse * l.t.disponible, 0);
  // LE RENDEMENT D'ENSEMBLE, pondéré par ce que chaque ligne mobilise : c'est
  // le taux de l'opération, et non la moyenne de taux qui ne pèsent pas le
  // même poids.
  const rendementMoyen =
    totalDebourse > 0 && jours > 0
      ? Math.pow((totalDebourse + totalMontant) / totalDebourse, 365 / jours) - 1
      : null;

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Rendement de réméré
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Ce qu&apos;un réméré rapporterait à la contrepartie, titre par
              titre, sur la fenêtre que tu poses. Le titre qui donne le{" "}
              <strong>moins</strong> est celui qu&apos;il faut mettre en
              pension. Les quantités sont celles qu&apos;on peut réellement
              livrer — prêtés, pris en réméré et déjà engagés à la vente
              déduits.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {enCours && (
              <span className="text-[11px] text-slate-500 tabular-nums">
                {lus} / {fonds.length} fonds
              </span>
            )}
            <button
              type="button"
              onClick={charger}
              disabled={enCours}
              className="px-3 py-1.5 rounded text-[11px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-40"
            >
              {enCours ? "Lecture…" : "Recharger"}
            </button>
          </div>
        </div>

        {erreur && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-3">
            {erreur}
          </p>
        )}

        {/* ── LES CONDITIONS ──────────────────────────────────────────────
            Elles commandent tout le tableau, et le tableau les suit sans
            qu'on valide : le calcul est client, il ne coûte rien. */}
        <div className="flex flex-wrap items-end gap-3 mt-4">
          <label className="flex flex-col gap-1">
            <span className={etiquette}>Début du réméré</span>
            <input
              type="date"
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
              className={`${champ} w-40`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={etiquette}>Fin du réméré</span>
            <input
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              className={`${champ} w-40`}
            />
          </label>
          <div className="text-[11px] text-slate-600 mb-1.5">
            {jours > 0 ? (
              <>
                <span className="font-semibold tabular-nums text-slate-900">
                  {jours}
                </span>{" "}
                jours
              </>
            ) : (
              <span className="text-rose-700">La fin doit suivre le début.</span>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className={etiquette}>Prix de cession</span>
            <select
              value={modePrix}
              onChange={(e) => setModePrix(e.target.value as ModePrix)}
              className={`${champ} w-52`}
            >
              <option value="pair">Au pair — rachat au pair</option>
              <option value="inventaire">Au prix d&apos;inventaire</option>
              <option value="decote">Au pair, moins une décote</option>
            </select>
          </label>

          {modePrix === "decote" && (
            <label className="flex flex-col gap-1">
              <span className={etiquette}>Décote</span>
              <div className="flex items-center gap-1">
                <input
                  value={decote}
                  onChange={(e) => setDecote(e.target.value)}
                  className={`${champ} w-20 text-right tabular-nums`}
                />
                <span className="text-xs text-slate-500">%</span>
              </div>
            </label>
          )}

          <div className="ml-auto text-right mb-1">
            <div className={etiquette}>Rendement d&apos;ensemble</div>
            <div className="text-lg font-bold tabular-nums text-slate-900">
              {pct(rendementMoyen)}
            </div>
            <div className="text-[10px] text-slate-400 tabular-nums">
              {qte(totalDebourse)} F mobilisés · {qte(totalMontant)} F de gain
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 mt-2">
          Rendement = (encaissé au terme ÷ déboursé au départ) ^ (365 ÷ jours) −
          1. Déboursé = prix + intérêts courus du jour. Encaissé = pair +
          intérêts courus au terme + coupons et amortissements de la fenêtre —
          ou, pour un titre échéant avant le terme, son remboursement seul.
        </p>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="flex flex-wrap items-end gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-500">
              Fonds
            </span>
            <select
              multiple={false}
              value={fFonds[0] ?? ""}
              onChange={(e) => setFFonds(e.target.value ? [e.target.value] : [])}
              className="text-[11px] border border-slate-300 rounded px-1.5 py-1 bg-white max-w-[14rem]"
            >
              <option value="">Tous</option>
              {fonds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 pb-1 cursor-pointer">
            <input
              type="checkbox"
              checked={seulementDispo}
              onChange={(e) => setSeulementDispo(e.target.checked)}
              className="accent-slate-900"
            />
            <span className="text-[11px] text-slate-600">Cessibles seulement</span>
          </label>

          <span className="ml-auto text-[11px] text-slate-500 tabular-nums pb-1">
            {lignes.length} OAT
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <EnTeteTri col="fonds" tri={tri} onTrier={trierPar}>
                  Fonds
                </EnTeteTri>
                <EnTeteTri col="titre" tri={tri} onTrier={trierPar}>
                  Titre
                </EnTeteTri>
                <EnTeteTri col="etat" tri={tri} onTrier={trierPar}>
                  État
                </EnTeteTri>
                <EnTeteTri col="facial" tri={tri} onTrier={trierPar} aDroite>
                  Facial
                </EnTeteTri>
                <EnTeteTri col="echeance" tri={tri} onTrier={trierPar}>
                  Échéance
                </EnTeteTri>
                <EnTeteTri col="quantite" tri={tri} onTrier={trierPar} aDroite>
                  Cessible
                </EnTeteTri>
                <EnTeteTri col="prix" tri={tri} onTrier={trierPar} aDroite>
                  Prix
                </EnTeteTri>
                <EnTeteTri col="courusDebut" tri={tri} onTrier={trierPar} aDroite>
                  Courus début
                </EnTeteTri>
                <EnTeteTri col="flux" tri={tri} onTrier={trierPar} aDroite>
                  Flux période
                </EnTeteTri>
                <EnTeteTri col="courusFin" tri={tri} onTrier={trierPar} aDroite>
                  Courus fin
                </EnTeteTri>
                <EnTeteTri col="gain" tri={tri} onTrier={trierPar} aDroite>
                  Gain / titre
                </EnTeteTri>
                <EnTeteTri col="rendement" tri={tri} onTrier={trierPar} aDroite>
                  Rendement
                </EnTeteTri>
                <EnTeteTri col="montant" tri={tri} onTrier={trierPar} aDroite>
                  Coût total
                </EnTeteTri>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-6 text-center text-slate-400">
                    {enCours
                      ? `Lecture des inventaires — ${lus} fonds sur ${fonds.length}…`
                      : "Aucune OAT cessible dans les inventaires chargés."}
                  </td>
                </tr>
              ) : (
                lignes.map((l) => (
                  <tr key={l.t.cle} className="hover:bg-slate-50">
                    <td className={td}>{l.t.fondsNom}</td>
                    <td className={td}>
                      <div className="font-medium text-slate-800">{l.t.libelle}</div>
                      <div className="text-[10px] text-slate-400">{l.t.isin}</div>
                    </td>
                    <td className={td}>{l.t.etat}</td>
                    <td className={tdNum}>{pct(l.t.facial)}</td>
                    <td className={td}>
                      {dateFr(l.t.echeance)}
                      {/* ÉCHOIR AVANT LE TERME N'EST PAS UN DÉTAIL : il n'y a
                          alors pas de rachat, et le capital rentre tout seul. */}
                      {l.echu && (
                        <span className="block text-[9px] text-amber-700">
                          échoit avant le terme
                        </span>
                      )}
                    </td>
                    <td className={tdNum}>{qte(l.t.disponible)}</td>
                    <td className={tdNum}>{dec(l.prix)}</td>
                    <td className={tdNum}>{dec(l.courusDebut)}</td>
                    <td className={tdNum}>
                      {l.flux > 0 ? dec(l.flux) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={tdNum}>{dec(l.courusFin)}</td>
                    <td className={tdNum}>{dec(l.encaisse - l.debourse)}</td>
                    <td className={`${tdNum} font-semibold`}>{pct(l.rendement)}</td>
                    <td className={tdNum}>{qte(l.montant)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {lignes.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-slate-900">
                  <td className={td} colSpan={11}>
                    {lignes.length} OAT · {qte(totalDebourse)} F mobilisés
                  </td>
                  <td className={tdNum}>{pct(rendementMoyen)}</td>
                  <td className={tdNum}>{qte(totalMontant)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Le rendement d'UN titre sur la fenêtre, aux montants réellement échangés.
 *
 * MÊMES FONCTIONS ACTUARIELLES QUE LE RESTE DU SITE : `calculateAccruedInterest`
 * et `getFutureCashFlows` de `lib/bondMath`, qui travaillent sur une
 * obligation souveraine. On la reconstruit depuis les caractéristiques de la
 * ligne — elles en viennent. En réécrire une version ici aurait garanti que
 * les deux divergent.
 */
function calculer(
  t: TitreDetenu,
  debut: string,
  fin: string,
  jours: number,
  mode: ModePrix,
  decote: number,
): LigneRemere {
  const pair = t.nominal > 0 ? t.nominal : 10_000;
  const bond: Bond = {
    isin: t.isin,
    nameShort: t.libelle,
    issuer: t.emetteur,
    country: (t.pays || "CI") as Bond["country"],
    type: "OAT",
    nominalValue: pair,
    couponRate: t.facial,
    issueDate: t.emission || debut,
    maturityDate: t.echeance,
    // UN COUPON PAR AN À DÉFAUT : c'est la convention des OAT du guichet, et
    // la fréquence manque parfois au référentiel.
    frequency: (t.frequence === 2 || t.frequence === 4 ? t.frequence : 1) as 1 | 2 | 4,
    isin_registered: true,
  };

  const prix =
    mode === "inventaire" && t.prixInventaire > 0
      ? t.prixInventaire
      : mode === "decote"
        ? pair * (1 - decote)
        : pair;

  const courus = (date: string): number => {
    if (!(t.facial > 0) || !t.echeance) return 0;
    try {
      const { accruedInterest } = calculateAccruedInterest(bond, parseDate(date));
      return Number.isFinite(accruedInterest) && accruedInterest > 0 ? accruedInterest : 0;
    } catch {
      return 0;
    }
  };

  const echu = !!t.echeance && t.echeance <= fin;
  const courusDebut = courus(debut);
  const courusFin = echu ? 0 : courus(fin);

  // Coupons détachés et capital remboursé dans la fenêtre. `getFutureCashFlows`
  // rend les flux POSTÉRIEURS à la date : ceux du jour même sont déjà réglés.
  let flux = 0;
  if (t.echeance) {
    try {
      for (const f of getFutureCashFlows(bond, parseDate(debut))) {
        const d = f.date.toISOString().slice(0, 10);
        if (d > debut && d <= fin) flux += f.amount;
      }
    } catch {
      flux = 0;
    }
  }

  // LE PAIR NE S'AJOUTE PAS QUAND LE TITRE A DÉJÀ ÉTÉ REMBOURSÉ : son capital
  // est déjà dans les flux de la période, et l'y ajouter le compterait deux
  // fois.
  const encaisse = (echu ? 0 : pair + courusFin) + flux;
  const debourse = prix + courusDebut;
  const rendement =
    debourse > 0 && jours > 0 ? Math.pow(encaisse / debourse, 365 / jours) - 1 : null;

  return {
    t,
    prix,
    courusDebut,
    courusFin,
    flux,
    debourse,
    encaisse,
    rendement,
    montant: (encaisse - debourse) * t.disponible,
    echu,
  };
}

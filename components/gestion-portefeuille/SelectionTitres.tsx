"use client";

// === Sélection de titres ===
//
// TOUT CE QU'ON DÉTIENT EN OBLIGATIONS, SUR UN SEUL ÉCRAN. « Combien d'OAT du
// Sénégal reste-t-il disponible, et dans quels fonds ? » demandait d'ouvrir
// quinze inventaires et de retrancher de tête les titres prêtés. C'est la
// question qu'on pose avant de monter un réméré, de servir une adjudication ou
// de répondre à une contrepartie.
//
// LA COLONNE QUI COMPTE EST « DISPONIBLE », et ce n'est pas la quantité de
// l'inventaire : s'en retranchent les titres prêtés, ceux pris en réméré, la
// part non servie des ventes déjà passées, et s'y ajoutent les mouvements
// postérieurs à l'arrêté. Les quatre termes ont leur colonne — un chiffre
// qu'on ne peut pas décomposer est un chiffre qu'on soupçonne.
//
// LE CALCUL EST À LA DEMANDE : il lit l'inventaire et le carnet de TOUS les
// fonds, et qui vient charger un fichier n'a pas à le payer.

import { useEffect, useMemo, useState, useTransition } from "react";

import { chargerTitresDetenusAction } from "@/app/gestion-portefeuille/titres-detenus-actions";
import {
  NATURES,
  type InventaireTitres,
  type NatureTitre,
  type TitreDetenu,
} from "@/app/gestion-portefeuille/titres-detenus";
import EnTeteTri, { type Tri } from "./EnTeteTri";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const qte = (v: number) => fmt0.format(Math.round(v));
const pct = (v: number) =>
  v > 0 ? `${fmt2.format(v * 100)} %` : "—";
const dateFr = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR") : "—";

type Colonne =
  | "fonds"
  | "titre"
  | "nature"
  | "etat"
  | "facial"
  | "echeance"
  | "residuel"
  | "inventaire"
  | "grevee"
  | "disponible"
  | "valorisation"
  // ── Les caractéristiques de l'emprunt, sous l'interrupteur ─────────────
  | "nominal"
  | "emission"
  | "frequence"
  | "amortissement"
  | "secteur"
  | "prix";

/** Colonnes dont le tri part DÉCROISSANT : les quantités et les montants, où
 *  l'on cherche d'abord le plus gros. Les libellés partent croissants. */
const DESCENDANTES: Colonne[] = [
  "facial",
  "residuel",
  "inventaire",
  "grevee",
  "disponible",
  "valorisation",
  "nominal",
  "frequence",
  "prix",
];

const td = "px-3 py-1.5";
const tdNum = "px-3 py-1.5 text-right tabular-nums";
const etiquette = "text-[9px] uppercase tracking-wider text-slate-500";
const controle = "text-[11px] border border-slate-300 rounded px-1.5 py-1 bg-white";

export default function SelectionTitres() {
  const [donnees, setDonnees] = useState<InventaireTitres | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, start] = useTransition();

  const [fFonds, setFFonds] = useState("");
  const [fNature, setFNature] = useState<NatureTitre | "">("");
  const [fEtat, setFEtat] = useState("");
  const [fTexte, setFTexte] = useState("");
  // CE QU'ON PEUT RÉELLEMENT SORTIR, et rien d'autre : c'est la vue utile
  // quand on cherche de quoi servir une contrepartie. Décochée, la liste
  // montre aussi ce qui est entièrement prêté ou promis.
  const [seulementDispo, setSeulementDispo] = useState(false);
  // LES CARACTÉRISTIQUES SONT TOUTES LÀ, ET TOUTES TRIABLES, mais repliées :
  // dix-sept colonnes ouvertes d'emblée ne se lisent plus, et la question
  // courante — que reste-t-il, et où — tient dans les onze premières.
  const [caracteristiques, setCaracteristiques] = useState(false);
  const [tri, setTri] = useState<Tri<Colonne>>({ col: "disponible", desc: true });

  const charger = () =>
    start(async () => {
      const r = await chargerTitresDetenusAction();
      if (r.ok) {
        setDonnees(r.data);
        setErreur(null);
      } else setErreur(r.error);
    });

  useEffect(() => {
    charger();
  }, []);

  const tous = useMemo(() => donnees?.titres ?? [], [donnees]);

  const etats = useMemo(
    () => [...new Set(tous.map((t) => t.etat))].filter(Boolean).sort((a, b) => a.localeCompare(b, "fr")),
    [tous],
  );

  const lignes = useMemo(() => {
    const texte = fTexte.trim().toLowerCase();
    const retenus = tous.filter((t) => {
      if (fFonds && t.fondsId !== fFonds) return false;
      if (fNature && t.nature !== fNature) return false;
      if (fEtat && t.etat !== fEtat) return false;
      if (seulementDispo && t.disponible <= 0) return false;
      if (texte && !`${t.isin} ${t.code} ${t.libelle}`.toLowerCase().includes(texte))
        return false;
      return true;
    });

    const valeur = (t: TitreDetenu): string | number => {
      switch (tri.col) {
        case "fonds":
          return t.fondsNom;
        case "titre":
          return t.libelle || t.isin;
        case "nature":
          return NATURES.indexOf(t.nature);
        case "etat":
          return t.etat;
        case "facial":
          return t.facial;
        case "echeance":
          return t.echeance || "9999";
        case "residuel":
          return t.dureeResiduelle;
        case "inventaire":
          return t.quantiteInventaire;
        case "grevee":
          return t.pretee + t.remeree + t.engagee;
        case "valorisation":
          return t.valorisation;
        case "nominal":
          return t.nominal;
        case "emission":
          return t.emission || "9999";
        case "frequence":
          return t.frequence;
        case "amortissement":
          return t.amortissement;
        case "secteur":
          return t.secteur;
        case "prix":
          return t.prixInventaire;
        default:
          return t.disponible;
      }
    };
    const signe = tri.desc ? -1 : 1;
    return [...retenus].sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "fr");
      // À valeur égale, la valorisation départage, et toujours dans le même
      // sens : sans cela deux lignes du même fonds s'échangeraient à chaque
      // rendu.
      return c !== 0 ? c * signe : b.valorisation - a.valorisation;
    });
  }, [tous, fFonds, fNature, fEtat, fTexte, seulementDispo, tri]);

  const trierPar = (col: Colonne) =>
    setTri((p) =>
      p.col === col ? { col, desc: !p.desc } : { col, desc: DESCENDANTES.includes(col) },
    );

  const actifs = !!(fFonds || fNature || fEtat || fTexte.trim() || seulementDispo);
  const vider = () => {
    setFFonds("");
    setFNature("");
    setFEtat("");
    setFTexte("");
    setSeulementDispo(false);
  };

  const totalDispo = lignes.reduce((s, t) => s + t.disponible, 0);
  const totalValo = lignes.reduce((s, t) => s + t.valorisation, 0);

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Sélection de titres</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Toutes les lignes obligataires détenues, <strong>tous fonds
              confondus</strong>. La colonne <strong>Disponible</strong> est
              celle qu&apos;on peut réellement céder&nbsp;: les titres prêtés en
              sont dehors, ceux pris en réméré doivent retourner à la
              contrepartie, la part non servie des ventes déjà passées est
              promise, et les mouvements postérieurs à l&apos;arrêté s&apos;y
              ajoutent.
            </p>
          </div>
          <button
            type="button"
            onClick={charger}
            disabled={enCours}
            className="px-3 py-1.5 rounded text-[11px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-40"
          >
            {enCours ? "Lecture…" : "Recalculer"}
          </button>
        </div>

        {erreur && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-3">
            {erreur}
          </p>
        )}

        {donnees && donnees.avertissements.length > 0 && (
          <ul className="mt-3 space-y-1">
            {donnees.avertissements.map((a) => (
              <li
                key={a}
                className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-1.5"
              >
                {a}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        {/* Les filtres se CUMULENT — chacun retranche, aucun ne remplace — et
            le compteur dit toujours ce qu'on regarde sur ce qu'il y a. */}
        <div className="flex flex-wrap items-end gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
          <label className="flex flex-col gap-0.5">
            <span className={etiquette}>Fonds</span>
            <select
              value={fFonds}
              onChange={(e) => setFFonds(e.target.value)}
              className={`${controle} max-w-[14rem]`}
            >
              <option value="">Tous</option>
              {(donnees?.fonds ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className={etiquette}>Type</span>
            <select
              value={fNature}
              onChange={(e) => setFNature(e.target.value as NatureTitre | "")}
              className={controle}
            >
              <option value="">Tous</option>
              {NATURES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className={etiquette}>État / émetteur</span>
            <select
              value={fEtat}
              onChange={(e) => setFEtat(e.target.value)}
              className={`${controle} max-w-[14rem]`}
            >
              <option value="">Tous</option>
              {etats.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5 min-w-[11rem]">
            <span className={etiquette}>Titre</span>
            <input
              value={fTexte}
              onChange={(e) => setFTexte(e.target.value)}
              placeholder="ISIN, libellé…"
              className={controle}
            />
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

          <label className="flex items-center gap-1.5 pb-1 cursor-pointer">
            <input
              type="checkbox"
              checked={caracteristiques}
              onChange={(e) => setCaracteristiques(e.target.checked)}
              className="accent-slate-900"
            />
            <span className="text-[11px] text-slate-600">
              Caractéristiques
              <span className="block text-[9px] text-slate-400">
                nominal, émission, fréquence, amortissement, secteur, prix
              </span>
            </span>
          </label>

          <div className="ml-auto flex items-center gap-2 pb-1">
            <span className="text-[11px] text-slate-500 tabular-nums">
              {lignes.length} / {tous.length}
            </span>
            {actifs && (
              <button
                type="button"
                onClick={vider}
                className="text-[11px] text-blue-700 hover:text-blue-900 underline"
              >
                tout afficher
              </button>
            )}
          </div>
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
                <EnTeteTri col="nature" tri={tri} onTrier={trierPar}>
                  Type
                </EnTeteTri>
                <EnTeteTri col="etat" tri={tri} onTrier={trierPar}>
                  État / émetteur
                </EnTeteTri>
                <EnTeteTri col="facial" tri={tri} onTrier={trierPar} aDroite>
                  Facial
                </EnTeteTri>
                <EnTeteTri col="echeance" tri={tri} onTrier={trierPar}>
                  Échéance
                </EnTeteTri>
                <EnTeteTri col="residuel" tri={tri} onTrier={trierPar} aDroite>
                  Résiduel
                </EnTeteTri>
                <EnTeteTri col="inventaire" tri={tri} onTrier={trierPar} aDroite>
                  Inventaire
                </EnTeteTri>
                <EnTeteTri col="grevee" tri={tri} onTrier={trierPar} aDroite>
                  Indisponible
                </EnTeteTri>
                <EnTeteTri col="disponible" tri={tri} onTrier={trierPar} aDroite>
                  Disponible
                </EnTeteTri>
                <EnTeteTri col="valorisation" tri={tri} onTrier={trierPar} aDroite>
                  Valorisation
                </EnTeteTri>
                {caracteristiques && (
                  <>
                    <EnTeteTri col="nominal" tri={tri} onTrier={trierPar} aDroite>
                      Nominal
                    </EnTeteTri>
                    <EnTeteTri col="prix" tri={tri} onTrier={trierPar} aDroite>
                      Prix unitaire
                    </EnTeteTri>
                    <EnTeteTri col="emission" tri={tri} onTrier={trierPar}>
                      Émission
                    </EnTeteTri>
                    <EnTeteTri col="frequence" tri={tri} onTrier={trierPar} aDroite>
                      Coupons / an
                    </EnTeteTri>
                    <EnTeteTri col="amortissement" tri={tri} onTrier={trierPar}>
                      Amortissement
                    </EnTeteTri>
                    <EnTeteTri col="secteur" tri={tri} onTrier={trierPar}>
                      Secteur
                    </EnTeteTri>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lignes.length === 0 ? (
                <tr>
                  <td
                    colSpan={caracteristiques ? 17 : 11}
                    className="px-3 py-6 text-center text-slate-400"
                  >
                    {enCours
                      ? "Lecture des inventaires et des carnets…"
                      : tous.length === 0
                        ? "Aucune ligne obligataire dans les inventaires chargés."
                        : "Aucun titre ne répond à ces filtres."}
                  </td>
                </tr>
              ) : (
                lignes.map((t) => (
                  <Ligne key={t.cle} t={t} caracteristiques={caracteristiques} />
                ))
              )}
            </tbody>
            {lignes.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-slate-900">
                  <td className={td} colSpan={9}>
                    {lignes.length} ligne(s)
                  </td>
                  <td className={tdNum}>{qte(totalDispo)}</td>
                  <td className={tdNum}>{qte(totalValo)}</td>
                  {caracteristiques && <td colSpan={6} />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function Ligne({
  t,
  caracteristiques,
}: {
  t: TitreDetenu;
  caracteristiques: boolean;
}) {
  const grevee = t.pretee + t.remeree + t.engagee;
  return (
    <tr className="hover:bg-slate-50">
      <td className={td}>{t.fondsNom}</td>
      <td className={td}>
        <div className="font-medium text-slate-800">{t.libelle}</div>
        <div className="text-[10px] text-slate-400">{t.isin || t.code}</div>
      </td>
      <td className={td}>
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
            t.nature === "OAT"
              ? "bg-blue-100 text-blue-800"
              : t.nature === "BAT"
                ? "bg-sky-100 text-sky-800"
                : t.nature === "Cotée"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
          }`}
        >
          {t.nature}
        </span>
      </td>
      <td className={td}>{t.etat}</td>
      <td className={tdNum}>{pct(t.facial)}</td>
      <td className={td}>{dateFr(t.echeance || null)}</td>
      <td className={tdNum}>
        {t.dureeResiduelle > 0 ? `${fmt2.format(t.dureeResiduelle)} a` : "—"}
      </td>
      <td className={tdNum}>{qte(t.quantiteInventaire)}</td>
      <td className={tdNum}>
        {grevee > 0 ? (
          <>
            {qte(grevee)}
            {/* LE DÉTAIL DE CE QUI GRÈVE, sous le total : un chiffre qu'on ne
                peut pas décomposer est un chiffre qu'on soupçonne. */}
            <span className="block text-[9px] text-amber-700">
              {[
                t.pretee > 0 ? `${qte(t.pretee)} prêtés` : "",
                t.remeree > 0 ? `${qte(t.remeree)} réméré` : "",
                t.engagee > 0 ? `${qte(t.engagee)} en vente` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
        {t.mouvements !== 0 && (
          <span className="block text-[9px] text-slate-400">
            {t.mouvements > 0 ? "+" : "−"}
            {qte(Math.abs(t.mouvements))} depuis l&apos;arrêté
          </span>
        )}
      </td>
      <td className={`${tdNum} font-semibold ${t.disponible > 0 ? "text-slate-900" : "text-slate-400"}`}>
        {qte(t.disponible)}
      </td>
      <td className={tdNum}>{qte(t.valorisation)}</td>
      {caracteristiques && (
        <>
          <td className={tdNum}>{t.nominal > 0 ? qte(t.nominal) : "—"}</td>
          <td className={tdNum}>
            {t.prixInventaire > 0 ? fmt2.format(t.prixInventaire) : "—"}
          </td>
          <td className={td}>{dateFr(t.emission || null)}</td>
          <td className={tdNum}>{t.frequence > 0 ? t.frequence : "—"}</td>
          <td className={td}>{t.amortissement}</td>
          <td className={td}>{t.secteur}</td>
        </>
      )}
    </tr>
  );
}

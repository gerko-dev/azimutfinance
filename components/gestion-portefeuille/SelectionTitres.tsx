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
// LE CALCUL EST À LA DEMANDE, ET FONDS PAR FONDS. Il lit l'inventaire et le
// carnet de chaque portefeuille : les quinze dans un seul appel demandaient une
// minute pendant laquelle l'écran ne montrait rien — et, passé la limite d'une
// action serveur, ne montraient jamais rien. On les demande donc un par un, et
// la liste se remplit à mesure : le premier fonds s'affiche en une seconde, et
// l'attente devient un compteur au lieu d'un écran blanc.

import { useEffect, useMemo, useState, useTransition } from "react";

import { chargerTitresDunFondsAction } from "@/app/gestion-portefeuille/titres-detenus-actions";
import {
  NATURES,
  type TitreDetenu,
} from "@/app/gestion-portefeuille/titres-detenus-types";
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

export default function SelectionTitres({
  fonds,
}: {
  /** Les fonds gérés, tels que la page les connaît déjà : les redemander au
   *  serveur aurait coûté un aller-retour pour une liste qu'on a sous la
   *  main. */
  fonds: { id: string; nom: string }[];
}) {
  // PAR FONDS, ET NON EN TAS. Une liste à laquelle on ajoute se duplique dès
  // qu'une lecture repart — un double montage, un clic sur « Recalculer »
  // pendant que la précédente tourne. Indexée par fonds, la même lecture
  // écrase la précédente au lieu de s'y ajouter.
  const [parFonds, setParFonds] = useState<Record<string, TitreDetenu[]>>({});
  const [arretes, setArretes] = useState<Record<string, string | null>>({});
  /** Fonds déjà lus : c'est le compteur, et c'est aussi la garde contre un
   *  second chargement. */
  const [lus, setLus] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, start] = useTransition();

  // PLUSIEURS À LA FOIS. « Les OAT du Sénégal ET du Mali », « ce que portent
  // Aurore Sécurité et Aurore Sécurité II » : un choix unique obligeait à
  // relire la liste autant de fois qu'on avait de cas, et à additionner de
  // tête. Une liste vide veut dire « tous » — c'est l'absence de filtre, pas
  // un filtre qui ne retient rien.
  const [fFonds, setFFonds] = useState<string[]>([]);
  const [fNature, setFNature] = useState<string[]>([]);
  const [fEtat, setFEtat] = useState<string[]>([]);
  const [fTexte, setFTexte] = useState("");
  /** Le menu déroulant ouvert, s'il y en a un : deux ouverts se chevauchent. */
  const [ouvert, setOuvert] = useState<string | null>(null);
  // CE QU'ON PEUT RÉELLEMENT SORTIR, et rien d'autre : c'est la vue utile
  // quand on cherche de quoi servir une contrepartie. Décochée, la liste
  // montre aussi ce qui est entièrement prêté ou promis.
  const [seulementDispo, setSeulementDispo] = useState(false);
  /** Isoler ce que l'import n'a pas su rattacher : c'est la liste des
   *  corrections à faire, et elle ne se voit pas autrement. */
  const [seulementOrphelins, setSeulementOrphelins] = useState(false);
  // LES CARACTÉRISTIQUES SONT TOUTES LÀ, ET TOUTES TRIABLES, mais repliées :
  // dix-sept colonnes ouvertes d'emblée ne se lisent plus, et la question
  // courante — que reste-t-il, et où — tient dans les onze premières.
  const [caracteristiques, setCaracteristiques] = useState(false);
  const [tri, setTri] = useState<Tri<Colonne>>({ col: "disponible", desc: true });

  /**
   * UN FONDS, PUIS LE SUIVANT, et la liste grandit entre les deux.
   *
   * EN SÉRIE, ET NON TOUT DE FRONT : quinze lectures simultanées d'inventaire
   * saturent la base et rendent le PREMIER résultat aussi tardif que le
   * dernier. En série, on en a un tout de suite — et c'est celui qu'on
   * regarde pendant que les autres arrivent.
   */
  const charger = () =>
    start(async () => {
      setParFonds({});
      setArretes({});
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
        setArretes((a) => ({ ...a, [data.fondsId]: data.dateInventaire }));
        setLus((n) => n + 1);
      }
    });

  // AU PREMIER AFFICHAGE SEULEMENT. `fonds` est reconstruit à chaque rendu de
  // la page parente ; le mettre en dépendance relancerait quinze lectures à
  // chaque frappe dans un filtre.
  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // L'ordre des fonds, et non celui des réponses : une liste qui se réordonne
  // en cours de chargement se relit entièrement à chaque arrivée.
  const tous = useMemo(
    () => fonds.flatMap((f) => parFonds[f.id] ?? []),
    [fonds, parFonds],
  );

  /** Ce qui manque ou ce qui cloche, dit à mesure que les fonds arrivent. */
  const avertissements = useMemo(() => {
    const msg: string[] = [];
    const sans = fonds.filter((f) => f.id in arretes && arretes[f.id] === null);
    if (sans.length > 0) {
      msg.push(
        `${sans.length} fonds sans inventaire importé : ${sans
          .map((f) => f.nom)
          .join(", ")}.`,
      );
    }
    const dates = [...new Set(Object.values(arretes).filter(Boolean))].sort();
    if (dates.length > 1) {
      msg.push(
        `Les inventaires ne sont pas tous arrêtés à la même date (du ${dates[0]} au ${
          dates[dates.length - 1]
        }) : les quantités ne se totalisent qu'avec cette réserve.`,
      );
    }
    return msg;
  }, [fonds, arretes]);

  const etats = useMemo(
    () => [...new Set(tous.map((t) => t.etat))].filter(Boolean).sort((a, b) => a.localeCompare(b, "fr")),
    [tous],
  );

  const lignes = useMemo(() => {
    const texte = fTexte.trim().toLowerCase();
    const retenus = tous.filter((t) => {
      if (fFonds.length > 0 && !fFonds.includes(t.fondsId)) return false;
      if (fNature.length > 0 && !fNature.includes(t.nature)) return false;
      if (fEtat.length > 0 && !fEtat.includes(t.etat)) return false;
      if (seulementDispo && t.disponible <= 0) return false;
      if (seulementOrphelins && t.resolu) return false;
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
  }, [tous, fFonds, fNature, fEtat, fTexte, seulementDispo, seulementOrphelins, tri]);

  const trierPar = (col: Colonne) =>
    setTri((p) =>
      p.col === col ? { col, desc: !p.desc } : { col, desc: DESCENDANTES.includes(col) },
    );

  const actifs = !!(
    fFonds.length ||
    fNature.length ||
    fEtat.length ||
    fTexte.trim() ||
    seulementDispo ||
    seulementOrphelins
  );
  const vider = () => {
    setFFonds([]);
    setFNature([]);
    setFEtat([]);
    setFTexte("");
    setSeulementDispo(false);
    setSeulementOrphelins(false);
  };
  const orphelins = tous.filter((t) => !t.resolu).length;

  // UN CLIC AILLEURS FERME LE MENU. Sans cela, il reste ouvert par-dessus le
  // tableau qu'on vient de filtrer, et il faut revenir le fermer à la main.
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      const cible = e.target as HTMLElement | null;
      if (!cible?.closest("[data-filtre]")) setOuvert(null);
    };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [ouvert]);

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
          <div className="flex items-center gap-2 shrink-0">
            {/* LE COMPTEUR PENDANT LA LECTURE : une attente qui avance se
                supporte, une attente muette se prend pour une panne. */}
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
              {enCours ? "Lecture…" : "Recalculer"}
            </button>
          </div>
        </div>

        {erreur && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-3">
            {erreur}
          </p>
        )}

        {avertissements.length > 0 && (
          <ul className="mt-3 space-y-1">
            {avertissements.map((a) => (
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
          <FiltreMultiple
            cle="fonds"
            libelle="Fonds"
            options={fonds.map((f) => ({ valeur: f.id, libelle: f.nom }))}
            choisis={fFonds}
            onChange={setFFonds}
            ouvert={ouvert === "fonds"}
            onOuvrir={(o) => setOuvert(o ? "fonds" : null)}
            largeur="16rem"
          />

          <FiltreMultiple
            cle="type"
            libelle="Type"
            options={NATURES.map((n) => ({ valeur: n, libelle: n }))}
            choisis={fNature}
            onChange={setFNature}
            ouvert={ouvert === "type"}
            onOuvrir={(o) => setOuvert(o ? "type" : null)}
            largeur="11rem"
          />

          <FiltreMultiple
            cle="etat"
            libelle="État / émetteur"
            options={etats.map((e) => ({ valeur: e, libelle: e }))}
            choisis={fEtat}
            onChange={setFEtat}
            ouvert={ouvert === "etat"}
            onOuvrir={(o) => setOuvert(o ? "etat" : null)}
            largeur="18rem"
          />

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

          {orphelins > 0 && (
            <label className="flex items-center gap-1.5 pb-1 cursor-pointer">
              <input
                type="checkbox"
                checked={seulementOrphelins}
                onChange={(e) => setSeulementOrphelins(e.target.checked)}
                className="accent-amber-600"
              />
              <span className="text-[11px] text-amber-700">
                Non rapprochés
                <span className="block text-[9px] text-amber-600/80">
                  {orphelins} ligne(s) sans caractéristiques
                </span>
              </span>
            </label>
          )}

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
                      ? `Lecture des inventaires et des carnets — ${lus} fonds sur ${fonds.length}…`
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
        <div className="text-[10px] text-slate-400">
          {t.isin || t.code}
          {/* DEUX LOTS DU MÊME EMPRUNT SE SOMMENT, et la somme se dit : sans
              cela, une quantité qui ne correspond à aucune ligne de
              l'inventaire passe pour une erreur. */}
          {t.lots > 1 && (
            <span className="ml-1 text-slate-500">· {t.lots} lots</span>
          )}
        </div>
        {/* NI FACIAL NI ÉCHÉANCE PARCE QUE LE TITRE N'EST RAPPROCHÉ DE RIEN :
            c'est l'import qu'il faut corriger, pas le référentiel. Le dire
            évite de chercher une donnée manquante là où elle ne manque pas. */}
        {!t.resolu && (
          <div className="text-[10px] text-amber-700">
            non rapproché au référentiel
          </div>
        )}
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

/**
 * UN FILTRE QUI SE COCHE, et qui en accepte plusieurs.
 *
 * PAS UN `<select multiple>` : il demande de tenir Ctrl enfoncé pour ajouter
 * une ligne, et de ne pas le lâcher pour ne pas tout perdre. Une case à cocher
 * dit ce qu'elle fait.
 *
 * LE BOUTON PORTE LE RÉSULTAT — « Tous », le nom quand il n'y en a qu'un, le
 * compte au-delà : replié, un filtre doit dire ce qu'il retient sans qu'on ait
 * à le rouvrir.
 */
function FiltreMultiple({
  cle,
  libelle,
  options,
  choisis,
  onChange,
  ouvert,
  onOuvrir,
  largeur,
}: {
  cle: string;
  libelle: string;
  options: { valeur: string; libelle: string }[];
  choisis: string[];
  onChange: (v: string[]) => void;
  ouvert: boolean;
  onOuvrir: (o: boolean) => void;
  largeur: string;
}) {
  const resume =
    choisis.length === 0
      ? "Tous"
      : choisis.length === 1
        ? (options.find((o) => o.valeur === choisis[0])?.libelle ?? choisis[0])
        : `${choisis.length} sélectionnés`;

  const basculer = (v: string) =>
    onChange(choisis.includes(v) ? choisis.filter((x) => x !== v) : [...choisis, v]);

  return (
    <div className="flex flex-col gap-0.5 relative" data-filtre={cle}>
      <span className={etiquette}>{libelle}</span>
      <button
        type="button"
        onClick={() => onOuvrir(!ouvert)}
        className={`${controle} text-left flex items-center gap-2 ${
          choisis.length > 0 ? "border-blue-400 text-blue-800" : "text-slate-700"
        }`}
        style={{ minWidth: "9rem", maxWidth: largeur }}
      >
        <span className="truncate">{resume}</span>
        <span className="ml-auto text-[8px] text-slate-400">▼</span>
      </button>

      {ouvert && (
        <div
          className="absolute z-20 top-full mt-1 bg-white border border-slate-300 rounded shadow-lg max-h-72 overflow-y-auto py-1"
          style={{ minWidth: largeur }}
        >
          <div className="flex gap-2 px-2 pb-1 border-b border-slate-100 mb-1">
            <button
              type="button"
              onClick={() => onChange(options.map((o) => o.valeur))}
              className="text-[10px] text-blue-700 hover:underline"
            >
              tout
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[10px] text-slate-500 hover:underline"
            >
              aucun
            </button>
          </div>
          {options.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-slate-400">Rien à proposer</p>
          ) : (
            options.map((o) => (
              <label
                key={o.valeur}
                className="flex items-center gap-2 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={choisis.includes(o.valeur)}
                  onChange={() => basculer(o.valeur)}
                  className="accent-slate-900"
                />
                <span className="truncate">{o.libelle}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

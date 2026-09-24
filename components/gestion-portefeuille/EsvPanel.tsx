"use client";

// === ESV — le calendrier et son pointage ===
//
// L'ÉCRAN EST ORGANISÉ AUTOUR DE CE QUI MANQUE. Les flux à venir se consultent
// une fois par semaine ; les flux EN RETARD, eux, appellent une action, et ce
// sont les seuls que personne ne réclame — il n'y a pas d'avis d'opéré pour un
// encaissement qui n'arrive pas. Ils ouvrent donc l'écran, en rouge, avant
// tout le reste.
//
// LE RETARD NE REMONTE PAS AVANT JUIN 2026. Les échéanciers couvrent toute la
// vie des titres, et sans cette borne le module aurait ouvert sur des
// centaines de coupons anciens, encaissés depuis longtemps hors de ce suivi.
// Ils restent visibles dans « Tout l'échéancier », en gris, sans appeler
// d'action.
//
// LE POINTAGE SE FAIT EN MASSE autant qu'à l'unité. Le gérant reçoit du
// dépositaire un avis portant dix coupons du même jour : les pointer un à un
// aurait été dix formulaires pour un seul fait. La saisie à l'unité reste, pour
// le cas qui l'exige — un montant qui diffère de l'attendu.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  depointerEvenementAction,
  pointerEnMasseAction,
  pointerEvenementAction,
} from "@/app/gestion-portefeuille/esv-actions";
import {
  DEBUT_SUIVI,
  decalerJours,
  ecartReception,
  HORIZONS,
  LIBELLES_NATURE,
  LIBELLES_STATUT,
  libelleMoisEsv,
  statutEsv,
  type EvenementEsv,
  type NatureEsv,
  type StatutEsv,
} from "@/app/gestion-portefeuille/esv-types";
import type { CalendrierEsv } from "@/app/gestion-portefeuille/esv-data";
import ChampMontant, { valeurMontant } from "./ChampMontant";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";

type Compte = { cle: string; nom: string; pays: string };
type Onglet = "retard" | "avenir" | "recus" | "tous";

const ONGLETS: { cle: Onglet; libelle: string; aide: string }[] = [
  {
    cle: "retard",
    libelle: "En retard",
    aide: "Échus et non pointés — c'est là que se cachent les oublis",
  },
  { cle: "avenir", libelle: "À venir", aide: "Les prochaines tombées" },
  { cle: "recus", libelle: "Reçus", aide: "Pointés, avec leur écart" },
  {
    cle: "tous",
    libelle: "Tout l'échéancier",
    aide: "Sans filtre, y compris les flux antérieurs au suivi",
  },
];

const COULEUR_NATURE: Record<NatureEsv, string> = {
  coupon: "text-blue-800",
  dividende: "text-violet-800",
  amortissement: "text-amber-800",
  remboursement: "text-emerald-800",
};

export default function EsvPanel({
  fondsId,
  fondsNom,
  calendrier,
  comptes,
}: {
  fondsId: string;
  fondsNom: string;
  calendrier: CalendrierEsv;
  comptes: Compte[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [onglet, setOnglet] = useState<Onglet>("retard");
  const [horizon, setHorizon] = useState("180");
  const [natures, setNatures] = useState<Set<NatureEsv>>(new Set());
  const [recherche, setRecherche] = useState("");

  /** Flux cochés pour un pointage en masse. Par CLEF : le calendrier se
   *  recalcule à chaque rafraîchissement, et une sélection par rang aurait
   *  fini par désigner un autre flux que celui coché. */
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [dateLot, setDateLot] = useState(() => new Date().toISOString().slice(0, 10));
  const [compteLot, setCompteLot] = useState(comptes[0]?.cle ?? "");

  /** Flux ouvert pour une saisie à l'unité, ou null. */
  const [detail, setDetail] = useState<string | null>(null);
  const [saisie, setSaisie] = useState({
    dateReception: new Date().toISOString().slice(0, 10),
    montantRecu: "",
    compte: comptes[0]?.cle ?? "",
    note: "",
  });
  const [cleMontant, setCleMontant] = useState(0);

  const aujourdhui = new Date().toISOString().slice(0, 10);

  // ── Ce que l'écran montre ────────────────────────────────────────────────
  const avecStatut = useMemo(
    () =>
      calendrier.evenements.map((e) => ({
        e,
        statut: statutEsv(e, aujourdhui),
      })),
    [calendrier.evenements, aujourdhui],
  );

  const borne = useMemo(() => {
    const h = HORIZONS.find((x) => x.cle === horizon) ?? HORIZONS[3];
    return decalerJours(aujourdhui, h.jours);
  }, [horizon, aujourdhui]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toUpperCase();
    return avecStatut.filter(({ e, statut }) => {
      if (onglet === "retard" && statut !== "en_retard") return false;
      if (onglet === "avenir" && statut !== "a_venir") return false;
      if (onglet === "recus" && statut !== "recu") return false;
      // Les flux d'avant le suivi n'apparaissent QUE dans l'échéancier
      // complet : ailleurs, ils noieraient ce qui appelle une action.
      if (onglet !== "tous" && statut === "anterieur") return false;
      // L'HORIZON NE BORNE PAS LES RETARDS. Un coupon oublié depuis huit mois
      // doit se voir : le masquer parce qu'il sort de la fenêtre aurait caché
      // exactement ce que le module cherche.
      if (statut === "a_venir" && e.date > borne) return false;
      if (natures.size > 0 && !natures.has(e.nature)) return false;
      if (q && !`${e.code} ${e.libelle} ${e.isin}`.toUpperCase().includes(q)) return false;
      return true;
    });
  }, [avecStatut, onglet, borne, natures, recherche]);

  const compte = (s: StatutEsv) => avecStatut.filter((x) => x.statut === s).length;
  const somme = (s: StatutEsv) =>
    avecStatut
      .filter((x) => x.statut === s)
      .reduce((t, x) => t + (s === "recu" ? (x.e.reception?.montantRecu ?? 0) : x.e.montantAttendu), 0);

  /** Attendu dans l'horizon choisi — le chiffre que le trésorier reporte. */
  const attenduHorizon = avecStatut
    .filter((x) => x.statut === "a_venir" && x.e.date <= borne)
    .reduce((t, x) => t + x.e.montantAttendu, 0);

  // ── Groupement par mois ──────────────────────────────────────────────────
  //
  // Un échéancier se lit par mois : c'est l'unité dans laquelle un trésorier
  // raisonne, et une liste de deux cents lignes sans respiration ne se lit
  // pas du tout.
  const parMois = useMemo(() => {
    const m = new Map<string, typeof filtres>();
    for (const x of filtres) {
      const k = x.e.date.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), x]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtres]);

  const basculerNature = (n: NatureEsv) =>
    setNatures((s) => {
      const suivant = new Set(s);
      if (suivant.has(n)) suivant.delete(n);
      else suivant.add(n);
      return suivant;
    });

  const basculerSelection = (cle: string) =>
    setSelection((s) => {
      const suivant = new Set(s);
      if (suivant.has(cle)) suivant.delete(cle);
      else suivant.add(cle);
      return suivant;
    });

  /** Sélectionnables : ce qui n'est pas déjà pointé. */
  const selectionnables = filtres
    .filter((x) => !x.e.reception && x.statut !== "anterieur")
    .map((x) => x.e.cle);
  const toutSelectionner = () =>
    setSelection((s) =>
      selectionnables.every((c) => s.has(c)) ? new Set() : new Set(selectionnables),
    );

  const retenus = filtres.filter(
    (x) => selection.has(x.e.cle) && !x.e.reception && x.statut !== "anterieur",
  );
  const totalRetenu = retenus.reduce((t, x) => t + x.e.montantAttendu, 0);

  const pointerLot = () => {
    setErreur(null);
    setMessage(null);
    demarrer(async () => {
      const res = await pointerEnMasseAction(
        fondsId,
        dateLot,
        compteLot,
        retenus.map((x) => ({ cle: x.e.cle, montant: x.e.montantAttendu })),
      );
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setSelection(new Set());
      setMessage(
        `${res.data.pointes} flux pointé${res.data.pointes > 1 ? "s" : ""} au ${dateLot}.` +
          (res.data.refus.length > 0 ? ` ${res.data.refus.join(" ")}` : ""),
      );
      router.refresh();
    });
  };

  const ouvrirDetail = (e: EvenementEsv) => {
    setDetail(e.cle === detail ? null : e.cle);
    setSaisie({
      dateReception: e.reception?.dateReception ?? aujourdhui,
      // Pré-rempli à l'ATTENDU : c'est le cas le plus fréquent, et le champ
      // reste modifiable pour la retenue à la source ou l'arrondi.
      montantRecu: String(Math.round(e.reception?.montantRecu ?? e.montantAttendu)),
      compte: e.reception?.compte || comptes[0]?.cle || "",
      note: e.reception?.note ?? "",
    });
    setCleMontant((k) => k + 1);
    setErreur(null);
  };

  const pointerUn = (e: EvenementEsv) => {
    setErreur(null);
    setMessage(null);
    demarrer(async () => {
      const res = await pointerEvenementAction(fondsId, e.cle, {
        ...saisie,
        montantRecu: valeurMontant(saisie.montantRecu),
      });
      if (!res.ok) setErreur(res.error);
      else {
        setDetail(null);
        router.refresh();
      }
    });
  };

  const depointer = (e: EvenementEsv) => {
    setErreur(null);
    setMessage(null);
    demarrer(async () => {
      const res = await depointerEvenementAction(fondsId, e.cle);
      if (!res.ok) setErreur(res.error);
      else {
        setDetail(null);
        router.refresh();
      }
    });
  };

  const nomCompte = (cle: string) =>
    comptes.find((c) => c.cle === cle)?.nom ?? cle;

  return (
    <div className="space-y-4">
      {/* ── L'essentiel en quatre chiffres ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Carte
          titre="En retard"
          valeur={`${montantFr(somme("en_retard"))} F`}
          aide={`${compte("en_retard")} flux échus non pointés depuis le ${DEBUT_SUIVI}`}
          alerte={compte("en_retard") > 0}
        />
        <Carte
          titre={`Attendu — ${HORIZONS.find((h) => h.cle === horizon)?.libelle ?? ""}`}
          valeur={`${montantFr(attenduHorizon)} F`}
          aide={`sur ${compte("a_venir")} flux à venir`}
        />
        <Carte
          titre="Déjà encaissé"
          valeur={`${montantFr(somme("recu"))} F`}
          aide={`${compte("recu")} flux pointés`}
        />
        <Carte
          titre="Inventaire de référence"
          valeur={calendrier.dateInventaire ?? "—"}
          aide={`${fondsNom} — les quantités en sortent`}
        />
      </div>

      {/* UN AVIS PUBLIÉ QUE LE MODULE A LAISSÉ TOMBER.
          C'est le plus grave des deux manques : la Bourse a publié le
          dividende, et il n'apparaît nulle part. Sans ce bandeau il
          disparaissait en silence — et il n'y a pas d'avis d'opéré pour un
          encaissement qu'on n'attendait pas. */}
      {calendrier.avisNonRattaches.length > 0 && (
        <div className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          <strong>
            {calendrier.avisNonRattaches.length} avis de dividende du BOC non
            rattaché(s) à un titre
          </strong>{" "}
          : la Bourse les a publiés sous un nom que le référentiel ne reconnaît
          pas. S&apos;ils concernent un titre détenu, leur dividende manque au
          calendrier.
          <ul className="mt-1 space-y-0.5 list-disc pl-4">
            {calendrier.avisNonRattaches.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* CE QUE LE CALENDRIER NE DIT PAS, ET POURQUOI.
          Le module ne porte que des montants publiés : une action dont le
          dividende n'est pas encore annoncé au BOC n'y figure pas. Sans cette
          liste, son absence passerait pour un portefeuille sans dividendes. */}
      {calendrier.actionsSansAvis.length > 0 && (
        <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
          <strong>
            {calendrier.actionsSansAvis.length} action(s) détenue(s) sans avis de
            dividende au BOC
          </strong>{" "}
          : leur dividende apparaîtra dès que la Bourse l&apos;aura publié. Rien
          n&apos;est estimé d&apos;ici là.
          <ul className="mt-1 space-y-0.5 list-disc pl-4">
            {calendrier.actionsSansAvis.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {calendrier.sansEcheancier.length > 0 && (
        <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <strong>
            {calendrier.sansEcheancier.length} titre(s) détenu(s) sans échéancier connu
          </strong>{" "}
          : leurs flux n&apos;apparaissent pas au calendrier. Les bons du Trésor
          escomptés sont dans ce cas — le référentiel souverain ne retient que les
          OAT.
          <ul className="mt-1 space-y-0.5 list-disc pl-4">
            {calendrier.sansEcheancier.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Filtres ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-3">
        <nav className="flex flex-wrap gap-1 border-b border-slate-200">
          {ONGLETS.map((t) => {
            const actif = onglet === t.cle;
            const n =
              t.cle === "tous"
                ? avecStatut.length
                : compte(
                    t.cle === "retard" ? "en_retard" : t.cle === "avenir" ? "a_venir" : "recu",
                  );
            return (
              <button
                key={t.cle}
                type="button"
                onClick={() => setOnglet(t.cle)}
                title={t.aide}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition ${
                  actif
                    ? "border-blue-700 text-blue-800"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.libelle}
                <span
                  className={`ml-1.5 text-[10px] ${
                    t.cle === "retard" && n > 0 ? "text-rose-600 font-semibold" : "text-slate-400"
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={etiquette}>Horizon</span>
            <select
              className={champ}
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
            >
              {HORIZONS.map((h) => (
                <option key={h.cle} value={h.cle}>
                  {h.libelle}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className={etiquette}>Nature</span>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(LIBELLES_NATURE) as NatureEsv[]).map((n) => {
                const actif = natures.has(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => basculerNature(n)}
                    className={`px-2 py-1 rounded text-[11px] border transition ${
                      actif
                        ? "border-blue-400 bg-blue-50 text-blue-800"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {LIBELLES_NATURE[n]}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
            <span className={etiquette}>Titre</span>
            <input
              className={champ}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Mnémonique, libellé ou ISIN"
            />
          </label>
        </div>
      </div>

      {erreur && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {erreur}
        </p>
      )}
      {message && !erreur && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
          {message}
        </p>
      )}

      {/* ── Pointage en masse ────────────────────────────────────────────── */}
      {retenus.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <span className="text-[11px] text-blue-900">
            <strong>{retenus.length}</strong> flux sélectionné
            {retenus.length > 1 ? "s" : ""} ·{" "}
            <strong className="tabular-nums">{montantFr(totalRetenu)} F</strong> au montant
            attendu
            <button
              type="button"
              onClick={() => setSelection(new Set())}
              className="ml-3 underline hover:text-blue-950"
            >
              tout décocher
            </button>
          </span>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className={etiquette}>Encaissé le</span>
              <input
                type="date"
                className="text-xs border border-slate-300 rounded px-2 py-1"
                value={dateLot}
                onChange={(e) => setDateLot(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={etiquette}>Sur</span>
              <select
                className="text-xs border border-slate-300 rounded px-2 py-1"
                value={compteLot}
                onChange={(e) => setCompteLot(e.target.value)}
              >
                <option value="">— compte —</option>
                {comptes.map((c) => (
                  <option key={c.cle} value={c.cle}>
                    {c.nom} · {c.pays}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={pointerLot}
              disabled={enCours || !compteLot}
              className="text-xs font-medium px-3 py-1.5 rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-40"
            >
              {enCours ? "…" : "Pointer au montant attendu"}
            </button>
          </div>
        </div>
      )}

      {/* ── Le calendrier ────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={
                      selectionnables.length > 0 &&
                      selectionnables.every((c) => selection.has(c))
                    }
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          selectionnables.some((c) => selection.has(c)) &&
                          !selectionnables.every((c) => selection.has(c));
                    }}
                    onChange={toutSelectionner}
                    disabled={selectionnables.length === 0}
                    aria-label="Tout sélectionner"
                  />
                </th>
                <th className="text-left px-2 py-2 font-medium">Date</th>
                <th className="text-left px-2 py-2 font-medium">Titre</th>
                <th className="text-left px-2 py-2 font-medium">Nature</th>
                <th className="text-right px-2 py-2 font-medium">Quantité</th>
                <th className="text-right px-2 py-2 font-medium">Par titre</th>
                <th className="text-right px-2 py-2 font-medium">Attendu</th>
                <th className="text-right px-2 py-2 font-medium">Reçu</th>
                <th className="text-right px-2 py-2 font-medium">Écart</th>
                <th className="text-left px-2 py-2 font-medium">Statut</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtres.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-2 py-8 text-center text-slate-400">
                    {onglet === "retard"
                      ? "Aucun flux en retard. Tout ce qui est échu a été pointé."
                      : "Aucun flux ne correspond à ces filtres."}
                  </td>
                </tr>
              )}
              {parMois.map(([mois, lignes]) => (
                <Mois
                  key={mois}
                  mois={mois}
                  lignes={lignes}
                  selection={selection}
                  detail={detail}
                  enCours={enCours}
                  comptes={comptes}
                  saisie={saisie}
                  cleMontant={cleMontant}
                  setSaisie={setSaisie}
                  onBasculer={basculerSelection}
                  onOuvrir={ouvrirDetail}
                  onPointer={pointerUn}
                  onDepointer={depointer}
                  nomCompte={nomCompte}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-slate-400">
        Comptés depuis le {DEBUT_SUIVI} : ce qui précède a été encaissé hors de ce
        module. Les flux non encore pointés alimentent le point de trésorerie sur la
        ligne <strong>Dividendes, coupons et tombées</strong>, parmi les flux
        théoriques — les quatre natures confondues, c&apos;est ici et ici seulement
        qu&apos;on les distingue. Un flux pointé en sort : le solde bancaire saisi le
        contient déjà.
      </p>
    </div>
  );
}

/** Un mois d'échéancier : son en-tête, puis ses lignes. */
function Mois({
  mois,
  lignes,
  selection,
  detail,
  enCours,
  comptes,
  saisie,
  cleMontant,
  setSaisie,
  onBasculer,
  onOuvrir,
  onPointer,
  onDepointer,
  nomCompte,
}: {
  mois: string;
  lignes: { e: EvenementEsv; statut: StatutEsv }[];
  selection: Set<string>;
  detail: string | null;
  enCours: boolean;
  comptes: Compte[];
  saisie: { dateReception: string; montantRecu: string; compte: string; note: string };
  cleMontant: number;
  setSaisie: (
    f: (s: {
      dateReception: string;
      montantRecu: string;
      compte: string;
      note: string;
    }) => { dateReception: string; montantRecu: string; compte: string; note: string },
  ) => void;
  onBasculer: (cle: string) => void;
  onOuvrir: (e: EvenementEsv) => void;
  onPointer: (e: EvenementEsv) => void;
  onDepointer: (e: EvenementEsv) => void;
  nomCompte: (cle: string) => string;
}) {
  const total = lignes.reduce((s, x) => s + x.e.montantAttendu, 0);

  return (
    <>
      <tr className="bg-slate-50">
        <td colSpan={11} className="px-2 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">
            {libelleMoisEsv(`${mois}-01`)}
          </span>
          <span className="ml-2 text-[10px] text-slate-400 tabular-nums">
            {lignes.length} flux · {montantFr(total)} F
          </span>
        </td>
      </tr>
      {lignes.map(({ e, statut }) => {
        const ecart = ecartReception(e);
        const ouvert = detail === e.cle;
        return (
          <>
            <tr
              key={e.cle}
              className={
                statut === "en_retard"
                  ? "bg-rose-50"
                  : statut === "recu" || statut === "anterieur"
                    ? "text-slate-400"
                    : "hover:bg-slate-50"
              }
            >
              <td className="px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={selection.has(e.cle)}
                  disabled={!!e.reception}
                  onChange={() => onBasculer(e.cle)}
                  aria-label={`Sélectionner ${e.libelle}`}
                />
              </td>
              <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{e.date}</td>
              <td className="px-2 py-1.5">
                <span className="font-medium text-slate-900">{e.code}</span>
                <span className="text-slate-400"> · {e.libelle}</span>
                {/* D'OÙ VIENT LE CHIFFRE, sur la ligne même. Un montant
                    d'avis et un montant d'échéancier ne se contestent pas de
                    la même façon : le premier renvoie à un numéro d'avis, le
                    second à un contrat. */}
                {e.source === "avis_boc" && (
                  <span
                    className="ml-1 text-[9px] text-violet-700 cursor-help"
                    title={e.reserve ?? ""}
                  >
                    avis BOC
                  </span>
                )}
              </td>
              <td className={`px-2 py-1.5 ${COULEUR_NATURE[e.nature]}`}>
                {LIBELLES_NATURE[e.nature]}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt0.format(e.quantite)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt0.format(Math.round(e.montantParTitre))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                {montantFr(e.montantAttendu)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {e.reception ? montantFr(e.reception.montantRecu) : "—"}
              </td>
              <td
                className={`px-2 py-1.5 text-right tabular-nums ${
                  ecart === null || Math.abs(ecart) < 1
                    ? ""
                    : ecart < 0
                      ? "text-rose-700"
                      : "text-emerald-700"
                }`}
              >
                {ecart === null || Math.abs(ecart) < 1
                  ? "—"
                  : `${ecart > 0 ? "+" : ""}${montantFr(ecart)}`}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                <span
                  className={
                    statut === "en_retard"
                      ? "text-rose-700 font-medium"
                      : statut === "recu"
                        ? "text-emerald-700"
                        : statut === "anterieur"
                          ? "text-slate-400"
                          : "text-slate-600"
                  }
                  title={
                    statut === "anterieur"
                      ? `Antérieur au ${DEBUT_SUIVI} : encaissé et comptabilisé hors de ce module.`
                      : undefined
                  }
                >
                  {LIBELLES_STATUT[statut]}
                </span>
                {e.reception && (
                  <span className="block text-[9px] text-slate-400">
                    le {e.reception.dateReception}
                    {e.reception.compte && ` · ${nomCompte(e.reception.compte)}`}
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onOuvrir(e)}
                  disabled={enCours}
                  className="text-[10px] text-blue-700 hover:text-blue-900 disabled:opacity-50"
                >
                  {ouvert ? "Fermer" : e.reception ? "Corriger" : "Pointer"}
                </button>
              </td>
            </tr>

            {ouvert && (
              <tr key={`${e.cle}-saisie`} className="bg-blue-50/50">
                <td colSpan={11} className="px-3 py-2">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-0.5">
                      <span className={etiquette}>Encaissé le</span>
                      <input
                        type="date"
                        className="text-xs border border-slate-300 rounded px-2 py-1"
                        value={saisie.dateReception}
                        onChange={(ev) =>
                          setSaisie((s) => ({ ...s, dateReception: ev.target.value }))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className={etiquette}>Montant reçu</span>
                      <ChampMontant
                        key={`r-${cleMontant}`}
                        valeur={saisie.montantRecu}
                        onChange={(v) => setSaisie((s) => ({ ...s, montantRecu: v }))}
                        className="text-xs border border-slate-300 rounded px-2 py-1"
                      />
                      <span className="text-[9px] text-slate-400">
                        attendu {montantFr(e.montantAttendu)} F
                      </span>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className={etiquette}>Sur</span>
                      <select
                        className="text-xs border border-slate-300 rounded px-2 py-1"
                        value={saisie.compte}
                        onChange={(ev) =>
                          setSaisie((s) => ({ ...s, compte: ev.target.value }))
                        }
                      >
                        <option value="">— compte —</option>
                        {comptes.map((c) => (
                          <option key={c.cle} value={c.cle}>
                            {c.nom} · {c.pays}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5 flex-1 min-w-[10rem]">
                      <span className={etiquette}>Note</span>
                      <input
                        className="text-xs border border-slate-300 rounded px-2 py-1 w-full"
                        value={saisie.note}
                        onChange={(ev) => setSaisie((s) => ({ ...s, note: ev.target.value }))}
                        placeholder="Retenue à la source, avis n°…"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => onPointer(e)}
                      disabled={enCours}
                      className="text-xs font-medium px-3 py-1.5 rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {enCours ? "…" : "Enregistrer"}
                    </button>
                    {e.reception && (
                      <button
                        type="button"
                        onClick={() => onDepointer(e)}
                        disabled={enCours}
                        className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
                        title="Le flux n'était pas arrivé : il redevient attendu"
                      >
                        Dépointer
                      </button>
                    )}
                  </div>
                  {e.reserve && (
                    <p className="text-[10px] text-slate-500 mt-1.5">{e.reserve}</p>
                  )}
                </td>
              </tr>
            )}
          </>
        );
      })}
    </>
  );
}

function Carte({
  titre,
  valeur,
  aide,
  alerte = false,
}: {
  titre: string;
  valeur: string;
  aide?: string;
  alerte?: boolean;
}) {
  return (
    <div
      className={`border rounded-lg p-3 ${
        alerte ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{titre}</div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          alerte ? "text-rose-800" : "text-slate-900"
        }`}
      >
        {valeur}
      </div>
      {aide && <div className="text-[9px] text-slate-400">{aide}</div>}
    </div>
  );
}

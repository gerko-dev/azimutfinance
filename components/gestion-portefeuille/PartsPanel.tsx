"use client";

// === Souscriptions et rachats de parts — module interfonds ===
//
// LE PASSIF DU FONDS. Un investisseur qui souscrit apporte du cash, un
// investisseur qui demande son rachat en retire : ce sont les deux seuls flux
// que le gérant ne décide pas. Il les subit, et c'est bien pourquoi le
// trésorier veut les voir venir.
//
// INTERFONDS, comme les opérations de marché : une collecte se saisit par
// bordereau, et un même bureau place sur plusieurs fonds le même jour.
//
// LA DATE DE RÈGLEMENT NE SE SAISIT PAS AU FORMULAIRE. Un ordre reçu n'en a
// pas encore : elle s'apprend quand le mouvement passe. La promettre d'avance,
// c'était faire sortir le flux du point à un jour choisi arbitrairement. Elle
// se pose donc d'un bouton sur la ligne, quand le relevé la donne.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  comptesPartsAction,
  vlDisponiblesAction,
  enregistrerFluxPartAction,
  modifierFluxPartAction,
  reglerFluxPartAction,
  supprimerFluxPartAction,
} from "@/app/gestion-portefeuille/parts-actions";
import {
  LIBELLES_BUREAU,
  LIBELLES_CERTITUDE,
  LIBELLES_SENS_PART,
  LIBELLES_TYPE_CLIENT,
  cibleAttendue,
  fraisPart,
  partsDuFlux,
  postePart,
  type Bureau,
  type Certitude,
  type FluxPartAvecFonds,
  type SensPart,
  type TypeClient,
} from "@/app/gestion-portefeuille/parts-types";
import type { Partenaire } from "@/app/gestion-portefeuille/partenaires-types";
import ChampMontant from "./ChampMontant";
import RecapClientsSensibles, { type VlCourante } from "./RecapClientsSensibles";
import ChampTaux from "./ChampTaux";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
// Les parts se comptent en millièmes : un arrondi à deux décimales sur une
// souscription de plusieurs millions ferait disparaître des montants réels.
const fmt4 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const montantFr = (v: number) => fmt0.format(Math.round(v));
const pct = (v: number) =>
  `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 4 })} %`;
const dateFr = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR") : "—";

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";
const aide = "text-[9px] text-slate-400";

function Champ({
  label,
  children,
  large = false,
}: {
  label: string;
  children: React.ReactNode;
  large?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${large ? "sm:col-span-2" : ""}`}>
      <span className={etiquette}>{label}</span>
      {children}
    </label>
  );
}

const n = (t: string) => Number(t.replace(/\s/g, "").replace(",", ".")) || 0;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Onglets. Les deux premiers sont des RÉCAPITULATIFS : rien ne s'y saisit. */
type Onglet = "souscriptions" | "rachats" | "sensibles" | "saisie";
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "souscriptions", libelle: "Souscriptions" },
  { cle: "rachats", libelle: "Rachats" },
  { cle: "sensibles", libelle: "Clients sensibles" },
  { cle: "saisie", libelle: "Saisir un flux" },
];

export type FondsAvecFrais = {
  id: string;
  nom: string;
  /** Droits d'entrée et de sortie du fonds, en DÉCIMAL. Repris à la saisie. */
  droitEntree: number;
  droitSortie: number;
};

export default function PartsPanel({
  fonds,
  flux,
  comptesInitiaux,
  vlsInitiales,
  vlCourantes,
  vlSorties,
  erreurFlux,
  clientsSensibles,
}: {
  fonds: FondsAvecFrais[];
  flux: FluxPartAvecFonds[];
  /** Comptes du PREMIER fonds, résolus au serveur. Les suivants se chargent au
   *  changement de fonds, sur l'événement — le lint du projet interdit un
   *  setState dans un effet, et il a raison. */
  comptesInitiaux: { cle: string; nom: string }[];
  /** VL publiées du PREMIER fonds, pour la même raison que les comptes. */
  vlsInitiales: { date: string; vl: number }[];
  /** VL la plus récente de CHAQUE fonds : le suivi des clients sensibles
   *  mesure la performance depuis l'entrée, tous fonds confondus. */
  vlCourantes: Record<string, VlCourante>;
  /** VL à la date de sortie, pour les positions déjà closes. */
  vlSorties: Record<string, VlCourante>;
  /** Message d'erreur si la LECTURE des flux a échoué. Un écran vide parce
   *  qu'une requête a échoué ne doit pas se lire comme un écran vide parce
   *  qu'il n'y a rien. */
  erreurFlux: string | null;
  /** Saisis dans Paramètres › Partenaires, sous la nature « Client sensible ». */
  clientsSensibles: Partenaire[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [onglet, setOnglet] = useState<Onglet>("souscriptions");
  const [retour, setRetour] = useState<Onglet>("souscriptions");

  const [editionId, setEditionId] = useState<string | null>(null);
  const [fondsId, setFondsId] = useState(fonds[0]?.id ?? "");
  const [dateOperation, setDateOperation] = useState(aujourdhui);
  const [sens, setSens] = useState<SensPart>("souscription");
  const [bureau, setBureau] = useState<Bureau>("CI");
  const [certitude, setCertitude] = useState<Certitude>("certain");
  const [typeClient, setTypeClient] = useState<TypeClient>("autre");
  const [investisseur, setInvestisseur] = useState("");
  const [montant, setMontant] = useState("");
  const [compteReglement, setCompteReglement] = useState("");
  const [note, setNote] = useState("");

  const fondsChoisi = fonds.find((f) => f.id === fondsId);
  /** Taux appliqué. Repris du fonds au changement de fonds ou de sens, puis
   *  libre : un gros souscripteur négocie son droit d'entrée. */
  const [tauxFrais, setTauxFrais] = useState(fonds[0]?.droitEntree ?? 0);
  // `ChampTaux` garde son propre texte et ne se resynchronise pas tout seul :
  // on le remonte en changeant sa clé quand le défaut change.
  const [cleTaux, setCleTaux] = useState(0);

  const poserTaux = (v: number) => {
    setTauxFrais(v);
    setCleTaux((k) => k + 1);
  };

  /** VL publiées du fonds choisi. La VL de souscription s'y CHOISIT : une VL
   *  retapée à la main finit par diverger de celle de l'historique. */
  const [vls, setVls] = useState<{ date: string; vl: number }[]>(vlsInitiales);
  const [dateVl, setDateVl] = useState("");
  /** Engagement pris à l'entrée envers un client sensible. Son propre état et
   *  sa propre clé : `ChampTaux` garde son texte et ne se resynchronise pas. */
  const [performanceCible, setPerformanceCible] = useState(0);
  const [cleCible, setCleCible] = useState(0);
  /** Échéance convenue avec le client, s'il y en a une. Facultative. */
  const [dateFin, setDateFin] = useState("");

  const [comptes, setComptes] = useState(comptesInitiaux);
  const [comptesEtat, setComptesEtat] = useState<"chargement" | "pret" | "erreur">("pret");

  /** Ligne dont la date de règlement est en cours de saisie. Une seule à la
   *  fois : deux champs ouverts inviteraient à se tromper de ligne. */
  const [reglementOuvert, setReglementOuvert] = useState<string | null>(null);
  const [dateReglement, setDateReglement] = useState(aujourdhui);

  const defautFrais = (f: FondsAvecFrais | undefined, s: SensPart) =>
    s === "souscription" ? (f?.droitEntree ?? 0) : (f?.droitSortie ?? 0);

  const changerFonds = (id: string) => {
    setFondsId(id);
    setCompteReglement("");
    poserTaux(defautFrais(fonds.find((f) => f.id === id), sens));
    // LES VL APPARTIENNENT AU FONDS : garder celles d'avant aurait laissé
    // souscrire à la valeur liquidative d'un autre portefeuille.
    setDateVl("");
    setComptesEtat("chargement");
    demarrer(async () => {
      const [resComptes, resVls] = await Promise.all([
        comptesPartsAction(id),
        vlDisponiblesAction(id),
      ]);
      setVls(resVls.ok ? resVls.data : []);
      if (resComptes.ok) {
        setComptes(resComptes.data);
        setComptesEtat("pret");
      } else {
        setComptes([]);
        setComptesEtat("erreur");
        setErreur(resComptes.error);
      }
    });
  };

  const changerSens = (s: SensPart) => {
    setSens(s);
    // Le droit d'entrée et celui de sortie ne sont pas le même taux : changer
    // de sens sans changer le taux aurait appliqué l'un pour l'autre.
    poserTaux(defautFrais(fondsChoisi, s));
  };

  /** Le poste visé, annoncé pendant la saisie : c'est là que le montant ira
   *  tomber, et le voir d'avance évite de découvrir l'erreur dans le tableau. */
  const poste = useMemo(
    () => postePart({ sens, bureau: sens === "souscription" ? bureau : null, certitude }),
    [sens, bureau, certitude],
  );

  /** VL retenue, et les parts qu'elle donne. DÉDUITES : le gérant choisit une
   *  date, le reste en découle. */
  const vlChoisie = vls.find((v) => v.date === dateVl);
  const parts = partsDuFlux({ montant: n(montant), tauxFrais, vl: vlChoisie?.vl ?? null });

  const reinitialiser = () => {
    setEditionId(null);
    setInvestisseur("");
    setMontant("");
    setNote("");
    setDateFin("");
  };

  const enregistrer = () => {
    setErreur(null);
    setOk(false);
    if (!fondsId) {
      setErreur("Choisis le fonds concerné.");
      return;
    }
    demarrer(async () => {
      const saisie = {
        dateOperation,
        sens,
        bureau: sens === "souscription" ? bureau : null,
        certitude,
        typeClient,
        investisseur,
        montant: n(montant),
        tauxFrais,
        dateVl: dateVl || null,
        vl: vlChoisie?.vl ?? null,
        performanceCible: cibleAttendue({ sens, typeClient }) ? performanceCible : null,
        dateFin: cibleAttendue({ sens, typeClient }) && dateFin ? dateFin : null,
        compteReglement,
        note,
      };
      const res = editionId
        ? await modifierFluxPartAction(fondsId, editionId, saisie)
        : await enregistrerFluxPartAction(fondsId, saisie);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setOk(true);
      // Le fonds, la date, le sens et le taux RESTENT : on saisit un bordereau
      // de collecte, et les lignes qui se suivent partagent l'essentiel.
      reinitialiser();
      if (editionId) setOnglet(retour);
      router.refresh();
    });
  };

  const modifier = (f: FluxPartAvecFonds) => {
    setErreur(null);
    setOk(false);
    setEditionId(f.id);
    setFondsId(f.fondsId);
    setDateOperation(f.dateOperation);
    setSens(f.sens);
    if (f.bureau) setBureau(f.bureau);
    setCertitude(f.certitude);
    setTypeClient(f.typeClient);
    setInvestisseur(f.investisseur);
    setMontant(String(Math.round(f.montant)));
    poserTaux(f.tauxFrais);
    setDateVl(f.dateVl ?? "");
    setPerformanceCible(f.performanceCible ?? 0);
    setCleCible((k) => k + 1);
    setDateFin(f.dateFin ?? "");
    setCompteReglement(f.compteReglement);
    setNote(f.note);
    setRetour(onglet === "saisie" ? "souscriptions" : onglet);
    setOnglet("saisie");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const regler = (f: FluxPartAvecFonds, date: string | null) => {
    setErreur(null);
    demarrer(async () => {
      const res = await reglerFluxPartAction(f.fondsId, f.id, date);
      if (!res.ok) setErreur(res.error);
      else {
        setReglementOuvert(null);
        router.refresh();
      }
    });
  };

  const supprimer = (f: FluxPartAvecFonds) => {
    demarrer(async () => {
      const res = await supprimerFluxPartAction(f.fondsId, f.id);
      if (!res.ok) setErreur(res.error);
      else router.refresh();
    });
  };

  const souscriptions = flux.filter((f) => f.sens === "souscription");
  const rachats = flux.filter((f) => f.sens === "rachat");
  const sensibles = souscriptions.filter((f) => f.typeClient === "sensible");

  const totaux = useMemo(() => {
    let souscrit = 0;
    let rachete = 0;
    for (const f of flux) {
      // EN ATTENTE seulement : un flux réglé est déjà dans le solde bancaire,
      // l'ajouter ici le ferait compter deux fois à l'œil du trésorier.
      if (f.dateReglement) continue;
      if (f.sens === "souscription") souscrit += f.montant;
      else rachete += f.montant;
    }
    return { souscrit, rachete, net: souscrit - rachete };
  }, [flux]);

  /**
   * Un tableau de flux. Les deux onglets n'en diffèrent que par les colonnes
   * qui n'ont de sens que d'un côté — le bureau, qui ne concerne que la
   * collecte.
   *
   * Une FONCTION DE RENDU, pas un composant : un composant déclaré dans le
   * corps du parent est recréé à chaque rendu, et React remonte alors tout son
   * sous-arbre — la date à moitié tapée dans la ligne ouverte disparaîtrait
   * sous les doigts.
   */
  const tableau = (lignes: FluxPartAvecFonds[], avecBureau: boolean) => (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Ordre</th>
              <th className="text-left px-3 py-2 font-medium">Fonds</th>
              <th className="text-left px-3 py-2 font-medium">Client</th>
              {avecBureau && <th className="text-left px-3 py-2 font-medium">Bureau</th>}
              <th className="text-right px-3 py-2 font-medium">Montant</th>
              <th className="text-right px-3 py-2 font-medium">
                {avecBureau ? "Droit d'entrée" : "Droit de sortie"}
              </th>
              <th className="text-right px-3 py-2 font-medium">VL / parts</th>
              <th className="text-left px-3 py-2 font-medium">Compte</th>
              <th className="text-left px-3 py-2 font-medium">État</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.length === 0 && (
              <tr>
                <td colSpan={avecBureau ? 10 : 9} className="px-3 py-6 text-center text-slate-400">
                  Aucun flux saisi.
                </td>
              </tr>
            )}
            {lignes.map((f) => (
              <tr
                key={f.id}
                className={`hover:bg-slate-50 ${f.dateReglement ? "text-slate-400" : ""}`}
              >
                <td className="px-3 py-1.5">{dateFr(f.dateOperation)}</td>
                <td className="px-3 py-1.5">{f.fondsNom}</td>
                <td className="px-3 py-1.5">
                  <span className="font-medium text-slate-800">
                    {f.investisseur || "—"}
                  </span>
                  {f.typeClient === "sensible" && (
                    <span className="ml-1 text-[10px] text-blue-700">sensible</span>
                  )}
                  {f.certitude === "probable" && (
                    <div className="text-[10px] text-amber-700">probable</div>
                  )}
                  {f.performanceCible != null && (
                    <div className="text-[10px] text-blue-700">
                      cible {pct(f.performanceCible)}
                    </div>
                  )}
                </td>
                {avecBureau && (
                  <td className="px-3 py-1.5">
                    {f.bureau ? LIBELLES_BUREAU[f.bureau] : "—"}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                  {montantFr(f.montant)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {pct(f.tauxFrais)}
                  <div className="text-[10px] text-slate-400">
                    {montantFr(fraisPart(f))} F
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {f.vl ? (
                    <>
                      {fmt2.format(f.vl)}
                      <div className="text-[10px] text-slate-400">
                        {dateFr(f.dateVl)} ·{" "}
                        {(() => {
                          const p = partsDuFlux(f);
                          return p == null ? "—" : `${fmt2.format(p)} parts`;
                        })()}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-1.5">{f.compteReglement || "—"}</td>
                <td className="px-3 py-1.5">
                  {f.dateReglement ? (
                    <span className="text-emerald-700">
                      Réglé le {dateFr(f.dateReglement)}
                    </span>
                  ) : (
                    <span className="text-amber-700">En attente</span>
                  )}
                  <div className="text-[10px] text-slate-400">{postePart(f)}</div>
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  {/* LA DATE DE RÈGLEMENT SE RENSEIGNE ICI, quand le relevé la
                      donne — pas à la saisie, où elle n'aurait été qu'une
                      promesse. Une fois posée, le flux sort du point : le solde
                      bancaire contient déjà le mouvement. */}
                  {f.dateReglement ? (
                    <button
                      onClick={() => regler(f, null)}
                      disabled={enCours}
                      className="text-[10px] text-emerald-700 hover:text-emerald-900 disabled:opacity-50 mr-3"
                      title="Défaire le règlement"
                    >
                      ✓ réglé
                    </button>
                  ) : reglementOuvert === f.id ? (
                    <span className="inline-flex items-center gap-1 mr-3">
                      <input
                        type="date"
                        value={dateReglement}
                        onChange={(e) => setDateReglement(e.target.value)}
                        className="text-[10px] border border-slate-300 rounded px-1 py-0.5"
                      />
                      <button
                        onClick={() => regler(f, dateReglement)}
                        disabled={enCours}
                        className="text-[10px] text-blue-700 hover:text-blue-900 disabled:opacity-50"
                      >
                        Valider
                      </button>
                      <button
                        onClick={() => setReglementOuvert(null)}
                        className="text-[10px] text-slate-400 hover:text-slate-700"
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setDateReglement(aujourdhui());
                        setReglementOuvert(f.id);
                      }}
                      disabled={enCours}
                      className="text-[10px] text-blue-700 hover:text-blue-900 disabled:opacity-50 mr-3"
                    >
                      Régler
                    </button>
                  )}
                  <button
                    onClick={() => modifier(f)}
                    disabled={enCours}
                    className="text-[10px] text-slate-500 hover:text-slate-900 disabled:opacity-50 mr-3"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => supprimer(f)}
                    disabled={enCours}
                    className="text-[10px] text-rose-600 hover:text-rose-800 disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          Souscriptions et rachats
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Le passif du fonds. Ces flux alimentent le{" "}
          <strong>point de trésorerie</strong> : les souscriptions dans le cash à
          recevoir, les rachats dans les engagements — et les flux seulement{" "}
          <em>probables</em> dans les flux théoriques, qui ne pèsent que sur le solde
          théorique.
        </p>
      </div>

      {/* ── Collecte nette ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { l: "Souscriptions en attente", v: totaux.souscrit, c: "text-emerald-700" },
          { l: "Rachats en attente", v: totaux.rachete, c: "text-rose-700" },
          {
            l: "Collecte nette",
            v: totaux.net,
            c: totaux.net >= 0 ? "text-emerald-700" : "text-rose-700",
          },
        ].map((b) => (
          <div key={b.l} className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              {b.l}
            </div>
            <div className={`text-lg font-semibold tabular-nums ${b.c}`}>
              {montantFr(b.v)} F
            </div>
          </div>
        ))}
      </div>

      {/* ── Onglets ──────────────────────────────────────────────────────── */}
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {ONGLETS.map((t) => {
          const nb =
            t.cle === "souscriptions"
              ? souscriptions.length
              : t.cle === "rachats"
                ? rachats.length
                : t.cle === "sensibles"
                  ? sensibles.length
                  : 0;
          const actif = onglet === t.cle;
          return (
            <button
              key={t.cle}
              type="button"
              onClick={() => setOnglet(t.cle)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition ${
                actif
                  ? "border-blue-700 text-blue-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.libelle}
              {t.cle !== "saisie" && (
                <span className="ml-1.5 text-[10px] text-slate-400">{nb}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* UNE LECTURE QUI A ÉCHOUÉ NE SE LIT PAS COMME UN ÉCRAN VIDE. Le cas
          type : un script SQL pas encore joué, une colonne absente, et tous
          les onglets qui se vident sans rien dire. */}
      {erreurFlux && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          Les flux n&apos;ont pas pu être lus : {erreurFlux}. Vérifie que{" "}
          <code>supabase/fund-souscriptions-rachats.sql</code> a bien été exécuté dans
          sa dernière version.
        </p>
      )}

      {erreur && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {erreur}
        </p>
      )}

      {onglet === "souscriptions" && tableau(souscriptions, true)}
      {onglet === "rachats" && tableau(rachats, false)}
      {onglet === "sensibles" && (
        <RecapClientsSensibles
          flux={flux}
          vlCourantes={vlCourantes}
          vlSorties={vlSorties}
        />
      )}

      {/* ── Formulaire ───────────────────────────────────────────────────── */}
      {onglet === "saisie" && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {editionId ? "Modifier le flux" : "Saisir un flux"}
            </h2>
            {editionId && (
              <button
                type="button"
                onClick={() => {
                  reinitialiser();
                  setOnglet(retour);
                }}
                className="text-[11px] text-slate-500 hover:text-slate-900"
              >
                Abandonner la modification
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Alimente le poste «&nbsp;{poste}&nbsp;» du point de trésorerie, sur le compte
            choisi. Il en sortira une fois réglé, depuis sa ligne.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <Champ label="Fonds">
              <select
                value={fondsId}
                onChange={(e) => changerFonds(e.target.value)}
                className={champ}
              >
                {fonds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ label="Sens">
              <select
                value={sens}
                onChange={(e) => changerSens(e.target.value as SensPart)}
                className={champ}
              >
                {(Object.keys(LIBELLES_SENS_PART) as SensPart[]).map((k) => (
                  <option key={k} value={k}>
                    {LIBELLES_SENS_PART[k]}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ label="Date de l'ordre">
              <input
                type="date"
                value={dateOperation}
                onChange={(e) => setDateOperation(e.target.value)}
                className={champ}
              />
              <span className={aide}>Le règlement se pose plus tard, sur la ligne</span>
            </Champ>

            <Champ label="Certitude">
              <select
                value={certitude}
                onChange={(e) => setCertitude(e.target.value as Certitude)}
                className={champ}
              >
                {(Object.keys(LIBELLES_CERTITUDE) as Certitude[]).map((k) => (
                  <option key={k} value={k}>
                    {LIBELLES_CERTITUDE[k]}
                  </option>
                ))}
              </select>
              <span className={aide}>
                {certitude === "certain"
                  ? "Pèse dans le solde réel"
                  : "Flux théoriques seulement"}
              </span>
            </Champ>

            <Champ label="Type de client">
              <select
                value={typeClient}
                onChange={(e) => {
                  // Le nom ne survit pas au changement : un nom libre n'est pas
                  // une entrée du référentiel, et l'inverse non plus.
                  setTypeClient(e.target.value as TypeClient);
                  setInvestisseur("");
                }}
                className={champ}
              >
                {(Object.keys(LIBELLES_TYPE_CLIENT) as TypeClient[]).map((k) => (
                  <option key={k} value={k}>
                    {LIBELLES_TYPE_CLIENT[k]}
                  </option>
                ))}
              </select>
            </Champ>

            {/* UN CLIENT SENSIBLE SE NOMME UNE FOIS, au référentiel. Saisi à la
                main sur chaque bordereau, son nom divergeait d'une ligne à
                l'autre et tout regroupement par client devenait faux. */}
            <Champ label="Client">
              {typeClient === "sensible" ? (
                <>
                  <select
                    value={investisseur}
                    onChange={(e) => setInvestisseur(e.target.value)}
                    className={champ}
                  >
                    <option value="">— Choisir —</option>
                    {clientsSensibles.map((c) => (
                      <option key={c.id} value={c.nom}>
                        {c.nom}
                      </option>
                    ))}
                    {investisseur &&
                      !clientsSensibles.some((c) => c.nom === investisseur) && (
                        <option value={investisseur}>{investisseur} (hors liste)</option>
                      )}
                  </select>
                  {clientsSensibles.length === 0 && (
                    <span className={aide}>
                      Aucun client sensible — ajoute-le dans Paramètres › Partenaires.
                    </span>
                  )}
                </>
              ) : (
                <input
                  value={investisseur}
                  onChange={(e) => setInvestisseur(e.target.value)}
                  placeholder="Nom du souscripteur"
                  className={champ}
                />
              )}
            </Champ>

            {/* UNE SOUSCRIPTION DE CLIENT SENSIBLE PORTE UN ENGAGEMENT.
                C'est contre cette cible que le client jugera le fonds et
                décidera de rester ou de sortir ; la laisser dans la tête du
                commercial, c'est ne plus savoir six mois plus tard ce qui
                avait été promis à qui. Elle n'a de sens ni sur un rachat, qui
                ne promet rien, ni sur un autre client, qui n'en négocie pas. */}
            {cibleAttendue({ sens, typeClient }) && (
              <Champ label="Performance cible (%)">
                <ChampTaux
                  key={cleCible}
                  valeur={performanceCible}
                  onChange={setPerformanceCible}
                  className={`${champ} text-right tabular-nums`}
                />
                <span className={aide}>Engagement annuel pris à l&apos;entrée</span>
              </Champ>
            )}

            {/* FACULTATIVE. Beaucoup de souscriptions n'ont pas d'échéance, et
                l'exiger aurait poussé à en inventer une. Renseignée, elle fait
                foi sur la date de rachat déduite des flux : c'est ce qui a été
                convenu, et le rachat effectif peut tomber un autre jour. */}
            {cibleAttendue({ sens, typeClient }) && (
              <Champ label="Date de fin (rachat)">
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className={champ}
                />
                <span className={aide}>Facultative — vide si sans échéance</span>
              </Champ>
            )}

            {/* LE BUREAU NE CONCERNE QUE LES SOUSCRIPTIONS. Le classeur ne
                ventile pas les rachats, et pour cause : c'est une lecture
                commerciale — qui a collecté — et un rachat ne se collecte pas. */}
            {sens === "souscription" ? (
              <Champ label="Bureau collecteur">
                <select
                  value={bureau}
                  onChange={(e) => setBureau(e.target.value as Bureau)}
                  className={champ}
                >
                  {(Object.keys(LIBELLES_BUREAU) as Bureau[]).map((k) => (
                    <option key={k} value={k}>
                      {LIBELLES_BUREAU[k]}
                    </option>
                  ))}
                </select>
              </Champ>
            ) : (
              <Champ label="Bureau collecteur">
                <div className="text-xs border border-slate-200 bg-slate-50 rounded px-2 py-1.5 text-slate-500">
                  Sans objet
                </div>
                <span className={aide}>Un rachat ne se collecte pas</span>
              </Champ>
            )}

            <Champ label="Montant">
              <ChampMontant
                valeur={montant}
                onChange={setMontant}
                className={`${champ} text-right tabular-nums`}
              />
              <span className={aide}>Ce qui bouge sur le compte</span>
            </Champ>

            {/* REPRIS DU FONDS, ET MODIFIABLE. Le retaper à chaque ligne était
                la porte ouverte au taux d'un autre fonds ; le figer aurait
                obligé à corriger ailleurs un gros souscripteur qui négocie. */}
            <Champ
              label={sens === "souscription" ? "Droit d'entrée (%)" : "Droit de sortie (%)"}
            >
              <ChampTaux
                key={cleTaux}
                valeur={tauxFrais}
                onChange={setTauxFrais}
                className={`${champ} text-right tabular-nums`}
              />
              <span className={aide}>
                {montantFr(n(montant) * tauxFrais)} F ·{" "}
                {fondsChoisi && tauxFrais !== defautFrais(fondsChoisi, sens)
                  ? `négocié (fonds : ${pct(defautFrais(fondsChoisi, sens))})`
                  : "taux du fonds"}
              </span>
            </Champ>

            {/* LA VL SE CHOISIT PARMI CELLES PUBLIÉES, jamais ne se tape : une
                date sans VL ne convertit aucun montant en parts, et une VL
                retapée finit par diverger de celle de l'historique — donc du
                reporting. Le champ voisin ne fait que montrer ce qui en
                découle. */}
            <Champ label="Date de VL">
              <select
                value={dateVl}
                onChange={(e) => setDateVl(e.target.value)}
                className={champ}
              >
                <option value="">— Aucune pour l&apos;instant —</option>
                {vls.map((v) => (
                  <option key={v.date} value={v.date}>
                    {dateFr(v.date)}
                  </option>
                ))}
                {dateVl && !vls.some((v) => v.date === dateVl) && (
                  <option value={dateVl}>{dateFr(dateVl)} (hors historique)</option>
                )}
              </select>
              <span className={aide}>
                {vls.length === 0
                  ? "Ce fonds n'a pas d'historique de VL"
                  : "Un ordre reçu avant la prochaine valorisation n'en a pas encore"}
              </span>
            </Champ>

            <Champ label="VL">
              <div className="text-xs border border-slate-200 bg-slate-50 rounded px-2 py-1.5 text-right tabular-nums text-slate-700">
                {vlChoisie ? fmt2.format(vlChoisie.vl) : "—"}
              </div>
              <span className={aide}>Déduite de la date retenue</span>
            </Champ>

            {/* LE NOMBRE DE PARTS EST DÉDUIT, pas saisi : montant net de frais
                divisé par la VL. Le montrer ici évite d'avoir à le calculer de
                tête pour vérifier qu'on a retenu la bonne VL — c'est sur ce
                chiffre-là que le souscripteur comptera. */}
            <Champ label="Nombre de parts">
              <div className="text-xs border border-slate-200 bg-slate-50 rounded px-2 py-1.5 text-right tabular-nums text-slate-700">
                {parts != null ? fmt4.format(parts) : "—"}
              </div>
              <span className={aide}>
                {parts != null
                  ? `${montantFr(n(montant) - n(montant) * tauxFrais)} F nets ÷ ${fmt2.format(
                      vlChoisie!.vl,
                    )}`
                  : "Choisis une date de VL"}
              </span>
            </Champ>

            <Champ label="Compte de règlement" large>
              <select
                value={compteReglement}
                onChange={(e) => setCompteReglement(e.target.value)}
                disabled={comptesEtat !== "pret"}
                className={`${champ} disabled:bg-slate-50`}
              >
                <option value="">— Choisir —</option>
                {comptes.map((c) => (
                  <option key={c.cle} value={c.cle}>
                    {c.nom}
                  </option>
                ))}
                {compteReglement && !comptes.some((c) => c.cle === compteReglement) && (
                  <option value={compteReglement}>{compteReglement} (hors liste)</option>
                )}
              </select>
              <span className={aide}>
                {comptesEtat === "chargement"
                  ? "Chargement des comptes…"
                  : "La colonne du tableau où le montant tombera"}
              </span>
            </Champ>

            <Champ label="Note" large>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={champ}
              />
            </Champ>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-600 tabular-nums">
              {montantFr(n(montant))} F ·{" "}
              <span className="text-slate-400">{poste}</span>
            </span>
            <button
              onClick={enregistrer}
              disabled={enCours}
              className="px-4 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
            >
              {enCours
                ? "Enregistrement…"
                : editionId
                  ? "Enregistrer la correction"
                  : "Enregistrer le flux"}
            </button>
          </div>

          {ok && !erreur && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 mt-3">
              Flux enregistré. Il pèse au point de trésorerie jusqu&apos;à son règlement.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

// === Opérations de marché — module interfonds ===
//
// Reprend la feuille « Opérations de marché » du classeur : une ligne par
// négociation, TOUS FONDS CONFONDUS, le fonds étant une colonne de la saisie.
// C'est l'ordre de travail du gérant — une même adjudication se répartit entre
// plusieurs portefeuilles, et changer d'écran entre deux lignes du même
// bordereau n'aurait pas de sens.
//
// LE TITRE SE CHOISIT, IL NE SE RETAPE PAS. Le site connaît le référentiel
// BRVM et les titres publics UMOA : l'ISIN, le taux facial et les dates de
// détachement en découlent, et avec eux les intérêts courus. Les ressaisir à
// la main était la porte ouverte à un zéro oublié sur un montant à neuf
// chiffres.
//
// Pour l'instant, ces opérations n'alimentent QUE le point de trésorerie.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  caracteristiquesTitreAction,
  comptesReglementAction,
  ajouterExecutionAction,
  cloturerOrdreAction,
  enregistrerOperationMarcheAction,
  listerTitresAction,
  modifierOperationMarcheAction,
  rapprocherExecutionAction,
  rapprocherOperationAction,
  reprendrePretAction,
  supprimerExecutionAction,
  supprimerOperationMarcheAction,
  supprimerOperationsMarcheAction,
} from "@/app/gestion-portefeuille/operations-marche-actions";
import {
  DESCRIPTIONS,
  INSTRUMENTS_ADMIS,
  LIBELLES_INSTRUMENT,
  LIBELLES_VALIDITE,
  dateLimiteOrdre,
  etatOrdre,
  LIBELLES_MODALITE,
  marcheDe,
  montantOperation,
  posteEngage,
  posteRealise,
  remereNoue,
  quantiteExecutee,
  quantiteRestante,
  sensDe,
  type DescriptionOperation,
  type Instrument,
  type ModaliteSouscription,
  descriptionDenouement,
  sensRemereDe,
  type SaisiePret,
  type SaisieRemere,
  type Validite,
} from "@/app/gestion-portefeuille/operations-marche-types";
import ChampMontant from "./ChampMontant";
import VoletsMtp, { type EtatVolets } from "./VoletsMtp";
import { RecapPrets, RecapRemeres } from "./RecapVolets";
import RecapPrimaire from "./RecapPrimaire";
import ImportOperationsMarche from "./ImportOperationsMarche";
import type { OperationAvecFonds } from "@/app/gestion-portefeuille/operations-marche-data";
import type { OptionTitre } from "@/app/gestion-portefeuille/operations-marche-titres";
import type { Partenaire } from "@/app/gestion-portefeuille/partenaires-types";
import LigneOrdre from "./LigneOrdre";
import type { ParametresMarche } from "@/app/gestion-portefeuille/parametres-marche-types";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";
const aide = "text-[9px] text-slate-400";

/** Courtage et TPS de repli, quand aucune SGI n'est encore choisie.
 *
 *  Les commissions de PLACE n'y figurent plus : elles viennent des paramètres
 *  du gérant, et le courtage réel vient de la fiche de la SGI. Ces deux
 *  nombres ne servent donc qu'à ne pas laisser le formulaire à zéro sur une
 *  opération d'actions. */
const TAUX_ACTIONS = { courtage: 0.004, tps: 0.1 };

/** Onglets de l'écran. Les deux derniers sont des RÉCAPITULATIFS : rien ne s'y
 *  saisit, tout se corrige sur l'ordre. */
type Onglet =
  | "operations"
  | "saisie"
  | "importation"
  | "primaire"
  | "remeres"
  | "prets";
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "operations", libelle: "Opérations" },
  { cle: "saisie", libelle: "Saisir un ordre" },
  { cle: "importation", libelle: "Importation" },
  { cle: "primaire", libelle: "Marché primaire" },
  { cle: "remeres", libelle: "Rémérés" },
  { cle: "prets", libelle: "Prêts de titres" },
];

/** Volets réméré et prêt au repos. Un ordre ordinaire n'en porte aucun. */
const VOLETS_VIDES: EtatVolets = {
  estRemere: false,
  estPret: false,
  remere: {
    dateFin: "",
    contrepartie: "",
    prixSortie: 10000,
    denouePar: null,
  },
  pret: {
    contrepartie: "",
    dateFin: null,
    tauxCommission: 0.005,
    dateReprise: null,
  },
};

/** Libellé complet d'une option — c'est CE TEXTE que le navigateur recopie
 *  dans le champ quand on choisit une suggestion du `datalist`, et donc à la
 *  fois ce sur quoi la recherche porte et la clef de résolution au retour.
 *
 *  Le MNÉMONIQUE vient en tête : c'est par lui qu'un gérant désigne un titre
 *  — « SNTS », pas « SONATEL SN » — et le `datalist` filtre sur tout le
 *  texte, donc le placer devant le rend utilisable dès la première frappe. */
const libelleOption = (t: OptionTitre) =>
  `${t.symbole ? `${t.symbole} — ` : ""}${t.libelle} · ${t.detail}`;

type Compte = {
  cle: string;
  nom: string;
  pays: string;
  sens: string;
  /** « Comptes dépositaires », « Comptes espèce » ou « Mobile Money ». Sert à
   *  isoler les BANQUES : un BTCC tient un compte-titres, un opérateur de
   *  monnaie électronique n'en tient pas. */
  groupe: string;
};
type Etat = { code: string; nom: string };

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

export default function OperationsMarchePanel({
  fonds,
  operations,
  comptesInitiaux,
  etatsInitiaux,
  titresInitiaux,
  sgi,
  contrepartiesRemere,
  parametres,
}: {
  fonds: { id: string; nom: string }[];
  operations: OperationAvecFonds[];
  /** Comptes du PREMIER fonds, résolus au serveur. Les suivants se chargent
   *  au changement de fonds, c'est-à-dire sur un ÉVÉNEMENT et non dans un
   *  effet — le lint du projet interdit un setState dans un effet, et il a
   *  raison : ce serait un rendu en cascade pour une donnée qu'on sait
   *  produire au moment du clic. */
  comptesInitiaux: Compte[];
  etatsInitiaux: Etat[];
  /** Titres du marché présenté d'emblée (MTP, premier État). */
  titresInitiaux: OptionTitre[];
  /** SGI actives, saisies dans Paramètres › Partenaires. Leur taux de
   *  courtage standard se reporte au choix. */
  sgi: Partenaire[];
  contrepartiesRemere: Partenaire[];
  /** Conventions de denouement et commissions de place, configurees dans
   *  Parametres › Operations de marche. */
  parametres: ParametresMarche;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [fondsId, setFondsId] = useState(fonds[0]?.id ?? "");
  const [dateOperation, setDateOperation] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [description, setDescription] = useState<DescriptionOperation>("ACHAT_MTP");
  const [instrument, setInstrument] = useState<Instrument>("mtp");
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [quantite, setQuantite] = useState("");
  const [prix, setPrix] = useState("");
  const [sgiNom, setSgi] = useState("");
  const [tauxCourtage, setTauxCourtage] = useState("0");
  const [tauxTps, setTauxTps] = useState("0");
  const [tauxBrvm, setTauxBrvm] = useState("0");
  const [tauxDcbr, setTauxDcbr] = useState("0");
  const [compteReglement, setCompteReglement] = useState("");
  const [note, setNote] = useState("");
  const [validite, setValidite] = useState<Validite>("jour");
  /** Modalité d'une souscription au primaire. Null hors souscription. */
  const [modalite, setModalite] = useState<ModaliteSouscription>("adjudication");

  // ── Volets réméré et prêt ───────────────────────────────────────────────
  //
  // MTP UNIQUEMENT. Un réméré se noue de gré à gré sur un titre public, et un
  // prêt de titres porte sur le même gisement : les proposer sur un ordre de
  // bourse n'aurait pas de sens.
  //
  // Les deux s'excluent : un même ordre ne peut pas être à la fois une cession
  // temporaire et un prêt.
  const [onglet, setOnglet] = useState<Onglet>("operations");
  /** Réméré que l'opération en cours de saisie vient dénouer, ou null.
   *  Ne se choisit pas : il vient du bouton « Dénouer » de l'onglet Rémérés. */
  const [denoueRemereDe, setDenoueRemereDe] = useState<string | null>(null);
  /** Onglet où revenir une fois la correction enregistrée ou abandonnée. */
  const [retour, setRetour] = useState<Onglet>("operations");
  const [volets, setVolets] = useState<EtatVolets>(VOLETS_VIDES);
  // `ChampTaux` garde son propre texte et ne se resynchronise pas tout seul :
  // on le remonte en changeant la clé du volet quand on charge une autre
  // opération, sinon le taux affiché resterait celui de la précédente.
  const [cleVolets, setCleVolets] = useState(0);

  const remere: SaisieRemere | null = volets.estRemere ? volets.remere : null;
  const pret: SaisiePret | null = volets.estPret ? volets.pret : null;

  const reinitialiserVolets = (e: EtatVolets = VOLETS_VIDES) => {
    setVolets(e);
    setCleVolets((k) => k + 1);
  };
  /** Opération en cours de modification, ou null pour une création. */
  const [editionId, setEditionId] = useState<string | null>(null);
  /** Ordre dont la ligne d'exécution est dépliée. Un seul à la fois : deux
   *  formulaires ouverts sur deux ordres inviteraient à se tromper de ligne. */
  const [executionOuverte, setExecutionOuverte] = useState<string | null>(null);
  /** Opérations cochées, par identifiant. */
  const [selection, setSelection] = useState<Set<string>>(new Set());
  /** La suppression de masse est irréversible : elle se demande deux fois.
   *  Un `confirm()` du navigateur aurait fait le même office, mais il sort de
   *  l'écran et se clique sans lire. */
  const [confirmation, setConfirmation] = useState(false);

  const marche = marcheDe(description);
  /** Une syndication se décrit à la main : ni liste, ni caractéristiques
   *  reprises d'un référentiel qui ne la connaît pas. */
  const syndication = marche === "primaire" && modalite === "syndication";

  // ── Choix du titre ───────────────────────────────────────────────────────
  const [etats] = useState<Etat[]>(etatsInitiaux);
  const [pays, setPays] = useState(etatsInitiaux[0]?.code ?? "");
  const [titres, setTitres] = useState<OptionTitre[]>(titresInitiaux);
  const [titreCle, setTitreCle] = useState("");
  const [titresEtat, setTitresEtat] = useState<"chargement" | "pret">("pret");
  // Texte tape dans le champ de recherche du titre. Le `datalist` filtre
  // dessus ; la selection se resout en comparant ce texte au libelle complet
  // de chaque option.
  const [saisieTitre, setSaisieTitre] = useState("");

  // Intérêts courus : calculés d'après les caractéristiques du titre, et
  // MULTIPLIÉS par la quantité. Le gérant peut forcer la valeur — un avis
  // d'opéré fait foi contre un calcul — et l'écran dit alors qu'elle est
  // forcée plutôt que de laisser croire qu'elle a été calculée.
  const [couruParTitre, setCouruParTitre] = useState(0);
  const [couruAvertissement, setCouruAvertissement] = useState<string | null>(null);
  // Le DÉTAIL du calcul, affiché sous le champ. Un couru qu'on ne peut pas
  // recouper avec l'avis d'opéré ne vaut pas mieux qu'une saisie à la main :
  // on montre donc le taux, le dernier détachement et le nombre de jours.
  const [couruDetail, setCouruDetail] = useState<{
    taux: number;
    dernierDetachement: string;
    jours: number;
  } | null>(null);
  const [couruManuel, setCouruManuel] = useState<string | null>(null);

  // ── Comptes de règlement du fonds choisi ────────────────────────────────
  const [comptes, setComptes] = useState<Compte[]>(comptesInitiaux);
  const [comptesEtat, setComptesEtat] = useState<"chargement" | "pret" | "erreur">("pret");
  const [comptesErreur, setComptesErreur] = useState<string | null>(null);

  const n = (v: string) => {
    const x = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(x) ? x : 0;
  };

  const couruCalcule = couruParTitre * n(quantite);
  const interetsCourus = couruManuel !== null ? n(couruManuel) : couruCalcule;

  const changerFonds = (id: string) => {
    setFondsId(id);
    setCompteReglement("");
    // LE CESSIBLE DÉPEND DU FONDS. Sur une vente, changer de portefeuille
    // change la liste des titres : garder celle d'avant aurait proposé les
    // titres d'un fonds pour en vendre d'un autre.
    if (sensDe(description) === "vente" && marche !== "primaire") {
      oublierTitre();
      chargerTitres(marche, pays, true, id);
    }
    setComptesEtat("chargement");
    setComptesErreur(null);
    demarrer(async () => {
      const res = await comptesReglementAction(id);
      if (res.ok) {
        setComptes(res.data);
        setComptesEtat("pret");
      } else {
        setComptes([]);
        setComptesEtat("erreur");
        setComptesErreur(res.error);
      }
    });
  };

  /** Vide ce qui décrit le titre : changer de marché ou d'État invalide le
   *  titre choisi, et garder son ISIN ou ses courus serait pire que rien. */
  const oublierTitre = () => {
    setSaisieTitre("");
    setTitreCle("");
    setCode("");
    setLibelle("");
    setCouruParTitre(0);
    setCouruAvertissement(null);
    setCouruDetail(null);
    setCouruManuel(null);
  };

  /**
   * Charge les titres proposables.
   *
   * POUR UNE VENTE, LA LISTE SE RESTREINT AU CESSIBLE du fonds : on ne propose
   * pas ce qu'on ne peut pas vendre. Le sens et le fonds se passent en
   * paramètre plutôt que d'être lus dans l'état — `changerDescription` et
   * `changerFonds` appellent cette fonction AVANT que React n'ait appliqué
   * leur propre `setState`, et lire l'état y aurait donné la valeur d'avant.
   */
  const chargerTitres = (
    m: "mfr" | "mtp" | "primaire",
    p: string,
    vente: boolean,
    fonds: string,
  ) => {
    setTitresEtat("chargement");
    demarrer(async () => {
      const res = await listerTitresAction(
        m,
        p,
        vente && fonds ? { fundId: fonds, exclureOperationId: editionId } : undefined,
      );
      setTitres(res.ok ? res.data.titres : []);
      setTitresEtat("pret");
    });
  };

  // Changer de type d'opération repositionne le marché, l'instrument ET les
  // taux sur ce qui est usuel : les titres publics ne supportent pas de
  // courtage, les actions oui. Le gérant reste libre de corriger.
  const changerDescription = (d: DescriptionOperation) => {
    setDescription(d);
    const m = marcheDe(d);
    const suggere = DESCRIPTIONS.find((x) => x.valeur === d)?.instrumentSuggere ?? "mtp";
    setInstrument(suggere);
    const actions = suggere === "actions";
    setTauxCourtage(actions ? String(TAUX_ACTIONS.courtage) : "0");
    setTauxTps(actions ? String(TAUX_ACTIONS.tps) : "0");
    // Les commissions de place viennent des PARAMETRES, et ne s'appliquent
    // qu'au marche financier : les titres publics n'en supportent aucune.
    setTauxBrvm(actions ? String(parametres.tauxBrvm) : "0");
    setTauxDcbr(actions ? String(parametres.tauxDcbr) : "0");
    oublierTitre();
    // L'intermédiaire change de nature avec le marché — une SGI d'un côté,
    // une banque teneur de compte de l'autre. Garder celui d'avant laisserait
    // une SGI sur une opération MTP, ce que rien ne rattraperait ensuite.
    setSgi("");
    // Les volets sont propres au MTP. En passant au marché financier on les
    // DÉCROCHE, sinon un réméré resterait attaché à un ordre de bourse sans
    // que le formulaire n'en montre plus rien.
    if (m !== "mtp") reinitialiserVolets();
    // Un prêt ne se noue que sur une VENTE MTP. Passer à l'achat doit donc
    // décrocher la case, sinon elle resterait cochée sans plus rien afficher.
    else if (d !== "VENTE_MTP") setVolets((v) => (v.estPret ? { ...v, estPret: false } : v));
    if (m === "mfr" || m === "mtp") chargerTitres(m, pays, sensDe(d) === "vente", fondsId);
    // Au primaire, seule l'adjudication a une liste ; la syndication se décrit.
    else if (m === "primaire" && modalite === "adjudication")
      chargerTitres("primaire", "", false, fondsId);
    else setTitres([]);
  };

  /** Changer de modalité invalide le titre : on ne passe pas d'une
   *  adjudication du calendrier à un titre décrit à la main sans repartir de
   *  zéro. */
  const changerModalite = (m: ModaliteSouscription) => {
    setModalite(m);
    oublierTitre();
    // L'intermédiaire change de nature avec la modalité — une banque du fonds
    // au guichet, une SGI au placement. Garder celui d'avant laisserait une
    // SGI sur une adjudication, ce que rien ne rattraperait ensuite.
    setSgi("");
    if (m === "adjudication") chargerTitres("primaire", "", false, fondsId);
    else setTitres([]);
  };

  const changerPays = (p: string) => {
    setPays(p);
    oublierTitre();
    chargerTitres("mtp", p, sensDe(description) === "vente", fondsId);
  };

  const choisirTitre = (cle: string) => {
    setTitreCle(cle);
    if (!cle) {
      oublierTitre();
      return;
    }
    const opt = titres.find((t) => t.cle === cle);
    if (opt) {
      setSaisieTitre(libelleOption(opt));
      setCode(opt.isin || opt.cle);
      setLibelle(opt.libelle);
      // L'instrument découle du titre : une action ne peut pas être saisie
      // comme obligation, et l'inverse fausserait le délai de dénouement.
      setInstrument(opt.instrument);
    }
    setCouruManuel(null);

    // UNE ADJUDICATION N'A PAS ENCORE DE TITRE. Le sien naîtra de
    // l'adjudication : ni ISIN, ni taux facial, ni dernier détachement, donc
    // aucun couru à calculer — on souscrit au pair, à la date de valeur.
    // Interroger le référentiel n'aurait ramené qu'un « titre introuvable »
    // parfaitement exact et parfaitement inutile.
    if (marche === "primaire") {
      setCouruParTitre(0);
      setCouruDetail(null);
      setCouruAvertissement(null);
      return;
    }

    demarrer(async () => {
      const res = await caracteristiquesTitreAction(
        marche === "mtp" ? "mtp" : "mfr",
        cle,
        pays,
        dateOperation,
      );
      if (res.ok) {
        setCouruParTitre(res.data.couruParTitre);
        setCouruAvertissement(res.data.avertissement);
        setCouruDetail({
          taux: res.data.tauxCoupon,
          dernierDetachement: res.data.dernierDetachement,
          jours: res.data.joursCourus,
        });
        if (res.data.isin) setCode(res.data.isin);
      } else {
        setCouruParTitre(0);
        setCouruDetail(null);
        setCouruAvertissement(res.error);
      }
    });
  };

  // Les courus dépendent de la date : la changer les recalcule sur le titre
  // déjà choisi, au lieu de laisser à l'écran une valeur devenue fausse.
  const changerDate = (d: string) => {
    setDateOperation(d);
    if (!titreCle) return;
    demarrer(async () => {
      const res = await caracteristiquesTitreAction(
        marche === "mtp" ? "mtp" : "mfr",
        titreCle,
        pays,
        d,
      );
      if (res.ok) {
        setCouruParTitre(res.data.couruParTitre);
        setCouruAvertissement(res.data.avertissement);
        setCouruDetail({
          taux: res.data.tauxCoupon,
          dernierDetachement: res.data.dernierDetachement,
          jours: res.data.joursCourus,
        });
      }
    });
  };


  const montant = useMemo(
    () =>
      montantOperation({
        description,
        quantite: Number(quantite.replace(/\s/g, "").replace(",", ".")) || 0,
        prix: Number(prix.replace(/\s/g, "").replace(",", ".")) || 0,
        tauxCourtage: Number(tauxCourtage.replace(",", ".")) || 0,
        tauxTps: Number(tauxTps.replace(",", ".")) || 0,
        tauxBrvm: Number(tauxBrvm.replace(",", ".")) || 0,
        tauxDcbr: Number(tauxDcbr.replace(",", ".")) || 0,
        interetsCourus,
      }),
    [description, quantite, prix, tauxCourtage, tauxTps, tauxBrvm, tauxDcbr, interetsCourus],
  );

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
        description,
        instrument,
        code,
        libelle,
        quantite: n(quantite),
        validite,
        prix: n(prix),
        sgi: sgiNom,
        tauxCourtage: n(tauxCourtage),
        tauxTps: n(tauxTps),
        tauxBrvm: n(tauxBrvm),
        tauxDcbr: n(tauxDcbr),
        interetsCourus,
        compteReglement,
        note,
        modalite: description === "SOUSCRIPTION_MP" ? modalite : null,
        remere,
        pret,
        denoueRemereDe,
      };
      const res = editionId
        ? await modifierOperationMarcheAction(fondsId, editionId, saisie)
        : await enregistrerOperationMarcheAction(fondsId, saisie);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setOk(true);
      if (editionId) {
        // Après une correction, on referme : rester dans le formulaire
        // laisserait croire qu'une seconde validation créerait un doublon.
        annulerEdition();
      } else {
        // Le fonds, la date et le type RESTENT : on saisit un bordereau, pas
        // une opération isolée, et les lignes qui se suivent partagent
        // l'essentiel.
        setQuantite("");
        setPrix("");
        setNote("");
        setDenoueRemereDe(null);
        reinitialiserVolets();
        oublierTitre();
      }
      router.refresh();
    });
  };

  /** Recharge une opération dans le formulaire pour la corriger. */
  const modifier = (o: OperationAvecFonds) => {
    setErreur(null);
    setOk(false);
    setEditionId(o.id);
    setFondsId(o.fondsId);
    setDateOperation(o.dateOperation);
    setDescription(o.description);
    setInstrument(o.instrument);
    setCode(o.code);
    setLibelle(o.libelle);
    // LE TITRE D'UN ORDRE NE SE RECHERCHE PAS À LA MODIFICATION.
    //
    // On affichait son libellé dans le champ de recherche, où il ne
    // correspondait à aucune suggestion — celles-ci portent le symbole en
    // tête — d'où le « Aucun titre ne correspond » sur BANK OF AFRICA BN.
    //
    // Le champ est désormais VERROUILLÉ en modification, ce qui est de toute
    // façon la bonne règle : des exécutions peuvent déjà référencer cet ordre,
    // et changer son titre réécrirait leur histoire en silence.
    setSaisieTitre(`${o.code ? `${o.code} — ` : ""}${o.libelle}`);
    setTitreCle(o.code || o.libelle);
    setQuantite(String(o.quantite));
    setValidite(o.validite);
    setPrix(String(o.prix));
    setSgi(o.sgi);
    setTauxCourtage(String(o.tauxCourtage));
    setTauxTps(String(o.tauxTps));
    setTauxBrvm(String(o.tauxBrvm));
    setTauxDcbr(String(o.tauxDcbr));
    // Les courus repris tels quels : ceux de l'opération font foi, pas un
    // recalcul qui pourrait diverger de l'avis d'opéré déjà reçu.
    setCouruManuel(String(Math.round(o.interetsCourus)));
    setCompteReglement(o.compteReglement);
    setNote(o.note);
    setDenoueRemereDe(o.denoueRemereDe);
    reinitialiserVolets({
      estRemere: o.remere !== null,
      estPret: o.pret !== null,
      remere: o.remere ?? VOLETS_VIDES.remere,
      pret: o.pret ?? VOLETS_VIDES.pret,
    });
    // Le formulaire vit dans son propre onglet : corriger depuis la liste — ou
    // depuis un récapitulatif — doit y amener, sinon le clic n'aurait l'air de
    // rien faire. On note d'où l'on vient pour y revenir une fois corrigé.
    setRetour(onglet === "saisie" ? "operations" : onglet);
    setOnglet("saisie");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * Ouvre l'opération qui DÉNOUE un réméré.
   *
   * Ce n'est pas un bouton d'état : dénouer, c'est passer une vraie opération
   * MTP de sens inverse — on rachète ce qu'on a vendu à réméré. Le formulaire
   * s'ouvre donc prérempli du même titre, de la même quantité et du compte de
   * règlement du réméré, au PRIX DE SORTIE qui avait été convenu. Le gérant
   * n'a plus qu'à confirmer la date, puis à l'exécuter.
   *
   * Le réméré devient dénoué à ce moment-là seulement — pas à la saisie, qui
   * ne règle rien — et sa date de dénouement est celle de l'exécution.
   */
  const denouer = (o: OperationAvecFonds) => {
    if (!o.remere) return;
    setErreur(null);
    setOk(false);
    setEditionId(null);
    setDenoueRemereDe(o.id);
    setFondsId(o.fondsId);
    setDateOperation(new Date().toISOString().slice(0, 10));
    setDescription(descriptionDenouement(o.description));
    setInstrument(o.instrument);
    setCode(o.code);
    setLibelle(o.libelle);
    setSaisieTitre(`${o.code ? `${o.code} — ` : ""}${o.libelle}`);
    setTitreCle(o.code || o.libelle);
    setQuantite(String(o.quantite));
    setValidite(o.validite);
    // Le prix de SORTIE, pas celui d'entrée : c'est ce qui a été convenu au
    // dénouement, et c'est lui qui fait le montant du poste Rémérés.
    setPrix(String(o.remere.prixSortie));
    setSgi(o.sgi);
    setTauxCourtage(String(o.tauxCourtage));
    setTauxTps(String(o.tauxTps));
    setTauxBrvm(String(o.tauxBrvm));
    setTauxDcbr(String(o.tauxDcbr));
    setCouruManuel(String(Math.round(o.interetsCourus)));
    setCompteReglement(o.compteReglement);
    setNote(`Dénouement du réméré du ${o.dateOperation}`);
    reinitialiserVolets();
    setRetour("remeres");
    setOnglet("saisie");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const annulerEdition = () => {
    setEditionId(null);
    setQuantite("");
    setPrix("");
    setNote("");
    setCouruManuel(null);
    setDenoueRemereDe(null);
    reinitialiserVolets();
    oublierTitre();
    setOnglet(retour);
  };

  const executer = (
    o: OperationAvecFonds,
    saisie: { dateExecution: string; dateDenouement: string; quantite: number },
  ) => {
    setErreur(null);
    demarrer(async () => {
      const res = await ajouterExecutionAction(o.fondsId, o.id, saisie);
      if (!res.ok) setErreur(res.error);
      else {
        setExecutionOuverte(null);
        router.refresh();
      }
    });
  };

  const retirerExecution = (o: OperationAvecFonds, executionId: string) => {
    setErreur(null);
    demarrer(async () => {
      const res = await supprimerExecutionAction(o.fondsId, executionId);
      if (!res.ok) setErreur(res.error);
      else router.refresh();
    });
  };

  const cloturer = (o: OperationAvecFonds, date: string | null) => {
    setErreur(null);
    demarrer(async () => {
      const res = await cloturerOrdreAction(o.fondsId, o.id, date);
      if (!res.ok) setErreur(res.error);
      else router.refresh();
    });
  };

  /** Pose — ou retire — la date de reprise d'un prêt. Le statut suit. */
  const reprendre = (o: OperationAvecFonds, date: string | null) => {
    setErreur(null);
    demarrer(async () => {
      const res = await reprendrePretAction(o.fondsId, o.id, date);
      if (!res.ok) setErreur(res.error);
      else router.refresh();
    });
  };

  const rapprocher = (o: OperationAvecFonds, executionId: string, date: string | null) => {
    setErreur(null);
    demarrer(async () => {
      const res = await rapprocherExecutionAction(o.fondsId, executionId, date);
      if (!res.ok) setErreur(res.error);
      else router.refresh();
    });
  };

  /** Rapproche l'ORDRE : au primaire, le règlement précède l'exécution. */
  const rapprocherOrdre = (o: OperationAvecFonds, date: string | null) => {
    setErreur(null);
    demarrer(async () => {
      const res = await rapprocherOperationAction(o.fondsId, o.id, date);
      if (!res.ok) setErreur(res.error);
      else router.refresh();
    });
  };

  const supprimer = (op: OperationAvecFonds) => {
    demarrer(async () => {
      const res = await supprimerOperationMarcheAction(op.fondsId, op.id);
      if (!res.ok) setErreur(res.error);
      else router.refresh();
    });
  };

  // ── Sélection multiple ─────────────────────────────────────────────────
  //
  // Une séance produit des dizaines de lignes, et une fausse manœuvre en
  // produit autant. Les reprendre une à une était la corvée qui fait qu'on
  // laisse traîner des lignes fausses.
  //
  // La sélection se garde par IDENTIFIANT, jamais par rang : la liste se
  // réordonne à chaque rafraîchissement, et une sélection par position aurait
  // fini par désigner une autre opération que celle cochée.
  const basculerSelection = (id: string) =>
    setSelection((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const toutSelectionner = () =>
    setSelection((s) =>
      s.size === operations.length ? new Set() : new Set(operations.map((o) => o.id)),
    );

  const supprimerSelection = () => {
    setErreur(null);
    const cibles = operations
      .filter((o) => selection.has(o.id))
      .map((o) => ({ fondsId: o.fondsId, id: o.id }));
    if (cibles.length === 0) return;
    demarrer(async () => {
      const res = await supprimerOperationsMarcheAction(cibles);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      // Le compte vient du SERVEUR, pas de la liste envoyée : une ligne que la
      // base a refusée ne doit pas être annoncée comme supprimée.
      if (res.data.refus.length > 0) setErreur(res.data.refus.join(" · "));
      setSelection(new Set());
      setConfirmation(false);
      router.refresh();
    });
  };

  if (fonds.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-600">
        Aucun fonds géré : crée un fonds avant de saisir des opérations de marché.
      </div>
    );
  }

  const instrumentsAdmis = INSTRUMENTS_ADMIS[marche];

  // L'INTERMÉDIAIRE DÉPEND DU MARCHÉ.
  //
  // MFR : une SGI, qui porte l'ordre en bourse — d'où les taux de courtage.
  // MTP : un BTCC, la banque teneur de compte conservateur, qui est une
  // BANQUE DU FONDS. On la prend donc dans les comptes de trésorerie plutôt
  // que de la saisir une seconde fois ailleurs : deux saisies du même
  // établissement finissent toujours par diverger. Le mobile money est
  // exclu — un opérateur de monnaie électronique ne tient pas de
  // compte-titres.
  //
  // DÉDUPLIQUÉ PAR NOM. Un BTCC est un ÉTABLISSEMENT, pas un compte : la même
  // banque tient souvent plusieurs comptes du fonds, parfois dans deux pays,
  // et chacun est une colonne du point de trésorerie. Les lister tels quels
  // proposait deux fois « Wave » et faisait doublon de clef React.
  const btcc = [
    ...new Map(
      comptes
        .filter((c) => c.groupe !== "Mobile Money")
        .map((c) => [c.nom, c] as const),
    ).values(),
  ];
  /**
   * PAR QUI L'OPÉRATION PASSE, et c'est la nature de l'opération qui le dit.
   *
   *  MTP             — une banque teneur de compte du fonds.
   *  ADJUDICATION    — une banque du fonds également : au primaire, c'est elle
   *                    qui soumissionne auprès de l'Agence UMOA-Titres. Une
   *                    SGI n'a pas accès au guichet.
   *  SYNDICATION     — une SGI partenaire : le placement est de gré à gré, et
   *                    c'est le chef de file qui le distribue.
   *  MFR             — une SGI, seule habilitée à négocier en bourse.
   */
  const parBanque = marche === "mtp" || (marche === "primaire" && !syndication);

  const intermediaires: { cle: string; libelle: string }[] = parBanque
    ? btcc.map((c) => ({ cle: c.nom, libelle: c.nom }))
    : sgi.map((p) => ({
        cle: p.nom,
        libelle: `${p.nom} · courtage ${(p.tauxCourtage * 100)
          .toFixed(2)
          .replace(".", ",")} %`,
      }));

  /**
   * Choisir une SGI applique SES taux NÉGOCIÉS : courtage et TPS. C'est la
   * raison d'être de la fiche partenaire.
   *
   * La commission BRVM / DC-BR n'en fait pas partie : c'est un tarif de
   * place, identique quelle que soit la SGI. Elle reste donc celle que
   * l'instrument a posée — l'écraser avec une valeur recopiée sur une fiche
   * partenaire laisserait croire qu'elle se négocie.
   *
   * Un BTCC ne porte aucun taux : le marché des titres publics ne supporte
   * pas de courtage.
   */
  const choisirIntermediaire = (nom: string) => {
    setSgi(nom);
    if (parBanque) return;
    const p = sgi.find((x) => x.nom === nom);
    if (!p) return;
    setTauxCourtage(String(p.tauxCourtage));
    setTauxTps(String(p.tauxTps));
  };

  // LA LISTE SUIT L'INSTRUMENT, SANS EXCEPTION.
  //
  // Chaque option porte sa nature : `titresMfr()` étiquette les actions
  // « actions » et les cotées « obligations », `titresMtp()` étiquette tout en
  // « mtp ». Filtrer sur l'instrument choisi garantit donc qu'aucune option
  // d'une autre nature ne peut s'afficher — un FCTC, qui est une obligation
  // cotée, ne peut pas apparaître sous « Instruments du marché monétaire ».
  //
  // Le filtre ne portait d'abord QUE sur le MFR, en supposant que la liste
  // chargée correspondait toujours au marché courant. Cette supposition est
  // fausse : `titres` garde le contenu du chargement précédent le temps que le
  // suivant arrive, et un changement de marché laisse donc, pendant un instant
  // ou après un aller-retour, des options qui n'ont rien à y faire. Le filtre
  // s'applique maintenant à tous les marchés, ce qui rend le cas impossible
  // plutôt qu'improbable.
  // Au primaire, la liste est déjà celle des adjudications ouvertes : la
  // filtrer par instrument n'aurait rien à quoi se raccrocher, le titre
  // n'existant pas encore.
  const titresAffiches =
    marche === "primaire" ? titres : titres.filter((t) => t.instrument === instrument);

  /**
   * Ce que le gérant tape se résout en titre par comparaison au libellé
   * complet de l'option — c'est la valeur que le navigateur recopie dans le
   * champ quand on choisit une suggestion.
   *
   * Tant que le texte ne correspond à AUCUNE option, le titre est considéré
   * comme non choisi : laisser en place l'ISIN et les courus du titre
   * précédent pendant que le champ affiche autre chose serait le pire des
   * deux mondes.
   */
  const saisirTitre = (texte: string) => {
    setSaisieTitre(texte);
    const trouve = titresAffiches.find((t) => libelleOption(t) === texte);
    if (trouve) {
      choisirTitre(trouve.cle);
      return;
    }
    if (titreCle) {
      setTitreCle("");
      setCode("");
      setLibelle("");
      setCouruParTitre(0);
      setCouruAvertissement(null);
      setCouruDetail(null);
      setCouruManuel(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Opérations de marché</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Achats et ventes, tous fonds confondus. Pour l&apos;instant, elles
          alimentent le <strong>point de trésorerie</strong> du fonds concerné — et
          rien d&apos;autre.
        </p>
      </div>

      {/* ── Onglets ──────────────────────────────────────────────────────── */}
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {ONGLETS.map((t) => {
          // Le décompte dit tout de suite si l'onglet a quelque chose à
          // montrer : sans lui, on y va pour rien.
          const n =
            t.cle === "primaire"
              ? operations.filter((o) => o.description === "SOUSCRIPTION_MP").length
              : t.cle === "remeres"
              ? operations.filter(remereNoue).length
              : t.cle === "prets"
                ? operations.filter((o) => o.pret).length
                : t.cle === "operations"
                  ? operations.length
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
              {t.cle !== "saisie" && t.cle !== "importation" && (
                <span className="ml-1.5 text-[10px] text-slate-400">{n}</span>
              )}
            </button>
          );
        })}
      </nav>

      {onglet === "importation" && (
        <ImportOperationsMarche
          fonds={fonds}
          fondsId={fondsId}
          onChangerFonds={changerFonds}
          sgi={sgi}
          parametres={parametres}
        />
      )}

      {onglet === "primaire" && (
        <RecapPrimaire
          operations={operations}
          onModifier={modifier}
          onRapprocher={rapprocherOrdre}
        />
      )}

      {onglet === "remeres" && (
        <RecapRemeres
          operations={operations}
          onModifier={modifier}
          onDenouer={denouer}
        />
      )}
      {onglet === "prets" && (
        <RecapPrets
          operations={operations}
          onModifier={modifier}
          onReprendre={reprendre}
        />
      )}

      {/* ── Formulaire ───────────────────────────────────────────────────── */}
      <div className={`bg-white border border-slate-200 rounded-lg p-4 ${onglet === "saisie" ? "" : "hidden"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {editionId ? "Modifier l'opération" : "Saisir une opération"}
          </h2>
          {editionId && (
            <span className="text-[11px] text-slate-500">
              Fonds, nature, instrument et titre sont figés — des exécutions
              peuvent déjà s&apos;y référer.
            </span>
          )}
          {editionId && (
            <button
              type="button"
              onClick={annulerEdition}
              className="text-[11px] text-slate-500 hover:text-slate-900"
            >
              Abandonner la modification
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Elle alimente le poste «&nbsp;{posteEngage(description) ?? posteRealise(description)}&nbsp;» du point de
          trésorerie, sur le compte de règlement choisi, à sa date de dénouement.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <Champ label="Fonds">
            <select
              value={fondsId}
              onChange={(e) => changerFonds(e.target.value)}
              disabled={editionId !== null}
              className={`${champ} disabled:bg-slate-50 disabled:text-slate-600`}
            >
              {fonds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </Champ>

          <Champ label="Date d'opération">
            <input
              type="date"
              value={dateOperation}
              onChange={(e) => changerDate(e.target.value)}
              className={champ}
            />
          </Champ>

          <Champ label="Type d'opération">
            <select
              value={description}
              onChange={(e) => changerDescription(e.target.value as DescriptionOperation)}
              disabled={editionId !== null}
              className={`${champ} disabled:bg-slate-50 disabled:text-slate-600`}
            >
              {DESCRIPTIONS.map((d) => (
                <option key={d.valeur} value={d.valeur}>
                  {d.libelle}
                </option>
              ))}
            </select>
          </Champ>

          <Champ label="Instrument">
            <select
              value={instrument}
              onChange={(e) => {
                setInstrument(e.target.value as Instrument);
                // Le titre choisi n'est plus dans la liste : le garder
                // laisserait à l'écran un ISIN et des courus qui ne
                // correspondent plus à la nature sélectionnée.
                oublierTitre();
              }}
              className={champ}
            >
              {instrumentsAdmis.map((i) => (
                <option key={i} value={i}>
                  {LIBELLES_INSTRUMENT[i]}
                </option>
              ))}
            </select>
            <span className={aide}>
              {marche === "mfr"
                ? "MFR : actions et obligations cotées"
                : "MTP : OAT et BAT"}
            </span>
          </Champ>

          {/* La validité appartient à l'ORDRE, pas à ses exécutions : c'est
              elle qui dit combien de temps il reste au carnet, donc combien de
              temps sa part non servie pèse sur la trésorerie.
              Le marché des titres publics l'ignore — une adjudication est
              servie ou ne l'est pas. */}
          {marche === "mfr" && (
            <Champ label="Validité de l'ordre">
              <select
                value={validite}
                onChange={(e) => setValidite(e.target.value as Validite)}
                className={champ}
              >
                {(Object.keys(LIBELLES_VALIDITE) as Validite[]).map((k) => (
                  <option key={k} value={k}>
                    {LIBELLES_VALIDITE[k]}
                  </option>
                ))}
              </select>
              <span className={aide}>
                Pèse jusqu&apos;au {dateLimiteOrdre({ dateOperation, validite, description })}
              </span>
            </Champ>
          )}

          {/* MTP : l'État d'abord, puis ses titres. */}
          {marche === "mtp" && (
            <Champ label="État émetteur">
              <select
                value={pays}
                onChange={(e) => changerPays(e.target.value)}
                className={champ}
              >
                {etats.map((e) => (
                  <option key={e.code} value={e.code}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </Champ>
          )}

          {/* LA MODALITÉ D'UNE SOUSCRIPTION décide de tout ce qui suit : au
              calendrier pour une adjudication, à la main pour une
              syndication. */}
          {marche === "primaire" && (
            <Champ label="Modalité" large>
              <select
                value={modalite}
                onChange={(e) => changerModalite(e.target.value as ModaliteSouscription)}
                disabled={editionId !== null}
                className={`${champ} disabled:bg-slate-50 disabled:text-slate-600`}
              >
                {(Object.keys(LIBELLES_MODALITE) as ModaliteSouscription[]).map((k) => (
                  <option key={k} value={k}>
                    {LIBELLES_MODALITE[k]}
                  </option>
                ))}
              </select>
              <span className={aide}>
                {modalite === "adjudication"
                  ? "L'émission se choisit au calendrier UMOA-Titres."
                  : "Le titre n'est à aucun calendrier : décris-le."}
              </span>
            </Champ>
          )}

          {/* SYNDICATION : rien à choisir, le titre se décrit. Une émission
              placée de gré à gré ne figure à aucun référentiel, et l'attendre
              aurait rendu la saisie impossible. */}
          {marche === "primaire" && modalite === "syndication" && (
            <Champ label="Titre souscrit" large>
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="Ex. Obligation TPCI 6,25 % 2026-2033"
                className={champ}
              />
              <span className={aide}>Le nom sous lequel l&apos;émission est placée</span>
            </Champ>
          )}

          {/* MFR, MTP et adjudication : le titre se choisit dans une liste. */}
          {(marche === "mfr" ||
            marche === "mtp" ||
            (marche === "primaire" && modalite === "adjudication")) && (
            <Champ
              label={
                marche === "primaire"
                  ? "Adjudication"
                  : marche === "mtp"
                    ? "Titre public"
                    : instrument === "actions"
                      ? "Action"
                      : "Obligation cotée"
              }
              large
            >
              {/* UN CHAMP DE RECHERCHE, PAS UN MENU.
                  Un `select` de cent soixante-dix titres publics ne se
                  parcourt pas : il faut pouvoir taper « SONATEL » ou une
                  fraction d'ISIN. Le `datalist` filtre sur le libellé complet
                  — nom, type, coupon, échéance — donc la recherche porte
                  aussi bien sur la maturité que sur le nom. */}
              <input
                value={saisieTitre}
                onChange={(e) => saisirTitre(e.target.value)}
                list={`titres-${marche}-${instrument}`}
                readOnly={editionId !== null}
                disabled={titresEtat === "chargement"}
                placeholder={
                  titresEtat === "chargement"
                    ? "Chargement des titres…"
                    : `Taper pour chercher parmi ${titresAffiches.length} titres…`
                }
                className={`${champ} disabled:bg-slate-50 disabled:text-slate-400`}
              />
              <datalist id={`titres-${marche}-${instrument}`}>
                {titresAffiches.map((t) => (
                  <option key={t.cle} value={libelleOption(t)} />
                ))}
              </datalist>
              <span className={aide}>
                {editionId !== null ? (
                  <span className="text-slate-500">
                    Le titre d&apos;un ordre ne se change pas : des exécutions
                    peuvent déjà s&apos;y référer.
                  </span>
                ) : titreCle ? (
                  <span className="text-emerald-700">Titre reconnu · {titreCle}</span>
                ) : saisieTitre ? (
                  <span className="text-amber-700">
                    Aucun titre ne correspond — choisis une suggestion.
                  </span>
                ) : (
                  "Le symbole, le nom, l'ISIN ou l'échéance"
                )}
              </span>
            </Champ>
          )}

          <Champ label="Code / ISIN">
            {/* NON MODIFIABLE DÈS QU'IL VIENT DU RÉFÉRENTIEL.
                Le corriger à la main revenait à saisir une opération sur un
                titre dont les caractéristiques — taux facial, échéance,
                courus — sont celles d'un AUTRE titre. Pour changer d'ISIN, on
                change de titre.
                Le réméré échappe à la règle : il n'a pas de référentiel d'où
                tirer un code, donc le verrouiller le rendrait impossible à
                renseigner. */}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              readOnly={!syndication}
              tabIndex={syndication ? undefined : -1}
              placeholder={syndication ? "ISIN, s'il est déjà attribué" : ""}
              className={
                syndication ? champ : `${champ} bg-slate-50 text-slate-600 cursor-default`
              }
            />
            <span className={aide}>
              {syndication
                ? "Saisi à la main : une syndication n'est à aucun référentiel."
                : "Repris du titre choisi."}
            </span>
          </Champ>


          <Champ label={parBanque ? "BTCC" : "SGI"}>
            <select
              value={sgiNom}
              onChange={(e) => choisirIntermediaire(e.target.value)}
              className={champ}
            >
              <option value="">— Choisir —</option>
              {intermediaires.map((i) => (
                <option key={i.cle} value={i.cle}>
                  {i.libelle}
                </option>
              ))}
              {/* Une valeur héritée hors liste reste lisible : une opération
                  ancienne ne doit pas perdre son intermédiaire parce que le
                  partenaire a été retiré depuis. */}
              {sgiNom && !intermediaires.some((i) => i.cle === sgiNom) && (
                <option value={sgiNom}>{sgiNom} (hors liste)</option>
              )}
            </select>
            <span className={aide}>
              {parBanque
                ? marche === "primaire"
                  ? "C'est elle qui soumissionne au guichet UMOA-Titres"
                  : "Banque teneur de compte, prise dans les comptes du fonds"
                : intermediaires.length === 0
                  ? "Aucune SGI — ajoute-la dans Paramètres › Partenaires"
                  : syndication
                    ? "Le chef de file qui place l'émission. Ses taux se reportent ci-dessous."
                    : "Ses taux négociés se reportent ci-dessous"}
            </span>
          </Champ>

          <Champ label="Quantité">
            <ChampMontant
              valeur={quantite}
              onChange={setQuantite}
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>


          <Champ label="Prix unitaire">
            <ChampMontant
              valeur={prix}
              onChange={setPrix}
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>

          <Champ label="Intérêts courus">
            <ChampMontant
              valeur={couruManuel ?? String(Math.round(couruCalcule))}
              onChange={setCouruManuel}
              className={`${champ} text-right tabular-nums ${
                couruManuel === null ? "bg-slate-50" : ""
              }`}
            />
            <span className={aide}>
              {couruManuel !== null ? (
                <>
                  forcé ·{" "}
                  <button
                    type="button"
                    onClick={() => setCouruManuel(null)}
                    className="underline hover:text-slate-600"
                  >
                    revenir au calcul
                  </button>
                </>
              ) : couruParTitre > 0 ? (
                <>
                  <span className="text-emerald-700">
                    {montantFr(couruParTitre)} F par titre
                  </span>
                  {/* Sans quantité, le total vaut zéro : le dire, plutôt que
                      de laisser croire que le calcul n'a pas eu lieu. */}
                  {n(quantite) > 0 ? (
                    ` × ${fmt0.format(n(quantite))}`
                  ) : (
                    <span className="text-amber-700"> · saisis la quantité</span>
                  )}
                </>
              ) : titreCle ? (
                "aucun couru sur ce titre"
              ) : (
                "calculé d'après le titre choisi"
              )}
            </span>
            {couruDetail && couruParTitre > 0 && (
              <span className={aide}>
                coupon {(couruDetail.taux * 100).toFixed(2).replace(".", ",")} % · dernier
                détachement {couruDetail.dernierDetachement} · {couruDetail.jours} j
              </span>
            )}
          </Champ>

          <Champ label="Compte de règlement" large>
            <select
              value={compteReglement}
              onChange={(e) => setCompteReglement(e.target.value)}
              disabled={comptesEtat !== "pret"}
              className={`${champ} disabled:bg-slate-50 disabled:text-slate-400`}
            >
              <option value="">
                {comptesEtat === "chargement"
                  ? "Chargement des comptes…"
                  : comptesEtat === "erreur"
                    ? "Comptes indisponibles"
                    : "— Choisir —"}
              </option>
              {comptes.map((c) => (
                <option key={c.cle} value={c.cle}>
                  {c.nom}
                  {c.pays ? ` · ${c.pays}` : ""}
                  {c.sens ? ` · ${c.sens}` : ""}
                </option>
              ))}
            </select>
            {comptesErreur && (
              <span className="text-[9px] text-amber-700">{comptesErreur}</span>
            )}
          </Champ>

          <Champ label="Taux de courtage">
            <input
              value={tauxCourtage}
              onChange={(e) => setTauxCourtage(e.target.value)}
              inputMode="decimal"
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>

          <Champ label="Taux TPS">
            <input
              value={tauxTps}
              onChange={(e) => setTauxTps(e.target.value)}
              inputMode="decimal"
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>

          <Champ label="Commission BRVM">
            <input
              value={tauxBrvm}
              onChange={(e) => setTauxBrvm(e.target.value)}
              inputMode="decimal"
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>

          <Champ label="Commission DC/BR">
            <input
              value={tauxDcbr}
              onChange={(e) => setTauxDcbr(e.target.value)}
              inputMode="decimal"
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>

          {/* Réméré et prêt de titres ALLONGENT l'ordre, ils n'en font pas un
              autre : mêmes titre, quantité et prix, plus les quelques champs
              propres à la cession temporaire. Réservé au MTP. */}
          {marche === "mtp" && (
            <VoletsMtp
              key={cleVolets}
              etat={volets}
              onChange={setVolets}
              quantite={n(quantite)}
              prixOrdre={n(prix)}
              interetsCourus={interetsCourus}
              dateOperation={dateOperation}
              sens={sensRemereDe(description)}
              pretPossible={description === "VENTE_MTP"}
              contreparties={contrepartiesRemere}
              verrouille={denoueRemereDe !== null}
            />
          )}

          <Champ label="Note" large>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={champ} />
          </Champ>
        </div>

        {couruAvertissement && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-3">
            {couruAvertissement}
          </p>
        )}

        {/* Le montant se calcule sous les yeux du gérant : c'est là qu'une
            erreur de taux ou de quantité se voit, pas après enregistrement. */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-200">
          <div className="text-xs text-slate-600">
            Montant{" "}
            <span className="font-semibold tabular-nums text-slate-900">
              {montantFr(montant)} F
            </span>
            <span className="text-[10px] text-slate-400 ml-2">
              {fmt0.format(n(quantite))} × {fmt0.format(n(prix))}
              {n(tauxCourtage) + n(tauxBrvm) + n(tauxDcbr) > 0 &&
                ` ${sensDe(description) === "achat" ? "+" : "−"} frais`}
              {interetsCourus !== 0 && ` + ${montantFr(interetsCourus)} de courus`}
            </span>
          </div>
          <button
            onClick={enregistrer}
            disabled={enCours}
            className="px-4 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
          >
            {enCours
              ? "Enregistrement…"
              : editionId
                ? "Enregistrer la correction"
                : "Enregistrer l'opération"}
          </button>
        </div>

        {erreur && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-3">
            {erreur}
          </p>
        )}
        {ok && !erreur && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 mt-3">
            Opération enregistrée. Le point de trésorerie du fonds la prend en compte à
            sa date de dénouement.
          </p>
        )}
      </div>

      {/* ── Liste ────────────────────────────────────────────────────────── */}
      {/* MASQUÉS, PAS DÉMONTÉS. Le formulaire et les lignes d'exécution
          portent leur saisie en cours : les démonter en changeant d'onglet
          jetterait un bordereau à moitié tapé, et le `ChampTaux` de chaque
          volet reviendrait à sa valeur d'origine. Les récapitulatifs, eux,
          n'ont rien à perdre et se montent à la demande. */}
      <div
        className={`border border-slate-200 rounded-lg overflow-hidden bg-white ${
          onglet === "operations" ? "" : "hidden"
        }`}
      >
        {/* ── Ce qui est sélectionné, et ce qu'on peut en faire ──────────
            La barre n'apparaît QUE s'il y a une sélection : une barre d'outils
            permanente et vide n'apprend rien et vole une ligne à l'écran. */}
        {selection.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-blue-50 border-b border-blue-200">
            <span className="text-[11px] text-blue-900">
              <strong>{selection.size}</strong> opération
              {selection.size > 1 ? "s" : ""} sélectionnée
              {selection.size > 1 ? "s" : ""}
              <button
                type="button"
                onClick={() => {
                  setSelection(new Set());
                  setConfirmation(false);
                }}
                className="ml-3 text-blue-700 hover:text-blue-900 underline"
              >
                tout décocher
              </button>
            </span>
            <div className="flex items-center gap-2">
              {confirmation ? (
                <>
                  <span className="text-[11px] text-rose-800">
                    Supprimer définitivement ? Les exécutions suivent.
                  </span>
                  <button
                    type="button"
                    onClick={supprimerSelection}
                    disabled={enCours}
                    className="text-[11px] font-medium px-3 py-1.5 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {enCours ? "Suppression…" : "Confirmer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmation(false)}
                    disabled={enCours}
                    className="text-[11px] text-slate-600 hover:text-slate-900 disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmation(true)}
                  disabled={enCours}
                  className="text-[11px] font-medium px-3 py-1.5 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Supprimer la sélection
                </button>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={
                      operations.length > 0 && selection.size === operations.length
                    }
                    ref={(el) => {
                      // L'ÉTAT INTERMÉDIAIRE : ni tout ni rien. Sans lui, une
                      // sélection partielle affiche une case vide, et le clic
                      // suivant coche tout au lieu de décocher.
                      if (el)
                        el.indeterminate =
                          selection.size > 0 && selection.size < operations.length;
                    }}
                    onChange={toutSelectionner}
                    disabled={operations.length === 0}
                    aria-label="Tout sélectionner"
                  />
                </th>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-left px-3 py-2 font-medium">Fonds</th>
                <th className="text-left px-3 py-2 font-medium">Nature</th>
                <th className="text-left px-3 py-2 font-medium">Titre</th>
                <th className="text-right px-3 py-2 font-medium">Ordonnée</th>
                <th className="text-right px-3 py-2 font-medium">Servie</th>
                <th className="text-left px-3 py-2 font-medium">État</th>
                <th className="text-right px-3 py-2 font-medium">Montant</th>
                <th className="text-left px-3 py-2 font-medium">Règlement</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {operations.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-slate-400">
                    Aucune opération saisie.
                  </td>
                </tr>
              )}
              {operations.map((o) => {
                const servie = quantiteExecutee(o);
                const reste = quantiteRestante(o);
                const etat = etatOrdre(o);
                const ouvert = executionOuverte === o.id;
                return (
                  <LigneOrdre
                    key={o.id}
                    o={o}
                    servie={servie}
                    reste={reste}
                    etat={etat}
                    ouvert={ouvert}
                    enCours={enCours}
                    parametres={parametres}
                    onBasculer={() => setExecutionOuverte(ouvert ? null : o.id)}
                    onModifier={() => modifier(o)}
                    onSupprimer={() => supprimer(o)}
                    onExecuter={(saisie) => executer(o, saisie)}
                    onSupprimerExecution={(id) => retirerExecution(o, id)}
                    onCloturer={(date) => cloturer(o, date)}
                    onRapprocher={(id, date) => rapprocher(o, id, date)}
                    onRapprocherOrdre={(date) => rapprocherOrdre(o, date)}
                    selectionnee={selection.has(o.id)}
                    onSelectionner={() => basculerSelection(o.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

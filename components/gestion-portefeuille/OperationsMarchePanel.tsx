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
  enregistrerOperationMarcheAction,
  listerTitresAction,
  modifierOperationMarcheAction,
  supprimerOperationMarcheAction,
} from "@/app/gestion-portefeuille/operations-marche-actions";
import {
  DESCRIPTIONS,
  INSTRUMENTS_ADMIS,
  LIBELLES_INSTRUMENT,
  LIBELLES_STATUT,
  LIBELLES_VALIDITE,
  dateDenouement,
  dateLimiteOrdre,
  estOrdreValide,
  marcheDe,
  montantOperation,
  posteDe,
  sensDe,
  quantiteRestante,
  type DescriptionOperation,
  type Instrument,
  type StatutOperation,
  type Validite,
} from "@/app/gestion-portefeuille/operations-marche-types";
import type { OperationAvecFonds } from "@/app/gestion-portefeuille/operations-marche-data";
import type { OptionTitre } from "@/app/gestion-portefeuille/operations-marche-titres";
import type { Partenaire } from "@/app/gestion-portefeuille/partenaires-types";
import {
  LIBELLES_BASE,
  conventionDe,
  type ParametresMarche,
} from "@/app/gestion-portefeuille/parametres-marche-types";

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
  const [description, setDescription] =
    useState<DescriptionOperation>("ACHATS_MTP_REALISES");
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
  const [quantiteExecutee, setQuantiteExecutee] = useState("0");
  const [validite, setValidite] = useState<Validite>("jour");
  const [statut, setStatut] = useState<StatutOperation>("en_cours");
  /** Opération en cours de modification, ou null pour une création. */
  const [editionId, setEditionId] = useState<string | null>(null);
  // Le dénouement est CALCULÉ mais reste modifiable : un règlement peut
  // déraper, et la liste des jours fériés s'arrête à début 2027.
  const [denouementManuel, setDenouementManuel] = useState<string | null>(null);

  const marche = marcheDe(description);

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

  const chargerTitres = (m: "mfr" | "mtp", p: string) => {
    setTitresEtat("chargement");
    demarrer(async () => {
      const res = await listerTitresAction(m, p);
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
    setDenouementManuel(null);
    oublierTitre();
    // L'intermédiaire change de nature avec le marché — une SGI d'un côté,
    // une banque teneur de compte de l'autre. Garder celui d'avant laisserait
    // une SGI sur une opération MTP, ce que rien ne rattraperait ensuite.
    setSgi("");
    if (m === "mfr" || m === "mtp") chargerTitres(m, pays);
    else setTitres([]);
  };

  const changerPays = (p: string) => {
    setPays(p);
    oublierTitre();
    chargerTitres("mtp", p);
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
      setDenouementManuel(null);
    }
    setCouruManuel(null);
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
    setDenouementManuel(null);
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

  const convention = conventionDe(parametres, instrument);
  const denouementCalcule = useMemo(
    () => dateDenouement(dateOperation, conventionDe(parametres, instrument)),
    [dateOperation, instrument, parametres],
  );
  const denouement = denouementManuel ?? denouementCalcule;

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
        dateDenouement: denouement,
        description,
        instrument,
        code,
        libelle,
        quantite: n(quantite),
        quantiteExecutee: n(quantiteExecutee),
        validite,
        prix: n(prix),
        sgi: sgiNom,
        tauxCourtage: n(tauxCourtage),
        tauxTps: n(tauxTps),
        tauxBrvm: n(tauxBrvm),
        tauxDcbr: n(tauxDcbr),
        interetsCourus,
        compteReglement,
        statut,
        note,
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
        setQuantiteExecutee("0");
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
    setDenouementManuel(o.dateDenouement);
    setDescription(o.description);
    setInstrument(o.instrument);
    setCode(o.code);
    setLibelle(o.libelle);
    setSaisieTitre(o.libelle);
    setTitreCle("");
    setQuantite(String(o.quantite));
    setQuantiteExecutee(String(o.quantiteExecutee));
    setValidite(o.validite);
    setStatut(o.statut);
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
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const annulerEdition = () => {
    setEditionId(null);
    setQuantite("");
    setPrix("");
    setNote("");
    setQuantiteExecutee("0");
    setStatut("en_cours");
    setCouruManuel(null);
    oublierTitre();
  };

  const supprimer = (op: OperationAvecFonds) => {
    demarrer(async () => {
      const res = await supprimerOperationMarcheAction(op.fondsId, op.id);
      if (!res.ok) setErreur(res.error);
      else router.refresh();
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
  const intermediaires: { cle: string; libelle: string }[] =
    marche === "mtp"
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
    if (marche === "mtp") return;
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
  const titresAffiches = titres.filter((t) => t.instrument === instrument);

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

      {/* ── Formulaire ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {editionId ? "Modifier l'opération" : "Saisir une opération"}
          </h2>
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
          Elle alimente le poste «&nbsp;{posteDe(description)}&nbsp;» du point de
          trésorerie, sur le compte de règlement choisi, à sa date de dénouement.
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
              className={champ}
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
                setDenouementManuel(null);
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
                : marche === "mtp"
                  ? "MTP : OAT, OTAR et BAT"
                  : "Hors marché coté"}
            </span>
          </Champ>

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

          {/* MFR et MTP : le titre se choisit dans le référentiel. */}
          {(marche === "mfr" || marche === "mtp") && (
            <Champ
              label={
                marche === "mtp"
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
                {titreCle ? (
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
              readOnly={marche !== "autre"}
              tabIndex={marche !== "autre" ? -1 : undefined}
              className={`${champ} ${
                marche !== "autre" ? "bg-slate-50 text-slate-600 cursor-default" : ""
              }`}
            />
            <span className={aide}>
              {marche !== "autre" ? "Repris du titre choisi." : "Saisie libre."}
            </span>
          </Champ>

          {marche === "autre" && (
            <Champ label="Titre" large>
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                className={champ}
              />
            </Champ>
          )}

          <Champ label="Dénouement">
            <input
              type="date"
              value={denouement}
              onChange={(e) => setDenouementManuel(e.target.value)}
              className={champ}
            />
            <span className={aide}>
              J+{convention.jours} {LIBELLES_BASE[convention.base]}
              {denouementManuel && denouementManuel !== denouementCalcule && " · forcé"}
            </span>
          </Champ>

          <Champ label={marche === "mtp" ? "BTCC" : "SGI"}>
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
              {marche === "mtp"
                ? "Banque teneur de compte, prise dans les comptes du fonds"
                : intermediaires.length === 0
                  ? "Aucune SGI — ajoute-la dans Paramètres › Partenaires"
                  : "Ses taux négociés se reportent ci-dessous"}
            </span>
          </Champ>

          <Champ label="Quantité">
            <input
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              inputMode="numeric"
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>

          {/* CYCLE DE VIE — n'a de sens que sur un ordre VALIDÉ.
              Un achat déjà réalisé ou une vente n'ont rien à exécuter, et
              afficher ces champs sur eux inviterait à les remplir. */}
          {estOrdreValide(description) && (
            <>
              <Champ label="Quantité exécutée">
                <input
                  value={quantiteExecutee}
                  onChange={(e) => setQuantiteExecutee(e.target.value)}
                  inputMode="numeric"
                  className={`${champ} text-right tabular-nums`}
                />
                <span className={aide}>
                  {marche === "mtp"
                    ? "Servi en totalité ou pas du tout"
                    : `Reste ${fmt0.format(
                        Math.max(0, n(quantite) - n(quantiteExecutee)),
                      )} à servir`}
                </span>
              </Champ>

              <Champ label="Statut">
                <select
                  value={statut}
                  onChange={(e) => setStatut(e.target.value as StatutOperation)}
                  className={champ}
                >
                  {(Object.keys(LIBELLES_STATUT) as StatutOperation[]).map((k) => (
                    <option key={k} value={k}>
                      {LIBELLES_STATUT[k]}
                    </option>
                  ))}
                </select>
                <span className={aide}>
                  Un ordre annulé ne pèse plus sur la trésorerie
                </span>
              </Champ>

              {/* La validité ne concerne que le marché financier : une
                  adjudication de titres publics est servie ou ne l'est pas. */}
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
                    Sort du point après le{" "}
                    {dateLimiteOrdre({ dateOperation, validite })}
                  </span>
                </Champ>
              )}
            </>
          )}

          <Champ label="Prix unitaire">
            <input
              value={prix}
              onChange={(e) => setPrix(e.target.value)}
              inputMode="numeric"
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>

          <Champ label="Intérêts courus">
            <input
              value={couruManuel ?? String(Math.round(couruCalcule))}
              onChange={(e) => setCouruManuel(e.target.value)}
              inputMode="numeric"
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
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-left px-3 py-2 font-medium">Dénouement</th>
                <th className="text-left px-3 py-2 font-medium">Fonds</th>
                <th className="text-left px-3 py-2 font-medium">Poste</th>
                <th className="text-left px-3 py-2 font-medium">Titre</th>
                <th className="text-right px-3 py-2 font-medium">Quantité</th>
                <th className="text-right px-3 py-2 font-medium">Servie</th>
                <th className="text-left px-3 py-2 font-medium">État</th>
                <th className="text-right px-3 py-2 font-medium">Prix</th>
                <th className="text-right px-3 py-2 font-medium">Courus</th>
                <th className="text-right px-3 py-2 font-medium">Montant</th>
                <th className="text-left px-3 py-2 font-medium">Règlement</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {operations.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-6 text-center text-slate-400">
                    Aucune opération saisie.
                  </td>
                </tr>
              )}
              {operations.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                    {o.dateOperation}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                    {o.dateDenouement}
                  </td>
                  <td className="px-3 py-1.5">{o.fondsNom}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{posteDe(o.description)}</td>
                  <td className="px-3 py-1.5">
                    {o.libelle || o.code || "—"}
                    {o.code && o.libelle && (
                      <span className="text-slate-400 ml-1">({o.code})</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmt0.format(o.quantite)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {estOrdreValide(o.description) ? (
                      o.quantiteExecutee > 0 ? (
                        <>
                          {fmt0.format(o.quantiteExecutee)}
                          {quantiteRestante(o) > 0 && (
                            <span className="block text-[9px] text-amber-700">
                              reste {fmt0.format(quantiteRestante(o))}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )
                    ) : (
                      <span className="text-slate-300">s.o.</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span
                      className={
                        o.statut === "annule"
                          ? "text-slate-400 line-through"
                          : o.statut === "realise"
                            ? "text-emerald-700"
                            : "text-slate-700"
                      }
                    >
                      {LIBELLES_STATUT[o.statut]}
                    </span>
                    {/* La date de péremption d'un ordre encore vivant : c'est
                        elle qui décide de sa sortie du point de trésorerie. */}
                    {estOrdreValide(o.description) &&
                      o.statut === "en_cours" &&
                      o.instrument !== "mtp" && (
                        <span className="block text-[9px] text-slate-400">
                          jusqu&apos;au {dateLimiteOrdre(o)}
                        </span>
                      )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmt0.format(o.prix)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                    {o.interetsCourus ? montantFr(o.interetsCourus) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    {montantFr(o.montant)}
                  </td>
                  <td className="px-3 py-1.5 text-slate-600">{o.compteReglement}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => modifier(o)}
                      disabled={enCours}
                      className="text-[10px] text-blue-700 hover:text-blue-900 disabled:opacity-50 mr-3"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => supprimer(o)}
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
    </div>
  );
}

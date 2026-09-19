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
  supprimerOperationMarcheAction,
} from "@/app/gestion-portefeuille/operations-marche-actions";
import {
  DESCRIPTIONS,
  INSTRUMENTS_ADMIS,
  LIBELLES_INSTRUMENT,
  dateDenouement,
  marcheDe,
  montantOperation,
  posteDe,
  sensDe,
  type DescriptionOperation,
  type Instrument,
} from "@/app/gestion-portefeuille/operations-marche-types";
import type { OperationAvecFonds } from "@/app/gestion-portefeuille/operations-marche-data";
import type { OptionTitre } from "@/app/gestion-portefeuille/operations-marche-titres";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";
const aide = "text-[9px] text-slate-400";

/** Taux usuels d'une négociation d'actions à la BRVM, repris du classeur :
 *  0,4 % de courtage, 10 % de TPS SUR CE COURTAGE, 0,3 % BRVM/DC-BR.
 *  Les titres publics n'en supportent aucun. */
const TAUX_ACTIONS = { courtage: 0.004, tps: 0.1, brvm: 0.003 };

/** Libellé complet d'une option — c'est CE TEXTE que le navigateur recopie
 *  dans le champ quand on choisit une suggestion du `datalist`, et donc la
 *  clef de résolution au retour. */
const libelleOption = (t: OptionTitre) => `${t.libelle} · ${t.detail}`;

type Compte = { cle: string; nom: string; pays: string; sens: string };
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
  const [sgi, setSgi] = useState("");
  const [tauxCourtage, setTauxCourtage] = useState("0");
  const [tauxTps, setTauxTps] = useState("0");
  const [tauxBrvm, setTauxBrvm] = useState("0");
  const [compteReglement, setCompteReglement] = useState("");
  const [note, setNote] = useState("");
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
    setTauxBrvm(actions ? String(TAUX_ACTIONS.brvm) : "0");
    setDenouementManuel(null);
    oublierTitre();
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

  const denouementCalcule = useMemo(
    () => dateDenouement(dateOperation, instrument),
    [dateOperation, instrument],
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
        interetsCourus,
      }),
    [description, quantite, prix, tauxCourtage, tauxTps, tauxBrvm, interetsCourus],
  );

  const enregistrer = () => {
    setErreur(null);
    setOk(false);
    if (!fondsId) {
      setErreur("Choisis le fonds concerné.");
      return;
    }
    demarrer(async () => {
      const res = await enregistrerOperationMarcheAction(fondsId, {
        dateOperation,
        dateDenouement: denouement,
        description,
        instrument,
        code,
        libelle,
        quantite: n(quantite),
        prix: n(prix),
        sgi,
        tauxCourtage: n(tauxCourtage),
        tauxTps: n(tauxTps),
        tauxBrvm: n(tauxBrvm),
        interetsCourus,
        compteReglement,
        statut: "ok",
        note,
      });
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setOk(true);
      // Le fonds, la date et le type RESTENT : on saisit un bordereau, pas une
      // opération isolée, et les lignes qui se suivent partagent l'essentiel.
      setQuantite("");
      setPrix("");
      setNote("");
      oublierTitre();
      router.refresh();
    });
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
        <h2 className="text-sm font-semibold text-slate-900">Saisir une opération</h2>
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
                  "Le nom, le code ou l'échéance"
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
              {instrument === "actions" ? "J+2 ouvrés" : "J+0"}
              {denouementManuel && denouementManuel !== denouementCalcule && " · forcé"}
            </span>
          </Champ>

          <Champ label="SGI / BTCC">
            <input value={sgi} onChange={(e) => setSgi(e.target.value)} className={champ} />
          </Champ>

          <Champ label="Quantité">
            <input
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              inputMode="numeric"
              className={`${champ} text-right tabular-nums`}
            />
          </Champ>

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

          <Champ label="Taux BRVM / DC-BR">
            <input
              value={tauxBrvm}
              onChange={(e) => setTauxBrvm(e.target.value)}
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
              {n(tauxCourtage) + n(tauxBrvm) > 0 &&
                ` ${sensDe(description) === "achat" ? "+" : "−"} frais`}
              {interetsCourus !== 0 && ` + ${montantFr(interetsCourus)} de courus`}
            </span>
          </div>
          <button
            onClick={enregistrer}
            disabled={enCours}
            className="px-4 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
          >
            {enCours ? "Enregistrement…" : "Enregistrer l'opération"}
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
                  <td colSpan={11} className="px-3 py-6 text-center text-slate-400">
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

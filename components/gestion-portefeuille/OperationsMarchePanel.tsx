"use client";

// === Opérations de marché — module interfonds ===
//
// Reprend la feuille « Opérations de marché » du classeur : une ligne par
// négociation, TOUS FONDS CONFONDUS, le fonds étant une colonne de la saisie.
// C'est l'ordre de travail du gérant — une même adjudication se répartit entre
// plusieurs portefeuilles, et changer d'écran entre deux lignes du même
// bordereau n'aurait pas de sens.
//
// Pour l'instant, ces opérations n'alimentent QUE le point de trésorerie.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  comptesReglementAction,
  enregistrerOperationMarcheAction,
  supprimerOperationMarcheAction,
} from "@/app/gestion-portefeuille/operations-marche-actions";
import {
  DESCRIPTIONS,
  LIBELLES_INSTRUMENT,
  dateDenouement,
  montantOperation,
  posteDe,
  sensDe,
  type DescriptionOperation,
  type Instrument,
} from "@/app/gestion-portefeuille/operations-marche-types";
import type { OperationAvecFonds } from "@/app/gestion-portefeuille/operations-marche-data";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";

/** Taux usuels d'une négociation d'actions à la BRVM, repris du classeur :
 *  0,4 % de courtage, 10 % de TPS SUR CE COURTAGE, 0,3 % BRVM/DC-BR.
 *  Les titres publics n'en supportent aucun. */
const TAUX_ACTIONS = { courtage: 0.004, tps: 0.1, brvm: 0.003 };

type Compte = { cle: string; nom: string; pays: string; sens: string };

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
}: {
  fonds: { id: string; nom: string }[];
  operations: OperationAvecFonds[];
  /** Comptes du PREMIER fonds, résolus au serveur. Les suivants se chargent
   *  au changement de fonds, c'est-à-dire sur un ÉVÉNEMENT et non dans un
   *  effet — le lint du projet interdit un setState dans un effet, et il a
   *  raison : ce serait un rendu en cascade pour une donnée qu'on sait
   *  produire au moment du clic. */
  comptesInitiaux: Compte[];
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
  const [interetsCourus, setInteretsCourus] = useState("0");
  const [compteReglement, setCompteReglement] = useState("");
  const [note, setNote] = useState("");
  // Le dénouement est CALCULÉ mais reste modifiable : un règlement peut
  // déraper, et la liste des jours fériés s'arrête à début 2027.
  const [denouementManuel, setDenouementManuel] = useState<string | null>(null);

  // Comptes de règlement du fonds choisi — les COLONNES de son point de
  // trésorerie. Ceux du premier fonds viennent du serveur ; les autres se
  // chargent au changement de fonds. Précharger ceux de TOUS les fonds ferait
  // autant de lectures d'inventaire pour n'en servir qu'une.
  const [comptes, setComptes] = useState<Compte[]>(comptesInitiaux);
  const [comptesEtat, setComptesEtat] = useState<"chargement" | "pret" | "erreur">("pret");
  const [comptesErreur, setComptesErreur] = useState<string | null>(null);

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

  const n = (v: string) => {
    const x = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(x) ? x : 0;
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
        interetsCourus: Number(interetsCourus.replace(/\s/g, "").replace(",", ".")) || 0,
      }),
    [description, quantite, prix, tauxCourtage, tauxTps, tauxBrvm, interetsCourus],
  );

  // Changer de type d'opération repositionne l'instrument ET les taux sur ce
  // qui est usuel pour ce marché : les titres publics ne supportent pas de
  // courtage, les actions oui. Le gérant reste libre de corriger.
  const changerDescription = (d: DescriptionOperation) => {
    setDescription(d);
    const suggere = DESCRIPTIONS.find((x) => x.valeur === d)?.instrumentSuggere ?? "mtp";
    setInstrument(suggere);
    const actions = suggere === "actions";
    setTauxCourtage(actions ? String(TAUX_ACTIONS.courtage) : "0");
    setTauxTps(actions ? String(TAUX_ACTIONS.tps) : "0");
    setTauxBrvm(actions ? String(TAUX_ACTIONS.brvm) : "0");
    setDenouementManuel(null);
  };

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
        interetsCourus: n(interetsCourus),
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
      setCode("");
      setLibelle("");
      setQuantite("");
      setPrix("");
      setInteretsCourus("0");
      setNote("");
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
              onChange={(e) => {
                setDateOperation(e.target.value);
                setDenouementManuel(null);
              }}
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
              }}
              className={champ}
            >
              {(Object.keys(LIBELLES_INSTRUMENT) as Instrument[]).map((i) => (
                <option key={i} value={i}>
                  {LIBELLES_INSTRUMENT[i]}
                </option>
              ))}
            </select>
          </Champ>

          <Champ label="Dénouement">
            <input
              type="date"
              value={denouement}
              onChange={(e) => setDenouementManuel(e.target.value)}
              className={champ}
            />
            <span className="text-[9px] text-slate-400">
              {instrument === "actions" ? "J+2 ouvrés" : "J+0"}
              {denouementManuel && denouementManuel !== denouementCalcule && " · forcé"}
            </span>
          </Champ>

          <Champ label="Code / ISIN">
            <input value={code} onChange={(e) => setCode(e.target.value)} className={champ} />
          </Champ>

          <Champ label="Titre" large>
            <input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              className={champ}
            />
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
              value={interetsCourus}
              onChange={(e) => setInteretsCourus(e.target.value)}
              inputMode="numeric"
              className={`${champ} text-right tabular-nums`}
            />
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
              {n(interetsCourus) !== 0 && " + courus"}
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
                <th className="text-right px-3 py-2 font-medium">Montant</th>
                <th className="text-left px-3 py-2 font-medium">Règlement</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {operations.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-slate-400">
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

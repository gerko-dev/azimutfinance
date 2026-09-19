"use client";

// === Opérations de marché ===
//
// Saisie des achats et ventes qui alimentent le point de trésorerie. Reprend
// la feuille « Opérations de marché » du classeur : une ligne par négociation,
// et le point les somme par poste, par compte de règlement et par dénouement.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
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
  type OperationMarche,
} from "@/app/gestion-portefeuille/operations-marche-types";
import type { PointTresorerie } from "@/app/gestion-portefeuille/tresorerie-types";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";

/** Taux usuels d'une négociation d'actions à la BRVM, repris du classeur :
 *  0,4 % de courtage, 10 % de TPS SUR CE COURTAGE, 0,3 % BRVM/DC-BR.
 *  Les titres publics n'en supportent aucun. */
const TAUX_ACTIONS = { courtage: 0.004, tps: 0.1, brvm: 0.003 };

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
  fondsId,
  point,
  operations,
}: {
  fondsId: string;
  point: PointTresorerie | null;
  operations: OperationMarche[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

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

  const comptes = point?.etablissements ?? [];

  const enregistrer = () => {
    setErreur(null);
    setOk(false);
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
      setCode("");
      setLibelle("");
      setQuantite("");
      setPrix("");
      setInteretsCourus("0");
      setNote("");
      router.refresh();
    });
  };

  const supprimer = (id: string) => {
    demarrer(async () => {
      const res = await supprimerOperationMarcheAction(fondsId, id);
      if (!res.ok) setErreur(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Formulaire ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-slate-900">Saisir une opération</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Elle alimente le poste «&nbsp;{posteDe(description)}&nbsp;» du point de
          trésorerie, sur le compte de règlement choisi, à sa date de dénouement.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
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

          <Champ label="Compte de règlement">
            <select
              value={compteReglement}
              onChange={(e) => setCompteReglement(e.target.value)}
              className={champ}
            >
              <option value="">— Choisir —</option>
              {comptes.map((c) => (
                <option key={c.cle} value={c.cle}>
                  {c.nom}
                  {c.pays ? ` · ${c.pays}` : ""}
                  {c.sens ? ` · ${c.sens}` : ""}
                </option>
              ))}
            </select>
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
            Opération enregistrée. Le point de trésorerie la prend en compte à sa date
            de dénouement.
          </p>
        )}
      </div>

      {/* ── Ce qui ne compte pas, et pourquoi ────────────────────────────── */}
      {point && point.operationsSansColonne.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-900">
            {point.operationsSansColonne.length} montant(s) sans colonne au point de
            trésorerie
          </p>
          <p className="text-[11px] text-amber-800 mt-1">
            Leur compte de règlement ne figure pas dans l&apos;inventaire de fin : le
            montant n&apos;entre dans aucune colonne et ne compte nulle part.
          </p>
          <ul className="text-[11px] text-amber-900 mt-2 space-y-0.5">
            {point.operationsSansColonne.map((o) => (
              <li key={`${o.libelle}-${o.compte}`} className="tabular-nums">
                {o.libelle} · {o.compte} — {montantFr(o.montant)} F
              </li>
            ))}
          </ul>
        </div>
      )}

      {point && point.operationsNonDenouees.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-slate-800">
            {point.operationsNonDenouees.length} opération(s) non dénouée(s) à
            l&apos;arrêté
          </p>
          <p className="text-[11px] text-slate-600 mt-1">
            Négociées, mais réglées après la date d&apos;arrêté : elles ne comptent pas
            encore dans le point de trésorerie.
          </p>
          <ul className="text-[11px] text-slate-700 mt-2 space-y-0.5">
            {point.operationsNonDenouees.map((o, i) => (
              <li key={i} className="tabular-nums">
                {o.dateDenouement} · {o.libelle} — {montantFr(o.montant)} F
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Liste ────────────────────────────────────────────────────────── */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-left px-3 py-2 font-medium">Dénouement</th>
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
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-400">
                    Aucune opération saisie pour ce fonds.
                  </td>
                </tr>
              )}
              {operations.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 tabular-nums">{o.dateOperation}</td>
                  <td className="px-3 py-1.5 tabular-nums">{o.dateDenouement}</td>
                  <td className="px-3 py-1.5">{posteDe(o.description)}</td>
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
                      onClick={() => supprimer(o.id)}
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

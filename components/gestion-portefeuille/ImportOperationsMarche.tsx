"use client";

// === Rapprochement d'un avis d'exécution ===
//
// Le dépositaire envoie une ligne par transaction élémentaire : 541 pour une
// séance de six titres. Regroupées par titre, prix et jour, elles font 37
// EXÉCUTIONS — et ces exécutions appartiennent à des ordres que le gérant a
// déjà saisis, qui attendent d'être servis.
//
// L'écran montre donc, ligne à ligne, À QUEL ORDRE chacune se rattache. Le
// rapprochement est proposé, jamais imposé : c'est une déduction sur un
// mnémonique et une date, et le gérant doit pouvoir la corriger avant qu'elle
// ne s'écrive.
//
// Ce qui ne trouve pas d'ordre en face reste en rouge, avec la raison. C'est
// presque toujours un ordre oublié à la saisie — et c'est une information
// utile, pas un échec d'import.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  previsualiserImportOperationsAction,
  rapprocherImportOperationsAction,
  type ApercuImport,
  type LigneImport,
  type OrdreOuvert,
} from "@/app/gestion-portefeuille/operations-marche-import-actions";
import type { Partenaire } from "@/app/gestion-portefeuille/partenaires-types";
import type { ParametresMarche } from "@/app/gestion-portefeuille/parametres-marche-types";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const montantFr = (v: number) => fmt0.format(Math.round(v));

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";

/** Identité d'une ligne. Le quadruplet du regroupement : deux lignes ne
 *  peuvent pas le partager, c'est précisément ce qui les a séparées. */
const cleLigne = (l: LigneImport) => `${l.symbole}|${l.date}|${l.sens}|${l.prix}`;

const maj = (s: string) => s.trim().toUpperCase();

/** Un ordre peut-il porter cette exécution ? Même sens, même titre, et passé
 *  avant elle. Les désignations ne se recoupent pas toujours : l'ordre peut
 *  avoir été saisi sous son ISIN quand le dépositaire ne connaît que le
 *  mnémonique, d'où les trois formes acceptées. */
function compatible(o: OrdreOuvert, l: LigneImport): boolean {
  if (o.sens !== l.sens || o.dateOperation > l.date) return false;
  const formes = new Set([maj(l.code), maj(l.libelle), maj(l.symbole)].filter(Boolean));
  return formes.has(maj(o.code)) || formes.has(maj(o.libelle));
}

export default function ImportOperationsMarche({
  fonds,
  fondsId,
  onChangerFonds,
  sgi,
  parametres,
}: {
  fonds: { id: string; nom: string }[];
  /** Fonds dont on rapproche les ordres — partagé avec le formulaire de
   *  saisie, pour qu'un seul choix vaille sur tout l'écran. */
  fondsId: string;
  onChangerFonds: (id: string) => void;
  sgi: Partenaire[];
  parametres: ParametresMarche;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  const [apercu, setApercu] = useState<ApercuImport | null>(null);
  /** Fonds sur lequel l'aperçu a été calculé. En changer rend le
   *  rapprochement caduc : les ordres ne sont plus les mêmes. */
  const [fondsApercu, setFondsApercu] = useState("");
  const [nomFichier, setNomFichier] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<{
    executions: number;
    doublons: number;
    ordresMisAJour: number;
    refus: string[];
  } | null>(null);

  /** Lignes écartées par le gérant. On mémorise l'exclusion plutôt que la
   *  sélection : à l'ouverture, tout ce qui est rapproché est retenu. */
  const [ecartees, setEcartees] = useState<Set<string>>(new Set());
  /** Rapprochements corrigés à la main, par clef de ligne. */
  const [choix, setChoix] = useState<Record<string, string>>({});

  const [sgiNom, setSgi] = useState("");
  const [tauxCourtage, setTauxCourtage] = useState("0");
  const [tauxTps, setTauxTps] = useState("0");
  const [tauxBrvm, setTauxBrvm] = useState(String(parametres.tauxBrvm));
  const [tauxDcbr, setTauxDcbr] = useState(String(parametres.tauxDcbr));
  const [appliquer, setAppliquer] = useState(true);

  const n = (v: string) => Number(v.replace(",", ".")) || 0;

  const choisirSgi = (nom: string) => {
    setSgi(nom);
    const p = sgi.find((x) => x.nom === nom);
    if (!p) return;
    // Le courtage et la TPS viennent de la FICHE de la SGI : ce sont ses
    // conditions, pas une constante de place.
    setTauxCourtage(String(p.tauxCourtage));
    setTauxTps(String(p.tauxTps));
  };

  const changerFonds = (id: string) => {
    onChangerFonds(id);
    // L'aperçu portait sur les ordres d'un autre portefeuille : le garder
    // afficherait des rapprochements qui n'existent plus.
    setApercu(null);
    setBilan(null);
  };

  const lire = (formData: FormData) => {
    setErreur(null);
    setBilan(null);
    const f = formData.get("fichier");
    setNomFichier(f instanceof File ? f.name : "");
    const cible = fondsId;
    demarrer(async () => {
      const res = await previsualiserImportOperationsAction(cible, formData);
      if (res.ok) {
        setApercu(res.data);
        setFondsApercu(cible);
        setEcartees(new Set());
        setChoix({});
      } else {
        setApercu(null);
        setErreur(res.error);
      }
    });
  };

  /** Ordre retenu pour une ligne : le choix du gérant s'il en a fait un, la
   *  proposition du serveur sinon. Une chaîne vide vaut « aucun ». */
  const ordreDe = (l: LigneImport): string => {
    const k = cleLigne(l);
    return k in choix ? choix[k] : (l.ordreId ?? "");
  };

  /**
   * Ce que l'écran retient, et pourquoi il écarte le reste.
   *
   * LE COMPTE SE FAIT EN UN SEUL PASSAGE, dans l'ordre du rapport : chaque
   * exécution entame le reste à servir de son ordre, et la suivante voit ce
   * reste diminué. Sans cela, treize lignes SONATEL sur un même ordre se
   * croiraient chacune seule et l'épuiseraient treize fois.
   */
  const etat = useMemo(() => {
    const restes = new Map((apercu?.ordres ?? []).map((o) => [o.id, o.restante]));
    const parLigne = new Map<string, { ordreId: string; trop: boolean }>();
    let rapprochees = 0;
    let dejaVues = 0;
    let orphelines = 0;

    for (const l of apercu?.lignes ?? []) {
      const k = cleLigne(l);
      if (l.deja) {
        dejaVues += 1;
        parLigne.set(k, { ordreId: ordreDe(l), trop: false });
        continue;
      }
      const id = ordreDe(l);
      if (!id) {
        orphelines += 1;
        parLigne.set(k, { ordreId: "", trop: false });
        continue;
      }
      if (ecartees.has(k)) {
        parLigne.set(k, { ordreId: id, trop: false });
        continue;
      }
      const reste = restes.get(id) ?? 0;
      const trop = l.quantite > reste;
      if (!trop) {
        restes.set(id, reste - l.quantite);
        rapprochees += 1;
      }
      parLigne.set(k, { ordreId: id, trop });
    }
    return { parLigne, rapprochees, dejaVues, orphelines };
    // `ordreDe` dépend de `choix`, qui est dans les dépendances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apercu, choix, ecartees]);

  /** Les affectations réellement envoyées. */
  const affectations = useMemo(() => {
    const out: {
      ordreId: string;
      date: string;
      quantite: number;
      prix: number;
      transactions: number;
    }[] = [];
    for (const l of apercu?.lignes ?? []) {
      const k = cleLigne(l);
      const e = etat.parLigne.get(k);
      if (!e || !e.ordreId || e.trop || l.deja || ecartees.has(k)) continue;
      out.push({
        ordreId: e.ordreId,
        date: l.date,
        quantite: l.quantite,
        prix: l.prix,
        transactions: l.transactions,
      });
    }
    return out;
  }, [apercu, etat, ecartees]);

  const totalRetenu = useMemo(
    () => affectations.reduce((s, a) => s + a.quantite * a.prix, 0),
    [affectations],
  );

  const basculer = (k: string) =>
    setEcartees((s) => {
      const suivant = new Set(s);
      if (suivant.has(k)) suivant.delete(k);
      else suivant.add(k);
      return suivant;
    });

  const rapprocher = () => {
    setErreur(null);
    setBilan(null);
    demarrer(async () => {
      const res = await rapprocherImportOperationsAction(fondsApercu, affectations, {
        sgi: sgiNom,
        tauxCourtage: n(tauxCourtage),
        tauxTps: n(tauxTps),
        tauxBrvm: n(tauxBrvm),
        tauxDcbr: n(tauxDcbr),
        appliquer,
      });
      if (res.ok) {
        setBilan(res.data);
        if (res.data.executions > 0) {
          // Ce qui est écrit ne doit plus pouvoir l'être d'un second clic.
          setApercu(null);
          router.refresh();
        }
      } else {
        setErreur(res.error);
      }
    });
  };

  const fondsChoisi = fonds.find((f) => f.id === fondsId);
  const fondsFichier = apercu?.fondsFichier ?? "";
  const ordresParId = useMemo(
    () => new Map((apercu?.ordres ?? []).map((o) => [o.id, o])),
    [apercu],
  );

  // CE QUI MANQUE ENCORE, NOMMÉ : un bouton grisé sans raison se lit comme une
  // panne. Ces deux-là n'entrent en jeu que si l'on reporte les conditions sur
  // les ordres — sinon, une exécution s'écrit très bien sans eux.
  const manquants = appliquer
    ? ([
        !sgiNom ? "la SGI" : null,
        n(tauxCourtage) <= 0 ? "le taux de courtage" : null,
      ].filter(Boolean) as string[])
    : [];

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Rapprocher un rapport d&apos;exécution
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Le rapport du dépositaire, une ligne par transaction. Les transactions
            du <strong>même titre, au même prix, le même jour</strong> forment une
            exécution, qui vient se poser sur l&apos;<strong>ordre déjà saisi</strong>{" "}
            qui l&apos;attend. Aucune opération n&apos;est créée.
          </p>
        </div>

        <form action={lire} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 min-w-[14rem]">
            <span className={etiquette}>Fonds</span>
            <select
              className={champ}
              value={fondsId}
              onChange={(e) => changerFonds(e.target.value)}
            >
              {fonds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
            <span className="text-[9px] text-slate-400">
              C&apos;est dans ses ordres ouverts que le rapprochement se cherche
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className={etiquette}>Fichier Excel</span>
            <input
              type="file"
              name="fichier"
              accept=".xlsx,.xls"
              required
              className="text-xs file:mr-2 file:text-xs file:border file:border-slate-300 file:rounded file:px-2 file:py-1 file:bg-slate-50"
            />
          </label>
          <button
            type="submit"
            disabled={enCours}
            className="text-xs font-medium px-3 py-1.5 rounded bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {enCours ? "Lecture…" : "Lire et rapprocher"}
          </button>
        </form>

        {erreur && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {erreur}
          </p>
        )}

        {bilan && (
          <div className="text-xs bg-emerald-50 border border-emerald-200 rounded px-3 py-2 space-y-1">
            <p className="text-emerald-900 font-medium">
              {bilan.executions} exécution{bilan.executions > 1 ? "s" : ""} enregistrée
              {bilan.executions > 1 ? "s" : ""} sur les ordres existants.
              {bilan.ordresMisAJour > 0 &&
                ` Conditions reportées sur ${bilan.ordresMisAJour} ordre${
                  bilan.ordresMisAJour > 1 ? "s" : ""
                }.`}
              {bilan.doublons > 0 &&
                ` ${bilan.doublons} déjà enregistrée${
                  bilan.doublons > 1 ? "s" : ""
                }, laissée${bilan.doublons > 1 ? "s" : ""} de côté.`}
            </p>
            {bilan.refus.length > 0 && (
              <ul className="list-disc pl-4 text-red-800 space-y-0.5">
                {bilan.refus.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {apercu && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Carte titre="Transactions lues" valeur={fmt0.format(apercu.transactionsLues)} />
            <Carte
              titre="Exécutions"
              valeur={fmt0.format(apercu.lignes.length)}
              aide={nomFichier}
            />
            <Carte titre="Rapprochées" valeur={fmt0.format(etat.rapprochees)} />
            <Carte
              titre="Sans ordre"
              valeur={fmt0.format(etat.orphelines)}
              alerte={etat.orphelines > 0}
            />
            <Carte titre="Montant brut" valeur={`${montantFr(totalRetenu)} F`} />
          </div>

          {(apercu.avertissements.length > 0 || etat.dejaVues > 0) && (
            <ul className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2 space-y-0.5 list-disc pl-6">
              {etat.dejaVues > 0 && (
                <li>
                  {etat.dejaVues} exécution{etat.dejaVues > 1 ? "s" : ""} figure
                  {etat.dejaVues > 1 ? "nt" : ""} déjà sur leur ordre : ce fichier a
                  déjà été rapproché, en tout ou partie.
                </li>
              )}
              {apercu.avertissements.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}

          {/* ── Les conditions, que l'ordre ne portait pas encore ────────── */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-900">
                  Conditions de l&apos;opération
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  À la saisie, le gérant connaît son intention ; il ne connaît pas
                  encore l&apos;intermédiaire retenu ni son courtage. Le rapport les
                  apporte — ils se reportent ici sur les ordres rapprochés.
                </p>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-700">
                <input
                  type="checkbox"
                  checked={appliquer}
                  onChange={(e) => setAppliquer(e.target.checked)}
                />
                Reporter sur les ordres rapprochés
              </label>
            </div>

            <div
              className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${
                appliquer ? "" : "opacity-40 pointer-events-none"
              }`}
            >
              <label className="flex flex-col gap-1">
                <span className={etiquette}>SGI</span>
                <select
                  className={champ}
                  value={sgiNom}
                  onChange={(e) => choisirSgi(e.target.value)}
                >
                  <option value="">— choisir —</option>
                  {sgi.map((p) => (
                    <option key={p.id} value={p.nom}>
                      {p.nom} · courtage {(p.tauxCourtage * 100).toFixed(2)} %
                    </option>
                  ))}
                </select>
                <span className="text-[9px] text-slate-400">
                  Son courtage et sa TPS se reportent au choix
                </span>
              </label>
              <Taux label="Courtage" valeur={tauxCourtage} onChange={setTauxCourtage} />
              <Taux label="TPS" valeur={tauxTps} onChange={setTauxTps} />
              <Taux label="BRVM" valeur={tauxBrvm} onChange={setTauxBrvm} />
              <Taux label="DC/BR" valeur={tauxDcbr} onChange={setTauxDcbr} />
              {fondsFichier && (
                <p className="text-[10px] text-slate-400 self-end">
                  Le fichier annonce «&nbsp;{fondsFichier}&nbsp;»
                  {fondsChoisi ? ` — rapproché dans « ${fondsChoisi.nom} »` : ""}
                </p>
              )}
            </div>
          </div>

          {/* ── Les exécutions, et l'ordre qui les reçoit ───────────────── */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-2 py-2 text-left font-medium">Date</th>
                    <th className="px-2 py-2 text-left font-medium">Titre</th>
                    <th className="px-2 py-2 text-left font-medium">Sens</th>
                    <th className="px-2 py-2 text-right font-medium">Quantité</th>
                    <th className="px-2 py-2 text-right font-medium">Prix servi</th>
                    <th className="px-2 py-2 text-right font-medium">Montant</th>
                    <th className="px-2 py-2 text-right font-medium">Tx</th>
                    <th className="px-2 py-2 text-left font-medium">Ordre rapproché</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apercu.lignes.map((l) => {
                    const k = cleLigne(l);
                    const e = etat.parLigne.get(k);
                    const id = e?.ordreId ?? "";
                    const retenue = !l.deja && !!id && !e?.trop && !ecartees.has(k);
                    const ordre = ordresParId.get(id);
                    const candidats = apercu.ordres.filter(
                      (o) => compatible(o, l) || o.id === id,
                    );

                    return (
                      <tr
                        key={k}
                        className={
                          l.deja
                            ? "bg-slate-50 text-slate-400"
                            : !id || e?.trop
                              ? "bg-red-50"
                              : retenue
                                ? ""
                                : "opacity-40"
                        }
                      >
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={retenue}
                            disabled={l.deja || !id || e?.trop}
                            onChange={() => basculer(k)}
                            title={
                              l.deja
                                ? "Exécution déjà enregistrée sur cet ordre"
                                : !id
                                  ? "Aucun ordre en face"
                                  : e?.trop
                                    ? "Dépasse le reste à servir de l'ordre"
                                    : "Retenir cette exécution"
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-slate-600">{l.date}</td>
                        <td className="px-2 py-1.5">
                          <span className="font-medium text-slate-900">{l.symbole}</span>
                          <span className="text-slate-400"> · {l.libelle}</span>
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className={
                              l.sens === "achat" ? "text-blue-800" : "text-amber-800"
                            }
                          >
                            {l.sens === "achat" ? "Achat MFR" : "Vente MFR"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {fmt0.format(l.quantite)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {fmt0.format(l.prix)}
                          {ordre && ordre.prix !== l.prix && (
                            <span
                              className="text-slate-400"
                              title={`Ordre à ${fmt0.format(ordre.prix)}`}
                            >
                              {" "}
                              ≠
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                          {montantFr(l.quantite * l.prix)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
                          {l.transactions}
                        </td>
                        <td className="px-2 py-1.5">
                          {l.deja ? (
                            <span className="text-[10px]">déjà rapprochée</span>
                          ) : (
                            <>
                              <select
                                className="w-full text-[11px] border border-slate-300 rounded px-1.5 py-1 focus:border-blue-400 focus:outline-none"
                                value={id}
                                onChange={(ev) =>
                                  setChoix((c) => ({ ...c, [k]: ev.target.value }))
                                }
                              >
                                <option value="">— aucun —</option>
                                {candidats.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.dateOperation} · {fmt0.format(o.quantite)} @{" "}
                                    {fmt0.format(o.prix)} · reste{" "}
                                    {fmt0.format(o.restante)}
                                  </option>
                                ))}
                              </select>
                              {!id && l.raison && (
                                <span className="text-[9px] text-red-700">{l.raison}</span>
                              )}
                              {e?.trop && (
                                <span className="text-[9px] text-red-700">
                                  dépasse ce que cet ordre peut encore servir
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              Chaque ligne retenue s&apos;ajoute comme <strong>exécution</strong> de
              son ordre, au prix réellement servi. L&apos;ordre passe de lui-même en
              partiellement servi ou réalisé.
              {manquants.length > 0 && (
                <span className="block text-amber-800 mt-0.5">
                  Avant de valider, renseigne {manquants.join(" et ")} — ou décoche le
                  report des conditions.
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={rapprocher}
              disabled={enCours || affectations.length === 0 || manquants.length > 0}
              className="text-xs font-medium px-4 py-2 rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-40"
            >
              {enCours
                ? "Rapprochement…"
                : `Rapprocher ${affectations.length} exécution${
                    affectations.length > 1 ? "s" : ""
                  }`}
            </button>
          </div>
        </>
      )}
    </div>
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
        alerte ? "bg-red-50 border-red-200" : "bg-white border-slate-200"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{titre}</div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          alerte ? "text-red-800" : "text-slate-900"
        }`}
      >
        {valeur}
      </div>
      {aide && <div className="text-[9px] text-slate-400 truncate">{aide}</div>}
    </div>
  );
}

/** Un taux se saisit en DÉCIMAL, comme partout ailleurs dans le module, et
 *  s'affiche en pourcentage à côté : 0,004 ne se lit pas, 0,40 % si. */
function Taux({
  label,
  valeur,
  onChange,
}: {
  label: string;
  valeur: string;
  onChange: (v: string) => void;
}) {
  const v = Number(valeur.replace(",", ".")) || 0;
  return (
    <label className="flex flex-col gap-1">
      <span className={etiquette}>{label}</span>
      <input
        className={champ}
        inputMode="decimal"
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-[9px] text-slate-400">{(v * 100).toFixed(3)} %</span>
    </label>
  );
}

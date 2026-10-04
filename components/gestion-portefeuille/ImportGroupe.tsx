"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { FichierImporte } from "@/app/gestion-portefeuille/import-groupe-data";
import type { PortfolioSlot } from "@/app/gestion-portefeuille/portfolio-types";
import {
  reclassifyFundPortfoliosAction,
  savePortfolioAction,
} from "@/app/gestion-portefeuille/portfolio-actions";
import { enregistrerPointsNavAction } from "@/app/gestion-portefeuille/nav-actions";

/**
 * Importer tout un arrêté d'un coup.
 *
 * TROIS TEMPS, ET LE DEUXIEME EST LE PLUS IMPORTANT. On dépose, on RELIT, on
 * enregistre. Quinze inventaires posés sans qu'on les ait vus passer ne sont
 * pas une automatisation : c'est une erreur qui se découvre au trimestre
 * suivant, quand une performance ne tombe plus juste.
 *
 * LE FICHIER DIT A QUI IL APPARTIENT. « Inventaire du FCP AURORE SECURITE II
 * au 3062026.xlsx » nomme son fonds et sa date ; on ne les redemande pas. Le
 * rattachement est affiché à chaque ligne, et il se corrige : c'est un nom de
 * fichier, pas une vérité.
 */

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

const SLOTS: { valeur: PortfolioSlot; libelle: string }[] = [
  { valeur: "debut", libelle: "Début" },
  { valeur: "intermediaire", libelle: "Intermédiaire" },
  { valeur: "fin", libelle: "Fin" },
];

type Etat = "attente" | "encours" | "fait" | "echec";

export default function ImportGroupe({
  fonds,
}: {
  fonds: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [lecture, setLecture] = useState<FichierImporte[] | null>(null);
  /**
   * UNE DATE PAR INVENTAIRE, pas une pour tout le lot.
   *
   * Un arrêté arrive le plus souvent d'un bloc, à la même date — mais pas
   * toujours : un fonds livre en retard, un autre est arrêté à un jour
   * différent, et une seule date pour quinze inventaires les y forçait tous.
   * Chaque ligne porte donc la sienne, déduite de son nom de fichier, et
   * modifiable. La date commune n'est plus qu'un RACCOURCI pour les remplir
   * d'un coup.
   */
  const [dates, setDates] = useState<Record<string, string>>({});
  const [dateCommune, setDateCommune] = useState("");
  const [slot, setSlot] = useState<PortfolioSlot>("fin");
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [avancement, setAvancement] = useState("");
  const [etats, setEtats] = useState<Record<string, { etat: Etat; detail: string }>>({});
  /** Rattachements corrigés à la main, par fichier. */
  const [corriges, setCorriges] = useState<Record<string, string>>({});

  const fondsDe = (f: FichierImporte) => corriges[f.fichier] ?? f.fondsId;

  const dateDe = (f: FichierImporte) => dates[f.fichier] ?? "";
  /** Un inventaire sans date n'a pas d'arrêté : il ne s'enregistre pas. */
  const dateManquante = (f: FichierImporte) =>
    f.nature === "inventaire" && !/^\d{4}-\d{2}-\d{2}$/.test(dateDe(f));

  const complet = (f: FichierImporte) =>
    !f.probleme && !!fondsDe(f) && !!f.nature && !dateManquante(f);
  const importables = (lecture ?? []).filter(complet);
  const bloquants = (lecture ?? []).filter((f) => !complet(f));

  const deposer = async (choisis: FileList | null) => {
    if (!choisis || choisis.length === 0) return;
    setErreur(null);
    setMessage(null);
    setEtats({});
    setCorriges({});
    setLecture(null);

    const excel = Array.from(choisis).filter((f) => /\.(xlsx|xlsm)$/i.test(f.name));
    if (excel.length === 0) {
      setErreur("Aucun fichier Excel dans ce dépôt.");
      return;
    }

    setAvancement(`${excel.length} fichier(s)…`);
    const corps = new FormData();
    for (const f of excel) corps.append("fichiers", f);
    try {
      const r = await fetch("/gestion-portefeuille/importation/lot", {
        method: "POST",
        body: corps,
      });
      const json = await r.json();
      if (!r.ok) {
        setErreur(json?.erreur ?? `Lecture impossible (${r.status}).`);
        return;
      }
      const fichiers = json.fichiers as FichierImporte[];
      const defaut = json.dateProposee ?? new Date().toISOString().slice(0, 10);
      setLecture(fichiers);
      setDateCommune(defaut);
      // LA DATE DU FICHIER L'EMPORTE SUR CELLE DU LOT : c'est elle qui est
      // écrite noir sur blanc dans le nom, et le lot n'en est qu'un résumé.
      setDates(
        Object.fromEntries(
          fichiers
            .filter((f) => f.nature === "inventaire")
            .map((f) => [f.fichier, f.dateFichier ?? defaut]),
        ),
      );
    } catch (err) {
      setErreur(`Lecture interrompue : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAvancement("");
    }
  };

  /**
   * ON ENREGISTRE FONDS PAR FONDS, et l'écran dit où il en est.
   *
   * Un seul envoi pour quinze inventaires dépasserait la taille d'une action
   * serveur, et surtout : si le dixième échoue, les neuf premiers doivent
   * rester. Une ligne qui tombe ne fait pas tomber l'arrêté.
   */
  const enregistrer = () => {
    setErreur(null);
    setMessage(null);
    demarrer(async () => {
      let faits = 0;
      for (const f of importables) {
        const fondsId = fondsDe(f);
        setEtats((e) => ({ ...e, [f.fichier]: { etat: "encours", detail: "" } }));
        try {
          if (f.nature === "inventaire") {
            const r = await savePortfolioAction(fondsId, {
              slot,
              asOfDate: dateDe(f),
              label: f.fichier,
              totalValuation: f.totalValorisation ?? 0,
              positions: f.positions ?? [],
            });
            setEtats((e) => ({
              ...e,
              [f.fichier]: r.ok
                ? { etat: "fait", detail: `${f.positions?.length ?? 0} ligne(s)` }
                : { etat: "echec", detail: r.error },
            }));
            if (r.ok) faits++;
          } else {
            const r = await enregistrerPointsNavAction(fondsId, f.points ?? []);
            setEtats((e) => ({
              ...e,
              [f.fichier]: r.ok
                ? { etat: "fait", detail: `${r.data.enregistres} point(s)` }
                : { etat: "echec", detail: r.error },
            }));
            if (r.ok) faits++;
          }
        } catch (err) {
          setEtats((e) => ({
            ...e,
            [f.fichier]: {
              etat: "echec",
              detail: err instanceof Error ? err.message : String(err),
            },
          }));
        }
      }
      // ── SECOND PASSAGE : ON RAPPROCHE CE QUI VIENT D'ENTRER ───────────
      //
      // UN TITRE ABSENT DU REFERENTIEL Y ENTRE EN S'ENREGISTRANT, mais la
      // ligne qui l'a apporté, elle, a été rapprochée AVANT qu'il existe :
      // elle reste « non reconnue » en base. C'est pourquoi il fallait
      // jusqu'ici réimporter une seconde fois.
      //
      // Et c'est pire en lot : une obligation détenue par six fonds n'est
      // créée qu'une fois — au premier enregistrement — et les cinq autres
      // inventaires gardent leur ligne non reconnue, alors que la fiche
      // existe désormais.
      //
      // On repasse donc sur chaque fonds une fois TOUT enregistré. Le
      // référentiel est alors complet, et le rapprochement se fait avec le
      // BON fonds — ce qui remet d'aplomb les comptes de trésorerie d'un
      // fichier dont on aurait corrigé le rattachement à la main.
      const aReclasser = [
        ...new Set(
          importables.filter((f) => f.nature === "inventaire").map((f) => fondsDe(f)),
        ),
      ];
      let reclasses = 0;
      for (const id of aReclasser) {
        setAvancement(`rapprochement ${++reclasses} / ${aReclasser.length}`);
        try {
          await reclassifyFundPortfoliosAction(id);
        } catch {
          /* le rapprochement se rejoue à tout moment : il ne bloque rien */
        }
      }
      setAvancement("");

      setMessage(
        `${faits} fichier(s) enregistré(s) sur ${importables.length}.` +
          (aReclasser.length > 0
            ? ` ${aReclasser.length} portefeuille(s) rapproché(s) du référentiel après coup.`
            : "") +
          (faits < importables.length ? " Les échecs sont détaillés à chaque ligne." : ""),
      );
      router.refresh();
    });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-slate-200">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Importer tout un arrêté</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Dépose le dossier des inventaires, celui des états de VL, ou les deux. Chaque
            fichier dit à quel fonds il appartient — « Inventaire du FCP AURORE SECURITE II
            au 3062026 » — et le rattachement est affiché avant d&apos;écrire quoi que ce
            soit.
          </p>
        </div>
        <label
          className={`px-3 py-1.5 text-[11px] font-medium border border-blue-300 text-blue-700 rounded cursor-pointer hover:bg-blue-50 ${
            enCours || avancement ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          {avancement ? `Lecture ${avancement}` : "Déposer des fichiers…"}
          <input
            type="file"
            multiple
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => {
              void deposer(e.target.files);
              // On vide la saisie pour que redéposer les mêmes fichiers
              // relance bien une lecture.
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {erreur && (
        <p className="px-4 py-2 text-[11px] text-rose-700 bg-rose-50 border-b border-rose-200">
          {erreur}
        </p>
      )}
      {message && (
        <p className="px-4 py-2 text-[11px] text-emerald-700 bg-emerald-50 border-b border-emerald-200">
          {message}
        </p>
      )}

      {lecture && lecture.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            {/* UN RACCOURCI, PAS LA SOURCE. Chaque inventaire porte sa
                propre date, dans sa ligne ; celle-ci sert à les remplir d'un
                coup quand l'arrêté est le même pour tous — le cas courant. Un
                état de VL n'est pas concerné : il porte ses dates à l'intérieur,
                une par ligne, et rien ici ne les touche. */}
            <div className="flex items-end gap-1.5">
              <label className="text-[11px] text-slate-600">
                Date commune
                <input
                  type="date"
                  value={dateCommune}
                  onChange={(e) => setDateCommune(e.target.value)}
                  className="block mt-0.5 px-2 py-1 rounded border border-slate-300 text-slate-900 text-xs"
                />
              </label>
              <button
                type="button"
                disabled={enCours || !dateCommune}
                onClick={() =>
                  setDates((d) =>
                    Object.fromEntries(Object.keys(d).map((k) => [k, dateCommune])),
                  )
                }
                className="px-2 py-1 text-[11px] font-medium border border-slate-300 text-slate-700 rounded hover:bg-white disabled:opacity-50"
                title="Pose cette date sur tous les inventaires du lot."
              >
                appliquer à tous
              </button>
            </div>
            <label className="text-[11px] text-slate-600">
              Arrêté
              <select
                value={slot}
                onChange={(e) => setSlot(e.target.value as PortfolioSlot)}
                className="block mt-0.5 px-2 py-1 rounded border border-slate-300 text-slate-900 text-xs"
              >
                {SLOTS.map((s) => (
                  <option key={s.valeur} value={s.valeur}>
                    {s.libelle}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[10px] text-slate-500 max-w-md">
              Chaque inventaire porte SA date, lue dans son nom de fichier et modifiable à
              sa ligne. Un inventaire REMPLACE celui du même fonds et du même arrêté :
              réimporter corrige, ne double pas.
            </p>
            <button
              type="button"
              onClick={enregistrer}
              disabled={enCours || importables.length === 0}
              className="ml-auto px-4 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
            >
              {enCours
                ? "Enregistrement…"
                : `Enregistrer ${importables.length} fichier(s)`}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-white text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Fichier</th>
                  <th className="text-left px-3 py-2 font-medium">Nature</th>
                  <th className="text-left px-3 py-2 font-medium">Fonds</th>
                  <th className="text-left px-3 py-2 font-medium">Date d&apos;arrêté</th>
                  <th className="text-right px-3 py-2 font-medium">Contenu</th>
                  <th className="text-left px-3 py-2 font-medium">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lecture.map((f) => {
                  const etat = etats[f.fichier];
                  const id = fondsDe(f);
                  const bloque = !!f.probleme || !id || !f.nature;
                  return (
                    <tr key={f.fichier} className={bloque ? "bg-amber-50/50" : undefined}>
                      <td className="px-3 py-1.5 text-slate-700 max-w-[26rem] truncate" title={f.fichier}>
                        {f.fichier}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">
                        {f.nature === "inventaire"
                          ? "Inventaire"
                          : f.nature === "vl"
                            ? "Valeur liquidative"
                            : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {/* LE RATTACHEMENT SE CORRIGE : il vient d'un nom de
                            fichier, et un nom de fichier se trompe. */}
                        <select
                          value={id}
                          onChange={(e) =>
                            setCorriges((c) => ({ ...c, [f.fichier]: e.target.value }))
                          }
                          className={`px-1.5 py-0.5 rounded border text-[11px] max-w-[18rem] ${
                            id ? "border-slate-300 text-slate-800" : "border-amber-400 bg-amber-50"
                          }`}
                        >
                          <option value="">— à rattacher —</option>
                          {fonds.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nom}
                            </option>
                          ))}
                        </select>
                        {/* UNE CORRECTION DEPLACE LE FICHIER, ELLE NE LE
                            RELIT PAS. Les comptes de trésorerie d'un
                            inventaire sont rapprochés du référentiel AU
                            MOMENT DE LA LECTURE, avec le fonds détecté : si
                            celui-ci était faux, redépose le fichier une fois
                            son nom corrigé plutôt que de le déplacer ici. Les
                            titres, eux, ne dépendent pas du fonds. */}
                        {id && id !== f.fondsId && (
                          <span
                            className="ml-1.5 text-[9px] text-blue-700 cursor-help"
                            title="Rattachement corrigé à la main. Le rapprochement est rejoué sur le bon fonds après l'enregistrement, comptes de trésorerie compris."
                          >
                            corrigé
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {/* LA DATE SE VALIDE LIGNE A LIGNE. Celle du nom de
                            fichier est une proposition, pas une vérité : elle
                            s'affiche pour être relue, et se corrige ici. */}
                        {f.nature === "inventaire" ? (
                          <>
                            <input
                              type="date"
                              value={dateDe(f)}
                              onChange={(e) =>
                                setDates((d) => ({ ...d, [f.fichier]: e.target.value }))
                              }
                              className={`px-1.5 py-0.5 rounded border text-[11px] tabular-nums ${
                                dateManquante(f)
                                  ? "border-amber-400 bg-amber-50"
                                  : "border-slate-300 text-slate-800"
                              }`}
                            />
                            {f.dateFichier && dateDe(f) !== f.dateFichier && (
                              <span
                                className="ml-1.5 text-[9px] text-blue-700 cursor-help"
                                title={`Le nom du fichier porte le ${f.dateFichier}.`}
                              >
                                corrigée
                              </span>
                            )}
                            {!f.dateFichier && (
                              <span
                                className="ml-1.5 text-[9px] text-slate-400 cursor-help"
                                title="Aucune date lisible dans le nom du fichier : celle-ci vient de la date commune."
                              >
                                déduite
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            dates du fichier
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                        {f.nature === "inventaire" && f.comptes
                          ? `${f.comptes.total} ligne(s)${
                              f.comptes.nonRattachees > 0
                                ? ` · ${f.comptes.nonRattachees} non rattachée(s)`
                                : ""
                            } · ${fmt0.format(Math.round(f.totalValorisation ?? 0))} F`
                          : f.nature === "vl"
                            ? `${f.points?.length ?? 0} point(s) · ${f.premiereDate} → ${f.derniereDate}`
                            : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {f.probleme ? (
                          <span className="text-amber-800">{f.probleme}</span>
                        ) : !id ? (
                          <span className="text-amber-800">
                            Fonds non reconnu — choisis-le dans la liste.
                          </span>
                        ) : etat?.etat === "encours" ? (
                          <span className="text-slate-500">enregistrement…</span>
                        ) : etat?.etat === "fait" ? (
                          <span className="text-emerald-700">✓ {etat.detail}</span>
                        ) : etat?.etat === "echec" ? (
                          <span className="text-rose-700">{etat.detail}</span>
                        ) : dateManquante(f) ? (
                          <span className="text-amber-800">
                            Date d&apos;arrêté manquante — renseigne-la.
                          </span>
                        ) : (
                          <span className="text-slate-400">prêt</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* CE QUE LA LECTURE A DU SUPPOSER. Un import silencieux sur un
              fichier mal disposé produit des chiffres faux qui ont l'air
              justes : on les met sous les yeux avant d'écrire. */}
          {lecture.some((f) => f.avertissements.length > 0) && (
            <ul className="px-4 py-2 border-t border-slate-200 bg-amber-50/60 space-y-0.5">
              {lecture
                .filter((f) => f.avertissements.length > 0)
                .map((f) =>
                  f.avertissements.map((a, i) => (
                    <li key={`${f.fichier}-${i}`} className="text-[10px] text-amber-800">
                      <strong>{f.fichier}</strong> — {a}
                    </li>
                  )),
                )}
            </ul>
          )}

          {bloquants.length > 0 && (
            <p className="px-4 py-2 text-[10px] text-slate-500 border-t border-slate-200">
              {bloquants.length} fichier(s) ne seront pas enregistrés tant qu&apos;ils
              portent un problème ou aucun fonds.
            </p>
          )}
        </>
      )}
    </section>
  );
}

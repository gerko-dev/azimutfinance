"use client";

// === Paramètres — Partenaires de marché ===
//
// Les SGI avec lesquelles la société de gestion traite : coordonnées, taux
// négociés, référents. Le taux de courtage standard est la raison d'être de
// cet écran — il est reporté à la saisie d'une opération, ce qui évite de le
// retaper à chaque ligne d'un bordereau et, surtout, d'en retaper un autre
// par inadvertance.
//
// Les BTCC n'y figurent pas : ce sont les banques du fonds, déjà décrites par
// ses comptes de trésorerie au référentiel. Les saisir ici les ferait diverger.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  enregistrerPartenaireAction,
  supprimerPartenaireAction,
} from "@/app/gestion-portefeuille/partenaires-actions";
import { UEMOA_CODES, WORLD_COUNTRIES } from "@/lib/onboarding/countries";
import ChampTaux from "./ChampTaux";
import {
  LIBELLES_NATURE,
  REFERENTS_MAX,
  partenaireVide,
  referentVide,
  type NaturePartenaire,
  type Partenaire,
  type Referent,
  type SaisiePartenaire,
} from "@/app/gestion-portefeuille/partenaires-types";

const champ =
  "w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:border-blue-400 focus:outline-none";

/**
 * Pays proposés : les huit UEMOA d'abord, le reste du monde ensuite.
 *
 * Un `datalist` conserve l'ordre de déclaration tant que le champ est vide :
 * mettre l'UEMOA en tête place donc sous le curseur les pays qui concernent
 * presque toutes les fiches, sans interdire les autres. La liste mondiale est
 * celle de l'onboarding — la dupliquer ici l'aurait laissée diverger.
 */
const PAYS_PROPOSES: string[] = (() => {
  const uemoa = WORLD_COUNTRIES.filter((c) => UEMOA_CODES.has(c.code)).map((c) => c.label);
  const reste = WORLD_COUNTRIES.filter((c) => !UEMOA_CODES.has(c.code)).map((c) => c.label);
  return [...uemoa.sort((a, b) => a.localeCompare(b, "fr")), ...reste];
})();

const ID_PAYS = "partenaires-pays";
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";

/**
 * Un champ, large de `span` colonnes sur la grille de six.
 *
 * Six et non quatre : c'est le plus petit nombre divisible par 2 et par 3,
 * donc le seul qui permette des rangées de deux, de trois ou de six champs
 * sans qu'aucun ne tombe à cheval. Les classes sont écrites EN TOUTES LETTRES
 * — Tailwind analyse le source, une classe assemblée à l'exécution ne serait
 * jamais générée.
 */
const LARGEURS: Record<number, string> = {
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
  6: "sm:col-span-6",
};

function Champ({
  label,
  children,
  span = 2,
}: {
  label: string;
  children: React.ReactNode;
  span?: 2 | 3 | 4 | 6;
}) {
  return (
    <label className={`flex flex-col gap-1 ${LARGEURS[span]}`}>
      <span className={etiquette}>{label}</span>
      {children}
    </label>
  );
}

function versSaisie(p: Partenaire): SaisiePartenaire {
  const { ...reste } = p;
  return {
    kind: reste.kind,
    nom: reste.nom,
    agrement: reste.agrement,
    pays: reste.pays,
    email: reste.email,
    telephone: reste.telephone,
    adresse: reste.adresse,
    tauxCourtage: reste.tauxCourtage,
    tauxTps: reste.tauxTps,
    tauxBrvm: reste.tauxBrvm,
    referents: reste.referents.length ? reste.referents : [referentVide()],
    actif: reste.actif,
    note: reste.note,
  };
}

export default function PartenairesPanel({
  initialPartenaires,
}: {
  initialPartenaires: Partenaire[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [editionId, setEditionId] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<SaisiePartenaire>(partenaireVide());
  const [ouvert, setOuvert] = useState(false);

  const set = <K extends keyof SaisiePartenaire>(k: K, v: SaisiePartenaire[K]) =>
    setSaisie((s) => ({ ...s, [k]: v }));

  const setReferent = (i: number, k: keyof Referent, v: string) =>
    setSaisie((s) => ({
      ...s,
      referents: s.referents.map((r, j) => (i === j ? { ...r, [k]: v } : r)),
    }));

  const ajouterReferent = () =>
    setSaisie((s) =>
      s.referents.length >= REFERENTS_MAX
        ? s
        : { ...s, referents: [...s.referents, referentVide()] },
    );

  const retirerReferent = (i: number) =>
    setSaisie((s) => {
      const restants = s.referents.filter((_, j) => j !== i);
      // Toujours au moins une ligne : un formulaire sans champ de saisie n'a
      // pas de bouton évident pour en rouvrir un.
      return { ...s, referents: restants.length ? restants : [referentVide()] };
    });

  const nouveau = () => {
    setEditionId(null);
    setSaisie(partenaireVide());
    setErreur(null);
    setOk(null);
    setOuvert(true);
  };

  const modifier = (p: Partenaire) => {
    setEditionId(p.id);
    setSaisie(versSaisie(p));
    setErreur(null);
    setOk(null);
    setOuvert(true);
  };

  const enregistrer = () => {
    setErreur(null);
    setOk(null);
    demarrer(async () => {
      const res = await enregistrerPartenaireAction(editionId, saisie);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setOk(editionId ? "Partenaire mis à jour." : "Partenaire ajouté.");
      setOuvert(false);
      setEditionId(null);
      setSaisie(partenaireVide());
      router.refresh();
    });
  };

  const supprimer = (p: Partenaire) => {
    demarrer(async () => {
      const res = await supprimerPartenaireAction(p.id);
      if (!res.ok) setErreur(res.error);
      else {
        setOk(`« ${p.nom} » supprimé.`);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Partenaires de marché
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Les SGI avec lesquelles tu traites. Leur taux de courtage standard est
              repris à la saisie d&apos;une opération de marché.
            </p>
          </div>
          <button
            type="button"
            onClick={nouveau}
            className="px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800"
          >
            Ajouter un partenaire
          </button>
        </div>

        <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2 mt-3">
          Les <strong>BTCC</strong> ne se saisissent pas ici : ce sont les banques du
          fonds, déjà décrites par ses comptes de trésorerie au référentiel. Elles
          sont proposées telles quelles sur les opérations MTP.
        </p>

        {erreur && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 mt-3">
            {erreur}
          </p>
        )}
        {ok && !erreur && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 mt-3">
            {ok}
          </p>
        )}
      </div>

      {/* ── Formulaire ───────────────────────────────────────────────────── */}
      {ouvert && (
        <div className="bg-white border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {editionId ? "Modifier le partenaire" : "Nouveau partenaire"}
          </h3>

          {/* DISPOSITION EN BLOCS, ET NON EN GRILLE UNIFORME.
              Une fiche partenaire répond à trois questions distinctes : qui
              est-ce, comment le joindre, à quelles conditions. Les aligner
              dans une seule grille de quatre colonnes mettait l'agrément à
              côté du taux de TPS — deux champs qu'on ne remplit jamais dans
              le même geste. Chaque bloc a donc sa grille, calée sur le nombre
              de champs qu'il contient. */}

          {/* Identité */}
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-3">
            <Champ label="Nature" span={2}>
              <select
                value={saisie.kind}
                onChange={(e) => set("kind", e.target.value as NaturePartenaire)}
                className={champ}
              >
                {/* Pas de BTCC ici : ce sont les banques du fonds, déjà
                    décrites par ses comptes de trésorerie. Les saisir une
                    seconde fois les ferait diverger. */}
                {(["sgi", "remere", "autre"] as NaturePartenaire[]).map((k) => (
                  <option key={k} value={k}>
                    {LIBELLES_NATURE[k]}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ label="Nom" span={4}>
              <input
                value={saisie.nom}
                onChange={(e) => set("nom", e.target.value)}
                placeholder="Ex. NSIA Finance"
                className={champ}
              />
            </Champ>

            <Champ label="N° d'agrément" span={2}>
              <input
                value={saisie.agrement}
                onChange={(e) => set("agrement", e.target.value)}
                className={champ}
              />
            </Champ>

            <Champ label="Pays" span={2}>
              {/* Saisissable ET listé : les huit UEMOA en tête, le reste du
                  monde derrière. Le champ reste libre pour ne pas bloquer une
                  dénomination que la liste ignore. */}
              <input
                value={saisie.pays}
                onChange={(e) => set("pays", e.target.value)}
                list={ID_PAYS}
                placeholder="Taper ou choisir…"
                className={champ}
              />
              <datalist id={ID_PAYS}>
                {PAYS_PROPOSES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Champ>

            <Champ label="Statut" span={2}>
              <select
                value={saisie.actif ? "actif" : "inactif"}
                onChange={(e) => set("actif", e.target.value === "actif")}
                className={champ}
              >
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
              </select>
              <span className="text-[9px] text-slate-400">
                Un partenaire inactif n&apos;est plus proposé à la saisie.
              </span>
            </Champ>
          </div>

          {/* Coordonnées */}
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-3 pt-3 border-t border-slate-100">
            <Champ label="Email" span={2}>
              <input
                value={saisie.email}
                onChange={(e) => set("email", e.target.value)}
                className={champ}
              />
            </Champ>
            <Champ label="Téléphone" span={2}>
              <input
                value={saisie.telephone}
                onChange={(e) => set("telephone", e.target.value)}
                className={champ}
              />
            </Champ>
            <Champ label="Adresse" span={2}>
              <input
                value={saisie.adresse}
                onChange={(e) => set("adresse", e.target.value)}
                className={champ}
              />
            </Champ>
          </div>

          {/* Conditions négociées — SGI SEULEMENT.
              Le courtage et sa TPS sont les conditions d'un INTERMÉDIAIRE de
              bourse. Une contrepartie de réméré n'intermédie rien : elle est
              en face, et ce qui se négocie avec elle — le prix de sortie — se
              saisit sur l'opération, réméré par réméré. Laisser les deux
              champs ici aurait laissé croire qu'un taux standard s'applique. */}
          <div className="mt-3 pt-3 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-800">
              {saisie.kind === "sgi" ? "Conditions négociées" : "Complément"}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-2">
              {saisie.kind === "remere" && (
                <p className="sm:col-span-6 text-[10px] text-slate-500">
                  Une contrepartie de réméré se choisit sur l&apos;opération MTP,
                  quand la case «&nbsp;Réméré&nbsp;» est cochée. Le prix de sortie s&apos;y
                  saisit aussi : il se négocie réméré par réméré.
                </p>
              )}
              {/* La commission BRVM / DC-BR ne figure PAS ici : c'est un tarif
                  de place, identique pour toutes les SGI, et il se règle par
                  instrument à la saisie de l'opération. La faire figurer sur
                  une fiche partenaire laissait croire qu'elle se négocie. */}
              {/* `ChampTaux` garde son propre texte : un champ contrôlé
                  reconverti depuis un nombre à chaque frappe interdisait de
                  taper « 0,4 » — la virgule disparaissait sous les doigts.
                  La `key` liée à la fiche en cours le remonte quand on passe
                  d'un partenaire à l'autre sans fermer le formulaire. */}
              {saisie.kind === "sgi" && (
                <>
                  <Champ label="Courtage (%)" span={2}>
                    <ChampTaux
                      key={`courtage-${editionId ?? "nouveau"}`}
                      valeur={saisie.tauxCourtage}
                      onChange={(v) => set("tauxCourtage", v)}
                      className={`${champ} text-right tabular-nums`}
                    />
                    <span className="text-[9px] text-slate-400">Usuel : 0,4</span>
                  </Champ>

                  <Champ label="TPS sur courtage (%)" span={2}>
                    <ChampTaux
                      key={`tps-${editionId ?? "nouveau"}`}
                      valeur={saisie.tauxTps}
                      onChange={(v) => set("tauxTps", v)}
                      className={`${champ} text-right tabular-nums`}
                    />
                    <span className="text-[9px] text-slate-400">Usuel : 10</span>
                  </Champ>
                </>
              )}

              <Champ label="Note" span={saisie.kind === "sgi" ? 2 : 6}>
                <input
                  value={saisie.note}
                  onChange={(e) => set("note", e.target.value)}
                  className={champ}
                />
              </Champ>
            </div>
          </div>

          {/* ── Référents ─────────────────────────────────────────────────── */}
          <div className="mt-4 pt-3 border-t border-slate-200">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-xs font-semibold text-slate-800">
                Référents ({saisie.referents.length}/{REFERENTS_MAX})
              </h4>
              {saisie.referents.length < REFERENTS_MAX && (
                <button
                  type="button"
                  onClick={ajouterReferent}
                  className="text-[11px] text-blue-700 hover:text-blue-900"
                >
                  + Ajouter un référent
                </button>
              )}
            </div>

            {saisie.referents.map((r, i) => (
              <div
                key={i}
                className="mt-3 pt-3 border-t border-slate-100 first:border-0 first:pt-0"
              >
                {/* Le bouton de retrait est dans l'EN-TÊTE du bloc et non
                    collé au dernier champ : accroché à « Téléphone », il
                    tombait sous le curseur juste après la saisie, à l'endroit
                    exact où l'on tabule. */}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    Référent {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => retirerReferent(i)}
                    className="text-[10px] text-rose-600 hover:text-rose-800"
                  >
                    Retirer
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-1.5">
                  <Champ label="Nom" span={3}>
                    <input
                      value={r.nom}
                      onChange={(e) => setReferent(i, "nom", e.target.value)}
                      className={champ}
                    />
                  </Champ>
                  <Champ label="Fonction" span={3}>
                    <input
                      value={r.fonction}
                      onChange={(e) => setReferent(i, "fonction", e.target.value)}
                      className={champ}
                    />
                  </Champ>
                  <Champ label="Email" span={3}>
                    <input
                      value={r.email}
                      onChange={(e) => setReferent(i, "email", e.target.value)}
                      className={champ}
                    />
                  </Champ>
                  <Champ label="Téléphone" span={3}>
                    <input
                      value={r.telephone}
                      onChange={(e) => setReferent(i, "telephone", e.target.value)}
                      className={champ}
                    />
                  </Champ>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-slate-400 mt-2">
              Un référent laissé entièrement vide n&apos;est pas enregistré.
            </p>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={enregistrer}
              disabled={enCours}
              className="px-4 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="px-4 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Liste ────────────────────────────────────────────────────────── */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Nature</th>
                <th className="text-left px-3 py-2 font-medium">Nom</th>
                <th className="text-left px-3 py-2 font-medium">Agrément</th>
                <th className="text-right px-3 py-2 font-medium">Courtage</th>
                <th className="text-right px-3 py-2 font-medium">TPS</th>
                <th className="text-left px-3 py-2 font-medium">Référents</th>
                <th className="text-left px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialPartenaires.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    Aucun partenaire enregistré.
                  </td>
                </tr>
              )}
              {initialPartenaires.map((p) => {
                const referents = p.referents.filter((r) => r.nom.trim());
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-slate-500">
                      {p.kind === "remere" ? "Contrepartie réméré" : p.kind.toUpperCase()}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-slate-900">{p.nom}</td>
                    <td className="px-3 py-1.5 text-slate-600">{p.agrement || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {p.kind === "sgi"
                        ? `${(p.tauxCourtage * 100).toFixed(2).replace(".", ",")} %`
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {p.kind === "sgi"
                        ? `${(p.tauxTps * 100).toFixed(2).replace(".", ",")} %`
                        : "—"}
                    </td>
                    <td
                      className="px-3 py-1.5 text-slate-600"
                      title={referents
                        .map((r) => `${r.nom}${r.fonction ? ` — ${r.fonction}` : ""}`)
                        .join(" · ")}
                    >
                      {referents.length === 0
                        ? "—"
                        : `${referents[0].nom}${
                            referents.length > 1 ? ` +${referents.length - 1}` : ""
                          }`}
                    </td>
                    <td className="px-3 py-1.5">
                      {p.actif ? (
                        <span className="text-emerald-700">Actif</span>
                      ) : (
                        <span className="text-slate-400">Inactif</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => modifier(p)}
                        className="text-[10px] text-blue-700 hover:text-blue-900 mr-3"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => supprimer(p)}
                        disabled={enCours}
                        className="text-[10px] text-rose-600 hover:text-rose-800 disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

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
const etiquette = "text-[10px] uppercase tracking-wider text-slate-500";

/** Les taux sont stockés en décimal et saisis en POURCENTAGE : personne ne
 *  pense « 0,004 », tout le monde pense « 0,4 % ». La conversion se fait ici,
 *  au bord de l'écran, pour que le reste du module n'ait qu'une convention. */
const versPct = (v: number) => String(Number((v * 100).toFixed(4)));
const depuisPct = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n / 100 : 0;
};

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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <Champ label="Nature">
              <select
                value={saisie.kind}
                onChange={(e) => set("kind", e.target.value as NaturePartenaire)}
                className={champ}
              >
                {(Object.keys(LIBELLES_NATURE) as NaturePartenaire[]).map((k) => (
                  <option key={k} value={k}>
                    {LIBELLES_NATURE[k]}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ label="Nom" large>
              <input
                value={saisie.nom}
                onChange={(e) => set("nom", e.target.value)}
                placeholder="Ex. NSIA Finance"
                className={champ}
              />
            </Champ>

            <Champ label="N° d'agrément">
              <input
                value={saisie.agrement}
                onChange={(e) => set("agrement", e.target.value)}
                className={champ}
              />
            </Champ>

            <Champ label="Pays">
              <input
                value={saisie.pays}
                onChange={(e) => set("pays", e.target.value)}
                className={champ}
              />
            </Champ>

            <Champ label="Email">
              <input
                value={saisie.email}
                onChange={(e) => set("email", e.target.value)}
                className={champ}
              />
            </Champ>

            <Champ label="Téléphone">
              <input
                value={saisie.telephone}
                onChange={(e) => set("telephone", e.target.value)}
                className={champ}
              />
            </Champ>

            <Champ label="Adresse" large>
              <input
                value={saisie.adresse}
                onChange={(e) => set("adresse", e.target.value)}
                className={champ}
              />
            </Champ>

            {/* Saisis en POURCENTAGE : personne ne pense « 0,004 ». */}
            <Champ label="Courtage standard (%)">
              <input
                value={versPct(saisie.tauxCourtage)}
                onChange={(e) => set("tauxCourtage", depuisPct(e.target.value))}
                inputMode="decimal"
                className={`${champ} text-right tabular-nums`}
              />
              <span className="text-[9px] text-slate-400">Usuel : 0,4</span>
            </Champ>

            <Champ label="TPS sur courtage (%)">
              <input
                value={versPct(saisie.tauxTps)}
                onChange={(e) => set("tauxTps", depuisPct(e.target.value))}
                inputMode="decimal"
                className={`${champ} text-right tabular-nums`}
              />
              <span className="text-[9px] text-slate-400">Usuel : 10</span>
            </Champ>

            <Champ label="BRVM / DC-BR (%)">
              <input
                value={versPct(saisie.tauxBrvm)}
                onChange={(e) => set("tauxBrvm", depuisPct(e.target.value))}
                inputMode="decimal"
                className={`${champ} text-right tabular-nums`}
              />
              <span className="text-[9px] text-slate-400">Usuel : 0,3</span>
            </Champ>

            <Champ label="Statut">
              <select
                value={saisie.actif ? "actif" : "inactif"}
                onChange={(e) => set("actif", e.target.value === "actif")}
                className={champ}
              >
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
              </select>
              <span className="text-[9px] text-slate-400">
                Un partenaire inactif reste en base mais n&apos;est plus proposé.
              </span>
            </Champ>

            <Champ label="Note" large>
              <input
                value={saisie.note}
                onChange={(e) => set("note", e.target.value)}
                className={champ}
              />
            </Champ>
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
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-100 first:border-0 first:pt-0"
              >
                <Champ label={`Référent ${i + 1} — nom`}>
                  <input
                    value={r.nom}
                    onChange={(e) => setReferent(i, "nom", e.target.value)}
                    className={champ}
                  />
                </Champ>
                <Champ label="Fonction">
                  <input
                    value={r.fonction}
                    onChange={(e) => setReferent(i, "fonction", e.target.value)}
                    className={champ}
                  />
                </Champ>
                <Champ label="Email">
                  <input
                    value={r.email}
                    onChange={(e) => setReferent(i, "email", e.target.value)}
                    className={champ}
                  />
                </Champ>
                <div className="flex items-end gap-2">
                  <Champ label="Téléphone">
                    <input
                      value={r.telephone}
                      onChange={(e) => setReferent(i, "telephone", e.target.value)}
                      className={champ}
                    />
                  </Champ>
                  <button
                    type="button"
                    onClick={() => retirerReferent(i)}
                    title="Retirer ce référent"
                    className="mb-1.5 text-[11px] text-rose-600 hover:text-rose-800"
                  >
                    Retirer
                  </button>
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
                <th className="text-right px-3 py-2 font-medium">BRVM</th>
                <th className="text-left px-3 py-2 font-medium">Référents</th>
                <th className="text-left px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialPartenaires.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-400">
                    Aucun partenaire enregistré.
                  </td>
                </tr>
              )}
              {initialPartenaires.map((p) => {
                const referents = p.referents.filter((r) => r.nom.trim());
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 uppercase text-slate-500">{p.kind}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-900">{p.nom}</td>
                    <td className="px-3 py-1.5 text-slate-600">{p.agrement || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {(p.tauxCourtage * 100).toFixed(2).replace(".", ",")} %
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {(p.tauxTps * 100).toFixed(2).replace(".", ",")} %
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {(p.tauxBrvm * 100).toFixed(2).replace(".", ",")} %
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSeason,
  deleteAllSeasons,
  deleteSeason,
  setSeasonStatus,
} from "@/lib/admin/actions";
import {
  closeIntroPhaseAction,
  openSeasonAction,
  previewSeasonPoolAction,
  type PoolPreview,
} from "@/lib/simulator/seasonAdmin";
import type { AdminSeason } from "@/lib/admin/types";
import { fmtDate, fmtFCFA, fmtNumber } from "./format";

// Capital initial passé au RPC à la création. Valeur purement technique : le
// capital réel est recalculé au lancement de la Course (pool ÷ inscrits) et
// écrase cette valeur. On ne l'affiche pas tant que la saison n'a pas démarré.
const PLACEHOLDER_INITIAL_CAPITAL = 0;

export default function SeasonsManager({ seasons }: { seasons: AdminSeason[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const today = new Date();
  const [registrationStartsAt, setRegistrationStartsAt] = useState(
    today.toISOString().slice(0, 10),
  );
  const [registrationEndsAt, setRegistrationEndsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 67);
    return d.toISOString().slice(0, 10);
  });
  const [feePct, setFeePct] = useState(1);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [previewSeasonId, setPreviewSeasonId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PoolPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState("");
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  // Timestamps de la Course (modale de lancement) — format datetime-local
  const [introStartLocal, setIntroStartLocal] = useState("");
  const [introEndLocal, setIntroEndLocal] = useState("");

  function submit() {
    if (!name.trim()) {
      setFeedback({ ok: false, msg: "Le nom est obligatoire." });
      return;
    }
    if (registrationEndsAt < registrationStartsAt) {
      setFeedback({
        ok: false,
        msg: "La date de fin d'inscription doit être supérieure ou égale à la date de début d'inscription.",
      });
      return;
    }
    if (startsAt < registrationEndsAt) {
      setFeedback({
        ok: false,
        msg: "La compétition doit démarrer après la fin de la phase d'inscription.",
      });
      return;
    }
    if (endsAt <= startsAt) {
      setFeedback({
        ok: false,
        msg: "La date de fin de compétition doit être après la date de début.",
      });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res = await createSeason({
        name: name.trim(),
        registrationStartsAt,
        registrationEndsAt,
        startsAt,
        endsAt,
        // Le capital initial n'est PAS choisi à la création : il est calculé au
        // lancement de la Course à l'introduction (valeur du pool flottant ÷
        // nombre d'inscrits, cf. openSeasonAction). On passe ici une valeur
        // placeholder car le RPC admin_create_season_v2 exige le paramètre ;
        // elle sera écrasée au lancement.
        initialCapital: PLACEHOLDER_INITIAL_CAPITAL,
        feePct: feePct / 100,
      });
      if (res.ok) {
        setFeedback({ ok: true, msg: "Saison créée." });
        setShowForm(false);
        setName("");
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function changeStatus(seasonId: string, status: "upcoming" | "active" | "ended") {
    startTransition(async () => {
      const res = await setSeasonStatus({ seasonId, status });
      if (res.ok) {
        setFeedback({ ok: true, msg: "Statut mis à jour." });
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  async function openPreview(seasonId: string) {
    setPreviewSeasonId(seasonId);
    setPreview(null);
    setPreviewLoading(true);

    // Pré-remplir la fenêtre de la Course = starts_at 10h00 → 24h00 GMT.
    // L'input <input type="datetime-local"> attend du local time (YYYY-MM-DDTHH:mm).
    // On veut afficher l'heure UTC correspondante au démarrage 10h GMT — on
    // convertit en heure locale du navigateur pour pré-remplir, et on
    // reconvertit en ISO UTC au moment du POST.
    const season = seasons.find((s) => s.id === seasonId);
    if (season) {
      const start = new Date(`${season.starts_at}T10:00:00Z`);
      const end = new Date(`${season.starts_at}T24:00:00Z`);
      setIntroStartLocal(toDatetimeLocal(start));
      setIntroEndLocal(toDatetimeLocal(end));
    }

    const res = await previewSeasonPoolAction(seasonId);
    setPreviewLoading(false);
    if (res.ok) {
      setPreview(res.data);
    } else {
      setFeedback({ ok: false, msg: res.error });
      setPreviewSeasonId(null);
    }
  }

  function removeSeason(seasonId: string, name: string) {
    if (
      !window.confirm(
        `Supprimer la saison "${name}" ?\n\n` +
          "Cette action supprime aussi tous les portefeuilles, transactions, " +
          "ordres et positions rattachés. Irréversible.",
      )
    ) {
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res = await deleteSeason({ seasonId });
      if (res.ok) {
        setFeedback({ ok: true, msg: `Saison "${name}" supprimée.` });
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function removeAllSeasons() {
    setFeedback(null);
    startTransition(async () => {
      const res = await deleteAllSeasons();
      if (res.ok) {
        setFeedback({
          ok: true,
          msg: `${res.data.count} saison(s) supprimée(s). Tout l'historique du simulateur a été effacé.`,
        });
        setShowDeleteAll(false);
        setDeleteAllConfirm("");
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function launchIntro(seasonId: string) {
    setFeedback(null);
    if (!introStartLocal || !introEndLocal) {
      setFeedback({ ok: false, msg: "Renseigne les deux dates de la Course." });
      return;
    }
    const startISO = new Date(introStartLocal).toISOString();
    const endISO = new Date(introEndLocal).toISOString();
    if (Date.parse(endISO) <= Date.parse(startISO)) {
      setFeedback({
        ok: false,
        msg: "La fin de la Course doit être postérieure à son début.",
      });
      return;
    }
    startTransition(async () => {
      const res = await openSeasonAction({
        seasonId,
        introStartAt: startISO,
        introEndAt: endISO,
      });
      if (res.ok) {
        const cap = res.data.initial_capital.toLocaleString("fr-FR");
        setFeedback({
          ok: true,
          msg: `Course à l'introduction lancée. Capital initial : ${cap} FCFA pour ${res.data.participants} inscrits. Fenêtre : ${fmtDateTimeUtc(res.data.intro_start)} → ${fmtDateTimeUtc(res.data.intro_end)}.`,
        });
        setPreviewSeasonId(null);
        setPreview(null);
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  function closeIntro(seasonId: string, force: boolean) {
    setFeedback(null);
    if (force) {
      if (
        !window.confirm(
          "Forcer la clôture de la Course à l'introduction avant la fin de la fenêtre ?\n\n" +
            "Toutes les actions non achetées seront immédiatement basculées en ordres SELL " +
            "dans le carnet d'ordres. Irréversible.",
        )
      ) {
        return;
      }
    }
    startTransition(async () => {
      const res = await closeIntroPhaseAction({ seasonId, force });
      if (res.ok) {
        if (res.data.already_closed) {
          setFeedback({ ok: true, msg: "La Course était déjà clôturée." });
        } else {
          setFeedback({
            ok: true,
            msg: `Course clôturée. ${res.data.orders_created} ordre(s) SELL déposé(s) dans le carnet pour ${res.data.units_dumped.toLocaleString("fr-FR")} action(s) non achetée(s).`,
          });
        }
        router.refresh();
      } else {
        setFeedback({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div>
      {feedback && (
        <div
          className={`mb-3 text-xs px-3 py-2 rounded border ${
            feedback.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="flex justify-end gap-2 mb-3">
        {seasons.length > 0 && (
          <button
            onClick={() => setShowDeleteAll(true)}
            disabled={isPending}
            className="text-sm border border-rose-300 text-rose-700 hover:bg-rose-50 font-medium px-3 py-1.5 rounded disabled:opacity-50"
          >
            Tout supprimer
          </button>
        )}
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm bg-slate-900 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded"
        >
          {showForm ? "Fermer" : "+ Nouvelle saison"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Nom de la saison
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Saison 2 — Juillet/Août 2026"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </div>
          <fieldset className="border border-slate-200 rounded p-3">
            <legend className="text-[10px] uppercase font-semibold text-slate-600 px-1">
              Phase d&apos;inscription
            </legend>
            <p className="text-[11px] text-slate-500 -mt-0.5 mb-2">
              Fenêtre pendant laquelle les joueurs peuvent rejoindre la saison. Doit fermer
              avant le début de la compétition pour permettre le calcul du pool.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                  Inscription · début
                </label>
                <input
                  type="date"
                  value={registrationStartsAt}
                  onChange={(e) => setRegistrationStartsAt(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                  Inscription · fin
                </label>
                <input
                  type="date"
                  value={registrationEndsAt}
                  onChange={(e) => setRegistrationEndsAt(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="border border-slate-200 rounded p-3">
            <legend className="text-[10px] uppercase font-semibold text-slate-600 px-1">
              Période de compétition
            </legend>
            <p className="text-[11px] text-slate-500 -mt-0.5 mb-2">
              Le premier jour, à 10h00 GMT, démarre la Course à l&apos;introduction. Le
              carnet d&apos;ordres prend le relais à partir du lendemain.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                  Compétition · début
                </label>
                <input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                  Compétition · fin
                </label>
                <input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                />
              </div>
            </div>
          </fieldset>

          <div>
            <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
              Frais par transaction (%)
            </label>
            <input
              type="number"
              value={feePct}
              step={0.1}
              min={0}
              max={5}
              onChange={(e) => setFeePct(Math.max(0, Number(e.target.value) || 0))}
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 tabular-nums"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Le capital initial n&apos;est pas saisi ici : il est calculé
              automatiquement au lancement de la Course à l&apos;introduction
              (valeur du pool flottant répartie entre les inscrits).
            </p>
          </div>
          <button
            onClick={submit}
            disabled={isPending}
            className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded disabled:opacity-50"
          >
            {isPending ? "Création…" : "Créer la saison"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left font-medium py-2 pl-4 pr-2">Nom</th>
              <th className="text-left font-medium py-2 px-2">Période</th>
              <th className="text-right font-medium py-2 px-2">Capital</th>
              <th className="text-right font-medium py-2 px-2">Frais</th>
              <th className="text-left font-medium py-2 px-2">Statut</th>
              <th className="text-right font-medium py-2 pr-4 pl-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {seasons.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  Aucune saison créée.
                </td>
              </tr>
            ) : (
              seasons.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pl-4 pr-2 font-medium text-slate-900">{s.name}</td>
                  <td className="py-2 px-2 text-slate-700 text-[11px]">
                    {s.registration_starts_at && s.registration_ends_at && (
                      <div className="text-slate-500">
                        <span className="font-medium">Inscr.</span>{" "}
                        {fmtDate(s.registration_starts_at)} → {fmtDate(s.registration_ends_at)}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Compét.</span> {fmtDate(s.starts_at)} →{" "}
                      {fmtDate(s.ends_at)}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-900">
                    {s.initial_capital > 0 ? (
                      fmtFCFA(s.initial_capital)
                    ) : (
                      <span className="text-slate-400" title="Défini au lancement de la Course">
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                    {(s.transaction_fee_pct * 100).toFixed(2).replace(".", ",")} %
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                        s.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : s.status === "intro"
                          ? "bg-amber-100 text-amber-800"
                          : s.status === "upcoming"
                          ? "bg-blue-100 text-blue-800"
                          : s.status === "frozen"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {s.status === "active"
                        ? "Active"
                        : s.status === "intro"
                        ? "Course à l'intro"
                        : s.status === "upcoming"
                        ? "À venir"
                        : s.status === "frozen"
                        ? "Gelée"
                        : "Terminée"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 pl-2 text-right">
                    <div className="flex justify-end gap-1.5 flex-wrap">
                      {(s.status === "upcoming" || s.status === "active") &&
                        !s.total_pool_value && (
                          <button
                            onClick={() => openPreview(s.id)}
                            disabled={isPending || previewLoading}
                            className="text-[11px] text-amber-700 font-medium hover:underline disabled:opacity-50"
                            title="Calcule le pool flottant et le capital initial à partir des inscrits, puis ouvre la Course à l'introduction"
                          >
                            Lancer la Course
                          </button>
                        )}
                      {s.status !== "active" && s.status !== "intro" && (
                        <button
                          onClick={() => changeStatus(s.id, "active")}
                          disabled={isPending}
                          className="text-[11px] text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          Activer
                        </button>
                      )}
                      {s.status === "intro" && (
                        <button
                          onClick={() => closeIntro(s.id, true)}
                          disabled={isPending}
                          className="text-[11px] text-amber-700 font-medium hover:underline disabled:opacity-50"
                          title="Termine la Course immédiatement et bascule le pool restant en SELL orders dans le carnet"
                        >
                          Forcer fin Course
                        </button>
                      )}
                      {s.status !== "ended" && s.status !== "intro" && (
                        <button
                          onClick={() => changeStatus(s.id, "ended")}
                          disabled={isPending}
                          className="text-[11px] text-rose-700 hover:underline disabled:opacity-50"
                        >
                          Clôturer
                        </button>
                      )}
                      {s.status !== "upcoming" && s.status !== "intro" && (
                        <button
                          onClick={() => changeStatus(s.id, "upcoming")}
                          disabled={isPending}
                          className="text-[11px] text-slate-600 hover:underline disabled:opacity-50"
                        >
                          À venir
                        </button>
                      )}
                      <button
                        onClick={() => removeSeason(s.id, s.name)}
                        disabled={isPending}
                        className="text-[11px] text-rose-800 font-medium hover:underline disabled:opacity-50"
                        title="Supprime la saison et toutes ses données rattachées (portefeuilles, transactions, ordres)"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showDeleteAll && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          onClick={() => {
            if (!isPending) {
              setShowDeleteAll(false);
              setDeleteAllConfirm("");
            }
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-rose-200 bg-rose-50">
              <h3 className="text-lg font-bold text-rose-900">
                Supprimer toutes les saisons ?
              </h3>
              <p className="text-xs text-rose-800 mt-1">
                {seasons.length} saison(s) seront détruites avec leurs portefeuilles,
                transactions, ordres et positions. Cette action est <strong>irréversible</strong>.
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <label className="block text-xs font-medium text-slate-700">
                Pour confirmer, tape exactement <code className="bg-slate-100 px-1 py-0.5 rounded">SUPPRIMER TOUT</code> :
              </label>
              <input
                type="text"
                value={deleteAllConfirm}
                onChange={(e) => setDeleteAllConfirm(e.target.value)}
                placeholder="SUPPRIMER TOUT"
                autoFocus
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
              />
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => {
                  if (!isPending) {
                    setShowDeleteAll(false);
                    setDeleteAllConfirm("");
                  }
                }}
                disabled={isPending}
                className="text-sm border border-slate-300 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={removeAllSeasons}
                disabled={isPending || deleteAllConfirm !== "SUPPRIMER TOUT"}
                className="text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium px-4 py-1.5 rounded disabled:opacity-50 disabled:bg-slate-400"
              >
                {isPending ? "Suppression…" : "Tout supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewSeasonId && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          onClick={() => {
            if (!isPending) {
              setPreviewSeasonId(null);
              setPreview(null);
            }
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                Lancer la Course à l&apos;introduction
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Aperçu du pool calculé à partir du flottant cumulé de toutes les actions cotées
                BRVM (champ <code>float</code> × dernier cours connu, arrondi au tick de 5 FCFA).
                Le capital initial sera distribué également entre tous les joueurs inscrits.
              </p>
            </div>

            <div className="px-5 py-4">
              {previewLoading || !preview ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  Calcul du pool en cours…
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-slate-50 rounded p-3">
                      <div className="text-[10px] uppercase font-semibold text-slate-500">
                        Titres
                      </div>
                      <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                        {fmtNumber(preview.poolCount)}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded p-3">
                      <div className="text-[10px] uppercase font-semibold text-slate-500">
                        Actions cotées
                      </div>
                      <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                        {fmtNumber(preview.totalUnits)}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded p-3">
                      <div className="text-[10px] uppercase font-semibold text-slate-500">
                        Valeur pool
                      </div>
                      <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                        {fmtFCFA(preview.totalValue)}
                      </div>
                    </div>
                    <div className="bg-amber-50 rounded p-3 border border-amber-200">
                      <div className="text-[10px] uppercase font-semibold text-amber-800">
                        Inscrits
                      </div>
                      <div className="text-lg font-bold text-amber-900 tabular-nums mt-0.5">
                        {fmtNumber(preview.participants)}
                      </div>
                    </div>
                  </div>

                  <div className="bg-emerald-50 rounded p-3 border border-emerald-200 mb-4">
                    <div className="text-[10px] uppercase font-semibold text-emerald-800">
                      Capital initial par joueur
                    </div>
                    <div className="text-2xl font-bold text-emerald-900 tabular-nums mt-1">
                      {preview.estimatedCapitalPerParticipant === null
                        ? "—"
                        : `${fmtFCFA(preview.estimatedCapitalPerParticipant)} FCFA`}
                    </div>
                    {preview.estimatedCapitalPerParticipant === null && (
                      <div className="text-[11px] text-rose-700 mt-1">
                        Aucun joueur inscrit. Impossible de lancer la Course tant qu&apos;il
                        n&apos;y a pas au moins 1 portefeuille rattaché à cette saison.
                      </div>
                    )}
                  </div>

                  {preview.top.length > 0 && (
                    <div className="mb-4">
                      <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1.5">
                        Top 8 du pool par valeur
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 text-[10px] uppercase">
                            <th className="text-left font-medium py-1">Titre</th>
                            <th className="text-right font-medium py-1">Actions</th>
                            <th className="text-right font-medium py-1">Valeur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.top.map((t) => (
                            <tr key={t.code} className="border-t border-slate-100">
                              <td className="py-1 font-mono text-slate-900">{t.code}</td>
                              <td className="py-1 text-right tabular-nums text-slate-700">
                                {fmtNumber(t.units)}
                              </td>
                              <td className="py-1 text-right tabular-nums text-slate-900">
                                {fmtFCFA(t.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <fieldset className="border border-amber-200 bg-amber-50/40 rounded p-3 mb-3">
                    <legend className="text-[10px] uppercase font-semibold text-amber-800 px-1">
                      Fenêtre de la Course (UTC)
                    </legend>
                    <p className="text-[11px] text-amber-900 -mt-0.5 mb-2">
                      Pré-remplie à <strong>starts_at 10h00 → 24h00 GMT</strong>. Modifie si tu
                      veux décaler la fenêtre. Les heures saisies sont en{" "}
                      <strong>heure locale du navigateur</strong> et seront converties en UTC
                      avant envoi (un aperçu UTC s&apos;affiche sous chaque champ).
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                          Début de la Course
                        </label>
                        <input
                          type="datetime-local"
                          value={introStartLocal}
                          onChange={(e) => setIntroStartLocal(e.target.value)}
                          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                        />
                        <div className="text-[10px] text-slate-500 mt-1 font-mono">
                          UTC : {introStartLocal ? fmtDateTimeUtc(new Date(introStartLocal).toISOString()) : "—"}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 uppercase mb-1">
                          Fin de la Course
                        </label>
                        <input
                          type="datetime-local"
                          value={introEndLocal}
                          onChange={(e) => setIntroEndLocal(e.target.value)}
                          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
                        />
                        <div className="text-[10px] text-slate-500 mt-1 font-mono">
                          UTC : {introEndLocal ? fmtDateTimeUtc(new Date(introEndLocal).toISOString()) : "—"}
                        </div>
                      </div>
                    </div>
                  </fieldset>

                  <div className="bg-rose-50 border border-rose-200 rounded p-3 text-xs text-rose-800">
                    <strong>Attention</strong> : cette action est irréversible. Elle réinitialise
                    le cash de tous les portefeuilles de la saison au capital ci-dessus et fait
                    passer la saison en mode &laquo;&nbsp;Course à l&apos;introduction&nbsp;&raquo;.
                    Aucune nouvelle inscription ne sera ensuite acceptée. Le pool restant à la
                    fin de la fenêtre bascule automatiquement en SELL orders dans le carnet.
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => {
                  if (!isPending) {
                    setPreviewSeasonId(null);
                    setPreview(null);
                  }
                }}
                disabled={isPending}
                className="text-sm border border-slate-300 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={() => launchIntro(previewSeasonId)}
                disabled={
                  isPending ||
                  previewLoading ||
                  !preview ||
                  preview.participants === 0 ||
                  preview.totalValue <= 0 ||
                  !introStartLocal ||
                  !introEndLocal
                }
                className="text-sm bg-amber-600 hover:bg-amber-700 text-white font-medium px-4 py-1.5 rounded disabled:opacity-50"
              >
                {isPending ? "Lancement…" : "Lancer la Course"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Helpers datetime ===
// Convertit un Date en chaine "YYYY-MM-DDTHH:mm" pour <input type="datetime-local">.
// L'input attend l'heure LOCALE du navigateur — donc on lit getFullYear etc.
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// Formate un ISO timestamptz pour affichage en UTC compact (jj/mm hh:mm UTC).
function fmtDateTimeUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}

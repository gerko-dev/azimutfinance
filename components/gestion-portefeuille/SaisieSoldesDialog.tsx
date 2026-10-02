"use client";

// === Saisie des soldes bancaires : banques en colonnes, fonds en lignes ===
//
// C'est la forme du geste réel. Un relevé se lit PAR BANQUE : on ouvre celui
// de la BOA et on y trouve les comptes de tous les fonds. Saisir fonds par
// fonds obligeait à rouvrir le même relevé autant de fois qu'il y a de
// portefeuilles.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { enregistrerSoldesMultiFondsAction } from "@/app/gestion-portefeuille/tresorerie-actions";
import {
  lireRelevesAction,
  rattacherRelevesAction,
} from "@/app/gestion-portefeuille/releves-actions";
import type {
  LectureReleves,
  ReleveBrut,
} from "@/app/gestion-portefeuille/releves-data";
import type { GrilleSoldes } from "@/app/gestion-portefeuille/tresorerie-grille";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Les soldes se comptent en centaines de millions : sans séparateurs,
 *  « 220180967 » ne se relit pas et une erreur d'un facteur dix passe
 *  inaperçue. Même traitement que l'ancienne saisie en ligne. */
function formaterSaisie(brut: string): string {
  const negatif = brut.trimStart().startsWith("-");
  const chiffres = brut.split(/[.,]/)[0].replace(/\D/g, "");
  if (!chiffres) return negatif ? "-" : "";
  return (negatif ? "-" : "") + fmt0.format(Number(chiffres));
}

const lire = (v: string): number => {
  const n = Number((v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Clef d'une cellule. Le séparateur ne peut pas apparaître dans un UUID. */
const cellule = (fondsId: string, banque: string) => `${fondsId}|${banque}`;

export default function SaisieSoldesDialog({
  grille,
  onFermer,
}: {
  grille: GrilleSoldes;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [date, setDate] = useState(
    grille.derniereDate ?? new Date().toISOString().slice(0, 10),
  );
  // LA LECTURE NE REMPLIT RIEN TOUTE SEULE. Elle se range ici, l'écran la
  // montre, et le gérant décide de l'appliquer : un solde à huit chiffres posé
  // sans qu'on l'ait vu passer n'est pas une automatisation, c'est une erreur
  // en attente du mois suivant.
  const [lecture, setLecture] = useState<LectureReleves | null>(null);
  const [applique, setApplique] = useState(0);
  /** Avancement du dépôt : « 3 / 12 banques ». Vide quand rien n'est en cours. */
  const [avancement, setAvancement] = useState("");

  const [valeurs, setValeurs] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const l of grille.lignes) {
      for (const b of l.comptes) {
        v[cellule(l.fondsId, b)] = formaterSaisie(String(Math.round(l.soldes[b] ?? 0)));
      }
    }
    return v;
  });

  const total = (banque: string) =>
    grille.lignes.reduce(
      (s, l) => s + (l.comptes.includes(banque) ? lire(valeurs[cellule(l.fondsId, banque)] ?? "") : 0),
      0,
    );

  const totalFonds = (l: GrilleSoldes["lignes"][number]) =>
    l.comptes.reduce((s, b) => s + lire(valeurs[cellule(l.fondsId, b)] ?? ""), 0);

  /** Lit le dossier de relevés le plus récent, sans rien écrire. */
  const lireLesReleves = () => {
    setErreur(null);
    setMessage(null);
    setApplique(0);
    demarrer(async () => {
      const res = await lireRelevesAction(date);
      if (!res.ok) {
        setLecture(null);
        setErreur(res.error);
        return;
      }
      setLecture(res.data);
      if (res.data.propositions.length === 0) {
        setErreur(
          `Aucun des ${res.data.fichiers} relevés du dossier ${res.data.dossier} ne se rattache ` +
            `à une case de la grille. Le détail est ci-dessous.`,
        );
      }
    });
  };

  /**
   * Lit un dossier de relevés CHOISI DANS LE NAVIGATEUR.
   *
   * POURQUOI UN DOSSIER ET NON DES FICHIERS. C'est le sous-dossier qui nomme
   * la banque — « 2026-10-01/BOA/… » — et un relevé ne le dit pas toujours
   * lui-même. En choisissant des fichiers un par un, on perdrait l'information
   * qui place le solde dans sa colonne.
   *
   * ENVOYE PAR BANQUE, PAS D'UN BLOC. Cinquante-trois relevés font quatre
   * mégaoctets, et l'hébergeur borne le corps d'une requête : un lot par
   * dossier reste petit, et l'écran peut dire où il en est.
   */
  const deposer = async (fichiers: FileList | null) => {
    if (!fichiers || fichiers.length === 0) return;
    setErreur(null);
    setMessage(null);
    setApplique(0);
    setLecture(null);

    const pdfs = Array.from(fichiers).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      setErreur("Aucun PDF dans ce dossier.");
      return;
    }

    // Le chemin relatif n'existe que si le navigateur a donné un DOSSIER.
    const chemin = (f: File) =>
      ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(
        /\\/g,
        "/",
      );
    const lots = new Map<string, File[]>();
    for (const f of pdfs) {
      const bouts = chemin(f).split("/").filter(Boolean);
      const banque = bouts.length >= 2 ? bouts[bouts.length - 2] : "";
      const lot = lots.get(banque) ?? [];
      lot.push(f);
      lots.set(banque, lot);
    }
    // LE DOSSIER DE DATE EST CELUI D'AU-DESSUS, quand il y en a un : c'est le
    // nom que l'écran affichera, et le gérant le reconnaîtra.
    const segments = chemin(pdfs[0]).split("/").filter(Boolean);
    const dossier = segments.length >= 3 ? segments[segments.length - 3] : "dépôt";

    const tous: ReleveBrut[] = [];
    let fait = 0;
    for (const [banque, lot] of lots) {
      setAvancement(`${++fait} / ${lots.size} — ${banque || "sans dossier"}`);
      const corps = new FormData();
      for (const f of lot) {
        corps.append("fichiers", f);
        corps.append("chemins", chemin(f));
      }
      try {
        const r = await fetch("/gestion-portefeuille/tresorerie/releves", {
          method: "POST",
          body: corps,
        });
        const json = await r.json();
        if (!r.ok) {
          setAvancement("");
          setErreur(json?.erreur ?? `Lecture impossible (${r.status}).`);
          return;
        }
        tous.push(...(json.lus as ReleveBrut[]));
      } catch (err) {
        setAvancement("");
        setErreur(
          `Lecture interrompue sur « ${banque} » : ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
    }
    setAvancement("");

    demarrer(async () => {
      const res = await rattacherRelevesAction(tous, dossier, date);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      setLecture(res.data);
      if (res.data.propositions.length === 0) {
        setErreur(
          `Aucun des ${res.data.fichiers} relevés déposés ne se rattache à une case de la grille. ` +
            `Le détail est ci-dessous.`,
        );
      }
    });
  };

  /**
   * Reporte les soldes lus dans les cases, et seulement dans celles-là.
   *
   * LES AUTRES CASES NE BOUGENT PAS. Un relevé manquant ne vaut pas un solde
   * nul : remettre à zéro ce qu'on n'a pas lu ferait disparaître la trésorerie
   * d'un fonds parce que son PDF n'était pas dans le dossier.
   */
  const appliquer = () => {
    if (!lecture) return;
    setValeurs((v) => {
      const suite = { ...v };
      for (const p of lecture.propositions) {
        if (p.solde === null) continue;
        suite[cellule(p.fondsId, p.etablissement)] = formaterSaisie(
          String(Math.round(p.solde)),
        );
      }
      return suite;
    });
    setApplique(lecture.propositions.length);
    setMessage(
      `${lecture.propositions.length} solde(s) reporté(s) dans la grille. ` +
        `Rien n'est enregistré tant que tu n'as pas cliqué « Enregistrer les soldes ».`,
    );
  };

  const enregistrer = () => {
    setErreur(null);
    setMessage(null);
    demarrer(async () => {
      // On n'envoie que les comptes RÉELLEMENT détenus par chaque fonds :
      // envoyer les autres à zéro créerait des soldes nuls là où il n'y a pas
      // de compte, et le point afficherait des colonnes vides pour ce fonds.
      const parFonds: Record<string, Record<string, number>> = {};
      for (const l of grille.lignes) {
        const soldes: Record<string, number> = {};
        for (const b of l.comptes) soldes[b] = lire(valeurs[cellule(l.fondsId, b)] ?? "");
        parFonds[l.fondsId] = soldes;
      }

      const res = await enregistrerSoldesMultiFondsAction(date, parFonds);
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      if (res.data.echecs.length > 0) {
        setErreur(
          `${res.data.enregistres} fonds enregistré(s), ${res.data.echecs.length} en échec : ` +
            res.data.echecs.join(" · "),
        );
        return;
      }
      setMessage(`Soldes enregistrés au ${res.data.as_of_date} pour ${res.data.enregistres} fonds.`);
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Saisir les soldes bancaires"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[min(1400px,95vw)] my-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Saisir les soldes</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Une colonne par banque, une ligne par fonds. Les cases barrées
              signalent qu&apos;un fonds n&apos;a pas de compte dans cette banque.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* LE DOSSIER DIT SA DATE, on ne la redemande pas : le bouton lit
                toujours le sous-dossier le plus récent de « Relevés ». */}
            <button
              type="button"
              onClick={lireLesReleves}
              disabled={enCours}
              className="px-3 py-1.5 text-[11px] font-medium border border-blue-300 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-50"
              title="Lit les relevés PDF déposés dans le dossier « Relevés », et propose les soldes."
            >
              {enCours ? "Lecture…" : "Lire relevé"}
            </button>
            {/* LE SECOND CHEMIN, pour le site en ligne : là-bas, le dossier
                « Relevés » du poste n'existe pas. Le navigateur donne le
                chemin relatif de chaque fichier quand on choisit un DOSSIER,
                et c'est lui qui nomme la banque. */}
            <label
              className={`px-3 py-1.5 text-[11px] font-medium border border-slate-300 text-slate-700 rounded cursor-pointer hover:bg-slate-50 ${
                enCours || avancement ? "opacity-50 pointer-events-none" : ""
              }`}
              title="Choisis le dossier de la date — celui qui contient un sous-dossier par banque."
            >
              {avancement ? `Lecture ${avancement}` : "Déposer un dossier…"}
              <input
                type="file"
                multiple
                accept="application/pdf,.pdf"
                className="hidden"
                // Propriétés non standard : seul ce couple fait proposer un
                // DOSSIER au lieu d'une liste de fichiers.
                {...{ webkitdirectory: "", directory: "" }}
                onChange={(e) => {
                  void deposer(e.target.files);
                  // On vide la saisie pour que redéposer le même dossier
                  // relance bien une lecture.
                  e.target.value = "";
                }}
              />
            </label>
            <label className="text-[11px] text-slate-600">
              Date des soldes
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ml-1.5 px-2 py-1 rounded border border-slate-300 text-[11px]"
              />
            </label>
          </div>
        </div>

        <div className="overflow-auto max-h-[60vh]">
          <table className="text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-100 text-left px-3 py-2 font-medium border-r border-slate-200 min-w-[14rem]">
                  Fonds
                </th>
                {grille.banques.map((b) => (
                  <th
                    key={b.cle}
                    className="px-2 py-2 font-medium text-right align-bottom leading-tight break-words w-[7.5rem] min-w-[7.5rem]"
                    title={b.cle}
                  >
                    {b.nom}
                    <span className="block text-[9px] font-normal text-slate-400">
                      {b.pays || "—"}
                      {b.sens ? ` · ${b.sens}` : ""}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold text-right border-l border-slate-300 bg-slate-200/70 w-[8rem] min-w-[8rem]">
                  Total fonds
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grille.lignes.map((l) => (
                <tr key={l.fondsId}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-r border-slate-200 font-medium text-slate-800">
                    {l.fondsNom}
                  </td>
                  {grille.banques.map((b) => {
                    const detenu = l.comptes.includes(b.cle);
                    if (!detenu) {
                      return (
                        <td
                          key={b.cle}
                          className="px-2 py-1.5 text-center text-slate-300 bg-slate-50"
                          title="Ce fonds n'a pas de compte dans cet établissement"
                        >
                          —
                        </td>
                      );
                    }
                    const k = cellule(l.fondsId, b.cle);
                    return (
                      <td key={b.cle} className="px-1 py-1">
                        <input
                          value={valeurs[k] ?? ""}
                          onChange={(e) =>
                            setValeurs((v) => ({ ...v, [k]: formaterSaisie(e.target.value) }))
                          }
                          inputMode="numeric"
                          className="w-full text-right px-1.5 py-1 rounded border border-slate-300 tabular-nums focus:border-blue-400 focus:outline-none"
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium border-l border-slate-300 bg-slate-50/80">
                    {fmt0.format(Math.round(totalFonds(l)))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-300">
              <tr>
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold border-r border-slate-200">
                  Total banque
                </td>
                {grille.banques.map((b) => (
                  <td key={b.cle} className="px-2 py-2 text-right tabular-nums font-semibold">
                    {fmt0.format(Math.round(total(b.cle)))}
                  </td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums font-bold border-l border-slate-300 bg-slate-200/70">
                  {fmt0.format(
                    Math.round(grille.lignes.reduce((s, l) => s + totalFonds(l), 0)),
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 space-y-2">
          {erreur && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {erreur}
            </p>
          )}
          {message && !erreur && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              {message}
            </p>
          )}
          {/* ── CE QUE LES RELEVES ONT DONNE ────────────────────────────
              Deux listes, et la seconde n'est pas un détail : un relevé qu'on
              ne sait pas placer doit se voir, sinon le gérant croit avoir tout
              repris alors qu'il manque une banque. Chaque ligne écartée dit
              POURQUOI, et ce qu'il y a à corriger. */}
          {lecture && (
            <div className="border border-slate-200 rounded overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-[11px] text-slate-700">
                  Dossier <strong>{lecture.dossier}</strong> · {lecture.fichiers} relevé(s) ·{" "}
                  <span className="text-emerald-700 font-medium">
                    {lecture.propositions.length} rattaché(s)
                  </span>
                  {lecture.ecartees.length > 0 && (
                    <>
                      {" · "}
                      <span className="text-amber-700 font-medium">
                        {lecture.ecartees.length} écarté(s)
                      </span>
                    </>
                  )}
                </span>
                {lecture.propositions.length > 0 && (
                  <button
                    type="button"
                    onClick={appliquer}
                    disabled={enCours}
                    className="px-3 py-1 text-[11px] font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
                  >
                    {applique > 0
                      ? `${applique} solde(s) reporté(s)`
                      : `Reporter ${lecture.propositions.length} solde(s) dans la grille`}
                  </button>
                )}
              </div>

              <div className="max-h-[30vh] overflow-auto">
                <table className="w-full text-[10px]">
                  <thead className="bg-white text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1 font-medium">Relevé</th>
                      <th className="text-left px-2 py-1 font-medium">Compte</th>
                      <th className="text-left px-2 py-1 font-medium">Banque</th>
                      <th className="text-left px-2 py-1 font-medium">Fonds</th>
                      <th className="text-right px-2 py-1 font-medium">Solde</th>
                      <th className="text-left px-2 py-1 font-medium">Au</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lecture.propositions.map((p) => (
                      <tr key={p.fichier} className="hover:bg-emerald-50/40">
                        <td className="px-2 py-1 text-slate-500">{p.fichier}</td>
                        <td className="px-2 py-1 text-slate-500">
                          {p.intitule}
                          {p.numeroCompte && (
                            <span className="block text-slate-400">{p.numeroCompte}</span>
                          )}
                        </td>
                        <td className="px-2 py-1">{p.etablissementNom}</td>
                        <td className="px-2 py-1">{p.fondsNom}</td>
                        <td className="px-2 py-1 text-right tabular-nums font-medium">
                          {p.solde === null ? "—" : fmt0.format(Math.round(p.solde))}
                          {/* L'ECART AU DISPONIBLE EXPLIQUE LA MOITIE DES
                              RAPPROCHEMENTS QUI COINCENT : un chèque en cours
                              d'encaissement, une opération du jour pas encore
                              comptabilisée. On retient le COMPTABLE et on
                              montre l'autre. */}
                          {p.soldeDisponible !== null &&
                            p.solde !== null &&
                            Math.round(p.soldeDisponible) !== Math.round(p.solde) && (
                              <span className="block text-slate-400 font-normal">
                                dispo. {fmt0.format(Math.round(p.soldeDisponible))}
                              </span>
                            )}
                        </td>
                        <td className="px-2 py-1 text-slate-500 tabular-nums">
                          {p.dateSolde ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {lecture.ecartees.map((p) => (
                      <tr key={p.fichier} className="bg-amber-50/50">
                        <td className="px-2 py-1 text-slate-500">{p.fichier}</td>
                        <td className="px-2 py-1 text-slate-500" colSpan={4}>
                          <span className="text-amber-800">{p.probleme}</span>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-400">
                          {p.solde === null ? "—" : fmt0.format(Math.round(p.solde))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={enregistrer}
              disabled={enCours}
              className="px-4 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Enregistrer les soldes"}
            </button>
            <button
              type="button"
              onClick={onFermer}
              className="px-4 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

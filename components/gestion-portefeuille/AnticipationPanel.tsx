"use client";

// === Anticipations de cours ===
//
// Cinq méthodes côte à côte, une méthode retenue. Les autres restent visibles :
// l'écart entre elles est une information, pas du bruit.

import { useState } from "react";

import {
  EXPLICATION_METHODE,
  LIBELLE_METHODE,
  METHODES,
  type AnticipationTitre,
  type MethodeCible,
  type ProjectionFonds,
  type TableauAnticipation,
} from "@/app/gestion-portefeuille/anticipation-types";

const fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const fmt2 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const montant = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : fmt0.format(Math.round(v));
const nb1 = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : fmt1.format(v);
const pct = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : fmt2.format(v * 100) + " %";
const pctSigne = (v: number | null) =>
  v === null || !Number.isFinite(v)
    ? "—"
    : (v > 0 ? "+" : "") + fmt1.format(v * 100) + " %";

const couleur = (v: number | null) =>
  v === null || !Number.isFinite(v)
    ? "text-slate-500"
    : v > 0.05
      ? "text-emerald-600"
      : v < -0.05
        ? "text-rose-600"
        : "text-slate-600";

const dateFr = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};

/** Colonne d'entrée propre à une méthode : ce qui a servi à calculer sa cible.
 *
 *  Chaque méthode a ses propres données — un BPA n'éclaire pas une moyenne
 *  mobile. Les afficher toutes ensemble noierait l'information ; les afficher
 *  par méthode rend le calcul vérifiable ligne à ligne. */
type ColonneEntree = {
  titre: string;
  /** Précision sous l'en-tête. */
  note?: string;
  valeur: (t: AnticipationTitre) => string;
  /** Coloration selon le signe, pour les variations. */
  signe?: (t: AnticipationTitre) => number | null;
};

function colonnesDe(m: MethodeCible): ColonneEntree[] {
  switch (m) {
    case "annuelle":
      return [
        {
          titre: "Saisonnalité",
          note: "médiane → 31/12",
          valeur: (t) => pctSigne(t.saisonnaliteResiduelle),
          signe: (t) => t.saisonnaliteResiduelle,
        },
        {
          // Une médiane sur trois exercices ne vaut pas une médiane sur dix-huit.
          titre: "Années",
          note: "observées",
          valeur: (t) => (t.anneesObservees > 0 ? String(t.anneesObservees) : "—"),
        },
        {
          titre: "Momentum",
          note: "résiduel",
          valeur: (t) => pctSigne(t.momentumResiduel),
          signe: (t) => t.momentumResiduel,
        },
        {
          titre: "Dividende",
          note: "à détacher",
          valeur: (t) => (t.dividendeADetacher > 0 ? montant(t.dividendeADetacher) : "—"),
        },
        {
          titre: "Ancrage",
          note: "fondamental",
          valeur: (t) => montant(t.cibles.mix.cible),
        },
      ];

    case "per":
      return [
        { titre: "BPA publié", valeur: (t) => montant(t.bpa) },
        { titre: "PER publié", valeur: (t) => nb1(t.per) },
        {
          titre: "PER médian",
          note: "du secteur",
          valeur: (t) => nb1(t.perMedianSecteur),
        },
        {
          titre: "Écart au secteur",
          valeur: (t) =>
            t.per !== null && t.perMedianSecteur
              ? pctSigne(t.per / t.perMedianSecteur - 1)
              : "—",
          // Un PER sous la médiane est un signe favorable : la couleur se lit
          // donc à l'envers de la variation.
          signe: (t) =>
            t.per !== null && t.perMedianSecteur
              ? -(t.per / t.perMedianSecteur - 1)
              : null,
        },
        {
          titre: "PER médian",
          note: "du marché · repère",
          valeur: (t) => nb1(t.perMedianMarche),
        },
      ];

    case "rendement":
      return [
        { titre: "Dividende / action", valeur: (t) => montant(t.dpa) },
        { titre: "Rendement", valeur: (t) => pct(t.rendement) },
        {
          titre: "Rendement médian",
          note: "du marché",
          valeur: (t) => pct(t.rendementMedianMarche),
        },
        {
          titre: "Écart au marché",
          valeur: (t) =>
            t.rendement !== null && t.rendementMedianMarche
              ? pctSigne(t.rendement / t.rendementMedianMarche - 1)
              : "—",
          signe: (t) =>
            t.rendement !== null && t.rendementMedianMarche
              ? t.rendement / t.rendementMedianMarche - 1
              : null,
        },
      ];

    case "projection":
      return [
        { titre: "BPA publié", valeur: (t) => montant(t.bpa) },
        { titre: "BPA estimé", valeur: (t) => montant(t.bpaProjete) },
        {
          titre: "Croissance",
          note: "reportée",
          valeur: (t) => pctSigne(t.croissanceProjetee),
          signe: (t) => t.croissanceProjetee,
        },
        {
          titre: "Base",
          note: "publication",
          valeur: (t) => t.periodeProjection ?? "—",
        },
        {
          titre: "PER médian",
          note: "du secteur",
          valeur: (t) => nb1(t.perMedianSecteur),
        },
      ];

    case "technique":
      return [
        { titre: "MM50", valeur: (t) => montant(t.mm50) },
        { titre: "MM200", valeur: (t) => montant(t.mm200) },
        {
          titre: "Tendance",
          note: "MM50 / MM200",
          valeur: (t) =>
            t.mm50 !== null && t.mm200 ? pctSigne(t.mm50 / t.mm200 - 1) : "—",
          signe: (t) => (t.mm50 !== null && t.mm200 ? t.mm50 / t.mm200 - 1 : null),
        },
        {
          titre: "Cours / MM200",
          valeur: (t) => (t.mm200 ? pctSigne(t.cours / t.mm200 - 1) : "—"),
          signe: (t) => (t.mm200 ? t.cours / t.mm200 - 1 : null),
        },
      ];

    case "mix":
      return [
        { titre: "PER sectoriel", valeur: (t) => montant(t.cibles.per.cible) },
        { titre: "Rendement", valeur: (t) => montant(t.cibles.rendement.cible) },
        { titre: "Projection", valeur: (t) => montant(t.cibles.projection.cible) },
        { titre: "Technique", valeur: (t) => montant(t.cibles.technique.cible) },
        {
          titre: "Méthodes",
          note: "retenues",
          valeur: (t) =>
            String(
              (["per", "rendement", "projection", "technique"] as const).filter(
                (k) => t.cibles[k].cible !== null,
              ).length,
            ),
        },
      ];
  }
}

export default function AnticipationPanel({
  tableau,
}: {
  tableau: TableauAnticipation;
}) {
  // La cible 31/12 est l'entrée par défaut : c'est l'horizon sur lequel le
  // fonds est jugé. Les autres méthodes en sont les ingrédients.
  const [methode, setMethode] = useState<MethodeCible>("annuelle");
  const [detenusSeuls, setDetenusSeuls] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [secteur, setSecteur] = useState("");
  /** Masque les valeurs que la méthode ne sait pas chiffrer : sur un axe
   *  donné, une ligne sans cible n'apporte rien au classement. */
  const [chiffrablesSeules, setChiffrablesSeules] = useState(false);

  // Secteurs présents, avec leur effectif : le comité choisit sur une liste
  // réelle, pas sur une nomenclature théorique.
  const secteurs = [...new Set(tableau.titres.map((t) => t.secteur))]
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((s) => ({
      nom: s,
      n: tableau.titres.filter((t) => t.secteur === s).length,
    }));

  const q = recherche.trim().toLowerCase();
  const lignes = tableau.titres.filter((t) => {
    if (detenusSeuls && !t.detenu) return false;
    if (secteur && t.secteur !== secteur) return false;
    if (chiffrablesSeules && t.cibles[methode].cible === null) return false;
    if (q && !`${t.code} ${t.libelle}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // Classement par potentiel de la méthode retenue : ce qui promet le plus
  // d'abord, c'est l'ordre de lecture du comité.
  const triees = [...lignes].sort((a, b) => {
    const pa = a.cibles[methode].potentiel;
    const pb = b.cibles[methode].potentiel;
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pb - pa;
  });

  const applicables = triees.filter((t) => t.cibles[methode].cible !== null);
  const colonnes = colonnesDe(methode);

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Analyse et anticipations de cours
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Six méthodes appliquées à chaque valeur de la cote, détenue ou non —
              anticiper sert d&apos;abord à décider d&apos;entrer sur un titre
              qu&apos;on n&apos;a pas. Cours arrêtés au {dateFr(tableau.dateReference)}.
            </p>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <div>
            <label
              htmlFor="anticip-recherche"
              className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1"
            >
              Rechercher
            </label>
            <input
              id="anticip-recherche"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Code ou nom"
              className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-xs w-44"
            />
          </div>
          <div>
            <label
              htmlFor="anticip-secteur"
              className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1"
            >
              Secteur
            </label>
            <select
              id="anticip-secteur"
              value={secteur}
              onChange={(e) => setSecteur(e.target.value)}
              className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-xs w-56"
            >
              <option value="">Tous les secteurs</option>
              {secteurs.map((s) => (
                <option key={s.nom} value={s.nom}>
                  {s.nom} ({s.n})
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-500 pb-1.5">
            <input
              type="checkbox"
              checked={detenusSeuls}
              onChange={(e) => setDetenusSeuls(e.target.checked)}
              className="accent-blue-500"
            />
            Lignes détenues
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-500 pb-1.5">
            <input
              type="checkbox"
              checked={chiffrablesSeules}
              onChange={(e) => setChiffrablesSeules(e.target.checked)}
              className="accent-blue-500"
            />
            Cible chiffrable
          </label>
          {(recherche || secteur || detenusSeuls || chiffrablesSeules) && (
            <button
              type="button"
              onClick={() => {
                setRecherche("");
                setSecteur("");
                setDetenusSeuls(false);
                setChiffrablesSeules(false);
              }}
              className="text-[11px] text-blue-700 hover:text-blue-900 transition pb-1.5"
            >
              Réinitialiser
            </button>
          )}
          <span className="text-[11px] text-slate-500 pb-1.5">
            {lignes.length} / {tableau.titres.length} valeur(s)
          </span>
        </div>

        {/* Choix de la méthode retenue */}
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
            Méthode retenue
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {METHODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethode(m)}
                className={`px-3 py-1.5 rounded text-[11px] font-medium transition ${
                  m === methode
                    ? "bg-blue-50 text-blue-700 border border-blue-300"
                    : "text-slate-500 border border-slate-200 hover:text-slate-900 hover:border-slate-400"
                }`}
              >
                {LIBELLE_METHODE[m]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-2 max-w-4xl leading-relaxed">
            {EXPLICATION_METHODE[methode]}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Tuile libelle="PER médian du marché" valeur={nb1(tableau.perMedianMarche)} />
          <Tuile
            libelle="Rendement médian"
            valeur={pct(tableau.rendementMedianMarche)}
          />
          <Tuile
            libelle="Valeurs chiffrables"
            valeur={`${applicables.length} / ${triees.length}`}
            detail={LIBELLE_METHODE[methode]}
          />
          <Tuile
            libelle="Potentiel médian"
            valeur={(() => {
              const p = applicables
                .map((t) => t.cibles[methode].potentiel)
                .filter((x): x is number => x !== null)
                .sort((a, b) => a - b);
              if (p.length === 0) return "—";
              const m = Math.floor(p.length / 2);
              return pctSigne(p.length % 2 ? p[m] : (p[m - 1] + p[m]) / 2);
            })()}
          />
        </div>
      </div>

      {/* Projection du fonds : la seule lecture qui intéresse un gérant tenu
          par un objectif annuel. Les cibles par titre en sont le détail. */}
      {methode === "annuelle" && <BandeauProjection p={tableau.projection} />}

      {tableau.avertissements.length > 0 && (
        <div className="space-y-1.5">
          {tableau.avertissements.map((a) => (
            <p
              key={a}
              className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2"
            >
              {a}
            </p>
          ))}
        </div>
      )}

      {/* Tableau propre à la méthode retenue */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-700">
            {LIBELLE_METHODE[methode]}
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Les colonnes sont celles qui entrent dans ce calcul : la cible se vérifie
            sur la ligne, sans quitter le tableau.
          </p>
        </div>
        {triees.length === 0 && (
          <p className="px-4 py-8 text-sm text-slate-500 text-center">
            Aucune valeur ne correspond aux filtres.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">Titre</th>
                <th className="text-left px-3 py-2.5 font-medium">Secteur</th>
                <th className="text-right px-3 py-2.5 font-medium">Cours</th>
                {colonnes.map((c) => (
                  <th key={c.titre} className="text-right px-3 py-2.5 font-medium">
                    {c.titre}
                    {c.note && (
                      <span className="block text-[9px] font-normal text-slate-600">
                        {c.note}
                      </span>
                    )}
                  </th>
                ))}
                <th className="text-right px-3 py-2.5 font-medium text-blue-700 bg-blue-50">
                  Cours cible
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-blue-700 bg-blue-50">
                  Potentiel
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {triees.map((t) => {
                const retenue = t.cibles[methode];
                return (
                  <tr
                    key={t.code}
                    className={`hover:bg-slate-50 ${t.detenu ? "" : "opacity-70"}`}
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setDetail(detail === t.code ? null : t.code)}
                        className="text-left"
                      >
                        <span className="text-slate-500 mr-1.5 inline-block w-2">
                          {detail === t.code ? "▾" : "▸"}
                        </span>
                        <span className="font-mono text-slate-800">{t.code}</span>
                        <span className="text-slate-500 ml-2">{t.libelle}</span>
                        {t.detenu && (
                          <span className="ml-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                            détenu
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {/* Cliquable : filtrer sur le secteur d'une ligne est le
                          geste naturel quand on compare des comparables. */}
                      <button
                        type="button"
                        onClick={() =>
                          setSecteur(secteur === t.secteur ? "" : t.secteur)
                        }
                        title={
                          secteur === t.secteur
                            ? "Retirer le filtre"
                            : `Filtrer sur ${t.secteur}`
                        }
                        className={`text-left transition ${
                          secteur === t.secteur
                            ? "text-blue-700"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        {t.secteur}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {montant(t.cours)}
                    </td>
                    {colonnes.map((c) => {
                      const s = c.signe?.(t) ?? null;
                      return (
                        <td
                          key={c.titre}
                          className={`px-3 py-2 text-right tabular-nums ${
                            c.signe ? couleur(s) : "text-slate-500"
                          }`}
                        >
                          {c.valeur(t)}
                        </td>
                      );
                    })}
                    <td
                      title={retenue.reserve ?? undefined}
                      className="px-3 py-2 text-right tabular-nums bg-blue-50 text-slate-900 font-semibold"
                    >
                      {retenue.cible === null ? (
                        <span className="text-slate-600 font-normal">n.a.</span>
                      ) : (
                        montant(retenue.cible)
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums bg-blue-50 font-semibold ${couleur(retenue.potentiel)}`}
                    >
                      {pctSigne(retenue.potentiel)}
                    </td>
                  </tr>
                );
              })}
              {triees.map((t) =>
                detail === t.code ? (
                  <tr key={`${t.code}-detail`} className="bg-slate-50">
                    <td colSpan={colonnes.length + 5} className="px-3 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-[11px]">
                        <Fait libelle="BPA publié" valeur={montant(t.bpa)} />
                        <Fait libelle="PER publié" valeur={nb1(t.per)} />
                        <Fait
                          libelle="PER médian marché"
                          valeur={nb1(t.perMedianMarche)}
                        />
                        <Fait
                          libelle="PER médian secteur"
                          valeur={nb1(t.perMedianSecteur)}
                        />
                        <Fait libelle="Dividende / action" valeur={montant(t.dpa)} />
                        <Fait libelle="Rendement" valeur={pct(t.rendement)} />
                        <Fait
                          libelle="BPA estimé"
                          valeur={montant(t.bpaProjete)}
                          detail={t.periodeProjection ?? undefined}
                        />
                        <Fait
                          libelle="Croissance projetée"
                          valeur={pctSigne(t.croissanceProjetee)}
                        />
                        <Fait libelle="MM50 / MM200" valeur={`${montant(t.mm50)} / ${montant(t.mm200)}`} />
                      </div>
                      {METHODES.some((m) => t.cibles[m].reserve) && (
                        <ul className="mt-2 space-y-0.5">
                          {METHODES.filter((m) => t.cibles[m].reserve).map((m) => (
                            <li key={m} className="text-[10px] text-amber-600">
                              <span className="text-slate-500">{LIBELLE_METHODE[m]}</span>{" "}
                              — {t.cibles[m].reserve}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Les méthodes ne convergent pas, et c&apos;est l&apos;intérêt :
        l&apos;écart entre elles dit ce que le marché price déjà et ce qu&apos;il
        ignore. Une cible n&apos;est pas une prévision — elle dit ce que vaudrait le
        titre SI l&apos;hypothèse de la méthode se vérifiait. Cliquez sur une ligne
        pour voir les données d&apos;entrée et les méthodes non applicables.
      </p>
    </div>
  );
}

/**
 * Projection du fonds au 31 décembre, confrontée à son objectif.
 *
 * Le détail par titre sert le choix des lignes ; ce bandeau sert la décision
 * de gestion : l'objectif annuel est-il atteignable en laissant courir le
 * portefeuille tel qu'il est ?
 */
function BandeauProjection({ p }: { p: ProjectionFonds }) {
  const atteint =
    p.ecartObjectif === null ? null : p.ecartObjectif >= 0;
  return (
    <div
      className={`rounded-lg border p-4 ${
        atteint === null
          ? "bg-white border-slate-200"
          : atteint
            ? "bg-emerald-50 border-emerald-200"
            : "bg-amber-50 border-amber-200"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          Projection du fonds au 31 décembre
        </h4>
        <span className="text-[11px] text-slate-500">
          {p.joursRestants} jour(s) restants · {pct(p.fractionRestante)} de
          l&apos;exercice
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
        <Tuile
          libelle="Performance acquise"
          valeur={pctSigne(p.performanceAcquise)}
          detail="VL depuis le 31/12 précédent"
        />
        <Tuile
          libelle="Poche actions"
          valeur={pctSigne(p.performanceResiduelle)}
          detail={
            p.poidsActions === null
              ? "d'ici le 31/12"
              : `d'ici le 31/12 · ${pct(p.poidsActions)} de l'actif`
          }
        />
        <Tuile
          libelle="Performance projetée"
          valeur={pctSigne(p.performanceProjetee)}
          detail="acquise + contribution actions"
        />
        <Tuile
          libelle="Objectif annuel"
          valeur={p.objectifAnnuel === null ? "non renseigné" : pct(p.objectifAnnuel)}
        />
        <Tuile
          libelle="Écart à l'objectif"
          valeur={
            p.ecartObjectif === null
              ? "—"
              : (p.ecartObjectif > 0 ? "+" : "") +
                fmt2.format(p.ecartObjectif * 100) +
                " pts"
          }
        />
      </div>

      <div className="text-[11px] text-slate-500 mt-2.5">
        Poche actions projetée : {montant(p.valorisationActuelle)} →{" "}
        {montant(p.valorisationProjetee)} FCFA · {pct(p.couverture)} des lignes
        chiffrées.
      </div>

      {p.avertissement && (
        <p className="text-[11px] text-amber-700 mt-2">{p.avertissement}</p>
      )}
    </div>
  );
}

function Fait({
  libelle,
  valeur,
  detail,
}: {
  libelle: string;
  valeur: string;
  detail?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-600">{libelle}</div>
      <div className="text-slate-600 tabular-nums">{valeur}</div>
      {detail && <div className="text-[10px] text-slate-600">{detail}</div>}
    </div>
  );
}

function Tuile({
  libelle,
  valeur,
  detail,
}: {
  libelle: string;
  valeur: string;
  detail?: string;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{libelle}</div>
      <div className="text-sm text-slate-800 mt-0.5 tabular-nums">{valeur}</div>
      {detail && <div className="text-[10px] text-slate-500 mt-0.5">{detail}</div>}
    </div>
  );
}

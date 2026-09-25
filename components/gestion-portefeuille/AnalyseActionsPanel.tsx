"use client";

// === Compartiment actions BRVM ===
//
// Même grammaire que les autres onglets d'analyse : un bandeau d'indicateurs,
// des filtres qui ne rechargent rien, un pivot, des graphiques. Ce qui change,
// c'est la question : la cote est petite — une cinquantaine de valeurs — mais
// très concentrée, et ce qu'un gérant y cherche n'est pas « combien » mais
// « où est le poids, où est la liquidité, et qu'est-ce qui a bougé ».

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import {
  agregerAction,
  assiseAction,
  METRIQUES_ACTION,
  METRIQUES_ACTION_PIVOT,
  type LigneAction,
  type MetriqueAction,
  type UniteAction,
} from "@/app/gestion-portefeuille/analyse-actions-types";
import {
  aideSection,
  BoutonFiltre,
  carte,
  couleurDe,
  couleurDegradee,
  francsEnMilliards,
  Indicateur,
  nf0,
  nf1,
  nf2,
  Pivot,
  pourcent,
  pourcentSigne,
  RangeeFiltres,
  teintePerf,
  titreSection,
  tooltip,
  type AxePivot,
} from "./analyse-ui";

function formaterAction(v: number, u: UniteAction): React.ReactNode {
  switch (u) {
    case "milliardsF":
      return francsEnMilliards(v);
    case "millionsF":
      return nf0.format(v / 1_000_000);
    case "pourcent":
      return nf2.format(v);
    case "perf":
      return <span className={teintePerf(v)}>{pourcentSigne(v, 1)}</span>;
    case "entier":
      return nf0.format(v);
    case "ratio":
      return nf1.format(v);
  }
}

const uniteNote = (u: UniteAction): string => {
  if (u === "milliardsF") return " En milliards de FCFA.";
  if (u === "millionsF") return " En millions de FCFA par séance.";
  return "";
};

// === TRI DU TABLEAU DÉTAILLÉ ===

type Colonne = {
  cle: string;
  titre: string;
  /** La valeur sur laquelle on trie. Null se range toujours en dernier. */
  valeur: (l: LigneAction) => number | string | null;
  rendu: (l: LigneAction, univers: LigneAction[]) => React.ReactNode;
  aDroite?: boolean;
};

const COLONNES: Colonne[] = [
  {
    cle: "code",
    titre: "Valeur",
    valeur: (l) => l.code,
    rendu: (l) => (
      <span>
        <span className="font-medium text-slate-900">{l.code}</span>
        <span className="text-slate-500 ml-1.5">{l.nom}</span>
      </span>
    ),
  },
  { cle: "secteur", titre: "Secteur", valeur: (l) => l.secteur, rendu: (l) => l.secteur },
  { cle: "pays", titre: "Pays", valeur: (l) => l.pays, rendu: (l) => l.pays },
  {
    cle: "cours",
    titre: "Cours",
    valeur: (l) => l.cours,
    rendu: (l) => nf0.format(l.cours),
    aDroite: true,
  },
  {
    cle: "jour",
    titre: "Jour",
    valeur: (l) => l.varJour,
    // `changePercent` sort deja de `getLatestSikaQuote` en POINTS DE POURCENT :
    // le remultiplier par cent donnerait des seances a 750 %.
    rendu: (l) => (
      <span className={teintePerf(l.varJour)}>{pourcentSigne(l.varJour, 2)}</span>
    ),
    aDroite: true,
  },
  {
    cle: "ytd",
    titre: "Janv.",
    valeur: (l) => l.perf.ytd,
    rendu: (l) => <span className={teintePerf(l.perf.ytd)}>{pourcentSigne(l.perf.ytd, 1)}</span>,
    aDroite: true,
  },
  {
    cle: "a1",
    titre: "1 an",
    valeur: (l) => l.perf.a1,
    rendu: (l) => <span className={teintePerf(l.perf.a1)}>{pourcentSigne(l.perf.a1, 1)}</span>,
    aDroite: true,
  },
  {
    cle: "a3",
    titre: "3 ans",
    valeur: (l) => l.perf.a3,
    rendu: (l) => <span className={teintePerf(l.perf.a3)}>{pourcentSigne(l.perf.a3, 1)}</span>,
    aDroite: true,
  },
  {
    cle: "capi",
    titre: "Capi. (Mds)",
    valeur: (l) => l.capitalisation,
    rendu: (l) => francsEnMilliards(l.capitalisation),
    aDroite: true,
  },
  {
    cle: "poids",
    titre: "Poids",
    valeur: (l) => l.capitalisation,
    rendu: (l, univers) => {
      const total = univers.reduce((t, x) => t + x.capitalisation, 0);
      return total > 0 ? `${nf1.format((l.capitalisation / total) * 100)} %` : "·";
    },
    aDroite: true,
  },
  {
    cle: "per",
    titre: "PER",
    valeur: (l) => l.per,
    rendu: (l) => (l.per === null ? <span className="text-slate-300">·</span> : nf1.format(l.per)),
    aDroite: true,
  },
  {
    cle: "rendement",
    titre: "Rendement",
    valeur: (l) => l.rendement,
    rendu: (l) =>
      l.rendement === null ? <span className="text-slate-300">·</span> : pourcent(l.rendement),
    aDroite: true,
  },
  {
    cle: "capitaux",
    titre: "Capitaux/séance",
    valeur: (l) => l.capitauxMoyens,
    rendu: (l) => nf0.format(l.capitauxMoyens / 1_000_000),
    aDroite: true,
  },
  {
    cle: "seances",
    titre: "Séances/30",
    valeur: (l) => l.seancesTraitees,
    rendu: (l) => (
      <span className={l.seancesTraitees < 10 ? "text-amber-700" : undefined}>
        {nf0.format(l.seancesTraitees)}
      </span>
    ),
    aDroite: true,
  },
  {
    cle: "vol",
    titre: "Volatilité",
    valeur: (l) => l.volatilite,
    rendu: (l) =>
      l.volatilite === null ? <span className="text-slate-300">·</span> : pourcent(l.volatilite, 1),
    aDroite: true,
  },
];

/** Comparateur stable : les absences se rangent toujours en queue, dans les
 *  deux sens de tri. Les remonter en tête d'un tri décroissant ferait passer
 *  « je ne sais pas » pour « le plus élevé ». */
function comparer(
  a: number | string | null,
  b: number | string | null,
  croissant: boolean,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const signe = croissant ? 1 : -1;
  if (typeof a === "string" || typeof b === "string") {
    return String(a).localeCompare(String(b), "fr") * signe;
  }
  return (a - b) * signe;
}

// === PANNEAU ===

const SEUIL_LIQUIDITE = 10;

export default function AnalyseActionsPanel({
  lignes,
  dateReference,
}: {
  lignes: LigneAction[];
  dateReference: string;
}) {
  const secteurs = useMemo(
    () => [...new Set(lignes.map((l) => l.secteur))].sort((a, b) => a.localeCompare(b, "fr")),
    [lignes],
  );
  const paysListe = useMemo(
    () => [...new Set(lignes.map((l) => l.pays))].sort((a, b) => a.localeCompare(b, "fr")),
    [lignes],
  );

  const [secteursExclus, setSecteursExclus] = useState<Set<string>>(() => new Set<string>());
  const [paysExclus, setPaysExclus] = useState<Set<string>>(() => new Set<string>());
  const [liquidesSeules, setLiquidesSeules] = useState(false);
  const [metrique, setMetrique] = useState<MetriqueAction>("capitalisation");
  const [transpose, setTranspose] = useState(false);
  const [tri, setTri] = useState<{ cle: string; croissant: boolean }>({
    cle: "capi",
    croissant: false,
  });

  const basculer = (
    valeur: string,
    ensemble: Set<string>,
    poser: (s: Set<string>) => void,
  ) => {
    const suivant = new Set(ensemble);
    if (suivant.has(valeur)) suivant.delete(valeur);
    else suivant.add(valeur);
    poser(suivant);
  };

  const filtrees = useMemo(
    () =>
      lignes.filter(
        (l) =>
          !secteursExclus.has(l.secteur) &&
          !paysExclus.has(l.pays) &&
          (!liquidesSeules || l.seancesTraitees >= SEUIL_LIQUIDITE),
      ),
    [lignes, secteursExclus, paysExclus, liquidesSeules],
  );

  const unite = METRIQUES_ACTION[metrique].unite;

  // Axes du pivot. Ils s'échangent : « la capitalisation par secteur et par
  // pays » et « par pays et par secteur » répondent à deux questions
  // différentes, et l'une ne se lit pas dans l'autre.
  const axeSecteurs: AxePivot[] = useMemo(
    () =>
      secteurs
        .filter((s) => filtrees.some((l) => l.secteur === s))
        .map((s, i) => ({ cle: s, titre: s, couleur: couleurDe(i) })),
    [secteurs, filtrees],
  );
  const axePays: AxePivot[] = useMemo(
    () =>
      paysListe
        .filter((p) => filtrees.some((l) => l.pays === p))
        .map((p, i) => ({ cle: p, titre: p, couleur: couleurDegradee(i, paysListe.length) })),
    [paysListe, filtrees],
  );

  const assiseM = assiseAction(metrique, filtrees);

  // === Graphique : capitalisation par secteur, empilée par pays ===
  const barresSecteur = useMemo(
    () =>
      axeSecteurs.map((s) => {
        const ligne: Record<string, number | string> = { secteur: s.titre };
        for (const p of axePays) {
          const v = filtrees
            .filter((l) => l.secteur === s.cle && l.pays === p.cle)
            .reduce((t, l) => t + l.capitalisation, 0);
          ligne[p.cle] = v / 1_000_000_000;
        }
        return ligne;
      }),
    [axeSecteurs, axePays, filtrees],
  );

  // === Graphique : performance par secteur ===
  const perfSecteur = useMemo(
    () =>
      axeSecteurs
        .map((s) => ({
          secteur: s.titre,
          ytd: agregerAction("perfYtd", filtrees.filter((l) => l.secteur === s.cle), filtrees),
        }))
        .filter((x) => x.ytd !== null)
        .sort((a, b) => (b.ytd as number) - (a.ytd as number)),
    [axeSecteurs, filtrees],
  );

  // === Graphique : valorisation, PER contre rendement ===
  const nuage = useMemo(
    () =>
      filtrees
        .filter((l) => l.per !== null && l.rendement !== null)
        .map((l) => ({
          x: l.per as number,
          y: l.rendement as number,
          z: l.capitalisation / 1_000_000_000,
          code: l.code,
          nom: l.nom,
        })),
    [filtrees],
  );

  /**
   * Graduations du PER, en ÉCHELLE LOGARITHMIQUE.
   *
   * Le référentiel ne borne volontairement pas le PER — celui d'UNILEVER
   * dépasse 700, et ce n'est pas une erreur : la société ne gagne presque rien
   * au regard de sa valorisation, et le masquer afficherait « donnée
   * indisponible », ce qui serait faux. Mais sur une échelle linéaire, ce seul
   * point étire l'axe jusqu'à 800 et tasse les quarante autres valeurs, toutes
   * entre 3 et 30, dans le premier centimètre.
   *
   * Le logarithme garde TOUS les points et rend l'écart qui intéresse : celui
   * entre un PER de 5 et un PER de 15, pas celui entre 300 et 700.
   */
  const graduationsPer = useMemo(() => {
    if (nuage.length === 0) return [] as number[];
    const min = Math.min(...nuage.map((n) => n.x));
    const max = Math.max(...nuage.map((n) => n.x));
    return [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 500, 1000].filter(
      (t) => t >= min * 0.85 && t <= max * 1.15,
    );
  }, [nuage]);

  /**
   * CONTRIBUTION, et non performance.
   *
   * Un titre qui prend 40 % en pesant 0,3 % de la cote ne déplace pas le
   * marché ; un poids lourd qui prend 5 % le déplace beaucoup. Le classement
   * des performances récompense le premier et masque le second — le classement
   * des contributions dit ce qui s'est réellement passé.
   */
  const contributions = useMemo(() => {
    const total = filtrees.reduce((t, l) => t + l.capitalisation, 0);
    if (!(total > 0)) return [];
    return filtrees
      .filter((l) => l.perf.ytd !== null)
      .map((l) => ({
        code: l.code,
        nom: l.nom,
        contribution: (l.capitalisation / total) * (l.perf.ytd as number),
      }))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 12)
      .sort((a, b) => b.contribution - a.contribution);
  }, [filtrees]);

  const triees = useMemo(() => {
    const col = COLONNES.find((c) => c.cle === tri.cle) ?? COLONNES[0];
    return [...filtrees].sort((a, b) => comparer(col.valeur(a), col.valeur(b), tri.croissant));
  }, [filtrees, tri]);

  const capiTotale = filtrees.reduce((t, l) => t + l.capitalisation, 0);

  return (
    <div className="space-y-4">
      {/* ====== FILTRES ====== */}
      <section className={`${carte} p-3 space-y-2.5`}>
        <RangeeFiltres libelle="Secteurs">
          {secteurs.map((s, i) => (
            <BoutonFiltre
              key={s}
              actif={!secteursExclus.has(s)}
              couleur={couleurDe(i)}
              onClick={() => basculer(s, secteursExclus, setSecteursExclus)}
            >
              {s}
            </BoutonFiltre>
          ))}
          {secteursExclus.size > 0 && (
            <button
              type="button"
              onClick={() => setSecteursExclus(new Set<string>())}
              className="text-[11px] text-blue-700 hover:underline ml-1"
            >
              tout réafficher
            </button>
          )}
        </RangeeFiltres>

        <RangeeFiltres libelle="Pays">
          {paysListe.map((p, i) => (
            <BoutonFiltre
              key={p}
              actif={!paysExclus.has(p)}
              couleur={couleurDegradee(i, paysListe.length)}
              onClick={() => basculer(p, paysExclus, setPaysExclus)}
            >
              {p}
            </BoutonFiltre>
          ))}
          {paysExclus.size > 0 && (
            <button
              type="button"
              onClick={() => setPaysExclus(new Set<string>())}
              className="text-[11px] text-blue-700 hover:underline ml-1"
            >
              tout réafficher
            </button>
          )}
        </RangeeFiltres>

        <RangeeFiltres libelle="Liquidité">
          <BoutonFiltre actif={!liquidesSeules} onClick={() => setLiquidesSeules(false)}>
            Toutes les valeurs
          </BoutonFiltre>
          <BoutonFiltre
            actif={liquidesSeules}
            onClick={() => setLiquidesSeules(true)}
            titre={`Valeurs traitées au moins ${SEUIL_LIQUIDITE} séances sur les 30 dernières. Une moyenne de place calculée sur des titres qui ne cotent pas décrit un marché qui n'existe pas.`}
          >
            Traitées ≥ {SEUIL_LIQUIDITE} séances / 30
          </BoutonFiltre>
        </RangeeFiltres>
      </section>

      {filtrees.length === 0 ? (
        <p className={`${carte} px-3 py-8 text-center text-xs text-slate-500`}>
          Aucune valeur ne passe ces filtres.
        </p>
      ) : (
        <>
          {/* ====== INDICATEURS ====== */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Indicateur libelle="Valeurs" valeur={nf0.format(filtrees.length)} />
            <Indicateur
              libelle="Capitalisation"
              valeur={`${francsEnMilliards(capiTotale)} Mds`}
              accent
              aide="Somme des capitalisations de l'univers retenu."
            />
            <Indicateur
              libelle="Capitaux / séance"
              valeur={`${nf0.format(
                filtrees.reduce((t, l) => t + l.capitauxMoyens, 0) / 1_000_000,
              )} M`}
              aide="Capitaux moyens échangés par séance sur les 30 dernières séances cotées."
            />
            <Indicateur
              libelle="Depuis janvier"
              valeur={pourcentSigne(agregerAction("perfYtd", filtrees, filtrees), 2)}
              teinte={teintePerf(agregerAction("perfYtd", filtrees, filtrees))}
              aide="Performance pondérée par les capitalisations."
            />
            <Indicateur
              libelle="1 an"
              valeur={pourcentSigne(agregerAction("perfA1", filtrees, filtrees), 2)}
              teinte={teintePerf(agregerAction("perfA1", filtrees, filtrees))}
            />
            <Indicateur
              libelle="3 ans"
              valeur={pourcentSigne(agregerAction("perfA3", filtrees, filtrees), 2)}
              teinte={teintePerf(agregerAction("perfA3", filtrees, filtrees))}
            />
            <Indicateur
              libelle="PER"
              valeur={nf1.format(agregerAction("per", filtrees, filtrees) ?? 0)}
              aide={METRIQUES_ACTION.per.aide}
            />
            <Indicateur
              libelle="Rendement"
              valeur={pourcent(agregerAction("rendement", filtrees, filtrees))}
              aide={METRIQUES_ACTION.rendement.aide}
            />
            <Indicateur
              libelle="Volatilité"
              valeur={pourcent(agregerAction("volatilite", filtrees, filtrees), 1)}
              aide={METRIQUES_ACTION.volatilite.aide}
            />
            <Indicateur libelle="Secteurs" valeur={nf0.format(axeSecteurs.length)} />
            <Indicateur libelle="Pays" valeur={nf0.format(axePays.length)} />
            <Indicateur
              libelle="Dernière clôture"
              valeur={dateReference}
              aide="Toutes les fenêtres de performance se calent sur cette date, pas sur l'horloge."
            />
          </section>

          {/* ====== PIVOT ====== */}
          <section className={`${carte} p-3`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className={titreSection}>
                  {METRIQUES_ACTION[metrique].libelle} par{" "}
                  {transpose ? "pays et par secteur" : "secteur et par pays"}
                </h2>
                <p className={aideSection}>
                  Les moyennes sont pondérées par les capitalisations : une place où deux
                  émetteurs font la moitié de la cote ne se décrit pas à parts égales.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {METRIQUES_ACTION_PIVOT.map((m) => (
                  <BoutonFiltre
                    key={m}
                    actif={metrique === m}
                    onClick={() => setMetrique(m)}
                    titre={METRIQUES_ACTION[m].aide}
                  >
                    {METRIQUES_ACTION[m].court}
                  </BoutonFiltre>
                ))}
                <button
                  type="button"
                  onClick={() => setTranspose(!transpose)}
                  title="Échanger les lignes et les colonnes"
                  className="px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-500 hover:border-slate-400"
                >
                  ⇄
                </button>
              </div>
            </div>
            <div className="mt-2">
              <Pivot<LigneAction>
                donnees={filtrees}
                lignes={transpose ? axePays : axeSecteurs}
                colonnes={transpose ? axeSecteurs : axePays}
                cleLigne={(l) => (transpose ? l.pays : l.secteur)}
                cleColonne={(l) => (transpose ? l.secteur : l.pays)}
                cellule={(sous) => agregerAction(metrique, sous, filtrees)}
                formater={(v) => formaterAction(v, unite)}
                enTeteLignes={transpose ? "Pays" : "Secteur"}
                libelleTotal={
                  unite === "milliardsF" || unite === "millionsF" || unite === "entier"
                    ? "Total"
                    : "Moy."
                }
                note={`${METRIQUES_ACTION[metrique].aide}${uniteNote(unite)}`}
                alerte={
                  assiseM !== null && assiseM < 0.995 ? (
                    <>
                      Donnée disponible sur {nf0.format(assiseM * 100)} % de la capitalisation
                      seulement : la moyenne ne porte que sur cette part.
                    </>
                  ) : undefined
                }
              />
            </div>
            <div className="h-72 mt-3">
              <ResponsiveContainer>
                <BarChart data={barresSecteur} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="secteur"
                    tick={{ fontSize: 9, fill: "#64748b" }}
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                    height={54}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={55}
                    tickFormatter={(v: number) => nf0.format(v)}
                  />
                  <Tooltip
                    formatter={tooltip((v, n) => [`${nf1.format(v)} Mds`, n])}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} itemSorter={null} />
                  {axePays.map((p, i) => (
                    <Bar key={i} dataKey={p.cle} name={p.titre} stackId="p" fill={p.couleur} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Capitalisation par secteur, en milliards de FCFA, empilée par pays d&apos;émission.
            </p>
          </section>

          {/* ====== PERFORMANCE ET VALORISATION ====== */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`${carte} p-3`}>
              <h2 className={titreSection}>Performance des secteurs depuis janvier</h2>
              <p className={aideSection}>Pondérée par les capitalisations, en %.</p>
              <div className="h-72 mt-2">
                <ResponsiveContainer>
                  <BarChart
                    data={perfSecteur}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickFormatter={(v: number) => nf0.format(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="secteur"
                      tick={{ fontSize: 9, fill: "#64748b" }}
                      width={130}
                      interval={0}
                    />
                    <Tooltip
                      formatter={tooltip((v) => [`${nf1.format(v)} %`, "Depuis janvier"])}
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="ytd">
                      {perfSecteur.map((s, i) => (
                        <Cell
                          key={i}
                          fill={(s.ytd as number) >= 0 ? "#16a34a" : "#dc2626"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`${carte} p-3`}>
              <h2 className={titreSection}>Valorisation : PER contre rendement</h2>
              <p className={aideSection}>
                Chaque bulle est une valeur, sa taille est sa capitalisation. En bas à droite, le
                cher qui ne paie pas ; en haut à gauche, l&apos;inverse. Le PER est en échelle
                logarithmique : sans elle, un PER à trois chiffres tasserait tout le reste.
              </p>
              <div className="h-72 mt-2">
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="PER"
                      scale="log"
                      domain={["dataMin", "dataMax"]}
                      ticks={graduationsPer}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickFormatter={(v: number) => nf0.format(v)}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Rendement"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      width={45}
                      tickFormatter={(v: number) => `${nf0.format(v)} %`}
                    />
                    <ZAxis type="number" dataKey="z" range={[30, 600]} name="Capitalisation" />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{ fontSize: 11 }}
                      formatter={tooltip((v, n) => [
                        n === "Rendement" ? `${nf2.format(v)} %` : nf1.format(v),
                        n,
                      ])}
                      labelFormatter={() => ""}
                    />
                    <Scatter data={nuage} fill="#2563eb" fillOpacity={0.55} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {nf0.format(nuage.length)} valeurs sur {nf0.format(filtrees.length)} portent à la
                fois un PER et un rendement récurrent.
              </p>
            </div>
          </section>

          {/* ====== CONTRIBUTIONS ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Ce qui a fait le marché depuis janvier</h2>
            <p className={aideSection}>
              Contribution de chaque valeur à la performance de l&apos;univers retenu : son poids
              multiplié par sa performance. Une petite valeur qui double ne déplace pas la cote.
            </p>
            <div className="h-72 mt-2">
              <ResponsiveContainer>
                <BarChart
                  data={contributions}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="code" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={50}
                    tickFormatter={(v: number) => `${nf1.format(v)} %`}
                  />
                  <Tooltip
                    formatter={tooltip((v) => [`${nf2.format(v)} %`, "Contribution"])}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="contribution">
                    {contributions.map((c, i) => (
                      <Cell key={i} fill={c.contribution >= 0 ? "#16a34a" : "#dc2626"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ====== DÉTAIL ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Détail par valeur</h2>
            <p className={aideSection}>
              Cliquez un en-tête pour trier. Les valeurs traitées moins de 10 séances sur 30 sont
              signalées : leur cours est une indication, pas un prix de sortie.
            </p>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    {COLONNES.map((c) => (
                      <th
                        key={c.cle}
                        onClick={() =>
                          setTri({
                            cle: c.cle,
                            croissant: tri.cle === c.cle ? !tri.croissant : false,
                          })
                        }
                        className={`font-medium px-2 py-1.5 cursor-pointer select-none hover:text-slate-900 ${
                          c.aDroite ? "text-right" : "text-left"
                        } ${tri.cle === c.cle ? "text-blue-800" : "text-slate-500"}`}
                      >
                        {c.titre}
                        {tri.cle === c.cle && (tri.croissant ? " ▲" : " ▼")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {triees.map((l) => (
                    <tr key={l.code} className="border-b border-slate-100 hover:bg-slate-50">
                      {COLONNES.map((c) => (
                        <td
                          key={c.cle}
                          className={`px-2 py-1 ${
                            c.aDroite ? "text-right tabular-nums" : "text-left"
                          } text-slate-700 whitespace-nowrap`}
                        >
                          {c.rendu(l, filtrees)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Capitalisations et capitaux en milliards et millions de FCFA. Cours de clôture du{" "}
              {dateReference}.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

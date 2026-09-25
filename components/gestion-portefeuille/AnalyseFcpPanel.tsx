"use client";

// === Marché des OPCVM de l'UMOA ===
//
// Même grammaire que les autres onglets. Ce qui change, c'est qu'on y regarde
// des CONCURRENTS : la question n'est pas « combien vaut ce marché » mais « où
// se situe le fonds que je gère, dans sa catégorie et face à sa maison ». Le
// pivot croise donc société de gestion et catégorie, et les graphiques
// montrent la DISPERSION autant que la moyenne — une moyenne de catégorie ne
// dit rien à qui veut savoir s'il est dans le premier quartile.

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import {
  actifParTrimestre,
  agregerFcp,
  assiseFcp,
  METRIQUES_FCP,
  METRIQUES_FCP_PIVOT,
  type LigneFcp,
  type MetriqueFcp,
  type UniteFcp,
} from "@/app/gestion-portefeuille/analyse-fcp-types";
import {
  aideSection,
  BoutonFiltre,
  carte,
  couleurDe,
  francsEnMilliards,
  Indicateur,
  nf0,
  nf1,
  nf2,
  Pivot,
  pourcentSigne,
  RangeeFiltres,
  teintePerf,
  titreSection,
  tooltip,
  type AxePivot,
} from "./analyse-ui";

function formaterFcp(v: number, u: UniteFcp): React.ReactNode {
  switch (u) {
    case "milliardsF":
      return francsEnMilliards(v);
    case "pourcent":
      return nf2.format(v);
    case "perf":
      return <span className={teintePerf(v)}>{pourcentSigne(v, 2)}</span>;
    case "entier":
      return nf0.format(v);
    case "annees":
      return nf1.format(v);
  }
}

type CleAxe = "gestionnaire" | "categorie" | "type";

const AXES: { cle: CleAxe; libelle: string; valeur: (l: LigneFcp) => string }[] = [
  { cle: "gestionnaire", libelle: "Société de gestion", valeur: (l) => l.gestionnaire },
  { cle: "categorie", libelle: "Catégorie", valeur: (l) => l.categorie },
  { cle: "type", libelle: "Type", valeur: (l) => l.type },
];

// === TABLEAU DÉTAILLÉ ===

type Colonne = {
  cle: string;
  titre: string;
  valeur: (l: LigneFcp) => number | string | null;
  rendu: (l: LigneFcp, univers: LigneFcp[]) => React.ReactNode;
  aDroite?: boolean;
};

const vide = <span className="text-slate-300">·</span>;

const perfCellule = (v: number | null) =>
  v === null ? vide : <span className={teintePerf(v)}>{pourcentSigne(v, 2)}</span>;

const COLONNES: Colonne[] = [
  {
    cle: "nom",
    titre: "Fonds",
    valeur: (l) => l.nom,
    rendu: (l) => (
      <span>
        <span className="font-medium text-slate-900">{l.nom}</span>
        {l.perimee && (
          <span
            className="ml-1.5 text-amber-600"
            title="Valeur liquidative antérieure de plus de quinze jours à celle du reste du marché"
          >
            ⚠
          </span>
        )}
      </span>
    ),
  },
  {
    cle: "gestionnaire",
    titre: "Société de gestion",
    valeur: (l) => l.gestionnaire,
    rendu: (l) => l.gestionnaire,
  },
  { cle: "categorie", titre: "Catégorie", valeur: (l) => l.categorie, rendu: (l) => l.categorie },
  {
    cle: "actif",
    titre: "Actif net (Mds)",
    valeur: (l) => l.actifNet,
    rendu: (l) => (l.actifNet === null ? vide : francsEnMilliards(l.actifNet)),
    aDroite: true,
  },
  {
    cle: "part",
    titre: "Part",
    valeur: (l) => l.actifNet,
    rendu: (l, univers) => {
      if (l.actifNet === null) return vide;
      const total = univers.reduce((t, x) => t + (x.actifNet ?? 0), 0);
      return total > 0 ? `${nf1.format((l.actifNet / total) * 100)} %` : vide;
    },
    aDroite: true,
  },
  {
    cle: "vl",
    titre: "VL",
    valeur: (l) => l.vl,
    rendu: (l) => (l.vl === null ? vide : nf0.format(l.vl)),
    aDroite: true,
  },
  {
    cle: "m3",
    titre: "3 mois",
    valeur: (l) => l.perf.m3,
    rendu: (l) => perfCellule(l.perf.m3),
    aDroite: true,
  },
  {
    cle: "ytd",
    titre: "Janv.",
    valeur: (l) => l.perf.ytd,
    rendu: (l) => perfCellule(l.perf.ytd),
    aDroite: true,
  },
  {
    cle: "a1",
    titre: "1 an",
    valeur: (l) => l.perf.a1,
    rendu: (l) => perfCellule(l.perf.a1),
    aDroite: true,
  },
  {
    cle: "a3",
    titre: "3 ans p.a.",
    valeur: (l) => l.perf.a3,
    rendu: (l) => perfCellule(l.perf.a3),
    aDroite: true,
  },
  {
    cle: "risque",
    titre: "Risque",
    valeur: (l) => l.risque,
    rendu: (l) =>
      l.risque === null ? vide : `${nf0.format(l.risque)}/${nf0.format(l.risqueEchelle ?? 7)}`,
    aDroite: true,
  },
  {
    cle: "age",
    titre: "Ancienneté",
    valeur: (l) => l.age,
    rendu: (l) => (l.age === null ? vide : nf1.format(l.age)),
    aDroite: true,
  },
  { cle: "vlDate", titre: "Dernière VL", valeur: (l) => l.dateVl, rendu: (l) => l.dateVl },
];

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

/** Médiane, `null` sur un échantillon vide. */
function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

// === PANNEAU ===

export default function AnalyseFcpPanel({
  lignes,
  trimestreReference,
  derniereVl,
}: {
  lignes: LigneFcp[];
  trimestreReference: string;
  derniereVl: string;
}) {
  const categories = useMemo(
    () => [...new Set(lignes.map((l) => l.categorie))].sort((a, b) => a.localeCompare(b, "fr")),
    [lignes],
  );
  const types = useMemo(
    () => [...new Set(lignes.map((l) => l.type))].sort((a, b) => a.localeCompare(b, "fr")),
    [lignes],
  );

  const [categoriesExclues, setCategoriesExclues] = useState<Set<string>>(() => new Set<string>());
  const [typesExclus, setTypesExclus] = useState<Set<string>>(() => new Set<string>());
  const [avecActifSeuls, setAvecActifSeuls] = useState(false);
  const [metrique, setMetrique] = useState<MetriqueFcp>("actifNet");
  const [axeLigne, setAxeLigne] = useState<CleAxe>("gestionnaire");
  const [axeColonne, setAxeColonne] = useState<CleAxe>("categorie");
  const [periode, setPeriode] = useState<"ytd" | "a1" | "a3">("ytd");
  const [tri, setTri] = useState<{ cle: string; croissant: boolean }>({
    cle: "actif",
    croissant: false,
  });

  const basculer = (v: string, ens: Set<string>, poser: (s: Set<string>) => void) => {
    const suivant = new Set(ens);
    if (suivant.has(v)) suivant.delete(v);
    else suivant.add(v);
    poser(suivant);
  };

  const filtrees = useMemo(
    () =>
      lignes.filter(
        (l) =>
          !categoriesExclues.has(l.categorie) &&
          !typesExclus.has(l.type) &&
          (!avecActifSeuls || l.actifNet !== null),
      ),
    [lignes, categoriesExclues, typesExclus, avecActifSeuls],
  );

  /**
   * LES DEUX AXES S'ÉCHANGENT, ils ne se superposent jamais.
   *
   * Choisir « catégorie » en lignes alors qu'elle occupait déjà les colonnes
   * donnait une matrice DIAGONALE — chaque catégorie n'ayant de valeur que dans
   * sa propre colonne — et un graphique d'une seule couleur par barre. Plutôt
   * que d'interdire la combinaison, on rend l'autre axe à celui qu'on vient de
   * lui prendre : le tableau bascule, il ne se vide pas.
   */
  const choisirLigne = (c: CleAxe) => {
    if (c === axeColonne) setAxeColonne(axeLigne);
    setAxeLigne(c);
  };
  const choisirColonne = (c: CleAxe) => {
    if (c === axeLigne) setAxeLigne(axeColonne);
    setAxeColonne(c);
  };

  const axeCourant = AXES.find((a) => a.cle === axeLigne) ?? AXES[0];
  const axeCol = AXES.find((a) => a.cle === axeColonne) ?? AXES[1];
  const unite = METRIQUES_FCP[metrique].unite;

  // Les lignes du pivot sont rangées par POIDS et non par ordre alphabétique :
  // sur vingt sociétés de gestion, ce qu'on veut voir en premier est qui pèse.
  const lignesPivot: AxePivot[] = useMemo(() => {
    const parCle = new Map<string, number>();
    for (const l of filtrees) {
      const k = axeCourant.valeur(l);
      parCle.set(k, (parCle.get(k) ?? 0) + (l.actifNet ?? 0));
    }
    return [...parCle.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
      .map(([cle], i) => ({ cle, titre: cle, couleur: couleurDe(i) }));
  }, [filtrees, axeCourant]);

  const colonnesPivot: AxePivot[] = useMemo(() => {
    const valeurs = [...new Set(filtrees.map(axeCol.valeur))].sort((a, b) =>
      a.localeCompare(b, "fr"),
    );
    return valeurs.map((v, i) => ({ cle: v, titre: v, couleur: couleurDe(i) }));
  }, [filtrees, axeCol]);

  /** Les catégories présentes, pour les vues qui portent SUR la catégorie et
   *  non sur l'axe choisi dans le pivot. */
  const categoriesAffichees: AxePivot[] = useMemo(
    () =>
      categories
        .filter((c) => filtrees.some((l) => l.categorie === c))
        .map((c, i) => ({ cle: c, titre: c, couleur: couleurDe(i) })),
    [categories, filtrees],
  );

  const assiseM = assiseFcp(metrique, filtrees);

  // === Graphique : actif net par société de gestion, empilé par catégorie ===
  const barres = useMemo(
    () =>
      lignesPivot.slice(0, 15).map((r) => {
        const entree: Record<string, number | string> = { axe: r.titre };
        for (const c of colonnesPivot) {
          const v = filtrees
            .filter((l) => axeCourant.valeur(l) === r.cle && axeCol.valeur(l) === c.cle)
            .reduce((t, l) => t + (l.actifNet ?? 0), 0);
          entree[c.cle] = v / 1_000_000_000;
        }
        return entree;
      }),
    [lignesPivot, colonnesPivot, filtrees, axeCourant, axeCol],
  );

  // === Graphique : dispersion des performances dans chaque catégorie ===
  //
  // UN NUAGE, PAS UNE MOYENNE. Deux fonds obligataires de la même place
  // peuvent écarter de trois points sur un an ; la moyenne de catégorie ne le
  // dit pas, et c'est pourtant la seule chose qu'un gérant vient vérifier.
  const dispersion = useMemo(
    () =>
      categoriesAffichees.map((c, i) => ({
        nom: c.titre,
        couleur: couleurDe(i),
        points: filtrees
          .filter((l) => l.categorie === c.cle && l.perf[periode] !== null)
          .map((l) => ({
            x: i + 1,
            y: l.perf[periode] as number,
            z: (l.actifNet ?? 0) / 1_000_000_000,
            nom: l.nom,
          })),
      })),
    [categoriesAffichees, filtrees, periode],
  );

  const medianes = useMemo(
    () =>
      categoriesAffichees.map((c) => ({
        categorie: c.titre,
        mediane: mediane(
          filtrees
            .filter((l) => l.categorie === c.cle && l.perf[periode] !== null)
            .map((l) => l.perf[periode] as number),
        ),
        moyenne: agregerFcp(
          periode === "ytd" ? "perfYtd" : periode === "a1" ? "perfA1" : "perfA3",
          filtrees.filter((l) => l.categorie === c.cle),
          filtrees,
        ),
      })),
    [categoriesAffichees, filtrees, periode],
  );

  /**
   * Cadre du nuage de dispersion, borné aux 2e et 98e centiles.
   *
   * UN SEUL POINT ABERRANT APLATIT TOUT LE RESTE. Le marché compte quelques
   * fonds dont la valeur liquidative a changé de base — fractionnement,
   * redénomination — et dont la « performance » ressort alors à moins
   * quatre-vingts pour cent. L'échelle automatique se cale dessus et ramène
   * l'écart réel entre fonds, qui est de quelques points, à une ligne plate.
   *
   * Les points restent TOUS dans le graphique et TOUS dans les moyennes : seul
   * le cadre est borné, et la légende dit combien en sortent. Borner le cadre
   * est une question de lisibilité ; écarter des fonds serait une décision sur
   * la donnée, qu'on ne prend pas ici.
   */
  const cadre = useMemo(() => {
    const valeurs = filtrees
      .map((l) => l.perf[periode])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (valeurs.length < 5) return { min: undefined, max: undefined, hors: 0, extremes: 0 };
    const centile = (p: number) =>
      valeurs[Math.min(valeurs.length - 1, Math.max(0, Math.round(p * (valeurs.length - 1))))];
    const bas = centile(0.02);
    const haut = centile(0.98);
    const marge = Math.max(1, (haut - bas) * 0.12);
    const min = bas - marge;
    const max = haut + marge;
    return {
      min,
      max,
      hors: valeurs.filter((v) => v < min || v > max).length,
      extremes: valeurs.filter((v) => Math.abs(v) > 50).length,
    };
  }, [filtrees, periode]);

  const encours = useMemo(
    () =>
      actifParTrimestre(filtrees).map((p) => ({
        trimestre: p.trimestre,
        actifNet: p.actifNet / 1_000_000_000,
        fonds: p.fonds,
      })),
    [filtrees],
  );

  const triees = useMemo(() => {
    const col = COLONNES.find((c) => c.cle === tri.cle) ?? COLONNES[0];
    return [...filtrees].sort((a, b) => comparer(col.valeur(a), col.valeur(b), tri.croissant));
  }, [filtrees, tri]);

  const actifTotal = filtrees.reduce((t, l) => t + (l.actifNet ?? 0), 0);
  const sansActif = filtrees.filter((l) => l.actifNet === null).length;

  return (
    <div className="space-y-4">
      {/* ====== FILTRES ====== */}
      <section className={`${carte} p-3 space-y-2.5`}>
        <RangeeFiltres libelle="Catégories">
          {categories.map((c, i) => (
            <BoutonFiltre
              key={c}
              actif={!categoriesExclues.has(c)}
              couleur={couleurDe(i)}
              onClick={() => basculer(c, categoriesExclues, setCategoriesExclues)}
            >
              {c}
            </BoutonFiltre>
          ))}
          {categoriesExclues.size > 0 && (
            <button
              type="button"
              onClick={() => setCategoriesExclues(new Set<string>())}
              className="text-[11px] text-blue-700 hover:underline ml-1"
            >
              tout réafficher
            </button>
          )}
        </RangeeFiltres>

        <RangeeFiltres libelle="Types">
          {types.map((t, i) => (
            <BoutonFiltre
              key={t}
              actif={!typesExclus.has(t)}
              couleur={couleurDe(i + 5)}
              onClick={() => basculer(t, typesExclus, setTypesExclus)}
            >
              {t}
            </BoutonFiltre>
          ))}
          <span className="mx-1 text-slate-300">|</span>
          <BoutonFiltre actif={!avecActifSeuls} onClick={() => setAvecActifSeuls(false)}>
            Tous les fonds
          </BoutonFiltre>
          <BoutonFiltre
            actif={avecActifSeuls}
            onClick={() => setAvecActifSeuls(true)}
            titre="Fonds dont l'actif net est publié au trimestre de référence. Les autres ne pèsent rien dans les moyennes."
          >
            Actif net publié
          </BoutonFiltre>
        </RangeeFiltres>
      </section>

      {filtrees.length === 0 ? (
        <p className={`${carte} px-3 py-8 text-center text-xs text-slate-500`}>
          Aucun fonds ne passe ces filtres.
        </p>
      ) : (
        <>
          {/* ====== INDICATEURS ====== */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Indicateur libelle="Fonds" valeur={nf0.format(filtrees.length)} />
            <Indicateur
              libelle="Actif net"
              valeur={`${francsEnMilliards(actifTotal)} Mds`}
              accent
              aide={`Actif net cumulé au ${trimestreReference}.`}
            />
            <Indicateur
              libelle="Sociétés de gestion"
              valeur={nf0.format(new Set(filtrees.map((l) => l.gestionnaire)).size)}
            />
            <Indicateur
              libelle="Depuis janvier"
              valeur={pourcentSigne(agregerFcp("perfYtd", filtrees, filtrees), 2)}
              teinte={teintePerf(agregerFcp("perfYtd", filtrees, filtrees))}
              aide={METRIQUES_FCP.perfYtd.aide}
            />
            <Indicateur
              libelle="1 an"
              valeur={pourcentSigne(agregerFcp("perfA1", filtrees, filtrees), 2)}
              teinte={teintePerf(agregerFcp("perfA1", filtrees, filtrees))}
            />
            <Indicateur
              libelle="3 ans p.a."
              valeur={pourcentSigne(agregerFcp("perfA3", filtrees, filtrees), 2)}
              teinte={teintePerf(agregerFcp("perfA3", filtrees, filtrees))}
            />
            <Indicateur
              libelle="Fonds moyen"
              valeur={`${francsEnMilliards(
                actifTotal / Math.max(1, filtrees.length - sansActif),
              )} Mds`}
              aide="Actif net moyen des fonds qui en publient un."
            />
            <Indicateur
              libelle="Sans actif net publié"
              valeur={nf0.format(sansActif)}
              aide="Ces fonds comptent dans les effectifs mais ne pèsent rien dans les moyennes."
            />
            <Indicateur
              libelle="VL périmées"
              valeur={nf0.format(filtrees.filter((l) => l.perimee).length)}
              aide="Valeur liquidative antérieure de plus de quinze jours à la dernière du marché."
            />
            <Indicateur
              libelle="Ancienneté moyenne"
              valeur={`${nf1.format(agregerFcp("age", filtrees, filtrees) ?? 0)} ans`}
            />
            <Indicateur
              libelle="Trimestre de référence"
              valeur={trimestreReference || "—"}
              aide="Seuls les points trimestriels portent un actif net."
            />
            <Indicateur libelle="Dernière VL du marché" valeur={derniereVl || "—"} />
          </section>

          {/* ====== PIVOT ====== */}
          <section className={`${carte} p-3`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className={titreSection}>
                  {METRIQUES_FCP[metrique].libelle} par {axeCourant.libelle.toLowerCase()} et par{" "}
                  {axeCol.libelle.toLowerCase()}
                </h2>
                <p className={aideSection}>
                  Les moyennes sont pondérées par les actifs nets : un fonds de 200 millions et un
                  fonds de 80 milliards ne décrivent pas le même marché.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {METRIQUES_FCP_PIVOT.map((m) => (
                  <BoutonFiltre
                    key={m}
                    actif={metrique === m}
                    onClick={() => setMetrique(m)}
                    titre={METRIQUES_FCP[m].aide}
                  >
                    {METRIQUES_FCP[m].court}
                  </BoutonFiltre>
                ))}
              </div>
            </div>
            <div className="mt-2">
              <RangeeFiltres libelle="Lignes">
                {AXES.map((a) => (
                  <BoutonFiltre
                    key={a.cle}
                    actif={axeLigne === a.cle}
                    onClick={() => choisirLigne(a.cle)}
                  >
                    {a.libelle}
                  </BoutonFiltre>
                ))}
              </RangeeFiltres>
            </div>
            <div className="mt-1.5">
              <RangeeFiltres libelle="Colonnes">
                {AXES.map((a) => (
                  <BoutonFiltre
                    key={a.cle}
                    actif={axeColonne === a.cle}
                    onClick={() => choisirColonne(a.cle)}
                  >
                    {a.libelle}
                  </BoutonFiltre>
                ))}
              </RangeeFiltres>
            </div>
            <div className="mt-2">
              <Pivot<LigneFcp>
                donnees={filtrees}
                lignes={lignesPivot}
                colonnes={colonnesPivot}
                cleLigne={axeCourant.valeur}
                cleColonne={axeCol.valeur}
                cellule={(sous) => agregerFcp(metrique, sous, filtrees)}
                formater={(v) => formaterFcp(v, unite)}
                enTeteLignes={axeCourant.libelle}
                libelleTotal={
                  unite === "milliardsF" || unite === "entier" ? "Total" : "Moy."
                }
                note={`${METRIQUES_FCP[metrique].aide}${
                  unite === "milliardsF" ? " En milliards de FCFA." : ""
                }`}
                alerte={
                  assiseM !== null && assiseM < 0.995 ? (
                    <>
                      Donnée disponible sur {nf0.format(assiseM * 100)} % de l&apos;actif net
                      seulement : la moyenne ne porte que sur cette part.
                    </>
                  ) : undefined
                }
              />
            </div>
            <div className="h-80 mt-3">
              <ResponsiveContainer>
                <BarChart data={barres} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="axe"
                    tick={{ fontSize: 8, fill: "#64748b" }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={90}
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
                  {colonnesPivot.map((c, i) => (
                    <Bar key={i} dataKey={c.cle} name={c.titre} stackId="c" fill={c.couleur} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Actif net des quinze premières lignes, en milliards de FCFA, empilé par{" "}
              {axeCol.libelle.toLowerCase()}.
            </p>
          </section>

          {/* ====== DISPERSION ====== */}
          <section className={`${carte} p-3`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className={titreSection}>Dispersion des performances par catégorie</h2>
                <p className={aideSection}>
                  Chaque bulle est un fonds, sa taille est son actif net. Ce qui compte n&apos;est
                  pas la moyenne de la catégorie mais l&apos;écart entre le haut et le bas.
                </p>
              </div>
              <div className="flex gap-1.5">
                {(
                  [
                    ["ytd", "Depuis janvier"],
                    ["a1", "1 an"],
                    ["a3", "3 ans p.a."],
                  ] as const
                ).map(([cle, libelle]) => (
                  <BoutonFiltre key={cle} actif={periode === cle} onClick={() => setPeriode(cle)}>
                    {libelle}
                  </BoutonFiltre>
                ))}
              </div>
            </div>
            <div className="h-80 mt-2">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Catégorie"
                    domain={[0.5, categoriesAffichees.length + 0.5]}
                    ticks={categoriesAffichees.map((_, i) => i + 1)}
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickFormatter={(v: number) => categoriesAffichees[v - 1]?.titre ?? ""}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Performance"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={50}
                    domain={
                      cadre.min === undefined ? ["auto", "auto"] : [cadre.min, cadre.max as number]
                    }
                    allowDataOverflow
                    tickFormatter={(v: number) => `${nf0.format(v)} %`}
                  />
                  <ZAxis type="number" dataKey="z" range={[25, 450]} name="Actif net" />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ fontSize: 11 }}
                    formatter={tooltip((v, n) => [
                      n === "Performance"
                        ? `${nf2.format(v)} %`
                        : n === "Actif net"
                          ? `${nf1.format(v)} Mds`
                          : (categoriesAffichees[v - 1]?.titre ?? ""),
                      n,
                    ])}
                    labelFormatter={() => ""}
                  />
                  {dispersion.map((d, i) => (
                    <Scatter key={i} name={d.nom} data={d.points} fill={d.couleur} fillOpacity={0.6} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            {(cadre.hors > 0 || cadre.extremes > 0) && (
              <p className="text-[10px] text-amber-700 mt-1">
                {cadre.hors > 0 && (
                  <>
                    {nf0.format(cadre.hors)} fonds sortent du cadre, qui est borné aux centiles
                    extrêmes pour rester lisible — ils restent comptés dans les moyennes et les
                    tableaux.{" "}
                  </>
                )}
                {cadre.extremes > 0 && (
                  <>
                    {nf0.format(cadre.extremes)} affichent une variation de plus de 50 % sur cette
                    fenêtre : sur un OPCVM, c&apos;est presque toujours un changement de base de la
                    valeur liquidative, pas une performance. Vérifiez-les avant de les comparer.
                  </>
                )}
              </p>
            )}
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="text-left font-medium px-2 py-1.5">Catégorie</th>
                    <th className="text-right font-medium px-2 py-1.5">Médiane</th>
                    <th className="text-right font-medium px-2 py-1.5">Moyenne pondérée</th>
                    <th className="text-right font-medium px-2 py-1.5">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {medianes.map((m) => (
                    <tr key={m.categorie} className="border-b border-slate-100">
                      <td className="px-2 py-1 text-slate-800">{m.categorie}</td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {perfCellule(m.mediane)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {perfCellule(m.moyenne)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-slate-500">
                        {m.mediane === null || m.moyenne === null
                          ? vide
                          : `${nf2.format(m.moyenne - m.mediane)} pt`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400 mt-1.5">
                L&apos;écart entre moyenne pondérée et médiane dit où est l&apos;argent : positif,
                les gros fonds font mieux que le fonds typique ; négatif, ils font moins bien.
              </p>
            </div>
          </section>

          {/* ====== ENCOURS ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Actif net du marché, trimestre par trimestre</h2>
            <p className={aideSection}>
              Seuls les relevés trimestriels portent un actif net ; la courbe ne peut donc pas
              être plus fine. Le nombre de fonds publiant varie d&apos;un trimestre à l&apos;autre,
              et une marche peut venir de là autant que d&apos;une collecte.
            </p>
            <div className="h-72 mt-2">
              <ResponsiveContainer>
                <LineChart data={encours} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="trimestre"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    minTickGap={24}
                  />
                  <YAxis
                    yAxisId="actif"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={55}
                    tickFormatter={(v: number) => nf0.format(v)}
                  />
                  <YAxis
                    yAxisId="fonds"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={40}
                    tickFormatter={(v: number) => nf0.format(v)}
                  />
                  <Tooltip
                    formatter={tooltip((v, n) => [
                      n === "Fonds publiant" ? nf0.format(v) : `${nf1.format(v)} Mds`,
                      n,
                    ])}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} itemSorter={null} />
                  <Line
                    yAxisId="actif"
                    type="monotone"
                    dataKey="actifNet"
                    stroke="#1d4ed8"
                    strokeWidth={1.8}
                    dot={false}
                    name="Actif net"
                  />
                  <Line
                    yAxisId="fonds"
                    type="monotone"
                    dataKey="fonds"
                    stroke="#94a3b8"
                    strokeWidth={1.2}
                    strokeDasharray="4 3"
                    dot={false}
                    name="Fonds publiant"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ====== PALMARÈS ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Palmarès depuis janvier</h2>
            <p className={aideSection}>
              Les dix meilleurs et les cinq derniers de l&apos;univers retenu, toutes catégories
              confondues — la comparaison n&apos;a de sens qu&apos;à catégorie donnée, filtrez.
            </p>
            <div className="h-72 mt-2">
              <ResponsiveContainer>
                <BarChart
                  data={[...filtrees]
                    .filter((l) => l.perf.ytd !== null)
                    .sort((a, b) => (b.perf.ytd as number) - (a.perf.ytd as number))
                    .filter((_, i, t) => i < 10 || i >= t.length - 5)
                    .map((l) => ({ nom: l.nom.slice(0, 26), ytd: l.perf.ytd as number }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickFormatter={(v: number) => `${nf0.format(v)} %`}
                  />
                  <YAxis
                    type="category"
                    dataKey="nom"
                    tick={{ fontSize: 8, fill: "#64748b" }}
                    width={190}
                    interval={0}
                  />
                  <Tooltip
                    formatter={tooltip((v) => [`${nf2.format(v)} %`, "Depuis janvier"])}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="ytd">
                    {[...filtrees]
                      .filter((l) => l.perf.ytd !== null)
                      .sort((a, b) => (b.perf.ytd as number) - (a.perf.ytd as number))
                      .filter((_, i, t) => i < 10 || i >= t.length - 5)
                      .map((l, i) => (
                        <Cell key={i} fill={(l.perf.ytd as number) >= 0 ? "#16a34a" : "#dc2626"} />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ====== DÉTAIL ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Détail des fonds</h2>
            <p className={aideSection}>
              Cliquez un en-tête pour trier. Un triangle signale une valeur liquidative en retard
              sur le reste du marché.
            </p>
            <div className="overflow-x-auto mt-2 max-h-[32rem] overflow-y-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-white">
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
                    <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
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
              Actifs nets au {trimestreReference}, en milliards de FCFA. La performance à trois ans
              est ANNUALISÉE, les autres sont cumulées.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

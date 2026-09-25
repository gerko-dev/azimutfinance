"use client";

// === Compartiment obligations BRVM ===
//
// Même grammaire que les autres onglets d'analyse. Ce qui change, c'est l'axe :
// une action se range par secteur, une obligation par MATURITÉ — c'est elle qui
// commande le risque de taux, la duration et le réinvestissement. Les colonnes
// du pivot sont donc toujours des tranches de maturité résiduelle, et ce sont
// les lignes que l'on choisit : pays, signature, émetteur, profil
// d'amortissement.

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  agregerObligation,
  assiseObligation,
  echeancier,
  METRIQUES_OBLIGATION,
  METRIQUES_OBLIGATION_PIVOT,
  TRANCHES_OBLIG,
  type LigneObligation,
  type MetriqueObligation,
  type UniteObligation,
} from "@/app/gestion-portefeuille/analyse-obligations-types";
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
  RangeeFiltres,
  titreSection,
  tooltip,
  type AxePivot,
} from "./analyse-ui";

function formaterObligation(v: number, u: UniteObligation): React.ReactNode {
  switch (u) {
    case "milliardsF":
      return francsEnMilliards(v);
    case "pourcent":
      return nf2.format(v);
    case "annees":
      return nf1.format(v);
    case "entier":
      return nf0.format(v);
  }
}

// === AXE DES LIGNES ===

type CleAxe = "pays" | "typeEmetteur" | "emetteur" | "amortissement" | "notation";

const AXES: { cle: CleAxe; libelle: string; valeur: (l: LigneObligation) => string }[] = [
  { cle: "pays", libelle: "Pays", valeur: (l) => l.pays },
  { cle: "typeEmetteur", libelle: "Type d'émetteur", valeur: (l) => l.typeEmetteur },
  { cle: "emetteur", libelle: "Émetteur", valeur: (l) => l.emetteur },
  {
    cle: "amortissement",
    libelle: "Amortissement",
    valeur: (l) => LIBELLE_AMORT[l.amortissement] ?? l.amortissement,
  },
  { cle: "notation", libelle: "Notation", valeur: (l) => l.notation || "Non notée" },
];

const LIBELLE_AMORT: Record<string, string> = {
  IF: "In fine",
  AC: "Constant",
  ACD: "Constant avec différé",
};

// === TABLEAU DÉTAILLÉ ===

type Colonne = {
  cle: string;
  titre: string;
  valeur: (l: LigneObligation) => number | string | null;
  rendu: (l: LigneObligation) => React.ReactNode;
  aDroite?: boolean;
};

const vide = <span className="text-slate-300">·</span>;

const COLONNES: Colonne[] = [
  {
    cle: "code",
    titre: "Ligne",
    valeur: (l) => l.code,
    rendu: (l) => (
      <span>
        <span className="font-medium text-slate-900">{l.code}</span>
        {l.vert && <span className="ml-1 text-emerald-600" title="Obligation verte">●</span>}
        <span className="text-slate-500 ml-1.5">{l.nom}</span>
      </span>
    ),
  },
  { cle: "pays", titre: "Pays", valeur: (l) => l.pays, rendu: (l) => l.pays },
  {
    cle: "type",
    titre: "Émetteur",
    valeur: (l) => l.typeEmetteur,
    rendu: (l) => l.typeEmetteur,
  },
  {
    cle: "coupon",
    titre: "Coupon",
    valeur: (l) => l.coupon,
    rendu: (l) => pourcent(l.coupon),
    aDroite: true,
  },
  {
    cle: "echeance",
    titre: "Échéance",
    valeur: (l) => l.dateEcheance,
    rendu: (l) => l.dateEcheance,
    aDroite: true,
  },
  {
    cle: "maturite",
    titre: "Maturité",
    valeur: (l) => l.maturite,
    rendu: (l) => nf1.format(l.maturite),
    aDroite: true,
  },
  {
    cle: "encours",
    titre: "Encours (Mds)",
    valeur: (l) => l.encours,
    rendu: (l) => francsEnMilliards(l.encours),
    aDroite: true,
  },
  {
    cle: "cours",
    titre: "Cours",
    valeur: (l) => l.cours,
    rendu: (l) => (l.cours === null ? vide : nf0.format(l.cours)),
    aDroite: true,
  },
  {
    cle: "ytm",
    titre: "YTM",
    valeur: (l) => l.ytm,
    rendu: (l) => (l.ytm === null ? vide : pourcent(l.ytm)),
    aDroite: true,
  },
  {
    cle: "duration",
    titre: "Duration",
    valeur: (l) => l.duration,
    rendu: (l) => (l.duration === null ? vide : nf1.format(l.duration)),
    aDroite: true,
  },
  {
    cle: "amort",
    titre: "Amort.",
    valeur: (l) => l.amortissement,
    rendu: (l) => LIBELLE_AMORT[l.amortissement] ?? l.amortissement,
  },
  {
    cle: "notation",
    titre: "Notation",
    valeur: (l) => l.notation || null,
    rendu: (l) => l.notation || vide,
  },
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

// === PANNEAU ===

export default function AnalyseObligationsPanel({
  lignes,
  dateCours,
}: {
  lignes: LigneObligation[];
  dateCours: string;
}) {
  const paysListe = useMemo(
    () => [...new Set(lignes.map((l) => l.pays))].sort((a, b) => a.localeCompare(b, "fr")),
    [lignes],
  );
  const typesListe = useMemo(
    () => [...new Set(lignes.map((l) => l.typeEmetteur))].sort((a, b) => a.localeCompare(b, "fr")),
    [lignes],
  );

  const [paysExclus, setPaysExclus] = useState<Set<string>>(() => new Set<string>());
  const [typesExclus, setTypesExclus] = useState<Set<string>>(() => new Set<string>());
  const [cotéesSeules, setCoteesSeules] = useState(false);
  const [metrique, setMetrique] = useState<MetriqueObligation>("encours");
  const [axe, setAxe] = useState<CleAxe>("pays");
  const [tri, setTri] = useState<{ cle: string; croissant: boolean }>({
    cle: "encours",
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
          !paysExclus.has(l.pays) &&
          !typesExclus.has(l.typeEmetteur) &&
          (!cotéesSeules || l.cours !== null),
      ),
    [lignes, paysExclus, typesExclus, cotéesSeules],
  );

  const axeCourant = AXES.find((a) => a.cle === axe) ?? AXES[0];
  const unite = METRIQUES_OBLIGATION[metrique].unite;

  const lignesPivot: AxePivot[] = useMemo(() => {
    const valeurs = [...new Set(filtrees.map(axeCourant.valeur))].sort((a, b) =>
      a.localeCompare(b, "fr"),
    );
    return valeurs.map((v, i) => ({ cle: v, titre: v, couleur: couleurDe(i) }));
  }, [filtrees, axeCourant]);

  const colonnesPivot: AxePivot[] = useMemo(
    () =>
      TRANCHES_OBLIG.filter((t) => filtrees.some((l) => l.tranche === t.cle)).map((t, i) => ({
        cle: t.cle,
        titre: t.titre,
        sousTitre: undefined,
        couleur: couleurDegradee(i, TRANCHES_OBLIG.length),
      })),
    [filtrees],
  );

  const assiseM = assiseObligation(metrique, filtrees);

  // === Graphique : encours par pays, empilé par maturité ===
  const barres = useMemo(
    () =>
      lignesPivot.map((r) => {
        const entree: Record<string, number | string> = { axe: r.titre };
        for (const c of colonnesPivot) {
          const v = filtrees
            .filter((l) => axeCourant.valeur(l) === r.cle && l.tranche === c.cle)
            .reduce((t, l) => t + l.encours, 0);
          entree[c.cle] = v / 1_000_000_000;
        }
        return entree;
      }),
    [lignesPivot, colonnesPivot, filtrees, axeCourant],
  );

  // === Graphique : la courbe de crédit, ligne par ligne ===
  //
  // UN NUAGE ET NON UNE COURBE MOYENNE. Sur ce compartiment, deux emprunts de
  // même maturité peuvent payer un point d'écart selon la signature : une
  // moyenne par tranche l'effacerait, alors que c'est précisément l'écart que
  // l'on vient chercher.
  const series = useMemo(() => {
    const parType = new Map<string, { x: number; y: number; z: number; code: string }[]>();
    for (const l of filtrees) {
      if (l.ytm === null) continue;
      const liste = parType.get(l.typeEmetteur) ?? [];
      liste.push({
        x: l.maturite,
        y: l.ytm,
        z: l.encours / 1_000_000_000,
        code: l.code,
      });
      parType.set(l.typeEmetteur, liste);
    }
    return [...parType.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "fr"))
      .map(([nom, points], i) => ({ nom, points, couleur: couleurDe(i) }));
  }, [filtrees]);

  const tombees = useMemo(
    () =>
      echeancier(filtrees).map((f) => ({
        annee: String(f.annee),
        coupon: f.coupon / 1_000_000_000,
        principal: f.principal / 1_000_000_000,
      })),
    [filtrees],
  );

  const triees = useMemo(() => {
    const col = COLONNES.find((c) => c.cle === tri.cle) ?? COLONNES[0];
    return [...filtrees].sort((a, b) => comparer(col.valeur(a), col.valeur(b), tri.croissant));
  }, [filtrees, tri]);

  const encoursTotal = filtrees.reduce((t, l) => t + l.encours, 0);
  const avecCours = filtrees.filter((l) => l.cours !== null).length;

  return (
    <div className="space-y-4">
      {/* ====== FILTRES ====== */}
      <section className={`${carte} p-3 space-y-2.5`}>
        <RangeeFiltres libelle="Pays">
          {paysListe.map((p, i) => (
            <BoutonFiltre
              key={p}
              actif={!paysExclus.has(p)}
              couleur={couleurDe(i)}
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

        <RangeeFiltres libelle="Signatures">
          {typesListe.map((t, i) => (
            <BoutonFiltre
              key={t}
              actif={!typesExclus.has(t)}
              couleur={couleurDegradee(i, typesListe.length)}
              onClick={() => basculer(t, typesExclus, setTypesExclus)}
            >
              {t}
            </BoutonFiltre>
          ))}
          {typesExclus.size > 0 && (
            <button
              type="button"
              onClick={() => setTypesExclus(new Set<string>())}
              className="text-[11px] text-blue-700 hover:underline ml-1"
            >
              tout réafficher
            </button>
          )}
        </RangeeFiltres>

        <RangeeFiltres libelle="Cotation">
          <BoutonFiltre actif={!cotéesSeules} onClick={() => setCoteesSeules(false)}>
            Toutes les lignes
          </BoutonFiltre>
          <BoutonFiltre
            actif={cotéesSeules}
            onClick={() => setCoteesSeules(true)}
            titre="Lignes ayant un cours de marché, seules à porter un rendement actuariel."
          >
            Avec un cours coté
          </BoutonFiltre>
        </RangeeFiltres>
      </section>

      {filtrees.length === 0 ? (
        <p className={`${carte} px-3 py-8 text-center text-xs text-slate-500`}>
          Aucune ligne ne passe ces filtres.
        </p>
      ) : (
        <>
          {/* ====== INDICATEURS ====== */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Indicateur libelle="Lignes cotées" valeur={nf0.format(filtrees.length)} />
            <Indicateur
              libelle="Encours"
              valeur={`${francsEnMilliards(encoursTotal)} Mds`}
              accent
              aide={METRIQUES_OBLIGATION.encours.aide}
            />
            <Indicateur
              libelle="Émetteurs"
              valeur={nf0.format(new Set(filtrees.map((l) => l.emetteur)).size)}
            />
            <Indicateur
              libelle="Coupon moyen"
              valeur={pourcent(agregerObligation("coupon", filtrees, filtrees))}
              aide={METRIQUES_OBLIGATION.coupon.aide}
            />
            <Indicateur
              libelle="YTM moyen"
              valeur={pourcent(agregerObligation("ytm", filtrees, filtrees))}
              aide={METRIQUES_OBLIGATION.ytm.aide}
            />
            <Indicateur
              libelle="Maturité moyenne"
              valeur={`${nf1.format(agregerObligation("maturite", filtrees, filtrees) ?? 0)} ans`}
              aide={METRIQUES_OBLIGATION.maturite.aide}
            />
            <Indicateur
              libelle="Duration"
              valeur={`${nf1.format(agregerObligation("duration", filtrees, filtrees) ?? 0)} ans`}
              aide={METRIQUES_OBLIGATION.duration.aide}
            />
            <Indicateur
              libelle="Lignes cotées en cours"
              valeur={`${nf0.format(avecCours)} / ${nf0.format(filtrees.length)}`}
              aide="Nombre de lignes portant un cours de marché exploitable."
            />
            <Indicateur
              libelle="Obligations vertes"
              valeur={nf0.format(filtrees.filter((l) => l.vert).length)}
            />
            <Indicateur
              libelle="Remboursables par anticipation"
              valeur={nf0.format(filtrees.filter((l) => l.remboursableAnticipe).length)}
            />
            <Indicateur
              libelle={`Capital ${new Date().getUTCFullYear()}`}
              valeur={`${francsEnMilliards(
                (tombees.find((t) => t.annee === String(new Date().getUTCFullYear()))?.principal ??
                  0) * 1_000_000_000,
              )} Mds`}
              aide="Amortissements et remboursements de l'année civile en cours, sur l'univers retenu."
            />
            <Indicateur
              libelle="Dernier cours"
              valeur={dateCours || "—"}
              aide="Date du relevé de cours le plus récent du compartiment."
            />
          </section>

          {/* ====== PIVOT ====== */}
          <section className={`${carte} p-3`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className={titreSection}>
                  {METRIQUES_OBLIGATION[metrique].libelle} par {axeCourant.libelle.toLowerCase()}{" "}
                  et par maturité
                </h2>
                <p className={aideSection}>
                  Les colonnes sont des maturités RÉSIDUELLES : ce qu&apos;il reste à courir, pas
                  la durée d&apos;émission.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {METRIQUES_OBLIGATION_PIVOT.map((m) => (
                  <BoutonFiltre
                    key={m}
                    actif={metrique === m}
                    onClick={() => setMetrique(m)}
                    titre={METRIQUES_OBLIGATION[m].aide}
                  >
                    {METRIQUES_OBLIGATION[m].court}
                  </BoutonFiltre>
                ))}
              </div>
            </div>
            <div className="mt-2">
              <RangeeFiltres libelle="Lignes">
                {AXES.map((a) => (
                  <BoutonFiltre key={a.cle} actif={axe === a.cle} onClick={() => setAxe(a.cle)}>
                    {a.libelle}
                  </BoutonFiltre>
                ))}
              </RangeeFiltres>
            </div>
            <div className="mt-2">
              <Pivot<LigneObligation>
                donnees={filtrees}
                lignes={lignesPivot}
                colonnes={colonnesPivot}
                cleLigne={axeCourant.valeur}
                cleColonne={(l) => l.tranche}
                cellule={(sous) => agregerObligation(metrique, sous, filtrees)}
                formater={(v) => formaterObligation(v, unite)}
                enTeteLignes={axeCourant.libelle}
                libelleTotal={
                  unite === "milliardsF" || unite === "entier" ? "Total" : "Moy."
                }
                note={`${METRIQUES_OBLIGATION[metrique].aide}${
                  unite === "milliardsF" ? " En milliards de FCFA." : ""
                }`}
                alerte={
                  assiseM !== null && assiseM < 0.995 ? (
                    <>
                      Donnée disponible sur {nf0.format(assiseM * 100)} % de l&apos;encours
                      seulement. Une ligne sans cours de marché n&apos;a pas de rendement ; et sur
                      un emprunt amortissable proche de son échéance, un écart entre le nominal
                      résiduel que suppose le cours et celui que reconstruit l&apos;échéancier
                      produit, une fois annualisé, un rendement négatif ou à deux chiffres qui ne
                      décrit rien. Ces lignes sont écartées des moyennes, jamais redressées.
                    </>
                  ) : undefined
                }
              />
            </div>
            <div className="h-72 mt-3">
              <ResponsiveContainer>
                <BarChart data={barres} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="axe"
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
                  {colonnesPivot.map((c, i) => (
                    <Bar key={i} dataKey={c.cle} name={c.titre} stackId="m" fill={c.couleur} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Encours en milliards de FCFA, empilé par tranche de maturité résiduelle.
            </p>
          </section>

          {/* ====== COURBE DE CRÉDIT ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Rendement et maturité, ligne par ligne</h2>
            <p className={aideSection}>
              Chaque bulle est un emprunt, sa taille est son encours, sa couleur sa signature.
              L&apos;écart vertical entre deux bulles de même abscisse est la prime que le marché
              demande pour la signature la moins bonne.
            </p>
            <div className="h-80 mt-2">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Maturité"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickFormatter={(v: number) => `${nf0.format(v)} a`}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="YTM"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={50}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => `${nf1.format(v)} %`}
                  />
                  <ZAxis type="number" dataKey="z" range={[25, 500]} name="Encours" />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ fontSize: 11 }}
                    formatter={tooltip((v, n) => [
                      n === "YTM" ? `${nf2.format(v)} %` : n === "Encours" ? `${nf1.format(v)} Mds` : `${nf1.format(v)} ans`,
                      n,
                    ])}
                    labelFormatter={() => ""}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} itemSorter={null} />
                  {series.map((s, i) => (
                    <Scatter
                      key={i}
                      name={s.nom}
                      data={s.points}
                      fill={s.couleur}
                      fillOpacity={0.6}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ====== ÉCHÉANCIER ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Échéancier du compartiment</h2>
            <p className={aideSection}>
              Ce que la cote versera, année par année : intérêts et capital, en milliards de FCFA,
              sur l&apos;univers retenu. Reconstruit ligne à ligne depuis les profils
              d&apos;amortissement, et non lu quelque part.
            </p>
            <div className="h-72 mt-2">
              <ResponsiveContainer>
                <BarChart data={tombees} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="annee" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={8} />
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
                  <Bar dataKey="principal" stackId="f" fill="#1d4ed8" name="Capital" />
                  <Bar dataKey="coupon" stackId="f" fill="#93c5fd" name="Intérêts" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ====== DÉTAIL ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Détail des lignes</h2>
            <p className={aideSection}>
              Cliquez un en-tête pour trier. Un point vert signale une obligation verte.
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
                    <tr
                      key={`${l.code}-${l.isin}`}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      {COLONNES.map((c) => (
                        <td
                          key={c.cle}
                          className={`px-2 py-1 ${
                            c.aDroite ? "text-right tabular-nums" : "text-left"
                          } text-slate-700 whitespace-nowrap`}
                        >
                          {c.rendu(l)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Cours pied de coupon pour 10 000 F de nominal. Maturité et duration en années.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

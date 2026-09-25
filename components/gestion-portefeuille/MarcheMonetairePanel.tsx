"use client";

// === Analyse du marché monétaire : adjudications UMOA-Titres ===
//
// TOUT LE FILTRAGE EST LOCAL. L'historique complet arrive compacté en une fois
// (cf. marche-monetaire-types.ts), et changer de période, de pays ou de
// métrique ne déclenche aucun aller-retour : on explore un marché, et une
// exploration qui attend le réseau à chaque clic n'est pas une exploration.
//
// AUCUNE DATE N'EST LUE À L'HORLOGE. Les périodes se calent sur la DERNIÈRE
// ADJUDICATION CONNUE, pas sur « aujourd'hui ». Deux raisons : le rendu serveur
// et le rendu client partageraient sinon deux « maintenant » différents, ce qui
// casse l'hydratation ; et un lundi matin, « l'année en cours » calée sur
// l'horloge afficherait une semaine vide là où la dernière séance connue est
// justement celle qui intéresse.

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ResponsiveContainer } from "@/components/ui/ChartContainer";
import {
  agreger,
  assiseMetrique,
  libelleTranche,
  maturiteMoyenne,
  METRIQUES,
  METRIQUES_TAUX,
  PAYS_COULEUR,
  PAYS_NOM,
  PAYS_ORDRE,
  rehydrater,
  tenorsRenseignes,
  type Adjudication,
  type LigneCompacte,
  type Metrique,
  type Unite,
} from "@/app/gestion-portefeuille/marche-monetaire-types";
import {
  aideSection,
  BoutonFiltre,
  carte,
  couleurDegradee,
  enMilliards,
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

// === FORMATS ===
//
// Les briques communes — nombres, infobulles, indicateurs, pivot — vivent
// dans `analyse-ui` : les quatre onglets d'analyse partagent la même
// grammaire, et deux tableaux jumeaux finiraient par diverger.

/** Les montants circulent en MILLIONS ; ils s'affichent en milliards. */
function formater(v: number | null, unite: Unite): string {
  if (v === null || !Number.isFinite(v)) return "";
  switch (unite) {
    case "milliards":
      return enMilliards(v);
    case "pourcent":
      return nf2.format(v);
    case "prix":
      return nf0.format(v);
    case "entier":
      return nf0.format(v);
  }
}

const mds = (v: number | null): string => (v === null ? "—" : `${enMilliards(v)} Mds`);

// === FILTRES ===

type Instrument = "tous" | "OAT" | "BAT";
type Nature = "cash" | "toutes";
type Periode = { cle: string; debut: string; fin: string };

const janvier = (annee: number) => `${annee}-01-01`;

/** Périodes proposées, calées sur la dernière date connue du gisement. */
function periodes(
  derniere: string,
  premiere: string,
): { cle: string; libelle: string; debut: string; fin: string }[] {
  const annee = Number(derniere.slice(0, 4));
  const mois = Number(derniere.slice(5, 7));
  const debutTrimestre = Math.floor((mois - 1) / 3) * 3 + 1;
  const ilYaUnAn = new Date(`${derniere}T00:00:00Z`);
  ilYaUnAn.setUTCFullYear(ilYaUnAn.getUTCFullYear() - 1);
  return [
    { cle: "annee", libelle: `Année ${annee}`, debut: janvier(annee), fin: derniere },
    {
      cle: "trimestre",
      libelle: `T${Math.floor((mois - 1) / 3) + 1} ${annee}`,
      debut: `${annee}-${String(debutTrimestre).padStart(2, "0")}-01`,
      fin: derniere,
    },
    {
      cle: "12mois",
      libelle: "12 derniers mois",
      debut: ilYaUnAn.toISOString().slice(0, 10),
      fin: derniere,
    },
    {
      cle: "precedente",
      libelle: `Année ${annee - 1}`,
      debut: janvier(annee - 1),
      fin: `${annee - 1}-12-31`,
    },
    { cle: "3ans", libelle: "3 ans", debut: janvier(annee - 2), fin: derniere },
    { cle: "tout", libelle: "Tout l'historique", debut: premiere, fin: derniere },
  ];
}

// === PRÉSENTATION ===

/**
 * Clef de série d'une maturité, ZÉRO-REMPLIE.
 *
 * Recharts trie sa légende sur la clef de série, et le tri est lexicographique :
 * « 12 » y passe avant « 3 », et la légende annonçait 12, 3, 36, 48, 6, 60, 84
 * pour des barres empilées, elles, dans le bon ordre. Sur trois chiffres,
 * l'ordre des caractères redevient l'ordre des durées.
 */
const clefTenor = (mois: number) => `m${String(mois).padStart(3, "0")}`;

// NOTE SUR `itemSorter={null}`, répété sur chaque légende : Recharts trie par
// défaut les entrées de légende PAR LIBELLÉ, alphabétiquement. Une échelle de
// maturités y sortait « 1 an, 10 ans, 3 ans, 3 mois, 4 ans, 5 ans, 7 ans » sous
// des barres empilées, elles, dans l'ordre des durées ; les pays, eux, y
// perdaient l'ordre français des accents. On rend donc la légende à l'ordre de
// déclaration, qui est l'ordre du graphique.
//
// NOTE SUR LES CLEFS PAR RANG des séries, qui va avec. « L'ordre de
// déclaration » est en réalité l'ordre de MONTAGE : Recharts enregistre chaque
// série au moment où elle apparaît. Avec une clef portant la maturité, passer
// des obligations aux bons gardait les séries communes à leur place et
// ajoutait les nouvelles à la fin — la légende annonçait alors « 3 mois,
// 6 mois, 1 an, 1 mois, 2 ans », le 1 mois avant-dernier parce qu'il venait
// d'apparaître. Ce qui identifie une série ici n'est pas sa maturité mais son
// RANG dans l'empilement, du plus court au plus long ; la clef le dit.

/**
 * Le pivot du marché monétaire : pays en lignes, maturités en colonnes.
 *
 * Habillage du pivot générique, qui ne connaît aucun domaine. Tout ce qui est
 * propre aux adjudications tient ici : les colonnes sont des tranches de
 * maturité, la règle d'agrégation sait qu'un montant se somme et qu'un taux se
 * pondère, et l'avertissement dit sur quelle part du marché la moyenne porte.
 */
function PivotMonetaire({
  lignes,
  tenors,
  pays,
  metrique,
}: {
  lignes: Adjudication[];
  tenors: number[];
  pays: string[];
  metrique: Metrique;
}) {
  const unite = METRIQUES[metrique].unite;

  const colonnes: AxePivot[] = useMemo(
    () =>
      tenorsRenseignes(metrique, lignes, tenors).map((t) => ({
        cle: String(t),
        titre: String(t),
        sousTitre: libelleTranche(t),
      })),
    [metrique, lignes, tenors],
  );

  const lignesAxe: AxePivot[] = useMemo(
    () =>
      pays.map((p) => ({
        cle: p,
        titre: PAYS_NOM[p] ?? p,
        couleur: PAYS_COULEUR[p],
      })),
    [pays],
  );

  // Sur quelle part du marché la moyenne porte-t-elle vraiment ? Un coupon
  // n'existe que pour les OAT, un taux moyen pondéré surtout pour les bons.
  const assise = assiseMetrique(metrique, lignes);

  return (
    <Pivot<Adjudication>
      donnees={lignes}
      lignes={lignesAxe}
      colonnes={colonnes}
      cleLigne={(l) => l.country}
      cleColonne={(l) => String(l.tenor)}
      cellule={(sous) => agreger(metrique, sous)}
      formater={(v) => formater(v, unite)}
      enTeteLignes="Pays"
      libelleTotal={unite === "milliards" || unite === "entier" ? "Total" : "Moy."}
      note={
        <>
          {METRIQUES[metrique].aide}
          {unite === "milliards" ? " Montants en milliards de FCFA." : ""}
          {unite === "prix" ? " Prix pour 10 000 F de nominal." : ""}
        </>
      }
      alerte={
        assise !== null && assise < 0.995 ? (
          <>
            Donnée publiée sur {nf0.format(assise * 100)} % du montant retenu seulement : la
            moyenne ne porte que sur cette part.
            {metrique === "tauxInteret"
              ? " Un bon du Trésor s'adjuge à l'escompte, sans coupon — il n'a pas de taux d'intérêt."
              : ""}
            {metrique === "tmp" || metrique === "tauxMarginal"
              ? " Ces taux ne sont publiés que lorsque l'adjudication se fait au taux, ce qui est surtout le cas des bons."
              : ""}
          </>
        ) : undefined
      }
    />
  );
}

// === PANNEAU ===

export default function MarcheMonetairePanel({ lignes }: { lignes: LigneCompacte[] }) {
  const toutes = useMemo(() => lignes.map(rehydrater), [lignes]);

  const premiere = toutes[0]?.date ?? "2014-01-01";
  const derniere = toutes[toutes.length - 1]?.date ?? premiere;
  const presets = useMemo(() => periodes(derniere, premiere), [derniere, premiere]);

  const [periode, setPeriode] = useState<Periode>(() => {
    const p = periodes(derniere, premiere)[0];
    return { cle: p.cle, debut: p.debut, fin: p.fin };
  });
  const [instrument, setInstrument] = useState<Instrument>("tous");
  const [nature, setNature] = useState<Nature>("cash");
  const [exclus, setExclus] = useState<Set<string>>(() => new Set<string>());
  const [metriqueTaux, setMetriqueTaux] = useState<Metrique>("tauxInteret");

  const basculerPays = (p: string) => {
    const suivant = new Set(exclus);
    if (suivant.has(p)) suivant.delete(p);
    else suivant.add(p);
    setExclus(suivant);
  };

  const filtrees = useMemo(
    () =>
      toutes.filter(
        (l) =>
          l.date >= periode.debut &&
          l.date <= periode.fin &&
          (instrument === "tous" || l.type === instrument) &&
          (nature === "toutes" || l.nature === 0) &&
          !exclus.has(l.country),
      ),
    [toutes, periode, instrument, nature, exclus],
  );

  const tenors = useMemo(
    () => [...new Set(filtrees.map((l) => l.tenor))].sort((a, b) => a - b),
    [filtrees],
  );
  const pays = useMemo(
    () => PAYS_ORDRE.filter((p) => filtrees.some((l) => l.country === p)),
    [filtrees],
  );

  // === Indicateurs de synthèse ===
  const seances = useMemo(() => {
    const cles = new Set<string>();
    for (const l of filtrees) if (l.nature === 0) cles.add(`${l.country}|${l.date}`);
    return cles.size;
  }, [filtrees]);

  // === Graphique : montants retenus par pays et maturité ===
  const barresPays = useMemo(
    () =>
      pays.map((p) => {
        const ligne: Record<string, number | string> = { pays: PAYS_NOM[p] ?? p };
        for (const t of tenors) {
          const v = agreger(
            "retenu",
            filtrees.filter((l) => l.country === p && l.tenor === t),
          );
          ligne[clefTenor(t)] = v === null ? 0 : v / 1000;
        }
        return ligne;
      }),
    [pays, tenors, filtrees],
  );

  // === Graphique : faisceau des taux par maturité ===
  //
  // Mêmes maturités que le tableau juste au-dessus : le graphique ne doit pas
  // réserver un tiers de sa largeur à des échéances que la métrique choisie ne
  // renseigne pas.
  const courbe = useMemo(
    () =>
      tenorsRenseignes(metriqueTaux, filtrees, tenors).map((t) => {
        const ligne: Record<string, number | string | null> = { tenor: libelleTranche(t) };
        for (const p of pays) {
          ligne[p] = agreger(
            metriqueTaux,
            filtrees.filter((l) => l.country === p && l.tenor === t),
          );
        }
        return ligne;
      }),
    [tenors, pays, filtrees, metriqueTaux],
  );

  // === Graphique : évolution mensuelle ===
  const mensuel = useMemo(() => {
    const parMois = new Map<string, Adjudication[]>();
    for (const l of filtrees) {
      const m = l.date.slice(0, 7);
      const liste = parMois.get(m);
      if (liste) liste.push(l);
      else parMois.set(m, [l]);
    }
    return [...parMois.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mois, lot]) => ({
        mois,
        BAT: (agreger("retenu", lot.filter((l) => l.type === "BAT")) ?? 0) / 1000,
        OAT: (agreger("retenu", lot.filter((l) => l.type === "OAT")) ?? 0) / 1000,
        tmp: agreger("tmp", lot),
        couverture: agreger("couverture", lot),
        absorption: agreger("absorption", lot),
      }));
  }, [filtrees]);

  const uniteTaux = METRIQUES[metriqueTaux].unite;

  return (
    <div className="space-y-4">
      {/* ====== FILTRES ====== */}
      <section className={`${carte} p-3 space-y-2.5`}>
        <RangeeFiltres libelle="Période">
          {presets.map((p) => (
            <BoutonFiltre
              key={p.cle}
              actif={periode.cle === p.cle}
              onClick={() => setPeriode({ cle: p.cle, debut: p.debut, fin: p.fin })}
            >
              {p.libelle}
            </BoutonFiltre>
          ))}
          <span className="mx-1 text-slate-300">|</span>
          <input
            type="date"
            value={periode.debut}
            onChange={(e) => setPeriode({ cle: "perso", debut: e.target.value, fin: periode.fin })}
            className="text-[11px] border border-slate-300 rounded px-1.5 py-1 text-slate-700"
          />
          <span className="text-[11px] text-slate-400">au</span>
          <input
            type="date"
            value={periode.fin}
            onChange={(e) => setPeriode({ cle: "perso", debut: periode.debut, fin: e.target.value })}
            className="text-[11px] border border-slate-300 rounded px-1.5 py-1 text-slate-700"
          />
        </RangeeFiltres>

        <RangeeFiltres libelle="Instrument">
          {(
            [
              ["tous", "Tous"],
              ["BAT", "BAT — bons"],
              ["OAT", "OAT — obligations"],
            ] as const
          ).map(([cle, libelle]) => (
            <BoutonFiltre
              key={cle}
              actif={instrument === cle}
              onClick={() => setInstrument(cle)}
            >
              {libelle}
            </BoutonFiltre>
          ))}
          <span className="mx-1 text-slate-300">|</span>
          <BoutonFiltre
            actif={nature === "cash"}
            onClick={() => setNature("cash")}
            titre="Adjudications amenant de l'argent frais à l'État. Exclut les échanges et les rachats, qui ne lèvent rien."
          >
            Adjudications
          </BoutonFiltre>
          <BoutonFiltre
            actif={nature === "toutes"}
            onClick={() => setNature("toutes")}
            titre="Y compris les échanges et rachats de titres, opérations mécaniques sans argent frais."
          >
            + échanges et rachats
          </BoutonFiltre>
        </RangeeFiltres>

        <RangeeFiltres libelle="Émetteurs">
          {PAYS_ORDRE.map((p) => (
            <BoutonFiltre
              key={p}
              actif={!exclus.has(p)}
              couleur={PAYS_COULEUR[p]}
              onClick={() => basculerPays(p)}
            >
              {PAYS_NOM[p]}
            </BoutonFiltre>
          ))}
          {exclus.size > 0 && (
            <button
              type="button"
              onClick={() => setExclus(new Set<string>())}
              className="text-[11px] text-blue-700 hover:underline ml-1"
            >
              tout réafficher
            </button>
          )}
        </RangeeFiltres>
      </section>

      {filtrees.length === 0 ? (
        <p className={`${carte} px-3 py-8 text-center text-xs text-slate-500`}>
          Aucune adjudication sur cette période avec ces filtres.
        </p>
      ) : (
        <>
          {/* ====== INDICATEURS ====== */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Indicateur
              libelle="Proposé"
              valeur={mds(agreger("propose", filtrees))}
              aide="Montant sollicité par les États, compté une seule fois par séance."
            />
            <Indicateur libelle="Soumis" valeur={mds(agreger("soumis", filtrees))} aide="Offres reçues." />
            <Indicateur
              libelle="Retenu"
              valeur={mds(agreger("retenu", filtrees))}
              accent
              aide="Montant effectivement levé."
            />
            <Indicateur
              libelle="Couverture"
              valeur={pourcent(agreger("couverture", filtrees))}
              aide={METRIQUES.couverture.aide}
            />
            <Indicateur
              libelle="Absorption"
              valeur={pourcent(agreger("absorption", filtrees))}
              aide={METRIQUES.absorption.aide}
            />
            <Indicateur
              libelle="Séances"
              valeur={nf0.format(seances)}
              aide="Nombre de séances d'adjudication distinctes (un État, un jour)."
            />
            <Indicateur
              libelle="TMP"
              valeur={pourcent(agreger("tmp", filtrees))}
              aide={METRIQUES.tmp.aide}
            />
            <Indicateur
              libelle="Taux marginal"
              valeur={pourcent(agreger("tauxMarginal", filtrees))}
              aide={METRIQUES.tauxMarginal.aide}
            />
            <Indicateur
              libelle="Taux d'intérêt"
              valeur={pourcent(agreger("tauxInteret", filtrees))}
              aide={METRIQUES.tauxInteret.aide}
            />
            <Indicateur
              libelle="PMP"
              valeur={formater(agreger("pmp", filtrees), "prix")}
              aide={METRIQUES.pmp.aide}
            />
            <Indicateur
              libelle="Prix marginal"
              valeur={formater(agreger("prixMarginal", filtrees), "prix")}
              aide={METRIQUES.prixMarginal.aide}
            />
            <Indicateur
              libelle="Maturité moyenne"
              valeur={`${nf1.format(maturiteMoyenne(filtrees) ?? 0)} ans`}
              aide="Maturité moyenne pondérée par les montants retenus."
            />
          </section>

          {/* ====== MONTANTS RETENUS ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Montants retenus par maturité et par pays</h2>
            <p className={aideSection}>
              En milliards de FCFA. Les colonnes sont les tranches de maturité annoncées, en
              mois.
            </p>
            <div className="mt-2">
              <PivotMonetaire lignes={filtrees} tenors={tenors} pays={pays} metrique="retenu" />
            </div>
            <div className="h-72 mt-3">
              <ResponsiveContainer>
                <BarChart data={barresPays} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="pays" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={50}
                    tickFormatter={(v: number) => nf0.format(v)}
                  />
                  <Tooltip
                    formatter={tooltip((v, n) => [`${nf1.format(v)} Mds`, n])}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} itemSorter={null} />
                  {tenors.map((t, i) => (
                    <Bar
                      key={i}
                      dataKey={clefTenor(t)}
                      name={libelleTranche(t)}
                      stackId="m"
                      fill={couleurDegradee(i, tenors.length)}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ====== TAUX ====== */}
          <section className={`${carte} p-3`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className={titreSection}>{METRIQUES[metriqueTaux].libelle} par maturité et par pays</h2>
                <p className={aideSection}>
                  Moyennes pondérées par les montants retenus : une offre non servie ne pèse rien.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {METRIQUES_TAUX.map((m) => (
                  <BoutonFiltre
                    key={m}
                    actif={metriqueTaux === m}
                    onClick={() => setMetriqueTaux(m)}
                    titre={METRIQUES[m].aide}
                  >
                    {METRIQUES[m].court}
                  </BoutonFiltre>
                ))}
              </div>
            </div>
            <div className="mt-2">
              <PivotMonetaire lignes={filtrees} tenors={tenors} pays={pays} metrique={metriqueTaux} />
            </div>
            <div className="h-72 mt-3">
              <ResponsiveContainer>
                <LineChart data={courbe} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="tenor" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={55}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) =>
                      uniteTaux === "prix" ? nf0.format(v) : nf2.format(v)
                    }
                  />
                  <Tooltip
                    formatter={tooltip((v, n) => [
                      uniteTaux === "prix" ? nf0.format(v) : `${nf2.format(v)} %`,
                      PAYS_NOM[n] ?? n,
                    ])}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10 }}
                    itemSorter={null}
                    formatter={(v: string) => PAYS_NOM[v] ?? v}
                  />
                  {pays.map((p, i) => (
                    <Line
                      key={i}
                      type="monotone"
                      dataKey={p}
                      stroke={PAYS_COULEUR[p]}
                      strokeWidth={1.8}
                      dot={{ r: 2.5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ====== SYNTHÈSE PAR PAYS ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Synthèse par émetteur</h2>
            <p className={aideSection}>
              Le taux de couverture ne figure pas dans les pivots par maturité : un État sollicite
              une enveloppe pour une SÉANCE, pas pour une tranche. Le répartir par maturité lui
              ferait dire ce qu&apos;il ne dit pas.
            </p>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="text-left font-medium px-2 py-1.5">Pays</th>
                    <th className="text-right font-medium px-2 py-1.5">Proposé</th>
                    <th className="text-right font-medium px-2 py-1.5">Soumis</th>
                    <th className="text-right font-medium px-2 py-1.5">Retenu</th>
                    <th className="text-right font-medium px-2 py-1.5">Couverture</th>
                    <th className="text-right font-medium px-2 py-1.5">Absorption</th>
                    <th className="text-right font-medium px-2 py-1.5">TMP</th>
                    <th className="text-right font-medium px-2 py-1.5">Marginal</th>
                    <th className="text-right font-medium px-2 py-1.5">PMP</th>
                    <th className="text-right font-medium px-2 py-1.5">Mat. moy.</th>
                    <th className="text-right font-medium px-2 py-1.5">Opér.</th>
                  </tr>
                </thead>
                <tbody>
                  {pays.map((p) => {
                    const duPays = filtrees.filter((l) => l.country === p);
                    return (
                      <tr key={p} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-1 text-slate-800 whitespace-nowrap">
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                            style={{ backgroundColor: PAYS_COULEUR[p] }}
                          />
                          {PAYS_NOM[p]}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-600">
                          {formater(agreger("propose", duPays), "milliards")}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-600">
                          {formater(agreger("soumis", duPays), "milliards")}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums font-semibold text-slate-900">
                          {formater(agreger("retenu", duPays), "milliards")}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                          {formater(agreger("couverture", duPays), "pourcent")}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                          {formater(agreger("absorption", duPays), "pourcent")}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                          {formater(agreger("tmp", duPays), "pourcent")}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                          {formater(agreger("tauxMarginal", duPays), "pourcent")}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                          {formater(agreger("pmp", duPays), "prix")}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                          {maturiteMoyenne(duPays) === null
                            ? "·"
                            : nf1.format(maturiteMoyenne(duPays) as number)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-500">
                          {nf0.format(duPays.length)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-800">
                    <td className="px-2 py-1.5">Total général</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formater(agreger("propose", filtrees), "milliards")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formater(agreger("soumis", filtrees), "milliards")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-blue-800">
                      {formater(agreger("retenu", filtrees), "milliards")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formater(agreger("couverture", filtrees), "pourcent")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formater(agreger("absorption", filtrees), "pourcent")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formater(agreger("tmp", filtrees), "pourcent")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formater(agreger("tauxMarginal", filtrees), "pourcent")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formater(agreger("pmp", filtrees), "prix")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {nf1.format(maturiteMoyenne(filtrees) ?? 0)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {nf0.format(filtrees.length)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Montants en milliards de FCFA, maturité moyenne en années, prix pour 10 000 F de
              nominal.
            </p>
          </section>

          {/* ====== ÉVOLUTION ====== */}
          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Levées mensuelles et coût de la ressource</h2>
            <p className={aideSection}>
              Montants retenus par instrument (barres, milliards) et taux moyen pondéré de
              l&apos;ensemble des adjudications du mois (ligne, %).
            </p>
            <div className="h-72 mt-2">
              <ResponsiveContainer>
                <ComposedChart data={mensuel} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="mois"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    minTickGap={24}
                  />
                  <YAxis
                    yAxisId="montant"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={50}
                    tickFormatter={(v: number) => nf0.format(v)}
                  />
                  <YAxis
                    yAxisId="taux"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={45}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => nf1.format(v)}
                  />
                  <Tooltip
                    formatter={tooltip((v, n) =>
                      n === "tmp" ? [`${nf2.format(v)} %`, "TMP"] : [`${nf1.format(v)} Mds`, n],
                    )}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} itemSorter={null} />
                  <Bar yAxisId="montant" dataKey="BAT" stackId="i" fill="#93c5fd" name="BAT" />
                  <Bar yAxisId="montant" dataKey="OAT" stackId="i" fill="#1d4ed8" name="OAT" />
                  <Line
                    yAxisId="taux"
                    type="monotone"
                    dataKey="tmp"
                    stroke="#dc2626"
                    strokeWidth={1.8}
                    dot={false}
                    connectNulls
                    name="TMP"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className={`${carte} p-3`}>
            <h2 className={titreSection}>Tension du marché : couverture et absorption</h2>
            <p className={aideSection}>
              La couverture dit l&apos;appétit des investisseurs, l&apos;absorption dit la
              sélectivité de l&apos;émetteur. Une couverture qui monte pendant que
              l&apos;absorption baisse, c&apos;est un État qui peut choisir.
            </p>
            <div className="h-64 mt-2">
              <ResponsiveContainer>
                <LineChart data={mensuel} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mois" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={24} />
                  {/* Départ à zéro IMPOSÉ. Les deux séries n'ont pas le même
                      ordre de grandeur — la couverture dépasse souvent 200 %,
                      l'absorption tourne autour de 55 % — et l'échelle
                      automatique, calée sur la plus haute, rejetait purement et
                      simplement l'absorption sous le cadre. */}
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={50}
                    domain={[0, "auto"]}
                    tickFormatter={(v: number) => `${nf0.format(v)} %`}
                  />
                  <Tooltip
                    formatter={tooltip((v, n) => [`${nf1.format(v)} %`, n])}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} itemSorter={null} />
                  <Line
                    type="monotone"
                    dataKey="couverture"
                    stroke="#16a34a"
                    strokeWidth={1.8}
                    dot={false}
                    connectNulls
                    name="Couverture"
                  />
                  <Line
                    type="monotone"
                    dataKey="absorption"
                    stroke="#ea580c"
                    strokeWidth={1.8}
                    dot={false}
                    connectNulls
                    name="Absorption"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <p className="text-[10px] text-slate-400 px-1">
            Source : UMOA-Titres, adjudications réalisées du {premiere} au {derniere}.{" "}
            {filtrees.length} opération{filtrees.length > 1 ? "s" : ""} retenue
            {filtrees.length > 1 ? "s" : ""} par les filtres courants.
          </p>
        </>
      )}
    </div>
  );
}

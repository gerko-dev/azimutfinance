import Header from "@/components/Header";
import ImmobilierAnalyzer from "@/components/macro/ImmobilierAnalyzer";
import {
  buildHeatmap,
  buildQuartierSummaries,
  computeCatalogStats,
  computePriceM2ByQuartier,
  computeYields,
  findTopDeals,
  formatFCFA,
  formatPct,
  loadAllListings,
} from "@/lib/immobilier";

export const metadata = {
  title: "Immobilier Abidjan — AzimutFinance",
  description:
    "Prix médian par localité d'Abidjan : achat et location, par type de bien et nombre de chambres. Heatmap, rendements locatifs bruts, prix au m² et top deals.",
};

export const dynamic = "force-static";

function fmtDateFr(iso: string): string {
  if (!iso || iso.length < 10) return iso || "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default async function Page() {
  const allListings = loadAllListings();
  const stats = computeCatalogStats(allListings);

  if (allListings.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Immobilier Abidjan</h1>
          <p className="text-sm text-slate-600 mt-3">
            Aucune annonce dans la base. Lancer la collecte pour générer les données.
          </p>
        </main>
      </div>
    );
  }

  const heatmapAchat = buildHeatmap(allListings, "achat");
  const heatmapLocation = buildHeatmap(allListings, "location");

  const yieldsType = computeYields(allListings, {
    minSamples: 2,
    groupBy: "quartier_type",
  });
  const yieldsRoom = computeYields(allListings, {
    minSamples: 2,
    groupBy: "quartier_type_chambres",
  });

  const topDealsAchat = findTopDeals(allListings, "achat", { minGroupSize: 5, limit: 12 });
  const topDealsLocation = findTopDeals(allListings, "location", { minGroupSize: 5, limit: 12 });

  const priceM2Rows = computePriceM2ByQuartier(allListings, { minSamples: 3 });

  const quartierSummaries = buildQuartierSummaries(allListings);

  // KPIs hero
  const allAchat = allListings.filter((l) => l.transaction === "achat" && l.prix_fcfa !== null);
  const allLoc = allListings.filter((l) => l.transaction === "location" && l.prix_fcfa !== null);
  const medianAchat = (() => {
    const arr = allAchat.map((l) => l.prix_fcfa as number).sort((a, b) => a - b);
    return arr.length ? arr[Math.floor(arr.length / 2)] : null;
  })();
  const meanLoc = (() => {
    const arr = allLoc.map((l) => l.prix_fcfa as number);
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  })();
  const medianRendement = (() => {
    const ys = yieldsType.map((y) => y.rendement_brut_pct).sort((a, b) => a - b);
    return ys.length ? ys[Math.floor(ys.length / 2)] : null;
  })();

  const topQuartiers = quartierSummaries.slice(0, 8);

  const allQuartiers = Array.from(new Set(allListings.map((l) => l.quartier).filter(Boolean)))
    .sort((a, b) => {
      const ca = allListings.filter((l) => l.quartier === a).length;
      const cb = allListings.filter((l) => l.quartier === b).length;
      return cb - ca;
    });
  const allTypes = Array.from(new Set(allListings.map((l) => l.type_bien).filter(Boolean))).sort();

  const listingsLight = allListings.map((l) => ({
    source: l.source,
    transaction: l.transaction,
    type_bien: l.type_bien,
    titre: l.titre,
    prix_fcfa: l.prix_fcfa,
    surface_m2: l.surface_m2,
    prix_m2_fcfa: l.prix_m2_fcfa,
    chambres: l.chambres,
    quartier: l.quartier,
    sous_quartier: l.sous_quartier,
    standing: l.standing,
    url: l.url,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="text-xs text-slate-500 mb-2">
            Accueil &rsaquo; Macro &rsaquo; Immobilier
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
                Immobilier Abidjan
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1 max-w-3xl">
                Prix médian par localité, à l&apos;achat et à la location, par type de bien et
                nombre de chambres. {stats.totalListings.toLocaleString("fr-FR")} annonces actives ·
                {stats.uniqueQuartiers} localités · {stats.uniqueTypes} types de biens. Mise à jour au {fmtDateFr(stats.scrapedAt)}.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <HeroKpi
              label="Prix médian achat"
              value={formatFCFA(medianAchat)}
              suffix="FCFA"
              accent="text-slate-900"
              sub={`${stats.byTransaction.achat.toLocaleString("fr-FR")} annonces`}
            />
            <HeroKpi
              label="Loyer moyen / mois"
              value={formatFCFA(meanLoc)}
              suffix="FCFA"
              accent="text-slate-900"
              sub={`${stats.byTransaction.location.toLocaleString("fr-FR")} annonces`}
            />
            <HeroKpi
              label="Rendement brut médian"
              value={formatPct(medianRendement, 1)}
              accent={
                (medianRendement ?? 0) >= 8
                  ? "text-emerald-700"
                  : (medianRendement ?? 0) >= 5
                  ? "text-blue-700"
                  : "text-slate-900"
              }
              sub={`sur ${yieldsType.length} segments`}
            />
            <HeroKpi
              label="Localités couvertes"
              value={String(stats.uniqueQuartiers)}
              accent="text-slate-900"
              sub={`${stats.uniqueTypes} types de biens`}
            />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Tableau central : prix par localité */}
        <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 md:px-6 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-base md:text-lg font-semibold text-slate-900">
              Prix par localité — vue d&apos;ensemble
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Médianes sur l&apos;ensemble des annonces de chaque localité, tous types confondus.
              Le rendement brut est calculé là où achat et location coexistent.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase bg-slate-50/50">
                  <th className="text-left font-medium py-2 px-4">Localité</th>
                  <th className="text-left font-medium py-2 px-2">Type dominant</th>
                  <th className="text-right font-medium py-2 px-2">Achat médian</th>
                  <th className="text-right font-medium py-2 px-2">Loyer moyen / mois</th>
                  <th className="text-right font-medium py-2 px-2">Rendement brut</th>
                  <th className="text-right font-medium py-2 px-4">Annonces</th>
                </tr>
              </thead>
              <tbody>
                {quartierSummaries.map((q) => (
                  <tr key={q.quartier} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-4 font-medium text-slate-900">{q.quartier}</td>
                    <td className="py-2 px-2 text-slate-700 capitalize">{q.type_dominant || "—"}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {q.prix_achat_median !== null ? (
                        <span className="text-slate-900 font-medium">
                          {formatFCFA(q.prix_achat_median)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {q.loyer_mean !== null ? (
                        <span className="text-slate-900 font-medium">
                          {formatFCFA(q.loyer_mean)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {q.rendement_brut_pct !== null ? (
                        <span
                          className={`font-semibold ${
                            q.rendement_brut_pct >= 8
                              ? "text-emerald-700"
                              : q.rendement_brut_pct >= 5
                              ? "text-blue-700"
                              : "text-slate-700"
                          }`}
                        >
                          {formatPct(q.rendement_brut_pct, 1)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums text-slate-500">
                      {q.countAchat}A · {q.countLocation}L
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top quartiers cards */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base md:text-lg font-semibold text-slate-900">
              Localités les plus actives
            </h2>
            <span className="text-[11px] text-slate-400">
              Triées par volume d&apos;annonces · médianes en FCFA
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {topQuartiers.map((q) => (
              <QuartierCard
                key={q.quartier}
                quartier={q.quartier}
                countAchat={q.countAchat}
                countLocation={q.countLocation}
                medianAchat={q.prix_achat_median}
                meanLoyer={q.loyer_mean}
                rendement={q.rendement_brut_pct}
                typeDominant={q.type_dominant}
              />
            ))}
          </div>
        </section>

        {/* Studio analyse interactif */}
        <section>
          <ImmobilierAnalyzer
            listings={listingsLight}
            heatmapAchat={heatmapAchat}
            heatmapLocation={heatmapLocation}
            yieldsRoom={yieldsRoom}
            yieldsType={yieldsType}
            topDealsAchat={topDealsAchat.map((d) => ({
              listing: {
                source: d.listing.source,
                transaction: d.listing.transaction,
                type_bien: d.listing.type_bien,
                titre: d.listing.titre,
                prix_fcfa: d.listing.prix_fcfa,
                surface_m2: d.listing.surface_m2,
                prix_m2_fcfa: d.listing.prix_m2_fcfa,
                chambres: d.listing.chambres,
                quartier: d.listing.quartier,
                sous_quartier: d.listing.sous_quartier,
                standing: d.listing.standing,
                url: d.listing.url,
              },
              reference_median: d.reference_median,
              spread_pct: d.spread_pct,
              groupSize: d.groupSize,
            }))}
            topDealsLocation={topDealsLocation.map((d) => ({
              listing: {
                source: d.listing.source,
                transaction: d.listing.transaction,
                type_bien: d.listing.type_bien,
                titre: d.listing.titre,
                prix_fcfa: d.listing.prix_fcfa,
                surface_m2: d.listing.surface_m2,
                prix_m2_fcfa: d.listing.prix_m2_fcfa,
                chambres: d.listing.chambres,
                quartier: d.listing.quartier,
                sous_quartier: d.listing.sous_quartier,
                standing: d.listing.standing,
                url: d.listing.url,
              },
              reference_median: d.reference_median,
              spread_pct: d.spread_pct,
              groupSize: d.groupSize,
            }))}
            priceM2Rows={priceM2Rows}
            allQuartiers={allQuartiers}
            allTypes={allTypes}
          />
        </section>

        {/* Methodologie */}
        <section className="bg-white rounded-lg border border-slate-200 p-4 md:p-6">
          <h3 className="text-sm font-semibold mb-2">Méthodologie</h3>
          <div className="text-xs text-slate-600 space-y-1.5">
            <p>
              <strong>Périmètre :</strong> annonces actives sur le marché abidjanais, segmentées en
              <em> achat</em> (vente) et <em>location</em>. Les annonces dont le titre n&apos;est en
              fait qu&apos;un prix (artefact de collecte) sont écartées, ainsi que les terrains classés
              en location (presque toujours des erreurs : un terrain se vend, ne se loue pas).
            </p>
            <p>
              <strong>Bornes de plausibilité :</strong> 1 M – 5 Md FCFA pour l&apos;achat, 30 k – 20 M
              FCFA / mois pour la location. Au-delà, l&apos;annonce est considérée aberrante.
            </p>
            <p>
              <strong>Statistiques :</strong> on utilise systématiquement la <em>médiane</em>, pas la
              moyenne — bien plus robuste aux annonces extrêmes typiques des marketplaces. Les P25/P75
              délimitent l&apos;intervalle interquartile (50 % central des prix).
            </p>
            <p>
              <strong>Rendement locatif brut :</strong> calculé par groupe (localité × type [×
              chambres]) où on dispose d&apos;au moins 2 annonces de chaque côté. Formule :
              <span className="font-mono mx-1 text-[11px] bg-slate-100 px-1 rounded">(loyer moyen × 12) ÷ prix achat médian × 100</span>.
              <strong> Brut</strong> = avant charges, taxes, vacance, impayés. Compter 30–40 % de marge entre brut et net.
            </p>
            <p>
              <strong>Prix au m² :</strong> calculé uniquement quand la surface est renseignée dans
              l&apos;annonce (cas minoritaire). Les terrains sont exclus de cet agrégat car leur m²
              n&apos;est pas comparable au m² habitable d&apos;un bien bâti.
            </p>
            <p>
              <strong>Top deals :</strong> annonces dont le prix est nettement sous la médiane de
              leur groupe (localité × type × chambres, ≥ 5 annonces). Les écarts &gt; –50 % sont
              souvent du bruit ou des erreurs de classification — vérifier avant de cliquer.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function HeroKpi({
  label,
  value,
  sub,
  accent,
  suffix,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  suffix?: string;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-gradient-to-br from-white to-slate-50">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-xl md:text-2xl font-semibold tabular-nums mt-0.5 ${accent ?? "text-slate-900"}`}>
        {value}
        {suffix && <span className="text-[11px] text-slate-400 font-normal ml-1">{suffix}</span>}
      </div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function QuartierCard({
  quartier,
  countAchat,
  countLocation,
  medianAchat,
  meanLoyer,
  rendement,
  typeDominant,
}: {
  quartier: string;
  countAchat: number;
  countLocation: number;
  medianAchat: number | null;
  meanLoyer: number | null;
  rendement: number | null;
  typeDominant: string;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white hover:shadow-sm hover:border-slate-300 transition">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">{quartier}</div>
        <span className="text-[10px] text-slate-400 capitalize">{typeDominant}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-slate-500">Achat médian</div>
          <div className="text-sm font-semibold tabular-nums text-slate-900">
            {formatFCFA(medianAchat)}
          </div>
          <div className="text-[10px] text-slate-400">{countAchat} annonces</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500">Loyer moyen</div>
          <div className="text-sm font-semibold tabular-nums text-slate-900">
            {formatFCFA(meanLoyer)}
          </div>
          <div className="text-[10px] text-slate-400">{countLocation} annonces</div>
        </div>
      </div>
      {rendement !== null && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-baseline justify-between">
          <span className="text-[11px] text-slate-500">Rendement brut</span>
          <span
            className={`text-sm font-semibold tabular-nums ${
              rendement >= 8
                ? "text-emerald-700"
                : rendement >= 5
                ? "text-blue-700"
                : "text-slate-700"
            }`}
          >
            {formatPct(rendement, 1)}
          </span>
        </div>
      )}
    </div>
  );
}

import React from "react";
import Link from "next/link";
import ProPageHeader from "@/components/pros/ProPageHeader";
import {
  BIEN_CATEGORIES,
  BIEN_CATEGORIES_BY_TRANSACTION,
  BIEN_CATEGORIE_LABEL,
  UEMOA_COUNTRY_LABEL,
  UEMOA_COUNTRIES,
  computeDispersionByQuartier,
  computeHeroMediansFromListings,
  computePriceM2ByCountry,
  computePriceM2HierarchicalByCommune,
  computeYieldsHierarchicalByCommune,
  filterListings,
  formatFCFA,
  listAvailableCountries,
  listAvailableYears,
  loadAllListings,
  type BienCategorie,
  type CommuneM2Row,
  type CountryCode,
  type ListingFilters,
  type Transaction,
} from "@/lib/immobilier";
import ImmobilierAnalytics from "@/components/macro/ImmobilierAnalytics";

export const metadata = {
  title: "Immobilier UEMOA — Prix au m² — Pro Terminal",
  description:
    "Prix médian au m² par localité et par pays UEMOA, par catégorie : bureaux, logements, magasins, terrains. Achat et location.",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  country?: string;
  year?: string;
  transaction?: string;
}>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const allListings = loadAllListings();
  const countriesWithData = new Set(listAvailableCountries(allListings));
  const availableYears = listAvailableYears(allListings);

  // Toujours afficher les 7 pays UEMOA. Ceux sans donnée sont marqués.
  const defaultCountry: CountryCode = countriesWithData.has("CI") ? "CI" : "CI";

  const selectedCountry: CountryCode = UEMOA_COUNTRIES.includes(
    (sp.country ?? "").toUpperCase() as CountryCode,
  )
    ? ((sp.country ?? "").toUpperCase() as CountryCode)
    : defaultCountry;

  const selectedYear: number | undefined = sp.year
    ? Number(sp.year)
    : undefined;
  const selectedTransaction: Transaction | undefined =
    sp.transaction === "achat" || sp.transaction === "location"
      ? sp.transaction
      : undefined;

  const filters: ListingFilters = {
    country: selectedCountry,
    year: selectedYear,
    transaction: selectedTransaction,
  };

  const filtered = filterListings(allListings, filters);
  const rows = computePriceM2HierarchicalByCommune(filtered, {
    minSamplesCommune: 5,
    minSamplesQuartier: 3,
  });

  // Analytics
  const yieldsByCommune = computeYieldsHierarchicalByCommune(filtered, {
    minSamplesCommune: 3,
    minSamplesQuartier: 3,
  });
  // Pour la comparaison cross-pays, on retire le filtre pays (sinon une seule ligne)
  const crossCountryListings = filterListings(allListings, {
    year: selectedYear,
    transaction: selectedTransaction,
  });
  const pricesByCountryAchat = computePriceM2ByCountry(crossCountryListings, "achat", { minSamples: 5 });
  const pricesByCountryLocation = computePriceM2ByCountry(crossCountryListings, "location", { minSamples: 5 });
  const dispersionAchat = computeDispersionByQuartier(filtered, "achat", "logements", { minSamples: 5, topN: 15 });
  const dispersionLocation = computeDispersionByQuartier(filtered, "location", "logements", { minSamples: 5, topN: 15 });

  const heroAchat = computeHeroMediansFromListings(filtered, "achat");
  const heroLocation = computeHeroMediansFromListings(filtered, "location");

  const showAchatTable = !selectedTransaction || selectedTransaction === "achat";
  const showLocationTable =
    !selectedTransaction || selectedTransaction === "location";

  // Build base query string for filter links (preserves other filters)
  const qsBase = (overrides: Partial<{ country: string; year: string; transaction: string }>) => {
    const params = new URLSearchParams();
    const country = overrides.country ?? selectedCountry;
    if (country) params.set("country", country);
    const year = "year" in overrides ? overrides.year : sp.year;
    if (year) params.set("year", year);
    const tx = "transaction" in overrides ? overrides.transaction : selectedTransaction;
    if (tx) params.set("transaction", tx);
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <ProPageHeader
        title="Immobilier UEMOA — Prix au m²"
        subtitle="Prix médian au m² par localité, à l'achat et à la location, pour quatre catégories de biens : bureaux, logements, magasins, terrains. Filtrer par pays, année et type de transaction."
        breadcrumb={[
          { label: "Pro Terminal", href: "/pros" },
          { label: "Immobilier" },
        ]}
        badge="Pro"
      />

      <div className="pro-tool space-y-6">
        {/* FILTRES */}
        <div className="space-y-2">
          <FilterRow label="Pays">
            {UEMOA_COUNTRIES.map((c) => (
              <FilterPill
                key={c}
                href={qsBase({ country: c })}
                label={UEMOA_COUNTRY_LABEL[c]}
                active={c === selectedCountry}
                muted={!countriesWithData.has(c)}
              />
            ))}
          </FilterRow>
          {availableYears.length > 1 && (
            <FilterRow label="Année">
              <FilterPill
                href={qsBase({ year: "" })}
                label="Toutes"
                active={selectedYear === undefined}
              />
              {availableYears.map((y) => (
                <FilterPill
                  key={y}
                  href={qsBase({ year: String(y) })}
                  label={String(y)}
                  active={selectedYear === y}
                />
              ))}
            </FilterRow>
          )}
          <FilterRow label="Transaction">
            <FilterPill
              href={qsBase({ transaction: "" })}
              label="Toutes"
              active={selectedTransaction === undefined}
            />
            <FilterPill
              href={qsBase({ transaction: "achat" })}
              label="Achat"
              active={selectedTransaction === "achat"}
            />
            <FilterPill
              href={qsBase({ transaction: "location" })}
              label="Location"
              active={selectedTransaction === "location"}
            />
          </FilterRow>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {BIEN_CATEGORIES.map((c) => {
            const showAchatForCat =
              showAchatTable && BIEN_CATEGORIES_BY_TRANSACTION.achat.includes(c);
            const showLocationForCat =
              showLocationTable &&
              BIEN_CATEGORIES_BY_TRANSACTION.location.includes(c);
            if (!showAchatForCat && !showLocationForCat) return null;
            return (
              <HeroKpi
                key={c}
                label={BIEN_CATEGORIE_LABEL[c]}
                achat={heroAchat[c]}
                location={heroLocation[c]}
                showAchat={showAchatForCat}
                showLocation={showLocationForCat}
              />
            );
          })}
        </div>

        {/* TABLES + ANALYTICS */}
        {rows.length === 0 ? (
          <section className="bg-white rounded-lg border border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-500">
              Aucune donnée disponible pour le filtre sélectionné ({UEMOA_COUNTRY_LABEL[selectedCountry]}
              {selectedYear !== undefined ? ` · ${selectedYear}` : ""}
              {selectedTransaction !== undefined ? ` · ${selectedTransaction}` : ""}).
              Élargir le filtre ou relancer le scrape multi-pays.
            </p>
          </section>
        ) : (
          <>
            {showAchatTable && (
              <PriceM2Table
                title={`Prix d'achat médian au m² — ${UEMOA_COUNTRY_LABEL[selectedCountry]}`}
                subtitle="Médianes par commune (drill-down quartiers si dispo). Min. 5 annonces par commune, 3 par quartier. Unité : FCFA/m²."
                rows={rows}
                transaction="achat"
                globalMedians={heroAchat}
              />
            )}
            {showLocationTable && (
              <PriceM2Table
                title={`Loyer médian au m² / mois — ${UEMOA_COUNTRY_LABEL[selectedCountry]}`}
                subtitle="Médianes des loyers mensuels par commune (drill-down quartiers). Min. 5 annonces par commune, 3 par quartier. Unité : FCFA/m²/mois."
                rows={rows}
                transaction="location"
                globalMedians={heroLocation}
              />
            )}

            <ImmobilierAnalytics
              yieldsByCommune={yieldsByCommune}
              pricesByCountryAchat={pricesByCountryAchat}
              pricesByCountryLocation={pricesByCountryLocation}
              dispersionAchat={dispersionAchat}
              dispersionLocation={dispersionLocation}
              showAchat={showAchatTable}
              showLocation={showLocationTable}
            />
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium min-w-[80px]">
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

function FilterPill({
  href,
  label,
  active,
  muted,
}: {
  href: string;
  label: string;
  active: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      title={muted ? "Pas encore de données dans la base — sélectionne pour voir" : undefined}
      className={`text-[11px] px-2.5 py-1 rounded-md border transition ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : muted
          ? "bg-white text-slate-400 border-slate-200 hover:bg-slate-50 italic"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
      {muted && !active && <span className="ml-1 text-slate-300">·</span>}
    </Link>
  );
}

function HeroKpi({
  label,
  achat,
  location,
  showAchat,
  showLocation,
}: {
  label: string;
  achat: number | null;
  location: number | null;
  showAchat: boolean;
  showLocation: boolean;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-gradient-to-br from-white to-slate-50">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">
        {label}
      </div>
      <div className="mt-2 space-y-1">
        {showAchat && (
          <div>
            <div className="text-[10px] text-slate-400">Achat médian</div>
            <div className="text-base md:text-lg font-semibold tabular-nums text-slate-900">
              {achat !== null ? (
                <>
                  {formatFCFA(achat)}
                  <span className="text-[10px] text-slate-400 font-normal ml-1">F/m²</span>
                </>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </div>
          </div>
        )}
        {showLocation && (
          <div>
            <div className="text-[10px] text-slate-400">Loyer médian</div>
            <div className="text-sm font-semibold tabular-nums text-slate-700">
              {location !== null ? (
                <>
                  {formatFCFA(location)}
                  <span className="text-[10px] text-slate-400 font-normal ml-1">F/m²/mois</span>
                </>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceM2Table({
  title,
  subtitle,
  rows,
  transaction,
  globalMedians,
}: {
  title: string;
  subtitle: string;
  rows: CommuneM2Row[];
  transaction: Transaction;
  globalMedians: Record<BienCategorie, number | null>;
}) {
  const cats = BIEN_CATEGORIES_BY_TRANSACTION[transaction];
  const filtered = rows.filter(
    (r) =>
      cats.some((c) => r[transaction][c] !== null) ||
      r.children.some((ch) => cats.some((c) => ch[transaction][c] !== null)),
  );

  function cellClass(v: number, c: BienCategorie): string {
    const ref = globalMedians[c];
    if (ref === null) return "text-slate-900";
    if (v >= ref * 1.3) return "text-rose-700";
    if (v <= ref * 0.7) return "text-emerald-700";
    return "text-slate-900";
  }

  function renderCell(
    v: number | null,
    c: BienCategorie,
    weight: "bold" | "normal",
  ) {
    if (v === null) return <span className="text-slate-300">—</span>;
    return (
      <span className={`${weight === "bold" ? "font-semibold" : "font-medium"} ${cellClass(v, c)}`}>
        {formatFCFA(v)}
      </span>
    );
  }

  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 md:px-6 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base md:text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      {filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          Aucune donnée disponible pour cette transaction.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase bg-slate-50/50">
                <th className="text-left font-medium py-2 px-4">Localité</th>
                {cats.map((c) => (
                  <th key={c} className="text-right font-medium py-2 px-3">
                    {BIEN_CATEGORIE_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => {
                const prevRegion = idx > 0 ? filtered[idx - 1].region : "";
                const showRegionHeader = r.region && r.region !== prevRegion;
                return (
                  <React.Fragment key={r.commune}>
                    {showRegionHeader && (
                      <tr className="bg-slate-100 border-t-2 border-slate-300">
                        <td
                          colSpan={cats.length + 1}
                          className="py-1.5 px-4 text-[10px] uppercase tracking-wider font-bold text-slate-600"
                        >
                          {r.region}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-4 font-semibold text-slate-900">
                        {r.commune}
                        {r.children.length > 0 && (
                          <span
                            className="ml-1.5 text-[10px] text-amber-600 font-normal"
                            title="Drill-down quartiers disponible"
                          >
                            *
                          </span>
                        )}
                      </td>
                      {cats.map((c) => (
                        <td
                          key={c}
                          className="py-2 px-3 text-right tabular-nums"
                        >
                          {renderCell(r[transaction][c], c, "bold")}
                        </td>
                      ))}
                    </tr>
                    {r.children.map((ch) => (
                      <tr
                        key={`${r.commune}|${ch.quartier}`}
                        className="border-t border-slate-50 bg-slate-50/30 hover:bg-slate-50"
                      >
                        <td className="py-1.5 pl-8 pr-4 text-slate-700">
                          <span className="text-slate-400 mr-1">└</span>
                          {ch.quartier}
                        </td>
                        {cats.map((c) => (
                          <td
                            key={c}
                            className="py-1.5 px-3 text-right tabular-nums"
                          >
                            {renderCell(ch[transaction][c], c, "normal")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/70">
                <td className="py-2 px-4 text-[11px] font-semibold text-slate-700">
                  Médiane globale (pondérée par annonces)
                </td>
                {cats.map((c) => (
                  <td key={c} className="py-2 px-3 text-right tabular-nums">
                    {globalMedians[c] !== null ? (
                      <span className="text-[11px] font-semibold text-slate-700">
                        {formatFCFA(globalMedians[c])}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="px-4 md:px-6 py-2 text-[10px] text-slate-400 border-t border-slate-100">
        Vert = ≥30 % sous la médiane globale. Rouge = ≥30 % au-dessus. <span className="text-amber-600">*</span> = drill-down quartiers disponible.
      </div>
    </section>
  );
}

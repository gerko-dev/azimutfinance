import Link from "next/link";
import Header from "@/components/Header";
import {
  BIEN_CATEGORIES,
  BIEN_CATEGORIE_LABEL,
  UEMOA_COUNTRY_LABEL,
  UEMOA_COUNTRIES,
  computePriceM2ByQuartierAndCategorie,
  filterListings,
  formatFCFA,
  listAvailableCountries,
  listAvailableYears,
  loadAllListings,
  median,
  type BienCategorie,
  type CountryCode,
  type ListingFilters,
  type PriceM2CategoryRow,
  type Transaction,
} from "@/lib/immobilier";

export const metadata = {
  title: "Immobilier UEMOA — Prix au m² par localité — AzimutFinance",
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
  const rows = computePriceM2ByQuartierAndCategorie(filtered, { minSamples: 2 });

  const heroAchat = computeHeroMedians(rows, "achat");
  const heroLocation = computeHeroMedians(rows, "location");

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
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div className="text-xs text-slate-400 mb-2">
            Accueil &rsaquo; Macro &rsaquo; Immobilier
          </div>
          <div className="mb-4">
            <h1 className="text-2xl md:text-3xl font-semibold text-white">
              Immobilier UEMOA — Prix au m²
            </h1>
            <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-3xl">
              Prix médian au m² par localité, à l&apos;achat et à la location, pour quatre
              catégories de biens : bureaux, logements, magasins, terrains.
              Filtrer par pays, année et type de transaction.
            </p>
          </div>

          {/* FILTRES */}
          <div className="space-y-2 mb-5">
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
            {BIEN_CATEGORIES.map((c) => (
              <HeroKpi
                key={c}
                label={BIEN_CATEGORIE_LABEL[c]}
                achat={heroAchat[c]}
                location={heroLocation[c]}
                showAchat={showAchatTable}
                showLocation={showLocationTable}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
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
                subtitle="Médianes par localité. Minimum 3 annonces par cellule sinon vide. Unité : FCFA/m²."
                rows={rows}
                transaction="achat"
              />
            )}
            {showLocationTable && (
              <PriceM2Table
                title={`Loyer médian au m² / mois — ${UEMOA_COUNTRY_LABEL[selectedCountry]}`}
                subtitle="Médianes des loyers mensuels par localité, ramenés au mètre carré. Unité : FCFA/m²/mois."
                rows={rows}
                transaction="location"
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function computeHeroMedians(
  rows: PriceM2CategoryRow[],
  transaction: Transaction,
): Record<BienCategorie, number | null> {
  const out: Record<BienCategorie, number | null> = {
    bureaux: null,
    logements: null,
    magasins: null,
    terrains: null,
  };
  for (const c of BIEN_CATEGORIES) {
    const values = rows
      .map((r) => r[transaction][c])
      .filter((v): v is number => v !== null);
    out[c] = median(values);
  }
  return out;
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
}: {
  title: string;
  subtitle: string;
  rows: PriceM2CategoryRow[];
  transaction: Transaction;
}) {
  const filtered = rows.filter((r) =>
    BIEN_CATEGORIES.some((c) => r[transaction][c] !== null),
  );

  const refMedians: Record<BienCategorie, number | null> = {
    bureaux: null,
    logements: null,
    magasins: null,
    terrains: null,
  };
  for (const c of BIEN_CATEGORIES) {
    const values = filtered
      .map((r) => r[transaction][c])
      .filter((v): v is number => v !== null);
    refMedians[c] = median(values);
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
                {BIEN_CATEGORIES.map((c) => (
                  <th key={c} className="text-right font-medium py-2 px-3">
                    {BIEN_CATEGORIE_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.quartier} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-4 font-medium text-slate-900">{r.quartier}</td>
                  {BIEN_CATEGORIES.map((c) => {
                    const v = r[transaction][c];
                    const ref = refMedians[c];
                    return (
                      <td key={c} className="py-2 px-3 text-right tabular-nums">
                        {v !== null ? (
                          <span
                            className={`font-medium ${
                              ref !== null && v >= ref * 1.3
                                ? "text-rose-700"
                                : ref !== null && v <= ref * 0.7
                                ? "text-emerald-700"
                                : "text-slate-900"
                            }`}
                          >
                            {formatFCFA(v)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/70">
                <td className="py-2 px-4 text-[11px] font-semibold text-slate-700">
                  Médiane globale
                </td>
                {BIEN_CATEGORIES.map((c) => (
                  <td key={c} className="py-2 px-3 text-right tabular-nums">
                    {refMedians[c] !== null ? (
                      <span className="text-[11px] font-semibold text-slate-700">
                        {formatFCFA(refMedians[c])}
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
        Vert = ≥30 % sous la médiane globale. Rouge = ≥30 % au-dessus.
      </div>
    </section>
  );
}

@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — eslint (uses `eslint-config-next` flat config in `eslint.config.mjs`)

There is no test runner configured in this repo.

## Architecture

This is a French-language financial portal for the BRVM / UEMOA market (West African). Stack: Next.js 16 App Router, React 19, Tailwind v4, Recharts, papaparse. No database, no API backend — **all data is loaded server-side from CSV files in `data/`**.

### Data flow (the central concept)

`lib/dataLoader.ts` is the single source of CSV ingestion. It uses Node `fs` + `papaparse` and is therefore **only callable from server components / route handlers** — never from a `"use client"` file. Pages call loader functions directly during render and pass plain JSON down to client components for interactivity (charts, filters, tabs).

CSV conventions baked into `parseCSV` and `parseNum`:
- Delimiter is `;` (not `,`); BOM is stripped.
- Numbers may be standard (`12345.67`), French (`12 345,67`), or French scientific from Excel (`1,23E+11`). Sentinel values `""`, `NC`, `-` mean "missing".
- Dates may be ISO (`YYYY-MM-DD`) or French (`DD/MM/YYYY`); `normalizeDateISO` standardizes.
- Several loaders memoize at module scope (`_emissionsCache`, `_allHistoryCache`, etc.) — a single CSV is parsed once per server process. Don't add a parse call inside a tight loop; reuse the existing `loadAllPriceHistory()` style.

CSV files in `data/` are git-tracked source-of-truth content; treat them like code, not scratch data.

### Two parallel bond systems

There are two distinct bond domains. Don't conflate them:

- **`lib/bondsUEMOA.ts`** — souverains UMOA-Titres (raw OAT/BAT auction data). Types: `Bond`, `IssuanceResult`. Used for the YTM simulator and the "souverains non cotés" view. Loaded from `obligations.csv` and `emissions.csv`.
- **`lib/listedBondsTypes.ts`** — BRVM-listed bonds with full lifecycle (amortization schedules IF/AC/ACD, ratings, callable, green bonds). Types: `ListedBond`, `ListedBondPrice`, `ListedBondEvent`, `EmissionUMOA`. Includes the theoretical-pricing curve calibrated from UMOA-Titres auctions (`calibrateTheoreticalYTM`, `theoreticalCleanPrice`, `buildTheoreticalPriceHistory`, `calculateSignatureSpread`). Loaded from `obligations-cotees*.csv` plus `emissions.csv`.

`lib/bondMath.ts` is the actuarial engine for the simpler `Bond` type: Act/365 day count, YTM by bisection from clean price, Macaulay/modified duration, convexity, and the "average 3-month sovereign yield by country" used as the theoretical benchmark. The listed-bond pricing in `bondsUEMOA.ts` re-implements its own actuarial pipeline because it must handle amortization (`amortPerPeriod`, reconstruction of initial nominal from current outstanding). Don't try to share code between the two without understanding the amortization logic.

### App Router layout

- Top-level sections under `app/`: `marches/` (actions, obligations, fcp, souverains-non-cotes), `marche-monetaire/`, `outils/` (ytm, screener, comparateur, alertes, portefeuille), `macro/`, `academie/`, `communaute/`, `pros/`.
- Dynamic routes: `app/titre/[code]/page.tsx` (stock detail by ticker) and `app/obligation/[isin]/page.tsx` (bond detail by ISIN). Params are async (`params: Promise<{ code: string }>`) — Next 16 convention.
- Some pages opt into `export const dynamic = "force-static"` to bake CSV reads at build time.
- Path alias: `@/*` resolves to the repo root (so `@/lib/dataLoader`, `@/components/Header`).

### UI conventions

- All user-facing copy is French; identifiers and types are French-flavored too (`titres`, `obligations`, `souverains`, `rendement`, `couru`). Preserve the language when adding strings.
- Numbers are formatted for fr-FR with non-breaking spaces as thousand separators (see `formatStockForUI`).
- Charts use Recharts in client components; the server page assembles series and passes them as props.

## Next.js 16 caveat

Per `AGENTS.md` (imported above): this is Next.js 16, not the version most training data covers. APIs, conventions, and file structure differ. Before writing non-trivial framework code (route handlers, caching, params, metadata, server actions), read the relevant guide in `node_modules/next/dist/docs/`. Heed deprecation notices.

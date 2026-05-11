---
name: FCP / OPCVM data semantics
description: Two-source FCP loader — aumfcp (quarterly history) + fcp.csv (daily BOC scrape); no risk metrics calculable.
type: project
---

`lib/fcp.ts` charge deux sources :

- **`data/fcp/aumfcp.csv`** (latin-1, `;`) — historique trimestriel publié par l'AGP UEMOA. 4 dates par an (31/03, 30/06, 30/09, 31/12), 3 ans d'historique. Donne VL + Actif net pour chaque fonds. Sert de grille de référence pour les perfs et les agrégats d'encours.
- **`data/fcp.csv`** (utf-8, `;`) — scrap quotidien du Bulletin Officiel de la Cote (BOC) BRVM, dernière page. Apporte la VL la plus récente intra-trimestre, le dépositaire, la fréquence de calcul. Le scraper Python résout déjà `gestionnaire` + `nomAumfcp` (matching tokens/alias), donc le pont côté TS est trivial : `(gestionnaire, fundNameKey(nomAumfcp))`.

**Why:** `data/dataasgop.csv` (legacy) a été remplacé. La nouvelle architecture sépare proprement l'historique de référence (aumfcp) du flux quotidien (fcp.csv), et le matching de noms est fait une seule fois côté scraper plutôt que dans le loader TS.

**How to apply:**
- Ne PAS calculer de volatilité, Sharpe, drawdown, capture ratio, hit rate — la fréquence hétérogène (trimestriel + quelques VL BOC) et la rareté des points rendent ces métriques non représentatives. L'utilisateur l'a explicitement demandé.
- Métriques valides : performance cumulée TWR (3M, 6M, YTD, 1Y, 3Y, depuis création), perf annualisée, quartile catégorie, dynamique d'AUM, flux nets implicites, persistance des quartiles.
- L'AUM (Actif net) n'est dispo qu'aux fins de trimestre — toute analyse d'encours doit s'aligner sur la grille trimestrielle (`refQuarter`).
- Pour la VL "à date", le loader injecte la VL BOC comme observation `kind: "latest"` si plus récente que la dernière obs aumfcp. `fund.bocSnapshot` expose le snapshot brut (dépositaire, fréquence, Δ jour).
- Ne plus référencer `dataasgop.csv` — il n'est plus dans le catalog admin ni utilisé par aucun loader.

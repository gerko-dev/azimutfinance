---
name: FCP / OPCVM data semantics
description: How dataasgop.csv is structured semantically — quarterly VL + last published VL, no risk metrics
type: project
---

`data/dataasgop.csv` contient des observations de fonds OPCVM UEMOA avec une sémantique mixte :

- **Lignes datées en fin de trimestre (mar/juin/sept/déc 31)** : données trimestrielles publiées (VL + Actif net).
- **Lignes datées en intra-trimestre, SANS Actif net** : ce sont les **dernières VL publiées** par le fonds (certains publient en quotidien, d'autres seulement au trimestre). Ces lignes ne sont PAS du bruit — c'est le point le plus récent disponible pour ce fonds.

**Why:** la fréquence de publication varie d'un fonds à l'autre (quotidien vs trimestriel). On capture ce que chaque fonds publie à sa propre cadence, mais on ne dispose pas de l'historique journalier.

**How to apply:**
- Ne PAS calculer de volatilité, Sharpe, drawdown, capture ratio, hit rate — la fréquence hétérogène et la rareté des points (4 obs/an pour la plupart) rendent ces métriques non représentatives. L'utilisateur l'a explicitement demandé.
- Métriques valides : performance cumulée TWR (3M, 6M, YTD, 1Y, 3Y, depuis création), perf annualisée, quartile catégorie, dynamique d'AUM, flux nets implicites, persistance des quartiles.
- L'AUM (Actif net) n'est dispo qu'aux fins de trimestre — toute analyse d'encours doit s'aligner sur la grille trimestrielle.
- Pour la VL "à date", utiliser la dernière ligne disponible du fonds (qui peut être un point intra-trimestre marqué comme "dernière VL publiée").

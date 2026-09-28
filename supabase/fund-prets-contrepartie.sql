-- ============================================================
-- PRETS DE TITRES : la contrepartie manquait a la table
-- ============================================================
--
-- Symptome : « Could not find the 'contrepartie' column of 'fund_market_loans'
-- in the schema cache » a la validation d'un pret de titres.
--
-- Cause : une version ANTERIEURE de `fund-remeres-prets.sql` a ete jouee. Elle
-- creait la table avec un `statut` et un `interet_a_recevoir` en colonnes, et
-- sans contrepartie. La version courante fait l'inverse -- la contrepartie se
-- saisit, le statut et l'interet se DEDUISENT --, mais elle n'a jamais ete
-- rejouee.
--
-- POURQUOI UN SCRIPT SEPARE PLUTOT QUE REJOUER L'AUTRE : `fund-remeres-prets`
-- reposait aussi la contrainte des natures de partenaire, dans une liste qui
-- ignore « client ». Le referentiel en compte trois : le rejouer echouerait
-- sur eux. La contrainte appartient desormais a `market-partners-client.sql`,
-- qui seul la definit.
--
-- Rejouable sans risque.

-- Etablissement emprunteur, choisi parmi les banques agreees de l'UMOA.
alter table public.fund_market_loans
  add column if not exists contrepartie text not null default '';

-- STATUT ET INTERET NE SE STOCKENT PAS.
--
-- Le statut decoule de la reprise : les titres sont revenus, ou ils ne le sont
-- pas. L'interet a recevoir decoule du taux et de la duree -- valeur pretee x
-- taux x jours / 360, de la date du pret a sa fin ou a sa reprise. Les garder
-- en colonnes, c'etait accepter qu'ils divergent du taux saisi juste a cote,
-- sans que rien ne le signale.
alter table public.fund_market_loans drop constraint if exists fund_market_loans_statut_chk;
alter table public.fund_market_loans drop column if exists statut;
alter table public.fund_market_loans drop column if exists interet_a_recevoir;

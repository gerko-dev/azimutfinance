-- ============================================================
-- PRETS DE TITRES : rapprocher l'interet recu
-- ============================================================
--
-- CE QUE L'INTERET D'UN PRET N'AVAIT PAS : une place au point de tresorerie.
-- Preter des titres ne deplace pas de cash au moment ou le pret se noue -- le
-- classeur n'a donc aucun poste pour lui --, mais le pret RAPPORTE, et cet
-- argent-la rentre. Il se loge desormais dans « Autres flux entrants », parmi
-- les flux theoriques : certain dans son principe, pas encore encaisse.
--
-- ET COMME TOUT FLUX THEORIQUE, IL DOIT POUVOIR SORTIR. Une fois l'interet
-- constate sur le releve, le solde bancaire saisi le contient deja : l'y
-- laisser le compterait deux fois. D'ou cette colonne -- la DATE a laquelle le
-- reglement a ete lettre, exactement comme `rapproche_le` sur un ordre et sur
-- une execution. C'est un lettrage, pas une annulation : on la retire et
-- l'interet repese.
--
-- POURQUOI UNE DATE ET NON UN BOOLEEN : le point de tresorerie s'arrete a une
-- date, et un lettrage posterieur a l'arrete ne doit pas effacer un flux qui,
-- ce jour-la, n'etait pas encore encaisse. Seule une date permet de le dire.
--
-- Rejouable sans risque.

alter table public.fund_market_loans
  add column if not exists interet_rapproche_le date;

comment on column public.fund_market_loans.interet_rapproche_le is
  'Date a laquelle l''interet du pret a ete constate sur le releve bancaire. '
  'Tant qu''elle est nulle, l''interet pese dans AUTRES_FLUX_ENTRANT au point '
  'de tresorerie. Lettrage, pas annulation.';

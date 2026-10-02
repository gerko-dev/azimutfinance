-- ============================================================
-- AzimutFinance — Reglement des flux saisis
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-tresorerie-flux.sql.
-- ============================================================
--
-- UN FLUX REGLE N'A PLUS A PESER SUR LE POINT DE TRESORERIE.
--
-- Les quatre lignes « autres » se saisissent a la main parce que rien ne les
-- deduit -- appel de marge, regularisation, commission exceptionnelle. Une
-- fois le mouvement passe, le SOLDE BANCAIRE SAISI LE CONTIENT DEJA : le
-- laisser dans le point le comptait une seconde fois, et le gerant n'avait
-- d'autre moyen de s'en debarrasser que de SUPPRIMER la ligne -- ce qui
-- effacait la trace de ce qui s'etait passe.
--
-- C'EST UN LETTRAGE, PAS UNE ANNULATION. La ligne reste, elle sort seulement
-- des colonnes. C'est la meme regle que partout ailleurs dans le module : une
-- execution rapprochee, une jambe de nivellement constatee, un spot denoue, un
-- flux de parts regle.
--
-- LA DATE N'EST PAS UN BOOLEEN, et c'est voulu. Le point se lit aussi a une
-- date passee : un flux rapproche le 5 octobre pesait encore dans un arrete du
-- 30 septembre, et une simple case a cocher l'en aurait fait sortir
-- retroactivement. Avec la date, l'arrete d'hier reste ce qu'il etait.
alter table public.fund_treasury_flows
  add column if not exists rapproche_le date;

comment on column public.fund_treasury_flows.rapproche_le is
  'Date a laquelle le mouvement a ete constate sur le releve. Le flux sort '
  'alors du point de tresorerie : le solde bancaire saisi le contient deja. '
  'Null tant qu''il n''a pas bouge.';

-- Les flux NON REGLES sont ceux qu'on cherche a chaque calcul du point.
create index if not exists fund_treasury_flows_non_regles_idx
  on public.fund_treasury_flows (fund_id, date_flux desc)
  where rapproche_le is null;

-- ============================================================
-- AzimutFinance — Fix : suppression d'un membre bloquée par des FK
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent : peut etre rejoue sans casse.
--
-- Probleme : admin_delete_user fait `delete from auth.users` et compte sur le
-- `on delete cascade` des tables dependantes. Trois FK ne le faisaient pas et
-- bloquaient la suppression :
--
--   1. payments.user_id              : `on delete restrict`
--      → erreur "violates foreign key constraint payments_user_id_fkey"
--   2. brokerage_market_fees.updated_by : aucune clause on delete (= no action)
--   3. brokerage_tps_rates.updated_by   : aucune clause on delete (= no action)
--
-- Correctif : `on delete set null` partout. On PRESERVE les lignes (historique
-- de paiement = trace comptable ; updated_by = champ d'audit) mais on les delie
-- du compte supprime. Meme convention que payments.subscription_id, deja en
-- set null.
-- ============================================================

-- 1) payments.user_id : restrict → set null (+ colonne rendue nullable)
alter table public.payments
  alter column user_id drop not null;

alter table public.payments
  drop constraint if exists payments_user_id_fkey;

alter table public.payments
  add constraint payments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- 2) brokerage_market_fees.updated_by : no action → set null
alter table if exists public.brokerage_market_fees
  drop constraint if exists brokerage_market_fees_updated_by_fkey;

alter table if exists public.brokerage_market_fees
  add constraint brokerage_market_fees_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

-- 3) brokerage_tps_rates.updated_by : no action → set null
alter table if exists public.brokerage_tps_rates
  drop constraint if exists brokerage_tps_rates_updated_by_fkey;

alter table if exists public.brokerage_tps_rates
  add constraint brokerage_tps_rates_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

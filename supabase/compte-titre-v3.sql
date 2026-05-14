-- ============================================================
-- AzimutFinance — Suivi de compte titre v3
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent. A passer APRES compte-titre-v2.sql.
--
-- Apporte :
--  - Pays UEMOA de la SGI sur chaque compte (sgi_country)
--  - Suppression de default_stamp_pct (remplace par TPS pays-base)
--  - Table brokerage_tps_rates : taux TPS par pays UEMOA, admin only
--  - Colonne fees_tps sur les transactions (decomposition explicite)
-- ============================================================

-- ============================================================
-- 1) Comptes : ajout du pays SGI, suppression du stamp_pct
-- ============================================================

alter table public.brokerage_accounts
  add column if not exists sgi_country public.uemoa_country;

alter table public.brokerage_accounts
  drop column if exists default_stamp_pct;

-- ============================================================
-- 2) Transactions : ajout fees_tps
-- ============================================================

alter table public.brokerage_transactions
  add column if not exists fees_tps numeric not null default 0;

-- Mise a jour de la contrainte
alter table public.brokerage_transactions
  drop constraint if exists brokerage_txn_fees_chk;

alter table public.brokerage_transactions
  add constraint brokerage_txn_fees_chk check (
    fees_courtage >= 0 and fees_brvm >= 0 and fees_dcbr >= 0
    and fees_tps >= 0 and fees_other >= 0
  );

-- ============================================================
-- 3) Table brokerage_tps_rates : 1 ligne par pays UEMOA
-- ============================================================

create table if not exists public.brokerage_tps_rates (
  country     public.uemoa_country primary key,
  rate        numeric not null default 0, -- ex 0.10 = 10 %
  description text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

drop trigger if exists brokerage_tps_rates_set_updated_at on public.brokerage_tps_rates;
create trigger brokerage_tps_rates_set_updated_at
  before update on public.brokerage_tps_rates
  for each row execute procedure public.set_updated_at();

-- Seed : 8 pays UEMOA avec taux usuels TPS / TVA-equivalent sur prestations
-- Editable par les admins.
insert into public.brokerage_tps_rates (country, rate, description) values
  ('ci', 0.10, 'TPS Côte d''Ivoire — Taxe sur prestation de services appliquée au courtage SGI.'),
  ('sn', 0.17, 'TPS Sénégal — Taxe applicable aux services financiers / commissions.'),
  ('bj', 0.10, 'TPS Bénin — Taxe sur prestation de services appliquée au courtage SGI.'),
  ('bf', 0.10, 'TPS Burkina Faso — Taxe sur prestation de services appliquée au courtage SGI.'),
  ('ml', 0.18, 'TPS Mali — Taxe sur prestation de services appliquée au courtage SGI.'),
  ('ne', 0.17, 'TPS Niger — Taxe sur prestation de services appliquée au courtage SGI.'),
  ('tg', 0.13, 'TPS Togo — Taxe sur prestation de services appliquée au courtage SGI.'),
  ('gw', 0.17, 'TPS Guinée-Bissau — Taxe sur prestation de services appliquée au courtage SGI.')
on conflict (country) do nothing;

-- ============================================================
-- 4) RLS — lecture publique, ecriture admin L2+
-- ============================================================

alter table public.brokerage_tps_rates enable row level security;

drop policy if exists "tps_rates_select_all" on public.brokerage_tps_rates;
create policy "tps_rates_select_all"
  on public.brokerage_tps_rates for select
  to authenticated, anon
  using (true);

drop policy if exists "tps_rates_write_admin" on public.brokerage_tps_rates;
create policy "tps_rates_write_admin"
  on public.brokerage_tps_rates for all
  to authenticated
  using (public.is_admin_at_least(2))
  with check (public.is_admin_at_least(2));

-- ============================================================
-- 5) RPC admin : update TPS rate
-- ============================================================

create or replace function public.admin_update_tps_rate(
  p_country     public.uemoa_country,
  p_rate        numeric,
  p_description text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_rate < 0 then
    raise exception 'NEGATIVE_RATE';
  end if;
  update public.brokerage_tps_rates
    set rate = p_rate,
        description = coalesce(p_description, description),
        updated_by = auth.uid()
    where country = p_country;
  if not found then
    raise exception 'COUNTRY_NOT_FOUND';
  end if;
end;
$$;

grant execute on function public.admin_update_tps_rate(public.uemoa_country, numeric, text)
  to authenticated;

-- ============================================================
-- 6) RPC admin : statistiques globales du suivi compte titre
-- ============================================================

create or replace function public.admin_brokerage_stats()
returns table (
  total_accounts bigint,
  total_users bigint,
  total_transactions bigint,
  total_open_positions bigint,
  accounts_by_country jsonb,
  accounts_by_broker jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    (select count(*)::bigint from public.brokerage_accounts) as total_accounts,
    (select count(distinct user_id)::bigint from public.brokerage_accounts) as total_users,
    (select count(*)::bigint from public.brokerage_transactions) as total_transactions,
    (
      select count(*)::bigint from (
        select security_code, sum(
          case when type = 'buy' then coalesce(quantity, 0)
               when type = 'sell' then -coalesce(quantity, 0)
               else 0 end
        ) as net_qty
        from public.brokerage_transactions
        where security_code is not null
        group by account_id, security_code
        having sum(
          case when type = 'buy' then coalesce(quantity, 0)
               when type = 'sell' then -coalesce(quantity, 0)
               else 0 end
        ) > 0
      ) t
    ) as total_open_positions,
    (
      select coalesce(jsonb_object_agg(country_label, cnt), '{}'::jsonb)
      from (
        select coalesce(sgi_country::text, 'inconnu') as country_label,
               count(*)::int as cnt
        from public.brokerage_accounts
        group by sgi_country
        order by cnt desc
      ) t
    ) as accounts_by_country,
    (
      select coalesce(jsonb_object_agg(broker_label, cnt), '{}'::jsonb)
      from (
        select case when broker = '' then 'inconnu' else broker end as broker_label,
               count(*)::int as cnt
        from public.brokerage_accounts
        group by broker
        order by cnt desc
        limit 20
      ) t
    ) as accounts_by_broker;
end;
$$;

grant execute on function public.admin_brokerage_stats() to authenticated;

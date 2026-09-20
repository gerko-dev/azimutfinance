-- ============================================================
-- AzimutFinance — Un ordre, et ses executions
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-operations-marche.sql.
-- ============================================================
--
-- UN ORDRE N'A PAS DE DATE DE DENOUEMENT. Ce sont ses EXECUTIONS qui se
-- denouent : un ordre non servi n'a rien a regler, et un ordre servi en trois
-- fois se regle en trois fois, a trois dates. Porter une date unique sur
-- l'ordre obligeait a en inventer une pour ce qui n'etait pas encore execute,
-- et a en perdre deux sur trois pour ce qui l'etait.
--
-- LE STATUT SE DEDUIT, IL NE SE SAISIT PAS. Un ordre dont tout est servi est
-- realise ; un ordre partiellement servi est en cours ; un ordre dont la
-- validite est passee est perime. Le saisir a la main aurait cree un troisieme
-- etat : celui ou la colonne dit une chose et les quantites une autre.

create table if not exists public.fund_market_executions (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  operation_id  uuid not null references public.fund_market_operations(id) on delete cascade,

  -- Date a laquelle la quantite a ete servie, et date a laquelle les fonds
  -- bougent. Le denouement est calcule depuis la date d'execution selon la
  -- convention du marche, et reste modifiable : un reglement peut deraper.
  date_execution   date not null,
  date_denouement  date not null,
  quantite         numeric not null check (quantite > 0),

  note          text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- L'index sert l'agregation du point, qui filtre sur le denouement.
create index if not exists fund_market_executions_operation_idx
  on public.fund_market_executions (operation_id, date_denouement);

drop trigger if exists fund_market_executions_updated_at on public.fund_market_executions;
create trigger fund_market_executions_updated_at
  before update on public.fund_market_executions
  for each row execute function public.set_updated_at();

alter table public.fund_market_executions enable row level security;

drop policy if exists fund_market_executions_select on public.fund_market_executions;
create policy fund_market_executions_select on public.fund_market_executions
  for select using (owner_id = auth.uid());

drop policy if exists fund_market_executions_insert on public.fund_market_executions;
create policy fund_market_executions_insert on public.fund_market_executions
  for insert with check (owner_id = auth.uid());

drop policy if exists fund_market_executions_update on public.fund_market_executions;
create policy fund_market_executions_update on public.fund_market_executions
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fund_market_executions_delete on public.fund_market_executions;
create policy fund_market_executions_delete on public.fund_market_executions
  for delete using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- L'ordre : quatre natures, et plus de date de denouement.
-- ------------------------------------------------------------
--
-- « Valide » et « realise » cessaient d'etre des natures d'operation des lors
-- qu'une meme ligne peut etre l'un puis l'autre, et les deux a la fois quand
-- elle est partiellement servie. Il ne reste donc que le SENS et le MARCHE.
--
-- Le remere disparait : il ne se traite ni sur le marche financier ni par
-- adjudication, et le forcer dans ce formulaire produisait une saisie libre
-- que rien ne validait.

-- Les lignes existantes migrent vers la nature correspondante, et leur date de
-- denouement devient une premiere execution si elles portaient une quantite
-- servie.
--
-- ORDRE DES INSTRUCTIONS : la contrainte est retiree AVANT l'UPDATE.
-- L'inverse echoue — la ligne mise a jour porte deja la nouvelle valeur, que
-- l'ancienne contrainte refuse :
--   new row violates check constraint "fund_market_operations_description_chk"
-- Une contrainte se leve avant de changer ce qu'elle garde, pas apres.
alter table public.fund_market_operations
  drop constraint if exists fund_market_operations_description_chk;

-- `quantite_executee` et `date_denouement` peuvent avoir deja ete supprimees
-- par une execution precedente de ce script : on ne reprend les lignes que si
-- les colonnes sont encore la.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fund_market_operations'
      and column_name = 'quantite_executee'
  ) then
    execute $mig$
      insert into public.fund_market_executions
        (owner_id, operation_id, date_execution, date_denouement, quantite)
      select o.owner_id, o.id, o.date_operation, o.date_denouement, o.quantite_executee
      from public.fund_market_operations o
      where coalesce(o.quantite_executee, 0) > 0
        and not exists (
          select 1 from public.fund_market_executions e where e.operation_id = o.id
        )
    $mig$;
  end if;
end $$;

update public.fund_market_operations set description = case
  when description like 'ACHATS_MFR%' then 'ACHAT_MFR'
  when description like 'ACHATS_MTP%' then 'ACHAT_MTP'
  when description like 'VENTES_MFR%' then 'VENTE_MFR'
  when description like 'VENTES_MTP%' then 'VENTE_MTP'
  -- Le remere n'a pas d'equivalent : on le rattache au marche financier, d'ou
  -- il vient, plutot que de perdre la ligne.
  else 'ACHAT_MFR'
end
where description not in ('ACHAT_MFR', 'ACHAT_MTP', 'VENTE_MFR', 'VENTE_MTP');

alter table public.fund_market_operations
  add constraint fund_market_operations_description_chk
  check (description in ('ACHAT_MFR', 'ACHAT_MTP', 'VENTE_MFR', 'VENTE_MTP'));

alter table public.fund_market_operations
  drop constraint if exists fund_market_operations_statut_chk;
alter table public.fund_market_operations
  drop constraint if exists fund_market_operations_executee_chk;

alter table public.fund_market_operations drop column if exists statut;
alter table public.fund_market_operations drop column if exists quantite_executee;
alter table public.fund_market_operations drop column if exists date_denouement;

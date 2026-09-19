-- ============================================================
-- AzimutFinance — Partenaires de marche (SGI, et ce qui suivra)
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-management.sql.
-- ============================================================
--
-- POURQUOI UNE TABLE PLUTOT QU'UNE LISTE EN DUR. Les SGI avec lesquelles une
-- societe de gestion traite ne sont ni universelles ni stables : elles se
-- negocient, changent de referent, et leur taux de courtage se renegocie. Les
-- coder en dur aurait fige une relation commerciale dans le code.
--
-- LE TAUX DE COURTAGE STANDARD EST LA RAISON D'ETRE DE CETTE TABLE. Il est
-- reporte a la saisie d'une operation de marche : c'est ce qui evite de
-- retaper 0,004 a chaque ligne d'un bordereau, et surtout d'en retaper un
-- autre par inadvertance.
--
-- `kind` prepare la suite — BTCC, depositaires, contreparties de remere — sans
-- imposer une table par nature. Les BTCC, eux, ne sont PAS ici : ce sont les
-- banques du fonds, deja decrites par les comptes de tresorerie du
-- referentiel. Les saisir une seconde fois les ferait diverger.

create table if not exists public.market_partners (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,

  kind              text not null default 'sgi',
  nom               text not null,
  agrement          text not null default '',
  pays              text not null default '',
  email             text not null default '',
  telephone         text not null default '',
  adresse           text not null default '',

  -- Taux en DECIMAL (0.004 = 0,4 %), comme partout ailleurs dans le module.
  -- Trois taux et non un seul : le courtage se negocie, la TPS et la
  -- commission BRVM/DC-BR sont reglementaires mais varient dans le temps, et
  -- les melanger interdirait de corriger l'une sans toucher l'autre.
  taux_courtage     numeric not null default 0,
  taux_tps          numeric not null default 0,
  taux_brvm         numeric not null default 0,

  -- Jusqu'a trois referents, en JSON plutot qu'en table fille : ils n'ont
  -- aucune vie propre — on ne les cherche pas, on ne les partage pas entre
  -- partenaires — et une table de plus pour trois lignes couterait une
  -- jointure a chaque lecture.
  referents         jsonb not null default '[]'::jsonb,

  actif             boolean not null default true,
  note              text not null default '',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint market_partners_kind_chk check (kind in ('sgi', 'btcc', 'autre')),
  -- Un meme partenaire ne se saisit qu'une fois.
  unique (owner_id, kind, nom)
);

create index if not exists market_partners_owner_idx
  on public.market_partners (owner_id, kind, nom);

drop trigger if exists market_partners_updated_at on public.market_partners;
create trigger market_partners_updated_at
  before update on public.market_partners
  for each row execute function public.set_updated_at();

alter table public.market_partners enable row level security;

-- Le proprietaire, et lui seul.
drop policy if exists market_partners_select on public.market_partners;
create policy market_partners_select on public.market_partners
  for select using (owner_id = auth.uid());

drop policy if exists market_partners_insert on public.market_partners;
create policy market_partners_insert on public.market_partners
  for insert with check (owner_id = auth.uid());

drop policy if exists market_partners_update on public.market_partners;
create policy market_partners_update on public.market_partners
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists market_partners_delete on public.market_partners;
create policy market_partners_delete on public.market_partners
  for delete using (owner_id = auth.uid());

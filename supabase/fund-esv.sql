-- ============================================================
-- AzimutFinance - ESV : pointage des evenements sur valeurs
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-management.sql, fund-portfolio.sql.
-- ============================================================
--
-- LE CALENDRIER NE SE STOCKE PAS, IL SE CALCULE.
--
-- Les coupons, amortissements et remboursements decoulent des echeanciers du
-- referentiel obligataire ; les dividendes, du rendement et de l'historique de
-- detachement. Les figer en base aurait cree une seconde verite, qui aurait
-- diverge du referentiel des la premiere correction d'echeancier - et le
-- gerant aurait eu deux calendriers sans savoir lequel croire.
--
-- CE QUI SE STOCKE, C'EST LE POINTAGE : le fait qu'un flux ait ete RECU, a
-- quelle date et pour quel montant. Cela, aucun calcul ne peut le deviner.
--
-- Une ligne par flux pointe. Son absence vaut « pas encore recu » : c'est
-- l'etat de loin le plus frequent, et il ne merite pas une ligne.
--
-- LA CLEF DE L'EVENEMENT est reconstruite a chaque calcul a partir du titre,
-- de la date et de la nature du flux. Elle doit donc etre STABLE : un
-- changement de sa recette orphelinerait tous les pointages. Cf. `cleEvenement`
-- dans esv-types.ts, ou la recette est documentee et ne doit pas bouger.

create table if not exists public.fund_security_event_receipts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  fund_id         uuid not null references public.managed_funds(id) on delete cascade,
  -- Identite stable de l'evenement : titre | date attendue | nature.
  cle             text not null,
  date_reception  date not null,
  -- Le montant REELLEMENT encaisse, qui differe souvent de l'attendu :
  -- retenue a la source sur un dividende, arrondi du depositaire, quantite
  -- detenue a la date de detachement differente de celle de l'inventaire.
  -- C'est l'ecart entre les deux qui interesse le gerant.
  montant_recu    numeric not null default 0,
  -- Colonne du point de tresorerie ou l'encaissement est tombe.
  compte          text not null default '',
  note            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Un evenement ne se pointe qu'une fois par fonds.
  unique (fund_id, cle)
);

create index if not exists fund_security_event_receipts_fund_idx
  on public.fund_security_event_receipts (fund_id, date_reception desc);

drop trigger if exists fund_security_event_receipts_updated_at
  on public.fund_security_event_receipts;
create trigger fund_security_event_receipts_updated_at
  before update on public.fund_security_event_receipts
  for each row execute function public.set_updated_at();

alter table public.fund_security_event_receipts enable row level security;

drop policy if exists fund_security_event_receipts_select
  on public.fund_security_event_receipts;
create policy fund_security_event_receipts_select on public.fund_security_event_receipts
  for select using (owner_id = auth.uid());

drop policy if exists fund_security_event_receipts_insert
  on public.fund_security_event_receipts;
create policy fund_security_event_receipts_insert on public.fund_security_event_receipts
  for insert with check (owner_id = auth.uid());

drop policy if exists fund_security_event_receipts_update
  on public.fund_security_event_receipts;
create policy fund_security_event_receipts_update on public.fund_security_event_receipts
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fund_security_event_receipts_delete
  on public.fund_security_event_receipts;
create policy fund_security_event_receipts_delete on public.fund_security_event_receipts
  for delete using (owner_id = auth.uid());

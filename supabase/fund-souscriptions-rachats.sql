-- ============================================================
-- AzimutFinance — Souscriptions et rachats de parts
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-tresorerie.sql.
-- ============================================================
--
-- LE PASSIF DU FONDS, quand les operations de marche en sont l'actif. Un
-- investisseur qui souscrit apporte du cash, un investisseur qui demande son
-- rachat en retire. Ce sont les deux seuls flux que le gerant ne decide pas :
-- il les subit, et c'est bien pourquoi le tresorier veut les voir venir.
--
-- Le classeur avait deja les lignes, toutes vides — souscriptions par bureau
-- dans le cash a recevoir, rachats dans les engagements, et leurs jumelles
-- « probables » dans les flux theoriques. Cette table les remplit.

create table if not exists public.fund_unit_flows (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  fund_id       uuid not null references public.managed_funds(id) on delete cascade,

  -- Date de l'ORDRE. Descriptive : ce n'est pas elle qui fait peser le flux.
  date_operation  date not null,

  sens            text not null,

  -- Bureau collecteur. NULL sur un rachat : le classeur ne ventile que les
  -- souscriptions, parce que c'est une lecture commerciale — on veut savoir
  -- qui a collecte — et un rachat ne se collecte pas.
  bureau          text,

  -- CERTAIN ou PROBABLE, et la distinction est le coeur du tableau. Un ordre
  -- recu et signe pese dans les soldes ; une intention annoncee par un
  -- commercial vit dans les FLUX THEORIQUES, qui ne servent qu'au solde
  -- theorique. Melanger les deux, c'est donner au tresorier une tresorerie
  -- qu'il n'a pas.
  certitude       text not null default 'certain',

  -- CLIENT SENSIBLE ou AUTRE. Le premier se nomme une fois au referentiel des
  -- partenaires et se choisit dans une liste : saisi a la main sur chaque
  -- bordereau, son nom divergeait d'une ligne a l'autre — « NSIA Vie »,
  -- « NSIA-VIE », « Nsia vie » — et tout regroupement par client devenait faux.
  type_client     text not null default 'autre',
  investisseur    text not null default '',

  montant         numeric not null default 0,

  -- Droit d'entree ou de sortie APPLIQUE, en decimal. Repris du fonds a la
  -- saisie et modifiable : un gros souscripteur negocie son droit d'entree, et
  -- figer celui du fonds aurait oblige a le corriger ailleurs — donc jamais.
  taux_frais      numeric not null default 0,

  -- VL DE SOUSCRIPTION : la valeur liquidative retenue pour convertir le
  -- montant en parts, et sa date. Elle se CHOISIT parmi les VL publiees du
  -- fonds, jamais ne se tape : une date sans VL ne convertit rien, et une VL
  -- retapee a la main finit par diverger de l'historique — donc du reporting.
  --
  -- NULL tant qu'aucune n'a ete retenue : un ordre recu avant la prochaine
  -- valorisation n'en a pas encore.
  date_vl         date,
  vl              numeric,

  -- PERFORMANCE CIBLE promise au souscripteur, en decimal et par an.
  --
  -- Obligatoire sur une souscription de CLIENT SENSIBLE, nulle partout
  -- ailleurs : c'est l'engagement pris a l'entree, celui contre lequel le
  -- client jugera le fonds et decidera de rester ou de sortir. Le laisser dans
  -- la tete du commercial, c'est ne plus savoir six mois plus tard ce qui
  -- avait ete promis a qui. Un rachat ne promet rien, et un autre client ne
  -- negocie pas de cible.
  performance_cible numeric,

  -- DATE DE FIN convenue — la sortie prevue du client, s'il y en a une.
  --
  -- FACULTATIVE : beaucoup de souscriptions n'ont pas d'echeance, et en exiger
  -- une aurait pousse a l'inventer. Renseignee, elle fait foi sur la date de
  -- rachat deduite des flux : c'est ce qui a ete convenu, et le rachat effectif
  -- peut tomber un autre jour.
  --
  -- Comme la cible, elle ne concerne que les souscriptions de clients
  -- sensibles ; aucune contrainte ne l'impose, puisqu'elle peut rester nulle.
  date_fin        date,

  compte_reglement text not null default '',

  -- DATE DE REGLEMENT, ou NULL tant que le cash n'a pas bouge.
  --
  -- Elle NE SE SAISIT PAS au formulaire : un ordre recu n'en a pas encore, elle
  -- s'apprend quand le mouvement passe. La promettre d'avance, c'etait faire
  -- sortir le flux du point a un jour choisi arbitrairement.
  --
  -- Tant qu'elle est nulle, le flux pese. Une fois posee, le solde bancaire
  -- saisi contient le mouvement et le flux sort du point.
  date_reglement  date,

  note            text not null default '',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint fund_unit_flows_sens_chk
    check (sens in ('souscription', 'rachat')),
  constraint fund_unit_flows_certitude_chk
    check (certitude in ('certain', 'probable')),
  constraint fund_unit_flows_type_client_chk
    check (type_client in ('sensible', 'autre')),
  -- Le bureau n'a de sens que sur une souscription, et il y est obligatoire :
  -- sans lui le montant serait inclassable et se perdrait en silence.
  constraint fund_unit_flows_bureau_chk
    check (
      (sens = 'souscription' and bureau in ('CI', 'SN', 'BJ'))
      or (sens = 'rachat' and bureau is null)
    )
);

create index if not exists fund_unit_flows_fund_idx
  on public.fund_unit_flows (fund_id, date_operation desc);
create index if not exists fund_unit_flows_owner_idx
  on public.fund_unit_flows (owner_id);

drop trigger if exists fund_unit_flows_updated_at on public.fund_unit_flows;
create trigger fund_unit_flows_updated_at
  before update on public.fund_unit_flows
  for each row execute function public.set_updated_at();

alter table public.fund_unit_flows enable row level security;

drop policy if exists fund_unit_flows_all on public.fund_unit_flows;
create policy fund_unit_flows_all on public.fund_unit_flows
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ------------------------------------------------------------
-- Rejouable : mise a niveau d'une table creee par une version precedente.
-- ------------------------------------------------------------
alter table public.fund_unit_flows
  add column if not exists type_client text not null default 'autre';
alter table public.fund_unit_flows
  add column if not exists taux_frais numeric not null default 0;
alter table public.fund_unit_flows drop column if exists rapproche_le;
alter table public.fund_unit_flows alter column date_reglement drop not null;
alter table public.fund_unit_flows
  drop constraint if exists fund_unit_flows_type_client_chk;
alter table public.fund_unit_flows
  add constraint fund_unit_flows_type_client_chk
  check (type_client in ('sensible', 'autre'));
alter table public.fund_unit_flows add column if not exists date_vl date;
alter table public.fund_unit_flows add column if not exists vl numeric;
alter table public.fund_unit_flows add column if not exists performance_cible numeric;
alter table public.fund_unit_flows
  drop constraint if exists fund_unit_flows_cible_chk;
-- `not valid` : la contrainte s'applique a TOUT CE QUI S'ECRIT DESORMAIS, mais
-- ne relit pas les lignes deja en base. Sans cela, rejouer ce script sur une
-- base ou une souscription de client sensible aurait ete saisie avant
-- l'existence du champ le ferait echouer — et la seule facon de le faire
-- passer aurait ete d'inventer une cible qui n'a jamais ete promise.
--
-- Les lignes anciennes se corrigent a l'ecran, une par une, par quelqu'un qui
-- sait ce qui avait ete convenu.
alter table public.fund_unit_flows
  add constraint fund_unit_flows_cible_chk
  check (
    (sens = 'souscription' and type_client = 'sensible' and performance_cible is not null)
    or ((sens <> 'souscription' or type_client <> 'sensible') and performance_cible is null)
  ) not valid;
alter table public.fund_unit_flows add column if not exists date_fin date;

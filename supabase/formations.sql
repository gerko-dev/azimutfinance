-- ============================================================
-- AzimutFinance — Formations & inscriptions
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Tables :
--   public.formations             (catalogue, admin L2+ ecrit, public lit si publie)
--   public.formation_inscriptions (inscriptions user, lecture admin L3+)
-- ============================================================

-- ============================================================
-- 1) Enums (idempotents)
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'formation_level') then
    create type public.formation_level as enum ('debutant','intermediaire','avance');
  end if;
  if not exists (select 1 from pg_type where typname = 'formation_format') then
    create type public.formation_format as enum ('cours','atelier','certifiant');
  end if;
  if not exists (select 1 from pg_type where typname = 'formation_category') then
    create type public.formation_category as enum
      ('bourse','obligations','analyse','macro','portefeuille','pratique');
  end if;
  if not exists (select 1 from pg_type where typname = 'formation_pricing_type') then
    create type public.formation_pricing_type as enum ('gratuit','premium','certifiant');
  end if;
  if not exists (select 1 from pg_type where typname = 'inscription_status') then
    create type public.inscription_status as enum
      ('en_attente','confirmee','payee','annulee');
  end if;
  if not exists (select 1 from pg_type where typname = 'inscription_payment_method') then
    create type public.inscription_payment_method as enum
      ('gratuit','orange_money','wave','virement','sur_place');
  end if;
end$$;

-- ============================================================
-- 2) Table formations
-- ============================================================

create table if not exists public.formations (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  title               text not null,
  short_description   text not null,
  long_description    text not null,
  level               public.formation_level not null,
  format              public.formation_format not null,
  category            public.formation_category not null,
  modules             jsonb not null default '[]'::jsonb,
  prerequisites       text[] not null default '{}',
  outcomes            text[] not null default '{}',
  pricing_type        public.formation_pricing_type not null,
  price_fcfa          bigint not null default 0,
  tags                text[] not null default '{}',
  accent_color        text,
  instructor_name     text,
  instructor_title    text,
  featured            boolean not null default false,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint formations_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint formations_price_consistent
    check (
      (pricing_type = 'gratuit' and price_fcfa = 0)
      or (pricing_type <> 'gratuit' and price_fcfa > 0)
    )
);

create index if not exists formations_published_idx
  on public.formations (published_at desc) where published_at is not null;
create index if not exists formations_category_idx on public.formations (category);
create index if not exists formations_featured_idx on public.formations (featured) where featured = true;

drop trigger if exists formations_set_updated_at on public.formations;
create trigger formations_set_updated_at
  before update on public.formations
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 3) Table formation_inscriptions
-- ============================================================

create table if not exists public.formation_inscriptions (
  id                uuid primary key default gen_random_uuid(),
  formation_id      uuid not null references public.formations(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  status            public.inscription_status not null default 'en_attente',
  payment_method    public.inscription_payment_method not null,
  montant_fcfa      bigint not null default 0,
  -- Snapshot des infos profil au moment de l'inscription
  full_name         text not null,
  email             text not null,
  phone             text not null,
  country           public.uemoa_country,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint formation_inscriptions_unique_active unique (formation_id, user_id)
);

create index if not exists formation_inscriptions_user_idx
  on public.formation_inscriptions (user_id, created_at desc);
create index if not exists formation_inscriptions_formation_idx
  on public.formation_inscriptions (formation_id, created_at desc);
create index if not exists formation_inscriptions_status_idx
  on public.formation_inscriptions (status);

drop trigger if exists formation_inscriptions_set_updated_at on public.formation_inscriptions;
create trigger formation_inscriptions_set_updated_at
  before update on public.formation_inscriptions
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 4) RLS — formations
-- ============================================================

alter table public.formations enable row level security;

drop policy if exists "formations_select_published" on public.formations;
create policy "formations_select_published"
  on public.formations for select
  to anon, authenticated
  using (published_at is not null);

drop policy if exists "formations_select_drafts_admin" on public.formations;
create policy "formations_select_drafts_admin"
  on public.formations for select
  to authenticated
  using (public.is_admin_at_least(2));

drop policy if exists "formations_insert_admin" on public.formations;
create policy "formations_insert_admin"
  on public.formations for insert
  to authenticated
  with check (public.is_admin_at_least(2));

drop policy if exists "formations_update_admin" on public.formations;
create policy "formations_update_admin"
  on public.formations for update
  to authenticated
  using (public.is_admin_at_least(2))
  with check (public.is_admin_at_least(2));

drop policy if exists "formations_delete_admin" on public.formations;
create policy "formations_delete_admin"
  on public.formations for delete
  to authenticated
  using (public.is_admin_at_least(2));

-- ============================================================
-- 5) RLS — formation_inscriptions
-- ============================================================

alter table public.formation_inscriptions enable row level security;

-- L'utilisateur peut creer son propre enregistrement (insert via RPC quand-meme)
drop policy if exists "inscriptions_insert_self" on public.formation_inscriptions;
create policy "inscriptions_insert_self"
  on public.formation_inscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

-- L'utilisateur peut lire ses propres inscriptions
drop policy if exists "inscriptions_select_self" on public.formation_inscriptions;
create policy "inscriptions_select_self"
  on public.formation_inscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- Admin L3+ peut tout lire
drop policy if exists "inscriptions_select_admin" on public.formation_inscriptions;
create policy "inscriptions_select_admin"
  on public.formation_inscriptions for select
  to authenticated
  using (public.is_admin_at_least(3));

-- Admin L2+ peut modifier (changement de statut)
drop policy if exists "inscriptions_update_admin" on public.formation_inscriptions;
create policy "inscriptions_update_admin"
  on public.formation_inscriptions for update
  to authenticated
  using (public.is_admin_at_least(2))
  with check (public.is_admin_at_least(2));

drop policy if exists "inscriptions_delete_admin" on public.formation_inscriptions;
create policy "inscriptions_delete_admin"
  on public.formation_inscriptions for delete
  to authenticated
  using (public.is_admin_at_least(2));

-- ============================================================
-- 6) RPC admin : LIST FORMATIONS (incluant brouillons, ordre par maj)
-- ============================================================

create or replace function public.admin_list_formations(
  p_search text default null,
  p_limit  int default 100,
  p_offset int default 0
)
returns setof public.formations
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
    select *
    from public.formations
    where p_search is null
       or title ilike '%' || p_search || '%'
       or slug  ilike '%' || p_search || '%'
    order by updated_at desc
    limit p_limit
    offset p_offset;
end;
$$;
grant execute on function public.admin_list_formations(text, int, int) to authenticated;

-- ============================================================
-- 7) RPC admin : LIST INSCRIPTIONS (filtre formation optionnel)
-- ============================================================

create or replace function public.admin_list_inscriptions(
  p_formation_id uuid default null,
  p_status       public.inscription_status default null,
  p_limit        int default 200,
  p_offset       int default 0
)
returns table (
  id              uuid,
  formation_id    uuid,
  formation_slug  text,
  formation_title text,
  user_id         uuid,
  user_username   text,
  status          public.inscription_status,
  payment_method  public.inscription_payment_method,
  montant_fcfa    bigint,
  full_name       text,
  email           text,
  phone           text,
  country         public.uemoa_country,
  notes           text,
  created_at      timestamptz,
  updated_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
    select i.id, i.formation_id, f.slug, f.title,
           i.user_id, p.username,
           i.status, i.payment_method, i.montant_fcfa,
           i.full_name, i.email, i.phone, i.country, i.notes,
           i.created_at, i.updated_at
    from public.formation_inscriptions i
    join public.formations f on f.id = i.formation_id
    left join public.profiles  p on p.id = i.user_id
    where (p_formation_id is null or i.formation_id = p_formation_id)
      and (p_status is null or i.status = p_status)
    order by i.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;
grant execute on function public.admin_list_inscriptions(uuid, public.inscription_status, int, int)
  to authenticated;

-- ============================================================
-- 8) RPC admin : SET INSCRIPTION STATUS (level 2+)
-- ============================================================

create or replace function public.admin_set_inscription_status(
  p_inscription_id uuid,
  p_status         public.inscription_status,
  p_notes          text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(2) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if not exists (select 1 from public.formation_inscriptions where id = p_inscription_id) then
    raise exception 'INSCRIPTION_NOT_FOUND';
  end if;
  update public.formation_inscriptions
    set status = p_status,
        notes  = coalesce(p_notes, notes)
    where id = p_inscription_id;
  perform public._admin_log(
    'set_inscription_status', 'formation_inscription', p_inscription_id::text,
    jsonb_build_object('new_status', p_status::text), p_notes
  );
end;
$$;
grant execute on function
  public.admin_set_inscription_status(uuid, public.inscription_status, text)
  to authenticated;

-- ============================================================
-- 9) RPC user : MES INSCRIPTIONS
-- ============================================================

create or replace function public.my_inscriptions()
returns table (
  id              uuid,
  formation_id    uuid,
  formation_slug  text,
  formation_title text,
  status          public.inscription_status,
  payment_method  public.inscription_payment_method,
  montant_fcfa    bigint,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.formation_id, f.slug, f.title,
         i.status, i.payment_method, i.montant_fcfa, i.created_at
  from public.formation_inscriptions i
  join public.formations f on f.id = i.formation_id
  where i.user_id = auth.uid()
  order by i.created_at desc;
$$;
grant execute on function public.my_inscriptions() to authenticated;

-- ============================================================
-- 10) Seed des 14 formations existantes
-- ============================================================

-- Pour chaque formation, on insere si le slug n'existe pas deja.
-- Pas de "on conflict do update" : on ne veut pas ecraser les eventuelles
-- modifications faites depuis l'admin si on rejoue le SQL.

insert into public.formations (
  slug, title, short_description, long_description, level, format, category,
  modules, prerequisites, outcomes, pricing_type, price_fcfa, tags,
  instructor_name, instructor_title, featured, published_at, updated_at
)
select * from (values
  (
    'initiation-brvm',
    'Initiation à la BRVM',
    'Comprendre le rôle, le fonctionnement et la fiche d''identité de la Bourse Régionale des Valeurs Mobilières.',
    'Une mise à niveau complète et accessible pour tout investisseur qui aborde la BRVM pour la première fois. On part de l''historique de la création (1998) jusqu''aux séances modernes : cotation au fixing, statut UEMOA, organes de tutelle (CREPMF), rôle des SGI, indices BRVM Composite et BRVM 30.',
    'debutant'::public.formation_level,
    'cours'::public.formation_format,
    'bourse'::public.formation_category,
    '[
      {"title":"Histoire et mission de la BRVM","durationMinutes":25,"preview":true},
      {"title":"Architecture institutionnelle (CREPMF, DC/BR, SGI)","durationMinutes":30},
      {"title":"Indices BRVM Composite, BRVM 30, BRVM Prestige","durationMinutes":20},
      {"title":"Séance type, fixing et carnet d''ordres","durationMinutes":35},
      {"title":"Lecture d''un cours et d''un graphique","durationMinutes":30},
      {"title":"Quiz de validation","durationMinutes":20}
    ]'::jsonb,
    array['Aucun prérequis financier'],
    array['Décrire le fonctionnement quotidien de la BRVM','Identifier les acteurs clés et leur rôle','Lire un cours, comprendre un indice'],
    'gratuit'::public.formation_pricing_type, 0,
    array['BRVM','actions','fondamentaux','débutant'],
    'AzimutFinance','Équipe pédagogique', true,
    '2026-04-15T00:00:00Z'::timestamptz, '2026-04-15T00:00:00Z'::timestamptz
  ),
  (
    'premier-ordre-brvm',
    'Passer son premier ordre en bourse',
    'Du choix de la SGI à la passation d''un ordre limite — un guide pratique pas-à-pas.',
    'Un atelier orienté action : ouvrir un compte titres, déposer son chèque, transmettre un ordre, lire la confirmation d''exécution. On compare les principales SGI agréées et leurs frais. Cas concret avec un ordre sur SGBC ou SONATEL.',
    'debutant'::public.formation_level,
    'atelier'::public.formation_format,
    'pratique'::public.formation_category,
    '[
      {"title":"Choisir sa SGI : critères et frais","durationMinutes":25,"preview":true},
      {"title":"Documents pour l''ouverture de compte titres","durationMinutes":15},
      {"title":"Anatomie d''un ordre (limite, marché, validité)","durationMinutes":20},
      {"title":"Atelier live : passation d''un ordre fictif","durationMinutes":45},
      {"title":"Frais de transaction, taxes, lecture du relevé","durationMinutes":20}
    ]'::jsonb,
    array['Avoir suivi Initiation à la BRVM (recommandé)'],
    array['Ouvrir un compte titres en autonomie','Comparer 3 SGI et choisir selon ses besoins','Passer un ordre limite et le suivre jusqu''à exécution'],
    'premium'::public.formation_pricing_type, 25000,
    array['pratique','SGI','compte titres','ordre'],
    null, null, false,
    '2026-03-20T00:00:00Z'::timestamptz, '2026-03-20T00:00:00Z'::timestamptz
  ),
  (
    'marche-obligataire-uemoa',
    'Le marché obligataire UEMOA',
    'Distinguer obligations cotées BRVM, souverains UMOA-Titres et corporates. Lire une fiche d''émission.',
    'Tour d''horizon complet du marché obligataire de la zone : segmentation, agents, calendrier d''émission. On apprend à lire une fiche d''émission souveraine (TPE, BAT, OAT) et à comparer une obligation cotée à son équivalent souverain. Cas pratique sur l''émission Sénégal 2025.',
    'intermediaire'::public.formation_level,
    'cours'::public.formation_format,
    'obligations'::public.formation_category,
    '[
      {"title":"Architecture du marché obligataire UEMOA","durationMinutes":30,"preview":true},
      {"title":"UMOA-Titres : OAT, BAT, TPE","durationMinutes":35},
      {"title":"Obligations cotées BRVM (souverains, corporates)","durationMinutes":30},
      {"title":"Lecture d''une fiche d''émission","durationMinutes":25},
      {"title":"Cas pratique : Sénégal vs Côte d''Ivoire","durationMinutes":40},
      {"title":"Quiz et synthèse","durationMinutes":20}
    ]'::jsonb,
    array['Notions de base en finance (intérêt simple, capitalisation)'],
    array['Identifier les types d''obligations disponibles dans l''UEMOA','Lire une fiche d''émission et en extraire les paramètres clés','Comparer souverains vs corporates'],
    'premium'::public.formation_pricing_type, 35000,
    array['obligations','souverains','UMOA-Titres','OAT','BAT'],
    'AzimutFinance','Équipe pédagogique', true,
    '2026-04-02T00:00:00Z'::timestamptz, '2026-04-02T00:00:00Z'::timestamptz
  ),
  (
    'ytm-duration-sensibilite',
    'YTM, duration et sensibilité',
    'Maîtriser les 3 métriques actuarielles incontournables pour évaluer une obligation et son risque de taux.',
    'Cours technique pour lecteurs sérieux : on dérive le YTM par bisection, on calcule la duration de Macaulay, la duration modifiée et la convexité, puis on les utilise pour estimer la variation du prix face à un mouvement de courbe. Exemples sur OAT BENIN 6,5% 2030 et CI.O 5,9% 2027.',
    'avance'::public.formation_level,
    'cours'::public.formation_format,
    'obligations'::public.formation_category,
    '[
      {"title":"Rappel : actualisation et conventions Act/365","durationMinutes":25},
      {"title":"YTM : définition et résolution numérique","durationMinutes":35,"preview":true},
      {"title":"Duration de Macaulay et duration modifiée","durationMinutes":35},
      {"title":"Convexité et approximation du second ordre","durationMinutes":30},
      {"title":"Calculs sur OAT BENIN et CI.O","durationMinutes":45},
      {"title":"Atelier : impact d''un choc de 100 bps sur un portefeuille","durationMinutes":40}
    ]'::jsonb,
    array['Avoir suivi Le marché obligataire UEMOA','À l''aise avec Excel ou un tableur'],
    array['Calculer un YTM à la main et avec Excel','Mesurer la sensibilité d''un portefeuille obligataire','Interpréter une duration en termes de risque de taux'],
    'premium'::public.formation_pricing_type, 45000,
    array['YTM','duration','sensibilité','obligations','risque de taux'],
    null, null, false,
    '2026-04-10T00:00:00Z'::timestamptz, '2026-04-10T00:00:00Z'::timestamptz
  ),
  (
    'analyse-fondamentale-action',
    'Analyse fondamentale d''une action BRVM',
    'Méthode complète pour valoriser une société cotée : du bilan au DCF, en passant par les comparables.',
    'Construire sa propre opinion sur une valeur cotée. On part des états financiers (bilan, compte de résultat, flux de trésorerie), on calcule les ratios de référence (ROE, ROCE, dette nette/EBITDA), puis on applique trois méthodes de valorisation : DCF, comparables boursiers et transactions. Cas pratique : SONATEL.',
    'intermediaire'::public.formation_level,
    'cours'::public.formation_format,
    'analyse'::public.formation_category,
    '[
      {"title":"Lire un bilan IFRS / SYSCOHADA","durationMinutes":40,"preview":true},
      {"title":"Compte de résultat et soldes intermédiaires","durationMinutes":30},
      {"title":"Tableau des flux de trésorerie","durationMinutes":30},
      {"title":"Ratios clés (ROE, ROCE, dette nette/EBITDA)","durationMinutes":35},
      {"title":"DCF : étapes, hypothèses, taux d''actualisation","durationMinutes":50},
      {"title":"Comparables boursiers (P/E, EV/EBITDA)","durationMinutes":30},
      {"title":"Cas pratique : valoriser SONATEL","durationMinutes":60}
    ]'::jsonb,
    array['Notions de comptabilité générale'],
    array['Lire et interpréter les états financiers d''une société BRVM','Construire un DCF simple et le challenger','Justifier une recommandation Achat / Conserver / Vendre'],
    'premium'::public.formation_pricing_type, 55000,
    array['analyse fondamentale','valorisation','DCF','ratios'],
    'AzimutFinance','Pôle recherche actions', false,
    '2026-03-28T00:00:00Z'::timestamptz, '2026-03-28T00:00:00Z'::timestamptz
  ),
  (
    'analyse-technique-chartisme',
    'Analyse technique : chartisme et indicateurs',
    'Identifier les figures classiques (têtes-épaules, double-creux), maîtriser RSI, MACD et moyennes mobiles.',
    'Pour ceux qui veulent compléter l''analyse fondamentale par des signaux techniques. On apprend à lire un chandelier japonais, à identifier les supports/résistances, à mesurer la qualité d''une tendance via les moyennes mobiles, et à interpréter RSI, MACD et Bollinger. Limites assumées sur la BRVM (faible liquidité = bruit important).',
    'intermediaire'::public.formation_level,
    'cours'::public.formation_format,
    'analyse'::public.formation_category,
    '[
      {"title":"Chandeliers japonais et patterns de base","durationMinutes":30,"preview":true},
      {"title":"Supports, résistances, lignes de tendance","durationMinutes":30},
      {"title":"Figures chartistes : têtes-épaules, double-fond, triangle","durationMinutes":40},
      {"title":"Moyennes mobiles MM20, MM50, MM200","durationMinutes":25},
      {"title":"Indicateurs : RSI, MACD, Bollinger","durationMinutes":40},
      {"title":"Limites sur les valeurs peu liquides","durationMinutes":20},
      {"title":"Atelier : analyse d''une valeur du BRVM 30","durationMinutes":45}
    ]'::jsonb,
    array['Avoir suivi Initiation à la BRVM'],
    array['Identifier 5 figures chartistes classiques','Configurer RSI/MACD/Bollinger sur un graphique','Combiner technique et fondamental'],
    'premium'::public.formation_pricing_type, 35000,
    array['analyse technique','chartisme','RSI','MACD'],
    null, null, false,
    '2026-03-15T00:00:00Z'::timestamptz, '2026-03-15T00:00:00Z'::timestamptz
  ),
  (
    'macro-uemoa-bceao',
    'Macro UEMOA : BCEAO, taux directeurs, change',
    'Décrypter les décisions de la BCEAO et leurs impacts sur la BRVM, le marché monétaire et les obligations.',
    'Comprendre la politique monétaire de l''UEMOA : taux directeurs, refinancement, réserves obligatoires. On suit la chaîne de transmission jusqu''aux taux interbancaires, aux émissions souveraines et aux indices boursiers. Le rôle pivot du peg EUR/XOF est explicité. Décodage des derniers communiqués CPM.',
    'intermediaire'::public.formation_level,
    'cours'::public.formation_format,
    'macro'::public.formation_category,
    '[
      {"title":"Mandat et organes de la BCEAO","durationMinutes":25,"preview":true},
      {"title":"Outils de politique monétaire (TIAO, REC)","durationMinutes":30},
      {"title":"Chaîne de transmission vers le marché","durationMinutes":35},
      {"title":"Peg EUR/XOF : implications","durationMinutes":25},
      {"title":"Décrypter un communiqué CPM","durationMinutes":30},
      {"title":"Cas pratique : impact d''une hausse de 25 bps","durationMinutes":35}
    ]'::jsonb,
    array['Notions économiques de base'],
    array['Lire un communiqué CPM et anticiper l''impact marché','Expliquer le peg EUR/XOF et ses implications','Tracer la chaîne taux directeurs → taux courts → taux longs'],
    'premium'::public.formation_pricing_type, 35000,
    array['BCEAO','politique monétaire','FCFA','macro UEMOA'],
    null, null, true,
    '2026-04-22T00:00:00Z'::timestamptz, '2026-04-22T00:00:00Z'::timestamptz
  ),
  (
    'matieres-premieres-brvm',
    'Matières premières et BRVM',
    'Cacao, or, brent, palme : comment ces sous-jacents influencent les valeurs cotées et les budgets UEMOA.',
    'Les matières premières sont structurantes pour l''UEMOA : cacao (Côte d''Ivoire), or (Mali, Burkina), pétrole (Sénégal, Niger), palme (Côte d''Ivoire). Cette formation explique le canal d''impact MP → recettes Etat → balance courante → BRVM, et identifie les valeurs cotées les plus exposées (PALMCI, SAPH, SOGB, TOTAL CI).',
    'intermediaire'::public.formation_level,
    'cours'::public.formation_format,
    'macro'::public.formation_category,
    '[
      {"title":"Cartographie des MP critiques pour l''UEMOA","durationMinutes":25,"preview":true},
      {"title":"Cacao et économie ivoirienne","durationMinutes":30},
      {"title":"Or, mines et pays sahéliens","durationMinutes":25},
      {"title":"Brent et inflation importée","durationMinutes":25},
      {"title":"Valeurs BRVM directement exposées","durationMinutes":30}
    ]'::jsonb,
    array[]::text[],
    array['Citer les 5 MP les plus structurantes pour l''UEMOA','Identifier les valeurs BRVM exposées à chaque MP','Anticiper l''impact d''un mouvement de cours'],
    'gratuit'::public.formation_pricing_type, 0,
    array['matières premières','cacao','or','brent','macro'],
    null, null, false,
    '2026-04-05T00:00:00Z'::timestamptz, '2026-04-05T00:00:00Z'::timestamptz
  ),
  (
    'construire-portefeuille-uemoa',
    'Construire un portefeuille UEMOA',
    'Allocation actions / obligations / OPCVM, diversification sectorielle et géographique en zone UEMOA.',
    'Méthodologie pour construire un portefeuille adapté à un investisseur particulier UEMOA : profils de risque, allocation stratégique, diversification entre BRVM, UMOA-Titres et FCP. On aborde aussi le rebalancing trimestriel et l''impact de la fiscalité sur le rendement net.',
    'intermediaire'::public.formation_level,
    'cours'::public.formation_format,
    'portefeuille'::public.formation_category,
    '[
      {"title":"Profil de risque et horizon","durationMinutes":30,"preview":true},
      {"title":"Allocation stratégique : actions / obligations / liquidités","durationMinutes":35},
      {"title":"Diversification sectorielle BRVM","durationMinutes":25},
      {"title":"Place des FCP dans une allocation","durationMinutes":25},
      {"title":"Rebalancing : règles et fréquence","durationMinutes":25},
      {"title":"Rendement brut vs net après fiscalité","durationMinutes":25}
    ]'::jsonb,
    array['Avoir suivi Initiation à la BRVM'],
    array['Définir une allocation cible cohérente avec son profil','Diversifier entre actions, obligations et FCP','Mettre en œuvre un rebalancing simple'],
    'premium'::public.formation_pricing_type, 40000,
    array['portefeuille','allocation','diversification','FCP'],
    null, null, false,
    '2026-03-30T00:00:00Z'::timestamptz, '2026-03-30T00:00:00Z'::timestamptz
  ),
  (
    'gestion-risque-var',
    'Gestion du risque et Value-at-Risk',
    'Quantifier le risque d''un portefeuille : volatilité, drawdown, VaR historique et paramétrique.',
    'Formation avancée : on quantifie le risque à différents horizons. Volatilité annualisée, drawdown maximum, VaR historique sur 1 jour et 10 jours, VaR paramétrique gaussienne, et leurs limites sur les marchés frontières comme la BRVM. Atelier Excel avec un portefeuille de 5 valeurs.',
    'avance'::public.formation_level,
    'cours'::public.formation_format,
    'portefeuille'::public.formation_category,
    '[
      {"title":"Volatilité annualisée et log-returns","durationMinutes":30},
      {"title":"Drawdown maximum et durée de récupération","durationMinutes":25},
      {"title":"VaR historique et paramétrique","durationMinutes":40,"preview":true},
      {"title":"Limites sur marchés peu liquides","durationMinutes":25},
      {"title":"Atelier Excel sur un portefeuille de 5 valeurs","durationMinutes":60}
    ]'::jsonb,
    array['Avoir suivi Construire un portefeuille UEMOA','Connaissance d''Excel à l''aise'],
    array['Calculer la VaR d''un portefeuille en historique et en paramétrique','Interpréter un drawdown','Identifier les limites de la VaR sur la BRVM'],
    'premium'::public.formation_pricing_type, 50000,
    array['risque','VaR','volatilité','drawdown'],
    null, null, false,
    '2026-04-12T00:00:00Z'::timestamptz, '2026-04-12T00:00:00Z'::timestamptz
  ),
  (
    'fcp-opcvm-uemoa',
    'FCP / OPCVM : choisir et combiner',
    'Comprendre les différents OPC de la zone, lire un DICI, comparer les frais et les performances nettes.',
    'Tour d''horizon des FCP / OPCVM de la zone UEMOA. On apprend à lire un Document d''Information Clé pour l''Investisseur (DICI), à analyser la composition d''un fonds, à comparer les frais (entrée, gestion, sortie) et à juger une performance nette. Listing actualisé des principaux OPC commercialisés au Sénégal et en Côte d''Ivoire.',
    'debutant'::public.formation_level,
    'cours'::public.formation_format,
    'portefeuille'::public.formation_category,
    '[
      {"title":"OPC : définition, types, cadre réglementaire","durationMinutes":25,"preview":true},
      {"title":"Lire un DICI : 5 informations clés","durationMinutes":30},
      {"title":"Frais : entrée, gestion annuelle, sortie","durationMinutes":25},
      {"title":"Performance brute vs nette : ne pas se faire avoir","durationMinutes":25},
      {"title":"Panorama des FCP UEMOA actuels","durationMinutes":35}
    ]'::jsonb,
    array[]::text[],
    array['Lire et comparer 3 DICI','Calculer la performance nette d''un OPC','Choisir un FCP cohérent avec son profil'],
    'premium'::public.formation_pricing_type, 30000,
    array['FCP','OPCVM','DICI','frais'],
    null, null, false,
    '2026-04-08T00:00:00Z'::timestamptz, '2026-04-08T00:00:00Z'::timestamptz
  ),
  (
    'lire-cours-graphique',
    'Lire un cours et un graphique de bourse',
    'Une formation express et gratuite pour décoder une cotation, un volume, un graphique et un carnet d''ordres.',
    'Vidéo pédagogique courte (~30 min) qui démystifie les éléments visuels d''une fiche valeur : prix de référence, ouverture, plus haut, plus bas, volume, capitalisation, plus-value journalière. Idéal en complément de l''initiation BRVM.',
    'debutant'::public.formation_level,
    'cours'::public.formation_format,
    'bourse'::public.formation_category,
    '[
      {"title":"Anatomie d''une fiche valeur","durationMinutes":10,"preview":true},
      {"title":"Lire un graphique en chandelier","durationMinutes":12},
      {"title":"Volume, capitalisation, flottant","durationMinutes":8}
    ]'::jsonb,
    array[]::text[],
    array['Lire intuitivement n''importe quelle fiche valeur de la BRVM'],
    'gratuit'::public.formation_pricing_type, 0,
    array['bourse','graphique','débutant','express'],
    null, null, false,
    '2026-02-18T00:00:00Z'::timestamptz, '2026-02-18T00:00:00Z'::timestamptz
  ),
  (
    'fiscalite-plus-values-brvm',
    'Fiscalité des plus-values BRVM',
    'Imposition des dividendes, plus-values et coupons : règles UEMOA et conventions fiscales par pays.',
    'Souvent ignorée, la fiscalité grignote 10 à 30 % du rendement brut. Cette formation détaille l''imposition des dividendes, des plus-values, et des coupons obligataires pour les 8 pays de l''UEMOA. Cas particuliers des non-résidents et des conventions fiscales bilatérales.',
    'intermediaire'::public.formation_level,
    'cours'::public.formation_format,
    'pratique'::public.formation_category,
    '[
      {"title":"Cadre fiscal UEMOA : généralités","durationMinutes":25,"preview":true},
      {"title":"Imposition des dividendes par pays","durationMinutes":30},
      {"title":"Plus-values : régime et abattements","durationMinutes":25},
      {"title":"Coupons obligataires","durationMinutes":20},
      {"title":"Cas du non-résident et conventions","durationMinutes":30}
    ]'::jsonb,
    array[]::text[],
    array['Calculer le rendement net d''un investissement BRVM','Identifier les régimes d''exonération','Conseiller un non-résident sur la fiscalité applicable'],
    'premium'::public.formation_pricing_type, 30000,
    array['fiscalité','dividendes','plus-values','non-résident'],
    null, null, false,
    '2026-04-20T00:00:00Z'::timestamptz, '2026-04-20T00:00:00Z'::timestamptz
  ),
  (
    'certification-azimut-niveau-1',
    'Certification AzimutFinance — Niveau 1',
    'Parcours complet 40 heures couvrant BRVM, obligations, analyse et portefeuille. Examen final certifiant.',
    'Le parcours certifiant niveau 1 d''AzimutFinance, conçu pour valider une compétence opérationnelle sur les marchés financiers de l''UEMOA. 40 heures de contenu réparties en 8 modules thématiques, examen final en ligne (60 questions, 90 minutes), certificat numérique vérifiable.',
    'intermediaire'::public.formation_level,
    'certifiant'::public.formation_format,
    'bourse'::public.formation_category,
    '[
      {"title":"Module 1 — BRVM : fondamentaux","durationMinutes":240,"preview":true},
      {"title":"Module 2 — Marché obligataire UEMOA","durationMinutes":300},
      {"title":"Module 3 — Analyse fondamentale","durationMinutes":360},
      {"title":"Module 4 — Analyse technique","durationMinutes":240},
      {"title":"Module 5 — Macro UEMOA","durationMinutes":240},
      {"title":"Module 6 — Construction de portefeuille","durationMinutes":300},
      {"title":"Module 7 — Gestion du risque","durationMinutes":240},
      {"title":"Module 8 — Fiscalité et pratique","durationMinutes":180},
      {"title":"Examen final certifiant (60 QCM, 90 min)","durationMinutes":90}
    ]'::jsonb,
    array['Aucun prérequis fort, parcours complet et progressif'],
    array['Maîtriser les marchés financiers de l''UEMOA de bout en bout','Obtenir un certificat numérique vérifiable','Présenter sa candidature à des postes de gestion / analyse'],
    'certifiant'::public.formation_pricing_type, 250000,
    array['certifiant','parcours complet','BRVM','obligations','portefeuille'],
    'Pôle pédagogique AzimutFinance','Équipe certifiante', true,
    '2026-04-25T00:00:00Z'::timestamptz, '2026-04-25T00:00:00Z'::timestamptz
  )
) as t(
  slug, title, short_description, long_description, level, format, category,
  modules, prerequisites, outcomes, pricing_type, price_fcfa, tags,
  instructor_name, instructor_title, featured, published_at, updated_at
)
where not exists (select 1 from public.formations f where f.slug = t.slug);

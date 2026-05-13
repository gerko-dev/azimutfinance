-- ============================================================
-- AzimutFinance — Azimut Magazine + Newsletter
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Tables :
--   public.magazine_authors           (auteurs, possiblement lies a un admin)
--   public.magazine_issues            (numeros mensuels)
--   public.magazine_articles          (articles avec body en blocks)
--   public.newsletter_subscribers     (abonnes newsletter magazine)
-- ============================================================

-- ============================================================
-- 1) Enums (idempotents)
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'article_category') then
    create type public.article_category as enum
      ('macro','marches','obligations','valeurs','interview','outils','edito');
  end if;
  if not exists (select 1 from pg_type where typname = 'cover_text_tone') then
    create type public.cover_text_tone as enum ('light','dark');
  end if;
  if not exists (select 1 from pg_type where typname = 'newsletter_status') then
    create type public.newsletter_status as enum ('active','unsubscribed');
  end if;
end$$;

-- ============================================================
-- 2) Table magazine_authors
--    user_id nullable : un auteur peut etre lie a un compte admin
--    (pour signer les articles) ou rester autonome (legacy / collectif).
-- ============================================================

create table if not exists public.magazine_authors (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  user_id       uuid references auth.users(id) on delete set null unique,
  display_name  text not null,
  title         text not null,
  bio           text not null default '',
  initials      text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint magazine_authors_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint magazine_authors_initials_len check (length(initials) between 1 and 4)
);

drop trigger if exists magazine_authors_set_updated_at on public.magazine_authors;
create trigger magazine_authors_set_updated_at
  before update on public.magazine_authors
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 3) Table magazine_issues
-- ============================================================

create table if not exists public.magazine_issues (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  number              int not null unique,
  month_label         text not null,
  theme               text not null,
  blurb               text not null,
  editorial           text not null default '',
  editor_id           uuid references public.magazine_authors(id) on delete set null,
  cover_gradient_from text not null,
  cover_gradient_to   text not null,
  cover_text          public.cover_text_tone not null default 'light',
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint magazine_issues_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create index if not exists magazine_issues_published_idx
  on public.magazine_issues (published_at desc) where published_at is not null;

drop trigger if exists magazine_issues_set_updated_at on public.magazine_issues;
create trigger magazine_issues_set_updated_at
  before update on public.magazine_issues
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 4) Table magazine_articles
--    body : tableau de ContentBlock (paragraphe, heading, quote,
--    callout, list, stats, divider) en JSONB.
-- ============================================================

create table if not exists public.magazine_articles (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  issue_id               uuid not null references public.magazine_issues(id) on delete cascade,
  category               public.article_category not null,
  title                  text not null,
  dek                    text not null default '',
  excerpt                text not null,
  tags                   text[] not null default '{}',
  author_id              uuid references public.magazine_authors(id) on delete set null,
  reading_time_minutes   int not null default 5,
  accent                 text not null default '#475569',
  body                   jsonb not null default '[]'::jsonb,
  featured               boolean not null default false,
  published_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint magazine_articles_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create index if not exists magazine_articles_issue_idx on public.magazine_articles (issue_id);
create index if not exists magazine_articles_category_idx on public.magazine_articles (category);
create index if not exists magazine_articles_published_idx
  on public.magazine_articles (published_at desc) where published_at is not null;
create index if not exists magazine_articles_featured_idx
  on public.magazine_articles (featured) where featured = true;

drop trigger if exists magazine_articles_set_updated_at on public.magazine_articles;
create trigger magazine_articles_set_updated_at
  before update on public.magazine_articles
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 5) Table newsletter_subscribers
--    Abonnes a la newsletter magazine. INSERT public (auto-confirme),
--    SELECT/UPDATE admin L3+.
-- ============================================================

create table if not exists public.newsletter_subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  full_name       text,
  country         public.uemoa_country,
  status          public.newsletter_status not null default 'active',
  source          text not null default 'magazine',
  user_id         uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unsubscribed_at timestamptz,
  constraint newsletter_subscribers_email_format
    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create index if not exists newsletter_subscribers_status_idx
  on public.newsletter_subscribers (status, created_at desc);

-- ============================================================
-- 6) RLS — magazine_authors / issues / articles
-- ============================================================

alter table public.magazine_authors  enable row level security;
alter table public.magazine_issues   enable row level security;
alter table public.magazine_articles enable row level security;

-- Auteurs : lecture publique (necessaire pour afficher la signature),
--          ecriture admin L2+
drop policy if exists "magazine_authors_select_public" on public.magazine_authors;
create policy "magazine_authors_select_public"
  on public.magazine_authors for select
  to anon, authenticated
  using (true);

drop policy if exists "magazine_authors_write_admin" on public.magazine_authors;
create policy "magazine_authors_write_admin"
  on public.magazine_authors for all
  to authenticated
  using (public.is_admin_at_least(3))
  with check (public.is_admin_at_least(3));

-- Issues : SELECT public si publie, drafts admin L2+, ecriture admin L2+
drop policy if exists "magazine_issues_select_published" on public.magazine_issues;
create policy "magazine_issues_select_published"
  on public.magazine_issues for select
  to anon, authenticated
  using (published_at is not null);

drop policy if exists "magazine_issues_select_drafts_admin" on public.magazine_issues;
create policy "magazine_issues_select_drafts_admin"
  on public.magazine_issues for select
  to authenticated
  using (public.is_admin_at_least(3));

drop policy if exists "magazine_issues_write_admin" on public.magazine_issues;
create policy "magazine_issues_write_admin"
  on public.magazine_issues for all
  to authenticated
  using (public.is_admin_at_least(3))
  with check (public.is_admin_at_least(3));

-- Articles : meme logique
drop policy if exists "magazine_articles_select_published" on public.magazine_articles;
create policy "magazine_articles_select_published"
  on public.magazine_articles for select
  to anon, authenticated
  using (published_at is not null);

drop policy if exists "magazine_articles_select_drafts_admin" on public.magazine_articles;
create policy "magazine_articles_select_drafts_admin"
  on public.magazine_articles for select
  to authenticated
  using (public.is_admin_at_least(3));

drop policy if exists "magazine_articles_write_admin" on public.magazine_articles;
create policy "magazine_articles_write_admin"
  on public.magazine_articles for all
  to authenticated
  using (public.is_admin_at_least(3))
  with check (public.is_admin_at_least(3));

-- ============================================================
-- 7) RLS — newsletter_subscribers
--    INSERT public (signup ouvert), UPDATE/SELECT admin L3+, DELETE admin L2+
-- ============================================================

alter table public.newsletter_subscribers enable row level security;

drop policy if exists "newsletter_insert_public" on public.newsletter_subscribers;
create policy "newsletter_insert_public"
  on public.newsletter_subscribers for insert
  to anon, authenticated
  with check (true);

drop policy if exists "newsletter_select_admin" on public.newsletter_subscribers;
create policy "newsletter_select_admin"
  on public.newsletter_subscribers for select
  to authenticated
  using (public.is_admin_at_least(3));

drop policy if exists "newsletter_select_self" on public.newsletter_subscribers;
create policy "newsletter_select_self"
  on public.newsletter_subscribers for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "newsletter_update_admin" on public.newsletter_subscribers;
create policy "newsletter_update_admin"
  on public.newsletter_subscribers for update
  to authenticated
  using (public.is_admin_at_least(3))
  with check (public.is_admin_at_least(3));

drop policy if exists "newsletter_delete_admin" on public.newsletter_subscribers;
create policy "newsletter_delete_admin"
  on public.newsletter_subscribers for delete
  to authenticated
  using (public.is_admin_at_least(3));

-- ============================================================
-- 8) RPC admin : LIST ISSUES (incluant brouillons)
-- ============================================================

create or replace function public.admin_list_magazine_issues(
  p_search text default null,
  p_limit  int default 100,
  p_offset int default 0
)
returns setof public.magazine_issues
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
    select *
    from public.magazine_issues
    where p_search is null
       or theme ilike '%' || p_search || '%'
       or month_label ilike '%' || p_search || '%'
       or slug ilike '%' || p_search || '%'
    order by number desc
    limit p_limit
    offset p_offset;
end;
$$;
grant execute on function public.admin_list_magazine_issues(text, int, int) to authenticated;

-- ============================================================
-- 9) RPC admin : LIST ARTICLES (incluant brouillons)
-- ============================================================

create or replace function public.admin_list_magazine_articles(
  p_issue_id uuid default null,
  p_search   text default null,
  p_limit    int default 200,
  p_offset   int default 0
)
returns setof public.magazine_articles
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
    select *
    from public.magazine_articles
    where (p_issue_id is null or issue_id = p_issue_id)
      and (p_search is null
           or title ilike '%' || p_search || '%'
           or slug  ilike '%' || p_search || '%'
           or excerpt ilike '%' || p_search || '%')
    order by coalesce(published_at, created_at) desc
    limit p_limit
    offset p_offset;
end;
$$;
grant execute on function public.admin_list_magazine_articles(uuid, text, int, int)
  to authenticated;

-- ============================================================
-- 10) RPC admin : LIST NEWSLETTER SUBSCRIBERS
-- ============================================================

create or replace function public.admin_list_newsletter(
  p_status public.newsletter_status default null,
  p_search text default null,
  p_limit  int default 500,
  p_offset int default 0
)
returns setof public.newsletter_subscribers
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
    select *
    from public.newsletter_subscribers
    where (p_status is null or status = p_status)
      and (p_search is null
           or email ilike '%' || p_search || '%'
           or coalesce(full_name, '') ilike '%' || p_search || '%')
    order by created_at desc
    limit p_limit
    offset p_offset;
end;
$$;
grant execute on function public.admin_list_newsletter(public.newsletter_status, text, int, int)
  to authenticated;

-- ============================================================
-- 11) RPC admin : SET NEWSLETTER STATUS
-- ============================================================

create or replace function public.admin_set_newsletter_status(
  p_id     uuid,
  p_status public.newsletter_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_at_least(3) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.newsletter_subscribers
    set status = p_status,
        unsubscribed_at = case
          when p_status = 'unsubscribed' then now()
          else null
        end
    where id = p_id;
  perform public._admin_log(
    'set_newsletter_status', 'newsletter_subscriber', p_id::text,
    jsonb_build_object('new_status', p_status::text), null
  );
end;
$$;
grant execute on function public.admin_set_newsletter_status(uuid, public.newsletter_status)
  to authenticated;

-- ============================================================
-- 12) Seed : auteurs (6 historiques)
-- ============================================================

insert into public.magazine_authors (slug, display_name, title, bio, initials)
select * from (values
  ('redaction',
   'La rédaction d''AzimutFinance',
   'Pôle éditorial',
   'L''équipe rédactionnelle d''AzimutFinance suit au quotidien les marchés de la zone UEMOA, les décisions de la BCEAO et les valeurs cotées à la BRVM.',
   'AF'),
  ('kokou-segla',
   'Kokou Segla',
   'Rédacteur en chef',
   'Ancien analyste sell-side spécialisé sur l''Afrique de l''Ouest, Kokou pilote la ligne éditoriale d''Azimut Magazine et signe l''éditorial mensuel.',
   'KS'),
  ('aminata-diallo',
   'Aminata Diallo',
   'Spécialiste obligations souveraines',
   'Aminata couvre les émissions UMOA-Titres et le marché obligataire BRVM depuis 8 ans. Auteure de référence sur les courbes de taux UEMOA.',
   'AD'),
  ('moussa-bamba',
   'Moussa Bamba',
   'Analyste actions BRVM',
   'Moussa décortique les états financiers des sociétés cotées et publie des notes mensuelles sur les blue chips de la place régionale.',
   'MB'),
  ('fatou-ciss',
   'Fatou Cissé',
   'Économiste UEMOA',
   'Fatou analyse les indicateurs macro de la zone, les décisions de la BCEAO et le rôle des matières premières dans la balance commerciale.',
   'FC'),
  ('jp-dembele',
   'Jean-Paul Dembélé',
   'Stratégiste portefeuille',
   'Jean-Paul construit des modèles d''allocation et de risque appliqués aux portefeuilles UEMOA. Ancien gérant senior à Dakar et Abidjan.',
   'JD')
) as t(slug, display_name, title, bio, initials)
where not exists (select 1 from public.magazine_authors a where a.slug = t.slug);

-- ============================================================
-- 13) Seed : 6 numeros
-- ============================================================

insert into public.magazine_issues (
  slug, number, month_label, theme, blurb, editorial, editor_id,
  cover_gradient_from, cover_gradient_to, cover_text, published_at
)
select
  t.slug, t.number, t.month_label, t.theme, t.blurb, t.editorial,
  (select id from public.magazine_authors where slug = t.editor_slug),
  t.cover_gradient_from, t.cover_gradient_to, t.cover_text::public.cover_text_tone,
  t.published_at::timestamptz
from (values
  ('06-mai-2026', 6, 'Mai 2026', 'Le retour du dollar fort',
   'Comment l''UEMOA se positionne face à un environnement de dollar fort et de cacao record.',
   'Le dollar a repris des couleurs au printemps 2026, et la zone CFA n''est pas immunisée par son peg à l''euro. Dans ce numéro, nous décryptons les conséquences pour les commodities, les souverains et les valeurs cotées BRVM. Bonne lecture.',
   'kokou-segla', '#0c4a6e', '#1d4ed8', 'light', '2026-05-01T00:00:00Z'),
  ('05-avril-2026', 5, 'Avril 2026', 'Le grand bilan du Q1',
   'Les chiffres clés du premier trimestre 2026 sur la BRVM et le marché obligataire UEMOA.',
   'Trois mois ont suffi pour redessiner les équilibres : le BRVM Composite reprend des couleurs, l''or marque de nouveaux records et les souverains UEMOA voient leurs spreads se compresser. Tour d''horizon.',
   'kokou-segla', '#7c2d12', '#ea580c', 'light', '2026-04-01T00:00:00Z'),
  ('04-mars-2026', 4, 'Mars 2026', '27 ans de BRVM',
   'Anniversaire de la place régionale : ce que les chiffres nous disent depuis 1998.',
   'La BRVM fête ses 27 ans. L''occasion de prendre du recul : ce qui a changé, ce qui n''a pas bougé, et ce que les prochaines années nous réservent. Numéro spécial archive et prospective.',
   'kokou-segla', '#064e3b', '#10b981', 'light', '2026-03-01T00:00:00Z'),
  ('03-fevrier-2026', 3, 'Février 2026', 'Inflation, taux et banques',
   'L''inflation UEMOA recule, la BCEAO prudente, et les banques cotées reprennent l''initiative.',
   'Avec une inflation qui revient lentement vers la cible de 2 %, la BCEAO maintient son cap prudent. Mais sur le terrain, les banques BRVM reprennent l''initiative — analyse de leurs trajectoires.',
   'kokou-segla', '#581c87', '#a855f7', 'light', '2026-02-01T00:00:00Z'),
  ('02-janvier-2026', 2, 'Janvier 2026', '10 thèmes pour 2026',
   'Notre sélection des grands thèmes d''investissement à suivre cette année dans l''UEMOA.',
   'L''année commence avec un agenda chargé : politique monétaire BCEAO, échéances souveraines, valorisation des banques, industrialisation… Voici nos 10 thèmes à surveiller pour 2026.',
   'kokou-segla', '#1e1b4b', '#6366f1', 'light', '2026-01-01T00:00:00Z'),
  ('01-decembre-2025', 1, 'Décembre 2025', 'Bilan 2025',
   'L''année boursière UEMOA résumée en chiffres et en analyses.',
   'Premier numéro d''Azimut Magazine. Pour cette édition inaugurale, nous revenons sur l''année boursière 2025 : performances, volatilité, faits marquants et ce que nous gardons en tête pour la suite.',
   'kokou-segla', '#7f1d1d', '#ef4444', 'light', '2025-12-01T00:00:00Z')
) as t(slug, number, month_label, theme, blurb, editorial, editor_slug,
       cover_gradient_from, cover_gradient_to, cover_text, published_at)
where not exists (select 1 from public.magazine_issues i where i.slug = t.slug);

-- ============================================================
-- 14) Seed : articles
--    Helpers locaux : on se base sur slug pour resoudre issue_id et author_id.
-- ============================================================

-- Articles de mai 2026
insert into public.magazine_articles (
  slug, issue_id, category, title, dek, excerpt, tags,
  author_id, reading_time_minutes, accent, body, featured, published_at
)
select
  t.slug,
  (select id from public.magazine_issues   where slug = t.issue_slug),
  t.category::public.article_category,
  t.title, t.dek, t.excerpt, t.tags,
  (select id from public.magazine_authors  where slug = t.author_slug),
  t.reading_time_minutes, t.accent, t.body::jsonb, t.featured, t.published_at::timestamptz
from (values
  (
    'dollar-fort-uemoa-mai-2026', '06-mai-2026', 'macro',
    'L''UEMOA face à la nouvelle architecture du dollar',
    'Le retour du dollar fort transforme les équations macro de la zone CFA. Décryptage.',
    'Le DXY a repris 6 % depuis janvier. Pour les pays UEMOA, peggeurs à l''euro, l''effet n''est ni neutre ni uniforme : exports cacao en bénéficient, énergie et imports en pâtissent. Cartographie des gagnants et des perdants.',
    array['dollar','DXY','UEMOA','FCFA','macro'],
    'fatou-ciss', 8, '#0c4a6e',
    $j$[
      {"type":"paragraph","lead":true,"text":"Depuis janvier 2026, le Dollar Index (DXY) a regagné près de 6 %, propulsé par une Réserve fédérale qui repousse ses baisses de taux et un risque géopolitique qui ravive la fonction refuge du billet vert. Pour la zone UEMOA, peggée à l'euro à 655,957 XOF, l'impact se diffuse de manière indirecte mais réelle."},
      {"type":"heading","level":2,"text":"Pourquoi le peg ne neutralise pas tout","id":"peg"},
      {"type":"paragraph","text":"Le franc CFA est arrimé à l'euro, donc mécaniquement il se déprécie face au dollar quand l'euro lâche. La paire USD/XOF a franchi 615 FCFA fin avril, soit son plus haut niveau depuis 18 mois. La conséquence directe se lit dans deux canaux distincts."},
      {"type":"stats","items":[
        {"label":"USD/XOF · 1 an","value":"+8,2 %","accent":"#dc2626"},
        {"label":"Cacao · YTD","value":"+34 %","accent":"#16a34a"},
        {"label":"Brent · YTD","value":"+4 %","accent":"#475569"},
        {"label":"Or · YTD","value":"+19 %","accent":"#ca8a04"}
      ]},
      {"type":"heading","level":2,"text":"Les gagnants : exportateurs de matières premières"},
      {"type":"paragraph","text":"Côte d'Ivoire en tête. Les recettes cacao, exprimées en USD, se convertissent en FCFA à un taux désormais 8 % plus favorable qu'il y a 12 mois. À cours stable, les producteurs gagnent en pouvoir d'achat ; à cours haussier — comme actuellement avec un cacao au-dessus de 5 000 USD/tonne — l'effet est multiplicatif sur les recettes du secteur."},
      {"type":"callout","tone":"success","title":"Boost mécanique pour PALMCI, SAPH, SOGB","text":"Les sociétés cotées BRVM exposées aux exports en USD voient leur top line en FCFA s'apprécier sans effort opérationnel. Mais attention au cycle : la conversion devient défavorable dès que le cacao corrige."},
      {"type":"heading","level":2,"text":"Les perdants : énergie, équipements, biens importés"},
      {"type":"paragraph","text":"Le revers est connu : l'UEMOA importe massivement des biens d'équipement, du pétrole et des produits alimentaires, dont la facture s'apprécie au rythme du dollar. Les distributeurs (TTLC, SHEC) peuvent répercuter, mais avec un décalage qui pèse sur leurs marges trimestrielles."},
      {"type":"list","items":["Pétrole brut : facture en USD pour des États qui exportent peu (sauf Sénégal, Niger)","Riz importé d'Asie : tension sur les prix de vente intérieurs","Engrais et produits chimiques : marges des coopératives sous pression","Équipements industriels : ralentissement des projets capex"]},
      {"type":"heading","level":2,"text":"Que faire en portefeuille ?"},
      {"type":"paragraph","text":"Pour un investisseur diversifié sur la BRVM, l'arbitrage s'impose : surpondérer les valeurs exportatrices (oléagineux, mines via les recettes fiscales) et alléger les valeurs lourdement exposées aux imports en USD. Les souverains UEMOA, eux, restent moins sensibles : leur dette est majoritairement émise en FCFA, donc à l'abri direct du change."},
      {"type":"quote","text":"Quand le dollar grimpe, la BRVM divise : les exportateurs en USD accélèrent, les importateurs ralentissent. La diversification sectorielle n'a jamais été aussi cruciale.","author":"Fatou Cissé, économiste UEMOA"}
    ]$j$,
    true, '2026-05-02T00:00:00Z'
  ),
  (
    'bceao-statu-quo-mai-2026', '06-mai-2026', 'macro',
    'BCEAO : ce que signifie le statu quo monétaire de mai 2026',
    'Le CPM laisse le TIAO inchangé à 3,50 %. Pourquoi cette stabilité dit beaucoup sur la lecture macro de l''institut d''émission.',
    'La BCEAO maintient son taux directeur pour le quatrième mois consécutif. Loin d''être un non-événement, ce statu quo signale une lecture précise des tensions inflationnistes et un ancrage explicite au cycle ECB.',
    array['BCEAO','TIAO','politique monétaire','inflation'],
    'fatou-ciss', 6, '#059669',
    $j$[
      {"type":"paragraph","lead":true,"text":"Pas de surprise lors du Comité de Politique Monétaire (CPM) du 30 avril : le TIAO reste à 3,50 %. Mais sous l'apparente immobilité, les nuances du communiqué méritent attention."},
      {"type":"heading","level":2,"text":"Une inflation qui se modère"},
      {"type":"paragraph","text":"L'IHPC progresse de 2,4 % sur un an en avril, contre 3,1 % en janvier. La BCEAO note que les tensions sur les biens alimentaires reculent, soutenues par une bonne récolte 2025-2026. Le glissement annuel reste cependant au-dessus de la cible de 2 %."},
      {"type":"callout","tone":"info","title":"À retenir","text":"Le CPM signale qu'une baisse de TIAO ne sera envisagée qu'après deux trimestres consécutifs sous la cible de 2 %. À cadence actuelle, cela amène le marché à anticiper un assouplissement au plus tôt fin 2026."},
      {"type":"heading","level":2,"text":"Implications marché"},
      {"type":"paragraph","text":"Sur le marché obligataire, les rendements des BAT 12 mois oscillent autour de 3,80 %. Les OAT à 7 ans cotent autour de 6,30 %, soit un spread de 250 bps qui reflète une courbe en pente positive normalisée. Les investisseurs continuent de souscrire aux émissions UMOA-Titres avec un appétit modéré mais constant."},
      {"type":"stats","items":[
        {"label":"TIAO","value":"3,50 %","sub":"inchangé depuis fév."},
        {"label":"Inflation avr.","value":"2,4 %","sub":"vs cible 2 %"},
        {"label":"BAT 12m","value":"3,80 %","sub":"rendement secondaire"},
        {"label":"OAT 7Y","value":"6,30 %","sub":"courbe normale"}
      ]}
    ]$j$,
    false, '2026-05-05T00:00:00Z'
  ),
  (
    'cacao-5000-usd-mai-2026', '06-mai-2026', 'macro',
    'Cacao 5 000 USD : pourquoi le rallye n''est peut-être pas terminé',
    'Les fondamentaux soutiennent encore le cours. Mais les risques s''accumulent à l''horizon de la prochaine récolte.',
    'Le cacao a doublé en deux ans. L''offre ouest-africaine peine toujours à se reconstituer, la demande chocolat tient bon, et les fonds spéculatifs restent positionnés long. Mais la prochaine récolte sera scrutée de près.',
    array['cacao','matières premières','Côte d''Ivoire'],
    'fatou-ciss', 7, '#7c2d12',
    $j$[
      {"type":"paragraph","lead":true,"text":"Le cacao a touché 5 200 USD/tonne fin avril, un niveau jamais atteint depuis 1977 en termes nominaux. Pour les exportateurs ouest-africains, et la Côte d'Ivoire en particulier, c'est un alignement de planètes inattendu."},
      {"type":"heading","level":2,"text":"Trois facteurs structurels"},
      {"type":"list","ordered":true,"items":["Les vergers ivoirien et ghanéen vieillissent (>30 ans en moyenne) et la productivité décline.","Le swollen shoot, maladie virale, a détruit jusqu'à 20 % des superficies au Ghana sur les 5 dernières années.","Les conditions météo (El Niño) ont réduit les rendements de 15-20 % sur la saison principale 2024-2025."]},
      {"type":"heading","level":2,"text":"Effet sur les producteurs locaux"},
      {"type":"paragraph","text":"Le Conseil du Café-Cacao ivoirien a relevé le prix garanti aux producteurs à 2 000 FCFA/kg pour la campagne intermédiaire. C'est encore loin du cours mondial mais c'est un record historique pour les planteurs. Les revenus ruraux du sud-ouest ivoirien progressent significativement, soutenant la consommation et indirectement la BRVM."},
      {"type":"callout","tone":"warning","title":"Le risque que tout le monde regarde","text":"La récolte 2025-2026 sera décisive. Si les conditions météo permettent un rebond de 15-20 % de la production, le cours pourrait corriger violemment. Plusieurs analystes parlent d'un retour vers 3 500-4 000 USD à horizon 12 mois."}
    ]$j$,
    false, '2026-05-08T00:00:00Z'
  ),
  (
    'sonatel-valorisation-q1', '06-mai-2026', 'valeurs',
    'SONATEL : valorisation et perspectives Q1 2026',
    'Plus grosse capi de la BRVM, SONATEL traverse un trimestre charnière. Dividende, croissance, multiples.',
    'Avec un chiffre d''affaires en hausse de 7 % et un FCF qui finance le dividende de 1 600 FCFA, SONATEL maintient sa trajectoire. Reste à savoir si le PER de 11x reflète vraiment toutes les opportunités du groupe.',
    array['SONATEL','télécoms','valorisation','dividende'],
    'moussa-bamba', 9, '#1d4ed8',
    $j$[
      {"type":"paragraph","lead":true,"text":"SONATEL publie un Q1 2026 solide. Le chiffre d'affaires consolidé progresse de 7,1 % sur 12 mois, l'EBITDA de 9,3 %. Mais les multiples se contractent : à 21 000 FCFA, le titre se paye 11x les bénéfices 2026e."},
      {"type":"heading","level":2,"text":"Une croissance portée par 5 marchés"},
      {"type":"paragraph","text":"Le groupe opère désormais au Sénégal, Mali, Guinée, Sierra Leone et Guinée-Bissau. La pénétration data continue de progresser (60 % des revenus mobiles), tirée par la 4G et le déploiement progressif de la 5G dans les capitales."},
      {"type":"stats","items":[
        {"label":"CA Q1","value":"+7,1 %","sub":"vs Q1 2025"},
        {"label":"EBITDA Q1","value":"+9,3 %","sub":"marge stable 47 %"},
        {"label":"PER 2026e","value":"11,2x","sub":"vs 13x sur 5 ans"},
        {"label":"Yield","value":"7,6 %","sub":"div 1 600 / cours 21 000"}
      ]},
      {"type":"heading","level":2,"text":"Le débat de la valorisation"},
      {"type":"paragraph","text":"Les bulls argumentent : SONATEL combine yield de 7,6 %, croissance organique 7 %, et bilan net cash. Soit une rentabilité totale attendue de 14-15 %. Les bears répondent : le marché sénégalais arrive à maturité, la concurrence s'intensifie en Guinée, et le risque réglementaire monte (taxes sectorielles)."},
      {"type":"quote","text":"À 11x les bénéfices, on paye SONATEL au prix d'une utility européenne pour une croissance de 7 %. C'est un pricing qui m'interpelle.","author":"Moussa Bamba, analyste BRVM"}
    ]$j$,
    false, '2026-05-12T00:00:00Z'
  ),
  (
    'obligations-vertes-cfa', '06-mai-2026', 'obligations',
    'Le retour des obligations vertes en zone CFA',
    'Trois émissions green bonds attendues d''ici fin 2026. État des lieux et perspectives.',
    'Après la première émission BOAD de 2018, le marché des green bonds reprend des couleurs en UEMOA. Trois projets en pipeline pour 2026, dont une émission souveraine ivoirienne.',
    array['green bond','obligations','ESG','BOAD'],
    'aminata-diallo', 6, '#15803d',
    $j$[
      {"type":"paragraph","lead":true,"text":"Le marché obligataire UEMOA s'apprête à voir 3 émissions vertes d'ici décembre, totalisant ~150 Md FCFA. Une première relative à l'échelle de la place, mais un signal fort."},
      {"type":"heading","level":2,"text":"Les projets en pipeline"},
      {"type":"list","items":["BOAD : 50 Md FCFA pour le financement de projets solaires régionaux","État de Côte d'Ivoire : 75 Md FCFA pour le programme 'Côte d'Ivoire 2030 vert'","Une émission corporate (énergie renouvelable) à confirmer en T4"]},
      {"type":"callout","tone":"info","title":"Standardisation en cours","text":"Le CREPMF travaille avec la BCEAO sur un cadre réglementaire dédié, qui devrait être finalisé pour l'automne 2026. Il imposera notamment un audit externe ESG annuel pour toute émission labellisée 'green'."}
    ]$j$,
    false, '2026-05-15T00:00:00Z'
  ),
  (
    'interview-dg-boad', '06-mai-2026', 'interview',
    'Entretien : le directeur général de la BOAD',
    '« L''UEMOA a 5 ans pour décider de son rôle dans le financement climatique africain. »',
    'Le directeur général de la Banque Ouest-Africaine de Développement nous a accordé un entretien d''une heure sur le futur du financement régional, le rôle des green bonds, et la place de la BOAD dans la transformation économique de la zone.',
    array['BOAD','interview','financement','ESG'],
    'kokou-segla', 12, '#581c87',
    $j$[
      {"type":"paragraph","lead":true,"text":"À Lomé, dans son bureau du siège, le directeur général de la BOAD nous reçoit pour un échange dense sur les enjeux régionaux. Extraits choisis."},
      {"type":"heading","level":2,"text":"« Le financement climatique est notre nouvelle frontière »"},
      {"type":"paragraph","text":"« Nous avons identifié 80 projets éligibles dans les 8 pays UEMOA, représentant un besoin de financement total de 4 800 Md FCFA sur 10 ans. C'est colossal, et c'est pour ça que nous démarrons par le marché régional via les green bonds. »"},
      {"type":"quote","text":"Notre objectif : devenir, à l'horizon 2030, le premier émetteur de dette verte en zone CFA, avec 500 Md FCFA encours sur 5 ans.","author":"Directeur général de la BOAD"},
      {"type":"heading","level":2,"text":"Sur l'allocation des ressources"},
      {"type":"paragraph","text":"« Nous priorisons trois secteurs : l'énergie solaire, l'agriculture résiliente, et la mobilité durable. Le défi n'est pas seulement de financer, c'est de structurer des projets bancables — et c'est là que notre rôle d'animation est crucial. »"}
    ]$j$,
    false, '2026-05-18T00:00:00Z'
  ),
  (
    'bilan-q1-brvm-2026', '05-avril-2026', 'marches',
    'Les chiffres clés du Q1 2026 sur la BRVM',
    'Le BRVM Composite gagne 6,4 % au premier trimestre. Top performers, volumes, secteurs.',
    'Q1 2026 : la BRVM enchaîne un troisième trimestre positif. Volumes en hausse de 22 %, banques et télécoms en tête, et la rotation sectorielle qui s''accentue. Le bilan en chiffres.',
    array['BRVM','trimestre','performance'],
    'moussa-bamba', 7, '#1d4ed8',
    $j$[
      {"type":"paragraph","lead":true,"text":"Le BRVM Composite clôture le premier trimestre 2026 sur une hausse de 6,4 %, troisième performance trimestrielle positive consécutive. Les volumes échangés progressent de 22 % vs Q1 2025."},
      {"type":"stats","items":[
        {"label":"BRVM Composite","value":"+6,4 %","accent":"#16a34a"},
        {"label":"BRVM 30","value":"+7,1 %","accent":"#16a34a"},
        {"label":"Volume Q1","value":"+22 %","sub":"vs Q1 2025"},
        {"label":"Capi globale","value":"+5,8 %","sub":"8 950 Md FCFA"}
      ]},
      {"type":"heading","level":2,"text":"Les 5 meilleures performances"},
      {"type":"list","ordered":true,"items":["BICC : +18 % (banque ivoirienne, dividende exceptionnel)","PALMCI : +15 % (palme à 1 200 USD)","TOTAL CI : +12 % (margé distributeurs énergie)","SAPH : +11 % (caoutchouc en hausse)","SGBC : +10 % (résultats annuels au-dessus du consensus)"]},
      {"type":"heading","level":2,"text":"Ce qu'il faut retenir"},
      {"type":"paragraph","text":"La rotation se confirme : les banques (+9 % en moyenne) prennent le relais des télécoms (+5 %), portées par des résultats annuels solides et une perception améliorée du risque crédit. Les valeurs agro-industrielles bénéficient mécaniquement de la hausse des matières premières exportées en USD."}
    ]$j$,
    true, '2026-04-03T00:00:00Z'
  ),
  (
    'or-3500-uemoa', '05-avril-2026', 'macro',
    'Or à 3 500 USD : qui en profite vraiment dans l''UEMOA ?',
    'Le prix de l''or a battu son record. Mali, Burkina, Sénégal — ces pays sont concernés à des degrés très différents.',
    'L''once d''or franchit 3 500 USD l''once. Les recettes minières gonflent dans 4 États UEMOA, mais la BRVM n''a pas de pure-player coté pour en profiter directement. Le canal de transmission se joue ailleurs.',
    array['or','Mali','Burkina','Sénégal','mines'],
    'fatou-ciss', 6, '#ca8a04',
    $j$[
      {"type":"paragraph","lead":true,"text":"L'once d'or a touché 3 510 USD début avril, soit +19 % depuis janvier. Pour le Mali (1er producteur UEMOA), le Burkina (2e) et le Sénégal (3e), c'est un boost mécanique des recettes d'export et fiscales."},
      {"type":"heading","level":2,"text":"Pas de pure-player coté"},
      {"type":"paragraph","text":"Aucune société minière n'est cotée à la BRVM. L'impact se transmet donc indirectement : recettes fiscales accrues → consommation publique soutenue → bénéfices indirects pour banques (SGBC, BICC) et grande conso (SHEC, BICC)."},
      {"type":"callout","tone":"info","title":"Le sujet du Sénégal","text":"Le Sénégal est passé de 13t à plus de 20t de production aurifère depuis 2023. Avec un cours à 3 500 USD, c'est environ 700 M USD de recettes minières annuelles — un facteur stabilisant pour le budget Etat 2026."}
    ]$j$,
    false, '2026-04-08T00:00:00Z'
  ),
  (
    'lire-dici-pratique', '05-avril-2026', 'outils',
    'Comment lire un DICI : guide pratique',
    'Le Document d''Information Clé pour l''Investisseur résume tout ce qu''il faut savoir sur un OPC. Mode d''emploi.',
    'Frais cachés, profil de risque, performance lissée : le DICI est conçu pour vous protéger, à condition de savoir le décoder. Notre guide en 5 points clés.',
    array['DICI','OPCVM','FCP','frais'],
    'jp-dembele', 8, '#0d9488',
    $j$[
      {"type":"paragraph","lead":true,"text":"Le DICI (Document d'Information Clé pour l'Investisseur) est obligatoire pour tout OPCVM commercialisé en UEMOA. C'est un format synthétique, normalisé, censé protéger l'épargnant. Encore faut-il savoir le lire."},
      {"type":"heading","level":2,"text":"Les 5 sections à examiner"},
      {"type":"list","ordered":true,"items":["Profil de risque (1 à 7) : sous 4, c'est un fonds prudent ; au-dessus, on rentre dans les actions et la volatilité.","Frais courants : tout ce qui est ponctionné chaque année, hors performance — viser sous 2 % pour un FCP actions.","Frais d'entrée et de sortie : à négocier. 0 % est possible chez certains distributeurs.","Performance historique : exiger 5 ans de recul minimum, comparée à un benchmark explicite.","Composition : un FCP 'BRVM' qui détient 60 % de souverains UEMOA, ce n'est pas vraiment un FCP actions."]},
      {"type":"callout","tone":"warning","title":"Le piège classique","text":"Une performance brute affichée à +12 %/an avec 3 % de frais courants donne un rendement net de 9 %/an. À long terme, ça change tout : 1 M FCFA placé pendant 10 ans à 12 % donne 3,1 M ; à 9 %, seulement 2,4 M."}
    ]$j$,
    false, '2026-04-15T00:00:00Z'
  ),
  (
    'benin-oat-2034', '05-avril-2026', 'obligations',
    'Bénin OAT 2034 : décryptage de l''émission record',
    '150 Md FCFA levés en une journée à 6,75 %. Ce que ça dit du marché souverain UEMOA.',
    'Le Bénin a réussi son émission obligataire la plus importante de son histoire. Sursouscription à 1,8x, taux de 6,75 % sur 10 ans, allocation principalement domestique. Lecture entre les lignes.',
    array['Bénin','OAT','souverain','UMOA-Titres'],
    'aminata-diallo', 7, '#b45309',
    $j$[
      {"type":"paragraph","lead":true,"text":"150 Md FCFA en une seule séance d'adjudication, sursouscrits à 1,82x. C'est le score réalisé par l'OAT BENIN 6,75 % 2034 le 17 avril. Du jamais vu sur le marché béninois."},
      {"type":"stats","items":[
        {"label":"Montant levé","value":"150 Md FCFA","sub":"objectif initial 100 Md"},
        {"label":"Taux","value":"6,75 %","sub":"fin de placement"},
        {"label":"Sursouscription","value":"1,82x","sub":"demande 274 Md"},
        {"label":"Allocation domestique","value":"78 %","sub":"vs étrangère 22 %"}
      ]},
      {"type":"heading","level":2,"text":"Ce que ça signale"},
      {"type":"paragraph","text":"Trois lectures possibles. (1) Le marché secondaire UEMOA a digéré la hausse de 2024 : les acheteurs reviennent. (2) Le Bénin bénéficie d'une perception améliorée de son risque souverain (notation Fitch passée à BB-). (3) Les institutionnels régionaux (SGBC, BOA) ont reçu des allocations significatives, ce qui structure une demande long-only durable."}
    ]$j$,
    false, '2026-04-22T00:00:00Z'
  ),
  (
    'ipo-bourse', '05-avril-2026', 'marches',
    'Comprendre l''introduction en bourse de la nouvelle émission',
    'Comment lire le visa CREPMF, valoriser et décider de souscrire.',
    'Une nouvelle IPO est annoncée sur la BRVM pour le second semestre. Voici la grille de lecture pour évaluer la qualité et juger du prix d''introduction.',
    array['IPO','BRVM','valorisation'],
    'moussa-bamba', 8, '#7c3aed',
    $j$[
      {"type":"paragraph","lead":true,"text":"Une introduction en bourse, c'est un événement rare sur la BRVM (1 à 2 par an). Pour l'investisseur particulier, c'est aussi une décision difficile : prix souvent ambitieux, lock-up des actionnaires de référence, peu de comparables."},
      {"type":"heading","level":2,"text":"La checklist"},
      {"type":"list","items":["Trois années de comptes audités cohérents","Croissance organique > inflation","ROE > coût du capital implicite","Politique de dividende clarifiée","Lock-up des fondateurs ≥ 1 an"]},
      {"type":"callout","tone":"neutral","title":"Notre méthode","text":"Comparer le PER d'introduction à 3 références : la médiane sectorielle BRVM, le PER moyen 5 ans de la valeur la plus comparable, et 12-15x (PER 'normal' BRVM). Si le PER d'IPO dépasse les 3, prudence."}
    ]$j$,
    false, '2026-04-25T00:00:00Z'
  ),
  (
    'brvm-27-ans-graphique', '04-mars-2026', 'marches',
    'BRVM : 27 ans d''histoire en 1 graphique',
    'Du fixing inaugural de 1998 aux 8 950 Md FCFA de capi actuels.',
    '27 ans après son lancement, la BRVM a connu 4 phases distinctes : décollage 1998-2003, consolidation 2004-2014, choc 2015-2020, renaissance 2021-2026. Lecture rétrospective.',
    array['BRVM','histoire','long terme'],
    'kokou-segla', 7, '#064e3b',
    $j$[
      {"type":"paragraph","lead":true,"text":"Le 16 septembre 1998, la BRVM cotait pour la première fois 35 valeurs au fixing depuis Abidjan. 27 ans plus tard, ce sont 47 valeurs, 8 pays UEMOA et 8 950 Md FCFA de capitalisation totale."},
      {"type":"heading","level":2,"text":"4 phases distinctes"},
      {"type":"list","ordered":true,"items":["1998-2003 — Décollage : démarrage modeste, BRVM Composite à 100 puis 130. Liquidité limitée.","2004-2014 — Consolidation : croissance constante, le Composite atteint 270, dopée par les SONATEL, ETIT, SGBC.","2015-2020 — Choc : crise des matières premières puis COVID, recul à 130 (-50 % du sommet).","2021-2026 — Renaissance : retour au-dessus de 220, banques + télécoms + agro en moteur."]},
      {"type":"stats","items":[
        {"label":"Lancement","value":"16/09/1998","sub":"35 valeurs"},
        {"label":"Sommet 2014","value":"270","sub":"BRVM Composite"},
        {"label":"Creux 2020","value":"130","sub":"−52 % vs sommet"},
        {"label":"Aujourd'hui","value":"225","sub":"+73 % depuis creux"}
      ]}
    ]$j$,
    true, '2026-03-04T00:00:00Z'
  ),
  (
    'naira-impact-ci', '04-mars-2026', 'macro',
    'Le marché du naira et son impact sur le commerce ivoirien',
    'Le naira a perdu 70 % en 4 ans. Conséquences sur le commerce informel et les flux Lagos-Abidjan.',
    'La dépréciation chronique du naira nigérian transforme les flux commerciaux ouest-africains. Analyse de l''impact sur les distributeurs ivoiriens et la balance commerciale UEMOA.',
    array['naira','Nigeria','commerce','FCFA'],
    'fatou-ciss', 6, '#16a34a',
    $j$[
      {"type":"paragraph","lead":true,"text":"1 NGN = 0,40 XOF. Il y a 4 ans, c'était 0,80. La dépréciation chronique du naira contre le FCFA bouleverse les équilibres du commerce informel régional."},
      {"type":"callout","tone":"warning","title":"Effet sur les exports UEMOA vers le Nigeria","text":"Le pouvoir d'achat des consommateurs nigerians s'érode face aux produits ivoiriens (cacao transformé, palme, ciment). Les exportations informelles UEMOA→Nigeria ont reculé d'environ 30 % en 2 ans selon les estimations de la BCEAO."}
    ]$j$,
    false, '2026-03-10T00:00:00Z'
  ),
  (
    '5-pme-uemoa-ipo', '04-mars-2026', 'marches',
    'Ces 5 PME UEMOA qui pourraient s''introduire en bourse',
    'Profils, business models et probabilité d''IPO sur les 24 prochains mois.',
    'Le pipeline IPO BRVM se reconstitue progressivement. Cinq sociétés cotables se distinguent : agroalimentaire, fintech, énergie, distribution, santé. Tour de piste.',
    array['IPO','PME','BRVM'],
    'moussa-bamba', 8, '#0c4a6e',
    $j$[
      {"type":"paragraph","lead":true,"text":"Cinq sociétés UEMOA se distinguent par leur profil de cotation potentielle. Sans nommer (avant communication officielle), voici les profils que nous suivons."},
      {"type":"list","ordered":true,"items":["Agroalimentaire (Côte d'Ivoire) : 80 Md FCFA de CA, leader ouest-africain sur sa niche, fonds de PE en exit prévu 2026-2027.","Fintech (Sénégal) : croissance >40 %/an, dossier visa CREPMF en préparation.","Énergie renouvelable (UEMOA) : portefeuille de centrales solaires, besoin de capitaux pour la prochaine phase.","Distribution moderne (Burkina) : groupe régional de supermarchés, levée publique pour internationalisation.","Santé / pharma (Côte d'Ivoire) : production locale de génériques, soutien BOAD."]}
    ]$j$,
    false, '2026-03-15T00:00:00Z'
  ),
  (
    'stress-test-banques-brvm', '04-mars-2026', 'valeurs',
    'Stress test : les banques BRVM face à un choc de taux',
    'Que se passerait-il si la BCEAO remontait son TIAO de 200 bps demain ?',
    'Simulation : les 7 banques BRVM majeures face à une hausse de 200 bps du TIAO. Marges nettes d''intérêt, qualité d''actif, fonds propres. Les vulnérabilités et les forces.',
    array['banques','stress test','TIAO','BCEAO'],
    'moussa-bamba', 9, '#7c3aed',
    $j$[
      {"type":"paragraph","lead":true,"text":"Que se passerait-il si la BCEAO remontait demain son TIAO de 200 bps ? L'exercice pédagogique permet d'identifier les vulnérabilités et les coussins des banques cotées BRVM."},
      {"type":"heading","level":2,"text":"Effet sur la marge nette d'intérêt"},
      {"type":"paragraph","text":"Une hausse de 200 bps se traduit asymétriquement : les actifs (prêts à taux variable, titres flottants) se réajustent vite, les passifs (dépôts à vue, comptes courants) plus lentement. Net : la marge nette s'élargit à court terme avant de se normaliser."},
      {"type":"callout","tone":"info","title":"Gagnantes : les banques universelles","text":"SGBC, SIB, BOA bénéficient mécaniquement à court terme. Sur 12 mois, la marge nette pourrait progresser de 30-50 bps, soit 5-8 % d'EBIT supplémentaire."}
    ]$j$,
    false, '2026-03-20T00:00:00Z'
  ),
  (
    'construire-portefeuille-obligataire-uemoa', '04-mars-2026', 'outils',
    'Méthode : construire un portefeuille obligataire UEMOA',
    'Allocation, échelonnement (laddering), choix des émetteurs. Notre framework pas-à-pas.',
    'Construire un portefeuille obligataire UEMOA rentable demande une méthode. Voici la nôtre, en 5 étapes : objectif, horizon, laddering, sélection, suivi.',
    array['portefeuille obligataire','laddering','OAT'],
    'aminata-diallo', 8, '#0d9488',
    $j$[
      {"type":"paragraph","lead":true,"text":"Un portefeuille obligataire bien construit dans l'UEMOA combine sécurité (souverains), rendement (corporates) et flexibilité (laddering). Méthode en 5 étapes."},
      {"type":"list","ordered":true,"items":["Définir l'objectif : revenu courant, préservation de capital, ou matching de passif (ex : retraite).","Choisir l'horizon : 1-3 ans (court), 3-7 ans (moyen), 7+ ans (long). Privilégier la duration la plus courte si la BCEAO peut serrer.","Échelonner les maturités (laddering) : répartir les coupons et les remboursements pour lisser le risque de réinvestissement.","Sélectionner les émetteurs : 70-80 % souverains UEMOA + 20-30 % corporates de qualité (BOAD, banques, télécoms).","Suivre la duration globale et le rendement à l'échéance pondéré du portefeuille."]}
    ]$j$,
    false, '2026-03-25T00:00:00Z'
  ),
  (
    'inflation-uemoa-h2-2026', '03-fevrier-2026', 'macro',
    'Inflation UEMOA : retour à 2 % attendu pour H2',
    'Les pressions sur les prix se modèrent. Vers une normalisation au second semestre.',
    'Après un pic à 3,8 % en 2025, l''inflation UEMOA glisse régulièrement. La BCEAO anticipe un retour durable à 2 % au second semestre 2026.',
    array['inflation','BCEAO','UEMOA'],
    'fatou-ciss', 5, '#a855f7',
    $j$[
      {"type":"paragraph","lead":true,"text":"L'inflation UEMOA s'établit à 2,9 % en janvier 2026, en repli régulier. La trajectoire suggère un retour à la cible de 2 % au second semestre."},
      {"type":"stats","items":[
        {"label":"Inflation jan","value":"2,9 %","sub":"vs 3,8 % pic 2025"},
        {"label":"Cible BCEAO","value":"2,0 %","sub":"tolérance ±1 %"},
        {"label":"Prix alimentaires","value":"+1,8 %","sub":"principal frein 2025"}
      ]}
    ]$j$,
    false, '2026-02-04T00:00:00Z'
  ),
  (
    'palmiste-fondamentaux-2026', '03-fevrier-2026', 'macro',
    'Cours du palmiste : analyse fondamentale',
    'Offre malaisienne, demande indienne, et conséquences pour PALMCI et SOGB.',
    'Le palmiste oscille autour de 1 050 USD/tonne. Décryptage des forces qui pilotent le prix et conséquences pour les valeurs ivoiriennes du secteur.',
    array['palme','PALMCI','SOGB','matières premières'],
    'fatou-ciss', 6, '#65a30d',
    $j$[
      {"type":"paragraph","lead":true,"text":"Le palmiste se maintient autour de 1 050 USD/tonne, soutenu par une offre malaisienne en deçà des attentes et une demande indienne robuste."},
      {"type":"heading","level":2,"text":"Effet sur les valeurs cotées"},
      {"type":"paragraph","text":"PALMCI et SOGB voient leurs marges s'améliorer avec la conversion en FCFA. Les marges EBITDA devraient progresser de 200-300 bps sur l'exercice 2026 si le cours se maintient."}
    ]$j$,
    false, '2026-02-09T00:00:00Z'
  ),
  (
    'etrangers-detournent-brvm', '03-fevrier-2026', 'marches',
    'Pourquoi tant d''investisseurs étrangers se détournent de la BRVM ?',
    'Liquidité, accès, fiscalité : le triangle des frictions.',
    'Les flux étrangers vers la BRVM stagnent depuis 5 ans. Les raisons : liquidité limitée, complexité d''accès, fiscalité non harmonisée. Pistes de réforme.',
    array['flux étrangers','BRVM','liquidité'],
    'kokou-segla', 7, '#581c87',
    $j$[
      {"type":"paragraph","lead":true,"text":"Les flux étrangers vers la BRVM représentent moins de 5 % des volumes échangés, alors qu'ils dépassent 30 % sur la place de Lagos. Le triangle des frictions explique ce décrochage."},
      {"type":"list","items":["Liquidité limitée : volumes quotidiens souvent < 1 M USD sur les blue chips","Accès via SGI exigé : ouverture de compte locale, KYC parfois lourde","Fiscalité variable selon les 8 pays UEMOA : complexité administrative"]}
    ]$j$,
    false, '2026-02-15T00:00:00Z'
  ),
  (
    'bicc-vs-sgbc', '03-fevrier-2026', 'valeurs',
    'BICC vs SGBC : duel de banques cotées',
    'Deux banques universelles ivoiriennes, deux trajectoires.',
    'BICC et SGBC sont les deux blue chips bancaires de la BRVM. Comparaison des fondamentaux, des multiples et des perspectives 2026.',
    array['BICC','SGBC','banques','BRVM'],
    'moussa-bamba', 7, '#1d4ed8',
    $j$[
      {"type":"paragraph","lead":true,"text":"BICC et SGBC : deux poids lourds bancaires de la BRVM. Mais des fondamentaux et des stratégies divergents."},
      {"type":"stats","items":[
        {"label":"BICC ROE 2025","value":"22 %","sub":"supérieur"},
        {"label":"SGBC ROE 2025","value":"19 %","sub":"stable"},
        {"label":"BICC PER","value":"8,1x","sub":""},
        {"label":"SGBC PER","value":"9,3x","sub":""}
      ]}
    ]$j$,
    false, '2026-02-22T00:00:00Z'
  ),
  (
    'futures-brvm-2026', '03-fevrier-2026', 'marches',
    'Le contrat à terme arrive-t-il enfin sur la BRVM ?',
    'Le projet existe depuis 2018. État des lieux et obstacles.',
    'Les contrats à terme sur indice et sur actions sont à l''étude depuis 2018. La BRVM n''a pas encore franchi le pas. Obstacles techniques, réglementaires et de marché.',
    array['futures','BRVM','produits dérivés'],
    'kokou-segla', 5, '#a855f7',
    $j$[
      {"type":"paragraph","lead":true,"text":"L'introduction de futures sur la BRVM est régulièrement évoquée. Pourquoi ça n'a pas encore eu lieu, et qu'est-ce qui pourrait débloquer la situation."},
      {"type":"list","items":["Liquidité actions encore limitée : socle insuffisant pour des futures liquides","Cadre réglementaire CREPMF en évolution","Infrastructures de chambre de compensation à mettre à niveau"]}
    ]$j$,
    false, '2026-02-26T00:00:00Z'
  ),
  (
    '10-themes-2026', '02-janvier-2026', 'edito',
    '10 thèmes d''investissement pour 2026 sur la BRVM',
    'Notre carte des opportunités et des risques pour l''année qui commence.',
    'Ce que nous suivons en 2026 : politique monétaire, IPO, dividendes, banques, télécoms, matières premières, fiscalité, réformes CREPMF.',
    array['BRVM','perspectives','2026'],
    'kokou-segla', 10, '#1e1b4b',
    $j$[
      {"type":"paragraph","lead":true,"text":"Voici, à l'aube de 2026, les 10 thèmes que nous suivrons mois après mois sur la BRVM. Une carte non exhaustive mais directrice."},
      {"type":"list","ordered":true,"items":["Trajectoire de l'inflation et premières baisses de TIAO BCEAO","Pipeline IPO : au moins 2 introductions prévues, peut-être 3","Yield BRVM > 6 % : durabilité face à la baisse des taux","Banques : ROE > 20 % vs valorisation","Télécoms : SONATEL face à la maturité du Sénégal","Cacao : tenue ou correction du rallye 2024-2025 ?","Or : impact sur le Mali, Burkina, Sénégal","Souverains UEMOA : compression des spreads","Réforme fiscale : harmonisation des dividendes attendue","Green bonds : émissions concrètes et liquidité secondaire"]}
    ]$j$,
    true, '2026-01-05T00:00:00Z'
  ),
  (
    'souverains-uemoa-2026', '02-janvier-2026', 'obligations',
    'Souverains UEMOA : quels rendements espérer en 2026 ?',
    'OAT 5-10 ans, BAT 1 an : nos prévisions par maturité.',
    'Avec une BCEAO encore prudente et une trajectoire d''inflation favorable, les souverains UEMOA offrent un point d''entrée intéressant en 2026. Carte par maturité.',
    array['OAT','souverain','UEMOA'],
    'aminata-diallo', 6, '#b45309',
    $j$[
      {"type":"paragraph","lead":true,"text":"La courbe souveraine UEMOA reste pentue : 3,80 % à 1 an, 6,30 % à 7 ans, 7,40 % à 15 ans. Trajectoire 2026 et points d'entrée par maturité."},
      {"type":"stats","items":[
        {"label":"BAT 1Y","value":"3,80 %"},
        {"label":"OAT 3Y","value":"5,10 %"},
        {"label":"OAT 7Y","value":"6,30 %"},
        {"label":"OAT 15Y","value":"7,40 %"}
      ]}
    ]$j$,
    false, '2026-01-12T00:00:00Z'
  ),
  (
    'inflation-actions-dividende', '02-janvier-2026', 'valeurs',
    'Le retour de l''inflation et l''effet sur les actions à dividende',
    'SONATEL, BICC, SGBC : ces dividendes payent-ils la prime de risque inflation ?',
    'Avec une inflation revenant à 2,5-3 %, les actions à fort dividende redeviennent attractives en relatif. Lecture détaillée des yields BRVM 2026.',
    array['dividende','yield','BRVM'],
    'moussa-bamba', 6, '#7c3aed',
    $j$[
      {"type":"paragraph","lead":true,"text":"Les yields médians sur la BRVM : 7,6 % SONATEL, 6,8 % BICC, 7,1 % SGBC. À comparer aux 6,30 % d'une OAT 7 ans."},
      {"type":"callout","tone":"info","title":"Prime de risque positive","text":"Avec une inflation à 2,5 %, le yield réel des principales actions BRVM dépasse 4 %, contre 3-4 % pour les souverains. La prime de risque action reste positive et significative."}
    ]$j$,
    false, '2026-01-20T00:00:00Z'
  ),
  (
    'mali-dette-destin', '02-janvier-2026', 'macro',
    'Mali : la dette et son destin',
    'Trajectoire budgétaire, restructuration, et place dans l''UEMOA.',
    'Le Mali traverse une phase financière complexe. Trajectoire de la dette, négociations FMI, et place sur le marché obligataire UEMOA.',
    array['Mali','dette','souverain'],
    'fatou-ciss', 7, '#475569',
    $j$[
      {"type":"paragraph","lead":true,"text":"Avec un ratio dette/PIB autour de 55 %, le Mali navigue dans une zone tendue. Sa capacité à émettre régulièrement sur le marché UEMOA est scrutée."}
    ]$j$,
    false, '2026-01-25T00:00:00Z'
  ),
  (
    'fcp-performants-2025', '02-janvier-2026', 'outils',
    'Les FCP les plus performants de 2025',
    'Top 5 des fonds par classe d''actifs.',
    'Performance nette 2025, frais et politique : tour d''horizon des FCP UEMOA qui ont fait la différence sur l''année.',
    array['FCP','OPCVM','performance'],
    'jp-dembele', 7, '#0d9488',
    $j$[
      {"type":"paragraph","lead":true,"text":"L'année 2025 a vu une dispersion forte des performances FCP : du +2 % au +14 % selon les segments. Lecture par classe d'actifs."}
    ]$j$,
    false, '2026-01-30T00:00:00Z'
  ),
  (
    'bilan-2025-12-chiffres', '01-decembre-2025', 'marches',
    'Bilan 2025 : la BRVM en 12 chiffres',
    'Performance, volumes, IPO, dividendes : tout 2025 résumé.',
    'Une année 2025 globalement positive : BRVM Composite à +9 %, volumes en hausse, mais des disparités sectorielles fortes. Tableau de bord en 12 chiffres clés.',
    array['BRVM','bilan','2025'],
    'kokou-segla', 6, '#7f1d1d',
    $j$[
      {"type":"paragraph","lead":true,"text":"L'année 2025 s'achève sur un BRVM Composite à +9,2 %, portée par les banques et certaines valeurs agro-industrielles."},
      {"type":"stats","items":[
        {"label":"BRVM Composite","value":"+9,2 %","accent":"#16a34a"},
        {"label":"BRVM 30","value":"+10,8 %","accent":"#16a34a"},
        {"label":"Volumes","value":"+18 %","sub":"vs 2024"},
        {"label":"IPO 2025","value":"1","sub":"1 prévue 2026"}
      ]}
    ]$j$,
    true, '2025-12-05T00:00:00Z'
  ),
  (
    'top-flops-2025', '01-decembre-2025', 'marches',
    'Top et flops de l''année boursière UEMOA',
    'Les meilleures et les pires performances valeur par valeur.',
    'Banques universelles en tête, certaines valeurs cycliques en queue de peloton : palmarès 2025 et lecture par secteur.',
    array['BRVM','top performers','2025'],
    'moussa-bamba', 7, '#dc2626',
    $j$[
      {"type":"paragraph","lead":true,"text":"Les leaders 2025 : BICC (+24 %), SGBC (+19 %), SONATEL (+17 %). Les retardataires : valeurs cycliques exposées au pétrole et certaines small caps."},
      {"type":"list","items":["Top 1 : BICC (+24 %)","Top 2 : SGBC (+19 %)","Top 3 : SONATEL (+17 %)","Flop 1 : valeurs énergie distribution (-8 %)","Flop 2 : small caps illiquides (-12 % moyenne)"]}
    ]$j$,
    false, '2025-12-10T00:00:00Z'
  ),
  (
    'bceao-2025-bilan', '01-decembre-2025', 'macro',
    'Ce que la BCEAO nous a appris en 2025',
    'Trois leçons d''une année de pilotage monétaire dans l''UEMOA.',
    'Pilotage de l''inflation, gestion des liquidités, communication : 2025 a été riche en signaux BCEAO. Trois leçons pour 2026.',
    array['BCEAO','politique monétaire'],
    'fatou-ciss', 6, '#7f1d1d',
    $j$[
      {"type":"paragraph","lead":true,"text":"L'année 2025 a vu la BCEAO assumer un cap clair : prudence sur le TIAO, pilotage subtil de la liquidité, et communication plus structurée."}
    ]$j$,
    false, '2025-12-15T00:00:00Z'
  ),
  (
    'cacao-coton-volatilite', '01-decembre-2025', 'macro',
    'Cacao et coton : les exports UEMOA face à la volatilité',
    'Deux MP au cœur des recettes, deux trajectoires opposées.',
    'Cacao au sommet historique, coton en plein doute : les recettes d''export UEMOA 2025 affichent un visage très contrasté. Cartographie.',
    array['cacao','coton','exports'],
    'fatou-ciss', 6, '#7c2d12',
    $j$[
      {"type":"paragraph","lead":true,"text":"Cacao : +95 % en 2 ans. Coton : -22 % en 2 ans. Pour les pays UEMOA exportateurs des deux (Côte d'Ivoire, Burkina, Mali), c'est un mix qu'il faut savoir lire."}
    ]$j$,
    false, '2025-12-18T00:00:00Z'
  ),
  (
    'selection-2026-5-actions', '01-decembre-2025', 'valeurs',
    'Notre sélection 2026 : 5 actions à suivre',
    'Pas de recommandations d''achat, mais 5 valeurs qui mobiliseront notre attention.',
    'Cinq valeurs cotées qui réunissent à la fois fondamentaux solides, valorisation raisonnable et catalyseurs identifiés pour 2026. Notre liste à suivre.',
    array['BRVM','sélection','2026'],
    'moussa-bamba', 8, '#7f1d1d',
    $j$[
      {"type":"paragraph","lead":true,"text":"Voici les 5 valeurs qui mobiliseront notre couverture en 2026, avec à chaque fois la thèse résumée et les catalyseurs à surveiller."}
    ]$j$,
    false, '2025-12-22T00:00:00Z'
  )
) as t(slug, issue_slug, category, title, dek, excerpt, tags,
       author_slug, reading_time_minutes, accent, body, featured, published_at)
where not exists (select 1 from public.magazine_articles a where a.slug = t.slug);

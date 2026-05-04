-- ============================================================
-- AzimutFinance — Actualités sur les actions BRVM
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Table publique : actualites
-- Bucket Storage : actualites-attachments (public read)
-- ============================================================

create table if not exists public.actualites (
  id                       uuid primary key default gen_random_uuid(),
  ticker                   text not null,
  title                    text not null,
  excerpt                  text,
  body                     text not null,
  attachment_path          text,
  attachment_name          text,
  attachment_size_bytes    bigint,
  source_url               text,
  published_at             timestamptz,
  author_id                uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint actualites_ticker_not_empty check (length(ticker) > 0),
  constraint actualites_title_not_empty check (length(title) > 0),
  constraint actualites_body_not_empty check (length(body) > 0)
);

create index if not exists actualites_ticker_idx
  on public.actualites (ticker);
create index if not exists actualites_published_idx
  on public.actualites (published_at desc) where published_at is not null;

drop trigger if exists actualites_set_updated_at on public.actualites;
create trigger actualites_set_updated_at
  before update on public.actualites
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table public.actualites enable row level security;

-- SELECT public : tout le monde peut lire les actualites publiees.
-- Les brouillons (published_at IS NULL) restent invisibles.
drop policy if exists "actualites_select_published" on public.actualites;
create policy "actualites_select_published"
  on public.actualites for select
  to anon, authenticated
  using (published_at is not null);

-- SELECT brouillons : admin L2+
drop policy if exists "actualites_select_drafts_admin" on public.actualites;
create policy "actualites_select_drafts_admin"
  on public.actualites for select
  to authenticated
  using (public.is_admin_at_least(2));

-- INSERT / UPDATE / DELETE : admin L2+
drop policy if exists "actualites_insert_admin" on public.actualites;
create policy "actualites_insert_admin"
  on public.actualites for insert
  to authenticated
  with check (public.is_admin_at_least(2));

drop policy if exists "actualites_update_admin" on public.actualites;
create policy "actualites_update_admin"
  on public.actualites for update
  to authenticated
  using (public.is_admin_at_least(2))
  with check (public.is_admin_at_least(2));

drop policy if exists "actualites_delete_admin" on public.actualites;
create policy "actualites_delete_admin"
  on public.actualites for delete
  to authenticated
  using (public.is_admin_at_least(2));

-- ============================================================
-- Bucket Storage : actualites-attachments
-- Public : tout le monde peut télécharger les pièces jointes.
-- Upload/delete : admin L2+
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'actualites-attachments',
  'actualites-attachments',
  true,
  20 * 1024 * 1024, -- 20 MB max
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS sur storage.objects pour ce bucket
drop policy if exists "actualites_storage_read_public" on storage.objects;
create policy "actualites_storage_read_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'actualites-attachments');

drop policy if exists "actualites_storage_insert_admin" on storage.objects;
create policy "actualites_storage_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'actualites-attachments'
    and public.is_admin_at_least(2)
  );

drop policy if exists "actualites_storage_delete_admin" on storage.objects;
create policy "actualites_storage_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'actualites-attachments'
    and public.is_admin_at_least(2)
  );

-- ============================================================
-- RPC admin : list actualités (incluant brouillons, ordre par maj)
-- ============================================================

create or replace function public.admin_list_actualites(
  p_search text default null,
  p_limit  int default 100,
  p_offset int default 0
)
returns setof public.actualites
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
    from public.actualites
    where p_search is null
       or title ilike '%' || p_search || '%'
       or ticker ilike '%' || p_search || '%'
    order by updated_at desc
    limit p_limit
    offset p_offset;
end;
$$;
grant execute on function public.admin_list_actualites(text, int, int) to authenticated;

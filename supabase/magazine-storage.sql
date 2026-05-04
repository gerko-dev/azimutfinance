-- ============================================================
-- AzimutFinance — Storage : illustrations articles magazine
-- A executer dans : Supabase Dashboard > SQL Editor > New query
-- Idempotent.
--
-- Bucket public "magazine-images" :
--   - lecture : tout le monde (anon + authenticated)
--   - ecriture (upload, update, delete) : admin L2+ uniquement
--
-- Les illustrations sont stockees en cle :
--   articles/<slug-article>/<timestamp>-<random>.<ext>
-- ============================================================

-- ============================================================
-- 1) Creation du bucket public (idempotent)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('magazine-images', 'magazine-images', true)
on conflict (id) do update set public = true;

-- ============================================================
-- 2) Policies sur storage.objects
--    NB : storage.objects a deja RLS active par defaut.
-- ============================================================

-- Lecture publique (anon + authenticated)
drop policy if exists "magazine_images_read_public" on storage.objects;
create policy "magazine_images_read_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'magazine-images');

-- Upload : admin L2+
drop policy if exists "magazine_images_insert_admin" on storage.objects;
create policy "magazine_images_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'magazine-images'
    and public.is_admin_at_least(2)
  );

-- Update : admin L2+
drop policy if exists "magazine_images_update_admin" on storage.objects;
create policy "magazine_images_update_admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'magazine-images'
    and public.is_admin_at_least(2)
  )
  with check (
    bucket_id = 'magazine-images'
    and public.is_admin_at_least(2)
  );

-- Delete : admin L2+
drop policy if exists "magazine_images_delete_admin" on storage.objects;
create policy "magazine_images_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'magazine-images'
    and public.is_admin_at_least(2)
  );

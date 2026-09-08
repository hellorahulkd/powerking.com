-- ============================================================================
--  POWERKING NEPAL — IMAGE STORAGE
-- ============================================================================
--  One public bucket for product photos, category images and brand logos.
--
--  Public *read* is deliberate: these images are printed on the catalogue,
--  which is a public website, and a signed URL that expires would break every
--  link a customer has ever been sent on WhatsApp. Public read, authorised
--  write — the same shape as the rest of the site.
--
--  Writing is manager-and-above. Staff record stock; they do not re-photograph
--  the catalogue, and an upload endpoint is the easiest thing in any system to
--  fill with junk.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,   -- 5 MB; a phone photo resized to a 600px tile is far under this
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product images are publicly readable" on storage.objects;
create policy "product images are publicly readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "managers upload product images" on storage.objects;
create policy "managers upload product images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.can_manage());

drop policy if exists "managers replace product images" on storage.objects;
create policy "managers replace product images" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.can_manage())
  with check (bucket_id = 'product-images' and public.can_manage());

-- Deleting an image orphans it from a product that may still be published, so
-- it is an admin action rather than a routine one.
drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

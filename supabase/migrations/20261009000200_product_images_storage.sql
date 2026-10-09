-- RestoPRO - stockage public des images de produits, ecriture reservee aux gestionnaires.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_insert_authorized
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and public.current_user_is_active()
  and public.current_user_role() in ('admin', 'gestionnaire')
);

create policy product_images_delete_authorized
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and public.current_user_is_active()
  and public.current_user_role() in ('admin', 'gestionnaire')
);

-- Supabase Storage exige SELECT en plus de DELETE pour supprimer un objet via l'API.
-- La lecture publique des images reste assuree par le bucket public.

create policy product_images_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'product-images'
  and public.current_user_is_active()
  and public.current_user_role() in ('admin', 'gestionnaire')
);

-- Permet l'amorcage strictement controle du premier super administrateur
-- sur une installation neuve, sans assouplir les installations deja amorcees.
create or replace function public.bootstrap_super_admin() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_caller public.profiles%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('restopro_super_admin_guard'));

  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if exists(select 1 from public.profiles where is_super_admin) then
    raise exception 'Un super administrateur existe deja';
  end if;

  select * into v_caller from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profil introuvable'; end if;

  if (select count(*) from auth.users) <> 1
     or (select count(*) from public.profiles) <> 1
     or v_caller.role <> 'caissier'
     or v_caller.is_active
     or v_caller.is_super_admin then
    raise exception 'Amorcage initial refuse';
  end if;

  update public.profiles
  set role = 'admin', is_active = true, is_super_admin = true
  where id = v_caller.id;

  return public.get_my_profile();
end$$;

revoke all on function public.bootstrap_super_admin() from public, anon;
grant execute on function public.bootstrap_super_admin() to authenticated;

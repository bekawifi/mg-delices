-- RestoPRO - super administration et gestion securisee des utilisateurs.
-- Le niveau super_admin est additif. Le role metier reste admin afin de conserver
-- la compatibilite avec toutes les RPC historiques qui controlent public.app_role.

alter type public.app_role add value if not exists 'super_admin';

alter table public.profiles add column is_super_admin boolean not null default false;
alter table public.profiles add column if not exists last_login_at timestamptz;

alter table public.profiles
  add constraint profiles_super_admin_requires_admin
  check (not is_super_admin or role = 'admin'),
  add constraint profiles_super_admin_uses_compat_role
  check (role::text <> 'super_admin');

create index profiles_super_admin_active_idx
  on public.profiles(is_super_admin, is_active)
  where is_super_admin;

create or replace function public.current_user_is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid() and p.is_active), false)
$$;

create or replace function public.current_user_access_role() returns text
language sql stable security definer set search_path = '' as $$
  select case when p.is_super_admin then 'super_admin' else p.role::text end
  from public.profiles p where p.id = auth.uid() and p.is_active
$$;

revoke all on function public.current_user_is_super_admin() from public, anon;
revoke all on function public.current_user_access_role() from public, anon;
grant execute on function public.current_user_is_super_admin() to authenticated;
grant execute on function public.current_user_access_role() to authenticated;

-- Les profils ne sont plus modifiables directement. Toute modification sensible
-- passe par update_user_profile(), qui verrouille les transitions de privileges.
drop policy if exists profiles_read_self_or_admin on public.profiles;
drop policy if exists profiles_admin_insert on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
revoke insert, update, delete on public.profiles from authenticated;

create policy profiles_read_self_or_management on public.profiles
for select to authenticated
using (public.current_user_is_active() and (id = auth.uid() or public.current_user_role() in ('admin', 'gestionnaire')));

create or replace function public.get_my_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select jsonb_build_object(
    'id', p.id, 'full_name', p.full_name,
    'role', case when p.is_super_admin then 'super_admin' else p.role::text end,
    'is_active', p.is_active, 'created_at', p.created_at, 'updated_at', p.updated_at,
    'last_login_at', p.last_login_at, 'email', u.email
  ) into v_result
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = auth.uid();
  if v_result is null then raise exception 'Profil introuvable'; end if;
  return v_result;
end$$;

create or replace function public.list_user_profiles(
  p_search text default null, p_role text default null, p_active boolean default null,
  p_limit integer default 100, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_caller public.profiles%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  select * into v_caller from public.profiles where id = auth.uid() and is_active;
  if not found or v_caller.role <> 'admin' then raise exception 'Action non autorisee'; end if;
  if nullif(trim(p_role), '') is not null and p_role not in ('super_admin','admin','gestionnaire','caissier','serveur','cuisine') then raise exception 'Role invalide'; end if;
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(x) order by x.full_name, x.email), '[]'::jsonb),
    'limit', v_limit, 'offset', v_offset
  ) into v_result
  from (
    select p.id, p.full_name, u.email,
      case when p.is_super_admin then 'super_admin' else p.role::text end as role,
      p.is_active, p.last_login_at, p.created_at, p.updated_at
    from public.profiles p join auth.users u on u.id = p.id
    where (nullif(trim(p_search), '') is null or p.full_name ilike '%' || trim(p_search) || '%' or coalesce(u.email, '') ilike '%' || trim(p_search) || '%')
      and (p_active is null or p.is_active = p_active)
      and (nullif(trim(p_role), '') is null or case when p.is_super_admin then 'super_admin' else p.role::text end = p_role)
    order by p.full_name, u.email limit v_limit offset v_offset
  ) x;
  return v_result;
end$$;

create or replace function public.get_user_profile(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_caller public.profiles%rowtype; v_result jsonb;
begin
  select * into v_caller from public.profiles where id = auth.uid() and is_active;
  if not found or v_caller.role <> 'admin' then raise exception 'Action non autorisee'; end if;
  if not v_caller.is_super_admin and exists(select 1 from public.profiles where id = p_user_id and (role = 'admin' or is_super_admin)) then raise exception 'Action non autorisee'; end if;
  select jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'email', u.email,
    'role', case when p.is_super_admin then 'super_admin' else p.role::text end,
    'is_active', p.is_active, 'last_login_at', p.last_login_at,
    'created_at', p.created_at, 'updated_at', p.updated_at
  ) into v_result
  from public.profiles p join auth.users u on u.id = p.id where p.id = p_user_id;
  if v_result is null then raise exception 'Utilisateur introuvable'; end if;
  return v_result;
end$$;

create or replace function public.update_user_profile(p_user_id uuid, p_full_name text, p_role text, p_is_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_caller public.profiles%rowtype; v_target public.profiles%rowtype;
  v_db_role public.app_role; v_super boolean; v_result jsonb;
begin
  if p_user_id is null or nullif(trim(p_full_name), '') is null or p_is_active is null then raise exception 'Informations utilisateur invalides'; end if;
  if p_role not in ('super_admin','admin','gestionnaire','caissier','serveur','cuisine') then raise exception 'Role invalide'; end if;
  perform pg_advisory_xact_lock(hashtext('restopro_super_admin_guard'));
  select * into v_caller from public.profiles where id = auth.uid() and is_active;
  if not found or v_caller.role <> 'admin' then raise exception 'Action non autorisee'; end if;
  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Utilisateur introuvable'; end if;
  if not v_caller.is_super_admin and (v_target.role = 'admin' or v_target.is_super_admin or p_role in ('admin','super_admin')) then raise exception 'Action reservee au super administrateur'; end if;
  v_super := p_role = 'super_admin';
  v_db_role := case when p_role in ('super_admin','admin') then 'admin'::public.app_role else p_role::public.app_role end;
  if v_target.is_super_admin and (not p_is_active or not v_super) and not exists(
    select 1 from public.profiles p where p.is_super_admin and p.is_active and p.id <> p_user_id
  ) then raise exception 'Le dernier super administrateur actif doit etre conserve'; end if;
  update public.profiles set full_name = trim(p_full_name), role = v_db_role, is_super_admin = v_super, is_active = p_is_active where id = p_user_id;
  select jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'email', u.email,
    'role', case when p.is_super_admin then 'super_admin' else p.role::text end,
    'is_active', p.is_active, 'last_login_at', p.last_login_at,
    'created_at', p.created_at, 'updated_at', p.updated_at
  ) into v_result from public.profiles p join auth.users u on u.id = p.id where p.id = p_user_id;
  return v_result;
end$$;

-- Amorcage unique : un administrateur actif peut devenir le premier super admin.
create or replace function public.bootstrap_super_admin() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_caller public.profiles%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('restopro_super_admin_guard'));
  select * into v_caller from public.profiles where id = auth.uid() and is_active for update;
  if not found or v_caller.role <> 'admin' then raise exception 'Administrateur actif requis'; end if;
  if exists(select 1 from public.profiles where is_super_admin) then raise exception 'Un super administrateur existe deja'; end if;
  update public.profiles set is_super_admin = true where id = v_caller.id;
  return public.get_my_profile();
end$$;

create or replace function public.get_user_activity(
  p_user_id uuid, p_from date default null, p_to date default null,
  p_domain text default null, p_action text default null,
  p_limit integer default 100, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_caller public.profiles%rowtype; v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200); v_result jsonb;
begin
  select * into v_caller from public.profiles where id = auth.uid() and is_active;
  if not found or v_caller.role <> 'admin' then raise exception 'Action non autorisee'; end if;
  if not v_caller.is_super_admin and exists(select 1 from public.profiles where id = p_user_id and (role = 'admin' or is_super_admin)) then raise exception 'Action non autorisee'; end if;
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb), 'limit', v_limit, 'offset', greatest(coalesce(p_offset, 0), 0)) into v_result
  from (
    select a.id, a.created_at, a.action, a.domaine, a.objet_type, a.objet_id, a.reference_metier, a.donnees_avant, a.donnees_apres, a.contexte
    from public.audit_log a where a.actor_id = p_user_id
      and (p_from is null or a.created_at::date >= p_from)
      and (p_to is null or a.created_at::date <= p_to)
      and (nullif(trim(p_domain), '') is null or a.domaine = trim(p_domain))
      and (nullif(trim(p_action), '') is null or a.action = trim(p_action))
    order by a.created_at desc, a.id desc limit v_limit offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return v_result;
end$$;

revoke all on function public.get_my_profile() from public, anon;
revoke all on function public.list_user_profiles(text,text,boolean,integer,integer) from public, anon;
revoke all on function public.get_user_profile(uuid) from public, anon;
revoke all on function public.update_user_profile(uuid,text,text,boolean) from public, anon;
revoke all on function public.bootstrap_super_admin() from public, anon;
revoke all on function public.get_user_activity(uuid,date,date,text,text,integer,integer) from public, anon;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.list_user_profiles(text,text,boolean,integer,integer) to authenticated;
grant execute on function public.get_user_profile(uuid) to authenticated;
grant execute on function public.update_user_profile(uuid,text,text,boolean) to authenticated;
grant execute on function public.bootstrap_super_admin() to authenticated;
grant execute on function public.get_user_activity(uuid,date,date,text,text,integer,integer) to authenticated;

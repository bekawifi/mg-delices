-- La caisse peut créer un client actif sans lui attribuer de crédit.
-- La modification des clients et des plafonds reste réservée à la gestion.
create or replace function public.save_customer(
  p_id uuid, p_nom text, p_telephone text, p_email text, p_adresse text,
  p_plafond_credit numeric, p_actif boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_customer public.clients%rowtype;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin','gestionnaire','caissier') then
    raise exception 'Action non autorisée';
  end if;
  if v_role = 'caissier' and (
    p_id is not null
    or p_plafond_credit is distinct from 0
    or coalesce(p_actif, true) is not true
    or nullif(trim(p_adresse), '') is not null
  ) then
    raise exception 'Action non autorisée';
  end if;
  if nullif(trim(p_nom),'') is null or p_plafond_credit is null or p_plafond_credit < 0 then
    raise exception 'Client invalide';
  end if;
  if p_id is null then
    insert into public.clients(id, numero, nom, telephone, email, adresse, plafond_credit, actif, created_by)
    values(v_id, 'CLI-' || lpad(nextval('public.customer_number_seq')::text, 6, '0'), trim(p_nom), nullif(trim(p_telephone),''), nullif(lower(trim(p_email)),''), nullif(trim(p_adresse),''), p_plafond_credit, coalesce(p_actif,true), v_user);
  else
    select * into v_customer from public.clients where id = p_id for update;
    if not found then raise exception 'Client introuvable'; end if;
    if p_plafond_credit < v_customer.encours_credit then
      raise exception 'Le plafond de crédit ne peut pas être inférieur à la créance actuelle';
    end if;
    update public.clients set nom=trim(p_nom), telephone=nullif(trim(p_telephone),''), email=nullif(lower(trim(p_email)),''),
      adresse=nullif(trim(p_adresse),''), plafond_credit=p_plafond_credit, actif=coalesce(p_actif,true) where id=p_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Un client utilise déjà ce téléphone ou cet email';
end $$;

revoke all on function public.save_customer(uuid,text,text,text,text,numeric,boolean) from public, anon;
grant execute on function public.save_customer(uuid,text,text,text,text,numeric,boolean) to authenticated;

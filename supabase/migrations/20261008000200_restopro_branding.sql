-- RestoPRO - Etape 10 : identite restaurant et personnalisation de marque.
-- Migration additive uniquement. Les migrations historiques restent immuables.

alter table public.restaurant_settings
  add column email text,
  add column ville text,
  add column pays text,
  add column show_restopro_branding boolean not null default true,
  add column onboarding_completed boolean not null default false;

create or replace function public.update_restaurant_settings(p_settings jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_result jsonb;
begin
  if v_user is null or not exists(select 1 from public.profiles as p where p.id=v_user and p.is_active and p.role='admin')then raise exception 'Action non autorisee';end if;
  update public.restaurant_settings as s set
    nom=coalesce(nullif(trim(p_settings->>'nom'),''),s.nom),telephone=nullif(trim(p_settings->>'telephone'),''),email=nullif(trim(p_settings->>'email'),''),
    adresse=nullif(trim(p_settings->>'adresse'),''),ville=nullif(trim(p_settings->>'ville'),''),pays=nullif(trim(p_settings->>'pays'),''),
    slogan=nullif(trim(p_settings->>'slogan'),''),devise=coalesce(nullif(trim(p_settings->>'devise'),''),s.devise),logo_url=nullif(trim(p_settings->>'logo_url'),''),
    pied_ticket=coalesce(nullif(trim(p_settings->>'pied_ticket'),''),s.pied_ticket),numero_fiscal=nullif(trim(p_settings->>'numero_fiscal'),''),
    largeur_ticket=case when (p_settings->>'largeur_ticket')::integer in(58,80)then(p_settings->>'largeur_ticket')::integer else s.largeur_ticket end,
    show_restopro_branding=coalesce((p_settings->>'show_restopro_branding')::boolean,s.show_restopro_branding),
    onboarding_completed=coalesce((p_settings->>'onboarding_completed')::boolean,s.onboarding_completed),
    updated_at=now(),updated_by=v_user where s.singleton returning to_jsonb(s)into v_result;
  return v_result;
end$$;

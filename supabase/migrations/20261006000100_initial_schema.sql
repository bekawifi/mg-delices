-- MG DELICES - schéma initial, sécurité RLS et fonctions métier atomiques
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'gestionnaire', 'caissier', 'serveur', 'cuisine');
create type public.order_type as enum ('sur_place', 'emporter', 'livraison');
create type public.payment_method as enum ('especes', 'orange_money', 'moov_money', 'autre');
create type public.sale_status as enum ('payee', 'annulee');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'caissier',
  -- Un nouveau compte doit être activé explicitement par un administrateur.
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(trim(nom)) > 0),
  ordre integer not null default 0 check (ordre >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.produits (
  id uuid primary key default gen_random_uuid(),
  categorie_id uuid references public.categories(id) on delete set null,
  nom text not null check (length(trim(nom)) > 0),
  description text,
  prix_vente numeric(12,2) not null check (prix_vente >= 0),
  cout_estime numeric(12,2) not null default 0 check (cout_estime >= 0),
  image_url text,
  disponible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index produits_categorie_idx on public.produits(categorie_id);

create table public.ventes (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  idempotency_key uuid not null unique,
  user_id uuid not null references public.profiles(id),
  type_commande public.order_type not null,
  statut public.sale_status not null default 'payee',
  sous_total numeric(12,2) not null check (sous_total >= 0),
  remise numeric(12,2) not null default 0 check (remise >= 0),
  total_final numeric(12,2) not null check (total_final >= 0),
  montant_recu numeric(12,2) not null check (montant_recu >= 0),
  monnaie_rendue numeric(12,2) not null default 0 check (monnaie_rendue >= 0),
  created_at timestamptz not null default now(),
  check (remise <= sous_total),
  check (total_final = sous_total - remise),
  check (montant_recu >= total_final),
  check (monnaie_rendue = montant_recu - total_final)
);
create index ventes_created_at_idx on public.ventes(created_at desc);
create index ventes_user_idx on public.ventes(user_id);

create table public.lignes_vente (
  id uuid primary key default gen_random_uuid(),
  vente_id uuid not null references public.ventes(id) on delete cascade,
  produit_id uuid references public.produits(id) on delete set null,
  nom_produit text not null check (length(trim(nom_produit)) > 0),
  quantite integer not null check (quantite > 0),
  prix_unitaire numeric(12,2) not null check (prix_unitaire >= 0),
  total_ligne numeric(12,2) generated always as (quantite * prix_unitaire) stored,
  created_at timestamptz not null default now()
);
create index lignes_vente_vente_idx on public.lignes_vente(vente_id);
create index lignes_vente_produit_idx on public.lignes_vente(produit_id);
create unique index lignes_vente_vente_produit_unique_idx on public.lignes_vente(vente_id, produit_id);

create table public.paiements (
  id uuid primary key default gen_random_uuid(),
  vente_id uuid not null references public.ventes(id) on delete cascade,
  mode public.payment_method not null,
  montant numeric(12,2) not null check (montant > 0),
  created_at timestamptz not null default now()
);
create index paiements_vente_idx on public.paiements(vente_id);
create unique index paiements_vente_unique_idx on public.paiements(vente_id);

-- Compteur interne verrouillé pour une numérotation journalière sans collision.
create table public.sale_counters (
  sale_date date primary key,
  last_value integer not null check (last_value > 0)
);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger produits_updated_at before update on public.produits for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Helpers SECURITY DEFINER pour éviter les récursions de policies sur profiles.
create function public.current_user_is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false)
$$;
create function public.current_user_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;
revoke all on function public.current_user_is_active() from public;
revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_is_active() to authenticated;
grant execute on function public.current_user_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.produits enable row level security;
alter table public.ventes enable row level security;
alter table public.lignes_vente enable row level security;
alter table public.paiements enable row level security;
alter table public.sale_counters enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (public.current_user_is_active() and (id = auth.uid() or public.current_user_role() in ('admin', 'gestionnaire')));
create policy profiles_admin_insert on public.profiles for insert to authenticated
with check (public.current_user_role() = 'admin');
create policy profiles_admin_update on public.profiles for update to authenticated
using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create policy categories_read on public.categories for select to authenticated using (public.current_user_is_active());
create policy categories_manage on public.categories for all to authenticated
using (public.current_user_role() in ('admin', 'gestionnaire')) with check (public.current_user_role() in ('admin', 'gestionnaire'));
create policy produits_read on public.produits for select to authenticated using (public.current_user_is_active());
create policy produits_manage on public.produits for all to authenticated
using (public.current_user_role() in ('admin', 'gestionnaire')) with check (public.current_user_role() in ('admin', 'gestionnaire'));

create policy ventes_read on public.ventes for select to authenticated using (public.current_user_is_active());
create policy lignes_read on public.lignes_vente for select to authenticated using (public.current_user_is_active());
create policy paiements_read on public.paiements for select to authenticated using (public.current_user_is_active());
-- Aucune policy directe d'écriture sur ventes/lignes/paiements/compteurs : RPC uniquement.

-- Défense en profondeur : même si une policy est ajoutée par erreur plus tard,
-- les rôles API ne disposent d'aucun privilège d'écriture directe sur les ventes.
revoke all on public.sale_counters from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ventes from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.lignes_vente from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.paiements from public, anon, authenticated;
grant select on public.ventes, public.lignes_vente, public.paiements to authenticated;

-- Les écritures de catalogue restent soumises aux policies admin/gestionnaire.
grant select on public.profiles, public.categories, public.produits to authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.categories, public.produits to authenticated;

create or replace function public.create_sale(
  p_idempotency_key uuid,
  p_type_commande public.order_type,
  p_remise numeric,
  p_montant_recu numeric,
  p_mode_paiement public.payment_method,
  p_lignes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.app_role;
  v_existing public.ventes%rowtype;
  v_sale_id uuid := gen_random_uuid();
  v_subtotal numeric(12,2);
  v_total numeric(12,2);
  v_counter integer;
  v_numero text;
begin
  if v_user_id is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user_id and is_active;
  if v_role is null then raise exception 'Compte inactif ou profil introuvable'; end if;
  if v_role not in ('admin', 'gestionnaire', 'caissier', 'serveur') then raise exception 'Rôle non autorisé à encaisser'; end if;

  if p_idempotency_key is null then raise exception 'Clé d''idempotence requise'; end if;
  select * into v_existing from public.ventes where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id <> v_user_id then raise exception 'Clé d''idempotence déjà utilisée'; end if;
    return jsonb_build_object('sale_id', v_existing.id, 'numero', v_existing.numero, 'total_final', v_existing.total_final, 'montant_recu', v_existing.montant_recu, 'monnaie_rendue', v_existing.monnaie_rendue, 'idempotent_replay', true);
  end if;

  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then raise exception 'Le panier est vide'; end if;
  if jsonb_array_length(p_lignes) > 100 then raise exception 'Le panier contient trop de lignes'; end if;
  if p_remise is null or p_remise < 0 then raise exception 'Remise invalide'; end if;
  if p_montant_recu is null or p_montant_recu < 0 then raise exception 'Montant reçu invalide'; end if;
  if exists (select 1 from jsonb_to_recordset(p_lignes) as x(produit_id uuid, quantite numeric) where produit_id is null or quantite is null or quantite <= 0 or quantite > 1000 or quantite <> trunc(quantite)) then raise exception 'Quantité invalide'; end if;
  if exists (select 1 from jsonb_to_recordset(p_lignes) as x(produit_id uuid, quantite integer) left join public.produits p on p.id = x.produit_id where p.id is null or not p.disponible) then raise exception 'Un produit est introuvable ou indisponible'; end if;

  select coalesce(sum(p.prix_vente * x.quantite), 0) into v_subtotal
  from jsonb_to_recordset(p_lignes) as x(produit_id uuid, quantite integer)
  join public.produits p on p.id = x.produit_id;
  if p_remise > v_subtotal then raise exception 'La remise dépasse le sous-total'; end if;
  v_total := v_subtotal - p_remise;
  if v_total <= 0 then raise exception 'Le total doit être supérieur à zéro'; end if;
  if p_montant_recu < v_total then raise exception 'Montant reçu insuffisant'; end if;

  insert into public.sale_counters(sale_date, last_value) values (current_date, 1)
  on conflict (sale_date) do update set last_value = public.sale_counters.last_value + 1
  returning last_value into v_counter;
  v_numero := 'MG-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_counter::text, 4, '0');

  insert into public.ventes(id, numero, idempotency_key, user_id, type_commande, sous_total, remise, total_final, montant_recu, monnaie_rendue)
  values (v_sale_id, v_numero, p_idempotency_key, v_user_id, p_type_commande, v_subtotal, p_remise, v_total, p_montant_recu, p_montant_recu - v_total);

  insert into public.lignes_vente(vente_id, produit_id, nom_produit, quantite, prix_unitaire)
  select v_sale_id, p.id, p.nom, sum(x.quantite)::integer, p.prix_vente
  from jsonb_to_recordset(p_lignes) as x(produit_id uuid, quantite integer)
  join public.produits p on p.id = x.produit_id
  group by p.id, p.nom, p.prix_vente;
  insert into public.paiements(vente_id, mode, montant) values (v_sale_id, p_mode_paiement, v_total);

  return jsonb_build_object('sale_id', v_sale_id, 'numero', v_numero, 'total_final', v_total, 'montant_recu', p_montant_recu, 'monnaie_rendue', p_montant_recu - v_total, 'idempotent_replay', false);
exception when unique_violation then
  select * into v_existing from public.ventes where idempotency_key = p_idempotency_key;
  if found and v_existing.user_id = v_user_id then
    return jsonb_build_object('sale_id', v_existing.id, 'numero', v_existing.numero, 'total_final', v_existing.total_final, 'montant_recu', v_existing.montant_recu, 'monnaie_rendue', v_existing.monnaie_rendue, 'idempotent_replay', true);
  end if;
  raise;
end;
$$;

create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.current_user_is_active() then raise exception 'Compte inactif'; end if;
  select jsonb_build_object(
    'chiffre_affaires', coalesce((select sum(total_final) from public.ventes where statut = 'payee' and created_at >= current_date and created_at < current_date + interval '1 day'), 0),
    'encaissements', coalesce((select sum(p.montant) from public.paiements p join public.ventes v on v.id = p.vente_id where v.statut = 'payee' and p.created_at >= current_date and p.created_at < current_date + interval '1 day'), 0),
    'nombre_ventes', (select count(*) from public.ventes where statut = 'payee' and created_at >= current_date and created_at < current_date + interval '1 day'),
    'panier_moyen', coalesce((select avg(total_final) from public.ventes where statut = 'payee' and created_at >= current_date and created_at < current_date + interval '1 day'), 0),
    'dernieres_ventes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id, numero, total_final, statut, type_commande, created_at from public.ventes where created_at >= current_date and created_at < current_date + interval '1 day' order by created_at desc limit 8) x), '[]'::jsonb),
    'produits_populaires', coalesce((select jsonb_agg(to_jsonb(x)) from (select lv.nom_produit as nom, sum(lv.quantite)::integer as quantite, sum(lv.total_ligne) as montant from public.lignes_vente lv join public.ventes v on v.id = lv.vente_id where v.statut = 'payee' and v.created_at >= current_date and v.created_at < current_date + interval '1 day' group by lv.nom_produit order by quantite desc, montant desc limit 5) x), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.create_sale(uuid, public.order_type, numeric, numeric, public.payment_method, jsonb) from public;
revoke all on function public.dashboard_stats() from public;
grant execute on function public.create_sale(uuid, public.order_type, numeric, numeric, public.payment_method, jsonb) to authenticated;
grant execute on function public.dashboard_stats() to authenticated;

-- Empêche les rôles exposés par l'API de créer/remplacer des objets dans public.
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant usage on type public.app_role, public.order_type, public.payment_method, public.sale_status to authenticated;

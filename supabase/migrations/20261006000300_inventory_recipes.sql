-- MG DELICES - Étape 3 : stock, recettes et inventaires
-- Migration strictement additive aux étapes 1 et 2 déjà validées.

create type public.stock_movement_type as enum (
  'entree', 'vente', 'ajustement_positif', 'ajustement_negatif', 'perte', 'casse', 'inventaire'
);
create type public.inventory_status as enum ('brouillon', 'valide');

create table public.unites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  nom text not null check (length(trim(nom)) > 0),
  precision_decimale integer not null default 2 check (precision_decimale between 0 and 6),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.matieres_premieres (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  nom text not null check (length(trim(nom)) > 0),
  unite_id uuid not null references public.unites(id) on delete restrict,
  stock_actuel numeric(18,6) not null default 0 check (stock_actuel >= 0),
  stock_minimum numeric(18,6) not null default 0 check (stock_minimum >= 0),
  cout_unitaire_moyen numeric(18,4) not null default 0 check (cout_unitaire_moyen >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matieres_premieres_unite_idx on public.matieres_premieres(unite_id);
create index matieres_premieres_stock_idx on public.matieres_premieres(stock_actuel, stock_minimum) where actif;

create table public.recettes (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits(id) on delete restrict,
  nom text not null check (length(trim(nom)) > 0),
  rendement_quantite numeric(18,6) not null default 1 check (rendement_quantite > 0),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recettes_produit_idx on public.recettes(produit_id);
create unique index recettes_produit_active_unique_idx on public.recettes(produit_id) where actif;

create table public.recette_ingredients (
  id uuid primary key default gen_random_uuid(),
  recette_id uuid not null references public.recettes(id) on delete cascade,
  matiere_premiere_id uuid not null references public.matieres_premieres(id) on delete restrict,
  quantite numeric(18,6) not null check (quantite > 0),
  created_at timestamptz not null default now(),
  unique (recette_id, matiere_premiere_id)
);
create index recette_ingredients_matiere_idx on public.recette_ingredients(matiere_premiere_id);

-- Une date sur la ligne permet de distinguer un snapshot vide (produit sans
-- recette) d'une ligne ancienne qui n'aurait jamais été snapshotée.
alter table public.lignes_commande
  add column recette_snapshotted_at timestamptz;

create table public.commande_ligne_ingredients_snapshot (
  id uuid primary key default gen_random_uuid(),
  ligne_commande_id uuid not null references public.lignes_commande(id) on delete restrict,
  recette_id_snapshot uuid references public.recettes(id) on delete restrict,
  matiere_premiere_id uuid not null references public.matieres_premieres(id) on delete restrict,
  nom_matiere_snapshot text not null check (length(trim(nom_matiere_snapshot)) > 0),
  unite_id uuid not null references public.unites(id) on delete restrict,
  unite_code_snapshot text not null check (length(trim(unite_code_snapshot)) > 0),
  quantite_par_unite numeric(18,6) not null check (quantite_par_unite > 0),
  quantite_totale numeric(18,6) not null check (quantite_totale > 0),
  cout_unitaire_snapshot numeric(18,4) not null check (cout_unitaire_snapshot >= 0),
  created_at timestamptz not null default now(),
  unique (ligne_commande_id, matiere_premiere_id)
);
create index commande_ligne_ingredients_snapshot_ligne_idx
  on public.commande_ligne_ingredients_snapshot(ligne_commande_id);
create index commande_ligne_ingredients_snapshot_matiere_idx
  on public.commande_ligne_ingredients_snapshot(matiere_premiere_id);

create function public.prevent_recipe_snapshot_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Le snapshot matière d''une ligne de commande est immuable';
end;
$$;
create trigger commande_ligne_ingredients_snapshot_immutable
  before update or delete on public.commande_ligne_ingredients_snapshot
  for each row execute function public.prevent_recipe_snapshot_mutation();
revoke all on function public.prevent_recipe_snapshot_mutation() from public, anon, authenticated;

-- Complète la protection Étape 2 : le marqueur peut uniquement passer de NULL
-- à une date lors du premier envoi en cuisine.
create or replace function public.protect_order_line_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.commande_id is distinct from old.commande_id
    or new.produit_id is distinct from old.produit_id
    or new.quantite is distinct from old.quantite
    or new.prix_unitaire_snapshot is distinct from old.prix_unitaire_snapshot
    or new.nom_produit_snapshot is distinct from old.nom_produit_snapshot then
    raise exception 'Le snapshot d''une ligne de commande est immuable';
  end if;
  if old.sent_to_kitchen_at is not null and new.notes is distinct from old.notes then
    raise exception 'Une ligne envoyée en cuisine ne peut plus être modifiée';
  end if;
  if old.recette_snapshotted_at is not null
    and new.recette_snapshotted_at is distinct from old.recette_snapshotted_at then
    raise exception 'Le snapshot matière d''une ligne de commande est immuable';
  end if;
  return new;
end;
$$;

create table public.mouvements_stock (
  id uuid primary key default gen_random_uuid(),
  matiere_premiere_id uuid not null references public.matieres_premieres(id) on delete restrict,
  type_mouvement public.stock_movement_type not null,
  quantite numeric(18,6) not null check (quantite <> 0),
  stock_avant numeric(18,6) not null check (stock_avant >= 0),
  stock_apres numeric(18,6) not null check (stock_apres >= 0),
  cout_unitaire_snapshot numeric(18,4) check (cout_unitaire_snapshot is null or cout_unitaire_snapshot >= 0),
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (stock_apres = stock_avant + quantite),
  check (
    (type_mouvement in ('entree', 'ajustement_positif') and quantite > 0)
    or (type_mouvement in ('vente', 'ajustement_negatif', 'perte', 'casse') and quantite < 0)
    or type_mouvement = 'inventaire'
  )
);
create index mouvements_stock_matiere_date_idx on public.mouvements_stock(matiere_premiere_id, created_at desc);
create index mouvements_stock_type_date_idx on public.mouvements_stock(type_mouvement, created_at desc);
create index mouvements_stock_reference_idx on public.mouvements_stock(reference_type, reference_id);
create unique index mouvements_stock_vente_matiere_unique_idx
  on public.mouvements_stock(reference_id, matiere_premiere_id)
  where reference_type = 'vente' and type_mouvement = 'vente';
create unique index mouvements_stock_inventaire_matiere_unique_idx
  on public.mouvements_stock(reference_id, matiere_premiere_id)
  where reference_type = 'inventaire' and type_mouvement = 'inventaire';

create table public.inventaires (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  statut public.inventory_status not null default 'brouillon',
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  validated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  check ((statut = 'valide' and validated_at is not null and validated_by is not null) or statut = 'brouillon')
);

create table public.inventaire_lignes (
  id uuid primary key default gen_random_uuid(),
  inventaire_id uuid not null references public.inventaires(id) on delete restrict,
  matiere_premiere_id uuid not null references public.matieres_premieres(id) on delete restrict,
  stock_theorique_snapshot numeric(18,6) not null check (stock_theorique_snapshot >= 0),
  quantite_comptee numeric(18,6) check (quantite_comptee is null or quantite_comptee >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventaire_id, matiere_premiere_id)
);
create index inventaire_lignes_inventaire_idx on public.inventaire_lignes(inventaire_id);
create index inventaires_statut_date_idx on public.inventaires(statut, created_at desc);

create function public.quantity_respects_precision(p_quantity numeric, p_precision integer)
returns boolean language sql immutable set search_path = '' as $$
  select p_quantity = round(p_quantity, p_precision)
$$;
revoke all on function public.quantity_respects_precision(numeric, integer) from public, anon, authenticated;

create trigger matieres_premieres_updated_at before update on public.matieres_premieres
  for each row execute function public.set_updated_at();
create trigger recettes_updated_at before update on public.recettes
  for each row execute function public.set_updated_at();
create trigger inventaire_lignes_updated_at before update on public.inventaire_lignes
  for each row execute function public.set_updated_at();

alter table public.unites enable row level security;
alter table public.matieres_premieres enable row level security;
alter table public.recettes enable row level security;
alter table public.recette_ingredients enable row level security;
alter table public.commande_ligne_ingredients_snapshot enable row level security;
alter table public.mouvements_stock enable row level security;
alter table public.inventaires enable row level security;
alter table public.inventaire_lignes enable row level security;

create policy unites_read on public.unites for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire', 'caissier', 'cuisine'));
create policy matieres_read on public.matieres_premieres for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire', 'caissier', 'cuisine'));
create policy recettes_read on public.recettes for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire'));
create policy recette_ingredients_read on public.recette_ingredients for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire'));
create policy commande_ligne_ingredients_snapshot_read on public.commande_ligne_ingredients_snapshot for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire'));
create policy mouvements_read on public.mouvements_stock for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire'));
create policy inventaires_read on public.inventaires for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire'));
create policy inventaire_lignes_read on public.inventaire_lignes for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire'));

grant select on public.unites, public.matieres_premieres, public.recettes, public.recette_ingredients,
  public.commande_ligne_ingredients_snapshot, public.mouvements_stock, public.inventaires,
  public.inventaire_lignes to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.matieres_premieres,
  public.recettes, public.recette_ingredients, public.mouvements_stock, public.inventaires,
  public.inventaire_lignes, public.commande_ligne_ingredients_snapshot from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.unites from public, anon, authenticated;

-- Création/modification des métadonnées d'une matière. Le stock et le coût moyen
-- ne sont jamais acceptés en paramètres.
create function public.save_material(
  p_id uuid, p_code text, p_nom text, p_unite_id uuid,
  p_stock_minimum numeric, p_actif boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_id uuid := coalesce(p_id, gen_random_uuid());
  v_precision integer; v_existing public.matieres_premieres%rowtype;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  if nullif(trim(p_code), '') is null or nullif(trim(p_nom), '') is null then raise exception 'Code et nom obligatoires'; end if;
  if p_stock_minimum is null or p_stock_minimum < 0 then raise exception 'Stock minimum invalide'; end if;
  select precision_decimale into v_precision from public.unites where id = p_unite_id and actif;
  if not found then raise exception 'Unité introuvable ou inactive'; end if;
  if not public.quantity_respects_precision(p_stock_minimum, v_precision) then raise exception 'Précision de quantité invalide pour cette unité'; end if;
  if p_id is null then
    insert into public.matieres_premieres(id, code, nom, unite_id, stock_minimum, actif)
    values (v_id, upper(trim(p_code)), trim(p_nom), p_unite_id, p_stock_minimum, coalesce(p_actif, true));
  else
    select * into v_existing from public.matieres_premieres where id = p_id for update;
    if not found then raise exception 'Matière première introuvable'; end if;
    if v_existing.unite_id <> p_unite_id and (v_existing.stock_actuel <> 0
      or exists (select 1 from public.mouvements_stock where matiere_premiere_id = p_id)
      or exists (select 1 from public.recette_ingredients where matiere_premiere_id = p_id)) then
      raise exception 'L''unité ne peut plus être modifiée après utilisation de la matière';
    end if;
    update public.matieres_premieres set code = upper(trim(p_code)), nom = trim(p_nom), unite_id = p_unite_id,
      stock_minimum = p_stock_minimum, actif = coalesce(p_actif, true) where id = p_id;
  end if;
  return v_id;
end;
$$;

create function public.add_stock_entry(p_matiere_id uuid, p_quantite numeric, p_cout_unitaire numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_m public.matieres_premieres%rowtype; v_after numeric(18,6); v_cost numeric(18,4); v_precision integer;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  if p_quantite is null or p_quantite <= 0 then raise exception 'La quantité doit être positive'; end if;
  if p_cout_unitaire is not null and p_cout_unitaire < 0 then raise exception 'Coût unitaire invalide'; end if;
  select * into v_m from public.matieres_premieres where id = p_matiere_id and actif for update;
  if not found then raise exception 'Matière première introuvable ou inactive'; end if;
  select precision_decimale into v_precision from public.unites where id = v_m.unite_id;
  if not public.quantity_respects_precision(p_quantite, v_precision) then raise exception 'Précision de quantité invalide pour cette unité'; end if;
  v_after := v_m.stock_actuel + p_quantite;
  v_cost := case when p_cout_unitaire is null then v_m.cout_unitaire_moyen
    when v_after = 0 then p_cout_unitaire
    else ((v_m.stock_actuel * v_m.cout_unitaire_moyen) + (p_quantite * p_cout_unitaire)) / v_after end;
  update public.matieres_premieres set stock_actuel = v_after, cout_unitaire_moyen = v_cost where id = p_matiere_id;
  insert into public.mouvements_stock(matiere_premiere_id, type_mouvement, quantite, stock_avant, stock_apres, cout_unitaire_snapshot, reference_type, note, created_by)
  values (p_matiere_id, 'entree', p_quantite, v_m.stock_actuel, v_after, p_cout_unitaire, 'entree_manuelle', nullif(trim(p_note), ''), v_user);
  return jsonb_build_object('matiere_id', p_matiere_id, 'stock_avant', v_m.stock_actuel, 'stock_apres', v_after, 'cout_unitaire_moyen', v_cost);
end;
$$;

create function public.adjust_stock(p_matiere_id uuid, p_type public.stock_movement_type, p_quantite numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_m public.matieres_premieres%rowtype; v_signed numeric(18,6); v_after numeric(18,6); v_precision integer;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  if p_type is null or p_type not in ('ajustement_positif', 'ajustement_negatif', 'perte', 'casse') then raise exception 'Type d''ajustement invalide'; end if;
  if p_quantite is null or p_quantite <= 0 then raise exception 'La quantité doit être positive'; end if;
  if p_type in ('ajustement_negatif', 'perte', 'casse') and nullif(trim(p_note), '') is null then raise exception 'Un motif est obligatoire pour une diminution'; end if;
  select * into v_m from public.matieres_premieres where id = p_matiere_id and actif for update;
  if not found then raise exception 'Matière première introuvable ou inactive'; end if;
  select precision_decimale into v_precision from public.unites where id = v_m.unite_id;
  if not public.quantity_respects_precision(p_quantite, v_precision) then raise exception 'Précision de quantité invalide pour cette unité'; end if;
  v_signed := case when p_type = 'ajustement_positif' then p_quantite else -p_quantite end;
  v_after := v_m.stock_actuel + v_signed;
  if v_after < 0 then raise exception 'Stock insuffisant : %. Disponible : %, nécessaire : %.', v_m.nom, v_m.stock_actuel, p_quantite; end if;
  update public.matieres_premieres set stock_actuel = v_after where id = p_matiere_id;
  insert into public.mouvements_stock(matiere_premiere_id, type_mouvement, quantite, stock_avant, stock_apres, cout_unitaire_snapshot, reference_type, note, created_by)
  values (p_matiere_id, p_type, v_signed, v_m.stock_actuel, v_after, v_m.cout_unitaire_moyen, 'ajustement_manuel', nullif(trim(p_note), ''), v_user);
  return jsonb_build_object('matiere_id', p_matiere_id, 'stock_avant', v_m.stock_actuel, 'stock_apres', v_after);
end;
$$;

create function public.save_recipe(p_produit_id uuid, p_nom text, p_rendement numeric, p_ingredients jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_recipe_id uuid; v_product_name text;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select nom into v_product_name from public.produits where id = p_produit_id;
  if not found then raise exception 'Produit introuvable'; end if;
  if p_rendement is null or p_rendement <= 0 then raise exception 'Rendement invalide'; end if;
  if jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) = 0 then raise exception 'Ajoutez au moins un ingrédient'; end if;
  if exists (select 1 from jsonb_to_recordset(p_ingredients) x(matiere_id uuid, quantite numeric) where matiere_id is null or quantite is null or quantite <= 0) then raise exception 'Ingrédient invalide'; end if;
  if exists (select 1 from jsonb_to_recordset(p_ingredients) x(matiere_id uuid, quantite numeric) left join public.matieres_premieres m on m.id = x.matiere_id where m.id is null or not m.actif) then raise exception 'Une matière est introuvable ou inactive'; end if;
  if exists (select 1 from jsonb_to_recordset(p_ingredients) x(matiere_id uuid, quantite numeric)
    join public.matieres_premieres m on m.id = x.matiere_id join public.unites u on u.id = m.unite_id
    where not public.quantity_respects_precision(x.quantite, u.precision_decimale)) then raise exception 'Précision d''ingrédient invalide pour son unité'; end if;
  if (select count(*) from jsonb_to_recordset(p_ingredients) x(matiere_id uuid, quantite numeric)) <>
     (select count(distinct matiere_id) from jsonb_to_recordset(p_ingredients) x(matiere_id uuid, quantite numeric)) then raise exception 'Ingrédient en double'; end if;
  update public.recettes set actif = false where produit_id = p_produit_id and actif;
  insert into public.recettes(produit_id, nom, rendement_quantite, actif)
  values (p_produit_id, coalesce(nullif(trim(p_nom), ''), v_product_name || ' standard'), p_rendement, true)
  returning id into v_recipe_id;
  insert into public.recette_ingredients(recette_id, matiere_premiere_id, quantite)
  select v_recipe_id, x.matiere_id, x.quantite from jsonb_to_recordset(p_ingredients) x(matiere_id uuid, quantite numeric);
  return v_recipe_id;
end;
$$;

-- Lors de l'application de la migration, les éventuelles lignes déjà envoyées
-- sont figées avec la recette active à cet instant. Les lignes sans recette
-- reçoivent uniquement le marqueur, qui représente explicitement un snapshot vide.
insert into public.commande_ligne_ingredients_snapshot(
  ligne_commande_id, recette_id_snapshot, matiere_premiere_id,
  nom_matiere_snapshot, unite_id, unite_code_snapshot,
  quantite_par_unite, quantite_totale, cout_unitaire_snapshot, created_at
)
select lc.id, r.id, m.id, m.nom, u.id, u.code,
  (ri.quantite / r.rendement_quantite)::numeric(18,6),
  (lc.quantite * ri.quantite / r.rendement_quantite)::numeric(18,6),
  m.cout_unitaire_moyen, coalesce(lc.sent_to_kitchen_at, now())
from public.lignes_commande lc
join public.recettes r on r.produit_id = lc.produit_id and r.actif
join public.recette_ingredients ri on ri.recette_id = r.id
join public.matieres_premieres m on m.id = ri.matiere_premiere_id
join public.unites u on u.id = m.unite_id
where lc.sent_to_kitchen_at is not null
on conflict (ligne_commande_id, matiere_premiere_id) do nothing;

update public.lignes_commande
set recette_snapshotted_at = coalesce(sent_to_kitchen_at, now())
where sent_to_kitchen_at is not null and recette_snapshotted_at is null;

alter table public.lignes_commande
  add constraint lignes_commande_sent_recipe_snapshot_check
  check (sent_to_kitchen_at is null or recette_snapshotted_at is not null);

-- Remplace uniquement la fonction de l'Étape 2, sans modifier sa migration.
-- L'ordre est verrouillé avant de sélectionner les nouvelles lignes, comme dans
-- la version d'origine. Les snapshots et l'envoi sont une seule transaction.
create or replace function public.send_order_to_kitchen(p_commande_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_order public.commandes%rowtype; v_count integer; v_now timestamptz := now();
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'serveur') then raise exception 'Action non autorisée'; end if;
  select * into v_order from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if v_order.statut in ('annulee', 'cloturee') then raise exception 'Commande clôturée'; end if;

  insert into public.commande_ligne_ingredients_snapshot(
    ligne_commande_id, recette_id_snapshot, matiere_premiere_id,
    nom_matiere_snapshot, unite_id, unite_code_snapshot,
    quantite_par_unite, quantite_totale, cout_unitaire_snapshot, created_at
  )
  select lc.id, r.id, m.id, m.nom, u.id, u.code,
    (ri.quantite / r.rendement_quantite)::numeric(18,6),
    (lc.quantite * ri.quantite / r.rendement_quantite)::numeric(18,6),
    m.cout_unitaire_moyen, v_now
  from public.lignes_commande lc
  join public.recettes r on r.produit_id = lc.produit_id and r.actif
  join public.recette_ingredients ri on ri.recette_id = r.id
  join public.matieres_premieres m on m.id = ri.matiere_premiere_id
  join public.unites u on u.id = m.unite_id
  where lc.commande_id = p_commande_id
    and lc.sent_to_kitchen_at is null
    and lc.statut_cuisine = 'a_preparer'
    and lc.recette_snapshotted_at is null
  on conflict (ligne_commande_id, matiere_premiere_id) do nothing;

  update public.lignes_commande
  set recette_snapshotted_at = v_now, sent_to_kitchen_at = v_now
  where commande_id = p_commande_id
    and sent_to_kitchen_at is null
    and statut_cuisine = 'a_preparer'
    and recette_snapshotted_at is null;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Aucun nouvel article à envoyer'; end if;

  update public.commandes set statut = case
    when exists (select 1 from public.lignes_commande where commande_id = p_commande_id and statut_cuisine = 'en_preparation') then 'en_preparation'::public.order_status
    else 'envoyee'::public.order_status end,
    sent_to_kitchen_at = coalesce(sent_to_kitchen_at, v_now)
  where id = p_commande_id;
  insert into public.commande_events(commande_id, event_type, details, actor_id)
  values (p_commande_id, 'envoi_cuisine', jsonb_build_object('nombre_lignes', v_count), v_user);
  return jsonb_build_object('commande_id', p_commande_id, 'lignes_envoyees', v_count);
end;
$$;

-- Moteur commun caisse/restaurant. Les besoins sont agrégés par matière puis
-- verrouillés par UUID croissant, ce qui évite surconsommation et deadlocks.
create function public.consume_stock_for_sale(p_vente_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_need record; v_m public.matieres_premieres%rowtype; v_after numeric(18,6); v_commande_id uuid;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'caissier') then raise exception 'Action non autorisée'; end if;
  select commande_id into v_commande_id from public.ventes where id = p_vente_id and statut = 'payee';
  if not found then raise exception 'Vente payée introuvable'; end if;
  if v_commande_id is not null and exists (
    select 1 from public.lignes_commande
    where commande_id = v_commande_id and statut_cuisine = 'servie' and recette_snapshotted_at is null
  ) then raise exception 'Snapshot matière manquant pour une ligne de commande'; end if;
  for v_need in
    select besoins.matiere_premiere_id, sum(besoins.quantite)::numeric(18,6) as necessaire
    from (
      -- Restaurant : quantités figées à l'envoi cuisine.
      select s.matiere_premiere_id, s.quantite_totale as quantite
      from public.commande_ligne_ingredients_snapshot s
      join public.lignes_commande lc on lc.id = s.ligne_commande_id
      where v_commande_id is not null and lc.commande_id = v_commande_id and lc.statut_cuisine = 'servie'
      union all
      -- Caisse directe : recette active au moment de la vente immédiate.
      select ri.matiere_premiere_id, lv.quantite * ri.quantite / r.rendement_quantite as quantite
      from public.lignes_vente lv
      join public.recettes r on r.produit_id = lv.produit_id and r.actif
      join public.recette_ingredients ri on ri.recette_id = r.id
      where v_commande_id is null and lv.vente_id = p_vente_id
    ) besoins
    group by besoins.matiere_premiere_id
    order by besoins.matiere_premiere_id
  loop
    if exists (select 1 from public.mouvements_stock where reference_type = 'vente' and reference_id = p_vente_id and matiere_premiere_id = v_need.matiere_premiere_id) then
      continue;
    end if;
    select * into v_m from public.matieres_premieres where id = v_need.matiere_premiere_id for update;
    if not found then raise exception 'Matière première de recette introuvable'; end if;
    if v_m.stock_actuel < v_need.necessaire then
      raise exception 'Stock insuffisant : %. Disponible : %, nécessaire : %.', v_m.nom, v_m.stock_actuel, v_need.necessaire;
    end if;
    v_after := v_m.stock_actuel - v_need.necessaire;
    update public.matieres_premieres set stock_actuel = v_after where id = v_m.id;
    insert into public.mouvements_stock(matiere_premiere_id, type_mouvement, quantite, stock_avant, stock_apres, cout_unitaire_snapshot, reference_type, reference_id, note, created_by)
    values (v_m.id, 'vente', -v_need.necessaire, v_m.stock_actuel, v_after, v_m.cout_unitaire_moyen, 'vente', p_vente_id, 'Consommation automatique', v_user);
  end loop;
end;
$$;

create function public.handle_paid_sale_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform public.consume_stock_for_sale(new.vente_id);
  return new;
end;
$$;
create trigger paiements_consume_stock after insert on public.paiements
  for each row execute function public.handle_paid_sale_stock();
revoke all on function public.handle_paid_sale_stock() from public, anon, authenticated;

create function public.create_inventory(p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_id uuid := gen_random_uuid(); v_numero text;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  v_numero := 'INV-' || to_char(current_date, 'YYYYMMDD') || '-' || substr(replace(v_id::text, '-', ''), 1, 6);
  insert into public.inventaires(id, numero, note, created_by) values (v_id, v_numero, nullif(trim(p_note), ''), v_user);
  insert into public.inventaire_lignes(inventaire_id, matiere_premiere_id, stock_theorique_snapshot)
  select v_id, id, stock_actuel from public.matieres_premieres where actif order by id;
  return v_id;
end;
$$;

create function public.set_inventory_count(p_inventaire_id uuid, p_matiere_id uuid, p_quantite_comptee numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_precision integer;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  if p_quantite_comptee is null or p_quantite_comptee < 0 then raise exception 'Quantité comptée invalide'; end if;
  select u.precision_decimale into v_precision from public.matieres_premieres m join public.unites u on u.id = m.unite_id where m.id = p_matiere_id;
  if not found or not public.quantity_respects_precision(p_quantite_comptee, v_precision) then raise exception 'Précision de quantité invalide pour cette unité'; end if;
  if not exists (select 1 from public.inventaires where id = p_inventaire_id and statut = 'brouillon' for update) then raise exception 'Inventaire introuvable ou déjà validé'; end if;
  update public.inventaire_lignes set quantite_comptee = p_quantite_comptee
  where inventaire_id = p_inventaire_id and matiere_premiere_id = p_matiere_id;
  if not found then raise exception 'Ligne d''inventaire introuvable'; end if;
end;
$$;

create function public.validate_inventory(p_inventaire_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_inv public.inventaires%rowtype; v_line record; v_m public.matieres_premieres%rowtype; v_delta numeric(18,6); v_count integer := 0;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select * into v_inv from public.inventaires where id = p_inventaire_id for update;
  if not found then raise exception 'Inventaire introuvable'; end if;
  if v_inv.statut = 'valide' then return jsonb_build_object('inventaire_id', p_inventaire_id, 'deja_valide', true, 'mouvements', 0); end if;
  if exists (select 1 from public.inventaire_lignes where inventaire_id = p_inventaire_id and quantite_comptee is null) then raise exception 'Toutes les quantités doivent être comptées'; end if;
  for v_line in select * from public.inventaire_lignes where inventaire_id = p_inventaire_id order by matiere_premiere_id loop
    select * into v_m from public.matieres_premieres where id = v_line.matiere_premiere_id for update;
    v_delta := v_line.quantite_comptee - v_m.stock_actuel;
    update public.inventaire_lignes set stock_theorique_snapshot = v_m.stock_actuel where id = v_line.id;
    if v_delta <> 0 then
      update public.matieres_premieres set stock_actuel = v_line.quantite_comptee where id = v_m.id;
      insert into public.mouvements_stock(matiere_premiere_id, type_mouvement, quantite, stock_avant, stock_apres, cout_unitaire_snapshot, reference_type, reference_id, note, created_by)
      values (v_m.id, 'inventaire', v_delta, v_m.stock_actuel, v_line.quantite_comptee, v_m.cout_unitaire_moyen, 'inventaire', p_inventaire_id, 'Validation inventaire ' || v_inv.numero, v_user);
      v_count := v_count + 1;
    end if;
  end loop;
  update public.inventaires set statut = 'valide', validated_by = v_user, validated_at = now() where id = p_inventaire_id;
  return jsonb_build_object('inventaire_id', p_inventaire_id, 'deja_valide', false, 'mouvements', v_count);
end;
$$;

create function public.get_stock_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'caissier', 'cuisine') then raise exception 'Action non autorisée'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nom), '[]'::jsonb) into v_result from (
    select m.id, m.code, m.nom, m.unite_id, u.code as unite_code, u.nom as unite_nom, u.precision_decimale,
      m.stock_actuel, m.stock_minimum, m.cout_unitaire_moyen, m.actif,
      m.stock_actuel * m.cout_unitaire_moyen as valeur_stock,
      case when m.stock_actuel <= 0 then 'rupture' when m.stock_actuel <= m.stock_minimum then 'stock_bas' else 'normal' end as statut
    from public.matieres_premieres m join public.unites u on u.id = m.unite_id
  ) x;
  return v_result;
end;
$$;

create function public.get_stock_movements(p_matiere_id uuid default null, p_type public.stock_movement_type default null, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_result from (
    select ms.id, ms.matiere_premiere_id, m.nom as matiere_nom, u.code as unite_code, ms.type_mouvement,
      ms.quantite, ms.stock_avant, ms.stock_apres, ms.cout_unitaire_snapshot, ms.reference_type, ms.reference_id,
      ms.note, p.full_name as created_by_name, ms.created_at
    from public.mouvements_stock ms join public.matieres_premieres m on m.id = ms.matiere_premiere_id
    join public.unites u on u.id = m.unite_id join public.profiles p on p.id = ms.created_by
    where (p_matiere_id is null or ms.matiere_premiere_id = p_matiere_id)
      and (p_type is null or ms.type_mouvement = p_type)
      and (p_from is null or ms.created_at >= p_from) and (p_to is null or ms.created_at < p_to)
    limit 500
  ) x;
  return v_result;
end;
$$;

create function public.get_recipes_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.produit_nom), '[]'::jsonb) into v_result from (
    select p.id as produit_id, p.nom as produit_nom, p.prix_vente, r.id as recette_id, r.nom as recette_nom,
      r.rendement_quantite,
      coalesce((select sum(ri.quantite * m.cout_unitaire_moyen) / r.rendement_quantite
        from public.recette_ingredients ri join public.matieres_premieres m on m.id = ri.matiere_premiere_id where ri.recette_id = r.id), 0) as cout_matieres,
      coalesce((select jsonb_agg(jsonb_build_object('matiere_id', m.id, 'matiere_nom', m.nom, 'quantite', ri.quantite,
        'unite_code', u.code, 'cout_unitaire', m.cout_unitaire_moyen) order by m.nom)
        from public.recette_ingredients ri join public.matieres_premieres m on m.id = ri.matiere_premiere_id
        join public.unites u on u.id = m.unite_id where ri.recette_id = r.id), '[]'::jsonb) as ingredients
    from public.produits p left join public.recettes r on r.produit_id = p.id and r.actif
  ) x;
  return v_result;
end;
$$;

create function public.get_inventory_detail(p_inventaire_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select jsonb_build_object('id', i.id, 'numero', i.numero, 'statut', i.statut, 'note', i.note, 'created_at', i.created_at,
    'lignes', coalesce((select jsonb_agg(jsonb_build_object('id', il.id, 'matiere_id', m.id, 'matiere_nom', m.nom,
      'unite_code', u.code, 'precision_decimale', u.precision_decimale, 'stock_theorique', il.stock_theorique_snapshot,
      'quantite_comptee', il.quantite_comptee, 'ecart', case when il.quantite_comptee is null then null else il.quantite_comptee - il.stock_theorique_snapshot end) order by m.nom)
      from public.inventaire_lignes il join public.matieres_premieres m on m.id = il.matiere_premiere_id
      join public.unites u on u.id = m.unite_id where il.inventaire_id = i.id), '[]'::jsonb))
  into v_result from public.inventaires i where i.id = p_inventaire_id;
  if v_result is null then raise exception 'Inventaire introuvable'; end if;
  return v_result;
end;
$$;

-- Permissions d'exécution minimales.
revoke all on function public.save_material(uuid, text, text, uuid, numeric, boolean) from public, anon;
revoke all on function public.add_stock_entry(uuid, numeric, numeric, text) from public, anon;
revoke all on function public.adjust_stock(uuid, public.stock_movement_type, numeric, text) from public, anon;
revoke all on function public.save_recipe(uuid, text, numeric, jsonb) from public, anon;
revoke all on function public.consume_stock_for_sale(uuid) from public, anon, authenticated;
revoke all on function public.create_inventory(text) from public, anon;
revoke all on function public.set_inventory_count(uuid, uuid, numeric) from public, anon;
revoke all on function public.validate_inventory(uuid) from public, anon;
revoke all on function public.get_stock_overview() from public, anon;
revoke all on function public.get_stock_movements(uuid, public.stock_movement_type, timestamptz, timestamptz) from public, anon;
revoke all on function public.get_recipes_overview() from public, anon;
revoke all on function public.get_inventory_detail(uuid) from public, anon;

grant execute on function public.save_material(uuid, text, text, uuid, numeric, boolean) to authenticated;
grant execute on function public.add_stock_entry(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.adjust_stock(uuid, public.stock_movement_type, numeric, text) to authenticated;
grant execute on function public.save_recipe(uuid, text, numeric, jsonb) to authenticated;
grant execute on function public.create_inventory(text) to authenticated;
grant execute on function public.set_inventory_count(uuid, uuid, numeric) to authenticated;
grant execute on function public.validate_inventory(uuid) to authenticated;
grant execute on function public.get_stock_overview() to authenticated;
grant execute on function public.get_stock_movements(uuid, public.stock_movement_type, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_recipes_overview() to authenticated;
grant execute on function public.get_inventory_detail(uuid) to authenticated;
revoke all on function public.send_order_to_kitchen(uuid) from public, anon;
grant execute on function public.send_order_to_kitchen(uuid) to authenticated;
grant usage on type public.stock_movement_type, public.inventory_status to authenticated;

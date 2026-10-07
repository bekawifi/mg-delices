-- MG DELICES - Étape 2 : tables, commandes et suivi cuisine
-- Migration additive : ne modifie pas l'historique Étape 1/1B.

create type public.order_status as enum (
  'ouverte', 'envoyee', 'en_preparation', 'prete', 'servie', 'annulee', 'cloturee'
);
create type public.kitchen_status as enum (
  'a_preparer', 'en_preparation', 'prete', 'servie', 'annulee'
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(trim(nom)) > 0),
  ordre integer not null default 0 check (ordre >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tables_restaurant (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete restrict,
  nom text not null check (length(trim(nom)) > 0),
  numero integer not null check (numero > 0),
  capacite integer not null check (capacite > 0),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, numero)
);
create index tables_restaurant_zone_idx on public.tables_restaurant(zone_id);

create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  numero_commande text not null unique,
  table_id uuid references public.tables_restaurant(id) on delete restrict,
  type_commande public.order_type not null,
  serveur_id uuid not null references public.profiles(id) on delete restrict,
  statut public.order_status not null default 'ouverte',
  notes text,
  opened_at timestamptz not null default now(),
  sent_to_kitchen_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type_commande = 'sur_place' and table_id is not null) or (type_commande <> 'sur_place' and table_id is null)),
  check ((statut in ('annulee', 'cloturee') and closed_at is not null) or statut not in ('annulee', 'cloturee'))
);
create index commandes_table_idx on public.commandes(table_id);
create index commandes_serveur_idx on public.commandes(serveur_id);
create index commandes_statut_idx on public.commandes(statut);
create index commandes_opened_at_idx on public.commandes(opened_at desc);
create unique index commandes_table_active_unique_idx on public.commandes(table_id)
  where table_id is not null and statut not in ('annulee', 'cloturee');

create table public.lignes_commande (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete restrict,
  produit_id uuid not null references public.produits(id) on delete restrict,
  quantite integer not null check (quantite > 0 and quantite <= 1000),
  prix_unitaire_snapshot numeric(12,2) not null check (prix_unitaire_snapshot >= 0),
  nom_produit_snapshot text not null check (length(trim(nom_produit_snapshot)) > 0),
  notes text,
  statut_cuisine public.kitchen_status not null default 'a_preparer',
  sent_to_kitchen_at timestamptz,
  started_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sent_to_kitchen_at is not null or statut_cuisine in ('a_preparer', 'annulee')),
  check (statut_cuisine <> 'en_preparation' or started_at is not null),
  check (statut_cuisine <> 'prete' or ready_at is not null),
  check (statut_cuisine <> 'servie' or served_at is not null),
  check (statut_cuisine <> 'annulee' or cancelled_at is not null)
);
create index lignes_commande_commande_idx on public.lignes_commande(commande_id);
create index lignes_commande_cuisine_idx on public.lignes_commande(statut_cuisine, sent_to_kitchen_at)
  where sent_to_kitchen_at is not null and statut_cuisine in ('a_preparer', 'en_preparation', 'prete');

create table public.commande_events (
  id bigint generated always as identity primary key,
  commande_id uuid not null references public.commandes(id) on delete restrict,
  ligne_id uuid references public.lignes_commande(id) on delete restrict,
  event_type text not null check (length(trim(event_type)) > 0),
  details jsonb not null default '{}'::jsonb,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index commande_events_commande_idx on public.commande_events(commande_id, created_at);

create table public.order_counters (
  order_date date primary key,
  last_value integer not null check (last_value > 0)
);

alter table public.ventes
  add column commande_id uuid unique references public.commandes(id) on delete restrict;
create index ventes_commande_idx on public.ventes(commande_id) where commande_id is not null;
-- Une même commande peut contenir le même produit à plusieurs prix snapshot
-- (ajouts successifs avant/après un changement de tarif).
drop index if exists public.lignes_vente_vente_produit_unique_idx;

create trigger zones_updated_at before update on public.zones
  for each row execute function public.set_updated_at();
create trigger tables_restaurant_updated_at before update on public.tables_restaurant
  for each row execute function public.set_updated_at();
create trigger commandes_updated_at before update on public.commandes
  for each row execute function public.set_updated_at();
create trigger lignes_commande_updated_at before update on public.lignes_commande
  for each row execute function public.set_updated_at();

create function public.protect_order_line_snapshot() returns trigger
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
  return new;
end;
$$;
create trigger lignes_commande_protect_snapshot before update on public.lignes_commande
  for each row execute function public.protect_order_line_snapshot();
revoke all on function public.protect_order_line_snapshot() from public, anon, authenticated;

create function public.prevent_active_service_deactivation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'tables_restaurant' and old.actif and not new.actif
    and exists (select 1 from public.commandes where table_id = old.id and statut not in ('annulee', 'cloturee')) then
    raise exception 'Impossible de désactiver une table occupée';
  end if;
  if tg_table_name = 'zones' and old.actif and not new.actif
    and exists (
      select 1 from public.commandes c join public.tables_restaurant t on t.id = c.table_id
      where t.zone_id = old.id and c.statut not in ('annulee', 'cloturee')
    ) then raise exception 'Impossible de désactiver une zone occupée'; end if;
  return new;
end;
$$;
create trigger tables_prevent_active_deactivation before update on public.tables_restaurant
  for each row execute function public.prevent_active_service_deactivation();
create trigger zones_prevent_active_deactivation before update on public.zones
  for each row execute function public.prevent_active_service_deactivation();
revoke all on function public.prevent_active_service_deactivation() from public, anon, authenticated;

alter table public.zones enable row level security;
alter table public.tables_restaurant enable row level security;
alter table public.commandes enable row level security;
alter table public.lignes_commande enable row level security;
alter table public.commande_events enable row level security;
alter table public.order_counters enable row level security;

create policy zones_read on public.zones for select to authenticated
  using (public.current_user_is_active());
create policy zones_manage on public.zones for all to authenticated
  using (public.current_user_role() in ('admin', 'gestionnaire'))
  with check (public.current_user_role() in ('admin', 'gestionnaire'));

create policy tables_read on public.tables_restaurant for select to authenticated
  using (public.current_user_is_active());
create policy tables_manage on public.tables_restaurant for all to authenticated
  using (public.current_user_role() in ('admin', 'gestionnaire'))
  with check (public.current_user_role() in ('admin', 'gestionnaire'));

create policy commandes_read_operations on public.commandes for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire', 'caissier', 'serveur'));
create policy commandes_read_cuisine on public.commandes for select to authenticated
  using (
    public.current_user_is_active() and public.current_user_role() = 'cuisine'
    and exists (
      select 1 from public.lignes_commande lc
      where lc.commande_id = commandes.id and lc.sent_to_kitchen_at is not null
    )
  );

create policy lignes_read_operations on public.lignes_commande for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire', 'caissier', 'serveur'));
create policy lignes_read_cuisine on public.lignes_commande for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() = 'cuisine' and sent_to_kitchen_at is not null);

create policy commande_events_read_operations on public.commande_events for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire', 'caissier', 'serveur'));
create policy commande_events_read_cuisine on public.commande_events for select to authenticated
  using (
    public.current_user_is_active() and public.current_user_role() = 'cuisine'
    and exists (select 1 from public.commandes c where c.id = commande_events.commande_id)
  );

grant select on public.zones, public.tables_restaurant, public.commandes, public.lignes_commande, public.commande_events to authenticated;
grant insert, update, delete on public.zones, public.tables_restaurant to authenticated;
revoke all on public.order_counters from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.commandes from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.lignes_commande from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.commande_events from public, anon, authenticated;

-- Ouvre exclusivement une commande sur place. L'index partiel garantit une seule
-- commande active par table, y compris en cas de concurrence.
create function public.open_table_order(p_table_id uuid, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_role public.app_role; v_table public.tables_restaurant%rowtype;
  v_id uuid := gen_random_uuid(); v_counter integer; v_numero text;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'serveur') then raise exception 'Action non autorisée'; end if;
  select * into v_table from public.tables_restaurant where id = p_table_id and actif for update;
  if not found then raise exception 'Table introuvable ou inactive'; end if;
  if not exists (select 1 from public.zones where id = v_table.zone_id and actif) then raise exception 'Zone inactive'; end if;
  if exists (select 1 from public.commandes where table_id = p_table_id and statut not in ('annulee', 'cloturee')) then raise exception 'Table déjà occupée'; end if;
  insert into public.order_counters(order_date, last_value) values (current_date, 1)
  on conflict (order_date) do update set last_value = public.order_counters.last_value + 1
  returning last_value into v_counter;
  v_numero := 'CMD-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_counter::text, 4, '0');
  insert into public.commandes(id, numero_commande, table_id, type_commande, serveur_id, notes)
  values (v_id, v_numero, p_table_id, 'sur_place', v_user, nullif(trim(p_notes), ''));
  insert into public.commande_events(commande_id, event_type, actor_id)
  values (v_id, 'commande_ouverte', v_user);
  return jsonb_build_object('id', v_id, 'numero_commande', v_numero, 'statut', 'ouverte');
exception when unique_violation then
  raise exception 'Table déjà occupée';
end;
$$;

create function public.add_order_items(p_commande_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_order public.commandes%rowtype; v_count integer;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'serveur') then raise exception 'Action non autorisée'; end if;
  select * into v_order from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if v_order.statut in ('annulee', 'cloturee') then raise exception 'Commande clôturée'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Aucun article'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'Trop de lignes'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) x(produit_id uuid, quantite numeric, notes text)
    where produit_id is null or quantite is null or quantite <= 0 or quantite > 1000 or quantite <> trunc(quantite)
  ) then raise exception 'Quantité invalide'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) x(produit_id uuid, quantite integer, notes text)
    left join public.produits p on p.id = x.produit_id
    where p.id is null or not p.disponible
  ) then raise exception 'Un produit est introuvable ou indisponible'; end if;
  insert into public.lignes_commande(
    commande_id, produit_id, quantite, prix_unitaire_snapshot, nom_produit_snapshot, notes
  )
  select p_commande_id, p.id, sum(x.quantite)::integer, p.prix_vente, p.nom, nullif(trim(x.notes), '')
  from jsonb_to_recordset(p_items) x(produit_id uuid, quantite integer, notes text)
  join public.produits p on p.id = x.produit_id
  group by p.id, p.prix_vente, p.nom, nullif(trim(x.notes), '');
  get diagnostics v_count = row_count;
  update public.commandes set statut = 'ouverte', ready_at = null, served_at = null where id = p_commande_id;
  insert into public.commande_events(commande_id, event_type, details, actor_id)
  values (p_commande_id, 'articles_ajoutes', jsonb_build_object('nombre_lignes', v_count), v_user);
  return jsonb_build_object('commande_id', p_commande_id, 'lignes_ajoutees', v_count);
end;
$$;

create function public.send_order_to_kitchen(p_commande_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_order public.commandes%rowtype; v_count integer; v_now timestamptz := now();
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'serveur') then raise exception 'Action non autorisée'; end if;
  select * into v_order from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if v_order.statut in ('annulee', 'cloturee') then raise exception 'Commande clôturée'; end if;
  update public.lignes_commande set sent_to_kitchen_at = v_now
  where commande_id = p_commande_id and sent_to_kitchen_at is null and statut_cuisine = 'a_preparer';
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

create function public.start_kitchen_item(p_ligne_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_line public.lignes_commande%rowtype; v_order_status public.order_status;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'cuisine') then raise exception 'Action non autorisée'; end if;
  select * into v_line from public.lignes_commande where id = p_ligne_id for update;
  if not found then raise exception 'Article introuvable'; end if;
  select statut into v_order_status from public.commandes where id = v_line.commande_id for update;
  if v_order_status in ('annulee', 'cloturee') then raise exception 'Commande clôturée'; end if;
  if v_line.sent_to_kitchen_at is null or v_line.statut_cuisine <> 'a_preparer' then raise exception 'Transition cuisine invalide'; end if;
  update public.lignes_commande set statut_cuisine = 'en_preparation', started_at = now() where id = p_ligne_id;
  update public.commandes set statut = 'en_preparation' where id = v_line.commande_id;
  insert into public.commande_events(commande_id, ligne_id, event_type, actor_id)
  values (v_line.commande_id, p_ligne_id, 'article_en_preparation', v_user);
  return jsonb_build_object('ligne_id', p_ligne_id, 'statut_cuisine', 'en_preparation');
end;
$$;

create function public.mark_kitchen_item_ready(p_ligne_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_line public.lignes_commande%rowtype; v_order_status public.order_status; v_all_ready boolean;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'cuisine') then raise exception 'Action non autorisée'; end if;
  select * into v_line from public.lignes_commande where id = p_ligne_id for update;
  if not found then raise exception 'Article introuvable'; end if;
  select statut into v_order_status from public.commandes where id = v_line.commande_id for update;
  if v_order_status in ('annulee', 'cloturee') then raise exception 'Commande clôturée'; end if;
  if v_line.statut_cuisine <> 'en_preparation' then raise exception 'Transition cuisine invalide'; end if;
  update public.lignes_commande set statut_cuisine = 'prete', ready_at = now() where id = p_ligne_id;
  select not exists (
    select 1 from public.lignes_commande where commande_id = v_line.commande_id
    and statut_cuisine <> 'annulee' and (sent_to_kitchen_at is null or statut_cuisine not in ('prete', 'servie'))
  ) into v_all_ready;
  if v_all_ready then
    update public.commandes set statut = 'prete', ready_at = now() where id = v_line.commande_id;
  end if;
  insert into public.commande_events(commande_id, ligne_id, event_type, actor_id)
  values (v_line.commande_id, p_ligne_id, 'article_pret', v_user);
  return jsonb_build_object('ligne_id', p_ligne_id, 'statut_cuisine', 'prete', 'commande_prete', v_all_ready);
end;
$$;

create function public.mark_item_served(p_ligne_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_line public.lignes_commande%rowtype; v_order_status public.order_status; v_all_served boolean;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'serveur') then raise exception 'Action non autorisée'; end if;
  select * into v_line from public.lignes_commande where id = p_ligne_id for update;
  if not found then raise exception 'Article introuvable'; end if;
  select statut into v_order_status from public.commandes where id = v_line.commande_id for update;
  if v_order_status in ('annulee', 'cloturee') then raise exception 'Commande clôturée'; end if;
  if v_line.statut_cuisine <> 'prete' then raise exception 'Article pas encore prêt'; end if;
  update public.lignes_commande set statut_cuisine = 'servie', served_at = now() where id = p_ligne_id;
  select not exists (
    select 1 from public.lignes_commande where commande_id = v_line.commande_id
    and statut_cuisine not in ('servie', 'annulee')
  ) into v_all_served;
  if v_all_served then update public.commandes set statut = 'servie', served_at = now() where id = v_line.commande_id; end if;
  insert into public.commande_events(commande_id, ligne_id, event_type, actor_id)
  values (v_line.commande_id, p_ligne_id, 'article_servi', v_user);
  return jsonb_build_object('ligne_id', p_ligne_id, 'statut_cuisine', 'servie', 'commande_servie', v_all_served);
end;
$$;

create function public.mark_order_served(p_commande_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_order public.commandes%rowtype; v_count integer;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'serveur') then raise exception 'Action non autorisée'; end if;
  select * into v_order from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if v_order.statut in ('annulee', 'cloturee') then raise exception 'Commande clôturée'; end if;
  if exists (select 1 from public.lignes_commande where commande_id = p_commande_id and statut_cuisine not in ('prete', 'servie', 'annulee')) then
    raise exception 'Tous les articles ne sont pas prêts';
  end if;
  update public.lignes_commande set statut_cuisine = 'servie', served_at = coalesce(served_at, now())
  where commande_id = p_commande_id and statut_cuisine = 'prete';
  get diagnostics v_count = row_count;
  if not exists (select 1 from public.lignes_commande where commande_id = p_commande_id and statut_cuisine <> 'annulee') then raise exception 'Commande vide'; end if;
  update public.commandes set statut = 'servie', served_at = now() where id = p_commande_id;
  insert into public.commande_events(commande_id, event_type, details, actor_id)
  values (p_commande_id, 'commande_servie', jsonb_build_object('lignes', v_count), v_user);
  return jsonb_build_object('commande_id', p_commande_id, 'statut', 'servie');
end;
$$;

create function public.cancel_order_item(p_ligne_id uuid, p_motif text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_line public.lignes_commande%rowtype; v_order_status public.order_status;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'serveur') then raise exception 'Action non autorisée'; end if;
  select * into v_line from public.lignes_commande where id = p_ligne_id for update;
  if not found then raise exception 'Article introuvable'; end if;
  select statut into v_order_status from public.commandes where id = v_line.commande_id for update;
  if v_order_status in ('annulee', 'cloturee') then raise exception 'Commande clôturée'; end if;
  if v_line.statut_cuisine in ('servie', 'annulee') then raise exception 'Article déjà terminé'; end if;
  if v_role = 'serveur' and v_line.statut_cuisine in ('en_preparation', 'prete') then raise exception 'Annulation réservée au gestionnaire'; end if;
  update public.lignes_commande set statut_cuisine = 'annulee', cancelled_at = now() where id = p_ligne_id;
  insert into public.commande_events(commande_id, ligne_id, event_type, details, actor_id)
  values (v_line.commande_id, p_ligne_id, 'article_annule', jsonb_build_object('motif', nullif(trim(p_motif), '')), v_user);
  return jsonb_build_object('ligne_id', p_ligne_id, 'statut_cuisine', 'annulee');
end;
$$;

create function public.cancel_order(p_commande_id uuid, p_motif text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_order public.commandes%rowtype;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'serveur') then raise exception 'Action non autorisée'; end if;
  select * into v_order from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if v_order.statut = 'cloturee' then raise exception 'Commande déjà encaissée'; end if;
  if v_order.statut = 'annulee' then return jsonb_build_object('commande_id', p_commande_id, 'statut', 'annulee'); end if;
  if v_role = 'serveur' and exists (select 1 from public.lignes_commande where commande_id = p_commande_id and statut_cuisine in ('en_preparation', 'prete', 'servie')) then
    raise exception 'Annulation réservée au gestionnaire';
  end if;
  update public.lignes_commande set statut_cuisine = 'annulee', cancelled_at = coalesce(cancelled_at, now())
  where commande_id = p_commande_id and statut_cuisine <> 'annulee';
  update public.commandes set statut = 'annulee', closed_at = now() where id = p_commande_id;
  insert into public.commande_events(commande_id, event_type, details, actor_id)
  values (p_commande_id, 'commande_annulee', jsonb_build_object('motif', nullif(trim(p_motif), '')), v_user);
  return jsonb_build_object('commande_id', p_commande_id, 'statut', 'annulee');
end;
$$;

create function public.checkout_order(
  p_commande_id uuid, p_idempotency_key uuid, p_remise numeric,
  p_montant_recu numeric, p_mode_paiement public.payment_method
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_role public.app_role; v_order public.commandes%rowtype;
  v_existing public.ventes%rowtype; v_sale_id uuid := gen_random_uuid();
  v_subtotal numeric(12,2); v_total numeric(12,2); v_counter integer; v_numero text;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'caissier') then raise exception 'Action non autorisée'; end if;
  if p_idempotency_key is null then raise exception 'Clé d''idempotence requise'; end if;
  select * into v_order from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  select * into v_existing from public.ventes where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.commande_id = p_commande_id and v_order.statut = 'cloturee' then
      return jsonb_build_object('sale_id', v_existing.id, 'numero', v_existing.numero, 'total_final', v_existing.total_final, 'montant_recu', v_existing.montant_recu, 'monnaie_rendue', v_existing.monnaie_rendue, 'idempotent_replay', true, 'commande_id', p_commande_id);
    end if;
    raise exception 'Clé d''idempotence déjà utilisée';
  end if;
  if v_order.statut = 'cloturee' then
    select * into v_existing from public.ventes where commande_id = p_commande_id;
    if found and v_existing.idempotency_key = p_idempotency_key then
      return jsonb_build_object('sale_id', v_existing.id, 'numero', v_existing.numero, 'total_final', v_existing.total_final, 'montant_recu', v_existing.montant_recu, 'monnaie_rendue', v_existing.monnaie_rendue, 'idempotent_replay', true, 'commande_id', p_commande_id);
    end if;
    raise exception 'Commande déjà encaissée';
  end if;
  if v_order.statut <> 'servie' then raise exception 'La commande doit être servie avant encaissement'; end if;
  if p_remise is null or p_remise < 0 then raise exception 'Remise invalide'; end if;
  if p_montant_recu is null or p_montant_recu < 0 then raise exception 'Montant reçu invalide'; end if;
  if p_mode_paiement is null then raise exception 'Mode de paiement invalide'; end if;

  -- Source de vérité restaurant : snapshots créés par add_order_items côté serveur.
  select coalesce(sum(quantite * prix_unitaire_snapshot), 0) into v_subtotal
  from public.lignes_commande
  where commande_id = p_commande_id and statut_cuisine = 'servie';
  if v_subtotal <= 0 then raise exception 'Commande vide'; end if;
  if p_remise > v_subtotal then raise exception 'La remise dépasse le sous-total'; end if;
  v_total := v_subtotal - p_remise;
  if v_total <= 0 then raise exception 'Le total doit être supérieur à zéro'; end if;
  if p_montant_recu < v_total then raise exception 'Montant reçu insuffisant'; end if;

  insert into public.sale_counters(sale_date, last_value) values (current_date, 1)
  on conflict (sale_date) do update set last_value = public.sale_counters.last_value + 1
  returning last_value into v_counter;
  v_numero := 'MG-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_counter::text, 4, '0');

  insert into public.ventes(
    id, numero, idempotency_key, user_id, type_commande, sous_total, remise,
    total_final, montant_recu, monnaie_rendue, commande_id
  ) values (
    v_sale_id, v_numero, p_idempotency_key, v_user, v_order.type_commande, v_subtotal, p_remise,
    v_total, p_montant_recu, p_montant_recu - v_total, p_commande_id
  );

  insert into public.lignes_vente(
    vente_id, produit_id, nom_produit, quantite, prix_unitaire
  )
  select v_sale_id, produit_id, nom_produit_snapshot, sum(quantite)::integer, prix_unitaire_snapshot
  from public.lignes_commande
  where commande_id = p_commande_id and statut_cuisine = 'servie'
  group by produit_id, nom_produit_snapshot, prix_unitaire_snapshot;

  insert into public.paiements(vente_id, mode, montant)
  values (v_sale_id, p_mode_paiement, v_total);

  update public.commandes set statut = 'cloturee', closed_at = now() where id = p_commande_id;
  insert into public.commande_events(commande_id, event_type, details, actor_id)
  values (p_commande_id, 'commande_encaissee', jsonb_build_object('vente_id', v_sale_id), v_user);
  return jsonb_build_object(
    'sale_id', v_sale_id, 'numero', v_numero, 'total_final', v_total,
    'montant_recu', p_montant_recu, 'monnaie_rendue', p_montant_recu - v_total,
    'idempotent_replay', false, 'commande_id', p_commande_id
  );
end;
$$;

-- Lectures métier agrégées : évitent d'exposer des jointures fragiles au frontend.
create function public.get_tables_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'caissier', 'serveur') then raise exception 'Action non autorisée'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.zone_ordre, x.numero), '[]'::jsonb) into v_result from (
    select t.id, t.zone_id, z.nom as zone_nom, z.ordre as zone_ordre, t.nom, t.numero, t.capacite, t.actif,
      c.id as commande_id, c.numero_commande, c.statut as commande_statut, c.opened_at,
      p.full_name as serveur_nom,
      coalesce((select sum(l.quantite * l.prix_unitaire_snapshot) from public.lignes_commande l where l.commande_id = c.id and l.statut_cuisine <> 'annulee'), 0) as montant,
      case
        when c.id is null then 'libre'
        when c.statut = 'servie' then 'a_encaisser'
        when c.statut = 'prete' then 'prete'
        when exists (select 1 from public.lignes_commande l where l.commande_id = c.id and l.sent_to_kitchen_at is not null and l.statut_cuisine in ('a_preparer', 'en_preparation')) then 'attente_cuisine'
        else 'occupee'
      end as etat
    from public.tables_restaurant t
    join public.zones z on z.id = t.zone_id
    left join public.commandes c on c.table_id = t.id and c.statut not in ('annulee', 'cloturee')
    left join public.profiles p on p.id = c.serveur_id
    where z.actif
  ) x;
  return v_result;
end;
$$;

create function public.get_orders_overview(p_filter text default 'ouvertes') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'caissier', 'serveur') then raise exception 'Action non autorisée'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.opened_at desc), '[]'::jsonb) into v_result from (
    select c.id, c.numero_commande, c.type_commande, c.statut, c.opened_at, c.closed_at,
      t.nom as table_nom, t.numero as table_numero, p.full_name as serveur_nom,
      coalesce(sum(l.quantite) filter (where l.statut_cuisine <> 'annulee'), 0)::integer as nombre_articles,
      coalesce(sum(l.quantite * l.prix_unitaire_snapshot) filter (where l.statut_cuisine <> 'annulee'), 0) as total
    from public.commandes c
    left join public.tables_restaurant t on t.id = c.table_id
    join public.profiles p on p.id = c.serveur_id
    left join public.lignes_commande l on l.commande_id = c.id
    where case p_filter
      when 'ouvertes' then c.statut not in ('annulee', 'cloturee')
      when 'cuisine' then c.statut in ('envoyee', 'en_preparation')
      when 'pretes' then c.statut = 'prete'
      when 'servies' then c.statut = 'servie'
      when 'cloturees' then c.statut = 'cloturee'
      when 'annulees' then c.statut = 'annulee'
      else true end
    group by c.id, t.nom, t.numero, p.full_name
    limit 100
  ) x;
  return v_result;
end;
$$;

create function public.get_order_detail(p_commande_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null then raise exception 'Compte inactif'; end if;
  if v_role = 'cuisine' and not exists (select 1 from public.lignes_commande where commande_id = p_commande_id and sent_to_kitchen_at is not null) then raise exception 'Action non autorisée'; end if;
  select jsonb_build_object(
    'id', c.id, 'numero_commande', c.numero_commande, 'type_commande', c.type_commande, 'statut', c.statut,
    'notes', c.notes, 'opened_at', c.opened_at, 'table_nom', t.nom, 'table_numero', t.numero,
    'serveur_nom', p.full_name,
    'total', coalesce((select sum(l.quantite * l.prix_unitaire_snapshot) from public.lignes_commande l where l.commande_id = c.id and l.statut_cuisine <> 'annulee'), 0),
    'lignes', coalesce((select jsonb_agg(to_jsonb(lx) order by lx.created_at) from (
      select l.id, l.produit_id, l.quantite, l.prix_unitaire_snapshot, l.nom_produit_snapshot, l.notes,
        l.statut_cuisine, l.sent_to_kitchen_at, l.created_at
      from public.lignes_commande l where l.commande_id = c.id
      and (v_role <> 'cuisine' or l.sent_to_kitchen_at is not null)
    ) lx), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(ex) order by ex.created_at desc) from (
      select e.event_type, e.details, e.created_at, ap.full_name as actor_name
      from public.commande_events e join public.profiles ap on ap.id = e.actor_id
      where e.commande_id = c.id order by e.created_at desc limit 30
    ) ex), '[]'::jsonb)
  ) into v_result
  from public.commandes c left join public.tables_restaurant t on t.id = c.table_id
  join public.profiles p on p.id = c.serveur_id where c.id = p_commande_id;
  if v_result is null then raise exception 'Commande introuvable'; end if;
  return v_result;
end;
$$;

create function public.get_kitchen_board() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'cuisine') then raise exception 'Action non autorisée'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.premier_envoi), '[]'::jsonb) into v_result from (
    select c.id as commande_id, c.numero_commande, c.type_commande, t.nom as table_nom, t.numero as table_numero,
      min(l.sent_to_kitchen_at) as premier_envoi,
      jsonb_agg(jsonb_build_object('id', l.id, 'nom', l.nom_produit_snapshot, 'quantite', l.quantite,
        'notes', l.notes, 'statut_cuisine', l.statut_cuisine, 'sent_to_kitchen_at', l.sent_to_kitchen_at)
        order by l.sent_to_kitchen_at, l.created_at) as lignes
    from public.commandes c join public.lignes_commande l on l.commande_id = c.id
    left join public.tables_restaurant t on t.id = c.table_id
    where c.statut not in ('annulee', 'cloturee') and l.sent_to_kitchen_at is not null
      and l.statut_cuisine in ('a_preparer', 'en_preparation')
    group by c.id, t.nom, t.numero
  ) x;
  return v_result;
end;
$$;

-- Étape 2 restreint la caisse aux admin/gestionnaire/caissier. La fonction
-- historique reste le moteur atomique interne, mais n'est plus appelable via l'API.
alter function public.create_sale(uuid, public.order_type, numeric, numeric, public.payment_method, jsonb)
  rename to create_sale_step1_internal;
revoke all on function public.create_sale_step1_internal(uuid, public.order_type, numeric, numeric, public.payment_method, jsonb)
  from public, anon, authenticated;

create function public.create_sale(
  p_idempotency_key uuid,
  p_type_commande public.order_type,
  p_remise numeric,
  p_montant_recu numeric,
  p_mode_paiement public.payment_method,
  p_lignes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire', 'caissier') then raise exception 'Action non autorisée'; end if;
  return public.create_sale_step1_internal(
    p_idempotency_key, p_type_commande, p_remise, p_montant_recu, p_mode_paiement, p_lignes
  );
end;
$$;
revoke all on function public.create_sale(uuid, public.order_type, numeric, numeric, public.payment_method, jsonb)
  from public, anon;
grant execute on function public.create_sale(uuid, public.order_type, numeric, numeric, public.payment_method, jsonb)
  to authenticated;

-- Retrait du droit d'exécution implicite, puis attribution minimale.
revoke all on function public.open_table_order(uuid, text) from public, anon;
revoke all on function public.add_order_items(uuid, jsonb) from public, anon;
revoke all on function public.send_order_to_kitchen(uuid) from public, anon;
revoke all on function public.start_kitchen_item(uuid) from public, anon;
revoke all on function public.mark_kitchen_item_ready(uuid) from public, anon;
revoke all on function public.mark_item_served(uuid) from public, anon;
revoke all on function public.mark_order_served(uuid) from public, anon;
revoke all on function public.cancel_order_item(uuid, text) from public, anon;
revoke all on function public.cancel_order(uuid, text) from public, anon;
revoke all on function public.checkout_order(uuid, uuid, numeric, numeric, public.payment_method) from public, anon;
revoke all on function public.get_tables_overview() from public, anon;
revoke all on function public.get_orders_overview(text) from public, anon;
revoke all on function public.get_order_detail(uuid) from public, anon;
revoke all on function public.get_kitchen_board() from public, anon;

grant execute on function public.open_table_order(uuid, text) to authenticated;
grant execute on function public.add_order_items(uuid, jsonb) to authenticated;
grant execute on function public.send_order_to_kitchen(uuid) to authenticated;
grant execute on function public.start_kitchen_item(uuid) to authenticated;
grant execute on function public.mark_kitchen_item_ready(uuid) to authenticated;
grant execute on function public.mark_item_served(uuid) to authenticated;
grant execute on function public.mark_order_served(uuid) to authenticated;
grant execute on function public.cancel_order_item(uuid, text) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.checkout_order(uuid, uuid, numeric, numeric, public.payment_method) to authenticated;
grant execute on function public.get_tables_overview() to authenticated;
grant execute on function public.get_orders_overview(text) to authenticated;
grant execute on function public.get_order_detail(uuid) to authenticated;
grant execute on function public.get_kitchen_board() to authenticated;
grant usage on type public.order_status, public.kitchen_status to authenticated;

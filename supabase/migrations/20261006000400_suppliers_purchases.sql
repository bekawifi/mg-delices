-- MG DELICES - Étape 4 : fournisseurs, achats, réceptions et règlements
-- Migration additive aux étapes 1 à 3 validées.

create type public.purchase_status as enum (
  'brouillon', 'valide', 'receptionne', 'partiellement_paye', 'paye', 'annule'
);
create type public.supplier_payment_method as enum (
  'especes', 'orange_money', 'moov_money', 'virement', 'autre'
);

create table public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  nom text not null check (length(trim(nom)) > 0),
  telephone text not null check (length(trim(telephone)) > 0),
  email text,
  adresse text,
  notes text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is null or length(trim(email)) > 0)
);
create index fournisseurs_nom_idx on public.fournisseurs(nom);
create index fournisseurs_actif_idx on public.fournisseurs(actif);

create table public.purchase_counters (
  purchase_date date primary key,
  last_value integer not null check (last_value > 0)
);

create table public.achats (
  id uuid primary key default gen_random_uuid(),
  numero_achat text not null unique,
  idempotency_key uuid not null unique,
  reception_idempotency_key uuid unique,
  fournisseur_id uuid not null references public.fournisseurs(id) on delete restrict,
  statut public.purchase_status not null default 'brouillon',
  date_achat date not null default current_date,
  date_reception timestamptz,
  total numeric(14,2) not null check (total >= 0),
  montant_paye numeric(14,2) not null default 0 check (montant_paye >= 0),
  reste_a_payer numeric(14,2) not null check (reste_a_payer >= 0),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, fournisseur_id),
  check (montant_paye <= total),
  check (reste_a_payer = total - montant_paye),
  check ((statut in ('receptionne', 'partiellement_paye', 'paye') and date_reception is not null)
    or (statut in ('brouillon', 'valide', 'annule') and date_reception is null)),
  check ((statut = 'paye' and reste_a_payer = 0) or statut <> 'paye'),
  check ((statut = 'partiellement_paye' and montant_paye > 0 and reste_a_payer > 0) or statut <> 'partiellement_paye')
);
create index achats_fournisseur_date_idx on public.achats(fournisseur_id, date_achat desc);
create index achats_statut_date_idx on public.achats(statut, date_achat desc);
create index achats_date_reception_idx on public.achats(date_reception desc) where date_reception is not null;

create table public.lignes_achat (
  id uuid primary key default gen_random_uuid(),
  achat_id uuid not null references public.achats(id) on delete restrict,
  matiere_premiere_id uuid not null references public.matieres_premieres(id) on delete restrict,
  nom_matiere_snapshot text not null check (length(trim(nom_matiere_snapshot)) > 0),
  unite_snapshot text not null check (length(trim(unite_snapshot)) > 0),
  quantite numeric(18,6) not null check (quantite > 0),
  cout_unitaire numeric(18,4) not null check (cout_unitaire >= 0),
  total_ligne numeric(14,2) generated always as (round(quantite * cout_unitaire, 2)) stored,
  created_at timestamptz not null default now(),
  unique (achat_id, matiere_premiere_id)
);
create index lignes_achat_achat_idx on public.lignes_achat(achat_id);
create index lignes_achat_matiere_idx on public.lignes_achat(matiere_premiere_id);

create table public.paiements_fournisseur (
  id uuid primary key default gen_random_uuid(),
  achat_id uuid not null,
  fournisseur_id uuid not null,
  montant numeric(14,2) not null check (montant > 0),
  mode_paiement public.supplier_payment_method not null,
  reference text,
  note text,
  idempotency_key uuid not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (achat_id, fournisseur_id) references public.achats(id, fournisseur_id) on delete restrict
);
create index paiements_fournisseur_achat_date_idx on public.paiements_fournisseur(achat_id, created_at desc);
create index paiements_fournisseur_fournisseur_date_idx on public.paiements_fournisseur(fournisseur_id, created_at desc);

create trigger fournisseurs_updated_at before update on public.fournisseurs
  for each row execute function public.set_updated_at();
create trigger achats_updated_at before update on public.achats
  for each row execute function public.set_updated_at();

create function public.protect_received_purchase() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.date_reception is not null and (
    new.fournisseur_id is distinct from old.fournisseur_id
    or new.date_achat is distinct from old.date_achat
    or new.total is distinct from old.total
    or new.notes is distinct from old.notes
    or new.date_reception is distinct from old.date_reception
    or new.reception_idempotency_key is distinct from old.reception_idempotency_key
  ) then raise exception 'Un achat réceptionné est immuable'; end if;
  if old.statut = 'annule' and new is distinct from old then raise exception 'Un achat annulé est immuable'; end if;
  return new;
end;
$$;
create trigger achats_protect_received before update on public.achats
  for each row execute function public.protect_received_purchase();

create function public.protect_purchase_line() returns trigger
language plpgsql set search_path = '' as $$
declare v_achat_id uuid;
begin
  v_achat_id := case when tg_op = 'DELETE' then old.achat_id else new.achat_id end;
  if exists (select 1 from public.achats where id = v_achat_id and (date_reception is not null or statut = 'annule')) then
    raise exception 'Les lignes d''un achat réceptionné ou annulé sont immuables';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger lignes_achat_protect before insert or update or delete on public.lignes_achat
  for each row execute function public.protect_purchase_line();

create function public.protect_supplier_payment() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Un règlement fournisseur est immuable';
end;
$$;
create trigger paiements_fournisseur_immutable before update or delete on public.paiements_fournisseur
  for each row execute function public.protect_supplier_payment();

revoke all on function public.protect_received_purchase() from public, anon, authenticated;
revoke all on function public.protect_purchase_line() from public, anon, authenticated;
revoke all on function public.protect_supplier_payment() from public, anon, authenticated;

alter table public.fournisseurs enable row level security;
alter table public.purchase_counters enable row level security;
alter table public.achats enable row level security;
alter table public.lignes_achat enable row level security;
alter table public.paiements_fournisseur enable row level security;

create policy fournisseurs_read on public.fournisseurs for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire'));
create policy achats_read on public.achats for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire'));
create policy lignes_achat_read on public.lignes_achat for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire'));
create policy paiements_fournisseur_read on public.paiements_fournisseur for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin', 'gestionnaire'));

grant select on public.fournisseurs, public.achats, public.lignes_achat, public.paiements_fournisseur to authenticated;
revoke all on public.purchase_counters from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.fournisseurs, public.achats,
  public.lignes_achat, public.paiements_fournisseur from public, anon, authenticated;

create function public.save_supplier(
  p_id uuid, p_code text, p_nom text, p_telephone text, p_email text default null,
  p_adresse text default null, p_notes text default null, p_actif boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  if nullif(trim(p_code), '') is null or nullif(trim(p_nom), '') is null or nullif(trim(p_telephone), '') is null then
    raise exception 'Code, nom et téléphone obligatoires';
  end if;
  if p_id is null then
    insert into public.fournisseurs(id, code, nom, telephone, email, adresse, notes, actif)
    values (v_id, upper(trim(p_code)), trim(p_nom), trim(p_telephone), nullif(trim(p_email), ''),
      nullif(trim(p_adresse), ''), nullif(trim(p_notes), ''), coalesce(p_actif, true));
  else
    if not exists (select 1 from public.fournisseurs where id = p_id for update) then raise exception 'Fournisseur introuvable'; end if;
    update public.fournisseurs set code = upper(trim(p_code)), nom = trim(p_nom), telephone = trim(p_telephone),
      email = nullif(trim(p_email), ''), adresse = nullif(trim(p_adresse), ''), notes = nullif(trim(p_notes), ''),
      actif = coalesce(p_actif, true) where id = p_id;
  end if;
  return v_id;
end;
$$;

create function public.create_purchase(
  p_idempotency_key uuid, p_fournisseur_id uuid, p_date_achat date,
  p_notes text, p_lignes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_existing public.achats%rowtype;
  v_id uuid := gen_random_uuid(); v_counter integer; v_numero text; v_total numeric(14,2);
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  if p_idempotency_key is null then raise exception 'Clé d''idempotence requise'; end if;
  select * into v_existing from public.achats where idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('achat_id', v_existing.id, 'numero', v_existing.numero_achat, 'total', v_existing.total, 'idempotent_replay', true); end if;
  perform 1 from public.fournisseurs where id = p_fournisseur_id and actif for share;
  if not found then raise exception 'Fournisseur inactif ou introuvable'; end if;
  if p_date_achat is null then raise exception 'Date d''achat requise'; end if;
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then raise exception 'Ajoutez au moins une ligne d''achat'; end if;
  if exists (select 1 from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric)
    where matiere_id is null or quantite is null or quantite <= 0 or cout_unitaire is null or cout_unitaire < 0) then raise exception 'Ligne d''achat invalide'; end if;
  if (select count(*) from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric)) <>
     (select count(distinct matiere_id) from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric)) then
    raise exception 'Cette matière première est déjà présente dans l''achat.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric)
    left join public.matieres_premieres m on m.id = x.matiere_id left join public.unites u on u.id = m.unite_id
    where m.id is null or not m.actif or not public.quantity_respects_precision(x.quantite, u.precision_decimale)) then
    raise exception 'Matière première inactive, introuvable ou quantité imprécise';
  end if;
  select sum(round(x.quantite * x.cout_unitaire, 2)) into v_total
  from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric);
  if v_total <= 0 then raise exception 'Le total de l''achat doit être supérieur à zéro'; end if;
  insert into public.purchase_counters(purchase_date, last_value) values (p_date_achat, 1)
  on conflict (purchase_date) do update set last_value = public.purchase_counters.last_value + 1 returning last_value into v_counter;
  v_numero := 'ACH-' || to_char(p_date_achat, 'YYYYMMDD') || '-' || lpad(v_counter::text, 4, '0');
  insert into public.achats(id, numero_achat, idempotency_key, fournisseur_id, date_achat, total, reste_a_payer, notes, created_by)
  values (v_id, v_numero, p_idempotency_key, p_fournisseur_id, p_date_achat, v_total, v_total, nullif(trim(p_notes), ''), v_user);
  insert into public.lignes_achat(achat_id, matiere_premiere_id, nom_matiere_snapshot, unite_snapshot, quantite, cout_unitaire)
  select v_id, m.id, m.nom, u.code, x.quantite, x.cout_unitaire
  from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric)
  join public.matieres_premieres m on m.id = x.matiere_id join public.unites u on u.id = m.unite_id;
  return jsonb_build_object('achat_id', v_id, 'numero', v_numero, 'total', v_total, 'idempotent_replay', false);
exception when unique_violation then
  select * into v_existing from public.achats where idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('achat_id', v_existing.id, 'numero', v_existing.numero_achat, 'total', v_existing.total, 'idempotent_replay', true); end if;
  raise;
end;
$$;

create function public.update_purchase_draft(
  p_achat_id uuid, p_fournisseur_id uuid, p_date_achat date, p_notes text, p_lignes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_achat public.achats%rowtype; v_total numeric(14,2);
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select * into v_achat from public.achats where id = p_achat_id for update;
  if not found then raise exception 'Achat introuvable'; end if;
  if v_achat.statut not in ('brouillon', 'valide') then raise exception 'Seul un achat brouillon peut être modifié'; end if;
  perform 1 from public.fournisseurs where id = p_fournisseur_id and actif for share;
  if not found then raise exception 'Fournisseur inactif ou introuvable'; end if;
  if p_date_achat is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then raise exception 'Données d''achat invalides'; end if;
  if exists (select 1 from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric)
    left join public.matieres_premieres m on m.id = x.matiere_id left join public.unites u on u.id = m.unite_id
    where m.id is null or not m.actif or x.quantite is null or x.quantite <= 0 or x.cout_unitaire is null or x.cout_unitaire < 0
      or not public.quantity_respects_precision(x.quantite, u.precision_decimale)) then raise exception 'Ligne d''achat invalide'; end if;
  if (select count(*) from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric)) <>
     (select count(distinct matiere_id) from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric)) then
    raise exception 'Cette matière première est déjà présente dans l''achat.';
  end if;
  select sum(round(x.quantite * x.cout_unitaire, 2)) into v_total from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric);
  if v_total <= 0 then raise exception 'Le total de l''achat doit être supérieur à zéro'; end if;
  delete from public.lignes_achat where achat_id = p_achat_id;
  insert into public.lignes_achat(achat_id, matiere_premiere_id, nom_matiere_snapshot, unite_snapshot, quantite, cout_unitaire)
  select p_achat_id, m.id, m.nom, u.code, x.quantite, x.cout_unitaire
  from jsonb_to_recordset(p_lignes) x(matiere_id uuid, quantite numeric, cout_unitaire numeric)
  join public.matieres_premieres m on m.id = x.matiere_id join public.unites u on u.id = m.unite_id;
  update public.achats set fournisseur_id = p_fournisseur_id, date_achat = p_date_achat, notes = nullif(trim(p_notes), ''),
    total = v_total, montant_paye = 0, reste_a_payer = v_total where id = p_achat_id;
  return jsonb_build_object('achat_id', p_achat_id, 'total', v_total);
end;
$$;

create function public.receive_purchase(
  p_achat_id uuid, p_idempotency_key uuid, p_montant_paye numeric default 0,
  p_mode_paiement public.supplier_payment_method default null,
  p_payment_idempotency_key uuid default null, p_reference text default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_achat public.achats%rowtype; v_line record;
  v_m public.matieres_premieres%rowtype; v_after numeric(18,6); v_cost numeric(18,4); v_payment_id uuid;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  if p_idempotency_key is null then raise exception 'Clé d''idempotence requise'; end if;
  select * into v_achat from public.achats where id = p_achat_id for update;
  if not found then raise exception 'Achat introuvable'; end if;
  if v_achat.date_reception is not null then
    return jsonb_build_object('achat_id', v_achat.id, 'numero', v_achat.numero_achat, 'total', v_achat.total,
      'montant_paye', v_achat.montant_paye, 'reste_a_payer', v_achat.reste_a_payer, 'idempotent_replay', true);
  end if;
  if v_achat.statut = 'annule' then raise exception 'Achat annulé'; end if;
  if p_montant_paye is null or p_montant_paye < 0 or p_montant_paye > v_achat.total then raise exception 'Montant supérieur au reste dû'; end if;
  if p_montant_paye > 0 and (p_mode_paiement is null or p_payment_idempotency_key is null) then raise exception 'Paiement initial incomplet'; end if;
  if not exists (select 1 from public.lignes_achat where achat_id = p_achat_id) then raise exception 'Achat sans ligne'; end if;
  for v_line in select * from public.lignes_achat where achat_id = p_achat_id order by matiere_premiere_id loop
    select * into v_m from public.matieres_premieres where id = v_line.matiere_premiere_id and actif for update;
    if not found then raise exception 'Matière première inactive ou introuvable : %', v_line.nom_matiere_snapshot; end if;
    v_after := v_m.stock_actuel + v_line.quantite;
    v_cost := ((v_m.stock_actuel * v_m.cout_unitaire_moyen) + (v_line.quantite * v_line.cout_unitaire)) / v_after;
    update public.matieres_premieres set stock_actuel = v_after, cout_unitaire_moyen = v_cost where id = v_m.id;
    insert into public.mouvements_stock(matiere_premiere_id, type_mouvement, quantite, stock_avant, stock_apres,
      cout_unitaire_snapshot, reference_type, reference_id, note, created_by)
    values (v_m.id, 'entree', v_line.quantite, v_m.stock_actuel, v_after, v_line.cout_unitaire,
      'achat', p_achat_id, 'Réception ' || v_achat.numero_achat, v_user);
  end loop;
  update public.achats set date_reception = now(), reception_idempotency_key = p_idempotency_key,
    statut = case when p_montant_paye = v_achat.total then 'paye'::public.purchase_status
      when p_montant_paye > 0 then 'partiellement_paye'::public.purchase_status else 'receptionne'::public.purchase_status end,
    montant_paye = p_montant_paye, reste_a_payer = v_achat.total - p_montant_paye where id = p_achat_id;
  if p_montant_paye > 0 then
    insert into public.paiements_fournisseur(achat_id, fournisseur_id, montant, mode_paiement, reference, note, idempotency_key, created_by)
    values (p_achat_id, v_achat.fournisseur_id, p_montant_paye, p_mode_paiement, nullif(trim(p_reference), ''),
      nullif(trim(p_note), ''), p_payment_idempotency_key, v_user) returning id into v_payment_id;
  end if;
  return jsonb_build_object('achat_id', v_achat.id, 'numero', v_achat.numero_achat, 'total', v_achat.total,
    'montant_paye', p_montant_paye, 'reste_a_payer', v_achat.total - p_montant_paye,
    'payment_id', v_payment_id, 'idempotent_replay', false);
exception when unique_violation then
  if exists (select 1 from public.achats where id = p_achat_id and date_reception is not null) then
    select * into v_achat from public.achats where id = p_achat_id;
    return jsonb_build_object('achat_id', v_achat.id, 'numero', v_achat.numero_achat, 'total', v_achat.total,
      'montant_paye', v_achat.montant_paye, 'reste_a_payer', v_achat.reste_a_payer, 'idempotent_replay', true);
  end if;
  raise;
end;
$$;

create unique index mouvements_stock_achat_matiere_unique_idx
  on public.mouvements_stock(reference_id, matiere_premiere_id)
  where reference_type = 'achat' and type_mouvement = 'entree';

create function public.add_supplier_payment(
  p_achat_id uuid, p_montant numeric, p_mode_paiement public.supplier_payment_method,
  p_idempotency_key uuid, p_reference text default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_achat public.achats%rowtype; v_existing public.paiements_fournisseur%rowtype;
  v_paid numeric(14,2); v_remaining numeric(14,2); v_id uuid;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  if p_idempotency_key is null then raise exception 'Clé d''idempotence requise'; end if;
  if p_montant is null or p_montant <= 0 or p_mode_paiement is null then raise exception 'Paiement invalide'; end if;
  select * into v_achat from public.achats where id = p_achat_id for update;
  if not found then raise exception 'Achat introuvable'; end if;
  select * into v_existing from public.paiements_fournisseur where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.achat_id <> p_achat_id then raise exception 'Clé d''idempotence déjà utilisée'; end if;
    return jsonb_build_object('payment_id', v_existing.id, 'achat_id', p_achat_id, 'montant_paye', v_achat.montant_paye,
      'reste_a_payer', v_achat.reste_a_payer, 'idempotent_replay', true);
  end if;
  if v_achat.date_reception is null then raise exception 'L''achat doit être réceptionné avant paiement'; end if;
  if v_achat.statut = 'annule' then raise exception 'Achat annulé'; end if;
  select coalesce(sum(montant), 0) into v_paid from public.paiements_fournisseur where achat_id = p_achat_id;
  v_remaining := v_achat.total - v_paid;
  if v_remaining <= 0 then raise exception 'Achat déjà soldé'; end if;
  if p_montant > v_remaining then raise exception 'Montant supérieur au reste dû'; end if;
  insert into public.paiements_fournisseur(achat_id, fournisseur_id, montant, mode_paiement, reference, note, idempotency_key, created_by)
  values (p_achat_id, v_achat.fournisseur_id, p_montant, p_mode_paiement, nullif(trim(p_reference), ''),
    nullif(trim(p_note), ''), p_idempotency_key, v_user) returning id into v_id;
  v_paid := v_paid + p_montant; v_remaining := v_achat.total - v_paid;
  update public.achats set montant_paye = v_paid, reste_a_payer = v_remaining,
    statut = case when v_remaining = 0 then 'paye'::public.purchase_status else 'partiellement_paye'::public.purchase_status end
  where id = p_achat_id;
  return jsonb_build_object('payment_id', v_id, 'achat_id', p_achat_id, 'montant_paye', v_paid,
    'reste_a_payer', v_remaining, 'idempotent_replay', false);
exception when unique_violation then
  select * into v_existing from public.paiements_fournisseur where idempotency_key = p_idempotency_key;
  if found and v_existing.achat_id = p_achat_id then
    select * into v_achat from public.achats where id = p_achat_id;
    return jsonb_build_object('payment_id', v_existing.id, 'achat_id', p_achat_id, 'montant_paye', v_achat.montant_paye,
      'reste_a_payer', v_achat.reste_a_payer, 'idempotent_replay', true);
  end if;
  raise;
end;
$$;

create function public.cancel_purchase(p_achat_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_achat public.achats%rowtype;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select * into v_achat from public.achats where id = p_achat_id for update;
  if not found then raise exception 'Achat introuvable'; end if;
  if v_achat.statut = 'annule' then return jsonb_build_object('achat_id', p_achat_id, 'idempotent_replay', true); end if;
  if v_achat.date_reception is not null then raise exception 'Un achat déjà réceptionné ne peut pas être annulé directement.'; end if;
  update public.achats set statut = 'annule' where id = p_achat_id;
  return jsonb_build_object('achat_id', p_achat_id, 'idempotent_replay', false);
end;
$$;

create function public.get_suppliers_balances() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nom), '[]'::jsonb) into v_result from (
    select f.id, f.code, f.nom, f.telephone, f.email, f.adresse, f.notes, f.actif,
      coalesce(sum(a.total) filter (where a.date_reception is not null and a.statut <> 'annule'), 0) as total_achats,
      coalesce(sum(pay.total_paye) filter (where a.date_reception is not null and a.statut <> 'annule'), 0) as total_paye,
      coalesce(sum(a.total - pay.total_paye) filter (where a.date_reception is not null and a.statut <> 'annule'), 0) as reste_du,
      count(a.id) filter (where a.date_reception is not null and a.total - pay.total_paye > 0 and a.statut <> 'annule') as achats_non_soldes,
      max(a.date_achat) filter (where a.date_reception is not null and a.statut <> 'annule') as dernier_achat
    from public.fournisseurs f left join public.achats a on a.fournisseur_id = f.id
    left join lateral (select coalesce(sum(p.montant), 0) as total_paye from public.paiements_fournisseur p where p.achat_id = a.id) pay on true
    group by f.id
  ) x;
  return v_result;
end;
$$;

create function public.get_purchases_overview(
  p_statut text default null, p_fournisseur_id uuid default null, p_from date default null, p_to date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.date_achat desc, x.created_at desc), '[]'::jsonb) into v_result from (
    select a.id, a.numero_achat, a.fournisseur_id, f.nom as fournisseur_nom, a.statut, a.date_achat,
      a.date_reception, a.total, a.montant_paye, a.reste_a_payer, a.notes, a.created_at
    from public.achats a join public.fournisseurs f on f.id = a.fournisseur_id
    where (p_statut is null or p_statut = 'tous' or
      (p_statut = 'receptionnes' and a.date_reception is not null) or
      (p_statut = 'non_soldes' and a.date_reception is not null and a.reste_a_payer > 0) or
      (p_statut = 'soldes' and a.statut = 'paye') or a.statut::text = p_statut)
      and (p_fournisseur_id is null or a.fournisseur_id = p_fournisseur_id)
      and (p_from is null or a.date_achat >= p_from) and (p_to is null or a.date_achat <= p_to)
    limit 500
  ) x;
  return v_result;
end;
$$;

create function public.get_purchase_detail(p_achat_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select jsonb_build_object('id', a.id, 'numero_achat', a.numero_achat, 'fournisseur_id', f.id, 'fournisseur_nom', f.nom,
    'statut', a.statut, 'date_achat', a.date_achat, 'date_reception', a.date_reception, 'total', a.total,
    'montant_paye', a.montant_paye, 'reste_a_payer', a.reste_a_payer, 'notes', a.notes,
    'lignes', coalesce((select jsonb_agg(to_jsonb(l) order by l.nom_matiere_snapshot) from public.lignes_achat l where l.achat_id = a.id), '[]'::jsonb),
    'paiements', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'montant', p.montant, 'mode_paiement', p.mode_paiement,
      'reference', p.reference, 'note', p.note, 'created_at', p.created_at, 'created_by_name', pr.full_name) order by p.created_at desc)
      from public.paiements_fournisseur p join public.profiles pr on pr.id = p.created_by where p.achat_id = a.id), '[]'::jsonb),
    'mouvements', coalesce((select jsonb_agg(jsonb_build_object('id', ms.id, 'matiere_nom', m.nom, 'quantite', ms.quantite,
      'stock_avant', ms.stock_avant, 'stock_apres', ms.stock_apres, 'created_at', ms.created_at) order by ms.created_at)
      from public.mouvements_stock ms join public.matieres_premieres m on m.id = ms.matiere_premiere_id
      where ms.reference_type = 'achat' and ms.reference_id = a.id), '[]'::jsonb))
  into v_result from public.achats a join public.fournisseurs f on f.id = a.fournisseur_id where a.id = p_achat_id;
  if v_result is null then raise exception 'Achat introuvable'; end if;
  return v_result;
end;
$$;

create function public.get_supplier_history(p_fournisseur_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  if not exists (select 1 from public.fournisseurs where id = p_fournisseur_id) then raise exception 'Fournisseur introuvable'; end if;
  select jsonb_build_object(
    'achats', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'numero_achat', a.numero_achat, 'date_achat', a.date_achat,
      'total', a.total, 'montant_paye', a.montant_paye, 'reste_a_payer', a.reste_a_payer, 'statut', a.statut) order by a.date_achat desc)
      from public.achats a where a.fournisseur_id = p_fournisseur_id), '[]'::jsonb),
    'paiements', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'achat_id', p.achat_id, 'numero_achat', a.numero_achat,
      'montant', p.montant, 'mode_paiement', p.mode_paiement, 'reference', p.reference, 'created_at', p.created_at) order by p.created_at desc)
      from public.paiements_fournisseur p join public.achats a on a.id = p.achat_id where p.fournisseur_id = p_fournisseur_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create function public.dashboard_supplier_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisée'; end if;
  select jsonb_build_object(
    'dette_fournisseurs', coalesce((select sum(a.total - coalesce((select sum(p.montant) from public.paiements_fournisseur p where p.achat_id = a.id), 0))
      from public.achats a where a.date_reception is not null and a.statut <> 'annule'), 0),
    'achats_du_jour', coalesce((select sum(total) from public.achats where date_reception::date = current_date and statut <> 'annule'), 0),
    'paiements_du_jour', coalesce((select sum(montant) from public.paiements_fournisseur where created_at >= current_date and created_at < current_date + 1), 0),
    'achats_non_soldes', (select count(*) from public.achats where date_reception is not null and reste_a_payer > 0 and statut <> 'annule')
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.save_supplier(uuid, text, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.create_purchase(uuid, uuid, date, text, jsonb) from public, anon;
revoke all on function public.update_purchase_draft(uuid, uuid, date, text, jsonb) from public, anon;
revoke all on function public.receive_purchase(uuid, uuid, numeric, public.supplier_payment_method, uuid, text, text) from public, anon;
revoke all on function public.add_supplier_payment(uuid, numeric, public.supplier_payment_method, uuid, text, text) from public, anon;
revoke all on function public.cancel_purchase(uuid) from public, anon;
revoke all on function public.get_suppliers_balances() from public, anon;
revoke all on function public.get_purchases_overview(text, uuid, date, date) from public, anon;
revoke all on function public.get_purchase_detail(uuid) from public, anon;
revoke all on function public.get_supplier_history(uuid) from public, anon;
revoke all on function public.dashboard_supplier_stats() from public, anon;

grant execute on function public.save_supplier(uuid, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.create_purchase(uuid, uuid, date, text, jsonb) to authenticated;
grant execute on function public.update_purchase_draft(uuid, uuid, date, text, jsonb) to authenticated;
grant execute on function public.receive_purchase(uuid, uuid, numeric, public.supplier_payment_method, uuid, text, text) to authenticated;
grant execute on function public.add_supplier_payment(uuid, numeric, public.supplier_payment_method, uuid, text, text) to authenticated;
grant execute on function public.cancel_purchase(uuid) to authenticated;
grant execute on function public.get_suppliers_balances() to authenticated;
grant execute on function public.get_purchases_overview(text, uuid, date, date) to authenticated;
grant execute on function public.get_purchase_detail(uuid) to authenticated;
grant execute on function public.get_supplier_history(uuid) to authenticated;
grant execute on function public.dashboard_supplier_stats() to authenticated;
grant usage on type public.purchase_status, public.supplier_payment_method to authenticated;

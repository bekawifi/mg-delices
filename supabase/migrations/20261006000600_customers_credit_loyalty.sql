-- MG DELICES - Étape 6 : clients, crédit, règlements et fidélité
-- Migration additive aux étapes 1 à 5 déjà appliquées.

create type public.sale_payment_status as enum ('impayee', 'partiellement_payee', 'payee');
create type public.loyalty_movement_type as enum ('gain_vente', 'ajustement');

create sequence public.customer_number_seq;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  nom text not null check (length(trim(nom)) > 0),
  telephone text,
  email text,
  adresse text,
  plafond_credit numeric(14,2) not null default 0 check (plafond_credit >= 0),
  encours_credit numeric(14,2) not null default 0 check (encours_credit >= 0),
  points_fidelite integer not null default 0 check (points_fidelite >= 0),
  actif boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_telephone_unique_idx on public.clients(lower(trim(telephone))) where nullif(trim(telephone), '') is not null;
create unique index clients_email_unique_idx on public.clients(lower(trim(email))) where nullif(trim(email), '') is not null;
create index clients_nom_idx on public.clients(lower(nom));
create index clients_encours_idx on public.clients(encours_credit desc) where encours_credit > 0;

alter table public.ventes
  add column client_id uuid references public.clients(id) on delete restrict,
  add column montant_initial_paye numeric(12,2) not null default 0
    constraint ventes_montant_initial_paye_nonnegative_check check (montant_initial_paye >= 0),
  add column montant_paye numeric(12,2) not null default 0
    constraint ventes_montant_paye_nonnegative_check check (montant_paye >= 0),
  add column reste_a_payer numeric(12,2) not null default 0 check (reste_a_payer >= 0),
  add column statut_paiement public.sale_payment_status not null default 'payee',
  add column points_fidelite_gagnes integer not null default 0 check (points_fidelite_gagnes >= 0),
  add column fidelite_attribuee boolean not null default false;

-- Les ventes historiques étaient obligatoirement réglées intégralement.
update public.ventes
set montant_initial_paye = total_final,
    montant_paye = total_final,
    reste_a_payer = 0,
    statut_paiement = 'payee',
    fidelite_attribuee = true;

-- Retire uniquement les deux contraintes historiques qui imposaient le paiement intégral.
do $$
declare v_constraint record;
begin
  for v_constraint in
    select conname from pg_constraint
    where conrelid = 'public.ventes'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%montant_recu >= total_final%'
        or pg_get_constraintdef(oid) ilike '%monnaie_rendue = (montant_recu - total_final)%'
        or pg_get_constraintdef(oid) ilike '%monnaie_rendue = montant_recu - total_final%')
  loop
    execute format('alter table public.ventes drop constraint %I', v_constraint.conname);
  end loop;
end $$;

alter table public.ventes
  add constraint ventes_montant_initial_paye_check check (montant_initial_paye <= total_final),
  add constraint ventes_montant_paye_check check (montant_paye <= total_final),
  add constraint ventes_reste_coherent_check check (reste_a_payer = total_final - montant_paye),
  add constraint ventes_statut_paiement_check check (
    (statut_paiement = 'impayee' and montant_paye = 0 and reste_a_payer = total_final)
    or (statut_paiement = 'partiellement_payee' and montant_paye > 0 and reste_a_payer > 0)
    or (statut_paiement = 'payee' and reste_a_payer = 0)
  ),
  add constraint ventes_client_credit_check check (reste_a_payer = 0 or client_id is not null),
  add constraint ventes_monnaie_rendue_check_v2 check (monnaie_rendue >= 0 and monnaie_rendue <= montant_recu);
create index ventes_client_date_idx on public.ventes(client_id, created_at desc) where client_id is not null;
create index ventes_creances_idx on public.ventes(reste_a_payer desc) where reste_a_payer > 0 and statut <> 'annulee';

drop index if exists public.paiements_vente_unique_idx;
alter table public.paiements
  add column idempotency_key uuid,
  add column created_by uuid references public.profiles(id) on delete restrict,
  add column reference text,
  add column note text;
update public.paiements p
set idempotency_key = gen_random_uuid(), created_by = v.user_id
from public.ventes v where v.id = p.vente_id;
alter table public.paiements
  alter column idempotency_key set not null,
  alter column created_by set not null;
create unique index paiements_idempotency_unique_idx on public.paiements(idempotency_key);
create index paiements_created_at_idx on public.paiements(created_at desc);

create table public.mouvements_fidelite (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  vente_id uuid references public.ventes(id) on delete restrict,
  type_mouvement public.loyalty_movement_type not null,
  points integer not null check (points <> 0),
  solde_apres integer not null check (solde_apres >= 0),
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index mouvements_fidelite_vente_unique_idx on public.mouvements_fidelite(vente_id) where vente_id is not null and type_mouvement = 'gain_vente';
create index mouvements_fidelite_client_date_idx on public.mouvements_fidelite(client_id, created_at desc);

create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger paiements_immutable before update or delete on public.paiements
  for each row execute function public.prevent_financial_mutation();

alter table public.clients enable row level security;
alter table public.mouvements_fidelite enable row level security;
create policy clients_read on public.clients for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin','gestionnaire','caissier','serveur'));
create policy mouvements_fidelite_read on public.mouvements_fidelite for select to authenticated
  using (public.current_user_is_active() and public.current_user_role() in ('admin','gestionnaire','caissier'));
grant select on public.clients, public.mouvements_fidelite to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.clients, public.mouvements_fidelite from public, anon, authenticated;
revoke all on sequence public.customer_number_seq from public, anon, authenticated;

create function public.save_customer(
  p_id uuid, p_nom text, p_telephone text, p_email text, p_adresse text,
  p_plafond_credit numeric, p_actif boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_id uuid := coalesce(p_id, gen_random_uuid()); v_customer public.clients%rowtype;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin','gestionnaire') then raise exception 'Action non autorisée'; end if;
  if nullif(trim(p_nom),'') is null or p_plafond_credit is null or p_plafond_credit < 0 then raise exception 'Client invalide'; end if;
  if p_id is null then
    insert into public.clients(id, numero, nom, telephone, email, adresse, plafond_credit, actif, created_by)
    values(v_id, 'CLI-' || lpad(nextval('public.customer_number_seq')::text, 6, '0'), trim(p_nom), nullif(trim(p_telephone),''), nullif(lower(trim(p_email)),''), nullif(trim(p_adresse),''), p_plafond_credit, coalesce(p_actif,true), v_user);
  else
    select * into v_customer from public.clients where id = p_id for update;
    if not found then raise exception 'Client introuvable'; end if;
    if p_plafond_credit < v_customer.encours_credit then raise exception 'Le plafond de crédit ne peut pas être inférieur à la créance actuelle'; end if;
    update public.clients set nom=trim(p_nom), telephone=nullif(trim(p_telephone),''), email=nullif(lower(trim(p_email)),''),
      adresse=nullif(trim(p_adresse),''), plafond_credit=p_plafond_credit, actif=coalesce(p_actif,true) where id=p_id;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Un client utilise déjà ce téléphone ou cet email';
end $$;

create function public.award_sale_loyalty(p_vente_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_sale public.ventes%rowtype; v_points integer; v_balance integer;
begin
  select * into v_sale from public.ventes where id=p_vente_id for update;
  if not found or v_sale.client_id is null or v_sale.reste_a_payer > 0 or v_sale.fidelite_attribuee then return; end if;
  select points_fidelite into v_balance from public.clients where id=v_sale.client_id for update;
  v_points := floor(v_sale.total_final / 1000)::integer;
  if v_points > 0 then
    v_balance := v_balance + v_points;
    update public.clients set points_fidelite=v_balance where id=v_sale.client_id;
    insert into public.mouvements_fidelite(client_id,vente_id,type_mouvement,points,solde_apres,note,created_by)
    values(v_sale.client_id,v_sale.id,'gain_vente',v_points,v_balance,'1 point par tranche de 1 000 F CFA',v_sale.user_id)
    on conflict do nothing;
  end if;
  update public.ventes set fidelite_attribuee=true, points_fidelite_gagnes=v_points where id=v_sale.id;
end $$;
revoke all on function public.award_sale_loyalty(uuid) from public, anon, authenticated;

-- Source comptable canonique : ventes validées moins règlements réellement inscrits.
-- encours_credit et reste_a_payer sont des caches transactionnels contrôlés.
create function public.calculated_customer_debt(p_client_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(greatest(v.total_final-coalesce((select sum(p.montant) from public.paiements p where p.vente_id=v.id),0),0)),0)
  from public.ventes v where v.client_id=p_client_id and v.statut<>'annulee'
$$;
revoke all on function public.calculated_customer_debt(uuid) from public,anon,authenticated;

create function public.audit_customer_credit(p_client_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid:=auth.uid();v_role public.app_role;v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise';end if;
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_role is null or v_role not in('admin','gestionnaire')then raise exception 'Action non autorisée';end if;
  select coalesce(jsonb_agg(to_jsonb(x)order by x.numero),'[]'::jsonb)into v_result from(
    select c.id,c.numero,c.nom,c.encours_credit,
      coalesce((select sum(v.reste_a_payer)from public.ventes v where v.client_id=c.id and v.statut<>'annulee'),0)as somme_restes,
      public.calculated_customer_debt(c.id)as dette_calculee,
      c.encours_credit-public.calculated_customer_debt(c.id)as ecart_grand_livre
    from public.clients c where p_client_id is null or c.id=p_client_id
  )x;return v_result;
end $$;

create function public.reconcile_customer_credit(p_client_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid();v_role public.app_role;v_customer record;v_debt numeric;
begin
  if v_user is null then raise exception 'Authentification requise';end if;
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_role is null or v_role not in('admin','gestionnaire')then raise exception 'Action non autorisée';end if;
  for v_customer in select id from public.clients where p_client_id is null or id=p_client_id order by id for update loop
    v_debt:=public.calculated_customer_debt(v_customer.id);
    update public.clients set encours_credit=v_debt where id=v_customer.id;
  end loop;
  return public.audit_customer_credit(p_client_id);
end $$;

-- Le stock doit être consommé par la validation de vente, jamais par un paiement.
drop trigger if exists paiements_consume_stock on public.paiements;

-- Le mouvement espèces d'un règlement ultérieur appartient à son auteur réel.
create or replace function public.record_client_cash_payment() returns trigger
language plpgsql set search_path = '' as $$
declare v_session uuid;
begin
  if new.mode <> 'especes' then return new; end if;
  select id into v_session from public.sessions_caisse where statut='ouverte' for update;
  if not found then raise exception 'Aucune caisse n''est ouverte.'; end if;
  insert into public.mouvements_caisse(session_caisse_id,type_mouvement,sens,montant,reference_type,reference_id,libelle,created_by)
  values(v_session,'vente','entree',new.montant,'paiement_client',new.id,'Règlement client',new.created_by)
  on conflict do nothing;
  return new;
end $$;

drop function public.create_sale(uuid, public.order_type, numeric, numeric, public.payment_method, jsonb);
create function public.create_sale(
  p_idempotency_key uuid, p_type_commande public.order_type, p_remise numeric,
  p_montant_recu numeric, p_mode_paiement public.payment_method, p_lignes jsonb,
  p_client_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid:=auth.uid(); v_role public.app_role; v_existing public.ventes%rowtype; v_client public.clients%rowtype;
  v_sale_id uuid:=gen_random_uuid(); v_subtotal numeric(12,2); v_total numeric(12,2); v_paid numeric(12,2); v_remaining numeric(12,2); v_change numeric(12,2);
  v_counter integer; v_numero text; v_payment_status public.sale_payment_status; v_real_debt numeric(14,2);
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_role is null or v_role not in ('admin','gestionnaire','caissier','serveur') then raise exception 'Action non autorisée'; end if;
  if p_idempotency_key is null then raise exception 'Clé d''idempotence requise'; end if;
  select * into v_existing from public.ventes where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.user_id<>v_user then raise exception 'Clé d''idempotence déjà utilisée'; end if;
    return jsonb_build_object('sale_id',v_existing.id,'numero',v_existing.numero,'total_final',v_existing.total_final,'montant_paye',v_existing.montant_paye,'reste_a_payer',v_existing.reste_a_payer,'montant_recu',v_existing.montant_recu,'monnaie_rendue',v_existing.monnaie_rendue,'statut_paiement',v_existing.statut_paiement,'idempotent_replay',true);
  end if;
  if jsonb_typeof(p_lignes)<>'array' or jsonb_array_length(p_lignes)=0 then raise exception 'Le panier est vide'; end if;
  if jsonb_array_length(p_lignes)>100 then raise exception 'Le panier contient trop de lignes'; end if;
  if p_remise is null or p_remise<0 or p_montant_recu is null or p_montant_recu<0 then raise exception 'Paiement ou remise invalide'; end if;
  if exists(select 1 from jsonb_to_recordset(p_lignes)x(produit_id uuid,quantite numeric) where produit_id is null or quantite is null or quantite<=0 or quantite>1000 or quantite<>trunc(quantite)) then raise exception 'Quantité invalide'; end if;
  if exists(select 1 from jsonb_to_recordset(p_lignes)x(produit_id uuid,quantite integer) left join public.produits p on p.id=x.produit_id where p.id is null or not p.disponible) then raise exception 'Un produit est introuvable ou indisponible'; end if;
  select coalesce(sum(p.prix_vente*x.quantite),0) into v_subtotal from jsonb_to_recordset(p_lignes)x(produit_id uuid,quantite integer) join public.produits p on p.id=x.produit_id;
  if p_remise>v_subtotal then raise exception 'La remise dépasse le sous-total'; end if;
  v_total:=v_subtotal-p_remise; if v_total<=0 then raise exception 'Le total doit être supérieur à zéro'; end if;
  v_paid:=least(p_montant_recu,v_total); v_remaining:=v_total-v_paid; v_change:=greatest(p_montant_recu-v_total,0);
  if v_paid>0 and p_mode_paiement is null then raise exception 'Règlement invalide'; end if;
  if v_remaining>0 and p_client_id is null then raise exception 'Un client est obligatoire pour une vente à crédit'; end if;
  if p_client_id is not null then
    select * into v_client from public.clients where id=p_client_id for update;
    if not found or not v_client.actif then raise exception 'Client introuvable ou inactif'; end if;
    v_real_debt:=public.calculated_customer_debt(p_client_id);
    update public.clients set encours_credit=v_real_debt where id=p_client_id;
    if v_real_debt+v_remaining>v_client.plafond_credit then raise exception 'Plafond de crédit dépassé'; end if;
  end if;
  v_payment_status:=case when v_remaining=0 then 'payee'::public.sale_payment_status when v_paid=0 then 'impayee'::public.sale_payment_status else 'partiellement_payee'::public.sale_payment_status end;
  insert into public.sale_counters(sale_date,last_value) values(current_date,1) on conflict(sale_date) do update set last_value=public.sale_counters.last_value+1 returning last_value into v_counter;
  v_numero:='MG-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(v_counter::text,4,'0');
  insert into public.ventes(id,numero,idempotency_key,user_id,type_commande,sous_total,remise,total_final,montant_recu,monnaie_rendue,client_id,montant_initial_paye,montant_paye,reste_a_payer,statut_paiement)
  values(v_sale_id,v_numero,p_idempotency_key,v_user,p_type_commande,v_subtotal,p_remise,v_total,p_montant_recu,v_change,p_client_id,v_paid,v_paid,v_remaining,v_payment_status);
  insert into public.lignes_vente(vente_id,produit_id,nom_produit,quantite,prix_unitaire)
  select v_sale_id,p.id,p.nom,sum(x.quantite)::integer,p.prix_vente from jsonb_to_recordset(p_lignes)x(produit_id uuid,quantite integer) join public.produits p on p.id=x.produit_id group by p.id,p.nom,p.prix_vente;
  perform public.consume_stock_for_sale(v_sale_id);
  if v_paid>0 then insert into public.paiements(vente_id,mode,montant,idempotency_key,created_by,note) values(v_sale_id,p_mode_paiement,v_paid,p_idempotency_key,v_user,'Paiement initial'); end if;
  if p_client_id is not null and v_remaining>0 then update public.clients set encours_credit=v_real_debt+v_remaining where id=p_client_id; end if;
  if v_remaining=0 then perform public.award_sale_loyalty(v_sale_id); end if;
  return jsonb_build_object('sale_id',v_sale_id,'numero',v_numero,'total_final',v_total,'montant_paye',v_paid,'reste_a_payer',v_remaining,'montant_recu',p_montant_recu,'monnaie_rendue',v_change,'statut_paiement',v_payment_status,'idempotent_replay',false);
exception when unique_violation then
  select * into v_existing from public.ventes where idempotency_key=p_idempotency_key;
  if found and v_existing.user_id=v_user then return jsonb_build_object('sale_id',v_existing.id,'numero',v_existing.numero,'total_final',v_existing.total_final,'montant_paye',v_existing.montant_paye,'reste_a_payer',v_existing.reste_a_payer,'montant_recu',v_existing.montant_recu,'monnaie_rendue',v_existing.monnaie_rendue,'statut_paiement',v_existing.statut_paiement,'idempotent_replay',true); end if;
  raise;
end $$;

drop function public.checkout_order(uuid, uuid, numeric, numeric, public.payment_method);
create function public.checkout_order(
  p_commande_id uuid,p_idempotency_key uuid,p_remise numeric,p_montant_recu numeric,
  p_mode_paiement public.payment_method,p_client_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid:=auth.uid();v_role public.app_role;v_order public.commandes%rowtype;v_existing public.ventes%rowtype;v_client public.clients%rowtype;
  v_sale_id uuid:=gen_random_uuid();v_subtotal numeric(12,2);v_total numeric(12,2);v_paid numeric(12,2);v_remaining numeric(12,2);v_change numeric(12,2);
  v_counter integer;v_numero text;v_payment_status public.sale_payment_status;v_real_debt numeric(14,2);
begin
  if v_user is null then raise exception 'Authentification requise';end if;select role into v_role from public.profiles where id=v_user and is_active;
  if v_role is null or v_role not in('admin','gestionnaire','caissier')then raise exception 'Action non autorisée';end if;
  if p_idempotency_key is null then raise exception 'Clé d''idempotence requise';end if;
  select * into v_order from public.commandes where id=p_commande_id for update;if not found then raise exception 'Commande introuvable';end if;
  select * into v_existing from public.ventes where idempotency_key=p_idempotency_key;
  if found then if v_existing.commande_id=p_commande_id and v_order.statut='cloturee' then return jsonb_build_object('sale_id',v_existing.id,'numero',v_existing.numero,'total_final',v_existing.total_final,'montant_paye',v_existing.montant_paye,'reste_a_payer',v_existing.reste_a_payer,'monnaie_rendue',v_existing.monnaie_rendue,'statut_paiement',v_existing.statut_paiement,'idempotent_replay',true,'commande_id',p_commande_id);end if;raise exception 'Clé d''idempotence déjà utilisée';end if;
  if v_order.statut='cloturee' then raise exception 'Commande déjà encaissée';end if;
  if v_order.statut<>'servie' then raise exception 'La commande doit être servie avant encaissement';end if;
  if p_remise is null or p_remise<0 or p_montant_recu is null or p_montant_recu<0 then raise exception 'Paiement ou remise invalide';end if;
  select coalesce(sum(quantite*prix_unitaire_snapshot),0) into v_subtotal from public.lignes_commande where commande_id=p_commande_id and statut_cuisine='servie';
  if v_subtotal<=0 then raise exception 'Commande vide';end if;if p_remise>v_subtotal then raise exception 'La remise dépasse le sous-total';end if;
  v_total:=v_subtotal-p_remise;if v_total<=0 then raise exception 'Le total doit être supérieur à zéro';end if;
  v_paid:=least(p_montant_recu,v_total);v_remaining:=v_total-v_paid;v_change:=greatest(p_montant_recu-v_total,0);
  if v_paid>0 and p_mode_paiement is null then raise exception 'Règlement invalide';end if;
  if v_remaining>0 and p_client_id is null then raise exception 'Un client est obligatoire pour une vente à crédit';end if;
  if p_client_id is not null then select * into v_client from public.clients where id=p_client_id for update;if not found or not v_client.actif then raise exception 'Client introuvable ou inactif';end if;v_real_debt:=public.calculated_customer_debt(p_client_id);update public.clients set encours_credit=v_real_debt where id=p_client_id;if v_real_debt+v_remaining>v_client.plafond_credit then raise exception 'Plafond de crédit dépassé';end if;end if;
  v_payment_status:=case when v_remaining=0 then 'payee'::public.sale_payment_status when v_paid=0 then 'impayee'::public.sale_payment_status else 'partiellement_payee'::public.sale_payment_status end;
  insert into public.sale_counters(sale_date,last_value)values(current_date,1)on conflict(sale_date)do update set last_value=public.sale_counters.last_value+1 returning last_value into v_counter;
  v_numero:='MG-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(v_counter::text,4,'0');
  insert into public.ventes(id,numero,idempotency_key,user_id,type_commande,sous_total,remise,total_final,montant_recu,monnaie_rendue,commande_id,client_id,montant_initial_paye,montant_paye,reste_a_payer,statut_paiement)
  values(v_sale_id,v_numero,p_idempotency_key,v_user,v_order.type_commande,v_subtotal,p_remise,v_total,p_montant_recu,v_change,p_commande_id,p_client_id,v_paid,v_paid,v_remaining,v_payment_status);
  insert into public.lignes_vente(vente_id,produit_id,nom_produit,quantite,prix_unitaire)select v_sale_id,produit_id,nom_produit_snapshot,sum(quantite)::integer,prix_unitaire_snapshot from public.lignes_commande where commande_id=p_commande_id and statut_cuisine='servie' group by produit_id,nom_produit_snapshot,prix_unitaire_snapshot;
  perform public.consume_stock_for_sale(v_sale_id);
  if v_paid>0 then insert into public.paiements(vente_id,mode,montant,idempotency_key,created_by,note)values(v_sale_id,p_mode_paiement,v_paid,p_idempotency_key,v_user,'Paiement initial');end if;
  if p_client_id is not null and v_remaining>0 then update public.clients set encours_credit=v_real_debt+v_remaining where id=p_client_id;end if;
  if v_remaining=0 then perform public.award_sale_loyalty(v_sale_id);end if;
  update public.commandes set statut='cloturee',closed_at=now()where id=p_commande_id;
  insert into public.commande_events(commande_id,event_type,details,actor_id)values(p_commande_id,'commande_encaissee',jsonb_build_object('vente_id',v_sale_id,'reste_a_payer',v_remaining),v_user);
  return jsonb_build_object('sale_id',v_sale_id,'numero',v_numero,'total_final',v_total,'montant_paye',v_paid,'reste_a_payer',v_remaining,'monnaie_rendue',v_change,'statut_paiement',v_payment_status,'idempotent_replay',false,'commande_id',p_commande_id);
end $$;

create function public.add_customer_payment(
  p_vente_id uuid,p_montant numeric,p_mode_paiement public.payment_method,p_idempotency_key uuid,
  p_reference text default null,p_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid();v_role public.app_role;v_sale public.ventes%rowtype;v_existing public.paiements%rowtype;v_id uuid:=gen_random_uuid();v_remaining numeric(12,2);v_status public.sale_payment_status;v_real_debt numeric(14,2);v_ledger_paid numeric(12,2);v_current_remaining numeric(12,2);
begin
  if v_user is null then raise exception 'Authentification requise';end if;select role into v_role from public.profiles where id=v_user and is_active;
  if v_role is null or v_role not in('admin','gestionnaire','caissier')then raise exception 'Action non autorisée';end if;
  if p_idempotency_key is null or p_montant is null or p_montant<=0 or p_mode_paiement is null then raise exception 'Règlement invalide';end if;
  select * into v_sale from public.ventes where id=p_vente_id for update;if not found or v_sale.statut='annulee' then raise exception 'Vente introuvable ou annulée';end if;
  if v_sale.client_id is not null then perform 1 from public.clients where id=v_sale.client_id for update;v_real_debt:=public.calculated_customer_debt(v_sale.client_id);update public.clients set encours_credit=v_real_debt where id=v_sale.client_id;end if;
  select * into v_existing from public.paiements where idempotency_key=p_idempotency_key;
  if found then if v_existing.vente_id<>p_vente_id then raise exception 'Clé d''idempotence déjà utilisée';end if;return jsonb_build_object('payment_id',v_existing.id,'vente_id',p_vente_id,'montant_paye',v_sale.montant_paye,'reste_a_payer',v_sale.reste_a_payer,'statut_paiement',v_sale.statut_paiement,'idempotent_replay',true);end if;
  select coalesce(sum(montant),0)into v_ledger_paid from public.paiements where vente_id=p_vente_id;
  v_current_remaining:=v_sale.total_final-v_ledger_paid;
  if v_current_remaining<=0 then raise exception 'Cette vente est déjà soldée';end if;
  if p_montant>v_current_remaining then raise exception 'Le montant dépasse le reste dû';end if;
  v_remaining:=v_current_remaining-p_montant;v_status:=case when v_remaining=0 then 'payee'::public.sale_payment_status else 'partiellement_payee'::public.sale_payment_status end;
  insert into public.paiements(id,vente_id,mode,montant,idempotency_key,created_by,reference,note)values(v_id,p_vente_id,p_mode_paiement,p_montant,p_idempotency_key,v_user,nullif(trim(p_reference),''),nullif(trim(p_note),''));
  update public.ventes set montant_paye=v_ledger_paid+p_montant,reste_a_payer=v_remaining,statut_paiement=v_status where id=p_vente_id;
  if v_sale.client_id is not null then update public.clients set encours_credit=greatest(v_real_debt-p_montant,0) where id=v_sale.client_id;end if;
  if v_remaining=0 then perform public.award_sale_loyalty(p_vente_id);end if;
  return jsonb_build_object('payment_id',v_id,'vente_id',p_vente_id,'montant_paye',v_ledger_paid+p_montant,'reste_a_payer',v_remaining,'statut_paiement',v_status,'idempotent_replay',false);
exception when unique_violation then
  select * into v_existing from public.paiements where idempotency_key=p_idempotency_key;
  if found and v_existing.vente_id=p_vente_id then select * into v_sale from public.ventes where id=p_vente_id;return jsonb_build_object('payment_id',v_existing.id,'vente_id',p_vente_id,'montant_paye',v_sale.montant_paye,'reste_a_payer',v_sale.reste_a_payer,'statut_paiement',v_sale.statut_paiement,'idempotent_replay',true);end if;raise;
end $$;

create function public.get_customers_overview(p_search text default null,p_only_with_debt boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid:=auth.uid();v_role public.app_role;v_result jsonb;
begin if v_user is null then raise exception 'Authentification requise';end if;select role into v_role from public.profiles where id=v_user and is_active;if v_role is null or v_role not in('admin','gestionnaire','caissier','serveur')then raise exception 'Action non autorisée';end if;
select coalesce(jsonb_agg(to_jsonb(x)order by x.nom),'[]'::jsonb)into v_result from(select id,numero,nom,telephone,email,adresse,plafond_credit,encours_credit,points_fidelite,actif,created_at,updated_at from public.clients where (not coalesce(p_only_with_debt,false)or encours_credit>0)and(nullif(trim(p_search),'')is null or nom ilike '%'||trim(p_search)||'%' or telephone ilike '%'||trim(p_search)||'%' or numero ilike '%'||trim(p_search)||'%'))x;return v_result;end $$;

create function public.get_customer_detail(p_client_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid:=auth.uid();v_role public.app_role;v_customer public.clients%rowtype;v_result jsonb;
begin if v_user is null then raise exception 'Authentification requise';end if;select role into v_role from public.profiles where id=v_user and is_active;if v_role is null or v_role not in('admin','gestionnaire','caissier','serveur')then raise exception 'Action non autorisée';end if;select * into v_customer from public.clients where id=p_client_id;if not found then raise exception 'Client introuvable';end if;
select to_jsonb(v_customer)||jsonb_build_object('ventes',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'numero',v.numero,'total_final',v.total_final,'montant_paye',v.montant_paye,'reste_a_payer',v.reste_a_payer,'statut_paiement',v.statut_paiement,'created_at',v.created_at)order by v.created_at desc)from public.ventes v where v.client_id=p_client_id and v.statut<>'annulee'),'[]'::jsonb),'paiements',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'vente_id',p.vente_id,'numero',v.numero,'mode',p.mode,'montant',p.montant,'reference',p.reference,'note',p.note,'created_at',p.created_at)order by p.created_at desc)from public.paiements p join public.ventes v on v.id=p.vente_id where v.client_id=p_client_id),'[]'::jsonb),'fidelite',coalesce((select jsonb_agg(to_jsonb(m)order by m.created_at desc)from public.mouvements_fidelite m where m.client_id=p_client_id),'[]'::jsonb))into v_result;return v_result;end $$;

create or replace function public.dashboard_stats() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin if not public.current_user_is_active()then raise exception 'Compte inactif';end if;
select jsonb_build_object('chiffre_affaires',coalesce((select sum(total_final)from public.ventes where statut='payee'and created_at>=current_date and created_at<current_date+interval '1 day'),0),'encaissements',coalesce((select sum(p.montant)from public.paiements p join public.ventes v on v.id=p.vente_id where v.statut='payee'and p.created_at>=current_date and p.created_at<current_date+interval '1 day'),0),'nombre_ventes',(select count(*)from public.ventes where statut='payee'and created_at>=current_date and created_at<current_date+interval '1 day'),'panier_moyen',coalesce((select avg(total_final)from public.ventes where statut='payee'and created_at>=current_date and created_at<current_date+interval '1 day'),0),'creances_clients',coalesce((select sum(reste_a_payer)from public.ventes where statut='payee'),0),'clients_debiteurs',(select count(*)from public.clients where encours_credit>0),'dernieres_ventes',coalesce((select jsonb_agg(to_jsonb(x))from(select id,numero,total_final,montant_paye,reste_a_payer,statut_paiement,statut,type_commande,created_at from public.ventes where created_at>=current_date and created_at<current_date+interval '1 day'order by created_at desc limit 8)x),'[]'::jsonb),'produits_populaires',coalesce((select jsonb_agg(to_jsonb(x))from(select lv.nom_produit nom,sum(lv.quantite)::integer quantite,sum(lv.total_ligne)montant from public.lignes_vente lv join public.ventes v on v.id=lv.vente_id where v.statut='payee'and v.created_at>=current_date and v.created_at<current_date+interval '1 day'group by lv.nom_produit order by quantite desc,montant desc limit 5)x),'[]'::jsonb))into v_result;return v_result;end $$;

create or replace function public.daily_operating_summary(p_date date default current_date) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare v_user uuid:=auth.uid();v_role public.app_role;v_result jsonb;
begin if v_user is null then raise exception 'Authentification requise';end if;select role into v_role from public.profiles where id=v_user and is_active;if v_role is null or v_role not in('admin','gestionnaire')then raise exception 'Action non autorisée';end if;
select jsonb_build_object('chiffre_affaires',coalesce((select sum(total_final)from public.ventes where statut='payee'and created_at::date=p_date),0),'encaissements_clients',coalesce((select sum(pa.montant)from public.paiements pa where pa.created_at::date=p_date),0),'nouvelles_creances',coalesce((select sum(total_final-montant_initial_paye)from public.ventes where statut='payee'and created_at::date=p_date),0),'creances_clients_actuelles',coalesce((select sum(reste_a_payer)from public.ventes where statut='payee'),0),'achats_receptionnes',coalesce((select sum(total)from public.achats where date_reception::date=p_date),0),'paiements_fournisseurs',coalesce((select sum(montant)from public.paiements_fournisseur where created_at::date=p_date),0),'depenses_exploitation',coalesce((select sum(montant)from public.depenses where date_depense=p_date),0),'ventes_especes',coalesce((select sum(montant)from public.paiements where mode='especes'and created_at::date=p_date),0),'ventes_mobile_money',coalesce((select sum(montant)from public.paiements where mode in('orange_money','moov_money')and created_at::date=p_date),0),'solde_caisse_especes',coalesce((select sum(s.fond_ouverture+coalesce((select sum(case when m.sens='entree'then m.montant else -m.montant end)from public.mouvements_caisse m where m.session_caisse_id=s.id and m.type_mouvement<>'ouverture'),0))from public.sessions_caisse s where s.date_session=p_date),0),'ecart_caisse',coalesce((select sum(ecart)from public.sessions_caisse where closed_at::date=p_date),0),'cout_matiere_estime',coalesce((select sum(-ms.quantite*ms.cout_unitaire_snapshot)from public.mouvements_stock ms where ms.type_mouvement='vente'and ms.created_at::date=p_date),0))into v_result;
return v_result||jsonb_build_object('resultat_operationnel_simplifie',(v_result->>'chiffre_affaires')::numeric-(v_result->>'cout_matiere_estime')::numeric-(v_result->>'depenses_exploitation')::numeric);end $$;

revoke all on function public.save_customer(uuid,text,text,text,text,numeric,boolean),public.create_sale(uuid,public.order_type,numeric,numeric,public.payment_method,jsonb,uuid),public.checkout_order(uuid,uuid,numeric,numeric,public.payment_method,uuid),public.add_customer_payment(uuid,numeric,public.payment_method,uuid,text,text),public.get_customers_overview(text,boolean),public.get_customer_detail(uuid),public.audit_customer_credit(uuid),public.reconcile_customer_credit(uuid) from public,anon;
grant execute on function public.save_customer(uuid,text,text,text,text,numeric,boolean),public.create_sale(uuid,public.order_type,numeric,numeric,public.payment_method,jsonb,uuid),public.checkout_order(uuid,uuid,numeric,numeric,public.payment_method,uuid),public.add_customer_payment(uuid,numeric,public.payment_method,uuid,text,text),public.get_customers_overview(text,boolean),public.get_customer_detail(uuid),public.audit_customer_credit(uuid),public.reconcile_customer_credit(uuid) to authenticated;
grant usage on type public.sale_payment_status,public.loyalty_movement_type to authenticated;

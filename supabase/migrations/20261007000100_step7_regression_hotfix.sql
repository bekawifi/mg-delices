-- MG DELICES - Hotfix regressions post-migration Etape 7.
-- Correctifs additifs uniquement : controle des roles et references SQL qualifiees.

create or replace function public.create_sale(
  p_idempotency_key uuid,
  p_type_commande public.order_type,
  p_remise numeric,
  p_montant_recu numeric,
  p_mode_paiement public.payment_method,
  p_lignes jsonb,
  p_client_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_existing public.ventes%rowtype;
  v_client public.clients%rowtype;
  v_sale_id uuid := gen_random_uuid();
  v_subtotal numeric(12,2);
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_remaining numeric(12,2);
  v_change numeric(12,2);
  v_counter integer;
  v_numero text;
  v_payment_status public.sale_payment_status;
  v_real_debt numeric(14,2);
begin
  if v_user is null then raise exception 'Authentification requise'; end if;

  select profile.role
  into v_role
  from public.profiles as profile
  where profile.id = v_user and profile.is_active;

  if v_role is null or v_role not in ('admin','gestionnaire','caissier') then
    raise exception 'Action non autorisee';
  end if;

  if p_idempotency_key is null then raise exception 'Cle d''idempotence requise'; end if;

  select sale.*
  into v_existing
  from public.ventes as sale
  where sale.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.user_id <> v_user then raise exception 'Cle d''idempotence deja utilisee'; end if;
    return jsonb_build_object(
      'sale_id',v_existing.id,'numero',v_existing.numero,'total_final',v_existing.total_final,
      'montant_paye',v_existing.montant_paye,'reste_a_payer',v_existing.reste_a_payer,
      'montant_recu',v_existing.montant_recu,'monnaie_rendue',v_existing.monnaie_rendue,
      'statut_paiement',v_existing.statut_paiement,'idempotent_replay',true
    );
  end if;

  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then raise exception 'Le panier est vide'; end if;
  if jsonb_array_length(p_lignes) > 100 then raise exception 'Le panier contient trop de lignes'; end if;
  if p_remise is null or p_remise < 0 or p_montant_recu is null or p_montant_recu < 0 then raise exception 'Paiement ou remise invalide'; end if;
  if exists(
    select 1 from jsonb_to_recordset(p_lignes) as item(produit_id uuid,quantite numeric)
    where item.produit_id is null or item.quantite is null or item.quantite <= 0
      or item.quantite > 1000 or item.quantite <> trunc(item.quantite)
  ) then raise exception 'Quantite invalide'; end if;
  if exists(
    select 1
    from jsonb_to_recordset(p_lignes) as item(produit_id uuid,quantite integer)
    left join public.produits as product on product.id = item.produit_id
    where product.id is null or not product.disponible
  ) then raise exception 'Un produit est introuvable ou indisponible'; end if;

  select coalesce(sum(product.prix_vente * item.quantite),0)
  into v_subtotal
  from jsonb_to_recordset(p_lignes) as item(produit_id uuid,quantite integer)
  join public.produits as product on product.id = item.produit_id;

  if p_remise > v_subtotal then raise exception 'La remise depasse le sous-total'; end if;
  v_total := v_subtotal - p_remise;
  if v_total <= 0 then raise exception 'Le total doit etre superieur a zero'; end if;

  v_paid := least(p_montant_recu,v_total);
  v_remaining := v_total-v_paid;
  v_change := greatest(p_montant_recu-v_total,0);
  if v_paid > 0 and p_mode_paiement is null then raise exception 'Reglement invalide'; end if;
  if v_remaining > 0 and p_client_id is null then raise exception 'Un client est obligatoire pour une vente a credit'; end if;

  if p_client_id is not null then
    select customer.*
    into v_client
    from public.clients as customer
    where customer.id = p_client_id
    for update;
    if not found or not v_client.actif then raise exception 'Client introuvable ou inactif'; end if;
    v_real_debt := public.calculated_customer_debt(p_client_id);
    update public.clients as customer set encours_credit = v_real_debt where customer.id = p_client_id;
    if v_real_debt + v_remaining > v_client.plafond_credit then raise exception 'Plafond de credit depasse'; end if;
  end if;

  v_payment_status := case
    when v_remaining = 0 then 'payee'::public.sale_payment_status
    when v_paid = 0 then 'impayee'::public.sale_payment_status
    else 'partiellement_payee'::public.sale_payment_status
  end;

  insert into public.sale_counters(sale_date,last_value)
  values(current_date,1)
  on conflict(sale_date) do update set last_value = public.sale_counters.last_value + 1
  returning last_value into v_counter;
  v_numero := 'MG-' || to_char(current_date,'YYYYMMDD') || '-' || lpad(v_counter::text,4,'0');

  insert into public.ventes(
    id,numero,idempotency_key,user_id,type_commande,sous_total,remise,total_final,
    montant_recu,monnaie_rendue,client_id,montant_initial_paye,montant_paye,reste_a_payer,statut_paiement
  ) values(
    v_sale_id,v_numero,p_idempotency_key,v_user,p_type_commande,v_subtotal,p_remise,v_total,
    p_montant_recu,v_change,p_client_id,v_paid,v_paid,v_remaining,v_payment_status
  );

  insert into public.lignes_vente(vente_id,produit_id,nom_produit,quantite,prix_unitaire)
  select v_sale_id,product.id,product.nom,sum(item.quantite)::integer,product.prix_vente
  from jsonb_to_recordset(p_lignes) as item(produit_id uuid,quantite integer)
  join public.produits as product on product.id = item.produit_id
  group by product.id,product.nom,product.prix_vente;

  perform public.consume_stock_for_sale(v_sale_id);
  if v_paid > 0 then
    insert into public.paiements(vente_id,mode,montant,idempotency_key,created_by,note)
    values(v_sale_id,p_mode_paiement,v_paid,p_idempotency_key,v_user,'Paiement initial');
  end if;
  if p_client_id is not null and v_remaining > 0 then
    update public.clients as customer set encours_credit = v_real_debt + v_remaining where customer.id = p_client_id;
  end if;
  if v_remaining = 0 then perform public.award_sale_loyalty(v_sale_id); end if;

  return jsonb_build_object(
    'sale_id',v_sale_id,'numero',v_numero,'total_final',v_total,'montant_paye',v_paid,
    'reste_a_payer',v_remaining,'montant_recu',p_montant_recu,'monnaie_rendue',v_change,
    'statut_paiement',v_payment_status,'idempotent_replay',false
  );
exception when unique_violation then
  select sale.* into v_existing from public.ventes as sale where sale.idempotency_key = p_idempotency_key;
  if found and v_existing.user_id = v_user then
    return jsonb_build_object(
      'sale_id',v_existing.id,'numero',v_existing.numero,'total_final',v_existing.total_final,
      'montant_paye',v_existing.montant_paye,'reste_a_payer',v_existing.reste_a_payer,
      'montant_recu',v_existing.montant_recu,'monnaie_rendue',v_existing.monnaie_rendue,
      'statut_paiement',v_existing.statut_paiement,'idempotent_replay',true
    );
  end if;
  raise;
end $$;

revoke all on function public.create_sale(uuid,public.order_type,numeric,numeric,public.payment_method,jsonb,uuid) from public,anon;
grant execute on function public.create_sale(uuid,public.order_type,numeric,numeric,public.payment_method,jsonb,uuid) to authenticated;

create or replace function public.add_customer_payment(
  p_vente_id uuid,
  p_montant numeric,
  p_mode_paiement public.payment_method,
  p_idempotency_key uuid,
  p_reference text default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_sale public.ventes%rowtype;
  v_existing public.paiements%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_paid numeric(12,2);
  v_net numeric(12,2);
  v_remaining numeric(12,2);
  v_status public.sale_payment_status;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select profile.role into v_role from public.profiles as profile where profile.id = v_user and profile.is_active;
  if v_role is null or v_role not in ('admin','gestionnaire','caissier') then raise exception 'Action non autorisee'; end if;
  if p_idempotency_key is null or p_montant is null or p_montant <= 0 or p_mode_paiement is null then raise exception 'Reglement invalide'; end if;

  select sale.* into v_sale from public.ventes as sale where sale.id = p_vente_id for update;
  if not found or v_sale.statut = 'annulee' then raise exception 'Vente introuvable ou annulee'; end if;
  if v_sale.client_id is not null then
    perform 1 from public.clients as customer where customer.id = v_sale.client_id for update;
  end if;

  select payment.* into v_existing
  from public.paiements as payment
  where payment.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.vente_id <> p_vente_id then raise exception 'Cle d''idempotence deja utilisee'; end if;
    return jsonb_build_object(
      'payment_id',v_existing.id,'vente_id',p_vente_id,'montant_paye',v_sale.montant_paye,
      'reste_a_payer',v_sale.reste_a_payer,'statut_paiement',v_sale.statut_paiement,'idempotent_replay',true
    );
  end if;

  select coalesce(sum(payment.montant),0)
  into v_paid
  from public.paiements as payment
  where payment.vente_id = p_vente_id;

  v_net := v_sale.total_final - v_sale.montant_retourne;
  v_remaining := v_net - v_paid;
  if v_remaining <= 0 then raise exception 'Cette vente est deja soldee'; end if;
  if p_montant > v_remaining then raise exception 'Le montant depasse le reste du'; end if;

  insert into public.paiements(id,vente_id,mode,montant,idempotency_key,created_by,reference,note)
  values(v_payment_id,p_vente_id,p_mode_paiement,p_montant,p_idempotency_key,v_user,nullif(trim(p_reference),''),nullif(trim(p_note),''));

  v_paid := v_paid + p_montant;
  v_remaining := v_net - v_paid;
  v_status := case when v_remaining = 0 then 'payee'::public.sale_payment_status else 'partiellement_payee'::public.sale_payment_status end;
  update public.ventes as sale
  set montant_paye = v_paid,reste_a_payer = v_remaining,statut_paiement = v_status
  where sale.id = p_vente_id;
  if v_sale.client_id is not null then
    update public.clients as customer
    set encours_credit = public.calculated_customer_debt(v_sale.client_id)
    where customer.id = v_sale.client_id;
  end if;
  if v_remaining = 0 then perform public.award_sale_loyalty(p_vente_id); end if;

  return jsonb_build_object(
    'payment_id',v_payment_id,'vente_id',p_vente_id,'montant_paye',v_paid,
    'reste_a_payer',v_remaining,'statut_paiement',v_status,'idempotent_replay',false
  );
exception when unique_violation then
  select payment.* into v_existing from public.paiements as payment where payment.idempotency_key = p_idempotency_key;
  if found and v_existing.vente_id = p_vente_id then
    select sale.* into v_sale from public.ventes as sale where sale.id = p_vente_id;
    return jsonb_build_object(
      'payment_id',v_existing.id,'vente_id',p_vente_id,'montant_paye',v_sale.montant_paye,
      'reste_a_payer',v_sale.reste_a_payer,'statut_paiement',v_sale.statut_paiement,'idempotent_replay',true
    );
  end if;
  raise;
end $$;

revoke all on function public.add_customer_payment(uuid,numeric,public.payment_method,uuid,text,text) from public,anon;
grant execute on function public.add_customer_payment(uuid,numeric,public.payment_method,uuid,text,text) to authenticated;

create or replace function public.add_supplier_payment(
  p_achat_id uuid,
  p_montant numeric,
  p_mode_paiement public.supplier_payment_method,
  p_idempotency_key uuid,
  p_reference text default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_purchase public.achats%rowtype;
  v_existing public.paiements_fournisseur%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_paid numeric(14,2);
  v_remaining numeric(14,2);
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select profile.role into v_role from public.profiles as profile where profile.id = v_user and profile.is_active;
  if v_role is null or v_role not in ('admin','gestionnaire') then raise exception 'Action non autorisee'; end if;
  if p_idempotency_key is null or p_montant is null or p_montant <= 0 or p_mode_paiement is null then raise exception 'Paiement invalide'; end if;

  select purchase.* into v_purchase from public.achats as purchase where purchase.id = p_achat_id for update;
  if not found then raise exception 'Achat introuvable'; end if;
  if v_purchase.date_reception is null then raise exception 'L''achat doit etre receptionne avant paiement'; end if;
  if v_purchase.statut = 'annule' then raise exception 'Achat annule'; end if;

  select payment.* into v_existing
  from public.paiements_fournisseur as payment
  where payment.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.achat_id <> p_achat_id then raise exception 'Cle d''idempotence deja utilisee'; end if;
    return jsonb_build_object(
      'payment_id',v_existing.id,'achat_id',p_achat_id,'montant_paye',v_purchase.montant_paye,
      'reste_a_payer',v_purchase.reste_a_payer,'idempotent_replay',true
    );
  end if;

  select coalesce(sum(payment.montant),0)
  into v_paid
  from public.paiements_fournisseur as payment
  where payment.achat_id = p_achat_id;

  v_remaining := v_purchase.total - v_purchase.montant_retourne - v_paid;
  if v_remaining <= 0 then raise exception 'Achat deja solde'; end if;
  if p_montant > v_remaining then raise exception 'Montant superieur au reste du'; end if;

  insert into public.paiements_fournisseur(
    id,achat_id,fournisseur_id,montant,mode_paiement,reference,note,idempotency_key,created_by
  ) values(
    v_payment_id,p_achat_id,v_purchase.fournisseur_id,p_montant,p_mode_paiement,
    nullif(trim(p_reference),''),nullif(trim(p_note),''),p_idempotency_key,v_user
  );

  v_paid := v_paid + p_montant;
  v_remaining := v_purchase.total - v_purchase.montant_retourne - v_paid;
  update public.achats as purchase
  set montant_paye = v_paid,
      reste_a_payer = v_remaining,
      statut = case when v_remaining = 0 then 'paye'::public.purchase_status else 'partiellement_paye'::public.purchase_status end
  where purchase.id = p_achat_id;

  return jsonb_build_object(
    'payment_id',v_payment_id,'achat_id',p_achat_id,'montant_paye',v_paid,
    'reste_a_payer',v_remaining,'idempotent_replay',false
  );
exception when unique_violation then
  select payment.* into v_existing
  from public.paiements_fournisseur as payment
  where payment.idempotency_key = p_idempotency_key;
  if found and v_existing.achat_id = p_achat_id then
    select purchase.* into v_purchase from public.achats as purchase where purchase.id = p_achat_id;
    return jsonb_build_object(
      'payment_id',v_existing.id,'achat_id',p_achat_id,'montant_paye',v_purchase.montant_paye,
      'reste_a_payer',v_purchase.reste_a_payer,'idempotent_replay',true
    );
  end if;
  raise;
end $$;

revoke all on function public.add_supplier_payment(uuid,numeric,public.supplier_payment_method,uuid,text,text) from public,anon;
grant execute on function public.add_supplier_payment(uuid,numeric,public.supplier_payment_method,uuid,text,text) to authenticated;

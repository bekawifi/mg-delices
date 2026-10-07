-- MG DELICES - Hotfix 2 post-Etape 7.
-- Uniformise le message de depassement du plafond de credit sans changer la logique metier.

create or replace function public.create_sale(
  p_idempotency_key uuid,
  p_type_commande public.order_type,
  p_remise numeric,
  p_montant_recu numeric,
  p_mode_paiement public.payment_method,
  p_lignes jsonb,
  p_client_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid:=auth.uid();v_role public.app_role;v_existing public.ventes%rowtype;v_client public.clients%rowtype;
  v_sale_id uuid:=gen_random_uuid();v_subtotal numeric(12,2);v_total numeric(12,2);v_paid numeric(12,2);v_remaining numeric(12,2);v_change numeric(12,2);
  v_counter integer;v_numero text;v_payment_status public.sale_payment_status;v_real_debt numeric(14,2);
begin
  if v_user is null then raise exception 'Authentification requise';end if;
  select profile.role into v_role from public.profiles as profile where profile.id=v_user and profile.is_active;
  if v_role is null or v_role not in('admin','gestionnaire','caissier')then raise exception 'Action non autorisee';end if;
  if p_idempotency_key is null then raise exception 'Cle d''idempotence requise';end if;

  select sale.* into v_existing from public.ventes as sale where sale.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.user_id<>v_user then raise exception 'Cle d''idempotence deja utilisee';end if;
    return jsonb_build_object('sale_id',v_existing.id,'numero',v_existing.numero,'total_final',v_existing.total_final,'montant_paye',v_existing.montant_paye,'reste_a_payer',v_existing.reste_a_payer,'montant_recu',v_existing.montant_recu,'monnaie_rendue',v_existing.monnaie_rendue,'statut_paiement',v_existing.statut_paiement,'idempotent_replay',true);
  end if;

  if jsonb_typeof(p_lignes)<>'array' or jsonb_array_length(p_lignes)=0 then raise exception 'Le panier est vide';end if;
  if jsonb_array_length(p_lignes)>100 then raise exception 'Le panier contient trop de lignes';end if;
  if p_remise is null or p_remise<0 or p_montant_recu is null or p_montant_recu<0 then raise exception 'Paiement ou remise invalide';end if;
  if exists(select 1 from jsonb_to_recordset(p_lignes)as item(produit_id uuid,quantite numeric)where item.produit_id is null or item.quantite is null or item.quantite<=0 or item.quantite>1000 or item.quantite<>trunc(item.quantite))then raise exception 'Quantite invalide';end if;
  if exists(select 1 from jsonb_to_recordset(p_lignes)as item(produit_id uuid,quantite integer)left join public.produits as product on product.id=item.produit_id where product.id is null or not product.disponible)then raise exception 'Un produit est introuvable ou indisponible';end if;

  select coalesce(sum(product.prix_vente*item.quantite),0)into v_subtotal
  from jsonb_to_recordset(p_lignes)as item(produit_id uuid,quantite integer)
  join public.produits as product on product.id=item.produit_id;
  if p_remise>v_subtotal then raise exception 'La remise depasse le sous-total';end if;
  v_total:=v_subtotal-p_remise;if v_total<=0 then raise exception 'Le total doit etre superieur a zero';end if;
  v_paid:=least(p_montant_recu,v_total);v_remaining:=v_total-v_paid;v_change:=greatest(p_montant_recu-v_total,0);
  if v_paid>0 and p_mode_paiement is null then raise exception 'Reglement invalide';end if;
  if v_remaining>0 and p_client_id is null then raise exception 'Un client est obligatoire pour une vente a credit';end if;

  if p_client_id is not null then
    select customer.* into v_client from public.clients as customer where customer.id=p_client_id for update;
    if not found or not v_client.actif then raise exception 'Client introuvable ou inactif';end if;
    v_real_debt:=public.calculated_customer_debt(p_client_id);
    update public.clients as customer set encours_credit=v_real_debt where customer.id=p_client_id;
    if v_real_debt+v_remaining>v_client.plafond_credit then raise exception 'Plafond de crédit dépassé.';end if;
  end if;

  v_payment_status:=case when v_remaining=0 then'payee'::public.sale_payment_status when v_paid=0 then'impayee'::public.sale_payment_status else'partiellement_payee'::public.sale_payment_status end;
  insert into public.sale_counters(sale_date,last_value)values(current_date,1)on conflict(sale_date)do update set last_value=public.sale_counters.last_value+1 returning last_value into v_counter;
  v_numero:='MG-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(v_counter::text,4,'0');
  insert into public.ventes(id,numero,idempotency_key,user_id,type_commande,sous_total,remise,total_final,montant_recu,monnaie_rendue,client_id,montant_initial_paye,montant_paye,reste_a_payer,statut_paiement)
  values(v_sale_id,v_numero,p_idempotency_key,v_user,p_type_commande,v_subtotal,p_remise,v_total,p_montant_recu,v_change,p_client_id,v_paid,v_paid,v_remaining,v_payment_status);
  insert into public.lignes_vente(vente_id,produit_id,nom_produit,quantite,prix_unitaire)
  select v_sale_id,product.id,product.nom,sum(item.quantite)::integer,product.prix_vente from jsonb_to_recordset(p_lignes)as item(produit_id uuid,quantite integer)join public.produits as product on product.id=item.produit_id group by product.id,product.nom,product.prix_vente;
  perform public.consume_stock_for_sale(v_sale_id);
  if v_paid>0 then insert into public.paiements(vente_id,mode,montant,idempotency_key,created_by,note)values(v_sale_id,p_mode_paiement,v_paid,p_idempotency_key,v_user,'Paiement initial');end if;
  if p_client_id is not null and v_remaining>0 then update public.clients as customer set encours_credit=v_real_debt+v_remaining where customer.id=p_client_id;end if;
  if v_remaining=0 then perform public.award_sale_loyalty(v_sale_id);end if;
  return jsonb_build_object('sale_id',v_sale_id,'numero',v_numero,'total_final',v_total,'montant_paye',v_paid,'reste_a_payer',v_remaining,'montant_recu',p_montant_recu,'monnaie_rendue',v_change,'statut_paiement',v_payment_status,'idempotent_replay',false);
exception when unique_violation then
  select sale.* into v_existing from public.ventes as sale where sale.idempotency_key=p_idempotency_key;
  if found and v_existing.user_id=v_user then return jsonb_build_object('sale_id',v_existing.id,'numero',v_existing.numero,'total_final',v_existing.total_final,'montant_paye',v_existing.montant_paye,'reste_a_payer',v_existing.reste_a_payer,'montant_recu',v_existing.montant_recu,'monnaie_rendue',v_existing.monnaie_rendue,'statut_paiement',v_existing.statut_paiement,'idempotent_replay',true);end if;
  raise;
end $$;

create or replace function public.checkout_order(
  p_commande_id uuid,p_idempotency_key uuid,p_remise numeric,p_montant_recu numeric,
  p_mode_paiement public.payment_method,p_client_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();v_role public.app_role;v_order public.commandes%rowtype;v_existing public.ventes%rowtype;v_client public.clients%rowtype;
  v_sale_id uuid:=gen_random_uuid();v_subtotal numeric(12,2);v_total numeric(12,2);v_paid numeric(12,2);v_remaining numeric(12,2);v_change numeric(12,2);
  v_counter integer;v_numero text;v_payment_status public.sale_payment_status;v_real_debt numeric(14,2);
begin
  if v_user is null then raise exception 'Authentification requise';end if;
  select profile.role into v_role from public.profiles as profile where profile.id=v_user and profile.is_active;
  if v_role is null or v_role not in('admin','gestionnaire','caissier')then raise exception 'Action non autorisee';end if;
  if p_idempotency_key is null then raise exception 'Cle d''idempotence requise';end if;

  select customer_order.* into v_order from public.commandes as customer_order where customer_order.id=p_commande_id for update;
  if not found then raise exception 'Commande introuvable';end if;
  select sale.* into v_existing from public.ventes as sale where sale.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.commande_id=p_commande_id and v_order.statut='cloturee'then return jsonb_build_object('sale_id',v_existing.id,'numero',v_existing.numero,'total_final',v_existing.total_final,'montant_paye',v_existing.montant_paye,'reste_a_payer',v_existing.reste_a_payer,'monnaie_rendue',v_existing.monnaie_rendue,'statut_paiement',v_existing.statut_paiement,'idempotent_replay',true,'commande_id',p_commande_id);end if;
    raise exception 'Cle d''idempotence deja utilisee';
  end if;
  if v_order.statut='cloturee'then raise exception 'Commande deja encaissee';end if;
  if v_order.statut<>'servie'then raise exception 'La commande doit etre servie avant encaissement';end if;
  if p_remise is null or p_remise<0 or p_montant_recu is null or p_montant_recu<0 then raise exception 'Paiement ou remise invalide';end if;

  select coalesce(sum(order_line.quantite*order_line.prix_unitaire_snapshot),0)into v_subtotal
  from public.lignes_commande as order_line
  where order_line.commande_id=p_commande_id and order_line.statut_cuisine='servie';
  if v_subtotal<=0 then raise exception 'Commande vide';end if;
  if p_remise>v_subtotal then raise exception 'La remise depasse le sous-total';end if;
  v_total:=v_subtotal-p_remise;if v_total<=0 then raise exception 'Le total doit etre superieur a zero';end if;
  v_paid:=least(p_montant_recu,v_total);v_remaining:=v_total-v_paid;v_change:=greatest(p_montant_recu-v_total,0);
  if v_paid>0 and p_mode_paiement is null then raise exception 'Reglement invalide';end if;
  if v_remaining>0 and p_client_id is null then raise exception 'Un client est obligatoire pour une vente a credit';end if;

  if p_client_id is not null then
    select customer.* into v_client from public.clients as customer where customer.id=p_client_id for update;
    if not found or not v_client.actif then raise exception 'Client introuvable ou inactif';end if;
    v_real_debt:=public.calculated_customer_debt(p_client_id);
    update public.clients as customer set encours_credit=v_real_debt where customer.id=p_client_id;
    if v_real_debt+v_remaining>v_client.plafond_credit then raise exception 'Plafond de crédit dépassé.';end if;
  end if;

  v_payment_status:=case when v_remaining=0 then'payee'::public.sale_payment_status when v_paid=0 then'impayee'::public.sale_payment_status else'partiellement_payee'::public.sale_payment_status end;
  insert into public.sale_counters(sale_date,last_value)values(current_date,1)on conflict(sale_date)do update set last_value=public.sale_counters.last_value+1 returning last_value into v_counter;
  v_numero:='MG-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(v_counter::text,4,'0');
  insert into public.ventes(id,numero,idempotency_key,user_id,type_commande,sous_total,remise,total_final,montant_recu,monnaie_rendue,commande_id,client_id,montant_initial_paye,montant_paye,reste_a_payer,statut_paiement)
  values(v_sale_id,v_numero,p_idempotency_key,v_user,v_order.type_commande,v_subtotal,p_remise,v_total,p_montant_recu,v_change,p_commande_id,p_client_id,v_paid,v_paid,v_remaining,v_payment_status);
  insert into public.lignes_vente(vente_id,produit_id,nom_produit,quantite,prix_unitaire,ligne_commande_id)
  select v_sale_id,order_line.produit_id,order_line.nom_produit_snapshot,order_line.quantite,order_line.prix_unitaire_snapshot,order_line.id
  from public.lignes_commande as order_line
  where order_line.commande_id=p_commande_id and order_line.statut_cuisine='servie'
  order by order_line.id;
  perform public.consume_stock_for_sale(v_sale_id);
  if v_paid>0 then insert into public.paiements(vente_id,mode,montant,idempotency_key,created_by,note)values(v_sale_id,p_mode_paiement,v_paid,p_idempotency_key,v_user,'Paiement initial');end if;
  if p_client_id is not null and v_remaining>0 then update public.clients as customer set encours_credit=v_real_debt+v_remaining where customer.id=p_client_id;end if;
  if v_remaining=0 then perform public.award_sale_loyalty(v_sale_id);end if;
  update public.commandes as customer_order set statut='cloturee',closed_at=now()where customer_order.id=p_commande_id;
  insert into public.commande_events(commande_id,event_type,details,actor_id)values(p_commande_id,'commande_encaissee',jsonb_build_object('vente_id',v_sale_id,'reste_a_payer',v_remaining),v_user);
  return jsonb_build_object('sale_id',v_sale_id,'numero',v_numero,'total_final',v_total,'montant_paye',v_paid,'reste_a_payer',v_remaining,'monnaie_rendue',v_change,'statut_paiement',v_payment_status,'idempotent_replay',false,'commande_id',p_commande_id);
end $$;

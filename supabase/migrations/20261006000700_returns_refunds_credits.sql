-- MG DELICES - Étape 7 : retours, remboursements, avoirs et piste d'audit
-- Migration strictement additive aux étapes 1 à 6 validées.

create type public.return_status as enum ('valide');
create type public.refund_method as enum ('especes','orange_money','moov_money','virement','avoir');
create type public.credit_note_status as enum ('ouvert','partiellement_rembourse','rembourse');
create type public.supplier_return_status as enum ('valide');
create type public.sale_correction_status as enum ('active','partiellement_retournee','retournee','annulee');

create table public.correction_counters(
  document_type text not null, document_date date not null, last_value integer not null check(last_value>0),
  primary key(document_type,document_date)
);

alter table public.ventes
  add column montant_retourne numeric(12,2) not null default 0 check(montant_retourne>=0),
  add column statut_correction public.sale_correction_status not null default 'active',
  add column points_fidelite_repris integer not null default 0 check(points_fidelite_repris>=0);
alter table public.ventes drop constraint ventes_reste_coherent_check;
alter table public.ventes drop constraint ventes_statut_paiement_check;
alter table public.ventes add constraint ventes_retour_montant_check check(montant_retourne<=total_final),
  add constraint ventes_points_fidelite_repris_check check(points_fidelite_repris<=points_fidelite_gagnes),
  add constraint ventes_reste_net_check check(reste_a_payer=greatest(total_final-montant_retourne-montant_paye,0)),
  add constraint ventes_statut_paiement_net_check check(
    (statut_paiement='impayee' and montant_paye=0 and reste_a_payer=total_final-montant_retourne)
    or (statut_paiement='partiellement_payee' and montant_paye>0 and reste_a_payer>0)
    or (statut_paiement='payee' and reste_a_payer=0)
  ),
  add constraint ventes_correction_status_check check(
    (statut_correction='active' and montant_retourne=0) or
    (statut_correction='partiellement_retournee' and montant_retourne>0 and montant_retourne<total_final) or
    (statut_correction in('retournee','annulee') and montant_retourne=total_final)
  );

alter table public.achats
  add column montant_retourne numeric(14,2) not null default 0 check(montant_retourne>=0),
  add column total_net numeric(14,2) generated always as (total-montant_retourne) stored;
do $$ declare c record;begin for c in select conname from pg_constraint where conrelid='public.achats'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%reste_a_payer = (total - montant_paye)%' loop execute format('alter table public.achats drop constraint %I',c.conname);end loop;end $$;
alter table public.achats add constraint achats_montant_retourne_check check(montant_retourne<=total),
  add constraint achats_reste_net_check check(reste_a_payer=greatest(total-montant_retourne-montant_paye,0));

create table public.retours_clients(
  id uuid primary key default gen_random_uuid(),numero text not null unique,idempotency_key uuid not null unique,
  vente_id uuid not null references public.ventes(id) on delete restrict,client_id uuid references public.clients(id) on delete restrict,
  statut public.return_status not null default 'valide',est_annulation boolean not null default false,
  stock_reintegrable boolean not null default false,montant numeric(12,2) not null default 0 check(montant>=0),
  motif text not null check(length(trim(motif))>0),created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index retours_clients_vente_idx on public.retours_clients(vente_id,created_at desc);
create index retours_clients_client_idx on public.retours_clients(client_id,created_at desc) where client_id is not null;

create table public.lignes_retour_client(
  id uuid primary key default gen_random_uuid(),retour_id uuid not null references public.retours_clients(id) on delete restrict,
  ligne_vente_id uuid not null references public.lignes_vente(id) on delete restrict,produit_id uuid references public.produits(id) on delete restrict,
  nom_produit_snapshot text not null,quantite integer not null check(quantite>0),prix_unitaire_snapshot numeric(12,2) not null check(prix_unitaire_snapshot>=0),
  montant numeric(12,2) not null check(montant>0),created_at timestamptz not null default now(),unique(retour_id,ligne_vente_id)
);
create index lignes_retour_client_ligne_idx on public.lignes_retour_client(ligne_vente_id);

create table public.avoirs_clients(
  id uuid primary key default gen_random_uuid(),numero text not null unique,vente_id uuid not null references public.ventes(id) on delete restrict,
  retour_id uuid not null references public.retours_clients(id) on delete restrict,client_id uuid references public.clients(id) on delete restrict,
  montant numeric(12,2) not null check(montant>0),montant_disponible numeric(12,2) not null check(montant_disponible>=0),
  statut public.credit_note_status not null default 'ouvert',motif text not null,created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),unique(retour_id),check(montant_disponible<=montant)
);
create index avoirs_clients_client_idx on public.avoirs_clients(client_id,created_at desc);

create table public.remboursements_clients(
  id uuid primary key default gen_random_uuid(),numero text not null unique,idempotency_key uuid not null unique,
  vente_id uuid not null references public.ventes(id) on delete restrict,retour_id uuid not null references public.retours_clients(id) on delete restrict,
  avoir_id uuid not null references public.avoirs_clients(id) on delete restrict,client_id uuid references public.clients(id) on delete restrict,
  montant numeric(12,2) not null check(montant>0),mode public.refund_method not null,
  reference text,motif text not null check(length(trim(motif))>0),created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index remboursements_clients_vente_idx on public.remboursements_clients(vente_id,created_at desc);

create table public.retours_fournisseurs(
  id uuid primary key default gen_random_uuid(),numero text not null unique,idempotency_key uuid not null unique,
  achat_id uuid not null references public.achats(id) on delete restrict,fournisseur_id uuid not null references public.fournisseurs(id) on delete restrict,
  statut public.supplier_return_status not null default 'valide',montant numeric(14,2) not null default 0 check(montant>=0),
  motif text not null check(length(trim(motif))>0),created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index retours_fournisseurs_achat_idx on public.retours_fournisseurs(achat_id,created_at desc);

create table public.lignes_retour_fournisseur(
  id uuid primary key default gen_random_uuid(),retour_id uuid not null references public.retours_fournisseurs(id) on delete restrict,
  ligne_achat_id uuid not null references public.lignes_achat(id) on delete restrict,matiere_premiere_id uuid not null references public.matieres_premieres(id) on delete restrict,
  nom_matiere_snapshot text not null,unite_snapshot text not null,quantite numeric(18,6) not null check(quantite>0),
  cout_unitaire_snapshot numeric(18,4) not null check(cout_unitaire_snapshot>=0),montant numeric(14,2) not null check(montant>0),
  created_at timestamptz not null default now(),unique(retour_id,ligne_achat_id)
);
create index lignes_retour_fournisseur_ligne_idx on public.lignes_retour_fournisseur(ligne_achat_id);

create table public.avoirs_fournisseurs(
  id uuid primary key default gen_random_uuid(),numero text not null unique,achat_id uuid not null references public.achats(id) on delete restrict,
  retour_id uuid not null references public.retours_fournisseurs(id) on delete restrict,fournisseur_id uuid not null references public.fournisseurs(id) on delete restrict,
  montant numeric(14,2) not null check(montant>0),montant_disponible numeric(14,2) not null check(montant_disponible>=0),
  statut public.credit_note_status not null default 'ouvert',motif text not null,created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),unique(retour_id),check(montant_disponible<=montant)
);
create index avoirs_fournisseurs_fournisseur_idx on public.avoirs_fournisseurs(fournisseur_id,created_at desc);

create table public.journal_corrections(
  id uuid primary key default gen_random_uuid(),type_operation text not null,document_source_type text not null,document_source_id uuid not null,
  document_correction_type text not null,document_correction_id uuid not null,motif text not null,
  details jsonb not null default '{}'::jsonb,created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now()
);
create index journal_corrections_source_idx on public.journal_corrections(document_source_type,document_source_id,created_at desc);

alter table public.lignes_vente add column ligne_commande_id uuid unique references public.lignes_commande(id) on delete restrict;

-- Ventilation physique exacte, creee dans la transaction de validation de la vente.
-- Aucune donnee ancienne n'est reconstruite retrospectivement.
create table public.ligne_vente_stock_snapshot(
  ligne_vente_id uuid not null references public.lignes_vente(id) on delete restrict,
  matiere_premiere_id uuid not null references public.matieres_premieres(id) on delete restrict,
  quantite_consommee numeric(18,6) not null check(quantite_consommee>0),
  cout_unitaire_snapshot numeric(18,4) not null check(cout_unitaire_snapshot>=0),
  mouvement_stock_id uuid references public.mouvements_stock(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(ligne_vente_id,matiere_premiere_id)
);
create index ligne_vente_stock_snapshot_matiere_idx on public.ligne_vente_stock_snapshot(matiere_premiere_id);

create table public.ligne_retour_stock_reprise(
  ligne_retour_client_id uuid not null references public.lignes_retour_client(id) on delete restrict,
  ligne_vente_id uuid not null,
  matiere_premiere_id uuid not null,
  quantite_reintegree numeric(18,6) not null check(quantite_reintegree>0),
  cout_unitaire_snapshot numeric(18,4) not null check(cout_unitaire_snapshot>=0),
  created_at timestamptz not null default now(),
  primary key(ligne_retour_client_id,matiere_premiere_id),
  foreign key(ligne_vente_id,matiere_premiere_id)
    references public.ligne_vente_stock_snapshot(ligne_vente_id,matiere_premiere_id) on delete restrict
);
create index ligne_retour_stock_reprise_source_idx on public.ligne_retour_stock_reprise(ligne_vente_id,matiere_premiere_id);

create function public.prevent_sale_stock_snapshot_mutation() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'Un snapshot stock de vente est immuable';end$$;
create trigger ligne_vente_stock_snapshot_immutable before update or delete on public.ligne_vente_stock_snapshot
for each row execute function public.prevent_sale_stock_snapshot_mutation();
create trigger ligne_retour_stock_reprise_immutable before update or delete on public.ligne_retour_stock_reprise
for each row execute function public.prevent_sale_stock_snapshot_mutation();
revoke all on function public.prevent_sale_stock_snapshot_mutation() from public,anon,authenticated;

alter table public.ligne_vente_stock_snapshot enable row level security;
alter table public.ligne_retour_stock_reprise enable row level security;
create policy ligne_vente_stock_snapshot_read on public.ligne_vente_stock_snapshot for select to authenticated
using(public.current_user_is_active() and public.current_user_role() in('admin','gestionnaire','caissier','serveur'));
create policy ligne_retour_stock_reprise_read on public.ligne_retour_stock_reprise for select to authenticated
using(public.current_user_is_active() and public.current_user_role() in('admin','gestionnaire','caissier','serveur'));
grant select on public.ligne_vente_stock_snapshot,public.ligne_retour_stock_reprise to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.ligne_vente_stock_snapshot,public.ligne_retour_stock_reprise from public,anon,authenticated;

-- Remplace le moteur precedent sans changer son contrat. Les mouvements restent
-- agreges par vente/matiere, tandis que leur ventilation exacte est conservee.
create or replace function public.consume_stock_for_sale(p_vente_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_role public.app_role;v_commande_id uuid;v_need record;v_m public.matieres_premieres%rowtype;v_move uuid;v_after numeric(18,6);
begin
  if v_user is null then raise exception 'Authentification requise';end if;
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_role is null or v_role not in('admin','gestionnaire','caissier','serveur')then raise exception 'Action non autorisee';end if;
  select commande_id into v_commande_id from public.ventes where id=p_vente_id and statut='payee';
  if not found then raise exception 'Vente validee introuvable';end if;
  if exists(select 1 from public.ligne_vente_stock_snapshot s join public.lignes_vente lv on lv.id=s.ligne_vente_id where lv.vente_id=p_vente_id)then
    if exists(select 1 from public.mouvements_stock where reference_type='vente'and reference_id=p_vente_id)then return;end if;
    raise exception 'Snapshot stock incomplet pour cette vente';
  end if;
  -- Un mouvement sans ventilation appartient a une vente historique. Il ne doit
  -- jamais etre ventile a posteriori depuis une recette potentiellement modifiee.
  if exists(select 1 from public.mouvements_stock where reference_type='vente'and reference_id=p_vente_id)then return;end if;
  if v_commande_id is null then
    for v_need in select distinct m.id from public.lignes_vente lv join public.recettes r on r.produit_id=lv.produit_id and r.actif join public.recette_ingredients ri on ri.recette_id=r.id join public.matieres_premieres m on m.id=ri.matiere_premiere_id where lv.vente_id=p_vente_id order by m.id loop
      perform 1 from public.matieres_premieres where id=v_need.id for update;
    end loop;
    insert into public.ligne_vente_stock_snapshot(ligne_vente_id,matiere_premiere_id,quantite_consommee,cout_unitaire_snapshot)
    select lv.id,ri.matiere_premiere_id,round(lv.quantite*ri.quantite/r.rendement_quantite,6),m.cout_unitaire_moyen
    from public.lignes_vente lv join public.recettes r on r.produit_id=lv.produit_id and r.actif
    join public.recette_ingredients ri on ri.recette_id=r.id join public.matieres_premieres m on m.id=ri.matiere_premiere_id
    where lv.vente_id=p_vente_id and round(lv.quantite*ri.quantite/r.rendement_quantite,6)>0;
  else
    if exists(select 1 from public.lignes_commande where commande_id=v_commande_id and statut_cuisine='servie'and recette_snapshotted_at is null)then raise exception 'Snapshot matiere manquant pour une ligne de commande';end if;
    for v_need in select distinct s.matiere_premiere_id id from public.commande_ligne_ingredients_snapshot s join public.lignes_commande lc on lc.id=s.ligne_commande_id where lc.commande_id=v_commande_id and lc.statut_cuisine='servie' order by s.matiere_premiere_id loop
      perform 1 from public.matieres_premieres where id=v_need.id for update;
    end loop;
    insert into public.ligne_vente_stock_snapshot(ligne_vente_id,matiere_premiere_id,quantite_consommee,cout_unitaire_snapshot)
    select lv.id,s.matiere_premiere_id,round(sum(s.quantite_totale),6),
      round(sum(s.quantite_totale*s.cout_unitaire_snapshot)/nullif(sum(s.quantite_totale),0),4)
    from public.lignes_vente lv join public.lignes_commande lc on lc.id=lv.ligne_commande_id and lc.commande_id=v_commande_id and lc.statut_cuisine='servie'
    join public.commande_ligne_ingredients_snapshot s on s.ligne_commande_id=lc.id
    where lv.vente_id=p_vente_id group by lv.id,s.matiere_premiere_id having sum(s.quantite_totale)>0;
  end if;
  for v_need in select s.matiere_premiere_id,sum(s.quantite_consommee)::numeric(18,6) necessaire,
      round(sum(s.quantite_consommee*s.cout_unitaire_snapshot)/sum(s.quantite_consommee),4) cout
    from public.ligne_vente_stock_snapshot s join public.lignes_vente lv on lv.id=s.ligne_vente_id
    where lv.vente_id=p_vente_id group by s.matiere_premiere_id order by s.matiere_premiere_id
  loop
    select * into v_m from public.matieres_premieres where id=v_need.matiere_premiere_id for update;
    if not found then raise exception 'Matiere premiere de recette introuvable';end if;
    if v_m.stock_actuel<v_need.necessaire then raise exception 'Stock insuffisant : %. Disponible : %, necessaire : %.',v_m.nom,v_m.stock_actuel,v_need.necessaire;end if;
    v_after:=v_m.stock_actuel-v_need.necessaire;v_move:=gen_random_uuid();
    update public.matieres_premieres set stock_actuel=v_after where id=v_m.id;
    insert into public.mouvements_stock(id,matiere_premiere_id,type_mouvement,quantite,stock_avant,stock_apres,cout_unitaire_snapshot,reference_type,reference_id,note,created_by)
    values(v_move,v_m.id,'vente',-v_need.necessaire,v_m.stock_actuel,v_after,v_need.cout,'vente',p_vente_id,'Consommation automatique ventilee',v_user);
  end loop;
end$$;
revoke all on function public.consume_stock_for_sale(uuid) from public,anon,authenticated;

create function public.restore_stock_for_customer_return(p_retour_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_return public.retours_clients%rowtype;v_sale public.ventes%rowtype;v_item record;v_need record;v_m public.matieres_premieres%rowtype;v_after numeric(18,6);
begin
  select * into v_return from public.retours_clients where id=p_retour_id;
  if not found or not v_return.stock_reintegrable then return;end if;
  select * into v_sale from public.ventes where id=v_return.vente_id;
  if exists(select 1 from public.mouvements_stock where reference_type='vente'and reference_id=v_sale.id)
    and not exists(select 1 from public.ligne_vente_stock_snapshot s join public.lignes_vente lv on lv.id=s.ligne_vente_id where lv.vente_id=v_sale.id)then
    raise exception 'Le stock de cette ancienne vente ne peut pas etre reintegre automatiquement. Effectuez le retour sans reprise stock ou utilisez un ajustement de stock controle.';
  end if;
  for v_item in
    select lrc.id ligne_retour_client_id,lrc.ligne_vente_id,s.matiere_premiere_id,s.quantite_consommee,s.cout_unitaire_snapshot,lv.quantite quantite_vendue,
      coalesce((select sum(x.quantite)from public.lignes_retour_client x join public.retours_clients r on r.id=x.retour_id where x.ligne_vente_id=lrc.ligne_vente_id),0) quantite_retournee,
      coalesce((select sum(rr.quantite_reintegree)from public.ligne_retour_stock_reprise rr where rr.ligne_vente_id=lrc.ligne_vente_id and rr.matiere_premiere_id=s.matiere_premiere_id),0) deja_reintegre
    from public.lignes_retour_client lrc join public.lignes_vente lv on lv.id=lrc.ligne_vente_id
    join public.ligne_vente_stock_snapshot s on s.ligne_vente_id=lv.id where lrc.retour_id=p_retour_id
    order by s.matiere_premiere_id,lrc.id
  loop
    v_item.quantite_consommee:=round(v_item.quantite_consommee*v_item.quantite_retournee/v_item.quantite_vendue,6)-v_item.deja_reintegre;
    if v_item.quantite_consommee>0 then
      insert into public.ligne_retour_stock_reprise(ligne_retour_client_id,ligne_vente_id,matiere_premiere_id,quantite_reintegree,cout_unitaire_snapshot)
      values(v_item.ligne_retour_client_id,v_item.ligne_vente_id,v_item.matiere_premiere_id,v_item.quantite_consommee,v_item.cout_unitaire_snapshot);
    end if;
  end loop;
  for v_need in select matiere_premiere_id,sum(quantite_reintegree)::numeric(18,6) quantite,
      round(sum(quantite_reintegree*cout_unitaire_snapshot)/sum(quantite_reintegree),4) cout
    from public.ligne_retour_stock_reprise rr join public.lignes_retour_client lrc on lrc.id=rr.ligne_retour_client_id
    where lrc.retour_id=p_retour_id group by matiere_premiere_id order by matiere_premiere_id
  loop
    select * into v_m from public.matieres_premieres where id=v_need.matiere_premiere_id for update;v_after:=v_m.stock_actuel+v_need.quantite;
    update public.matieres_premieres set stock_actuel=v_after where id=v_m.id;
    insert into public.mouvements_stock(matiere_premiere_id,type_mouvement,quantite,stock_avant,stock_apres,cout_unitaire_snapshot,reference_type,reference_id,note,created_by)
    values(v_m.id,'ajustement_positif',v_need.quantite,v_m.stock_actuel,v_after,v_need.cout,'retour_client',p_retour_id,'Reprise exacte depuis snapshot ligne de vente '||v_sale.numero,v_user);
  end loop;
end$$;
revoke all on function public.restore_stock_for_customer_return(uuid) from public,anon,authenticated;

-- Une ligne de commande servie devient une ligne de vente distincte afin de
-- conserver sans ambiguite son snapshot matiere historique.
create or replace function public.checkout_order(
  p_commande_id uuid,p_idempotency_key uuid,p_remise numeric,p_montant_recu numeric,
  p_mode_paiement public.payment_method,p_client_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.app_role;o public.commandes%rowtype;e public.ventes%rowtype;c public.clients%rowtype;
  sid uuid:=gen_random_uuid();subtotal numeric(12,2);total numeric(12,2);paid numeric(12,2);remaining numeric(12,2);change_due numeric(12,2);
  counter integer;v_number text;payment_status public.sale_payment_status;debt numeric(14,2);
begin
  if u is null then raise exception 'Authentification requise';end if;select role into r from public.profiles where id=u and is_active;
  if r is null or r not in('admin','gestionnaire','caissier')then raise exception 'Action non autorisee';end if;
  if p_idempotency_key is null then raise exception 'Cle d''idempotence requise';end if;
  select * into o from public.commandes where id=p_commande_id for update;if not found then raise exception 'Commande introuvable';end if;
  select * into e from public.ventes where idempotency_key=p_idempotency_key;
  if found then if e.commande_id=p_commande_id and o.statut='cloturee'then return jsonb_build_object('sale_id',e.id,'numero',e.numero,'total_final',e.total_final,'montant_paye',e.montant_paye,'reste_a_payer',e.reste_a_payer,'monnaie_rendue',e.monnaie_rendue,'statut_paiement',e.statut_paiement,'idempotent_replay',true,'commande_id',p_commande_id);end if;raise exception 'Cle d''idempotence deja utilisee';end if;
  if o.statut='cloturee'then raise exception 'Commande deja encaissee';end if;if o.statut<>'servie'then raise exception 'La commande doit etre servie avant encaissement';end if;
  if p_remise is null or p_remise<0 or p_montant_recu is null or p_montant_recu<0 then raise exception 'Paiement ou remise invalide';end if;
  select coalesce(sum(quantite*prix_unitaire_snapshot),0)into subtotal from public.lignes_commande where commande_id=p_commande_id and statut_cuisine='servie';
  if subtotal<=0 then raise exception 'Commande vide';end if;if p_remise>subtotal then raise exception 'La remise depasse le sous-total';end if;
  total:=subtotal-p_remise;if total<=0 then raise exception 'Le total doit etre superieur a zero';end if;paid:=least(p_montant_recu,total);remaining:=total-paid;change_due:=greatest(p_montant_recu-total,0);
  if paid>0 and p_mode_paiement is null then raise exception 'Reglement invalide';end if;if remaining>0 and p_client_id is null then raise exception 'Un client est obligatoire pour une vente a credit';end if;
  if p_client_id is not null then select * into c from public.clients where id=p_client_id for update;if not found or not c.actif then raise exception 'Client introuvable ou inactif';end if;debt:=public.calculated_customer_debt(p_client_id);update public.clients set encours_credit=debt where id=p_client_id;if debt+remaining>c.plafond_credit then raise exception 'Plafond de credit depasse';end if;end if;
  payment_status:=case when remaining=0 then'payee'::public.sale_payment_status when paid=0 then'impayee'::public.sale_payment_status else'partiellement_payee'::public.sale_payment_status end;
  insert into public.sale_counters(sale_date,last_value)values(current_date,1)on conflict(sale_date)do update set last_value=public.sale_counters.last_value+1 returning last_value into counter;
  v_number:='MG-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(counter::text,4,'0');
  insert into public.ventes(id,numero,idempotency_key,user_id,type_commande,sous_total,remise,total_final,montant_recu,monnaie_rendue,commande_id,client_id,montant_initial_paye,montant_paye,reste_a_payer,statut_paiement)
  values(sid,v_number,p_idempotency_key,u,o.type_commande,subtotal,p_remise,total,p_montant_recu,change_due,p_commande_id,p_client_id,paid,paid,remaining,payment_status);
  insert into public.lignes_vente(vente_id,produit_id,nom_produit,quantite,prix_unitaire,ligne_commande_id)
  select sid,produit_id,nom_produit_snapshot,quantite,prix_unitaire_snapshot,id from public.lignes_commande where commande_id=p_commande_id and statut_cuisine='servie' order by id;
  perform public.consume_stock_for_sale(sid);
  if paid>0 then insert into public.paiements(vente_id,mode,montant,idempotency_key,created_by,note)values(sid,p_mode_paiement,paid,p_idempotency_key,u,'Paiement initial');end if;
  if p_client_id is not null and remaining>0 then update public.clients set encours_credit=debt+remaining where id=p_client_id;end if;if remaining=0 then perform public.award_sale_loyalty(sid);end if;
  update public.commandes set statut='cloturee',closed_at=now()where id=p_commande_id;insert into public.commande_events(commande_id,event_type,details,actor_id)values(p_commande_id,'commande_encaissee',jsonb_build_object('vente_id',sid,'reste_a_payer',remaining),u);
  return jsonb_build_object('sale_id',sid,'numero',v_number,'total_final',total,'montant_paye',paid,'reste_a_payer',remaining,'monnaie_rendue',change_due,'statut_paiement',payment_status,'idempotent_replay',false,'commande_id',p_commande_id);
end$$;

alter table public.mouvements_fidelite add column retour_client_id uuid references public.retours_clients(id) on delete restrict;
create unique index mouvements_fidelite_retour_unique_idx on public.mouvements_fidelite(retour_client_id) where retour_client_id is not null;
create unique index mouvements_stock_retour_client_matiere_idx on public.mouvements_stock(reference_id,matiere_premiere_id) where reference_type='retour_client';
create unique index mouvements_stock_retour_fournisseur_matiere_idx on public.mouvements_stock(reference_id,matiere_premiere_id) where reference_type='retour_fournisseur';
create unique index mouvements_caisse_remboursement_client_idx on public.mouvements_caisse(reference_id) where reference_type='remboursement_client';

create function public.prevent_correction_mutation()returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and tg_table_name in('retours_clients','retours_fournisseurs')
    and (to_jsonb(old)->>'montant')::numeric=0
    and (to_jsonb(new)->>'montant')::numeric>0
    and (to_jsonb(new)-'montant')=(to_jsonb(old)-'montant') then return new;
  end if;
  raise exception 'Un document correctif valide est immuable';
end$$;
create trigger retours_clients_immutable before update or delete on public.retours_clients for each row execute function public.prevent_correction_mutation();
create trigger lignes_retour_client_immutable before update or delete on public.lignes_retour_client for each row execute function public.prevent_correction_mutation();
create trigger remboursements_clients_immutable before update or delete on public.remboursements_clients for each row execute function public.prevent_correction_mutation();
create trigger retours_fournisseurs_immutable before update or delete on public.retours_fournisseurs for each row execute function public.prevent_correction_mutation();
create trigger lignes_retour_fournisseur_immutable before update or delete on public.lignes_retour_fournisseur for each row execute function public.prevent_correction_mutation();
create trigger journal_corrections_immutable before update or delete on public.journal_corrections for each row execute function public.prevent_correction_mutation();
revoke all on function public.prevent_correction_mutation()from public,anon,authenticated;

alter table public.correction_counters enable row level security;
alter table public.retours_clients enable row level security;alter table public.lignes_retour_client enable row level security;
alter table public.remboursements_clients enable row level security;alter table public.avoirs_clients enable row level security;
alter table public.retours_fournisseurs enable row level security;alter table public.lignes_retour_fournisseur enable row level security;
alter table public.avoirs_fournisseurs enable row level security;alter table public.journal_corrections enable row level security;
create policy retours_clients_read on public.retours_clients for select to authenticated using(public.current_user_is_active()and public.current_user_role()in('admin','gestionnaire','caissier','serveur'));
create policy lignes_retour_client_read on public.lignes_retour_client for select to authenticated using(public.current_user_is_active()and public.current_user_role()in('admin','gestionnaire','caissier','serveur'));
create policy remboursements_clients_read on public.remboursements_clients for select to authenticated using(public.current_user_is_active()and public.current_user_role()in('admin','gestionnaire','caissier'));
create policy avoirs_clients_read on public.avoirs_clients for select to authenticated using(public.current_user_is_active()and public.current_user_role()in('admin','gestionnaire','caissier'));
create policy retours_fournisseurs_read on public.retours_fournisseurs for select to authenticated using(public.current_user_is_active()and public.current_user_role()in('admin','gestionnaire'));
create policy lignes_retour_fournisseur_read on public.lignes_retour_fournisseur for select to authenticated using(public.current_user_is_active()and public.current_user_role()in('admin','gestionnaire'));
create policy avoirs_fournisseurs_read on public.avoirs_fournisseurs for select to authenticated using(public.current_user_is_active()and public.current_user_role()in('admin','gestionnaire'));
create policy journal_corrections_read on public.journal_corrections for select to authenticated using(public.current_user_is_active()and public.current_user_role()in('admin','gestionnaire'));
grant select on public.retours_clients,public.lignes_retour_client,public.remboursements_clients,public.avoirs_clients,public.retours_fournisseurs,public.lignes_retour_fournisseur,public.avoirs_fournisseurs,public.journal_corrections to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.retours_clients,public.lignes_retour_client,public.remboursements_clients,public.avoirs_clients,public.retours_fournisseurs,public.lignes_retour_fournisseur,public.avoirs_fournisseurs,public.journal_corrections from public,anon,authenticated;
revoke all on public.correction_counters from public,anon,authenticated;

create function public.next_correction_number(p_type text,p_prefix text)returns text language plpgsql security definer set search_path='' as $$declare n integer;begin insert into public.correction_counters(document_type,document_date,last_value)values(p_type,current_date,1)on conflict(document_type,document_date)do update set last_value=public.correction_counters.last_value+1 returning last_value into n;return p_prefix||'-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(n::text,4,'0');end$$;
revoke all on function public.next_correction_number(text,text)from public,anon,authenticated;

create or replace function public.calculated_customer_debt(p_client_id uuid)returns numeric language sql stable security definer set search_path='' as $$
select coalesce(sum(greatest(v.total_final-v.montant_retourne-coalesce((select sum(p.montant)from public.paiements p where p.vente_id=v.id),0),0)),0)from public.ventes v where v.client_id=p_client_id and v.statut<>'annulee'$$;

create function public.create_customer_return(p_vente_id uuid,p_lignes jsonb,p_stock_reintegrable boolean,p_motif text,p_idempotency_key uuid,p_est_annulation boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.app_role;v public.ventes%rowtype;existing public.retours_clients%rowtype;rid uuid:=gen_random_uuid();num text;item record;line public.lignes_vente%rowtype;qret integer;amt numeric(12,2):=0;lineamt numeric(12,2);paid numeric(12,2);oldnet numeric(12,2);newnet numeric(12,2);oldover numeric(12,2);newover numeric(12,2);creditdelta numeric(12,2);creditid uuid;creditnum text;ms record;m public.matieres_premieres%rowtype;back numeric(18,6);targetpoints integer;currentpoints integer;pointdelta integer;
begin
 if u is null then raise exception 'Authentification requise';end if;select role into r from public.profiles where id=u and is_active;if r is null or r not in('admin','gestionnaire')then raise exception 'Action non autorisée';end if;
 if p_idempotency_key is null or nullif(trim(p_motif),'')is null then raise exception 'Motif obligatoire';end if;select * into existing from public.retours_clients where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('retour_id',existing.id,'numero',existing.numero,'montant',existing.montant,'idempotent_replay',true);end if;
 if jsonb_typeof(p_lignes)<>'array'or jsonb_array_length(p_lignes)=0 then raise exception 'Aucune ligne à retourner';end if;
 if(select count(*)from jsonb_to_recordset(p_lignes)x(ligne_vente_id uuid,quantite integer))<>(select count(distinct ligne_vente_id)from jsonb_to_recordset(p_lignes)x(ligne_vente_id uuid,quantite integer))then raise exception 'Ligne de retour en double';end if;
 select * into v from public.ventes where id=p_vente_id for update;if not found then raise exception 'Vente introuvable';end if;
 select * into existing from public.retours_clients where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('retour_id',existing.id,'numero',existing.numero,'montant',existing.montant,'idempotent_replay',true);end if;
 if v.statut_correction in('retournee','annulee')then raise exception 'Vente déjà annulée ou totalement retournée';end if;
 num:=public.next_correction_number('retour_client','RET');insert into public.retours_clients(id,numero,idempotency_key,vente_id,client_id,est_annulation,stock_reintegrable,montant,motif,created_by)values(rid,num,p_idempotency_key,v.id,v.client_id,coalesce(p_est_annulation,false),coalesce(p_stock_reintegrable,false),0,trim(p_motif),u);
 for item in select * from jsonb_to_recordset(p_lignes)x(ligne_vente_id uuid,quantite integer)loop
  if item.quantite is null or item.quantite<=0 then raise exception 'Quantité de retour invalide';end if;
  select * into line from public.lignes_vente where id=item.ligne_vente_id and vente_id=v.id for update;if not found then raise exception 'Produit absent de la vente';end if;
  select coalesce(sum(lrc.quantite),0)into qret from public.lignes_retour_client lrc join public.retours_clients rc on rc.id=lrc.retour_id where lrc.ligne_vente_id=line.id;
  if qret>=line.quantite then raise exception 'Cette ligne a déjà été totalement retournée.';end if;if qret+item.quantite>line.quantite then raise exception 'Quantité retournée supérieure à la quantité vendue.';end if;
  lineamt:=round(item.quantite*line.prix_unitaire*v.total_final/nullif(v.sous_total,0),2);if lineamt<=0 then raise exception 'Montant de retour invalide';end if;amt:=amt+lineamt;
  insert into public.lignes_retour_client(retour_id,ligne_vente_id,produit_id,nom_produit_snapshot,quantite,prix_unitaire_snapshot,montant)values(rid,line.id,line.produit_id,line.nom_produit,item.quantite,line.prix_unitaire,lineamt);
 end loop;
 if v.montant_retourne+amt>v.total_final then amt:=v.total_final-v.montant_retourne;end if;update public.retours_clients set montant=amt where id=rid;
 if p_stock_reintegrable then perform public.restore_stock_for_customer_return(rid);end if;
 select coalesce(sum(montant),0)into paid from public.paiements where vente_id=v.id;oldnet:=v.total_final-v.montant_retourne;newnet:=oldnet-amt;oldover:=greatest(paid-oldnet,0);newover:=greatest(paid-newnet,0);creditdelta:=newover-oldover;
 update public.ventes set montant_retourne=montant_retourne+amt,reste_a_payer=greatest(newnet-paid,0),statut_paiement=case when greatest(newnet-paid,0)=0 then 'payee'::public.sale_payment_status when paid=0 then 'impayee'::public.sale_payment_status else 'partiellement_payee'::public.sale_payment_status end,statut_correction=case when montant_retourne+amt>=total_final then case when p_est_annulation then 'annulee'::public.sale_correction_status else 'retournee'::public.sale_correction_status end else 'partiellement_retournee'::public.sale_correction_status end where id=v.id;
 if v.client_id is not null then update public.clients set encours_credit=public.calculated_customer_debt(v.client_id)where id=v.client_id;end if;
 if creditdelta>0 then creditid:=gen_random_uuid();creditnum:=public.next_correction_number('avoir_client','AVC');insert into public.avoirs_clients(id,numero,vente_id,retour_id,client_id,montant,montant_disponible,motif,created_by)values(creditid,creditnum,v.id,rid,v.client_id,creditdelta,creditdelta,'Trop-perçu après retour '||num,u);end if;
 currentpoints:=greatest(v.points_fidelite_gagnes-v.points_fidelite_repris,0);targetpoints:=floor(newnet/1000)::integer;pointdelta:=greatest(currentpoints-targetpoints,0);
 if pointdelta>0 and v.client_id is not null then update public.clients set points_fidelite=greatest(points_fidelite-pointdelta,0)where id=v.client_id;update public.ventes set points_fidelite_repris=points_fidelite_repris+pointdelta where id=v.id;insert into public.mouvements_fidelite(client_id,vente_id,type_mouvement,points,solde_apres,note,created_by,retour_client_id)select v.client_id,v.id,'ajustement',-pointdelta,points_fidelite,'Reprise fidélité '||num,u,rid from public.clients where id=v.client_id;end if;
 insert into public.journal_corrections(type_operation,document_source_type,document_source_id,document_correction_type,document_correction_id,motif,details,created_by)values(case when p_est_annulation then 'annulation_vente'else'retour_client'end,'vente',v.id,'retour_client',rid,trim(p_motif),jsonb_build_object('montant',amt,'stock_reintegre',p_stock_reintegrable,'avoir_id',creditid),u);
 return jsonb_build_object('retour_id',rid,'numero',num,'montant',amt,'avoir_id',creditid,'montant_avoir',creditdelta,'idempotent_replay',false);
end$$;

create function public.refund_customer(p_avoir_id uuid,p_montant numeric,p_mode public.refund_method,p_motif text,p_idempotency_key uuid,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.app_role;a public.avoirs_clients%rowtype;existing public.remboursements_clients%rowtype;rid uuid:=gen_random_uuid();num text;sessionid uuid;remaining numeric(12,2);
begin if u is null then raise exception 'Authentification requise';end if;select role into r from public.profiles where id=u and is_active;if r is null or r not in('admin','gestionnaire')then raise exception 'Action non autorisée';end if;if p_idempotency_key is null or p_montant is null or p_montant<=0 or nullif(trim(p_motif),'')is null then raise exception 'Remboursement invalide';end if;
 select * into existing from public.remboursements_clients where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('remboursement_id',existing.id,'numero',existing.numero,'idempotent_replay',true);end if;
 select * into a from public.avoirs_clients where id=p_avoir_id for update;if not found then raise exception 'Avoir client introuvable';end if;
 select * into existing from public.remboursements_clients where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('remboursement_id',existing.id,'numero',existing.numero,'idempotent_replay',true);end if;
 if p_montant>a.montant_disponible then raise exception 'Aucun montant remboursable.';end if;
 if p_mode='avoir'then return jsonb_build_object('avoir_id',a.id,'numero',a.numero,'montant_disponible',a.montant_disponible,'idempotent_replay',false);end if;
 if p_mode='especes'then select id into sessionid from public.sessions_caisse where statut='ouverte'for update;if not found then raise exception 'Caisse fermée pour remboursement espèces.';end if;end if;
 num:=public.next_correction_number('remboursement_client','RMB');insert into public.remboursements_clients(id,numero,idempotency_key,vente_id,retour_id,avoir_id,client_id,montant,mode,reference,motif,created_by)values(rid,num,p_idempotency_key,a.vente_id,a.retour_id,a.id,a.client_id,p_montant,p_mode,nullif(trim(p_reference),''),trim(p_motif),u);
 remaining:=a.montant_disponible-p_montant;update public.avoirs_clients set montant_disponible=remaining,statut=case when remaining=0 then 'rembourse'::public.credit_note_status else 'partiellement_rembourse'::public.credit_note_status end where id=a.id;
 if p_mode='especes'then insert into public.mouvements_caisse(session_caisse_id,type_mouvement,sens,montant,reference_type,reference_id,libelle,created_by)values(sessionid,'sortie_manuelle','sortie',p_montant,'remboursement_client',rid,'Remboursement '||num,u);end if;
 insert into public.journal_corrections(type_operation,document_source_type,document_source_id,document_correction_type,document_correction_id,motif,details,created_by)values('remboursement_client','avoir_client',a.id,'remboursement_client',rid,trim(p_motif),jsonb_build_object('montant',p_montant,'mode',p_mode),u);
 return jsonb_build_object('remboursement_id',rid,'numero',num,'montant',p_montant,'reste_avoir',remaining,'idempotent_replay',false);
end$$;

create function public.cancel_sale(p_vente_id uuid,p_motif text,p_politique_stock text,p_politique_remboursement public.refund_method,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;lines jsonb;credit uuid;amount numeric;begin
 select coalesce(jsonb_agg(jsonb_build_object('ligne_vente_id',lv.id,'quantite',lv.quantite-coalesce((select sum(lrc.quantite)from public.lignes_retour_client lrc join public.retours_clients rc on rc.id=lrc.retour_id where lrc.ligne_vente_id=lv.id),0))),'[]'::jsonb)into lines from public.lignes_vente lv where lv.vente_id=p_vente_id and lv.quantite>coalesce((select sum(lrc.quantite)from public.lignes_retour_client lrc join public.retours_clients rc on rc.id=lrc.retour_id where lrc.ligne_vente_id=lv.id),0);
 result:=public.create_customer_return(p_vente_id,lines,p_politique_stock='reintegrer',p_motif,p_idempotency_key,true);credit:=(result->>'avoir_id')::uuid;amount:=coalesce((result->>'montant_avoir')::numeric,0);
 if credit is not null and amount>0 and p_politique_remboursement<>'avoir'then perform public.refund_customer(credit,amount,p_politique_remboursement,p_motif,gen_random_uuid(),null);end if;return result;
end$$;

create function public.create_supplier_return(p_achat_id uuid,p_lignes jsonb,p_motif text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.app_role;a public.achats%rowtype;existing public.retours_fournisseurs%rowtype;rid uuid:=gen_random_uuid();num text;item record;line public.lignes_achat%rowtype;qret numeric(18,6);amt numeric(14,2):=0;lineamt numeric(14,2);m public.matieres_premieres%rowtype;paid numeric(14,2);oldnet numeric(14,2);newnet numeric(14,2);oldover numeric(14,2);newover numeric(14,2);creditdelta numeric(14,2);creditid uuid;
begin if u is null then raise exception 'Authentification requise';end if;select role into r from public.profiles where id=u and is_active;if r is null or r not in('admin','gestionnaire')then raise exception 'Action non autorisée';end if;if p_idempotency_key is null or nullif(trim(p_motif),'')is null then raise exception 'Motif obligatoire';end if;select * into existing from public.retours_fournisseurs where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('retour_id',existing.id,'numero',existing.numero,'montant',existing.montant,'idempotent_replay',true);end if;
 if jsonb_typeof(p_lignes)<>'array'or jsonb_array_length(p_lignes)=0 then raise exception 'Aucune ligne à retourner';end if;if(select count(*)from jsonb_to_recordset(p_lignes)x(ligne_achat_id uuid,quantite numeric))<>(select count(distinct ligne_achat_id)from jsonb_to_recordset(p_lignes)x(ligne_achat_id uuid,quantite numeric))then raise exception 'Ligne fournisseur en double';end if;
 select * into a from public.achats where id=p_achat_id for update;if not found then raise exception 'Achat introuvable';end if;
 select * into existing from public.retours_fournisseurs where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('retour_id',existing.id,'numero',existing.numero,'montant',existing.montant,'idempotent_replay',true);end if;
 if a.date_reception is null then raise exception 'Achat non réceptionné.';end if;
 num:=public.next_correction_number('retour_fournisseur','RFO');insert into public.retours_fournisseurs(id,numero,idempotency_key,achat_id,fournisseur_id,montant,motif,created_by)values(rid,num,p_idempotency_key,a.id,a.fournisseur_id,0,trim(p_motif),u);
 for item in select * from jsonb_to_recordset(p_lignes)x(ligne_achat_id uuid,quantite numeric)loop
  if item.quantite is null or item.quantite<=0 then raise exception 'Quantité de retour invalide';end if;select * into line from public.lignes_achat where id=item.ligne_achat_id and achat_id=a.id for update;if not found then raise exception 'Matière absente de l''achat';end if;select coalesce(sum(lrf.quantite),0)into qret from public.lignes_retour_fournisseur lrf where lrf.ligne_achat_id=line.id;if qret+item.quantite>line.quantite then raise exception 'Retour fournisseur supérieur à la quantité reçue.';end if;
  select * into m from public.matieres_premieres where id=line.matiere_premiere_id for update;if m.stock_actuel<item.quantite then raise exception 'Stock insuffisant pour retour fournisseur.';end if;lineamt:=round(item.quantite*line.cout_unitaire,2);amt:=amt+lineamt;
  insert into public.lignes_retour_fournisseur(retour_id,ligne_achat_id,matiere_premiere_id,nom_matiere_snapshot,unite_snapshot,quantite,cout_unitaire_snapshot,montant)values(rid,line.id,line.matiere_premiere_id,line.nom_matiere_snapshot,line.unite_snapshot,item.quantite,line.cout_unitaire,lineamt);
  update public.matieres_premieres set stock_actuel=m.stock_actuel-item.quantite where id=m.id;insert into public.mouvements_stock(matiere_premiere_id,type_mouvement,quantite,stock_avant,stock_apres,cout_unitaire_snapshot,reference_type,reference_id,note,created_by)values(m.id,'ajustement_negatif',-item.quantite,m.stock_actuel,m.stock_actuel-item.quantite,m.cout_unitaire_moyen,'retour_fournisseur',rid,'Retour fournisseur '||num,u);
 end loop;update public.retours_fournisseurs set montant=amt where id=rid;
 select coalesce(sum(montant),0)into paid from public.paiements_fournisseur where achat_id=a.id;oldnet:=a.total-a.montant_retourne;newnet:=oldnet-amt;oldover:=greatest(paid-oldnet,0);newover:=greatest(paid-newnet,0);creditdelta:=newover-oldover;
 update public.achats set montant_retourne=montant_retourne+amt,montant_paye=paid,reste_a_payer=greatest(newnet-paid,0),statut=case when greatest(newnet-paid,0)=0 then 'paye'::public.purchase_status when paid>0 then 'partiellement_paye'::public.purchase_status else 'receptionne'::public.purchase_status end where id=a.id;
 if creditdelta>0 then creditid:=gen_random_uuid();insert into public.avoirs_fournisseurs(id,numero,achat_id,retour_id,fournisseur_id,montant,montant_disponible,motif,created_by)values(creditid,public.next_correction_number('avoir_fournisseur','AVF'),a.id,rid,a.fournisseur_id,creditdelta,creditdelta,'Trop-payé après retour '||num,u);end if;
 insert into public.journal_corrections(type_operation,document_source_type,document_source_id,document_correction_type,document_correction_id,motif,details,created_by)values('retour_fournisseur','achat',a.id,'retour_fournisseur',rid,trim(p_motif),jsonb_build_object('montant',amt,'avoir_id',creditid),u);
 return jsonb_build_object('retour_id',rid,'numero',num,'montant',amt,'avoir_id',creditid,'montant_avoir',creditdelta,'idempotent_replay',false);
end$$;

create or replace function public.add_customer_payment(p_vente_id uuid,p_montant numeric,p_mode_paiement public.payment_method,p_idempotency_key uuid,p_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid:=auth.uid();r public.app_role;v public.ventes%rowtype;e public.paiements%rowtype;id uuid:=gen_random_uuid();paid numeric;net numeric;remaining numeric;st public.sale_payment_status;debt numeric;
begin if u is null then raise exception 'Authentification requise';end if;select role into r from public.profiles where id=u and is_active;if r is null or r not in('admin','gestionnaire','caissier')then raise exception 'Action non autorisée';end if;if p_idempotency_key is null or p_montant is null or p_montant<=0 then raise exception 'Règlement invalide';end if;select * into v from public.ventes where id=p_vente_id for update;if not found then raise exception 'Vente introuvable';end if;if v.client_id is not null then perform 1 from public.clients where id=v.client_id for update;debt:=public.calculated_customer_debt(v.client_id);end if;select * into e from public.paiements where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('payment_id',e.id,'reste_a_payer',v.reste_a_payer,'idempotent_replay',true);end if;select coalesce(sum(montant),0)into paid from public.paiements where vente_id=v.id;net:=v.total_final-v.montant_retourne;remaining:=net-paid;if remaining<=0 then raise exception 'Cette vente est déjà soldée';end if;if p_montant>remaining then raise exception 'Le montant dépasse le reste dû';end if;insert into public.paiements(id,vente_id,mode,montant,idempotency_key,created_by,reference,note)values(id,v.id,p_mode_paiement,p_montant,p_idempotency_key,u,nullif(trim(p_reference),''),nullif(trim(p_note),''));remaining:=remaining-p_montant;st:=case when remaining=0 then'payee'::public.sale_payment_status else'partiellement_payee'::public.sale_payment_status end;update public.ventes set montant_paye=paid+p_montant,reste_a_payer=remaining,statut_paiement=st where id=v.id;if v.client_id is not null then update public.clients set encours_credit=greatest(debt-p_montant,0)where id=v.client_id;end if;if remaining=0 then perform public.award_sale_loyalty(v.id);end if;return jsonb_build_object('payment_id',id,'reste_a_payer',remaining,'statut_paiement',st,'idempotent_replay',false);end$$;

create or replace function public.add_supplier_payment(p_achat_id uuid,p_montant numeric,p_mode_paiement public.supplier_payment_method,p_idempotency_key uuid,p_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid:=auth.uid();r public.app_role;a public.achats%rowtype;e public.paiements_fournisseur%rowtype;paid numeric;remaining numeric;id uuid:=gen_random_uuid();begin if u is null then raise exception 'Authentification requise';end if;select role into r from public.profiles where id=u and is_active;if r is null or r not in('admin','gestionnaire')then raise exception 'Action non autorisée';end if;if p_montant is null or p_montant<=0 or p_idempotency_key is null then raise exception 'Paiement invalide';end if;select * into a from public.achats where id=p_achat_id for update;if not found or a.date_reception is null then raise exception 'Achat non réceptionné';end if;select * into e from public.paiements_fournisseur where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('payment_id',e.id,'reste_a_payer',a.reste_a_payer,'idempotent_replay',true);end if;select coalesce(sum(montant),0)into paid from public.paiements_fournisseur where achat_id=a.id;remaining:=a.total-a.montant_retourne-paid;if remaining<=0 then raise exception 'Achat déjà soldé';end if;if p_montant>remaining then raise exception 'Montant supérieur au reste dû';end if;insert into public.paiements_fournisseur(id,achat_id,fournisseur_id,montant,mode_paiement,reference,note,idempotency_key,created_by)values(id,a.id,a.fournisseur_id,p_montant,p_mode_paiement,nullif(trim(p_reference),''),nullif(trim(p_note),''),p_idempotency_key,u);paid:=paid+p_montant;remaining:=a.total-a.montant_retourne-paid;update public.achats set montant_paye=paid,reste_a_payer=remaining,statut=case when remaining=0 then'paye'::public.purchase_status else'partiellement_paye'::public.purchase_status end where id=a.id;return jsonb_build_object('payment_id',id,'reste_a_payer',remaining,'idempotent_replay',false);end$$;

create function public.get_customer_returns_overview()returns jsonb language plpgsql stable security definer set search_path='' as $$declare u uuid:=auth.uid();r public.app_role;result jsonb;begin if u is null then raise exception'Authentification requise';end if;select role into r from public.profiles where id=u and is_active;if r is null or r not in('admin','gestionnaire','caissier','serveur')then raise exception'Action non autorisée';end if;select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at desc),'[]'::jsonb)into result from(select rc.*,v.numero vente_numero,c.nom client_nom,p.full_name auteur,coalesce((select sum(montant)from public.remboursements_clients where retour_id=rc.id),0)montant_rembourse,coalesce((select sum(montant_disponible)from public.avoirs_clients where retour_id=rc.id),0)avoir_disponible from public.retours_clients rc join public.ventes v on v.id=rc.vente_id left join public.clients c on c.id=rc.client_id join public.profiles p on p.id=rc.created_by)x;return result;end$$;
create function public.get_supplier_returns_overview()returns jsonb language plpgsql stable security definer set search_path='' as $$declare u uuid:=auth.uid();r public.app_role;result jsonb;begin if u is null then raise exception'Authentification requise';end if;select role into r from public.profiles where id=u and is_active;if r is null or r not in('admin','gestionnaire')then raise exception'Action non autorisée';end if;select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at desc),'[]'::jsonb)into result from(select rf.*,a.numero_achat,f.nom fournisseur_nom,p.full_name auteur,coalesce((select sum(montant_disponible)from public.avoirs_fournisseurs where retour_id=rf.id),0)avoir_disponible from public.retours_fournisseurs rf join public.achats a on a.id=rf.achat_id join public.fournisseurs f on f.id=rf.fournisseur_id join public.profiles p on p.id=rf.created_by)x;return result;end$$;
create function public.get_sale_returnable_detail(p_vente_id uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$declare u uuid:=auth.uid();r public.app_role;result jsonb;begin if u is null then raise exception'Authentification requise';end if;select role into r from public.profiles where id=u and is_active;if r is null or r not in('admin','gestionnaire','caissier','serveur')then raise exception'Action non autorisée';end if;select jsonb_build_object('vente',to_jsonb(v),'lignes',coalesce((select jsonb_agg(jsonb_build_object('id',lv.id,'nom',lv.nom_produit,'quantite_vendue',lv.quantite,'quantite_retournee',coalesce((select sum(lrc.quantite)from public.lignes_retour_client lrc where lrc.ligne_vente_id=lv.id),0),'prix_unitaire',lv.prix_unitaire))from public.lignes_vente lv where lv.vente_id=v.id),'[]'::jsonb))into result from public.ventes v where v.id=p_vente_id;if result is null then raise exception'Vente introuvable';end if;return result;end$$;

create or replace function public.dashboard_stats()returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin if not public.current_user_is_active()then raise exception'Compte inactif';end if;select jsonb_build_object('chiffre_affaires',coalesce((select sum(total_final)from public.ventes where statut='payee'and created_at::date=current_date),0),'ca_net',coalesce((select sum(total_final-montant_retourne)from public.ventes where statut='payee'and created_at::date=current_date),0),'retours_clients',coalesce((select sum(montant)from public.retours_clients where created_at::date=current_date),0),'remboursements',coalesce((select sum(montant)from public.remboursements_clients where created_at::date=current_date),0),'avoirs_clients_ouverts',coalesce((select sum(montant_disponible)from public.avoirs_clients),0),'avoirs_fournisseurs_ouverts',coalesce((select sum(montant_disponible)from public.avoirs_fournisseurs),0),'encaissements',coalesce((select sum(montant)from public.paiements where created_at::date=current_date),0)-coalesce((select sum(montant)from public.remboursements_clients where created_at::date=current_date),0),'nombre_ventes',(select count(*)from public.ventes where statut='payee'and created_at::date=current_date),'panier_moyen',coalesce((select avg(total_final)from public.ventes where statut='payee'and created_at::date=current_date),0),'creances_clients',coalesce((select sum(reste_a_payer)from public.ventes where statut='payee'),0),'clients_debiteurs',(select count(*)from public.clients where encours_credit>0),'dernieres_ventes',coalesce((select jsonb_agg(to_jsonb(x))from(select id,numero,total_final,montant_retourne,montant_paye,reste_a_payer,statut_paiement,statut,type_commande,created_at from public.ventes where created_at::date=current_date order by created_at desc limit 8)x),'[]'::jsonb),'produits_populaires','[]'::jsonb)into result;return result;end$$;

create or replace function public.daily_operating_summary(p_date date default current_date)returns jsonb language plpgsql stable security definer set search_path='' as $$declare u uuid:=auth.uid();r public.app_role;result jsonb;begin if u is null then raise exception'Authentification requise';end if;select role into r from public.profiles where id=u and is_active;if r is null or r not in('admin','gestionnaire')then raise exception'Action non autorisée';end if;select jsonb_build_object('ventes_brutes',coalesce((select sum(total_final)from public.ventes where statut='payee'and created_at::date=p_date),0),'retours_clients',coalesce((select sum(montant)from public.retours_clients where created_at::date=p_date),0),'chiffre_affaires',coalesce((select sum(total_final-montant_retourne)from public.ventes where statut='payee'and created_at::date=p_date),0),'ca_net',coalesce((select sum(total_final-montant_retourne)from public.ventes where statut='payee'and created_at::date=p_date),0),'encaissements_clients',coalesce((select sum(montant)from public.paiements where created_at::date=p_date),0),'remboursements',coalesce((select sum(montant)from public.remboursements_clients where created_at::date=p_date),0),'encaissements_nets',coalesce((select sum(montant)from public.paiements where created_at::date=p_date),0)-coalesce((select sum(montant)from public.remboursements_clients where created_at::date=p_date),0),'avoirs_clients',coalesce((select sum(montant)from public.avoirs_clients where created_at::date=p_date),0),'retours_fournisseurs',coalesce((select sum(montant)from public.retours_fournisseurs where created_at::date=p_date),0),'avoirs_fournisseurs',coalesce((select sum(montant)from public.avoirs_fournisseurs where created_at::date=p_date),0),'creances_clients_actuelles',coalesce((select sum(encours_credit)from public.clients),0),'depenses_exploitation',coalesce((select sum(montant)from public.depenses where date_depense=p_date),0),'cout_matiere_estime',coalesce((select sum(-quantite*cout_unitaire_snapshot)from public.mouvements_stock where type_mouvement='vente'and created_at::date=p_date),0),'solde_caisse_especes',coalesce((select sum(s.fond_ouverture+coalesce((select sum(case when m.sens='entree'then m.montant else-m.montant end)from public.mouvements_caisse m where m.session_caisse_id=s.id and m.type_mouvement<>'ouverture'),0))from public.sessions_caisse s where s.date_session=p_date),0))into result;return result||jsonb_build_object('resultat_operationnel_simplifie',(result->>'ca_net')::numeric-(result->>'cout_matiere_estime')::numeric-(result->>'depenses_exploitation')::numeric);end$$;

revoke all on function public.create_customer_return(uuid,jsonb,boolean,text,uuid,boolean),public.refund_customer(uuid,numeric,public.refund_method,text,uuid,text),public.cancel_sale(uuid,text,text,public.refund_method,uuid),public.create_supplier_return(uuid,jsonb,text,uuid),public.get_customer_returns_overview(),public.get_supplier_returns_overview(),public.get_sale_returnable_detail(uuid)from public,anon;
grant execute on function public.create_customer_return(uuid,jsonb,boolean,text,uuid,boolean),public.refund_customer(uuid,numeric,public.refund_method,text,uuid,text),public.cancel_sale(uuid,text,text,public.refund_method,uuid),public.create_supplier_return(uuid,jsonb,text,uuid),public.get_customer_returns_overview(),public.get_supplier_returns_overview(),public.get_sale_returnable_detail(uuid)to authenticated;
grant usage on type public.return_status,public.refund_method,public.credit_note_status,public.supplier_return_status,public.sale_correction_status to authenticated;

-- Les points sont attribues sur la valeur nette definitive de la vente.
create or replace function public.award_sale_loyalty(p_vente_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_sale public.ventes%rowtype; v_points integer; v_balance integer;
begin
  select * into v_sale from public.ventes where id=p_vente_id for update;
  if not found or v_sale.client_id is null or v_sale.reste_a_payer > 0 or v_sale.fidelite_attribuee then return; end if;
  select points_fidelite into v_balance from public.clients where id=v_sale.client_id for update;
  v_points := floor(greatest(v_sale.total_final-v_sale.montant_retourne,0) / 1000)::integer;
  if v_points > 0 then
    v_balance := v_balance + v_points;
    update public.clients set points_fidelite=v_balance where id=v_sale.client_id;
    insert into public.mouvements_fidelite(client_id,vente_id,type_mouvement,points,solde_apres,note,created_by)
    values(v_sale.client_id,v_sale.id,'gain_vente',v_points,v_balance,'1 point par tranche de 1 000 F CFA nets',v_sale.user_id)
    on conflict do nothing;
  end if;
  update public.ventes set fidelite_attribuee=true, points_fidelite_gagnes=v_points where id=v_sale.id;
end $$;

create or replace function public.get_customer_returns_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_role is null or v_role not in('admin','gestionnaire','caissier','serveur') then raise exception 'Action non autorisee'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_result from(
    select rc.*,v.numero vente_numero,c.nom client_nom,p.full_name auteur,
      ac.id avoir_id,coalesce(ac.montant_disponible,0) avoir_disponible,
      coalesce((select sum(r.montant) from public.remboursements_clients r where r.retour_id=rc.id),0) montant_rembourse
    from public.retours_clients rc join public.ventes v on v.id=rc.vente_id
    left join public.clients c on c.id=rc.client_id join public.profiles p on p.id=rc.created_by
    left join public.avoirs_clients ac on ac.retour_id=rc.id
  )x;
  return v_result;
end $$;
revoke all on function public.award_sale_loyalty(uuid) from public,anon,authenticated;

create function public.get_purchase_returnable_detail(p_achat_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_role is null or v_role not in('admin','gestionnaire') then raise exception 'Action non autorisee'; end if;
  select jsonb_build_object(
    'achat',to_jsonb(a),
    'fournisseur_nom',f.nom,
    'lignes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',la.id,'nom',la.nom_matiere_snapshot,'unite',la.unite_snapshot,
      'quantite_recue',la.quantite,
      'quantite_retournee',coalesce((select sum(lrf.quantite) from public.lignes_retour_fournisseur lrf where lrf.ligne_achat_id=la.id),0),
      'cout_unitaire',la.cout_unitaire
    ) order by la.nom_matiere_snapshot) from public.lignes_achat la where la.achat_id=a.id),'[]'::jsonb)
  ) into v_result
  from public.achats a join public.fournisseurs f on f.id=a.fournisseur_id
  where a.id=p_achat_id and a.date_reception is not null;
  if v_result is null then raise exception 'Achat receptionne introuvable'; end if;
  return v_result;
end $$;
revoke all on function public.get_purchase_returnable_detail(uuid) from public,anon;
grant execute on function public.get_purchase_returnable_detail(uuid) to authenticated;

-- Les indicateurs journaliers imputent une correction a sa date d'enregistrement.
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb; v_gross numeric; v_returns numeric; v_refunds numeric;
begin
  if not public.current_user_is_active() then raise exception 'Compte inactif'; end if;
  select coalesce(sum(total_final),0) into v_gross from public.ventes where statut='payee' and created_at::date=current_date;
  select coalesce(sum(montant),0) into v_returns from public.retours_clients where created_at::date=current_date;
  select coalesce(sum(montant),0) into v_refunds from public.remboursements_clients where created_at::date=current_date;
  select jsonb_build_object(
    'chiffre_affaires',v_gross,'ventes_brutes',v_gross,'ca_net',v_gross-v_returns,
    'retours_clients',v_returns,'remboursements',v_refunds,
    'avoirs_clients_ouverts',coalesce((select sum(montant_disponible) from public.avoirs_clients),0),
    'avoirs_fournisseurs_ouverts',coalesce((select sum(montant_disponible) from public.avoirs_fournisseurs),0),
    'encaissements',coalesce((select sum(montant) from public.paiements where created_at::date=current_date),0)-v_refunds,
    'nombre_ventes',(select count(*) from public.ventes where statut='payee' and created_at::date=current_date),
    'panier_moyen',coalesce((select avg(total_final) from public.ventes where statut='payee' and created_at::date=current_date),0),
    'creances_clients',coalesce((select sum(reste_a_payer) from public.ventes where statut='payee'),0),
    'clients_debiteurs',(select count(*) from public.clients where encours_credit>0),
    'dernieres_ventes',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,numero,total_final,montant_retourne,montant_paye,reste_a_payer,statut_paiement,statut,type_commande,created_at from public.ventes where created_at::date=current_date order by created_at desc limit 8)x),'[]'::jsonb),
    'produits_populaires',coalesce((select jsonb_agg(to_jsonb(x)) from(select lv.nom_produit nom,sum(lv.quantite)::integer quantite,sum(lv.total_ligne) montant from public.lignes_vente lv join public.ventes v on v.id=lv.vente_id where v.statut='payee' and v.created_at::date=current_date group by lv.nom_produit order by quantite desc,montant desc limit 5)x),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.daily_operating_summary(p_date date default current_date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_role public.app_role; v_result jsonb; v_gross numeric; v_returns numeric; v_refunds numeric;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_role is null or v_role not in('admin','gestionnaire') then raise exception 'Action non autorisee'; end if;
  select coalesce(sum(total_final),0) into v_gross from public.ventes where statut='payee' and created_at::date=p_date;
  select coalesce(sum(montant),0) into v_returns from public.retours_clients where created_at::date=p_date;
  select coalesce(sum(montant),0) into v_refunds from public.remboursements_clients where created_at::date=p_date;
  select jsonb_build_object(
    'ventes_brutes',v_gross,'chiffre_affaires',v_gross-v_returns,'ca_net',v_gross-v_returns,'retours_clients',v_returns,
    'encaissements_clients',coalesce((select sum(montant) from public.paiements where created_at::date=p_date),0),
    'remboursements',v_refunds,
    'encaissements_nets',coalesce((select sum(montant) from public.paiements where created_at::date=p_date),0)-v_refunds,
    'nouvelles_creances',coalesce((select sum(reste_a_payer) from public.ventes where statut='payee' and created_at::date=p_date),0),
    'creances_clients_actuelles',coalesce((select sum(encours_credit) from public.clients),0),
    'avoirs_clients',coalesce((select sum(montant) from public.avoirs_clients where created_at::date=p_date),0),
    'achats_receptionnes',coalesce((select sum(total_net) from public.achats where date_reception::date=p_date),0),
    'retours_fournisseurs',coalesce((select sum(montant) from public.retours_fournisseurs where created_at::date=p_date),0),
    'avoirs_fournisseurs',coalesce((select sum(montant) from public.avoirs_fournisseurs where created_at::date=p_date),0),
    'paiements_fournisseurs',coalesce((select sum(montant) from public.paiements_fournisseur where created_at::date=p_date),0),
    'depenses_exploitation',coalesce((select sum(montant) from public.depenses where date_depense=p_date),0),
    'ventes_especes',coalesce((select sum(montant) from public.paiements where mode='especes' and created_at::date=p_date),0),
    'ventes_mobile_money',coalesce((select sum(montant) from public.paiements where mode in('orange_money','moov_money') and created_at::date=p_date),0),
    'solde_caisse_especes',coalesce((select sum(s.fond_ouverture+coalesce((select sum(case when m.sens='entree' then m.montant else -m.montant end) from public.mouvements_caisse m where m.session_caisse_id=s.id and m.type_mouvement<>'ouverture'),0)) from public.sessions_caisse s where s.date_session=p_date),0),
    'ecart_caisse',coalesce((select sum(ecart) from public.sessions_caisse where closed_at::date=p_date),0),
    'cout_matiere_estime',coalesce((select sum(-quantite*cout_unitaire_snapshot) from public.mouvements_stock where type_mouvement='vente' and created_at::date=p_date),0)
  ) into v_result;
  return v_result||jsonb_build_object('resultat_operationnel_simplifie',(v_result->>'ca_net')::numeric-(v_result->>'cout_matiere_estime')::numeric-(v_result->>'depenses_exploitation')::numeric);
end $$;

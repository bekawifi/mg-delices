-- MG DELICES - Etape 8 : rapports, audit global, parametres et recus.

create table public.restaurant_settings(
  singleton boolean primary key default true check(singleton),
  nom text not null default 'MG DELICES',
  telephone text,
  adresse text,
  slogan text,
  devise text not null default 'F CFA',
  logo_url text,
  pied_ticket text not null default 'Merci pour votre confiance.',
  numero_fiscal text,
  largeur_ticket integer not null default 80 check(largeur_ticket in(58,80)),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete restrict
);
insert into public.restaurant_settings(singleton)values(true);
alter table public.restaurant_settings enable row level security;
revoke all on public.restaurant_settings from public,anon,authenticated;

create table public.audit_log(
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  domaine text not null,
  objet_type text not null,
  objet_id text,
  reference_metier text,
  donnees_avant jsonb,
  donnees_apres jsonb,
  contexte jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log(created_at desc,id desc);
create index audit_log_actor_idx on public.audit_log(actor_id,created_at desc);
create index audit_log_domain_idx on public.audit_log(domaine,action,created_at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public,anon,authenticated;

create function public.capture_global_audit()returns trigger
language plpgsql security definer set search_path='' as $$
declare v_before jsonb;v_after jsonb;v_row jsonb;v_id text;v_reference text;v_domain text;
begin
  v_before:=case when tg_op in('UPDATE','DELETE')then to_jsonb(old)else null end;
  v_after:=case when tg_op in('INSERT','UPDATE')then to_jsonb(new)else null end;
  v_row:=coalesce(v_after,v_before);
  v_id:=coalesce(v_row->>'id',v_row->>'singleton');
  v_reference:=coalesce(v_row->>'numero',v_row->>'numero_achat',v_row->>'numero_depense',v_row->>'numero_commande',v_row->>'code',v_row->>'nom');
  v_domain:=case
    when tg_table_name in('ventes','paiements','retours_clients','remboursements_clients','avoirs_clients','journal_corrections')then'ventes'
    when tg_table_name in('matieres_premieres','mouvements_stock','inventaires','recettes','recette_ingredients')then'stock'
    when tg_table_name in('fournisseurs','achats','paiements_fournisseur','retours_fournisseurs','avoirs_fournisseurs')then'achats'
    when tg_table_name in('sessions_caisse','mouvements_caisse','depenses')then'caisse'
    when tg_table_name='profiles'then'administration'
    else'configuration'end;
  insert into public.audit_log(actor_id,action,domaine,objet_type,objet_id,reference_metier,donnees_avant,donnees_apres,contexte)
  values(auth.uid(),lower(tg_op),v_domain,tg_table_name,v_id,v_reference,v_before,v_after,jsonb_build_object('schema',tg_table_schema,'trigger',tg_name));
  if tg_op='DELETE'then return old;end if;return new;
end$$;
revoke all on function public.capture_global_audit()from public,anon,authenticated;

create function public.prevent_audit_mutation()returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Le journal audit est immuable';end$$;
revoke all on function public.prevent_audit_mutation()from public,anon,authenticated;
create trigger audit_log_immutable before update or delete on public.audit_log for each row execute function public.prevent_audit_mutation();

create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.capture_global_audit();
create trigger audit_produits after insert or update or delete on public.produits for each row execute function public.capture_global_audit();
create trigger audit_recettes after insert or update or delete on public.recettes for each row execute function public.capture_global_audit();
create trigger audit_recette_ingredients after insert or update or delete on public.recette_ingredients for each row execute function public.capture_global_audit();
create trigger audit_matieres_premieres after insert or update or delete on public.matieres_premieres for each row execute function public.capture_global_audit();
create trigger audit_mouvements_stock after insert on public.mouvements_stock for each row execute function public.capture_global_audit();
create trigger audit_inventaires after insert or update on public.inventaires for each row execute function public.capture_global_audit();
create trigger audit_fournisseurs after insert or update or delete on public.fournisseurs for each row execute function public.capture_global_audit();
create trigger audit_achats after insert or update on public.achats for each row execute function public.capture_global_audit();
create trigger audit_paiements_fournisseur after insert on public.paiements_fournisseur for each row execute function public.capture_global_audit();
create trigger audit_depenses after insert on public.depenses for each row execute function public.capture_global_audit();
create trigger audit_sessions_caisse after insert or update on public.sessions_caisse for each row execute function public.capture_global_audit();
create trigger audit_mouvements_caisse after insert on public.mouvements_caisse for each row execute function public.capture_global_audit();
create trigger audit_ventes after insert or update on public.ventes for each row execute function public.capture_global_audit();
create trigger audit_paiements after insert on public.paiements for each row execute function public.capture_global_audit();
create trigger audit_retours_clients after insert or update on public.retours_clients for each row execute function public.capture_global_audit();
create trigger audit_remboursements_clients after insert on public.remboursements_clients for each row execute function public.capture_global_audit();
create trigger audit_avoirs_clients after insert or update on public.avoirs_clients for each row execute function public.capture_global_audit();
create trigger audit_retours_fournisseurs after insert or update on public.retours_fournisseurs for each row execute function public.capture_global_audit();
create trigger audit_avoirs_fournisseurs after insert or update on public.avoirs_fournisseurs for each row execute function public.capture_global_audit();
create trigger audit_journal_corrections after insert on public.journal_corrections for each row execute function public.capture_global_audit();
create trigger audit_restaurant_settings after update on public.restaurant_settings for each row execute function public.capture_global_audit();

create function public.get_restaurant_settings()returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_result jsonb;
begin
  if v_user is null or not exists(select 1 from public.profiles as p where p.id=v_user and p.is_active)then raise exception 'Authentification requise';end if;
  select to_jsonb(s)into v_result from public.restaurant_settings as s where s.singleton;
  return v_result;
end$$;

create function public.update_restaurant_settings(p_settings jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_result jsonb;
begin
  if v_user is null or not exists(select 1 from public.profiles as p where p.id=v_user and p.is_active and p.role='admin')then raise exception 'Action non autorisee';end if;
  update public.restaurant_settings as s set
    nom=coalesce(nullif(trim(p_settings->>'nom'),''),s.nom),telephone=nullif(trim(p_settings->>'telephone'),''),adresse=nullif(trim(p_settings->>'adresse'),''),
    slogan=nullif(trim(p_settings->>'slogan'),''),devise=coalesce(nullif(trim(p_settings->>'devise'),''),s.devise),logo_url=nullif(trim(p_settings->>'logo_url'),''),
    pied_ticket=coalesce(nullif(trim(p_settings->>'pied_ticket'),''),s.pied_ticket),numero_fiscal=nullif(trim(p_settings->>'numero_fiscal'),''),
    largeur_ticket=case when (p_settings->>'largeur_ticket')::integer in(58,80)then(p_settings->>'largeur_ticket')::integer else s.largeur_ticket end,
    updated_at=now(),updated_by=v_user where s.singleton returning to_jsonb(s)into v_result;
  return v_result;
end$$;

create function public.get_production_report(p_from date,p_to date)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_role public.app_role;v_result jsonb;
begin
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>366 then raise exception 'Periode invalide';end if;
  select p.role into v_role from public.profiles as p where p.id=v_user and p.is_active;
  if v_role is null or v_role not in('admin','gestionnaire')then raise exception 'Action non autorisee';end if;
  select jsonb_build_object(
    'periode',jsonb_build_object('from',p_from,'to',p_to),
    'ventes',jsonb_build_object(
      'ca_brut',coalesce((select sum(v.total_final)from public.ventes v where v.statut='payee'and v.created_at::date between p_from and p_to),0),
      'retours',coalesce((select sum(r.montant)from public.retours_clients r where r.created_at::date between p_from and p_to),0),
      'nombre',coalesce((select count(*)from public.ventes v where v.statut='payee'and v.created_at::date between p_from and p_to),0),
      'par_type',coalesce((select jsonb_agg(to_jsonb(x)order by x.montant desc)from(select v.type_commande type,count(*) nombre,sum(v.total_final-v.montant_retourne)montant from public.ventes v where v.statut='payee'and v.created_at::date between p_from and p_to group by v.type_commande)x),'[]'::jsonb),
      'par_produit',coalesce((select jsonb_agg(to_jsonb(x)order by x.montant desc)from(select lv.nom_produit nom,sum(lv.quantite)quantite,sum(lv.total_ligne)montant from public.lignes_vente lv join public.ventes v on v.id=lv.vente_id where v.statut='payee'and v.created_at::date between p_from and p_to group by lv.nom_produit limit 100)x),'[]'::jsonb),
      'par_categorie',coalesce((select jsonb_agg(to_jsonb(x)order by x.montant desc)from(select coalesce(c.nom,'Sans categorie')categorie,sum(lv.total_ligne)montant from public.lignes_vente lv join public.ventes v on v.id=lv.vente_id left join public.produits p on p.id=lv.produit_id left join public.categories c on c.id=p.categorie_id where v.statut='payee'and v.created_at::date between p_from and p_to group by c.nom)x),'[]'::jsonb)
    ),
    'encaissements',jsonb_build_object(
      'par_mode',coalesce((select jsonb_agg(to_jsonb(x)order by x.montant desc)from(select p.mode,sum(p.montant)montant from public.paiements p where p.created_at::date between p_from and p_to group by p.mode)x),'[]'::jsonb),
      'remboursements',coalesce((select sum(r.montant)from public.remboursements_clients r where r.created_at::date between p_from and p_to),0)
    ),
    'clients',jsonb_build_object(
      'creances',coalesce((select sum(c.encours_credit)from public.clients c),0),'debiteurs',(select count(*)from public.clients c where c.encours_credit>0),
      'reglements',coalesce((select sum(p.montant)from public.paiements p where p.created_at::date between p_from and p_to),0),
      'fidelite',coalesce((select sum(m.points)from public.mouvements_fidelite m where m.created_at::date between p_from and p_to),0),
      'meilleurs',coalesce((select jsonb_agg(to_jsonb(x)order by x.montant desc)from(select c.nom,sum(v.total_final-v.montant_retourne)montant from public.clients c join public.ventes v on v.client_id=c.id where v.statut='payee'and v.created_at::date between p_from and p_to group by c.id,c.nom limit 20)x),'[]'::jsonb)
    ),
    'stock',jsonb_build_object(
      'valeur',coalesce((select sum(m.stock_actuel*m.cout_unitaire_moyen)from public.matieres_premieres m where m.actif),0),
      'bas',(select count(*)from public.matieres_premieres m where m.actif and m.stock_actuel<=m.stock_minimum),
      'rupture',(select count(*)from public.matieres_premieres m where m.actif and m.stock_actuel<=0),
      'mouvements',coalesce((select count(*)from public.mouvements_stock m where m.created_at::date between p_from and p_to),0),
      'pertes',coalesce((select sum(abs(m.quantite)*m.cout_unitaire_snapshot)from public.mouvements_stock m where m.type_mouvement in('perte','casse','ajustement_negatif')and m.created_at::date between p_from and p_to),0),
      'consommations',coalesce((select sum(abs(m.quantite)*m.cout_unitaire_snapshot)from public.mouvements_stock m where m.type_mouvement='vente'and m.created_at::date between p_from and p_to),0)
    ),
    'achats',jsonb_build_object(
      'receptionnes',coalesce((select sum(a.total_net)from public.achats a where a.date_reception::date between p_from and p_to),0),
      'paiements',coalesce((select sum(p.montant)from public.paiements_fournisseur p where p.created_at::date between p_from and p_to),0),
      'dette',coalesce((select sum(a.reste_a_payer)from public.achats a where a.date_reception is not null and a.statut<>'annule'),0),
      'avoirs',coalesce((select sum(a.montant_disponible)from public.avoirs_fournisseurs a),0)
    ),
    'depenses',jsonb_build_object(
      'total',coalesce((select sum(d.montant)from public.depenses d where d.date_depense between p_from and p_to),0),
      'par_categorie',coalesce((select jsonb_agg(to_jsonb(x)order by x.montant desc)from(select c.nom categorie,sum(d.montant)montant from public.depenses d join public.categories_depense c on c.id=d.categorie_id where d.date_depense between p_from and p_to group by c.nom)x),'[]'::jsonb),
      'par_mode',coalesce((select jsonb_agg(to_jsonb(x)order by x.montant desc)from(select d.mode_paiement mode,sum(d.montant)montant from public.depenses d where d.date_depense between p_from and p_to group by d.mode_paiement)x),'[]'::jsonb)
    ),
    'caisse',jsonb_build_object(
      'ouvertures',(select count(*)from public.sessions_caisse s where s.date_session between p_from and p_to),
      'clotures',(select count(*)from public.sessions_caisse s where s.closed_at::date between p_from and p_to),
      'ecarts',coalesce((select sum(s.ecart)from public.sessions_caisse s where s.closed_at::date between p_from and p_to),0),
      'entrees',coalesce((select sum(m.montant)from public.mouvements_caisse m where m.sens='entree'and m.created_at::date between p_from and p_to),0),
      'sorties',coalesce((select sum(m.montant)from public.mouvements_caisse m where m.sens='sortie'and m.created_at::date between p_from and p_to),0)
    )
  )into v_result;
  v_result:=v_result||jsonb_build_object('rentabilite',jsonb_build_object(
    'ca_net',(v_result#>>'{ventes,ca_brut}')::numeric-(v_result#>>'{ventes,retours}')::numeric,
    'cout_matiere',(v_result#>>'{stock,consommations}')::numeric,
    'depenses_exploitation',(v_result#>>'{depenses,total}')::numeric,
    'marge_brute',(v_result#>>'{ventes,ca_brut}')::numeric-(v_result#>>'{ventes,retours}')::numeric-(v_result#>>'{stock,consommations}')::numeric,
    'resultat_operationnel_simplifie',(v_result#>>'{ventes,ca_brut}')::numeric-(v_result#>>'{ventes,retours}')::numeric-(v_result#>>'{stock,consommations}')::numeric-(v_result#>>'{depenses,total}')::numeric
  ));
  return v_result;
end$$;

create function public.get_report_export(p_domain text,p_from date,p_to date,p_limit integer default 5000,p_offset integer default 0)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_role public.app_role;v_rows jsonb;v_limit integer:=least(greatest(coalesce(p_limit,5000),1),5000);v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  select p.role into v_role from public.profiles p where p.id=v_user and p.is_active;
  if v_role is null or v_role not in('admin','gestionnaire')then raise exception 'Action non autorisee';end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception 'Periode invalide';end if;
  case p_domain
    when'ventes'then select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_rows from(select v.numero,v.created_at,v.type_commande,v.total_final,v.montant_retourne,v.montant_paye,v.reste_a_payer,v.statut_paiement from public.ventes v where v.created_at::date between p_from and p_to order by v.created_at desc limit v_limit offset v_offset)x;
    when'paiements'then select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_rows from(select p.created_at,v.numero vente,p.mode,p.montant,p.reference from public.paiements p join public.ventes v on v.id=p.vente_id where p.created_at::date between p_from and p_to order by p.created_at desc limit v_limit offset v_offset)x;
    when'clients'then select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_rows from(select c.numero,c.nom,c.telephone,c.encours_credit,c.plafond_credit,c.points_fidelite,c.actif from public.clients c order by c.nom limit v_limit offset v_offset)x;
    when'stock'then select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_rows from(select m.code,m.nom,m.stock_actuel,m.stock_minimum,m.cout_unitaire_moyen,(m.stock_actuel*m.cout_unitaire_moyen)valeur from public.matieres_premieres m order by m.nom limit v_limit offset v_offset)x;
    when'mouvements_stock'then select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_rows from(select m.created_at,mp.code,mp.nom,m.type_mouvement,m.quantite,m.stock_avant,m.stock_apres,m.reference_type,m.reference_id from public.mouvements_stock m join public.matieres_premieres mp on mp.id=m.matiere_premiere_id where m.created_at::date between p_from and p_to order by m.created_at desc limit v_limit offset v_offset)x;
    when'fournisseurs'then select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_rows from(select f.code,f.nom,f.telephone,f.email,f.actif from public.fournisseurs f order by f.nom limit v_limit offset v_offset)x;
    when'achats'then select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_rows from(select a.numero_achat,a.date_achat,a.date_reception,f.nom fournisseur,a.total,a.montant_retourne,a.montant_paye,a.reste_a_payer,a.statut from public.achats a join public.fournisseurs f on f.id=a.fournisseur_id where a.date_achat between p_from and p_to order by a.date_achat desc limit v_limit offset v_offset)x;
    when'depenses'then select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_rows from(select d.numero_depense,d.date_depense,c.nom categorie,d.libelle,d.mode_paiement,d.montant from public.depenses d join public.categories_depense c on c.id=d.categorie_id where d.date_depense between p_from and p_to order by d.date_depense desc limit v_limit offset v_offset)x;
    when'caisse'then select coalesce(jsonb_agg(to_jsonb(x)),'[]')into v_rows from(select m.created_at,m.type_mouvement,m.sens,m.montant,m.libelle,m.reference_type,m.reference_id from public.mouvements_caisse m where m.created_at::date between p_from and p_to order by m.created_at desc limit v_limit offset v_offset)x;
    else raise exception 'Export inconnu';
  end case;
  return jsonb_build_object('domain',p_domain,'from',p_from,'to',p_to,'limit',v_limit,'offset',v_offset,'rows',v_rows);
end$$;

create function public.get_audit_log(p_from date default null,p_to date default null,p_actor uuid default null,p_domain text default null,p_action text default null,p_object_type text default null,p_reference text default null,p_limit integer default 100,p_offset integer default 0)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_result jsonb;v_limit integer:=least(greatest(coalesce(p_limit,100),1),200);
begin
  if not exists(select 1 from public.profiles p where p.id=v_user and p.is_active and p.role='admin')then raise exception 'Action non autorisee';end if;
  select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(x)order by x.created_at desc,x.id desc),'[]'),'limit',v_limit,'offset',greatest(coalesce(p_offset,0),0))into v_result from(
    select a.id,a.created_at,a.actor_id,p.full_name actor_name,a.action,a.domaine,a.objet_type,a.objet_id,a.reference_metier,a.donnees_avant,a.donnees_apres,a.contexte
    from public.audit_log a left join public.profiles p on p.id=a.actor_id
    where(p_from is null or a.created_at::date>=p_from)and(p_to is null or a.created_at::date<=p_to)and(p_actor is null or a.actor_id=p_actor)
      and(nullif(trim(p_domain),'')is null or a.domaine=p_domain)and(nullif(trim(p_action),'')is null or a.action=p_action)
      and(nullif(trim(p_object_type),'')is null or a.objet_type=p_object_type)and(nullif(trim(p_reference),'')is null or coalesce(a.reference_metier,'')ilike'%'||trim(p_reference)||'%')
    order by a.created_at desc,a.id desc limit v_limit offset greatest(coalesce(p_offset,0),0)
  )x;
  return v_result;
end$$;

create function public.get_sale_receipt(p_sale_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_role public.app_role;v_result jsonb;
begin
  select p.role into v_role from public.profiles p where p.id=v_user and p.is_active;
  if v_role is null or v_role not in('admin','gestionnaire','caissier')then raise exception 'Action non autorisee';end if;
  select jsonb_build_object('settings',(select to_jsonb(s)from public.restaurant_settings s where s.singleton),'vente',to_jsonb(v),'caissier',p.full_name,'client',c.nom,
    'lignes',coalesce((select jsonb_agg(to_jsonb(x)order by x.nom_produit)from(select lv.quantite,lv.nom_produit,lv.prix_unitaire,lv.total_ligne from public.lignes_vente lv where lv.vente_id=v.id)x),'[]'),
    'paiements',coalesce((select jsonb_agg(to_jsonb(x)order by x.created_at)from(select pay.mode,pay.montant,pay.reference,pay.created_at from public.paiements pay where pay.vente_id=v.id)x),'[]'))into v_result
  from public.ventes v join public.profiles p on p.id=v.user_id left join public.clients c on c.id=v.client_id where v.id=p_sale_id;
  if v_result is null then raise exception 'Vente introuvable';end if;return v_result;
end$$;

revoke all on function public.get_restaurant_settings(),public.update_restaurant_settings(jsonb),public.get_production_report(date,date),public.get_report_export(text,date,date,integer,integer),public.get_audit_log(date,date,uuid,text,text,text,text,integer,integer),public.get_sale_receipt(uuid)from public,anon;
grant execute on function public.get_restaurant_settings(),public.update_restaurant_settings(jsonb),public.get_production_report(date,date),public.get_report_export(text,date,date,integer,integer),public.get_audit_log(date,date,uuid,text,text,text,text,integer,integer),public.get_sale_receipt(uuid)to authenticated;

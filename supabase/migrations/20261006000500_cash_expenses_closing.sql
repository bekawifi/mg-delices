-- MG DELICES - Étape 5 : dépenses et caisse espèces
create type public.cash_session_status as enum ('ouverte', 'cloturee');
create type public.cash_movement_type as enum ('ouverture', 'vente', 'depense', 'paiement_fournisseur', 'entree_manuelle', 'sortie_manuelle', 'ajustement_cloture');
create type public.cash_direction as enum ('entree', 'sortie');
create type public.expense_payment_method as enum ('especes', 'orange_money', 'moov_money', 'virement', 'autre');

create table public.categories_depense (
  id uuid primary key default gen_random_uuid(), code text not null unique check(length(trim(code))>0),
  nom text not null check(length(trim(nom))>0), actif boolean not null default true,
  ordre integer not null default 0 check(ordre>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.expense_counters (expense_date date primary key, last_value integer not null check(last_value>0));
create table public.depenses (
  id uuid primary key default gen_random_uuid(), numero_depense text not null unique, idempotency_key uuid not null unique,
  categorie_id uuid not null references public.categories_depense(id) on delete restrict,
  libelle text not null check(length(trim(libelle))>0), montant numeric(14,2) not null check(montant>0),
  mode_paiement public.expense_payment_method not null, reference text, note text, date_depense date not null,
  created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now()
);
create index depenses_date_idx on public.depenses(date_depense desc);
create index depenses_categorie_idx on public.depenses(categorie_id, date_depense desc);

create table public.sessions_caisse (
  id uuid primary key default gen_random_uuid(), date_session date not null default current_date,
  open_idempotency_key uuid not null unique, close_idempotency_key uuid unique,
  opened_by uuid not null references public.profiles(id) on delete restrict, opened_at timestamptz not null default now(),
  fond_ouverture numeric(14,2) not null check(fond_ouverture>=0), statut public.cash_session_status not null default 'ouverte',
  closed_by uuid references public.profiles(id) on delete restrict, closed_at timestamptz,
  solde_theorique numeric(14,2), solde_compte numeric(14,2), ecart numeric(14,2), note_cloture text,
  created_at timestamptz not null default now(),
  check ((statut='ouverte' and closed_by is null and closed_at is null and solde_theorique is null and solde_compte is null and ecart is null)
    or (statut='cloturee' and closed_by is not null and closed_at is not null and solde_theorique is not null and solde_compte is not null and ecart is not null))
);
create unique index sessions_caisse_one_open_idx on public.sessions_caisse((true)) where statut='ouverte';
create index sessions_caisse_date_idx on public.sessions_caisse(date_session desc, opened_at desc);

create table public.mouvements_caisse (
  id uuid primary key default gen_random_uuid(), session_caisse_id uuid not null references public.sessions_caisse(id) on delete restrict,
  type_mouvement public.cash_movement_type not null, sens public.cash_direction not null,
  montant numeric(14,2) not null check(montant>0), mode_paiement text not null default 'especes' check(mode_paiement='especes'),
  reference_type text, reference_id uuid, libelle text not null check(length(trim(libelle))>0),
  idempotency_key uuid unique, created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((type_mouvement in ('ouverture','vente','entree_manuelle') and sens='entree')
    or (type_mouvement in ('depense','paiement_fournisseur','sortie_manuelle') and sens='sortie')
    or type_mouvement='ajustement_cloture')
);
create index mouvements_caisse_session_date_idx on public.mouvements_caisse(session_caisse_id, created_at, id);
create unique index mouvements_caisse_reference_unique_idx on public.mouvements_caisse(reference_type, reference_id)
  where reference_type in ('paiement_client','paiement_fournisseur','depense','ouverture');

create table public.comptages_caisse (
  id uuid primary key default gen_random_uuid(), session_caisse_id uuid not null references public.sessions_caisse(id) on delete restrict,
  denomination integer not null check(denomination>0), quantite integer not null check(quantite>=0),
  montant_ligne numeric(14,2) generated always as (denomination * quantite) stored,
  created_at timestamptz not null default now(), unique(session_caisse_id, denomination)
);

create trigger categories_depense_updated_at before update on public.categories_depense for each row execute function public.set_updated_at();
create function public.prevent_financial_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Cette écriture financière est immuable'; end; $$;
create trigger depenses_immutable before update or delete on public.depenses for each row execute function public.prevent_financial_mutation();
create trigger mouvements_caisse_immutable before update or delete on public.mouvements_caisse for each row execute function public.prevent_financial_mutation();
create trigger comptages_caisse_immutable before update or delete on public.comptages_caisse for each row execute function public.prevent_financial_mutation();
revoke all on function public.prevent_financial_mutation() from public,anon,authenticated;

create function public.ensure_open_cash_movement() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.sessions_caisse where id=new.session_caisse_id and statut='ouverte' for update) then raise exception 'Cette caisse est déjà clôturée.'; end if;
  return new;
end; $$;
create trigger mouvements_caisse_require_open before insert on public.mouvements_caisse for each row execute function public.ensure_open_cash_movement();
revoke all on function public.ensure_open_cash_movement() from public,anon,authenticated;

alter table public.categories_depense enable row level security; alter table public.expense_counters enable row level security;
alter table public.depenses enable row level security; alter table public.sessions_caisse enable row level security;
alter table public.mouvements_caisse enable row level security; alter table public.comptages_caisse enable row level security;
create policy categories_depense_read on public.categories_depense for select to authenticated using(public.current_user_is_active() and public.current_user_role() in ('admin','gestionnaire'));
create policy depenses_read on public.depenses for select to authenticated using(public.current_user_is_active() and public.current_user_role() in ('admin','gestionnaire'));
create policy sessions_caisse_read on public.sessions_caisse for select to authenticated using(public.current_user_is_active() and public.current_user_role() in ('admin','gestionnaire','caissier'));
create policy mouvements_caisse_read on public.mouvements_caisse for select to authenticated using(public.current_user_is_active() and public.current_user_role() in ('admin','gestionnaire','caissier'));
create policy comptages_caisse_read on public.comptages_caisse for select to authenticated using(public.current_user_is_active() and public.current_user_role() in ('admin','gestionnaire','caissier'));
grant select on public.categories_depense,public.depenses,public.sessions_caisse,public.mouvements_caisse,public.comptages_caisse to authenticated;
revoke all on public.expense_counters from public,anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.categories_depense,public.depenses,public.sessions_caisse,public.mouvements_caisse,public.comptages_caisse from public,anon,authenticated;

create function public.save_expense_category(p_id uuid,p_code text,p_nom text,p_ordre integer,p_actif boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_role public.app_role; v_id uuid:=coalesce(p_id,gen_random_uuid());
begin
 if v_user is null then raise exception 'Authentification requise'; end if; select role into v_role from public.profiles where id=v_user and is_active;
 if v_role is null or v_role not in ('admin','gestionnaire') then raise exception 'Action non autorisée'; end if;
 if nullif(trim(p_code),'') is null or nullif(trim(p_nom),'') is null or p_ordre<0 then raise exception 'Catégorie invalide'; end if;
 if p_id is null then insert into public.categories_depense(id,code,nom,ordre,actif) values(v_id,upper(trim(p_code)),trim(p_nom),p_ordre,coalesce(p_actif,true));
 else update public.categories_depense set code=upper(trim(p_code)),nom=trim(p_nom),ordre=p_ordre,actif=coalesce(p_actif,true) where id=p_id; if not found then raise exception 'Catégorie introuvable'; end if; end if; return v_id;
end $$;

create function public.open_cash_session(p_fond_ouverture numeric,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_role public.app_role; v_existing public.sessions_caisse%rowtype; v_id uuid:=gen_random_uuid();
begin
 if v_user is null then raise exception 'Authentification requise'; end if; select role into v_role from public.profiles where id=v_user and is_active;
 if v_role is null or v_role not in ('admin','gestionnaire','caissier') then raise exception 'Action non autorisée'; end if;
 if p_fond_ouverture is null or p_fond_ouverture<0 or p_idempotency_key is null then raise exception 'Fond ou clé invalide'; end if;
 perform pg_advisory_xact_lock(hashtext('mg_delices_cash_session'));
 select * into v_existing from public.sessions_caisse where open_idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('session_id',v_existing.id,'idempotent_replay',true); end if;
 if exists(select 1 from public.sessions_caisse where statut='ouverte') then raise exception 'Une caisse est déjà ouverte.'; end if;
 insert into public.sessions_caisse(id,open_idempotency_key,opened_by,fond_ouverture) values(v_id,p_idempotency_key,v_user,p_fond_ouverture);
 if p_fond_ouverture>0 then insert into public.mouvements_caisse(session_caisse_id,type_mouvement,sens,montant,reference_type,reference_id,libelle,created_by)
 values(v_id,'ouverture','entree',p_fond_ouverture,'ouverture',v_id,'Fond d''ouverture',v_user); end if;
 return jsonb_build_object('session_id',v_id,'idempotent_replay',false);
end $$;

create function public.create_expense(p_idempotency_key uuid,p_categorie_id uuid,p_libelle text,p_montant numeric,p_mode_paiement public.expense_payment_method,p_reference text,p_note text,p_date_depense date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_role public.app_role; v_existing public.depenses%rowtype; v_id uuid:=gen_random_uuid(); v_session uuid; v_counter integer; v_numero text;
begin
 if v_user is null then raise exception 'Authentification requise'; end if; select role into v_role from public.profiles where id=v_user and is_active;
 if v_role is null or v_role not in ('admin','gestionnaire') then raise exception 'Action non autorisée'; end if;
 if p_idempotency_key is null then raise exception 'Clé d''idempotence requise'; end if; select * into v_existing from public.depenses where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('depense_id',v_existing.id,'numero',v_existing.numero_depense,'idempotent_replay',true); end if;
 if p_montant is null or p_montant<=0 or nullif(trim(p_libelle),'') is null or p_date_depense is null then raise exception 'Montant ou dépense invalide'; end if;
 if not exists(select 1 from public.categories_depense where id=p_categorie_id and actif for share) then raise exception 'Catégorie de dépense inactive'; end if;
 if p_mode_paiement='especes' then select id into v_session from public.sessions_caisse where statut='ouverte' for update; if not found then raise exception 'Aucune caisse n''est ouverte.'; end if; end if;
 insert into public.expense_counters(expense_date,last_value) values(p_date_depense,1) on conflict(expense_date) do update set last_value=public.expense_counters.last_value+1 returning last_value into v_counter;
 v_numero:='DEP-'||to_char(p_date_depense,'YYYYMMDD')||'-'||lpad(v_counter::text,4,'0');
 insert into public.depenses(id,numero_depense,idempotency_key,categorie_id,libelle,montant,mode_paiement,reference,note,date_depense,created_by)
 values(v_id,v_numero,p_idempotency_key,p_categorie_id,trim(p_libelle),p_montant,p_mode_paiement,nullif(trim(p_reference),''),nullif(trim(p_note),''),p_date_depense,v_user);
 if p_mode_paiement='especes' then insert into public.mouvements_caisse(session_caisse_id,type_mouvement,sens,montant,reference_type,reference_id,libelle,created_by)
 values(v_session,'depense','sortie',p_montant,'depense',v_id,trim(p_libelle),v_user); end if;
 return jsonb_build_object('depense_id',v_id,'numero',v_numero,'idempotent_replay',false);
exception when unique_violation then select * into v_existing from public.depenses where idempotency_key=p_idempotency_key; if found then return jsonb_build_object('depense_id',v_existing.id,'numero',v_existing.numero_depense,'idempotent_replay',true); end if; raise;
end $$;

create function public.add_cash_adjustment(p_type public.cash_movement_type,p_montant numeric,p_motif text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_role public.app_role; v_session uuid; v_existing uuid; v_id uuid;
begin
 if v_user is null then raise exception 'Authentification requise'; end if; select role into v_role from public.profiles where id=v_user and is_active;
 if v_role is null or v_role not in ('admin','gestionnaire') then raise exception 'Action non autorisée'; end if;
 if p_type not in ('entree_manuelle','sortie_manuelle') or p_montant is null or p_montant<=0 or nullif(trim(p_motif),'') is null or p_idempotency_key is null then raise exception 'Ajustement invalide'; end if;
 select id into v_existing from public.mouvements_caisse where idempotency_key=p_idempotency_key; if found then return jsonb_build_object('mouvement_id',v_existing,'idempotent_replay',true); end if;
 select id into v_session from public.sessions_caisse where statut='ouverte' for update; if not found then raise exception 'Aucune caisse n''est ouverte.'; end if;
 insert into public.mouvements_caisse(session_caisse_id,type_mouvement,sens,montant,libelle,idempotency_key,created_by)
 values(v_session,p_type,case when p_type='entree_manuelle' then 'entree'::public.cash_direction else 'sortie'::public.cash_direction end,p_montant,trim(p_motif),p_idempotency_key,v_user) returning id into v_id;
 return jsonb_build_object('mouvement_id',v_id,'idempotent_replay',false);
exception when unique_violation then select id into v_existing from public.mouvements_caisse where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('mouvement_id',v_existing,'idempotent_replay',true); end if; raise;
end $$;

create function public.record_client_cash_payment() returns trigger language plpgsql set search_path='' as $$
declare v_session uuid; v_user uuid;
begin if new.mode<>'especes' then return new; end if; select id into v_session from public.sessions_caisse where statut='ouverte' for update; if not found then raise exception 'Aucune caisse n''est ouverte.'; end if;
 select user_id into v_user from public.ventes where id=new.vente_id;
 insert into public.mouvements_caisse(session_caisse_id,type_mouvement,sens,montant,reference_type,reference_id,libelle,created_by)
 values(v_session,'vente','entree',new.montant,'paiement_client',new.id,'Vente espèces',v_user) on conflict do nothing; return new; end $$;
create trigger paiements_record_cash after insert on public.paiements for each row execute function public.record_client_cash_payment();
revoke all on function public.record_client_cash_payment() from public,anon,authenticated;

create function public.record_supplier_cash_payment() returns trigger language plpgsql set search_path='' as $$
declare v_session uuid;
begin if new.mode_paiement<>'especes' then return new; end if; select id into v_session from public.sessions_caisse where statut='ouverte' for update; if not found then raise exception 'Aucune caisse n''est ouverte.'; end if;
 insert into public.mouvements_caisse(session_caisse_id,type_mouvement,sens,montant,reference_type,reference_id,libelle,created_by)
 values(v_session,'paiement_fournisseur','sortie',new.montant,'paiement_fournisseur',new.id,'Règlement fournisseur',new.created_by) on conflict do nothing; return new; end $$;
create trigger paiements_fournisseur_record_cash after insert on public.paiements_fournisseur for each row execute function public.record_supplier_cash_payment();
revoke all on function public.record_supplier_cash_payment() from public,anon,authenticated;

create function public.get_cash_session_summary(p_session_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_role public.app_role; v_session public.sessions_caisse%rowtype; v_result jsonb;
begin if v_user is null then raise exception 'Authentification requise'; end if; select role into v_role from public.profiles where id=v_user and is_active;
 if v_role is null or v_role not in ('admin','gestionnaire','caissier') then raise exception 'Action non autorisée'; end if;
 if p_session_id is null then select * into v_session from public.sessions_caisse where statut='ouverte'; else select * into v_session from public.sessions_caisse where id=p_session_id; end if;
 if not found then return null; end if;
 select jsonb_build_object('id',v_session.id,'date_session',v_session.date_session,'opened_at',v_session.opened_at,'fond_ouverture',v_session.fond_ouverture,'statut',v_session.statut,'closed_at',v_session.closed_at,'solde_compte',v_session.solde_compte,'ecart',v_session.ecart,
  'ventes_especes',coalesce(sum(montant) filter(where type_mouvement='vente'),0),'autres_entrees',coalesce(sum(montant) filter(where type_mouvement='entree_manuelle'),0),
  'depenses_especes',coalesce(sum(montant) filter(where type_mouvement='depense'),0),'paiements_fournisseurs_especes',coalesce(sum(montant) filter(where type_mouvement='paiement_fournisseur'),0),
  'autres_sorties',coalesce(sum(montant) filter(where type_mouvement='sortie_manuelle'),0),
  -- fond_ouverture est la source de verite; le mouvement d'ouverture reste un audit.
  'solde_theorique',v_session.fond_ouverture+coalesce(sum(case when type_mouvement<>'ouverture' then case when sens='entree' then montant else -montant end else 0 end),0),
  'mouvements',coalesce(jsonb_agg(jsonb_build_object('id',id,'type_mouvement',type_mouvement,'sens',sens,'montant',montant,'reference_type',reference_type,'reference_id',reference_id,'libelle',libelle,'created_at',created_at) order by created_at,id),'[]'::jsonb)) into v_result
 from public.mouvements_caisse where session_caisse_id=v_session.id; return v_result; end $$;

create function public.close_cash_session(p_session_id uuid,p_comptage jsonb,p_note text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_role public.app_role; v_session public.sessions_caisse%rowtype; v_theoretical numeric(14,2); v_counted numeric(14,2);
begin if v_user is null then raise exception 'Authentification requise'; end if; select role into v_role from public.profiles where id=v_user and is_active;
 if v_role is null or v_role not in ('admin','gestionnaire','caissier') then raise exception 'Action non autorisée'; end if;
 if p_idempotency_key is null or jsonb_typeof(p_comptage)<>'array' or jsonb_array_length(p_comptage)=0 then raise exception 'Comptage invalide'; end if;
 select * into v_session from public.sessions_caisse where id=p_session_id for update; if not found then raise exception 'Caisse introuvable'; end if;
 if v_session.statut='cloturee' then return jsonb_build_object('session_id',v_session.id,'solde_theorique',v_session.solde_theorique,'solde_compte',v_session.solde_compte,'ecart',v_session.ecart,'idempotent_replay',true); end if;
 if exists(select 1 from jsonb_to_recordset(p_comptage)x(denomination integer,quantite integer) where denomination<=0 or quantite<0) or
 (select count(*) from jsonb_to_recordset(p_comptage)x(denomination integer,quantite integer))<>(select count(distinct denomination) from jsonb_to_recordset(p_comptage)x(denomination integer,quantite integer)) then raise exception 'Comptage invalide'; end if;
 select v_session.fond_ouverture+coalesce(sum(case when type_mouvement<>'ouverture' then case when sens='entree' then montant else -montant end else 0 end),0) into v_theoretical from public.mouvements_caisse where session_caisse_id=p_session_id;
 select coalesce(sum(denomination*quantite),0) into v_counted from jsonb_to_recordset(p_comptage)x(denomination integer,quantite integer);
 insert into public.comptages_caisse(session_caisse_id,denomination,quantite) select p_session_id,denomination,quantite from jsonb_to_recordset(p_comptage)x(denomination integer,quantite integer);
 update public.sessions_caisse set statut='cloturee',closed_by=v_user,closed_at=now(),solde_theorique=v_theoretical,solde_compte=v_counted,ecart=v_counted-v_theoretical,note_cloture=nullif(trim(p_note),''),close_idempotency_key=p_idempotency_key where id=p_session_id;
 return jsonb_build_object('session_id',p_session_id,'solde_theorique',v_theoretical,'solde_compte',v_counted,'ecart',v_counted-v_theoretical,'idempotent_replay',false); end $$;

create function public.get_expenses_overview(p_from date default null,p_to date default null,p_categorie_id uuid default null,p_mode public.expense_payment_method default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$ declare v_user uuid:=auth.uid();v_role public.app_role;v_result jsonb;
begin if v_user is null then raise exception 'Authentification requise'; end if;select role into v_role from public.profiles where id=v_user and is_active;if v_role is null or v_role not in('admin','gestionnaire') then raise exception 'Action non autorisée';end if;
select jsonb_build_object('depenses',coalesce(jsonb_agg(to_jsonb(x) order by x.date_depense desc,x.created_at desc),'[]'::jsonb),'jour',coalesce(sum(x.montant)filter(where x.date_depense=current_date),0),'mois',coalesce(sum(x.montant)filter(where date_trunc('month',x.date_depense)=date_trunc('month',current_date)),0),'nombre',count(x.id)) into v_result from(select d.*,c.nom categorie_nom,p.full_name created_by_name from public.depenses d join public.categories_depense c on c.id=d.categorie_id join public.profiles p on p.id=d.created_by where(p_from is null or d.date_depense>=p_from)and(p_to is null or d.date_depense<=p_to)and(p_categorie_id is null or d.categorie_id=p_categorie_id)and(p_mode is null or d.mode_paiement=p_mode))x;return v_result;end $$;

create function public.daily_operating_summary(p_date date default current_date) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare v_user uuid:=auth.uid();v_role public.app_role;v_result jsonb;
begin if v_user is null then raise exception 'Authentification requise';end if;select role into v_role from public.profiles where id=v_user and is_active;if v_role is null or v_role not in('admin','gestionnaire')then raise exception 'Action non autorisée';end if;
select jsonb_build_object('chiffre_affaires',coalesce((select sum(total_final)from public.ventes where statut='payee'and created_at::date=p_date),0),'encaissements_clients',coalesce((select sum(pa.montant)from public.paiements pa where pa.created_at::date=p_date),0),'achats_receptionnes',coalesce((select sum(total)from public.achats where date_reception::date=p_date),0),'paiements_fournisseurs',coalesce((select sum(montant)from public.paiements_fournisseur where created_at::date=p_date),0),'depenses_exploitation',coalesce((select sum(montant)from public.depenses where date_depense=p_date),0),'ventes_especes',coalesce((select sum(montant)from public.paiements where mode='especes'and created_at::date=p_date),0),'ventes_mobile_money',coalesce((select sum(montant)from public.paiements where mode in('orange_money','moov_money')and created_at::date=p_date),0),'solde_caisse_especes',coalesce((select sum(s.fond_ouverture+coalesce((select sum(case when m.sens='entree'then m.montant else -m.montant end)from public.mouvements_caisse m where m.session_caisse_id=s.id and m.type_mouvement<>'ouverture'),0))from public.sessions_caisse s where s.date_session=p_date),0),'ecart_caisse',coalesce((select sum(ecart)from public.sessions_caisse where closed_at::date=p_date),0),'cout_matiere_estime',coalesce((select sum(-ms.quantite*ms.cout_unitaire_snapshot)from public.mouvements_stock ms where ms.type_mouvement='vente'and ms.created_at::date=p_date),0)) into v_result;
return v_result||jsonb_build_object('resultat_operationnel_simplifie',(v_result->>'chiffre_affaires')::numeric-(v_result->>'cout_matiere_estime')::numeric-(v_result->>'depenses_exploitation')::numeric);end $$;

create function public.dashboard_cash_stats() returns jsonb language plpgsql stable security definer set search_path='' as $$ declare v_user uuid:=auth.uid();v_role public.app_role;v_daily jsonb;v_cash jsonb;v_last numeric;
begin if v_user is null then raise exception 'Authentification requise';end if;select role into v_role from public.profiles where id=v_user and is_active;if v_role is null or v_role not in('admin','gestionnaire','caissier')then raise exception 'Action non autorisée';end if;
if v_role in('admin','gestionnaire')then v_daily:=public.daily_operating_summary(current_date);else v_daily:='{}'::jsonb;end if;v_cash:=public.get_cash_session_summary(null);select ecart into v_last from public.sessions_caisse where statut='cloturee'order by closed_at desc limit 1;
return jsonb_build_object('caisse_ouverte',v_cash is not null,'solde_theorique',coalesce((v_cash->>'solde_theorique')::numeric,0),'ecart_derniere_cloture',coalesce(v_last,0),'depenses_du_jour',coalesce((v_daily->>'depenses_exploitation')::numeric,0),'resultat_operationnel_simplifie',coalesce((v_daily->>'resultat_operationnel_simplifie')::numeric,0));end $$;

revoke all on function public.save_expense_category(uuid,text,text,integer,boolean),public.open_cash_session(numeric,uuid),public.create_expense(uuid,uuid,text,numeric,public.expense_payment_method,text,text,date),public.add_cash_adjustment(public.cash_movement_type,numeric,text,uuid),public.get_cash_session_summary(uuid),public.close_cash_session(uuid,jsonb,text,uuid),public.get_expenses_overview(date,date,uuid,public.expense_payment_method),public.daily_operating_summary(date),public.dashboard_cash_stats() from public,anon;
grant execute on function public.save_expense_category(uuid,text,text,integer,boolean),public.open_cash_session(numeric,uuid),public.create_expense(uuid,uuid,text,numeric,public.expense_payment_method,text,text,date),public.add_cash_adjustment(public.cash_movement_type,numeric,text,uuid),public.get_cash_session_summary(uuid),public.close_cash_session(uuid,jsonb,text,uuid),public.get_expenses_overview(date,date,uuid,public.expense_payment_method),public.daily_operating_summary(date),public.dashboard_cash_stats() to authenticated;
grant usage on type public.cash_session_status,public.cash_movement_type,public.cash_direction,public.expense_payment_method to authenticated;

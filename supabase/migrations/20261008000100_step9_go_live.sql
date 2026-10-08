-- MG DELICES - Etape 9 : mise en production.
-- Migration additive uniquement. Les lignes historiques restent identifiables par
-- session_caisse_id IS NULL ; toute nouvelle operation financiere exige une session.

alter table public.ventes add column if not exists session_caisse_id uuid references public.sessions_caisse(id) on delete restrict;
alter table public.paiements add column if not exists session_caisse_id uuid references public.sessions_caisse(id) on delete restrict;
alter table public.paiements add column if not exists created_by uuid references public.profiles(id) on delete restrict;
alter table public.paiements_fournisseur add column if not exists session_caisse_id uuid references public.sessions_caisse(id) on delete restrict;
alter table public.depenses add column if not exists session_caisse_id uuid references public.sessions_caisse(id) on delete restrict;
alter table public.remboursements_clients add column if not exists session_caisse_id uuid references public.sessions_caisse(id) on delete restrict;

create index if not exists ventes_session_caisse_idx on public.ventes(session_caisse_id, created_at desc);
create index if not exists paiements_session_caisse_idx on public.paiements(session_caisse_id, created_at desc);
create index if not exists paiements_fournisseur_session_caisse_idx on public.paiements_fournisseur(session_caisse_id, created_at desc);
create index if not exists depenses_session_caisse_idx on public.depenses(session_caisse_id, created_at desc);
create index if not exists remboursements_clients_session_caisse_idx on public.remboursements_clients(session_caisse_id, created_at desc);

create or replace function public.attach_open_cash_session() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_session_id uuid;
begin
  select id into v_session_id from public.sessions_caisse where statut = 'ouverte' for update;
  if not found then
    raise exception 'Veuillez ouvrir une session de caisse avant d''effectuer une opération financière.';
  end if;
  new.session_caisse_id := v_session_id;
  return new;
end;
$$;
revoke all on function public.attach_open_cash_session() from public, anon, authenticated;

create or replace function public.attach_payment_actor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  new.created_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.attach_payment_actor() from public, anon, authenticated;

drop trigger if exists ventes_require_open_cash_session on public.ventes;
create trigger ventes_require_open_cash_session before insert on public.ventes for each row execute function public.attach_open_cash_session();
drop trigger if exists paiements_require_open_cash_session on public.paiements;
create trigger paiements_require_open_cash_session before insert on public.paiements for each row execute function public.attach_open_cash_session();
drop trigger if exists paiements_attach_actor on public.paiements;
create trigger paiements_attach_actor before insert on public.paiements for each row execute function public.attach_payment_actor();
drop trigger if exists paiements_fournisseur_require_open_cash_session on public.paiements_fournisseur;
create trigger paiements_fournisseur_require_open_cash_session before insert on public.paiements_fournisseur for each row execute function public.attach_open_cash_session();
drop trigger if exists depenses_require_open_cash_session on public.depenses;
create trigger depenses_require_open_cash_session before insert on public.depenses for each row execute function public.attach_open_cash_session();
drop trigger if exists remboursements_clients_require_open_cash_session on public.remboursements_clients;
create trigger remboursements_clients_require_open_cash_session before insert on public.remboursements_clients for each row execute function public.attach_open_cash_session();

comment on column public.ventes.session_caisse_id is 'Session globale ouverte lors de la validation de la vente. NULL uniquement pour historique pre-Etape 9.';
comment on column public.paiements.created_by is 'Operateur reel du reglement, distinct de l utilisateur ayant ouvert la session.';

create or replace function public.get_inventories_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisee'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'numero', i.numero, 'statut', i.statut, 'note', i.note,
    'created_at', i.created_at, 'validated_at', i.validated_at,
    'utilisateur', p.full_name, 'nombre_matieres', coalesce(a.nombre_matieres, 0),
    'stock_theorique', coalesce(a.stock_theorique, 0), 'stock_physique', a.stock_physique,
    'ecart', a.ecart, 'valeur_ecart', a.valeur_ecart
  ) order by i.created_at desc), '[]'::jsonb) into v_result
  from public.inventaires i
  join public.profiles p on p.id = i.created_by
  left join lateral (
    select count(*) nombre_matieres, sum(l.stock_theorique_snapshot) stock_theorique,
      sum(l.quantite_comptee) stock_physique,
      sum(l.quantite_comptee - l.stock_theorique_snapshot) ecart,
      sum((l.quantite_comptee - l.stock_theorique_snapshot) * m.cout_unitaire_moyen) valeur_ecart
    from public.inventaire_lignes l join public.matieres_premieres m on m.id = l.matiere_premiere_id
    where l.inventaire_id = i.id
  ) a on true;
  return v_result;
end;
$$;
revoke all on function public.get_inventories_overview() from public, anon;
grant execute on function public.get_inventories_overview() to authenticated;

alter table public.profiles add column if not exists last_login_at timestamptz;
create or replace function public.record_current_user_login() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  update public.profiles set last_login_at = now() where id = auth.uid() and is_active;
  if not found then raise exception 'Compte inactif'; end if;
end;
$$;
revoke all on function public.record_current_user_login() from public, anon;
grant execute on function public.record_current_user_login() to authenticated;

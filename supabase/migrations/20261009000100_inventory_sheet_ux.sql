-- RestoPRO - fiche d'inventaire plein ecran.
-- Migration additive : persistance des annotations de ligne et sauvegarde du brouillon en lot.

alter table public.inventaire_lignes
  add column motif text,
  add column commentaire text,
  add constraint inventaire_lignes_motif_check check (
    motif is null or motif in (
      'perte', 'casse', 'peremption', 'erreur_saisie',
      'consommation_non_enregistree', 'surplus', 'autre'
    )
  );

create function public.save_inventory_draft(
  p_inventaire_id uuid,
  p_note text,
  p_lignes jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_line jsonb;
  v_matiere_id uuid;
  v_quantity numeric;
  v_precision integer;
  v_motif text;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisee'; end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then raise exception 'Lignes d''inventaire invalides'; end if;
  if not exists (
    select 1 from public.inventaires where id = p_inventaire_id and statut = 'brouillon' for update
  ) then raise exception 'Inventaire introuvable ou deja valide'; end if;

  update public.inventaires set note = nullif(trim(p_note), '') where id = p_inventaire_id;

  for v_line in select value from jsonb_array_elements(p_lignes) loop
    begin
      v_matiere_id := (v_line ->> 'matiere_id')::uuid;
      v_quantity := case
        when not (v_line ? 'quantite_comptee') or jsonb_typeof(v_line -> 'quantite_comptee') = 'null' then null
        else (v_line ->> 'quantite_comptee')::numeric
      end;
    exception when others then
      raise exception 'Ligne d''inventaire invalide';
    end;
    v_motif := nullif(trim(v_line ->> 'motif'), '');
    if v_motif is not null and v_motif not in (
      'perte', 'casse', 'peremption', 'erreur_saisie',
      'consommation_non_enregistree', 'surplus', 'autre'
    ) then raise exception 'Motif d''inventaire invalide'; end if;
    if v_quantity is not null then
      if v_quantity < 0 then raise exception 'Quantite comptee invalide'; end if;
      select u.precision_decimale into v_precision
      from public.matieres_premieres m join public.unites u on u.id = m.unite_id
      where m.id = v_matiere_id;
      if not found or not public.quantity_respects_precision(v_quantity, v_precision) then
        raise exception 'Precision de quantite invalide pour cette unite';
      end if;
    end if;
    update public.inventaire_lignes
    set quantite_comptee = v_quantity,
        motif = v_motif,
        commentaire = nullif(trim(v_line ->> 'commentaire'), '')
    where inventaire_id = p_inventaire_id and matiere_premiere_id = v_matiere_id;
    if not found then raise exception 'Ligne d''inventaire introuvable'; end if;
  end loop;
end;
$$;

create or replace function public.get_inventory_detail(p_inventaire_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_role public.app_role; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentification requise'; end if;
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_role is null or v_role not in ('admin', 'gestionnaire') then raise exception 'Action non autorisee'; end if;
  select jsonb_build_object(
    'id', i.id, 'numero', i.numero, 'statut', i.statut, 'note', i.note,
    'created_at', i.created_at, 'validated_at', i.validated_at,
    'utilisateur', creator.full_name, 'validated_by_name', validator.full_name,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', il.id, 'matiere_id', m.id, 'matiere_code', m.code,
        'matiere_nom', m.nom, 'unite_code', u.code,
        'precision_decimale', u.precision_decimale,
        'stock_theorique', il.stock_theorique_snapshot, 'stock_minimum', m.stock_minimum,
        'quantite_comptee', il.quantite_comptee,
        'ecart', case when il.quantite_comptee is null then null else il.quantite_comptee - il.stock_theorique_snapshot end,
        'motif', il.motif, 'commentaire', il.commentaire
      ) order by m.nom)
      from public.inventaire_lignes il
      join public.matieres_premieres m on m.id = il.matiere_premiere_id
      join public.unites u on u.id = m.unite_id
      where il.inventaire_id = i.id
    ), '[]'::jsonb)
  ) into v_result
  from public.inventaires i
  join public.profiles creator on creator.id = i.created_by
  left join public.profiles validator on validator.id = i.validated_by
  where i.id = p_inventaire_id;
  if v_result is null then raise exception 'Inventaire introuvable'; end if;
  return v_result;
end;
$$;

revoke all on function public.save_inventory_draft(uuid, text, jsonb) from public, anon;
grant execute on function public.save_inventory_draft(uuid, text, jsonb) to authenticated;

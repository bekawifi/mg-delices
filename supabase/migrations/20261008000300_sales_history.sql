-- Historique de ventes paginé pour la caisse. Lecture seule : aucune donnée métier n'est modifiée.
create function public.search_sales_history(
  p_search text default null,
  p_date date default null,
  p_limit integer default 10,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role public.app_role;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(p_search), '');
  v_rows jsonb;
  v_total bigint;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_user and p.is_active;

  if v_role is null or v_role not in ('admin', 'gestionnaire', 'caissier') then
    raise exception 'Action non autorisee';
  end if;

  select count(*) into v_total
  from public.ventes v
  join public.profiles cashier on cashier.id = v.user_id
  left join public.clients customer on customer.id = v.client_id
  where (p_date is null or v.created_at::date = p_date)
    and (
      v_search is null
      or v.numero ilike '%' || v_search || '%'
      or coalesce(customer.nom, '') ilike '%' || v_search || '%'
      or cashier.full_name ilike '%' || v_search || '%'
      or to_char(v.created_at, 'DD/MM/YYYY HH24:MI') ilike '%' || v_search || '%'
      or exists (
        select 1 from public.paiements payment
        where payment.vente_id = v.id
          and (
            payment.mode::text ilike '%' || v_search || '%'
            or (lower(v_search) in ('especes', 'espèces') and payment.mode = 'especes')
          )
      )
    );

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc, row_data.id desc), '[]'::jsonb)
  into v_rows
  from (
    select
      v.id,
      v.numero,
      v.created_at,
      v.type_commande,
      v.total_final,
      v.montant_paye,
      v.reste_a_payer,
      v.statut_paiement,
      coalesce(customer.nom, 'Vente anonyme') as client,
      cashier.full_name as caissier,
      primary_payment.mode::text as mode_paiement
    from public.ventes v
    join public.profiles cashier on cashier.id = v.user_id
    left join public.clients customer on customer.id = v.client_id
    left join lateral (
      select payment.mode
      from public.paiements payment
      where payment.vente_id = v.id
      order by payment.created_at, payment.id
      limit 1
    ) primary_payment on true
    where (p_date is null or v.created_at::date = p_date)
      and (
        v_search is null
        or v.numero ilike '%' || v_search || '%'
        or coalesce(customer.nom, '') ilike '%' || v_search || '%'
        or cashier.full_name ilike '%' || v_search || '%'
        or to_char(v.created_at, 'DD/MM/YYYY HH24:MI') ilike '%' || v_search || '%'
        or exists (
          select 1 from public.paiements payment
          where payment.vente_id = v.id
            and (
              payment.mode::text ilike '%' || v_search || '%'
              or (lower(v_search) in ('especes', 'espèces') and payment.mode = 'especes')
            )
        )
      )
    order by v.created_at desc, v.id desc
    limit v_limit offset v_offset
  ) row_data;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + jsonb_array_length(v_rows) < v_total
  );
end;
$$;

revoke all on function public.search_sales_history(text, date, integer, integer) from public, anon;
grant execute on function public.search_sales_history(text, date, integer, integer) to authenticated;

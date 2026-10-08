-- LECTURE SEULE : exécuter dans SQL Editor, sauvegarder le résultat, ne rien supprimer.
select 'profiles_test' source, count(*) total from public.profiles p join auth.users u on u.id=p.id where lower(u.email) like '%test%' or lower(u.email) like '%.test%'
union all select 'produits_demo',count(*) from public.produits where lower(nom) similar to '%(test|demo|démo)%'
union all select 'fournisseurs_demo',count(*) from public.fournisseurs where lower(coalesce(notes,'')||' '||nom) similar to '%(test|démonstration|demo)%'
union all select 'clients_test',count(*) from public.clients where lower(coalesce(email,'')||' '||nom) similar to '%(test|example)%'
union all select 'zones_tables_demo',count(*) from public.zones where lower(nom) similar to '%(test|demo|démo)%'
union all select 'ventes_test',count(*) from public.ventes v join public.profiles p on p.id=v.user_id join auth.users u on u.id=p.id where lower(u.email) like '%test%'
union all select 'sessions_test',count(*) from public.sessions_caisse s join auth.users u on u.id=s.opened_by where lower(u.email) like '%test%'
union all select 'inventaires_test',count(*) from public.inventaires i join auth.users u on u.id=i.created_by where lower(u.email) like '%test%'
union all select 'remboursements_test',count(*) from public.remboursements_clients r join auth.users u on u.id=r.created_by where lower(u.email) like '%test%';

select u.email,p.full_name,p.role,p.is_active,p.last_login_at from auth.users u join public.profiles p on p.id=u.id
where lower(u.email) like '%test%' or lower(u.email) like '%.test%' order by u.email;

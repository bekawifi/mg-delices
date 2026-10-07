-- Données non sensibles, exclusivement destinées au développement et aux tests.
-- Exécuter avec `supabase db reset` en local ou manuellement sur une instance de test.

insert into public.categories (nom, ordre, actif) values
  ('Plats', 10, true),
  ('Grillades', 20, true),
  ('Boissons', 30, true),
  ('Desserts', 40, true),
  ('Accompagnements', 50, true)
on conflict (nom) do update set ordre = excluded.ordre, actif = excluded.actif;

insert into public.produits (categorie_id, nom, description, prix_vente, cout_estime, disponible)
select c.id, v.nom, v.description, v.prix_vente, v.cout_estime, true
from (values
  ('Plats', 'Riz sauce', 'Riz accompagné de la sauce du jour', 1500::numeric, 700::numeric),
  ('Grillades', 'Poulet braisé', 'Poulet braisé et assaisonné', 3500::numeric, 2100::numeric),
  ('Grillades', 'Poisson braisé', 'Poisson entier braisé', 3000::numeric, 1800::numeric),
  ('Accompagnements', 'Frites', 'Portion de frites', 1000::numeric, 400::numeric),
  ('Boissons', 'Eau', 'Bouteille d’eau', 500::numeric, 200::numeric),
  ('Boissons', 'Coca-Cola', 'Boisson gazeuse', 700::numeric, 350::numeric)
) as v(categorie, nom, description, prix_vente, cout_estime)
join public.categories c on c.nom = v.categorie
where not exists (select 1 from public.produits p where p.nom = v.nom);

insert into public.zones (nom, ordre, actif) values
  ('Salle principale', 10, true), ('Terrasse', 20, true), ('VIP', 30, true)
on conflict (nom) do update set ordre = excluded.ordre, actif = excluded.actif;

insert into public.tables_restaurant (zone_id, nom, numero, capacite, actif)
select z.id, v.nom, v.numero, v.capacite, true
from (values
  ('Salle principale', 'Table 1', 1, 4),
  ('Salle principale', 'Table 2', 2, 4),
  ('Terrasse', 'Table 3', 1, 2),
  ('VIP', 'Table VIP', 1, 8)
) as v(zone_nom, nom, numero, capacite)
join public.zones z on z.nom = v.zone_nom
where not exists (select 1 from public.tables_restaurant t where t.zone_id = z.id and t.numero = v.numero);

insert into public.unites (code, nom, precision_decimale, actif) values
  ('piece', 'Pièce', 0, true),
  ('kg', 'Kilogramme', 3, true),
  ('litre', 'Litre', 3, true),
  ('bouteille', 'Bouteille', 0, true)
on conflict (code) do update set nom = excluded.nom, precision_decimale = excluded.precision_decimale, actif = excluded.actif;

insert into public.matieres_premieres (code, nom, unite_id, stock_actuel, stock_minimum, cout_unitaire_moyen, actif)
select v.code, v.nom, u.id, v.stock_initial, v.stock_minimum, v.cout, true
from (values
  ('POULET', 'Poulet', 'piece', 0::numeric, 2::numeric, 2000::numeric),
  ('RIZ', 'Riz', 'kg', 0::numeric, 3::numeric, 1000::numeric),
  ('HUILE', 'Huile', 'litre', 0::numeric, 1::numeric, 1500::numeric),
  ('POISSON', 'Poisson', 'piece', 0::numeric, 2::numeric, 1800::numeric),
  ('COCA-BTL', 'Coca-Cola bouteille', 'bouteille', 0::numeric, 4::numeric, 350::numeric),
  ('EAU-BTL', 'Eau bouteille', 'bouteille', 0::numeric, 4::numeric, 200::numeric),
  ('EPICES', 'Épices', 'kg', 0::numeric, 0.25::numeric, 4000::numeric)
) as v(code, nom, unite_code, stock_initial, stock_minimum, cout)
join public.unites u on u.code = v.unite_code
where not exists (select 1 from public.matieres_premieres m where m.code = v.code);

-- Recettes de démonstration : créées seulement si le produit existe et n'a pas déjà de recette active.
with recipe_data(produit_nom, recette_nom) as (values
  ('Poulet braisé', 'Poulet braisé standard'),
  ('Poisson braisé', 'Poisson braisé standard')
)
insert into public.recettes (produit_id, nom, rendement_quantite, actif)
select p.id, d.recette_nom, 1, true from recipe_data d join public.produits p on p.nom = d.produit_nom
where not exists (select 1 from public.recettes r where r.produit_id = p.id and r.actif);

insert into public.recette_ingredients (recette_id, matiere_premiere_id, quantite)
select r.id, m.id, x.quantite
from (values
  ('Poulet braisé', 'POULET', 1::numeric), ('Poulet braisé', 'HUILE', 0.05::numeric), ('Poulet braisé', 'EPICES', 0.02::numeric),
  ('Poisson braisé', 'POISSON', 1::numeric), ('Poisson braisé', 'HUILE', 0.05::numeric), ('Poisson braisé', 'EPICES', 0.02::numeric)
) as x(produit_nom, matiere_code, quantite)
join public.produits p on p.nom = x.produit_nom
join public.recettes r on r.produit_id = p.id and r.actif
join public.matieres_premieres m on m.code = x.matiere_code
on conflict (recette_id, matiere_premiere_id) do nothing;

insert into public.fournisseurs(code, nom, telephone, email, adresse, notes, actif) values
  ('FOUR-MARCHE', 'Fournisseur Marché Central', '+225 00 00 00 00 01', null, 'Marché central', 'Fournisseur de démonstration', true),
  ('FOUR-BOISSONS', 'Grossiste Boissons', '+225 00 00 00 00 02', null, null, 'Fournisseur de démonstration', true)
on conflict (code) do update set nom = excluded.nom, telephone = excluded.telephone,
  adresse = excluded.adresse, notes = excluded.notes, actif = excluded.actif;

insert into public.categories_depense(code,nom,ordre,actif) values
 ('GAZ','Gaz',10,true),('TRANSPORT','Transport',20,true),('ELECTRICITE','Électricité',30,true),
 ('EAU','Eau',40,true),('NETTOYAGE','Nettoyage',50,true),('ENTRETIEN','Entretien',60,true),('AUTRE','Autre',100,true)
on conflict(code) do update set nom=excluded.nom,ordre=excluded.ordre,actif=excluded.actif;

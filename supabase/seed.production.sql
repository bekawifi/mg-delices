-- Référentiels minimaux de production. Aucun client, fournisseur, produit,
-- table, vente, achat, stock ou compte utilisateur fictif.
insert into public.unites(code, nom, precision_decimale, actif) values
  ('piece', 'Pièce', 0, true), ('kg', 'Kilogramme', 3, true),
  ('litre', 'Litre', 3, true), ('bouteille', 'Bouteille', 0, true)
on conflict(code) do update set nom=excluded.nom, precision_decimale=excluded.precision_decimale, actif=excluded.actif;

insert into public.categories_depense(code, nom, ordre, actif) values
  ('GAZ','Gaz',10,true),('TRANSPORT','Transport',20,true),('ELECTRICITE','Électricité',30,true),
  ('EAU','Eau',40,true),('NETTOYAGE','Nettoyage',50,true),('ENTRETIEN','Entretien',60,true),('AUTRE','Autre',100,true)
on conflict(code) do update set nom=excluded.nom, ordre=excluded.ordre, actif=excluded.actif;

# Nettoyage des données avant ouverture

Le dépôt ne supprime aucune donnée automatiquement. Faire d’abord une sauvegarde conforme à `BACKUP-RESTORE.md`, puis exécuter uniquement `supabase/diagnostics/step9_test_data_audit.sql` en lecture seule.

## Éléments connus à contrôler

- Comptes : `admin-test@example.com`, `caissier-test@example.com`, `serveur-test@example.com`, `cuisine-test@example.com`, `inactif-test@example.com`, et tout email contenant `test` ou `example.test`.
- Seed démo : catégories Plats, Grillades, Boissons, Desserts, Accompagnements ; produits Riz sauce, Poulet braisé, Poisson braisé, Frites, Eau, Coca-Cola.
- Zones/tables : Salle principale, Terrasse, VIP, Table 1, Table 2, Table 3, Table VIP.
- Matières/recettes : POULET, RIZ, HUILE, POISSON, COCA-BTL, EAU-BTL, EPICES et recettes associées.
- Fournisseurs : FOUR-MARCHE et FOUR-BOISSONS, explicitement marqués démonstration.
- Données d’intégration : noms/emails contenant test, suffixes horodatés, ventes, commandes, achats, retours, remboursements, inventaires et sessions créés par les comptes de test.

## Ordre manuel contrôlé

1. Exporter les listes et faire valider chaque groupe par le responsable.
2. Désactiver d’abord les comptes de test ; supprimer seulement après validation et sauvegarde.
3. Sur une base réutilisée, nettoyer les transactions en respectant toutes les dépendances ; ne jamais improviser des `DELETE` en production.
4. Préférer un nouveau projet Supabase de production et y rejouer les migrations, puis `seed.production.sql`.
5. Créer les vraies zones, tables, produits, recettes, fournisseurs, stock initial et utilisateurs.
6. Rejouer le diagnostic : tous les compteurs de test doivent être expliqués ou nuls.

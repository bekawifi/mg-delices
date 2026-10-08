# Checklist production RestoPRO

## Application et données

- [ ] Tous les tests unitaires et scénarios Supabase passent sur une instance dédiée.
- [ ] Les migrations additives attendues sont appliquées dans l’ordre et sauvegardées.
- [ ] RLS, droits RPC et rôles ont été revérifiés.
- [ ] Les comptes initiaux utilisent des mots de passe uniques et les comptes inutiles sont désactivés.
- [ ] Les sauvegardes Supabase sont actives et une restauration a été répétée.
- [ ] Aucun `service_role`, mot de passe ou secret base de données n’est embarqué.
- [ ] Les variables `.env.production` pointent vers le bon projet.
- [ ] La version Web, Tauri et Cargo est identique.

## Fonctionnel

- [ ] Ventes, crédit, retours, avoirs et remboursements sont validés.
- [ ] Caisse, cuisine, stock, achats et fournisseurs sont validés.
- [ ] Rapports et exports respectent les rôles.
- [ ] Tickets 80 mm et impressions A4/PDF ont été testés sur les imprimantes cibles.
- [ ] Journal d’audit et diagnostic admin sont consultables.

## Windows

- [ ] `npm.cmd run tauri:build` réussit sur un poste Windows propre.
- [ ] Installation, menu Démarrer, lancement, reconnexion et désinstallation fonctionnent.
- [ ] CSP et capabilities restent minimales ; aucun shell ou filesystem global.
- [ ] L’icône placeholder a été remplacée par le logo final validé avant diffusion publique.
- [ ] L’installateur final est signé si un certificat est disponible.

## Mise à jour et retour arrière

- [ ] La clé privée updater est hors Git et sauvegardée de manière sûre.
- [ ] Le manifeste stable et les artefacts sont signés avant activation de l’updater.
- [ ] Une procédure de retour à la version précédente est documentée.
- [ ] La migration de base dispose d’un plan de restauration testé ; ne jamais utiliser `migration repair` comme rollback métier.

## Protocole de test d’installation

1. Construire l’installateur.
2. Installer RestoPRO.
3. Lancer et connecter un administrateur.
4. Tester tableau de bord, caisse, tables, cuisine, clients, stock, fournisseurs et rapports.
5. Tester exports et impression.
6. Fermer puis rouvrir l’application et vérifier la session.
7. Désinstaller via Windows.

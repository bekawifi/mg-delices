# Mise en service réelle

## Environnements et base

- Développement : `.env.development.local`, projet local ou isolé.
- Test : `.env.test.local`, projet dédié. Les scripts refusent de démarrer sans `MG_DELICES_ENV=test` et `MG_DELICES_ALLOW_DESTRUCTIVE_TESTS=true`.
- Production : `.env.production.local`, projet dédié, migrations seules puis `supabase/seed.production.sql`. Ne jamais exécuter `supabase/seed.sql` en production.

La stratégie recommandée est un nouveau projet Supabase de production propre : elle évite un nettoyage transactionnel risqué de l’instance ayant servi aux intégrations. Rejouer les migrations, sans modifier les anciennes ni faire de `db push` automatique.

### Exécution contrôlée des intégrations sous PowerShell

Ces commandes doivent viser exclusivement le projet Supabase de test configuré dans `.env.test.local` :

```powershell
$env:MG_DELICES_ENV="test"
$env:MG_DELICES_ALLOW_DESTRUCTIVE_TESTS="true"
npm.cmd run test:supabase
npm.cmd run test:supabase:step2
npm.cmd run test:supabase:step3
npm.cmd run test:supabase:step4
npm.cmd run test:supabase:step5
npm.cmd run test:supabase:step6
npm.cmd run test:supabase:step7
npm.cmd run test:supabase:step9
Remove-Item Env:MG_DELICES_ENV
Remove-Item Env:MG_DELICES_ALLOW_DESTRUCTIVE_TESTS
```

En automatisation, placer les deux `Remove-Item` dans un bloc `finally` afin de désarmer les tests même après un échec.

## Utilisateurs réels

L’inscription publique reste désactivée. La création Auth doit se faire via le Dashboard Supabase ou une fonction serveur protégée avec clé service, jamais depuis le navigateur. Créer le premier administrateur avec nom, email professionnel et mot de passe temporaire, puis affecter `role=admin`, `is_active=true` dans `profiles`. Exiger un changement immédiat du mot de passe.

Pour chaque utilisateur : créer Auth, vérifier le profil automatique, attribuer admin/gestionnaire/caissier/serveur/cuisine, tester la connexion, puis consigner le responsable. Désactiver via `is_active=false`; une session existante est rejetée lors du prochain contrôle métier. La dernière connexion est consultable dans Auth et `profiles.last_login_at`. Les resets passent par Supabase Auth, sans exposer la clé service.

## Imprimante thermique

Laisser Windows gérer l’imprimante par défaut. Dans Paramètres choisir 80 mm (principal) ou 58 mm. Installer le pilote, imprimer une vente et contrôler largeur, accents, `F CFA`, alignement, reste à payer et coupe papier. Répéter en 58 puis 80 mm. Le bon cuisine contient table, serveur, heure, articles, quantités et notes, jamais les prix. Toute réimpression historique doit être générée avec le marqueur `duplicata`.

## Installation multi-PC

PC caisse : rôles caisse et imprimante. PC gestionnaire : stock, achats, rapports et administration. PC cuisine : commandes cuisine uniquement. Télécharger le dernier NSIS depuis GitHub Releases, installer en utilisateur courant, se connecter, tester imprimante et updater. Node, Rust et VS Code ne sont pas requis.

Tester deux PC simultanés : prise de commande, affichage cuisine, checkout avec session ouverte, stock, clôture, puis mise à jour. Le raccourci menu Démarrer est fourni par NSIS ; un raccourci Bureau peut être créé manuellement. Le lancement Windows reste optionnel et désactivé : `Win+R`, `shell:startup`, y placer un raccourci RestoPRO si le restaurant le décide.

## Ouverture / fermeture

Ouverture : vérifier Internet et imprimante, connecter le caissier, ouvrir la caisse, confirmer fond/indicateur, vérifier stock critique et tables.

Fermeture : terminer les commandes, vérifier créances et dépenses, compter les espèces, clôturer la caisse, contrôler l’écart, consulter le rapport et confirmer la sauvegarde planifiée.

## Sécurité et updater

Protéger les comptes Windows, activer verrouillage, antivirus et mises à jour, limiter l’accès au PC caisse. Le poste restaurant contient uniquement la clé publique déjà configurée. La clé privée `mg-delices.key` reste sur la machine de développement et sa sauvegarde USB chiffrée ; elle ne doit jamais entrer dans Git, le bundle ou l’installation client.

Le bundle Vite/Tauri embarque `dist`, pas `.env.*`, les tests, les migrations ni `node_modules`. Avant livraison, inspecter le contenu NSIS et rechercher `.env`, `.key`, `supabase/tests` et `node_modules`. SmartScreen peut avertir tant qu’aucun certificat Authenticode Windows n’est utilisé ; la signature updater est distincte et déjà fonctionnelle.

## Validation deuxième PC et mise à jour

Sur un PC propre : télécharger depuis GitHub, installer, démarrer, se connecter, ouvrir/fermer l’application, tester 58/80 mm, lancer une mise à jour disponible puis vérifier version, login, caisse, impression, Supabase et rapports. Ne publier aucune release avant ce procès-verbal.

La version reste `1.0.1` tant que l’Étape 9 n’est pas validée. La future `1.1.0` regroupera la règle de session financière globale, la navigation Inventaires, l’impression production, les diagnostics/support et les procédures de mise en service.

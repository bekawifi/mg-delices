# MG DELICES

Application responsive de gestion de restaurant (React, TypeScript, Vite, Supabase et Tailwind CSS).

Version actuelle : **1.0.0**.

## Application Windows MG DELICES

MG DELICES partage une seule base React/TypeScript entre le navigateur et la coque Windows Tauri 2. L’identifiant définitif est `com.mgdelices.desktop`. La navigation utilise l’historique Web dans le navigateur et un routage par hash dans Tauri afin que le rechargement d’une route ne produise pas de page blanche.

### Prérequis Windows

- Node.js LTS et npm ;
- Rust stable avec Cargo et la cible MSVC ;
- Microsoft C++ Build Tools ;
- WebView2 Runtime ;
- NSIS, installé automatiquement par Tauri lorsque possible.

```powershell
# Web
npm.cmd run dev
npm.cmd run build

# Application Windows
npm.cmd run tauri:dev
npm.cmd run tauri:build
```

L’installateur NSIS est généré dans `src-tauri/target/release/bundle/nsis/`. Le premier build de test peut être non signé. Aucun secret serveur ne doit être placé dans l’application : seules `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont autorisées. La sécurité métier reste assurée par RLS et les RPC Supabase.

Le numéro de version doit être augmenté ensemble dans `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`. Le versionnage suit SemVer : correctif `PATCH`, fonctionnalité compatible `MINOR`, rupture `MAJOR`.

L’updater public n’est pas activé. Sa préparation, la signature et la procédure de publication sont documentées dans `docs/WINDOWS-UPDATES.md`.

## Démarrage local

```powershell
Copy-Item .env.example .env
# Renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
npm.cmd install
npm.cmd run dev
```

## Configuration Supabase

1. Créer un projet Supabase.
2. Exécuter la migration `supabase/migrations/202610060001_initial_schema.sql` via la CLI (`supabase db push`) ou l'éditeur SQL.
3. Renseigner l'URL du projet et la clé publique `anon` dans `.env`. Ne jamais exposer la clé `service_role`.
4. Créer le premier utilisateur dans **Authentication > Users**. Le trigger crée son profil automatiquement.
5. Promouvoir ce premier compte en administrateur dans l'éditeur SQL :

```sql
update public.profiles
set role = 'admin', full_name = 'Votre nom', is_active = true
where id = (select id from auth.users where email = 'votre@email.com');
```

6. En production, configurer l'URL du site et les URL de redirection autorisées dans **Authentication > URL Configuration**.

Les nouveaux profils sont inactifs par défaut. Chaque compte doit être activé explicitement après sa création.

## Tests d'intégration Supabase

Utiliser exclusivement une instance de test vide :

```powershell
Copy-Item .env.test.example .env.test.local
# Configurer la clé publique et trois comptes de test : admin actif, caissier actif, compte inactif.
npm.cmd run test:supabase
```

Avant ce test, appliquer la migration, exécuter `supabase/seed.sql`, puis régler les profils :

```sql
update public.profiles set role = 'admin', is_active = true where id = (select id from auth.users where email = 'admin-test@example.com');
update public.profiles set role = 'caissier', is_active = true where id = (select id from auth.users where email = 'caissier-test@example.com');
update public.profiles set role = 'caissier', is_active = false where id = (select id from auth.users where email = 'inactif-test@example.com');
```

Le test crée deux ventes persistantes afin de contrôler le tableau de bord. Ne pas l'exécuter sur la production.

## Étape 2 — Tables, commandes et cuisine

La migration `20261006000200_restaurant_orders.sql` ajoute le service en salle sans modifier les migrations déjà appliquées. Après l'avoir appliquée sur une instance de test, rejouer `supabase/seed.sql` pour créer les zones et tables de démonstration.

Créer également deux comptes de test supplémentaires puis leur attribuer les rôles :

```sql
update public.profiles set role = 'serveur', is_active = true
where id = (select id from auth.users where email = 'serveur-test@example.com');

update public.profiles set role = 'cuisine', is_active = true
where id = (select id from auth.users where email = 'cuisine-test@example.com');
```

Lancer le scénario complet uniquement sur une instance dédiée aux tests :

```powershell
npm.cmd run test:supabase:step2
```

Ce scénario crée une zone, une table, une commande et une vente persistantes afin de vérifier l'historique, l'idempotence et la libération de table. Il ne doit jamais être exécuté sur la production.

La clé d'idempotence est conservée pendant chaque tentative d'encaissement. Le RPC `create_sale` recalcule tous les prix depuis `produits` et garantit l'écriture atomique de la vente, de ses lignes et du paiement.

Pour une commande restaurant, `checkout_order` utilise exclusivement les prix et noms figés côté serveur dans `lignes_commande`. Une modification de prix ou de disponibilité du catalogue après la prise de commande n'altère donc jamais son encaissement.

## Étape 3 — Stock et fiches techniques

La migration additive `20261006000300_inventory_recipes.sql` ajoute les unités, matières premières, fiches techniques, mouvements de stock et inventaires. Elle doit être appliquée après les migrations des étapes 1 et 2, puis `supabase/seed.sql` peut être rejoué pour installer les données de démonstration sans dupliquer les lignes.

La sortie de stock est déclenchée dans la transaction du paiement. Le même mécanisme couvre `create_sale` et `checkout_order`, verrouille les matières concernées, refuse tout stock négatif et associe chaque mouvement à la vente. L'index d'unicité des sorties par vente et matière protège également les rejouements idempotents.

Pour une commande restaurant, `send_order_to_kitchen` fige côté serveur les quantités de matières de chaque nouvelle ligne. `checkout_order` consomme exclusivement ces snapshots, y compris si la recette est ensuite remplacée ou désactivée. Un marqueur sur la ligne représente explicitement un snapshot vide pour les produits sans fiche technique. La caisse directe continue d'utiliser la recette active au moment de la vente immédiate.

Pour exécuter le scénario complet sur une instance Supabase dédiée aux tests :

```powershell
npm.cmd run test:supabase:step3
```

Ce scénario modifie durablement les données de test et simule notamment deux encaissements concurrents. Il ne doit jamais être lancé sur une instance de production.

## Étape 4 — Fournisseurs et achats

La migration additive `20261006000400_suppliers_purchases.sql` ajoute les fournisseurs, achats, lignes d'achat, réceptions et règlements fournisseurs. La réception met à jour le stock et le coût moyen dans une transaction unique ; les soldes sont recalculés depuis les paiements immuables.

Après application des quatre migrations et du seed sur une instance dédiée aux tests :

```powershell
npm.cmd run test:supabase:step4
```

Le scénario crée des achats et paiements persistants et exécute des règlements concurrents. Ne jamais l'exécuter sur une instance de production.

## Étape 5 — Dépenses et caisse journalière

La migration additive `20261006000500_cash_expenses_closing.sql` ajoute les dépenses, la session espèces unique, le journal immuable et le comptage de clôture. Après application sur une instance de test et exécution du seed :

```powershell
npm.cmd run test:supabase:step5
```

Une caisse ouverte devient obligatoire uniquement pour les flux en espèces. Les paiements mobiles et virements restent séparés de la caisse physique.

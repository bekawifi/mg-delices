# Sauvegarde et restauration

Un export CSV est une archive fonctionnelle, pas une sauvegarde PostgreSQL. Utiliser en priorité les sauvegardes disponibles dans l’offre Supabase, plus un `pg_dump` avant toute migration importante.

## Sauvegarde manuelle

Depuis une machine d’administration sécurisée, avec une URL PostgreSQL obtenue dans Supabase et jamais enregistrée dans Git :

```powershell
pg_dump --format=custom --no-owner --no-acl --file restopro-YYYYMMDD.dump "postgresql://..."
```

Chiffrer le fichier, conserver au moins une copie hors machine et noter projet, date, version applicative et dernière migration. Tester périodiquement que le fichier est lisible avec `pg_restore --list`.

## Test de restauration

1. Créer un projet Supabase de test vide, jamais le projet de production.
2. Rejouer les migrations dans l’ordre, puis restaurer avec `pg_restore --clean --if-exists --no-owner --no-acl` selon la procédure Supabase applicable.
3. Vérifier les utilisateurs Auth et les profils, les ventes, le stock, les sessions de caisse et les paramètres.
4. Exécuter les contrôles RPC en lecture, vérifier la migration attendue et les politiques RLS.
5. Se connecter avec chaque rôle et tester une vente isolée après ouverture de caisse.
6. Détruire l’environnement de restauration une fois le compte rendu validé.

Ne jamais tester une restauration sur la production. Faire une sauvegarde immédiatement avant toute migration et conserver l’ancienne version de l’installateur.

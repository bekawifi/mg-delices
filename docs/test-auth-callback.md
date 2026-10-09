# Callback Auth Supabase TEST

Les invitations et récupérations de mot de passe TEST utilisent exclusivement :

`http://127.0.0.1:5173/auth/complete`

## Configuration Supabase TEST

Dans **Authentication > URL Configuration** :

- Site URL : `http://127.0.0.1:5173`
- Redirect URLs : ajouter exactement `http://127.0.0.1:5173/auth/complete`

Le secret Edge Function doit être configuré sans être committé :

`RESTOPRO_AUTH_REDIRECT_URL=http://127.0.0.1:5173/auth/complete`

## Test

Avant de cliquer un lien reçu, démarrer le serveur réel :

`npm.cmd run dev -- --host 127.0.0.1`

Le callback établit la session Supabase, permet de définir le mot de passe, ferme ensuite la session Web et invite l’utilisateur à se connecter dans RestoPRO.

Ne jamais copier, journaliser ou transmettre les fragments `access_token` ou `refresh_token` contenus dans les liens Auth.

## Production Desktop

Ce callback local est réservé à TEST. Pour Production, utiliser un callback HTTPS durable ou un schéma de deep link Tauri enregistré, par exemple `restopro://auth/complete`, avec validation stricte du schéma et de la destination. Ne jamais utiliser une URL localhost dans une release Production.

# Callback Auth Production RestoPRO

La cible Production est une page HTTPS statique dédiée, publiée par GitHub Pages :

`https://bekawifi.github.io/restopro/auth/complete/`

La passerelle des Edge Functions Supabase ne convient pas pour cette page : elle force les réponses HTML en `text/plain` avec une CSP `sandbox`, ce qui empêche le JavaScript du formulaire de mot de passe de s'exécuter.

La page est servie directement depuis `pages/auth/complete/index.html`. Elle ne dépend d'aucune réécriture SPA.

Exigences :

- effacer immédiatement le fragment d'URL avant tout appel réseau ;
- ne jamais afficher ni journaliser les jetons ;
- ne jamais conserver les jetons dans `localStorage` ou `sessionStorage` ;
- permettre invitation et récupération de mot de passe ;
- fermer la session Web après la définition du mot de passe ;
- demander ensuite à l'utilisateur d'ouvrir manuellement RestoPRO Desktop.

Le deep link `restopro://` est reporté : il ne doit être ajouté qu'après prise en charge et validation côté Tauri.

Une fois l'URL réellement publiée :

1. définir cette URL comme Site URL dans Supabase Auth Production ;
2. ajouter exactement cette URL aux Redirect URLs ;
3. définir `RESTOPRO_AUTH_REDIRECT_URL` avec cette URL sur l'Edge Function `admin-users` ;
4. tester invitation et récupération avec une boîte réelle contrôlée.

Ne jamais ajouter localhost à la configuration Production.

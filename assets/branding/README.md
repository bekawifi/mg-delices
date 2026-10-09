# Identité visuelle des restaurants

Ce dossier est la source unique des fichiers de marque. Aucun logo définitif n'est fourni par le dépôt.

- `logo.png` : logo horizontal, fond transparent, pour connexion, sidebar, tickets et rapports.
- `logo-square.png` : variante carrée pour les petits emplacements.
- `icon-source.png` : source carrée PNG, idéalement 1024 × 1024, pour Windows.

Après validation graphique, remplacer ces fichiers puis exécuter depuis la racine :

```powershell
npm.cmd run tauri icon assets/branding/icon-source.png
```

Vérifier ensuite l’écran de connexion, la sidebar, un ticket 58/80 mm, un PDF, l’écran À propos et l’installateur NSIS. Ne jamais placer de clé ou de secret dans ce dossier.

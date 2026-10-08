# Signature updater Tauri

## Paire existante obligatoire

RestoPRO conserve strictement la paire updater déjà utilisée par MG DELICES. Ne jamais exécuter `tauri signer generate`, ne jamais remplacer `plugins.updater.pubkey` et ne jamais créer une nouvelle paire pour cette lignée. La clé privée existante reste hors du dépôt ; seul son propriétaire la charge dans une session de build autorisée.

## Stockage

- Garder `mg-delices.key` hors du dépôt, par exemple dans `C:\Users\HP\.tauri\`.
- Conserver au moins deux sauvegardes chiffrées, sur deux emplacements contrôlés par le propriétaire.
- Ne jamais envoyer la clé par email, WhatsApp, messagerie ou dépôt Git.
- Ne jamais la placer dans `src`, `src-tauri`, `docs` ou un fichier `.env` committé.
- La perte de cette clé empêche de publier des mises à jour compatibles avec les installations existantes.

Les motifs `*.key` et `*.key.pub` sont ignorés par Git par défense supplémentaire.

## Build signé dans la session PowerShell courante

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\mg-delices.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Read-Host "Mot de passe de la clé (session courante uniquement)"
npm.cmd run tauri:build
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Si la clé n’a pas de mot de passe, définir `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` à une chaîne vide. Ces valeurs valent uniquement pour la session courante et ne doivent pas être écrites dans le code ou un `.env`.

## Nouveau PC de développement

1. Cloner le dépôt et installer Node.js, Rust et MSVC.
2. Restaurer **la même clé privée** depuis une sauvegarde sécurisée.
3. Configurer les deux variables d’environnement dans la session de build.
4. Exécuter les tests, le contrôle de version et le build signé.

Ne jamais générer une nouvelle paire pour continuer la même lignée de mises à jour.

## Deux signatures indépendantes

- La signature updater Tauri vérifie l’intégrité et l’origine des mises à jour. Elle est obligatoire pour l’updater.
- La signature Authenticode Windows prouve l’identité de l’éditeur et réduit les avertissements SmartScreen. Elle nécessite un certificat d’éditeur distinct.

L’absence de certificat Authenticode n’empêche pas de tester localement l’updater signé Tauri.

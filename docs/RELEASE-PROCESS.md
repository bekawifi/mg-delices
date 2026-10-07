# Procédure de release Windows

## Version unique

Les versions de `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json` doivent être identiques. Vérifier avant chaque release :

```powershell
npm.cmd run version:check
```

## Première future mise à jour : 1.0.0 vers 1.0.1

1. Modifier et relire le code sur une branche contrôlée.
2. Régler la version `1.0.1` dans les trois fichiers, puis exécuter `npm.cmd run version:check`.
3. Exécuter `npm.cmd test` et `npm.cmd run build`.
4. Exécuter uniquement les suites Supabase concernées, sur l’instance de test dédiée. Ne jamais faire de `db push` dans cette procédure.
5. Charger la clé privée dans les variables de la session PowerShell conformément à `TAURI-SIGNING.md`.
6. Exécuter `npm.cmd run tauri:build`.
7. Récupérer l’installateur `.exe` et son `.sig` dans `src-tauri/target/release/bundle/nsis/`.
8. Copier le contenu du `.sig` et construire `latest.json` depuis `docs/latest.example.json`.
9. Créer manuellement une GitHub Release et y joindre l’installateur et `latest.json`.
10. Sur une machine de test équipée de la base 1.0.0 correctement configurée, rechercher puis installer la mise à jour.
11. Vérifier le démarrage, l’absence de console noire, les fonctions principales et la version 1.0.1 affichée.

Aucune release ni aucun workflow de publication automatique n’est créé à cette étape, car le dépôt GitHub final n’est pas connu.

## `latest.json`

Le manifeste suit le format Tauri 2. Pour Windows x64, utiliser la clé `windows-x86_64`. `pub_date` est une date RFC 3339, l’URL doit être HTTPS et la signature est le contenu texte du `.sig`.

```json
{
  "version": "1.0.1",
  "notes": "Corrections et améliorations.",
  "pub_date": "2026-10-07T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "CONTENU_DU_FICHIER_SIG",
      "url": "URL_HTTPS_DE_L_ARTEFACT_UPDATER"
    }
  }
}
```

## Publication GitHub recommandée

Utiliser une GitHub Release stable contenant :

- `MG DELICES_1.0.1_x64-setup.exe` ;
- `MG DELICES_1.0.1_x64-setup.exe.sig` pour audit/conservation ;
- `latest.json` pointant en HTTPS vers l’installateur.

Les futurs secrets CI porteront les noms `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Aucune valeur ne doit être inscrite dans un workflow.

## Rollback

Ne pas compter sur un downgrade automatique et ne pas activer `allowDowngrades`. Si 1.0.1 est défectueuse, corriger et publier une version supérieure, par exemple 1.0.2.

## Identifiant d’application

L’identifiant définitif de la lignée de mises à jour est `com.mgdelices.desktop`. Il doit rester inchangé dans les prochaines versions distribuées.

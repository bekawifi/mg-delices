# Procédure de release Windows

## Version unique

Les versions de `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json` doivent être identiques. Vérifier avant chaque release :

```powershell
npm.cmd run version:check
```

## Première distribution RestoPRO : 1.1.0

1. Modifier et relire le code sur une branche contrôlée.
2. Régler la version `1.1.0` dans les trois fichiers, puis exécuter `npm.cmd run version:check`.
3. Exécuter `npm.cmd test` et `npm.cmd run build`.
4. Exécuter uniquement les suites Supabase concernées, sur l’instance de test dédiée. Ne jamais faire de `db push` dans cette procédure.
5. Charger la clé privée dans les variables de la session PowerShell conformément à `TAURI-SIGNING.md`.
6. Exécuter `npm.cmd run tauri:build`.
7. Récupérer l’installateur `.exe` et son `.sig` dans `src-tauri/target/release/bundle/nsis/`.
8. Générer `latest.json` avec `npm.cmd run release:latest -- --sig <fichier.sig> --notes <notes> --pub-date <date-RFC3339>`.
9. Créer manuellement une GitHub Release et y joindre l’installateur, son `.sig` et `latest.json`.
10. Sur une machine dédiée équipée d’une version RestoPRO strictement inférieure et signée avec la même paire updater, rechercher puis installer la mise à jour. Le passage MG DELICES 1.0.1 vers RestoPRO 1.1.0 reste une désinstallation/réinstallation à cause du nouvel identifiant Windows.
11. Vérifier le démarrage, l’absence de console noire, les fonctions principales et la version 1.1.0 affichée.

Aucune release ni aucun workflow de publication automatique n’est déclenché par cette procédure. Le dépôt public est `https://github.com/bekawifi/restopro`, branche `main`.

## `latest.json`

Le manifeste suit le format Tauri 2. Pour Windows x64, utiliser la clé `windows-x86_64`. `pub_date` est une date RFC 3339, l’URL doit être HTTPS et la signature est le contenu texte du `.sig`.

Le fichier racine `latest.json` est un artefact de release éphémère : il est généré localement, validé, puis joint à la GitHub Release. Il est ignoré par Git et ne doit pas être committé, car son contenu actif devient périssable dès la release suivante. Le schéma durable reste documenté dans `docs/latest.example.json`; l’historique réel des manifestes est conservé par les assets des releases GitHub et par l’historique Git antérieur à cette politique.

```json
{
  "version": "1.1.0",
  "notes": "Corrections et améliorations.",
  "pub_date": "2026-10-07T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "CONTENU_DU_FICHIER_SIG",
      "url": "https://github.com/bekawifi/restopro/releases/download/v1.1.0/RestoPRO_1.1.0_x64-setup.exe"
    }
  }
}
```

## Publication GitHub recommandée

Utiliser une GitHub Release stable contenant :

- `RestoPRO_1.1.0_x64-setup.exe` ;
- `RestoPRO_1.1.0_x64-setup.exe.sig` pour audit/conservation ;
- `latest.json` pointant en HTTPS vers l’installateur.

Les futurs secrets CI porteront les noms `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Aucune valeur ne doit être inscrite dans un workflow.

## Rollback

Ne pas compter sur un downgrade automatique et ne pas activer `allowDowngrades`. Si 1.1.0 est défectueuse, corriger et publier une version supérieure, par exemple 1.1.1.

## Identifiant d’application

L’identifiant de la lignée RestoPRO est `com.restopro.desktop`. Il doit rester inchangé dans les prochaines versions distribuées. MG DELICES 1.0.1 utilisait un autre identifiant et se migre par désinstallation/réinstallation contrôlée.

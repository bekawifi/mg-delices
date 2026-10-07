# Mises à jour Windows MG DELICES

Canal : `stable`. La clé publique réelle et l’endpoint GitHub HTTPS sont configurés dans `src-tauri/tauri.conf.json`. Aucune release n’est encore publiée.

## Comportement utilisateur

- Dans Tauri, **Paramètres > À propos** affiche la version courante et le bouton de recherche.
- Une mise à jour disponible affiche sa version, ses notes et un bouton explicite de téléchargement/installation.
- L’installation n’est jamais déclenchée automatiquement.
- Sous Windows, `downloadAndInstall` lance l’installateur en mode `passive`, puis Tauri ferme l’application. Aucun relaunch forcé n’est ajouté.
- Dans le navigateur, le plugin n’est jamais appelé et l’interface indique que les mises à jour dépendent du déploiement Web.

Les erreurs réseau, manifeste, téléchargement, installation et signature sont présentées avec un message contrôlé. Une signature invalide bloque toujours l’installation.

## Configuration de publication

L’endpoint stable est `https://github.com/bekawifi/mg-delices/releases/latest/download/latest.json`.

Pour générer le manifeste après le build signé :

```powershell
npm.cmd run release:latest -- --sig "src-tauri\target\release\bundle\nsis\MG DELICES_1.0.1_x64-setup.exe.sig" --notes "Mise à jour de test 1.0.1." --pub-date "2026-10-07T00:00:00Z"
```

Le script lit uniquement le `.sig`, utilise la version courante et écrit `latest.json` avec l’URL GitHub Release attendue.

Ne pas activer `dangerousInsecureTransportProtocol` ni `allowDowngrades`.

## Artefacts Windows

Avec `bundle.createUpdaterArtifacts: true` et les variables de signature présentes, le build NSIS Tauri 2 produit dans `src-tauri/target/release/bundle/nsis/` :

- `MG DELICES_<version>_x64-setup.exe` : installateur normal et artefact updater v2 ;
- `MG DELICES_<version>_x64-setup.exe.sig` : signature à copier dans `latest.json`.

Le contenu du fichier `.sig`, et non son chemin, va dans le champ `signature`.

Sans clé privée, `npm.cmd run tauri:build` applique une surcharge locale qui désactive uniquement la création de la signature. L’installateur NSIS normal continue ainsi à être généré. Avec `TAURI_SIGNING_PRIVATE_KEY` définie, la configuration principale est utilisée et le `.sig` est produit.

## Checklist manuelle

### Web

- Le bouton updater n’est pas affiché.
- Aucun appel au plugin Tauri n’est tenté.

### Desktop sans endpoint

- La recherche affiche une erreur de configuration contrôlée.
- Aucun téléchargement ne démarre.

### Desktop avec endpoint

- Sans nouvelle version : « MG DELICES est à jour ».
- Avec nouvelle version : version et notes visibles.
- Le téléchargement affiche les octets et le pourcentage lorsque la taille est connue.
- L’installation ne démarre qu’après clic.
- Une signature invalide empêche l’installation.

## Point important pour la version de base

Pour tester la mise à jour 1.0.0 vers 1.0.1, la version 1.0.0 installée sur la machine cliente doit déjà contenir la même clé publique et l’endpoint stable. Un ancien installateur 1.0.0 créé avant cette configuration ne pourra pas découvrir la release.

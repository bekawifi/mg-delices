# Mises à jour Windows RestoPRO

Canal : `stable`. La clé publique réelle et l’endpoint GitHub HTTPS sont configurés dans `src-tauri/tauri.conf.json`. Aucune release n’est encore publiée.

## Comportement utilisateur

- Dans Tauri, **Paramètres > À propos** affiche la version courante et le bouton de recherche.
- Une mise à jour disponible affiche sa version, ses notes et un bouton explicite de téléchargement/installation.
- L’installation n’est jamais déclenchée automatiquement.
- Sous Windows, `downloadAndInstall` lance l’installateur en mode `passive`, puis Tauri ferme l’application. Aucun relaunch forcé n’est ajouté.
- Dans le navigateur, le plugin n’est jamais appelé et l’interface indique que les mises à jour dépendent du déploiement Web.

Les erreurs réseau, manifeste, téléchargement, installation et signature sont présentées avec un message contrôlé. Une signature invalide bloque toujours l’installation.

## Configuration de publication

L’endpoint actuellement configuré reste temporairement `https://github.com/bekawifi/mg-delices/releases/latest/download/latest.json` afin de ne pas casser les installations existantes. Il ne devra être remplacé par `https://github.com/bekawifi/restopro/releases/latest/download/latest.json` qu’après le renommage réel du dépôt.

Pour générer le manifeste après le build signé :

```powershell
npm.cmd run release:latest -- --sig "src-tauri\target\release\bundle\nsis\RestoPRO_1.1.0_x64-setup.exe.sig" --notes "RestoPRO 1.1.0." --pub-date "2026-10-08T00:00:00Z"
```

Le script lit uniquement le `.sig`, utilise la version courante et écrit `latest.json` avec l’URL GitHub Release attendue.

Ne pas activer `dangerousInsecureTransportProtocol` ni `allowDowngrades`.

## Artefacts Windows

Avec `bundle.createUpdaterArtifacts: true` et les variables de signature présentes, le build NSIS Tauri 2 produit dans `src-tauri/target/release/bundle/nsis/` :

- `RestoPRO_<version>_x64-setup.exe` : installateur normal et artefact updater v2 ;
- `RestoPRO_<version>_x64-setup.exe.sig` : signature à copier dans `latest.json`.

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

- Sans nouvelle version : « RestoPRO est à jour ».
- Avec nouvelle version : version et notes visibles.
- Le téléchargement affiche les octets et le pourcentage lorsque la taille est connue.
- L’installation ne démarre qu’après clic.
- Une signature invalide empêche l’installation.

## Point important pour la transition de marque

RestoPRO 1.1.0 change d’identifiant Windows. La migration depuis MG DELICES 1.0.1 suit donc la procédure de désinstallation/réinstallation documentée dans `RESTOPRO-DISTRIBUTION.md`, tout en conservant les données Supabase. La clé publique updater existante est conservée et la clé privée ne doit jamais être régénérée ni copiée dans le dépôt.

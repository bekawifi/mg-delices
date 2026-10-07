# Mises à jour Windows MG DELICES

Canal prévu : `stable`. Le mécanisme Tauri 2 est préparé, mais les mises à jour restent **inactives** tant que la vraie clé publique et un endpoint HTTPS réel ne remplacent pas les placeholders de `src-tauri/tauri.conf.json`.

## Comportement utilisateur

- Dans Tauri, **Paramètres > À propos** affiche la version courante et le bouton de recherche.
- Une mise à jour disponible affiche sa version, ses notes et un bouton explicite de téléchargement/installation.
- L’installation n’est jamais déclenchée automatiquement.
- Sous Windows, `downloadAndInstall` lance l’installateur en mode `passive`, puis Tauri ferme l’application. Aucun relaunch forcé n’est ajouté.
- Dans le navigateur, le plugin n’est jamais appelé et l’interface indique que les mises à jour dépendent du déploiement Web.

Les erreurs réseau, manifeste, téléchargement, installation et signature sont présentées avec un message contrôlé. Une signature invalide bloque toujours l’installation.

## Configuration à terminer

1. Générer manuellement la paire de clés en suivant `TAURI-SIGNING.md`.
2. Remplacer `__MG_DELICES_UPDATER_PUBLIC_KEY__` par le contenu de la clé publique — jamais par son chemin.
3. Choisir le dépôt GitHub final et ajouter uniquement alors l’endpoint HTTPS : `https://github.com/<propriétaire>/<dépôt>/releases/latest/download/latest.json`.
4. Reconstruire et redistribuer une version de base contenant cette vraie configuration avant de tester une mise à jour ultérieure.

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

## Point important pour la version 1.0.0

L’installateur 1.0.0 déjà créé ne contient pas encore une vraie clé publique ni un endpoint actif. Il peut servir aux tests locaux, mais ne constitue pas une base distribuable pour une chaîne d’updates réelle. Avant diffusion sur d’autres PC, reconstruire la version de base avec la vraie clé publique et l’endpoint final.

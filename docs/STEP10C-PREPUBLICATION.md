# RestoPRO 1.1.0 — checklist finale avant publication

Cette procédure prépare la publication sans l’exécuter. Aucun renommage GitHub, changement d’endpoint, chargement de clé privée, build signé, tag ou release ne doit avoir lieu avant validation de tous les contrôles manuels.

## Contrôles manuels Windows bloquants

- [ ] Connexion administrateur réussie, déconnexion et nouvelle connexion réussies.
- [ ] Dashboard chargé avec les chiffres historiques attendus et sans erreur console visible.
- [ ] Ventes et historique accessibles ; détail et recherche d’une vente existante vérifiés.
- [ ] Stock chargé ; quantités et historique des mouvements cohérents.
- [ ] Clients chargés ; fiche, encours et historique d’un client vérifiés.
- [ ] Fournisseurs chargés ; fiche, achats, dette et paiements vérifiés.
- [ ] Rapports chargés ; période, indicateurs, export PDF et export Excel vérifiés.
- [ ] Inventaires chargés ; consultation d’un inventaire historique et parcours brouillon sans validation destructive vérifiés.
- [ ] Session de caisse : état affiché, ouverture, opération autorisée, synthèse et clôture contrôlées sur la base de test.
- [ ] Ticket de caisse : restaurant en titre, montants, reste, largeur et footer RestoPRO optionnel contrôlés.
- [ ] Impression physique réalisée sur l’imprimante cible en 58 ou 80 mm selon la configuration.
- [ ] Fermeture complète de RestoPRO, redémarrage Windows si possible, relance et reconnexion réussies.

Consigner pour chaque contrôle : date, opérateur, poste, résultat, capture éventuelle et anomalie. Toute anomalie bloque la signature et la publication.

## Renommage GitHub — à exécuter ultérieurement

1. Vérifier que la branche validée a été relue, fusionnée et sauvegardée, sans secret ni fichier de clé.
2. Dans `bekawifi/mg-delices`, ouvrir **Settings → General → Repository name**, saisir `restopro`, puis confirmer.
3. Ouvrir `https://github.com/bekawifi/restopro` et vérifier branches, historique, tags, releases, permissions et paramètres de sécurité.
4. Tester les redirections depuis l’ancienne URL du dépôt et les anciennes URLs de clone ; ne pas supposer que les URLs d’artefacts updater sont redirigées correctement.
5. Mettre à jour le remote local avec `git remote set-url origin https://github.com/bekawifi/restopro.git`, puis contrôler `git remote -v` et `git fetch --dry-run` avant tout push.
6. Modifier ensuite seulement `src-tauri/tauri.conf.json` pour activer `https://github.com/bekawifi/restopro/releases/latest/download/latest.json`.
7. Relancer tous les contrôles et produire un nouvel installateur après cette modification de configuration.

## Build signé — à exécuter par le propriétaire de la clé

1. Partir du commit et du répertoire de travail validés ; confirmer `1.1.0`, `RestoPRO` et `com.restopro.desktop` avec `npm.cmd run version:check`.
2. Exécuter les tests Supabase approuvés, `npm.cmd test` et `npm.cmd run build`.
3. Le propriétaire charge le chemin de la clé privée **existante** et son mot de passe uniquement dans les variables de la session PowerShell, conformément à `TAURI-SIGNING.md`. Ne jamais afficher, copier, journaliser ou transmettre leur contenu.
4. Exécuter `npm.cmd run tauri:build`. La configuration `createUpdaterArtifacts` doit produire l’installateur et son `.sig`.
5. Effacer immédiatement les deux variables de signature de la session.
6. Générer `latest.json` avec `npm.cmd run release:latest -- --sig <chemin-du-sig> --notes <notes-validées> --pub-date <RFC3339>`. Effectuer cette étape seulement après le renommage réel du dépôt.
7. Ne pas réutiliser le `latest.json` historique de MG DELICES et ne pas publier avant validation indépendante des artefacts.

## Validation de l’artefact signé

- [ ] Nom exact : `RestoPRO_1.1.0_x64-setup.exe` et `RestoPRO_1.1.0_x64-setup.exe.sig`.
- [ ] Version fichier, registre Windows, écran À propos et manifeste : `1.1.0`.
- [ ] Identifiant de configuration : `com.restopro.desktop`.
- [ ] Fichier `.sig` non vide et signature acceptée par le plugin updater avec la clé publique inchangée.
- [ ] Calculer et consigner le SHA-256 de l’EXE, du `.sig` et de `latest.json` avec `Get-FileHash -Algorithm SHA256`.
- [ ] Installer sur une machine propre, démarrer, se connecter et exécuter la checklist fonctionnelle.
- [ ] Fermer, relancer, désinstaller, vérifier l’absence de dossier résiduel applicatif, puis réinstaller.
- [ ] Tester l’updater depuis une version RestoPRO inférieure signée avec la même paire : détection, téléchargement, signature, installation et redémarrage manuel.
- [ ] Tester qu’une signature altérée est refusée et qu’aucun downgrade n’est accepté.

## Release GitHub — préparation uniquement

1. Créer ultérieurement le tag annoté `v1.1.0` sur le commit validé et le pousser uniquement après autorisation.
2. Créer une release stable RestoPRO 1.1.0, non brouillon une fois toutes les validations terminées.
3. Joindre exactement l’EXE signé updater, son `.sig`, `latest.json`, les SHA-256 consignés et des notes de migration claires.
4. Vérifier que l’URL inscrite dans `latest.json` correspond exactement à l’artefact joint sous `bekawifi/restopro`.
5. Télécharger à nouveau les fichiers publiés, recalculer leurs SHA-256 et les comparer aux valeurs locales.
6. Tester ensuite l’endpoint `releases/latest/download/latest.json` et le parcours updater sur la machine dédiée.
7. En cas d’échec, ne pas activer de downgrade : retirer la publication problématique si nécessaire et préparer une version supérieure corrigée.

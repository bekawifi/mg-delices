# Distribution multi-restaurants de RestoPRO

## Architecture retenue

RestoPRO est le produit logiciel commun. L’identité commerciale visible sur les tickets et rapports vient de `restaurant_settings` : nom, logo, téléphone, email, adresse, ville, pays, slogan, devise, numéro fiscal et pied de ticket. La mention « Généré avec RestoPRO » est activable par établissement.

Le modèle d’exploitation recommandé est **un restaurant = un projet Supabase**. Il isole les données, les comptes, les sauvegardes, les incidents et la facturation. Aucune clé `service_role` ne doit être intégrée dans l’application.

## Build par client ou configuration au runtime

État actuel : Vite injecte `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` pendant la compilation. Le même installateur ne peut donc pas encore viser plusieurs projets Supabase. Pour la première commercialisation, le choix opérationnel sûr est **un build RestoPRO par restaurant**, issu exactement du même commit et distingué uniquement par sa configuration publique Supabase. Il est simple à exploiter immédiatement, mais oblige à reconstruire et retester chaque variante.

Cible recommandée : **un binaire RestoPRO générique configuré au premier lancement**. Un petit fichier JSON local, stocké dans le répertoire de configuration applicatif Windows avec des droits limités à l’utilisateur, contiendra l’URL Supabase et la clé publique `anon` (qui n’est pas un secret serveur). Un écran d’activation validera le format HTTPS et la connexion avant d’initialiser le client Supabase. Le fichier pourra être remplacé par un code restaurant résolu via un service central lorsque ce service existera. La clé `service_role`, les mots de passe et la clé updater privée n’y figureront jamais.

Cette configuration runtime n’est pas implémentée à l’étape 10. Tant qu’elle ne l’est pas, ne pas prétendre qu’un installateur unique dessert plusieurs Supabase. Un build réellement spécifique (icône, marque blanche, fonctionnalités ou canal updater) reste réservé aux exigences contractuelles fortes.

## Procédure d’onboarding d’un restaurant

1. Créer un projet Supabase distinct et conserver ses accès dans le gestionnaire de secrets de l’exploitant.
2. Appliquer toutes les migrations dans l’ordre sur ce nouveau projet, après validation sur une instance de test.
3. Créer le premier utilisateur, l’activer et lui attribuer le rôle `admin`.
4. Pour la phase actuelle, produire le build depuis le commit validé avec uniquement `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` du client. Après implémentation de la configuration runtime, utiliser le même installateur générique et l’écran d’activation.
5. Ouvrir Paramètres, saisir l’identité du restaurant, le logo, les coordonnées, la devise et les options d’impression.
6. Tester une vente, un ticket, un rapport, une clôture de caisse et une restauration de sauvegarde.
7. Documenter le responsable, les postes installés, le projet Supabase, la version et la date de mise en service.

## Migration depuis MG DELICES 1.0.1

RestoPRO 1.1.0 utilise le nouvel identifiant Windows `com.restopro.desktop`. Windows le considère comme une application distincte : désinstaller MG DELICES après sauvegarde et vérification, puis installer RestoPRO. Les données métier restent dans Supabase et sont donc conservées si la nouvelle installation pointe vers le même projet et si la migration additive `20261008000200_restopro_branding.sql` a été appliquée.

Avant bascule : sauvegarder, relever la configuration, fermer les caisses et vérifier qu’aucune saisie n’est en cours. Après bascule : contrôler connexion, profils, restaurant, ventes historiques, stock, rapports et impression. Conserver l’ancien installateur pendant la période de validation ; ne jamais forcer un downgrade via l’updater.

## Dépôt et updater

Le dépôt cible futur est `https://github.com/bekawifi/restopro`. Tant que ce dépôt n’existe pas ou n’a pas été renommé, `src-tauri/tauri.conf.json` conserve volontairement l’endpoint opérationnel `bekawifi/mg-delices`. Après la bascule réelle du dépôt, remplacer uniquement cet endpoint par :

`https://github.com/bekawifi/restopro/releases/latest/download/latest.json`

La paire de clés updater existante est conservée. Ne pas générer une nouvelle clé et ne jamais copier la clé privée dans le dépôt. Les artefacts attendus pour 1.1.0 sont `RestoPRO_1.1.0_x64-setup.exe` et `RestoPRO_1.1.0_x64-setup.exe.sig`.

### Bascule GitHub à effectuer seulement après validation complète

1. Vérifier que la branche validée est fusionnée, sauvegardée et que le répertoire de travail ne contient aucun secret.
2. Dans GitHub, ouvrir `bekawifi/mg-delices`, puis **Settings → General → Repository name**.
3. Saisir `restopro` et confirmer le renommage. Ne pas créer de nouveau dépôt si la conservation intégrale de l’historique, des tags et des releases est souhaitée.
4. Mettre à jour le remote local avec `git remote set-url origin https://github.com/bekawifi/restopro.git`, puis vérifier avec `git remote -v` sans pousser automatiquement.
5. Vérifier manuellement les branches, tags, anciennes releases et redirections GitHub.
6. Remplacer ensuite, et seulement ensuite, l’endpoint de `src-tauri/tauri.conf.json` par `https://github.com/bekawifi/restopro/releases/latest/download/latest.json`.
7. Relancer `version:check`, les tests, le build Web et le build Tauri ; tester la recherche de mise à jour sur une machine dédiée.
8. Préparer le tag futur `v1.1.0`, l’installateur, sa signature et `latest.json`, puis publier uniquement après une autorisation distincte.

## Licence et support futurs

Prévoir un registre commercial externe contenant : identifiant client, établissement, édition, statut de licence, échéance, version déployée et contacts de support. Ne pas bloquer le démarrage sur un service de licence distant tant qu’un mode dégradé et une procédure de secours n’existent pas. Les journaux de diagnostic RestoPRO doivent rester sans secrets ni données sensibles.

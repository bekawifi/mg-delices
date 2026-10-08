# Validation réelle RestoPRO — Étape 10B

Date : 8 octobre 2026. Branche : `feature/restopro-rebrand`.

## Migration et conservation

La migration additive `20261008000200_restopro_branding.sql` a été appliquée sur l’instance de test liée. `supabase migration list` confirme `20261008000200` en Local et Remote.

| Table | Avant | Après migration |
|---|---:|---:|
| ventes | 193 | 193 |
| lignes_vente | 216 | 216 |
| clients | 52 | 52 |
| fournisseurs | 28 | 28 |
| produits | 92 | 92 |
| matieres_premieres | 74 | 74 |
| commandes | 48 | 48 |
| paiements | 198 | 198 |
| mouvements_stock | 270 | 270 |
| sessions_caisse | 49 | 49 |
| retours_clients | 61 | 61 |
| inventaires | 10 | 10 |

`restaurant_settings.nom` est resté `MG DELICES`. Les nouveaux champs existent et aucune RPC publique ne contient le texte `MG DELICES` dans son corps.

## Tests

- Étape 1B : 8/8 réussis.
- Étape 2 : 10/10 réussis.
- Étape 3 : 17/17 réussis.
- Étape 4 : 26/26 réussis.
- Étape 5 : 30/30 réussis.
- Étape 6 : 23/23 réussis.
- Étape 7 : 48/48 réussis.
- Étape 9 : 23/23 réussis.
- Étape 10B : 6/6 réussis, avec modification temporaire puis restauration exacte de l’identité MG DELICES.
- Vitest : 17 fichiers, 59 tests réussis.
- Build Web : réussi.

Les suites Supabase ajoutent volontairement des données à l’instance de test. Les chiffres du tableau ont été capturés immédiatement avant et après la migration, avant leur exécution.

## Windows

MG DELICES 1.0.1 était installé et en cours d’exécution. Il a été fermé puis désinstallé silencieusement. RestoPRO 1.1.0 a été installé depuis `RestoPRO_1.1.0_x64-setup.exe`.

Après installation : seule l’entrée RestoPRO 1.1.0 demeure dans le registre, l’ancien dossier `%LOCALAPPDATA%\MG DELICES` n’existe plus, `%LOCALAPPDATA%\RestoPRO\restopro.exe` existe, le processus démarre et répond, et son titre Windows est `RestoPRO`. La fermeture et le redémarrage ont réussi.

L’automatisation graphique native n’était pas disponible dans la session. La connexion et la vérification visuelle des écrans historique, stock, clients, fournisseurs, rapports, inventaires et caisse restent donc à réaliser manuellement sur le poste. Les RPC correspondantes ont été validées par les suites d’intégration.

## Updater et publication

La clé publique est identique à celle de la branche de référence. L’endpoint actif reste `https://github.com/bekawifi/mg-delices/releases/latest/download/latest.json` et aucune URL `restopro` n’est active dans Tauri. Aucun build signé, tag, renommage GitHub ou release n’a été effectué.

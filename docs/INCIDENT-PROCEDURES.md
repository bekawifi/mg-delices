# Procédures d’incident

- Internet coupé / Supabase indisponible : arrêter encaissements et décaissements, conserver les commandes non financières, ne jamais annoncer une vente réussie, relever l’heure et réessayer après retour du réseau. Ne pas rejouer une vente dont le statut est inconnu : rechercher d’abord son numéro.
- Imprimante en panne : conserver la vente enregistrée, vérifier alimentation/papier/file Windows, choisir temporairement une autre imprimante puis imprimer un duplicata clairement marqué.
- PC en panne : verrouiller le poste, utiliser un PC déjà autorisé, se reconnecter et vérifier l’état de la caisse avant toute opération.
- Mot de passe oublié : l’administrateur déclenche une réinitialisation contrôlée depuis Supabase Auth ou le mécanisme serveur approuvé ; aucun mot de passe ne doit circuler en clair.
- Caisse bloquée : ne pas modifier la base. Exporter le diagnostic, noter session/utilisateur/heure et contacter le support.
- Erreur de mise à jour : conserver l’installateur courant, relever version et message, vérifier `latest.json` et la connexion. Ne jamais copier la clé privée sur le poste.
- Stock incohérent : suspendre les ajustements, consulter mouvements, lancer un inventaire puis valider seulement après double contrôle.

Support à fournir : version, OS, heure UTC, utilisateur/rôle, action, référence métier, état réseau et capture du message. Ne jamais transmettre mot de passe, token, clé Supabase ou clé updater.

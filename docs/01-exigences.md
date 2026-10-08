# Otakudex — Exigences

Document d'ingénierie des exigences. Il applique la distinction **besoin → exigence** : un besoin
décrit le problème (QUOI), une exigence décrit la solution attendue de façon vérifiable (COMMENT).
Chaque exigence est atomique, porte un identifiant stable et renvoie au besoin qu'elle sert.

Statut : v1 en cours de conception. Priorités MoSCoW : **M** doit, **S** devrait, **C** pourrait.

## 1. Contexte et périmètre

**Domaine.** Application web pour classer les anime déjà regardés et suivre ce qu'on regarde, avec des
statistiques vivantes. Un cercle d'amis de confiance : un compte et une bibliothèque par personne,
sur autorisation de l'administrateur (voir [06-comptes-et-connexion.md](06-comptes-et-connexion.md)).
Aucun réseau social en v2.

**Facteurs internes.** Un développeur solo, une base PostgreSQL (Neon en production, Postgres du
homelab pour les tests locaux), Docker disponible, Node 22.

**Facteurs externes.** Le marché des trackers est tenu par MyAnimeList et AniList. Aucun ne propose
un classement personnel ludique natif ; les sources de métadonnées se dégradent (Jikan public arrêté
le 2026-10-01, AniList limitée à 30 requêtes/min et hostile aux trackers dans ses CGU). Voir
[etude-concurrents.md](etude-concurrents.md).

**Hors périmètre.** Import depuis un autre tracker, recommandations, streaming ou téléchargement,
application mobile native, regroupement par franchise, calendrier de diffusion. Pour les comptes :
comparaison entre amis (prévue ensuite, avec l'accord explicite de chaque personne), double
authentification, connexion par un service tiers, envoi d'e-mails, suppression d'un compte avec ses données.

## 2. Parties prenantes et acteurs

| Partie prenante | Rôle | Acteur ? | Intérêt | Influence | Stratégie (Mendelow) |
|---|---|---|---|---|---|
| Utilisateur-propriétaire | Sponsor, client, expert métier, seul utilisateur | Oui (humain) | Élevé | Élevée | Gérer de près |
| Kitsu (API publique) | Fournisseur de métadonnées | Oui (système) | Faible | Moyenne | Garder satisfait : respecter son débit, aucun abus |
| PostgreSQL (Neon / homelab) | Stockage persistant | Oui (système) | Faible | Élevée | Garder satisfait : sauvegardes vérifiées |
| Conditions d'utilisation de Kitsu | Contrainte réglementaire | Non | Faible | Moyenne | Surveiller |
| Administrateur (le propriétaire, premier compte) | Gère les accès : invitations, désactivation, réinitialisation | Oui (humain) | Élevé | Élevée | Gérer de près |
| Membre (ami autorisé) | Utilise sa propre bibliothèque | Oui (humain) | Élevé | Faible | Tenir informé : sa bibliothèque lui appartient, personne ne la lit |
| Personne non autorisée | Cherche à entrer ou à lire les données d'autrui | Oui (menace) | Faible | Faible | Contrer : voir le modèle de menaces |

## 3. Techniques d'élicitation employées

| Technique | Usage ici |
|---|---|
| Interview | Quatre questions posées à l'utilisateur : stockage, appareil, source de données, import |
| Analyse documentaire | Étude comparative de 12 acteurs, 7 notes de recherche |
| Analyse d'interface | API Kitsu : champs disponibles, limites, absence de CORS sur les images |
| Prototypage | Prévu : maquette HTML du Dex avant l'écran Arène |

## 4. Besoins exprimés (non traités comme des exigences)

| ID | Besoin | Source |
|---|---|---|
| B1 | Classer les anime que j'ai regardés d'une façon qui reflète vraiment mes goûts | Utilisateur |
| B2 | Consigner ce que je regarde sans effort, pour ne pas abandonner le suivi | Utilisateur, étude (friction de saisie) |
| B3 | Voir un suivi fun, dynamique et cool de mon parcours | Utilisateur |
| B4 | Choisir quoi regarder ensuite sans y passer une heure | Étude (backlog, pickers) |
| B5 | Rester propriétaire de mes données et pouvoir les sauvegarder | Étude (portabilité, API instables) |
| B6 | Utiliser l'app surtout sur PC, lisible sur téléphone | Utilisateur |
| B7 | Éviter les sites douteux et les sources non officielles | Utilisateur |
| B8 | Que seules des personnes de confiance, que j'autorise, puissent utiliser l'application, derrière une connexion | Utilisateur (2026-10-08) |
| B9 | Que chaque personne de confiance ait son propre Dex, ses classements et ses statistiques | Utilisateur (2026-10-08) |
| B10 | Pouvoir, plus tard, comparer ce qu'on a regardé entre amis | Utilisateur (2026-10-08), « pour la suite » |
| B11 | Une application qui parle simplement, sans se justifier, en français ou en anglais d'un bouton, avec des données de Kitsu dans la même langue, et un retour en haut de page | Utilisateur (2026-10-08) |

« Pourquoi ? » appliqué à B1 : une note isolée sur 10 paraît arbitraire (un auteur d'outil de duels
dit avoir vu près de 400 anime sans en noter un seul). Le besoin réel est un *ordre relatif fiable*,
pas une note.

## 5. Exigences fonctionnelles

### Bibliothèque et suivi (B2, B3)

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-01 | L'utilisateur peut rechercher un anime par titre. | La recherche renvoie au plus 20 résultats, chacun avec couverture, titre, type, année et nombre d'épisodes. | M |
| FR-02 | L'utilisateur peut ajouter un résultat de recherche à sa bibliothèque avec un statut initial. | Statuts possibles : à voir, en cours, terminé, en pause, abandonné. | M |
| FR-03 | Le système doit enregistrer, à l'ajout, un instantané des métadonnées de l'anime. | L'instantané contient titres, synopsis, type, nombre d'épisodes, durée d'épisode, dates, genres, URL d'affiche, note communautaire. L'anime reste affichable quand l'API est hors ligne. | M |
| FR-04 | L'utilisateur peut ajouter un anime manuellement. | Titre obligatoire ; nombre d'épisodes et durée d'épisode optionnels. Sans couverture, un monogramme s'affiche. | S |
| FR-05 | L'utilisateur peut incrémenter d'un épisode la progression d'un anime en une seule action. | Depuis le Dex, une action unique (clic, touche ou toucher) augmente la progression de 1. | M |
| FR-06 | Le système doit horodater chaque épisode marqué comme vu. | Chaque incrément crée une ligne d'historique avec numéro d'épisode et date-heure. | M |
| FR-07 | L'utilisateur peut annuler le dernier épisode marqué. | La progression diminue de 1 et la dernière ligne d'historique de cet anime est supprimée. | S |
| FR-08 | Le système doit passer un anime au statut « terminé » quand sa progression atteint son nombre d'épisodes connu. | La date de fin est renseignée. Si le nombre d'épisodes est inconnu, le statut ne change pas. | M |
| FR-09 | L'utilisateur peut modifier le statut, la date de début, la date de fin, le compteur de revisionnage et la note privée d'un anime. | Les modifications sont visibles après rechargement. | S |
| FR-10 | L'utilisateur peut retirer un anime de sa bibliothèque. | Une confirmation est demandée ; l'historique associé est supprimé avec l'anime. | M |
| FR-11 | L'utilisateur peut filtrer sa bibliothèque par statut et par genre. | Le filtre s'applique en moins de 200 ms sur 500 entrées. | M |
| FR-12 | L'utilisateur peut chercher un titre dans sa bibliothèque. | La recherche couvre titre canonique, anglais et japonais, sans tenir compte de la casse ni des accents. | S |
| FR-13 | L'utilisateur peut trier sa bibliothèque par titre, rang, date d'ajout ou dernière activité. | Le tri choisi est conservé après rechargement. | S |

### Classement (B1)

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-20 | L'utilisateur peut classer tout anime dont le statut n'est pas « à voir ». | L'action « Classer » n'apparaît pas sur un anime « à voir ». | M |
| FR-21 | Le système doit demander d'abord un compartiment : adoré, bien ou bof. | Aucun duel ne démarre avant ce choix. | M |
| FR-22 | Le système doit placer l'anime par comparaisons successives avec des anime déjà classés du même compartiment, par recherche dichotomique. | Le nombre de duels est au plus ⌈log₂(n+1)⌉ pour n anime déjà classés dans le compartiment. | M |
| FR-23 | L'utilisateur peut répondre « trop dur à départager » à un duel. | L'anime est placé à la position courante de la recherche, sans autre duel. | S |
| FR-24 | Le système doit calculer pour chaque anime classé une note entière de 0 à 100 à partir de son rang dans son compartiment. | Adoré : 70 à 100, bien : 40 à 69, bof : 0 à 39 ; le mieux classé du compartiment reçoit la borne haute. | M |
| FR-25 | L'utilisateur peut afficher son classement complet. | Liste ordonnée avec rang, couverture, titre et note ; les rangs sont consécutifs à partir de 1. | M |
| FR-26 | L'utilisateur peut reclasser un anime déjà classé. | L'anime quitte son rang, ses voisins se resserrent, puis les duels recommencent. | S |
| FR-27 | L'utilisateur peut afficher son classement en tier list (S, A, B, C, D) dérivée de la note. | Seuils : S 90–100, A 75–89, B 60–74, C 40–59, D 0–39. | S |
| FR-28 | L'utilisateur peut déplacer un anime d'une tier à l'autre par glisser-déposer. | Le déplacement change le compartiment et la position, puis la note. | C |

### Statistiques (B3)

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-30 | Le système doit afficher le nombre d'anime par statut, le nombre d'épisodes vus, la note moyenne et la distribution des notes par tranche de 10. | Les totaux sont cohérents avec la bibliothèque (test d'intégration). Les épisodes comptent la progression de chaque anime et un passage complet par revisionnage. | M |
| FR-31 | Le système doit afficher le temps total regardé en heures et en jours. | Calculé depuis la durée d'épisode de l'instantané ; un anime sans durée connue est exclu du calcul et la page le signale. | M |
| FR-32 | Le système doit afficher une carte de chaleur des épisodes vus par jour sur les 52 dernières semaines. | Un jour sans épisode apparaît vide ; l'infobulle donne la date et le nombre d'épisodes. | S |
| FR-33 | Le système doit afficher la plus longue série de semaines consécutives avec au moins un épisode. | Calculé depuis l'historique horodaté. | S |
| FR-34 | Le système doit afficher les dix genres les plus présents dans la bibliothèque. | Comptage par anime, tous statuts sauf « à voir ». Seuls les genres d'une liste connue sont retenus, car Kitsu mélange genres et mots-clés très spécifiques. | S |
| FR-35 | L'utilisateur peut afficher un bilan annuel (type « Wrapped »). | Chiffres clés, premier et dernier anime de l'année, top 5 par note. | C |

### Choisir quoi regarder (B4)

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-40 | L'utilisateur peut tirer au sort un anime parmi ceux « à voir ». | Le tirage est pondéré : un anime ajouté depuis plus longtemps a plus de chances. | S |
| FR-41 | L'utilisateur peut restreindre le tirage par durée totale maximale et par type. | Aucun anime hors filtre n'est tiré. Si aucun anime ne correspond, un message l'indique. | S |

### Données personnelles (B5)

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-50 | L'utilisateur peut exporter toute sa bibliothèque et son historique au format JSON. | Le fichier contient toutes les entrées, tous les instantanés et tout l'historique. | M |
| FR-51 | L'utilisateur peut exporter sa bibliothèque au format CSV. | Une ligne par anime, colonnes nommées en français. | S |
| FR-52 | L'utilisateur peut restaurer sa bibliothèque depuis un export JSON. | Un export suivi d'une restauration sur une base vide redonne la même bibliothèque (test d'aller-retour). | S |

### Plaisir d'usage (B3)

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-60 | Le système doit afficher une animation de célébration quand un anime passe à « terminé ». | Aucune animation si l'utilisateur a demandé de réduire les animations. | S |
| FR-61 | L'utilisateur peut ouvrir la recherche d'ajout avec la touche « / ». | Sans effet quand le focus est dans un champ de saisie. | S |

### Navigation fluide et tableaux de bord (refonte, voir [05-refonte-ux-animations.md](05-refonte-ux-animations.md))

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-62 | Le Dex doit présenter les anime « en cours » dans une zone « Continuer » placée avant la collection. | La zone est absente s'il n'y a aucun anime en cours. | M |
| FR-63 | Chaque carte de la zone « Continuer » doit afficher le temps restant estimé (épisodes restants × durée d'épisode). | « Durée inconnue » s'affiche si l'un des deux est inconnu. | M |
| FR-64 | Marquer un épisode doit mettre l'écran à jour avant la réponse du serveur, puis annuler cette mise à jour avec un message si le serveur refuse. | Test avec un serveur qui répond lentement, puis avec un refus. | M |
| FR-65 | La page Stats doit proposer deux vues : « Aperçu » et « Détails ». | « Aperçu » tient dans un écran de 1 280 × 800 px. | S |
| FR-66 | La vue « Aperçu » doit afficher les épisodes des 7 derniers jours comparés aux 7 jours précédents. | La différence est écrite en texte avec son signe. | M |
| FR-67 | La vue « Aperçu » doit afficher le temps « Reste à voir » et son estimation en semaines au rythme des 28 derniers jours. | Pas d'estimation si le rythme est nul. | S |
| FR-68 | La vue « Aperçu » doit afficher les épisodes par semaine sur 26 semaines avec leur moyenne mobile sur 4 semaines. | L'axe des barres part de zéro. | S |
| FR-69 | L'Arène doit proposer un « prochain duel » comme action principale quand au moins un anime attend d'être classé. | L'action cible l'anime en attente le plus récemment ajouté. | S |

### Fiche d'un anime (voir [05-refonte-ux-animations.md](05-refonte-ux-animations.md), section 7)

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-70 | La fiche d'un anime doit montrer d'abord ce qui sert à suivre : statut, progression, temps restant et action principale. Dates, revisionnages, correction de progression et note privée doivent se trouver dans une zone « Détails » repliée à l'ouverture. | Le résumé d'une ligne de « Détails » cite les valeurs renseignées. L'état ouvert ou fermé est conservé pendant la session. | M |
| FR-71 | Le statut doit se choisir parmi cinq pastilles visibles, navigables aux flèches du clavier, et le changement doit s'afficher avant la réponse du serveur. | Test avec un serveur lent : la pastille change en moins de 100 ms ; un refus remet l'ancien statut avec un message. | M |
| FR-72 | L'action principale de la fiche doit rester visible en bas sans défilement et dépendre de l'état : « Vu : épisode N » tant qu'un épisode reste à voir (hors statut « terminé »), « Classer » pour un anime terminé non classé, aucune sinon. | Vérifié à 375 px et à 1 280 px, pour les cinq statuts. | M |
| FR-73 | Passer un anime à « en cours » doit renseigner la date de début du jour si elle est vide ; passer à « terminé » doit renseigner de même les dates de début et de fin vides. Une date déjà saisie ne doit jamais être écrasée. | Tests unitaires de la règle. | S |
| FR-74 | Les dates doivent se saisir et s'afficher au format jj/mm/aaaa, avec un bouton « Aujourd'hui ». Une date illisible, ou une date de fin antérieure à la date de début, doit produire un message sous le champ qui donne un exemple valide, et rien n'est enregistré tant qu'elle n'est pas corrigée. | Tests unitaires de l'analyse et de la validation. | M |
| FR-75 | Corriger la progression à une valeur donnée ne doit pas créer d'historique ; une valeur égale au nombre d'épisodes passe l'anime à « terminé », une valeur inférieure à ce nombre repasse un anime « terminé » à « en cours », une valeur positive passe un anime « à voir » à « en cours ». Une valeur hors de 0 à N produit un message sous le champ. | Tests unitaires de la règle. | S |
| FR-76 | Repasser à « à voir » un anime classé doit demander une confirmation qui annonce la perte de son rang. | Sans confirmation, ni le statut ni le rang ne changent. | M |
| FR-77 | La note privée doit s'enregistrer seule : 600 ms après la dernière frappe, à la sortie du champ et à la fermeture de la fiche. | Taper puis fermer par Échap et rouvrir : la note est là. | M |
| FR-78 | Chaque champ enregistré doit afficher « Enregistré » à côté de lui ; en cas d'échec, la valeur du serveur est rétablie avec un message. | Test avec un serveur qui refuse. | S |
| FR-79 | « Retirer du Dex » doit rester séparé des autres actions ; sa confirmation (FR-10) doit placer le focus sur « Garder ». | Parcours clavier. | M |

### Comptes et accès (besoin B8, voir [06-comptes-et-connexion.md](06-comptes-et-connexion.md))

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-80 | L'application doit n'afficher, sans session valide, que les écrans de connexion, de création du premier compte, d'invitation et de réinitialisation. | Sans session, toute route de l'API autre que celles de l'accès répond 401 (test sur toutes les routes enregistrées). | M |
| FR-81 | Au premier lancement, quand aucun compte n'existe, l'application doit proposer la création du compte administrateur (nom, e-mail, mot de passe), et exiger en plus le code de création quand la personne qui gère le serveur en a défini un (`SETUP_CODE`). | L'écran n'apparaît que si aucun compte activé n'existe ; une seconde création est refusée (409) ; avec un code défini, une création sans le bon code est refusée (403) et compte comme un essai raté. | M |
| FR-82 | Le compte administrateur créé doit devenir propriétaire d'une bibliothèque déjà présente dans la base. | Une base de 14 anime d'avant les comptes montre ces 14 anime, avec leurs rangs, à l'administrateur. | M |
| FR-83 | L'utilisateur peut se connecter avec son e-mail et son mot de passe. | Un e-mail inconnu et un mauvais mot de passe donnent le même message. | M |
| FR-84 | L'utilisateur peut se déconnecter. | Le cookie d'une session fermée est refusé (401) ensuite. Si la déconnexion échoue, l'interface le dit et reste connectée. | M |
| FR-85 | L'utilisateur peut changer son mot de passe en saisissant l'ancien ; ses autres sessions doivent alors être fermées. | Deux sessions, un changement : l'autre session répond 401. | S |
| FR-86 | L'administrateur peut créer une invitation à usage unique, valable 7 jours, qui produit un lien. | Le lien porte le jeton dans le fragment `#` ; le jeton n'est montré qu'à la création. | M |
| FR-87 | Une personne munie d'un lien d'invitation valide peut créer un compte membre (nom, e-mail, mot de passe). | Une invitation expirée, utilisée ou révoquée est refusée avec le même message : « Invitation invalide ou expirée ». | M |
| FR-88 | L'application ne doit permettre de créer un compte qu'avec une invitation valide, ou au premier lancement. | Une inscription sans jeton valide est refusée (403) une fois le premier compte créé. | M |
| FR-89 | L'administrateur peut voir ses invitations avec leur état (en attente, utilisée, expirée, révoquée) et révoquer une invitation en attente. | Une invitation révoquée ne permet plus de créer de compte. | S |
| FR-90 | L'administrateur peut désactiver et réactiver un membre. | Un membre désactivé ne peut plus se connecter, ses sessions sont fermées, sa bibliothèque est conservée. | M |
| FR-91 | L'administrateur peut créer, pour un membre, un lien de réinitialisation du mot de passe à usage unique, valable 24 h. | Le lien permet de choisir un nouveau mot de passe, ferme les sessions du membre, puis ne sert plus. | S |
| FR-92 | L'administrateur peut créer en ligne de commande, sur la machine du serveur, un lien de réinitialisation pour n'importe quel compte, le sien compris. | `npm run admin:reset-link -- <e-mail>` affiche un lien valable 24 h. | S |
| FR-93 | L'interface doit afficher le nom du compte connecté et proposer, depuis ce nom, le changement de mot de passe, la déconnexion et, pour l'administrateur, l'administration. | Parcours sur PC et à 375 px. | M |
| FR-94 | Quand une session expire, l'interface doit ramener à la connexion puis rouvrir la page où se trouvait l'utilisateur. | Expiration puis connexion : la page de départ est restaurée. | S |

### Une bibliothèque par personne (besoin B9)

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-95 | Chaque utilisateur doit voir et modifier uniquement sa propre bibliothèque, son classement, ses statistiques, son tirage au sort et ses exports. | Test à deux comptes : lire, modifier, supprimer ou classer une entrée de l'autre répond 404 ; statistiques et exports ne contiennent que ses données. | M |
| FR-96 | Le système doit garder une seule copie des métadonnées d'un anime pour tous les comptes. | Deux comptes qui ajoutent le même anime partagent une ligne `media` et ont chacun leur ligne de bibliothèque et leur rang. | S |
| FR-97 | L'administrateur ne doit pas pouvoir lire la bibliothèque d'un autre compte depuis l'application. | Aucune route d'administration ne renvoie d'entrée, de note ou de statistique d'un membre. | M |
| FR-98 | La restauration d'un export doit agir uniquement sur la bibliothèque de l'utilisateur connecté, et seulement si elle est vide. | Test à deux comptes : la restauration du premier ne touche pas le second. | M |
| FR-99 | Une restauration ne doit jamais modifier les métadonnées d'un anime déjà connu du système ; seules les données du fournisseur (ajout depuis Kitsu) les rafraîchissent. | Test à deux comptes : après une restauration qui porte le même identifiant Kitsu avec un autre titre, le titre, le nombre d'épisodes et les statistiques de l'autre compte sont inchangés. | M |
| FR-100 | Une bibliothèque ne doit pas dépasser 5 000 anime, ni un anime 5 000 épisodes marqués. | Le 5 001ᵉ anime et le 5 001ᵉ épisode sont refusés (409) avec un message. | S |
| FR-101 | Quand un lien de réinitialisation est créé ou utilisé, ou quand le mot de passe d'un compte change, les autres liens de réinitialisation en attente de ce compte doivent être révoqués. | Deux liens émis : le plus ancien ne sert plus ; un lien en attente ne survit pas à un changement de mot de passe. | S |

### Ambiance des écrans d'accès (besoin B3, voir [06-comptes-et-connexion.md](06-comptes-et-connexion.md), section 5.4)

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-102 | Les écrans d'accès doivent montrer, derrière la carte, un mur de couvertures d'anime en mouvement lent, choisies parmi les anime du moment de Kitsu et jamais dans la bibliothèque d'un compte. | Aucune couverture ne vient d'un compte ; sont écartés les titres `nsfw`, de classification R18 ou sans couverture. | S |
| FR-103 | Le fond doit rester présentable quand Kitsu ou les images sont indisponibles : des tuiles de repli aux couleurs de l'application remplacent les couvertures. | Fournisseur en panne : l'écran s'affiche complet, sans image cassée ni attente. | S |
| FR-104 | Le fond des écrans d'accès doit rester animé sans bouton de pause ; il est immobile quand le système demande de réduire les animations et absent quand l'utilisateur économise les données. | Aucun bouton de pause sur les écrans d'accès ; sous `prefers-reduced-motion`, aucune animation ; décision du propriétaire du 2026-10-08, écart assumé avec WCAG 2.2.2 (voir 06, section 5.4). | M |

### Langues, textes et confort (besoin B11, voir [07-langues-et-textes.md](07-langues-et-textes.md))

| ID | Exigence | Critère de vérification | Prio |
|---|---|---|---|
| FR-105 | Un bouton de langue doit être présent sur chaque écran et faire passer toute l'interface du français à l'anglais, et inversement, sans recharger la page ni perdre ce qui est à l'écran (saisie en cours, page, fiche ouverte). | Test navigateur : un champ rempli et une fiche ouverte survivent au changement ; `lang` de la page suit ; derrière une fenêtre modale le bouton est inerte comme le reste de la page. | M |
| FR-106 | Au premier lancement la langue doit être l'anglais si le navigateur demande une langue `en…`, le français sinon ; le choix de l'utilisateur doit être gardé sur son appareil. | Tests de la sélection ; rechargement qui garde le choix. | M |
| FR-107 | Chaque texte de l'interface (libellés, messages du serveur, dates, nombres, durées, pluriels) doit exister en français et en anglais, et aucun texte visible n'est écrit en dur dans un composant. | Test de parité des catalogues (mêmes clés, mêmes paramètres) ; test qui refuse un texte littéral dans les fichiers de composants. | M |
| FR-108 | Les textes venus de Kitsu doivent s'afficher dans la langue choisie : genres, type, statut et classification par dictionnaire ; synopsis par traduction. Les titres d'anime restent ceux de Kitsu. | Chaque genre conservé par l'application a une forme française ; un synopsis demandé en français est traduit, gardé en base, et la deuxième demande ne rappelle pas le service. | M |
| FR-109 | Quand un synopsis n'a pas de traduction (aucun service configuré, service en panne), le texte d'origine doit s'afficher avec la mention discrète de sa langue ; si le navigateur sait traduire sur l'appareil, il peut proposer de le faire. | Service absent : texte anglais et mention, aucune erreur visible. | S |
| FR-110 | Un bouton « haut de page » de 44 px doit apparaître après un défilement de plus d'un écran et demi, ramener en haut (sans animation si le système le demande) et rester absent quand une fenêtre est ouverte. | Test navigateur : absent en haut de page, présent après défilement, remet `scrollY` à 0 ; nom accessible dans les deux langues. | S |
| FR-111 | Les textes de l'interface doivent suivre le guide de voix et de ton de `07-langues-et-textes.md` : courts, au tutoiement, sans justification, un verbe sur chaque bouton, erreurs sans blâme avec le correctif. | Relecture avec la liste du guide ; aucun texte du catalogue au-delà de 160 caractères. | M |

## 6. Exigences non fonctionnelles

| ID | Catégorie | Exigence | Critère de vérification |
|---|---|---|---|
| NFR-01 | Performance | La liste de la bibliothèque doit s'afficher en moins de 1 s pour 500 entrées, base locale. | Mesure sur jeu de données de test |
| NFR-02 | Performance | Un indicateur de chargement doit apparaître si une recherche dépasse 300 ms. | Test manuel avec réseau ralenti |
| NFR-03 | Performance | Le système doit attendre au moins 350 ms après la dernière frappe avant de lancer une recherche. | Test unitaire du debounce |
| NFR-04 | Utilisabilité | Marquer un épisode depuis le Dex doit demander une seule interaction. | Revue de parcours |
| NFR-05 | Accessibilité | Le texte doit respecter un contraste d'au moins 4,5:1 (WCAG 1.4.3) et les composants graphiques 3:1 (1.4.11), en mode clair et en mode sombre. | Calcul de contraste sur les jetons |
| NFR-06 | Accessibilité | Toutes les fonctions doivent être utilisables au clavier, avec focus visible (WCAG 2.1.1, 2.4.7). | Parcours clavier |
| NFR-07 | Accessibilité | Les cibles tactiles doivent mesurer au moins 44 × 44 px (WCAG 2.5.5). | Inspection CSS |
| NFR-08 | Accessibilité | Les animations doivent être désactivées ou réduites si `prefers-reduced-motion` est actif. | Test avec la préférence activée |
| NFR-09 | Compatibilité | L'interface doit rester utilisable à 375 px de large sans défilement horizontal. | Test à 375 px |
| NFR-10 | Sécurité | Toute requête SQL doit être paramétrée. | Revue de code, recherche de concaténation |
| NFR-11 | Sécurité | Le serveur doit écouter par défaut sur 127.0.0.1 uniquement. | Test de configuration par défaut |
| NFR-12 | Sécurité | Les identifiants de base de données doivent venir uniquement de variables d'environnement et ne jamais être versionnés. | `.env` ignoré par git ; `.env.example` sans secret |
| NFR-13 | Sécurité | Le relais d'images doit refuser tout hôte qui n'est pas `media.kitsu.app`. | Test unitaire sur URL hors liste |
| NFR-14 | Sécurité | Le rôle de base de données de l'application doit se limiter à lire et écrire les données, sans droit de modifier le schéma. | Revue des `GRANT` |
| NFR-15 | Confidentialité | Le navigateur ne doit contacter aucun domaine tiers : polices et couvertures sont servies par l'application. | Inspection du réseau |
| NFR-16 | Respect de l'API | Le client Kitsu doit s'identifier par un `User-Agent`, limiter à 2 requêtes simultanées et mettre en cache les recherches 10 minutes. | Test unitaire du client |
| NFR-17 | Fiabilité | Le système doit s'arrêter avec un message clair si la base est injoignable au démarrage. | Test avec URL invalide |
| NFR-18 | Durabilité | Une sauvegarde complète doit pouvoir être produite par une seule commande et sa restauration vérifiée dans une base temporaire. | Script de sauvegarde et de vérification |
| NFR-19 | Maintenabilité | Le code doit compiler en mode TypeScript strict sans `any`. | `tsc --noEmit` sans erreur |
| NFR-20 | Maintenabilité | Toute logique de domaine (classement, notes, tirage, séries) doit être couverte par des tests unitaires. | `npm test` vert |
| NFR-21 | Portabilité | Le système doit fonctionner sur Node 22 et PostgreSQL 15 ou plus. | Tests sur PGlite et sur le Postgres du homelab |
| NFR-22 | Sécurité | Le serveur doit refuser toute requête dont l'en-tête Host ne figure pas dans la liste autorisée (protection contre le rebond DNS). | Test HTTP avec un Host étranger |
| NFR-23 | Sécurité | Le serveur doit refuser toute requête de l'API, lecture comprise, dont l'en-tête Origin diffère de l'hôte ou dont `Sec-Fetch-Site` n'est ni `same-origin` ni `none`. | Tests HTTP avec une origine étrangère et un autre port local |
| NFR-24 | Sécurité | Une cellule texte du CSV commençant par un caractère de formule (`=`, `+`, `-`, `@`) doit être neutralisée. | Test unitaire de l'échappement |
| NFR-25 | Sécurité | Les réponses de l'API qui contiennent des données personnelles doivent porter `Cache-Control: no-store` ; seules les couvertures peuvent être mises en cache. | Test HTTP sur les en-têtes |
| NFR-26 | Sécurité | La politique de sécurité du contenu ne doit autoriser ni script ni style en ligne. | Test HTTP sur l'en-tête CSP |
| NFR-27 | Utilisabilité | Les filtres, le tri, les onglets et la position de défilement de chaque page doivent être conservés lors d'un aller-retour entre pages pendant la session. | Parcours Dex → Stats → Dex |
| NFR-28 | Mouvement | Les micro-interactions doivent durer de 150 à 300 ms et les enchaînements au plus 400 ms. Seuls les moments de récompense (résultat de classement, tirage, décomptes, surbrillance) peuvent durer jusqu'à 1,2 s. Une animation doit rester interruptible et ne jamais bloquer la saisie. | Revue des durées dans `web/src/motion/` |
| NFR-29 | Mouvement | Sous `prefers-reduced-motion`, chaque animation doit être remplacée par l'affichage immédiat de son état final. | Test avec la préférence activée |
| NFR-30 | Performance perçue | Au retour sur une page déjà visitée, les dernières données connues doivent s'afficher sans écran de chargement, puis se rafraîchir. | Parcours avec réseau ralenti |
| NFR-31 | Accessibilité | Après un changement de page, le focus clavier doit se placer sur le titre de la page et le titre du document doit changer. | Parcours clavier |
| NFR-32 | Lisibilité des graphiques | Une vue de statistiques doit compter au plus 4 indicateurs, chacun accompagné d'un repère (comparaison ou contexte), n'employer qu'une couleur d'accent, faire partir les barres de zéro et exclure les graphiques en 3D. | Revue avec la liste des pièges de tableau de bord |
| NFR-33 | Mouvement | Toute animation ne doit animer que `transform` et `opacity` ; l'ouverture de « Détails » ne doit pas animer la hauteur. | Revue de `web/src/motion/` |
| NFR-34 | Utilisabilité | À 375 px de large, la fiche d'un anime doit tenir sans défilement horizontal, avec son action principale visible et toutes ses cibles d'au moins 44 × 44 px. | Mesure dans un navigateur à 375 px |
| NFR-35 | Accessibilité | Les erreurs de saisie de la fiche doivent être annoncées (rôle `alert`) et reliées à leur champ (`aria-describedby`) ; le compteur de progression doit annoncer « Épisode N sur M » une fois, sans énoncer chaque étape du décompte. | Revue de l'arbre d'accessibilité |
| NFR-36 | Sécurité | Un mot de passe doit être haché avec scrypt (N = 2^17, r = 8, p = 1) et un sel aléatoire de 16 octets propre à chaque mot de passe ; il ne doit jamais être stocké, journalisé ni renvoyé en clair. Une empreinte stockée dont les paramètres exigeraient plus de 256 MiB doit être refusée sans calcul. | Test unitaire des paramètres encodés ; test d'une empreinte aux paramètres démesurés ; revue des journaux |
| NFR-37 | Sécurité | Un mot de passe doit compter au moins 15 caractères (forme NFC), accepter jusqu'à 128 caractères, n'imposer aucune règle de composition et être refusé s'il figure dans la liste de mots de passe interdits (courants, ou contenant l'e-mail, le nom ou « otakudex »). | Tests unitaires de la politique |
| NFR-38 | Sécurité | Un jeton de session doit compter 256 bits aléatoires ; seule son empreinte SHA-256 doit être stockée. | Test : la base ne contient pas le jeton |
| NFR-39 | Sécurité | Le cookie de session doit porter `HttpOnly`, `SameSite=Strict` et `Path=/`, et aussi `Secure` avec le préfixe `__Host-` quand l'application est servie en HTTPS. | Test des en-têtes `Set-Cookie` dans les deux modes |
| NFR-40 | Sécurité | Une session doit expirer 30 jours après sa création ou après 7 jours d'inactivité ; un nouveau jeton doit être émis à chaque connexion ; la déconnexion doit invalider la session côté serveur. | Tests avec horloge simulée |
| NFR-41 | Sécurité | Après 5 essais de connexion pour un même e-mail (connu ou non), la connexion doit être refusée pendant 1 s, durée doublée à chaque essai suivant et plafonnée à 15 min ; chaque essai doit être compté avant toute attente, de sorte que des essais simultanés ne contournent pas la limite ; le compteur repart à zéro après une connexion réussie. | Test unitaire de la temporisation ; test avec 40 essais simultanés |
| NFR-42 | Sécurité | La connexion ne doit pas révéler si un e-mail existe : même message, même code, durée de traitement comparable. | Test : même réponse pour un e-mail inconnu, un mauvais mot de passe et un compte désactivé |
| NFR-43 | Sécurité | Les jetons d'invitation et de réinitialisation doivent compter 256 bits aléatoires, être stockés hachés, servir une seule fois et expirer. | Tests de réutilisation et d'expiration |
| NFR-44 | Sécurité | Toute route de l'API doit exiger une session valide, sauf une liste fermée de routes d'accès et `/api/health` ; les routes `/api/admin/*` doivent exiger le rôle administrateur. | Test qui parcourt toutes les routes enregistrées |
| NFR-45 | Sécurité | Chaque requête SQL sur les données d'un utilisateur doit être restreinte à son identifiant. | Test d'isolation à deux comptes ; revue des requêtes |
| NFR-46 | Sécurité | La base doit refuser, par contrainte, une entrée sans propriétaire, deux entrées du même anime pour un propriétaire et deux rangs identiques pour un propriétaire. | Tests de contraintes |
| NFR-47 | Sécurité | Les mots de passe, jetons et cookies ne doivent figurer dans aucun journal. | Test : le journal d'une connexion ne contient aucun secret |
| NFR-48 | Sécurité | L'application doit limiter à 60 les requêtes d'accès par adresse en 10 minutes (la déconnexion n'est jamais comptée ni refusée) et à 2 les hachages de mot de passe simultanés. | Tests unitaires |
| NFR-49 | Utilisabilité | Les écrans d'accès doivent demander au plus trois champs (nom, e-mail, mot de passe), sans confirmation du mot de passe, avec un bouton « Afficher » et le collage autorisé ; seul l'écran de création du premier compte ajoute le code de création, et seulement quand le serveur en exige un. | Revue des écrans |
| NFR-50 | Accessibilité | Les champs d'accès doivent porter les attributs `autocomplete` adaptés (`name`, `username`, `current-password`, `new-password`) ; les erreurs doivent être annoncées et reliées à leur champ. | Revue de l'arbre d'accessibilité ; test avec un gestionnaire de mots de passe |
| NFR-51 | Sécurité | Quand l'application écoute hors de la machine locale sans cookie sécurisé, ou sans aucun compte et sans code de création, elle doit afficher un avertissement au démarrage. | Test de la configuration |
| NFR-52 | Intégrité | Une base embarquée ne doit pas pouvoir être ouverte par deux processus à la fois : le second doit s'arrêter avec un message clair, et un verrou laissé par un processus disparu ne doit pas bloquer. | Test sur un dossier temporaire, avec un verrou vivant puis périmé |
| NFR-53 | Fiabilité | Une restauration ne doit pas bloquer les lectures ni les écritures des autres comptes : elle ne verrouille que le compte qui restaure. | Revue du verrou ; deux restaurations de comptes différents réussissent ensemble |
| NFR-54 | Sécurité | La limite par adresse doit compter le client réel : derrière un proxy de confiance (`TRUST_PROXY=true`), l'adresse du client ; les adresses IPv6 comptent par bloc /64 ; la table de comptage reste bornée. | Tests unitaires de la clé et de la borne |
| NFR-55 | Performance | L'écran de connexion ne doit charger que son propre code : le premier fichier JavaScript pèse au plus 20 Ko compressé (gzip) et n'embarque ni les pages, ni les graphiques, ni anime.js ; le code de l'application est un fichier séparé, chargé ensuite en temps d'inactivité. Les images du fond pèsent au plus 200 Ko en tout, ne retardent ni l'affichage de la carte ni la saisie, et ne sont pas chargées quand l'utilisateur a demandé d'économiser les données. | Test de la taille du fichier d'entrée après `npm run build` ; test du fond sans réseau |
| NFR-56 | Sécurité | Les routes publiques du fond ne doivent accepter aucun paramètre désignant une adresse : elles ne servent que les couvertures d'une liste gardée en mémoire (14 au plus, toutes sur `media.kitsu.app`), rafraîchie au plus toutes les 6 h, et au plus toutes les 10 min après un échec, quelle que soit la fréquentation. | Index hors liste refusé ; cent appels, une seule requête vers Kitsu |
| NFR-57 | Performance | Les fichiers du client dont le nom contient une empreinte doivent être mis en cache un an sans revalidation ; la page d'entrée ne doit jamais l'être ; les réponses textuelles (page, scripts, styles, JSON) doivent être compressées quand le navigateur l'accepte. | Test des en-têtes de réponse |
| NFR-58 | Performance | Les écrans d'accès ne doivent charger que le catalogue `access` de la langue active ; le catalogue `app` et la deuxième langue ne sont chargés qu'à la demande. Le budget du premier fichier (NFR-55) reste respecté. | Test de la taille du fichier d'entrée ; test qu'aucun texte de `app` n'est dans l'entrée |
| NFR-59 | Sécurité | Le service de traduction ne doit recevoir que le synopsis public d'un anime venu de Kitsu (au plus 4 000 caractères entiers), dans la limite de 60 000 caractères par heure en tout et 20 000 par compte ; son résultat est affiché comme du texte ; une clé de service ne doit jamais être écrite dans le dépôt, renvoyée au client ni envoyée après une redirection. | Tests avec un faux fournisseur : texte importé jamais envoyé, budgets, coupe sur caractères entiers, redirection refusée ; recherche de la clé dans les réponses |
| NFR-60 | Fiabilité | Une panne du service de traduction ne doit ni bloquer la fiche ni être gardée : un nouvel essai est permis au plus toutes les 5 minutes (pour tous les textes si la panne vient du service, pour le seul texte refusé sinon), et une requête simultanée pour le même texte n'appelle le service qu'une fois. | Test avec un faux fournisseur qui échoue puis réussit ; test d'un texte refusé qui n'arrête pas les autres |
| NFR-61 | Performance | La question « qui est connecté ? » doit partir dès le démarrage, sans attendre le catalogue de textes de la langue. Quand le navigateur se souvient qu'une session était ouverte, le fichier de l'application et le catalogue `app` de la langue active doivent aussi être demandés dès le démarrage, en même temps que cette question. Ce souvenir ne doit contenir aucune donnée personnelle, et il doit être effacé à la déconnexion, à l'expiration de la session et à toute réponse « personne n'est connecté ». | Test unitaire du souvenir ; test de la chaîne de chargement ; mesure (docs/09) |
| NFR-62 | Accessibilité | Le nom accessible d'un contrôle doit contenir son texte visible (WCAG 2.5.3) : la couverture ouvre la fiche sous le nom « Ouvrir {titre} » suivi des pastilles visibles (tier, statut) ; le lien de marque garde « Otakudex » dans son nom ; les lettres décoratives (logo, couverture manquante) ne doivent pas faire partie du texte de la page. | Test du libellé de couverture ; audit d'accessibilité du navigateur |
| NFR-63 | Performance | Les deux polices de la première page (Figtree latin, Dela Gothic latin, woff2) doivent être annoncées par `preload` dans la page d'entrée construite, depuis la même origine. | Test de `web/dist/index.html` |
| NFR-64 | Découvrabilité | La page d'entrée doit porter une description ; `/robots.txt` doit être un fichier texte qui interdit `/api/`. | Test de la page construite ; test de la réponse du serveur |
| NFR-65 | Sécurité | Toute réponse doit porter `Cross-Origin-Opener-Policy: same-origin`. | Test HTTP sur les en-têtes |
| NFR-66 | Performance | Après `npm run build`, le fichier de l'application doit peser au plus 48 Ko compressés et le CSS au plus 10 Ko compressés. La performance se mesure sur la version construite, jamais sur le serveur de développement (protocole : docs/09). | Test de la taille des fichiers construits |

## 7. Contraintes

| ID | Contrainte |
|---|---|
| CON-01 | Les métadonnées viennent uniquement de l'API Kitsu. Aucun scraping, aucun relais non officiel, aucun site de streaming ou de téléchargement. |
| CON-02 | Base PostgreSQL : Neon en production, Postgres du homelab pour les tests locaux, via `DATABASE_URL`. |
| CON-03 | Les comptes se créent au premier lancement (administrateur) puis sur invitation de l'administrateur. Aucune inscription ouverte. |
| CON-06 | Les mots de passe sont gérés par l'application : aucun fournisseur d'identité externe, aucun envoi d'e-mail (l'administrateur remet les liens lui-même). |
| CON-04 | Interface en français. |
| CON-05 | Dépendances npm limitées à des paquets réputés et maintenus. |

## 8. Hypothèses et risques

| ID | Hypothèse ou risque | Réponse |
|---|---|---|
| H1 | L'API Kitsu reste ouverte, sans clé. | Instantané local (FR-03) et ajout manuel (FR-04). |
| H2 | L'application peut sortir de la machine locale (amis, téléphone). | Accès par compte (FR-80), écoute locale par défaut (NFR-11), HTTPS exigé hors réseau de confiance (NFR-39, NFR-51). |
| R4 | Le mot de passe de l'administrateur est perdu : plus personne ne peut inviter. | Lien de réinitialisation en ligne de commande sur le serveur (FR-92). |
| R5 | La liste des mots de passe interdits est locale, donc moins complète qu'un service de mots de passe compromis. | Longueur minimale de 15 caractères (NFR-37), blocage progressif des essais (NFR-41) ; aucun service tiers (CON-06). |
| R6 | Les sauvegardes contiennent les empreintes des mots de passe. | Droits `600` sur les sauvegardes, rangées hors du dépôt (docs/03). |
| R1 | Kitsu est maintenu par une seule personne et peut disparaître. | Abstraction « fournisseur de métadonnées » avec une seule implémentation, remplaçable sans toucher au domaine. |
| R2 | Les images Kitsu n'ont pas de CORS. | Relais d'images par le serveur (NFR-13, NFR-15), qui permet aussi l'export d'image. |
| R3 | Le classement par duels est peu prouvé comme attente du marché. | Sans importance pour un usage perso ; il alimente aussi les stats et le bilan annuel. |

## 9. Traçabilité besoins → exigences

| Besoin | Exigences |
|---|---|
| B1 | FR-20 à FR-28 |
| B2 | FR-01 à FR-13, NFR-04, NFR-03, FR-61 à FR-64, NFR-27 à NFR-31, FR-70 à FR-79, NFR-33, NFR-35 |
| B3 | FR-30 à FR-35, FR-60, FR-65 à FR-69, NFR-32, FR-102 à FR-104, FR-110 |
| B4 | FR-40, FR-41 |
| B5 | FR-03, FR-50 à FR-52, NFR-18 |
| B6 | NFR-07, NFR-09, NFR-34, NFR-55, NFR-57, NFR-58, NFR-61 à NFR-66 |
| B7 | CON-01, NFR-13, NFR-15, NFR-16 |
| B8 | FR-80 à FR-94, FR-101, CON-03, CON-06, NFR-36 à NFR-44, NFR-47 à NFR-52, NFR-54, NFR-56 |
| B9 | FR-95 à FR-100, NFR-45, NFR-46, NFR-53 |
| B10 | Aucune exigence en v2 ; contraintes de conception : FR-96 (anime partagés), FR-97 (bibliothèques privées par défaut) |
| B11 | FR-105 à FR-109, FR-111, NFR-58 à NFR-60 |

## 10. Glossaire

| Terme | Sens |
|---|---|
| Dex | Écran principal : le mur des couvertures de la bibliothèque |
| Arène | Écran des duels de classement |
| Compartiment | Groupe de goût choisi avant les duels : adoré, bien, bof |
| Duel | Question « lequel est meilleur ? » entre deux anime |
| Instantané | Copie locale des métadonnées d'un anime au moment de l'ajout |
| Tier | Niveau S, A, B, C ou D dérivé de la note |
| Administrateur | Premier compte créé ; gère les invitations et les membres, ne lit pas leurs bibliothèques |
| Membre | Compte créé sur invitation ; possède sa bibliothèque |
| Invitation | Lien à usage unique, valable 7 jours, qui permet de créer un compte membre |
| Lien de réinitialisation | Lien à usage unique, valable 24 h, qui permet de choisir un nouveau mot de passe |
| Session | Connexion en cours d'un navigateur, identifiée par un cookie |

## 11. Scénarios d'acceptation clés

1. **Ajouter.** Je tape « frieren » ; en moins de 2 s, les résultats s'affichent ; je choisis « en cours » ; la carte apparaît dans le Dex avec sa couverture.
2. **Marquer.** Depuis le Dex, j'appuie sur « +1 » sur une carte ; la progression passe de 4 à 5 ; l'historique contient l'épisode 5 avec l'heure.
3. **Terminer.** J'appuie sur « +1 » sur le dernier épisode ; le statut devient « terminé » ; une animation s'affiche ; l'app propose de classer l'anime.
4. **Classer.** Je choisis « adoré » ; 3 duels maximum si 5 anime sont déjà classés adorés ; l'anime reçoit un rang et une note.
5. **Restaurer.** J'exporte en JSON, je vide la base de test, je restaure ; la bibliothèque est identique.
6. **Fiche.** J'ouvre la fiche d'un anime en cours : je vois le statut, « 5 / 13 », le temps restant et un bouton « Vu : épisode 6 » en bas. Un appui : le compteur passe à 6 et la barre avance sans attendre le serveur, « Enregistré » apparaît. Je déplie « Détails », je tape 03102026 dans « Commencé le » : le champ affiche 03/10/2026 et la date est enregistrée à la sortie du champ.
7. **Erreur de saisie.** Dans « Terminé le », je tape une date avant le début : un message sous le champ le dit et donne un exemple valide ; rien n'est enregistré. Je tape une note puis j'appuie sur Échap : en rouvrant la fiche, la note est là.
8. **Premier lancement.** J'ouvre l'application sur une base qui contient déjà 14 anime ; l'écran « Crée ton compte » s'affiche avec la mention que mon Dex actuel sera rattaché. Je saisis mon nom, mon e-mail et une phrase de 15 caractères ou plus ; je vois mon Dex avec mes 14 anime. Je rouvre l'adresse dans une fenêtre privée : seul l'écran de connexion apparaît, sans création de compte.
9. **Inviter.** Dans mon compte, « Administration », je crée une invitation « Camille ». Le lien s'affiche une seule fois, avec « Copier ». Camille l'ouvre, crée son compte et voit un Dex vide. L'invitation passe à « utilisée » ; rouvrir le lien affiche « Invitation invalide ou expirée ».
10. **Isolation.** Camille ajoute « Frieren » : mon Dex et mon classement ne changent pas. Une requête de Camille sur l'identifiant d'une de mes entrées répond 404.
11. **Essais répétés.** Cinq mauvais mots de passe de suite sur un même e-mail : le sixième essai reçoit « Trop d'essais. Réessaie dans N s. », même si l'e-mail n'existe pas.
12. **Mot de passe oublié.** Camille a oublié son mot de passe ; je crée pour elle un lien de réinitialisation valable 24 h ; elle choisit un nouveau mot de passe ; ses anciennes sessions sont fermées et le lien ne sert plus.

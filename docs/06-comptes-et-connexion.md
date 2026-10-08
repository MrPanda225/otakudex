# Otakudex — Comptes et connexion

Conception de l'accès par compte, appliquant les cinq guides avant tout code : exigences (besoins B8 à
B10, FR-80 à FR-98, NFR-36 à NFR-51, dans [01-exigences.md](01-exigences.md) : source unique, elles ne sont
pas recopiées ici), UX et UI (sections 5 et 6), base de données ([03-donnees.md](03-donnees.md), section
« Comptes »), code propre (section 7).

Sources de sécurité (officielles uniquement) : OWASP Password Storage, Session Management, Authentication et
Forgot Password Cheat Sheets ; NIST SP 800-63B-4 ; documentation de Node.js (`crypto`). Les valeurs qui en
sortent sont citées dans la section 2.

## 1. Contexte (protocole UX et exigences)

| Question | Réponse |
|---|---|
| Demande (2026-10-08) | « Tout doit commencer par une interface de connexion pour créer un compte avant d'utiliser l'app. » Précisé : le premier compte a tous les droits ; d'autres personnes de confiance (des amis) peuvent créer un compte **si l'administrateur les y autorise** ; chacune a son propre Dex ; plus tard, comparer ce que les amis ont regardé. Connexion par e-mail et mot de passe gérés par l'application. |
| « Pourquoi ? » (besoin réel) | Que l'application ne soit pas ouverte à quiconque atteint son adresse (B8) **et** que chaque ami ait ses propres données (B9). La comparaison (B10) est une suite, pas un besoin de cette version. |
| Utilisateurs | L'administrateur (le propriétaire, usage fréquent) ; des membres, amis, usage fréquent aussi, sans connaissances techniques. |
| Où dans le parcours (Karaponos) | Orientation pour les membres (première invitation, premier Dex vide), incorporation ensuite : se connecter doit rester presque invisible (session de 30 jours, gestionnaire de mots de passe). |
| Plateforme | Web, PC d'abord, téléphone ensuite ; WCAG 2.2 AA d'abord (guide UI). |
| Techniques d'élicitation | Interview (les réponses du 2026-10-08), analyse documentaire (sources officielles ci-dessus), analyse du code existant (routes, services, schéma). Prototype : les écrans sont vérifiés dans un navigateur avant livraison. |

## 2. Décisions

| Décision | Choix | Pourquoi (source) | Modifiable ? |
|---|---|---|---|
| Qui crée un compte | Le premier lancement crée l'administrateur ; les autres comptes passent par une **invitation** de l'administrateur (lien à usage unique, 7 jours) | L'utilisateur veut autoriser chaque personne. Une invitation évite un formulaire d'inscription ouvert à tout Internet (spam, énumération). Une « demande à valider » est possible plus tard | Oui : choix par défaut, à confirmer |
| Authentification | E-mail et mot de passe, gérés par l'application | Réponse de l'utilisateur ; aucun service tiers (B7, NFR-15, CON-06) | Non |
| Hachage | scrypt, N = 2^17 (128 MiB), r = 8, p = 1, sel de 16 octets | OWASP Password Storage : première des configurations équivalentes recommandées pour scrypt. Module `crypto` de Node : aucune dépendance. Argon2id est préféré par OWASP mais n'existe pas dans Node 22 | Oui : le format d'empreinte porte ses paramètres |
| Mot de passe | 15 caractères au moins, 128 au plus ; aucune règle de composition ; liste d'interdits ; forme NFC ; collage et « afficher » permis | NIST SP 800-63B-4 : 15 caractères au minimum quand le mot de passe est le seul facteur, au moins 64 acceptés, aucune règle de composition, comparaison à une liste de mots de passe courants ou compromis, normalisation NFC conseillée, collage et affichage conseillés | Oui |
| Jeton de session | 32 octets aléatoires (256 bits), cookie ; seule l'empreinte SHA-256 est en base | OWASP Session Management : au moins 128 bits, 160 conseillés ; stocker un vérificateur à sens unique (SHA-256) | Non |
| Cookie | `HttpOnly`, `SameSite=Strict`, `Path=/` ; avec `Secure` et le préfixe `__Host-` en HTTPS | OWASP : `Secure`, `HttpOnly`, `SameSite=Strict` de préférence, préfixe `__Host-` recommandé pour l'identifiant de session | Non |
| Durée de session | 30 jours au plus, 7 jours d'inactivité | NIST SP 800-63B-4, niveau 1 (mot de passe seul) : 30 jours. **Écart assumé** avec OWASP (15 à 30 minutes d'inactivité pour les applications à faible risque, 4 à 8 h au plus) : ce serait hostile pour un suivi qu'on ouvre quelques fois par semaine, et les données (une liste d'anime) sont à faible risque. Chacun peut se déconnecter, et le changement de mot de passe ferme les autres sessions | Oui |
| Renouvellement | Nouveau jeton à chaque connexion, jamais un jeton fourni par le client ; fermeture des autres sessions au changement de mot de passe | OWASP : renouveler après tout changement de privilège | Non |
| Essais de connexion | Compteur par e-mail (connu ou non), à partir du 5ᵉ échec : 1 s, doublé à chaque échec, plafond 15 min ; plus une limite large par adresse (60 en 10 min) | OWASP Authentication : compteur par compte plutôt que par adresse seule, blocage exponentiel à partir d'environ 1 s. La limite par adresse protège le processeur contre un flot de hachages | Oui (paramètres) |
| Messages | Connexion : un seul message pour e-mail inconnu, mauvais mot de passe ou compte désactivé ; même durée de traitement (hachage factice) | OWASP Authentication : messages génériques et traitement identique contre l'énumération | Non |
| Jetons d'invitation et de réinitialisation | 256 bits, hachés en base, usage unique, 7 jours (invitation) et 24 h (réinitialisation) ; **dans le fragment** de l'URL (`#`) | OWASP Forgot Password : générateur sûr, usage unique, expiration, stockage protégé, `Referrer-Policy: no-referrer`. Le fragment n'est jamais envoyé au serveur, ni journalisé, ni transmis en `Referer` : mieux que la chaîne de requête que la fiche cite. Les durées sont un choix du projet : la fiche n'en donne pas | Oui (durées) |
| Rôles | `admin` (un seul : le premier compte) et `member` | Le besoin : l'administrateur « a tous les droits » sur les comptes ; pas de co-administrateur en v2 (YAGNI) | Oui |
| Ce que voit l'administrateur | Les comptes et les invitations, jamais les bibliothèques des membres | « Tous les droits » porte sur l'accès. Les bibliothèques sont privées par défaut, ce qui prépare la comparaison choisie par chaque ami (FR-97) | Non |
| Mots de passe oubliés | Lien de réinitialisation créé par l'administrateur ; pour l'administrateur lui-même, commande sur le serveur. Un nouveau lien, un lien utilisé ou un changement de mot de passe révoque les autres liens en attente du compte | Pas d'envoi d'e-mails (CON-06) ; l'accès au serveur prouve la propriété ; un lien oublié dans une conversation ne doit pas rester utilisable (FR-101) | Oui |
| **Limite honnête** de ce mécanisme | L'administrateur peut donner un nouveau mot de passe à un membre, donc entrer dans son compte et lire sa bibliothèque. Ce n'est pas empêché (sans canal extérieur comme l'e-mail, rien ne le permet) mais c'est **visible** : l'ancien mot de passe cesse de marcher et les sessions du membre sont fermées | Une relecture indépendante l'a relevé : la phrase « personne ne lit ta bibliothèque » du formulaire d'invitation était trop forte. Elle dit maintenant ce que l'application fait : elle ne montre la bibliothèque de personne aux autres | Non : confiance dans l'administrateur, comme pour qui tient le serveur |
| Fond des écrans d'accès | Un mur de couvertures d'anime **du moment** (liste « trending » de l'API officielle de Kitsu), servi par notre serveur, jamais tiré d'une bibliothèque ; des tuiles de repli sans image quand Kitsu ne répond pas | L'écran est public : montrer les anime d'un compte dirait à n'importe qui ce que cette personne regarde. Kitsu est la seule source de métadonnées (CON-01) et le navigateur ne contacte aucun domaine tiers (NFR-15) | Oui |
| Adresse du client | La limite par adresse compte `request.ip`. Derrière un proxy HTTPS, `TRUST_PROXY=true` fait compter l'adresse réelle ; sinon tous les clients partageraient celle du proxy. Les adresses IPv6 comptent par bloc /64 | OWASP : le comptage par compte reste le frein principal ; la limite par adresse ne protège que le processeur. À n'activer que si le proxy **réécrit** `X-Forwarded-For` : sinon n'importe qui peut usurper une adresse | Oui |
| Premier venu | `SETUP_CODE` (facultatif) : tant qu'aucun compte n'existe, la création du premier compte exige ce code. Sans lui, et si le serveur écoute hors de la machine, un avertissement le dit au démarrage | Sans code, le premier visiteur d'un serveur neuf devient administrateur (et reprend une bibliothèque existante) | Oui |
| Hors du réseau local | `COOKIE_SECURE=true` et HTTPS obligatoires ; avertissement au démarrage sinon | Sans HTTPS, mot de passe et cookie circulent en clair (NFR-39, NFR-51) | Non |

## 3. Modèle de menaces

| Menace | Scénario | Parade | Exigences |
|---|---|---|---|
| Deviner un mot de passe en ligne | Un robot essaie des milliers de mots de passe sur un e-mail connu | Blocage exponentiel par e-mail, limite par adresse, mot de passe de 15 caractères minimum, liste d'interdits | NFR-37, NFR-41, NFR-48 |
| Vol de la base ou d'une sauvegarde | Quelqu'un lit `app_user` et `app_session` | scrypt avec sel ; jetons stockés en empreintes ; sauvegardes en mode `600` | NFR-36, NFR-38, NFR-43 |
| Script injecté (XSS) qui lit le cookie | Une page malveillante cherche le cookie | `HttpOnly` ; politique de sécurité du contenu sans script en ligne (déjà en place) | NFR-26, NFR-39 |
| Requête forgée depuis un autre site (CSRF) | Une page tierce fait écrire le navigateur de l'utilisateur | `SameSite=Strict` ; contrôle d'origine de toute requête `/api` (déjà en place) ; corps JSON | NFR-23, NFR-39 |
| Fixation de session | Un attaquant impose un identifiant avant la connexion | Jeton émis par le serveur à chaque connexion ; aucun jeton accepté avant | NFR-40 |
| Énumération des comptes | Distinguer un e-mail connu d'un inconnu | Messages et durées identiques à la connexion. Seule exception acceptée : la création de compte avec une invitation valide dit qu'un e-mail est déjà pris (la personne tient un lien de confiance) | NFR-42 |
| Lire ou modifier les données d'un autre (IDOR) | Un membre change l'identifiant dans une requête | Chaque requête SQL est restreinte au propriétaire ; l'identifiant vient de la session, jamais de la requête ; 404 (pas 403) pour ne rien confirmer | FR-95, NFR-45, NFR-46 |
| Escalade de droits | Un membre appelle une route d'administration | Le rôle se lit en base, côté serveur, à chaque requête ; `admin` unique garanti par un index | NFR-44, FR-97 |
| Rejouer une invitation | Deux personnes utilisent le même lien en même temps | Un seul `UPDATE ... RETURNING` conditionnel : un seul gagne | NFR-43 |
| Fuite du jeton d'invitation | Le lien reste dans un journal, un `Referer`, l'historique | Jeton dans le fragment ; l'interface le retire de l'adresse dès qu'elle l'a lu ; jamais journalisé | NFR-43, NFR-47 |
| Épuisement du serveur par les hachages | Un flot de connexions à 128 MiB chacune | Deux hachages à la fois au plus, limite par adresse (qui ne bloque jamais la déconnexion) ; vérification de l'état « un compte existe déjà » **avant** de hacher la création du premier compte | NFR-48 |
| Écoute du réseau | Mot de passe et cookie lus sur un Wi-Fi | HTTPS et cookie `Secure` hors réseau local, avertissement au démarrage | NFR-39, NFR-51 |
| Mot de passe réutilisé ailleurs | Un ami utilise le même mot de passe partout | Hors de notre contrôle ; l'écran conseille une phrase unique et accepte les gestionnaires de mots de passe | NFR-49, NFR-50 |
| Administrateur curieux | Lire la bibliothèque d'un ami | Aucune route ne la montre. **Limites honnêtes** : (1) qui a accès à la base de données peut tout lire, c'est le propriétaire du serveur ; (2) l'administrateur peut créer un lien de réinitialisation pour un membre, s'en servir, et entrer dans son compte. Visible pour le membre (son mot de passe cesse de marcher), pas empêché | FR-97, FR-101 |
| Fuite avant connexion | L'écran public montre ce qu'un compte regarde | Le fond n'a aucun lien avec les bibliothèques : liste « du moment » de Kitsu, identique pour tous | FR-102 |
| Proxy d'images ouvert, abus de Kitsu | Quelqu'un utilise le fond pour faire récupérer des adresses arbitraires ou marteler Kitsu | Les routes du fond n'acceptent qu'un numéro de tuile ; 14 adresses au plus, toutes sur `media.kitsu.app` ; rafraîchissement toutes les 6 h au plus, 10 min d'attente après un échec | NFR-56 |
| Premier venu sur un serveur neuf | Un robot ouvre l'adresse avant le propriétaire et devient administrateur | `SETUP_CODE` ; avertissement au démarrage quand le serveur est joignable et sans code | FR-81, NFR-51 |
| Essais simultanés | 40 mots de passe testés en même temps sur le même e-mail, avant que le premier échec ne soit compté | Chaque essai est compté **avant** toute attente (le succès efface) | NFR-41 |
| Import qui réécrit le catalogue | Un membre importe un fichier dont l'identifiant Kitsu est celui d'un anime d'un autre : titre, durée, épisodes changent pour tous | Un import ne modifie jamais un anime déjà connu ; seul le fournisseur le rafraîchit | FR-99 |
| Restauration qui bloque les autres | Un membre relance une grosse restauration en boucle : tout le monde attend | Verrou par compte, pas par table ; 5 000 entrées au plus | NFR-53, FR-100 |
| Deux processus sur la base embarquée | La commande de réinitialisation ouverte pendant que le serveur tourne : des écritures se perdent | Fichier de verrou à côté du dossier de données ; le second processus refuse | NFR-52 |

## 4. API

Toutes les routes renvoient du JSON, avec `Cache-Control: no-store`. Le cookie de session est posé et
retiré par le serveur ; le client ne le manipule jamais.

| Route | Accès | Rôle |
|---|---|---|
| `GET /api/auth/state` | Public | `{ phase: 'setup' \| 'signed-out' \| 'signed-in', user?, legacyEntryCount?, needsSetupCode? }` : décide l'écran à afficher |
| `POST /api/auth/setup` | Public, seulement sans compte actif | Crée l'administrateur (reprend une bibliothèque existante) et ouvre sa session ; `setupCode` exigé si `SETUP_CODE` est défini |
| `POST /api/auth/login` | Public | Ouvre une session |
| `POST /api/auth/link/check` | Public | `{ token, kind }` → `{ kind, inviterName, label, accountName }` si le lien est utilisable ; sinon 403 « Invitation invalide ou expirée » (même réponse pour un lien inconnu, utilisé, expiré, révoqué ou d'un autre type) |
| `POST /api/auth/join` | Public, jeton d'invitation | Crée un membre et ouvre sa session |
| `POST /api/auth/reset` | Public, jeton de réinitialisation | Change le mot de passe, ferme les sessions du compte |
| `POST /api/auth/logout` | Session | Ferme la session |
| `POST /api/auth/password` | Session | Change son mot de passe (ancien requis), ferme les autres sessions |
| `GET /api/admin/members` | Administrateur | Comptes : nom, e-mail, rôle, désactivé, dernière connexion |
| `PATCH /api/admin/members/:id` | Administrateur | `{ isDisabled }` (jamais sur soi-même) |
| `POST /api/admin/members/:id/reset-link` | Administrateur | Crée un lien de réinitialisation (jeton renvoyé une fois) |
| `GET /api/admin/invitations` | Administrateur | Invitations et leur état |
| `POST /api/admin/invitations` | Administrateur | `{ label }` → jeton renvoyé une fois |
| `DELETE /api/admin/invitations/:id` | Administrateur | Révoque une invitation en attente |
| Toutes les autres routes `/api/*` | Session | Inchangées, mais limitées au propriétaire (FR-95) |

L'adresse du lien est construite par l'interface : `<origine>/#/invitation/<jeton>` et
`<origine>/#/reinitialisation/<jeton>`.

## 5. UX : parcours et écrans

### 5.1 Modèles appliqués

| Principe | Application |
|---|---|
| **Charge cognitive**, **loi de Hick** | Trois champs au plus, aucune confirmation de mot de passe (le bouton « Afficher » la remplace), un seul bouton principal par écran |
| **Fogg** (capacité) | Le gestionnaire de mots de passe remplit tout (`autocomplete`) ; coller est permis ; le mot de passe peut être une phrase |
| **Karaponos** | Le membre invité est accueilli par le nom de la personne qui l'invite ; une fois connecté, la session de 30 jours rend la connexion invisible |
| **Kairos**, **Peak-End** | Le moment de valeur est l'arrivée dans un Dex à soi : message de bienvenue, état vide avec une seule action. Pas de question avant d'avoir donné quelque chose |
| **Prévention des erreurs** | Message d'erreur sous le champ, avec la marche à suivre ; validation à la sortie du champ, pas à chaque touche ; « Désactiver » demande confirmation |
| **Reconnaissance plutôt que rappel** | L'administration affiche l'état de chaque invitation (en attente, utilisée, expirée) au lieu de le faire retenir |
| **Divulgation progressive** | L'administration n'apparaît que pour l'administrateur, dans le menu du compte ; le lien d'invitation n'est montré qu'après création |
| **Design anticipatif** | Après connexion, retour à la page demandée avant l'expiration (FR-94) |

### 5.2 Écrans d'accès

Un écran centré, sans barre de navigation : une carte avec le logo, un titre, au plus trois champs, un bouton
principal pleine largeur, une aide en bas.

| Écran | Quand | Titre et champs | Bouton | Détails |
|---|---|---|---|---|
| Création du compte | `phase = setup` | « Crée ton compte » ; « Tu seras l'administrateur : toi seul pourras inviter des amis. » Prénom ou pseudo, e-mail, mot de passe, et **le code de création** si le serveur en exige un | « Créer mon compte » | Si une bibliothèque existe : « Ton Dex actuel (14 anime) sera rattaché à ce compte. » |
| Connexion | `phase = signed-out` | « Content de te revoir ». E-mail, mot de passe | « Se connecter » | En bas : « Tu as reçu une invitation ? Ouvre le lien qu'on t'a envoyé. » Après expiration : « Ta session a expiré. Reconnecte-toi. » |
| Invitation | `#/invitation/<jeton>` valide | « *Marie* t'invite sur Otakudex » ; « Ton Dex sera à toi seul : l'application ne le montre à personne. » Prénom ou pseudo, e-mail, mot de passe | « Rejoindre » | Jeton invalide : message et marche à suivre, pas de formulaire |
| Réinitialisation | `#/reinitialisation/<jeton>` valide | « Nouveau mot de passe ». Mot de passe | « Enregistrer » | Le lien ne sert qu'une fois |

Aide du champ mot de passe, toujours visible : « 15 caractères ou plus. Une phrase que tu retiens fonctionne
très bien. »

Messages d'erreur (toujours une icône et un texte, jamais seulement une couleur) :

| Cas | Message |
|---|---|
| Connexion refusée | « E-mail ou mot de passe incorrect. » |
| Trop d'essais | « Trop d'essais. Réessaie dans 30 s. » (la durée vient du serveur) |
| Mot de passe trop court | « Il faut au moins 15 caractères (tu en as 11). » |
| Mot de passe trop courant | « Ce mot de passe est trop courant. Choisis une phrase plus personnelle. » |
| E-mail déjà pris (invitation ou création) | « Cet e-mail a déjà un compte. Connecte-toi plutôt. » |
| E-mail illisible | « Écris ton e-mail comme prenom@exemple.fr. » |
| Invitation ou lien invalide | « Invitation invalide ou expirée. Demande un nouveau lien à la personne qui t'a invité. » |

États du bouton principal : normal, survol, appui, focus, **chargement** (rond qui tourne, bouton désactivé pour
éviter le double envoi), désactivé. Entrée valide le formulaire. Le focus va sur le premier champ en erreur
après un envoi refusé, sur le titre à l'arrivée sur l'écran.

### 5.3 Dans l'application

- Barre du haut : un bouton rond avec l'initiale du nom (44 px) ouvre « Mon compte ». Sous 720 px, le nom
  « Otakudex » disparaît à côté du logo (qui garde une zone de 44 px et son nom accessible) : sans cela, logo,
  « Ajouter », « Données » et le compte ne tiennent pas dans 375 px.
- **Mon compte** (tiroir) : nom, e-mail, rôle ; « Changer mon mot de passe » (ancien, nouveau, bouton
  « Afficher ») ; « Se déconnecter » ; pour l'administrateur, « Administration ».
- **Administration** (tiroir, administrateur seul) :
  1. « Inviter quelqu'un » : un champ « Pour qui ? » (le prénom, pour s'y retrouver) et un bouton. Après
     création, une carte montre le lien, un bouton « Copier » (qui répond « Copié ✓ ») et la mention « Ce lien
     ne sera plus affiché. Valable 7 jours. »
  2. « Invitations » : liste avec état et « Révoquer » pour celles en attente.
  3. « Membres » : nom, e-mail, dernière connexion ; « Lien de réinitialisation » et « Désactiver » (avec
     confirmation) ou « Réactiver ».
- Fin de session : n'importe quelle réponse 401 ramène à l'écran de connexion avec le message d'expiration ;
  après connexion, la page demandée (fragment d'adresse) est rouverte.
- Déconnexion : l'écran revient à la connexion ; les caches locaux (statistiques, filtres de la session, recherche)
  sont effacés, pour que la personne suivante sur ce navigateur ne voie rien.

### 5.4 Le fond des écrans d'accès

Demande (2026-10-08, capture de l'écran de création du compte) : « ajoute des images d'anime derrière,
ou même une courte vidéo, et optimise la page ».

| # | Constat | Principe | Réponse |
|---|---|---|---|
| 1 | Une carte seule sur un fond uni : rien ne dit « anime » avant la lecture du titre | **Effet esthétique-utilisabilité**, **Peak-End** (le premier contact est un des deux moments retenus), **Hassenzahl** (qualité hédonique), **Karaponos** (orientation : reconnaître plutôt que lire) | Un mur de couvertures en défilement lent, aux couleurs de la charte (les tuiles sont les « cartes » du classeur) |
| 2 | Du mouvement et des images à côté d'un formulaire peuvent le concurrencer | **Charge cognitive extrinsèque**, **loi de Hick**, **WCAG 1.4.3** (le texte reste sur une carte opaque) | Opacité à 50 %, voile de la couleur du fond qui s'épaissit vers les bords et autour de la carte, 25 px/s au plus, aucun clignotement, la carte garde son contraste et son ordre de focus |
| 3 | Un mouvement automatique de plus de 5 s doit pouvoir être arrêté | **WCAG 2.2.2** (A), **WCAG 2.3.3** | **Décision du propriétaire (2026-10-08) : pas de bouton de pause**, le fond reste animé. Écart assumé avec 2.2.2 : atténué par un mouvement très lent (un déplacement de 50 % en 2 minutes environ), une opacité réduite, une carte opaque au-dessus, et par les réglages du système, toujours respectés : `prefers-reduced-motion` immobilise le fond, `Save-Data` retire les couvertures. Si un ami en a besoin, la pause se rajoute en un composant (le code d'état existe dans l'historique) |
| 4 | L'écran est public | **Confidentialité**, **Kairos** (on ne demande rien avant d'avoir offert) | Couvertures **du moment** (liste publique de Kitsu) : jamais la bibliothèque d'un compte, jamais de titre `nsfw` ni R18 |
| 5 | Une page de connexion doit s'afficher tout de suite | **Fogg** (capacité), règle des 100 ms | Les images sont secondaires : la carte s'affiche seule, les tuiles de repli (hachures et lettres O-T-A-K-U-D-E-X) sont là d'emblée, les couvertures apparaissent en fondu quand elles arrivent |
| 6 | « Une courte vidéo » | **Droits d'auteur**, **poids**, **batterie** | Pas de fichier vidéo : les extraits d'anime sont protégés, pèsent des mégaoctets et ne se mettent pas en pause proprement. Une boucle CSS de couvertures donne la même impression pour ~0 Ko de vidéo, sur le processeur graphique, et s'arrête sur demande. Si tu as un extrait dont tu détiens les droits, un emplacement `<video muted loop>` pourra être ajouté |

Spécification :

- **Source** : `GET /trending/anime` de l'API Kitsu, filtrée (ni `nsfw`, ni classification R18, ni couverture
  manquante), 14 titres au plus. Le serveur garde la liste en mémoire (6 h) ; les images passent par le relais de
  couvertures existant (hôte `media.kitsu.app` seulement, 5 Mo au plus).
- **Taille d'image** : `tiny`, mesurée à 11 Ko (contre 32 Ko pour `small` et 48 Ko pour `medium`) : 14 vignettes
  ≈ 180 Ko, sous le plafond de 200 Ko (NFR-55 ; 16 vignettes pesaient 206 Ko à la mesure). Dimmées et adoucies par le voile, elles restent lisibles comme des
  couvertures sans demander plus.
- **Routes publiques** : `GET /api/backdrop` (liste d'adresses de même origine, avec un numéro de version) et
  `GET /api/backdrop/:index` (octets de l'image, cache d'un jour). Aucune ne prend d'adresse en paramètre (NFR-56).
- **Disposition** : 5 colonnes à partir de 900 px, 4 à partir de 600 px, 3 en dessous ; tuiles 2:3 ; 7 tuiles par
  colonne, répétées une fois pour une boucle sans couture (`translateY` de 0 à −50 %) ; sens alterné d'une colonne
  à l'autre, durées de 110 à 150 s ; l'ensemble tourne de −8° (statique, donc sans coût d'animation).
- **Performance** : seules les propriétés `transform` et `opacity` s'animent ; une couche par colonne
  (`will-change: transform`) ; `contain: strict` sur le fond ; images `loading="lazy"`, `decoding="async"`,
  `fetchpriority="low"` ; rien n'est chargé si l'utilisateur a demandé d'économiser les données
  (`Save-Data`) ; le fond n'est monté qu'avec les écrans d'accès, jamais dans l'application.
- **Accessibilité** : le fond est décoratif (`aria-hidden`, `alt=""`, `pointer-events: none`, hors de l'ordre du
  focus) ; la mention « Affiches : Kitsu » reste lisible (4,5:1) ; pas de bouton de pause (voir ligne 3 du tableau).
- **Autres gains de la même demande** : le code de l'application (pages, graphiques, fiches, administration,
  anime.js) est un fichier séparé que l'écran de connexion n'embarque pas, préchargé quand le navigateur est
  inactif. Mesuré à la construction : le premier fichier JavaScript passe de **130 Ko (45,7 Ko gzip) à
  43,6 Ko (16,9 Ko gzip)**, soit −63 %. Pour cela, deux animations sont écrites en `@keyframes` CSS au lieu
  d'anime.js (l'arrivée de la carte et les notifications : mêmes durées, mêmes règles de mouvement réduit) ;
  tout le reste passe toujours par `web/src/motion/`. Les fichiers à empreinte du client sont mis en cache un
  an (NFR-57), la page d'entrée jamais, et les réponses textuelles sont compressées (gzip ou brotli niveau 4,
  plugin officiel `@fastify/compress`) : le premier fichier voyage en 16,9 Ko au lieu de 43,6 Ko.
- **Limite de la mesure** : les outils de laboratoire (Lighthouse) peuvent désigner une couverture, image décorative
  qui arrive après la carte, comme « plus grand élément affiché ». Pour la personne qui se connecte, la carte est à
  l'écran 59 ms après la navigation en local ; l'image est un décor qui apparaît en fondu.

## 6. UI

Plateforme web, WCAG 2.2 AA en premier, puis MD3 (guide UI). Jetons de `tokens.css` uniquement.

- Carte d'accès : largeur 420 px au plus, bordure et ombre de la charte, rayon `--radius-lg`, centrée sur le
  fond à points ; à 375 px elle prend la largeur moins 2 × 16 px.
- Champs : étiquette visible au-dessus (jamais seulement un texte de substitution), 44 px de haut,
  six états (repos, survol, actif, désactivé, validation, erreur) ; erreur sous le champ avec `aria-invalid`,
  `aria-describedby` et `role="alert"`.
- Mot de passe : bouton « Afficher / Masquer » dans le champ (`aria-pressed`, 44 × 44 px), texte lisible par le
  gestionnaire de mots de passe, collage permis.
- `autocomplete` : `name` (prénom), `username` (e-mail, `type="email"`, `inputmode="email"`),
  `current-password` (connexion), `new-password` (création, invitation, réinitialisation, changement).
- Contrastes : textes d'erreur en `--danger` sur `--surface` (au moins 4,5:1 en clair et en sombre, comme les
  autres messages) ; icône d'alerte en plus de la couleur.
- Mouvement (module `web/src/motion/` seulement, `transform` et `opacity`) : arrivée de la carte (fondu et
  glissement de 10 px, 280 ms), message d'erreur qui entre (220 ms), « Copié » qui apparaît (220 ms) ;
  `prefers-reduced-motion` : état final immédiat.
- Responsive : à 375 px, pas de défilement horizontal, bouton principal à portée du pouce, cibles de 44 px.

## 7. Code

### Découpage

```
server/auth/
  password.ts     hachage scrypt, vérification en temps constant, politique de mot de passe (fonctions pures + crypto)
  tokens.ts       génération d'un jeton de 256 bits, empreinte SHA-256, lecture/écriture du cookie
  throttle.ts     blocage exponentiel par e-mail, limite par adresse, plafond de hachages simultanés
  service.ts      état, création du premier compte, connexion, session, changement de mot de passe, liens
  admin.ts        invitations, membres, liens de réinitialisation
  reset-cli.ts    commande « admin:reset-link »
server/http/
  auth-guard.ts   hook : lit le cookie, charge l'utilisateur, refuse (401) ce qui n'est pas public
  auth-routes.ts  routes /api/auth/*
  admin-routes.ts routes /api/admin/*
web/src/auth/
  AuthProvider.tsx, AuthGate.tsx, screens (Setup, Login, Join, Reset), AccountDialog.tsx, AdminDialog.tsx
```

### Règles appliquées (guide de code propre)

- **SRP et faible couplage** : le hachage ne connaît ni HTTP ni la base ; le service reçoit ses dépendances
  (base, hacheur, horloge, limiteur) : les tests injectent un hacheur rapide et une horloge simulée.
- **Échouer vite** : le corps de chaque requête est validé par zod à la frontière ; le reste du code fait
  confiance à des types validés. Aucun `any`.
- **Erreurs** : classes dédiées (`AuthenticationError` 401, `ForbiddenError` 403, `TooManyAttemptsError` 429
  avec la durée d'attente) ; les messages sont écrits pour l'utilisateur ; aucune erreur n'est avalée.
- **Le propriétaire passe toujours en premier paramètre** des services de données : `library.list(userId)`.
  L'identifiant vient de la session, jamais du corps ni de l'URL.
- **Pas de magie** : durées, tailles et seuils sont des constantes nommées en tête de fichier.
- **CQS** : la mise à jour de `last_seen_at` est une fonction nommée et distincte (`touchSessionIfStale`), appelée par `authenticate` au plus une fois par heure ; hors de cela, lire une session n'écrit rien.
- **Journaux** : les en-têtes `cookie` et `authorization` sont masqués ; aucun corps d'authentification n'est écrit.

### Dépendance ajoutée

`@fastify/cookie` (plugin officiel de Fastify) pour lire et écrire le cookie : un petit paquet maintenu,
conforme à CON-05, plus sûr qu'une analyse d'en-tête faite à la main.

## 8. Tests et vérifications

| Niveau | Contenu |
|---|---|
| Unitaires | Hachage (paramètres encodés, bon et mauvais mot de passe, sels différents), politique de mot de passe (longueur, NFC, interdits, contexte), jetons (taille, empreinte), blocage exponentiel (horloge simulée), limite par adresse, cookie dans les deux modes |
| Base | Migration 002 sur une base vide et sur une base qui contient déjà une bibliothèque (propriétaire provisoire repris par le premier compte) ; contraintes (propriétaire obligatoire, unicités, administrateur unique, token de 32 octets) |
| Intégration (HTTP, PGlite) | Parcours complet (état → création → connexion → session → déconnexion) ; création refusée après le premier compte ; invitation (valide, utilisée, expirée, révoquée) ; connexion générique (inconnu, mauvais mot de passe, désactivé) ; blocage après 5 échecs ; changement de mot de passe ferme les autres sessions ; réinitialisation ; rôle administrateur ; **toutes les routes enregistrées refusent une requête sans session** (liste fermée de routes publiques) ; **isolation à deux comptes** sur chaque route de bibliothèque, classement, statistiques, tirage, export, import |
| Navigateur (Chrome sans interface) | Création, connexion, déconnexion, invitation de bout en bout ; erreurs sous les champs ; focus ; 375 px ; mode sombre ; mouvement réduit |
| Revue de sécurité | Relecture indépendante du code d'authentification contre la liste de menaces (section 3) |

Les tests sur un vrai PostgreSQL (`TEST_DATABASE_URL`) restent possibles : les nouvelles contraintes n'emploient
que des fonctions de PostgreSQL 15.

## 9. Hors périmètre, et préparation de la suite

- **Comparer ce que les amis regardent (B10)** : pas dans cette version. La conception ne l'empêche pas :
  les instantanés d'anime sont déjà partagés (FR-96), chaque bibliothèque est privée par défaut (FR-97), et
  une future table de partage devra enregistrer **l'accord explicite de chaque personne**, par ami, avant que
  quoi que ce soit ne soit visible.
- Double authentification, connexion par un service tiers, envoi d'e-mails, suppression d'un compte avec ses
  données (on désactive d'abord, on exporte au besoin), plusieurs administrateurs.
- Limiteur d'essais **en mémoire** : il repart à zéro au redémarrage et ne se partage pas entre plusieurs
  processus. Suffisant pour un seul serveur ; à déplacer en base si l'application tourne un jour sur plusieurs.

## 10. Ce qui a été vérifié (et ce qui ne l'a pas été)

| Vérification | Résultat |
|---|---|
| Tests automatisés (PGlite) | 262 tests au moment de l'écriture : parcours de comptes, isolation à deux comptes sur toutes les routes de données, refus par défaut de toutes les routes enregistrées, contraintes de base, migration d'une base qui contenait déjà une bibliothèque, correctifs de la relecture |
| Tests de mutation faits à la main | Retirer le filtre par propriétaire fait échouer 6 tests ; revenir au test du préfixe de l'URL brute fait échouer le test du chemin encodé ; glisser une route de données dans la liste publique fait échouer le test qui épingle la liste ; défaire chacun des correctifs de la relecture (import, essais simultanés, déconnexion, liens, ordre des vérifications, code de création) fait échouer son test |
| Navigateur (Chrome sans interface) | 50 contrôles sur le parcours complet (création avec reprise du Dex, erreurs sous les champs, session, compte, mot de passe, invitation utilisée par un « ami », déconnexion, blocage, expiration avec retour à la page ouverte, 375/360/320 px, sombre, mouvement réduit) puis 15 sur les correctifs (code de création, lien collé dans un onglet ouvert, déconnexion qui échoue, deux membres de même prénom), plus le chemin de développement par le proxy de Vite |
| **Relecture indépendante** | Un second relecteur, sans connaître mes hypothèses, a attaqué le code. Il a confirmé comme corrects : le garde de routes, les sessions, les cookies, les liens à usage unique, l'énumération et le chronométrage, le NFC, le filtrage par propriétaire de chaque requête, les DTO, l'absence de point d'injection de script. Il a trouvé 6 défauts réels, tous corrigés avec un test (voir ci-dessous) |

Défauts relevés par la relecture, et leur réponse :

| Défaut | Réponse |
|---|---|
| Un membre pouvait réécrire, par une restauration, le titre, la durée et les épisodes d'un anime suivi par tous (les identifiants Kitsu sont publics) | Une restauration ne modifie plus jamais un anime existant (FR-99) |
| 40 essais de mot de passe **simultanés** passaient tous : le compteur n'était mis à jour qu'après le hachage | Chaque essai est compté avant toute attente, le succès efface (NFR-41) ; aussi pour le changement de mot de passe |
| La limite par adresse devenait un seau unique derrière un proxy, et pouvait empêcher la déconnexion, que l'interface annonçait pourtant réussie | `TRUST_PROXY`, adresses IPv6 comptées par bloc /64, table bornée, la déconnexion n'est jamais limitée, et l'interface reste connectée (avec un message) si la déconnexion échoue (NFR-48, NFR-54, FR-84) |
| Un lien de réinitialisation émis restait valable après l'émission d'un autre ou après un changement de mot de passe ; l'administrateur peut, avec un tel lien, entrer dans le compte d'un membre | Un seul lien vivant par compte (FR-101). La prise de contrôle n'est **pas** empêchée (rien ne le permet sans canal extérieur) : elle est visible pour le membre, et la phrase « personne ne lit ta bibliothèque » est devenue « l'application ne le montre à personne », avec la limite écrite dans le README et en section 2 |
| Une restauration verrouillait toute la table des entrées : un membre pouvait figer tous les autres | Verrou par compte (NFR-53), 5 000 anime et 5 000 épisodes au plus (FR-100) |
| La commande de réinitialisation et le serveur pouvaient ouvrir ensemble le même dossier de la base embarquée, et des écritures se perdaient | Fichier de verrou à côté du dossier ; le second processus refuse (NFR-52) |

Améliorations de durcissement faites au passage : la création du premier compte vérifie « un compte existe déjà » **avant** de hacher ; `SETUP_CODE` contre le premier visiteur d'un serveur neuf et avertissement au démarrage ; les paramètres d'une empreinte stockée sont bornés (256 MiB) ; l'empreinte factice est chauffée au démarrage ; un lien collé dans un onglet déjà ouvert est lu puis effacé de l'adresse ; la carte d'un lien émis est associée à l'identifiant du membre (deux membres de même prénom ne la partagent plus).

| Non vérifié | Pourquoi |
|---|---|
| Exécution sur un vrai serveur PostgreSQL | Pas de Docker disponible ; les contraintes n'emploient que des fonctions de PostgreSQL 15 |
| Verrou de restauration et création simultanée du premier compte sur un vrai serveur | PGlite n'a qu'une connexion : il sérialise tout. Les verrous sont vérifiés par lecture, pas par concurrence réelle |
| HTTPS réel avec `COOKIE_SECURE=true` et `TRUST_PROXY=true` derrière un vrai proxy | Les deux modes sont testés par requêtes simulées, pas derrière un vrai proxy |
| Aspect animé et captures de la dernière série de contrôles | Le Chrome sans interface de la machine a cessé de produire des images en fin de session (même une page vide : `requestAnimationFrame` ne se déclenche plus). Ces contrôles ont été faits en mouvement réduit, qui est un mode que l'application doit gérer ; les captures et animations de la série précédente (50 contrôles) restent valables pour le reste |
| Vrai téléphone, lecteur d'écran | Non essayés |

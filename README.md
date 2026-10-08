# Otakudex

Ton Dex d'anime : suis ce que tu regardes, classe tes favoris par duels, et regarde tes statistiques
prendre vie. Application web entre amis : un compte et un Dex par personne, sur invitation de l'administrateur, tes données chez toi.

- **Dex** : une zone « Continuer » avec l'épisode suivant en un clic (l'écran réagit tout de suite), puis la collection, filtres repliés.
- **Arène** : « Prochain duel » mis en avant, classement par duels (« lequel est le meilleur ? »), note sur 100 et tiers S à D.
- **Stats** : un tableau de bord en deux vues. « Aperçu » : 7 derniers jours comparés aux 7 précédents, reste à voir et délai estimé, série, temps regardé, épisodes par semaine. « Détails » : carte de chaleur, notes, genres.
- **Ce soir** : tirage au sort pondéré dans ta liste « À voir ».
- **Comptes** : au premier lancement tu crées le compte administrateur (e-mail et mot de passe, aucun service tiers). Ensuite, chaque ami rejoint par un lien d'invitation à usage unique que tu lui envoies, et a son propre Dex : personne, administrateur compris, ne lit la bibliothèque des autres.
- **Fiche d'un anime** : statut en cinq pastilles, progression et temps restant, « Vu : épisode N » toujours à portée du pouce ; dates (jj/mm/aaaa), revisionnages et note dans « Détails », replié. Tout s'enregistre seul, sans attendre le serveur.
- **Mes données** : export JSON et CSV, restauration depuis un export.
- **Français et anglais** : un bouton de langue (en haut à droite, partout) change tous les textes d'un clic,
  sans recharger. Les genres de Kitsu sont traduits d'office ; les synopsis le sont par un service de traduction
  (voir plus bas) et gardés en base.
- **Haut de page** : un bouton rond apparaît après un long défilement et remonte en douceur.
- **Écrans d'accès** (création du compte, connexion, invitation, mot de passe oublié) : un mur d'affiches des anime
  du moment (tendances de Kitsu) défile doucement derrière la carte. Il ne montre jamais ta bibliothèque, ne
  charge qu'environ 180 Ko d'images (14 affiches). Il reste en mouvement (pas de bouton de pause : choix du
  propriétaire, voir `docs/06`) sauf si ton système demande moins d'animation ; en mode économie de données ou si
  Kitsu ne répond pas, des tuiles à motif O-T-A-K-U-D-E-X prennent la place. Pas de vidéo : une vidéo de fond
  coûterait des mégaoctets et on ne peut pas redistribuer d'extraits d'anime.

Les animations (anime.js) accompagnent chaque changement d'état et s'éteignent d'elles-mêmes si ton système demande de réduire les animations.

Les métadonnées viennent uniquement de l'API publique de [Kitsu](https://kitsu.app). Rien d'autre :
pas de scraping, pas de relais non officiel. Ton navigateur ne contacte aucun domaine tiers : polices et
couvertures sont servies par l'application elle-même. Côté serveur, les tendances des écrans d'accès sont lues
au démarrage puis au plus toutes les 6 heures (10 minutes après un échec).

**Rapidité** : le premier fichier JavaScript pèse 17 Ko compressé (l'application complète, les statistiques et
anime.js ne se chargent qu'après la connexion, et sont préchargés pendant que tu tapes ton mot de passe). Les
fichiers à empreinte sont gardés un an par le navigateur, la page d'accueil jamais, et le texte est compressé
(brotli ou gzip).

## Démarrage rapide

Il faut Node 22.18 ou plus.

```bash
npm install
cp .env.example .env
npm run dev
```

Ouvre <http://localhost:5173>. Au premier lancement, l'application te demande de créer ton compte
(prénom, e-mail, mot de passe de 15 caractères ou plus : une phrase suffit). Sans configuration, les données
vont dans une base PostgreSQL embarquée (`.data/`), pratique pour essayer. Pour un usage durable, branche
une vraie base (ci-dessous).

**Tu avais déjà utilisé l'application avant les comptes ?** Ton Dex est conservé : il est rattaché au premier
compte que tu crées. La mise à jour de la base ne se défait pas : copie d'abord le dossier `.data/` (ou
fais `npm run backup` avec une vraie base).

Version « production » (un seul processus, sur le port 3000) :

```bash
npm run build
npm start
```

Pour voir l'application remplie avant d'y mettre tes propres anime : une fois connecté, menu « Mes données », puis
« Restaurer depuis un export JSON », et choisis `examples/demo-export.json` (14 anime avec historique et
classement d'exemple). La restauration ne marche que sur un Dex vide : elle n'écrase jamais tes données.

## Base de données

La base est **PostgreSQL**. Elle se règle avec `DATABASE_URL` dans `.env` (fichier ignoré par git) :

| Cas | Valeur |
|---|---|
| Neon (production) | `postgres://UTILISATEUR:MOT_DE_PASSE@ep-xxxx.REGION.aws.neon.tech/otakudex?sslmode=require` |
| Postgres du homelab (tests locaux) | `postgres://otakudex_app:MOT_DE_PASSE@HOTE:5432/otakudex?sslmode=require` |
| Essai rapide, sans serveur | `pglite://./.data/dev` (valeur par défaut) |

Sans `sslmode=require`, la liaison n'est pas chiffrée : à retirer seulement si ton Postgres n'a pas de TLS et
que le réseau est de confiance. Avec une vraie base, applique d'abord le schéma, puis lance l'application :

```bash
npm run migrate
npm start
```

Les migrations tournent avec un rôle qui a le droit de créer des tables (`MIGRATION_DATABASE_URL`, ou
`DATABASE_URL` à défaut). L'application, elle, peut tourner avec un rôle limité à lire et écrire les
données : voir [docs/03-donnees.md](docs/03-donnees.md), section « Rôles et droits ».

## Langues et traduction des synopsis

L'interface existe en français et en anglais : le premier lancement suit la langue du navigateur, le bouton de langue
garde ton choix sur l'appareil. Kitsu ne fournit ses synopsis qu'en anglais ; pour les lire en français il faut un
**service de traduction**, à régler dans `.env` (voir `.env.example`) :

| Réglage | Quand | Remarque |
|---|---|---|
| `DEEPL_API_KEY` | Tu as un compte [DeepL API Free](https://www.deepl.com/pro-api) (500 000 caractères par mois, soit environ 700 synopsis) | Une clé qui finit par `:fx` va à l'adresse gratuite |
| `LIBRETRANSLATE_URL` (et `LIBRETRANSLATE_API_KEY` si besoin) | Tu fais tourner [LibreTranslate](https://docs.libretranslate.com/) chez toi, sur le homelab | Rien ne sort de chez toi |

Chaque synopsis n'est traduit **qu'une fois** : la traduction est gardée en base et partagée entre les comptes. Sans
service réglé, le synopsis reste en anglais (marqué « En anglais ») ; si ton navigateur sait traduire sur l'appareil
(Chrome sur ordinateur), un lien « Traduire en français » le propose. Le serveur n'envoie au service que le texte
public du synopsis, jamais une donnée de compte. Les titres d'anime ne sont jamais traduits.

## Comptes et amis

- **Inviter quelqu'un** : ton nom en haut à droite, « Mon compte », « Administration », « Inviter quelqu'un ».
  Écris son prénom, crée l'invitation, copie le lien et envoie-le-lui toi-même. Le lien sert une seule fois
  et vaut 7 jours ; on ne le revoit plus après l'avoir copié. Tu peux le révoquer tant qu'il n'a pas servi.
- **Mot de passe oublié (un ami)** : « Administration », « Membres », « Lien de réinitialisation » (valable 24 h).
- **Mot de passe oublié (toi)** : sur la machine du serveur, `npm run admin:reset-link -- ton@email`
  affiche un lien de réinitialisation. Avec la base embarquée de développement, arrête d'abord le serveur : un
  fichier de verrou (`.data/dev.lock`) empêche deux processus d'ouvrir le même dossier, et la commande refuse
  avec un message tant que le serveur tourne.
- **Désactiver un ami** : « Administration », « Membres », « Désactiver » : il ne peut plus se connecter,
  sa bibliothèque est conservée.
- **Ce que l'administrateur voit** : les comptes, jamais les bibliothèques. **Limite à connaître** : tu peux créer
  un lien de réinitialisation pour un ami, donc entrer dans son compte ; il le voit tout de suite (son mot de
  passe cesse de marcher et ses sessions sont fermées), mais rien ne l'empêche. C'est la confiance qui fait foi,
  comme pour celui qui tient le serveur et sa base.
- Une session dure au plus 30 jours (7 jours sans activité). Changer son mot de passe déconnecte les autres appareils.

## Utiliser l'application depuis le téléphone ou hors de ta machine

Par défaut, le serveur n'écoute que sur ta machine. Pour l'ouvrir depuis un téléphone du même réseau :

```bash
LISTEN_HOST=0.0.0.0 ALLOWED_HOSTS=localhost,192.168.1.20 npm start
```

(remplace `192.168.1.20` par l'adresse de ta machine). Il faut maintenant un compte pour entrer, mais **sans
HTTPS le mot de passe et la session circulent en clair** : sur un réseau de confiance seulement. Dès que
l'application sort de ta maison (amis, Internet) :

1. mets-la derrière un proxy HTTPS (Caddy, nginx, Cloudflare Tunnel…) et ajoute son nom à `ALLOWED_HOSTS` ;
2. règle `COOKIE_SECURE=true` : le cookie de session devient `Secure` ;
3. règle `TRUST_PROXY=true` **seulement si** ce proxy réécrit l'en-tête `X-Forwarded-For` : la limite d'essais
   compte alors chaque client, et non le proxy tout entier (sans proxy, ne le règle jamais : n'importe qui
   pourrait usurper une adresse) ;
4. **avant de créer ton compte sur un serveur neuf**, règle `SETUP_CODE` (8 caractères ou plus) : sans lui, le
   premier visiteur qui ouvre l'adresse devient administrateur. L'écran de création demande alors ce code.

L'application affiche un avertissement au démarrage si elle écoute hors de ta machine sans `COOKIE_SECURE`, ou
sans compte et sans `SETUP_CODE`.

## Raccourcis clavier

| Touche | Action |
|---|---|
| `/` | Ouvrir l'ajout d'un anime |
| `←` `→` | Choisir dans un duel |
| `↓` | « Trop dur à départager » dans un duel |
| `Échap` | Fermer la fenêtre ouverte |

## Sauvegardes

Deux filets de sécurité complémentaires :

1. **Export JSON** depuis le menu « Mes données » : lisible, indépendant du moteur de base.
2. **`npm run backup`** : `pg_dump` compressé dans `backups/`, suivi d'une vérification de restauration.

```bash
# sauvegarde + restauration de contrôle dans une base temporaire
DATABASE_URL=... VERIFY_ADMIN_URL=postgres://.../postgres npm run backup
```

Sans `VERIFY_ADMIN_URL`, le script vérifie seulement que l'archive est lisible. Une sauvegarde jamais
restaurée n'est pas une sauvegarde : renseigne-le dès que ton serveur le permet. Neon conserve aussi un
historique qui permet de revenir à un instant donné.

Exemple de tâche planifiée (chaque nuit à 3 h) :

```cron
0 3 * * * cd /chemin/vers/otakudex && DATABASE_URL=postgres://UTILISATEUR@HOTE/otakudex VERIFY_ADMIN_URL=postgres://UTILISATEUR@HOTE/postgres ./scripts/backup.sh >> backups/backup.log 2>&1
```

Ne mets pas le mot de passe dans la ligne de cron (elle est lisible par les autres comptes de la machine) :
range-le dans `~/.pgpass` (`HOTE:5432:*:UTILISATEUR:MOT_DE_PASSE`, droits `600`), que `pg_dump` lit tout seul.

## Développement

```bash
npm test            # tests sur Postgres embarqué, sans rien installer
npm run check       # types, build, tests (dont le budget de poids de l'interface), audit des dépendances
```

Pour lancer les tests sur un vrai serveur PostgreSQL (une base jetable est créée puis supprimée pour
chaque test), donne l'adresse d'un serveur autorisé à créer des bases :

```bash
TEST_DATABASE_URL=postgres://UTILISATEUR:MOT_DE_PASSE@HOTE:5432/postgres npm test
```

### Organisation

```
server/    API Fastify : db/, auth/, kitsu/, backdrop/, translate/, library/, ranking/, stats/, picker/, export/, http/
web/src/   interface Preact : auth/ (écrans d'accès et fond), i18n/ (langues, catalogues), pages/, components/, styles/
shared/    types et logique pure partagés (classement, notes, libellés)
tests/     tests Vitest
docs/      exigences, UX/UI, données, conventions, étude de la concurrence
scripts/   dev.mjs (lancement), backup.sh (sauvegarde vérifiée)
```

### Documents

- [docs/01-exigences.md](docs/01-exigences.md) : besoins, exigences vérifiables, contraintes
- [docs/02-ux-ui.md](docs/02-ux-ui.md) : parcours, modèles UX, identité visuelle, accessibilité
- [docs/03-donnees.md](docs/03-donnees.md) : schéma PostgreSQL, invariants, sauvegarde
- [docs/04-conventions-code.md](docs/04-conventions-code.md) : règles de code
- [docs/05-refonte-ux-animations.md](docs/05-refonte-ux-animations.md) : navigation fluide, animations, tableaux de bord, fiche d'un anime
- [docs/06-comptes-et-connexion.md](docs/06-comptes-et-connexion.md) : comptes, invitations, sessions, modèle de menaces, fond des écrans d'accès
- [docs/07-langues-et-textes.md](docs/07-langues-et-textes.md) : français et anglais, traduction, guide de voix et de ton des textes
- [docs/08-collaboration-entre-amis.md](docs/08-collaboration-entre-amis.md) : recherche et propositions pour collaborer entre amis (rien n'est construit)
- [docs/etude-concurrents.md](docs/etude-concurrents.md) : étude comparative des trackers d'anime

Avant d'ajouter une fonctionnalité, retrouve son exigence dans `docs/01-exigences.md` (voir aussi
`CLAUDE.md`).

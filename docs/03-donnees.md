# Otakudex — Données (PostgreSQL)

Le guide DBA fourni cible MySQL. La base retenue est **PostgreSQL** (Neon en production, Postgres du
homelab pour les tests locaux). Les principes du guide sont gardés ; seules les commandes changent.

| Principe du guide DBA | Application ici |
|---|---|
| Colonnes explicites, jamais `SELECT *` | Toutes les requêtes nomment leurs colonnes |
| EXPLAIN avant d'optimiser, un index par besoin prouvé | `EXPLAIN (ANALYZE, BUFFERS)` sur les requêtes de stats ; pas d'index « au cas où » |
| Jointures explicites `JOIN … ON` | Aucune jointure implicite |
| Moindre privilège | Deux rôles : propriétaire (migrations) et application (lecture/écriture des données) |
| Pas de mot de passe dans les scripts | `DATABASE_URL` en variable d'environnement |
| Sauvegarde toujours suivie d'une vérification de restauration | `scripts/backup.sh` puis restauration dans une base temporaire |
| Opérations destructrices signalées et vérifiées | Aucun `DROP` ni `TRUNCATE` hors scripts de test explicitement nommés |
| Contexte d'abord (version, environnement, taille, RPO/RTO) | Voir section 1 |

## 1. Contexte d'exploitation

| Élément | Valeur |
|---|---|
| Moteur | PostgreSQL 15 ou plus (Neon propose 14 à 17 ; on n'emploie rien de plus récent que 15) |
| Environnements | Production : Neon. Tests locaux : Postgres du homelab. Tests automatisés : PGlite (Postgres en mémoire, sans réseau) |
| Taille attendue | Petite : quelques centaines d'entrées, quelques dizaines de milliers de lignes d'historique au plus |
| Disponibilité | Usage perso, pas de haute disponibilité |
| Objectif de reprise | Perte de données acceptable : 24 h (RPO). Remise en service : moins d'une heure (RTO) |
| Sauvegarde | `pg_dump` quotidien vérifié ; l'historique de Neon (restauration à un instant donné) en filet de sécurité |

Neon : utiliser la chaîne de connexion avec `sslmode=require`. Pour les migrations, utiliser la
connexion directe (non poolée).

## 2. Modèle de données

```
media 1 ──── 0..1 library_entry 1 ──── 0..n watch_log
```

- `media` : instantané des métadonnées Kitsu, une ligne par anime connu.
- `library_entry` : ce que l'utilisateur fait de cet anime (statut, progression, rang). Au plus une
  par anime **et par personne** (voir la section « Comptes » plus bas).
- `watch_log` : événements immuables, un par épisode marqué.

### Schéma (migration `001_init.sql`)

```sql
CREATE TABLE media (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kitsu_id            integer      UNIQUE,  -- NULL pour un anime ajouté à la main
  title               text         NOT NULL,
  title_en            text,
  title_ja            text,
  synopsis            text,
  subtype             text         NOT NULL DEFAULT 'unknown',
  airing_status       text         NOT NULL DEFAULT 'unknown',
  episode_count       integer      CHECK (episode_count IS NULL OR episode_count > 0),
  episode_length_min  integer      CHECK (episode_length_min IS NULL OR episode_length_min > 0),
  start_date          date,
  end_date            date,
  genres              text[]       NOT NULL DEFAULT '{}',
  poster_url          text,
  community_score     numeric(5,2) CHECK (community_score IS NULL OR community_score BETWEEN 0 AND 100),
  raw                 jsonb,
  fetched_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE library_entry (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  media_id        bigint       NOT NULL UNIQUE REFERENCES media(id) ON DELETE RESTRICT,
  status          text         NOT NULL CHECK (status IN ('planned','watching','completed','paused','dropped')),
  progress        integer      NOT NULL DEFAULT 0 CHECK (progress >= 0),
  rewatch_count   integer      NOT NULL DEFAULT 0 CHECK (rewatch_count >= 0),
  bucket          text         CHECK (bucket IN ('loved','liked','meh')),
  rank_position   integer      CHECK (rank_position > 0),
  started_on      date,
  completed_on    date,
  note            text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT rank_requires_bucket CHECK ((bucket IS NULL) = (rank_position IS NULL)),
  CONSTRAINT rank_position_unique UNIQUE (rank_position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE watch_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id        bigint       NOT NULL REFERENCES library_entry(id) ON DELETE CASCADE,
  episode_number  integer      NOT NULL CHECK (episode_number > 0),
  watched_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX library_entry_status_idx ON library_entry (status);
CREATE INDEX watch_log_watched_at_idx ON watch_log (watched_at);
CREATE INDEX watch_log_entry_idx      ON watch_log (entry_id);
```

### Choix et justifications

| Choix | Raison |
|---|---|
| `GENERATED ALWAYS AS IDENTITY` | Standard SQL, remplace `serial` |
| `text` + `CHECK` plutôt qu'un type `ENUM` | Ajouter une valeur est une migration simple, sans verrou de type |
| `rank_position` dense (1, 2, 3…) avec contrainte unique **différée** | Le rang est exact et consécutif ; les décalages se font en une transaction sans violation intermédiaire |
| `bucket` et `rank_position` nuls ensemble | Un anime est classé complètement ou pas du tout (contrainte `rank_requires_bucket`) |
| `progress` stocké **et** `watch_log` | `progress` est la vérité courante (passe en cours) ; le journal est l'historique pour les stats |
| `raw jsonb` | Garde tout ce que Kitsu renvoie : on pourra ajouter des champs (studios) sans réinterroger une API qui se dégrade |
| `ON DELETE RESTRICT` sur `media` | Un instantané n'est jamais supprimé par effet de bord |
| Pas d'index GIN sur `genres` | Le volume est faible ; un index doit être justifié par `EXPLAIN` d'abord |
| `timestamptz` | Les heures sont stockées en UTC et affichées dans le fuseau local |

### Invariants à maintenir par le code (testés)

1. Dans un même compartiment, tous les rangs du compartiment « adoré » précèdent ceux de « bien », qui précèdent ceux de « bof ».
2. Les rangs de chaque utilisateur sont consécutifs de 1 à N sans trou.
3. `progress` ≤ `episode_count` quand le nombre d'épisodes est connu.
4. Un anime « à voir » n'a pas de rang.
5. Toute opération qui modifie plusieurs lignes (classer, reclasser, marquer un épisode, retirer) se fait dans **une transaction**.

### Calcul de la note (dérivée, jamais stockée)

La note est calculée à la lecture, dans le code (`withScores`, fonction pure couverte par des tests) :
pour un compartiment de `n` anime, l'anime d'indice `i` (0 = meilleur) reçoit
`haut − arrondi((haut − bas) × i / max(n − 1, 1))`. Bornes : adoré 70–100, bien 40–69, bof 0–39.
Stocker la note créerait une redondance à resynchroniser après chaque duel. Le choix d'une fonction
pure plutôt que d'une fonction de fenêtre SQL permet de la tester sans base et de la partager avec le client.

## 2 bis. Comptes (migration `002_accounts.sql`)

Conception complète : [06-comptes-et-connexion.md](06-comptes-et-connexion.md). Ici, le modèle et ses
justifications.

```
app_user 1 ──── 0..n app_session
   │ 1
   ├──────────── 0..n account_link          (invitations et liens de réinitialisation)
   │ 1
   └──────────── 0..n library_entry n ──── 1 media   (instantané partagé entre comptes)
                         │ 1
                         └──────────────── 0..n watch_log
```

```sql
CREATE TABLE app_user (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email          text         UNIQUE,            -- NULL tant que le compte est un propriétaire provisoire
  display_name   text         NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  password_hash  text,
  role           text         NOT NULL CHECK (role IN ('admin', 'member')),
  is_disabled    boolean      NOT NULL DEFAULT false,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  last_login_at  timestamptz,
  CONSTRAINT email_is_normalised CHECK (email IS NULL OR email = lower(btrim(email))),
  CONSTRAINT claimed_has_credentials CHECK ((email IS NULL) = (password_hash IS NULL))
);
-- Un seul administrateur : le premier compte.
CREATE UNIQUE INDEX app_user_single_admin ON app_user ((true)) WHERE role = 'admin';

CREATE TABLE app_session (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash    bytea       NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX app_session_user_idx ON app_session (user_id);

CREATE TABLE account_link (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        text        NOT NULL CHECK (kind IN ('invitation', 'reset')),
  token_hash  bytea       NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  label       text        CHECK (label IS NULL OR char_length(label) <= 60),
  user_id     bigint      REFERENCES app_user(id) ON DELETE CASCADE,   -- réinitialisation : le compte visé
  created_by  bigint      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  revoked_at  timestamptz,
  CONSTRAINT reset_targets_a_user CHECK ((kind = 'reset') = (user_id IS NOT NULL))
);
CREATE INDEX account_link_created_by_idx ON account_link (created_by);

-- Chaque entrée de bibliothèque appartient à un compte.
ALTER TABLE library_entry ADD COLUMN user_id bigint REFERENCES app_user(id) ON DELETE RESTRICT;
-- Une bibliothèque d'avant les comptes revient à un propriétaire provisoire, que le premier compte reprend.
INSERT INTO app_user (display_name, role) SELECT 'Propriétaire', 'admin' WHERE EXISTS (SELECT 1 FROM library_entry);
UPDATE library_entry SET user_id = (SELECT id FROM app_user WHERE email IS NULL) WHERE user_id IS NULL;
ALTER TABLE library_entry ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE library_entry DROP CONSTRAINT library_entry_media_id_key;
ALTER TABLE library_entry DROP CONSTRAINT rank_position_unique;
ALTER TABLE library_entry ADD CONSTRAINT library_entry_owner_media_key UNIQUE (user_id, media_id);
ALTER TABLE library_entry ADD CONSTRAINT rank_position_unique UNIQUE (user_id, rank_position) DEFERRABLE INITIALLY DEFERRED;
DROP INDEX library_entry_status_idx;
CREATE INDEX library_entry_status_idx ON library_entry (user_id, status);
```

### Choix et justifications (comptes)

| Choix | Raison |
|---|---|
| `app_user` plutôt que `user` | `user` est un mot réservé de PostgreSQL |
| `email` normalisé par une contrainte (`lower(btrim(...))`) et `UNIQUE` | Deux comptes ne peuvent pas différer par la casse ; la base garantit ce que le code promet |
| `password_hash` en texte auto-descriptif (`scrypt$N$r$p$sel$empreinte`) | Les paramètres voyagent avec l'empreinte : on peut les durcir plus tard et re-hacher à la connexion suivante |
| Jetons stockés sous forme de `bytea` de 32 octets (SHA-256) | Le jeton aléatoire de 256 bits n'est jamais en base ; un vol de la base ne donne aucune session. Un hash rapide suffit : un jeton aléatoire n'a pas de dictionnaire à attaquer |
| Une seule table `account_link` pour invitations et réinitialisations | Même cycle de vie (créé, utilisé une fois, expire) ; la contrainte `reset_targets_a_user` les distingue |
| Index unique partiel `app_user_single_admin` | La base elle-même refuse un second administrateur |
| Propriétaire provisoire (e-mail et mot de passe nuls) | Garde `library_entry.user_id NOT NULL` même pour une base d'avant les comptes ; le premier compte le reprend au lieu d'en créer un autre |
| `ON DELETE RESTRICT` sur `library_entry.user_id`, `CASCADE` sur sessions et liens | Supprimer un compte ne doit jamais effacer une bibliothèque par effet de bord ; les sessions et liens n'ont pas de valeur sans leur compte |
| `media` reste sans propriétaire | Un instantané d'anime est partagé : une copie par identifiant Kitsu, pour tous les comptes (FR-96) |
| Unicité `(user_id, media_id)` et `(user_id, rank_position)` | Les rangs sont consécutifs **par personne** ; la contrainte différée garde les décalages en une transaction |
| Index `(user_id, status)` | Toute lecture commence par le propriétaire |

### Invariants supplémentaires (testés)

6. Toute entrée a un propriétaire ; un propriétaire a au plus une entrée par anime.
7. Il y a au plus un administrateur ; un compte sans mot de passe (propriétaire provisoire) ne peut pas se connecter.
8. Une session, une invitation ou un lien de réinitialisation se retrouve par l'empreinte de son jeton, jamais par le jeton.
9. Un lien est utilisable si et seulement si `used_at` et `revoked_at` sont nuls et `expires_at` est dans le futur ; l'usage est **une seule** requête `UPDATE ... RETURNING` conditionnelle, donc atomique (deux usages simultanés : un seul réussit).
10. Chaque requête sur `library_entry` ou `watch_log` porte la condition du propriétaire (`user_id = $n`, directement ou par l'entrée liée).

### Entretien

Les sessions expirées (échéance absolue ou plus de 7 jours sans activité) et les liens expirés depuis plus de
30 jours sont supprimés à chaque démarrage et à chaque connexion. `last_seen_at` n'est mis à jour qu'une fois
par heure, pour ne pas écrire à chaque requête.

## 2 ter. Traductions (migration `003_translations.sql`)

```sql
CREATE TABLE media_translation (
  media_id     bigint      NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  lang         text        NOT NULL CHECK (lang IN ('fr', 'en')),
  source_hash  bytea       NOT NULL CHECK (octet_length(source_hash) = 32),
  synopsis     text        NOT NULL CHECK (char_length(synopsis) BETWEEN 1 AND 8000),
  provider     text        NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 40),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, lang)
);
```

| Choix | Raison |
|---|---|
| Rattachée à `media`, pas à un compte | Le synopsis d'origine est public et partagé : une traduction par anime et par langue, payée une fois pour tous (FR-108) |
| `source_hash` (SHA-256 du texte traduit) | Un synopsis modifié chez Kitsu n'est plus égal à ce qui a été traduit : on retraduit, on ne sert jamais une traduction périmée |
| `ON DELETE CASCADE` | Une traduction n'a aucun sens sans son anime ; elle ne contient aucune donnée de compte |
| Clé primaire `(media_id, lang)` | La lecture est toujours « cet anime, cette langue » : la clé sert d'index |
| `provider` | Savoir quel service a produit le texte (changer de service un jour, ou purger ce qui vient d'un service jugé mauvais) |
| Une panne n'est jamais enregistrée | Seul un texte réussi entre en base ; l'attente avant de réessayer vit en mémoire (NFR-60) |

Invariant supplémentaire (testé) : 11. Une traduction n'est servie que si `source_hash` égale l'empreinte du
synopsis actuel ; le texte envoyé au service ne dépasse jamais 4 000 caractères (NFR-59).

## 3. Requêtes types (colonnes explicites, paramétrées)

```sql
-- Temps et épisodes : la progression est la vérité (elle inclut les épisodes saisis a posteriori),
-- les revisionnages comptent un passage complet de plus.
SELECT coalesce(sum(e.progress + e.rewatch_count * coalesce(m.episode_count, 0)), 0)::int AS episodes,
       coalesce(sum((e.progress + e.rewatch_count * coalesce(m.episode_count, 0))
                    * m.episode_length_min), 0)::int AS minutes
  FROM library_entry e
  JOIN media m ON m.id = e.media_id;

-- Activité : épisodes horodatés par jour civil, dans le fuseau configuré ($1).
-- La carte de chaleur et les séries de semaines en sont déduites dans le code.
SELECT (watched_at AT TIME ZONE $1)::date AS day, count(*)::int AS episodes
  FROM watch_log
 GROUP BY 1
 ORDER BY 1;

-- Genres les plus regardés (hors « à voir »)
SELECT g AS genre, count(*)::int AS count
  FROM library_entry e
  JOIN media m ON m.id = e.media_id
 CROSS JOIN LATERAL unnest(m.genres) AS g
 WHERE e.status <> 'planned'
 GROUP BY g
 ORDER BY count DESC, genre
 LIMIT 10;
```

Les épisodes saisis a posteriori (progression sans historique horodaté) comptent dans les totaux mais
pas dans la carte de chaleur : celle-ci ne montre que l'activité réellement enregistrée.

Chaque requête de statistiques est examinée avec `EXPLAIN (ANALYZE, BUFFERS)` avant tout ajout d'index.
Signaux à surveiller : `Seq Scan` sur une table qui grossit, `Sort` sur disque, estimation de lignes
très éloignée du réel.

## 4. Migrations

Fichiers SQL numérotés dans `server/db/migrations/`, appliqués dans l'ordre par un petit exécuteur qui
note chaque version dans `schema_migrations` (version, date). Chaque migration s'exécute dans une
transaction. Une migration appliquée ne se modifie jamais : on en ajoute une nouvelle.

## 5. Rôles et droits

```sql
-- à exécuter une fois par le propriétaire de la base
CREATE ROLE otakudex_app LOGIN PASSWORD '<à définir hors dépôt>';
GRANT USAGE ON SCHEMA public TO otakudex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO otakudex_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO otakudex_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO otakudex_app;
```

Les tables des comptes sont couvertes par ces droits par défaut : aucun `GRANT` supplémentaire n'est nécessaire.
L'application tourne avec `otakudex_app` (pas de `CREATE`, pas de `DROP`). Les migrations tournent avec
le rôle propriétaire, via une variable distincte (`MIGRATION_DATABASE_URL`, repli sur `DATABASE_URL`).

## 6. Sauvegarde et restauration

Avant toute opération : vérifier la cible (`SELECT current_database();`) et l'espace disque.

Une sauvegarde contient maintenant les comptes : les empreintes des mots de passe (hachées avec scrypt, mais
à protéger quand même) et les empreintes des sessions. Le script crée donc les fichiers en mode `600`, dans un
dossier hors du dépôt ; ne les copie jamais sur un service partagé sans les chiffrer.

```bash
# Sauvegarde : format personnalisé, compressé. Le mot de passe vient de l'environnement.
pg_dump --format=custom --no-owner --file="backups/otakudex-$(date +%F_%H-%M-%S).dump" "$DATABASE_URL"

# Vérification : restauration dans une base temporaire, puis comptage
createdb otakudex_verify
pg_restore --no-owner --dbname=otakudex_verify backups/otakudex-<horodatage>.dump
psql otakudex_verify -c "SELECT count(*) FROM library_entry;"
dropdb otakudex_verify     # DESTRUCTIF : ne cible que la base temporaire
```

- Conserver 30 jours : `find backups -name '*.dump' -mtime +30 -print` d'abord (simulation), puis `-delete`.
- Journaliser la sortie du cron : `… > backups/backup.log 2>&1`.
- Le dossier `backups/` est ignoré par git.
- Un export JSON applicatif (FR-50) complète la sauvegarde : lisible, indépendant du moteur.

## 7. Anti-patrons refusés

| Anti-patron | Remplacement |
|---|---|
| `SELECT *` | Colonnes nommées |
| Concaténation de SQL | Requêtes paramétrées (`$1`, `$2`) |
| Mot de passe dans un script | Variable d'environnement |
| Sauvegarde jamais restaurée | Vérification dans une base temporaire |
| Index sur toutes les colonnes | Index justifié par un `EXPLAIN` |
| Modification multi-lignes sans transaction | Transaction explicite |

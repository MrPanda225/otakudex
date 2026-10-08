-- Otakudex initial schema. See docs/03-donnees.md for the reasoning behind each choice.

CREATE TABLE media (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kitsu_id            integer      UNIQUE,  -- NULL for entries added by hand
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
  -- Deferred so that shifting several ranks inside one transaction never trips the check midway.
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

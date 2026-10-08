-- Accounts: one library per person, access by e-mail and password.
-- See docs/06-comptes-et-connexion.md and docs/03-donnees.md ("Comptes").

CREATE TABLE app_user (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email          text         UNIQUE,            -- NULL while the account is an unclaimed placeholder
  display_name   text         NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  password_hash  text,
  role           text         NOT NULL CHECK (role IN ('admin', 'member')),
  is_disabled    boolean      NOT NULL DEFAULT false,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  last_login_at  timestamptz,
  CONSTRAINT email_is_normalised CHECK (email IS NULL OR email = lower(btrim(email))),
  CONSTRAINT claimed_has_credentials CHECK ((email IS NULL) = (password_hash IS NULL))
);
-- At most one administrator: the first account.
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
  user_id     bigint      REFERENCES app_user(id) ON DELETE CASCADE,   -- reset: the account concerned
  created_by  bigint      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  revoked_at  timestamptz,
  CONSTRAINT reset_targets_a_user CHECK ((kind = 'reset') = (user_id IS NOT NULL))
);
CREATE INDEX account_link_created_by_idx ON account_link (created_by);

-- Every library entry belongs to an account.
ALTER TABLE library_entry ADD COLUMN user_id bigint REFERENCES app_user(id) ON DELETE RESTRICT;
-- A library that exists before accounts goes to an unclaimed placeholder, which the first account takes over.
INSERT INTO app_user (display_name, role) SELECT 'Propriétaire', 'admin' WHERE EXISTS (SELECT 1 FROM library_entry);
UPDATE library_entry SET user_id = (SELECT id FROM app_user WHERE email IS NULL) WHERE user_id IS NULL;
ALTER TABLE library_entry ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE library_entry DROP CONSTRAINT library_entry_media_id_key;
ALTER TABLE library_entry DROP CONSTRAINT rank_position_unique;
ALTER TABLE library_entry ADD CONSTRAINT library_entry_owner_media_key UNIQUE (user_id, media_id);
-- Deferred so that shifting several ranks inside one transaction never trips the check midway.
ALTER TABLE library_entry ADD CONSTRAINT rank_position_unique UNIQUE (user_id, rank_position) DEFERRABLE INITIALLY DEFERRED;
DROP INDEX library_entry_status_idx;
CREATE INDEX library_entry_status_idx ON library_entry (user_id, status);

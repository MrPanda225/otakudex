-- Machine translations of public anime texts. Each is made once and shared by every account:
-- the original (Kitsu's English) is public, so a translation belongs to the anime, not to a person.
-- See docs/07-langues-et-textes.md.

CREATE TABLE media_translation (
  media_id     bigint      NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  lang         text        NOT NULL CHECK (lang IN ('fr', 'en')),
  -- sha256 of the text that was translated: a synopsis that changed at the source is translated again.
  source_hash  bytea       NOT NULL CHECK (octet_length(source_hash) = 32),
  synopsis     text        NOT NULL CHECK (char_length(synopsis) BETWEEN 1 AND 8000),
  provider     text        NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 40),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, lang)
);

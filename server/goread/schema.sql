-- GoRead: the one schema for both runtimes (node:sqlite and Cloudflare D1). Safe to run again.

-- the shelf: one row per shared text; a text once added is never replaced (the id is the key)
CREATE TABLE IF NOT EXISTS texts (
  course TEXT NOT NULL,
  id TEXT NOT NULL,
  lang TEXT NOT NULL,
  title TEXT NOT NULL,
  work_id TEXT NULL,
  chapter_index INTEGER NULL,
  chapter_title TEXT NULL,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  document TEXT NOT NULL,
  PRIMARY KEY (course, id)
);
CREATE INDEX IF NOT EXISTS texts_updated ON texts (course, updated_at);

-- the whitelist: one row per person per team; only the sha256 of the contributor key is kept
CREATE TABLE IF NOT EXISTS contributors (
  team TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT NULL,
  PRIMARY KEY (team, name)
);
CREATE INDEX IF NOT EXISTS contributors_key ON contributors (team, key_hash);

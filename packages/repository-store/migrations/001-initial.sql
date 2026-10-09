-- Go Repository store, migration 001: the initial schema. NEVER edit this file once it has been applied anywhere;
-- add migrations/NNN-<name>.sql instead (the runner records a checksum and refuses a changed file).

-- identity ---------------------------------------------------------------------------------------------------------
CREATE TABLE learners (
  learner_id TEXT PRIMARY KEY,
  json       TEXT NOT NULL
) STRICT;

CREATE TABLE accounts (
  account_id    TEXT PRIMARY KEY,
  learner_id    TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,          -- trimmed and lower-cased by the store
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  disabled_at   TEXT
) STRICT;
CREATE INDEX accounts_learner ON accounts (learner_id);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  revoked_at TEXT,
  json       TEXT NOT NULL
) STRICT;
CREATE INDEX sessions_learner ON sessions (learner_id);

CREATE TABLE devices (
  learner_id TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  json       TEXT NOT NULL,
  PRIMARY KEY (learner_id, device_id)
) STRICT;

CREATE TABLE teams (
  team_id TEXT PRIMARY KEY,
  json    TEXT NOT NULL
) STRICT;

CREATE TABLE team_members (
  team_id    TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  role       TEXT NOT NULL,
  since      TEXT NOT NULL,
  PRIMARY KEY (team_id, learner_id)
) STRICT;
CREATE INDEX team_members_learner ON team_members (learner_id);

CREATE TABLE enrolments (
  enrolment_id TEXT PRIMARY KEY,
  learner_id   TEXT NOT NULL,
  language_id  TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  goals        TEXT NOT NULL,                  -- JSON array of LearningGoal
  json         TEXT NOT NULL                   -- the rest of the Enrolment
) STRICT;
CREATE INDEX enrolments_learner ON enrolments (learner_id, started_at);

-- Layer B: the event log -------------------------------------------------------------------------------------------
-- seq is per learner and assigned from event_heads inside the append transaction; it is independent of `at`.
CREATE TABLE event_heads (
  learner_id TEXT PRIMARY KEY,
  head       INTEGER NOT NULL
) STRICT;

CREATE TABLE events (
  learner_id   TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  id           TEXT NOT NULL,
  dedupe_key   TEXT,
  kind         TEXT NOT NULL,
  at           TEXT NOT NULL,
  at_ms        INTEGER NOT NULL,               -- `at` as epoch milliseconds, so ranges compare numerically across offsets
  recorded_at  TEXT NOT NULL,
  language_id  TEXT NOT NULL,
  enrolment_id TEXT NOT NULL,
  json         TEXT NOT NULL,                  -- the full envelope (with recordedAt, without seq)
  PRIMARY KEY (learner_id, seq)
) STRICT;
CREATE UNIQUE INDEX events_id ON events (id);
CREATE UNIQUE INDEX events_dedupe ON events (learner_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX events_kind ON events (learner_id, kind, seq);
CREATE INDEX events_language ON events (learner_id, language_id, seq);
CREATE INDEX events_at ON events (learner_id, at_ms);

CREATE TABLE event_units (
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  unit_id  TEXT NOT NULL,
  PRIMARY KEY (event_id, unit_id)
) STRICT;
CREATE INDEX event_units_unit ON event_units (unit_id);

-- Layer A: linguistic knowledge ------------------------------------------------------------------------------------
CREATE TABLE units (
  unit_id     TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  language_id TEXT NOT NULL,
  label       TEXT NOT NULL,
  status      TEXT NOT NULL,
  json        TEXT NOT NULL
) STRICT;
CREATE INDEX units_find ON units (language_id, kind, label);

CREATE TABLE relations (
  from_id  TEXT NOT NULL,
  relation TEXT NOT NULL,
  to_id    TEXT NOT NULL,
  status   TEXT NOT NULL,
  json     TEXT NOT NULL,
  PRIMARY KEY (from_id, relation, to_id)
) STRICT;
CREATE INDEX relations_to ON relations (to_id);

CREATE TABLE analyses (
  analysis_id  TEXT PRIMARY KEY,
  form_id      TEXT NOT NULL,
  sentence_key TEXT,
  status       TEXT NOT NULL,
  json         TEXT NOT NULL
) STRICT;
CREATE INDEX analyses_form ON analyses (form_id, sentence_key);

CREATE TABLE aliases (
  old_id       TEXT NOT NULL,
  new_id       TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  json         TEXT NOT NULL,
  PRIMARY KEY (old_id, new_id, pack_version)
) STRICT;

CREATE TABLE packs (
  pack_id     TEXT NOT NULL,
  version     TEXT NOT NULL,
  language_id TEXT NOT NULL,
  json        TEXT NOT NULL,
  PRIMARY KEY (pack_id, version)
) STRICT;
CREATE INDEX packs_language ON packs (language_id);

-- Layer C: derived state -------------------------------------------------------------------------------------------
CREATE TABLE knowledge (
  learner_id    TEXT NOT NULL,
  unit_id       TEXT NOT NULL,
  language_id   TEXT NOT NULL,
  model_version TEXT NOT NULL,
  json          TEXT NOT NULL,
  PRIMARY KEY (learner_id, unit_id)
) STRICT;

CREATE TABLE projection_cursor (
  learner_id    TEXT PRIMARY KEY,
  seq           INTEGER NOT NULL,
  model_version TEXT NOT NULL
) STRICT;

CREATE TABLE preferences (
  learner_id  TEXT NOT NULL,
  language_id TEXT NOT NULL,                   -- '' = the learner-wide row
  json        TEXT NOT NULL,
  PRIMARY KEY (learner_id, language_id)
) STRICT;

-- private documents (never in events) ------------------------------------------------------------------------------
CREATE TABLE documents (
  learner_id TEXT NOT NULL,
  doc_id     TEXT NOT NULL,
  revision   INTEGER NOT NULL,
  body       TEXT NOT NULL,
  deleted_at TEXT,
  json       TEXT NOT NULL,                    -- the document without its body
  PRIMARY KEY (learner_id, doc_id)
) STRICT;

-- deletion ---------------------------------------------------------------------------------------------------------
CREATE TABLE tombstones (
  tombstone_id TEXT PRIMARY KEY,
  learner_id   TEXT NOT NULL,
  scope_kind   TEXT NOT NULL,
  event_id     TEXT,                           -- set for scope 'event'
  created_at   TEXT NOT NULL,
  json         TEXT NOT NULL
) STRICT;
CREATE INDEX tombstones_learner ON tombstones (learner_id, created_at);

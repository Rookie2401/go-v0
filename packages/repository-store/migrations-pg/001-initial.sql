-- Go Repository store, PostgreSQL migration 001: the whole schema as it stands after the SQLite migrations 001 to 004 (same tables, same keys, same
-- uniqueness). NEVER edit this file once it has been applied anywhere; add migrations-pg/NNN-<name>.sql instead (the runner records a checksum and
-- refuses a changed file). packages/repository-store/schema.sql documents the SQLite end state; this is its Postgres twin.
--
-- Text columns use the go_text domain, which is text collated "C" (byte order). SQLite compares text bytewise; without this an id such as
-- "lemma:sq:Ë" would sort differently on a database whose default collation is en_US.UTF-8, and the keyset paging over unit ids would
-- disagree with the sort the memory store applies in JavaScript. JSON is jsonb (keys are not kept in order; every reader parses it).

CREATE DOMAIN go_text AS text COLLATE "C";

-- identity ---------------------------------------------------------------------------------------------------------
CREATE TABLE learners (
  learner_id go_text PRIMARY KEY,
  json       jsonb NOT NULL
);

CREATE TABLE accounts (
  account_id            go_text PRIMARY KEY,
  learner_id            go_text NOT NULL,
  email                 go_text NOT NULL UNIQUE,   -- trimmed and lower-cased by the store
  password_hash         go_text NOT NULL,
  created_at            go_text NOT NULL,
  disabled_at           go_text,
  verified_at           go_text,
  deletion_requested_at go_text,
  deletion_due_at       go_text
);
CREATE INDEX accounts_learner ON accounts (learner_id);
CREATE INDEX accounts_deletion_due ON accounts (deletion_due_at) WHERE deletion_due_at IS NOT NULL;

CREATE TABLE account_tokens (
  token_hash go_text PRIMARY KEY,
  account_id go_text NOT NULL,
  purpose    go_text NOT NULL,
  created_at go_text NOT NULL,
  expires_at go_text NOT NULL,
  used_at    go_text
);
CREATE INDEX account_tokens_account ON account_tokens (account_id, purpose);

CREATE TABLE security_events (
  event_id    go_text PRIMARY KEY,
  learner_id  go_text,
  kind        go_text NOT NULL,
  at          go_text NOT NULL,
  device_id   go_text,
  detail      go_text,
  subject_ref go_text
);
CREATE INDEX security_events_learner ON security_events (learner_id, at);
CREATE INDEX security_events_at ON security_events (at);

CREATE TABLE sessions (
  session_id go_text PRIMARY KEY,
  learner_id go_text NOT NULL,
  token_hash go_text NOT NULL UNIQUE,
  revoked_at go_text,
  json       jsonb NOT NULL
);
CREATE INDEX sessions_learner ON sessions (learner_id);

CREATE TABLE devices (
  learner_id go_text NOT NULL,
  device_id  go_text NOT NULL,
  json       jsonb NOT NULL,
  PRIMARY KEY (learner_id, device_id)
);

CREATE TABLE teams (
  team_id go_text PRIMARY KEY,
  json    jsonb NOT NULL
);

CREATE TABLE team_members (
  team_id    go_text NOT NULL,
  learner_id go_text NOT NULL,
  role       go_text NOT NULL,
  since      go_text NOT NULL,
  PRIMARY KEY (team_id, learner_id)
);
CREATE INDEX team_members_learner ON team_members (learner_id);

CREATE TABLE enrolments (
  enrolment_id go_text PRIMARY KEY,
  learner_id   go_text NOT NULL,
  language_id  go_text NOT NULL,
  started_at   go_text NOT NULL,
  goals        jsonb NOT NULL,
  json         jsonb NOT NULL
);
CREATE INDEX enrolments_learner ON enrolments (learner_id, started_at);

-- Layer B: the event log -------------------------------------------------------------------------------------------
-- seq is per learner and assigned from event_heads inside the append transaction (which first takes an advisory lock on the learner);
-- it is independent of `at`, and event_heads.head never falls when events are deleted.
CREATE TABLE event_heads (
  learner_id go_text PRIMARY KEY,
  head       bigint NOT NULL
);

CREATE TABLE events (
  learner_id   go_text NOT NULL,
  seq          bigint NOT NULL,
  id           go_text NOT NULL,
  dedupe_key   go_text,
  kind         go_text NOT NULL,
  at           go_text NOT NULL,
  at_ms        bigint NOT NULL,
  recorded_at  go_text NOT NULL,
  language_id  go_text NOT NULL,
  enrolment_id go_text NOT NULL,
  json         jsonb NOT NULL,
  PRIMARY KEY (learner_id, seq),
  CONSTRAINT events_id_key UNIQUE (id)
);
CREATE UNIQUE INDEX events_dedupe ON events (learner_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX events_kind ON events (learner_id, kind, seq);
CREATE INDEX events_language ON events (learner_id, language_id, seq);
CREATE INDEX events_at ON events (learner_id, at_ms);
CREATE INDEX events_card_review ON events (learner_id, language_id, ((json -> 'subject') ->> 'cardId'), seq);

CREATE TABLE event_units (
  event_id go_text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  unit_id  go_text NOT NULL,
  PRIMARY KEY (event_id, unit_id)
);
CREATE INDEX event_units_unit ON event_units (unit_id);

-- Layer A: linguistic knowledge ------------------------------------------------------------------------------------
CREATE TABLE units (
  unit_id     go_text PRIMARY KEY,
  kind        go_text NOT NULL,
  language_id go_text NOT NULL,
  label       go_text NOT NULL,
  status      go_text NOT NULL,
  json        jsonb NOT NULL,
  origin      go_text NOT NULL DEFAULT 'import',
  validation  go_text NOT NULL DEFAULT 'unreviewed'
);
CREATE INDEX units_find ON units (language_id, kind, label);
CREATE INDEX units_origin ON units (origin, validation);

CREATE TABLE relations (
  from_id    go_text NOT NULL,
  relation   go_text NOT NULL,
  to_id      go_text NOT NULL,
  status     go_text NOT NULL,
  json       jsonb NOT NULL,
  origin     go_text NOT NULL DEFAULT 'import',
  validation go_text NOT NULL DEFAULT 'unreviewed',
  PRIMARY KEY (from_id, relation, to_id)
);
CREATE INDEX relations_to ON relations (to_id);
CREATE INDEX relations_origin ON relations (origin, validation);

CREATE TABLE analyses (
  analysis_id  go_text PRIMARY KEY,
  form_id      go_text NOT NULL,
  sentence_key go_text,
  status       go_text NOT NULL,
  json         jsonb NOT NULL,
  origin       go_text NOT NULL DEFAULT 'import',
  validation   go_text NOT NULL DEFAULT 'unreviewed'
);
CREATE INDEX analyses_form ON analyses (form_id, sentence_key);
CREATE INDEX analyses_origin ON analyses (origin, validation);

CREATE TABLE aliases (
  old_id       go_text NOT NULL,
  new_id       go_text NOT NULL,
  pack_version go_text NOT NULL,
  json         jsonb NOT NULL,
  PRIMARY KEY (old_id, new_id, pack_version)
);
CREATE INDEX aliases_new ON aliases (new_id);

CREATE TABLE packs (
  pack_id     go_text NOT NULL,
  version     go_text NOT NULL,
  language_id go_text NOT NULL,
  json        jsonb NOT NULL,
  PRIMARY KEY (pack_id, version)
);
CREATE INDEX packs_language ON packs (language_id);

-- Layer C: derived state -------------------------------------------------------------------------------------------
CREATE TABLE knowledge (
  learner_id    go_text NOT NULL,
  unit_id       go_text NOT NULL,
  language_id   go_text NOT NULL,
  model_version go_text NOT NULL,
  json          jsonb NOT NULL,
  PRIMARY KEY (learner_id, unit_id)
);
CREATE INDEX knowledge_vocabulary_page ON knowledge (learner_id, language_id, unit_id);
CREATE INDEX knowledge_vocabulary_counts ON knowledge (learner_id, language_id, ((json ->> 'encounters')::numeric), (json ->> 'level'));

CREATE TABLE projection_cursor (
  learner_id    go_text PRIMARY KEY,
  seq           bigint NOT NULL,
  model_version go_text NOT NULL
);

CREATE TABLE preferences (
  learner_id  go_text NOT NULL,
  language_id go_text NOT NULL,                  -- '' = the learner-wide row
  json        jsonb NOT NULL,
  PRIMARY KEY (learner_id, language_id)
);

-- private documents (never in events) ------------------------------------------------------------------------------
CREATE TABLE documents (
  learner_id go_text NOT NULL,
  doc_id     go_text NOT NULL,
  revision   bigint NOT NULL,
  body       text NOT NULL,
  deleted_at go_text,
  json       jsonb NOT NULL,
  PRIMARY KEY (learner_id, doc_id)
);

-- deletion ---------------------------------------------------------------------------------------------------------
CREATE TABLE tombstones (
  tombstone_id go_text PRIMARY KEY,
  learner_id   go_text NOT NULL,
  scope_kind   go_text NOT NULL,
  event_id     go_text,
  created_at   go_text NOT NULL,
  json         jsonb NOT NULL
);
CREATE INDEX tombstones_learner ON tombstones (learner_id, created_at);

-- operator state (the Postgres counterpart of the .migration-ready sentinel file) -----------------------------------
CREATE TABLE service_state (
  key   go_text PRIMARY KEY,
  value go_text NOT NULL
);

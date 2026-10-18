-- Accounts hardening: email verification, password reset, account deletion with a grace period, the security log, and a small key/value
-- table for operator state. Accounts that exist when this runs predate the verification rule and are marked verified (at their creation time).
ALTER TABLE accounts ADD COLUMN verified_at TEXT;
ALTER TABLE accounts ADD COLUMN deletion_requested_at TEXT;
ALTER TABLE accounts ADD COLUMN deletion_due_at TEXT;
UPDATE accounts SET verified_at = created_at;
CREATE INDEX accounts_deletion_due ON accounts (deletion_due_at) WHERE deletion_due_at IS NOT NULL;

-- one-time secrets mailed to the account holder; only the sha256 of the token is stored
CREATE TABLE account_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
) STRICT;
CREATE INDEX account_tokens_account ON account_tokens (account_id, purpose);

-- never a password, token or token hash. learner_id is NULL on rows that must outlive the learner (the purge audit line).
CREATE TABLE security_events (
  event_id    TEXT PRIMARY KEY,
  learner_id  TEXT,
  kind        TEXT NOT NULL,
  at          TEXT NOT NULL,
  device_id   TEXT,
  detail      TEXT,
  subject_ref TEXT
) STRICT;
CREATE INDEX security_events_learner ON security_events (learner_id, at);
CREATE INDEX security_events_at ON security_events (at);

CREATE TABLE service_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

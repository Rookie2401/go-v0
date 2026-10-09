# repository-store

The storage of the Go Repository: **two implementations of one port**, `RepositoryStore` in
`packages/repository-contract/src/ports.ts` (event log, linguistic store, projection store, private documents, identity,
tombstones, `transaction`, `eraseLearner`, `close`). Imports the contract and `node:*` only; no third-party dependency
(`node:sqlite` needs Node 24).

| file | what |
|---|---|
| `src/rules.ts` | the rules both stores share, as pure functions (validation of an append, de-duplication keys, filter matching, status rank, document revisions, ordering), so the two cannot drift |
| `src/memory.ts` | `createMemoryStore(opts?)` |
| `src/sqlite.ts` | `openSqliteStore(path \| ':memory:', opts?)` |
| `src/migrate.ts` | the migration runner (`applyMigrations`, `readMigrations`) |
| `src/export.ts` | `exportLearner`, `importLearner`, `unitProvenanceFor` |
| `src/deletion.ts` | `applyTombstone` |
| `migrations/NNN-*.sql` | the schema, one file per change |
| `schema.sql` | the current schema in one file (documentation and a test oracle; not what the runner applies) |

Both concrete stores also offer `deleteEvents(learnerId, ids)` (physical removal; used only by `applyTombstone`) and return
the fuller `EraseCounts` from `eraseLearner`. Neither is part of the port.

## Which store for what

- **Memory** (`createMemoryStore`): tests, the demo app, development servers, anything that may lose its data. Everything
  in or out is copied. `transaction(fn)` just runs `fn` (no rollback).
- **SQLite** (`openSqliteStore`): anything that must survive a restart (the Node service, a desktop build).
  `':memory:'` gives a throw-away database with the real schema (use it to test SQL behaviour). One writer process per file;
  WAL mode, foreign keys on, `busy_timeout` 5 s.

Both take `{ now?: () => string }` (the ISO clock stamped into `recordedAt` and into a document's `deletedAt`); SQLite also
takes `{ migrationsDir? }` (tests of the runner).

## Rules both stores keep

- `append(learnerId, events)`: every event passes `validateEvent`; an event whose `learnerId` differs from the one appended
  under is refused (an outcome with `issues`, nothing written). The same `id` again: `stored: false, duplicateOf: id`. A second
  event with the same `(learnerId, dedupeKey)`: `duplicateOf: <first id>`. An `id` already used by *another* learner is refused
  with an issue and nothing is revealed about it. `recordedAt` is the store's clock (a supplied one is replaced, a supplied
  `seq` is ignored). `seq` is per learner, assigned in arrival order and independent of `at`. The call is atomic in SQLite.
- Events are never updated. They disappear only through `eraseLearner` and `applyTombstone`.
- `head(learnerId)` is the highest `seq` ever issued to the learner (0 when none). It does **not** fall when events are
  deleted, so a sync cursor never meets a `seq` twice. `eraseLearner` resets it.
- `list`: ordered by `seq`; `kinds`, `languageId`, `unitId` (`subject.itemIds` contains it), `since` (`at >=`, compared as an
  instant, so mixed UTC offsets are fine), `afterSeq`, `limit` (default 1000, at least 1, at most 5000).
- `putUnits` / `putRelations` upsert (relation key `fromId|relation|toId`) but **never lower the status rank**
  (`STATUS_RANK`): a `verified` row is not replaced by a `provisional` one; an equal or higher rank replaces. (Consequence: a
  unit cannot be demoted to `invalidated` through `putUnits`; units are superseded by `supersededBy` / aliases.)
- Contract v3 (P-12). A rewrite keeps what the incoming row does not state: `origin`, `validation`, `licenceId`, `packVersion`, `analyzerVersion`, `alternatives` and **every stored correction** are carried over (`carryProvenance`), so a producer that knows nothing of v3 cannot erase a lookup's stamp. `requires-review` is **sticky**: a `provisional` or `conflicted` rewrite does not clear it; `high-confidence` or `verified` does. `recordUnitCorrection(unitId, correction, flag)` (optional on the port, implemented by both stores) is the only way a status goes down: it appends the correction and, if `flag`, moves a `provisional` unit (or, for a `reviewer`, a `high-confidence`/`verified` one) to `requires-review`; `conflicted` and `invalidated` never change. At most 50 corrections are kept (the newest). `provenanceStats()` (both concrete stores) counts rows by table, `origin`, `validation`.
- `putAnalyses` follows the same rank rule, and an `invalidated` analysis is terminal. `invalidateAnalysis` sets
  `status: 'invalidated'`, `reason`, `supersededBy` and keeps the row; an unknown id is a no-op.
- `getPack(packId)` without a version returns the highest version (compared numerically: `2.10` after `2.9`).
- `aliasesFor(ids)` matches on `oldId`.
- `putDocument(doc, expectedRevision)` is optimistic. A new document needs `expectedRevision` 0 and is stored at revision 1;
  otherwise the stored revision must equal `expectedRevision` and the row becomes `expectedRevision + 1` (the revision on
  `doc` is ignored). On mismatch: `{ ok: false, current }`. Asking to update (expected > 0) a document that does not exist
  throws (there is no `current` to return). `deleteDocument` blanks the body, sets `deletedAt` and **bumps the revision**, so a
  device holding the old text cannot overwrite the deletion; the row stays.
- Identity: email lookup is trimmed and case-insensitive (the stored form is lower-cased; emails are unique, a second account
  with the same email throws); sessions are found by token *hash* and never returned with it; `revokeSession` keeps the first
  revocation time. A row keyed by a global id (account, session, enrolment, tombstone) cannot be rewritten by another learner.
- `getPreferences(learnerId)` is the learner-wide row; `getPreferences(learnerId, languageId)` is exactly that language's row
  (no fallback; the engine decides defaults).

## Schema overview (SQLite)

`schema.sql` is the whole thing; in words:

| group | tables |
|---|---|
| bookkeeping | `schema_version` (version, name, checksum, applied_at) |
| identity | `learners`, `accounts` (email unique, lower-cased), `sessions` (token_hash unique), `devices`, `teams`, `team_members`, `enrolments` (goals as JSON) |
| events (Layer B) | `events`: primary key `(learner_id, seq)`, unique index on `id`, unique partial index on `(learner_id, dedupe_key) WHERE dedupe_key IS NOT NULL`, columns for `kind`, `at` (+ `at_ms`), `recorded_at`, `language_id`, `enrolment_id`, and the full envelope as JSON; `event_units (event_id, unit_id)` for the `unitId` filter (cascade on delete); `event_heads` (the per-learner seq counter) |
| linguistic (Layer A) | `units`, `relations`, `analyses`, `aliases`, `packs` |
| derived (Layer C) | `knowledge`, `projection_cursor`, `preferences` |
| private text | `documents` (body in its own column; **the only place a learner's own text lives**) |
| deletion | `tombstones` |

Rows keep the full object as JSON plus the columns that are queried; reading parses the JSON, so the contract types can grow
a field without a migration. No SQL is built from values: every value is a bound parameter (the only assembled text is a
`?` placeholder list).

### Transactions

`DatabaseSync` is synchronous, so each write batch runs between `BEGIN IMMEDIATE` and `COMMIT` in one synchronous block.
`transaction(fn)` holds one transaction open across the awaits of `fn`: a throw rolls back everything `fn` did. While it is
open, calls made from *outside* `fn` wait for it (so an unrelated write never lands inside it and is never rolled back with
it); calls made inside `fn` (also through `await`) run in it. A transaction inside a transaction is a savepoint.

## Migrations

**Add `migrations/NNN-short-name.sql` (next number, three digits at least); never edit an applied file.**

1. The runner (`applyMigrations`, called by `openSqliteStore`) creates `schema_version` if needed, then applies every file
   whose version is not recorded, in numeric order, each in its own transaction, recording `version`, `name`, a SHA-256
   `checksum` (line endings normalised) and the time. Opening an up-to-date database applies nothing.
2. An applied file whose checksum no longer matches is refused (`migration 001-initial.sql was edited after it was applied`),
   and a database that has a migration this build does not know is refused (`the database is newer than the code`).
3. A migration that fails rolls back completely and the open fails.
4. `002-provenance.sql` (contract v3) adds `origin` and `validation` (with an index) to `units`, `relations` and `analyses` and back-fills them from the row's JSON (`provenance.origin` / `provenance.validation`, for an analysis its own provenance or its chosen candidate's; absent = `import` / `unreviewed`). A database that only 001 has seen is migrated on open; its rows read back unchanged.
5. After adding a migration, update `schema.sql` to the new end state (`test/repository/store/sqlite.test.ts` compares it with a
   migrated database).

SQLite is `STRICT`; types are `TEXT`, `INTEGER` only.

## Export schema (`go-repository-export@1`)

`exportLearner(store, learnerId, { now? })` returns the learner's own copy of everything held about them:

```ts
interface LearnerExport {
  format: 'go-repository-export@1';
  exportedAt: string;            // ISO
  learnerId: string;
  learner?: Learner;
  enrolments: Enrolment[];       // with goals
  devices: string[];             // ids only
  events: StoredEvent[];         // every row, with seq and recordedAt, in seq order
  knowledge: UnitKnowledge[];    // derived, included for the learner's inspection
  preferences: AssistancePreferences[];   // learner-wide row first, then per language
  documents: PrivateDocument[];  // FULL bodies (the learner's own text); deleted ones have body '' and deletedAt
  tombstones: Tombstone[];       // the deletion receipts
  unitProvenance?: ExportedUnitProvenance[];   // v3: provenance of the units the events refer to (not restored by importLearner)
}
```

Never exported: password hash, session token hashes, other learners' rows. The format string is the version: a change of
shape is a new string, never a silent reinterpretation. (The port cannot list every preference row, so languages are
discovered from the enrolments, events, knowledge and documents.)

`importLearner(store, export)` restores into any store, in one transaction: learner and enrolments; events through `append`
(so validation, learner check and de-duplication apply; importing twice stores nothing new, and `seq` is preserved when the
target is empty); documents through `putDocument` (a stored document updated at or after the export's copy is kept;
revisions restart, a new document is revision 1); preferences and tombstones. **Knowledge is not restored** (derived; the
engine rebuilds it from the events), nor are accounts or devices (credentials never travel). It returns counts.

## Deletion semantics

`applyTombstone(store, tombstone)`, in one transaction:

1. **The tombstone is recorded first** (`putTombstone`), so the deletion shows up in exports and for sync.
2. Then the events are **physically removed**:
   - `learner`: `eraseLearner`, which removes every row of the learner (events, projections, cursor, preferences, documents,
     sessions, devices, enrolments, tombstones, team memberships, account(s), the learner row). The tombstone goes with it;
     there is nothing left to be a receipt for.
   - `source`: events whose `subject.sourceRef` has the same `kind` and, where the tombstone names them, the same `title` /
     `locator`.
   - `range`: events with `at` in `[from, to]`, inclusive (instants, not text).
   - `event`: that one id (and only if it is the learner's).
3. When events were removed, the learner's **projection rows are cleared and the cursor is rewound to `seq` 0** (model version
   kept), so nothing derived from deleted evidence survives; the engine refolds the log.
4. An **event-scope** tombstone also blocks the id from being appended again (a stale device resyncing the same event cannot
   undelete it). Source and range tombstones do not block future events (a learner may read that book again); the sync layer
   consults `listTombstones` for what a device may re-send.

It returns `{ tombstoneId, scope, events, knowledge, documents, erased? }`. A malformed tombstone (range with `from > to` or
unparsable, source without `kind`) throws before anything is written.

**Private documents never live in events.** A draft or testimony is only ever in `documents` (events carry a `draftId`
reference, never the text), so event deletion cannot leave a copy of it behind, and `eraseLearner` / the learner export
cover it. `deleteDocument` is the per-document deletion (body blanked, row kept as a receipt).

## Tests

`npx vitest run test/repository/store` runs `conformance.ts` (`storeConformance(name, open)`) against memory, SQLite
`:memory:` and SQLite on a temporary file, then `provenance.ts` (`storeProvenanceConformance`: contract v3 provenance, `requires-review`, corrections, counts, the new reference kinds, the export) against the same three, plus SQLite-specific tests (migrations idempotent and checksummed, persistence
across reopen, `schema.sql` equals the migrated schema, transaction rollback, nested savepoints, waiting for an open
transaction, foreign-key cascade, schema-level uniqueness).

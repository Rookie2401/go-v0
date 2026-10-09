# Go Repository — API, synchronization, privacy controls, development and deployment

Status: implemented 2026-10-08 (Prompt 3); contract version 3 (source policy, unit corrections, provenance) added 2026-10-09, section 7. The route-by-route reference with every status code is
`packages/repository-service/README.md`; the sync client's rules are `packages/repository-sync/README.md`. This document
is the overview an application developer needs, plus how to run the service.

## 1. Shape of the service

One handler, `handle(request: Request, deps): Promise<Response>`, written against web APIs (the repo's `server/goread`
convention), with a Node bridge (`main.ts`, `node:http`, SQLite file) and a typed client (`createRepositoryApi`) that
has one method per route; `createInProcessApi(deps)` calls the handler without sockets (used by the integration
test). JSON only; bodies over 1 MB are refused (413); invalid JSON is 400; errors are `{ error, message }`; one log line
per request `METHOD /path status ms` and never a body, query string or token.

## 2. Authentication and authorization

- `POST /accounts` (email, password ≥ 10 characters) → learner + account; passwords are scrypt-hashed
  (`node:crypto`, N = 16384, random 16-byte salt); nothing else is ever stored.
- `POST /sessions` (email, password, deviceId) → an opaque bearer token (32 random bytes, base64url) shown once; only
  its sha256 is stored; compared in constant time; 30-day expiry; `DELETE /sessions/current` revokes. Unknown emails
  take the same verification path as wrong passwords (a throw-away hash) and return the same body; five failures per
  email within 15 minutes → 429 (per process).
- **The learner of every request is the session's learner.** A `learnerId` named anywhere in a path or body that
  differs is refused with 403 `not-your-data` before any store access; another learner's enrolment or document id is
  404; a sync request for another device is 403 `not-your-device`. Team membership (`team_members`) is a separate
  record and no route returns another learner's data to a leader or member. Tested with two accounts and a team
  leader in `test/repository/service/isolation.test.ts` and `test/repository/integration.test.ts` (steps 21–22).
- Tokens must never reach a web page: the extension's background worker holds the session and content scripts
  message it (reader architecture decision, Prompt 2). The extension connects to the service since Prompt 4 (sessions, sync, learner-model cache; see GOLEARN-ARCHITECTURE.md).

## 3. Routes by concern

| concern | routes |
|---|---|
| account identity | `POST /accounts`, `POST /sessions`, `DELETE /sessions/current`, `GET /me`, `DELETE /me` (requires `confirmEmail`; erases every row of the learner and revokes all sessions) |
| team / language enrolment | `GET /enrolments`, `POST /enrolments` (teamId requires membership; appends `EnrolmentChanged`), `POST /enrolments/:id/end` (sets `endedAt`, appends `EnrolmentChanged {change:'ended'}`; idempotent; history is kept) |
| language-pack metadata | `GET /packs?languageId=` |
| unit correction (v3) | `POST /units/:id/corrections` (a learner's challenge to a unit: appended to its `provenance.corrections`; a `provisional` unit becomes `requires-review`; for a form with a `lexemeId` or `features` the linguistics port's `correct()` also supersedes the analysis; section 7.3) |
| linguistic knowledge lookup | `GET /units/:id` (unit, relations, analyses, and `provenance` with the v3 defaults filled in), `POST /units/batch` (`{ ids }`, 1 to 50: `{ units: { <id>: { unit, relations, analyses } }, missing: [ids] }`, the same view as the single route, for GoReview's intake), `POST /lookup` (surface + optional sentence → units, relations, analysis; the sentence is analysed and not stored) |
| learning-event ingestion | `POST /events` (1–500 per batch; a batch with any invalid event is rejected whole with per-index issues; retries are idempotent on `id` and `dedupeKey`; projection runs after the append) |
| learner-state queries | `GET /knowledge?unitIds=`, `GET /preferences?languageId=`, `GET /events?afterSeq=&kinds=&unitId=&since=&limit=` |
| review candidate retrieval | `GET /candidates?enrolmentId=&limit=` (explainable scores with reasons and eligibility) |
| review result submission | `POST /reviews` (review and listening families only) |
| writing evidence submission | `POST /writing` (a `ProductionRecorded` observation plus, optionally, the private document; atomic) |
| private documents | `GET /documents` (metadata), `GET/PUT/DELETE /documents/:id` (optimistic `expectedRevision`; 409 with `current`) |
| corrections | `POST /corrections` (learner correction of an analysis → new analysis, old invalidated, `AnalysisCorrected` event) |
| synchronization | `POST /sync/push`, `POST /sync/pull` |
| export | `GET /export` → `go-repository-export@1` (events, enrolments, knowledge, preferences, documents with bodies, tombstones, and since v3 `unitProvenance`: the provenance of the units the learner's events refer to; never a hash or token). The file has the store export's shape (top-level `learnerId`, `events`, `enrolments`, `documents`, `preferences`, `tombstones`) plus `account`, `contractVersion` and full `devices` objects, so `importLearner` (repository-store) restores it as downloaded; knowledge is derived and rebuilt by the engine |
| deletion | `POST /tombstones` (`event`, `source` and `range` scopes are recorded and then applied physically, the projection is refolded, the answer says `applied: { events, knowledge }`; `learner` scope is only recorded), `DELETE /me` (erasure) |
| health | `GET /health` |

## 4. Synchronization (local-first)

Device side (`packages/repository-sync`): a durable queue persists an event before anything else happens
(`enqueue` validates with the contract and refuses duplicates); `push` sends batches of ≤ 200 and treats `stored` and
`duplicateOf` alike as acknowledged, so a lost acknowledgement resolves on retry with exactly one copy on the server;
transport failures back off exponentially with jitter and never drop; a server rejection moves the event to a
`rejected` row that only the learner can dismiss; `pull` pages by the server's `seq` and advances its cursor only after
the local append succeeded; clock skew is measured (`clockSkewMs = clientTime − serverTime`) and reported, never used
to rewrite `at`. Immutable events union-merge by id and dedupe key; mutable documents merge by revision with the
explicit rules in `documents.ts`: a dirty local edit over a remote advance becomes a conflict copy
(`<docId>:conflict:<device>:<rev>`), never a silent loss; preferences: explicit beats inferred, then later `updatedAt`,
then the smaller device id. Proven by `test/repository/sync` (90 tests incl. a 50-run property test over two devices)
and the integration scenario steps 23–24 (dead network, then a stored batch whose acknowledgement is lost).

Server side: `/sync/push` applies events and documents in one transaction, reports document conflicts per document,
projects, and stamps the device's `lastSyncAt`; a pushed document carrying `deletedAt` is deleted (same revision rule, body and title gone); `/sync/pull` returns events after `afterSeq` (≤ 1000) and documents
updated at or after a time (`>=`, so a document written in the same millisecond as the device's cursor is not missed; the client keeps the newest revision per document).
One event the service refuses (`422 invalid-events`, with indexes) no longer holds a device's queue back: the client transports (GoLearn worker, GoPractice, via `repository-sync` `pushIsolatingRefusals`) set it aside as a `rejected:` row and send the rest in the same round. A `queue:` row that is not a queue row is set aside under `quarantine:corrupt:` with a diagnostic, and a damaged `sync:cursor` restarts at 0 (reported in `SyncStatus.notes`).

## 5. Privacy controls

- Nothing in an event carries text: payload validators refuse text keys and long surfaces; sentences are hashes;
  sources are titles and locators. Private writing lives in `documents`, exported and erased with the learner.
- Export is complete and readable (`GET /export`); deletion is per learner (`DELETE /me`), and per source, range or
  event through tombstones that the store applies physically (`applyTombstone`, reached through `POST /tombstones`) after recording the instruction; the
  projection is rebuilt afterwards. A deleted document keeps neither body nor title.
- Physical erasure (SQLite). The store sets `PRAGMA secure_delete = ON` and, after `DELETE /me`, a document deletion or an event tombstone, runs `wal_checkpoint(TRUNCATE)`, so the learner's email, titles, bodies and event keys are zeroed in the database file and gone from the write-ahead log (proved at byte level by `test/audit/privacy.deletion.test.ts`). The checkpoint is best effort: a process holding a read on the database at that moment turns it into a no-op until the next deletion. **`VACUUM` is the operator's step, not run per delete** (it rewrites the whole file and can take long on a large store): call `store.compact()` (checkpoint, `VACUUM`, checkpoint) from a maintenance window to shrink the file after large erasures; `secure_delete` makes it unnecessary for confidentiality of rows deleted from now on; a database that was already in use before this setting existed may hold older deleted data in free pages, and one `compact()` removes that. **Not covered:** backups, replicas, snapshots and any copy of the file made before an erasure keep what they kept, and the shared linguistic tables (`units`, `relations`, `analyses`) keep the surface of a word a learner looked up, without any learner id, device or time. Since contract v3 each such row says how it came to exist (`provenance.origin` `learner-lookup`, `validation` from the pack's level; audit P-12), and `DELETE /me` leaves these rows by design; the export lists the provenance of the units the learner's events refer to (section 7.4).
- No third-party processing exists in the service; consents are events (`ConsentGiven/Withdrawn`) reported by `GET /me`.
- Logging never includes bodies, queries or tokens; a 500 leaks no cause.
- Reading telemetry is minimal by construction: the only reading events are the learner's own lookups with hashes.

## 6. Development and deployment

```
npx vitest run test/repository test/contract test/ecosystem   # the Repository suites (737 tests in test/repository, test/contract and test/sync on 2026-10-09, 178 of them for contract v3, incl. the integration scenario)
npx vite-node packages/repository-service/src/main.ts --port 8790 --data data/repository
```
`--data` (default `data/repository`, git-ignored) holds `repository.sqlite`; migrations run on open. Needs Node 24
(`node:sqlite`); no other dependency. The service agent ran this bridge once on port 8791 and drove sign-up, sign-in,
enrolment, lookup, events, knowledge, candidates, correction, document, sync, export and delete-me against the real
packages; the smoke data was removed.

Deployment (owner's decision, not done): the handler is web-API only, so the Cloudflare Worker path used by
`server/goread` applies once a D1 twin of `repository-store/src/sqlite.ts` is written against `schema.sql`; the owner
deploys and holds every secret; nothing in this repository contains one. Encryption in transit is the host's TLS.
Stored-data protection beyond file permissions (at-rest encryption, backups) is the host's responsibility and is
listed as a limitation in the test report.

## 7. Contract version 3 in the service (2026-10-09)

The service speaks contract v3 and still accepts v1 and v2 events (data model, section 7, has the v2 to v3 table). `GET /health` reports
`contractVersion: 3`.

### 7.1 Source policy: what a reader's source may be used for

An event's `subject.sourceRef.restrictions` is a **claim by the client**. At ingestion (`POST /events`, `POST /sync/push`, `POST /reviews`,
`POST /writing`) the service stores that claim **capped by its own table**, keyed by the event's `payload.readerId`: per field the more
restrictive of the two, in the order `forbidden` < `unknown` < `allowed`. A client may tighten and never loosen, and an absent field counts as
`unknown`, so page-controlled metadata can never grant a permission. A reader the table does not know gets all `unknown`. The table is
`packages/repository-service/src/source-policy.json` (data, read by `sourcePolicy.ts` and wired into the service by `main.ts` as `ServiceDeps.sourcePolicy`; a service started without one caps every claim to all `unknown`, which fails closed); it is the most permissive value the service will store, not a finding that the terms allow
it: every registry entry still has `termsReview.reviewed: false`, so each row changes only with a person's review of the terms, recorded in the
reader registry and here together. `readerId` is asserted by the application (the extension sets it from its own registry), not by the page.

| readerId | textRetention | remoteProcessing | audioRetention | export | sharing | reviewExamples | why |
|---|---|---|---|---|---|---|---|
| `web-generic` | unknown | unknown | unknown | unknown | unknown | unknown | any page; its terms are not known to us |
| `epub-local` | unknown | unknown | unknown | **allowed** | forbidden | unknown | the learner's own DRM-free file: exporting what they looked up is theirs to do; what the book's text may be kept, sent away or shared for is a property of the book, and sharing stays forbidden |
| `play-books`, `libroteka`, `kanah`, `tolino-webreader`, `vivlio-casadellibro` | forbidden | forbidden | forbidden | unknown | forbidden | forbidden | store or subscription readers, terms unreviewed |
| `kobo-web`, `kindle-web`, `readawrite`, `mebmarket`, `pratilipi` | forbidden | forbidden | forbidden | forbidden | forbidden | forbidden | blocked, permission-required or unsupported |
| `biblegateway`, `youversion` | forbidden | forbidden | forbidden | unknown | forbidden | forbidden | licensed translations: the verses stay on the provider's page and no derivative (audio, example, share) is made from them |
| `share-android`, `share-ios`, `share-web`, `clipboard` | unknown | unknown | unknown | unknown | unknown | unknown | the learner moved a passage in; where it came from is not established |
| anything else | unknown | unknown | unknown | unknown | unknown | unknown | the floor |

Only `epub-local.export` is `allowed`; a test pins that. Restrictions are written onto the stored reference only when the client sent some (a
reference that claims nothing is stored without, and reads as `unknown`; the policy is still what a consumer should apply for `readerId`).
A typed (v3) reference is stored rebuilt from its known fields, so `GET /events` and `/sync/pull` return the stored (capped, rebuilt) reference, which can differ from the one a device queued; the server's copy is the one anything downstream should read. Tests: `test/repository/service/v3.test.ts` (a forged `allowed` is stored as
the policy's value for every row; a tightened value is kept; the table covers every id in `reader/ADAPTER-REGISTRY.md`).

### 7.2 Provenance of looked-up rows

Ingesting a `SelectionLookedUp` (and `POST /lookup`) stamps the shared rows it registered with `origin: 'learner-lookup'`, `packVersion` and
`validation` from the stored pack row: `installable` is `production-validated` only if the pack manifest says so (else `unreviewed`),
`experimental` is `experimental`, `planned` is `unsupported`, no pack row is `unreviewed`. **No learner id, device or time is stored with
it.** Stamping is best effort and happens once per row.

### 7.3 Corrections to a unit

`POST /units/:id/corrections` `{ reason, from?, to?, lexemeId?, features?, sentenceKey? }` (a learner session; `reason` 1 to 300
characters) answers `{ unit, provenance, statusChanged, result? }`:

- the correction is appended to the unit's `provenance.corrections` as `{ at, by: 'learner', from?, to?, reason }`, with no learner id;
- a form unit given a `lexemeId` or `features` is passed to the linguistics port's `correct()` (superseding analysis, the old one
  invalidated; `result` carries it) and is not flagged;
- otherwise a `provisional` unit becomes `requires-review`; a `verified` or `high-confidence` unit keeps its status (one learner cannot
  lower a reviewed unit for everyone; the correction waits for a reviewer), `statusChanged: false`;
- 404 `no-such-unit`, 422 for a missing or too long `reason`, 403 `learner-only` for `"by": "reviewer"` (a reviewer's verdict is the
  operator's, through the store's `recordUnitCorrection`), 403 for another learner's id, 409 `corrections-full` at 50 per unit.

This route is the unit-level challenge. The learner's own evidence trail (an `AnalysisCorrected` event against an enrolment) stays
`POST /corrections`.

### 7.4 Export and deletion

`GET /export` adds `unitProvenance`: for every unit the learner's events refer to, `{ unitId, kind, languageId, label, status, provenance }`
with the v2 defaults filled in (corrections included, which name a role and never a person). The format string is unchanged
(`go-repository-export@1`); the field is ignored by `importLearner` (the linguistic layer is shared, not restored). **`DELETE /me` leaves the
shared linguistic rows** (`units`, `relations`, `analyses`) as they are, including their stamps and corrections: they hold no learner id,
device, email or session. The one free-text field in them is a correction's `reason`; it carries no author and cannot be found by the
learner's id, so erasure does not remove it. The privacy text for learners should say so.

### 7.5 Operating notes

- Migration `002-provenance.sql` runs on first open of an existing database (a few `ALTER TABLE ... ADD COLUMN` and `UPDATE` statements over
  `units`, `relations`, `analyses`); take the usual file copy first. A build that only knows 001 refuses the migrated database ("newer than the
  code"), by design.
- `store.provenanceStats()` counts the shared rows by table, origin and validation (for an operator: how much of the linguistic layer is
  `learner-lookup` and still `unreviewed`). The same is `SELECT origin, validation, COUNT(*) FROM units GROUP BY 1, 2`.
- The clock-skew rule is in the data model, section 7.6: `clockSkewMs` on a sync push response is reported, never applied.

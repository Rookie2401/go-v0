# Go Repository — API, synchronization, privacy controls, development and deployment

Status: implemented 2026-10-08 (Prompt 3). The route-by-route reference with every status code is
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
| linguistic knowledge lookup | `GET /units/:id` (unit, relations, analyses), `POST /units/batch` (`{ ids }`, 1 to 50: `{ units: { <id>: { unit, relations, analyses } }, missing: [ids] }`, the same view as the single route, for GoReview's intake), `POST /lookup` (surface + optional sentence → units, relations, analysis; the sentence is analysed and not stored) |
| learning-event ingestion | `POST /events` (1–500 per batch; a batch with any invalid event is rejected whole with per-index issues; retries are idempotent on `id` and `dedupeKey`; projection runs after the append) |
| learner-state queries | `GET /knowledge?unitIds=`, `GET /preferences?languageId=`, `GET /events?afterSeq=&kinds=&unitId=&since=&limit=` |
| review candidate retrieval | `GET /candidates?enrolmentId=&limit=` (explainable scores with reasons and eligibility) |
| review result submission | `POST /reviews` (review and listening families only) |
| writing evidence submission | `POST /writing` (a `ProductionRecorded` observation plus, optionally, the private document; atomic) |
| private documents | `GET /documents` (metadata), `GET/PUT/DELETE /documents/:id` (optimistic `expectedRevision`; 409 with `current`) |
| corrections | `POST /corrections` (learner correction of an analysis → new analysis, old invalidated, `AnalysisCorrected` event) |
| synchronization | `POST /sync/push`, `POST /sync/pull` |
| export | `GET /export` → `go-repository-export@1` (events, enrolments, knowledge, preferences, documents with bodies, tombstones; never a hash or token). The file has the store export's shape (top-level `learnerId`, `events`, `enrolments`, `documents`, `preferences`, `tombstones`) plus `account`, `contractVersion` and full `devices` objects, so `importLearner` (repository-store) restores it as downloaded; knowledge is derived and rebuilt by the engine |
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
- Physical erasure (SQLite). The store sets `PRAGMA secure_delete = ON` and, after `DELETE /me`, a document deletion or an event tombstone, runs `wal_checkpoint(TRUNCATE)`, so the learner's email, titles, bodies and event keys are zeroed in the database file and gone from the write-ahead log (proved at byte level by `test/audit/privacy.deletion.test.ts`). The checkpoint is best effort: a process holding a read on the database at that moment turns it into a no-op until the next deletion. **`VACUUM` is the operator's step, not run per delete** (it rewrites the whole file and can take long on a large store): call `store.compact()` (checkpoint, `VACUUM`, checkpoint) from a maintenance window to shrink the file after large erasures; `secure_delete` makes it unnecessary for confidentiality of rows deleted from now on; a database that was already in use before this setting existed may hold older deleted data in free pages, and one `compact()` removes that. **Not covered:** backups, replicas, snapshots and any copy of the file made before an erasure keep what they kept, and the shared linguistic tables (`units`, `analyses`) keep the surface of a word a learner looked up, without any learner id (audit P-12).
- No third-party processing exists in the service; consents are events (`ConsentGiven/Withdrawn`) reported by `GET /me`.
- Logging never includes bodies, queries or tokens; a 500 leaks no cause.
- Reading telemetry is minimal by construction: the only reading events are the learner's own lookups with hashes.

## 6. Development and deployment

```
npx vitest run test/repository test/ecosystem            # the Repository suites (466 tests incl. the integration scenario)
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

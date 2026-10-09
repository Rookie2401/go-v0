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
  message it (reader architecture decision, Prompt 2). The extension prototype does not yet connect to the service.

## 3. Routes by concern

| concern | routes |
|---|---|
| account identity | `POST /accounts`, `POST /sessions`, `DELETE /sessions/current`, `GET /me`, `DELETE /me` (requires `confirmEmail`; erases every row of the learner and revokes all sessions) |
| team / language enrolment | `GET /enrolments`, `POST /enrolments` (teamId requires membership; appends `EnrolmentChanged`) |
| language-pack metadata | `GET /packs?languageId=` |
| linguistic knowledge lookup | `GET /units/:id` (unit, relations, analyses), `POST /lookup` (surface + optional sentence → units, relations, analysis; the sentence is analysed and not stored) |
| learning-event ingestion | `POST /events` (1–500 per batch; a batch with any invalid event is rejected whole with per-index issues; retries are idempotent on `id` and `dedupeKey`; projection runs after the append) |
| learner-state queries | `GET /knowledge?unitIds=`, `GET /preferences?languageId=`, `GET /events?afterSeq=&kinds=&unitId=&since=&limit=` |
| review candidate retrieval | `GET /candidates?enrolmentId=&limit=` (explainable scores with reasons and eligibility) |
| review result submission | `POST /reviews` (review and listening families only) |
| writing evidence submission | `POST /writing` (a `ProductionRecorded` observation plus, optionally, the private document; atomic) |
| private documents | `GET /documents` (metadata), `GET/PUT/DELETE /documents/:id` (optimistic `expectedRevision`; 409 with `current`) |
| corrections | `POST /corrections` (learner correction of an analysis → new analysis, old invalidated, `AnalysisCorrected` event) |
| synchronization | `POST /sync/push`, `POST /sync/pull` |
| export | `GET /export` → `go-repository-export@1` (events, enrolments, knowledge, preferences, documents with bodies, tombstones; never a hash or token) |
| deletion | `POST /tombstones` (records the instruction), `DELETE /me` (erasure) |
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
projects, and stamps the device's `lastSyncAt`; `/sync/pull` returns events after `afterSeq` (≤ 1000) and documents
updated since a time.

## 5. Privacy controls

- Nothing in an event carries text: payload validators refuse text keys and long surfaces; sentences are hashes;
  sources are titles and locators. Private writing lives in `documents`, exported and erased with the learner.
- Export is complete and readable (`GET /export`); deletion is per learner (`DELETE /me`), and per source, range or
  event through tombstones that the store applies physically (`applyTombstone`) after recording the instruction; the
  projection is rebuilt afterwards.
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

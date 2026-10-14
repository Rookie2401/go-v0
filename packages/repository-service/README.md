# repository-service

The authenticated service layer of the Go Repository: account identity, enrolment, packs, linguistic lookup, event
ingestion, learner-state queries, review candidates, review and writing submission, sync, export and deletion.

It follows the repo's server convention (`server/goread/`): one `handle(request: Request, deps): Promise<Response>`
with web APIs only (no `node:` import in `handler.ts`), a `node:http` bridge in `main.ts`, errors as
`{ error, message }`, one log line per request, bearer tokens that are 32 random bytes shown once with only their sha256
stored. It depends on the contract's ports (`RepositoryStore`, `ProjectionEngine`) and on the small interfaces in
`src/deps.ts`; the real store, engine and linguistic service are wired in `main.ts` only (dynamic imports).

| file | what |
|---|---|
| `src/handler.ts` | `handle(request, deps)`: every route, validation, authorization, limits, logging |
| `src/sourcePolicy.ts`, `src/source-policy.json` | contract v3: the service's own table of what each reader's source may be used for, as data (`source-policy.json`, read and checked by `sourcePolicy.ts`: `SOURCE_POLICY`, `policyFor`). `main.ts` wires it as `ServiceDeps.sourcePolicy`; the handler caps a client's source restrictions by it (`storedSourceRef`) and imports neither file, because the applications reach the handler. Section 7.1 of REPOSITORY-API-AND-OPERATIONS.md has the table |
| `src/deps.ts` | `ServiceDeps`: `store`, `engine`, `linguistics` (`resolveAndStore`, `lookup`, `correct`), `crypto`, `now?`, `log?`, `exporter?` |
| `src/crypto-node.ts` | `nodeCrypto`: scrypt (N=16384, r=8, p=1, random 16-byte salt, `scrypt$<salt b64url>$<hash b64url>`), `timingSafeEqual`, `randomBytes(32)` base64url, sha256 hex |
| `src/linguistics-adapter.ts` | `adaptLinguistics(createLinguisticService(...))` → `LinguisticsPort` (flattens relations, maps `invalidated` to ids) |
| `src/api.ts` | `createRepositoryApi({ baseUrl, fetch, token? })` typed client, one method per route; `createInProcessApi(deps)` calls `handle` directly |
| `src/main.ts` | Node entry: `node:http` bridge + SQLite store + engine + linguistics + node crypto |

## Run it

```
npx vite-node --config server/goread/vite.config.ts packages/repository-service/src/main.ts --port 8790 --data data/repository
```

`--port` (default 8790; `0` picks a free one), `--data` (default `data/repository`, created if missing; the database is
`<data>/repository.sqlite`), `--host` (default `127.0.0.1`). Prints `repository listening on http://127.0.0.1:<port>`.
Needs Node 24 (`node:sqlite`). Stops cleanly on Ctrl-C / SIGTERM. `data/repository/` should be git-ignored like
`data/goread/`. Tests: `npx vitest run test/repository/service`.

## Auth model

* `POST /accounts` and `POST /sessions` are open (as is `GET /health`); every other route needs
  `Authorization: Bearer <token>`.
* A token is `randomBytes(32)` base64url, returned once by `POST /sessions`. The store keeps `sha256(token)` only. A
  session is valid until its `expiresAt` (30 days), unless revoked (`DELETE /sessions/current`), and only while its
  account is not disabled. Missing, malformed, unknown, expired and revoked tokens are all `401 unauthorized`.
* The session carries the device (`deviceId` from sign-in). Sync routes accept only that device.
* Passwords: at least 10 characters (`422 weak-password`), at most 1000. Hashed with scrypt; the plaintext is never
  stored or logged. Sign-in checks a throw-away hash when the email is unknown, so the work (and the answer) is the same
  as for a wrong password.
* **Throttle**: 5 failed sign-ins for one email (known or not) within 15 minutes → `429 too-many-attempts`
  (with `Retry-After`), even for the right password, until the oldest failure is 15 minutes old. The counters are an
  in-memory map **per process**: lost on restart, not shared between instances, so a scaled-out deployment multiplies the
  allowance (put a shared limiter in front, or in the store, before running more than one instance). There is no limit on
  account creation yet.

## Authorization

One rule: **the learner is the session's learner.** A `learnerId` in a query, a body, an event, a document or a tombstone
that differs from the session's is `403 not-your-data`, checked before anything is read or written (a batch holding one
foreign event stores none). There is no route that reads another learner, so naming one is the only way to ask, and
that is refused. **Team membership grants nothing**: a team leader's token gets 403 on a member's data like anyone else's.
Enrolling with a `teamId` needs membership (`403 not-a-member`; `404 no-such-team`). Another learner's `enrolmentId` or
`docId` is simply absent for you (404), indistinguishable from a missing one.

## Routes

All bodies and responses are JSON. Errors: `{ error, message }` plus route-specific fields (`issues`, `current`).

| route | body / query | answer |
|---|---|---|
| `GET /health` | | `{ ok: true, service: 'repository', version }` |
| `POST /accounts` | `{ email, password, displayName? }` | `201 { learnerId, accountId }`; 422 `weak-password`/invalid; 409 `email-taken` (emails are trimmed and lower-cased) |
| `POST /sessions` | `{ email, password, deviceId, platform? }` | `201 { token, learnerId, expiresAt }`; creates/updates the Device; 401 `bad-credentials`; 429 |
| `DELETE /sessions/current` | | 204 |
| `GET /me` | | `{ learner, account: { accountId, email, createdAt }, enrolments, devices, consents }`. `devices` holds the session's device only (the port has no device listing). `consents`: latest `ConsentGiven`/`ConsentWithdrawn` per key (`payload.consent`, else `scope`, else `key`, else `general`) |
| `DELETE /me` | `{ confirmEmail }` | 204 after `store.eraseLearner` and revoking the session; 422 `email-mismatch` unless it equals the account email. If the store leaves the account row, it is disabled and its email and the display name are scrubbed (the port has no account deletion) |
| `GET /enrolments` | | `{ enrolments }` |
| `POST /enrolments` | `{ teamId?, languageId, varietyId?, scriptId?, packId, packVersion, goals }` | `201 { enrolment }`; also appends an `EnrolmentChanged` event (producer `repository`, dedupeKey `enrolment:<id>:started`) |
| `GET /packs?languageId=` | | `{ packs }` |
| `GET /units/:id` | | `{ unit, relations, analyses, provenance }` via `linguistics.lookup`; `provenance` is the unit's with the v3 defaults filled in (a v2 row reads as `origin: 'import'`, `validation: 'unreviewed'`); 404 `no-such-unit` |
| `POST /units/:id/corrections` | `{ reason, from?, to?, lexemeId?, features?, sentenceKey? }` | contract v3. Appends a correction (role `learner`, no learner id; reason 1 to 300 characters) to the unit's `provenance.corrections`. A form given a `lexemeId` or `features` goes through `linguistics.correct()` (superseding analysis, in `result`) and is not flagged; otherwise a `provisional` unit becomes `requires-review`, while `verified` and `high-confidence` units keep their status. `{ unit, provenance, statusChanged, result? }`; 404 `no-such-unit`, 422, 403 `learner-only` for `by: "reviewer"` or another learner, 409 `corrections-full` at 50 |
| `POST /lookup` | `{ languageId, surface, sentence?, sentenceKey?, selStart?, selEnd? }` | `linguistics.resolveAndStore`; `{ formId, units, relations, analysis, sentenceKey }`. The sentence goes to the analyser and nowhere else; when only `sentence` is given the service passes `sha256(sentence)` as `sentenceKey`. Surface at most 120 characters, sentence at most 5000 |
| `POST /events` | `{ events: GoEvent[] }` (1–500) | `{ outcomes, stored, duplicates, head, projected }`. `validateEvent` on each, learner check, `store.append`, then `engine.project`. **A batch with any invalid event is rejected whole**: `422 invalid-events` with `issues: [{ index, id?, issues: [{ path, message }] }]` and nothing stored. Client `recordedAt`/`seq` are dropped. Retries are idempotent (`id` and `dedupeKey`): outcomes say `duplicateOf`. A failing projection leaves the events stored and reports `projected: false` |
| `GET /events?afterSeq=&kinds=a,b&unitId=&languageId=&since=&limit=` | | `{ events, head }`; limit default 200, clamped to 1000 |
| `GET /knowledge?unitIds=a,b` | up to 200 ids | `{ knowledge }` via `engine.knowledge` |
| `GET /candidates?enrolmentId=&limit=` | | `{ candidates }` via `engine.candidates`; the enrolment must be the learner's (404 otherwise); limit default 20, clamped to 200 |
| `GET /preferences?languageId=` | | `{ preferences }` |
| `POST /reviews` | `{ events }` | as `/events`, restricted to the `review` and `listening` families |
| `POST /writing` | `{ observation: ProductionRecorded event, document?: { doc, expectedRevision } }` | `{ outcome, document?, projected }`. The text goes to the document store, the observation to the log (the contract refuses text keys in payloads and subjects). Atomic: a document conflict (409) stores nothing |
| `GET /documents` | | `{ documents }` metadata without `body` (deleted ones omitted) |
| `GET /documents/:id` | | `{ document }` with `body`; 404 for another learner's or a deleted one |
| `PUT /documents/:id` | `{ doc: { languageId, kind, title?, body }, expectedRevision }` | `{ document }` (metadata). The server sets learner, device (the session's), `updatedAt` and `revision = expectedRevision + 1`. Stale `expectedRevision` → `409 conflict` with `current` (the stored document, body included) |
| `DELETE /documents/:id` | | 204; the body is removed, the row keeps `deletedAt` |
| `POST /corrections` | `{ formId, lexemeId?, features?, reason?, sentenceKey?, enrolmentId?, languageId? }` | `linguistics.correct(formId, { by: 'learner', … }, now)` then an `AnalysisCorrected` event against the learner's enrolment in the form's language (422 `no-enrolment` if none) |
| `POST /sync/push` | `SyncPushRequest` | `{ outcomes, documents: [{ docId, ok, current? }], serverTime, clockSkewMs, head }`. `deviceId` must be the session's (403 `not-your-device`). `clockSkewMs = clientTime − serverTime`. Events keep the client's `at`. Events are validated as one batch (422 whole); events and documents are applied in one transaction; document conflicts are reported per document, not as an error; then `engine.project`; the device's `lastSyncAt` is stamped. At most 500 events and 50 documents |
| `POST /sync/pull` | `SyncPullRequest` | `{ events, documents, head, serverTime }`: events after `afterSeq` (limit clamped to 1000), documents with `updatedAt` after `documentsSince` (deleted documents included, body gone) |
| `GET /sync/status` | | `SyncStatusReply`: `{ cursor, events, at }`. `cursor` is opaque (the head sequence as text; `Number(cursor)` is the `afterSeq` `POST /sync/pull` takes), `events` is the learner's stored event count, `at` the server time |
| `POST /sync/wait` | `{ since, timeoutMs? }` (`SyncWaitRequest`; `since` is a cursor from `/sync/status`, or the `head` of the last pull as text) | **Long-poll.** `SyncWaitReply` `{ changed, cursor, events }`. `changed: true` at once when the log head differs from `since` (events newer than it exist; a cursor *ahead* of the log, after a deletion, also counts so the device looks again); otherwise held until an append for this learner lands (`POST /sync/push`, `/events`, `/reviews`, `/writing`, `/corrections`, enrolments: anything but a read) → `true`, or until `timeoutMs` (default and maximum **25000**) → `changed: false`. Also `false` when the service shuts down or the client disconnects. After `true`, `POST /sync/pull` with `afterSeq: Number(since)`. At most **4** concurrent held waits per learner; the fifth gets `429 too-many-waiters` (`Retry-After: 5`); an answered-at-once wait never counts. Same auth, CORS and `no-store` as the other sync routes (a hosted static page on another origin can call it); `422` for a bad `since`/`timeoutMs`, `403` for a `learnerId` that is not the session's |
| `GET /export` | | `{ format: 'go-repository-export@1', contractVersion, exportedAt, learner, account, devices, enrolments, events, knowledge, preferences, documents, tombstones, unitProvenance }` (v3: the provenance of the units the learner's events refer to) assembled from the store ports, or `deps.exporter(learnerId)` when given. Never a password hash or a token |
| `POST /tombstones` | `{ scope, reason? }` | `201 { tombstone, applied: { events, knowledge } }`. `scope` is `{kind:'learner'}`, `{kind:'source',sourceRef}`, `{kind:'range',from,to}` or `{kind:'event',id}`. `event`, `source` and `range` are applied through the store's `applyTombstone` and the projection is refolded (P-02, 2026-10-09); `learner` is record-only (`DELETE /me` erases); a store that cannot delete answers 501 |
| `POST /units/batch` | `{ ids }` (1–50) | `{ units: [...], missing: [...] }`: what `GET /units/:id` returns (provenance included), for several ids in one call (PF-02) |
| `POST /enrolments/:id/end` | | sets `endedAt`, appends `EnrolmentChanged` (`change: 'ended'`); idempotent; 404 for another learner's enrolment (P-06) |

Other statuses: `400 invalid-json`, `404 not-found`, `405 method-not-allowed`, `413 too-large`, `422 invalid-input` /
`invalid-query` / `id-mismatch`, `500 server-error` (never a cause). `OPTIONS` answers 204 with permissive CORS
(`Authorization` and `Content-Type` headers; the API uses bearer tokens, not cookies). Responses are `Cache-Control: no-store`.

## Live updates (change cursor and long-poll)

A second device (GoReview on the phone) learns of new events without polling: it reads `GET /sync/status`, then loops `POST /sync/wait { since: cursor }`; each `changed: true` is followed by a `POST /sync/pull` and the new cursor is the next `since`. On `changed: false` it simply asks again with the same cursor (and `429`/network errors back off).

* **Latency bound.** From the learner's action on the desktop to the phone being told: the extension's push debounce (**2 s**, `SYNC_DEBOUNCE_MS` in `golearn-extension/src/background/sync.ts`) + the push round-trip + a wake of milliseconds. The long-poll itself adds no delay; the 25 s timeout only bounds how long a *quiet* request is held (an idle phone makes one cheap request per 25 s).
* **Where it lives.** `src/notifier.ts` (`createChangeNotifier`): in-process waiters keyed by learner. The handler pokes the learner's waiters after every non-GET authenticated request; a waiter re-reads the head and resolves only if it moved, so a poke that appended nothing wakes no one. `deps.notifier` is optional (the handler keeps one per store when it is absent); `main.ts` wires one, aborts a held request when its client disconnects, and calls `closeAll()` on shutdown (every waiter resolves `changed: false`, every timer is cleared).
* **Process-local.** One service process over one SQLite file is the supported deployment; a second process would not wake this one's waiters (they would still time out and report the truth).

## Limits

* Held `POST /sync/wait` requests: **4** per learner, **25 s** at most each (`429 too-many-waiters` beyond).
* Request body: **1 MB**, counted on the stream (not only the header) → `413 too-large`.
* Events per request 500; documents per sync push 50; page sizes clamped (events 1000, candidates 200); `unitIds` at most 200.
* Password 10–1000 characters; email at most 254; surface at most 120; sentence at most 5000.

## What is logged

One line per request: `METHOD /path status ms` (path only: never the query string, a body, a header or a token), via
`deps.log` (`console.log` in `main.ts`). Nothing else is logged; unexpected errors are a bare 500.

## What is never stored

* **Plaintext passwords**: only the scrypt string. Never in a response, a log, or an export.
* **Tokens**: only `sha256(token)`; the token is shown once.
* **A learner in a shared row** (v3): rows stamped at a lookup (`origin: 'learner-lookup'`) and unit corrections hold no learner id, device, email or time, and `DELETE /me` leaves them. A correction's `reason` is free text without an author.
* **Page text**: `/lookup`'s `sentence` is used to analyse and dropped; only its hash (`sentenceKey`) is kept. Events carry hashes and ids, never passages (`validateEvent`). The learner's own writing lives only in the document store, and is exported and deleted with the learner.

## Known limits and gaps

* The throttle is per process (above). No rate limit on `POST /accounts` or on other routes.
* `GET /me` lists one device because `IdentityStore` has no `listDevices`; consents are read from the first 1000 consent events.
* `POST /tombstones` for `source`/`range`/`event` is applied by the store (`applyTombstone`) and the projection is refolded; backups, replicas and the shared linguistic tables are not covered (see REPOSITORY-API-AND-OPERATIONS.md).
* Source restrictions are capped by the wired `sourcePolicy` at ingestion (none wired: all `unknown`) (a client may tighten, never loosen); a reference that claims none is stored without and reads as `unknown`. `POST /events`, `/sync/push`, `/reviews` and `/writing` all do it.
* A learner correction goes to the shared linguistic store (Layer A) as the linguistic service decides (`provisional`, confidence 0.6).
* Event `enrolmentId`s are checked against the learner's enrolments at ingestion (S-06), and the event's `languageId` must match the enrolment's (P-07): otherwise 422.

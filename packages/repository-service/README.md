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
| `src/main.ts` | Node entry: `node:http` bridge + SQLite or Postgres store + engine + linguistics + node crypto + limiter + mailer + metrics; settings from the environment |
| `src/http.ts` | `Refusal`, `respond` (CORS and security headers), the request context, the password rules, `takeLimit` |
| `src/accounts.ts` | accounts hardening: email verification, password reset, session list, `/me/export`, deletion with a grace period, security log |
| `src/throttle.ts` | the per-email sign-in lockout |
| `src/ratelimit.ts` | token buckets (sign-in, sign-up, sync push, general, recovery, export), `resolveClientIp` (`TRUST_PROXY`) |
| `src/metrics.ts` | Prometheus text registry behind `GET /metrics` |
| `src/mailer.ts` | `EmailSender` implementations: SMTP (no dependency), Resend, file outbox, console, memory |
| `src/purge.ts` | `purgeDueAccounts`, `runMaintenance` (also `scripts/ops/purge.mts`) |
| `src/config.ts` | the environment parsed and validated (`serviceConfigFromEnv`) |

## Run it

```
npx vite-node --config server/goread/vite.config.ts packages/repository-service/src/main.ts --port 8790 --data data/repository
```

`--port` (default 8790; `0` picks a free one), `--data` (default `data/repository`, created if missing; the database is
`<data>/repository.sqlite`, or the Postgres database when `DATABASE_URL` is set), `--host` (default `127.0.0.1`). Everything operational (rate
limits, proxy trust, log format, metrics token, mail, account policy, Postgres) is an environment variable: the list is in
`src/config.ts`, the root `.env.example`, `infra/repository/go-repository.env.example` and `docs/ops/DEPLOY.md`. Prints `repository listening on http://127.0.0.1:<port>`.
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
  allowance (put a shared limiter in front, or in the store, before running more than one instance).
* **Rate limits** (token buckets, per process, `src/ratelimit.ts`; wired by `main.ts`, absent from in-process use and tests): sign-in 10/min per IP,
  account creation 5/hour per IP, `POST /sync/push` 60/min per account, every request 600/min per IP (health and metrics exempt, `OPTIONS` free),
  the recovery routes 10/hour per IP plus 3 mails an hour per address, `GET /me/export` 3/hour per account. All configurable
  (`RATE_<NAME>_MAX`, `RATE_<NAME>_WINDOW_S`, `RATE_LIMIT=off`). A refusal is `429 { error: "rate-limited", rule, retryAfterSec }` with a
  `Retry-After` header. The caller's address is the socket's, or with `TRUST_PROXY=1` the last `X-Forwarded-For` entry (Caddy), or with
  `TRUST_PROXY=cloudflare` `CF-Connecting-IP` (the named tunnel); never a header otherwise.
* **Body size**: 1 MB for a signed-in route, **16 KB** for the open ones (sign-up, sign-in, verification, reset), counted on the stream → `413 too-large`.
* **Accounts hardening** (this section's routes need a store with the `security` port; the memory, SQLite and Postgres stores have it, a store without
  it answers `501 unsupported` for them and the old behaviour is unchanged):
  * *Email verification.* `POST /accounts` still returns 201 at once; the account starts unverified and a 24-hour, single-use token is mailed (stored as
    a sha256 only). An unverified account signs in and syncs for `GRACE_DAYS` (7); after that `POST /sessions` answers `403 email-unverified` with a
    `resend` hint, **when verification can be completed** (a mailer that reaches people is configured and `REQUIRE_EMAIL_VERIFICATION` is not 0).
    Sessions signed in before keep working. Accounts that predate the rule were stamped verified by migration 004.
  * *Password reset.* `forgot` always answers 202 and mails a 1-hour single-use token; `reset` sets the password, revokes **every** session, clears the
    sign-in lockout and confirms the address.
  * *Deletion.* `DELETE /me` with `{ password }` schedules it: 202 `{ scheduledPurgeAt }`, every session revoked. Sign-in still works so the learner can
    cancel; such a session may call only `GET /me`, `DELETE /me`, `POST /me/delete/cancel`, `GET /me/export`, `GET /me/security-events`, `GET /me/sessions`,
    `DELETE /me/sessions/:id` and `DELETE /sessions/current` (anything else: `403 deletion-pending` with `scheduledPurgeAt`). After the grace the purge erases the
    learner's events, documents, sessions, devices, enrolments, tombstones, account and address, and writes one audit line with no learner id. The shared
    linguistic tables stay.
  * *Security log*: sign-in, failed sign-in (known account), sign-out, sessions ended, verification sent / done, reset requested / used, export, deletion requested /
    cancelled / purged. Never a password, token, hash or address.

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
| `GET /health` | | `{ ok: true, service: 'repository', version, contractVersion }` plus, where wired, `store` (`sqlite`/`postgres`), `migrations` (newest applied version) and `uptimeSec` |
| `GET /metrics` | | Prometheus text. 404 unless allowed: `Authorization: Bearer <METRICS_TOKEN>` when that is set, otherwise this machine only and not through a proxy. See `docs/ops/MONITORING.md` |
| `POST /accounts` | `{ email, password, displayName? }` | `201 { learnerId, accountId }`; 422 `weak-password`/invalid; 409 `email-taken` (emails are trimmed and lower-cased); 429 `rate-limited`; mails a confirmation token |
| `POST /sessions` | `{ email, password, deviceId, platform? }` | `201 { token, learnerId, expiresAt, verified, emailVerified, verifyBy? , scheduledPurgeAt? }` (`verifyBy` while unverified; `scheduledPurgeAt`, `deletionDueAt`, `deletionRequestedAt` while a deletion is pending); creates/updates the Device; 401 `bad-credentials`; 403 `email-unverified` (past the grace); 429 `too-many-attempts` or `rate-limited` |
| `POST /accounts/verify` | `{ token }` | `200 { verified: true }`; 422 `invalid-token` (unknown, used, expired or replaced). Open |
| `POST /accounts/verify/resend` | `{ email }` | always `202 { accepted: true }`; mails a new token (replacing the old) only to an existing unverified account, at most 3 an hour per address. Open |
| `POST /accounts/password/forgot` | `{ email }` | always `202 { accepted: true }`; mails a 1-hour token to an existing account. Open |
| `POST /accounts/password/reset` | `{ token, password }` | `200 { reset: true, sessionsRevoked }`; 422 `weak-password` (the token is not spent) / `invalid-token`. Revokes all sessions. Open |
| `GET /me/sessions` | | `{ sessions: [{ sessionId, deviceId, platform?, label?, createdAt, lastSeenAt?, expiresAt, current }] }`, live sessions only, newest first |
| `DELETE /me/sessions/:id` | | 204; 404 `no-such-session` (another learner's or an ended one) |
| `DELETE /me/sessions` | | `200 { revoked: n }`: every live session except the current one |
| `GET /me/export` | | the base export (`GET /export`) plus `units`, `analyses` (the shared rows the learner's events point to), `sessions` and `securityEvents`, as `Content-Disposition: attachment; filename="go-repository-export-<date>.json"`. 3 an hour per account (429). Never another learner's data, a hash or a token |
| `GET /me/security-events?limit=` | | `{ events: [{ eventId, kind, at, deviceId?, detail? }] }`, the learner's own, newest first (default 100, at most 500) |
| `POST /me/delete/cancel` | | `200 { cancelled: true }`; 409 `no-deletion-pending` |
| `DELETE /sessions/current` | | 204 |
| `GET /me` | | `{ learner, account: { accountId, email, createdAt, verified, emailVerified, verifyBy?, scheduledPurgeAt?, deletionRequestedAt?, deletionDueAt? }, enrolments, devices, consents }` (`verified` = `emailVerified`; `verifyBy` while unverified; `scheduledPurgeAt` = `deletionDueAt` while a deletion is pending). `devices` holds the session's device only (the port has no device listing). `consents`: latest `ConsentGiven`/`ConsentWithdrawn` per key (`payload.consent`, else `scope`, else `key`, else `general`) |
| `DELETE /me` | `{ password }` | **202 `{ scheduledPurgeAt, deletionRequestedAt, deletionDueAt, graceDays }`**: schedules the deletion (see Accounts hardening), revokes every OTHER session (the one that asked stays signed in, so the page can show the date and offer Cancel); 401 `bad-credentials` (counts against the lockout), 429. Idempotent: the first due date stands. Otherwise `{ confirmEmail }` (the original behaviour, kept): 204 after `store.eraseLearner` and revoking the session; 422 `email-mismatch` unless it equals the account email. If the store leaves the account row, it is disabled and its email and the display name are scrubbed (the port has no account deletion) |
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
`deps.log` (`console.log` in `main.ts`). With `LOG_FORMAT=json` it is one JSON object (`ts, level, msg, requestId, method, path, route, status, ms`, and
`limited` or `error` when they apply; `error` is the error class or SQLSTATE, never a message). Every response carries `X-Request-Id` (the caller's, if it is
8 to 64 characters of `[A-Za-z0-9._-]`, else a UUID). Nothing else is logged; unexpected errors are a bare 500. Details: `docs/ops/MONITORING.md`.

## What is never stored

* **Plaintext passwords**: only the scrypt string. Never in a response, a log, or an export.
* **Tokens**: only `sha256(token)`; the token is shown once.
* **A learner in a shared row** (v3): rows stamped at a lookup (`origin: 'learner-lookup'`) and unit corrections hold no learner id, device, email or time, and `DELETE /me` leaves them. A correction's `reason` is free text without an author.
* **Page text**: `/lookup`'s `sentence` is used to analyse and dropped; only its hash (`sentenceKey`) is kept. Events carry hashes and ids, never passages (`validateEvent`). The learner's own writing lives only in the document store, and is exported and deleted with the learner.

## Known limits and gaps

* The throttle and the rate limits are per process (above); the long-poll notifier is too. Running two instances needs `LISTEN/NOTIFY` and a shared limiter (`docs/ops/SCALING.md`).
* `GET /me` lists one device because `IdentityStore` has no `listDevices`; consents are read from the first 1000 consent events.
* `POST /tombstones` for `source`/`range`/`event` is applied by the store (`applyTombstone`) and the projection is refolded; backups, replicas and the shared linguistic tables are not covered (see REPOSITORY-API-AND-OPERATIONS.md).
* Source restrictions are capped by the wired `sourcePolicy` at ingestion (none wired: all `unknown`) (a client may tighten, never loosen); a reference that claims none is stored without and reads as `unknown`. `POST /events`, `/sync/push`, `/reviews` and `/writing` all do it.
* A learner correction goes to the shared linguistic store (Layer A) as the linguistic service decides (`provisional`, confidence 0.6).
* Event `enrolmentId`s are checked against the learner's enrolments at ingestion (S-06), and the event's `languageId` must match the enrolment's (P-07): otherwise 422.

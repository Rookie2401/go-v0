# Privacy and portability audit: export, deletion, teams, languages, devices, local cleanup, consent, private writing

Date: 2026-10-09. Owner of this file and of `test/audit/privacy.*`: the privacy / offline audit session (brief §22).
Product code changed: **none by the audit itself**; the remediation pass of 2026-10-09 (see "Remediation status" below) fixed P-01 to P-08, P-10 and P-11. P-09 is fixed by the UI pass, not here. The defect table below is kept as the audit found it; the status table says what happened to each.
Update 2026-10-09 (later session): **P-09 is fixed** (see its row). The two P-09 `it.fails` tests were replaced by three plain tests (`P-09: …`, per store) and the suite has 2 fewer defect tests per store; every other row of this document is as audited.
Suite: `npx vitest run test/audit/privacy.*.test.ts` → **6 files, 167 tests, all green** (after remediation; 160 when the audit was written, 28 of them `it.fails`); with the offline lane (`OFFLINE-FAILURE.md`) `npx vitest run test/audit/privacy.*.test.ts test/audit/offline.*.test.ts` → **11 files, 368 tests, all green**, about 3 s. `npx tsc -b` clean for these files.

## How to read this

The tests are adversarial: each one states the *secure or intended* behaviour. Where the product does not have it yet, the test is written with `it.fails`
(its title begins `DEFECT P-nn`): it passes while the defect exists and turns red on the day the defect is fixed, which is the signal to delete `.fails`.
So the suite is green today and every red-to-be is a known defect. Of the 160 privacy tests, **28 are such tests** (11 distinct defects; most run once per store, memory and SQLite).
I verified each of the 28 by removing `.fails` and reading why it fails: every one fails on the intended assertion, not on a setup error
(one, P-10, first failed for a setup reason, an `at` later than the service clock, which the service now refuses; the test was corrected and re-verified).
Tests titled `FINDING` pin behaviour that is accepted or by design (or the harmless half of a defect), so a change to it is noticed.

Targets and how they were driven (nothing is mocked inside the product; the only fakes are the network boundary, the clock and the browser's speech object):

| target | driven with |
|---|---|
| Repository service `packages/repository-service/src/handler.ts` | `createInProcessApi` and raw `Request`s over the REAL stack: real memory store **and** real SQLite store (a file, read back through a second connection, and as raw bytes including its `-wal` file), real projection engine, real linguistics; a fast deterministic password hash (scrypt has its own tests in the security audit) |
| store package `exportLearner` / `importLearner` / `applyTombstone` | directly, into a fresh memory store |
| sync client, durable queue, local documents (`packages/repository-sync`) | the real client, one memory key-value area per device (stands for chrome.storage / localStorage) |
| GoLearn background worker (`session`, `recorder`, `sync`, `profile`, `settings`, clear-local) | the real worker over a fake chrome whose storage survives a worker restart, talking to the real service handler |
| GoPractice application context (sign-in, per-learner prefixed storage, queue, local log, sign-out / forget) | `createContext` over a memory area and over a localStorage stand-in, against the real service |
| GoTell drafts, writing export, `forgetDevice`, remote-assistance consent switch and gate, assistance ladder | the real modules, the real Albanian checker (dictionary files read from `public/`), a SPY standing for the remote assistant |
| GoListen | `createGoListen` / `createAudioDeps` over the real Albanian registry with a spy for the network |

## Headline

Account erasure (`DELETE /me`) is complete and verified: every row of the learner is gone from both stores, every session of every device is dead, the email is released, other learners are untouched,
and (SQLite) no table holds any value of the learner. **Cross-learner isolation held under every attack tried** (160 tests, both stores): a mission-team leader cannot read, write or delete a member's
events, documents or knowledge by id, by route or by guessing team routes, and his own views contain none of the member's values. Private writing is refused to another learner, to a team leader, to an
anonymous request and to a revoked token, and the refusals are indistinguishable from "no such document". Remote AI and remote speech do not fire without consent, and the Repository makes no outbound call at all.

Three findings matter most: **the API's deletion instruction is accepted and ignored** (P-02, medium), **erasure is logical, not physical** (P-11, medium: the learner's email, titles and keys stay in the database file and
its write-ahead log), and **two of the three apps' remote-speech/consent switches recorded no consent event** (P-09, medium; GoTell's did; **P-09 was fixed on 2026-10-09 for the other two, see its row**). The rest are low: the export file cannot be fed to the importer (P-01), a deleted
document keeps its title (P-03), a deletion made through the sync client's documents is not a deletion (P-04), and small gaps in team/language/consent hygiene.

## Moving target

Other sessions edited the product while this audit ran (git showed `handler.ts`, `repository-sync/src/client.ts` and `documents.ts`, `golearn-extension/src/background/{core,recorder,sync,profile}.ts`, `gotell/src/privacy/privacy.ts`,
`gopractice/tellEngine.ts` and others modified). Observed changes that bear on these results: events dated in the future and events from an unknown device or enrolment are now refused by the service (security audit S-03, S-05, S-06);
GoTell's remote-assistance switch now records `ConsentGiven` / `ConsentWithdrawn` (this removed a defect I had expected: it is now a passing test); the GoLearn worker now isolates one refused event from a batch (offline audit, O-06).
Statuses below are as observed at the final run (see the date and counts at the top). Where a defect disappears, its `it.fails` test goes red and the suite says so.

## Remediation status (2026-10-09)

Each fixed defect's `it.fails` test is now an ordinary `it` titled `P-nn (fixed)`, unchanged in its assertions except where noted. Files are under `packages/`.

| id | status | fix (file) | proving test (`test/audit/`) |
|---|---|---|---|
| P-01 | **Fixed** | `repository-service/src/handler.ts` `buildExport` now carries the store export's top-level `learnerId` (the one field `importLearner` needed; `devices` keeps the richer objects, which the importer does not read) | `privacy.export.test.ts` "P-01 (fixed)" |
| P-02 | **Fixed** | `handler.ts` `POST /tombstones`: event / source / range scopes call the store's new `applyTombstone(t)` (records first, then removes the events, drops the learner's knowledge, rewinds the cursor), then the projection is refolded; the answer carries `applied: { events, knowledge }`. A store that cannot delete answers 501 and records nothing. **`{kind:'learner'}` stays a recorded request only** (erasing an account is `DELETE /me`, which asks for the email; pinned by existing tests). The handler imports no store code (conformance rule): the two concrete stores gained an `applyTombstone` method (`repository-store/src/{memory,sqlite,rules}.ts`) | `privacy.deletion.test.ts` "P-02 (fixed)" x2 (both stores), `security.authz.test.ts`, `test/repository/service/lifecycle.test.ts` |
| P-03 | **Fixed** | `repository-store/src/rules.ts` `deletedDocument` drops `title` with the body; the sync client's `LocalDocuments.remove` does the same locally | `privacy.deletion.test.ts` "P-03 (fixed)"; `test/repository/store/conformance.ts` now expects `title` undefined after a deletion (it pinned the old behaviour) |
| P-04 | **Fixed** | `handler.ts` `parseDocument(..., allowDeletion)`: in `/sync/push` a document carrying `deletedAt` is deleted by the store under the same revision rule (`putUnderRevision(..., deleted)`); on `PUT /documents/:id` and `/writing` a client-sent `deletedAt` is still ignored (security test: the server owns server fields). Other devices then receive the tombstone on pull | `privacy.deletion.test.ts` "P-04 (fixed)" |
| P-05 | **Fixed** | `handler.ts` `POST /sync/pull` returns documents with `updatedAt >= documentsSince` (the client already keeps the newest revision, so a re-delivered document is a no-op) | `privacy.deletion.test.ts` "P-05 (fixed)" |
| P-06 | **Fixed** | `handler.ts` `POST /enrolments/:id/end` (sets `endedAt`, appends `EnrolmentChanged {change:'ended'}`, idempotent, 404 for anyone else's enrolment); `RepositoryApi.endEnrolment` | `privacy.team.test.ts` "P-06 (fixed)" and "P-06: POST /enrolments/:id/end ..." |
| P-07 | **Fixed** | service: `prepareEvents` refuses (422 `invalid-events`, path `languageId`) an event whose language is not its enrolment's. Worker: `golearn-extension/src/background/recorder.ts` `attribute` keeps an event of another language than the selected enrolment's on the device under the local pseudonym, to be re-attributed when the learner selects or enrols in that language (the existing `reattributeQueued` path) | `privacy.team.test.ts` "P-07 (fixed)" x2 (service, worker); the language-switching test now records a Spanish event under the Spanish enrolment (it had recorded an Albanian one) |
| P-08 | **Fixed** | `golearn-extension/src/background/session.ts`: an offline sign-out keeps only the token, in `golearn:pending-revoke`; `retryRevocation()` runs at the start of every sync round (alarm, debounce, "sync now") and removes the slot once `DELETE /sessions/current` is answered (or 401). The page status carries `revocationPending: true` meanwhile | `privacy.devices.test.ts` "P-08 (fixed)"; the FINDING test now pins that the pending slot is the only copy of the token; the "clear local" cleanliness test brings the network back before signing out (an offline sign-out keeps the token until it can be revoked, by design) |
| P-09 | Not in this pass | the UI switches belong to the UI session | `privacy.consent.test.ts` (owned by that pass) |
| P-10 | **Fixed** | `handler.ts` `GET /me`: the latest consent decision per key by `at` (a tie goes to the later arrival) | `privacy.consent.test.ts` "P-10 (fixed)" |
| P-11 | **Fixed**, with a stated limit | `repository-store/src/sqlite.ts`: `PRAGMA secure_delete = ON` at open; after an `eraseLearner`, `deleteDocument` or `deleteEvents` (also inside an outer `transaction()`, after its commit) a `wal_checkpoint(TRUNCATE)` empties the log (best effort: a reader holding the log makes it a no-op that the next deletion retries). **No `VACUUM` on every delete** (it rewrites the whole file): the store exposes `compact()` (checkpoint + VACUUM + checkpoint) for the operator, see REPOSITORY-API-AND-OPERATIONS.md section 5. Backups and replicas made before an erasure keep what they kept | `privacy.deletion.test.ts` "P-11 (fixed)" x2, "P-11: deleting one document ..." and "P-11: compact() ..." |

**New finding, not a regression of a fix (P-12, low, accepted, pinned by a FINDING test).** Since the certification fix `registerSurfaces`, a `SelectionLookedUp` event registers the looked-up *surface* in the shared linguistic tables (`units`, `analyses`). Those rows carry no learner id and are not erased with the learner (they are the dictionary, shared by everyone), but a word a learner looked up (a typo, a private name) therefore outlives `DELETE /me` there. `privacy.deletion.test.ts` "the SQL view is clean" no longer treats the surface as a needle for that reason; "FINDING: the word the learner looked up stays in the shared linguistic tables only" pins where it stays. Open: fixing it needs provenance on shared rows (which learner caused a row), which is a schema change for the owner.

## Defects (all reproduced by an `it.fails` test; statuses above)

| id | severity | where | what | evidence (test title starts "DEFECT"; file) | suggested fix |
|---|---|---|---|---|---|
| P-01 | low | `repository-service/src/handler.ts` `buildExport` vs `repository-store/src/export.ts` `importLearner` | `GET /export` and the store's export share the format string `go-repository-export@1` but not the shape: the HTTP file has no top-level `learnerId` and lists full device objects; `importLearner` needs both. Importing the file a learner downloads refuses **every** event (6 of 6 refused in the test). The store-level export round-trips perfectly (events, document bodies, and, after a rebuild, the same knowledge). | export: "the file GET /export returns can be restored by importLearner" | return the store's `exportLearner(...)` shape (plus the extra fields), or make `importLearner` accept both and give them different `format` strings |
| P-02 | **medium** | `handler.ts` `POST /tombstones` | The route answers `201` for an `event`, `source`, `range` or `learner` scope and **deletes nothing** ("records the instruction", service README). `REPOSITORY-API-AND-OPERATIONS.md` §5 promises deletion "per source, range or event through tombstones that the store applies physically (`applyTombstone`)"; nothing calls `applyTombstone`. A learner who asks to forget a book's reading history is told `201` and keeps all of it (events stay in `/events`, in the export and in the projection). The store-level `applyTombstone` itself works (tested: event removed, projection dropped and refolded, the id refused if re-sent). | deletion: "an event tombstone sent to the API removes the event…", "a source tombstone sent to the API removes every event naming that source" | call `applyTombstone` in the handler (it records first, then removes), or stop answering 201 and name the route "request deletion" |
| P-03 | low | `repository-store/src/rules.ts` `deletedDocument` | A deleted document keeps its **title**, id, kind and device. The title is the learner's own words ("My testimony about…"); it stays in the store, in `GET /export` and in the next `/sync/pull` of every device. | deletion: "a deleted document keeps none of the learner's words, title included" | blank `title` in `deletedDocument` (and `kind`/`deviceId` if the receipt needs only the id) |
| P-04 | low | `handler.ts` `parseDocument` ↔ `repository-sync` `LocalDocuments.remove` | A deletion made through the sync client's own document store (documented "pushed like any edit") is sent with `deletedAt`; `parseDocument` keeps no client-sent field except body and title. The server stores an **empty, live** document (revision + 1, title kept): still listed, not tombstoned, and no other device is told it was deleted (they receive an empty body). GoTell is not affected (it calls `DELETE /documents/:id`, tested), so this bites only a host that uses the package's documents directly. | deletion: "a document deleted through the sync client is deleted on the server and on the learner's other device" | accept a `deleted` marker in `/sync/push` and call `deleteDocument`, or have the client call `DELETE` |
| P-05 | low | `handler.ts` `POST /sync/pull` + `repository-sync` `DOCS_SINCE_KEY` | Documents are returned when `updatedAt > documentsSince` (strict) and the client's cursor is the newest `updatedAt` it has seen: a document written in the **same millisecond** as the cursor, after the device pulled, is never delivered. Deterministic with a frozen clock. | deletion: "a document written in the same millisecond as the device's cursor still reaches that device" | `>=` (clients de-duplicate by revision) or a per-learner document sequence like the event `seq` |
| P-06 | low | `handler.ts` (no route) | `Enrolment.endedAt` exists and the apps honour it (`pickEnrolment` ignores ended enrolments) but **no route sets it**: a learner can add a team label and a language and never end an enrolment or leave a team. The team label on an old enrolment is permanent. It confers no access (proved), so this is a control gap, not a leak. | team: "a learner can end an enrolment" (six guessed routes; a FINDING test shows the obvious ones are 404/405) | `POST /enrolments/:id/end` (sets `endedAt`, appends `EnrolmentChanged {change:'ended'}`) |
| P-07 | low | `handler.ts` `prepareEvents`; `golearn-extension/src/background/recorder.ts` `attribute` | The service checks that an event's `enrolmentId` is the learner's own (security S-06, now fixed) but **not that the event's `languageId` is that enrolment's language**; the worker replaces learner, enrolment and device in a content script's event but keeps its `languageId`. With Spanish selected, an Albanian lookup is filed under the Spanish enrolment (observed end to end). Nothing leaks (own data), but "sq and es stay separate" holds only while every client labels consistently. | language: "an event whose languageId differs from its enrolment's language is refused" (service) and "an event whose language is not the selected enrolment's language is not filed under that enrolment" (worker) | check `ev.languageId === enrolment.languageId` in `prepareEvents`; in `attribute`, refuse or keep the event local when the languages differ |
| P-08 | low | `golearn-extension/src/background/session.ts` `disconnect` | Sign-out while the service cannot be reached removes the token locally and stops ("local sign-out happens whether or not the service could be told"). The token is gone, so the revocation can never be retried, and the session stays valid on the server for its 30-day life. The reply is honest (`remoteRevoked:false`) but nothing acts on it. Anyone who copied the token before (a profile backup, a shared machine) keeps a working credential after the learner believes they signed out. | devices: "a token discarded by an offline sign-out is revoked on the server once the network is back" | keep the token in a `pending-revoke` slot until `DELETE /sessions/current` succeeds (or a "sign out everywhere" route), and show the state |
| P-09 | **medium**, **FIXED 2026-10-09** | `golearn-extension/src/background/settings.ts`; `gopractice/context.ts` `setSettings` | The GoLearn extension's remote-speech switch (`golearn:settings`) and GoPractice's (`gopractice:settings`) are local flags: turning them on or off records **no `ConsentGiven` / `ConsentWithdrawn` event**, so the Repository, `GET /me` and an export cannot say what the learner agreed to (the API doc §5 says "consents are events"). Enforcement is correct (nothing is sent without the flag); the record is missing. GoTell's switch records, and records *before* it takes effect (passing tests: refused record keeps it off; withdrawal switches off first). | consent: "switching on remote speech in the extension records a ConsentGiven event…", "…in GoPractice…" | emit the event from `settings.set` / `setSettings` through the existing queue, as `createRemoteConsent` does | **Fix:** `golearn-extension/app/consent.ts` (the Privacy screen's switch calls it; the event goes through `ctx.record`, i.e. the worker's `golearn:record`, which attributes it to the learner and queues it) and `gopractice/screens/consent.ts` (the Settings switch calls it; the event goes through `ctx.record`, the device queue); same payload shape as GoTell (`{ consent: 'remote-speech', scope: 'remote-speech' }`), producers `golearn-ext` / `golearn-app` and `gopractice-review`. Turning ON records first and only then switches on; a refused record, or no signed-in learner in GoPractice, keeps it off with a message; turning OFF switches off first and then records. The worker's `settings.ts` and `context.ts` were not touched (other session): the record is made by the screens, so a caller that sets the flag through `golearn:settings` or `ctx.setSettings` directly still bypasses it (nothing in the apps does).
| P-10 | low | `handler.ts` `GET /me` | The consent state is derived from the last consent event in **arrival (`seq`) order**, not by `at`. A withdrawal made at 07:50 that reaches the service before an older grant from a lagging device (07:40) is reported `given:true`. Every other fold in the projection is order-independent (tested, see OFFLINE-FAILURE.md). | consent: "GET /me reports the learner's LATEST decision by time, however the events arrive" | pick the latest `at` per key (tie-break by `seq`) |
| P-11 | **medium** | `repository-store/src/sqlite.ts` | Erasure is **logical**. Neither a document deletion nor `DELETE /me` sets `PRAGMA secure_delete`, checkpoints the WAL or vacuums. Measured as bytes: straight after `DELETE /me` the `-wal` file holds the email, the document title **and body**, the dedupe key, a payload surface, the learner id and device id; after a checkpoint the main file still holds all of those except the body (6 of 7 probes). SQL shows nothing (every table is clean), so only a file-level reader sees it. | deletion (SQLite): "after DELETE /me and a checkpoint, no byte of the learner's email, title or event keys remains…", "straight after DELETE /me … the write-ahead log does not hold the deleted document body" | `PRAGMA secure_delete=ON` at open; `PRAGMA wal_checkpoint(TRUNCATE)` after `eraseLearner` / `deleteDocument`; say in the operations doc that backups keep what they kept |

## Results by area

PASS = secure behaviour confirmed; DEFECT = see table; FINDING = accepted/by-design behaviour pinned. "Both" = memory and SQLite stores.

### (1) Learner-data export — `privacy.export.test.ts` (22)

| test | result | note |
|---|---|---|
| export holds every event, enrolment, document body and title, knowledge row, tombstone and the device | PASS (both) | event ids equal the log's; format `go-repository-export@1`, contract version, `exportedAt` |
| nothing of another learner | PASS (both) | B's ids, email, account, enrolment, device, document id/body/title, surface, sentence key and every event id are absent from A's export |
| no credential | PASS (both) | no token, no sha256 of a token (two sessions), no password, no hash, no field named `passwordHash`/`tokenHash`; `account` has exactly `accountId`, `createdAt`, `email` |
| download headers | PASS (both) | `Content-Disposition: attachment; filename="go-repository-export.json"`, `Cache-Control: no-store`, valid JSON |
| completeness beyond one page | PASS (both) | 1,250 events (+ the enrolment event) all present, unique |
| deleted document in the export | PASS (both) | listed with empty body and `deletedAt`; the text is absent |
| two languages | PASS (both) | each event keeps its language and enrolment; both enrolments listed |
| store-level round trip | PASS (both) | `exportLearner` → `importLearner` into a fresh store: same ids, same document body, and after `project()` the same knowledge (dimensions, retention, first/last seen, event counts) |
| importing twice | PASS (both) | idempotent (0 stored, N duplicates); no mixing with a second learner |
| the HTTP file is importable | **DEFECT** | P-01 |
| GoTell `exportLearnerWriting` | PASS (both) | all drafts and testimonies with version history and kind; a deleted draft and another learner's draft absent; no token; text bundle contains the writing |

### (2) Deletion — `privacy.deletion.test.ts` (37)

| test | result | note |
|---|---|---|
| document delete: gone from list and get (404), second delete 404, store tombstone (no body, `deletedAt`, revision + 1), later export has no body, raw SQLite has no body | PASS (both) | |
| a stale `PUT` with the old revision cannot revive it | PASS (both) | 409; the body is nowhere in the file |
| title survives deletion | **DEFECT** | P-03 |
| another device sees the deletion: GoTell syncing store | PASS (both) | the other device's `pull().removed` names it, its list and local copy lose it |
| another device sees the deletion: sync package documents | **DEFECT** | P-04 (and a FINDING test shows what does arrive: the text is gone from the server and the device, as an empty shell) |
| same-millisecond document never delivered | **DEFECT** | P-05 |
| an offline edit made before the deletion was known | FINDING | the deleted docId stays deleted; the text survives as an explicit `:conflict:` copy, listed, deletable |
| `DELETE /me`: wrong, missing or empty confirmation | PASS (both) | 422 / 400-422; nothing changes, the session still works |
| `DELETE /me`: erasure | PASS (both) | events, knowledge, documents, enrolments, tombstones, learner row, team membership gone; both devices' tokens 401; sign-in fails; SQLite: every owned table has 0 rows and the dump holds no learner id, email, account id, enrolment id, device ids, body, title, event ids, token or token digest |
| other learners and their team untouched | PASS (both) | the other learner's export is identical before and after; the team keeps its leader |
| email released | PASS (both) | a new account with the same email starts with one `EnrolmentChanged`, sees none of the old data |
| logs | PASS (both) | no log line has the email, id or token; the line is `DELETE /me 204 …` |
| deletion instructions through the API | **DEFECT** | P-02 (the instruction *is* recorded, owned by the caller and exported: PASS) |
| physical erasure in the file | **DEFECT** | P-11 (the SQL view is clean: PASS) |

### (3) Mission teams and team switching — `privacy.team.test.ts` (36)

| test | result | note |
|---|---|---|
| leader's own views (10 views: events, knowledge, documents, export, me, enrolments, preferences, candidates, packs, sync pull) hold nothing of the member | PASS (both) | the member's learner id, account id, email, enrolment, device, token, surfaces, lemma ids, sentence key, document id/title/body and every event id are absent |
| leader names the member on 17 learner-scoped requests (query, body, path; read, write, delete, `DELETE /me`, tombstone, enrol) | PASS (both) | each 403/404/422 with no value of the member in the reply; the member's export is identical afterwards |
| leader `PUT`s the member's document id | PASS (both) | makes the leader's own document; the member's text and revision unchanged |
| guessed team routes (27 paths × GET/POST: `/teams/*`, `/leader/*`, `/reports/*`, `/members/*`, `/stats`, `/aggregate`…) | PASS (both) | all 404/405 and never data. **No team-level or aggregate query exists**: a mission leader has no progress view at all (product gap, not a defect here) |
| peer member and outsider | PASS (both) | see nothing of the member, nor that a team exists |
| joining a team grants no data; a non-member cannot join | PASS (both) | 201 for the insider, 403 for the outsider |
| team switching: team A, team B, no team | PASS (both) | earlier events keep their enrolment, nothing removed or rewritten, four `EnrolmentChanged` recorded, none names another person; the leader still sees nothing |
| enrolling in a team reveals nobody else | PASS (both) | the reply and `/me` hold no peer or leader id/email |
| a learner can end an enrolment / leave a team | **DEFECT** | P-06 |

### (4) Language switching — `privacy.team.test.ts`

| test | result | note |
|---|---|---|
| sq and es events stay separate | PASS (both) | `languageId` filters, enrolment ids, counts |
| projection per language | PASS (both) | every knowledge row's unit id carries its row's language; no sq unit in an es row and the reverse; one observation each |
| candidates per enrolment | PASS (both) | the es list names no sq unit and the reverse |
| preferences per language | PASS (both) | an explicit es `explanationDepth` leaves sq at its default (not explicit) |
| export keeps both | PASS (both) | |
| extension: selecting the other enrolment moves the worker | PASS (both) | status names the language, later events carry the new enrolment, earlier ones keep theirs |
| mismatched language / enrolment accepted | **DEFECT** | P-07 (service and worker) |

### (5) Device synchronisation — `privacy.devices.test.ts`

| test | result | note |
|---|---|---|
| two devices (real queue, log, sync client) see each other's events | PASS (both) | the server holds each once; both local logs hold the union once; queues empty; a further round changes nothing anywhere |
| same `dedupeKey` from two devices | PASS (both) | one stored; the second device is told "duplicate", treats it as success, ends with one |
| new device, 1,300 events | PASS (both) | pulled in pages to the server head |
| GoPractice on two devices | PASS (both) | each records and syncs; both logs hold the union once; pending 0 |
| one device's offline events meet the other's | PASS (both) | none lost after the backoff |

### (6) Local data cleanup — `privacy.devices.test.ts`

| test | result | note |
|---|---|---|
| extension sign-out | PASS (both) | token revoked on the server (401), session key gone, no token or digest in either area, the learner-model cache emptied |
| sign-out alone keeps unsent events | FINDING (by design) | they carry the learner id and must survive to be sent at the next sign-in; "clear local data" removes events, metrics, queue and rejected rows |
| sign-out + clear local | PASS (both) | no learner id, enrolment id, email, token, event, queue row or knowledge row in either area; what remains is exactly `golearn:deviceId`, `golearn:service`, `golearn:sync-status`, `sync:cursor` |
| a second account after a plain sign-out | PASS (both) | the first learner's unsent events become `rejected:` rows, never sent under the second account (and not to the first account either) |
| offline sign-out leaves the server session alive | **DEFECT** (P-08) + FINDING | reports `remoteRevoked:false` honestly |
| GoPractice plain sign-out | PASS (both) | token revoked, session and caches removed; only the learner's own `u:<id>:` rows and the device id remain |
| GoPractice "remove this device's data" | PASS (both) | nothing with the learner id, email, enrolment id or token remains; only `gopractice:deviceId` |
| sign-out offline with unsent events | PASS (both) | reports `pendingLeft` and keeps the rows under the learner's prefix |
| account switch on one device | PASS (both) | the second learner sees none of the first's rows; the first learner's events are sent once after signing back in |
| GoTell `forgetDevice` | PASS (both) | drafts, queue, rejected, quarantine and both sync cursors gone from the learner's area; the sign-in untouched; the account's copy of a document untouched |

### (7) Private writing access — `privacy.writing.test.ts` (12)

| test | result | note |
|---|---|---|
| anonymous, garbage token, revoked token, truncated token, empty bearer | PASS (both) | 401 `unauthorized` on 9 document routes (incl. `/export`, `/sync/pull`, `/writing`), no word of the writing, no document id, no email in any reply |
| another learner and a team leader | PASS (both) | `GET`/`DELETE` of an existing document is 404 with the **identical body** as a document that never existed (no existence oracle); their list is empty; the owner's export is identical afterwards |
| no view they have contains a word of the writing | PASS (both) | list, export, sync pull with `documentsSince` far in the past, events, knowledge, `/me`, GoTell's own `list`/`load`/`exportLearnerWriting` |
| `PUT`, sync push or `/writing` naming the owner's document id | PASS (both) | writes the writer's OWN document; the owner's text and revision unchanged |
| the writing is in no event, knowledge row or log line; SQLite: exactly one table holds it (`documents`) | PASS (both) | |
| the owner can still read and export everything after all of it | PASS (both) | |

### (8) Remote-AI and remote-speech consent — `privacy.consent.test.ts`

| test | result | note |
|---|---|---|
| the Repository makes no outbound call | PASS (both) | a whole life of the service (sign-up, events, lookup, writing, sync, export, deletion) with `fetch` spied: 0 calls; a source scan of service, store, engine and linguistics finds no `fetch`, `XMLHttpRequest`, `http(s).request`, `node:http/https/net/tls/dgram/dns`, `WebSocket`, `sendBeacon`, `child_process` |
| GoTell, no stored value: ladder levels 1 to 6 | PASS | the remote assistant is not called, `fetch` not called |
| only the boolean `true` is consent | PASS | `"true"`, `"yes"`, `1`, `{}`, `[]`, a Promise, `null`, `undefined`, `false` all off |
| turning on records `ConsentGiven` first; a refused record keeps it off | PASS | never persisted, nothing sent |
| with consent the assistant is asked; withdrawing switches off BEFORE the withdrawal is recorded and the next call sends nothing | PASS | order: record given, persist on, persist off, record withdrawn |
| consent events reach the Repository and `/me` reports given, then withdrawn | PASS (both) | the event names the scope only (no text, no provider) |
| GoListen with consent off | PASS | listing, availability and preparing a stimulus make 0 network calls; with consent only its own `/api/speech/*` is asked |
| extension/GoPractice switches: defaults off; a content script cannot turn them on | PASS (both) | |
| extension/GoPractice switches record a consent event | PASS (both) | P-09 **fixed 2026-10-09**: the setup page (`app/consent.ts`, used by the Privacy screen) and GoPractice (`screens/consent.ts`, used by the Settings switch) write `ConsentGiven` / `ConsentWithdrawn` (scope `remote-speech`) through their own event path; ON records first, a refused or impossible record leaves it off; the three tests (`P-09: …`) drive those functions over the real worker / the real GoPractice context and the real service |
| the service holds consent as the learner's own event; `/me` keys; export | PASS (both) | |
| `/me` consent by time, not arrival | **DEFECT** | P-10 |

## Accepted findings (behaviour pinned by a `FINDING` test)

| where | what |
|---|---|
| privacy.deletion | An offline edit on a device that had not yet seen a deletion comes back as a `:conflict:` copy; the deleted document id stays deleted. By the documented merge rule (nothing the writer typed is discarded). |
| privacy.devices | A plain extension sign-out keeps the learner's unsent events (with the learner id) on the device; only "clear local data" removes them. By design and offered as two buttons; on a shared browser the next account can see the *file* but never sends them. |
| privacy.devices | An offline sign-out reports `remoteRevoked:false` and the server session is indeed still alive (see P-08). |
| privacy.team | The obvious enrolment-ending routes are 404/405 (P-06 is real, not a naming miss). |
| privacy.team | There is no team-level query of any kind; "team-scoped queries return only team-level aggregates or nothing" holds as "nothing". |

## What could not be tested here

* A real browser: `chrome.storage` quotas and eviction, real `localStorage` size limits, the service worker's actual kill/restart timing (a restart is simulated by a new worker over the same storage), `navigator.onLine` events.
* TLS, real sockets and the `node:http` adapter (`main.ts`); the Cloudflare/D1 deployment (not built). Concurrency is Promise-level in one process, not parallel connections.
* Backups, replicas and logs outside the repository: P-11 is about the database file only; whatever a host's backups keep is out of reach.
* scrypt (a fast deterministic hash stands in; the security audit covers scrypt).
* The remote AI provider and the Azure speech service do not exist in the product; a spy and a rejecting `fetch` stand in. Whether a future provider retains text is unknowable here.
* IndexedDB / Dexie: used only by the legacy `src/` app, by none of the Go packages.
* The wording of the privacy statements shown to the learner (GoTell's `privacyStatement()` text) was read, not asserted, apart from the claims it makes that are tested above (export, delete, forget this device, team is a label).
* Legal sufficiency of any of this (retention periods, erasure deadlines): not assessed.

## Fixes

The audit changed no product code. The remediation pass (above) fixed everything except P-09 (UI pass) and records P-12. The regression tests are the former `it.fails` tests, flipped to `it` once the fix was real; none was weakened. Four existing tests pinned the old behaviour and were adjusted with their intent kept: the store conformance expectation on a deleted document's title, the language-switching worker test (now records a Spanish event), the FINDING that an offline sign-out leaves no copy of the token, and the clean-up test that signs out offline.

## Files

* `test/audit/privacy.export.test.ts` — (1) export and portability (22)
* `test/audit/privacy.deletion.test.ts` — (2) document, account and instruction deletion; physical erasure (37)
* `test/audit/privacy.team.test.ts` — (3) leader/member, team switching, (4) language switching incl. the extension (36)
* `test/audit/privacy.devices.test.ts` — (5) device synchronisation, (6) local data cleanup (32)
* `test/audit/privacy.writing.test.ts` — (7) private writing access (12)
* `test/audit/privacy.consent.test.ts` — (8) consent (21)
* `test/audit/privacy.support.ts` — the harness (real stack, network boundary `createNet`, devices, GoPractice context, SQLite byte/table probes); `offline.support.ts` builds the worker and review rigs on it

Total after remediation: **167 tests** in 6 files, under 3 s (at audit time: 160 = 132 behaviour tests + 28 `DEFECT` tests documenting 11 defects).

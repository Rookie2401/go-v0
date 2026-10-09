# Offline and failure-behaviour audit: queues, backoff, duplicates, order, sessions, conflicts, corrupted caches, packs

Date: 2026-10-09. Owner of this file and of `test/audit/offline.*`: the privacy / offline audit session (brief §23).
Product code changed: **none by the audit itself**; the remediation pass of 2026-10-09 fixed O-01 to O-07 (see "Remediation status" below). The defect table is kept as the audit found it.
Suite: `npx vitest run test/audit/offline.*.test.ts` → **5 files, 207 tests, all green**; with the privacy lane (`PRIVACY-PORTABILITY.md`) `npx vitest run test/audit/privacy.*.test.ts test/audit/offline.*.test.ts` → **11 files, 367 tests, all green**, about 3 s. `npx tsc -b` clean for these files.

## How to read this

The tests are adversarial: each one states the *intended* behaviour. Where the product does not have it yet, the test is written with `it.fails` (its title begins `DEFECT O-nn`): it passes while the defect exists and
turns red on the day the defect is fixed, which is the signal to delete `.fails`. Of the 207 tests, **20 are such tests** (7 distinct defects). I verified each by removing `.fails` and reading why it fails: every one fails on the intended
assertion. Tests titled `FINDING` pin behaviour that is accepted or by design, or the harmless half of a defect (what is *not* lost), so a change to it is noticed.

How faults were injected (`test/audit/privacy.support.ts` `createNet`): a fetch to the **real** service handler that can (1) reject like a dead connection, (2) answer a given status (503, 500) without touching the server,
(3) let the server process a request and then lose the response (the lost-acknowledgement case). Nothing inside the product is mocked. A "restart" is a new GoLearn worker over the **same** chrome.storage areas (the browser killed the service worker);
a "crash" of a review session or a writing session is a new object graph over the same storage. The clock is explicit; server and worker clocks move together.

| target | driven with |
|---|---|
| Repository service | real handler, real memory **and** SQLite stores (most suites run on both), real projection engine |
| GoLearn background worker (recorder, durable queue, sync client, session, profile cache, gloss) | real worker over a fake chrome with restartable storage; fake dictionary or the real dictionary files from `public/` |
| `repository-sync` client, queue, local documents | the real ones, one memory area per device |
| GoPractice context (queue, local log, sync, sign-in) | `createContext` over memory and over a localStorage stand-in (JSON text) |
| GoReview | real intake/planner, FSRS scheduler, exercise builders, grading, session runner, facts provider over the real Albanian pack |
| GoTell | real Albanian checker, assistance ladder, local / remote / syncing draft stores, a spy for the remote assistant |
| GoListen | real Albanian registry; fake speech object and fake `fetch` |
| language packs | real `installPack` / `verifyInstalled` with the real dictionary files, and a version-bumped copy of the real Albanian manifest |

## Headline

The design's central promise holds under every fault injected: **the learner's evidence is written to disk before anything is sent, is delivered exactly once however often the network, the worker or the acknowledgement fails, and is never dropped**
(no connection, 503s, lost acknowledgements, restarts, expired and revoked sessions, a draft edited on two or three devices). The learner state is a pure, commutative fold: 20 random permutations of 24 mixed events (reviews, lookups, assisted and unassisted writing,
assistance requests) delivered in random batches give knowledge **identical** to the time-ordered batch on both stores, and a rebuild from the log equals the live rows. Duplicate uploads (same id, same `dedupeKey`, racing retries, replayed `/sync/push`) change nothing.
A review session survives a dead page: answered items are kept once, unanswered ones are not credited, and an answer recorded just before the crash is not double-counted on replay.

The failures are all at the **edge of a damaged device**, none in the protocol: a single unreadable row in the durable queue **wedges the whole queue** and the only exit offered deletes the valid events too (O-01, medium); GoPractice lets one event the
service refuses hold back every later event (O-06, medium); a few damaged cache keys (cursor, device id, cache index) cause permanent errors or silent stale state (O-02 to O-04); an unreadable row counts as "waiting" for ever (O-05); and the dictionary cannot say
"offline" (O-07). Nothing here loses data on its own: each is an availability or honesty defect with a stated recovery.

## Moving target

Other sessions edited the product while this ran (git showed `handler.ts`, `repository-sync/src/client.ts`, `documents.ts`, `golearn-extension/src/background/{core,recorder,sync,profile}.ts`, `gotell/src/privacy/privacy.ts`, `gopractice/tellEngine.ts` modified).
Observed changes that bear on these results: the service now refuses events dated in the future, from an unknown device or enrolment (so a review runner clock must agree with the server's, and a device clock gone wrong now produces refused events); the worker now sets a refused event aside
and delivers the rest of the batch (this *was* the defect O-06 for the worker; it is now a passing test, and the same defect remains for GoPractice); a failing document in `/sync/push` is now that document's failure only. Statuses below are as observed at the final run.

## Remediation status (2026-10-09)

The former `it.fails` tests are ordinary `it` tests titled `O-nn (fixed)`. After remediation: `npx vitest run test/audit/offline.*.test.ts` → 5 files, 207 tests, all green. Files under `packages/`.

| id | status | fix | proving test (`test/audit/`) |
|---|---|---|---|
| O-01 | **Fixed** | `repository-sync/src/queue.ts`: `readableRow` (an object holding an event with an id, a kind and a learner); `pending()`, `ordCounter()` and `size()` skip anything else and never throw or delete; the sync client calls the new `setAsideUnreadable()` at the start of every push, which moves each unreadable `queue:` row to `quarantine:corrupt:<id>` as `{ corrupt, key, reason, at, value? }` (the value is kept when the storage layer could parse it and is small), and notes it in `SyncStatus.notes`. **Deviation from the brief's `corrupt:` prefix, on purpose:** the sub-prefix of `quarantine:` is already counted in `SyncStatus.quarantined`, removed by GoLearn's "clear local data" (now also by prefix `quarantine:`) and by GoTell's `forgetDevice` (which lists `QUARANTINE_PREFIX`), so a set-aside row can never outlive "forget this device". The worker's `reattributeQueued` no longer trips over such a row either | `offline.cache.test.ts` "O-01 (fixed)" x5 (worker), x4 (GoPractice), x1 (library) |
| O-02 | **Fixed** | `repository-sync/src/client.ts` `getCursor`: anything but a non-negative whole number is reset to 0 (a re-pull is idempotent) with a note in `SyncStatus.notes`; the documents cursor is repaired the same way | `offline.cache.test.ts` "O-02 (fixed)" x3 (worker), x1 (GoPractice); the FINDING test now expects the round to succeed and no error left behind |
| O-03 | **Fixed** | `golearn-extension/src/background/sync.ts`: a 403 `not-your-device` is treated like a 401 (`needsSignIn`), as GoPractice already did; signing in registers the new device id | `offline.cache.test.ts` "O-03 (fixed)"; the FINDING test now expects `needsSignIn` instead of the opaque error text |
| O-04 | **Fixed** | `golearn-extension/src/background/profile.ts`: the cache index is used only if it is an array of strings; otherwise it is rebuilt from the call (also in `refreshAfterSync`) | `offline.cache.test.ts` "O-04 (fixed)" |
| O-05 | **Fixed** | `size()` counts readable rows only; an unreadable row is set aside and counted in `quarantined` / `corrupt`. The raw text of a row that is not even JSON is not available through the storage port, so only the diagnostic (key, reason) is kept for it | `offline.cache.test.ts` "O-05 (fixed)" |
| O-06 | **Fixed** | once, in `repository-sync/src/transport.ts` (`pushIsolatingRefusals`, `refusedEvents`): a 422 `invalid-events` names the bad events by index, they are reported as refused outcomes (the client sets them aside as `rejected:` rows) and the rest is sent again in the same round. GoPractice's `defaultTransport` (`gopractice/context.ts`) and GoLearn's worker (`background/sync.ts`, refactored onto the shared helper) both use it | `offline.sync.test.ts` "O-06 (fixed)" (both stores); the FINDING test now expects `pending 0, rejected 1` |
| O-07 | **Fixed** | `golearn-extension/src/background/gloss.ts`: the shard `fetch` counts connection failures (a throw, a 5xx); when the pack runtime swallows one and finds no gloss, the reply is `reason:'offline'` ("try again"), not `'not-found'`. The pack runtime (`language-packs`) is unchanged | `offline.matrix.test.ts` "O-07 (fixed)"; the degraded-offline test now expects `'offline'` |

## Defects (all reproduced by an `it.fails` test; statuses above)

| id | severity | where | what | evidence (test title; file) | suggested fix |
|---|---|---|---|---|---|
| O-01 | **medium** | `repository-sync/src/queue.ts` (`pending()` → `sorted()`, `ordCounter()`); surfaces in the GoLearn worker and GoPractice | One unreadable row under `queue:` (a string, `null`, `{}`, an event that is `null` or has no id; for GoPractice any of these as valid JSON) makes `pending()` throw (`Cannot read properties of null (reading 'ord')`). The worker's `status` and every sync then answer `internal`, and **all the other, valid, unsent events are stuck behind the one row**; new events can fail to enqueue too (`null`). The only exit the UI offers, "clear local data", deletes the valid events with the damaged row (3 rows removed in the test, none ever reaches the service). The sync README says "nothing is ever dropped". | cache: "one queue row that is a string / null / an empty object / an event that is null / an event without an id does not stop the other queued events from being delivered" (worker, 5); GoPractice: "…a JSON string / JSON null / an empty object / an event without required fields…" (4); library: "pending() skips (and keeps) a row under queue: that is not a queue row" (1); FINDING: "the 'clear local data' way out discards the valid unsent events" | validate each row's shape in `pending()` / `ordCounter()`; move a row that fails to `quarantine:` (kept, reported in status) instead of throwing |
| O-02 | low | `repository-sync/src/client.ts` `getCursor` / `pullImpl` | A damaged `sync:cursor` (a string, a negative number, `NaN`) is sent as `afterSeq`; the service answers 422; the pull fails on **every** round, for ever, and `lastError` never clears. Push still works (it comes first), so no event is lost (FINDING test), but every `syncOnce` reports failure and the worker's learner-model refresh (run only after a fully good round) never happens. | cache: "a sync cursor that is a string / a negative number / the string NaN is repaired…" (3) and GoPractice "a damaged sync cursor is repaired…" (1) | treat a cursor that is not a non-negative integer as 0 (a re-pull is idempotent) |
| O-03 | low | `golearn-extension/src/background/sync.ts` / `store/index.ts` `getDeviceId` | The device id has its own storage key and the server session is bound to it (`/sync/push` answers 403 `not-your-device` for any other). If the key is lost or damaged while the session survives, the worker invents a new id and **every sync is refused with 403**, shown as `sync push refused: not-your-device` with `needsSignIn:false`: the learner is never told to sign in again. Nothing is lost (FINDING test: signing in again delivers every event once). GoPractice treats the same 403 as "sign in again" (tested). | cache: "when the device id is lost, the learner is told to sign in again (or the sync repairs itself)" | treat 403 `not-your-device` as `needsSignIn` (as GoPractice does), or keep the device id inside the session record |
| O-04 | low | `golearn-extension/src/background/profile.ts` `remember` | `golearn:know-index` is read with `.filter` / spread without an array check. When it is damaged, `remember()` throws **after** the Repository has answered; the throw is reported as `offline` and the rows the service returned are thrown away: every learner-model lookup says offline with no data until the next sign-in clears the cache. | cache: "a damaged learner-model cache index is ignored and rebuilt; the lookup returns the Repository's rows" | `Array.isArray` guard; rebuild the index |
| O-05 | low | `repository-sync/src/queue.ts` `size()` vs `pending()`; GoPractice | A queue row that is not even JSON is dropped by the storage layer (the other events are delivered), but `size()` counts keys while `pending()` reads rows, so after a complete successful sync the header still says "1 waiting to sync" for ever; the row is neither sent, nor reported as rejected or set aside, nor removable. The data in it cannot be recovered; the defect is the permanent false count and the silence. | cache (GoPractice): "an unreadable queue row is reported (rejected / set aside) and does not count as an event still waiting" | count readable rows only; report the unreadable ones |
| O-06 | **medium** | `gopractice/context.ts` `defaultTransport`; `repository-sync` Transport contract | The service refuses a whole `/sync/push` batch when any event in it is invalid (`422 invalid-events`, "nothing was stored"). GoPractice's transport turns that into a failure of the whole batch, retried unchanged every round, for ever: **one event with a clock gone wrong (or one the service does not accept) holds every later event back**. Nothing is dropped (FINDING test). The GoLearn worker now isolates the bad event (passing test); the shared client/transport still does not. | sync: "GoPractice: an event the service refuses does not hold back the good events queued with it" (both stores) | give the generic transport the worker's treatment: read the 422 `issues` indexes, resend the rest, report the bad ones as `rejected`; ideally do it once in `repository-sync` |
| O-07 | low | `golearn-extension/src/background/gloss.ts` / `language-packs/src/runtime.ts` `gloss` | When a dictionary shard cannot be fetched, the pack runtime swallows the failure and the gloss service answers `reason:'not-found'` ("this word is not in the dictionary"), never `'offline'`. The `'offline'` reply path exists in `gloss.ts` and is unreachable, so the card cannot tell "the word is unknown" from "you are offline, try again". | matrix: "a gloss that failed only because the network is down is reported as 'offline', not as 'not found'" | let `gloss` report a fetch failure (a third result or a thrown marker) |

## Results by scenario

PASS = intended behaviour confirmed; DEFECT = see table; FINDING = accepted/by-design behaviour pinned. "Both" = memory and SQLite stores.

### No connection — `offline.sync.test.ts` "no connection: a GoLearn encounter is queued durably and sent exactly once"

| test | result | note |
|---|---|---|
| the encounter is recorded and on disk before anything is sent; the failed sync is reported | PASS (both) | a `queue:<id>` row in chrome.storage.local at once; the debounced sync fails; `status.sync` = pending 1, online, not "needs sign-in", `lastError` set; the row counts the attempts and keeps the error; the server has nothing |
| the browser kills the worker while offline, twice | PASS (both) | the restarted worker still reports pending 1; when the network returns exactly one copy reaches the server; the queue empties; more syncs and restarts add nothing |
| the acknowledgement is lost (server stored it, answer never arrived) | PASS (both) | the first sync reports failure (the device cannot know), the server already has one copy, the retry is told "duplicate", the queue empties, still one copy |
| six encounters across restarts | PASS (both) | all arrive, once each, in recording order |

### Repository unavailable (503) and back — "Repository unavailable (503) and back…"

| test | result | note |
|---|---|---|
| backoff schedule | PASS (both) | the harness client (jitter 0) waits 1 s, 2 s, 4 s after successive failures; inside the window `syncOnce` returns `backoff` and **makes no request** (call log unchanged); the queue keeps every event in order with `attempts` = 3 |
| cap | PASS (both) | 14 failures later the delay is the maximum (60 s in the harness). The extension's own parameters (2 s base, 5 min cap, jitter 0.5) were read from source, not asserted |
| service back | PASS (both) | the next attempt sends all five once; the server log equals the queue order; a further sync adds nothing |
| failure in the middle of a large queue (450 events) | PASS (both) | the first 200 stay acknowledged, 250 stay queued, the retry sends only the 250 |
| the worker's 503 | PASS (both) | a retryable error, never "sign in again"; the event arrives once the service answers |
| a 500 | PASS (both) | stays queued; not marked rejected |

### Duplicate upload — "duplicate event upload"

| test | result | note |
|---|---|---|
| same id in two requests | PASS (both) | stored once; the outcome is `duplicateOf`; **the log (seq, recordedAt) and the projection are byte-identical** before and after |
| retried batch of old and new; same id twice in one batch; same `dedupeKey` under another id | PASS (both) | only the genuinely new event is stored (1 stored, 4 duplicates) |
| three identical uploads at once | PASS (both) | one stored, no error |
| `/sync/push` replayed | PASS (both) | every outcome "duplicate"; projection unchanged |

### Out-of-order events — "events arriving out of order"

| test | result | note |
|---|---|---|
| later `at` first, then earlier | PASS (both) | same knowledge as time order; the log keeps **arrival** order (`seq`), as designed |
| property, 20 seeds × 2 stores | PASS (both) | 24 events over three units and a week (CardReviewed ± correct, SelectionLookedUp, assisted/unassisted ProductionRecorded, AssistanceRequested), time-ordered in one batch vs shuffled in random batches of 1 to 5, each followed by the service's own projection: identical dimensions, retention, uncertainty, first/last seen, event counts, and identical inferred preferences. A sanity check asserts the projection is not empty |
| rebuild equals live | PASS (both) | events in reverse time order one by one; clear the knowledge and the cursor; the engine's refold equals the live rows |

(The one fold that is *not* order-independent is `GET /me`'s consent, see P-10 in `PRIVACY-PORTABILITY.md`.)

### Expired or revoked session (401) — "expired or revoked session (401)"

| test | result | note |
|---|---|---|
| bare client, revoked token | PASS (both) | every attempt fails with 401, the queue keeps everything, nothing reaches the server; a client over the same queue with a fresh token flushes both events once |
| GoLearn worker, revoked on the server | PASS (both) | `skipped:'needs-sign-in'`, `status.needsSignIn`, "sign in again" message, pending 3; two more syncs make **no request** (it does not hammer a service that said 401); the state survives a worker restart; signing in again flushes everything once |
| GoLearn worker, expired by the clock (31 days) | PASS (both) | events still queue; the expired token never leaves the device (call log unchanged); signing in flushes |
| GoPractice | PASS (both) | `authExpired`, queue kept, signing in again sends each event once, flag clears |
| the 401 reply itself | PASS (both) | no data, no learner id, no email |

### Multi-device conflicts on a draft — "two devices edit the same draft offline"

| test | result | note |
|---|---|---|
| GoTell, two devices offline | PASS (both) | the first to sync keeps the draft id; the other becomes `<id>:conflict:<device>:<rev>` titled "(conflict copy from laptop)"; both texts, in full and with version history, are on the server and on both devices; nothing pending afterwards |
| sync package documents | PASS (both) | same rule; both devices converge on the same two documents; no dirty documents left |
| three devices, three offline edits | PASS (both) | three texts, none lost |

### A refused event must not hold back the others — "one event the service will not accept…"

| test | result | note |
|---|---|---|
| GoLearn worker (future-dated queued event) | PASS (both) | rejected row kept and reported; the good events delivered in the same round |
| GoPractice | **DEFECT** | O-06 (and a FINDING test shows all three events stay queued, with the service's own words as the error) |

### Remote AI unavailable — `offline.apps.test.ts`

| test | result | note |
|---|---|---|
| network down / 503 / garbage answer / empty list / never answers (timeout) | PASS | level 6 is a clear refusal ("the remote assistant could not be used… nothing from it is shown"); the ladder never throws |
| levels 1 to 5 with a dead remote vs no remote | PASS | **byte-identical**: the local feedback never depended on it; the analysis is the same function of the text |
| a sentence the pack can model | PASS | level 6 still answers (source `pack-sentence`) with the remote dead |
| no dictionary either (every fetch fails) | PASS | the checker still finds the definiteness error; only glosses are lost (and `gloss` answers `undefined`, not an error) |

### Speech synthesis unavailable — `offline.review.test.ts`

| test | result | note |
|---|---|---|
| no device voice, no consent | PASS | `canPronounce:false`; the gaps are listed; the device voice is shown as "none installed" (not hidden); the remote voices as "needs consent" (not silently tried) |
| pronouncing | PASS | `ok:false` with a message and advice, **never** the learner's text in it, never an exception, no playback event; an unknown language also fails cleanly |
| consent given, network down | PASS | remote voices "unavailable"; pronouncing still fails cleanly |
| GoPractice's view | PASS | `available:false`, `eligibleForEvidence:false`, a reason; the stimulus is `unavailable` |
| a device voice, offline | PASS | works with no network at all; labelled synthetic (practice, never evidence) |
| the review session (both) | PASS (both) | with listening switched on and listening cards in the deck: the planner asks for no audio item, the written items run to the end, no `ListeningAssessed` event exists |
| audio fails at the last moment | PASS (both) | no rating, no listening evidence |

### Interrupted review session — "an interrupted review session"

| test | result | note |
|---|---|---|
| page dies after two answers | PASS (both) | `recover()` returns the saved session at index = after the second answer, with both results; the answered items have been credited exactly once (reps 1), **the unanswered ones 0**; finishing the recovered session answers each remaining item once; nobody is credited twice |
| the page dies after the answer was recorded but before the session state was saved | PASS (both) | nothing to recover; the same plan starts again from item 0; the repeat collides with the deterministic id `gr:<session>:0:CardReviewed`: one observation, reps 1 |
| the Repository cannot be reached when recording | PASS (both) | the answer throws, nothing advances, the same item stays current; answering later succeeds once |
| a skipped item; a session abandoned half-way | PASS (both) | the skip writes nothing and the item stays due; the rest stay due, not postponed or falsified; tomorrow's plan still contains it |
| recoverable sessions | PASS | an open one is listed and a finished one is not |

### Interrupted writing session — "an interrupted writing session"

| test | result | note |
|---|---|---|
| autosave on the device, connection lost, device closed | PASS (both) | the reopened app has the newest text and all three versions; `pendingPush` names the draft; **the account still holds revision 1** and none of the later text until the push; the push then makes revision 2 with no conflict with itself |
| an unsaved device edit | PASS (both) | no event and no document row on the account |
| a draft save whose acknowledgement is lost | PASS (both) | the account has revision 2, the device still pending; the retry recognises its own text: no conflict copy of itself, one revision, one document |
| killed mid-session, the other device saved meanwhile | PASS (both) | one conflict copy; both texts on the account |

### Language-pack update — "a language-pack update"

| test | result | note |
|---|---|---|
| the bumped manifest is valid | PASS | so the test is about the update |
| installed record replaced | PASS (both) | `verifyInstalled(old)` current, `verifyInstalled(new)` installed but **not current** (the app can say "reinstall"); after the update the reverse; exactly one record |
| learner state intact | PASS (both) | the whole account export (events, knowledge, documents, enrolments naming the version they started on) identical before and after |
| update attempted offline | PASS (both) | `dictionary-unreachable`; the stored record is byte-identical; the old pack still verifies and its analyser still runs |
| dictionary does not match | PASS (both) | `dictionary-mismatch`; the old record kept |
| storage failure while recording | PASS (both) | `storage-failed`, no claim of success |
| corrupted installation record | PASS (both) | six garbage shapes are never "current"; a reinstall repairs |

### Corrupted local cache — `offline.cache.test.ts`

| test | result | note |
|---|---|---|
| GoLearn: settings, sync-status, local-log rows, rejected rows, dictionary shards, session-area caches damaged (10 variants) | PASS | the worker starts, answers, records a new event, and delivers the old ones exactly once |
| a queued event with damaged **content** | PASS | refused by the service, set aside as `rejected:<id>` and reported; every other event delivered |
| a queue row without `ord` | PASS | still sent |
| damaged session record | PASS | read as "not signed in" (honest, `connected:false`); events recorded meanwhile are kept under the local pseudonym; signing in again sends every one once |
| damaged service address | PASS + FINDING | ignored (not one request to it); reported as "sign in again"; signing in rewrites it and the queue is delivered once; repairing the address alone leaves "needs sign-in" until sign-in (an unnecessary password prompt, nothing lost) |
| a queue row that is unreadable | **DEFECT** | O-01 (workers and GoPractice and the library), O-05 |
| damaged cursor, device id, cache index | **DEFECT** | O-02, O-03, O-04 (with FINDING tests for what survives) |
| GoPractice over localStorage | PASS | damaged profile cache, log head and a log row: opens, records, delivers once; a damaged session record signs out (records are refused while signed out, the learner's queue stays under its own prefix and is delivered after sign-in); a lost device id is shown as `authExpired` and repaired by signing in |

## What works offline (per capability)

Every row is backed by a test; titles are in `offline.matrix.test.ts` unless another file is named. Legend: **works** = full function without the network; **degraded** = works with a stated loss; **needs connection** = cannot work without it, and the app says so.

| capability | offline | what happens, and the test |
|---|---|---|
| Reading assistance: the card (lemma, morphology, constructions, phrase notes) | **works** | computed on the device by the pack's analyser; 0 network calls with `fetch` replaced by a counter. "WORKS offline: the card itself … needs no network at all" |
| Reading assistance: grammar explanations | **works** | from the pack manifest in the bundle. "WORKS offline: the grammar explanations of the card come from the pack manifest in the bundle (no fetch)" |
| Reading assistance: dictionary gloss, shard fetched once | **works** | kept in chrome.storage.local with its licence line, survives a worker restart. "WORKS offline: a dictionary gloss for a word whose shard was fetched once, even after the worker restarts" |
| Reading assistance: gloss for a shard never fetched | **degraded** | no gloss, no error, no invented meaning, but reported "not found" instead of "offline" (O-07). "DEGRADED offline: a gloss from a dictionary shard never fetched…" |
| Reading assistance: the learner-model line ("you have met this word…") | **degraded** | the last cached answer marked `stale` with `error:'offline'`, or nothing; the card never waits for it. "DEGRADED offline: the learner-model line of the card…" |
| Sign-in the first time | **needs connection** | a plain message, nothing stored. "NEEDS CONNECTION: signing in the first time…" |
| Already signed in: reading and recording | **works** | until the session expires (30 days); events are attributed to the account. "WORKS offline: a learner who is already signed in keeps reading and recording" |
| Encounter capture | **works** | durable queue, sent exactly once later; survives worker restarts and a lost acknowledgement. `offline.sync.test.ts` "no connection: a GoLearn encounter is queued durably and sent exactly once" (4 tests per store) |
| Review session: written exercises | **works** | built from the installed pack on the device (the Repository's unit lookup is optional); answers queue and are sent on return, each once. "WORKS offline: a review session of written exercises…"; `offline.review.test.ts` "a review session with the Repository unreachable" |
| Review session: building the plan from the Repository's candidates | **needs connection** | `GET /candidates` is unreachable; the deck-only plan (due cards) still works. "NEEDS CONNECTION: building tomorrow's plan from the Repository's candidates…" |
| Review session: interrupted | **works** | recoverable, no double credit. `offline.review.test.ts` "an interrupted review session" |
| Listening: Albanian today | **degraded (online and offline alike)** | no recording and no device voice: listening items are not offered at all; the session runs with written items. "DEGRADED always for Albanian today…"; `offline.review.test.ts` "the review session when audio is unavailable" |
| Listening: a device voice for the language, when one exists | **works** | works with no network; labelled synthetic (practice, never evidence). "WORKS offline (when a local voice exists)…" |
| Listening: remote (Azure) voices | **needs connection** | even with consent they are reported unavailable. "NEEDS CONNECTION: the remote (Azure) voices…" |
| GoTell: checking a draft (issues, hints, corrections, alternatives) | **works** | the checker is the pack's adapter on the device; only glosses need the dictionary. "WORKS offline: checking a draft…"; `offline.apps.test.ts` "analysis does not need the dictionary either" |
| GoTell: writing and autosaving | **works** | on the device, pending push; the account's copy is unchanged until the push. "WORKS offline: writing and autosaving…"; `offline.apps.test.ts` "an interrupted writing session" |
| GoTell: the account's copy, drafts from another device | **needs connection** | list, load and save of the account's documents throw when unreachable. "NEEDS CONNECTION: the account's copy of a draft…" |
| GoTell: deleting a draft | **degraded** | gone on this device at once; the deletion is queued and the account still holds the text until the connection returns. "DEGRADED offline: deleting a draft…" (privacy-relevant: see P-11 and the document-deletion tests in `PRIVACY-PORTABILITY.md`) |
| GoTell: remote assistance | **needs connection** | refused with a clear reason; local levels unaffected. `offline.apps.test.ts` "remote AI unavailable…" |
| Export: the draft being edited (json / text / markdown) | **works** | from the device. "WORKS offline: the draft the learner is looking at exports…" |
| Export: the device's own copy of the learner's events | **works** | readable JSON of the local log. "WORKS offline: GoLearn's local copy of the learner's own events…" |
| Export: the whole account, and all of the writing | **needs connection** | `GET /export` rejects; `exportLearnerWriting` returns `{ok:false}` "cannot be reached". "NEEDS CONNECTION: the complete account export…" |
| Export: seeing what is waiting to be sent (GoPractice) | **degraded** | the pending count is shown; there is no whole-account export on the device. "DEGRADED offline: a GoPractice device lets the learner see what is waiting…" |
| Language packs: is the pack installed and current | **works** | a storage read |
| Language packs: install or update | **needs connection** | a failed update leaves the old pack installed and working. "WORKS offline: knowing whether the pack is installed…; NEEDS CONNECTION: installing or updating it"; `offline.apps.test.ts` "a language-pack update" |

## What could not be tested here

* A real browser: `chrome.storage` quota errors (only a `persist.set` failure in the runner and the installer's `storage-failed` were simulated) and eviction, `navigator.onLine` / the `online` and `offline` window events (GoPractice's listeners are wired in the fake window but not exercised), the service worker's real kill timing (a restart is a new worker over the same storage), and the worker's own 15-second request timeout (the tests supply their own `fetch`, so the default `withTimeout` path is not taken).
* The network: only whole-request failures, a fixed status, and a lost response; no partial bodies, slow links, TLS/DNS failures, redirects, or captive portals that answer `200` with HTML (the typed client would report a non-JSON body as an error; not exercised).
* Parallel connections: concurrency is Promise-level in one process (the "three identical uploads at once" test), not several sockets to a SQLite file.
* The speech output itself and the remote speech/AI services (none exist in the product; fakes and spies only).
* IndexedDB / Dexie: used only by the legacy `src/` app, by none of the Go packages. The localStorage stand-in follows `createWebKeyValueArea` (JSON text, `null` for unreadable rows).
* Cache corruption was run on the memory store only (the damage is on the device; the server side is store-independent and covered by the suites that run on both).
* Exact FSRS numbers and the quality of the review items (other audits).
* The default product backoff parameters of the extension (2 s base, 5 min cap, jitter 0.5) and GoPractice's (2 s base, 120 s cap, jitter 1) were read, not asserted numerically.

## Fixes

No product code was changed. O-01 and O-05 are the same few lines in `repository-sync/src/queue.ts`, O-06 is the worker's `refusedEvents` treatment moved into the shared transport, and O-02 / O-03 / O-04 are one-line guards in files other sessions are editing; the owner should decide. When a defect is fixed its `it.fails` test goes red; remove `.fails` and the suite stays as the regression test.

## Files

* `test/audit/offline.sync.test.ts` — no connection, 503 and back, duplicates, out of order, expired sessions, draft conflicts, refused events (94)
* `test/audit/offline.review.test.ts` — speech unavailable, audio-less sessions, interrupted sessions, unreachable Repository (21)
* `test/audit/offline.apps.test.ts` — remote AI unavailable, interrupted writing, language-pack update (30)
* `test/audit/offline.cache.test.ts` — corrupted local caches: GoLearn worker, GoPractice over localStorage, the sync queue (40)
* `test/audit/offline.matrix.test.ts` — the "what works offline" table (22)
* `test/audit/offline.support.ts` — worker rig with restartable storage, GoReview session rig; `privacy.support.ts` — the shared real-stack harness and `createNet`

Total: **207 tests** in 5 files (187 behaviour tests that pass on intended behaviour + 20 `DEFECT` tests documenting 7 open defects), about 3 s.

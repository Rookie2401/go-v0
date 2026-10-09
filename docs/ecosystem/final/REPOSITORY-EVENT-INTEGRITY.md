# Repository event integrity — validation, dedupe, replay, deletion, export

Status: 2026-10-09. Sources: `REPOSITORY-DATA-MODEL.md`, `REPOSITORY-API-AND-OPERATIONS.md`, `packages/repository-contract/src/{index,payloads}.ts`, `packages/repository-service/src/handler.ts` (`prepareEvents`),
`packages/repository-store/README.md`, `audit/SECURITY.md`, `audit/PRIVACY-PORTABILITY.md`, `audit/OFFLINE-FAILURE.md`, `audit/END-TO-END-INTEGRATION.md` steps 38–41. Test runs by me on 2026-10-09 at 10:10–10:11 are marked "(run)".
The learner's evidence is an append-only log; derived state is recomputed from it; no application writes derived state.

## 1. Validation at the write boundary

| rule | where | tests |
|---|---|---|
| text keys (`text`, `sentence`, `sentenceText`, `passage`, `content`, `body`) refused at **any depth**, case and separators ignored; any other string over 4 words or 300 characters refused; free-text fields (`reason`, `label`, `answer`, `expected`, `voiceId`, `message`) up to 1,000 characters; nesting past 8 levels refused (S-01, fixed) | `payloads.ts` `scanForText`, called by `validatePayload` and for `subject` by `validateEvent` | `security.events` "FIXED S-01" (both stores); `security.fixes` "S-01" |
| surfaces at most 4 words and 120 characters | `MAX_SURFACE_WORDS`, `MAX_SURFACE_CHARS` | `security.events` "surfaces of 5+ words" (space, tab, newline, NBSP, em-space, 121 chars all 422) |
| identifier caps: `id`, `enrolmentId`, `languageId`, `varietyId`, producer version and device, sentence/card/draft ids, `readerId` at 200; unit ids and source title at 300, at most 200 unit ids; locator 2,048 (S-07, fixed) | `validateEvent` | `security.events` "FIXED S-07" (10 fields x 2 stores) |
| future timestamps: `at` at most 5 minutes ahead of the server clock (`at-in-future`); a sync push may run as far ahead as the skew it declares in `clientTime`, never past a day (S-03, fixed) | `prepareEvents`, `MAX_FUTURE_SKEW_MS` | `security.events` "FIXED S-03" |
| device binding: `producer.deviceId` is the session's device or one registered to the learner (S-05) | `prepareEvents` | `security.events` "FIXED S-05" |
| enrolment binding: `enrolmentId` is one of the learner's own enrolments (S-06); the event's `languageId` must equal that enrolment's language (P-07, code present in `handler.ts`) | `prepareEvents` | `security.events` "FIXED S-06"; the P-07 tests in `privacy.team.test.ts` were red in my run (see section 6) |
| producer rules: `producer.app` may never be `repository` for a new event (S-04); `/reviews` accepts only review and listening families; `/writing` only `ProductionRecorded`; arrays are not objects (S-11) | `prepareEvents`, `validateEvent` | `security.events` "FIXED S-04", "FIXED S-11"; "`/reviews`, `/writing`, `/sync/push` family rules" |
| learner binding: another learner's id anywhere is 403 before any store access; a batch with one invalid event is refused whole (422 with per-index issues) | `assertSelf`, `prepareEvents` | `security.authz`, `security.events` "batch atomicity" |
| extension worker: a content script may record only six reader kinds; learner, enrolment, device and version are replaced by the worker; 6,000-byte limit; a long selection stores at most 4 unit ids, no `form:` ids (S-02, fixed in the worker only) | `golearn-extension/src/background/{recorder,wordids}.ts` | `security.extension`, `security.reader` "FIXED S-02" |

Server-owned fields (`recordedAt`, `seq`) from a client are dropped. Request bodies over 1 MB are 413; nested more than 24 levels is 400.

## 2. Dedupe

* The store refuses a second event with the same `id`, and a second event of the same learner with the same `dedupeKey`; the answer is `duplicateOf`, which a sync client treats as acknowledged (`security.events`; `offline.sync` "duplicate event upload", 4 tests x 2 stores).
* An id owned by another learner is refused without a `duplicateOf` (existence oracle for random UUIDs only, SECURITY A-04). The same `dedupeKey` from two learners stores both.
* Retried batches, a lost acknowledgement, racing retries and a replayed `/sync/push` change nothing, byte-identical log and projection (`offline.sync`; certification step 41: re-sending the whole history stores nothing).
* `foldDeck` and the engine de-duplicate on id only; the `dedupeKey` guard lives in the store (a repeated key under another id fed straight to `foldDeck` is applied twice, `scheduler.deck`).

## 3. Commutative projection and replay equality

The fold uses sums and maxima only, so arrival order cannot change the result; a rebuild from the log must equal the live rows (`REPOSITORY-ARCHITECTURE-DECISION.md` R5).

| claim | test |
|---|---|
| 20 random permutations of 24 mixed events delivered in random batches of 1 to 5 equal the time-ordered batch (dimensions, retention, uncertainty, first/last seen, counts, inferred preferences), memory and SQLite | `test/audit/offline.sync.test.ts` "events arriving out of order": "property (seed 1)" to "(seed 20)", plus "a rebuild from the log equals the live rows after out-of-order arrival" (run: passed) |
| ten shuffled arrival orders of 8 events are identical; rebuild equals live on both stores | `test/audit/model.dimensions.test.ts` (audit M6, M7) |
| a replay of the whole history (units and aliases copied, events appended in scrambled order) into a fresh store and engine equals the live rows; the live engine's own rebuild equals its incremental state | certification "39–40. replaying the history into a fresh projection reproduces the current learner state exactly" (run: passed) |
| the history holds more than 8 valid events from three producers, unique ids and seqs, no sentence text and no token | certification "38." (run: passed) |
| a duplicate upload stores nothing and leaves the knowledge row unchanged | certification "41. no duplicate credit ..." (run: passed) |

Not order-independent: `GET /me` consent, which was derived in arrival order (P-10). The handler now takes the latest by `at` (read in source, line ~430); the audit's test status for it was not re-run.
The projection weights are hypotheses and uncalibrated (engine README); equality of replays says nothing about whether the numbers predict learning.

## 4. Tombstones and deletion

`applyTombstone` (store) records the tombstone first, then removes events physically (`learner`, `source`, `range`, `event` scopes), clears the learner's projection rows and rewinds the cursor to seq 0; an event-scope tombstone blocks re-appending that id.
Document deletion blanks the body and (P-03) the title and keeps a receipt. The audit found the API route recorded instructions but deleted nothing (P-02) and that erasure was logical in SQLite (P-11).
In my run of `privacy.deletion.test.ts` (10:10, all passed) the titles read "P-02 (fixed)", "P-03 (fixed)", "P-04 (fixed)", "P-05 (fixed)" and "P-11 (fixed)": `handler.ts` now calls `applyTombstone`, `sqlite.ts` sets `PRAGMA secure_delete = ON` and truncates the WAL. These changes are newer than the audit document.

## 5. Export format

`GET /export` and `exportLearner` return `go-repository-export@1`: events (with `seq` and `recordedAt`), enrolments, device ids, knowledge (derived, for inspection), preferences, documents with full bodies (deleted ones empty with `deletedAt`), tombstones.
Never a password hash, token or digest; other learners' rows never appear. The format string is the version. `importLearner` restores events through `append` (validation and dedupe apply), documents and preferences; knowledge is rebuilt, not restored.
Open (P-01): the file returned by `GET /export` cannot be fed to `importLearner` (the HTTP shape has no top-level `learnerId`; all events were refused in the audit). The test title is still "DEFECT P-01" in my run. The store-level round trip is exact (same ids, bodies and, after a rebuild, the same knowledge).

## 6. Open items that touch integrity

| source | item | state as I could verify it |
|---|---|---|
| PRIVACY P-01 | HTTP export not importable | open (test titled DEFECT in run) |
| PRIVACY P-06 | no route ends an enrolment (`endedAt` never set) | open per audit; not re-run |
| PRIVACY P-07 | language not checked against the enrolment | code present in `prepareEvents`; 4 tests in `privacy.team.test.ts` failed in my run (2 service "P-07 (fixed)", 2 worker), i.e. in flux while sibling sessions edit |
| PRIVACY P-08, P-09 | offline sign-out cannot revoke the token later; extension and GoPractice remote-speech switches record no consent event | open per audit; not re-run |
| SECURITY S-02 | parser/store still build the 12-word id list; the worker cuts it before storage and the request | fixed at the worker only |
| SECURITY A-04, A-05, A-06, A-10, A-11 | event-id existence oracle; no per-learner quota; zero-width or hyphen joins let up to 120 characters of text ride in `surface`; the URL path is stored as `locator`; `DELETE /me` needs only the session and email | accepted findings, no action taken |
| SECURITY | unit ids are free-form up to 300 characters (SQL-looking ids are stored byte for byte by design) | no grammar enforced |
| OFFLINE O-01, O-06 | one unreadable row in the device queue wedges the whole queue; in GoPractice one event the service refuses holds back every later event | open per audit (nothing is dropped) |
| conformance | `conformance.structure.test.ts` red at 10:11 because `handler.ts` imports `repository-store/src/deletion` and apps reach `handler.ts` through `api.ts` | not checked in built bundles |

Not tested anywhere: a real hosted deployment, TLS, backups (what a host's backups keep after erasure), concurrency across processes, legal sufficiency of deletion or retention.

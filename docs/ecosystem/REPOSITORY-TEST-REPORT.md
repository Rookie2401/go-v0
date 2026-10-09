# Go Repository — test report

Status: 2026-10-08, Prompt 3. What actually ran, with counts from the runner. Nothing here is estimated.

## 1. Commands

```
npx tsc -b                                                   # exit 0 (whole repository incl. packages/ and test/)
npx vitest run test/repository test/ecosystem --reporter=dot # 19 files, 466 tests, 0 failed
npx vitest run --reporter=dot                                # the whole repository: see §4
```

## 2. The suites

| suite | files | tests | what they prove |
|---|---|---|---|
| `test/repository/linguistics` | 2 | 40 | "librin" → lexeme, construction, relations; status rules (`statusFor`) incl. a real conflicted form (`jetë`); out-of-context resolution keeps all candidates; non-Latin / unsupported language → provisional form only; store never downgraded; invalidate keeps the row and names affected units; reviewer correction → verified single candidate; alias migration certain vs uncertain; coverage gaps |
| `test/repository/store` | 2 | 194 | one conformance suite run against memory, SQLite `:memory:` and a SQLite file reopened: append validation and refusal, id and dedupe-key idempotency, seq independent of `at`, filters, no-downgrade, analyses/aliases/packs, projection rows and cursor, optimistic documents, identity (case-insensitive email, sessions by hash, revoke), tombstones, transaction rollback on throw and nested savepoints, erasure isolation, export → import round trip, tombstone deletion by source/range/event; migrations idempotent, an edited applied migration refused, a newer database refused |
| `test/repository/engine` | 3 | 60 | invariants (a)–(j) as named tests (click ≠ knowing, playback ≠ listening, accepted correction ≠ production, assisted apart, declared quality never raises, no single boolean/number, order-independence by 20 shuffles, duplicates change nothing, rebuild = incremental, engine never writes linguistic rows, every positive traceable); the "librin" six-step scenario; fold arithmetic, tombstones, aliases, preferences, eligibility, candidates (construction explains many), suitability without a CEFR string. A mutation (playback counted as listening) made 4 tests fail |
| `test/repository/service` | 6 | 65 | accounts, constant-time sign-in path, lockout, expired/revoked/malformed tokens, learner scoping on every route (403 before any read), foreign events store nothing, team leader refused, device scoping, whole-batch rejection, retry dedupe, clock skew, pull pagination, document conflict, delete-me erasure, export hygiene, no sentence text after `/lookup`, 413, log hygiene; one real-crypto run over `fetch` |
| `test/repository/sync` | 4 | 90 | queue persistence and restart, offline burst, backoff growth, lost acknowledgement → exactly once, rejections visible, skew reported and `at` untouched, pull idempotence and cursor safety, two-device draft conflict copy, preference rule, monotonic ids across a backwards clock, 50-run property test (server = union of both devices' events, each once) |
| `test/repository/integration.test.ts` | 1 | 11 | the §18 scenario over the real packages (SQLite, real Albanian resolver, real engine, real service with real scrypt, real sync client); see §3 |
| `test/ecosystem/boundaries.test.ts` | 1 | 6 | package import rules incl. the six Repository packages; contract validation cases |

Total for the Repository: 19 files, 466 tests, 0 failed (run 2026-10-08 19:19 local, 1.8 s + 1.2 s).

## 3. The §18 scenario, step by step (`test/repository/integration.test.ts`)

| steps | assertion that passed |
|---|---|
| 1–4 | two accounts exist; `POST /lookup` of "librin" in "Fëmijët lexojnë librin." returns `form:sq:librin`, `lemma:sq:libër:NOUN`, a `morph-construction` with Case=Acc, Definite=Def, Number=Sing, `form-of` and `realizes` relations, candidates, a sentence hash; the store contains no sentence text |
| 5–7 | a lookup, a gloss request and a playback give exposure (3 observations) and zero weight on listening, reading and assisted recognition; counters lookups 1 / assistance 1 / playbacks 1 |
| 8 | candidates include the lexeme with the `repeatedLookups` reason; every candidate has reasons; a provisional construction is not eligible for a grammar assessment |
| 9–10 | an incorrect `AssessmentAnswered` makes `grammaticalUnderstanding` of the construction negative (score < 0.5) and leaves the lexeme's grammar and retrieval at zero |
| 11–12 | a correct unhinted recall raises `productiveRetrieval` above 0.5; reading and listening stay at zero |
| 13–14 | a correct recorded-voice `ListeningAssessed` raises `listeningRecognition` above 0.5 and leaves retrieval identical; an assessment with `answerShownBefore: true` is refused (422) |
| 15–16 | unassisted correct writing raises `contextualProduction`; assisted writing leaves it identical and raises `assistedRecognition`; `CorrectionAccepted` changes neither; the draft body is in the document store and in no event; an observation smuggling `text` is refused |
| 17–18 | `engine.rebuild` equals the live rows exactly |
| 19–20 | replaying every event (same ids) stores 0 and reports all duplicates; the same events under new ids with the same dedupe keys store 0; head and knowledge unchanged |
| 21–22 | learner B: events naming A → 403 and nothing stored; A's document → not found; A's enrolment → refused; B's export contains neither A's id nor A's document; a push with A's event → 403; no token → refused |
| 23–24 | a second device of A queues 5 events while the network is dead (nothing lost, server head unchanged); the server then stores the batch but the acknowledgement is lost; the retry is answered with duplicates; queue empty, exactly 5 new events on the server, all ids present; reading recognition rests on exactly 5 observations; pull twice yields the same local count; status pending 0, no error |

## 4. Whole-repository run

`npx vitest run --reporter=dot`, started 19:19:36, duration 458 s:

| result | count |
|---|---|
| test files | 454 passed, 2 failed (456) |
| tests | 10,891 passed, 2 failed (10,893) |

The two failures are the two pre-existing data mismatches of `BASELINE-TEST-REPORT.md` §3 (`test/bench/sq-library-assets`
hash recorded before the 10-06 rebuild; `test/content/curriculum-remediation` stray quotation mark) — unchanged by this
phase. The runner also reported two unhandled errors: a `requestAnimationFrame is not defined` thrown by epub.js
after `test/controlled-reader/adapter.test.ts` had torn down (the transient error noted in Prompt 2; a shim was added
to the controlled-reader test helpers after this run), and a vitest worker RPC timeout (`snapshotSaved`) under the
full-suite load, which is the runner, not a test. The baseline before this phase was 10,205 of 10,208; the Repository
adds 466 tests (and the Prompt 2 suites 224).

## 5. Not tested, honestly

- Calibration: no estimate has been compared with an independent assessment; the numbers are hypotheses.
- The Node bridge under load, concurrency across processes, or a long-running SQLite file; only one smoke run.
- A Cloudflare D1 twin of the store (not written).
- Behaviour with the extension prototype connected over HTTP (the prototype still writes to `chrome.storage.local`).
- Multiple learners on one device (profiles), password reset, email verification, rate limiting of account creation.
- Browser-side bindings of the sync `KeyValueArea` (chrome.storage / Dexie); only the memory area and an adapter exist.

# GoPractice / GoReview — test report

Status: 2026-10-09, Prompt 5. What ran, with the runner's counts, the scheduler verification, the browser walk and the
service's own read-back. The whole-repository gate is in §6.

## 1. Automated suites

```
npx tsc -b                                                                        # exit 0
npx vitest run test/goreview test/gopractice test/gotell/boundary.test.ts test/gopractice-e2e test/ecosystem --reporter=dot
```

| suite | files | tests | what it proves |
|---|---|---|---|
| `test/goreview/scheduler` | 3 | 52 | ts-fsrs adapter; frozen reference vectors (§2); Again → relearning with a lapse; Hard < Good < Easy; delayed review; retrievability monotone; deck fold deterministic under 25 shuffles; unscored results change nothing; snooze/suspend/dismiss/re-add; two devices' offline reviews both kept; every built event validates |
| `test/goreview/exercises` | 6 | 121 | facts for lexeme / form / construction / phrase units from the real pack and resolver output; every family builds where allowed and refuses where not (provisional "librin": lemma question only; conflicted "Nëna": refused everywhere); `validateExercise`; grading table (exact, loose partial, article-less, alternatives → ambiguous, empty → unable, challenge → null); audio families with available / unavailable / failed / transcript-shown sources; evidence events validate, carry kinds and dimensions, never text; the real engine draws nothing from quality-`none` events |
| `test/goreview/{intake,planner,session,transfer}` | 7 | 113 | every intake decision with its reason; audio unavailable → written fallback or `test-later`; saved first; planner budgets (short session leaves due items unrecorded and listed), max new, listening toggle, grammar share, cost/benefit; controls produce valid events; runner records before advancing (a throw after record leaves the session unchanged), skip writes nothing, recovery resumes, audio failure → no evidence, transcript shown → not listening, challenge → quality none; history and the four transfer measures |
| `test/gopractice` | 7 | 71 | shell routes, sign-in and switch, language switch re-folds the deck, due summary, intake list with reasons, session flow with record-before-next, audio transcript absent from the DOM before the answer and present after, keys 1–4, skip, finish early, challenge, analysis-error report, snooze/suspend/dismiss events, offline session continues and the queue grows, preferences persist, GoTell renders with no deck; one run on the real registry, evidence builder, runner and pack facts |
| `test/gotell/boundary.test.ts` | 1 | 6 | `gotell` imports nothing from `goreview`; initialises with an empty log and no deck |
| `test/gopractice-e2e/review-reference.test.ts` | 1 | 13 | the §21 scenario over the real pieces (§3) |
| `test/ecosystem/boundaries.test.ts` | 1 | 7 | import rules incl. `gopractice` hosting both workspaces |

Total: 26 files, 384 tests, 0 failed (2026-10-09 08:10–08:35 local). The older `test/gotell/*` suites (the retired
`src/gotell` engine, 156 tests) still pass and are untouched.

## 2. Scheduler verification (FSRS)

Library: ts-fsrs 5.4.2 (MIT, open-spaced-repetition), reporting `v5.4.2 using FSRS-6.0`; 21 default weights, decay
0.1542, desired retention 0.9, maximum interval 36,500 days, short-term learning steps 1 m / 10 m and relearning 10 m
(library defaults), fuzz forced off for cross-device determinism. Parameters are untouched; `parametersVersion` is a
hash of the effective settings so a change forces a re-fold.

Frozen vectors (`test/goreview/scheduler/vectors.json`, produced by the library's own `next()` and checked on every
run; `FSRS_FREEZE=1` re-freezes after a deliberate upgrade):

| sequence | result |
|---|---|
| new card, Good ×4 at each due time | learning +10 min (S 2.3065) → review 2 d → 11 d (S 10.971) → 46 d (S 46.317); reps 1…4 |
| Again on that review card | relearning +10 min, lapses 1, S 2.934; Good then returns to review at 3 d |
| review card after three Goods, rated at due | Again → relearning; Hard 32 d (S 32.228); Good 46 d; Easy 77 d (S 77.170) |
| Good 30 days late | frozen; stability larger than on time; a late Again is a lapse |
| retrievability after a review | 0.9869 at 1 d, 0.9446 at 5 d; whole-day elapsed counting as the library does |

The library's `repeat()` preview equals `next()` for every grade. This is reference behaviour of the library, not a
validation of the forgetting model against learners.

## 3. The §21 scenario (`test/gopractice-e2e/review-reference.test.ts`)

Real: the Repository service (SQLite, scrypt), linguistics, engine; GoLearn's parser and event builder; GoReview's
intake, planner, FSRS scheduler, builders, grading, evidence; GoListen's assessment source; the extension's worker and
card. Fake: the network (in-process), the clock, the audio element, and a TEST voice registry.

| steps | what passed |
|---|---|
| 1 | two real "librin" lookups with gloss requests and a "Review this" mark: exposure 4, reading recognition untouched |
| 2–3 | the Repository proposes `lemma:sq:libër:NOUN` with `repeatedLookups`; intake decides `test-now` (saved) with reasons and a written family (no audio → never a listening item) |
| 4–6 | the plan holds the new item; the runner builds a written exercise from pack facts (validated, with accepted answers); "bread" → incorrect, rating 1, a `CardReviewed`; the deck shows reps 1, learning/relearning, due within the hour; the targeted dimension goes negative; every event validates; no sentence text |
| 7–8 | 15 minutes later the due item is answered correctly: rating ≥ 3, that dimension's positives and score rise, listening and grammar unchanged, reps 2, history 2 |
| 9–13 | a listening item: with the TEST registry (a stand-in reviewed recording labelled "TEST asset (not real Albanian audio)") the stimulus is eligible; the exercise hides the written form; the fake audio plays; "book" → correct → `ListeningAssessed` with `answerShownBefore: false`, scoring voice recorded/eligible; listening rises, reading identical to step 8, retrieval unchanged |
| 14–16 | GoLearn's real worker and card: "You have met this word N times; reading recognition: low/medium/high", Layer 4 explanation still there |
| extra | missing audio: real Albanian registry → stimulus unavailable, planner asks the due listening item in writing; invalid question: provisional "librin" gets no feature question (lemma only); ambiguous answer → no rating; empty → unable; offline: answers queue, a dead network sends nothing, recovery sends once, a re-sync adds nothing, ids unique; conflicting devices: both offline reviews in time order regardless of arrival, fold identical from reversed input; planned German: no pack facts, nothing built; cross-user: B cannot read A's candidates, sees no A events or knowledge, cannot submit A's events (403) |

## 4. Browser walk (Chromium pane, 2026-10-09 15:17–15:19 UTC)

Real service process on `127.0.0.1:8790` (the SQLite file of the Prompt 4 walk, learner ana@albania.test); the built
`packages/gopractice/dist` served on `localhost:5199`; encounters seeded through the service with the real parser and
event builder (three lookups, three gloss requests, one saved mark).

| step | observed |
|---|---|
| sign in | redirected to GoReview; header shows the language `sq (sq-standard)` |
| GoReview home | Due 0, Learning 0, New in deck 0, New candidates 1, "Listening not available: No Albanian recordings exist; nothing is claimed", scheduler line; "Worth testing (1): libër — test later — Recognition (meaning of a word) — caveat: provisional analysis; shown with caveats — Why / Test now / Later / Dismiss"; "Not proposed (1)" (fëmijë, analysis confidence) |
| Test now → Start a session | "Item 1 of 1 · Recognition (meaning of a word) · What does “libër” mean?" with a typed answer field, Skip (Esc), Finish early, "Show the answer instead" |
| answer "book" + Enter | "Correct · You: book · Answer: book · Correct. “libër” means “book”. (This reading comes from the pack’s word-form rules and has not been reviewed.) · Will be recorded when you continue." with Challenge / Report controls |
| Next | summary: "1 of 1 planned, 1 correct", results by dimension (Written recognition 1/1), "1 event(s) were written (1 CardReviewed); 1 count as evidence", "Nothing was withheld", "1 event(s) wait to be sent" |
| GoTell | renders with no deck: words you can use (none yet), drafts, a draft editor saving a private document; says the writing engine is the next phase |
| Settings | preferences, remote-speech consent off, account, service address, sync "online · waiting 0 · last send 15:18 · last error none", diagnostics with `fsrs@v5.4.2 using FSRS-6.0` and the parameter hash |
| service read-back (script over the API) | one `CardReviewed` from device `web-6a34…` with `cardId`, rating 3, family written-recognition; `lemma:sq:libër:NOUN`: readingRecognition score 0.609 (1 observation, weight 0.28), exposure 4 observations, every other dimension at zero; no sentence text in the log |

Not done in a browser: an audio-first item (no Albanian audio exists; the path is covered by the jsdom suites and
the reference test), two devices at once, the challenge/report flows (jsdom only).

## 5. Audio quality, honestly

Albanian: no recording, no device voice on this machine, Azure voices unverified and consent-gated — GoReview offers no
listening items for Albanian and says so on the home screen. The listening path (hidden answer, playback, scoring,
eligibility, evidence) is validated only with a TEST registry entry and the German demonstration clip; neither is
Albanian audio and no claim is made.

## 6. Whole-repository gate

`npx vitest run --reporter=dot`, 2026-10-09 08:12 local:

| result | count |
|---|---|
| test files | 505 passed, 2 failed (507) |
| tests | 11,646 passed, 2 failed (11,648) |

The two failures are the two pre-existing data mismatches (`BASELINE-TEST-REPORT.md` §3), unchanged. One unhandled
error was a vitest worker RPC timeout under full-suite load (the runner, not a test); jsdom also logs "Not
implemented: navigation" when the shell sets `location.href` in a test, which is a warning, not a failure. The gate
stood at 11,277 before this phase; GoPractice adds 384 tests.

## 7. Not tested

Calibration of FSRS against real learners; sessions longer than one item in a browser; remote voices; a hosted
(https) service; multiple profiles on one device; the challenge flow's effect on the shared word list beyond the
`AnalysisCorrected` event.

# GoReview scheduling — FSRS adoption and what was verified

Status: 2026-10-09. Sources: `packages/goreview/src/scheduler/README.md`, `GOPRACTICE-TEST-REPORT.md` §2, `audit/MODEL-SCHEDULER-LISTEN.md` §4, and the test files named below.
I ran `test/goreview/scheduler`, `test/audit/scheduler.core.test.ts` and `test/audit/scheduler.deck.test.ts` on 2026-10-09 at 10:09 (with the GoTell and ecosystem suites): all passed.
The scheduler decides when an existing deck item is next reviewed. It does not decide what a learner knows: the Repository's seven dimensions are the learner model, and GoReview's
stability, interval or streak is retention bookkeeping.

## 1. Adoption

| item | value (source) |
|---|---|
| library | `ts-fsrs` 5.4.2, MIT, open-spaced-repetition (`node_modules/ts-fsrs/package.json`; `package.json` pins `^5.4.2`, so a later 5.x could install) |
| algorithm string | `v5.4.2 using FSRS-6.0`, exposed as `fsrs@v5.4.2 using FSRS-6.0` (`vectors.json` `libraryVersion`) |
| parameters | the library's 21 published default weights, decay 0.1542, **not tuned**; a custom array is accepted and changes `parametersVersion` |
| desired retention | 0.9 default; the settings screen offers 70 %–97 % and re-folds the whole history on change (audit S7) |
| maximum interval | 36,500 days (library default); a soft cap, a small cap can be overshot by up to 2 days (audit O1) |
| fuzz | forced off (`enableFuzz: true` throws), so two devices fold one history identically |
| learning steps | 1 m, 10 m; relearning 10 m (library defaults) |
| identity | `parametersVersion`, an 8-hex hash of weights, retention, maximum interval and steps, stamps every state |
| deck | a pure fold over `CardAdded`, `CardReviewed`, `AssessmentAnswered`, `ListeningAssessed`, `CardRemoved`, `ReviewItemInvalidated`; never edited directly |

Frozen vectors: `test/goreview/scheduler/vectors.json`, produced by the library's own `next()`; `FSRS_FREEZE=1` re-freezes after a deliberate upgrade. `vectors.test.ts` asserts that the installed library still reproduces
every number ("the installed library still reproduces every frozen number (fails on library drift)"), that our adapter does through `ScheduleState` ("our scheduler, through ScheduleState, reproduces every frozen number"), and that
`repeat()` equals `next()` for every grade. The audit counts 17 frozen values (S1).

## 2. What §18 verified, with the tests

| §18 item | observed | test |
|---|---|---|
| new item | phase new, reps 0, due at creation, retrievability 0 | `scheduler.core` "NEW: phase new, no reps, due now, retrievability 0, identity stamped"; `fsrs.test.ts` "a new item is new, due at once, never reviewed, retrievability 0" |
| success | Good x4 at the due times: learning +10 min, then review at 2, 11, 46 days; stability 2.3065, 10.971, 46.317 | `scheduler.core` "SUCCESS: Good, Good, Good, Good at the due dates ..." |
| failure | Again on a Review card: relearning, lapses 1, stability 46.317 to 2.934, due in 10 minutes | `scheduler.core` "FAILURE: Again on a Review card ..." |
| relearning | Good after the step returns to Review with lapses kept; a second Again is lapse 2; Again inside relearning adds none | `scheduler.core` "RELEARNING: ..." |
| retention | 0.8 / 0.9 / 0.95 give strictly ordered intervals (0,8,76,525,2781 / 0,2,11,46,163 / 0,1,3,8,19 days); retention is part of the identity | `scheduler.core` "0.8 gives longer intervals than 0.9 ..." and "the retention is part of the identity ..." |
| delay | a Good 30 days late: recall 0.789 at review, larger stability gain than on time; a late Again is a lapse | `scheduler.core` "DELAYED review: ..." |
| backlog | 50 due items, 10-minute budget: 24 planned (600 of 600 s), 26 listed as skipped "over budget", nothing written, drains over two sessions | `scheduler.deck` "plans the most forgotten items first ...", "answering the planned items clears them ..." |
| concurrent devices | two devices reviewing offline fold to the single-device schedule; 20 random arrival orders give one deck | `scheduler.deck` "two devices reviewing the same item offline ...", "twenty random arrival orders ..."; `deck.test.ts` "the same event multiset in any order gives an identical deck" |
| offline | late-arriving offline reviews fold as if in order; a review from a clock behind the `CardAdded` is reported in `ignored`, still counts as evidence | `scheduler.deck` "offline attempts that reach the store late ...", "a review dated before the item was added ..." |
| duplicates | the store keeps one of a repeated id or `dedupeKey`; the fold collapses a repeated id itself | `scheduler.deck` "the same event id twice, and the same dedupeKey under a new id ..."; `deck.test.ts` "an event delivered twice (same id) counts once" |
| version upgrade | a different `parametersVersion` re-folds every schedule from history; history rows and the log are unchanged | `scheduler.deck` "a different parametersVersion recomputes every schedule ..." |
| candidate de-duplication | a unit in the deck is `already-covered`; the same unit twice among intake outcomes yields one planned item (D6, fixed) | `scheduler.deck` "intake: once the item is in the deck ...", "DEFECT D6 (fixed) ..." |
| audio review | `ListeningAssessed`, `CardReviewed`, `AssessmentAnswered` with equal ratings schedule identically; an unrated listening result changes neither schedule nor history | `scheduler.deck` "ListeningAssessed, CardReviewed and AssessmentAnswered with the same ratings ...", "a listening review with no rating ..." |

Also: retrievability is monotone in time and within 0..1; late success earns more stability (`fsrs.test.ts`); the review fold reports, never guesses, a review of an unknown or not-yet-added item.

## 3. What this does not claim

* No validation of the forgetting model against any learner. The vectors are library behaviour, not a calibration (`GOPRACTICE-TEST-REPORT.md` §2, §7).
* Elapsed time is whole days, so retrievability a stability-length after a review is about 0.906, not 0.900 (scheduler README).
* De-duplication on `dedupeKey` lives only in the store: a repeated `dedupeKey` under another id fed directly to `foldDeck` is applied twice (audit S16/O5; test "the fold collapses a repeated id by itself; a repeated dedupeKey ... is applied twice (the store is the only guard)").
* A stored schedule from one regime handed to another scheduler is silently re-stamped; this cannot happen through `foldDeck`, which restarts from a new state (S8).
* Fixed in the audit's remediation, so no longer open: D1 (`ReviewItemInvalidated` now suspends the item with a reason), D5, D6.
* Not tested: a long session in a browser, two real devices at once, the challenge flow's effect on the shared word list beyond `AnalysisCorrected`, FSRS parameter optimisation (deliberately absent).

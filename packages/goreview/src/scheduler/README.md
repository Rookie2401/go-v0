# GoReview scheduler (`packages/goreview/src/scheduler`)

When an existing deck item is next reviewed. Nothing else: which items exist (intake), what is asked (exercises) and how
it is graded live in sibling modules.

## Library

| | |
|---|---|
| Library | `ts-fsrs` 5.4.2, MIT (`node_modules/ts-fsrs/LICENSE`), https://github.com/open-spaced-repetition/ts-fsrs |
| `FSRSVersion` string | `v5.4.2 using FSRS-6.0` → `Scheduler.algorithm` = `fsrs@v5.4.2 using FSRS-6.0` |
| Algorithm | FSRS-6 (21 weights, decay `w[20]` = 0.1542) |
| Desired retention | 0.9 (library default `default_request_retention`); overridable per scheduler |
| Maximum interval | 36500 days (library default); overridable. The library keeps Hard < Good < Easy strictly ordered, so Easy can overshoot a small cap by up to 2 days |
| Fuzz | **off, always** (`enableFuzz: true` throws). Fuzz would make two devices disagree about one history. The library default is also off in this version |
| Short-term steps | **on** by default (`default_enable_short_term = true`): learning steps `1m, 10m`, relearning step `10m` |
| Weights | the library's published defaults (`default_w`); not tuned. A custom array is accepted and changes `parametersVersion` |
| `parametersVersion` | 8-hex FNV-1a hash of the effective weights, retention, maximum interval and step settings |

Behaviour worth knowing (all observed from the library, frozen in `test/goreview/scheduler/vectors.json`):

* A new card rated Good enters **learning** with a 10-minute due; a second Good moves it to **review** (2 days), then 11, then 46 days (all Good, at the due date).
* Again on a Review card goes to **relearning** (10 minutes), `lapses + 1`, stability falls; a Good at the relearning due date returns it to Review.
* Elapsed time is measured in **whole days** (`get_retrievability` reads 10.97 days as 10), so retrievability a stability-length after a review is about 0.906, not 0.900.
* The library's `Card` has a `learning_steps` counter that the shared `ScheduleState` has no field for. The scheduler adds an optional `learningSteps` to the state it returns (`FsrsScheduleState`); a plain `ScheduleState` without it is accepted (step 0 assumed).

## Files

* `fsrs.ts` – `createFsrsScheduler(opts)`, `toCard` / `fromCard`, `shortHash`. Pure; `review` never mutates.
* `deck.ts` – `foldDeck`, `itemIdFor`, `buildCardAdded`, `buildCardRemoved`, `assertValidEvent`.
* `verify.ts` – the reference check (below). `index.ts` – barrel.

## What was verified, and how

`verify.ts` runs a fixed script on **ts-fsrs directly** (never through our adapter): a new card rated Good four times at exactly
its due dates; Again on the Review-state card, then Good at the relearning due date; Again/Hard/Good/Easy on one Review-state card;
a Good 30 days after the due date; retrievability at 0, 1, 5, S, 2S and 30 days after a review. The numbers are frozen once in
`test/goreview/scheduler/vectors.json`. The tests then assert that (1) the installed library still reproduces them, so an upgrade that
moves the maths or the defaults fails loudly; (2) our `Scheduler`, through `ScheduleState` and back, reproduces them; (3) the
library's `repeat()` preview equals `next()` for every grade. Re-freeze deliberately with
`FSRS_FREEZE=1 npx vitest run test/goreview/scheduler/vectors` after reading the library changelog. No forgetting curve and no parameter is ours.

## The deck is a fold

The deck is **never stored**. `foldDeck(events, scheduler, { languageId?, now })` rebuilds it from the learner's events:
sort by (`at`, `id`), drop repeated ids, then apply `CardAdded` (create or re-activate; the first creation takes `newState(at)`),
`CardRemoved` (`dismissed` / `suspended` / `snoozed` + `until`; a snooze that has ended by `now` is active again) and the review
kinds (`CardReviewed`, `AssessmentAnswered`, `ListeningAssessed`; payload `rating` 1..4). The same event multiset in any order gives the same deck on every device.

* A review event with **no rating** (`rating: null` or absent: invalid question, failed audio, challenged answer) changes neither schedule nor history; it is counted in `DeckFold.unscored[itemId]`. The `grade` field of a `CardReviewed` payload is deliberately **not** used as a fallback: it is required by the payload validator even for results that must not schedule.
* Two devices reviewing the same item offline both land in `history` in `at` order; nothing is overwritten. Reviews are applied in that order, so the schedule is the one a single device would have computed.
* Events that cannot be applied are returned in `DeckFold.ignored` with a reason (malformed `CardAdded`, a review of an item not added yet in event time, a snooze without `until`), never dropped silently.
* Re-adding an item re-activates it and keeps its schedule and history; the preferred family and reasons are updated.
* Changing the scheduler (other retention, newer library) and re-folding the same events recomputes every schedule from the history; nothing is migrated.

## What scheduling state is NOT

It is retention bookkeeping for one deck item: when to ask again and how likely recall is now. It is not a mastery score, not a
level, not a grade, and not evidence about the learner. The Repository's seven dimensions are the learner model; GoReview reports
results there as events and the Repository decides what they mean. Stability and difficulty must never be shown as "knowledge".

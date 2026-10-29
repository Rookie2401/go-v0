# GoReview

The review half of GoPractice. It reads the learner's Repository (candidates, knowledge, events), keeps a spaced-repetition
deck, plans a session, asks questions, grades them, and writes review and listening events back. It imports the
Repository contract and GoListen's contracts only (`src/types.ts` is the vocabulary all modules share).

## Three responsibilities, kept apart

| Responsibility | Question it answers | Where | What it must not do |
| --- | --- | --- | --- |
| **Intake** | Which Repository candidates become deck items, and why? | `src/intake` | schedule, build exercises |
| **Scheduling** | When is an existing item next reviewed? FSRS (ts-fsrs), folded from the event log | `src/scheduler` | decide what a learner knows |
| **Assessment** | What question tests the targeted skill, and how is a response graded? | `src/exercises`, `src/grading`, `src/listening` | touch the schedule |

The planner (`src/planner`) and the session runner (`src/session`) sit on top and only compose these.
The Repository's seven dimensions are the learner model; GoReview's schedule is retention bookkeeping.

## Intake rules (`decideIntake`)

Ordered; the first rule that applies decides, and every outcome says which.

1. Not eligible → `needs-validation` (reason from the eligibility). A *provisional* analysis is allowed through, with a caveat, for recognition targets only.
2. Pack facts conflicted or invalidated → `too-uncertain`.
3. Same unit and same Repository dimension already in the deck (active or snoozed; suspended too) → `already-covered`. A dismissed item is `low-priority`: the learner removed it.
4. A deck item for a construction that *explains* this unit → `redundant`. The deck item's reason carries `explains:<unitId>` tokens (`cardReasonFor`).
5. Knowledge for the target dimension has confidence ≥ 0.8 and score ≥ 0.85 → `already-covered` ("well established").
6. Provisional grammatical analysis → `needs-validation`.
7. Listening target without suitable audio (off, unavailable, or practice-only) → `test-later` ("no suitable audio"). A written question is never substituted: it would credit reading, not listening.
8. Saved by the learner and `prioritizeSaved` → `test-now`.
9. Score < 0.15 → `low-priority`.
10. Score ≥ 0.5 → `test-now`, otherwise `test-later`.

`proposed` maps the target dimension to a skill: recognition → written-recognition (phrase-comprehension for multiword units),
productive retrieval → meaning-to-form, grammatical understanding → morphological-identification (forms) or
grammar-application (constructions), listening → audio-to-meaning, contextual production → sentence-completion.

## Planning rules (`planSession`)

The automatic queues are due learning/relearning, due reviews, then eligible new admissions. Due time orders cards within each
due tier; the versioned priority score breaks equal-due-time ties. New admissions are bounded by `maxNew`, the UTC-day
`dailyNewLimit`, workload admission, the adaptive initial target, and the active-practice time budget. The target defaults to
10 and is capped at 20 and by the learner's configured maximum. Estimated seconds per family are written 25 s, choice 15 s,
grammar 35 s, sentence completion 40 s, and audio 30 s plus 8 s per expected replay. A zero time budget is flexible time.
Due work that exceeds the active-practice time budget remains due and is skipped as over budget; due work beyond the initial
micro-deck remains available for a later batch. Listening obligations are never replaced by written questions when
listening is off or suitable audio is unavailable.

Remediation is not an automatic weak-point queue. It is a separate optional flow: an eligible unresolved failure can be
studied, then explicitly selected for reassessment after a 10-minute delay. Persistent failure also requires repair study
and an independent delayed reassessment. Saved-deck repeats and selected vocabulary are separate explicit practice; they
remain bounded by the configured question maximum and workload cap. A bounded-remediation interleave is available to
controlled policy evaluation, but production planning defaults to strict due order and does not silently insert remediation.

A session too short for the due items **never drops them silently**: they stay due (nothing is written) and the plan lists
them in `skipped` as "over budget". Learner controls (`applyControls`) snooze, suspend, dismiss or resume by producing
`CardRemoved` / `CardAdded` events; the deck is a fold over the log, never edited.

## Session rules (`createSessionRunner`)

`answer()` grades, rates, builds the evidence and **records through the device queue before advancing**; a throw from
`record` leaves the session unchanged. Event ids are deterministic per session position, so a re-answer after a dead page is
a duplicate, not a second observation. Skipping writes nothing. An exercise that cannot be built is skipped with the reason
and never shown. Audio failure → `unable-to-grade`, no rating, no evidence. Transcript shown before the response → the item
is recorded as written recognition, not listening. Practice-only (synthetic) audio is recorded with evidence quality `none`.
A challenge never counts as evidence; `keyIsWrong` additionally records `ReviewItemInvalidated`. Sessions persist under
`goreview:session:<id>` and resume with `recover(id)`.

## Review eligibility: which fields a human reviewer is shown (`src/intake/review-eligibility.ts`)

Separate from the learner's deck: `reviewEligibility(analysisOrUnit, { encounters, conflicts? })` says which *linguistic fields* may be put to a
person who can settle them. Eligible only when a field is `conflicted` (from 1 encounter) or `provisional` (from 2 encounters in different
sentences). Never: `verified`, `supported`, `unknown` or `invalidated` fields, invalidated or superseded rows, fields the pack marks unreviewable.
`priority = conflicts x encounters`. `validationQueue(items)` returns the sorted queue with reasons, what it skipped and why, and the `legacy`
items without field states (those stay with the intake rules above, unchanged). `reviewerView` shows the stored state and basis, never an upgrade;
`reviewerCorrection` turns a reviewer's decision into a `correct` request that refuses an unnamed reviewer. See `docs/ecosystem/linguistics/REPOSITORY-STATES.md`.

**By level, never by request (projection@4).** A unit becomes review material (for this human queue) only through its progression along the six knowledge
levels (`docs/ecosystem/KNOWLEDGE-LEVELS.md`), never because a learner asked for it: there is no "requested" input anywhere in `reviewEligibility` or
`validationQueue`. `reviewEvidenceOf(row)` builds the evidence from the Repository's `UnitKnowledge` row (its `encounters` and its `level`, or the
distinct sentences the caller counted); a unit at level **New** (nobody has met it) is never eligible, and any level beyond it is eligible once the field
rules above are met. The learner's deck follows the same idea: Repository candidates are drawn by level (new/seen -> recognition practice,
recognized/familiar -> recognition and retention, known -> retrieval, automatic -> only when retention decayed or a mark was contradicted), and intake
(`decideIntake`) puts `level Known: ...` in the reasons of every `test-now` / `test-later` outcome and leaves an Automatic unit alone (`already-covered`)
unless the candidate carries `retentionDecayed` or `selfMarkContradicted`. Nothing is asked of the learner, and the card shows no review metric.

## What GoReview never does

- **No card per clicked word.** Lookups are exposure and assistance; a unit becomes a card only through intake (a Repository candidate that passed the rules above) or the learner's own action.
- **No mastery from scheduling.** An interval, a stability or a streak is not knowledge; the Repository's projections, built from graded events, are.
- **No falsified history on postponement.** Snoozing or running out of time writes no review, no rating and no "pass"; due items stay due.
- No listening evidence from audio generated from the text; no exercise from a fact the pack does not hold.

## Research measures, not conclusions (`src/transfer`)

`helpAfterPasses`, `recognitionInPassages`, `listeningVsReading` and `usedInWriting` describe what the event log recorded
about one unit. **These are research measures, not conclusions.** Each returns `{ measure, value, basis, caveat }`: a count
or difference (or `null` when there is too little to say anything), the events it rests on, and what it cannot show. None of
them says a learner has "learned", "transferred" or "mastered" anything, and no interface should present them as such.

## Layout

```
src/types.ts      shared vocabulary           src/intake/      decideIntake, explainIntake, gatherCandidates
src/scheduler/    FSRS + deck fold            src/planner/     planSession, applyControls
src/exercises/    builders (registry)         src/session/     createSessionRunner, recovery
src/grading/      grading, rating, evidence   src/listening/   prepareListening, scoreListening
src/facts/        unit facts provider         src/history/     reviewHistory, explainItem
                                              src/transfer/    research measures
```

Tests: `test/goreview/**`.

# GoPractice — architecture as implemented (GoReview, and the GoTell boundary)

Status: 2026-10-09, Prompt 5. Replaces the plan-level `GOPRACTICE-DESIGN.md` with what exists. Tests and numbers are
in `GOPRACTICE-TEST-REPORT.md`.

## 1. The parts

```
packages/gopractice/      the application shell: sign-in, language selection, GoReview | GoTell | Settings, sync state,
                          local event log + device queue, keyboard map; engine.ts adapts GoReview's modules to the UI
packages/goreview/        the review domain, three responsibilities kept apart:
  src/intake/             which Repository candidates become deck items, and why (explainable decisions)
  src/scheduler/          WHEN: FSRS via ts-fsrs 5.4.2 (MIT, FSRS-6 defaults, fuzz off); the deck is a fold over the
                          event log (CardAdded / CardReviewed / AssessmentAnswered / ListeningAssessed / CardRemoved)
  src/exercises/ grading/ facts/   WHAT: eight exercise families built from verified pack facts, grading with
                          alternatives and normalisation, evidence events; the facts provider over the pack + Repository
  src/planner/            session planning within budgets; snooze / suspend / dismiss as events
  src/session/            the runner: build → answer → grade → rate → evidence → record BEFORE advancing; recovery
  src/listening/          GoListen assessment mode wiring and the §10 metadata
  src/history/ transfer/  per-item history; research measures (never conclusions)
packages/gotell/          the independent GoTell boundary (initialises with no deck, no session; writing engine: Prompt 6)
```

Boundaries (tested): `gopractice` imports `goreview`, `gotell` and the shared packages; `goreview` and `gotell`
never import each other; `gotell` initialises with an empty log and no deck.

## 2. Candidate → item → exercise → evidence

1. **Candidates** come from the Repository (`GET /candidates`: unit, target dimension, score, reasons, eligibility,
   `explains`, cost). **Intake** (`decideIntake`) turns each into one of `already-covered`, `redundant`,
   `too-uncertain`, `needs-validation`, `low-priority`, `test-now`, `test-later`, with reasons, after reading the
   deck, the learner's knowledge row, pack facts, audio availability and the learner's saved marks. No card is made
   per clicked word: only `test-now` becomes a deck item, and only when the learner starts a session that includes it.
2. **Scheduling** is FSRS state folded from the learner's own events: `CardAdded` creates, each scored review
   advances with the rating in the event, `CardRemoved` snoozes/suspends/dismisses. Two devices' offline reviews both
   survive in `at` order; the fold is deterministic for the same event multiset; unscored results (invalid question,
   failed audio, challenge) change nothing and are counted. Scheduling state is retention bookkeeping; the Repository's
   seven dimensions remain the learner model.
3. **Assessment**: a builder per family, each refusing when the facts do not support a sound question
   (`validateExercise`): written recognition, meaning→form, morphological identification (features only for
   high-confidence/verified forms; a rule-derived provisional form may be asked its lemma only), grammar application
   (needs ≥ 2 attested forms of the lemma in pack sentences), phrase comprehension, sentence completion, audio→meaning
   and audio transcription (written form hidden until the response). Sentences come only from the owner-authored pack
   material. Grading yields correct / partial / incorrect / ambiguous / invalid-question / unable-to-grade, with
   alternatives and normalisation (ë/e and ç/c folds are at most partial); `ratingFor` maps to FSRS ratings or null.
4. **Evidence**: `CardReviewed`, `AssessmentAnswered` or `ListeningAssessed` with the rating, outcome, family and
   assessment dimension; `ListeningAssessed` only when the answer was hidden and the audio played; quality `none` for
   synthetic voices, unverified recordings and challenged answers; no event at all for invalid questions, failed audio,
   ambiguous or ungradable responses. The Repository folds the nine assessment dimensions into its seven.

## 3. GoListen in GoReview

Playback mode (a speaker button) produces exposure only. Assessment mode uses GoListen's `AssessmentSource`: a
stimulus with `answerHidden: true`, the §10 metadata (language, variety, intended expression kept off screen, voice
identity, synthetic flag, pronunciation validation, licence, replay count, hints, answer, correctness, confidence,
assistance). For Albanian no recording exists and no device voice: listening items are not offered; the software path
was validated with a clearly labelled TEST registry entry in the reference test, never presented as Albanian audio.

## 4. Sessions and the learner

A session is planned within the learner's budget (minutes, max new, listening on/off, grammar share, saved first);
due items first by retrievability, then repeated weak points, then new items. What does not fit stays due and nothing
is written. Skips write nothing. Answers are graded for feedback first (`preview`) and committed when the learner moves
on, so "Challenge this answer" and "Report an analysis error" act before any claim. Every committed result is
recorded to the device queue before the next item renders; a dead page loses at most the answer under feedback.

## 5. What GoReview never does

No card per clicked word; no mastery from the scheduler; no falsified history when due items are postponed; no
listening evidence from synthetic speech or from an item whose transcript was shown; no sentence from a commercial
book; no AI-invented intervals (FSRS parameters untouched); no direct edits to the deck (events only).

## 6. GoTell boundary (Prompt 6 builds the engine)

`packages/gotell` initialises from the Repository alone: "words you can use" from productive evidence, private drafts
through the document store with revisions, no import of GoReview. The page says the writing engine is not there yet.

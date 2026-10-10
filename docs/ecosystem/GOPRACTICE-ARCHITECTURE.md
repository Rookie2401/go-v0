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
packages/gotell/          the independent GoTell workspace (initialises with no deck, no session; engine built in Prompt 6, see GOTELL-ARCHITECTURE.md)
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

## 6. GoTell boundary (as of Prompt 5; the engine was built in Prompt 6 — see `GOTELL-ARCHITECTURE.md`)

`packages/gotell` initialises from the Repository alone: "words you can use" from productive evidence, private drafts
through the document store with revisions, no import of GoReview. The page says the writing engine is not there yet.

## 7. With no account: the extension's copy (2026-10-09)

GoPractice has two homes. The **hosted copy** (a static site) keeps its data on an account, so it needs one. The **extension's copy**
(`vite build -c packages/gopractice/vite.config.ts --mode extension` → `packages/golearn-extension/dist/practice/`, served as
`chrome-extension://<id>/practice/index.html`, opened by the popup's **Practise** button or the setup page's Status screen) works on the
device with no account. It is the same code; the difference is `Deps.local`.

- **Detection.** `main.ts` asks `getExtension()` (`localBinding.ts`): the page must have `chrome.runtime.id` and be served from
  `chrome-extension:`. Only then is `Deps.local` set. An ordinary tab with a `chrome` object is not an extension page.
- **The device's Repository.** The extension keeps ONE on-device Repository (`packages/repository-local`) in its background worker, which also records
  every GoLearn lookup into it. This page reaches it with `connectLocalRepository` over `MSG.localRepo`; it opens none of its own, because two copies
  over one storage area would overwrite each other's rows. `LocalRepo` (`localRepo.ts`) is the shape the shell relies on (`api`, `identity`,
  `uploadTo`, `pullFrom`, `clear`, and the extension-only `connectAccount` / `disconnectAccount` / `activeLanguageId`).
- **Modes.** `ctx.mode()` is `account` (signed in), `device` (no account, a local Repository answers) or `none` (hosted copy, signed out).
  `ctx.api()` returns the account's HTTP client, the local Repository's client, or the unauthenticated one, accordingly. The router no longer forces
  `#/signin`: only `none` is sent there, and there the page says what the hosted copy is (`#hosted-copy`) and where the copy that needs no account lives
  (a link from `config.json` → `extensionUrl`, else a sentence pointing at the toolbar button's **Practise**).
- **Data.** In `device` mode the learner is the device's own anonymous one (`u:<local learner>:` in the page's storage: queue, log, preferences). The
  sync client is the same one; its transport (`localTransport`) moves the queue into the Repository with `appendEvents` and brings everything the
  Repository holds (GoLearn's lookups included) back with `listEvents`. GoReview's candidates and knowledge, and GoTell's drafts (`/documents`),
  come from the local client. The enrolment label is the language and its variety (`sq (sq-AL)`); no team is shown, kept or sent.
- **The account step.** Signing in (`#/signin`, offered any time from the header, never required) first signs the worker in to the same account
  (`connectAccount`), then opens the page's own session as before, then `uploadTo` sends the device's history once; the page says how many events and the
  header changes from "On this device only" to "Synced to your account". Signing out brings the account's history down first (`pullFrom`), signs the
  worker out, and returns to `device` mode; nothing is removed. **Clear local data** (Settings) is the explicit removal: the Repository, the learner's
  queue, log and preferences.
- **Known limits.** The device copy and the account copy of this page are separate sessions (signing out of GoLearn's setup page does not sign GoPractice
  out, and the other way round). `npm run ext:build` empties `dist/practice/`; build it again afterwards. The Repository answers `appendEvents` /
  `listEvents` but not the sync routes through the worker's `api` channel, which is why the transport above exists.

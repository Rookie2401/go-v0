# GoReview: the nine-word loop. Diagnosis, repairs and recurrence report (2026-10-29)

Branch `goreview-4-selection`, from master `19b66367`. Twelve commits, each independently testable, nothing published, nothing
deployed, no learner data touched. The brief's "October 29 source audit" could not be found in the repository or with any
session on this machine (it is the owner's ChatGPT "Repetition Analysis"); every defect below was re-derived from the source
and reproduced by a test before it was changed.

## 1. Source-backed diagnosis

### Confirmed defects (reproduced by a test, fixed on the branch)

| # | Defect | Where | Effect on the learner | Commit |
|---|---|---|---|---|
| D1 | A `/knowledge` batch that failed was dropped silently; its units had no row and read as **New** | `app/workspace.ts` knowledge load | "0 eligible new admissions" with nothing to explain it; the broader vocabulary vanishes for the day | b7a075a3 |
| D2 | Start planned at the time the screen was painted, not now | `screens/reviewDetails.ts` `freshModel`; the home only watched due times | A learning return, an expired snooze, a ready remediation or the new UTC day were missed until a reload | dd7bfcb5 |
| D3 | The remediation backlog was derived in four places over different deck subsets; the summary ignored Class Essentials | `screens/session.ts` nextDeckSection, `deckModel.ts` | A ready class reassessment was offered on one screen and counted absent on another | 36d6882b |
| D4 | The release manifest's dependency discovery dropped `node_modules/ts-fsrs/dist/…` as build output | `scripts/goreview-release.mjs` | The shipped scheduler version was unverifiable | aeb56fbc |
| D5 | A computer-voice listening card (admitted since b3818214, today) could never earn a rating: empty effective history, re-planned as **new** in every session, counted against the new-card limit each time | `session/runner.ts:507`, `scheduler/deck.ts` isSchedulableReview, contract `rated()` | The same words return with a listening question in every session and crowd out real vocabulary. Postdates the owner's report; reproduces its symptom exactly | b985083b |
| D6 | The first answers to Class Essentials phrases spent the UTC-day new-word allowance | `planner/budget.ts` | A first class session of twenty cards left "0 eligible new admissions" for the rest of the day | b8726b0d |
| D7 | The Repository proposes a word once per objective; intake turns several into cards in one load; the planner admitted them side by side | `planner/planner.ts` admission loop | The same word as recognition, retrieval and listening cards in one batch: "slightly different questions, the same knowledge"; three of four new slots went to words the learner already had (trace, S1) | a72529d4 |
| D8 | A review was chained to the plan's snapshot of the card; after an answer elsewhere (another device, a saved deck) the fold excluded it as a stale sibling | `session/runner.ts` normalise | An Easy that changed nothing; the card came back | 426a88d4 |
| D9 | Intake relabelled every low-priority outcome without facts as "no verified facts", in front of the real reason | `intake/fetch.ts` | A New word, a word whose knowledge never arrived and a word without facts read the same; diagnosis impossible | 75162bf8 |

### Mechanisms confirmed as possible but not defects (documented, instrumented, not changed)

- **M1 Saved decks and "Repeat this batch" re-ask cards rated Easy minutes earlier.** By design: explicit practice, the schedule
  is kept (`deck.ts` early-practice rule). The learner sees the Easy "ignored". Now labelled by the selection report; the summary
  copy already says it is extra practice. Recommendation in §5.
- **M4 Small sessions after the daily allowance and the ten-minute learning step.** Five new words a day plus the 1 m / 10 m steps
  produce sessions of one to six cards with "0 due, 2 learning, 0 new": the reported home state is what a correct scheduler shows
  on such a day. The home now says why (d8c3c599).
- **M7 Workload throttle.** `sessionMinutes` of 1 to 3 caps new admissions at 0 once due work reserves the time; the batch reason
  already says so.

### Hypotheses that need a sanitized production export (the developer page can now produce one)

- Whether the learner's knowledge batches fail (D1) on the phone; whether facts build for the language in use (the web Pages
  build ships only the `hi` and `la` dictionaries, see `vite.config.ts` GOREVIEW_DICT); whether candidates carry other
  objectives for the nine words (D7); whether the nine words live in a saved deck (M1); the real `sessionMinutes`; the actual
  knowledge levels.
- How to decide: on the device, Developer page, "Why these cards", "Copy diagnostic JSON" (unit ids, codes and scheduling
  numbers only; no words, sentences, glosses or the email) and share the result.

### What already works and was kept

ts-fsrs 5.4.2 unmodified (the frozen reference vectors still pass); the deterministic event-sourced fold; per-event profile
replay; honest grades (assisted, hinted, revealed and challenged answers never move a schedule); explicit early practice keeps
the schedule; saved decks share canonical card histories; cross-device convergence; the UTC-day allowance for vocabulary;
Class Essentials as a built-in saved deck; the release manifest's HEAD check and dirty-tree refusal.

### Architectural shortcomings (not changed here; see SRS-AUDIT-2026-10-29.md)

The whole log is read and refolded three to four times per card; the documented priority ranking is a tie-breaker only;
two forgetting models (FSRS, the Repository's half-life) are never reconciled; typed answers yield only Again/Good;
personalization is a hand-run CLI. The audit proposes a staged rebuild with a simulator as the gate.

## 2. Implementation report

| Change | Files | Before → after | Tests | Compatibility | Risk |
|---|---|---|---|---|---|
| Knowledge-loading completeness | `app/workspace.ts` | failed batch silent → `ReviewModel.knowledgeStatus` (live/partial/cached/unavailable, missing ids, fetchedAt), gap filled from the last snapshot, the rest withheld (`ReviewModel.withheld`, code `knowledge-unresolved`), note on the home; partial loads never overwrite the cache or snapshot | `knowledge-loading.test.ts` (7) | two required fields on ReviewModel; cached fallback assumes a cache written after a complete load | a large outage withholds many words until the service answers (intended) |
| Planning-time freshness | `app/freshness.ts`, `screens/reviewDetails.ts`, `screens/review.ts` | stale `model.now` → `nextChangeAt(model)` + `freshModel(ctx, model)` on every Start/Begin/Practice/Save | `freshness.test.ts` (19) | none | the home's repaint timer still arms on due times only; counts can lag until Start |
| Remediation projection | `app/deckModel.ts`, `screens/remediation.ts`, `screens/session.ts` | four derivations → `effectiveRemediation(model)`; planRemediation refuses invalidated cards | `remediation-projection.test.ts` (5) | none | recomputed per call (cheap) |
| Release provenance | `scripts/goreview-release.mjs`, docs | ts-fsrs dropped → `compiledDependencyPackages`, `scheduler` {library, version, algorithm, sha256}; verify checks versions and fingerprints | `release-traceability.test.ts` (+10) | old manifests are refused ("rebuild it"); iOS binary still outside the manifest | symlinked nested node_modules not covered |
| Exclusion codes + selection report | `src/types.ts`, `planner/eligibility.ts`, `planner/planner.ts`, `app/selectionReport.ts`, `screens/developer.ts` | free text only → stable `code` on every skip and eligibility result; one row per card/candidate with code, due, phase, R | `exclusion-codes.test.ts` (13), `selection-report.test.ts` (8) | additive; no `why`, order or count changed | derived codes for app-made plans are heuristics |
| One word, one new card per batch | `planner/planner.ts` | same word in three dimensions in one batch → second automatic NEW card deferred (`same-unit-in-batch`); due cards kept; explicit practice untouched | `unit-diversity.test.ts` (4) | none | a word's other skills arrive one batch at a time (intended) |
| Listening practice schedules | `session/runner.ts`, `scheduler/deck.ts`, `transfer/learning-metrics.ts`, contract `review-classification.ts` | rating nulled → rating kept, `payload.listeningPractice`, evidence quality none; the fold and the contract chain accept it; metrics, micro-deck, remediation, optimizer ignore it | `listening-practice.test.ts` (5), runner tests | the contract change is additive (a flagged event is a chain link); the Repository's projection weighs quality none at zero (asserted) | cards created before heal on the next answer |
| Class Essentials and the allowance | `planner/budget.ts` | class creations counted → `NEW_ALLOWANCE_EXEMPT_UNIT_PREFIXES = ['class:']` | `budget-class-essentials.test.ts` (3) | saved decks of ordinary words still spend it | none known |
| Why no new words | `app/admissionExplanation.ts`, `screens/review.ts` | nothing → one line with a code (`#why-no-new`) | `admission-explanation.test.ts` (7) | none | wording |
| Intake reasons | `intake/fetch.ts` | "no verified facts" first → the gate's reason first | nine-words P2/P3 | needs-validation unchanged for test-now/test-later | none |
| Live predecessor | `session/runner.ts` | snapshot head → live fold head, live schedule before | `live-predecessor.test.ts` (2) | one more fold per answer | performance (see audit §F1) |
| Nine-word reproduction | `test/goreview/transfer/nine-words.test.ts` | — | 21 tests, 11 probes | — | — |

## 3. Nine-word recurrence report (synthetic reproduction, not production confirmation)

Fixture: nine words with histories (three in learning after a recent Again, five short-interval review cards, three with
retrieval and listening cards of their own), forty eligible words, four New, two dismissed, one suspended, three without
facts, three saved decks over the nine, cards per deck 20, five new a day, ten-minute sessions, all four goals. Every answer
Easy. Times UTC; "allow" is the day's allowance used before → after.

| Session | Time | Planned | Allow | Cards |
|---|---|---|---|---|
| S1 | D1 09:00 | 10 | 0→4 | w6, w7, w5 (learning returns); w4, w8, w1 (due); new: inv02, w3-listening, w5-sentence, w2-retrieval |
| S2 | D1 09:20 | 2 | 4→5 | w9 (learning), inv03 (new) |
| S3 | D1 09:40 | 0 | 5 | nothing: 20× not due, 1× suspended, 5× new-card budget exhausted; "Automatic new-card limit is zero." |
| S4 | D2 09:00 | 6 | 0→5 | w2 (due); new: inv05, 06, 01, 04, 07 |
| S5 | D2 09:20 | 0 | 5 | nothing, as S3 |
| SD1 | D2 15:00 | 9 | 5 | the nine as a saved deck: explicit early practice, no due moved |
| SD2 | D2 15:10 | 9 | 5 | "Repeat this batch": the nine again, no due moved |
| S6 | D3 09:00 | 10 | 0→4 | w1, w4, w8 listening + retrieval (due); new: inv08, 09, 11, 12 |
| S7 | D3 09:20 | 1 | 4→5 | inv14 |
| SD3 | D3 12:00 | 9 | 5 | the nine again (saved deck) |
| S8 | D5 | 7 | 0→5 | w9, w3 (due); new: inv15, 17, 10, 13, 16 |
| S9 | D9 | 8 | 0→5 | w7, w5, w4 (due); new: inv18, 20, 21, 19, 22 |

Easy in S1: w6 → review, due +8 d; w7, w5, w4 → +4 d; w8 → +18 d; w1 → +13 d; a new card rated Easy → review, +8 d. No
automatic session re-asked a card before its due. The only same-day returns are the saved decks (M1). Before the branch, S1
spent three of its four new slots on words the learner already had (D7); with the branch those cards are deferred to later
batches and the slots go to new words. With every answer Good instead of Easy, S3 and S5 hold only learning returns of cards
introduced twenty to forty minutes earlier (M4).

The eleven probes and their results are in the test file's `OBSERVED` comments; the two that showed defects (a listening card
that could never rate, P11; a stale predecessor, P9) are fixed on the branch and their tests assert the new behaviour.

## 4. Regression results

Commands run on the branch tip (Windows 11, Node 24, the repository's locked dependencies):

```
npx vitest run test/goreview test/goreview-app test/goreview-app-e2e test/repository/engine test/contract test/server/review-optimizer.test.ts test/audit/conformance.structure.test.ts test/audit/conformance.imports.test.ts test/audit/a11y.screens.test.ts test/audit/a11y.css.test.ts test/ecosystem test/golisten
npx tsc --noEmit -p tsconfig.app.json
```

| Suite | Files | Tests |
|---|---|---|
| the command above (GoReview engine, app, e2e, Repository engine, contract, optimizer, conformance, screen and stylesheet accessibility, ecosystem, GoListen) | 149: 148 passed, 1 failed | 2,088: 2,087 passed, 1 failed |

New tests on the branch: 105 (knowledge-loading 7, freshness 19, remediation-projection 5, release-traceability +10, exclusion-codes 13,
selection-report 8, unit-diversity 4, listening-practice 5, budget-class-essentials 3, admission-explanation 7, live-predecessor 2,
nine-words 21, runner +1). Every suite named above was executed on this machine; nothing is reported as passing that did not run.

`test/audit/conformance.imports.test.ts` ("the forbidden list is derived from real directories") fails identically on clean
master `19b66367` and is not touched by this branch. tsc reports only the pre-existing `@capacitor/cli` error outside GoReview.

## 5. Architectural assessment

The knowledge–skill–assessment relationship holds better than before: a word has one card per assessment dimension, a batch
holds at most one new card per word, a due card is always an obligation, practice with a computer voice is bookkeeping and
never knowledge, and every exclusion has a code. What the brief asks for beyond this and is not on the branch:

- **Phase C ranking.** Discretionary candidates are still ordered by the existing score; relevance, waiting time and recent
  equivalent assessment are not yet inputs (SRS-AUDIT F2). The planner passes none of the documented factors.
- **Phase D progression.** The routes exist (Familiar + two spaced recognitions opens retrieval, listening and application;
  recognition cards are typed-or-self, so Known is reachable by typing) but nothing tells the learner "ready for a meaning
  check"; the selection report shows the next step only to a developer.
- **Phase E identity.** No new mapping layer: the form-to-lemma merge in intake and the canonical card ids suffice for what was
  reproduced; Class Essentials phrases and ordinary phrases with the same text remain distinct units by design.
- **Phase F.** D8 (live predecessor) and D2 (freshness) close the reproduced staleness; a full snapshot-identity scheme for
  plans is not built.
- **Phase G.** Remediation still needs the learner's own "studied" marker; a card with no usable material stays unresolved
  with its reason visible. Not a dead end, but not guided either.
- **M1.** A saved deck or "Repeat this batch" asks a card rated Easy minutes before; this is explicit practice and is kept,
  but the summary should say "answered N minutes ago, next due …" per card. Owner's call.
- The performance and ranking rebuild in SRS-AUDIT-2026-10-29.md remains the structural work.

## 6. Release recommendation

Ready for a **controlled release** of the web app once the owner lands the branch on master: the twelve commits are read-side
or additive, every event stays valid under the contract, no migration runs, and the Repository service needs no deploy for
them (the contract change is read by both sides and is additive; a service built before it simply keeps ignoring quality-none
events, as it does today). Not ready to call the production loop solved: the reproduced mechanisms explain the reported
symptoms, but which of them the owner's device shows is known only after a diagnostic export from the Developer page.

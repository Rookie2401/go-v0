# @go/repository-engine — Layer C, the projection engine

Turns learner events into multidimensional knowledge estimates, assistance preferences, review candidates, review
eligibility and reading suitability. Imports only `../../repository-contract/src`. Implements `ProjectionEngine`
(`createProjectionEngine`, `modelVersion = 'projection@1'`); consumes `EventLog`, `ProjectionStore`, `LinguisticStore`
(read only), `TombstoneStore` and `IdentityStore.listEnrolments`.

**These estimates are hypotheses until calibrated against independent assessments.** Every number below is a first
guess chosen to be explainable, not a fitted value. Nothing here says a learner "knows" or "has learned" anything.

## Files

| File | Role |
|---|---|
| `src/evidence.ts` | `observationsOf(event)`: the rule table (data) and its few branches; `isPositiveTraceable` |
| `src/projection.ts` | the pure fold (`foldObservation`, `foldObservations`, `foldEvents`), tombstones, aliases, retention decay |
| `src/engine.ts` | `createProjectionEngine`: cursor, incremental `project`, `rebuild`, `knowledge`, `preferences`, `candidates`, `suitability`, `counters` |
| `src/preferences.ts` | defaults, explicit events, inference |
| `src/eligibility.ts` | `eligibilityFor`, `affectedByInvalidation` |
| `src/candidates.ts` | `rankCandidates` (pure) and the rule weights |
| `src/suitability.ts` | `estimateSuitability` (pure) |

## Principles (each is a named test in `test/repository/engine/invariants.test.ts`)

- (a) a lookup or click is exposure, never understanding
- (b) playing audio is exposure, never listening recognition
- (c) accepting a correction is not independent production
- (d) assisted observations feed `assistedRecognition`, never the independent dimensions
- (e) a producer's declared `evidence.quality` / `sourceReliability` can lower a weight, never raise it
- (f) no single known/unknown boolean, no single mastery number: a row is seven dimension estimates
- (g) the fold is deterministic, order-independent and idempotent (same multiset of events, same rows; duplicate ids change nothing)
- (h) rebuilding from the log equals the incrementally projected state
- (i) the engine never writes a linguistic row
- (j) a projection never invents a success: every positive observation traces to a payload that says `correct: true`, `usedCorrectly: true`, an "understood" mark or a "known" mark

## Observation rules (`evidence.ts`)

An observation is `{unitId, dimension, outcome, weight, assisted, difficulty?, sourceReliability, at, sentenceKey?, eventId, counter?}`.
`weight` is the **effective** weight: `min(base, base x qualityFactor) x reliability`, never above `base`.

- Quality factor from `evidence.quality`: none 0 (the observation is dropped), weak 0.5, moderate 0.8, strong 1. No `evidence` note means 1.
- `reliability = min(kind reliability, evidence.sourceReliability ?? 1)`.
- At most one observation per (event, unit). An unparseable `at` yields nothing. `payload.difficulty` (0..1) passes through.
- `assisted` is true when the kind's payload says so (hinted, help used, answer shown, `assisted: true`) **or** `evidence.assisted` is true. An assisted observation aimed at an independent dimension is re-routed to `assistedRecognition`.
- Units are `subject.itemIds` unless stated; `sentenceKey` is `subject.sentenceKey` (or the payload's).

| Event | Dimension and outcome | Base weight | Reliability |
|---|---|---|---|
| EncounterRecorded | exposure (counter `encounter`), each `itemIds` | 0.2 | 1 |
| SelectionLookedUp | exposure (counter `lookup`) | 0.3 | 1 |
| AnalysisShown, AssistanceRequested | exposure (counter `assistance`) | 0.3 | 1 |
| PronunciationPlayed, ListeningCompleted | exposure (counter `playback`); **never** listeningRecognition | 0.2 | 1 |
| UnderstoodMarked `helpUsed: false` | readingRecognition positive | 0.4 | 0.4 (self-report) |
| UnderstoodMarked `helpUsed: true` | assistedRecognition positive | 0.4 | 0.4 |
| ItemMarked `known` | readingRecognition positive | 0.2 | 0.3 (self-assertion) |
| ItemMarked `learning` | readingRecognition negative | 0.2 | 0.3 |
| ItemMarked `saved`, `ignore` | nothing (a bookmark is not evidence) | | |
| ListeningAssessed (`answerShownBefore: false`, else nothing) | listeningRecognition +/- by `correct`; `hinted` goes to assistedRecognition | 0.8 recorded voice, 0 for synthetic or unverified voices (never listening evidence; D8), x (1 - 0.3 if hinted) | 0.5 if `responseMode: 'self-report'`, else 1 |
| CardReviewed recognition | readingRecognition +/- by `correct` | 0.7 x grade factor | 1 |
| CardReviewed recall, cloze | productiveRetrieval +/- by `correct` | 0.8 x grade factor | 1 |
| CardReviewed hinted or `answerShownBefore` | assistedRecognition +/- | 0.4 x grade factor | 1 |
| AssessmentAnswered | grammaticalUnderstanding +/- on `payload.constructionId` and on `itemIds` that are constructions (`morph:` / `syntax:` ids); forms and lexemes in the subject are not credited | 0.8 | 1 |
| AssessmentAnswered hinted | assistedRecognition +/- on the same units | 0.4 | 1 |
| ProductionRecorded unassisted, `usedCorrectly: true` | contextualProduction positive (`mode: 'retrieval'` -> productiveRetrieval) | 0.9 (retrieval 0.8) | 1 |
| ProductionRecorded unassisted, `usedCorrectly: false` | contextualProduction negative (retrieval -> productiveRetrieval) | 0.7 (retrieval 0.8) | 1 |
| ProductionRecorded `usedCorrectly: 'unjudged'` | exposure (counter `encounter`) | 0.3 | 1 |
| ProductionRecorded `assisted: true` | assistedRecognition +/- by `usedCorrectly` | 0.4 | 1 |
| CorrectionAccepted, CorrectionRejected | nothing: accepting a correction is copying, not independent production (c) | | |
| DraftSaved, SentenceSubmitted | nothing: an artefact; its judgement arrives as ProductionRecorded | | |
| AnalysisCorrected, ReviewItemInvalidated, CardAdded, CardRemoved | nothing (linguistic or scheduling state; the candidate rules read the card events) | | |
| profile family (enrolment, pack, privacy, consent, preferences) | nothing | | |

Grade factors for CardReviewed: again 1.0, hard 0.6, good 0.8, easy 1.0. `correct` decides the outcome (grade only modulates the weight).

## The fold (`projection.ts`)

Per unit and dimension, using only commutative accumulations:

- `observations`, `weight` = sum of weights; for judged dimensions `positive` / `negative` are **weighted** sums.
- `score = (0.5 x PRIOR + positive) / (PRIOR + weight)`, `PRIOR = 1` (a pseudo-observation at 0.5). An untouched judged dimension reads score 0.5, confidence 0.
- `confidence = weight / (weight + 2) x (1 - disagreement)`, `disagreement = 2 x min(positive, negative) / (positive + negative)`.
- `lastAt` = max; `lastAssisted` = whether the latest observation was assisted (OR on a tie); `sourceReliability` = min;
  `difficulty` = weight-averaged mean over observations that reported one; `contexts` = number of distinct `sentenceKey`s.
- Row: `firstSeenAt` = min `at`, `lastSeenAt` = max `at` over all observations (exposure included), `basis.events` = distinct events folded,
  `basis.lastEventId` = the event with the greatest `(at, id)`.
- **Exposure encoding.** The contract's row has no counters field, so the exposure estimate holds them:
  `exposure.positive` counts encounters and playbacks, `exposure.negative` counts lookups and assistance requests,
  `exposure.observations` counts all of them, `exposure.weight` sums their weights, `score = weight / (weight + 3)`,
  `confidence = weight / (weight + 2)`. The exact four-way split (encounters, lookups, assistance, playbacks) is
  `engine.counters(learnerId, unitId)`, recomputed from the log.
- **Retention.** `strength(d) = score x confidence` for each judged dimension with observations (one weak positive must not read as strong retention);
  `retention.basedOn` is the strongest (ties by dimension order), `estimate` = that strength,
  `halfLifeDays = 2 + 3 x weight(basedOn)`. Stored rows hold the undecayed strength (a stored decayed number would be stale the moment it was written);
  `knowledge()` and `rebuild()` return rows decayed to the engine clock: `estimate x 2^(-daysSince(lastAt of basedOn) / halfLifeDays)`.
  `uncertainty = 1 - max confidence over judged dimensions` (1 when there is no judged evidence). Exposure never counts as knowledge.
  The half-life formula is a hypothesis.
- **Canonical order.** `foldObservations` sorts by `(at, eventId, unitId, dimension, outcome, weight, counter)` before folding and collapses duplicates of
  the same (event, unit, dimension); sums are kept to 1e-9. Arrival order therefore cannot change any row.
- **Tombstones.** Events of the learner covered by a tombstone (whole learner, one event, a time range on `at`, or a source matching `sourceRef` kind and the title / locator the tombstone names) are skipped.
- **Aliases.** A `certain` alias re-targets the observation's unit id at fold time (chains followed up to 8 hops, cycle-safe; several aliases for one old id: highest confidence, then latest pack version, then smallest new id). An `uncertain` alias leaves evidence on the old id.
- `analysisStatus` is copied from the LinguisticStore's unit at projection time (absent when the unit is unknown).

## The engine (`engine.ts`)

- `project(learnerId)`: reads the cursor. No cursor, or a different `modelVersion`: full rebuild. Otherwise reads the events after the cursor seq,
  finds the touched units (after tombstones and aliases), and **recomputes each touched unit from all of its events** so `contexts`, `difficulty` and
  `basis.events` are exact and the result equals a rebuild. Cost: one scan of the learner's log per call that has new events (O(N)) plus a fold of the touched units only;
  the scan is what keeps alias re-targeting correct (a unit's events may sit under several ids and the store has no reverse alias lookup). Returns `{folded: new events read, cursor: highest seq}`.
- A new alias or a new tombstone that affects events older than the cursor is not noticed by `project`; call `rebuild()` (the service does after a deletion).
- `rebuild(learnerId)`: clears the rows, folds the whole log, rewrites the cursor, returns the rows (decayed view).
- `knowledge`, `candidates`, `suitability` first bring the projection current (`head` vs cursor), so a read never sees a stale model version.
- The engine writes only knowledge rows, the cursor and the preference cache. It calls no `put*` / `invalidate*` of the LinguisticStore.

## Preferences (`preferences.ts`)

Defaults: explanationDepth `brief`, terminology `plain`, transliteration `on-request`, pronunciationFirst `false`, translationAvailable `true`, visualAssistance `standard`, accessibility `[]` (origin `default`).

- Explicit: the latest valid `PreferenceChanged` per key (by `(at, id)`), origin `explicit`, never overwritten. Invalid values are ignored. With a `languageId`, only that language's events count.
- Inference (only for keys with no explicit value; origin `inferred`, with a `basis` string; threshold 3):
  - at least 3 `AssistanceRequested` with `depth: 'explanatory'` -> explanationDepth `explanatory`;
  - at least 3 `AssistanceRequested` with `assistance: 'transliteration'` -> transliteration `always`;
  - in at least 3 distinct sentences (`sentenceKey`) the first help-type event (by `at`, then id) was a `PronunciationPlayed` -> pronunciationFirst `true`.
- `updatedAt` = the `at` of the latest preference-relevant event (the engine clock when there is none), so the result is a pure function of the log.

## Eligibility (`eligibility.ts`)

`eligibilityFor(unit, analyses, target)`: effective status = the lowest of the unit's status and the best live (non-invalidated) analysis; a form whose analyses are all invalidated is `invalidated`.
`verified` and `high-confidence`: eligible (caveat if a live analysis has several readings and none chosen). `provisional`: eligible for readingRecognition, listeningRecognition and assistedRecognition with caveat
`provisional analysis; shown with caveats`; **not** for grammaticalUnderstanding or the productive dimensions. `conflicted`, `invalidated`, unknown unit: not eligible, with a reason.
`affectedByInvalidation(analysis)`: sorted unique `lexemeId`, `senseId` and `constructionIds` of its candidates (not the form id itself).

## Review candidates (`candidates.ts`)

A candidate exists only for a unit with a row (or a construction promoted by leverage) that has a lookup / assistance request (`exposure.negative > 0`), a demonstrated error (any judged dimension with `negative > 0`),
leverage, or a frequency rank <= 2000. Exposure alone excludes it. Score = sum of reason weights, clamped to 0..1; ties by unit id. `targetDimension` = the weakest dimension with errors (constructions: grammaticalUnderstanding; default readingRecognition).

| Rule | Weight | Condition |
|---|---|---|
| recentEncounter | +0.15 | `lastSeenAt` within 7 days of `now` |
| repeatedLookups | +0.2 | `exposure.negative >= 2` |
| demonstratedError | +0.25 | any judged dimension `negative > 0` |
| weakButSeen | +0.2 | readingRecognition weight > 0 and score < 0.5 |
| grammaticalLeverage | +0.3 | a construction realized (`realizes` relations, status not conflicted / invalidated) by >= 3 forms that have errors; `explains` lists those forms |
| explained-by-construction | x0.5 | applied to those forms' scores (recorded as a negative reason of half their score) |
| frequency | +0.1 | `unit.frequency.rank <= 2000` |
| goalMatch | +0.05 | unit kind serves a goal (`GOAL_UNIT_KINDS`; `custom` serves none) |
| existingCoverage | -0.3 | latest of CardAdded / CardRemoved / ReviewItemInvalidated for the unit is CardAdded ("already covered") |
| priorReview | -0.15 | a CardReviewed within 2 days |
| expectedBenefit | +0.1 | confidence on the target dimension between 0.2 and 0.7 |
| analysisConfidence | -(score) | not eligible: score becomes 0 and the candidate is kept only after all eligible ones, at most 5, with `eligibility.eligible = false` |

`cost = min(1, 0.2 + 0.1 x label words)`. `limit` defaults to 20 and covers eligible and ineligible together.
Deviation from "the construction's failed forms have >= 3 negative observations": the contract row stores weighted sums, not counts, so the rule counts **distinct forms with errors** (one form failing three times does not indict a construction).

## Suitability (`suitability.ts`)

Input: one unit id per word-token occurrence (`wordTokens = unitIds.length`; repeats count), `tokenCount`, optional `constructionIds`.

- recognized: readingRecognition score >= 0.6 and confidence >= 0.3. unknown: no row, or reading score < 0.4 with confidence >= 0.3 (confidently not known). uncertain: every other unit with a row (score 0.4-0.6, confidence < 0.3, or evidence only of exposure / assistance).
  Deviation from "unknown = no row": a confidently failed word is counted unknown rather than uncertain, so the unknown share keeps meaning "likely to block reading".
- `familiarUnits` = recognized units; `difficultUnits` = reading score < 0.4 with weight > 0 (reason carries the numbers); `difficultConstructions` = grammaticalUnderstanding score < 0.5 or negative > positive.
- `reliability = min(1, evidenceDensity) x packCoverage`; `evidenceDensity` = occurrences whose unit has >= 1 summed judged weight / `wordTokens`; `packCoverage = 1 - gaps / distinct units (and constructions)`; a gap is a unit missing from the LinguisticStore or `provisional` / `conflicted` / `invalidated`. Gaps are listed in `coverageGaps`.
- No level label of any scale appears in the output (tested).

## Contract gaps found

- `UnitKnowledge` has no counters field, so exposure is encoded in `positive` / `negative` (above) and the exact split needs `engine.counters`.
- `DimensionEstimate` stores weighted sums only (no observation counts per outcome), which is why the leverage rule counts forms, not observations.
- `StoredEvent`/`EventFilter.unitId` semantics are unspecified (the engine does not rely on it); there is no reverse alias lookup (`aliasesFor` takes old ids), which forces the O(N) scan in `project`.
- `ProjectionEngine.project` cannot learn that tombstones or aliases changed; the cursor carries no such fingerprint.
- `Observation` is engine-internal; the contract has no type for it.

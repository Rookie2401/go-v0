# @go/repository-engine — Layer C, the projection engine

Turns learner events into multidimensional knowledge estimates, assistance preferences, review candidates, review
eligibility and reading suitability. Imports only `../../repository-contract/src`. Implements `ProjectionEngine`
(`createProjectionEngine`, `modelVersion = 'projection@2'`); consumes `EventLog`, `ProjectionStore`, `LinguisticStore`
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
- (f) no single known/unknown boolean, no single mastery number: a row is eight dimension estimates (projection@2 appended `phraseComprehension`; the first seven keep their order and values)
- (g) the fold is deterministic, order-independent and idempotent (same multiset of events, same rows; duplicate ids change nothing)
- (h) rebuilding from the log equals the incrementally projected state
- (i) the engine never writes a linguistic row
- (j) a projection never invents a success: every positive observation traces to a payload that says `correct: true`, `usedCorrectly: true`, an "understood" mark or a "known" mark
- (k) a phrase is understood as a whole (`phraseComprehension`), never inferred from its words and never from a request for help; an exposure whose language was only detected or defaulted weighs less; an exposure whose language is undetermined is not an observation at all
- (l) confidence never raises a status: eligibility reads the status together with the validation level of the resource behind it (see "Eligibility")

Separation proofs (`test/repository/engine/separation.test.ts`): an encounter raises no demonstrated dimension; playback raises only exposure; a correct written review raises reading or productive retrieval, not listening; an AI-assisted or copied writing correction raises nothing in contextualProduction; a failed review never lowers exposure; a parser correction never erases exposure.

## Observation rules (`evidence.ts`)

An observation is `{unitId, dimension, outcome, weight, assisted, difficulty?, sourceReliability, at, sentenceKey?, eventId, counter?}`.
`weight` is the **effective** weight: `min(base, base x qualityFactor) x reliability`, never above `base`.

- Quality factor from `evidence.quality`: none 0 (the observation is dropped), weak 0.5, moderate 0.8, strong 1. No `evidence` note means 1.
- `reliability = min(kind reliability, evidence.sourceReliability ?? 1)`.
- At most one observation per (event, unit, dimension) (projection@2: a phrase can earn both `contextualProduction` and `phraseComprehension` from one production). An unparseable `at` yields nothing. `payload.difficulty` (0..1) passes through. `weight = min(base, base x qualityFactor) x reliability x languageFactor` (the language factor, below, applies to encounter and lookup exposure only).
- `assisted` is true when the kind's payload says so (hinted, help used, answer shown, `assisted: true`) **or** `evidence.assisted` is true. An assisted observation aimed at an independent dimension is re-routed to `assistedRecognition`.
- Units are `subject.itemIds` unless stated; `sentenceKey` is `subject.sentenceKey` (or the payload's).

| Event | Dimension and outcome | Base weight | Reliability |
|---|---|---|---|
| EncounterRecorded | exposure (counter `encounter`), each `itemIds`; x language factor | 0.2 | 1 |
| SelectionLookedUp | exposure (counter `lookup`); x language factor | 0.3 | 1 |
| AnalysisShown, AssistanceRequested | exposure (counter `assistance`) | 0.3 | 1 |
| AssistanceRequested `assistance: 'phrase'` or `'sentence'` | **plus** assistedRecognition **negative** on the `phrase:` units of the subject (help was needed); never phraseComprehension | 0.15 | 1 |
| PronunciationPlayed, ListeningCompleted | exposure (counter `playback`); **never** listeningRecognition | 0.2 | 1 |
| UnderstoodMarked `helpUsed: false` | readingRecognition positive | 0.4 | 0.4 (self-report) |
| UnderstoodMarked `helpUsed: true` | assistedRecognition positive | 0.4 | 0.4 |
| UnderstoodMarked `helpUsed: false` on a `phrase:` unit | **plus** phraseComprehension positive (self-report) | 0.3 | 0.4 |
| ItemMarked `known` | readingRecognition positive | 0.2 | 0.3 (self-assertion) |
| ItemMarked `learning` | readingRecognition negative | 0.2 | 0.3 |
| ItemMarked `saved`, `ignore` | nothing (a bookmark is not evidence) | | |
| ListeningAssessed (`answerShownBefore: false`, else nothing) | listeningRecognition +/- by `correct`; `hinted` goes to assistedRecognition | 0.8 recorded voice, 0 for synthetic or unverified voices (never listening evidence; D8), x (1 - 0.3 if hinted) | 0.5 if `responseMode: 'self-report'`, else 1 |
| CardReviewed recognition | readingRecognition +/- by `correct`; **on a `phrase:` unit phraseComprehension +/- instead** | 0.7 x grade factor | 1 |
| CardReviewed recall, cloze | productiveRetrieval +/- by `correct`; **on a `phrase:` unit also phraseComprehension +/-** | 0.8 x grade factor (phrase comprehension 0.4 x grade factor) | 1 |
| CardReviewed hinted or `answerShownBefore` | assistedRecognition +/- | 0.4 x grade factor | 1 |
| AssessmentAnswered | grammaticalUnderstanding +/- on `payload.constructionId` and on `itemIds` that are constructions (`morph:` / `syntax:` ids); forms and lexemes in the subject are not credited | 0.8 | 1 |
| AssessmentAnswered hinted | assistedRecognition +/- on the same units | 0.4 | 1 |
| AssessmentAnswered naming a `phrase:` unit in the subject, unhinted | phraseComprehension +/- on that phrase (hinted: assistedRecognition) | 0.7 | 1 |
| ProductionRecorded unassisted, `usedCorrectly: true` | contextualProduction positive (`mode: 'retrieval'` -> productiveRetrieval); **on a `phrase:` unit also phraseComprehension positive** | 0.9 (retrieval 0.8; phrase 0.3) | 1 |
| ProductionRecorded unassisted, `usedCorrectly: false` | contextualProduction negative (retrieval -> productiveRetrieval) | 0.7 (retrieval 0.8) | 1 |
| ProductionRecorded `usedCorrectly: 'unjudged'` | exposure (counter `encounter`) | 0.3 | 1 |
| ProductionRecorded `assisted: true`, or `authorship` other than `independent` / `reproduced-later`, or a non-empty `assistance` list | assistedRecognition +/- by `usedCorrectly` | 0.4 | 1 |
| ProductionRecorded `authorship: 'copied-from-model'` or `'ai-generated'` | nothing: the words are a model's | | |
| CorrectionAccepted, CorrectionRejected | nothing: accepting a correction is copying, not independent production (c) | | |
| DraftSaved, SentenceSubmitted | nothing: an artefact; its judgement arrives as ProductionRecorded | | |
| AnalysisCorrected, ReviewItemInvalidated, CardAdded, CardRemoved | nothing (linguistic or scheduling state; the candidate rules read the card events) | | |
| profile family (enrolment, pack, privacy, consent, preferences) | nothing | | |

**Language basis (projection@2).** An encounter or lookup whose `payload.language.basis` says how the language was settled is weighted by that basis (the factors only lower, principle (e)):

| `language.basis` | override, book-metadata, document-metadata | detection | team-default | undetermined | no `language` block (a v2 event) | unrecognised string |
|---|---|---|---|---|---|---|
| factor on the exposure weight | 1.0 | 0.7 | 0.5 | 0 (nothing was parsed: **no observation**) | 1.0 (counted in full; recorded under `missing`) | 0.5 |

`engine.counters(learnerId, unitId)` returns the usual four counts plus `byLanguageBasis` (encounter and lookup exposures by basis, `missing` for a v2 event). It is on the counters, not on the row,
because the contract's `basis` has no such field; `undetermined` observes nothing and is therefore not counted.

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

- `project(learnerId)`: reads the cursor. No cursor, or a different `modelVersion` (every `projection@1` store, once): full rebuild; the first seven dimensions of every row come out identical and `phraseComprehension` is added (tested). Otherwise reads the events after the cursor seq,
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

Two inputs decide together: the analysis **status** (how sure the producer is) and the **validation** level of the unit and its best live analysis
(how far the resource behind it has been checked). The validation is the lowest of the unit's `provenance.validation`, the analysis's own `provenance.validation` (if any) and the
chosen candidate's `provenance.validation`. A row that states none is a v2 row and reads as `unreviewed`, exactly as the contract's `provenanceOf` says; an unrecognised string reads as `unreviewed` too.
**Confidence is never an input**: a 0.99-confidence experimental analysis is exactly as provisional as a 0.1 one (tested).

Status rank (first-class, higher is more trustworthy): verified > high-confidence > provisional > requires-review > conflicted > invalidated.
The effective status is the lowest of the unit's status and its best live (non-invalidated) analysis; a form whose analyses are all invalidated is `invalidated`; a unit with `supersededBy` is `invalidated` ("superseded by X").

| validation | status reached | eligible for | otherwise |
|---|---|---|---|
| `production-validated` | as stated | verified, high-confidence: every dimension (caveat if several readings and none chosen). provisional: readingRecognition, listeningRecognition, assistedRecognition, caveat `provisional analysis; shown with caveats` | provisional + grammaticalUnderstanding, productiveRetrieval, contextualProduction, phraseComprehension: not eligible, reason `provisional analysis cannot support <dimension>` |
| `experimental`, `seed-only`, `unreviewed` | **capped at `provisional`**, never `verified` | the three recognition dimensions only, with caveats `provisional analysis; shown with caveats` and `<level> resource: provisional at best, whatever the confidence` | grammatical, productive, contextual and phrase items: not eligible, reason `<level> analysis cannot support <dimension>: provisional at best, recognition only` |
| `incomplete`, `unsupported` | `requires-review` | nothing | reason `<level> analysis: a person must review it before it can support an item (confidence does not change this)` |

`conflicted`, `invalidated`, `requires-review` (as a stated status) and an unknown unit are never eligible, each with a reason in `eligibility.reason`; the reasoning of an eligible one is in `eligibility.caveats`.
`STATUS_ORDER` is the engine's rank table (it carries `requires-review`; a test checks it agrees with the contract's `STATUS_RANK` on every status the contract knows).
`affectedByInvalidation(analysis)`: sorted unique `lexemeId`, `senseId` and `constructionIds` of its candidates (not the form id itself).
`affectedByCorrection(superseded, corrected)`: `{ affected, withdraw }`, everything either pointed at, and what the corrected one dropped (the linguistic service returns the same lists from `correct()`).

## Review candidates (`candidates.ts`)

A candidate exists only for a unit with a row (or a construction promoted by leverage) that has a lookup / assistance request (`exposure.negative > 0`), a demonstrated error (any judged dimension with `negative > 0`),
leverage, or a frequency rank <= 2000. Exposure alone excludes it. **A unit whose latest deck event (CardAdded / CardRemoved / ReviewItemInvalidated) is CardAdded is not proposed again**
(`candidates(..., { includeCovered: true })` lists it with the penalty below). Score = sum of reason weights, clamped to 0..1; ties by unit id. `targetDimension` = the weakest dimension with errors (constructions: grammaticalUnderstanding; default readingRecognition).

| Rule | Weight | Condition |
|---|---|---|
| recentEncounter | +0.15 | `lastSeenAt` within 7 days of `now` |
| repeatedLookups | +0.2 | `exposure.negative >= 2` |
| demonstratedError | +0.25 | any judged dimension `negative > 0` |
| weakButSeen | +0.2 | readingRecognition weight > 0 and score < 0.5 |
| grammaticalLeverage | +0.3 | a construction realized (`realizes` relations, status not conflicted / invalidated) by >= 3 **distinct forms in difficulty**: an error ever, or a lookup, assistance request or failed recognition (reading, listening, assisted, phrase) within 30 days of `now`. Detail: `repeated difficulty across N forms of <construction label>`; `explains` lists the forms. The construction is proposed, not each form |
| explained-by-construction | x0.5 | applied to those forms' scores (a negative reason of half their score), **only when the construction candidate is itself eligible** |
| wordFrequency | +0.15 / +0.1 | the unit's `frequency.rank` <= 500 / <= 2000 (a unit is a candidate on frequency alone up to 2000); no rank, no reason |
| goalMatch | +0.05 | unit kind serves a goal (`GOAL_UNIT_KINDS`; `custom` serves none) |
| missionRelevance | +0.1 | the unit is in the pack's mission word list **if the pack facts expose one** (`LanguagePackInfo.missionUnitIds`, none today). Otherwise the rule is skipped and `candidates(..., { notes })` receives `MISSION_SKIPPED_NOTE` |
| existingCoverage | -0.3 | only with `includeCovered`: the unit already has a card ("already covered"). By default such a unit is dropped |
| priorReview | -0.15 | a CardReviewed within 2 days |
| expectedBenefit | +0.1 | confidence on the target dimension between 0.2 and 0.7 |
| benefitVsBurden | +0.05 / -0.05 | benefit = sum of the positive reasons so far, burden = `cost`: ratio >= 2 gains 0.05 (cheap for what it offers), ratio < 0.5 loses 0.05 (costly); the detail prints both numbers; silent in between |
| analysisConfidence (validation) | -0.3 | eligible but the validation level is `experimental`, `seed-only` or `unreviewed`: strong negative, detail names the level |
| analysisConfidence (not eligible) | -(score) | not eligible: score becomes 0 and the candidate is kept only after all eligible ones, at most 5, with `eligibility.eligible = false` and the reason in the detail |

`cost = min(1, 0.2 + 0.1 x label words)`. `limit` defaults to 20 and covers eligible and ineligible together.
The construction rule's window is read from the learner's events (not from the row, which stores weighted sums, not instants): the engine passes, per unit, the instants of its lookups, assistance requests and failed recognitions.
One form failing or being asked about many times does not indict a construction: forms are counted once.

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

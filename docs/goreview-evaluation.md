# GoReview evaluation measures and scenarios

These measures describe the local event history available on this device. They do not change FSRS, Repository knowledge, admission defaults, or learner state. Counts are descriptive and do not establish mastery, transfer caused by a policy, or durable learning efficacy.

## Evidence selection

Review-derived measures first truncate raw history to the requested `now`, then pass that complete as-of history to `selectReviewEvidenceEvents`. This preserves correction rebasing and the shared causal rules used by FSRS and Repository projection without allowing a future correction or ID conflict to rewrite a past metric. Exact synchronized copies count once; conflicting immutable IDs, unresolved parents, malformed claims, cycles, retracted claims, and stale same-device sibling claims do not supply review observations. Plausible cross-device siblings remain visible in the selector; `independentConcurrentSiblingAttempts` makes those close-in-time observations explicit, while a sibling does not itself meet the 24-hour delayed-recall threshold.

`independentReviews` counts selected, causally valid, rated, unassisted review activity with a non-`none` evidence note; it can include weak-quality choice or self-graded events. Delayed attempts and objective-success numerators use the stricter gate: unassisted moderate/strong evidence with effective source reliability at least 0.8. Listening additionally requires `voice:recorded`, typed response, no answer/transcript shown, and no explicit unplayed/audio-failed flag. Choice and self-graded payloads do not meet that delayed-outcome threshold. Consequently, delayed-recall coverage is a rate over all selected review activity, not the success rate among only strong/moderate eligible attempts. Objective full success (`correct:true`, outcome `correct` or legacy outcome omitted) and objectively successful difficult retrieval (`correct:true`, outcome `partial`, rating Hard) are reported separately. A partial event with `correct:false` is a failure. Historical self-Hard payloads lacking a stable self-specific marker remain ambiguous and are never normalized into objective success. Weak numeric evidence remains in the source history but does not enter these stronger descriptive outcomes.

## Measures and denominators

- **Delayed recall** counts selected independent review attempts at least 24 hours after the previous selected attempt for that card. Delayed success is the sum of objective full and successful difficult retrieval; the two subtotals are also exposed. Delayed failure counts explicit incorrect/Again outcomes. Coverage is delayed attempts divided by selected independent reviews; a missing denominator is `null`, while a measured zero is `0`. Qualified cross-device siblings count as activity and knowledge attempts, but their stale schedule prediction/due payload is excluded from schedule-specific due completion and calibration measures; only canonical causal IDs (plus legacy sequential events) supply those measures.
- **Due backlog** reads active, reviewed deck items folded as of the supplied `now`; rows visibly containing future card history or a future add date are ignored. Overdue-card count excludes items due exactly at `now`; median and maximum overdue age include due-now items and are null when there is no due work. Review-level on-time/early counts require `scheduledDueBefore` in the event. The deck input must use the same as-of cutoff as the metrics call.
- **Response latency** accepts only finite `reviewSeconds` from 0 to 900 seconds. Coverage uses selected independent reviews as the denominator. Median latency and seconds per delayed-success target are null when their sample denominator is zero.
- **Admission sustainability** counts unconflicted live `CardAdded` creation events and reports the fraction with any selected follow-up review, plus delayed successful outcomes among followed-up admissions. These are observed follow-up proportions, not evidence that admission caused success.
- **Remediation** counts presentations marked `overlap:remediation` or `remediation-reassessment`; successful outcomes use the same quality and reliability gate. Delayed fail-to-success reassessment also requires at least a 24-hour interval.
- **Transfer and modality** count an independent reading success followed at least 24 hours later by an independent production success for the same unit. GoTell production is accepted only when independently authored, objectively judged correct, unassisted, and at effective reliability at least 0.8. Saved-deck membership is not production evidence. Reading/listening/production/grammar attempt counts use assessment dimensions.
- **Calibration** uses delayed objective outcomes only when a finite `retrievabilityBefore` value in `[0,1]` exists. Brier score is the mean squared error for that observed sample. Audio calibration is a subset of listening-dimension predictions. These samples are observational and may be selected by the scheduler itself.

## Policy comparison protocol

`evaluateChronologicalPrefixes` compares the planner's existing controlled alternatives at supplied chronological snapshots: fixed versus adaptive initial batch target, fixed versus workload-aware admission, and strict due order versus bounded remediation interleave. Each decision first filters raw history to the snapshot's learner, language, and event timestamps, then runs the shared selector on that prefix. A later correction, conflict, or parent cannot rewrite a past decision. Snapshot queue items are rejected when their add date or review history extends past the cutoff; future due timestamps are allowed. The caller must also reconstruct aggregate admission and queue inputs as they were known at each cutoff; the evaluator cannot prove those aggregates were not copied from future state. Later events are selected through the next cutoff and reported in the next observed window, separately from policy decisions; no later outcome is attributed to an alternative that was not run. Use identical cutoffs when comparing a learner cohort and retain counts, workload inputs, and null samples beside rates.

The comparison does not randomize policy assignment, simulate learner responses, or estimate counterfactual retention. It is suitable for checking decision differences, workload, backlog, and observed follow-up—not choosing new FSRS weights or claiming which policy teaches better.

## Deterministic scenario matrix

The transfer scenario tests exercise the real planner, session runner, FSRS fold, shared review selector, and Repository projection where each boundary applies. Synthetic history and a controlled clock make outcomes repeatable.

| Scenario | Invariant exercised |
| --- | --- |
| A. Beginner | Prepared eligible intake outcomes enter the real planner with no due cards and a one-card admission cap; separate GoLearn service tests verify encounter intake. |
| B. Repeated failure | Multiple targets reach repair deferral; study, delayed reassessment and unresolved carryover remain separate from FSRS relearning. |
| C. Recognition before production | Spaced reading proof admits productive practice without manufacturing evidence that production has already succeeded. |
| D. Advanced backlog | Due scheduled work remains in the plan under the workload bound when there is no new intake. |
| E. Two offline devices | Both plausible sibling attempts remain selected as evidence; the deck fold applies only its deterministic canonical schedule branch. |
| F. Interrupted session | An unanswered timed return remains persisted and recoverable before and after its actual due time. |
| G. Rapid recognition | Five closely spaced correct reviews do not satisfy delayed-independent Known qualification. |
| H. Saved deck | Saving, reopening, repeating and removing a collection preserve its canonical memory history and report exhaustion honestly. |

The Phase 3 level tests separately cover post-New reset cohorts: a reset's visible inference starts from evidence strictly after the mark, while its complete numerical history remains preserved.

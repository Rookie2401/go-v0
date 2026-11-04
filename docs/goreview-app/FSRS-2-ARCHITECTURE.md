# GoPractice 2 architecture and evidence policy

GoPractice has three primary destinations: GoReview, GoTell, My Vocabulary. Settings, account, history and diagnostics remain utilities. GoTell's implementation and private-document storage are preserved.

## Scheduling and prioritization

The narrow scheduling adapter uses `ts-fsrs` 5.4.2 (MIT, FSRS-6), including its learning steps, stability, difficulty, due timestamps, repetitions and lapses. Fuzz is disabled for reproducible event replay. Invalid timestamps, backwards review clocks, invalid parameters and nonfinite memory state are rejected. Retention defaults to 90% for every stage. Grades retain the actual scheduler profile, including weights and parameter identity, so changing preferences does not rewrite prior scheduling mathematics.

Knowability remains New, Seen, Recognized, Familiar, Known, Automatic. It is not a card lifecycle state or a fixed recall probability. The central experimental policy weights these stages 0, 0.30, 1.50, 1.50, 0.25, 0.03 respectively. Eligibility precedes ranking. New is excluded automatically; Seen requires meaningful evidence or an explicit request; Automatic requires confirmed independent failure or explicit practice. A missing stage does not automatically introduce a new target. Existing legacy targets receive conservative maintenance behavior.

The priority policy exposes normalized factors: 45% forgetting risk, 25% reading relevance, 15% retrieval difficulty, 10% diversity and 5% overdue urgency. Evidence quality, recent natural exposure and expected review cost adjust value. Missing evidence receives conservative defaults rather than maximal confidence. Global ranking applies across due, recovery and newly admitted targets; due dates are not rewritten to manufacture stage distributions. New-target limits bound introductions. Grammar quotas do not override value ordering. Repeated failures trigger content-repair deferral rather than endless drilling. Recent valid review durations improve cost estimates, excluding long idle periods.

Default recognition targets use lawful verified pack examples when available and a labeled word-only fallback otherwise. Singular reliable form-to-lemma links suppress duplicate recognition targets, while ambiguous senses and explicit morphology objectives remain distinct. Native scripts and meaningful accents remain intact. No copied book sentence is required or stored in event payloads.

## Honest grades and durable sessions

Again means failed retrieval; Hard means successful recall with difficulty. Assistance, no-attempt reveal, challenged answers and failed audio receive no FSRS grade. They do not masquerade as independent retrieval. A revealed answer cannot be copied into the typed-answer path for stronger evidence. Self-grading remains a self-report.

The runner serializes mutations and guards the requested position against duplicate actions. It saves an initial checkpoint before displaying a prompt, records the review before advancing, and reconciles deterministic committed event IDs after interruption. Unanswered cards are not graded. Undo appends a validated correction referencing the original event; it retracts the original from effective scheduling and evidence without deleting raw history. Canonical correction handling is shared with Repository projection, and duplicate corrections cannot restore the grade.

New graded submissions carry an expected predecessor. Both Repository backends reject stale review state atomically. Refused local submissions remain inspectable in the rejected queue and audit log; GoPractice excludes them from effective memory calculations. Legacy events remain ingestible without manufacturing new grades.

## Vocabulary and migration

My Vocabulary queries the shared encountered-unit projection, independently of the candidate queue and review deck. Its catalog totals include encountered, unreviewed entries and exclude dictionary-only entries. Forms and lemmas are distinct Repository records and are labeled accordingly. Pages are bounded; linguistic explanations are loaded only when details are opened.

Repository indexes support catalog queries and card history. Existing migrations are preserved; new indexes are introduced through an additive migration. Explicit learner Knowability assertions remain assertions. Review-only production counts no longer imply Automatic reading recognition; the projection version changes and rebuilds from immutable evidence. No encounter is converted into a fictional FSRS review.

## Personalization

The official Node optimizer, chronological validation gate and explicit profile activation/reset are described in [OPTIMIZATION.md](OPTIMIZATION.md). Personalized recognition parameters do not replace production or listening profiles. There is no background fitting, automatic activation or claim that prediction accuracy establishes reading comprehension.

Unversioned legacy grades replay with the supported 90% default, independent of subsequently activated preferences. New grades replay with their exact stamped scheduler profile. An unknown historical custom retention setting cannot be reconstructed from an event that never recorded it.

## Deck fill (2026-11-03)

The rule, from the owner: when a deck is finished it is always immediately replaced by another deck of equal size. The design of the deck is subject to the spaced-repetition software, but the quantity of the deck is always what the learner set (`preferences.cardsPerDeck`, 5 to 60, default 10).

`planSession` therefore ends an automatic plan with a fill pass. Due learning and relearning returns, due reviews, remediation and the budgeted new admissions are planned exactly as before; if that is fewer than the deck size, the deck is completed with cards that are not yet due, soonest `schedule.due` first (ties: lower retrievability), until it reaches the size. The pass runs for the automatic intent only: saved decks, selected words, reassessment and Repeat are explicit plans and are never filled.

Fill is explicit early practice. Each fill item carries the intent `{ kind: 'explicit', reason: 'early-review' }`, `overlap: 'explicit'` and `presentationReason: 'deck-fill'`, and is queued as `learning` for a learning or relearning card and `due` otherwise. The review event therefore records `practiceIntent: early-review`, and the fold (`scheduler/deck.ts`) keeps the schedule on a success and reschedules only on Again. Fill creates no due obligation and no new card, so the home still counts only what is due, and `dueCount` and `newCount` do not include it.

What is never fill: a card with no effective history (fresh work is governed by the new-card budgets), a card that is already due (it is planned as due work), a suspended, dismissed, snoozed, invalidated, blocked or repair-required card (every fill candidate passes the shared `reviewEligibility` with the early-review intent, and eligibility is not loosened), a unit at the Automatic knowledge level, a Class Essentials card, a set-aside unit, and any catalog word that is not a deck card.

Unchanged: the new-card budgets (`maxNew`, the daily allowance, the workload-aware admission limit) and the session time limit. A fill card that would pass the limit is skipped with `over-time-budget` and nothing is written; cards that were not needed as fill keep their `scheduled-not-due` or `learning-not-due` entry, so the selection report stays truthful. A plan that used fill adds one sentence to `batch.reasons`, for example "Filled to the deck size with 7 early reviews (soonest due first)."

The home's decks choose the pool through `PlanInput.fillPool` (the cards to try, in order; absent, the planner derives it from `deck`). The Review Deck draws on spaced reviews that are not yet due. The Current Deck draws on learning and relearning cards that are not yet due first, then borrows the soonest spaced reviews when its own run out. The whole deck draws on every card that is not yet due.

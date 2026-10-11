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

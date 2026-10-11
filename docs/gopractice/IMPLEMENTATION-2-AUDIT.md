# GoPractice 2 implementation audit

The user master prompt supplied on 2026-10-10 is the acceptance specification. The existing application is `packages/gopractice`, built as a static site and as `packages/golearn-extension/dist/practice`. Its shared learner authority is the event-sourced Go Repository; GoTell documents are stored separately with revision checks.

Baseline before this rebuild: 27 files, 439 tests passed across GoPractice, GoReview and GoPractice integration suites. The existing scheduler is genuine ts-fsrs 5.4.2 / FSRS-6, with 90% default requested retention and deterministic scheduling. Preserve this integration rather than replace it with an approximation.

## Conflicts recorded before implementation

- Primary navigation currently offers GoReview, GoTell and Settings. Replace Settings as a primary destination with My Vocabulary; keep settings as a utility and preserve its route.
- The existing queue has due/weak/new tiers and a grammar quota rather than the requested independent Knowability-weighted value policy. New must be excluded from automatic selection; Seen needs meaningful evidence, and Automatic recovery requires confirmed retrieval failure.
- Hinted correct answers currently yield Hard and mutate FSRS. Assisted understanding and no-attempt reveals must retain honest evidence without a graded memory update.
- Post-commit corrections currently cannot reverse the folded schedule. Introduce validated append-only reversal semantics, preserving the original audit history.
- Existing session recovery exists in the domain runner but is not fully connected to the application workspace. Wire resume/end and guarded undo into the real UI.
- Review loads only 40 candidates. This cannot represent My Vocabulary. Add a paginated shared Repository encounter catalog including unreviewed entries.
- Projection version 4 can infer Automatic from two production observations. The new specification rejects a fixed count of review successes as evidence of automatic reading. Preserve explicit learner assertions and existing history; conservatively stop inferring Automatic from review-only production counts. Record the changed projection version and migration/rebuild behavior without manufacturing reviews.
- Distinct concurrent review events currently both apply. Add an explicit predecessor check and a recoverable conflict result while retaining accepted event history.

## Implementation ownership and sequence

Sol owns contracts between lanes, GoPractice engine/workspace integration, and combined verification. GPT-6 Luna workers own GoReview policy/scheduler/session, Repository catalog/correction integrity, and GoPractice interface respectively. Existing dirty work and prior translation changes are preserved. GoTell remains functionally unchanged.

Use lawful verified pack examples or a labeled context-free fallback. No copyrighted sentence persistence or remote translation is necessary. Optimization must use the official binding with sufficiently reliable history; defaults remain active until validation justifies another profile. No optimization claim is made merely because FSRS scheduling is installed.

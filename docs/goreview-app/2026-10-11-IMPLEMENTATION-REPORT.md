# GoPractice 2 implementation report — 2026-10-11

Implementation commit: `7f25c290` (87 files). Team: three authorized GPT-6 Luna workers, with Sol integration and final verification. Worker usage limits prevented an additional independent final worker review.

## Delivered

- Three primary destinations: GoReview, GoTell, My Vocabulary; Settings remains a utility.
- FSRS 6 via ts-fsrs, separated from Knowability. Exact requested stage weights, transparent experimental priority factors, Seen eligibility, Automatic lapse handling, leech repair and conservative legacy maintenance.
- Contextual written recognition by default, with honest word-only fallback. Explicit retrieval attempt and assistance handling; revealed answers cannot become stronger typed evidence. Grades persist before advancement.
- Initial durable checkpoints, recovery against committed event IDs, serialized submissions, atomic predecessor checks in Memory and SQLite, append-only undo/corrections and shared effective-history handling.
- Full encountered vocabulary independent of the review queue: bounded pages, stage counts, filters, lazy details, sources, available grammar information, save and suspend/resume actions.
- Additive Repository migration and projection@5 migration. Historical Automatic labels carry explicit legacy provenance; immutable history remains intact.
- Official local Node optimizer binding 0.5.0 with minimum-data and chronological holdout gates. Explicit candidate import/activation/reset. No automatic training or activation; no remote excerpt transmission.
- Exact new scheduler profiles replay per grade. Unversioned legacy grades use the supported 90% default rather than subsequently changed preferences.

## Verification

Baseline: 27 files / 439 tests passed.

Final-source checks on October 11:
- 97 files / 1,804 tests passed: GoPractice, GoReview, GoTell, Repository and offline review suites.
- Repository v3 contract: 57 passed; ecosystem boundaries: 8 passed; correction contract: 2 passed.
- Typecheck passed. Web and extension-mode GoPractice production builds passed.

Additional checks during implementation:
- Broad acceptance run before the final legacy-profile replay fix: 99 files / 1,868 passed. After that fix, focused profile/replay checks: 4 passed; the final-source suites above include the added regression.
- Official optimizer: 4 passed, including a real binding fit and temporal holdout evaluation using generated histories.
- Extension/bundle integration: 34 passed; cross-application Repository/GoLearn checks: 53 passed.
- These counts overlap; they are not an aggregate unique-test count. No coverage percentage was measured. The entire repository suite was not rerun; six previously recorded unrelated failures are outside this acceptance claim.

Live in-app browser used the real application, adapters and on-device Repository with an isolated generated-data fixture. Verified the three destinations, Albanian context, reveal/attempt/grade flow, durable save, undo, reload recovery, canonical form/lemma intake, Hindi and Thai script display, GoTell availability, and phone/tablet widths without horizontal overflow. No personal learning data was altered. Screenshot: `work/gopractice2-mobile.jpg`.

## Build locations

- Web: `packages/goreview/app/dist/index.html`
- Packaged extension practice: `packages/golearn-extension/dist/review/index.html`

## Remaining limitations

- Latest live verification was in the in-app browser, not native Brave. The packaged build is ready for Brave reload and native verification.
- Production builds warn about unresolved EB Garamond font paths, deferred to runtime. Functional browser checks passed, but packaged font availability needs a separate asset check.
- Vocabulary totals count Repository unit records: forms and lemmas are labeled separately. Search includes labels, known aliases and bounded recent surface metadata; it does not provide a complete historical-form or English-gloss index.
- Grammar explanations are as complete as the installed language packs permit; missing pack knowledge is not fabricated.
- SQLite store benchmark covered 10,000 records, not a 100,000-record full UI performance guarantee.
- No actual learner-specific optimizer profile was trained or activated, and advanced profile import was not exercised live with a personal dataset.
- Unknown custom scheduler settings cannot be reconstructed from older events that omitted them. Self-grades remain self-reports. Knowability policy weights are experimental rather than empirical comprehension guarantees.
- Other pre-existing language/translation/speech changes remain in the working tree outside this implementation commit. No push or deployment was performed.

See IMPLEMENTATION-2-AUDIT.md, FSRS-2-ARCHITECTURE.md and OPTIMIZATION.md for design, migration and optimizer details. Final logs are retained locally as work-gopractice2-delivery-*.log.

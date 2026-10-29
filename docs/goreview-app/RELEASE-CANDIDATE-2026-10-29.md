# GoReview 3 release candidate, 2026-10-29

The candidate is branch `rc/goreview-3`: the Codex agent's `codex/goreview-3-2026-10-28` (GoReview 3: the adaptive review, evidence
validity and release provenance; four commits ending 40d0175f) merged with GitHub master 6b8a6f9a across the GoPractice-into-GoReview
rename (78c1d342), then the fixes the 2026-10-29 reviews called for. The commit that carries this note is the candidate; its parent
3134cd5b is the revision the counts below were measured on (this note and the post-save message are the only differences).

Nothing here was published, deployed or submitted. Pages, the Repository service on Render and TestFlight stay the owner's clicks.

## What the candidate contains

- GoReview 3 as committed by Codex: typed card creation, recorded-profile replay, the shared eligibility check on every route, the
  per-session and UTC-day admission budgets, timed learning returns that displace unshown lower-priority work, the persistent
  remediation backlog, the causal review convergence, per-dimension candidate coverage, the release manifest.
- Master's interface work up to 6b8a6f9a (the one-package layout, the account page, the phone top bar, the loading globe, the deck
  stepper) with nothing re-applied twice: the stylesheet is master's.
- The review-driven fixes of 2026-10-29, each with a regression test (see the commit messages for the detail):
  explicit practice before a card is due keeps the schedule; an explicit first creation charges the daily budget; the memoised home
  notices a return that came due; the wrong-key report sets the card aside until a facts repair; the Hebrew and Greek folds reach the
  grader; replays beyond the allowance are help; the answer-leak check sees combining marks; My Vocabulary adds a phrase as
  phrase-comprehension; the 24-hour sibling window is strict; `verify --release` checks the artifact's commit against HEAD and hashes
  the native-shell inputs; the Cards-per-deck maximum is the micro-deck ceiling; the contract validates typed creations and practice
  intents; the screen audit drives the GoReview 3 screens and the three accessibility defects it found are fixed.

## Building and verifying the web artifact

From a clean checkout of the candidate commit, with the reference assets in place (`public/dict`, `public/lexicon`, `public/library`;
they are generated inputs, not dependencies):

```powershell
$env:GOREVIEW_SERVICE_URL = 'https://go-v0.onrender.com'
$env:GOREVIEW_DICT = 'hi,la'
npx vite build -c packages/goreview/app/vite.config.ts --mode review
node scripts/goreview-release.mjs verify packages/goreview/app/dist-review --release
```

`verify --release` refuses a dirty checkout, a changed artifact, a missing scheduling module, and since this candidate an artifact
whose recorded commit is not the checkout's HEAD. `docs/goreview-release-traceability.md` has the manifest's contents, the rollback
steps and every environment variable.

## Verification

Measured on 3134cd5b in the clone `C:\Users\CJWal\dev\go-v0-master` (Windows 11, Node 24.19, the repository's locked dependencies):

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit -p tsconfig.app.json` | clean apart from the five pre-existing errors outside GoReview (privacy.ts, the audio and speech bridges, the service handler's Node bridge, a Capacitor type) |
| GoReview, app, e2e, contract, Repository, optimizer, conformance, ecosystem | `npx vitest run test/goreview test/goreview-app test/goreview-app-e2e test/contract test/repository/engine test/repository/sync test/repository/store test/repository/service/mobile-cross-device.test.ts test/repository/service/dimension-admission.test.ts test/server/review-optimizer.test.ts test/audit/conformance.structure.test.ts test/audit/conformance.imports.test.ts test/ecosystem` | 109 files, 1,856 passed, 94 skipped, 0 failed |
| Screen accessibility audit (run alone) | `npx vitest run test/audit/a11y.screens.test.ts` | 16 passed |
| Stylesheet accessibility audit (run alone) | `npx vitest run test/audit/a11y.css.test.ts` | 24 passed |
| Developer-mode review build and manifest verification | the build above with `GOREVIEW_RELEASE_MODE=developer`, then `verify` without `--release` | built in 8 s; 3,149 artifact files verified; 10 required scheduling modules present |

The 94 skipped cases need an external PostgreSQL server (`TEST_DATABASE_URL`); the store suite ran on PGlite and SQLite. They are not
counted as passing. The release-mode build of the final commit and its `--release` verification are recorded in the final report.

Learner scenarios with deterministic clocks: A–H in `test/goreview/transfer/scenarios.test.ts` (beginner, struggling, intermediate
recognition-to-production, advanced, two offline devices, an interrupted timed return, rapid repeats, a saved collection) and I–K in
`scale-scenarios.test.ts` (a returning learner with 1,500 overdue cards, 2,000 cards with 20,000 chained reviews reconstructed in
about 1.5 s and identically from any delivery order, a multilingual learner across Latin, pointed Hebrew and Greek). An active
reader's GoLearn encounters reach admission through the Repository's candidates (scenario A and `test/repository/engine`).

## The October 27 findings

| # | Finding | State in the candidate |
|---|---|---|
| 1 | Filler bypassed snooze, suspension, dismissal | Resolved: no filler; one eligibility check at planning, presentation and answer on every route |
| 2 | New-card limits exceeded | Resolved: session and UTC-day budgets; an explicit first creation now charges the day (fixed here); an explicit re-review of an existing card is free by design |
| 3 | Fresh review without CardAdded lost progress | Resolved: typed creation in the same batch; orphan recovery; the creation fields are validated by the contract (added here) |
| 4 | Replay ignored personal profiles | Resolved: each review replays under its recorded profile |
| 5 | Concurrent offline reviews | Resolved: one canonical branch per predecessor; the sibling window is strictly under 24 hours (fixed here) |
| 6 | Scheduling exclusions vs evidence validity | Partially resolved: one shared selector feeds both, but the rated-and-unassisted predicate exists twice and no parity test compares the two included sets (open, documented) |
| 7 | Hard as failure | Resolved for new events (Hard is weak success in both projections); events recorded before stay as recorded |
| 8 | Coverage blocked productive admission | Resolved: coverage is per dimension; the client sends its goals |
| 9 | Full batch starved timed returns | Resolved: a due return displaces unshown lower-priority work; it cannot displace explicit practice (by design) |
| 10 | Weak follow-up not persistent | Resolved: the backlog derives from synced events; an ordinary failure clears on any later unassisted non-failing answer, a repair needs moderate evidence (documented) |
| 11 | Rapid successes promoted to Known | Resolved: four independent typed positives, two of them 24 hours after the previous |
| 12 | Save-deck message overstated | Resolved: the message counts what remains after the hold-out (fixed here) |
| 13 | Class Essentials apart from due work | Superseded: due class cards are shown on the home with their own count and start, kept out of the ordinary queue by design |
| 14 | Settings contract failures | Resolved: the centred stepper, the advanced disclosure and Reset are committed and tested |
| 15 | Artifacts not traceable to source | Resolved: the manifest, `verify --release` with the HEAD check, the native-shell inputs hashed |

## How the deck behaves

- **Due cards** come from the fold of the learner's events under FSRS with each review's recorded profile; a card is due when its
  schedule says so, in learning/relearning first, then review.
- **New cards** are admitted from the Repository's candidates through intake, within `maxNew` per session and the UTC-day allowance,
  throttled by workload; nothing fills a batch from the vocabulary catalogue.
- **Batch size** starts at ten, shrinks by two under sustained strain, grows by two under sustained speed across modalities, and
  never exceeds the learner's Cards-per-deck maximum; fewer are offered when fewer are eligible.
- **Overlap** between batches is scheduled (a due return or review), remediation (a ready reassessment) or explicit (the learner's
  own choice); nothing repeats to fill a deck.
- **Timed returns** are inserted between prompts when they fall due, displacing unshown lower-priority work within the caps; pending
  returns survive reloads and devices.
- **Remediation** is a backlog derived from events: a study marker, a ten-minute delay, then an independent reassessment.
- **Skill progression**: a Familiar or Known word with spaced recognition can be offered retrieval, listening or application through
  per-dimension coverage; New and Seen words get recognition only.
- **A session ends** with the summary: what was answered, what is still due, the next return and review times, the remediation state,
  "Continue ready work" only when work exists, and "Repeat this batch" under optional extra practice. Nothing manufactures work.

## Integration

- GoLearn to GoRepository: encounters, lookups and marks are exposure or self-report; none is a retrieval success.
- GoRepository to GoReview: candidates with per-dimension coverage; knowledge rows under projection@7.
- GoReview to GoRepository: the three review kinds, corrections and invalidations; evidence weights by grade, quality and reliability.
- GoTell: production evidence credits productive and contextual knowledge and never reaches a card's schedule (structural: only the
  three review kinds reach the scheduler).
- Saved decks share the cards' histories; a saved deck's unseen words count as introductions when first answered.
- Platforms: the web build is verified; the iPhone wrapper was not built (the last documented TestFlight build is 11; the next must be
  12 or higher; EAS quota applies); offline and reconnection behaviour is covered by tests, not by a device run.

## What still blocks a production publication

1. The Repository service on Render runs an older commit. The candidate's service (projection@7, per-dimension candidate objectives,
   POST /me/profile, the review classification) must be deployed from the candidate before the web artifact is published, or the home
   will plan against stale knowledge rows and skill progression will not reach the client. The deploy branch the owner uses
   (`fix/sync-reliability-2026-10-24`) is behind; the owner decides which branch Render builds. The first load after the deploy refolds
   cached rows under projection@7.
2. The native build is unverified: no iOS compile, no device run, no TestFlight upload from this candidate.
3. The master branch on GitHub does not contain the candidate; landing it is the owner's decision (a fast-forward from the candidate
   branch, since it contains master).

## Research opportunities, not defects

Calibrating the micro-deck heuristics on learner data; the typed-answer requirement for Known (self-graded flashcards never reach it,
by design) and whether a reassessment should accept weak evidence; a parity test between the scheduler's and the projection's included
review sets; article handling and synonym keys per language; audio-transcription, which no path proposes today.

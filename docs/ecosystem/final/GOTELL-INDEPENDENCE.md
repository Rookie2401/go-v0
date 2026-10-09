# GoTell independence — proofs, shared parts, authorship and evidence

Status: 2026-10-09. Sources: `GOTELL-ARCHITECTURE.md`, `GOTELL-TEST-REPORT.md`, `packages/gotell/README.md`, `audit/ARCHITECTURE-CONFORMANCE.md` §4(d), `audit/END-TO-END-INTEGRATION.md` step 37,
and the tests named below (I re-ran `test/gotell/boundary.test.ts`, `test/gotell-e2e/albanian-acceptance.test.ts` and the certification test on 2026-10-09 at 10:09–10:11: all passed).
GoTell is the writing workspace inside GoPractice (`#/tell`); it is a sibling of GoReview, not a child. The writer's text is the artefact; corrections are proposals.

## 1. The three proofs

| proof | what is checked | tests |
|---|---|---|
| import scan | `packages/gotell` imports only its own files, the contract, the language packs, the sync client and the service API client; nothing from GoReview, the shell, GoLearn or GoListen; no GoReview vocabulary in code (deck, scheduler, session). The screens, engine wiring and workspace logic import nothing of the review side. Statically, GoTell's package index reaches 174 files and no `goreview`, `gopractice`, `golearn-extension` or `controlled-reader` file; the converse holds for GoReview | `test/gotell/boundary.test.ts` ("imports nothing from GoReview, the shell, GoLearn or GoListen ...", "does not mention GoReview vocabulary in code"); `test/gotell-engine/boundary.test.ts` ("never import the legacy engine, the core, an adapter, GoReview, the shell or a store"); `test/gotell-ui/workspace.test.ts` ("imports nothing of the review side ..."); `test/audit/conformance.imports.test.ts` "(d) GoTell and GoReview are independent" (x4) |
| no-history learner | GoTell initialises with an empty log: no deck, no session, no review event, no knowledge; a learner with no review history gets the full workflow (profile, prompt, analysis, hint, save, evidence, export) | `test/gotell/boundary.test.ts` "works with an empty log: no deck, no session, no review event, no knowledge"; `test/gotell-e2e/albanian-acceptance.test.ts` "a learner with no GoReview history > has the full GoTell workflow ..." |
| step 37 of §14 | no GoTell event is a `Card*`, `ReviewItem*`, `AssessmentAnswered` or `ListeningAssessed` event; the deck folded with and without GoTell's events is identical; a second learner with no review history signs in on a fresh device and writes and analyses in GoTell | `test/certification/albanian-reference-e2e.test.ts` "37. GoTell operated without touching review schedules, and works for a learner with no review history" |

Also exercised in a browser pane on 2026-10-09 (before the later fixes, not repeated): the GoTell page loads with an empty deck and no session.

## 2. What GoTell shares, and what it never touches

| shares (by design) | never touches |
|---|---|
| the GoPractice shell: sign-in, routing, design system, the device event queue and local log | GoReview's deck, schedule, sessions, intake, planner or exercises |
| the Repository: service API client, private documents, preferences, and read access to item knowledge | review events (`CardAdded`, `CardReviewed`, `CardRemoved`, `AssessmentAnswered`, `ListeningAssessed`, `ReviewItemInvalidated`) |
| the language pack runtime and checker | GoListen (no audio in GoTell) and GoLearn's extension code |
| `repository-sync` (event ids, document sync) and the contract | the store, engine or linguistics service directly |

The Repository's knowledge rows already fold evidence from all three producers, so GoTell's writer profile ("words you can use", weak constructions, recurring errors, goals) can reflect what GoLearn and GoReview recorded.
That is the shared learner model, not a code or state dependency on GoReview; it keeps recognition and production apart (reading is not production).

## 3. Authorship rules (`packages/gotell/src/engine/authorship.ts`, tests `test/gotell-engine/authorship.test.ts`)

Six kinds, judged per saved sentence from the assistance steps shown for that sentence (each step records `sentenceIndex` and a sentence hash):

| kind | rule |
|---|---|
| `independent` | no step touched the sentence, however much help its neighbour received |
| `after-hint` | only levels 1–3 were shown, whatever the learner then wrote |
| `revised-after-feedback` | a correction or model was shown and the learner wrote something else |
| `copied-from-model` | the text equals a shown correction (level 4) or model (level 6), including a correction the learner accepted |
| `ai-generated` | the text equals what a remote assistant proposed |
| `reproduced-later` | an earlier assisted sentence written again independently |

A legacy step with no sentence reference falls back to the whole-round rule (it never over-credits). Still open (GOTELL-TEST-REPORT §5, ARCHITECTURE §5): matching is by position and hash, so a hinted sentence deleted and another moved
into its position is judged after-hint (under-credits, never over-credits).

## 4. Evidence GoTell submits (`packages/gotell/src/evidence/evidence.ts`; producer `gopractice-tell`)

| event | content | credit rule |
|---|---|---|
| `DraftSaved` | one per saved version; counts and ids; quality `none` | none |
| `ProductionRecorded` | one per sentence: `mode`, `assisted`, `assistance` kinds, `authorship`, `usedCorrectly`, `sentenceKey` (hash), `draftId`, `wordCount`, unit ids (at most 24) | `usedCorrectly: true` only for a sentence the checker covered and found clean and whose authorship is independent, after-hint or reproduced-later; accepting a correction never makes it true; copied and AI sentences carry `evidence.quality: 'none'`; clean unassisted is `moderate`, otherwise `weak` |
| `CorrectionAccepted` / `CorrectionRejected` | ids and categories, never text | the engine credits nothing for either |
| `ConsentGiven` / `ConsentWithdrawn` | scope `gotell:remote-assistance`, no text; recorded before the switch takes effect on, immediate off | none |
| `PreferenceChanged` goals | key `gotell:goal`, payload `label` (the contract refuses a `text` key; older `text` goals are still read) | none |

No event carries sentence text; dedupe key `tell:production:<draftId>:<sentenceKey>:<authorship>` makes repeated saves one observation. The text lives in one private document per draft with immutable versions
(optimistic revisions, conflict copies on two-device edits). Verified at step 36 and in the acceptance test: contextual production of "libër" rose from the independent clean sentence; the hinted one counted as assisted recognition; productive retrieval did not move.

## 5. Limits

* Albanian only has a checker; other languages open the workspace and say they cannot be checked (Spanish: "no checker coverage worth the name"). It misses coordinated subjects, object-without-preposition errors and some agreement cases. Prompts, frames and cultural notes are machine-drafted and unreviewed.
* No remote assistant is wired. The consent gate and records are exercised with test doubles only; `RemoteAssistantGate` accepts only the boolean `true` (S-14 closed).
* The browser walk predates the fixes for per-sentence authorship, the coverage line and the consent event; it was not repeated.
* Independence is shown by static scans and by simulated runs in jsdom; no installed-browser test of GoTell alone exists.

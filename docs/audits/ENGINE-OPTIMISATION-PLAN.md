# Engine optimisation programme — 2026-10-07

Implements items 4–18 of `docs/audits/COURSE-AUDIT-2026-10-07.md` §4 (the shared learning loop). Packages run as
separate agents with exclusive file ownership; shared files are edited with targeted edits only, never rewritten.
Stage by path only. Every package: typecheck clean, its own tests green, the existing tests it touches still express
the same intent, no behaviour change for the five shipped courses beyond what the item asks, and a report with
measured numbers.

## Wave 1 (parallel)

| pkg | audit items | what | owns |
|---|---|---|---|
| R1 retrieval | 4 | A daily retrieval set from the learner's own read sentences: cloze on weak/overdue/orphan items in the sentence they were met in (never isolated flashcards); interval table like GoTell's `DUE_HOURS`; a correct unaided recall is recorded as a production demonstration through the existing `ProductionRecorded` event (modality `recall`), never through a new evidence kind; a `/practice` page and a Home/Reading entry; Vocabulary page row gets "practise" | `src/golearn/retrieval/**` (new), `src/ui/pages/Practice.tsx` (new), route in `src/ui/App.tsx` (one line), `src/ui/pages/Home.tsx` (one entry), the Vocabulary section's row action in `src/ui/pages/Settings.tsx`, `test/golearn/retrieval*.test.ts`, `test/ui/practice.test.tsx` |
| R2 forgetting | 5, 18 | Time decay in the "likely familiar" estimate and in `recognized` (an item not met for `DECAY.weeks` drops to met-before and counts half in reach); `POLICY_VERSION` bump with a migration note; the simulator models the same decay and reports words-per-known-lemma with and without it | `src/golearn/policy.ts` (evidence/estimate/decay sections only, Edit), `src/golearn/fold.ts`, `src/golearn/queries.ts`, `src/golearn/state.ts`, `src/sim/**`, `scripts/simulate-learner.mts`, `test/golearn/decay*.test.ts`, `test/sim/**` |
| R3 prompts | 6, 17 | Per-text recall prompts generated from the text's own sentences (cloze of a weak known word; a yes/no about a marked sentence); answering correctly emits the existing `ComprehensionReported` for that sentence; the four-button text report stays but gains the prompts first; dwell credit unchanged | `src/golearn/prompts.ts` (new), `src/ui/reader/Prompts.tsx` (new), `src/ui/reader/Reader.tsx` (mount point only, Edit), `test/golearn/prompts.test.ts`, `test/ui/prompts.test.tsx` |
| R4 route | 7, 8, 12b | Adaptive ladder: after a unit reported below "Most" or with help on > 25 % of words, offer a reread or an easier unit before the next; after two such units, Stage 0's recall card. Reach floor 0.85 for authentic texts (0.75 stays for controlled); the `challenge` setting exposed in Settings → Reading (easy/steady/stretch) and passed to `recommend()`; the gate's orphan lemmas feed `reinforces-weak-items` | `src/golearn/recommend.ts`, `rank.ts`, `candidates.ts`, `personal.ts`, `src/golearn/policy.ts` (REACH/RANKING sections only, Edit), `src/ladder/path.ts` (next-unit rule), the Reading section of `src/ui/pages/Settings.tsx`, `test/golearn/adaptive*.test.ts`, `test/golearn/recommendReach.test.ts` |
| R5 courses | 9, 10 | Fading assistance profiles for Spanish, German, Norwegian (model: Hindi's shelf profiles); shelves get a stage key so `catalog.currentStage` works for shelf courses and readiness + pace show in every course | `src/course/spanish.ts`, `german.ts`, `norwegian.ts`, `catalog.ts`, `src/ui/pages/Course.tsx`, `src/ui/course/StageStatus.tsx`, `test/course/*Catalog.test.ts`, `test/ui/course*.test.tsx` |
| R6 stage0 | 13, 15 | Stage 0 gates: a step counts toward the exit only when its checks are secure; the ladder opens only after the exit's reading section passes; speaking tasks pair the learner's attempt with the model for a reviewer (retelling, not reading aloud) | `src/stage0/**`, `src/ui/stage0/**`, `src/ladder/path.ts` (`stage0Status` only, coordinated with R4 by Edit), `test/stage0/**`, `test/ui/stage0*.test.tsx` |

## Wave 2 (after wave 1)

| pkg | items | what | owns |
|---|---|---|---|
| R7 unseen check | 11 | Every N texts, one held-out text at the learner's reach with R3's prompts; result reported as readiness, never a level; held-out texts excluded from recommendation for 60 days | `src/golearn/assessment.ts` (new), `src/course/readingAssessment.ts`, `src/ui/course/UnseenCheck.tsx` (new), tests |
| R8 listening practice | 14 | The reader plays the device voice for a sentence as practice, never evidence (eligibility unchanged) | `src/ui/reader/useListen.ts`, a small control in `Reader.tsx` (Edit), tests |
| R9 frequency | 16 | Corpus frequency from the installed libraries for es/de/hi/th/sq written into the dictionary manifests (`hasFrequency`), used by `usefulUnknown` | `src/dict/build.ts`, `scripts/dict-build.mts`, `src/golearn/rank.ts` (usefulUnknown only, Edit), tests |

## Wave 3 (lead)

Simulations re-run for all six courses with decay and adaptivity; full suite; audit addendum; commit; Pages rebuild.

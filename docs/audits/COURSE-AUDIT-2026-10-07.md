# Six courses audited — 2026-10-07

**The owner's request.** Audit the whole app again, say which courses are good for preliminary use, and say how all of
the courses could be further optimised for language learning.

**Method.** Two read-only audits run today on HEAD e915c8a (after Team Norway landed): the technical gates per course
(compiler, libraries, dictionaries, Scripture canon, rights gate, every ladder gate, every Stage 0 validator, the
published/draft count of every bundled text, recordings, adapter and lexicon sizes, the adapter test suites), and a
code-level audit of the learning loop itself (evidence model, recommendation, reader assistance, Stage 0, GoTell,
GoListen, ladder policy, level measurement). The simulation figures are those measured on 2026-10-06 (five courses)
and 2026-10-07 (Norwegian); they were not re-run today. The Norway course was walked in the browser today; the other
five were walked on 2026-10-06. Full test suite today: 393 files, 9,889 passed, 2 failed, both pre-existing data
mismatches outside any course (section 6). Numbers quoted below are the commands' own output.

## 1. The verdict on preliminary use

"Preliminary use" means a learner can pick the team today, with preview off, and get real reading practice without
being misled about what is reviewed. Every course's Stage 0 opens as a labelled draft; no ladder unit, story or
dialogue is published anywhere (a named native reviewer and a recording are required, and none exists); no course
has a recording. So preliminary use rests on three things: a draft Stage 0, a published Bible, and a published,
graded library with a dictionary behind it.

| course | verdict | what carries it today | what a preliminary user must be told |
|---|---|---|---|
| **Spanish (Honduras)** | **Yes** | Draft Stage 0 (17 scenes); the whole Reina-Valera 1909 (31,084 verses); a published library of 32 works, 1,865 texts, 2.63 M words on graded shelves (early readers → golden age); the largest dictionary (808,278 entries); voseo active in the analyser; the only course with a B1 bridge (in preview). Simulated learner: 4,965 known lemmas in an hour, Scripture 28 % of reading, 17 % of reading below 90 % known | The route from Stage 0 to the library (104 ladder units) is a draft, so after Stage 0 the first real texts are the early-reader shelf and Scripture; help never fades (every shelf uses the plain profile); library rights are recorded for the US, not Honduras |
| **German (Germany)** | **Yes** | Draft Stage 0 (15 scenes); Luther 1912 whole (31,102 verses); 66 works, 1,870 texts, 2.33 M words (Grimm, Lesungen, novels); dictionary 357,750 entries. Simulated learner: 4,870 known, Scripture 20 % | The first authentic texts are hard: 56 % of the simulated learner's reading was below 90 % known (the 69-unit ladder that would bridge it is a draft); the Luther EU rights basis awaits the owner's confirmation; help never fades |
| **Hindi (India)** | **Yes, with caution** | Draft Stage 0 with script decoding (17 scenes, 9 sound steps); IRV 2019 whole (31,104 verses, CC BY-SA); 9 works, 1,285 texts, 848 k words (92 GDL books graded c1–c4, Premchand, Andher Nagari); 16 fading assistance profiles. Simulated learner: 3,800 known | The dictionary is small (38,635 entries); Scripture is 64 % of the simulated diet and 45 % of reading is below 90 % known, because the GDL picture books run out fast and the 101-unit ladder is a draft; the Devanagari trainer is the only scheduled practice |
| **Thai (Thailand)** | **Limited** | Draft Stage 0 with decoding (16 scenes, 12 sound steps); Biblica Open Thai 2025 whole (31,087 verses); 1,198 published library texts, 857 k words; 11 fading profiles | In practice the library *is* the Bible: the 45 Aesop fables are held for native review, so Scripture was 93 % of the simulated diet; the word-segmentation release gate is unmet (F1 90.3 % on a biased set); the dictionary is the smallest (20,254); the simulated learner left Stage 0 with only 35 % of its words known, the lowest of the six. Usable by a learner who accepts the Bible as the main text and reads with the decoder |
| **Albanian (Albania)** | **Not yet** | Draft Stage 0 (19 scenes); dictionary 91,271 entries; 135-unit ladder and 37 Wikipedia texts in preview | Nothing to read: no Bible (the ALB text has no provenance; `linked-online` only), one published library text of 307 words. The simulated learner reads 947 words and stops. Everything else is preview |
| **Norwegian (Norway)** | **Not yet** | Draft Stage 0 (17 scenes, 5 sound steps); 48-unit ladder in preview; Nynorsk seeds readable as a companion language | No dictionary, no library, no Bible (the 1930 text is held `rights-unverified` pending Bibelselskapet's basis), no recordings; the lexicon is hand-authored and un-reviewed; the simulated learner reads 13,236 draft words and runs out |

Ranking for a mission team starting now: Spanish, German, Hindi; Thai for the Bible only; Albanian and Norwegian
only for Stage 0 and for reviewers working in preview.

## 2. Technical completion, course by course

All gates pass: `tsc -b` 0 errors; `check-course-libraries` 0 failures; `verify-scripture-canon` installed = source
for de, es, hi, th; `rights-gate` 147 documents, 143 bundled, 4 left out (the four unverified `bible-1john-1` seeds of
th, sq, nb, nn), 0 refused, 0 catalogue problems; every `ladder:check` and every `stage0-validate` 0 errors.

| | es | de | hi | th | sq | nb (+nn) |
|---|---|---|---|---|---|---|
| adapter | @11 | @8 | @5 | @4 | @8 | @1 (+nn @1) |
| hand lexicon (not like for like) | 1,615 rows | 1,454 n / 856 v / 346 adj | 2,937 rows | 1,211 entries | ~1,540 lexemes | 1,711 entries, 6,262 forms (+725 / 2,438) |
| dictionary (kaikki, CC BY-SA) | 808,278 | 357,750 | 38,635 | 20,254 | 91,271 | none |
| Scripture installed | 31,084 verses | 31,102 | 31,104 | 31,087 | none | none |
| library (works / texts / published / words) | 32 / 1,865 / 1,865 / 2.63 M | 66 / 1,870 / 1,870 / 2.33 M | 9 / 1,285 / 1,285 / 848 k | 6 / 1,243 / **1,198** / 857 k | 3 / 38 / **1** / 24.6 k | none |
| Stage 0 (scenes / sounds / exits / steps) | 17 / 3 / 2 / 25 | 15 / 5 / 2 / 25 | 17 / 9 / 2 / 30 | 16 / 12 / 2 / 33 | 19 / 3 / 2 / 27 | 17 / 5 / 2 / 27 |
| Stage 0 warnings | "amar" met once | — | 1 undeclared word, 2 met once | **64 words met once** | — | "sult" met once |
| ladder (units / words / stages) | 104 / 88,477 / to b1-bridge | 69 / 46,055 / to a2-2 | 101 / 52,009 / to a2-2 | 90 / 43,864 / to a2-2 | 135 / 49,892 / to a2-2 | 48 / 12,293 / to a2-2 |
| ladder warnings (coverage / density / recycling / cliff / orphan / recurrence) | 3 / 6 / 40 / 0 / 32 / 36 | 0 / 2 / 14 / 0 / 15 / 20 | 0 / 10 / 33 / 1 / 12 / 29 | 0 / 0 / 15 / 0 / 10 / 25 | 18 / 15 / 30 / 6 / 0 / 16 | 11 / 0 / 2 / 0 / 0 / 11 |
| lowest unit (cov3) | es-b1-19 87.5 % | de-a1-1-02 85.5 % | hi-a1-2-11 88.1 % | th-a1-1-02 85.5 % | sq-a1-1-h50 85.0 % (40 words) | nb-a1-1-02 84.6 % |
| orphan lemmas (never met again) | **763 of 2,217** | 300 of 1,473 | 93 of 1,018 | 48 of 987 | 16 of 964 | 8 of 340 |
| published bundled texts (corpus / ladder) | 1 / 0 | 5 / 0 | 5 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| recordings | 0 of 116 lines | 0 of 102 | 0 of 120 | 0 of 108 | 0 of 128 | 0 of 122 |
| adapter tests | 85 files, 4,688 tests, all pass (all courses) | | | | | |

Reading the table:

- **Content is the limit everywhere, not the engine.** All six ladders pass the gate; the differences are size
  (Norwegian a quarter of the next smallest) and recycling (Spanish's B1 bridge orphans 763 lemmas; three of its
  last units orphan 40 of 41). The orphan and recurrence findings are new today and advisory; they are the backlog
  for the next drafting pass.
- **The published surface is Scripture plus the library.** Zero ladder units and zero stories are published in any
  course; this is the publishing rule working as the owner asked, not a defect.
- **Albanian's a1-1 is 72 units of 40–47 words** (the "h" units): the gate accepts them, a learner will find them
  thin; they should be merged into 15–20 real units when the ladder is reviewed.

## 3. From zero to B2

Same simulated student as in the audit of 2026-10-06 (`scripts/simulate-learner.mts`: starts from zero, the real
engine chooses every text, a word is known after three encounters, no forgetting). **Today** = what opens with
preview off; **as if reviewed** = every draft open.

| course | mode | words read | known lemmas | words per known lemma | read below 90 % known | Scripture share | stop |
|---|---|---:|---:|---:|---:|---:|---|
| Spanish | today | 380,734 | 4,965 | 77 | 17 % | 28 % | the hour |
| Spanish | as if reviewed | 391,985 | 4,980 | 79 | 10 % | 16 % | the hour |
| German | today | 282,637 | 4,870 | 58 | 56 % | 20 % | the hour |
| German | as if reviewed | 434,523 | 7,032 | 62 | 55 % | 1 % | the hour |
| Hindi | today | 201,958 | 3,800 | 53 | 45 % | 64 % | the hour |
| Hindi | as if reviewed | 196,112 | 3,492 | 56 | 44 % | 39 % | the hour |
| Thai | today | 336,574 | 3,493 | 96 | 12 % | 93 % | the hour |
| Thai | as if reviewed | 402,230 | 3,794 | 106 | 13 % | 84 % | the hour |
| Albanian | today | 947 | 72 | 13 | 100 % | 0 | nothing to open |
| Albanian | as if reviewed | 75,256 | 1,477 | 51 | 44 % | 0 | out of text |
| Norwegian | as if reviewed | 13,236 | 426 | 31 | 65 % | 1 % | out of text |

**The answer is still no** for every course, for the reasons that have not changed: nothing on the route beyond
Scripture and the libraries is reviewed, there is no recording, speaking is self-checked, and nothing measures a
level. On reading alone, with the drafts reviewed, Spanish, German and Hindi pass the ~3,250-lemma mark that the
usual B2-recognition yardsticks ask for inside 150–220 k words; Thai needs the fables published to get out of the
Bible; Albanian and Norwegian run out of text long before. And the yardstick itself is generous: "known" is three
meetings with no forgetting, so the real cost per word is higher than the table says (section 4, item 2).

## 4. How every course could be optimised for language learning

The learning-loop audit found the same eighteen weaknesses in all six courses, because they are in the shared
engine, not in any course's content. They are ordered here by what they would do for a learner, with the file where
each change goes. The first group needs people; the rest is engineering the owner can commission.

### 4.1 People (nothing publishes without them)

1. **Native review of the ladders and Stage 0**: the single largest gain in every course. 537 ladder units and 101
   Stage 0 scenes are machine drafts; a reviewed ladder turns "today" into "as if reviewed" in section 3 (German
   4,870 → 7,032 known lemmas; Albanian 72 → 1,477; Scripture share in Hindi 64 % → 39 %).
2. **Recordings**: a unit publishes only from `audio-ready`, listening is credited only from reviewed human speech,
   and the Stage 0 exit cannot say "ready" without native audio. The curated import route and the authoring
   packets exist (`npm run audio:packet`); what is missing is a speaker and a reviewer per language.
3. **Rights decisions**: Honduras-jurisdiction evidence for the Spanish library (recorded for the US), the Luther EU
   basis, an Albanian Bible with provenance (none exists in the app), Bibelselskapet's basis for the 1930 Norwegian
   text, and the held Thai fables and Albanian Wikipedia texts.

### 4.2 The engine: retention and retrieval (all courses)

4. **Retrieval practice for vocabulary.** Words are met only in reading. The Vocabulary page is a passive table
   (`src/ui/pages/Settings.tsx` `VocabularySection`); the only scheduled recall is the Thai/Hindi letter trainer and
   the 15 testimony-centred GoTell goals. Add a daily retrieval set drawn from the learner's own read sentences
   (cloze on the learner's weak and overdue items, in the sentence they were met in, never isolated flashcards),
   scheduled with the interval table GoTell already has (`src/gotell/productive/state.ts` `DUE_HOURS`), and record a
   correct unaided recall as a demonstration (`src/golearn/policy.ts`). This is the largest engine gain for all six.
5. **Forgetting.** Receptive levels never decay (`src/golearn/fold.ts`), the "likely familiar" estimate is earned by
   dwell alone (4 help-free views in 2 sittings, `ESTIMATE` in `policy.ts`) and counts as known in recommendation
   coverage (`rank.ts reachOf`). Add a time decay to the estimate and to `recognized` (a word not met for N weeks drops
   to "met before" and counts half), and let item 4's retrieval restore it. The simulation's yardstick should use the
   same decay so that the words-per-known-lemma cost is honest.
6. **Comprehension beyond self-report.** "Understood" demonstrates every untapped word in a sentence; text-level
   reports are four buttons (`src/ui/reader/Reader.tsx`). Add, per text, two or three recall prompts generated from the
   text's own sentences (a cloze of a known-but-weak word; a yes/no about a sentence the learner marked), so a
   demonstration costs an answer. Stage 0 already has checked comprehension; the reader has none.

### 4.3 The engine: the route and its difficulty (all courses)

7. **Make the ladder adaptive.** "Next on your path" is offered at score 0.99 whatever happened on the previous unit
   (`src/golearn/recommend.ts`); rereads sort after all new in-reach input, so a unit reported "Little" is followed by
   the next unit; completion is a button with no check (`src/ladder/path.ts`). Rule: after a unit with a report below
   "Most" or help above 25 % of words, offer a reread or an easier unit before the next; after two such units in a
   row, offer Stage 0's recall card for that vocabulary.
8. **Raise the comprehensibility floor and expose the challenge setting.** `REACH.floor` is 0.75 with names left
   out, far below the ladder's own 88–92 % intent; this is why German reads 56 % and Hindi 45 % of its words below
   90 % known. The ranker's `challenge` parameter exists (easy 0.97 / steady 0.93 / stretch 0.88) but no UI sets it,
   and the empty-state copy mentions a "stretch setting" that does not exist (`recommend.ts whatToDo`). Set the floor
   to 0.85 for authentic texts, keep 0.75 only for controlled units, and add the setting to Settings → Reading.
9. **Fade assistance in Spanish, German and Norwegian.** Every shelf of those three uses `DEFAULT_ASSISTANCE`
   (`src/course/spanish.ts:47`, `german.ts:55`, `norwegian.ts:47`): English is always one tap away and nothing fades.
   Thai, Albanian and Hindi have stage-by-stage profiles; copy that pattern (gloss-first early, English on request
   from a2, target-language definitions where the dictionary has them).
10. **Show readiness and pace to every course.** `stageReadiness` (coverage ≥ 0.95, lookups ≤ 4/100, rescues ≤ 5/100,
    reported comprehension ≥ 0.8, retention ≥ 0.85) and `readingPace` exist but are shown only for Thai and Albanian,
    because the other courses use shelves and `catalog.currentStage` returns nothing for them (`src/course/catalog.ts`,
    `src/ui/pages/Course.tsx`). Give shelves a stage key so the learner in every course sees the same honest signals.
11. **A periodic unseen-text check instead of a level.** `STAGE_CONTRACTS` declares `exitEvidence: unseen-reading`
    and nothing applies it (`src/course/curriculumPolicy.ts`); the reading-assessment validators exist with no content
    (`src/course/readingAssessment.ts`). Every N texts, offer one held-out text at the learner's reach with item 6's
    prompts and report the result as readiness, never as a CEFR label. This is the honest answer to "am I at B2?".
12. **Close the gaps the recurrence audit found.** The gate now names orphan lemmas and non-widening intervals in
    every ladder (section 2), but nothing re-presents an orphan. Two moves: a drafting pass per ladder (Spanish B1
    bridge first: 763 orphans; German 300), and a scheduler that feeds the gate's orphan list into the existing
    `reinforces-weak-items` reread rule (`recommend.ts`) so an orphan comes back in a library text that contains it.

### 4.4 The engine: Stage 0, listening, speaking

13. **Stage 0 gates.** A step finishes when every line was shown and every check answered, not answered right
    (`src/ui/stage0/StepPage.tsx`); the ladder opens after any exit verdict including "not yet" (`src/ladder/path.ts`);
    speaking passes by recording anything. Require "secure" on the scene's checks for the step to count toward the
    exit, and require the exit's reading section to pass before the ladder opens. Thai's exit (35 % of words known in
    the simulation) says Stage 0 is too short for a decoded script: add scenes there before the ladder.
14. **Listening without recordings.** The build ships no TTS (`LISTEN = false` in `vite.config.ts`); only Stage 0 uses
    the device's voice. Until recordings exist, let the reader play the device voice for any sentence, clearly as
    practice, never as evidence (the eligibility rules already guarantee that); it gives Spanish, German and
    Norwegian learners the sound of the language from day one.
15. **Speaking.** Self-check only. Pair each Stage 0 and ladder speaking task with the model line's own words
    (retelling, not reading aloud) and record the learner's attempt beside the model for a reviewer; machine scoring
    is not needed for a first step.

### 4.5 Content per course (beyond the shared engine)

| course | what would move it most |
|---|---|
| Spanish | recycling pass on the B1 bridge (three units orphan 40 of 41 new lemmas); fading profiles; a Honduran-register strand in the library (everything published is peninsular or classic); GoTell models fully in voseo; Honduras rights evidence |
| German | a b1-bridge (the published library's first authentic texts leave the learner at 56 % assisted reading); recycling pass (300 orphans); fading profiles; the Luther EU basis |
| Hindi | more non-Scripture reading between the GDL picture books and Premchand (the gap is where 45 % assisted reading comes from); treat the 59-word GDL books as one text per set, not one recommendation each; a larger or frequency-ranked dictionary (38,635 entries, no frequency) |
| Thai | the segmentation gate (measure F1 on book prose, then fix the splitter where it fails); publish the 45 Aesop fables after review (they take the diet from 93 % Scripture to a third); a longer Stage 0 for decoding; a dictionary with frequency |
| Albanian | a Bible with provenance (or permission); merge the 72 forty-word a1-1 units into real units; review the 37 Wikipedia texts; more library (24.6 k words is a weekend's reading); a b1-bridge |
| Norwegian | the owner's downloads (Norsk ordbank, kaikki nb/nn, frequency lists: `docs/norway/SPEC.md` §10) so a dictionary and frequency exist; native review of the lexicon's unverified cells and the 48 units; Bibelselskapet's answer; a b1-bridge from the heritage leads once rights are verified; a Nynorsk library route (the builder has no place for `nn` entries yet) |

### 4.6 Measurement hygiene

16. **Dictionaries have no frequency data** (`hasFrequency: false` in all five manifests), so "useful unknown" is
    computed from in-shortlist document frequency. Add corpus frequency where a lawful list exists (Spanish and
    German from the libraries themselves; Norwegian from Språkbanken's CC0 lists once downloaded).
17. **Dwell credit can be earned by slow scrolling** (`src/ui/reader/viewDetection.ts`: ≥ max(1.5 s, 220 ms × words),
    capped at 12 s, with no understanding checked); item 6 is the fix, not a stricter timer.
18. **The simulator should model forgetting and item 7's adaptivity** so that the words-per-known-lemma cost and the
    "below 90 %" share stop flattering the route.

## 5. What was done today

Team Norway was added end to end in draft (commit e915c8a; `docs/norway/STATUS.md`), the ladder gate gained the orphan
and recurrence findings for every language, and the word sheet gained the rule-based IPA line and the concept-family
line. Two tests that had drifted from earlier work were corrected (the Home "Your path" entry; library shards named
by stream). Nothing in this audit was changed to make a number look better.

## 6. Left for the owner

- Two test failures from Codex-era data: the Albanian source-manifest hash was recorded before the 2026-10-06 library
  rebuild reformatted the file (the text is byte-identical; re-taking an integrity hash is the owner's call), and a
  stray quotation mark in one Global Voices attribution in the remediation manifest.
- The decisions in 4.1 (reviewers, recordings, rights) and the Norwegian downloads.
- The stray `work-*` files and `work/` folder in the repo root belong to other sessions and were not touched.

## 7. Addendum, 2026-10-08: the engine optimisations implemented and re-measured

Items 4–18 of §4 were implemented on 2026-10-07/08 (commit 5512863f; the package plan is
`docs/audits/ENGINE-OPTIMISATION-PLAN.md`). What landed: retrieval practice (`/practice`, cloze in the learner's own
read sentences, GoTell's interval table, recalls recorded as productions); forgetting (an item not met for six weeks
counts half and the "likely familiar" estimate expires; computed at read time, no migration); recall prompts at the
end of every text; the adaptive ladder (reread before the next unit after a weak report or help on more than a
quarter of the words); the authentic reach floor at 0.85 with course units kept at 0.75; the easy/steady/stretch
setting in Settings → Reading; orphan lemmas from the gate boosting library texts that bring them back; fading
assistance profiles for Spanish, German and Norwegian shelves; readiness and pace on every course page; Stage 0
steps that count only when secure, the ladder opening only on a passed reading check (or a recorded override), and
speaking as retelling with a self-check; the unseen-text check every eight finished texts; practice listening with
the device voice in the reader; corpus-frequency sidecars for all six dictionaries. Golden tests pin the shipped
courses' recommendation orderings and assistance profiles; full suite 418 files, 10,175 tests passed, the same two
pre-existing data failures. The Norway team and the new surfaces were checked in the browser.

**Re-measured** with the same simulator and flags as §3 but 20 minutes of computing per run instead of 60 (so totals
are not comparable with §3; the milestones are), forgetting on (six weeks, 2,000 words a day):

| course | mode | words read | known ever / standing / decayed | 1,000 known at | 3,250 at | words per known lemma, with / without decay | Scripture share | §3 milestones (60 min) |
|---|---|---:|---|---:|---:|---|---:|---|
| Spanish | as if reviewed | 267,576 | 3,495 / 2,859 / 636 | 42 k | 240 k | 94 / 77 | 20 % | 42 k / 221 k |
| Spanish | today | 292,634 | 3,578 / 2,949 / 629 | **57 k** | **257 k** | 99 / 82 | **52 %** | 45 k / 215 k |
| German | as if reviewed | 261,675 | 4,525 / 3,594 / 931 | 35 k | 175 k | 73 / 58 | 3 % | 35 k / 173 k |
| Hindi | as if reviewed | 185,432 | 3,083 / 2,694 / 389 | 51 k | — | 69 / 60 | 42 % | 51 k / 171 k |
| Thai | as if reviewed | 236,886 | 2,714 / 2,247 / 467 | 41 k | — | 105 / 87 | 79 % | 42 k / 282 k |
| Albanian | as if reviewed | 75,283 | 1,478 / 1,478 / 0 | 43 k | — | 51 / 51 | 0 | out of text, as before |
| Norwegian | as if reviewed | 13,236 | 426 / 426 / 0 | — | — | 31 / 31 | 1 % | out of text, as before |

Reading it honestly:

- **Forgetting is the big number.** Over four simulated months a fifth of what the learner "knew" has decayed
  (Spanish 636 of 3,495, German 931 of 4,525), and the real cost of a standing word is 20–25 % higher than the old
  yardstick said (Spanish 94 words per standing lemma, not 77). The retrieval practice built for this is not in the
  simulation (the simulated learner only reads), so the figure is the cost *without* practice; it is the number the
  practice page exists to bring down.
- **Milestone pace is unchanged where a ladder carries the learner** (German, Hindi, Thai, Spanish reviewed all within
  a few thousand words of §3). The engine changes did not slow the route.
- **One trade-off to tune: Spanish today.** With nothing but Scripture and the library published, the 0.85 authentic
  floor keeps the learner out of the harder library texts longer, and Scripture, which is also authentic but whose
  vocabulary repeats, fills the gap: Scripture 52 % of the diet (28 % in §3), the 1,000-word mark later (57 k vs 45 k).
  The floor did what it was asked (less assisted reading) at the price the Scripture cap was meant to prevent. The
  knob is `REACH.floorAuthentic` in `src/golearn/policy.ts`; the right fix is either a lower floor (0.82) for a learner
  with no published ladder, or counting Scripture against the cap harder when it is the only authentic text in reach.
  **Tested 2026-10-08, same flags, 20 minutes:** floor 0.82 gives 1,000 known at 53 k words (0.85: 57 k; the old 0.75: 45 k),
  3,250 at 223 k (257 k; 215 k), Scripture 35 % (52 %; 28 %), reading below 90 % known 13.8 % (14.1 %; 16.6 %). The floor is
  now 0.82: most of the pace of 0.75 with less assisted reading than either. (`es-normal-floor082.json` / `-floor085.json`.)
- **The adaptive reread never fired in the simulation** (0 rereads), because the simulated learner never reports a
  text below "All" and never asks for help on a quarter of a unit's words. Its effect on real learners is untested
  by this method; the unit tests cover the rule.
- **Albanian and Norwegian are content-bound exactly as before**: identical totals, nothing decayed in the 38 and 7
  simulated days the text lasted.

**Still for the owner**: the GitHub Pages repository (the built site is on the local `gh-pages` branch, 841e28c7);
the people items in §4.1; the Spanish floor tuning above.

# Five courses, audited and repaired — 2026-10-06

**The owner's request.** Audit every course for technical completion, then check again the progression from zero to B2,
and act on everything found.

**What was done.** Five technical audits (one per course, read-only, with the real importer over every reachable text),
a walk through every course in the app, the fixes they called for, ladders for the four courses that had none or only
A1, the library rebuilt with today's analysers, and the simulated student run again from zero in all five courses.
33 commits (d52b7f4 … 63836cd and the ones after). Everything written is a machine draft: nothing below has been reviewed
by a native speaker, and nothing that needs a person was marked as done.

## 1. Technical completion — what the audits found, and what happened to it

### Found in every course

| finding | severity | done |
|---|---|---|
| The app never registered the whole library with GoLearn (only the simulator did): "Next for you" saw only texts already on the device, never offered a library text, and told a learner after Stage 0 that "no story is published" | blocker | registered at app start (1e80ec7) |
| No graded ladder between Stage 0 and the library in German, Hindi, Thai; Albanian stopped at A1 (a learner ran out after 4,400 words); Spanish had no B1 bridge | blocker | ladders written for all five (section 2) |
| A fresh checkout built and shipped with no Bible and no dictionary (both are git-ignored build outputs; the checks passed when they were missing) | major | `npm run build` requires every course's library and dictionary (1eb7770) |
| Library profiles four adapter versions stale (Spanish @6 vs @10, Albanian @4 vs @7); the deep audit failed | major | `npm run library:rebuild -- <lang>` builds, refreshes and audits in one command; all five rebuilt (afd3b4a, section 4) |
| In preview a learner got stuck after the drafts (one read draft "in reach" hid every unread library text); Stage 0 scenes were offered as unfinished reading | major | f4e2217 |
| A learner who had read nothing was told every text was "above your level, about 0 %" | minor | d52b7f4 |
| The first suggestion for a learner with no reading analysed every text of the course: 25–50 s in the browser, minutes with a long ladder | major | 140512e (129 s → 2.8 s) |
| Nine ladder units declared as the private-testimony content type, so hidden from every list and never recommended | major | 63836cd |
| Home promised "Understand stories and Scripture by listening" with no recording anywhere | minor | says "No recordings in <language> yet" (eefd9e5) |
| GoLearn's note when nothing is published pasted developer reasons ("set review.status to …") | minor | rewritten for a learner (eefd9e5) |
| The real-bootstrap UI suites (Stage 0, GoTell, real engines: 13 tests) timed out on every run, hiding real failures | major (testing) | indexed in-memory store; all 13 pass (63836cd) |
| Status documents described a state from 2026-10-01 | minor | refreshed (see the docs commit) |

### Course by course

| course | found | done |
|---|---|---|
| **Spanish** | voseo -ís forms (¿Dónde vivís?) read as Spain's vosotros, so the Honduran course told learners their own form was "used in Spain"; the Honduras door empty (index rows without streams/domains); 1 Juan 1 mistitled; Platero titles with markup | adapter-es@11 (c30223f); index rows carry the catalogue's streams and domains (Honduras door: 0 → 87 texts); titles cleaned (afd3b4a); GoTell's Spanish models in voseo |
| **German** | with the dictionary installed the analyser failed on 870 of 1,911 texts (74 % of the words) and the importer silently dropped the dictionary for them; 176 Grimm tales stored as a few paragraph-long "sentences"; Luther's "[17:1]" markers shown as words; Genesis 1, Psalms 1/23, Matthew 1 listed twice | adapter-de@6 (7b2f6f5: 0 failures, gloss coverage 86 → 96 %, IPA 18 → 71 %); Grimm median 136 → 11 words per sentence; markers shown as verse labels; duplicates hidden |
| **Hindi** | genealogies (1 Chronicles) offered as the first Scripture; the full-USFM verifier could not run; GDL books on one shelf in alphabetical order; Andher Nagari on no shelf | the yield of a text counts unanalysed words (fe6797f); verifier fixed with --check-only; 92 GDL books graded onto c1–c4 by a documented score; Andher Nagari on c8 |
| **Thai** | Scripture (≈ 96 % of normal-mode reading) opened with the least help; 6.4 % of Scripture words unanalysed (ICU split the publisher's names); context-blind first senses in beginner glosses | Scripture takes the learner's stage profile; adapter-th@3/@4: unanalysed 6.41 % → 0.20 %, glossed 94 → 99 %; beginner senses fixed; a guessed name no longer counts as "known" at the ladder gate |
| **Albanian** | no way from the ladder into the library; 271 words of the planned ladder unknown to the analyser | adapter-sq@8 (1,091 of 1,091 listed forms read); ladder a1-2 … a2-2 |

**Left for the owner or for people** (not done, and not claimable by a tool): native review of every ladder unit and
Stage 0 (nothing publishes without it); recordings (ladder units publish only from audio-ready); rights by jurisdiction
(Spanish library rights are recorded for the US, not Honduras; 58 German works have US-only evidence); the 37 Albanian
Wikipedia texts and 45 Thai Aesop fables are held for native review by Codex's choice, kept (the owner asked to keep the
publication rule strict); Thai word-splitting quirks the drafters wrote around (listed for the Thai session).

## 2. The ladders

| course | units | words | stages | gate (`npm run ladder:check`) |
|---|---:|---:|---|---|
| Spanish | 104 | ~88 k | a1-1 … a2-2, **b1-bridge** (35 units: 17 authentic library texts, 2 adapted, 16 new) | 0 errors, 49 warnings |
| German | 69 | ~46 k | a1-1 … a2-2 | 0 errors, 16 warnings |
| Hindi | 101 | ~52 k | a1-1 … a2-2 (28 Stage 0A–0C drafts in place; 13 GDL books and John 14 as authentic units) | 0 errors, 44 warnings |
| Thai | 90 | ~44 k | a1-1 … a2-2 (9 bridge drafts in place, 8 adapted and 5 authentic Aesop fables, 1 John 4) | 0 errors, 15 warnings |
| Albanian | 135 | ~50 k | a1-1 … a2-2 | 0 errors, 69 warnings |

Method, per course: a planner measured Stage 0, the drafts and the library with the real analyser and wrote
`data/ladder/<lang>/PLAN*.md` (vocabulary schedule per unit, after the Spanish plan); a word-list agent added the planned
words the analyser did not know; three drafting agents wrote the stages and measured each unit as the gate reads it;
a second word-list pass fixed what the drafters found. The warnings are advice (mostly recycling, and new-word density on
authentic texts); no unit was padded to clear one.

Owner decisions taken under the owner's authority and recorded in the units: Gutenberg texts marked "may not modify" are
not adapted (new texts teach the same vocabulary); *Niebla* is not the Spanish bridge's core; the 92 % entry line for
authentic texts stays; the Thai Aesop transcription (CC BY-SA 4.0) may be adapted with attribution, share-alike.

## 3. From zero to B2, again

The same simulated student as before (`scripts/simulate-learner.mts`, docs/audits/B2-SIMULATION.md: starts from zero, the
app's real engine chooses every text, a word is known after three encounters; names and numerals known from the start —
but, since today, not a name the analyser only guessed), one hour of computing per run, after everything in sections 1,
2 and 4. **Today** = what a learner can open now (nothing of the ladders is published); **as if reviewed** = every draft
open, what the system does once people have reviewed and recorded. The German *today* run shared the machine with two
other runs and read fewer words in its hour; its milestones are the comparable figures.

| course | mode | words read | known | 1,000 known at | 3,250 at | Scripture share | read below 90 % | before (2026-10-05) |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Spanish | today | 381 k | 4,965 | 45 k | 215 k | 28 % | 12 % | 4,367 known; 1,000 at 57 k; Scripture **67 %** |
| Spanish | as if reviewed | 392 k | 4,980 | 42 k | 221 k | 16 % | 6 % | 3,884; 1,000 at 42 k; 20 % below 90 % |
| German | today | 283 k | 4,870 | 34 k | 159 k | 20 % | 27 % | 6,319 (385 k read); 1,000 at 35 k; 3,250 at 164 k; 30 % Scripture; 47 % below 90 % |
| German | as if reviewed | 435 k | **7,032** | 35 k | 173 k | **1 %** | 32 % | 4,183 (227 k); 29 % Scripture; 53 % below 90 % |
| Hindi | today | 202 k | 3,800 | 27 k | 144 k | 64 % | 36 % | 3,931 (335 k); 1,000 at 36 k; 3,250 at 264 k; Scripture **90 %** |
| Hindi | as if reviewed | 196 k | 3,492 | 51 k | 171 k | 39 % | 32 % | 3,072 (220 k); Scripture 86 % |
| Thai | today | 337 k | 3,493 | 34 k | 282 k | 93 % | 8 % | 4,060 (416 k); 1,000 at 27 k; 3,250 at 205 k; 93 % |
| Thai | as if reviewed | 402 k | 3,794 | 42 k | 282 k | 84 % | 13 % | first run (before f86ff0f) stopped at 110 k / 2,139 by the shortlist defect |
| Albanian | today | 947 | 72 | — | — | 0 | 97 % | the same: nothing is published |
| Albanian | as if reviewed | **75 k** | **1,477** | 51 k | — | 0 | 37 % | 4,402 read, 179 known, then nothing to open |

Reading it:

- **The dead ends are gone where the content exists.** Albanian went from 4,400 words and a stop to 75,000 words and
  1,477 known words — and then stopped again, having read every Albanian text there is (the ladder and the 24,566-word
  library). Its next limit is content, not the engine. German in preview reads 435,000 words and passes 5,000 known at
  285,000 with Scripture at 1 %: the ladder and the library carry the learner.
- **Scripture is one domain now, not the diet**: Spanish today 67 % → 28 %, Hindi 90 % → 64 % (39 % reviewed), German
  29 % → 1 % reviewed. Thai today is unchanged at 93 % because nothing Thai but Scripture is published; reviewed (re-run
  after the shortlist fix f86ff0f), the 32,000-word ladder carries the first stretch and then the learner is back in
  the Bible for 84 % of the hour, because the Aesop library is still held for review and the published Thai library
  gave only 32,000 words — Thai's limit is unpublished content, not the engine.
- **Thai's milestones in today's mode come later than on 2026-10-05** (1,000 known at 34 k instead of 27 k). That is the
  honest measurement, not a regression: the analyser now keeps Bible names whole and the gate and simulator no longer
  count a guessed name as known, so the learner has to meet those names like any other word.
- **Hindi today reads with less help than it looks**: 36 % of its reading is below 90 % known, because the first
  published non-Scripture texts (GDL books, 59–3,037 words) are still a step above Stage 0 until the ladder is reviewed.
- **Words read per word learned** (the cost of the route): Spanish 95 → 77, Thai 103 → 96, Hindi 53, German 58 (today);
  Albanian reviewed 51.

**The answer to the owner's question is still no**, for the reasons that have not changed: nothing a learner can open
beyond Scripture and the libraries is reviewed, so the route exists only in preview; there is no recording, so listening
is not taught or measured; speaking is recorded and self-checked only; nothing measures a level. What has changed is that
the reading route from zero to the point where real books are readable now exists in all five courses, and the
simulated student follows it. On reading alone, with the ladders reviewed, Spanish, German and Hindi reach the ~3,250-word
mark that the usual B2-recognition yardsticks ask for within 150–220 k words, German 5,000 within 285 k; Thai needs the
fables published to get out of the Bible; Albanian needs more text than exists in the app (the whole corpus is 75 k
words) and a Bible it does not have.

**What wastes time now** (the owner's second question): less than before — the recycling units, the duplicated drafts
and the name-heavy chapters are gone — but two things remain worth fixing when the units are reviewed: German preview spends
32 % of reading below 90 % known (Thai 13 %), which is assisted reading, mostly on the library's first authentic
texts; and the Hindi GDL shelf still offers 59-word picture books as full "texts", each costing a recommendation for a
few new words.

## 4. The libraries, rebuilt

All five libraries were rebuilt with today's analysers and the installed dictionaries (`npm run library:rebuild -- <lang>`:
order, build with the dictionary, sync the catalogue, audit) and installed; the previous copies are kept outside the
repository. `npm run library:check`: 0 failures. Deep audit (40 texts re-imported afresh per library, 38 for Albanian): every
check passed in all five — stored profiles equal what a learner's device measures today.

| library | works | texts | published | words | analysers |
|---|---:|---:|---:|---:|---|
| Spanish | 32 | 1,865 | 1,865 | 2,633,327 | adapter-es@11 + kaikki-es |
| German | 66 | 1,870 | 1,870 | 2,326,472 | adapter-de@8 + kaikki-de |
| Hindi | 9 | 1,285 | 1,285 | 847,979 | adapter-hi@5 + kaikki-hi |
| Thai | 6 | 1,243 | 1,198 | 857,413 | adapter-th@4 + kaikki-th |
| Albanian | 3 | 38 | 1 | 24,566 | adapter-sq@8 + kaikki-sq |

What changed inside them: paragraphs stored as one sentence are now sentences (Grimm: median 136 → 11 words per sentence,
1,343 → 18,849 sentences; Hauff 71 → 23; Andher Nagari 613 → 5; Vetal 73 → 17); every index row carries its work's
streams and domains (the Spanish Honduras door finds 87 texts, History 23); titles cleaned and told apart; the 92 Hindi
GDL books on shelves c1–c4 by a documented difficulty score; Andher Nagari on c8. The Thai word count fell from 903,566
to 857,413 only because adapter-th@4 keeps Bible names whole (fewer tokens), not because any text changed. Thai's 45
unpublished texts are the Aesop fables held for native review; Albanian's 37 are the Wikipedia texts held likewise.

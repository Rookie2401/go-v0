# Readiness — what the system can do with supplied texts today

Three words are used strictly:

- **Implemented** — the code exists and its own tests pass.
- **Verified** — additionally proven end to end: integration tests on the real adapters, importer and engines,
  the generated import proof, and/or a browser flow against the running app.
- **Awaiting external input** — cannot be completed from inside the repository.

This is **not** a production-readiness claim.

## Status at a glance (2026-10-01)

Three different things are kept apart, because a green test gate proves only the first.

**1. Implementation correctness** — does the software do what it says? Verified by `npm run gate` (3,531 tests in
196 files, typecheck clean, no runner errors), the production build, the import proof (162 checks, 0 mismatches),
the corpus check, and browser flows in sandbox databases. The audit round below fixed four confirmed defects, one
wording issue and two further faults found while verifying them; the Spanish pass fixed five more found in its own
browser audit (see "Spanish course").

**2. Linguistic validation (Thai)** — is the language analysis right? Only partly measured, and only against
dictionary data, never against a native reviewer:

| Measure | Result | What it does and does not show |
|---|---|---|
| Word segmentation on 3,116 Wiktionary examples | course tokenizer: boundary F1 90.27 %, 61.26 % of sentences exact. **PyThaiNLP newmm 5.3.8 on the same sentences: F1 89.97 %, 57.83 % exact** (run 2026-10-01) | Parity with an established tokenizer on this set, with the opposite error profile (ours over-splits compounds, newmm under-splits). Short dictionary examples divided by another project's convention; says little about book prose. **The segmentation gate is not met.** |
| Tone rules alone, held-out half of 17,298 Wiktionary spellings | 24 confidently wrong words = 0.82 % of confident answers; a third of words answered confidently, the rest marked uncertain | The rules are tuned on the other half only. Nothing was tuned or hard-coded against the held-out half |
| Dictionary respelling read by the engine vs the IPA | same **tone sequence** for 99.88 % of 8,124 held-out respellings | **Tone agreement only** (one tone per syllable, hence syllable count). It does not check consonants, vowels, length or finals, so it is not a measure of complete pronunciation accuracy, and the reference is Wiktionary, not a native speaker |
| Reading units | 80 of 107 constructed stress paragraphs exact | Cases written by a model: behaviour on known hazards, not accuracy on real prose |
| Hand lexicon vs dictionary | 112 disagreements recorded, all open | Neither source is chosen; nothing is adjudicated by the system |

**3. Missing external input** — what cannot be produced inside the repository:

1. **Lawful Thai text** for the course gold set (at minimum one Stage 0 reader, มานะ มานี ป.1, one later literary
   work, and a Grade 8-style prose sample as a stress test). Procedure: `docs/thai/GOLD_WORKFLOW.md` — supply the
   text under `data/private/`, `npm run gold:draft`, a person corrects the boundaries, `npm run gold:accept -- --by
   "Name"`, `npm run gold:freeze`, `npm run bench:words -- --frozen <id> --report`. The gold set is empty today and
   no model judgment is ever written into it as ground truth.
2. *(done)* Python 3.12.10 was installed with the owner's go-ahead and PyThaiNLP 5.3.8 into an isolated
   environment (`data/private/venv-thai`, git-ignored); the comparison ran (`docs/thai/BENCHMARKS.md` 3.7). The same
   two commands will score the course gold set once it exists.
3. **Human review**: a native speaker's check of pronunciation, of the 598-entry hand lexicon, the phrase units,
   constructions and tone exception lists, and a reviewer's decisions on the 112 recorded disagreements
   (`data/review/th/resolutions.json`).
4. **A Thai Bible** with verified release metadata and rights (see the policy below), and replacement of the
   three-verse Thai sample of unidentified origin.

**Scope change — GoListen is deferred to V2** (course owner, 2026-10-01). It is switched off by one flag
(`FEATURES.listen` in `src/core/config.ts`), not deleted: the app registers no speech provider, makes no speech
request, exposes no speech endpoint on the dev server, shows no audio interface (no player, no Settings → Speech,
no recordings in My Testimony, no listening works on the ladder) and makes no statement about listening (no
listening recommendation, readiness signal or history line). Learner data is untouched, including any audio rows
and listening events already stored; backups keep recordings. The package, its tests and `npm run speech:check`
stay in the repository, green, for V2. Verified by tests (bootstrap makes no `/api/speech/` request and queues no
audio job; each page in the off state) and in the browser. Sections of this document about speech describe that
dormant code.

## Audit round (2026-10-01): confirmed defects, root causes, fixes

| Finding | Root cause | Fix | Verified |
|---|---|---|---|
| 1. A whole-text comprehension report survived a revision ("all" still shown after every sentence was replaced) | `progress.ts` kept the last whole-text report without looking at its content version (completions in the same function were already version-scoped); the readiness signal read the raw log the same way | A report counts as current only for the version it was made about (a report with no version counts only at version 1). An earlier report is kept and exposed as `reportedEarlierVersion`; the progress line says "you said you understood all of an earlier version". Sentence-level understanding still follows sentence identity; no history is deleted; word knowledge is not reset | Engine and integration tests (full replacement, partial revision, unchanged re-import, metadata-only change, legacy report, new report after revision, recommendation and readiness consumers); browser: reader, library and Home show the same line |
| 2. The Thai word sheet said "from the dictionary's pronunciation" and, per syllable, "by the spelling rules; not checked against a dictionary" | The syllable row inferred the source from the confidence band (0.6–0.8) and never read the syllable's actual source | Source is rendered from the source (spelling rules · machine-drafted exception list · dictionary pronunciation · supplied analysis · reviewed override); certainty is a separate statement ("less certain" / "uncertain"); when the rules and the dictionary differ both are shown with labels and neither is declared right | Tests (dictionary syllable at 0.7, mixed sources, several readings, rule-only at three confidences); browser: แอปเปิล |
| 3. Settings said "Real speech is available." with only the placeholder fixture present | Availability returned `available: true` for the fixture in preview and the page read that as real speech | Real speech and placeholder playback are separate (`realSpeech`); three truthful states; the missing-configuration guidance stays with the "real speech is not available" statement | Tests (three states, entering and leaving preview, course switch, "Check again", a fixture session leaves listened sentences at 0); browser, before GoListen was switched off. Now dormant code |
| 4. "Analysis coverage: 20%" beside "only 0% of the words can be analysed (0/5)" | The figure came from the import plan (dictionary included); the warning was computed in validation from the language's own word list alone | One basis for both: word list + dictionary + spans supplied with the text + corrections. The warning states the breakdown and only the remedies that apply; a validation-only diagnostic names its scope ("by the language's own word list alone") | Tests (dictionary-only, mixed, spans, corrections, no dictionary, lookup failure; preview equals result); browser: preview and result both "56 %… (5 of 9): 0 from the word list, 5 from the dictionary…" |
| 5. An unpublished preview text was called "the easiest published Thai text" | The first-text explanation assumed publication | "…the easiest Thai text in preview (not published)"; a test proves no unpublished text reaches any recommendation when preview is off | Tests; browser |
| Found while verifying: after a revision, a rebuild of learner state lost the phrase and grammar-pattern history of the replaced sentences | The importer kept the retired sentences' words but deleted their phrase / pattern occurrence rows | Retired sentences keep those rows as history; every learner-facing read ignores retired sentences | `test/integration/revision-rebuild.test.ts` (failed before), importer and engine tests |
| Found while verifying: a learner's own copy was announced as "Will be published to learners" | The preview line did not know about personal copies | "Will be readable on this device… not published to anyone else" | Test; browser |

Held-out discipline: no fix in this round touched the tone engine, the tokenizer or the held-out sets.

## Spanish course (foundation, contract v7, 2026-10-01)

Status of record: **`docs/spanish/STATUS.md`**; the dictionary layer and every measurement:
**`docs/spanish/DICTIONARY.md`**. In brief:

- **Dictionary pass (evening of 2026-10-01, contract v8)**: the Spanish dictionary is installed as a separately
  sourced layer (Wiktionary via kaikki.org, 808,278 entries, 57.7 MB in compact shards, a bounded runtime) and the
  importer uses it for a learner's own books: it decides the words the rules only guess at, adds its other readings
  of word-list words for the context rules to order, respects capitals, carries region labels, and is named on the
  word sheet. **Measured on data never looked at**: on 7,649 words marked in Wiktionary's usage examples the first
  reading is right for 92.65 % (82.1 % of the 1,686 ambiguous ones; 61.9 % without context rules); the rule engine
  finds the dictionary's lemma for 98.4 % of word-list forms with features agreeing for 99.8 %, and verbs with
  attached pronouns for 99.3 %. None of this is on a book, and none was checked by a native speaker. The word list
  differs from the dictionary in 45 recorded places, none decided. Startup now imports only the active course's
  language.

- **Implemented and verified**: streams, shelves and doors; rights states that gate what may be bundled; regional
  varieties with an explicit course policy (Honduran / Central American target, voseo active, Spain and older
  Spanish receptive); rule morphology with attached pronouns; readings ordered by context; a library that never
  loads whole (20,000-row catalogue tests); personal difficulty and ranking with reasons; search; import of a
  learner's own `.txt` or unprotected `.epub`; a source quality check that reports and never fixes.
- **Architecture only**: the built library (the build tool has run on fixtures only; none is shipped); ranking over
  a real corpus (weights are first guesses); knowledge, mission and listening streams (no texts); frequency data
  (none).
- **Bundled**: 26 course texts drafted by an AI model (about 3,660 words, unreviewed, unpublished, preview only),
  the two older seed texts (same state), and three byte-verified verses of Reina-Valera 1909 (published).
- **Recommended only**: 61 of the 66 catalogued works are metadata. **Rights**: 50 unverified, 11 prohibited from
  bundling, 4 course-authored, 1 verified. Nothing is treated as public domain because it is old or online.
- **Found and fixed in the browser audit of this pass**: (1) the reader's Previous / Next followed titles instead
  of chapter order; (2) the first reading of common homographs was wrong for about 1.1 % of the words of the course
  texts ("no sé" as ser, "—pregunta Marvin" as a noun, "fue al mercado" as ser, plural nouns as "tú" forms) and
  guessed verbs were listed beside adverbs; (3) an improved analyzer never reached texts already imported on a
  device, because the remembered signature covered the documents only; (4) the word sheet said "possibly" for
  every word that had a second reading, even one ruled out; (5) the test suite passed but the runner reported
  worker timeouts, because command-line tests blocked their workers with synchronous spawns (and one test counted
  temporary directories shared with other test files).
- **Not verified**: anything about Spanish on a real book; every Honduran fact and regional gloss (the dictionary
  labels 940 senses as Honduran — material for a reviewer, not a verification); the controlled texts' Spanish (no
  native reader has seen them).

## Hindi course (contract v10, 2026-10-01)

Status of record: `docs/HINDI_COURSE.md`. In one paragraph: the course has its system and a first slice of
content. **Implemented and tested:** sixteen shelves that are never locks (Stage 0A–0C, Classes 1–12, Open Reading),
streams and doors; 26 Stage 0 stories (4,387 words); the Devanagari layer (written units, the unwritten *a*,
romanization only as a recorded rescue); rule morphology, a word list of 2,746 lemmas with register layers,
compound verbs and complex predicates as units, 50 constructions met in texts rather than taught; heritage
languages (Awadhi, Braj) kept out of the course language's evidence; rescue dependence as a progress measure; a
machine-enforced rights gate in the production build; the credit of a licensed text shown where it is read.
**Verified:** 91 verses of the Indian Revised Version against the distributor, and its licence on the distributor's
own page; the script and word-form engines against the coordinator's unseen tables (288 of 288). **Not verified:**
the correctness of any Hindi analysis against a native speaker (the gold set holds 189 drafts and no accepted item);
the Stage 0 stories, glosses, genders and pronunciation exceptions (all machine-drafted — the stories are visible in
preview only). **Awaiting external input:** a native reviewer; two downloads the owner approved (the whole IRV text
and the Wiktionary Hindi extract); an answer from Pratham Books before any StoryWeaver story is taken. NCERT's
readers are recorded as prohibited by NCERT's own terms and are only pointed at.

## Albanian course (contract v11, 2026-10-01)

Status of record: `docs/albanian/STATUS.md`; how it works: `docs/albanian/COURSE.md`. In one paragraph: the course has
its system and a seed of content. **Implemented and tested:** a ladder of ten stages and an open stage that lock
nothing, streams and doors, the rights manifest of 30 works; the Albanian adapter version 2 (word list of 896 lexemes,
rule morphology, fused short pronouns with their parts, the linking article and its adjective as one unit, a sentence
layer, 31 constructions, ten kinds of writing check, Gheg and older forms related to Standard, never counted as it); an
authoring pipeline with review states; a machine-enforced rights gate that also refuses a "course-written" label inside
somebody else's work. **Verified:** every reading the word list generates against the UniParser analyzer, Wiktionary's
tables, two treebanks and corpus usage counts — 97.62 % unanimous, every other reading capped and listed
(`data/review/sq/source-agreement.json`); 1,335 tests; the reader, the catalogue and My Testimony in a browser sandbox.
**Not verified:** anything against a native speaker (no review of any kind has happened; the 20 course texts, about 850
words, are visible in preview only); the rights of any third-party work. **Awaiting external input:** a native
reviewer; an Albanian Bible translation with an established rights holder; the owner's decision on two forms (dha,
vdiq) the sources split on and on shipping a lexicon built from the analyzer.

## German course (contract v9, 2026-10-01, after an outside audit)

Status of record: `docs/german/STATUS.md`; design: `docs/GERMAN_COURSE.md`; rights: `docs/german/RIGHTS.md`. In one
paragraph: **a development preview, not a course ready for release.** **Implemented and tested:** streams, shelves and
doors; the German adapter (version 5: word-form engine, a machine-drafted word list, a sentence layer, 38 constructions,
rule checks on a learner's own German); lexical units written as several words counted once; compounds, contractions
and older spelling on the word sheet; German chapter headings in a learner's own book; a rights gate that keeps
wording verification, the rights record and the jurisdictions apart. **Measured:** four rounds of gold sentences, all
judged by the coordinator (an AI model, not a native speaker). The first, unseen runs are the honest figures — 25 of
35, then 39 of 48 (7 of 13 on Kafka), then **13 of 21 whole sentences of Kafka with 377 of 393 stated facts** on the
last, after which nothing was fixed; the rounds the adapter was then fitted to stand at 84 of 84, 35 of 35 and 46 of 48.
Recognition coverage of the bundled texts (96.7–100 %) is not accuracy. **Browser:** onboarding, preview, reader and
word sheet, units, compounds, older spelling, shared vocabulary, book import, testimony writing and licence lines were
run in a sandbox; four defects found there were fixed. **Not verified:** anything against a native speaker; the rights
record by a person; a build on a frozen tree. **Published content:** 71 verses of the Lutherbibel 1912 and nothing
else — 34 course texts and the English lines of two Grimm tales await review. **Awaiting external input:** a native
reviewer; the owner's confirmation of the Luther 1912 basis for Germany / EU; the owner's decision on a German
dictionary and on Project Gutenberg catalogue entries that another agent added to the working tree.

## Readiness by language

| | Ingestion | Progress tracking | Linguistic analysis | Scripture | Audio (GoListen: deferred to V2, switched off) |
|---|---|---|---|---|---|
| **Spanish** | Verified (proof + browser importer; a learner's own `.txt` / `.epub` imports chapter by chapter) | Verified (one record on Home, library, reader; version-scoped) | Tokenization dependable; sentence splitting limited; a word list of 1,701 lemmas (**machine-drafted, not native-reviewed**) plus rule morphology for any verb, noun or adjective form (an inferred lemma is marked as such, 0.6 at most, no gloss); **dictionary installed** (Wiktionary via kaikki.org, separate layer) and used when a learner's own book is imported; readings ordered by neighbouring words — held-out on dictionary example sentences: first reading right for 92.65 %, 82.1 % of ambiguous words; nothing measured on a book (see "Spanish course") | **Published**: Reina-Valera 1909, 3 verses, byte-verified against eBible.org | **Not verified** — no credentials; nothing synthesized |
| **German** | Verified (a learner's own `.txt` imports chapter by chapter; German chapter headings recognised; checked in a browser sandbox) | Verified (engine; one vocabulary entry across a story and Scripture checked in a browser sandbox) | Rule morphology and a word list of 1,287 nouns, 824 verbs, 312 adjectives (**machine-drafted, not native-reviewed**); a sentence layer (agreement, the subject wherever it stands, separated verbs as one unit, compounds, contractions, older spelling related never rewritten); 38 constructions. Measured on the coordinator's own judgements only (an AI model): on 21 unseen sentences of native prose, **13 fully right, 377 of 393 stated facts**; confident errors exist; no independent evaluation (see "German course") | **Published**: Lutherbibel 1912, 71 verses (Genesis 1, Psalm 1, Psalm 23, Matthew 1, three single verses), byte-verified against eBible.org; the rights basis for Germany / EU is recorded with its evidence and awaits the owner's confirmation | Not verified |
| **Albanian** | Verified (a word typed without ë / ç is related to the proper spelling; a learner's own copy tested by integration test, not in a browser) | Verified (engine; browser in a sandbox) | A word list of 896 lexemes and the closed classes (**machine-drafted, not native-reviewed**) with rule morphology; fused short pronouns taken apart; the linking article and its adjective one unit; 31 constructions. Every generated reading compared with four other sources: 97.62 % unanimous, the rest capped and listed for review. **Dictionary installed** (Wiktionary via kaikki.org, with its inflection tables). On held-out treebank prose 8.0 % (fiction) and 12.9 % (Wikipedia) of words have no reading; correctness against a native speaker is **not measured** (gold set: 0 accepted). See "Albanian course" | **Blocked** — the translation commonly labelled ALB has no established provenance; not bundled | Not verified |
| **Hindi** | Verified (grapheme-safe spans, danda kept, nukta never folded; a learner's own `.txt` imports chapter by chapter, Hindi chapter headings recognised) | Verified (engine; browser in a sandbox) | Akṣara-level script decoding with the unwritten *a* stated; rule morphology and a word list of 2,746 lemmas (**machine-drafted, not native-reviewed**); compound verbs, complex predicates and 50 constructions; readings ordered by neighbouring words. On six unseen Scripture chapters 94.6 % of words have a reading the list vouches for; correctness is **not measured** (gold set: 189 drafts, 0 accepted). No dictionary installed (see "Hindi course") | **Published**: Indian Revised Version (IRV Hindi 2019, CC BY-SA 4.0), 91 verses, byte-verified against eBible.org; a licensed text, credited where it is read | Not verified |
| **Thai** | Verified (no spaces added; a learner's own copy of a book imports chapter by chapter — see "Thai course") | Verified (engine and browser, sandbox) | Word segmentation **is a release gate that is not met**: first benchmark F1 90.3 % on a biased set, nothing measured on book prose (see "Thai substrate validation"); hand lexicon of 598 entries, **machine-drafted, not native-reviewed**; Wiktionary dictionary installed as a separate, attributed layer; script decoding measured on 17,298 words | **Blocked** | Not verified |

A course in the team list, or a seeded example, is not evidence of support: this table is. "Seed lexicon only"
means every word of a supplied text is tokenized and tracked, but a word outside the adapter's small lexicon
has no lemma or gloss ("not analysed yet"); analysis can be supplied with the text (`spans`), corrected by a
reviewer (`corrections`), or added to a lexicon. The importer reports analysis coverage per document, and the
preview and the import result now report the same figure.

## Thai substrate validation (2026-10-01, contract v6)

The question of this phase: does the Thai linguistic substrate hold on real or rights-safe data? No course feature
was added. Reports: `docs/thai/DICTIONARY_REPORT.md` (generated), `docs/thai/BENCHMARKS.md`. Briefs: `docs/PLAN6.md`.

### What was measured

| Question | Result | How |
|---|---|---|
| Dictionary | kaikki.org extract of English Wiktionary, Thai, source dated 2026-09-28 (50,456,126 bytes, 21,020 lines, sha256 `202acdc9…fb57`), built to 20,254 entries over 17,505 words with all 27,602 senses and 21,565 pronunciations kept with the source's own labels; source URL, date, checksum and licence (CC BY-SA 4.0) in the manifest. Git-ignored; never merged into the hand lexicon | `npm run dict:build`, 85 tests |
| Coverage of the hand entries | 577 of 598 by written form (96.5 %); 500 with the same part of speech, 565 (94.5 %) allowing the usual tag differences. Function words 144/155, classifiers 72/72, core vocabulary 361/371, phrase units as headwords 42/68 | `npm run dict:compare` |
| Disagreements | **112 recorded, all open, none resolved by the system**: 60 hand entries the dictionary lacks, 12 part of speech, 10 possibly different meaning, 25 register, 5 classifier. Tone: 0 across the 106 exception-list words that could be compared. One error in the engine's own list (ผลาญ, listed as two syllables) was found this way and the entry withdrawn | `data/review/th/disagreements.json`; decisions go in `resolutions.json` |
| Pronunciation coverage | 99.6 % of dictionary words carry a respelling, IPA and romanization; all 537 hand forms found in the dictionary have all three | same report |
| Tone engine, rules alone, on **17,298 Wiktionary spellings** | Before: confident and wrong for **5.71 %** of its confident answers (the earlier 185-word table, 0 wrong, was too easy). After a conservative rework by general rules, on the half the engine's author never saw (8,714 words): **0.82 % of confident answers wrong (24 words)**, confident and right 33.4 %, the rest marked uncertain. All words: 0.63 %. The price: confident answers fell from 45.6 % to 33.6 % of words | `npm run tones:eval -- --split test` |
| Tone resolution with the dictionary | The dictionary's respelling, read by the engine without the IPA, gives the same **tone sequence** as the IPA for 99.88 % of 8,124 held-out respellings — tone agreement only, not complete pronunciation accuracy (1 differs — the Wiktionary IPA for ข้าวหมกไก่ looks wrong and is recorded, not overridden; 9 unreadable). Coordinator tables: every word present agrees (599 of 614; 15 absent). Of 71 held-out words the rules leave uncertain, 65 are resolved by the dictionary, 6 are not in it. Hand lexicon: 64 uncertain readings resolved, 472 confident readings confirmed, 0 contradicted | `scripts/eval-resolution.mts`, `scripts/check-tone-tables.mts` |
| Word segmentation, first benchmark | 3,116 Wiktionary usage examples whose word breaks come from the editors' romanization (half of 6,206 aligned). Current tokenizer: boundary precision 84.5 %, recall 96.9 %, **F1 90.3 %, 61.3 % of sentences exactly right**; 65 % of its errors split a compound the editors kept whole. ICU alone: F1 90.1 %. Our own dictionary longest-match baseline: F1 96.6 % (built from the same word list as the gold, so favoured) | `npm run gold:wiktionary && npm run bench:words` |
| Reading units | 107 constructed stress paragraphs (machine-drafted): the splitter cut inside every abbreviation and every clock time. After fixing only the deterministic hazards: 80 of 107 exact (was 57), boundary precision 61.5 % (was 36.2 %), abbreviation splits 2 (was 11). Contested hazards (dialogue turns, quotation + reporting clause, unmarked sentence breaks, hard line breaks) deliberately left for real prose | `npm run bench:units`, section 4 of BENCHMARKS |
| How far a wrong boundary reaches | Same text under two segmentations, same reading: 15–23 of 307 word forms change their encounter count (about 1–3 % of encounters), audio segments 126 vs 136, and reading pace moves 4–13 % because of the reader's dwell floor and cap | `npm run bench:units -- --sensitivity` |
| Performance | Fold still flat (about 0.8 ms per sentence view). Import of 2,000 words: 138 ms without, 127–151 ms with the dictionary. Stored analysis +23 % with the dictionary (a first version copied dictionary senses onto every occurrence, +133 %; fixed by asking the dictionary at display time). App bundle +15 kB (1,050 → 1,065 kB). Dictionary lookups: 1,000 words in 75 ms cold, 6 ms warm | `scripts/probe-scale.mts`, `scripts/probe-import.mts` |
| Tests (at the end of that phase) | `npm run gate`: 2,722 tests in 147 files, typecheck clean; import proof 162 checks, 0 mismatches; corpus check unchanged (2 published, 13 held). Current figures: "Status at a glance" | |
| The four other courses | Unchanged: their adapters declare no sources and no decoding, so the reader shows no provenance line and asks no dictionary (tests; Spanish reader checked in the browser, zero dictionary requests); their bundled documents import identically apart from two new provenance fields | |

### Provenance (implemented and verified)

Every stored analysis carries an origin — `rule`, `hand`, `dictionary`, `corpus`, `reviewed` — and a source id
(`adapter-th@2:hand`, `kaikki-th@2026-09-28`, `import@2`, `human:<name>`). The hand word list stays first and is
labelled "machine-drafted — not checked by a native speaker"; the dictionary stands beside it and is asked when
the word sheet opens; a word only the dictionary knows is labelled as a dictionary meaning with the attribution.
A named person's correction supersedes any of them and the superseded rows are kept. Every decoded syllable says
whether it came from the rules, the engine's exception list or a dictionary, and a dictionary reading keeps the
rule's own confident answer beside it when they differ (`ruleTone`). Verified by integration tests and in the
browser with the real dictionary.

### Release gates not met

- **Word segmentation.** The only measurement is on short dictionary examples tokenized by another project's
  convention. **No comparison with an established tokenizer has been run** (PyThaiNLP `newmm` needs Python; this
  machine has none, only the Microsoft Store placeholder alias; the script and commands are ready in
  `scripts/external/`). **The course gold set is empty** (0 of 500–1,000 sentences, all eight strata) because no
  lawful book text has been supplied. The workflow is ready and documented in `docs/thai/GOLD_WORKFLOW.md`:
  `npm run gold:draft`, `gold:accept`, `gold:freeze`, `gold:status`, `bench:words -- --frozen <id> --report`.
- **Reading units.** Measured only on constructed cases written by a model. Real dialogue and book formatting
  are untested.
- **The tone engine's rules still give a confident wrong reading for about 1 word in 120 of those they answer
  confidently**, when no dictionary reading exists for the word.

### Policy recorded as data (`src/course/thai.ts`)

Thai Scripture stays blocked. THSV11: permission declined by the rights holder — never stored, shown, analysed,
packaged or played in the app; external link only. Biblica Open Thai Common Version 2025: a candidate named by
the course owner, licence unverified, nothing ingested. A draft translation may enter only as a labelled
technical fixture, which the publication gate can never publish. Audio rights are separate from text rights;
no recording is bundled. Readiness thresholds were not touched.

## Thai course (foundation, contract v5)

Design: `docs/THAI_COURSE.md`. This is the structure of the course, **without any of its books**: no text of the
ladder, no Thai Bible, no dictionary and no audio is in the repository.

### Implemented and verified

| Part | What was verified, and how |
|---|---|
| Ladder: Stage 0, Grades 1–9, open reading; 62 works with role and rights record | Manifest invariants (`test/integration/thai-ladder.test.ts`): nothing bundled, nothing marked public domain, nothing marked verified; spine order; varieties on the works that carry them. Ladder page in the browser (sandbox) |
| A learner's own copy of a book | Plain text → one document per chapter, text byte-identical, filed under its work, readable without a review, labelled "Your copy", refused under `data/corpus/`. Integration test, CLI run, and the in-app flow in the browser (convert → preview → confirm → chapters under the work) with a **synthetic** two-chapter text |
| Script decoding (syllables, consonant class, vowel, live/dead, tone mark, tone, the rule in words) | Coordinator's own tables (`test/integration/thai-tones.test.ts`): 304 regular one-syllable words all decoded confidently and correctly. A held-out table of 185 words gave 0 confidently wrong — but that table was too easy: see "Thai substrate validation" for the measurement on 17,298 real words. Word sheet in the browser, including an irregular word ("not read exactly as it is spelled… read as หนม") |
| Stage-specific assistance | Profiles are data; Stage 0 shows decoding with the first tap and romanization only behind a rescue button (its use is recorded); Grade 9 shows minimal chrome and still reaches English; courses without a ladder are unchanged (existing reader tests untouched). Stage 0 verified in the browser; later stages by tests only |
| Writing-system items (`orth`) | Folded by the evidence policy, never counted as words; decoding help recorded; state rebuilds identically from the log (integration test and a 420-event randomized comparison against a reference derivation) |
| Difficulty forecast, word history, reading pace, stage readiness | Integration test on the real engines: forecast is deterministic, emits nothing and states its limits; history names the first text, work and chapter and says "Pronunciation: not measured"; **finishing every text never produces "ready to advance"**. Readiness panel and forecast in the browser |
| Dictionary pipeline | `npm run dict:build` and the runtime source; since the validation phase, run on the real file (see above). The dictionary supplies the analysis only for words the adapter cannot analyse, below certainty; for the others it stands beside the hand entry |
| Scripture as a parallel corpus | Outside the ladder, same learner model (a word met in a chapter and in a verse shares one history), takes the profile of the stage the learner works at. The Thai sample itself stays **blocked** |
| Scale | Folding one sentence view cost 3 ms at first and 40–87 ms after 1,200 views (measured, `scripts/probe-scale.mts`); after the rework it is flat at about 0.8 ms and encounter rows fell from 37,680 to 13,560 |

Policy is now `evidence@6` (existing databases rebuild from the event log on first open; verified on a sandbox
database created under the previous version).

### Limits that are stated, not solved

- **The tone engine is rule-based and conservative.** Rules alone answer confidently for about a third of
  dictionary words and mark the rest uncertain; the dictionary's pronunciation is the authority where it has the
  word. About 110 words rest on two lists written by the engine's author, not reviewed by a native speaker; six
  of them have no dictionary entry to check against (ดำริ, นิรันดร์, พินาศ, พระจันทร์, พระอาทิตย์, อธรรม).
- **The hand lexicon, phrase units (64) and constructions (33) are machine-drafted.** The drafter flagged as
  unsure: หน as a classifier, the regional tags on บ่ / กิ๋น / แอ่ว / จ๊าด, register tags on มิ / ครั้น / ฤๅ / เจ้า /
  สุนัข, glosses of เกี่ยว and ค่อย, and the wording for จ้ะ / จ๊ะ.
- **Reading units.** Thai has no sentence mark; long prose spans are divided at clause spaces by rule. Measured
  on constructed cases only (see above); not measured on real prose.
- **Readiness thresholds are provisional policy** (`READINESS` in `src/golearn/policy.ts`), not validated against
  learners.
- **No Thai definitions, no frequency data, no sense disambiguation, no automatic detection of omitted subjects
  or literary devices.** The forecast says so in its own output.
- **Some reads still grow with history** (unscoped reading pace, `recommend`, per-text progress): measured flat
  for folding, not yet measured for these at novel scale.
- **Personal copies are not part of a backup**: re-import the file; evidence re-attaches through stable sentence keys.
- **Not checked in the browser:** assistance profiles beyond Stage 0, notes and clause-structure display,
  Settings → Language support. (Dictionary-backed analysis and the provenance lines were checked in the
  validation phase.)

### Awaiting external input (Thai)

1. **The books.** Every work is a recommendation with rights unverified; the learner supplies each text from a
   copy he is entitled to use. Bibliographic details (authors, publishers, editions) are from general knowledge
   and are marked unverified.
2. *(done 2026-10-01)* Python with PyThaiNLP was installed with the owner's go-ahead and the comparison with an
   established tokenizer ran (`docs/thai/BENCHMARKS.md` 3.7); the segmentation gate is still not met.
3. **A Thai Bible**: the release metadata of the candidate translation verified, then verification of the text
   as for Spanish and German. The three-verse Thai sample in `data/corpus/th/` is of unidentified origin and
   should be replaced by a rights-clear fixture.
3a. **A reviewer's decisions** on the 112 recorded disagreements (`data/review/th/resolutions.json`).
4. **Native review** of the lexicon, the tone exception lists, phrase units and constructions.
5. **Real speech** (unchanged: no provider credentials).

## The two audited defects

### A. "Seen 0 of 10 · Finished" (reader, library) vs "Seen 4 of 10 · Finished" (Home)

Reproduction: all three surfaces already called the same `readingProgress(userId, textId)` and formatted it with
one function. With identical stored events they agree — reproduced in the running app with a new learner at
every step. I could not make the three disagree for the same state at the same moment, and found no duplicate
events. What produced the audited picture:

1. **No version scope in the record.** Progress counted only live sentences of the current content version and
   silently dropped exposure recorded against retired ones (a revision, or the index-id sentences of a database
   created before stable sentence keys), while "Finished" carried over from any version. That yields
   "Seen 0 of 10 · Finished" with no explanation.
2. **Independent snapshots.** Each surface read once on mount; the reader re-read on a 300 ms timer, the library
   and Home never. A surface opened before a dwell completed showed fewer sentences than one opened afterwards.
3. **A dropped completion** (found while fixing): finishing a revised text in the same sitting as an earlier
   finish was discarded by the dedupe key.

Fix: one canonical record — scope `{learner, language, text, content version}`; `sentencesSeen` and
`sentencesUnderstood` over this version; `finishedAt` only for a completion of this version;
`finishedEarlierVersion`; `earlierVersions` (exposure against retired sentences: kept and reported, never
counted). One hook and one component render it on Home (card and rows), the library and the reader, re-reading
after `golearn.settled()` on every learner event. Wording is identical everywhere: `Seen x of y sentences`,
`Understood x of y (your report)`, `Finished`, `Finished (your mark)` when fewer sentences were seen than the
text has (with the explanation one tap away), `Finished an earlier version — the text has changed since`,
`n more seen in an earlier version`.

### B. "likely familiar" 24 % → 46 % → 3 % when Parallel English was toggled

Reproduced on the real engines (`scripts/probe-parallel-english.mts`): one `EnglishRescueRevealed`, no new views,
no reports. Two causes:

1. **Rule too blunt (the settled 3 %).** The estimate required "no help in the last two encounters", and a
   whole-passage English reveal counted as help for every word of every sentence, so one toggle vetoed the
   estimate of words met help-free dozens of times. Story encounters were never touched.
2. **Reads not serialized with folds (the transient 46 %).** Coverage was read while the fold was still writing,
   on a blind timer. Toggling English off emitted nothing; the next read showed the settled state.

Fix (`evidence@4`): help has a scope. Help with a word, phrase or grammar point vetoes that item's estimate.
English or an explanation for a sentence makes that encounter "read with the English shown" — it can never
demonstrate, and it is not a help-free exposure — but it does not veto an estimate earned elsewhere and never
touches other sentences or sittings. Every read waits for the fold queue. Probe after the fix:
`40 %` before; `28 %` while the fold runs, after it settles, and after a rebuild from the log. The remaining
drop is two words ("que", "y") that had reached the threshold only through the two verses now read with English.
Exposure is still never shown as understanding ("shown 0 %" throughout).

## Import tests actually run

`npm run corpus:prove` — clearly labelled synthetic files in `data/synthetic/import-proof/`, the real importer,
an isolated in-memory store: **14 case groups, 162 checks, 0 mismatches** (`docs/import/PROOF.md` is generated
from the run). The same files through the **in-app importer in a sandbox database**:

| Case | Outcome in the browser |
|---|---|
| Valid text | imported (new), not published (unreviewed); 15 → 16 texts, 106 → 112 sentences |
| Malformed JSON | refused with the parse position and a fix; counts unchanged |
| Unchanged re-import | "unchanged"; counts identical |
| Two files with one id | no import offered; counts unchanged |
| Valid + invalid in one batch | nothing imported; counts unchanged |
| Span outside the sentence | refused with path and fix |
| Broken translation alignment | refused; the hint lists the sentences the adapter found |
| Revised text | "updated, 1 sentence retired"; version 2; 7 live sentences, 2 added |
| Review hold / rights hold | imported, held with the reason |
| Placeholder "Scripture", unverified | imported, held with every missing requirement |
| Placeholder "Scripture", generated | refused |
| Exactness (Spanish, Hindi danda, Thai without spaces) | stored text byte-identical by code point; normalized form differs where it should |
| Review, then revise without review, then review again | published → held ("the text changed after it was reviewed") → published |

Two defects found by these runs and fixed: a raw paragraph with edge whitespace produced no warning; validation
ignored analysis supplied with the file when counting coverage, so preview and result disagreed. One gap closed:
a review now records which wording it covers, and a revised text is held until it is reviewed again
(Scripture is bound by its verification instead). No synthetic text is published or present in the normal library.

## Speech (dormant: GoListen is switched off and deferred to V2)

`npm run speech:check`: `configured: no`; **12 of 12 provider-independent checks pass** (cache keys, requested vs
delivered locale, voice metadata and review gate, content-version invalidation, retry, dead state with visible
reason, partial generation, unconfigured state, fixture and failed playback never eligible, real-speech events
flagged as speech, key never leaked). `REAL SPEECH: NOT VERIFIED`. One defect fixed: the proxy answered an
oversized request before reading it, which could surface as a connection reset instead of the 413.

## The acquisition loop

`test/integration/acquisition-loop.test.ts` passes all twelve steps on the real adapters, importer and engines,
now including "a revised text is held until re-reviewed". In the browser this round (sandbox): import and
validation, review → publish, revise → hold → re-review, reading with real dwell, explicit finish, identical
progress on the three surfaces, Parallel English stability, honest audio state. The remaining steps (word /
phrase / grammar / English help levels, Scripture preparation, testimony draft, suggestion, assisted vs
independent, reload and language switch) were verified in the browser in the previous round and are covered by
the integration test in this one; they were not re-walked in the browser after this round's changes.

## Not verified

- **Real speech**: nothing has ever been synthesized or heard.
- **Progress in the browser for languages other than Spanish** (engine tests cover all five).
- **The estimate rule in a live browser**: the sandbox learner had one sitting, so no estimates existed; the
  rule is proven by the probe and the engine tests, the browser check proves one event and no transient values.
- **In-app backup download and restore, and a provoked storage failure**: automated tests only.
- **Linguistic quality** of the seed texts, GoTell's term tables and the adapters' rules: not native-reviewed.

## Awaiting external input

1. **Native-speaker review** of comprehensible-input texts (none is reviewed; the normal Read list is empty).
2. **Approved Scripture** for Albanian and Thai, then `node scripts/verify-scripture.mjs`. (Hindi: the Indian Revised Version is verified and bundled as a slice; the whole text awaits one download, see `docs/HINDI_COURSE.md` §12.)
3. **Speech**: `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in `.env.local`, restart, `npm run speech:check`, then
   a human audition of each voice (`src/golisten/QA.md`).
4. **Native review** of GoTell's per-language tables and the adapters' writing rules.
5. **Lexicon growth or supplied analysis** beyond the seed vocabulary.

## Operating instructions

Specification and numbered walkthrough: `docs/IMPORT.md`. Templates: `docs/import/templates/`. Worked example:
`docs/import/examples/README.md`. Proof: `docs/import/PROOF.md`.

```bash
npm run corpus:validate -- path/to/text.json
```
```bash
npm run corpus:review -- path/to/text.json --by "Reviewer Name"
```
```bash
npm run corpus:prove
```
```bash
npm run speech:check
```

Import through Settings → Content, or place the file under `data/corpus/<lang>/`. To try anything without
touching your library, open the app with `?sandbox=<name>` (separate database, bannered).

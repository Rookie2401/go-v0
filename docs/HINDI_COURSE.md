# The Hindi course (India → Hindi)

Design and readiness of record for the Hindi course. Written so that another session can continue without
reconstructing the decisions. Companion files: `docs/PLAN12.md` (the build brief and conventions),
`docs/hindi/STAGE0.md` (the Stage 0 stories and the questions for a reviewer), `docs/hindi/SOURCES_RESEARCH.md`
(what each candidate source states about its own rights, with where and when it was read),
`docs/hindi/GOLD_WORKFLOW.md` (the linguistic gold set and how a reviewer works on it).

Status words used throughout, and nothing else: **implemented** (code exists and its tests pass),
**verified** (checked against something independent of the code that produced it), **architecture only** (the
place for it exists; the content or the measurement does not), **awaiting external input** (cannot move without a
person, a permission or a file).

## 1. Status at a glance (2026-10-01)

| Area | Status |
|---|---|
| Course structure: 16 shelves (Stage 0A–0C, Classes 1–12, Open Reading), 9 streams, 9 doors, 51 catalogued works | implemented |
| Stage 0 stories: 26 texts, 4,387 words, recurring cast | implemented; **machine-drafted, not reviewed** — visible in preview only; awaiting a native reviewer |
| Devanagari layer: akṣara segmentation, pronunciation by rule with the unwritten *a* stated per unit, romanization as a rescue | implemented; verified against the coordinator's unseen tables (169 checks); awaiting a native reviewer for the exception list |
| Word forms by rule (nouns, adjectives, pronouns and their fusions, verbs, causatives, -वाला, abstract nouns) | implemented; verified against the coordinator's unseen tables (288 of 288, including the script checks) |
| Word list: 2,937 lemmas (2,746 on 2026-10-01; `adapter-hi@5`) with gender, register layer, domains, causative and ने flags | implemented; machine-drafted; awaiting a native reviewer |
| Multiword units (603 complex predicates, 13 vector verbs, 73 compound postpositions, 81 fixed expressions), 50 constructions, neighbour rules, sentence splitting, writing checks | implemented; tested on the real adapter; machine-drafted |
| Hindi Scripture: complete Indian Revised Version (IRV Hindi 2019, CC BY-SA 4.0) | implemented and **verified** against the publisher archive: 66 books, 1,189 chapters, 31,104 verses. Original 91 verse references remain in the seed documents; 1,185 lazy documents supply the remaining verses without duplication. |
| Rights: a state for every work, a machine-enforced build gate, the credit shown with the text | implemented; verified for the bundled sources (section 8) |
| Learner model shared by stories, Scripture, the learner's own books and testimony; rescue dependence; heritage languages kept apart | implemented |
| Linguistic gold set | architecture only: 189 model-drafted candidates, **0 accepted**; nothing about correctness has been measured against a native speaker |
| Hindi dictionary (Wiktionary extract) | implemented: official Kaikki extract installed, 38,635 entries and 35,814 forms in 256 shards; dictionary lookups verified. |
| Children's and general native Hindi | 124 Global Digital Library CC BY 4.0 books installed with individual source credits; one damaged eligible source withheld. Literary acquisition and edition-specific gaps are recorded in `docs/hindi/LITERATURE_ACQUISITION.md`. |
| Audio | no Hindi recording exists. `FEATURES.listen` has been `true` since 2026-10-03 (the player and the recording import exist) but Home says "No recordings in Hindi yet" and the speech proxy is off; nothing here waits for audio except publishing a ladder unit (it publishes only from `audio-ready`) |
| Reading ladder (2026-10-06) | implemented: 101 units from Stage 0 to `a2-2` in `data/ladder/hi` (31 + 26 + 20 + 24; about 52 k running words after Stage 0): 87 controlled — the 28 Stage 0A–0C drafts are placed in it in place — and 14 authentic (13 Global Digital Library books and John 14); `npm run ladder:check` 0 errors, 44 warnings, mean curriculum coverage 90.1–95.5 % by stage; **machine-drafted, unreviewed, unpublished outside preview**; Home shows "Your path" (`docs/LADDER.md`). The separate "Start from zero" pack (`docs/STAGE0.md`, `data/stage0/hi`: 17 scenes, 9 sound steps, 30 path steps) leads into it |
| Library as installed (2026-10-06) | 1,285 texts in 9 works, 847,979 words, all published (`npm run library:check`): the whole IRV (1,189 chapters), 92 Global Digital Library books graded onto shelves c1–c4 by a documented score (23 per shelf), *Andher Nagari*, two Premchand stories and a Global Voices excerpt; rebuilt 2026-10-06 with `npm run library:rebuild -- hi` |

## 2. What was found in the Thai and Spanish courses, and what Hindi reuses

The brief was to extend the existing architecture, not to build a parallel one. Inspection before any Hindi code:

| Existing piece (where it came from) | Hindi's use of it |
|---|---|
| `LanguageAdapter` contract: tokenize, analyze, phrases, patterns, pronunciation, decode, writing-system items, production checks, `refine`, varieties, sources (core; Thai and Spanish) | implemented in full by `src/adapters/hi.ts`; no new adapter method was needed |
| Analysis as a versioned overlay with provenance: every stored analysis says its origin (hand list / rule / dictionary / reviewed) and source (Thai audit round) | reused as is; Hindi's four sources are declared and labelled "machine-drafted" |
| Script decoding on the word sheet, writing-system items in the learner model, "decoding first", romanization as a Stage 0 rescue (Thai) | reused; a decoding unit may now be a written unit that is not a syllable, and may state what happens to an unwritten vowel (contract v10, additive) |
| Stages with assistance profiles that thin out (Thai ladder) and shelves that are an orientation, never a lock (Spanish) | Hindi uses shelves (never locks) that each carry an assistance profile; the catalogue now passes a shelf's own profile to the reader (identical for Spanish and German, whose shelves carry the default) |
| Streams, doors, the catalogue of works with a rights state each, Explore, Best next reads (Spanish) | reused; Hindi supplies data only (`src/course/hindi.ts`) |
| Rule morphology + hand word list + neighbour rules + "the dictionary decides what the rules only guess" (Spanish, contract v8) | same shape: rules propose, the word list vouches, guesses are marked unconfirmed (≤ 0.6, no gloss), a dictionary can later confirm them |
| Multiword units as learner items beside their component words (Thai phrases, German lexical units) | reused for compound verbs, complex predicates and compound postpositions |
| Variety policy: active target vs recognition (Spanish) | reused; a new variety kind `heritage` keeps related literary languages out of the course language's evidence |
| Publication gate: machine-drafted text is unpublished until reviewed; Scripture is published only when verified verse by verse (all courses) | reused; a review can now say whether it was a native speaker's or only a language check |
| `scripts/verify-scripture.mjs` (Spanish, German) | extended to a licensed translation: the licence and rights holder must be on the distributor's page |
| Your Books: plain text / EPUB to chapters, personal copies that never leave the device (Thai, Spanish) | reused; Hindi chapter headings are recognised |
| Gold-set discipline: drafts are not gold; only a named person accepts (Thai) | the same rule, with a Hindi item format that includes units and constructions |
| GoTell: writing checks, suggestions never applied automatically (all courses) | reused; Hindi rules in `src/adapters/hindi/production.ts` |

Nothing in Thai or Spanish was replaced. The language-neutral additions made for Hindi are listed in section 4.

## 3. The course as the learner meets it

- **Three surfaces, one learner state.** Read (stories and books), Scripture, My Testimony. A word met in a story is
  known when it turns up in Mark; a word the learner writes is the same item he reads.
- **Shelves, never locks.** Stage 0A, 0B, 0C, Class 1 … Class 12, Open Reading. A Class is this course's own
  orientation and is said, on every shelf, not to be an Indian school grade. Everything is open at all times;
  what suits the learner now is computed per learner, per text.
- **Stage 0 is real Hindi from the first line.** No alphabet course comes first. 0A: this/that + is, in/on, also,
  and, the first habitual verbs and questions (79 distinct forms across 12 stories). 0B: postpositions and oblique
  forms, possessives, commands, the progressive, was/were. 0C: the narrative past with ने, compound verbs, clause
  linking. One family and one dog recur throughout. A test enforces the 0A constraints (sentence length, at most
  12 new forms a story, each new form at least three times, no 0B grammar).
- **The script is learned by reading.** Tapping a word shows each written unit (akṣara): its letters, its vowel
  sign, and for a unit with no vowel sign whether the unwritten *a* is said, not said or uncertain, with the rule
  in a sentence. Romanization is never a parallel line: it appears only when asked for ("Show romanization
  (rescue)") on the first shelves (0A–Class 2) and on the learner's own books; from Class 3 on it is not offered.
  Every such request is recorded, so dependence on it is visible and can be seen to fall.
- **Help in a fixed order of depth:** word → phrase or unit → grammar (the construction, in two plain sentences) →
  how it is read → English for the sentence. English is never removed, only moved further away shelf by shelf.
- **Grammar is an inventory met in texts, not a syllabus of lessons.** 50 constructions are recognised where they
  occur and become learner items; nothing is "taught" before it is read. Two that occur in almost every sentence
  are marked ubiquitous.
- **Canonical texts and adaptive supplements are different things.** The Stage 0 stories are canonical course
  texts: fixed wording, versioned, reviewed as wording, the same for every learner. A text generated to prepare one
  learner for one passage is a separate kind (`generated-prep`), never replaces a canonical text and is never
  described as course material of native quality. None is generated for Hindi yet (architecture only).
- **Repetition comes from the next texts, not from drills.** A word the learner needed help with raises the rank
  of texts that contain it (the ranking says so in its reasons); the Stage 0 series is written so that every new
  form returns.
- **Home** shows Continue reading (the course's own first story for a new learner), Best next reads with
  reasons, the doors, and "Help you needed": how often each kind of help was used per 100 words or sentences and
  whether that is falling.

## 4. Architecture: what was added

### Language-neutral (available to every course)

| Addition | Where | Commit |
|---|---|---|
| Contract v10: register layers (`everyday`, `sanskritic`, `perso-arabic`, `english-loan`, `biblical`); decoding units with `inherentVowel` and without a syllable ending; variety kind `heritage` | `src/core` | `0eeed6c` |
| Rescue dependence: each kind of help per 100 words / sentences, earlier vs recent, a trend only above a minimum of reading | `src/golearn/rescue.ts`, panel `src/ui/rescue.tsx` | `a6e8b75`, `e370fd7` |
| Rights gate: a production build leaves out unverified documents and stops on a claim without evidence | `src/ingest/rights.ts`, `server/rightsGate.ts`, `scripts/rights-gate.mts`, in `npm run build` | `37e3a1f`, `e168690` |
| Review levels: `native` vs `linguistic-check`; a language check never publishes machine-drafted text | `src/ingest/format.ts`, `publish.ts`, `review.ts` | `3367cc5` |
| Heritage varieties credit nothing to the course language | `src/golearn/fold.ts` | `af36b74` |
| A shelf's own assistance profile reaches the reader; a profile for texts on no shelf | `src/course/catalog.ts` | `e168690` |
| Register layers as a stated factor of a text's difficulty | `src/library/measure.ts`, `src/golearn/personal.ts` | `dcf67ad` |
| The first text follows the course's reading path; a book is begun at chapter 1 | `src/golearn/recommend.ts` | `93dd8aa`, `79c4f21` |
| A work whose source forbids use inside software is only pointed at (no "add your copy") | `src/ui/course/wording.ts` | `93dd8aa` |
| The reader names the source of a licensed or public-domain text with the text | `src/ui/reader/SourceLine.tsx` | `5ce7a73` |
| Romanization of a word as a whole where units are not syllables; parts of speech in plain words | `src/ui/reader/assistance.ts` | `9c56715` |

### Hindi only (`src/adapters/hi.ts`, `src/adapters/hindi/**`, `src/course/hindi.ts`)

| Module | What it does |
|---|---|
| `script.ts`, `orth-*.ts` | akṣara segmentation; identity = NFC with the nukta kept; search form; spelling variants that hold in both directions (हिंदी ↔ हिन्दी, गई ↔ गयी) |
| `pronunciation.ts`, `translit.ts` | per-unit pronunciation with the rule and a confidence; the unwritten *a* as pronounced / dropped / uncertain; ISO 15919 romanization of the word, withheld when unsure |
| `morphology.ts`, `morph-*.ts` | analysis by generate-and-compare (a reading is kept only if generating that cell gives the written form); nouns in ten classes, agreeing adjectives, pronouns and their fusions with postpositions (as `parts`), verbs with aspect, tense, mood, honorific level, irregulars, causatives by rule, X-वाला, abstract nouns |
| `entries.ts`, `lexicon-*.ts`, `registers.ts` | the word list as readable rows (`लड़का/m = boy [everyday d:family]`), paradigm macros, register groups (समय / वक़्त / टाइम) |
| `hi.ts` | wiring: the list, then the rules on lemmas the list vouches for, then spelling variants (script-driven and list-driven for the nukta, always stated as `variantOf`, never a rewrite), then unconfirmed guesses |
| `verb-group.ts`, `phrases.ts`, `phrase-data.ts` | the verb group; compound verbs (stem + vector) by rule; complex predicates, compound postpositions and fixed expressions from tables; unit patterns written in lemmas |
| `constructions.ts`, `construction-*.ts` | the 50-key inventory with plain explanations, and the detectors |
| `disambiguate.ts` | neighbour rules that reorder readings and never add or remove one |
| `sentences.ts`, `production.ts` | sentence splitting (danda, quotations, abbreviations); writing checks with corrections only where the rule reproduces what the learner wrote |
| `varieties.ts` | Awadhi, Braj and the language of the sant poets as heritage varieties |
| `src/course/hindi.ts` | shelves, assistance profiles, streams, doors, works with their rights records |

Conventions that must not drift (also in `docs/PLAN12.md`): identity is NFC and nothing folds the nukta; canonical
text is never rewritten and every relation between spellings is stated on the reading; features follow UD
(Case Dir/Obl/Voc/Erg/Dat/Gen; VerbForm Fin/Inf/Part/Conv/Stem; Aspect Imp/Perf/Prog; Voice=Cau); the lemma of a
pronoun is its direct form of the same number (वे for उन्होंने); a fused word is one reading with `parts`; a
reading the list does not vouch for is `unconfirmed`, at most 0.6, without a gloss.

## 5. What works linguistically (and how that is known)

- **Script and pronunciation.** All 115 common words of the coordinator's unseen table are pronounced correctly
  with confidence; the hard cases are either right or marked uncertain (never confidently wrong in that table).
  2.0 % of Scripture words are left uncertain; none in Stage 0.
- **Word forms.** The coordinator's unseen form table (about 100 rows plus fused forms and nonsense input) passes
  in full after one fix batch (adjectives in -या were the only failing class).
- **Reading real text** (the bundled texts were read through the assembled adapter and every class of error was
  sent back to its package as a class, never as a word list): the progressive was being read as a perfect
  (33 occurrences in Stage 0, 1 found; now 34 found); the oblique singular was preferred where no postposition
  follows; several homographs were ordered wrongly; causatives carried no mark; nukta-less spellings were not
  reached. All fixed and covered by tests on the real adapter.
- **Coverage, stated honestly.** On the bundled texts every Stage 0 word and 99.9 % of Scripture words have a
  reading the list vouches for — *by construction*, because the list was extended while looking at those texts.
  On six unbundled chapters the list was never built against (Ruth 1, Luke 15, John 3, Romans 8, Psalm 103,
  Exodus 20; 4,097 words; `npx vite-node scripts/probe-hi-heldout.mts`) the figures are **94.6 % vouched, 1.1 %
  unconfirmed guess, 4.3 % no reading** (93.8 / 1.3 / 4.9 before the frame-by-frame pass over missing basic words,
  which was made without looking at these chapters). "Vouched" means the list holds the lemma, not that the
  reading is right. The chapters are the same translation and register as the bundled Scripture; ordinary prose
  has not been measured, because no lawful ordinary prose is in hand.
- **Correctness is not measured.** The only instrument for that is the gold set, and no item of it has been
  accepted by a person. A defect-finding run over the 189 drafts (labelled "not a measurement" by the tool) has
  180 read as the draft expects after the fix batches (171 before). The drafts are themselves unreviewed, the
  coordinator has now seen their failures (so they are not a held-out set), and of the 8 differences that remain 5
  are one convention question (section 10, item 4) and 3 are matters for the reviewer (whether "began to rain" is a
  unit or a construction, the part of speech of और "more", and one verb's use of ने).

## 6. Corpus integrated

| Text | Words | Rights of the text | Published to learners |
|---|---|---|---|
| Stage 0A: 12 stories (`s0a-01` … `s0a-12`) | 1,359 | written for the course (machine-drafted) | no: awaiting native review; preview only |
| Stage 0B: 8 stories | 1,421 | same | no |
| Stage 0C: 6 stories | 1,607 | same | no |
| Seed story and dialogue (`story-01`, `dialogue-01`) | about 140 | same | no |
| Indian Revised Version: Genesis 1, Psalms 1 and 23, Mark 1, and 1 John 1:8–9 + John 3:16 (5 documents, 91 verses) | about 2,000 | licensed: CC BY-SA 4.0, © 2017, 2018, 2019 Bridge Connectivity Solutions, via eBible.org `hin2017` | yes: every verse byte-verified |

English beside Scripture is the World English Bible (public domain), a separate text and not a translation of the Hindi.

## 7. Rights machinery

- **States.** Every work has one of: `course-authored`, `verified-public-domain`, `verified-open-licence`,
  `permission-granted`, `recommended-only`, `user-supplied`, `rights-unverified`, `prohibited-from-bundling`,
  `research-only`. There is no state meaning "probably public domain": age is recorded as a lead for verification
  with the caveat that an edition, a transcription or a translation can carry rights of its own.
- **The gate is code, not a note.** `bundleDecision` (`src/ingest/rights.ts`) returns bundle / exclude / refuse
  for every bundled document; the Vite build plugin replaces an excluded document with nothing and stops the
  build on a refused one; `npm run build` runs `scripts/rights-gate.mts` first; `npm run rights:check` prints the
  same decision. At the Hindi verification run: 109 documents, 107 bundled, 2 left out (the unverified Albanian and
  Thai Scripture samples), 0 refused, and a production build made that way contained the Hindi stories and the
  credited verses and neither of the two unverified texts. (Later the same evening the check reported catalogue
  problems for Albanian texts whose course was not yet registered: the gate stopping a build is the gate working.)
- **A licensed text carries its licence.** The Hindi Scripture documents name the translation, the rights holder,
  the licence and the distributor; the reader shows that line under the text at every assistance level, with the
  licence terms and what was left out (footnotes, headings, cross-references) one disclosure away.
- **Jurisdictions.** The gate can be given the jurisdictions a build is released in
  (`npm run rights:check -- --release US,DE,EU`; added by the German session, `2780589`). The IRV record states
  its basis as a licence granted worldwide by the rights holder (`statusByJurisdiction: { '*': 'licensed' }`),
  so all five Hindi Scripture documents pass any release list; a public-domain status is never recorded that way.
- **Share-alike is isolated.** The verses are passed on unchanged, as their own corpus (`bible-hi-irv2019`),
  beside — not inside — the app's code, word list and other corpora. No other Hindi text is in that corpus or under
  that licence (tested). Open question for the owner, recorded in the rights record: whether the word-by-word
  help shown over a verse is "adapted material"; it is computed on the device and never stored in the verse text.
- **Your Copy.** A learner's own book is `personalCopy`, stays on the device, is refused by the build gate, and
  shares the learner model. Importing a file does not change its copyright status, and the app says only that the
  copy stays on the device.

## 8. Rights status of every bundled source

| Source | State | Evidence |
|---|---|---|
| पहली कहानियाँ 0A / 0B / 0C and the two seed texts | course-authored | written for the course by an AI model; labelled as such on every document and work |
| Indian Revised Version (IRV) Hindi 2019 | verified-open-licence (CC BY-SA 4.0) | the distributor's copyright page names the rights holder and the licence; the build script re-reads that page on every run and writes nothing if it no longer says so; all 91 verses equal the distributor's text (`data/verified/scripture.json`); verified by the coordinator (an AI), not legal advice, to be confirmed by the owner |
| World English Bible (the English beside the verses) | public domain | as stated by the same distributor |

Nothing else of Hindi is bundled.

## 9. Recommendation only, and unverified or excluded

**Pointer only (the source's own terms rule out use inside software; no "add your copy" is offered):** the three
NCERT reader series (रिमझिम, वसंत, क्षितिज). NCERT's online-textbook page states that its textbooks are
copyrighted, may not be redistributed in any form, and may not be used as part of digital content packages or
software.

**Recommendation only (in copyright; the learner brings a lawful copy, which stays on the device):** Harry Potter 1
in Hindi (a story the learner may already know), तमस, झूठा सच, मधुशाला, मैला आँचल, राग दरबारी, गुनाहों का
देवता, रश्मिरथी, अग्नि की उड़ान.

**Remaining acquisition candidates** (the following describes the initial research; the acquisition update below supersedes completed items):
- *StoryWeaver (Pratham Books).* Verified: the site states CC BY 4.0 for all stories and illustrations and
  CC BY-NC-ND 4.0 for narrated stories and videos (so text and audio rights differ), and prescribes the credit a
  reused story must carry. Not verified: the licence line of any individual story; a lawful way of taking stories
  at scale (no documented interface; the terms are silent on automated retrieval, a sister site forbids it; the
  site names a partner contact). Until Pratham Books answers, nothing is fetched by a program.
- *Premchand* (two stories, पंच परमेश्वर and नमक का दारोगा, are in the library as installed; 15 stories, 4 novels listed; died 1936) and the other older authors (गुलेरी, प्रसाद, भारतेंदु, खत्री,
  सुभद्रा कुमारी चौहान, गांधी, रामचंद्र शुक्ल), पंचतंत्र retellings. The date of death is a lead; which edition
  and transcription a digital text follows, and its status in India and the United States, are not established.
  Part of Premchand's work first appeared in Urdu, so the Hindi edition matters.
- *Heritage:* रामचरितमानस (Awadhi), सूरसागर selections (Braj), कबीर के दोहे — on the Open Reading shelf, tagged
  with their variety, never a main reading, never counted as Modern Standard Hindi.

**NLP resources audited and not used:** the Hindi dependency treebank (HDTB) is CC BY-NC-SA and is not used for
anything shipped; no model, tagger or corpus was bundled. Details in `docs/hindi/SOURCES_RESEARCH.md`.

## 10. Known linguistic weaknesses

1. **Everything Hindi was written by a model.** Stories, glosses, genders, the ने flags, the pronunciation
   exceptions, the unit tables and the construction explanations are machine-drafted and unreviewed.
2. **Unseen text.** About one word in sixteen of unseen Scripture has no list-vouched reading; general prose
   will be worse, since the list leans toward the home, school and church domains it was built for. The dictionary
   (38,635 entries) is installed and decides what the rules only guess; it has not been measured on Hindi prose.
3. **Homographs are decided by a handful of neighbour rules.** कल is never split; सोने का … (gold / to sleep),
   खाना है, a noun that is also a participle are right in the common frames and can be wrong outside them. A
   second sense may be missing entirely (the word list is one sense per entry unless both were thought of).
4. **Pronoun lemmas.** The lemma of वे / उन / उन्होंने is वे and of ये is ये (the direct form of the same number);
   a dictionary files them under वह / यह. The gold drafts expect the dictionary headword. One of the two has to be
   chosen by a reviewer; changing it is a small table change plus a version bump.
5. **The unwritten *a*** in long or compound words is a rule with exceptions; the engine says "uncertain" rather
   than guess, and a dictionary's pronunciation, when present, overrides the rule.
6. **Writing checks see little.** Agreement, the oblique before a postposition, ने with a non-perfective verb, a
   few spelling slips. A missing ने (मैं किताब पढ़ा) is not yet reported. The page says so wherever a check runs.
7. **Sentence splitting** joins a sentence that ends in a listed abbreviation to the next one, and an ellipsis
   always ends a sentence.
8. **Constructions are detected conservatively:** an unusual word order is missed rather than guessed.
9. **Register tags** are the drafter's judgement of a word's origin layer; the Sanskrit-derived / Perso-Arabic
   line is sometimes debatable. They are shown as facts about a word, never as "correct Hindi" — but a wrong tag
   is still wrong.
10. **Best next reads for a learner with no history** is not in story order (the Continue card is).
11. **First start-up** imported every course's bundled texts (15–25 seconds). Resolved on 2026-10-01 by the Spanish
    session (`e63a617`): only the chosen course's language is imported, and the first-run team choice also builds
    the library index before Home opens. Not re-measured in the browser by this session.

## 11. Native-review work required (in order of value)

1. **Stage 0A (12 stories, 1,359 words):** naturalness, gender and agreement, spelling choices, the English lines.
   `docs/hindi/STAGE0.md` lists the sentences the drafter doubted. Until this is done no Hindi course text is
   published to learners. Record with `npm run corpus:review -- <file> --by "<name>" --level native`.
2. **The 0A word list (79 forms) and its glosses and genders**, then 0B and 0C.
3. **The gold set:** correct and accept drafts (`npm run hi:gold -- accept --by "<name>" --id …`), beginning with
   the categories that mislead most: ने, को, oblique, agreement, compound verbs, complex predicates. Decide the
   pronoun-lemma convention on the way.
4. **Pronunciation:** the exception list (7 words) and the words left "uncertain" in the texts.
5. **The unit tables** (603 complex predicates) and the construction explanations.
6. **Register tags** of the commonest 300 words.

A reviewer who is not a native speaker can still record a language check (`--level linguistic-check`); it is kept
and it does not publish anything.

## 12. Awaiting external input

The two previously blocked downloads are now complete and installed. Their source records and checksums are retained:
  - `hin2017_usfm.zip` from `https://ebible.org/Scriptures/hin2017_usfm.zip` (2,237,995 bytes) → `data/sources/hi/`
    — the whole IRV Hindi text, to build the Bible beyond the 91-verse slice (same licence, same verification).
  - `kaikki.org-dictionary-Hindi.jsonl.gz` from `https://kaikki.org/dictionary/Hindi/` (17,993,921 bytes) →
    `data/dictionaries/` — the Wiktionary extract, to be built into `public/dict/hi` with `npm run dict:build`
    as for Thai and Spanish. Its licence (CC BY-SA and GFDL) is the dictionary's own and is shown with every gloss.
- **A native Hindi reviewer** (section 11).
- **Remaining literary editions:** exact reusable editions or permission where the acquisition report records a gap.

The documented Global Digital Library API supplied 124 licensed children's books, with individual credits; one damaged source was excluded. A complete six-act source of *अंधेर नगरी* is also installed with edition and transcription attribution. The IRV share-alike corpus remains separate from the children's collection. All 1,310 lazy Hindi documents passed the publication gate (2026-10-01); native review of machine-drafted Stage 0 remains outstanding. As rebuilt on 2026-10-06 the library holds 1,285 documents, all published (92 children's books graded onto the four shelves c1–c4; the 124 counted on 2026-10-01 were not reconciled with these 92 in this update; `npm run library:check`), and the 101-unit ladder is in preview only.

## 13. Next highest-value step

A native review of Stage 0A. It is the smallest unit of work that turns the course from a preview into something a
learner can start, and it exercises the whole review path once. The dictionary, full Scripture, and licensed children's collection are already installed. Continue edition-specific acquisition using the recorded gaps, and re-run the held-out probe when the adapter changes.

## 14. How to continue

```
npm run gate                      # type check + every test
npm run rights:check              # what a production build will bundle, leave out or refuse
npm run corpus:check              # every bundled document validated, with analysis coverage
npm run hi:probe                  # how the adapter reads the bundled Hindi texts
npm run hi:sentence -- "<Hindi>"  # everything the adapter says about one sentence
npx vite-node scripts/probe-hi-heldout.mts   # unseen chapters, counts only
npm run hi:gold -- status         # the gold set: accepted, drafts, stale
npm run hi:eval-gold              # measures only accepted items; --include-drafts is defect-finding
node scripts/build-hi-scripture.mjs && node scripts/verify-scripture.mjs   # rebuild and re-verify the slice
```

- Work on a class of error, never on a single word, and never tune against the held-out tables
  (`test/integration/hindi-tables.ts`) or the held-out chapters.
- Patch files with the editor or a script written to disk; shell heredocs in this environment lose backslashes.
- Hindi code points that an editor may recompose (the nukta letters) are written in tests as
  `String.fromCodePoint(…)`.
- Several sessions may share this working tree: stage by path, never `git add -A`; keep every adapter importable
  at every save; never link `node_modules` into a temporary folder and never run `npm ci` while others work.

## 15. Tests

Added for Hindi (all pass; counts at commit `7a56681`): **37 test files, 1,667 tests** in the Hindi-specific run —

| What is tested | Files |
|---|---|
| Unicode normalization, nukta preservation, round trip, akṣara segmentation, pronunciation, romanization | `test/adapters/hindi-script`, `hindi-pronunciation`, `hindi-translit`; `test/integration/hindi-course` (stored text, token and form identity) |
| Tokenization, punctuation, sentence splitting | `test/adapters/hi`, `hindi-sentences` |
| Oblique forms, pronoun variants and fusions, verb forms, causatives, persons, feminine plural, guesses | `test/adapters/hindi-morph*` (7 files) |
| Word list: rows, genders, registers, nukta relation, transitivity, homograph pairs, Stage 0 fully vouched | `test/adapters/hindi-lexicon`, `hindi-wiring` |
| Compound verbs, complex predicates, postpositions; constructions; neighbour rules — on fixtures and on the real adapter | `hindi-phrases`, `hindi-constructions`, `hindi-disambiguate` and their `-real` files |
| Writing checks: silence on correct sentences, corrections only where reproducible | `hindi-production`, `hindi-production-real`; the coordinator's own sentences in `test/integration/hindi-writing` |
| The coordinator's unseen tables (script, pronunciation, forms, fusions, nonsense) | `test/integration/hindi-engine` with `hindi-tables` (288) |
| Course end to end: shelves and assistance, one learner model across stories / Scripture / own book, variety separation, Your Copy privacy, Bible isolation, rights gating, register in difficulty | `test/integration/hindi-course` (24) |
| Catalogue and Stage 0 constraints | `test/course/hindiCatalog`, `test/content/hindi-stage0` |
| Rights gate; review levels; heritage separation; rescue dependence; first text; headings; gold workflow; source line; romanization rescue; Help-you-needed panel | `test/ingest/rights`, `reviewLevel`, `hindiHeadings`; `test/golearn/heritage`, `rescue`, `firstText`; `test/tools/hi-gold`; `test/ui/sourceLine`, `rescueRomanization`, `helpNeeded` |

Whole suite (every course; run once at the end with three other sessions working in the same tree): 284 files,
8,321 tests passed, 10 failed in 7 files. Six of the failing tests were command-line tests (`dict:build`,
`corpus:check`, `corpus:review`, `corpus:convert`, `library:build`) that passed when run on their own (24 of 24):
they time out when several sessions run tests at once. The other four were Albanian tests (`test/adapters/sq`,
the Albanian lines of `verification`, `test/bench/sq-gold`) belonging to a course that was being edited at that
moment by its own session. No Hindi, Thai, Spanish or German test failed. The suite was 196 files / 3,531 tests
before the Hindi work began; Thai and Spanish regression safety rests on their own integration tests
(`thai-course`, `thai-ladder`, `thai-tones`, `spanish-course`, `spanish-loop`, `spanish-dictionary`,
`compat`), all passing.

Also run: type check clean for all Hindi files; `corpus:check` (0 validation errors, re-import unchanged, verified
verses byte-identical); a production build with the rights gate; a browser audit in a sandbox (Home and doors,
Explore, the Stage 0 reader and word sheet, the romanization rescue, Scripture with its credit, Your Books import of
a Hindi text with chapter headings, testimony checking; Spanish spot-checked unchanged). The audit found six
things the tests had not: no credit on the Scripture page, the Stage 0 help profile not reaching the reader, Hindi
chapter headings not recognised, "add your copy" offered for NCERT, the eighth story offered first, and "gha-r".
All fixed, each with a test.

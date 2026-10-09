# Legacy salvage audit

Status: 2026-10-08, HEAD 8dc86370 plus this phase's scaffolding. The lead's reconciliation of four read-only audits
(annex A architecture, B linguistics, C rights and sources, D security/storage/sync) and of the sibling repository
2GoLearn. Where the annexes disagreed or left gaps the lead checked the code; every line-number citation is in the
annexes. Classes: KEEP (reusable with little change), ADAPT (useful logic to separate from legacy assumptions),
REBUILD (wanted functionality, unsuitable architecture), RETIRE (incompatible with the product), QUARANTINE (legal or
technical status prevents safe reuse), UNKNOWN (insufficient evidence).

## 1. What exists today (one paragraph each)

**The application.** A Vite 8 / React 19 / Dexie 4 single-page app (HashRouter, relative base), 14,307 lines of UI,
with a course platform wired through every layer: a learner belongs to one `Course` (team + language); startup imports
that language's bundled corpus and ladder into IndexedDB; Home opens Stage 0, a path of ladder units, a library of
shelves, Scripture, testimony writing, retrieval practice, team texts. No accounts; a local `u-local` learner; no
server for learner data (a text-sharing server exists for teams). Full test suite today: 10,205 passed, 3 failed
(two Codex-era data mismatches, one load-dependent flake that passes alone). Annex A, D; `BASELINE-TEST-REPORT.md`.

**The language analysis.** Seven adapters (es, de, hi, th, sq, nb, nn) over a shared contract: 47,872 lines, pure and
I/O-free, hand lexicons of 1,350–2,974 lemmas per language with rule morphology, compounds, particle/separable
units, constructions (16–50 per language), phrases, historical spellings, varieties, concept families (Norwegian),
production checks, pronunciation rules; 4,691 adapter tests green; dictionary join to kaikki/Wiktionary shards for
five languages; measured accuracies exist for de (AI-judged), nb/nn (blind holdout 98 % lemma), es (dictionary-judged
92.65 %), th segmentation (F1 90.27), sq (treebank, 64–68 % first-reading lemma); **no native review of anything**.
Annex B.

**The learner model.** `src/golearn` (7,387 lines): an append-only event log, time-derived sittings, a pure fold to
per-item state in four modalities under `evidence@8` (exposure ≠ comprehension; help discounts; rebuildable), a
familiarity estimate with six-week decay, readiness and pace, recommendations, retrieval practice, recall prompts,
an unseen-text check. Eleven of ~50 event kinds feed the fold; the fold resolves items through stored tokens of
imported texts. The same engine has already been lifted, host-neutral, into **2GoLearn** (`C:\Users\CJWal\dev\2GoLearn`:
core with no dependencies, memory and Dexie stores, adapter kit, React hooks, a spaced-repetition deck with ladder
and FSRS schedulers, GoListen as a subsidiary module; 793 tests per its last commit, 628 literal cases by grep;
no remote). Annex A §4, §10.

**Writing (GoTell).** 3,756 lines: a per-learner testimony with drafts, immutable revisions and suggestions from the
adapters' `checkProduction`; a practice ladder of 15 testimony-centred goals with concept tables, a deterministic
scheduler, a help ladder and separate meaning/language assessment; events only; no LLM wired. Annex A §7.

**Listening (GoListen).** 3,993 lines: a provider port (Azure direct, proxy, fixture; none ever run live), a
synthesis pipeline with validation and content-addressed assets, human-recording import bound to exact text
versions, strict evidence eligibility (reviewed human speech only), a DOM-free player; since 2026-10-08 presented
inside the Reader as GoLearn's listening layer. One test recording exists; no production audio. Annex A §8.

**Content and rights.** Bundled corpus (147 documents), six ladders (633 units), Stage 0 packs (169 files), installed
libraries for five languages (196 MB), dictionaries (122 MB), four whole Bibles, a catalogue of 378 works with a
nine-state rights vocabulary and a build gate. Every "verified" record was set by a tool or an AI, never a named
person; 82 PD works are US-only; the built libraries are already on the public `gh-pages` branch and the source texts
are in git history. Annex C.

## 2. The old assumptions and where they live

| assumption | evidence | consequence for the new product |
|---|---|---|
| a learner has exactly one course and the course fixes one language | `User.courseId` required (`model.ts:55`); `Course.lang`; onboarding creates the user with a course; the app context's `lang` is the course's | replaced by enrolments (`GO-REPOSITORY-DESIGN.md` §3) |
| only the active course's language is loaded; other-language texts are refused | `bootstrap.ts:391`, `TextPage.tsx:44`, `recommend.ts:117` | gone: the extension analyses what the learner selects in any enrolled language |
| every learner enters through a ladder | `recommend.ts:26,108`; `ladder/path.ts`; onboarding → `/start` | gone |
| advancement = course completion | `path.ts:192-206`; `catalog.ts currentStage`; `readiness.ts:72-90` | gone; readiness remains advice over the learner's own reading |
| every Text has a corpus and mostly a work/stage | `model.ts:150 corpusId` required; `assistanceFor` by stage/work | the Repository's unit of context is a sentence identity with a source reference, not a Text in a corpus |
| every text has a local source file the importer reads | `ingest/index.ts:63` glob; no locator field on `Sentence`/`Text` | the extension never stores the book; a context is identified by hash + locator |
| vocabulary state derives only from the native reader | `FOLD_TYPES`; the fold needs stored tokens (`fold.ts:311`, `items.ts:20`) | the fold must accept items resolved at lookup time from a selection (2GoLearn's `queryItem({surface, lang})` and form-only mode are the path) |
| Scripture is embedded | `Text.scripture`, `/scripture*` routes, `verify-scripture-canon` in the build, `bibleAccess.ts` | gone from the product; the learner's own Bible is a book like any other |
| listening needs an exactly bound audio corpus | `eligibility.ts`; `AudioTextBinding`; `LISTEN_CREDIT` | the binding rule stays (evidence only for reviewed human speech bound to a sentence); the corpus assumption goes |
| writing exercises belong to a lesson/domain | `goals.ts` fixed catalogue; Stage 0 production tasks; one testimony per learner-language | GoTell keeps goals as the learner's, not a lesson's |
| fixed set of hard-coded languages | 22 `Record<LanguageCode, …>` sites; `lang === 'th'` branches | language packs; `LanguageCode = string` (as 2GoLearn already does) |
| content is curated, reviewed and rights-gated before use | `publish.ts`, `rightsGate.ts`, `reviewStatus`/`published` | the learner's own lawful text is never "published"; the gate's refusal rules survive as a guard against redistribution |

## 3. Salvage inventory

### A. Language analysis (the asset)

| component | class | files | why | migration | risks / tests |
|---|---|---|---|---|---|
| Spanish, German, Albanian, Norwegian adapters | **KEEP** | `src/adapters/{es,de,sq,nb,nn}.ts`, `spanish/**`, `german/**`, `albanian/**`, `norwegian/**` | pure, tested (409 / 1,358 / 909 / 129), measured | move unchanged into `packages/language-packs/<lang>` with the extracted type slice; bump nothing | accuracy is machine-judged; cast names in lexicons give false PROPN readings in general text (remove `lexicon-course` names per pack); `refine`/sentence layers need context |
| Hindi adapter | **KEEP** (carefully) | `src/adapters/hi.ts`, `hindi/**` | 1,282 tests, decoder, 50 constructions | same | nothing measured against a human (0 of 189 gold accepted); numerals 0–20; nukta folding only in search |
| Thai adapter | **ADAPT** | `src/adapters/th.ts`, `thai/**` | decoder and tone lists are valuable (0.82 % confident-wrong tones) | keep the decoder; replace ICU-plus-patches tokenization with a dictionary-backed max-match for the extension (dict-mm measured F1 96.56 vs 90.27); the pinned/compound lists are tuned to the retired corpus | tokenization is context-sensitive and ICU-version-dependent; the segmentation gate is unmet |
| shared tokenizer, lexicon helpers, phrase matcher | **KEEP** | `src/adapters/shared.ts` | language-agnostic | into the pack kit | `Intl.Segmenter` dependency must be declared per pack |
| adapter contract and type slice | **ADAPT** | `src/core/adapters.ts`, parts of `model.ts`, `course.ts`, `variety.ts` | the contract is right; the slice pulls `course/curriculumPolicy` | extract `language-pack-types`; align with 2GoLearn's `LanguageAdapter` (required floor + declared capabilities), which the adapters already approximate | standalone compilation not yet tried |
| dictionary format, sharded loader, mapper, builder, frequency | **KEEP** | `src/dict/{format,sharded,map,build,frequency}.ts` | browser-safe, licence-labelled | into the pack kit; frequency sidecars rebuilt from clearly licensed text | shard size vs extension memory unmeasured; CC BY-SA notice must travel |
| dictionary join | **ADAPT** | `src/ingest/plan.ts` (the pure functions listed in annex B §5) | well tested (181) | extract from document planning into the context parser | none beyond extraction |
| analysis resolution rules | **KEEP** | `src/golearn/analysis.ts` pure functions | `pickAnalysis`, `creditableLemmaId`, `morphologyLine` | into the Repository engine (2GoLearn already carries equivalents) | `AnalysisCache` is store-bound: drop |
| language guesser | **KEEP** | `src/ingest/language.ts` `guessLanguage`, `guessScandinavian` | pure; Danish rejected | page-level guess in the extension; retire `fitsTeamLanguage` | 40-word floor |
| item ids | **KEEP** (subset) | `src/core/ids.ts` `form:`/`lemma:`/`phrase:`/`pattern:`/`orth:` | cross-application identity | shared through the contract | course ids dropped |
| production checks | **ADAPT** | `checkProduction` in each adapter | serve GoTell | stay in the pack as a declared capability consumed by GoPractice | thin for es, th; none for nn |
| gold sets and benchmarks | **KEEP** (dev assets) | `data/benchmarks/{de,hi,th,sq}`, `test/adapters/norwegian-holdout.test.ts` | the only measurements that exist | travel with the pack's tests where rights are clear (de Kafka via Wikisource PD; th generated examples are CC BY-SA and git-ignored) | hi 0 accepted; sq 0 reviewed |
| Stage 0 sound tables | **UNKNOWN** | `src/stage0/lang/index.ts` | possible "how it sounds" text for the extension card | product decision | machine-drafted regex tables |

### B. Learner model and the Repository

| component | class | files | why | migration |
|---|---|---|---|---|
| event-log design, sittings, fold, aggregates, policy versioning | **ADAPT via 2GoLearn** | `src/golearn/{fold,agg,book,state,sitting,userlog,audit,policy}.ts`; `src/core/{bus,events,ids}.ts` | the design is exactly the derived-state layer; 2GoLearn is its host-neutral lift | build the Repository engine on `2GoLearn/packages/core`; port only what 2GoLearn lacks (priorities, writing projections, tombstones, decay — go-v0's six-week decay is newer than the lift) |
| queries, explain, history, occurrences, coverage | **ADAPT via 2GoLearn** | `src/golearn/{queries,explain,history,occurrences,coverage}.ts` | present in 2GoLearn `queries/` | use 2GoLearn's |
| retrieval practice, recall prompts, unseen check, held-out | **ADAPT** | `src/golearn/{retrieval,prompts,assessment,heldout}.ts` | new this week, event-driven, tested | retrieval merges into GoReview's deck session; prompts become GoReview's cloze/yes-no cards and the extension's end-of-passage check; the unseen check becomes a GoReview assessment type |
| recommendations, ranking, candidates, readiness by stage, forecast | **RETIRE** (library-bound) | `src/golearn/{recommend,rank,candidates,readiness,forecast,personal,pace,rescue}.ts` | they rank a bundled library the product no longer has | 2GoLearn keeps generic `scopeReadiness`/`targetReadiness`; a "what to practise" priority replaces "what to read next" |
| store contract, Dexie bindings, memory store | **ADAPT via 2GoLearn** | `src/core/store.ts`, `src/db/dexie.ts`, `src/sim/store.ts` | small swappable interface | 2GoLearn's `store-dexie`/`store-memory`, extended with audio tables (already there) and the Repository's new tables |
| backup format and restore | **ADAPT** | `src/backup/**` | versioned, checksummed, validate-then-write, merge/replace | becomes the Repository export; add personal copies' snippets, settings, optional encryption, deletion tombstones |
| identity (`u-local`), team sharing server | **RETIRE** | `src/goread/**`, `server/goread/**`, `TeamSharingSection` | device-local ids and an open-read bearer-key server are not the Repository's identity or sync | the refusal rules (`sharing.ts`: personal-copy, user-private, generated, unverified never leave the device) survive as a guard |

### C. Applications and UI

| component | class | files | why | migration |
|---|---|---|---|---|
| Reader and word sheet | **REBUILD** | `src/ui/reader/**` (3,179 lines) | React-bound join/display logic inside a document reader; the extension needs a pure "card model" rendered in a page overlay | the card model (lemma, morphology line, gloss with provenance, phrases, grammar, family, "how it sounds", knowledge line) is specified from `TokenCard.tsx`'s contents; the demonstration reader reuses the Reader as is |
| Stage 0, ladder, path, library, explore, scripture, course pages, catalogue, doors | **RETIRE** | `src/ui/{stage0,ladder,read,scripture,course}/**`, `src/ui/pages/{Course,Curriculum,Explore,Library}.tsx`, `src/course/**`, `src/ladder/**`, `src/stage0/**`, `src/library/**`, `src/authoring/**`, `src/sim/**` | the retired curriculum | kept in git history; the essentials screens of onboarding borrow at most the sound-feature idea |
| personal-copy import (.txt, unprotected .epub, .json), Books page | **KEEP** | `src/ingest/{plaintext,epub,import,pipeline}.ts`, `src/ui/course/CopyImporter.tsx`, `src/ui/pages/Books.tsx` | lawful local files are a first-class reading environment; the EPUB reader refuses DRM | the demonstration reader's local-file adapter |
| GoTell testimony and practice | **ADAPT** | `src/gotell/**`, `src/ui/testimony/**`, `src/ui/tell/**` | event-driven, no mastery model of its own, reads learner state through queries | `packages/gotell` reading the Repository contract; drop the course-lang maps (`LANG_NAME`, `Record<LanguageCode>` tables become pack data) |
| GoListen engine | **ADAPT via 2GoLearn** | `src/golisten/**` | lifted into 2GoLearn `listen-engine` (793-test commit) | use 2GoLearn's; keep go-v0's newer ListenBar/useListenSession behaviour as the reference for the extension's playback and GoReview's listening cards |
| practice page, settings (learner, privacy, speech, recordings, backup) | **ADAPT** | `src/ui/pages/{Practice,Settings}.tsx`, `src/ui/pages/settings/**` | the shells of GoPractice and GoLearn settings | split by application |
| design system | **KEEP** | `src/index.css` tokens, fonts | shared by both applications | EB Garamond licence text to be added |

### D. Content and data

| component | class | why | decision |
|---|---|---|---|
| bundled corpus, ladders, Stage 0 packs (owner/AI-drafted) | **KEEP as seed material**, not product content | owner-authored, unreviewed | available to GoPractice as example sentences and to onboarding's essentials; never presented as a course |
| 20 adapted units (CC BY-SA/CC BY derivatives) | **QUARANTINE** | share-alike obligations on the units themselves | keep only with attribution and licence on the unit, or delete |
| installed libraries, `data/sources`, four Bibles, `public/library` | **RETIRE** as product content; **QUARANTINE** the 82 US-only PD works and the already-published `gh-pages` copies | `RIGHTS-AND-PRIVACY-BOUNDARIES.md` §2 | remove from the next deploy; decide with expert review about git history and the public branch |
| dictionaries (kaikki CC BY-SA) | **KEEP with obligations** | needed by the packs | attribution and licence in every surface that shows a gloss; derived data stays CC BY-SA |
| frequency sidecars | **QUARANTINE** | built from retired, partly US-only libraries | rebuild from clearly licensed text |
| test fixtures reading bundled data (~50 files) | **QUARANTINE** | break when the data goes | rewrite to synthetic fixtures before retirement |
| the one Commons recording | **KEEP** as a fixture with attribution | PD-self | |
| `data/private` learner backup, `work/` caches, untracked root files | **QUARANTINE → delete** | unencrypted learner data; unrecorded-origin EPUB | owner decision |

## 4. Preservation rule

Nothing in RETIRE is deleted in this phase. The retired modules keep compiling and their tests keep running until
their replacements are tested (charter principle 15, execution standard "preserve current behaviour in reusable
modules"). Deletion is a later, reviewed commit per module with its tests moved or removed deliberately.

## 5. Open items the lead could not settle

- Whether 2GoLearn's `verify` gate is green today (claimed 793 tests; not run in this phase).
- Which lexicon rows derive from Wiktionary (Albanian `lexicon-ladder.ts`, `disputed.ts`) and so carry share-alike.
- Single-word, no-context accuracy of each adapter (the extension's actual condition) — not measured.
- Browser and extension-worker behaviour of `Intl.Segmenter` for Thai — not measured.

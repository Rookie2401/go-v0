# Go (V0) — missions-oriented language acquisition

Five courses: Honduras → Spanish, Albania → Albanian, Thailand → Thai, India → Hindi, Germany → German.

Three surfaces where the learner works — **Read** (comprehensible-input texts), **Scripture**, **My Testimony**
— and three engines underneath them — **GoLearn** (encounter evidence and learner-language state),
**GoListen** (auditory input attached to the same texts), **GoTell** (restrained writing help grounded in
encountered language). One shared model, one event log, one learner state.

Reading and listening are primary; writing is a bridge to real conversation. Target-language text is primary;
English is optional rescue. Scripture is exact and is never generated or simplified.

## Run

```bash
npm install
npm run dev              # http://127.0.0.1:5196
npm run gate             # tsc -b && vitest run
npm run corpus:check     # bundled corpus: validation, re-import, Scripture byte check
npm run corpus:validate -- path/to/text.json
npm run corpus:review -- path/to/text.json --by "Reviewer Name"   # record a review (never changes text)
npm run corpus:prove     # import proof on synthetic files (docs/import/PROOF.md)
npm run corpus:convert -- book.txt --lang th --work <slug>   # your own copy of a book → chapters under data/private/ (never bundled)
npm run dict:build -- --in <file.jsonl> --lang th           # build dictionary shards from a licensed source file
npm run speech:check     # speech configuration + provider-independent checks
node scripts/verify-scripture.mjs
npm run build && npm run preview   # http://127.0.0.1:4196
# http://127.0.0.1:5196/?sandbox=demo  → a separate, bannered test database
```

## Documents

| | |
|---|---|
| `docs/READINESS.md` | Per-language readiness (ingestion, analysis, Scripture, speech); implemented vs verified vs awaiting external input |
| `docs/IMPORT.md` + `docs/import/templates/` | The versioned text-import specification, templates, and how to validate, import, review and publish |
| `docs/import/PROOF.md` | Generated record of the import tests (valid, malformed, duplicates, batches, spans, revisions, holds) |
| `docs/THAI_COURSE.md` | The Thai course: reading ladder, rights, Thai analysis, assistance that removes itself, learner model |
| `docs/HINDI_COURSE.md` + `docs/hindi/` | The Hindi course: shelves, Stage 0, the Devanagari layer, morphology and constructions, register layers, rights status of every source, what is verified and what awaits a native reviewer |
| `docs/SPANISH_COURSE.md` + `docs/spanish/STATUS.md` | The Spanish course: streams, shelves, rights states, varieties, the library, personal difficulty — and exactly what is built, bundled, recommended only, and unverified |
| `docs/STORAGE.md` | Storage model, backup and restore |
| `docs/SPEECH.md` | Speech configuration (server-side key), what is recorded, failure states, review |
| `docs/ARCHITECTURE.md` | Architecture and decisions (§12 = the readiness round) |
| `docs/PLAN.md` … `docs/PLAN5.md` | Package ownership and the briefs the code was built against |
| `src/golisten/QA.md` | Speech QA set and the voice audition procedure |

## Layout

```
src/core        contract: model, ids, events, adapter/store/engine interfaces, memory store, bus, fixtures
src/adapters    es / sq / th / hi / de LanguageAdapter implementations, seed lexicons, declared support
src/ingest      import format v2, validation, atomic repeatable importer, publication gate, plain-text books
src/course      reading ladders (stages, works, rights, assistance profiles), Spanish streams and shelves, the catalogue
src/library     the large-corpus library: index, posting lists, per-text profiles, build tool, import on open
src/dict        dictionary build pipeline and runtime source
src/golearn     evidence policy, encounters, coverage, readiness, recommendations, audit/rebuild
src/golisten    speech provider interface (Azure adapter, development fixture), jobs, assets, status, player
src/gotell      drafts, versions, honest suggestions, meaning help, production provenance
src/backup      learner export / restore
src/db          Dexie (IndexedDB) AppStore + asset store
src/ui, src/app React surfaces, shared reader, player, testimony editor, settings, bootstrap
data/corpus     seed documents (format v2); data/verified = Scripture verification record
scripts/        corpus CLI, Scripture verification, probes
test/           per-package tests + test/integration (Spanish end-to-end loop, five-language compatibility)
```

## Status in brief

- **Supplying texts** works through the versioned import format: validate, import (bundled folder or
  Settings → Content), review, publish. Imports are exact, atomic and repeatable; edits version the content
  without erasing history.
- **Nothing unreviewed reaches a learner.** The ten bundled stories and dialogues are machine-drafted samples,
  visible only in the bannered preview mode. Spanish (Reina-Valera 1909) and German (Lutherbibel 1912)
  Scripture samples are byte-verified against eBible.org, and so are 91 verses of the Hindi Indian Revised
  Version (a licensed text, CC BY-SA 4.0, credited where it is read); Albanian and Thai Scripture is blocked until
  an approved translation is supplied.
- **GoListen (audio) is deferred to V2 and switched off** (`FEATURES.listen` in `src/core/config.ts`, with the
  matching `LISTEN` constant in `vite.config.ts`): the app shows no audio interface, registers no speech provider
  and makes no speech request. The package, the speech proxy and their tests stay in the repository, dormant and
  green. It was only ever tested against a mocked service — no real speech has been produced.
- **The Thai course has its structure and none of its books.** The reading ladder (Stage 0, Grades 1–9, open
  reading), stage-specific assistance, Thai script decoding, the learner model for a ladder and the import of a
  learner's own copy of a book are built and tested; every work is a recommendation with rights unverified, and
  no dictionary, Thai Bible or audio is included. See `docs/READINESS.md`, "Thai course".
- **The Spanish course has its system and almost none of its content.** Streams, shelves, rights states, regional
  varieties, rule morphology with readings ordered by context, a library that never loads whole, personal
  difficulty, ranking, search and the import of a learner's own `.txt` / `.epub` are built and tested. Bundled are 26
  short course texts drafted by an AI model (unreviewed, preview only) and three verified Bible verses; the other 61
  works of the catalogue are metadata with rights unverified, and no Spanish dictionary is installed. See
  `docs/spanish/STATUS.md`.
- **The Hindi course has its system and a first slice of content.** Shelves that are never locks (Stage 0A–0C,
  Classes 1–12, Open Reading), real Hindi from the first line with the script decoded on the word sheet and
  romanization only as a recorded rescue, rule morphology with a word list of 2,532 lemmas, compound verbs and
  complex predicates as units, 46 constructions met in texts, register layers, heritage languages kept apart, and a
  rights gate in the production build. Bundled are 26 Stage 0 stories drafted by an AI model (unreviewed, preview
  only) and 91 verified verses; everything else in the catalogue is metadata with its rights state. No analysis has
  been checked by a native speaker. See `docs/HINDI_COURSE.md`.
- **Analysis is seed-lexicon only.** Every word of a supplied text is tokenized and tracked; lemma and gloss
  exist only for seed vocabulary or for analysis supplied with the text.
- **GoTell is rule-based** and states what it cannot check. No GoSpeak, no pronunciation scores, no
  ghostwritten testimonies.

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
npm run ladder:check     # the reading ladders of all five courses: coverage, recycling, cliffs (docs/LADDER.md)
npm run stage0:validate  # the Stage 0 packs of all five courses (docs/STAGE0.md)
npm run library:rebuild -- <lang>   # build, refresh and audit one course's library (git-ignored output in public/library/<lang>)
npm run library:check    # every course's built library: documents checked, published, words
npm run dict:status      # which dictionaries ship
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
| `docs/GERMAN_COURSE.md` + `docs/german/STATUS.md` | The German course: the adapter, streams, rights, and what was measured and what was not |
| `docs/albanian/STATUS.md` | The Albanian course: status of record, the word-form engine's checks, the ladder |
| `docs/LADDER.md` | The ladder: one ordered path per language from Stage 0 to the library, its gate (`npm run ladder:check`) and the draft → review → audio → published pipeline |
| `docs/STAGE0.md` | Stage 0 ("Start from zero"): the micro-scene packs, the engine, the exit gate |
| `docs/audits/` | The B2 audit and simulation, the listen test, and the five-course audit of 2026-10-06 |
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
src/ladder      the reading ladder: types, gate, path, placement (data in data/ladder/<lang>)
src/stage0      the Stage 0 engine (data in data/stage0/<lang>)
src/sim         the simulated student (scripts/simulate-learner.mts)
src/gotell      drafts, versions, honest suggestions, meaning help, production provenance
src/backup      learner export / restore
src/db          Dexie (IndexedDB) AppStore + asset store
src/ui, src/app React surfaces, shared reader, player, testimony editor, settings, bootstrap
data/corpus     seed documents (format v2); data/verified = Scripture verification record
data/ladder     the five reading ladders and their plans; data/stage0 = the Stage 0 packs
scripts/        corpus CLI, Scripture verification, probes
test/           per-package tests + test/integration (Spanish end-to-end loop, five-language compatibility)
```

## Status in brief

- **Supplying texts** works through the versioned import format: validate, import (bundled folder or
  Settings → Content), review, publish. Imports are exact, atomic and repeatable; edits version the content
  without erasing history.
- **Nothing unreviewed reaches a learner.** Every course-written text — the Stage 0 packs, the ladder units, the
  older stories and dialogues — is a machine draft, visible only in the bannered preview mode (Stage 0 shows its
  drafts under its own draft label). What a learner sees without preview is the built library: whole Bibles
  (Reina-Valera 1909, Lutherbibel 1912, the Indian Revised Version 2019, the Open Thai Common Version 2025; none for
  Albanian) and the lawful public-domain and open-licence books of each language. Updated 2026-10-06:
  `public/library/<lang>` is git-ignored build output, rebuilt with `npm run library:rebuild -- <lang>`; as
  installed it holds 1,865 texts in Spanish, 1,870 in German, 1,285 in Hindi, 1,243 in Thai (45 Aesop fables held
  for review) and 38 in Albanian (1 published; the rest held). `npm run build` now stops when any course's library or
  dictionary is missing (`GO_ALLOW_MISSING_CONTENT=1` ships without).
- **Every course has a ladder** (updated 2026-10-06): an ordered path from Stage 0 to the library, in
  `data/ladder/<lang>/` and gated by `npm run ladder:check` (all five at 0 errors) — Spanish 104 units to a B1
  bridge, German 69, Hindi 101, Thai 90 and Albanian 135 units, each to the end of A2 (Spanish through a B1 bridge). Home shows "Your
  path" for each. All of it is machine-drafted and unreviewed; a ladder unit publishes only from `audio-ready`
  (`docs/LADDER.md`). The app registers the whole library with GoLearn, so "Next for you" on the Reading page
  recommends from it. How far a simulated student gets, and the audits behind these changes:
  `docs/audits/`.
- **GoListen is switched on, with nothing to play** (`FEATURES.listen` in `src/core/config.ts` has been `true`
  since 2026-10-03): the player, the lawful-recording import and the listening evidence exist, but no recording
  exists in any course, so Home's GoListen line says "No recordings in <language> yet". The speech proxy
  (`LISTEN` in `vite.config.ts`) is still off, so the app makes no speech request; synthetic speech is practice,
  never evidence. It was only ever tested against a mocked service — no real speech has been produced.
- **The Thai course** has the reading ladder structure (Stage 0, Grades 1–9, open reading), stage-specific
  assistance, Thai script decoding, the import of a learner's own copy of a book, the Open Thai Common Version 2025
  as its Bible (1,189 chapters), a Wiktionary dictionary (20,254 entries) and a ladder of 90 entries. Every
  work of the literary catalogue is still a recommendation with rights unverified. See `docs/THAI_COURSE.md`.
- **The Spanish course** has its system, a library of 1,865 texts in 32 works (the whole Reina-Valera 1909 among
  them; rights recorded for the United States only in 21 of the 32), the Wiktionary dictionary (808,278 entries)
  and a ladder from Stage 0 to a B1 bridge. The other works of the catalogue are metadata with rights unverified. See `docs/spanish/STATUS.md`.
- **The Hindi course** has shelves that are never locks (Stage 0A–0C, Classes 1–12, Open Reading), real Hindi from
  the first line with the script decoded on the word sheet and romanization only as a recorded rescue, rule
  morphology with a word list of 2,937 lemmas, compound verbs and complex predicates as units, 50 constructions met
  in texts, register layers, heritage languages kept apart, a rights gate in the production build, the whole Indian
  Revised Version, 92 Global Digital Library children's books graded onto shelves c1–c4 and a Wiktionary dictionary
  (38,635 entries). No analysis has been checked by a native speaker. See `docs/HINDI_COURSE.md`.
- **Analysis is a hand word list plus rules, and a Wiktionary dictionary for what they only guess.** Every word of
  a supplied text is tokenized and tracked. Adapters now: `adapter-es@11`, `adapter-de@8`, `adapter-hi@5`,
  `adapter-th@4`, `adapter-sq@8`; all word lists are machine-drafted and none has been reviewed by a native speaker.
- **GoTell is rule-based** and states what it cannot check. No GoSpeak, no pronunciation scores, no
  ghostwritten testimonies.

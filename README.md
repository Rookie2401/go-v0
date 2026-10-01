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
node scripts/verify-scripture.mjs
npm run build && npm run preview   # http://127.0.0.1:4196
```

## Documents

| | |
|---|---|
| `docs/READINESS.md` | Per-language readiness (ingestion, analysis, Scripture, speech); implemented vs verified vs awaiting external input |
| `docs/IMPORT.md` + `docs/import/templates/` | The versioned text-import specification, templates, and how to validate, import, review and publish |
| `docs/STORAGE.md` | Storage model, backup and restore |
| `docs/SPEECH.md` | Speech configuration (server-side key), what is recorded, failure states, review |
| `docs/ARCHITECTURE.md` | Architecture and decisions (§12 = the readiness round) |
| `docs/PLAN.md`, `docs/PLAN2.md`, `docs/PLAN3.md` | Package ownership and the briefs the code was built against |
| `src/golisten/QA.md` | Speech QA set and the voice audition procedure |

## Layout

```
src/core        contract: model, ids, events, adapter/store/engine interfaces, memory store, bus, fixtures
src/adapters    es / sq / th / hi / de LanguageAdapter implementations, seed lexicons, declared support
src/ingest      import format v2, validation, atomic repeatable importer, publication gate
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
  Scripture samples are byte-verified against eBible.org; Albanian, Hindi and Thai Scripture is blocked until
  an approved translation is supplied.
- **Audio is unavailable until a speech provider is configured**: set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in
  `.env.local` (never committed) and restart; the key stays on the server. Tested against a mocked service only —
  no real speech has been produced. Fixture tones are development-only and can never count as listening.
- **Analysis is seed-lexicon only.** Every word of a supplied text is tokenized and tracked; lemma and gloss
  exist only for seed vocabulary or for analysis supplied with the text.
- **GoTell is rule-based** and states what it cannot check. No GoSpeak, no pronunciation scores, no
  ghostwritten testimonies.

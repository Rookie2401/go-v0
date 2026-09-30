# Go (V0) — missions-oriented language acquisition

Five courses: Honduras → Spanish, Albania → Albanian, Thailand → Thai, India → Hindi, Germany → German.

Three surfaces where the learner works — **Read** (Comprehensible Input Corpus), **Scripture** (Bible
Corpus), **My Testimony** — and three engines underneath them — **GoLearn** (learner state),
**GoListen** (audio + listening evidence), **GoTell** (constrained production). One shared model, one
event log, one learner state. See `docs/ARCHITECTURE.md`; package layout and rules in `docs/PLAN.md`.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5196
npm run gate       # tsc -b && vitest run
npm run build && npm run preview   # http://127.0.0.1:4196
```

## Layout

```
src/core        contract: model, ids, events, adapter/store/engine interfaces, memory store, bus, fixtures
src/adapters    es / sq / th / hi / de LanguageAdapter implementations + tiny lexicons
src/ingest      corpus document format, ingestion pipeline, bundled-corpus loader
src/golearn     learner state, encounters, evidence policy, support layers, coverage, readiness, recommendations
src/golisten    TTS provider abstraction, fixture provider, speech normalization, jobs, assets, manifests, alignment, player state machine
src/gotell      testimony drafts/revisions, error analysis, repair/recombination/expansion, provenance, production events
src/db          Dexie (IndexedDB) AppStore + asset store
src/ui, src/app React surfaces, shared reader, player, testimony editor, bootstrap
data/corpus     tiny test corpora (story, dialogue, 1 John 1:8–9 + John 3:16) per language — structural test data only
test/           per-package tests + test/integration (the end-to-end loop) — 582 tests in 47 files
```

## Honest status

- **Audio is a fixture.** `FixtureTtsProvider` emits real WAV files (tone bursts) so the whole pipeline —
  cache keys, jobs, validation, assets, manifests, sentence alignment, player — is exercised end to end,
  but it is not speech. A real provider is an adapter behind `TtsProvider`; keys come from the
  environment, never this repo. No voice has been QA-auditioned (`src/golisten/QA.md`).
- **No word timings are fabricated.** Sentence alignment is by construction; word/phrase alignment only
  appears when a provider returns marks (proved with a test-only provider).
- **GoTell is rule-based.** Suggestions come from adapter rules + GoLearn phrase recombination. An
  LLM-backed `SuggestionProvider` can be added behind the same constraint interface later.
- **Corpus is test data.** Stories/dialogues are owner-authored samples. Spanish Bible = Reina-Valera
  1909 and German = Luther 1912 (public domain). Albanian/Thai/Hindi Bible samples are flagged
  `rights: unverified` and must be replaced by licensed text before any release.
- **No GoSpeak.** Recording and replay only; no pronunciation scoring.

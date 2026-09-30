# Go — Architecture

A missions-oriented language-acquisition system for five courses (Honduras→Spanish, Albania→Albanian,
Thailand→Thai, India→Hindi, Germany→German).

## 1. Shape

```
              ┌────────────────────── learner-facing surfaces ──────────────────────┐
              │  Read (Comprehensible Input)  │  Scripture (Bible)  │  My Testimony  │
              │            └──── shared Reader ────┘                │   Editor       │
              └───────────────┬───────────────────────┬─────────────────┬───────────┘
                              │ events                │ events          │ events
              ┌───────────────▼───────────────────────▼─────────────────▼───────────┐
              │                         EventBus (append-only log)                    │
              └───────────────┬───────────────────────┬─────────────────┬───────────┘
              │   GoLearn     │      GoListen         │      GoTell     │
              │ learner state │ audio pipeline+player │ constrained     │
              │ coverage/rec. │ listening events      │ production      │
              └───────────────┴───────────────────────┴─────────────────┘
                              AppStore (one shared model)  ·  LanguageAdapters
```

Surfaces are *places*; engines are *cross-cutting*. All three engines read and write the **same**
`AppStore` tables (`src/core/store.ts`) and communicate through **domain events** (`src/core/events.ts`).
No engine holds its own vocabulary or mastery model.

## 2. Retained architecture

There was no prior repository for this app. The stack and several patterns are reused from the user's
other reader apps (Слово, Biblia, ROMANCE — all at `C:\Users\CJWal\dev`): Vite + React 19 + TypeScript
strict, Dexie 4 for local-first IndexedDB persistence, Vitest with fake-indexeddb, hash routing with
relative base for static hosting, the tap-word support card, per-work bundles. Not reused: their
language-specific tokenizers (Cyrillic/Hebrew/Arabic) — replaced by the adapter interface.

## 3. Shared model (`src/core/model.ts`)

Content: `ContentSource` (rights, authorship) → `Corpus` → `Text` (kind, version, tags, `generated`,
`contentVersion`, transformations) → `TextSection` → `Paragraph` → `Sentence` (canonical `text`,
derived `normalizedText`, `verseRefs`, `textHash`) → `Token` (surface + offsets + `normalized` + `formId`).

Linguistics: `Lemma`, `TokenAnalysis` (confidence, provenance machine/lexicon/human, `supersedes`,
`alternatives`), `Phrase` + `PhraseOccurrence`, `GrammarPattern` + `PatternOccurrence`, `EnglishRescue`.

Learner (GoLearn): `LearnerItemState` — one row per (user, item) with four `DimensionState`s
(reading / listening / writing / speaking), each with level, confidence, evidence, assisted/unassisted
counts; `Encounter` — one per (user, item, sentence, modality, session).

Audio (GoListen): `VoiceConfig` (requested vs actual locale), `AudioAsset` (content-addressed,
generation metadata, validation), `AudioSegment` (display text vs speech text, `assetId` absent until a
valid asset exists), `AudioAlignment` (method + confidence), `AudioManifest`, `AudioJob`,
`PronunciationEntry`, `UserRecording`.

Production (GoTell): `Testimony`, `TestimonyRevision` (never overwritten), `TestimonySentence`
(optional semantic section tag), `GoTellSuggestion` (kind repair/recombination/expansion, familiar
provenance refs, new items, `meaningChange`).

### Stable ids (`src/core/ids.ts`)
`form:<lang>:<normalized>`, `lemma:<lang>:<lemma>[:<POS>]`, `phrase:<lang>:<tok_tok_…>`,
`pattern:<lang>:<key>`; sentence `text:<lang>:<slug>/s<n>`, token `…/s<n>/t<m>`; learner item
`<userId>|<itemId>`. The word in Story 17 and in John 3 therefore share `formId`/`lemmaId` and one
`LearnerItemState`, while each occurrence is a distinct `Token` and distinct `Encounter`.

## 4. Language adapters (`src/core/adapters.ts`, impls in `src/adapters/`)

`LanguageAdapter` = sentence segmentation, tokenization (never `split(' ')`), normalization,
analysis (candidates with confidence), phrase & pattern detection, pronunciation support, speech
normalization (versioned, deterministic, never transliterates), display conventions, production checks
(GoTell), and `relate()` for inflection/compound relations.

- **es**: NFC+lowercase, accent-preserving forms, clitic splitting noted in analysis, small lexicon with
  conjugation paradigms for the fixture verbs.
- **de**: case/gender features, separable-prefix detection across the sentence, compound components in
  `notes.components` (whole-word identity kept as the form).
- **sq**: definiteness (`Definite=Def/Ind`), case, clitic pronouns.
- **hi**: NFC (nukta/chandrabindu preserved), Devanagari-aware tokenization (`Intl.Segmenter('hi')` —
  combining marks stay inside tokens), oblique forms, postpositions tagged ADP, compound verbs as phrases.
- **th**: `Intl.Segmenter('th', word)` dictionary segmentation; sentence breaks on space/`ฯ`/newline
  heuristics; classifiers tagged CLF; particles PART; tone class notes in pronunciation support.

Uncertainty rule: when the adapter cannot analyze, `candidates` is empty or low-confidence with
alternatives. GoLearn shows "uncertain" instead of a guess.

## 5. Ingestion (`src/ingest/`)

`data/corpus/<lang>/*.json` → `ingestText(store, adapters, doc)`: validates provenance, stores the
source, splits sentences with the adapter, tokenizes, analyzes (machine rows with analyzer version),
detects phrases/patterns, stores English rescue, records a `TransformationRecord`. Re-ingesting a
changed text bumps `contentVersion` (GoListen cache keys include it). Scripture docs carry verse
markers *as metadata* (`verseRefs`) — the sentence `text` never contains a verse number and is never
simplified.

## 6. Surfaces and the shared reader (`src/ui/`)

One `Reader` component serves Read and Scripture. Target text is primary; support opens on tap in
layers: gloss → phrase → morphology/grammar (+ prior encounters) → sentence explanation → English
rescue. Scripture mode: verse markers rendered as small non-text labels, English hidden by default with
per-sentence / per-verse / parallel reveal, never a simplified text. The reader emits `SentenceViewed`
once per sentence per session (IntersectionObserver + dwell), `TokenHelpOpened` with the assistance
level, `EnglishRescueRevealed` with scope. Navigation: Home · Read · Scripture · My Testimony · Settings.

## 7. Engine contracts (`src/core/contracts/`)

- `GoLearn` (`golearn.ts`): `handle(event)`, `rebuild(user)`, `queryItem(s)`, `listKnown`,
  `resolveAnalysis`/`overrideAnalysis`, `sentenceSupport`/`tokenSupport`, `coverage`,
  `scriptureReadiness`, `recommend`; `EvidencePolicy` centralizes assistance discounts.
- `GoListen` (`golisten.ts`): `TtsProvider` abstraction, `resolveVoice`, `ensureAudio` (idempotent,
  cache-keyed), `ensureSentenceAudio` (testimony), `runJobs`, manifests/segments/assets/alignments,
  `diagnostics`; `PlayerState` for the UI player.
- `GoTell` (`gotell.ts`): testimony + revisions, `submitDraft` → `ProductionAnalysis`,
  accept/reject/edit suggestion, `acceptRevision` (classifies independent / self-repaired / assisted /
  copied and emits `ProductionRecorded`), `intent`, `SuggestionProvider` plug-in.

## 8. Evidence rules (implemented in GoLearn's `EvidencePolicy`)

- Reading weight decreases with assistance level (none 1.0 → English rescue 0.15); never negative,
  never a penalty — help is evidence about the learner model, not a grade.
- Listening weight depends on speed, replays and reveals; a listening completion updates only the
  listening dimension. Playing audio never promotes reading.
- Production: independent 1.0 > self-repaired 0.8 > assisted 0.4 > copied 0.2; writes only to
  writing/speaking. Accepting a suggestion is `assisted`, inserting a provided expression is `copied`.
- Manual marks are stored separately and only cap/floor the displayed level.

## 9. Architectural decisions (ADRs)

1. **Local-first PWA, one AppStore** — same as the sibling apps; sync later via event ids/revision ids.
2. **Events are the only write path to learner state** — derived state is rebuildable from the log.
3. **Audio assets live in a content-addressed AssetStore** (IndexedDB object store in the browser, memory
   in tests), referenced by id from DB rows — not blob columns on records.
4. **Fixture TTS provider ships first.** It produces a real, decodable WAV whose duration is derived
   from the speech text and whose metadata is labelled `providerId: "fixture"`. It is explicitly *not
   speech*; the UI badges it. A real provider (Azure / Google / ElevenLabs) is an adapter behind the same
   interface, with keys supplied by the user's environment — this repo handles no secrets.
5. **No fabricated word timings.** Sentence alignment is by construction; word/phrase alignment only
   from provider marks or a forced aligner, with method + confidence recorded.
6. **Rule-based GoTell first; LLM behind `SuggestionProvider` later**, constrained by the same
   `ItemKnowledge` inputs.
7. **Bible text is canonical and unchanged**; version and rights recorded on Text/ContentSource. Sample
   scripture in `data/corpus` that is not confirmed public domain is flagged `rights: "unverified"` and
   must be replaced before any release.
8. **No GoSpeak.** Recording + replay only; no pronunciation scores.

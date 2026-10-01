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

## 10. Integration decisions (added after the packages landed)

9. **A testimony revision is a private Text.** `GoTell.acceptRevision` ingests the accepted sentences
   through the normal pipeline (`kind: 'testimony'`, corpus kind `testimony`, rights `user-private`,
   authorship `learner`) and sets `TestimonyRevision.textId`. Consequences: GoListen makes its audio with
   the ordinary `ensureAudio(textId)` (manifest, sentence alignment, player), listening/shadowing events
   carry real sentence ids so GoLearn folds them into the *listening* dimension only, and the Library,
   Scripture list, recommendations and preparatory-text search all exclude `kind === 'testimony'`.
   Ownership is enforced by `GoTell.forUser(userId)` / `assertOwner` on every accessor.
10. **AI-drafted sample stories are `generated`.** The stories and dialogues in `data/corpus` were
    drafted by an AI assistant for the course authors and have not been native-reviewed, so they carry
    `authorship: 'generated'`, `generated: true` and the tag `needs-native-review`; the reader badges
    them. Scripture is never generated. Flip the flags only after a human review.
11. **Thai drafts are one sentence per line.** Thai uses a space both between clauses and between
    sentences; the adapter splits sentences only on newline / double space / terminal punctuation, so the
    testimony editor treats a line break as the sentence boundary for Thai.
12. **Form vs lemma evidence is real.** Albanian `mëkat` / `mëkatin` are distinct forms of one lemma; the
    integration test tracks productive evidence at the lemma level for step 7 precisely because the
    form-level record legitimately does not move.

## 11. The proven loop (`test/integration/loop.test.ts`)

For each of es / sq / th / hi / de against the real adapters and bundled corpora: read the story (tap two
words) → GoListen sentence audio, replay ×3 with transcript → listening evidence only → Scripture
readiness shows story items as familiar, Bible text byte-identical, English hidden until asked →
testimony draft analysed against learner state, accepted repair = `assisted`, own wording =
`independent`, scored differently → revision becomes personal audio, shadowing strengthens listening,
never speaking → later independent use raises lemma-level productive evidence → `rebuild()` reproduces
the state from the event log → another learner cannot read the testimony. Plus the scripture loop:
readiness → preparatory texts (never scripture, never testimony) → read them → coverage rises → Bible
unchanged.

## 12. Readiness round (contract v2, October 2026)

The full brief is `docs/PLAN2.md`; the outcome and what still needs outside input is `docs/READINESS.md`.

13. **Exposure is not comprehension (evidence policy `evidence@2`).** `Encounter.evidenceKind` is one of
    `exposure | assisted | demonstrated | production`. Viewing, completing or playing only increments
    `DimensionState.exposures`. Recognition needs `ComprehensionReported` (degree `all`, no help in that
    sitting), an explicit mark, or production. `estimatedFamiliar` is a labelled estimate from repeated
    help-free exposure and is never treated as known. Coverage reports shown / estimated / met / new, and
    reading completion is reported separately (`readingProgress`).
14. **Only reviewed real speech can be listening evidence.** `AudioAsset.isSpeech` and
    `VoiceConfig.reviewStatus` gate eligibility; fixture tones are confined to development preview; legacy
    events are resolved segment → asset and excluded. `auditEvidence` lists what was excluded; `ensureCurrent`
    rebuilds derived state when the stored policy version differs. The log is never edited.
15. **Stable sentence identity.** `Sentence.key` is the author's id or a hash of the exact text, so an edit
    creates a new sentence and retires the old one (`retiredInVersion`) instead of shifting ids. Encounters,
    human corrections and audio for unchanged sentences survive a content version bump.
16. **Exact text, explicit normalization.** The importer stores `Sentence.text` and `Paragraph.originalText`
    exactly as supplied; all matching goes through `normalizedText` / `Token.normalized`.
17. **Publication gate.** `Text.published` is computed at import: a named review plus established rights, and
    for Scripture also translation identity, edition and a `SourceVerification`. Unpublished content is
    reachable only in the explicitly bannered preview mode and is never recommended.
18. **Scripture is verified, not recalled.** `scripts/verify-scripture.mjs` compares bundled wording with a
    published source byte for byte and writes `data/verified/scripture.json`. The first run found the
    model-recalled Spanish sample wrong in all three verses.
19. **Drafts are not versions and not evidence.** `TestimonyDraft` (one per learner + language, monotonic
    `seq`, conflict on stale writes) is autosaved; `TestimonyRevision` stays immutable and explicit. Production
    evidence is recorded once per item + sentence, ever, and never by checking.
20. **Honest assistance.** Suggestions carry `scope`, `remainingIssues`, `checkerCoverage` and real `sources`;
    meaning help is built only from the stated meaning and encountered sentences, and is refused when
    unsupported.
21. **Speech is a replaceable provider and may be absent.** With no usable real provider the audio state is
    `unavailable` and text learning continues. `AzureSpeechProvider` exists behind `TtsProvider`, tested
    against a mocked service only.
22. **Backup is source of truth only.** `src/backup` exports events, testimonies, versions, drafts and
    (optionally) recordings; derived state is rebuilt after restore (`docs/STORAGE.md`).

## 13. Round 3 (supplied-text readiness, October 2026)

Brief: `docs/PLAN3.md`. Status of record: `docs/READINESS.md`.

23. **Five reading notions, never merged**: displayed/previewed (`TextViewed`, counts nothing), reading exposure
    (`SentenceViewed` after a length-proportional dwell in a visible, focused reader with no preparation panel
    open — shown as "Seen"), explicit completion (`TextCompleted` only), reported understanding
    (`ComprehensionReported` 'all' without help), estimated familiarity (labelled estimate on items).
24. **Sittings come from time, not from the UI.** GoLearn derives `Encounter.sitting` from a 30-minute gap and
    keeps one exposure per item + sentence per sitting whatever session id arrived; the UI also keeps a
    sitting-stable session id. Policy `evidence@3`; existing state is rebuilt from the log.
25. **Evidence is pinned to the version read** (`contentVersion` on events and encounters).
26. **Review is a recorded act, separate from text.** `applyReview` / `npm run corpus:review` write only the
    `review` block; publication follows from the gate. Version bumps are logged and exposed by `contentHistory`.
27. **Speech credentials never reach the client.** A same-origin Vite plugin (`server/speechProxy.ts`) holds
    `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` from `.env.local`; the browser talks to `/api/speech/*` through
    `ProxySpeechProvider`. The direct, key-in-the-browser adapter remains only as an advanced fallback for
    static hosting. Unconfigured ⇒ an honest unavailable state naming the two variables.

## 14. Round 4 (consistent progress, explainable familiarity, proven imports)

Brief and root causes: `docs/PLAN4.md`. Status of record: `docs/READINESS.md`.

28. **One canonical progress record.** `ReadingProgress` is scoped to learner, language, text and content version;
    it separates this version's exposure and reports from `earlierVersions` (kept, reported, never counted) and
    this version's completion from `finishedEarlierVersion`. Home, the library and the reader render it through
    one hook and one component; no surface computes or formats progress itself.
29. **Reads wait for folds.** Every GoLearn read runs after the fold queue (and after emits still in flight);
    `settled()` is the UI's signal to re-read. Same evidence gives the same numbers on every read, mid-fold and
    after a rebuild.
30. **Help has a scope (`evidence@4`).** Help with an item vetoes that item's estimate; English or an explanation
    for a sentence marks that encounter as read with help, without vetoing estimates earned elsewhere and
    without touching other sentences or sittings.
31. **A review covers specific wording.** `review.contentSignature` binds a review to the sentence texts it
    reviewed; a revised text is held until reviewed again. Scripture is bound by its verification record.
32. **Import behaviour is proven, not asserted.** `npm run corpus:prove` runs labelled synthetic files through the
    real importer and generates `docs/import/PROOF.md`.
33. **Sandbox database.** `?sandbox=<name>` opens a separate, bannered database with namespaced local storage for
    acceptance and import tests, so nothing synthetic reaches the normal library.

## 15. The Thai course (reading ladder, contract v5)

Design: `docs/THAI_COURSE.md`. Briefs: `docs/PLAN5.md`. Status: `docs/READINESS.md`.

34. **A ladder is data.** Course → Stage → Work → Chapter (a `Text` with `workId` + `chapter`). Stages and works live
    in `src/course/<course>.ts`, are installed into the store by `CourseCatalog.install` (at startup, on a course
    switch and when a team is first chosen), and a course without a ladder is untouched.
35. **Rights are recorded, never assumed.** Every work carries `WorkRights`; nothing is bundled or marked public
    domain without a stated basis and a person's verification, which `install` then preserves.
36. **Personal copies.** `source.rights: "personal-copy"` + `authorship: "published"` makes a learner-supplied
    published work readable on that device without a review, labelled, and never bundled (the converter refuses
    to write under `data/corpus/`). Scripture and generated text can never be personal copies.
37. **Assistance is a stage property.** `AssistanceProfile` (layers and their order, how close English is,
    romanization, chrome) is data on the stage; the reader asks the catalogue. `DEFAULT_ASSISTANCE` reproduces
    the pre-ladder reader exactly. English rescue is in every profile.
38. **Script decoding is computed, not stored.** `decodeFor` takes an author-supplied decoding, else the
    dictionary pronunciation kept in the analysis notes, else the spelling rules. The rule engine never returns a
    confident answer where the spelling does not settle the reading.
39. **Writing-system items.** `orth` items are folded by the same evidence policy as words and never enter word
    coverage, vocabulary, recommendations or word estimates. Decoding is help with the written form
    (`DecodingRevealed`); the romanization rescue is recorded.
40. **A dictionary is a source, not an analysis.** `LexiconSource` fills only words the adapter cannot analyse,
    at a confidence below certainty, with the other senses kept; author spans and human corrections win. It is
    built offline (`npm run dict:build`) from a licensed file and is absent until then.
41. **Forecast, pace and readiness are advice.** `predictDifficulty` never gates reading and states its limits;
    `readingPace` is a quiet measure; `stageReadiness` combines several signals with provisional thresholds
    (`READINESS` in `src/golearn/policy.ts`) and finishing texts never suffices.
42. **Scripture is a parallel corpus.** Outside the ladder, on the same learner model, with the profile of the
    stage the learner works at.

## 16. Thai substrate validation (contract v6)

Briefs: `docs/PLAN6.md`. Results: `docs/READINESS.md`, `docs/thai/DICTIONARY_REPORT.md`, `docs/thai/BENCHMARKS.md`.

43. **Every analysis has an origin.** `TokenAnalysis.origin` (`rule` · `hand` · `dictionary` · `corpus` · `reviewed`)
    and `sourceId`; an adapter names its own sources and their review state (`LanguageAdapter.sources`). The reader
    shows a provenance line only for adapters that declare sources, so the other courses are unchanged.
44. **A dictionary is a separate layer, asked at display time.** Its entries are never copied onto token
    occurrences (measured: that doubled stored analysis); a hand-analysed word carries only a marker and, when the
    adapter has none of its own, the pronunciation the learner model needs. Senses, pronunciations and their labels
    are kept as imported; the manifest records source URL, date, checksum and licence.
45. **Disagreements are records, not decisions.** `SourceDisagreement` rows are generated (`npm run dict:compare`)
    and stay open until a named person writes a resolution; nothing is chosen silently.
46. **A reading names its source.** `SyllableAnalysis.source` / `sourceId`, and `ruleTone` keeps the rules' own
    confident answer beside a dictionary reading that differs.
47. **Measured conservatism.** The tone engine is tuned on one half of the dictionary's words and judged on the
    other (`npm run tones:eval -- --split dev|test`); confidence is capped wherever the spelling does not settle
    the reading.
48. **Segmentation is a release gate with its own instruments.** Gold formats, boundary metrics with every error
    retained, pluggable systems (including an external tokenizer's output), a derived rights-safe set, and the
    tooling for a manually checked, held-out course gold set (`src/bench`, never part of the app bundle).
49. **A technical fixture is not Scripture.** `scripture.role: 'technical-fixture'` can never be published.

## 17. Audit round and scope change (2026-10-01)

Briefs: `docs/PLAN7.md`, `docs/PLAN8.md`. Results: `docs/READINESS.md`.

50. **A whole-text report belongs to a content version.** Like a completion, a whole-text comprehension report is
    current only for the version it was made about; an earlier one is history (`reportedEarlierVersion`). Recommendations
    and readiness read the canonical record, never the raw log.
51. **A retired sentence keeps all of its evidence-bearing rows** (tokens, analyses, phrase and pattern occurrences),
    so a rebuild after a revision is identical; learner-facing reads consider live sentences only.
52. **Source and certainty are different properties.** A reading's provenance is rendered from its recorded source,
    its certainty from its confidence; a disagreement between sources is shown, never settled by the display.
53. **One coverage basis.** The coverage figure and the low-coverage warning are computed from the same final
    analysis (word list, dictionary, supplied spans, corrections); a validation-only diagnostic names its scope.
54. **Playback is not speech.** `ProviderAvailability.realSpeech` is separate from `available`.
55. **Product scope is a flag, not a deletion.** `FEATURES.listen = false` defers GoListen to V2: no provider, no
    request, no audio interface, no statement about listening, no data removed; the dormant package stays tested.

# PLAN — packages, ownership, rules

Read `docs/ARCHITECTURE.md` and everything under `src/core/` first. `src/core/**` is the contract and is
**owned by the coordinator** — do not edit it; if you need a change, leave a `TODO(contract): …` comment
in your own file and describe it in your final report.

## Rules for every package
- Own only the paths listed for you. Never edit another package's paths.
- Code against the contract (`src/core`) for anything another package provides. Use
  `createMemoryStore()`, `StoreEventBus`, `buildFixtureText()` and `seedBasics()` from `src/core` in tests.
- Tests: `test/<package>/*.test.ts`; run only your own with `npx vitest run test/<package>` — never the
  whole suite while others are mid-flight. Typecheck with `npx tsc -p tsconfig.app.json --noEmit`
  and fix errors in your own files only.
- No new npm dependencies unless listed here. No secrets, no network calls at test time.
- Never tokenize with `split(' ')`. Never fabricate timings, confidences or provenance.
- Leave `TODO(integration): …` notes where you had to assume a sibling package's behaviour.
- Final report: what you built, exports (names + signatures), test count, open TODOs. Keep it short.

## Packages

### A — Language adapters + test corpora + ingestion  (`model: sonnet`)
Owns: `src/adapters/**`, `src/ingest/**`, `data/corpus/**`, `test/adapters/**`, `test/ingest/**`.
- `src/adapters/index.ts` exports `createAdapterRegistry(): AdapterRegistry` and the five adapters
  (`es`, `sq`, `th`, `hi`, `de`) implementing `LanguageAdapter` (`src/core/adapters.ts`), plus
  `src/adapters/shared.ts` (Intl.Segmenter helpers, NFC, offset-preserving tokenization, punctuation).
- Thai: `Intl.Segmenter('th', {granularity:'word'})`; sentence segmentation by space/newline/`ฯ`/quotes
  heuristics; tag classifiers (`ตัว คน อัน เล่ม …`) `CLF`, final particles (`ครับ ค่ะ นะ`) `PART`.
  Hindi: `Intl.Segmenter('hi')` word segmentation, NFC, keep matras/nukta/virama inside tokens, tag
  postpositions (`का के की को में से ने पर`) `ADP`, detect compound verbs (`कर लिया`, `हो गया`) as phrases,
  oblique forms in morph. German: case/gender for articles + lexicon nouns, separable prefixes
  (`fing … an` → lemma `anfangen`, `notes.separable`), compounds (`notes.components`), strong/weak.
  Spanish: conjugation lexicon for fixture verbs, clitics (`entenderlo` → `entender` + `lo` in notes),
  gender/number. Albanian: definiteness (`libri` vs `libër`), case, clitics (`e`, `i`, `më`).
- Each adapter ships a **tiny lexicon** (only what the test corpora need, ~40–80 entries) with glosses.
  Unknown words ⇒ empty `candidates` (uncertainty, not guessing).
- `speechNormalize`: strip verse markers like `[16]` / `¹⁶`, expand digits to words for the language
  (small ranges suffice), never transliterate; return the `TransformationRecord`s; `normalizerVersion`.
- `checkProduction`: a few real rules per language (es: gender/number agreement between det+noun,
  `yo` + 3sg verb; de: article case after `mit/zu` etc., verb-second; sq: definiteness after preposition;
  hi: `ने` + perfective, gender agreement adj–noun; th: missing classifier after number, particle order).
  Each returns `ErrorCandidate` with confidence; conservative.
- `data/corpus/<lang>/`: per language **three JSON docs** in the format defined by
  `src/ingest/format.ts` (you define it; include source/rights/authorship/version/tags/verseRefs):
  1. `story-01.json` — a highly repetitive beginner mini-story, 8–12 sentences, containing the concepts
     *sin, forgive, understand, heart, believe, "when I was young", "I began to understand", "believe in"*.
     English rescue per sentence. `rights: owner-authored`, `authorship: human` (you are writing it for
     the course authors — say so in `sourceNote`).
  2. `dialogue-01.json` — a 6–8 line daily-life/mission dialogue reusing story vocabulary.
  3. `bible-1john-1.json` — 1 John 1:8–9 (and John 3:16 as a second section) in the target language.
     Spanish: Reina-Valera 1909 (public-domain) ; German: Luther 1912 (public-domain). For sq/th/hi use
     the wording you are confident is a real published rendering but set `rights: "unverified"`,
     `version: "unverified sample"` and a `sourceNote` saying it must be replaced by a licensed text
     before release. Verse numbers are metadata (`verseRefs`), never inside sentence text. English
     rescue from the World English Bible (public domain).
- `src/ingest/index.ts`: `ingestDocument(store, registry, doc): Promise<Text>` (validates, stores source,
  segments, tokenizes, analyzes, phrases/patterns, rescues, transformation log; re-ingest bumps
  `contentVersion` only when sentence text changed) and `ingestAll(store, registry, docs)`; also
  `loadBundledCorpus(): CorpusDocument[]` importing the JSON files (static `import.meta.glob` is fine).
- Tests: Thai has no spaces yet yields ≥ 4 word tokens for `พระเจ้าทรงรักโลก`; Hindi tokens keep
  combining marks (`किया` is one token); German `anfangen` detected across `fing … an`; Spanish clitic;
  Albanian definiteness; offsets round-trip (`sentence.text.slice(start,end) === surface`) for all five
  languages; ingest of every bundled doc succeeds and the same form appearing in story and Bible gets the
  same `formId`; speechNormalize removes verse markers and is deterministic; scripture text unchanged.

### B — GoLearn  (`model: sonnet`)
Owns: `src/golearn/**`, `test/golearn/**`.
- `src/golearn/index.ts` exports `createGoLearn(deps: { store: AppStore; bus: EventBus; adapters: AdapterRegistry; policy?: EvidencePolicy; clock?: () => string }): GoLearn` and `defaultPolicy: EvidencePolicy`.
- Implement everything in `src/core/contracts/golearn.ts`. Key behaviours:
  - `SentenceViewed` ⇒ one `Encounter` per word token's **form** and per resolved **lemma** and per
    phrase/pattern occurrence (emit `PhraseEncountered`), deduped by `ids.encounter(...)`. Assistance for
    that sentence = max assistance level of `TokenHelpOpened`/`EnglishRescueRevealed`/… events for the
    same sentence in the same session **before or shortly after** (simplest: keep a per-session map;
    when a help event arrives after the view, re-weight the existing encounter downward, never create a
    second one).
  - Listening events (`AudioSegmentCompleted`) ⇒ encounters with `modality: 'listening'` for the
    segment's sentences; update only `listening`.
  - `ProductionRecorded` ⇒ writing/speaking dimension only, weight by kind via policy.
  - `ItemMarked` ⇒ `manualMark`.
  - Levels from `defaultPolicy.level` (document thresholds in code comments).
  - `queryItem` with `surface` resolves through `ids.form(lang, adapter.normalize(surface))` and, via the
    token→analysis→lemma tables, reports `exactFormSeen`/`relatedSeen` (use `adapter.relate`).
  - `coverage`: per word token, known if form or its lemma ≥ `recognized` in reading; partial if
    encountered; else unseen. Band thresholds: ≥0.95 comfortable, ≥0.88 productive-challenge,
    ≥0.75 difficult, else stretch (soft — document).
  - `scriptureReadiness`: uses `coverage` + lists; `prerequisites` ranked by token count in passage ×
    (1 − current evidence); `preparatoryTexts` = corpus texts (kind ≠ scripture, `generated` allowed but
    flagged) ranked by how many prerequisites they contain and by band.
  - `recommend`: simple scorer over the six reasons; never generates text.
  - `tokenSupport(level)` returns only what that level needs (gloss at 1; phrases at 2; analysis, lemma,
    morphology line, prior encounters, examples at ≥3). `sentenceSupport({withRescue})`.
  - `overrideAnalysis` adds a human row with `supersedes`; `rebuild(userId)` clears that user's
    encounters + learnerItems and replays `bus.history({userId})` through `handle`.
- Tests (use `buildFixtureText` with explicit tokens — include a Thai fixture with segmented tokens and
  a Hindi fixture; and the required scenarios): same lemma in story + scripture → one
  `LearnerItemState` with `textIds` of both; reading recognition does not change listening; assisted vs
  independent production yield different writing evidence; English rescue lowers weight but still
  increases evidence (never negative); rerendered `SentenceViewed` (same dedupeKey) counts once;
  `rebuild` reproduces identical state; coverage bands; override does not delete encounters.

### C — GoListen  (`model: sonnet`)
Owns: `src/golisten/**`, `test/golisten/**`.
- `src/golisten/index.ts` exports `createGoListen(deps: { store: AppStore; bus: EventBus; adapters: AdapterRegistry; clock?: () => string; softwareVersion?: string }): GoListen`, `FixtureTtsProvider`, `computeCacheKey(...)`, `validateWav(bytes): AudioValidation`, `encodeWav(...)`.
- `FixtureTtsProvider`: id `fixture`, produces a real PCM16 mono 22050 Hz WAV: for each word-like
  segment of the speech text a short low-amplitude tone burst + gap (so duration scales with text and
  `validateWav` has something to measure). **Does not** return `wordMarks` (it is not speech; returning
  marks would be fabrication). `actualLocale` = first preferred locale it "supports" (list a plausible
  voice per language, e.g. `es-419` for Spanish, marked `approved: false` until a human QA pass).
- Voice resolution: `voices` table; seed defaults from `COURSES.preferredLocales` on first use; record
  `requestedLocale` vs `actualLocale` from the provider.
- Pipeline in `pipeline.ts`: sentence selection → `adapter.speechNormalize` (pass `isScripture`) →
  pronunciation overrides (`pronunciations` table, exact match, mechanism `substitution` alters speech
  text only; `ssml-phoneme` only if provider capability) → cache key = hash of {textHash of display,
  speechText, lang, actualLocale, providerId, engine, voiceId, settings, normalizerVersion,
  lexiconVersion} → segment (status pending, no assetId) → job (id = cacheKey) → run: synthesize →
  `validateWav` → `assets.put` → `AudioAsset` (generation metadata, validation) → segment ready →
  alignment `by-construction` (whole segment = its sentence, confidence 1) → manifest.
- Jobs: `runJobs` with exponential backoff (`nextAttemptAt`), `maxAttempts` 4 then `dead`, log lines,
  retry never creates a second asset (content-addressed). A provider that throws is a test fixture
  (`FlakyProvider` wrapping fixture, fails N times).
- `ensureSentenceAudio` for testimony sentences: creates a synthetic text-less segment keyed on
  `contextId` (e.g. revision id + sentence index), `sentenceIds: []`, `textId: contextId`.
- Word/phrase alignment: only if `SynthesisResult.wordMarks` present → map char offsets to token ids
  through the sentence tokens (Thai included) with method `provider-marks`. Otherwise none. Provide
  `MarksTestProvider` in tests that returns marks to prove the mapping (labelled as test-only).
- Listening events: `src/golisten/events.ts` helper `listeningEmitter(bus, ctx)` with typed functions
  the player calls (`played`, `completed`, `replayed`, `transcriptRevealed`, `speedChanged`, …) that
  fill dedupeKeys correctly (completion dedupe per segment per pass).
- Player logic (no DOM): `src/golisten/player.ts` — a pure state machine over a manifest (next/prev/
  seek/replay/loop/speed clamp 0.7–1.25/transcript modes/prefetch window) that the UI wraps around
  `HTMLAudioElement` with `preservesPitch = true`. Tests for the state machine.
- `diagnostics()`, `jobs()`. QA doc: `src/golisten/QA.md` — the representative QA set per language (prose,
  question, dialogue, Bible, names, numbers, punctuation, long sentence, phonological challenges) and an
  honest table of what is verified (fixture only) vs unverified (every real voice).
- Tests across five languages with fixture texts: idempotency (second `ensureAudio` reuses all), a text
  edit invalidates only the changed sentence's segment, scripture verse markers not spoken (speech text
  lacks digits), Thai segment maps marks to segmented tokens, validation rejects silent/empty WAV,
  flaky provider retries then succeeds without duplicate assets, dead after max attempts, segment never
  `ready` without asset, testimony sentence audio, player state machine, events carry speed/transcript.

### D — GoTell  (`model: sonnet`)
Owns: `src/gotell/**`, `test/gotell/**`.
- `src/gotell/index.ts` exports `createGoTell(deps: { store: AppStore; bus: EventBus; adapters: AdapterRegistry; golearn: GoLearn; golisten?: GoListen; providers?: SuggestionProvider[]; clock?: () => string }): GoTell` and `RuleBasedSuggestionProvider`.
- `analyzeProduction`: split with adapter, tokenize, analyze; `queryItems` on GoLearn for every word
  form (+ lemma) and for every phrase candidate; `adapter.checkProduction` → errors; semantic section
  tagging by a small per-language keyword table (metadata only, confidence recorded).
- Suggestion generation (rule-based provider):
  - **repair**: from `ErrorCandidate.suggestion` where all items in the replacement are ≥ encountered
    for this learner (or are function words) → `kind: 'repair'`.
  - **recombination**: if the sentence contains items that are also in a known phrase pattern
    (`listKnown` phrases, reading ≥ recognized) with a slot and the learner's words fit the slot, propose
    the phrase form → `kind: 'recombination'`, `familiar` filled from `ItemKnowledge`.
  - **expansion**: only when a suggestion needs items the learner has never encountered → `newItems`
    filled, `kind: 'expansion'`, explanation says it is new language.
  - Cap: max 3 suggestions per sentence, 6 per draft, priority order meaning > intelligibility >
    reusable construction > recurrent. `meaningChange` set when a replacement changes a
    theological/personal key term (per-language table: know/believe/trust/repent/regret/guilt/
    conviction/salvation/forgiveness/grace) — never silently swap those.
  - Never add content: a suggestion may only reorder/inflect/replace tokens the learner wrote or slot
    them into a known phrase; it must not introduce nouns/verbs about events, feelings, dates.
- `acceptRevision`: classify per item (independent / self-repaired / assisted / copied — see contract),
  emit `ProductionRecorded` (+ `IndependentProductionDetected`), store revision with `sentences` and
  hashes; if `golisten` present call `ensureSentenceAudio` for each sentence (runNow false).
- `intent`: keyword-level English→concept mapping through the same per-language concept table, then
  choose the wording from the learner's known items; unavoidable new items listed with `whyNeeded`.
  It is fine for this to be simple; it must be constrained and honest.
- Privacy: `assertOwner` on every accessor; tests prove user B cannot read user A's testimony.
- Tests (fixtures via `buildFixtureText`, learner histories via bus events): **the acceptance test** —
  Learner A (beginner: only story vocabulary) vs Learner B (has encountered conviction/guilt/forgiveness/
  repentance items in a fixture scripture text) write the same rough sentence; A's suggestions contain
  no unencountered theological items (or mark them `expansion`), B's recombine the known phrase; the
  suggested strings differ. Also: repair-only for a known-word agreement error; accepted suggestion →
  `assisted` event, learner-typed phrase → `independent`; revision history never overwritten;
  `diffRevisions`; meaning-change flag; Thai draft tokenized without spaces; Hindi agreement rule.

### E — UI + persistence  (`model: sonnet`)
Owns: `src/ui/**`, `src/app/**`, `src/main.tsx`, `src/index.css`, `src/db/**`, `test/ui/**`, `test/db/**`, `public/**`.
- `src/db/dexie.ts`: `createDexieStore(name?): AppStore` implementing `Table` on Dexie 4, schema from
  `INDEXES`, `IndexedDbAssetStore` (blobs table, object URLs). Tests with `fake-indexeddb/auto`.
- `src/app/bootstrap.ts`: builds store (Dexie in browser, memory in tests), bus, adapters, engines by
  importing `createAdapterRegistry`, `createGoLearn`, `createGoListen`, `createGoTell`, `ingestAll`,
  `loadBundledCorpus` (code against the PLAN signatures; the coordinator will confirm real ones).
  Seeds languages/courses/user on first run, ingests the bundled corpus once (record a `meta` flag).
- Routes (HashRouter): `/` Home (recommendations via `golearn.recommend`, coverage of chosen texts),
  `/read` library (texts by corpus, tags as pathways, personalized band badge) + `/read/:textId` Reader,
  `/scripture` list + `/scripture/:textId` same Reader in scripture mode, `/testimony` editor,
  `/settings` (course/user switch, voice info, vocabulary list, diagnostics).
- `Reader`: canonical text primary; subtle configurable highlighting from `sentenceSupport.highlight`;
  tap word → card with layered expand (uses `tokenSupport(level)` and emits `TokenHelpOpened` with the
  level); phrase chips; sentence explanation; English rescue button per sentence and per verse; emits
  `SentenceViewed` once per sentence per session (IntersectionObserver ≥ 600 ms visible — in jsdom
  tests, fall back to a manual "mark read" path); `TextCompleted`. Scripture mode: verse labels as
  `<sup>` from `verseRefs`, English hidden by default, a "Prepare this passage" panel showing
  `scriptureReadiness` (prerequisites + preparatory texts), badge for `generated` texts.
- `Player`: wraps the GoListen player state machine around `HTMLAudioElement`
  (`preservesPitch = true`, `playbackRate` 0.7–1.25), sentence replay in one click/keypress (R), loop,
  seek by sentence/paragraph, transcript modes, prefetch next asset URL; keyboard + aria labels; shows
  provider/voice and a visible "fixture audio — not speech" badge when providerId is `fixture`.
- `Testimony`: empty target-language textarea first; "Check my writing" → `submitDraft` → suggestion
  cards (original / suggested / label "Correction" | "Uses language you know" | "New expression" /
  explanation / provenance "encountered N times in …" / accept / reject / edit); "Save this version" →
  `acceptRevision`; history list with diff view; per-sentence audio + whole-testimony playback +
  shadowing counter + recording (MediaRecorder if available, stored via GoListen assets). Optional
  "What are you trying to say?" field → `golearn`-constrained `intent`.
- Style: quiet reading environment (serif for Latin, Noto-style system stacks for Devanagari/Thai,
  generous line height), no clutter; CSS in `src/index.css` with a small token set.
- Tests (jsdom): reader emits one SentenceViewed per sentence; tap opens gloss and emits level-1
  help; rescue reveal emits `EnglishRescueRevealed`; testimony editor renders suggestions and calls
  accept; Dexie store round-trips every table and `where` on indexed fields.

## Integration (coordinator)
`test/integration/loop.test.ts` — the seven-step loop and the scripture loop across all five languages,
run against the real adapters + ingested bundled corpus; `scripts/probe-*.mts` real-data probes;
`npm run gate` = `tsc -b && vitest run`.

# PLAN 4 — consistent progress, explainable familiarity, proven imports

Rules for every package: `docs/PLAN2.md` ("Rules for every package"). Coordinator owns `src/core/**`, `docs/PLAN*.md`,
`docs/READINESS.md`, `test/integration/**`, `test/core/**`, `scripts/verify-scripture.mjs`, `scripts/probe-*.mts`,
`data/verified/**`. Evidence policy stays as in PLAN2/PLAN3 except where changed below.

## Root causes found (coordinator)

### A. "Seen 0 of 10 · Finished" (reader, library) vs "Seen 4 of 10 · Finished" (Home)
All three surfaces call the same `golearn.readingProgress(userId, textId)` and format it with the same function; for the
same stored events they return the same numbers (reproduced in the running app with a new learner: reader, library
and Home agreed at every step). The disagreement therefore comes from what the record did not say and from when each
surface read it:
1. **No explicit version scope.** Progress counted only the live sentences of the current content version and
   silently ignored exposure recorded against retired sentences (a revision, or the legacy index-id sentences of a
   database created before stable keys), while "Finished" carried over from any version. That is how a text can read
   "Seen 0 of 10 · Finished" with no explanation.
2. **Three independent snapshots.** Each surface fetched its own copy when it mounted. The reader re-read on a
   300 ms timer after events; the library and Home never re-read. A surface opened before a dwell completed showed
   fewer sentences than one opened after it.
3. **Finished and Seen are independent facts presented as if related.** Nothing explained that a learner may mark a
   text finished without each sentence having a recorded exposure.

### B. "likely familiar" 24 % → 46 % → 3 % when Parallel English is toggled
Reproduced with `scripts/probe-parallel-english.mts` on the real engines (same evidence throughout):
`likely familiar 40 % · met 40 %` before; `4 % · met 75 %` after ONE `EnglishRescueRevealed`; identical after a rebuild.
Story encounters are untouched; the 32 Scripture encounters of that sitting become `assisted:5`.
1. **Policy too blunt.** `estimatedFamiliar` required "no help in the last two encounters", and a whole-passage English
   reveal counts as help for every word of every sentence — so one toggle vetoed the estimate of words met help-free
   dozens of times. (This is the settled 3 %.)
2. **Reads not serialized with folds.** `coverage()` and friends read derived state without waiting for the fold
   queue, and the reader re-read on a blind 300 ms timer; with IndexedDB a fold of ~60 items outlasts that, so a
   half-applied state was displayed (the transient 46 %). Toggling English off emitted nothing; the next re-read
   simply showed the settled state.
No duplicate exposure was involved: the event log had exactly one English reveal and no new views.

## Decisions
- **One canonical progress record** (`ReadingProgress`, contract): scope `{userId, lang, textId, contentVersion}`;
  `sentencesSeen` / `sentencesUnderstood` over live sentences; `finishedAt` only for a completion of THIS version;
  `finishedEarlierVersion`; `earlierVersions {sentencesSeen, sentencesUnderstood}` for exposure against retired
  sentences (history kept, reported, never counted); `asOf`. `readingProgressMany` for lists.
- **Reads wait for folds**: `GoLearn.settled()`; every read method awaits the queue; the UI awaits `settled()` and
  re-reads on bus events through ONE shared hook used by Home, the library and the reader.
- **Policy `evidence@4`**: help has a scope. Item-targeted help (word, phrase, grammar: assistance 1–3) says the
  learner needed help with THAT item: it vetoes the estimate while it is among the item's last two encounters.
  Sentence-level help (explanation, English: 4–5) makes that encounter assisted (it can never demonstrate, and it is
  not a help-free exposure), but it does not veto an estimate earned elsewhere. Nothing is ever applied to
  encounters of other sentences or other sittings.
- **Synthetic material never reaches the normal library**: acceptance and import tests in the browser run in a
  sandbox database (`?sandbox=<name>`), visibly bannered.

## Packages (all `model: sonnet`)

### B4 — GoLearn (`src/golearn/**`, `test/golearn/**`)
- `settled()`; every read method (`coverage`, `scriptureReadiness`, `recommend`, `readingProgress(Many)`,
  `getItemState`, `queryItem(s)`, `listKnown`, `explainItem`, `sentenceSupport`, `tokenSupport`) awaits the fold queue
  before reading, without deadlocking a fold that itself reads (reads issued from inside a fold must not wait on
  the queue). A regression test with a deliberately slow store (delayed writes) proves a read issued right after an
  un-awaited emit returns the settled value, never an intermediate one, and equals the value after `rebuild`.
- Canonical `ReadingProgress` exactly as the contract says, plus `readingProgressMany` (one log read). Completion
  scope: `TextCompleted.contentVersion === text.contentVersion` ⇒ `finishedAt`; an event without a version counts as
  current only while `text.contentVersion === 1`; otherwise ⇒ `finishedEarlierVersion {version?, at}`.
  `earlierVersions` counts distinct retired sentences of that text with a `SentenceViewed` / an unassisted 'all'
  report. `asOf` = `at` of the latest event of that learner included.
- `evidence@4`: the estimate veto uses item-targeted help only (assistance 1–3 on that item among its last two
  reading encounters); sentence-level encounters (4–5) are neither help-free exposures nor vetoes. Document in
  `policy.ts`. `explainItem().summary` distinguishes "needed help with this word" from "read with the English shown".
  Coverage `explanation` and `asOf` updated; same evidence ⇒ byte-identical coverage on every call and after rebuild.
- Tests: the audited Scripture scenario (estimates from two story sittings; two of three verses seen; one
  parallel-English reveal ⇒ the passage's "likely familiar" is unchanged for words whose estimate came from the
  story, the two seen verses' encounters are assisted:5, story encounters byte-identical, the unseen verse
  untouched); toggling again / remount (a second reveal event) changes nothing; a word tapped in Scripture loses its
  estimate; progress scenarios: revision retiring 4 seen sentences ⇒ `sentencesSeen` drops by 4 and
  `earlierVersions.sentencesSeen === 4`; finished at v1 then revised ⇒ `finishedEarlierVersion`, no `finishedAt`;
  finish with zero seen ⇒ finished, seen 0; legacy index-id sentences retired by the importer ⇒ their views are
  `earlierVersions`; `readingProgressMany` equals per-text calls; rebuild identity under `evidence@4`.

### E4 — UI (`src/ui/**`, `src/app/**`, `src/main.tsx`, `src/index.css`, `test/ui/**`)
- ONE hook `useReadingProgress(textIds)` (and `useCoverage`) built on `golearn.readingProgressMany` + `golearn.settled()`,
  re-reading on bus events for that learner; ONE component renders the progress line. Home (Continue card and
  rows), the library and the reader all use them — no other code may format progress. Remove the 300 ms timer.
- Wording, identical on every surface: `Seen x of y sentences` · `Understood x of y (your report)` when reported ·
  `Finished` only for `finishedAt`; with `finishedEarlierVersion`: `Finished an earlier version — the text has
  changed since`; with `earlierVersions`: `n more seen in an earlier version`; and whenever finished with
  `sentencesSeen < sentencesTotal`, an explanation available on every surface (title/disclosure): "You marked this
  text finished. 'Seen' counts sentences that stayed on screen long enough in this version, so the two can differ."
- Parallel English: one `EnglishRescueRevealed` per sitting + text + scope (dedupe key from the sitting, not a
  component-lifetime ref); turning it off emits nothing; the coverage block shows the settled value only.
- Sandbox mode: `?sandbox=<name>` (letters, digits, dash) selects database `go-v0-sandbox-<name>` and namespaces
  every localStorage key; a persistent banner "Sandbox '<name>' — separate test data, not your library" with a link
  back to the normal app; never active without the parameter; survives in-app navigation and reload (keep the
  query parameter). Tests.
- Settings: the texts table and the vocabulary table live inside collapsed disclosures (or their own routes) with a
  count in the summary; learner, team, reading preferences and backup stay immediately visible.
- A cross-surface regression test: with one store and the real GoLearn, render Home, the library and the reader for
  the same learner/text in the audited states (partly seen + finished; finished with zero seen; revised after
  finishing; legacy-retired views) and assert the three progress strings are identical.

### A4 — Import proof (`src/ingest/**` only if a defect is found, `scripts/corpus-*.mts`, `test/ingest/**`, `docs/IMPORT.md`, `docs/import/**`, `data/synthetic/**`, package.json `corpus:*`)
- `data/synthetic/import-proof/` — clearly identified SYNTHETIC development files (ids prefixed `synthetic-`,
  `source.provenance` saying so, never placed under `data/corpus`, never loaded by `loadBundledCorpus`): a valid text;
  malformed JSON; a missing-required-fields text; two files with the same id; an unchanged re-import; a batch of one
  valid + one invalid file; invalid lexical spans (out of bounds, overlapping, splitting a grapheme); a broken
  translation alignment (raw paragraph with the wrong number of English lines); exactness cases (non-NFC text,
  NBSP, leading/trailing spaces, mixed punctuation, a Hindi danda, a Thai sentence without spaces); a revised
  version of the valid text; a review hold (unreviewed), a publication hold (rights unverified), unverified and
  generated "scripture" (placeholder wording clearly marked as NOT Scripture).
- `npm run corpus:prove` (`scripts/corpus-prove.mts`): runs every case through the real importer against an isolated
  in-memory store, with a learner who has encounters on the valid text before the revision, and prints an
  expected-vs-actual table: rejected with which codes; rows written (must be 0 for failed batches); duplicates after
  re-import (0); versions, retired/added sentences, encounters preserved with their version, analysis rows kept for
  unchanged sentences and written for new ones, audio staleness (through GoListen with the development fixture);
  byte-exact round trip of every stored sentence and paragraph; `published` false for every hold. Exit 1 on any
  mismatch. `--write` regenerates `docs/import/PROOF.md` from the actual run (never hand-written results).
- Fix any defect the proof exposes in `src/ingest` and add a regression test. Update `docs/IMPORT.md` to point at the
  proof and keep the numbered operating instructions accurate.

### C4 — Speech readiness check (`scripts/speech-check.mts`, `src/golisten/**` only if a defect is found, `test/golisten/**`, `test/server/**`, `docs/SPEECH.md`, package.json `speech:check`)
- `npm run speech:check`: (1) reports configuration without ever printing a key: configured / the precise
  requirement; (2) runs the provider-independent chain in-process — GoListen + `ProxySpeechProvider` → the real
  `handleSpeechRequest` handler → a mocked upstream — and prints a pass/fail table for: cache-key composition
  (text hash, voice configuration, provider version), requested vs delivered locale recorded, voice metadata and
  review status recorded, content-version invalidation (only the changed sentence regenerated; stale state
  visible), retry with backoff then success, dead after max attempts with the visible reason, partial generation
  visible and playable, unconfigured state visible, fixture / failed playback never evidence-eligible, real-speech
  playback = exposure only; (3) ONLY when both variables are configured: one real synthesis of one sentence of the
  verified Spanish Scripture sample through the proxy handler against the live service, validated with
  `validateWav`, reporting duration/sample rate/delivered locale — and stating that a human audition is still
  required. Without credentials it prints "REAL SPEECH: NOT VERIFIED — set AZURE_SPEECH_KEY and
  AZURE_SPEECH_REGION in .env.local" and exits 0 (the provider-independent checks decide the exit code).
- Tests for the script's check functions; `docs/SPEECH.md` documents the command and its output.

## Coordinator
Integration tests for the two reproduced defects on the real engines; the twelve-step loop re-run; browser flows
in a sandbox; final documentation and the readiness table (ingestion, progress tracking, analysis, Scripture, real
speech).

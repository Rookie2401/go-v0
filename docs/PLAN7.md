# PLAN7 — audit round: four defects, one wording issue, readiness claims

An external audit reproduced the green gate (2,722 tests, 162 import-proof checks, 12 speech checks) **and** four
defects and one wording issue. A green gate does not resolve them. Acceptance target: consistent versioned learner
reporting, truthful source and speech labels, matching import coverage diagnostics, accurately scoped Thai
readiness claims. **No new features, no corpus expansion, no redesign.** Preserve learner history, dictionary
attribution and the publication safeguards. Do not tune or hard-code against the held-out tone set. Do not
configure credentials.

Rules for every package: as in PLAN5 / PLAN6 ("Rules for every package"). `src/core/**`, `docs/PLAN7.md`,
`docs/READINESS.md`, `test/integration/**`, `package.json` are the coordinator's. Every fix needs regression tests
that fail before the fix. Report under 200 words: root cause as you found it in the code, the fix, files, tests.

## Root causes (established by the coordinator in the code)

1. **Whole-text comprehension survives a revision.** `src/golearn/progress.ts` keeps `log.textReport = { degree, at }`
   for the last `ComprehensionReported` with `scope: 'text'` and writes it to `reportedComprehension` without looking
   at `e.contentVersion`, although completions in the same function ARE version-scoped (`finishedAt` /
   `finishedEarlierVersion`). Two consumers inherit it: `recommend.ts` (the `reread` reason reads
   `rec.reportedComprehension`) and `readiness.ts` (the `reported-comprehension` signal takes the latest text-level
   report per text straight from the log, with no version check).
2. **Pronunciation source inferred from confidence.** `SyllableRow` in `src/ui/reader/TokenCard.tsx` prints "by the
   spelling rules; not checked against a dictionary" for ANY syllable with confidence in [0.6, 0.8) — including a
   dictionary-backed syllable whose confidence was capped at 0.7 because the IPA overrode the respelling. Source
   (`SyllableAnalysis.source`) and confidence are different properties; the row never reads `source`.
3. **Fixture reported as real speech.** `aggregateAvailability` (`src/golisten/providers.ts`) returns `{ available:
   true, reason: 'development-fixture' }` when only the fixture is usable in preview, and `SpeechSection.tsx` prints
   "Real speech is available." for any `available: true`.
4. **Two coverage bases.** `validateDocument` (`src/ingest/format.ts`) computes the `low-analysis-coverage` warning from
   the adapter's own lexicon only (it is dictionary-free by design), while the coverage figure shown beside it comes
   from the import plan, which includes the dictionary. Preview and result therefore show "Analysis coverage: 20%"
   next to "only 0% of the words can be analysed (0/5)".
5. **Wording.** `recommend.ts` says "the easiest published <language> text" for the first-text recommendation even
   when `includeUnpublished` (preview) selected an unpublished text.

## Contract changes already made

- `ReadingProgress.reportedComprehension` is now defined as the last whole-text report **of this content version**
  (a report without a version counts only while the text is at version 1); `reportedEarlierVersion?: { degree;
  version?; at }` carries a report about earlier wording as history.
- `ProviderAvailability.realSpeech?`, `realSpeechReason?`, `realSpeechDetail?` (GoListen.availability() only).

---

## E — versioned whole-text reports; recommendation wording

**Yours:** `src/golearn/**`, `test/golearn/**`.

1. `progress.ts`: keep every whole-text report with its `contentVersion`. `reportedComprehension` = the latest one
   whose version equals the text's current `contentVersion` (no version ⇒ counts only when the text is at version 1);
   `reportedEarlierVersion` = the latest one about another version (with its version when known). Nothing is deleted
   from the log. `sentencesUnderstood` keeps following sentence identity: an 'all' report credits the sentence ids it
   listed, and those that are still live stay understood after a partial revision; retired ones go to
   `earlierVersions` as today.
2. A content version changes only when the wording changes (the importer bumps it; a metadata-only re-import and an
   unchanged re-import do not): prove in tests that both leave `reportedComprehension` untouched.
3. `readiness.ts` `reported-comprehension`: count, per stage text, only the latest whole-text report of the text's
   CURRENT version (same rule); say in the explanation when reports about earlier versions were left out.
4. `recommend.ts`: `reread` uses the current-version report only (it already reads the record; confirm and test);
   check every other read of whole-text reports in `src/golearn` (`grep ComprehensionReported`, `scope === 'text'`).
5. Wording (finding 5): the first-text explanation must say what the text is: published → as today; an unpublished
   text reached only because `includeUnpublished` is on → "…is the easiest <language> text in preview (not
   published)". Check every other explanation string in `recommend.ts` for the same assumption. Add a test that with
   `includeUnpublished` off, no unpublished text ever appears in any recommendation (all reasons).
6. This changes derived answers, not stored state: no policy bump unless you change what is stored (say which).
7. Tests (on the real fold, memory store): full replacement (v1 report 'all' → every sentence replaced → current
   understood 0, `reportedComprehension` absent, `reportedEarlierVersion: { degree: 'all', version: 1 }`); partial
   revision (unchanged sentences stay understood, the whole-text report moves to earlier); unchanged re-import;
   metadata-only change; legacy report without a version at version 1 and at version 2; a new report at version 2
   becomes current while the v1 report stays as history; readiness and recommend consumers; rebuild equality.

## F1 — speech labels; progress wording for earlier-version reports

**Yours:** `src/golisten/providers.ts` and `src/golisten/status.ts` (only what this needs), `src/ui/pages/settings/**`,
`src/ui/coverage.tsx`, `src/ui/pages/Home.tsx`, `src/ui/pages/Library.tsx`, `src/ui/library.tsx`, their tests, and
`test/golisten/**` for the availability change.

1. `aggregateAvailability`: set `realSpeech: true` only when a real speech provider is usable. When only the fixture
   is usable (preview): `available: true, reason: 'development-fixture', realSpeech: false`, plus `realSpeechReason` /
   `realSpeechDetail` taken from the first real provider's own answer (or `no-provider`). When nothing is usable:
   `realSpeech: false` as well. Keep `available` semantics for the callers that mean "can anything play"
   (`Player.tsx` job runner, `status.ts`); check each caller and say in your report which meaning it needs.
2. `SpeechSection`: three distinct, truthful states — real speech available; placeholder playback available in
   preview and real speech unavailable (with the reason and the configuration guidance, which must stay accurate);
   nothing available. Never print "Real speech is available" unless `realSpeech === true`. The voice card and voice
   table keep their "not speech" / "placeholder sound" labels.
3. State changes: entering and leaving preview mode, switching the course, and "Check again" must each re-read
   availability and show the right state (test each). No credentials are configured anywhere in tests beyond the
   existing fakes.
4. Listening evidence is unchanged: confirm with the existing tests (fixture, unreviewed voice, failed playback never
   count) and add one test that a preview fixture session leaves `listenedSentences` at 0.
5. `ProgressLine` / `coverage.tsx` (the one component Home, the library and the reader share): `reportedComprehension`
   as today; when only `reportedEarlierVersion` exists, say "you said you understood <degree> of an earlier version"
   — never "you said you understood <degree>" for wording that has changed. Test the three surfaces render the same
   string for the same record (extend `progressConsistency.test.tsx`).

## F2 — the syllable row: source and certainty are separate

**Yours:** `src/ui/reader/**`, your reader tests.

1. In `SyllableRow` and `decodingSourceLine`, render provenance from `s.source` (never from confidence):
   `rule` → "by the spelling rules"; `exception-list` → "from the course's list of irregular words (machine-drafted)";
   `dictionary` → "from the dictionary's pronunciation" (+ the dictionary name when known); `author` → "supplied with
   this text"; absent source → say nothing about the source. A reviewed override, where the analysis has
   `origin: 'reviewed'` and supplies syllables, → "checked by <name>". Never imply human review otherwise.
2. Certainty is a separate, second statement from `confidence`: ≥ 0.8 nothing; 0.6–0.8 "less certain"; < 0.6
   "uncertain" (keep the chip). A dictionary syllable at 0.7 therefore reads "from the dictionary's pronunciation ·
   less certain" and never "by the spelling rules".
3. The word-level line: when all syllables share a source say it once at the top and not per syllable; when sources
   are mixed, label each syllable.
4. When `ruleTone` is present: show both readings with their labels — "Dictionary: <tone>. Spelling rules alone:
   <ruleTone>." — with no statement that either is correct and no wording that implies the difference is settled or
   reviewed. Several readings (`notes.readings`): keep the existing line.
5. Tests: a dictionary-backed syllable with confidence 0.7 (the audited case: the tone taken from the dictionary's IPA);
   a mixed-source word; several readings; rule-only decoding at 0.9, 0.7 and 0.5; exception-list; `ruleTone`; absent
   source. The old "by the spelling rules; not checked against a dictionary" string must no longer appear anywhere.

## D — one coverage basis

**Yours:** `src/ingest/**`, `scripts/corpus-*.mts`, `docs/IMPORT.md`, `test/ingest/**`.

1. The coverage figure and the low-coverage warning must come from the SAME final analysis: adapter lexicon +
   dictionary + spans supplied with the text + applicable corrections (a token with a human correction counts as
   analysed). Where a plan exists (`importDocuments`, `previewDocuments`, the CLIs that plan), drop validation's
   adapter-only `low-analysis-coverage` issue and add one computed from the plan's final coverage with the same
   threshold, whose message gives the breakdown — e.g. "only 20% of the words have an analysis (1 of 5): 0 from the
   language's word list, 1 from the dictionary kaikki-th@…, 0 supplied with the text" — and whose hint names the
   remedies that apply (spans, a correction, a dictionary when none is installed).
2. Where no plan exists (pure `validateDocument` / `validateBatch`, `corpus:validate` without a dictionary), the
   diagnostic may stay but must name its scope: "by the language's own word list alone (no dictionary consulted)".
3. Dictionary lookup failure: the text still imports (as today), coverage and warning both reflect the analysis
   actually stored, and the report says the dictionary could not be read.
4. `AnalysisCoverage` gains an optional breakdown (`bySource?: { adapter: number; dictionary: number; supplied:
   number; corrected: number }`) — it lives in `src/adapters/shared.ts`; add it there additively (you may edit that
   one type) or carry it beside the coverage in the plan; say which.
5. Atomic validation and publication holds are unchanged: a warning never blocks, an error always blocks the batch.
6. Tests: dictionary-only words (the audited 1-of-5 case: preview and result both say 20 % and the warning says
   20 %), mixed adapter + dictionary, supplied spans, corrections, no dictionary installed, lookup failure; the
   preview (`previewDocuments`) and the result (`importDocuments`) carry the same figure, counts and warning text;
   `npm run -s corpus:prove` stays at 0 mismatches (update the proof expectations only if a message string it pins
   has changed, and say so).

## H1 — the gold-set workflow, end to end

**Yours:** `src/bench/gold/**`, `src/bench/words/**`, `scripts/gold-*.mts`, `scripts/bench-words.mts`,
`test/bench/gold*.test.ts`, `test/bench/words*.test.ts`, `docs/thai/GOLD_WORKFLOW.md` (new), sections 1–3 of
`docs/thai/BENCHMARKS.md`. (`npm run gold:freeze` is being added to package.json by the coordinator.)

The gold set must come from human-corrected running prose. Nothing here may put a model's judgment into the gold
set as ground truth: a draft is a draft until a named person accepts it.

1. **Freeze**: `npm run gold:freeze -- --name <id> [--strata a,b] [--held-out-only]` writes
   `data/private/benchmarks/th/frozen/<id>.json`: the list of gold files with their sha256, sentence counts per
   stratum, who checked them (`checkedBy` names and dates), the tool versions, and a set hash. A frozen set is
   immutable: `bench:words -- --frozen <id>` verifies every hash first and refuses to run if a file changed; the
   report header names the frozen id and set hash. `gold:accept` refuses to write into a file that belongs to a
   frozen set (make a new file / a new freeze instead).
2. **Report**: `bench:words -- --frozen <id> --report <out.md>` writes a dated report (systems, per-stratum boundary
   P / R / F1, word P / R / F1, exact-match, the error file path, tool and ICU versions, the frozen id and hash) to a
   path under `data/private/benchmarks/th/reports/` by default — results on personal copies stay local unless the
   owner chooses to copy numbers into the docs.
3. **Units**: `gold:draft --kind units` / `gold:accept --kind units` for reading units, using H2's formats in
   `src/bench/units/gold.ts` (import them; do not edit that folder): a draft of the adapter's unit boundaries for
   sampled paragraphs, corrected by a person, accepted with `--by`, frozen in the same manifest.
4. **`docs/thai/GOLD_WORKFLOW.md`**: a numbered procedure a non-programmer can follow — (1) supply a lawful text
   (what counts, where it goes: `data/private/`, never committed); (2) draft (`gold:draft`, the eight strata, sample
   sizes toward 500–1,000 sentences, held-out flag); (3) correct the draft in a text editor (the `|` convention, the
   punctuation and compound conventions to decide once and write down, what to do with a doubtful case); (4) accept
   with your name (`gold:accept --by`); (5) freeze; (6) run and read the report; (7) how to add an external
   tokenizer's output (PyThaiNLP: the two commands; Python is NOT installed on this machine — state the requirement:
   Python 3.9+ and `pip install pythainlp` in a virtual environment, to be run by the owner or with the owner's
   go-ahead); (8) what the results may and may not be used for (held-out sentences are never used to tune). Include
   the same for reading units.
5. Tests: freeze determinism, hash verification refusal, accept refusal on frozen files, report header, units
   draft/accept round trip. All on synthetic sentences in temp directories.

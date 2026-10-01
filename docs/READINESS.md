# Readiness — what the system can do with supplied texts today

Three words are used strictly:

- **Implemented** — the code exists and its own tests pass.
- **Verified** — additionally proven end to end: integration tests on the real adapters, importer and engines,
  the generated import proof, and/or a browser flow against the running app.
- **Awaiting external input** — cannot be completed from inside the repository.

This is **not** a production-readiness claim.

## Readiness by language

| | Ingestion | Progress tracking | Linguistic analysis | Scripture | Real speech |
|---|---|---|---|---|---|
| **Spanish** | Verified (proof + browser importer) | Verified (one record on Home, library, reader; version-scoped) | Tokenization dependable; sentence splitting limited; lemma / morphology / phrases **seed lexicon only**; `á`, `dijéremos`, `engañamos` analysed, other historical forms left unanalysed | **Published**: Reina-Valera 1909, 3 verses, byte-verified against eBible.org | **Not verified** — no credentials; nothing synthesized |
| **German** | Verified | Verified (engine); browser checked for Spanish only | Dependable tokenization; separable verbs only `anfangen`; compounds low-confidence; **seed lexicon only** | **Published**: Lutherbibel 1912, 3 verses, byte-verified | Not verified |
| **Albanian** | Verified | as German | ë / ç preserved; inflected forms related; clitics ambiguous in thin context; **seed lexicon only** | **Blocked** — awaiting an approved translation | Not verified |
| **Hindi** | Verified (grapheme-safe spans, danda kept, non-NFC preserved) | as German | Compound verbs only when listed; **seed lexicon only** | **Blocked** | Not verified |
| **Thai** | Verified (no spaces added; a learner's own copy of a book imports chapter by chapter — see "Thai course") | Verified (engine and browser, sandbox) | Word segmentation **is a release gate that is not met**: first benchmark F1 90.3 % on a biased set, nothing measured on book prose (see "Thai substrate validation"); hand lexicon of 598 entries, **machine-drafted, not native-reviewed**; Wiktionary dictionary installed as a separate, attributed layer; script decoding measured on 17,298 words | **Blocked** | Not verified |

A course in the team list, or a seeded example, is not evidence of support: this table is. "Seed lexicon only"
means every word of a supplied text is tokenized and tracked, but a word outside the adapter's small lexicon
has no lemma or gloss ("not analysed yet"); analysis can be supplied with the text (`spans`), corrected by a
reviewer (`corrections`), or added to a lexicon. The importer reports analysis coverage per document, and the
preview and the import result now report the same figure.

## Thai substrate validation (2026-10-01, contract v6)

The question of this phase: does the Thai linguistic substrate hold on real or rights-safe data? No course feature
was added. Reports: `docs/thai/DICTIONARY_REPORT.md` (generated), `docs/thai/BENCHMARKS.md`. Briefs: `docs/PLAN6.md`.

### What was measured

| Question | Result | How |
|---|---|---|
| Dictionary | kaikki.org extract of English Wiktionary, Thai, source dated 2026-09-28 (50,456,126 bytes, 21,020 lines, sha256 `202acdc9…fb57`), built to 20,254 entries over 17,505 words with all 27,602 senses and 21,565 pronunciations kept with the source's own labels; source URL, date, checksum and licence (CC BY-SA 4.0) in the manifest. Git-ignored; never merged into the hand lexicon | `npm run dict:build`, 85 tests |
| Coverage of the hand entries | 577 of 598 by written form (96.5 %); 500 with the same part of speech, 565 (94.5 %) allowing the usual tag differences. Function words 144/155, classifiers 72/72, core vocabulary 361/371, phrase units as headwords 42/68 | `npm run dict:compare` |
| Disagreements | **112 recorded, all open, none resolved by the system**: 60 hand entries the dictionary lacks, 12 part of speech, 10 possibly different meaning, 25 register, 5 classifier. Tone: 0 across the 106 exception-list words that could be compared. One error in the engine's own list (ผลาญ, listed as two syllables) was found this way and the entry withdrawn | `data/review/th/disagreements.json`; decisions go in `resolutions.json` |
| Pronunciation coverage | 99.6 % of dictionary words carry a respelling, IPA and romanization; all 537 hand forms found in the dictionary have all three | same report |
| Tone engine, rules alone, on **17,298 Wiktionary spellings** | Before: confident and wrong for **5.71 %** of its confident answers (the earlier 185-word table, 0 wrong, was too easy). After a conservative rework by general rules, on the half the engine's author never saw (8,714 words): **0.82 % of confident answers wrong (24 words)**, confident and right 33.4 %, the rest marked uncertain. All words: 0.63 %. The price: confident answers fell from 45.6 % to 33.6 % of words | `npm run tones:eval -- --split test` |
| Tone resolution with the dictionary | The dictionary's respelling, read by the engine without the IPA, agrees with the IPA for 99.88 % of 8,124 held-out respellings (1 differs — the Wiktionary IPA for ข้าวหมกไก่ looks wrong and is recorded, not overridden; 9 unreadable). Coordinator tables: every word present agrees (599 of 614; 15 absent). Of 71 held-out words the rules leave uncertain, 65 are resolved by the dictionary, 6 are not in it. Hand lexicon: 64 uncertain readings resolved, 472 confident readings confirmed, 0 contradicted | `scripts/eval-resolution.mts`, `scripts/check-tone-tables.mts` |
| Word segmentation, first benchmark | 3,116 Wiktionary usage examples whose word breaks come from the editors' romanization (half of 6,206 aligned). Current tokenizer: boundary precision 84.5 %, recall 96.9 %, **F1 90.3 %, 61.3 % of sentences exactly right**; 65 % of its errors split a compound the editors kept whole. ICU alone: F1 90.1 %. Our own dictionary longest-match baseline: F1 96.6 % (built from the same word list as the gold, so favoured) | `npm run gold:wiktionary && npm run bench:words` |
| Reading units | 107 constructed stress paragraphs (machine-drafted): the splitter cut inside every abbreviation and every clock time. After fixing only the deterministic hazards: 80 of 107 exact (was 57), boundary precision 61.5 % (was 36.2 %), abbreviation splits 2 (was 11). Contested hazards (dialogue turns, quotation + reporting clause, unmarked sentence breaks, hard line breaks) deliberately left for real prose | `npm run bench:units`, section 4 of BENCHMARKS |
| How far a wrong boundary reaches | Same text under two segmentations, same reading: 15–23 of 307 word forms change their encounter count (about 1–3 % of encounters), audio segments 126 vs 136, and reading pace moves 4–13 % because of the reader's dwell floor and cap | `npm run bench:units -- --sensitivity` |
| Performance | Fold still flat (about 0.8 ms per sentence view). Import of 2,000 words: 138 ms without, 127–151 ms with the dictionary. Stored analysis +23 % with the dictionary (a first version copied dictionary senses onto every occurrence, +133 %; fixed by asking the dictionary at display time). App bundle +15 kB (1,050 → 1,065 kB). Dictionary lookups: 1,000 words in 75 ms cold, 6 ms warm | `scripts/probe-scale.mts`, `scripts/probe-import.mts` |
| Tests | `npm run gate`: 2,722 tests in 147 files, typecheck clean; import proof 162 checks, 0 mismatches; corpus check unchanged (2 published, 13 held) | |
| The four other courses | Unchanged: their adapters declare no sources and no decoding, so the reader shows no provenance line and asks no dictionary (tests; Spanish reader checked in the browser, zero dictionary requests); their bundled documents import identically apart from two new provenance fields | |

### Provenance (implemented and verified)

Every stored analysis carries an origin — `rule`, `hand`, `dictionary`, `corpus`, `reviewed` — and a source id
(`adapter-th@2:hand`, `kaikki-th@2026-09-28`, `import@2`, `human:<name>`). The hand word list stays first and is
labelled "machine-drafted — not checked by a native speaker"; the dictionary stands beside it and is asked when
the word sheet opens; a word only the dictionary knows is labelled as a dictionary meaning with the attribution.
A named person's correction supersedes any of them and the superseded rows are kept. Every decoded syllable says
whether it came from the rules, the engine's exception list or a dictionary, and a dictionary reading keeps the
rule's own confident answer beside it when they differ (`ruleTone`). Verified by integration tests and in the
browser with the real dictionary.

### Release gates not met

- **Word segmentation.** The only measurement is on short dictionary examples tokenized by another project's
  convention. **No comparison with an established tokenizer has been run** (PyThaiNLP `newmm` needs Python, which
  is not installed; the script and commands are ready in `scripts/external/`). **The course gold set is empty**
  (0 of 500–1,000 sentences, all eight strata) because no lawful book text has been supplied. Tools are ready:
  `npm run gold:draft`, `gold:accept`, `gold:status`, `bench:words -- --gold`.
- **Reading units.** Measured only on constructed cases written by a model. Real dialogue and book formatting
  are untested.
- **The tone engine's rules still give a confident wrong reading for about 1 word in 120 of those they answer
  confidently**, when no dictionary reading exists for the word.

### Policy recorded as data (`src/course/thai.ts`)

Thai Scripture stays blocked. THSV11: permission declined by the rights holder — never stored, shown, analysed,
packaged or played in the app; external link only. Biblica Open Thai Common Version 2025: a candidate named by
the course owner, licence unverified, nothing ingested. A draft translation may enter only as a labelled
technical fixture, which the publication gate can never publish. Audio rights are separate from text rights;
no recording is bundled. Readiness thresholds were not touched.

## Thai course (foundation, contract v5)

Design: `docs/THAI_COURSE.md`. This is the structure of the course, **without any of its books**: no text of the
ladder, no Thai Bible, no dictionary and no audio is in the repository.

### Implemented and verified

| Part | What was verified, and how |
|---|---|
| Ladder: Stage 0, Grades 1–9, open reading; 62 works with role and rights record | Manifest invariants (`test/integration/thai-ladder.test.ts`): nothing bundled, nothing marked public domain, nothing marked verified; spine order; varieties on the works that carry them. Ladder page in the browser (sandbox) |
| A learner's own copy of a book | Plain text → one document per chapter, text byte-identical, filed under its work, readable without a review, labelled "Your copy", refused under `data/corpus/`. Integration test, CLI run, and the in-app flow in the browser (convert → preview → confirm → chapters under the work) with a **synthetic** two-chapter text |
| Script decoding (syllables, consonant class, vowel, live/dead, tone mark, tone, the rule in words) | Coordinator's own tables (`test/integration/thai-tones.test.ts`): 304 regular one-syllable words all decoded confidently and correctly. A held-out table of 185 words gave 0 confidently wrong — but that table was too easy: see "Thai substrate validation" for the measurement on 17,298 real words. Word sheet in the browser, including an irregular word ("not read exactly as it is spelled… read as หนม") |
| Stage-specific assistance | Profiles are data; Stage 0 shows decoding with the first tap and romanization only behind a rescue button (its use is recorded); Grade 9 shows minimal chrome and still reaches English; courses without a ladder are unchanged (existing reader tests untouched). Stage 0 verified in the browser; later stages by tests only |
| Writing-system items (`orth`) | Folded by the evidence policy, never counted as words; decoding help recorded; state rebuilds identically from the log (integration test and a 420-event randomized comparison against a reference derivation) |
| Difficulty forecast, word history, reading pace, stage readiness | Integration test on the real engines: forecast is deterministic, emits nothing and states its limits; history names the first text, work and chapter and says "Pronunciation: not measured"; **finishing every text never produces "ready to advance"**. Readiness panel and forecast in the browser |
| Dictionary pipeline | `npm run dict:build` and the runtime source; since the validation phase, run on the real file (see above). The dictionary supplies the analysis only for words the adapter cannot analyse, below certainty; for the others it stands beside the hand entry |
| Scripture as a parallel corpus | Outside the ladder, same learner model (a word met in a chapter and in a verse shares one history), takes the profile of the stage the learner works at. The Thai sample itself stays **blocked** |
| Scale | Folding one sentence view cost 3 ms at first and 40–87 ms after 1,200 views (measured, `scripts/probe-scale.mts`); after the rework it is flat at about 0.8 ms and encounter rows fell from 37,680 to 13,560 |

Policy is now `evidence@6` (existing databases rebuild from the event log on first open; verified on a sandbox
database created under the previous version).

### Limits that are stated, not solved

- **The tone engine is rule-based and conservative.** Rules alone answer confidently for about a third of
  dictionary words and mark the rest uncertain; the dictionary's pronunciation is the authority where it has the
  word. About 110 words rest on two lists written by the engine's author, not reviewed by a native speaker; six
  of them have no dictionary entry to check against (ดำริ, นิรันดร์, พินาศ, พระจันทร์, พระอาทิตย์, อธรรม).
- **The hand lexicon, phrase units (64) and constructions (33) are machine-drafted.** The drafter flagged as
  unsure: หน as a classifier, the regional tags on บ่ / กิ๋น / แอ่ว / จ๊าด, register tags on มิ / ครั้น / ฤๅ / เจ้า /
  สุนัข, glosses of เกี่ยว and ค่อย, and the wording for จ้ะ / จ๊ะ.
- **Reading units.** Thai has no sentence mark; long prose spans are divided at clause spaces by rule. Measured
  on constructed cases only (see above); not measured on real prose.
- **Readiness thresholds are provisional policy** (`READINESS` in `src/golearn/policy.ts`), not validated against
  learners.
- **No Thai definitions, no frequency data, no sense disambiguation, no automatic detection of omitted subjects
  or literary devices.** The forecast says so in its own output.
- **Some reads still grow with history** (unscoped reading pace, `recommend`, per-text progress): measured flat
  for folding, not yet measured for these at novel scale.
- **Personal copies are not part of a backup**: re-import the file; evidence re-attaches through stable sentence keys.
- **Not checked in the browser:** assistance profiles beyond Stage 0, notes and clause-structure display,
  Settings → Language support. (Dictionary-backed analysis and the provenance lines were checked in the
  validation phase.)

### Awaiting external input (Thai)

1. **The books.** Every work is a recommendation with rights unverified; the learner supplies each text from a
   copy he is entitled to use. Bibliographic details (authors, publishers, editions) are from general knowledge
   and are marked unverified.
2. **Python with PyThaiNLP** (or its output for the benchmark sentences) for the comparison with an established
   tokenizer — the owner's decision whether to install it.
3. **A Thai Bible**: the release metadata of the candidate translation verified, then verification of the text
   as for Spanish and German. The three-verse Thai sample in `data/corpus/th/` is of unidentified origin and
   should be replaced by a rights-clear fixture.
3a. **A reviewer's decisions** on the 112 recorded disagreements (`data/review/th/resolutions.json`).
4. **Native review** of the lexicon, the tone exception lists, phrase units and constructions.
5. **Real speech** (unchanged: no provider credentials).

## The two audited defects

### A. "Seen 0 of 10 · Finished" (reader, library) vs "Seen 4 of 10 · Finished" (Home)

Reproduction: all three surfaces already called the same `readingProgress(userId, textId)` and formatted it with
one function. With identical stored events they agree — reproduced in the running app with a new learner at
every step. I could not make the three disagree for the same state at the same moment, and found no duplicate
events. What produced the audited picture:

1. **No version scope in the record.** Progress counted only live sentences of the current content version and
   silently dropped exposure recorded against retired ones (a revision, or the index-id sentences of a database
   created before stable sentence keys), while "Finished" carried over from any version. That yields
   "Seen 0 of 10 · Finished" with no explanation.
2. **Independent snapshots.** Each surface read once on mount; the reader re-read on a 300 ms timer, the library
   and Home never. A surface opened before a dwell completed showed fewer sentences than one opened afterwards.
3. **A dropped completion** (found while fixing): finishing a revised text in the same sitting as an earlier
   finish was discarded by the dedupe key.

Fix: one canonical record — scope `{learner, language, text, content version}`; `sentencesSeen` and
`sentencesUnderstood` over this version; `finishedAt` only for a completion of this version;
`finishedEarlierVersion`; `earlierVersions` (exposure against retired sentences: kept and reported, never
counted). One hook and one component render it on Home (card and rows), the library and the reader, re-reading
after `golearn.settled()` on every learner event. Wording is identical everywhere: `Seen x of y sentences`,
`Understood x of y (your report)`, `Finished`, `Finished (your mark)` when fewer sentences were seen than the
text has (with the explanation one tap away), `Finished an earlier version — the text has changed since`,
`n more seen in an earlier version`.

### B. "likely familiar" 24 % → 46 % → 3 % when Parallel English was toggled

Reproduced on the real engines (`scripts/probe-parallel-english.mts`): one `EnglishRescueRevealed`, no new views,
no reports. Two causes:

1. **Rule too blunt (the settled 3 %).** The estimate required "no help in the last two encounters", and a
   whole-passage English reveal counted as help for every word of every sentence, so one toggle vetoed the
   estimate of words met help-free dozens of times. Story encounters were never touched.
2. **Reads not serialized with folds (the transient 46 %).** Coverage was read while the fold was still writing,
   on a blind timer. Toggling English off emitted nothing; the next read showed the settled state.

Fix (`evidence@4`): help has a scope. Help with a word, phrase or grammar point vetoes that item's estimate.
English or an explanation for a sentence makes that encounter "read with the English shown" — it can never
demonstrate, and it is not a help-free exposure — but it does not veto an estimate earned elsewhere and never
touches other sentences or sittings. Every read waits for the fold queue. Probe after the fix:
`40 %` before; `28 %` while the fold runs, after it settles, and after a rebuild from the log. The remaining
drop is two words ("que", "y") that had reached the threshold only through the two verses now read with English.
Exposure is still never shown as understanding ("shown 0 %" throughout).

## Import tests actually run

`npm run corpus:prove` — clearly labelled synthetic files in `data/synthetic/import-proof/`, the real importer,
an isolated in-memory store: **14 case groups, 162 checks, 0 mismatches** (`docs/import/PROOF.md` is generated
from the run). The same files through the **in-app importer in a sandbox database**:

| Case | Outcome in the browser |
|---|---|
| Valid text | imported (new), not published (unreviewed); 15 → 16 texts, 106 → 112 sentences |
| Malformed JSON | refused with the parse position and a fix; counts unchanged |
| Unchanged re-import | "unchanged"; counts identical |
| Two files with one id | no import offered; counts unchanged |
| Valid + invalid in one batch | nothing imported; counts unchanged |
| Span outside the sentence | refused with path and fix |
| Broken translation alignment | refused; the hint lists the sentences the adapter found |
| Revised text | "updated, 1 sentence retired"; version 2; 7 live sentences, 2 added |
| Review hold / rights hold | imported, held with the reason |
| Placeholder "Scripture", unverified | imported, held with every missing requirement |
| Placeholder "Scripture", generated | refused |
| Exactness (Spanish, Hindi danda, Thai without spaces) | stored text byte-identical by code point; normalized form differs where it should |
| Review, then revise without review, then review again | published → held ("the text changed after it was reviewed") → published |

Two defects found by these runs and fixed: a raw paragraph with edge whitespace produced no warning; validation
ignored analysis supplied with the file when counting coverage, so preview and result disagreed. One gap closed:
a review now records which wording it covers, and a revised text is held until it is reviewed again
(Scripture is bound by its verification instead). No synthetic text is published or present in the normal library.

## Speech

`npm run speech:check`: `configured: no`; **12 of 12 provider-independent checks pass** (cache keys, requested vs
delivered locale, voice metadata and review gate, content-version invalidation, retry, dead state with visible
reason, partial generation, unconfigured state, fixture and failed playback never eligible, real-speech events
flagged as speech, key never leaked). `REAL SPEECH: NOT VERIFIED`. One defect fixed: the proxy answered an
oversized request before reading it, which could surface as a connection reset instead of the 413.

## The acquisition loop

`test/integration/acquisition-loop.test.ts` passes all twelve steps on the real adapters, importer and engines,
now including "a revised text is held until re-reviewed". In the browser this round (sandbox): import and
validation, review → publish, revise → hold → re-review, reading with real dwell, explicit finish, identical
progress on the three surfaces, Parallel English stability, honest audio state. The remaining steps (word /
phrase / grammar / English help levels, Scripture preparation, testimony draft, suggestion, assisted vs
independent, reload and language switch) were verified in the browser in the previous round and are covered by
the integration test in this one; they were not re-walked in the browser after this round's changes.

## Not verified

- **Real speech**: nothing has ever been synthesized or heard.
- **Progress in the browser for languages other than Spanish** (engine tests cover all five).
- **The estimate rule in a live browser**: the sandbox learner had one sitting, so no estimates existed; the
  rule is proven by the probe and the engine tests, the browser check proves one event and no transient values.
- **In-app backup download and restore, and a provoked storage failure**: automated tests only.
- **Linguistic quality** of the seed texts, GoTell's term tables and the adapters' rules: not native-reviewed.

## Awaiting external input

1. **Native-speaker review** of comprehensible-input texts (none is reviewed; the normal Read list is empty).
2. **Approved Scripture** for Albanian, Hindi and Thai, then `node scripts/verify-scripture.mjs`.
3. **Speech**: `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in `.env.local`, restart, `npm run speech:check`, then
   a human audition of each voice (`src/golisten/QA.md`).
4. **Native review** of GoTell's per-language tables and the adapters' writing rules.
5. **Lexicon growth or supplied analysis** beyond the seed vocabulary.

## Operating instructions

Specification and numbered walkthrough: `docs/IMPORT.md`. Templates: `docs/import/templates/`. Worked example:
`docs/import/examples/README.md`. Proof: `docs/import/PROOF.md`.

```bash
npm run corpus:validate -- path/to/text.json
```
```bash
npm run corpus:review -- path/to/text.json --by "Reviewer Name"
```
```bash
npm run corpus:prove
```
```bash
npm run speech:check
```

Import through Settings → Content, or place the file under `data/corpus/<lang>/`. To try anything without
touching your library, open the app with `?sandbox=<name>` (separate database, bannered).

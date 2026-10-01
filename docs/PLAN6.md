# PLAN6 — Thai linguistic substrate: dictionary, provenance, benchmarks

Goal of this phase: **prove the Thai linguistic substrate on real or rights-safe data. No new course features.**
The course owner's constraints (verbatim intent):

1. The kaikki / English Wiktionary Thai dictionary is a **separately sourced layer**: source, source version, licence
   and the imported senses and pronunciations are preserved; nothing is merged irreversibly into the hand lexicon.
   The hand data (597 entries, 64 phrases, 33 constructions, tone exception lists) stays labelled
   `machine-drafted / not native-reviewed`. Where hand data and the dictionary disagree, **neither is chosen
   silently: the disagreement is recorded for review.**
2. Every analysis can be told apart as rule-derived / hand-authored / dictionary-derived / corpus-observed /
   manually reviewed. A reviewed override may supersede an imported result while keeping its history.
3. **Segmentation is a release gate.** Synthetic tests prove nothing about real prose. Benchmark against an
   established tokenizer and human-tokenized data; build the infrastructure for a course-specific, manually checked,
   held-out gold set (500–1,000 sentences across the strata below) with boundary precision / recall / F1 and the
   actual error cases retained.
4. The same for sentence / reading-unit splitting (dialogue, quotation marks, abbreviations, paragraphing, book
   formatting). Bad boundaries must not contaminate reading pace, encounter counts or audio alignment.
5. Readiness thresholds stay provisional: **do not tune the advancement model.**
6. Books stay recommendation metadata. No corpus text is downloaded. No rights are inferred.
7. Thai Scripture stays blocked. 8. Audio rights are separate from text rights.
9. **Tone engine: prefer `uncertain` over a confident wrong pronunciation.** Dictionary pronunciation may resolve
   uncertainty but never silently overrides a rule result: provenance is retained.

Strata of the course gold set: `stage0` · `mana-mani` · `childrens-literature` · `modern-literary` ·
`grade8-literary` · `regional` (e.g. ลูกอีสาน) · `chotmai` (จดหมายจากเมืองไทย) · `scripture`.

## Facts established by the coordinator (do not re-derive)

- The source file is on disk: `data/dictionaries/kaikki.org-dictionary-Thai.jsonl` (git-ignored; 50,456,126 bytes;
  21,020 lines; source Last-Modified 2026-09-28; sha256 `202acdc9…fb57`; URL
  `https://kaikki.org/dictionary/Thai/kaikki.org-dictionary-Thai.jsonl`). **Download nothing else. Install nothing**
  (no `npm install`, no Python).
- Real shapes (`npx vite-node scripts/probe-kaikki.mts` prints them): 17,629 distinct headwords; `pos` values noun,
  verb, adj, name, adv, intj, classifier, num, pron, character, prep, conj, particle, phrase, prefix, proverb, det,
  punct, suffix, prep_phrase, symbol, infix. `sounds` rows: `{ipa}`; `{roman, raw_tags:["Paiboon"], tags:["romanization"]}`;
  `{roman, raw_tags:["Royal Institute"], …}`; `{other, raw_tags:["Orthographic"], roman}`; `{other, raw_tags:["Phonemic"], roman}`;
  **`{other, raw_tags:["Orthographic/Phonemic"], roman}`** (3,548: the word is read as written — one tag string);
  variant readings `raw_tags` such as `["Phonemic","Unorthographical","Short"]`, `["bound form","Phonemic"]`,
  `["Phonemic","Short"]`, with `tags` like `colloquial`, `reduplication`, `rare`, `dated`; `{homophone}`; `{audio,…}`.
  An entry can list several IPA readings. Sense keys: `glosses`, `raw_glosses`, `tags`, `topics`, `examples`,
  `alt_of`, `form_of`, `raw_tags`, `qualifier`, `synonyms`. Sense tags seen: alt-of 1,235, slang, formal, archaic,
  colloquial, idiomatic, poetic, obsolete, figuratively, derogatory, historical, misspelling, abbreviation, humorous,
  offensive, dated, vulgar, literary, dialectal, childish, humble, polite, Northeastern … There is **no `classifiers`
  key** anywhere; classifier information, if any, is in `head_templates[].expansion`. 1,147 entries are alt-of /
  form-of only. 6,206 usage examples: `{text, roman, translation, type: "example"|"quotation", ref?, bold_*_offsets}` —
  `roman` is Paiboon romanization with a space between WORDS, a hyphen between the syllables of a word and ` · `
  at phrase breaks; 2,353 example texts contain spaces.
- The current builder already runs on the real file (2 s, 20,342 entries, 4 MB of shards under `public/dict/th/`,
  git-ignored).
- **Tone engine against all Wiktionary pronunciations** (`npx vite-node scripts/eval-tones-kaikki.mts`, 17,298
  distinct spellings, reference = any listed IPA reading): rules alone are confident and right for 45.61 %,
  **confident and WRONG for 2.76 % (5.71 % of confident answers)**, uncertain for 49.83 %, no answer 1.80 %. The
  respelling path (`decodeThaiRespelling` without IPA) agrees with the IPA for 99.32 % (1 wrong, 108 no answer).
  The coordinator's 185-word held-out table (0 confidently wrong) was too easy; this is the real figure.

## Rules for every package (as PLAN5, plus)

- Other packages run at the same time in the same tree: touch only your files. `src/core/**`, `docs/PLAN6.md`,
  `docs/READINESS.md`, `docs/THAI_COURSE.md`, `test/integration/**`, `package.json`, `.gitignore`,
  `scripts/eval-tones-kaikki.mts`, `scripts/probe-kaikki.mts`, `scripts/probe-scale.mts` are the coordinator's.
- Dictionary-derived content is CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org). **Generated dictionary
  data never goes into a committed file**: shards under `public/dict/`, generated gold under
  `data/benchmarks/th/generated/`, raw source under `data/dictionaries/` are all git-ignored. Committed reports may
  quote individual words and short readings as findings, with the attribution line.
- Never label machine-drafted Thai as reviewed. Never invent a frequency, a licence or a reading.
- The four non-Thai courses must behave exactly as before: every existing test of the other languages stays green
  untouched.
- Final report under 250 words: files, exported names, numbers measured, anything not done, every Thai fact you
  were unsure of.

---

## A — Tone engine: provenance and a conservative policy measured on real data

**Yours:** `src/adapters/thai/orthography.ts`, `orth-exceptions.ts`, `test/adapters/thai-orthography.test.ts`.

1. **Provenance on every syllable** (`SyllableAnalysis.source`, `sourceId`, `ruleTone` — read the comments in
   `src/core/course.ts`): `decodeThai` sets `source: 'rule'`, or `'exception-list'` (with `sourceId:
   'adapter-th:orth-exceptions'`) for a word decoded from your lists. `decodeThaiRespelling(surface, respelling,
   ipa?, opts?: { source?: 'dictionary' | 'exception-list' | 'author'; sourceId?: string })` sets what it is given
   (default `'dictionary'`). When the result is not from the rules and `decodeThai(surface)` — computed WITHOUT the
   exception lists — gives, for the same number of syllables, a tone at confidence ≥ 0.8 that differs, set that
   syllable's `ruleTone` to the rule's tone. Export `decodeThaiByRulesOnly(surface)` for this and for the audits.
2. **Conservative policy, measured.** `npx vite-node scripts/eval-tones-kaikki.mts --split dev` evaluates your
   engine on half of the Wiktionary spellings; **use the `dev` half only** (`--list 200` prints cases; `--out f.json`
   writes them all). The `test` half is the coordinator's held-out half: never run or read it. Today on all words:
   confident and wrong = 5.71 % of confident answers. Required: **at most 1.0 % of confident answers wrong on
   `dev`**, by general, explainable rules about when the spelling does not settle the reading (cap the confidence
   below 0.8 for those patterns), **not** by listing dictionary words: do not add any word to `orth-exceptions.ts`
   in this batch (the dictionary supplies readings for its own words at runtime; the rules must be safe for the
   words it does not have). Typical classes in the errors: a cluster reading that is really two syllables (กวี,
   ปรอท, ผลาญ), a linking syllable after a final (เทวดา, เอกภาพ, วิสาข), carry-over with a leading vowel (เขย่า,
   เสมอ), implicit vowels in Indic words (จระเข้, พละ), English loans whose tone does not follow the spelling (ชีส,
   ช็อกโกแลต, วอดก้า), final short vowels in loans (โอบามา → mâa). Keep as many right answers confident as you can:
   report the before / after table (confident right %, confident wrong % of confident, uncertain %), overall and by
   syllable count, and one line per pattern you capped with how many errors it removed and how many right answers it
   cost. The coordinator tables (`test/integration/thai-tones.test.ts`) must stay green: the regular one-syllable
   CORE words stay confident and right; HARD and HELD_OUT stay at 0 confidently wrong. If a cap you need would make
   a CORE word uncertain, stop and report the conflict instead of weakening either side.
3. The one respelling the engine reads differently from Wiktionary's IPA is ข้าวหมกไก่ (respelling ข้าว-หมก-ไก่,
   IPA says rising for หมก; you say low). Decide which is wrong by the rules of Thai orthography and report; do not
   special-case it.
4. Reduce the 108 "no answer" respellings where the respelling is regular Thai (`--list` shows none of these;
   write a small local loop over the dev half to see them).

## B — Thai adapter: sources and provenance of the hand data

**Yours:** `src/adapters/th.ts`, `src/adapters/thai/*` except the two orthography files, your Thai adapter tests.

1. `thAdapter.sources` (`AnalysisSourceInfo`, see `src/core/model.ts`): `adapter-th@<version>:hand` — label "Course
   word list", origin `hand`, reviewStatus `machine-drafted`; `adapter-th@<version>:phrases`, `:constructions`,
   `:orth-exceptions` likewise; `adapter-th@<version>:rules` — origin `rule`.
2. Every candidate from the hand lexicon carries `origin: 'hand'` and that `sourceId`; anything produced by a rule
   carries `origin: 'rule'`. No content change to the lexicon in this batch.
3. `decodeWithPronunciation` passes `{ source: 'dictionary', sourceId }` through to the engine (add an optional
   third argument `sourceId?: string`; the contract's two-argument call keeps working) and returns the engine's
   provenance untouched; `decode` returns the engine's `source` untouched.
4. Wait for nothing: package A is changing the engine's internals at the same time, its signatures are stable
   (`decodeThaiRespelling` gains an optional fourth `opts` argument as in §A.1).
5. A second batch on reading units will follow from the benchmarks; do not change segmentation now.

## C — Dictionary: the real file, everything preserved, source recorded

**Yours:** `src/dict/**` (except `compare*.ts`, package G), `scripts/dict-build.mts`, `test/dict/**` (except
`compare*`).

1. Map the **real** shapes listed above (read the real file locally as much as you need; copy no content into
   committed files beyond single words in test names). In particular: `Orthographic/Phonemic` rows (read as
   written: `asWritten: true`, respelling = the word); every pronunciation row group preserved in
   `DictionaryEntry.pronunciations` with its tags verbatim, pairing each phonemic respelling with its IPA and
   romanizations by order when the counts match (when they do not, keep them unpaired and count it); the first plain
   reading stays in `respelling` / `ipa` / `romanization`; every sense preserved in `senses` (gloss, tags, topics,
   number of examples) while `glosses` stays the short view; `altOf`; `etymology` number; classifiers parsed from
   `head_templates[].expansion` when it states them; the full POS map (name → PROPN, classifier → CLF, particle →
   PART, phrase / proverb / prep_phrase → X with a `role`, character / symbol / punct kept out of word analysis but
   counted); register mapping from sense tags as before, extended to the tags listed above, never guessing a
   regional tag from a vague one (`dialectal` alone is not a region).
2. Do **not** merge entries that differ in etymology number or pronunciation; same form + same POS + same
   etymology may merge.
3. Manifest (`DictionaryInfo.source`): the CLI takes `--source-url`, `--last-modified`, `--retrieved` and computes
   the file's sha256 and line count itself. The dictionary id becomes `kaikki-th@<last-modified date>`. Schema
   number 2; a schema-1 dictionary on disk reads as "not installed".
4. Rebuild into `public/dict/th/` from the real file with `--source-url
   https://kaikki.org/dictionary/Thai/kaikki.org-dictionary-Thai.jsonl --last-modified 2026-09-28 --retrieved
   2026-09-30` and report: entries, forms, entries with a respelling / IPA / romanization, pronunciation groups
   unpaired, senses kept, entries with register tags, shard bytes (total and largest), build time, and lookup time
   for 1,000 random forms through the file source.
5. Keep the fixture tests; extend the fixture (hand-made, same rules as before) with the real shapes.

## D — Importer: origins, and the dictionary beside the hand lexicon

**Yours:** `src/ingest/**`, `scripts/corpus-*.mts`, `docs/IMPORT.md`, `test/ingest/**`.

1. Every stored `TokenAnalysis` gets `origin` and `sourceId`: adapter candidate → the candidate's own `origin` /
   `sourceId` (fallbacks: `hand` for a lexicon hit, `rule` when `notes.source === 'rule'`, `sourceId` =
   `adapter-<lang>@<version>`); dictionary candidate → `dictionary` + the dictionary id; author span → `corpus` +
   `import@2`; correction → `reviewed` + `human:<by>`. The coarse `provenance` field and its ranking are unchanged.
2. **The dictionary also stands beside the hand lexicon.** For a word the adapter analyses, the pre-pass now looks
   the form up too, and the stored analysis keeps the adapter's candidate FIRST and unchanged, with the dictionary's
   entries added as `alternatives` (`origin: 'dictionary'`, `sourceId`, `gloss`, `pos`, confidence as today), and
   — only when the adapter's candidate has no pronunciation notes — `notes.respelling` / `notes.ipa` from the
   dictionary's first reading with `notes.pronunciationSource` = the dictionary id. Nothing of the hand analysis is
   replaced. For a word only the dictionary knows, behaviour stays as today plus the origin fields.
3. Variant readings: when the entries of a form list more than one reading, store `notes.readings` (the respellings,
   first one first) so the reader can say there are several.
4. Keep `syllables` unstored. Plan signature covers all of the above (a new dictionary version re-analyses).
5. Tests for each origin, for precedence (hand first, dictionary beside it, human correction above both with the
   superseded rows kept), for re-import with a changed dictionary id, and that Spanish / German / Albanian / Hindi
   documents import byte-identically to before apart from the two new fields (the import proof stays at 0
   mismatches: `npm run corpus:prove`).

## E — GoLearn: a reviewed override keeps history

**Yours:** `src/golearn/**`, `test/golearn/**`. Tiny batch. **Do not touch `READINESS` or any threshold.**

`overrideAnalysis` writes `origin: 'reviewed'`, `sourceId: 'human:<who>'`, supersedes the row it overrides and
deletes nothing; `resolveAnalysis` still returns the override. Add `analysisHistory(tokenId)` to
`src/golearn/queries.ts` (not to the contract) returning every stored row for a token, newest first, each marked
current / superseded. Test: dictionary analysis → hand override → second override; all three rows remain, the
latest wins, origins are right, a rebuild changes nothing.

## F2 — Reader: say where it comes from

**Yours:** `src/ui/reader/**`, your reader tests. Small batch. No new feature beyond showing provenance.

1. Under the gloss, one quiet line naming the source of the analysis shown, from `analysis.origin` / `sourceId`:
   `hand` → the adapter's `sources[sourceId].label` + ", machine-drafted — not checked by a native speaker" (from
   `reviewStatus`); `dictionary` → the dictionary's `attribution` (from `lexicon(lang).info()`) ; `rule` → "worked
   out by rule"; `corpus` → "supplied with this text"; `reviewed` → "checked by <name>". Absent origin → no line
   (other languages' existing rows: unchanged display).
2. When the analysis has dictionary `alternatives`, a collapsed "Wiktionary also lists" disclosure with their
   glosses (label from the dictionary attribution, not hard-coded). When the first alternative's part of speech
   differs from the shown analysis, or their glosses share no word, add one neutral line: "The course word list and
   the dictionary differ here." No judgement about which is right.
3. Decoding block: one line for the source of the reading — `rule`: as today; `exception-list`: "from the course's
   list of irregular words (machine-drafted)"; `dictionary`: "from the dictionary's pronunciation"; and when a
   syllable has `ruleTone`: "The spelling rules alone would give <tone>." `notes.readings` with more than one
   entry: "This word has more than one reading."
4. Pass the dictionary id through to `decodeWithPronunciation` (third argument) when the pronunciation notes came
   from a dictionary (`notes.pronunciationSource`).

## G — Hand data against the dictionary: coverage and disagreements (new package)

**Yours:** `src/dict/compare.ts` (+ helpers named `compare-*.ts`), `scripts/dict-compare.mts` (npm script
`dict:compare` exists), `test/dict/compare*.test.ts`, the generated `docs/thai/DICTIONARY_REPORT.md` and
`data/review/th/disagreements.json`. Read `src/adapters/th.ts` and `src/adapters/thai/*` to see how the hand
lexicon, classifiers, function words, phrase units, compounds and the orthography exception lists are exposed, and
`src/dict/map.ts` (`entryFromKaikki`) — package C is extending that mapper right now; call it, do not copy it, and
read only fields that exist in `DictionaryEntry` (`src/core/contracts/lexicon.ts`).

`npm run dict:compare -- --in data/dictionaries/kaikki.org-dictionary-Thai.jsonl --lang th` streams the source
through the mapper and compares, writing both outputs deterministically:

1. **Coverage of the hand entries** (count them from the lexicon itself): by form; by form + part of speech; listed
   separately for function words, classifiers, core vocabulary, phrase units (as headwords), course compounds.
2. **Disagreements** as `SourceDisagreement` records (`src/core/contracts/lexicon.ts`), `ours.sourceId` =
   `adapter-th@<version>:hand` (or `:orth-exceptions`), `theirs.sourceId` = the dictionary id, all `status: 'open'`:
   - `missing`: a hand entry the dictionary does not have (not an error: recorded so a reviewer sees it);
   - `part-of-speech`: the hand POS is not among the dictionary's POS for the form;
   - `meaning`: no content word of the hand gloss appears in any dictionary gloss of the form (after lower-casing,
     removing stop words and bracketed remarks, light stemming) — worded as "possibly different", never as wrong;
   - `register`: the hand entry carries a register tag the dictionary's labels contradict or lack, or the reverse
     for strong labels (vulgar, slang, archaic, royal);
   - `classifier`: a hand classifier entry the dictionary does not list as a classifier;
   - `tone` / `syllables` / `pronunciation`: every word of the engine's exception lists (`THAI_ORTH_EXCEPTIONS`,
     `THAI_ORTH_SETTLED`) and every hand romanization, against the dictionary's readings (tones from the IPA tone
     letters, syllable count, respelling). A hand reading that matches ANY listed reading agrees.
   Existing decisions live in `data/review/th/resolutions.json` (hand-edited, keyed by disagreement id; create it
   empty if absent, never overwrite it): a resolved id is written with `status: 'resolved'` and its resolution.
3. **Pronunciation coverage**: share of dictionary forms with a respelling, an IPA, a romanization; the same for
   the hand entries; and for the word tokens of every Thai document under `data/corpus/th/` and of
   `test/integration/fixtures/thai-synthetic-book.txt` (tokenized with the real adapter): share with a hand
   analysis, with a dictionary entry, with a dictionary pronunciation, with neither.
4. `docs/thai/DICTIONARY_REPORT.md`: generated, dated by the dictionary id, starting with the attribution and
   licence line, then the tables, then the first 40 disagreements of each kind (the full list is the JSON). State
   plainly what each comparison can and cannot show.
5. Tests on small in-memory inputs for each comparison and for determinism and the resolutions merge.

## H1 — Word segmentation benchmark and the gold-set infrastructure (new package)

**Yours:** `src/bench/words/**`, `src/bench/gold/**`, `src/bench/shared.ts`, `scripts/bench-words.mts`,
`scripts/gold-*.mts` (npm scripts `bench:words`, `gold:wiktionary`, `gold:draft`, `gold:accept`, `gold:status`
exist), `test/bench/words*.test.ts`, `test/bench/gold*.test.ts`, `docs/thai/BENCHMARKS.md` (sections 1–3; H2 adds
section 4 — create the file with the headings `## 1 … ## 4`, write only yours).

1. **Gold format** (JSON Lines, one sentence per line): `{ id, lang, stratum, text, boundaries, source: { title,
   licence, rights: 'rights-safe' | 'personal-copy' | 'derived-cc-by-sa' }, tokenizedBy, checkedBy?, checkedAt?,
   heldOut?: boolean, notes? }` where `boundaries` are the UTF-16 offsets at which a new word starts (excluding 0),
   and whitespace is never a word. Plus an editing format a person can correct in any text editor: one sentence per
   line with `|` between words, a header line per sentence carrying the id. Converters both ways, a validator
   (boundaries inside the text, never inside a grapheme cluster or between a base consonant and its marks,
   re-joining reproduces the text exactly).
2. **Metrics**: boundary precision / recall / F1 (micro, and per stratum), word-level precision / recall / F1,
   sentence exact-match rate; **every sentence with an error is retained** in an errors file (gold vs system, the
   differing spans classified over-split / under-split / shifted) — never just a number.
3. **Systems** behind one interface `(text) => boundaries`: `adapter` (the real `thAdapter.tokenize`), `icu`
   (`Intl.Segmenter('th')` with no course compounds), `dict-mm` (your own longest-match segmentation over the
   dictionary headwords with a minimal-unknown-characters fallback — label it honestly as ours, **not** as an
   established tokenizer), and `external:<name>` reading a file in the editing format so that the output of
   PyThaiNLP `newmm` (or any other tool) can be dropped in. Python is not installed on this machine and must not be
   installed: write `scripts/external/pythainlp_tokenize.py` (a few lines: read the benchmark sentences, write the
   editing format with `word_tokenize(engine="newmm")`) and document the two commands to run it; do not run it.
4. **A rights-safe human-tokenized set, derived now** (`npm run gold:wiktionary`): the usage examples in the source
   file carry `text` and a Paiboon `roman` in which the Wiktionary editor separated the WORDS with spaces
   (syllables of one word with hyphens; ` · ` at phrase breaks). Align each example's romanized words to its Thai
   text using the romanizations the dictionary itself lists for every headword (all readings), by dynamic
   programming over the text; keep only examples that align completely and in exactly one way; write them to
   `data/benchmarks/th/generated/wiktionary-examples.gold.jsonl` (git-ignored) with `tokenizedBy: "Wiktionary
   editors (romanization word breaks), aligned automatically"`, `rights: 'derived-cc-by-sa'`, strata
   `wiktionary-example` and `wiktionary-quotation` (by the example's `type`), and report how many of the 6,206
   aligned, why the others did not, and the obvious biases (only words Wiktionary has as headwords can align, so
   dictionary-based systems are favoured; editors' word division is a convention, not ours). Sample 60 aligned
   sentences deterministically and check by inspection that the alignment is right; report what you saw.
5. **First benchmark**: run all systems on that set, per stratum, and write the table and the 50 most frequent
   error patterns per system into `docs/thai/BENCHMARKS.md` (numbers and single words only; errors file stays under
   `generated/`).
6. **Course gold set, ready for the first lawful texts**: `npm run gold:draft -- <file.json|.txt> --stratum <one of
   the eight> --n 60 --seed 1 [--held-out]` samples sentences from a supplied text (a v2 document or plain text)
   and writes the adapter's segmentation as a DRAFT in the editing format under
   `data/private/benchmarks/th/<stratum>/` (git-ignored) for a person to correct; `npm run gold:accept -- <draft>
   --by "Name"` validates and writes the gold JSONL with `checkedBy` / `checkedAt` (refuses without `--by`, refuses
   an unedited draft unless `--confirm-unchanged`); `npm run gold:status` prints sentences per stratum against the
   target of 500–1,000 overall and which strata are empty; `bench:words --gold <dir>` runs on it. Held-out
   sentences are never printed by the tools except in the errors file of an explicit `--held-out` run.
7. Tests: metrics on hand-computed cases, converters round-trip, validator refusals, alignment on tiny constructed
   inputs, determinism of sampling, the accept refusals.

## H2 — Reading-unit benchmark and boundary sensitivity (new package)

**Yours:** `src/bench/units/**`, `scripts/bench-units.mts` (npm script `bench:units` exists),
`test/bench/units*.test.ts`, `data/benchmarks/th/constructed-units.gold.jsonl`, section 4 of
`docs/thai/BENCHMARKS.md` (H1 creates the file; if it is not there yet create it with the headings `## 1 … ## 4`
and write only section 4). You may import the pure metric helpers from `src/bench/shared.ts` if H1 has written
them; otherwise keep your own small copy in your folder.

1. **Gold format** for paragraphs: `{ id, lang, stratum, paragraph, unitBoundaries, source, segmentedBy,
   checkedBy?, checkedAt?, notes? }` (`unitBoundaries` = UTF-16 offsets where a new reading unit starts, excluding
   0), an editing format (one unit per line, blank line between paragraphs), converters, validator (units
   re-joined reproduce the paragraph exactly, including the whitespace between units).
2. **Constructed stress cases** (`constructed-units.gold.jsonl`, committed): about 80 short paragraphs you write
   yourself — clearly labelled `segmentedBy: "constructed by the benchmark author (machine-drafted Thai, not
   native-reviewed)"`, `rights: 'rights-safe'` — covering: dialogue with quotation marks (“ ” and " "), a quotation
   containing several sentences, speech followed by a reporting clause, final particles before a space, ellipses,
   ฯ and ฯลฯ, ๆ, abbreviations with full stops (พ.ศ., ร.ร., ดร.), numbers with decimal points and thousands
   separators, times, Latin-script words and names, lists with commas, parentheses, a long narrative paragraph with
   clause spaces only, a one-word paragraph, a heading-like line, a paragraph broken by a hard line break inside a
   sentence (book formatting), leading indentation. These test BEHAVIOUR on known hazards; they say nothing about
   accuracy on real prose, and the report must say so.
3. **Metrics**: unit-boundary precision / recall / F1, paragraph exact-match, errors retained per case with the
   hazard named. **Guards that protect pace, encounter counts and audio alignment**, reported per system for any
   input (gold not needed): words per unit (median, 95th percentile, maximum), units over 40 words, units of one
   word, units that begin or end inside a quotation that opens and closes within the paragraph, units that split a
   number or an abbreviation.
4. Systems: `adapter` (the real `thAdapter.segmentSentences`), `paragraph` (no splitting), `spaces` (every space
   splits) — the last two as bounds. `bench:units [--gold <file|dir>] [--text <file>]`.
5. **Boundary sensitivity probe** (`bench:units --sensitivity <file.txt>`): import the same text into two memory
   stores under two segmentations (adapter vs paragraph-as-unit; use explicit `sentences` in the v2 document to
   force a segmentation), replay the same reading (every unit seen once with a dwell proportional to its words,
   through the real GoLearn), and report what moved: encounter counts per word form (how many forms differ, by how
   much), words per minute, lookups per 100 words, number of audio segments GoListen would cut. This quantifies
   how much a segmentation error can contaminate the learner's record. Run it on
   `test/integration/fixtures/thai-synthetic-book.txt` and on the Thai documents in `data/corpus/th/`.
6. Run the constructed set through `adapter` and write the table, every failing case and the guard figures into
   section 4 of `docs/thai/BENCHMARKS.md`. Do not fix the adapter: report.
7. Tests for metrics, converters, validator, guards, and the probe on a tiny text.

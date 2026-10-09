# Annex B — linguistic-engineering inventory (read-only audit, 2026-10-08)

Produced by a code-reading agent on HEAD 8dc86370 and reviewed by the lead. Nothing was edited or downloaded.
Measured counts come from an in-memory bundle probe (`esbuild --bundle | node`, stdin only) and from
`npx vitest run <paths> --reporter=json`. Lead's notes: the four headline findings were checked against the code
(the adapters' only outside imports are `../core` types, `LANGUAGES`, `decodeFor`, and `../shared`); the
classification in §(d) is the input to `../LEGACY-SALVAGE-AUDIT.md` §B.

## Headline findings

1. `src/adapters/**` is pure and I/O-free: 201 files, 47,872 lines. No import of store, course, ladder, stage0, db,
   dict or ingest; no `fetch`, `Date`, `Math.random`, storage or DOM use; only lazily built deterministic indices.
2. The adapters are already separable. The coupling is around them: the dictionary join in `src/ingest/plan.ts`, the
   word-sheet logic in `src/ui/reader/Reader.tsx`, and ~15 of 90 adapter test files that load the bundled corpus or
   ladder plans (703 of 4,691 tests, upper bound).
3. No native-speaker review exists for anything; every adapter `sources` entry is `reviewStatus: 'machine-drafted'`.
4. Tokenization depends on the runtime's `Intl.Segmenter` and ICU: the biggest portability risk, especially Thai.

## 1. Files, versions, analyzer ids

| Lang | Top-level file (lines) | Directory (files / lines) | Version / analyzer id |
|---|---|---|---|
| es | `src/adapters/es.ts` (810) | `src/adapters/spanish/` (22 / 5,460) | v12, `adapter-es@12` |
| de | `src/adapters/de.ts` (228) | `src/adapters/german/` (42 / 12,084) | v9, `adapter-de@9` (`german/context.ts`) |
| hi | `src/adapters/hi.ts` (663) | `src/adapters/hindi/` (48 / 9,748) | v6, `adapter-hi@6` |
| th | `src/adapters/th.ts` (514) | `src/adapters/thai/` (14 / 4,266) | v5, `adapter-th@5` |
| sq | `src/adapters/sq.ts` (191) | `src/adapters/albanian/` (37 / 7,273) | v9, `adapter-sq@9` (`albanian/version.ts`) |
| nb / nn | `nb.ts` (12), `nn.ts` (10) | `src/adapters/norwegian/` (29 / 6,057), shared `engine.ts` | v2 each |
| shared | `src/adapters/shared.ts` (523), `index.ts` (33); contract `src/core/adapters.ts` (259) | | |

Source ids per adapter: `adapter-<lang>@<v>:{hand,phrases,constructions,rules}` (Thai adds `orth-exceptions`).

## 2. The `LanguageAdapter` contract (`src/core/adapters.ts`)

Required: `lang`, `name`, `script`, `version` (bumped on any analysis change; becomes provenance), `support`,
`display`, `segmentSentences`, `tokenize` (exact UTF-16 offsets), `normalize`, `searchNormalize`, `analyze`
(candidates best-first with `lemma, pos, morph, notes, confidence, gloss, syllables, register, role, definition,
varieties, parts, origin, sourceId, unit, orthography, unconfirmed`), `detectPhrases`, `detectPatterns`,
`pronunciation` (`transliteration, ipa, ipaSource, notes`), `speechNormalize`, `checkProduction`, `relate`.
Optional: `decode`, `decodeWithPronunciation`, `orthFeatures`, `describeOrthFeature`, `morphFromTags`,
`varietiesFromTags`, `family`, `refine`, `lemmaVariants`, `describeMorph`, `varieties`, `sources`.

| | decode family | refine | lemmaVariants | morphFromTags | varietiesFromTags | family | describeMorph | varieties | sources |
|---|---|---|---|---|---|---|---|---|---|
| es | – | yes | yes | yes | yes | – | yes | 33 | 4 |
| de | – | yes | yes | yes | yes | – | yes | 8 | 4 |
| hi | yes | yes | – | – | – | – | yes | 3 (heritage) | 4 |
| th | yes | – | – | – | – | – | – | 0 | 5 |
| sq | – | yes | yes | yes | yes | – | yes | 11 | 4 |
| nb/nn | – | – | yes | yes | yes | yes | yes | 3 | 4 |

Implicit contract in `notes` keys consumed elsewhere: `nameGuess`, `unconfirmed`, `rule` ("abbreviation"),
`context`, `lemmaStatus`, `disputed`, `unverified`, `variantOf`, `modern`, `translit`, `respelling`, `ipa`,
`pronunciationSource`, `source`, `components`. A pack specification must write these down.

## 3. Lexicon (static TypeScript, parsed at module load; nothing fetched)

| Lang | Measured size (probe) | Provenance flags |
|---|---|---|
| es | 1,812 lemmas (NOUN 863, VERB 358, ADJ 210, PROPN 132 …); 70 with variety tags | source-level machine-drafted only |
| de | 1,476 nouns, 890 verbs (391 strong/mixed, 275 separable), 358 adjectives, 274 closed-class forms, 865 plain words | source-level only |
| hi | 2,974 lemmas (NOUN 1,572, VERB 480, ADJ 414 …) | source-level only |
| th | 1,692 entries (NOUN 465, PROPN 401, VERB 388 …); tone-exception lists in `orth-exceptions.ts` | source-level only |
| sq | 1,350 lexemes (NOUN 771, VERB 283, ADJ 162 …) + 187 function words + 262 plan + 183 bridge additions; 14,505 generated forms | `disputed.ts` is generated from five sources incl. UniParser (MIT), Wiktionary and two UD treebanks (CC BY-SA) |
| nb | 844 nouns, 347 verbs, 235 adjectives, 293 words, 6,601 forms, 71 names | every row `source: 'machine-draft'`; `unverified` per cell, confidence capped 0.8 |
| nn | 261 / 125 / 108 / 208; 2,438 forms; 23 names | same |

`docs/READINESS.md` counts are stale against the code. Cast and course names sit in the lexicons (`Sam`, `Nico`,
`Ana`, Thai `names.ts`): false proper-noun readings in a general reader.

## 4. Morphology and rule engines

es: morphology, regular/irregular/stem verbs, nominal morphology, clitics round-tripped, stress/accent, older spelling
(26 entries + rules, `es-hist`), 33 variety codes, `disambiguate.ts` (679), 24 constructions, 189 phrase units.
de: noun/verb/adjective/irregular/derived/guess morphology, compounds into known words with linking elements,
separated-verb units, NP agreement, sentence layer, older spelling (two periods), 38 constructions, 213 phrase rules.
hi: noun/pronoun/verb/causative/wala morphology, vector verbs, orthography variants, register layers, heritage
varieties, neighbour-rule ordering, 50 constructions, 608 complex predicates, 73 compound postpositions, 81 fixed
expressions. th: syllable/tone decoder (`orthography.ts` 1,269), segmentation repair, classifiers, names, 28
constructions, 65 phrase units, no inflection. sq: noun/verb/adjective morphology, clitic clusters (8 clitics, 19
clusters), sentence layer, Gheg and older-spelling relations, 11 varieties, 31 constructions, 81 phrase rules.
nb/nn: paradigm generators, compounds (0.55), particle verbs/reflexives as units (136 nb, 29 nn), older spelling
(91 listed), concept families (174 nb↔nn rows), 16 constructions.

## 5. Dictionary join

`public/dict/<lang>/` = kaikki.org Wiktionary extract, schema 3, FNV-sharded, CC BY-SA 4.0, manifests with
attribution, licence, `source.sha256`, `retrievedAt`: es 808,278 entries (58 MB), de 357,750 (41 MB), hi 38,635
(9.6 MB), th 20,254 (7.7 MB, schema 2), sq 91,271 (6.4 MB); nb/nn none (nb has `frequency.json` only). Runtime:
`src/dict/index.ts` fetch and memory sources implementing `LexiconSource`; browser-safe except `build-node`, `file`,
`frequency-node`. The reusable pure join in `src/ingest/plan.ts`: `dictionaryCandidates`, `decideByDictionary`,
`readByLemma`, `joiningReadings`, `lemmasToLookUp`, `dictionaryView`, `entryAppliesTo`; constants
CONFIRMED_BY_DICTIONARY 0.7, LEMMA_IN_DICTIONARY 0.6, BESIDE_CONFIDENCE 0.45, DECIDED_BY_CONTEXT 0.6, BESIDE_MAX 3.
Without a dictionary the adapter gives hand-lexicon and rule readings only; rule-only readings are `unconfirmed`,
capped ~0.6, no gloss. Spot probes adapter-alone: es `zapatería` → wrong verb guess; de `Zahnarztpraxis` → noun
unconfirmed 0.55; th `มหาวิทยาลัย` → none; sq `bibliotekave` → `bibliotekë` 0.85; hi `पुस्तकालयों` → 0.9.
Documented: Albanian words with no reading 15.6 % (fiction) / 21.0 % (Wikipedia) adapter-alone vs 8.0 / 12.9 % with
the dictionary; Spanish 1.0 % rule guesses and 1.2 % nothing on held-out Wiktionary examples with the dictionary.

## 6. Tokenization and segmentation

`makeWordTokenizer` wraps `Intl.Segmenter(locale, 'word')`; sentence splitting is rule-based per language. Hindi keeps
combining marks in tokens; NFC decomposes precomposed nukta letters so `ज़` ≠ `ज` as forms. Thai is ICU plus repairs
(19 re-joined compounds, pinned words, two repair pairs, two context splits, `ๆ`, ZWSP name marks); the result
depends on sentence context and on the ICU version. Offsets contract tested in `test/adapters/offsets.test.ts`.
`speechNormalize` is deterministic; number expansion nb/nn/th 0–999,999, hi 0–20 only.

## 7. Pronunciation

es/de/sq: notes only (dictionary IPA shown when present). hi: notes + ISO 15919 transliteration when unit confidence
≥ 0.6; no rule IPA. th: transliteration and per-syllable IPA with tone letters when sure; refuses to guess tone;
measured 0.82 % confidently wrong tones on a held-out half of 17,298 Wiktionary spellings. nb/nn: rule IPA
(`ipaSource: 'rules'`), East Norwegian reference, tone not claimed except three unverified pairs. GoListen voice
tables (`AZURE_VOICES`) are static and partly "from memory, unverified".

## 8. Production checks

es limited (agreement, conjugation, morphology; ~80 lines), de limited (7 categories; 625 lines), hi limited (5;
406 lines; only on vouched words), th limited (classifier, particle; ~40 lines), sq limited (8 categories incl.
dialect and register; 622 lines), nb limited (6 incl. dialect/register; 259 lines), nn none. Every adapter declares
`lemmatization: 'seed-only'`, `sentenceSegmentation: 'limited'`; tokenization `dependable` except Thai.

## 9. Coupling

Out of `src/adapters`: only `../core` (116 imports, all `import type` except `LANGUAGES`, `decodeFor`) and
`../shared`. The type slice pulls two course-flavoured items (`RegisterTag`, `SyllableAnalysis` in `core/course.ts`;
`core/model.ts` imports `CurriculumMetadata` from `course/curriculumPolicy`). Non-obvious: Thai `tokenize()` is
context-sensitive (a lone word tokenizes differently from the word in its sentence); sentence-layer disambiguation
needs neighbours. Consumers: ingest plan, golearn (fold, items, occurrences, personal, queries, recommend,
retrieval, orth), gotell, golisten (alignment, jobs, pipeline), stage0, ladder, library, authoring, sim, Reader;
deep imports from dict/compare, bench, alphabet, ~60 scripts.

## 10. Tests, fixtures, accuracy

4,691 adapter tests in 90 files, all green: es 409 (13 files), de 1,358 (13), hi 1,282 (24), th 503 (11), sq 909
(9), nb+nn 129 (10), shared 101 (5); ingest dictionary-join + guesser 181 (7); `test/dict` 232 (14).

| Lang | Set | Result | Status |
|---|---|---|---|
| de | `data/benchmarks/de/gold*.json` (R1 84, R2 35, R3 48, R4 21 sentences) | R4 (native prose, Kafka, never tuned on) 13/21 sentences, 377/393 facts (95.9 %) | judged by an AI model, not a native speaker |
| nb/nn | blind holdout `norwegian-holdout.test.ts` (50 + 15 sentences, written without the lexicon) | nb lemma 98.03 %, POS 99.51 %; nn 94.92 / 100 % (first run before a fix: nb 94.58 / 93.84 %) | three deliberate convention differences |
| es | Wiktionary-marked words (7,649) | first reading correct 92.65 % (82.1 % of ambiguous) | judge = the dictionary the pipeline uses; quoted from docs |
| hi | `gold-draft.jsonl` 189 drafts, 0 accepted | nothing measured against a human | |
| th | segmentation on 3,116 Wiktionary examples | boundary F1 90.27, word F1 80.86, 61.26 % sentences exact (PyThaiNLP newmm 89.97; dictionary max-match 96.56) | gate not met |
| sq | UD_Albanian-STAF / TSA | boundaries F1 99.8 / 99.3 %; first-reading lemma 64.2 / 67.7 %, POS 63.4 / 63.1 % (with dictionary); Gheg 33.7 % unread | treebank not ground truth; gold 0 reviewed |

Fixture provenance: most adapter tests use author-written sentences; bundled corpus texts loaded by ~15 adapter
tests include Reina-Valera 1909 and Luther 1912 (PD), Grimm via Wikisource (CC BY-SA transcription), IRV Hindi
(CC BY-SA 4.0), and Thai/Albanian/Norwegian Bible samples marked "not for release"; German gold R3/R4 quote Kafka (PD)
via Wikisource; Hindi tests quote the IRV John 3:16 line (CC BY-SA). No modern copyrighted author found.

## 11. Shared infrastructure

`src/adapters/shared.ts` (tokenizer, sentence split, `morph()` parser, `Lexicon`, `lexiconAnalyze`, phrase rules,
`speechNormalizeGeneric`), `src/core/ids.ts` item ids (`lemma:`, `form:`, `phrase:`, `pattern:`, `orth:` must be
shared with GoPractice; the course ids are not), `src/golearn/analysis.ts` pure rules (`pickAnalysis`,
`creditableLemmaId` with LEMMA_MIN_CONFIDENCE 0.5, `morphologyLine`), `src/ingest/language.ts` `guessLanguage` /
`guessScandinavian` (pure; Danish rejected; `fitsTeamLanguage` is team-coupled), `src/dict/frequency*.ts` (corpus
frequency, Scripture-heavy for hi/th/es/de), `src/stage0/lang/index.ts` sound tables (Stage 0 only).

Bundle measurements (esbuild, minified / gzip): es 178 / 63 KB, de 339 / 116 KB, hi 520 / 129 KB, th 229 / 60 KB,
sq 213 / 69 KB, nb+nn 170 / 60 KB; all adapters 1.62 MB. Module load +150–250 ms; first-call index build sq 56 ms,
de 174 ms; warm analyze + patterns per sentence 0.04–0.37 ms.

## (a)–(e) Pack contents, extension interface, course-only parts, classification, unverified

(a) A pack carries: the adapter code + `shared.ts` + a standalone type slice (extracted from `core/model.ts`,
`core/course.ts`, `core/adapters.ts`, cutting the `course/curriculumPolicy` link); its data is already inside the
sources; optionally the dictionary shards and frequency as separately licensed files; a manifest with lang, versions,
contract version, ICU requirement, `support`, `limitations`, `sources`, `varieties`, dictionary id/licence, item-id
convention. Licences: original machine-drafted code and data (say so); dictionary CC BY-SA 4.0 with attribution and
share-alike; Albanian `disputed.ts` and some Wiktionary-referenced rows have unresolved share-alike status.
(b) Extension interface (all pure, synchronous): `tokenize(sentenceContext)`, `analyze`, `refine`, `lemmaVariants`,
`morphFromTags`, `varietiesFromTags`, `describeMorph`, `detectPhrases`, `detectPatterns`, `pronunciation` + decode
helpers, `relate`, `family`, `varieties`, `sources`, `support`; plus, outside the adapter, the dictionary join from
`plan.ts`, `pickAnalysis`/`creditableLemmaId`, and page-level `guessLanguage`. The extension must pass the sentence,
not a lone word, to `tokenize`.
(c) Course-only: `src/ladder/**`, `src/stage0/**`, `src/course/**`, `data/ladder/**`; cast names in lexicons; ladder
counting; `fitsTeamLanguage`; ~15 corpus-dependent adapter test files (703 tests upper bound).
(d) Classification: KEEP es, de, sq, nb/nn, hi (carefully), `shared.ts`, dict format/loader, `analysis.ts` pure
functions, `guessLanguage`, item ids, benchmarks as dev assets; ADAPT th (tokenizer: consider dictionary max-match),
the type slice, the `plan.ts` join, voice tables, `speechNormalize`, `checkProduction` (to the practice side);
REBUILD the Reader/TokenCard word-sheet logic as a pure card model; RETIRE ladder/stage0/course modules (keeping the
`unconfirmed`/`nameGuess`/abbreviation conventions in the pack contract); UNKNOWN Stage 0 sound tables, `family()`
and `searchNormalize()` consumers.
(e) Not verified: any linguistic correctness against a human; docs' accuracy figures not re-run; browser behaviour
(all on Node/ICU 78.3); single-word no-context accuracy; the full suite; which lexicon rows derive from Wiktionary/UD;
word-sheet logic in full; dictionary runtime cost in an extension; standalone compilation of the type slice.

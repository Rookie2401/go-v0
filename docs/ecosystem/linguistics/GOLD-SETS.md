# Gold sets and the scorer (Linguistic Engine V2, Stage 8) — 2026-10-10

**Honesty first.** Every label in these files was written by an AI model (Claude) and has not been checked by a native speaker. A score
here is *agreement with an AI annotator*, not correctness. The labels were written without running the analysers on the items and without
reading engine output; the engine was not tuned to them and must not be (the `unseen` sets are never a tuning target at all). Where the
engine and the labels disagree, either may be wrong: the error classes in `GOLD-REPORT-2026-10-10.md` mix real engine errors with
differences of convention (e.g. Spanish articles labelled lemma `el`, `haber` VERB vs AUX, Nynorsk `segje` vs `seie`).

## The sets (`data/gold/<lang>/`)

| file | what | sentences from | purpose |
|---|---|---|---|
| `selections-dev.json` | contextual word selections, each with sentence, offsets, surface, lemma, POS, features, UD relation, difficulty, ambiguity flag | `data/corpus/<lang>` (course texts); every k-th word over the pool, at most 3 per surface form while the pool allows; `bible-*` slices excluded (nb/nn: the whole 21-sentence corpus plus the sentence text of `test/adapters/norwegian-gold-data.ts`; sq: the four latest-listed texts are held out for `unseen`) | measure; `purpose: dev` |
| `hard.json` | authored hard cases: expected analysis, the wrong analysis a naive engine would give, `why_hard`, `category`; Thai items carry `expected_segmentation` | sentences written for the set | stress classes (ambiguity, irregulars, clitics, compounds, separable verbs, voseo, ergative, segmentation traps, double definiteness, linking articles ...) |
| `unseen.json` | held-out selections | es, de, hi, th: `data/verified/scripture.json` (RV1909, Luther 1912, IRV Hindi 2019, Biblica OTCV 2025), verses spread over the canon, chapters not used by the corpus slices. **sq: no verified slice** - the four latest-listed course texts (udha-1-06/07/08, misioni-1-04). **nb, nn: no verified slice and a 21-sentence corpus** - the sentences of the blind holdout in `test/adapters/norwegian-holdout.test.ts` (annotations ignored, relabelled independently; nn has only 15 distinct sentences) | never used for tuning; `purpose: unseen` |

Every file starts with `{"language","labelled_by":"Claude (AI-judged, unreviewed; no native speaker)","created":"2026-10-10","purpose","source","feature_keys","notes"}`.
`feature_keys` lists the UD-style keys the labeller covered; the scorer scores only those.

Sizes (items):

| | sq | es | de | hi | th | nb | nn |
|---|---|---|---|---|---|---|---|
| dev | 215 | 215 | 215 | 215 | 214 | 215 | 215 |
| hard | 70 | 82 | 72 | 68 | 74 | 73 | 76 |
| unseen | 70 | 80 | 80 | 80 | 80 | 70 | 70 |

Labelling method: the sampler (`scripts/gold-build.mts sample`) cut the selections with the adapter *tokenizer only*; one Claude Sonnet annotator per
language labelled lemma / POS / features / relation / difficulty / ambiguity from its own knowledge (brief: lemma conventions from
`PARADIGMS-<lang>.md`) and authored the hard cases; `gold-build.mts merge` joined labels to the samples, computed offsets and validated.
Thai: where the tokenizer cut a word, the annotator gave the whole word (`span`), so the gold selection can differ from the engine's token
(`gold word = one engine token` reports how often it does not). The annotators' per-language convention notes (which a reviewer should check first)
are summarised under "What a native review would need to change".

## Running the scorer

```
npx vite-node --config scripts/vite.config.ts scripts/gold-score.mts [--langs sq,es,de,hi,th,nb,nn] [--set dev|hard|unseen|all] [--limit N] [--out file.json] [--md file.md] [--report]
```

`--report` writes `GOLD-REPORT-2026-10-10.{md,json}` in this folder. A full run (7 languages, 3 sets) takes about 10 seconds. The scorer runs the real
`parseSelection` (what the card shows) and, for the candidate list, the adapter's own `analyze`; the dictionary half uses the real pack runtime over the
schema-3 shards in `public/dict`, read from disk. Library: `scripts/gold-lib.mts`. Builder: `scripts/gold-build.mts`. Tests: `test/gold/<lang>.test.ts`
(structure of the three files; measured floors on dev and hard; dictionary floors skipped when the shards are absent).

## The metrics

1. **lemma accuracy** - the card's lemma equals the gold lemma (NFC, case-folded).
2. **POS accuracy** - the card's POS equals the gold POS.
3. **feature precision**, 4. **feature recall**, 5. **feature F1** - over `(key, value)` pairs of the *top* reading, restricted to `feature_keys`; a pair is correct only on an exact value match (headline = strict; the JSON also has a lenient variant where a union value such as `1,3` containing the gold value counts). Gold lists the complete set of features a careful annotator would assign, so an extra engine feature counts against precision. Per-key tallies are in the JSON.
6. **role / relation accuracy** - (a) *syntax*: the UD relation `adapter.syntax` (other lanes) gives the selected token vs gold `relation`, when the adapter has `syntax`, else `n/a`; (b) *role*: the parser's `role` is a functional-word label ("preposition", "question word"), not a relation, so only labels with an unambiguous UD counterpart (preposition→case, negation→advmod, article→det ...) are compared, and the share of selections that get any role is given; (c) *UAS/LAS* against `data/gold/<lang>/syntax-dev.json` (that lane's file; the reader accepts its `tokens/heads/relations` layout) when the file exists and the adapter has `syntax`.
7. **paradigm round-trip share** - for up to 150 distinct gold lemma+POS pairs: `adapter.paradigm(lemma, pos)`; each cell's form is analysed again; a cell counts when some reading has the gold lemma and, for every cell feature (key `Variety` ignored), the value (or a union containing it). "lemmas" = lemmas with any paradigm / lemmas tried. Thai has none (`n/a`).
8. **dictionary hit rate** - the engine's lemma has senses in the dictionary (`runtime.gloss`).
9. **definition availability** - dictionary senses *or* a word-list gloss (the probe's measure).
10. **etymology availability** - the full record (`runtime.entry`) has `ety`.
11. **IPA availability** - the full record has `ipa`. Metrics 8-11 are measured on the *engine's* lemma, as the card asks, over all scored selections (no lemma = a miss). nb/nn have no shards: `n/a`.
12. **alternatives-kept rate** - among items flagged ambiguous (`ambiguous: true`, or hard category "ambiguity"), the share whose gold lemma+POS appears among the adapter's candidates (top or alternative); "top reading right" is the share where the top reading is already right. **conflict rate** - the share of all items where the top reading's lemma+POS disagrees with gold while *another candidate* agrees (the right answer was available but not chosen).
13. **latency** - ms per selection: `parseSelection` + dictionary `gloss` + `entry`.

(Precision, recall and F1 are one metric family; the table has 14 rows because alternatives-kept and conflict are separate rows.)
Also reported: lemma+POS both right, "gold word = one engine token", on hard sets the share where the engine gave the *naive wrong analysis*, and Thai segmentation exact match on the `expected_segmentation` items.

## Floors (the tests)

A floor is the number measured on 2026-10-10 minus two points (a ceiling: plus two); it guards against regression and certifies nothing.
Source of truth: `test/gold/floors.ts`. Never edit a floor to make a test pass: re-measure and say why the engine moved.

| lang | dev lemma | dev POS | dev F1 | dev conflict max | hard lemma | hard POS | hard F1 | hard conflict max | token-aligned | round-trip | dict hit | definition |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sq | 92% | 87% | 84% | 4% | 80% | 83% | 81% | 5% | 98% | 87% | 93% | 98% |
| es | 93% | 91% | 87% | 2% | 96% | 90% | 94% | 4% | 98% | 96% | 98% | 98% |
| de | 94% | 95% | 80% | 4% | 93% | 92% | 88% | 4% | 98% | 93% | 97% | 97% |
| hi | 92% | 88% | 80% | 4% | 96% | 75% | 90% | 5% | 98% | 78% | 96% | 98% |
| th | 82% | 71% | 0% | 2% | 61% | 50% | 0% | 7% | 89% | 0% | 82% | 83% |
| nb | 94% | 97% | 74% | 5% | 70% | 82% | 67% | 16% | 98% | 95% | 0% | 0% |
| nn | 84% | 93% | 83% | 5% | 66% | 80% | 76% | 6% | 98% | 80% | 0% | 0% |

(Thai: no features and no paradigm, so its F1 and round-trip floors are 0. nb/nn: dictionary floors are 0 and the dictionary tests are skipped.)

## What is n/a, and why

- **Syntax relation, UAS/LAS**: depend on `adapter.syntax` and `data/gold/<lang>/syntax-dev.json`, written by other lanes; whatever existed when the report was generated is scored, the rest reads `n/a` (sq and es had no `syntax` at that time). The nb/nn syntax gold is that lane's own and its sentences overlap the dev corpus, so those numbers say nothing about held-out syntax.
- **Dictionary / etymology / IPA for nb, nn**: no schema-3 shards exist (`public/dict/nb` holds only a frequency list).
- **Paradigm round-trip for Thai**: Thai does not inflect.
- **Feature P/R for Thai**: no morphological features; gold marks a handful of aspect/polarity markers, so recall is 0 and precision n/a.
- **Verified Scripture for sq, nb, nn**: none exists; their unseen sets are NOT unseen in the strong sense (sq: course text the word list was drafted against; nb/nn: an independent but tiny blind holdout).

## What a native review would need to change

- Every label. Expect systematic *convention* disagreements first: lemma conventions (Spanish/Albanian clitics and articles, Hindi compound-verb vectors AUX vs VERB, German separable-verb particles and noun gender in features, Norwegian pronoun and possessive features, Nynorsk verb-class lemmas), Albanian case after prepositions, Thai word boundaries (compounds vs verb+object; Biblica's U+200B marks), and the POS of function words (ja, haber, nuk, the "that"-words).
- Annotator-flagged doubts to check first: es participle vs adjective (`mojado`, `podridas`/`comidas` inconsistent); de noun features carry no Gender, `möchte` as Konjunktiv II of `mögen`, `Sie` Polite; hi `Polite=Form` (the engine may use another value), `Case=Dir/Obl` calls on feminine nouns, vector AUX; th classifier vs noun, `ที่`/`ให้` senses; nb `verden` gender, possessive features; nn `PronType` on function words, `ævelig`; sq verb lemma = 1sg present, non-active lemmas in `-em`, case after `pas`/`me`.
- UD relations (best guesses everywhere; no heads in the dev files).
- The hard sets' "wrong analysis": confirm each is a plausible naive reading and that the expected analysis is unambiguous in its sentence.
- The `ambiguous` flags (set from the bare surface form).
- Then replace the honesty note in each file header with the reviewer and the date.

# repository-linguistics

Layer A of the Go Repository: linguistic knowledge about a language, independent of any learner. It turns a selected
word (with its sentence when there is one) into typed units, typed relations and a `FormAnalysis` that keeps every
reading, and it stores them through the contract's `LinguisticStore` port. It never sees a learner's performance.

Imports: the contract (`../../repository-contract/src`), `src/adapters/sq.ts` and `src/core` types. Nothing else.

## API

- `resolveSelection({ languageId, surface, sentence?, sentenceKey?, selStart?, selEnd?, now })` is pure and never throws.
  It returns `{ formId, units, relations, analysis, coverage: { known, notes } }`.
- `createLinguisticService(store, { now })` gives `resolveAndStore`, `lookup`, `invalidate`, `correct`, `migrate`, `coverageGaps`.
- `statusFor(candidate, all, opts)` is the single place that decides a status.
- `albanianPack()`, `genericPack(languageId)` describe what a pack covers.

## Id scheme (from the contract's `unitIds`)

| unit | id |
|---|---|
| lexeme | `lemma:sq:libër:NOUN` |
| form | `form:sq:librin` |
| sense | `sense:sq:libër:NOUN:1` |
| morph construction | `morph:sq:NOUN:Case=Acc\|Definite=Def\|Gender=Masc\|Number=Sing` |
| multiword | `phrase:sq:a_b` |
| pronunciation pattern | `pron:sq:sq-standard:ë` |
| analysis | `analysis:<formId>@<sentenceKey or none>@<analyzerId>` (corrections: `…@correction:<by>:<time>`) |

## Status rules (`statusFor`)

1. `verified`: only when the adapter source's `reviewStatus` is `native-reviewed` (never, today), or the reading is a reviewer's correction.
2. `conflicted`: two readings with a different lemma or different features are both within 0.15 of the top confidence.
3. `high-confidence`: provenance is the hand lexicon or a dictionary, confidence >= 0.85, and no other reading within 0.15.
4. `provisional`: everything else (a rule-derived reading, an unconfirmed guess, confidence below 0.85).
5. `invalidated`: never from the resolver; only `invalidate` / `correct` produce it, and the row stays.

A consequence worth knowing: an inflected form such as `librin` is produced by the word-form rules (origin `rule`), so it
is `provisional` even though its lemma is in the word list. Only listed headwords and listed forms reach `high-confidence`.

## Service behaviour

- `resolveAndStore` writes only what is new: a stored unit is replaced only by a strictly higher status (never a superseded
  or invalidated one), relations already stored are not written again, an existing analysis is never rewritten (so an
  invalidated or corrected analysis is not resurrected).
- `invalidate` keeps the row and returns the lexemes and constructions its candidates pointed at, for the engine to find affected review items.
- `correct` adds one single-candidate analysis (learner: 0.6, provisional; reviewer: 0.95, verified), invalidates the form's live
  analyses (optionally only one sentence's) with the reason, and adds the lexeme / construction units it names if they are absent.
- `migrate` writes `UnitAlias` rows (`certain` at confidence >= 0.9, else `uncertain`), sets `supersededBy` on stored old units,
  deletes nothing; a change without `newId` is only reported as unmapped.
- `coverageGaps` returns notes for ids with no stored unit or a provisional / conflicted one.

## Limits

- Albanian only. Any other language, or a selection with no Latin letter, yields one provisional `form` unit (provenance `parser` / `generic`, 0.1).
- Everything is machine-drafted; no native speaker has checked the word list, the rules or the phrase list.
- There is no dictionary: a sense is the course's short gloss. A word outside the list gets an unconfirmed lemma guess and no gloss.
- Several selected words are resolved only when a phrase entry covers them all; otherwise only the form is recorded.
- The number of lexemes is read from the adapter's own limitation text (the adapter does not export its list); forms and constructions are not counted.

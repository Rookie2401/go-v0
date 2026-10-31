# Morphology-aware GoReview meanings

## Root cause

GoReview's facts provider had one `glosses` list for both lexical entries and inflected forms (`packages/goreview/src/facts/review-facts.ts`). Lemma facts correctly put the word-list gloss first. Form facts read the same lemma gloss and passed it to the exercise builders as the answer key (`packages/goreview/src/facts/provider.ts`, `packages/goreview/src/exercises/shared.ts`). For a Greek form such as **ἀγαπήσεις**, the dictionary headword gloss **“I love”** could therefore be accepted for a second-person future form.

Passing a surface form to the dictionary runtime alone did not solve this: `PackRuntime.gloss` can follow a `form-of` link and return the headword meanings with `via` metadata (`packages/language-packs/src/runtime.ts`). Those meanings remain lexical evidence, not a translation of the selected inflected form.

The review warm-facts cache also keyed entries by language and unit but omitted the target variety (`packages/goreview/app/engine.ts`). Period-specific facts could consequently be reused for another variety.

## Correction

- GoReview now projects separate lexical, inflected, and contextual meaning lanes with `projectWordAnalysis` (`src/core/word-analysis.ts`). The projection does not infer an inflected or contextual meaning from a lexical gloss.
- Lemma cards retain their word-list and dictionary meanings. Form answer keys use a supported per-form analysis when available (including the bounded Greek entries in `src/adapters/greek/word-analysis.ts`); exact-surface dictionary senses are considered only when they do not follow a `via` headword fallback. The lemma gloss remains available in the structured lexical lane but is not accepted for a form.
- For finite verbs explicitly analysed as second or third person, first-person dictionary glosses are rejected. When no supported inflected meaning remains, meaning exercises refuse the form rather than asking against a mismatched lemma gloss. Other morphology exercises can still use its features.
- The warm-facts cache now includes target variety, and exercise availability carries that variety through facts lookup and exercise construction.
- GoReview reads Repository facts and analyses without rewriting them; the patch does not mutate review events or scheduling history. No event, deck, or session-storage migration is performed. A prompt already built in the current app process may remain in memory until the session rebuilds it; persisted session state stores the plan and presentation marker, not a copied answer key.

## Validation

Regression coverage checks that **ἀγαπήσεις** with second-person singular future features rejects **“I love”** as its answer and uses the supported **“You will love”** inflected meaning while leaving **“I love”** in the lexical lane. Albanian form tests cover exact-form dictionary lookup and stored-unit preservation. Cache tests verify facts are not reused across varieties. Exercise-builder tests that need an Albanian form meaning now supply one explicitly as fixture evidence instead of inheriting a lemma gloss.

Validated with:

```text
npx vitest run test/goreview/exercises/facts.test.ts test/goreview-app/performance.test.ts test/goreview-app/real-engine.test.ts
```

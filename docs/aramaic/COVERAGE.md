# Scope and coverage

The declared corpus is two passages, Daniel 2:4b (qere path) and Daniel 2:20: 26 source word occurrences and 21 distinct source lemma identifiers. It is not the complete Biblical Aramaic corpus.

The compiled seed is derived from these same occurrences. Matching them measures source-fixture agreement, not generalization to unseen prose. No independent held-out morphological accuracy has been established. A test passing all source fixtures would not prove complete grammatical support.

A Biblical Aramaic milestone remains incomplete until the remaining Biblical passages are acquired, their text and morphology validated, and unseen/source-disagreement fixtures independently assessed.

## Morphology
The slice contains nouns (masculine/feminine, singular/plural, construct/absolute/determined), source-supported affixes and pronominal suffixes, Peal imperatives/participles/prefix forms, and Pael prefix/passive-participial forms. It does not exercise every combination. The shared decoder knows further source codes; that is not validated Aramaic paradigm support.

דִּי has both relative-particle and conjunction readings. Outside exact-source context these remain ambiguous. An unpointed query has inferred vocalization and lower confidence. Unknown words receive no fabricated analysis.

## Vocabulary repetition and readiness
These two passages provide only a demonstration: עָלַם recurs in different number/state forms, and אֲמַר recurs as imperative and participle. This does not constitute a curriculum from zero to independent reading. The normal GoLearn reader tracks encounters and calculates learner-aware coverage. Lexical coverage is not comprehension.

## Remaining work
1. Independently assess the first slice, including the browser and native app interfaces on real devices.
2. Expand Biblical Aramaic source coverage to Daniel 2:4b–7:28, Ezra 4:8–6:18 and 7:12–26, Jeremiah 10:11, and the two-word Aramaic name in Genesis 31:47.
3. Add a real script/pronunciation pathway, labelled and reviewed instructional bridges, deliberate recurrence measurements and a substantially longer reading ladder. The current orientation is a short introduction.
4. Add verified roots, paradigms, weak verb coverage and held-out annotations before claiming those features.
5. Add Targumic modules only with dialect-specific lexical/morphological data, fixtures and exact-edition licensing.
6. Add syc/Syrc as a distinct Classical Syriac module, with its own script pathway and tests.
7. Add lexical cognate relationships without transferring learner mastery, correction-persistence UI, and optional pointed/interlinear displays after validation.

No Ecclesia dependency was added. No new SRS or learner store was created.

## Executed first-slice measurements

GitHub Actions focused job on commit 8440ccd45e63e9496ed58e8474dd92c6f9fbfbb8 passed all 19 focused tests, the source/repetition report and the browser analyser build. The full regression check is reported separately.

| Passage | Source words | Resolved | Unresolved | Tokens retaining alternatives | New lemma/POS identities |
| --- | ---: | ---: | ---: | ---: | ---: |
| Daniel 2:4b | 8 | 8 | 0 | 0 | 8 |
| Daniel 2:20 | 18 | 18 | 0 | 3 | 14 |

There are 21 distinct source lemma identifiers and 22 lemma/POS identities (the connective has different source roles). Source-fixture agreement was 26/26, with no source-code disagreement; this is not held-out accuracy. Nineteen lemma/POS identities occur only once in this tiny sequence.

The existing transition analyser rates the jump high: 83% of destination lemma tokens are absent from the previous passage, and length rises 2.25 times. Clause/construction difficulty remains unmeasured. These results identify the need for bridges and broader recurrence rather than claiming this is a complete acquisition course.

Reproduce: `npx vite-node --config scripts/vite.config.ts scripts/arc-report.mts`.

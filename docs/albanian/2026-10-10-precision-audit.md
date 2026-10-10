# Albanian precision audit — 2026-10-10

This is an inventory and a narrowly scoped correctness audit, not a claim that the Albanian adapter or its definitions are complete or native-speaker reviewed. The adapter documentation says its hand-built lexicon and grammar rules are machine drafted and not checked by a native speaker.

## What is covered by the built data

Reproduce the counts and target dictionary records from the repository root with:

```powershell
npx vite-node --config scripts/vite.config.ts scripts/sq-precision-audit.mts
```

The script reads the active built Albanian dictionary shards under `public/dict/sq/full` and the adapter lexeme/construction inventories. It reports 1,352 adapter lexemes: 819 nouns and names, 164 adjectives, 283 verbs, and 86 other items. All have a gloss; every noun/name has gender and a definite form; all 31 listed constructions have an explanation and example. Seven verbs omit at least one of class/aorist/participle principal-part fields (the auxiliary and highly irregular `jam`, `kam`, `dua`, `them`, `vij`, `bie`, `iki`). Of 110 articulated adjectives, two have no differing feminine/plural form explicitly listed (`vetëmlindur`, `fundit`). These are inventory checks only; they do not validate the correctness or completeness of the glosses and paradigms.

The active dictionary manifest is `kaikki-sq@2026-09-28`, with 91,271 indexed entries and attribution to Wiktionary via kaikki.org under CC BY-SA 4.0. In its full records:

- `vuaj` is a verb with intransitive “to suffer, to feel pain” and transitive “to suffer, to endure”; its listed participles include `vuajtur` and `vuar`. There is no standalone `vuajtur` headword record in these shards.
- `kënaq` is a transitive verb glossed “to make (someone) happy; to fulfill a wish; to gratify, please, satisfy”, with `kënaqur` among its participle forms. `kënaqem` also has `kënaqur` as a participle and the reflexive sense “to be pleased, rejoiced”. There is no standalone `kënaqur` headword record.
- The built dictionary has no headword records for `vuejtun` or `kënaqun`.

The adapter therefore uses its own two exact Gheg correspondences to connect `vuejtun` to `vuajtur` and `kënaqun` to `kënaqur`, and its adjective inventory supplies articulated adjective readings/glosses for those standard forms. This is not a productive `-un` spelling rule. In the title “Sokrat i vuejtun apo derr i kënaqun”, selecting `vuejtun` yields the articulated adjective card `i vuajtur` (“suffering”); selecting the linking article yields the same lexical unit. The written tokens remain unchanged. The title is evidence for those spellings in that literary context, not evidence that every Gheg participle should be treated the same way.

## Validated behavior change

The sentence layer previously built a linking-article/adjective unit from the exact Migjeni participles even when an overt head noun's article form had no compatible noun reading, such as masculine singular `djali e vuejtun` or plural `djemtë i kënaqun`. The adapter now leaves the listed literary participle and article as separate readings in these mismatches; a compatible title-style phrase without an overt head still forms the unit. This exception is restricted to the two exact participle correspondences and preserves the separate production checker’s existing agreement diagnostics for other adjectives.

New tests cover the title tokenization and selected card, arbitrary unlisted `-un` negatives, standalone participle readings, article/head mismatch negatives for both exact correspondences, and known adjective agreement features across gender, number, and case. The case union `Gen,Dat,Abl` is retained where the adapter does not distinguish those readings.

Primary references used narrowly: [Migjeni’s title listing at Fletoret](https://fletoret.com/migjeni/) supports the two literary spellings; the [University of Tirana article on Albanian adjective phrases](https://unitir.edu.al/en/sintagma-mbiemore-ne-gjuhen-shqipe/) and the linguistic study [Some notes on adjectival articles in Albanian](https://www.sciencedirect.com/science/article/pii/S0024384108002076) describe agreement of the adjectival article. Neither is taken as authority for a general Gheg conversion rule.

## Validation and limits

The complete Albanian adapter and morphology/course integration set passed: 15 files, 1,298 tests. Separate GoLearn/GoTell E2E runs encountered 11 failures across 2 E2E files involving app/service connection and unrelated draft-analysis fixtures; they are outside the adapter/integration set and need a separate baseline comparison. No dictionary source records or built shards were changed.

Still unvalidated: native-speaker judgments for adapter glosses and all generated grammar notes; Gheg correspondence beyond the two title spellings; broad dictionary sense alignment; exception and regional coverage; full accuracy of all 1,352 lexemes and 31 constructions. Treat the numeric inventory as a useful coverage baseline, not a completeness score.

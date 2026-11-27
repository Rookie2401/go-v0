# Russian and French GoLearn card audit — 20 November 2026

Scope: the current browser extension, its Russian and French analyzers and language packs, and the shared card for the other installed languages. This is a source and automated-test audit; it does not measure a learner's production account or a browser extension installed on another device.

## Reading path

The extension loads the language's analyzer on demand. For Russian it also prepares the `ru/standard` form-index shards for the selected sentence before parsing. French loads its larger derived lemma list on demand. The extension parser selects a reading, takes its `morph` feature bundle and the adapter's `describeMorph` result, and passes both to the popup. The worker supplies the pack's plain-language feature labels and explanations later. A dictionary gloss is a separate later request; lack of a gloss does not imply lack of morphology.

| Language | Findings | Limitation |
| --- | --- | --- |
| Russian | A core noun (`книгу`) and adjective (`новую`) retain case, number and gender through the parser and popup. The noun also retains animacy. The pack supplies labels for these features and for person, tense, aspect, mood, verb form, voice, degree and reflexive forms. | Words outside the compiled core need their form-index shard; if loading fails, analysis may be guessed from an ending or unavailable. Ambiguous readings remain possible. No native-speaker review is recorded. |
| French | A participle (`arrivée`) retains verb form, tense, gender and number, plus the detected compound-tense and agreement constructions. The derived lemma list can confirm a word missing from the hand core (`abdiquons`), but its meaning still needs the dictionary. | Unknown words may remain provisional; some ambiguous readings cannot be decided from local context. The pack is experimental and unreviewed by a native speaker. |

## Defects found and addressed

1. In every language, the popup placed the feature list under a second `analysis` disclosure within `Go deeper`. Opening `Go deeper` now shows a compact “Grammatical features” list under Form. Each feature's longer explanation remains behind its own disclosure. The initial word card stays compact.
2. The extension parser had no fallback when an adapter's `describeMorph` returned an empty result or threw. It now uses the existing generic morphology formatter, preserving the analyzer's part of speech and feature bundle. The fallback is shared across language packs.
3. Russian `describeRuMorph` returned early for finite verbs, infinitives and participles before including `Reflex=Yes`. The form line now includes “reflexive” for each such branch when the analyzer supplies it.
4. French participles shared a `Tense` label with finite verbs. For `VerbForm=Part`, the pack response now says “past participle” or “present participle” rather than the finite-tense phrasing.
5. The French orientation understated the hand lexicon at 2,500 lemmas; it now agrees with the approximately 3,400 lemmas reported by the adapter and pack. A TypeScript inference error in the existing GoReview account view was corrected to let the project typecheck complete.

## Other languages

The same popup and parser carry every installed language's `morph` feature bundle. The new one-click feature display and fallback therefore apply to Albanian, Spanish, German, Hindi, Thai, Norwegian Bokmål and Nynorsk, Latin, Hebrew, Greek and Aramaic as well as Russian and French. A feature can only appear when its analyzer supplies it. The new generic fallback does not replace language-specific descriptions when those descriptions exist. Thai relies on the fallback because its adapter does not supply `describeMorph`.

## Verification

Focused tests cover parser-to-popup Russian and French readings, the worker's feature explanations, the shared card and layer behavior, fallback descriptions, and Russian reflexive verb forms. These tests use local fixtures and do not establish the accuracy of every dictionary entry. The existing pack evaluations in `docs/russian/EVAL.md` and `docs/french/EVALUATION.md` measure the analyzers on separate held-out material; they were not rerun for this display change.

The extension build succeeded. In a clean source worktree the generated form-index assets are absent, so the build warns and uses compiled cores. A second build with the existing generated Russian shard assets available included `dist/lexicon/ru/standard/manifest.json`. Greek and Hebrew shard sets were unavailable in this local build; a release that needs their full form indexes must provide those assets before building. This audit did not republish an extension package to a user's device.

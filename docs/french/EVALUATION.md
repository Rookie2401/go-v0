# French pack: what was measured

Everything here was run on the branch `feat/french-pack`; the counts behind the treebank figures are in `EVALUATION.json`
(written by `scripts/fr-eval-ud.mts --json`), and `test/language-packs/french-evidence.test.ts` fails if the pack's stated
evidence drifts from that file. No native speaker has reviewed the pack, the test sentences or any judgement below: every
expectation that is not a treebank's or a dictionary's is an AI's.

## 1 The engine against the dictionary (single forms, no sentence)

`scripts/fr-eval-morph.mts`: every inflected form the Wiktionary extract lists (300,000 form-of statements, written by other
people), lemmas split by hash into dev / dev2 / final; the final third was run once.

| final third (81,444 forms) | result |
|---|---|
| the dictionary's lemma is among the engine's readings, lemma known | 99.38 % (verbs 99.48, nouns 98.70, adjectives 99.22) |
| the same by rule alone, no word list | 98.12 % (verbs 99.22, nouns 97.55, adjectives 87.94) |
| the features contradict the dictionary's labels | 0.04 % |
| by tense (lemma / features): passé simple | 99.55 / 99.98 |
| imperfect subjunctive | 99.57 / 99.90 |
| present indicative | 99.01 / 99.88 |

"Lemma known" there means the dictionary's own headwords, which is generous; the rule-alone row is the strict one.
Not conjugated (left out rather than guessed): about thirty rare or defective verbs (ouïr, seoir, gésir beyond gît, faillir,
saillir, paître, échoir, braire, éclore, frire, bruire and the like); `choir` has only the forms of the one line a reader meets.

## 2 Running text the builders had not seen (a treebank annotated by people)

`scripts/fr-eval-ud.mts`: Universal Dependencies French GSD (CC BY-SA 4.0; evaluation only, never shipped). First reading
of every word. "Lemma list" = with the 78,650 lemmas taken from the dictionary loaded, as the extension has them; "hand list" =
the 3,400-lemma hand word list alone. The **test** part was run once, at the end, and not looked into; the dev part was looked
at while the context rules were written.

| | test, lemma list | test, hand list | dev, lemma list | dev, hand list |
|---|---|---|---|---|
| words scored | 8,018 | 8,018 | 28,889 | 28,889 |
| a reading a list vouches for | 94.6 % | 82.5 % | 92.1 % | 79.0 % |
| right lemma | **92.30 %** | 86.99 % | 92.43 % | 87.13 % |
| right lemma, pronouns left out | 94.96 % | 89.27 % | 95.00 % | 89.41 % |
| right part of speech | **90.40 %** | 86.51 % | 91.00 % | 87.36 % |
| mood / tense / person (where both state it) | 98.9 / 99.5 / 99.5 % | 98.9 / 99.0 / 99.5 % | 99.2 / 99.4 / 99.7 % | 99.1 / 98.6 / 99.7 % |
| number / gender | 99.5 / 99.5 % | 99.1 / 98.0 % | 99.5 / 99.5 % | 99.2 / 98.0 % |
| token boundaries identical to the treebank's | 97.0 % | | 97.1 % | |

The treebank files il, elle, ils, elles under the lemma `lui` and je under `moi`; the pack follows the dictionary (il, elle,
je), which is why the pronoun-free row is given. Test and dev agree to within half a point, so the rules were not fitted to dev.
These figures are without the installed dictionary's form index, which the extension also consults for a word no list vouches for.

## 3 Sentences written to test particular grammar

`data/benchmarks/fr`: each case names a word in a sentence and the lemma, part of speech, features, construction or word
boundaries expected, checked against the dictionary extract before use.

| set | written | result |
|---|---|---|
| first set, 524 cases in nine categories (`fixtures/`) | without sight of the implementation; the context rules were then tuned on it | 519 pass; the five that do not are in `known-limits.json`, each needing the meaning of the sentence |
| held-out set, 220 cases (`heldout/`) | afterwards, by a reviewer who had seen neither the code nor the first set's cases; frozen (hashes in `FROZEN.md`) before the analyser was run | **213 pass** with the lemma list, 204 with the hand list alone; no expectation changed after the run |

The held-out failures: four need meaning (les fils: sons or wires; je suis le chemin: am or follow; vit-il, ils virent: voir
in the passé simple or the present of vivre / virer), three were defects and were fixed afterwards (`fort` after a verb; the
halves of `auxquels`; the noun `quotidien`), after which the same cases give 216. The set is no longer held out for those.

## 4 Text that is not French

`scripts/fr-eval-foreign.mts`: GoLearn Active gives a block of Latin-script text to the pack that reads 45 % of its words. Blocks
of about 40 words, share of words with a reading a list vouches for, lemma list loaded:

| text | read | blocks over 45 % |
|---|---|---|
| French (UD GSD dev, 569 blocks) | 92.2 % | 569 of 569 |
| English (this repository's documentation prose, 125) | 11.6 % | 0 |
| Spanish (the course texts, 85) | 30.0 % | 2 |
| German (139) | 8.1 % | 0 |
| Latin (358) | 17.8 % | 1 |
| Albanian (26) | 6.1 % | 0 |

The dictionary's lemma list on its own read 26 % of English and 40 % of Spanish and put 27 % of Spanish blocks over the line,
because French shares or lent so many words. So a reading that only that list vouches for counts only in a text that shows a
French-only function word (des, du, au, et, est, dans, pas, avec, une, je, ce, qu', j' …). What remains for Spanish is the
function words the two languages really share (de, la, que, en, se, a, un, es, le): two blocks in 85, and only on a page that
declares no language, with no Spanish pack installed.

## 5 The real extension

`scripts/loadcheck/golearn/fr.mjs` and `BROWSER-RUN.md`: the built extension in a throw-away headless Brave profile against a
throw-away local service. Install, lookups on everyday and literary French, marks and their persistence, synchronisation to an
account and back into a fresh profile, GoLearn Active, a mixed-language page, two real websites: see that file for each step,
what failed, and what was fixed after it.

## What these figures do not show

- That the French is right where no source says so: the glosses of the hand word list, the grammar explanations, the
  orientation and the spelling-to-sound notes are AI-drafted and unreviewed.
- Literature: the treebank is news, encyclopedia and web text. The literary tenses are measured on single forms (section 1)
  and on about a hundred test sentences, not on a novel.
- Meaning in context: where several words share a spelling the right reading is offered; it is first only where the
  neighbouring words decide.

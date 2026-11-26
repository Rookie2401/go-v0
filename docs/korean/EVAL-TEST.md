# Korean analyser: the held-out measurement

Hand-written record of the ONE run of the treebank's test part. The method, the gold derivation, the convention
differences and the error classes are in `EVAL.md` (generated from the development part, which the builders tuned on).

- **Data**: UD Korean-Kaist, test part (`ko_kaist-ud-test.conllu`, CC BY-SA 4.0), 2,287 sentences, 28,366 어절, of which
  23,865 are scored (punctuation, symbols, foreign words, digits, bare particles and Hanja-lemma 어절 are counted apart,
  as in `EVAL.md`).
- **When and what**: 2026-11-25, analyser `adapter-ko@1` at commit `93a3a31c` (analysis code frozen at `4eed6bc1`), the
  compiled core and all 26 lexicon shards, the lexicon and dictionary as built for that commit.
- **How**: `npm run ko:eval -- --split test --final --mode adapter`, and the same with `--mode token`, once each, in one
  sitting. Nobody looked into the test part's errors: only the figures below were read, and the seen / unseen split was
  computed from the saved records as totals. No analysis code was changed after the run.
- **The test part was never opened before**: the script refuses it without `--final`. The train part gave the lexicon
  its counts (which word of a spelling is commoner); the development part was looked at while rules were written.

## Figures (first reading unless said otherwise)

| | Adapter (whole sentences) | Each 어절 alone |
|---|---|---|
| Right dictionary word, strict | 21,855 / 23,865 = **91.58 %** | 91.48 % |
| Right dictionary word, lenient (annotation-convention alternatives accepted) | 22,432 / 23,865 = **94.00 %** | 93.97 % |
| Right dictionary word among the readings, strict / lenient | 93.75 % / 96.13 % | 93.76 % / 96.14 % |
| Part of speech right | 87.67 % | 83.96 % |
| Part of speech right, given the right word | 91.90 % | 87.96 % |
| Particle and ending chain exactly as the treebank | 20,826 / 23,110 = 90.12 % | 90.03 % |
| Chain, per morpheme (F1) | 92.08 % | 92.01 % |
| First reading marked unconfirmed | 12.99 % | 13.00 % |
| Confident (0.8 or more, not unconfirmed) and the wrong word | 1,085 / 23,865 = **4.55 %** | 4.65 % |
| A reading ranked above a more confident one | 0 | 0 |

The four figures to quote together, never the best alone (adapter mode):

| | Strict | Lenient |
|---|---|---|
| All scored 어절 (23,865) | 91.58 % | 94.00 % |
| Written forms the train part also has (16,890) | 93.45 % | 95.49 % |
| Written forms the train part does not have (6,975) | **87.04 %** | 90.37 % |

For comparison, the development part on the same code: 90.77 % strict, 93.98 % lenient; forms not in train 86.16 % /
89.79 %; confident and wrong 4.93 %.

## What these figures do and do not say

- The treebank is expository prose and literature of the 1990s. It has almost none of what a learner meets first:
  speech, the polite 해요체, web text, Bible prose. Text of those kinds will score differently, and nothing here measures it.
- The lexicon's counts come from the same treebank's train part, which favours the lexicon on this text. The row for
  forms not in train is the nearer guide for other writing of the same kind.
- "Strict" counts the pack's own decisions against it where the treebank's convention differs: a word in 적 is the
  derived word here (정치적) and the noun there; a listed compound verb reads whole here (살펴보다) and as its first verb
  there; 이런, 그런, 어떤 are determiners here and inflected adjectives there. "Lenient" accepts those alternatives.
- An unconfirmed first reading is not an error the card hides: the card says the word is not in the word list, or
  is built from listed parts, and credits no lemma. Most unconfirmed first readings are unlisted compounds and names.
- No Korean speaker has reviewed the analyser, its lexicon decisions or its explanations.

## After the run (dated note, 2026-11-25)

The run above was made before the independent linguistic audit's later sections and the common-word sweep had reached the
builders. So the measured code (`93a3a31c`) still held these analysis faults, none of them found on this treebank:

- an unlisted personal name was read as a confirmed verb once the full lexicon was loaded (박지성이 as 박다 …);
- 목자시니 and 의사시다 were read as a noun with a suffix, not as the honorific copula;
- some verbs' bare -아/어 forms were read as nouns (불 켜! 여기 서!);
- 공부를 한 사람 read 한 as the numeral;
- a bare 내 was read as 내 "inside" where a reader takes 나 with the possessive;
- a common noun with a particle was read as a form of a look-alike verb (물을 as 묻다, 가게도 as 가다): a whole class, brought
  in by the second round of morphology work and so present in the measured code. The common-word sweep
  (`docs/korean/SWEEP.md`) found it.

All were fixed afterwards (commits `6dfc31dc` to `cbb9d428`, where the analyser was frozen), from the audit's sentences, the
sweep's table and the development part only. Two of the fix rounds each broke something for a few hours (bare 배 and 차 read
as verbs; bare 먹는 read as 먹 "ink") and were corrected before the freeze. The test part was NOT run again: it is run once,
and the figures at the top of this file are the measured code's, not the final code's. What the fixes did to the DEVELOPMENT
part, the only comparison that is fair to make:

| Development part, adapter mode | Measured code (`93a3a31c`) | Final code (`cbb9d428`) |
|---|---|---|
| Right dictionary word, strict / lenient | 90.77 % / 93.98 % | 90.99 % / 94.19 % |
| Forms not in train, strict / lenient | 86.16 % / 89.79 % | 86.39 % / 90.00 % |
| Part of speech | 87.35 % | 87.56 % |
| Chain exact | 89.29 % | 89.51 % |
| Unconfirmed | 13.66 % | 13.67 % |
| Confident and wrong | 4.93 % | 4.73 % |

So on this kind of text the final code is about two tenths of a point better than the measured code on every line but the
unconfirmed one, and the held-out figures above are a fair, slightly low, description of the code as it lands. They are NOT a
measurement of it: nobody may quote 91.58 % as the final code's figure without saying it was measured four rounds of fixes earlier.
The treebank barely holds what most of the fixes concern (names, commands, Bible forms, a learner's first nouns with a particle),
so the real difference for a learner's text is larger than this table shows and is measured only by the sweep's table.

# Arabic analyser: what is measured, how, and the figures so far

Package F (Quality), 2026-11-25. Fixtures in `test/fixtures/arabic/`, harness `scripts/ar-eval.mts`, test `test/adapters/arabic-gold.test.ts`.

**Read this first.** There is no human-annotated Arabic gold in this repository. Nothing below is a measurement against a treebank. The
regression table is a set of hand-written expectations; the development sets are machine-written and machine-annotated. An independent
auditor holds a separate held-out set (the figures there are theirs, not these). Every accuracy figure is printed with the undecided
share and the confident-and-wrong share beside it, because "accuracy" alone rewards a guess and punishes honesty.

## The sets: what each is and is not

| file | what it is | what it is NOT |
|---|---|---|
| `regression.json` (96 cases: 38 the owner's minimum table, 58 the builder's own) | One record per case: a word or short sentence, the target word, the expected vocalized lemma (as Wiktionary heads write it, through `arHeadForm`), UPOS, the features the case is about, clitic breakdown, root, and flags (`undecided`, `alsoReadings`, `notParts`, `notLemma`, `restored`, `notArabic`, `dialect`, `oneReading`). Written from grammar knowledge, **frozen 2026-11-25 before the analyser read it**, never from analyser output. Every sentence is original. | Not a sample of running text: its cases were chosen to be hard (homonym families, clitic traps, weak verbs, hamza seats, Persian, dialect). Its pass rate says nothing about how often the analyser is right on ordinary prose. |
| `msa-dev.json` (80 sentences, 752 tokens, of which 82 are marked `skip` and not scored: proper names and words whose vocalized lemma the annotator was not sure of) | A **development** set of unvocalized Modern Standard prose in the register of news, encyclopedia and simple narrative, as real print is (no vowels). Each token carries a vocalized lemma, UPOS and, where it carries clitics, the breakdown. **Machine-written and machine-annotated by the pack's builder (an AI model), not a human gold standard**; frozen 2026-11-25 before the analyser read it. | Not human-checked: some lemmas, POS tags or vocalizations are probably wrong (for example the source lists both نَفْط and نِفْط; a few lemma choices follow one reading of a noun/adjective). Not independent: the same builder wrote the pack's conventions and these annotations. Not large (670 scored tokens: differences of one or two points are noise). Not a test set: use it to find problems, never to claim a figure. |
| `msa-dev-vocalized.json` (15 of the same sentences, 91 tokens) | The same sentences fully vocalized, same annotation. Isolates what the printed vowels buy. | Same limits. |
| Quranic corpus (`--quran`, local only) | The Quranic Arabic Corpus morphology file on this machine (`lisan-v0\data\dict\quran-morphology.txt`), read to measure lemma-by-letters, root and the undecided share on a fully vocalized, classical, single-register text. | **Used for local measurement only and not shipped.** Its words, lemmas and roots are never copied into a fixture, an index, a document or the product: only aggregate figures leave the script. It is the easy case (fully vocalized, one register) and its lemma conventions differ from Wiktionary's, so only the by-letters figure and the root are meaningful. |

Both development files state this in their own `_about` header, and `test/adapters/arabic-gold.test.ts` fails if the statement is removed.

**Integrity of the freeze.** The analyser read the fixtures for the first time on 2026-11-25 after they were written. No fixture was
edited after that first run, and none will be changed to make a case pass: a failing case stays in the file and is listed below as
open. A fixture is changed only to correct a mistake in the fixture itself, with the change recorded here.

## How to run

```
npx vite-node --config scripts/vite.config.ts scripts/ar-eval.mts -- --set all
npx vite-node --config scripts/vite.config.ts scripts/ar-eval.mts -- --set msa --index core
npx vite-node --config scripts/vite.config.ts scripts/ar-eval.mts -- --quran C:/Users/CJWal/dev/lisan-v0/data/dict/quran-morphology.txt --limit 1000
npx vitest run test/adapters/arabic-gold.test.ts
```

Options: `--set regression|msa|msa-vocalized|all`; `--index core|full|mini` (core = the compiled `ar-core`; full = core plus every shard of
`public/lexicon/ar/standard`, gzip read with `node:zlib`; mini = `test/adapters/arabic-mini-index.json`; default full when the shards
exist); `--analyzer auto|adapter|sentence|word` (auto = `src/adapters/ar.ts`, then `arabic/sentence.ts` `arAnalyze`, then
`arWordCandidates` of `arabic/analyze.ts` per token; with none of them the script exits with a message); `--fail-dir`; `--json`;
`--quran <path> [--limit N|all]`. Failures of each set are written to `failures-<set>.tsv` (id or sentence, surface, kind, expected, the
top three readings with lemma|POS|confidence) in the builder's scratchpad folder unless `--fail-dir` says otherwise.

What the figures mean (per set, over scored tokens):

- **lemma strict @1**: the first reading's lemma equals the gold's through `arHeadForm` (same vocalized headword).
- **lemma by letters @1**: `arKey` of the two lemmas equal (vowels ignored).
- **POS @1**: UPOS equal; CONJ / CCONJ / SCONJ / PART count as one class and AUX as VERB (the index's labels). A second column also lets NOUN and ADJ stand for each other.
- **undecided**: the first reading's confidence is below 0.5, so no lexeme is credited (by design; see PLAN.md).
- **CONFIDENT-AND-WRONG**: confidence at least 0.5 and the lemma wrong. The number that matters most: a wrong lexeme credited to a learner.
- **right reading anywhere**: some reading in the list has the gold lemma.
- **unknown**: no reading, or only guesses (`unconfirmed`).
- **clitic breakdown right**: the first reading's `parts`, compared by key, equal the annotated parts. **Spurious cuts**: a whole word (no annotated parts) whose first reading is cut into parts.
- Regression cases are judged by `checkCase` (same rules in the test): a decided case needs the strict lemma AND confidence at least 0.5; an undecided case needs confidence below 0.5 and every `alsoReadings` lemma among the readings; features are subsets and a union (`Person: 2,3`) compares as a set; `parts` compare by key and kind (prefix / stem / suffix).

## Results (snapshot 2026-11-25; the analyser was still being written)

Analyser measured: `arWordCandidates` (context-free, per token): neither `src/adapters/ar.ts` nor a sentence analyser existed yet, so
every figure below is WITHOUT sentence context, and the dialect and Persian cases that need it fail for that reason. Index: **full**
(`ar-core`, 4,234 form keys, 1,354 lemmas, plus all 179 shards of `public/lexicon/ar/standard` built 2026-11-25). Re-run after every
analyser change and replace this table; do not edit the numbers by hand.

| run | set | scored tokens | lemma strict @1 | lemma by letters @1 | POS @1 | undecided | CONFIDENT-AND-WRONG | right reading anywhere | unknown | clitic parts right | spurious cuts |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-11-25, arWordCandidates per token, no sentence layer, no identities list, full index | regression (decided cases with a lemma) | 85 | 85.9% | 90.6% | 89.4% | 21.2% | **2.4%** | 98.8% | 0.0% | 72.2% of 18 | 0.0% of 67 |
| same | msa-dev (unvocalized) | 670 | 76.6% | 82.2% | 82.2% | 42.2% | **3.3%** | 93.1% (letters 94.3%) | 4.6% | 90.3% of 278 | 0.6% of 361 |
| same | msa-dev-vocalized | 87 | 90.8% | 90.8% | 90.8% | 14.9% | **1.1%** | 95.4% | 3.4% | 94.3% of 35 | 2.0% of 49 |
| 2026-11-25 (evening), the adapter (`src/adapters/ar.ts`: word level + reviewed list of 1,072 spellings + generated preferences + sentence layer), full index | regression (decided cases with a lemma) | 85 | 92.9% | 96.5% | – | 9.4% | **2.4%** | 98.8% | 0.0% | – | – |
| same | msa-dev (unvocalized) | 670 | 91.5% | 94.0% | – | 15.5% | **2.1%** (1.0% by letters) | – | 0.6% | – | – |
| same | msa-dev-vocalized | 87 | 96.6% | 96.6% | – | 3.4% | **1.1%** | – | 0.0% | – | – |

Regression cases passed (every expectation of the case, not only the lemma): **65 of 96** (owner's table 29 of 38, builder's own 36 of 58).

With the compiled core only (no shards): regression 35 of 96; msa-dev lemma strict 39.4%, undecided 9.0%, confident-and-wrong 11.0%,
unknown 45.8%. The core alone is not enough for running prose.

Quranic corpus, local measurement only, first 1,000 verses, 19,179 words, full index, per-token analyser: lemma by letters @1 70.8%,
undecided 18.4%, confident-and-wrong (by letters) 10.6%, right reading anywhere 79.1%, unknown 12.5%, root equal to the corpus root
41.7% of the 11,433 words that have one. Classical text with its different lemma conventions (for example الله, the demonstratives,
Quranic spellings) is the harder register for this index; the Quran figure is a floor-finder, not a headline.

Reading these figures: the msa-dev 42% undecided is the design (plan: "never credit the wrong lexeme"), and 3.3% confident-and-wrong on a
set whose own gold may be wrong in places is an upper bound of the analyser's fault plus the annotator's. The gap between
unvocalized (76.6% strict) and vocalized (90.8%) is the value of printed vowels. None of this is a claim about real running text.

### Open failures (regression cases that fail at this snapshot; none deleted or weakened)

At the full index, per-token analyser. Reasons are what the failure list shows; the lead decides which are analyser faults and which are
fixture judgement calls (see the next section).

| id | what fails |
|---|---|
| o09-qala | root of قَالَ read as "ق و ل / ق ي ل" (two roots joined), expected ق و ل |
| o17-muallimat | lemma مُعَلِّم, expected the feminine مُعَلِّمَة (judgement call: does the source list the feminine?) |
| o20a-kitab-altalib | Definite "Cons,Def" for the first term of the construct, expected Cons |
| o24b-wajada-bare | unvocalized وجد is undecided with وَجْد (noun) first; expected the verb وَجَدَ to lead, و + جَدّ lower |
| o25-raahu | no `notes.root` on رَأَى (expected ر ء ي) |
| o29-wbalktab | undecided (0.45) where the whole breakdown و + ب + ال + كتاب fixes a noun; the lemma is right but not credited |
| o30-fsyktbwnha | undecided (0.45) with كَتَبَ first; ف + س + verb + ها should decide |
| o32-allama | no `notes.root` on عَلَّمَ |
| o34-alam | عَلَم vocalized read as عَالَم (0.45 each); undecided |
| w-form-I | ذَهَبَ undecided against the noun ذَهَب (printed final fatḥa) |
| w-form-IX | اِحْمَرَّ: Person "2,3" (also the imperative) and no Aspect |
| w-defective-imperfect | يَرْمِي Mood "Ind,Sub" (judgement call: no final vowel printed) |
| w-geminate-perfect | مَدَّ read as the noun مَدّ |
| w-geminate-imperative | مُدَّ read as the noun مُدّ |
| w-laysa | لَيْسَ undecided across VERB / CONJ / PART |
| w-inna | إِنَّ undecided against أَنَّ and آنَ |
| w-alayhi | عَلَيْهِ read whole (عَلَى 0.75) with no parts |
| w-lahu | لَهُ read without parts; اللّٰه as a rival |
| w-trap-bayt | بيت undecided: بَيَّتَ (verb) first, بَيْت second |
| w-trap-sayyara | سيارة undecided: سَيَّارَة against كَوْكَب سَيَّار |
| w-trap-faqad | فقد: فَقَدَ leads, ف + قَدْ absent (expected ف + قَدْ first) |
| w-trap-laha | لها: لَهَا (verb) first, ل + ها not cut |
| w-trap-wahum | وهم: وَهْم first, و + هُمْ absent |
| w-trap-kama | كما read as كَمّ (noun), the fused particle كَمَا absent |
| w-loose-ila | الى read as الَّذِي / آلَى, إِلَى absent |
| w-loose-madrasa | مدرسه read as مُدَرِّس (his teacher), مَدْرَسَة (restored) not first |
| w-participle-katib | كَاتِب undecided (against كَاتَبَ) |
| w-participle-maktub | مَكْتُوب undecided (ADJ / NOUN) |
| w-persian-ketabkhane | the Persian word read as an Arabic noun at 0.8 (needs the sentence's Persian letters) |
| w-dialect-egyptian | no reading at all, so no dialect flag (needs the sentence analyser) |
| w-dialect-levantine | not flagged `dialect?`; readings at 0.45 (needs the sentence analyser) |

### Fixture cases the builder is least sure of, linguistically

For the lead to check; the analyser's answer on these may be the right one.

- **o17-muallimat**: lemma مُعَلِّمَة (feminine) versus مُعَلِّم; depends on whether the source has the feminine as its own entry.
- **o23-lilbayti** and **o22**: how the ل and the article's lām of لل are cut out of the printed word (expected ل | ل | بيت, concatenating to the key).
- **w-lahu, w-trap-laha**: lemma لِ for the preposition (the source might head it لِـ or لَـ).
- **w-defective-imperfect**: يَرْمِي with no printed final vowel is either indicative or subjunctive in Wiktionary's tables; the fixture says Ind because nothing printed says otherwise.
- **w-trap-kull**: lemma كُلّ with POS NOUN (alternatives DET, ADJ, PRON); كَلَّ and كُلْ are rivals.
- **w-trap-fahm**, **w-trap-walad**: judged genuinely undecided in isolation.
- **w-trap-faqad / wahum / kama**: the owner said these lead with the function words; the fixture follows (lemma قَدْ, هُمْ, كَمَا) and keeps the verb or noun as a required lower reading. كما in particular could equally be ك + مَا.
- **w-loose-akala**: expected undecided with أَكَلَ among the readings flagged `restored`; **w-loose-madrasa** expects مَدْرَسَة first, though مُدَرِّسُه is a real rival.
- **w-form-I, w-form-IX**: ذَهَبَ (also the noun ذَهَب gold) and اِحْمَرَّ (also an imperative) are legitimately ambiguous; chosen before looking at the analyser.
- **w-hamzated-imperative**: اِسْأَلْ (the shortened سَلْ is the other form).
- **w-persian-ketabkhane**: a single word with only the Persian kāf and hāʾ cannot be told from Arabic; this case needs the sentence's neighbours (پ چ گ) and is meant for the sentence analyser.
- **w-dialect-***: both need the sentence analyser (two markers each); a per-token analyser cannot pass them.
- **POS of participles** (كَاتِب, مَكْتُوب, مُعَلِّم, طَالِب): NOUN with ADJ allowed; the source lists both.
- In `msa-dev.json`: annotation choices that may differ from the source's headwords: نَفْط (the source may head نِفْط), مَحَلِّيّ, شَمْسِيّ, بَلَدِيَّة (skipped), التكنولوجيا (skipped), عِشْرُون, ثَلَاثُون, إِنْهَاء, تَحَسُّن, مُقْبِل, حَاوَلَ vs forms; هٰذَا, الَّذِي and the numerals are the likeliest to differ in POS.

### How far the development set can still be trusted (2026-11-25)

The lead read this set's confident-and-wrong cases once, after the list and the preferences first ran (confident-and-wrong had risen
to 4.8 %), to find which rules decided too boldly. Six classes of rule were then tightened in the analyser, and six spellings from
those cases were added to the reviewed list (وسائل, باسم, الجامعة, البنت, بنت, فتحت). So the set is no longer unseen: for those
words it measures a fix, not a prediction. The remaining strict "errors" include vowel differences between the annotator and the
source (نَفْط / نِفْط, خُطْوَة / خَطْوَة, دَوْلِيّ / دُوَلِيّ, عِشْرُون / عِشْرُونَ), which is why "by letters" stands beside "strict".
The independent auditor's hidden texts, which the builder never sees, are the better measure: on a fresh hidden text of 325 words in
ten registers (auditor's section R, same day) the pack left 22.2 % of words undecided and credited about 1.5 % wrongly.

## What is not done

- No human gold. UD Arabic-PUD (CC BY-SA 3.0) would be the first independent set if the owner allows the download (PLAN.md "Measurement").
- No measurement through a sentence analyser or the adapter (`src/adapters/ar.ts`): none existed when these figures were taken. The dialect, Persian and context cases (`o06`, `o07` are fully vocalized so they do not need context) are the ones that will change.
- msa-dev is 752 words, a little under the 800–1,000 asked for, and 11% of its tokens are skipped.
- The Quranic run reads the first 1,000 verses only (`--limit all` runs all 6,236).

## The ratchet

`test/fixtures/arabic/open-failures.json` records which regression cases fail for one configuration (compiled core + full shards; the best analyser present: adapter, then arAnalyze, then arWordCandidates). A case not listed must pass; a listed case must still fail, so a fix forces its entry out. Without the shards the analyser part is skipped. Re-record after an analyser change: `npx vite-node --config scripts/vite.config.ts scripts/ar-eval.mts -- --write-open`. The table of open failures above is the 2026-11-25 recording (31).

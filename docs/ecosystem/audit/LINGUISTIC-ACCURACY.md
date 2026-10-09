# Linguistic accuracy audit: the Albanian analyser and the layers on top of it

Measured 2026-10-09 on adapter-sq@9 (the pack, the Repository resolver, the GoLearn extension parser, GoReview's builders and the production checker as they stand in `C:/Users/CJWal/dev/go-v0`). No product code was changed.

## 0. Read this first: whose judgement this is

**Every judgement in this document is a language model's, not a native speaker's.** I (Claude, a model) wrote the 70 test sentences, wrote what I expect for each word, ran the adapter, and judged the explanations and exercises by reading them. No native or fluent Albanian speaker has checked any of it. The adapter's own word list and rules were drafted by the same family of model, so a wrong belief about Albanian that we share would show up as agreement. "Accuracy" below therefore means "agreement with one model's reading of the sentence", not correctness in Albanian. Where I was unsure I said so in the fixture (`conf: "u"`: 13 of 323 words) and here.

What this is good for: finding places where the layers disagree with a careful reading, and places where they are silent, and giving a regression floor. What it cannot do: certify that the Albanian is right. The repository still has no native-reviewed gold set: `data/benchmarks/sq/gold/` holds only `SCHEMA.md` and `.gitkeep`, and every source in the adapter is marked `machine-drafted`.

Other limits, stated plainly:

* **Small sample.** 323 words in 70 sentences. A headline of 94 % on 323 words carries roughly +/-2.6 points of sampling error; 76 % on 246 feature-bearing words, roughly +/-5; the production figures (20 error sentences) roughly +/-20. Subsets of a handful of words (three genitives, two datives) say nothing statistically.
* **Not independent of the adapter's documentation.** Before writing the sentences I had read the headers of `constructions.ts`, `phrases.ts` and `production.ts`, so I wrote sentences in the neighbourhood of what the adapter claims. The sentences are simple, everyday, present/past: the easy end of the language. These numbers do not extrapolate to running prose, literature, or the other registers.
* **One author, one sitting.** No inter-annotator agreement exists. I marked my own uncertain readings; I did not recheck my confident ones against any external source.
* **Gold was frozen before the run, then six scheme differences were declared.** The fixture `test/audit/fixtures/albanian-unseen.json` was generated, and left unchanged, before the adapter was run on it. The first run showed that some disagreements were differences of annotation scheme or my own slips, not adapter errors. They are neutralised in code (`test/audit/linguistic.adjust.ts`), one by one and in the open, and every headline is given twice: **STRICT** (the fixture as written) and **ADJUSTED**.

| id | adjustment | words affected |
|---|---|---|
| A1 | The adapter tagset writes CONJ, my fixture CCONJ (dhe, prandaj). | 4 |
| A2 | All four linking articles are cited under the lemma `i`; I expected the form itself. | 23 articles |
| A3 | A linking article is often read as the first piece of its adjective unit (lemma `i kuq`, ADJ, `unit.pieces`); counted as the article read correctly. | within the 23 |
| A4 | The adapter gives no Case to adjectives or articles (it gives Gender, Number); I had asserted Case there. Not scored, listed as "not offered". | 19 adjective Case slots |
| A5 | u62 `tonë`: I asserted Person=1 Number=Plur (the possessor). The adapter, like Universal Dependencies, gives the number of the thing possessed. My fixture was wrong; those two features are dropped. | 1 |
| A6 | u29 `Ia` is the fused pair i + e; the adapter reads it as two parts (lemma `ai`, dative + accusative), which is right; I expected the lemma `ia`. | 1 |

Constructions: I also added, after the run, six constructions that really are in a sentence but that I had not listed (u29 clitic doubling, u32 and u67 `lutem` as non-active, u39 and u56 linking article, u62 possessive after noun), and `definite-noun-ending` wherever a definite noun stands. That is why the construction expectation is 61 strict and 88 adjusted.

## 1. Existing tests (the "gold" that already existed)

Run today, all passing unless noted:

| suite | files | tests | passed |
|---|---|---|---|
| `test/adapters/albanian-*.test.ts` + `sq.test.ts` (the Albanian adapter) | 9 | 909 | 909 |
| `test/language-packs` (includes the pack's 14 `SQ_VALIDATION` cases) | 5 | 77 | 77 |
| `test/repository` | 18 | 460 | 460 |
| `test/extension/parser.test.ts` + `card.test.ts` | 2 | 52 | 52 |
| `test/goreview/exercises` (real pack, adapter, dictionary) | 6 | 121 | 121 |
| `test/gopractice/real-engine.test.ts` | 1 | 1 | 1 |
| `test/bench/sq-*.test.ts` | 7 | 94 | 93 (1 failure, not linguistic: `sq-library-assets` source-bytes hash mismatch) |
| whole `test/adapters` directory | 85 | 4691 | 4691 |

What these numbers mean: the 909 adapter tests are assertions written by the same process that wrote the adapter, on sentences the adapter was developed against. They measure internal consistency and regression, not accuracy, and there is no held-out measurement or native-reviewed benchmark behind them. The sq benchmark machinery (`src/bench/sq`) exists and is tested with a fake adapter; its gold directory is empty. **The fresh-sentence measurement below is therefore the first held-out figure this repository has for Albanian, and it is a model's.**

## 2. Headline numbers

323 word tokens in 70 fresh sentences (310 marked confident, 13 unsure). "Known" means the word list vouches for the word (not a guess by ending): 319 of 323; four common words are outside it (`sigurt`, `uri`, `etje`, `fakt`).

| layer | measure | STRICT | ADJUSTED |
|---|---|---|---|
| tokenization | sentences with exact token boundaries | 70/70 (100 %) | same |
| tokenization | individual tokens | 401/401 | same |
| sentence segmentation | sentence count right (incl. "Si je? Jam mirë, faleminderit.") | 70/70 | same |
| coverage | words the word list knows | 319/323 (98.8 %) | same |
| lemmatization | top candidate lemma, all words | 292/323 (90.4 %) | 313/323 (96.9 %) |
| lemmatization | ... only the 310 confident words | 279/310 (90.0 %) | 300/310 (96.8 %) |
| lemmatization | ... only the 319 known words | 292/319 (91.5 %) | 313/319 (98.1 %) |
| POS | top candidate POS | 289/323 (89.5 %) | 311/323 (96.3 %) |
| morphology | words whose asserted features ALL match exactly | 173/247 (70.0 %) | 187/246 (76.0 %) |
| morphology | ... counting a union that contains the value ("Nom,Acc" for Acc) as right | 213/247 (86.2 %) | 231/246 (93.9 %) |
| whole reading | lemma + POS + features (union allowed) | not computed | 304/323 (94.1 %); 304/319 (95.3 %) of known words |
| context | flagged-ambiguous words (41) whose top reading is right in the sentence | 33/41 (80.5 %) | 36/41 (87.8 %) |
| context | the same words read alone (no sentence) | 27/41 (65.9 %) | 28/41 (68.3 %) |
| context | top reading changed by context / of which fixed / of which broken | 10 / 6 / 0 | n/a / 8 / 0 |
| phrases | confident expected units found exactly | 11/14 | n/a |
| syntax | constructions (the only syntax the adapter offers) found | 58/61 | 85/88 (96.6 %) |
| syntax | constructions fired that are not in the sentence | 28 (mostly my omissions) | 1 |
| syntax | dependency relations | not offered | not offered |
| pronunciation | words whose note letters equal the letters an English reader cannot read as written | 323/323 | same |
| Repository resolver | chosen reading right (whole reading) | n/a | 304/323 (94.1 %) |
| extension card | lemma/POS/features of the card right | n/a | 304/323 (94.1 %); identical to the adapter's top reading |
| extension card | construction explanation matches the noun (28 definite nominative / accusative / plural nouns) | n/a | 28/28 named correctly; 1 of the accusative ones is not an object |
| explanations | 52 texts a learner can see: correct / imprecise / unsure / wrong | n/a | 47 / 4 / 1 / 0 |
| GoReview | 39 exercises built for 15 units: right / right but narrow / wrong | n/a | 36 / 1 / 2 |
| GoReview grader | 31 typed answers: agrees with my expected outcome | n/a | 24/31 |
| production checker | 20 one-error sentences: error located | n/a | 13/20 (65 %) |
| production checker | ... a fix offered / of those, correct | n/a | 9/20 / 9/9 |
| production checker | false alarms on 79 correct sentences | n/a | 0 |

## 3. Per-layer results and sentence lists

The full per-sentence table is in section 3.9. Sentence ids are `u01`..`u70` in `test/audit/fixtures/albanian-unseen.json`.

### 3.1 Tokenization and sentence segmentation

All 70 sentences tokenize exactly as I expected: `ë`/`ç` stay inside the word, the apostrophe form `S'kam` is one token (my fixture states the expectation that way because the adapter documents it; linguistically it is `s'` + `kam`, and the adapter keeps both as `parts`), punctuation is its own token. Sentence segmentation is right on all 70, including the only two-sentence item (u65). Nothing failed, which also means this sample says nothing about abbreviations or quotation marks.

### 3.2 Lemmatization and part of speech

Strict 90.4 % / 89.5 %; adjusted 96.9 % / 96.3 %. By content word (noun, verb, adjective, proper noun; 177 words) the strict lemma figure is 173/177 (97.7 %). The remaining adjusted lemma and POS errors (full list in section 4) fall into five kinds:

* **Outside the word list (4 words, no reading at all):** u52 `sigurt`, u66 `uri`, `etje`, u69 `fakt`. Note that the phrase list holds `kam uri`, `kam etje`, `në fakt`, which the phrase layer found, but the word layer has no entry for the words.
* **Predicate adverbs read as adjectives (3 of 3):** u62 `Mirë se vini`, u63 `më vjen keq`, u65 `Jam mirë`: `mirë`, `keq` come out as ADJ `i mirë`, `i keq`. The adverb reading is in the candidate list; the top one is wrong.
* **The first linking article of a genitive chain (u06 `Libri i mësuesit`) and the article before an out-of-list adjective (u52):** `i` read as the pronoun `ai` (confidence 0.6). The genitive-linking-article construction is missed as a consequence.
* **Little words:** u28 `u` (dative clitic "to them") read as the non-active particle; u32 `të` in `të lutem` read as the particle instead of the clitic; u60 `ne` typed without diacritics stays "we" and never becomes `në`.
* **Possessive `tij`** is read as a DET unit `i tij` with no Person or Number (u56).

Aorist forms, including the irregular ones, are right: `erdhën` (vij), `pashë` (shoh), `tha` (them), `dhanë` (jap), `shkova`, `hapi`, `hyri`, `pa`: every word of the "aorist" and "aorist-irregular" sentences (20/20) is right.

### 3.3 Morphology

Exact whole-word feature match is 70.0 % strict and 76.0 % adjusted; with unions counted as right, 86.2 % and 93.9 %. The gap between "exact" and "union" is the headline fact about this layer: the adapter does not guess where the form is ambiguous, it returns the union.

Per feature (adjusted, over every asserted feature; "union" = the right value is inside a comma list):

| feature | exact | union | missing | wrong |
|---|---|---|---|---|
| Number | 226 | 6 | 7 | 1 |
| Person | 119 | 4 | 3 | 2 |
| Gender | 98 | 8 | 6 | 0 |
| Tense | 70 | 0 | 1 | 0 |
| Definite | 67 | 0 | 3 | 0 |
| Case | 56 | 33 | 4 | 0 |
| Clitic | 19 | 0 | 2 | 0 |
| Mood | 5 | 0 | 0 | 2 |
| Voice | 2 | 0 | 0 | 0 |
| VerbForm | 1 | 0 | 0 | 0 |

"Missing" is 4 OOV words (Case, Definite, Number, Gender), the reading with no features for `u`, `të`, `tij`, and `flisni` with no Tense. "Wrong" is only 5 slots in total: Person on `pi` and `bie` (forms identical in 1/2/3 singular; the adapter put Person=1 although the subject is a 3rd-person noun), Number on `fëmijë` after `dy`, Mood on `jep` (imperative read as indicative) and on `ndihmoni` (plural imperative given as "Ind,Sub").

Nouns by definiteness, case and gender (70 gold nouns; "exact" = the single right Case):

| | exact | union | missing |
|---|---|---|---|
| definite nominative singular (masc 6, fem 7) | 13 | 0 | 0 |
| definite accusative singular (masc 8, fem 3) | 11 | 0 | 0 |
| definite genitive / dative singular (masc 3, fem 1) | 1 | 3 | 0 |
| definite ablative singular (fem 1) | 1 | 0 | 0 |
| definite plural (masc 2, fem 2) | 0 | 4 | 0 |
| indefinite, mostly accusative objects (masc 15, fem 22) | 17 | 17 | 3 |

So: **definite singular nominative and accusative are exact in 24 of 24**, in both genders. Definiteness is right on 67/70 nouns (three misses are the OOV words), Number on 66/70, Gender on 67/70. Case stays a union in 33 slots: 24 nouns, 1 name (`Anës`) and 8 clitic pronouns. The nouns are the 17 indefinite ones ("Nom,Acc"), the 4 definite plurals ("Nom,Acc") and the 3 definite genitive/dative singulars ("Gen,Dat,Abl"; the one definite ablative was pinned by `afër`). That is honest rather than wrong, but it means Case on a noun is exact in only 43 of 70 cases, and it is what the resolver's `conflicted` status reacts to (section 3.5). The adapter has no way to say "accusative" for `libër` in `Kam një libër` because that needs the verb's argument structure.

Verb forms (adjusted, whole reading right / verbs in the fixture): present 56/59 (misses: `pi`, `bie`, `flisni`), imperfect 4/4 (`isha`, `luaja`, `punonte`, `ishim`), aorist 8/8 (`dhanë`, `shkova`, `hapi`, `hyri`, `erdhën`, `pashë`, `tha`, `pa`), subjunctive after `të` 4/4 (`shkoj`, `lexojë`, `flas`, `shkojë`), participle 1/1 (`parë`), non-active `lutem` 2/2, imperative 1/3 (`shko` right; `jep` and plural `ndihmoni` wrong). The `future` construction was found in both future sentences and every word of those two sentences is right. Negation `nuk`, `s'` and `mos` are all read as particles.

Adjectives with the linking article: 22 adjective tokens, 21 right as a whole reading (the miss is the OOV `sigurt`). Gender is exact on 15 and Number on 17 of the 22; the rest are unions ("Masc,Fem" for `bukur`, `vogël`, `mirë`, which are the same in both genders, or "Sing,Plur") or missing (`sigurt`). The 23 article tokens are right on 21 (adjusted), wrong on both occurrences where `i` was read as `ai`.

Clitics (21 tokens): lemma and POS right on 19; whole reading right on 19. Case of `më`, `të`, `na`, `ju` is a union "Acc,Dat" (the forms are identical), correct but unresolved; `Ia` is read correctly as two parts.

### 3.4 Contextual disambiguation

41 words were flagged as ambiguous (`e`, `i`, `të`, `më`, `u`, `do`, `pa`, `ne`, `ju`, `jetë`, `vajza`, `jep` ...); 38 of them really have more than one distinct reading in the adapter. Read alone, the top reading is right for 27 (strict) / 28 (adjusted) of the 41; in the sentence, 33 / 36. **The sentence helped 8 words and hurt none** (adjusted): u24 `të` (clitic "you"), u27 and u67 `Ju` (object clitic), u30 `pa` (aorist "saw", not the preposition "without"), u47 and u48 `do` (the future particle), u54 `të` (the linking article), u56 `e`. Still wrong in context: u04 `pi` (Person), u28 `u`, u32 `jep` and `të`, u60 `ne`. In one flagged case the right reading is not in the candidate list at all: u60, `ne` typed without ë is only ever "we".

Highlights, because these were the interesting cases: `Ana e pa filmin dje` reads `pa` as "saw", `Nuk e kam parë` and `Unë e shoh dhe e dua` read both `e` as the clitic; `Ajo ka një jetë të mirë` reads `jetë` as the noun and `të mirë` as article + adjective; `Nëna e do vajzën` reads `do` as "loves" (dua) with Person left as the union "2,3".

### 3.5 Repository resolver (statuses)

Each of the 323 words resolved in its sentence (`resolveSelection`), then judged:

| status | words | whole reading right |
|---|---|---|
| verified | 0 | n/a |
| high-confidence | 109 | 108 (99.1 %) |
| provisional | 126 | 121 (96.0 %) |
| conflicted | 88 | 75 (85.2 %) |
| invalidated | 0 | n/a |

The one wrong "high-confidence" word is u60 `ne` (typed without ë: a respelled word that is itself a valid word). **No reading is ever "verified", which is the honest state: nothing in the system has been seen by a native speaker.** "Conflicted" is conservative: 75 of the 88 conflicted words had the right top reading; a conflicted status withholds exercises from the word (section 3.7) even when the reading is right. The adapter's own confidence number is not a useful calibration signal on this sample: readings at 0.85 or above were right 95.5 % of the time, at 0.6-0.85 93.2 %, below 0.6 100 % (the low ones are linking articles inside adjective units).

### 3.6 Extension card (lemma, morphology, explanations)

The card reads the adapter's top reading: it was right for exactly the same 304 of 323 words, and its lemma never differed from the adapter's. For the 28 definite nouns whose gold case is nominative, accusative or plural, the card named the right construction explanation every time. The text it shows for an accusative is "marks a definite noun as the direct object", which is false for u62 `në shtëpinë tonë` (accusative after a preposition). Definite genitive/dative/ablative nouns get no named explanation, only a generic line.

### 3.7 Explanations (the pack's `explain` texts, the adapter's constructions, the card's form texts)

I read all 52: 10 pack feature texts, 8 pack construction texts, the adapter's 31 construction texts, and the 3 texts the card shows for the form constructions. Verdicts: **47 read as correct, 4 imprecise, 1 unsure, 0 wrong.**

Imprecise:
* pack `definite-accusative-singular`: says the `-in/-n` ending "marks a definite masculine noun as the direct object". The accusative is also the case after në, për, me; and the masculine ending can be `-un` (miku, mikun).
* pack `definite-nominative-singular`: "That ending alone tells you it is definite and the subject" over-claims. `vajza` can be the plural "girls", and the nominative also marks a predicate noun and the noun after nga / te.
* card form texts for the definite accusative and nominative ("the direct object", "the subject"): same issue, and demonstrably wrong in u62.

Unsure (a model cannot settle it): `nominative-after-preposition` states that nga, te and tek take the nominative; grammars differ on nga.

### 3.8 GoReview exercises and grading

GoReview builds only from the pack's own sentences and from the Repository unit's status. It cannot make a sentence out of any of my 70, by design (rights rule), so I measured it two ways.

*Availability on the unseen vocabulary.* The 70 sentences give 78 lemma units and 121 form units. Exercises can be built for 150 of the 199 (75 %), and nearly all of them are `written-recognition` (150). `meaning-to-form` 69, `morphological-identification` 11, `sentence-completion` 7, `grammar-application` 2. The refusal reasons, by count: conflicted 188, provisional (no production question) 170, no pack sentence holds the unit 120, provisional (no grammar question) 89. That is the system working as documented: it refuses rather than ask a weak question.

*Correctness of 39 exercises built for 15 units* (libër lemma + form, librin, shkollë lemma + form, çaj lemma + form, the indefinite-noun construction unit, çajin, lexoj, lexojnë, fëmijë lemma, Fëmijët, the phrase `quhem …`, and the two-word selection `quhem Sam`; these use the pack's own sentences, not mine). Judged by reading prompt, options and key:

* 36 right. For example: "What does libër mean?" = book; "Type the word that means book" = libër; "In this sentence, which case is shkollë in?" (Ana shkon në shkollë) = accusative; "Choose the form of libër that fills the gap and has this definiteness: indefinite" (Ajo ka një _____.) = libër; "Burrat pinë _____." with options çajin/çaj, indefinite = çaj; lemma questions for librin, çajin, lexojnë.
* 1 right but narrow: phrase-comprehension for `quhem …` accepts "my name is" and "to be called" but marks "my name is Sam" and "I am called" incorrect (typed matching on a list of three).
* 2 wrong: the Repository makes a `form:sq:quhem sam` unit out of the two-word selection "quhem Sam", and GoReview then asks "What does quhem Sam mean?" with the key "to be called", and "Type the form of the word meaning to be called that is: first person singular ..." with the key "quhem Sam". That treats a name as part of a verb form.

*Units made from readings the sentence did not choose.* Four lemma units that appear in the unseen set only as non-chosen alternative readings still get a gloss exercise: `re` NOUN "cloud" (the word was the adjective "new"), `anë` "side" (from `Anës`, a name), `i parë`, and `bukur` ADV. A learner who opened one would be asked a question about a word that was not in their sentence.

*The typed grader.* 31 typed answers against my expectation of what a good grader would do. It agreed with me 24 times. It marked as incorrect (confidence 0.7): "children" and "the children" for Fëmijët, "kids", "the book" for librin, "they read" for lexojnë, "my name is Sam", "I am called". Its keys are the lemma's glosses only, so an inflected form can only be answered with the lemma gloss. It handled the Albanian side well: `liber`/`shkolle`/`caj` (no ë/ç) are partial, wrong case or definiteness forms (`librin`, `shkolla`, `çajin`) are incorrect, capitals are ignored.

### 3.9 The 70 sentences (adjusted figures)

"reading ok" = words whose lemma, POS and features (union allowed) match; "features exact" = of the words with asserted features, how many match exactly; phrase = what I expected and whether the adapter found it exactly; constructions = found / expected (after declared completions), with any extra that fired.

| id | sentence | tok | reading ok | features exact | phrase | constructions (found/expected) |
|---|---|---|---|---|---|---|
| u01 | Kam një libër. | ok | 3/3 | 1/2 |  | 0/0 |
| u02 | Libri është në tavolinë. | ok | 4/4 | 3/3 |  | 1/1 |
| u03 | Shoku im lexon librin. | ok | 4/4 | 2/3 |  | 2/2 |
| u04 | Vajza pi qumësht. | ok | 2/3 | 1/3 |  | 1/1 |
| u05 | Shoh djalin në rrugë. | ok | 4/4 | 3/3 |  | 1/1 |
| u06 | Libri i mësuesit është i ri. | ok | 5/6 | 4/6 |  | 2/3 |
| u07 | Çanta e vajzës është e kuqe. | ok | 6/6 | 4/6 |  | 3/3 |
| u08 | Ai i jep librin mikut. | ok | 5/5 | 4/5 |  | 3/3 |
| u09 | Shkolla e vogël është afër shtëpisë. | ok | 6/6 | 5/5 |  | 3/3 |
| u10 | Fëmijët luajnë në park. | ok | 4/4 | 2/3 |  | 1/1 |
| u11 | Burrat e shohin djalin. | ok | 4/4 | 3/4 |  | 3/3 |
| u12 | Gruaja ka dy fëmijë. | ok | 3/4 | 2/3 |  | 1/1 |
| u13 | Shtëpitë e mëdha janë të vjetra. | ok | 6/6 | 4/6 |  | 2/2 |
| u14 | Shoh shtëpitë e bukura. | ok | 4/4 | 3/4 |  | 2/2 |
| u15 | Ai është një njeri i mirë. | ok | 6/6 | 5/5 |  | 1/1 |
| u16 | Ajo është një grua e mirë. | ok | 6/6 | 5/5 |  | 1/1 |
| u17 | Kam një mik të mirë. | ok | 5/5 | 4/4 |  | 1/1 |
| u18 | Libri i ri është i shtrenjtë. | ok | 6/6 | 6/6 |  | 2/2 |
| u19 | Vajza e re ka një çantë të kuqe. | ok | 8/8 | 7/7 |  | 2/2 |
| u20 | Çaji është i nxehtë. | ok | 4/4 | 4/4 |  | 2/2 |
| u21 | Dita është e bukur. | ok | 4/4 | 2/4 |  | 2/2 |
| u22 | Kemi një shtëpi të vogël. | ok | 5/5 | 1/4 |  | 1/1 |
| u23 | Nëna e do vajzën. | ok | 4/4 | 3/4 |  | 3/3 |
| u24 | Unë të shoh. | ok | 3/3 | 2/3 |  | 1/1 |
| u25 | Ti më ndihmon shpesh. | ok | 4/4 | 2/3 |  | 1/1 |
| u26 | Ai na takon në qytet. | ok | 5/5 | 3/4 |  | 1/1 |
| u27 | Ju ftoj në darkë. | ok | 4/4 | 2/3 |  | 1/1 |
| u28 | Ata u dhanë një libër. | ok | 4/5 | 2/4 |  | 0/1 +non-active-u |
| u29 | Ia jap librin Anës. | ok | 4/4 | 3/4 |  | 3/3 |
| u30 | Ana e pa filmin dje. | ok | 5/5 | 4/4 |  | 3/3 |
| u31 | Nuk e kam parë. | ok | 4/4 | 3/3 |  | 3/3 |
| u32 | Më jep një kafe, të lutem. | ok | 4/6 | 1/5 | found të lutem | 2/2 |
| u33 | Ai i flet mësuesit shqip. | ok | 5/5 | 3/4 |  | 3/3 |
| u34 | Unë punoj çdo ditë. | ok | 4/4 | 2/3 | found çdo ditë | 0/0 |
| u35 | Ti lexon një libër. | ok | 4/4 | 2/3 |  | 0/0 |
| u36 | Ne punojmë në shkollë. | ok | 4/4 | 3/3 |  | 0/0 |
| u37 | Ju flisni shqip. | ok | 2/3 | 1/2 |  | 0/0 |
| u38 | Ata shkojnë në treg. | ok | 4/4 | 3/3 |  | 0/0 |
| u39 | Kur isha i vogël, luaja çdo ditë. | ok | 7/7 | 4/5 | found çdo ditë | 1/1 |
| u40 | Ai punonte në bankë. | ok | 4/4 | 3/3 |  | 0/0 |
| u41 | Dje shkova në treg. | ok | 4/4 | 2/2 |  | 0/0 |
| u42 | Ajo hapi derën dhe hyri. | ok | 5/5 | 4/4 |  | 1/1 |
| u43 | Ne ishim në shtëpi. | ok | 4/4 | 3/3 | MISSED në shtëpi | 0/0 |
| u44 | Ata erdhën vonë. | ok | 3/3 | 2/2 |  | 0/0 |
| u45 | Unë pashë një film. | ok | 4/4 | 2/3 |  | 0/0 |
| u46 | Ajo tha një fjalë. | ok | 4/4 | 2/3 |  | 0/0 |
| u47 | Nesër do të shkoj në Tiranë. | ok | 6/6 | 2/2 |  | 1/1 |
| u48 | Ajo do të lexojë librin. | ok | 5/5 | 3/3 |  | 2/2 |
| u49 | Dua të flas me ty. | ok | 5/5 | 3/3 |  | 1/1 |
| u50 | Ai nuk dëshiron të shkojë. | ok | 5/5 | 3/3 |  | 2/2 |
| u51 | S'kam kohë sot. | ok | 3/3 | 1/2 |  | 1/1 |
| u52 | Nuk jam i sigurt. | ok | 2/4 | 1/3 |  | 1/2 |
| u53 | Mos shko atje! | ok | 3/3 | 1/1 |  | 1/1 |
| u54 | Ajo ka një jetë të mirë. | ok | 6/6 | 2/5 |  | 1/1 |
| u55 | Unë e shoh dhe e dua. | ok | 6/6 | 5/5 |  | 1/1 |
| u56 | Ai e lexon librin e tij. | ok | 5/6 | 5/6 |  | 4/4 |
| u57 | Të gjithë janë këtu. | ok | 4/4 | 1/1 |  | 0/0 |
| u58 | Ky është libri i Anës. | ok | 5/5 | 4/4 |  | 2/2 |
| u59 | Është vonë. | ok | 2/2 | 1/1 |  | 0/0 |
| u60 | Ai eshte ne shtepi. | ok | 3/4 | 2/3 | MISSED ne shtepi | 0/0 |
| u61 | Faleminderit shumë! | ok | 2/2 | 0/0 |  | 0/0 |
| u62 | Mirë se vini në shtëpinë tonë! | ok | 5/6 | 2/2 | found Mirë se vini | 2/2 |
| u63 | Më vjen keq, nuk e di. | ok | 5/6 | 2/4 | found Më vjen keq | 2/2 |
| u64 | Ka një mace në shtëpi. | ok | 5/5 | 2/3 | MISSED në shtëpi; MISSED Ka një | 0/0 |
| u65 | Si je? Jam mirë, faleminderit. | ok | 4/5 | 2/2 | found Si je | 0/0 |
| u66 | Kam uri dhe kam etje. | ok | 3/5 | 2/4 | found Kam uri; found kam etje | 0/0 |
| u67 | Ju lutem, më ndihmoni. | ok | 3/4 | 1/4 | found Ju lutem | 2/2 |
| u68 | Sot bie shi, prandaj qëndroj në shtëpi. | ok | 6/7 | 2/4 | found bie shi; MISSED në shtëpi | 0/0 |
| u69 | Në fakt, nuk kam kohë. | ok | 4/5 | 1/3 | found Në fakt | 1/1 |
| u70 | Ai vjen prej qyteti. | ok | 4/4 | 3/3 |  | 1/1 |
### 3.10 Phrase and multiword detection

Expected: 16 units (14 I was confident about). **Found exactly: 11 of 14 confident ones**: `të lutem`, `çdo ditë` (twice), `Mirë se vini`, `Më vjen keq`, `Si je`, `Kam uri`, `kam etje`, `Ju lutem`, `bie shi`, `Në fakt`. `Faleminderit` is one written word and is analysed as one INTJ; it is not a multiword unit in this adapter (and the list has `shumë faleminderit`, not my order `faleminderit shumë`).

Missed:
* `në shtëpi` in u43, u64, u68: not in the phrase list (the task's own example; the adapter has `në fund`, `në fakt`, `në fillim`, `në rregull` but not this).
* `Ka një` (u64, unsure whether it is a unit at all): not in the list.
* `ne shtepi` (u60, unsure): the respelled phrase is not matched.

Fired that I had not listed, all of which I judge valid: `flas me …` on `flas me ty`, `kam kohë` on `S'kam kohë` and `nuk kam kohë`. No false phrase was found in 70 sentences.

### 3.11 Syntax (what the adapter offers: constructions, not dependencies)

There is no parser, and the adapter says so. It offers `detectPatterns` (31 named constructions) and, on function words, a descriptive `role` label (59 words carry one, e.g. "linking article: joins an adjective ... to the noun before it"); none gives a head or a relation such as subject or object. Consequently subject versus object cannot be read, which is exactly why indefinite object nouns come back as the case union "Nom,Acc".

Constructions found: 85/88 (adjusted; 58/61 strict). Missed: u06 `genitive-linking-article` (the first `i` read as `ai`), u28 `object-pronoun-before-verb` (`u` read as a particle), u52 `linking-article-adjective` (the adjective `sigurt` is outside the list). Fired but not present: 1, u28 `non-active-u` (here `u` is the dative pronoun "to them", not the non-active particle). `perfect`, `future`, `negation-nuk`, `negation-mos`, `subjunctive-te`, `clitic-doubling`, `clitic-cluster` (ia), `ablative-after-preposition` (afër), `possessive-after-noun` were all found where present.

### 3.12 Pronunciation metadata

`pronunciation()` returns letter notes only (no per-word IPA or transliteration). It gave a note for exactly the 200 words that contain a letter an English reader cannot read as written (ë, ç, c, dh, gj, j, ll, nj, q, rr, sh, th, x, xh, y, zh), and none for the other 123. My independent greedy digraph scan agrees with the set of letters named in all 323 words. The IPA the adapter teaches for each of the 16 letters equals the standard value in an independent table I wrote (ë ə, ç tʃ, c ts, dh ð, gj ɟ, j j, ll ɫ, nj ɲ, q c, rr r, sh ʃ, th θ, x dz, xh dʒ, y y, zh ʒ), and the English hints read as accurate to me (q "between k and ch", ll "dark l as in full", x "ds in beds", ë "short relaxed vowel, weak word-finally"). Nothing wrong found. Not provided: word stress, and the fact that Albanian writes every letter (no silent letters) is not stated.

### 3.13 Production checker (writing correction)

20 sentences, each with one deliberate error, plus 79 correct sentences (10 written for the purpose, 69 of the unseen set; the 70th, u60, is deliberately typed without ë and rightly draws two spelling notes).

| id | error type | sentence | located | category raised | fix offered |
|---|---|---|---|---|---|
| e01 | definiteness | Shkoj te mësues. | no | - | - |
| e02 | definiteness | Ky është shok im. | no | - | - |
| e03 | definiteness | Ajo vjen nga shkollë. | yes | definiteness | Ajo vjen nga shkolla. |
| e04 | definiteness | Kjo është nënë ime. | no | - | - |
| e05 | case | Ana punon në shtëpisë. | yes | case | në shtëpinë |
| e06 | case | Unë jetoj në qytetit. | yes | case | në qytetin |
| e07 | case | Libri është për vajzës. | yes | case | për vajzën |
| e08 | case | Shtëpia është afër shkollën. | yes | case | afër shkollës |
| e09 | case | Fëmijët luajnë në parku. | yes | case | none |
| e10 | article agreement | Ajo është një grua i mirë. | yes | agreement | none ("asks for e or të") |
| e11 | article agreement | Ai është një njeri e mirë. | yes | agreement | none ("asks for i or të") |
| e12 | article agreement | Vajza i vogël ka një libër. | yes | agreement | Vajza e vogël |
| e13 | adjective agreement | Kam një shtëpi të madh. | yes | agreement | none ("madhe or mëdha") |
| e14 | adjective agreement | Ana ka një çantë të kuq. | yes | agreement | një çantë të kuqe |
| e15 | clitic | Nëna i do vajzën. | no | - | - |
| e16 | clitic | Unë e shoh librat. | no | - | - |
| e17 | clitic | Ana pa e filmin dje. | no | - | - |
| e18 | negation | Nuk shko në shkollë! | yes | particle | Mos shko |
| e19 | negation | Dua të nuk shkoj. | yes | particle | të mos shkoj |
| e20 | negation | Ai lexon nuk librin. | no | - | - |

Totals: located 13/20; in the right category 13/13; a fix offered for 9, and **all 9 fixes are the correct ones** (accepting either of two correct cases where Albanian allows both); 0 false alarms on 79 correct sentences. By type: case 5/5 located (4 with fix), article agreement 3/3 (1 fix), adjective agreement 2/2 (1 fix), negation 2/3 (2 fixes), definiteness 1/4, clitics 0/3.

Why the misses, from reading `production.ts` and probing: clitic errors and a misplaced `nuk` are documented as not built; e01 stays silent because `mësues` is both singular and plural indefinite and the check fires only when every plausible reading qualifies (`Shkoj te mjek.` does fire); e02 and e04 are predicates after `është`, where the possessive-definiteness check is silent by design (the same check fires on `Unë kam shok im.`, `Unë shoh nënë ime.`, `Takoj mik yt.`). Silent is not "correct": the checker's own header says an empty result never means correct.

Other behaviour seen: `Do shkoj nesër.` is flagged as register (colloquial future), not as an error; `Unë ti shoh.` and `Ti flas shqip.` are flagged for subject-verb endings; Gheg `due`, `shkue`, `Çka` are flagged as dialect, never as errors.

## 4. Every disagreement (ADJUSTED), one line each

19 words of 323. "Model" is my expectation; "adapter" is its top reading, restricted to the features I asserted.

| id | word | model | adapter | kind |
|---|---|---|---|---|
| u04 | pi | pi VERB Person=3 Sing Pres | pi VERB Person=1 Sing Pres | Person wrong (form identical for 1/2/3; subject is a 3rd-person noun) |
| u06 | i | i DET (linking article, Masc Sing) | ai PRON (0.6) | wrong lemma; genitive construction missed |
| u12 | fëmijë | fëmijë NOUN Plur Acc (after `dy`) | fëmijë NOUN Sing, Nom/Acc | Number wrong (numeral not used) |
| u28 | u | u PRON clitic Dat 3 Plur | u PART | wrong POS; false `non-active-u` |
| u32 | jep | jap VERB 2 Sing Imperative | jap 2/3 Sing Indicative | Mood wrong (arguable: `Më jep një kafe` is also a well-formed statement) |
| u32 | të | të PRON clitic 2 Sing (in `të lutem`) | të PART | wrong POS |
| u37 | flisni | flas 2 Plur Pres | flas 2 Plur, no Tense | Tense missing |
| u52 | i | i DET (article) | ai PRON (0.6) | wrong lemma (the adjective after it is outside the list) |
| u52 | sigurt | i sigurt ADJ | none | not in the word list |
| u56 | tij | tij PRON 3 Sing | i tij DET, no Person or Number | features missing |
| u60 | ne | në ADP (typed without ë) | ne PRON "we", 0.9 | wrong; also the only wrong `high-confidence` status |
| u62 | Mirë | mirë ADV (`Mirë se vini`) | i mirë ADJ | wrong POS (phrase still found) |
| u63 | keq | keq ADV (`Më vjen keq`) | i keq ADJ | wrong POS (arguable) |
| u65 | mirë | mirë ADV (`Jam mirë`) | i mirë ADJ | wrong POS |
| u66 | uri | uri NOUN Fem | none | not in the word list |
| u66 | etje | etje NOUN Fem | none | not in the word list |
| u67 | ndihmoni | ndihmoj 2 Plur Imperative | ndihmoj 2 Plur Mood=Ind,Sub | imperative reading absent |
| u68 | bie | bie 3 Sing Pres | bie 1 Sing Pres | Person wrong (form identical for 1/3) |
| u69 | fakt | fakt NOUN Masc | none | not in the word list |

Scheme-only differences that the STRICT figures count and the ADJUSTED ones do not (none is an adapter error in my view): 23 article tokens whose lemma is `i` (not the form) or that are read as part of their adjective; `dhe`/`prandaj` as CONJ (4); the adjective Case that is not offered (19 slots); `tonë`; `Ia`. Strict-only words, by sentence: u06 i, ri; u07 e; u09 e, vogël; u13 e, mëdha, vjetra; u14 e, bukura; u15 i, mirë; u16 e, mirë; u17 të, mirë; u18 i, ri, i, shtrenjtë; u19 e, re, të, kuqe; u20 i, nxehtë; u29 Ia; u39 i, vogël; u42 dhe; u55 dhe; u56 e; u62 tonë; u66 dhe; u68 prandaj.

Right but underspecified (the right value is inside a union; not counted as an error in the lenient figures, not exact in the strict ones): Case of 33 words, e.g. `libër` (Nom,Acc, u01, u28, u35), `qumësht`, `shtëpi`, `kafe`, `ditë`, `kohë`, `mace`, `film`, `fjalë`, `jetë`, `shi`, definite plurals (`Fëmijët`, `Burrat`, `Shtëpitë`, `shtëpitë`: Nom,Acc), definite genitive/dative nouns (`mësuesit` Gen,Dat,Abl in u06 and u33, `mikut`, `Anës`), clitics (`të`, `më`, `na`, `Ju`: Acc,Dat); Person of `lexon`, `vjen` (2,3), `do` (2,3); Gender/Number of `vogël`, `bukur`, `mirë` and the articles `e`, `të` (Masc,Fem; Sing,Plur); `kuqe` Number.

## 5. What is unsupported or fails (the honest list)

Analyser
1. **No parser, no dependency relations.** Subject/object cannot be read, so Case on an indefinite object is always a union ("Nom,Acc", 17 nouns here) and the same for definite plurals; Case on definite genitive/dative/ablative is "Gen,Dat,Abl" unless a preposition or article decides it (here 24 nouns, 1 name and 8 clitics came back as unions).
2. **No Case for adjectives or linking articles** (Gender and Number only).
3. **Subject-verb agreement is not read from a noun subject.** `pi` and `bie` are identical in the 1st, 2nd and 3rd singular; both came out Person=1 in sentences with a 3rd-person noun subject (2 of 2 such words). A pronoun subject (`Ti lexon`) works.
4. **Number is not taken from a numeral** (`dy fëmijë` read as singular).
5. **Imperatives are only partly read:** `shko` right; `jep` (2 sg) and plural `ndihmoni` wrong.
6. **Context does not always decide the little words:** the dative clitic `u`, the clitic `të` in `të lutem`, the first `i` of a genitive chain (read as `ai`).
7. **Predicate adverbs `mirë`, `keq` after `jam` / `vjen` are read as adjectives** (3 of 3).
8. **Respelling without diacritics cannot recover `në` from `ne`** (a valid word itself).
9. **Lexicon gaps in everyday words:** `sigurt`, `uri`, `etje`, `fakt` (4 of 323, 1.2 %), plus any word of the open vocabulary; the adapter then guesses by ending (marked `unconfirmed`) or says nothing.
10. **Gheg:** standard forms are recognised from some Gheg spellings (`due` to `dua`, `shkue` to `shkoj`, `Çka` to `çfarë`) and flagged as dialect, but `n'shpi`, `ardhë` have no reading and the Gheg future `ka me ardhë` and the infinitive `me shkue` have no analysis. Gheg is not a variety the adapter analyses, by its own statement.
11. **Not measured here or not offered:** word stress; perfect with `jam` (`Unë jam larë` raises no construction, while `kam` + participle does); idioms and multiword units outside the 77 listed (`në shtëpi`, `ka një` missing); numbers/dates; quotations and abbreviations (the sample has none); every register beyond simple everyday sentences.

Layers on top
12. **Resolver:** never says "verified" (correct today); treats 27 % of words as `conflicted` (88/323) although 85 % of those are right, which withholds exercises from them.
13. **Card:** explanation text for the definite accusative and nominative over-claims ("the direct object", "the subject"); definite genitive/dative nouns have no named explanation.
14. **GoReview:** builds only from the pack's own sentences (by rights policy), so only 150 of the 199 unseen lemma and form units can be asked about at all, nearly all only as written recognition; creates units (and glosses) from alternative readings the sentence did not choose (`re` = cloud, `anë`); makes a "form" unit out of a two-word selection (`quhem Sam`) and asks nonsense about it; the typed grader's key for an inflected form is the lemma gloss, so correct "children", "the book", "they read", "my name is Sam" are marked incorrect.
15. **Production checker:** no clitic checks, no check of `nuk` placement, no idiomaticity, no genitive-chain article, no tense/mood choice; definiteness is silent when the word is also a plural or after `jam`; four of the 13 detections offer no fix (ambiguous between two forms), which is the right behaviour but means the learner is told only that something is wrong.

## 6. Reproduce

```
cd C:/Users/CJWal/dev/go-v0
npx vitest run test/audit/linguistic* --reporter=dot
```

Files (all new, nothing else touched):
* `test/audit/fixtures/albanian-unseen.json`: 70 sentences, 323 word annotations (lemma options, POS options, features, confident/unsure, ambiguity flag), 16 expected multiword units, 61 expected constructions, 3 Gheg probes, 20 + 10 production sentences. Written before the run.
* `test/audit/linguistic.measure.ts`: the strict measurement. `linguistic.adjust.ts`: the declared adjustments and the adjusted measurement. `linguistic.layers.ts`: resolver, card, production, GoReview.
* `test/audit/linguistic.unseen.test.ts` (adapter layers) and `linguistic.layers.test.ts` (resolver, card, explanations, production, GoReview): 38 tests that pin the measured numbers as floors ("no worse than"). A floor equals the count measured on 2026-10-09; none is rounded up, none is a target. If the adapter improves, the tests still pass; if it regresses, they fail. To re-judge, read section 3 and update the floors only downward with a reason, or upward after a real improvement.

The fixture is a model's reading. The most useful next step is for a native speaker to correct it: change the words they disagree with in `albanian-unseen.json` and re-run; the strict figures then become the first reviewed accuracy number for this adapter.

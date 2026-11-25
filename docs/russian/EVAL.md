# Russian analyser: measurement against Universal Dependencies gold

Written by `npm run ru:eval` (scripts/ru-eval-ud.mts) on 2026-11-18. Do not edit by hand; run it again.

- analyser version: `adapter-ru@1`
- analyser measured: ruAnalyze (sentence, ordered by context)
- index: full: ru-core (15,385 form keys, 1,536 lemmas) + 467 shards loaded on demand from public/lexicon/ru/standard (built 2026-11-17)
- treebanks: gsd-test, gsd-dev, taiga-test, taiga-dev, pud
- wall time: 10.6 s (4,657 sentences, 397 shard loads)

## The gold

All five files are human-annotated Universal Dependencies treebanks, read from data/raw/ud-ru and used only to measure. Nothing from them is in the product. What each README says about how the annotation was made:

| treebank | licence | genre | how the annotation was made (its README) |
|---|---|---|---|
| Russian-GSD (Google; Lyashevskaya and others) | CC BY-SA 4.0 | Wikipedia, blogs, news | Machine-readable metadata: lemmas, UPOS, XPOS, features, relations all "manual native". Annotated and converted by Google; v2.3+ is a major manual reannotation of LEMMA, UPOS, FEAT, HEAD and DEPREL. Its TRAIN split feeds the analyser's lemma counts, so GSD test and dev are held out but come from the same source. |
| Russian-Taiga (HSE, Moscow) | CC BY-SA 4.0 | blogs and social media, poetry, fiction, news, Wikipedia | Text was tokenized, lemmatized and parsed with UDPipe and then "checked manually"; corrections at every level (tokens, lemmas, POS, features, relations). Metadata: "manual native". So it is automatic annotation with manual correction. A different genre from GSD: informal and poetic Russian. |
| Russian-PUD (Google; CoNLL 2017) | CC BY-SA 3.0 | 1,000 translated news and Wikipedia sentences | Translated (professionally) from English and others, annotated by Google to its own guidelines, converted to UD v2 by the UD community; v2.4 changelog: manual POS, manual features, manual lemmas. Fully independent of the analyser's data. |

Treat all three as human gold of good quality but not flawless: Taiga is the only one that began as machine output, and GSD / PUD were annotated with Google's conventions and then converted, so a few systematic conventions differ from this pack (see below). Licence texts: data/raw/ud-ru/LICENSE-*.txt.

## Headline figures

Rates are over all scored word tokens (a token with no reading counts as wrong). Features are over the tokens that have a first reading and at least one comparable gold feature.

| treebank | scored tokens | coverage | lemma@1 | lemma@any | UPOS@1 | UPOS@any | features@1 lenient | features@1 strict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| UD Russian-GSD, test | 8,578 | 92.1% | 89.4% | 90.5% | 88.2% | 89.6% | 95.6% | 45.0% |
| UD Russian-GSD, dev | 8,718 | 91.4% | 88.4% | 89.6% | 87.5% | 89.0% | 95.3% | 44.2% |
| UD Russian-Taiga, test | 11,302 | 95.2% | 90.9% | 93.5% | 88.9% | 92.5% | 93.8% | 40.7% |
| UD Russian-Taiga, dev | 12,512 | 96.4% | 91.6% | 94.7% | 89.6% | 93.6% | 94.4% | 42.2% |
| UD Russian-PUD, test | 15,714 | 95.0% | 91.9% | 93.5% | 90.9% | 92.7% | 95.9% | 43.1% |
| **all** | 56,824 | 94.4% | 90.7% | 92.7% | 89.3% | 91.8% | 95.0% | 42.9% |

Strict figures and ambiguity (strict: ё must match when the gold has ё; UPOS only AUX→VERB and CCONJ→CONJ; ambiguity counted over tokens that have a confirmed reading):

| treebank | lemma@1 strict | lemma@any strict | UPOS@1 strict | UPOS@any strict | readings per covered token | covered tokens with more than one lemma |
|---|---:|---:|---:|---:|---:|---:|
| UD Russian-GSD, test | 88.4% | 89.4% | 86.6% | 88.4% | 1.84 | 21.3% |
| UD Russian-GSD, dev | 87.3% | 88.5% | 86.1% | 87.9% | 1.83 | 20.7% |
| UD Russian-Taiga, test | 89.4% | 91.9% | 86.4% | 90.1% | 1.95 | 20.1% |
| UD Russian-Taiga, dev | 90.2% | 93.2% | 87.1% | 91.4% | 1.98 | 21.7% |
| UD Russian-PUD, test | 90.8% | 92.3% | 88.0% | 90.1% | 1.87 | 22.2% |
| **all** | 89.5% | 91.4% | 87.0% | 89.8% | 1.90 | 21.3% |

Of the covered tokens (all treebanks), lemma@1 is 96.1% and UPOS@1 94.6%.

## Per feature (all treebanks)

"Gold" is how many scored tokens carry the feature in the gold; "ours defines" is the share of those where the first reading has the key; "agree" is how often it is right when it has it (lenient: a union containing the gold value is right); "strict" is over all gold tokens with the key (absent or a union counts as wrong).

| feature | gold | ours defines | agree when defined | strict |
|---|---:|---:|---:|---:|
| Case | 30,381 | 96.9% | 95.4% | 56.9% |
| Number | 36,147 | 97.5% | 98.2% | 95.6% |
| Gender | 29,113 | 96.0% | 98.7% | 88.2% |
| Animacy | 21,471 | 89.6% | 98.8% | 86.6% |
| Person | 4,335 | 97.7% | 100.0% | 96.5% |
| Tense | 6,696 | 98.4% | 99.7% | 97.5% |
| Mood | 5,572 | 98.6% | 99.8% | 98.4% |
| VerbForm | 7,997 | 97.9% | 99.5% | 97.4% |
| Voice | 6,451 | 16.2% | 96.4% | 15.6% |
| Aspect | 7,858 | 98.6% | 99.1% | 95.8% |
| Degree | 385 | 43.9% | 100.0% | 43.9% |
| Variant | 895 | 83.5% | 100.0% | 83.5% |

## By gold part of speech (all treebanks)

| gold UPOS | tokens | coverage | lemma@1 | lemma@any | UPOS@1 | features@1 lenient |
|---|---:|---:|---:|---:|---:|---:|
| NOUN | 18,112 | 96.2% | 93.6% | 94.9% | 94.7% | 95.4% |
| VERB | 7,657 | 97.6% | 93.7% | 95.8% | 94.5% | 97.2% |
| ADP | 7,180 | 100.0% | 97.6% | 97.8% | 98.9% | n/a |
| ADJ | 6,647 | 91.7% | 85.8% | 90.0% | 85.2% | 94.1% |
| PROPN | 3,452 | 51.1% | 45.6% | 46.3% | 43.2% | 86.4% |
| ADV | 2,689 | 98.7% | 91.7% | 95.6% | 85.9% | 100.0% |
| PRON | 2,672 | 99.8% | 93.0% | 99.7% | 92.8% | 97.5% |
| CCONJ | 2,636 | 100.0% | 99.4% | 100.0% | 94.8% | n/a |
| DET | 1,943 | 100.0% | 95.4% | 99.5% | 97.1% | 88.4% |
| PART | 1,616 | 99.6% | 98.4% | 99.0% | 63.8% | n/a |
| SCONJ | 932 | 99.9% | 95.6% | 99.4% | 89.3% | n/a |
| AUX | 709 | 100.0% | 99.7% | 99.9% | 91.5% | 100.0% |
| NUM | 491 | 99.8% | 93.7% | 94.5% | 74.1% | 91.2% |
| INTJ | 88 | 68.2% | 62.5% | 62.5% | 38.6% | n/a |

## Tokens not scored, and tokens that did not align

| treebank | sentences | gold words | PUNCT/SYM/X | NUM in digits | no Cyrillic letter | multiword ranges | empty nodes | we split a gold token | we merged gold tokens | partial overlap | none of ours | gold form not in text | text drift |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| UD Russian-GSD, test | 601 | 11,385 | 2,293 | 130 | 299 | 0 | 0 | 2 | 38 | 45 | 0 | 0 | 0 |
| UD Russian-GSD, dev | 579 | 11,709 | 2,474 | 148 | 268 | 0 | 0 | 1 | 44 | 56 | 0 | 0 | 0 |
| UD Russian-Taiga, test | 1,217 | 15,440 | 3,459 | 253 | 141 | 0 | 0 | 5 | 126 | 154 | 0 | 0 | 0 |
| UD Russian-Taiga, dev | 1,260 | 15,624 | 2,772 | 64 | 120 | 0 | 0 | 1 | 56 | 99 | 0 | 0 | 0 |
| UD Russian-PUD, test | 1,000 | 19,355 | 3,212 | 104 | 213 | 0 | 0 | 0 | 39 | 73 | 0 | 0 | 0 |
| **all** | 4,657 | 73,513 | 14,210 | 699 | 1,041 | 0 | 0 | 9 | 303 | 427 | 0 | 0 | 0 |

Excluded on purpose: punctuation, symbols and X (no word to read); numerals written in digits (nothing to look up); tokens with no Cyrillic letter (Latin names, foreign words). Words inside a multiword-token range are never scored (the range line stands for them in the text). A gold token is scored only when exactly one of our word tokens has the same character span; the "did not align" columns count the scored-eligible tokens that did not, by cause, and they are left out of every rate above. Examples:

- we-split: 9, e.g. gsd-test:test-s208: «ZIP-коде»
- we-merged: 303, e.g. gsd-test:test-s17: «Улу»
- partial-overlap: 427, e.g. gsd-test:test-s24: «Ср.»

## Miss lists

The 60 most frequent in each list (counts over all treebanks, one example sentence id each). They steer the morphology and context packages.

### Forms with no confirmed reading

| n | form (gold lemma and UPOS of the first one seen) | example |
|---:|---|---|
| 11 | парнас (gold ПАРНАС PROPN) | taiga-test:4047 |
| 10 | лдпр (gold ЛДПР PROPN) | taiga-test:4013 |
| 10 | младописьменных (gold младописьменный ADJ) | taiga-dev:uch-nauch--encicl_phil--encicl99-26 |
| 10 | пропитка (gold пропитка NOUN) | taiga-test:6229 |
| 9 | данька (gold Данька PROPN) | taiga-test:xud--borisov02-2 |
| 9 | км2 (gold км2 NOUN) | gsd-test:test-s146 |
| 7 | светка (gold Светка PROPN) | taiga-dev:xud--ignatova05-14 |
| 6 | васька (gold Васька PROPN) | taiga-test:xud--borisov02-22 |
| 6 | гг (gold гг NOUN) | gsd-test:test-s62 |
| 6 | кпрф (gold КПРФ PROPN) | taiga-test:4029 |
| 6 | подбассейн (gold подбассейн NOUN) | gsd-test:test-s60 |
| 5 | алексеевна (gold Алексеевна PROPN) | taiga-dev:xud--mahotin_04-2 |
| 5 | зп (gold зарплата NOUN) | taiga-dev:instagram-377 |
| 5 | карла (gold Карл PROPN) | gsd-dev:dev-s295 |
| 5 | костиков (gold Костиков PROPN) | taiga-dev:xud--mahotin_04-6 |
| 4 | водохозяйственный (gold водохозяйственный ADJ) | gsd-test:test-s60 |
| 4 | гелиодор (gold Гелиодор PROPN) | taiga-dev:instagram-166 |
| 4 | даневирке (gold Даневирке PROPN) | pud:w01025083 |
| 4 | пятина (gold пятина NOUN) | gsd-dev:dev-s18 |
| 3 | блант (gold Блант PROPN) | pud:w01135034 |
| 3 | валентино (gold Валентино PROPN) | pud:w01136029 |
| 3 | верди (gold Верди PROPN) | gsd-test:test-s155 |
| 3 | гав (gold гав INTJ) | taiga-dev:poetry-rnc-abstract-193 |
| 3 | геральдический (gold геральдический ADJ) | gsd-test:test-s321 |
| 3 | гуммет (gold Гуммет PROPN) | gsd-dev:dev-s296 |
| 3 | двуречье (gold Двуречье PROPN) | taiga-test:uch-nauch--encicl_phil--encicl15-37 |
| 3 | дешифровка (gold дешифровка NOUN) | taiga-test:uch-nauch--encicl_phil--encicl15-2 |
| 3 | жирик (gold Жирик PROPN) | taiga-test:4001 |
| 3 | звукозаписывающей (gold звукозаписывающий ADJ) | gsd-dev:dev-s385 |
| 3 | использованы (gold использовать VERB) | pud:n01021012 |
| 3 | кеша (gold Кеша PROPN) | pud:w01147018 |
| 3 | логаэды (gold логаэд NOUN) | taiga-test:uch-nauch--encicl_litved--dolnik-9 |
| 3 | мвт (gold мвт NOUN) | gsd-test:test-s159 |
| 3 | мисима (gold Мисима PROPN) | pud:w01134009 |
| 3 | млн (gold миллион NOUN) | gsd-test:test-s464 |
| 3 | мобилизован (gold мобилизовать VERB) | gsd-test:test-s179 |
| 3 | навуходоносор (gold Навуходоносор PROPN) | taiga-test:uch-nauch--encicl_phil--encicl15-11 |
| 3 | папуа (gold Папуа PROPN) | pud:w01036044 |
| 3 | полкан (gold Полкан PROPN) | taiga-dev:poetry-rnc-abstract-193 |
| 3 | предводительством (gold предводительство NOUN) | gsd-dev:dev-s188 |
| 3 | пресненского (gold пресненский ADJ) | gsd-test:test-s378 |
| 3 | пропитки (gold пропитка NOUN) | taiga-test:6227 |
| 3 | рафферти (gold Рафферти PROPN) | pud:w01130099 |
| 3 | рона (gold Рона PROPN) | pud:w01030096 |
| 3 | роулинсон (gold Роулинсон PROPN) | taiga-test:uch-nauch--encicl_phil--encicl15-6 |
| 3 | саймон (gold Саймон PROPN) | gsd-test:test-s66 |
| 3 | силлабо-тонических (gold силлабо-тонический ADJ) | taiga-test:uch-nauch--encicl_litved--dolnik-1 |
| 3 | стивен (gold Стивен PROPN) | gsd-test:test-s66 |
| 3 | сырбу (gold Сырбу PROPN) | gsd-dev:dev-s113 |
| 3 | томас (gold Томас PROPN) | gsd-test:test-s216 |
| 3 | тутмоса (gold Тутмос PROPN) | pud:w01052038 |
| 3 | уинстон (gold Уинстон PROPN) | pud:w01111021 |
| 3 | федоскинские (gold федоскинский ADJ) | taiga-test:uch-nauch--encicl_hudozh--slovar_hudozhnika_103-19 |
| 3 | федоскинской (gold федоскинский ADJ) | taiga-test:uch-nauch--encicl_hudozh--slovar_hudozhnika_103-11 |
| 3 | федоскинцев (gold федоскинец NOUN) | taiga-test:uch-nauch--encicl_hudozh--slovar_hudozhnika_103-23 |
| 3 | шэнь (gold Шэнь PROPN) | pud:w01060037 |
| 2 | oни (gold они PRON) | pud:w01013096 |
| 2 | агияр (gold Агияр PROPN) | gsd-test:test-s79 |
| 2 | алекс (gold Алекс PROPN) | gsd-dev:dev-s23 |
| 2 | алп (gold Алп PROPN) | gsd-test:test-s598 |

### First lemma wrong: form → our first lemma (gold lemma)

| n | error | example |
|---:|---|---|
| 95 | во → в (gold во) (gold lemma not among the readings) | gsd-test:test-s21 |
| 65 | то → тот (gold то) (gold lemma is another reading) | gsd-test:test-s323 |
| 48 | со → с (gold со) (gold lemma not among the readings) | gsd-test:test-s10 |
| 34 | сша → соединённые штаты америки (gold сша) (gold lemma not among the readings) | gsd-test:test-s67 |
| 33 | все → весь (gold всё) (gold lemma is another reading) | gsd-test:test-s200 |
| 29 | все → весь (gold все) (gold lemma is another reading) | taiga-test:2067 |
| 20 | больше → больше (gold много) (gold lemma not among the readings) | taiga-test:3011 |
| 17 | его → он (gold его) (gold lemma is another reading) | gsd-test:test-s318 |
| 16 | зимой → зимой (gold зима) (gold lemma is another reading) | taiga-test:1 |
| 16 | ссср → союз советских социалистических республик (gold ссср) (gold lemma not among the readings) | gsd-test:test-s141 |
| 15 | всего → всего (gold всё) (gold lemma is another reading) | gsd-test:test-s433 |
| 15 | ее → её (gold она) (gold lemma is another reading) | gsd-dev:dev-s206 |
| 13 | все → всё (gold весь) (gold lemma is another reading) | gsd-test:test-s47 |
| 11 | всех → весь (gold все) (gold lemma is another reading) | taiga-test:6427 |
| 11 | всё → весь (gold всё) (gold lemma is another reading) | gsd-test:test-s174 |
| 11 | ко → к (gold ко) (gold lemma not among the readings) | gsd-test:test-s196 |
| 11 | том → то (gold тот) (gold lemma is another reading) | gsd-test:test-s64 |
| 10 | всего → весь (gold всё) (gold lemma is another reading) | gsd-test:test-s583 |
| 10 | здравствуйте → здравствуйте (gold здравствовать) (gold lemma is another reading) | taiga-dev:instagram-127 |
| 10 | лучше → хорошо (gold хороший) (gold lemma is another reading) | gsd-dev:dev-s147 |
| 8 | включая → включать (gold включая) (gold lemma is another reading) | gsd-test:test-s73 |
| 8 | возможно → возможно (gold возможный) (gold lemma is another reading) | gsd-test:test-s314 |
| 8 | его → его (gold он) (gold lemma is another reading) | gsd-test:test-s519 |
| 8 | позднее → поздний (gold позднее) (gold lemma not among the readings) | gsd-test:test-s45 |
| 8 | равно → равно (gold равный) (gold lemma is another reading) | taiga-test:6183 |
| 8 | юрка → юркий (gold юрка) (gold lemma not among the readings) | taiga-dev:xud--mahotin_04-3 |
| 7 | большая → большой (gold больший) (gold lemma not among the readings) | gsd-test:test-s212 |
| 7 | всем → весь (gold все) (gold lemma is another reading) | taiga-test:2015 |
| 7 | г → грамм (gold г) (gold lemma not among the readings) | gsd-test:test-s224 |
| 7 | горе → гора (gold горе) (gold lemma is another reading) | taiga-dev:poetry-rnc-abstract-249 |
| 7 | дома → дом (gold дома) (gold lemma is another reading) | taiga-test:7089 |
| 7 | ее → она (gold ее) (gold lemma is another reading) | gsd-dev:dev-s206 |
| 7 | лучших → лучшее (gold лучший) (gold lemma not among the readings) | gsd-test:test-s580 |
| 7 | стоит → стоять (gold стоить) (gold lemma is another reading) | taiga-test:4029 |
| 6 | всего → весь (gold всего) (gold lemma is another reading) | taiga-test:uch-nauch--encicl_hudozh--etjud_eskiz-19 |
| 6 | далее → дальний (gold далее) (gold lemma not among the readings) | gsd-test:test-s236 |
| 6 | дальше → далеко (gold дальше) (gold lemma is another reading) | taiga-test:6057 |
| 6 | его → он (gold оно) (gold lemma is another reading) | taiga-test:uch-nauch--encicl_hudozh--slovar_hudozhnika_103-63 |
| 6 | им → они (gold он) (gold lemma is another reading) | taiga-test:4175 |
| 6 | интересно → интересно (gold интересный) (gold lemma is another reading) | taiga-test:4079 |
| 6 | невозможно → невозможно (gold невозможный) (gold lemma is another reading) | taiga-test:6851 |
| 6 | основном → основное (gold основной) (gold lemma is another reading) | taiga-test:uch-nauch--encicl_phil--encicl15-7 |
| 6 | позже → поздно (gold позже) (gold lemma not among the readings) | gsd-test:test-s6 |
| 6 | ребята → ребёнок (gold ребята) (gold lemma is another reading) | taiga-test:6599 |
| 6 | странно → странно (gold странный) (gold lemma is another reading) | taiga-test:4091 |
| 6 | страшно → страшно (gold страшный) (gold lemma is another reading) | taiga-dev:instagram-7 |
| 6 | хорошо → хорошо (gold хороший) (gold lemma is another reading) | taiga-test:2083 |
| 6 | чем → чем (gold что) (gold lemma is another reading) | gsd-test:test-s456 |
| 6 | это → этот (gold это) (gold lemma is another reading) | gsd-test:test-s245 |
| 5 | использовался → использовать (gold использоваться) (gold lemma not among the readings) | gsd-dev:dev-s237 |
| 5 | качестве → качество (gold качестве) (gold lemma not among the readings) | pud:w01028050 |
| 5 | коне → кон (gold конь) (gold lemma is another reading) | taiga-dev:poetry-rnc-abstract-172 |
| 5 | круто → круто (gold крутой) (gold lemma is another reading) | taiga-dev:instagram-99 |
| 5 | многих → многий (gold много) (gold lemma not among the readings) | gsd-test:test-s21 |
| 5 | порой → порой (gold пора) (gold lemma is another reading) | taiga-test:4247 |
| 5 | привело → привести (gold приводить) (gold lemma not among the readings) | pud:n01044009 |
| 5 | тем → то (gold тем) (gold lemma is another reading) | taiga-test:4129 |
| 5 | удивительно → удивительно (gold удивительный) (gold lemma is another reading) | taiga-test:4193 |
| 5 | часы → час (gold часы) (gold lemma is another reading) | gsd-test:test-s436 |
| 5 | это → это (gold этот) (gold lemma is another reading) | gsd-test:test-s348 |

### Part-of-speech confusions (first reading)

| n | gold → ours | example |
|---:|---|---|
| 266 | gold PART → ours ADV | gsd-test:test-s30 «лишь» |
| 222 | gold PROPN → ours NOUN | gsd-test:test-s17 «Орды» |
| 187 | gold PART → ours CONJ | gsd-test:test-s19 «будто» |
| 147 | gold VERB → ours ADJ (right UPOS is another reading) | gsd-test:test-s75 «определяющий» |
| 130 | gold ADV → ours SCONJ (right UPOS is another reading) | gsd-test:test-s19 «как» |
| 126 | gold ADJ → ours ADV (right UPOS is another reading) | gsd-test:test-s198 «умнее» |
| 93 | gold NUM → ours ADV | gsd-test:test-s5 «несколько» |
| 87 | gold ADV → ours ADJ (right UPOS is another reading) | gsd-test:test-s45 «Позднее» |
| 86 | gold PRON → ours DET (right UPOS is another reading) | gsd-test:test-s174 «всё» |
| 82 | gold CCONJ → ours ADV | gsd-test:test-s8 «также» |
| 80 | gold ADJ → ours VERB (right UPOS is another reading) | gsd-test:test-s18 «бывших» |
| 76 | gold ADJ → ours DET | gsd-test:test-s6 «другой» |
| 69 | gold ADJ → ours NOUN | gsd-test:test-s84 «лучшими» |
| 69 | gold NOUN → ours ADJ (right UPOS is another reading) | gsd-test:test-s75 «переменной» |
| 66 | gold ADJ → ours PRON | gsd-test:test-s7 «самых» |
| 60 | gold AUX → ours PART | gsd-dev:dev-s382 «бы» |
| 55 | gold PART → ours INTJ | taiga-test:2021 «Ну» |
| 53 | gold SCONJ → ours PRON (right UPOS is another reading) | gsd-test:test-s55 «что» |
| 52 | gold PRON → ours SCONJ (right UPOS is another reading) | gsd-test:test-s155 «что» |
| 42 | gold NOUN → ours ADV (right UPOS is another reading) | gsd-test:test-s72 «рядом» |
| 41 | gold VERB → ours PART | gsd-dev:dev-s268 «нет» |
| 40 | gold ADP → ours SCONJ | gsd-test:test-s65 «как» |
| 40 | gold DET → ours NUM | gsd-test:test-s398 «одна» |
| 39 | gold CCONJ → ours PART (right UPOS is another reading) | gsd-test:test-s432 «Да» |
| 38 | gold ADV → ours NOUN (right UPOS is another reading) | gsd-test:test-s383 «тут» |
| 37 | gold NOUN → ours VERB (right UPOS is another reading) | gsd-test:test-s3 «уполномоченным» |
| 35 | gold NOUN → ours NUM (right UPOS is another reading) | gsd-test:test-s187 «тысяч» |
| 34 | gold PART → ours PRON (right UPOS is another reading) | gsd-test:test-s201 «это» |
| 32 | gold ADV → ours PRON | gsd-test:test-s123 «где-нибудь» |
| 32 | gold NOUN → ours PROPN (right UPOS is another reading) | gsd-test:test-s117 «блок» |
| 25 | gold ADP → ours ADV | gsd-test:test-s46 «ниже» |
| 25 | gold VERB → ours NOUN (right UPOS is another reading) | gsd-test:test-s376 «вести» |
| 24 | gold NOUN → ours INTJ (right UPOS is another reading) | gsd-test:test-s29 «Тук-тук» |
| 23 | gold PRON → ours ADV (right UPOS is another reading) | gsd-test:test-s433 «всего» |
| 23 | gold SCONJ → ours ADV (right UPOS is another reading) | gsd-test:test-s24 «так» |
| 22 | gold PART → ours SCONJ (right UPOS is another reading) | taiga-test:2119 «хотя» |
| 21 | gold NUM → ours PRON | gsd-test:test-s12 «нескольких» |
| 21 | gold PRON → ours NOUN (right UPOS is another reading) | taiga-test:4169 «ком» |
| 20 | gold SCONJ → ours DET (right UPOS is another reading) | taiga-test:4153 «то» |
| 19 | gold INTJ → ours ADP (right UPOS is another reading) | taiga-test:2035 «О» |
| 19 | gold PROPN → ours ADJ | gsd-test:test-s93 «Хилы» |
| 18 | gold ADV → ours DET (right UPOS is another reading) | gsd-test:test-s200 «все» |
| 17 | gold VERB → ours INTJ (right UPOS is another reading) | taiga-test:6889 «Здравствуй» |
| 15 | gold DET → ours ADJ (right UPOS is another reading) | gsd-test:test-s232 «всем» |
| 14 | gold PROPN → ours VERB | gsd-test:test-s522 «Пори» |
| 13 | gold ADV → ours ADP | gsd-test:test-s372 «вплоть» |
| 13 | gold CCONJ → ours DET (right UPOS is another reading) | taiga-test:2125 «То» |
| 11 | gold ADV → ours PART | taiga-test:6167 «вроде» |
| 9 | gold ADV → ours VERB | gsd-dev:dev-s165 «совершено» |
| 8 | gold NOUN → ours CONJ (right UPOS is another reading) | gsd-test:test-s268 «А» |
| 8 | gold NUM → ours ADJ | gsd-test:test-s21 «многих» |
| 7 | gold ADJ → ours PROPN (right UPOS is another reading) | gsd-dev:dev-s59 «Грозный» |
| 7 | gold ADP → ours VERB (right UPOS is another reading) | gsd-test:test-s73 «включая» |
| 7 | gold NOUN → ours ADP (right UPOS is another reading) | gsd-test:test-s117 «В» |
| 6 | gold INTJ → ours NOUN | taiga-dev:instagram-312 «ха» |
| 5 | gold ADP → ours NOUN | gsd-test:test-s159 «типа» |
| 5 | gold NOUN → ours PART | gsd-test:test-s378 «б» |
| 4 | gold ADV → ours CONJ | taiga-test:6151 «Итак» |
| 4 | gold NOUN → ours DET | gsd-test:test-s227 «Другого» |
| 4 | gold PART → ours DET (right UPOS is another reading) | taiga-test:15 «это» |

### Feature errors: our first reading has the key with a value that excludes the gold's

| n | gold UPOS, feature: gold value → ours | example |
|---:|---|---|
| 357 | NOUN Number: Plur → Sing | gsd-test:test-s36 «человек» |
| 233 | ADJ Case: Acc → Nom | gsd-test:test-s15 «французские» |
| 157 | NOUN Case: Nom → Gen | gsd-test:test-s56 «попытки» |
| 126 | NOUN Case: Acc → Gen | gsd-test:test-s172 «команды» |
| 124 | DET Case: Acc → Nom | gsd-test:test-s23 «свои» |
| 121 | NOUN Number: Sing → Plur | gsd-test:test-s9 «дозы» |
| 93 | PROPN Animacy: Anim → Inan | gsd-test:test-s35 «Луз» |
| 82 | NOUN Case: Gen → Acc,Nom | gsd-test:test-s9 «дозы» |
| 81 | NOUN Gender: Fem → Masc | gsd-test:test-s66 «певица» |
| 74 | NOUN Animacy: Anim → Inan | gsd-test:test-s10 «митр» |
| 53 | NOUN Gender: Masc → Fem | gsd-test:test-s10 «митр» |
| 49 | VERB Case: Acc → Nom | gsd-test:test-s23 «выдержанные» |
| 43 | VERB Number: Plur → Sing | gsd-test:test-s537 «терпящим» |
| 41 | VERB Aspect: Perf → Imp | gsd-test:test-s338 «принадлежащий» |
| 40 | PROPN Number: Sing → Plur | gsd-test:test-s35 «Луз» |
| 39 | NOUN Animacy: Inan → Anim | gsd-test:test-s80 «МИСТИКА» |
| 38 | PROPN Gender: Masc → Fem | gsd-test:test-s10 «Федора» |
| 37 | PROPN Gender: Fem → Masc | gsd-test:test-s124 «Анастасия» |
| 34 | ADJ Case: Nom → Acc | gsd-test:test-s145 «сильные» |
| 31 | ADJ Gender: Masc → Fem | gsd-test:test-s60 «речной» |
| 31 | VERB Voice: Act → Pass | taiga-test:6083 «Собираем» |
| 30 | NOUN Case: Nom → Dat,Gen,Prep | gsd-test:test-s409 «Особи» |
| 30 | PRON Number: Sing → Plur | taiga-test:4175 «им» |
| 30 | VERB VerbForm: Fin → Part | taiga-test:6083 «Собираем» |
| 28 | NOUN Case: Acc → Dat,Gen,Prep | gsd-test:test-s294 «операции» |
| 27 | ADJ Case: Nom → Dat,Gen,Ins,Prep | gsd-test:test-s60 «речной» |
| 27 | VERB Aspect: Imp → Perf | gsd-test:test-s65 «успевшая» |
| 25 | NUM Case: Acc → Nom | gsd-test:test-s79 «два» |
| 24 | NOUN Case: Gen → Nom | gsd-test:test-s36 «человек» |
| 22 | NOUN Case: Acc → Nom | gsd-test:test-s117 «блок» |
| 21 | NOUN Case: Loc → Acc,Nom | gsd-test:test-s57 «конференции» |
| 20 | PROPN Animacy: Inan → Anim | gsd-test:test-s89 «Спартаком» |
| 20 | PROPN Case: Nom → Gen | gsd-test:test-s35 «Луз» |
| 18 | ADJ Case: Gen → Acc | gsd-test:test-s158 «кавалерийских» |
| 16 | DET Case: Nom → Acc | gsd-test:test-s432 «весь» |
| 16 | PRON Case: Acc → Nom | gsd-test:test-s110 «который» |
| 15 | NOUN Gender: Fem → Neut | gsd-test:test-s205 «е» |
| 15 | PROPN Case: Nom → Acc,Gen | gsd-test:test-s124 «Анастасия» |
| 14 | DET Case: Acc → Gen,Prep | gsd-dev:dev-s49 «всех» |
| 14 | NOUN Case: Dat → Gen | gsd-test:test-s2 «рублей» |
| 14 | NOUN Gender: Neut → Fem | gsd-test:test-s104 «производных» |
| 13 | PRON Gender: Neut → Masc | gsd-dev:dev-s105 «него» |
| 12 | DET Case: Acc → Gen | gsd-dev:dev-s149 «своего» |
| 12 | DET Gender: Masc → Fem | gsd-dev:dev-s526 «какой» |
| 12 | NOUN Gender: Masc → Neut | gsd-test:test-s162 «животных» |
| 12 | NOUN Gender: Neut → Masc | gsd-test:test-s416 «НЛО» |
| 11 | ADJ Case: Acc → Gen | gsd-test:test-s48 «азербайджанского» |
| 11 | ADJ Case: Acc → Gen,Prep | gsd-test:test-s76 «остальных» |
| 11 | PROPN Gender: Masc → Neut | gsd-test:test-s112 «Ницше» |
| 10 | PROPN Case: Gen → Nom | gsd-test:test-s10 «Федора» |
| 10 | VERB Tense: Pres → Fut | gsd-test:test-s447 «переводится» |
| 9 | DET Case: Nom → Dat,Gen,Ins,Prep | taiga-test:6157 «какой» |
| 9 | NOUN Case: Nom → Acc,Gen | gsd-test:test-s80 «МИСТИКА» |
| 8 | NOUN Case: Dat → Acc,Nom | gsd-test:test-s314 «стратиграфии» |
| 8 | VERB Mood: Imp → Ind | gsd-test:test-s331 «Откроем» |
| 7 | ADJ Number: Plur → Sing | taiga-test:uch-nauch--encicl_phil--encicl15-45 «глиняным» |
| 7 | NOUN Case: Dat → Loc | gsd-test:test-s478 «году» |
| 7 | NOUN Case: Nom → Acc | taiga-dev:poetry-rnc-abstract-51 «дух» |
| 7 | NOUN Case: Nom → Dat,Prep | taiga-dev:poetry-rnc-abstract-249 «горе» |
| 7 | NUM Case: Acc → Gen,Prep | taiga-test:7217 «нескольких» |

### Feature keys the gold has and our first reading lacks

| n | gold UPOS, feature: gold value → ours | example |
|---:|---|---|
| 4861 | VERB Voice: Act → (absent) | gsd-test:test-s1 «начал» |
| 742 | PRON Animacy: Inan → (absent) | gsd-test:test-s12 «которому» |
| 628 | PRON Gender: Neut → (absent) | gsd-test:test-s21 «того» |
| 454 | AUX Voice: Act → (absent) | gsd-test:test-s183 «быть» |
| 392 | VERB Animacy: Inan → (absent) | gsd-test:test-s10 «подготовленными» |
| 241 | ADJ Animacy: Inan → (absent) | gsd-test:test-s15 «французские» |
| 230 | VERB Case: Nom → (absent) | gsd-test:test-s1 «приглашён» |
| 218 | NOUN Number: Sing → (absent) | gsd-test:test-s22 «такси» |
| 175 | NOUN Animacy: Inan → (absent) | gsd-test:test-s29 «Тук-тук» |
| 167 | ADV Degree: Cmp → (absent) | gsd-test:test-s26 «менее» |
| 153 | PRON Number: Sing → (absent) | gsd-test:test-s112 «чём-то» |
| 147 | ADJ Variant: Short → (absent) | gsd-test:test-s314 «возможно» |
| 146 | ADJ Number: Sing → (absent) | gsd-test:test-s314 «возможно» |
| 142 | PRON Animacy: Anim → (absent) | gsd-test:test-s18 «который» |
| 140 | ADJ Gender: Neut → (absent) | gsd-test:test-s314 «возможно» |
| 127 | DET Animacy: Inan → (absent) | gsd-test:test-s23 «свои» |
| 126 | NUM Animacy: Inan → (absent) | gsd-test:test-s5 «несколько» |
| 124 | PROPN Number: Sing → (absent) | gsd-test:test-s22 «Такси» |
| 117 | NOUN Case: Nom → (absent) | gsd-test:test-s29 «Такси» |
| 116 | NUM Number: Sing → (absent) | gsd-test:test-s7 «одним» |
| 100 | VERB Animacy: Anim → (absent) | gsd-test:test-s1 «приглашён» |
| 94 | VERB Voice: Pass → (absent) | gsd-test:test-s177 «развит» |
| 92 | PRON Gender: Masc → (absent) | gsd-test:test-s432 «кто» |
| 85 | NOUN Case: Gen → (absent) | gsd-test:test-s22 «такси» |
| 85 | NOUN Gender: Masc → (absent) | gsd-test:test-s29 «Тук-тук» |
| 72 | PROPN Case: Gen → (absent) | gsd-test:test-s32 «ССР» |
| 72 | VERB Aspect: Imp → (absent) | gsd-test:test-s75 «определяющий» |
| 69 | PROPN Case: Nom → (absent) | gsd-test:test-s22 «Такси» |
| 65 | VERB VerbForm: Part → (absent) | gsd-test:test-s75 «определяющий» |
| 60 | VERB Mood: Ind → (absent) | gsd-dev:dev-s268 «нет» |
| 58 | NOUN Number: Plur → (absent) | gsd-test:test-s29 «Такси» |
| 55 | VERB Tense: Pres → (absent) | gsd-test:test-s75 «определяющий» |
| 54 | VERB VerbForm: Inf → (absent) | gsd-test:test-s96 «составляться» |
| 52 | PRON Case: Acc → (absent) | gsd-test:test-s174 «что» |
| 50 | NOUN Animacy: Anim → (absent) | gsd-test:test-s3 «уполномоченным» |
| 48 | NOUN Gender: Fem → (absent) | gsd-test:test-s179 «Осенью» |
| 48 | PROPN Animacy: Anim → (absent) | gsd-test:test-s63 «Элис» |
| 45 | VERB Tense: Past → (absent) | gsd-test:test-s177 «развит» |
| 43 | VERB VerbForm: Fin → (absent) | gsd-dev:dev-s268 «нет» |
| 41 | NUM Case: Acc → (absent) | gsd-dev:dev-s57 «несколько» |
| 41 | VERB Aspect: Perf → (absent) | gsd-test:test-s177 «развит» |
| 40 | DET Number: Sing → (absent) | gsd-test:test-s398 «одна» |
| 40 | NOUN Case: Ins → (absent) | gsd-test:test-s72 «рядом» |
| 38 | VERB Person: 1 → (absent) | taiga-test:6083 «Собираем» |
| 33 | NOUN Case: Acc → (absent) | gsd-dev:dev-s93 «сегодня» |
| 33 | NUM Case: Nom → (absent) | gsd-test:test-s5 «несколько» |
| 32 | NUM Animacy: Anim → (absent) | gsd-test:test-s7 «одним» |
| 31 | NOUN Gender: Neut → (absent) | gsd-test:test-s201 «кое-что» |
| 31 | PRON Case: Nom → (absent) | gsd-test:test-s155 «что» |
| 30 | DET Gender: Neut → (absent) | gsd-test:test-s47 «Все» |
| 29 | PRON Person: 3 → (absent) | gsd-test:test-s245 «Это» |
| 27 | DET Animacy: Anim → (absent) | gsd-test:test-s398 «одна» |
| 27 | DET Gender: Masc → (absent) | gsd-test:test-s79 «том» |
| 24 | NOUN Case: Loc → (absent) | gsd-test:test-s224 «г» |
| 24 | PROPN Case: Loc → (absent) | gsd-test:test-s53 «Тбилиси» |
| 23 | NUM Gender: Masc → (absent) | gsd-test:test-s73 «Оба» |
| 23 | PROPN Gender: Masc → (absent) | gsd-test:test-s93 «Хилы» |
| 22 | ADJ Animacy: Anim → (absent) | gsd-test:test-s17 «последний» |
| 22 | ADJ Case: Nom → (absent) | gsd-test:test-s19 «должен» |
| 22 | ADV Degree: Sup → (absent) | gsd-test:test-s210 «наиболее» |

## What these figures do and do not show

- **First-reading accuracy without a parser.** "@1" asks whether the reading the analyser puts first is right. The analyser has only context rules (government, agreement, numerals), no full syntactic parse, so a form whose readings differ (стали: noun or verb; мой, все) is a coin the rules may or may not toss correctly. "@any" shows what a learner who looks at the alternatives would find; the gap between @1 and @any is the room context ordering has.
- **Coverage counts only confirmed readings.** A reading guessed from an ending is marked `unconfirmed` and never counts as covered, however good the guess.
- **Conventions that differ from the pack.** UD writes the prepositional case as Loc (the pack: Prep, and Loc only for the second locative) and the partitive as Par; the lenient rules map them. UD marks Degree=Pos, Voice=Act and a few more keys that the pack leaves unmarked; Degree=Pos is dropped from comparison, and where the pack writes no value that is not an error in the lenient figure but is in the strict one. UD lemmatizes participles under their verb in some places and under the adjective in others; UD has AUX, CCONJ and SCONJ where the pack has VERB and CONJ; UD lemmas may write е for ё; Wiktionary files мой, этот, весь under several headings (the lenient rule accepts DET for PRON). A figure that looks like an analyser error may be a convention difference: read the miss lists before tuning.
- **Tokens excluded** are listed above; the rates describe Cyrillic word tokens only, not punctuation, digits or Latin text, and not the tokens whose boundaries differ from the gold's.
- **Independence.** The same team wrote the analyser and this harness, so the harness was unit-tested on hand-made inputs (test/adapters/russian-gold.test.ts) before the numbers were read. The gold is other people's human annotation. GSD test and dev share a source with GSD train, which gives the analyser its lemma counts: they are held out but not independent of that prior; Taiga (another genre) and PUD (translated text, fully independent) are the fairer tests of generalisation.
- **Not shown:** quality of glosses, stress, aspect partners, constructions, phrases, or anything about learners; accuracy on text outside these genres (fiction, speech, verse beyond what Taiga holds); the second and later readings' order.

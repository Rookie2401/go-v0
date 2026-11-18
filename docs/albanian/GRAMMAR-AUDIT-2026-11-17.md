# Albanian grammar audit (Standard Albanian, `sq`), 2026-11-17

Auditor: the Albanian grammar-audit agent (an AI model, not a native speaker). Code audited: master `985c742b`
(read-only clone `go-v0-rc`), adapter `adapter-sq@9`. Brief from the owner: audit the linguistic content, be brutal, note
every missed feature and detail, and weigh every finding against what the GoLearn card actually shows.

## 1. Verdict

Albanian sits between German and Norwegian. The rules are mostly right; the card is not fit for a learner yet.

- **The generated forms are mostly correct, the vocabulary is small.** I read every generated form of all 1,266 rows
  (771 nouns, 48 names, 283 verbs, 164 adjectives). About 150 forms in about 45 rows are wrong (section 5). But 358 of
  723 everyday words I checked (50 %) are unknown to the adapter, among them *ndonjë, sapo, vjet, rroj, uroj, blu, gri,
  milion, dyqind, sime, sate, tjetri, polici, televizion*.
- **Three mechanisms turn correct Albanian into a wrong reading that looks sure.** (a) The "typed without ë" repair is
  applied to correctly spelled words: *rritet* ("grows") is shown as *rritët*, "You (plural) raised", with the note
  "Spelling differs from today's standard"; *studente* (a woman student) is shown as the masculine plural *studentë*.
  (b) Verbs listed only in their non-active form swallow the active verb: *ndodh* ("happens"), *lind*, *nis*, *ul* are
  shown as "third person singular, aorist, non-active" of *ndodhem, lindem, nisem, ulem*. (c) The little words:
  *kisha* ("I had") is "the church" in four of the six sentences I tried; *të* before any adjective the list lacks is "subjunctive
  particle"; *një* is "one (1)" in 13 of 13 uses as the article.
- **On 513 words of ordinary text the card was blank for 29 (5.7 %), guessed 11 (2.1 %), and showed a wrong reading as
  confirmed for about 35 (6.8 %).** Another 20 or so were left undecided although the sentence decides them.
- **The verb system has large holes.** The optative and admirative exist only for regular verbs in *-oj* and for
  *jam / kam*: *rroftë, bëftë, ardhtë, vdeksh, ditka, paskësha* are blank. The imperative with an attached pronoun is
  read as an imperfect (*Shikoje!* = "You were looking at"). *lë, vë, zë* have no imperfect and no singular imperative
  (*lër, linte* blank). Most transitive verbs have no non-active forms (*dihet, sillet, takohemi, mësohet*).
- **"All forms" is merged with Wiktionary's table, and the merge is not a safe second source.** Of 1,671 conflicting
  cells, 1,131 differ only by Wiktionary's leading *të*; in the rest Wiktionary's form is printed first even where it is
  the wrong one (*mësuës* for mësues, *vova* for vuajta, the whole table of *mik* under *mikeshë*). For 372 of 1,253
  words there is no Wiktionary table and the rule output stands alone, wrong forms included.

Honest labels ("machine-drafted", "unconfirmed", "Sources disagree") are present. They are also printed on correct basic
forms (*dha, pa, vdiq, koka, lufta*), which teaches the learner to ignore them.

## 2. How this was audited, and the numbers

1. Read in full: `sq.ts`, `analyze.ts`, `types.ts`, `morphology.ts`, `orthography.ts`, `morph-noun.ts`,
   `morph-adjective.ts`, `morph-verb.ts`, `morph-verb-guess.ts`, all four lexicon files, `function-*.ts`, `clitics.ts`,
   `gheg.ts`, `historical.ts`, `varieties.ts`, `phrases.ts`, `describe.ts`, the head of `disputed.ts` and of
   `paradigm.ts`, the pack and the orientation. NOT read line by line: `sentence-*.ts`, `syntax*.ts`,
   `constructions.ts`, `production.ts`, `table-tags.ts`, `tags.ts`; they were tested through the probes only.
2. Dumped every generated form of every lexicon row and every closed-class form (`dump.mts`, five `dump-*.txt` files)
   and read all of it.
3. Rebuilt the card's "All forms" table for all 1,253 distinct nouns, names, verbs and adjectives exactly as
   `content/enrich.ts` does (rules merged with `public/dict/sq/full`, Wiktionary's tables) and listed every cell where
   the two sides differ (`merge.mts`, `merge-conflicts.txt`, `merge-real.txt`). This gave a second opinion on my own
   reading of the dump.
4. Ran **614 word-in-sentence probes** through the card's own `parseSelection` and dictionary lookup (`b1`–`b7`, `b9`;
   three probes hit a letter inside another word and are not used), plus 12 in long mode and 15 in pronunciation mode.
5. Ran **513 words of running text** word by word (`text.txt`, `cover.out`): everyday narrative, a news paragraph, a
   conversation, article 1 of the human-rights declaration, the Lord's Prayer and John 3:16 (the last three from memory).
6. Checked 723 everyday words against the adapter's own data (`core.mts`).

Everything is in `C:\Users\CJWal\dev\tmp-mem\sqaudit\`.

| Measure | Albanian |
|---|---|
| Running text: words with **no reading** (blank card) | 29 of 513 (5.7 %) |
| Running text: **unconfirmed guess** | 11 (2.1 %); 4 of them with a wrong lemma or word class |
| Running text: common word shown as a name | 0 |
| Running text: reading shown as confirmed that is **wrong** (hand count) | about 35 (6.8 %) |
| Running text: left **undecided** although the sentence decides it (hand count) | about 20 (3.9 %) |
| Running text: *një* shown as the numeral "one (1)" where it is the article | 13 of 13 |
| Everyday words unknown to the adapter's data | 358 of 723 (50 %) |
| Targeted probes: blank card | 99 of 614 |
| Targeted probes: unconfirmed guess | 34 of 614 (10 of them names) |
| Wrong generated forms found in the word list | about 150, in about 45 of 1,266 rows |
| "All forms" cells over 1,253 words: rule and Wiktionary agree | 13,004 |
| "All forms" cells: rule only (no second source) | 8,307 |
| "All forms" cells: Wiktionary only | 5,532 |
| "All forms" cells: conflict | 1,671 = 1,131 (only a leading *të*) + 39 (only a stress mark) + 501 real, in 82 words |
| Words with no Wiktionary table at all | 372 of 1,253 |

The probes were chosen to find faults, so their rates are not coverage figures; the running-text rows are. The two hand
counts could be off by a few either way.

## 3. What the card shows, and what is wrong with each part

| Part of the card | State | Section |
|---|---|---|
| Lemma, part of speech | Blank for 5.7 % of running words; wrong for about 7 %; half of everyday vocabulary missing | 4.1–4.4 |
| Form line | Person not narrowed when the subject is a noun; adjective gender and number rarely narrowed; the article's line prints the whole table | 4.5 |
| Own meaning | "-ing" for every participle; bare infinitive for optative, admirative and every non-active form; "You …" for third-person forms | 4.11 |
| Notes | "Spelling differs from today's standard" on correctly spelled words; "Sources disagree" on *dha, pa, vdiq, koka* | 4.3, 4.10 |
| Names | A known name declines; an unknown name keeps its case ending as its lemma and shows no case | 4.6 |
| Text without ë / ç | Works for long words; fails for *te, ne, me, pune, kohe, kete* and for a word with ç but no ë | 4.7 |
| Gheg / Kosovo | A dozen listed forms and three patterns; participles *pas, kanë, ditë* read as other words | 4.8 |
| Dictionary meaning | Usually right; first sense sometimes absurd for the word in hand | 4.12 |
| Fixed phrase | 77 units and three seed rules; they work; many everyday ones missing | 4.13 |
| Grammar notes | Fire where the reading is right; mislabel the conditional perfect and *kam për të*; none for the passive with *jam* | 4.14 |
| Role in the sentence | Wrong wherever the reading is wrong; odd labels for abbreviations and copula sentences | 4.15 |
| Pronunciation | Letter notes only, correct; no stress, no respelling | 4.17 |
| "All forms" | Rule output merged with Wiktionary; Wiktionary's cell wins a conflict even when it is the wrong one | 4.18, 5 |

## 4. Findings on the card

Each line was seen in the probe output unless marked "from the code".

### 4.1 The card is blank

- **Optative and admirative outside the *-oj* class:** *Rroftë* (Shqipëria), *bëftë* (të bëftë mirë; u bëftë), *ardhtë*,
  *vdeksh*, *ditka*, *Paskësha*. (*ndihmoftë, shenjtëroftë, punuaka, qenka, paska, qofsh* work.)
- **Forms the tables build wrongly, so the real form is unknown:** *dojë* (table: dashë), *bini* (table: bieni), *blini,
  blinte, Bli* (table: bleni, blente), *Zbrisni*, *Nxirrni* (table: nxirni), *rriste* (table: rritte), *shkëlqeu* (table:
  shkëlqei), *kekë* (table: keqe), *shakatë* (table: shakat).
- **Forms the tables lack:** *Lër, Lëre, Vëre, linte* (no imperfect and no singular imperative for lë, vë, zë); *nisi*
  (only nisem exists; the dictionary line then says "island"); *U desh*; *familjeje, gruaje* (indefinite genitive of
  every noun in *-je* and of grua); *Jepmë, Dëgjomë* (imperative + më); *t'ju*; *ç'orë*; *netë*.
- **Pronouns and possessives:** *sime, sate, sonë, suaj* (feminine genitive-dative of every possessive: *motrës sime*),
  *vet*, *askënd, askujt, Dikë, Tjetri, dyja* (të dyja), *Ndonjë, Ca, Kurrgjë, Njëri-tjetrin*.
- **Nominalised adjectives:** *(I) pari, (e) keqja, (të) rinjtë*.
- **Prepositions, conjunctions, particles:** *Përballë, Përtej, Sipër, Krahas, Gjer, Sapo, Meqë, sikurse, Domethënë,
  Bile, dot, Patjetër, dakord, Hajde, Zotëri, (së) shpejti, Qysh*.
- **Numbers:** *Dyqind, milion, çerek, njëzetë* (ordinal), *qind* (për qind), *përqind*.
- **Adjectives:** *blu, gri, rozë, interesant, sjellshëm, fillore, ardhshëm, këndshëm, barabartë, përditshme, zier,
  plagosur* (and so the *të* before each is misread, 4.4).
- **Everyday nouns and verbs:** *uri, etje, malli, mend, persona, policia, Opozita, Kryeministri, autostradë, Moti,
  Misri, ndërgjegje, vëllazërimi, vullneti, tundim, italisht, këngëtare*; *Rroj, uroj, funksionon, Kërceu, sillen*.
- **Names at the start of a sentence:** *Arben, Skënderbeu* (blank; inside a sentence they are an unconfirmed name).
- Section 2 gives the wider picture: 358 of 723 everyday words unknown (the full list is `core.out`).

### 4.2 The card shows a wrong reading and looks sure of it

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| Sot u zgjova herët, sepse kisha shumë punë. / Unë kisha një qen. / Kur isha i vogël, kisha një biçikletë. / Sikur të kisha para! | kisha | **kishë**, noun, "church", definite nominative, 0.85 | kam, 1st singular imperfect, "I had" (right only in *Nuk kisha kohë* and *Kisha punuar atje*) |
| Kjo ndodh shpesh. | ndodh | **ndodhem**, 3rd singular **aorist, non-active**, 0.85 | ndodh, present, "happens" |
| Dielli lind në lindje. | lind | **lindem**, 3rd singular aorist, non-active, "to be born" | lind, present, "rises" |
| Filmi nis në orën tetë. | nis | **nisem**, aorist, non-active, "to set out" | nis, present, "starts" |
| Ul zërin! | Ul | **ulem**, 3rd singular aorist, non-active, "to sit down" | ul, imperative, "lower" |
| E fiku dritën. | fiku | fik, **2nd singular imperative, non-active** | 3rd singular aorist, "he switched off" (the table has *fiki*) |
| Shikoje! / Lexoje librin! | Shikoje, Lexoje | 2nd singular **imperfect**, "You were looking at", "You were reading" | imperative + *e*: "Look at it!", "Read it!" |
| Hapeni derën! | Hapeni | 2nd plural **present, non-active** | imperative plural with *e* inside: "Open it!" |
| Mos e prek! | prek | **1st singular** present subjunctive | 2nd singular imperative |
| Na i fal fajet tona | fal | 1st singular present | 2nd singular imperative |
| Më jep librin! / Bukën tonë … na e jep sot | jep | "second or third person singular, present", "You give" | imperative |
| Bie shi. / Më dhemb koka. / Fëmija fle. | Bie, dhemb, fle | **1st** singular, "I fall", "I hurt", "I sleep" | 3rd singular |
| Kjo është shtëpia ime e re. | re | **bie**, 2nd singular aorist, "You fell" | i ri, feminine, "new" |
| Të fala nga unë. | fala | **fal**, 1st singular aorist, "I forgave" | të fala, "greetings" |
| Falë ndihmës së tij. | Falë | **fal**, 3rd singular subjunctive, "to forgive" | falë, preposition, "thanks to" |
| Kurse unë rri këtu. / …, kurse im vëlla luajti | Kurse | **kurs**, noun, plural, "course" | kurse, conjunction, "whereas" |
| Vallë a do të vijë? | Vallë | **vallë**, noun, "folk dance", "subject of vijë" | particle, "I wonder" |
| Mbuloi me dhe. / si në qiell ashtu edhe mbi dhe | dhe | conjunction "and" | dhe, noun, "earth" (not in the list) |
| Drita e diellit. | Drita | **Drita**, woman's name, 0.9 | dritë, "the light" |
| Luan me top. | Luan | **Luan**, man's name, 0.9 | luaj, "plays" |
| Kam pas shumë punë. | pas | preposition "after, behind" | Gheg participle of kam |
| Me fal, s'e kam ditë. | ditë | noun "day", "direct object of kam" | Gheg participle of di |
| Ku je kanë? | kanë | kam, "They have" | Gheg participle of jam |
| Vajza asht e bukur si zâna. | zâna | **zë**, "voice", plural | zanë, "fairy" |
| Nuk kam ç'të bëj. | ç'të | ti, short pronoun, "direct object of bëj" | ç' + particle të |
| Ky është djali të cilit i dhashë librin. | cilit | **genitive**, "noun that modifies djali" | dative |
| me reshje shiu | shiu | definite **nominative** | indefinite ablative, "of rain" |
| folëm gjatë për kohët e vjetra | gjatë | preposition | adverb, "for a long time" |
| Jam mirë. / Ai flet mirë shqip. | mirë | **i mirë**, adjective, "masculine or feminine singular" | adverb, "well" |
| Jam i martuar. / Ajo është e martuar. | martuar | martohem, participle, "marrying" | i martuar, "married" |
| Të folurit e tij është i qartë. | folurit | noun, "genitive, dative or ablative", "indirect object of qartë" | neuter verbal noun, nominative |
| Të vdekurit nuk flasin. | vdekurit | singular, "genitive, dative or ablative", "indirect object of flasin" | plural nominative, "the dead" |
| Zoti Hoxha erdhi. | Zoti | zot, "Lord; God" | zoti, "Mr" |
| Ai merret me sport. | merret | marr, non-active, "to take, to get" | merrem me, "go in for" |

**Why (from the code).** There is no parser and no weighing of how common a reading is. *kishë* stands before *kam* in
the list order, and only *nuk*, a clitic or a participle after it rescues the verb. The twenty-nine verbs listed as
"non-active only" (ulem, nisem, lindem, ndodhem, dukem, mbetem …) generate the bare stem as their third-person aorist
(*u ul, u nis*), and their active partners (ul, nis, lind, ndodh, shfaq, kënaq, habit, bind, largoj, afroj, martoj) are
not in the list. An imperative with attached pronouns is tried only when the whole form is otherwise unknown, and
*shikoje, lexoje, hapeni* are known as imperfect or non-active forms.

### 4.3 Correctly spelled words "corrected" into other words

The repair for text typed without ë (`restoreDiacritics`) runs for any form the list lacks. A Standard form that happens
to differ from a known form by *e / ë* is therefore replaced, and the card adds the note **"Spelling differs from
today's standard (rritën)"**.

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| Fëmija rritet shpejt. | rritet | rrit, **2nd plural aorist**, "You (plural) raised", 0.7 | 3rd singular present, non-active, "grows" |
| Fëmijët rriten shpejt. | rriten | 3rd plural aorist, "They raised" | "they grow" |
| Unë rritem në fshat. | rritem | 1st plural aorist, "We raised" | "I grow up" |
| Peshku kapet me rrjetë. | kapet | "You (plural) caught" | "is caught" |
| Treni ndalet këtu. | ndalet | "You (plural) stopped" | "stops" |
| Buka prishet shpejt. | prishet | "You (plural) spoiled" | "goes bad" |
| Mysafirët priten mirë. | priten | "They waited" | "are received" |
| Moti pritet të jetë i ftohtë | pritet | pres, 2nd plural aorist | "is expected" |
| Ajo është studente. | studente | student, **masculine plural** | studente, a woman student |
| Ajo është gazetare. | gazetare | gazetar, masculine plural | gazetare, a woman journalist |
| Motra e Benit është mjeke. | mjeke | mjek, masculine plural | mjeke, a woman doctor |

From the code, the same happens to the non-active present of every consonant-stem verb that is not flagged `nonActive`
(fal, fut, kap, rrit, ndal, puth, humb, prish, vendos, shpall, shtyp, mbyt, zhduk, porosit, pres, pyes, zgjedh, vjedh)
and to every feminine in *-e* beside a listed masculine with a plural in *-ë*.

### 4.4 The little words

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| një vezë të zier; peshk të pjekur; peshk të freskët; të plagosur; qëndrim të këndshëm; të barabartë; të përditshme; të vetëmlindurin | të | **subjunctive particle** (8 times in the running text) | linking article |
| Të gjithë njerëzit; u lagëm të dy; Të shtunën | Të, të | subjunctive particle | article of *të gjithë, të dy, të shtunën* |
| kushdo që beson në të | të | subjunctive particle | pronoun, "him" |
| Buka e misrit. | e | **short object pronoun** | linking article (the noun after it is not in the list) |
| Nëna e babai. | e | short object pronoun | conjunction "and" |
| muajin e kaluar; vitin e ardhshëm | e | short object pronoun | linking article |
| një koleg i ri, i cili ka ardhur; nga i ligu | i | short pronoun, dative | linking article |
| I pashë fëmijët. / na i fal fajet tona | I, i | 3rd **singular dative** | 3rd plural accusative, "them" |
| U thashë të vijnë. | U | non-active particle | "to them" |
| u lagëm; u shenjtëroftë emri yt | u | short pronoun, "to them" | non-active particle |
| Kam një libër. (13 of 13 in the text) | një | numeral, "one (1)" | indefinite article |
| Punon si mjek. / si në qiell | si | adverb, interrogative, "how" | "as" |
| Mendoj që ke të drejtë. / që … të mos humbasë | që | relative pronoun | conjunction "that", "so that" |
| Që nga dje | Që | relative pronoun | "since" |
| Po të duash, eja. / Po ju? | Po | progressive particle | "if"; "and (you)?" |
| Nuk dua më. | më | short pronoun, "direct object of dua" | adverb, "any more" |
| Edhe pse ishte vonë | pse | interrogative "why" | part of *edhe pse*, "although" |
| Kur u ktheva në shtëpi | Kur | adverb, interrogative | conjunction |
| aq botën, sa dha | sa | adverb, interrogative | conjunction |

Good: *e / i / të / së* before a listed adjective or a listed noun in the genitive are read as the linking article and
tied to their adjective as one unit ("i mirë"); *ta, t'i, ma, ia, ua, jua* are taken apart correctly; *do të* is the
future; *tij* after *ndaj* is the ablative pronoun and after *e* the possessive.

### 4.5 The form line is not narrowed, or says too much

- **Person with a noun subject.** *Djali lexon* shows "second or third person singular", meaning "You read"; so do
  *Kushton, beson, mungon, pëlqen, vjen* ("You cost", "You are absent", "You come" in *Më vjen keq*). A pronoun subject
  narrows it (*Ajo flet*); a noun subject never does.
- **Imperative.** *Punoni bashkë!*, *Merrni frymë thellë*, *Më jepni pasaportën*, *Urdhëroni* show "present indicative
  or subjunctive", "You (plural) work".
- **Adjective agreement.** *Sytë e saj janë të kaltër*, *Djemtë janë të lodhur* show "masculine or feminine
  **singular**" (they are plural); *vajza më e bukur*, *Dera është e hapur* show "masculine or feminine"; *shqiptare,
  malore, kuqe* show "singular or plural".
- **The linking article** before an adjective often prints "agrees with a masculine or feminine singular or plural noun
  in the nominative, accusative, genitive, dative or ablative": the whole table as a sentence (*kafe të fortë*, *orë të
  tëra*, *të larta*, *jetë të përjetshme*).
- **Case.** The role line says "indirect object" and the form line still says "genitive, dative or ablative" (*Ia dhashë
  librin djalit*, *Vajzës i dhanë*, *Ua dhashë lulet vajzave*). *I kujt është ky libër?* leaves *kujt* at "genitive,
  dative or ablative" after the article *I*.
- **Voice.** *U lava* shows *lava* as plain "first person singular, aorist", "I washed"; *Çmimet u rritën* shows "They
  raised"; *u lagëm* is active. The *u* is recognised (the note "non-active with u" fires) and the verb is not changed.
- *orë* in *për orë të tëra* is "singular" beside a plural adjective.

### 4.6 Names

- A name in the list declines well: *Agimin, Tiranës, Shqipërisë, Kosovës, Dritën, Benit* get lemma, case and gloss.
- **A name outside the list keeps its ending as its lemma and gets no case:** *Arbenin* → lemma "Arbenin"; *Arbenit*,
  *Prizrenit*, *Kadaresë*, *Skënderbeut*, *Besnikun* the same (0.4, unconfirmed). The noun guesser knows these endings
  and is not asked.
- A name at the start of a sentence is blank (*Arben, Skënderbeu*).
- *Shqiptarët* is an unconfirmed guess (shqiptar is listed only as an adjective).
- Cast names win over common words: *Drita e diellit* and *Luan me top* (4.2); *Dritës i pëlqen kafja* shows "light".

### 4.7 Text typed without ë and ç

Works: *Une, Shqiperia, Cfare, ben, Eshte, shume, mire, shtepi, pelqen, Per, nje, gje, Nena, jane, behet* are read as the
proper word at 0.7 with the note. Fails exactly on the commonest words, because the plain spelling is itself a word:

| Typed | The card shows | Meant |
|---|---|---|
| Dua **te** shkoj **ne** shtepi. | te: preposition "at, to"; ne: pronoun "we, us", "direct object of shkoj" | të, në |
| **Me** pelqen shume. | preposition "with" | më |
| **Kete** e di. | kam, 3rd singular subjunctive (*ketë*), 0.5 | këtë |
| kam shume **pune** / S'kam **kohe** | "indefinite genitive, dative or ablative", "indirect object of kam" | punë, kohë |
| **Çfare** ke? / Ku eshte **çelesi**? | blank | çfarë, çelësi (a form that already has ç or ë is never repaired) |
| Flm, Ckemi, Tung | blank | chat spellings; the dictionary line knows *flm* and *tung* |

Every feminine noun in *-ë* has a real form in *-e* (pune, kohe, dite, shkolle), so its unaccented spelling is always
read as that case.

### 4.8 Gheg and Kosovo usage

- Related correctly, with the label: *asht, nji, shpi, tash, çka, due, bân, tue, punue, shkue, shkrue, Grueja*.
- *Due me shkue*: *me* is the preposition "with"; nothing says that *me* + participle is the Gheg infinitive.
- Wrong: *pas, ditë, kanë* (participles, 4.2), *zâna*. Blank: *ardhë, muj, vi, du, Nana, Kqyre, Qysh*. *falemnderit*
  is a guessed noun "falemnder".
- From the code: twelve listed pairs, nasal vowels, *-ue / -ye*, nothing else. No *-un* participle rule, no *kam me* +
  participle future, no *po e* / *pe* progressive, no *kah, qysh, bash, krejt, hiq*. The pack says Gheg is "not
  analysed"; that is accurate.

### 4.9 The guesser for unknown words

- A guessed verb in *-oj* is usually right (*arrestoi, miratoi, kritikoi, investoi, diskutuan*) and has no meaning; the
  dictionary line below it has one for some.
- **It does not ask the word list first.** *Takohemi, mësohet* are "unconfirmed, not in the word list" although *takoj*
  and *mësoj* are listed (they lack the non-active flag); *mësohet* also offers a noun "mësoh".
- Wrong guesses: *vjet* → noun **"vj"**, "definite plural" (one of the commonest words; the dictionary line says "last
  year"); *ujët* → "uj"; *Kryet* → "kry"; *moshave* → "mosh"; *tjerët* → "tjer"; *dihet* → noun "dih"; *sillet* → noun
  "sill"; *përmendet* → noun "përmend"; *Rrobat* → "rrob"; *lindin* → noun "lind"; *financave* → "financ"; *dinjitet* →
  "dinjit"; *freskët* → "fresk"; *Televizioni* → verb **"televizioj"**, 2nd plural; *falemnderit* → "falemnder".
- *lotët* and *sallatën* are guesses with no gloss although both nouns are listed (their tables are wrong, section 5).

### 4.10 Warnings on correct forms

The engine caps a reading at 0.55 with the note "Sources disagree" when its own source comparison (434 pairs in
`disputed.ts`) lists the form. That list mixes real errors (*bieni, dashë, arsyenë, fiki, zhduki, bërtitte*) with correct
basic forms. On the card: *dha* (Më dha dorën) 0.55 "Sources disagree"; *pa* 0.55; *vdiq* 0.55; *Koka* 0.55;
*Lufta* 0.55; *u martuan* 0.55; *u ula* 0.55; *Linda* 0.55; *tha, ra, thirra, Hartat* 0.75. Nobody has gone through
the list; it should be resolved, not shipped.

### 4.11 The own-meaning line

- **Every participle is glossed "-ing":** *Kam punuar* "working", *Kam qenë* "being", *Ka rënë borë* "falling", *E kam
  parë* "seeing", *Më kanë dhënë* "giving", *Jam lindur* "being born". The Albanian participle is a past participle
  ("worked, been, fallen, seen"); "-ing" fits only after *duke*.
- **Optative, admirative and every non-active form get the bare infinitive:** *Qofsh* "to be", *Paske* "to have",
  *punuaka* "to work", *hapet* "to open", *quhesh* "to be called", *lahem* "to wash". The forms that most need an
  English prop get none.
- Third-person forms left at "2nd or 3rd person" are glossed "You …" (4.5).
- *lutem* in *Ju lutem* is "to pray" (the phrase line gives "please").
- *verë* is glossed "summer (also: wine)": two words in one row.

### 4.12 The dictionary meaning line

- Absurd or wrong first sense for the word in hand: *Bile* "weenie (penis)" before "even, in fact"; *Dikë* "great
  desire, lust, envy"; *Gjer* "dormouse"; *krenar* "a male given name"; *nisi* "island"; *Bli* "linden"; *Vëre* "hole";
  *sillet* "(archaic) alternative form of cili"; *Hyri* second sense "god, deity"; *unë, më, ma* second sense
  "potsherd"; *do* (future particle) "some"; *të* (particle or pronoun) "adjectival article for: …"; *kap* shows its own
  headword line "kap (aorist kapa, participle kapur)" as a meaning; *Vajza* second sense "a river in Albania"; *ndodhi*
  "event, occurrence"; *kokë* second sense "heading".
- No meaning at all for: *sallatë, serioz, interesant, rozë, persona, përqind, Skënderbeu, Policia, milion, Dyqind,
  investoj, situatë, Ndonjë, askënd, sate, sonë, suaj, Secili, italisht, rriten, shpejti, Sapo, sigurisht*.
- `dict/sq/frequency.json` is not a frequency list of Albanian: 49,043 of its 74,643 counted words come from the
  course's own ladder units, 24,566 from 38 library texts. Its 17th, 21st, 22nd and 39th lemmas are *i mirë, çdo, qytet,
  gjyshe*. Anything ranked by it rests on the course's own prose.

### 4.13 Fixed phrases

- Found and right: *më vjen keq, ju lutem, si je, si quhesh, sa vjeç je, nga je, natën e mirë, ditën e mirë, mirë se
  vini / erdhe, me të vërtetë, kam të drejtë, kam kohë, kam uri, kam etje, mbaj mend, bie shi, bie borë, bën ftohtë,
  më pëlqen, më duhet, në vend të, sa më … aq më, shkoj te, vij nga, flas me*.
- A phrase never changes the headline: in *Kam uri* and *Mbaj mend* the selected word (*uri, mend*) is blank above the
  phrase.
- Missing (probed, no phrase): *s'ka gjë, më merr malli, edhe pse, së shpejti, të fala, për qind, të gjithë, të dy, po
  të, që nga, kam për të, jam dakord, më bie ndër mend, merrem me, marr frymë*. From the code (77 units and three seed
  rules), also absent: *s'ka problem, për shkak se, edhe … edhe, as … as, ose … ose, me gjithë mend, bëj dush, bëj
  pazar, marr vesh, vë re, zë vend, ia dal, ia vlen*.

### 4.14 Grammar notes (constructions)

- Fire correctly: future, perfect, pluperfect, progressive *po*, gerund *duke*, *për të* + participle, *pa* +
  participle, *me të* + participle, comparative and superlative, relative clause, clitic doubling, clitic cluster,
  negation with *nuk* and *mos*, question *a*, non-active with *u*, non-active present, admirative, optative, case after
  a preposition, possessive after the noun.
- *Do të kisha ardhur po të më kishe ftuar* is labelled **pluperfect** (it is the conditional perfect).
- *Kam për të shkuar në treg* is labelled **purpose** (*kam për të* is "I am to, I have to").
- *Shtëpia është ndërtuar mirë*, *Libri është shkruar nga një shkrimtar* get no note: *jam* + participle, the perfect
  of the non-active, is not a construction. Nor is the agent with *nga / prej*.
- No note for the Gheg infinitive (*me shkue*), for *mund / duhet* beyond "modal", for *le të*, for the conditional
  clause with *po të / sikur të / në qoftë se*, for clitic doubling of an indirect object named by a full pronoun
  (*Mua më pëlqen*), for *një* as article, for the definite form after *nga / te* beyond "nominative after
  preposition".
- The pack's own explanations contain two slips: "A feminine noun usually shows the object with **-në**: shkolla,
  shkollën" (the example shows *-ën*; *-në* is for *shtëpinë*), and neuter nouns are described as behaving "like a
  masculine singular and a feminine plural" (that is the *mal / male* type; a neuter is *ujët, të folurit, kryet*).

### 4.15 Role in the sentence

Wrong where the reading is wrong (4.2, 4.4). Also seen: *Kë pe?* "adverbial phrase of pe" (direct object); *Kujt ia
dhe?* "adverbial phrase of dhe" (indirect object); *Mua më pëlqen* "adverbial phrase"; *Ai punon natën* "direct object
of punon"; *Sot është e martë* "direct object of është"; *Ku është banja?* "direct object of Ku"; *Çfarë ore është?*
"indirect object of Çfarë"; *km, Dr, etj, P.sh* "discourse word with … (yes, no, hello …)"; *Le të shkojmë* and *A flet
shqip?* the same label for *Le* and *A*. In every copula sentence the subject is "subject of" the predicate noun
(*Kuajt janë në fushë*: "subject of fushë"; *Vëllezërit e mi janë në Tiranë*: "subject of Tiranë"), a parser
convention that reads oddly.

### 4.16 Numbers, abbreviations, tokens

- Cardinals 0–19, the tens, *njëqind, mijë* work, and compound numbers are separate words in Albanian, so *njëzet e një*
  is read. Missing: *dyqind … nëntëqind, milion, miliard, çerek*, *të dy / të dyja / të tre / të tria* as units.
- Ordinals stop at *i dhjetë*. *Kati i njëmbëdhjetë* shows the cardinal "eleven" as "noun that modifies Kati"; *i
  njëzetë* is blank.
- *vjet* (pesë vjet) is the guess "vj"; *vjeç* is 0.55 and "adjective describing tridhjetë".
- Abbreviations *km, kg, etj, p.sh, Dr, nr, shek* are read. A Roman numeral (*XX*) is read as a number.
- *Njëri-tjetrin, njëri-tjetrit* (with the hyphen) are blank; *njëri* alone is known.

### 4.17 Pronunciation

The card prints one line per letter that an English reader would missay (*gj, nj, q, x, xh, rr, ll, y, ë, ç, c, j, sh,
th, dh, zh*). I found no wrong line in 15 probes. There is no respelling and **no stress**: *faleminderit* and *kam* get
an empty line. The orientation's stress rule ("the last syllable of the basic word; one earlier before ë, -ër, -ël") is
a fair first rule and leaves out the large classes in *-e, -ur, -ull, -ës, -je* (LU-le, HA-pur, PO-pull, NXË-nës).

### 4.18 "All forms": the merge with Wiktionary

Unlike Norwegian and German, Albanian has full dictionary records (`public/dict/sq/full`, 14,471 records, 11,020 with
forms), and the card merges them with the rule table: a matching cell is "verified", a differing cell is "conflicted"
and **Wiktionary's form is printed, with the rule's form as the alternative**. Measured over all 1,253 words:

- **1,131 of 1,671 conflicts are false.** Wiktionary writes the subjunctive with its particle (*të punoj*); the rules
  write *punoj*. Every verb with a table therefore shows six "conflicted" subjunctive cells. Another 39 conflicts are
  only Wiktionary's stress mark (*gjárpri, thýer, të hólla, bërtítur*), and the accented form is the one printed.
- **Wiktionary's cell is wrong and is printed first** in at least these: *mikeshë* (the whole table is that of *mik*:
  miku, mikun, miq …); *mësues* (plural *mësuës, mësuësve*); *vuaj* (aorist *vova, vove, voi*; correct vuajta); *mbroj*
  (*mbrova, mbroi, mbruam*; correct mbrojta); *pres* (the table of the other verb *pres* "cut": *preva, preu*, and cells
  such as "pret (³pren)" with footnote marks); *lë* (*lëni, të lesh*; correct lini, lësh); *vdes* (*vdesni, vdiqi, të
  vdësh*); *hedh, mbledh* (*hedhni, mbledhni*; correct hidhni, mblidhni); *zgjedh* (*zgidhni*); *vesh* (*veshni,
  veshja*; correct vishni, vishja); *qesh* (aorist *qeshqesh*); *përfundoj* (*përfundojim, përfundojni*); *rregulloj,
  numëroj* (*regulloj, numeroj*); *muaj* (*muajtë*; correct muajt); *kufi* (*kufijt, kufijtve*); *ungjill, shkëmb*
  (*ungjijt, shkëmbinjte*); *komunë* (cells shuffled); *shpatull* (*shpatulln*); *atë* (*eti*); *i ulët* (masculine
  plural *të ulëta*); *krenari, guxim, qëndrim* (the records of the given names *Krenar, Guxim, Qëndrim*); *Ana* (the
  noun *anë*); *trashëgimi* (the record of *trashëgim*); *mbaj* (imperative "Mbaj!" with the capital and the mark).
- **Wiktionary's cell is right and corrects the rule** in these (all in section 5): *dua, bie, fik, zhduk, shkëlqej,
  bërtas, thërras, udhëheq, moshë, lot, anë, radhë, fletë, barrë, luftë, hundë, lëkurë, këmishë, kurriz, peshk, bujk*.
- For 372 words there is no Wiktionary table, among them *blej, nxjerr, zbres, ndjej, përziej, rrit, mat, sallatë, kek*
  (checked one by one with `merge1.mts`): their wrong forms stand alone and unmarked.
- Wiktionary adds cells the analyser cannot read in a text (*të mbroje, mbruakëshe, lagsha*): the table lists forms that
  give a blank card when met.
- Possessives have no table at all (*im*: "NO TABLE").

## 5. Every wrong form found in the word list

"Flagged" means the form is already in the project's own `disputed.ts`. "Check" means I am not certain.

### 5.1 Nouns (819 rows with the names)

| Row | The table shows | Correct |
|---|---|---|
| sallatë | definite *salata*, *salatën, salatës, salate*; plural *salata, salatat, salatave, salatash* (one l; flagged) | sallata, sallatën, sallatës, sallate; sallata, sallatat, sallatave |
| kek | plural *keqe, keqet, keqeve, keqesh* (the feminine of "bad"; *keqe* in *vajza e keqe* then offers kek as an alternative) | kekë, kekët, kekëve |
| lot | *lottë, lotve, lotsh* | lotët, lotëve, lotësh |
| moshë | plural *moshë, moshët, moshëve, moshësh* (flagged) | mosha, moshat, moshave |
| luftë | plural *lufta, luftat, luftave* | luftëra, luftërat, luftërave |
| anë, radhë, fletë, barrë | plural *ana, anat*; *radha, radhat*; *fleta, fletat*; *barra, barrat* | anë, anët; radhë, radhët; fletë, fletët; barrë, barrët |
| hundë, lëkurë, këmishë | plural *hunda, lëkura, këmisha* (flagged) | hundë, lëkurë, këmishë (Wiktionary's table and I agree) |
| arsye (two rows) | *arsyenë, arsyesë* (first row, flagged); definite plural *arsyetë* (second row) | arsyen, arsyes; arsyet |
| leje | definite plural *lejetë*; indefinite genitive *leje* | lejet; lejeje |
| shaka | definite plural *shakat*; no accusative or genitive | shakatë; shakanë, shakasë |
| vallë | lemma *vallë* (that is the particle); no accusative or genitive | valle, vallja, vallen, valles |
| kurriz | plural *kurriza* | kurrize (check) |
| peshk, bujk | ablative plural *peshqsh, bujqsh* (flagged) | peshqish, bujqish (check) |
| pasdite | definite *pasdita* (flagged) | pasditja (check) |
| kokë, hartë, meshë | plural *koka, harta, mesha*; Wiktionary's table says *kokë, hartë, meshë* | I believe koka and harta are right; check all three |

Missing, not wrong: the indefinite genitive of every noun in *-je* and of *grua* (familjeje, pyetjeje, gruaje); *vjet*
beside *vite*; a plural for *zot, mëngjes*; the noun *dhe* ("earth"); every neuter (*ujët, kryet, të folurit, të
ftohtët*): the code says "Neuter nouns are not covered".

### 5.2 Verbs (283 rows)

| Row | The table shows | Correct |
|---|---|---|
| dua | subjunctive 3rd singular *dashë* (flagged) | të dojë |
| bie | 2nd plural *bieni* (flagged) | bini |
| blej | 2nd plural and imperative *bleni*; imperfect *bleja, bleje, blente, blenim, blenit, blenin* | blini; blija, blije, blinte, blinim, blinit, blinin |
| nxjerr | *nxirni*; imperfect *nxirja, nxirje, nxirte, nxirnim, nxirnit, nxirnin* | nxirrni; nxirrja, nxirrje, nxirrte, nxirrnim, nxirrnit, nxirrnin |
| udhëheq | *udhëheqni*; imperfect *udhëheqja … udhëheqnin*; imperative *udhëheq* | udhëhiqni; udhëhiqja …; udhëhiq |
| fik, zhduk, lag | aorist 3rd singular *fiki, zhduki* (flagged), *lagi* | fiku, zhduku, lagu (Wiktionary's table agrees for two and says lagi for the third; check lag) |
| shkëlqej | aorist 3rd singular *shkëlqei* | shkëlqeu |
| pjek | a second aorist *pjeka, pjeke, pjeki, pjekëm, pjekët, pjekën* "kept as a variant" (flagged) | only poqa, poqe, poqi … |
| bërtas, thërras, zbres | imperfect 3rd singular *bërtitte, thërritte* (flagged), *zbritte* | bërtiste, thërriste, zbriste |
| rrit, fut, mat, ngjit, mbyt, porosit, mbështet | imperfect 3rd singular *rritte, futte, matte, ngjitte, mbytte* (flagged), *porositte, mbështette* | rriste, fuste, maste, ngjiste, mbyste, porosiste, mbështeste (check; same rule as the line above) |
| zbres, bërtas, thërras | 2nd plural *zbritni, bërtitni, thërritni* and the imperfect built on them (*zbritja …*) | zbrisni, bërtisni, thërrisni; zbrisja … (check: the list itself has flisni, prisni, shisni, vrisni, humbisni, ngisni) |
| thërras | *thërrita, thërritur* given as the main aorist and participle | thirra, thirrur are the usual ones; both are listed |
| përziej | aorist plural *përzjemë, përzjetë, përzjenë*; non-active *përziehem …*; *u përzje* (flagged) | përziem, përziet, përzien; përzihem …; u përzie (check) |
| ndjej | aorist plural *ndjemë, ndjetë, ndjenë*; *u ndje* | ndiem, ndiet, ndien; u ndie; the Standard citation form is *ndiej* (check) |
| mbroj | optative *mbrofsha, mbrofsh, mbroftë …* | mbrojtsha, mbrojtsh, mbrojttë … (check; Wiktionary's table for this verb is a regular template and is wrong in the aorist) |
| ngas | variants *ngita … ngitur*, imperative *ngit* (flagged; the file itself says "not confirmed by any source") | check |
| di | imperative *dije, dijeni* (flagged) | di, dini; *dije* is di + e |
| dukem | aorist 2nd singular *duke* | right as a form, but it puts the verb reading beside the particle *duke* on every card |

Missing, not wrong:
- **Imperfect** of *lë, vë, zë* (lija, vija, zija …) and their **singular imperative** (lër, vër, zër).
- Singular imperative of *blej (bli), kthej (kthe), përkthej, shërbej, rrëfej, pëlqej, gënjej, arrij (arri), mbërrij,
  fshij (fshi), shtrij, përfshij, vërej, thyej, ndjej, përziej, shkëlqej, vdes (vdis), humbas, bie (bjer), dua (duaj)*.
- **Optative and admirative** of every verb outside the regular *-oj* class and *jam, kam*; the imperfect admirative
  (*qenkësha, paskësha*) of all verbs; the admirative of the verbs in *-uaj, -ej, -ij*.
- **Non-active forms** of *ha, pi, di, lë, vë, zë, sjell, pres, pyes, zgjedh, vjedh, mbjell, fal, fut, kap, rrit, ndal,
  puth, humb, prish, ndez, vendos, shpall, shtyp, mbyt, zhduk, porosit, përmend, përmbush, ruaj, quaj, paguaj, gatuaj,
  kthej, thyej, përkthej* and of about seventy *-oj* verbs (mësoj, takoj, mendoj, harroj, pranoj, shtoj, ndryshoj,
  tregoj, ftoj …).
- The active partners of the "non-active only" rows (4.2). The second verbs *bie* "bring" (prura), *pres* "cut" (preva).
- Rows listed twice: *humb, fitoj, bisedoj, rregulloj, shqiptoj* (verbs); *arsye, rezultat, çast, qafë, nuse* (nouns);
  *mençur, verdhë, rëndësishëm* (adjectives).

### 5.3 Adjectives (164 rows)

- *serioz* and *krenar* are marked as taking the linking article: the card's lemma is **"i serioz", "i krenar"** and the
  table shows *i serioz, e serioze, të seriozë*. Neither takes an article: *njeri serioz, jam krenar*.
- *verdhë* (second row): feminine plural *verdhë*; correct *verdha* (the first row has it right).
- *vjeç*: feminine plural *vjeç*; correct *vjeçe* (check).
- *vetëmlindur*: no feminine plural (*vetëmlindura*).
- No definite or nominalised form of any adjective (*i pari, e mira, të rinjtë, i vetëmlinduri*), no feminine agent noun
  beside a masculine one (studente, gazetare, mjeke, këngëtare), no comparison as a form (by design).
- Missing rows include every colour without an article (*blu, gri, rozë, jeshil, portokalli*) and *i sigurt, i mundur,
  i këndshëm, i sjellshëm, i ardhshëm, i freskët, i zakonshëm, i famshëm, interesant, modern, normal, publik, privat*.

### 5.4 Closed classes (252 forms)

- Possessives lack the feminine genitive-dative *sime, sate, sonë, suaj*, the reflexive *i vet / e vet*, and *së tij*
  as a unit.
- *neve* and *juve* are tagged "accusative or dative"; they are dative (the accusative is *ne, ju*).
- No forms of *tjetër* with the article ending (*tjetri, tjetra, tjetrin, të tjerët, të tjerat*); no *ndonjë, ca,
  askënd, askujt, dikë, dikujt, kurrkush, çdokush, cilido, asnjëri, njëri-tjetri, vetvetja*.
- Prepositions missing: *përballë, përtej, sipër, krahas, gjer, nëpërmjet, falë, veç, karshi, kundrejt, buzë, matanë*;
  *brenda, jashtë, prapa* are adverbs only and govern no case.
- Conjunctions and particles missing: *kurse, sapo, porsa, meqë, meqenëse, ngaqë, ndonëse, sado, sikurse, domethënë,
  bile, vallë, dot, patjetër, mbase, kot, gati* (as "almost"), *seç, ç'*+noun.
- Numerals: see 4.16.
- Clusters: *t'ju, t'na, t'iu, s'u, ju + u* are not listed; the file says so.

## 6. Grammar that is not modelled at all

Morphology: neuter nouns; nominalised adjectives and participles; feminine agent nouns; diminutives and derivation
(*-ës, -im, -je, -si, -ri, -tar, -or, -shëm, pa-, mos-, ri-, për-*: a word such as *i pamundur, rilexoj, punëtore* is
known only if listed); compounds (*kryeministër, bukëpjekës, zemërgjerë*); the optative and admirative of most verbs;
the imperfect and pluperfect admirative; the non-active of most verbs; the imperative with *më / na / e / i* inside or
after it when the stem + pronoun is itself another form; the infinitive-like *për të* + participle beyond the purpose
note; ordinals above ten; fractions and multiples; the vocative particles (*o, more, moj, ore*).

Syntax and usage: *jam* + participle (passive perfect); the agent with *nga / prej*; *kam për të*; the conditional
perfect; conditional clauses; *mund* in the past (*mundi, mundej, ka mundur*); *duhet* + participle (*duhet bërë*);
clitic doubling of pronoun objects; the article of *të gjithë, të dy, të tjerët, i cili*; the adverb use of *mirë,
gjatë, shumë*; *një* as article; *si* "as", *që* "that / since", *po* "if / and", *sa* "that", *kur* "when" as
conjunctions; reciprocal *njëri-tjetrin*; reflexive *veten* with a possessive; address forms (*zoti, zonja, zotëri*);
the polite plural *ju* (the pronoun is glossed "plural, or polite singular", and nothing on a verb says so).

Varieties: Gheg beyond the list in 4.8; Kosovo Standard usage (*qysh, kah, çka, bash, krejt, hiq, valla*); Arbëresh
and Arvanitika have labels and no forms; spoken forms (*s'un, s'di gjo, pse s'po*) and chat spellings (*flm, sdi, kshu,
cfr, tkam*).

## 7. Orientation and course texts

- The orientation's passage has **"Ana dhe Luan shkojnë në shkollë."** A man's name as a subject takes the definite
  ending: *Ana dhe Luani*. The same fault runs through the A1 units I read: *Luan është në kuzhinë, Luan i jep çaj,
  Pastaj Luan dhe Ana hanë, Luan blen bukë, Sam shkon në treg, Sam ka bukë në çantë*. The later units write *Sami u
  ul, Luani, që drejtonte hyrjen*, so the course contradicts itself, and the engine's rule for cast names ("before a
  verb the bare name is read as the name") protects the wrong form.
- "Orizi, buka dhe djathi janë **të mira**" (unit a1-1-15): nouns of mixed gender take the masculine plural, *të mirë*.
- "me flokë **të zeza**" (b1-11): *flokë të zinj* (check). "Ajo ishte rreth tetë **vjeç**": *vjeçe* for a girl (check;
  the word list itself gives *vjeçe*).
- "Ardi dhe Sami **e** prisnin … një grua dhe një vajzë" (b1-11): a singular *e* doubling two indefinite objects; say
  *prisnin*. "Sami **e** pa një formë të re të dashurisë" (a2-2-11): the same, and the sentence is stilted.
- The orientation says a definite masculine object "ends in -in or -n"; the whole *-k / -g / -h* class has *-un*
  (*shokun, mikun, zogun*).
- Stage 0, sounds 2: the prompt "How does *shqip* **end**?" asks about *q*, which is in the middle of the word.
- The orientation, the pack and every unit carry the notice that no native speaker has checked them. That is accurate.
- I read parts of 6 of the 105 ladder units, 2 of the 19 Stage 0 scenes and the 3 sound notes. I did not read the gold
  sets beyond their header (they are "AI-judged, unreviewed").

## 8. What to fix first

1. **Stop repairing correct spelling.** Run `restoreDiacritics` only when the guessers and the dictionary's form index
   (`dict/sq/forms`, already shipped) do not know the written form, never when a regular non-active or feminine
   reading exists. Remove the note "Spelling differs from today's standard" unless the word really lacks ë or ç.
2. **Give every transitive verb its non-active forms by rule** and list the active partners of the 29 "non-active
   only" rows (ul, nis, lind, ndodh, shfaq, kënaq, habit, bind, largoj, afroj, martoj …). Then *ndodh, lind, nis, ul,
   rritet, dihet, takohemi* are right at once.
3. **Rank the little words.** *kisha* after a subject, a conjunction or *të* is the verb. *të* between a noun and any
   following word that is not a verb is the article. *një* before a noun is the article. Use the dictionary's part of
   speech for the word after *të / e / i* when the list lacks it.
4. **Fix the rows of section 5.** Each is a known form. The imperfect *-ste* rule, the *-u* aorist after *k, g, h*, the
   *-eu* aorist, the definite plural after a stressed vowel (*shakatë*) and after a consonant (*lotët*) are a few lines
   each. Add the imperfect and imperative of *lë, vë, zë*.
5. **Generate the optative and admirative for all verbs** from the aorist stem and the participle, or take them from
   Wiktionary's rows where its table is sound.
6. **Read the imperative with attached pronouns before the imperfect** when the sentence starts with it or ends in
   "!", and take the person of a verb from a noun subject (third person).
7. **Repair the merge with Wiktionary:** strip a leading *të* and stress marks before comparing; never let a record of
   another word or another part of speech in (*mik* under *mikeshë*, *Krenar* under *krenari*); when the two sides
   differ, show both as unresolved instead of printing Wiktionary's first.
8. **Use the dictionary's form index as the fallback** for a word the list lacks: it holds lemma and part of speech for
   inflected forms, and would turn most blank cards of 4.1 into at least a lemma.
9. **Decline unknown names** with the noun guesser (*Arbenin* → Arben, accusative) and stop reading *Drita, Luan,
   Mira* as names when a noun or verb reading fits the sentence.
10. **Resolve `disputed.ts`** (434 pairs): delete the correct forms from it, fix the wrong ones in the list.
11. Change the participle gloss to the past participle, and give the optative, admirative and non-active an English
    prop ("may he …", "so he …!", "is …-ed").
12. Add the missing closed-class forms of 5.4 and the numbers of 4.16.
13. In the course: *Luani, Sami* as subjects throughout; *të mirë*; rebuild the frequency file from a real corpus.

Until 1 to 4 are done I would label Albanian "preview" in the language chooser.

## 9. Limits of this audit

- I am a language model, not a native speaker, and I looked nothing up: no download and no web lookup was made. The only
  outside source was the Wiktionary data already in the repository, used through the card's own merge; where I lean on
  it I say so. Forms marked "check" are the ones I am not certain of. The ones I am least sure of: the plural of *kokë,
  hartë, meshë*; the 2nd plural of *zbres, bërtas, thërras*; the aorist plural of *përziej* and *ndjej*; the optative of
  *mbroj*; *pasditja*; *kurrize*.
- The UN declaration article, the Lord's Prayer and John 3:16 were written from memory and may differ in a word from
  the printed versions; they were used only as running text.
- Not read line by line: the sentence layer, the syntax layer, the construction rules, the production checks (the
  checks on the learner's own Albanian were not tested at all), the table-tag map. Not audited: the gold sets, 99 of
  the 105 ladder units, 17 of the 19 Stage 0 scenes, GoReview's Albanian questions, the ten Wikipedia readings.
- The "wrong" and "undecided" counts of section 2 are hand counts on 513 words; the probe batteries were written to find
  faults and are not a sample.
- The merge figures count cells of the adapter's own table shape; a different alignment of Wiktionary's rows would move
  them a little.
- A real audit of Albanian needs a native reviewer for register, idiom, Gheg and the spoken reference. This one shows
  where the engine misleads a learner today and which of its tables are wrong.

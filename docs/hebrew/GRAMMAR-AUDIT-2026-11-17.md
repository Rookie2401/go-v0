# Hebrew grammar audit (Biblical, Modern and Mishnaic Hebrew on one card), 2026-11-17

Auditor: the Hebrew grammar-audit agent (an AI model, not a Hebraist and not a native speaker). Code audited: the shared clone at
master `985c742b` (read-only). Data audited: `C:\Users\CJWal\dev\go-v0\public\lexicon\he\` (Biblical index built 2026-10-19,
Modern index built 2026-11-13) and `public\dict\he\`. Brief from the owner: audit the linguistic content, be brutal, note every
missed feature and detail, and weigh every finding against what the GoLearn card actually shows. Nothing was looked up or
downloaded: every judgement of Hebrew below is from my own knowledge.

**Where the test text came from.** All pointed Biblical text is the repository's own Masoretic text
(`packages/biblia/public/data/he`: Miqra according to the Masorah, with the Open Scriptures reading of every word beside it);
none of it was typed by me. The Westminster Leningrad spelling of the same Bible was read from the local copy of the Open
Scriptures files that the index build names as its source (`C:\Users\CJWal\dev\biblia-v0\data\oshb`, read-only). The Mishnah
samples are the repository's own audit texts (`data/raw/audit-texts/sefaria`). Unpointed Biblical text was made by stripping the
points from the repository's text. The Modern Hebrew text and the Modern battery were typed by me, unpointed; ten pointed Modern
words in that battery and five single pointed words in `misc.mts` were typed by me and are marked so.

## 1. Verdict

This pack is not a grammar of Hebrew. It is a look-up of two outside sources (the Open Scriptures morphology of the Hebrew Bible;
the Wiktionary tables) with a thin layer on top, and almost every fault is in that layer or in what the look-up cannot do.

- **Pointed Bible text is the strong case, because the answer is copied from the source.** Over the whole Tanakh as the
  repository prints it (305,309 tokens) the card showed the source's own reading for 96.18 %, the right lemma in another form for
  2.01 %, and a wrong lemma for 1.42 % (4,328 tokens). No token was blank. But the second word of the Bible is one of the wrong
  ones: *בָּרָא* in Genesis 1:1 (the orientation's own practice sentence) is shown as the **Aramaic noun בַּר "field"**, "masculine
  singular, determined (emphatic), with the article", with the meaning line "He created" printed under it.
- **The layer on top of the source is where a learner is misled.** (a) The card never says which person a pronoun suffix is:
  *לִי*, *לְךָ*, *לָךְ*, *לוֹ* all show "לְ, to, for" and "object of the preposition"; *דְּבָרוֹ* is "possessive suffix". (b) The
  English written for a verb in a derived stem is wrong for 60 of the 260 commonest (verb, stem) pairs, 2,742 of 16,643 tokens:
  *וַיְבָרֶךְ* "And he knelt", *מַצִּיל* "stripping", *הוֹדוּ* "Throw!", *הֵחֵל* "He polluted", *וַיְסַפֵּר* "And he counted",
  *כַּבְּדֵנִי* "Make me heavy!". (c) The transliteration is wrong for 63 of the 228 words of the test passages and for 65 of the
  330 commonest forms of the Bible (26,765 of 123,649 tokens): *אוֹר* is "vor", *עוֹלָם* "volam", *כָּל* "kal", *יִשְׂרָאֵל*
  "yiseraʾel", *רוּחַ* "ruḥa", *בְּיוֹם* "bevom", *הִוא* "hiv", and the Name is spelled out "yehova". (d) No grammar note of any kind
  ever fires: the pack explains three constructions, and the adapter's pattern detector returns nothing (from the code; seen in
  every probe).
- **Unpointed text is a different product.** The same five passages with the points removed: the card agreed with the source
  for 71.5 % of 228 words (whole Tanakh: 71.6 % of 305,309) and I count about 29 plainly wrong readings (13 %): *פני* "to face"
  (imperative), *ערב* "pretty, pleasant", *בקר* a verb, *רעי* "a male given name, Roy", *בשמן* "their perfume", *עמך / עמי* "with
  you / with me" for "your people / my people". Twenty of the 22 verses are announced as Modern Hebrew.
- **Modern Hebrew is the default target and the weakest part.** On 228 words of my own everyday Modern Hebrew the card was blank
  for 15 (6.6 %) and plainly wrong for 32 (14.0 %): *צריך* "adversary, foe", *אכלנו* "to corrode", *ירד* "Jared", *קם* "foe",
  *שיש* "to rejoice", *והמדינית* "Midianite", *האישה* (battery) "man, husband". The commonest prefix of Modern Hebrew, unpointed
  ש "that", is never cut off (from the code; seen as a blank on *שהיא, שזה, שהילדים, שקנינו, שראיתי, שאמרתי, כשהגעתי*).
  Abbreviations are blank (*צה"ל, ד"ר, ארה"ב, וכו', בע"מ*) or read as numbers (*ש"ח* "308", *ק"מ* "140", *ע"י* "80", *עו"ד* "80",
  *רח'* "208").
- **Mishnaic Hebrew is not analysed, and the card does not say so on the word.** On 673 words of pointed Mishnah the card was
  blank for 50 (7.4 %), gave an unconfirmed guess with no meaning for 59 (8.8 %), never named the Mishnaic period, and reads
  *רַבִּי* as an Aramaic verb, "He grew great".

Usable today: a reader of a pointed Bible who wants the lemma, the stem, the conjugation and person of a verb, the state and
number of a noun, and the prefixes cut off. Not usable as stated: the suffixes, the English of derived stems, the
transliteration, anything unpointed, Modern Hebrew as a course language, Mishnaic Hebrew.

## 2. How this was audited, and the numbers

1. **Read the adapter**: `he.ts` and all sixteen files of `hebrew/` (`analyze, text, index-store, oshb, describe, tags,
   pronominal, pronunciation, numbers, paradigm, varieties, shards, contextual, form-analysis, word-analysis, production`),
   the pack, the orientation, the card parser (`parser/index.ts`, `cardModel.ts`), `lexicon/prepare.ts`, the five notes in
   `docs/hebrew/` and the Hebrew parts of `docs/ecosystem/LANGUAGE-VARIETIES.md`. Not read line by line:
   `core/english-verb.ts` and `core/word-analysis.ts` (tested through their output), the build scripts beyond their headers.
2. **What the pack is** (section 3.0).
3. **Step 2 of the method (the dump) has no generator to dump here**: the adapter generates no forms. What is its own, and
   what I read whole: the hand table of prepositions with suffixes (14 × 9), the stem-sense table (about 50 roots), the
   transliteration rules, the number words, the lemma table's 150 commonest glosses, and mechanical checks over all 9,200
   lemma rows (`lemmas.mjs`). In place of a form dump I dumped the two things the adapter does write: the English of the 260
   commonest (verb, derived stem) pairs (`stems.mts`) and the transliteration of the 330 commonest forms (`translit.mts`),
   and read all of both.
4. **The whole Tanakh read back against its own source** (`gold.mts`): every token through the adapter, the reading chosen
   exactly as the card chooses it (the highest confidence; ties in adapter order), compared with the Open Scriptures reading
   of that token; in three registers (as printed; points without cantillation; consonants only) and once more in the
   Westminster Leningrad spelling.
5. **Targeted probes through the card's own `parseSelection`**: 721 word-in-verse or word-in-sentence probes in six batteries
   (prefixes, suffixes, construct, plurals 127; verbs 188 + 56; homographs, divine names, numbers, names, Aramaic 126; Modern
   207; small checks 17), and one battery of twelve encodings and spellings over 243 words each (`b4-unicode.mts`).
6. **Running text through the card, word by word** (`cover.mts`, with the adapter's own tokeniser and sentence splitter):
   the five passages named in the brief (228 words) in three registers; 228 words of my own Modern Hebrew; the first 336 and
   337 words of Pirkei Avot and Mishnah Berakhot.
7. **464 everyday Modern words** against the Modern index and the dictionary, and the card's merged "All forms" table for the
   356 nouns, verbs and adjectives among them (`core.mts`, with the extension's own `buildParadigm`).

The full indexes were installed through the adapter's own shard loader (every shard of `he/biblical` and `he/modern`), which is
the state the extension reaches after it has prepared the lexicon. The extension passes no declared variety to the parser (from
the code, `content/controller.ts`), so none was declared except where stated. Everything is in
`C:\Users\CJWal\dev\tmp-mem\heaudit\`.

| Running text through the card | Bible, as printed | Bible, points only | Bible, consonants only | Modern (mine) | Mishnah (pointed) |
|---|---|---|---|---|---|
| Words | 228 | 228 | 228 | 228 | 673 |
| Blank card | 0 | 0 | 0 | 15 (6.6 %) | 50 (7.4 %) |
| Unconfirmed guess (no meaning shown) | 1 | 1 | 0 | 0 | 59 (8.8 %) |
| Card = the source's reading (machine) | 219 (96.1 %) | 219 (96.1 %) | 163 (71.5 %) | no source | no source |
| Wrong reading (hand count) | 2 lemmas; about 13 wrong English lines | the same | about 29 (13 %) | 32 (14.0 %) | 9 in the 118 words I read |
| Other readings offered beside the one shown | 148 (64.9 %) | 148 | 179 (78.5 %) | 162 (71.1 %) | 444 (66 %) |
| Wrong transliteration (hand count) | 63 (27.6 %) | 63 | none is given | none is given (213 of 228) | not counted |
| Sentences read as | Biblical 22 | Biblical 22 | **Modern 20**, Biblical 2 | Modern 25, Biblical 2, none 1 | Biblical 46, Modern 14, none 8; Mishnaic 0 |
| The same text before the full indexes are installed: blank | 70 (30.7 %) | | | 128 (56.1 %) | |

| The whole Tanakh against its own source (305,309 tokens; 305,506 in the WLC spelling) | As printed (MAM) | Points only | Consonants only | WLC spelling |
|---|---|---|---|---|
| Blank | 0 | 0 | 0 | 187 |
| Unconfirmed (shown without a meaning) | 0 | 642 | 0 | 8,184 (2.68 %) |
| Card = source reading | 96.18 % | 96.18 % | 71.60 % | 95.85 % |
| Right lemma, another form (of which only absolute / construct) | 2.01 % (3,654 of 6,149) | 2.01 % | 3.90 % | 2.03 % |
| Same headword and part of speech, another homonym number | 0.39 % | 0.39 % | 0.31 % | 0.39 % |
| Wrong lemma | 4,328 (1.42 %) | 4,328 | 73,850 (24.19 %; see 9) | 5,103 (1.67 %) |
| Verses read as Biblical Hebrew / Biblical Aramaic / Modern | 22,936 / 268 / 0 | the same | 1,728 / 203 / **21,273** | 22,928 / 265 / 0 |

| Other measures | |
|---|---|
| Daniel and Ezra: card = source reading, against the project's own figure | Daniel 87.6 % (project: 95.4 %); Ezra 90.6 % (project: 96.7 %). The project measured the adapter's first reading; the card shows another one (3.1) |
| Tokens of the Bible that the alignment left without any source reading | 143: card blank 18, unconfirmed guess 16, read from another verse's form 78, read from Wiktionary or a rule 31 |
| English of the 260 commonest (verb, derived stem) pairs, 16,643 tokens (74 % of all derived-stem verb tokens) | wrong for 60 pairs, 2,742 tokens (16.5 %) |
| Transliteration of the 330 commonest forms, 123,649 tokens (40 % of the Bible) | wrong for 65 forms, 26,765 tokens (21.6 %); 20,183 without the Name |
| Targeted probes: blank card | Bible batteries 0 of 497; Modern battery 31 of 207 |
| Everyday Modern words with no entry in the Modern index | 7 of 464 (*אנשים, חולים, זאת, שתיים, שלוש, ארבע, תשע*: four of them are feminine numerals) |
| "All forms" merge over 356 everyday words: cells verified / conflict / adapter only / dictionary only | 3,038 / 1,489 (in 211 words) / 3,061 / 158 |
| Lemma table (9,200 rows): headword printed with an accent mark / without its dagesh / as several words | 31 / 33 (1,636 tokens) / 213 (1,455 tokens) |

The probes were chosen to find faults; only the running-text and whole-Tanakh rows are rates. Hand counts are mine and could be
off by a few.

## 3. What the card shows, and what is wrong with each part

### 3.0 What this pack is

- **Biblical Hebrew (`he-bib`)**: a table from every written form of the Tanakh (pointed, cantillation removed) to the Open
  Scriptures reading or readings of that form: lemma number, a code, how often, and where the prefixes and the suffix are cut.
  52,687 forms, 9,200 lemmas. Headword and gloss come from the Biblia app's lexicon (Strong's numbers and headwords, BDB
  glosses; the commonest hundred or so glosses read as hand-written: check). A compact core (441 lemmas) is compiled in; the rest is
  installed.
- **Modern Hebrew (`he-mod`)**: a table from every form in a Wiktionary inflection table or headword line (via kaikki) to its
  labels. 157,329 forms, 14,456 lemmas, no frequencies. Plus a hand table of 14 prepositions with 9 pronoun suffixes.
- **Mishnaic and Medieval Hebrew**: no data. One rule turns a plural in *־ִין* into *־ִים* and marks the result unconfirmed.
- **Biblical Aramaic (`arc-bib`)**: the Aramaic tokens of the same Open Scriptures table, kept inside the Hebrew indexes.
- **Rules**: cutting off ו ה ב ל כ מ (and pointed שֶׁ, הֲ) when the rest is a known form; an unpointed word matched to every
  pointed form with those consonants; a pointed form not found matched by its consonants ("unconfirmed"); letters as numbers;
  *יי / ה׳* as the Name.
- **A word outside both tables**: nothing. There is no guesser. This is honest, and it means that in Modern Hebrew every
  inflected form Wiktionary has no table for is blank.
- **How a period is chosen** (from the code, `sentencePeriod`): cantillation makes the sentence Biblical; otherwise each word
  votes for the periods it has a reading in; a tie goes to the declared variety, then pointed text is Biblical and unpointed
  Modern. The readings of that period are put first. **The card then ignores that order** (3.1).

| Part of the card | State | Section |
|---|---|---|
| Lemma, part of speech | Right on pointed Bible text where the form has one reading; decided by a count where it has several; headwords are Strong's (*יָלַךְ, אֵל* for אֶל, *חֵסֵד, שׂוּם, שָׁנֶה, דָבַר, בָרַךְ*) | 3.1, 4.1, 4.9 |
| Period line ("read as Biblical / Modern Hebrew") | Right with cantillation; wrong for unpointed Bible text, pointed Modern text and all Mishnah; an Aramaic or Modern reading can be shown inside a "Biblical Hebrew" sentence | 3.1, 4.10 |
| Form line | The source's, and good for verbs and nouns of the Bible. Empty for every preposition with a suffix. Modern: "2nd person masculine" for every 3rd feminine future; "past, 3rd person" for an infinitive | 4.2, 4.6 |
| Parts of the word (prefix · stem · suffix) | Good on Bible text (the source's cuts). The suffix is never identified | 4.2 |
| Own meaning | The lemma gloss for everything but verbs; verbs get an English form, right for the Qal, wrong for a sixth of derived-stem tokens | 4.3 |
| Transliteration | A general scheme with Israeli letter values, not named on the card as either; systematic errors | 4.4 |
| Other readings | Up to three, as lemma + part of speech + gloss; their forms are not shown | 4.1 |
| Grammar notes | None ever | 6 |
| Fixed phrases | None (`detectPhrases` returns nothing) | 6 |
| Role in the sentence | No syntax rules; only "object marker" on אֵת | 6 |
| Dictionary line | Wiktionary, filed by consonants, so homographs are mixed | 4.11 |
| "All forms" | Attested forms only; the sandhi or pausal variant is often the headline form; the merge with Wiktionary reports false conflicts | 5 |
| Variants across periods | Lemma counts per period; honest about what is not loaded | not audited further |

### 3.1 Two faults in how a reading is chosen (they explain many rows below)

1. **The card does not show the adapter's first reading.** The adapter puts the readings of the sentence's period first. The
   card then takes the reading with the highest confidence (`pick` in `parser/index.ts`) and so can show a reading of another
   period or language. Seen: *בָּרָא* in Genesis 1:1, 1:27 and Deuteronomy 4:32 (5 tokens) is the Aramaic "the field" of Daniel
   (6 occurrences against 5); *דָּנִיֵּאל* in Chronicles and Ezekiel is tagged Biblical Aramaic (23 tokens); *תּוֹלְדוֹת* in Ruth
   4:18 is the Wiktionary reading; in Daniel and Ezra the Hebrew homonym is shown on Aramaic tokens (*מִן, עַל, עַד, עִם, כָּל,
   דִּי*). This is why the card agrees with the source for 87.6 % of Daniel while `docs/hebrew/SCRIPTURE-AUDIT.md` reports
   95.4 %: that audit measured a reading the card does not show.
2. **Every form of the compiled core is counted twice once the full index is installed** (the core and the shard both hold it).
   Seen: *אֱלֹהִים* has confidence 0.92 with the core alone and 0.71 with the full index; a rare word such as *תֹּהוּ* keeps 0.92.
   So the commonest words of the Bible carry less confidence than the rarest, a core reading is doubled against a non-core
   one, and a Wiktionary reading (0.78) can pass the Bible's own reading (0.71) inside a cantillated verse (300 tokens of the
   Tanakh are shown with a reading that is not the source's).

## 4. Findings on the card

Every row was seen in a probe or in the running-text output. "The card shows" is the reading the learner sees first.

### 4.1 Wrong reading shown on pointed Bible text

| Verse | Word | The card shows | Correct |
|---|---|---|---|
| Gen 1:1, 1:27; Deut 4:32 | בָּרָא | *בַּר*, noun, "masculine singular, determined (emphatic), with the article", variety Biblical Aramaic; meaning line "He created" (the contextual rendering, printed under the wrong lemma) or "field" | בָּרָא, Qal perfect 3ms, "he created" |
| Deut 6:9 (the Shema) | מְזֻזוֹת | *זָז*, verb, "present, feminine plural", with מ "from" cut off, unconfirmed, no meaning | מְזוּזָה, "doorposts". The index has no such form: it is one of 143 tokens the alignment dropped |
| Gen 4:1 and 252 more | אֶת | object marker | אֵת "with" (*קָנִיתִי אִישׁ אֶת־יְהוָה*). Same for *וְאֶת* 36 times |
| Gen 11:5 and 10 more | בָּנוּ | *בְּ*, preposition, "in, with, by" + "object of the preposition" | בָּנָה, "they built" |
| Ruth 3:13 | יִגְאָל | proper noun *Igal* | גָּאַל, "he will redeem" |
| Ruth 3:1 | מָנוֹחַ | proper noun *Manoah* | מָנוֹחַ, "rest" |
| Ruth 4:22 | וְעֹבֵד | *עֹבֵד אֱדוֹם* (Obed-edom) | Obed |
| Ruth 4:19, 4:20, 4:12 | רָם, שַׂלְמָה, פֶּרֶץ | the verb *רוּם* (participle); the common noun *שַׂלְמָה*; the common noun *פֶּרֶץ* | the names Ram, Salmah, Perez |
| Jer 32:12 and 22 more | בָּרוּךְ | passive participle, meaning "knelt" | Baruch (and where it is the participle: "blessed") |
| Eccl 9:9 and 35 more | חַיִּים | adjective *חַי*, masculine plural | noun חַיִּים, "life" |
| Gen 6:2 and 24 more | הֵנָּה | adverb "here, hither" | pronoun, "they (feminine)" |
| Gen 3:12 (*הִוא*), Gen 14:2 (*הִיא*) | הִוא, הִיא | lemma *הוּא*, meaning **"he, it; that"** | "she". The feminine pronoun has no lemma of its own and no gloss "she" |
| 1 Kgs 3:17 and 11 more | בִּי | *בְּ* "in me" | בִּי, "please (my lord)" |
| Gen 2:10 and 42 more | וְהָיָה | weqatal, "And he will be" | simple perfect, "and it became" |
| Ps 23:1 | רֹעִי | lemma *רֹעִי*, verb, "pasturing"; the י is "object suffix" | participle of רָעָה with a possessive suffix: "my shepherd" |
| 2 Sam 3:28 and 9 more | עַד | "until" | עַד, "for ever" |
| Prov 20:13 | שְׂבַע | adjective "sated" | imperative of שָׂבַע |
| Gen 1:26 | נַעֲשֶׂה | "We will do" | "let us make" |
| 1 Kgs 10:8 | אַשְׁרֵי | lemma *אֶשֶׁר*, "masculine plural, **absolute**" (the source's own tag), "happiness, blessedness" | construct plural, "happy are" |
| Dan 2:4 | מַלְכָּא | lemma *מֶלֶךְ* (the Hebrew headword), tagged Biblical Aramaic | Aramaic מֶלֶךְ / מַלְכָּא; see 4.10 |

Not counted as faults, but shown as one value where the verse decides: absolute against construct for every segolate and
every noun without a vowel change (*אִישׁ, מֶלֶךְ, אֶרֶץ, יוֹם, עַם, רוּחַ, שֵׁם, לֵב*: 3,654 tokens), 3fs against 2ms of the
imperfect (*תִּשְׁמֹר, תִּהְיֶה, תָּבוֹא*), jussive against imperfect (*יֹאמַר, יַעֲשֶׂה, תִּתֵּן*), participle against perfect
(*בָּא, מֵת, בָּאָה*), Qal against Hifʿil (*וַיַּעַל* 26, *וַיַּעֲלוּ* 21). The card prints one of the two with no sign that
the other exists beyond "1 other form reading possible"; the alternatives list shows lemma and gloss, not the form.

### 4.2 Suffixes: the card cuts them off and does not say what they are

The source gives the person, gender and number of every suffix. The card throws them away: the form line and the features
carry only the host word, and the parts line prints the role without the person (from the code: the part's features are not
printed; seen in every probe).

| Verse | Word | The card shows | Correct |
|---|---|---|---|
| Gen 3:12 / 3:11 / 3:18 / 2:18 | לִי / לְךָ / לָךְ / לוֹ | all four: lemma *לְ*, preposition, empty form line, "to, for", "object of the preposition" | to me / to you (m.) / to you (f.) / to him |
| Gen 8:9; Gen 24:25; Gen 14:15 | אֵלָיו; עִמָּנוּ; עֲלֵיהֶם | "to, toward, into"; "with"; "on, upon…", empty form line | to him; with us; on them |
| Num 30:3; Num 11:23; Gen 24:33 | דְּבָרוֹ; דְבָרִי; דְּבָרָי | "masculine singular, construct" / "masculine plural, construct" + "possessive suffix"; meaning "word, speech, thing, matter" | his word; my word; my words. A noun with a suffix is not "construct" for a learner; the card never says "his" |
| Deut 6:5 | לְבָבְךָ, נַפְשְׁךָ, מְאֹדֶךָ | "construct" + "possessive suffix" | your heart, your soul, your might |
| Gen 1:27 | אֹתוֹ | object marker; the וֹ is "**possessive** suffix"; meaning "(marks the definite direct object)" | "him" |
| Gen 2:17; Gen 3:5 | מִמֶּנּוּ | *מִן*, "from, out of; than" in both. The index holds this form 145 times as "from us" (the source's own tag, even in *לֹא תֹאכַל מִמֶּנּוּ*) and 26 times as "from him"; the card cannot show either | "from it / from him"; "from us" only in a handful of verses |
| Deut 6:7 | בְּשִׁבְתְּךָ, וּבְלֶכְתְּךָ, וּבְשׇׁכְבְּךָ, וּבְקוּמֶךָ | "to sit", "and to go", "and to lie down", "and to arise"; the ךָ is "**object** suffix" | "when you sit, walk, lie down, rise": the suffix on an infinitive is its subject |
| Gen 13:15; Ps 72:15 | אֶתְּנֶנָּה; יְבָרְכֶנְהוּ | "נָּה: object suffix"; "נְהוּ: object suffix" | the energic nun is never named |
| Verb + suffix | וַיִּתְּנֵהוּ, אֲהַבְתִּיךְ, שׇׁמְרֵנִי | "And he gave him", "I loved you", "Keep me!" | right: the verb's English carries the object. "you" does not tell 2ms from 2fs from 2mp |

Good in the same battery: prefixes are cut and named on every attested form (*וּבַיּוֹם*: "and" + "preposition with the article
fused into it" + stem; *מֵהָאָרֶץ*; *וְכַאֲשֶׁר*; *שֶׁהָיָה*; *הֲשֹׁמֵר*: "(question)" + participle); the directional he (*אַרְצָה,
מִצְרַיְמָה, שָׁמָּה, הַבָּיְתָה, יָמָּה*) and the paragogic nun (*תְּמֻתוּן, יָדְעוּן*) are named; duals are labelled dual (*יָדַיִם,
אׇזְנַיִם, יוֹמָיִם, שְׁנָתַיִם, מָאתַיִם, עֵינֵי*); irregular plurals reach their lemma (*אָבוֹת, אֲנָשִׁים, נָשִׁים, בָּתִּים, עָרִים,
בָּנוֹת, רָאשִׁים, כֵלִים*).

### 4.3 The own-meaning line of verbs: the stem's English

The Qal is right nearly everywhere ("He kept", "And he fell", "to give", "Let us go"), and about fifty roots have their stem
senses listed by hand and are right (*הֵבִיא* "He brought", *הוֹצִיא* "He brought out", *הֵמִית* "He put to death", *הֶרְאָה* "He
showed", *הִגְלָה* "He exiled", *נִשְׁבַּע* "He swore", *נִלְחַם* "He fought", *הוֹלִיד* "He fathered"). Every other root takes
the first sense of the dictionary gloss, whatever the stem. I read the commonest form of the 260 commonest (verb, derived
stem) pairs (`stems-out.txt`); 60 are wrong. The worst, by number of tokens in the Bible:

| Tokens | Verb and stem | The card shows | Correct |
|---|---|---|---|
| 233 | בֵּרַךְ, Piʿel | "And he knelt"; *בָּרוּךְ* "knelt"; *מְבֹרָךְ* "knelt"; *יְבָרְכֶנְהוּ* "May he kneel him" | bless |
| 191 | הִצִּיל, Hifʿil | "stripping", "He stripped" | deliver |
| 100 | הוֹדָה, Hifʿil | *הוֹדוּ*: "Throw! (plural)" | give thanks |
| 96 + 39 | הִשְׁחִית, שִׁחֵת | "to go to ruin", "He went to ruin" | destroy |
| 92 | כִּפֶּר, Piʿel | "And he will cover"; Puʿal "He will be covered" | make atonement |
| 89 | שִׁלֵּם, Piʿel | "He will finish" | repay |
| 82 | נוֹתַר, Nifʿal | "being remained over" | left over |
| 80 | הִתְפַּלֵּל | "And he intervened", "Intervene!" | pray |
| 71 | הוֹדִיעַ + suffix | *הוֹדִעֵנִי*: "Make me known!" | make known to me |
| 71 | הִנִּיחַ, Hifʿil | "He rested" | set down, leave, give rest |
| 67 | סִפֵּר, Piʿel | "And he counted" | tell |
| 65 | הִשְׁכִּים | "And he started" | rise early |
| 61 | הִפִּיל, Hifʿil | "to fall" | cause to fall, cast |
| 59 | הוֹרָה, Hifʿil | "He will throw" | teach (or shoot) |
| 57 | לִמֵּד, Piʿel | "Exercise me in!", "I exercised in", "exercising in"; Qal *וַיִּלְמַד* "And he exercised in" | teach; learn |
| 56 | הֵחֵל, Hifʿil | "He polluted" | begin |
| 56 | נִפְלָאוֹת | "being surpassing" | wonders |
| 48 | הִתְיַצֵּב | "He will set", "Set! (plural)" | take one's stand |
| 45 | הוֹלִיךְ, Hifʿil | "And he went" | lead |
| 45 | הִקְשִׁיב | "Incline!" | listen |
| 44 | כִּבֵּס, Piʿel | "He will tread" | wash |
| 40 | קִלֵּל, Piʿel | "He will make slight" | curse |
| 39 | הֶחֱרִישׁ | "I will make silent" | be silent |
| 38 | כִּבֵּד, Piʿel | "He will make heavy", *כַּבְּדֵנִי* "Make me heavy!" | honour |
| 38 | הִשְׁאִיר | "He remained" | leave over |
| 37 | הִשָּׁמֶר | "Be kept!" | take heed |
| 32 | הֶחֱטִיא | "He missed" | cause to sin |
| 30 | נִכְבָּד | "being heavy" | honoured |
| 30 | קִנֵּא, Piʿel | "I made jealous" | be jealous, zealous |
| 29 + 21 | הִפְקִיד, נִפְקַד | "He attended to", "He will be attended to" | appoint; be missing |
| 28 | מִלֵּט, Piʿel | "He will slip away" | rescue |
| 27 | שִׂמַּח, Piʿel | "He will rejoice" | make glad |
| 27 + 22 | הִדִּיחַ, נִדַּח | "I impeled them", "you will be impeled" (misspelt) | drive away |
| 27 | הִתְחַזֵּק | "And he grew himself firm" | strengthen oneself |
| 24 | נִקָּה, Nifʿal; Piʿel | "He will be empty"; "He will make empty" | be innocent; acquit |
| 23 | הִתְהַלֵּל | "May he praise" | boast |
| 23 + 23 | יִמּוֹט; יִכָּשְׁלוּ | "He will be tottered"; "They will be stumbled" | totter; stumble |
| 22 | הִמְרָה | "And they made contentious" | rebel |
| 22 | נָבוֹן | "being discerned" | discerning |
| 22 | נוֹעַץ | "And he advised" | consult |
| 21 | הִתְעָה | "And he erred them" | lead astray |
| 21 | הֶרֶף | "Sink!" | let go |
| 20 + 19 | הִקְהִיל, נִקְהַל | "And he assembled as a", "And they assembled as a" (the English stops in mid-phrase) | assemble |
| 20 | הִרְכִּיב | "And they mounted and ride" | make ride |
| 19 | נִמְכַּר | "He will sell" | be sold |
| 18 | נַעֲלָה | "He was gone up" | be taken up |

Seen in the test passages for the same reason: *יַרְבִּיצֵנִי* "He will stretch me out" (makes me lie down); *דִּשַּׁנְתָּ* "You grew
fat" (you anointed); *וְשִׁנַּנְתָּם* "And you will whet them" (teach them); *הִפְגִּיעַ* "He met" (laid on); *אַל־תִּפְגְּעִי* "May you
meet" (do not urge: the negative is ignored); *מְחֹלָל* "bored" (pierced); *וּמְעֻנֶּה* "and bowed down" (afflicted); *סְבָלָם* "He
bore them a heavy load".

Other faults of the same line: the 3ms is always "He" ("He was built", "He was done", "He will be said"); wayyiqtol of היה is
"And he was" outside Genesis 1:3; an infinitive absolute is "to die" in *מוֹת תָּמוּת*; a jussive is "May …" (*יָשֹׁב* "May he
return") and the cohortative of 1:26 is a plain future; the source labels *וַיִּשְׁתַּחוּ* Hishtafʿel in the singular and Hitpaʿel
in the plural, and the card repeats both.

### 4.4 The transliteration line

The note on the card says "a general scheme (SBL style), with the Modern Israeli values of the letters". It is neither: it
keeps ʾ ʿ ḥ, merges ט/ת, ק/כּ, ס/שׂ, writes no length and no stress, and the rules have these errors (each seen in
`translit-out.txt` or the passages; counts are tokens in the Bible for the forms among the 330 commonest):

| Fault | Examples the card shows | Correct |
|---|---|---|
| Every shva that is not word-final is written "e", silent or not | *yiseraʾel* (2,260), *vayehi* (781), *lifene* (596), *yiheye* (415), *mitserayim* (482), *divere*, *eserim*, *vayikera*, *vayedaber*, *nafeshi*, *averaham*, *pareʿo*, *malekhe*, *bamidebar*, *hayeta*, *mizemor*, *shuleḥan* | yisraʾel, vayhi, lifne, yihye, mitsrayim, divre, esrim, vayikra, vaydaber, nafshi, avraham, parʿo, malkhe, bamidbar, hayta, mizmor, shulḥan |
| A vav with holam after a silent first letter is "v" | *אוֹר* "vor", *עוֹד* "vod" (394), *אוֹ* "vo" (320), *עוֹלָם* "volam" (212), *אוֹתָם* "votam" (189) | or, od, o, olam, otam |
| …and after a yod that follows a shva | *בְּיוֹם* "bevom" (197) | beyom |
| Qamats qatan is "a" (the text marks it with its own sign, and the key folds it away) | *כָּל* "kal" (2,559), *וְכָל, בְּכָל, לְכָל, מִכָּל*, *וַיָּקָם* "vayakam", *לְעׇזְבֵךְ* "leʿazevekh", *וּבְשׇׁכְבְּךָ* "uveshakhebekha" | kol, vayakom, leʿozvekh, uvshokhbekha |
| Furtive patah is put after the consonant | *רוּחַ* "ruḥa" (206), *יְהוֹשֻׁעַ* "yehoshuʿa", *הַמִּזְבֵּחַ* "hamizebeḥa", *נָגוּעַ* "naguʿa", *הִפְגִּיעַ* "hifegiʿa" | ruaḥ, yehoshua, hamizbeaḥ, nagua, hifgia |
| A quiescent aleph is written as a consonant | *vayoʾmer* (1,948), *leʾmor* (856), *zoʾt*, *roʾsh*, *katsoʾn*, *veʾlohayikh* | vayomer, lemor, zot, rosh, katson, velohayikh |
| The 3ms suffix on a plural is "-ayv" | *אֵלָיו* "elayv" (429), *עָלָיו* "alayv" (403), *בָּנָיו* "banayv", *לְפָנָיו* "lefanayv" | elav, alav, banav, lefanav |
| The Pentateuch's *הִוא* | "hiv" (132) | hi |
| A yod after hiriq before another vowel is dropped | *יִהְיוּ* "yiheu", *וַיִּהְיוּ* "vayiheu" | yihyu, vayihyu |
| Jerusalem | *יְרוּשָׁלִַם* "yerushalam" (345) | yerushalayim |
| The Name is spelled out | *יְהֹוָה* "yehova" (5,702), *לַיהֹוָה* "layhova" (576), *יֱהֹוִה* "yehovi" (304) | not to be read as written: Adonai / Elohim, or no transliteration |

An unpointed word gets no transliteration of its own (213 of the 228 Modern words), which is honest; the lemma's
transliteration beside it is made by the same rules.

### 4.5 Unpointed Bible text (and any unpointed text matched to the Bible)

| Verse (points removed) | Word | The card shows | Correct |
|---|---|---|---|
| Gen 1:2 | פני (twice) | *פָּנָה*, verb, "imperative, feminine singular", "to face" | פְּנֵי, "face of" |
| Gen 1:1 | ברא | lemma *נִבְרָא* "to be created", meaning line "He created" | בָּרָא |
| Gen 1:5 | ערב; בקר; לאור | adjective "pretty, pleasant"; *בִּקֵּר* "defective spelling of ביקר."; preposition "In light of" | evening; morning; "to the light" |
| Deut 6:4 | שמע | proper noun "the Shema" | "hear!" |
| Deut 6:7; 6:8 | בם; וקשרתם | lemma *ב*, no meaning; "And you (plural) will bind" | "of them"; "and you shall bind them" |
| Deut 6:9 | מזזות | *זָז* "to move", confirmed at 0.5 | doorposts |
| Ps 23:1, 23:2 | רעי; מי; מנחות | "a male given name, Roy"; "who?"; *מִנְחָה* "an offering" | my shepherd; waters of; rest |
| Ps 23:5 | בשמן; ראשי | *בֹּשֶׂם* "perfume", "3rd person feminine plural, with a possessive suffix"; adjective "main, principal" | with oil; my head |
| Isa 53:4 | חלינו; נשא; מכה | *חָלָה* "past, 1st person plural: to become sick"; adjective "lofty, exalted"; noun "an attack… a wound" | our sicknesses; he bore; smitten |
| Isa 53:5, 53:6 | מחלל; מדכא; תעינו; פנינו | "to desecrate"; "to oppress" (active); *עִיֵּן* "to see, view", future 2mp; *פִּנָּה* "to clear" | pierced; crushed; we strayed; we turned |
| Ruth 1:16 | אל (first); אלין; עמך; עמי | preposition "to"; Aramaic *אִלֵּין* "these"; "with you"; "with me" | "do not"; "I will lodge"; "your people"; "my people" |
| Ruth 1:17 | אמות; ושם; יעשה | *אַמָּה* "cubit"; *שֵׁם* "name"; *נַעֲשָׂה* "to be done" | I will die; and there; will do |

The card marks none of these as doubtful beyond a confidence near 0.45, and it marks the right readings the same way. The
sentence is announced as Modern Hebrew although it holds *ויאמר, ויהי, וירא, ויבדל, ויקרא* (wayyiqtol forms the card itself
identifies).

### 4.6 Modern Hebrew

**Blank** (running text and battery): every word with unpointed ש or כש in front unless the Bible happens to hold it (*שליד,
שהיא, שאבא, שזה, שהילדים, שקנינו, שראיתי, שאמרתי, שבתיק, שהתוכנית, כשהגעתי, ושכדאי, ושהמחירים, לכשתגיע*); nouns with a
possessive suffix outside the tables (*בערכם, דמותו, ובזכויותיהם*); passives (*הוזמן, מוזמן, עוצבה, חוננו*); *הדיור,
מיליארדי, חורין, לסופרמרקט, בווטסאפ, בסטארטאפ, טראמפ*; every word with an apostrophe letter (*קפוצ'ינו, ג'ורג', לצ'ילה*);
abbreviations (*בצה"ל, ד"ר, ארה"ב, וכו', לת"א, בע"מ, יו"ר, מנכ"ל, התנ"ך, הרמב"ם, ז"ל*); digits (*25, 12:30*).

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| אני צריך לשאול את אשתי. | צריך; לשאול | *צַר* "adversary, foe", masculine plural construct; proper noun "Saul" | need; to ask |
| אחרי הישיבה אכלנו צהריים | אכלנו | *אִכֵּל* "to corrode" | we ate |
| ובסוף השבוע ירד גשם | ירד | proper noun "Jared" | will fall / fell |
| בארץ ישראל קם העם היהודי | קם | noun "foe" | arose |
| אמרה שיש לנו ישיבה חשובה | שיש; ישיבה | *שָׂשׂ* "to rejoice", imperative; verb *יָשַׁב* "to sit" | "that there is"; a meeting |
| הרוחנית, הדתית והמדינית | והמדינית | "Midianite" | political |
| האישה הזאת. | האישה | *אִישׁ*, "man, husband; each", "masculine singular, construct, with the article" | the woman (the full spelling of אשה) |
| ולכן לא באתי. | ולכן | *לְ* + suffix: "and to you (pl. f.)" | therefore |
| קמתי מוקדם והלכתי לעבודה | והלכתי | weqatal, "And I will go" | and I went |
| ואקרא כמה ספרים | ואקרא | wayyiqtol, "And I called" | and I will read |
| כבר ישבו … ועבדו | ועבדו | imperative, "And work! (plural)" | and they worked |
| המוכרת שאלה אותי | המוכרת; שאלה | adjective "Familiar, known"; noun "question" | the saleswoman; asked |
| במאפייה הקטנה שליד הבית | הבית | proper noun *בֵּית* "alternative form of בי״ת" (the letter) | the house |
| אני עדיין לא יודע | יודע | *יֻדַּע*, past, "to be informed" | know |
| היא שרה שיר. / אנחנו גרים בחיפה. / קנינו בית. | שרה; גרים; קנינו | "Sarah"; *גֵּר* "foreigner"; noun *קִנְיָן* | sang; live; we bought |
| היינו שם. / שב בבקשה! / הוא נכנס לחדר. | היינו; שב; נכנס | conjunction "that is"; "He returned"; *כִּנֵּס* "to assemble", future 1st plural | we were; sit!; entered |
| אסור לעשן כאן. / החשבון שולם. | אסור; שולם | *אָסַר* imperative "to bind"; "to be safe", present | forbidden; was paid |
| את יפה מאוד. / הן באות מחר. | את; הן | object marker; particle "lo!" | you (f.); they (f.) |
| בגללו איחרתי. / היא ראתה את עצמה. | בגללו; עצמה | *גָּלַל* "to roll", imperative; verb *עִצֵּם* | because of him; herself |
| זה אחי הגדול. / מילה אחת. | אחי; מילה | "bro, man, dude"; "circumcision" | my brother; word |
| אתה בא למסיבה / בתבונה ובמצפון / חובה עליהם לנהוג | למסיבה; ובמצפון; חובה; לנהוג | *הֵסֵב* "to cause a change in course"; "north"; "debt" + "her"; adjective "customary" | to the party; and conscience; a duty; to behave |
| מזג האוויר / לפי התוכנית / להורדת מחירי | מזג; לפי; להורדת | imperative "to pour"; "mouth"; "past, 2nd person feminine singular" | weather; according to; "for the lowering of" |
| היא סיפרה | היא | lemma *הוּא*, "he, it; that" | she |
| נתניהו נאם בכנסת. | נתניהו | "Nethaniah" | Netanyahu |

**Form line.** Every future with ת־ is "2nd person masculine singular" where the subject is feminine: *הממשלה תאשר, המדינה
תבנה, ותשקיע, התוכנית לא תפתור* (4 of 4). An infinitive whose ל is cut by rule is "past, 3rd person masculine singular":
*להתכונן, להתלבש, להזמין*. *כותב* and *כותבים* after a pronoun are the noun "writer"; *אוהב* is "future, 1st person"; *יכול* is
"He was able". *האוטובוס* is "construct, with the article". *בני האדם* is "son, singular". The present tense is labelled
"present" and its lemma is the past 3ms (right); the meaning line for a Modern verb is the bare infinitive gloss ("to walk,
go"), with no person or tense in English.

**Abbreviations read as numbers** (the letters happen to descend in value): *ש"ח* "308", *ק"מ* "140", *ע"י* "80", *עו"ד* "80",
*רח'* "208". Right as numbers: *ב', ג', כ"ט, תשפ"ו* (786; the thousands are not stated).

**The hand table of prepositions with suffixes** (read whole): the spellings are right. Faults: one slot serves the second
person singular, so the feminine *עלייך, אלייך, לפנייך, אחרייך* are "you (sg.)"; *איתי, איתך…* are filed under *אֵת* with no link
to *עִם*, whose suffixed forms they are in Modern Hebrew; *ממנו* gives "from him" and "from us" with nothing to choose; the
table outranks every other reading (*ולכן, עמך, עמי*). Missing: *בין (בינינו, ביניהם), בגלל, בלי / בלעדי, ליד, מול, תחת,
בתוך, עבור, לגבי, כלפי, מאחורי, לקראת, אודות, על ידי, עצמ־, אין (אינני, אינו), עוד, הרי, כול־*. Some of these are read from
Wiktionary tables (*בלעדיך, לידי, עבורך, לדעתי, בעצמו, כולנו, ישנם*), with the suffix named there.

**Right in the battery**: the tenses and binyanim where Wiktionary has the table and the word has one reading (*דיברתי,
מתלבש, התלבשתי, הזמנתי, מזמין, נסגרה, ייכנסו, ייכתב, מרגיש, מתחיל, התקשרתי, אשאר*); loanwords in the dictionary (*טלפון,
אוניברסיטה, אינטרנט, טלוויזיה, סטודנט, קפה, אוטובוס, פלאפל, סבבה, יאללה, פרגן, גוגל, קורונה*); plene and defective spellings
reach one lemma for *שולחן / שלחן, כיסא / כסא, אמיתי / אמתי, עיתון / עתון, מאוד / מאד, צהריים / צהרים* (not for *אישה, מילה*);
*של, יש, אין, לו, שלי, אותי, עליי, ממני*.

### 4.7 Mishnaic Hebrew

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| רַבִּי אֱלִיעֶזֶר אוֹמֵר | רַבִּי | *רְבָה*, verb, "Paʿel, perfect, 3rd person masculine singular", "He grew great", variety Biblical Aramaic (three times in 118 words) | Rabbi |
| מֵאֵימָתַי קוֹרִין אֶת שְׁמַע | קוֹרִין | *קָרָה* "to happen", unconfirmed, no meaning | קוֹרִים of קָרָא, "(they) recite" |
| לֹא קָרִינוּ אֶת שְׁמַע | קָרִינוּ | *קָרָה*, "To happen, occur, go on." | we have not recited |
| בֵּין תְּכֵלֶת לְלָבָן / לְכַרְתִּי | לְלָבָן; לְכַרְתִּי | proper noun "Laban"; participle of *כָּרַת* (guess) | white; leek-green |
| עַד הָנֵץ הַחַמָּה | הָנֵץ | "hawk, falcon" | sunrise |
| הֶקְטֵר חֲלָבִים | חֲלָבִים | "milk", plural | fats |
| Avot 1 | וּבוֹטֵל; לִימוֹת; וְאֵילָךְ | *טַל* "dew" with ו and ב cut off; *מוּת* "die"; *אַיִל* "ram" (all guesses) | "and idle"; "for the days of"; "and onward" |

Blank: *רַבָּן, שַׁמַּאי, טַרְפוֹן, רַשַּׁאי, שֶׁמָּא, עַכְשָׁיו, הַבְּרִיּוֹת, הָאַשְׁמוּרָה, בִּתְרוּמָתָן, וְגוֹמְרָהּ, כְּשֶׁקִּבְּלוּ, מִתַּלְמִידָיו,
גְּמִילוּת, גֵּיהִנֹּם, מְסָרוּהָ* and the Aramaic of Avot 1:13. The period line says Biblical Hebrew (46 sentences) or Modern
Hebrew (14); with Mishnaic declared, *קוֹרִין* and *רַבִּי* are shown exactly as before and the sentence is still "Modern
Hebrew". The project's `RABBINIC-AUDIT.md` counts a word as "covered" when it has any reading; of the 109 words here that
are blank or unconfirmed, and of the 9 confirmed readings I found wrong in 118 words, it says nothing.

### 4.8 Divine names, numbers, names

- *יְהוָה*: proper noun, "the LORD (YHWH)"; with the vowels of Elohim (*יֱהֹוִה*) the meaning is "God". Right. The
  transliteration prints "yehova" / "yehovi" (4.4). *אֲדֹנָי*: "masculine plural, construct", "the Lord (of God)", the same
  card for the divine title and for *אֲדֹנָי* "my lords" in Gen 18:3. *שַׁדַּי* "sufficient, Almighty"; *יָהּ* "Jah"; *צְבָאוֹת*
  "army, war, warfare". *אֱלֹהִים*: "masculine plural, absolute", "God; gods": nothing on the card says that it takes a
  singular verb (the orientation does).
- Numbers: *שְׁלֹשָׁה* is "masculine", *שָׁלֹשׁ* "feminine" (the gender of the counted noun, the source's convention), both under
  the lemma *שָׁלוֹשׁ*; nothing explains the reversed endings. *עָשָׂר* (in the teens) and *עֲשָׂרָה* go to two lemmas (*עָשָׂר* and *עֶשֶׂר*), both "ten"; in
  Modern text *עשר* is "-teen". *רִאשׁוֹן* is shown without "ordinal". Dual numerals are right (*שְׁנַיִם, שְׁנֵי, שְׁתֵּים, מָאתַיִם*; Modern *אלפיים*).
- Number words for speech (`numbers.ts`, run directly): 111 is "מאה אחד עשר", 1020 "אלף עשרים", 1100 "אלף מאה", 1111 "אלף
  מאה אחד עשר". Correct: מאה ואחד עשר, אלף ועשרים, אלף ומאה, אלף מאה ואחד עשר (ו stands before the last element). A bare
  number is given in the masculine (*שלושה, שניים*); counting with no noun uses the feminine (*שלוש, שתיים*).
- Names are good where the form is only a name (*אַבְרָהָם, מֹשֶׁה, דָּוִד, יַעֲקֹב, פַּרְעֹה, צִיּוֹן*). A name that spells a
  common word loses or wins by count alone (4.1). A two-word name is one lemma on each word: *בֵּית* of Bethlehem is "house",
  *לֶחֶם* is "bread" (lemma numbers aside, 82 tokens), and *עֹבֵד* alone is "Obed-edom".
- **Jerusalem.** The index key keeps the repository text's unusual order of marks. In any text that writes the word in
  normalised order (the Westminster Leningrad text does), the form is not found: the card shows "unconfirmed", "the lemma is
  a guess from the ending and no meaning is given" (642 tokens of the Bible; seen in `accent-strip-out.txt` and battery 4).

### 4.9 Lemma headwords and glosses (the index's lemma table)

- Strong's headwords a learner will not find in a grammar: *יָלַךְ* for every imperfect, imperative and infinitive of הלך
  (*וַיֵּלֶךְ, לֵךְ, לָלֶכֶת, אֵלֵךְ*); *אֵל* for the preposition אֶל (3,541 tokens: the card of אֶל shows the lemma אֵל); *חֵסֵד* for
  חֶסֶד; *שׂוּם* for שִׂים; *שָׁנֶה* for שָׁנָה; *טוֹפָפָה* for טוֹטָפֹת; *לוּא* for לוּ; *סָפַר* as a noun for "scribe"; *אֶשֶׁר* for
  אַשְׁרֵי; *הוּא* for הִיא.
- 33 headwords lack the dagesh of their first letter: *דָבַר* (1,142 tokens), *בָרַךְ* (330), *דָנִיֵּאל, כֹתֶרֶת, גַב*. 31 carry
  a stress mark inside the word (*מִשְׁעֶ֫נֶת, תּוֹכַ֫חַת, שִׁבֹּ֫לֶת*). Both are printed as the lemma.
- Glosses: *מַדּוּעַ* "why" has the gloss **"i"** (72 tokens). *נָא*: "I, we, pray". *רֶגֶל*: "foot, three times". *בָרַךְ*:
  "kneel, bless, kneel down" (the cause of 4.3). In Modern text the Biblical gloss is shown on Modern words: *משפחה* "clan,
  guild, species", *המדינה* "province", *ספרים* "missive, document, writing", *אולי* "peradventure, perhaps", *קניתי* "I got".
- A Wiktionary gloss that is a spelling note is shown as the meaning: *תהו* "defective spelling of תוהו", *מלה* "defective
  spelling of מילה", *תדבר* "defective spelling of דיבר", *הבעיה / העבירה* likewise, *הבית* "alternative form of בי״ת".

### 4.10 The Aramaic inside the Hebrew Bible (for the Aramaic auditor)

The Hebrew card reads the Aramaic chapters itself. A verse is "Biblical Aramaic" when more words have an Aramaic than a
Hebrew reading (268 verses of the printed text, about the right number). Aramaic stems are named (Peʿal, Paʿel, Hafʿel), the
emphatic state is "determined (emphatic), with the article", and the English is made by the same engine (*עֲבַד* "He made",
*חֱיִי* "Live!"). Faults seen: the lemma of an Aramaic word is often the **Hebrew** headword (*מַלְכָּא* → מֶלֶךְ, *שְׁמַיָּא* →
שָׁמַיִן, *לְעָלְמִין* → עָלַם), so the item is stored under a Hebrew lemma id (from the code: ids are `lemma:he:<headword>`), which
contradicts the pack's "never credited to Hebrew"; inside Aramaic verses the Hebrew homonym is shown for the function words
(3.1); Aramaic readings leak into Hebrew verses (*בָּרָא, דָּנִיֵּאל*) and into the Mishnah (*רַבִּי*); of 4,821 Aramaic tokens the
card has the source's lemma for 4,130.

### 4.11 The dictionary line (Wiktionary)

Entries are found by consonants, so the line mixes words: *מִן* → "manna"; *עַם* → "A nation, a people. ; With: used to
indicate togetherness"; *מֶלֶךְ* → "king ; to reign"; *אַתָּה* → "you … ; to come"; *בָּרָא* (shown as בַּר) → "grain ; outside,
outdoors, wilderness"; *יָד* in Modern text → "arm". There is no frequency list (`hasFrequency: false`), so nothing ranks the
senses or the homographs.

## 5. The "All forms" table

The adapter generates no forms, so there are no wrong generated forms to list. The table is every attested or listed form of
the lemma, one per set of features, with the others as "also …".

- **The headline form of a cell is whichever spelling was met first, often the wrong one to teach**: *דָבָר (also דָּבָר)*, *בָא
  (also בָּא)*, *גָדוֹל (also גָּדוֹל, גָדֹל, גָּדֹל)*, *דְבַר, דְבָרִים, בָאוּ*: the form without dagesh, which occurs only after
  a vowel; pausal or maqaf forms before the normal one: *יִשְׁמָר (also יִשְׁמֹר)*, *כְּתָב (also כְּתֹב)*, *הִשָּׁמֶר (also
  הִשָּׁמֵר)*, *כָּתַבְתָּ (also כָּתָבְתָּ)*.
- **Wrong cells from the source's own tags**: the pronoun table of *הוּא* has "3rd masculine singular: הוּא (also הִוא)" and
  "3rd feminine singular: הִוא (also הִיא)".
- **Homographs are merged by consonants**: the noun table of *דָּבָר* holds "absolute singular: דַּבָּר (also דָּבָר)", "construct:
  דְּבַר (also דַּבַּר)" and cells "Sing.Abs = דברי (also דְּבָרִי; דברך; דְּבָרְךָ)". The table the card builds for *שנה* "year"
  holds *שינה, שינות* ("sleep").
- **The note under the table repeats itself once per installed shard**: "attested in the Tanakh (Open Scriptures morphology)
  and attested in the Tanakh (Open Scriptures morphology) and attested in the Tanakh …".
- **The merge with the dictionary's table** (356 everyday words, the extension's own `buildParadigm`): 1,489 of 7,746 cells
  are "conflict", in 211 words. Almost none is a conflict: (a) Wiktionary writes a construct with a maqaf (*יֶלֶד־*) and the
  adapter without; (b) one side is pointed and the other is not (*אנשים* against *אֲנָשִׁים*); (c) the possessed forms of the
  singular and of the plural noun fall into one cell, so "my child" *יַלְדִּי* is shown with "my children" *יְלָדַי / ילדיי* as
  its alternative (the same for *בת, משפחה, יום, שבוע, חודש, שנה, זמן*); (d) the card's lemma is the wrong word, so *אישה*
  gets the table of *אִישׁ*, *ילדה* of the verb *יָלַד*, *חבר* of the verb *חָבַר*; (e) a missing imperative is the string "-"
  and is compared as a form. 3,061 cells (39.5 %) are the adapter's alone.

## 6. Grammar not modelled at all

- **Any grammar note.** `detectPatterns` and `detectPhrases` return nothing (from the code); the only "constructions" on a
  card are the form's own features with the text "the pack has no separate explanation for this combination". So nothing is
  said about: the wayyiqtol chain (the pack explains it; no card shows it); the construct chain (*בֵּית־הַמֶּלֶךְ, דִּבְרֵי
  הַיָּמִים*: the first word is "construct", nothing joins it to the second, and the article rule is not stated); the infinitive
  absolute with a finite verb (*מוֹת תָּמוּת*: "to die" and "You will die"); the cognate accusative; relative clauses with
  אֲשֶׁר or שֶׁ; verbless clauses; the question particle beyond the word "(question)"; *אֵין / יֵשׁ* + ל for possession; oath
  formulas (*אִם* = "surely not"); comparison with *מִן*; *כִּי* in its uses (one gloss: "that, because, for, when");
  *הִנֵּה*; *אֶת* before a definite object in Modern Hebrew; *של*; the present tense as a participle.
- **Syntax.** The adapter has no syntax rules, so the role line is empty except "object marker". Agreement, the subject of a
  verb, the two members of a construct chain, what an adjective qualifies: nothing.
- **Any use of the sentence to choose a reading inside a period** (the adapter says so): state, person, jussive, name
  against common noun, אֶת against אֵת, Modern homographs.
- **The suffix's person, gender and number** (4.2); the energic nun; pausal forms as such.
- **Unpointed ש / כש / מש / לכש as prefixes**, and a prefix before anything the tables do not list.
- **Modern Hebrew word formation**: possessive suffixes on nouns beyond the listed tables, verbs without a Wiktionary table,
  passive binyanim (Puʿal, Hufʿal) of most verbs, verbal nouns in construct, adjectives in ־י, numerals in the feminine,
  abbreviations, letters with geresh (ג' צ' ז'), digits, dates.
- **Mishnaic Hebrew**: everything but the *־ִין* rule (and that rule gives the wrong verb for *קוֹרִין*).
- **Ketiv and qere**: the index keys the qere as printed; an unpointed ketiv inside a pointed verse is read as a Modern word.
- **A frequency list** for either period's dictionary, and so any ranking of Modern homographs.
- **Stress**, vowel length, shva na / nach, qamats qatan, in the transliteration.

## 7. Orientation and course texts

Hebrew has no course material: there is no `data/ladder/he`, `data/stage0/he` or `data/gold/he`. Only the orientation
(`tutorial/he.ts`) and the pack texts exist.

- The practice sentence is Genesis 1:1, target *אֱלֹהִים*, which the card reads rightly. The word beside it, *בָּרָא*, is the
  Aramaic "field" (4.1). A learner who taps the next word of the first lesson gets the worst card in the Bible.
- "The card shows them as parts of the word, each with its meaning … שֶׁ 'that'": true on pointed Bible text. On the unpointed
  Modern text that is the default target, ש is never cut off.
- "how often the Bible reads it this way" (the card-feature note): the count is not on the card. It is kept in the reading's
  notes, and the card prints only the rule and context notes (from the code; no count appeared in any probe). The Variants
  tab gives the lemma's total.
- "A form of the other period is still shown, with a note saying where it belongs": the note is a line "Variety: he-bib." in
  codes. *והלכתי* in a Modern sentence is shown as "weqatal … And I will go" with no warning.
- The pack's explanation of Number: "Hebrew has a dual … for things that come in pairs: יָדַיִם 'two hands', שָׁמַיִם 'heavens'".
  *שָׁמַיִם* is not a dual, and the card itself calls it "masculine plural". *יָדַיִם* is "hands", not "two hands".
- The pack's Binyan line: "Piʿel intensive or causative, Hifʿil causative". The card's own stem note is more careful; neither
  helps when the English is "He knelt".
- "twenty-two letters, all consonants": a beginner is not told that א ה ו י also stand for vowels, which is the first thing
  needed to read unpointed Modern Hebrew.
- The examples are correct Hebrew: *שָׁלוֹם, מֶלֶךְ, אֱלֹהִים, וַיֹּאמֶר, כּוֹתֵב, הַשָּׁמַיִם, וְאֵת, בְּרֵאשִׁית*.

## 8. What to fix first

1. **Show the reading the adapter put first**, or make confidence respect the period: no Aramaic reading in a Hebrew verse, no
   Wiktionary reading over the Bible's own inside a cantillated verse. Stop counting core forms twice.
2. **Name the suffix.** Put the suffix's person, gender and number in the form line and the meaning ("to him", "his word",
   "when you sit"); call the suffix on *אֹת־* an object and on an infinitive its subject; keep the 3ms reading of *מִמֶּנּוּ*.
3. **The English of derived stems.** Add the roots of 4.3 to the stem-sense table (ברך, נצל, ידה, שחת, כפר, שלם, פלל, נוח,
   ספר, שכם, למד, חלל, כבד, פקד, יצב, הלך Hifʿil, נפל Hifʿil, שאר, קשב, כבס, קלל, …), and where a root is not listed show the
   lemma gloss with the stem named instead of an invented sentence. Fix the broken English ("being remained over", "assembled
   as a", "impeled").
4. **The transliteration**: silent shva; holam on vav after a silent letter and after yod; qamats qatan (keep the sign the
   text gives); furtive patah; quiescent aleph; *־ָיו*; *הִוא*; Jerusalem; no reading of the Name. Name the scheme truthfully.
5. **Unpointed ש, כש, מש** as prefixes; then rank Modern homographs with a frequency list, and never let the Biblical
   sequential forms win in a sentence read as Modern.
6. **Abbreviations**: a list (צה"ל, ד"ר, ארה"ב, וכו', ע"י, ש"ח, ק"מ, ק"ג, ס"מ, עו"ד, רח', בע"מ, יו"ר, ז"ל, ת"א …) before the
   letters-as-number rule; letters with geresh as letters.
7. **The index**: add the 143 dropped tokens (*מְזֻזוֹת* first); key *יְרוּשָׁלִַם* in normalised order; give *הִיא* its own lemma
   and "she"; fix the headwords of 4.9 and the gloss of *מַדּוּעַ*.
8. **The period line**: wayyiqtol forms in an unpointed sentence make it Biblical; a fully pointed sentence with Modern-only
   words is not Biblical; say "Mishnaic Hebrew is not analysed" on a Mishnah sentence instead of naming another period; never
   read *רַבִּי* as a verb.
9. **Grammar notes**: the three the pack already explains (attached prefix, construct chain, wayyiqtol) and the infinitive
   absolute + finite verb, at the least.
10. **The table merge**: compare without the maqaf and without points; split possessed forms by the number of the noun; do
    not use "-" as a form; choose the headline form by frequency with the dagesh; one source sentence, not one per shard.
11. **The orientation**: another practice neighbour or a fixed *בָּרָא*; correct the dual example; say what happens to ש.
12. **Number words**: ו before the last element in every case; the feminine for a bare number.

## 9. Limits of this audit

- I am a language model, not a Hebraist or a native speaker, and looked nothing up. Meanings marked "Correct" are the
  ordinary dictionary senses; I am sure of them. Items I am less sure of: whether every one of the 26 "from him" tokens and
  none of the 145 "from us" tokens of *מִמֶּנּוּ* is mis-tagged in the source (I checked Gen 2:17 and 3:5 only); the exact
  count of Jerusalem tokens affected in real web texts (it depends on the edition); my Modern Hebrew text, which is a
  machine's and may contain unidiomatic phrases; the two texts quoted from memory at its end (article 1 of the Universal
  Declaration and the opening of the Declaration of Independence), which may differ from the official wording.
- The whole-Tanakh figure for unpointed text (24.19 % "wrong lemma") counts as wrong every case where the card shows a
  Wiktionary lemma that is the same word under another headword (*מֵת* for מוּת, *הָלַךְ* for יָלַךְ, *נִקְבַּר* for קָבַר
  Nifʿal). The hand count on 228 words (about 13 % plainly wrong) is the better figure; the machine figure is an upper bound.
- "Card = source reading" measures agreement with the Open Scriptures tags, not truth. Where the source is wrong
  (*מִמֶּנּוּ*, *וַיִּשְׁתַּחֲווּ*, *הִוא* in the masculine row) the card agrees with it and is wrong.
- The hand counts of wrong English (60 of 260 pairs) and of wrong transliterations are my judgement of each line; a stricter
  reader would add the weak ones I let pass ("He was seen" for נִרְאָה, "going" for מִתְהַלֵּךְ, "He sent" for שִׁלַּח).
- I read 118 of the 673 Mishnah words card by card; the rest is machine counts.
- Not audited: `production.ts` (three rules on a learner's own Hebrew), the Variants tab beyond what the probes printed, the
  dictionary's full records beyond the merge, Biblia's own path (it passes the source's reading of the tapped word and so
  avoids most of 4.1, but not 4.2 to 4.4), the 9,200 glosses beyond the 150 commonest and the mechanical checks, Medieval
  Hebrew, poetry as such, and the behaviour in a browser (everything was run through the card's parser in Node; I did not
  see how the panel displays a "conflict" cell or an unconfirmed reading).
- The Westminster Leningrad run uses a local copy of the source outside the repository; nothing was downloaded.
- Two (verb, stem) rows of `stems-out.txt` show a proper noun as the card's lemma (*מַשְׂכִּיל, מְנַחֵם*) although the source's
  reading was asked for; I did not find out why and left them out of the count.

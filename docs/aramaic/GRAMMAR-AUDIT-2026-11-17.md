# Biblical Aramaic grammar audit (language code `arc`), 2026-11-17

Auditor: the Biblical Aramaic grammar-audit agent (an AI model, not a Semitist). Code audited: the shared clone at master
`985c742b` (read-only). Brief from the owner: audit the linguistic content, be brutal, note every missed feature and detail,
and weigh every finding against what the GoLearn card actually shows. Nothing was looked up: every judgement of Aramaic
below is from my own knowledge. The Aramaic forms quoted as evidence are copied from the tools' output (accents removed), not
typed; the few dictionary forms in my own corrections and the Hebrew words in section 7 are typed by me.

## 1. Verdict

This pack is not an analyser of Aramaic. It is a lookup table: the 4,828 words of the Aramaic parts of the Bible, each with
the parse the Open Scriptures Hebrew Bible (OSHB) gives it and the headword and gloss of Strong's dictionary (1890). Inside
its own verse every word is found. Almost everything a learner needs on top of that is missing or wrong.

- **Coverage inside the corpus is complete; outside the exact verse it breaks.** All 4,828 words get the source's reading when
  the sentence is exactly the bundled verse. Take the word alone, or half a verse, and the first reading is not the source's
  for 291 words (6.0 %). Read Daniel in another edition (the Miqra al pi ha-Masorah text the owner's Biblia app uses, which is
  also Sefaria's default text) and the verse is recognised in 175 of 269 verses, 52 Aramaic words are blank and 127 show
  another reading. Of the 120 ketiv (written) forms, 86 are blank. The whole of Daniel 2:4, as any Bible prints it, is not
  recognised, because the pack holds only its second half.
- **The meaning line is wrong for most verbs.** English is made from Strong's gloss by a generic routine that ignores tense,
  stem and voice. 610 of the 1,068 verb tokens (57 %) show a wrong tense, voice or sense; with the imperfect shown as a
  present it is 784 (73 %). "Blessed be the name of God" (Dan 2:20): *blessed* is shown as "kneeling". "Do not destroy the
  wise men" (2:24): "You perish". "O king, live for ever" (2:4): "You live". "You have been weighed" (5:27): "You weigh".
  Every determined noun keeps the indefinite gloss: *malka* is "a king" (372 such tokens).
- **The card speaks Hebrew grammar.** The form line is written by the Hebrew describer: every determined noun is "with the
  article" (848 tokens), the tenses are "perfect (qatal)" and "imperfect (yiqtol)". There is no transliteration and no
  pronunciation line at all, no grammar note ever fires, there is no "All forms" table, no dictionary line, no sentence
  role. The person of a pronominal suffix is never shown (566 tokens): *his name* and *your servant* both say only
  "possessive suffix".
- **The dictionary forms are Strong's, and many are not Aramaic.** The verb "to be" is filed under a form that does not
  exist (71 tokens), "this" likewise (58 tokens), "queen" is filed under the spelling of "the king", "sons" and "son" are two
  words, and so are the two halves of "go", of "go up" and of "complete".
- **The source's own mistakes are shown at confidence 0.98.** In the 2,013 words I read in full (Daniel 2:4b to 3:30, Ezra
  4:8 to 5:17) I count 32 wrong form lines (1.6 %); the project had flagged 4 of them, and its flag never reaches the card.
  Outside its verse one wrong tag spreads: all fourteen other instances of the participle "seeing" are then shown as a
  Haphel.

As a concordance of the source annotation it is faithful. As a card that teaches Biblical Aramaic it is not ready: the
form line can be used with care, the meaning line cannot be trusted for any verb, and the orientation does not tell a
Hebrew reader the first things about Aramaic.

## 2. How this was audited, and the numbers

1. **Read the code**: `src/adapters/arc.ts`, `aramaic/meta.ts`, `aramaic/resources.ts`, the head and the tables of
   `aramaic/seed.ts`; the shared Hebrew files it uses (`hebrew/text.ts`, `hebrew/oshb.ts`, `hebrew/describe.ts`); the
   generic meaning routine (`src/adapters/word-analysis.ts`, `src/core/word-analysis.ts`); the card parser
   (`packages/golearn-extension/src/parser/index.ts`, `cardModel.ts`); the language resolver (`language/resolve.ts`, the
   Hebrew-script branch); the pack and the orientation; `docs/aramaic/` (COVERAGE, INTEGRATION, SOURCES).
   Not read: `scripts/arc-build.mts` and the other `arc-*` scripts, `src/course/aramaic.ts` beyond its head, the GoReview
   facts provider, `core/english-verb.ts` (tested through its output only).
2. **What the pack is** (established from the code and the data):
   - Corpus: Daniel 2:4b to 7:28 (200 verses, 3,599 words), Ezra 4:8 to 6:18 and 7:12 to 26 (67 verses, 1,212 words),
     Jeremiah 10:11 (15 words), the two words of Genesis 31:47: 269 verses, 4,828 words, the qere reading path of the
     Westminster Leningrad Codex. My count agrees with COVERAGE.md. Nothing else: no Targum, no Egyptian or Qumran Aramaic,
     no Syriac, no New Testament Aramaic.
   - Readings: every reading is one OSHB word annotation (a code such as `ANcmsd/Td`, a lemma number, letter counts for
     the pieces). There are no rules and no guesser. Headword and meaning come from Strong's dictionary by the lemma number
     (714 entries), or from the OSHB Lexical Index where Strong gives only a usage list.
   - A pointed word is looked up by its exact pointed spelling (accents ignored); an unpointed word by its consonants, at
     confidence 0.6. When the sentence is word for word one of the 269 verses, that verse's own annotation is put first at
     0.98. Otherwise the readings of the form are listed in the order of first occurrence in the Bible, all at 0.92, and
     the card shows the first.
   - A word outside the table gets no reading: "Not an entry of the Biblical Aramaic word list ... the word is unknown to
     this pack."
3. **Every word of the corpus through the card** (`coverall.mts`, words cut by the adapter's own tokeniser `heTokenize`,
   not the Latin regex of the example tool): 4,828 words in 269 verses, each in its own verse. Output `coverall.tsv`.
4. **The same 4,828 words in four other conditions** (`robust.mts`, the adapter's `analyze` with the card's own rule for
   picking the first reading): alone; in a half verse cut at the atnah; unpointed; in a second edition (MAM, from the
   owner's Biblia data, which carries the OSHB annotation per word, so the truth is known).
5. **Dumped the whole data** (`dump.mts`): the 714 dictionary entries (read all), the 2,083 distinct readings, the 104
   pointed forms with more than one reading, the verbs by stem. **Mechanical checks** of every annotation against the
   shape of the word (`consist.mts`, `posodd.mts`): endings against number and state, prefixes against stem and tense,
   suffix shape against its tag.
6. **Read in full, by hand**: Daniel 2:4b to 3:30 and Ezra 4:8 to 5:17 (2,013 words, 983 distinct readings; `sampleA.txt`,
   `sampleB.txt`, `sampleC.txt`). The rest of the corpus was checked mechanically and by look-up of chosen forms, not read
   line by line.
7. **Two batteries** through the card (`card.mts`): the famous lines and the language boundary (15 passages, 224 words),
   and text outside the corpus (36 lines, 195 words: Targum Onkelos, New Testament Aramaic in square script, the Kaddish,
   single unpointed words, Hebrew verses, Syriac script, Latin letters, the Hebrew card on an Aramaic verse).
8. **The 120 ketiv forms** of the bundled source snapshot, each through the adapter (`ketiv.mts`).

**Where the text came from.** Aramaic verses: `data/corpus/arc/*.json` in the clone (the text the project ships). Second
edition and all Hebrew verses (Daniel 1:1-2 and 2:4, Ezra 4:7 and 6:19-20, Jeremiah 10:10 and 10:12, Genesis 1:1-3 and
31:47, Psalm 23:1-3): `C:\Users\CJWal\dev\biblia-v0\public\data\he\` (MAM via Sefaria, read only). Ketiv forms:
`data/sources/aramaic/oshb-aramaic-snapshot.xml`. Typed by me, without any vowel points: 23 lines of battery 2.

Everything is in `C:\Users\CJWal\dev\tmp-mem\arcaudit\`.

| Measure | Result |
|---|---|
| Corpus words through the card, each in its own verse | 4,828 |
| Blank card | 0 |
| Marked guess | 0 (the pack never guesses) |
| Source reading shown first, confidence 0.98 | 4,828 |
| ... of which the card also lists "other readings possible even with the sentence" | 1,157 (24 %) |
| Form line empty (prepositions, adverbs, conjunctions, names) | 985 |
| Form line is the raw tag "Dem" | 13 |
| Words with a pronominal suffix / suffix person shown | 566 / 0 |
| Transliteration or pronunciation line | 0 of 4,828 |
| Grammar notes (patterns), fixed phrases, sentence role, dictionary line | 0, 0, 0, 0 |
| Verb tokens / meaning line wrong in tense, voice or sense (machine count) | 1,068 / 610 (57 %); 784 (73 %) if a present for an imperfect is counted |
| Determined nouns whose meaning is "a ..." or "an ..." | 372 |
| Hand count, 2,013 words read in full: wrong form line shown as confirmed | 32 (1.6 %): 29 sure, 2 "check", 1 inconsistent label; 4 of them flagged by the project |
| Same sample: pronoun copula labelled "affirmative particle" | 7 more |
| Word alone: first reading is not the source's | 291 of 4,828 (6.0 %), 25 of them another word |
| Half verse (cut at the atnah): first reading is not the source's | 287 of 4,705 (6.1 %) |
| Unpointed verse: first reading is not the source's | 489 of 4,828 (10.1 %), 105 of them another word |
| Second edition (MAM): verses recognised as the annotated verse | 175 of 269 |
| Second edition: Aramaic words blank / another reading first | 52 / 127 of 4,821 scored |
| Ketiv forms: blank / another word | 86 / 5 of 120 |
| Dictionary entries (Strong) | 714; vocabulary items as the card keys them (headword + part of speech) 744; 9 collisions, 32 words split over several items |
| Occurrences the project flags for review / flag visible on the card | 12 / 0 |

The first block is exact. The hand count is mine and could be off by a few. The robustness rows are exact for the texts
named; a web page with yet another text will differ.

## 3. What the card shows, and what is wrong with each part

| Part of the card | State | Section |
|---|---|---|
| Lemma | Strong's headword. Wrong vocalisation for the commonest verb and pronoun, split suppletive words, a Hebrew word for "sons", headwords that look like other words | 4.5, 5.1 |
| Part of speech | From the OSHB tag. *di* is five parts of speech, the copula pronoun is an "affirmative particle", a handful of plain mistakes | 4.3, 4.4 |
| Form line | The OSHB parse in the words of the Hebrew describer: right for about 98 % of words in their verse; "with the article", "(qatal)", "(yiqtol)" are Hebrew terms; the suffix is never described; raw "Dem" | 4.2, 4.3 |
| Own meaning | Verbs: generic English present, stem and voice ignored. Nouns: indefinite gloss for the determined state. Glosses are Strong's prose, often his etymology and not the meaning | 4.1, 5.2 |
| Other readings | Up to three, each shown as lemma + part of speech + gloss, with no form: three identical lines "*di*, SCONJ/CONJ/PRON, that, used as relative conjunction ..." | 4.6 |
| Word parts | Good where the source cuts: prefixes *w-, b-, k-, l-, min-*, the determined ending, the suffix. The suffix has no person; the object marker *l-* is named only sometimes | 4.2 |
| Transliteration / pronunciation | None. The adapter returns nothing; the pack says `pronunciationNotes: false` | 4.9 |
| Grammar notes | None. `detectPatterns` returns nothing. Every inflected word carries the sentence "The form shows these features; the pack has no separate explanation for this combination." | 4.8 |
| Fixed phrases, role in the sentence | None (from the code: `detectPhrases` is empty, there is no syntax) | 6 |
| Dictionary meaning | None: no `public/dict/arc`, no `public/lexicon/arc`; the probe's dictionary line is empty for every word | 6 |
| "All forms" | None: the adapter has no paradigm function and there is no dictionary record to merge (from the code; I did not open the panel) | 6 |
| Period / variants | Not shown for `arc` | |
| Review warning | Stored for 12 occurrences, never passed to the card's notes | 4.4 |

## 4. Findings on the card

Every row was seen in `coverall.tsv` or in a battery output. "The card shows" is the first reading in the word's own verse
unless a row says otherwise.

### 4.1 The meaning line

**(a) Tense, mood, stem and voice are ignored** (the generic routine reads only person and number).

| Verse | Word | The card shows | Correct |
|---|---|---|---|
| Dan 2:4 | חֱיִי, אֱמַר (imperatives) | "You live", "You say" | "live!", "tell!" All 35 imperatives are shown as statements. The orientation's own glosses are "live!", "say!" |
| Dan 2:4 | נְחַוֵּא | "We show" | "we will declare" (the orientation: "we will declare") |
| Dan 2:7 | עֲנוֹ (perfect) | "They answer" | "they answered". 387 of 394 perfects are shown as an English present |
| Dan 2:20 | מְבָרַךְ | "kneeling" (lemma: kneel) | "blessed" (pael passive participle of "bless") |
| Dan 2:19, 4:31 | בָּרִךְ, בָּרְכֵת | "He kneels", "I kneel" | "he blessed", "I blessed". 4 of the 5 tokens of this verb mean "bless" |
| Dan 2:24 | אַל ... תְּהוֹבֵד | "You perish" | "do not destroy" (haphel) |
| Dan 2:12 | לְהוֹבָדָה | "to perish" | "to destroy" |
| Dan 2:5, 2:9 | תְהוֹדְעוּנַּנִי | "You (plural) know" | "you make known to me" |
| Dan 2:15, 2:28 | הוֹדַע | "He knows" | "he made known". Every haphel of *know* (the commonest causative) is "know" |
| Dan 2:25 | הַנְעֵל | "He enters" | "he brought in" |
| Dan 2:21 | מְהָקֵים, מְהַעְדֵּה | "arising", "passing on" | "setting up", "removing" (kings) |
| Dan 2:44 | יְקִים | "He arises" | "he will set up" |
| Dan 3:1 | אֲקִימֵהּ | "He arises" | "he set it up" |
| Dan 3:22 | הַסִּקוּ | "They come up" | "they brought up" |
| Dan 3:13 | הֵיתָיוּ (hophal) | "They come" | "they were brought" |
| Dan 7:13 | הַקְרְבוּהִי | "They approach" | "they brought him near" |
| Ezra 4:10 | הַגְלִי | "He reveals" | "he deported" |
| Dan 2:48 | רַבִּי | "He grows great" | "he made great, promoted" |
| Dan 2:24, 2:49 | מַנִּי | "He counts" | "he appointed" |
| Ezra 5:2 | שָׁרִיו | "They free" | "they began" |
| Dan 2:19, 2:30 | גֲלִי (peil) | "He reveals" | "it was revealed" |
| Dan 2:34 | הִתְגְּזֶרֶת | "She quarries" | "(a stone) was cut out" |
| Dan 2:35 | הִשְׁתְּכַח | "He discovers" | "was found" |
| Dan 2:5 | תִּתְעַבְדוּן, יִתְּשָׂמוּן | "You (plural) do", "They set" | "you will be made (limbs)", "will be made (a dunghill)" |
| Dan 2:13 | מִתְקַטְּלִין, לְהִתְקְטָלָה | "killing", "to kill" | "being killed", "to be killed" |
| Dan 2:44 | תִתְחַבַּל, תִשְׁתְּבִק | "She ruins", "She quits" | "will (never) be destroyed", "will (not) be left" |
| Dan 5:25 | רְשִׁים | "He inscribes" | "was inscribed" |
| Dan 5:26 | מְנָה | "He counts" | "(God) has numbered" |
| Dan 5:27 | תְּקִילְתָּה, הִשְׁתְּכַחַתְּ | "You weigh", "You discover" | "you have been weighed", "you have been found" |
| Dan 5:28 | פְּרִיסַת, יְהִיבַת | "She breaks in two", "She gives" | "(your kingdom) has been divided", "has been given" |
| Dan 5:20, 4:33, 7:4 | הָנְחַת, הוּסְפַת, הֳקִימַת (hophal) | "He descends", "She adds", "She arises" | "he was deposed", "was added", "was raised up" |
| Dan 2:9, 2:31, 2:41, 2:42, 2:45, 3:23 | שְׁחִיתָה, דְּחִיל, פְלִיגָה, תְבִירָה, מְהֵימַן, מְכַפְּתִין | "corrupting", "slinking", "dividing", "being fragile", "trusting", "fettering" | "corrupt", "terrible", "divided", "brittle", "trustworthy", "bound". All 44 passive participles are shown as "-ing" |
| Dan 2:13 | נֶפְקַת | "She issues" | "(the decree) went out". 78 finite verbs start with "She" for a thing |
| Dan 2:20 and 70 more | לֶהֱוֵא, הֲוָה, הֲווֹ | "He exists", "They exist" | "let it be", "was", "were" |
| Dan 7:13 | חָזֵה הֲוֵית | "gazing upon" + "I exist" | "I was watching" |
| Dan 2:14, 3:16, Ezra 5:5, 5:11 | הֲתִיב, לַהֲתָבוּתָךְ, יְתִיבוּן, הֲתִיבוּנָא | "specifically (transitive and ellip.) to reply" | "he answered", "to answer you", "they would send back", "they answered us" |
| Dan 2:13, 2:16, 2:23 | בְעוֹ, בְעָה, בְעֵינָא | "They seek or ask", "He seeks or ask", "We seek or ask" | one verb, one sense, agreement |
| Dan 2:34, 2:40 | הַדֵּקֶת, מְהַדֵּק | "She crumbles or crush", "crumbling or crush" | "it crushed", "crushing" |
| Ezra 4:13, 4:15 | תְּהַנְזִק, מְהַנְזְקַת | "He suffers (causatively", "suffering (causatively" | "it will damage", "damaging" |
| Ezra 5:1 | הִתְנַבִּי | "He sees" | "prophesied" |
| Dan 3:28 | הִתְרְחִצוּ | "They attend upon" | "they trusted" |
| Dan 2:27 | גָּזְרִין | "quarrying" | "soothsayers" |
| Dan 2:8 | זָבְנִין | "acquiring by purchase" | "buying (time)" |
| Dan 3:15, 3:17, 3:28 | יְשֵׁיזְבִנְכוֹן, יְשֵׁיזִב, שֵׁיזִב | "He leaves" | "will deliver you", "he will deliver", "he delivered" |

Machine counts over all 1,068 verb tokens: 387 perfects shown as present, 35 imperatives as statements, 44 passive
participles as active, 156 of 162 tokens in the passive and reflexive stems shown as active, at least 110 of 194 causative
tokens shown with the simple meaning. Union: 610 tokens. The 244 imperfects shown as a plain present are extra.

**(b) The determined state keeps the indefinite gloss.** מַלְכָּא: "a king"; חֶלְמָא: "a dream"; פִשְׁרָא: "an
interpretation"; סָפְרָא: "a scribe (secular or sacred)". 372 tokens, 57 words. The plural keeps the singular gloss:
אֱלָהַיָּא (Jer 10:11, "the gods"): "God"; יוֹמַיָּא: "a day".

**(c) The gloss is Strong's prose, not a meaning.** 1,331 tokens (158 words) show a meaning with "i.e.", "properly",
brackets or semicolons; 682 tokens show one longer than 45 characters. Examples as printed: דִּי (345 tokens): "that, used
as relative conjunction, and especially (with a preposition) in adverbial phrases; also as preposition of"; אִיתַי:
"properly, entity; used only as a particle of affirmation, there is"; עָלְמִין: "remote time, i.e. the future or past
indefinitely; often adverb, forever"; טְעֵם: "properly, flavor; figuratively, judgment (both subjective and objective);
hence, account (both subjectively and objectively)"; חַד: "as card. one; as article single; as an ordinal, first;
adverbially, at once"; גֶּשֶׁם: "used in a peculiar sense, the body (probably for the (figuratively) idea of a hard rain)";
רָז: "to attenuate, i.e. (figuratively) hide; a mystery"; מְאָה: "a hundred; also as a multiplicative and a fraction}"
(with the stray brace). The wrong and the misleading meanings are listed in 5.2.

### 4.2 The form line and the word parts

| Verse | Word | The card shows | Correct |
|---|---|---|---|
| Dan 2:4 and 847 more | מַלְכָּא | "masculine singular, determined (emphatic), with the article" | Aramaic has no article. The determined (emphatic) state in -ā **is** its "the". "with the article" is the Hebrew describer's phrase for `Definite=Def` |
| every perfect and imperfect | | "perfect (qatal)", "imperfect (yiqtol)" | *qatal* and *yiqtol* are the Hebrew patterns; the Aramaic forms are *qətal* and *yiqtul* |
| Dan 2:20 | שְׁמֵהּ | "masculine singular, construct"; parts: "הּ: possessive suffix" | "his name": third person masculine singular suffix. The person, gender and number of the suffix are in the data and are not printed. Same for לְעַבְדָךְ ("ךְ: possessive suffix"), וּבָתֵּיכוֹן, מִנִּי ("י: object of the preposition"), הַקְרְבוּהִי ("הִי: object suffix"): 566 tokens |
| Dan 2:20 | שְׁמֵהּ דִּי־אֱלָהָא | "construct" for a noun with a suffix | a noun with a suffix is not in the construct state before a following noun; the phrase is the anticipatory genitive "his name, of God". Nothing says so |
| Dan 2:6, 2:31, 2:43, 3:25, 7:13 | וְהֵן, וַאֲלוּ, הֵא, הָא, וַאֲרוּ | form line "Dem" | a raw tag. 13 tokens. *hen* in 2:6 is "if" (4.3) |
| Dan 5:25 | מְנֵא, תְּקֵל, וּפַרְסִין | "NOUN, absolute" (no gender, no number) | *parsin* is a plural (or dual); the card does not say so |
| Gen 31:47 | יְגַר שָׂהֲדוּתָא | two proper nouns, form line empty; meanings "heap", "testimony" | *yegar*: noun, construct, "heap of"; *sahaduta*: feminine noun, determined, "the testimony". The one place where a learner would want the ending explained shows nothing |
| Ezra 4:10 and 13 more | נַהֲרָה | PROPN; parts "determined (emphatic) state ending" | "the River" (common noun, determined). עֲבַר beside it is PROPN with the meaning "region across" |
| Dan 5:28 | לְמָדַי, וּפָרָס | "gentilic, masculine singular, determined (emphatic)" | names of peoples or lands; no determined ending is present |
| Dan 2:8 and 21 more | כָּל (in כָּל־קֳבֵל) | CONJ; parts "כָּ: from כְּ, like, as ; ל: from כֹּל, stem"; meaning "the whole" | half an analysis: either the word is *kol* "all" (as written) or the phrase is *k-* + *l-* + *qobel*. A prefix "like" on a stem "the whole" that consists of one letter is neither |
| Dan 3:29 | וּמִנִּי | PRON "personal, 1st person common gender singular", meaning "from"; parts "מִ: from מִן, from ; נִּי: from מִן, stem" | "and from me": preposition + suffix (so shown in Dan 4:3 and Ezra 4:19). The source writes the lemma chain of 3:29 with one prefix too many and the decoder takes the suffix for the main word |
| Dan 2:12, 2:14, 2:19 | לְכֹל, לְחַכִּימֵי, לֶאֱלָהּ | parts "לְ: object marker" | right, and useful; it is named and never explained |
| Dan 2:25, 3:28, 5:29, Ezra 4:14 and 7 more | לְדָנִיֵּאל, לְעַבְדוֹהִי, לְמַלְכָּא | parts "לְ: to, for" | the source tags these as the object marker ("he brought Daniel in"). 11 of the 36 object-marker tokens show "to, for" in their own verse |
| Ezra 6:9, 6:10, 7:15, Dan 3:30, 5:7 and 2 more | לֶאֱלָהּ, לְשַׁדְרַךְ, לְחַכִּימֵי | parts "לְ: object marker" | the source tags these as the preposition ("to the God of heaven"). Cause, from the code: two readings that differ only in the tag of the prefix are merged into one and the parts of the first are kept |
| Dan 3:12 | יָתְהוֹן | PART, "object marker"; parts "הוֹן: possessive suffix" | "them": object suffix, not possessive |
| Ezra 5:2 | לְהוֹן | PART "object marker"; parts "הוֹן: possessive suffix" | object suffix |
| Dan 3:3 | לַחֲנֻכַּת | (source tags the *l-* as a conjunction) | preposition; the card's part line still says "to, for" |

The split of attached particles is good wherever the source cuts: וּפִשְׁרָא, לְעָלְמִין, מֵאַרְעָא ("מֵ: from מִן"),
וּבְיוֹמֵיהוֹן, כְּפַרְזְלָא. The determined ending is named on every noun that has it (860 pieces).

### 4.3 Wrong reading shown as confirmed (hand count in the 2,013 words read in full)

All at confidence 0.98 with the basis "Exact annotated source passage". F marks the four the project had flagged.

| Verse | Word | The card shows | Correct |
|---|---|---|---|
| Dan 2:5 | לְכַשְׂדָּאֵי | "gentilic, masculine plural, absolute" + "י: possessive suffix" | plural determined, "to the Chaldeans"; there is no suffix |
| Dan 2:10 | כַשְׂדָּאֵי | "gentilic, masculine plural, construct" + possessive suffix | the same word (Dan 4:4 has it "singular construct" + suffix, 5:7 "plural construct" + suffix: three different wrong tags) |
| Dan 2:6 | וְהֵן | PART "Dem" | conjunction "if" (so tagged in 3:15, 3:18) |
| Dan 2:7 | תִנְיָנוּת | ADJ "ordinal, masculine or feminine plural, absolute" | adverb, "a second time" |
| Dan 2:7 | וּפִשְׁרָה | "construct" + "ה: possessive suffix" | determined state written with ה, "the interpretation" (so tagged in 5:12) |
| Dan 2:9 | הִזְדְּמִנְתּוּן | "Hitpaʿal, perfect, 3rd person masculine plural" | 2nd person masculine plural, "you have agreed" |
| Dan 2:13 | לְהִתְקְטָלָה | "Hitpaʿal, infinitive construct" | Hitpeel |
| Dan 2:24 | אֲזַל, אֲמַר | "Peʿal, participle" (both) | perfect, 3rd masculine singular: "he went and said". The participles are pointed otherwise |
| Dan 2:26 | חֲזֵית | SCONJ "relative", meaning "to gaze upon ..." | verb, peal perfect 1st singular, "I saw" |
| Dan 2:31 | חָזֵה | "Hafʿel, participle" | Peal participle (so tagged in its 14 other places) |
| Dan 2:32 | חֲדוֹהִי | "masculine singular, construct" | plural stem ("its breast": the suffix -ohi stands on plural nouns) |
| Dan 2:39 F | אֲרַע | "feminine singular, determined (emphatic)" | no determined ending in this (qere) form; here "lower, inferior" |
| Dan 2:40 | מְרָעַע | "Peʿal, participle" | Pael participle |
| Dan 2:43 | מִתְעָרְבִין | "Hitpaʿal, passive participle" (the next token of the same verb: "Hitpaʿal, participle") | one participle; the two labels are an inconsistency of the source (it recurs: Ezra 4:19 מִתְעֲבֶד, 4:20 מִתְיְהֵב) |
| Dan 2:44 | מַלְכְוָתָא | "feminine singular, determined" | plural, "(all these) kingdoms" (so tagged in 7:23) |
| Dan 3:1 F (twice) | אַמִּין | "feminine singular, absolute" | plural, "cubits" |
| Dan 3:2, 3:3 | מְדִינָתָא | "feminine singular, determined" | plural, "the provinces" (the singular is מְדִינְתָּא, Ezra 5:8) |
| Dan 3:14 | לֵאלָהַי | "masculine singular, construct" | plural + my, "my gods" |
| Dan 3:17 | יָכִל | "Peʿal, imperfect, 3rd masculine singular" | participle (so tagged in 4:34) |
| Dan 3:17 | יְדָךְ | "feminine plural, construct" | singular, "your hand" |
| Dan 3:24 | מְכַפְּתִין | "Paʿel, participle" (active) | passive participle, "bound" (so tagged one verse earlier) |
| Dan 3:29 | וּמִנִּי | PRON | preposition + suffix (4.2) |
| Ezra 4:10 | בְּקִרְיָה | "feminine plural, absolute" | singular form (check: some read a collective) |
| Ezra 4:13 | תְּהַנְזִק | "3rd person masculine singular" | 3rd feminine singular (the city); a form with t- cannot be 3rd masculine |
| Ezra 4:15 | עָבְדִין | "participle, masculine singular" | plural |
| Ezra 4:22 | לְהַנְזָקַת | NOUN "feminine singular, construct" | haphel infinitive (check: it is a verbal noun in form) |
| Ezra 5:3 | וּכְנָוָתְהוֹן | "masculine singular, construct" | plural, "their colleagues" (so tagged in 4:9) |
| Ezra 5:9 F | דְנָה | "demonstrative, masculine plural" | singular |
| Ezra 5:15 | אֵל | NOUN "masculine singular, absolute", meaning "these" | demonstrative pronoun, plural |

Not counted above, same sample: the pronoun used as copula is "PART, affirmative particle" in Dan 2:20, 2:28, 2:38, 2:47,
3:15 and Ezra 5:4, 5:11 (correct: personal pronoun, "is / are"); wrong suffix tags that the card hides because it prints no
suffix person (Dan 2:41 and 3:6 בַהּ tagged masculine for a feminine; Ezra 4:17 כְּנָוָתְהוֹן tagged singular).

### 4.4 Wrong readings in the rest of the corpus (found by the mechanical checks and look-ups; not a full reading)

| Verse | Word | The card shows | Correct |
|---|---|---|---|
| Dan 4:9 | יְדוּרָן | "3rd person masculine plural" | feminine plural (the form in -ān) |
| Dan 4:14 F | יִצְבֵּא | perfect | imperfect |
| Dan 4:20 | עִדָּנִין | NUM "cardinal number, masculine or feminine singular" | noun, masculine plural, "times" (the tag of the numeral before it was repeated) |
| Dan 4:21 F | מַלְכָּא | "construct" + possessive suffix | determined, "(my lord) the king" |
| Dan 4:23 | דִּי | ADJ "feminine singular, absolute" | conjunction |
| Dan 4:31 F | עַיְנַי | "feminine singular, construct" | plural + my, "my eyes" |
| Dan 5:8 | וּפִשְׁרֵהּ | "determined (emphatic)" + possessive suffix | construct + his |
| Dan 5:12 | וּמְשָׁרֵא | "participle, masculine plural, construct" | singular |
| Dan 5:12 | וַאַחֲוָיַת | lemma אַחֲוָה, VERB, meaning "solution (of riddles)" | infinitive of the verb "declare" (lemma חוה); a verb with a noun's gloss |
| Dan 5:18 F | יְהַב | imperfect | perfect, "gave" |
| Dan 5:19 | זָיְעִין | "participle, masculine singular" | plural |
| Dan 5:27 F | תְּקִילְתָּה | "Peʿil, imperfect, 2nd masculine singular" | Peil perfect |
| Dan 6:4 | וַאֲחַשְׁדַּרְפְּנַיָּא | "masculine singular, determined" | plural, "the satraps" |
| Dan 6:11 | בְיוֹמָא | "masculine plural, determined" | singular, "(three times) a day" |
| Dan 6:13 | וְאָמְרִין | "participle, masculine singular" | plural |
| Dan 7:7 F | קָדָמַיהּ | NOUN "feminine singular, determined" | preposition + her, "before it" |
| Dan 7:8 | אֶתְעֲקַרָה | "3rd person masculine plural" | feminine plural |
| Dan 7:16 | חַד | "ordinal" | cardinal, "one (of them)" |
| Dan 7:17 | אַרְבְּעָה | ADJ | cardinal number |
| Dan 7:19 F | כָּלְּהֵין | suffix tagged singular; Hebrew dictionary entry | "all of them" (feminine plural suffix) |
| Dan 7:22 | עַתִּיק יוֹמַיָּא | two proper nouns (in 7:9 and 7:13 adjective + noun) | one or the other throughout |
| Dan 7:23 | כָּל | VERB "Peʿal, imperfect, 3rd feminine singular", meaning "the whole" | "all" |
| Dan 7:23 | כֵּן | ADJ "masculine plural, absolute" | adverb, "thus" |
| Ezra 6:9 | בְּיוֹם | PROPN | common noun, "(day) by day" |
| Ezra 6:11 | וּמִנִּי | NOUN "masculine plural, construct" + possessive suffix | "and from me" |
| Ezra 6:14 | נְבִיָּא | "masculine plural, determined" | singular, "(Haggai) the prophet" |
| Ezra 7:18 F | עֲלָךְ | Hebrew dictionary entry | the Aramaic preposition |

**The project's 12 flagged occurrences show no warning.** `arc.ts` stores `reviewStatus: 'requires-review'` in the
candidate's notes; the card parser copies only the notes `rule`, `context` and `disputed`. Seen: Dan 5:27 תְּקִילְתָּה
shows "Variety: arc-bib." and nothing else, at 0.98. COVERAGE.md says a flagged reading "in its own verse ... is chosen and
flagged": chosen, yes; flagged on the card, no.

**A wrong tag spreads to other tokens when the verse is not recognised**, because readings are listed in the order of
first occurrence. Seen: חָזֵה alone, or in "חָזֵה הֲוֵית" without the rest of the verse: "Hafʿel, participle" (first tag,
from Dan 2:31), for all 15 tokens. אֲמַר alone: the tag of Dan 2:24 comes before the perfect, so 10 perfects read
"participle"; typed without points it is "imperative ... You say". חֲזֵית: "relative" (3 tokens). כָּל alone: the
conjunction with the one-letter stem (22 tokens of plain "all"). דְּנָה alone: CONJ (25 tokens of "this").

### 4.5 Lemmas a learner cannot use

| Word on the page | Lemma on the card | Correct |
|---|---|---|
| הֲוָה, הֲוָא, לֶהֱוֵא ... (71 tokens) | הָוָא, "to exist; used in a great variety of applications ..." | הֲוָה, "to be". The lemma's first vowel is Strong's; no such form exists in the corpus |
| דְּנָה (58 tokens) | דֵּן | דְּנָה. *den* does not occur in Biblical Aramaic |
| אֲתָא, אֲתוֹ ... (16) | אָתָה | אֲתָה. The card's lemma is spelled like Hebrew "you" |
| לְמִכְנַשׁ, מִתְכַּנְּשִׁין (3) | כָּנַשׁ | כְּנַשׁ |
| מַלְכְּתָא "the queen" (2) | מַלְכָּא, "a queen" | מַלְכָּה. The lemma is letter for letter the form "the king" |
| לְעַבְדָךְ, עַבְדוֹהִי (7) | עֲבַד (NOUN), beside עֲבַד (VERB, "to do") | עֲבֵד |
| בְּנֵי, בְּנוֹהִי (11) | בֵּן "son" | plural of בַּר; *ben* is Hebrew. The singular בַּר (8 tokens) is a second lemma, so "son" is two words |
| יְהָךְ, לִמְהָךְ (4) | הוּךְ "to go; causatively, to bring" | imperfect and infinitive of הֲלַךְ (3 more tokens under that lemma) |
| הַסִּקוּ, לְהַנְסָקָה ... (3) | נְסַק "come up" | haphel of סְלִק (5 more tokens under that lemma) |
| שֵׁיזִב ... (9) | שְׁזַב "to leave, i.e. (causatively) free" | שֵׁיזִב "deliver" |
| שַׁכְלִילוּ, לְשַׁכְלָלָה (5) / יִשְׁתַּכְלְלוּן (2) | כְּלַל / שַׁכְלֵל | one verb |
| טְעֵם (24) / טַעְמָא (5) | טְעֵם / טַעַם | one noun |
| אֲנָה (3 of its 14 tokens) | אֲנָא (the other 11: אֲנָה) | one pronoun |
| וַעֲבֵד / נְגוֹ | "עֲבֵד נְגוֹ" for the first half, "עֲבֵד נְגוֹא" for the second | one name, one lemma |
| אַזְדָּא (2) | אֲזָד | אַזְדָּא (check) |
| הַדָּבְרוֹהִי, הַדָּבְרֵי (4) | הַדָּבָר (looks like Hebrew "the word") | הַדָּבַר (check) |
| וַאַחֲוָיַת | אַחֲוָה | חוה |

Several headwords carry a stray meteg (דָּֽרְיָוֵשׁ, אֲפָֽרְסְכָיֵא, שָֽׂהֲדוּ) and Strong's qamats-qatan sign (אׇחֳרִי, חׇכְמָה).

**Vocabulary identity (from the code, with the data).** The card credits a word as `lemma:arc:<headword>:<part of speech>`.
That gives 744 items for 714 dictionary entries. 32 words are split over several items: *di* is five (SCONJ 286, CONJ 44,
PRON 7, PART 7, ADJ 1), *kol* three, *min* four, *hu* two, *denah* two, *had* three. 9 pairs collapse into one item, three
of them different words: בַּר "son" and בַּר "field"; שְׁנָה "year" and שְׁנָה "sleep"; סְתַר "hide" and סְתַר "destroy".

### 4.6 "Other readings"

- 1,157 of the 4,828 words, read inside their own annotated verse, carry the note "N other (form) reading(s) possible
  even with the sentence; the one shown has the highest confidence."
- The list shows lemma, part of speech and gloss only. מַלְכָּא: "also: מֶלֶךְ / NOUN / a king" (it is the flagged tag of
  Dan 4:21, "construct + my"). דִּי: "7 other readings possible", three listed, each "דִּי / CONJ or PRON / that, used as
  relative conjunction ...". The learner sees the same line three times.

### 4.7 Hebrew beside Aramaic, and how the language is decided

- **How it is decided (from the code, `resolve.ts`).** A page in Hebrew script goes to the Hebrew pack unless the Aramaic
  pack is installed and its list recognises at least 60 % of the sample and 25 points more than the Hebrew list. The
  learner's own enrolment in `arc` sends every selection to the Aramaic card. Inside the Aramaic card nothing decides
  language: a word is either in the table or blank.
- **A Hebrew word is blank or is read as Aramaic with no warning.**

| Text given to the Aramaic card | The card shows | Correct |
|---|---|---|
| Dan 2:4 whole (MAM) | the four Hebrew words blank ("unknown to this pack"); the eight Aramaic words at 0.92, not 0.98 | the verse every Bible prints is not the pack's "Dan 2:4b"; its own validation sentence is the half verse |
| Gen 31:47 whole | seven Hebrew words blank; the two Aramaic words 0.92 | |
| Ezra 4:7 (Hebrew) | וּשְׁאָר, עַל, אַרְתַּחְשַׁשְׂתְּא, מֶלֶךְ, פָּרָס read as Aramaic at 0.92; the rest blank | the verse is Hebrew; no note says so |
| Jer 10:10 (Hebrew) | הוּא and וּמֶלֶךְ read as Aramaic, 0.92 | |
| Dan 1:1-2 (Hebrew) | בִּשְׁנַת, לְמַלְכוּת, מֶלֶךְ (three times), בָּבֶל, בֵית, בֵּית as Aramaic, 0.92 | |
| Gen 1:1 | בָּרָא: *bar*, NOUN, "masculine singular, determined (emphatic), with the article", "a field", 0.92 | Hebrew "created" |
| Ezra 6:19-20 (Hebrew) | בְנֵי: lemma בֵּן "son", Aramaic | Hebrew |

- **The Hebrew card on an Aramaic verse** (Dan 2:20, in the test harness; the Hebrew pack is another auditor's): it says
  "Biblical Hebrew (the text carries cantillation marks)", reads עָנֵה as a guessed Hebrew Qal perfect, שְׁמֵהּ as the adverb
  שָׁם, and gives a transliteration ("leheve", "ḥakhemeta", "ugevureta"). So the same verse has a pronunciation line under
  a Hebrew enrolment and none under an Aramaic one.
- **Words spelled alike in the two languages**: the Aramaic card gives the Aramaic entry and never mentions Hebrew.
  עבד typed alone: "He does (to do, make, prepare, keep, etc.)", also the noun "a servant": right for Aramaic, no word
  that Hebrew means "serve". בר: "a son, grandson, etc.". שלם: "prosperity" (5.2). יום, כל, לא, הוא: Aramaic entries. אתה typed alone: "coming" (the Aramaic participle); the Hebrew pronoun is not mentioned.

### 4.8 Grammar notes

None fires, on any word: the adapter's `detectPatterns` returns an empty list (from the code; 0 pattern notes in 4,828
cards). The pack lists two "constructions" (`noun-state`, `attached-parts`); nothing links them to a card. What every
inflected word does carry is a generated note whose title is the form line and whose text is "The form shows these
features; the pack has no separate explanation for this combination."

So there is no note for: the determined state as "the"; the three genitives (construct chain; *di*; suffix + *di*, as in
שְׁמֵהּ דִּי־אֱלָהָא); *di* as relative, as "that", as "because", and in כְּדִי, מִן־דִּי, עַד דִּי, כָּל־קֳבֵל דִּי, דִּי־לָא; the
participle as a tense (עָנֵה ... וְאָמַר, on the first line of the orientation's own passage); the participle with הֲוָה
(חָזֵה הֲוֵית); the passive participle with *l-* of the agent; the object marked by *l-*; אִיתַי with a suffix; the
jussive and אַל; the imperfect of הֲוָה with *l-* (לֶהֱוֵא: the card says "imperfect, 3rd masculine singular" and does not
say why the word begins with ל).

### 4.9 Transliteration and pronunciation

There is none. `pronunciation: () => ({ notes: [] })`; the pack declares `pronunciationNotes: false` and no voices; the
transliteration column is empty for all 4,828 words. The orientation gives the names of the 22 letters and the five final
shapes and says the names "are not a recording of historical pronunciation": it gives no sound for any letter, names no
vowel point, and says nothing of dagesh, of the soft and hard pronunciation of ב ג ד כ פ ת, of shva, of the two readings
of qamats, of the ending -ā written א or ה, or of the vowel letters. A learner who has not learned to read pointed Hebrew
elsewhere cannot read one word aloud. (The Hebrew adapter in the same repository has an SBL-style romaniser; it is not
used here.)

### 4.10 Outside the exact verse

| Condition | Result |
|---|---|
| Word alone | 291 of 4,828 first readings differ from the source (4.4 gives the systematic ones); none blank |
| Half verse | 287 of 4,705 differ: the verse must match word for word or nothing of it is used |
| Unpointed | 489 differ, 105 with another word. Typed מן: "from"; the interrogative "who" is among the alternatives. Typed כל: CONJ |
| Second edition (MAM) | 94 of 269 verses not recognised (a single different vowel or spelling anywhere in the verse is enough; the two editions differ in 92 verses). Blank Aramaic words, 52, among them מִלְּתָה (Dan 2:5), חַרְטֹם (2:10), יִנְתִּן (2:16), גְלִי (2:19), סוּמְפֹּנְיָא (3:5), תְּקִילְתָּ (5:27), שֵׁיזִב (6:28), נְבִיַּאיָּא (Ezra 5:1, 5:2), עַבְדָךְ (Ezra 4:11) |
| Ketiv forms | 86 of 120 blank (לעבדיך, כשדיא, קיתרוס, אנושא, מראי, נביאה ...). אלה (the ketiv of "these", Ezra 5:15) is read as "God" |
| A known word with another prefix | blank. Typed בעלמא ("in the world", Kaddish): blank, though עָלְמָא is in the table. Nothing strips a prefix |

### 4.11 Aramaic outside the Bible (typed without points)

| Text | The card shows | Correct |
|---|---|---|
| בקדמין ברא יי ית שמיא וית ארעא (Onkelos, Gen 1:1) | בקדמין blank; ברא "a field", determined; ית and וית blank; שמיא, ארעא right | "In the beginning the Lord created the heavens and the earth". The object marker *yat* is known to the pack only as יָתְהוֹן |
| טליתא קומי (Mark 5:41) | טליתא blank; קומי "imperative, 2nd feminine singular ... You arise" | "little girl, arise" |
| מרנא תא; אבא; אתפתח | blank | "our Lord, come"; "father" (the commonest Aramaic word in the New Testament is not in the pack); "be opened" |
| אלהי אלהי למה שבקתני | אלהי "God, masculine singular, construct"; למה "interrogative particle, what?"; שבקתני blank | "my God ... why have you forsaken me" |
| יתגדל ויתקדש שמה רבא בעלמא די ברא כרעותה | יתגדל, ויתקדש, בעלמא, כרעותה blank; ברא "a field" | |
| ܡܠܟܐ (Syriac script); malka (Latin) | "This selection is not in Hebrew script: the Biblical Aramaic word list does not apply to it." | the right answer |

The pack says plainly that it covers Biblical Aramaic only, and the blank card is honest. The fault is the confident wrong
reading of a homograph (ברא) and the missing prefix handling.

## 5. Wrong rows in the data

There are no generated tables. The rows that are wrong are dictionary entries and source annotations.

### 5.1 Headwords

Listed in 4.5. In addition: בֵּן (Hebrew) for the plural of בַּר; יְרוּשָׁלֵם for a name the Aramaic text always writes
יְרוּשְׁלֶם; three lemmas for the Mene line that hide its point: פְּרֵס "half-mina", פְּרַס "break in two", פָּרַס "Persia",
and מְנֵא "numbered" (a NOUN) beside תְּקֵל "shekel": if *tekel* is the weight, *mene* is the mina.

### 5.2 Meanings (the card's meaning line, from Strong)

Wrong:

| Word (tokens) | The card shows | Correct |
|---|---|---|
| בְּרַךְ (5) | kneel | bless (4 of 5 tokens); kneel (Dan 6:11) |
| נְבָא (1) | see | prophesy |
| עֵז, in עִזִּין (1) | she | she-goat |
| רְחַץ (1) | to attend upon | to trust |
| תְּלָתִין (2) | ten times three | thirty |
| דֵּךְ, דָּךְ (13), דִּכֵּן (3) | this | that |
| שָׂבֵי, שָׂבַיָּא (5) | be hoary | elders |
| קַיִט (1) | harvest | summer |
| אַחֲרִית (1) | later | end, latter part |
| גֶּשֶׁם (5) | "used in a peculiar sense, the body (probably for ... a hard rain)" | body |
| שְׁלָם (4) | prosperity | peace, welfare (the greeting) |
| מַלְכוּ (57) | dominion (abstractly or concretely) | kingdom; reign |
| צֶלֶם (17) | an idolatrous figure | image, statue (also "expression" of the face, Dan 3:19) |
| צְבָא (10) | to please | to wish, will |
| תּוּב (8) | "specifically (transitive and ellip.) to reply" | return; (haphel) give back, answer |
| זִיו (6) | (figuratively) cheerfulness | brightness; colour of the face |
| לִשָּׁן (7) | speech, i.e. a nation | tongue, language |
| עַתִּיק (3) | venerable | ancient ("Ancient of Days") |
| חַכִּים (14) | wise, i.e. a Magian | wise man |
| רָז (9) | to attenuate, i.e. (figuratively) hide; a mystery | mystery, secret |
| אֵימְתָנִי (1) | well-loined (i.e. burly) or mighty | terrible (check) |
| אֲרִיךְ (1), עֲצִיב (1), זְהִירִין (1), שְׁלֵה (1) | adjectives with a verb's gloss: "to suit", "to afflict", "(passively) be admonished", "to be secure" | fitting; pained; careful; at ease |
| קְרַץ (2) | "chew him up (figuratively) by slander" | a piece (in "eat the pieces of" = accuse) |
| אַפְּתֹם (1) | "revenue; others at the last" | uncertain; the gloss is two opinions run together |
| הֵא (1) | behold like | behold; (with כְדִי) just as |
| אֱלָהּ in the plural | God | gods |

Old-fashioned or obscure English that a learner will not understand: "thou", "ye", "a lifeguardsman" (טַבָּח), "an emir"
(סָרֵךְ), "a mulct" (עֲנָשׁ), "a holocaust" (עֲלָה), "an onager" (עֲרָד), "a clod" (חֲסַף), "a sink" (נְוָלוּ), "excise (on
articles consumed)" (בְּלוֹ), "Danijel", "Meshak", "Azarjah", "a Jehudaite (or Judaite), i.e. Jew", "Nᵉthinîn".

No entry says that a word is a loan (Persian: דָּת, רָז, פִּתְגָם, נִשְׁתְּוָן, אָסְפַּרְנָא, אֲחַשְׁדַּרְפַּן, גְּדָבַר, דְּתָבַר;
Akkadian: סְגַן, פֶּחָה, אִגְּרָה, שֵׁיזִב; Greek: קַתְרוֹס, פְּסַנְתֵּרִין, סוּמְפֹּנְיָה).

### 5.3 Source annotations

The wrong ones I found are in 4.3 (29 sure in 2,013 words read) and 4.4 (27 more, found mechanically in the other 2,815
words, which were not read). The project's own list has 12. Inconsistent tagging that is not wrong in itself but shows on
the card: *di* as SCONJ 286 times and CONJ 44 times in the same uses; the Peal passive participle as "Peʿal" 5 times and
"Peʿil" 20 times (יְדִיעַ is "Peʿal" in Dan 3:18 and "Peʿil" in Ezra 4:12); causatives without ה as "Hafʿel" (תַּדִּק,
תָסֵיף) and one with ה as "Afʿel" (מַהְלְכִין); demonstratives as masculine, common or "masculine or feminine" by turns;
אַנְפּוֹהִי plural in Dan 2:46 and dual in 3:19.

## 6. Grammar not modelled at all

- **Any word form not attested** in these 269 verses: no paradigm, no generation, no prefix stripping, no suffix
  analysis by rule. A learner who meets בעלמא ("in the world", seen blank in battery 2) or any other form the 269 verses happen not to
  contain gets a blank card.
- **The sentence**: no syntax, no role, no agreement, no use of neighbours. The only context is "is this exactly verse
  N". The orientation's shared text says the opposite (7).
- **Disambiguation** of the 104 pointed forms with more than one reading outside the exact verse.
- **Meaning of a verb form**: tense, mood, stem, voice (4.1).
- **Suffix description**: person, gender, number; possessive against object.
- **All grammar notes** of 4.8, and fixed phrases (כָּל־קֳבֵל דִּי, מִן־דִּי, עֲנֵה וְאָמַר, שִׂים טְעֵם, אֲכַל קַרְצִין,
  בֵּאדַיִן, לְעָלְמִין חֱיִי).
- **Pronunciation and transliteration** (4.9).
- **"All forms"**: no table of a noun's three states and two numbers, no table of a verb. The attested forms of each
  lemma are in the data (`arcLexiconLookup` returns them) and are not shown.
- **A dictionary**: no entry beyond the one-line gloss; no root, no Hebrew cognate, no loan origin, no frequency (the
  counts exist in the data).
- **Qere and ketiv**: the pack reads the qere path only and cannot read the ketiv (4.10); no card says that a word is a
  qere.
- **Numbers**: the cardinals are tagged; nothing explains the reversed gender of 3 to 10; "ten times three".
- **Hebrew beside Aramaic**: no detection, no warning, no cognate note.
- **Other Aramaic**: by design.

## 7. Orientation and course texts

**Orientation (`tutorial/arc.ts` with the shared steps of `orientation.ts`).**

- Its glosses contradict the card it introduces: חֱיִי "live!" (card: "You live"), אֱמַר "say!" (card: "You say"),
  נְחַוֵּא "we will declare" (card: "We show"), מַלְכָּא "king" (card: "a king"), שְׁמֵהּ "his name" (card: "name" and
  "possessive suffix"). The orientation is right each time.
- The practice step: "Select the word for 'king' ... and look at its noun state." The card answers "masculine singular,
  determined (emphatic), with the article", meaning "a king", "1 other form reading possible even with the sentence".
- "The determined state is often marked by an ending in -ā, but the ending alone is not a complete guide to meaning."
  It never says the one thing a learner needs: the determined state is the Aramaic for "the". דִּי is glossed "that;
  which", without "of".
- Nothing for the reader who comes from Hebrew, who is every reader: no article against the ending -ā; דִּי for אֲשֶׁר and
  for the construct; the stem names beside the Hebrew ones (Peal / Qal, Pael / Piel, Haphel / Hiphil, the t-stems, no
  Niphal); the participle as the narrative tense; לָא, אִיתַי, the imperfect of "to be" with ל; the sound correspondences
  (דְּהַב / זָהָב, תְּלָת / שָׁלֹשׁ, אַרְעָא and אַרְקָא / אֶרֶץ, טוּר / צוּר); plural -īn for -īm; the suffixes -ēh, -hōn, -kōn, -nā.
- The script steps give letter names and no sounds (4.9).
- The stem names are spelled three ways: "Peal or Pael" (orientation), "Aphel", "Haphel", "Ithpeel", "Hithpeel" (pack
  labels), "Peʿal", "Afʿel", "Hafʿel", "Itpeʿel", "Hitpeʿel" (form line). The pack's label list has 7 stems; the corpus
  also has the Peil (62 tokens), Hitpaal (33), Shaphel (15), Hophal (12), Hishtaphal (2) and four rarer ones, which have no
  pack label (from the code).
- The shared steps say things that are false of this pack: "The Aramaic analyser reads the word inside its sentence, so
  the words next to it help it choose between readings" (it uses no neighbour); "Its word list was drafted by an AI
  model" (it is the OSHB annotation with Strong's dictionary); "its readings are measured only on short sentences
  written for the pack, not on real books or pages" (the opposite). The card's fixed "limits" lines say meanings come
  from a "Wiktionary-derived dictionary" and that "the word list and the rules are machine-drafted": also not this pack.

**Course texts.** There are none: no `data/ladder/arc`, `data/stage0/arc` or `data/gold/arc`. `src/course/aramaic.ts`
offers the 269 verses as a shelf and says it is not a learning sequence. The first text a learner can open is Daniel 2:4b.

**The project's own notes** (tested, not trusted):

| Claim | Finding |
|---|---|
| COVERAGE: 269 verses, 4,828 words, 714 lemma numbers, 744 lemma / part-of-speech identities | confirmed |
| COVERAGE: every occurrence has a gloss; all are ranked first in their exact verse | confirmed (0 without gloss; 4,828 at 0.98) |
| COVERAGE: 11 questioned annotations + 2 linked to a Hebrew entry | 12 occurrences flagged in the code (one is in both lists). I found 56 wrong annotations without reading 58 % of the corpus |
| COVERAGE: a flagged reading in its verse "is chosen and flagged" | not flagged on the card (4.4) |
| COVERAGE: "Ketiv readings are retained in the source snapshot" | true of the file; the card cannot read 86 of the 120 |
| INTEGRATION: "The 26 unglossed H3390 occurrences ... remain visible gaps" | stale: they have the gloss "Jerusalem" |
| INTEGRATION: the decoding "fixes demonstrative Tm without relabelling it as negative" | the card prints the raw value "Dem" |
| Pack: "it does not ... label Hebrew readings as Aramaic" | it labels Hebrew words as Aramaic whenever they spell an Aramaic form (4.7) |
| Pack `thin`: "Readings follow source morphology and have not been checked by a Biblical Aramaic specialist" | true, and the most important sentence in the pack |

## 8. What to fix first

1. **Stop printing a generated English verb.** Until a realiser knows Aramaic tense, stem and voice, show the lemma
   meaning only. Then write one: perfect as past, imperative as a command, the passive stems and passive participles
   as passives, and a causative meaning per verb for the haphel, aphel and shaphel (a hand list of about 60 verbs covers
   the corpus).
2. **Replace Strong's glosses and headwords** by a short hand-made list for the 714 entries (one or two modern words
   each), with the standard dictionary forms (הֲוָה, דְּנָה, אֲתָה, כְּנַשׁ, מַלְכָּה, עֲבֵד, שֵׁיזִב) and the suppletive
   words joined (בַּר with its plural, הֲלַךְ with יְהָךְ, סְלִק with הַסִּקוּ, שַׁכְלֵל, טְעֵם, אֲנָה, the two halves of
   Abed-nego). Give a determined noun "the ...".
3. **An Aramaic describer**: "determined (emphatic) state: 'the'" and never "with the article"; "perfect", "imperfect"
   without the Hebrew pattern names; print the suffix ("his", "your (plural)"; "him" on a verb); replace "Dem" and
   "affirmative particle" by words ("behold", "is / are"); one spelling of the stem names, the same in the orientation,
   the pack and the card.
4. **Show the review flag** on the card, and correct the annotations of 4.3 and 4.4 in an override file of the project's
   own (the source stays as it is, the card shows the corrected reading and says so).
5. **Order the readings of a form by frequency, not by first occurrence**, so that one wrong tag cannot become the
   reading of fifteen other tokens; and align by the best matching run of words, not by the whole verse only, so that a
   half verse, the full Daniel 2:4, or an edition with one different vowel still gets the verse's own reading.
6. **Read the ketiv** (the 120 forms are in the snapshot with their own tags) and the 52 spellings of the other edition;
   say on the card that a word is a qere.
7. **Hebrew in an Aramaic text**: when a sentence is mostly blank, say that it may be Hebrew; never give 0.92 to a
   homograph in such a sentence.
8. **A transliteration** (the Hebrew adapter's romaniser is at hand) with the sounds of the letters in the orientation.
9. **Grammar notes**, in this order: the determined state; *di* (genitive, relative, "that") and its compounds; the
   suffix + *di* genitive; the participle as tense and with הֲוָה; ל with the imperfect of "to be"; ל as object marker;
   אִיתַי; the fixed phrases of 6.
10. **Rewrite the orientation for a Hebrew reader** (7), and remove the shared sentences that are false of this pack.
11. **"All forms"**: show the attested forms of the lemma from the data, labelled as attested.
12. **Vocabulary identity**: one item per word, not per tag (4.5).

## 9. Limits of this audit

- I am a language model, not an Aramaist, and looked nothing up. The corrections in 4.3 and 4.4 are forms I am sure of
  unless marked "check"; where the source itself tags the same form correctly elsewhere I say so. Hand counts could be off
  by a few.
- Read in full: Daniel 2:4b to 3:30 and Ezra 4:8 to 5:17 (2,013 of 4,828 words). The other 2,815 words were checked by
  machine and by look-up; more wrong annotations of the kinds in 4.3 certainly remain there (at the sample's rate, about
  45; I list 27).
- The brief's steps 4 and 5 (running text of my own, a list of everyday words) do not fit a closed corpus and I did not
  write pointed Aramaic. In their place: every word of the corpus in five conditions, and 23 typed unpointed lines.
- Everything was run through the card parser and the adapter, not in a browser. I did not open the popup, the "All
  forms" panel or the pack's feature panel; statements about them are marked "from the code".
- Not audited: the build and report scripts, the export to Ecclesia, GoReview's use of the pack, the Hebrew pack's
  reading of Aramaic verses beyond one probe.
- The second edition I used is the copy in the owner's Biblia app (MAM); I did not compare it with a printed Bible.

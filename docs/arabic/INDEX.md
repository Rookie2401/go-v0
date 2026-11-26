# Arabic form index: build of 2026-11-25

Built by `npm run ar:build-index` (`scripts/ar-build-index.mts`) from `kaikki-arabic.jsonl` (Wiktionary via kaikki.org, CC BY-SA 4.0; 519,071,935 bytes, modified 2026-09-22T20:48:59.877Z, sha256 `143c0e0bc33eddcc3684cec51b04fbb493bf601e0ab79f051fc6318549b3e3dc`)
with word frequencies from `ar_50k.txt` (hermitdave FrequencyWords, subtitle text, CC BY-SA 4.0: used for order only, never as evidence that a form exists). Every row is a
Wiktionary table row, a head-line form or a "form of" page; the tag bundles, vowels and roots are the source's, verbatim. Nothing was analysed here. Definite rows: `--definite strip`.
Lemma string convention: `arHeadForm` of `arabic/text.ts`.

| measure | value |
|---|---|
| input lines | 78,135 |
| entries read (mapped parts of speech) | 77,792 (VERB 48,855, NOUN 19,500, ADJ 6,007, PROPN 2,491, ADV 378, ADP 139, PRON 100, INTJ 98, CONJ 90, NUM 72, PART 53, DET 9) |
| kinds of entry skipped | phrase 148, character 80, proverb 34, symbol 33, suffix 18, punct 12, prep_phrase 10, prefix 5, interfix 2, root 1 |
| lemma entries / form pages (of which "ar-verb form" pages) / lemma entries that also hold form-of senses | 27,090 / 50,698 (41,350) / 2,982 |
| pages that are only alternative spellings (alt-of) | 1,021 |
| participle entries (verb class in the extract, head "active / passive participle of X"; made ADJ with VerbForm=Part, Voice, Of=verb) / of those with Of | 14 / 10 |
| lemma glosses changed by the clean-gloss rule (batch 6; counted before the reviewed choices) | 13,288 |
| reviewed gloss choices (gloss-choices.json): lexemes that took one / lexemes where no sense matched (keeping the default) | 336 / 7: أَنَا|PRON, زَهْرَة|NOUN, زَوْج|NOUN, فَقِير|ADJ, قَرْيَة|NOUN, مَتَى|ADP, وَاحِد|PRON |
| lemma ids by part of speech | NOUN 12,758, VERB 7,366, ADJ 3,814, PROPN 2,357, ADV 366, ADP 113, INTJ 90, CONJ 80, NUM 53, PRON 44, PART 42, DET 6 |
| lemma ids (with at least one row) | 27,089 (25,301) |
| head + POS pairs with more than one entry (extra ids `|2`, `|3` … ordered by etymology number, then first gloss) | 787 (927 extra ids) |
| lemma ids merged because the head convention made two source spellings one | 1 |
| heads changed by each rule of the convention (an entry can count under several) | other 154, dagger-fatha 10, fatha-before-alif 152, final-damma 10 (heads changed in all: 399, attributed by the marks that differ) |
| form keys | 239,260 |
| readings (rows) | 1,409,074 |
| rows by origin: lemma table / form-page table / headword with no row under its form (canonical) / form-of page / verb-form page / head-line form | 1,327,723 / 68,898 / 2,315 / 3,498 / 39 / 6,601 |
| keys with more than one lemma id | 62,386 |
| distinct tag bundles (codes) | 6,080 |
| definite rows (`strip`): article stripped from the key / without an article / dropped / shadda of an assimilated article cleared | 248,465 / 4,003 / 0 / 77,267 |
| entries with several head lines and as many tables, split into one lemma per head (extra lemmas gained) / entries with several canonical rows but one table, kept as one lexeme | 132 (153) / 912 |
| of those split with ONE table and several verb heads (the table goes to the head whose citation form is the table's own 3ms past) / such tables matching no head (go to the first) | 22 / 0 |
| uncontracted spellings of a doubled verb resolved to the contracted lemma (ضَادَدَ → ضَادَّ), uses | 622 |
| first-person rows whose gender label was removed / of those, merged into a row already there | 200,427 / 100,175 |
| rows with no vowels (empty vocal) by origin | table 51, citation 36, page 24, headline 41 |
| verb-form lines whose vocalized form came from the canonical rows of the page / whose canonical row disagreed with the head-line text / vocalized form taken from the page's own single head line / readings listed as "##" sub-lines under an "inflection of" header | 0 / 237 / 13,494 / 22,120 |
| roots by source: template only / category only / template and category (of which different) / category with several roots (left out) | 1,482 / 5,455 / 4,213 (9) / 104 |
| verb cells for a participle or verbal noun: dropped because a lemma entry of its own has that form / kept under the verb | 5,545 / 16,866 |
| rows left out: "-" cells / no letter / with a space / invalid characters / template error labels / empty label list / exact duplicates | 107,153 / 0 / 23,381 / 853 / 1,468 / 536 / 107,339 |
| lemma heads rejected as invalid (entry left out) / trimmed to a valid head / taken from the head-line text / unvocalized / canonical key differs from the page word / no canonical row, page word used | 130 / 26 / 135 / 60 / 94 / 7 |
| form-page rows not added because the lemma already has a row for the key and vowels / head-line forms not added for the same reason | 128,412 / 31,530 |
| form-of targets with no lemma entry / with several equally good ones (no row added) / resolved through the same POS, the nominal group, any POS | 1,288 (880 distinct) / 17,162 / 127,381, 117, 4,564 |
| verb-form lines that gave no vocalized form (page word used) / form-of senses with no target word / verb-form lines that did not parse / whose form is another key / pages without a form / form pages whose own table mixed senses | 838 / 0 / 161 / 0 / 10 / 36 |
| Gender of nouns: from the canonical row's labels / from the head template | 13,861 / 767 |
| Decl: lemmas whose rows agree on one class / that mix classes (no Decl) | 14,308 / 2,698 |
| lex features on lemma ids | Decl=Trip 13,087, Gender=Masc 9,293, Gender=Fem 5,219, Form=I 2,870, Form=II 1,184, Reg=Cla 812, Decl=Dip 780, Form=IV 659, Form=V 570, Form=VIII 467, Decl=Indecl 440, Form=III 333, Form=X 309, Form=VI 308, Form=Iq 237, Form=VII 172, Gender=Fem,Masc 115, Form=IIq 80, Form=IX 23, Form=IVq 20, Form=XII 19, Form=IIIq 15, VerbForm=Part 14, Form=XI 13, Voice=Act 6, Reg=Msa 4, Voice=Pass 4, Form=XIII 3, Of=بَسَطَ 1, Of=ذَهَبَ 1, Of=رَاحَ 1, Of=حَمَّ 1, Of=رَسَمَ 1, Of=أَبَّدَ 1, Of=بَهْدَلَ 1, Of=حَمْلَقَ 1, Of=أَمَاتَ 1, Of=اِنْتَبَهَ 1 |
| Reg=Cla (every sense Classical, archaic or obsolete) / Reg=Msa (every sense Modern) — lemma entries | 812 / 4 |
| roots (the ar-root / ar-rootbox template, else the root category of the senses; malformed templates ignored: 0) | NOUN 4,688/12,758 (36.7 %), VERB 4,745/7,366 (64.4 %), ADJ 1,464/3,814 (38.4 %), PROPN 217/2,357 (9.2 %), ADV 55/366 (15.0 %), ADP 28/113 (24.8 %), INTJ 11/90 (12.2 %), CONJ 7/80 (8.8 %), NUM 11/53 (20.8 %), PRON 0/44 (0.0 %), PART 3/42 (7.1 %), DET 0/6 (0.0 %) |
| shards | 179 (prefixes of up to 3 letters; limit 1,500,000 bytes of JSON) |
| shard bytes | 7.92 MB gzip, 39.9 MB plain |
| largest shard | `ب` 0.99 MB plain, 0.20 MB gzip (largest gzip: `ب` 0.20 MB) |
| merging experiment (upper bound of rows storable once: same key, lemma, labels but case, vowels but the last letter's) | 259,144 rows, 5,109,289 bytes of JSON |
| core rows | seen (seen = a chosen lemma's rows under keys that occur in ar_50k and under its own written form; all = every row) |
| core keys: completed (the missing lexemes' rows added; at most 8 rows and 3 lexemes) / flagged `partial` (the full index has lexemes the core lacks) / share of ar_50k running words on flagged keys | 893 / 1,025 / 18.88 % |
| closed-class clitic entries kept out of the word keys (tatweel at an edge, or one bare letter: بِـ, ـهَا, وَ, أَ …) | 27: وَ (CONJ), وَ (ADP), بِـ (ADP), تَ (ADP), أَ (PART), سَـ (PART), فَـ (CONJ), كَـ (ADP), ـكَ (PRON), ـكِ (PRON), لِـ (ADP), لَـ (ADP), لِـ (CONJ), لِـ (PART), لَـ (PART), ـهُ (PRON), هَـ (PART), ـهُمْ (PRON), ـهُنّ (PRON), ـهُمَا (PRON), ـنَا (PRON), آ (PART), ـهَا (PRON), ـكُمْ (PRON), ـكُنَّ (PRON), ـكُمَا (PRON), ـني (PRON) |
| lemma entries with no table at all / of those with a row under their written form (the source's canonical row, code `canonical…`) | 2,520 / 2,015 (without: 505, of which multi-word heads 505) |
| adjective lemmas with a feminine row (any origin) / of all adjective lemma ids; "feminine … of X" form pages of adjectives resolved (rows new, the rest already in the adjective's table) | 3,538 / 3,814; 930 (49 new) |
| core ranking | marginal (own = weight of a lemma's own keys per byte; marginal = frequency of the keys it adds to those already covered, per byte) |
| core | 1734 lemmas (255 of closed classes, 2 seeded), 2693 keys, 13277 rows, 499,883 bytes of JSON (budget 500,000) |
| core token coverage on ar_50k (running words whose key is a core key) | 56.30 % of 149,102,962 (clitic forms are not keys) |
| identity checks accepted through a numbered sibling of the main id / through the loose fold | 2 / 2 (counted apart from the clean ones above) |
| lexeme preferences (--identities): candidate loser/winner pairs / dropped as one lexeme (same head, same part-of-speech group) / dropped as both directions (b) / dropped as balanced (c) / closed-class loser to open winner dropped (d) | 1,904 / 75 / 7 / 110 / 2 |
| reviewed preferences (preferences-reviewed.json) merged / derived pairs they overrode / pairs removed by its balanced list / lexemes not in the index (skipped); derived pairs before the merge | 93 / 0 / 0 / 0; 1,293 |
| preferences emitted: pairs / distinct losers / distinct winners | 1,377 / 1,223 / 594 |
| lemma ids with count 0 (counts by lexeme group: own keys of the group, plus the weaker decided-key term, weight 0.25; before the group rule 22,516) | 21,102 of 27,089 |
| identities file | src/adapters/arabic/identities.json: 867 keys credited to their main lemma; checked clean 866, failed 7 (7 naming a lemma id not in the index) |

## Count (order of readings)

`count` = the summed ar_50k frequency of the keys that no other lemma id has a row for, plus the keys an identities file names the lemma for. Shared keys add nothing.
Share of ar_50k running words by the number of lemma ids their key has in this index: 0 ids 30.6 %, 1 id 20.9 %, 2 ids 14.5 %, 3 ids 9.4 %, 4 or more 24.6 %
(the lead's audit measured 18.6 / 28.5 / 19.3 / 10.0 / 23.6 % on its own build). Closed classes are admitted to the core by the old share (frequency / holders) because their keys are often shared.

## Core budget projections (not stored)

- 350,000 bytes: 695 lemmas, tokenCoverage 0.5261
- 500,000 bytes: 915 lemmas, tokenCoverage 0.563
- 800,000 bytes: 1364 lemmas, tokenCoverage 0.6031

## Register and period labels found on senses (counts of senses)

obsolete 1,139, archaic 253, rare 244, Classical 190, historical 140, colloquial 77, Egypt 69, dated 63, dialectal 61, Standard 61, Modern 60, al-Andalus 59, Yemen 56, Iraq 41, Morocco 38, uncommon 37, literary 27, informal 26, regional 24, Levantine 23, proscribed 23, poetic 22, vulgar 17, formal 16, nonstandard 15, slang 13, Kuwait 12, post-Classical 12, Palestine 10, Mauritania 6, modern 6

`Reg=Cla` needs every sense to carry Classical, archaic or obsolete; `Reg=Msa` every sense to carry Modern or modern. Other labels (dated, poetic, literary, rare, historical, pre-/post-Classical, dialect and country names) are not turned into a Reg value.

## Rejected forms (first 20)

- ḡarafāt
- ḡarafāt
- al-ḡarafāt
- al-ḡarafāt
- ḡarafāt
- ḡarafāt
- ḡarafātun
- ḡarafātun
- al-ḡarafātu
- al-ḡarafātu
- ḡarafātu
- ḡarafātu
- ḡarafātin
- ḡarafātin
- al-ḡarafāti
- al-ḡarafāti
- ḡarafāti
- ḡarafāti
- ḡarafātin
- ḡarafātin

## Rejected heads (first 20; the extract also holds entries of the Arabic section written in Hebrew script (Judeo-Arabic) and a few English glosses)

- head of overweight: 
- head of מלך: 
- head of אל: 
- head of אהל: 
- head of לילה: 
- head of לחם: 
- head of עלי: 
- head of סבב: 
- head of אבן: 
- head of הרון: 
- head of have sex: 
- head of ه: ﮪ
- head of אן: 
- head of אן: 
- head of אן: 
- head of אן: 
- head of מן: 
- head of מן: 
- head of אנא: 
- head of אלא: 

## Unresolved form-of targets (top 50)

- اِسْتَحَى (84)
- نَفَا (77)
- ذَرَى (54)
- كَمِلَ (44)
- سَرَّحَ (9)
- لَوَّعَ (6)
- فَقْرَة (5)
- فُقْرَة (5)
- كَلْبَة (5)
- أَخَفَّ (4)
- أَرْمِينِيّ (4)
- أَضَجَّ (4)
- بِرِيطَانِيّ (4)
- رَوْحَانِيّ (4)
- رُخُصَة (4)
- زِنْجِيّ (4)
- سَطَر (4)
- عُصُر (4)
- قُبْطِيّ (4)
- كِيبِيكِيّ (4)
- إِنْكْلِيزِيّ (3)
- بَرْسِيَاوُشَان (3)
- تُونِسِيّ (3)
- خُوَارِزْمِيَّة (3)
- دُخَّان (3)
- رَأْسْمَالِيّ (3)
- زُرَافَة (3)
- سَاجِد (3)
- ضِلَع (3)
- عُصْر (3)
- عِصْر (3)
- كِرْزِن (3)
- لَازَمَ (3)
- مُسَرَّح (3)
- مُسَرِّح (3)
- nouns with tanwīn (2)
- variety of حَرَج (2)
- أَصَم (2)
- أَهَابَ (2)
- أُتْرُجّ (2)
- أُرْدُنِّيّ (2)
- إِوَزَّة (2)
- إِيرْلَنْدِيّ (2)
- اُمْرُؤٌ (2)
- اِزْرَاقَّ (2)
- بَسَّطَ (2)
- بَطَارِخ (2)
- بِيرُقْرَاطِيّ (2)
- تَمَادَّ (2)
- تُرْجُمَان /تَرْجَمَان (2)

## The 40 commonest tag bundles

- `noun-from-verb` 9,082
- `active|imperative|masculine|second-person|singular` 8,620
- `active|feminine|jussive|singular|third-person` 8,618
- `active|first-person|jussive|plural` 8,618
- `active|first-person|jussive|singular` 8,618
- `active|jussive|masculine|second-person|singular` 8,618
- `active|jussive|masculine|singular|third-person` 8,618
- `active|imperative|masculine|plural|second-person` 7,466
- `active|jussive|masculine|plural|second-person` 7,463
- `active|jussive|masculine|plural|third-person` 7,463
- `active|imperfective|indicative|masculine|non-past|plural|second-person` 7,462
- `active|imperfective|indicative|masculine|non-past|plural|third-person` 7,462
- `active|masculine|plural|second-person|subjunctive` 7,462
- `active|masculine|plural|subjunctive|third-person` 7,462
- `active|dual|feminine|imperative|second-person` 7,442
- `active|dual|imperative|masculine|second-person` 7,442
- `active|feminine|imperative|plural|second-person` 7,442
- `active|feminine|imperative|second-person|singular` 7,442
- `active|dual|feminine|jussive|second-person` 7,439
- `active|dual|feminine|jussive|third-person` 7,439
- `active|dual|jussive|masculine|second-person` 7,439
- `active|dual|jussive|masculine|third-person` 7,439
- `active|feminine|jussive|plural|second-person` 7,439
- `active|feminine|jussive|plural|third-person` 7,439
- `active|feminine|jussive|second-person|singular` 7,439
- `active|dual|feminine|imperfective|indicative|non-past|second-person` 7,438
- `active|dual|feminine|imperfective|indicative|non-past|third-person` 7,438
- `active|dual|feminine|second-person|subjunctive` 7,438
- `active|dual|feminine|subjunctive|third-person` 7,438
- `active|dual|imperfective|indicative|masculine|non-past|second-person` 7,438
- `active|dual|imperfective|indicative|masculine|non-past|third-person` 7,438
- `active|dual|masculine|second-person|subjunctive` 7,438
- `active|dual|masculine|subjunctive|third-person` 7,438
- `active|feminine|imperfective|indicative|non-past|plural|second-person` 7,438
- `active|feminine|imperfective|indicative|non-past|plural|third-person` 7,438
- `active|feminine|imperfective|indicative|non-past|second-person|singular` 7,438
- `active|feminine|imperfective|indicative|non-past|singular|third-person` 7,438
- `active|feminine|plural|second-person|subjunctive` 7,438
- `active|feminine|plural|subjunctive|third-person` 7,438
- `active|feminine|second-person|singular|subjunctive` 7,438

## Every tag that occurs in a bundle

Arabic 2, Classical 263, Egypt 2, Mauritania 1, Medieval 1, Modern 1, Morocco 1, Standard 1, Yemen 6, abbreviation 1, accusative 160,707, active 486,971, al-Andalus 22, alternative 23,509, animate 2, ar-infl-a 169,716, ar-infl-ah 3,524, ar-infl-an-alef 996, ar-infl-an-maksura 3,453, ar-infl-awna 480, ar-infl-in 6,752, archaic 622, broken-form 97,464, by-personal-gender 2, canonical 2,315, collective 24,333, colloquial 124, common 8, common-gender 1, construct 147,638, dated 17, definite 249,972, dialectal 435, diminutive 167, diptote 55,344, direct 1, dual 368,341, elative 265, enclitic 7, feminine 494,935, first-person 100,266, form-i 24, form-ii 2, form-iii 1, form-iiq 1, form-iq 1, form-iv 2, form-of 4, form-v 1, form-x 1, form-xi 1, genitive 160,714, imperative 46,260, imperfective 170,898, impersonal 1, inanimate 2, indefinite 245,230, indicative 338,949, informal 160,640, invariable 13,632, irregular 187, jussive 180,380, literary 36, long-construct 148, masculine 461,566, misspelling 31, nominative 160,811, non-past 170,985, nonstandard 171, noun-from-verb 32,537, obsolete 1,305, participle 29,119, passive 278,636, past 168,041, paucal 13,044, perfective 168,040, plural 474,420, poetic 4, pre-Classical 4, pronunciation-spelling 2, proscribed 33, rare 563, second-person 337,646, singular 666,177, singulative 21,054, sound-form 127,363, subjunctive 170,905, third-person 298,900, transliteration 1, triptote 456,068, uncommon 350, unknown 4

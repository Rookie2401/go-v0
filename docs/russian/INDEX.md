# Russian form index: build of 2026-11-17

Built by `npm run ru:build-index` (`scripts/ru-build-index.mts`) from `data/dictionaries/kaikki.org-dictionary-Russian.jsonl.gz` (Wiktionary via kaikki.org, CC BY-SA 4.0; extract last modified 2026-10-30, retrieved 2026-11-17, sha256 `86a781a5685d614efd439e326eed0bf0ad9cda9f67b854f8b6c93212c5345b3e`)
with reading priors from `data/raw/ud-ru/ru_gsd-ud-train.conllu` (UD Russian-GSD train, CC BY-SA 4.0). Every row is a Wiktionary table row, a head-line comparative or superlative, or a "form of" page; the tag bundles are
the source's, verbatim. Nothing was analysed here.

| measure | value |
|---|---|
| input lines | 443,260 |
| entries read | 440,975 (NOUN 213,582, VERB 198,344, ADJ 18,444, PROPN 5,397, ADV 2,760, NUM 707, PRON 643, INTJ 539, DET 220, ADP 146, CONJ 93, PART 88, SCONJ 12) |
| lemma entries / form pages / lemma entries that also hold form-of senses | 58,540 / 382,435 / 2,424 |
| form pages that own a table (participles) | 27,227 |
| lemma ids (with at least one row) | 58,540 (55,215) |
| form keys | 923,009 |
| readings (rows) | 1,457,710 |
| rows by origin: lemma table / participle-page table / head-line comparative and superlative / headword of a lemma with no table / form-of page / two-hop form-of page | 844,017 / 640,243 / 6,497 / 4,832 / 5,567 / 1,041 |
| keys with ё | 42,714 (е-spellings in the yo map: 42,714) |
| keys with more than one lemma | 52,875 |
| distinct tag bundles (codes) | 6,771 |
| kinds of entry skipped | phrase 410, suffix 281, prefix 180, proverb 140, combining_form 84, character 83, symbol 5, punct 5, interfix 4, prep_phrase 3, infix 1 |
| rows left out: "-" cells / no Cyrillic letter / with a space / pre-reform spelling / with brackets / exact duplicates | 70,948 / 3,698 / 83,899 / 10,242 / 0 / 10,924 |
| rows left out: cells of the shared personal-pronoun matrix that do not spell the headword | 2,266 |
| rows left out: a dated function of a form that is also a current form of the same lemma (a row labelled dated is kept only when the lemma has no undated row under the key) | 18,313 |
| rows collapsed because past plural (and any cell of three gender-tagged rows differing only by gender) has no gender | 26,404 |
| rows dropped for an empty tag bundle / for a case label on an adverb / tags "2" removed (a footnote marker) | 0 / 49 / 0 |
| entries left out because the headword is in pre-1918 spelling | 1,089 |
| form pages whose own table was not used because their senses carry different labels | 730 |
| adverb entries holding an inflection table (весь, такой): entries / rows moved to the declinable entries of the same etymology / rows dropped | 3 / 230 / 0 |
| table forms written with a preposition ("в году́") filed under the word itself: rows / prepositions seen | 95 / в 49, во 4, на 41, о 1 |
| rows left out because the template marked the cell as an error (error-…) / error labels removed from head-line comparatives | 298 / 590 |
| entries all of whose senses are alternative spellings (alt-of): not lemma entries, read as forms of their targets with the label alternative / rows they gave | 2,180 / 1,530 |
| noun and proper-noun lemma entries / with no Gender before and after reading the head line / with no Animacy before and after | 32,203 / 3,331 → 139 / 3,748 → 215 |
| Gender taken from another canonical row / from the head line; Animacy likewise | 240 / 2,952; 234 / 3,299 |
| noun entries whose head line says pl (plural only; not recorded in lex) | 583 |
| page rows not added because the lemma already has a row under the key | 398,412 |
| head-line forms of other kinds not used (genitive, plural, diminutive, … : all in the table already or not inflection) | 116,004 |
| form-of targets with no lemma entry (even through one more page) | 2,096 (885 distinct) |
| form-of senses with no target word | 0 |
| verbs whose aspect came from the table-tags row (no aspect on the canonical row) | 332 |
| shards | 467 (prefixes of up to 3 letters; limit 1,500,000 bytes of JSON) |
| shard bytes | 9.56 MB gzip, 53.0 MB plain |
| largest shard | `про` 1.52 MB plain, 0.24 MB gzip (largest gzip: `т` 0.27 MB) |
| core seed (scripts/ru-core-seed.txt): lines / lemma ids added / lines not in the index / count of the last open-class lemma admitted | 302 / 344 / none / 7 |
| core (no participle-table rows, no register-labelled rows where the lemma has plain ones) | 1536 lemmas (173 of closed classes), 15385 keys, 21507 rows, 759,906 bytes of JSON (budget 760,000) |
| core token coverage on GSD train | 62.69 % of 56,904 word tokens by key; 62.80 % reading е as ё |

## Core budget projections (not stored)

- 450,000 bytes: 989 lemmas, tokenCoverage 0.5508 (0.5514 with е for ё)
- 600,000 bytes: 1256 lemmas, tokenCoverage 0.5931 (0.5939 with е for ё)
- 800,000 bytes: 1604 lemmas, tokenCoverage 0.6343 (0.6356 with е for ё)

## Lemmas that became SCONJ (GSD train tags them SCONJ at least 3 times and more often than CCONJ)

что (SCONJ 209, CCONJ 0), чтобы (SCONJ 48, CCONJ 0), как (SCONJ 32, CCONJ 8), так (SCONJ 22, CCONJ 7), чем (SCONJ 20, CCONJ 0), хотя (SCONJ 19, CCONJ 1), если (SCONJ 16, CCONJ 0), поскольку (SCONJ 15, CCONJ 0), когда (SCONJ 13, CCONJ 0), пока (SCONJ 7, CCONJ 0), ведь (SCONJ 3, CCONJ 0), дабы (SCONJ 3, CCONJ 0)

## Gender and animacy of nouns

Gender and Animacy come from the canonical row(s) of the entry, else from the head line (`• (translit) m anim or f anim`), never from the ending. Lemmas still without Gender / Animacy by cause:

- no canonical row and no parsable head line: Gender 70, Animacy 70
- the head line names no gender or animacy: Gender 0, Animacy 83
- plural-only (the head line says pl): Gender 10, Animacy 6
- the head line says ? (unknown): Gender 7, Animacy 4
- canonical row without the tag, no parsable head line: Gender 52, Animacy 52

Plural-only nouns carry `pl` in the head line (examples: леса: леса́ • (lesá) m inan pl (genitive лесо́в, plural only) | деньги: де́ньги • (dénʹgi) f inan pl (genitive де́нег, plural only, relational adjective де́нежный | цимбалы: цимба́лы • (cimbály) m inan pl (genitive цимба́л, plural only) | Соединённые Штаты Америки: Соединённые Шта́ты Аме́рики • (Sojedinjónnyje Štáty Amériki) m inan pl (genitive Соединённ | люди: лю́ди • (ljúdi) m anim pl (genitive люде́й, plural only, relational adjective людско́й, pe | Афины: Афи́ны • (Afíny) f inan pl (genitive Афи́н, plural only)); this is not recorded in lex.

Commonest without Gender (by count): спор (9; no canonical row and no parsable head line), монмартр (1; canonical row without the tag, no parsable head line), парфюмер (1; no canonical row and no parsable head line), 200 (0; no canonical row and no parsable head line), 300 (0; no canonical row and no parsable head line), абакумов (0; canonical row without the tag, no parsable head line), абхазская автономная советская социалистическая республика (0; no canonical row and no parsable head line), аверьянов (0; canonical row without the tag, no parsable head line), агапитов (0; canonical row without the tag, no parsable head line), акариформный (0; canonical row without the tag, no parsable head line), алейник (0; canonical row without the tag, no parsable head line), алейников (0; canonical row without the tag, no parsable head line), алымов (0; canonical row without the tag, no parsable head line), альпака (0; the head line says ? (unknown)), америка (0; no canonical row and no parsable head line), анатолии (0; canonical row without the tag, no parsable head line), андриянов (0; canonical row without the tag, no parsable head line), анисов (0; canonical row without the tag, no parsable head line), аргамак (0; canonical row without the tag, no parsable head line), архипов (0; canonical row without the tag, no parsable head line), балабиль (0; no canonical row and no parsable head line), баоцзы (0; plural-only (the head line says pl)), безлёгочный (0; no canonical row and no parsable head line), безымённый (0; no canonical row and no parsable head line), бенедиктов (0; canonical row without the tag, no parsable head line), берит (0; no canonical row and no parsable head line), бл*дь (0; no canonical row and no parsable head line), бол (0; no canonical row and no parsable head line), брикс (0; no canonical row and no parsable head line), гренель (0; canonical row without the tag, no parsable head line)

Commonest without Animacy (by count): спор (9; no canonical row and no parsable head line), джеймс (5; the head line names no gender or animacy), оао (2; the head line names no gender or animacy), энн (2; the head line names no gender or animacy), бразилиа (1; the head line names no gender or animacy), двина (1; the head line names no gender or animacy), кали (1; the head line names no gender or animacy), монмартр (1; canonical row without the tag, no parsable head line), парфюмер (1; no canonical row and no parsable head line), 200 (0; no canonical row and no parsable head line), 300 (0; no canonical row and no parsable head line), абакумов (0; canonical row without the tag, no parsable head line), абреже (0; the head line names no gender or animacy), абхазская автономная советская социалистическая республика (0; no canonical row and no parsable head line), аверроэс (0; the head line names no gender or animacy), аверьянов (0; canonical row without the tag, no parsable head line), авизо (0; the head line names no gender or animacy), агапитов (0; canonical row without the tag, no parsable head line), айдос (0; the head line names no gender or animacy), акариформный (0; canonical row without the tag, no parsable head line), акне (0; the head line names no gender or animacy), алейник (0; canonical row without the tag, no parsable head line), алейников (0; canonical row without the tag, no parsable head line), алымов (0; canonical row without the tag, no parsable head line), альбирео (0; the head line names no gender or animacy), альфа центавра (0; the head line names no gender or animacy), америка (0; no canonical row and no parsable head line), анатолии (0; canonical row without the tag, no parsable head line), андриянов (0; canonical row without the tag, no parsable head line), анисов (0; canonical row without the tag, no parsable head line)

## Commonest feature bundles of GSD train (nominal NOUN)

Gen|Sing 5,336, Nom|Sing 3,522, Prep|Sing 2,376, Gen|Plur 2,280, Acc|Sing 2,182

## Gender collapse: codes touched (top 10)

- `masculine|past|plural` 12,584
- `feminine|past|plural` 12,584
- `neuter|past|plural` 12,584
- `masculine|passive|past|plural` 271
- `feminine|passive|past|plural` 271
- `neuter|passive|past|plural` 271
- `dated|masculine|past|plural` 200
- `dated|feminine|past|plural` 200
- `dated|neuter|past|plural` 200
- `alternative|masculine|past|plural` 54

## Form priors

593 keys and 776 rows (lemma, part of speech, count) in `generated/form-priors.ts`: the forms that occur at least 3 times in GSD train and that the index reads as two or more different (headword, part of speech) pairs, with the treebank's own lemmas and counts.

## Unresolved form-of targets (top 50)

- адопти́роваться (24)
- и́хний (17)
- побле́скивать (17)
- вве́дшийся (16)
- опуша́ться (16)
- букси́рный крю́к (14)
- друго́й (14)
- Де́душка Моро́з (11)
- сосёнка (11)
- щёлочка (11)
- ЗАГС (10)
- Золота́я Орда́ (10)
- Но́вый го́д (10)
- Пе́пельная среда́ (10)
- Страстна́я неде́ля (10)
- Страстна́я седми́ца (10)
- Фома́ (10)
- Хану́ка (10)
- а́фро-америка́нка (10)
- артилле́рия да́льнего де́йствия (10)
- батаре́йка (10)
- вёшка (10)
- геркуле́совая ка́ша (10)
- гре́чневая ка́ша (10)
- ду́рочка (10)
- згра (10)
- иго́лочка (10)
- кати́сма (10)
- кита́йская ци́фра (10)
- курси́стка (10)
- кыргы́зка (10)
- ма́нная ка́ша (10)
- манеке́нщица (10)
- махно́вщина (10)
- мину́точка (10)
- ни́вхка (10)
- оживи́тельница (10)
- поло́сочка (10)
- попере́чная силова́я переда́ча (10)
- пшённая ка́ша (10)
- све́чечка (10)
- стару́шка (10)
- трою́родная тётка (10)
- фемини́стка (10)
- я́мочка (10)
- Агапио́н (9)
- Агапо́н (9)
- Агафа́нгел (9)
- Агафо́н (9)
- Владисла́в (9)

## The 40 commonest tag bundles

- `instrumental|singular` 35,342
- `instrumental|plural` 34,949
- `dative|plural` 34,944
- `plural|prepositional` 34,939
- `genitive|plural` 34,764
- `nominative|plural` 34,581
- `genitive|singular` 27,259
- `dative|singular` 27,236
- `prepositional|singular` 27,234
- `nominative|singular` 27,071
- `accusative|singular` 26,690
- `accusative|plural` 24,422
- `adverbial|participle|past` 21,814
- `feminine|instrumental` 20,115
- `masculine|past|singular` 12,650
- `neuter|past|singular` 12,634
- `past|plural` 12,584
- `imperative|second-person|singular` 12,511
- `active|participle|past` 12,498
- `imperative|plural|second-person` 12,467
- `feminine|past|singular` 12,446
- `active|feminine|imperfective|instrumental|participle|present` 12,260
- `active|feminine|imperfective|instrumental|participle|past` 11,192
- `feminine|genitive` 10,345
- `accusative|feminine` 10,344
- `feminine|nominative` 10,344
- `dative|feminine` 10,342
- `feminine|prepositional` 10,341
- `active|feminine|instrumental|participle|past|perfective` 10,340
- `masculine|nominative` 10,340
- `accusative|animate|plural` 10,156
- `accusative|inanimate|plural` 10,134
- `genitive|masculine|neuter` 9,676
- `accusative|animate|masculine` 9,675
- `instrumental|masculine|neuter` 9,675
- `accusative|inanimate|masculine` 9,674
- `accusative|neuter` 9,674
- `dative|masculine|neuter` 9,674
- `neuter|nominative` 9,674
- `masculine|neuter|prepositional` 9,673

## Every tag that occurs in a bundle

Canada 1, Cyrillic 4, Internet 79, Italy 1, Middle 27, Perm 18, Pskov 13, Roman 2, Russia 6, Russian 27, Saint-Petersburg 14, Southern 6, Ukraine 32, abbreviation 1,134, ablative 1, accusative 269,158, acronym 66, active 421,920, adjective 25, adverb 2, adverbial 29,451, alternative 14,998, animate 72,121, apocopic 3, archaic 694, attributive 2, augmentative 622, bureaucratese 32, by-personal-gender 157, canonical 4,832, childish 13, clipping 167, collective 14, colloquial 4,009, common 10, comparative 6,234, concrete 4, contraction 39, count-form 30, dated 2,980, dative 162,845, deliberate 3, demonstrative 37, derogatory 235, dialectal 269, diminutive 10,939, ellipsis 79, emphatic 1, endearing 1,501, ethnic 39, euphemistic 13, feminine 286,787, first-person 26,887, formal 546, future 38,965, genitive 163,322, historical 115, humorous 42, idiomatic 3, imperative 26,039, imperfective 402,010, impersonal 126, inanimate 73,789, indeclinable 296, indicative 938, infinitive 13,246, informal 56, initialism 74, instrumental 207,872, intransitive 21, ironic 36, irregular 1,605, iterative 68, letter 6, literary 185, locative 191, masculine 276,556, mediopassive 4, misconstruction 14, misspelling 119, name 6, neologism 3, neuter 236,544, no-comparative 787, nominative 197,865, nonstandard 642, noun-from-verb 24, obsolete 319, offensive 32, often 37, participle 660,274, partitive 209, passive 224,106, past 453,641, paucal 4, pejorative 14, perfective 214,224, personal 25, pluperfect 1, plural 488,618, plural-normally 12, plural-only 239, poetic 326, possessive 4,336, predicative 23, prepositional 162,801, present 300,816, pronoun 25, pronunciation-spelling 47, proscribed 257, rare 924, reflexive 40, regional 189, relational 102, sarcastic 13, second-person 53,148, semelfactive 1, short-form 48,997, singular 278,489, singulative 173, slang 297, slur 39, sometimes 26, superlative 1,856, third-person 27,100, transitive 108, uncommon 200, uncountable 217, usually 26, vernacular 47, vocative 101, vulgar 321

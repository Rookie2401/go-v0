# Spanish — the dictionary layer and what it was measured against (2026-10-01)

Words as in `docs/READINESS.md`: **implemented**, **verified**, **architecture only**, **awaiting external input**.
Brief: `docs/PLAN10.md`. Word list compared with the dictionary: `docs/spanish/DICTIONARY_REPORT.md`. Course status:
`docs/spanish/STATUS.md`.

Nothing here is a claim about Spanish checked by a person. The dictionary is Wiktionary's; the measurements are of
this software against Wiktionary's own statements; no native speaker has reviewed the word list, the rules or the
course texts.

## 1. The source

| | |
|---|---|
| Source | Wiktionary, via kaikki.org — `kaikki.org-dictionary-Spanish.jsonl`, CC BY-SA 4.0 |
| Downloaded | 2026-10-01, with the owner's permission, as the `.jsonl.gz` (95,164,871 bytes; the plain file is 1,054,565,864 bytes). Source dated 2026-09-28 |
| Checksums | gz `e5569ffa…6e05`, plain `a2cc93ae…a2e6` (sha256; full values in `public/dict/es/manifest.json`) |
| Contents | 811,049 entries: 687,842 are inflected-form entries ("abundaras: second-person singular imperfect subjunctive of abundar"), 123,207 are headwords with meanings; 115,938 entries carry a table of forms; 18,049 usage examples |
| Where it lives | `data/dictionaries/` (source) and `public/dict/es/` (built), both git-ignored. The repository holds no copy of the dictionary |

It is kept as a **separately sourced layer**, exactly as for Thai: never merged into the hand word list, named as the
source of every reading it supplies, and where it differs from the word list nothing is chosen silently.

## 2. The build

`npm run dict:build -- --in data/dictionaries/kaikki.org-dictionary-Spanish.jsonl --lang es --last-modified 2026-09-28 …`

| | |
|---|---|
| Built dictionary | `kaikki-es@2026-09-28`: 808,278 entries in 1,024 shards, 57.7 MB, largest shard 68 kB |
| Build | 28 s, 553 MB peak, bounded (entries are spilled to disk by form hash and merged one partition at a time) |
| Format | schema 3: the label lists of form-of relations (629 distinct) are stored once in the manifest and referred to by number; no empty or repeated fields; pronunciations of entries that are only inflected forms are dropped for Spanish (233,240), because the spelling tells the pronunciation. Schema 2 (the Thai dictionary on disk) is still read unchanged. The first build in the old format projected about 93 MB |
| At run time | at most 24 parsed shards are held and 4 are read at a time, so the vocabulary of a whole book never loads the dictionary into memory. Measured: 38,653 real forms looked up in 1.0 s with 47 MB of heap growth |
| In a browser | a two-chapter book of my own writing imported in 1.5 s with 133 shard requests; re-importing it after an importer change re-analysed it in place (content version unchanged) |
| Shipped | a production build copies `public/dict/**`. `npm run dict:status` runs before every build and says which dictionaries will ship (es 57.7 MB, th 7.3 MB today). A clean checkout ships none until `dict:build` has been run |

The headword's original spelling is kept (`DictionaryEntry.written`) when normalization folded its case: 9,893 entries.

## 3. What the importer does with it

A text is analysed when it is imported. With a dictionary installed (`src/ingest/plan.ts`):

1. **A word the adapter reads from its own data is not replaced.** The dictionary's readings of *another* word or part
   of speech for the same spelling are added after the adapter's, below them (0.45), and the adapter's context rules
   then order them: `el miedo al abandono` is the noun, although the word list only knew *abandonar*. Never added to a
   function word of the word list (de, que, eso, se …), and never from an entry that is not a word of running text
   (abbreviation, acronym, initialism, misspelling, letter, symbol, affix).
2. **A word the rules only guess at is decided by the dictionary.** The Spanish rules explain any form, but outside
   the 1,701-lemma word list the lemma is a guess (`unconfirmed`). If the dictionary lists the form, its readings
   stand: where a rule reading and a dictionary reading agree on the lemma and do not contradict each other's
   features, the reading keeps the rule's features and word parts at 0.7 (two independent sources agree); a
   dictionary reading no rule matched keeps 0.6 (one part of speech) or 0.45 (several); a guess the dictionary does
   not list is dropped.
3. **A form the dictionary does not list, of a lemma it does** (most verbs with attached pronouns: 71 % have no
   entry of their own): the rule's reading is kept, with the lemma's meaning, and says so (`lemmaStatus: in the
   dictionary`, 0.6).
4. **A word neither knows** stays a marked guess: low confidence, no meaning, "possibly".
5. **Meanings are the lemma's.** An inflected form's entry has no meaning of its own; its label ("first-person
   singular of …") never becomes one, and a meaning is never borrowed from another part of speech. A form of a form
   (`encallecidas` → `encallecido` → `encallecer`) is followed one step. A verb the source files only as pronominal
   is found under its `-se` headword. An entry that is only an older or alternative spelling is read as its target
   (`obscuro` → *oscuro*).
6. **Capitals matter.** An entry written `PA`, `ESO` or `Rosa` is a reading only of a word written that way: "pa mi
   casa" is not *presión arterial*, "una rosa" is not the name.
7. **Region labels are carried.** A reading gets a variety (Honduras, Central America, Spain …) when every sense of
   the entry carries the label, so that one regional sense does not mark a general word.

On the word sheet a meaning that came from the dictionary names it ("Wiktionary, via kaikki.org — CC BY-SA 4.0")
and says "dictionary meaning, not checked for this sentence". "Possibly" appears when confidence is below 0.6 or
another word or part of speech is about as likely — not because a second person of the same verb exists.

Limits of the mechanism, stated:

- The built-in course texts are imported without the dictionary (they lie within the word list). A learner's own
  book imported **before** the dictionary was installed keeps its old analysis until it is imported again.
- The reader's display-time lookup (used by courses with a stage-aware word sheet; not by Spanish) does not yet apply
  the capitals rule.
- A capitalised headword's lemma is stored in its lower-case form (`rosa` / proper noun).
- A dictionary reading that a neighbour singled out among several parts of speech is stored at 0.6 with the others
  marked down (`al abandono`, `bebían guaro`), so it does not read "possibly"; where no neighbour decides ("me voy pa mi
  casa": *papá* or *pa'*, para) both stay at 0.45 and the word sheet says "possibly".

## 4. Measurements

All figures are of the software against the dictionary source. Evaluation data was split by a hash; the engine and
the rules were tuned on **dev** only; the **held-out** part was run once, at the end, and nothing was changed
afterwards. Scripts: `npm run es:eval-morph`, `npm run es:eval-context` (they refuse to show failures of a held-out
split).

### 4.1 Single forms: the rule engine against the dictionary's inflection data

714,784 form-of relations for verbs, nouns and adjectives. "Word-list lemmas" are forms of the lemmas the course's
word list holds; "other lemmas" are everything else.

| | dev | dev2 | held-out (`final`) |
|---|---|---|---|
| A. Word-list lemmas: the dictionary's lemma is among the adapter's readings | 99.14 % | 99.25 % | **98.43 %** of 9,424 |
| A. …and the features do not contradict the dictionary's labels | 99.89 % | 99.94 % | **99.84 %** |
| A. Confident readings the dictionary does not list (over-generation, or a gap in the dictionary) | 0.24 % | 0.24 % | **0.24 %** |
| B. Other lemmas: the dictionary's lemma is among the rule's guesses | 93.47 % | 93.08 % | **93.30 %** of 172,059 |
| C. Forms with one dictionary reading: it is the adapter's first reading | 99.43 % | 99.31 % | **98.84 %** of 8,608 |
| D. Verbs with attached pronouns: the verb is found, with the pronouns as parts | 99.48 % | 99.54 % | **99.33 %** of 11,696 |

Honest history of this table. The held-out half was first run whole, once, before the context work (adapter 5 as of
commit `07a0ca6`): A 98.32 %, features 99.89 %, B 91.75 %, C 98.62 %. Its attached-pronoun figure (61.6 % against
99.0 % on dev) exposed two faults in the **measure**, not the engine: the 1-in-16 sample reused the hash bits the
split was made from, so each split sampled a different kind of table cell, and a mangled regular expression skipped
every form containing the letter *s*; the tables also contain "-" placeholder cells. Rather than look at held-out
failures, the half was divided again: `dev2` was opened for diagnosis, `final` stayed sealed until the end. With the
measure repaired, dev D was 95.2 % before the engine fixes and 99.5 % after.

### 4.2 Words in sentences: the pipeline against the dictionary's usage examples

Each of Wiktionary's examples stands under one headword and part of speech and marks the word it illustrates. That
is a judged reading this project did not write. 16,138 usable examples, split in two by a hash of the sentence.

| | dev (7,970 marked words) | held-out (7,649) |
|---|---|---|
| The headword's reading is among the readings — adapter alone, no dictionary | 51.3 % | 52.6 % |
| …with the dictionary | 96.2 % | **96.6 %** |
| It is the **first** reading — no context rules | 87.5 % | 88.2 % |
| …full pipeline | 92.2 % | **92.65 %** |
| Of the words with competing readings — no context rules | 60.6 % of 1,311 | 61.9 % of 1,253 |
| …full pipeline | 81.9 % of 1,770 | **82.1 %** of 1,686 |
| Coverage of every word of the sentences (175,463 held-out): word list / rule on a word-list lemma / dictionary and rule agree / dictionary alone / rule guess only / nothing | | 59.7 / 10.8 / 13.3 / 13.9 / 1.0 / 1.2 % |

What this does and does not show:

- The examples are chosen to illustrate their headword, so the mix of readings is not that of running prose, and
  rarer senses are over-represented. It is real Spanish, much of it quoted from books and newspapers, but it is not
  a book.
- The dictionary that judges is also the dictionary the pipeline uses. The judgement itself (the example's heading)
  is never seen by the pipeline, but a word missing from the dictionary cannot appear in this measure at all.
- About 18 % of ambiguous words still get the wrong first reading. The known weak places: a noun or adjective after
  *ser* (soy marinero / es partidaria), adverbs that are also nouns (sigue derecho), interjections, short labels
  without a verb, and a capitalised common noun inside a sentence.
- Nothing here measures lemma accuracy on a Spanish book, and nothing was checked by a native speaker.

### 4.3 The course's own texts: does the dictionary change what was already read?

The 29 bundled Spanish documents lie within the word list, so the adapter alone reads every word. With the
dictionary installed, the first reading changes for **65 of 3,836 words** (`npx vite-node
scripts/probe-es-pipeline-diff.mts` lists each with its context): 41 are the characters' names (Reina, Sol, Rosa
written with a capital inside a sentence), 7 an adverb before *de* read as a preposition, the rest cases such as
*el joven*, *los trabajadores*, *de sobra*, *con mucho gusto*, *estaba dormido*. I read all 65 and judge them right
or defensible; a native speaker has not.

This probe exists because the first version of "dictionary readings beside the word list's" changed 124 words,
nearly all for the worse (*es* as the plural of the letter e, *para* as a form of *parar*, *doña Reina* as *reinar*)
— and the example-sentence measure, which looks at one marked word per sentence, could not see it. The context
rules now weigh readings by their standing: a dictionary reading beside a word-list reading needs a strong cue to
lead, and a certain one against a function word.

### 4.4 The word list against the dictionary

`npm run dict:compare-es` → `docs/spanish/DICTIONARY_REPORT.md`, `data/review/es/disagreements.json`. Of 1,701
entries at the time of the run, 98.7 % are a headword with a meaning of its own under a compatible part of speech.
45 differences are recorded, all open, none decided: missing 23 (20 of them filed by the dictionary only as a form
of another word), part of speech 4, gender 1 (`terminal`), meaning 12 (mostly synonyms; `moto` and `su` look real),
variety 4, inflection 1. Decisions belong in `data/review/es/resolutions.json`, by a person.

### 4.5 Honduran vocabulary from an independent source

`npx vite-node scripts/es-regional.mts` extracts every sense the dictionary labels for a region into a git-ignored
review file: **940 senses in 780 entries labelled Honduras** (476 entries where every sense is), 300 senses in 269
entries labelled Central America. Of the ten Honduran or Central American words in the hand list, seven carry a
matching label on some sense (`catracho`, `chele`, `cipota`, `cipote`, `lapicero`, `pisto`, `pulpería`); `baleada`,
`catracha` and `lempira` carry none. A label says Wiktionary's editors marked the sense for the region; it does not
say the word is current, polite, or unused elsewhere, and 77 of the Honduran senses are marked vulgar or
derogatory. This is material for a Honduran reviewer and for the authors of the Honduran readings, not a word list
to ship.

### 4.6 Real prose: five books planned, nothing imported (night of 2026-10-01, adapter 6)

Plain-text files of five books appeared in `data/sources/es-prose/` that evening (acquired by another tool; their
rights records are that tool's, see `docs/spanish/STATUS.md`). `npx vite-node scripts/probe-es-book.mts -- <file>`
runs a file through the quality check, the converter and the import **planner** with the installed dictionary and
counts where each word's first reading comes from. It writes nothing to any database and changes no file of theirs.

**What this measures: whether a word gets a reading, and from what. Not whether the reading is right.**

| book | words | chapters found | word list or rule on its lemmas | dictionary | rule on a dictionary lemma | guessed a name | other guess | nothing | "possibly" on the word sheet |
|---|---|---|---|---|---|---|---|---|---|
| Galdós, *Marianela* | 50,969 | 22 (`-I-`) | 80.96 % | 17.28 % | 0.37 % | 1.13 % | 0.19 % | 0.06 % | 3.98 % |
| Martí, *La edad de oro* | 66,816 | 7 (`--I--`), long ones divided | 84.57 % | 14.54 % | 0.05 % | 0.51 % | 0.16 % | 0.16 % | 3.70 % |
| Palma, *Tradiciones peruanas* | 47,998 | none found; 5 parts | 73.96 % | 23.92 % | 0.36 % | 0.85 % | 0.54 % | 0.37 % | 4.38 % |
| Cervantes, *Don Quijote* ¹ | 381,973 | 126 | 82.09 % | 16.45 % | 0.40 % | — | 0.98 % ² | 0.09 % | 3.71 % |
| Alarcón, *El capitán Veneno* ³ | 52,016 | 43 | 50.46 % | 21.49 % | 0.38 % | — | 8.75 % ² | 18.93 % | 12.11 % |

¹ run before the fix for old contractions and before names were counted apart. ² names included. ³ a 1920 American
school edition: the preface, notes, exercises and vocabulary are English (see below); the figures show what such a
source does, not how the pipeline reads Alarcón.

Time: 0.5 to 1.7 ms per word in Node on a machine four other sessions were using (*Don Quijote*: 489 s). That is
slower than the 1.5 s for a two-chapter book in the browser audit suggests per word; nobody has imported a whole
novel in the browser yet.

What the first run of *Marianela* showed, and what was done about each (all in commits of that night, with tests):

- **A pronoun after a conjugated verb** (`díjole`, `hallábase`, `detúvose`, `sentose`, `dijéronme`; with the older
  accent `oyóse`, `dióme`, `déme`) had no reading. The engine now reads verb + pronouns from the shape of the word:
  a guess (`unconfirmed`, 0.6 where the accent shows the joint, 0.5 where today's spelling writes none) that a
  dictionary entry for the same writing overrules and a dictionary lemma confirms; never offered beside a reading
  the word list vouches for (`fuese`, `paseos`); not for an unaccented `…os` (plural nouns); with its own grammar
  note. `se` alone no longer makes a tú command (`levántase` = *se levanta*); `se` + indirect object is split
  (`partiéndoseme`, `échesele`).
- **Italics written as `_word_`** (Project Gutenberg) made the word unreadable: an underscore at the edge of a word
  is now a mark of its own, for every language.
- **The dialogue dash written `--`** was not a dash for the context rules (`--pregunta Marvin` read as the noun) or
  for the sentence splitter.
- **Chapter headings** `-I-`, `--IV--` and Roman numerals above XXXIX (`Capítulo LII`) were not found.
- **A chapterless text was one document** of any size (48,000 words for Palma; a novel would be hundreds of
  thousands): a chapter above 120,000 characters is now divided into parts of about 60,000 at paragraph
  boundaries, with a note; not when one document was asked for.
- **Names** (`la Nela` 341 times, `Aldeacorba`, `Celipín`) were guessed as nouns or verbs from their endings, or
  got nothing: a word on no list written with a capital inside the sentence is now first guessed to be a name
  (a guess, 0.5, no meaning; the dictionary decides if it lists the word).
- **Old contractions** (`desta` 93 times in *Don Quijote*, `deste`, `della`) were read correctly alone but kept a
  guessed verb `destar` beside them, which the context rules put first after `se` or `que`: no guess stands beside
  them now.
- **Roman numerals in the text** (`Felipe II`, `siglo XIX`) had no reading: now a number with its value.
- **The quality check called an annotated school edition "usable"**: it now reports paragraphs that look like
  English — a warning from 5 % of the words, "not the book alone" (serious, the library refuses it) from 15 %. On
  the 27 Spanish files on disk that night it flags *El capitán Veneno* (17 %), *El sombrero de tres picos* (26 %)
  and *Platero y yo* (14 %, warning).

Dev split after these changes (the held-out splits were not run again; their figures above are for adapter 5):
single forms — lemma among the readings 99.19 %, features 99.84 %, guesses for other lemmas 93.45 %, first reading
99.50 %, attached pronouns 99.45 % (before: 99.14 / 99.89 / 93.47 / 99.43 / 99.48; the features figure fell because
forms such as `cábeme`, formerly unread, are now read as a statement where the dictionary's table calls them a
command); sentences — 96.22 % / 92.20 % / 81.85 % of 1,769 (before: 96.22 / 92.21 / 81.92).

Still unread or guessed in these books: names at the start of a sentence; archaic spellings (`fee`,
`encantamento`, `perfeción`, `válame`); foreign words; rare derivatives (`atrasadilla`, `pedrote`).

**For a person:** `--sample 150 --out data/review/es/generated/<book>-sample.tsv` writes 150 words, chosen by a
fixed hash, each in its sentence with the pipeline's first reading and an empty column. Three such files exist
locally (*Marianela*, *La edad de oro*, *Tradiciones peruanas*; git-ignored). None has been marked. Until someone
marks them there is no figure for correctness on a book.

## 5. What remains for the dictionary layer

- **A person's judgement**: the 45 recorded differences; the 65 changed readings in the course texts; the Honduran
  extract; the three 150-word samples from real books (4.6).
- **A real book, imported**: 4.6 plans five books and counts readings; no book has been imported into a learner's
  database and read in the browser, and no sample has been hand-checked.
- **Frequency**: the source has none. "Rare" in the difficulty preview still means "once in this text".
- **Re-analysis of a learner's own books** when a dictionary is installed or updated (today: on re-import only).
- **Size**: 57.7 MB of static files is acceptable for a hosted build and is fetched a shard at a time; a fully
  offline install would need all of it. Dropping the 687,460 inflected-form entries the rules already derive would
  roughly halve it, at the cost of the attestation that lets the dictionary *decide* a guess — not done.

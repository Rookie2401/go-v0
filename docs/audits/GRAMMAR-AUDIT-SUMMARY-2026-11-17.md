# Grammar audit of every language: summary, 2026-11-17 / 18

The owner's brief: "You are the grammar auditor. I want you to audit the linguistic content of each language. Be utterly
brutal. ... Note every possible missed feature and detail." and "Weigh all your findings up against what is displayed in
the GoLearn card."

Eleven packs were audited at master `985c742b`, each against what the card shows (the card's own parser, dictionary
lookup and table merge were run, not a copy of them). This page ranks them, lists the faults that are **shared by
several languages** (most of these sit in shared code, so one fix helps many packs), and says where each report is.

## 1. Where each language stands

Running text was written or quoted by the auditor for each language (about 500 to 1,100 words); "blank" is a machine
count, "wrong" is a hand count of readings shown as confirmed.

| Pack | Blank card | Wrong reading | State | Worst single fault |
|---|---|---|---|---|
| German | 0.9 % | under 2 % | Usable, short must-fix list | The guesser invents words (*dreihundert* = verb "dreihundern"); *Gehen Sie!* = "They go" |
| Spanish | 1.1 % | about 4 %, plus 22 invented lemmas in 613 words | Verb engine right, word list thin (1,812 lemmas) | Guesser (*la radio* = verb "radiar"); every participle glossed "-ing" |
| Hindi | 3.9 % | about 7 % | Word list sound | *जाना* "to go" shown as "knowing"; every past tense glossed "-ing" |
| Latin | 0 % | 5.6 % Vulgate, 11 % classical | Excellent look-up, not a teacher of forms | Case and number chosen by cell count: *Angelus Domini* = nominative plural |
| Hebrew (Bible, pointed) | 0 % | card = source for 96 % of the Tanakh | Good look-up | *בָּרָא* in Genesis 1:1 shown as an Aramaic noun; suffixes never explained |
| Hebrew (Modern) | 6.6 % | 14 % | Not ready | Unpointed ש "that" never cut off; *ירד* = "Jared" |
| Albanian | 5.7 % | about 7 % | Preview | Correct spelling "corrected" (*rritet* → "rritët"); half of everyday words unknown |
| Greek (Koine) | 4.5 % | about 7 % | Not what is claimed | The extension does not load the New Testament index |
| Greek (Modern) | 0.5 % | about 21 % | Not ready | Simple past has no tense (*έγραψα* = "I write"); *με* "with" = "I" |
| Thai | 1.1 % | about 9 % | Half sound | Word cutting; one fixed meaning per word (*ผม* always "I") |
| Biblical Aramaic | 0 % in its own verse | form line 1.6 %; **57 % of verb meanings** | Look-up table only | "blessed" shown as "kneeling"; breaks outside the exact bundled verse |
| Norwegian Bokmål | 7.1 % | about 8 % | Not fit for learners | The word list teaches non-words (*kallet*, *museumet*); no dictionary tables |
| Norwegian Nynorsk | 15.0 % | about 6 % | Not fit for learners | A thin copy of Bokmål; wrong imperatives, genders, neuters |

## 2. Faults shared by several languages

Each line names the languages where the audit saw it on the card.

1. **The card does not show the reading the analyser ranked first.** The analyser orders readings by the sentence
   (period, variety); the card then takes the highest confidence instead. Hebrew: Genesis 1:1 *בָּרָא* is Aramaic
   "field". Greek: Koine readings win in Modern, Attic and Homeric text, and a fix of 2026-11-13 is undone. This is in
   the shared card parser.
2. **The "All forms" merge of rules and Wiktionary creates conflicts that do not exist, and merges the wrong entry.**
   German: half of all adjective cells ("der göttliche" against "göttliche"); *Freundin* shows the table of *Freund*.
   Latin: every macron (*domini* against *dominī*). Albanian: 1,131 of 1,671 conflicts are only a leading *të*;
   *mikeshë* shows the table of *mik*. Spanish: *sobrina* shows the masculine plural first. Hindi: *बच्ची* uses the
   record of *बच्चा*. Hebrew: 1,489 "conflicts", almost all false. In every language a valid second form is shown as a
   conflict, and Wiktionary's cell wins even where it is the wrong one. Norwegian has no dictionary tables at all.
3. **The guesser for unknown words invents lemmas and never asks the dictionary**, which usually holds the word as a
   "form of" entry. German *dreihundern*, *einverstehen*; Spanish *radiar*, *ordar*, *colonio*, *cuidadosamentar*;
   Hindi *श्रीमना*, *भाइ*; Albanian "restores" ë into correctly spelled words; Norwegian calls any sentence-initial
   unknown word a person's name.
4. **The English meaning line is built by a shared generator that is wrong for whole classes of form.**
   - Participles and past forms glossed with "-ing": Spanish (*hecho* "doing"), Albanian (*Kam qenë* "being"), Hindi
     (*गया* "going"), Aramaic (all 44 passive participles).
   - Polite address glossed as third person: German (*Gehen Sie!* "They go"), Spanish (*Siéntese* "Let him, her, or it
     seat").
   - Past shown as present: Aramaic (387 of 394 perfects), Modern Greek (*είπε* "says").
   - Derived stems and voices keep the base verb's meaning: Hebrew (*וַיְבָרֶךְ* "And he knelt"), Aramaic, Albanian
     non-active, German Konjunktiv ("to have" for *hätte*).
   - Glosses conjugated as if they were verbs: Latin (*licet* "He, she, or it lawfuls"), Greek (*ἁγιασθήτω* "Let him,
     her, or it be koined form of ἁγίζω").
   - First and third person not told apart: Spanish (*Que Dios te bendiga* "first person"), Albanian (*Fëmija fle*
     "I sleep").
5. **The form line is not narrowed by the sentence, even where the card's own role line has decided.** Latin (a third
   of words), German (*zwei Museen*: "direct object" beside "nominative, accusative, dative or genitive"), Greek
   (*τό* always "accusative"), Norwegian (every class-1 verb "past tense or perfect participle"), Aramaic (24 % of
   words still list other readings in their own verse).
6. **One fixed reading for function words and homographs, shown as certain.** Thai (ที่, ของ, ผม, เย็น, ให้), Norwegian
   (*voksen* = "wax", *siden*, *fortsatt*), Albanian (*kisha* = "church", *një* = "one"), Spanish (*la* before a verb
   always "the"), Hindi (*की* = "doing", *कर* = "tax"), Modern Greek (*με*, *σε*), Modern Hebrew (*צריך* = "adversary").
7. **Text typed without its accents or points is not handled.** Spanish 0 of 16 (*anos*); Albanian repairs the wrong
   words; Hebrew without points matches the source for 71.5 % and is announced as Modern Hebrew; Greek elision and
   enclitic accents break matching.
8. **Pronunciation and romanisation lines come from letter rules, the scheme is not named, and the right reading in
   the pack's own dictionary is not used.** Norwegian (most of the commonest words wrong), Hindi (40 everyday verbs),
   Thai (three schemes mixed, no tone or length), Hebrew (a quarter of words: *אוֹר* "vor"), Greek (rough breathing
   lost; Modern digraphs wrong), German (notes attached to the wrong words).
9. **Numbers and abbreviations.** Compound numbers are blank or invented in German and Norwegian; abbreviations
   are blank, names or numbers in German, Norwegian, Spanish and Hebrew (*ש"ח* = "308").
10. **The dictionary line.** Wrong sense or word class first (Norwegian *fås* "few"; German *ja* "initialism of Junge
    Alternative für Deutschland"; Thai *พิซซ่า* second sense a section of the penal code); vulgar senses printed
    (German *gekocht* "cooked, fucked"); a redirect instead of a meaning (most Nynorsk verbs: "alternative form of
    koma").
11. **The frequency list is counted from the course's own texts.** Confirmed for Norwegian (51 texts, 12,478 words)
    and Albanian (49,043 of 74,643 words). Anything ranked by it rests on the course, not on the language. The other
    packs' files were not checked.
12. **The state before the full lexicon has loaded.** Latin, Hebrew and Greek ship a small core and load the rest; in
    that window up to 58 % of words are blank (Modern Greek and Modern Hebrew worst). How long the window lasts in the extension was not
    measured.
13. **What the pack says is not what the card does.** Greek claims the New Testament and does not load its index;
    Hebrew names Mishnaic Hebrew and has no data for it; Aramaic stores twelve review flags that never reach the card;
    Albanian prints "Sources disagree" on correct basic forms; Norwegian tables say no dictionary has been imported.
14. **The course's own sentences.** Norwegian "Barna spiller i hagen" (should be *leker*); Albanian A1 units use a bare
    man's name as subject (*Luan është*; correct *Luani*); Hindi Stage 0 teaches the habitual present beside
    progressive English; Latin uses the present with *cras*; Thai unit `th-b1-10` is misread by its own word list.

## 3. What to fix first, across languages

1. Make the card show the analyser's first reading (item 1). Small, shared, and it repairs Genesis 1:1.
2. Fix the table merge (item 2): compare after stripping articles, particles, macrons and stress marks; treat a second
   accepted form as a variant; never merge a word with another word's entry.
3. Replace the guesser's inventions with a look-up of the dictionary's "form of" entries (item 3).
4. Rework the English meaning-line generator (item 4): participles, polite forms, past tenses, derived stems, and
   never conjugate a gloss that is not a verb.
5. Print the case, number or tense the sentence has already decided (item 5).
6. Load the Greek New Testament index in the extension, or stop claiming it.
7. Then the per-language lists, in the order of section 8 of each report. Norwegian needs its word list rebuilt from a
   source before anything else is worth doing to it.

## 4. The reports

Each is on its own docs-only branch `audit/<language>-grammar-2026-11-17`, with its inputs, outputs and scripts beside
it in `docs/<language>/audit-2026-11-17/`.

| Language | Report | Written by |
|---|---|---|
| Norwegian (Bokmål, Nynorsk) | `docs/norway/GRAMMAR-AUDIT-2026-11-17.md` | the coordinating auditor |
| German | `docs/german/GRAMMAR-AUDIT-2026-11-17.md` | the coordinating auditor (tables read by cheaper reviewers, then checked) |
| Albanian | `docs/albanian/GRAMMAR-AUDIT-2026-11-17.md` | an audit agent |
| Hindi | `docs/hindi/GRAMMAR-AUDIT-2026-11-17.md` | an audit agent |
| Thai | `docs/thai/GRAMMAR-AUDIT-2026-11-17.md` | an audit agent |
| Spanish | `docs/spanish/GRAMMAR-AUDIT-2026-11-17.md` | an audit agent |
| Latin | `docs/latin/GRAMMAR-AUDIT-2026-11-17.md` | an audit agent |
| Greek | `docs/greek/GRAMMAR-AUDIT-2026-11-17.md` | an audit agent |
| Hebrew | `docs/hebrew/GRAMMAR-AUDIT-2026-11-17.md` | an audit agent |
| Biblical Aramaic | `docs/aramaic/GRAMMAR-AUDIT-2026-11-17.md` | an audit agent |

For every report written by an agent, the coordinating auditor re-ran between nine and sixteen of its main claims
through the card and they held, with one exception stated in the Hindi hand-over (a sentence of the coordinator's own,
not the agent's).

## 5. Limits

- Every auditor is a language model, not a native speaker, and nothing was looked up or downloaded. Forms an auditor
  was unsure of are marked "check" in the reports.
- "Wrong reading" figures are hand counts on text the auditors wrote or quoted from memory; treat them as indications.
- Nothing was seen in a browser. The card was reached through its parser, dictionary lookup and table merge in Node.
- In most languages the syntax, construction and writing-check layers were tested through sentences, not read line by
  line, and only a small part of the course material was read. Each report lists what it did not cover.
- The first version of the German report wrongly said German had no dictionary tables; it is corrected there.
- At master `985c742b` Russian and French have dictionary data but no analyser, and were not audited.

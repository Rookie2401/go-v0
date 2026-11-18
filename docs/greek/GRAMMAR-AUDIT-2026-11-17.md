# Greek grammar audit (Koine, Septuagint, Attic, Homeric and Modern Greek), 2026-11-17

Auditor: the Greek grammar-audit agent (an AI model, not a classicist and not a native speaker of Modern Greek). Code audited:
the shared clone at master `985c742b` (read-only; nothing in it was changed). Brief from the owner: audit the linguistic
content, be brutal, note every missed feature and detail, and weigh every finding against what the GoLearn card actually
shows. Nothing was looked up: every judgement of Greek below is from my own knowledge, and every quoted text was written out
from memory.

## 1. Verdict

Greek is not one pack. It is three unrelated data sets behind one card, and the card treats them very differently.

- **What the pack is.** There are no rules and no word list written here. Every reading is read off one of three indexes:
  (1) MorphGNT's reading of every word of the SBL Greek New Testament (5,461 lemmas, 18,056 forms); (2) the Wiktionary
  Ancient Greek tables (27,227 lemma rows, 660,208 forms; Attic unless the table header names another dialect); (3) the
  Wiktionary Modern Greek tables (33,174 lemma rows, 265,701 forms). A word no index holds gets a blank card: nothing is
  guessed. The sentence is used for one thing only, the period label ("Koine Greek", "Attic Greek" …). It never chooses a
  case, a gender, a person or between two words spelled alike.
- **The GoLearn extension does not have the New Testament index.** It carries a compiled "core" of 461 lemmas and loads only
  the Ancient and Modern tables (`LEXICON_SETS.el = ['el/ancient', 'el/modern']`; the built extension holds no Koine file).
  The full Koine index is loaded by Biblia and GoReview, not by the card this audit is about. Measured over the whole New
  Testament vocabulary in the extension's state: **6,456 of 18,056 forms (35.8 %) and 9,368 of 137,554 word tokens (6.8 %)
  get a blank card**; a further 12.7 % of tokens are read from the Attic or Modern tables, and for 2.3 % of all tokens that
  reading is another word than MorphGNT's (*πόθεν* is "to drink", *δίς* is "Zeus", *σκοτία* is the adjective "secret,
  clandestine"). In the Lord's
  Prayer five words are blank (*ὀφειλήματα, ὀφειλέταις, εἰσενέγκῃς, πειρασμόν, ῥῦσαι*). The project's own Scripture audit
  ("no reading 0.0 %") was run with an index the card does not have.
- **The card shows the reading with the highest confidence number, and a New Testament reading always has the highest.**
  The analyser carefully puts the readings of the sentence's period first; the card then ignores that order
  (`pick` in `parser/index.ts`). So in Modern Greek *με* ("with") is shown as the Koine pronoun *ἐγώ*, "I" (all 5
  occurrences in my text), and *σε* ("in") as *σύ*, "you"; *καιρός* ("weather") is "fitting season, opportunity"; *Τι κάνεις;*
  has *Τι* as *τις*, "any one, some one". In an Attic sentence *κόσμος* of a woman's jewellery is "the world, universe".
- **Nothing in the sentence decides a form.** *τό* is "accusative" whenever it is a subject (7 times in John 1:1–14 and the
  Lord's Prayer); *τοῦ* and *τῶν* are always "masculine" (*τοῦ φωτός, τοῦ ὕδατος, τοῦ ὀνόματος*); *παρέλαβον* in *οἱ ἴδιοι
  αὐτὸν οὐ παρέλαβον* is "1st person singular, I took"; *ἐλάλουν* in *ὅτε ἤμην νήπιος, ἐλάλουν* is "They were speaking". The
  orientation tells the learner the card shows the article and its noun agreeing.
- **Modern Greek, the course's default target, has the worst verb.** The simple past has no tense on the card and a present
  meaning: *έγραψα* is "active indicative, 1st person singular: I write"; *είπε* "says"; *είδα* "I see"; *ήρθαν* "They come".
  38,038 readings in the Modern index are in this state, and 26,680 more (the *να / θα* forms: *γράψω, φάω, έρθεις*) are
  plain "indicative". The article *το* is "accusative masculine"; every weak pronoun (*μου το έδωσε, της είπα, τον είδα*) is
  the article; *Σ' αγαπώ* is "the number 200" and *Μ' αρέσει* "40".
- **Two bugs spoil the Ancient form line and meaning line wholesale.** Every imperfect from a Wiktionary table is "imperfect
  or perfect" and every pluperfect "perfect or pluperfect" (a substring test: 39,874 + 14,047 readings). And where the
  index's gloss is a cross-reference, the card conjugates it: *ἁγιασθήτω* in the Lord's Prayer is **"Let him, her, or it be
  koined form of ἁγίζω"**; *φυλάττει* is "He, she, or it attics form of φυλάσσω"; *γινώσκουσί* is "They ionic"; *ἐτελείετο*
  in Iliad 1.5 is "was epicing form of τελέω".
- **The period label is unreliable and is recorded.** 5 of 17 New Testament sentences and 8 of 14 Septuagint sentences of my
  text are labelled "Attic Greek"; polytonic Modern Greek (everything printed before 1982) is "Attic"; a lone word is Modern,
  Attic or Koine depending on which word the learner looked up before it. The owner decided that Homeric, Classical and Koine
  are separate learning identities: the label that separates them is wrong for a third of ordinary Scripture sentences.
- **There are no grammar notes, no fixed phrases, no role in the sentence, no dictionary line and no course material** for
  Greek. The only "construction" on a card is its own form line repeated with "the pack has no separate explanation".
- **What is good.** Where the New Testament core has the word, lemma and form are MorphGNT's and mostly right, including
  hard forms (*ἀπεσταλμένος, ἐξῆλθεν, γένοιτο, ἔγνων, εἶπαν, ἤμην, ἀποκριθείς*). Diacritics are matched exactly, so *ὁ/ὅ,
  ἡ/ἥ/ἤ, εἰ/εἶ, εἰς/εἷς, ἐν/ἕν, ὤν/ὧν, αὐτή/αὕτη, ἀλλά/ἄλλα, πότε/ποτε, ἄρα/ἆρα, οὐ/οὗ* are all told apart. Precomposed and
  decomposed Unicode, tonos and oxia, grave and acute all reach the same entry. Greek numerals (*ιβʹ* = 12, *χξϛʹ* = 666)
  are read. Modern coverage is wide: 0 of 355 everyday words blank.

For a reader of the New Testament inside Biblia the pack is a usable parsing aid. On the GoLearn card it is a dictionary
look-up with a form line that is often wrong and a meaning line that is sometimes nonsense; for Modern Greek it mis-teaches
the past tense and the commonest function words.

## 2. How this was audited, and the numbers

1. Read the adapter: `el.ts` and all of `greek/` (`analyze`, `index-store`, `text`, `varieties`, `shards`, `morphgnt`,
   `tags`, `describe`, `word-analysis`, `paradigm`, `pronunciation`, `numbers`, `contractions`, `abbreviations` (first 70
   lines), `production` (first 40 lines)); the pack and the orientation; `docs/greek/*` and
   `docs/ecosystem/LANGUAGE-VARIETIES.md`; the card parser (`parser/index.ts`, `cardModel.ts`), `content/enrich.ts`,
   `lexicon/prepare.ts`, the part of `content/controller.ts` that builds the card, `language/resolve.ts` (the Greek part)
   and `store/index.ts` (`encounterVariety`).
2. **Set the test up as the extension is**, not as the project's own audits are: compiled Koine core + the Ancient and
   Modern shards of the sentence's words, loaded by the extension's own `createLexiconPreparer` (`setup.mts`). Two other
   states were run for comparison: core alone (shards failed), and "Biblia" (the full Koine index as well).
3. **The data instead of a form dump.** Greek has no generator, so there is nothing to dump form by form. I scanned the
   three built indexes mechanically (`scan.mjs`), read all 461 lemmas and glosses of the compiled core
   (`core-lemmas.txt`), and read the "All forms" tables the card builds for *λόγος, ἄνθρωπος, πόλις, βασιλεύς, λύω, γράφω*.
   The 993,307 Ancient and 523,185 Modern readings were **not** read.
4. Ran **the whole New Testament vocabulary** (18,056 forms, token-weighted by MorphGNT's own counts) through the
   analyser in the extension's state, context-free (`ntcover.mts`).
5. Ran **488 word-in-sentence probes** in five batteries (Koine 116, Attic 92, Homeric 42, Modern 114, spelling and
   Unicode 124), plus 20 on New Testament senses, 12 on misfiled forms, 15 on the declared variety, 65 on the
   pronunciation line, 17 printing every reading the analyser holds, 24 printing the whole card, and a test of the
   card's dependence on the previous lookup. Probes hit the wrong word once (*η* inside *Γιάννης*) and are ignored there.
6. Ran **1,034 words of running text** word by word (`cover.mts`), each register separately, then read the output and
   counted wrong readings by hand.
7. Checked **355 everyday Modern Greek words** (`core-mod.mts`) and re-ran the project's own 294 hand-read Modern words
   through the card (`goldmod.mts`).

Everything (inputs, outputs, scripts) is in `C:\Users\CJWal\dev\tmp-mem\elaudit\`.

**Running text, the extension's state** (`cover-ext.txt`). Texts: John 1:1–14, Matthew 6:9–13, John 3:16, 1 Corinthians
13:1–7; Genesis 1:1–5 and Psalm 22 (23) in the Septuagint; Iliad 1.1–10 and Odyssey 1.1–10; Anabasis 1.1.1–2 and Apology
17a; 199 words of my own Modern Greek (narrative, news, dialogue, article 1 of the human-rights declaration).

| Measure | Koine (NT) | Septuagint | Homeric | Attic | Modern |
|---|---|---|---|---|---|
| Words | 381 | 180 | 142 | 132 | 199 |
| Blank card | 17 (4.5 %) | 9 (5.0 %) | 6 (4.2 %) | 8 (6.1 %) | 1 (0.5 %) |
| Reading shown comes from: MorphGNT core / Ancient tables / Modern tables / rule | 335 / 26 / 3 / 0 | 140 / 28 / 3 / 0 | 58 / 76 / 2 / 0 | 75 / 47 / 2 / 0 | 22 / 0 / 172 / 4 |
| Wrong word or part of speech shown (hand count) | 7 | 3 | 11 | 4 | 23 |
| Right word, wrong form line (hand count) | 20 | 10 | 9 | 6 | 19, and about 22 objects called "nominative" |
| Wrong in all (hand count) | about 27 (7.1 %) | about 13 (7.2 %) | about 20 (14.1 %) | about 10 (7.6 %) | about 42 (21 %), or 64 (32 %) with the nominatives |
| Confidence under 0.5: the lookup is credited to the written form, not the lemma | 8 (2.1 %) | 6 (3.3 %) | 16 (11.3 %) | 12 (9.1 %) | 36 (18.1 %) |
| Sentences given the right period label | 12 of 17 (5 "Attic") | 6 of 14 (8 "Attic") | 5 of 6 (1 "Attic") | 6 of 6 | 25 of 25 |
| Blank card with the core alone (shards not loaded) | 45 (11.8 %) | 39 (21.7 %) | 81 (57.0 %) | 56 (42.4 %) | 115 (57.8 %) |
| Blank card with the full Koine index as well (Biblia's state) | 0 | 4 (2.2 %) | 5 (3.5 %) | 7 (5.3 %) | 1 (0.5 %) |

| Other measures | |
|---|---|
| New Testament vocabulary in the extension's state: blank | 6,456 of 18,056 forms (35.8 %); 9,368 of 137,554 tokens (6.8 %) |
| … read from the compiled core | 2,940 forms (16.3 %); 110,753 tokens (80.5 %) |
| … read from the Wiktionary tables with MorphGNT's lemma | 7,003 forms; 14,336 tokens (10.4 %) |
| … read from the Wiktionary tables with another lemma | 1,657 forms; 3,097 tokens (2.3 %) |
| Targeted probes: blank card | 31 of 488 (Koine 3, Attic 2, Homeric 1, Modern 3, spelling 22) |
| Everyday Modern words (355): blank / shown as a Koine word / Modern lemma not the word / confidence under 0.5 | 0 / 32 / 24 / 41 |
| The project's 294 hand-read Modern words: lemma right, analyser's first reading / the card | 281 (95.6 %) / 271 (92.2 %); 72 (24.5 %) under 0.5 |
| Ancient index: lemma rows with no meaning / headword written with length marks / meaning is a cross-reference | 4,722 / 3,851 / 2,245 of 27,227 |
| Ancient index: readings described "imperfect or perfect" / "perfect or pluperfect" | 39,874 / 14,047 |
| Modern index: past-tense readings with no tense / "dependent" readings not named | 38,038 / 26,680 of 523,185 |
| "All forms" table of *λύω* on a card for *λύω*: cells shown / cells once the augmented forms' shards are loaded | 713 / 777 |

The targeted probes were chosen to find faults; only the running-text and vocabulary rows are rates. The hand counts are
mine and could be off by a few either way. I counted a single wrong value as wrong and a list that contains the right value
as undecided; a nominative shown for a vocative of the same form was not counted.

## 3. What the card shows, and what is wrong with each part

| Part of the card | State | Section |
|---|---|---|
| Lemma, part of speech | MorphGNT's where the core has the word. Outside the core: the Attic or Modern headword, a dictionary headword with length marks (*πᾰ́σχω, θῡμός, Ᾰ̓́ῐ̈δης*), or another word. One verb is two or three lemmas (*γίνομαι / γίγνομαι, λέγω / εἶπον, πατήρ / πατέρας*) | 4.1, 4.2, 4.9 |
| Form line | Never uses the sentence. Article and neuter nouns wrong by rule; "imperfect or perfect"; Modern past with no tense; Wiktionary participles lose case, number or gender; duals preferred to datives and neuter plurals | 4.3, 4.4 |
| Own meaning | Dodson's first gloss for the core (mostly sound, some odd firsts); Wiktionary's first gloss elsewhere, which is often a cross-reference and is then conjugated into nonsense; plural pronouns are "I" | 4.5 |
| Other readings | Up to three, as lemma + part of speech + meaning only: the form of an alternative is never shown (from the card model), so "ὁ, determiner, the" appears three times | 4.3 |
| Period line | Wrong for a third of Scripture sentences; depends on the previous lookup; the note beside it prints raw codes ("Variety: el-koi.") that can contradict it | 4.6 |
| Variants tab | Rows depend on which shards happen to be loaded: *ἡμῶν* → *ἐγώ*: "Attic Greek: not in our sources (no Ancient Greek entry has this headword)". *είναι*: "Attic Greek: εἶμαι" | 4.6 |
| Dictionary meaning | None: the pack declares no dictionary for Greek | 4.5 |
| Elision, crasis, numerals | A closed list of elided stems works; the rest is blank or a numeral; crasis mostly blank or wrong | 4.7 |
| "All forms" table | Not generated: read off whatever is loaded. Incomplete by design of the loader, three periods in one table, duplicate rows, other words' forms in the cells, and a note that says the opposite of the truth | 5 |
| Grammar notes | None exist. Each card lists its own form line as a "construction" with "the pack has no separate explanation" | 4.10 |
| Fixed phrases, role in the sentence | None exist | 4.10 |
| Pronunciation line | Reconstructed Koine for every ancient word (also Homer and Plato), Erasmian and Modern in the notes. No stress. Rough breathing lost on diphthongs; *αυ / ευ*, *μπ / ντ / γκ* and accented vowel pairs wrong in Modern | 4.11 |

## 4. Findings on the card

Every row below was seen in the probe or running-text output in the extension's state. "The card shows" is the reading the
card puts on top.

### 4.1 Blank card

**New Testament words the extension cannot read** (they are in the full Koine index, which it does not load). From the
running text: *ἀληθινόν* (John 1:9); *ὀφειλήματα, ὀφειλέταις, εἰσενέγκῃς, πειρασμόν, ῥῦσαι* (the Lord's Prayer);
*ἀλαλάζον, προφητείαν, μεθιστάναι, ψωμίσω, καυχήσωμαι, μακροθυμεῖ, χρηστεύεται, περπερεύεται, φυσιοῦται, ἀσχημονεῖ,
παροξύνεται* (1 Corinthians 13). From the vocabulary run, the commonest blank forms (New Testament count in front):
18 *προσκαλεσάμενος*, 17 *ἐπαύριον*, 16 *διακονίαν*, 16 *συνείδησιν*, 14 *ἐπετίμησεν*, 13 *ὑποκριταί*, 11 *θυσιαστηρίου*,
11 *Ἰορδάνου*, 11 *πειρασμόν*, 10 *σταυρόν*, 10 *γρηγορεῖτε*, 9 *μετενόησαν*, 9 *πτωχοῖς*, 9 *ἀπώλειαν*, 8 *Ἔφεσον*
(`ntcover-blank.txt`, 6,456 forms). From the probes: *ἐξεληλυθυῖαν, μαθητεύσατε, σεσῳσμένοι, ταλιθα*.

**Septuagint** (no Septuagint text is indexed; the variety note says Koine is "the Greek of the New Testament and the
Septuagint"): *ποιμαίνει, ἐξέθρεψέν, ἐπέστρεψεν, τρίβους, πορευθῶ, θλιβόντων, ἐλίπανας, κατοικεῖν, μακρότητα* in Psalm 22.

**Homer:** *μυρί᾽, ἄλγε᾽, ἔφατ᾽* (elided, see 4.7), *νοῦσον* (Ionic for νόσον), *ἔπερσεν, ἀρνύμενος, ἐρρύσατο*.

**Attic:** *Παρυσάτιδος, Καστωλοῦ, Παρράσιον* (names); *ἠσθένει, ὑπώπτευε, ἐπελαθόμην, ἐψεύσαντο, ἐξαπατηθῆτε* (ordinary
augmented and compound verb forms in the first sentences of the Anabasis and the Apology); *λυθέντος* (the genitive of the
aorist passive participle of *λύω*, the textbook verb: a participle's oblique cases are in the index only when Wiktionary
gives the participle an entry of its own).

**Modern:** *προικισμένοι* (article 1 of the human-rights declaration), *μέιλ*; the year *1821* (digits are not words).

**Spelling:** see 4.8 (final sigma written σ, lunate sigma, iota adscript, thousands in Greek numerals).

### 4.2 Wrong word shown as the reading

**(a) A Koine reading wins in a Modern sentence** (the analyser's own first reading is the Modern one; the card overrides
it because the MorphGNT reading has confidence 0.9 against 0.42–0.76). *Θα σε πάρω τηλέφωνο* has *σε* as the pronoun,
rightly, but with the Koine lemma *σύ*.

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| Έφαγα ψωμί με τυρί. / Πήγα με τον αδελφό μου. / Σύμφωνα με τον υπουργό | με | *ἐγώ*, pronoun, "personal, accusative singular", meaning "I" | με, preposition, "with" |
| δουλεύει σε ένα νοσοκομείο / Μένω σε ένα μικρό χωριό. | σε | *σύ*, pronoun, "you" | σε, preposition, "in, at" |
| Τι κάνεις; / Τι ώρα είναι; | Τι | *τις*, "interrogative or indefinite", meaning "any one, some one" | τι, "what" |
| Ο καιρός ήταν καλός. | καιρός | "fitting season, opportunity, time" | "weather" |
| η μητέρα της είναι άρρωστη | μητέρα | *μήτηρ*, "accusative feminine singular" | μητέρα, nominative |
| each alone | πατέρας, τρία, μηδέν, Δευτέρα, Τρίτη, πολύ, πάντα, θέλω, γράφω, βλέπω, καλός, χρόνος, θάλασσα | *πατήρ*; *τρεῖς*; *μηδείς* "no one, nothing"; *δεύτερος* "second"; *τρίτος* "third"; the rest with the Koine lemma and Dodson's gloss | Modern words; Δευτέρα and Τρίτη are Monday and Tuesday; μηδέν is "zero" |
| on the project's own gold | σε ×6, με ×3, πλέον | *σύ*, *ἐγώ*, *πολύς* | the three the project's fix of 2026-11-13 was written for: the fix reorders the readings and the card does not use the order |

**(b) A New Testament sense wins in a Classical sentence.**

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| ὁ κόσμος τῆς γυναικὸς χρυσοῦς ἦν. | κόσμος | "the world, universe" | "ornament, adornment" |
| ἡ δόξα τῶν πολλῶν οὐκ ἀληθής ἐστιν. | δόξα | "honor, renown, glory splendor" | "opinion" |
| ἡ ἁμαρτία τοῦ τοξότου μεγάλη ἦν. | ἁμαρτία | "a sin" | "miss, error" |
| ὁ ἄγγελος τὴν νίκην ἀπήγγειλεν. | ἄγγελος | "an angel, messenger" | "messenger" |
| χάριν ἔχω σοι τῶν δώρων. | χάριν | "grace, favor, kindness" | "thanks, gratitude" |

And the reverse in New Testament sentences, for words outside the core:

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| πειρασθῆναι ὑπὸ τοῦ διαβόλου (Matthew 4:1) | διαβόλου | adjective, "slanderous; libellous" | "the devil" |
| μετανοεῖτε καὶ πιστεύετε ἐν τῷ εὐαγγελίῳ (Mark 1:15) | μετανοεῖτε | "present active indicative: You (plural) perceive afterwards or too late" | imperative: "Repent" |
| βάπτισμα μετανοίας εἰς ἄφεσιν ἁμαρτιῶν | ἄφεσιν | "letting go, dismissal" | "forgiveness" |
| ὁ σταυρὸς τοῦ Χριστοῦ | σταυρὸς | "cross (geometrical figure)" | "cross" |
| μακάριοι οἱ πτωχοὶ τῷ πνεύματι | πτωχοὶ | "beggar; one who crouches and cringes" | "the poor" |
| οὐ φοβηθήσομαι κακά (Psalm 22) | φοβηθήσομαι | "I will be put to flight" | "I will fear" |
| ὁ δὲ Ἰησοῦς ἐβαπτίσθη ὑπὸ Ἰωάννου | ἐβαπτίσθη | "He, she, or it was dipped" (this one is the core's own first gloss) | "was baptized" |

**(c) Another word altogether.** Ties between readings are settled by the order the indexes were loaded in (from the code);
nothing in the sentence is consulted.

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| καὶ τὸ φῶς ἐν τῇ σκοτίᾳ φαίνει, καὶ ἡ σκοτία αὐτὸ οὐ κατέλαβεν. | σκοτίᾳ, σκοτία | *σκότιος*, adjective, "secret, clandestine" | σκοτία, noun, "darkness" |
| καὶ τὸ σκότος ἐκάλεσεν νύκτα. (Genesis 1:5) | σκότος | *Σκώτος*, Modern Greek, "Scot, Scottish man" | σκότος, "darkness" |
| καὶ τὸ ἔλεός σου καταδιώξεταί με (Psalm 22) | ἔλεός | *ἐλεός*, "kitchen table" | ἔλεος, "mercy" |
| γέγονα χαλκὸς ἠχῶν | ἠχῶν | *ἠχώ*, noun, genitive plural, "echo" | participle of ἠχέω, "sounding" |
| οὐ ζηλοῖ ἡ ἀγάπη | ζηλοῖ | *ζῆλος*, noun, "nominative or vocative plural" | ζηλόω, 3rd singular, "envies" |
| οὐ χαίρει ἐπὶ τῇ ἀδικίᾳ | ἀδικίᾳ | *Ἀδικία*, a name, "Adikia" | ἀδικία, "injustice" |
| πάντα στέγει | στέγει | *στέγος*, noun, "nominative dual", "roof" | στέγω, 3rd singular, "bears" |
| εἰδῶ τὰ μυστήρια πάντα | μυστήρια | *μυστήριο*, Modern Greek, "nominative plural" | μυστήριον, accusative plural |
| δεῖ ὑμᾶς γεννηθῆναι ἄνωθεν. | δεῖ | *δέω*, "He, she, or it binds" | "it is necessary" (the index files δεῖ under δέω, "I bind") |
| ἐν ᾧ ταῦτα ἔλεγεν, ἧκεν ὁ ἄγγελος. | ἧκεν | *ἵημι*, aorist, "released" | ἥκω, "had come" (a true homograph; no second reading of ἥκω is offered first) |
| ὁ μὲν οὖν πρεσβύτερος παρὼν ἐτύγχανε (Anabasis) | παρὼν | *παρών*, noun, "a kind of light boat" | participle of πάρειμι, "being present" |
| Κῦρον δὲ μεταπέμπεται | Κῦρον | *κύρω*, verb, "present active participle, neuter", "hitting upon" | Κῦρος, accusative |
| ἄρχοντα δὲ αὐτῶν Ξενίαν Παρράσιον | Ξενίαν | *ξένιος*, adjective, "pertaining to hospitality" | Ξενίας, a name (hard) |
| ὡς χρῆν ὑμᾶς εὐλαβεῖσθαι (Apology) | χρῆν | *χράω*, "present active infinitive: to fall upon" | imperfect of χρή, "it was necessary" |
| Σωκράτης φιλόσοφος ἦν. | φιλόσοφος | adjective, "scientific" | noun, "philosopher" |
| ἐν πόντῳ πάθεν ἄλγεα / ἐπὶ οἴνοπα πόντον | πόντῳ, πόντον | *Πόντος*, a name, "Pontus (a sea god)" | πόντος, "sea" |
| ἀφείλετο νόστιμον ἦμαρ | νόστιμον | noun, "resin from galbanum" | adjective, "of the homecoming" |
| λιπὼν περικαλλέα λίμνην | λιπὼν | *λίπος*, noun, genitive plural, "fat, tallow" | aorist participle of λείπω |
| ἱέμενός περ | περ | *περί*, preposition, "[with genitive]" | περ, enclitic particle |
| ὣς ἔφατο / ἀλλ᾽ οὐδ᾽ ὣς ἑτάρους ἐρρύσατο | ὣς | *ὡς*, conjunction, "as, like as, how" | ὥς, adverb, "thus, so" |
| αἴ κέ ποθι Ζεὺς δῷσι | αἴ | interjection, "expresses astonishment or grief" | αἰ = εἰ, "if" |
| ὃ γὰρ βασιλῆϊ χολωθείς / πολλὰ δ᾽ ὅ γ᾽ ἐν πόντῳ | ὃ, ὅ | *ὅς*, "relative, accusative neuter singular" | ὁ as a pronoun, nominative masculine, "he" |
| ὃν κατὰ θυμόν / ἥν τε ψυχήν | ὃν, ἥν | relative pronoun | possessive ὅς, "his own" |
| Η κυβέρνηση ανακοίνωσε νέα μέτρα. / τα μέτρα δεν είναι αρκετά | μέτρα | *μετράω*, verb, "active imperative: Count!" | μέτρο, noun plural, "measures" |
| Σύμφωνα με τον υπουργό | Σύμφωνα | *σύμφωνο*, noun, "consonant" | σύμφωνα με, "according to" |
| συνάντησα τη φίλη μου | φίλη | *φίλος*, adjective, "friendly", nominative | φίλη, noun, accusative |
| ήπια έναν καφέ | καφέ | *καφέ*, "brown, coffee (color)" | καφές, noun, accusative |
| Τη Δευτέρα έχω μάθημα. | Δευτέρα | *δεύτερος*, adjective, "second" | Δευτέρα, "Monday" |
| ΕΞΟΔΟΣ ΚΙΝΔΥΝΟΥ | ΕΞΟΔΟΣ | *Έξοδος*, a name, "Exodus (a book of the Bible)" | έξοδος, "exit" |
| Αγόρασα έναν καινούργιο υπολογιστή | υπολογιστή | "genitive singular", "self-seeker, selfish person" | accusative; "computer" |
| each alone | άλογο, λεπτό, μόνο, κοντά, γεια, μεγάλος | *άλογος* "illogical, irrational"; *λεπτός* "thin"; *μόνος*; *κοντός* "short"; *υγεία* "health"; *μέγας* | "horse"; "minute"; "only"; "near"; "hello"; μεγάλος |
| Εν τάξει / Δόξα τω Θεώ | τάξει, Θεώ | *τάξις*, "nominative dual"; *θεός*, "nominative dual", "a deity" | datives singular in two everyday phrases |
| μαράνα θά. | μαράνα | *μαραίνω*, Modern Greek, "I wither" | Aramaic, "our Lord, come" |
| τετέλεσται. (John 19:30) | τετέλεσται | Modern Greek interjection, "a dramatic pronouncement of impending death", period "Modern Greek" | perfect passive of τελέω, "it is finished" |

From the vocabulary run, the commonest New Testament forms read as another word (`ntcover-other-lemma.txt`): 36 *καλῶς* →
adjective *καλός*; 29 *πόθεν* → *πίνω* "to drink"; 18 *ἀληθῶς* → adjective *ἀληθής*; 16 *ἀρνίου* → Modern *αρνί*; 12
*στέφανον* → the name *Στέφανος*; 10 *ὄντως* → *ὤν*; 8 *ἀδελφή* → adjective *ἀδελφός* "brotherly or sisterly"; 8 *νικῶν* →
noun *νίκη*; 7 *Ἰωνᾶ* → *Ἴων* "one of the Ionians"; 6 *δίς* → *Ζεύς*; 6 *ἱνατί* → Modern *γινάτι* "stubbornness"; 6
*ἀπαρχή* → Modern *απαρχή* "beginning, origin". Every adverb in -ως outside the core is its adjective.

### 4.3 Right word, wrong form line: nothing in the sentence is used

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| ἡ ζωὴ ἦν τὸ φῶς / τὸ φῶς ἐν τῇ σκοτίᾳ φαίνει / ἦν τὸ φῶς τὸ ἀληθινόν / ἁγιασθήτω τὸ ὄνομά σου / γενηθήτω τὸ θέλημά σου / τὸ πνεῦμά ἐστιν τὸ ζῳοποιοῦν | τὸ | "definite article, accusative neuter singular" | nominative. *τό* is accusative on every card (0.77 against 0.65, by New Testament counts) |
| περὶ τοῦ φωτός / ἐπάνω τοῦ ὕδατος / ἕνεκεν τοῦ ὀνόματος / τοῦ σκότους | τοῦ | "genitive masculine singular" | neuter |
| τῶν ἡμερῶν ἐκείνων / ἡ δόξα τῶν γυναικῶν / ὑπὲρ τῶν προβάτων | τῶν | "genitive masculine plural" | feminine; feminine; neuter |
| τῷ πνεύματι / τοῖς τέκνοις | τῷ, τοῖς | "dative masculine singular"; "dative masculine plural" | neuter |
| τὰ τέκνα παίζει ἐν τῇ ὁδῷ. | τὰ | "accusative neuter plural" | nominative |
| ὄνομα αὐτῷ Ἰωάννης / ἁγιασθήτω τὸ ὄνομά σου / γενηθήτω τὸ θέλημά σου | ὄνομα, ὄνομά, θέλημά | "accusative neuter singular" | nominative (subjects) |
| παραδῶ τὸ σῶμά μου / εἶδεν ὁ θεὸς τὸ φῶς / ἐκάλεσεν ὁ θεὸς τὸ φῶς ἡμέραν | σῶμά, φῶς | "nominative neuter singular" | accusative (objects) |
| πάντα δι᾽ αὐτοῦ ἐγένετο / ἄλλα δὲ ἔπεσεν | πάντα, ἄλλα | "accusative neuter plural" | nominative |
| ὃ φωτίζει πάντα ἄνθρωπον | πάντα | "accusative neuter plural" | accusative masculine singular |
| ὃ γέγονεν / τὸ φῶς … ὃ φωτίζει | ὃ | "relative, accusative neuter singular" | nominative |
| οἱ ἴδιοι αὐτὸν οὐ παρέλαβον. | παρέλαβον | "aorist active indicative, 1st person singular", "I took" | 3rd person plural, "they received" |
| ὅτε ἤμην νήπιος, ἐλάλουν ὡς νήπιος. | ἐλάλουν | "3rd person plural", "They were speaking" | 1st person singular |
| εἷλον τὴν πόλιν οἱ Λακεδαιμόνιοι. | εἷλον | "1st person singular", "I took" | 3rd person plural |
| τὸν υἱὸν τὸν μονογενῆ ἔδωκεν | μονογενῆ | "nominative neuter plural" | accusative masculine singular |
| ἀνὰ μέσον τοῦ σκότους | σκότους | "accusative plural" | genitive singular |
| ἐὰν παραδῶ τὸ σῶμά μου | παραδῶ | "3rd person singular", "He, she, or it may hand over" (the core holds only *παραδῷ*; the iota subscript is dropped to match) | 1st person singular |
| ἄνθρωπος φύσει πολιτικὸν ζῷον. | φύσει | "nominative dual" | dative singular |
| χαλεπὰ τὰ καλά. | χαλεπὰ | lemma *χᾰλεπός*, "accusative or nominative or vocative feminine dual", no meaning | neuter plural of χαλεπός, "hard" |
| ταὐτὰ λέγει ἀεί. | ταὐτὰ | "nominative feminine dual" | neuter plural, "the same things" |
| κατὰ βοῦς Ὑπερίονος Ἠελίοιο ἤσθιον | βοῦς | "nominative singular" | accusative plural |
| ἴδεν ἄστεα / πάθεν ἄλγεα / ἱερὸν πτολίεθρον ἔπερσεν / ἑλώρια τεῦχε / ἀφείλετο … ἦμαρ | ἄστεα, ἄλγεα, πτολίεθρον, ἑλώρια, ἦμαρ | "nominative" | accusative (objects) |
| τίς τ᾽ ἄρ σφωε θεῶν … ξυνέηκε | σφωε | "nominative dual" | accusative dual |
| γίγνονται παῖδες δύο | παῖδες, δύο | "vocative plural"; "accusative masculine plural" | nominative |
| λαβὼν Τισσαφέρνην ὡς φίλον | φίλον | "nominative neuter singular", "that which is loved" | accusative masculine, "as a friend" |
| πλείους ἦσαν οἱ πολέμιοι | πλείους | "accusative feminine plural, comparative" | nominative masculine |
| Μῆνιν ἄειδε θεά | ἄειδε | "imperfect or perfect active indicative, 3rd person singular", "He, she, or it was singing" | present imperative, "sing" (the first verb of the Iliad) |
| τῶν πολεμίων προσιόντων οἱ πολῖται ἔφυγον. | προσιόντων | "present active imperative, 3rd person plural", "Let them approach" | genitive plural participle (genitive absolute) |
| το πρωί / από το σπίτι / το λεωφορείο / το Σάββατο / Μου το έδωσε | το | *ο*, "accusative masculine singular" | neuter (and a pronoun in the last) |
| ένα ραντεβού / σε ένα νοσοκομείο | ένα | "accusative masculine" | neuter |
| νέα μέτρα | νέα | "nominative feminine singular", "young, youthful" | accusative neuter plural, "new" |
| στο κέντρο / από το σπίτι / για την οικονομία / στην αγορά / τη δουλειά μου, and about 17 more | the noun | "nominative singular" (or plural) | accusative |

**Participles.** From MorphGNT the card names the verb and the participle's own case, gender and number
(*ἀπεσταλμένος*: "perfect passive participle, nominative masculine singular"). From the Wiktionary tables it does not:

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| αἱ γυναῖκες τοὺς ἄνδρας ὁρῶσαι ἔφυγον. | ὁρῶσαι | *ὁράω*, form line "plural", meaning "to look with the eyes" | present active participle, nominative feminine plural |
| κατὰ δάκρυ χέουσα | χέουσα | "singular", "to pour" | present participle, nominative feminine singular |
| τὸν δ᾽ ἀπαμειβόμενος προσέφη | ἀπαμειβόμενος | "present participle, masculine plural" | nominative masculine singular |
| ὃ γὰρ βασιλῆϊ χολωθεὶς / ποτήριόν σου μεθύσκον / ἱέμενός περ | χολωθεὶς, μεθύσκον, ἱέμενός | "aorist passive participle, masculine"; "present active participle, neuter"; "present middle or passive participle, masculine" | case and number missing |
| διαστήτην ἐρίσαντε | ἐρίσαντε | lemma *ἐρίσας* (the participle itself), no meaning | ἐρίζω |
| Η πόρτα είναι κλεισμένη. | κλεισμένη | lemma *κλεισμένος*, verb, "singular" | participle of κλείνω, nominative feminine singular |

**The form of an alternative reading is not shown.** *τοῖς* in *τοῖς στρατιώταις*: "43 other readings possible even with
the sentence"; the three listed are "ὁ, determiner, the", "ὁ, determiner, the", "ὁ, pronoun, that". The learner cannot see
which is the neuter.

### 4.4 Tense, aspect and mood labels

**Ancient Greek: "imperfect or perfect".** `headerFeatures` in `tags.ts` tests whether the table header contains each tense
name in turn; "imperfect" contains "perfect" and "pluperfect" contains "perfect".

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| ὁ δοῦλος ἔλυε τὸν ἵππον. | ἔλυε | "imperfect or perfect active indicative, 3rd person singular" | imperfect |
| ἐλελύκει τοὺς δεσμώτας. | ἐλελύκει | "perfect or pluperfect", meaning "He, she, or it has loosed" | pluperfect, "had loosed" |
| ἐβούλετο τὼ παῖδε ἀμφοτέρω παρεῖναι / παρὼν ἐτύγχανε / ἑλώρια τεῦχε κύνεσσιν / προσέφη πόδας ὠκὺς Ἀχιλλεύς / ἔπεα πτερόεντα προσηύδα | ἐβούλετο, ἐτύγχανε, τεῦχε, προσέφη, προσηύδα | "imperfect or perfect" | imperfect |

**Modern Greek: the past tense is not named, and the meaning is a present.** Wiktionary tags the simple past "past,
perfective" and the *να / θα* form "dependent, perfective". The adapter maps neither "past" nor "dependent"; "perfective"
becomes an aspect that the form line does not print.

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| Χθες έγραψα δύο γράμματα. | έγραψα | "active indicative, 1st person singular", "I write" | simple past, "I wrote" |
| Μου είπε ότι … | είπε | "active indicative, 3rd person singular", "He, she, or it says" | "said" |
| Είδα τον Γιάννη. / Δεν βρήκα τα κλειδιά. / αποφάσισα να πάω / Της απάντησα | Είδα, βρήκα, αποφάσισα, απάντησα | "I see", "I find", "I decide", "I reply" | "saw", "found", "decided", "replied" |
| Ήρθαν αργά το βράδυ. | Ήρθαν | "passive indicative, 3rd person plural", "They come" | "they came" |
| Το βιβλίο γράφτηκε το 1950. | γράφτηκε | "passive indicative", "He, she, or it is written" | "was written" |
| Χάρηκα πολύ. | Χάρηκα | "I am happy" | "I was glad" |
| Χθες το πρωί ξύπνησα νωρίς | ξύπνησα | "1st person singular", meaning "to awake, wake up" | "I woke up" |
| Έφαγα ψωμί / Θέλω να φάω κάτι. | Έφαγα, φάω | lemma *τρώγω*, meaning "I alternative form of τρώω" | τρώω: "I ate"; "(to) eat" |
| ήπια έναν καφέ | ήπια | "I drink (water" | "I drank" |
| βγήκα από το σπίτι | βγήκα | "perfect active indicative", "I have gone out" | simple past, "I went out" |
| οι τιμές θα ανέβουν ξανά | ανέβουν | "perfect active indicative", "They have gone up" | "(will) go up" |
| έκανε λίγο κρύο / Τι κάνεις; | έκανε, κάνεις | "imperfect or perfect …", "was doing"; "present or perfect …" | past; present |
| οφείλουν να συμπεριφέρονται | οφείλουν | "present or imperfect or perfect active, 3rd person plural" | present |
| Αύριο θα γράψω / Έχω γράψει / να αγοράσω / να τελειώσω / θα σε πάρω / Ας τα πούμε / θα μειωθούν | γράψω, γράψει, αγοράσω … | "active indicative", "I write", "He, she, or it writes", "I buy" … | the perfective non-past: it exists only after να, θα, ας, and in the perfect |

"perfect" here comes from a Wiktionary table header (6,807 Modern readings), "imperfect or perfect" from the header
"imperfective" by the same substring fault. The aspect pair, the first thing a learner of the Modern verb needs, is
invisible: *γράφω* and *γράψω* are both "I write".

**Deponents and passives.** *Πλένομαι*: "I am washed (your body". *κοιμάμαι, θυμάμαι, φοβάμαι, σκέφτομαι* in the first
person: no form line at all. *ἔστη ἐν μέσῳ αὐτῶν*: "He, she, or it caused to stand" (stood). *ὠφελοῦμαι*: "present middle
or passive", meaning "I help" (I am profited). *ὀλέκοντο δὲ λαοί*: "They were killing" (were perishing). *ἀφίενταί σου αἱ
ἁμαρτίαι*: "They are sent away" (are forgiven).

### 4.5 The meaning line

**(a) A cross-reference conjugated as if it were a verb's meaning.** 2,245 Ancient and 2,667 Modern lemma rows have a
gloss of the kind "Epic form of …"; the card's verb-meaning builder inflects it.

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| ἁγιασθήτω τὸ ὄνομά σου (the Lord's Prayer) | ἁγιασθήτω | "Let him, her, or it be koined form of ἁγίζω" | "may it be hallowed" |
| ὁ νεανίας τὴν πόλιν φυλάττει. | φυλάττει | "He, she, or it attics form of φῠλᾰ́σσω" | "guards" |
| γινώσκουσί με τὰ ἐμά. | γινώσκουσί | "They ionic" | "they know" |
| Διὸς δ᾽ ἐτελείετο βουλή | ἐτελείετο | "He, she, or it was epicing form of τελέω" | "was being fulfilled" |
| Ἄνδρα μοι ἔννεπε, Μοῦσα | ἔννεπε | "Epic!" | "tell" |
| ἔριδι ξυνέηκε μάχεσθαι | ξυνέηκε | "He, she, or it olded Attic form of συνίημι" | "brought together" |
| πεδίον ἁθροίζονται | ἁθροίζονται | "They old Attic form of ἀθροίζω (athroízō" | "they muster" |
| Έφαγα / φάω | | "I alternative form of τρώω" | |
| κἀγὼ ἀναπαύσω ὑμᾶς. | κἀγὼ | "to also, too" (the gloss "I also, I too" is taken for a verb citation) | "and I, I too" |

**(b) A cross-reference as the whole meaning** (not a verb): *Πηληϊάδεω* "Epic form of Πηλείδης"; *Ἀχιλῆος* "alternative
form of Ἀχιλλεύς"; *Ἀτρεΐδης, Τροίης, ἑτάρους, ἀτασθαλίῃσιν, Ἠελίοιο, νηυσί* likewise; *νεώς* "Attic prose form of ναός";
*κἄν* "crasis of καὶ and ἄν"; *ταὐτά* "Attic form of αὐτός by crasis with ὁ"; *δεν* "alternative form of δεν"; *πάω*
"alternative form of πηγαίνω"; *αυτί, περπατάω, πουλάω, μιλάω* likewise. In the index: *φῶς* = "Attic form of φάος",
*θέλω* = "alternative form of ἐθέλω", *βίβλος* = "Attic form of βύβλος".

**(c) No meaning, because the lemma is the dictionary's second row for the word.** 3,088 Ancient words are two lemma rows,
one headword with length marks and no gloss (*κύων / κῠ́ων, δύο / δῠ́ο, νίκη / νῑ́κη, χώρα / χώρᾱ*). The card showed:
*πολύτροπον* → *πολῠ́τροπος*; *πάθεν* → *πᾰ́σχω*; *θυμόν* → *θῡμός*; *ὄλοντο* → *ὄλλῡμῐ*; *Ἄϊδι* → *Ᾰ̓́ῐ̈δης*; *Δαρείου* →
*Δᾱρεῖος*; *τριακοσίους* → *τρῐᾱκόσῐοι*; *κράτιστον* → *κρᾰ́τῐστος*; *φησί* → *φημῐ́*; *ξυνέγραψε* → *ξυγγρᾰ́φω*; *πέτρᾳ* →
*πέτρᾱ*; *χαλεπά* → *χᾰλεπός*; *θανάτω* → *θᾰ́νᾰτος*; *κρεῖσσον* → *κρείσσων*, each with an empty meaning line. The learner's
record then holds *lemma:el:πᾰ́σχω* beside *lemma:el:πάσχω*. In all 4,722 Ancient lemma rows have no gloss (among them
*αἴρω*).

**(d) Plural pronouns are "I".** *ἡμῶν, ἡμῖν, ἡμεῖς, ἡμᾶς* (10 times in the Lord's Prayer and John 1:14): lemma *ἐγώ*,
meaning "I". Correct: "of us / our", "to us", "we", "us". *Μου το έδωσε, μαζί μου* (Modern): *ἐγώ*, "I". *σεαυτόν*: "of
yourself" (it is the accusative, "yourself").

**(e) The first gloss is the wrong one.**

| Word | The card shows | Correct |
|---|---|---|
| δός, ἔδωκεν, δίδωσιν, δοθήσεται (δίδωμι) | "Offer!", "He, she, or it offered", "offers", "will be offered" | "give": τὸν ἄρτον ἡμῶν … δὸς ἡμῖν; τὸν υἱὸν … ἔδωκεν |
| ἄφες, ἀφήκαμεν (ἀφίημι) | "Send away!", "We sent away" | "forgive", "we have forgiven" (the Lord's Prayer) |
| Ἐν ἀρχῇ | "ruler, beginning" | "beginning" |
| ἐλθέτω ἡ βασιλεία σου | "Let him, her, or it go" | "come" |
| ἐργάζομαι (core gloss, from the dump) | "I word, trade, do" | "I work" (a misprint in the gloss) |
| λεγέτω / εἰρήκασιν (λέγω from the Ancient tables) | "Let him, her, or it put in order"; "They have put in order" | "let him speak"; "they have said" |
| γνῶσιν | "inquiry" | "knowledge" |
| ἀνὰ μέσον | *ἀνά*: "[with genitive] (rare)" | "up, through; between" |
| ἐτύγχανε | "Expressing coincidence: to happen (to be)" | "happened to be" |
| ἀπῆλθεν | "He, she, or it came or go away from" | "went away" |
| πρεσβύτερος μὲν Ἀρταξέρξης | "very old" | "the elder" |
| οὕτω πιθανῶς ἔλεγον | Modern *πιθανώς*, "probably" | "persuasively" |
| ὁ, ἡ, τό in Modern Greek (η, της, την, τα, οι) | "the definite masculine singular article. the" for every form | "the" |
| γιατί (Γιατί ήμουν άρρωστος) | adverb, "why" | "because" |
| πρέπει | "He, she, or it is fit" | "must, it is necessary" |

**(f) No dictionary line.** The pack declares no dictionary, so there is no second meaning, no senses list, no etymology
and no recorded audio for any Greek word (from the pack text and the code; `full/` records do not exist for `el`).

### 4.6 Periods: how a variety is chosen and what the card says

**How it is chosen (from the code).** Polytonic marks anywhere → ancient. Among ancient: Homeric if two "Epic-only" readings
or Homeric shapes are seen; else Koine if at least 90 % of the recognised words have a New Testament reading and at most
10 % have none; else Attic. No polytonic mark → Modern if any word has a Modern reading. A sentence whose spelling shows
neither system is read "as the sentence before". The learner's target variety and the page's declared language are **not**
passed to the analyser by the extension (`parseCtx` in `controller.ts` has no `varietyId`), although the orientation says
"your own target … breaks ties".

**What goes wrong.**

- **New Testament and Septuagint sentences are labelled Attic.** "New Testament reading" means the 461-lemma core, so one
  or two ordinary words outside it tip the sentence. Labelled "Attic Greek": John 1:3b–5, John 1:14, 1 Corinthians 13:1,
  13:2, 13:4–7; Genesis 1:2, 1:4b, 1:5b; Psalm 22:1–5 (five sentences); and, among short verses probed, *ἡ ἀγάπη οὐδέποτε
  πίπτει*, *εἰ υἱὸς εἶ τοῦ θεοῦ*, *Ἰησοῦς Χριστὸς ἐχθὲς καὶ σήμερον ὁ αὐτός*, *βίβλος γενέσεως Ἰησοῦ Χριστοῦ υἱοῦ Δαυὶδ
  υἱοῦ Ἀβραάμ* (with "text" evidence). Of the 116 Koine probes 38 carried the Attic label; with the full Koine index
  installed, 2.
- **The wrong label is recorded.** When the analyser says its evidence is "text" (8 recognised words, 2 outside the core),
  the lookup is stored as a lookup in that variety (`encounterVariety`): five of my 17 New Testament sentences would be
  filed under Classical Greek. On a page that declares `lang="grc"` with no Koine subtag every other New Testament lookup is
  recorded as Attic too (`resolve.ts`: grc → el-att; from the code).
- **Polytonic Modern Greek is Attic.** *Ἡ γλῶσσα εἶναι ὁ καθρέφτης τοῦ λαοῦ.*: period "Attic Greek"; *εἶναι* is "present
  active infinitive, to be" (it is "is"). *Δὲν θέλω νὰ πάω στὸ σχολεῖο.*: *Δὲν* is "δέν, pronoun, a late form of οὐδέν";
  *στὸ* is blank. The orientation says polytonic was the spelling of Modern Greek until 1982 and that "the pack reads both".
- **The New Testament in monotonic spelling** (as Greek church sites print it) is Modern: *Εν αρχή ην ο Λόγος*: *αρχή* is
  Modern "origin, beginning", nominative; *Πάτερ ημών*: *ημών* is "I"; *θανάτω θάνατον πατήσας*: *θανάτω* is
  "accusative or nominative or vocative dual", *πατήσας* blank.
- **Capitals** (*ΕΝ ΑΡΧΗ ΗΝ Ο ΛΟΓΟΣ*) are "Modern Greek".
- **The label depends on the previous lookup** (`state.out`). The word *λόγος* alone: "Modern Greek" on a fresh page;
  "read on as Attic Greek, the period of the sentence before" after a lookup in Homer; "read on as Koine Greek" after one
  in John. *φαίνεται.*: Modern *φαίνομαι* "seems" when fresh, Attic *φαίνω* "causes to appear" after the Homer lookup.
  (After a Homeric sentence the memory says "Attic", because the card re-analyses the lemma alone to transliterate it and
  that overwrites the memory: from the code.)
- **Two statements on one card.** The period line says "Attic Greek" while the note under it says "Variety: el-koi." (the
  reading's own code, printed raw). Seen on *κόσμος, τοῖς, δεῖ* and on *Μῆνιν* ("Homeric Greek" above, "Variety: el-att."
  below).
- **In Homer 58 of 142 readings are New Testament readings** with Dodson's glosses, because confidence beats period:
  *ψυχάς* "the soul, life, self"; *λαοί* "a people, the crowd".
- **Variants tab.** The rows are computed from the loaded shards. *ἡμῶν* (lemma *ἐγώ*): "Homeric Greek: not in our
  sources (no Ancient Greek entry has this headword)", "Attic Greek: not in our sources (no Ancient Greek entry has this
  headword)". *είναι* (Modern *είμαι*): "Attic Greek: εἶμαι" (*εἶμαι* is medieval; the Attic verb is εἰμί). *εἰμί*:
  "Modern Greek: not in our sources". *μῆνις*: "Koine Greek: μῆνις (Koine forms Wiktionary lists for this word)".
  Every word outside the core says "Koine Greek: not in our sources (only the New Testament core is loaded; the full
  index was not searched)": true, and it is the extension's permanent state.

### 4.7 Elision, crasis, movable nu, enclitics

**Elision depends on which apostrophe the edition uses.** The tokenizer cuts off ᾽ (U+1FBD), ’ (U+2019), ' and ᾿ (U+1FBF)
before the analyser sees them; only ʼ (U+02BC) and a combining breathing stay on the word. So the rule that restores an
elided vowel runs only for those two. With the four common characters the bare stem is looked up as if it were a word:
the New Testament's own elided forms are in the core as forms (*ἀλλ, δι, δ, κατ, μεθ, ἐφ*), a stem that some index knows
as a letter or a numeral is shown as that, and only a stem no index knows at all reaches a closed list of 46 stems.

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| τίς τ᾽ ἄρ σφωε θεῶν (᾽, ’, ᾿) | τ᾽ | "Τ, numeral, The number 300 in Greek numerals" | τε |
| the same with ' | τ' | "τ, numeral, 300" | τε |
| πολλὰ δ᾽ ὅ γ᾽ ἐν πόντῳ | γ᾽ | "Γ, numeral, The number three" | γε |
| Σ' αγαπώ πολύ. / Μ' αρέσει η μουσική. (Modern) | Σ', Μ' | "σ, numeral, 200"; "μ, numeral, 40" | σε, "you"; με / μου, "me" |
| ἣ μυρί᾽ Ἀχαιοῖς ἄλγε᾽ ἔθηκε (Iliad 1.2) | μυρί᾽, ἄλγε᾽ | blank (with every apostrophe character) | μυρία, ἄλγεα |
| ὣς ἔφατ᾽ | ἔφατ᾽ | blank; with ʼ: *φημί*, "imperfect or perfect active indicative, 2nd person plural, You (plural) were speaking" (it restored ἔφατε) | ἔφατο, 3rd singular middle |
| οὐκ ἔστ᾽ οὐδὲν κρεῖττον. | ἔστ᾽ | blank | ἔστι |
| ἵν᾽ εἰδῶμεν. | ἵν᾽ | "ἵ, pronoun, dative singular, she" | ἵνα |
| ἆρ᾽ οὐχ οὕτως ἔχει; | ἆρ᾽ | *ἄρα*, "so; then; therefore" | ἆρα, the question particle |
| ταῦτ᾽ εἶπεν / πάντ᾽ ἐποίησεν | ταῦτ᾽, πάντ᾽ | right lemma, marked unconfirmed, no meaning | |

Right: *ἀλλ᾽, δι᾽, δ᾽, κατ᾽, καθ᾽, μεθ᾽, ἐφ᾽, ἀφ᾽, ὑπ᾽, μετ᾽, οὐδ᾽, γι'*; *οὐκ, οὐχ, ἐξ*.

**Crasis.** Right lemma: *κἀγώ, κἀκεῖνος* (New Testament forms), *τἀγαθόν, τἆλλα, τοὔνομα, κἀγαθός, τἀληθῆ* (by rule,
"unconfirmed", no meaning), *ὦνδρες*. Wrong or blank:

| Word | The card shows | Correct |
|---|---|---|
| χὠ παῖς | "ΧΩ, a name, nomen sacrum form of Χριστῷ" | καὶ ὁ |
| κᾆτα | *κατά*, preposition | καὶ εἶτα |
| κἄν | meaning "crasis of καὶ and ἄν" | "even if; and if" |
| τοὐναντίον, ἐγᾦδα, θοἰμάτιον, προὔργου, ὦγαθέ | blank | τὸ ἐναντίον, ἐγὼ οἶδα, τὸ ἱμάτιον, πρὸ ἔργου, ὦ ἀγαθέ |

**Movable nu changes the lemma.** *εἶπεν* → *λέγω* (MorphGNT). *εἶπε* → *εἶπον* (Attic table): two lemmas for one form
with and without its nu. *ἐστίν* 0.91, *ἐστί* 0.5.

**Enclitic accents.** A second accent thrown back by an enclitic is matched only if the New Testament happens to have
that very spelling. Otherwise the word is matched without any accents, at low confidence, among everything with those
letters: *ἔλεός σου* → "kitchen table"; *ἅγιόν ἐστιν* 0.42; *ἄριστός ἐστιν* 0.4; *ποτήριόν σου*, *ὡδήγησέν με* 0.6;
*ἐξέθρεψέν με* blank. Under 0.5 the lookup is not credited to the lemma.

### 4.8 Spelling and Unicode

| Input | The card shows | Correct |
|---|---|---|
| NFC and NFD; tonos and oxia; grave and acute | the same reading | right |
| *εν αρχη ην ο λογος* (no accents) | read, as Modern Greek; *αρχη* "nominative" | acceptable: the accents were inferred and the card's confidence drops |
| *λόγοσ* (σ at the end), *λόγοϲ*, *ΛΟΓΟϹ* (lunate sigma) | blank | λόγος. Lunate sigma is the normal sigma of papyrological and many Byzantine-style editions |
| *ἐν τῆι ἀγορᾶι* (iota adscript) | *τῆι* blank; *ἀγορᾶι* "nominative plural" | τῇ ἀγορᾷ, dative singular |
| *ἐν ἀρχη* (subscript left out) | "nominative feminine singular" | dative; nothing warns that the subscript is missing |
| *τω λόγω πιστεύω* | *λόγω*: Modern preposition "because of" | τῷ λόγῳ |
| *λῡ́ω, ᾱ̓́νθρωπος* (textbook macrons) | read correctly | right |
| *αʹ, ιβʹ, ιβ', χξϛʹ, Αʹ* | numerals 1, 12, 12, 666, 1 | right |
| *͵αωκαʹ* (1821) | blank | thousands are not read |
| *; · ;* (Greek question mark, ano teleia) | handled | right |
| *Θ̅Ν̅*, *ΧΣ* | "nomen sacrum form of Θεόν", "… of Χριστός" | right (from Wiktionary) |
| *Ι̅Σ̅* | *ἴς*, "force; power" | Ἰησοῦς |
| *πρωΐ / πρωῒ, ἀΐδιος, Μωϋσῆς, Μωυσῆς* | read | right |

### 4.9 One word, several lemmas

The learner's knowledge is kept per lemma, so each of these splits one word's record:

- *γέγονεν* → *γίνομαι* (core) but *γέγονα* → *γίγνομαι* (Attic table), in one chapter. Likewise *ἔγνω* → *γινώσκω*,
  *γνῶθι* → *γιγνώσκω*; *ἀνέγνωτε* → *ἀναγιγνώσκω*.
- *εἶπεν* → *λέγω*, *εἶπε* → *εἶπον* (4.7). *κρείττων* → *ἀγαθός*, *κρεῖσσον* → *κρείσσων*.
- *πάσχω* and *πᾰ́σχω*, and the other 3,088 length-mark doubles (4.5 c).
- Modern *πατέρας* → *πατήρ*, *μητέρα* → *μήτηρ*, *μεγάλος* → *μέγας*, *παλιός* → *παλαιός*, *τρώω* → *τρώγω*, *Γιάννης* →
  *Ιωάννης*, *μου / με* → *ἐγώ*, *το* → *ο* but *τὸ* → *ὁ*.
- Diminutives are filed under their base noun: *ὠτίον* → *οὖς* "nominative singular"; *ἀνθρωπίσκος* → *ἄνθρωπος*
  "nominative singular"; *δοξάριον* → *δόξα*; *κλάδιον* → *κλάδος* (about 30 nouns in the Ancient index; `scan.out`).
- **Confidence under 0.5 means no lemma at all** in the record (`form:el:είναι`, `form:el:πολεμίων`). That is 18 % of my
  Modern text and 24.5 % of the project's own 294 Modern words, and it falls on the commonest words: *το, ο, τα, οι, ένα,
  μια, είναι, του, τους, αυτό, παιδί, πόλη, χώρα, γλώσσα*. A table with many rows splits the confidence between them, so
  the richer the paradigm the less the word is credited.

### 4.10 Grammar notes, fixed phrases, role in the sentence

None exist for Greek: `detectPatterns` and `detectPhrases` return empty lists and the adapter has no syntax rules. In 488
probes no note, no phrase and no role appeared. Not noted, to name what the owner's list asks about: *μέν … δέ*; *καί* as
"even, also"; a preposition's case (*μετά* is "with, after" with no word about genitive and accusative); the genitive
absolute (*τῶν πολεμίων προσιόντων*: the participle is read as an imperative); accusative and infinitive (*φησὶ τὴν ψυχὴν
ἀθάνατον εἶναι*); *ἵνα* and *ὅπως* with the subjunctive; conditions (*εἰ … ἄν*); *ὅτι* introducing speech; the attributive
positions (*ἡ ἐντολὴ ἡ ἐμή*); periphrastic tenses (*ἦν διδάσκων*); the articular infinitive (*ἐν τῷ σπείρειν*, *μετὰ τὸ
ἐγερθῆναί με*); *οὐ μή*; the Modern particles *να, θα, ας* (the meaning line of *να* is a dictionary definition: "added
before the dependent or present verb forms to form the different subjunctive moods, serving a variety of different clausal
functions and to express imperatives, wishes or hypotheticals", while the verb after it is labelled plain "indicative").
Selecting *μὴ γένοιτο*, *λέγω ὑμῖν*, *Τι κάνεις*, *Καλή όρεξη*, *Χρόνια πολλά*, *εν
τάξει*: "2 words selected; no phrase entry covers them".

What the card does list under constructions is its own form line: *ἁγιασθήτω*: "aorist passive imperative, 3rd person
singular: The form shows these features; the pack has no separate explanation for this combination." The pack's three
written constructions ("Article agreeing with its noun", "Grave accent", "Two spelling systems") are never attached to a
card (from the code: nothing produces their ids).

### 4.11 The pronunciation line

The line shown is the "reconstructed Koine" one for every ancient word, including Homer and Plato; the Erasmian and Modern
values are in the notes. For a Modern word it is the Modern one. No scheme marks the stress, which Modern Greek writes and
needs.

| Word | The card shows | Correct |
|---|---|---|
| υἱός, οὗτος, εὑρίσκει, αἷμα (rough breathing on a diphthong, its normal place) | Erasmian "uios", "outos", "euriskei", "aima" | huios, houtos, heuriskei, haima (the breathing is looked for on the first letter only) |
| ῥῆμα, Ῥώμη | Erasmian "hrēma", "hrōmē" | rhēma, Rhōmē (check: the usual writing) |
| ζωή, Ζεύς | Erasmian "zdōē", "zdeus" | "zd" is the restored Attic value; classroom Erasmian says z or dz (check) |
| ἀνάγκη, ζωή, ψυχή (Koine) | "anange", "zoe", "psyxe" | η, ε and αι are all written "e", ο and ω both "o": the scheme's own distinction of η from ε is lost |
| ἔγχος | "enkhos" in all three | χ is "x" everywhere else in the Koine and Modern lines |
| υἱός, οἶκος, ὕδωρ (Koine) | "yos", "ykos", "yðor" | y stands for ü; an English reader will read it as in "yes". Greek letters θ, ð, ɣ are mixed with Latin digraphs |
| Αυτός, Ευχαριστώ, αὐτός, Ζεύς | "avtos", "evxaristo", "avtos", "zevs" | aftos, efxaristo, aftos, zefs: αυ, ευ are af, ef before a voiceless consonant |
| λάμπα, πάντα, πέμπτη | "laba", "pada", "pebti" | lamba, panda, pempti |
| γκρεμό | "ngremo" | gremo |
| τσάι, ρολόι, Μάιο | "tse", "roli", "meo" | tsai, roloi, maio: an accent on the first vowel keeps the two apart |
| προϊόν, καΐκι | "prion", "keki" | proion, kaiki: the diaeresis is thrown away before the vowels are paired |
| γιαγιά, Γεια, παιδιά | "ɣiaɣia", "ɣia", "peðia" | yayá, ya, peðyá |
| κόσμος, Σβήσε | "kosmos", "svise" | kozmos, zvise |
| ηὔξανεν, υιοθεσία (blank cards) | Modern values with no label, also in a polytonic sentence | |

### 4.12 Names, numbers, abbreviations

- **Biblical names** are right where the core has them: *Ἰησοῦς, Ἰησοῦ, Δαυίδ, Μωϋσῆς, Ἰερουσαλήμ, Ἱεροσόλυμα, Ἀβραάμ*;
  *ἀμήν, πάσχα, σάββατον, ἀββα, σαβαχθανι* are read. Outside it: *Μαριάμ* → *Μαρία*; *Σαούλ* → *Σαῦλος*; *Ἰωνᾶ* → *Ἴων*;
  *ταλιθα* blank; *μαράνα* "I wither".
- **Classical names:** *Θουκυδίδης, Σωκράτη, Τισσαφέρνην, Ἀρταξέρξης, Ζεῦ, Διός* right; *Κῦρον* a verb; *Ξενίαν* an
  adjective; *Παρυσάτιδος, Καστωλοῦ, Παρράσιον* blank. A capital letter is not used as evidence of a name.
- **Numbers.** New Testament numerals are "adjective" (*δύο, πέντε, δώδεκα*); *τέτταρες* → *τέσσαρες*; Modern *είκοσι,
  πέντε* read; digits blank. Greek letter-numerals: 4.8.
- **Modern abbreviations** from the closed list work: *π.χ.* "for example (short for παραδείγματος χάριν)", *κ.* "Mr".

## 5. The "All forms" table

Greek has no generator and no dictionary record. The table is the adapter's `elParadigm`: every form the *loaded* indexes
hold for a lemma of that spelling. I built it through the extension's own `buildParadigm` for six lemmas (`para.mts`); I
did not see it in a browser.

1. **The table says the opposite of what it is.** Its source line reads "Greek analyser (rules and its irregular
   tables)", every cell has the status "generated", and a note is added: "The dictionary has no table for this word; every
   form here comes from the analyser's rules and is unverified by a second source." The adapter's own note in the same
   table says "nothing is generated". (`elParadigm` does not set the `attested` flag that `buildParadigm` looks for.)
2. **The table is incomplete by the way it is loaded.** Only the shards of the sentence's words are in memory, and a
   shard is chosen by a form's first two letters. *λύω* in *λύω τὸν ἵππον*: 713 cells; with the shards of *ἔλυσα,
   ἐλύθην, λέλυκα* also loaded: 777. Every augmented and reduplicated form is missing from the table of the model verb
   unless the sentence happens to contain a word beginning ελ- or λε-. *Γράφω*: 339 against 395. For a form whose lemma
   begins with other letters (*ἡμῶν* → *ἐγώ*, *εἶπεν* → *λέγω*, *ἤνεγκαν* → *φέρω*) the lemma's own shard may not be loaded
   at all.
3. **Three periods in one table, unmarked.** Only cells from a table whose header names a dialect are labelled. The
   table of Modern *γράφω* (card from *Γράφω ένα γράμμα*) holds New Testament *γέγραπται, γράφειν, ἔγραψεν, γεγραμμένον*,
   Attic *γέγραμμαι, γεγραμμένοι εἴημεν* and the Modern forms. In the table of ancient *λύω* the cell "present active
   indicative, 1st plural" is headed by Modern **λύομε** with "also λύομεν", and the 3rd plural by Modern **λύουν** with
   "also λύουσι; λύουσιν". In the table of *ἄνθρωπος*: "accusative singular: ἄνθρωπον (also άνθρωπο)".
4. **Another word's forms head the cells.** Table of *άνθρωπος* (card from *Ο άνθρωπος είναι καλός*): "nominative singular:
   **ἀνθρωπίσκος** (also άνθρωπος)", "genitive singular: ἀνθρωπίσκου (also ἀνθρώπου; also ανθρώπου)", and so on through
   the whole declension, with a cell "Gender=Neut: ανθρωπάριο". The diminutive's table is filed under the base noun in the
   index. The same for *αἴξ / αἰγίδιον, δόξα / δοξάριον, ζώνη / ζωνάριον, οὖς / ὠτίον, ὠτάριον, κλάδος / κλάδιον, λιμήν /
   λιμένιον, ὄμμα / ὀμμάτιον, φρέαρ / φρεάτιον, χύτρα / χυτρίδιον, σάνδαλον / σανδαλίσκος*; other words under the wrong
   lemma: *κομήτης* under *κοσμητής*, *λογογράφος* under *ὀρθογράφος*, *περιστερός* under *περιστερά*; Modern
   *αυτοκρατορία* under *υπερβασίλειο*, *αγιογράφος* under *απόκλιση*, *μελόδραμα* under *μιμόδραμα* (49 Ancient and
   about 140 Modern nouns have a "nominative singular" in their table that is not the headword; lists in
   `scan-odd-nomsg-*.txt`; I checked the Ancient list by eye, the Modern one only in part: many of its entries are plural
   forms tagged singular).
5. **The same form two to four times.** MorphGNT's cells carry gender, Wiktionary's do not, and Wiktionary adds merged
   rows. *λόγος* has 28 cells for 13 forms: "Nom Sing Masc: λόγος", "Nom Sing: λόγος", "Nom,Voc Plur: λόγοι", "Gender=Masc:
   λόγοι", "Dat,Gen Dual: λόγοιν" beside "Gen Dual" and "Dat Dual".
6. **Two tenses in one cell.** Because "past" and "dependent" are not mapped, the Modern simple past and the perfective
   non-past share a cell: "active indicative 1st singular: γράψω (also έγραψα)", "3rd singular: γράψει (also έγραψε)",
   "passive 3rd singular: γραφεί (also γράφηκε; also γραφτεί; also γράφτηκε)". Cells with one feature only: "Voice=Act:
   γράψει", "Voice=Pass: γραφεί (also γράφομαι …)", "Person=1 Number=Plur: γράψαμε".
7. **The substring fault is in the table too:** 32 cells of *λύω* are labelled "Tense=Impf,Perf" or "Perf,Plup".
8. **Forms stored with their article** cannot be reached and sit in tables as forms: *ἡ ἄνθρωπος, ἡ αἴξ, ἡ δαίμων, ἡ
   διδάσκαλος* (about 100 nouns).
9. **Dialect labels** are sometimes four at once: "genitive singular, Dialect=Aeolic Greek: πόλιος (Aeolic Greek, Doric
   Greek, Homeric Greek, Ionic Greek)".

I found no wrong inflected form that Wiktionary itself gives for the six lemmas read; the faults are in how the rows are
filed, labelled and merged.

## 6. Grammar not modelled at all

- **Any use of the sentence**: agreement of article, adjective and noun; subject and verb; a preposition's case; a
  capital letter; the word before or after. The adapter says so ("there is no parser").
- **A reading for a word that is in no index**: no stemming, no augment or reduplication rule, no ending analysis. An
  unlisted form of a listed verb (*ἠσθένει, ἐπελαθόμην, λυθέντος, πατήσας, προικισμένοι*) is blank.
- **The Septuagint**, the Apostolic Fathers, papyri and every Koine text outside the New Testament, as sources.
- **The Modern Greek verb system**: aspect pairs, the simple past as a tense, the perfective non-past, *να / θα / ας*
  with their verb, the perfect with *έχω*, the passive past in *-ηκα*, the weak pronouns, the participle in *-μένος* as a
  form of its verb.
- **Katharevousa and learned phrases** inside Modern Greek (*εν τάξει, δόξα τω Θεώ, εν τω μεταξύ, λόγω*): the dative is
  read through the Attic tables as a dual.
- **Polytonic Modern Greek** and **monotonic ancient texts** as such.
- **Medieval (Byzantine) Greek**: labels only, as the pack says.
- **Elision in general, crasis beyond τ- and κ-, aphaeresis, tmesis**; enclitic accents; iota adscript; lunate sigma;
  thousands in numerals; nomina sacra by rule.
- **Grammar notes, fixed phrases, roles** (4.10). **A dictionary** (senses, etymology, audio). **Stress** in the
  pronunciation line. **A frequency list.**
- **Course material**: there is no `data/ladder/el`, no `data/stage0/el`, no `data/gold/el`.
- **Checks on a learner's own Greek**: four rules (final sigma, polytonic in a Modern draft, monotonic in an ancient
  draft, a form of another period); not audited beyond reading them.

## 7. Orientation and course texts

**Orientation (`tutorial/el.ts`).** The Greek in it is correct. What it tells the learner about the card is not:

- "The card shows the case of the article and of the noun so you can see them agree." For *τὸν θεόν* and *ὁ λόγος* it
  does. For *τὸ φῶς* as a subject the article is "accusative" and the noun "nominative"; for *τοῦ φωτός* the article is
  "masculine" and the noun "neuter" (4.3).
- "Koine readings come from MorphGNT's analysis of every word of the New Testament"; "the full Koine, Ancient and Modern
  indexes are assets the reader installs when Greek is loaded". The extension never installs the full Koine index.
- "your own target (Modern by default, or Koine, Attic or Homeric if you choose) breaks ties." The extension does not
  pass the target to the analyser.
- "The pack reads both [spelling systems]; the marks tell it which period a text belongs to." Polytonic Modern Greek is
  read as Attic; the monotonic New Testament as Modern (4.6).
- "mark every word with … an accent": proclitics (*ὁ, ἡ, ἐν, εἰς, οὐ, ὡς*) and enclitics have none (a small slip).
- The card "shows … how often the New Testament reads it this way". The per-reading count does not reach the card; only
  the lemma's total appears, in the Variants tab (from the code).
- The practice step works: *λόγος* in John 1:1 is "nominative masculine singular", period "Koine Greek".

**Pack text (`packs/el.ts`).** "A form with several readings in one period keeps them all; none is presented as certain":
the card presents one and says "the one shown has the highest confidence". The feature note for Tense gives *ἔδωκεν* as
"he gave"; the card says "offered". The pack explains Tense for Modern Greek but the Modern past carries none. The
validation list (20 cases) is all New Testament core words plus two stated limits; no Attic, Homeric or Modern reading is
held to anything.

**The project's own audits are measured on something else.** `SCRIPTURE-AUDIT.md`, `TREEBANK-AUDIT.md`, `TEXTS-AUDIT.md`
and `MODERN-AUDIT.md` install all three full indexes and score the analyser's first reading. The card has neither: no full
Koine index, and its own choice of reading. Their figures (New Testament "no reading 0.0 %"; Modern lemma 94.6 %) do not
describe the GoLearn card. On the Modern set I measured 92.2 % for the card, with the very words the last fix targeted
(*σε, με*) wrong again.

**Course texts.** None exist for Greek.

## 8. What to fix first

1. **Give the extension the New Testament.** Shard the full Koine index like the other two and load it. This removes the
   6.8 % blank tokens, the Attic readings of New Testament words and most wrong period labels on Scripture.
2. **Let the card take the analyser's order, or fold the period into the confidence.** A reading of the sentence's period
   must beat a higher-confidence reading of another period: this alone restores *με, σε, τι* in Modern Greek and the
   Classical senses in Attic.
3. **Fix the two wholesale bugs:** match table-header tenses as whole words ("imperfect" is not "perfect"; "perfective"
   and "imperfective" are aspects), and never inflect a gloss that is a cross-reference: follow "X form of Y" to Y's gloss
   or show it uninflected.
4. **The Modern verb:** map "past" + "perfective" to a simple past with a past meaning, "dependent" to its own value
   (shown as "perfective non-past, used after να / θα / ας"), print the aspect, and stop the table merging the two.
5. **Agreement in the noun phrase.** Article + noun (+ adjective) must share case, number and gender: choose the
   article's reading that fits the noun next to it, and the noun's that fits the article. Then subject and verb for the
   1st singular / 3rd plural pairs (*-ον, -ουν*). These few rules cover most of the 64 wrong form lines I counted.
6. **Merge the doubled lemma rows** (strip length marks from headwords when building the index; join *γίνομαι /
   γίγνομαι* and the like through the index's own variety labels) and give plural pronouns their own meaning ("we", "us").
7. **Period decision:** count New Testament words against the full index; never label a sentence Attic on two missing
   words; treat polytonic text with Modern-only words (*δὲν, νὰ, στὸ, εἶναι* before a predicate) as Modern; drop the
   memory of the previous lookup, or at least stop the lemma's own re-analysis from overwriting it; do not record a
   variety from this evidence until it is measured.
8. **Elision:** keep the apostrophe on the word for all five characters and run the vowel-restoring rule for every stem;
   never read a single letter before an apostrophe as a numeral in running text.
9. **Enclitic accents and spelling:** drop a second acute before matching; fold σ / ς / ϲ; read iota adscript after a
   long vowel as the subscript.
10. **Confidence:** do not divide it by the number of table rows a form has; a common word must not fall under the
    lemma-credit threshold because its paradigm is rich.
11. **The "All forms" table:** set the attested flag and remove the false note; load the lemma's shards before building;
    keep periods apart (one table per period, or a label on every cell); drop rows of another headword; merge the
    gendered and ungendered cells.
12. **Participles from the tables:** show verb, tense, voice and the participle's case, number and gender; index the
    oblique cases of participles.
13. **Pronunciation:** find the rough breathing on the second vowel of a diphthong; αυ / ευ before voiceless consonants;
    μπ, ντ, γκ inside a word; do not pair vowels across an accent or a diaeresis; mark the stress; show the Erasmian line
    for Attic and Homeric text.
14. **Meaning line for the core:** *δίδωμι* "give", *ἀφίημι* "forgive; let go", *ἀρχή* "beginning; rule", *ἐργάζομαι*
    "work", *δεῖ* as its own impersonal entry.
15. Then grammar notes (the list in 4.10), a dictionary for Greek, and course material.

## 9. Limits of this audit

- I am a language model, not a classicist and not a native speaker of Modern Greek, and looked nothing up. Items marked
  "check" are the ones I am not sure of. The Greek texts were written from memory; a word may differ from the printed
  SBL text, Rahlfs, the Oxford Homer, Xenophon or Plato (for instance I am not certain of every word of Psalm 22 or of
  *ἐς Καστωλοῦ πεδίον ἁθροίζονται*). My 199 words of Modern Greek are a machine's.
- The Ancient and Modern indexes (1.5 million readings) were scanned mechanically, not read. The counts of mislabelled
  readings are exact for the patterns searched; other faults of filing or tagging certainly exist that I did not look for.
- Everything was run through the card's own parser in Node with the indexes loaded by the extension's own loader. I did
  not see the card in a browser: I do not know how the panel lays out the period line, the "construction" line, the
  alternatives or a table of 700 cells, nor how long a lookup waits for its shards.
- The order of readings of equal confidence depends on the order shards are installed (from the code). My runs loaded
  them in one fixed order; in the browser the two sets load in parallel, so a card of the kind *σκότος* → "Scot" may come
  out the other way on another run.
- Hand counts of wrong readings (about 112 in 1,034 words, plus about 22 Modern objects called nominative) are my own
  reading of the output. A nominative shown for a vocative or for a dual accusative of the same form was not counted;
  a wrong meaning with a right lemma and form was not counted there (it is in 4.2 b and 4.5).
- The vocabulary run is context-free and compares lemmas letter for letter with MorphGNT's: the 2.3 % "another lemma"
  includes spelling variants of the same word (*τεσσαράκοντα*, *γίγνομαι*) beside true errors. I did not separate them
  by count.
- Biblia's own path (the source's reading put first for the tapped token) was not audited; in that state I saw the
  compiled core and the full index count the same reading twice, which lowers the confidence of core words (0.92 → 0.71).
- Not audited: `production.ts` and `abbreviations.ts` beyond a first read; the treebank and plain-text audits (not
  re-run); Medieval Greek; Katharevousa beyond six phrases; the Septuagint beyond 180 words; dialects other than Homeric;
  verse (scansion, tmesis) beyond 20 lines; GoReview's use of the same indexes.

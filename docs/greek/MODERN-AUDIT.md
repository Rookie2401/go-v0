# Greek: Modern Greek prose, measured — 2026-11-13

Until this date Modern Greek had never been measured and Greek had no gold set. A language audit read the Greek Wikipedia articles Ψωμί and Νερό
(the first 500 word tokens of each) with the Koine, Ancient and Modern indexes installed and found 93.9 % of the words with a reading, but some of
the commonest written forms of the language with none: στο ×7, στον, στις, στους (σε + the article written as one word), π.χ ×5 and αρχ
(abbreviations).

## What was changed

| | |
|---|---|
| σε + the article | `src/adapters/greek/contractions.ts`: the ten forms (στο, στον, στη, στην, στου, στης, στους, στις, στα, στων), a closed hand-written list. The reading is the preposition σε with the article as a part of the word (`parts`, as Spanish del = de + el); the article carries its case, number and gender. στο and στου serve two articles: both are given, the usual one first. By rule (`origin: 'rule'`), Modern only |
| abbreviations | `src/adapters/greek/abbreviations.ts`: 37 common ones and four names written as initials (π.χ., λ.χ., κ.λπ., κ.τ.λ., κ.ά., κ.ο.κ., δηλ., βλ., πρβλ., ό.π., περ., μτφ., π.μ., μ.μ., αι., αρ., σελ., τ.μ., χλμ., χιλ., εκατ., δισ., κ., κ.κ., Δρ., Αγ., αρχ., αγγλ., γαλλ., γερμ., ιταλ., λατ., τουρκ., π.Χ., μ.Χ.; ΗΠΑ, ΕΕ, ΟΗΕ, ΕΣΣΔ). The reading shows the abbreviation as the word and gives the words it stands for and an English meaning. A short one (αι, αρχ, κ) is an abbreviation only when its full stop follows. π.Χ. ("before Christ") and π.χ. ("for example") are told apart by the capital |
| sentence splitter | an abbreviation's full stop no longer ends the sentence when the text goes on in small letters, a digit or a closing bracket (π.χ. μήλα; 5ος αι. π.Χ.; αρχ. ἄρτος), and never after a title (ο κ. Παπαδόπουλος). Before a capital it still ends it |
| γι' | the Modern elision of για (γι' αυτό) is read as για |

Reading the hand-checked words (below) exposed two more defects, both fixed:

| | |
|---|---|
| a quoted ancient word | One polytonic word made the whole sentence ancient: "Το ψωμί (αρχ. ἄρτος) είναι …" and "Το νερό (ὕδωρ στην αρχαία ελληνική γλώσσα) …" were read as Attic, every Modern reading was pushed behind, and στη was read as a form of ἵστημι. Properly spelled polytonic text has no word that begins with a vowel and no breathing, so when such words outnumber the polytonic ones the sentence is monotonic and the polytonic words are its quotation (`decidePeriod`; the period line says "monotonic spelling with 1 quoted polytonic word") |
| pronoun forms filed under τα | Wiktionary hangs the whole table of the Modern personal pronouns on the entry τα, so σε, με, μας, αυτό, αυτής arrived first as "a form of τα (pronoun)". Such a row now goes behind the readings that have a headword of their own, and where one spelling is a headword both as a preposition and as a pronoun (σε, με) the preposition goes first (`modernOrder`). Nothing is removed and no confidence is changed. The index itself is not rebuilt: the rows are still there, behind |

## The hand-checked words

`test/adapters/greek-modern-gold.json`: 17 sentences, 300 word tokens, 294 counted (six are English, French or Latin words or a digit with an
ending). The sentences are Greek Wikipedia's (Ψωμί, Νερό; CC BY-SA 4.0, quoted unchanged except that invisible direction marks were removed). The
lemma and part of speech of every word were **written by hand by a Claude session before looking at the analyser's output; they have not been
reviewed by a native speaker or a Hellenist**. Where lexicographers differ on the headword (a passive form under the active verb or under its own
-μαι entry; a participle under itself or under its verb; two spellings of one word) every accepted headword is listed. After the first run each
disagreement was read again; no reading in the file was changed to match the analyser.

`test/adapters/greek-modern.test.ts` reads them with the full indexes installed (it runs only where the indexes are built: they are local
assets) and holds the analyser to these figures. `GREEK_MODERN_REPORT=1` prints every disagreement.

| of 294 words | before the fixes¹ | after |
|---|---|---|
| have a reading | 289 (98.3 %) | 289 (98.3 %) |
| first reading has the hand-written lemma | 261 (88.8 %) | **278 (94.6 %)** |
| first reading has the hand-written part of speech | 268 (91.2 %) | **282 (95.9 %)** |
| both | 260 (88.4 %) | **277 (94.2 %)** |
| first reading is read as Modern | 226 | **289** |

¹ With the contraction and abbreviation rules already in, before the two further fixes. Before any of this work the 13 contractions and 5
abbreviations of these sentences had no reading at all, which by count leaves 271 of the 294 words (92.2 %) with one; that state was not run.

On the audit's own 1,000 words (the two articles, 500 each, the adapter's first reading): **957 with a reading (95.7 %, was 93.9 %)**, all 52
sentences read as Modern, and no contraction or abbreviation among the words still unread.

## What still disagrees (all 17, and why)

- **An adverb in -α is read first as its adjective's neuter plural** (ιδιαίτερα, βασικά, τελικά, γενικά, κοντά; and επιπλέον as an adjective): the
  adverb reading is there, second. There is no parser, so nothing in the sentence chooses. Six words.
- **τροφίμου, τρόφιμο → τρόφιμος** (noun, "boarder") instead of τρόφιμο ("foodstuff"): both headwords have the form; the wrong one is first.
- **αέρια → αέριο** (noun, "gases") instead of the adjective αέριος in "αέρια κατάσταση": a real ambiguity, decided wrongly without a parser.
- **A learned word the Modern tables lack is read through the Ancient ones, with the ancient spelling of its headword**: ετυμολογική →
  ἐτυμολογικός, σίτου → σῖτος, πολτός → πόλτος (the last is the ancient word with another accent, not the modern one).
- **No reading at all** (five): διογκωτικοί, αναμειγμένο, φουσκώσει, διαυγές, επονομάστηκε. No Wiktionary table lists these forms (an aorist
  subjunctive, a perfect participle, a neuter of an adjective in -ής, an aorist passive, a rare adjective). Nothing is guessed from the letters.

## Limits of this measurement

294 words of two encyclopedia articles on food and chemistry, one annotator who is not a native speaker, no second reader. It says the
commonest function words now read correctly and gives a floor to hold; it is not an accuracy figure for Modern Greek at large. A gold set a
native speaker has checked, over more kinds of prose, is still owed.

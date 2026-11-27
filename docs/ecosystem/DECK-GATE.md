# The deck gate: no false or unknown word in the GoReview deck

The owner, 2026-11-25: "Make sure that there are no false words or unknown words that appear in the GoReview deck."
2026-11-26: "Enforce the same rule for all the other languages."

This page says what the rule means, where it is enforced, how it was measured, and what remains. Every figure below was produced on
2026-11-26 by `npm run deck:audit` and by readers who were AI models, not native speakers.

## What counts

- A card is **false** if its reading is wrong (the sentence's word is another word), or if the reading is right but the **first meaning shown**
  is wrong. A form card that shows a look-alike word's meaning is false. A form card that only repeats a correct lemma card is not.
- A card is **unknown** if it has no English meaning, if its meaning is only a cross-reference ("alternative spelling of aquél"), if its
  headword is not a real dictionary entry, or if it is a fragment.

## Where it is enforced

`packages/goreview/src/facts/deck-gate.ts`, applied by `packages/goreview/app/packFacts.ts` to the facts of **every lemma and form unit of
every language**, before recovery, intake, admission or a session can build anything from them. It is the GoReview side of the review gate
(`src/core/review-gate.ts`, the language-neutral core taken unchanged from the shelved Korean branch): the same kinds of hold, the same idea
that a held word is marked, not removed. Nothing in the reader changes: a held word is read on the GoLearn card exactly as before.

A unit may become a card only when:

| | Check | What it stops |
|---|---|---|
| (a) | the headword is a confirmed word-list reading or a dictionary entry | lemmas guessed from an ending, names, fragments |
| (b) | the first meaning is not only a pointer; a pointer is followed once to its target's meaning | es `aquel` "alternative spelling of aquél", de `dies` "alternative form of dieses", la `Deo` "synonym of Cerēs", he "defective spelling of …" |
| (c) | a written form with no reading that the dictionary files under several word classes is not decided by its spelling | de `morgen` (tomorrow / morning) |
| (c') | in a language whose analyser labels readings by period, the word is of the learner's period and so is its meaning | Modern Greek μητέρα carded as Ancient μήτηρ; Modern Hebrew words shown with a Biblical meaning |
| (d) | the unit is not on the language's known-limits list (`deck-known-limits.ts`) | cards a reader found false that no rule catches |
| (e) | a dictionary meaning is the head of the entry's **first current sense**, never a later sense that happens to be short; a form card shows a meaning its own word's card has | de `Sonntag` "a municipality of Vorarlberg, Austria"; de `ist` "forms the present perfect…"; sq `pashë` "to watch, look (at), observe"; ru `вода` "it (the person who chases…)" |

A unit that fails is held: status `requires-review`, no meaning to build a card from (so a card already in a learner's deck is not asked
either), and `reviewHold` = the kind and one plain sentence, which GoReview shows as the reason. Where the fault is only the ORDER of the
dictionary's meanings, the facts are repaired instead (`Sonntag` now shows "Sunday"). Units a reviewer has verified are left alone.

## Which earlier reports were real

The Korean auditor's sample of existing languages (2026-11-25) went through a harness that read the facts provider alone. Measured through the
real path (page scan, recovery, intake, admission, the exercise build):

- **"German 38 of 135 and Greek 32 of 94 cards with no meaning": a harness artefact.** No card with an empty meaning is ever admitted: the
  written-recognition builder refuses a unit with no gloss ("nothing to check an answer against"). `bringe`, `besamt`, `brüder` (the false lemma
  "brüd"), ἤμουν, εἰς, ζωήν never become cards.
- **Cross-reference-only meanings: real.** es `aquel`, `mi`, `su`, `tu`; de `dies`, `des`; seven Latin form cards; sixteen Nynorsk cards; eight
  Modern Hebrew cards on the held-out text.
- **Albanian `pashë`: real.** The form card showed "to watch, look (at), observe". The gate holds it; the `shoh` "to see" card stays.
  `test/audit/linguistic.layers` (62 < 63 on master) is measured through the gate now and passes; its floors are restated in the test with the reason.
- **"Spanish, Albanian, Hindi, Hebrew: none": not so.** Every language had false cards (table below). The largest class nobody had reported:
  form cards whose meaning is the first SHORT sense of the dictionary entry of their spelling, whatever word that is.

## How it was measured

`test/deck-audit/support.ts` walks the real path with only the account stubbed: a sentence, the page scan's own naming of its words
(`wordsOfText`), knowledge rows folded from encounter events, `engine.recoverCandidates`, `engine.intake`, `engine.exerciseReadiness`, then the
exercise itself, from which the card's shown meaning is read. The pack facts are `packFactsFor`, as the app's `main.ts` makes them, over the
dictionaries on disk.

Each of the 15 sets (13 packs; Greek and Hebrew each in their modern and their Biblical variety) has two texts under `data/deck-audit/<set>/`:

- `dev.txt`: read while the gate and the known-limits lists were written (the grammar audit's unseen texts of 2026-11-17, or new text; Mark 4,
  Ruth 1, Daniel 6 for the Biblical sets). The grammar audit's texts ended with the Lord's Prayer and John 3:16 in modern Bible translations
  written out from memory; those lines were taken out before this was committed (they are other people's texts), the six sets were run again
  without them, and every card judged only in such a line was judged again in its new sentence. Each file's first line says where its text is from;
- `heldout.txt`: 90 new sentences per language (Acts 9, 1 Samuel 3, Daniel 3 for the Biblical sets), never read for that. Two things were
  changed after the first held-out run and are not blind to it: the period rule was replaced because it broke three existing Biblical Hebrew
  tests, and two pointer patterns ("to-infinitive of", "bare infinitive of") were added for Hebrew.

Every admitted card, before and after the gate, was read by a reader against this brief: `ok` (the sentence's word is this headword and the
meaning shown is a correct main meaning of it; a correct meaning that is not the exact shade of this sentence is still ok), `false-reading`,
`false-meaning` (not a meaning of the word, or a rare, archaic or marginal one while its ordinary meaning is something else), `unknown`,
`unsure`. About 8,900 verdicts are kept (those of cards the final texts still produce), in `data/deck-audit/<set>/verdicts.json`. **Limits of the method:** the readers are AI models; each card
was judged once, in the first sentence it came from; nothing was looked up; no native speaker has seen any of it.

## Results

| Set | Dev: cards before → after | Dev: false + unknown before → after rules → with list | Held-out words | Held-out cards before → after | Held-out false / unknown before | Held-out false / unknown after (the named list) | Known-limits units |
|---|---|---|---|---|---|---|---|
| Albanian | 249 → 244 | 5 → 2 → 0 | 943 | 388 → 383 | 6 / 0 | 1 / 0 | 2 |
| Spanish | 319 → 305 | 14 → 7 → 0 | 1285 | 596 → 579 | 24 / 1 | 2 / 0 | 7 |
| German | 286 → 247 | 22 → 9 → 0 | 1205 | 636 → 572 | 26 / 4 | 8 / 0 | 9 |
| Hindi | 249 → 237 | 10 → 4 → 0 | 897 | 393 → 387 | 12 / 0 | 3 / 0 | 4 |
| Thai | 441 → 371 | 52 → 27 → 0 | 1244 | 828 → 753 | 94 / 0 | 28 / 0 | 27 |
| Norwegian Bokmål | 330 → 302 | 15 → 7 → 0 | 961 | 527 → 505 | 34 / 0 | 17 / 0 | 7 |
| Norwegian Nynorsk | 412 → 387 | 34 → 11 → 0 | 1022 | 410 → 389 | 14 / 21 | 4 / 0 | 11 |
| Latin | 493 → 456 | 24 → 6 → 0 | 649 | 378 → 362 | 14 / 2 | 7 / 0 | 6 |
| Russian | 567 → 539 | 30 → 18 → 0 | 839 | 563 → 546 | 27 / 8 | 13 / 0 | 18 |
| French | 651 → 630 | 21 → 6 → 0 | 1437 | 662 → 646 | 22 / 3 | 7 / 0 | 6 |
| Modern Greek | 160 → 143 | 15 → 2 → 0 | 947 | 374 → 362 | 35 / 0 | 17 / 0 | 9 (both Greek sets) |
| Koine Greek | 145 → 138 | 6 → 0 → 0 | 339 | 176 → 166 | 10 / 1 | 7 / 0 | |
| Modern Hebrew | 71 → 64 | 8 → 3 → 0 | 651 | 162 → 153 | 22 / 9 | 14 / 0 | 5 (both Hebrew sets) |
| Biblical Hebrew | 88 → 79 | 2 → 1 → 0 | 270 | 73 → 66 | 7 / 0 | 2 / 0 | |
| Biblical Aramaic | 44 → 43 | 1 → 1 → 0 | 215 | 36 → 36 | 0 / 0 | 0 / 0 | 1 |
| Arabic | 831 → 487 (224 sentences) | not read before → 0 | 964 | 505 → 306 | not read / not read | 4 + 1 / 0 (301 of 306 ok) | 1 listed + the generated sweep list |

**Arabic** (not in the totals below): the figure in its row is from the THIRD of three blind texts and is final: 306 admitted cards, 301 read ok, 4 false readings, 1 false meaning, 0 unknown (named in `data/deck-audit/ar/verdicts.json`, `blind3`). The first two blind texts were folded into the development text after they were read (374 cards, 7 false; 323 cards, 7 false), so the held-out row is not blind to the rules written from them. Arabic uses the stricter rule: no card for a word whose first meaning nobody has checked (index `Sense` Rev or One), no form card, one source entry for a headword, a reviewed answer-exclusion table. Its "before" figures are cards only: the before-gate cards were not read.

On the held-out texts: **396 false or unknown cards of 6,202 before (6.4 %), 130 of 5,905 after (2.2 %), and no unknown card after.** The deck
has 297 fewer held-out cards (4.8 %) and 266 fewer false or unknown ones (some were repaired, not held).

## What remains, by name

The 130 are listed, unit by unit, in `data/deck-audit/<set>/verdicts.json` under `residual`, each with the reader's note; the tests pin the
lists. They are of three kinds, none of which a rule over the facts can catch:

1. **The analyser reads the word as another word, with confidence** (most of Bokmål 17, German 8, Thai 16, Modern Hebrew 8): a noun carded as
   its look-alike verb (nb `drikke`, `reise`, `snø`; de `Gebühren`, `Zwiebeln`), a separable prefix carded as a preposition (de `ab`, `an`,
   `mit`), a Thai mis-segmentation (ชาน from ชานชาลา), Hebrew בצל "onion" read as ב + צל "shadow".
2. **The dictionary's own first sense is not the ordinary meaning** (Thai 12, Russian 11, French 7): th กล้อง "pipe" (camera), ru `стать`
   "to stand" (to become), `врач` "therapist" (doctor).
3. **Modern Greek aorist forms shown with a present meaning** (11 of Modern Greek's 17: αγοράσαμε "We buy"): one fault in the generator of
   inflected meanings, the best single fix on the list.

## The stricter rule, measured

The stricter rule put to the owner is the reading gate of `src/core/review-gate.ts` on every word of a page: a word whose sentence leaves two
headwords within 0.15 of each other credits its written form only, never a lemma. It was measured on the held-out texts and is **not switched
on**:

| | Cards it would withhold | False cards among them |
|---|---|---|
| Thai | 82 of 753 | 10 |
| French | 33 of 646 | 3 |
| Modern Greek | 12 of 328 | 1 |
| Russian | 6 of 546 | 0 |
| Koine Greek, Modern Hebrew, German, Albanian, Spanish, Hindi, Biblical Hebrew | 1 to 4 each | 3 in all |
| Bokmål, Nynorsk, Latin, Aramaic | 0 | 0 |

About 150 cards withheld to remove 17 false ones, and nothing gained where the false readings are most (Bokmål, German): those readings are
confident and wrong, so no rival is in the band. It would also change what GoLearn Active credits for words learners have already marked. The
other stricter rule is the one Korean and Arabic use, to hold every word whose first meaning nobody has checked: it would reach zero only after a
review of each language's core meanings, which has not been done for any live language.

## Running it

```
npm run deck:audit -- <set> [--part dev|dev2|heldout] [--no-gate] [--strict] [--cards] [--held] [--json <file>]
npx vitest run test/deck-audit
```

Sets: sq es de hi th nb nn la ru fr el el-koi he he-bib arc. `test/deck-audit/deck-audit.test.ts` holds each set to: no machine finding; every
admitted card read with the meaning it shows (a new card, or a changed first meaning, fails until it is read); no false or unknown card on the
development text; exactly the named residue on the held-out text. A set whose dictionaries are not on the machine is skipped. The whole file
takes about twenty minutes.

When a reading or a meaning is fixed, take the unit off `deck-known-limits.ts` (or off `residual`) and let the test say whether the card is
right now.

## Follow-up 1 (2026-11-27): Greek

The owner, 2026-11-26, on the named residue: "Do it". Fixed by cause where a rule can; what no rule fixes is held and named. This part is Greek
(Modern and Koine); the other languages follow in parts of their own.

### What was wrong, and the rule that fixes it

| Cause | Fix | Cards |
|---|---|---|
| The Modern Greek tables label the simple past "past" + "perfective"; the tag table read no tense from that, so the form's English was a present (αγοράσαμε "We buy") | `greek/tags.ts`: "past" with no other tense named is the aorist; a tense named only by the table's header ("perfect" = the perfective section) is not the row's tense | 11 of the 17 named, and 2 more on the fresh text |
| The analyser ordered its readings by the sentence's period but left the confidences alone, and GoLearn credits the reading of the highest confidence: in Modern text με and σε were credited as the Koine pronouns ἐγώ and σύ, μητέρα as μήτηρ, Δευτέρα as δεύτερος | `greek/analyze.ts`: across the ancient / modern divide a reading of the other side is kept below the sentence's own; where the sentence's own readings are one word, or the same word as the other side's best (μετά, δύο), that word takes the certainty over | the "ancient lemma" cards of the first audit; τρίτος |
| A weekday written with a capital inside a sentence was read as the ordinal (την Τρίτη "third") | the capitalised common noun is the reading; a proper name is left alone | Τρίτη, Δευτέρα |
| A Koine learner's lemma card showed the Ancient tables' first sense (θεωρέω "to be sent to consult an oracle", ῥύμη "force, rush") though the New Testament lexicon has the word | the adapter offers the period source's own headword meaning (`headwordGloss`); the facts provider reports it, the gate shows it | θεωρέω, ἀπειλή, ῥύμη, ἐγγίζειν |
| MorphGNT files the impersonal δεῖ under δέω "I bind" and the middle ἄρχομαι under ἄρχω "I reign" | a reading of one of them names that word and its meaning ("it is necessary", "I begin") | δεῖ, ἔδει, ἤρξατο, ἤρξαντο (184 New Testament occurrences in all) |
| A parenthetical note in a verb's citation was split at its own commas ("We washed (your body"); "come or go away from" was inflected as "came or go away from" | `core/english-verb.ts`: the note is dropped before the senses are split; the second verb of an "or" pair is dropped | πλύναμε, ἀπῆλθεν |
| "third-person singular imperfect middle/passive indicative of X" was not seen as a pointer | `core/review-meaning.ts` | ἐπυνθάνετο |

### No other reading made worse (measured before and after)

| Measure | Before | After |
|---|---|---|
| Modern Greek gold (`test/adapters/greek-modern-gold.json`, 294 words), the analyser's first reading: lemma / lemma + class | 281 / 280 | 281 / 280 |
| The same, the reading GoLearn credits (highest confidence) | 271 / 270 | 281 / 280 |
| Perseus treebank, 8 ancient texts × 3,000 tokens (`npm run el:audit-treebank`) | — | identical, but Plato's lemma score 85.2 → 85.3 % (δεῖ, five times) |
| Words credited in the 947-word Modern text (dev2) | 740 | 713: the 27 no longer credited were all credited to a WRONG word before (με, σε, μου, σου as Koine pronouns; δώσω as δίδωμι); 21 others are now credited to the right Modern headword (μεγάλη → μεγάλος, μητέρα, πρώτη, Τρίτη, πέντε, τρία …) |
| Greek tests, goldens | the same two files fail before and after as on master (`hebrew-greek-packs` pack:el, the `goreview.startup` el golden, with the same difference); no golden re-recorded | |

### The figures

The old held-out halves have been read, so they are development material now (`dev2.txt`); each set has a fresh `heldout.txt` (Modern: 90 new
sentences written for it; Koine: Luke 15:11-32, SBL edition).

| Set | Old named residue | Now, on that text | Fresh held-out: cards | False at its first reading | Fixed by rule after that reading | Remaining, named |
|---|---|---|---|---|---|---|
| Modern Greek | 17 | 0 admitted: 12 fixed by rule, 5 held on the known-limits list | 325 | 9 | 2 (the table-header tense, twice) | 7 |
| Koine Greek | 7 | 0 admitted: 6 fixed by rule, 1 held on the known-limits list | 174 | 8 | 4 (ἔδει, ἤρξατο, ἤρξαντο, the pointer) | 4 |

The fresh held-out figure that is blind is the first reading (9 and 8 false or unknown cards); the rules in the next column were written after reading it.

**Held on the known-limits list (Greek: 18 units), by kind.** The source's own first sense is not the ordinary meaning, and the source has no
better order to take: έναντι "towards (in part payment)", ίδιος "own", κόσμος "Universe, cosmos", ρεύμα "air current", υπολογιστής. The analyser
reads another word: Βάλτε as βάλτος, Έβαλε as βάλλω, Τι as τις, Σ' as the numeral, ἤρχου as ἄρχω (the extension has no full New Testament
index), συνιῶσιν, πλούτου as the god. The lexicon's citation leads with the causative where the form is intransitive: ἀνέτειλεν, ἀνάστηθι,
ἀναστάς, εἱστήκεισαν; and ἐπικαλουμένους.

**Remaining on the fresh held-out texts (11), named in `verdicts.json`.** Modern: ανέκαμψε "reappeared" (recovered), συναντηθήκαμε "We were met"
(we met), βιάσου read as βιάζω, and four first senses of the source (βόλτα "turn", διασταύρωση "crossbreeding", καταβάλλω "to overcome",
ρίχνω "to drop (anchor)"). Koine: παρεκάλει "was summoning", ἀπέχοντος "having in full", ἀπολωλώς "having destroyed", ἄσωτος "not saved".

One verdict of the first audit was stale and is corrected: `lemma:el:τρίτος` and `lemma:el:δεύτερος` are now met only as the ordinals they are,
and are off the list. A verdict is given in a sentence; when a fix changes which sentences credit a unit, the unit is read again.

**For a native speaker or a Hellenist to review:** the 18 held units and the 11 remaining; the rule that a Modern reading takes over the
certainty of a Koine reading of the same letters; "I begin" for every middle form of ἄρχω and "it is necessary" for δεῖ; the dependent forms
(παίξουμε after θα) shown as plain presents; every verdict (the readers were AI models).

## Follow-up 2 (2026-11-27): confident misreadings (Bokmål, Nynorsk, German, Thai) and the form card

The second part of the follow-up: the cards where the analyser read the written word as another word, with confidence. This part changes three
analysers (Norwegian, both standards; German; Thai) and adds three rules to the gate for form cards in every language without attested forms.
The dictionary's own first sense (Thai กล้อง "pipe") and the misreadings of Russian, Hebrew and French are the next part.

### What was wrong, and the rule that fixes it

| Cause | Fix | Cards |
|---|---|---|
| **Norwegian:** a noun was carded as its look-alike verb and the other way round (`drikke`, `reise`, `snø`, `lære`, `stige`, `fiske`, `tunge`), because the place of an infinitive was only looked for right after `å` or a modal | `norwegian/context.ts`: the infinitive's place is found across adverbs, inversion and coordination (`vil gjerne lære`, `kan ikke drikke`, `å lese og skrive`); an object pronoun is not a subject; an imperative stands at the head of an instruction and after `og`; adjective against noun or verb, preposition against noun, by the neighbours | 38 of the 49 misread words collected from both standards' texts |
| **Norwegian:** a verb with its particle chose the wrong unit, and a few ordinary words were not in the word list at all | `norwegian/units.ts` (the particle belongs to the verb before it, not to a noun); new rows: `stige`, `mål`, `fiskar`, `røre`, `klare`, `tilsette`, `skrelle`, `fortsatt`, `like`, `legge fram`, `leggje fram`, `ta ut` | |
| **German:** `bitte` in the middle of a sentence was read as an imperative of `bitten`; bare `lieber` as the adjective `lieb`; a noun after a phrase as a verb (`Gebühren`, `Zwiebeln`, `Verfahren`, `Linken`) | `german/context-verbs.ts` (a stray imperative is demoted), `german/context-words.ts` (bare `lieber`; the word after a determiner phrase), rows for `abgehen`, `ankündigen`, `link`, `Verfahren` | 7 of the 8 named; the eighth (`Autobahn`) is a right card now |
| **Thai:** the ICU cutter left pieces of longer words, and a piece was carded as a word of its own (ชาน from ชานชาลา, มาส + อง for มา + สอง, ว่าย + อด + ขาย for ว่า + ยอดขาย) | new `thai/recut.ts`: ICU's pieces are checked against the course list and the installed dictionary's headwords and re-cut where another cut is clearly cheaper; `ว่า` after a verb of saying is cut off as "that"; a piece whose cut cannot be settled gets no confirmed reading, so no card. It never invents a word | 17 of the 28 named; the other 11 are the dictionary's first sense (next part) and stay held |
| **Every language whose forms are not attested in a table (all but Greek, Hebrew, Aramaic):** a form card is made from the spelling alone. Where the spelling is more than one word (Bokmål `lære`: "learn" and "doctrine"; Spanish `tarde`), it showed whichever word the spelling read alone came out as, whatever the sentence had said | the gate: a form whose own facts carry another reading gets no form card (`form-two-words`); a form the analyser only guessed, which the forms index lists under more than one headword, gets none either (`form-of-another`). The word's lemma card, made from the reading in the sentence, is untouched | Bokmål `hvile`, `lære`, `reise`, `rør`, `snø`, `stige`, and on the fresh texts `pakke`, `prøve`, `varme`; French `noël` |
| **German:** a finite form may be the stem half of a separable verb whose prefix stands at the end of the clause (`holt … ab` is `abholen`), and the form card `holt` showed `holen` | the gate: a finite form of a simple German verb gets no form card (`form-separable`); the infinitive, the participles, and a verb that already carries its prefix (`herankam`) keep theirs | nine form cards on the fresh text (`fängst`, `holt`, `kaufte`, `kündigt`, `mach`, `machte`, `ruft`, `schmecke`, `stellte`) |

### No other reading made worse (measured before and after)

| Measure | Before | After |
|---|---|---|
| Bokmål gold (`test/adapters/norwegian-gold.test.ts`): words with lemma and class right | 311 of 311; second set 116 of 116 | the same |
| Nynorsk gold | 91 of 91 | the same |
| Norwegian held-out (`norwegian-holdout.test.ts`), lemma / class / both: Bokmål | 398 / 404 / 396 of 406 | the same |
| The same, Nynorsk | 112 / 118 / 112 of 118 | the same |
| German gold (`scripts/de-gold.mts`), sentences right, four rounds | 84 of 84, 35 of 35, 46 of 48, 13 of 21 (the ten misses are its recorded limits) | byte-identical output |
| Shared gold sets (`scripts/gold-score.mts`), lemma / class / both. Thai: dev (214) | 198 / 174 / 174 | 199 / 175 / 175 |
| Thai: hard (74) | 58 / 50 / 49 | 59 / 53 / 51 |
| Thai: unseen (80) | 73 / 58 / 58 | the same |
| German: dev (215), hard (72), unseen (80) | 207 / 209 / 204; 69 / 68 / 68; 77 / 70 / 69 | the same |
| Bokmål: dev (215), hard (73), unseen (70) | 208 / 213 / 206; 53 / 62 / 53; 70 / 69 / 69 | the same, but hard 54 / 63 / 54 |
| Nynorsk: dev (215), hard (76), unseen (70) | 187 / 206 / 181; 52 / 63 / 51; 60 / 70 / 60 | the same |

No golden was re-recorded and no adapter version was raised. One floor was restated with its reason: `test/audit/linguistic.layers.test.ts`
counted 98 of 199 Albanian units it could ask about and now counts 97 (one more form is held by the form-card rules).

### What the form-card rules cost

The three rules hold form cards only; every lemma card is as it was. Cards admitted, development text / the old held-out text:

| Set | At the landing | Now |
|---|---|---|
| Albanian | 244 / 383 | 243 / 383 |
| Spanish | 305 / 579 | 302 / 576 |
| Hindi | 237 / 387 | 237 / 387 |
| Latin | 456 / 362 | 442 / 349 |
| Russian | 539 / 546 | 517 / 525 |
| French | 630 / 646 | 630 / 645 |
| German | 247 / 572 | 236 / 538 |
| Bokmål | 302 / 505 | 285 / 477 |
| Nynorsk | 387 / 389 | 372 / 371 |
| Thai | 371 / 753 | 373 / 717 |

In German, Norwegian and Thai the analyser changes move the counts too (Thai gains the words the re-cut finds).

What the rules hold, against what the readers had said of those same form cards before the rules existed (a form with no earlier verdict was
never a card: another check already held it):

| Language | Rule | Forms held | Read right before | Read false before |
|---|---|---|---|---|
| Bokmål | two words | 47 | 31 | 13 (`lære`, `reise`, `stige`, `varme`, `prøve`, `pakke`, `på`, `av`, `under` …) |
| Nynorsk | two words | 32 | 25 | 6 (`tunge`, `stige`, `lys`, `opne`, `unge`, `få`) |
| German | separable | 111 | 17 | 22 (`holt`, `ruft`, `fängst`, `machte`, `kaufte`, `ist`, `war`, `wurde` …) |
| German | of another word | 52 | 32 | 6 (`Gebühren`, `Zwiebeln`, `Verfahren`, `Buch`, `schöner`, `enge`) |
| German | two words | 12 | 9 | 2 |
| Thai | two words | 26 | 22 | 3 |
| Russian | two words | 43 | 34 | 9 (`в`, `о`, `есть`, `дни`, `стать`, `буду` …) |
| Latin | two words | 24 | 21 | 3 |
| Latin | of another word | 6 | 3 | 2 |
| Spanish | two words | 4 | 4 | 0 |
| Albanian, French | of another word | 1 each | 1 each | 0 |
| Hindi | none | 0 | | |

So about one form in four that these rules hold had been read as a false card, and three in four as a right one; each right one is a form card
that repeated its word's lemma card, which is still made. One pinned test moved for this, with its reason in the file:
`test/course/latin-goreview-gloss.test.ts` asserted the Vulgate lead "sin" on the form card `peccatum`; the form is two words (the noun and
the participle of `pecco`) and is held now, so the lead is asserted on the word's own card.

### The figures

The old held-out halves of the four sets are development material now (`dev2.txt`); each has a fresh `heldout.txt` of 90 sentences written for it
by an AI model (no Bible translation, no quoted text). It was read for the first time after the analyser rules were written and before the two
form-card rules were: the first-reading column is the blind figure.

| Set | Old named residue | Now, on that text | Fresh held-out: words / cards | New cards read / false at the first reading | Held by the rules written after it | Remaining, named |
|---|---|---|---|---|---|---|
| Bokmål | 17 | 0: the word is read rightly or the form is held (16), a right card (1) | 938 / 456 | 140 / 4 | 3 | 1 |
| Nynorsk | 4 | 0: all four read rightly | 934 / 376 | 84 / 3 | 0 | 3 |
| German | 8 | 0: seven read rightly or held by rule, one a right card | 1,035 / 426 | 164 / 13 | 9 | 4 |
| Thai | 28 | 0 admitted: 17 are no longer cards (the re-cut), 11 are on the known-limits list (ten first-sense cards and the piece ชาน) | 1,295 / 792 | 301 / 9 | 0 | 9 |

Known-limits units: Bokmål 7 → 1, Nynorsk 11 → 1, German 9 → 5, Thai 27 → 21; 95 in all languages (112 at the landing, 121 after the Greek part). The residue of the
other sets is as it was, except French 7 → 6: Albanian 1, Spanish 2, Hindi 3, Latin 7, Russian 13, French 6, Modern Greek 7, Koine 4, Modern Hebrew
14, Biblical Hebrew 2, Aramaic 0. With these four the named residue is 76 (130 at the landing, 117 after the Greek part).

**Held on the known-limits list.** Bokmål: `klare` read as the verb where the text has the adjective `klar`. Nynorsk: `tre` the numeral read as
the noun. German: the form cards `an` and `mit` (verb particles shown as prepositions), `morgen` (in `heute Morgen`), `Uhr` "hours", and
`verletzen` "to hurt oneself". Thai, misreadings: ชาน, นัก (twice), เหลือ, เจ้า; Thai, the dictionary's first sense (the next part): กล้อง "pipe",
น้ำตาล "palmyra palm juice", ภาค "good luck", เจ็บ "to be sick", เต้น "to spring", แต่ง, โล่ง "bare", กิโล "kilometer", as form and lemma.

**Remaining on the fresh held-out texts (17), named in `verdicts.json`.** Bokmål and Nynorsk: `når` "when" read as the verb `nå`; Nynorsk `annan`
shown "second", `like` in `like ved` read as the verb. German: `Die Fischer` read as the surname, `blass` as `blasen`, `weich` as `weichen`,
`das Rauchen` shown "to smoke". Thai: ทาสี "to paint" read as the noun "female slave", พริก cut out of พริกไทย, and the first senses วิดีโอ "VHS
cassette", แป้ง "meal", เงิน "silver" on the form card (the lemma card says "money; silver").

Four verdicts were read twice in the same sentence and the two readings disagreed (`Rauchen`, เงิน, กิโล as form and lemma); the stricter one
stands. A second reading overturns a verdict only when the fix changed the sentence the card comes from.

**For a native speaker to review.** Norwegian: the sentences of `test/adapters/norwegian-misreadings.test.ts`, the rule that a word after
`og` at the head of an instruction is an imperative, and the particle pieces left as they were (`ta med`: `med` stays an adverb of the unit).
German: the sentences of `german-misreadings.test.ts`; whether a finite form of a simple verb should have no form card at all, or only
verbs known to take a prefix. Thai: every re-cut in `thai-missegmentation.test.ts`, the two compounds kept split on the course plan's word
(ช่วย + เหลือ, ชาน + ชาลา), and the weights of the re-cut. All four: the fresh held-out sentences themselves (an AI model wrote them), the
held units, the remaining ones, and every verdict (the readers were AI models, not native speakers).

## Follow-up 3 (2026-11-27): the first meaning, and the misreadings of five more languages

The third part: cards whose reading is right but whose first meaning is not the word's ordinary meaning (Russian `стать` "to stand", Thai กล้อง
"pipe"), and the confident misreadings of Russian, French, Spanish, Hindi and Albanian. A change written for Hebrew was measured and rejected, and Latin is
left for a part of its own (both below).

### The first meaning: what was wrong, and what fixes it

| Cause | Fix | Cards |
|---|---|---|
| The gate's rule "the first CURRENT sense leads" did not engage when a machine word list had taken the first ITEM of a sense the entry marks archaic (Russian `платье`: the list says "clothes", the entry's first sense is "clothes, clothing" [archaic], the current one "dress, gown, frock") | `deck-gate.ts`: the word list's meaning is matched to a sense by its first item too | `платье`, lemma and form |
| A form card of the citation form showed a LATER sense of its own word: the card builder shows the first sense that is short, so a first sense of seven words was passed over (Russian `линия` "a cloth hall", `площадь` "space, living space"; French `campagne` "campaign"; Thai เงิน "silver (metal)"; Nynorsk `annan` "second"; Spanish `película` "film (layer)") | the citation form shows what its word's own card shows first; a form that already leads with that meaning keeps its own wording | the six named, and Russian `проезд`, `номер`, `нельзя`, Spanish `carro`, Hindi भाव and भी. In all, 269 form cards of fourteen sets are now worded as their word's own card; their verdicts are derived, not read again (the reading from the form's earlier verdict, the meaning from the word's card) |
| A form with no reading whose capital is lost (German `uhr`) took the dictionary entry's first sense ("hours") though the forms index lists the spelling under one word, whose card says "clock; watch; o'clock" | such a form shows its one listed word's own first meaning | `uhr`, and 28 German forms now worded as their noun's card |
| The German word list glossed `verletzen` with its reflexive row ("to hurt oneself") | the row is the verb's own: "to injure; to hurt (sich verletzen: to hurt oneself)" | `verletzen` |
| The dictionary entry HAS the ordinary meaning but lists another sense first and marks nothing (Thai กล้อง: "pipe", "binoculars", "camera"; Russian `стать`: "to stand" before "to become"; French `chômage`: "idleness" before "unemployment") | `deck-lead-senses.ts`: for each such word a reader found, the entry's OWN sense is named, verbatim, and the gate shows it first (two senses may be named: Thai กิโล "kilogram; kilometer"). No meaning is written that the dictionary does not have; when the entry no longer has the sense the word is held. 37 words: Russian 16, Thai 10, French 4, Hebrew 7 | Russian, Thai and French read again in their sentences: 29 of 30 right; Thai เต้น "to dance" is right as a meaning, but its sentence has ตื่นเต้น "excited", a cut the analyser still makes, so it stays held as a misreading. Hebrew (the entries carry healthy, to show, electricity, vegetable, study, hand; Biblical מעה "inward parts"): a table may be keyed by a VARIETY, since Biblical כנור is rightly "harp" and Modern is not; the word's form cards show the same meaning. `בריא` stays held because the analyser also reads הבריאות as the adjective |

No rule over the entry can choose the ordinary sense where the entry marks nothing. One was measured and rejected: "lead with the sense the entry
illustrates with the most usage examples". Over the cards already read, it would change 16 of the cards found to show a wrong first meaning and 403
cards read as right, many of those for the worse (Russian `идти` "to go" would become "to fall", `мы` "we" would become "I", `жёлтый` "yellow"
would become "of doubtful accuracy"). The stricter form (the first sense has no example, another has two or more) changes 2 and 72.

Held by name, because the source does not have the ordinary meaning or the reading is the fault: French `noël` (the entry is the
common noun "a Christmas gift"; the holiday is the name `Noël`), Albanian `na` (the clitic "us" is shown with its word's "we"), German `das Rauchen`
(shown "to smoke"), Russian `синоптик` (not in the dictionary), and **Greek**: each Greek entry named before carries ONE sense in the installed data
(`έναντι` "towards (in part payment)", `ίδιος` "own", `ρεύμα` "air current", `υπολογιστής` "self-seeker"; the Koine forms' English is built from the
lemma's one sense), so there is nothing to move forward: those words stay held or named as follow-up 1 left them.

### The misreadings: what was wrong, and the rule that fixes it

| Language | Cause and rule | Targets |
|---|---|---|
| Russian | A frequency prior ("much rarer than `село`") beat the sentence: `сел` after its subject was the noun "village", `спала` was `спасть`. New rules in `russian/sentence.ts`: a word right after its subject with an agreeing finite verb reading is that verb; after a verb that takes the accusative a genitive-only form gives way to a word that can be its object (`душ`, not `душа`). A lemma written as its own headword in the same case and number as the commoner one gets half the penalty, so `очки` "glasses" beside `очко` is undecided | `сел` and `душ` are read rightly now. `очки` and `спала` are closer (0.9 against 0.8, and a tie) but the wrong word is still first and still credited, so both stay held; `синоптик` is not in the dictionary (only `синоптика`) and is held; `банка`, `есть` were already held by the form rules |
| French | `entre` after a noun and before a noun phrase is the preposition; `parfait` after `être` is the adjective; `parce`, `tandis`, `pourvu` before `que` get no confirmed reading of their own (the phrase is the unit) | 3 of 3 |
| Spanish | `caso`, `gusto`, `marca` were not in the word list as nouns, so the verb form was the only reading; `comida` after `haber` was forced to the participle (a feminine or plural form after `haber` is the noun); `derecho` "straight ahead" after a verb of motion | 5 of 8 fixed; `mañana`, `tarde`, `goles` already read rightly in the sentence (their form cards are held by the two-words rule) |
| Hindi | Words with one reading never reached the sentence layer: rows added for गौरव "dignity", मना "forbidden", छाना; new `hindi/misreadings.ts`: a name against a common noun by its neighbours, जी before हाँ / नहीं, a participle before रहा, मना before होना or करना | 6 of 6. The audit then showed two faults of the new rows: छाता "umbrella" had become two readings and lost its card, and after that was mended धोती in `धोती हूँ` was read as the noun; both were fixed (a listed noun's own form stays the noun, except before an auxiliary) and are tested |
| Albanian | `kisha` "I had" beside `kishë` "church" were tied: after `unë`, or after a clause opener and before a quantity word, it is the verb; `kurse` "whereas" was not in the word list at all | `kurse` fixed; `kisha` fixed after `unë` and clause openers, but `ti kishe` is still read as "church", so `kishë` stays held; `lekë` and `verë` were read rightly (their form cards are the dictionary's) |

### No other reading made worse (measured before and after)

| Measure | Before | After |
|---|---|---|
| Russian, Universal Dependencies gold (`npm run ru:eval`, 56,824 words): first-reading lemma / class | 51,546 / 50,739 | 51,548 / 50,740 |
| Russian, the same: features of the first reading, lenient / strict | 36,391 / 16,433 | 36,394 / 16,432 (one word lower on the strict count; not traced) |
| Russian gold fixture (503 words), six measures | | identical |
| French, UD GSD first-reading lemma, dev / test | 26,703 / 7,401 | 26,708 / 7,402 |
| French fixtures | 519 of 524 | the same |
| Spanish, shared gold (`scripts/gold-score.mts`), lemma / class / both: dev 215, hard 82, unseen 80 | 206 / 202 / 195; 81 / 76 / 76; 66 / 66 / 60 | identical |
| Hindi, the same: dev 215, hard 68, unseen 80 | 204 / 195 / 192; 67 / 53 / 53; 71 / 68 / 67 | identical |
| Albanian, the same: dev 215, hard 70, unseen 70 | 204 / 192 / 183; 58 / 60 / 54; 63 / 61 / 55 | identical |
| German gold (`scripts/de-gold.mts`) after the `verletzen` row | | byte-identical output |
| Spanish and Albanian adapter tests | 1,486 pass | 1,515 pass (28 new) |

No golden was re-recorded and no adapter version was raised. On the texts already read, no card that had been read as right was lost to these rules
except the form cards the two-words rule now holds (Hindi छाता, whose word card stays), and no card they add was read as false.

### A Hebrew change, measured and rejected

Rules were written for Modern Hebrew (a whole Modern word beats prefix + Biblical word; the citation noun wins after a verb or preposition) and fixed
ten of the twelve named misreadings; their 21 tests and all seven Hebrew test files passed. Hebrew has no gold set, so the measure was the audit's own
texts, with and without the rules, against the readers' verdicts:

| Text | Cards without / with the rules | False cards without / with |
|---|---|---|
| development | 67 / 116 | 2 / 15 |
| second development (the old held-out) | 153 / 242 | 12 / 47 |
| fresh held-out | 225 / 350 | 17 / 57 |

The rules gave a confident reading to words that had none before, most of them function words (אם "if" as "mother", כי as "cauterization", על as
"yoke", עוד as "oud", למה as "llama"). The change is not in this part; the Hebrew misreadings stay held by name. A language with no gold set needs
this comparison before any analyser rule is accepted: passing tests is not a measure.

### Latin is left for a part of its own

The Latin fixes were written and measured (the evaluation of `scripts/latin-eval.mts` is unchanged or one tenth higher on every corpus) but are NOT
in this part. Writing them showed that the audit reads Latin with the 1,900-word seed list only, as GoReview does, while the reader extension
loads the full lexicon of 39,000 entries: six of the eleven Latin "misreadings" (`casa` read as `cado`, `poetas` as `peto`, `subito`, `vitium`,
`assis`, `mensam`) are read rightly by the extension and are faults of the seed-only reading alone. The audit's Latin lemma cards are therefore
partly cards the reader would never credit, and Latin's known-limits list holds real words because of it. Mending that means GoReview loading
the full Latin lexicon as the reader does (about 3.4 MB of source text, fetched once for a Latin learner, as French already fetches its own), and
reading every Latin card again. That is a decision for the owner; until it is made Latin's audit data is as it was.

### The figures

The old held-out halves of eight more sets are development text now (`dev2.txt`), and each has a fresh `heldout.txt`: 90 sentences written by an
AI model for Albanian, Spanish, Hindi, Russian, French and Modern Hebrew (no Bible translation, no quoted text); Genesis 22:1-18 for Biblical Hebrew and
Daniel 2:31-45 for Biblical Aramaic, from the editions already named. They were read for the first time after every rule, lead sense and list of this
part was written: the first-reading column is blind.

| Set | Old named residue | Now, on that text | Known-limits units | Fresh held-out: words / cards | False at the first reading | Named residue |
|---|---|---|---|---|---|---|
| Russian | 13 | 10 right cards, 3 no longer cards | 18 → 3 | 1,031 / 626 | 20 | 20 |
| French | 6 | 5 right cards, 1 held (`noël`) | 6 → 1 | 1,327 / 652 | 6 | 6 |
| Spanish | 2 | both read rightly (no longer cards) | 7 → 0 | 1,209 / 542 | 2 | 2 |
| Hindi | 3 | all read rightly (no longer cards) | 4 → 1 | 1,250 / 456 | 3 | 2 |
| Albanian | 1 | held (`na`) | 2 → 2 | 1,249 / 435 | 4 | 2 |
| Modern Hebrew | 14 | 7 right cards, 7 held | 5 → 13 (both Hebrew sets) | 971 / 225 | 17 | 14 |
| Biblical Hebrew | 2 | both held | | 293 / 92 | 4 | 1 |
| Biblical Aramaic | 0 | | 1 → 1 | 280 / 42 | 1 | 1 |

(False at the first reading counts every admitted card of the fresh text read as false or unknown; those whose unit is also false on an older text are
held by the list, the rest are the named residue.) On the eight fresh texts together: 57 false cards of 3,070 (1.9 %). The sets refreshed in the
earlier parts keep their held-out halves: Thai's named residue went 9 → 4 and its list 21 → 7 (the lead senses), Nynorsk 3 → 2 (`annan`), German's
list 5 → 3 (`uhr`, `verletzen`). Latin and Greek are as they were. (The Hebrew lead senses were added after the fresh texts' first reading, which the table gives.)

**Known-limits units: 95 → 57.** Russian `очко`, `синоптика`, `спасть`; French `noël`; Hindi जीना (for जी); Albanian `na`, `kishë`; German the forms
`an`, `mit`, `morgen`; Bokmål `klare`; Nynorsk `tre`; Thai ชาน, เหลือ, นัก (form and word), เจ้า, เต้น (form and word); Hebrew 13 (Modern and
Biblical together); Aramaic 1; Greek 18; Latin 6.

**Named residue, all fifteen sets: 76 → 77** (130 at the landing). The words named before are fixed or held; the 77 are what the fresh texts show.
They say plainly what this part did not change: a lead sense named for one word does nothing for the next word, and Russian in particular has many
entries whose first sense is not the ordinary one (20 of 314 new Russian cards: `руль` "rudder", `гроза` "thunder", `водитель` "guide", `шапка` "warm",
`настоящий` "present", `бутерброд` "butterbrot"; the reflexives `подниматься` and `спускаться` carded as their transitive verbs; `духами` as `дух`).
French: `box`, `chargeur`, `apprentissage`. Spanish: the imperative `Mezcla` read as the noun. Hindi: जाना read as जानना, सी in छोटी-सी as सीना.
Albanian: `të marrë` as the adjective, `shpëtim` "salvation" for a goalkeeper's save. Modern Hebrew: 14, mostly misreadings (חופשה "vacation" as "freedom").

**For a native speaker to review.** Every lead sense in `deck-lead-senses.ts` (37 choices made by an AI model: is the sense named the ordinary one?);
the Russian subject-verb and object rules and the list of verbs that take the genitive; French `entre` before a noun phrase and `parfait` after `être`;
the Spanish nouns added (`caso`, `gusto`, `marca`) and the motion verbs before `derecho`; the Hindi rows added (गौरव, मना, छाना) and the rule that a
listed noun's own form is the noun except before an auxiliary; Albanian `kisha` and `kurse`; the fresh held-out sentences themselves (an AI model wrote
them: the writer was least sure of the Albanian and of Hebrew spelling); every held and remaining unit; every verdict (the readers were AI models).

## Follow-up 4 (2026-11-27): the named cards held, the full Latin list, and fragments

The owner, on the two questions follow-up 3 left (the options chosen): "Hold them now" and "Load the full list". And the Arabic builder's check
that no admitted card's first meaning stops mid-phrase, run over every set.

### The named residue is held

Every card named on a held-out text (79 units over the fifteen sets) is on its language's known-limits list now, so the deck admits none of them.
Each set's `verdicts.json` keeps the names in `heldResidue` for later fixes; `residual` is empty. The list also carries what the full Latin list
brought (below): **known-limits units 57 → 155.** On the fifteen held-out texts this holds about 73 of 5,956 cards (1.2 %). A held unit is held
whole: a word read rightly elsewhere (`porta`, `avis`, `сохранить`) gets no card until its fault is fixed.

### GoReview loads the full Latin lexicon

As the reader extension always has (and as GoReview does for French): `leanBuiltins.ts` and `builtins.ts` wait for `loadLatinLexicon()`. With the
1,900-word seed alone, `casa` was read as `cado`, `poetas` as `peto`, `vitium` as `vicis`. With it go the Latin fixes written for follow-up 3:
a shortened genitive plural in -um loses to an ordinary cell of another word (`portum`); a greeting at the head of a sentence is the verb or
interjection (`Salve`); a capitalised opener with only plural common readings before a singular noun is the name; `nostrum` agreeing with a noun is
the possessive; after a preposition a rival noun in the wrong case is penalised more.

| Measure | Before | After |
|---|---|---|
| Latin evaluation (`scripts/latin-eval.mts --corpus main --gold`), lemma strict / lenient: New Testament | 95.6 / 97.6 | 95.7 / 97.7 |
| Cicero, Vergil, Ovid | 91.7/92.6, 89.5/90.0, 89.6/90.4 | identical |
| Latin development text: admitted cards | 442 | 509 |
| Start-up golden (`goreview.startup.golden.json`), re-recorded for this reason | | one reading differs in 18 sentences: `nihil` a noun, not a pronoun; the rest is candidate detail |

**What a Latin learner downloads.** The installable GoReview fetches the Latin analyser as chunks on first use: 3.41 MB (1.08 MB compressed)
against 0.36 MB (0.10 MB) before, once, then kept. The chunks are not precached: the precache (54 files, 3.05 MB compressed) is unchanged, so no
other learner downloads anything new. In the extension's GoReview the entry script is unchanged (6.04 MB) and the Latin list is a separate chunk
read from disk; the package grows by about 3 MB.

**Latin figures.** The old held-out half is development text now; the fresh half (90 sentences by an AI model, not a Latinist; read once with the
seed list, no rule written from it): 348 cards, 10 false at the first reading with the full list (2.9 %), all held by name now. All 241 new Latin
cards were read. For a Latinist: the 23 Latin units on the list, the greeting, `-um` and `nostrum` rules, and the sentences.

### Fragments

The check (`test/deck-audit/fragments.ts`, now part of the audit test) first flagged 79 admitted cards:

| Finding | Count | What it was |
|---|---|---|
| An unclosed bracket, Thai and Modern Greek | 5 | a fault of THIS audit, not of the app: it read a card's meaning only up to the first quote mark inside it (`time, turn (as in ทีหนึ่ง "once")`). The audit reads the whole meaning now, and the affected cards were read again |
| An unclosed bracket, Latin `timeo`, Russian `посыпать` | 2 | real. The gate cuts the unfinished aside (`timeo`); `посыпать` then reads "to pour", which a reader found wrong, so it is held |
| Ends in a preposition, "and", or a modal's "to"; begins a longer sense | 72 | read by an AI reader: all whole English ("from, by, of", "to take care of", "devoid of, free of", "a, an", "must, have to"). The check does not count a final preposition |

One more turned up with the check in place (Greek `πλαγιά`, a meaning left on a colon): the gate strips it. The audit now fails on an empty
meaning, a dangling comma, semicolon or colon, an unclosed bracket, a final article ("many a" excepted) or a conjunction that joins nothing.

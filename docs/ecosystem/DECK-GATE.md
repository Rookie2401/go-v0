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
npm run deck:audit -- <set> [--part dev|heldout] [--no-gate] [--strict] [--cards] [--held] [--json <file>]
npx vitest run test/deck-audit
```

Sets: sq es de hi th nb nn la ru fr el el-koi he he-bib arc. `test/deck-audit/deck-audit.test.ts` holds each set to: no machine finding; every
admitted card read with the meaning it shows (a new card, or a changed first meaning, fails until it is read); no false or unknown card on the
development text; exactly the named residue on the held-out text. A set whose dictionaries are not on the machine is skipped. The whole file
takes about twenty minutes.

When a reading or a meaning is fixed, take the unit off `deck-known-limits.ts` (or off `residual`) and let the test say whether the card is
right now.

# The Alphabet saved deck — 2026-11-14

The owner, 2026-11-14: "In the saved decks for every language, create and add an alphabet vocab deck."

Every language that has a pack now has a built-in saved deck named **Alphabet** in GoReview's Saved decks, beside Class Essentials (which seven
of the languages have). One card a letter: the letter on the front, its name and usual sound on the back, asked through the ordinary flashcard
flow (Recall the meaning, reveal, grade; Hear word through GoListen).

| language | cards | what is in it |
|---|---|---|
| Spanish | 30 | the 27 letters, then ch, ll, rr |
| Albanian | 36 | the 36 letters, digraphs included (dh, gj, ll, nj, rr, sh, th, xh, zh) |
| German | 30 | the 26 letters, then ä, ö, ü, ß |
| Norwegian Bokmål, Nynorsk | 29 | the 29 letters (one alphabet for both), ending æ, ø, å |
| Latin | 25 | the letters the Clementine Vulgate prints (i and j, u and v apart); Church sound first, classical where it differs |
| Greek | 24 | the 24 letters with their Modern Greek names; Modern sound first, the classroom value for ancient Greek where it differs |
| Hebrew | 27 | the 22 letters and the five final shapes; Modern Hebrew names and sounds |
| Biblical Aramaic | 27 | the same 22 letters and five final shapes; the names the pack's tutorial uses, and the conventional transliteration only |
| Thai | 77 | 44 consonants (name, meaning of the name, class), 29 vowel patterns, 4 tone marks |
| Hindi | 71 | 13 vowels, 33 consonants, 10 vowel signs, 4 marks, 4 conjuncts, 7 nukta letters |

## Where the letters come from, and what has not been checked

- **Thai and Hindi**: `packages/goreview/app/alphabetLetters.thhi.ts`, written by `scripts/alphabet-letters-build.mts` from the alphabet trainer's
  decks (`src/alphabet/thai.ts`, `hindi.ts`), which read the reader's own spelling tables. `test/goreview-app/alphabet-deck.test.ts` fails when
  the file and those decks differ. The trainer's own notes apply: machine-drafted, not checked by a teacher or native speaker.
- **The other nine**: `packages/goreview/app/alphabetLetters.ts`, written by hand for this deck (by an AI session) from the standard alphabets
  and letter names. **Not reviewed by a native speaker, a teacher, a Latinist, a Hellenist, a Hebraist or an Aramaist.** A sound hint is one
  usual value a letter, approximated for an English speaker; it is not a description of the language's sound system.
- Each deck's own `notes` say this (they are kept in the deck's record; the Saved decks page shows the name and the count only).

## How it works

- `packages/goreview/app/alphabetDeck.ts`. A letter's unit id is `class:<language>-alphabet:<letter>`: the `class:` prefix keeps the letters out
  of the ordinary queue, My vocab and the candidates exactly as it keeps the Class Essentials phrases out, and the third part is the label the
  screens show. `alphabetFacts` answers the exercise engine with the back of the card; nothing is written to the Repository's catalogue.
- The deck is seeded on the first visit with the stable id `alphabet:<language>`. A learner who already had Class Essentials gets the Alphabet on
  the next visit. Remove takes it out and it stays out until "Restore Alphabet".
- Under its card in Saved decks the Alphabet shows its own due reviews and its own missed letters; Class Essentials shows its own.
- The deck holds all its letters; a practice session takes the configured deck size, in alphabet order.

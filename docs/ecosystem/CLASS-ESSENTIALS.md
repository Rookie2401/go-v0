# Class Essentials

A permanent saved deck in GoReview's **Saved decks**: the fourteen topics every language class starts with, in the six target languages
(Spanish `es`, Albanian `sq`, Thai `th`, Hindi `hi`, German `de`, Norwegian Bokmål `nb`). Description (fixed by the owner): *Essential phrases for
language class.* A topic with several expressions is several cards; the numbers 1 to 10 are ten cards. **28 cards in each language.**

| topic | cards |
|---|---|
| 1 Hello and goodbye | Hello · Goodbye |
| 2 Please, thank you, I'm sorry | Please · Thank you · I'm sorry |
| 3 Excuse me | Excuse me |
| 4 Numbers 1–10 | one … ten (ten cards) |
| 5 How much is this? | 1 |
| 6 My name is… / I'm from… | My name is… · I'm from… |
| 7 Where is the restroom? | 1 |
| 8 Water / Bottled water | Water · Bottled water |
| 9 I would like… | 1 |
| 10 Do you speak English? | 1 |
| 11 I do not understand | 1 |
| 12 I don't speak the country's language, but I would like to learn. | 1 (names the language: "No hablo español, …") |
| 13 Jesus is the Savior! | 1 |
| 14 One coffee, please! (bonus) | 1 |

## How it works

- **Where the data is:** `packages/gopractice/classEssentials.ts` (the table, `classCards`, `classDeckFor`, `classFacts`). Nothing in the Repository.
- **Seeding:** the first visit to Saved decks (or the home, which counts them) adds the deck for the active language to that learner's saved decks,
  with the stable id `class-essentials:<lang>`. Calling it again finds the deck and adds nothing; no card is ever duplicated (a unit id is
  `class:<lang>:<phrase>` and a repeated phrase is dropped). It needs no GoLearn encounter.
- **Remove / Restore:** Remove takes the deck out and remembers that; a quiet "Restore Class Essentials" link on Saved decks brings it back.
- **Practice:** Practise again plans the cards as written-recognition cards and they go through the existing flashcard flow (phrase on the front, "Recall the
  meaning", the English meaning on the back, the four self-grades, Hear word through GoListen). `classFacts` tells the exercise engine each phrase and its
  English meaning (status `provisional`, so the explanation carries the usual "not reviewed" caveat).
- **Kept apart from the ordinary queue:** class cards never appear in the home's deck, the candidates, the intake proposals, the details page's deck, or My vocab
  (`isClassUnit`). Their reviews are ordinary review events, recorded on the device and synced like any other.
- **No transliteration:** the flashcard format has no field for it, so Thai and Hindi are shown in their own scripts only.

## What was checked, and what was not

No class phrase list existed in the repository or the conversation, so the translations were written for this deck. Each phrase was then compared with the
dictionaries on disk (`data/dictionaries/kaikki.org-dictionary-*.jsonl`, a headword check: every word of the phrase, and the phrase itself when it is an entry).
A headword check shows a word exists; it does not show the phrase is the most natural thing to say.

| language | checked against | result |
|---|---|---|
| Spanish | Wiktionary (kaikki) | 27 of 28 phrases have every word found (the multiword ones as entries too: Por favor, Lo siento, Agua embotellada, No entiendo); *seis* was not located in the extract but is the ordinary word |
| German | Wiktionary (kaikki) | 26 of 28 fully found; *Toilette* and *Deutsch* were not matched by the check (capitalised nouns), both are ordinary words |
| Hindi | Wiktionary (kaikki) | 23 of 28 fully found; not matched: पाँच (the entry is spelled पांच), बोतल, उद्धारकर्ता, कॉफ़ी (nukta spelling), and the gendered final sentence |
| Thai | Wiktionary (kaikki) | single words and the components of the sentences found (สวัสดี ลาก่อน กรุณา ขอบคุณ ขอโทษ ห้องน้ำ ที่ไหน เข้าใจ กาแฟ หนึ่ง แก้ว เท่าไหร่ อยากได้ …); Thai has no word spaces, so whole sentences were not matched; ครับ, ภาษา, พระเยซู were not found as headwords |
| Albanian | Wiktionary (kaikki) | numbers, greetings, Faleminderit, Ujë found; inflected verb forms (*kushton, flas*) and *tualeti* are not headwords in the extract |
| Norwegian Bokmål | only the 419-lemma corpus frequency list (`public/dict/nb/frequency.json`) and the ladder text | almost nothing could be checked: *hei, takk, vann, kaffe, vær så snill* and *unnskyld* appear; everything else rests on the author's knowledge |

**Not checked against any source (the author's own knowledge, to be confirmed by a native speaker):** all register choices (formal *Disculpe*, *Habla*, *Sie*; Thai
*กรุณา* for "please", the polite particles ครับ/ค่ะ and the pronoun pair ผม/ฉัน; Hindi *माफ़ कीजिए*, the masculine/feminine pairs, *हैं* for Jesus), the "Bottled water"
renderings (*Wasser in Flaschen*, *Flaskevann*, *Ujë në shishe*, *น้ำดื่ม*, *बोतल का पानी*), the Savior renderings (*Retter*, *Frelseren*, *Shpëtimtari*, *พระผู้ช่วยให้รอด*,
*उद्धारकर्ता*) and every Norwegian Bokmål phrase. The deck carries this in its own `notes` field: "Written for this class and not yet reviewed by a native speaker."

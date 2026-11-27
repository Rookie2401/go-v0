# French Decoding Sprint

**Status: machine-drafted, not checked by a native speaker.** Everything here was written by an AI model for the French (`fr`) pack. It describes the common pronunciation of France; Québec, Belgium, Switzerland and Africa differ in places, and where this document is not sure it says "usually" or leaves the rule out.

## What it is

An optional, short course for an English speaker with no French: the least a beginner needs to start decoding written French. It is **optional and skippable**: the learner can start reading real pages at once, and the sprint is always available later. It adds no application, database, card type or audio backend; it is data in two places that already exist.

## Where it lives

| Part | File | Notes |
|---|---|---|
| Six stages | `packages/language-packs/src/tutorial/fr.ts`, `FR_TUTORIAL_STEPS_OWN` (inside `FR_TUTORIAL`, built with `orientation()`) | Step ids `sprint-1-recognition` … `sprint-6-read-now`, between the practice lookup and the honesty step. |
| Alphabet deck rows | the same file, `FR_ALPHABET_ROWS` | 69 `[glyph, back]` rows in the style of the Spanish rows of `packages/goreview/app/alphabetLetters.ts`; the lead copies them into GoReview as `LetterRow[]`. |
| Spelling-to-sound rules | `src/adapters/french/graphemes.ts` (`frenchGraphemes`, `FRENCH_PATTERNS`) | The source of the table the stages summarise. |
| Notes and liaison | `src/adapters/french/pronunciation.ts` (`frenchPronunciation`, `liaison`, `H_ASPIRE`, `NO_LIAISON_INITIAL`) | Notes on the card; the IPA is the dictionary's and is only passed on. |

## The six stages

1. **Immediate recognition.** Real expressions with meaning, said roughly: Bonjour, Merci, Salut, Oui, Non, Je suis ici, C'est bon, Je veux de l'eau, Je ne sais pas, Comment ça va ?
2. **Vowel spellings.** ou, oi, au/eau, ai/ei, eu/œu, u, and the nasals an/en, on, in/ain/ein, un; each "usually", with one real word each, and the nasal rule: a vowel is nasal only when the n or m is not followed by a vowel or another n or m (bon / bonne, an / année, in / inutile).
3. **Silent letters.** Final d, p, s, t, x, z usually silent; final c, r, f, l usually said (CaReFuL), with the exceptions named; final -e silent but it makes the consonant before it heard (petit / petite); parle, parles and parlent said alike; -ent on a noun, adjective or adverb is nasal a.
4. **Liaison and enchaînement.** Required (les amis, nous avons, vous êtes, un enfant, petit ami), optional (after a plural noun, forms of être, pas, mais), never (after et, before h aspiré: les héros; before onze, oui). Described, not heard.
5. **Elision and contraction.** l'homme, j'aime, c'est, qu'il, n'est; au = à + le, aux, du, des. The elided word is its own token (a card of its own).
6. **Read now.** A six-sentence passage of the drafter's own text using only what stages 1 to 5 taught, with an English line under each sentence.

## What it deliberately does not teach

- No IPA and no transcription by rule: a word's IPA comes from the dictionary (`analysis.candidates[0].notes.ipa`) when present. A rule is "usually", never "always".
- No verb tables, no tenses, no gender or agreement rules: the card and the analyser carry those.
- No recordings and no speech: the pack has none; a device voice is practice only and audio never counts as evidence of understanding.
- No vowel length, no Québec, Belgian, Swiss or African phonology, no huit / septante / nonante variants, no schwa dropping, no stress or intonation.
- No exhaustive exception lists (a rule the drafter was not sure of is left out).

## Honesty notes

- Machine-drafted and unreviewed; the tutorial's `notice` and every passage say so. Review needed: a native speaker.
- The standard described is the common pronunciation of France. Un and in are one sound for many speakers in France and two elsewhere; the stage says so and tells the learner not to worry about it at first.
- Liaison is described, not heard. Which optional liaisons are made differs by speaker, region and register.
- A rule is "usually". Where the spelling cannot decide (-ent on a verb or not, final consonants of plus, tous, six, huit), the grapheme is marked `context` or `uncertain` and the card says so.
- The word list holds about 3,400 lemmas plus the dictionary; the sprint's example words are checked against the real analyser by the pack-wide tests, not by this document.

## Checks

`test/adapters/french-pronunciation.test.ts` (graphemes, H_ASPIRE, liaison, notes) and `test/language-packs/french-tutorial.test.ts` (structure, six stages, passage, Alphabet rows). They check behaviour and shape, not that the French is natural.

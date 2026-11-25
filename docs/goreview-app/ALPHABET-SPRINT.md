# Alphabet Sprint

The owner, 2026-11-17: adjust the saved Alphabet deck into Alphabet Sprint. The goal is the shortest path from an unfamiliar writing
system to reading real words. The alphabet is never the goal.

## A. What existed (audit, 2026-11-17, master 62ee41fe)

- **GoReview** had a built-in Alphabet saved deck (`packages/goreview/app/alphabetDeck.ts`, 2026-11-14).
  - It had one card per letter, frozen in alphabet order.
  - Each card was asked as a written-recognition flashcard.
  - The unit ids were `class:<lang>-alphabet:<glyph>`.
  - A `class:` unit is kept out of the ordinary queue, My vocab and the candidates. It still gets real events (`CardAdded`, `CardReviewed`
    through the device queue to the Repository) and an FSRS card in the same fold as every other card (`model.classDeck`).
  - Saved-deck practice is `intent: explicit`, capped by the deck size, the microdeck target and the session time.
- **Scheduling**: `ts-fsrs` 5.4.2 (FSRS-6) through `src/scheduler/fsrs.ts`.
  - Short-term learning steps run inside a session.
  - A card answered Easy waits until it is due.
  - The schedule is never stored. It is folded from the event log.
- **The Repository** keeps six levels per unit (`repository-engine/src/levels.ts`), computed from evidence, never from FSRS.
  - Any recognition judgement counts as an "encounter".
  - So built-in deck reviews (Class Essentials, Alphabet) were already counted in the vocabulary listing and the encountered-words figures.
    Nothing on the server filtered `class:` ids.
- **The extension** reads pages through GoLearn Active (`content/active.ts`, `active/scan.ts`): visible text plus one screen of margin,
  debounced mutations, same-origin frames only. Inputs, editable regions, hidden text, navigation and headers are skipped.
  - There is no "% words known" figure. The popup shows "N words read …; K known" from the device Repository's lemma and form rows.
  - content.js was 335 bytes under its 564 KB cap. background.js was already over its 1,180 KB cap on master (1,209,578 bytes).
- **Letter data**:
  - Hand-written letter tables for es, sq, de, nb, nn, la, el, he and arc (`alphabetLetters.ts`).
  - Thai and Hindi tables written from the readers' own decoders (`alphabetLetters.thhi.ts`, `src/alphabet/{thai,hindi}.ts`).
  - Decoders and romanisers: `decodeThai`, `decodeHindi` and `transliterateHindi`, `transliterateHebrew` (pointed forms),
    `transliterateGreek` (modern, koine, erasmian), and Norwegian `transcribe`.
  - Every gloss is machine-drafted or third-party, and none is native-reviewed. Frequency lists are local and git-ignored.

## B. What Alphabet Sprint does

The Alphabet tile in Saved decks plans a fresh Sprint session every time it is opened (`packages/goreview/app/alphabetSprint.ts`,
`packages/language-packs/src/alphabet-sprint/plan.ts`):

1. **Due cards first.** The scheduler's own decision decides. A card answered Easy and not yet due is not asked.
2. **A few new units, chosen by reading utility** (`select.ts`).
   - The first session gets 4–6 units, depending on the script. A later session gets fewer while earlier units are still shaky.
   - Each unit is followed at once by a real word it makes decodable.
   - A plain letter always comes first: a sign or a rule is shown on a letter.
3. **A contrast card** when the learner has missed one of two confusable units, or when both arrive in the same session.
4. **A short phrase** once five or more words are decodable.
5. **More real words** made of known units that the learner has not met yet (new combinations), until the deck size is reached. Never
   filler: when nothing new is decodable, the session is shorter.

Card kinds and ids (`ids.ts`). All of them are `class:` units:

| kind | id |
|---|---|
| character (letter, final form, vowel sign, mark, digraph, cluster, tone mark) | `class:<lang>-alphabet:<key>` (the old deck's ids, so earlier practice carries over) |
| rule | `class:<lang>-alphabet-rule:<key>` |
| word | `class:<lang>-alphabet-word:<form>` |
| phrase | `class:<lang>-alphabet-phrase:<form>` |
| contrast | `class:<lang>-alphabet-contrast:<a>\|<b>` |

A reading tradition other than the default adds `~<tradition>` (Greek Classical: `class:el-alphabet~classical:β`).

The tile shows practical progress, never a completion percentage:
- "Start with a few letters and read your first word."
- "You can read 23 words. 3 useful letters to learn next."
- "You can read 41 words. Ready to try a webpage."
- With page counts it adds: "Letters on your pages you can read: 62 %."

**Placement.** There is no exam. The first cards are the most useful units. A learner who already knows one answers Easy: FSRS sends it
weeks away, its knowledge level rises, and the next session introduces more new units. The learner can stop at any time.

### Selection

```
utility(S) = Σ words S makes decodable (UNLOCK + USE·weight)
           + PARTIAL · Σ other words (weight × share of their missing units S supplies)
           + PAGE · share of the page's unit occurrences S covers × (words / 10)
           − Σ u∈S (COST·difficulty(u) + CONFUSION if u's look-alike is not ready, doubled if both are new)
```

- Greedy steps with a lookahead of two units.
- A lookahead of three when no pair makes any word readable. A pointed abjad needs letter, vowel and letter.
- Deterministic. The weights are exported as `SELECT_WEIGHTS` = { UNLOCK 1, USE 2, PARTIAL 0.6, PAGE 3, COST 0.25, CONFUSION 0.4 }.

Measured against the traditional alphabet order (starter words decodable after 10 units; `test/alphabet/sprint-*.test.ts`):

| | es | sq | de | nb | nn | la | el | el classical | he | arc | th | hi |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sprint | 215 | 233 | 156 | 220 | 263 | 244 | 16 | 22 | 17 | 12 | 18 | 22 |
| alphabet order | 86 | 143 | 45 | 210 | 252 | 219 | 2 | 5 | 0 | 0 | 0 | 0 |

## C. Languages

| language | profile | starter words / phrases | modelled | pronunciation on the back | notes |
|---|---|---|---|---|---|
| es | `profiles/es.ts` | 290 / 5 | 100 % | none (spelling is transparent once the rules are known) | only what an English reader would read wrong is taught; the other letters are familiar |
| sq | `profiles/sq.ts` | 300 / 7 | 100 % | none | digraphs via the pack's `sqLetters` |
| de | `profiles/de.ts` | 300 / 7 | 100 % | none | umlauts, ß, sch, ch, ei and ie, sp/st, final devoicing, long vowels; rules applied by spelling (compounds can be misread) |
| nb, nn | `profiles/norwegian.ts`, `nb.ts`, `nn.ts` | 242 / 3, 280 / 3 | 99.6 %, 100 % | the pack's `transcribe` respelling | tone is not taught (the pack's tone data is unverified) |
| la | `profiles/la.ts` | 280 / 6 | 100 % | none | Church sound first, classical second; macrons folded away (vowel length not taught) |
| el Modern | `profiles/el.ts` EL_PROFILE | 150 / 16 | 100 % | `transliterateGreek(…, 'modern')` | Modern words come from the course texts and the gold file, glossed from the local Modern index |
| el Classical | EL_CLASSICAL_PROFILE (el-att, el-koi, el-hom) | 300 / 0 | 100 % | `transliterateGreek(…, 'erasmian')` | Koine-core lemmas; Modern knowledge counts here only as "seen" (the shape is known, the sound value is not) |
| he | `profiles/he.ts` (shared `hebrew-script.ts`) | 370 / 0 | 100 % | `transliterateHebrew` | see the Hebrew rules below |
| arc | `profiles/arc.ts` | 300 / 0 | 100 % | none (the pack has no Aramaic transliteration) | its own words from ARAMAIC_SEED; never Hebrew words |
| th | `profiles/th.ts` | 288 / 0 | 91 % | decoder romanisation and tone ("khao (rising)") | tone is shown on every word; the tone rule is a dependency only where a mark's tone depends on class; shapes alone never give the tone, and the notes say so |
| hi | `profiles/hi.ts` | 297 / 0 | 100 % | `transliterateHindi` (ISO 15919) | taught as syllables: inherent a, vowel signs, virama, conjuncts, schwa deletion (as the pack's decoder decides it) |

**Hebrew rules:**
- Only pointed forms are decoding exercises.
- An unpointed word is unsupported: it cannot be decoded from letters alone, so it is never counted as decodable.
- Cantillation, meteg, maqaf and sof pasuq are not needed to read a word.
- Begadkefat in the Biblical reading is noted, not taught as its own tradition.

**Not supported:** Cyrillic, Arabic and Chinese, because no pack exists. The framework (`types.ts`) takes a profile for any script; a
character-based script needs a profile whose units are components and characters, and must not claim that components make a character
decodable.

**Review:** every profile and every starter list is machine-drafted from the packs' own data. None has been reviewed by a native speaker,
a teacher or a specialist, and each profile's `notes` say so.

## D. Knowledge in the Repository

Script knowledge is not stored separately. It is read from the learner's Sprint cards (`knowledge.ts`), whose answers are ordinary
`CardReviewed` events. That gives Alphabet Sprint the Repository's existing machinery:
- event ids and idempotent appends;
- acknowledged pushes, retry with backoff and queue persistence;
- the `seq` pull;
- account scoping (`local:<device>` before sign-in, uploaded on sign-in);
- "Clear local data".

A second device that pulls the events has the same knowledge. Nothing is shown as synced before the queue is acknowledged; that is the
existing sync status.

Script levels (script meanings, not vocabulary meanings):

| level | when |
|---|---|
| new | no card, no evidence |
| seen | introduced (a card exists), or recognised in another tradition only |
| recognized | one direct right answer, or two words decoded that needed it |
| familiar | two direct right answers, the last not a miss |
| known | three direct right answers on two days, at least one real word decoded with it, the last not a miss |
| automatic | known, four direct right answers on three days, FSRS stability ≥ 21 days |

Evidence rules:
- A decoded word is evidence for each unit it needs, worth half a direct answer, counted once per review.
- A missed word is no evidence against any one unit.
- A page that shows a letter, a hint opened or a card merely shown is no evidence.
- Familiar Latin letters count as ready and say so (`basis: familiar-shape`).

**Decoding is never vocabulary.** A Sprint word card (`class:es-alphabet-word:casa`) is a different unit from the word
(`lemma:es:casa:NOUN`). Reviewing it changes no lemma or form record, no My vocab entry and no page "known" mark.
- `isVocabularyUnitId` (repository-contract) names the rule.
- The vocabulary listing and the encountered-words counts of every store (memory, IndexedDB, SQLite, Postgres) now leave `class:` ids out.
  They had counted Class Essentials and Alphabet reviews before.
- No projection, schema or migration change.

## E. GoReview

- The built-in deck stays `alphabet:<lang>`, removable and restorable as before.
- Opening it calls `planAlphabetSprint` instead of the stored letter list. The stored list is kept only for older builds.
- The plan's cards become `Wanted` entries for the ordinary `assemble`: eligibility, deck size, microdeck target and session time all apply.
- Every card is a written-recognition flashcard: tap to flip, Again / Hard / Good / Easy.
- `sprintFacts` answers the exercise engine with the front and back from the profile.
- "Review due (N)" counts every Sprint card of the language that is due.
- Profiles load per language as separate chunks (`profiles/index.ts`), so no app carries every word list.

## F. The extension and real pages

- GoLearn Active already asks the worker about the words on screen (MSG.activeProfile, ids such as `form:he:<word>`).
- The worker counts the characters of those word forms, each distinct form once (`background/pageScript.ts`).
  - Nothing new leaves the page, and content.js does not grow.
  - The worker keeps per-language single-character counts only: no word, sentence, address or title.
  - Older counts decay ×0.9 per batch, with at most 400 characters and 20 languages.
  - The counts are cleared with local data and never sent to the service.
- GoReview, an extension page, reads one language's counts (MSG.pageScript, extension pages only).
  - It turns them into unit counts with the profile (`alphabetPage.ts`). They raise the units those pages use (Workflow C).
  - It shows the share of page letters the learner can read on the Alphabet tile.
- The web build has no counts and uses the starter words alone.

## G. Readiness and denominators (`readiness.ts`)

- A word token is a run of letters and marks. Punctuation, digits, spaces and symbols are not tokens. Every occurrence counts.
- Diacritics and points belong to their word and count where the profile models them.
- A token the profile cannot model (another script, an unpointed Hebrew word, a Thai spelling the decoder does not settle) is
  unsupported. It stays in the denominator of decodable tokens and is reported separately.
- With no tokens the figures are undefined, never 0 % or 100 %.
- The vocabulary figure (words known) is not touched.

## H. Tests

- `test/alphabet/sprint-kit.ts` holds the checks every profile passes:
  - unit keys, and the old deck ids carried over;
  - real words with sources, ≥ 90 % modelled;
  - beats alphabet order;
  - the first word as soon as the script allows;
  - no repeats;
  - id round trip.
- Per-language tests: `sprint-<lang>.test.ts` (final forms, dagesh, unpointed is unsupported, final sigma, digraphs, conjuncts, schwa
  deletion, tone marks, tradition ids and transfer …).
- `test/alphabet/sprint-engine.test.ts` covers the brief's workflows A–F, no false mastery, due first, Easy waits, no filler, contrasts,
  page-driven selection, deterministic weights and readiness denominators.
- `test/alphabet/sprint-integrity.test.ts` covers class: ids out of the vocabulary counts, letter counts only (privacy), decay, clearing
  and counting from form ids.
- `test/goreview-app/alphabet-deck.test.ts` covers the real GoReview app: the tile, opening as a Sprint through the flashcard flow, the
  event recorded under the Sprint id, the ordinary queue never meeting it, due counts, remove and restore.
- `test/extension/security.test.ts`: a content script can neither read nor write page-letter counts.
- Every word list reproduces: `npx vite-node scripts/alphabet-sprint/<lang>.mts --check`.

## I. Limitations

- No profile or starter list is native-reviewed. Glosses are machine-drafted or Wiktionary, Dodson or BDB first senses.
- There is no audio of its own. Word cards keep GoReview's "Hear word" where GoListen has a voice.
- There are no pseudowords and no unpointed Hebrew decoding exercises.
- Hindi, Hebrew and Aramaic have no phrases (their tutorials have no translated sentences); Thai has none either.
- Page counts come from the words Active asks about: distinct words on screen per tab, not every occurrence. They need GoLearn Active
  on that page.
- There is no on-page letter assistance on the word card yet. content.js has no room left (335 bytes on master); it belongs in the
  analyser chunks, which have no cap.
- There is no script-readiness line in the extension popup. It needs the learner's script knowledge in the worker. The figure is on the
  Alphabet tile instead.
- background.js was over its cap on master before this work (1,209,578 of 1,208,320 bytes). Alphabet Sprint adds about 2.1 KB (the
  page-letter store and the vocabulary rule). The cap is the owner's to raise; it has not been changed.
- The success metrics (time to the first decoded word and so on) are measurable from the existing events: the first word card answered
  Good or Easy against the first Sprint card's time. No dashboard is built.

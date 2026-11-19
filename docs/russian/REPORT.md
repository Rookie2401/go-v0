# Russian pack: completion report (2026-11-18)

Branch `feat/russian-pack`. The brief's ten questions, answered from what was built and measured. Design: `PLAN.md`. What the repository required: `AUDIT.md`. The index build's figures: `INDEX.md`. The measurement: `EVAL.md` and `eval.json`.

## 1. Architecture

Russian is one more language pack on the existing infrastructure. Nothing new was created beside it: no app, no vocabulary store, no scheduler, no audio service, and nothing imports Reading Analysis.

Reused as they are: the pack manifest and runtime (`packages/language-packs`), the kaikki dictionary pipeline (`src/dict`), the sharded form-index loader that Hebrew and Greek use (`src/adapters/shared/shards.ts`), the extension's lazy analyser chunks and lexicon preparer, GoLearn Active's scanner and its six levels, the Repository's unit ids, GoReview's facts provider and FSRS scheduler, GoListen's voice registry, the Alphabet deck.

Where Russian is registered: `src/core/{model,config}.ts` (language `ru`, script `Cyrl`, course `russia-ru`), `src/adapters/index.ts`, `packages/language-packs/src/{registry,builtins,catalogue,evidence,index}.ts` and `tutorial/index.ts`, the extension (`analysers/ru.ts`, `analysers/loaders.ts`, `parser/registry.ts`, `vite.config.ts`, `lexicon/prepare.ts`, `protocol.ts`, the voice lists), GoListen (`deviceTags.ts`, `registry.ts`), GoReview (`leanBuiltins.ts`, `packFacts.ts`, `vite.config.ts`, the Alphabet deck).

Added:
- `src/adapters/ru.ts` and `src/adapters/russian/**`: the analyser.
- `packages/language-packs/src/packs/ru.ts`, `ru-grammar.ts`, `tutorial/ru.ts`: the pack, its grammar tables, its orientation.
- `packages/golearn-extension/src/language/cyrillic.ts` and Cyrillic branches in `language/resolve.ts` and `active/pageLanguages.ts`: Cyrillic is shared by several languages, so a page is Russian only when it says so, the learner chooses Russian, or its text shows it.
- `scripts/ru-build-index.mts` (the form index), `ru-eval-ud.mts` (measurement), `ru-pack-grammar.mts`, `ru-alphabet-deck.mts`, two probes, `ru-core-seed.txt`.
- Two small changes to shared dictionary code, both Russian-only in effect: a verb form's lemma is read without the aspect label the source appends ("стать pf"); three case names were added to the forms index's list of grammatical tags.

## 2. Linguistic data

| Source | Used for | Licence |
|---|---|---|
| Wiktionary's Russian entries, tables and form-of pages, via kaikki.org (extract last modified 2026-10-30; 443,260 lines) | every reading, gloss, stress mark, aspect and aspect partner; the dictionary | CC BY-SA 4.0 |
| UD Russian-GSD, train split | counts only: the order of the readings of an ambiguous form | CC BY-SA 4.0 |
| UD Russian-GSD dev/test, Taiga dev/test, PUD | measurement only; nothing shipped | CC BY-SA 4.0 / 3.0 |

Not used: SynTagRus (non-commercial licence). Not imported: OpenCorpora, OpenRussian, pymorphy3 (Wiktionary alone covered the need; see section 10).

Sizes: the dictionary has 436,039 entries (62,460 full records with inflection tables, 650,677 forms in the forms index). The analyser's form index holds 923,009 written forms and 1,457,710 readings of 55,215 lexemes, in 467 compressed shards (9.6 MB). The compiled core holds 1,536 lexemes (760 KB). Attribution is in `THIRD-PARTY-NOTICES.md`, in every manifest and on every card that shows a dictionary meaning.

## 3. Morphological capabilities

Read from the source's own labels, never generated: the six cases in singular and plural, plus the second locative (в году́), the partitive (ча́ю) and the vocative where the source lists them; gender; animacy; long and short adjectives; comparatives and superlatives; pronouns and numerals; verbs in present, past (by gender), the future of perfective verbs, imperative, infinitive; reflexive verbs; participles (active and passive, present and past, long and short) and adverbial participles, each filed under its verb; aspect on every verb, and the aspect partner the dictionary names.

Independently verified: the analyser's first reading was scored against three human-annotated treebanks (section 4), and 54 hand-picked tokens of real sentences are pinned one by one against the treebank's annotation (`test/adapters/russian-gold.test.ts`).

Limits that matter:
- Every reading is Wiktionary's. A word Wiktionary lacks has no reading (proper names above all: about half have one).
- Forms written alike keep every reading. The sentence reorders them by local rules; there is no parser.
- Two words that differ only in stress (за́мок, замо́к) are one item with both stresses and meanings.
- The analytic future (бу́ду чита́ть) is explained as a pattern, not listed as a form.
- Pre-1918 spelling is not read.

## 4. Contextual accuracy

First reading, all five treebank files, 56,824 words, final analyser with the full index:

| Measure | Result |
|---|---|
| words with a reading | 94.4 % |
| right dictionary word | 90.7 % (96.1 % of the words that have a reading) |
| right part of speech | 89.3 % |
| features right, a union containing the right value accepted | 95.0 % |
| features right, exact | 42.9 % |

On the three held-out test sets the strict lemma figure is 88.4 % (GSD), 89.4 % (Taiga), 90.8 % (PUD, fully independent of anything the analyser saw). On the development set 78.6 % of words are read with high confidence, and those first readings are right 94.8 % of the time; the words left as "conflicted" are the hard ones (77 %).

The exact-features figure is low for two stated reasons: the treebanks mark voice on every verb and the pack does not, and a union ("nominative or accusative") counts as wrong.

Sense selection: the card shows the dictionary's senses in the dictionary's order; nothing chooses a sense by context. Multiword expressions: 123 phrases, 120 of them dictionary headwords with the dictionary's gloss; the single words stay readable.

## 5. Repository integration

Russian units use the existing ids: `lemma:ru:<headword>:<POS>` when the reading is confident, else `form:ru:<form>`. The six states, the marks, the rules for New and Seen and the sync path are the shared ones; no Russian-specific rule exists. Checked by the shared tests that every pack passes (start-up, status, bindings, varieties) and, in a real browser with a stand-in worker, by a lookup turning a word from New to Seen.

Not verified: a real account, sync between devices, and persistence across a browser restart with the unpacked extension. These need the owner's browser and account.

## 6. GoReview integration

GoReview loads the Russian analyser as its own chunk, loads the form-index shards for a card's words before its facts are built, ships the Russian dictionary and index in its build, and has the 33 letters in its Alphabet deck. The deck is an Alphabet Sprint (`packages/language-packs/src/alphabet-sprint/profiles/ru.ts`): the same 33 letter cards, five of them (а к м о т) treated as already readable, five reading rules applied by spelling (stress and weaker vowels, the last consonant of a word, г said v in -ого and -его, -тся and -ться, жи ши ци), 300 real starter words and 4 phrases (`words/ru.ts`, built by `scripts/alphabet-sprint/ru.mts`). The Sprint cards are script practice and never count as vocabulary, as for every language. Scheduling is the existing FSRS; nothing was changed. A card gets lemma, meaning, morphology and the dictionary's table through the same provider as the other packs.

Not verified end to end: a Russian card reviewed in the real GoReview app. One GoReview test fails until a photo exists (section 10).

## 7. Runtime performance

Measured on the built extension, with master 22be2d7e merged in (Reading Analysis and Alphabet Sprint are in both figures):

| Item | Size |
|---|---|
| Russian analyser chunk (loaded when a Russian word is first read) | 850 KB |
| content script | 581.4 KB (575.5 KB on master without Russian) |
| background worker | 1,225.4 KB (1,195.8 KB on master without Russian) |
| form-index shards shipped with the extension | 9.6 MB in 467 files; largest 0.28 MB compressed |

A lookup loads only the shards of the sentence's words. In the browser run, nine lookups over three paragraphs fetched 39 shards; GoLearn Active scanned an 89-word page in 0.4 ms. Not measured: memory in the browser, first-lookup time on a slow device, a very long page.

## 8. Testing

- Russian tests: text and index store, index build, tags and morphology, context, constructions, phrases, pronunciation, numbers, production checks, alphabet, the gold fixture, the pack (with every validation case and the real dictionary), Cyrillic detection.
- The shared tests that pin the language list were updated to include Russian; the GoReview start-up golden gained a Russian entry and no other language's entry changed.
- Type check: clean.
- Real browser: the real content script, analyser and shards on `packages/golearn-extension/harness/active-ru.html` (no `lang` attribute). Detected as Russian from its text; a Ukrainian and an English paragraph left untouched; cards for прочитала, стали (as the noun, after из), шел (ё restored), a word outside the core (its shard loaded), a participle, a verb of motion; no console errors.

Unverified: see sections 5, 6, 7.

## 9. Release

See the lead's hand-over message for the commit and branch. Nothing is deployed. Publishing needs the owner's yes and goes through the release manager: the extension build, the hosted dictionary `dict/ru` and GoReview.

## 10. Remaining work

Incomplete implementation:
- GoReview's home photo for Russian: every pack needs a credited photo. A candidate is identified on Wikimedia Commons (St Basil's Cathedral, by Юрий Д.К., CC BY 4.0); the file must be supplied by the owner.

Unverified linguistic accuracy:
- The Alphabet Sprint's sound hints, rules and starter-word meanings. A starter word from the core list carries the first Wiktionary sense; nineteen common words whose first sense is not their usual meaning were left out by hand, and others may remain.
- No native speaker or Russianist has reviewed anything. The grammar explanations, the preposition table, the verbs-of-motion table and the pronunciation notes are AI-drafted.
- Sense choice in context is not attempted.

Missing data:
- Proper names and rarer vocabulary beyond Wiktionary. OpenCorpora (CC BY-SA 3.0) would add lemmas and forms without meanings or stress.
- A frequency list for the dictionary (it has none: no Russian library is bundled).
- Recorded audio: none; a device or remote synthetic voice only.

Optional later: a parser-free but wider sentence layer, pre-1918 spelling, a reading ladder of public-domain texts.

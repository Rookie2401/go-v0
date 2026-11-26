# Arabic and the GoReview deck: the gate

The owner's landing condition (2026-11-25): **no false word and no unknown word may appear in the GoReview deck.**
The analyser may READ a word it is not sure of (the GoLearn card shows every reading, marked); GoReview may only DRILL a word the pack is sure of. This page says how that line is drawn, what is on the known-limits list, what the audit measured, and what a learner sees.

## The gate in plain words

A word becomes a card only if **all** of these hold. Each is a rule of `src/adapters/arabic/deck.ts`; the table `AR_DECK_LIMITS` in that file is the one list (the unit tests, the audit and this page read it).

1. **Real entry.** Its headword and part of speech are an entry of the Arabic word list (a lemma id of the index, or a closed-class entry). A clitic fragment, a guess from the shape of a word, a name the source does not list, a participle or verbal noun with no entry of its own: not drilled.
2. **A meaning.** The entry has an English gloss.
3. **A decided reading.** Confidence at least 0.5; identity not undecided / partial / rare; no second lexeme also credited; a spelling restored (hamza, ى, ة put back) only when the reviewed identities list names it; not flagged dialect or foreign. A word that is undecided between N readings says so ("undecided between 3 readings: more evidence must decide").
4. **Not a known limit.** Its written form (or its lexeme) is on the generated known-limits list below. A broken plural that is an entry of its own, and a pronoun written differently from its entry, are held for the same reason (they teach the wrong spelling).
5. **A trusted leading meaning.** The index row's `Sense` is `Rev` (a reviewed choice) or `One` (exactly one real sense, no homonyms). `Ord` (several unlabelled senses, the source's first), `Lab` and a row with no `Sense` key are NOT eligible. Closed-class entries (hand-written one-line functions) are exempt.
6. **A meaning that fits the part of speech.** A verb's first meaning begins "to "; a noun's, an adjective's and a pronoun's does not.
7. **Never a bare form.** No `form:ar:<written form>` unit is ever a card, whatever the analyser reads for it: a bare form cannot be told apart from its look-alikes, and GoReview used to pick a lexeme for it from the bare key through the dictionary (أقرأ became "to ratify", الجديدة became a town). They are `requires-review`.

An eligible Arabic unit is `provisional` at most (the pack is experimental and machine-drafted): recognition cards only, as the engine's gate table says.

## How the engine reads it

The mark is on the **candidate set**, written by the analyser, in the names Biblical Aramaic already uses:
`notes.reviewStatus = 'requires-review'`, `notes.reviewReason = <one sentence>`, plus `notes.deckLimit = <rule id>`. The readings themselves (confidence, order, lemma, gloss) are not changed; every reading of a held token carries the mark. `arMarkForDeck` runs at the end of `analyze` and `refine` in `src/adapters/ar.ts`.

* `statusOf` (language-packs/analysis.ts) and `statusFor` (the resolver) turn the mark into the status `requires-review` (never `conflicted`: `conflicted` means sources disagree). `eligibilityFor` never lets such an analysis support an item; intake says "needs-validation".
* **Lemma units** (`lemma:ar:<head>:<POS>`) are never stored by the Repository: GoReview recovers them from the pack facts (`createFactsProvider` -> `lemmaFacts`), which read the head alone through the adapter and take its status from the mark. A marked head is dropped by recovery.
* **Form units** (`form:ar:<key>`) are registered by the Repository as bare forms. For Arabic the resolver now records them `requires-review` (`BARE_FORM_HELD` in `repository-linguistics/src/resolver.ts`), and the facts provider answers `requires-review` for any `form:ar:` unit without building a lemma or a meaning (`packages/goreview/src/facts/deck-holds.ts`, `heldFormFacts` in `facts/provider.ts`).
* A card's meaning is the one the audit judged: `lemmaFacts` puts the index's one-line gloss (the reviewed / single one) first and the dictionary's other senses after it.

## The known-limits list is generated

`npm run ar:deck-limits` (`scripts/ar-deck-limits.mts`, pieces in `scripts/ar-deck-limits-lib.mts`) runs the real adapter, the compiled core plus every shard, over `regression.json`, `msa-dev.json` and `msa-dev-vocalized.json` (the sets the pack was tuned on: exactly the sweep) and writes `src/adapters/arabic/generated/deck-limits.ts`:

* `AR_KNOWN_LIMITS`: a written form (the printed form NFC when the page had vowels, else its unvocalized key) whose top reading was credited (>= 0.5) with a lemma that differs BY LETTERS from the reference lemma;
* `AR_LIMITED_LEMMAS`: the lexeme that was wrongly credited (a lemma id the extension records for a misread word names the entry, not the word met, so that lexeme is held too).

`test/adapters/arabic-deck-limits.test.ts` re-runs the sweep and fails when the file is out of step. Today: 9 written forms, 7 lexemes.

## What the audit measured

`test/goreview/arabic-deck-audit.test.ts` (harness `arabic-deck-audit.support.ts`), text `test/fixtures/arabic/deck-audit.json`: 367 words of unvocalized prose (news, encyclopedia, narrative), written for the test, machine-written and machine-annotated, frozen 2026-11-25, never tuned on. The real path: the extension's own word naming (`wordsOfText`, whole index) -> encounter events -> the Repository folds and registration -> GoReview recovery (core plus the shards its loader fetches) -> the engine's ranking of stored units -> intake. Every admitted card is checked: headword in the index with a meaning, gold lemma, the leading meaning shared with the gold meaning (a content word, after dropping to / a / the), a verb "to ", no leading sense labelled archaic / obsolete / dated / rare / dialectal / historical while another is unlabelled, no fragment, and no form card.

| | today (index rows with their `Sense` class) | SIMULATION: rows without `Sense` read as `One` |
|---|---|---|
| words / distinct | 377 / 309 | 377 / 309 |
| **admitted cards** | **111** (lemma 111, **form 0**) | 167 (form 0) |
| **false** | **1** (see below) | 1 (the same) |
| **unknown or fragment** | **0** | 0 |
| held back (distinct words) | 188 = 60.8% | 122 = 39.5% |
| held back by rule | sense-unreviewed 92, undecided 74, plural-entry 5, pronoun-form 3, known-misread-lemma 2, derived 2, recovery 9 (see below), no reading 1 | undecided 74, sense-unreviewed 24, plural-entry 5, pronoun-form 3, known-misread-lemma 2, derived 2, recovery 11, no reading 1 |

* The simulation only exercises the other rules on open-class words; it is **not** what is admitted today.
* "Recovery" = the facts provider refused the lemma head read alone (a rival reading within 0.15 makes the facts `conflicted`) or had no facts (a number such as ملايين).
* Held words stay readable: after the marks every word token still has the same readings with the same confidences as the analyser gave (asserted).
* **AB1** (the auditor's eight words: أقرأ, أطير, شاء, تحدث, مواطن, الجديدة, الجزيرة, إن): no card, form or lemma, exists for any of them, today or in the simulation (asserted). Each stays in the candidate list for the GoLearn card.
* **The one false card**: وِزَارَة (leading meaning "a government department", gold "ministry"). Its index row is a reviewed (`Rev`) one; the meaning is the reviewer's, the audit's keyword check disagrees. It is listed in `OPEN_MEANING_FINDINGS` in the audit test so that a NEW finding fails the suite and a reviewed one must leave the list. Target: empty.

## What a learner sees

Nothing is taken away from the reading. A held word is still read by the analyser, still shown on the GoLearn card with all its readings (the undecided ones marked), and can still be marked as known or unknown. It is simply not drilled in GoReview until the pack can decide it: a bare or undecided word never becomes a card, and a word whose leading meaning has not been reviewed waits for that review. The reason is in the analysis (`notes.reviewReason`) and, for a form unit, in the facts (`lexicalRecognition.reason`).

## Paths that do not pass the analyser's notes

* A `form:ar:` unit already in a learner's Repository from before this change was registered `provisional`. The facts provider refuses it (`requires-review`) whenever intake fetches its facts; intake fetches facts for the cards it may admit, but under a facts budget (`factsBudgetFor`) a candidate beyond the budget is judged on its stored eligibility alone. Old stored Arabic form units therefore need a one-time re-registration (or the engine's eligibility refusing `ar` forms), see the report to the release manager.
* An encounter recorded from the core alone (before the shards loaded) can name a lemma id the full index would not credit: the lemma gate reads the head again on the GoReview side, with whatever shards its loader fetched, so a lemma the core alone cannot decide is held (`partial`).
* The extension names `lemma:ar:` ids from the best reading's confidence only; it does not read the mark. A lemma id minted for a misread word (تلك credited to ذٰلِكَ) is held at the lemma level (`pronoun-form`, `known-misread-lemma`). The proper fix is for `wordsOfText` (`packages/golearn-extension/src/active/scan.ts`) not to mint a lemma id for a candidate whose `notes.deckLimit` is one of the "misread" rules.

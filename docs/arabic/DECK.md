# Arabic and the GoReview deck: the gate

The owner's landing condition (2026-11-25): **no false word and no unknown word may appear in the GoReview deck.**
The analyser may READ a word it is not sure of (the GoLearn card shows every reading, marked); GoReview may only DRILL a word the pack is sure of. This page says how that line is drawn, what is on the known-limits list, what the audit measured, and what a learner sees.

## The gate in plain words

A word becomes a card only if **all** of these hold. Each is a rule of `src/adapters/arabic/deck.ts`; the table `AR_DECK_LIMITS` in that file is the one list (the unit tests, the audit and this page read it).

1. **Real entry.** Its headword and part of speech are an entry of the Arabic word list (a lemma id of the index, or a closed-class entry). A clitic fragment, a guess from the shape of a word, a name the source does not list, a participle or verbal noun with no entry of its own: not drilled.
2. **A meaning.** The entry has an English gloss.
3. **A decided reading.** Confidence at least 0.5; identity not undecided / partial / rare; no second lexeme also credited; a spelling restored (hamza, ى, ة put back) only when the reviewed identities list names it; not flagged dialect or foreign. A word that is undecided between N readings says so ("undecided between 3 readings: more evidence must decide").
4. **Not a known limit.** Its written form (or its lexeme) is on the generated known-limits list below. A broken plural that is an entry of its own, and a pronoun written differently from its entry, are held for the same reason (they teach the wrong spelling).
5. **A trusted leading meaning.** The index row's `Sense` is `Rev` (a reviewed choice) or `One` (exactly one real sense, no homonyms). `Ord` (several unlabelled senses, the source's first), `Lab` and a row with no `Sense` key are NOT eligible. A closed-class lexeme is judged the same way, with one more way in: its gloss is a single hand-written gloss of `closed.ts`, not a numbered "1. ... 2. ..." merge (مَا, لَا and لَيْسَ are held for that), and the reading is not a homonym merge. A gloss that numbers several dictionary entries is held for every word (the safety net `numbered-gloss`).
6. **A meaning that fits the part of speech.** A verb's first meaning begins "to "; a noun's, an adjective's and a pronoun's does not.
7. **Never a bare form.** No `form:ar:<written form>` unit is ever a card, whatever the analyser reads for it: a bare form cannot be told apart from its look-alikes, and GoReview used to pick a lexeme for it from the bare key through the dictionary (أقرأ became "to ratify", الجديدة became a town). They are `requires-review`.

An eligible Arabic unit is `provisional` at most (the pack is experimental and machine-drafted): recognition cards only, as the engine's gate table says.

## The two kinds of hold

Every reason of `AR_DECK_LIMITS`, which kind it is, whether it sets `notes.reviewGate = 'yes'` (the name of Korean's shared gate), and which id the word is credited to in the learner's vocabulary:

| reason (rule id) | kind | reviewGate | the extension credits the word to |
|---|---|---|---|
| no-reading | reading | yes | form id |
| not-an-entry | reading | yes | form id |
| guess | reading | yes | form id (no lemma: a guess is never credited) |
| derived | reading | yes | form id |
| dialect | reading | yes | form id |
| undecided | reading | yes | form id (confidence < 0.5 already mints no lemma) |
| two-lexemes | reading | yes | form id |
| restored-spelling | reading | yes | form id |
| known-misread-form | reading | yes | form id |
| known-misread-lemma | reading | yes | form id |
| pronoun-form | reading | yes | form id |
| numbered-gloss (safety net) | reading | yes | form id |
| sense-unreviewed | meaning | no | **lemma id** |
| gloss-pos | meaning | no | **lemma id** |
| no-meaning | meaning | no | **lemma id** |
| plural-entry | meaning | no | **lemma id** |

Each rule also writes `notes.reviewKind` (the shared gate's class of reason, which the GoLearn card reads to say why a held word is not added to review), the `kind` column of `AR_DECK_LIMITS`:

| reviewKind | rules |
|---|---|
| unlisted | no-reading, not-an-entry, derived |
| no-meaning | no-meaning |
| two-words | undecided, two-lexemes (`notes.reviewRivals` = the other lexemes' vocalized headwords, best first, at most 6) |
| undecided-entry | numbered-gloss |
| low-confidence | guess, restored-spelling |
| known-limit | known-misread-form, known-misread-lemma |
| other-listed-word | plural-entry, pronoun-form |
| other-variety | dialect |
| meaning-unreviewed | sense-unreviewed, gloss-pos (kind 2: no reviewGate) |

`notes` values in this codebase are `string | string[]`, so `reviewRivals` is a `string[]` (no join needed). The gate's tests use synthetic candidates for the numbered-merge and pronoun-form rules, so they hold whatever the analyser does for تلك / هذه.

* **Kind 1, an unreliable READING**: the analyser cannot stand behind what the word IS. The mark carries `reviewStatus`, `reviewReason`, `deckLimit` and `reviewGate = 'yes'`; the extension (`wordsOfText` in `active/scan.ts`, `itemIdsFor` in `parser/index.ts`) credits the word to its `form:ar:` id only, so no lemma is credited for a misread word.
* **Kind 2, a decided, real lemma whose first MEANING is unreviewed** (or does not fit): the reading is right, so the lemma IS credited in the learner's vocabulary; the mark carries `reviewStatus`, `reviewReason` and `deckLimit` but no `reviewGate`, the facts say `requires-review`, and GoReview makes no card, neither from the lemma unit nor from a form unit. When the meaning is reviewed (the index row's `Sense` becomes Rev) the very same lemma becomes eligible: the audit proves it by serving the same shard rows once with `Sense=Ord` (no card) and once with `Sense=Rev` (the card appears).
* A word is never held twice: the first rule that applies decides, reading holds first.

## How the engine reads it

The mark is on the **candidate set**, written by the analyser, in the names Biblical Aramaic already uses:
`notes.reviewStatus = 'requires-review'`, `notes.reviewReason = <one sentence>`, `notes.deckLimit = <rule id>`, and for reading holds `notes.reviewGate = 'yes'` (`heldByReviewGate` in deck.ts). The readings themselves (confidence, order, lemma, gloss) are not changed; every reading of a held token carries the mark. `arMarkForDeck` runs at the end of `analyze` and `refine` in `src/adapters/ar.ts`.

* `statusOf` (language-packs/analysis.ts) and `statusFor` (the resolver) turn the mark into the status `requires-review` (never `conflicted`: `conflicted` means sources disagree). `eligibilityFor` never lets such an analysis support an item; intake says "needs-validation".
* **Lemma units** (`lemma:ar:<head>:<POS>`) are never stored by the Repository: GoReview recovers them from the pack facts (`createFactsProvider` -> `lemmaFacts`), which read the head alone through the adapter and take its status from the mark. The card's first meaning is the credited (head, POS) candidate's gloss (the index row's one-line gloss), never a join the provider builds; a numbered merge ("1. chief 2. big") is held by the safety net.
* **Form units** (`form:ar:<key>`) are registered by the Repository as bare forms. For Arabic the resolver records them `requires-review` (`BARE_FORM_HELD` in `repository-linguistics/src/resolver.ts`); the facts provider answers `requires-review` for any `form:ar:` unit without building a lemma or a meaning (`heldFormFacts`, `facts/deck-holds.ts`), and `app/packFacts.ts` has an explicit branch that sends every `form:ar:` unit there (no shard is fetched for it).
* Answer checking: `acceptedMeanings` (exercises/shared.ts) treats sense numbering as a separator, so a numbered gloss never leaves "leader 2. big" as an accepted answer.

## The known-limits list is generated

`npm run ar:deck-limits` (`scripts/ar-deck-limits.mts`, pieces in `scripts/ar-deck-limits-lib.mts`) runs the real adapter, the compiled core plus every shard, over `regression.json`, `msa-dev.json` and `msa-dev-vocalized.json` (the sets the pack was tuned on: exactly the sweep) and writes `src/adapters/arabic/generated/deck-limits.ts`:

* `AR_KNOWN_LIMITS`: a written form (the printed form NFC when the page had vowels, else its unvocalized key) whose top reading was credited (>= 0.5) with a lemma that differs BY LETTERS from the reference lemma;
* `AR_LIMITED_LEMMAS`: the lexeme that was wrongly credited (a lemma id the extension records for a misread word names the entry, not the word met, so that lexeme is held too).

`test/adapters/arabic-deck-limits.test.ts` re-runs the sweep and fails when the file is out of step. Today: 9 written forms, 7 lexemes.

## What the audit measured

`test/goreview/arabic-deck-audit.test.ts` (harness `arabic-deck-audit.support.ts`), text `test/fixtures/arabic/deck-audit.json`: 367 words of unvocalized prose (news, encyclopedia, narrative), written for the test, machine-written and machine-annotated, frozen 2026-11-25, never tuned on. The real path: the extension's own word naming (`wordsOfText`, whole index) -> encounter events -> the Repository folds and registration -> GoReview recovery (core plus the shards its loader fetches) -> the engine's ranking of stored units -> intake. Every admitted card is checked: headword in the index with a meaning, gold lemma, the leading meaning shares a content word with the gold meaning (or is in the visible `REVIEWED_EQUIVALENT_MEANINGS` table, size printed in the summary line), a verb "to ", no numbered merge, no leading sense labelled archaic / obsolete / dated / rare / dialectal / historical while another is unlabelled, no fragment, and no form card.

On the merged tip (index with its `Sense` classes):

* words 377, distinct 309; **admitted 148** (lemma 148, **form 0**); **false 0**; **unknown or fragment 0**; admitted with no gold behind them 13;
* **held back 143 distinct words = 46.3%**: numbered-gloss 22, undecided 73, pronoun-form 3, known-misread-lemma 1, known-misread-form 1, derived 2, plural-entry 5, sense-unreviewed 22, no-meaning 2, no reading 1, recovery 11;
* "recovery" = the facts provider refused the lemma head read ALONE: the facts said `conflicted` because a rival reading within 0.15 of the head's own (0.60 "structural" against 0.45 "undecided") exists when the head is read without its page, or there were no facts (ملايين). Eleven words: الطلاب, محادثات, الوزير, بالسعادة, فأجاب, الناس, أخبار, الفريق, حملت, الرياح (all `conflicted`) and ملايين (no facts). In those words the page word was decided by its clitics or its sentence, and the head alone is not: the gate sees only the head because only the unit id travels. The smallest change that would carry the decision: let the extension record, beside `lemma:ar:<head>:<POS>`, the page word's own decided status (one bit, "decided / not") on the encounter event it already writes, and let recovery read that instead of re-reading the head; not built.
* Held words stay readable: after the marks every word token has the same readings with the same confidences (asserted).
* **AB1** (أقرأ, أطير, شاء, تحدث, مواطن, الجديدة, الجزيرة, إن): no card, form or lemma, exists for any of them (asserted).
* `REVIEWED_EQUIVALENT_MEANINGS` has one entry: وِزَارَة "a government department" = gold "ministry" (the lead: the source's wording of the modern sense).

## What a learner sees

Nothing is taken away from the reading. A held word is still read by the analyser, still shown on the GoLearn card with all its readings (the undecided ones marked), and can still be marked as known or unknown. It is simply not drilled in GoReview until the pack can decide it: a bare or undecided word never becomes a card, and a word whose leading meaning has not been reviewed waits for that review. The reason is in the analysis (`notes.reviewReason`) and, for a form unit, in the facts (`lexicalRecognition.reason`).

## Paths that do not pass the analyser's notes

* A `form:ar:` unit already in a learner's Repository from before this change was registered `provisional`. The facts provider refuses it (`requires-review`) whenever intake fetches its facts; intake fetches facts for the cards it may admit, but under a facts budget (`factsBudgetFor`) a candidate beyond the budget is judged on its stored eligibility alone. Old stored Arabic form units therefore need a one-time re-registration (or the engine's eligibility refusing `ar` forms), see the report to the release manager.
* An encounter recorded from the core alone (before the shards loaded) can name a lemma id the full index would not credit: the lemma gate reads the head again on the GoReview side, with whatever shards its loader fetched, so a lemma the core alone cannot decide is held (`partial`).
* The extension names `lemma:ar:` ids from the best reading; since the fix batch it does not credit a lemma to a reading with `notes.reviewGate = 'yes'` (`active/scan.ts` `wordsOfText`, `parser/index.ts` `itemIdsFor`; keyed on the note, no language check), so a misread word is recorded as its form unit only. The lemma-level holds (`pronoun-form`, `known-misread-lemma`) stay as a second line for lemma ids minted by an older extension.

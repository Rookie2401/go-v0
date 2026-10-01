# PLAN 10 — the dictionary decides what the rules only guess (contract v8)

Owner's instruction (2026-10-01): download the Spanish dictionary and use it; ship the dictionaries; go as far as
possible without book texts. Status words as in `docs/READINESS.md`.

## The problem

The Spanish adapter explains any word form by rule. For a word outside its 1,701-lemma list the lemma is a guess
(`trabucaban` → "trabucar"?): confidence 0.6 at most, no gloss, sometimes several guesses, sometimes a lemma that
does not exist. Until now the importer let a dictionary analyse only a word the adapter said *nothing* about, so in
Spanish — where the rules always say something — the dictionary could only stand beside a guess.

## The rule (language-neutral)

A reading can be marked `unconfirmed` by its adapter (`AnalysisCandidate.unconfirmed`). For a word token whose
readings are all unconfirmed, an installed dictionary decides:

1. The dictionary has the form → its entries become the readings (origin `dictionary`, its id as source). Where a
   dictionary reading and a rule reading agree on the lemma (and do not contradict each other's grammatical
   features), the reading keeps the rule's features and word parts and is stored at `CONFIRMED_BY_DICTIONARY`
   (0.7): two independent sources agree. A dictionary reading no rule matched keeps the usual dictionary confidence
   (0.6 with one part of speech, 0.45 with several). A guess the dictionary does not list is dropped.
2. The dictionary does not have the form → the guesses stay exactly as they are (still marked uncertain).
3. A word the adapter's own data vouches for is never touched: the dictionary stands beside it, as before.
4. An inflected form's gloss is its **lemma's** gloss, read from the lemma's own dictionary entry (a second lookup
   round); a form-of entry has no gloss of its own and its label ("first-person singular of …") never becomes one.
5. After the merge the adapter orders readings by context once more (`LanguageAdapter.refine`), so that a
   dictionary-supplied noun/verb pair is ordered by the same neighbour rules as a word-list pair.
6. An author's span and a reviewer's correction still win outright. Provenance is never blurred: a merged reading
   says `dictionary`, and carries the rule that agreed in `notes.rule`.

Nothing changes when no dictionary is installed, or for a language whose adapter marks nothing unconfirmed.

## Packages

| | Owner of | Does |
|---|---|---|
| **I1 ingest** | `src/ingest/plan.ts`, `src/ingest/import.ts`, `test/ingest/dictionaryDecides.test.ts` (+ existing `test/ingest/dictionary.test.ts` where a count changes) | rules 1–6 in `planDocument` / `dictionaryCandidates` / `planWithDictionary`; plan statistics (`dictionary.decided`); the import record says how many words the dictionary decided |
| **E1 Spanish adapter** | `src/adapters/es.ts`, `src/adapters/spanish/disambiguate.ts`, `test/adapters/spanish-refine.test.ts` | `unconfirmed` on inferred readings; `refine`; neighbour rules accept dictionary readings; `morphFromTags` for the real tag inventory (sent by the coordinator once the file is read) |
| **Coordinator** | `src/core/**`, `scripts/eval-es-*.mts`, `scripts/probe-kaikki-es.mts`, `test/integration/spanish-dictionary.test.ts`, docs | download and build; tag inventory; held-out evaluations; integration test; browser audit |

Held-out discipline, as for Thai: evaluation data from the dictionary is split in two by a hash of the lemma (or of
the sentence). Package authors see and tune on `dev` only; `test` is run by the coordinator and reported as is.

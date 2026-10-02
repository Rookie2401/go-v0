# PLAN 12 — the Hindi course foundation (contract v10)

Owner's brief (2026-10-01): build Hindi to the standard of Thai and Spanish, as a text-first comprehensible-input
environment — engineered Hindi → native children's Hindi → general native Hindi → unrestricted reading — reusing the
existing architecture. Design and status of record: `docs/HINDI_COURSE.md`. Status words as in `docs/READINESS.md`.

Three sessions work in this repository at once (Spanish, German, Hindi). **A Hindi package edits only the files
named for it below.** Never `git add -A`; no git commands that change the tree; targeted test runs only.

## What is reused unchanged

Import format v2 and the atomic importer (exact text, versions, publication gate, "Your copy"); the learner model
(`form:hi:…`, `lemma:hi:…`, `phrase:hi:…`, `pattern:hi:…`, `orth:hi:…` items; reading, listening and production
kept apart; exposure ≠ comprehension); layered help (gloss → phrase → grammar → sentence → English) and stage
assistance profiles (Thai); script decoding on the word sheet, romanization only as a recorded rescue (Thai);
streams, shelves that never lock, rights states, the library, personal difficulty and ranking (Spanish); regional
and historical varieties (Spanish); the dictionary as a separately sourced layer that decides what rules only guess
(`AnalysisCandidate.unconfirmed`, PLAN10); testimony writing (GoTell) on the adapter's `checkProduction`.

## What Hindi adds, and where

| Package | Owns (and nothing else) | Delivers |
|---|---|---|
| **H1 script** | `src/adapters/hindi/script.ts`, `pronunciation.ts`, `translit.ts`, `orth-exceptions.ts`, `test/adapters/hindi-script*.test.ts`, `hindi-pronunciation*.test.ts` | akṣara segmentation; pronunciation by rule with schwa deletion, each unit with its confidence; ISO 15919 transliteration (rescue only); writing-system items; lossless search form and spelling variants |
| **H2 morphology** | `src/adapters/hindi/morphology.ts`, `morph-*.ts`, `test/adapters/hindi-morph*.test.ts` | any noun, adjective, pronoun, postposition-fused or verb form analysed by rule, with the rule in words, a confidence, and whether the lemma is vouched for; paradigm generation |
| **H3 lexicon and adapter** | `src/adapters/hi.ts`, `src/adapters/hindi/entries.ts`, `lexicon-*.ts`, `registers.ts`, `test/adapters/hi.test.ts`, `test/adapters/hindi-lexicon*.test.ts`, `test/adapters/hindi-wiring.test.ts` | the word list (rows), register layers and register pairs, the adapter wiring of H1 / H2 / H4 |
| **H4 multiword and grammar** | `src/adapters/hindi/phrases.ts`, `constructions.ts`, `disambiguate.ts`, `sentences.ts`, `production.ts`, `test/adapters/hindi-phrases*.test.ts`, `hindi-constructions*.test.ts`, `hindi-production*.test.ts`, `hindi-sentences*.test.ts` | compound verbs and complex predicates as lexical units; the construction inventory; neighbour rules for homographs; sentence splitting; writing checks |
| **H5 course and Stage 0** | `src/course/hindi.ts`, `data/corpus/hi/s0*.json`, `docs/hindi/STAGE0.md`, `test/content/hindi-*.test.ts`, `test/course/hindiCatalog.test.ts` | ladder (Stage 0A/0B/0C, Classes 1–12, Open Reading) as shelves with assistance profiles; streams; the catalogue with rights records; the first canonical controlled stories |
| **Coordinator** | `src/core/**`, the stubs, `docs/**`, `scripts/*-hi-*.mts`, `data/benchmarks/hi/**`, `test/integration/hindi-*.test.ts`, registries (one line each) | contract, independent tables and probes, gold set workflow, rights gate, Bible, integration, browser audit |

The stubs in `src/adapters/hindi/*.ts` carry the final exported signatures. A package may add exports; it may not
change or remove one that another package uses.

## Conventions every package follows

**Identity.** A form's identity is its NFC text. NFC keeps the nukta as a separate sign (ज़ = ज + ़), so ज़ and ज
are different forms; nothing folds them. The text of a document is never changed. Variant spellings (हिंदी / हिन्दी,
गई / गयी, चाहिए / चाहिये, a word with and without its nukta) are *related* through `hindiSpellingVariants`, and a
reading reached through a variant says so in `notes.variantOf`.

**Features** (Universal-Dependencies names, the values below, comma lists in ascending order where a form is
ambiguous within one reading):

| | |
|---|---|
| nouns | `Gender` Masc / Fem; `Number` Sing / Plur; `Case` Dir / Obl / Voc |
| adjectives, participles, का | the same three; an adjective that does not change carries no feature |
| pronouns | `Person` 1 / 2 / 3; `Number`; `Case` Dir / Obl / Erg (मैंने) / Dat (मुझे) / Gen; `PronType` Prs / Dem / Rel / Int / Ind; `Polite` Infm (तू) / Fam (तुम) / Form (आप) |
| verbs | `VerbForm` Fin / Inf / Part / Conv (कर, करके) / Stem (the bare stem before a second verb); `Aspect` Imp (-ता) / Perf (-ा) / Prog (रहा); `Tense` Pres / Past / Fut; `Mood` Ind / Sub / Imp; `Person`; `Number`; `Gender`; `Polite` as above for commands; `Voice` Cau on a causative lemma |
| fused words | `parts` (`WordPart`): उसने = उस (kind 'stem', lemma वह) + ने (kind 'clitic', pos ADP); मुझसे = मुझ + से |

The lemma of a verb is its infinitive (कहना); of a noun its direct singular; of an adjective its masculine direct
singular; of a pronoun its direct form (मैं for मुझे, मेरा has its own lemma मेरा as DET with `Poss=Yes`).

**Honesty.** A reading the word list does not vouch for is `unconfirmed`, 0.6 at most, with no gloss. Where a rule
cannot decide, every reading is returned; nothing is guessed silently. Pronunciation is a separate statement from
spelling, with its own confidence, and can be corrected by a dictionary or a reviewer without touching the text.
All hand data is machine-drafted and says so (`AnalysisSourceInfo.reviewStatus: 'machine-drafted'`).

**Multiword units.** A compound verb (कह देना) and a complex predicate (याद करना) are phrase items
(`PhraseCandidate`, kind 'construction' and 'collocation'): the learner model then holds `phrase:hi:कहना देना`
beside `lemma:hi:कहना` and `lemma:hi:देना` — both, as the brief asks. The pattern is written in lemmas.

**Register.** `register` on a reading: 'everyday', 'sanskritic', 'perso-arabic', 'english-loan', 'biblical', plus
the existing 'formal', 'literary', 'colloquial', 'religious'. A pair such as ज़रूरत / आवश्यकता is recorded as a relation
(`registers.ts`), never merged.

**Varieties.** Modern Standard Hindi is the course language and carries no tag. Awadhi ('awa'), Braj ('bra') and
the mixed language of Kabir ('hi-sant') are `kind: 'heritage'` varieties: catalogued, readable as the learner's own
copy, never counted as evidence about Modern Standard Hindi.

**Held-out discipline.** The coordinator keeps tables the packages do not see. A package tests with examples of its
own choosing; it does not copy a failing case into a table of exceptions.

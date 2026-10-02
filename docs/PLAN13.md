# PLAN 13 — the Albanian course (contract v11)

Owner's brief (2026-10-01): Albanian as a first-class language of the existing text-first system — Standard Albanian
as the language the learner acquires, an unusually careful morphology, every ambiguity kept, clitics and the linking
article treated as what they are, constructions tracked, rights enforced by the machine, Gheg and historical Albanian
as later bridges, a seed corpus only after the validation and review machinery exists. Status words as in
`docs/READINESS.md`: **implemented**, **verified**, **architecture only**, **awaiting external input**.

Four sessions edit this repository at once (Spanish + the dictionary pipeline, Hindi, German, Albanian). **Each
package edits only the files it owns.** `src/core/**`, `src/ingest/**`, `src/golearn/**`, `src/dict/**`, `src/ui/**`
belong to others; only the coordinator talks to their owners. If `npx tsc -b` or a test reports a problem in a file
that is not Albanian, it belongs to another session: ignore it, never fix it, never report it as yours. Never run the
whole test suite; run your own tests. Never use `git add`, `git commit`, `git stash`, `git checkout` or any other git
command that changes the tree.

## What the shared architecture already gives Albanian (inspected, reused, not rebuilt)

| The brief asks for | It exists as |
|---|---|
| Every candidate analysis kept, one selected, confidence, method, human override, source version | `TokenAnalysis`: first reading + `alternatives`, `confidence`, `notes.context` (what decided), `origin` / `sourceId` / `analyzer` (versioned), a reviewer's correction as a `human:` analysis that supersedes. A new analyzer version re-analyses texts in place |
| Lemma knowledge apart from form recognition | learner items `lemma:sq:…` and `form:sq:…`, each with its own state |
| Construction memory | grammar patterns (`pattern:sq:…`) are learner items: encounters, assisted and unassisted counts per modality, texts met in, last seen, level; new constructions weigh in the ranking of texts |
| Reading, listening, production kept apart | `DimensionState` per modality |
| Several grammatical words in one written token | `AnalysisCandidate.parts` (`WordPart`, kind 'clitic' / 'contracted') |
| One lexical unit written as several words | `AnalysisCandidate.unit` (contract v9) — used here for `i mirë` |
| An older or other-variety form related to today's standard form | `AnalysisCandidate.orthography` (`OrthographyRelation`), `varieties`, `VarietyPolicy` on the course |
| A rule guess that a dictionary may confirm or replace | `unconfirmed` + the importer's dictionary rules (PLAN10) |
| Rights states, evidence records, a build that refuses unverified text | `RightsState`, `WorkRights`, `src/ingest/rights.ts`, `npm run rights:check` |
| The learner's own lawful copy | `personal-copy` import (`.txt`, `.epub`), "Your copy" |
| Review before publication | `ReviewStatus` + the publication gate; unreviewed text is visible only in preview |

Contract v11 adds only: rights state `research-only`; rights evidence for the layers of an old work; `Work.orthography`
/ `modernization`; error categories `dialect` and `idiomaticity`.

## The adapter (`src/adapters/albanian/`, internal contract in `types.ts` — read it first, whole)

```
word list (facts of each word)        lexicon-nouns / -verbs / -modifiers, function-words, clitics
        │
written form ──► morphology.ts: every context-free reading (word list by generated forms → closed classes →
        │         clitic clusters and apostrophe forms → readings by ending, marked unconfirmed → a form typed
        │         without ë / ç → a Gheg or older form related to its Standard equivalent)
        │
sentence ──► sentence.ts: linking article or object pronoun or particle; article + adjective as one unit; case
             narrowed by a preposition or a linking article; noun or verb; readings ordered, what cannot be
             decided left as a union
        │
             constructions.ts · phrases.ts · production.ts (checks on the learner's own Albanian)
```

Feature conventions, lemma conventions and the helper functions are in `types.ts`. Confidence: a word-list word read
by a listed form or a regular rule 0.8–0.92; a closed-class word with several readings keeps all of them, at most 0.6
each until the sentence decides; a reading by ending for a word outside the list is `lemmaKnown: false`, 0.5 at most,
no gloss. A reading that context decided keeps its confidence and the others are marked down to 0.4 at most, with
`notes.context` naming what decided.

Honesty rules (they outrank coverage):
- Standard Albanian only in the paradigms. A Gheg or older form is never generated as if it were Standard; where a
  package is not sure a form is Standard, it leaves it out and lists it in its report.
- Nothing is invented: no decomposition of a clitic cluster that is not certain, no gloss for the linking article
  that pretends it is a word of English, no feature the form does not show.
- Every word list is machine-drafted and says so. A word, form or gender you are not sure of is left out.
- Fewer words done right beat many words done roughly: a noun needs its true definite form and plural, a verb its
  true aorist and participle.

## Packages, wave 1 (parallel; each owns only the files named)

| | Owns | Does |
|---|---|---|
| **Q1 nominal** | `morph-noun.ts`, `morph-adjective.ts`, `lexicon-nouns.ts`, `lexicon-modifiers.ts`, `test/adapters/albanian-nominal.test.ts` | every case / number / definiteness form of a noun from lemma, definite form and plural; adjective forms; readings by ending; about 350 nouns and 120 adjectives and adverbs of everyday life, family, home, food, travel, work, school, time, nature, faith and church |
| **Q2 verbal** | `morph-verb.ts`, `lexicon-verbs.ts`, `test/adapters/albanian-verbal.test.ts` | every simple form of a verb from its principal parts, active and non-active; readings by ending; about 220 verbs incl. all the common irregular ones |
| **Q3 closed classes** | `function-words.ts`, `clitics.ts`, `describe.ts`, `test/adapters/albanian-closed.test.ts` | pronouns in all case forms, the linking article table, prepositions with their case, conjunctions, particles, numerals, question words; the clitic and cluster tables with their make-up; apostrophe forms; plain-words descriptions |
| **Q4 writing and varieties** | `orthography.ts`, `sentences.ts`, `varieties.ts`, `gheg.ts`, `historical.ts`, `tags.ts`, `test/adapters/albanian-writing.test.ts` | letters and digraphs for Stage 0; text typed without ë / ç; sentence splitting; variety codes and their standing; Gheg ↔ Standard correspondences; older spelling; dictionary labels → features |
| **Q6 course** | `src/course/albanian.ts`, `docs/albanian/RIGHTS.md`, `docs/albanian/CANDIDATES.md`, `test/course/albanianCatalog.test.ts` | stages 0–9 and open reading, streams, doors, the candidate manifest with rights records (everything unverified stays unverified), the Bible policy as data |
| **Q7 validation** | `src/bench/sq/**`, `scripts/sq-eval-ud.mts`, `scripts/sq-gold.mts`, `data/benchmarks/sq/README.md`, `test/bench/sq-*.test.ts` | CoNLL-U reader with multiword tokens; comparison of the adapter with a treebank (tokens, multiword tokens, lemma, part of speech, features) on a dev / test split; the format and tooling of a native-reviewed gold set; research data kept apart and never shipped |
| **Q8 authoring** | `src/authoring/**`, `scripts/authoring-report.mts`, `scripts/authoring-check.mts`, `test/authoring/**` | language-neutral: recurrence report (lemma and form frequency by stage, first occurrence, spacing, texts per lemma, forms per lemma, construction recurrence); lexical budget check of a draft against its stage; draft states |

Wave 2 (after wave 1 lands): **Q5** `sentence.ts`, `constructions.ts`, `phrases.ts`, `production.ts`; **Q9** the Stage
0 / early Stage 1 seed texts, written against the working engine and marked unreviewed; the coordinator switches
`src/adapters/sq.ts` to the new engine in one edit. Wave 3 (needs the owner's permission to download): the UniParser
analyzer as an offline source, the treebanks, the dictionary.

## Coordinator

`src/adapters/albanian/types.ts`, `morphology.ts`, `overrides.ts`, `src/adapters/sq.ts`, the shared registries, the
judged tables in `test/integration/albanian-*.test.ts` (packages do not read these), the browser audit, the documents.

# PLAN 11 — the German course (contract v9)

Owner's brief (2026-10-01): a German course inside the existing text-first architecture, for Standard German of
Germany (de-DE), with a German-specific linguistic engine. First a complete vertical slice; the corpus grows only
after the architecture has proven itself. Status words as in `docs/READINESS.md`.

Several sessions are editing this repository at once (Spanish dictionary, Hindi, German). **Each package edits only
the files it owns.** `src/core/**` is shared and only the coordinator edits it. If `npx tsc -b` reports errors in
files outside `src/adapters/german/**`, `src/adapters/de.ts` and your own tests, they belong to another session:
ignore them, do not fix them. Never run the whole test suite; run your own tests.

## What German needs that the shared model did not have (contract v9, `src/core`)

| Need | Where |
|---|---|
| A lexical unit written as several words: `steht … auf` = aufstehen. Every piece carries the unit's lemma; the encounter is counted once, on the head | `AnalysisCandidate.unit`, `TokenAnalysis.unit` (`UnitLink`) |
| Parts of a written word with a machine-readable kind: compound components, head and linking element; a contracted article; a separable prefix written on; inserted `zu` / `ge` | `WordPart.kind` |
| An older spelling related to today's without changing the text: `daß` → dass, `thun` → tun | `OrthographyRelation` on candidates and analyses |
| Case, gender and number as sets that context narrows | `DeCell`, `DeReading.cells` (adapter-internal), morph unions (`Case: 'Nom,Acc'`) |
| Rights evidence for an exact edition | `WorkRights` evidence fields, `RightsState 'permission-granted'`, `Work.readiness`, `Work.pipeline` |
| Difficulty that knows compounds, the verb bracket, genitives, passives, older spelling | `TextFeatures`, `TextProfile.compounds`, `PersonalDifficulty` factor keys, `ProfileScore.compounds` |

A periphrastic tense (`ist gegangen`, `würde gehen`, `wird gebaut`) is **not** a unit: the participle or infinitive
carries its own lemma, the auxiliary keeps its lemma (sein, haben, werden) with a `role` in plain words, and the
whole is a construction (a pattern occurrence).

## The adapter (`src/adapters/german/`, internal contract in `types.ts`)

```
lexicon rows (facts of each word)  ──►  lexicon.ts (DeLexiconView)
                                              │
written word ──► morphology.ts: every context-free reading, with all case/gender/number cells
                                              │
sentence ──► sentence.ts: agreement in the noun phrase, what the preposition governs, capital letters,
             separated verbs put together, compounds taken apart, readings ordered; what cannot be decided stays a union
                                              │
             constructions.ts (patterns, phrase units) · production.ts (checks on the learner's own German)
             historical.ts (older spelling) · tags.ts (a dictionary's labels) · varieties.ts
```

Feature conventions (every package uses exactly these): Case `Nom|Acc|Dat|Gen`; Gender `Masc|Fem|Neut`; Number
`Sing|Plur`; Person `1|2|3`; Mood `Ind|Sub|Imp`; Tense `Pres|Past`; VerbForm `Fin|Inf|Part`; Konjunktiv I = `Mood Sub,
Tense Pres`; Konjunktiv II = `Mood Sub, Tense Past`; past participle = `VerbForm Part, Tense Past`; present participle =
`VerbForm Part, Tense Pres`; Degree `Cmp|Sup`; Decl `Strong|Weak|Mixed` (adjectives); PronType `Art|Prs|Rel|Dem|Int|
Ind|Neg`; Definite `Def|Ind`; Poss `Yes`; Polite `Form` (Sie). A value that is not decided is a comma union in the
order just given (`Case: 'Nom,Acc'`). Never a guess.

Confidence: a lexicon word read by its listed forms or a regular rule 0.8–0.92; a reading that context decided keeps
its confidence and the others are marked down to 0.4 at most with `notes.context` naming what decided; a guess for a
word outside the lexicon is `lemmaKnown: false` → `unconfirmed`, 0.6 at most, no gloss.

Honesty rules: nothing is modernised in the text; a prefix of the `dual` kind (um, über, durch, unter, wieder, wider,
hinter) splits a verb only when the lexicon lists that verb as separable; a compound is taken apart only into known
words, never by arbitrary splitting, and a lexicalised compound keeps its own lemma and gloss with the parts beside it;
all word lists are machine-drafted and say so.

## Packages

| | Owns | Does |
|---|---|---|
| **GA engine** | `german/morphology.ts`, `german/morph-*.ts`, `test/adapters/german-morphology.test.ts` | verb, noun, adjective, determiner inflection: generate and analyse, with cells |
| **GB lexicon** | `german/lexicon.ts`, `german/entries.ts`, `german/lexicon-nouns.ts`, `-verbs.ts`, `-modifiers.ts`, `function-words.ts`, `prefixes.ts`, `test/adapters/german-lexicon.test.ts` | the word list and the closed classes, with the facts inflection needs |
| **GC sentence** (after GA, GB) | `german/sentence.ts`, `german/agreement.ts`, `german/units.ts`, `german/compounds.ts`, `src/adapters/de.ts`, `test/adapters/german-sentence.test.ts`, `test/adapters/de.test.ts` | agreement, separable verbs, compounds, ordering, the adapter itself |
| **GD constructions** | `german/constructions.ts`, `german/production.ts`, `german/phrases.ts`, `german/sentences.ts`, `test/adapters/german-constructions.test.ts`, `german-production.test.ts` | patterns, phrase units, sentence splitting, checks on the learner's own German |
| **GE spelling and labels** | `german/historical.ts`, `german/tags.ts`, `german/varieties.ts`, `test/adapters/german-historical.test.ts`, `german-tags.test.ts` | older spelling, a dictionary's labels, varieties |
| **GF starter corpus** | `data/corpus/de/weg-*.json`, `deutschland-*.json`, `gespraech-*.json`, `german/lexicon-course.ts`, `docs/german/ACQUISITION.md`, `test/content/german-acquisition.test.ts` | the first-party controlled texts (machine-drafted, unreviewed, preview only) |
| **Coordinator** | `src/core/**`, `src/course/german.ts`, `data/benchmarks/de/**`, `test/integration/german-*.test.ts`, `docs/GERMAN_COURSE.md`, `docs/german/RIGHTS.md`, `docs/german/STATUS.md`, Scripture slice, the verified literary work, browser audit | contract, manifest and rights, gold suite, integration, measurement |

The gold suite (`data/benchmarks/de/gold.json`) is written by the coordinator from his own judgement of each
sentence and is not shown to the packages before their work lands: it is the independent check.

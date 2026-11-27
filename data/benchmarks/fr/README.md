# French benchmarks (QA package of the French pack)

An independent linguistic check of the French adapter (`src/adapters/fr.ts`, `docs/french/PLAN.md`).

## Honesty

Every judgement in these fixtures is an AI's. **Nothing here has been reviewed by a native speaker.** The expectations were written
from French grammar and from two reference sources, WITHOUT reading the adapter, and an expectation I was not certain of was left
out. A fixture can still be wrong; where the adapter and a fixture disagree, the fixture is as likely to be at fault as the adapter
until a human settles it. Sentences are my own, except single short sentences of public-domain authors (La Fontaine, Perrault,
Voltaire, Hugo, Maupassant, Flaubert, Dumas), quoted from memory and named in the case's `why`.

## What is here

| file | what |
|---|---|
| `fixtures/<category>.json` | the cases, one file per category (orthography, nominal, verbal, compound-tenses, pronouns, negation, relatives, literary, ambiguity) |
| `known-limits.json` | `{ "limits": [ { id, failed: [keys], reason } ] }`: what the adapter does not do. Filled by the lead. A listed case must fail EXACTLY as recorded |
| `../../../src/bench/fr/fixtures.ts` | loader, `evaluateFixture`, `summarise` (pure; the adapter is passed in) |
| `../../../test/adapters/french-fixtures.test.ts` | format checks (always) + evaluation (when `frAdapter` exists) |
| `../../../scripts/fr-fixtures-check.mts` | checks the fixtures against the kaikki extract |
| `../../../scripts/fr-eval-ud.mts` | the adapter against UD French GSD |

## Case format

```json
{ "id": "verbal-012", "sentence": "Nous faisons un gâteau.", "target": "faisons", "occurrence": 1,
  "expect": { "lemma": "faire", "pos": "VERB", "features": { "Mood": "Ind", "Tense": "Pres", "Person": "1", "Number": "Plur" } },
  "alsoAcceptPos": ["AUX"], "source": "kaikki", "level": "core", "why": "one line: the rule being tested" }
```

* `target` is found by `normalize` among the word tokens (`occurrence` counts from 1). Targets with an apostrophe or hyphen follow
  the token contract of `docs/french/PLAN.md` (`l'`, `qu'`, `peut-être`).
* The **reading judged** is the first candidate with the expected lemma and an accepted part of speech. Failure keys:
  `target` (not found as a word token), `lemma` (no reading has it), `pos` (the lemma is there but not with an accepted pos),
  `first` (the judged reading is not `candidates[0]`), `feature:<Key>` (the value is not among the comma-list values of the judged
  reading), `construction` (no `detectPatterns` key with that id covers the target), `phrase`, `parts` (lemmas of the halves,
  from the judged reading's `parts`), `tokens` (exact word-token surfaces), `notLemma` (the FIRST reading has the trap lemma).
* Features are a **subset**: only the ones that are certain and matter. Where one written form has several readings (parle:
  1st/3rd person, indicative/subjunctive) only a feature true of the sentence's reading is listed; it is judged on the first
  reading of that lemma and pos, so an adapter that returns two separate readings and puts the other one first fails `first` or the
  feature, which is the honest result.
* Contractions (au, aux, du, des, auquel, duquel) assert only `parts` (the contract names no lemma for the contraction), plus
  the construction `contraction-article`.
* `level`: `core` = what a pack at this level must get right; `advanced` = needs sentence context beyond the adjacent words.
* `source`: `kaikki` = the lemma (and the labels it carries) checked against the extract; `grammar` = French grammar, the form
  not in the extract in a checkable way; `ud` = checked against UD French GSD.

## Size (524 cases)

| category | cases | core | advanced |
|---|---|---|---|
| orthography | 52 | 43 | 9 |
| nominal | 62 | 56 | 6 |
| verbal | 130 | 120 | 10 |
| compound-tenses | 45 | 35 | 10 |
| pronouns | 48 | 44 | 4 |
| negation | 26 | 22 | 4 |
| relatives | 27 | 23 | 4 |
| literary | 62 | 48 | 14 |
| ambiguity | 72 | 51 | 21 |

## Checking the fixtures against the dictionary

`npx vite-node --config scripts/vite.config.ts scripts/fr-fixtures-check.mts [-- --show-ok] [--strict]` streams the kaikki.org
extract (`data/dictionaries/kaikki.org-dictionary-French.jsonl`, Wiktionary, CC BY-SA 4.0) and, for every `kaikki` or `grammar` case
with a one-word target, looks the normalised target up (a line of its own, or an entry's `forms` list) and asks: does some line give the
expected lemma for that form (`form_of`, `alt_of`, or the word is its own lemma)? Is the lemma listed with the expected part of
speech? Do the labels (first-person, plural, indicative, present, imperfect, future, historic, participle, infinitive, masculine,
feminine, possessive …), mapped to features by the script, contradict a listed feature?

Result of the last run: of 524 cases, 2 (`source: ud`) are not looked up there; of the other 522, 9 have no lemma or pos to
look up (tokens-only), 492 are confirmed directly, 17 are confirmed through the masculine singular participle line, 4 are not found, 0 are
contradicted. What is not a direct confirmation, and why it stays:

* **17 agreeing participles** (arrivée, arrivées, partis, allée, venue, vendue, écrites, vues, mangés, levée, vus, lavés, née, morte, achetées …).
  The extract lists a participle only in its masculine singular (arrivé, écrit, vu); the feminine and plural forms are not
  lines of their own (some are nouns: arrivée, vue). The lemma is confirmed through the masculine singular; the agreement
  (Gender, Number) is French grammar and is not in the extract. Several are also in UD GSD (arrivées, venue, vus, née, morte as participles).
  These cases test exactly the point the pack must get right: agreement forms of a participle that is also a noun (arrivée, vue, levée).
* **4 elided closed-class forms** (`n'`, `s'`, `m'`, `t'`): the extract lists them as lemmas of their own ("Prevocalic form of ne")
  without a `form_of`; the lemmas ne, si, me, te are plain grammar and the PLAN names these as elided forms of their lemmas.
* **`cet`** (nom-038, `source: ud`): the extract has `cet` as a lemma of its own; UD GSD and grammar make it a form of `ce`
  (22 of 22 occurrences in dev and test: lemma ce). The fixture follows UD; an adapter that returns `cet` as its own lemma is
  following the dictionary and fails `lemma`.
* **`on`** (pron-032, `source: ud`): the extract labels two of its senses plural ("we", "people"); all 35 GSD
  occurrences tagged PRON (dev) have Person=3, Number=Sing, which is what the verb agreement shows. The fixture follows UD.
* **Features the extract does not label** and so cannot confirm (not contradicted either): Gender, Number and Person of most
  closed-class words, Case, PronType, Polarity, Definite, Reflex, Poss, VerbForm for non-verbs. These rest on grammar alone.

The dictionary confirms the lemma and the labels of the FORM; it cannot confirm the CONTEXT choices (which reading a word has in its
sentence), which are the grammar judgements of the ambiguity category, and of the constructions.

## Decisions the contract did not settle (made here; change them in the fixtures if the contract decides otherwise)

* **Lemma of the contractions**: not asserted. `parts` carries the two lemmas, with `le` (not `les`) as the second half of `aux`/`des`.
* **Lemma of `la`, `les` (pronoun), and of ils, elles, eux**: the dictionary has `la` (pron) and `elles` as lemmas of their own, `les`
  (pron) and `eux` as forms of `le` and `ils`; UD GSD lemmatises il, elle, ils, elles as `lui` and je as `moi`. The fixtures assert
  `le` for the clitics le/les/l' (dictionary and UD agree), assert `je`, `tu`, `il`, `elle`, `nous`, `vous`, `on` (dictionary), and leave
  the lemma of `la` (pronoun), `ils`, `elles`, `eux` out, asserting part of speech and features only. `scripts/fr-eval-ud.mts` therefore
  prints lemma accuracy with and without UD PRON words.
* **Lemma of the articles**: `la` and `les` (article) → `le`; `une` → `un`; `des` (indefinite) → `un`; partitive `du` → `du`
  (dictionary and UD agree on all four); possessives ma, mes → `mon`, leur(s) → `leur` (the dictionary; UD says `son`).
* **Part of speech**: article → DET; copula and auxiliary être/avoir → AUX with VERB also accepted (and the reverse for avoir/être
  as full verbs); `ne` → ADV with PART accepted; `que` conjunction → SCONJ with CONJ accepted; `ou`, `or`, `car`, `et` → CONJ (this
  codebase's name for coordinating conjunctions); a participle in a passive → VERB with ADJ accepted.
* **`Polarity Neg`** is asserted on pas, jamais, plus, rien, personne in `ne …` contexts (the contract lists the feature, not on which
  words); `negation-ne-que` is asserted on `que` and `negation-ne-dropped` on `pas`.
* **`PronType Part`** for the partitive article (as the contract says); `Definite` on articles; `Case Acc|Dat` on clitics only; the
  disjunctive pronouns carry no Case.
* **Orthography `tokens`**: the exact word-token surfaces; hyphens are non-word tokens; the surface keeps the page's own apostrophe.
  `va-t'en` is cut `va · t' · en` and `c'est-à-dire` stays one token, both by the contract's rules.
* **The page spelling `coeur`, `oeuvre`, `soeur`** must reach the lemma `cœur`, `œuvre`, `sœur` (marked `advanced`).
* **Test mechanics**: vitest's `it.skipIf(cond)` reads `cond` when the test is declared, before `beforeAll` has run, so the adapter-dependent
  tests are declared normally and skip themselves at run time (`({ skip }) => { if (!adapter) skip(); … }`); the adapter is imported dynamically
  in `beforeAll`.

## The Universal Dependencies check

`npx vite-node --config scripts/vite.config.ts scripts/fr-eval-ud.mts -- --split dev|test [--limit N] [--show N] [--dry]`
(UD French GSD, CC BY-SA 4.0; read from `data/research/ud/UD_French-GSD`, evaluation only, never copied or shipped; `--show` is refused for
`test`). It reports tokenisation agreement, coverage, lemma accuracy (first reading and among the readings), UPOS (strict, and AUX/VERB
merged), feature agreement on Mood, Tense, Person, Number, Gender and VerbForm by UPOS where both sides state the feature, and
contractions (du, des, au, aux, auquel …) separately. `--dry` prints the treebank's statistics only. Tune on dev; report test as it comes.

Known mismatches of convention between UD GSD and this codebase, which the numbers will show: GSD lemmatises personal pronouns as
lui/moi; possessive leur as `son`; GSD is not a dictionary of the written word (it lemmatises proper nouns as written, numbers as
themselves). The script treats `CONJ` as `CCONJ`.

## Running

```
npx vitest run test/adapters/french-fixtures.test.ts            # format checks always; evaluation when src/adapters/fr.ts exists
npx vite-node --config scripts/vite.config.ts scripts/fr-fixtures-check.mts
npx vite-node --config scripts/vite.config.ts scripts/fr-eval-ud.mts -- --split dev --dry
```

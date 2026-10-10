# Morphological analyser / generator design (Linguistic Engine V2, Stage 3)

The analysers already read forms (analysis: form → lemma + features). Stage 3 adds the other direction (generation: lemma →
every form, as feature-keyed cells) and checks the two against each other and against Wiktionary's inflection tables. The
per-language designs, rules, counts and known wrong cases are in `PARADIGMS-sq.md`, `PARADIGMS-es.md`, `PARADIGMS-de.md`,
`PARADIGMS-hi.md`, `PARADIGMS-nb-nn.md`, `PARADIGMS-th.md`. This page is the shared design.

## The contract: `src/core/paradigm.ts`

- `ParadigmCell { form, features, sources: ('generated'|'wiktionary')[], status, alternatives?, note? }` with
  `status` ∈ `verified` (both sides agree) · `supported` (dictionary only) · `generated` (rules only) · `conflicted`
  (they differ: the dictionary's form first, the rules' form in `alternatives`).
- `Paradigm { languageId, lemma, pos, kind, cells, layout?, template?, notes, sources, status, constructions? }`;
  `kind` ∈ noun-declension · adjective-declension · verb-conjugation · pronoun-paradigm · determiner-paradigm · none.
- `GeneratedParadigm` is what an adapter's `paradigm(lemma, pos, hint?)` returns (cells without status); `mergeParadigm(base,
  generated, dictionaryRows)` keys cells by `featureKey` (sorted `Key=Value|…`) and assigns the statuses.
- `ParadigmLayout { columns, rows, sections?, labels? }` tells the card how to draw tables; cells the layout cannot place are
  listed under "Other forms".
- Selection: `cellOf`, `cellsWithForm`, `cellsForSelection` (splits union values such as `Gen,Dat`, drops keys no cell has,
  narrows by the written form); an adapter's own `cellsFor` projection wins when it has one.
- Thai: `kind: 'none'` with `constructions` (the aspect/classifier/serial constructions to learn instead) and
  `SegmentationAlternatives` (the cuts of a selection into words).

## Adapter methods (`src/core/adapters.ts`, all optional)

| method | gives | implemented for |
|---|---|---|
| `paradigm(lemma, pos, hint?)` | the generated table from the adapter's rules and irregular lists; `undefined` when it cannot generate (never a guessed table for an unknown noun) | sq, es, de, hi, nb, nn, th (`none`) |
| `featuresFromTableTags(tags, pos, form?)` | the adapter's feature bundle for one kaikki table row ("accusative", "definite", "singular" → `Case=Acc, Definite=Def, Number=Sing`); `undefined` for a row that is not a cell (headline forms, construction rows) | sq, es, de, hi, nb, nn, th (always `undefined`: no tables) |
| `cellsFor(paradigm, features, surface?)` | the cells an analysed reading occupies (union readings taken apart, varieties, missing keys) | sq, es, de, hi, nb, nn |
| `segmentations(text, context?)` | alternative cuts of a selection into words | th |

Rule for adapter files: values come from `'../../core/paradigm'` (and `'../../core/syntax'`), never from `'../../core'` — the
core index pulls `course.ts` into the extension bundle and `test/audit/conformance.imports.test.ts` fails.

## Merging the two sides on the card (`enrich.ts: buildParadigm` → `alignTable` → `mergeParadigm`)

The dictionary's rows rarely use exactly the generated cells' keys, so before merging: (1) a feature every generated cell
carries with one value (a noun's `Gender`) is copied onto a row that lacks it — the table is that lexeme's table; (2) a row
whose single value falls inside a generated union value (`Dat` in `Gen,Dat`) takes that cell's key when exactly one cell
fits; (3) a row that names fewer features than every generated cell (the headline "plural" / "definite" forms above a
table) is dropped. Without generated cells the rows are kept as they are. Nothing is invented: a value is only copied from
the one generated side or narrowed to the one cell it already fits.

## Round-trip checks (bidirectional morphology)

Every lane's tests generate the cells of word-list lemmas and analyse each generated form back, asserting the lemma and the
features of the cell are among the readings (`test/adapters/*-paradigm*.test.ts`). Measured on 2026-10-10: Albanian 98 %
agreement where both halves have a form; Spanish 97.5 % of 805,780 dictionary cells verified; German 291,525 verified cells,
verb conflicts 7.3 % (mostly guessed separable verbs with prefixes the engine does not list); Hindi 95 % of generated cells
found again from their own form; Norwegian every observed form of the word lists (5,000+ nb, 1,800 nn) round-trips. The
figures come from the probes `scripts/probe-paradigm-<lang>.mts` over the real kaikki files, written to
`docs/ecosystem/linguistics/paradigm-<lang>-2026-10-10.json`.

## Irregulars

Irregular forms are explicit in each adapter's word list or irregular tables (never produced by applying a regular rule to an
irregular stem): Albanian listed lexemes with their stems; Spanish the irregular verb classes (ser, ir, tener, …) and the
unlisted stem-changers are *not* generated as regular (they return `undefined` or are listed as conflicts in the doc);
German strong verbs, weak nouns and listed plurals; Hindi the closed-class pronouns and the होना copula; Norwegian the
closed classes (være, ha, bli, the modals, pronouns, determiners). A lemma the adapter does not list and cannot classify
returns `undefined`, and the card shows the dictionary table alone, marked as unverified by the rules.

## Engine bugs found by the cross-check, not fixed

Fixing analysis output bumps an adapter version that is pinned in tests outside the lanes (`packages/language-packs/src/packs/*.ts`,
`test/reader-languages/*`), so the lanes listed them instead: Spanish `accentLast` re-accents reír/freír/sonreír's vos
command and `huir` lacks the monosyllable rule; German `superlativeOf` writes `am spannendesten` (-end adjectives) and
Konjunktiv II umlauts the prefix of unter-/über- verbs; Hindi verbs with a stem in -ी (पीना) write पिऊँ where the dictionary
has पियूँ; Albanian template-generated Wiktionary tables are sometimes wrong (the dictionary, not the engine). See each
PARADIGMS doc for the full lists with who is right where known.

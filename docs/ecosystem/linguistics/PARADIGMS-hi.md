# Hindi paradigms (Linguistic Engine V2, Stage 3)

Files: `src/adapters/hindi/paradigm.ts` (generation, `hindiCellFeatures`, `hindiCellsFor`, the table merge),
`src/adapters/hindi/table-tags.ts` (the dictionary's tags to cell features), wired in `src/adapters/hi.ts` as
`paradigm`, `featuresFromTableTags` and `cellsFor`. Probe: `scripts/probe-paradigm-hi.mts`, result
`paradigm-hi-2026-10-10.json`. Tests: `test/adapters/hindi-paradigm.test.ts`, `hindi-paradigm-table.test.ts`.

Everything generated is the adapter's own morphology (`inflectHindi`: the noun, adjective, pronoun and verb rules and the
irregular tables) plus the spellings the word list adds. Nothing has a rule of its own; the adapter's analysis output and
version (6) are unchanged. All of it is machine-drafted and has had no native-speaker review.

## Inventory

| Part of speech | Kind | Cells | Notes |
|---|---|---|---|
| NOUN, PROPN (listed) | `noun-declension` | Case (Dir, Obl, Voc) x Number | Gender is a note and in the template, not an axis (a gender axis would not match the dictionary's table, which has none). The postpositions that take the oblique are a note. A word the list allows in both genders shows the masculine forms and names where the feminine differs. The adapter generates no singular vocative (only the plural), so that cell is the dictionary's alone. |
| ADJ (listed) | `adjective-declension` | Gender x Number x Case | An adjective in -ा: the masculine has a direct and an oblique, the feminine has NO case (as in the analysis). An adjective that does not change: one cell with no features and a note. Ordinals in -वाँ take their forms from the word list (the rules know only -ा). |
| DET possessive (मेरा) | `determiner-paradigm` | same shape as an adjective | |
| PRON (listed) | `pronoun-paradigm` | Case (Dir, Obl = stem, Erg, Dat, Gen) with `Adp` (से, में, पर, तक) for the postposition written onto the stem | Number only where the pronoun has two number groups (कौन, जो). The fused dative (मुझे) is the cell, the word with को (मुझको) its alternative. Gen is the possessive word (मेरा) or the fused genitive (जिसका). The emphatic forms (यही, इसी) are not cells. |
| VERB, AUX (listed, or any -ना verb: guessed) | `verb-conjugation` | single words only, below | |

Verb cells: stem; infinitive (masculine direct and oblique, feminine); habitual (= imperfective) participle and perfective
participle, Gender x Number (the habitual masculine singular also oblique); conjunctive (stem + कर, stem + के); subjunctive;
future (Gender x Person x Number); commands to तू, तुम, आप, and the later command to आप (-इएगा); and for होना the present
and past of the copula. A form shared by several persons is one cell for each person (`करे` is 3rd and 2nd singular intimate;
`करेंगे` is 3rd plural, 1st plural and polite आप). The cell of तुम has no Number, as in the analysis. The causative mark
(Voice=Cau) and the progressive auxiliary reading of रहा are not in the cell keys (a note says so); `hindiCellFeatures`
maps an analysed reading onto the key.

Layout: nouns rows Case, columns Number; adjectives rows Case (plus a row "any case" for the feminine), columns Number,
sections Gender; pronouns rows Case, columns Adp; verbs rows Person, columns Number, sections VerbForm, Mood, Tense, Aspect,
Gender, Case, Polite.

## The construction policy (verbs)

The habitual present (करता है), the habitual past (करता था), the progressive (कर रहा है), the present perfect (किया है), the
pluperfect (किया था), the presumptive (करता होगा), the contrary-to-fact (करता होता), compound verbs (कर दिया) and light verbs
(काम करना) are NOT cells. In each the AUXILIARY carries the tense and the PARTICIPLE carries the aspect and the agreement in
gender and number; the participle is a piece of the construction, never the whole tense. The table lists the participles as
forms of the verb and names the construction ids (`constructions`: habitual-present, habitual-past, progressive,
present-perfect, pluperfect, ergative-ne, compound-verb, auxiliary-chain, passive, ability-sakna, conditional,
contrary-to-fact; all are keys of `HINDI_CONSTRUCTIONS`, so the pack explains them). The one place a participle IS a whole
tense is the simple past: the perfective participle on its own (उसने किया), which is the same cell; the dictionary's
"perfect indicative" rows map onto it. A lemma of more than one word (घृणा करना, a conjunct verb) gets no paradigm.

## The dictionary half

`featuresFromTableTags(tags, pos, form?)` (kaikki templates hi-ndecl, hi-adecl, hi-conj, l-self). The real tags: direct,
oblique, vocative, indirect (= oblique stem), ergative, dative, genitive, inessive, adessive, terminative, singular, plural,
masculine, feminine, and for verbs stem, infinitive, habitual, perfective, perfect, conjunctive, indicative, subjunctive,
imperative, future, present, past, presumptive, counterfactual, adjectival, agentive, prospective, progressive, the persons and
`formal`. No tag of the 1,659 verb tables, the nouns, adjectives or pronouns was unknown.

- A row that stands for several persons gives several cells (`hiTableTagsDetail(...).bundles`, third person first); the contract
  function returns the first (the third person). `hiParadigmFromTable` / `hiTableCells` use all of them.
- **The future needs the form.** A simple-future row has exactly the tags of the same cell in the perfect + future table
  (करेगा / किया होगा). `featuresFromTableTags` therefore takes an optional third argument `form`: a form of more than one word is
  a construction. Without it a future row is skipped (`needs-form`). **The caller (`buildParadigm` in
  `packages/golearn-extension/src/content/enrich.ts`) should pass `row.f`**, and `LanguageAdapter.featuresFromTableTags`
  should gain `form?: string`; until then the dictionary cannot verify the future cells in the card.
- Not placed, with a reason: construction (326,964 verb rows), not-modelled (14,076: the -वाला agent noun, the reduplicated
  progressive, the third-person polite command), the broken से row of the pronoun tables (`error-unrecognized-form`, 44), rows
  with no feature (180).
- An entry with two tables (a noun of two genders) is split at its `table-tags` rows and the table that agrees best with the
  generated forms is used. Several dictionary forms for one cell: the one the rules produce goes first (the adessive lists
  both पे and पर).
- Spelling: the rules write the glide-less form (किए, नई) and the dictionary the glide form (किये, नयी) and the anusvara for a
  plural nasal (आयें): these are listed as alternatives of the cell, so they verify, they do not conflict. A word asked for in a
  variant spelling of a listed word (आवाज for आवाज़) is generated in the spelling asked for.

## Probe (2026-10-10, whole Hindi kaikki file, `--limit 100000`)

| | tables | multi-word | generated | verified | supported | generated only | conflicted | lemmas with a conflict |
|---|---|---|---|---|---|---|---|---|
| NOUN | 13,207 | 713 | 1,619 | 7,980 | 70,789 | 14 | 101 | 65 |
| PROPN | 2,342 | 255 | 67 | 165 | 8,020 | 141 | 29 | 12 |
| ADJ | 532 | 14 | 111 | 654 | 3,402 | 2 | 0 | 0 |
| VERB | 1,659 | 545 | 1,112 | 43,007 | 5,525 | 284 | 88 | 6 |
| PRON | 33 | 0 | 9 | 52 | 239 | 15 | 5 | 2 |

(Cell counts are over the lemmas the adapter generates; for lemmas it does not hold, every dictionary cell is `supported`,
which is most of the supported column. 1,549 of 1,619 nouns, 109 of 111 adjectives and 1,099 of 1,112 verbs have no conflicted
and no generated-only cell.)

Supported-only shapes in generated lemmas: the singular vocative (the adapter generates only the plural); the plural
infinitive; the oblique perfective participle (= the plural form); the later commands to तू and तुम (करियो, करना); the
masculine vocative of adjectives.

## Disagreements (conflicted cells; first 20 in the JSON)

- **Dictionary templates, not the rules** (the rules are right): feminine consonant-stem nouns entered with the masculine
  template, whose plural direct is the singular (कार, जेल, शाम, नाक, बस, पीठ: the table says `कार`, the rules `कारें`); a
  masculine noun the word list marks feminine (गाल, साल, स्थान, मटर: the rules say `गालें`); होना (`होएँ`, `होएगा` for हों, होगा);
  the broken pronoun forms (`किनहोंने` for किन्होंने).
- **Word-list or rule questions for a reviewer**: nouns and names in -ा the table declines (मक्के, मूसे, यहूदे, कोलकाते) where
  the list marks them as not changing; रेडियो (the table `रेडियों`, the rules `रेडियोओं`); मई (`मइयाँ`); the class of verbs with a
  stem in -ी (पीना, जीना, सीना): the dictionary has the subjunctive `पियूँ`, `पियो`, `जियो` and the polite command `जीइये`, the
  rules `पिऊँ`, `पिओ`, `जिओ` and `जीजिए` (the second persons and the first-person future of 3 verbs).
- Spelling only (the pronoun + ने written apart: `किसी ने` / rules `किसीने`).

Agreement is not correctness: the tables are template-generated and the list is machine-drafted. Conflicts that are the
dictionary's mistake were not corrected.

## Not covered

- No paradigm for a noun, adjective or pronoun the word list does not hold (the dictionary's table alone is shown). A verb in
  -ना the list does not hold is generated by the regular rules and says "guessed from the ending".
- Conjunct and compound verbs (काम करना, कर दिया): constructions only. The passive, the causative stems (only noted), the
  agent noun in -वाला, the reduplicated progressive and the third-person polite command have no cell.
- No singular vocative for nouns (adapter gap), no vocative for adjectives, no oblique perfective participle, no future
  commands to तू and तुम (all dictionary-only).
- The conjunctive generated is stem + कर / stem + के (करकर, करके for करना); the usual written form is करके. The adapter's
  word list also holds the joined `…करके`; it is listed as an alternative.
- Pronoun tables: only the closed table's forms; the से form is the rule's alone (the dictionary flags its own).
- Generation bug found, NOT fixed (analysis output unchanged): the -ी stems (पीना, जीना, सीना) give the second-person
  subjunctive `पिओ` and the first person `पिऊँ` where the usual spelling is `पियो`, `पियूँ`/`पिऊँ`; the polite command
  `जीजिए` is right.
- The central `buildParadigm` maps a multi-person row to its primary (third-person) cell only, so the shared-form cells of the
  2nd person singular stay `generated` there; `hiParadigmFromTable` (probe, tests) verifies all of them.

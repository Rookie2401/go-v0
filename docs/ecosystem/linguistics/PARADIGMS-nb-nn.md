# Paradigms: Norwegian Bokmål (nb) and Nynorsk (nn)

Linguistic Engine V2, Stage 3. Code: `src/adapters/norwegian/paradigm.ts` (generation), `src/adapters/norwegian/table-tags.ts`
(the dictionary tag map), wired into both adapters in `src/adapters/norwegian/engine.ts` (`paradigm`, `featuresFromTableTags`).
Tests: `test/adapters/norwegian-paradigm.test.ts`.

## The dictionary half does not exist yet

There is **no Norwegian dictionary on disk**: no kaikki file, no `public/dict/nb` or `nn` shards (the download is listed in
`docs/norway/SPEC.md` section 10 and needs the owner's approval). So **every cell of every paradigm is `generated`**: the
engine's own rules and word list produced it, nothing has confirmed it, and each paradigm says so in its notes. The whole
word list is machine-drafted and unchecked by a native speaker or by Norsk ordbank.

`featuresFromTableTags` is written against the kaikki / Wiktionary tag vocabulary anyway (see "The tag map" below), but it has
never seen a real row. The day the dictionary is added, run `noTableTagsDetail(tags, pos).unknown` over its rows first, then
`mergeParadigm` turns agreeing cells `verified`, dictionary-only cells `supported` and disagreeing cells `conflicted`.

## What generates what

Only what the engine's tables and rules generate. No rule of its own is added.

| Part of speech | Source | Kind |
| --- | --- | --- |
| NOUN | noun rows (`parseNounRows`: plural, definite singular, definite plural rules and overrides) | `noun-declension` |
| ADJ | adjective rows (`parseAdjectiveRows`: neuter, plural/definite, comparison) and the few word-list adjectives with several forms (annen) | `adjective-declension` |
| VERB | verb rows (`parseVerbRows`: classes 1-4 and strong for Bokmål; a, e and strong for Nynorsk) | `verb-conjugation` |
| AUX | the closed-class word list (være/vere, ha, bli, the modals); `VERB` falls back to it and the reverse | `verb-conjugation` |
| PRON, DET | the closed-class word list; only a lemma with two or more cells has a paradigm | `pronoun-paradigm`, `determiner-paradigm` |
| NOUN (unknown) | the engine's **compound** path (`compounds.ts`): an unlisted noun whose head the list knows inflects like the head. Notes say "Guessed"; the template says "(guessed compound)". | `noun-declension` |

Everything else (PROPN, adverbs, prepositions, conjunctions, numerals) does not inflect and returns `undefined`. An unknown
lemma returns `undefined`; there is no other guess path.

## Cells and layout

Features use the engine's own keys, so the cell of any analysed form is found by `norwegianCellFeatures(pos, morph)` (it takes
the analysis' union readings, such as `Gender: "Fem,Masc"` or `Mood: "Imp,Ind"`, apart).
Bokmål and Nynorsk share every shape; the standard is named in `template` and in the first note
("Bokmål (nb) noun table.").

**Noun.** Definite (Ind, Def) x Number (Sing, Plur). Layout: columns Definite, rows Number. Gender is a note ("Gender: neuter
(et)"), not a feature. A Bokmål feminine noun has two definite singulars, `boka` and `boken`: both are cells with the same
features (the merge keeps the second as an `alternative`), each with a note; the same holds for a one-syllable neuter plural
(`husene`, `husa`). Nynorsk generates `boka` only, and `-ar` masculine plurals. The one variant spelling the engine lists (bro
and bru) is given as extra cells of `bro`. The genitive (-s) is a spelling rule, not a cell.

**Adjective.** Degree sections. Positive: indefinite singular `Gender: Fem,Masc` (the common form), `Fem` as its own cell only
where the list has a separate feminine (liten, lita), `Neut`, definite singular (`Definite: Def, Number: Sing`) and plural
(`Number: Plur`). The list has one "plural and definite" list; when it holds two forms (liten: små, lille) both are offered in
both cells, and the cell note and paradigm note say the list cannot tell which belongs where. Comparative `Degree: Cmp`;
superlative `Degree: Sup` with `Definite: Ind` (størst) or `Def` (største). A `mer / mest` adjective has no comparison cells
(a note says so); an invariable adjective repeats one form.

**Verb.** Rows `VerbForm`, columns `Tense`, section `Voice` (active, and the passive in -s for Bokmål / -st for Nynorsk).
Cells: infinitive (`VerbForm: Inf`; Nynorsk gives kaste and kasta), present (`Fin, Ind, Pres`), past (`Fin, Ind, Past`),
perfect participle (`Part, Past`, the supine; Bokmål class 1 gives -et and -a), imperative (`Fin, Imp`) and the passive
(`Voice: Pass`). The perfect (har + participle), the future and modal use, and the bli-passive are **constructions**, not
cells: `constructions` = `perfect-har`, `modal-bare-infinitive`, `bli-passive`. The engine has no present participle (-ende) and
no adjectival participle (stengt / stengte), so there are no such cells. A deponent -s verb (synes) has no separate passive; a
verb the engine gives no passive (stressed-vowel stems) has none.

**Auxiliary.** The same cells from the word list; unverified or colloquial forms carry a note.

**Pronoun / determiner.** The word list's forms with their Person, Number, Gender, Case, Definite. Lemma-level `PronType`,
`Poss` and `Reflex` are not features of a cell. A possessive agrees with the thing owned and its Person is the owner's (section
title); the quirky `Number: Plur,Sing` the list gives vår/vårt is read as `Sing` where a Gender is present.

## The tag map (`featuresFromTableTags`)

The kaikki tag vocabulary it understands:

- noun: `indefinite`/`definite` x `singular`/`plural` -> Definite x Number; gender and `genitive` rows are not cells.
- adjective: `masculine`, `feminine` (both, or `common-gender`, -> `Fem,Masc`), `neuter`, `definite singular`, `plural`,
  `comparative`, `superlative` with `indefinite` or `definite` (a bare "superlative" is read as the indefinite one: the one
  place the mapper reads a missing tag).
- verb: `infinitive`, `present`, `past`/`preterite`, `participle`+`past` or `perfect` or `supine`, `participle`+`present`,
  `imperative`, and any row tagged `passive` -> `Voice: Pass`. A participle row with number, definiteness or gender is not placed.
- pronoun / determiner: `first/second/third-person`, `singular`/`plural`, genders, `nominative`, `accusative`/`objective`,
  `definite`/`indefinite`.
- Meta tags (`table-tags`, `inflection-template`, `canonical`, register labels) are ignored; a row with only those, or with
  `error-unrecognized-form`, maps to `undefined`. Unknown tags are reported in `noTableTagsDetail().unknown`, never guessed.

## Counts (generated paradigms, 2026-10-10)

| Part of speech | nb lemmas (cells) | nn lemmas (cells) |
| --- | --- | --- |
| NOUN | 844 (3,479) | 261 (967) |
| VERB | 347 (2,254) | 125 (868) |
| ADJ (rows) | 235 (1,570) | 108 (753) |
| ADJ (word list) | 2 of 12 (11) | 1 of 8 (4) |
| AUX | 9 (40) | 9 (44) |
| PRON | 7 of 25 (14) | 8 of 21 (17) |
| DET | 13 of 31 (40) | 11 of 28 (34) |

Every noun, verb and adjective row of the lexicons has a paradigm (tested). The "of N" figures are word-list lemmas, the rest
of which have a single form. The nb verb count includes the lexicon's placeholder row `nei-` (excluded from the round-trip test).

## Limits

- All cells are `generated` and unreviewed; no dictionary confirms anything (above).
- Strong and irregular verbs come from the list's written parts; the engine does not predict vowel change.
- No present participle, no adjectival participle, no genitive cells, no diminutive or derived forms.
- The adjective list cannot separate the definite singular from the plural when they differ (liten).
- Proper nouns, adverbs and other uninflected classes have no paradigm; an unknown lemma has none except a guessed compound noun.
- Nynorsk covers only what its smaller list holds; Nynorsk is read, not written, in the Norway course.

# Albanian paradigms (Linguistic Engine V2, Stage 3)

Status 2026-10-10. Code: `src/adapters/albanian/paradigm.ts` (generation, the merge helper), `src/adapters/albanian/table-tags.ts`
(the dictionary's tags to feature keys); wired into `sqAdapter.paradigm` and `sqAdapter.featuresFromTableTags`
(`src/adapters/sq.ts`). Probe: `scripts/probe-paradigm-sq.mts` (numbers below, JSON in `paradigm-sq-2026-10-10.json`). Tests:
`test/adapters/albanian-paradigm.test.ts`, `albanian-paradigm-table.test.ts`. The analysis output and the adapter version
(`adapter-sq@9`) are unchanged: no analysis file was touched.

Everything is machine-drafted. Nothing here has been checked by a native speaker; "verified" means the word list's rules and
Wiktionary's table gave the same form, not that a speaker confirmed it.

## What is generated

Only what the adapter's own analysis generates (`nounForms`, `adjectiveForms`, `verbForms`, the closed-class pronoun list). The
cells are the analysis' readings with their union features taken apart (Case `Nom,Acc` becomes two cells; Mood `Ind,Sub` two;
Person `2,3` two), so a cell and the analysis of its written form share the same feature keys. Where a union reading and a
specific reading name the same cell, the specific form wins (librave is "genitive-dative or ablative plural", but the
indefinite ablative plural is librash).

| Part of speech | Kind | Source | Notes |
| --- | --- | --- | --- |
| NOUN, PROPN | `noun-declension` | a lexeme of the word list (771 nouns, 48 names) | 16 cells for a full noun; a name is already definite |
| ADJ | `adjective-declension` | a lexeme of the word list (162); the cited "i mirë" is found too | 4 cells |
| VERB, AUX | `verb-conjugation` | a lexeme of the word list (283); a verb in -oj outside the list is guessed | about 40 to 100 cells |
| PRON | `pronoun-paradigm` | the five personal pronouns unë, ti, ai, ne, ju | full and short (clitic) forms |
| anything else | undefined | | |

A lemma not in the word list returns `undefined`, with one exception: a verb of the shape `…oj` (stem of 3 letters or more)
gets the regular -oj class (aorist -ova, participle -uar), the class `morph-verb-guess.ts` also guesses at. Its notes say
"Guessed from the ending -oj", its `template` is undefined, and it has no optative, admirative or non-active cells. Nouns and
adjectives are never guessed from a lemma.

Where several lexemes share a spelling (the ladder repeats 17 base words: nuse, qafë, humb, fitoj …), their cells are merged and a
note says so. `hint.features.Gender` narrows homographic nouns.

### Feature inventory and layout

Features are the keys and values of `types.ts` (the analysis); the only additions are `VerbForm=Ger` for the gerund.

- **Noun.** `Gender` (a fact of the word: Masc, Fem, Neut) x `Case` x `Definite` x `Number`. Case values are `Nom`, `Acc`,
  `Gen,Dat` and `Abl`. Albanian genitive and dative share their forms, so they are ONE row (`Gen,Dat`, shown "genitive /
  dative"; Wiktionary's "dative" row, and "genitive" if a table ever has one). The ablative is its own row because the
  indefinite plural ablative has its own form (librash). The note gives the preposed linking article of the genitive (i librit,
  e librit, të librit, së librit).
  Layout: columns = Definite (indefinite, definite), rows = Case, sections = Number.
- **Adjective.** `Gender` (Masc, Fem) x `Number`. The linking article of the nominative is inside the form: i mirë, e mirë, të
  mirë, të mira. The article of the other cases (e / të after an accusative, së after a feminine genitive) is a note built from
  `linkingArticle()`. An adjective listed without an article is shown bare and says so. Layout: columns = Number, rows = Gender.
- **Verb.** `Voice` (Act, Mid) x `Mood` (Ind, Sub, Imp, Opt, Adm) x `Tense` (Pres, Imp = imperfect, Past = aorist) x `Person` x
  `Number`, with `VerbForm=Fin`. The imperative and the optative have no Tense (as in the analysis). The participle
  (`VerbForm=Part`) and the gerund (`VerbForm=Ger`, "duke punuar"; "duke u lutur" for a verb that exists only in the non-active)
  are single cells with no person. Layout: columns = Number, rows = Person, sections = Voice, Mood, Tense, with labels in
  plain words ("aorist (simple past)", "subjunctive (after të)").
  Constructions, not cells: future (do të + subjunctive), perfect (kam + participle), pluperfect (kisha + participle),
  conditional (do të + imperfect), progressive (po + present). `constructions` lists their ids
  (`future`, `perfect`, `pluperfect`, `conditional`, `progressive-po`, `gerund-duke`) and a note spells them out.
- **Pronoun.** `Person`, `Number`, `Case` (same four rows), `Gender` for the third person, `PronType=Prs`, `Clitic=Yes` for the
  short forms. Layout: columns = Number, rows = Case, sections = Gender, Clitic.

### Selecting the form: `cellOf` and `sqCellsFor`

An analysis keeps a feature the written form leaves open as a comma union (libri: Case `Nom` for one reading, `Gen,Dat,Abl` for
another; punon: Person `2,3`, Mood `Ind,Sub`); a table cell has one value. `cellOf(paradigm, features)` finds the cell when
the reading is already one value per feature (librin: `Acc`, `Sing`, `Def`, `Masc` finds librin). For a union reading the
highlight is `sqCellsFor(paradigm, features, surface?)` (exported from `paradigm.ts`): every cell whose values overlap the
reading's, optionally only those whose form is the written form. `cellsWithForm` of the core also works.

### The dictionary half

`sqParadigmFromTable(lemma, pos, rows, opts?)` (also `paradigm.ts`) maps the table rows with `sqTableTagsDetail`, generates, and
calls `mergeParadigm`. A noun's rows carry no gender, so they take the word list's (or `opts.gender`). A table form is
normalised before it is compared: the particle of the subjunctive is dropped ("të punoj" -> punoj), a bracketed variant is
a second spelling ("humbitni (humbisni)"), the acute accent Wiktionary puts on some headwords is dropped (gjárpri), and where a
variant equals the generated form it goes first, so a cell is verified when any spelling of the table matches.
Several dump entries with the same headword (pres "to wait" and pres "to cut") are separate tables; the probe merges the one
that agrees best, because the word list holds one lexeme per spelling.

Rows that are not placed (reason in `sqTableTagsDetail().skipped`): `not-a-form` (header, canonical form), `error` (the
template flagged the cell, `error-unrecognized-form`), `construction` (perfect, pluperfect, future, conditional,
progressive, negative, infinitive, bare "past"), `not-modelled` (vocative; an adjective's case other than nominative or its
definiteness), `wrong-table` (a verb's tags in a noun table, or the reverse: the entry has the wrong part of speech).

## Probe numbers (dump `kaikki.org-dictionary-Albanian.jsonl.gz`, 24,262 entries)

7,097 lemmas have an inflection table (noun, name, adjective, verb; 65 further dump entries are homographs). Tables of other
kinds are only counted: 30 pronouns, 7 determiners, 6 suffixes, 1 preposition.

| | lemmas with table | adapter generates | verified | supported | generated | conflicted | conflict rate* | lemmas with a conflict | lemmas fully verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NOUN | 4,536 | 534 (11.8 %) | 7,369 | 58,308 | 230 | 223 | 2.9 % | 42 | 384 |
| PROPN | 1,256 | 50 (4.0 %) | 208 | 5,108 | 306 | 2 | 1.0 % | 1 | 0 |
| VERB | 1,299 | 670 (51.6 %) | 19,390 | 52,686 | 1,507 | 345 | 1.7 % | 33 | 0 |
| ADJ | 6 | 1 (16.7 %) | 4 | 4 | 0 | 0 | 0.0 % | 0 | 1 |
| all | 7,097 | 1,255 (17.7 %) | 26,971 | 116,106 | 2,043 | 570 | | 76 | 385 |

\* conflicted / (verified + conflicted) over the cells of lemmas the adapter generates: where both halves have a form, how often
they differ. Both halves agree on 98 % of the cells they share.

- The "supported" mass is lemmas the word list does not hold (82 % of the lemmas with tables): their table is shown alone.
- No verb is "fully verified": Wiktionary lists cells the rules do not generate (for example the imperfect subjunctive and the
  admirative imperfect, which the adapter does not produce) and the rules generate cells Wiktionary does not list (the
  non-active voice; the optative and admirative of verbs whose table lacks them). The 1,507 verb cells that are only
  `generated` and the verb cells that are only `supported` show the two sides.
- Rows placed: 148,683 of 254,885. Not placed: 92,483 verb constructions, about 11,700 `error-unrecognized-form` rows (verbs
  8,070, names 2,456, nouns 1,140, adjectives 12), 1,708 noun rows and 122 adjective rows under the wrong part of speech (a verb table on a
  noun entry), 40 adjective rows with a case or definiteness.
- Tags the mapper did not understand: none (0 kinds) among the table rows; every tag of those rows is mapped or on the list of
  tags it knowingly leaves out. A new label would be reported under `unknownTags`.

## Known disagreements with Wiktionary (not "fixed" in the rules)

Wiktionary's Albanian tables are template-generated and sometimes wrong (STATUS.md lists qeshqesh, hedhni, vdiqi, muajtë). No
rule was changed to match a table; the merge marks the cell `conflicted` and shows both forms. The top conflicting lemmas, with
what is known about which side is right:

| Lemma | Table says | Rules say | Which is right |
| --- | --- | --- | --- |
| numëroj, mbizotëroj, proshmoj, rregulloj | numeroj, mbizoteroj, proshëmoj, regulloj (letters lost or added in the whole table) | the lemma as spelled | the rules follow the headword; the table's stem differs from its own headword |
| aprovoj | aprooj, aproon | aprovoj, aprovon | rules (the table drops the v) |
| përfundoj, irnoj, shajtoj | 2nd and 3rd sg = the lemma (përfundoj); plural -ojim | përfundon; përfundojmë | rules: the table treats a verb in -oj as a consonant stem |
| vuaj, mbroj | participle vuar, mbruar; aorist vova, mbrova | vuajtur, mbrojtur; vuajta, mbrojta | rules (the table applies the -oj pattern to verbs with a -jt- stem) |
| zgjedh | zgidhni, zgidhja | zgjidhni | rules, probably (zgjidhni; the table loses the j) |
| vesh | veshni, veshja | vishni, vishja | rules, probably (e becomes i before -ni, as in ndizni, shihni) |
| udhëheq | udhëhiqni | udhëheqni | the table, probably (udhëhiqni); not fixed, a candidate for the word list's `forms` |
| vras | vritni, vritja | vrisni | not known; needs a native speaker |
| pres | preva, prërë | prita, pritur | not a conflict: two verbs spelled pres (to wait, to cut); the word list holds one |
| lot, gjysh, spital, hundë, luftë, kompjuter, lëkurë | plural lotë, gjysha, spitala, hundë, luftëra, kompjutera | lot, gjyshër, spitale, hunda, lufta, kompjuterë | plural choice: both sides may be attested; not known; needs a native speaker |
| gjarpër | gjárpri (accent mark) | gjarpri | not a conflict any more: the accent is dropped before comparing |
| lutem, ulem, kthehem … (gerund) | duke u lutur | duke lutur (before the fix) | the table; the rules now give "duke u" + participle for a verb that exists only in the non-active |

Conflicts cluster in few lemmas: 76 of 1,255 generable lemmas (6 %) have any, and the 20 worst account for about 365 of
the 570 conflicted cells. The per-cell lists are in the JSON (`topConflictingLemmas`, `topConflictKinds`).

## Not covered (exactly)

- Any lemma outside the word list (except the -oj guess): 82 % of the lemmas with a Wiktionary table. Nouns and adjectives are
  never generated from a bare lemma.
- Nouns whose definite shape no rule reaches (for example gruaja) have only the forms the word list states, and no template.
- Adjectives: no case, definiteness, comparative or superlative cells (constructions: më i mirë); only the article of the nominative
  is in the form. only 6 adjective entries have a Wiktionary table, so adjectives are almost unconfirmed.
- Neuter nouns: the article table (`linkingArticle`) has none, so a neuter's genitive note is generic.
- Verbs: the future, perfect, pluperfect, conditional, progressive and the infinitive are constructions, not cells. The optative and
  admirative only for verbs in -oj (the admirative with a participle in -uar) and for verbs whose entry lists them; the imperfect
  subjunctive and the admirative imperfect are not generated; the non-active voice only where the word list marks it; the
  negative imperative (mos + subjunctive) is a construction.
- Pronouns: only the five personal pronouns. Possessives, demonstratives, interrogatives and indefinites have no paradigm.
  Their Wiktionary tables are not merged (a pronoun table has no person in its tags).
- Determiners, numerals, prepositions: `undefined`.
- Dialect forms (Gheg, Arbëresh) and older spellings: not in any paradigm.
- Vocative: Wiktionary rows tagged vocative are not placed (the adapter has no vocative value).
- Stress marks: not part of any form.
- Merging a dictionary table for a lemma whose gender the word list does not know leaves the table's noun cells without Gender (they
  are `supported` only, and do not meet a generated cell).

## Re-running

```
npx vite-node --config scripts/vite.config.ts scripts/probe-paradigm-sq.mts
npx vitest run test/adapters/albanian-paradigm.test.ts test/adapters/albanian-paradigm-table.test.ts
```

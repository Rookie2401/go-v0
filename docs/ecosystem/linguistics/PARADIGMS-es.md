# Spanish paradigms (Linguistic Engine V2, Stage 3)

Status 2026-10-10. Code: `src/adapters/spanish/paradigm.ts` (generation, the analysis-to-cell helpers, the merge-order helper),
`src/adapters/spanish/table-tags.ts` (the dictionary's table tags to feature keys); wired into `esAdapter.paradigm` and
`esAdapter.featuresFromTableTags` (`src/adapters/es.ts`). Probe: `scripts/probe-paradigm-es.mts` (numbers below; JSON in
`paradigm-es-2026-10-10.json`). Tests: `test/adapters/spanish-paradigm.test.ts`, `spanish-paradigm-tags.test.ts`.
The analysis output and the adapter version (`adapter-es@12`) are unchanged: no analysis file was touched (see "Generation bugs
found, not fixed" for why).

Everything is machine-drafted. "Verified" means the engine's rules and Wiktionary's table gave the same form; it is not a native
speaker's confirmation.

## What is generated

Only what the adapter already generates: the conjugation engine (`conjugateLemma`: regular rules, the stem-change classes, the
irregular tables and their prefixed relatives), `pluralsOf` and `nominalForms`. A cell exists when the engine produced a form
for its features; nothing is composed by the paradigm code except the voseo fallback and the reflexive notes below.

| Part of speech | Kind | When | Cells |
| --- | --- | --- | --- |
| VERB, AUX | `verb-conjugation` | the lemma has the shape of an -ar / -er / -ir / -ír verb (or that plus `-se`), and the engine can conjugate it. The caller's `pos` is the dictionary's word that it is a verb | about 68 |
| NOUN | `noun-declension` | any lowercase or capitalised word | Number; plus the feminine section when the word list has the counterpart |
| ADJ | `adjective-declension` | any lowercase word | Gender × Number, or Number only (invariable) |
| anything else, a phrase, an acronym or a mixed-case word | `undefined` | | |

Verb cells: infinitive, gerund, participle (masculine/feminine × singular/plural); indicative present, imperfect, preterite,
future; conditional; subjunctive present, imperfect in **-ra** and **-se** (two sets of cells, `Variant=Ra` / `Variant=Se`),
future (archaic, noted); imperative (tú, vos, usted, nosotros, vosotros, ustedes). Each finite tense is Person × Number (6 cells)
and the present indicative, the present subjunctive and the imperative have the extra vos cell.

`template` names the class ("regular -ar", "stem-changing -ir (e>i)", "irregular (er)"; ", reflexive" is added). A verb
that is on no irregular or stem-change list is "regular" by assumption; its notes say so (an unlisted stem change would not
appear). 

### Feature inventory

The keys and values are the analysis': `VerbForm` (Fin, Inf, Ger, Part), `Mood` (Ind, Sub, Imp, Cnd), `Tense` (Pres, Imp, Past, Fut;
the conditional has none), `Person` (1, 2, 3), `Number` (Sing, Plur), `Gender` (Masc, Fem), `Variant` (Ra, Se: the imperfect
subjunctive), `Polite` (Form: the usted / ustedes command, as the analysis has it). One key is added by the paradigm:

- **`Variety: 'Voseo'`** on the vos cells. The analysis marks voseo only in `varieties: ['voseo']`; a cell needs a feature to
  be told from the tú cell (same Person, Number, Mood, Tense). tú stays the unmarked cell. Voseo is the Honduran target
  (es-HN): each vos cell says so in its note. When the engine omits a vos form because it equals tú (it leaves it out of its
  list), the cell is still given, with the tú form and the note "same as the tú form". Exception: `haber` has no vos present
  (its table skips it), and the verbs with no tú command have no vos command.
- Vosotros is `Person=2, Number=Plur` (the analysis' reading, with variety `vosotros`); each such cell's note says "vosotros
  (Spain)". Usted / ustedes are the 3rd-person cells; the imperative ones carry `Polite=Form`.
- The negative command is not a cell: it is the present subjunctive (a note says so).

`spanishCellFeatures(pos, morph, varieties, {genderAxis})` projects an analysis reading to the cell's features (adds
`Variety=Voseo`; drops a noun's Gender; fills the missing VerbForm / Tense / Polite of the older hand-written readings: soy, estás,
perdona). `spanishCellFeatureSets` expands a reading whose features are lists ("Person": "1,3") into one bundle per combination.
Use these before `cellOf`.

### Layout

Verbs: `columns` = Number (singular, plural); `rows` = Person (1st yo / nosotros, 2nd tú, vos / vosotros, 3rd él, usted /
ellos, ustedes); `sections` = `VerbForm`, `Mood`, `Tense`, `Variant`; `labels` for each of those and for `Variety` and
`Polite`. Two cells share a (row, column) slot in a section: tú and vos (differ in `Variety`). The card prints both in the slot,
with the `Variety` label. The non-finite cells have no Person (infinitive, gerund) or Person and Number are replaced by
Gender × Number (participle): they sit in their own sections (`VerbForm` Inf, Ger, Part). A cell that lacks the row key belongs
to the row whose value is `''`.

Nouns: columns Number; rows Gender, either one row `['', '']` (no heading) or `['', 'masculine']` and `['Fem', 'feminine']`. The
masculine (the lemma's own) cells carry no Gender, as the analysis of plurals does (`niños` is `Number=Plur`); the feminine
counterpart (niña, niñas) has `Gender=Fem`. The counterpart is given only when the word list has it (niño → niña,
trabajador → trabajadora as nouns). Adjectives: rows Gender (Masc, Fem), or one row `['', 'masculine and feminine']` for an
invariable adjective (grande: `Number=Sing`, `Number=Plur`, no Gender).

### Constructions, reflexive verbs

- **Compound tenses and periphrases are constructions, not cells.** `constructions` lists `perfect-tense` (haber + participle: he
  hablado, había hablado, habré hablado …), `ir-a-infinitive` (voy a hablar) and `estar-gerund` (estoy hablando); the ids are the
  keys of `spanish/constructions.ts`. The notes spell out the formulas. No cell holds more than one word.
- **Reflexive verbs** (`lavarse`): the cells are the forms of `lavar` with the clitic in the note ("me lavo", "te lavás",
  "nos lavamos"); the affirmative command's note has the glued form (lávate, lavate, lávese, lavémonos, lavaos, lávense). The
  infinitive and gerund cells are the citation forms lavarse, lavándose (that is the lemma's own spelling).

## The dictionary half (`featuresFromTableTags`)

`table-tags.ts` maps one kaikki row's tags to the same keys. It differs from the existing `morphFromTags` (which labels a
dictionary reading and may return a list) in that a row names exactly one cell: a row with two persons is not a cell;
"conditional" beats "indicative" (Wiktionary tags a conditional row with both) and has no Tense; the imperfect subjunctive is
`Variant=Ra` unless the row says `imperfect-se`; `vos-form` gives `Variety=Voseo`; the usted / ustedes command ("formal …
second-person-semantically third-person") is Person 3 with `Polite=Form`. A noun or adjective row tagged both genders
("feminine masculine plural") has no Gender (the form of an invariable word, as generated).

Rows that map to `undefined` (not cells): the table's own bookkeeping rows (`table-tags`, `inflection-template`, `class`:
"o-ue alternation"), the clitic-attached "combined-form" rows (hablarme, háblame …), the infinitive and gerund listed person by
person for reflexive verbs (quejarme), the negative commands, and derived forms (diminutive, augmentative, superlative,
alternative, comparative). Qualifier tags that do not change the cell (informal, regional labels such as argentina, archaic …) are
ignored; `unknownTableTags` returns the tags with no rule at all, for the probe's report.

`alignDictionaryCells(generated, dictionary)` puts, for each cell, the dictionary form that equals a generated form first.
`mergeParadigm` judges a cell by the first dictionary form it meets, so a cell the dictionary lists with two variant spellings
would otherwise be called conflicted when only the second spelling matches the rules. This belongs in the core; it is here because the lane may not touch `src/core/paradigm.ts`. The probe uses it.

## Probe numbers (kaikki Spanish, 2026-10-10, full file, `adapter-es@12`)

`npx vite-node scripts/probe-paradigm-es.mts` (about 1 minute; `-- --limit N` for a fast run; `-- --conflicts file.tsv` dumps every
conflict). 811,049 lines read, 113,912 verb / noun / adjective entries with form rows parsed.

| | |
| --- | --- |
| Lemmas with a table | 102,236 (verbs 8,896, nouns 68,788, adjectives 24,552) |
| Lemmas the adapter generated for | 93,175 (verbs 8,706, nouns 60,319, adjectives 24,150); 9,061 not generated |
| Cells (generated ∪ dictionary) | 805,780 |
| verified (both agree) | 785,951 (97.54 %) |
| supported (dictionary only) | 13,269 |
| generated (rules only) | 1,467 |
| conflicted | 5,093 (0.63 %) in 1,053 lemmas (verbs 288 lemmas / 4,303 cells; nouns 708 / 708; adjectives 57 / 82) |
| Course word list (1,422 lemmas with a table) | 26,904 verified, 211 supported, 26 generated, 8 conflicted, in 5 lemmas |

Rows: 728,030 placed in a cell; 843,990 not cells (mostly the combined-form rows); 111,566 "-" (the form does not exist); 32,349
phrase forms (a space) skipped; 18 with no features. Verbs by class: regular (assumed) 8,304 lemmas, 559,918 cells verified, 4,137
conflicted; stem-changing 265 lemmas, 117 conflicted; irregular (the tables and their prefixed relatives) 137 lemmas, 9,236
verified, 49 conflicted.

The 9,061 lemmas not generated: multiword lemmas (dar a luz, hombre de letras), acronyms and mixed-case words (DVD, RAM), foreign
words, and verbs that end in an irregular base with a prefix the engine does not list (postponer; see below). `supported` cells are
mostly the feminine counterparts and plurals of nouns not in the word list.

### Where the two disagree, and who is right

Judgement is mine, from Spanish orthography and the RAE rules as I know them; none of it has been checked by a native speaker.

| Disagreement (count) | Example | Right side |
| --- | --- | --- |
| Verbs on no list that change their stem; the engine assumes regular (about 205 lemmas, 11 present-tense cells each; 55 more with 13–40) | ventar, soldar, asentir, interferir, estreñir (dictionary: ventamos / asiento / interfiero / estriño; engine: asento, interfero, estreño) | Wiktionary. The engine's stem-change lists are hand lists; a verb on none is conjugated by the regular rules. The paradigm's notes say so for a lemma not in the word list, and the merge shows the cell as conflicted |
| Prefixed relatives of irregular verbs whose prefix the engine does not list (antedecir, circunvenir, aponer, postponer, malquerer, facer …) | dictionary postpuesto / engine postponido | Wiktionary. The paradigm returns `undefined` for these (a guard on the endings -poner, -venir, -decir, -hacer, -facer, -traer, -tener, -querer, -valer, -salir), so the dictionary's table stands alone. The same guard drops the four participle cells of a verb in -scribir / -cubrir the engine has no irregular participle for (transcribir → transcrito, not transcribido) |
| Verbs that conjugate like reír but are not on its list (engreír, desleír, esleír) | engriendo, engrío / engine engreyendo, engreo | Wiktionary |
| `huir`, `fuir`, `fluir`, `fruir`, `luir`: voseo and vosotros present, and `huí` | dictionary huis, hui / engine huís, huí | Wiktionary (since the 2010 orthography ui and iu are one syllable for writing, so the monosyllables lose the accent; construís keeps it). The engine writes the old accent; this is in the course word list (huir) |
| The vos command of verbs in -eír / -oír / -aír | dictionary reí, freí, sonreí, desoí / engine réí, sonréi, desoye | Wiktionary. A bug in `accentLast` and in the `oír` table (see below); in the course word list (reír, freír, sonreír) |
| Participles | dictionary transcrito, premuerto / engine transcribido, premorido | Wiktionary (also, `-scripto` is a River Plate variant the engine lists as an alternative) |
| `reírse` | dictionary reyéndose, reo / engine riéndose, río | the engine; Wiktionary's `reírse` table is built on the wrong template. A reason to read a conflict before trusting either side |
| `rehacer`, `contrahacer` | dictionary rehíce, rehízo / engine rehice, rehizo | the engine, as I understand the orthography (the monosyllable rule applies to the base hice, hizo; not verified against the RAE here) |
| Archaic verbs (facer, jacer, resaber, premorir) | fecho / facido | Wiktionary; the engine has no archaic tables |
| `concernir`, `yacer` voseo subjunctive | concierne / concerne; yagás / yazcás | Wiktionary for concernir (the engine's e>ie -ir list lacks it); both are accepted for yacer (yazca, yaga, yazga), the engine gives one |
| Nouns and adjectives (708 + 82 cells): borrowed words with a consonant ending | banner → banners / banneres, display → displays / displayes | Wiktionary records the usual plural; the engine applies the consonant rule (-es). 464 of the 708 noun conflicts are this. A note on a noun not in the word list says so |
| Colloquial adjectives in -ao (aweonao → aweoná) | aweoná / aweonaa | Wiktionary |
| Capitalised nouns (Pascua) | Pascuas / pascuas | now the paradigm keeps the capital (acronyms and mixed case are `undefined`) |

The 8 conflicts in the course word list are huir (4), reír, freír, sonreír (the vos command), and the invariable plural of the
adjective guay (guay / guais, guayes). The first seven are engine bugs.

## Generation bugs found, not fixed

Fixing them changes the analysis output (new or corrected forms), so it needs the adapter version to go from 12 to 13, and the version
is pinned in tests outside this lane (`spanish-engine-dev`, `spanish-lexicon`, `spanish-wiring`, `verification`,
`reader-languages/es`). The decision is the coordinator's. Fixes, in order of value to the course:

1. `deriveImperatives` (`verb-regular.ts`): `accentLast` adds an accent to a stem that already ends in an accented vowel (reí → réí). Skip it
   when the stem has an accent. Also give the `oír` table `imp.vos: ['oí']` (the prefixed desoír / entreoír return the tú form).
2. `monosyllableSpelling` (`verb-regular.ts`) only strips á, é, ó: extend it to the diphthong ui / iu (huís → huis, huí → hui).
3. `IRREGULAR_PARTICIPLES` prefixes: `scribir` lacks more prefixes (trans- is there; tras-, co-, des-, manu-, rees-); `-cubrir` has few. A rule
   `*scribir → *scrito`, `*cubrir → *cubierto` would cover the lot.
4. `accentedIU`: every verb in -grafiar takes the accent (radiografío); the hand list has only some.
5. `stemClassOf` lists: the 205 unlisted stem changers are individually small, collectively the bulk of the verb conflicts. The probe's
   conflict dump (`--conflicts`) is a ready list (ventar, mentar, soldar, concordar, asentir, interferir, estreñir …).

## What is not covered

- Compound tenses and periphrases (constructions only, by design); the passive; the progressive and other periphrases.
- The -des endings (amábades) and any archaic or dialectal conjugation beyond the engine's tables; the Golden Age forms.
- Defective verbs: the paradigm gives the six persons the engine generates for llover, nevar, soler, etc. and marks no cell as
  nonexistent; `haber` is the one verb whose missing vos cell and commands are skipped.
- Voseo variants beyond the one the engine generates (Honduran voseo with the -és / -ás subjunctive, no -áis / -éis variants).
- The negative command as a separate cell; clitic-attached forms (hablarme, háblame, dímelo): the dictionary's "combined-form" rows
  are ignored, and the analysis reads them as a base plus clitics.
- Nouns: diminutives, augmentatives; irregular plurals the engine does not know; the second plural of a borrowed word. Adjectives:
  comparison (mejor, más grande), the -ísimo superlative, apocope (buen, gran), adverbs in -mente.
- Pronouns, determiners and articles (`pronoun-paradigm`, `determiner-paradigm`): not generated; the closed classes are lists.
- A lemma that is not a verb, noun or adjective, a multiword lemma, an acronym, or a mixed-case word.
- Only the course adapter's own variety targets: the probe makes no Honduran claim and checks no form against a native speaker.

# Language-specific feature matrix (Linguistic Engine V2, as of 2026-10-10)

What each language's engine actually has, measured, not planned. "n/a" means the language has no such thing; "—" means
not built. Availability percentages come from `scripts/probe-linguistic-coverage.mts --n 200` on the owner's course corpus
(`docs/ecosystem/linguistics/baseline-2026-10-10.json`, re-run after Stage 2); correctness numbers come from the
paradigm probes (`paradigm-<lang>-2026-10-10.json`) and the gold report (`GOLD-REPORT-2026-10-10.md`), all AI-judged and
unreviewed by a native speaker.

## Resources

| | Albanian (sq) | Spanish (es) | German (de) | Hindi (hi) | Thai (th) | Norwegian (nb / nn) |
|---|---|---|---|---|---|---|
| script | Latin | Latin | Latin | Devanagari | Thai (no word spaces) | Latin |
| course word list (lexemes) | 1,350 | 1,812 | ~3,860 | 2,972 | 1,692 | ~1,790 / fewer |
| dictionary, schema 3 (entries) | 91,271 | 808,278 | 357,750 | 38,635 | 20,254 | — (none on disk) |
| full records, schema full-1 | 14,471 (29 MB) | 123,933 (244 MB) | 102,649 (409 MB) | 26,036 (86 MB) | 20,860 (11 MB) | — |
| with inflection tables | 11,020 | 100,493 | 94,820 | 21,342 | 8,100 (no inflection; forms = classifiers/variants) | — |
| with etymology / IPA / audio | 10,194 / 4,954 / 87 | 62,396 / 85,105 / 35 | 74,871 / 62,391 / 74,138 | 22,149 / 24,086 / 783 | 16,607 / 20,789 / 273 | — |
| licence | Wiktionary via kaikki.org, CC BY-SA 4.0 (attribution shown on the card) | same | same | same | same | n/a |

## Analysis (Level 1)

| | sq | es | de | hi | th | nb / nn |
|---|---|---|---|---|---|---|
| lemma + POS given | 100 % | 100 % | 100 % | 100 % | 100 % | (nb corpus) |
| any morphological feature | 81.5 % | 69.5 % | 67 % | 78.5 % | 0 % (none to give) | yes |
| feature keys used | Case, Definite, Gender, Number, Person, Tense, Mood, Voice, Degree | Mood, Tense, Person, Number, Gender, VerbForm, Variant (Ra/Se), Variety (Voseo) | Case, Gender, Number, Person, Tense, Mood, Degree, Position, Decl, Clause, Separable | Case (Dir/Obl/Voc/Erg/Dat/Gen), Gender, Number, Person, Aspect, Tense, Mood, Honorific, Adp | POS classes, function-word classes, classifier | Definite, Number, Gender (Fem,Masc unions), Degree, Tense, Mood, Voice |
| units / parts | clitic doubling, linking articles | attached pronouns (`parts`) | separable verbs (`unit`), compounds | verb groups (vector + auxiliaries), postpositions | compounds, serial verbs | compounds, ei/en variants |
| constructions detected | yes | yes | yes | yes (12 ids with explanations) | yes (32 ids lack pack explanations) | yes |

## Generation and paradigms (Level 2, Stage 3)

| | sq | es | de | hi | th | nb / nn |
|---|---|---|---|---|---|---|
| paradigm kinds | noun, adjective (with linking article), verb, pronoun | verb (incl. voseo, -ra/-se), noun (gender pair), adjective | noun (Case × Number, article in note), adjective (strong/weak/mixed, degree), verb (Mood × Tense × Person × Number, separable bracket), determiner | noun (Case × Number), adjective, pronoun (Dir/Obl/Erg/Dat/Gen), verb (single-word forms; 12 constructions) | none: constructions + segmentation alternatives | noun (Definite × Number), adjective, verb, AUX, pronoun, determiner |
| lemmas with a generated table | 7,097 of the dictionary's tabled lemmas | 93,175 of 102,236 | 9,333 of 87,681 (word list is small) | 2,918 generated (noun 1,619, verb 1,112, …) | n/a | all word-list rows (nb 844 N / 347 V / 235 A) |
| cells verified vs dictionary | 26,971 verified, 570 conflicted (98 % agreement where both have a form) | 785,951 verified (97.5 %), 5,093 conflicted (0.63 %) | 291,525 verified, 19,440 conflicted (verbs 7.3 %, nouns 0.1 %) | 51,858 verified, 223 conflicted | n/a | no Norwegian dictionary table yet: every cell `generated` |
| forms table on the card (availability) | 91.5 % | 65.5 % | 88 % | 75.5 % | 17.5 % (variants) | — |
| selection projection (`cellsFor`) | union cases, articles stripped | comma lists, voseo variety | Gender dropped on nouns, Pred cell | causative mark dropped, unions split | n/a | union Gender/Mood taken apart |

## Syntax (Stage 4)

| | sq | es | de | hi | th | nb / nn |
|---|---|---|---|---|---|---|
| rules (`adapter.syntax`) | clauses, copula, agreement subjects, clitic doubling (expl), linking articles, prepositions, markers (SYNTAX-sq.md) | see SYNTAX-es.md (lane in progress at the time of writing) | V2/verb-final clauses, syncretism alternatives, two-way prepositions, separable bracket, modal xcomp (SYNTAX-de.md) | verb groups → root + aux, ergative agreement, postposition case, genitive agreement, कि/अगर/जो clauses, quotes (SYNTAX-hi.md) | SVO, serial verbs, aspect/modal aux, classifiers, ว่า/ที่ clauses, final particles (SYNTAX-th.md) | V2 and inversion, pronoun case, double definiteness, aux chains, som/at clauses (SYNTAX-nb-nn.md) |
| role given before Stage 4 | 19.5 % | 0 % | 8 % | 0 % | 35 % | — |
| relation given after Stage 4 (probe, 200 selections) | 100 % | 98.5 % | 99.5 % | 100 % | 94 % | nb 100 % / nn 97 % attached (corpus) |
| relations with alternatives kept | 14.2 % | — | 8.1 % | 6.2 % | 16.6 % | 3 % |
| gold dev UAS / LAS (rules tuned on it) | 100 / 99.7 | — | 99.8 / 99.8 | 98.9 / 98.4 | 89.3 / 88.3 | 99.7 / 99.7 ; 96.4 / 96.4 |
| blind first-run UAS / LAS (held-out, before fixes) | — | — | 89.3 / 87.4 (held-out), 96.1 / 94.3 (unseen) | 94.1 / 92.0 (fresh) | 75.2 / 72.1 | 96.2 / 93.8 ; 91.2 / 89.5 |
| independent treebank | UD STAF+TSA on disk: UAS 52.8 / LAS 43.8 (18 % of words unknown to the adapter) | none on disk | none on disk | none on disk | none on disk | none on disk |
| ms per sentence (syntax only) | 0.04 | — | 0.09 | 0.08 | 0.01 | 0.1 |

Every gold label is AI-judged and unreviewed; the dev scores are regression numbers, not accuracy estimates; the blind first-run
numbers are the honest estimates for text like the course corpus; only Albanian has an independent treebank score.

## Origin, structure, sound (Stages 5–6)

| | sq | es | de | hi | th |
|---|---|---|---|---|---|
| etymology present (card) | 92 % | 97 % | 91.5 % | 98.5 % | 93.5 % |
| IPA present | 80.5 % | 99.5 % | 96.5 % | 97 % | 95 % |
| audio named | 9.5 % | 3.5 % | 97.5 % | 32 % | 14 % |
| derived / related words | 65 % | 90.5 % | 83.5 % | 44.5 % | 93.5 % |
| word structure | see ETYMOLOGY.md | | | | |

Norwegian has no dictionary on disk, so its Level 2 sections are honestly "unavailable" except the generated paradigm.

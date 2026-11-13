# Biblical Aramaic resource coverage

This milestone supplies the complete declared Biblical Aramaic source corpus to ordinary GoLearn and transfers its evidence into Ecclesia. It supplies linguistic resources for Claude's course design; it is not a claim that every historical Aramaic dialect or an independent-reading curriculum is finished.

## Measured corpus

| Source scope (qere reading path) | Verses | Word occurrences |
| --- | ---: | ---: |
| Daniel 2:4b–7:28 | 200 | 3,599 |
| Ezra 4:8–6:18 and 7:12–26 | 67 | 1,212 |
| Jeremiah 10:11 | 1 | 15 |
| The two-word Aramaic name in Genesis 31:47 | 1 | 2 |
| Total | 269 | 4,828 |

Each verse is a bundled document. The original Daniel 2:4b and 2:20 document IDs are preserved. Hebrew portions of mixed verses are excluded. Ketiv readings are retained in the source snapshot but not duplicated in the selected qere text. The corpus has 714 terminal source lemma identifiers (1,108 full prefix/lemma chains) and 744 lemma/POS identities. Numeric lexical entries are kept separately from language-specific learning identities.

The offline build uses 694 selected Open Scriptures Strong entries and exact augmented identifiers from selected Lexical Index entries. An augmented identifier is never reduced to its numeric prefix: for example, Aramaic 6211 b names herbage, whereas Hebrew 6211 a names a moth. A gloss is available for 4,802 occurrences; 26 occurrences of H3390 with different prefixes have a source headword but no definition in this source. They remain explicitly unavailable. Prefix-only entries use the established OSHB prefix lookup, with that provenance distinguished in SOURCES.md.

## Morphology and uncertainty

All 4,828 selected annotations are retrievable and ranked first in their exact source-verse context. The report separately counts ambiguous forms, supported stems/conjugations/states, unresolved readings, and 11 questioned source annotations. Agreement with the input corpus is not independent linguistic accuracy; no held-out specialist accuracy score has been established.

The adapter indexes pointed forms, consonantal spellings, headwords and source references. It retains alternative readings; unpointed input lowers confidence. The lexical API returns attested forms, frequencies and references without inventing citation-form morphology. Attached particles, nominal states, verbal features and pronominal suffixes come from source codes and boundaries. All 35 source paseq signs are preserved alongside maqqef and sof pasuq. Unknown words and unsupported dialects remain unresolved.

Eleven existing Ecclesia source-audit exclusions are carried through as requires-review warnings. The raw annotations remain visible for adjudication; they are not silently rewritten. A warning is not evidence that every other annotation has been independently checked.

No productive analyser for unseen forms, source-verified general root inventory, historical audio, contextual translation corpus, Targumic module or Classical Syriac module is claimed. Dictionary glosses describe headwords, not verified translations of each occurrence.

## Reproduce

- `npm run arc:build -- --check`: rebuild comparison against bundled source snapshots, without writing.
- `npm run arc:report -- --summary`: complete source inclusion, ranking, unresolved readings and questioned annotations.
- `npm run arc:report`: also lists attested constructions and vocabulary recurrence. Its filename order is a corpus audit, not a teaching sequence.
- `npx vitest run test/adapters/aramaic.test.ts test/adapters/aramaic-source.test.ts test/language-packs/aramaic.test.ts test/integration/aramaic.test.ts test/integration/aramaic-export.test.ts`.
- `npm run arc:export -- <output.json>`: deterministic source-evidence bundle for Ecclesia.

Course ordering, script instruction, reviewed bridge passages and deliberate vocabulary repetition remain Claude's authoring work. The source-backed shelf exposes authentic material; it does not label 269 authentic verses as beginner lessons.

# Biblical Aramaic first slice

Base: master 30106b4dedb7d70872e6a5861f286e9636e933ac. Scope: normal GoLearn, not Ecclesia.

## Architecture audit and implementation
- Packs: packages/language-packs owns manifests, validation, installation records, runtime and the picker catalogue. Aramaic is an experimental installable pack with a compiled source lexicon; no external dictionary download is declared.
- Language identity: arc + arc-bib + Hebr; family metadata is descriptive. This is a Biblical Aramaic pack, not a generic assertion that all Aramaic varieties share its grammar. Syriac remains a separate future syc/Syrc module.
- Text mechanics: reuse pure square-script normalization, tokenization, sentence segmentation, source-code decoding and morphology display from the Hebrew modules. No Hebrew adapter or installed index is imported. Existing Hebrew history is not migrated or relabelled.
- Lexicon: 26 source-word annotations / 21 distinct source lemma identifiers, from Daniel 2:4b and 2:20. Headwords and base glosses are from the Open Scriptures Strong lexical transcription, not fabricated roots. Lexical meaning is separated from inflected contextual translation.
- Reader: existing reader and Language.direction render RTL; canonical source offsets remain UTF-16. The extension gets its normal lazy analyser chunk. The setup picker and tutorial use existing surfaces.
- Repository: the shared linguistic resolver now accepts languages according to adapter.script and records the actual script on its units. Aramaic units retain arc IDs, separate from he IDs.
- Vocabulary: unchanged AppStore, encounter/event projection and six-state Repository model. No second learner database, evidence policy or scheduling engine.
- Review: ordinary pack facts supply lexical base-meaning recognition when a source-attested form has one unambiguous lemma. Morphology flows through existing source feature facts. The shared FSRS fold, due dates, exclusion rules and event history remain authoritative.
- Corpus: schemaVersion 2 documents under data/corpus/arc are discovered by the existing importer. The course catalog supplies the two real works, not shelves falsely claiming future books.
- Recommendations: normal GoLearn coverage/recommendation contracts apply. A reusable Course.primaryReadingKinds setting lets a historical-language course use Scripture as primary reading input; other courses keep their existing genres. Course path availability follows that same setting. Encounter coverage is not comprehension; no reading proficiency claim is made.

## Evidence and ambiguity
The source decoder reads only A-coded annotations. The exact known passage can rank its source's reading, retaining alternatives. Outside that alignment all attested readings remain. Unpointed matching lowers confidence. Unknown words and unsupported dialects stay unresolved; roots and productive paradigms are deliberately absent.

The source text is preserved on the selected qere reading path, with morphology slashes removed and punctuation joined. Daniel 2:4a is Hebrew and excluded. The qere servant is singular in this source; the alternative ketiv is not silently combined with it. No modern conversational Aramaic is invented.

## Validation
See test/adapters/aramaic.test.ts, test/language-packs/aramaic.test.ts and test/integration/aramaic.test.ts. Checks cover source features, ambiguities, offsets, dialect rejection, browser loading, Repository script/language identity, pack install, import, shared persistence/coverage, real review facts, exercise generation and FSRS Easy/replay.

A local execution environment was unavailable during authoring. GitHub CI is the execution gate. The focused job on 8440ccd45e63e9496ed58e8474dd92c6f9fbfbb8 passed all 19 tests, the source report and the analyser build. This verifies the programmatic slice; real-device visual and independent scholarly validation remain open. The full regression result is tracked independently.

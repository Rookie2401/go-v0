# Definition pipeline audit and correction

Audit date: 2026-10-30. Sol coordinated three GPT-6 Luna workers. Changes are local and have not been deployed.

## Established cause

`src/adapters/greek/generated/koine-core.ts` stores the lemma ἀγαπάω with the citation gloss “I love”. `src/adapters/greek/morphgnt.ts::decodeMorphGnt` separately decodes person, tense, voice, mood and number; `src/adapters/greek/analyze.ts` attaches that morphology and the lemma gloss to candidates. The evidence inspected does not establish a faulty future-person decoder.

`src/golearn/queries.ts::tokenSupport` previously selected `lemma.gloss` for the reader, while `src/ui/reader/TokenCard.tsx` rendered it alongside separate morphology. The extension/Biblia path similarly copied candidate glosses in `packages/golearn-extension/src/parser/index.ts::parseSelection` and prioritized them in `packages/golearn-extension/src/popup/card.ts::createCardUI`. Lexical and inflected meanings shared one field. This explains the reported wording without assuming that the morphology itself was lost.

Biblia's `packages/biblia/src/app.ts` supplies sentence text and a source reading hint. The hint can prioritize an existing matching candidate; it does not create an analysis. The change also carries the verse reference into the parser.

## Implemented boundaries

`src/core/word-analysis.ts` supplies a shared evidence projection separating lexical, inflected and contextual meanings, normalized surface, language, grammatical features, sentence, references, confidence and ambiguity. Missing evidence remains null. Reader and extension models expose the projection; the UIs distinguish lexical-only fallback from a supported inflected translation and show the literal meaning beneath a contextual rendering.

`src/adapters/greek/word-analysis.ts` is an intentionally bounded map for the four requested ἀγαπάω spellings, gated by supplied morphology. It is not a general Greek conjugator or contextual translator. “You shall love” additionally requires the explicit GAL.5.14 reference and compatible inflected evidence. Other contexts retain the literal “You will love”. Genuine alternative morphology remains visible. Existing lemma data is not rewritten.

GoReview changes and preservation evidence are detailed in [MORPHOLOGY-REVIEW-AUDIT.md](MORPHOLOGY-REVIEW-AUDIT.md). Form answers no longer inherit lemma glosses indiscriminately, and warm facts include variety in their cache key. No persisted scheduling/event migration is performed.

## Remaining work and limits

- General inflected English realization and contextual disambiguation for Greek and the other languages remain incomplete. Unsupported meanings are disclosed rather than synthesized. The exact-form map addresses the regression but does not certify linguistic accuracy outside its bounds.
- The language inventory and limitations are in [MORPHOLOGY-COVERAGE-AUDIT.md](MORPHOLOGY-COVERAGE-AUDIT.md). Projection tests across languages prove separation of fields, not translation accuracy. Equivalent complete reader-to-review translation tests for every installed language remain outstanding.
- Existing stored learner events, lexical records, card identities and scheduling histories are preserved by leaving them untouched. Persisted historical exercise snapshots and all external deployment caches have not been migrated or comprehensively audited. Recomputed facts apply the correction; this is not proof that every previously saved display is repaired.
- The DOM regression exercises real compiled Greek data through the parser and popup, including Unicode normalization. This does not substitute for a manual installed-extension/device run or the full Biblical corpus; existing Biblia corpus-dependent tests skip when their data files are absent.
- No network/model fallback was added. The new projection and small lookup are local. There is no new performance benchmark or specialist-reviewed multilingual gold corpus.

## Validation

`npx vitest run test/extension test/goreview test/goreview-app test/adapters test/core` completed with 7,314 passing tests, 18 skipped, and one obsolete UI assertion rejecting the word “context” in the new lexical-only label. The lead updated that assertion to require the explicit label; rerunning its entire `test/extension/card.test.ts` file passed all 49 tests. No implementation changed after that broad run. The original run log is retained in `docs/MORPHOLOGY-TEST-RESULTS.txt`.

The focused real Greek popup, evidence projection, asynchronous dictionary and GoLearn support run passed 73 tests. The complete GoReview exercise suite passed 140 tests. `git diff --check` passed. These runs overlap and their counts must not be added.

`npm run typecheck` exits 1 with only the two pre-existing missing `@capacitor/cli` imports in `packages/biblia-ios/capacitor.config.ts` and `packages/goreview-ios/capacitor.config.ts`. No new type errors remain. No production build, deployment, or manual device verification was performed.

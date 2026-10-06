# Foundation review handoff — 2026-10-04

Run `npx vite-node --config scripts/vite.config.ts scripts/prepare-curriculum-review.mts` to reconstruct both packets from actual source documents and current adapters/course maps. The generator never modifies wording, native-review approval, published stages, or source rights.

## Complete generated-draft queue

`data/review/curriculum-remediation/foundation-review.json` contains all 126 generated corpus documents: German 34, Spanish 28, Hindi 28, Albanian 22, and Thai 14. Every task includes exact text/document/source identities, source-file SHA-256, content signature, current work/stage references, actual publication-blocking reasons, adapter version, word-token/type/reading-unit counts, first reading units, and an empty native-review signoff form. All 126 remain unpublished with native review unresolved; no approvals were created.

Ten legacy story/dialogue seeds have no current work/stage binding. Their references remain null rather than inventing a placement. A reviewer must cover grammar, spelling, naturalness, English/meaning alignment, vocabulary/repetition, local variety, script load and learner suitability before an integrator can bind an approval to the current signature. Any wording edit invalidates the old review binding and requires a fresh signature/signoff.

## Hindi and Thai script-to-language packets

The same file includes first existing meaningful sentences and up to twelve distinct words from three actual early texts per language. Hindi uses `s0a-01`–`s0a-03`; Thai uses `bridge-thai-bridge-01`–`bridge-thai-bridge-03`. Words remain in their original scripts with source IDs, hashes and occurrence context. Existing adapter decoding and orthographic features are copied without inventing a sound mapping. Uncertain or absent outputs remain unresolved, and every word has an empty reviewer sound signoff.

Thai's selected bridge drafts are the earliest available generated narrative candidates, not an approved Stage 0 sequence. Stage 0 still needs native validation connecting sound/script decoding to these meaningful words and sentences. These packets supply concrete material for that work; they do not certify pronunciation, provide new native audio, replace canonical text with romanization, or claim learner readiness.

## Held native placement proposals

`data/review/curriculum-remediation/held-placement-proposals.json` measures all 92 Hindi GDL texts and 45 Thai 1956 Aesop texts using their actual adapters. Hindi lengths range from 59 to 3,037 word tokens; Thai from 28 to 437. Each text includes its complete identity/signature, current stage, measured word/type/reading-unit counts, proposed length-based review order, overlap with the immediately preceding candidate and all earlier candidates, and newly introduced normalized types. The measured ordering is useful for selecting review pairs and detecting steep vocabulary introductions.

The shorter/middle/longer groups are relative length strata, not CEFR labels or a new beginner/intermediate ladder. Hindi retains its canonical `c1` assignment and Thai retains `g1`; zero canonical stages changed. Every proposal is held for native pedagogical judgement. Surface-form overlap is an exposure proxy, not evidence of known vocabulary, lemma equivalence, contextual correctness, listening proficiency or comprehension. Thai reading units are adapter units rather than certified grammatical sentences.

Missing controls remain explicit: native level/variety checks, script and morphology load, planned vocabulary and construction introductions, authentic repetition, observed learner comprehension and verified audio. The reviewer must decide which candidates can support the still-missing beginner and intermediate strata; length alone cannot make that decision.

## Validation

The fresh generator run asserted exactly 126 generated documents, unique text IDs, unpublished status with nonempty blocking reasons, and exactly 92/45 source documents. It produced two script packets and 137 held proposals. Review status/approvals remain unresolved throughout. The output can be regenerated deterministically; adapter or source changes alter its recorded signatures, hashes and measurements for a fresh review.

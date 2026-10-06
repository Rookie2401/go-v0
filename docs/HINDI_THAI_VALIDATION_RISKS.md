# Hindi and Thai validation risks — 2026-10-04

## Fresh checks

Five focused adapter suites pass (132 tests): base Hindi and Thai, Thai prose segmentation, Hindi real-adapter disambiguation, and Hindi production checks. These are regression checks, not evidence that newly acquired reading is beginner-appropriate or correctly analysed in every context.

The current `eval-hi-gold.mts` run reports zero accepted native-review items and 189 model drafts awaiting review. Hindi correctness remains unmeasured by its accepted-gold instrument. Earlier documentation's held-out Scripture lexical coverage cannot establish contemporary prose accuracy or difficulty.

## Corpus risks to carry into integration

- Hindi's `probe-hi-coverage.mts` loops only explicit `paragraph.sentences` from the bundled corpus. It skips raw `paragraph.text` and does not evaluate the entire installed library. Running that probe cannot certify all newly acquired GDL/literary raw-text documents; use import/materialization and inspect their actual profiles/analysis.
- Hindi's list-vouched candidates and unconfirmed morphology guesses are different evidence. A dictionary-backed candidate does not prove correct contextual interpretation. Do not report lexical coverage as a native correctness or CEFR measurement.
- Thai relies on ICU dictionary segmentation plus selected compound repairs. Reading-unit boundaries and ambiguous spelling/tone remain uncertain. Preserve exact source offsets and every non-space character when new long paragraphs materialize; punctuation or whitespace word counts do not establish Thai token counts or sentence counts.
- Thai's curated lexical/gloss/construction layer is explicitly machine-drafted and not native-reviewed. Historical fables do not fill an independently validated modern everyday A0–B1 narrative slot by themselves.
- Source fidelity/rights review and native pedagogical review have separate purposes. New source imports must retain that distinction, and copyright restrictions must stay bound to their recorded jurisdictions and exact editions.

## Existing baseline test failure repaired

The baseline `hi-gdl-prepare.test.ts` reconstruction failed with a generic stack trace after 56.98 seconds. A focused rerun revealed the actual 20-second test timeout and took 25.88 seconds. Its child `vite-node` invocation omitted the tool configuration, loading the full application configuration (React plugins and the rights gate) for a cached-text-only task.

The test now uses the existing `scripts/vite.config.ts`, unique scratch output paths, cleanup in a finally block, and a bounded child timeout. The same full identity/signature/entry-preservation assertions pass; both tests complete in 593 milliseconds (reconstruction 582 milliseconds). No cached documents or helper behavior changed, and the global/test timeout was not increased.

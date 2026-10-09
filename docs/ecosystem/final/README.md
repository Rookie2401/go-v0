# Final reports — Go ecosystem

Status: 2026-10-09. The reports that close the ecosystem build. Each states what the repository's tests and measurements show and where nothing was verified.
None of them claims Kindle support, native-quality pronunciation, legal clearance, or that any language is production-ready.

## Written in this folder

| file | one line |
|---|---|
| `FINAL-ARCHITECTURE.md` | the two applications and the shared infrastructure as wired: entries, imports, event families, one encounter-to-projection flow, deployment shape, enforced boundaries |
| `ALBANIAN-REFERENCE-IMPLEMENTATION.md` | what the Albanian learner can do end to end, step by step of the §14 run, with the limits (machine-drafted, no audio, no native review, web pages and the local EPUB reader only) |
| `GOLISTEN-CAPABILITIES.md` | playback, phonological evidence and listening assessment kept apart; the voices and verdict per language (sq, es, de, hi, th, nb, nn) |
| `GOREVIEW-SCHEDULING.md` | FSRS adoption (ts-fsrs 5.4.2, FSRS-6.0), frozen vectors, what §18 verified with test names, what is not claimed |
| `GOTELL-INDEPENDENCE.md` | the three proofs that GoTell is independent of GoReview, what it shares, authorship rules, the evidence it submits |
| `REPOSITORY-EVENT-INTEGRITY.md` | event validation, dedupe, commutative projection and replay equality, tombstones, export format, open integrity items |
| `MULTI-LANGUAGE-EXTENSIBILITY.md` | Spanish as the second language through the shared interfaces: what `test/multilang` proves, size growth, thin parts, not production-ready |

## Added by the coordinator

| file | one line |
|---|---|
| `PRIVACY-AND-SECURITY.md` | the combined privacy, portability and security position (sources: `../audit/PRIVACY-PORTABILITY.md`, `../audit/SECURITY.md`) |
| `PRODUCTION-READINESS.md` | what stands between the current state and any production use, per area and per language |

## Existing audit documents that serve as final reports

| file | one line |
|---|---|
| `../audit/LINGUISTIC-ACCURACY.md` | Albanian analyser and the layers above it measured on 323 words in 70 fresh sentences; all judgements are a model's, none a native speaker's |
| `../audit/READER-COMPATIBILITY-RETEST.md` | the final content script retested on harness pages and the controlled EPUB reader; per-reader classification; Kindle blocked |
| `../audit/RIGHTS-AND-ATTRIBUTION.md` | inventory of what the builds distribute, licences as the repository records them, attribution gaps, items for a rights lawyer; not legal advice |
| `../audit/OFFLINE-FAILURE.md` | queues, backoff, duplicates, ordering, sessions, conflicts and corrupted caches under injected faults |
| `../audit/PERFORMANCE.md` | measured lookup, service, review, sync and start-up timings on one loaded PC, with the HTTP floor stated |
| `../audit/LEGACY-SALVAGE.md` | the position of every `src/` file today: salvaged and wired, type-level, prototype, allowed-unwired, or retired |
| `../audit/END-TO-END-INTEGRATION.md` | the 43-step Albanian run over the real applications and Repository, defects found and their state |

Other audit documents referenced by the reports: `../audit/ARCHITECTURE-CONFORMANCE.md`, `../audit/MODEL-SCHEDULER-LISTEN.md`, `../audit/SECURITY.md`, `../audit/PRIVACY-PORTABILITY.md`, `../audit/ACCESSIBILITY.md`.

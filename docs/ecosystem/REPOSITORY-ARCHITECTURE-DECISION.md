# Go Repository — architecture decision record

Status: decided 2026-10-08 at the start of Prompt 3, after inspecting the outputs of Prompts 1 and 2 and the existing
stack. Facts about the code are from the repository as it is; nothing here is aspirational unless marked "later".

## 1. What was inspected before deciding

- Prompt 1: `GO-REPOSITORY-DESIGN.md` (three layers, D1–D5), `packages/repository-contract` (contract v1: envelope,
  20 kinds, `validateEvent`), the boundary test, `RIGHTS-AND-PRIVACY-BOUNDARIES.md`.
- Prompt 2: the reader decision (extension first; Kindle only through the learner's own copy/paste; the extension
  writes `SelectionLookedUp` events whose subject carries a sentence hash and a source reference, never text; the
  surface is stored only up to four words). The Repository must accept exactly that event shape, and must not assume
  it will ever receive a page or a book.
- The existing stack: a local-first Vite/React/Dexie PWA with no account system; one existing server,
  `server/goread` — a single `handle(Request, deps)` written against web APIs, run on Node with `node:sqlite` or on
  Cloudflare Workers with D1 from the same `schema.sql`, bearer keys hashed with sha256 and compared in constant time,
  no third-party dependencies, tests in `test/server`. Node 24 (built-in `node:sqlite`). No PostgreSQL, no Docker on
  the development machine; the owner deploys to Cloudflare and handles all secrets themself.
- 2GoLearn (`C:\Users\CJWal\dev\2GoLearn`): a dependency-free core with a four-modality fold (reading, listening,
  writing, speaking), a single evidence policy, a deck with two schedulers, and GoListen as a module.

## 2. Decisions

**R1. One logical system, six packages, no services.** `repository-contract` (types, validators, ports),
`repository-linguistics` (Layer A), `repository-store` (memory + SQLite), `repository-engine` (Layer C),
`repository-service` (the authenticated API), `repository-sync` (device side). Everything runs in one process; the
service is the only networked piece and GoLearn/GoPractice keep working without it (local store + local engine).

**R2. Storage: SQLite through `node:sqlite`, schema in portable SQL, following the repo's own server convention — not
PostgreSQL.** Reasons: the project already has exactly this pattern (`server/goread`), with a D1 twin for the owner's
Cloudflare deployment; the development machine has no PostgreSQL and the owner wants no secrets or infrastructure
handled by the assistant; SQLite gives the transactional guarantees the prompt asks for (BEGIN IMMEDIATE, rollback
on failure) and the whole schema is plain SQL with parameters only. PostgreSQL remains possible later by porting
`schema.sql` and the driver module; nothing in the ports assumes SQLite. The memory store implements the same port
and runs the same conformance suite, which is how the engine and service are tested without a file.

**R3. Linguistic knowledge is relational with typed relations, not a graph database.** `LinguisticUnit` rows of ten
kinds, `UnitRelation` rows of ten relation kinds with confidence, provenance and status, and `FormAnalysis` rows whose
`candidates` array is the representation of ambiguity (several readings with confidence; `chosen` is a preference,
never a deletion). Ids are content-derived and shared with the extension prototype (`lemma:sq:libër:NOUN`,
`form:sq:librin`, `morph:sq:NOUN:<feature key>`, `phrase:sq:…`). Identity migration between pack versions is a
`UnitAlias` row with `mapping: 'certain' | 'uncertain'`; uncertain aliases leave evidence where it is.

**R4. Learner evidence is an append-only event log with runtime-validated typed payloads.** Contract version 2 keeps
v1 envelopes valid (the extension prototype's rows load unchanged) and adds optional `varietyId`, `evidence`
(declared quality, assisted flag, source reliability — the engine may lower, never raise), `processing` (parser and
pack versions), `producer.surface`. Twelve payload shapes cover the required observation types; every payload
validator refuses keys that would carry text (`text`, `sentence`, `passage`, …) and surfaces longer than four words.
Private writing (GoTell documents) lives in a separate `documents` store with revisions, never in events.

**R5. Derived state is a versioned, commutative fold.** Seven dimensions per unit (`exposure`,
`assistedRecognition`, `readingRecognition`, `listeningRecognition`, `productiveRetrieval`, `contextualProduction`,
`grammaticalUnderstanding`), each with score, confidence, weighted counts, recency, contexts, difficulty and source
reliability; retention and uncertainty derived; `modelVersion` on every row; the fold uses only sums and maxima so
arrival order cannot change the result, duplicates cannot (the store refuses them), and a rebuild from the log must
equal the live rows. The exact rules and numbers are in `packages/repository-engine/README.md` and are hypotheses.

**R6. 2GoLearn's role (D1 narrowed).** The Repository's projection is its own module in this repository rather than
2GoLearn's fold, because the required model (seven dimensions, eight since projection@2, assistance kept apart, provenance and validation
status on every analysis, eligibility states, tombstones, aliases) is not the four-modality single-policy model
2GoLearn implements, and bending that fold would obscure the invariants this prompt requires tests for. 2GoLearn
remains the candidate for GoReview's deck and schedulers (scheduling is explicitly not the Repository's job) and its
conformance kit for language packs. D1 is therefore narrowed, not reversed; the owner may revisit when GoReview is
built.

**R7. Authentication and authorization live only in the service.** Accounts with scrypt-hashed passwords
(`node:crypto`, random salt), opaque session tokens (32 random bytes, sha256 stored, constant-time compare, 30-day
expiry, revocable), a device record per session. The learner of every request is the session's learner; a
`learnerId` named in a path or body that differs is refused (403) before any store access. Team membership is a
separate record and grants nothing: there is no route that returns another learner's data. Tokens never reach a page:
the extension's background worker holds the session; content scripts send messages. Nothing in this phase stores a
real secret anywhere; `data/repository/` is git-ignored.

**R8. Sync: immutable events union-merge by id and dedupe key; mutable documents by revision with conflict copies.**
A device queue persists an event before anything else happens; retries use backoff; a lost acknowledgement is
resolved by the server answering `duplicateOf`; clock skew is measured and reported, never used to rewrite `at`;
server `seq` is the pull cursor. Two devices editing one draft produce a conflict copy, never a silent loss.

**R9. Versioning.** `CONTRACT_VERSION` (envelope), `PAYLOAD_KINDS` (payload shapes per kind), `packVersion` /
`analyzerId` on units, analyses and events, `modelVersion` on every projection row and on the cursor (a version
change triggers a full rebuild), `schema_version` in SQLite migrations, eligibility policy version in the engine
README. Corrections never edit: a new analysis supersedes and the old one is marked invalidated with a reason.

**R9a. projection@2 (learner intelligence and eligibility, 2026-10-09).** `MODEL_VERSION` is `projection@2`; the next read of any
store holding `projection@1` cursors rebuilds once (the first seven dimensions of every row come out unchanged, `phraseComprehension` is added). What changed:
(1) an eighth dimension, `phraseComprehension`, judged on `phrase:` units only by unassisted evidence (a recognition card or assessment on the phrase, a small credit for
correct unassisted production, a weak self-report), never from a request for help; (2) an encounter or lookup is weighted by how its language was settled
(override and metadata 1.0, detection 0.7, team-default 0.5, undetermined: no observation, a v2 event without the block 1.0); (3) eligibility reads the analysis status
together with the validation level of the resource behind it: experimental, seed-only and unreviewed are provisional at best and recognition-only whatever the confidence,
incomplete and unsupported require review, and `requires-review` is a first-class status ranked between provisional and conflicted; (4) the candidate rules propose a
construction when three or more of its forms give trouble, penalise unvalidated resources, and do not propose a unit that already has a card; (5) a correction returns the units to
withdraw, writes aliases for a wrong single-reading analysis (certain for a reviewer, uncertain for a learner) and supersedes the old answer key, leaving every event untouched.
Rule tables: packages/repository-engine/README.md.

**R10. Not built in this phase (by instruction).** GoLearn and GoPractice interfaces; the Cloudflare D1 twin of the
store (the SQL is written to make it a port, as goread's was); PostgreSQL; email delivery, password reset; any
calibration of the estimates against independent assessment.

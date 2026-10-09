# Go Repository — data model, linguistic knowledge units and relationships

Status: implemented 2026-10-08 (Prompt 3). The code is the authority: `packages/repository-contract/src/{units,learner,
payloads,ports,index}.ts` (types and validators), `packages/repository-store/schema.sql` and `migrations/001-initial.sql`
(tables). This document explains the model and names where each rule lives. Decisions: `REPOSITORY-ARCHITECTURE-DECISION.md`.

## 1. Three layers, three sets of tables

| layer | tables | written by | changed by learner performance? |
|---|---|---|---|
| A. linguistic knowledge | `units`, `relations`, `analyses`, `aliases`, `packs` | the linguistics service (resolver over the language adapter; reviewer/learner corrections as new rows) | **never** |
| B. learner evidence | `events` (+ `event_units` index, `event_heads`), `tombstones` | applications through the service / sync; the Repository for profile events | append-only; physical removal only by the learner's tombstones and erasure |
| C. derived learner state | `knowledge`, `projection_cursor`, `preferences` | the projection engine only | recomputed from B; never edited by hand or by an application |
| identity and private text | `learners`, `accounts`, `sessions`, `devices`, `teams`, `team_members`, `enrolments`, `documents` | the service | documents by revision; the rest by the owner's actions |

SQLite (`node:sqlite`), STRICT tables, WAL, foreign keys on, parameters only; every row keeps its full JSON beside the
indexed columns, so a contract field added later needs no migration. Migrations are numbered SQL files applied once
and recorded with a checksum in `schema_version`; an edited applied file is refused on open.

## 2. Layer A — linguistic knowledge units

`LinguisticUnit { unitId, kind, languageId, varietyId?, scriptId?, label, pos?, features?, frequency?, register?,
packId, packVersion, provenance, status, createdAt, supersededBy? }` with ten kinds (the required abstraction):

| kind | example id | what it is |
|---|---|---|
| `lexeme` | `lemma:sq:libër:NOUN` | lexical identity |
| `sense` | `sense:sq:libër:NOUN:1` | one meaning (label = the gloss) |
| `form` | `form:sq:librin` | an inflected surface form |
| `morph-construction` | `morph:sq:NOUN:Case=Acc\|Definite=Def\|Gender=Masc\|Number=Sing` | a morphological construction (feature structure) |
| `multiword` | `phrase:sq:në_shtëpi` | a multiword expression |
| `syntactic-construction` | `syntax:sq:clitic-doubling` | a syntactic pattern |
| `phonological-distinction` | `phon:sq:ë-vs-e` | a sound contrast |
| `pronunciation-pattern` | `pron:sq:sq-standard:<note>` | how a class of forms sounds in a variety |
| `orthographic-pattern` | `orth:sq:<name>` | a sound–symbol regularity |
| `form-meaning-link` | `link:form:sq:librin~sense:sq:libër:NOUN:1` | a specific form ↔ meaning relationship |

Ids are content-derived through `unitIds` in the contract and are the same ids the extension prototype writes into
events, so an encounter and its analysis meet on the same key. Every unit carries `provenance { source, ref,
confidence, validatedBy?, validatedAt? }` (sources: hand-lexicon, dictionary, rule, parser, reviewer, learner, import)
and a `status` from `verified | high-confidence | provisional | conflicted | invalidated` (ranked by `STATUS_RANK`; a
store never lowers a stored unit's status on re-resolution; retirement is `supersededBy` + an alias, not a downgrade).

### Relationships (`UnitRelation { fromId, relation, toId, confidence, provenance, status, varietyId? }`)

| relation | from → to | the requirement it covers |
|---|---|---|
| `form-of` | form → lexeme | surface form belongs to lemma |
| `sense-of` | sense → lexeme | lemma has sense |
| `realizes` | form → morph-construction | form realizes morphological features |
| `contains` | multiword / construction → lexeme or form | phrase contains lexical units |
| `idiomatic-meaning` | multiword → sense | expression has idiomatic meaning |
| `requires` | syntactic-construction → feature-bearing unit | construction requires grammatical features |
| `pronounced-as` | form → pronunciation-pattern (varietyId) | pronunciation corresponds to a form in a variety |
| `depends-on` | unit → unit | a skill depends partly on another |
| `variant-of` | unit → unit | orthographic or dialect variant |
| `alias-of` | unit → unit | corrected identity (migration) |

"Encounter supplies evidence concerning several knowledge units" is not a relation row: it is `subject.itemIds[]` on
the event (indexed in `event_units`).

### Ambiguity (`FormAnalysis`)

`{ analysisId, formId, languageId, sentenceKey?, candidates[], chosen?, status, analyzerId, packId, packVersion,
createdAt, supersededBy?, reason? }` — each candidate `{ lexemeId?, senseId?, features?, constructionIds?, role?,
confidence, provenance }`. Several candidates are the representation of ambiguity; `chosen` is a preference, never a
deletion. The Albanian resolver (`packages/repository-linguistics/src/resolver.ts`) keeps every adapter candidate,
creates one lexeme unit per distinct reading, and sets status by one function (`statusFor`): `conflicted` when a
rival reading is within 0.15 of the top; `high-confidence` only for hand-listed readings ≥ 0.85 without a rival;
`provisional` for rule-derived readings (most inflected forms, "librin" included) and unconfirmed ones; `verified`
only from a person (reviewer). Non-Albanian or non-Latin input yields a `form` unit only, `provisional`, with a note.

### Versioning and migration

`packs` rows (`LanguagePackInfo`: packId, version, analyzerId, coverage notes, licences, reviewStatus
`machine-drafted` for Albanian today). `aliases` rows (`UnitAlias { oldId, newId, packVersion, reason, confidence,
mapping: 'certain' | 'uncertain', createdAt }`): the engine re-targets evidence only through `certain` aliases;
`uncertain` ones leave the evidence on the old id and the coverage query reports it. A correction (`correct()` in the
linguistics service) writes a new analysis with one candidate and marks the old ones `invalidated` with a reason;
rows are never deleted. `affectedByInvalidation(analysis)` names the units whose review items must be withdrawn.

## 3. Layer B — events

Envelope (`GoEvent`, contract v2; v1 rows from the extension prototype remain valid): `id, v, learnerId,
enrolmentId, languageId, varietyId?, at (device clock), recordedAt (server), producer { app, version, deviceId,
surface? }, kind, subject { itemIds?, sentenceKey?, sourceRef?, cardId?, draftId? }, payload, dedupeKey?, evidence
{ quality, assisted?, sourceReliability? }?, provenance { packId, analyzerId, confidence?, status?, analysisId? }?,
processing { parserVersion?, packVersion? }?, correctionOf?`.

Seven families, 27 kinds, twelve payload shapes validated at the write boundary (`validatePayload`): encounter,
lookup, assistance, playback, understood, item-mark, listening-assessment (must state `answerShownBefore: false`),
written-review, grammar-assessment, writing-observation (`assisted` must be true when any assistance is listed),
user-correction, review-invalidation, preference-change (always explicit), plus the profile and card shapes. Any
payload key named `text`, `sentence`, `sentenceText`, `passage`, `content` or `body` is refused; a `surface` longer
than four words is refused. Book content never enters the log: a sentence is a hash (`sentenceKey`), a source is a
title and locator.

Storage rules (`packages/repository-store/src/rules.ts`): `seq` per learner in arrival order (independent of `at`);
unique `id`; unique `(learnerId, dedupeKey)`; an id already used by another learner is refused without disclosure;
`recordedAt` stamped by the store; `at_ms` kept for range queries across UTC offsets; `head` never decreases even
after tombstone deletions, so a sync cursor never sees a seq twice.

## 4. Layer C — derived state

`UnitKnowledge { learnerId, unitId, languageId, dimensions: Record<Dimension, DimensionEstimate>, retention
{ estimate, halfLifeDays, basedOn }, uncertainty, analysisStatus?, firstSeenAt?, lastSeenAt?, modelVersion, basis
{ events, lastEventId? } }` with the seven dimensions `exposure, assistedRecognition, readingRecognition,
listeningRecognition, productiveRetrieval, contextualProduction, grammaticalUnderstanding`; each `DimensionEstimate
{ score, confidence, observations, positive, negative, weight, lastAt?, lastAssisted?, contexts, difficulty?,
sourceReliability? }`. There is no known/unknown boolean and no single mastery number anywhere in the schema.

Evidence rules (every number in `packages/repository-engine/README.md`): a lookup, an explanation request and a
playback are exposure only; self-reports are discounted by source reliability; hinted or answer-shown attempts feed
`assistedRecognition`; a grammar answer moves only `grammaticalUnderstanding` of the construction; unassisted
correct writing moves `contextualProduction`, assisted writing `assistedRecognition`; accepting a correction moves
nothing. `score = (0.5·1 + Σ w·[positive]) / (1 + Σ w)`, `confidence = Σw/(Σw+2) × (1 − disagreement)`; all updates
are sums and maxima, so the fold is order-independent and a rebuild equals the live rows. Retention
`strength × 2^(−days/halfLife)` with `halfLife = 2 + 3·Σw` days. `modelVersion = projection@1` on every row and on
the cursor; a version change rebuilds everything. These are hypotheses until calibrated.

`AssistancePreferences` (explanation depth, terminology, transliteration, pronunciation-first, translation
availability, visual assistance, accessibility) with `origin: default | inferred | explicit` per field; explicit is
never overwritten by inference. Review candidates and suitability estimates are computed, not stored.

## 5. Identity and private text

`Learner`, `Account` (email unique, scrypt hash), `Session` (sha256 of the token, expiry, revocation), `Device`,
`Team`, `team_members` (a record that grants no data access), `Enrolment { learnerId, teamId?, languageId,
varietyId?, scriptId?, packId, packVersion, goals[] }` — knowledge belongs to the learner, enrolments carry team and
language, and a learner may hold several. `PrivateDocument { docId, learnerId, languageId, kind, title?, body,
revision, deviceId, updatedAt, deletedAt? }` holds GoTell text with optimistic revisions; an event references a
document by `draftId` and never carries its text. `Tombstone { scope: learner | source | range | event }` records a
deletion instruction before the physical removal; exports list tombstones.

## 6. Where to look

| concern | file |
|---|---|
| types, validators, ids | `packages/repository-contract/src/*.ts` |
| tables and migrations | `packages/repository-store/schema.sql`, `migrations/`, `src/migrate.ts` |
| store rules (dedupe, seq, no-downgrade, revisions) | `packages/repository-store/src/rules.ts` |
| the Albanian resolver and status rules | `packages/repository-linguistics/src/resolver.ts` |
| evidence rule table, fold, candidates, suitability | `packages/repository-engine/src/*.ts`, `README.md` |
| export schema `go-repository-export@1` | `packages/repository-store/src/export.ts`, `README.md` |

# Go Repository — data model, linguistic knowledge units and relationships

Status: implemented 2026-10-08 (Prompt 3); **contract version 3 added 2026-10-09** (section 7: typed source references, source
restrictions, language-resolution evidence, `PackInstalled` level and validation, provenance, `requires-review`; a v2 event stays
valid). The code is the authority: `packages/repository-contract/src/{units,learner,payloads,sources,ports,index}.ts` (types and
validators), `packages/repository-store/schema.sql` and `migrations/001-initial.sql`, `002-provenance.sql` (tables). This document explains the model and names where each rule lives. Decisions: `REPOSITORY-ARCHITECTURE-DECISION.md`.

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
and a `status` from `verified | high-confidence | provisional | requires-review | conflicted | invalidated` (ranked by
`STATUS_RANK`: invalidated 0, conflicted 1, requires-review 2, provisional 3, high-confidence 4, verified 5; a store never lowers a
stored unit's status on re-resolution; retirement is `supersededBy` + an alias, not a downgrade; the one path that lowers a status is
`recordUnitCorrection`, section 7.5). Contract v3 adds the provenance fields of section 7.4.

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

Envelope (`GoEvent`, contract v3; v2 events and the v1 rows from the extension prototype remain valid): `id, v, learnerId,
enrolmentId, languageId, varietyId?, at (device clock), recordedAt (server), producer { app, version, deviceId,
surface? }, kind, subject { itemIds?, sentenceKey?, sourceRef?, cardId?, draftId? }, payload, dedupeKey?, evidence
{ quality, assisted?, sourceReliability? }?, provenance { packId, analyzerId, confidence?, status?, analysisId? }?,
processing { parserVersion?, packVersion? }?, correctionOf?`.

Seven families, 26 kinds, thirteen payload shapes (v3 gives PackInstalled its own) validated at the write boundary (`validatePayload`): encounter,
lookup, assistance, playback, understood, item-mark, listening-assessment (must state `answerShownBefore: false`),
written-review, grammar-assessment, writing-observation (`assisted` must be true when any assistance is listed),
user-correction, review-invalidation, preference-change (always explicit), plus the profile and card shapes. Any
payload key named `text`, `sentence`, `sentenceText`, `passage`, `content`, `body` or `verseText` is refused; a `surface` longer
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
`strength × 2^(−days/halfLife)` with `halfLife = 2 + 3·Σw` days. `modelVersion = projection@2` on every row and on
the cursor (projection@1 had seven dimensions; @2 adds `phraseComprehension` and the language-basis factors, see the engine README); a version change rebuilds everything. These are hypotheses until calibrated.

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
| typed source references, restrictions | `packages/repository-contract/src/sources.ts` |
| the service's source policy | `packages/repository-service/src/source-policy.json` (data), `sourcePolicy.ts` (loader, `policyFor`) |
| provenance columns | `packages/repository-store/migrations/002-provenance.sql` |

## 7. Contract version 3 (2026-10-09)

`CONTRACT_VERSION = 3`, `ACCEPTED_VERSIONS = [1, 2, 3]`. **Compatibility rule: a v2 event stays valid and ingestible exactly as it was
written, and a v3 event differs from it only by optional fields and by one stricter check (the source reference).** Producers write
`v: 3`; a store or the service accepts all three. Tests: `test/contract/repository-v3.contract.test.ts` (contract),
`test/repository/v3-compat.test.ts` (v1, v2 and v3 events stored together and projecting to the same knowledge),
`test/repository/store/provenance.ts` (both stores), `test/repository/service/v3.test.ts` (the service).

### 7.1 The v2 to v3 table

| what | v2 | v3 | a v2 event under v3 |
|---|---|---|---|
| contract version | `v: 2` | `v: 3`; health reports `contractVersion: 3` | valid, stored, projected as before |
| `subject.sourceRef` | `{ kind, title?, locator? }`, any `kind` | a union keyed by `kind` (7.2); every member may carry `restrictions` | validated by the v2 rule (title and locator bounded; `restrictions`, if present, validated and capped by the service) |
| text keys refused | `text`, `sentence`, `sentenceText`, `passage`, `content`, `body` | adds `verseText` (any spelling: `verse_text`, `VerseText`) | the same guard applies to every event |
| language evidence | not in the payload | `payload.language` on `SelectionLookedUp` and `EncounterRecorded` (7.3) | optional, absent |
| `PackInstalled` | free `profile` payload | `{ packId, packVersion, analyzerId?, analyzerVersion?, level?, validation? }`, each validated when present (7.4) | valid; reads as `validation: 'unreviewed'` |
| `UnitProvenance` | `source, ref, confidence, validatedBy?, validatedAt?` | adds `origin, validation, licenceId?, packVersion?, analyzerVersion?, alternatives?, corrections?` (all optional in the type) | valid; reads as `origin: 'import'`, `validation: 'unreviewed'` (`provenanceOf`) |
| `FormAnalysis` | provenance only on candidates | optional `provenance` of its own | the chosen candidate's provenance is read |
| `AnalysisStatus` | five values | adds `requires-review` (between `conflicted` and `provisional`) | unchanged rows |
| `LanguagePackInfo` | no level | optional `level` and `validation` (the manifest's own claim) | read as `unreviewed` |
| SQLite | `001-initial.sql` | `002-provenance.sql`: `origin`, `validation` columns and an index on `units`, `relations`, `analyses`, back-filled from the JSON | rows get `import` / `unreviewed` |
| export | `go-repository-export@1` | same format string, plus `unitProvenance` | an older export imports as before |

### 7.2 The typed source reference

`SourceRef` is a union; `kind` is the discriminator and every member may carry `restrictions`.

| kind | fields | notes |
|---|---|---|
| `web`, `ebook`, `file`, `demo`, `practice`, `writing` | `title?`, `locator?` | unchanged; title at most 300 characters, locator at most 2048 |
| `scripture` | `provider` (`biblegateway` / `youversion` / `other`), `translationId`, `languageId?`, `book` (USFM, three capitals or digits), `chapter` 1..151, `verse?` 1..176, `verseEnd?` (needs `verse`, not before it), `url?` (http or https, no credentials), `confidence` 0..1 | **no verse text anywhere**; no title, no locator; the text guard refuses `text`, `verseText`, `passage` at any depth. Source tombstones match it by `BOOK.chapter[.verse]` (`sourceLocator`) |
| `share` | `mechanism` (`android-process-text`, `android-send`, `ios-share-extension`, `ios-safari-extension`, `web-share-target`, `clipboard-import`, `deep-link`), `sourceApp?` (100), `title?`, `locator?` | the passage itself is a hash like any other |
| `media` | `provider`, `mediaId`, `timestampMs?`, `captionLanguage?`, `audioLanguage?`, `captionProvenance?` (`provider` / `user` / `generated` / `unknown`) | **design only**: validated, stored, no integration; no title or locator, never a caption |

**Restrictions.** `SourceRestrictions { textRetention, remoteProcessing, audioRetention, export, sharing, reviewExamples }`, each
`Permission = 'allowed' | 'forbidden' | 'unknown'`. A reference carries any subset; **absent means every field `unknown`**, which is the
conservative reading (do not rely on it). `restrictionsOf(ref)` returns all six with the defaults filled in. Order for capping:
`forbidden` < `unknown` < `allowed`.

**The trusted half.** A restriction in an event is the client's claim. The service caps it with its own table keyed by the event's
`payload.readerId` (`packages/repository-service/src/source-policy.json`; the table is in REPOSITORY-API-AND-OPERATIONS.md section 7.1): per
field the more restrictive of the claim and the table. A client may tighten and never loosen; a reader the table does not know gets all
`unknown`. Metadata a page controls therefore never grants a permission. A typed reference is stored rebuilt from its known fields, so
nothing else a client adds survives. Restrictions are written to the stored reference only when the client sent some.

### 7.3 Language-resolution evidence

`payload.language` on `SelectionLookedUp` and `EncounterRecorded`: `{ languageId, varietyId?, basis, confidence, source?, override }`.
`basis` is one of `override` (the learner chose it), `book-metadata`, `document-metadata`, `detection`, `team-default`,
`undetermined`; `confidence` is 0..1; `override` must equal `basis === 'override'`; `source` is a few words (`html-lang`), never page
text. Optional on v2 events. **A detected language is not a user-confirmed one:** the basis is stored as given and never collapsed, so the
engine can weight evidence by it (an override or a declaration outweighs a detection); that weighting is the engine's, not the
contract's.

### 7.4 Pack validation and provenance (P-12)

`PackInstalled` carries `level` (`installable` / `experimental` / `planned`) and `validation` (`production-validated` / `experimental` /
`seed-only` / `unreviewed` / `incomplete` / `unsupported`) so the projection can caveat evidence from an experimental analyser.
Neither is required, because an older producer does not know them; an absent `validation` reads as `unreviewed` (`packValidationOf`).

`UnitProvenance` (units, relations, and analyses through their candidates or their own `provenance`) gains:

| field | meaning |
|---|---|
| `origin` | how the row entered the shared layer: `pack-lexicon`, `dictionary`, `rule-derived`, `learner-lookup`, `reviewer`, `import`. Absent reads as `import` |
| `validation` | the validation level of the pack behind the row. Absent reads as `unreviewed` |
| `licenceId?`, `packVersion?`, `analyzerVersion?` | which licence entry, which pack and analyser version |
| `alternatives?` | other unit ids that were considered (at most 50) |
| `corrections?` | `{ at, by: 'reviewer' / 'learner' / 'system', from?, to?, reason }`, oldest first, at most 50, reason at most 300 characters |

**Rows registered by a lookup.** When a `SelectionLookedUp` event is ingested (and on `POST /lookup`) the service stamps the rows the
resolver stored that carry no `origin` yet: `origin: 'learner-lookup'`, `packVersion`, and `validation` from the pack row
(`validationForPack`): an `installable` pack reads as `production-validated` **only if its manifest says so** (otherwise `unreviewed`, or
`seed-only` / `incomplete` where the manifest says that), `experimental` as `experimental`, `planned` as `unsupported`, no pack row as
`unreviewed`. **The stamp holds no learner id, no device, no session, no time of the lookup** (the shared tables are not learner data;
tested by searching the stored rows for the learner's id, email and device). A producer's own `origin` is never replaced; stamping happens
once per row; a store keeps stored provenance when a later write states none (`carryProvenance`).

Migration 002 keeps `origin` and `validation` as indexed columns, so `provenanceStats()` (and an operator's SQL) can count rows by origin
and validation. **Learner export.** `unitProvenance` lists the provenance of the units the learner's events refer to, with the v2
defaults filled in, so "why does the app say this?" has an answer on paper. **Deletion.** `DELETE /me` erases the learner's rows and
leaves these shared rows, which hold nothing of the learner; a correction's `reason` is the one piece of free text in them (at most 300
characters, no author), and a learner who put personal words there cannot have it found or removed by erasure.

### 7.5 `requires-review` and corrections

`requires-review` is a unit someone challenged with a correction that a reviewer has not settled. It ranks below `provisional`, above
`conflicted`, and is **sticky**: a re-resolution that comes back `provisional` or `conflicted` does not clear it; only a verdict
(`high-confidence`, `verified`) replaces it. `recordUnitCorrection(unitId, correction, flag)` on the store appends a correction and, when
`flag` is set, moves a `provisional` unit to `requires-review`; a correction by a `reviewer` may also move `high-confidence` and `verified`;
`conflicted` and `invalidated` are never changed. It is the one way a status goes down (a normal `putUnits` never lowers one).
`POST /units/:id/corrections` (a learner only) calls it: **one learner cannot lower a high-confidence or verified unit for everyone**, so
for those the correction is kept and the status stays. For a form given a `lexemeId` or `features` the linguistics port's `correct()` also
writes the superseding analysis (the same path as `POST /corrections`) and the unit is not flagged. The cap is 50 corrections per unit
(then 409).

### 7.6 Clock skew

`at` is the device clock; `recordedAt` is the server's, stamped on append; `seq` is arrival order and is what sync and the projection
use. The server never rewrites `at`. A sync push states the device's `clientTime`; the response's `clockSkewMs = clientTime - serverTime`
(positive: the device is ahead) is reported so a client can warn or display, never applied. A direct `POST /events` refuses an `at` more
than five minutes after the server's clock (`at-in-future`); a sync push allows the skew the device declares, up to a day.

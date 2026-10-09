# The Go Repository — API handoff for Prompts 4 and 5

Status: 2026-10-09, contract version 3. What the next phases may rely on, where it is, and what they must not assume.
Details: `REPOSITORY-DATA-MODEL.md` (§7 the v2→v3 table), `REPOSITORY-API-AND-OPERATIONS.md` (§7 source policy,
corrections, export), `packages/repository-engine/README.md` (projection@2 rules), `packages/repository-linguistics/README.md`.

## 1. Contracts (`packages/repository-contract`)

| piece | where | note |
|---|---|---|
| events (`GoEvent`, 26 kinds in 7 families, `validateEvent` for v1/v2/v3) | `src/index.ts`, `src/payloads.ts` | text keys refused at any depth; surfaces ≤ 4 words; ids capped; `at` ≤ 5 min ahead |
| source references (9 kinds: web, ebook, file, demo, practice, writing, **scripture**, **share**, **media** (design only)) with `restrictions` | `src/sources.ts` | `restrictionsOf`, `capRestrictions`, `validateSourceRef`; absent = every permission `unknown` |
| language evidence on `SelectionLookedUp` / `EncounterRecorded` | `payload.language` | `basis` from the resolver's closed set; `override === (basis === 'override')`; a detected language is not a confirmed one |
| pack status on `PackInstalled` | `payload.level`, `payload.validation` | `installable|experimental|planned`; `production-validated|experimental|seed-only|unreviewed|incomplete|unsupported` |
| linguistic units, relations, analyses, provenance | `src/units.ts` | `UnitProvenance.origin/validation/licenceId/packVersion/analyzerVersion/alternatives/corrections`; `AnalysisStatus` adds `requires-review` |
| learner model | `src/learner.ts` | **eight** dimensions (`phraseComprehension` added); `UnitKnowledge` per unit with estimate/confidence/observations/weight/recency; `modelVersion = projection@2` |
| ports | `src/ports.ts` | the store, linguistics, engine and sync interfaces GoPractice/GoLearn program against |

## 2. Service routes (`packages/repository-service`, `createRepositoryApi` in `src/api.ts`)

Accounts and sessions (`/accounts`, `/sessions`, `/me`, `DELETE /me`), enrolments (`/enrolments`, `POST /enrolments/:id/end`),
packs, `/lookup`, `/units/:id`, `POST /units/batch`, `POST /units/:id/corrections`, `/events`, `/reviews`, `/writing`,
`/knowledge`, `/candidates/:enrolmentId`, `/documents`, `/sync/push`, `/sync/pull`, `/export`, `/tombstones`, `/health`
(`contractVersion: 3`). Every route is scoped to the session's learner; `producer.deviceId` must be the session's or a
registered device; `enrolmentId` must belong to the learner; `languageId` must match the enrolment. Source
restrictions are capped by the trusted `source-policy.json` (a client can tighten, never loosen).

## 3. What the engine guarantees (`packages/repository-engine`)

- Deterministic, order-independent fold; a rebuild equals the live rows (`projection@2`); duplicates on `id` or
  `dedupeKey` store nothing; out-of-order events fold the same.
- Dimensions stay separate: exposure, assisted recognition, reading recognition, listening recognition, productive
  retrieval, contextual production, grammatical understanding, phrase comprehension. A lookup is exposure only;
  playback is exposure only; a copied or AI-generated sentence yields nothing; a hinted answer is assisted.
- Language-basis factors on exposure: override/metadata ×1.0, detection ×0.7, team-default ×0.5, undetermined none.
- Eligibility gate: `production-validated` + verified/high-confidence → every dimension; `experimental`/`seed-only`/
  `unreviewed` → provisional at most, recognition items only; `incomplete`/`unsupported` → requires-review, nothing.
  Confidence never raises a status. **Today every pack is machine-drafted (`unreviewed`)**, so GoReview may build
  recognition items only until a manifest or a reviewer validates an analyser (`packages/repository-linguistics/src/packs.ts`).
- Candidates: explained rules (repeated lookups, recent encounter, recall failures, grammatical leverage incl. the
  construction-level rule, analysis confidence by validation level, existing coverage, benefit vs burden, word frequency,
  mission relevance when a pack exposes it); no opaque ranking; the scheduler stays GoReview's.
- Corrections: `linguistics.correct()`/`invalidate()` return affected and withdrawn unit ids; events are never changed;
  the projection re-keys through aliases; an invalidated analysis never keeps an answer key.

## 4. Sync (`packages/repository-sync`)

Durable local queue, client ids, exactly-once under lost acks, backoff, per-item rejection (`rejected:` rows),
quarantine of corrupt rows, `clockSkewMs` reported and never applied, document conflict copies.

## 5. What Prompt 4 (GoLearn) may assume

The extension already emits v3 (`payload.language`, typed `sourceRef` incl. Scripture and share, restrictions from
the registry, `PackInstalled` with level/validation). The worker syncs, caches the learner model and refreshes it after
sync. The harness hook is not in the production bundle.

## 6. What Prompt 5 (GoPractice) may assume

`/candidates` gives explained, eligibility-gated candidates; `/knowledge` gives eight-dimension rows; `/reviews` takes
`CardReviewed`/`AssessmentAnswered`/`ListeningAssessed`; `/writing` takes GoTell's qualified events; GoTell's drafts are
private documents. It must not assume productive or grammar items for machine-drafted packs, Albanian audio, or a
reviewer role (none exists; reviewer verdicts are the operator's through the store).

## 7. Not done, not to be assumed

Native mobile, any verified third-party reader as an installed extension, permission from the permission-required
platforms, a Norwegian analyser, native-reviewed packs, a reviewer role or UI, the `media` source kind beyond its type.

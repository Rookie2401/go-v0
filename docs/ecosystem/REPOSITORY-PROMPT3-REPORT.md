# Prompt 3 — The Go Repository after universal reader integration: final report

Status: 2026-10-09. Commits: the phase started on `e579189e` (Prompt 2) and ends with the Prompt 3 commit named at the
bottom. Baseline investigation: `docs/ecosystem/audit/BASELINE-PROMPT3.md`. Handoff: `REPOSITORY-HANDOFF-PROMPT4-5.md`.

## Architecture

**What was implemented and why.** The Repository already existed (contract v2, memory and SQLite stores, projection
engine, service with 30 routes, sync). This phase closed the gaps the brief names rather than rebuilding:

- **Contract v3** (`packages/repository-contract`): a typed source-reference union of nine kinds (web, ebook, file,
  demo, practice, writing, **scripture**, **share**, **media** as a forward-compatible design), each with
  `restrictions` (text retention, remote processing, audio retention, export, sharing, review examples; unknown by
  default); `payload.language` on `SelectionLookedUp`/`EncounterRecorded` (resolved language, variety, basis,
  confidence, source, explicit override flag); `PackInstalled` with `level` and `validation`; provenance on units,
  relations and analyses (`origin`, `validation`, licence id, pack and analyser versions, alternatives, corrections);
  `requires-review` as a first-class analysis status. v1/v2 events still validate, store and project identically
  (`test/repository/v3-compat.test.ts`). Migration `002-provenance.sql` adds indexed `origin`/`validation` columns and
  back-fills; nothing is rewritten destructively.
- **Trusted source policy** (`packages/repository-service/src/source-policy.json`): per reader id, the most permissive
  restrictions the service will store; client claims are capped (tighten yes, loosen never). A page's own metadata
  cannot grant permission; the registry entries in the extension carry the same values and the adapter never reads
  them from the page.
- **Projection@2** (`packages/repository-engine`): the eighth dimension `phraseComprehension`; language-basis factors
  on exposure (override/metadata ×1, detection ×0.7, team default ×0.5, undetermined nothing); eligibility gates by
  validation level (confidence never raises a status; machine-drafted packs cap at provisional, recognition items only;
  incomplete/unsupported → requires-review); explained candidate rules incl. the construction-level rule ("repeated
  difficulty across N forms of definite accusative") and a graded analysis-confidence penalty (seed-only/experimental
  −0.3, unreviewed −0.1); corrections that re-key the projection through aliases, withdraw affected candidates and
  never touch events.
- **Extension and share** emit v3: language evidence from the controller's resolution, typed Scripture references
  (provider, translation, USFM book, chapter, verse, URL without trackers, confidence), restrictions from the frozen
  registry, `PackInstalled` with level/validation from the installer. The harness-only fixture hook is compiled only
  into `dist/content.harness.js`; the production bundle contains no such branch (bundle test).

**How linguistic identity works.** Stable content-derived ids (`lemma:sq:libër:NOUN`, `form:sq:librin`,
`morph:sq:NOUN:Case=Acc|Definite=Def|…`, `phrase:`, `sense:`), typed relations (form-of, sense-of, realizes, contains,
requires, pronounced-as, depends-on, variant-of, alias-of), versioned analyses with candidates, and aliases for
corrected identities. One encounter yields observations on several units (lemma, form, morph construction).

**How learner evidence differs from current estimates.** Events are immutable history (what was looked up, asked,
answered, heard, written); `UnitKnowledge` rows are a replayable projection of that history with per-dimension
estimate, confidence, observations, weight and recency; nothing writes a row directly, and no single known/unknown
field exists.

## Compatibility

- The existing GoLearn extension connects as before (sessions, sync, learner-model cache); browser and share events
  use the same `SelectionLookedUp` contract (equality test in `test/golearn-share/event.test.ts`).
- Language-resolution evidence is kept on every lookup event and weighted by the engine; a page declaring a language
  no pack covers never falls through to the team language (resolver rule from Prompt 2, unchanged).
- The reader suites, registry statuses, five-language loader, Scripture extraction and Unicode selection all pass
  (`test/extension` and `test/reader-languages`); the fixture-URL override is out of the production trust path.

## Intelligence

Projections are a commutative fold (sums and maxima) with explained weights per event kind and dimension (engine
README); modalities stay apart by construction and are proven apart in `test/repository/engine/separation.test.ts`
and in the vertical slice (reading, listening and writing move independently; an AI-corrected sentence yields nothing).
Candidates come from deterministic, explained rules; uncertain analyses are gated by validation level and status, and a
corrected or invalidated analysis withdraws its candidates while the learner's exposure follows to the new identity.

## Reliability

- **Vertical slice** `test/certification/repository-vertical-slice.test.ts`: 30 steps over the real service process
  on a SQLite file, the controlled EPUB reader (`udha-sample.epub`, owner-authored), the real worker and card, the
  real routes: 15 of 15 passing. Encounter → exposure without mastery → candidate with reasons → written review moves
  one dimension → listening moves another → an assisted writing observation moves none → the reader shows the
  updated state with the full analysis → replay equals live (dimensions, basis counts, retention within 0.01) →
  duplicates store nothing → an offline encounter survives reconnection once → another user is refused.
- **Lane suites**: contract v3 178 new tests; engine/linguistics 199 total (99 new); extension 52 new; the targeted
  union run after integration: see the gate below.
- **Synchronisation**: durable queue, client ids, exactly-once under lost acks, per-item rejection, quarantine of
  corrupt rows, clock skew reported and never applied (`test/sync`, `test/audit/offline.*`, slice steps 25–28).
- **Authorization**: two identities in the slice and in `test/audit/security.authz`, `privacy.team`: own events only,
  empty knowledge, refused candidates, documents and forged events; team membership grants no data access.

## Outstanding work

- **Behaviour to decide**: every pack is machine-drafted, so the gate keeps all review items at recognition level for
  Albanian too. Raising that needs a native review recorded in the manifest (`packs.ts`), not an engine change.
- No reviewer role or UI; reviewer verdicts are the operator's through the store. Mission relevance is dormant until a
  pack exposes `missionUnitIds`. The `media` source kind is a type only. BibleGateway verse ranges keep the first verse.
- Shared linguistic rows stamped by a lookup survive `DELETE /me` (they hold no learner data; documented).
- Rights questions (Pratilipi, Casa del Libro, Kobo, Bible providers) remain as in Prompt 2.
- Prompt 4 may assume everything in `REPOSITORY-HANDOFF-PROMPT4-5.md` §5; nothing in its §7.

## Gate (2026-10-09, `npx vitest run`, 408 s)

```
Test Files  2 failed | 598 passed (600)
Tests       2 failed | 13958 passed (13960)
npx tsc -b  exit 0
```

The two failures are the pre-existing retired-corpus integrity tests classified in `audit/BASELINE-PROMPT3.md` §2
(same assertions as before this phase). The five legacy timeouts of the previous gate did not recur in this run (the
machine was less loaded); they remain classified as load-sensitive. No Prompt 3 regression is outstanding.

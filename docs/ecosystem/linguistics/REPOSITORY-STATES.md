# Repository field states (Linguistic Engine V2, Stage 7)

Every linguistic FIELD the Repository stores carries its own validation state. A row-level status (`verified`, `high-confidence`,
`provisional`, ...) says how much to trust the row; a field state says how much to trust ONE statement in it: "the lemma is
`supported`, the features are `conflicted`, the etymology is `unknown`".

Code: contract `packages/repository-contract/src/field-states.ts`; rules `packages/repository-linguistics/src/field-states.ts`
(`fieldStatesFor`); wiring `resolver.ts` / `service.ts`; GoReview eligibility `packages/goreview/src/intake/review-eligibility.ts`.
Tests: `test/repository/linguistics/field-states.test.ts`, `test/goreview/intake/review-eligibility.test.ts`.

## 1. The three stores, kept apart

| Store | What it holds | Rows | Written by | Field states live here? |
|---|---|---|---|---|
| **Shared linguistic facts** (Layer A) | lexemes, forms, paradigm cells, senses, etymology, pronunciation: true of the language, learner-independent | `LinguisticUnit`, `UnitRelation` | resolver, packs, reviewers | **yes**: `unit.fieldStates` for the fields that belong to the unit (`etymology`, `pronunciation`, `paradigmCell`, `sense`) |
| **Contextual analyses** (Layer A) | a reading of ONE form in ONE sentence: lemma, pos, features, the cell it occupies, its syntax relation | `FormAnalysis` (candidates kept, `chosen`) | resolver, `correct`, `invalidate` | **yes**: `analysis.fieldStates` for the chosen reading (`lemma`, `pos`, `features`, `sense`, `paradigmCell`, `syntaxRelation`, `segmentation`) |
| **Learner evidence** (Layer B, then Layer C) | encounters, lookups, self-marks, review answers; the projection derived from them | `GoEvent` (immutable), `UnitKnowledge` | the apps | **no, never** |

Two invariants, both tested:

- A **correction never writes an event.** `correct` adds an analysis, invalidates the superseded ones and writes aliases; the event log
  and its head are byte for byte the same afterwards (`the three stores stay apart`).
- A **learner event never changes a field state.** Encounters, lookups, marks and the projection rebuild leave every stored `fieldStates`
  and row status untouched. The only way a field state changes is through the resolver (a better source), a reviewer's `correct`, or `invalidate`.

## 2. The six states and exactly what produces each

| State | Rule (the first that applies to a field decides) | Sources that can produce it |
|---|---|---|
| `verified` | a **named reviewer's** correction (`correct(..., { by: 'reviewer', reviewerId })`, or a reading whose provenance source is `reviewer`), or a reading from a source whose adapter marks it `native-reviewed`. **Never from confidence**, and never from two machine sources agreeing. | reviewer, `native-reviewed` source |
| `supported` | one authoritative source states it (hand lexicon or dictionary reading at confidence >= 0.85, not an unconfirmed guess; the dictionary's paradigm table; the dictionary's etymology / pronunciation) **and** the rules agree or do not speak (no competing reading within 0.15) | hand lexicon, dictionary, dictionary table |
| `provisional` | only the rules state it: a rule-derived or parser reading, an unconfirmed guess from a word ending, a lexicon reading below 0.85, a **generated** paradigm cell, **generated** syntax, a **learner's** unconfirmed correction | rules, parser, learner |
| `conflicted` | two sources disagree: readings within 0.15 of the top confidence that differ in the field; a conflicted paradigm cell; syntax of status `conflicted`; a segmentation with another cut within 0.15 | any two of the above |
| `unknown` | nothing states it (no reading, no features, no sense, no etymology fed). **A row with no `fieldStates` at all reads `unknown` for every field.** | none |
| `invalidated` | produced **only** by `invalidate` / `correct` (and the stores' `invalidateAnalysis`). The row, its candidates and the old state (kept in `basis`: "was provisional: ...; withdrawn: ...") stay. Terminal: a merge or re-resolution never revives it. | `invalidate`, `correct` |

Each entry is `{ state, basis, sources, at? }`: `basis` is one plain sentence, `sources` the provenance refs / `reviewer:<id>` / `learner`.

### How the older statuses map

| From | To | Note |
|---|---|---|
| analysis `statusFor` `high-confidence` | `lemma`, `pos`, `features`, `sense` **supported** | same source test (lexicon / dictionary, >= 0.85, not unconfirmed) |
| `statusFor` `conflicted` | split by what differs: **lemma** conflicted when the lemmas differ; **pos** when the parts of speech differ; **features** when readings of the same lemma differ only in features; **sense** follows the lemma | if the lemma is contested the features are at best `provisional` |
| `statusFor` `provisional` | the stated fields **provisional** | |
| `statusFor` `verified` (a reviewer / native-reviewed) | the fields the reading states **verified** | |
| `ParadigmCell.status` `generated` / `supported` / `conflicted` | `paradigmCell` provisional / supported / conflicted | |
| `ParadigmCell.status` `verified` (rules **and** dictionary agree) | `paradigmCell` **supported** | two machine sources agreeing is not a person's check; `verified` only with a named reviewer |
| enrich `FieldStatus` `supported-by-source` / `provisional` / `conflicted` / `unknown` | etymology / pronunciation supported / provisional / conflicted / unknown | |
| enrich `FieldStatus` `verified` | `supported`, unless a named reviewer or native-reviewed source stands behind it | |
| `SyntaxRelation.status` `generated` / `conflicted`; none | `syntaxRelation` provisional / conflicted / unknown | rules never verify themselves |

Row-level `status` is unchanged and still decides the engine's eligibility gate and the intake rules: field states are additional detail, not a replacement.

## 3. What each operation does to field states

- `resolveSelection` returns `analysis.fieldStates` (the seven contextual fields; `unknown` is explicit) and `unit.fieldStates` on the form (pronunciation, etymology, paradigm cell, only when something states them) and on each sense unit (`sense`). The caller can pass what only it knows through `ResolveInput.fieldEvidence` (`paradigmCells`, `etymology`, `pronunciation`, `syntax`, `segmentation`).
- `resolveAndStore` stores them. A unit seen again keeps its row but each shared field only **rises** (`mergeFieldStates`); an existing analysis is never rewritten, except that a row without field states gains them once.
- `lookup` returns them on the unit and on every analysis; an invalidated analysis always reads its stated fields as `invalidated`.
- `correct`: the corrected analysis states `lemma` / `pos` (from the lexeme id) / `features` as **verified** (reviewer; `reviewerId` is recorded in the source `reviewer:<id>`, a caller that omits it is recorded as the role `reviewer`) or **provisional** (learner). Fields the correction does not name stay `unknown`. Every superseded analysis keeps its row and its fields become `invalidated` (a legacy analysis gets its states derived first, so they can be shown as invalidated).
- `coverageGaps(languageId, ids, { byField: true })` and `coverageGapsByField` list the fields that are `provisional` or `conflicted` on the stored units and on the live analyses. Without `byField` the notes are exactly as before.

## 4. GoReview eligibility (which fields may be put to a human reviewer)

`reviewEligibility(analysisOrUnit, { encounters, conflicts? })` returns `{ eligible, reason, fields, priority }`.

1. An **invalidated** analysis (status or `supersededBy`) or unit is never eligible.
2. Only **conflicted** and **provisional** fields can be put to a reviewer. `verified`, `supported`, `unknown`, `invalidated` fields never.
3. A field the pack marks **unreviewable** (`LanguagePackInfo.unreviewableFields`) never.
4. A conflicted field needs **1** learner encounter, a provisional field **2** encounters in *different sentences* (a count of sentences, not of lookups).
5. `priority = conflicts x encounters` (`conflicts` defaults to the number of conflicted fields found; a provisional-only item has priority 0 unless the caller counts conflicts, and ties sort by encounters, then id).
6. An item with **no field states** (written before Stage 7) is not eligible here and is listed under `legacy` by `validationQueue`: the existing intake rules (`needs-validation`) keep deciding it, so nothing is dropped silently.

`validationQueue(items)` returns `{ queue, skipped, legacy }`: the queue sorted by priority, each skip with its reason. The reviewer sees `reviewerView`, which copies the stored state and basis and **never upgrades a field**. The reviewer's decision becomes `reviewerCorrection(formId, decision)` -> `service.correct(formId, request.correction)`, refused unless the reviewer is named; it never writes an event.

## 5. Migration and compatibility

- `fieldStates` is optional on `LinguisticUnit` and `FormAnalysis`; absent reads `unknown` (`fieldStateOf`). `validateUnit` / `validateAnalysis` check it when present (known field names, the six states, bounded basis).
- `CONTRACT_VERSION` (the **event envelope**) stays **3**: events are untouched and older readers ignore the new key. The Layer A row revision is the new constant `CONTRACT_REVISION = '3.1'`.
- Storage keeps the full row as JSON (memory and SQLite), so **no SQL migration** is needed and `schema.sql` is unchanged. Both stores now (a) set every stated field to `invalidated` in `invalidateAnalysis` (`rules.invalidated`), and (b) keep stored `fieldStates` when a producer that predates Stage 7 rewrites the row (`carried`, `carriedAnalysis`).
- Lazy backfill: a legacy analysis gains its field states the next time the same selection is resolved, or when it is corrected; nothing is rewritten in bulk.
- A store that predates Stage 7 invalidating an analysis only sets its status: `lookup` still shows the fields as `invalidated`.

## 6. What is still not stored

- **Syntax relations** are produced only where an adapter implements `syntax()` (Stage 4); the resolver does not call it yet, so `syntaxRelation` is `unknown` unless the caller supplies `fieldEvidence.syntax`.
- **Paradigm cells, etymology, pronunciation from the dictionary** are decided in the extension (`enrich.ts`, `paradigm.ts`); the resolver stores them only when the caller passes them as `fieldEvidence`. Without it `paradigmCell` and `etymology` are `unknown`, and `pronunciation` is `provisional` only where the adapter's own rules give notes.
- **Segmentation** states are stored only when supplied; no adapter feeds them to the resolver yet.
- **Shared-fact units for a lexeme** do not store `etymology` yet (it is stored on the form unit that evidence came with).
- No pack sets `unreviewableFields` yet, so no field is marked unreviewable in practice.
- The engine's eligibility gate (`eligibilityFor`) still reads row status and validation level, not field states.
- Spanish and Albanian are the only languages the resolver analyses; any other language yields an all-`unknown` analysis.
- Nothing yet turns a `validationQueue` into a screen: it is the sorted list with reasons, for the review app to render.

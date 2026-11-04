# GoReview Ecclesia — Engineering report

Date 2026-11-04. Branch **`feat/goreview-ecclesia`**, cut from `master` at **`30106b4d`** ("Three failures on GitHub's Linux machines"), in the worktree `C:\Users\CJWal\dev\go-v0-ecclesia` (the main checkout, on another branch with another session's uncommitted work, was not touched). Not merged, not pushed.

The owner's modifying instruction for this branch: *"I only want the architecture. Your priority is create something that GPT can immediately and easily integrate into the Ecclesia system, let GPT design the interface."* The branch is therefore a headless subsystem with a typed public contract, an integration guide written for the agent that will build the interface, fixtures and tests that prove the loop end to end — and no UI.

## What was built

| Deliverable (brief) | Where | State |
| --- | --- | --- |
| A. Audit of the existing GoReview system | [GOREVIEW-ECCLESIA-ARCHITECTURE.md §1](GOREVIEW-ECCLESIA-ARCHITECTURE.md) | Done; three findings recorded (example-sentence source union, planner priority vs reader expectation, no reader `Producer`). |
| B. Ecclesia module beside the shared core | `packages/goreview-ecclesia/src/` — `contract.ts`, `languages.ts`, `identity.ts`, `encounters.ts`, `cards.ts`, `facts.ts`, `profile.ts`, `frequency.ts`, `familiarity.ts`, `session.ts`, `index.ts`, `README.md` | Done. FSRS, deck fold, intake, planner, builders, grading, evidence and runner are imported from `packages/goreview/src`, never copied. |
| Language profiles (Hebrew, Aramaic, Koine Greek, Latin) | `languages.ts` | Done: Repository filing (`he`/`he-bib`, `arc`/`arc-bib`, `el`/`el-koi`, `la`), edition ids, sources and licences, per-language familiarity and review defaults, `withOverrides`. |
| Lexical identity model | `identity.ts` | Done: Repository `unitIds` with per-script normalisation (cantillation stripped, Greek accents kept, Latin lower-cased); `cardIdFor`; passage keys; typed `ScriptureSourceRef`. |
| Typed reading-encounter interface with idempotency | `encounters.ts` | Done: eight encounter kinds → existing event kinds; `dedupeKey`/id derived from the reader's `encounterId`; chunking at `MAX_ITEM_IDS`; text guard enforced by `assertValidEvent`. `review_answered` is deliberately not an encounter (the runner records reviews). |
| Contextual flashcards with source refs and stable identities | `cards.ts`, `facts.ts` | Done: card id = GoReview's `itemIdFor`; context = Scripture place; `contextsOf` derives every place from events; `UnitFacts` from the reader's lexicon (example sentences empty on purpose). |
| Six knowledge levels distinct from FSRS | `profile.ts` | Done: `knowledgeStandings` (projection@7) beside `cardSchedules` (deck fold); `unitOverview` shows both. |
| Session optimisation / reading→review→reading | `session.ts` | Done: `readingCandidates` (explained rules) → `decideIntake` → `planSession` with listening off → `preferReadingContext` (within-queue, never traps) → `createEcclesiaRunner`. |
| Next Best Passage familiarity interface (80–90 %, provisional, per language) | `familiarity.ts`, `frequency.ts` | Done and labelled `provisional: true` / `ecclesia-familiarity@provisional-1` on every result; corpus frequency is a contract with constructors, no data shipped. |
| C. Koine Greek vertical slice over John 1:1–18 with a demo learner | `test/goreview-ecclesia/greek-vertical-slice.test.ts`, fixtures `fixtures/greek-john.ts`, `fixtures/john-1-1-18.data.ts` (generated from the Biblia build's SBLGNT + MorphGNT tokens and Dodson glosses with NT counts) | Done: read → profile → compose → real runner (real builders, real evidence, FSRS) → refold on reversed order → levels beside schedules → next passage → idempotent re-read, against an in-memory Repository store. |
| D. Four-language fixture tests | `test/goreview-ecclesia/four-languages.test.ts`, `fixtures/four-languages.ts` (Genesis 1:1, Daniel 2:4b, John 1:1, Vulgate John 1:1–5) | Done: ids, events, facts + exercise, composed plan, familiarity per language. |
| E. Persistence / migrations | — | No new storage: existing event log, existing kinds, `v 3`; sessions in GoReview's `goreview:session:<id>` keys. Nothing to migrate. |
| F. Documentation | `GOREVIEW-ECCLESIA-ARCHITECTURE.md`, `GOREVIEW-ECCLESIA-INTEGRATION.md`, this report, package `README.md` | Done. |

## Files

Added (no file outside these paths was modified):

```
packages/goreview-ecclesia/README.md
packages/goreview-ecclesia/src/{contract,languages,identity,encounters,cards,facts,profile,frequency,familiarity,session,index}.ts
test/goreview-ecclesia/fixtures/{john-1-1-18.data,greek-john,four-languages}.ts
test/goreview-ecclesia/{identity,encounters,cards-facts,familiarity,session,greek-vertical-slice,four-languages}.test.ts
docs/ecosystem/GOREVIEW-ECCLESIA-{ARCHITECTURE,INTEGRATION,REPORT}.md
```

**Shared code changed: none.** `packages/goreview`, `packages/repository-contract`, `packages/repository-engine`, `packages/repository-store`, `src/adapters` are as on `master`. Every verified fix in them (the 2026-10-26 self-mark rule, the review CAS chain, the text guard, the listening-off marker, the deck-fill and daily-allowance rules) is preserved and exercised through the real code paths.

## Tests

Executed in the worktree on 2026-11-04 (Vitest 3.2.7, Node 24.19):

- `npx vitest run test/goreview-ecclesia` — **7 files, 73 tests, all passed** (identity 15, encounters 10, cards-facts 9, familiarity 9, session 9, Greek vertical slice 1, four languages 20).
- `npx tsc -p tsconfig.app.json --noEmit` — **exit 0** (the whole repository including the new package, fixtures and tests).
- Existing suites: see the line below for the final run.

- `npx vitest run test/goreview test/goreview-app test/repository-contract test/repository-engine` (the path filter `test/goreview` also takes in `test/goreview-app` and `test/goreview-ecclesia`) — **113 files, 1,184 tests, all passed**, 26 s. The shared GoReview, GoReview-app, Repository contract and engine suites behave exactly as before; the Ecclesia suites run beside them.

One environmental note: a fresh worktree has none of the repository's gitignored downloaded assets (`public/dict`, `public/lexicon`, `public/library`, `data/dictionaries`, `data/raw`, `packages/biblia/public/data`); without them 14 GoReview / GoReview-app test files fail on missing dictionary manifests and glosses. Those paths were junctioned read-only from the main checkout for the run above; they are ignored by git and are not part of the branch.

## Implemented vs deferred

Implemented: everything in the table above, within the owner's "architecture only" scope.

Deferred, on purpose:

1. **UI** — none, by instruction. The integration guide tells the interface builder what to call per screen.
2. **A `'scripture'` member of `ExampleSentence.source`** so a verse could be shown inside an exercise by the builders themselves. It is a shared GoReview change; until then the reader shows the verse beside the card from `card.context` (text never enters the facts).
3. **A reader-specific `Producer`** (`'ecclesia'`). Shared contract change; events use `golearn-app` with `producer.surface = 'ecclesia:<kind>'` and `payload.readerId = 'ecclesia'`, as Biblia does.
4. **Calibration of the familiarity band and policy** against real learners; the heuristic is provisional and says so.
5. **Grammar and productive families for the four languages** — the builders are available and the facts carry features, but no construction catalogue (labels, explanations, sibling forms) was authored; sessions are recognition-first (`grammarShare` is a preference, not a promise).
6. **Audio** — listening is off: no reviewed voice exists for these languages.
7. **Verse-level help weighting in the planner** — a revealed translation lifts every word of the verse in the planner's knowability priority (shared behaviour, documented in the architecture §7); a reader can pass its own `candidates`.

## Risks and notes

- *Aramaic filing.* Ecclesia files Biblical Aramaic as its own Repository language `arc` (ids `lemma:arc:…`) so Aramaic lexemes never merge with Hebrew ones; the GoLearn Hebrew adapter reads the same chapters as the heritage variety `arc-bib` of `he`. A learner who reads Daniel in both readers has two rows for the same word until one side is aligned (`withOverrides` makes Ecclesia follow the adapter if that is preferred).
- *Lemma spelling is the identity.* Ids follow the edition's lemma spelling (MorphGNT, OSHB, PROIEL/Whitaker). Two editions that lemmatise differently make two units; alignment is the lexicon's job (the Repository's `alias-of` relation exists for it).
- *Gloss quality drives exercises.* A lexeme with no short (≤ 4 words, bracket-free) gloss cannot be asked; the facts adapter orders short glosses first and the builder refuses the rest honestly (the plan's `skipped` says so).
- *Early-life familiarity reads 0 %.* With the default `knownFrom: 'familiar'`, nothing counts until repeated unaided recognition; readers should lower the floor early and say so (the vertical slice shows the difference).
- *Encounter ids are the reader's promise.* Reusing an id for different content would silently drop the second observation.

## Next milestone

1. The interface builder implements the five inputs in the integration guide (§0) over Ecclesia's corpus and lexicon, and wires `recordEncounters`, `composeSession` + `createEcclesiaRunner`, `knowledgeStandings`/`cardSchedules`, and `nextBestPassage` into its screens.
2. A short shared-contract PR (separate branch) for `ExampleSentence.source: 'scripture'` and a reader `Producer`, if the interface wants verses inside exercises.
3. A construction catalogue per language to switch on `morphological-identification` / `grammar-application`.
4. Calibrate the familiarity band with the first learners and replace `provisional-1`.

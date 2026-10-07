# Team Norway: build plan and file ownership

Packages run as separate agents. A path belongs to exactly one package at a time; nobody edits another package's
paths. Package A lands first because every other package's TypeScript needs `nb`/`nn` in `LanguageCode`; B, C and D
start in parallel on their own files and run their checks once A has landed. Stage by path only; never `git add -A`.

| pkg | scope | owns | depends on |
|---|---|---|---|
| A | core registration: `nb`, `nn` in `LanguageCode`/`LANGUAGES`/`LANGUAGE_ROWS`; course `norway-nb` with `readsLangs: ['nn']`; companion-language support (bootstrap import, TextPage, voices, library filters); every `Record<LanguageCode,…>` stub; placeholder adapters `nb.ts`/`nn.ts`; guesser profiles nb/nn/da; stage0 match leniency; JsonImporter name; test fixture lists; type-only additions: `ConceptFamily` + `family?`, `WorkRights` evidence fields, `AudioImportManifest` speaker/transcript/alignment fields | `src/core/**`, `src/app/**`, `src/ui/**`, `src/golisten/**`, `src/gotell/**` (stub rows only), `src/ingest/**`, `src/stage0/lang/index.ts`, `src/stage0/match.ts`, `src/golearn/**`, `src/library/**`, `src/adapters/index.ts`, `src/adapters/nb.ts`, `src/adapters/nn.ts` (placeholders), `src/course/**` (stub rows only), `scripts/**` language lists, `test/**` fixture lists (not `test/adapters/norwegian-*`) | — |
| B | the analyzer: shared engine, lexicon, morphology, compounds, particle units, constructions, historical, varieties, concept families, production checks, gold tests | `src/adapters/norwegian/**`, `src/adapters/nb.ts`, `src/adapters/nn.ts` (after A), `test/adapters/norwegian-*.test.ts` | A (to typecheck) |
| C | Stage 0 Bokmål from zero | `data/stage0/nb/**`, `data/stage0/world.json` (nb names only), `src/stage0/lang/norwegian.ts` (A wires it) | A (validate) |
| D | corpus + ladder + course catalogue data | `data/corpus/nb/**`, `data/corpus/nn/**`, `data/ladder/nb/**`, `data/sources/course-library/nb.json`, `src/course/norwegian.ts` (full content; A leaves a stub), `data/ladder/nb/PLAN.md` | A, B (gate) |
| E | GoTell Norwegian tables + register rule; GoListen manifest fields in import validation; rights test; ladder gate orphan/recurrence warnings; `scripts/norway-audit.mts`; `npm run norway:audit` | `src/gotell/**` (nb rows), `src/golisten/import.ts`, `src/ladder/gate.ts`/`policy.ts` (warnings only), `scripts/norway-audit.mts`, `test/course/norwegianRights.test.ts`, `test/ladder/recurrence.test.ts`, `package.json` script line | A, B, D |
| F | holdout set written blind; accuracy measurement; `nb` learner simulation; full test run; STATUS.md | `test/adapters/norwegian-holdout.test.ts`, `docs/norway/STATUS.md` | all |

Rules for every package:
- No downloads. If a resource would need one, write the request (filename, source, size) into your report.
- Never mark rights verified; never claim native review; every drafted text carries `review: machine-draft`.
- Every new test must pass; every existing test that you touch must still express the same intent.
- Report measured numbers, not impressions.

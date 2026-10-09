# Baseline test report

Measured by the lead on 2026-10-08, before any reconstruction work beyond the phase-1 scaffolding. Commands and
numbers are verbatim; nothing here is inferred.

## 1. The tree measured

- Repository `C:\Users\CJWal\dev\go-v0`, branch `master`, HEAD `8dc86370` ("refactor(listening): GoListen is
  GoLearn's listening layer on every text, not a sibling system"). Remote `origin` holds only `gh-pages` (built
  site); `master` is not pushed.
- Node v24.19.0, npm 11.17.0, TypeScript 6.0.3, Vite 8.3.1, Vitest 3.2.7 (annex C §7).
- Working tree at measurement: clean except untracked files that belong to other sessions (`work/`, `work-*`).

## 2. Typecheck

```
npx tsc -b
```
Exit 0, no diagnostics (run 2026-10-08T16:53 local; re-run after the scaffolding and the base-path fix: exit 0).

## 3. Full test suite

```
npx vitest run --reporter=dot
```
Started 16:54:14, duration 597 s.

| result | count |
|---|---|
| test files passed | 418 of 421 |
| tests passed | 10,205 of 10,208 |
| failed | 3 |

The three failures:

1. `test/bench/sq-library-assets.test.ts` › "binds the source review and course entry to the exact source bytes" —
   the Albanian source manifest's recorded hash predates the 2026-10-06 library rebuild that reformatted
   `data/sources/sq-modern-open/documents.json` (the text of all 27 documents compared equal, whitespace-normalised,
   on 2026-10-07). Pre-existing since 2026-10-06; re-taking an integrity hash is the owner's call.
2. `test/content/curriculum-remediation.test.ts` › "retains all 32 unique licensed/source-cleared identities…" — a
   stray quotation mark in one Global Voices attribution in Codex's remediation manifest differs from the installed
   library row. Pre-existing since 2026-10-06.
3. `test/ui/bootstrapSpeech.test.ts` › "ingest.history is bound to contentHistory" — failed under full-suite load;
   re-run alone the same day: `7 passed (7)`. A timing flake, not a regression.

Earlier full runs today on the same HEAD content: 10,206 passed / 2 failed (the two data mismatches only).

## 4. Scaffolding added in this phase and its tests

```
npx vitest run test/ecosystem/boundaries.test.ts --reporter=verbose
```
5 passed (5): the contract imports nothing; application packages import only the contract; nothing under
`packages/` imports the retired modules; a well-formed event validates and knows its family; an unknown kind, a bad
producer, a bad timestamp and a subject carrying text are refused. `npx tsc -b` with `packages` added to
`tsconfig.app.json`: exit 0.

## 5. One fix applied during the phase (not part of the reconstruction)

The deployed site fetched its dictionary and library from `/dict` and `/library` at the host root, which 404 under
GitHub Pages' `/go-v0/` sub-path (verified live: `/go-v0/dict/es/manifest.json` 200, `/dict/es/manifest.json` 404).
`src/app/bootstrap.ts` now derives the base from Vite's `BASE_URL`. Tests run after the fix:
`test/ui/bootstrap.test.ts`, `test/ui/bootstrapFrequency.test.ts`, `test/ui/realengines.test.tsx`,
`test/ecosystem/boundaries.test.ts`: 35 passed (35).

## 6. Adapter suites (from annex B, run by the linguistic audit the same day)

es 409, de 1,358, hi 1,282, th 503, sq 909, nb+nn 129, shared 101, ingest dictionary-join and guesser 181,
`test/dict` 232: all passed, 0 failed (per-language `npx vitest run test/adapters/<dir> ... --reporter=json`).

## 7. What was not run

- 2GoLearn's `npm run verify` (claimed 793 tests green at its last commit): not run in this phase.
- The production build (`npm run build`) after the base-path fix: run for the gh-pages deploy earlier the same day
  (exit 0, "built in 16.98 s"), not re-run after the scaffolding (the scaffolding adds no runtime code).
- Any browser test of the scaffolding (there is no UI in it).

# Test baseline before Prompt 3 (the Repository after universal reader integration)

Status: 2026-10-09. The reported baseline from Prompt 2 was 13,607 passing, two retired-corpus failures and five
legacy timeouts under the combined load. This note reproduces and classifies each so that regressions introduced by
Prompt 3 can be told apart from what was already failing.

## 1. Commits

`git log --oneline -3` on local `master` (nothing pushed; the remote holds only `gh-pages`):

```
e579189e fix(adapters): Thai analyser imports core/adapters directly so the retired course module is no longer compiled into the apps
604569ca feat(reader): universal reader integration — registry, site adapters, language resolution, on-demand analysers, share contract
c8ddd745 style(apps): Western Canon aesthetic for GoPractice, the GoLearn setup app, the reader card and the popup
```

The working tree was clean (`git status --short` showed only the untracked `work/` scratch files of another session) before
this phase began.

## 2. The two retired-corpus failures (pre-existing, unrelated to the ecosystem)

```
npx vitest run test/bench/sq-library-assets.test.ts test/content/curriculum-remediation.test.ts --reporter=dot
Tests  2 failed | 10 passed (12)
```

| test | assertion | classification |
|---|---|---|
| `test/bench/sq-library-assets.test.ts:21` "binds the source review and course entry to the exact source bytes" | expected digest `720d53a2…`, got `31b68e3a…`: the retired Albanian open-reading library's source bytes no longer match the review record | retired course data integrity; no app entry reaches these modules (ARCHITECTURE-CONFORMANCE); not a Repository concern |
| `test/content/curriculum-remediation.test.ts:48` "retains all 32 unique licensed/source-cleared identities, signed bodies and exact paragraphs" | two `Eine kolumbianische Sicht auf den Fil…` strings differ (same prefix: a whitespace/encoding difference in a retired German paragraph) | retired curriculum data; same classification |

Both failed identically before Prompt 2 (recorded in GOPRACTICE-TEST-REPORT §6 and PRODUCTION-READINESS §1). They are
not suppressed, skipped or edited; they stay red until the owner decides what to do with the retired data.

## 3. The five legacy timeouts (load artefacts, not regressions)

In the Prompt 2 whole-repository gate (995 s, five agents and a browser pane running at the same time) these timed out
at vitest's 20 s per-test limit, and two vitest-worker RPC timeouts were logged:

| file | test | alone |
|---|---|---|
| `test/ingest/origins.test.ts:235` | the bundled es/de/sq/hi documents: only the explicit source snapshot extends the analysis record | passes |
| `test/server/goread.test.ts` | GoRead program (child process): reads without a key, adds with one… (`no "listening" line in time`) | passes |
| `test/ui/bootstrapSpeech.test.ts:89` | ingest.history is bound to contentHistory | passes |
| `test/ui/pathPage.test.tsx:127` and `:157` | the bundled import and the registered path (real bootstrap, Albanian) | pass |

Re-run alone immediately after the gate: `npx vitest run test/ingest/origins.test.ts test/server/goread.test.ts test/ui/bootstrapSpeech.test.ts test/ui/pathPage.test.tsx --reporter=dot` → 4 files, **83 passed**, one transient
"Timeout calling snapshotSaved" worker error. All five live in the retired course application (ingest pipeline, the
GoRead server, the course UI). A passing isolated run does not make the gate run green: the honest statement is that
these tests are load-sensitive (child processes and full bootstraps with 20 s budgets) and must be judged on an
isolated run, which this phase repeats at its end.

## 4. Rule for this phase

A failure counts as a Prompt 3 regression only if it is outside the seven rows above, or if one of the seven fails on an
isolated run with a different assertion than recorded here.

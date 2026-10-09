# GoLearn — test report

Status: 2026-10-08, Prompt 4. What ran, where, with the runner's own counts and the browser's own clock. The
whole-repository gate is in §5.

## 1. Automated suites

```
npx tsc -b                                                   # exit 0
npx vitest run test/extension test/golearn-app test/golisten test/language-packs test/golearn-e2e test/ecosystem --reporter=dot
```

| suite | files | tests | what it proves |
|---|---|---|---|
| `test/extension` | 20 | 283 | the reader extension: selection and context on every script (Albanian, German, Spanish, Devanagari, Thai, Hebrew, Arabic), capability negotiation, the five layers and their events, adaptive ordering from a weak construction, non-blocking gloss and profile, pronunciation failure never blocks, review mark, correction form, session connect/disconnect/re-attribution, sync 401 → needs sign-in, security (content bundle has no network/storage/token code; sender checks), the built bundles end to end, permission denial, unsupported readers, rapid selections, page change, font change |
| `test/golearn-app` | 8 | 94 | the setup app: every screen, service-URL rule, sign-in/switch, team ≠ language (Norway's written standard), pack install rendering, reader guidance by context, tutorial skip/repeat/practice with the real parser and card, privacy export and delete, diagnostics; one test runs the app against the real worker, real service (SQLite) and real pack |
| `test/golisten` (new files `pronounce-*`) | 7 | 82 | strict voice language match (no English for Albanian), device playback lifecycle and replay count, remote provider needs consent and never sends text before it, recorded demo asset, `pronounce` never throws, evidence-direction rule, `PronunciationPlayed` payload validates, assessment stimuli hide the answer and report eligibility, registry availability states |
| `test/language-packs` | 5 | 77 | manifest validation, the 14 Albanian validation cases against the real adapter (statuses as the Repository decides them), tutorial passage fully analysable and marked unreviewed, dictionary gloss with CC BY-SA attribution from the real shards, install happy and failure paths, planned packs refused, six teams with Norway's required choice |
| `test/golearn-e2e/albanian-reference.test.ts` | 1 | 12 | the §17 reference run over the real pieces (§2) |
| `test/ecosystem/boundaries.test.ts` | 1 | 8 | package import rules incl. GoListen and the packs |

Run 2026-10-08 20:09–20:20 local: all green (with the Repository, reader and remaining suites: 91 files, 1,523 tests
before the reference test; the reference test adds 12).

## 2. The §17 reference run (`test/golearn-e2e/albanian-reference.test.ts`)

Real: the Repository service (SQLite in memory, scrypt), the background worker with the real Albanian pack
(dictionary shards from disk), the setup app for steps 1–5, the content-script controller and card on a page for
6–18; fake: the network (in-process), timers, the clock.

| steps | what passed |
|---|---|
| 1–5 | account created through the setup page (password nowhere in storage); Team Albania → Albanian enrolment with separate team and language ids; pack installed with every check passed; orientation skipped |
| 6–7 | worker status: connected, language `sq`, pack available; passage open |
| 8–13 | "librin" → `libër (NOUN)`, "definite masculine accusative singular", Layer 2 feature table with "accusative", Layer 3 "role: not available from this analyser" (context was a full sentence; the analyser gives no dependency roles), the card states "context: full sentence", pronunciation state "Speech is not available in this browser" (no claim), encounter recorded, no `PronunciationPlayed` |
| 14 | the service holds the `SelectionLookedUp` under the account's enrolment with `lemma:sq:libër:NOUN`, a sentence hash, contract v2; every event validates; no sentence text anywhere; `AnalysisShown` present |
| 15 | exposure > 0; reading, listening, productive, contextual and grammatical dimensions all at zero weight |
| 16 | a GoPractice `AssessmentAnswered` (incorrect) on `morph:sq:NOUN:Case=Acc\|Definite=Def\|Gender=Masc\|Number=Sing` through `/reviews` → the construction's grammatical understanding goes negative |
| 17–18 | after the worker's sync refreshed its cache, looking up "çajin" (same construction) puts the grammar hint above the meaning; "librin" again shows the card |
| extra | unknown word → unconfirmed guess, no gloss, still recorded; 10 concurrent lookups → 1 card; offline: lookups keep working and recording, sync fails and reports, back online sends everything exactly once, a re-sync adds nothing; account switch: new session, no history of the first learner shown, first learner's data intact; language switch to planned German: status says no pack, the card says so |

One defect found by this test and fixed: the extension asked the learner model about `syntax:sq:…` ids while the
Repository names morphological constructions `morph:sq:<POS>:<features>`; GoPractice's grammar evidence would never
have reached the card. The parser now derives the Repository's id from the same feature structure.

## 3. Browser verification (Chromium pane, 2026-10-08 20:20–20:26)

Real service process on `127.0.0.1:8790` (SQLite file under `data/repository/`, git-ignored); the hosted web build
`dist-web/` served from `localhost:5199`; real pointer gestures.

| step | observed |
|---|---|
| open the setup page | welcome, rail with completion marks |
| create account | "Account created and signed in as ana@albania.test", learner id and session expiry shown; the service log shows `POST /accounts 201`, `POST /sessions 201` |
| team → Albania → Albanian | the service does not know the team (no join route): the page offered "Enrol without a team"; enrolment created: "No team → Albanian (Standard Albanian) · pack:sq@9" |
| install the pack | "Verified: all 16 checks passed": dictionary description (kaikki-sq@2026-09-28, 91,271 entries), a shard fetched, the 14 validation selections |
| orientation, step 6 | "Double-click the word “librin” below." — a real double-click on the word selected `librin`, the real card appeared (fixed host), the feedback read "Yes — that is “librin” … recorded as a tutorial encounter (it does not count as evidence…)", one event row stored on the origin |
| sync (web mode) | "Synchronisation runs inside the extension. This page is running as a website…" — honest; rows kept: 1 |
| diagnostics | versions, "Service reachable", packs table with Albanian up to date and the others planned; one wording defect found and fixed: the page compared the service's own version number with the contract version (now the service reports `contractVersion` and the page compares that) |
| harness article (`harness/albanian-article.html`, content script injected, no worker) | six real double-clicks (Nëna, çajin, shkollë, librin, bukur, lexon): all shown with full-sentence context |

Not done in a browser: loading `dist/` as an installed extension (the manual procedure of
`EXTENSION-PROTOTYPE-TESTS.md` §6 still stands), hence the context menu, Alt+Shift+G, `activeTab`, `alarms` sync and
the options page inside Chrome are verified only by the jsdom suites. The harness server first served the stylesheet
with the wrong MIME type (a harness defect, fixed); Chrome ignored it until the cache was refreshed.

## 4. Performance (measured, `performance.now()`, real gestures on the harness article, this build)

| phase | cold (first lookup) | warm p50 (n = 5) | warm p95 |
|---|---|---|---|
| module evaluation | 8.1 ms | | |
| selection obtained | 1.8 | 0.4 | 0.6 |
| context extracted | 3.7 | 0.6 | 0.9 |
| parsed | 120.1 | 1.8 | 2.1 |
| popup positioned | 133.2 | 4.3 | 5.9 |
| event queued | 136.5 | 4.8 | 6.6 |
| first info shown | 244.4 | 107.3 | 108.7 |

Heap after six lookups: 10.4 MB. "First info shown" is the next animation frame with a 100 ms fallback; the pane was
hidden during this run, so those figures are the fallback timer, not the card (with the pane visible in Prompt 2 the
same mark read 3.5–7 ms). Profile and gloss arrival were not measurable here (no worker on the harness page); in the
jsdom integration they are recorded as late marks on the same metrics row. Budget statement: nothing is claimed beyond
these numbers; the cold parse (index build of the Albanian word list) is the one visible delay and happens once per
page.

Bundle sizes: `content.js` 290,447 B, `background.js` 303,152 B (the pack runtime bundles the analyser again for
glosses), `action/popup.js` 13,488 B, `app/app.js` 392,551 B, dictionary 6.4 MB.

## 5. Whole-repository gate

`npx vitest run --reporter=dot`, 2026-10-08 20:29 local:

| result | count |
|---|---|
| test files | 483 passed, 2 failed (485) |
| tests | 11,277 passed, 2 failed (11,279) |

The two failures are the two pre-existing data mismatches (`BASELINE-TEST-REPORT.md` §3), unchanged by this phase.
Two unhandled errors were reported by the runner: a `removeEventListener is not a function` thrown by the built
content bundle's layout-watcher teardown after `test/extension/bundle.test.ts` had torn down its page (the generic
adapter now guards that teardown), and a vitest worker RPC timeout under full-suite load (the runner, not a test).
Before this phase the gate stood at 10,891 passed; GoLearn adds 386 tests plus the 12-step reference run.

## 6. Not tested

Calibration of any estimate; an installed extension on third-party sites; remote and recorded voices from a page;
Kobo and Play Books; the extension with a hosted (https) service; multiple profiles on one device.

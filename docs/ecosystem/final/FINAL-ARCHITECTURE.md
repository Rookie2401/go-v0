# Go ecosystem — final architecture as wired

Status: 2026-10-09. Describes the code as it stands in the working tree, from `audit/ARCHITECTURE-CONFORMANCE.md`,
`audit/END-TO-END-INTEGRATION.md`, the package READMEs and the source files named below. Nothing here is a claim of
production readiness; see `PRODUCTION-READINESS.md` (added by the coordinator). Sibling sessions were editing source while
this was written; section 6 says what that did to the boundary tests.

## 1. What exists

| part | package | entry points (built output) |
|---|---|---|
| GoLearn extension + setup app (one application) | `packages/golearn-extension` | `src/background/index.ts` (`dist/background.js`, MV3 worker), `src/content/index.ts` (`dist/content.js`), `action/popup.ts`, `app/main.ts` (`dist/app/` options page and `dist-web/` hosted setup page) |
| GoPractice shell (one application, two workspaces) | `packages/goreview/app` | `main.ts` (`packages/goreview/app/dist/`, static; `config.json` names the service URL) |
| GoReview workspace | `packages/goreview` | no entry of its own; hosted by the shell through `engine.ts` |
| GoTell workspace | `packages/gotell` | no entry of its own; hosted by the shell through `tellEngine.ts` |
| shared: contract, device sync, packs, pronunciation | `repository-contract`, `repository-sync`, `language-packs`, `golisten` | libraries |
| the Go Repository | `repository-service` (HTTP handler, Node bridge `src/main.ts`, typed client `src/api.ts`), `repository-store` (memory + SQLite), `repository-engine`, `repository-linguistics` | Node service |
| prototype, not an entry | `packages/controlled-reader` | local DRM-free EPUB reader; reached by no product entry |

The Repository is infrastructure, not an application. Retired course code (`src/ladder`, `src/stage0`, `src/course`, `src/library`, `src/ui` ...)
stays in the repository but no entry reaches it at run time (conformance suite (a): 0 forbidden files in every compiled graph).

## 2. What each entry imports (ARCHITECTURE-CONFORMANCE §2, §4)

| entry | reaches |
|---|---|
| golearn-background | golearn-extension, language-packs, repository-sync, repository-contract, the service's typed client |
| golearn-content | golearn-extension, golisten (device provider only), repository-contract; no sync, no service client, no pack runtime (it only messages the worker) |
| golearn-popup | golearn-extension, repository-contract |
| golearn-app (setup) | golearn-extension, language-packs, service client, repository-contract |
| gopractice | gopractice, goreview, gotell, golisten, language-packs, repository-sync, service client, repository-contract, `ts-fsrs` |
| repository-service | store, engine, linguistics (dynamic imports), repository-contract; no app, no GoListen, no pack, no sync client |

Legacy `src/` reached at run time: 67 compiled-in modules, all on the salvage allow-list (`src/adapters` for `sq` and `es`, `src/dict`); 20
`src/core` files at type level only. Two erased type imports still pull `src/course` into the type graph (defect C-01, pinned by test).

## 3. Event contract (`packages/repository-contract/src/index.ts`)

Contract version 2 (versions 1 and 2 accepted). Seven families in `EVENT_KINDS`:

| family | kinds |
|---|---|
| reading-context | EncounterRecorded, SelectionLookedUp, AnalysisShown, AssistanceRequested, PronunciationPlayed |
| reading-report | UnderstoodMarked, ItemMarked |
| listening | ListeningCompleted, ListeningAssessed |
| review | CardReviewed, CardAdded, CardRemoved, AssessmentAnswered |
| writing | DraftSaved, SentenceSubmitted, CorrectionAccepted, CorrectionRejected, ProductionRecorded |
| correction | AnalysisCorrected, ReviewItemInvalidated |
| profile | EnrolmentChanged, PackInstalled, PrivacySettingChanged, ConsentGiven, ConsentWithdrawn, PreferenceChanged |

That is 26 kinds in the source (`REPOSITORY-DATA-MODEL.md` §3 says 27; unresolved). Producers: `golearn-ext`, `golearn-app`,
`gopractice-review`, `gopractice-tell`, `repository`, `import`. Integrity rules are in `REPOSITORY-EVENT-INTEGRITY.md`.

## 4. One encounter to one projection (END-TO-END-INTEGRATION step numbers)

1. Steps 5–10: a selected word on a web page is parsed in the content script; the card shows the lemma and morphology; `SelectionLookedUp` (surface of at most four words, sentence hash, no text) goes to the worker, which queues it on the device and syncs it.
2. Step 13 (defect E-01, fixed): on ingestion the service resolves the surface through the linguistics service (`registerSurfaces` in `handler.ts`), so GoReview later finds the unit.
3. Steps 12–19: GoPractice signs in, reads `/candidates`, intake decides, the learner starts a session, the answer is graded and recorded before advancing, and an FSRS state is folded from the log.
4. Steps 20–24: a listening item through GoListen's assessment source; `ListeningAssessed` moves only the listening dimension (with a declared TEST fixture, see `GOLISTEN-CAPABILITIES.md`).
5. Steps 30–36: GoTell saves a version and submits `DraftSaved` plus one `ProductionRecorded` per sentence; the text stays in the private document.
6. Steps 38–41: the log (three producers) replays into a fresh engine to equal the live rows; re-sending it stores nothing.

## 5. Deployment shape (the owner deploys; nothing here was deployed by the build sessions)

* Static: `dist/` of the extension (load unpacked), `dist-web/` (setup page; it can only explain installation), `packages/goreview/app/dist/` (any host, `base './'`). Each carries the Albanian dictionary shards (about 6 MB, CC BY-SA 4.0) and `THIRD-PARTY-NOTICES.md`.
* Service: `npx vite-node packages/repository-service/src/main.ts --port 8790 --data data/repository`; Node 24 (`node:sqlite`), one SQLite file. TLS, backups and at-rest protection belong to the host. The Cloudflare D1 twin is not built (`REPOSITORY-API-AND-OPERATIONS.md` §6).
* The optional speech proxy (`server/speechHandler.ts`) is separate, holds the key, has no authentication of its own (SECURITY A-08) and has only been exercised against a mock.
* Not verified: any hosted (https) deployment; the installed extension on third-party sites (manual steps in `audit/READER-COMPATIBILITY-RETEST.md` §6).

## 6. Boundaries the tests enforce

| test | enforces |
|---|---|
| `test/ecosystem/boundaries.test.ts` (7 tests; passing in my run at 10:11 on 2026-10-09) | literal import rules per package; the event contract accepts and refuses |
| `test/audit/conformance.imports.test.ts` | no entry reaches retired course/data; only allow-listed legacy modules; GoTell and GoReview independent; no commercial ebook-provider code |
| `test/audit/conformance.structure.test.ts` | exactly two application groups; exact package set per entry; shared packages never reach an app (transitively); the content script reaches only GoListen's device provider |
| `test/gotell/boundary.test.ts`, `test/gotell-engine/boundary.test.ts` | GoTell imports no GoReview, shell, GoLearn or GoListen |
| `test/audit/rights.dist.test.ts` | built folders contain no retired corpus, ladders, Scripture or frequency sidecars |

State at 10:11 on 2026-10-09: `conformance.structure.test.ts` had 4 failing tests ("exact package sets" for golearn-background, golearn-app and gopractice, and "no application reaches the store ..."). Cause, read from source:
`packages/repository-service/src/handler.ts` line 18 now has a value import of `../../repository-store/src/deletion` (an in-flight deletion change), and every app reaches `handler.ts` at source level through `api.ts` (defect C-02). Whether the built bundles are affected was not checked.

## 7. Not claimed

No Kindle support (`KINDLE-INTEGRATION-FINDINGS.md`: technically blocked); no rights clearance; no language production-ready; no native review of any linguistic content; no calibration of the knowledge model or of FSRS against learners.

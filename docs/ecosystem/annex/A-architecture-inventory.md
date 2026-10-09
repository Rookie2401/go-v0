# go-v0 + 2GoLearn: read-only inventory (2026-10-08)

Scope: I only read files (Read, Grep, Bash `ls/grep/wc/sed/awk/find/du`, plus `git log/remote/status/branch` and one `git ls-remote --heads origin`). I edited, created, deleted and downloaded nothing, and ran no tests, `tsc` or builds. `tsc -b` writes tsbuildinfo and vitest writes caches. So every pass/fail claim in the repo's docs is unverified here.

Repo facts:
- Path: `C:/Users/CJWal/dev/go-v0`, branch `master`, HEAD `8dc86370` (2026-10-08).
- `git log --oneline | wc -l` gives 249 commits.
- `git remote -v` gives `origin https://github.com/Rookie2401/go-v0.git`.
- `git ls-remote --heads origin` returns only `refs/heads/gh-pages`. There is no `master` on the remote, so the source is not pushed to GitHub (as of that call).
- `git status --short | wc -l` gives 10, all untracked: `work/` (662 MB) and `work-hi-*.txt`, `work-proof-validation.log`, `work-thai.zip` at the repo root.

Code size (command: `find <dir> -name '*.ts' -o -name '*.tsx' | xargs cat | wc -l`):

| dir | lines | dir | lines |
|---|---|---|---|
| `src/adapters` | 47,872 | `src/ingest` | 5,666 |
| `src/ui` | 14,307 | `src/bench` | 4,540 |
| `src/golearn` | 7,387 | `src/core` | 4,303 |
| `src/golisten` | 3,993 | `src/gotell` | 3,756 |
| `src/dict` | 3,673 | `src/course` | 3,436 |
| `src/library` | 2,075 | `src/stage0` | 1,776 |
| `src/ladder` | 1,519 | `src/sim` | 1,218 |

Others are under 1,000 lines each: alphabet 767, authoring 761, backup 676, goread 632, app 490, db 263.

Data sizes (`du -sh`): `data` 3.3G (of which `data/dictionaries` 2.4G, gitignored), `public` 318M (`public/library` 12,634 files and `public/dict` 2,315 files, both gitignored), `dist` 328M, `docs` 1.5M, `test` 7.1M.

---

## 1. Framework, build, scripts, CI, secrets, `server/`

**Stack** (`package.json`, type: module). Runtime dependencies are only `dexie ^4`, `react ^19.2.8`, `react-dom ^19.2.8` and `react-router-dom ^7.18.3`. Dev dependencies:
- `vite ^8.2.2`
- `@vitejs/plugin-react ^6.1.0`
- `typescript ~6.0.2`
- `vitest ^3.2.7`
- `vite-node ^6`
- `jsdom ^26`
- `fake-indexeddb ^6`
- `@types/*`

The package manager is npm (`package-lock.json`, 99,847 bytes). There is no UI library or test library; `test/ui/harness.tsx` renders with `react-dom/client` and `act`.

**Vite** (`vite.config.ts`):
- `base: './'` with HashRouter, so it runs from any static host or sub-path.
- Plugins: `react()`, `rightsGate()` from `server/rightsGate.ts`, and `speechProxy()` only if `const LISTEN = false` (line 9) is changed. It is hard-coded false, so dev and preview expose no `/api/speech/*`.
- Dev port 5196 and preview port 4196, both `strictPort`. The watcher ignores `data/dictionaries`, `data/private`, `data/research`, `public/dict` and `public/library`.
- `build.chunkSizeWarningLimit: 1500`.

**Other configs:**
- `vitest.config.ts` (7 lines): include `test/**/*.test.{ts,tsx}`, environment `node`, `testTimeout: 20_000`.
- `tsconfig.json` references `tsconfig.app.json` and `tsconfig.node.json`.
- `tsconfig.app.json` includes `src`, `test` and `scripts`. It is strict and sets `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `resolveJsonModule` and target ES2023.
- `tsconfig.node.json` includes `vite.config.ts`, `vitest.config.ts` and `server`.
- `scripts/vite.config.ts` is `defineConfig({})`. It is used by `vite-node --config` for the scripts.

**Scripts** (all 60 keys in `package.json`):
- Core:
  - `dev` = `vite`, `preview`, `typecheck` = `tsc -b`, `test` = `vitest run`, `gate` = `tsc -b && vitest run`.
  - `build` chains `tsc -b`, `rights-gate.mts`, `check-course-libraries.mts --require hi,de,es,th,sq`, `node scripts/verify-scripture-canon.mjs`, `library-audit.mts all`, `dict-status.mts --require hi,de,es,th,sq`, then `vite build`. The build therefore hard-requires five courses' libraries, dictionaries and the Scripture canon.
- Corpus and ladder:
  - `stage0:validate`, `ladder:check`, `ladder:place`, `audio:packet`.
  - `corpus:{validate,check,migrate,review,prove,convert}`.
  - `review:{packet,apply}`, `norway:audit`, `gutenberg:prose`, `authoring:{report,check}`.
- Dictionary and library:
  - `dict:{build,compare,status,compare-es}`.
  - `library:{frequency,build,check,audit,rebuild,sentences,order,sync-catalogue}`.
- Gold and evaluation:
  - `hi:{gold,eval-gold,probe,sentence,gdl}`, `es:{eval-morph,eval-context}`.
  - `sq:{agreement,check-analyzer,check-texts,ladder-build,ladder-author,dict-expand,eval-ud,gold}`.
  - `gold:{wiktionary,draft,accept,status,freeze}`, `tones:eval`, `bench:{words,units}`, `speech:check`, `rights:check`.
- There are 142 files in `scripts/` (`ls scripts | wc -l`). The biggest families are `probe-*` 19, `acquire-*` 13, `sq-*` 9, `build-*` 9 and `corpus-*` 8.

**CI and deploy:**
- No `.github/` directory and no workflow files.
- The only deploy artifact is the remote `gh-pages` branch (presumably a copy of `dist`; I did not inspect its contents). Memory notes say deploy is manual.
- `.claude/launch.json` defines `go-dev` (5196) and `go-preview` (4196).
- `wrangler.toml` and `.wrangler/` are gitignored. Cloudflare steps are in `docs/goread/DEPLOY.md`, and the example config is `server/goread/wrangler.toml.example`.

**Secrets and env:**
- `.env.example` (271 bytes) lists `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`. There is no `.env.local` on disk, and `*.local` is gitignored (`.gitignore:4`).
- `server/speechProxy.ts:20-30` reads only those two names via `loadEnv(mode, dir, '')`, never `VITE_`-prefixed, so they cannot reach the client bundle.
- Client-side env use: `src/app/bootstrap.ts:253` reads `import.meta.env?.VITE_SPEECH_PROXY === '1'` (unset by default, so no speech request is made). `server/rightsGate.ts:22` reads `process.env.GO_RELEASE_JURISDICTIONS`.
- Secrets that live in the browser, in localStorage under `go-v0:prefs`/`go-v0:speech-azure`:
  - `teamKey` (a GoRead contributor key, in plain text; `src/ui/prefs.ts:38`) and `teamServer` (`prefs.ts:37`).
  - The Azure key, stored only if the learner ticks "remember" (`prefs.ts:121-142`) and used only if the `azureDirectKey` pref is on (`bootstrap.ts:~226`).
- Network egress paths: Azure TTS (opt-in), the GoRead server (opt-in), and relative fetches of `./library/**` and `./dict/**`.
- A grep for `api-key|secret|bearer` hit only adapter lexicon words, `azureProvider`, `proxyProvider`, `goread/client.ts` and `speechProxy`. I did not scan git history for committed secrets.

**`server/`** (1,509 lines; tests in `test/server`, 4 files):

| file | what runs |
|---|---|
| `server/rightsGate.ts` (56) | Vite build plugin (`apply: 'build'`, `enforce: 'pre'`). It replaces `data/corpus/**.json` documents with `null` if their rights are unverified, and errors on a claimed status without evidence. Rule: `src/ingest/rights.ts` `bundleDecision`. |
| `server/speechProxy.ts` (122) and `speechHandler.ts` (281) | Vite plugin for same-origin `/api/speech/*` (Azure TTS proxy with a rate limit of 30/min and body cap). Disabled by `LISTEN = false`. |
| `server/goread/*` (13 files) | Team-sharing server, "GoRead contract v3". `handler.ts` is a web-API `handle(Request)`. Two runtimes: Node (`main.ts`, `node:sqlite`, `store-sqlite.ts`, `check-full.ts`) and a Cloudflare Worker (`worker.ts`, D1 via `store-d1.ts`, `schema.sql`, `check.ts` light check). `admin.ts` handles the whitelist. |

GoRead server details:
- **Routes:** `GET /teams/:course/...` is open read (list and get). `GET /teams/:course/me` and `PUT` text need `Authorization: Bearer <contributor key>`.
- **Auth:** there are no accounts. A per-person contributor key (32 random bytes, base64url) is stored as a sha256 hash and compared in constant time; names go on a whitelist.
- **Shared data:** import documents (Go text format v2) only, which means texts, never learner data. Allowed: `owner-authored`, and `public-domain`/`licensed` with a verification record. Refused: `personal-copy`, `user-private`, `generated`, `unverified`, anything over 2 MB, or a text not in the team language. Texts are append-only (409 if the id exists).
- **App side:** `src/goread/{client,sync,sharing,documentOf}.ts` and `src/ui/goread/TeamTexts.tsx`. Fetching and sharing are manual taps; there is no background sync.
- **Stale comment:** `src/ui/goread/TeamTexts.tsx` header still says "There is no server" while the file imports `createTeamClient` (line 14) and `fetchTeamTexts, shareBook` (line 16).
- **Live deployment:** not verified.

---

## 2. Entry points, routing, bootstrap, context

**Entry:**
- `src/main.tsx` calls `applyTheme()`, renders "Opening Go…", then `bootstrap()`. On success it renders `<Gate services user course><App/></Gate>` (`Gate` is in `src/ui/Onboarding.tsx`). On failure it renders `<Fatal>`.
- `Onboarding` ("Which team are you on?") lists `COURSES` by country. `chooseTeam` (`Onboarding.tsx:~18-28`) creates the user with `courseId`.

**Routes** (`src/ui/App.tsx:46-72`, HashRouter, one `Shell` with `SandboxBanner` and `PreviewBanner`):

| path | component |
|---|---|
| `/` | `pages/Home` |
| `/read` | `read/ReadPage` (shelf, book, chapters) |
| `/read/:textId` | `pages/TextPage` (mode corpus), mounts `reader/Reader` |
| `/scripture`, `/scripture/:textId` | `scripture/ScriptureRoute`, `TextPage` (mode scripture) |
| `/listen`, `/listen/:textId` | `listen/ListenIndexRedirect`, `ListenTextRedirect` (legacy redirects into the Reader) |
| `/course` | `pages/Course` (ladder stages and works) |
| `/path` | `ladder/PathPage` |
| `/start`, `/start/:stepId` | `stage0/Stage0Home`, `StepPage` |
| `/curriculum` | `pages/Curriculum` |
| `/explore`, `/explore/:door` | `pages/Explore` |
| `/books` | `pages/Books` (learner's own .txt/.epub copies) |
| `/testimony` | `testimony/Testimony` |
| `/practice` | `pages/Practice` (daily cloze retrieval) |
| `/tell`, `/tell/inspect` | `tell/Practice`, `tell/Inspector` |
| `/team-texts` | `goread/TeamTexts` |
| `/alphabet` | `alphabet/AlphabetPage` (Thai and Devanagari letters, Leitner) |
| `/settings`, `/vocabulary` | `pages/Settings`, `VocabularyPage` |
| `*` | redirect to `/` |

**Bootstrap** (`src/app/bootstrap.ts`, 490 lines). Order:
1. `createDexieStore(resolveDbName())`; sandbox via `?sandbox=<name>` gives DB `go-v0-sandbox-<name>`.
2. `StoreEventBus`, `createAdapterRegistry()`.
3. `seedFirstRun` (lines ~118-128): `languages.bulkPut(LANGUAGE_ROWS)`, `courses.bulkPut(COURSES)`, and a user `u-local` only once a course is chosen.
4. GoListen (`createGoListen`) with providers per features. It uses the fixture only in preview mode or the dev pref (`wantsFixture`). It uses a remembered Azure key only if `getPref('azureDirectKey')`, and the proxy provider only if `VITE_SPEECH_PROXY=1`.
5. `createGoLearn` with `audioEligible`, then `golearn.attach()`, then `createGoTell` and `createStage0`.
6. Sources registered at lines ~288-306:
   - `setLadderPathSource(createLadderPath(...))`.
   - `setWholeLibrarySource({pager, profileOf})`.
   - `setCorpusFrequencySource`.
   - Lazy `createFetchLexiconSource` per language, and `createLibrary` (guarded; falls back to `emptyLibrary()`).
7. `ensureBundle(lang)` (lines ~320-358): `loadBundledCorpus().filter(lang)` goes through `importDocuments`, skipped if the meta signature is unchanged (`bundled-corpus:<lang>`). Then it imports ladder unit documents (`ladderUnitDocuments`) under meta `bundled-ladder:<lang>`.
8. Only the active course's languages are imported at startup (line 391, `courseLangs(course)`). `content.ensureCourse(courseId)` (line 372) imports other languages on a course switch.
9. `golearn.ensureCurrent(user.id)`, and a rebuild for every user if any bundled text changed (lines ~399-404).
10. `catalog.install(course.id)`.

Feature flags:
- `FEATURES = { listen: true }` (`src/core/config.ts:75`; the docs comments still say "V1 off/V2").
- `Features` has only `listen`.
- Preview mode (`pref preview`) reveals unpublished texts.

**Context** (`src/ui/context.tsx`): `AppServices` exposes `store, bus, adapters, golearn (with .listening = GoListen), golisten (deprecated alias), gotell, stage0?, ingest (validate/import/history/convertPlainText/convertEpub), catalog (CourseCatalog), lexicon(lang), backup (exportLearner/check/restore), speech (azure/proxy/recheck/configure/forget), library, content?.ensureCourse, features, startup`. `AppContextValue` adds `userId, session, currentSession(), user, course, lang (= course.lang), selectUser, refreshUser`. Components never import engines directly.

---

## 3. Persistent storage

**Engine:** Dexie 4, DB name `go-v0` (`src/db/dexie.ts`). Schema is generated from `INDEXES` (`src/core/store.ts:73-110`): 37 tables (counted with awk over `INDEXES`) plus a `blobs` object store for content-addressed audio bytes (sha256, or fnv without WebCrypto).

**Versions** (`dexie.ts:~149-159`):

| version | change |
|---|---|
| v1 | `SCHEMA_V1`, 29 tables |
| v2 | adds `drafts`, `meta`, `texts.reviewStatus`, `sentences.key`. The only data upgrade is `upgradeToV2`: texts become `unreviewed/published:false`, voices and assets `isSpeech:false`; events, encounters and learner state are untouched. |
| v3 | adds `stages`, `works`, `notes`, `texts.workId`; additive only |
| v4 | adds `catalog` (`schemaFor()`); additive only |

**Tables and indexes** (from `store.ts`):

| group | tables (index fields) |
|---|---|
| learner and config | `users`(courseId), `languages`, `courses`(lang) |
| content | `sources`(rights), `corpora`(lang,kind), `texts`(corpusId,lang,kind,sourceId,reviewStatus,workId), `sections`(textId), `paragraphs`(textId,sectionId), `sentences`(textId,paragraphId,lang,textHash,key), `tokens`(sentenceId,textId,formId,normalized), `lemmas`(lang,lemma), `analyses`(tokenId,lemmaId,provenance), `phrases`(lang), `phraseOccurrences`, `patterns`(lang,key), `patternOccurrences`, `rescues`(sentenceId,textId), `notes`(textId,sentenceId,kind) |
| curriculum | `stages`(courseId,lang), `works`(courseId,stageId,lang,role), `catalog`(lang,stream,workId,location,stageId) |
| event log | `events`(userId,type,dedupeKey,session) |
| derived learner state | `encounters`(userId,itemId,sentenceId,textId), `learnerItems`(userId,itemId,lang,itemKind) |
| audio | `voices`(lang,courseId,providerId), `audioAssets`(sourceType,lang), `audioSegments`(textId,cacheKey,voiceConfigId,status,assetId), `alignments`, `manifests`(textId,voiceConfigId), `audioJobs`(segmentId,status), `pronunciations`(lang,match), `recordings`(userId,assetId) |
| GoTell and testimony | `testimonies`(userId,lang), `revisions`(testimonyId,userId), `suggestions`(testimonyId,userId,draftHash,status), `drafts`(userId,lang) |
| misc | `meta` (no indexes; free-form key/value) |

**Per learner vs per language:**
- Per learner: `users`, `events`, `encounters`, `learnerItems`, `testimonies`, `revisions`, `suggestions`, `drafts`, `recordings`, learner-scoped `meta` rows, and testimony-kind `texts` and their children.
- Per language or content: everything else. Item ids are content-derived and language-scoped, e.g. `form:es:<normalized>` and `lemma:es:<lemma>[:pos]` (`src/core/ids.ts:~38-44`), so the same item has the same id in any text. Learner item row id is `<userId>|<itemId>`.
- `meta` holds mutable learner state that is NOT in the event log:

| meta id | holds | source |
|---|---|---|
| `retrieval:<user>:<lang>` | retrieval schedule JSON | `golearn/retrieval/index.ts:104` |
| `stage:<user>:<course>` | chosen stage | `course/catalog.ts:32` |
| `golearn.policy:<user>` | policy version marker | `golearn/audit.ts:11` |
| `unseen-heldout:<user>` and pending-check ids | held-out text picks, pending checks | `golearn/heldout.ts:20`, `golearn/assessment.ts:168` |
| alphabet trainer state | Leitner state | `ui/alphabet/AlphabetPage.tsx:38` |
| `bundled-corpus:<lang>`, `bundled-ladder:<lang>` | import signatures | `bootstrap.ts:111-114` |
| library install and posting counts, profile cache | library state | `library/postings.ts`, `store-index.ts` |
| `golisten-import:<assetId>` | import records | `golisten/import.ts:84` |
| team-text lists | `teamTextsMetaId(lang)` | `ui/goread/TeamTexts.tsx:65` |

**Event log** (`src/core/bus.ts`, 45 lines). `StoreEventBus.emit` loads all dedupeKeys into a `Set` on first use, drops duplicates, stores `{...input, id: 'ev:<time>:<counter>', at}`, then notifies subscribers in order. `history({userId,types,since})` sorts by `(at, id)`. There is no `events.delete` anywhere in `src` except in backup restore `mode:'replace'` (`src/backup/restore.ts:59`, deletes that learner's events). The log is append-only by convention only: `put` is an upsert and nothing enforces immutability.

**Event kinds** (`src/core/events.ts`, 54 `interface X extends Base|Listen|Stage0Base`; `Surface = 'corpus'|'scripture'|'testimony'|'listen'|'home'`; every event has `userId, lang, at, surface, session, dedupeKey`):

| group | kinds (one-line meaning) |
|---|---|
| Reading, 17 | `TextViewed` (opened; not evidence), `SentenceViewed` (dwell-qualified exposure), `TokenHelpOpened` (level 1-5), `PhraseHelpOpened`, `GrammarHelpOpened`, `SentenceExplanationRevealed`, `EnglishRescueRevealed` (sentence/verse/parallel), `SentenceReread`, `DecodingRevealed`, `NoteOpened` (context only), `ComprehensionReported` (all/most/some/little), `TextCompleted` (explicit), `UnseenCheckRecorded` (readiness data only), `PassageCompleted`, `ItemMarked` (known/unknown/clear), `FormSearched`, `PhraseEncountered` (emitted by GoLearn itself) |
| Listening, 13 | `AudioPlayed`, `AudioSegmentCompleted` (carries `heardCoverageRatio`, `audibleCoverageVersion: 'observed-playback@1'`, rights/binding snapshot), `AudioReplayed`, `PhraseReplayed`, `AudioSeeked`, `PlaybackSpeedChanged`, `TranscriptRevealed`, `AudioAbandoned`, `ListeningPositionSaved` (resume only), `ListeningAssessmentStarted`/`Submitted` (self-report), `ShadowingAttempt`, `UserRecordingCreated` |
| Testimony and production, 8 | `TestimonyTextSubmitted`, `TestimonyRevisionAccepted`, `GoTellSuggestionShown/Accepted/Rejected/Edited`, `ProductionRecorded` (kind independent/self-repaired/assisted/copied; modality writing/speaking), `IndependentProductionDetected` |
| GoTell practice, 5 | `TellGoalDefined`, `TellTaskPresented`, `TellInterventionShown`, `TellAttemptSubmitted`, `TellTaskClosed` |
| Stage 0, 11 | `Stage0CheckAnswered`, `Stage0DecodeAnswered`, `Stage0SupportUsed`, `Stage0ProductionAttempted`, `Stage0SpeakingRecorded`, `Stage0PathOverridden`, `Stage0StepCompleted`, `Stage0SettingsChanged`, `Stage0ExitStarted/Answered/Finished` |

`FOLD_TYPES` (`golearn/fold.ts:100`) are the only event types that change learner state: `SentenceViewed, TokenHelpOpened, PhraseHelpOpened, GrammarHelpOpened, SentenceExplanationRevealed, EnglishRescueRevealed, ComprehensionReported, ItemMarked, AudioSegmentCompleted, ProductionRecorded, DecodingRevealed`. Others are progress or readiness inputs read directly from the log.

Event kinds with no emit site in `src` (grep `type: '<X>'`, excluding `core/events.ts`): `FormSearched`, `SentenceReread`, `PassageCompleted`.

**Backup/export/restore** (`src/backup/*`, 676 lines; format `go-backup` v1):
- File shape: `{format, version, createdAt, userId, policyVersion?, includesRecordings, counts, checksum: 'fnv1a64:…', data}`.
- `data` holds `user`, `events`, `testimonies`, `revisions`, `suggestions`, `drafts`, `recordings`, `testimonyContent` (the testimony Text subtree), `reference` (corpora/sources/lemmas/phrases/patterns that testimony rows point at, added-if-absent), non-policy `meta`, and `assets` (recording audio in base64, optional).
- Not exported: encounters and learnerItems (rebuilt from events), bundled texts (re-imported), generated audio.
- Restore: `mode: 'merge'` (default) or `'replace'` (deletes that learner's rows first), then it clears the policy marker so `ensureCurrent` rebuilds. Validation covers checksum, version, wrong-learner, count-mismatch and dangling references.
- `localStorage` items (prefs, active user, chosen course) are not in a backup (`docs/STORAGE.md`).
- `docs/STORAGE.md` is partly stale: it says "Everything is local… There is no server" and "Schema version 1".

**Offline:** there is no service worker or PWA manifest (grep for `serviceWorker|workbox|manifest.webmanifest` found nothing in `src`, `public` or `index.html`; `public/` holds only `dict/`, `library/` and `favicon.svg`). Learner data is IndexedDB and works offline once the page is loaded. Bundled corpus and ladder are JS-bundled via `import.meta.glob`, and the library and dictionary shards are fetched on demand from relative URLs, so they need the host or a browser cache. Whether the browser caches those is unverified.

**Sync:** none for learner data. The only cross-device mechanisms are the manual backup file and GoRead team text sharing (texts only, see §1).

---

## 4. Learner model: `src/golearn/*` (7,387 lines)

One public contract: `createGoLearn(deps)` in `index.ts` (242 lines), typed by `src/core/contracts/golearn.ts` (462 lines).

| module | responsibility |
|---|---|
| `index.ts` | Service facade. Serialises folds and reads in one queue. Exposes `attach`, `handle`, `rebuild`, `ensureCurrent`, `auditEvidence`, `settled`, `invalidateListening`, `invalidateProtectedAssessments`, `explainItem`, `readingProgress(Many)`, `getItemState`, `queryItem(s)`, `listKnown`, `resolveAnalysis`, `overrideAnalysis`, `sentenceSupport`, `tokenSupport`, `coverage`, `scriptureReadiness`, `recommend`, `predictDifficulty`, `stageReadiness`, `readingPace`, `rescueDependence`, `itemHistory`, `scoreProfile`, `rankLibrary`, `findOccurrences`. |
| `policy.ts` (498) | All constants, `POLICY_VERSION = 'evidence@8'`. |
| `fold.ts` (604) | Event folder (one `Folder` per learner; `FOLD_TYPES`). |
| `agg.ts`, `book.ts`, `state.ts` | Per-item aggregates (`evidence@6`; a fold touches only the sentence's items), the loaded-then-written-once item book, and state types. |
| `sitting.ts`, `userlog.ts` | Sittings derived from event time (gap `SITTING_GAP_MS` = 30 min, `core/model.ts:585`); in-memory evidence log indexed by text. |
| `audit.ts` | Evidence audit and policy-migration rebuild, `ensureCurrent`; nothing is deleted from the log. |
| `items.ts`, `analysis.ts`, `orth.ts` | Items of a sentence; best-analysis and lemma resolution (min confidence 0.5); writing-system ("orth") items kept out of word counts. |
| `queries.ts`, `explain.ts`, `history.ts`, `occurrences.ts` | Item knowledge queries, why-explanations, per-item history across surfaces, natural examples. |
| `coverage.ts` (361) | Personalised coverage and bands, Scripture readiness. |
| `progress.ts`, `activity.ts`, `pace.ts`, `rescue.ts` | Reading progress (five notions kept apart), reading-unit activity, pace (rough lower-bound wpm), rescue dependence. |
| `eligibility.ts` | Listening eligibility: only reviewed human speech counts; synthetic never does. |
| `forecast.ts`, `personal.ts` | Difficulty forecast of a text for this learner; personal difficulty from a profile alone. |
| `rank.ts`, `candidates.ts`, `recommend.ts` | Library ranking, whole-library candidate search, recommendations. |
| `readiness.ts` | Stage readiness verdict from signals; advice, not a gate. |
| `assessment.ts`, `heldout.ts` | Unseen-text check ("am I at B2?") reported as readiness; held-out text picks. |
| `prompts.ts` | Recall prompts generated from a finished text's own sentences. |
| `productive.ts` | GoTell to GoLearn: "productive gaps" give a small rank boost. |
| `retrieval/index.ts`, `retrieval/schedule.ts` | Daily cloze retrieval (DAILY_CAP 20). Leitner-style intervals `RETRIEVAL_DUE_HOURS {0,4,8,24,48,120,288,720}` h; retry 4 h after a miss. A correct recall emits `ProductionRecorded` (independent 1.0; assisted 0.4 after the first letter; nothing after the full word). State is the `meta` row `retrieval:<user>:<lang>`. |

**Evidence policy `evidence@8`** (`policy.ts`):
- **Levels** (`core/model.ts:476`): `unseen, encountered, recognized_with_help, recognized, rapid, recalled, used_with_assistance, used_independently, automatic`.
- **Modalities**: `reading, listening, writing, speaking`; each item has a `DimensionState` (level, confidence, evidence, exposures, estimatedFamiliar, unassisted, assisted, lastEvidenceAt).
- **Assistance ladder**: 0 none, 1 gloss, 2 phrase, 3 morphology/grammar, 4 sentence explanation, 5 English rescue (`model.ts:589`).
- **Reading weights** by assistance: `[1.0, .85, .65, .45, .3, .15]` (`policy.ts:108`).
- **Production weights**: independent 1.0, self-repaired .8, assisted .4, copied .2 (`policy.ts:110`).
- **Level thresholds** (`policy.ts:117`): recognizedWithHelp = 2 assisted and 1 demonstrated unit; recognized = evidence 1.5 and 2 units; rapid = 4.0 and 5 units; usedIndependently = 0.8 and 1 unassisted; automatic = 4.0 and 3 unassisted.
- **Estimate** (`policy.ts:131`): `{minUnassisted 4, minSittings 2, cleanTail 2, confidence 0.3}`.
- **Decay** (`policy.ts:142`): `{weeks: 6, halfCredit: true}`. This is read-time only (`effectiveStanding`); stored levels do not change. A manual "known" mark does not decay.
- **Listening credit** (`policy.ts:106`): `{single 0.8, passage 0.98}` of observed audible coverage. Synthetic speech is never evidence.
- **Comfort bands** (`policy.ts:146`): comfortable ≥0.95, productive challenge ≥0.88, difficult ≥0.75.
- Also in `policy.ts`: `READINESS`, `FORECAST`, `PERSONAL`, `RANKING`, `CANDIDATES`, `WHOLE_RANKING`, `REACH`, `RESCUE` (all marked provisional).
- Key rule: exposure is not comprehension. Only reports without help, explicit marks and production add `evidence`.

**Dependence on course/ladder concepts:**
- Imports from outside `core` in golearn: `assessment.ts` → `course/readingAssessment`; `candidates.ts` and `recommend.ts` → `library/postings`, `library/store-index`; `eligibility.ts` → `golisten/rights`; `rank.ts` → `dict/frequency`; `readiness.ts` → `course/catalog`; `retrieval/index.ts` → `stage0/match`.
- Reads of `stages`/`works`/`workId`: `activity.ts:46-49`, `candidates.ts:92-118`, `readiness.ts:52-90`, `forecast.ts:93,170`, `history.ts:69-81`, `personal.ts:178-180`, `pace.ts:78-83`, `recommend.ts:222`, `rank.ts:60`.
- Module-level course singletons set by bootstrap: `setLadderPathSource`, `setWholeLibrarySource`, `setCorpusFrequencySource` (`recommend.ts:108`, `rank.ts`). `stage0-recall` is a recommendation kind (`recommend.ts:26`).
- Course-independent in their own logic: `fold`, `agg`, `book`, `state`, `sitting`, `userlog`, `audit`, `items`, `analysis`, `orth`, `queries`, `explain`, `occurrences`, `rescue`, `retrieval/schedule`, `policy` (the constants minus ladder-oriented sections).
- Not purely event-derived: the fold reads `store.sentences/texts/tokens/analyses` (`fold.ts:311-313,592`, `items.ts:20-24`, `coverage.ts`, `progress.ts`). Each event's `sentenceId`/`tokenId` must resolve to rows already in the store. There is no path to credit a word that is not a stored token, except a manual `ItemMarked` and `queryItem({surface, lang})`, which resolves a surface to an item (contract `golearn.ts:182`).

---

## 5. Content model

**Types** (`src/core/model.ts` 984 lines, `course.ts` 361 lines):
- `LanguageCode = 'es'|'sq'|'th'|'hi'|'de'|'nb'|'nn'` (`model.ts:18`; `LANGUAGES` line 20). `Script = 'Latn'|'Deva'|'Thai'` (line 22).
- `Course` (`model.ts:34-50`): `{id, lang, readsLangs?, country, title, preferredLocales, bibleVersionId?, variety?}`. `User` (`model.ts:52-60`) has required `courseId`.
- `Text` (`model.ts:145-207`):
  - Required fields: `corpusId`, `sourceId`, `kind` (`'story'|'dialogue'|'nonfiction'|'scripture'|'transcript'|'testimony'|'generated-prep'`), `reviewStatus`, `published`, `contentVersion`.
  - Optional fields: `workId`, `chapter`, `scripture`, `personalCopy` (the learner's own copy), `teamText`, `streams`, `domains`, `variety`, `staticLevel` (A0-C1/native), `curriculum`, `readingAssessmentId`, `listeningAssessmentId`, `quality`.
- Hierarchy: `TextSection` → `Paragraph` → `Sentence` (stable `key` = content hash; `retiredInVersion`) → `Token` → `TokenAnalysis` (provenance machine/lexicon/human; confidence; `unit` for split lexical units; `orthography` relation) → `Lemma`, plus `Phrase`/`PhraseOccurrence`, `GrammarPattern`/`PatternOccurrence`, `EnglishRescue`, `ContentNote`.
- Rights: `RightsStatus` = `public-domain|licensed|owner-authored|generated|user-private|personal-copy|unverified` (`model.ts:63`). `ContentSource` has `rights` and `authorship` (`'published'` for personal copies). `WorkRights.state: RightsState` has 9 values (`course.ts:106`), including `user-supplied`, `recommended-only` and `research-only`.
- Types that presuppose course/ladder/library:
  - `Stage` (`course.ts:75-92`), `Work` (`course.ts:197`, with `stageId`, `courseId`, `role`), `Stream`, `AssistanceProfile` (`course.ts:32`; `visibility, layers, englishRescue, romanization, decodingFirst, chrome`), `HelpLayer` (11 values), `CourseCatalog` contract (`core/contracts/course.ts`), `CatalogText` (library index row), `StageContract`, `CurriculumMetadata`.
  - `Text.workId`/`chapter` and `Text.corpusId` (required).
- Types independent of them: `Sentence/Token/TokenAnalysis/Lemma/Phrase/Pattern`, `LearnerItemState/Encounter/DimensionState`, `ContentSource`, `Language`, `LanguageAdapter` (`core/adapters.ts`), `LexiconSource`/`DictionaryEntry` (`core/contracts/lexicon.ts`).

**How a Text enters the store** (everything goes through `src/ingest`):
- Input is a `CorpusDocument` (JSON, schema v2, `src/ingest/format.ts`, 940 lines; spec `docs/IMPORT.md`).
- Validate (`format.ts`, `quality.ts`, `language.ts`, `rights.ts`) → plan (`plan.ts`, 1,135 lines: segmentation, tokenisation, analysis via adapter plus optional dictionary, phrases, patterns, `computePublished`, content signature) → atomic write (`import.ts`, 612 lines: all-or-nothing `store.transaction`, Text row last; re-import of an unchanged doc writes nothing; changed sentences are retired, not deleted; events and encounters are never touched).
- Publish gate (`publish.ts`): published ⇔ review reviewed/approved with a named reviewer, ∧ rights established, ∧ (non-Scripture) review bound to the content signature, ∧ (Scripture) translation identity and verification.
- Sources of documents:
  1. Bundled: `import.meta.glob('../../data/corpus/**/*.json')` in `ingest/index.ts:63`, filtered by the rights gate. `data/corpus` has 147 files: de 41, es 29, hi 33, nb 3, nn 3, sq 23, th 15 (command: `ls data/corpus/<lang> | wc -l`).
  2. Ladder units: `ladder/bundle.ts` globs `data/ladder/<lang>/{ladder.json,units/}`. `data/ladder` has de 180, es 96, hi 97, nb 148, sq 109, th 100 files (`find … -type f | wc -l`).
  3. Stage 0 scenes: `stage0/documents.ts` (170 files under `data/stage0`; imported on demand).
  4. Library documents: `Library.open` fetches `t/<hh>/<name>.json` and imports via the ordinary importer.
  5. The learner's own copies: `.txt` (`ingest/plaintext.ts`), `.epub` (`ingest/epub.ts`, 327 lines: reads zip/spine and XHTML → paragraphs; refuses protected files, i.e. `encryption.xml` listing content or `rights.xml`, with `EpubError('encrypted')`), or `.json`. Each chapter becomes a `personal-copy` document, labelled "Your copy", never bundled or shared. UI: `ui/pages/Books.tsx`, `ui/course/CopyImporter.tsx`.
  6. GoTell testimony revisions: `ingest/testimony.ts`, a private `user-private` Text.
  7. Team texts fetched from GoRead, then re-validated by the importer.
- No locator: nothing records a source location (EPUB CFI or href, URL, DOM range). Provenance is `ContentSource.url?/edition?` and `Text.transformations`.

**Library** (`src/library/*`, 2,075 lines): built offline into `public/library/<lang>/` (git-ignored): `manifest.json`; `index/<stream>-<nnnn>.json` shards of ≤500 `CatalogText` rows (`SHARD_ROWS`); `t/<hh>/…` documents; `p/<hh>/…` `TextProfile` (forms, lemmas, phrases, constructions with counts, plus `TextFeatures`); `provenance.json` (`library/format.ts:2-9`). Runtime (`library.ts`, `postings.ts`, `store-index.ts`, `measure.ts`) pages and searches the catalogue, caches profiles in `meta`, and writes rows to `catalog`. Built libraries exist for de/es/hi/sq/th (de 60M, es 61M, hi 39M, sq 0.8M, th 37M); none for nb/nn.

**Dictionaries** (`src/dict/*`, 3,673 lines): sharded JSON built from Kaikki/Wiktionary JSONL dumps (`data/dictionaries`, 2.4G, ignored) into `public/dict/<lang>/` (de 41M, es 58M, hi 9.6M, nb 8K, sq 6.4M, th 7.7M). Runtime is a lazy fetch `LexiconSource` with an LRU of 24 parsed shards. The licence is CC BY-SA per the `.gitignore` comments.

**Catalogue** (`src/course/*`, 3,436 lines): per-language curriculum data as TS and JSON (`spanish.ts`, `german.ts`, `hindi.ts`, `albanian.ts`, `thai.ts`, `norwegian.ts`, plus `acquired-library-works.json`, `curriculum-acquired-works.json`, `reading-bridge-works.json`, `thai-literature-works.json`). `catalog.ts` has a hard-coded `LADDERS` map keyed by course id (`catalog.ts:35-39+`); `install(courseId)` seeds `stages`/`works`/`notes`. Also `bibleAccess.ts` (per-language Scripture access record), `scriptureIntegrity.ts`, `readingAssessment.ts` (held-out reading registry), `doors.ts` (per-course Home/Explore doors), `transitionAnalysis.ts`.

**Ladder and Stage 0:**
- `src/ladder/*` (1,519 lines): ladder data model/loader (Node), gate (coverage, recycling, cliffs), `path.ts` (done/next/later per unit), `place.ts`, `orphans.ts`, recording kit, pipeline (draft → review → corrections → audio → published).
- `src/stage0/*` (1,776 lines): micro-scene packs per language, exit gate, pure-fold state.
- Both are machine-drafted and unreviewed content; the units are held unpublished in normal use (`ladder/PathPage` header, `stage0/documents.ts`).

---

## 6. UI (`src/ui`, 65 `.tsx` files, 14,307 lines)

**Component inventory** (`find src/ui -type f` grouped; tsx line counts from `wc -l`):

| area | files |
|---|---|
| shell | `App.tsx`, `Onboarding.tsx` (Gate/TeamSelect), `context.tsx`, `ui.tsx` (Topbar/BackLink/IconBtn/I), `prefs.ts`, `sandbox.ts`, `sitting.ts`, `events.ts` (emitter), `format.ts`, `files.ts`, `library.tsx`, `coverage.tsx`, `rescue.tsx`, `PreviewBanner.tsx`, `SandboxBanner.tsx` |
| pages | `pages/Home.tsx` 57, `Library.tsx` 335, `TextPage.tsx` 197, `Course.tsx` 149, `Curriculum.tsx` 53, `Explore.tsx` 144, `Books.tsx` 73, `Practice.tsx` 223, `Settings.tsx` 431; `pages/settings/` (Backup, Content, Evidence, ImportReport, Interests, LanguageSupport, Recordings, Speech, TeamSharing) |
| reader | `reader/Reader.tsx` 928, `TokenCard.tsx` 560, `assistance.ts` 594, `Prompts.tsx` 247, `DifficultyPreview.tsx`, `ListenBar.tsx`, `ListenPractice.tsx`, `SourceLine.tsx`, `viewDetection.ts` 154, `useTextData.ts`, `useAssistance.ts`, `useListen.ts`, `readingGate.tsx`, `prompts.css`, `thai.css` |
| read / scripture | `read/ReadPage.tsx` 377, `read/NextForYou.tsx`, `scripture/ScripturePage.tsx` 351, `scripture/canon.ts` |
| course / ladder / stage0 | `course/` (BibleAccess, CopyImporter 385, ExploreWork, StageStatus, StreamHome, UnseenCheck, WorkCard, useLadder), `ladder/PathPage.tsx`, `stage0/` (Stage0Home 243, StepPage 304, ExitCheck, SoundsPlayer, parts, Stage0Entry, audio, nav, names) |
| writing | `testimony/` (Testimony 380, SuggestionCard, RevisionAudio 212, draft/useDraft, recorder), `tell/` (Practice 227, Inspector, TestimonyMap) |
| listen | `player/Player.tsx`, `player/audio.ts`, `listen/` (ListenRedirect, `useListenSession.ts`) |
| other | `alphabet/AlphabetPage.tsx` 388, `disclosure/Disclosure.tsx`, `goread/` (JsonImporter, TeamTexts 286) |

**Design system:** a single global stylesheet, `src/index.css` (598 lines), plus 10 small feature CSS files (470 lines total). Tokens are CSS custom properties on `:root`: `--serif` (EB Garamond, bundled woff2 in `src/assets/fonts`), `--deva`, `--thai`, `--paper/--paper-raised/--ink/--ink-soft/--ink-faint/--rule/--accent/--olive/--wine`, `--mark-new/recognized/familiar`, `--reading-font-size 22px`, `--reading-line-height 1.85`, `--measure 38rem`. Dark theme via `:root[data-theme='dark']` and `prefers-color-scheme`. Phone-first (16px gutters, 44px touch targets). The look is shared with other projects (Biblia/Sefer). No component library.

**Reader** (`Reader.tsx`):
- Renders canonical sentence text exactly, with tokens overlaid by offset. Loads everything from the store (`useTextData`: text, source, corpus, sections, paragraphs, sentences, tokens, rescues, phrase occurrences, notes, per-sentence `SentenceSupport`).
- Help layers come from the `AssistanceProfile` of the text's stage/shelf (`useAssistance` → `catalog.assistanceFor`), else `DEFAULT_ASSISTANCE` (`gloss, phrase, grammar, sentence, english, history`).
- Layer → event map (`course.ts:71` `LAYER_ASSISTANCE_LEVEL`; Reader lines): gloss → `TokenHelpOpened` 1 (`Reader.tsx:438`); phrase → `TokenHelpOpened` 2 plus `PhraseHelpOpened` (`:467-472`); grammar/definition/discourse → level 3 plus `GrammarHelpOpened` (`:476`); sentence/clause-structure → `SentenceExplanationRevealed` (`:479-481,513`); english → `EnglishRescueRevealed` (`:352`); decoding → `DecodingRevealed` (`:401`); note → `NoteOpened` (`:410`); history → no event.
- Other emits: `TextViewed` (`:300`, once per sitting), `SentenceViewed` (`:314`, via `viewDetection.ts`, which requires dwell proportional to length, visible tab, and no prep panel), `TextCompleted` (`:520`), `ComprehensionReported` (`:528,538`). Also "Understood" per sentence, an end-of-text "All/Most/Some/Little" report, parallel English, previous/next bar, `EndReport`/`Prompts` (recall prompts), `DifficultyPreview`, `ListenBar`, `ListenPractice` (device `speechSynthesis`, emits nothing).
- **TokenCard word sheet** (`TokenCard.tsx`): bottom sheet with Gloss (plus certainty, other meanings, dictionary alternatives, "what Go knows about this word"); then layers in profile order: Phrases, Grammar (plus prior encounters and "where you met it" examples), Definition, What it does here, Notes, Sentence structure (clause segments), This sentence, English, Your history with this word; also Decoding (syllables/tone/romanization rescue, Stage 0 only) and How it sounds (non-decoding languages). The sheet emits nothing itself.
- Dependency: word data comes from stored `Token`/`TokenAnalysis` ids plus `golearn.tokenSupport(userId, tokenId, level)` (contract `golearn.ts:192`) and `services.lexicon(lang)`. A word must already be a token of an imported Text.

**Stage 0 / ladder / path / library UIs:**
- `/start` Stage 0 home: letters read independently, sentences understood before English, understood by ear; steps, exit check.
- `/path`: ordered Stage 0 → units (A1/A2/B1 bridge) with done/next/later; "done" = an explicit `TextCompleted` for the unit's text (`ladder/path.ts:192-206`); Stage 0 counts done on exit-reading-pass or the override.
- `/course`: stages and works (Thai-style ladder).
- `/explore`, `/read`: library and shelf navigation with "Best next reads" (`course/StreamHome`) and `NextForYou`.
- `/scripture`: canon browser for es, th, hi, de (`ui/scripture/canon.ts:22-23`).

---

## 7. GoTell (`src/gotell`, 3,756 lines)

Two sub-systems behind `createGoTell(deps)`:
- **My Testimony** (`service.ts`, 802 lines; contract `core/contracts/gotell.ts`):
  - Per-learner `Testimony` with `drafts` (autosave with monotonic `seq`, `DraftConflict`), immutable `revisions` and `suggestions`.
  - `submitDraft` analyses sentences via the adapter's `checkProduction` (rule-based `RuleBasedSuggestionProvider` in `provider.ts` gives repair/recombination/expansion), constrained to language the learner has met.
  - `acceptRevision` classifies each item (independent / self-repaired / assisted / copied) and emits `ProductionRecorded`, which GoLearn folds into the writing dimension.
  - `intent(req)` does English-intent retrieval (`retrieval.ts`) from encountered wording only.
  - `meaning.ts` blocks silent changes to negation, chronology and key theological terms; `concepts.ts` (352) holds per-language concept tables with `NEGATORS`, `CHRONOLOGY`, `SUBJECT_PRONOUNS` as `Record<LanguageCode,…>`.
  - Accepting a revision ingests it as a private Text (`ingest/testimony.ts`). It optionally queues audio via `golisten`.
  - Reads learner state only through GoLearn queries and the encounters table (`sources.ts`); keeps no mastery model of its own.
- **Practice** (`gotell/productive/*`, 8 files; contract `core/contracts/gotell-practice.ts`; UI `/tell`; doc `docs/GOTELL.md`):
  - A `SemanticGoal` is an English meaning plus concept components. 15 catalogue goals in `goals.ts:~25-60`: 11 `testimony`, plus 1 `scripture` and 1 `church` (the other 2 not itemised); domains are `testimony|scripture|church|daily-life|ministry`. 105 model wordings (about 15 per language × 7, `goals.ts:72+`). Each is marked `unreviewed` until a native speaker checks it. A learner may define his own goal if its English maps to known concepts (`learnerGoal`).
  - `scheduler.ts`: scores each goal (Σ weight × factor; every factor and reason is recorded; deterministic).
  - `ladder.ts`: smallest-intervention help ladder (restatement, cue, frame, correction, model), each step recorded as `TellInterventionShown`.
  - `assess.ts`: meaning (concept recognition with polarity) judged separately from language (adapter `checkProduction`); states what it cannot verify.
  - `state.ts`: productive state is a pure function of the `Tell*` events, with promotion rules and `DUE_HOURS`; `interpret.ts` is a validation shell for an optional LLM provider (none ships); `taxonomy.ts` has error codes.
  - Task families: `express|answer-question|testimony-part|retell|transfer`. `retell` uses a text the learner read.
  - Writes: `Tell*` events plus `ProductionRecorded` for items of a successful attempt.
- Course content dependence: goal catalogue and model wordings are testimony/ministry-themed and hard-coded in `goals.ts`. The `LANG_NAME` map in `practice.ts:51` and the concept tables are hard-coded per `LanguageCode`. Task presentation does not require a ladder, but the retell family needs read texts. No lesson/stage concept in the scheduler.

---

## 8. GoListen (`src/golisten`, 3,993 lines; `src/ui/reader/{ListenBar,ListenPractice,useListen}`, `src/ui/listen/*`, `src/ui/player/*`)

- **Pipeline** (`pipeline.ts`, `jobs.ts`, `cacheKey.ts`): sentence → `adapter.speechNormalize` → pronunciation overrides → cache key (provider/voice/text; deliberately not contentVersion or text id) → pending `AudioSegment` + idempotent job (id = cacheKey) → synthesise → `inspectWav` gate → content-addressed asset → segment becomes `ready` last. Alignment is by construction at sentence level; word-level only if the provider returns trustworthy marks.
- **Providers** (`providers.ts`; `usable = available ∧ (isSpeech ∨ allowFixture)`):
  - `AzureSpeechProvider` (direct REST, key typed in browser): mocked-fetch tests only; its header says it "has never been called against the live service".
  - `ProxySpeechProvider` (same-origin `/api/speech/*`, key server-side): mocked only; needs `server/speechProxy.ts`, which the Vite config disables (`LISTEN=false`) and which a static deploy lacks.
  - `FixtureTtsProvider`: non-speech tone bursts, never evidence; shown only in preview mode or with the dev pref. Voices are per `LanguageCode` (`azureProvider.ts:33`, `fixtureProvider.ts:19`).
- **Import route** (`import.ts` `importRecordingFor`, UI `pages/settings/RecordingsSection.tsx`; kit `ladder/recording.ts`): a lawful human recording plus manifest is exactly bound to a text release (`rights.ts`: text sha256, edition id, release id), validated as PCM16 WAV, and stored with rights and review metadata and an import record in `meta`.
- **Eligibility** (`golearn/eligibility.ts`, `golisten/status.ts`): only reviewed human speech with approved rights and an exact text binding counts. Synthetic speech is practice only. Evidence is the `observed-playback@1` coverage ratio.
- **Player** (`player.ts`, DOM-free state machine; `ui/player/Player.tsx` wraps `HTMLAudioElement`, `preservesPitch`, rate 0.7-1.25; `viewDetection`-style audibility checks). Progress and resume come from events (`progress.ts`, `ListeningPositionSaved`); there is no separate mastery table.
- **Also:** recommendations (`recommendations.ts`), a protected listening-assessment guardrail (`assessment.ts`; no assessment text registered, so it fails closed), and `QA.md`.
- **Tied to bundled texts:**
  - No audio corpus ships. `find data public -iname '*.wav|*.mp3|*.ogg|*.m4a'` found none; the only audio fixture is `test/fixtures/golisten/de-guten-tag.{wav,oga}` (Commons PD-self German greeting).
  - Listening evidence requires audio exactly bound to a stored Text. So a recording is per `Text` row and `contentVersion`, not per arbitrary URL.
  - `QA.md` lists as outstanding: production recordings, native review, and live-provider verification.
- **UI:** `ListenBar` appears in the Reader only (modes Listen only / Read + listen / Listen first). `/listen` routes redirect (`ListenRedirect.tsx`). `ListenPractice` uses the device's `speechSynthesis`, emits nothing and counts as nothing.
- `FEATURES.listen = true`, but with no provider configured the audio is "honestly unavailable". The Settings Speech section shows only if `features.listen` (`Settings.tsx:62,90`).

---

## 9. Tests

- Totals: `find test -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l` = 421 test files (468 files in `test/`). Literal test cases by grep `^\s*(it|test)(\.each)?\(` = 5,761 (a static count: `it.each` rows are undercounted, and nothing was executed).
- Runner: vitest 3, node env, 20 s timeout, `include test/**/*.test.{ts,tsx}`. UI tests use `jsdom` per-file and `react-dom/client` `act`, with no testing-library.
- Per area (files / literal cases, via `find` and grep):

| dir | files / cases | dir | files / cases |
|---|---|---|---|
| `adapters` | 85 / 2093 | `ui` | 73 / 705 |
| `golearn` | 51 / 589 | `ingest` | 39 / 564 |
| `golisten` | 28 / 247 | `integration` | 24 / 244 |
| `gotell` | 15 / 178 | `dict` | 14 / 227 |
| `bench` | 19 / 221 | `library` | 12 / 118 |
| `course` | 14 / 113 | `server` | 4 / 76 |
| `content` | 6 / 74 | `ladder` | 6 / 68 |
| `authoring` | 5 / 49 | `stage0` | 4 / 44 |
| `goread` | 4 / 44 | `alphabet` | 2 / 39 |
| `backup` | 2 / 27 | `sim` | 1 / 23 |
| `db` | 3 / 21 | `tools` | 8 / 20 |
| `core` | 2 / 13 | `fixtures`, `helpers` | no tests |

- **Harness:** `test/ui/harness.tsx` has a memory store plus the real `StoreEventBus`, fakes of GoLearn/GoListen/GoTell, a real `createCourseCatalog`, and a real plain-text/EPUB converter (`USE_REAL_CONVERTER = true`). `test/ui/fixtures.ts` has UI fixtures. `createIndexedMemoryStore` (`src/sim/store.ts`) is an indexed in-memory store used where the plain store's scans are too slow (`test/ui/pathPage.test.tsx:7,130,160`, `test/sim/simulate.test.ts:17,452`). `test/golearn/{harness,fixtures,courseFixtures,routeWorld,profiles,testAdapters}.ts` and `test/library/{fixtures,helpers}.ts` are suite-local helpers.
- **Golden/snapshot:** there are no `.snap` files. Golden JSON: `test/course/golden/assistance.json` (used by `assistanceGolden.test.ts`); route golden: `test/golearn/routeGolden.test.ts` + `routeWorld.ts`; `test/dict/format3.test.ts` and `test/alphabet/srs.test.ts` mention golden; Hindi gold under `data/benchmarks`. `test/fixtures/golisten/*` is the one audio fixture; `test/integration/fixtures` and `test/dict/fixtures` exist.
- **Course-content vs engine** (heuristic; I did not read every test): 67 test files reference bundled data (`grep -rlE "loadBundledCorpus|data/corpus|data/ladder|data/stage0|public/library|data/verified|ladderUnitDocuments|data/benchmarks" test`): adapters 14, ingest 17, bench 7, ui 6, content 5, integration 4, ladder 3, tools 3, course 2, golearn 2, stage0 2, authoring 1, server 1. 27 test files reference course constants or `COURSES` (`THAI_COURSE_ID|SPANISH_COURSE_ID|COURSES`). 11 test files call `bootstrap(`.
  - Mostly course/language-content: `test/content` (6), `test/course/*Catalog` + `*Rights` (about 8), `test/integration/*-course|*-ladder|spanish-*|german-*|hindi-*|thai-*|albanian-*` (about 17 of 24), `test/ladder` (6), `test/tools` (8, Scripture), `test/bench` (19), most of `test/adapters` (85, analyser quality per language), `test/dict` (14), `test/library/build|catalog`.
  - Mostly engine: `test/golearn` (51, uses synthetic fixtures; a few touch real adapters), `test/golisten` (28), `test/gotell` (15), `test/backup`, `test/db`, `test/core`, `test/goread`, `test/server`, `test/stage0`, `test/alphabet`, most of `test/ui` (73) and `test/ingest` (39; mixed, since 17 read bundled data).

---

## 10. Sibling repo `C:/Users/CJWal/dev/2GoLearn`

A separate npm-workspaces monorepo (`package.json`; packages `core`, `store-memory`, `store-dexie`, `adapter-kit`, `react`, plus `examples/node-host`). Per `README.md` it is "a universal learner-model engine for reading-based language acquisition, with a spaced-repetition deck", lifted from go-v0's `src/golearn` + `src/core` and generalised. Differences:
- `LanguageCode = string` (`packages/core/src/model.ts:17`).
- Scripture is not special.
- English rescue becomes an L1 `Translation`.
- A `CourseProfile`/`defaultProfile` object carries the `evidence@8` numbers (`profile.ts`).
- A `deck/` module (cards bound to read sentences, recognition and typed-recall cards, `ladder` and `fsrs` schedulers, ladder hours `[0,4,8,24,48,120,288,720,1440,2880]` at `profile.ts:202`, default scheduler `'ladder'`).
- `analytics/` (forecast, readiness, rank, recommend, pace, rescue).
- `ingest/`, `queries/` and `engine/` (fold, agg, sitting, audit).
- A `listen-engine/` GoListen port (provider port, import, rights, player, jobs).

Public API surface: `packages/core/src/contract.ts` defines `GoLearn`, `Deck`, `Scheduler`, `Card`, `ReviewResult`, `TokenSupport`, `SentenceSupport`, and the ports `GlossPort`, `AudioPort`, `NotePort`, with the rest in `index.ts`, `store.ts`, `adapter.ts`, `events.ts`.

Docs: `DESIGN.md`, `ARCHITECTURE.md`, `EVIDENCE.md`, `DECK.md`, `INSTALL.md`, `PLAN.md`, `GOLDEN.md`, `LISTEN.md`, `STATUS.md`, `EVAL-2026-10-08.md`.

Status and tests:
- The docs claim `npm run verify` (typecheck, tests, golden comparison against `docs/golden.json`, rebuild-equivalence probe) is green. I did not run it.
- Tests: 49 test files and 628 literal cases by grep (`find packages examples -name '*.test.ts*' -not -path '*/node_modules/*' | wc -l`). The latest commit message says "793 tests green", so the grep count undercounts parameterised cases. `README.md` and `docs/STATUS.md` still say 626 (stale).
- `packages/core/src` is 12,501 lines.

Relation to go-v0:
- Shares no types or imports. `docs/PLAN.md:4` says "read-only; never import from it". Mentions of go-v0 are in comments and docs (`model.ts:4`, `profile.ts:5`, `deck/match.ts:4`, `docs/DESIGN.md:3,343` migration map).
- The data model is a copy and adaptation, and the two will diverge.

Git: 9 commits, latest `08e6280`. No remote (`git remote -v` empty). Uncommitted: `M package.json`; untracked `data/`, `docs/EVAL-2026-10-08.md`, `scripts/corpus-eval.mts`, `scripts/eval/`.

---

## 11. "Old assumptions" embedded in code

| assumption | evidence (file:line) |
|---|---|
| Every learner has exactly one course, and the course fixes one language | `core/model.ts:55` `User.courseId: string` (required); `core/model.ts:34-50` `Course.lang` (singular), with `readsLangs` the only exception (Norwegian nb reads nn); `Onboarding.tsx:~18-28` `chooseTeam` creates the user with a course; `main.tsx` `Gate` renders only once `course` exists; `ui/context.tsx:~150` `lang: who.course.lang`; `ui/prefs.ts:155-163` chosen-course key; `app/bootstrap.ts:121-127` user created only when a course was chosen; `core/config.ts:20-60` `COURSES` has 6 course rows (country-named, e.g. `honduras-es`) |
| Only the active course's language is loaded and shown; other-language texts are refused | `app/bootstrap.ts:391` `courseLangs(course)`; `ui/pages/TextPage.tsx:44` `courseReads(...)` gate; `golearn/recommend.ts:3,117` "only consider the learner's current course language" |
| Every learner enters through a ladder (Stage 0, then units) | `golearn/recommend.ts:26` `stage0-recall` kind and `setLadderPathSource` (`recommend.ts:108`); `bootstrap.ts:~288` "The ladder is the default route"; `ladder/path.ts:4,13` Stage 0 first, then units done/next/later; `ui/Onboarding.tsx` → `/start`; `catalog.install` at `bootstrap.ts:~408` |
| Advancement = course completion | `ladder/path.ts:192-206` unit is `done` iff `TextCompleted` for its text; `course/catalog.ts:~210` `currentStage` = first stage not `ready-to-advance`; `golearn/readiness.ts:72-90` per-stage verdict from the stage's texts (`Text.workId`); note `readiness.ts:2-4` says finishing every text is not a signal and the verdict is "advice, never a lock" |
| Every Text has a corpus and, mostly, a work/stage | `core/model.ts:150` `corpusId: string` required; `:187` `workId?`; `core/contracts/course.ts` `stageOfText`; `course/catalog.ts:160-190` `assistanceFor` resolves help by stage/work/ladder-unit text-id regex `LADDER_UNIT_TEXT` (`catalog.ts:61`) |
| Every text has a local source file (a document the importer reads) | `ingest/index.ts:63-64` `import.meta.glob('../../data/corpus/**/*.json')`; `ladder/bundle.ts` globs `data/ladder`; `library/format.ts:2-9` documents as `t/<hh>/<name>.json`; `ingest/epub.ts` and `plaintext.ts` convert a local file to documents; no field for a URL, EPUB CFI or DOM anchor on `Sentence`/`Text` (`ContentSource.url` is provenance only) |
| Vocabulary state derives only from the native reader | `golearn/fold.ts:100` `FOLD_TYPES`; `fold.ts:311-313,592` and `items.ts:20-24` need stored sentence/token/text; `core/events.ts` `SentenceViewed` (only "in the reader itself", `Reader.tsx:314` / `viewDetection.ts`); `FormSearched` is defined (`events.ts`) but has no emit site in `src` |
| Scripture is embedded | `core/model.ts` `Text.scripture`, `TextKind 'scripture'`, `Course.bibleVersionId`; `Surface 'scripture'` (`events.ts`); routes `/scripture*` (`App.tsx`); `ui/scripture/canon.ts:22-23` `ScriptureLang = 'es'|'th'|'hi'|'de'`; `data/verified/scripture.json` (43M `data/verified`); `golearn/coverage.ts` `scriptureReadiness`; build step `node scripts/verify-scripture-canon.mjs` in `package.json` `build`; `course/bibleAccess.ts:24`, `scriptureIntegrity.ts`; publish gate special-cases Scripture (`ingest/publish.ts`) |
| Listening needs a bundled or exactly bound audio corpus | `golearn/eligibility.ts` (reviewed human speech only, exact text binding via `golisten/rights.ts`); `core/model.ts:626` `AudioTextBinding`; `core/events.ts` Listen fields `textSha256`, `contentVersion`, `releaseId`, `exactTextBound`; `golearn/policy.ts:106` `LISTEN_CREDIT`; synthetic speech never counts. No audio corpus is bundled (see §8), so in practice listening evidence is empty |
| Writing exercises belong to a lesson/domain | `gotell/productive/goals.ts` fixed `GOALS` (15) with `domain`/`section` (`core/contracts/gotell-practice.ts:15`), 105 model wordings (`goals.ts:72`); `stage0/service.ts` production tasks belong to scenes; `ui/testimony/Testimony.tsx` is a single testimony per learner and language (`ids.testimony`, `core/ids.ts`); `retell` family requires a read text |
| Fixed set of 5-7 hard-coded languages | `core/model.ts:18,20` (7 codes), `core/config.ts:9-17` `LANGUAGE_ROWS` (7), `COURSES` (6: no `nn` course, Nynorsk is read via `readsLangs`); `adapters/index.ts:17` `Record<LanguageCode, LanguageAdapter>`; 22 occurrences of `Record<LanguageCode` in `src` (`grep -rn "Record<LanguageCode" src | wc -l`), e.g. `golisten/azureProvider.ts:33`, `gotell/concepts.ts:68,228,244,256`, `goals.ts:72`, `practice.ts:51`, `provider.ts:47,50`, `ingest/quality.ts:155`, `course/bibleAccess.ts:24`, `course/curriculumPolicy.ts:43`; language-specific branches `lang === 'th'` (`gotell/concepts.ts:297-311`, `productive/assess.ts:46`, `productive/ladder.ts:113`), `ui/read/ReadPage.tsx:356` (alphabet link for th/hi), `stage0/lang/index.ts:173` |
| Content is curated, reviewed and rights-gated before use | `ingest/publish.ts` (unpublished only in preview mode), `server/rightsGate.ts`, `ingest/rights.ts`; `Text.reviewStatus`/`published`; the whole `data/ladder`, `data/stage0` content is machine-drafted and unreviewed (`ladder/PathPage` header; `docs/audits/COURSE-AUDIT-2026-10-06.md` per memory notes) |
| Fully local, single device, no backend (partly outdated) | `docs/STORAGE.md` §1 "no server and no account"; contradicted only for texts by `server/goread`; learner data is never uploaded |
| One user object per device, no auth | `ui/prefs.ts:167` `DEFAULT_USER_ID = 'u-local'`; `selectUser` exists in `context.tsx`, but no accounts anywhere |
| Content-derived item ids shared across texts | `core/ids.ts:38-45`: this one is an asset, not an assumption (items keyed `form:<lang>:…`, `lemma:<lang>:…`) |

---

## Not inspected / uncertain
- Nothing was executed: tests, `tsc`, the build, dev servers and the GoRead server. Counts are static greps. `tsc -b` and `npm run gate` status is unknown from this audit (git history says the last commit is "refactor(listening)…" on 2026-10-08).
- `git ls-remote` showed only `gh-pages`. I did not check whether `master` was pushed elsewhere, or what `gh-pages` contains. The live deployment URL and whether it is current are unverified.
- Whether GoRead (`server/goread`) is deployed anywhere (Cloudflare) is unknown. `teamServer` is empty by default.
- Bodies of most `src/adapters/**` (47,872 lines), `src/dict/**` build code, `src/bench/**`, `src/sim/**`, `src/authoring/**` and the 142 `scripts/**` were not read. They are listed only by directory.
- I read only the headers of the individual `golearn/*` modules (not every function). `fold.ts`, `recommend.ts`, `rank.ts`, `candidates.ts`, `coverage.ts` and `readiness.ts` logic beyond the header comments, constants and import lines is unverified. I did not verify that the doc claims in `policy.ts` match behaviour.
- I did not read the GoTell service body, `stage0/service.ts` internals, `src/ui/pages/Settings.tsx` details (e.g. learner switching, reset), the `ListenBar`/`Player` internals, or the content of `docs/PLAN*.md` and `docs/audits/*`.
- Test-category classification is heuristic (grep for data paths and course constants); I did not read every suite. Whether a test hits real data or fixtures is not individually established.
- `data/` subtree contents beyond directory listings (`sources`, `research`, `review`, `private`, `synthetic`, `verified`) were not inspected, nor were licences of any bundled content. No review of whether committed content is actually public-domain.
- Dist/build size and what is in the production bundle (e.g. the rights-gate's excluded documents) were not measured. `dist/assets` is 11M, and `dist` is 328M including library/dict copies.
- Browser behaviour (offline after first load, whether the browser caches library and dict shards) is unverified. There is no service worker.
- 2GoLearn: I read only the README, `docs/STATUS.md`, `package.json`, directory trees and a few file headers/grep hits. I did not run `npm run verify`, so the "793 tests green" claim in the latest commit message is unverified. I did not check how its `store-dexie` schema compares to go-v0's tables. Its uncommitted `data/` and `scripts/eval/` were not opened.
- Secrets: I checked source and scripts by keyword grep only, not git history or the `work*/` untracked files. I did not search the untracked 662 MB `work/` directory or the repo-root `work-*.txt`/`work-thai.zip`.
- "FEATURES.listen: true" (`config.ts`) vs the stale comments claiming V1-off or V2-deferred (`vite.config.ts:6-9`, `ui/context.tsx` `features` doc) are inconsistent in the repo. I report both as found; I did not decide which is current.
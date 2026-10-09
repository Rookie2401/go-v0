# Performance audit: lookup, Repository, review, sync, audio start-up, GoTell feedback (brief §24)

Date: 2026-10-09. Owner of this file and of `test/audit/perf.*`: the performance and accessibility audit session (its sibling is `ACCESSIBILITY.md`).
Product code changed: **none by the audit**. Everything below was measured on the code as it stood, in node and jsdom, on one PC. The one remediation since (PF-02, 2026-10-09) is marked where it applies, with its re-measurement.
Suite: `npx vitest run test/audit/perf.*.test.ts --reporter=dot` → **3 files, 22 tests, all green** (24 with the separate-process rows below); `npx tsc -b` clean for these files.
Every number in the tables was produced by those tests (rows printed and written to JSON with `PERF_ROWS_DIR`) or by the scripts listed in "Reproduce"; nothing is estimated unless the text says "arithmetic".

## Machine, method, limits of the numbers

| | |
|---|---|
| machine | this Windows 11 PC: Intel Core Ultra 9 275HX, 24 logical cores, 31.4 GB RAM, Node v24.19.0, Windows_NT 10.0.26200 |
| load | **not idle**: other agent sessions were running (CPU load 90 % when the final run started, 32 node processes). The figures are therefore on the pessimistic side and the p95 of a short series can show a spike; the ranking between rows is reliable, the third digit is not. |
| clock | `performance.now()` around the operation; each row says what is inside the stopwatch |
| statistics | median and p95 over **N timed runs** (stated per row) after a few untimed warm-up runs (stated). p95 is the nearest-rank value; with N ≤ 20 it is the second-largest or the largest sample, so read it as "the worst typical run". |
| files | the final run used `--no-file-parallelism` so the lanes do not time each other; the default parallel run also passes |
| bounds | each test asserts only a loose sanity bound (10× to 1000× above the figure) so a busy PC cannot flake it; the figures are the product |

The service rows use the REAL stack: SQLite store, real projection engine, real linguistic service, real scrypt for sign-up, real GoReview intake/planner/FSRS/session runner, the real pack runtime reading the dictionary shards from `public/dict/sq` on disk. "Over HTTP" means a loopback socket: either a node:http server inside the test process serving the same `handle()` (SQLite in memory), or the **separate** `packages/repository-service/src/main.ts` process on port 8791 with a SQLite file (started with `npx vite-node packages/repository-service/src/main.ts --port 8791 --data <scratchpad>/perf/data --host 127.0.0.1`, killed afterwards; set `PERF_SERVICE_URL=http://127.0.0.1:8791` to include it).

### The HTTP floor of this PC (read this before any "over HTTP" row)

A bare `node:http` server that answers `{"ok":true}` (no Repository code at all) costs **15 to 18 ms per request with `fetch`** (PF-M18, N=100) and 7 ms with `http.get` and a keep-alive agent on this machine (probe script `http-baseline.mjs`). Every HTTP row below contains that floor. It is a property of Node's `fetch` on this Windows PC, not of the service: a single-event write over HTTP (15.1 ms) is the same as the floor, while the same write in-process is 0.65 ms.

## 1. Measurements

Units are milliseconds unless stated. "Warm" = the module and the data were already loaded.

### 1.1 Pack runtime and selection parse

| id | what is timed | N | median | p95 | min | max |
|---|---|---:|---:|---:|---:|---:|
| cold-1 | **fresh process**, bundled (esbuild, unminified 639 KB) sq adapter + pack runtime + parser: process start until all modules are evaluated | 12 | 55.6 | 76.2 | 54.1 | 76.2 |
| cold-0 | the same measurement for an empty node script (the floor of cold-1) | 12 | 18.2 | 20.3 | 16.8 | 20.3 |
| cold-2 | `createPackRuntime(sq)` in the fresh process | 12 | 0.05 | 0.08 | 0.04 | 0.08 |
| cold-3 | **first** `parseSelection("librin")` in the fresh process (the adapter initialises lazily) | 12 | 72.9 | 78.9 | 71.2 | 78.9 |
| cold-4 | first `gloss()` in the fresh process (dictionary manifest + one shard read from disk, parsed) | 12 | 18.1 | 20.2 | 17.6 | 20.2 |
| cold-5 | a second `gloss()` of another lemma (another shard) | 12 | 1.19 | 1.38 | 1.09 | 1.38 |
| PF-M01 | `createPackRuntime(sq)`, module already loaded | 50 | 0.0005 | 0.0038 | 0.0003 | 0.0118 |
| PF-M02 | first `gloss()` on a fresh runtime (shard cache cold, file read from disk) | 20 | 1.92 | 5.56 | 1.58 | 6.30 |
| PF-M03 | a second `gloss()` on the same runtime | 20 | 0.892 | 1.21 | 0.670 | 1.24 |
| PF-M04 | `parseSelection` "librin", 1 word, sentence context (warm, 10 warm-up runs) | 50 | 0.192 | 0.342 | 0.127 | 1.19 |
| PF-M05 | `parseSelection`, 4-word phrase | 50 | 0.119 | 0.170 | 0.109 | 0.184 |
| PF-M06 | `parseSelection`, 40-word sentence (all 40 selected) | 50 | 0.577 | 1.02 | 0.507 | 3.94 |

Cold rows come from `cold-run.mjs` (12 fresh `node` processes each; scripts in "Reproduce"). They exclude Vite/vitest transform time (a first import through `vite-node` took 10.9 s because it transforms TypeScript; that is a dev-tool cost, not a user cost).
**Reading:** warm lookups are far below any perceptible threshold. The cost a learner can feel is the **first** lookup of a page: about 37 ms to load the bundle (cold-1 minus cold-0) + 73 ms for the first parse + 18 ms for the first gloss (disk here; over the network it is a fetch of a 27 KB shard) ≈ 130 ms on this 24-core PC, several times that on a phone. See PF-01.

### 1.2 Time to first useful linguistic response (parse + the 5-layer card build)

The card is built by `createCardUI().show()` in `packages/golearn-extension/src/popup/card.ts`, which is callable in jsdom. What is timed is **parseSelection + show()** (rows, the four layer panels, the pronunciation note, the correction form). jsdom has no layout, no paint and no stylesheet engine: browser start-up of the content script, shadow-root style application, layout and paint are not included (see section 4).

| id | what is timed | N | median | p95 | min | max |
|---|---|---:|---:|---:|---:|---:|
| PF-M07 | parse + card build, 1 word "librin" | 50 | 1.60 | 2.47 | 1.20 | 2.97 |
| PF-M08 | parse + card build, 4-word phrase | 50 | 1.15 | 1.46 | 0.967 | 1.81 |
| PF-M09 | parse + card build, 40-word sentence | 50 | 2.34 | 2.94 | 2.10 | 3.52 |
| PF-M16 | the dictionary gloss arriving late: `ui.update({ gloss })` (rows and panels re-filled) | 30 | 0.732 | 1.64 | 0.648 | 1.75 |
| PF-M17 | opening one layer (button click, panel shown, reposition), mean of 4 clicks per card | 30 | 0.102 | 0.165 | 0.075 | 0.199 |

Of PF-M07 the parse is 0.27 ms and the card build 1.33 ms (medians). The card never waits for the dictionary: the gloss arrives later through `update()`.

### 1.3 Repository writes

| id | what is timed | N | median | p95 | min | max |
|---|---|---:|---:|---:|---:|---:|
| PF-M10 | write **1 event**, in-process (`POST /events` handler: auth, validate, store, incremental projection, response) | 100 | 0.653 | 0.925 | 0.474 | 2.81 |
| PF-M11 | write a **batch of 100** events, in-process | 20 | 9.47 | 13.1 | 6.27 | 13.2 |
| PF-M12 | write 1 event, **HTTP**, server inside the test process (SQLite `:memory:`) | 100 | 15.1 | 18.7 | 5.50 | 25.8 |
| PF-M13 | write a batch of 100, HTTP, in-test server | 20 | 23.5 | 33.4 | 16.9 | 38.9 |
| PF-M14 | write 1 event, **HTTP, separate `main.ts` process** (SQLite file) | 100 | 15.4 | 24.8 | 4.12 | 32.8 |
| PF-M15 | write a batch of 100, HTTP, separate process | 20 | 26.8 | 37.6 | 15.2 | 42.1 |
| PF-M18 | the HTTP floor: `fetch` to a bare node:http hello server (no Repository code) | 100 | 18.1 | 44.6 | 3.07 | 47.7 |

A batch of 100 over HTTP costs 1.6× to 1.7× one event, so batching makes an event ~64× cheaper over HTTP (15.1 ms vs 0.235 ms each) and ~7× cheaper in-process (0.653 ms vs 0.095 ms each). The service's own share of an HTTP write is the difference to the floor, which is within noise.

### 1.4 Projection (`projection@1`)

Events are mixed `SelectionLookedUp` (60 %) and `CardReviewed` (40 %) over 300 lemma units. "Rebuild" = `engine.rebuild()`: read the log, resolve aliases, fold, write the rows and the cursor. "Pure fold" = `observationsFromEvents` + `foldObservations` on events already in memory. "Incremental" = `engine.project()` after **one** new event.

| id | what | store | log size | N | median | p95 | min | max |
|---|---|---|---:|---:|---:|---:|---:|---:|
| PF-M20 | rebuild | memory | 1k | 7 | 9.73 | 11.7 | 9.14 | 11.7 |
| PF-M21 | rebuild | memory | 10k | 5 | 66.7 | 73.1 | 65.4 | 73.1 |
| PF-M22 | pure fold | memory | 1k | 7 | 2.12 | 3.03 | 1.84 | 3.03 |
| PF-M23 | pure fold | memory | 10k | 5 | 23.8 | 27.1 | 22.1 | 27.1 |
| PF-M24 | **incremental, 1 event** | memory | 1k | 20 | 5.72 | 6.45 | 5.31 | 7.08 |
| PF-M25 | **incremental, 1 event** | memory | 10k | 20 | 43.8 | 46.5 | 42.7 | 46.6 |
| PF-M26 | rebuild | SQLite | 1k | 7 | 7.20 | 8.12 | 7.00 | 8.12 |
| PF-M27 | rebuild | SQLite | 10k | 5 | 47.8 | 49.2 | 47.1 | 49.2 |
| PF-M28 | pure fold | SQLite | 1k | 7 | 1.76 | 2.83 | 1.70 | 2.83 |
| PF-M29 | pure fold | SQLite | 10k | 5 | 21.2 | 23.7 | 20.7 | 23.7 |
| PF-M30 | **incremental, 1 event** | SQLite | 1k | 20 | 4.09 | 4.88 | 3.94 | 5.35 |
| PF-M31 | **incremental, 1 event** | SQLite | 10k | 20 | 31.3 | 33.7 | 28.6 | 33.7 |

The pure fold is linear and cheap (≈ 2 µs per event). The incremental step is **not** cheap relative to its job: it re-reads the learner's whole log (`engine.ts`: "one scan of the learner's log per call that has new events (O(N))"), so one new event on a 10k log costs 31 ms. Larger logs, from the scale probe `scale.mts` (SQLite, one run of rebuild; incremental median of N=9 each):

| events in the log | rebuild | incremental, 1 event: median (min–max) |
|---:|---:|---:|
| 10,009 | 59 | 31.9 (30.3–85.1) |
| 50,018 | 267 | 162.7 (155.5–198.8) |
| 100,027 | 526 | 323.2 (309.6–371.5) |

### 1.5 Review: cards for 200 units, one answer

Setup (not timed): a learner who looked up 300 distinct lemma units twice each (units as GoLearn's parser derives them); the Repository returned 200 candidates, all testable; cards are made for those 200.

| id | what is timed | mode | N | median | p95 | min | max |
|---|---|---|---:|---:|---:|---:|---:|
| PF-M70 | `GET /candidates?limit=300`, first (cold) run | in-process | 1 | 7.58 | | | |
| PF-M71 | candidates + **intake of 200** with pack facts (`gatherCandidates`), warm | in-process | 5 | 183 | 190 | 176 | 190 |
| PF-M72 | build + validate 200 `CardAdded` events | in-process | 5 | 0.963 | 1.64 | 0.816 | 1.64 |
| PF-M72b | write the 200 cards (2 × `POST /events` of 100) | in-process | 1 | 21.3 | | | |
| PF-M73 | build the next exercise (`runner.current`) | in-process | 30 | 0.118 | 0.141 | 0.103 | 2.94 |
| PF-M74 | **submit one answer** (`runner.answer`: grade, schedule, evidence event, validate, `POST /events`) | in-process | 30 | 6.69 | 9.34 | 5.62 | 10.1 |
| PF-M75 | `GET /candidates`, first (cold) run | HTTP, in-test server | 1 | 31.5 | | | |
| PF-M76 | candidates + **intake of 200**, warm | HTTP, in-test server | 5 | **3,180** | 3,230 | 3,130 | 3,230 |
| PF-M77 | build + validate 200 `CardAdded` events | HTTP, in-test server | 5 | 1.52 | 1.96 | 1.21 | 1.96 |
| PF-M77b | write the 200 cards (2 × `POST /events`) | HTTP, in-test server | 1 | 60.7 | | | |
| PF-M78 | build the next exercise | HTTP, in-test server | 30 | 0.155 | 1.99 | 0.111 | 23.7 |
| PF-M79 | **submit one answer** | HTTP, in-test server | 30 | 17.9 | 30.2 | 14.3 | 31.1 |

Creating 200 cards from candidates is cheap (build 1 ms + write 21 ms in-process). The intake is what costs: it makes **201 sequential service requests** for 200 candidates (one `GET /units/:id` per testable candidate through `repositoryLookup`, plus one `/knowledge` batch). In-process that is 0.9 ms per candidate; over HTTP on this PC it is 15.8 ms per request, 3.18 s in all. See PF-02 (**fixed 2026-10-09**: the same intake now makes 5 requests; the table rows above are the audit's original measurement, the re-measurement is in the PF-02 row and below).

**Re-measurement after the PF-02 fix** (same test, `test/audit/perf.service.test.ts`, same PC, N = 5 warm runs of the intake of 200 candidates with pack facts, medians; one run, loopback, not an average over days):

| row | before | after |
|---|---:|---:|
| service requests per intake | 201 | **5** (1 `/knowledge` + 4 x `POST /units/batch` of 50) |
| PF-M76 intake of 200, HTTP in-test server (median / p95) | 3,180 ms / 3,230 ms | **222 ms / 259 ms** (min 215, max 259) |
| PF-M71 intake of 200, in-process (median / p95) | 183 ms / 190 ms | **139 ms / 146 ms** (181 ms in another run of the same code: the in-process figure moves with machine load, the request count does not) |

The test now asserts at most `1 + ceil(candidates / 50)` requests per intake, and that `POST /units/batch` returns exactly what `GET /units/:id` returns, with unknown ids in `missing`.

### 1.6 Audio start-up (fakes for the browser ports)

Device TTS and `HTMLAudioElement` cannot be measured in node. What is timed is GoListen's own path with a fake `AudioPort` and a fake `speechSynthesis`.

| id | what is timed | N | median | p95 | min | max |
|---|---|---:|---:|---:|---:|---:|
| PF-M60 | recorded clip: `pronounce({ autoplay })` until the clip's `play()` is called (demo recording registry) | 50 | 0.0037 | 0.0257 | 0.0033 | 0.0313 |
| PF-M61 | recorded clip: until the `play()` promise has resolved (one more microtask turn) | 50 | 0.0099 | 0.0369 | 0.0091 | 0.0621 |
| PF-M62 | device voice: `pronounce({ autoplay })` until `speechSynthesis.speak()` is called | 50 | 0.0057 | 0.0181 | 0.0050 | 0.0369 |

GoListen adds well under a hundredth of a millisecond. The time to first sound is the browser's: decode of the clip, or the voice engine's start-up. **Not measurable here: "measured separately in the browser walk"** (see section 4).

### 1.7 GoTell feedback latency

`createAnalyzer().analyzeDraft` (detect, corrections, checker validation) with the real Albanian pack runtime, warm, 3 untimed warm-up runs.

| id | what is timed | N | median | p95 | min | max |
|---|---|---:|---:|---:|---:|---:|
| PF-M40 | `analyzeDraft`, 2 sentences | 20 | 0.144 | 0.186 | 0.116 | 0.188 |
| PF-M41 | `analyzeDraft`, 10 sentences | 20 | 0.568 | 0.685 | 0.439 | 0.769 |

### 1.8 Sync

`SyncClient.push()` flushes a queue of 500 events in batches of 200 (3 `POST /sync/push`) over a loopback socket to the real service, then the queue is empty. Each of the N=5 flushes uses a fresh queue and fresh event ids.

| id | what is timed | N | median | p95 | min | max |
|---|---|---:|---:|---:|---:|---:|
| PF-M80 | flush 500 queued events, HTTP, in-test server | 5 | 82.8 | 115 | 59.8 | 115 |
| PF-M82 | flush 500 queued events, HTTP, **separate `main.ts` process** | 5 | 99.9 | 133 | 84.8 | 133 |
| PF-M81 / M83 | enqueue 500 events locally (validate + persist each), in-memory area (not `chrome.storage`) | 5 | 5.76 / 5.08 | 7.15 / 5.46 | 5.62 / 5.05 | 7.15 / 5.46 |

That is about 6,000 events/s (in-test) and 5,000 events/s (separate process) on this PC; 3 requests × the HTTP floor ≈ 45–55 ms of the 83–100 ms.

### 1.9 Built artefacts (not built here; read as they stood)

`packages/golearn-extension/dist/` **exists**; it was rebuilt by another session at 09:42 while this audit ran (the content script changed from 451 KB to 453.5 KB between my two reads), so these are the sizes at the final run. Measured with `dist-sizes.mjs` (file sizes on disk and `gzip`).

| artefact | size | gzip |
|---|---:|---:|
| `dist/` as a whole (268 files) | 7,527 KB | 2,085 KB |
| of which the Albanian dictionary (257 files under `app/dict/sq`) | 5,985 KB | 1,571 KB |
| of which everything else (11 files) | 1,542 KB | 514 KB |
| `content.js` (injected into the pages) | 453.5 KB | 153.5 KB |
| `background.js` (service worker) | 484.8 KB | 159.9 KB |
| `app/app.js` (setup application) | 572.8 KB | 188.1 KB |
| `action/popup.js` | 15.6 KB | 5.6 KB |
| `packages/golearn-extension/dist-web/` (web build of the setup app; 262 files) | 6,567 KB | 1,763 KB |
| `packages/gopractice/dist/` (262 files; main bundle 815.7 KB, 264.7 KB gzip) | 6,809 KB | 1,839 KB |

The same dictionary (5,985 KB) is carried by each of the three artefacts.

## 2. Findings

| id | severity | what | evidence | suggested fix |
|---|---|---|---|---|
| PF-01 | low | The **first** lookup after a page loads pays ~37 ms to load the bundle, ~73 ms for the adapter's lazy initialisation inside the first `parseSelection`, and ~18 ms for the first gloss (disk here). Every later lookup costs 0.1 to 0.6 ms. On a phone this first cost is several times larger. | cold-1 … cold-4 (12 fresh processes); PF-M04 | warm the adapter when the content script is idle after injection (`requestIdleCallback`, one parse of a fixed word and one gloss), so the first real lookup finds it ready; keep the card first-paint independent of the gloss (it already is) |
| PF-02 | **medium, FIXED 2026-10-09** (`POST /units/batch` in `repository-service/src/handler.ts`, `RepositoryApi.units`, `goreview/src/facts/provider.ts` `repositoryLookup(...).prime`, `goreview/src/intake/fetch.ts`; 201 -> 5 requests, 3,180 -> 222 ms over HTTP, N = 5) | GoReview intake does an **N+1**: for 200 candidates it sends 201 sequential requests (`GET /units/:id` per testable candidate). In-process it costs 0.9 ms per candidate; over HTTP it costs one round trip each: 3.18 s on this PC (15.8 ms per request, which is the PC's loopback floor), and it grows linearly with the candidate count and with the network round-trip time. | PF-M71 vs PF-M76; request counter in `perf.service.test.ts` ("201 service requests per intake") | one batched read (`GET /units?ids=…` or the facts for many units in one call), or at least bounded parallelism (e.g. 6 in flight); the default `DEFAULT_CANDIDATE_LIMIT` of 40 keeps today's cost at ≈ 40 × 15.8 ms ≈ 0.65 s (arithmetic from the measured per-request cost) |
| PF-03 | low (grows with use) | The **incremental projection is O(N) in the length of the learner's log**: one new event costs 4.1 ms on a 1k log, 31 ms on a 10k log, 163 ms on 50k, 323 ms on 100k (SQLite). It runs on the write path (`POST /events` answers `projected: true`), so every write gets slower as a learner's history grows. Already documented in `engine.ts`; measured here. | PF-M24/M25/M30/M31, scale probe | the store-side unit index / reverse alias lookup that the comment in `engine.ts` names; until then fold only the touched units' events (`store.list({ unitId })`) when no alias or tombstone changed |
| PF-04 | info | Every request over HTTP costs ≥ 15 ms on this PC before any Repository code runs (bare Node `fetch` to a hello server: 15–18 ms; `http.get` with keep-alive: 7 ms). Not a product defect; it makes one-event-at-a-time writes look 23× slower than in-process and is the reason batching matters. | PF-M18, `http-probe.mjs`, `http-baseline.mjs` | none for the product; clients should keep batching (the sync client already pushes 200 per request) |
| PF-05 | info | The extension is 7.5 MB, 80 % of it the same 6 MB Albanian dictionary that `dist-web` and `gopractice/dist` also carry; `content.js` is 453.5 KB (153.5 KB gzip) evaluated in every page where GoLearn is enabled. Nothing here is slow; it is install size and per-page parse cost, whose browser cost is unmeasured. | section 1.9 | consider injecting a smaller content script and keeping the adapter in the service worker, or lazy-loading the adapter on first selection |

No finding blocks use: warm lookups, card builds, GoTell feedback, review creation and answer submission are all under 25 ms in-process, and under 100 ms for a single answer over HTTP.

## 3. How to reproduce

```
cd /c/Users/CJWal/dev/go-v0
npx vitest run test/audit/perf.engine.test.ts test/audit/perf.service.test.ts test/audit/perf.card.test.ts --no-file-parallelism
# include the separate-process rows:
npx vite-node packages/repository-service/src/main.ts --port 8791 --data <dir> --host 127.0.0.1     # background
PERF_SERVICE_URL=http://127.0.0.1:8791 PERF_ROWS_DIR=<dir>/rows npx vitest run test/audit/perf.service.test.ts
# stop it afterwards: netstat -ano | grep ":8791", then taskkill //PID <pid> //F
```

| lane | file | covers |
|---|---|---|
| 1 | `test/audit/perf.engine.test.ts` (12 tests) | PF-M01..M06, M20..M31, M40..M41, M50..M52, M60..M62 |
| 2 | `test/audit/perf.service.test.ts` (6 tests; 8 with `PERF_SERVICE_URL`) | PF-M10..M15, M18, M70..M83 |
| 3 | `test/audit/perf.card.test.ts` (4 tests, jsdom) | PF-M07..M09, M16..M17 |
| support | `test/audit/perf.support.ts` | statistics, rows, the service in-process and over HTTP, sign-up, event builders |

Scripts used for the rows that need a fresh process or a large log (kept in the audit session's scratchpad, not in the repository; each is short):
`cold-entry.ts` (bundled with `node_modules/.bin/esbuild --bundle --platform=node --format=esm`: imports `createPackRuntime`, `packFor`, `parseSelection`; records `performance.now()` after the imports, then times `createPackRuntime`, the first `parseSelection`, the first and a second `gloss` against `public/`), `cold-run.mjs` (runs a script in 12 fresh `node` processes and prints median / p95 / min / max of every timing), `empty.mjs` (the empty-process floor), `scale.mts` (`vite-node`: seeds 10k / 50k / 100k events in a SQLite store and times `engine.rebuild` and `engine.project` after one new event, N=9), `http-probe.mjs` and `http-baseline.mjs` (200 `fetch` / `http.get` requests to the service and to a bare hello server), `dist-sizes.mjs` (file and gzip sizes of a dist folder).

## 4. Not measurable here (cells left for the browser walk)

"Measured separately in the browser walk." These need a real browser; the coordinator fills the cells.

| item | what to record | why not here |
|---|---|---|
| extension start-up | service worker cold start to first message handled; content-script injection to "ready"; time from the toggle in the action popup to the first lookup being possible | no Chrome, no service worker lifecycle in node |
| popup rendering | action popup open to first paint; first paint of the lookup card after a selection (layout, shadow-root style application, paint); card re-position after layer open | jsdom has no layout or paint; PF-M07..M09 measure only the JavaScript |
| audio start-up | time from the "Pronounce" press to first sound with a real `HTMLAudioElement` clip and with the device's `speechSynthesis` voice | device TTS and audio decode do not exist in node; PF-M60..M62 time GoListen only |
| first-lookup cost in a page | cold-1…cold-4 as they appear in Chrome DevTools "Performance" on a throttled CPU (4× and 6×) | node on a 24-core PC is not a phone |
| memory | JS heap after 100 lookups; service worker memory with a 10k-event queue | not instrumented |
| network | the same rows with a remote service and 50–150 ms round trips (PF-02 scales with it) | loopback only |

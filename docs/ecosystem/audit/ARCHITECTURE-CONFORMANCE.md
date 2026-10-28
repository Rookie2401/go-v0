# Architecture conformance audit

Date: 2026-10-09. Tree: `master` with sibling sessions' uncommitted edits in the working tree (the audit reads the files
as they were between 09:15 and 09:40; the tests re-read them on every run).

This is an engineering record of what the code does today, checked by a static import-graph analysis. It says nothing
about legal status. The product rules it is checked against are `GO-ECOSYSTEM-CHARTER.md` (binding principles 1-15, §3)
and `LEGACY-SALVAGE-AUDIT.md` (classes KEEP / ADAPT / REBUILD / RETIRE / QUARANTINE).

**Brief section 13 is not in the repository.** The "normal operation must not require" checklist in section 6 is
therefore derived from the audit task's five rules (a)-(e) and from charter principles 1-15; each line says which. If the
brief's own list differs, the lines need re-mapping.

## 1. Method

* `test/audit/conformance.support.ts` parses every reachable `.ts/.tsx/.mts/.js` file with the TypeScript parser and collects
  every static `import`, `export ... from`, `import()` (dynamic, literal), `require()`, `import type`, `import("x")` type,
  `new URL('x', import.meta.url)` and `import.meta.glob('x')`. Relative specifiers are resolved to `.ts/.tsx/.mts/.js/.mjs/.json`
  and `index.*`; bare specifiers (node_modules) and `node:*` are recorded as externals and not followed. The repo has no path
  alias, so there is nothing else to resolve. Nothing is executed.
* Two reach sets per entry. **runtime**: edges that survive compilation (everything except `import type`, type-only
  `export`, and `import("x")` types). **full**: every edge, including erased type imports. The forbidden rules are asserted on
  *runtime* strictly; the *full* graph is asserted to differ from it only through the two known type-only edges (defect C-01).
* Entry points (verified against `manifest.json`, `vite.config.ts` and the two `index.html` files by the first test):

  | id | file | what it builds |
  |---|---|---|
  | golearn-background | `packages/golearn-extension/src/background/index.ts` | `dist/background.js` (MV3 service worker) |
  | golearn-content | `packages/golearn-extension/src/content/index.ts` | `dist/content.js` |
  | golearn-popup | `packages/golearn-extension/action/popup.ts` | `dist/action/popup.js` |
  | golearn-app | `packages/golearn-extension/app/main.ts` | `dist/app/app.js` (options page) and `dist-web/` (hosted setup page) |
  | gopractice | `packages/goreview/app/main.ts` | `packages/goreview/app/dist/` |
  | repository-service | `packages/repository-service/src/main.ts` | Node service (dynamic imports followed) |
  | gotell (package index) | `packages/gotell/src/index.ts` | no build of its own: hosted by the GoPractice shell |

* Run: `npx vitest run test/audit/conformance.imports.test.ts test/audit/conformance.structure.test.ts`
  (`AUDIT_PRINT=1` prints each entry's reached `src/` set). Companion: `test/audit/rights.dist.test.ts` (built folders).
  Existing tests not repeated: `test/ecosystem/boundaries.test.ts` (literal import strings per package, 7 tests) and
  `test/gotell/boundary.test.ts` (GoTell's literal imports).

## 2. The two applications and the shared infrastructure, as wired

```
GoLearn  (one application, one package: packages/golearn-extension)
  background  ──► golearn-extension (18 files) · language-packs (15) · repository-sync (6) · repository-contract (5)
                  · repository-service/src/{api,deps,handler}.ts (3, typed client; see C-02) · legacy src/ (103 incl. type-level)
  content     ──► golearn-extension (19) · golisten (8: device provider only) · repository-contract (5) · legacy src/ (97)
                  (no sync, no service, no packs runtime: it only sends messages to the background)
  popup       ──► golearn-extension (9) · repository-contract (5)         (no legacy src/, no GoListen)
  setup app   ──► golearn-extension (34) · language-packs (16) · repository-service api client (3) · repository-contract (5) · src/ (103)
                  · since 2026-10-09 (no account needed): repository-local, which brings repository-store, -engine and -linguistics with it;
                    inside the extension the app only connects to the worker's device-local Repository (connectLocalRepository), and the
                    hosted copy opens one of its own through a lazy chunk the options build leaves out

GoPractice  (one application: packages/goreview/app, the shell)
  main.ts     ──► gopractice (33) · goreview (41) · gotell (38) · golisten (16) · language-packs (16) · repository-sync (6)
                  · repository-service api client (3) · repository-contract (5) · ts-fsrs (external) · legacy src/ (103)
                  · since 2026-10-09: repository-local (and through it store, engine, linguistics) for the extension page's device mode
                  GoReview and GoTell meet only in the shell.

Shared infrastructure (not applications)
  repository-contract  imports nothing
  golisten             → contract
  language-packs       → contract · legacy src/{adapters,core,dict}
  repository-sync      → contract
  repository-service   main.ts → store · engine · linguistics (dynamic imports) · contract · legacy src/ (97)
  repository-store / -engine / -linguistics → contract only (linguistics also src/adapters + src/core)
```

Enforced by `conformance.structure.test.ts`:

* "(c) exactly two application entry groups": the groups are `golearn-extension` (four entries, one package) and `gopractice`,
  plus the service. Only `golearn-extension`, `gopractice` and `controlled-reader` contain a page, manifest or popup; the
  last is a README-labelled PROTOTYPE that no entry reaches. `goreview`, `gotell`, `golisten`, `language-packs` and all
  `repository-*` libraries have no page, manifest or `main.ts`.
* "what each entry may reach (exact package sets)": each entry reaches exactly the package set above. No app reaches
  `repository-store`, `repository-engine` or `repository-linguistics`; of `repository-service` apps reach only
  `api.ts`, `deps.ts` and `handler.ts`; the service reaches no app, GoListen, pack or sync client; the content script
  reaches no service, sync, store, engine, linguistics or pack runtime; only the content script reaches GoListen, and
  only its device provider (no remote, recorded or audio-file provider, no assessment mode).
* "shared packages never reach an application, the service, the store or the engine (transitively)": for
  `repository-contract`, `golisten`, `language-packs`, `repository-sync` (all their files used as roots), plus the three
  packages below the service. This is the transitive closure; `boundaries.test.ts` checks the literal import strings only.

## 3. The forbidden list (legacy course modules) and why each is on it

Derived from the directories of `src/` (539 `.ts/.tsx` files in 21 directories) against the charter and the salvage audit.
Every top-level entry of `src/` is either forbidden or allow-listed; a new unclassified directory fails the first test of
section (a).

| prefix | files | what it is | why forbidden (source) |
|---|---|---|---|
| `src/ladder/` | 10 | graded reading ladders, learner path, placement (633 units in `data/ladder`) | principle 9; salvage audit §2, §3.C RETIRE |
| `src/stage0/` | 13 | Stage 0 onboarding packs, sound tables, exit tests | principle 9 (no Stage 0-B2 curriculum); §3.C RETIRE |
| `src/course/` | 20 + 4 json | course definitions per language, curriculum policy, course progression, catalogue, doors, vocabulary ownership per course, reading bridges | principle 9; §2 "one course per learner"; §3.C RETIRE |
| `src/library/` | 11 | bundled literary library, shelves, sentence index, canon | principle 8 (no giant bundled literary corpus); §3.D |
| `src/authoring/` | 8 | unit authoring tooling for the ladders | §3.C RETIRE |
| `src/sim/` | 7 | learner simulation over the retired course | §3.C RETIRE |
| `src/ui/` | 89 | legacy React course UI: Home, Path, Library, Scripture, Course, Curriculum, Reader | §3.C RETIRE / REBUILD; Scripture UI is `src/ui/scripture` |
| `src/app/`, `src/main.tsx` | 1 + 1 | legacy single-page app shell and entry | the old product's entry |
| `src/goread/` | 4 | device-local identity (`u-local`), team text-sharing client | §3.B RETIRE |
| `src/golisten/` | 24 | retired course-audio pipeline bound to a bundled audio corpus | `packages/golisten/README.md`: nothing there depends on it |
| `src/ingest/` | 17 | corpus importer; globs the bundled corpus; plans library documents | §3.D; the KEEP-classed personal-copy importers (4 files) are reached only from the controlled-reader prototype |
| `src/bench/` | 33 | gold-set and benchmark tooling over the retired corpus | dev asset, never product |
| `src/db/`, `src/backup/` | 1 + 6 | Dexie database and IndexedDB backup of the old app | §3.B ADAPT: replaced by the Repository store and export |
| `src/golearn/` | 35 | legacy learner model bound to bundled texts and ladders | §3.B: lifted to 2GoLearn / Repository engine |
| `src/gotell/` | 19 | legacy GoTell bound to the course testimony | §3.C ADAPT: pieces copied into `packages/gotell/src/salvage` |
| `src/alphabet/` | 4 | Stage 0 alphabet trainers | belongs to the retired Stage 0 |

Retired data (a reached module must not import or glob any of it): `data/corpus/` (147 files), `data/ladder/` (730),
`data/stage0/` (170), `data/sources/` (1,036), `data/verified/` (`scripture.json`, four Bibles), `data/review/` (139),
`public/library/` (12,634). "Embedded Scripture" is `data/verified/scripture.json`, `data/sources/{de,es}-bible`, the two
`*_usfm.zip` archives, `src/ui/scripture` and `src/course/{bibleAccess,scriptureIntegrity}.ts`.

**Allow-list (salvage)**, the only parts of `src/` that may be reached: `src/adapters/**` (the `sq`, `es`, `de`, `hi`, `th`, `nb`,
`nn` analysers, their lexicons/morphology, `shared.ts`, the registry `index.ts`), `src/core/**` (adapter contract, token/analysis
types, item ids) and `src/dict/**` (dictionary format, sharded loader, mapper). Test "allow-list entries exist on disk and
none sits inside a forbidden prefix" keeps the list confined to pure language analysis.

## 4. Results

### (a) No entry reaches the retired course

| entry | runtime files | runtime forbidden | full files | full forbidden (type-level) |
|---|---|---|---|---|
| golearn-background | 109 | **0** | 151 | 17 |
| golearn-content | 91 | **0** | 130 | 17 |
| golearn-popup | 10 | **0** | 14 | 0 |
| golearn-app | 120 | **0** | 162 | 17 |
| gopractice | 220 | **0** | 262 | 17 |
| repository-service | 89 | **0** | 127 | 17 |
| gotell (package index) | 132 | **0** | 174 | 17 |

No compiled import reaches a forbidden module or a retired data file; no `import.meta.glob` exists in any reached file; no
entry reaches the legacy `src/main.tsx`, the root `index.html` or `server/`. The detector is proven live by a negative
control: started from the legacy entry `src/main.tsx`, the same graph finds `src/course`, `src/ladder`, `src/library`,
`src/stage0`, `src/ui/scripture`, `src/ingest` and a bundled-data `import.meta.glob`.

**Defect C-01 (low, type-level only): `src/core` leaks the course's types into every package compile.** Two erased
`import type` edges pull the retired course definitions into the *type graph* of every entry that touches `src/core`:

```
src/core/model.ts   : import type { CurriculumMetadata } from '../course/curriculumPolicy'   (line 19)
src/core/course.ts  : import type { StageContract }      from '../course/curriculumPolicy'   (line 10)

chain, from the content script:
  packages/golearn-extension/src/content/index.ts
  -> src/adapters/sq.ts -> src/core/index.ts -> src/core/model.ts -> src/course/curriculumPolicy.ts
chain, from GoPractice:
  packages/goreview/app/main.ts -> packages/goreview/src/index.ts -> packages/goreview/src/facts/index.ts
  -> packages/goreview/src/facts/provider.ts -> src/core/index.ts -> src/core/model.ts -> src/course/curriculumPolicy.ts
chain, from the service:
  packages/repository-service/src/main.ts -> packages/repository-linguistics/src/index.ts
  -> packages/repository-linguistics/src/resolver.ts -> src/core/index.ts -> src/core/model.ts -> src/course/curriculumPolicy.ts
```

Beyond `curriculumPolicy.ts` the type graph holds 12 `src/course/*.ts` files (per-language course definitions, reading
bridges, catalogues) plus 4 `src/course/*-works.json` and `data/sources/course-library/nb.json`. Effect: none at run time
(runtime reach is 0 and the dist scan finds no course text or title, see `RIGHTS-AND-ATTRIBUTION.md`); the compiler has to
type-resolve the course for any package that imports a language adapter. The salvage audit (§3.A) already lists the cure:
extract the type slice into a `language-pack-types` module. The test pins the leak to exactly these two edges and requires
both to stay `import type`; a third edge, or either edge turning into a value import, fails the test. Not fixed here (source
edits were out of scope).

### (b) Every legacy module that is reached is on the allow-list

Reached `src/` modules, identical for every entry that touches a language pack (counts per entry in section 5):

* **runtime, 67 modules across all entries**: `src/adapters/sq.ts`, `src/adapters/es.ts`, `src/adapters/shared.ts`;
  `src/adapters/albanian/` 36 of 37 files (`analyze, clitics, constructions, describe, disputed, function-article,
  function-build, function-minor, function-pronouns, function-words, gheg, historical, lexicon-ladder, lexicon-modifiers,
  lexicon-nouns, lexicon-verbs, morph-adjective, morph-noun, morph-verb, morph-verb-guess, morphology, orthography, phrases,
  production, sentence, sentence-clause, sentence-core, sentence-little, sentence-look, sentence-names, sentence-perfect,
  sentences, tags, types, varieties, version`; only `overrides.ts` is not reached);
  `src/adapters/spanish/` all 22 files (`morph-clitics, morph-nominal, morph-orth, morph-verbcands, morphology, entries,
  lexicon-verbs, lexicon-nouns, lexicon-modifiers, lexicon-course, function-words, regional, varieties, historical, phrases,
  constructions, sentences, disambiguate, verb-irregular, verb-regular, verb-stem, verbs`); `src/dict/{index, build, format,
  frequency, map, sharded}.ts`.
* **type level only, 20 modules (all of `src/core/`)**: `index, model, course, variety, ids, events, adapters, store, memory,
  bus, config, testing` and `contracts/{golearn, golisten, gotell, course, lexicon, library, stage0, gotell-practice}`.
  Compiled into no bundle.

All of these are on the allow-list (tests "every src/ module reached by a compiled import is allow-listed" and "every
non-forbidden src/ module reached at type level is allow-listed", per entry, plus the union). Which allow-list prefixes are
**wired** and which are **allowed but unreached** is pinned by "records which allow-listed prefixes are wired": `de, hi, th,
nb, nn` and their rule directories are unreached, deliberately (they are the planned packs); the test fails the day one
becomes reachable so that `LEGACY-SALVAGE.md` is updated. Doors into `src/` are confined to `golearn-extension` (the
parser), `language-packs`, `goreview` (facts provider, types) and `repository-linguistics`.

**Flag C-03 (in between).** Two compiled-in modules are named after the retired course: `src/adapters/albanian/lexicon-ladder.ts`
(616 lines; the word list the Albanian ladder plan teaches, 271 + about 160 entries, compared with Wiktionary) and
`src/adapters/spanish/lexicon-course.ts` (68 lines; ordinary words found missing from the course texts). Both are pure
data inside their adapter directory (no imports outside it, no third-party import). They are word lists, not curriculum, and
they are why the analyser reads ladder-era vocabulary; they also carry the share-alike question Q1 of
`RIGHTS-AND-ATTRIBUTION.md`. The test requires that these two are the *only* compiled-in modules with a course-like name.
Four contract files named for the course (`src/core/course.ts`, `src/core/contracts/{course,library,stage0}.ts`) are reached only as erased types.

### (c) Two application groups, shared packages clean

See section 2. All assertions hold. Observation **C-02**: every app reaches `repository-service/src/handler.ts` and `deps.ts`
at *source* level, because `api.ts` imports `handle` for `createInProcessApi`. The extension build replaces `./handler` with
a stub (`stubServiceHandler` in `packages/golearn-extension/vite.config.ts`); the two web builds do not, but the bundler
drops the unused function: the built `app.js`, `background.js`, `content.js` and GoPractice's bundle contain neither the handler
string `too-deeply-nested` nor the stub message. No change needed; noted because the package README says "nothing imports the
service except tests and `main.ts`".

### (d) GoTell reaches no GoReview module

`packages/gotell/src/index.ts` reaches 174 files in `gotell`, `repository-contract`, `repository-service` (api client),
`language-packs`, `repository-sync` and legacy `src/` allow-list modules. It reaches no `goreview`, `gopractice`,
`golearn-extension` or `controlled-reader` file, and none of the legacy `src/gotell`, `src/goread`, `src/golearn` (its
salvage was copied into `packages/gotell/src/salvage`, not imported). The converse holds for `packages/goreview/src/index.ts`
(no `gotell`). Inside the shell's closure no file of `goreview` imports `gotell` or the reverse.

### (e) No commercial ebook provider code

Scanning identifiers and string literals (comments excluded) of the 335 TypeScript files in the union of everything reached (340 files with the JSON):
`kindle`, `amazon`, `read.amazon`, `kobo`, `overdrive`, `bookshout`, `readium` and `@amzn/@kobo` packages match in exactly two
files, and both are refusals:

* `packages/golearn-extension/src/adapters/webGeneric.ts:35`: `DEFAULT_DECLINED_HOSTS = ['read.amazon.com', 'kindle.amazon.com', 'read.kobo.com']`,
  the list of hosts the generic web adapter **declines**.
* `packages/golearn-extension/app/surfaces.ts:35-42`: the setup page's compatibility table marks "Kindle" and "Other ebook readers
  (Kobo, Play Books, …)" **`not-supported`** with the reason.

The manifest declares no `host_permissions`, no `content_scripts` and no mention of a reader site. The only third-party
package any entry imports is `ts-fsrs` (GoReview scheduling) plus `node:*` builtins in the service; `package.json` declares no
ebook-provider dependency. `packages/controlled-reader` is not reached by any entry; its one external is `epubjs` (a generic
EPUB renderer) and it contains no provider string. It compiles in exactly four legacy modules, the DRM-refusing EPUB reader
and helpers: `src/ingest/{epub,plaintext,headings,quality}.ts`. Separately, no reached source names a language-model vendor,
SDK or endpoint (principle 13); the Azure Speech metadata in the GoListen registry is speech synthesis, dormant, and recorded
in the rights audit.

## 5. Reached `src/` set per entry

Run `AUDIT_PRINT=1 npx vitest run test/audit/conformance.imports.test.ts` for the file lists. Counts (non-forbidden `src/` files):

| entry | compiled in (runtime) | + type level only | forbidden, type level (C-01) |
|---|---|---|---|
| golearn-background | 67: sq.ts, es.ts, shared.ts, albanian 36, spanish 22, dict 6 | + core 20 | 12 `src/course` ts, 4 json, `nb.json` |
| golearn-content | 61: as above without `dict` | + core 20 | same |
| golearn-popup | 0 | 0 | 0 |
| golearn-app | 67 | + core 20 | same |
| gopractice | 67 | + core 20 | same |
| repository-service | 61 | + core 20 | same |
| gotell | 67 | + core 20 | same |

Union: 67 compiled in, 20 type-level core, 12 + 5 type-level retired = 104 `src/` or `data/` files out of 539 `src/` files; 440 `src/` files
are not reached by any app or service entry (4 of them, `src/ingest/{epub,plaintext,headings,quality}.ts`, by the controlled-reader prototype). `LEGACY-SALVAGE.md` classifies all 539.

## 6. Section 13 checklist: "normal operation must not require ..." (derived)

| # | normal operation must not require | basis | status | test or reason |
|---|---|---|---|---|
| 1 | the Stage 0-B2 curriculum, ladders, course progression | (a); principle 9 | **Verified** (compiled graph); type-level residue C-01 | `conformance.imports` "(a) ... reaches no forbidden legacy module ... through any compiled (runtime) import" (x7); `rights.dist` "contains none of the retired corpus, ladders, Stage 0 packs ..." (x3) |
| 2 | the bundled literary library or any retired corpus file | (a); principle 8 | **Verified** | same, plus "reaches no file under data/ or public/ at runtime and globs no data"; `rights.dist` "contains only the file kinds of a web build ..." |
| 3 | embedded Scripture | (a); task | **Verified** | `rights.dist` fingerprints of all four verified Bibles (every verse, every book as a run); 0 hits in 3 builds. Not verified: a user pasting Scripture text into a page |
| 4 | course vocabulary ownership (`src/course`) | (a) | **Verified at run time; type-level coupling open (C-01)** | `conformance.imports` "type-level reach ... confined to the two known type-only edges (defect C-01)" |
| 5 | a retired reading-ladder or a frequency list built from it | (a); rights R2 | **Verified** | `rights.dist` "contains no frequency list and no other word-count sidecar" (x3) |
| 6 | legacy modules outside the salvage allow-list | (b) | **Verified** | `conformance.imports` "(b) ..." (x7 entries + union) |
| 7 | more than two application entry groups | (c); principle 1 | **Verified** | `conformance.structure` "(c) exactly two application entry groups" |
| 8 | one application importing the other | (c); principles 1, 2 | **Verified** | `conformance.structure` "the two applications never reach each other ..." |
| 9 | an app reaching the store, engine or linguistics service | (c); GoRepository design | **Verified** | `conformance.structure` "no application reaches the store, the engine or the linguistic service ..." |
| 10 | GoReview for GoTell (and the converse) | (d); principle 7 | **Verified** | `conformance.imports` "(d) GoTell and GoReview are independent" (x4) |
| 11 | Kindle-specific code or a commercial ebook SDK | (e); principle 3 | **Verified** (two refusal sites listed) | `conformance.imports` "(e) no entry carries commercial ebook-provider code" (x7) |
| 12 | the controlled reader prototype being an app entry | (e) | **Verified** | `conformance.structure` "the controlled reader is a labelled prototype and no entry reaches it" |
| 13 | audio for GoLearn (text-first; GoListen optional) | principles 5, 6 | **Partly verified**: statically only the content script reaches GoListen, device provider only | `conformance.structure` "GoLearn needs no audio ...". Not verified: the card actually working with no voice at run time (no runtime trace in this audit; see `GOLEARN-TEST-REPORT.md`) |
| 14 | transmitting private passages to an external AI provider | principle 13 | **Partly verified**: no LLM vendor, SDK or endpoint in any reached source | `conformance.imports` "no entry names an external language-model provider". Not verified: the consent gate of GoTell's remote-assistance port at run time (`test/gotell*`, not re-run here) |
| 15 | bypassing DRM, bulk extraction, persistent copies of books | principles 10-12 | **Not verified by the conformance suite.** Static part only: no `content_scripts`, no `host_permissions` | covered by `test/extension/{store,bundle,security}.test.ts` and `test/controlled-reader` (the 56 controlled-reader tests passed when run here; the extension tests were not re-run) |
| 16 | a single-language architecture | principle 4 | **Not verified.** Two analysers are wired (sq, es); five are unreached planned packs | design review, not a graph property |
| 17 | claims of accuracy, proficiency, compatibility or rights clearance | principle 14 | **Not verified.** Editorial, not structural | `GOLEARN-ARCHITECTURE.md` §7 states the intent; surfaces.ts says Kindle is not supported |

## 7. Defects and flags

| id | severity | summary | status |
|---|---|---|---|
| C-01 | low | `src/core/{model,course}.ts` import types from `src/course/curriculumPolicy.ts`; the retired course's type graph (12 ts, 4 json, `nb.json`) is resolved by every package compile that touches a language adapter. Nothing is compiled in. | open; pinned by test |
| C-02 | info | apps reach `handler.ts`/`deps.ts` of the service at source level through `api.ts`; absent from built bundles | no action |
| C-03 | info | `lexicon-ladder.ts` (Albanian) and `lexicon-course.ts` (Spanish) are compiled-in word lists named after the retired course | flagged; share-alike question Q1 |
| C-04 | info | the repository's root `npm run build` still builds the legacy single-page app into the root `dist/`; no product entry reaches it | retained, unreachable |

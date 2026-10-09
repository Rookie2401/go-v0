# Legacy salvage: what the new ecosystem actually uses of the old `src/` tree

Date: 2026-10-09. Companion to `LEGACY-SALVAGE-AUDIT.md` (2026-10-08, the plan: classes KEEP / ADAPT / REBUILD / RETIRE /
QUARANTINE) and to `ARCHITECTURE-CONFORMANCE.md` (the import-graph evidence). This file states, from the import graph, the
position of every `src/` file today. "Retired" means **retained in the repository, unreachable from any application or
service entry**; nothing has been deleted (charter principle 15; salvage audit §4). Reachability is computed by
`test/audit/conformance.support.ts` from the seven entries listed in the conformance document; the categories below are
the ones its tests pin.

## 1. The 539 files of `src/` at a glance

| category | files | meaning |
|---|---|---|
| **A. Salvaged and wired** | 67 | compiled into at least one product entry (`src/adapters` 61, `src/dict` 6) |
| **B1. Reachable at type level, allow-listed** | 20 | all of `src/core/`: types only, compiled into no bundle |
| **B2. Reachable at type level, retired (defect C-01)** | 12 (+ 4 json, + 1 file under `data/`) | `src/course/*` via two `import type` edges in `src/core`; flagged |
| **C. Reachable only from the controlled-reader prototype** | 4 | `src/ingest/{epub,plaintext,headings,quality}.ts`, the DRM-refusing EPUB reader (the prototype is not an app entry) |
| **D. Allowed, not wired** | 149 | planned-pack analysers (`de, hi, th, nb, nn` + their rule directories, the adapter registry `index.ts`, `albanian/overrides.ts`) 140; dictionary build/compare tooling 9 |
| **E. Retired, unreachable** | 287 | the course, ladders, Stage 0, library, UI, legacy learner model, legacy GoTell/GoListen/GoRead, backup, benchmarks |

Per directory (A wired / B type level / C prototype / D allowed-unwired / E retired):
`adapters` 61 A, 140 D · `core` 20 B1 · `course` 12 B2, 8 E · `dict` 6 A, 9 D · `ingest` 4 C, 13 E · `golearn` 35 E · `golisten` 24 E ·
`gotell` 19 E · `goread` 4 E · `backup` 6 E · `db` 1 E · `alphabet` 4 E · `stage0` 13 E · `ladder` 10 E · `library` 11 E ·
`authoring` 8 E · `sim` 7 E · `bench` 33 E · `ui` 89 E · `app` 1 E · `main.tsx` 1 E.

## 2. Salvaged and used now (categories A and B1)

| module | salvage class | where it is used now | tests covering it (run 2026-10-09, all green) |
|---|---|---|---|
| `src/adapters/sq.ts`, `src/adapters/albanian/` (36 of 37 files) | KEEP (salvage audit §3.A) | the Albanian pack: `packages/language-packs/src/{runtime,packs/sq}.ts`; GoLearn content script (`packages/golearn-extension/src/parser/index.ts`, `content/index.ts`), background, setup app; GoPractice (GoReview facts, GoTell analyser) through the pack runtime; the Repository linguistics resolver (`packages/repository-linguistics/src/{resolver,packs}.ts`) | `test/adapters/albanian-*.test.ts` + `sq.test.ts`: 909 tests; `test/language-packs`: 77; `test/repository/linguistics`, `test/extension/parser.test.ts` exercise it through the packages |
| `src/adapters/es.ts`, `src/adapters/spanish/` (22 files) | KEEP | the Spanish pack (installable at a MINIMAL level, machine-drafted, not production-ready): same chain as Albanian | `test/adapters/spanish-*.test.ts` + `es.test.ts`: 409 tests |
| `src/adapters/shared.ts` | KEEP | tokenizer, lexicon helpers, phrase matcher used by both analysers | `shared.test.ts`, `registry.test.ts`, `offsets.test.ts`: 30 tests |
| `src/dict/{index,build,format,frequency,map,sharded}.ts` | KEEP | dictionary format and the sharded loader: `packages/language-packs/src/runtime.ts`; reads the kaikki shards shipped in `dict/sq` | `test/dict`: 232 tests (the whole directory, including the unreached tooling) |
| `src/core/**` (20 files, types) | ADAPT (audit §3.A: "extract `language-pack-types`") | the adapter contract and token/analysis types behind every pack: `language-packs/src/{analysis,runtime}.ts`, `golearn-extension/src/parser`, `goreview/src/facts/provider.ts`, `repository-linguistics/src/resolver.ts` | `test/core`: 13 tests; compile-checked by `tsc -b` |
| `src/gotell/{concepts,coverage,diff,meaning,provider,text,productive/interpret}.ts` | ADAPT | **copied, not imported**: `packages/gotell/src/salvage/*` (8 modules, each headed "adapted from src/gotell/..." dated 2026-10-09), used by the GoTell analyser, assistance ladder and meaning-change guard | `test/gotell-engine/{salvage,coverage,boundary}.test.ts`: 30 tests; the 34-file legacy suite `test/gotell` (491 tests) still passes against the originals |
| analysis resolution rules, learner-model design (`src/golearn/*`) | ADAPT via 2GoLearn | lifted into the sibling repository `C:\Users\CJWal\dev\2GoLearn` and into `packages/repository-engine`; nothing in `src/golearn` is imported | not re-run here; `test/golearn` (retained) belongs to the retired copy |

Test counts: the Albanian and Spanish analysers have 1,318 tests (909 + 409) plus 30 for the shared helpers; the dictionary
directory 232; `src/core` 13; the language-pack framework 77. The seven analyser directories together have 4,590 tests, of which
only the Albanian and Spanish ones cover wired code.

## 3. In between: reachable but flagged

1. **Type-level reach of the retired course (C-01).** `src/core/model.ts` and `src/core/course.ts` import types from
   `src/course/curriculumPolicy.ts`; 12 course modules, 4 course `*-works.json` and `data/sources/course-library/nb.json`
   become part of the type graph of every package that imports a language adapter. Not compiled into any bundle. Cure:
   move `CurriculumMetadata` and `StageContract` into `src/core` (or a `language-pack-types` module). Open.
2. **Ladder- and course-named word lists compiled into the analysers.** `src/adapters/albanian/lexicon-ladder.ts` (the word
   list of the Albanian ladder plan plus the b1-bridge, machine-drafted, compared with Wiktionary; rights question Q1) and
   `src/adapters/spanish/lexicon-course.ts` (words found missing from the course texts). Pure data inside their adapter
   directories. Kept because removing them lowers the analysers' coverage of ordinary words; the audit class is KEEP with the
   Q1 reservation, and the salvage audit's remark that cast names in `lexicon-course` give false proper-noun readings in
   general text (§3.A) still applies to `spanish/lexicon-course.ts`.
3. **Contract files named for retired features, types only:** `src/core/course.ts`, `src/core/contracts/{course,library,stage0}.ts`
   (plus `golearn`, `golisten`, `gotell`, `gotell-practice`, `lexicon`). Reached as erased types; the unused ones are candidates
   for removal when the type slice is extracted.
4. **The personal-copy EPUB importer** (`src/ingest/{epub,plaintext,headings,quality}.ts`; audit §3.C KEEP): reachable only
   from `packages/controlled-reader`, a README-labelled PROTOTYPE that no entry reaches. Test coverage: `test/controlled-reader`
   (56) and `test/ingest` (661 for the whole importer, mostly the retired corpus pipeline).
5. **Allowed but not wired (planned packs).** German, Hindi, Thai, Norwegian (Bokmal, Nynorsk) analysers and rule directories
   (`src/adapters/{de,hi,th,nb,nn}.ts`, `german/` 42 files, `hindi/` 48, `thai/` 14, `norwegian/` 29) are on the allow-list
   and covered by tests (de 1,358; hi 1,282; th 503; nb/nn 129; all green), but no entry reaches them: the language-pack
   manifests for these languages are "planned" and never installable. The conformance test fails the day one becomes reachable,
   so this table is updated deliberately. Also unreached: `src/adapters/index.ts` (the registry that names all seven) and
   `src/adapters/albanian/overrides.ts`; dictionary build/compare tooling in `src/dict` (`build-node, compare*, frequency-node,
   file`), used by `npm run dict:build` and friends.

## 4. Retired: retained in the repository, unreachable from any entry (category E, 287 files)

| area | files | what | notes |
|---|---|---|---|
| `src/ui/` | 89 | React course UI, reader, Scripture, testimony, tell, listen pages | the Reader's card model was *re-specified* (not imported) for the extension; salvage audit §3.C REBUILD |
| `src/golearn/` | 35 | legacy learner model (fold, queries, recommend, readiness over a bundled library) | design lifted to 2GoLearn and `packages/repository-engine` |
| `src/bench/` | 33 | gold sets and benchmark harness over the retired corpus | dev asset; the only measurements of the analysers |
| `src/golisten/` | 24 | course-audio pipeline | superseded by `packages/golisten` |
| `src/gotell/` | 19 | legacy GoTell engine, practice ladder, testimony | pure parts copied into `packages/gotell/src/salvage` |
| `src/ingest/` (13 of 17) | 13 | corpus importer, planner, rights gate, publisher, migration | `import.meta.glob` of the bundled corpus lives in `src/ingest/index.ts` |
| `src/stage0/`, `src/alphabet/` | 13 + 4 | Stage 0 packs, sound tables, letter trainers | one pronunciation sentence (a shared run of at least 49 normalised characters) also appears in the new Albanian tutorial `packages/language-packs/src/tutorial/sq.ts` (see `RIGHTS-AND-ATTRIBUTION.md`, distribution scan, examined overlaps) |
| `src/library/` | 11 | bundled library, shelves, canon | |
| `src/ladder/` | 10 | ladders, path, placement | |
| `src/course/` (8 of 20) | 8 | catalogue, doors, path availability, Scripture access/integrity, reading assessment, transition analysis | the other 12 are the type-level reach C-01 |
| `src/authoring/`, `src/sim/` | 8 + 7 | unit authoring, learner simulation | |
| `src/backup/`, `src/db/` | 6 + 1 | IndexedDB backup and database | replaced by the Repository store and export (audit §3.B ADAPT) |
| `src/goread/` | 4 | `u-local` identity and the team text-sharing client | refusal rules (`sharing.ts`) are the model for the Repository's sharing guard |
| `src/app/`, `src/main.tsx` | 2 | legacy application shell and entry | still built by the root `npm run build` into the root `dist/` |

The tests of all retired areas still exist and keep running (`test/ui`, `test/ladder`, `test/stage0`, `test/library`,
`test/course`, `test/golearn`, `test/goread`, `test/backup`, `test/ingest`, `test/sim`, `test/authoring`, `test/alphabet`,
`test/db`, `test/golisten`, `test/integration`, ...). This audit re-ran only `test/goread` (44), `test/backup` (27),
`test/ingest` (661), `test/gotell` (491) and `test/controlled-reader` (56): all passed. Deleting a retired module remains a
later, reviewed commit per module (audit §4).

## 5. Retired data (outside `src/`), unreachable from any entry and absent from every build

`data/corpus` (147 files), `data/ladder` (730), `data/stage0` (170), `data/sources` (1,036; includes the course-library
catalogues, the Bible sources and two USFM archives), `data/verified/scripture.json` (four Bibles), `data/review` (139) and
`public/library` (12,634 installed library files) are referenced by no compiled import of any entry. They are retained in the
repository (some are tracked, some git-ignored; `RIGHTS-AND-ATTRIBUTION.md` §3(d) has the git state). The distribution scan
(`test/audit/rights.dist.test.ts`) compares every string of the corpus, ladders and Stage 0 packs, every verse of the four
Bibles, a stride sample of the library and the sources, and every catalogued title and author with the three built
folders: no unexplained overlap (two examined overlaps, listed in the rights audit).

## 6. Counts for the record

* `src/`: 539 files; wired 67; type-level only 32 (20 allow-listed core, 12 retired course); prototype-only 4; allowed but
  unwired 149; retired unreachable 287.
* Packages that import `src/`: `language-packs`, `golearn-extension` (parser), `goreview` (facts provider),
  `repository-linguistics`, `controlled-reader` (prototype). Nothing else does.
* Salvage by copy (code that left `src/` as new files): `packages/gotell/src/salvage`, 8 modules.
* Salvage by sibling repository: `src/golearn` and `src/golisten` designs live on in 2GoLearn (not inspected by this audit).

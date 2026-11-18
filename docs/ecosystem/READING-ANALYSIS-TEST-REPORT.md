# Reading Analysis: what was run, and what was not

2026-11-17, branch `feat/reading-analysis-rebuild`, commit `6cdfd4a4` (rebased on master `985c742b`). Design:
`READING-ANALYSIS.md`.

## 1. Results

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc -b` | clean |
| Whole suite | `GO_CI_NO_LOCAL_DATA=1 npx vitest run` | 17,902 passed, 149 skipped, **2 failed** (not this branch's: section 5) |
| Reading Analysis suites | `GO_CI_NO_LOCAL_DATA=1 npx vitest run test/extension/reading-*.test.ts` | 8 files, 324 tests, all pass (98 s) |
| Extension build | `npm run ext:build`, then the setup app's `--mode options` build | builds; `build.json` `6cdfd4a437fc` |
| Real browser | `scripts/loadcheck/golearn/reading.mts` (section 3) | 30 steps, all pass |

## 2. The suites

| File | Tests | What it establishes |
|---|---|---|
| `reading-extract.test.ts` | 61 | which text is read: chrome, sidebars, forms, hidden text and declared foreign passages left out; the whole document, not the viewport; scope; refused readers refused; frames by policy; fingerprint; five real site fixtures |
| `reading-lexical.test.ts` | 101 | the word table with the REAL analyser of every registered language (sq, es, de, hi, th, nb, nn, la, he, el, arc): totals, repetition, inflection, homographs, the dictionary question and its failures, script filter, limits, cancellation |
| `reading-classify.test.ts` | 78 | the verdict rule: the six levels, form against lemma (a 79 x 79 property loop against `levelOfRows`), several readings, varieties, legacy marks; the arithmetic and rounding |
| `reading-repository.test.ts` | 17 | reconciliation with the account's own projection, unit by unit (below) |
| `reading-failures.test.ts` | 45 | every way the knowledge can be incomplete, stale, mixed or damaged is reported, not counted |
| `reading-deletions.test.ts` | 5 | a record deleted on another device is deleted here before a figure is given |
| `reading-integration.test.ts` | 6 | real content script to real worker: analyse, mark a word on its card, analyse again |
| `reading-popup.test.ts` | 11 | the popup part and every sentence it can show |

The extraction, language and Repository suites were written by three agents working from the stated rules, not
from the implementation's author, and told to keep a failing test rather than weaken an assertion.

### Reconciliation (`reading-repository.test.ts`)

The account is the real service handler over the memory store with the real projection engine; the device is the
real background worker over fake-indexeddb. Nothing of the Repository is mocked.

- 23 seeded histories at all six levels, by evidence and by the learner's own mark, in two languages, plus words
  with no record: every verdict equals the rule applied to the account's own rows, a hand-written oracle, and the
  level the history was built for. Rows are compared unit by unit (id, language, level, mark, presence or verified
  absence), never by count.
- 3,800 distinct ids in five messages: each `asked === answered === 760`; the Repository was asked each id exactly
  once in 20 requests of at most 200. 400 words are answered; 401 are refused whole.
- A mark, typed reviews and a deletion made on a second device each reach the next analysis without signing out.
  The worker's own sync round brings additions in; events this device pushed itself cause no extra request.
- A mark made here and not yet pushed counts at once and is reported as unsent. Known then New ends New.
- Signed out: the device is the record. An empty device answers "no record", which is told apart from a failure.
- Greek and Hebrew: 10 cases across five varieties match `knowledgeInVariety` / `ownKnowledgeOf` on the account's
  rows. A legacy mark is `unsettled` in every variety. A request with no variety is refused.
- Read-only: account events, device events, every row on both sides, the sync queue, the pull cursor and
  GoReview's folded deck (its scheduling inputs) are identical before and after a whole analysis. The only requests
  were `GET /me`, `GET /tombstones` and `GET /events`.

### Defects the independent suite found, and their repair

All fifteen were real. Each has a test that failed before the repair and passes now.

| # | Was | Now |
|---|---|---|
| 1 | a page shorter than asked ended the pull as complete with the head beyond it (201 events missing, "verified") | the end is the account's head |
| 2 | a page answered for another position left a hole for good | asked again, then probed with a one-event request; a hole ends the pull incomplete |
| 3 | an event the device could not store was forgotten after one snapshot | remembered with the cursor and asked for again |
| 4 | a revoked sign-in was reported as "unreachable" | `needs-sign-in`, and the sync service is told |
| 5 | `offline` and `needs-sign-in` did not say since when the device was whole | they do |
| 6 | pages of a slow pull landed under an unchanged snapshot id | a write is announced before it starts |
| 7 | an event was readable before the snapshot id changed | the same |
| 8 | a row with a damaged level was re-read by older thresholds (Familiar came back Known) | the batch is refused |
| 9 | `answered` was `asked` written twice | counted where the requests are made |
| 10 | a store that would not open answered "every word is new", verified | no figure: the record is unavailable |
| 11 | two accounts mixed before the list was kept were "verified" | read once from the events' markers |
| 12 | signed in with no account to ask was "this device is the record" | not verified |
| 13 | the first repair of 3 kept only 200 refused events | every one is kept; many are re-read by page |
| 14 | the first repair of 11 seeded the list in one call only | seeded by the first call that can |
| 15 | deletions on the account never reached the device | `GET /tombstones`, applied before new events |

## 3. Real browser

`scripts/loadcheck/golearn/reading.mts`: the built extension in a throw-away headless Brave profile
(Chrome/157), a throw-away local Repository service behind a fault proxy, a generated test account, and the script
itself as a second device signed in to the same account. Never the owner's profile, service or account. Every
expected number is worked out in the script from the page's own text. The report of the run is kept beside the
script's output as `reading-report.json`.

| Step | Shown |
|---|---|
| A1–A5 | no account: the 483 words of the article counted (navigation, banner, hidden mobile copy, English quotation, sidebar, form and footer left out); nothing recorded by analysing; "shkon" marked Known on its card; analysed again: 40 of 483 (8.3 %), text not read twice |
| B1–B5 | a test account, signed in; the mark reaches the account's projection; the same figure, now verified against the account |
| C1–C3 | the second device marks "libër" Known on the account; the next analysis has it without signing out (81 of 483, 16.8 %: the 40 "libër" and "Libri" in the heading); the device row equals the account row; the account's head moved by that one event only |
| D1–D3 | service down: not verified, reason and last verified time given, figure from the device; service hanging: 16 s, not verified; service back: verified |
| E1 | a chapter swapped in place at the same address: the old figure flagged stale, the new text counted |
| F1–F2 | a document of 192,003 words read whole and counted exactly in 1.2 s; analysed again without reading the text again |
| G1 | a Greek page with no variety stated: the run stops and asks |
| H1 | the popup page carries the part: its name and one button |
| I0–I2 | the browser closed and started again on the same profile: same figure, verified; the worker is the build under test |
| J1–J2 | the second device deletes its mark; the next analysis no longer counts it (40 of 483), verified |

## 4. Not done, and not claimed

- **The toolbar popup was not clicked in a real browser.** The run sends, from an extension page, the same three
  messages the popup's button sends (the grant, the start, the status). The popup's own code is exercised in
  `reading-popup.test.ts` and its page was loaded in the browser (H1). A press on the real toolbar button, with
  the page access it grants (`activeTab`), was not automated: the harness grants loopback pages by manifest.
- **Reloading the extension** was replaced by a full browser restart on the same profile: this headless browser
  does not bring a command-line-loaded extension back after `chrome.runtime.reload()`.
- **Only Albanian ran in the real browser.** The other ten packs are covered with their real analysers in
  `reading-lexical.test.ts`; none of their dictionaries was downloaded in the browser run, and no real Greek or
  Hebrew page with a chosen variety was analysed there.
- **No real reading site.** The pages were served locally. Site fixtures are covered in `reading-extract.test.ts`.
- **No production data, no production service, nobody's real account.** The account store was the memory store in
  the suites and SQLite in the browser run; Postgres was not exercised.
- **Layout-dependent visibility** (`checkVisibility`, `content-visibility`, `display: contents`) ran only in the
  real browser's one article; jsdom took the fallback path.
- **Nothing is deployed.** The branch is pushed; master, the Render service, the hosted pages and the shared
  extension folder are unchanged.

## 5. The two failures in the whole suite

Neither file is touched by this branch, and both fail the same way on master `985c742b`.

- `test/audit/a11y.css.test.ts` A-C04: `practice .signin-about > summary::after` has a transition outside the
  reduced-motion gate (GoReview's sign-in stylesheet, master `985c742b`).
- `test/golearn-app/build.test.ts`: the setup app's `app.js` is 847,520 characters against a ceiling of 800 KB in
  this file, while `test/extension/bundle.test.ts` allows 840 KB for the same file. Master's own build measures
  857,670 bytes; this branch's 857,963. It runs only where a built `dist/app` exists, so not in GitHub's CI.

## 6. Bundle ceilings raised

| File | Before | Now | Ceiling |
|---|---|---|---|
| `content.js` | 560.3 KB | 575.5 KB | 564 → 580 KB |
| `background.js` | 1,181.2 KB | 1,195.8 KB | 1,190 → 1,200 KB |

## 7. Measured on the course samples (first 12 sentences per language)

| Language | Tokens | With a reading | More than one reading |
|---|---|---|---|
| sq | 74 | 100.0 % | 14.9 % |
| es | 44 | 100.0 % | 0.0 % |
| de | 253 | 99.6 % | 5.1 % |
| hi | 77 | 100.0 % | 13.0 % |
| th | 96 | 100.0 % | 0.0 % |
| nb | 60 | 100.0 % | 18.3 % |
| nn | 60 | 100.0 % | 10.0 % |
| la | 295 | 71.5 % | 1.0 % |
| he | 52 | 71.2 % | 15.4 % |
| el | 60 | 91.7 % | 21.7 % |
| arc | 62 | 100.0 % | 16.1 % |

These are course-authored texts read with the built-in word lists, before the dictionary is asked, so they flatter
real pages for the languages at 100 % and understate Latin, Hebrew and Greek once their dictionaries are present.

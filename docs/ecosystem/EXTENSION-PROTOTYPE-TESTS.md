# Extension prototype tests and measurements

Status: 2026-10-08. What was run, how, with the numbers as the clock gave them. Nothing here is estimated. The
prototype is `packages/golearn-extension` (Manifest V3) and `packages/controlled-reader` (local EPUB reader +
`epub-local` adapter). Both are marked PROTOTYPE in their READMEs; the contract, card model, sentence reconstruction
and the two adapters are production candidates.

## 1. Automated tests (jsdom, Vitest 3.2.7)

```
npx tsc -b                                                     # exit 0
npx vitest run test/extension test/controlled-reader test/ecosystem --reporter=dot
```
Result: 17 files, **224 tests passed, 0 failed** (run 2026-10-08 18:37 local; one "unhandled error" line reported
by the runner is examined in §1.3).

### 1.1 `test/extension` (164 tests, 11 files)

| file | tests | what it checks |
|---|---|---|
| `webGeneric.test.ts` | 25 | selection + context on fixtures: Albanian ë/ç incl. NFD input; German diacritics + compound; Spanish ¿¡; Devanagari grapheme-safe edge snapping; Thai; Hebrew/Arabic with direction recorded; 1-, 40- and 90-word selections; abbreviations, ellipses, unbalanced quotes; empty, whitespace, cross-paragraph; same-origin and cross-origin frames |
| `parser.test.ts` | 23 | 10 Albanian sentences: card-model shape, `confidence` and `provenance` always present; Thai → `provenance: 'none'`. **Not** linguistic correctness |
| `card.test.ts` | 29 | shadow host, placement/clamp/flip, Escape / outside click / close button, Tab order, pronunciation disabled without a local `sq` voice, "encounter recorded" line, no page mutation |
| `controller.test.ts` | 27 | 10 simultaneous lookups → one card, one record, no leaked listeners; replaced DOM dismisses, new selection works; font-size change repositions; unsupported reader; failed context; removed block → fragment-only, flagged; permission denial → one-line message, no uncaught error |
| `background.test.ts` | 17 | injection only on a gesture (action, menu, command); per-tab state; errors from `executeScript` surface as a message |
| `store.test.ts` | 12 | `SelectionLookedUp` rows validated by `validateEvent`; no sentence text ever stored; dedupe; export |
| `contract.test.ts` | 10 | `validateCapabilities` refuses contradictory declarations |
| `metrics.test.ts` | 8 | marks, per-phase deltas, nearest-rank percentiles, null stats for empty samples |
| `actionPopup.test.ts` | 5 | toggle, language list (Albanian only), counter, export |
| `bundle.test.ts` | 3 | evaluates the built `content.js` in jsdom and performs a lookup; the built scripts contain no network call, `eval`, module syntax or URL (skips if `dist/` is absent) |
| `platform.test.ts` | 4 | regression for the real-browser defect of §2.1 |

### 1.2 `test/controlled-reader` (56 tests, 5 files)

`sentences` 19, `geometry` 5, `drm` 11, `fixtures` 5, `adapter` 16: spine order; chapter change updates
`sourceRef`; NFC surface from an iframe selection; sentence reconstruction across `<em>`/`<span>` for all 61 fixture
sentences with correct offsets; two-sentence selection → `fragment`; CFI round-trip; stored CFI valid after a location
change; highlight add/remove; font reflow; iframe-to-host coordinates; RTL selection and direction; DRM refusal (a
protected file never reaches the renderer and creates no iframe). jsdom limits (no layout, no `srcdoc`, no real
pagination) are listed in `test/controlled-reader/MANUAL.md` with the 13 browser steps.

### 1.3 The runner's "1 error"

The first dot-reporter run (18:37) printed `Errors 1 error` beside 224 passes without naming a test. Two re-runs
with the default reporter (18:40, 18:42) completed with 17 files / 224 tests passed and no error line at all; the
only slow test is `adapter.test.ts › survives pagination moves` (1,012 ms). The transient error is recorded here and
not explained; if it recurs, run `npx vitest run test/controlled-reader --reporter=verbose` and look for an
unhandled rejection from epub.js under load.

## 2. Real-browser run (Chromium, the desktop app's browser pane, 2026-10-08)

### 2.1 Method, and what it is not

- The built `dist/content.js` (250,518 B minified; ~83 KB gzip; includes the 213 KB Albanian adapter) was loaded by
  a `<script>` tag into two **local harness pages** served by a 30-line static server on `localhost:5199`:
  `harness/albanian-article.html` (21 paragraphs generated from the owner-authored fixture sentences, with nested
  `<em>`/`<a>`/`<sup>`, a sidebar, a same-origin `<iframe>`, a 2-second ticker, a font-size slider, "replace article"
  and "re-render section" buttons) and `harness/scripts.html` (Albanian, German, Spanish, Hindi, Thai, Hebrew, Arabic,
  abbreviations, quotes, a 48-word sentence, 12 px and 30 px text, a paragraph 1200 px below the fold).
- Selections were made with real pointer gestures through the pane's automation (double-click, drag) and, for
  off-screen or scripted cases, by setting a `Range` and calling the controller's command path (what Alt+Shift+G
  would call).
- **This is not an installed extension.** `activeTab`, `chrome.scripting.executeScript`, the context menu, the
  keyboard command, `chrome.storage.local` quotas and `allFrames` injection were not exercised. The store used the
  in-memory fallback. Loading `dist/` unpacked in the owner's Chrome is step §6.
- **This is not a third-party site.** Injection into `sq.wikipedia.org` was attempted first and failed twice for
  reasons that do not apply to an installed extension: the site's Content-Security-Policy rejects a script from
  `127.0.0.1`, and Chromium's private-network-access rules blocked `localhost` from a public origin (an installed
  extension's content script is not subject to the page's CSP). A proxy that strips the page's CSP was considered and
  rejected (it weakens the page's security and is not what an installed extension would see).

**Defect found on the first run and fixed:** an ordinary Chrome page exposes `window.chrome` (`csi`, `loadTimes`)
without the extension APIs; `getChrome()` returned it and `install()` threw on `chrome.storage.local`, silently (the
auto-install catch), so nothing installed. Fixed in `src/platform.ts` (require `storage.local` and `runtime.onMessage`);
regression `test/extension/platform.test.ts`; rebuilt; 159 → 163 extension tests green.

### 2.2 Latency (ms from the trigger; `performance.now()`; one row per lookup)

Cold start (first lookup after the script loaded, includes the Albanian index build):

| page | module evaluation | selection obtained | context extracted | parsed | popup positioned | first info shown |
|---|---|---|---|---|---|---|
| scripts.html | 6.5 | 0.9 | 3.3 | 95.4 | 107.8 | 110.0 |
| albanian-article.html | 4.2 | 1.1 | 2.3 | 88.9 | 91.1 | 91.8 |

Warm lookups on `albanian-article.html` (n = 9 shown, scripted command path; nearest-rank percentiles):

| mark | p50 | p95 | max |
|---|---|---|---|
| selection obtained | 0.3 | 0.5 | 0.5 |
| context extracted | 0.4 | 1.9 | 1.9 |
| parsed | 1.0 | 2.6 | 2.6 |
| popup positioned | 2.5 | 3.8 | 3.8 |
| first info shown | 106.3 | 109.2 | 109.2 |

Individual warm gestures (real double-click): "Nëna" 0.5 / 0.6 / 1.2 / 2.5 / **3.5**; "Straßenbahnhaltestelle" 0.9 /
1.4 / 3.2 / 6.2 / **7.0**; "pingüino" 0.6 / 0.9 / 2.6 / 4.7 / 108.2; "की" 0.5 / 1.3 / 2.4 / 28.5 / 139.9; Thai
"ตลาด" 0.8 / 1.3 / 5.6 / 14.7 / 121.1.

Reading the "first info shown" column honestly: the mark resolves on the next animation frame with a 100 ms
fallback. While the browser pane was hidden (most of the scripted run) `requestAnimationFrame` was throttled and the
fallback fired, so ~106–140 ms is the harness, not the extension. With the pane visible the same mark read 3.5 ms and
7.0 ms. The pipeline up to "popup positioned" is unaffected: p50 2.5 ms, p95 3.8 ms warm.

### 2.3 Memory

`performance.memory.usedJSHeapSize`: 3.9 MB before any lookup on `scripts.html`, 13.5 MB after the cold lookup
(index built), 8.4–8.7 MB after garbage collection on later rows; on `albanian-article.html` 8.6 MB → 9.9 MB across 7
shown lookups (sampled before and after). No growth trend beyond the index.

### 2.4 Behaviour observed (real gestures unless noted)

| case | result |
|---|---|
| double-click a word, Albanian | card with lemma, gloss, form, confidence line, "encounter recorded"; stays open at 1 s and 4 s |
| double-click German compound / Spanish `pingüino` / Hindi `की` | surface extracted correctly (NFC; Devanagari vowel sign kept with its base: 2 code points + space in the native selection, card shows `की`); Albanian analyser says "Not in the word list", `provenance: none`, confidence 0 |
| Thai span, Hebrew and Arabic words (scripted) | surface correct, direction `rtl` recorded for Hebrew/Arabic, `provenance: none` |
| `e.g.` inside an English sentence, `çaj` inside «…» and "…" | sentence context found (64 and 23 chars); `çaj` → lexicon entry |
| 48-word sentence | context 277 chars, lemma by rule (`mësuesja` → `mësuese`) in 6.6 ms |
| 12 px and 30 px text | both work (`i bukur`, `libër`) |
| paragraph 1200 px below the fold (scripted, off-screen) | card uses the fallback corner (`source: 'fallback'`), top-right |
| drag across two words | selection "Libri ësht" → 2 tokens, sentence context; card open from ~200 ms after mouseup and stays. (One earlier drag on the heading showed the card closed after 1 s; not reproduced in the sampled run.) |
| selection across `<em>` boundary (`Beni <em>zgjohet</em>`) | 2 tokens, sentence context (scripted) |
| selection across two paragraphs | "Select a word or phrase inside one paragraph." (`multi-block`) |
| selection inside a same-origin `<iframe>` (scripted) | "Select a word first." — the top-document adapter does not read a frame's selection; see contract §7 |
| 10 concurrent lookups (scripted burst) | 1 shown, 9 superseded; exactly 1 metrics row and 1 record |
| font size 17 → 26 px with a card open | card stays open and follows the word |
| "re-render section" (innerHTML rewrite under an open card) | card dismissed; the dead range is reported not live; next lookup needs a new selection |
| "replace the article" (whole subtree replaced) | card dismissed; a new selection in the new content works (`Libri` → `libër`) |
| viewport 832 → 375 px (mobile preset) | card closed before the resize in that run; layout reflowed; no page-level breakage |
| clicks inside the card | never trigger a lookup (the German double-click that landed on the card selected the card's own label and produced no row) |
| Escape / outside click | dismiss |
| keyboard selection with shift+arrows on a non-editable page | needs caret browsing in Chrome; no selection formed, no lookup (nothing to report) |

### 2.5 Controlled reader, verified by the lead in the pane (`http://127.0.0.1:5197/?fixture=…`)

| check | result |
|---|---|
| `udha` renders | one `<iframe sandbox="allow-same-origin" srcdoc>`, same origin, 24 text nodes; status "Mëngjesi - page 1 of 2" |
| real double-click on `zgjohet` | frame selection "zgjohet ", top selection empty; adapter `selection()` → surface `zgjohet`, ltr, `same-origin-frame`; `context()` → sentence "Beni zgjohet herët.", offsets 5–12, confidence 0.9; `anchor()` → range rect in host coordinates; `sourceRef()` → `{kind: file, title, locator: epubcfi(/6/2!/4/2/1:0)}`; 0.4 / 0.1 / 0.1 ms |
| `rendition.next()` | locator changes to a new CFI; the old range is still live but `anchor()` falls back (off-page); one layout event (`scroll`) |
| font 100 → 110 % | selection and locator unchanged |
| `rtl` fixture | `dir=rtl` on the document and body; selection surface `שלום,` with direction `rtl` from the attribute; "page 1 of 2" for 5 lines (not investigated) |
| `protected` fixture | refused before rendering: 0 iframes, outcome `refused`, message "This EPUB is protected… Go does not remove protection; use a copy without it." |

The agent that built the reader ran the 13 manual steps of `test/controlled-reader/MANUAL.md` in the pane as well;
the lead re-checked the six above independently.

## 3. Build

```
npm run ext:build
```
| file | bytes |
|---|---|
| `dist/content.js` | 250,518 (after the fix; 250,461 before) |
| `dist/background.js` | 3,209 |
| `dist/action/popup.js` | 5,386 |
| `dist/action/popup.html` | 2,718 |
| `dist/manifest.json` | 648 |

Permissions: exactly `["activeTab", "scripting", "storage", "contextMenus"]`; no `host_permissions`,
`content_scripts`, `web_accessible_resources` or `externally_connectable`; one command (Alt+Shift+G). No icons yet.

## 4. What the tests validate, and what they do not

They validate integration: that a selection in each script reaches the parser intact, that context is found or
honestly absent, that failures end in one line, that nothing leaks or is stored. They do **not** validate parsing
accuracy: the Albanian readings are the adapter's machine-drafted analysis, unchecked by a native speaker, and the
other languages have no analyser in this prototype at all.

## 5. Not measured

- Page-transition failure rate on real ebook readers (no reader supported; Kindle is blocked).
- Repeated-selection latency over hundreds of lookups (a 7-lookup series only).
- Behaviour under a strict page CSP for the card's constructed stylesheet (the installed path).
- Speech voices (no local Albanian voice on this machine; the button is disabled with a note, as designed).

## 6. Manual validation procedure: installed extension in the owner's Chrome

1. `npm run ext:build`. In Chrome open `chrome://extensions`, enable Developer mode, "Load unpacked", choose
   `packages/golearn-extension/dist`.
2. Open `https://sq.wikipedia.org/wiki/Gjuha_shqipe`. Click the GoLearn toolbar button → "GoLearn on for this tab".
   Expected: the badge changes; nothing else happens until a selection.
3. Double-click an Albanian word in the article body. Expected: a card within ~150 ms with lemma/gloss/form and
   "encounter recorded". Record the metrics row (popup → "Export metrics").
4. Select a word, press Alt+Shift+G. Expected: the same card. Right-click a selection → "Look up with GoLearn".
   Expected: the same card. Record both.
5. Reload the page. Expected: the per-tab switch is off again (activeTab is lost on load) and nothing runs until
   the button is used. Confirm no content script is present before the gesture (DevTools → Sources → Content scripts).
6. Open a page with a strict CSP (e.g. `https://github.com`), turn GoLearn on, select a word. Expected: the card still
   renders (content scripts are exempt from page CSP) with its styles; record any console error.
7. Open a page with a same-origin iframe (the harness `albanian-article.html` served locally) and select inside the
   frame. Expected today: "Select a word first." Record it; this is the `allFrames` work item.
8. Export the encounter rows and the metrics from the action popup; confirm no row contains a sentence, only
   `sentenceKey` hashes, item ids, title and URL path.
9. Remove the extension. Expected: `chrome.storage.local` rows are gone with it.

Until these steps are run, the gate for ordinary web pages stays "verified on local harness pages; unverified as an
installed extension on third-party sites".

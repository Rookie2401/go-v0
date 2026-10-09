# Reader capability matrix

Status: 2026-10-08. One row per reading environment investigated for Prompt 2; one column per capability of the
contract (`READER-ADAPTER-CONTRACT.md`). Every cell carries its evidence class:

- **M** measured by the lead in a real Chromium on 2026-10-08 (local harness pages, the controlled reader, or the
  owner's own Kindle for Web session; details in `EXTENSION-PROTOTYPE-TESTS.md` and `KINDLE-INTEGRATION-FINDINGS.md`);
- **T** covered by automated tests in jsdom (`test/extension`, `test/controlled-reader`);
- **P** public sources only (`annex/E-reader-platform-research.md`), third-party claims flagged there;
- **U** unverified: no authorised session or no evidence; the manual procedure is in the feasibility report.

| capability | A. ordinary web page (`web-generic`, injected copy) | B. controlled local EPUB reader (`epub-local`) | C. Google Play Books web | D. Kobo web reader | E. Kindle for Web |
|---|---|---|---|---|---|
| reader identity, platform/version | page host + title (M) | page + OPF title (M); epub.js 0.3.93 | `play.google.com/books/reader` (P) | "Kobo Reader v1.16.0", tolino-based service tag seen on the error page (M: no session) | Ionic app, `#kr-renderer` (M) |
| user-triggered selection | double-click, drag, keyboard-command on an existing selection (M) | double-click in the frame (M) | user can select words (P: Google help) | unknown (P: 2023 review said no highlights; 2024 said coming) | user selects via the reader's own overlay (M) |
| word-level selection | yes (M) | yes (M) | likely in flowing-text mode (P) | U | yes, visually only (M) |
| selected text available to a script | yes, `getSelection()` (M); **not** inside a same-origin `<iframe>` from the top document (M) | yes, from the frame's `getSelection()` (M) | U (rendering frame reported cross-origin, `books.googleusercontent.com`, P) | U (vendor claim: same-origin `srcdoc` iframes, P) | **no**: `getSelection()` always empty; text is a bitmap (M) |
| sentence context | full, from the enclosing block's text nodes, Albanian segmenter + danda/`؟`/`。` (M, T) | full, across `<em>`/`<span>` and inline boundaries (M, T); two-sentence selection → fragment (T) | U | U | **none** (M) |
| adjacent context | available, off by default (T) | available, off by default (T) | U | U | none (M) |
| stable anchors | dom-range only; not durable across reloads (M) | EPUB CFI; survives next page, font change, resize, chapter round-trip (M, T) | U (reader has positions; no API) | U | none exposed; pixel overlay rects (M) |
| popup positioning | range rect, viewport clamp, flip; fallback corner for off-screen ranges (M) | iframe rect → host coordinates; fallback when the word is on another page (M) | U | U | only from the reader's internal overlay class (M); not usable |
| layout-change handling | font change repositions; DOM replacement dismisses; viewport change observed (M, T) | relocated/resized/font events (M) | U | U | page turn replaces the bitmap element (M) |
| persistent annotation | not supported, not claimed | epub.js annotations, local CFIs; terms claim needs the owner's confirmation (T) | reader's own notes → Drive doc (P) | reader's own highlights; export on kobo.com, author-approval limits (P) | reader's own highlights/notes; Notebook page (M) |
| offline | yes (bundle has no network call, T) | yes (local file) | U | U | U |
| content restrictions | editable/form fields and cross-origin frames not read; decline list for Kindle/Kobo hosts | DRM-protected EPUBs refused before rendering (M, T) | publisher copy limits, "proprietary content protection" on Web (P) | Terms of Sale restrict reproduction; ToU page returned 403 (P) | text never in DOM; publisher copy limits on Copy (M, P) |
| context-extraction confidence | 0.9 in text blocks (M) | 0.9 (M) | U | U | 0 |
| required permissions (installed extension) | `activeTab` + `scripting` after a gesture; `storage`; `contextMenus` (T; not yet loaded as an extension) | none (it is our page) | would need `activeTab` on play.google.com and frame injection (U) | would need `activeTab` on readnow.kobo.com and frame injection (U) | `activeTab` on read.amazon.com; yields nothing (M) |
| measured latency, warm (selection → popup positioned) | p50 2.5 ms, p95 3.8 ms (n = 9 warm lookups; M) | selection 0.4 ms, context 0.1 ms, anchor 0.1 ms (one measured lookup; M) | — | — | — |
| cold start (first lookup after load) | 88.9–95.4 ms to parse (Albanian index build), module evaluation 4.2–6.5 ms (M) | — | — | — | — |
| memory | heap 8.6 → 9.9 MB across 7 shown lookups; 13.5 MB after the cold start on the scripts page (M) | — | — | — | — |

## Feasibility gate per environment

| environment | gate | basis |
|---|---|---|
| A. ordinary web page | **verified full contextual** on local harness pages in a real Chromium; **unverified as an installed extension** on third-party sites (CSP and private-network rules of the harness prevented injection into live sites; the installed path has not been loaded) | M + T; manual steps in `EXTENSION-PROTOTYPE-TESTS.md` §6 |
| B. controlled local EPUB reader | **verified full contextual** (DRM-free files the learner owns; protected files refused) | M + T |
| C. Google Play Books web | **potentially viable, unverified** (the owner's account has no title; uploading the fixture to the owner's Google account was not done without their say) — contractually unresolved | P; manual procedure in the feasibility report §5 |
| D. Kobo web reader | **potentially viable, unverified** (no signed-in session; the reader page errors without one) — contractually unresolved (ToU not readable) | P (vendor claim of same-origin iframes) |
| E. Kindle for Web | **technically blocked** for contextual and selected-text lookup; selection bridge via the reader's own Copy / Notebook **potentially viable, unverified**; contractually unresolved for anything else | M (bitmap, empty selection) + P |

## Interaction modes evaluated

| mode | A web | B EPUB | E Kindle | note |
|---|---|---|---|---|
| direct word selection (double-click) | M works | M works | overlay only; no text | the default mode |
| phrase selection (drag) | M works: 2 tokens, sentence context | T (two-sentence → fragment) | overlay only | card open ~200 ms after mouseup (120 ms debounce) |
| context-menu lookup with the browser's `selectionText` | T (fake) only; serves cross-origin frames word-only | n/a | would receive nothing (no native selection) | needs the installed extension to verify |
| keyboard command on an existing selection (Alt+Shift+G) | the command path was exercised through `controller.lookup({trigger:'command'})` (M); the key binding itself is unverified (needs the installed extension) | same | nothing to look up | keyboard *selection* (shift+arrows) needs caret browsing on non-editable pages; shift+arrow after a mouse selection works (T) |
| share / selection bridge (copy → paste into GoLearn) | not needed | not needed | the only lawful path: Copy (publisher-limited) and the Notebook page (M: both exist; end-to-end unverified) | no sentence context unless the learner copies the sentence |
| controlled-reader fallback | n/a | this is it | for DRM-free books the learner owns, yes; for Kindle books, **no** (DRM is never removed) | |
| OCR / screen scraping | rejected | rejected | rejected (would be the only way; forbidden) | charter principle 11 |

# Reader compatibility retest — the final extension (Prompt 6 §15)

Status: 2026-10-09 (run 09:43–09:52 local, Chromium pane of the desktop app). This retests the FINAL `content.js`
(`packages/golearn-extension/dist/content.js`, 464,384 B, built 09:42 after the Part B remediation), not the
Prompt 2 prototype. Method and limits are the same as `EXTENSION-PROTOTYPE-TESTS.md` §2.1 and are restated in §4:
this is a content script loaded by a `<script>` tag into local harness pages, not an installed extension, and no
third-party site was reached. Nothing here claims Kindle support.

## 1. Automated (same day)

```
npx vitest run test/extension/bundle.test.ts --reporter=dot      # 6 passed: the built content.js evaluated in jsdom, a lookup performed; no network call, eval, module syntax or URL in the built scripts
npx vitest run test/extension test/controlled-reader test/ecosystem --reporter=dot   # see GOLEARN-TEST-REPORT.md / BASELINE for the per-file counts
```

## 2. Harness article (`harness/albanian-article.html`, 21 paragraphs, nested `<em>`/`<a>`/`<sup>`, sidebar, same-origin iframe, 2 s ticker, font slider)

| check | observed |
|---|---|
| install on the page | `window.__goLearnExtension.controller` present; module load 22.6 ms; harness status "GoLearn on"; console: no errors |
| cold lookup (command path, "zgjohet") | shown in 121 ms (metrics: selection 3.7, context 5.0, parsed 93.5, popup positioned 104.3, event queued 106.5, first info 107.3 ms; `coldStart: true`); lemma `zgjoj (VERB)`, meaning "to wake (someone)", form "third person singular, present … non-active"; recorded |
| warm lookups ("vishet", "Beni", "blen") | 2–5 ms; `vesh (VERB)`, `Beni`, `blej` |
| real pointer double-click ("lahet", frame 341×209) | selection `"lahet "` (Windows trailing space) → card `laj (VERB)` "to wash"; first info 3.0 ms |
| popup positioning at the bottom edge (word at y=386 of 409) | the card is `position: fixed`, `max-height` 70 vh (286.5 px here), `overflow-y: auto`; its box (top 114, height 287) ends inside the viewport; the long content scrolls inside the card |
| font-size change 17 → 26 px with the card open | the card stays attached to the same word and is re-placed (x 281→367, y 103→125); the word itself moved 1,000 px down; nothing crashed |
| same-origin iframe selection | lookup shown (`Beni`) |
| empty selection | status `message`: "Select a word first." |
| selection in a node removed before the lookup | status `message`: "Select a word first."; the next lookup works (`Beni`, shown) |
| dynamic re-render of section 2 | lookup inside the re-rendered section works (`blen` → `blej`) |
| page change ("Replace the article") with a card open | the card is dismissed; a lookup in the new content works (`librin` → `libër`, "definite masculine accusative singular"); the ticker kept running |
| Escape | closes the card; no shadow host left in `document.body`; no page mutation (`[data-golearn]`, `.golearn`: 0) |
| metrics | 12 lookups: 10 shown, 2 failed (the two deliberate error cases above) |

## 3. Scripts page (`harness/scripts.html`; the content script is configured with the Albanian analyser only, as the harness does; in the extension the analyser follows the enrolment)

| block | lang | word | status | reading | note |
|---|---|---|---|---|---|
| sq | sq | zgjohet | shown, 57 ms (first on this page) | `zgjoj`, rule, sentence context, ltr | — |
| de | de | liegt | shown, 4 ms | provenance none | "Not in the word list" (no German analyser configured on this page) |
| es | es | no | shown, 2 ms | provenance none | same |
| hi | hi | selection of "क" | shown, 40 ms | surface `क्ष` | the selection snapped to the grapheme cluster, never splitting a conjunct |
| th | th | แล้วก็กลับบ้าน | shown, 18 ms | 4 tokens, provenance none | an unsegmented Thai run is tokenised, nothing is claimed |
| he | he | לבית | shown, 3 ms | `dir: rtl` | direction recorded |
| ar | ar | إلى | shown, 2 ms | `dir: rtl` | direction recorded |
| abbr | en | arrived | shown, 3 ms | provenance none | abbreviation sentence boundaries did not break the context |
| quotes | sq | Ana | shown, 2 ms | lexicon | inside quotation marks |
| long (48-word sentence) | sq | dhe | shown, 5 ms | lexicon | full sentence context |
| small (12 px) | sq | vogël | shown, 3 ms | `i vogël` | — |
| big (30 px) | sq | madh | shown, 2 ms | `i madh` | — |
| end (1,200 px below the fold) | sq | fundit | shown, 3 ms | `i fundit` | scrolled into view first |

All picked words were already NFC; the NFD handling is covered by `test/extension/webGeneric.test.ts` (Albanian ë/ç in NFD input). Console: no errors.

## 4. Controlled EPUB reader prototype (`packages/controlled-reader`, `npx vite --config packages/controlled-reader/vite.config.ts --mode prototype`, port 5197)

| check | observed |
|---|---|
| `?fixture=udha` | renders "Mëngjesi - page 1 of 2"; 3 chapters in the select; the content iframe sandbox is `allow-same-origin` (no `allow-scripts`); console: no errors |
| selection ("zgjohet" inside the iframe) | adapter surface `zgjohet` (raw selection identical here), CFI `epubcfi(/6/2!/4/4/4,/1:0,/1:7)`, anchor source `range`; the reader's card shows the sentence "Beni zgjohet herët." with `sentence (confidence 0.90)`, the CFI and a Highlight control; `sourceRef` = file, title "Udha 1 — mostër (Go owner-authored sample)" |
| `?fixture=protected` | "This EPUB is protected (it has digital rights management). Go does not remove protection; use a copy without it."; 0 iframes created; no console errors |
| pagination, reflow, resize, chapter change, highlight persistence | not repeated in this pass; the 13 manual steps are in `test/controlled-reader/MANUAL.md` (run 2026-10-08) |

## 5. Classification (evidence-based, §15)

| reader | classification | evidence / why not more |
|---|---|---|
| Web pages (generic adapter) on local harness pages | **Verified partial support** | §2–§3 above: selection, context, Unicode (Latin, Devanagari, Thai, Hebrew, Arabic), popup positioning, page changes, dynamic content, error recovery. Not verified: injection by `activeTab`/`scripting` on a gesture, the context menu and keyboard command, `chrome.storage.local` quotas, `allFrames`, third-party CSP — these need the unpacked extension in Chrome (§6) |
| Web pages on a live third-party site | **Unverified** | the pane cannot inject a localhost script into a site with a CSP (see EXTENSION-PROTOTYPE-TESTS §2.1); an installed content script is not subject to the page CSP, but that was not run |
| Controlled EPUB reader (local file, prototype) | **Verified partial support** | §4: render, sandbox, selection, sentence, CFI, source reference, DRM refusal. Pagination/reflow/resize/highlight were verified manually on 2026-10-08, not today; the reader is a prototype, not an app entry (conformance audit) |
| Kindle Cloud Reader | **Blocked** | no authorised integration exists; the generic adapter refuses `read.amazon.com` and `kindle.amazon.com` (`webGeneric.ts:35`); KINDLE-INTEGRATION-FINDINGS.md; no DRM circumvention was attempted or will be |
| Kindle apps / devices | **Unsupported** | no public extension surface |
| Kobo web reader | **Unsupported** | refused by the adapter (`read.kobo.com`), marked not-supported in the setup app |
| Other web readers (publisher sites, Wikisource-style pages) | **Unverified** | expected to behave as the generic adapter, not run |

## 6. Manual steps for the owner (installed extension)

1. `npm run ext:build`; Chrome → `chrome://extensions` → Developer mode → Load unpacked → `packages/golearn-extension/dist`.
2. Open the setup page from the action popup, sign in to a local service (`npx vite-node packages/repository-service/src/main.ts --port 8790 --data data/repository --host 127.0.0.1`), enrol in Team Albania, install the pack.
3. On `sq.wikipedia.org`, select a word and press the command (Alt+Shift+G) or use the context menu: the card must appear despite the site's CSP; check `chrome://extensions` → Errors is empty.
4. Reload the tab with the card open; select in an iframe-embedded article; change the page zoom; sign out from the setup page and confirm the card now says the account is needed for history.

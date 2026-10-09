# Reader feasibility report

Status: 2026-10-08, Prompt 2 of the reset. Answers the question set for this phase:

> Can we reliably, efficiently, and permissibly integrate contextual linguistic analysis with Kindle and other
> ebook-reading environments without extracting or redistributing copyrighted books?

Short answer: **for Kindle for Web, no**, not with any permitted technique, because the reader shows pages as
bitmaps with no text in the document; the only lawful bridges are Kindle's own Copy and Notebook features, which
carry what the learner chose and no sentence context. **For ordinary web pages and for DRM-free EPUBs the learner
owns, yes**, verified in a real Chromium with measured latencies in the low milliseconds. **For Google Play Books and
Kobo, unverified**: public sources suggest DOM text may be reachable, no authorised session was available to confirm
it, and the platforms' terms leave a user-side extension unaddressed.

Evidence: `KINDLE-INTEGRATION-FINDINGS.md` (live), `EXTENSION-PROTOTYPE-TESTS.md` (measurements),
`READER-CAPABILITY-MATRIX.md` (per-capability cells with evidence class), `annex/E-reader-platform-research.md`
(public sources with citations). Decision: `READER-ARCHITECTURE-DECISION.md`.

## 1. What was built to find out

- A Manifest V3 extension prototype (`packages/golearn-extension`): activation control (per-tab switch in the action
  popup, context-menu item, Alt+Shift+G), Albanian as the only language, a user-triggered selection handler, the
  `ReaderAdapter` contract with a `web-generic` and an `unsupported` adapter, Unicode-safe extraction (NFC, grapheme
  snapping, direction), sentence context from the enclosing block, a closed-shadow-DOM card, a minimal local encounter
  record validated by the repository contract, `performance.now()` instrumentation, graceful failure on unsupported
  readers. Permissions `activeTab, scripting, storage, contextMenus`; no host permissions; nothing runs before a gesture.
- A controlled local EPUB reader (`packages/controlled-reader`) on epub.js 0.3.93 (BSD-2, unmaintained since 2023-09,
  dev dependency; an audit flag on its `@xmldom/xmldom` fallback, unused in browsers) with the repo's own DRM check in
  front, two owner-authored fixtures (`udha-sample.epub`, `rtl-sample.epub`) and a synthetic `protected-sample.epub`
  for the refusal test, and the `epub-local` adapter with CFI anchors.
- 224 automated tests across the two packages and the boundary suite; a real-Chromium run on local harness pages and
  on the controlled reader; a live inspection of Kindle for Web in the owner's own session.

## 2. Findings per environment

### A. Ordinary selectable web pages — verified full contextual (harness), installed path unverified

Word and multi-word selection, Unicode handling (Albanian, German, Spanish, Devanagari, Thai, Hebrew, Arabic), sentence
reconstruction across inline elements, popup positioning with clamp/flip/fallback, cancellation, font-size reflow,
DOM replacement and re-render, concurrent lookups: all behaved as designed in a real Chromium (§2.4 of the tests
document). Warm pipeline to a positioned card: p50 2.5 ms, p95 3.8 ms; cold start 89–95 ms (Albanian index build),
module evaluation 4–7 ms; heap ~9–14 MB. The first real run exposed one defect (an ordinary page's `window.chrome`
mistaken for the extension API), fixed and regression-tested.

Limits: selections inside a same-origin `<iframe>` are not read from the top document (an installed extension would
inject into frames; unverified); keyboard-only selection on non-editable pages needs caret browsing; the extension was
not loaded as an installed extension and not run on a third-party site (the harness could not inject into Wikipedia
because of the page's CSP and Chromium's private-network rules, neither of which binds an installed content script).

### B. Legitimate local EPUB reader — verified full contextual

Spine navigation, chapter changes, same-origin `srcdoc` iframe with `sandbox="allow-same-origin"` (book scripts do
not run), word selection inside the frame, sentence reconstruction across `<em>`/`<span>`, CFI anchors that survive
next-page, font change, resize and chapter round-trip, pagination with off-page fallback anchoring, RTL document,
and DRM refusal before rendering: measured by the lead and covered by 56 tests. This is the fallback and test
foundation for DRM-free texts the learner lawfully has; it is never a way into protected books.

### C. Google Play Books web — potentially viable, unverified; contractually unresolved

The owner is signed in but the library is empty. Public sources: Google documents "flowing text" (EPUB) vs "original
pages" (PDF) modes and define/translate on selection in flowing text; a userscript author describes a cross-origin
rendering frame on `books.googleusercontent.com` with DOM text inside; Google states "proprietary content protection
technology" on Web and publisher-set copy limits. The Google Play Terms forbid circumventing protection and modifying
content; the Google Terms forbid automated access and bypassing protective measures; neither addresses a user-side
extension reading the user's own session. Nothing was tested. Uploading the owner-authored fixture EPUB to the
owner's Play Books library would allow a legitimate test; that is an action on the owner's account and was not taken
without their say.

### D. Kobo web reader — potentially viable, unverified; contractually unresolved

No signed-in Kobo session exists in the owner's browser; `readnow.kobo.com` (Kobo Reader v1.16.0, a tolino-based
service) shows an error page without one. Public sources: a vendor claims same-origin `srcdoc` iframes per chapter
with CSS-column pagination; Kobo's help is silent on rendering, selection and dictionary; the Terms of Use page
returned 403 (unread); Terms of Sale excerpts restrict reproduction; an official annotation export exists on kobo.com
with author-approval limits.

### E. Kindle for Web — technically blocked; bridge unverified; contractually unresolved

Measured in the owner's authorised session (details in the findings document): the reader renders each page spread
as one `blob:` `<img>` (2050 × 1182) under `#kr-renderer`; the renderer subtree holds zero text nodes; a pointer
interaction layer sits above it; double-click and drag produce the reader's own overlay rectangles and popover
(highlights, Copy, Note, dictionary) while `window.getSelection()` stays empty; a page turn swaps the image element.
Public sources agree the reader moved from HTML to server-rendered pages (third-party accounts differ on the mechanism:
glyph-ID canvas rendering vs scrambled fonts). Every technique that would recover text (OCR of the bitmap, decoding
glyph data, reading the renderer's network tar, reading application state) is excluded by the directive and by the
charter, and is at minimum contractually uncertain under the Kindle Store Terms (no DRM circumvention) and the
Conditions of Use (no data-mining or extraction tools, no bypassing security). The two lawful, user-initiated bridges
are Copy (clipboard, publisher-limited) and the Notes & Highlights page (ordinary DOM); both exist (seen), neither was
exercised end to end, and neither yields sentence context unless the learner copies the sentence.

## 3. Reliability and efficiency (measured)

| | ordinary page (harness) | controlled EPUB reader |
|---|---|---|
| selection → positioned card, warm | p50 2.5 ms, p95 3.8 ms | selection 0.4 + context 0.1 + anchor 0.1 ms |
| cold start | 89–95 ms (Albanian index) | not separately measured |
| memory | 9–14 MB heap incl. the index | not measured |
| page transition | DOM replacement and re-render dismiss the card cleanly; a new lookup works | next page keeps the CFI valid; the card falls back to the corner when the word is off-page |
| failure paths | multi-block, no selection, cross-origin frame, parser failure, unsupported reader each end in one line | protected file refused with one line |

"First useful information" on a visible page was 3.5–7 ms after the trigger; the ~106 ms figures in the scripted run
are the harness's throttled animation frame (hidden pane) and are reported as such.

## 4. Permissibility (not legal advice; items for a rights lawyer)

- Reading the DOM of an ordinary page the user is viewing, after the user's gesture, with `activeTab`, is the normal
  content-script model; the Chrome Web Store treats "website content" read by an extension as user data (privacy
  policy, narrowest permissions, prominent disclosure, no scraped content beyond the feature).
- For Kindle, Kobo and Play Books, no platform statement permits or forbids a user-side lookup extension; the clauses
  that exist (no circumvention, no automated access, no extraction tools, personal use through the platform's
  software) make anything beyond the platforms' own features contractually unresolved. The decline list in
  `web-generic` keeps the prototype off those hosts until a person reviews the terms.
- Nothing in this phase extracted, stored, transmitted or redistributed any book content. Encounter rows hold a
  sentence hash, item ids, title and URL path.

## 5. Manual validation procedures (owner, authorised sessions)

- **Kindle for Web**: `KINDLE-INTEGRATION-FINDINGS.md` §8 (eight steps; 1–3 and 6 already performed by the lead).
- **Installed extension on real pages**: `EXTENSION-PROTOTYPE-TESTS.md` §6 (nine steps).
- **Google Play Books**: (1) upload `test/fixtures/epub/udha-sample.epub` (owner-authored) to the owner's Play Books
  library via "Upload files"; (2) open it in the web reader in flowing-text mode; (3) DevTools: list iframes and
  their origins; expected per public sources a frame on `books.googleusercontent.com`; (4) double-click a word; in the
  top frame and (if the DevTools context allows) in the rendering frame run `getSelection().toString()`; record both;
  (5) note the reader's own popup options; (6) switch to "original pages" if offered and repeat; (7) delete the
  uploaded book afterwards. Record date and browser version. Do not test with a purchased title until the terms
  review is done.
- **Kobo**: (1) sign in to kobo.com in the owner's own browser (no one else enters credentials); (2) open any owned
  DRM-free or Kobo-Plus title with "Read Now"; (3) DevTools: iframes, `sandbox`, `srcdoc`, same-origin check; (4)
  double-click a word and run `getSelection().toString()` in the frame; (5) note the reader's own selection popup;
  (6) open the Terms of Use from the signed-in session and record the clauses on automated access, circumvention,
  extraction and third-party software.

## 6. Verdict

Reader integration is feasible and efficient where text is in the document and the learner may read it: ordinary
pages and the learner's own DRM-free EPUBs. It is not feasible, by any permitted means, for Kindle for Web. The honest
product statement is "works on web pages and your own DRM-free books; receives what you copy from Kindle". The
project can proceed to the Go Repository implementation on that basis; the reader question does not block it, and
no Kindle claim may appear in any product text.

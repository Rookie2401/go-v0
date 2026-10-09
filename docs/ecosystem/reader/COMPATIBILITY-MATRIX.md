# Reader compatibility matrix (Prompt 2, universal reader integration)

Status: 2026-10-09. One row per platform the brief names, plus the two reading environments already verified in the
first pass. Evidence classes: **M** measured by the lead in the Chromium pane on a public page (DOM probe of selection,
context and metadata; no sign-in, no site text retained; details in §3), **F** verified against an owner-authored fixture
page that models the probed markup (`packages/golearn-extension/harness/sites/*.html`, `test/extension/sites.*.test.ts`,
jsdom; and in the pane where stated in BROWSER-TEST-REPORT.md), **P** public documentation only
(`PLATFORM-RESEARCH.md`), **U** unverified. Statuses use the brief's closed set: Verified, Partially verified,
Selection only, Unverified, Permission required, Blocked, Unsupported. Nothing untested is called complete.

## 1. The matrix

| platform | website | active language targets | browser reading | actual text-selection result | context availability | extension-popup compatibility | native app | native text-sharing | licensing status (RIGHTS-AND-PLATFORM-PERMISSIONS.md) | technical blockers | overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ordinary web page (`web-generic`) | any | all five + nb/nn by metadata | yes | word/phrase selection reads back exactly (M, harness) | full sentence from the enclosing block (M, F) | card placed at the range, clamped, re-placed on reflow (M) | n/a | n/a | the page's own terms; the registry declines reviewed-hostile hosts | injection on third-party CSP sites not run as an installed extension | **Partially verified** |
| Controlled local EPUB reader (`epub-local`) | owner's reader | all (DRM-free files) | yes (local) | exact, inside the same-origin frame (M) | full, across inline elements (M) | yes (M) | n/a (future companion) | n/a | the learner's own files; protected EPUBs refused (M) | none | **Verified** (local files) |
| Google Play Books | play.google.com/books | sq, de, es, hi, th catalogue unknown (P) | yes, account required (P); `/books/reader` redirects to the store without a session (M) | U (first pass: rendering frame cross-origin, `books.googleusercontent.com`) | U | U | Android, iOS (P) | not documented (P) | Permission required (automated-means clause; publisher copy limits) | cross-origin reader frame; no session available to this lead | **Unverified** (fallback: selection-only via the browser's `selectionText`) |
| Kobo | kobo.com / read.kobo.com | nb among the five none specific (P) | yes, account required (P); `read.kobo.com` redirects to the apps page without a session (M) | U | U | U | Android, iOS (P) | not documented | **Permission required**: terms (Oct 2026) exclude robots/extraction and forbid circumventing the presentation (M, pane reading) | declined by the registry until a person's review | **Permission required** |
| Amazon Kindle for Web | read.amazon.com | unknown (P) | yes, account required; `/landing` sign-in page (M) | **none**: bitmap/overlay reader, empty selection (first pass, M) | none | none | Android, iOS (P) | Copy / Notebook, publisher-limited (first pass) | Blocked for page text; share bridge unverified | DRM; no selectable text | **Blocked** |
| Libroteka | libroteka.al | sq | reading online only after purchase (P, M: no sample on public pages) | U | U | U | none found (P: not assumed) | none documented | Unsupported for browser reading per the research; DRM of downloads unknown | account + purchase needed | **Unverified** (fallback: DRM-free EPUB in the controlled reader) |
| Kanah | kanah.app | sq (catalogue claimed by third parties only; public sample en) | yes: `/stories/<id>/chapters/<n>/text` (M) | exact inside the same-origin paginated iframe; the top document sees nothing (M) | plain `<p>` blocks in the frame (M) → full context expected (F) | range rect inside the frame (M) | Android `al.kanah.app`, iOS id1631723729 (M) | not documented | Unverified (terms not read) | needs frame injection (`allFrames`); Albanian title needs an account | **Unverified** (most promising Albanian browser reader) |
| Tolino / Thalia | webreader.mytolino.com, thalia.de | de | yes, account required; country dialog then sign-in (M) | U | U | U | Android, iOS (P) | not documented | Unverified (terms not found) | no session | **Unverified** |
| Casa del Libro / Vivlio | ebooks.casadellibro.com | es (es-HN as a variety) | yes, account required; terms-acceptance gate then sign-in (M, not accepted) | U | U | U | Vivlio apps (P) | not documented | **Permission required**: AI-training bar and TDM reservation in the terms (P, tool translation) | no session; terms | **Permission required** |
| readAwrite | readawrite.com | th | yes, public chapters (M) | **none for the learner**: `user-select: none` on story spans and context menu disabled (M) | none (adapter refuses; never overrides the site's CSS) | n/a | Android, iOS (P) | not documented | copying not permitted by the terms (M, pane reading); no AI/automation clause | the site's own copy protection | **Blocked** |
| MEB | mebmarket.com | th | **no browser reader**: installed readers for Windows/Android/iOS (M, P) | n/a | n/a | n/a | Windows, Android, iOS, e-readers (P) | not documented | Unsupported for browser | native-only | **Unsupported** (native research target) |
| Pratilipi | hindi.pratilipi.com | hi | yes, public first parts; later parts app-locked (M) | exact; NFC; combining marks and grapheme clusters intact (M) | plain `<p>` in `.book-content` → full (M, F) | range rect available (M) | Android, iOS (P) | not documented | **Permission required**: terms of 15 Sept 2026 forbid reproduction, automated software, AI scraping/training; personal use only | legal, not technical | **Permission required** (adapter disabled; fixture only) |
| BibleGateway | biblegateway.com | sq (1 version), de, es, hi, th, nb (P) | yes, public (M) | exact in the top document (M) | full from the `<p>` after dropping `sup` verse/footnote markers (M, F) | range rect; no site popup on selection (M) | Android, iOS (P) | verse-link sharing only (P) | Permission required for retention/AI; single lookup unresolved | ad/consent iframes are not the text | **Partially verified** (probe + fixture; not the installed extension) |
| YouVersion Bible.com | bible.com | sq (4 versions), de, es, hi, th, nb (P) | yes, public (M); the chapter reader errored in the pane twice | verse card selectable on the landing page (M); chapter markup (`data-usfm`) unverified today | U on the chapter reader; F on the fixture | U | Android, iOS (P) | verse-link sharing only (P) | Permission required (API.Bible forbids LLM prompt use of copyrighted text) | client error in this environment | **Unverified** |

## 2. Scripture references

For BibleGateway and YouVersion the adapter records the reference (translation id, book as a USFM code, chapter,
verse) parsed from the URL and the verse markup, as `sourceRef.kind: 'scripture'`; the verse text itself is never
stored and the sentence is kept as a hash like any other encounter. The page title is not used because BibleGateway
titles quote the verse.

## 3. What "M" covered (2026-10-09, Chromium pane, public pages)

| page | selection | context | metadata | site popup on selection | frames |
|---|---|---|---|---|---|
| biblegateway.com passage (NIV) | Range reads back "loved"; `user-select: auto` | `<p>` with `sup.versenum` and `(A)` cross-reference markers | `html lang=en`, `content-language=en`, version/reference in the URL | none | 29 ad/consent iframes, not the text |
| bible.com verse landing | plain card | — | `lang=en`, `og:locale en_US` | — | 0 |
| bible.com chapter reader | — | — | SSR title only | — | client error "Something went wrong" |
| readawrite.com chapter | `user-select: none`, `oncontextmenu` blocked | 54 `span.highlight` in `div.loadedContent` (dynamic) | `lang=th` | none | 8 |
| hindi.pratilipi.com read page | exact ICU word; NFC; 124 combining marks / 384 clusters in one paragraph | 21 `<p>` in `.book-content` | `lang=hi`, `og:locale hi_IN` | none | 1 |
| kanah.app story reader | exact, inside the same-origin iframe; top document sees nothing | `<p>` in a CSS multi-column body | frame `lang` per story; `langId` in URLs | not tested in the frame | 1 same-origin, sandboxed |
| libroteka.al book page | no reader on the public page | — | `lang=sq`, `og:type=book` | — | 0 |
| webreader.mytolino.com, ebooks.casadellibro.com, play.google.com/books/reader, read.kobo.com, read.amazon.com | sign-in walls (Casa del Libro also a terms gate, not accepted) | — | — | — | — |
| mebmarket.com | store only; "Download App" | — | — | — | — |

## 4. Interaction modes

| mode | status |
|---|---|
| direct word selection in the top document | verified on harness pages (first pass) and probed on BibleGateway, Pratilipi (structure only) |
| selection inside a same-origin reader frame | probed on Kanah; needs `allFrames` injection in the installed extension (unverified) |
| cross-origin reader frame | Play Books (first pass): selection-only fallback through the browser's `selectionText` (fixture-tested) |
| selection prevented by the site | readAwrite: refused honestly, never overridden |
| share bridge (copy → GoLearn) | Kindle Notebook/Copy (unverified); the `#/share` screen and web share target (MOBILE-COMPANION-PLAN.md) |
| native share (Android `ACTION_PROCESS_TEXT`/`ACTION_SEND`, iOS share extension) | prospective; nothing native exists or was tested |

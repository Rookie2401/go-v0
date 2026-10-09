# controlled-reader

> **PROTOTYPE — the adapter and sentence-reconstruction logic are production candidates; the reader page is disposable.**

A local EPUB reader that the project controls end to end, and the `epub-local` ReaderAdapter that goes with it
(`docs/ecosystem/GOLEARN-EXTENSION-STRATEGY.md` §2). It is a **fallback and a test foundation** for DRM-free books the
learner lawfully has. It is never a way to import protected ebooks: a protected file is refused before anything is
rendered (`src/ingest/epub.ts` `EpubError('encrypted')`), and nothing here decrypts, strips or works around protection.

| path | what | status |
|---|---|---|
| `src/adapter.ts` | `EpubLocalAdapter implements ReaderAdapter` (the shared contract in `packages/golearn-extension/src/contract`, type imports only) | production candidate |
| `src/sentences.ts` | sentence reconstruction from a DOM selection across inline elements; neighbours; fragments; grapheme snapping | production candidate |
| `src/geometry.ts` | iframe → host coordinates, popup placement | production candidate |
| `src/open.ts` | the refusal gate (`openLocalEpub`), plain-text fallback renderer | production candidate (the gate) |
| `index.html`, `src/reader.ts`, `src/fixtures.ts`, `vite.config.ts` | the reader page, the `?fixture=` loader, the page build | **disposable** |
| `scripts/` | zip writer, EPUB builder, `make-fixture.mts` (`npm run reader:fixture`) | test tooling |

Run it: `npm run reader:build` (page build, mode `prototype`, output `packages/controlled-reader/dist`, not committed) or
`npx vite --config packages/controlled-reader/vite.config.ts --mode prototype` (dev server on 5197), then open
`/?fixture=udha`, `?fixture=rtl` or `?fixture=protected`, or choose a file. `window.__reader` and `?fixture=` exist only
in the `prototype` mode; any other mode leaves them out. Tests: `npx vitest run test/controlled-reader`; the browser
checks that jsdom cannot make are in `test/controlled-reader/MANUAL.md`.

## Rendering decision: epub.js, with the repo's own reader kept for the gate and as fallback

**Chosen: [epub.js](https://github.com/futurepress/epub.js) 0.3.93 (BSD-2-Clause) as a dev dependency**, used for the
paginated iframe rendering; `src/ingest/epub.ts` stays in front of it (the DRM refusal) and behind it (plain-paragraph
fallback, and `.txt`).

Why not render the repo reader's plain paragraphs only: that path has no pages, no spine documents, no iframe
isolation, no stable locator and no reflow, so none of the seven questions the adapter must answer
(spine navigation, chapter changes, iframe isolation, word selection, sentence reconstruction, highlight anchoring,
pagination/reflow) would get a real answer, and a lookup built on it would say nothing about a real reader.

What epub.js answered, measured (jsdom tests + the real Browser pane, 2026-10-08):

| question | answer |
|---|---|
| spine / chapter navigation | `book.spine.spineItems` in reading order; `rendition.display(index \| href \| CFI)`; `book.loaded.navigation` for the table of contents. One chapter document is displayed at a time (default manager). |
| iframe isolation | each chapter is an `<iframe sandbox="allow-same-origin">` built from `srcdoc`: same-origin with the host, so the DOM is readable; no `allow-scripts`, so a book's scripts never run. |
| word selection | a normal browser selection inside the iframe (`iframe.contentWindow.getSelection()`); epub.js re-emits it as `selected` after a 250 ms debounce. A Windows double-click selects the trailing space; the adapter trims it. |
| sentence reconstruction | not provided by epub.js; done in `src/sentences.ts` over the block's text nodes. |
| highlight anchoring | EPUB CFI (`new EpubCFI(range, cfiBase)`), re-found with `contents.range(cfi)`; stable across next/prev pages, font-size reflow, window resize and re-render (the CFI is built from the DOM path, not geometry). Highlights via `rendition.annotations.highlight` (an SVG overlay outside the book's DOM). |
| pagination | CSS columns inside one wide iframe; the container scrolls. A word on another page has an inner rect outside the reading area, so `anchor()` reports `source: 'fallback'` for it. |
| layout reflow | `rendition.themes.fontSize('120%')` re-lays the pages; `relocated`, `resized` and `layout` events; no event for the font change itself (the adapter's `setFontSize` emits one). |

Costs and cautions, recorded rather than hidden:

- **Maintenance.** `0.3.93` is the `latest` tag but was published 2023-09-26; `0.5.0-alpha.*` exists. The package is
  effectively unmaintained: fine for a prototype and a test foundation, a real risk for production. The adapter talks to
  it only through the small structural interfaces in `src/adapter.ts` (`RenditionLike`, `ContentsLike`), so a
  replacement (foliate-js was considered; it is not on npm and is a larger migration) touches one file.
- **Advisories.** `npm audit` flags its dependency `@xmldom/xmldom@0.7.13` (<= 0.8.14, serialization injection / ReDoS).
  epub.js falls back to xmldom only when the platform has no native `DOMParser`; browsers and jsdom have one, so the
  vulnerable code is not on the path. It is a dev dependency and appears only in the reader page's bundle, not in the
  Go app. Re-check before any production use.
- **jsdom limits.** jsdom has no iframe `srcdoc`, no layout, and a different `ArrayBuffer` realm (epub.js's input sniffing
  fails): the tests open with `book.open(buffer, 'binary')`, use epub.js's `method: 'write'`, and shim a few APIs
  (`test/controlled-reader/helpers/jsdom-shims.ts`). Real pagination and pixel geometry are manual checks.

## What the adapter claims

`capabilities()`: word selection, selected text available, `sentenceContext: 'full'` (confidence 0.9), adjacent context,
`stableAnchors: { kind: 'cfi' }`, popup positioning from the range rect (iframe rect + inner rect, scaled), layout changes
from epub.js events, persistent annotation (CFI highlights, local only), offline, no permissions, restriction text
"DRM-free files only; protected EPUBs refused". `validateCapabilities` from the shared contract accepts it.

Where sentence context stops (`SentenceContext.limits`): one chapter document at a time; blocks are boundaries; a
sentence the book splits over two `<p>` elements stays two; a selection over two sentences is a `fragment`; the first
and last sentences of a chapter have no `before` / `after` (the neighbouring spine item is never loaded). A sentence
that runs over a page or column boundary is whole (the page is a layout, not a document).

`declared: termsReviewed: true` in `persistentAnnotation` refers to this reader, which is the project's own; no
third-party reader terms are involved. The owner should confirm that statement before the capability is relied on.

# Reader adapter registry

Status: implemented 2026-10-09 in `packages/golearn-extension/src/adapters/` (`registry.ts`, `siteAdapter.ts`, `scripture.ts`,
`languageMeta.ts`), exercised by `test/extension/sites.*.test.ts` against nine fixture pages in
`packages/golearn-extension/harness/sites/`. The contract it implements is `READER-ADAPTER-CONTRACT.md` (code:
`src/contract/`); this document is the inventory of environments and the rules for changing it.

## 1. What the registry is

One data entry per reading environment. The content script builds its adapters from the list (`createAdapters`): one
`SiteAdapter` per `site` entry (chosen by host), then `web-generic` for every other ordinary page, then `unsupported` as the
last resort. The decline list that used to be a literal in `webGeneric.ts` is now **derived** from the entries that refuse
(`declinedHostsFromRegistry()`, exported as `DEFAULT_DECLINED_HOSTS`).

An entry holds: `readerId`, `title`, `adapter` (`web-generic` / `site` / `controlled`), `hosts` (exact host, `*.suffix`, or
`*.name.*`, each with an optional `pathPrefix`), `status`, `enabled`, `experimental?`, `termsReview`, `capabilities` (what the
adapter declares), `fallback`, `restrictions` (what the environment's terms allow, per use: see 2a), `notes`, `refusal?` (the one line shown when it refuses) and
`site?` (selectors and policies). The registry is **deeply frozen** (`Object.freeze` all the way down): nothing at run time, a fixture address
included, can change an entry's `enabled`, `status`, `termsReview` or `restrictions`.

Closed sets: **status** `verified | partially-verified | selection-only | unverified | permission-required | blocked |
unsupported`; **fallback** `selection-only | controlled-reader | share-bridge | none`; **frames** `top-only |
same-origin-frames | declare-cross-origin`.

## 2. The registry (2026-10-09)

| readerId | hosts | status | enabled | fallback | frames | dynamic | notes (probed 2026-10-09 unless stated) |
|---|---|---|---|---|---|---|---|
| `web-generic` | every other http(s) / file page | partially-verified | yes | selection-only | same-origin (by focus) | no | full context on local harness pages in a real Chromium; not yet as an installed extension on third-party sites |
| `epub-local` | none (own package) | verified | yes | none | n/a | n/a | the controlled reader; CFI anchors; DRM-free files only |
| `play-books` | `play.google.com` `/books/reader*` | unverified | yes | selection-only | declare-cross-origin | yes | redirects to the store without a session; text frame expected cross-origin |
| `kobo-web` | `read.kobo.com` | **permission-required** | no | share-bridge | n/a | n/a | redirects to the vendor's apps page; terms unreviewed |
| `kindle-web` | `read.amazon.com`, `kindle.amazon.com` | **blocked** | no | share-bridge | n/a | n/a | sign-in landing; bitmap pages, empty selection (measured earlier) |
| `libroteka` | `libroteka.al`, `*.libroteka.al` | unverified | yes | controlled-reader | same-origin | yes | book pages `/liber/<slug>/<id>`, og:type=book, lang=sq; reading only after purchase (unmeasured) |
| `kanah` | `kanah.app`, `*.kanah.app` | unverified | yes | selection-only | same-origin | yes | story reader in a same-origin sandboxed iframe, multi-column body, buttons in the top document; frame lang follows the story; language in the URL (`langName`) |
| `tolino-webreader` | `webreader.mytolino.com`, `*.tolino.*` | unverified | yes | selection-only | same-origin | yes | country dialog then sign-in (nothing accepted); same-origin iframe is a vendor claim |
| `vivlio-casadellibro` | `ebooks.casadellibro.com`, `*.vivlio.*` | unverified | yes | selection-only | same-origin | yes | terms gate then sign-in (nothing accepted) |
| `readawrite` | `readawrite.com`, `*.readawrite.com` | **blocked** | no | none | n/a | (yes) | the site sets `user-select: none` and blocks the context menu; GoLearn does not override it. Terms pending the research lane |
| `mebmarket` | `mebmarket.com`, `*.mebmarket.com` | **unsupported** | no | none | n/a | n/a | no browser reader (installed apps only) |
| `pratilipi` | `pratilipi.com`, `*.pratilipi.com` | **permission-required**, experimental | **no** | share-bridge | top-only | (yes) | Hindi story pages: `p` blocks in `.book-content`, paywalled blocks, a login popup, next part is a link; kept disabled |
| `biblegateway` | `biblegateway.com`, `*.biblegateway.com` | unverified | yes | selection-only | top-only | no | probed: selectable, context available; `main.page-content` paragraphs; `sup` markers dropped; cross-origin ad frames are not the text |
| `youversion` | `bible.com`, `*.bible.com` | unverified | yes | selection-only | top-only | yes | URL scheme confirmed; the verse-landing page has no `data-usfm`; the chapter reader showed the site's own error twice, so the `[data-usfm]` structure (the fixture) is unverified |

`termsReview.reviewed` is `false` on every entry. The type admits only `false`.

### 2a. Restrictions (contract v3, 2026-10-09)

`restrictions` is trusted configuration: the site adapter copies the ENTRY's object onto every source reference it returns
(`sourceRef().restrictions`, a copy), and the controller writes it into `subject.sourceRef.restrictions` of every event of the card. It is never
read from the page: a `<meta>`, a JSON-LD licence, a `data-*` attribute or a "public domain" banner cannot loosen it
(`test/extension/restrictions.test.ts` taints a page in all of those places and compares). The Repository additionally caps what a client
claims by its own per-reader policy, so a modified client cannot grant a permission either. `unknown` is what nobody has reviewed; consumers
treat it as `forbidden`.

Fields: `textRetention` (keep the source's words beyond their hash), `remoteProcessing` (send them to a service off the device),
`audioRetention` (keep audio made from them), `export` (include them in the learner's export), `sharing` (pass them to a team or another
learner), `reviewExamples` (use them as example sentences in review).

| readerId | textRetention | remoteProcessing | audioRetention | export | sharing | reviewExamples | why |
|---|---|---|---|---|---|---|---|
| `web-generic` | unknown | unknown | unknown | unknown | unknown | unknown | any page; nobody has read its terms |
| `epub-local` | unknown | unknown | unknown | **allowed** | unknown | unknown | the owner's own DRM-free files; the owner may export what they own; the rest awaits the owner's confirmation |
| `play-books` | unknown | unknown | unknown | unknown | unknown | unknown | commercial reader, terms unreviewed |
| `kobo-web` | forbidden | forbidden | forbidden | forbidden | forbidden | forbidden | refuses; the Terms of Sale restrict reproduction |
| `kindle-web` | forbidden | forbidden | forbidden | forbidden | forbidden | forbidden | refuses; pages are drawn as bitmaps, no text may be taken |
| `libroteka` | unknown | unknown | unknown | unknown | unknown | unknown | commercial reader, terms unreviewed |
| `kanah` | unknown | unknown | unknown | unknown | unknown | unknown | reading app, terms unreviewed |
| `tolino-webreader` | unknown | unknown | unknown | unknown | unknown | unknown | commercial reader, terms unreviewed |
| `vivlio-casadellibro` | unknown | unknown | unknown | unknown | unknown | unknown | commercial reader, terms unreviewed |
| `readawrite` | forbidden | forbidden | forbidden | forbidden | forbidden | forbidden | refuses; the site blocks selection of its text |
| `mebmarket` | unknown | unknown | unknown | unknown | unknown | unknown | refuses (native reader only); terms unreviewed |
| `pratilipi` | forbidden | forbidden | forbidden | forbidden | forbidden | forbidden | refuses until a person reviews the site's and the authors' terms |
| `biblegateway` | forbidden | forbidden | unknown | unknown | unknown | forbidden | licensed Scripture: the verse is never kept, sent off the device or turned into a review example |
| `youversion` | forbidden | forbidden | unknown | unknown | unknown | forbidden | same |

Changing a cell is a reviewed change with the evidence in the commit (a person's reading of the terms), like `termsReview`.
Contract: `packages/repository-contract/src/sources.ts`.
## 3. Rules for changing the registry

1. **`status` and `termsReview` change only with evidence or a person's review.** A status moves up (e.g. `unverified` →
   `partially-verified`) only with a measured session (what was measured, where, in which browser, recorded in
   `READER-CAPABILITY-MATRIX.md`) or a passing test that exercises the real environment; `termsReview.reviewed` becomes
   `true` only by a person's review, recorded in a reviewed commit with who, when and which terms. The type is a literal
   `false` on purpose: flipping it is a deliberate code change that the reviewer will see. Never raise a status on a hunch.
2. **A new site starts `unverified`.** No exceptions for a site that "looks like" a verified one.
3. **A refusing entry reads nothing.** `blocked`, `permission-required`, `unsupported`, or `enabled: false` makes the
   adapter's `selection()` fail with `unsupported` and the entry's `refusal` line, `context()` return `none` with the
   reason, `sourceRef()` return nothing, and `capabilities()` declare nothing. Such an entry also appears in the web-generic
   decline list. A site's own copy protection (`user-select: none`, blocked context menu) is respected: the adapter never
   injects CSS or script and never reads through it.
4. **No address in the file.** The content bundle is checked for hard-wired URLs; `termsReview.url` stays empty in the
   registry (put references in this document or the research notes).
5. **Selectors are claims about markup.** The registry's `containers` and `ignore` selectors are what the fixture and the
   public probe showed; they are *unverified against any installed session* until a measured run says otherwise, and the
   `notes` field says which.
6. The conformance audit (`test/audit/conformance.imports.test.ts`) lets exactly two reached files name a commercial
   reader: this registry and the setup page's compatibility table. Both are refusals.

## 4. How a site is added

1. Add an entry to `READER_REGISTRY` (`status: 'unverified'`, `enabled: true` unless it must refuse, `reviewed: false`, `restrictions` all `unknown` (all `forbidden` for a site that refuses on rights grounds), a note
   with what was probed and on which date). Choose `fallback` honestly; give `refusal` if it refuses.
2. Give it `site` options: `containers` (the reading area, or `[]`), `ignore` (reader chrome, footnote markers, the site's own
   lookup popup), `frames`, `dynamicContent`, `nativeLookupCoexistence`, and, for a Scripture site, `scripture` (the URL
   parser in `scripture.ts` must understand its address scheme).
3. Declare capabilities with `readable(...)` (or `refused(...)`). They must pass `validateCapabilities`; the registry test
   enforces it.
4. Write a fixture in `harness/sites/` (owner-authored sentences, a header saying so, `data-fixture-url` naming the page it
   models) and cases in `test/extension/sites.fixtures.test.ts`: surface, context, source reference, language evidence,
   anchor, chrome ignored, replacement, recovery. Add the URL to the selection-by-URL table in `sites.registry.test.ts`.
5. Run `npx vitest run test/extension test/ecosystem`. Do not raise the status.

## 4a. The harness build (the fixture hook)

The fixtures under `harness/sites/` model other sites' pages: `<html data-fixture-url="https://…">` names the address the page models, so a
browser pass can exercise the site adapter from `localhost`. That hook (`describePage` in `src/adapters/page.ts`) is **compiled only into a
harness build**:

* `npm run ext:build` (the shipped extension) defines `__GOLEARN_HARNESS__` as `false`; the branch is removed by the minifier, so the
  production `dist/content.js` (and every other shipped script) contains neither `data-fixture-url` nor `__GOLEARN_HARNESS__`
  (`test/extension/bundle.test.ts` greps them).
* `vite build -c packages/golearn-extension/vite.config.ts --mode content-harness` (run after `ext:build`; it does not clean `dist/`) writes
  `dist/content.harness.js` with the flag `true`. `harness/albanian-article.html`, `harness/scripts.html` and every page under
  `harness/sites/` load `/dist/content.harness.js`. It is never named by the manifest and is not part of a packaged extension.
* In the harness build the hook still honours **loopback hosts only** (`localhost`, `127.0.0.1`, `[::1]`).
* The fixture address decides which entry **matches** and nothing else. Refusal does not depend on matching (a `blocked`,
  `permission-required` or `unsupported` status, or `enabled: false`, refuses whatever named the page), and the frozen registry is the only
  source of `enabled`, `status`, `termsReview` and `restrictions` (`test/extension/harness.hook.test.ts`).
* Under Vitest nothing defines the flag; the code reads it from the global at call time (`globalThis.__GOLEARN_HARNESS__ = true` in a test).

## 5. Lifecycle (what the controller calls, in order)

`matches(page)` (registry host and path only; the content is never consulted) → `capabilities()` (per call) → `selection()`
(refusals, frame policy, containers and ignore selectors, then the shared Unicode-safe selection) → **language**: the
controller asks `languageEvidence()` (document / book language from `lang`, meta, og:locale, the URL's locale, a Scripture
translation) and the injected resolver, which returns `{ languageId, basis, confidence, reasons }` → `context(range, {
languageId, segmenter })` (the sentence is cut with the resolved language's pack cutter, else a locale-aware
`Intl.Segmenter`) → `sourceRef()` (never text) → `anchor(range)` → `onLayoutChange(cb)` / `isRangeLive(range)` while a card is
open → `dispose()`.

* **Dynamic sites** (`dynamicContent`): `isRangeLive` also requires the range to still read what was selected, the layout
  observer reports mutations, the controller dismisses the card when the range is gone, and the next lookup re-reads the
  live page. Nothing is prefetched or scrolled.
* **Language resolution** is a hook (`resolveLanguage(evidence)`, types in `contract/language.ts`). The controller's default
  (`defaultResolveLanguage`, marked `TODO: replaced by src/language`) trusts, in order, the learner's override, the book's
  declaration, the page's declaration (confidence ≥ 0.5) and the enrolment's language. `undetermined` shows an honest line,
  offers the installed languages (`languageChoice` on the outcome) and parses nothing. `basis` and `confidence` are recorded
  on the card model (`card.language`), on the card host (`data-language-basis`, `data-language-id`) and in the metrics row
  (`languageId`, `languageBasis`, `languageConfidence`).
* **Scripture references** are metadata kept apart from the text: `{ kind: 'scripture', translationId, book (USFM), chapter,
  verse?, languageHint? }` from the URL (BibleGateway `search`/`version`; YouVersion `/bible/<id>/<BOOK>.<ch>[.<v>].<ABBR>`), refined by
  the nearest verse-number marker (BibleGateway) or the verse wrapper's `data-usfm` (YouVersion). The adapter adds `confidence` (**0.9** when the URL
  and the verse markup both gave a reference and agree, **0.6** when only the URL did or the markup disagrees), `url` (origin, path and the
  `search`/`version` query only, as the contract asks for an http(s) address; no tracker, no fragment) and `restrictions` (the entry's). The controller
  maps it to the contract-v3 `scripture` member: `provider` (`biblegateway` / `youversion` / `other` from the registry id), `languageId` (the
  translation's language), `translationId`, `book`, `chapter`, `verse?`, `url?`, `confidence`, `restrictions`; no title, no locator, no text. The page title is never used
  (it may quote a verse). The controller writes it as the event's `subject.sourceRef`; the sentence stays a hash.

## 6. What each fixture models

| fixture | models | tests prove |
|---|---|---|
| `biblegateway-passage.html` | top-document passage under `main.page-content`, `sup.versenum` / `sup.crossreference` / `sup.footnote`, `html lang=en` plus a content-language meta, reference only in the URL, a cross-origin-style ad frame, a title that quotes the text | exact surface; `sup` markers and verse numbers dropped from the sentence; reference from URL + verse marker; no text in the reference; chrome and out-of-area selections refused; recovery |
| `youversion-chapter.html` | documented `span[data-usfm="JHN.3.16"]` wrappers, label and note spans, a verse action bar (**unverified markup**) | verse from the wrapper; labels, notes and the bar refused; html-lang → og:locale → URL-locale evidence order |
| `readawrite-chapter.html` | `lang=th`, paragraph spans filled from a template after a delay, `user-select: none`, blocked context menu, a `div.chat` block, mixed Thai/English | honest refusal with the site's reason and an untouched page; with the entry switched on in the test only: mixed-script selections kept, display:block spans as paragraphs, chat lines as lower-confidence blocks, dynamic replacement |
| `pratilipi-hindi.html` | `[lang=hi]`, `.book-content > p`, Devanagari with combining marks, a paywalled block, a login popup, a next-part link | refusal and "disabled" context reason; with the entry switched on in the test only: grapheme snapping, danda cut, element-lang evidence, chrome refused |
| `tolino-reader.html` | German text in a same-origin iframe, a toolbar overlay in the top document | frame read when focused; German pack cutter; anchor shifted by the frame; overlay ignored |
| `vivlio-reader.html` | Spanish text in a same-origin iframe, toolbar overlay | inverted marks; Spanish pack cutter; frame-only reading |
| `playbooks-reader.html` | text in a cross-origin (data:) frame | `cross-origin-frame` failure, "none" declaration, controller's word-only fallback from the browser's selection text |
| `kanah-reader.html` | same-origin sandboxed iframe chapter, buttons in the top document, `langName` in the URL | frame lang and URL-language evidence; buttons refused; "next" replacement kills the old range |
| `libroteka-reader.html` | plain article, chapter buttons that replace the content, `lang=sq` | NFC/NFD offsets; layout observer reports replacement; next chapter works |

All sentences in the fixtures are written for the tests (the Albanian lines reuse the existing harness text); none is copied
from a site, a book or a translation.

## 7. Limits

* Nothing in the registry has been exercised as an installed extension on a live site; the 2026-10-09 probes were of public
  pages in a plain browser pane, structure only. Sites behind a sign-in, a purchase or a terms gate were not entered.
* The `ignore` / `containers` selectors for sites that were not probed are the fixtures' structure plus ARIA roles.
* `readawrite` and `pratilipi` are fixtures of markup, not permission to read: see rule 3.
* The default language resolver uses declared metadata only; detection from the selection is the language lane's job.

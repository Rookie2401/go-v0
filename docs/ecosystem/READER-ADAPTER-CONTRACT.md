# Reader adapter contract

Status: implemented 2026-10-08 as code in `packages/golearn-extension/src/contract/` (`readerCapabilities.ts`,
`readerAdapter.ts`), exercised by two adapters (`web-generic`, `unsupported`) in the extension and one in the
controlled reader (`epub-local`, `packages/controlled-reader/src/adapter.ts`). The code is the contract; this document
explains it and states the rules that the type system cannot. Candidate for production (unlike the rest of the
prototype), subject to the open points in §6.

## 1. Purpose

GoLearn's parser needs, for one user-triggered lookup: the selected text, the sentence it sits in when that is
legitimately obtainable, a place to put a card, and a reference to the source that carries no text. Every reading
environment provides a different subset of that, and some provide nothing (Kindle for Web renders bitmaps). The
contract makes each environment declare what it provides, so the parser and the card never claim more than the
environment gave, and so unsupported environments fail with one honest line instead of a guess.

## 2. `ReaderCapabilities` — the declaration

| field | type | meaning | rule |
|---|---|---|---|
| `readerId` | string | the adapter's identity (`web-generic`, `epub-local`, `unsupported`) | required |
| `platform`, `version` | string? | only where discoverable from the page itself | never guessed |
| `userTriggeredSelection` | boolean | every lookup starts with the learner's selection plus a gesture or toggle | must be `true`; the contract refuses `false` |
| `wordSelection` | boolean | a word can be selected (double-click, drag) | cannot be claimed when `selectedTextAvailable` is false |
| `selectedTextAvailable` | boolean | the selection's text can be read at all | false in a cross-origin frame, a canvas or bitmap reader |
| `sentenceContext` | `'full' \| 'partial' \| 'none'` | how much of the surrounding sentence the adapter may and can obtain | `none` forces `contextConfidence` 0 and `adjacentContext` false; `full` needs confidence ≥ 0.5 |
| `adjacentContext` | boolean | neighbouring sentences obtainable | off by default in `context()` (data minimisation) |
| `stableAnchors` | `{ kind: 'dom-range' \| 'cfi' \| 'locator' \| 'none'; note? }` | how a place can be re-found later; never the text | `none` forbids `popupPositioning: 'range-rect'` |
| `popupPositioning` | `'range-rect' \| 'fixed-corner' \| 'none'` | where a card can go | |
| `layoutChangeHandling` | `'observer' \| 'manual' \| 'none'` | whether the adapter reports reflow/resize/mutation | |
| `persistentAnnotation` | `{ supported: false }` or `{ supported: true; mechanism; termsReviewed: true }` | highlighting the page persistently | only with a person's terms review; the type makes `termsReviewed` a literal `true` |
| `offline` | boolean | the lookup works without a network | |
| `contentAccessRestrictions` | string | plain statement of what the environment or its terms forbid or hide | always present, may be "none known" |
| `contextConfidence` | 0..1 | how far a sentence from this environment can be trusted as the real sentence | 0 when `sentenceContext` is `none` |
| `requiredPermissions` | string[] | browser permissions beyond the page | `[]` for the generic adapter under `activeTab` |

`validateCapabilities(c)` returns the list of contradictions (empty when consistent). The content script calls it
once per adapter and treats a contradictory declaration as `unsupported`.

`noCapabilities(readerId, restriction)` is the declaration of an environment that offers nothing.

## 3. `ReaderAdapter` — the interface

```ts
interface ReaderAdapter {
  readonly id: string;
  matches(location: PageDescriptor): boolean;              // href, protocol, host, pathname, title; no content
  capabilities(): ReaderCapabilities;                       // evaluated per call (a frame may change it)
  selection(): SelectionResult | Promise<SelectionResult>;  // { ok, surface, range, direction, snapped, frame } | { ok: false, reason, message }
  context(range, options?): ReaderContext | Promise<…>;     // { kind: 'sentence'|'fragment'|'none', confidence, sentence?, selStart?, selEnd?, before?, after?, reason? }
  sourceRef(): SourceReference | undefined | Promise<…>;    // { kind: 'web'|'ebook'|'file'|'demo', title?, locator? } — never text
  anchor(range): PopupAnchor;                               // { rect, viewport, rtl, source: 'range'|'fallback' }
  onLayoutChange(cb): () => void;                           // resize | scroll | mutation | font
  isRangeLive(range): boolean;
  dispose(): void;
}
```

Selection failure reasons are closed: `no-selection`, `empty`, `multi-block`, `too-long`, `cross-origin-frame`,
`unsupported`, `unreadable`. Each carries a one-line message the card shows verbatim.

`ReaderSelection.surface` is NFC, trimmed, snapped outward to whole grapheme clusters (a combining mark never splits
from its base), internal whitespace collapsed; `direction` is `ltr`/`rtl`/`unknown` with its source (`attribute`,
`style`, `text`, `none`).

## 4. Rules the types cannot express

1. **Read only what the learner is looking at and selected.** No scrolling, fetching, prefetching or caching of pages
   to obtain text; `context()` reads the enclosing block of the selection, nothing further, unless `adjacent` is asked
   and declared.
2. **Never defeat an access control.** Where the environment hides text (cross-origin frame, bitmap, canvas), the
   adapter returns `cross-origin-frame`/`unreadable` or declares `sentenceContext: 'none'`; it never reads
   application state, network payloads, caches or glyph data, and never OCRs pixels.
3. **Never persist page text.** The sentence exists in memory for one lookup; the encounter record holds a hash
   (`sentenceKey`) and `sourceRef` (title, URL path only). Snippet retention, if ever, is a separate consented store
   row (Repository design D4).
4. **Never claim beyond the declaration.** The controller "reconciles": a `sentence` returned under a `partial`
   declaration is downgraded to `fragment`; confidence is capped at the declared `contextConfidence`.
5. **Never modify the host page.** The card is a closed shadow-DOM host, `position: fixed`, `all: initial`, appended to
   `<body>`, carrying `data-golearn-host`; adapters ignore mutations inside it. No page text is re-coloured, wrapped or
   re-flowed; no `innerHTML` of page strings anywhere (text nodes only).
6. **Host text is untrusted.** Everything read from the page is data: it is normalised, length-bounded (`too-long`),
   and rendered with `textContent`.
7. **Declining is allowed and must be explicit.** `web-generic` currently declines `read.amazon.com`,
   `kindle.amazon.com` and `read.kobo.com` (listed in one place in `webGeneric.ts`) until their terms are reviewed by
   a person; the card then says the reader is unsupported and that nothing was read.
8. **Per-call capabilities.** The same page can hold a readable top document and an unreadable frame; the adapter
   answers for the selection at hand.

## 5. How the parser receives the limitation

`parseSelection({ surface, context })` takes `context: { kind, confidence, reason, sentence?, selStart?, selEnd?,
direction, pageLanguage }`. With `kind: 'none'` it tokenises the surface alone and the card model carries
`context.kind = 'none'` with the reason ("the reader does not provide sentence context", "the selection is inside a
frame this script cannot read", "context extraction failed"). The card model labels every field `fact` or
`analysis`; `provenance` is `lexicon` | `rule` | `none`; `confidence` is always present. Thai or Hebrew text put
through the Albanian analyser returns `provenance: 'none'`, `confidence: 0` — honest, not a guess (measured, see
`EXTENSION-PROTOTYPE-TESTS.md` §3).

## 6. What the adapters declare (the table is the first three, as measured 2026-10-08; the registry that replaced the decline literal)

**The registry (2026-10-09).** The adapters the content script uses are no longer a hard-coded trio with a decline list in
`webGeneric.ts`. They are built from `READER_REGISTRY` (`packages/golearn-extension/src/adapters/registry.ts`; rules in
`reader/ADAPTER-REGISTRY.md`): one data entry per reading environment — its hosts and path prefixes, its `status` (`verified` …
`blocked`), whether a person has reviewed its terms (the type admits only `reviewed: false`), the capabilities it declares, the
fallback offered when it cannot read, and, for a refusal, the one line shown. `createAdapters` returns one `SiteAdapter` per `site`
entry, then `web-generic`, then `unsupported`. An entry that is `blocked`, `permission-required` or `unsupported`, or `enabled: false`,
refuses and says why; it is never "just tried". The decline list of the generic adapter (`DEFAULT_DECLINED_HOSTS`) is *derived* from the
refusing entries (`declinedHostsFromRegistry()`). A site adapter reports the page's declared language as evidence (`languageEvidence()`,
metadata only, the region kept: `es-HN`) and the language resolver (`src/language/resolve.ts`) decides; the lookup is then parsed in
that language by the analyser the content script has loaded for it (below). The table that follows is the original three.

| | `web-generic` (top document) | `web-generic` (cross-origin frame) | `epub-local` (controlled reader) | `unsupported` |
|---|---|---|---|---|
| selectedTextAvailable | true | false | true | false |
| sentenceContext | full (block text nodes, split with the Albanian `segmentSentences` + danda/`؟`/`。`) | none | full (iframe DOM, same origin) | none |
| contextConfidence | 0.9 in a `<p>`/text block; lower elsewhere | 0 | 0.9 | 0 |
| stableAnchors | dom-range (not durable across reloads) | none | cfi (epub.js EpubCFI; re-found after pagination, reflow, re-render) | none |
| popupPositioning | range-rect, fallback corner off-screen | fixed-corner | range-rect via iframe-to-host conversion | none |
| layoutChangeHandling | observer (resize, scroll, mutation, font) | none | observer (relocated, resized, font) | none |
| persistentAnnotation | not supported | not supported | supported (epub.js annotations, local CFIs only; **termsReviewed: true claims the owner's own reader has no third-party terms — the owner must confirm**) | not supported |
| offline | true | true | true | true |
| contentAccessRestrictions | "does not read form fields, editable regions or cross-origin frames" | the frame | "DRM-free files only; protected EPUBs refused" | the reason |
| requiredPermissions | [] (activeTab after the gesture) | [] | [] | [] |

## 7. Open points for production (closed ones marked)

- Same-origin **frames** are read by `epub-local` (it owns the frame) but the generic adapter, injected into the top
  document only, reports `no-selection` for a selection inside a same-origin `<iframe>` (measured). An installed
  extension would inject with `allFrames: true` so each frame runs its own content script; unverified.
- `stableAnchors` for the web is `dom-range`, which does not survive a reload; a production web adapter needs a
  text-quote/position locator (W3C Web Annotation selectors) without storing text, or must declare `none`.
- `persistentAnnotation.termsReviewed` is a type-level promise; the review itself must be recorded (who, when, what
  terms) in the pack or adapter manifest.
- ~~The decline list in `webGeneric.ts` must become data (a reviewed registry with dates), not a code literal.~~ **Closed
  2026-10-09:** it is derived from `READER_REGISTRY` (§6). The "dates" half is still open: a `termsReview` records a note, not yet a
  reviewer and a date, because no person has reviewed any environment (every entry is `reviewed: false`).
- ~~The parser has no way to know which analyser a language needs.~~ **Closed 2026-10-09:** `parseSelection` stays synchronous and reads a
  language with the adapter registered for it (`registerAnalyser`, `hasAnalyser`, `PARSER_LANGUAGES` = the languages that can be
  loaded). It throws `AnalyserNotLoaded` for a known language whose analyser is not in memory and a `RangeError` for an unknown one.
  Albanian is registered by the parser itself; German, Hindi, Thai and Spanish are separate chunks the controller loads after the
  language is resolved and before it parses (`ControllerDeps.loadAnalyser`; bundle layout: GOLEARN-ARCHITECTURE.md §8).
- Import rule: the controlled reader imports this contract from the extension package; `packages/README.md` allows
  only `repository-contract` today. Either move `contract/` to its own package (`reader-contract`) or widen the rule.
  Recommended: its own package, since GoPractice never needs it and the controlled reader does.

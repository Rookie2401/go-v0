# golearn-extension — PROTOTYPE

**PROTOTYPE — disposable except `contract/`, `parser/` card model, `adapters/web-generic` (candidates for production).**

First technical prototype of the GoLearn reader extension (Manifest V3, Chrome). It looks up a word the learner selects on an ordinary web page, with the real Albanian adapter bundled, and records the encounter locally. It is a measurement and learning vehicle, not a product: no dictionary ("word list only"), one language, one reader (`web-generic`), nothing tested in a real browser yet.

Design sources: `docs/ecosystem/GOLEARN-EXTENSION-STRATEGY.md` (§2 ReaderAdapter, §3 parser, §8 risks), `RIGHTS-AND-PRIVACY-BOUNDARIES.md` §3, `annex/B-linguistic-inventory.md` (b).

## Layout

```
manifest.json               MV3: activeTab, scripting, storage, contextMenus; no host permissions; Alt+Shift+G
action/popup.html|ts        per-tab switch, language (Albanian only), encounter counter, export / delete
src/contract/               ReaderCapabilities + ReaderAdapter           (candidate for production)
src/adapters/webGeneric.ts  any ordinary page                            (candidate for production)
src/adapters/unsupported.ts declares nothing; the popup says so
src/parser/                 card model (candidate) + parser over src/adapters/sq.ts
src/popup/card.ts           shadow-DOM card, placement, dismissal, pronunciation (local voice only)
src/content/                controller (lookup flow) + content-script bootstrap
src/background/             service worker: injects on a gesture, per-tab state, context menu, command
src/store/                  encounter rows (GoEvent, validated by the repository contract) + memory store
src/metrics.ts              performance.now() marks, rows in storage, exportMetrics()
src/platform.ts             the slice of the chrome.* API used (no @types/chrome); message names
src/text.ts                 grapheme-safe slicing, FNV hash (= src/core/ids.ts), direction heuristic
vite.config.ts              one classic-script bundle per `--mode` (content | background | action)
```

Import rules (`test/ecosystem/boundaries.test.ts`): this package imports `packages/repository-contract`, and for the analyser `src/adapters/sq.ts` (+ the core types). Nothing from `src/course`, `src/ladder`, `src/stage0`, `src/library`, `src/golearn`, `src/ui`.

## Build and load

```
npm run ext:build        # -> packages/golearn-extension/dist/ (content.js, background.js, action/popup.{html,js}, manifest.json)
```

Load `dist/` with chrome://extensions → Developer mode → Load unpacked. Click the toolbar button, turn "GoLearn on for this tab", select a word. Or select a word and press Alt+Shift+G, or right-click → "Look up with GoLearn". The content script is injected by the background worker on that gesture (activeTab); nothing is declared in the manifest to run on pages.

## What it records (and does not)

A `SelectionLookedUp` event per lookup: item ids (lemma id when creditable, else form id), a hash of the sentence (`sentenceKey`, only when the context really is a sentence), the page title (≤120 chars) and URL **path** (no host, query or fragment), the context kind and confidence, and the help layers shown. The selected surface is stored only for selections of up to 4 words. It never stores the sentence, the page, or a snippet. Rows live in `chrome.storage.local`; nothing is sent anywhere (the built scripts contain no network call, checked by `test/extension/bundle.test.ts`). The learner id and enrolment are local placeholders; there is no account.

## Honest limits

- Adapter claims are bounded by `capabilities()`: a reader that declares no sentence context gets a word-only lookup, flagged `context: none` on the card and in the event.
- Every card field is labelled `fact` (what was selected, how context was obtained) or `analysis` (the reading, machine-drafted, unchecked by a native speaker). No field is labelled `inference`; there is no learner state yet.
- `web-generic` declines `read.amazon.com`, `kindle.amazon.com` and `read.kobo.com` until their terms have been reviewed (strategy §8); it does not read form fields, editable regions or cross-origin frames.
- Pronunciation uses `speechSynthesis` with a **local** `sq` voice only, labelled practice; remote voices are never used.
- Tested in jsdom against fakes (`test/extension/`), plus an evaluation of the built `content.js`.
- Run in a real Chromium on 2026-10-08 **by injecting the built `content.js` into the two local harness pages under
  `harness/`** (same-origin, served from a tiny static server): real selections, drags, font changes, DOM replacement
  and the metrics rows came from that run (`docs/ecosystem/EXTENSION-PROTOTYPE-TESTS.md`). The first run found that an
  ordinary page's `window.chrome` was mistaken for the extension API (fixed in `platform.ts`, regression test
  `test/extension/platform.test.ts`). **Not yet loaded as an installed extension** (activeTab, executeScript, the
  context menu, the command, `chrome.storage` quotas, frames via `allFrames`): the manual procedure for that is in the
  same document.
- `harness/` is disposable measurement scaffolding: `albanian-article.html` is generated from the owner-authored
  fixture sentences (`test/fixtures/epub/udha-sample.sentences.json`), `scripts.html` holds sentences written for the
  test. Neither is part of the product.

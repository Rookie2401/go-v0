# Manual browser checks for the controlled reader

jsdom has no layout engine, no iframe `srcdoc` and no real pagination, so the automated tests
(`npx vitest run test/controlled-reader`) cover the DOM, CFI, adapter and refusal logic and not these. Run them once
per change to `reader.ts`, `adapter.ts` or the epub.js version. (All of them were run on 2026-10-08 in the Browser
pane against `udha`, `rtl` and `protected`; results are in the build report, not here.)

Start the page:

```
cd /c/Users/CJWal/dev/go-v0
npx vite --config packages/controlled-reader/vite.config.ts --mode prototype      # http://localhost:5197/
```

Open `http://localhost:5197/?fixture=udha`. In the console, `__reader.adapter` is the adapter and
`__reader.rendition` the epub.js rendition (they exist only in `--mode prototype`).

1. **First page renders.** Chapter "Mëngjesi" is shown, the status line says "Mëngjesi - page 1 of N", the chapter select
   lists three chapters, Previous/Next/A-/A+ are enabled. Console: no errors.
2. **Iframe isolation.** `__reader.rendition.getContents()[0].window.frameElement.sandbox.toString()` is
   `"allow-same-origin"` (no `allow-scripts`).
3. **Real selection.** Double-click a word. The card appears next to it with the word, its sentence (the word marked) and
   a CFI. `__reader.adapter.selection().surface` has no trailing space even though
   `getContents()[0].window.getSelection().toString()` does (Windows).
4. **Sentence across inline elements.** Double-click "zgjohet" (inside a `<span>`) and a word inside an italic phrase
   ("lahet"): the card shows the full sentence in both cases.
5. **Two sentences.** Drag from the middle of one sentence into the next: the card says `fragment (confidence <= 0.5)`.
6. **Pagination keeps the anchor.** Select a word, copy the CFI from the card. Press Next until the page changes
   (or ArrowRight). In the console: `__reader.adapter.rangeFromCfi('<cfi>').toString()` still returns the word, and
   `__reader.adapter.anchor(__reader.adapter.rangeFromCfi('<cfi>')).source` is `'fallback'` while the word is on
   another page and `'range'` when you go back to its page. While the card is open, turning the page hides it.
7. **Reflow.** Press A+ twice. The text grows and repaginates; the card (if open) is re-placed or hidden; the same
   `rangeFromCfi` call still returns the word; the stored CFI computed again with `adapter.cfiOf(range)` is identical.
8. **Resize.** Narrow the window (or use the Browser pane's viewport menu: 600 x 500). Pages reflow; run
   `const seen=[]; __reader.adapter.onLayoutChange(c=>seen.push(c.reason))` before resizing and expect `resize` entries
   (and `scroll` for the relocation) in `seen`.
9. **Chapter change.** Pick chapter 2 in the select, then back. `__reader.adapter.sourceRef()` shows the title and a
   locator that starts `epubcfi(/6/4!` for chapter 2; a CFI stored in chapter 1 does not resolve (`undefined`) while
   chapter 2 is displayed and resolves again after returning.
10. **Highlight.** Select a word, press "Highlight": a yellow overlay appears. Reload with the same file: the highlight
    returns (only the CFI is stored, in localStorage; clear it with
    `localStorage.removeItem(Object.keys(localStorage).find(k=>k.startsWith('go-controlled-reader')))`).
11. **Right to left.** Open `?fixture=rtl`: text is right-aligned, `getContents()[0].document.documentElement.dir` is
    `rtl`, selecting a word gives `direction: 'rtl'`, the card text is right-to-left. Next/Previous follow the book's
    direction (epub.js reads `page-progression-direction`).
12. **DRM refusal.** Open `?fixture=protected`: the status line is red and says the EPUB is protected and that Go does not
    remove protection; the viewer stays empty; `document.querySelectorAll('iframe').length` is `0`;
    `__reader.lastOutcome` is `'refused'`. Then choose `udha-sample.epub` with the file input: it opens (the refusal
    does not stick). Choose a `.txt` file: it shows as plain paragraphs (one chapter).
13. **Non-prototype build.** `npm run reader:build` is the prototype build. For the other mode run
    `npx vite build --config packages/controlled-reader/vite.config.ts --mode production --outDir <somewhere not in the repo>`
    and open its `index.html` through any static server: `window.__reader` is `undefined` and `?fixture=` does nothing.

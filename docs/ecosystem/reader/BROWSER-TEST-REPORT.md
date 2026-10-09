# Browser-level test report (Prompt 2, universal reader integration)

Status: 2026-10-09, Chromium pane of the desktop app. Two kinds of browser evidence: **live probes** of public reader
pages (DOM inspection of selection, context and metadata; no sign-in, no site text retained; §1) and the **fixture
pass** of the final `content.js` on the nine owner-authored site fixtures served from `localhost` (§2). Neither is an
installed-extension run on a third-party site; §4 lists what that still requires. Automated coverage is in §3.

## 1. Live probes (public pages)

See `COMPATIBILITY-MATRIX.md` §3 for the table. In one line each: BibleGateway selectable in the top document with
`<p>` context and verse/footnote `sup` markers; Bible.com verse card selectable, chapter reader threw its own client
error twice; readAwrite blocks selection by CSS and disables the context menu; Pratilipi fully selectable Devanagari
(NFC, clusters intact) but permission-bound; Kanah's reader is a same-origin sandboxed paginated iframe whose
selection the top document cannot see; Libroteka shows no reader on public pages; Tolino, Casa del Libro, Play Books
and Kobo sit behind sign-in (Casa del Libro also behind a terms gate, not accepted); MEB has no browser reader;
Kindle is the sign-in landing page. Terms of readAwrite and Kobo were read in the pane (RIGHTS addendum).

## 2. Fixture pass on the final content script

Build: `npm run ext:build` (content 337,772 B; background 340,814 B; analysers sq 201,680 / es 167,110 / de 329,984 /
hi 405,574 / th 172,906 B + a shared 8,244 B chunk; `web_accessible_resources: analysers/*.js`). The fixture pages carry
`<html data-fixture-url>` naming the site they model; the registry honours that attribute **only on loopback hosts**,
so the site adapter is exercised without touching a real site. Selections were made with real DOM Ranges; frames were
focused as a double-click would focus them; results read from the controller's return value and metrics.

| fixture (models) | adapter chosen | result |
|---|---|---|
| `kanah-reader.html` (Albanian chapter in a same-origin paginated iframe) | `kanah` | shown: `libër` (NOUN), context sentence, language `sq` from `html lang` (0.8); the top document's own selection is empty, the frame's is read once the frame has focus |
| `tolino-reader.html` (German, same-origin frame) | `tolino-webreader` | shown: `Garten` (NOUN, masc. acc. sg.) — first lookup 827 ms of which **470 ms loading the German analyser chunk** on demand; second lookup `Straßenbahn` (one token, compound kept) 39 ms |
| `vivlio-reader.html` (Spanish, same-origin frame) | `vivlio-casadellibro` | shown: `duerme` → `dormir` (VERB, 3sg pres.), analyser load 72 ms, total 110 ms; `biblioteca` 11 ms |
| `pratilipi-hindi.html` (Hindi, `.book-content > p`) | `pratilipi` (disabled, permission-required) | refused: "GoLearn is switched off for this site until its terms have been reviewed. Nothing was read."; flipping the entry's `enabled` flag from the page does not bypass the status refusal |
| `readawrite-chapter.html` (Thai spans with `user-select: none`, dynamic load) | `readawrite` (blocked) | refused: "GoLearn cannot read this site: it prevents text selection (user-select: none, context menu disabled). Nothing was read."; no CSS injected; the spans stay unselectable |
| `biblegateway-passage.html` (English NIV page, verse/footnote markers) | `biblegateway` | context sentence 68 chars with every `sup` marker dropped; `sourceRef = { kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16, languageHint: 'en' }` with no verse text; language: **undetermined** with the choice of the five installed languages ("will not guess"), because the page declares English, which no pack covers, and the team default is not used against a declared language |
| `youversion-chapter.html` (`[data-usfm]` verses) | `youversion` | `sourceRef = { kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16 }` (verse from the selection's `data-usfm` wrapper, version from the URL); language undetermined with the same honest choice |
| `playbooks-reader.html` (cross-origin reader frame) | `play-books` | direct lookup: "This selection is inside a frame GoLearn cannot read."; the selection-text path (what the context menu/command supplies) gives `libër` with `context: none` — the selection-only fallback |
| `libroteka-reader.html` (Albanian top document) + two owner-authored test paragraphs added for timing | `libroteka` | `mëngjes` (NOUN) 109 ms incl. parse; Hindi `किताबें` → `किताब` (NOUN) with the Hindi chunk loaded in 127 ms (total 208 ms), then 7 ms; Thai `ตลาด` (NOUN, lexicon 0.92) with the Thai chunk loaded in 36 ms (total 54 ms), then 6 ms; each paragraph's own `lang` decided the language |

Measured latencies (one machine, warm pane, N = 1–2 per cell; not a benchmark): Albanian inline parse 100–110 ms
first lookup; German analyser chunk 470 ms, Spanish 72 ms, Hindi 127 ms, Thai 36 ms (sizes above; the German and
Hindi chunks are the largest); every warm lookup 6–39 ms.

Defect found and fixed during the pass: a page reliably declaring a language no pack covers fell through to the team
default and an English verse was parsed as Albanian ("Not in the word list", confidence 0); the resolver now ends in
`undetermined` with the language choice in that case (detection from real text still runs for mislabelled pages).
A second harness-only fix: the site adapter's page URL follows the same loopback fixture hook as adapter matching, so
Scripture references on fixtures carry the modelled version.

## 3. Automated tests behind this report

```
npx vitest run test/extension test/reader-languages test/language-packs test/multilang test/golearn-app test/golearn-share test/golearn-e2e test/ecosystem test/audit/conformance.*.test.ts test/audit/rights.dist.test.ts test/certification --reporter=dot
```
Registry (42), fixtures (44), controller language plumbing (21), analyser loading (14), bundle ceilings, resolver (59),
pack capabilities (36), experimental packs (36), reader support (12), five language lanes (122, of which 15 `it.fails`
"LIMIT" cases documenting analyser shortfalls), share contract (29), share screen (13); the integration run was
2,573 tests green before the two fixes above, and the extension and language suites (637) after them. The
whole-repository gate is in the completion report.

## 4. Manual steps that remain (owner)

1. Load `packages/golearn-extension/dist` unpacked in Chrome; confirm `analysers/*.js` load on a German/Spanish/Hindi/Thai page (`chrome://extensions` → Errors empty).
2. Kanah: with an account and an Albanian title, select a word inside the reader frame; confirm the card and that `allFrames` injection reaches the frame.
3. BibleGateway and Bible.com in the real browser: select a word in an Albanian version; confirm the card, the Scripture reference in the diagnostics export, and that no verse text appears in any event.
4. Play Books, Tolino, Casa del Libro with the owner's own accounts and an owned or uploaded DRM-free title: record selection, context, popup and page-turn behaviour; do not accept terms on the team's behalf without reading them.
5. Android Chrome: install the hosted setup app as a PWA and share text from a reader app to it (MOBILE-COMPANION-PLAN.md §8).

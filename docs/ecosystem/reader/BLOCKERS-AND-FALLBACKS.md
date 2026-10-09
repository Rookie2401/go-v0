# Blockers and fallback paths (Prompt 2, universal reader integration)

Status: 2026-10-09. For each blocker: what blocks, what we will not do, and the lawful path that remains. The
registry (`packages/golearn-extension/src/adapters/registry.ts`, documented in `ADAPTER-REGISTRY.md`) carries the
same facts as data: `status`, `enabled`, `fallback`, `termsReview.reviewed: false`.

| # | blocker | platforms | what we do not do | fallback that remains |
|---|---|---|---|---|
| B1 | **No selectable text**: the reader draws bitmaps/overlays | Kindle for Web | OCR, pixel reading, reading application state or caches, DRM removal | the reader's own Copy/Notebook (publisher-limited) pasted into the `#/share` screen (clipboard import, user-initiated); DRM-free books the learner owns in the controlled local reader; nothing for Kindle purchases |
| B2 | **Selection prevented by the site** (`user-select: none`, context menu disabled) | readAwrite | injecting CSS or scripts that re-enable selection or copying | none in the browser; the adapter says so in one line; the mobile app's sharing is unknown (research target) |
| B3 | **Terms forbid our interaction model or need consent** | Pratilipi (reproduction, automated software, AI scraping/training, personal use), Casa del Libro (AI-training bar, TDM reservation), Kobo (robots/extraction, presentation circumvention), Bible providers (retention and LLM use of copyrighted text) | enabling the adapter, retaining snippets, remote AI, distributing a site-targeted extension before a person's review | fixture-only development; original fixture passages (Hindi/Spanish/Thai written for the tests); public-domain Bible versions (API.Bible permits those for LLM use per the research); counsel questions in RIGHTS-AND-PLATFORM-PERMISSIONS.md |
| B4 | **Account walls** (no session available to the lead) | Play Books, Kobo, Tolino/Thalia, Casa del Libro, Libroteka, Kanah (Albanian titles) | creating accounts, signing in, buying, uploading the fixture to someone's account without their say | the owner's manual verification steps (BROWSER-TEST-REPORT.md §manual); fixtures modelled on documented/probed markup until then |
| B5 | **Cross-origin reader frame** | Play Books (first pass) | reading the frame | selection-only through the browser's `selectionText` on a gesture (`contextMenus`/command); no sentence context, said plainly |
| B6 | **Same-origin reader frame** | Kanah, Tolino and Vivlio (expected) | nothing | `allFrames` injection in the installed extension; the generic adapter already reads a same-origin frame it is injected into (unverified as an installed extension) |
| B7 | **No browser reader at all** | MEB | screen scraping, accessibility-service overlays | native-app research target: Android `ACTION_PROCESS_TEXT`/share sheet IF the app exposes them (unknown), else nothing |
| B8 | **Client error in the test environment** | YouVersion chapter reader | guessing its markup as verified | fixture from the documented `data-usfm` markup; re-probe in the owner's browser |
| B9 | **Language not installed / undetermined** | any page in a language with no pack; a one-word selection in an ambiguous Latin-script language | guessing a language from one word | the card offers the installed languages (`languageChoice`); the learner's explicit override wins thereafter |
| B10 | **Bundle size** with five analysers | the extension itself | shipping every analyser in the content script | Albanian inline; other analysers as lazily imported web-accessible chunks (GOLEARN-ARCHITECTURE.md "Bundle layout") |
| B11 | **No native integration exists** | all mobile apps | claiming app interoperability | the web share target and `#/share` screen (Android Chrome PWA, manual install); the Android `ACTION_PROCESS_TEXT` activity as the first native step (MOBILE-COMPANION-PLAN.md) |
| B12 | **Native-speaker review and Norwegian** | all packs; nb/nn | labelling experimental packs as reviewed | packs report `level` and `reviewStatus`; nb/nn stay planned and resolve to `undetermined` unless injected |

## The one rule behind every row

A technically functional adapter is not approved for distribution. Status and `termsReview` change only with evidence
(a measured run) or a person's review (dated, in the registry notes). Until then the adapter is honest about what it
cannot do and never widens its own permissions.

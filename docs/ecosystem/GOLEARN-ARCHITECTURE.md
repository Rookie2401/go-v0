# GoLearn — architecture as implemented

Status: 2026-10-08, Prompt 4. This replaces the plan-level parts of `GOLEARN-EXTENSION-STRATEGY.md` with what exists.
Facts about tests and numbers are in `GOLEARN-TEST-REPORT.md`; installation in `GOLEARN-INSTALL-AND-TROUBLESHOOTING.md`.

## 1. The parts

```
packages/golearn-extension/
  src/background/   the privileged side (service worker): session, service config, API client, sync queue + client,
                    learner-model cache, dictionary shards, recorder, message router with sender checks
  src/content/      the content script: capture → context → parse → card → events, one closed-shadow card per page
  src/parser/       the pipeline over the Albanian adapter: tokens, candidates, morphology, constructions, phrases,
                    sentence words, card model with fact / analysis / inference labels
  src/popup/        the layered card (Layer 1–5), pronunciation button (GoListen device provider), review mark,
                    correction form
  action/           the toolbar popup: per-tab switch, connection and sync status, "Open setup"
  app/              the setup / onboarding application = the extension's options page, also built as a hosted web app
packages/golisten/          shared pronunciation subsystem (contracts, registry, providers, assessment interface)
packages/language-packs/    manifests, the Albanian pack runtime/installer/validation/tutorial, planned packs, TEAMS
packages/repository-*       the Go Repository (Prompt 3): the only place learner state lives
```

Boundaries (tested): the extension and the app import the contract, GoListen, the language packs, the sync client and
the typed API client of the service; nothing else. GoListen and the packs import no application. The content script
imports no network or storage code at all (its built bundle is checked for `fetch(`, `XMLHttpRequest`, storage and
token keys).

## 2. The user experience that exists

1. Install or open GoLearn: the extension is loaded from `dist/` (Chrome Web Store later); the setup page is its
   options page and also a hosted web app that can only *explain* how to install the extension.
2. Create or connect a Repository account: the setup page sends email and password to the background worker, which
   talks to the service; the token lives only in the worker's `chrome.storage.local`.
3. Select a mission team (`TEAMS`: Albania, Honduras, Germany, India, Thailand, Norway with an explicit written
   standard) and 4. the language and variety; team and language are separate ids on the enrolment.
5. Install the language pack: the installer checks the dictionary manifest and a shard, runs the pack's 14 validation
   selections through the real analyser, and records the verification; planned packs say so.
6. Enable the reader integration: per tab, from the toolbar button, Alt+Shift+G or the context menu (`activeTab`).
7. Orientation: 15 Albanian steps (letters, sounds, words, two patterns, an original passage, concept cards); the
   practice steps use the real parser and card; skippable and repeatable; its encounters are recorded with
   `producer.surface = 'tutorial'`. 8. The concept cards teach GoLearn itself.
9. Open a page or a DRM-free EPUB in the controlled reader; 10. select a word or phrase; 11. the card; 12. the
   pronunciation button (honest states, see §5); 13. the card stays out of the way (fixed, dismissible, no page
   changes); 14. events queue locally and sync in the worker; 15. after GoPractice writes evidence, the worker refreshes
   its learner-model cache after each sync, and the next lookup reads it.

## 3. The lookup pipeline (content script, measured marks in italics)

capture (`getSelection`, NFC kept, grapheme-safe) → *selectionObtained* → context from the enclosing block via the
ReaderAdapter (full / fragment / none, confidence) → *contextExtracted* → tokenize the sentence (Albanian adapter) →
candidate lemmas → morphology (feature structure, construction ids `morph:sq:<POS>:<features>`) → phrases → syntax
notes (the adapter gives no dependency roles; the card says "role: not available from this analyser") → pronunciation
notes → *parsed* → card shown → *popupPositioned*, *firstInfoShown* → in parallel and never blocking: dictionary gloss
from the worker (*glossArrived*), learner model for the unit ids (*profileArrived*), the encounter event to the worker
(*eventQueued*).

Capability negotiation: the card states what it has ("context: full sentence" / "only the selected word" / "a
fragment"); readers that provide nothing get the one-line unsupported state.

## 4. The layered card

| layer | content | event when opened |
|---|---|---|
| 1 | form, likely meaning (lexicon gloss, then the dictionary's with its CC BY-SA attribution), lemma + POS, morphology line, context line, confidence + provenance, the `inference` learner line, Pronounce | `SelectionLookedUp` + `AnalysisShown` |
| 2 Form | feature table with the pack's plain-language explanations (only features present) | `AssistanceRequested {morphology}` |
| 3 Phrase & syntax | constructions found, phrases, the role line, syntax notes | `AssistanceRequested {example}` |
| 4 Grammar | why the form appears (pack construction explanation; depth label / brief / explanatory from preferences) | `AssistanceRequested {grammar, depth}` |
| 5 English rescue | word-by-word lemma + gloss list; "there is no machine translation" | `AssistanceRequested {translation}` |
| actions | Review this (`ItemMarked saved`), This analysis is wrong (correction form → `AnalysisCorrected` + `POST /corrections`), Pronounce (`PronunciationPlayed` only when audio really played) | |

Adaptive order: when a construction the form realizes has more negative than positive grammar evidence in the
learner model, its hint moves above the meaning; a never-seen word gets the meaning first. Every layer stays reachable.

## 5. GoListen in GoLearn

The device provider only (strict language match: an English voice is never used for Albanian); remote (Azure
`sq-AL-*`, behind consent and the owner's key) and recorded voices are not played from pages in this version because
the content bundle may not contain network code; the registry states for Albanian: no recordings, no device voice on
this machine, remote voices unverified synthetic practice, never evidence. The assessment interface for GoReview is
defined (`AudioStimulus`, `AssessmentSource`, scoring metadata that maps onto `ListeningAssessed`).

## 6. Security boundaries

- Content scripts: messaging only; no storage, no token, no network; page text rendered as text; glosses and
  explanations from the worker rendered as text; unit ids validated by pattern.
- Worker: accepts messages only from this extension (`sender.id`); tabs may send content messages only; pages (the
  setup page, the popup) may also manage the connection; service URL must be https or localhost; dictionary base
  https, localhost or the extension's own origin.
- Permissions: `activeTab`, `scripting`, `storage`, `contextMenus`, `alarms`; no host permissions.
- Events are re-attributed by the worker to the session's learner; without a session they wait under a local
  pseudonymous id and are re-attributed on sign-in; another account's queued events are never sent under the new one.

## 7. What is deliberately not here

No course, shelves, bundled library or Scripture corpus; no automatic logging of visible words; no snippet retention
(switch shown disabled with the reason); no machine translation; no claim of Kindle support (copy/paste only); no
claim of pronunciation quality for Albanian.

## 7a. What a lookup event says (contract v3, 2026-10-09)

`SelectionLookedUp` carries, besides the word, hashes and counts, two more facts about HOW the lookup was decided and WHERE it came from. Both are
metadata; neither holds page text.

* `payload.language = { languageId, varietyId?, basis, confidence, source?, override }` — the one resolution the controller made
  (`buildSelectionEvent` takes the controller's `LanguageInfo`): `basis` is `override | book-metadata | document-metadata | detection |
  team-default` (an `undetermined` language parses nothing and records nothing), `source` the declaration's own label (`html-lang`,
  `scripture-translation` …), and `override === (basis === 'override')`. The card model (`card.language`), the card host
  (`data-language-basis`, `data-language-id`), the metrics row and the event are the same decision. The no-pack event carries it too. On the
  setup page's share screen the learner's own choice of language is an `override` (confidence 1); the enrolment's language is a
  `team-default` (0.3), which is also what the orientation records. `golearn-share`'s `encounterFromShare` mirrors `languagePayload`; the
  equality test (`test/golearn-share/event.test.ts`) keeps the share event and the browser event identical.
* `subject.sourceRef` is the contract's typed union: `web | ebook | file | demo` (`title`, `locator`), `scripture` (`provider`,
  `translationId`, `languageId?`, `book`, `chapter`, `verse?`, `url?`, `confidence`) and `share` (`mechanism`, `sourceApp?`, `title?`,
  `locator?`; built by `golearn-share`, always present because the mechanism is known). Every member may carry `restrictions` — what the
  environment's terms allow — which come from the registry ENTRY (docs/ecosystem/reader/ADAPTER-REGISTRY.md §2a), never from page metadata; a
  share's are all `unknown`.
* `PackInstalled.payload = { packId, packVersion, analyzerId?, analyzerVersion?, level, validation }`, written by the setup page's installer
  when an install completes: `level` from `levelOf(manifest)` (`installable | experimental | planned`), `validation` from `validationOf(manifest)`
  (installable + machine-drafted = `unreviewed`, partly reviewed = `incomplete`, reviewed = `production-validated`, experimental =
  `experimental`, planned = `unsupported`), lowered to `incomplete` when a validation case did not match at install. The Repository uses
  `level` and `validation` to caveat evidence that rests on an experimental or unreviewed analyser.

## 8. Bundle layout

Five languages are usable, but only Albanian is in the scripts that run on every page. German, Hindi, Thai and Spanish are
**analyser chunks** — ES modules, one per language — that the content script imports the first time a lookup resolves to that language.

| file | what it holds | loaded |
|---|---|---|
| `content.js` | the controller, the reader adapters, the card, the language resolver, the parser and the **Albanian** analyser | injected on a gesture |
| `background.js` | the service worker: session, sync, recorder, dictionary glosses through the pack runtime, with **Albanian** as its only analyser | the browser starts it |
| `analysers/{sq,es,de,hi,th}.js` (+ one small shared chunk) | the adapter of that language, exported as `adapter` | by `import()`, on demand; listed in the manifest's `web_accessible_resources` (`analysers/*.js`, `<all_urls>`) because the content script runs on any reading site |
| `action/popup.js` | the toolbar popup | when opened |
| `content.harness.js` | the same content script with the fixture hook (`<html data-fixture-url>` on loopback hosts) compiled in; **harness pages only**, built by `--mode content-harness` after `ext:build`, never named by the manifest, never shipped | by `harness/*.html` and `harness/sites/*.html` |
| `app/app.js` | the setup page: screens, pack installer, orientation; Albanian linked in, the other analysers imported by URL from `analysers/` | when the options page opens |
| `dist-web/assets/*.js` | the hosted setup page; Vite splits the analysers into chunks (`src/analysers/loaders.ts`, one dynamic import per language) | on demand |

Sizes (minified, `npm run ext:build` and the options build; `test/extension/bundle.test.ts` asserts the ceilings and prints every file):

| file | before (all five inline) | now | ceiling |
|---|---|---|---|
| `content.js` | 1,406,237 B | 346,627 B (339 KB) | 520 KB |
| `background.js` | 1,420,284 B | 347,363 B (339 KB) | 520 KB |
| `app/app.js` | 1,526,494 B | about 449,000 B (438 KB) | 650 KB |
| `analysers/sq.js` / `es.js` / `de.js` / `hi.js` / `th.js` | — | 197 / 163 / 322 / 396 / 169 KB | — |

How it fits together:

- **The registry.** `src/parser/registry.ts` holds the loaded adapters. `parseSelection` is synchronous and reads from it. The parser registers
  Albanian itself; a chunk's loader registers the others (`registerAnalyser`).
- **Loading.** After the language of a selection is resolved the controller asks `loadAnalyser(languageId)` if `hasAnalyser` is false: it shows
  "Loading the <language> analyser…", the content script imports `chrome.runtime.getURL('analysers/<id>.js')` (on a harness page without
  `chrome.runtime`: `/dist/analysers/<id>.js` of the page's origin), registers the adapter and the card follows. The time is recorded as
  `analyserLoadMs` in that lookup's metrics row (absent when nothing was loaded). A failed load is a message — "GoLearn could not load the
  <language> analyser, so it will not guess" — a failed metrics row and no event; the next lookup tries again. A page that declares no
  language is decided by comparing the selection with the installed packs' word lists; the lists that are not loaded are loaded and the
  resolver is asked once more.
- **The worker cannot `import()`** (dynamic import is disallowed in service workers), so it does not carry the analysers at all. It needs
  an analyser only to spell a lemma the way the dictionary does before a lookup. For Albanian it has one; for another language the content script,
  which has the analyser loaded, sends the dictionary spellings with the gloss request (`GlossRequest.forms`: the normalised lemma and the analyser's
  variants), and the pack runtime's own analyser there is the tokenize-only fallback, which says so in `coverageNotes()`. The pack runtime takes its analysers from
  `packages/language-packs/src/builtins.ts` (all five, for GoPractice, servers and tests); the extension's builds swap that module for
  `src/analysers/builtins.ts` (Albanian plus whatever the parser registry holds) with the `golearn-lean-builtins` plugin of `vite.config.ts`.
- **Build.** `npm run ext:build` = `--mode content`, `--mode background`, `--mode action`, `--mode analysers` (`vite.config.ts`). The setup page
  is built separately (`app/vite.config.ts`): the options build is a classic script and imports the extension's chunks by URL
  (`__GOLEARN_ANALYSERS__ = 'url'`, `app/analysers.ts`); the web build splits chunks.
- **Rights and conformance.** The chunks are entries of the import-graph audit (`test/audit/conformance.imports.test.ts`) and part of the
  `dist/` scan (`test/audit/rights.dist.test.ts`). They contain no network call and no dynamic code (`bundle.test.ts`).

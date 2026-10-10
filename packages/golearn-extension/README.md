# golearn-extension — the reading-acquisition client

The GoLearn reader extension (Manifest V3, Chrome). The learner selects a word on an ordinary web page; the extension shows a **layered card** (what the word is here, its form, its phrase and syntax, why the form appears, a word-by-word rescue), plays a pronunciation, consults the learner model, and records what happened as Repository events that sync to the learner's account. The page never sees any of that: all of the Repository connection lives in the background worker.

Status: built and unit-tested against the real service handler and fakes (`test/extension/`, 22 files). **Not yet loaded as an installed extension in a real browser** since the 2026-10-08 harness run (`docs/ecosystem/EXTENSION-PROTOTYPE-TESTS.md`); the manual procedure there still applies, plus: sign in from the setup page, look a word up, open each layer, check the account's events.

Design sources: `docs/ecosystem/READER-ARCHITECTURE-DECISION.md`, `GOLEARN-EXTENSION-STRATEGY.md`, `RIGHTS-AND-PRIVACY-BOUNDARIES.md`, the Repository design (`GO-REPOSITORY-DESIGN.md`).

## Two sides

```
 web page ── content script (UNPRIVILEGED) ──chrome.runtime.sendMessage──▶ background worker (PRIVILEGED) ──fetch──▶ Repository service
              no token, no learner id,                                       session, sync queue, profile cache,        dictionary host
              no storage, no network                                          dictionary shards, settings
```

* **Content script** (`src/content/`, `src/popup/`, `src/parser/`): selection → context → the bundled Albanian analyser → card. Its only way out of the page is a message to the background. The built `content.js` contains no `fetch(`, no `XMLHttpRequest`, no storage access and no token key (`test/extension/bundle.test.ts` checks the text of the file). Pronunciation uses **GoListen's device provider** only (strict language match; a non-local browser voice needs consent).
* **Background worker** (`src/background/`): the Repository connection, the durable event queue, sync, the learner-model cache, dictionary glosses, grammar explanations, settings. It checks every message sender (see Security).
* **Action popup** (`action/`): connection status, per-tab switch, language, sync state, "Open GoLearn setup" (`chrome.runtime.openOptionsPage()`), export / delete.
* **Setup page** (`app/`, built by its own `app/vite.config.ts`, declared as `options_page: app/index.html`): not part of this config. Build it **after** `npm run ext:build` (the content build clears `dist/` but keeps `dist/app/`).

## Layout

```
manifest.json               MV3; options_page app/index.html; permissions below; no host permission by default (optional for GoLearn Active); Alt+Shift+G
action/popup.html|ts        connection, Practise, per-tab switch, GoLearn Active (switch, Speak on click, legend, withdraw), language, sync, export / delete
src/active/*.ts             GoLearn Active: levels and legend, the exclude list from the registry, CSS highlights, the page scan
src/content/active.ts       GoLearn Active on the page: language, scan, learner-model batches, click to look up, speak, stop
src/background/active.ts    GoLearn Active in the worker: the switches, the permission check, the dynamic content script, broadcast
src/protocol.ts             message payloads and validators shared by both sides (no runtime dependency)
src/platform.ts             the slice of chrome.* used (ChromeApi for the worker and pages, ContentChromeApi for the page script); MSG names
src/background/core.ts      injection on a gesture, the message router + sender checks, status
src/background/session.ts  golearn:service / golearn:session; connect, createAccount, disconnect, enrol, https-or-localhost check
src/background/recorder.ts  golearn:record: replaces the placeholder identity, validates, writes the log and the queue; re-attribution
src/background/sync.ts      createLocalQueue + createSyncClient with a Transport over the API client; debounce, alarm, 401 handling
src/background/profile.ts   GET /knowledge + /preferences, cached; refreshed after each sync
src/background/gloss.ts     language-pack runtime in the worker: dictionary glosses, shard cache, feature / construction explanations
src/background/settings.ts  golearn:settings (privacy switches)
src/content/controller.ts   the lookup pipeline (below) and the card's interactions
src/content/services.ts     the message bridge (status, profile, gloss, explain, correct, record, metrics) with timeouts
src/content/voice.ts        GoListen device provider as the card's pronouncer
src/popup/card.ts|view.ts   the layered Shadow-DOM card and its later-arrival state
src/parser/                 card model + parser over src/adapters/sq.ts (features, constructions, syntax notes, sentence words)
src/adapters/ src/contract/ the reader registry (registry.ts), the configurable site adapter, web-generic, unsupported; the ReaderAdapter contract + language-resolution types
harness/sites/              nine owner-authored fixture pages, one per modelled reader (see docs/ecosystem/reader/ADAPTER-REGISTRY.md)
src/store/index.ts          encounter log (GoEvent rows) and the builders of every event the card produces
src/metrics.ts              performance.now() marks (five core + eventQueued / profileArrived / glossArrived)
```

Import rules (`test/ecosystem/boundaries.test.ts`): this package may import `repository-contract`, `repository-sync`, `golisten`, `language-packs`, and only `repository-service/src/api` of the service; plus `src/adapters/sq.ts` and the core types. The background build replaces the service's request handler (which `api.ts` imports for its in-process client) with an empty stub, so the worker does not carry the server.

## Reader adapters (the registry)

`src/adapters/registry.ts` is the one place that says which reading environments exist, which hosts an adapter answers for, how far each is verified (`verified | partially-verified | selection-only | unverified | permission-required | blocked | unsupported`), whether a person has reviewed its terms (`termsReview.reviewed`, a literal `false` in the type), what the adapter declares, and what the learner is offered when it cannot read (`selection-only | controlled-reader | share-bridge | none`). The content script builds its adapters from it (`createAdapters`): a `SiteAdapter` per site entry, then `web-generic`, then `unsupported`.

* **`SiteAdapter`** = `web-generic` + the entry's options: reading-area selectors (a selection outside is refused with `unsupported` and a message), elements to ignore (reader chrome, footnote markers, the site's own lookup popup), a frame policy (`top-only | same-origin-frames | declare-cross-origin`), a `dynamicContent` flag (chapters replaced by script: the live range is re-checked, nothing is prefetched), `languageEvidence()` (nearest `lang`, `html[lang]`, `meta` language, `og:locale`, a locale in the URL, a Scripture translation's language) and a `sourceRef()` built from documented page facts only. Scripture sites give `{ kind: 'scripture', translationId, book, chapter, verse?, languageHint? }` from the URL (never verse text, never the page title), carried on the event's `subject.sourceRef`.
* **Refusing entries** (`blocked`, `permission-required`, `unsupported`, or `enabled: false`) read nothing and say why; a site's own copy protection is never overridden.
* **Language resolution** is injected: `resolveLanguage(evidence)` (types in `src/contract/language.ts`). The controller passes the resolved language to the parser and to the sentence cutter (`segmenterFor(languageId)`, falling back to a locale-aware `Intl.Segmenter`), records `basis` and `confidence` on the card model (`card.language`), on the card host (`data-language-basis`) and in the metrics row, and, when the language is `undetermined`, says so and offers the installed languages instead of guessing. The built-in default resolver is a placeholder until `src/language` lands.
* Adding a site, the rules for changing a status, and what each fixture models: `docs/ecosystem/reader/ADAPTER-REGISTRY.md`.

## The pipeline (per lookup)

capture → NFC / original form kept → normalize for analysis → tokenize → lemma candidates → morphology → senses → contextual disambiguation → phrases → syntax notes (all in `parse`, the bundled analyser) → **card shown (Layer 1)** → beside it, never blocking it: dictionary gloss (background), learner-model consultation (background), pack explanations (background), pronunciation check (the card) → events. Marks: `selectionObtained`, `contextExtracted`, `parsed`, `popupPositioned`, `firstInfoShown`, then `eventQueued`, `profileArrived`, `glossArrived` (late marks rewrite the same metrics row). A newer lookup supersedes an older one; a late reply for a replaced card does nothing.

## The card

| layer | opens with | content |
|---|---|---|
| 1 identification (always) | — | the selected form; the meaning in this context (the word list's gloss at once, else "looking up…" until the dictionary answers; the dictionary's senses with their attribution as a separate line when both exist); lemma + POS; the essential morphology line; "Context: full sentence / only the selected word (this reader gives no sentence) / a fragment"; confidence and provenance; the **inference**-labelled learner line ("You have met this word N times; reading recognition: low/medium/high (confidence c)", or "not met", or "Not connected", or why the history is unavailable); a grammar hint when the form realizes a construction; **Pronounce**, **Review this**, **This analysis is wrong**, **More** |
| 2 morphology | **Form** | a table of the features that exist (`Case: accusative …`), labelled and explained from the pack; depth decides how much of the explanation shows |
| 3 phrase & syntax | **Phrase & syntax** | phrases, units and parts, the constructions covering the word, and `role: not available from this analyser` when the analyser gives no role |
| 4 grammar | **Grammar** | why the form appears: the pack's construction explanation, at depth `label` (title), `brief` (first sentence) or `explanatory` (all), from the Repository preference or the learner's explicit setting; the analyser's own text when the pack has none |
| 5 sentence | **English rescue** | a word-by-word list (lemma, part of speech, gloss) of the sentence, the selected word marked; says there is no machine translation; "no sentence context" when there is none |

**Adaptive order:** when a construction the form realizes has `grammaticalUnderstanding.negative > positive` for the learner, its hint moves **above** the meaning; otherwise (including a word never met) the meaning comes first. Every layer stays reachable either way.

Page text, dictionary glosses and every background reply are rendered with `textContent`, never as markup.

## Events (per interaction)

Every event is built in the page with a **placeholder identity**; the background replaces learner, enrolment and device and validates with the contract before writing.

| interaction | event | payload (besides the subject: item ids, `sentenceKey` only when the context is a real sentence, `sourceRef`) |
|---|---|---|
| a lookup | `SelectionLookedUp` | counts, context kind and confidence, reader id, help shown, the surface only for ≤ 4 words |
| Layer 1 shown | `AnalysisShown` | `{ layers: ['identification'] }` |
| Layer 2 opened | `AssistanceRequested` | `{ assistance: 'morphology', layer: 'morphology' }` |
| Layer 3 opened | `AssistanceRequested` | `{ assistance: 'example', layer: 'phrase-syntax' }` |
| Layer 4 opened | `AssistanceRequested` | `{ assistance: 'grammar', layer: 'grammar', depth }` |
| Layer 5 opened | `AssistanceRequested` | `{ assistance: 'translation', layer: 'sentence' }` |
| Pronounce | `PronunciationPlayed` | `{ voice: 'synthetic', voiceId, repeated }`, `evidence: none` (exposure, never listening evidence) |
| Review this | `ItemMarked` | `{ mark: 'saved' }` |
| This analysis is wrong | `AnalysisCorrected` (+ `POST /corrections` through the background) | `{ formId, by: 'learner', correctedLexemeId, reason }`, `correctionOf` = the lookup's event id |
| a language with no pack / analyser | `SelectionLookedUp` only | `mode: 'no-pack' / 'no-analyser'`; no analysis is claimed |

Opening the same layer again on the same card is the same event (same dedupe key). A sentence is never stored: events carry hashes and ids (the contract refuses text keys), `keepSnippets` is off and not implemented.

## Messages

Content script → background (a **page** sender, i.e. the popup / setup page, may also send all of these):

| type | payload → reply |
|---|---|
| `golearn:record` | `{ event }` → `{ ok, duplicate?, attributed: 'account' \| 'local', error? }`; kinds allowed: SelectionLookedUp, AnalysisShown, AssistanceRequested, PronunciationPlayed, ItemMarked, AnalysisCorrected; producer must be `golearn-ext`; ≤ 6000 bytes; validated by the contract |
| `golearn:profile` | `{ unitIds, languageId }` → `{ ok, connected, stale?, rows: { unitId → { dimensions (seven), lastSeenAt } }, depth, depthOrigin, error? }` — no learner id |
| `golearn:gloss` | `{ lemma, pos?, languageId }` → `{ ok, found, senses[], attribution?, reason? }` |
| `golearn:explain` | `{ languageId, pos?, features, constructionIds }` → `{ ok, features[{key,value,label,brief?,explanation?}], constructions[{id,title,brief,explanation}], source }` |
| `golearn:pronounce-info` | `{ languageId }` → `{ ok, deviceVoice, remoteConsent, sources[], note }` |
| `golearn:correct` | `{ formId, languageId, lexemeId?, features?, reason?, sentenceKey? }` → `{ ok, posted, reason? }` |
| `golearn:metrics` | `{ row }` → `{ ok }` |
| `golearn:status` | → `{ ok, connected, needsSignIn, languageId, languageName, packAvailable }` for a tab; a page also gets `email, baseUrl, assetBase, expiresAt, hasEnrolment, settings, sync { pending, localOnly, rejected, lastPushAt, lastError, online, needsSignIn }` |
| `golearn:settings` | `{ op: 'get' }` → `{ ok, settings }`; `{ op: 'set', patch }` (page only) |

Extension pages only (a tab sender gets `forbidden`): `golearn:service-config` (`{ op: 'get' \| 'set', baseUrl, assetBase? }`), `golearn:connect` and `golearn:create-account` (`{ baseUrl, email, password, displayName? }`; the device id is added by the worker), `golearn:disconnect`, `golearn:sync-now`, `golearn:enrol` (`{ languageId, packId, packVersion, goals, teamId? }`), `golearn:session-refresh`, `golearn:select-enrolment`, `golearn:clear-local`, and the per-tab `golearn:set-enabled` / `golearn:get-state`. Background → tab: `golearn:enable`, `golearn:disable`, `golearn:lookup`, `golearn:ping`.

Storage (`chrome.storage.local` unless noted): `golearn:service { baseUrl, assetBase? }`, `golearn:session { token, learnerId, enrolmentId?, languageId?, expiresAt, email }`, `golearn:settings`, `golearn:deviceId`, `golearn:event:*` (the learner's exportable log), `golearn:metric:*`, `queue:*` / `rejected:*` (sync client), `sync:cursor`, `golearn:sync-status`, `pack:shard:<id>` (dictionary files with attribution), and in `chrome.storage.session`: `golearn:know:*`, `golearn:prefs:*` (learner-model cache, 10-minute lifetime), `golearn:tab:*`.

## Sync

`createLocalQueue(adaptStorageArea(chrome.storage.local))` + `createSyncClient` with a transport over the API client's `syncPush` / `syncPull`. Runs once, debounced 2 s after an event is queued; every 5 minutes on a `chrome.alarms` alarm; on request. Events recorded while signed out are attributed to `local:<deviceId>` (invisible to the sync client) and rewritten to the account's identity on sign-in or enrolment (`reattributeQueued`); events queued under a different account are set aside under `rejected:`, never sent as the new learner and never dropped. A 401 sets `needsSignIn` and stops sync until the next sign-in; offline backs off. Pulled events are counted and dropped (the extension keeps no copy of other devices' events; knowledge comes from the Repository's projection). After each successful round the cached learner-model rows are re-fetched, so what GoPractice changed reaches the reader on the next lookup.

## Permissions (least privilege)

| permission | why |
|---|---|
| `activeTab` | the content script runs only on the tab the learner acted on (switch, menu item, shortcut) |
| `scripting` | to inject `content.js` on that gesture |
| `storage` | the session, the queue, settings, caches |
| `contextMenus` | "Look up with GoLearn" |
| `alarms` | the 5-minute sync round (the only use) |

No host permissions by default, no `content_scripts`, no `externally_connectable` (`web_accessible_resources` names the analyser chunks only). The worker's `fetch` to the Repository service and to the dictionary host relies on those hosts answering CORS (the service sends permissive CORS headers; GitHub Pages sends `Access-Control-Allow-Origin: *`); if a host does not, an optional host permission would be the way to add it, requested at sign-in.

**GoLearn Active** (2026-10-09; `docs/ecosystem/GOLEARN-ACTIVE-DESIGN.md`) is the one feature that reads a page before a gesture, and the popup's one switch: it needs the optional host permission `optional_host_permissions: ["https://*/*", "http://*/*"]`, which the popup asks the browser for inside the learner's click on the switch; switching off withdraws it again. With it granted the worker registers `content.js` as a dynamic content script (`document_idle`, all frames, every refusing reader excluded by host, `src/active/exclude.ts`); the page half (`src/content/active.ts`) turns selection lookups on, scans the visible text with the page's resolved language pack, asks the worker about the words through `MSG.activeProfile` (unit ids only, batches of 60, answered from the device's own Repository and never the service, and only while the switch is on), underlines the met words through the CSS Custom Highlight API in four levels (`src/active/levels.ts`, the same table the popup's legend shows), and turns a single click on a word into the ordinary lookup, spoken when a device voice exists. A scan records no event and changes no DOM node; the switch off unregisters the script and clears every page. The popup carries no housekeeping (export and deletion are in the setup page's Privacy screen).

## Security

* The content script holds no token and makes no network call; `getContentChrome()` hands it messaging only (no storage areas).
* The worker accepts a message only if `sender.id === chrome.runtime.id`; a sender whose document is an extension page (`chrome-extension://<id>/…`) may do everything, a tab (content script) only the content messages above. Anything else is `forbidden`.
* The service address must be `https://`, or `http://` on `localhost` / `127.0.0.1` / `[::1]` / `*.localhost`; no credentials in the URL. Checked on entry and again when read back from storage.
* Replies a content script receives are shaped for it: no token, email, learner id, enrolment id or service address.
* Remote data is data: glosses and explanations are cleaned (length, control characters) and rendered as text; unit ids are matched against a pattern before they are asked for or stored; the dictionary fetch refuses URLs outside the configured asset base.
* A lookup is not a page read: nothing is read until the learner selects; the page and its sentence are never stored or sent (the sentence is analysed in the page).

## Build and load

```
npm run ext:build        # -> dist/content.js, dist/background.js, dist/action/popup.{html,js}, dist/manifest.json
# then the setup page's own build (packages/golearn-extension/app), which writes dist/app/
npx vite build -c packages/gopractice/vite.config.ts --mode extension   # GoPractice as a page of the extension -> dist/practice/ (the popup's "Practise" button opens it)
```

`npm run ext:build` empties `dist/` except `dist/app/`, so `dist/practice/` has to be built after it, every time.

Load `dist/` with chrome://extensions → Developer mode → Load unpacked. Open **GoLearn setup** (popup button): the Welcome page is the whole of setup since 2026-10-09. **Choose your language** (Norwegian, German, Albanian, Hindi, Thai or Spanish; no team and no account are needed): one click saves the choice and installs and checks the pack. **Sign in (optional)** on the same page keeps your progress across devices (it uploads what is on the device once; nothing else to do). Then open a page in the language and switch on **GoLearn Active** in the popup (or select a word and press Alt+Shift+G / right-click "Look up with GoLearn"). The popup's **Practise** button opens GoPractice, which also works with no account. Sync, Privacy, Diagnostics and "How GoLearn reads pages" sit under Advanced. Without the setup page built, Chrome refuses to load the extension (the manifest names `app/index.html`).

Sizes (minified): see the report of the build in the commit / test log; `content.js` carries the Albanian analyser and the card, `background.js` the API client, the sync client and the language-pack runtime (which bundles the analyser again for glosses).

## Tests

`npx vitest run test/extension test/ecosystem`: card, controller, layers (non-blocking arrivals, adaptive order, events per interaction, pronunciation failure, review, corrections, honest partial cards, languages without a pack), session / sync / profile / gloss / security against the **real service handler** with the service tests' in-memory fakes, the built bundles (text checks and an end-to-end run of `background.js` + `content.js`), the popup, the device pronouncer.

## Honest limits

* Two analysers (Albanian, and Spanish at a minimal unreviewed level) are bundled; any other enrolment language gets a message and a counted lookup, never a guess. A pack with a dictionary but no bundled analyser says that instead.
* Dictionary glosses need the dictionary host (`dict/<lang>/`) to be configured and reachable once per shard; the card says "looking up…" then shows what the word list had.
* Remote or recorded voices are not played inside web pages by this version; only the device's own voice (practice only).
* The learner-model line is an estimate from the Repository's projection, labelled `inference`; it is never shown to anyone else.
* The extension keeps `golearn:event:*` as the learner's own copy even after events are synced; "Delete all rows" removes it, the unsent queue and the caches, not the account's copy at the service.
* `web-generic` declines every host of a refusing registry entry (today `read.amazon.com`, `kindle.amazon.com`, `read.kobo.com`, `mebmarket.com`, `readawrite.com`, `pratilipi.com`); it does not read form fields, editable regions or cross-origin frames.
* No registry entry is verified as an installed extension on a live site; every new site starts `unverified` and no terms review is recorded.
* Corrections are proposals: the service stores them as the learner's, provisional; nothing becomes a fact without a reviewer.
* Syncing scans `chrome.storage.local` for queue keys (the sync package's area adapter lists keys that way); with a large dictionary cache that is a full read per round.

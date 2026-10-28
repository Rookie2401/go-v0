# GoLearn Active — design (owner request, 2026-10-09)

The owner wants a switch in the extension, **GoLearn Active**. When it is on, GoLearn reads the page before the
learner does, marks the words the learner has met with an underline whose subtlety follows how well the word is
known, and a single click on a word opens the card with the full parse and GoListen. This note fixes the design so
it stays inside the rules the extension already keeps (READER-ADAPTER-CONTRACT.md §4, RIGHTS-AND-CONTENT-FLOW-BOUNDARIES.md).

## 1. The switch and the permission it needs

Today the content script runs only on a gesture (`activeTab` + `scripting`). Reading a page before any gesture
needs the script on page load, which needs host permission. Therefore:

- `manifest.json` gains `optional_host_permissions: ["https://*/*", "http://*/*"]` (nothing granted by default).
- The popup gets **GoLearn Active** (off by default, stored in `golearn:settings.active`). Turning it on calls
  `chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] })` inside the click handler (the browser shows
  its prompt once); on grant, the worker registers a dynamic content script (`chrome.scripting.registerContentScripts`,
  `runAt: 'document_idle'`, `allFrames: true`, id `golearn-active`) with `excludeMatches` built from the registry's
  refusing hosts (Kindle, Kobo, readAwrite, MEB, Pratilipi and every `permission-required`/`blocked`/`unsupported`
  entry). Turning it off unregisters the script and, with a second explicit control, lets the learner revoke the host
  permission (`chrome.permissions.remove`). The popup states plainly what Active reads and that nothing leaves the device.
- A second toggle beside it, **Speak on click**, decides whether GoListen plays the word on click when a device voice
  for the language exists (default on; the card still shows the honest "no voice" line otherwise).

## 2. What the page scan reads, and what it never does

- The scan reads the text of blocks inside the viewport (IntersectionObserver; 1 screen of margin), through the same
  adapter the lookup uses (so refused sites and frames the adapter cannot read are never scanned, editable regions and
  form fields are skipped, cross-origin frames are left alone).
- Text is tokenised on the device with the page's resolved language pack (the same resolver: override → metadata →
  detection; `undetermined` scans nothing and the popup says why). Analysers load on demand as for a lookup.
- Nothing is sent anywhere, nothing is retained: tokens live in memory per tab, keyed by DOM position, and are dropped
  on navigation. No event is recorded by a scan (seeing an underline is not an encounter; a click is).
- Sites whose registry `restrictions.textRetention`/`remoteProcessing` are `forbidden` are still scanned locally only
  if the entry is enabled and not refusing (local, transient reading of what the learner is looking at); the scan is
  off for every refusing entry regardless of the switch.

## 3. Underlines without touching the page

The CSS Custom Highlight API (`CSS.highlights`, `Highlight(range…)`, `::highlight(name)`) decorates ranges without
wrapping, editing or re-flowing any node: the page DOM is unchanged (the existing rule), screen readers see the same
text, and the page's own scripts are unaffected. **Six levels** (the owner's scale, 2026-10-10; the first design had four
and the first build five), one named highlight each, a text-decoration underline. The level is `UnitKnowledge.level`,
computed by the Repository's engine (`levelOf`, `packages/repository-engine/src/levels.ts`) from the local Repository's
knowledge rows (lemma + form) and the learner's own newest mark; the page reads it as it stands:

| level | learner state (the engine's rule, over the knowledge row) | style |
|---|---|---|
| New | no observation and no mark; a word with no row at all | light-blue highlight |
| Seen | met or looked up (exposure, lookup, a failed attempt), nothing shows it was understood | heavy underline |
| Recognized | understood with help (assistedRecognition), or recognised once (reading/listening recognition observed, below the familiar bar) | lighter underline |
| Familiar | a recognition estimate ≥ 0.6 over ≥ 2 observations | faint underline |
| Known | a recognition estimate ≥ 0.8 over ≥ 4 observations (listening counts too) | no mark |
| Automatic | productive retrieval or contextual production estimate ≥ 0.7 over ≥ 2 observations | no mark |

The learner's newest mark decides the level outright until later evidence contradicts it (two or more levels away); every
rule, the legacy-mark mapping and the migration are in `docs/ecosystem/KNOWLEDGE-LEVELS.md`. Review is not a metric shown
on the page: whether a word is proposed for practice follows its level. Thresholds live in one table and are shown in
the popup's legend. When the API is absent
(an old engine), Active still enables click-to-look-up and says underlines are unavailable; it never falls back to
DOM wrapping.

## 4. Click to look up

With Active on, a single click (no selection needed) on a word: the content script takes the word at the point
(`caretRangeFromPoint`, snapped to grapheme clusters and the pack's tokeniser), selects it, and runs the normal lookup
(same card, same events: `SelectionLookedUp` with `trigger: 'click'`). Clicks on links, controls, editable regions and
inside the card are ignored; a drag still selects a phrase. The card opens with the GoListen row and, when Speak on
click is on and a device voice exists for the language, plays once (never for Albanian today: no voice).

## 5. Where the learner model comes from

The worker answers `MSG.profile` for batches of unit ids (lemma and form ids from the scan) from the local
Repository (no account) or the account cache (signed in), exactly as the card's history line does; the scan asks in
chunks of 200 ids and caches per tab.

## 6. Performance budget and tests

Scan of one viewport ≤ 50 ms warm on a prose page (measured in the harness); highlights applied in one rAF; no
scroll jank (observer-driven). Tests: jsdom for tokenising and matching, a fake `CSS.highlights` for the ranges, the
refusing-host exclusion list, the permission flow against the chrome fake, click-to-look-up on the harness in the pane.

## 7. As built (2026-10-09)

Where the build is:

| part | file |
|---|---|
| levels and legend (one threshold table) | `packages/golearn-extension/src/active/levels.ts` |
| exclude list from the registry | `src/active/exclude.ts` |
| underlines (CSS Custom Highlight API, adopted style sheet) | `src/active/highlight.ts` |
| the scan (readable text nodes, tokens, unit ids, per-node cache) | `src/active/scan.ts` |
| the page half (language, scan, batches, click, speak, stop) | `src/content/active.ts`; `content/index.ts` starts it on `activate` or when the worker says the switch is on |
| the privileged half (switches, permission check, registration, broadcast) | `src/background/active.ts`; `MSG.active` (page: get/set; content: get) |
| the popup (switch, Speak on click, legend, withdraw) | `action/popup.{html,ts}`; the browser's prompt is asked inside the learner's click |
| manifest | `optional_host_permissions: ["https://*/*", "http://*/*"]`; nothing granted at install |
| tests | `test/extension/active.{levels,exclude,highlight,scan,content,background,popup}.test.ts` |
| harness | `harness/active.html` (a stand-in for the worker on the page, with a fixed learner model) |

Owner's corrections after the first build (2026-10-09, evening), now in force:

- **One switch.** The popup has a single control, **GoLearn Active**. On = the browser's prompt (inside the click), the
  dynamic registration, selection lookups on every page where Active runs (`controller.enable()` is part of
  `ActiveMode.start()`), click-to-look-up, and speaking on click whenever a device voice exists. Off = the page access
  is **withdrawn** (`chrome.permissions.remove`) as well as the registration; there is no separate "Speak on click",
  "GoLearn on for this tab" or "Withdraw page access". The popup shows what Active found on the page in front
  (words read, underlined per level, or the reason it read nothing) from the content script's `ping`.
- **No housekeeping in the popup.** The encounter counter, export, metrics export and the two-click delete are gone from
  the popup; export and deletion live in the setup page's Privacy screen, and the worker does the rest by itself.
- **The scan has its own message, `MSG.activeProfile`.** The first build sent the scan's ids through the card's
  `MSG.profile`, whose long-selection rule trims any list of more than four words to at most four lemma ids (a privacy
  rule for selections, `wordids.ts`): a batch of sixty page words came back almost empty, so nothing was underlined in
  the real browser. The scan's question is now answered whole, but **from the device's own Repository only** (the
  account's history is in it too, pulled at sign-in and after each sync), and only while the switch is on and the
  permission is granted; the service is never asked about the words on a page. Proven end to end in
  `test/extension/active.integration.test.ts` (real content script, real worker, device-local Repository).

Owner's additions (2026-10-10):

- **Unknown words are marked too.** A level `new` (dashed underline), for a word with no row in the learner model
  or no encounter: every word on the page now carries a level, so what the learner does not know is visible. When
  the learner model cannot be reached at all nothing is marked (every word would be "new" for the wrong reason).
- **The learner says how well they know a word, on SIX levels.** (First built with three marks: "New to me" =
  `learning`, "I recognise it" = `known`, "I can use it" = `productive`; replaced the same day.) The card has a row
  "How well do you know it?" with the six levels, New, Seen, Recognized, Familiar, Known, Automatic. A mark is an
  `ItemMarked` event like any other (recorded on the device, synced with an account); the contract accepts the six
  level words and, unchanged, the three older words (stored events are never rewritten; `levelOfMark` reads them:
  `learning` = New, `productive` = Known). The engine folds a mark into the dimensions with a self-report weight and
  keeps the latest mark on the unit as a level (`UnitKnowledge.selfMark`, projection@4); the unit's `level` follows the
  mark until later evidence puts the unit two or more levels away from it, and the underline follows `level`. The scan
  forgets the word's rows when the controller records a mark and reads the page again, so the underline changes at once.
  The card's footer shows "Previous encounters: N" (`UnitKnowledge.encounters`, distinct events), not a review metric:
  **review is a natural progression of how well the learner knows the word**, never something the card asks for.
- **GoListen on this device.** The popup says which of the chosen languages this browser can speak (the strict tag
  rule the card uses, `hasDeviceVoice` in content/voice.ts); no device ships an Albanian voice, so Albanian is always
  "none". Speaking on click is the card's own Pronounce path (`CardUI.pronounce()`), practice only, never evidence.

Where the build differs from §1–§6, and why:

- **Batches of 60, not 200.** The background's profile service answers at most 60 ids per request (`profile.ts`
  `MAX_IDS_PER_REQUEST`), so the scan asks in batches of 60 and caches per tab; the cap was not raised, because the
  same cap bounds what a content script can ask about in one message.
- **Scroll and mutation, debounced, instead of an IntersectionObserver.** The scan reads the text nodes whose block
  intersects the viewport plus one screen of margin, and runs again 150 ms after the last scroll, resize or page
  mutation (mutations inside the card's own host are ignored). One scan at a time; a request during a scan runs once
  after it. The observer-driven variant is a refinement, not a requirement; the budget is measured on the harness.
- **The page in front is started at once; every other open page gets Active on its next load.** Switching on injects
  the content script into the active tab (the permission now allows it) and sends `activate`; the registered script
  covers every later load. Injecting into every open tab at once was not done (cost, and surprise). The popup says so.
- **A page whose language is undetermined is not scanned; a click there still runs the ordinary lookup**, which says
  that the language is undetermined and offers the installed languages.
- **Speak on click** plays once as soon as the card's own voice check says a device voice exists (`CardUI.pronounce()`):
  never for Albanian today, and never a remote voice without the learner's consent.
- **Cross-origin frames are not scanned**, and frames at all only when the registry entry allows them (`same-origin-frames`
  or the web-generic default); `top-only` and `declare-cross-origin` entries scan the top document only.
- **Unit ids leave the page, nothing else.** A scan sends normalised single-word forms and lemma ids to the worker and
  records no event. The scan reads the page's text into memory for tokenising and drops it; this is the same kind of
  reading a lookup does for its sentence context, now for the visible screen. Sites whose entry refuses are never
  scanned, whatever the switch says (the registration excludes them, and the scan checks the registry again).

## 8. The dictionary confirms the words the analyser does not know (2026-10-27)

Contract: `docs/ecosystem/GOLEARN-ACTIVE-DICTIONARY.md`. The gate in `active/scan.ts` (`known`) is still the analyser's: a creditable lemma
from the course word list. What changed is what the page does with the words that fail it.

- **The question.** After `tokensIn`, `scanOnce` collects the tokens that are not `known` and are made of letters only (`formsToConfirm`),
  takes the normalised form from `ids[0]` and asks the background, once per form per tab, `golearn:confirm-forms`
  `{ languageId, forms }` (at most 500 forms a message; the content side splits larger sets). The reply is
  `{ ok, forms: { [form]: [lemma, pos | null] | null }, source?, reason? }`: `null` = the index lacks the form; the first row of the index
  is the one returned. A per-instance `Map<formId, lemmaId | null>` holds the answers, so a re-scan, a `refetch` or an edited node asks nothing.
- **A hit** sets `known = true` and appends `lemma:<lang>:<lemma>[:<pos>]` (the same id shape the scanner gives an analysed word), and
  only then is the learner model consulted (confirm first, `consult` second), so levels, highlights and encounters treat the word like any
  analysed one. **A miss** (names, other languages, typos) stays skipped, exactly as before: the dictionary can only ADD words of the active
  language, so the 2026-10-25 rule (a Hebrew or English word on a German page stays unmarked) is untouched.
- **The per-node token cache is not frozen.** The answers live outside the cache (the map above); `applyConfirmations` writes a hit onto the
  scanner's cached token, flipping `known` only from false to true, and runs on every scan over all tokens. A node whose text changed is
  tokenised afresh and picks its answers up from the map with no request. Nothing is invalidated, because an answer never changes within a tab.
  `stop()` clears the map with the scanner.
- **No answer.** A reply with a `reason` is not an answer about the words: no `null` is remembered. `no-pack` and `no-index` (no dictionary for
  the language, or none with a forms index at the located place) stop the questions for this tab and say nothing: that is today's behaviour.
  `offline` and `no-asset-base` set the tab's reason ("The dictionary could not be reached, so only the course word list underlines words.")
  and the question is asked again after 15 s, on a later scan; the scan never waits on it beyond the one round trip. A silent background
  (no reply, an error) is treated the same way without a reason. `ActiveState` gains `confirmed` (tokens the dictionary confirmed in the last
  scan) and `unconfirmed` (tokens asked about and not found); `skipped` still counts every token that is not known. The popup does not show them yet.
- **Background.** `background/forms.ts` takes the location from the gloss service (`gloss.dictionaryAt(languageId)`: the same `locate`,
  the same order: the learner's dictionary address, the extension's own `app/`, the hosted copy from `app/config.json`; the same caching
  `shardFetch`, so forms shards persist under `pack:shard:dict/<lang>/forms/…` beside the gloss shards and work offline once read). It builds a
  `createFormsSource` per language and location with that fetch, `base` being the folder that holds the language folders. The index's
  manifest is probed first through the caching fetch: a 404/410 is remembered (`no-index`), a thrown fetch or a 5xx is `offline` and is not
  remembered; a shard that fails during a lookup makes the reply `offline` with the hits it did get, never a false "absent". It never
  throws to the content script. The message is allowed for content scripts and gated by nothing but its bounds (it carries public
  dictionary data, no learner data). The worker holds no address: nothing is hard-coded, so the bundles stay free of URLs.
- **What ships.** No forms index is bundled into `dist/app`: Albanian answers `no-index` from the extension's own files (the first location
  that has `dict/sq/manifest.json`) and German is served from the configured or hosted dictionary once `dict/de/forms/` is published there.
- **German fallbacks after the index (`background/compounds.ts`, wired in `background/forms.ts`).** For a `de` form the index lacks as a whole
  (never re-derived when it has it): (1) `retryEndings`: strip an adjective/participle ending (`en er em es e`, longest first; remainder >= 4 letters)
  and accept an ADJ hit, or a VERB hit when the remainder is a present participle (`-end`) or a `ge-` past participle; or strip the dative plural `-n` and
  accept a NOUN hit on a remainder ending in `e`; one extra `lookupForms` call. The answer is the hit's own lemma and pos. (2) `splitCompounds` on what is
  still missing: forms of >= 8 letters cut at every point leaving >= 3 / >= 4 letters; the right part must be a NOUN/ADJ row (not PROPN, not closed class),
  the left part in the index as written or without a linking element (`s es n en e er ens`), or itself a compound one level down; the longest right
  part wins; the lemma is the left part as written + the head lemma (capitalised for a NOUN). One `lookupForms` call per level, at most 200 distinct
  strings per request; a form the budget did not reach is left OUT of the reply (the page asks again on a later scan) rather than reported absent.

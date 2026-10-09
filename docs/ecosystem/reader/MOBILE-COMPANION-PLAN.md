# Mobile companion plan — GoLearn on Android and iOS/iPadOS

Status: 2026-10-09. Plan plus one small proof. **Nothing native has been built, run or tested.** What exists is a platform-neutral
share contract (`packages/golearn-share`), a share screen in the hosted setup app (`#/share`), and a web app manifest with a Web
Share Target, all tested in jsdom/Node only. No real phone, no installed PWA, no third-party app has been involved.

Read with `READER-ADAPTER-CONTRACT.md` (the rules a lookup obeys), `GOLEARN-ARCHITECTURE.md` and `RIGHTS-AND-PRIVACY-BOUNDARIES.md`.

## 1. What is verified today, and what is not

| claim | status |
|---|---|
| A shared passage is normalised under the reader contract's rules (NFC, grapheme-safe, 80 words / 1200 chars, whitespace collapsed) | verified (`test/golearn-share/normalise.test.ts`, Albanian, Hindi, Thai) |
| One word or a short phrase becomes `context.kind: 'none'`; a longer passage means the learner picks the word; one complete sentence is `'sentence'` at confidence 0.6; anything else is `'fragment'` at 0.4 | verified (same file); the 0.6 / 0.4 figures are my own conservative choices, not measured |
| The recorded event is the SAME `SelectionLookedUp` the browser extension records (`buildSelectionEvent`), with `readerId` `share-android` / `share-ios` / `share-web` / `clipboard` | verified by equality against the real builder (`test/golearn-share/event.test.ts`); the builder is mirrored because the package may import only the contract |
| No passage text in the event | verified (`event.test.ts`, `test/golearn-app/share.test.ts`) |
| The setup app's `#/share` screen reads `text` / `url` / `title`, offers the words, runs the real parser and card, records only after a choice, and accepts pasted text | verified in jsdom (`test/golearn-app/share.test.ts`) |
| `vite build --mode web` emits `manifest.webmanifest` with a `share_target` and links it from `index.html` | verified (built output inspected) |
| Chrome on Android lists an installed GoLearn PWA in its share sheet, and passes `text` / `url` / `title` as the manifest says | **not verified.** No official web-platform documentation was read for this task and no device was used |
| A `share_target` whose `action` is only a fragment (`#/share`) is accepted by Chrome | **not verified.** If Chrome refuses it, the fallback is a path action (needs a host that serves that path) or the paste box |
| The hosted PWA is installable without PNG icons or a service worker | **not verified.** Only the repository's `favicon.svg` is used as the icon; PNG 192/512 icons and any worker are open items for whoever designs the icon |
| Any Android or iOS native route below | **not verified, not built** |
| Which third-party reader apps expose any of these routes | **UNKNOWN for every app** (section 6) |

## 2. Android

Official pages read on 2026-10-09 are cited; anything marked "general knowledge" was not read from an official page this session
and must be checked before it is relied on.

### 2.1 Receiving a text selection: `ACTION_PROCESS_TEXT`

An activity that declares an intent filter for `android.intent.action.PROCESS_TEXT` with `text/plain` can appear in the text-selection
menu of other apps; the selected text arrives as `EXTRA_PROCESS_TEXT` and `EXTRA_PROCESS_TEXT_READONLY` says whether the source text may be
replaced. **General knowledge, not read:** the Intent reference page was fetched in full-page chunks but the section containing these
three constants was not retrievable (`developer.android.com/reference/android/content/Intent`, read in part 2026-10-09; the Android 6.0
behaviour-changes page, read 2026-10-09, does not mention `ACTION_PROCESS_TEXT`). Treat the names, types and filter shape as unconfirmed
until read from the reference. For GoLearn the activity would be read-only: look up, show the card, never return replacement text.

It only appears in apps whose text widgets show the system selection menu. Whether a given reader app uses the standard text widgets (and
so shows this item) is unknown for each app.

### 2.2 Receiving a share: `ACTION_SEND`, `text/plain`

Read: Android's "Receive simple data from other apps" page (`developer.android.com/training/sharing/receive`, 2026-10-09) shows an
activity declaring an intent filter for `android.intent.action.SEND` with `text/plain`, after which the app appears in the Sharesheet or
intent resolver, and reading the text with `intent.getStringExtra(Intent.EXTRA_TEXT)`. It says to check the action and MIME type because
"you never know what some other application may send you", and recommends letting users confirm and edit shared content before using it.
Read: "Send simple data to other apps" (`developer.android.com/training/basics/intents/sending`, 2026-10-09) shows `ACTION_SEND` with
`EXTRA_SUBJECT` and `EXTRA_TEXT`, and `Intent.createChooser`. It does not mention `EXTRA_TITLE`.

GoLearn rules that follow: the share is the learner's gesture; show the words and let them choose (the share screen does); treat `EXTRA_TEXT`
as untrusted; a title that repeats the text is dropped (`sharedSourceRef`); a bare link is refused as "a link, not text".

### 2.3 Deep links and App Links

Read: "About Android App Links" (`developer.android.com/training/app-links/about`, 2026-10-09). App Links are verified deep links that open
in the app without a chooser; they need `android:autoVerify="true"` on the intent filter and a Digital Asset Links file on the web server
whose `sha256_cert_fingerprints` matches the app's signing certificate; ordinary deep links work on all versions but the user may have to
choose the app. Use: a link `https://<host>/#/share?text=…` could hand a passage from a notification or another surface to the native app
when installed, and to the web app otherwise. The page does not give the `assetlinks.json` path or structure; that is general knowledge.

### 2.4 The clipboard

Read: "Android 10 privacy changes" (`developer.android.com/about/versions/10/privacy/changes`, 2026-10-09): "Unless your app is the default
input method editor (IME) or is the app that currently has focus, your app cannot access clipboard data on Android 10 or higher." Read:
"Copy and paste" (`developer.android.com/develop/ui/views/touch-and-input/copy-paste`, 2026-10-09): on Android 12 (API 31) and higher the
system usually shows a toast when an app calls `getPrimaryClip()` ("APP pasted from your clipboard"), with no toast for the app's own data,
repeated access from the same app, or metadata only (`getPrimaryClipDescription()`); `hasPrimaryClip()` plus the description's MIME type can
enable a paste action without reading the data. The page about clipboard access risks (`.../privacy-and-security/risks/clipboard-access`)
returned 404 and was not read.

GoLearn rule: the clipboard is read only on an explicit learner action in the foreground app (a "Paste" button), never in the background and
never on launch. Today's web screen does not read the clipboard at all: the learner pastes into a box.

### 2.5 Local EPUB reading on Android

Read: "Open files using the Storage Access Framework" (`developer.android.com/guide/topics/providers/document-provider`, 2026-10-09):
`ACTION_OPEN_DOCUMENT` shows the system picker and is the choice for long-term access to a provider's documents, `ACTION_GET_CONTENT` for a
one-time import of a copy. The page does not mention EPUB or persistable grants (`takePersistableUriPermission` is general knowledge, not
read). A native GoLearn could read a DRM-free EPUB the learner picks, as the controlled reader does on the web (`epub-local`); DRM-protected
files remain refused. No EPUB rendering library has been chosen or tested for Android.

## 3. iOS and iPadOS

Apple's documentation pages render with JavaScript; the readable JSON data behind some pages was fetched 2026-10-09 and is cited. Pages
that returned only a title are not cited as read.

- **Share Extension.** Read (`NSExtensionActivationRule` data page, 2026-10-09): `NSExtensionActivationRule` is a dictionary under `NSExtension`
  → `NSExtensionAttributes` describing the semantic data types a Share or Action extension supports; `NSExtensionActivationSupportsText` is a
  Boolean "whether the app extension supports text"; the dictionary also has web-URL, web-page, image, movie, file and attachment counts and
  `NSExtensionActivationUsesStrictMatching`. A share extension would declare text support, read the text it is given, and hand it to the
  shared analysis layer (section 5). Not read: the app-extension programming guide, how an extension talks to its containing app, and the
  extension's memory limits (a bundled analyser and dictionary may not fit; unverified).
- **Action Extension.** The same activation-rule keys apply to "Share or Action" extensions (read, above). How an action extension is presented
  and what it may return is general knowledge, not read.
- **Safari Web Extension.** Read (`SafariServices` data page, 2026-10-09): available in Safari 14 and later on macOS, visionOS 1 and later, and iOS 15 and later; built on
  JavaScript, HTML and CSS using the file formats of Chrome, Firefox and Edge extensions; an existing extension can be packaged with an Xcode
  tool; it is implemented as an app extension distributed with a containing app, which requires the Apple Developer Program. This is the route
  that can share the browser extension's code. **A Safari extension acts on Safari pages only. It cannot modify, read or hook the native Kindle,
  Kobo, MEB, Pratilipi or any other native app, and nothing in this plan pretends otherwise.** Whether the extension's current content
  script, background worker and permissions (`activeTab`, `scripting`, `contextMenus`, `alarms`) all work in Safari is unknown and untested.
- **Universal Links.** Read (`developer.apple.com` data page on linking to your content, 2026-10-09): tapping a universal link opens the app
  directly without the browser; if the app is not installed the URL opens in the browser; it needs a file on the web server that only the site
  owner can store, and an associated-domains setup in the app (file name and entitlement are general knowledge, not on the page read); a link the
  app itself opens with `UIApplication.open` does not open in the app.
- **Pasteboard.** Read (`UIPasteboard` data page, first 100,000 of 147,051 characters, 2026-10-09): from iOS 14 the system notifies the user when
  an app gets general-pasteboard content that originated in another app without user intent (intent is judged from a system control or Command-V);
  `hasStrings`, `hasURLs`, `types`, `numberOfItems` and the pattern-detection APIs can be used to avoid the notification. The wording of the prompt
  and the iOS 16 changes were not on the part read. GoLearn rule as on Android: read the pasteboard only after the learner presses a paste control.
- **Local EPUB.** Read (`UIDocumentPickerViewController` data page, 2026-10-09): open mode gives access to a document outside the sandbox through a
  security-scoped URL (`startAccessingSecurityScopedResource`), and URLs from the picker must not be saved, only bookmarks made while access is
  open. The document-based-app page returned 404 and was not read. A native iOS GoLearn could read a DRM-free EPUB the learner picks; no renderer is
  chosen.

## 4. What no phone integration may do (carried over from the reader contract)

Read only what the learner shared, selected or pasted, after their gesture; no scraping of other apps; no accessibility-service or screen
reading to obtain text from apps that do not offer it; no OCR of screens or pages (Kindle shows bitmaps, and the answer there stays "copy and
paste"); never defeat DRM or an app's copy limits; never persist the passage (the event holds the word, a hash and the link's path). If a route
is not offered by an app, the fallback is the learner's own copy-and-paste or the paste box.

## 5. The shared analysis layer

Phone surfaces are thin delivery routes into the SAME analysis:

- same pack contracts (`language-packs`: manifest, installer, validation, the Albanian and Spanish analysers behind `parseSelection`);
- same unit ids (`unitIds`, `lemma:…`, `morph:…`) and the same card model with fact / analysis / inference labels;
- same projection (the Repository engine folds the events; the phone has no scoring of its own);
- same GoListen contracts (device provider with strict language match; no recorded or remote voice claims);
- same Repository API and sync (`repository-sync` queue, the typed client), producing the same `SelectionLookedUp`.

How a native app runs the TypeScript packs is a **deferred decision**:

| option | for | against |
|---|---|---|
| Embed a JavaScript runtime and run the existing packages unchanged | one implementation; parser, packs, event builder and tests are reused exactly; the share contract already has equality tests against the browser | binary size and start time with the dictionary; memory limits in extensions (unmeasured); a JS engine to ship and update; Apple's rules for embedded interpreters not read |
| Port the analysers and event builder to Kotlin / Swift | native performance and size; no runtime | two implementations that must stay equal; the golden tests and the equality tests must be re-created per platform; every analyser change doubles |
| Thin native shell over the hosted web app (PWA / WebView) | least new code; the share target already exists | depends on the browser's share support (section 1); weaker offline guarantees; no `ACTION_PROCESS_TEXT` |

Recommendation for the first native step: no decision. The Android proof (section 7) is a shell around the web app, which commits to nothing.
Decide after measuring the web proof on a real device and the size of the analysis bundle.

## 6. Third-party reader apps: what each exposes

**Unknown for every app below until tested on a device.** No app was installed, run or inspected for this plan, and no app's terms were read.
For each, the cells to fill in by testing are: does a text selection show the system "process text" item (Android) or Share / Copy (iOS); does Share
offer plain text, and with what title; is copying allowed, and how much (publisher limits); are deep links used; terms-of-service position on
automation.

| app | Android process-text | Android share (`text/plain`) | iOS share | copy / paste | notes |
|---|---|---|---|---|---|
| Kindle | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN (copy limits are the publisher's; pages are images in the web reader, see `KINDLE-INTEGRATION-FINDINGS.md`) | the Safari extension cannot touch the native app |
| Kobo | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | web reader declined in `web-generic` pending a terms review |
| MEB (the user-named reader) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | which app exactly, on which platform, is not recorded in this repository |
| Pratilipi | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Hindi content; the same questions apply |
| Google Play Books, Apple Books, any other | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | not named by the owner; listed so they are not forgotten |

A route is recorded as "works" only after a person has done it on a device and written the result into this table with the date, device, OS
version and app version.

## 7. Fallback strategy per platform, and the minimal proof plan

| platform | first choice | fallback 1 | fallback 2 |
|---|---|---|---|
| Android | `ACTION_PROCESS_TEXT` activity (selection menu) | share to GoLearn (`ACTION_SEND` / the installed PWA's share target) | copy, open GoLearn, paste into the box |
| iOS / iPadOS | Share Extension (text) | Safari Web Extension for Safari pages only | copy, open GoLearn, paste into the box (the learner presses the paste control) |
| any browser | the desktop extension | the hosted app's paste box | none: the card is simply not offered |

Proof plan:

1. **Now (built):** the web share target and paste box in the hosted app (`#/share`), the `golearn-share` contract, and tests. Done in jsdom.
2. **Next, manual:** run the PWA on a real Android phone, record in section 6 which apps can share to it (steps below).
3. **First native step:** a minimal Android app with one `ACTION_PROCESS_TEXT` activity that opens the hosted app's `#/share?text=…` (or an embedded
   WebView of it) and nothing else: no storage, no network of its own. It tests whether the selection menu route is available in the apps in
   section 6. Read-only; never returns text.
4. **Later, only after 2 and 3 are measured:** decide the analysis-layer option (section 5), then the iOS Share Extension.

## 8. Manual steps for the owner: Web Share Target on Android Chrome

The share target works **only when the hosted web app is installed as an app (PWA) on Android Chrome**; a plain browser tab is not a share
target. Not tested by me. Steps:

1. Build and host the web app over **https** (any static host): `npx vite build -c packages/golearn-extension/app/vite.config.ts --mode web`,
   then publish `packages/golearn-extension/dist-web/` as a site (a sub-path is fine; every URL in it is relative). Confirm
   `manifest.webmanifest` and `favicon.svg` are served beside `index.html`.
2. On the Android phone, open that address in **Chrome**. Use Chrome's menu to install it ("Install app" or "Add to Home screen"; the wording differs
   by version and I have not confirmed it). If no install option appears, installability is the open question in section 1 (icons, worker); report the
   exact message, and the paste box still works from the open page.
3. Open the installed GoLearn once. Sign in and choose the team and language as usual (the share screen uses the active enrolment's language, and
   Albanian and Spanish are the only languages the parser reads today).
4. In another app, select some text, choose Share, and look for GoLearn in the share sheet. If it is there, choose it: the Look up shared text screen
   should open with the words to choose from. Pick one: the card should appear and "The lookup was recorded" should show.
5. Try the same from each app in section 6 and write the result into that table (app, version, Android version, what the share sheet offered, whether
   the text arrived, whether the title or link arrived). Also try sharing only a link: the screen should say it is a link, not text.
6. If GoLearn is not listed in the share sheet after installing, try uninstalling and reinstalling once, then report: the fallback is the paste box
   on the same screen (also reachable from the status page → "Look up shared text").
7. Privacy check: after a share the address bar should show only `…/#/share` (no query). The recorded event (Privacy → export) should show the word and
   `readerId: share-web`, and no sentence.

## 9. Open points

- Verify the share target, the fragment-only `action`, installability (icons, worker) on a device; read the web-platform documentation for them (not read
  for this task).
- Read the Intent reference for `ACTION_PROCESS_TEXT` and the Apple extension guides before building native code.
- Decide the analysis-layer option (section 5) after measuring bundle size and memory.
- `sharedSourceRef` records an app source as `kind: 'ebook'` because the contract has no "app" kind and the platform does not say what kind of app it is;
  a `kind: 'app'` in the contract would be more honest.
- `deep-link` maps to the `share-web` reader id; if native deep links need to be told apart, add a reader id.
- The 0.6 / 0.4 context confidences for a shared sentence / fragment are design choices to be calibrated against real shares.
- An `ios-share-extension` event is produced by a mirror of `buildSelectionEvent`; any change to that builder must be followed by `test/golearn-share/event.test.ts`.

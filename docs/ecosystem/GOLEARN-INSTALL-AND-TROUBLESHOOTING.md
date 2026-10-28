# GoLearn — installation and troubleshooting

Status: 2026-10-09. What a person has to do to run GoLearn today, honestly: there is no store listing yet and the
extension is loaded unpacked. An account is optional: the extension keeps your lookups, reviews and drafts on the
device, and the Go Repository service (run locally or by the owner) is only needed if you want your progress on
more than one device.

## 1. What gets installed where

| piece | how it is installed | what it stores |
|---|---|---|
| Go Repository service (only for the optional account) | run by the owner (`npx vite-node packages/repository-service/src/main.ts --port 8790 --data data/repository`, Node 24, no other dependency) or hosted later; the learner only enters its address | accounts (scrypt hashes), sessions (sha256 of tokens), enrolments, events, projections, private documents |
| GoLearn extension | Chrome: `chrome://extensions` → Developer mode → Load unpacked → `packages/golearn-extension/dist` (after `npm run ext:build` and the options build below). No website can install it; the hosted setup page only explains these steps | the on-device Repository (every lookup, your language enrolments, the learner model; `chrome.storage.local`, owned by the background worker), the session token and service address if you sign in (background only), the event queue, dictionary shards |
| GoLearn setup page | the extension's options page (`dist/app/`), or the hosted web build (`dist-web/`) for reading the installation guide without the extension | settings, pack-install record; in web mode only the page's own origin |
| Albanian language pack | the analyser is bundled in the extension; the dictionary (CC BY-SA, 6.4 MB) is packaged with the setup page and fetched into extension storage on install; the installer verifies the dictionary and runs 14 validation selections through the analyser | `golearn:pack:installed:pack:sq` and `pack:shard:*` |

Builds:
```
npm run ext:build                                                              # dist/content.js, background.js, action/
npx vite build -c packages/golearn-extension/app/vite.config.ts --mode options # dist/app/ (the options page + dict/sq)
npx vite build -c packages/golearn-extension/app/vite.config.ts --mode web     # dist-web/ (hosted setup page)
npx vite build -c packages/gopractice/vite.config.ts --mode extension          # dist/practice/ (GoPractice as a page of the extension)
```
Run the options build after `ext:build` (the content build keeps `dist/app/`). `ext:build` empties everything else in
`dist/`, including `dist/practice/`, so build GoPractice for the extension after it, every time.

## 2. First run, in order

No account, no team and no service are needed for any of these.

1. Open the setup page (toolbar button → Open GoLearn setup, or `dist-web/index.html`). On a first run it opens on **Sign in**:
   an optional account form and a plain **Continue without an account** button. An account only keeps progress across
   devices; nothing else needs it. After sign-in, account creation or "Continue without an account" the app moves to
   **Choose your languages**, which is where it opens from then on.
2. **Choose your languages**: six compact rows (Norwegian, German, Albanian, Hindi, Thai, Spanish), each with its level and
   a **Download language** menu. Any language is open to you. Norwegian asks for the written standard (Bokmål or
   Nynorsk; nothing is preselected); Spanish offers General or Honduras (an optional regional preference). One click on
   **Download …** saves the choice and installs the language's pack by itself, checking it as it goes. The row then says,
   for Albanian, "Albanian is ready: 16 checks passed" and **Downloaded · ready** (the other packs are experimental and
   say so; every pack is machine-drafted and not native-reviewed), or says what failed and offers **Retry**. You can
   download more languages: they all stay enabled; **Reading now** marks the one GoLearn records against, **Use for
   reading** switches, **Remove** takes a language off this device. What works and what does not, the licences and the
   checks are under **Details**. Meanings are found per language, in this order: the dictionary address (Settings → Diagnostics and updates; https,
   localhost or the extension's own files) if you set one; then the extension's own `app/` folder (Albanian only); then the
   hosted copy named by `dictionaryFallbackUrl` in `app/config.json` (the project's GitHub Pages site, which serves every
   language). The first place whose `dict/<language>/manifest.json` answers is used, so with no account and no address the
   card still has meanings. The install says which one it used ("16 checks passed, dictionary from the hosted copy"), and
   Diagnostics lists, for each downloaded language, where meanings are read from and whether that place answers now. The
   dictionary address is the override.
3. The cog wheel at the top right of every page opens **Settings**: the account (signed in as …, or on this device only;
   sign out; a link to the sign-in page) and the advanced screens (Sync, Privacy, Diagnostics and updates, How GoLearn
   reads pages). **Status** is a link in the top bar.
4. The languages page says what to do next once a language is ready: open a page in the language and switch on **GoLearn
   Active** in the extension popup.
5. Read: open any ordinary web page or the controlled EPUB reader with a DRM-free book you own; turn GoLearn on for
   the tab from the toolbar button; double-click a word (or select and press Alt+Shift+G, or right-click → Look up
   with GoLearn).
6. Practise: the **Practise** button in the toolbar popup (or on the setup page's Status screen) opens GoPractice as a
   page of the extension. It works on the device, without signing in: GoReview reads the candidates and knowledge from
   the on-device Repository, GoTell saves drafts there.
7. Optional, on the **Sign in** page (the first page of a first run, or cog → Account → Sign in): create an account or sign in (the service address is the extension's own, from `app/config.json`; since 2026-10-28 nothing on
   the page names or changes it). The password goes to the service only. What is already on this device is uploaded
   **once** (the page says how many events), the status changes from "On this device only" to "Synced to your
   account", and your language is enrolled on the account too. Signing out returns to this device alone and removes
   nothing; clearing the device's data is its own deliberate step (Privacy → Clear local data). Signing in on another
   account replaces the session and clears the cached profile.

## 3. Troubleshooting

| symptom | cause | what to do |
|---|---|---|
| "GoLearn is not allowed to read this page." | browser pages, store pages and some apps refuse content scripts | read elsewhere; nothing can be done on those pages |
| The toolbar switch turns off after a reload | `activeTab` is granted per gesture and lost on navigation | turn it on again (one click); this is by design |
| The card says "only the selected word (this reader gives no sentence)" | the reader exposes no sentence context (cross-origin frame, or a reader that renders bitmaps) | the lookup still works without disambiguation; see the supported-surfaces list |
| Kindle for Web shows nothing | Kindle renders pages as images; there is no text to select | copy the word or sentence in Kindle and paste it into the demonstration reader; Kindle is not supported and no claim is made |
| "Not connected: your history with this word is not shown." | you are using GoLearn on this device only | nothing is wrong; the card still works. Settings (the cog) → Account → Sign in only if you want your history on a service |
| "Your history with this word is not available until you sign in to GoLearn again." | the session expired or was revoked (401) | sign in again; nothing was lost, the queue waits |
| Sync shows pending rows and an error | the service is unreachable or offline | nothing to do; the worker retries with backoff and keeps every event; Sync → Sync now forces an attempt |
| "Speech is not available in this browser." / "No local Albanian voice" | the browser has no `speechSynthesis` or no voice tagged `sq`/`sq-AL` | there is no Albanian recording and no bundled voice; an English voice is never substituted; a remote voice needs the owner's provider key and your consent (Privacy) |
| "Not in the word list" / "the lemma is a guess from the ending" | the word is outside the pack's word list; the rules guessed | the card says so; use "This analysis is wrong" to propose a correction (it is a proposal, not a fact) |
| Dictionary meanings never appear | none of the three places answers for that language (Diagnostics → Dictionary address lists each language and what it tried), e.g. you are offline and the language was never looked up before, or the dictionary address you set is wrong | check the line for that language under Diagnostics; clear or correct the dictionary address (the other two places then apply); words looked up once keep working offline |
| Diagnostics says the service speaks an older contract | the service build is behind the extension | update the service; the extension keeps working for lookups and queues events |
| The pack screen says "planned, not installable" | that pack has no analyser in this build | no action; every language of the six has an installable pack today (Albanian is the reference, the rest are experimental) |
| GoPractice from a website says it "needs an account" | that is the hosted copy, which keeps its data on an account and has no on-device Repository | use the **Practise** button of the extension (its copy works on the device with no account), or sign in to the hosted copy |
| The **Practise** button says it cannot find the practice page | `dist/practice/` was emptied by a later `ext:build` | `npx vite build -c packages/gopractice/vite.config.ts --mode extension`, then reload the extension |

## 4. What is not available and is not claimed

Kindle, Kobo and Play Books support; automatic updates; a store listing; Albanian pronunciation audio; native-speaker
review of the word list, the rules or the orientation; snippet retention (switch shown disabled); machine translation.

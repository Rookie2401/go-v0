# GoLearn — installation and troubleshooting

Status: 2026-10-08. What a person has to do to run GoLearn today, honestly: there is no store listing yet, the
extension is loaded unpacked, and the Go Repository service is run locally or by the owner.

## 1. What gets installed where

| piece | how it is installed | what it stores |
|---|---|---|
| Go Repository service | run by the owner (`npx vite-node packages/repository-service/src/main.ts --port 8790 --data data/repository`, Node 24, no other dependency) or hosted later; the learner only enters its address | accounts (scrypt hashes), sessions (sha256 of tokens), enrolments, events, projections, private documents |
| GoLearn extension | Chrome: `chrome://extensions` → Developer mode → Load unpacked → `packages/golearn-extension/dist` (after `npm run ext:build` and the options build below). No website can install it; the hosted setup page only explains these steps | session token and service address (`chrome.storage.local`, background only), the event queue, the learner-model cache, dictionary shards |
| GoLearn setup page | the extension's options page (`dist/app/`), or the hosted web build (`dist-web/`) for reading the orientation and the installation guide without the extension | settings, tutorial progress, pack-install record; in web mode only the page's own origin |
| Albanian language pack | the analyser is bundled in the extension; the dictionary (CC BY-SA, 6.4 MB) is packaged with the setup page and fetched into extension storage on install; the installer verifies the dictionary and runs 14 validation selections through the analyser | `golearn:pack:installed:pack:sq` and `pack:shard:*` |

Builds:
```
npm run ext:build                                                              # dist/content.js, background.js, action/
npx vite build -c packages/golearn-extension/app/vite.config.ts --mode options # dist/app/ (the options page + dict/sq)
npx vite build -c packages/golearn-extension/app/vite.config.ts --mode web     # dist-web/ (hosted setup page)
```
Run the options build after `ext:build` (the content build keeps `dist/app/`).

## 2. First run, in order

1. Start or obtain the service address. Open the setup page (toolbar button → Open setup, or `dist-web/index.html`).
2. Account: enter the service address (https, or http on localhost), create an account or sign in. The password
   goes to the service only. Signing in on another account replaces the session and clears the cached profile.
3. Team and language: choose the team, then the language (Norway asks for the written standard). If the service does
   not know the team, enrol without a team and add it later; a team is not needed to read.
4. Language pack: Install. Expected: "Verified: all 16 checks passed". If the dictionary address is empty the card has
   no dictionary meanings; set it on this screen (https, localhost or the extension's own files).
5. Reader integration: in the extension, nothing to do. In the web page: follow the unpacked-load steps above.
6. Orientation: 15 steps, about 28 minutes, skippable in one click, repeatable from the summary. The practice steps
   show the real card on a demonstration passage (machine-drafted, not checked by a native speaker — it says so).
7. Read: open any ordinary web page or the controlled EPUB reader with a DRM-free book you own; turn GoLearn on for
   the tab from the toolbar button; double-click a word (or select and press Alt+Shift+G, or right-click → Look up
   with GoLearn).

## 3. Troubleshooting

| symptom | cause | what to do |
|---|---|---|
| "GoLearn is not allowed to read this page." | browser pages, store pages and some apps refuse content scripts | read elsewhere; nothing can be done on those pages |
| The toolbar switch turns off after a reload | `activeTab` is granted per gesture and lost on navigation | turn it on again (one click); this is by design |
| The card says "only the selected word (this reader gives no sentence)" | the reader exposes no sentence context (cross-origin frame, or a reader that renders bitmaps) | the lookup still works without disambiguation; see the supported-surfaces list |
| Kindle for Web shows nothing | Kindle renders pages as images; there is no text to select | copy the word or sentence in Kindle and paste it into the demonstration reader; Kindle is not supported and no claim is made |
| "Not connected: your history with this word is not shown." | no session on this device | Setup → Account → sign in |
| "Your history with this word is not available until you sign in to GoLearn again." | the session expired or was revoked (401) | sign in again; nothing was lost, the queue waits |
| Sync shows pending rows and an error | the service is unreachable or offline | nothing to do; the worker retries with backoff and keeps every event; Sync → Sync now forces an attempt |
| "Speech is not available in this browser." / "No local Albanian voice" | the browser has no `speechSynthesis` or no voice tagged `sq`/`sq-AL` | there is no Albanian recording and no bundled voice; an English voice is never substituted; a remote voice needs the owner's provider key and your consent (Privacy) |
| "Not in the word list" / "the lemma is a guess from the ending" | the word is outside the pack's word list; the rules guessed | the card says so; use "This analysis is wrong" to propose a correction (it is a proposal, not a fact) |
| Dictionary meanings never appear | no dictionary address, or shards unreachable, or the host refuses CORS | Language pack → Dictionary address; the pack's own files work in the extension |
| Diagnostics says the service speaks an older contract | the service build is behind the extension | update the service; the extension keeps working for lookups and queues events |
| The pack screen says "planned, not installable" | only Albanian is installable in this build | no action; the other packs exist as manifests only |

## 4. What is not available and is not claimed

Kindle, Kobo and Play Books support; automatic updates; a store listing; Albanian pronunciation audio; native-speaker
review of the word list, the rules or the orientation; snippet retention (switch shown disabled); machine translation.

# Biblia standalone — the installable web app (2026-10-22)

Plan and contract: `BIBLIA-STANDALONE-PLAN.md`. This document is the build and publish side (lane B): what the edition is, how to build
it, how the owner publishes it, how it updates, and what the old Biblia app's address loses and keeps.

## What the edition is

`packages/biblia` built a third way. The same static site as the default build, plus what makes it an installable web app:

| addition | where | note |
|---|---|---|
| `config.json` | `dist-standalone/config.json` | `{ "serviceUrl": "...", "assetBaseUrl": "./" }`, the address of the Go Repository service. The source `packages/biblia/config.json` keeps the development address `http://127.0.0.1:8790`; the build writes the copy |
| edition marker | `<meta name="biblia-edition" content="standalone">` in `index.html` | `main.ts` reads it: standalone means "connect to the service in `config.json`". `packages/biblia/index.html` itself is not edited; a Vite HTML transform adds the marker |
| manifest + icons | `manifest.webmanifest`, `icons/` | name "Biblia", standalone display, start `./index.html`, scope `./`; 192 and 512 px icons, a maskable 512, an SVG, and the 180 px `apple-touch-icon` — the Biblia app's own icons, reused |
| iOS tags | in `index.html` | home-screen capable, status bar `default`, title "Biblia", `apple-touch-icon`, `viewport-fit=cover` |
| service worker | `sw.js`, registered by an inline script (source `public/register.js`) | below |

The default build (`dist`) and the extension build (`golearn-extension/dist/biblia`) carry none of these; they must not (an extension page
may not register a worker). `public/` holds the standalone files for all modes, and those two builds drop them from their output.

### Environment variables and modes

| | effect |
|---|---|
| `--mode standalone` | writes `packages/biblia/dist-standalone/` |
| `BIBLIA_OUT=<folder>` | any build goes there instead (the test builds into a scratch folder) |
| `BIBLIA_SERVICE_URL=<url>` | standalone only: replaces `serviceUrl` in the COPIED `config.json`. Accepted: `https://…`, or `http://` on `localhost` / `127.0.0.1`. Refused (the build stops before bundling): any other `http://`, a query, a fragment, credentials, a string that is not a URL. A trailing slash is dropped. Unset: the source address is kept, and the build prints a warning that only this computer can reach it |

## Build it against the public address

```
cd C:\Users\CJWal\dev\go-v0
npm run biblia:import                       # only if packages/biblia/public/data is missing (texts from the old Biblia app)
```
PowerShell:
```
$env:BIBLIA_SERVICE_URL = "https://repo.golearn-global-languages.com"
npm run biblia:build-standalone
Remove-Item Env:BIBLIA_SERVICE_URL
```
Bash:
```
BIBLIA_SERVICE_URL=https://repo.golearn-global-languages.com npm run biblia:build-standalone
```
Check the result: `packages/biblia/dist-standalone/config.json` must show the https address. The folder is about 49 MB (texts 19 MB,
lexicon 28 MB, shell 1.4 MB), far under GitHub Pages' 1 GB limit.

Local trial against the local service: `BIBLIA_SERVICE_URL=http://127.0.0.1:8790` (or leave it unset), then serve the folder from
`localhost` (a service worker needs https or localhost): `npx vite preview --outDir packages/biblia/dist-standalone --port 4199`.

## Publishing to rookie2401.github.io/biblia (the owner runs this; nothing here pushes)

The live Biblia app is the repository `github.com/Rookie2401/biblia`, checked out at `C:\Users\CJWal\dev\biblia-v0`; its site is the
`gh-pages` branch (the old app's `dist` at the branch root: `index.html`, `assets/`, `data/`, `sw.js`, `registerSW.js`, `workbox-*.js`,
`manifest.webmanifest`, `.nojekyll`). Publishing the new edition replaces that content with `dist-standalone`. Use a separate worktree so
the checkout's `master` working tree is not disturbed. Never inside OneDrive: the worktree goes under `C:\Users\CJWal\dev`.

PowerShell, after the build above:

```
cd C:\Users\CJWal\dev\biblia-v0
git fetch origin
git worktree add -B gh-pages C:\Users\CJWal\dev\biblia-pages origin/gh-pages
cd C:\Users\CJWal\dev\biblia-pages

# make the branch exactly dist-standalone (robocopy /MIR deletes what is not in the source; .git and .nojekyll are protected)
robocopy C:\Users\CJWal\dev\go-v0\packages\biblia\dist-standalone . /MIR /XD .git /XF .git .nojekyll
# robocopy exit codes 0-7 are success

git add -A
git status --short          # look: index.html, sw.js, config.json, manifest.webmanifest, icons/, assets/, data/, lexicon/ ; the old registerSW.js and workbox-*.js are deleted
git commit -m "Deploy: Biblia standalone edition (installable, connected to the Go Repository)"
git push origin gh-pages    # the owner's push
```

If the worktree directory already exists from an earlier publish, skip `git worktree add`, run `git fetch origin` and `git reset --hard origin/gh-pages`
inside it (it holds only built files), then continue from `robocopy`. If the branch did not exist at all, create it as an orphan instead:
`git worktree add --detach C:\Users\CJWal\dev\biblia-pages`, then inside it `git checkout --orphan gh-pages`, `git rm -rf .`, copy the folder in
(`robocopy ... /E /XD .git`), `New-Item .nojekyll`, commit and `git push -u origin gh-pages`.

GitHub Pages builds the branch within a minute or two: <https://rookie2401.github.io/biblia/>. The Pages settings (branch `gh-pages`, root) are
already in place for the old app. Afterwards `git worktree remove C:\Users\CJWal\dev\biblia-pages` is optional tidying.

The service address must be reachable from where the app is opened: `https://repo.golearn-global-languages.com` is. The service has to allow the
page's origin (`https://rookie2401.github.io`) in its CORS settings; that is a service-side setting, not part of this build.

## The service worker

`sw.js` is stamped by the build with three things: `BUILD_ID` (12 hex digits of a SHA-256 over the names and bytes of every shell file),
`DATA_ID` (the same over the texts and lexicon files) and the precache list.

| request | handling |
|---|---|
| navigation | the cached `index.html` (the app opens offline) |
| shell: `index.html`, `assets/*`, `manifest.webmanifest`, `icons/*` | precached at install in `biblia-shell-<BUILD_ID>`; cache-first |
| `config.json` | in the shell cache, but network-first; the cached copy only when the network fails (so a changed address reaches an installed app) |
| `data/**`, `lexicon/**` (about 47 MB) | NOT precached. Cache-first, each file kept the first time it is fetched, in `biblia-data-<DATA_ID>` (200 responses only, at most 1,000 entries): a chapter once read works offline |
| another origin (the Repository service) | not handled; goes to the network, never cached |
| a request with an `Authorization` header, a non-GET, anything outside the scope or outside the lists above | not handled |

**Updates.** A new build has a new `BUILD_ID`; its worker installs (precaching the new shell completely first), calls `skipWaiting`, claims
the open pages, and deletes every `biblia-shell-*` cache but its own, every `biblia-data-*` cache but its own (a build with unchanged texts keeps
its downloaded chapters), and the old app's Workbox precache for this scope. `register.js` reloads the page once when a worker takes over a page
a worker was already controlling; the very first install does not reload. The app looks for a new build when it returns to the foreground and when
the network comes back, besides the browser's own check on each launch. Only caches this app made are touched: `rookie2401.github.io` hosts other
apps (Sefer, Vetus, Слово ...) whose caches share the origin's storage.

**Moving from the old app.** The old app already has a worker at the same `sw.js` address and scope, so a returning visitor's browser
replaces it with this one on its next update check (the old worker's own cleanup of its data cache is also done by the new one). Their first
visit after the push may show the old app once before the new one takes over.

## What the old Biblia app at that address loses and keeps

Keeps: the texts. They are the same files (`data/he/<Book>.json` the Masorah text with the Open Scriptures morphology; `data/el/<Book>.json` the SBL
Greek New Testament with MorphGNT), the same Tanakh / New Testament organisation, chapter reader, verse numerals, Hebrew full / points only /
consonants choice, and the same address. Adds: lookups on the shared GoLearn card, the Variants tab, and (with the account in the app) recording
under the GoLearn account, GoReview and the extension seeing what is read.

Loses (see `packages/biblia/README.md`, "What it is not (yet)"): the old app's own dictionary panels (the full BDB and Abbott-Smith entries; the
card's Meanings are the analysers' glosses instead), its search, vocabulary and progress screens, and the Septuagint and Vulgate, which had already
moved to Vetus (rookie2401.github.io/vetus). Saved state of the old app in the browser (its settings under `biblia:settings`) is not read by the new
one; the new app keeps its own last position and preferences. The old app needed no service; this edition's lookups are recorded to the service
when signed in, and without it the reader still reads.

## What was verified

Run on 2026-10-22: `test/biblia/standalone-build.test.ts` (builds into a scratch folder: config copy, marker, manifest link, manifest fields,
sw.js BUILD_ID and shell-only precache list, the refusals, the default build free of standalone files) and a real build against the https address.
Not exercised: the worker in a browser (install, offline reload, update replacing an older build), iOS "Add to Home Screen", the old app's worker
being replaced on a real returning visitor, the push and Pages.

**Browser walk, 2026-10-22 (coordinator), the built edition served from `http://127.0.0.1:5201` against the local service on 8790, the same
code the public service runs:** the library opens signed out with "Sign in to record what you read"; `#/account` creates a throwaway
account and signs in (service log: `POST /accounts 201`, `POST /sessions 201`); Genesis 1 paints its 435 words New and shows the legend
(`GET /knowledge` in four batches); tapping אֱלֹהִים makes it Seen at once, creates the Hebrew enrolment and records the lookup
(`GET /enrolments`, `POST /enrolments 201`, `POST /events 200`, then `GET /knowledge`); a reload paints it Seen again from the service; Sign
out returns the signed-out notice and removes every level mark and the legend. The level buttons of the card were not pressed in that walk
(the browser pane was hidden, so no clicks reach the card's closed shadow root); the mark → repaint path is covered by
`test/biblia/live.test.ts` over the real John 1 data with a fake service. The service answers every origin (`Access-Control-Allow-Origin: *`,
`packages/repository-service/src/http.ts`), so the Pages origin needs no setting. The service worker could not register in the desktop
pane (it never can on that host); its rules are exercised by `node --check` and the build test only.

**Publish build (2026-10-22):** `BIBLIA_SERVICE_URL=https://repo.golearn-global-languages.com npm run biblia:build-standalone` →
`dist-standalone` 49 MB, `config.json` with the https address, `sw.js` `BUILD_ID bc49b2116c8a`. Waiting for the owner's push.

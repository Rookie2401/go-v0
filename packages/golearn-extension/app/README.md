# GoLearn setup application (`app/`)

The onboarding and settings application of GoLearn. One codebase, two ways to run:

- **the extension's options page** (`dist/app/`, `"options_page": "app/index.html"`): chrome.storage.local, messages to the
  background worker, which holds the Repository session and does the signing in, recording and syncing;
- **a hosted web app** (`dist-web/`): the origin's own `localStorage`, no extension API. A web page can never install an
  extension, and the "How GoLearn reads pages" screen says so and explains the legitimate way (load unpacked today, the Web Store later).

Plain TypeScript and DOM, one hash router, one stylesheet. No framework.

## Screens

A slim top bar on every page (the brand **GoLearn**, the page title, **Status**, and a cog wheel, `#settings-link`, at the top right that opens
Settings; there is no left rail). **Sign in** (`#/signin`) is the first page on a first run (no language chosen and nobody signed in);
**Choose your languages** (`#/languages`) is the main page and the default once a language is chosen or someone is signed in; **Settings**
(`#/settings`) holds the account and the links to the advanced screens (`#/sync`, `#/privacy`, `#/diagnostics`, `#/reader`); `#/home` is the
compact status (link in the top bar) and `#/share` is the share target. Setup is complete when at least one language is downloaded with its
pack installed and verified (`completion.ts`, key `languages`). There is no pager between screens; each screen ends with "Done — back to
reading" (and a way back: advanced screens to Settings, Settings and Status to Languages). Nothing here mentions a team, a mission team or a
leader; any learner downloads any language. The old links `#/welcome`, `#/language`, `#/pack`, `#/account`, `#/tutorial` (and `#/team`) are
rewritten to `#/languages` (`ALIASES` in `app.ts`).

| route | what it does |
|---|---|
| `signin` | **Sign in**: the brand, one sentence, the account form (sign in / create, email, password; the service address under a closed detail; `screens/signin.ts`, `screens/account.ts`) and a plain **Continue without an account** (`#continue-without-account`; an account is optional, it only keeps progress across devices). After sign-in, account creation or "Continue" the app moves to `#/languages`; what the form said ("Account created and signed in as …", what was uploaded) is carried there once as `#flash` (`flash.ts`). Signing in uploads the device's history once and enrols the chosen languages on the account. |
| `languages` | **Choose your languages**: six compact rows from `LANGUAGE_CATALOGUE`, in its order (`screens/languages.ts`, `screens/language.ts`): name and native name, script and level ("reference pack, machine-drafted, unreviewed" / "experimental, seed-only"), and at the right a **Download language** menu (`<details>`). Norwegian asks for the written standard (Bokmål or Nynorsk, nothing preselected), Spanish offers General or Honduras. **Downloading does everything**: the enrolment in the on-device Repository (and on the account when signed in), then the pack install and its verification (`packInstall.ts`), with progress and the result inline on the row ("Albanian is ready: 16 checks passed", or the failure with the checks and a Retry button). Several languages can be downloaded and all stay enabled; a downloaded row says "Downloaded · ready", the one being read carries "Reading now", the others "Use for reading", and **Remove** ends the device enrolment (the installed pack stays; the account copy is untouched). What works / what does not, the audio line, the pack line, Re-verify / Reinstall and the licences sit in a collapsed **Details** under the row. A signed-in learner whose account already uses a language gets its pack downloaded by itself. Once a language is ready the page says to open a page in the language and switch on GoLearn Active in the extension popup. |
| `settings` | the cog: **Account** ("On this device only" / "Signed in as …", sign out, a link to `#/signin`) and **Advanced**: links to Sync, Privacy, Diagnostics and updates, How GoLearn reads pages |
| `sync` (under Settings) | status from the background worker, "Sync now"; in the web app "runs inside the extension" |
| `privacy` (under Settings) | snippets (cannot be switched on in this version), remote speech consent (names the provider), external processing (cannot be switched on), explanation depth, export (`GET /export` → JSON download), **Clear local data** (explicit, two clicks; never a side effect of signing out), delete account (type the email) |
| `diagnostics` (under Settings, **Diagnostics and updates**) | versions, service health, counts, copyable report; Updates: installed vs available pack versions, service vs contract version; the dictionary address; "no automatic updates in this build" |
| `reader` (under Settings, **How GoLearn reads pages**; also a link at the foot of the languages page) | installed + version + how it is switched on (extension) or step-by-step installation (web); permissions explained; supported surfaces (`surfaces.ts`). Not part of setup |
| `share` | the web share target and deep link; not in the navigation |

The orientation (tutorial) is no longer part of setup: the screen and its lookup driver were removed from this application; the tutorial
data stays in `packages/language-packs` for GoPractice.

## Storage keys

All under the extension's own keys, so the worker and this page see the same state.

| key | holds | written by |
|---|---|---|
| `golearn:session` | `{ token, learnerId, enrolmentId, languageId, expiresAt, email }` — the only place the token is written | the worker (extension) / this page (web, or no worker) |
| `golearn:service` | `{ baseUrl, assetBase? }` — service address and dictionary address | the worker via `golearn:service-config` / this page |
| `golearn:settings` | `{ keepSnippets, remoteSpeechConsent, externalProcessingConsent, explanationDepth? }` (absent depth = automatic) | the worker via `golearn:settings` / this page |
| `golearn:app` | `{ visited[], tutorial, tutorialStep, packs{id→{version,ok,verifiedAt}}, readerAck }` (`tutorial*` are no longer written) | this page |
| `golearn:choice` | `{ enrolmentId, languageId, varietyId?, packId?, standard? }` — the language this device reads, with or without an account | this page |
| `golearn:profile` | `{ fetchedAt, email, learnerId, enrolments[] }` cache; cleared at every sign-in, switch and disconnect | this page |
| `golearn:deviceId` | the dummy device id, created once | `getDeviceId` (shared with the extension) |
| `golearn:event:*` | encounter rows (the extension's store; this page writes them only in the web app or when no worker answers) | |
| `golearn:pack:installed:<packId>` | the installer's record | `installPack` through `bindings.ts` |

The password is sent to the service address (extension: in the message to the worker, which sends it) and is never stored.

## Messages to the worker (extension context)

All are the extension's own (`MSG` in `src/platform.ts`) and are answered for extension pages only. A message nobody
answers falls back to the same effect on the shared storage.

`golearn:connect`, `golearn:create-account` (`{ baseUrl, email, password }`), `golearn:disconnect`,
`golearn:service-config` (`{ op:'set', baseUrl, assetBase? }`), `golearn:select-enrolment`, `golearn:settings`
(`{ op:'set', patch }`), `golearn:record` (`{ event }`), `golearn:status`, `golearn:sync-now`, `golearn:clear-local`,
and `golearn:local-repo` (`{ op: 'enrol' | 'select' | 'status' | 'upload' | 'clear' | 'api' … }`, the on-device Repository).

The one on-device Repository lives in the worker (`packages/repository-local`); this page reaches it through `localBinding.ts`
(`connectLocalRepository`). Choosing a language is `op: 'enrol'` there (idempotent per language; it becomes the active one) and `op: 'select'`
when the learner switches. When signed in, the page also enrols on the account (`POST /enrolments` through the typed client, no team) and asks the
worker to adopt that enrolment. In the hosted web app there is no worker: the page opens the repository itself over its own storage (a separate chunk).

## Files

```
index.html  main.ts  app.ts  router (in app.ts)  styles.css  vite.config.ts  config.json
context.ts      environment, worker link, sign-in / sign-out / settings / record
state.ts        storage abstraction (chrome.storage.local | localStorage), typed keys, serialised read-modify-write
config.ts       service-address validation, config.json loading
ports.ts        Deps and the views the screens render (packs, languages)
bindings.ts     the file that adapts packages/language-packs to ports.ts (with languages.ts: the six languages from LANGUAGE_CATALOGUE)
localRepo.ts / localBinding.ts   the on-device Repository: the shape the app relies on, and the one file that imports packages/repository-local
completion.ts   whether setup is complete (a language downloaded, its pack installed)
flash.ts        the one-line note carried from the sign-in page to the languages page
packInstall.ts  install + verify + record a pack; the dictionary-address card (shown under Diagnostics)
surfaces.ts     what works / what does not; the permissions explained
screens/*.ts    one file per screen
```

Imports: this package's `src/`, `repository-contract`, `repository-service/src/api` (the typed client only) and
`language-packs` (through `bindings.ts`). GoListen is not imported: the card plays local voices only, and the remote
provider named on the Privacy screen comes from the pack's manifest.

## Build

```
npm run ext:build                                                         # the extension (empties dist/ but keeps dist/app/)
npx vite build -c packages/golearn-extension/app/vite.config.ts --mode options   # -> dist/app/   (classic IIFE script, ./app.js)
npx vite build -c packages/golearn-extension/app/vite.config.ts --mode web       # -> dist-web/   (base './', any host or sub-path)
npx vite -c packages/golearn-extension/app/vite.config.ts                         # dev server on :5197 with the repository's public/
```

Both builds copy `config.json` (edit it for a deployment: `serviceUrl`, `assetBaseUrl`) and `public/dict/<lang>/` for the
languages in `GOLEARN_APP_DICT` (default `sq`, about 6.4 MB; set it empty to leave dictionaries out and serve them elsewhere).

## Tests

`npx vitest run test/golearn-app` (jsdom; fakes for fetch, chrome and the service) plus `integration.test.ts`, which runs the
application against the real background worker, the real Repository service (SQLite in memory) and the real language pack.

## Limits, said plainly

- Six languages are offered. Albanian is the reference pack; the others are experimental, seed-only and unreviewed, and the rows say so; every pack is described as machine-drafted and not native-reviewed.
- An account is optional. The language choice is a `golearn:choice` record plus an enrolment in the on-device Repository; where that Repository is not available (an older worker) the choice is still kept, without an enrolment record.
- A web page cannot detect or install the extension; "I have installed it" is the learner's own statement.
- Consents and preferences are stored in `golearn:settings`; they are not yet emitted as `ConsentGiven` / `PreferenceChanged` events because the
  worker's recorder admits only the content script's event kinds.
- In the extension the dictionary the installer checks can sit inside the extension (`dist/app/dict/`), but the worker fetches glosses only from
  an https (or localhost) dictionary address; until one is set under Diagnostics and updates the card has no dictionary meanings.
- Nothing here updates itself.

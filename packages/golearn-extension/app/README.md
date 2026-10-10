# GoLearn setup application (`app/`)

The onboarding and settings application of GoLearn. One codebase, two ways to run:

- **the extension's options page** (`dist/app/`, `"options_page": "app/index.html"`): chrome.storage.local, messages to the
  background worker, which holds the Repository session and does the signing in, recording and syncing;
- **a hosted web app** (`dist-web/`): the origin's own `localStorage`, no extension API. A web page can never install an
  extension, and the Reader screen says so and explains the legitimate way (load unpacked today, the Web Store later).

Plain TypeScript and DOM, one hash router, one stylesheet. No framework.

## Screens

`#/home` (compact status, shown once setup is complete) and nine screens in the left list, each with a completion mark
computed from what is actually true (`completion.ts`), and "Done — back to reading" at the end. The order is the flow:
choose your language, install its pack, take its orientation, check the reader; **the account is optional and last**.
Nothing here mentions a team, a mission team or a leader; any learner picks any language.

| route | what it does |
|---|---|
| `welcome` | what GoLearn is, two sentences; no course |
| `language` (**Choose your language**; the old `#/team` redirects here) | six cards from `LANGUAGE_CATALOGUE`, in its order: native name, script, level ("reference pack, machine-drafted, unreviewed" / "experimental, seed-only"), what works, what does not, the audio line. `#language` / `#variety` / `#enrol-form`: Norwegian asks for the written standard (Bokmål or Nynorsk, nothing preselected), Spanish offers an optional regional preference. Picking one makes an enrolment in the on-device Repository (no account) and, when signed in, one on the account too. Several languages may be active; the list at the top switches between them |
| `pack` | dictionary address; install a pack (`installPack`), verification results (dictionary description, a shard, every validation case), re-verify, version, licences, CC BY-SA attribution; planned packs are "planned, not installable" |
| `tutorial` | the orientation of the language you chose; skippable in one click, repeatable; practice steps use the real `parseSelection` and `createCardUI` on a demonstration sentence |
| `reader` | installed + version + how it is switched on (extension) or step-by-step installation (web); permissions explained; supported surfaces (`surfaces.ts`); "Try it here" |
| `account` (**Keep your progress (optional)**) | "Not now"; service address (https, or http on localhost), create account / sign in, disconnect, account switching. Signing in uploads the device's history once and says how many events; the status line reads "On this device only" or "Synced to your account"; signing out returns to the device and removes nothing |
| `sync` | status from the background worker, "Sync now"; in the web app "runs inside the extension" |
| `privacy` | snippets (cannot be switched on in this version), remote speech consent (names the provider), external processing (cannot be switched on), explanation depth, export (`GET /export` → JSON download), **Clear local data** (explicit, two clicks; never a side effect of signing out), delete account (type the email) |
| `diagnostics` | versions, service health, counts, copyable report; Updates: installed vs available pack versions, service vs contract version; "no automatic updates in this build" |

## Storage keys

All under the extension's own keys, so the worker and this page see the same state.

| key | holds | written by |
|---|---|---|
| `golearn:session` | `{ token, learnerId, enrolmentId, languageId, expiresAt, email }` — the only place the token is written | the worker (extension) / this page (web, or no worker) |
| `golearn:service` | `{ baseUrl, assetBase? }` — service address and dictionary address | the worker via `golearn:service-config` / this page |
| `golearn:settings` | `{ keepSnippets, remoteSpeechConsent, externalProcessingConsent, explanationDepth? }` (absent depth = automatic) | the worker via `golearn:settings` / this page |
| `golearn:app` | `{ visited[], tutorial, tutorialStep, packs{id→{version,ok,verifiedAt}}, readerAck }` | this page |
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

## The orientation

`tutorialLookup.ts` drives the extension's own components on a demonstration paragraph the way `content/controller.ts`
drives them on a page: selection → sentence context → `parseSelection` → `createCardUI().show` → `buildSelectionEvent` →
record. The event carries `producer.surface = 'tutorial'` and evidence quality `none`, and is recorded through
`golearn:record` (extension; the worker's recorder replaces learner, enrolment and device, so the producer must be
`golearn-ext`) or into the local event store (web; producer `golearn-app`). A practice step is complete when the card's
surface is the target word. The keyboard route (a "Select it for me" button) takes the same path.

## Files

```
index.html  main.ts  app.ts  router (in app.ts)  styles.css  vite.config.ts  config.json
context.ts      environment, worker link, sign-in / sign-out / settings / record
state.ts        storage abstraction (chrome.storage.local | localStorage), typed keys, serialised read-modify-write
config.ts       service-address validation, config.json loading
ports.ts        Deps and the views the screens render (packs, languages, tutorial)
bindings.ts     the file that adapts packages/language-packs to ports.ts (with languages.ts: the six languages from LANGUAGE_CATALOGUE)
localRepo.ts / localBinding.ts   the on-device Repository: the shape the app relies on, and the one file that imports packages/repository-local
completion.ts   which screens are done
surfaces.ts     what works / what does not; the permissions explained
tutorialLookup.ts  the real parser + card + recording
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

- Six languages are offered. Albanian is the reference pack; the others are experimental, seed-only and unreviewed, and the cards say so.
- An account is optional. The language choice is a `golearn:choice` record plus an enrolment in the on-device Repository; where that Repository is not available (an older worker) the choice is still kept, without an enrolment record.
- A web page cannot detect or install the extension; "I have installed it" is the learner's own statement.
- Consents and preferences are stored in `golearn:settings`; they are not yet emitted as `ConsentGiven` / `PreferenceChanged` events because the
  worker's recorder admits only the content script's event kinds.
- In the extension the dictionary the installer checks can sit inside the extension (`dist/app/dict/`), but the worker fetches glosses only from
  an https (or localhost) dictionary address; until one is set on the Language pack screen the card has no dictionary meanings.
- Nothing here updates itself.

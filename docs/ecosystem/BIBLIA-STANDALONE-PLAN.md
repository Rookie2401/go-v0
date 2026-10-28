# Biblia as a separate, connected app — plan and file ownership (2026-10-22)

Owner's decision (2026-10-22): Biblia becomes an installable web app of its own, served at **rookie2401.github.io/biblia** in place
of the old Biblia app, and **connected** to the Go Repository the way GoReview is: the learner signs in with the GoLearn account,
every lookup and self-mark is recorded under that account, and the knowledge levels of the words (learned anywhere: the extension,
GoReview, Biblia itself) are painted on the page and kept current while the app is open. The iPhone-store shell comes later from
the same code. The two existing modes stay as they are: inside the GoLearn extension (device Repository) and inside the GoReview
iPhone app (its Keychain session).

What exists: `packages/biblia` (README there). `main.ts` picks a `Recorder` (`src/repo.ts`): `'extension'` over `golearn:local-repo`,
`'app'` inside the iPhone app, else `'none'` (reader only). The shell is `src/app.ts` (`createBibliaApp(deps)`, deps injected: `source`,
`recorder`, `storage`, `now`, `win`, `doc`), tests in `test/biblia/*.test.ts` run the real app in jsdom with a fake recorder and the
real Genesis 1 / John 1 data. Builds: `vite build -c packages/biblia/vite.config.ts` (dist) and `--mode extension`.

## Contract (fixed; both lanes build against it)

### config.json (served beside index.html; written by the build)

```json
{ "serviceUrl": "https://repo.golearn-global-languages.com", "assetBaseUrl": "./" }
```
Source file `packages/biblia/config.json` holds the development address `http://127.0.0.1:8790`. The build copies it; the environment
variable `BIBLIA_SERVICE_URL` (https, or http on localhost/127.0.0.1; no query, fragment or credentials; a trailing slash is dropped)
replaces `serviceUrl` in the COPY only, exactly as `GOREVIEW_SERVICE_URL` does in `packages/goreview/app/vite.config.ts`. Read at
runtime with `loadConfig` from `packages/goreview/app/config.ts`.

### Recorder modes (`src/repo.ts`)

`Recorder.mode` gains `'account'`: the standalone app signed in to the service. `'none'` keeps its reason text. `apiRecorder` stays
the one implementation over a `RepositoryApi`; the account mode wraps it with an offline queue (below).

### Session (`src/session.ts`, lane A)

```ts
export interface BibliaSession { serviceUrl: string; token: string; learnerId: string; email: string; deviceId: string; expiresAt?: string }
export function loadSession(storage: Storage | undefined, serviceUrl: string): BibliaSession | undefined; // only a session for THIS serviceUrl
export function saveSession(storage: Storage | undefined, s: BibliaSession): void;   // key 'biblia:session'
export function clearSession(storage: Storage | undefined): void;
export function deviceIdFor(storage: Storage | undefined): string;                    // 'biblia:web:<random>' persisted under 'biblia:device'
```
The token is kept in localStorage like GoReview's web edition keeps its own; nothing else (no password) is ever stored. `api.me()` on
start decides signed-in or signed-out (401 clears the session).

### Levels on the page (lane A)

Unit ids follow the Repository's scheme (`packages/repository-contract/src/units.ts`; see also how `packages/golearn-extension/src/active/levels.ts`
and `highlight.ts` paint the extension's pages). For the chapter on screen the app asks `api.knowledge(unitIds)` for the words' form
units (batched, deduplicated, cached per chapter) and paints the six levels with the same meanings as the extension: New = light-blue
highlight; Seen = heavy underline; Recognized = lighter underline; Familiar = faint underline; Known / Automatic = nothing. After the
learner's own mark the word is repainted at once; the chapter is refreshed when the tab regains focus, after each own event, and every
60 s while visible. Styles belong in `packages/biblia/styles.css` (lane A owns that file).

### Standalone edition markers (lane B)

`index.html` is left as it is; the standalone build injects `<meta name="biblia-edition" content="standalone">`, the manifest link,
the iOS meta tags and the inline service-worker registration through a Vite HTML transform, exactly as `packages/goreview/app/vite.config.ts`
does for GoReview (`reviewHtml`, `writePwa`, `public/{manifest.webmanifest,sw.js,register.js,icons}`). `main.ts` (lane A) reads the
marker: `document.querySelector('meta[name=biblia-edition]')?.content === 'standalone'` means "connect to the service in config.json".

## Lanes and file ownership (nothing else is touched; other packages are read, never edited)

### Lane A — account, recording, levels, live (Sonnet)

Owns: `packages/biblia/main.ts`, `packages/biblia/src/app.ts`, `src/repo.ts`, `src/session.ts` (new), `src/account.ts` (new: the
sign-in / sign-up / forgot-password screen, in Biblia's own DOM style, over `createRepositoryApi` from `packages/repository-service/src/api`
and `createAccountClient` from `packages/goreview/app/accountClient.ts`), `src/queue.ts` (new: an offline queue of `GoEvent[]` under
`'biblia:queue'`, flushed on start, on `online`, after each successful append; capped at 2,000 events, oldest dropped with a notice),
`src/levels.ts` (new), `packages/biblia/styles.css`, tests `test/biblia/{session,account,queue,levels,live}.test.ts` (fake
`RepositoryApi` objects; `test/golearn-app/accountFake.ts` shows a fake of the account routes). Must keep `test/biblia/app.test.ts`
and `canon.test.ts` green and both existing modes working (`'extension'`, `'app'`).

Screens: the library view gets an account line (signed out: "Sign in to record what you read" → the account screen; signed in: the
email, "Sign out"); the notice box says, per mode, where lookups and marks go. The account screen: email + password, Sign in; Create
account (same fields; after it, "check your email" when the service says `verificationSent`); Forgot password (email only → "if the
address exists, an email was sent"); links to the Privacy Policy and Terms (`packages/goreview/app/legal.ts` has the texts). Sign-in
errors are the service's own messages (`explainAccountFailure`). No password is ever logged, stored or echoed.

### Lane B — the installable build, its assets, its test, the publish notes (Sonnet)

Owns: `packages/biblia/vite.config.ts` (`--mode standalone` → `packages/biblia/dist-standalone`; `BIBLIA_OUT` still overrides;
`BIBLIA_SERVICE_URL` validation and the config copy; the HTML transform; `writePwa`), `packages/biblia/config.json` (new),
`packages/biblia/public/{manifest.webmanifest,sw.js,register.js,icons/*}` (new; icons from the owner's old app
`C:\Users\CJWal\dev\biblia-v0\public` if it has any, else a plain SVG + the PNG GoReview's icon script produced, re-coloured), `package.json`
script line `"biblia:build-standalone": "vite build -c packages/biblia/vite.config.ts --mode standalone"` (stage that ONE line as a
HEAD-based hunk: `git show HEAD:package.json`, insert, `git hash-object -w`, `git update-index --cacheinfo`; never `git add package.json`
whole, other sessions' lines sit in it), `test/biblia/standalone-build.test.ts` (builds into a scratch folder with `BIBLIA_OUT`; checks
config.json, the edition marker, manifest, sw.js precache list and BUILD_ID, the refusal of http / query / credentials), the README's
Run section, and `docs/ecosystem/BIBLIA-STANDALONE.md` (new: what the edition is, how to build it against the public hostname, how the
owner publishes `dist-standalone` to the `gh-pages` branch of `github.com/Rookie2401/biblia` from the checkout at
`C:\Users\CJWal\dev\biblia-v0` — exact commands, with the push left to the owner — and how the service worker updates).

Service worker: precache the shell only (index.html, assets/*, styles, config.json, manifest, icons; NOT `data/**` and `lexicon/**`,
40 MB); runtime-cache `data/**` and `lexicon/**` cache-first so a chapter once read works offline; never cache the service's
responses; a new BUILD_ID replaces the old caches; `register.js` reloads once when a new worker takes over, as GoReview's does.

## Rules for both lanes

- Work in `C:\Users\CJWal\dev\go-v0` only (never under OneDrive). Several sessions share the tree: `git add` by explicit path only,
  never `git add -A` or `commit -a`; never push; never revert or delete files you did not write; do not commit — the coordinator
  commits after verification. Report which files you changed.
- No secrets: never ask for, print or store a password, token or key; test accounts exist only in tests. No purchases, no accounts.
- Keep `npx tsc -b` clean for your files and these green: `npx vitest run test/biblia test/audit/conformance.imports.test.ts
  test/audit/conformance.structure.test.ts`. The structure audit limits what `packages/biblia` may import: today it reaches
  `golearn-extension` (parser, card, store, contract/readerAdapter), `repository-local` (proxy), `repository-service` (api),
  `repository-contract`, `gopractice` (mobile, config), `src/adapters/{he,el,hebrew,greek}`. Adding `gopractice/accountClient.ts`
  and `gopractice/legal.ts` stays within that set; adding any new package is not allowed.
- Report honestly: what you verified by running it, what you did not. Never claim the live site or the service was exercised unless
  you did it; the coordinator runs the browser walk against the local service.

## Coordinator (this session)

Writes this plan, spawns the lanes, then: `npx tsc -b`; the suites above; `npm run biblia:build-standalone` with
`BIBLIA_SERVICE_URL=http://127.0.0.1:8790`; a browser walk on the built edition against the local service (create a throwaway account,
look up and mark words in Genesis 1, see the level painted and recorded in `GET /me/export`, sign out, reload offline); then the build
against `https://repo.golearn-global-languages.com`, the record under `docs/ecosystem/`, commits by path, and the publish instructions
for the owner (the push to `Rookie2401/biblia` gh-pages is the owner's).

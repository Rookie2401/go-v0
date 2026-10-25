# The hosted web apps on GitHub Pages (2026-10-23)

Three of the ecosystem's apps are served from GitHub Pages; all three talk to the same Go Repository service,
`https://repo.golearn-global-languages.com` (the PC behind the named Cloudflare tunnel until the server cut-over,
`docs/ops/DEPLOY.md`). Same account everywhere: what is read or reviewed in one shows in the others.

| app | address | branch / folder | built from | notes |
|---|---|---|---|---|
| GoReview, web edition | https://rookie2401.github.io/go-v0/review/ | `Rookie2401/go-v0` `gh-pages`, `review/` | `packages/gopractice/dist-review` (`GOPRACTICE_SERVICE_URL=https://repo.golearn-global-languages.com GOPRACTICE_DICT=hi,la npx vite build -c packages/gopractice/vite.config.ts --mode review`), `sw.js` `BUILD_ID ebb80c3e7dad`, 187 MB (gh-pages `c29deb7f`, 2026-10-25; before: Hindi only, 58 MB, `0debfb0790d6`) | installable; the Hindi and Latin dictionaries bundled (Latin added 2026-10-25 so the hosted edition can be tested as far as the native one, short of the shell), other languages' meanings come from the service |
| GoLearn setup app | https://rookie2401.github.io/go-v0/app/ | same branch, `app/` | `packages/golearn-extension/dist-web` (`vite build -c packages/golearn-extension/app/vite.config.ts --mode web`), then `config.json`'s `serviceUrl` set to the public address by hand (that build has no environment override) | the address the account emails should open: set `APP_PUBLIC_URL=https://rookie2401.github.io/go-v0/app/` on the service |
| Biblia | https://rookie2401.github.io/biblia/ | `Rookie2401/biblia` `gh-pages` (root) | `packages/biblia/dist-standalone`, see `BIBLIA-STANDALONE.md` | published 2026-10-23 |

The root of the `go-v0` Pages site (the earlier Go PWA, `dict/` with the hosted dictionaries, `library/`) was left exactly as it was;
`review/` and `app/` were added beside it (commit `d8beb37b` on `gh-pages`, 1,366 files).

## Publishing again

```powershell
cd C:\Users\CJWal\dev\go-v0
$env:GOPRACTICE_SERVICE_URL='https://repo.golearn-global-languages.com'; $env:GOPRACTICE_DICT='hi,la'
npx vite build -c packages/gopractice/vite.config.ts --mode review
npx vite build -c packages/golearn-extension/app/vite.config.ts --mode web
# worktree of gh-pages (never under OneDrive); .git in a worktree is a FILE: never let a mirror copy delete it
git worktree add -B gh-pages C:\Users\CJWal\dev\go-v0-pages origin/gh-pages      # or: cd there; git fetch origin; git reset --hard origin/gh-pages
cd C:\Users\CJWal\dev\go-v0-pages
robocopy C:\Users\CJWal\dev\go-v0\packages\gopractice\dist-review .\review /MIR
robocopy C:\Users\CJWal\dev\go-v0\packages\golearn-extension\dist-web .\app /MIR
# set the setup app's service address in the copy (the web build keeps the development address)
$c = Get-Content .\app\config.json -Raw | ConvertFrom-Json; $c.serviceUrl = 'https://repo.golearn-global-languages.com'; $c | ConvertTo-Json -Depth 5 | Set-Content .\app\config.json -Encoding utf8
git add -- review app; git commit -m "Deploy: GoReview web + GoLearn setup app"; git push origin gh-pages
```
Pages serves the new files within a minute or two. The service workers of GoReview and Biblia replace their caches by `BUILD_ID`.

## Sync confirmation (2026-10-23)

What the owner asked: that the GitHub build syncs with the greater GoLearn system. What was shown:

1. **The public pieces answer.** `https://rookie2401.github.io/go-v0/review/` serves the review edition (`goreview-edition` marker, manifest,
   `config.json` with the public service address, `sw.js` `BUILD_ID 0debfb0790d6`, `dict/hi`); `.../go-v0/app/` serves the setup app with the
   public address and `bibliaUrl`; an outside probe of `https://repo.golearn-global-languages.com/health` returned `HTTP/1.1 200 OK` from
   Cloudflare; the service answers any origin (`Access-Control-Allow-Origin: *`).
2. **The same build syncs end to end against the same database.** This PC's network blocks the public name (router URL filter), and a
   page on a public https origin may not call a loopback address without the browser's new "local network access" permission (Chromium 155
   shows a prompt; the desktop pane refuses outright). So the byte-identical build (`dist-review`, the folder that was copied to Pages) was
   served from `http://127.0.0.1:5203` and pointed, through its own "Service address" field, at a second instance of the service
   (`--port 8791`, the SAME `data/local-repository` SQLite the public endpoint serves). Signed in as the throwaway account from the Biblia
   walk: GoReview's home showed "1 card ready" and "My vocab: 1 word"; My vocab listed אֱלֹהִים ("God; gods", met as אֱלֹהִ֑ים, Seen, in the
   deck), the word looked up in Biblia the day before. Then, in a Biblia copy pointed at the same instance, הַשָּׁמַיִם was tapped (New → Seen
   at once); GoReview's home, reopened six seconds later, showed "2 cards ready" and "My vocab: 2 words". The two 404s in GoReview's console
   were `dict/he/*` (no Hebrew dictionary is bundled in the web edition; meanings come from the service).
3. **Not shown from here:** the Pages copy itself reaching the public service. It is the same files, the same service code and the same
   database; what differs is the network path, which the outside probe covers. A check from a phone on cellular (open the review address,
   sign in, see the two Hebrew words) closes that last gap and is the owner's to do.

## The service moved to Render (2026-10-24, evening)

Codex ("Team Luna") cut the Repository service over to Render: service `go-v0` (Oregon, 0.5 CPU / 512 MB, 1 GB persistent disk,
about 7.25 USD a month), `https://go-v0.onrender.com`, with the canonical name `repo.golearn-global-languages.com` now a DNS-only
CNAME to it (an outside probe answers `200` with `x-render-origin-server: Render`). 7 accounts, 7 learners, 3,029 events, 10 enrolments
were migrated (schema 4, contract 3); the PC writer was stopped and its `GoRepositoryService` task disabled; the old tunnel is left in
place but no longer serves the name. The deployed code is the branch `fix/sync-reliability-2026-10-24` (`b91e6f30`), merged into
master as `12e15b66`. Full report: the owner's Codex outputs folder, `cloud-server-cutover-2026-10-24.md`.

**Three-way connection test against Render (this session, the test account from the Biblia walk):**

| system | how | result |
|---|---|---|
| GoReview, hosted (`/go-v0/review/`) | Service address set to `https://go-v0.onrender.com`, signed in | home "2 cards ready, My vocab 2 words"; My vocab lists אֱלֹהִים and שָׁמַיִם, the words from the Biblia walks, migrated |
| Biblia, the redesigned build pointed at `https://go-v0.onrender.com` (served locally) | signed in at #/account, Genesis 1 | both words painted Seen from the migrated data; a tap on הָאָרֶץ went New → Seen and the status bar said "Uploads complete" |
| GoReview again | reloaded | "3 cards ready, 3 words": the Biblia tap arrived through Render |
| GoLearn setup app, hosted (`/go-v0/app/`) | Service address `https://go-v0.onrender.com`, signed in | "Signed in … Progress is now synced to your account"; the Hebrew enrolment taken from the account, 22 checks passed |

Why the Render address and not the canonical one in these tests: this PC's network still blocks `golearn-global-languages.com`;
from anywhere else the canonical name works, and the apps' configs keep it. `go-v0.onrender.com` is reachable from here.

Still to do on the owner's desktop: the installed GoLearn extension names `http://127.0.0.1:8790` (the stopped PC service); on its
Sign-in screen expand "Service address", enter `https://go-v0.onrender.com` (this network) or leave the canonical name (any other),
"Use this address", sign in. Known cosmetic issue from the merged branch: Biblia's sync-status bar offers "Sign in" even while signed in.

## Loose ends

- `packages/repository-service/src/http.ts` now sends `Access-Control-Allow-Private-Network: true` (`dcd6eceb`) so a hosted page can be pointed
  at a local service for testing. The service process on 8790 is still the one the scheduled task started before that commit: it could not be
  ended from an unelevated shell ("Access is denied"; stopping the task leaves the node child alive). An elevated `Stop-Process` on the
  listener of port 8790 followed by `Start-ScheduledTask GoRepositoryService` brings the new code up; nothing public depends on it.
- `APP_PUBLIC_URL` is not set on the task yet; until it is, verification and reset emails carry the code alone (and no mail sender is configured).
- The GoReview web edition bundles Hindi only; Latin (130 MB) and the others are not on Pages for it.

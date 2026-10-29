# GoReview TestFlight build 11 (2026-10-24, late evening PDT)

Status: Expo cloud build FINISHED (23:07 PDT, 129 s of build time) and the App Store Connect upload SUCCEEDED on the first attempt.
Apple's processing email and the TestFlight page decide the rest: https://appstoreconnect.apple.com/apps/6822923834/testflight/ios

| | |
|---|---|
| EAS build id | `ab040e46-2800-4db5-b954-7319b9cfc39c` (FINISHED 23:07 PDT) |
| EAS submission | `8ba3ec53-a3cb-4cff-9dfb-906573f1a974` ("Submitted your app to Apple App Store Connect!") |
| staged version | 1.0.0 (11), bundle `com.cjwalker.goreview` |
| built from | master at `8ee6d594` (`packages/goreview-ios` is still untracked in git; its staging script is the build-10 version) |
| Repository address in the bundle | `https://repo.golearn-global-languages.com`, which now resolves to the Render-hosted service |
| web assets staged | 236 MB: GoReview, the Hindi and Latin dictionaries (`GOREVIEW_DICT=hi,la`), and Biblia with its texts, indexes, sharded tables and the redesign's fonts |

## Why build 11 exists

Build 10 was staged from `a7cb1a37`, before the evening's Biblia work. GoReview's own code has not changed since, but the Biblia carried
inside GoReview (opened from the home screen, recorder mode `app`) was the old one. Build 11 brings that copy level with the standalone
Biblia app (build 3):

- the redesign (`46087eb0`): the old Biblia's masthead, nested library tree and reader chrome, the old fonts (EB Garamond, Frank Ruhl
  Libre, bundled under `biblia/fonts/`), Settings and Sign-in in GoReview's card design
- the upload recovery and the sync-status bar from Codex's cut-over branch (`12e15b66`), the bar sitting above the sticky top bars
  (`7bdda2b3`)
- `main.ts` (`1d91f54d`): inside GoReview the native shell still uses GoReview's session (no standalone marker in this edition), so the
  back link to `#/review` and the `app` recorder are as before

Nothing else differs from build 10: same dictionaries, same service address, same staging rule (the `data`/`docs` filter applies only
outside the web content, so `biblia/data/canon.json` and the books are in the stage; checked before the build).

## What was verified, and what was not

- Verified before the build: `app.json` buildNumber `11`; `public/config.json` with the public address and `bibliaUrl: ./biblia/index.html`;
  `biblia/data/canon.json`, `biblia/fonts/`, `biblia/lexicon/`; the redesign's font faces in Biblia's stylesheet; `dict/hi` and `dict/la`;
  the pre-stage health check answered by `https://go-v0.onrender.com` (the Render address, since this PC's network filters the canonical
  name).
- Not verified: the app on a device. The owner's phone is the check that Biblia inside GoReview now shows the redesign and signs in
  through GoReview's session as before.

## Commands (PowerShell, from packages/goreview-ios; the same as build 10 with the number raised and the health check pointed at Render)

```powershell
$env:REPOSITORY_SERVICE_URL='https://repo.golearn-global-languages.com'
$env:REPOSITORY_HEALTH_CHECK_URL='https://go-v0.onrender.com'
$env:GOREVIEW_DICT='hi,la'
$env:GOREVIEW_BUNDLE_ID='com.cjwalker.goreview'
$env:GOREVIEW_BUILD_NUMBER='11'
$env:GOREVIEW_MARKETING_VERSION='1.0.0'
npm run release:stage
Test-Path .eas-project\ios\App\App\public\biblia\data\canon.json   # True
cd .eas-project
$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT=(Get-Location).Path
npx eas build --platform ios --profile testflight --non-interactive --no-wait          # ab040e46…
npx eas build:view ab040e46-2800-4db5-b954-7319b9cfc39c --json
npx eas submit --platform ios --profile testflight --id ab040e46-2800-4db5-b954-7319b9cfc39c --non-interactive
```

Housekeeping: the next GoReview build is number 12 or higher.

## Result

Build FINISHED at 23:07 PDT (queue 6 s, build 129 s); `eas submit` scheduled submission `8ba3ec53…` and reported "Submitted your app
to Apple App Store Connect!" at 23:10 PDT. Apple's processing (5 to 10 minutes) follows; the build then appears in TestFlight as 1.0.0 (11)
for the internal group. The owner's phone is the check that Biblia inside GoReview now shows the redesign.

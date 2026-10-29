# GoReview TestFlight build 8 (2026-10-22)

The first build with **Biblia inside the app**: the Hebrew Bible and the Greek New Testament, read with GoLearn, as a page of
GoReview at `web/biblia/`. The home shows a fifth entry, *Biblia*; Biblia records lookups and ratings into the signed-in account
through the app's Repository address; *← GoReview* at its top returns to the review home. Expo cloud build FINISHED; the App
Store Connect upload succeeded on the second submission (below). TestFlight page:
https://appstoreconnect.apple.com/apps/6822923834/testflight/ios

| | |
|---|---|
| EAS build id | `bf1316eb-d222-4b50-b37d-07741ebaf2a6` (FINISHED 2026-10-23 00:43 UTC, 2.5 min after start) |
| EAS submissions | `36ad7d87-13af-4692-8191-b251c1b2cf98` failed ("Unknown error", see below); `18c3d4d3-b08e-44f0-aa50-b1074d99dacf` uploaded |
| staged version | 1.0.0 (8), bundle `com.cjwalker.goreview` |
| Repository address in the bundle | `https://repo.golearn-global-languages.com` (the named Cloudflare tunnel, now the Windows service `cloudflared`) |
| web assets staged | 216 MB: GoReview + Hindi and Latin dictionaries (`GOREVIEW_DICT=hi,la`) + **Biblia 49 MB** (texts, the Biblical Hebrew and Koine indexes whole, the Ancient Greek, Modern Greek and Modern Hebrew shards) |
| IPA | 67,446,273 bytes (the dictionaries and shards compress well) |
| what is in it | everything committed through the Hebrew/Greek shard work of 2026-10-22 plus this build's Biblia-in-app changes (committed with this file) |

## What changed for this build

- `packages/goreview/app/config.ts`: `config.json` may carry `bibliaUrl` (a relative page `./…` or https); `ports.ts` `links.biblia`;
  `main.ts` passes it (the extension's GoPractice page links `../biblia/index.html` on its own); `screens/review.ts` renders the
  fifth home entry `data-entry="biblia"` when the link exists. Tests: `test/goreview-app/home.test.ts`, `shell.test.ts`.
- `packages/biblia/main.ts`: on a native Capacitor platform the page reads `../config.json`, takes the app's session from Keychain
  (`createMobileRuntime(window).getSession(serviceUrl)`) and records through `createRepositoryApi` with that token (recorder mode
  `'app'`, device `iphone:<platform>`); without a session it is a reader only and says "Sign in to GoReview…". `src/app.ts`: the
  `backUrl` dependency and the settings notice for mode `'app'`. `vite.config.ts`: `BIBLIA_OUT=<folder>` redirects the build.
- `packages/goreview-ios/scripts/prepare-web.mjs` (the package is still **untracked in git**, as build 6 noted: commit it with the
  owner's say-so): after the GoReview build it runs `vite build -c packages/biblia/vite.config.ts` with `BIBLIA_OUT=<web>/biblia`
  and writes `config.bibliaUrl = './biblia/index.html'` into the staged `config.json`.

## The first submission failed, and why (as far as is known)

`36ad7d87…`: "Something went wrong when submitting your app to Apple App Store Connect. Unknown error. See logs for more information."
The same command run again two minutes later (`18c3d4d3…`) uploaded the binary without any change in between, so the first failure
was transient on Apple's or Expo's side. The submission page on expo.dev needs a login this session cannot perform; the owner can read
the first submission's log there if the reason matters.

## What was verified, and what was not

- Verified: staged `app.json` version 1.0.0 build 8; staged `config.json` carries the public hostname and `bibliaUrl`; `web/biblia`
  present (49 MB) with `lexicon/{he,el}` and the three shard sets; the public health URL answered 200 from an outside probe before the
  build; the cloud build FINISHED with no failing step; the second submission reported "successfully uploaded".
- Verified on this PC before staging: the rebuilt Biblia reads Genesis 1 as Biblical Hebrew and the Variants tab shows the Modern Hebrew
  row attested (אלוהים) from the Modern shards; the GoReview home test renders the Biblia entry; 696 GoPractice/Biblia/GoReview tests pass.
- NOT verified from the binary: `CFBundleVersion` (Expo's metadata again shows "1.0.0 / 2", as for builds 5–7, because
  `eas/resolve_build_config` reads the project before the version step); check the number in TestFlight. NOT verified on a phone: the
  in-app session hand-off to Biblia (`getSession`), recording into the account, and the review showing the rated word; that is the owner's
  TestFlight test (`docs/LOCAL-TEST-RUN.md`, item 7). The build logs Expo serves are compressed in a format this session did not decode.

## Commands used

```powershell
cd packages\goreview-ios
$env:REPOSITORY_SERVICE_URL='https://repo.golearn-global-languages.com'
$env:REPOSITORY_HEALTH_CHECK_URL='http://127.0.0.1:8790'   # local staging check only (router blocks the domain here)
$env:GOREVIEW_DICT='hi,la'
$env:GOREVIEW_BUNDLE_ID='com.cjwalker.goreview'
$env:GOREVIEW_BUILD_NUMBER='8'
$env:GOREVIEW_MARKETING_VERSION='1.0.0'
npm run release:stage
cd .eas-project
$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT=(Get-Location).Path
npx eas build --platform ios --profile testflight --non-interactive --no-wait --json   # bf1316eb… FINISHED after 2.5 min
npx eas submit --platform ios --profile testflight --id bf1316eb-d222-4b50-b37d-07741ebaf2a6 --non-interactive   # twice; the second uploaded
```

## Housekeeping

- Next build: number 9 or higher.
- The Repository service runs as the Scheduled Task `GoRepositoryService` and the tunnel as the Windows service `cloudflared` (both
  installed 2026-10-21/22); the laptop must still be on and awake for the phone to sync.
- Build 8 supersedes build 7 for everyone; it adds Biblia and changes nothing else in GoReview.

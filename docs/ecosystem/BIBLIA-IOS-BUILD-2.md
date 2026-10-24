# Biblia (its own iPhone app) — TestFlight build 2 (2026-10-24)

Status: Expo cloud build FINISHED and the App Store Connect upload SUCCEEDED. App Store Connect app "Biblia: Original Languages"
(Apple ID `6826655180`, bundle `com.cjwalker.biblia`, display name on the device "Biblia"). Apple's processing email and the
TestFlight page decide the rest: https://appstoreconnect.apple.com/apps/6826655180/testflight/ios

| | |
|---|---|
| shell | `packages/biblia-ios` (`36a09ffe`, `c8bad191`, `84a03202`, `a5c845a6`) |
| Expo project | `@rookie56r/biblia-ios`, id `04e595f4-05bc-44f5-85a5-fa9cb76e9202` (`BIBLIA_EAS_PROJECT_ID`) |
| EAS build id | `e107d0ac-ceaf-4430-b1eb-9f037c597cd5` (FINISHED 12:46 PDT) |
| EAS submission | `9b0b2f46-d184-49eb-b91b-f1cc9d2cdfda` |
| staged version | 1.0.0 (2) |
| web content | Biblia's standalone edition built from the tree at `1d91f54d`: `<meta name="biblia-edition" content="standalone">`, `config.json` → `https://repo.golearn-global-languages.com`, the texts (`data/`, 39 Hebrew + 27 Greek books), the Biblical and Koine indexes and the sharded tables; 49 MB |
| what the app does | reads the Tanakh and the Greek New Testament through GoLearn's analysers and card; signs in with the GoLearn account on its own (#/account); records lookups and marks with an offline queue; paints the knowledge levels on the page; nothing of GoReview inside |

## How builds 1 and 2 came about

- Build 1 (`80573563…`) was made by the owner in an interactive `eas build` from `packages\biblia-ios\.eas-project`, which is the only way
  Expo creates the provisioning profile for a new bundle id (non-interactive runs stop with "Distribution Certificate is not validated for
  non-interactive builds"). Apple already holds a build 1 for version 1.0.0 (the submission of build 1 from here was refused as a duplicate),
  so the owner's session had uploaded it as well.
- Build 2 is the first build made entirely from here, with the Apple ID in `eas.json` (the first number the owner gave was not among the
  apps Expo's key can see; Expo's own listing named `6826655180`). Two false starts were cancelled before reaching Apple: a duplicate build 1
  started while the owner's build existed, and a build started from a stale stage after `.eas-project` could not be reset because a terminal
  was open inside it (the staging scripts now empty the folder instead of removing it).

## What was verified, and what was not

- Verified: the stage before upload (build number 2 in `app.json`, the standalone marker, `data/canon.json`, `lexicon/he/biblical-index.json`,
  the https `config.json`, the Apple ID in `eas.json`, the icons; `validate-staged-release.mjs` against the local copy of the service), the
  Expo build FINISHED, and `eas submit` "Submitted your app to Apple App Store Connect".
- Not verified: the app on a device (the owner's phone is the check: open Biblia from TestFlight, Genesis 1 should render, a tap should
  show the card with "Meaning · Open Scriptures Hebrew Bible morphology", `#/account` should sign in with the GoLearn account and the words
  looked up should then appear in GoReview); the IPA's `CFBundleVersion` (Expo's metadata shows "1"; the version step stamps it, as for
  every GoReview build); the service worker registration inside WKWebView (expected to be ignored).

## Commands (PowerShell, from packages/biblia-ios)

```powershell
$env:REPOSITORY_SERVICE_URL='https://repo.golearn-global-languages.com'
$env:REPOSITORY_HEALTH_CHECK_URL='http://127.0.0.1:8790'   # this PC's router blocks the domain; the local service is the same code
$env:BIBLIA_BUNDLE_ID='com.cjwalker.biblia'
$env:BIBLIA_BUILD_NUMBER='2'                               # next: 3 or higher
$env:BIBLIA_MARKETING_VERSION='1.0.0'
$env:BIBLIA_EAS_PROJECT_ID='04e595f4-05bc-44f5-85a5-fa9cb76e9202'
npm run release:stage
cd .eas-project
node scripts\validate-staged-release.mjs
$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT=(Get-Location).Path
npx eas build --platform ios --profile testflight --non-interactive --no-wait
npx eas build:view <buildId> --json                                   # polled until FINISHED (about 8 min)
npx eas submit --platform ios --profile testflight --id <buildId> --non-interactive
```

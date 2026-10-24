# GoReview TestFlight build 10 (2026-10-24)

Status: Expo cloud build FINISHED and the App Store Connect upload SUCCEEDED on the first attempt. Apple's processing email and the
TestFlight page decide the rest: https://appstoreconnect.apple.com/apps/6822923834/testflight/ios

| | |
|---|---|
| EAS build id | `a3046682-9508-442c-add8-6df8ab7a3597` (FINISHED 09:55 PDT) |
| EAS submission | `14644159-2c6a-4437-87e4-83532b3cadc5` |
| staged version | 1.0.0 (10), bundle `com.cjwalker.goreview` |
| built from | the working tree at `ee81e6cd` plus the staging-script fix below (`packages/goreview-ios` is still untracked in git) |
| Repository address in the bundle | `https://repo.golearn-global-languages.com` |
| web assets staged | 235 MB: GoReview, the Hindi and Latin dictionaries (`GOPRACTICE_DICT=hi,la`), and Biblia WITH its texts this time |

## Why build 10 exists: "Biblia could not start" in build 9

The owner opened Biblia from GoReview's home in build 9 on the iPhone and got "Biblia could not start: …". The cause was in
`packages/goreview-ios/scripts/build-eas-project.mjs`: when it copies the project into the Expo stage it refused every path with a
segment named `data` or `docs` (a rule meant to keep the repository's `data/` folder and private notes out of the upload). Inside the
bundled web app that rule also removed `web/biblia/data/**`, Biblia's `canon.json` and all its books, so the app opened a Biblia that had
nothing to read and failed at its first fetch. The staged folder of build 9 confirmed it: `biblia/` held `assets`, `index.html` and
`lexicon`, no `data`. Build 8 was staged with the same rule, so its Biblia had the same gap (not reported at the time).

Fix: the `data` / `docs` rule now applies only OUTSIDE the app's own web content (`web/` and `ios/App/App/public/`); tooling folders and
secret or database file patterns are still refused everywhere. Build 10's stage was checked before upload: `biblia/data/canon.json`, all
39 Hebrew books and the Greek books present, `config.json` with the public address and `bibliaUrl: ./biblia/index.html`.

## What was verified, and what was not

- Verified: the staged version and config, both dictionaries, the Biblia texts and indexes in the stage, `eas build:view` FINISHED,
  `eas submit` "Submitted your app to Apple App Store Connect".
- Not verified from the binary: `CFBundleVersion` (Expo's metadata shows "1.0.0 / 2" as for every build since 5; the version step of
  `.eas/build/ios-testflight.yml` stamps it). Not exercised: the app on a device; the owner's phone is the check that Biblia now opens.

## Commands (PowerShell, from packages/goreview-ios; the same as build 9 with the number raised)

```powershell
$env:REPOSITORY_SERVICE_URL='https://repo.golearn-global-languages.com'
$env:REPOSITORY_HEALTH_CHECK_URL='http://127.0.0.1:8790'   # this PC's router blocks the domain; the local service is the same code
$env:GOPRACTICE_DICT='hi,la'
$env:GOREVIEW_BUNDLE_ID='com.cjwalker.goreview'
$env:GOREVIEW_BUILD_NUMBER='10'
$env:GOREVIEW_MARKETING_VERSION='1.0.0'
npm run release:stage
Test-Path .eas-project\ios\App\App\public\biblia\data\canon.json   # must be True before any upload
cd .eas-project
$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT=(Get-Location).Path
npx eas build --platform ios --profile testflight --non-interactive --no-wait          # a3046682…
npx eas build:view a3046682-9508-442c-add8-6df8ab7a3597 --json                          # FINISHED after about 6 min
npx eas submit --platform ios --profile testflight --id a3046682-9508-442c-add8-6df8ab7a3597 --non-interactive
```

Housekeeping: the next GoReview build is number 11 or higher. A Biblia app of its own (`packages/biblia-ios`) is being prepared the
same day; it has its own bundle id and build numbers.

# GoReview TestFlight build 9 (2026-10-23)

Status: Expo cloud build FINISHED and the App Store Connect upload SUCCEEDED on the first attempt. Apple's processing email and the
TestFlight page decide the rest: https://appstoreconnect.apple.com/apps/6822923834/testflight/ios

| | |
|---|---|
| EAS build id | `61d412f2-84f1-4193-80df-932506f37637` (started 15:50 PDT, FINISHED 15:58) |
| EAS submission | `f1e1b38f-8783-47db-b94a-52d91f1bf4e7` |
| staged version | 1.0.0 (9), bundle `com.cjwalker.goreview` |
| built from | `a7cb1a37` (the working tree was clean in every path the build packages) |
| Repository address in the bundle | `https://repo.golearn-global-languages.com` |
| web assets staged | 216 MB: GoReview, the Hindi and Latin dictionaries (`GOREVIEW_DICT=hi,la`, as build 8), and Biblia inside the app (`bibliaUrl: ./biblia/index.html`, recorder mode `'app'`) |

## What is new since build 8

- The Biblia standalone work (`5cb49975`): recorder mode `'account'`, the sign-in screen, the offline queue and the knowledge levels painted on
  the page. Inside the iPhone app Biblia still runs in mode `'app'` over the app's own session, as build 8 did; the new levels code paints there
  too, since it only needs a `RepositoryApi` with a learner (not exercised on a device by this session).
- GoLearn's reader screen points at the hosted Biblia (`d1ccaa08`); that concerns the extension and setup app, not this bundle.
- The Hebrew / Greek session's commits after build 8 (audit fixes, docs), and the Latin session's commits. See `git log bf1316eb..a7cb1a37`
  for the full list; nothing in `packages/goreview/app`, `packages/goreview` or `packages/language-packs` changed between the two builds
  except what those commits record.

## What was verified, and what was not

- Verified: `npm run release:stage` staged version 1.0.0 build 9, `config.json` with the public address and `bibliaUrl`, `dict/hi` and `dict/la`,
  `biblia/index.html`; `eas build:view` FINISHED; `eas submit` reported "Submitted your app to Apple App Store Connect".
- Not verified from the binary: the IPA's `CFBundleVersion` (Expo's metadata shows "1.0.0 / 2" as it did for builds 5 to 8, where the
  binaries carried the right numbers; the version step of `.eas/build/ios-testflight.yml` stamps them). Not exercised: the app on a device.

## Commands (PowerShell, from packages/goreview-ios; the same as build 8 with the number raised)

```powershell
$env:REPOSITORY_SERVICE_URL='https://repo.golearn-global-languages.com'
$env:REPOSITORY_HEALTH_CHECK_URL='http://127.0.0.1:8790'   # this PC's router blocks the domain; the local service is the same code
$env:GOREVIEW_DICT='hi,la'
$env:GOREVIEW_BUNDLE_ID='com.cjwalker.goreview'
$env:GOREVIEW_BUILD_NUMBER='9'
$env:GOREVIEW_MARKETING_VERSION='1.0.0'
npm run release:stage
cd .eas-project
$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT=(Get-Location).Path
npx eas build --platform ios --profile testflight --non-interactive --no-wait          # 61d412f2…
npx eas build:view 61d412f2-84f1-4193-80df-932506f37637 --json                          # polled each minute: FINISHED after 8 min
npx eas submit --platform ios --profile testflight --id 61d412f2-84f1-4193-80df-932506f37637 --non-interactive
```

Housekeeping: the next build is number 10 or higher.

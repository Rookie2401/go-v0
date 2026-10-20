# GoReview TestFlight build 6 (2026-10-19)

Status: IN TESTFLIGHT (the owner saw it listed on 2026-10-19). Expo cloud build FINISHED and the App Store Connect upload SUCCEEDED (the first upload since build 4; builds 5's four
submissions had errored with no detail, see `GOREVIEW-BUILD-5.md`). Apple's processing email and the TestFlight page decide the
rest: https://appstoreconnect.apple.com/apps/6822923834/testflight/ios

| | |
|---|---|
| EAS build id | `604d6070-e52c-49ac-af07-d5528f52cae4` |
| EAS submission | `37c09f19-0250-49fc-acd0-773fbe10ea46` |
| staged version | 1.0.0 (6), bundle `com.cjwalker.goreview` |
| Repository address in the bundle | `https://repo.golearn-global-languages.com` (the named Cloudflare tunnel, `infra/cloudflare/README.md`) |
| dictionaries bundled | Hindi only (`GOPRACTICE_DICT=hi`, full-2 plain layout; 56 MB of web assets). Latin left out on the Latin session's advice (its dictionary alone is 130 MB; Latin review cards still work through the service's lookups) |
| what is in it | everything committed through `cc6fbbd8` (accounts hardening client flows, scheduled deletion, data download, legal drafts, live sync loop) plus the Hebrew/Greek and Latin sessions' uncommitted but frozen edits under `packages/gopractice`, `packages/goreview`, `packages/language-packs` (both sessions confirmed those paths stable before the build) |

## What was verified, and what was not

- Verified: the staged `app.json` says version 1.0.0, build 6; the staged `public/config.json` carries the public hostname;
  `test/gopractice`, `test/gopractice-e2e`, `test/goreview` and `test/language-packs` on the built tree: 910 of 914 passed. The four
  failures are the sibling sessions' in-progress pins (he/el capabilities rows; two Latin adapter validation cases), none in code
  the phone build runs.
- NOT verified from the binary: the IPA's `CFBundleVersion`. Expo's metadata shows "1.0 / 2" exactly as it did for build 5, because
  `eas/resolve_build_config` runs before the `set-build-version.mjs` step of `.eas/build/ios-testflight.yml`; for build 5 the IPA was
  opened and read 1.0.0 (5). The IPA was not downloaded this time (a download needs the owner's say-so). Check the number in
  TestFlight; if it shows 1.0 (2), the version step did not run and the build must be redone.

## Changes to the pipeline

- `packages/goreview-ios/scripts/prepare-web.mjs`: `REPOSITORY_HEALTH_CHECK_URL` sends the pre-build health check to another address
  of the SAME service (here `http://127.0.0.1:8790`) when the public name is not reachable from the build PC. The bundle still gets
  `REPOSITORY_SERVICE_URL`; the redirection is printed. Needed because this PC's router answers port 80 for the new domain with a
  `urlblock.php` page and resets HTTPS, while an outside probe of `https://repo.golearn-global-languages.com/health` returned 200.
  (`packages/goreview-ios` is still untracked in git: Codex's shell. Commit it with the owner's say-so.)

## Commands used

```powershell
cd packages/goreview-ios
$env:REPOSITORY_SERVICE_URL='https://repo.golearn-global-languages.com'
$env:REPOSITORY_HEALTH_CHECK_URL='http://127.0.0.1:8790'   # only while the router blocks the domain
$env:GOPRACTICE_DICT='hi'
$env:GOREVIEW_BUNDLE_ID='com.cjwalker.goreview'
$env:GOREVIEW_BUILD_NUMBER='6'
$env:GOREVIEW_MARKETING_VERSION='1.0.0'
npm run release:stage
cd .eas-project
$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT=(Get-Location).Path
npx eas build --platform ios --profile testflight --non-interactive --no-wait     # 604d6070…
npx eas build:view 604d6070-e52c-49ac-af07-d5528f52cae4 --json                     # polled each minute: FINISHED after ~4 min
npx eas submit --platform ios --profile testflight --id 604d6070-e52c-49ac-af07-d5528f52cae4 --non-interactive
```

## Housekeeping

- Next build: number 7 or higher.
- The Repository service behind the tunnel is still the PC process (restarted by the Latin session on 2026-10-17 21:41, migrations 4,
  no `TRUST_PROXY=cloudflare`, so every phone through the tunnel shares one rate-limit bucket until it is restarted with that
  variable). The tunnel is still a foreground `cloudflared` process; the Windows-service install needs an administrator prompt.
- Build 5 (`3f298f81-a1f0-4f31-b556-8890e8cce80e`) was never uploaded; it is superseded by build 6.

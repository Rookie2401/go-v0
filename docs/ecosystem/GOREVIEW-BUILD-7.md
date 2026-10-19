# GoReview TestFlight build 7 (2026-10-19)

The first build that bundles the **Latin dictionary** beside the Hindi one. Expo cloud build FINISHED; the App Store Connect
submission is recorded below. TestFlight page: https://appstoreconnect.apple.com/apps/6822923834/testflight/ios

| | |
|---|---|
| EAS build id | `ad8ae42e-0c9d-4145-89cc-b38c9304533c` (a first attempt, `a8316a14-ba92-464d-a8bd-9033785e4bea`, errored: see below) |
| EAS submission | see "Submission" below |
| staged version | 1.0.0 (7), bundle `com.cjwalker.goreview` |
| Repository address in the bundle | `https://repo.golearn-global-languages.com` (the named Cloudflare tunnel) |
| dictionaries bundled | Hindi (52 MB) **and Latin (130 MB)**, `GOPRACTICE_DICT=hi,la`; 178 MB of web assets in all |
| what is in it | everything committed through `c436e6bb` (Latin `8cc22f55`/`b5a9f191`, Hebrew/Greek `c436e6bb`, build-6 docs `029cd3f1`) plus the working tree's uncommitted GoListen/playback refactor under `packages/golisten` and the extension (the phone build packages `packages/gopractice` + `packages/goreview` + `packages/language-packs` + `packages/repository-*` + `src/dict` + `src/core`; the Latin voice rows ride along with that refactor) |

## The first attempt errored, and why

`a8316a14…` failed after 47 s in the custom-workflow step "Validate staged release inputs": its 10-second fetch of
`https://repo.golearn-global-languages.com/health` from the Expo macOS worker threw `TimeoutError`. The local origin answered in
6 ms and `cloudflared tunnel info` showed the connector registered, but an outside probe got a connection reset. The tunnel
process (a foreground `cloudflared` from 2026-10-17, which had re-registered its connections at 15:27 that day) was restarted:

```powershell
# stop the old process, then
& "$env:USERPROFILE\Documents\Codex\2026-10-14\ple\work\tools\cloudflared.exe" tunnel --config "$env:USERPROFILE\.cloudflared\config.yml" run goreview-repository
```

Right after the restart a third-party header probe (api.hackertarget.com, from Atlanta) returned `HTTP/1.1 200 OK` with
`Server: cloudflare` for the health URL, and the second build passed the same step. Lesson: a long-lived foreground
`cloudflared` can go stale while still looking registered; install it as the Windows service (needs an administrator prompt,
`infra/cloudflare/README.md`) so it restarts on its own. This PC itself cannot reach the public name (router URL filter), so
outside probes are the only check; `REPOSITORY_HEALTH_CHECK_URL=http://127.0.0.1:8790` redirects only the LOCAL staging
check, never the cloud step.

## What was verified, and what was not

- Verified: staged `app.json` version 1.0.0 build 7; staged `public/config.json` carries the public hostname; both
  dictionaries present in `ios/App/App/public/dict/{hi,la}`; the cloud log shows "Validated staged GoReview app
  com.cjwalker.goreview against healthy Repository v3", Fastlane archived, artifacts uploaded, no failing step.
- GoReview with Latin was exercised against the real service before the build (`docs/latin/GOREVIEW-CHECK.md`): Class
  Essentials deck, My vocab, current deck, sessions. With the dictionary bundled, glosses come from the shards offline as well.
- NOT verified from the binary: `CFBundleVersion` (Expo's metadata shows "1.0 / 2" as for builds 5 and 6, because
  `eas/resolve_build_config` runs before the version step). Check the number in TestFlight; if it shows 1.0 (2), redo the build.
- App size: the IPA is roughly 180 MB larger than build 6. TestFlight accepts it; the owner may prefer a Hindi-only or
  Latin-only edition later.

## Commands used

```powershell
cd packages\goreview-ios
$env:REPOSITORY_SERVICE_URL='https://repo.golearn-global-languages.com'
$env:REPOSITORY_HEALTH_CHECK_URL='http://127.0.0.1:8790'   # local staging check only (router blocks the domain here)
$env:GOPRACTICE_DICT='hi,la'
$env:GOREVIEW_BUNDLE_ID='com.cjwalker.goreview'
$env:GOREVIEW_BUILD_NUMBER='7'
$env:GOREVIEW_MARKETING_VERSION='1.0.0'
npm run release:stage
cd .eas-project
$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT=(Get-Location).Path
npx eas build --platform ios --profile testflight --non-interactive --no-wait --json   # ad8ae42e… FINISHED after 3 min
npx eas submit --platform ios --profile testflight --id ad8ae42e-0c9d-4145-89cc-b38c9304533c --non-interactive
```

## Submission

EAS submission `8be1f12d-9e3c-4eaa-ae8f-92c0ef41432a`: "Submitted your app to Apple App Store Connect! Your binary has been
successfully uploaded" (2026-10-19, about 13:05 PDT). Apple's processing email and the TestFlight page decide the rest.

## Housekeeping

- Next build: number 8 or higher.
- The tunnel is again a foreground `cloudflared` process started by the Latin session on 2026-10-19 (log
  `infra/cloudflare/tunnel-run.log`); the Windows-service install still needs the owner's administrator prompt.
- Build 7 supersedes build 6 for Latin learners; build 6 stays valid for Hindi-only testing.

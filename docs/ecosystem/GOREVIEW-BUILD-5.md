# GoReview 1.0.0 (5) - build record, 2026-10-16

Status: Expo cloud build FINISHED and the IPA is verified as 1.0.0 (5). The App Store Connect upload (Expo submit) ERRORED four times with no detail; build 5 is NOT yet in TestFlight. See "Open problem".

## What changed since build 4 (web app, all on main)
- Saved decks plus the Class Essentials deck, and deck size control.
- Phone layout work.
- Live updates through /sync/status and /sync/wait (the built JS contains both "Class Essentials" and "sync/wait").
- Sync optimisation.
- Six knowledge levels.
- Transliteration on the GoLearn card is extension-only (not part of this app).

## Service address baked in
`https://width-planet-gentleman-over.trycloudflare.com` - a temporary Cloudflare QUICK tunnel to the PC's Repository service (127.0.0.1:8790). Health at stage time: `{"ok":true,"service":"repository","contractVersion":3}`. The address dies when the tunnel or PC stops, and changes on restart. The app lets the user change the service address at sign-in, so replace it once the domain exists. Tunnel log: `infra/cloudflare/quick-tunnel.log` (cloudflared from the Codex tools folder, QUIC protocol).

## Ids
- Expo build: `3f298f81-a1f0-4f31-b556-8890e8cce80e` (FINISHED, profile testflight, 2026-10-16 ~11:33-11:36 PDT)
  https://expo.dev/accounts/rookie56r/projects/goreview-ios/builds/3f298f81-a1f0-4f31-b556-8890e8cce80e
- IPA verified by reading its Info.plist: CFBundleShortVersionString 1.0.0, CFBundleVersion 5, bundle id com.cjwalker.goreview.
- Expo's build metadata still shows "1.0 / 2": `eas/resolve_build_config` runs before the `set-build-version.mjs` step in `.eas/build/ios-testflight.yml`, so the metadata is stale. The real binary is correct.
- Expo submissions, all ERRORED with no log files and no error text from the CLI:
  - 95217ea6-865f-4793-97a3-27e3d6255861 (--id)
  - 3a1418af-b94a-49c9-ac52-999ab99ac701 (--id, retry)
  - 9dab02d2-f6cf-47fd-b50b-ff82308e3596 (--id, --verbose --verbose-fastlane)
  - 10220d51-a5b5-4b45-aa88-f5afe865a13d (--url of the IPA, bypassing build metadata)
  The URL submission failing identically rules out the stale metadata as the cause. Build 4 submitted fine on 2026-10-14 with the same ASC key and profile.

## Open problem
The failure is on the Apple upload side and is invisible from the CLI (the Expo web page needs a login). Likely causes to check, in order:
1. App Store Connect > Business/Agreements: a new or updated Apple Developer agreement awaiting acceptance (the most common reason uploads suddenly fail).
2. The EAS submit API key (Key ID VD2YPNB5NK) revoked or expired in App Store Connect > Users and Access > Integrations.
3. Read the actual message on the submission page while signed in to expo.dev (open any submission link above and read its logs).
After fixing, resubmit the existing build with no rebuild: `npx eas submit --platform ios --profile testflight --id 3f298f81-a1f0-4f31-b556-8890e8cce80e --non-interactive` from `packages/goreview-ios/.eas-project` (EAS_NO_VCS=1, EAS_PROJECT_ROOT=that folder). Then confirm the build in TestFlight and re-assign it to the Team (Expo) tester group if needed.

## Commands used (no secrets)
```powershell
cd packages/goreview-ios
npx eas whoami                      # rookie56r
# service on 127.0.0.1:8790 already running; tunnel:
Start-Process cloudflared.exe -ArgumentList 'tunnel','--url','http://127.0.0.1:8790','--protocol','quic','--no-autoupdate' `
  -RedirectStandardError infra\cloudflare\quick-tunnel.log -RedirectStandardOutput infra\cloudflare\quick-tunnel.log.out -WindowStyle Hidden
$env:REPOSITORY_SERVICE_URL='<trycloudflare url from the log>'
$env:GOREVIEW_BUNDLE_ID='com.cjwalker.goreview'
$env:GOREVIEW_BUILD_NUMBER='5'
$env:GOREVIEW_MARKETING_VERSION='1.0.0'
npm run release:stage
cd .eas-project
$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT=(Get-Location).Path
npx eas build --platform ios --profile testflight --non-interactive --no-wait
npx eas build:view <buildId> --json            # polled until FINISHED
npx eas submit --platform ios --profile testflight --id <buildId> --non-interactive
```

## Housekeeping
- Next build must use build number 6 or higher (5 is consumed on Expo, and will be consumed on Apple once it uploads).
- Optional hardening for the pipeline: run `node scripts/set-build-version.mjs` in the stage before `eas build` so Expo's build metadata matches the binary.

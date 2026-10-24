# Biblia iPhone shell

A Capacitor 8 iOS app whose only web content is Biblia's **standalone edition** (`packages/biblia`, built with `--mode standalone`, see `docs/ecosystem/BIBLIA-STANDALONE.md`): the Tanakh and the Greek New Testament, their texts under `data/`, the lexicon indexes under `lexicon/`. Nothing else is bundled (no GoReview, no dictionaries). The app signs in with the standalone edition's own account screen against the Go Repository service named in `config.json`; the edition marker `<meta name="biblia-edition" content="standalone">` is what makes `packages/biblia/main.ts` use that mode inside this shell.

It is modelled on `packages/goreview-ios` (same EAS custom iOS workflow, same staging, same version stamping) with these differences: its own identity, no native plugin or view controller (the stock Capacitor `CAPBridgeViewController`), an iPhone-only portrait target, no microphone/camera/location strings (Biblia uses none; only `ITSAppUsesNonExemptEncryption = false` and `PrivacyInfo.xcprivacy`), and no Expo project id until the owner creates one. The edition's service-worker registration is left as built; inside the web view it either does not register or is harmless. The release configuration sets no `server.url`.

## Environment variables

| variable | needed for | meaning |
|---|---|---|
| `REPOSITORY_SERVICE_URL` | release stage | public HTTPS origin of the Repository service, e.g. `https://repo.golearn-global-languages.com`. Loopback, private ranges, placeholder domains, credentials, query and fragment are refused. Written into the bundled `config.json` |
| `REPOSITORY_HEALTH_CHECK_URL` | optional | where THIS computer reaches the same service for the pre-build health check (the PC's network blocks the public domain: use `http://127.0.0.1:8790`). Only the check moves; the bundle keeps `REPOSITORY_SERVICE_URL`. Honoured by `prepare-web.mjs` and `validate-staged-release.mjs` |
| `BIBLIA_BUNDLE_ID` | release stage | the reverse-DNS App ID registered to the Apple Developer account; the owner will use `com.cjwalker.biblia`. Placeholders (`example`, `invalid`, `test`, `localhost` segments) are refused |
| `BIBLIA_BUILD_NUMBER` | release stage | positive integer, higher than the last uploaded build of this app |
| `BIBLIA_MARKETING_VERSION` | optional | `1.0` or `1.0.1` style; default `1.0.0` |
| `BIBLIA_EAS_PROJECT_ID` | optional | the UUID `npx eas init` printed, to re-create a deleted stage with the same Expo project. A stage that still exists keeps the id `eas init` wrote into its `app.json` |
| `BIBLIA_SERVICE_URL` | not set by hand | the release preparation sets it (to `REPOSITORY_SERVICE_URL`) for Biblia's own Vite build |

`APPLE_TEAM_ID` is needed only by `scripts/archive-testflight.sh` (the Mac/Xcode path). No Apple password, API key or certificate belongs in this package.

## Files

`capacitor.config.ts`, `app.json` (no `extra.eas.projectId`: GoReview's id is never reused), `eas.json` (profile `testflight`, image `macos-tahoe-26.5-xcode-26.6`, Node 24.11.1, `ascAppId` placeholder), `.eas/build/ios-testflight.yml` (custom workflow, project alias `Biblia.xcodeproj`, scheme `App`), `assets/icon.png` (1024x1024 opaque RGB, supplied from Biblia's SVG icon), `ios/` (Capacitor's generated project: display name Biblia, portrait iPhone, `PrivacyInfo.xcprivacy`, shared scheme `App`), `templates/eas-project/` (pinned Capacitor lock for the stage), `scripts/`:

- `prepare-web.mjs`: `--release` validates the URL and bundle id, checks `<health>/health` (`ok`, `service: "repository"`, `contractVersion: 3`), builds the standalone edition, stages it at `web/`, and checks the edition marker and the service address.
- `build-eas-project.mjs` (`npm run release:stage`): validates inputs and `assets/icon.png`, runs `release:sync`, installs the icon as the native App Store icon, and writes the isolated `.eas-project/`. `data/` and `docs/` segments are denied only OUTSIDE the web content (`web/` and `ios/App/App/public/`), because Biblia's texts live under `data/`.
- `prepare-eas-ios-project.mjs`, `set-build-version.mjs`, `validate-app-icon.mjs`, `validate-eas-config.mjs` (`--submit` also refuses the placeholder `ascAppId`), `validate-staged-release.mjs`, `archive-testflight.sh`.

`validate-staged-release.mjs` checks, in the stage: the icons, the bundle id and build number, `ios/App/App/public/index.html` carrying the standalone marker, `public/data/canon.json` and `public/lexicon/he/biblical-index.json` present, `public/config.json` holding an https service address, and the service's health.

Prerequisite for the texts: `packages/biblia/public/data` (`npm run biblia:import`) and the Hebrew index `public/lexicon/he/biblical-index.json` at the repository root (`npm run he:build-biblical`) must exist; the stage refuses to validate without them.

## One-time owner steps (account changes; nothing here does them)

1. Register the App ID `com.cjwalker.biblia` in the Apple Developer account and create the App Store Connect app record named **Biblia** with that bundle id. (Alternatively `eas build` can create the App ID and the distribution provisioning profile interactively the first time, with the owner's Apple login typed into EAS's own prompt; this package never handles it.)
2. Create the Expo project for the app, from the staged project (after the first `release:stage`): `cd .eas-project`, then `npx eas init` under the owner's Expo account (GoReview was created under `rookie56r`). It writes `extra.eas.projectId` into the stage's `app.json`; later stages keep it, or pass it as `BIBLIA_EAS_PROJECT_ID`.
3. Configure the App Store distribution credentials: `npx eas credentials --platform ios` (still in `.eas-project`).
4. For `eas submit` only: put the numeric Apple ID of the Biblia app record in `eas.json` (`submit.testflight.ios.ascAppId`, now `REPLACE_WITH_BIBLIA_APP_STORE_CONNECT_APP_ID`), then run `npm run validate:submit-config` (it refuses the placeholder). `eas build` does not read this value.

## TestFlight build (PowerShell, from `C:\Users\CJWal\dev\go-v0\packages\biblia-ios`, never inside OneDrive)

```powershell
npm install                       # once
$env:REPOSITORY_SERVICE_URL='https://repo.golearn-global-languages.com'
$env:REPOSITORY_HEALTH_CHECK_URL='http://127.0.0.1:8790'   # this PC's router blocks the domain; the local service is the same code
$env:BIBLIA_BUNDLE_ID='com.cjwalker.biblia'
$env:BIBLIA_BUILD_NUMBER='1'
$env:BIBLIA_MARKETING_VERSION='1.0.0'
npm run release:stage
cd .eas-project
npx eas init                      # first time only (step 2 above)
$env:EAS_NO_VCS='1'; $env:EAS_PROJECT_ROOT=(Get-Location).Path
npx eas build --platform ios --profile testflight --non-interactive --no-wait
npx eas build:view <build id> --json                       # poll until FINISHED
npx eas submit --platform ios --profile testflight --id <build id> --non-interactive   # needs step 4
```

The first `eas build` may need to be run without `--non-interactive` so EAS can create or select the signing credentials. The next build is `BIBLIA_BUILD_NUMBER` 2 or higher. EAS Build returns an IPA but does not submit it; `eas submit` (or Apple Transporter) uploads it, then finish processing and testers in App Store Connect.

Local development: `npm run prepare:web` builds the standalone edition into `web/` with the source `config.json` address (127.0.0.1:8790); `npm run sync:ios` adds `cap sync ios`; `npm run open:ios` needs a Mac with Xcode 26+.

## Privacy

`ios/App/App/PrivacyInfo.xcprivacy` reports linked email address, user ID and product interaction (lookups and marks recorded to the account) for app functionality, tracking off, the same declaration as GoReview's. Confirm against the real data flows when filling in App Store privacy details.

## Not verified here

Windows cannot compile, sign or run the iOS app: no Xcode build, no simulator run, no EAS build and no TestFlight upload were done. The Capacitor project is the output of `npx cap add ios` plus the edits above (display name, encryption flag, portrait iPhone-only, privacy manifest, shared scheme copied from GoReview's, native icon).

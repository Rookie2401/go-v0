# GoReview iPhone shell

This package wraps the existing `packages/goreview/app` review edition in a Capacitor 8 iOS app. The review site is compiled from local repository files and copied into the app bundle. The release configuration does not set `server.url` and the staged web bundle has no PWA service worker registration or manifest.

The Capacitor setup follows its [official existing-web-app setup](https://capacitorjs.com/docs/getting-started) and [custom iOS plugin registration guide](https://capacitorjs.com/docs/ios/custom-code). Apple requires Xcode for iOS builds; current Capacitor 8 iOS setup calls for Xcode 26 or newer. See Apple's [upload builds guide](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/) and [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/) for the final App Store Connect steps.

## Prepare the shell

Use Node.js 24.11.1 or later. From this directory:

```sh
npm ci
npm run prepare:web
npx cap sync ios
```

`prepare:web` runs the repository's existing GoReview Vite build and stages it at `web/`. It is useful for local inspection and does not create a release configuration. `sync:ios` combines preparation with Capacitor sync. On a Mac with Xcode installed, open the app with `npm run open:ios` or open `ios/App/App.xcodeproj`.

The generated Bundle ID `com.example.provisional.goreview` is deliberately provisional. The release stage requires the reverse-DNS App ID registered to the owner's Apple Developer account. Do not put signing certificates, passwords, App Store Connect API keys, or provisioning credentials in this package.

## EAS cloud TestFlight build preparation

This is a Capacitor app with an existing Xcode project, not an Expo/React Native rewrite. Its EAS custom iOS workflow keeps that project and builds it with Fastlane `gym`; it deliberately does not run Expo Prebuild. The profile pins the documented EAS image `macos-tahoe-26.5-xcode-26.6` and overrides its default Node version with Node 24.11.1.

EAS monorepo uploads include the whole repository, which would include unrelated private workspace data. `release:stage` therefore builds the web app locally, checks the live Repository v3 health endpoint, syncs Capacitor, and creates an ignored standalone project at `.eas-project/`. That stage contains only the GoReview web bundle, Capacitor iOS project, app icon, pinned Capacitor dependencies, EAS profile, and custom workflow. The stage copy rejects symlinks and filters or rejects local databases, `.env` files, credentials, signing files, private/docs folders, generated build directories, and other local-only files. The ignored release bundle includes the public Repository service URL; no credential is embedded.

On Windows PowerShell, set the public backend URL, registered App ID, and unused build number in the current shell, then prepare the stage:

```powershell
$env:REPOSITORY_SERVICE_URL = 'https://go-v0.onrender.com'   # the default address of every system (2026-10-27)
$env:GOREVIEW_BUNDLE_ID = 'your.registered.bundle.id'
$env:GOREVIEW_BUILD_NUMBER = '1'
$env:GOREVIEW_MARKETING_VERSION = '1.0.0'
npm run release:stage
```

Preparation fails unless the URL is public HTTPS and `<URL>/health` reports `ok: true`, `service: "repository"`, and `contractVersion: 3`. No backend host is provisioned by this package.

The generated stage has no EAS project ID until the owner links or creates one. After confirming the Bundle ID and endpoint, go to `.eas-project/` and run `npx eas init --account rookie56r` once, then configure the App Store distribution credentials with `npx eas credentials --platform ios`. These are account changes and are intentionally left to the owner. The cloud build command is:

```powershell
$stage = (Resolve-Path .).Path
$env:EAS_NO_VCS = '1'
$env:EAS_PROJECT_ROOT = $stage
npx eas build --platform ios --profile testflight
```

Run it with the working directory set to `.eas-project/`. `EAS_NO_VCS` and `EAS_PROJECT_ROOT` make the uploaded project root the standalone stage rather than the containing monorepo. EAS CLI 24.13.0 is pinned locally. No EAS project was created, no remote build was started, and no Apple credential was changed during this setup. EAS currently offers up to 15 iOS builds per billing cycle on its free plan; verify current account usage before starting a build.

EAS Build returns an App Store Connect IPA but does not submit it. After the App Store Connect app record exists and its App Store Connect API key is configured in EAS, submit the completed build with `npx eas submit --platform ios --latest` or use App Store Connect Transporter. Finish build processing and enable TestFlight testers in App Store Connect.

## Release preflight and archive

Set these values in the shell or a local ignored environment file, never in a committed file:

```sh
export REPOSITORY_SERVICE_URL='https://go-v0.onrender.com'   # the default address of every system (2026-10-27)
export GOREVIEW_BUNDLE_ID='your.registered.bundle.id'
export APPLE_TEAM_ID='ABCDEFGHIJ'
export GOREVIEW_BUILD_NUMBER='1'
export GOREVIEW_MARKETING_VERSION='1.0'
```

Then, on a Mac with Xcode 26 or later and the Apple Developer account available in Xcode:

```sh
npm ci
bash scripts/archive-testflight.sh
```

The script requires a non-placeholder Bundle ID, a real 10-character Team ID, a monotonically increasing build number, and a public HTTPS service URL. Before copying assets it requests `<service URL>/health` and requires JSON with `ok: true`, `service: "repository"`, and `contractVersion: 3`. It then prepares the release bundle, syncs Capacitor, archives, and exports an App Store Connect IPA under `output/`. Xcode automatic signing uses the Mac's Xcode account/Keychain. Upload the exported IPA from Xcode Organizer or Apple Transporter, then finish TestFlight build processing and tester setup in App Store Connect. The account owner must create the App Store Connect app record first.

The service URL is injected only into ignored generated bundle files; the tracked GoReview defaults stay untouched. The endpoint must be available from the public internet over HTTPS and serve the repository v3 health contract. No backend hosting is created here.

## Native bridge

`GoReviewNative` is registered from `GoReviewViewController`. It stores session JSON in Keychain, partitioned by service URL, and stores non-secret durable key/value data in an atomic, app-private JSON file with iOS file protection. Its methods are `getSession({serviceUrl})`, `setSession({session})`, `clearSession({serviceUrl})`, `storageGet({keys?})`, `storageSet({values})`, `storageRemove({keys})`, and `storageList({prefix})`. It emits `appStateChange` with `{isActive: true}` when the app becomes active. The review web layer must fail closed with an actionable error if the native bridge is missing.

## Privacy and remaining account setup

The app privacy manifest reports linked email address, account/user ID, and product interaction data (including synced review progress) for app functionality, with tracking disabled. Confirm those declarations against actual production data flows when completing App Store privacy details. No signing identity, Team ID, backend URL, or credential is committed.

The local Windows setup cannot compile, sign, or run the iOS app. The EAS cloud workflow is the Mac-free archive path once the public backend endpoint and real Bundle ID are supplied, an EAS project is linked, and EAS has valid Apple distribution credentials. A native compile and TestFlight upload have not been performed here.

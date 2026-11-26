# GoReview TestFlight build 14 (2026-11-26)

Status: Expo cloud build FINISHED, and the App Store Connect upload SUCCEEDED ("Submitted your app to Apple App Store Connect!").
Apple's processing and the TestFlight page decide the rest: https://appstoreconnect.apple.com/apps/6822923834/testflight/ios

The owner asked for this build on 2026-11-26: "For now shelve arabic and korean, and build a testflight copy of GoReview as it stands without those two."

| | |
|---|---|
| EAS build id | `4e1f6c9f-f986-4540-870e-818e9ab37479` |
| EAS submission | `86005b43-b035-4f4d-b088-128fd9b4aba9` |
| staged version | 1.0.0 (14), bundle `com.cjwalker.goreview`, Expo project `668babc5-29cc-4185-b101-b963fce37ea1` |
| built from | `32574461` = master `a822b1ab` + the NFC payload fix (now on master as `a5b4f18e`, after `b0b86316`, which is GoLearn only and does not change GoReview) |
| Repository address in the bundle | `https://go-v0.onrender.com` |
| dictionaries | NOT bundled: `GOREVIEW_DICT=` and `GOREVIEW_ASSET_BASE=https://rookie2401.github.io/go-v0/`, so the app reads `dict/<language>/` from the Pages root (served with `Access-Control-Allow-Origin: *`). Greek, Hebrew and Russian lexicons and Biblia (with its texts) are bundled. Web payload 95 MB. |
| languages | master's registered packs only. Korean and Arabic are not on master and are not in the build. |

## What happened on the way

- Build 13, first try (`3d4239e6`), ERRORED in the cloud's "Sync the bundled web app into Capacitor" step: "Native web payload integrity check failed". The macOS build host lists the eight Russian lexicon shards with `й` in their names decomposed (и + U+0306), while the manifest staged on Windows holds them composed. Fixed in `packages/goreview-ios/scripts/native-payload.mjs` (paths recorded in NFC, files read by their real names, two files with one normalized name refused), with a test in `test/goreview-app/native-payload-provenance.test.ts` that fails on the old code. Before each later upload, the stage was copied, its decomposable names were renamed to NFD, and the release payload verified.
- Build 13, second try (`3412dc9a`), FINISHED, but App Store Connect refused it: "Build number 13 for app version 1.0.0 has already been used". The EAS build of 2026-11-05 (`e43be079`) evidently used 13 (or 12 and 13 were both uploaded). This build is therefore 14.

## Commands (Git Bash, from packages/goreview-ios in a clean worktree of the commit above, with junctions for the git-ignored assets)

```sh
export REPOSITORY_SERVICE_URL=https://go-v0.onrender.com REPOSITORY_HEALTH_CHECK_URL=https://go-v0.onrender.com \
  GOREVIEW_DICT= GOREVIEW_ASSET_BASE=https://rookie2401.github.io/go-v0/ \
  GOREVIEW_BUNDLE_ID=com.cjwalker.goreview GOREVIEW_BUILD_NUMBER=14 GOREVIEW_MARKETING_VERSION=1.0.0
npm run release:stage
cd .eas-project   # add expo.extra.eas.projectId 668babc5-… to app.json (the stage omits it)
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$(pwd -W)" npx eas build --platform ios --profile testflight --non-interactive --no-wait
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$(pwd -W)" npx eas submit --platform ios --profile testflight --id <build id> --non-interactive
```

`GOREVIEW_DICT` must be set empty from Bash. In PowerShell `$env:GOREVIEW_DICT=''` deletes the variable, and the build then bundles every dictionary (about 1 GB).

## Not verified

- The app on a device. The owner's phone is the check that the dictionaries load from Pages, that reviews and sign-in work, and that Biblia opens.
- Offline use: without a network the app has no dictionaries, because none are bundled.

Housekeeping: the next GoReview build is number 15 or higher.

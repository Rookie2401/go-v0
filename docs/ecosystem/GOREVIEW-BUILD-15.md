# GoReview TestFlight build 15 (2026-11-26, evening PST)

Status: Expo cloud build FINISHED, and the App Store Connect upload SUCCEEDED ("Submitted your app to Apple App Store Connect!").
Apple's processing and the TestFlight page decide the rest: https://appstoreconnect.apple.com/apps/6822923834/testflight/ios

The owner asked for it on 2026-11-26 ("Do it", in reply to the release manager's list, which offered an iPhone build 15 so the phone gets the deck check).

| | |
|---|---|
| EAS build id | `14e72449-5bb0-4cf8-a67c-2cfe6bc0772e` |
| EAS submission | `41043751-36f5-422a-9b88-68f338b18e8c` |
| staged version | 1.0.0 (15), bundle `com.cjwalker.goreview`, Expo project `668babc5-29cc-4185-b101-b963fce37ea1` |
| built from | master `36e6d174` (clean tree) |
| Repository address in the bundle | `https://go-v0.onrender.com` |
| dictionaries | not bundled (`GOREVIEW_DICT=`, `GOREVIEW_ASSET_BASE=https://rookie2401.github.io/go-v0/`); Greek, Hebrew and Russian form indexes and Biblia are bundled. Web payload 95 MB. |

## What is new since build 14 (`32574461`)

- The deck gate for every live language (`36e6d174`, `docs/ecosystem/DECK-GATE.md`): a word whose reading or first meaning is unreliable is held and makes no card, including cards already in a deck; some first meanings are repaired.
- The globe for the Languages tab in the top bar (`35363baa`).
- Biblia's account page in GoReview's look (`ae8d65ca`, `e47a943f`), in the Biblia carried inside the app.

## Checked before the upload

- `app.json` buildNumber 15; the release manifest names commit `36e6d174`, not dirty; `config.json` has the Render address and the hosted dictionary address; no `dict/` in the payload.
- The staged payload verifies with its eight decomposable Russian shard names renamed to NFD, as the macOS build host lists them (the fault that failed build 13's first try).
- `validate-staged-release.mjs` against the live service's health endpoint.

## Not verified

- The app on a device, including that held words no longer appear in a review and that dictionaries load from Pages.
- Offline use: with no network the app has no dictionaries.

Commands: as in `GOREVIEW-BUILD-14.md`, with `GOREVIEW_BUILD_NUMBER=15`. The next GoReview build is 16 or higher.

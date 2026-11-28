# GoReview TestFlight build 16 (2026-11-27, evening PST)

Status: Expo cloud build FINISHED and the App Store Connect upload SUCCEEDED ("Submitted your app to Apple App Store Connect!").
Apple's processing and the TestFlight page decide the rest: https://appstoreconnect.apple.com/apps/6822923834/testflight/ios

Part of the Korean + Arabic release the owner asked for on 2026-11-25 ("Watch both Arabic and Korean. Make sure both land
without a problem in completion. Then make sure Golearn has them added to the extention, GoReview to the languages selector,
and push it all").

| | |
|---|---|
| EAS build id | `272e1957-4e19-4b26-bf12-4c7b72224116` |
| EAS submission | `d7a49f49-fc7f-492e-87a5-e3b1e384b3d3` |
| staged version | 1.0.0 (16), bundle `com.cjwalker.goreview`, Expo project `668babc5-29cc-4185-b101-b963fce37ea1` |
| built from | master `5f001d20` (clean tree; tag `goreview-ready-2026-11-27-koar`) |
| Repository address in the bundle | `https://go-v0.onrender.com` (deployed at `5ecf9a6dab25` before this build) |
| dictionaries | not bundled (`GOREVIEW_DICT=`, `GOREVIEW_ASSET_BASE=https://rookie2401.github.io/go-v0/`); the Arabic, Greek, Hebrew, Korean and Russian form tables and Biblia are bundled. Web payload 109 MB. |

## What is new since build 15 (`36e6d174`)

- Korean (`ko`, experimental) and Arabic (`ar`, experimental, with a Classical track) in the language list; both passed
  their independent auditors (Korean `1a780834`, Arabic `5c59690d` / `1c64e137`).
- The deck gate's four follow-ups: Greek, the confident misreadings, first meanings, and every named false card held
  (`docs/ecosystem/DECK-GATE.md`); the full Latin lexicon in GoReview.
- Scripture and course-dialogue samples cut to short phrases; the Settings transition fix (#28).
- Dictionary cache v2: a cached manifest from before the Russian and French full shards were gzipped is discarded.

## Checked before the upload

- `app.json` buildNumber 16; the release manifest names commit `5f001d20`, not dirty; `config.json` has the Render address
  and the hosted dictionary address.
- The staged payload verifies with its decomposable file names renamed to NFD, as the macOS build host lists them.
- `validate-staged-release.mjs` against the live service's health endpoint.

## Not verified

- The app on a device: Korean and Arabic in the language list, their dictionaries loading from Pages, a review in each.

The next GoReview build is 17 or higher.

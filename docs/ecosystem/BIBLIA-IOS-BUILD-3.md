# Biblia (its own iPhone app) — TestFlight build 3 (2026-10-24)

Status: Expo cloud build FINISHED (21:45 PDT) and the App Store Connect upload SUCCEEDED. Same app record as build 2
("Biblia: Original Languages", Apple ID `6826655180`, bundle `com.cjwalker.biblia`, display name "Biblia"); the owner is an internal
tester of the group "Team (Expo)", which receives every build. TestFlight page: https://appstoreconnect.apple.com/apps/6826655180/testflight/ios

| | |
|---|---|
| EAS build id | `a495954d-6122-4777-b166-9361c3690a19` |
| EAS submission | `de1edb07-eacf-4631-bcba-74b4545dd609` |
| staged version | 1.0.0 (3) |
| web content | the redesigned standalone edition from master at `7bdda2b3` (old Biblia look for library and reader, the old fonts, Settings and Sign-in in GoReview's design, `46087eb0`; the upload-recovery and sync-status work merged from the cut-over branch, `12e15b66`; the sync bar sitting above the top bars, `7bdda2b3`); `config.json` → `https://repo.golearn-global-languages.com`, which now resolves to the Render-hosted service; texts, indexes, sharded tables and fonts in the stage |
| what changed since build 2 | the whole user interface (see `46087eb0`), the fonts, upload retries and the sync-status bar, the service behind the address (Render instead of the PC) |

## What was verified, and what was not

- Verified: the stage before upload (build number 3, the standalone marker, `data/canon.json`, `fonts/`, the https config, the Apple ID;
  the pre-build health check against `https://go-v0.onrender.com`, the Render address, since this PC's network filters the canonical
  name), the Expo build FINISHED, `eas submit` "Submitted your app to Apple App Store Connect". The same web build served locally was
  signed in against the Render service: the migrated words came back as Seen and a new tap was recorded.
- Not verified: the app on a device (the owner's phone: open it, check the look against the old app, sign in, see the Seen words in
  Genesis 1), the IPA's `CFBundleVersion` (Expo's metadata shows "1" as for every build; the version step stamps it).

Next Biblia build: 4 or higher. Commands as in `BIBLIA-IOS-BUILD-2.md` with the number raised.

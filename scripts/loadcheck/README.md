# Load-time check rigs

Measuring rigs for how fast two apps load: GoLearn (a browser extension, driven in a
headless Brave over the Chrome DevTools Protocol) and GoReview (a web app). Everything runs
against a throw-away local Repository service behind a delay proxy, with generated test
accounts. Nothing here touches the owner's profile, service or account.

## Scripts

golearn/
- `he.mjs`: signed out, a real Hebrew page. Downloads Hebrew and Albanian on the setup page, switches Active on, opens Psalm 110 laid out like Mechon Mamre, times the popup language switch, reports what Active found.
- `he-signed.mjs`: same Hebrew probe, signed in to a local account behind a proxy with phases quick (200 ms per request), slow (6 s per request) and hung.
- `stress.mjs`: stability probe. Setup-page downloads, popup language switching, lookups on pages, then repeats after the worker is stopped and after a reload.
- `signed.mjs`: signed in with the service behind a fault proxy: ok / slow / hanging / down.
- `reload.mjs`: what happens to a page's GoLearn after the extension reloads (is the old content script's world reused, does a lookup still work).

golearn-history/
- `rec.mjs`: lookups on a large local history, warm and after the worker is stopped. Reads whether the card says the encounter was recorded.
- `seed.ts`: account seeder. Creates a test account enrolled in Albanian with N lookups.
- `bench-open.ts`: cold-open timing of the device Repository in Node (appends N events, then reopens and times it).

goreview/
- `profile.mjs`: GoReview served like the hosted site (gzip, `/go-v0/review` and `/go-v0/dict`), the service behind a latency proxy, network and CPU throttling. Times each step and writes a `.cpuprofile` per step. Every step reports two times: `ready` (controls present) and `visible` (ready, and the `goreview-splash` element gone or hidden; reported as not reached if that takes more than 10 s).
- `seed.ts`: account seeder (as above, GoReview variant).
- `seed-reviews.ts`: adds 200 cards with 4 reviews each to the test account (`<serviceUrl> <U> <R>`).
- `analyse.mjs`: summarises a `.cpuprofile` (self and inclusive time by function).

## Environment variables

- `LOADCHECK_TMP`: working folder. Default is `<temp>/loadcheck-<rig>`. Each run deletes it (or a subfolder of it) at start and end, so never point it at a real folder. The shared cred file lives directly in it.
- `LOADCHECK_BRAVE`: full path to `brave.exe`. Required.
- `LOADCHECK_PSALMS_JSON`: path to `biblia-v0/public/data/he/Ps.json`. Required by `he.mjs` and `he-signed.mjs`.

Run from the repository root, for example:

    npx vite-node scripts/loadcheck/goreview/seed.ts http://127.0.0.1:8796 1500
    node scripts/loadcheck/goreview/profile.mjs <siteDir> <dictDir> 8796 out.json warm

## Starting the throw-away service

    npx vite-node packages/repository-service/src/main.ts --port 8796 --data <dir> --host 127.0.0.1

Stop it by killing the node process. Stopping the shell leaves it running and holding the
database, so the next run fails or reads stale data.

## Status

These scripts were rebuilt from a session transcript on 2026-11-10 and have not been re-run since they were moved here. Expect to adjust selectors and ports on first use. Known notes from their author: send lookups from the setup page, not from the worker (attaching to the worker wakes it and skews cold numbers); in profile.mjs submit the sign-in form once (a double submit makes two sessions); click #start-session, not #start-new.

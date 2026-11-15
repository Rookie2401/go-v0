# loadcheck: device Repository in a real browser's IndexedDB

Times `openLocalRepository` (packages/repository-local) in IndexedDB mode: seeding N Albanian selection events in batches, the cost of one recording on top of the history, `knowledge` for 60 lemmas, and five cold reopens (open time, first knowledge after open). Output is one JSON object in the page.

Build: `node scripts/loadcheck/idb-browser/make-words.mjs` (once, writes words.json), then `npx vite build -c scripts/loadcheck/idb-browser/vite.config.ts` and `cp scripts/loadcheck/idb-browser/words.json scripts/loadcheck/idb-browser/dist/words.json`.

Serve: `node scripts/local/static-server.cjs scripts/loadcheck/idb-browser/dist <port>`
Open: `http://localhost:<port>/index.html?n=3000` (optional `&batch=500`).

The databases `loadcheck` and `loadcheck-kv` are deleted at the start of each run.

`?mode=migrate&n=3000` builds N events as old rows in one in-memory area on the present path, then times the one-time switch to IndexedDB (`loadcheck-mig`, `loadcheck-mig-kv`) on that same area; the result holds `oldRows`, `buildOldRowsMs`, `migrateOpenMs`, `storage`, `eventsAfter`, `knowledge60Ms` and `secondOpenMs`.

# Running the whole GoLearn system locally, and what to test (2026-10-21, updated 2026-10-23)

Everything below is on this PC; nothing needs the network except the phone's own sync through the tunnel.

## What is running now

| part | where | how it runs |
|---|---|---|
| Repository service (accounts, enrolments, events, sync) | http://127.0.0.1:8790 (health: /health) | Scheduled Task `GoRepositoryService`, starts with Windows, restarts itself; log `data/local-repository/service.log` |
| Cloudflare tunnel (the phone's way in) | https://repo.golearn-global-languages.com | Windows service `cloudflared`; blocked from the laptop's own Masters-WiFi network (test from the phone on cellular) |
| GoLearn extension (reader card, setup app, GoPractice page; since 2026-10-23 **no Biblia page**: Open Biblia opens the hosted app) | `packages/golearn-extension/dist` | load unpacked (below) |
| Biblia, hosted edition (installable, records to the public service when signed in; `docs/ecosystem/BIBLIA-STANDALONE.md`) | https://rookie2401.github.io/biblia/ | published by the owner from `packages/biblia/dist-standalone`; on this PC's Masters-WiFi the public service address is blocked, so here it reads but cannot record |
| Biblia, standalone edition served locally against the local service | http://localhost:4199 | `npm run biblia:build-standalone` then `npx vite preview --outDir packages/biblia/dist-standalone --port 4199` (localhost, so its service worker can register) |
| Biblia, standalone (reader only: nothing is recorded; carries the Biblical Hebrew and Koine indexes whole and the Ancient Greek, Modern Greek and Modern Hebrew shards) | http://127.0.0.1:5199 | `npx vite preview -c packages/biblia/vite.config.ts --port 5199` over `packages/biblia/dist` |
| GoPractice, web copy (needs an account; points at the local service) | http://127.0.0.1:5198 | `npx vite preview -c packages/gopractice/vite.config.ts --port 5198` over `packages/gopractice/dist` |

The two previews were started from a Claude session and stop with it; the commands above restart them. The builds come from
`npm run local:build` (extension + setup app + GoPractice + Biblia, in that order; `dist/` is about 450 MB with the dictionaries).

## Load the extension

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `C:\Users\CJWal\dev\go-v0\packages\golearn-extension\dist`.
2. Pin the GoLearn button. Open **GoLearn setup** (popup button). Choose languages: for this round take **Hebrew** and **Greek** (both are
   experimental packs) beside Albanian or Spanish. Create a local account or sign in; the service address is the one in the extension's `app/config.json` (set it to `http://127.0.0.1:8790` before `npm run ext:build`; no field on the page since 2026-10-28).
3. Settings → *How GoLearn reads pages* → **Open Biblia** opens https://rookie2401.github.io/biblia/ in a new tab. Sign in there with the same
   GoLearn account; its lookups and ratings are then recorded under the Hebrew or Greek enrolment through the public service (from this PC's
   network that address is blocked, so test the recording from the phone or another network, or use the local :4199 copy against
   `http://127.0.0.1:8790`). The reader-only copy on :5199 records nothing and says so.

## What to test, in order

1. **Biblia, Hebrew.** Genesis 1: every word is a button; the period line says Biblical Hebrew; tap אֱלֹהִים → card with Form, meaning, the
   period line, pills *Go deeper · See full sentence · Variants*. Variants: Biblical row attested with the Tanakh count (2,599 for אֱלֹהִים);
   **Modern Hebrew attested** (אלוהים, "a god", from the Modern shards loaded for the chapter's words; checked 2026-10-22 on the rebuilt
   reader); Mishnaic and Medieval say "not in our sources". Daniel 2: the Aramaic verses are marked and read as Aramaic.
   Settings → Hebrew text: full / vowels only / consonants only.
2. **Biblia, Greek.** John 1: the period line says Koine and "the Attic and Homeric tables are loaded for this chapter's words (N shards
   in memory)". Tap λόγος → Variants: **Attic attested** (the Ancient entry's gloss), Koine as this text (660× in the NT), **Modern attested**
   (the stated descendant), Homeric "no Epic-specific form", Medieval "none here". Tap ἀρχῇ, ἦν, θεόν likewise. Matthew 1: a name with a Wiktionary entry (Ἀβραάμ)
   also has an Attic row; a name without one has the New Testament reading only. Checked 2026-10-22: all of this passes.
3. **Recording.** In the hosted Biblia (or the :4199 copy), signed in, rate a word (How well do you know it?). Then GoPractice (popup → Practise, or
   :5198 signed in with the same account): the word should appear in the Hebrew or Greek review under its period (`he-bib` / `el-koi`).
   The service must allow the page's origin (https://rookie2401.github.io) in its CORS settings for the hosted edition to record; if the
   browser console shows a CORS error on the service calls, that setting is missing (service side, not the build).
4. **The extension on a web page.** Any Greek or Hebrew web page (Wikipedia in Greek; a Sefaria page): switch GoLearn on for the tab, select a
   word → the same card. Checked 2026-10-22 on the harness pages (`packages/golearn-extension/harness/active-he.html`, `active-el.html`, served
   from the package root with the harness build) AFTER the full indexes were shipped to the extension (`dist/lexicon/`, 23 MB of gzip shards,
   loaded before a lookup): a polytonic sentence reads as Koine with Attic and Modern rows in Variants; the Iliad line reads as Homeric (lemma
   μῆνις); a monotonic sentence reads as Modern with its Attic and Koine rows; a pointed Hebrew verse reads as Biblical with its Modern row;
   an unpointed Modern sentence reads as Modern (a consonant-only Biblical match weighs half). The first lookup on a page fetches the shards its
   sentence needs (a few hundred kB), later ones reuse them. Known limit: a page tagged `grc` reads as Attic unless the text itself shows
   Homeric marks; Attic prose and literary Koine are not told apart by vocabulary.
5. **Audio.** Hebrew and Greek words play only if the device has a Hebrew/Greek voice (Windows: Settings → Time & language → Speech → add
   Hebrew and Greek voices); ancient periods use the Modern voice and the card says so.
6. **GoTell / GoReview period targeting.** In GoPractice, with a Greek enrolment, the writing prompts in Koine (two) and the review facts per
   period; with Hebrew, the Biblical prompts. The answer grader folds Hebrew points and Greek accents.
7. **Phone.** TestFlight build 8 (2026-10-22, `docs/ecosystem/GOREVIEW-BUILD-8.md`) carries **Biblia inside GoReview**: the GoReview home
   has a fifth entry, *Biblia*, under *My vocab*. Sign in first (the entry is on the home, which needs the account). Open Biblia → Genesis 1 or
   John 1 → tap a word → rate it (How well do you know it?): the rating is recorded in your account through the tunnel under a Hebrew or Greek
   enrolment whose variety is the text's period (`he-bib` / `el-koi`), so the word should then appear in the review on the phone AND in
   the extension's GoPractice on this PC (same account). *← GoReview* at the top of Biblia goes back to the review home. Biblia's Settings page
   says where it records ("in your GoReview account…"); if it says "Sign in to GoReview…", the app had no session when Biblia opened.
   The sync runs through the tunnel to this laptop, which must be on and awake (it still sleeps after 3 min on battery unless the power
   setting is changed). Build 8 is about 50 MB larger than build 7 (Biblia's texts and shards).

## Known limits to expect

- Biblia carries the Biblical Hebrew and Koine indexes whole and the sharded Ancient Greek, Modern Greek and Modern Hebrew tables (loaded per
  chapter for the chapter's words); it does not carry the Mishnaic or Medieval sources (none exist yet), so those rows say "not in our sources".
- No parser: a form with several readings in a period keeps them all, the commonest first; the Variants and paradigm views show what the
  loaded shards hold.
- Proper names and rare words outside the Wiktionary tables have the source's reading only, or none.
- The app bundle cap test was raised to 760 KB for the GoTell and GoListen work; background.js is at its 1,100 KB cap's edge.

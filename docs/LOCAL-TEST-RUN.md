# Running the whole GoLearn system locally, and what to test (2026-10-21)

Everything below is on this PC; nothing needs the network except the phone's own sync through the tunnel.

## What is running now

| part | where | how it runs |
|---|---|---|
| Repository service (accounts, enrolments, events, sync) | http://127.0.0.1:8790 (health: /health) | Scheduled Task `GoRepositoryService`, starts with Windows, restarts itself; log `data/local-repository/service.log` |
| Cloudflare tunnel (the phone's way in) | https://repo.golearn-global-languages.com | Windows service `cloudflared`; blocked from the laptop's own Masters-WiFi network (test from the phone on cellular) |
| GoLearn extension (reader card, setup app, GoPractice page, **Biblia page**) | `packages/golearn-extension/dist` | load unpacked (below) |
| Biblia, standalone (reader only: nothing is recorded) | http://127.0.0.1:5199 | `npx vite preview -c packages/biblia/vite.config.ts --port 5199` over `packages/biblia/dist` |
| GoPractice, web copy (needs an account; points at the local service) | http://127.0.0.1:5198 | `npx vite preview -c packages/gopractice/vite.config.ts --port 5198` over `packages/gopractice/dist` |

The two previews were started from a Claude session and stop with it; the commands above restart them. The builds come from
`npm run local:build` (extension + setup app + GoPractice + Biblia, in that order; `dist/` is about 450 MB with the dictionaries).

## Load the extension

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `C:\Users\CJWal\dev\go-v0\packages\golearn-extension\dist`.
2. Pin the GoLearn button. Open **GoLearn setup** (popup button). Choose languages: for this round take **Hebrew** and **Greek** (both are
   experimental packs) beside Albanian or Spanish. Create a local account or sign in; the service address is `http://127.0.0.1:8790`.
3. Settings → *How GoLearn reads pages* → **Open Biblia**. (Biblia inside the extension records lookups and marks under the Hebrew or
   Greek enrolment; the standalone copy on :5199 records nothing and says so.)

## What to test, in order

1. **Biblia, Hebrew.** Genesis 1: every word is a button; the period line says Biblical Hebrew; tap אֱלֹהִים → card with Form, meaning, the
   period line, pills *Go deeper · See full sentence · Variants*. Variants: Biblical row attested with the Tanakh count; Mishnaic, Medieval,
   Modern say "not in our sources" (the Modern index is not shipped in Biblia). Daniel 2: the Aramaic verses are marked and read as Aramaic.
   Settings → Hebrew text: full / vowels only / consonants only.
2. **Biblia, Greek.** John 1: the period line says Koine and "the Attic and Homeric tables are loaded for this chapter's words (N shards
   in memory)". Tap λόγος → Variants: **Attic attested** (the Ancient entry's gloss), Koine as this text (660× in the NT), **Modern attested**
   (the stated descendant), Homeric "no Epic-specific form", Medieval "none here". Tap ἀρχῇ, ἦν, θεόν likewise. Matthew 1: a name with a Wiktionary entry (Ἀβραάμ)
   also has an Attic row; a name without one has the New Testament reading only. Checked 2026-10-22: all of this passes.
3. **Recording.** Inside the extension's Biblia, rate a word (How well do you know it?). Then GoPractice (popup → Practise, or :5198 signed in
   with the same account): the word should appear in the Hebrew or Greek review under its period (`he-bib` / `el-koi`).
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
7. **Phone.** The TestFlight build syncs through the tunnel; the laptop must be on and awake (it still sleeps after 3 min on battery unless
   the power setting is changed).

## Known limits to expect

- Biblia carries the Biblical Hebrew and Koine indexes and the sharded Ancient Greek tables; it does not carry the Modern Hebrew or Modern
  Greek indexes (so a Modern row in Hebrew Variants says "not loaded").
- No parser: a form with several readings in a period keeps them all, the commonest first; the Variants and paradigm views show what the
  loaded shards hold.
- Proper names and rare words outside the Wiktionary tables have the source's reading only, or none.
- The app bundle cap test was raised to 760 KB for the GoTell and GoListen work; background.js is at its 1,100 KB cap's edge.

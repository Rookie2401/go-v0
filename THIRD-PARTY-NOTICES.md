# Third-party notices

What the Go builds (GoLearn extension and setup page, GoPractice, the controlled reader prototype) contain from
others, with the licence each requires us to state. The full inventory and the open legal questions are in
`docs/ecosystem/audit/RIGHTS-AND-ATTRIBUTION.md`. This file is a notice, not a legal opinion.

## Data

- **Albanian dictionary** — Wiktionary, via kaikki.org (`kaikki-sq@2026-09-28`, 91,271 entries, sharded).
  Licence: Creative Commons Attribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
  Contributors: the Wiktionary contributors (https://en.wiktionary.org). Processing: kaikki.org (Tatu Ylonen, "Wiktextract").
  The shards are a reformatting of the kaikki JSONL into per-prefix JSON files; no entry text was changed.
  Shown in the product as "Wiktionary, via kaikki.org — CC BY-SA 4.0" wherever a dictionary meaning appears.

## Code bundled into the applications

- **ts-fsrs** 5.4.2 — MIT License, Copyright (c) Open Spaced Repetition (https://github.com/open-spaced-repetition/ts-fsrs).
  Bundled in GoPractice (the GoReview scheduler).
- **epub.js** 0.3.93 — BSD 2-Clause License, Copyright (c) FuturePress (https://github.com/futurepress/epub.js).
  Used by the controlled reader prototype only (not in the extension or GoPractice builds).

Build tooling (Vite, esbuild, TypeScript, Vitest, jsdom and their dependencies) is not distributed in the builds.

## Audio

- No third-party audio is shipped. The German demonstration clip referenced by GoListen's registry
  (Wikimedia Commons `De-Guten_Tag.oga`, public-domain dedication by the uploader) is a test fixture in the
  repository and is not copied into any build.

## Our own material

The Albanian word list, word-form rules, phrase list, construction rules, tutorial, writing prompts and validation
sentences are owner-authored and machine-drafted (not reviewed by a native speaker) and are labelled so in the
product.

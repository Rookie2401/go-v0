# Rights and attribution audit of the new product's builds

Audit date: 2026-10-09. Repository HEAD `87eda2af` (master) with sibling sessions' uncommitted edits in the working tree.
Builds inspected are the files on disk, built 2026-10-08 20:27-20:38 (extension, setup page) and 2026-10-09 08:11 (GoPractice).

**This is an engineering inventory and evidence record. It is not legal advice and it does not clear anything.** Every
"licence" below is what the repository's own files say it is; I did not re-verify any upstream licence against the
upstream site (no network use). Items marked **LAWYER** need a rights lawyer (or the rights holder) before public or
commercial distribution. Nothing was changed in the repository except this file.

Prior decisions this audit is checked against: `docs/ecosystem/RIGHTS-AND-PRIVACY-BOUNDARIES.md` (2026-10-08) and
`docs/ecosystem/annex/C-rights-and-sources.md`.

## 0. Ten-line summary

1. Everything the new product distributes is in four static builds plus one service: extension `packages/golearn-extension/dist` (incl. `dist/app`), hosted setup page `packages/golearn-extension/dist-web`, GoPractice `packages/gopractice/dist`, the Repository service (source only, not hosted), and the controlled reader (prototype, not built on disk).
2. Third-party **content** in the builds is exactly one item: the Albanian Wiktionary dictionary (kaikki, CC BY-SA 4.0, 91,271 entries, 256 shards + manifest + frequency.json), copied identically into all three builds. No other language's dictionary is in any build.
3. Everything else shipped is owner-authored or AI-drafted (Albanian hand lexicon, rules, phrase list, tutorial, validation sentences, pack grammar text), unreviewed by a native speaker, and labelled so in the manifests and the UI.
4. Confirmed with evidence: no retired-corpus file is in any build (0 byte-identical files out of 13,817 retired files; 0 shared 8-word sequences across 13,784 prose files); no Scripture text; the extension stores no page text; `data/repository/` and `data/private/` are git-ignored and untracked.
5. **Finding 1 (contradicts a prior decision):** the shipped `dict/sq/frequency.json` was counted from the retired library (Albanian Wikipedia pages CC BY-SA 4.0, one Global Voices excerpt CC BY 3.0) plus the owner corpus and ladder; annex C/boundaries said "QUARANTINE frequency sidecars". It is aggregate lemma counts only (1,276 lemmas), but it is in all three builds.
6. **Finding 2 (attribution gap):** the word card shows the kaikki attribution only in the separate "dictionary" row; when the meaning comes from the dictionary alone (word not in the hand list) the meaning is shown with **no** attribution (`packages/golearn-extension/src/popup/card.ts` lines 332-338, confirmed in built `content.js`). No licence link or URL appears anywhere in any build (no `creativecommons`, `wiktionary.org`).
7. **Finding 3 (notices):** no build carries any third-party licence text. `ts-fsrs` (MIT, "Copyright (c) 2026 Open Spaced Repetition") is bundled in GoPractice with its notice stripped by minification; GoPractice has no licences/about screen at all; no `dist` folder has a LICENSE/NOTICE file, and the repo has no LICENSE file.
8. GoPractice and the extension carry registry metadata for the German Wikimedia Commons clip (PD-self, performer not independently verified) and the Azure voice names, but **no audio file** and no Azure call path in the builds (default speech base `/api/speech` has no server behind it; the Repository service has no speech route).
9. **LAWYER** questions: CC BY-SA share-alike reach into the AI-drafted Albanian lexicon/rules that were compared with or corrected from Wiktionary (`lexicon-ladder.ts`, `disputed.ts`); whether the shards, frequency list and combined app are "adapted material"; the Azure terms (dormant); the Commons clip's performer rights; ownership of AI-drafted text; the Repository service's account/personal-data obligations.
10. Cheap fixes that would close findings 1-3 are listed in section 7 (not done here: this was read-only).

## 1. What is distributed (inventory)

| distribution | path | contents (verified by listing) | size |
|---|---|---|---|
| Extension | `packages/golearn-extension/dist` | `manifest.json`, `background.js`, `content.js`, `action/popup.{html,js}`, `app/{index.html,app.js,styles.css,config.json}`, `app/dict/sq/*` (258 files) | 7.4 MB |
| Hosted setup page | `packages/golearn-extension/dist-web` (git-ignored) | `index.html`, `assets/index-CQKNM1HY.js`, `assets/style-CFI_Ujhx.css`, `config.json`, `dict/sq/*` (258 files) | 6.8 MB |
| GoPractice | `packages/gopractice/dist` | `index.html`, `assets/index-CwDy2gnG.js`, `assets/style-CEmuchdQ.css`, `config.json`, `dict/sq/*` (258 files) | 6.9 MB |
| Repository service | `packages/repository-service` (source; run with `vite-node`, SQLite store) | own code, Node built-ins only; imports no third-party package | not built |
| Controlled reader | `packages/controlled-reader` (prototype; `npm run reader:build`) | **no `dist` exists on disk**; if built it adds `epubjs` and the three EPUB fixtures (prototype mode only) | n/a |

Dictionary language selection: `app/vite.config.ts` copies `public/dict/<lang>` for `GOLEARN_APP_DICT` (default `sq`);
`packages/gopractice/vite.config.ts` does the same for `GOPRACTICE_DICT` (default `sq`). Both default to `sq` only, and all
three build directories contain `dict/sq` only (checked by listing; 256 shards + `manifest.json` + `frequency.json` each).
`public/dict/` holds de, es, hi, sq, th (manifests) and nb (frequency only, no manifest); none of these except sq is
copied. **Risk:** setting either environment variable to another language would ship that kaikki dictionary and its
library-derived `frequency.json` (de/es/hi/th frequency files count 0.85-2.6 million words from the retired library,
which includes US-only public-domain and CC BY-SA texts). That would need a fresh review.

The dist `dict/sq` files are byte-identical (SHA-256) to `public/dict/sq` (258/258 in each build), which is git-ignored and
rebuilt by `npm run dict:build`.

## 2. Item-by-item register

Legend for "review": **L** = a rights lawyer should look; **O** = owner decision; **none** = no professional review beyond routine notice hygiene.

### R1. Albanian dictionary shards (`dict/sq/s-00.json` ... `s-ff.json`, `manifest.json`) - in all three builds

| field | value |
|---|---|
| source | Wiktionary, extracted by kaikki.org. Manifest `source`: file `kaikki.org-dictionary-Albanian+tables.jsonl` (128,809 lines), file last-modified 2026-09-28, retrieved 2026-10-01, SHA-256 `f63836cd29026f1c070c0702d926dc31e3427abb289e3fd9048ca382acf7c014`; `source.url` is `https://kaikki.org/dictionary/Albanian/kaikki.org-dictionary-Albanian.jsonl.gz` |
| edition / version | `kaikki-sq@2026-09-28`, manifest schema 3, built 2026-10-01, 91,271 entries |
| licence | CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org) - the manifest's own statement |
| content | headword forms, part of speech, form-of relations with label sets (many "from-inflection-table"), glosses (at most 6 per entry), sense tags/topics, an **integer count** of examples (no example text), IPA pronunciations (6,439 entries), etymology numbers, register tags. Rewritten into a compact sharded JSON format by the repository's builder |
| attribution required | credit the creators and the licence, link to the licence, indicate changes. The pack manifest fixes the line `Wiktionary, via kaikki.org — CC BY-SA 4.0` (`KAIKKI_ATTRIBUTION`, enforced by `validateManifest`) |
| redistribution | allowed under CC BY-SA 4.0 with the above; adapted material must be offered under CC BY-SA 4.0 (or a compatible licence) |
| commercial | CC BY-SA 4.0 permits commercial use. CC BY-SA 4.0 also forbids adding legal terms or effective technological measures that restrict recipients' use of the licensed material (relevant to any DRM or store terms wrapped around the shards) |
| unresolved | (a) the sq `source.url` names a `.jsonl.gz` while the file used is the `+tables` variant: the exact download URL, and kaikki's own licence statement for that variant, are not recorded; (b) which Wiktionary licence versions apply to the extracted text (older revisions are not all CC BY-SA 4.0) is not recorded; (c) the shards are an adaptation (truncated to 6 glosses, reformatted, entries merged): nothing in the build says so or states the licence of the shard files themselves; (d) no per-entry or per-language licence link or URL is shown anywhere (see section 5); (e) the 6,439 IPA strings are shown only if the UI surfaces them (not seen in the card code path read) |
| review | **L** (adaptation statement, licence link practice, share-alike reach: Q1/Q2 in section 6) |

### R2. `dict/sq/frequency.json` - in all three builds

| field | value |
|---|---|
| source | counted by `scripts/library-frequency.mts` (format in `src/dict/frequency.ts`). Its own `sources` block: `library-sq@2026-10-07` (38 texts, 24,566 words), `data/corpus/sq` (23 texts, 1,034 words), `data/ladder/sq/units` (115 texts, 49,043 words) |
| the "library" texts | `public/library/sq/provenance.json`: `sq-modern-open` (Albanian Wikipedia rendered pages, CC BY-SA 4.0, 9,647 words), `sq-modern-gap-readings` (Albanian Wikipedia, CC BY-SA 4.0, 14,612 words), `gv-sq-adc3e64cb681-excerpt` (Global Voices, CC BY 3.0, 307 words) |
| edition | schema 1, built 2026-10-07, 74,643 words counted, 1,276 lemmas listed (lemma and occurrences per million; no text) |
| licence | none stated for the file. It is aggregate statistics derived from CC BY-SA / CC BY texts plus owner-authored text |
| attribution required | unknown. Word counts are facts, but the source texts are CC BY-SA; no one has decided whether counts carry any attribution duty |
| redistribution / commercial | no known restriction; unanalysed |
| unresolved | `RIGHTS-AND-PRIVACY-BOUNDARIES.md` §2 and annex C §4 say **QUARANTINE frequency sidecars; rebuild from clearly licensed text only**. The sidecar is nevertheless shipped in every build and `manifest.json` has `hasFrequency: true`. The build was never changed after that decision |
| review | **O** (rebuild from owner-authored ladder/corpus only, or accept and record); **L** only if the owner wants a legal view on statistics derived from share-alike text |

### R3. Language-pack manifests and rights blocks (inside `app.js`, `background.js`, `index-*.js`)

| field | value |
|---|---|
| source | `packages/language-packs/src/packs/{sq,de,es,hi,nb,nn,th}.ts`, `planned.ts`, `manifest.ts` |
| installable | `pack:sq` only (`status: 'installable'`, version 9). de, es, hi, nb, nn, th are `status: 'planned'`: manifest metadata only, with no dictionary data, no tutorial, no validation cases (checked: no German/other adapter vocabulary found in any bundle) |
| rights block (sq) | hand lexicon: "Owner-authored, AI-drafted; not reviewed by a native speaker"; dictionary: `kaikki-sq@2026-09-28` CC BY-SA 4.0 with the exact attribution; tutorial and passage: "Owner-authored, AI-drafted; not reviewed by a native speaker"; review status `machine-drafted`; no recordings; remote voice optional with consent and key |
| licence of the manifest text itself | owner-authored; no licence statement for the pack as a whole |
| unresolved | the planned manifests assert "A kaikki dictionary for this language is built in the repository (N entries, CC BY-SA 4.0)": true on disk, not shipped; keep the wording "not declared, installed or checked" |
| review | none (O: decide the licence the owner offers the pack text under) |

### R4. Albanian hand lexicon, word-form rules, phrase list, construction rules (`adapter-sq@9`; `src/adapters/sq.ts`, `src/adapters/albanian/*`)

| field | value |
|---|---|
| source | owner-directed, drafted by AI models: `lexicon-nouns.ts`, `lexicon-verbs.ts`, `lexicon-modifiers.ts`, `lexicon-ladder.ts` (271 ladder-plan words + about 160 b1-bridge words), `function-*.ts`, `morph-*.ts`, `phrases.ts`, `constructions.ts`, `production.ts`, `gheg.ts`, `sentence*.ts`, `describe.ts` (7,273 lines under `albanian/`) |
| edition | `SQ_VERSION = '9'` (`version.ts`) |
| licence | owner-authored, AI-drafted (pack `handLexicon.licence`); file headers say MACHINE-DRAFTED and not checked by a native speaker (e.g. `lexicon-nouns.ts`) |
| attribution / redistribution / commercial | no third-party attribution recorded; no restriction recorded |
| third-party touch points (these are the share-alike question) | `lexicon-ladder.ts` lines 8-18 and 311-348: the 271 words were "checked against English Wiktionary's Albanian entries ... where it has the word"; where the plan and Wiktionary differ "Wiktionary's form is used" (examples: para, pjek, ngas, thërras); the bridge list is "machine-drafted from Wiktionary and general knowledge". `tags.ts` maps kaikki labels and UniParser tag strings to the adapter's features. `disputed.ts` (generated, 434 SQ_DISPUTED + 43 SQ_MAJORITY form/lemma pairs) records where the word list, the UniParser Albanian analyzer (MIT), Wiktionary's tables and two UD treebanks (STAF, TSA; CC BY-SA 4.0 per `data/research/ud/*/LICENSE.txt`) disagree. The shipped `sq.ts` adapter text states this to the learner |
| unresolved | whether verbatim facts taken from Wiktionary (a few corrected forms and glosses) and the list of disagreements derived from CC BY-SA treebanks and Wiktionary make these files adaptations that must themselves be CC BY-SA (Q1); the built bundle merges them with proprietary-by-default owner code, so the question affects the whole `app.js`/`index-*.js` |
| review | **L** (Q1, Q4) |

### R5. Albanian orientation tutorial, demonstration passage, pack grammar explanations, validation sentences

| field | value |
|---|---|
| source | `packages/language-packs/src/tutorial/sq.ts` (steps, "Një ditë në shtëpi" passage of 7 sentences, `authorship: 'machine-drafted'`, `reviewed: false`, `reviewNeeded: 'native speaker'`, notice "drafted by an AI model and has not been checked by a native speaker"); `packs/sq.ts` (feature/construction explanations, 14 `ValidationCase`s with sentences); stage 0 sound notes (`data/stage0/sq/sounds`, also AI-drafted) informed the tutorial but are not shipped |
| licence | owner-authored, AI-drafted |
| used as review examples | `packages/goreview/src/facts/provider.ts` builds GoPractice's example-sentence pool from only `manifest.validation` and the tutorial (`pack-validation`, `pack-tutorial`); its header states "No sentence from a commercial book is ever read here". Spot check: 10 of those sentences searched verbatim across `data/sources`, `data/corpus`, `public/library`: only "Nëna pi çaj" occurs (in `data/corpus/sq/udha-0-06.json`, `owner-authored`/`generated`, and in `data/ladder/sq/units/sq-a1-1-05.json`), i.e. the same owner/AI pipeline |
| attribution / redistribution / commercial | none recorded; none known |
| unresolved | originality of very short stock sentences ("Ana shkon në shkollë") is not a concern in itself but nobody has compared them with Tatoeba or textbooks; ownership of AI-drafted text (Q4) |
| review | **L** on AI authorship only (annex C already marks it so) |

### R6. GoListen registry metadata: German Commons clip, device voices, Azure voices (inside GoPractice bundle; strings also in extension `app.js`/`background.js`)

| field | value |
|---|---|
| clip | `test/fixtures/golisten/de-guten-tag.{oga,wav}` is NOT in any build (no audio file in any dist). Only the `demoGermanRegistry` entry (`packages/golisten/src/registry.ts`) is bundled: text "Guten Tag!", default URL `/demo/de-guten-tag.wav` (nothing serves it), and the attribution string "Recording uploaded by Beagle Beck, Wikimedia Commons, 27 February 2007; PD-self". Licence statement in the fixture: uploader dedicates to the public domain worldwide with any-purpose fallback; `author: assumed` per Commons; Commons oldid 888223486; SHA-1 `3dc278525db3705517a0202f22948a3b6f64da77` |
| Azure | voice names `sq-AL-AnilaNeural`, `sq-AL-IlirNeural` and provider id `azure-speech` appear as metadata; licence field "Microsoft Azure Speech terms (owner's subscription)". `docs`: the live service has never been called; the proxy was tested against a mock only. In the new product there is no speech route in `packages/repository-service/src/handler.ts`; GoPractice's default `speechProxyBase` is `/api/speech` (same origin) and a static host has none. Consent setting `remoteSpeechConsent` defaults to false |
| device voices | the browser/OS vendor's terms (registry says so) |
| unresolved | if a speech proxy is ever added: Azure product terms on the generated audio (output use, redistribution, disclosure of synthetic speech), data retention and region, and whether sending a learner's text from a book to Azure is allowed under that book's terms; the clip's performer: Commons says "own work, assumed", and no one has checked the voice identity or a release (Q3) |
| review | **L** for Azure (only if enabled) and for the clip (only if its audio is ever redistributed; it is not now) |

### R7. `ts-fsrs` 5.4.2 - bundled in GoPractice only

| field | value |
|---|---|
| source / version | npm `ts-fsrs` 5.4.2 (`node_modules/ts-fsrs/package.json`: `"license": "MIT"`; `LICENSE` first lines: "MIT License / Copyright (c) 2026 Open Spaced Repetition") |
| in builds | GoPractice `assets/index-CwDy2gnG.js` contains the FSRS code and default weights (e.g. `0.4072` found); extension and setup page do not (0 hits) |
| attribution required | MIT: the copyright notice and permission text must be included in all copies or substantial portions |
| redistribution / commercial | permitted |
| unresolved | the notice is **not** in the bundle (0 hits for "Copyright", "Permission is hereby", "Open Spaced"), the HTML, or any file next to it. `packages/goreview/src/scheduler/fsrs.ts` comments credit the library in source only |
| review | none (hygiene: add the notice) |

### R8. Other code in the bundles

Searched every runtime import in `packages/**`: only `ts-fsrs` (above) and `vite` (build tool) are non-Node, non-relative.
React, react-dom, react-router-dom and Dexie (the retired app's runtime) have **0** markers in all five JS files.
The `dist-web` and GoPractice bundles contain Vite's small module-preload helper (3 occurrences of `modulepreload`);
Vite is MIT and the helper is a few lines, but it carries no notice either. No fonts (`@font-face` 0; the EB Garamond
question in annex C applies to the retired app only), no images, no external URL in any CSS or HTML. JS contains only the
placeholder `https://repository.example.org`, `http://127.0.0.1` and, in GoPractice, the Commons file-page URL. `config.json`
in each build points to `http://127.0.0.1:8790` (the local service; no hosted service exists).

Build/test-time packages (not in bundles): typescript 6.0.3 (Apache-2.0), vite 8.3.1 (MIT), vite-node 6.0.0, vitest 3.2.7,
jsdom 26.1.0, fake-indexeddb 6.2.5 (Apache-2.0), @vitejs/plugin-react 6.1.1, @types/* - licences read from each
`node_modules/<pkg>/package.json`. `license-checker` is not installed (not run). Annex C reported a 113-package installed
tree with MIT/Apache-2.0/ISC/BSD, two MPL-2.0 (lightningcss, build-time) and no GPL/LGPL/AGPL; I did not re-run that.

### R9. `epubjs` 0.3.93 (BSD-2-Clause) and its dependencies - controlled reader prototype only

`epubjs` is a devDependency used by `packages/controlled-reader/src/reader.ts`; there is no built reader on disk, so
nothing is distributed today. If the prototype is built and shared: BSD-2-Clause requires the copyright notice,
conditions and disclaimer ("Copyright (c) 2013, FuturePress") in binary redistributions (`node_modules/epubjs/license`).
Its dependency tree includes `jszip` 3.10.2 (`(MIT OR GPL-3.0-or-later)`: choose MIT and record that), `localforage`
(Apache-2.0), `lodash`, `@xmldom/xmldom`, `core-js`, `event-emitter`, `marks-pane`, `path-webpack` (MIT) - notices needed
too. The prototype build embeds `test/fixtures/epub/{udha-sample,rtl-sample,protected-sample}.epub` (see R10).
Review: none; **O**: decide whether the prototype is ever shipped.

### R10. EPUB fixtures (`test/fixtures/epub/*`) - test-only, prototype build only

`udha-sample.epub` (three chapters of the owner/AI-drafted controlled Albanian corpus, `data/corpus/sq/udha-1-01..06`,
`owner-authored`/`generated`, "not a published book"), `rtl-sample.epub` (five AI-written Hebrew lines),
`protected-sample.epub` (synthetic DRM-refusal fixture; nothing really encrypted). README states rights per file. The Bible
sample document of the Albanian corpus "is never used". Not in any dist. Review: none beyond AI authorship (Q4).

### R11. Repository service (`packages/repository-service`) and the packages it loads

Own code only. Imports: `node:*` built-ins, the repository contract/store/engine/linguistics packages. No dictionary
or corpus data is read (`repository-linguistics` loads the sq adapter's hand lexicon, no shards). It does store personal
data (account email, scrypt password hash, session token hashes, device ids, event log, enrolments), which is a privacy
rather than a copyright matter. `data/repository/` (SQLite files, written 2026-10-08/09) is git-ignored. Review: **L**
for the terms/licence-to-host-user-content and data-protection duties before any hosted launch (Q6).

### R12. Extension code, popup and setup page text

Own code and own UI text. `dist/manifest.json` permissions: `activeTab`, `scripting`, `storage`, `contextMenus`, `alarms`.
Chrome Web Store developer terms, privacy policy and permission justification are outside this audit. Review: **L** only
for store policy and privacy policy wording.

## 3. Confirmations with evidence

### (a) No retired-corpus file is in any new build - CONFIRMED

* Listing: `ext-dist` 267 files, `dist-web` 262, `gopractice-dist` 262. Outside `dict/sq/` the files are only
  `manifest.json`, `background.js`, `content.js`, `action/popup.{html,js}`, `app/{index.html,app.js,styles.css,config.json}`;
  `index.html`, `assets/*.js`, `assets/*.css`, `config.json` for the two sites. `dict/sq` = 256 shards + `manifest.json` + `frequency.json`.
  No `library/`, `corpus/`, `sources/` directory, no `.epub`, `.usfm`, `.txt`, `.wav`, `.oga`.
* Byte comparison: SHA-256 of every file in the three builds against all 13,817 files under `data/sources`, `data/corpus`
  and `public/library`: **0 matches**. (The root `dist/` directory, 328 MB, is the *old* app and does hold `library/`; it is
  not part of the new product and is git-ignored.)
* Content comparison: all 8-word sequences (lower-cased, punctuation stripped) of the non-dictionary build files (187,674
  distinct) against every prose string in 13,784 retired JSON/TXT/USFM/USX/XML/HTML files: **0 shared sequences**. An earlier
  5-word pass found only boilerplate (HTML/CSS and the stock phrase "drafted by an AI model") which is why 8 was used.
  This does cover the owner/AI corpus too: the bundle's AI-drafted sentences are not copied from it either (the one short
  shared sentence is R5's "Nëna pi çaj", only 4-5 words).
* Exception to state honestly: the frequency list **derives from** the retired library (R2). It contains no text from it.
* Code-level guard: `test/ecosystem/boundaries.test.ts` fails if anything under `packages/` imports the retired
  `course`, `ladder`, `stage0` or `library` modules. There is **no test** that scans a dist folder for retired data; this
  audit's scan was a one-off (script kept only in the session scratchpad).

### (b) No Scripture text is bundled - CONFIRMED

The same 8-word scan includes all of `data/sources/{de-bible,es-bible,hi,th,...}`, the two `*_usfm.zip` bibles' extracted
USFM and the Albanian bible sample: 0 shared sequences. Keyword hits in the JS are only word-list headwords and a type
label: `bibël`, `ungjill`, `psalm` ("Bible", "gospel", "psalm") and `Pavli` ("the form used in Bible translations") in the
Albanian word list, and the string `scripture` in a goal-type enum (`reading, listening, speaking, writing, scripture, ...`).
No Luther/RV1909/IRV/Biblica strings (0). Annex C §3 says the same ("The new extension bundles no Scripture").
Caveat: a learner could still look up Scripture words on any web page they visit; that is learner use of visible text, not distribution.

### (c) The extension never stores page text - CONFIRMED BY CODE AND TESTS (not by a runtime trace)

* Payload rule: `packages/repository-contract/src/payloads.ts` lines 112-113 `noText` rejects `text`, `sentence`,
  `sentenceText`, `passage`, `content`, `body` on every event kind (called first in `validatePayload`, line 150);
  `surfaceOk` caps a stored surface at `MAX_SURFACE_WORDS = 4` / `MAX_SURFACE_CHARS = 120` ("passages are never stored").
  Caveat: `noText` is a denylist of key names; the structural guarantees are the event builder and the tests below.
* `test/extension/store.test.ts`: "never carries the sentence or the page text anywhere in the serialized row" (line 42), "a long selection is a passage: its surface is not stored, only its size" (48), "validates before writing: an invalid row is refused" (84), "keeps other storage keys out of the rows" (121).
* `test/extension/bundle.test.ts`: content script and popup contain no network call (47); content script holds no token, no storage, no service address (54); the background is the only bundle with `fetch` (61); no hard-wired URL (38).
* `test/extension/security.test.ts`: a content script may not sync/enrol/change settings; identity is replaced in the background; the settings default to everything off and "`keepSnippets` is not implemented and stays off however it is asked" (141); `settings.ts` forces `keepSnippets: false`.
* `test/ecosystem/boundaries.test.ts` line 105: an event whose subject carries text is refused.
* Scope note: GoPractice's GoTell screen (`packages/gopractice/screens/tell.ts`) does store the **learner's own typed drafts** (title, body, kind) locally and via the workspace; that is the learner's own writing, not page text, and is a terms/privacy matter (Q6).

### (d) `data/repository/` and `data/private` are git-ignored - CONFIRMED

`git check-ignore -v`: `.gitignore:30: data/repository/`, `.gitignore:6: data/private/`, also `packages/golearn-extension/dist`
(line 2 `dist`), `packages/golearn-extension/dist-web/` (line 31), `packages/gopractice/dist` (line 2), `public/dict/` (9), `public/library/` (11).
`git ls-files data/repository data/private` lists nothing; `git log --all -- data/private data/repository` shows no commit
touching them. `data/repository/` currently holds `repository.sqlite` (+ `-shm`, `-wal`, 0.7 MB) from local runs.
Still tracked and relevant to rights (not in builds): `data/sources` (1,036 files), `data/corpus` (147), `data/review` (132), and a `gh-pages` branch on `origin` (`Rookie2401/go-v0`) that holds the retired library shards per annex C. Untracked at the repo root: `work/`, `work-thai.zip` (invalid zip per annex C), `work-hi-*.txt`.

## 4. Licence notices the builds SHOULD show, and whether they do

| notice | should appear where | does it? (evidence) |
|---|---|---|
| "Wiktionary, via kaikki.org - CC BY-SA 4.0" wherever a dictionary gloss or IPA is shown | word card (extension), setup page Pack screen, GoPractice feedback | **Partly.** Pack screen of the setup page: yes (`app/screens/pack.ts` lines 128-132 print `attribution` and each `licences` row; `bindings.ts` supplies it; also present in `dist/app/app.js` 11x "CC BY-SA"). Word card: only in the "dictionary" row, and only when a hand-list gloss also exists (`card.ts` 337-338; built `content.js` has 0 "CC BY-SA"; the text arrives at run time from the background reply). When the word is not in the hand list, the meaning row (`card.ts` 334) shows dictionary senses **without** the attribution. GoPractice: appended to the explanation only when the reference answer is a dictionary sense (`goreview/src/exercises/shared.ts` 157-159, `attributionLine`); multiple-choice options and any other dictionary-derived text on the question screen carry none (not traced exhaustively). |
| licence **link** (e.g. creativecommons.org/licenses/by-sa/4.0/) and a way to the sources/page history | next to the attribution | **No.** 0 occurrences of `creativecommons` or `wiktionary.org` in any build file. `boundaries` doc §2 requires "with a licence link". |
| statement that the shards are adapted (compacted, truncated) and carry the same licence | Pack screen / a `dict/sq/LICENSE` or NOTICE file | **No.** `manifest.json` carries `licence`/`attribution` fields only. |
| word-list / tutorial / passage "AI-drafted, not checked by a native speaker" | tutorial and card | **Yes.** `tutorial/sq.ts` notice; `parser/index.ts` line 48 text in `content.js`; pack `rights.reviewStatus: machine-drafted`; Pack screen lists the licence rows. |
| "kaikki.org" / "Wiktionary" in the extension popup or the GoPractice front page | about/licences screen | **No.** `action/popup.js` has 0; GoPractice has no about/licences screen (`packages/gopractice/screens/` has none; `index.html` has no footer). |
| ts-fsrs MIT notice ("Copyright (c) 2026 Open Spaced Repetition") | GoPractice licences/about, or `dist/THIRD-PARTY-NOTICES.txt` | **No** (0 hits for the notice or "Open Spaced"). |
| epub.js BSD-2 (and its dependencies) notice | the controlled reader, if shipped | **n/a today** (not built); would be **No**: Vite minification strips banners. |
| Vite helper (MIT) notice | dist-web / GoPractice | **No**; trivial amount of code, but the same fix covers it. |
| Commons clip credit (Beagle Beck, Wikimedia Commons, PD-self) | wherever the clip plays | **Registry string only**; the clip is not shipped so nothing plays. If shipped, the card/player must show it (the registry carries it for that). |
| Azure / Microsoft terms line | wherever a synthetic voice is offered | **n/a** (no route); registry flags "synthetic" and the consent text exists. |
| a LICENSE for the product itself and for the pack text | repo root, each dist | **No.** The repo has no LICENSE file (annex C §7); no dist has one. |

## 5. Questions for a lawyer (flagged, not answered)

* **Q1. Share-alike reach into the hand lexicons.** `lexicon-ladder.ts` (271 + about 160 entries) was checked against, and in places corrected from, Wiktionary; its comments say "Wiktionary's form is used". `disputed.ts` is generated by comparing the course list with Wiktionary tables, UniParser (MIT) and two CC BY-SA 4.0 treebanks. Are those files adaptations of CC BY-SA material (so that they, and the bundle containing them, would have to be offered under CC BY-SA 4.0), or are they independent expression that only used facts (word forms, glosses) from the sources? If adaptations: does the "combined work" in `app.js` pull in the owner's rules/tutorial/code, or is it a mere aggregation with the dictionary shards? What exactly must be marked as a change?
* **Q2. The dictionary shards themselves.** Is a truncated, re-indexed extraction of kaikki data "adapted material" needing a stated licence and change notice; what attribution is enough (collective "Wiktionary contributors" with a link, per-entry page-history links); which Wiktionary text versions (CC BY-SA 4.0 only, or earlier 3.0/GFDL content) are in the `+tables` extract; and does bundling them in a browser-store extension (a store's own terms, possible technical protection) conflict with CC BY-SA 4.0's "no effective technological measures"?
* **Q3. The PD-self Commons clip.** The uploader's own PD-self dedication is the only evidence; authorship is "assumed", the performer was not investigated, no release exists. Is a PD-self statement by a person who may not be the performer enough to redistribute the recording (and a derived WAV) in a commercial product? (Not shipped now; relevant if the clip is ever served at `/demo/de-guten-tag.wav`.)
* **Q4. AI-drafted text ownership.** The Albanian lexicon, rules, tutorial, validation sentences and passage are AI-drafted. Who owns them (the owner? nobody?), can the owner license them to learners or relicense them as CC BY-SA, and what disclosure duties exist for unreviewed language-teaching content sold commercially (accuracy claims)?
* **Q5. The Azure voice terms** (only if a proxy is ever added): permitted use of synthesized output, storage and redistribution, mandatory disclosure of synthetic speech, data retention/region, whether a learner's book passage may be sent, and the owner-subscription model versus end-user keys. The repository cites no Azure terms and has never called the live service.
* **Q6. Hosted service duties.** If the Repository service is hosted: terms of service and licence to store learner drafts/testimony, account and event data protection (email, hashed password, device ids, tokens), retention and deletion rights; the extension's store privacy policy.
* **Q7. Frequency list.** Whether counts derived from share-alike (Wikipedia) and CC BY (Global Voices) texts owe attribution (likely not, but undecided) - or simply rebuild it from owner text (cheaper than asking).
* **Q8 (repo hygiene, not the builds).** The public `gh-pages` branch and git history still hold the retired library shards (annex C: US-only PD works, CC BY-SA units). The owner decision recorded in the boundaries doc §4 is still open.

## 6. Provenance details worth recording

* sq pack versions: pack `version` 9 = `adapter-sq@9`; dictionary `kaikki-sq@2026-09-28` (91,271 entries; 258 files incl. manifest and frequency); frequency `library-sq@2026-10-07` etc.
* Other kaikki shards on disk but not shipped: de 357,750; es 808,278; hi 38,635; th 20,254 entries (all `kaikki-<lang>@2026-09-28`, CC BY-SA 4.0, SHA-256 in each manifest). nb has no dictionary.
* The old-app root `dist/` contains `library/` (retired corpus) and `dict/`; do not zip it as the product.
* This audit did not inspect: the Chrome Web Store listing, any hosted deployment (none exists), git history, the contents of `data/review/**`, or upstream licence pages.

## 7. Cheap engineering fixes (not done: read-only task)

1. Card: show the attribution on the **meaning** row when the meaning is dictionary-only (`card.ts` 334) and add a licence URL to `KAIKKI_ATTRIBUTION`'s rendering (keep the exact-string validator, add a `licenceUrl` field).
2. Add a licences/about screen to GoPractice and a link/section in the popup and the setup page for: kaikki (CC BY-SA 4.0 + adaptation statement), ts-fsrs (MIT text), Vite helper, and, if shipped, epub.js.
3. Emit `dist/THIRD-PARTY-NOTICES.txt` and `dict/sq/NOTICE.txt` in the three vite configs' `closeBundle` plugins; add a repo LICENSE decision.
4. Rebuild `dict/sq/frequency.json` from `data/ladder/sq/units` + `data/corpus/sq` only (the owner-authored sources) and add a test that `frequency.json` `sources` contain no `kind: 'library'`.
5. Add a build test that scans each dist for the retired directories, `.wav/.oga/.epub/.usfm` and the strings `Luther`, `RV1909`, `IRV` (the scan in section 3 can be turned into one).
6. Record the exact kaikki `+tables` download URL and kaikki's licence statement for it in the dictionary manifest `source`.
7. Guard `GOLEARN_APP_DICT` / `GOPRACTICE_DICT`: refuse any language that is not `installable` in the pack registry.


## 8. Distribution scan 2026-10-09

Follow-up to section 3: the one-off scan of section 3(a) is now a test, `test/audit/rights.dist.test.ts` (26 tests, about 7 s),
and it was run against freshly built folders. Facts only; nothing here is a statement about legal status. Companion records:
`ARCHITECTURE-CONFORMANCE.md` (what the code can reach) and `LEGACY-SALVAGE.md` (what becomes of the old tree).

### 8.1 Builds made for the scan (gitignored output only)

| command | cold / warm time | output |
|---|---|---|
| `npm run ext:build` (content, background, action) | 4.3 s / 1.7 s | `packages/golearn-extension/dist/` |
| `npx vite build -c packages/golearn-extension/app/vite.config.ts --mode options` | 3.9 s / 2.0 s | `packages/golearn-extension/dist/app/` |
| `npx vite build -c packages/golearn-extension/app/vite.config.ts --mode web` | 4.2 s / 1.6 s | `packages/golearn-extension/dist-web/` |
| `npx vite build -c packages/gopractice/vite.config.ts` | 4.4 s / 1.5 s | `packages/gopractice/dist/` |

Sizes after the second (warm) round, bytes on disk by `find -printf %s`:

| folder | files | bytes | of which `dict/sq` | main scripts |
|---|---|---|---|---|
| `packages/golearn-extension/dist` | 267 | 7,690,353 (7.33 MiB) | 6,113,784 (257 files) | `app/app.js` 586,513; `background.js` 496,425; `content.js` 464,384; `action/popup.js` 15,999 |
| `packages/golearn-extension/dist-web` | 262 | 6,709,771 (6.40 MiB) | 6,113,784 | `assets/index-*.js` 587,167 |
| `packages/gopractice/dist` | 262 | 6,957,894 (6.64 MiB) | 6,113,784 | `assets/index-*.js` 835,244 |

A sibling session rebuilt `packages/gopractice/dist` at 09:30 (new hashed file name); the scan reads whatever is on disk.
Without the three folders the test skips each check with the build command in its title and skip note.

### 8.2 What the scan compares

* **Fingerprints of the retired text** (780,382 windows of 40 normalised characters: NFC, lower-cased, everything that is not a
  letter, digit or combining mark removed; aligned windows, so any copied run of 79 characters, about 12 words, in the original's
  order contains one whole window; a sentence or verse of at least 40 characters is also fingerprinted by its first and last
  window): every string of every `data/corpus` (147 files), `data/ladder` (730) and `data/stage0` (170) file; every verse of the four
  verified Bibles in `data/verified/scripture.json` (124,377 verses: Reina-Valera 1909, Lutherbibel 1912, Hindi IRV, Biblica Open
  Thai) and each book as one run; a stride sample of `public/library` (every 61st `.json/.txt/.md` file up to 6 MB) and `data/sources`
  (every 5th); licence-name strings and links are left out. Plus 156 distinct titles and authors of catalogued works (every entry and
  every withheld entry of `data/sources/course-library/*.json`, and the two `src/course/*-works.json` catalogues) of at least 14
  (title) or 10 (author) normalised characters.
* **Every text file of each folder** (all `.js .css .html .json .md`, including the 257 dictionary files) is normalised the same way
  and rolled over with a hash; each hash hit is confirmed by exact comparison.
* A positive control plants a corpus window, a verse window and a title in a fake page and requires the scanner to find each.

### 8.3 Results (3 folders, all checks)

| check | extension `dist` | `dist-web` | GoPractice `dist` |
|---|---|---|---|
| no `frequency.json` and no file name containing "freq" | pass (none) | pass | pass |
| only text web-build kinds: no `.epub .usfm .wav .oga .mp3 .zip .gz .map .sqlite .jsonl .pdf`; no directory named library / corpus / sources / ladder / stage0 / scripture / bible / audio / texts / books | pass | pass | pass |
| dictionary language dirs | `sq` only | `sq` only | `sq` only |
| text files compared | 267 | 262 | 262 |
| windows shared with the corpus, library sample, sources sample, any Bible, or any catalogued title/author | **0** | **0** | **0** |
| windows shared with owner-authored Stage 0 / ladder material (examined, below) | 3 | 2 | 2 |
| `THIRD-PARTY-NOTICES.md` | at `dist/app/THIRD-PARTY-NOTICES.md` (not at `dist/` root) | at root | at root |
| notices mention kaikki.org, Wiktionary, `creativecommons.org/licenses/by-sa/4.0`, ts-fsrs | yes | yes | yes |
| notices equal the repository's root file | SHA-256 `d996be76...dd88`, identical in all three and to the root file | | |
| `dict/sq/manifest.json` attribution equals `Wiktionary, via kaikki.org — CC BY-SA 4.0`, licence names CC BY-SA 4.0 and kaikki.org, 256 shards present, source URL `https://kaikki.org/...` | pass | pass | pass |
| the attribution string is in the built application code | in `app/app.js`; not in `content.js` or `background.js` (the card receives it from the worker at run time) | in `assets/index-*.js` | in `assets/index-*.js` |

Every one of the 256 shards of `dict/sq` contains Wiktionary-derived text by design; the scan found no Scripture, corpus or
catalogued-title text inside them.

**Examined overlaps (not third-party literary text).** Two 40-character windows are shared with the retired curriculum's own
owner-authored material, each looked at by hand and recorded in the test (`EXAMINED_OVERLAPS`); a new overlap fails the test:

1. `aleminderitisfaleminderitandtwovowelswri` (normalised) in `app.js`, `background.js`, the `dist-web` script and the GoPractice script, shared with
   `data/stage0/sq/sounds/sq-snd1.json`: a pronunciation explanation sentence that the retired Stage 0 sound pack and the new Albanian
   tutorial (`packages/language-packs/src/tutorial/sq.ts`) both contain (the shared run is at least 49 normalised characters; one shared phrase is "at the end
   of a word it is often hardly said"). Both are owner-authored, machine-drafted English text (annex C; R5).
   Fact for the register: the new tutorial carries text that also exists in a retired, git-tracked data file.
2. `efinitenominativesingularandindefiniteno` in dictionary shard `s-94.json` (all three), shared with `data/ladder/sq/PLAN-A1-2-A2.md`:
   the grammar label "definite nominative singular and indefinite nominative plural". Generic terminology in a Wiktionary shard and in
   an owner planning note; no running text.

### 8.4 Observations from the scan

* **D-01.** The extension's `dist/` root carries no notice file; the notice is in `dist/app/`, reachable from the installed extension
  as `app/THIRD-PARTY-NOTICES.md`. A store package built from `dist/` therefore has it only inside `app/`.
  **Fixed 2026-10-09:** `packages/golearn-extension/vite.config.ts` now copies the notice to the `dist/` root as well (rebuilt and re-scanned: 26/26).
* **D-02.** `dict/sq/manifest.json` still declares `"hasFrequency": true` while `frequency.json` is no longer shipped. The sharded
  loader (`src/dict/sharded.ts`, around lines 142-164) then requests the sidecar once and treats a failure as "no frequency";
  on a static host that answers unknown paths with `index.html` the response would not parse as a frequency table and is treated as unusable. No licence consequence; a manifest/ship mismatch.
  **Fixed 2026-10-09:** both copy hooks rewrite the shipped `manifest.json` with `hasFrequency: false` (the source manifest under `public/` is unchanged).
* **D-03. Changes since sections 0-7 of this audit (same day).** Finding 1 (R2): the three folders no longer contain `frequency.json`
  (both vite configs filter it out in the copy step), so the quarantine decision now holds in the builds. Finding 3 (notices): all
  three folders now carry `THIRD-PARTY-NOTICES.md` with the kaikki/CC BY-SA 4.0 attribution, the licence link and the ts-fsrs entry
  (the file also lists epub.js for the controlled-reader prototype and the German Commons clip as not shipped). Not re-checked here:
  Finding 2 (attribution on the word card's meaning row), the in-app licence link, a repository LICENSE.
* **D-04. Limits of the scan.** It sees text files only and names no binary; it samples (not exhaustively reads) `public/library` and
  `data/sources`, so a short quotation of an unsampled library text would not be found, and copied runs shorter than about 12 words
  are not detectable by construction; it cannot see what a learner pastes into a page; it compares strings, it does not establish
  where text came from.
* The earlier scan used 8-word sequences over 13,784 files with the same outcome (0 shared sequences); this scan is cheaper to repeat
  and adds the four-Bible fingerprints and the title/author lists.

Reproduce: build the four commands above, then `npx vitest run test/audit/rights.dist.test.ts`.

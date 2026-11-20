# Russian pack: audit of the current architecture (2026-11-17)

What the repository really does for a language today, read from origin/master `985c742b`, and so what `ru` must add. `EXT` = `packages/golearn-extension`, `LP` = `packages/language-packs/src`.

## 1. How a word reaches the card (extension)

1. `EXT/src/content/controller.ts` `lookup()` resolves the page language, loads the analyser chunk (`analysers/<id>.js`), runs `prepareLexicon` (`EXT/src/lexicon/prepare.ts`; today only the sharded he/el indexes), then `parseSelection` synchronously.
2. `EXT/src/parser/index.ts`: `adapter.tokenize` + `adapter.analyze`. The highest-confidence candidate gives the lemma, part of speech and gloss. Item id: `lemma:<lang>:<lemma>[:POS]` when confidence ≥ 0.5 (`LEMMA_MIN_CONFIDENCE`), else `form:<lang>:<adapter.normalize(surface)>`.
3. **The lemma shown on the card comes from the adapter's synchronous `analyze` only.** The dictionary's form index is not consulted for a card. So the Russian analyser must hold the word in memory before `analyze` runs: a compiled core plus on-demand shards, as Hebrew and Greek do.
4. The English meaning comes from the kaikki dictionary shards (`dict/<lang>/`), fetched lazily by the background worker (`EXT/src/background/gloss.ts` → `LP/runtime.ts` `gloss`): the first given form with senses of its own, else one `formOf` hop to the headword. Bases tried in order: the configured service, the extension's own `app/`, the hosted copy `https://rookie2401.github.io/go-v0/`.
5. The background worker has only Albanian linked in, so `runtime.gloss` normalises a form with NFC + lower case, while dictionary shard keys are built with the language's `adapter.normalize` (`src/dict/build-node.ts`, `src/dict/adapter-normalize-node.ts`). **`ru.normalize` must therefore agree with "NFC + lower case" on ordinary text**, and stress marks must be folded on both sides.
6. GoLearn Active (`EXT/src/active/scan.ts`, `EXT/src/content/active.ts`): tokenises and analyses each text node with the adapter; ids as above; `dict/<lang>/forms` (via `EXT/src/background/forms.ts`) only confirms tokens the analyser did not know. The six levels (`EXT/src/active/levels.ts`) have no per-language code.

## 2. Files to change for `ru`: extension

- `EXT/src/analysers/ru.ts` (new): `export { ruAdapter as adapter } from '../../../../src/adapters/ru'`.
- `EXT/vite.config.ts` `ANALYSER_IDS`; `EXT/src/analysers/loaders.ts` `IMPORTS`.
- `EXT/src/parser/registry.ts` `LANGUAGE_META.ru` (`pageTag: /^ru(-|$)/`).
- `EXT/src/parser/index.ts` `SCRIPT_TEST`: add `Cyrl` (else every Russian word is "not in Latin script").
- `EXT/src/language/resolve.ts`: `PRIMARY` (`ru`, `rus`), `PACK_SCRIPT` (`ru: 'cyrl'`), `PACK_VARIETIES` (must equal the manifest's varieties), `scriptShare` gains `cyrillic`, a Cyrillic branch in `detect()` with a word-list share and negative evidence from the letters of Ukrainian (ї є ґ і), Belarusian (ў і), Serbian/Macedonian (ј љ њ ћ ђ џ ѓ ќ ѕ), and Bulgarian (no ы э ё). `uk be bg sr mk` stay out of `PRIMARY` (declared non-pack) or go to `NOT_THE_PACK`.
- `EXT/src/active/pageLanguages.ts`: `SCRIPT_RE.Cyrl`, `LANGUAGE_SCRIPT.ru` (both, or `wordInScript` throws); Cyrillic is shared by several languages, so it cannot go in `SCRIPT_LANGUAGE`: a Cyrillic per-block path beside the Latin one, and the same in `EXT/src/content/active.ts` (page-language sample).
- `EXT/src/lexicon/prepare.ts` and the build's `copyStatic` (today `public/lexicon/el|he`): the Russian shards.
- `EXT/src/protocol.ts` `LANGUAGE_NAMES`; `EXT/src/content/voiceTags.ts`; `EXT/src/background/speech.ts` language whitelist; `EXT/app/screens/audio.ts` `VOICE_LANGUAGES`.
- Optional: `EXT/src/translation/models.ts`.
- `EXT/manifest.json`: no change (`analysers/*.js`, `lexicon/*` are globs).

## 3. Files to change for `ru`: packs, core, audio

- `src/core/model.ts`: `LanguageCode`, `LANGUAGES`, `Script` gains `'Cyrl'`. `src/core/config.ts`: `LANGUAGE_ROWS`, `COURSES`.
- `src/adapters/ru.ts` + `src/adapters/russian/**` (new); `src/adapters/index.ts`.
- `LP/packs/ru.ts` (new, `experimentalManifest`), `LP/registry.ts`, `LP/builtins.ts`, `LP/catalogue.ts` (`SPECS`, `SCRIPT_NAME.Cyrl`), `LP/tutorial/ru.ts` + `LP/tutorial/index.ts`, `LP/index.ts`.
- The manifest's `dictionary: { id, entries, frequency }` must equal `public/dict/ru/manifest.json` or `installPack` fails with `dictionary-mismatch`.
- GoListen: `packages/golisten/src/deviceTags.ts` (`RUSSIAN_DEVICE_TAGS = ['ru-RU','ru']`), `registry.ts`, `providers/device.ts` (variety alias list).
- `packages/repository-linguistics/src/resolver.ts` covers arc/sq/es/hi only; other languages get one provisional form unit. `ru` needs nothing there (and no worker stub) unless it is added.

## 4. Tests and ceilings that pin the language list

- `test/extension/bundle.test.ts`: `content.js` ≤ 564 KB, `background.js` ≤ 1,190 KB (measured 1,181.2 KB: about 9 KB of room, and every pack manifest and tutorial lands in the worker), `app/app.js` ≤ 840 KB; add an `adapter-ru@` leak check.
- `test/extension/analysers.loading.test.ts` (exact `PARSER_LANGUAGES`), `test/language-packs/{registry,catalogue,capabilities,tutorial-orientations}.test.ts`, `test/multilang/extension.test.ts`, `test/reader-languages/*`, `test/audit/listen.voices.test.ts`, `test/audit/conformance.imports.test.ts`.

## 5. Source data (checked 2026-11-17)

| Source | Use | Licence | Kept where |
|---|---|---|---|
| kaikki.org Russian Wiktionary extract, `kaikki.org-dictionary-Russian.jsonl.gz`, last modified 2026-10-30, 90,794,686 bytes, sha256 `86a781a5685d614efd439e326eed0bf0ad9cda9f67b854f8b6c93212c5345b3e` | dictionary shards, form index, stress, IPA, aspect partners | CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org) | `data/dictionaries/` (git-ignored) |
| UD Russian-GSD (commit 71b92ce4), train/dev/test | held-out evaluation; train may give reading priors | CC BY-SA 4.0 | `data/raw/ud-ru/` (git-ignored) |
| UD Russian-Taiga (445ea57e), dev/test | held-out evaluation | CC BY-SA 4.0 | same |
| UD Russian-PUD (0e7758a9), test | held-out evaluation | CC BY-SA 3.0 | same |
| UD Russian-SynTagRus | **not used**: CC BY-NC-SA 4.0 (non-commercial) | | not downloaded |

The extract holds 443,260 entries: about 60,000 lemma entries and 383,006 inflected-form pages; tables for about 28,500 nouns, 13,300 verbs (with participles and adverbial participles) and 10,300 adjectives; stress (U+0301) on every form; IPA on 439,893 entries; each verb's aspect and its named partner(s) in the head line; gender and animacy on nouns.

## 6. The dictionary pipeline (kaikki → `public/dict/ru`)

Commands, in order (each needs `ru` in `LANGUAGES` and an adapter with `normalize`):

1. Gunzip the extract: `dict:build` reads plain `.jsonl` only (`dict:build-full` reads `.gz`).
2. `npm run dict:build -- --in data/dictionaries/kaikki.org-dictionary-Russian.jsonl --lang ru --out public/dict --source-url https://kaikki.org/dictionary/Russian/kaikki.org-dictionary-Russian.jsonl.gz --last-modified 2026-10-30 --retrieved 2026-11-17` → `manifest.json` + `s-<hex>.json` (schema 3). The id is `kaikki-ru@<last-modified>`; the pack must declare that id and the manifest's `entries` exactly.
3. `npm run dict:build-full -- ru --last-modified 2026-10-30` → `full/` (the Level-2 records with the inflection tables; lines with only form-of senses are skipped).
4. `npm run dict:build-forms -- --langs ru` → `forms/` (form → `[lemma, pos]`, at most 6 rows; GoLearn Active's confirmation).
5. `npm run dict:build-reverse -- --langs ru` → `reverse/` (English → Russian).
6. `npm run dict:status -- --require ru`.

Per-language switches to extend: `loadAdapterNormalizer` (`src/dict/adapter-normalize-node.ts`), `KAIKKI_LANGUAGE_NAMES` (`src/dict/build-full.ts`), `ROMANIZATION_LANGS` (`src/dict/full-format.ts`), `GRAMMATICAL_TAGS` in `src/dict/forms.ts` (lacks `instrumental`, `prepositional`, `short-form`, `imperfective`, `active`: a row tagged only "instrumental" would be dropped from the forms index), and the `GOREVIEW_DICT` lists in `packages/goreview/app/vite.config.ts` and `scripts/goreview-release.mjs` (`test/goreview-app/dict-list.test.ts` compares both with the packs that declare a dictionary).

Facts about the Russian extract that decide the design:

- Headwords (`word`) are unstressed; `form_of.word` and `forms[].form` are stressed (кни́га, кни́ги). **`normalize` must strip U+0301 and U+0300 and nothing else** (й and ё must survive: strip the two marks in NFD, recompose to NFC), or nearly every form → lemma link misses its headword.
- ё is kept by Wiktionary (16,753 headwords). Not folded in the key (все and всё are different words); a text printed without ё reaches ё-words through a fallback lookup and `lemmaVariants`, and the reading says the ё was restored.
- `mergeParadigm` (`src/core/paradigm.ts`) compares forms by strict NFC equality, and `full/` rows keep their stress marks. A generated cell must therefore carry the same stressed spelling as the dictionary row, or the Russian adapter generates no cells and lets the dictionary's table stand alone.
- The card's "All forms" table is built by `buildParadigm` in `packages/golearn-extension/src/content/enrich.ts` and its byte-for-byte mirror `packages/goreview/src/facts/paradigm-table.ts` (a test compares them): `full/` rows → `adapter.featuresFromTableTags(tags, pos, form)` → cells; `adapter.cellsFor` marks the selected form.

Sizes of the existing sets, for scale: de 204 MB in 2,757 files (40.8 MB shards, 19.4 MB forms, 139 MB full), la 174 MB, hi 59 MB, nb 6.7 MB. Russian is expected near German.

Hosting: GitHub Pages `gh-pages` of Rookie2401/go-v0 (`https://rookie2401.github.io/go-v0/dict/<lang>/`), published with `npm run dict:publish -- --dest <gh-pages checkout>/dict --langs ru` by the release manager on the owner's yes. `installPack` (`packages/language-packs/src/runtime.ts`) checks `lang`, `entries` and `id` of the hosted manifest against the pack.

Licence plumbing already there: `KAIKKI_ATTRIBUTION` / `KAIKKI_LICENCE` in every manifest (enforced by `validateManifest`), the pack's `rights.licences` and provenance (built by `plannedManifest`), `THIRD-PARTY-NOTICES.md` (shown as the Licences screen). The notices file lists the Albanian dictionary in full and not the German, Spanish, Hindi, Norwegian, Hebrew or Latin ones (a gap that is not Russian's to fix); Russian adds its own entry on the Albanian model.

## 7. Registration outside the extension

The Aramaic commit `044190fb` (33 files) is the closest precedent for a new language.

Core:
- `src/core/model.ts`: `LanguageCode`, `LANGUAGES` (order matters), `Script` gains `'Cyrl'`.
- `src/core/config.ts`: `LANGUAGE_ROWS` row (`script: 'Cyrl'`, `whitespaceDelimited: true`) and a `COURSES` entry (`courseForLang` returns `!`: a language without a course crashes ingest).
- Every `Record<LanguageCode, …>`: `src/adapters/index.ts`, `src/course/bibleAccess.ts`, `src/course/curriculumPolicy.ts` (and its script ternary), `src/golisten/azureProvider.ts`, `src/golisten/fixtureProvider.ts`, `src/gotell/concepts.ts` (4 tables), `src/gotell/productive/goals.ts`, `src/gotell/productive/practice.ts`, `src/gotell/provider.ts` (2), `src/ingest/quality.ts` (`EXPECTED_SCRIPT`), `src/stage0/lang/{types,index}.ts` (a `Stage0LanguageConfig`; script kind `'cyrillic'`), `packages/gotell/src/salvage/concepts.ts` (4). Test-side: `test/golearn/testAdapters.ts`, `test/golisten/{resume.test,support}.ts`, `test/ingest/ingest.test.ts`, `test/integration/compat.test.ts`.
- `packages/repository-linguistics/src/packs.ts` `PACK_LEVEL`: `ru: 'experimental'`.

Repository:
- Unit ids are language-scoped and independent of variety: `lemma:ru:<lemma>[:POS]`, `form:ru:<normalized surface>`, `phrase:ru:<tok_tok>`, `class:ru-alphabet:<key>`.
- A single-variety language declares nothing in `varieties.ts`; its one variety lives in the pack manifest, the course's variety policy and the adapter's optional `varieties` map. `test/varieties/contract.test.ts` lists the languages without learning varieties: add `ru`.
- The server-side resolver (`packages/repository-linguistics/src/resolver.ts`) is specific to arc/sq/es/hi; on the device any language resolves through its adapter. No edit needed.

GoReview:
- `packages/goreview/app/leanBuiltins.ts` `LOADERS.ru`; `packages/language-packs/src/builtins.ts`.
- `packFacts.ts`: facts are given for any installable pack; `ATTESTED` (he, el) is NOT for Russian (it uses the merged analyser + dictionary path).
- `homePhotos.ts`: every pack needs a `.webp` photo with a commons.wikimedia.org source and a Creative Commons licence URL (`test/goreview-app/home.test.ts`), credited in `THIRD-PARTY-NOTICES.md`.
- `alphabetLetters.ts` `HAND_LETTERS.ru` + `alphabetDeck.ts` notes: `test/goreview-app/alphabet-deck.test.ts` requires an alphabet deck for every pack (a count table with no fallback).
- `GOREVIEW_DICT` default list in `app/vite.config.ts` and `scripts/goreview-release.mjs`.
- A review card gets gloss, lemma, morphology and the table when: the adapter's `support.lemmatization` and `morphology` are not 'none', the manifest lists the `lemma` and `morphology` capabilities, a dictionary is declared, and the adapter has `featuresFromTableTags` (and/or `paradigm`).

Alphabet:
- On master: GoReview's Alphabet deck (`packages/goreview/app/alphabetDeck.ts`): unit `class:<lang>-alphabet:<glyph>`, card `card:written-recognition:<unitId>`, rows `[glyph, back]` (back ≤ 140 characters).
- Branch `feat/alphabet-sprint` (PR #16, another session's, landing in the release batch ahead of Russian): `packages/language-packs/src/alphabet-sprint/`; a language declares a `ScriptProfile` in `profiles/<lang>.ts` (units with key/kind/display/sound/example/note/familiar/difficulty, `firstBatch`, `laterBatch`, `confusions`, `dependencies(form)`, notes), a GENERATED `words/<lang>.ts` (from `scripts/alphabet-sprint/<lang>.mts`, at least 40 words, weights by frequency), `test/alphabet/sprint-<lang>.test.ts` (`profileChecks` from `test/alphabet/sprint-kit.ts`), `SPRINT_LANGUAGES` + `LOADERS` in `profiles/index.ts`. Ids: `class:<lang>-alphabet:<key>` for characters, `-rule`, `-word`, `-phrase`, `-contrast:<a>|<b>` for the other kinds. Knowledge is computed from `CardReviewed` events. Its design doc says Cyrillic is "Not supported: no pack exists". **The Russian Alphabet Sprint is written against this once it is on master.**

Tutorial: `packages/language-packs/src/tutorial/ru.ts` (`orientation(spec)`, as `tutorial/hi.ts`), registered in `tutorial/index.ts` in `PACKS` order; minutes on the manifest equal the sum of the steps.

Pack manifest (`experimentalManifest`): `version` equals the adapter's; at least 12 validation cases, each as the analyser really reads it (`status` by `statusOf` in `analysis.ts`: 'high-confidence' = not a rule or unconfirmed reading, confidence ≥ 0.85, no other reading within 0.15; 'conflicted' = another reading with a different lemma, part of speech or features within 0.15 of the top; else 'provisional'); `readings: 'none'` for a word that must get nothing.

Adapter rules the tests enforce (`test/adapters/verification.test.ts`, `registry.test.ts`): `version` matches `/^\d+$/`; all six support levels stated; at least 3 limitations of more than 20 characters; `lemmatization === 'seed-only'` with a limitation matching `/seed-only|seed corpus|bundled corpus/`; nothing 'dependable' beyond tokenization; `showBoundariesOnHighlight` false. (`capabilities.ts` raises lemma quality to 'limited' when `evidence.ts` lists a lemma source, and to 'dependable' only with a human treebank accuracy of at least 95 % over at least 10,000 words.)

Tests that pin the language list (each needs `ru` or an exemption as `arc` has): `test/adapters/{registry,verification,offsets,speech}.test.ts`, `test/ingest/{spans,ingest,origins}.test.ts` (a bundled corpus: `story-01`, more than 150 tokens, or exempt), `test/integration/compat.test.ts`, `test/core/readsLangs.test.ts`, `test/gotell/units.test.ts`, `test/stage0/gates.test.ts`, `test/language-packs/{registry,catalogue,capabilities,tutorial-orientations}.test.ts`, `test/loading/goreview.startup.test.ts` + golden (re-record with `GOREVIEW_RECORD=1`), `test/extension/{analysers.loading,status.chosen,bundle}.test.ts`, `test/multilang/extension.test.ts`, `test/reader-languages/{experimental-packs,resolve}.test.ts`, `test/golearn-app/bindings.test.ts`, `test/audit/{conformance.support,conformance.imports.test,listen.voices.test}.ts` (`SALVAGE_ALLOW_LIST` gains `src/adapters/ru.ts` and `src/adapters/russian/`), `test/support/analysers.ts`, `test/varieties/contract.test.ts`, `test/goreview-app/{alphabet-deck,home,design-snapshots,dict-list,language-choices-mirror}.test.ts`.

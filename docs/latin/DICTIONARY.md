# Latin dictionary (`la`)

Status: 2026-10-17. Schema-3 shards and `full-2` records of Latin, built from the kaikki.org Latin extract (Wiktionary, CC BY-SA 4.0) the
same way as the other five languages. Counts and bytes: `docs/ecosystem/linguistics/SOURCE-INVENTORY.md` ("Latin `la`").

## Source

`kaikki-la.jsonl` (1,219,776,083 bytes, 892,320 lines, sha256 22ba74c8c8a0fb3503b28dcb37fbd94a89b82e64767c7935ff383fa7bbdf7c07), the file the
Romance project (`C:\Users\CJWal\dev\romance-v0\data\dict\`) streamed from `https://kaikki.org/dictionary/Latin/kaikki.org-dictionary-Latin.jsonl`.
Nothing was downloaded for this build. The file is not copied into this repository (it is large and the other projects own it): pass `--in`.

## Build

```
npm run dict:build -- --in <kaikki-la.jsonl> --lang la --out public/dict --retrieved 2026-09-22 --source-url https://kaikki.org/dictionary/Latin/kaikki.org-dictionary-Latin.jsonl
npm run dict:build-full -- la --in <kaikki-la.jsonl> --source-url https://kaikki.org/dictionary/Latin/kaikki.org-dictionary-Latin.jsonl
```

Output: `public/dict/la/manifest.json` + `s-xxx.json` (schema 3), `public/dict/la/full/manifest.json` + `f-xxx.json` (`full-2`, plain; add
`--schema full-1` for `full-1`). `public/dict/` is git-ignored. Each takes about 20 s and under 800 MB.

## The key rule (`src/dict/latin-normalize.ts`)

Pure and browser-safe; the Latin adapter imports it from there without the core index.

| function | what it does |
|---|---|
| `latinNormalize(s)` | NFD, drop every combining mark (macron, breve, acute, diaeresis), lower-case, `æ` to `ae`, `œ` to `oe`, long s to s, NFC, spaces collapsed. **`j`, `v`, `u`, `i` are kept**: `verbō` is `verbo`, `Iēsūs` is `iesus`, `Jesus` is `jesus`, `Æneās` is `aeneas`. Every shard key and every full-record key goes through it |
| `latinVariantKeys(key)` | the other spellings editions print: every `v` as `u` (`uerbum`), a consonantal `i` as `j` (`ejus`, `justus`, `Joannes`, `adjuvo`, `injuria`), both. The consonantal-`i` rule is generous on purpose (word start, after a vowel, after a verb prefix): a spare key costs nothing, a missing one is a miss |
| `latinLookupKeys(surface)` | the keys to ask for, most likely first, at most 6: the normalized surface, then `j` read as `i`, then a consonantal `u` read as `v` (`uerbum` to `verbum`, `iuuenis` to `iuvenis`, `uiuus` to `vivus`; never `qu`) |
| `latinSkeleton(s)` | `j` as `i`, `v` as `u` on top of `latinNormalize`: one skeleton for every printing of a word; for comparing, not for lookup |

## Spelling-variant entries

For every mapped entry the build adds the small form-of entries `latinVariantKeys` names (166,685 of them; `src/dict/latin.ts`). An alias has no
gloss and no pronunciation, only the relation: an inflected form copies its relations (so `uerbo` says "dative/ablative singular of
verbum" directly, one hop), a headword is named as the lemma with the labels `alt-of` and `orthographic-variant`. Entries the source already
marks `alt-of` get no alias. Wiktionary has its own `alt-of` pages for some variants (`jam`, `justus`, `uerbum`); those stay as they are and
answer with their own senses, beside the alias. The hook is `BuilderOptions.aliasesOf` (default: Latin's for `la`, none for others); the
in-memory and the streaming builder give the same bytes (tested).

## What is mapped

- **Part of speech**: `noun` NOUN, `name` PROPN, `verb` VERB, `adj` ADJ, `adv` ADV, `pron` PRON, `det`/`article` DET, `prep`/`postp` ADP, `conj`
  CONJ (the parser's vocabulary has no CCONJ/SCONJ split for Latin; `CONJ` it is), `particle` PART, `num` NUM, `intj` INTJ; `suffix`, `prefix`,
  `phrase`, `proverb` are X with a `role`. Anything else stays unmapped, as everywhere.
- **Inflected forms** (683,069 `verb` lines are mostly participle and finite-form pages): schema 3 keeps them as form-of entries with the
  source's labels; the full records skip them (the lemma's own table has the forms).
- **Tables**: `forms` rows with `source` `declension` / `conjugation` are the `f` rows of the full record, tags sorted, `s` set (the verbum
  record has `{f:'verbō', t:['ablative','singular'], s:'declension'}`; amo has 199 rows with active/passive, indicative/subjunctive/imperative,
  participle, gerund, supine). Table noise (`table-tags`, `inflection-template`) goes to `tpl` or is dropped. Cap 400 rows (one verb of 550
  is cut).
- **Etymology**: `etymology_text` and the templates `inh`, `bor`, `der`, `cog`, `af` and the rest of `ETYMOLOGY_TEMPLATES` (Proto-Italic
  `itc-pro`, Proto-Indo-European `ine-pro`, Ancient Greek `grc` ...). The `sl` (semantic loan) and `etymon` templates are not in the schema's list
  (the text carries them).
- **IPA**: every row, tags verbatim. Classical rows carry `Classical-Latin`; the Ecclesiastical rows have no tag in the source, only the note
  "modern Italianate Ecclesiastical", which the mapper makes a verbatim tag (`src/dict/map.ts` `soundsWithNotes`). The schema-3 short `ipa` of an entry
  is the Classical reading. No audio: the extract has no audio rows.
- **Etymology number**: the extract writes it as a string; for Latin a digit string counts (so `caelum` 1 "heaven" and `caelum` 2 "chisel" stay two
  entries). Other languages are unchanged.

## Caps

All the schema's caps apply unchanged (senses 12, examples per sense 2, forms 400, IPA 10, audio 6, hyphenations 6, etymology 600 characters and
20 templates, related 30; schema 3: 6 glosses).

## Tests

`test/dict/latin.test.ts` (normalization, variants, mapped real lines `test/dict/fixtures/kaikki-la-sample.jsonl`, the verbum table, streaming = in-memory,
full shards read back), `test/dict/latin-runtime.test.ts` (`createPackRuntime`: gloss and entry of verbum, a variant reaching its headword; skipped
when `public/dict/la` is not built).

## Known gaps

- The consonantal-`u` reading in `latinLookupKeys` is a heuristic (a run like `uu` is read by what follows it); the dictionary side has no such
  guess (`v` is `v`).
- Texts printed with `v` for every u (`VERBVM`, `vt`, `VOLVNTAS`): covered since 2026-10-25. `latinLookupKeys` adds, after the other keys, the spelling with every v read as u and the consonantal ones read back as v (`verbum`, `ut`, `voluntas`), so an all-capital inscription or an early print finds its entry. Still at most 6 keys.
- Dump date unknown (see the inventory); the build date stands in for it in the dictionary id.

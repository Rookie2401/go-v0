# Lexical schemas (GoLearn Linguistic Engine V2, Stage 2)

Status: 2026-10-10. Code: `src/dict/format.ts` (schema 3), `src/dict/full-format.ts` + `src/dict/full.ts` + `src/dict/build-full.ts`
(schema `full-1`), `packages/language-packs/src/runtime.ts` (`gloss`, `entry`). Inventory of the sources and the counts:
`SOURCE-INVENTORY.md`.

The engine reads the same Wiktionary data (kaikki.org / Wiktextract JSON Lines) at two levels, built from the same file by two
builders into two parallel shard sets:

| | Level 1: schema 3 | Level 2: `full-1` |
|---|---|---|
| purpose | fast lookup of every surface form: lemma, part of speech, short gloss, form-of relation | everything a card or a paradigm view can show about a lemma |
| built by | `npm run dict:build` (`src/dict/build.ts`, `build-node.ts`) | `npm run dict:build-full -- <lang> [--limit N]` (`src/dict/build-full.ts`) |
| files | `public/dict/<lang>/manifest.json`, `s-<hh>.json` | `public/dict/<lang>/full/manifest.json`, `f-<hh>.json` |
| keyed by | the form (every inflected form is its own entry) | the lemma only (inflected-form lines carry no senses and are skipped) |
| read by | `createFetchLexiconSource` (`LexiconSource`) | `createFullRecordSource` (`FullRecordSource`) |
| runtime method | `PackRuntime.gloss()` | `PackRuntime.entry()` |

Both are keyed by the language adapter's `normalize(word)` (the same normalizer), placed in a shard by
`bucketOf(key, buckets)` (FNV-1a modulo the bucket count, a multiple of 256 chosen per language), and read lazily: one manifest, then
only the shard a lookup needs. Every field read back from disk is untrusted: a bad record is dropped, a bad manifest or shard
reads as absent, nothing throws.

## 1. Schema 3 (Level 1), in brief

Documented in the header of `src/dict/format.ts`. Entries carry `p` part of speech, `g` glosses (left out when the senses say the
same), `s` senses (gloss, tags, topics, number of examples), `n` pronunciations (respelling, IPA, romanization, tags), `y`
etymology number, `a` alt-of headwords, `m` form-of relations (`[lemma, labelSetIndex]`; the label lists are in the manifest's
`labelSets`), and for some languages `w` the headword as written. It deliberately drops, to stay small: the inflection tables,
the etymology text and templates, audio, hyphenation and the related-word lists. `full-1` keeps exactly those.

## 2. Schema `full-1` (Level 2)

### 2.1 Files

```
public/dict/<lang>/full/manifest.json
public/dict/<lang>/full/f-<hh>.json        { [lemmaKey]: FullRecord[] }   hh = hex of bucketOf(lemmaKey, buckets), 2 to 4 digits
```

Manifest:

```jsonc
{
  "schema": "full-1",
  "lang": "sq",
  "source": {
    "name": "Wiktionary, via kaikki.org (Wiktextract)",
    "url": "https://kaikki.org/dictionary/Albanian/kaikki.org-dictionary-Albanian.jsonl.gz",
    "version": "2026-09-28",                       // the kaikki dump's date (schema-3 manifest's source.lastModified, or --last-modified)
    "licence": "CC BY-SA 4.0",
    "attribution": "Wiktionary, via kaikki.org — CC BY-SA 4.0",   // identical to the schema-3 manifest's attribution; show it wherever the data is shown
    "file": "kaikki.org-dictionary-Albanian.jsonl.gz", "sha256": "…", "lines": 24262   // what was read
  },
  "buckets": 256,                                  // 256 x 2^k; average shard about 100 to 150 kB
  "shardFiles": ["f-00.json", "…"],                // the files that exist (empty buckets have none)
  "counts": { "records": 14471, "withForms": 11020, "withEtymology": 10194, "withIpa": 4954, "withAudio": 87 },
  "builtAt": "2026-10-10"
}
```

Records of one lemma key are in input order (the source's own order). Keys inside a shard are in code-unit order, so the same
input and date give byte-identical files.

### 2.2 FullRecord

Short keys. Everything is optional except `w` and `s`; a field the source lacks is absent (nothing is invented, no empty
arrays). Every string has its control characters removed (line breaks and tabs become one space) and its whitespace collapsed.

| key | meaning | from the kaikki line | cap |
|---|---|---|---|
| `w` | the word as written (NFC) | `word` | |
| `p` | part of speech, mapped exactly as the schema-3 build maps it (`partOfSpeechOf` in `map.ts`; phrase, prefix, suffix and so on are `X`) | `pos` | |
| `h` | the source's own heading, only when `p` is absent or `X` (a heading the mapper does not know, such as "contraction") | `pos` | |
| `e` | etymology number | `etymology_number` | |
| `s` | senses `[{ g, t?, x? }]`: `g` the first gloss (when it is only a label ending in ":", the next part joins it, as in schema 3), `t` the sense's tags and raw tags verbatim, `x` up to 2 example texts (the text only, no translations) | `senses[]` | 12 senses; gloss 400 chars; example 300 chars |
| `f` | forms `[{ f, t, s?, r? }]`: `f` the form, `t` the source's `tags` verbatim, sorted, `s` the source's `source` ('conjugation', 'declension', 'inflection' ...), `r` its romanization (Hindi tables) | `forms[]` | 400 forms; exact duplicates dropped; source order kept |
| `tpl` | the inflection-template names the source gives (`es-conj`, `sq-noun-m`, `hi-ndecl` ...) | `forms[]` rows tagged `inflection-template` | |
| `rom` | romanization of the headword (Hindi and Thai only) | the `forms[]` row tagged `romanization` | |
| `ipa` | `[{ i, t? }]`: the IPA string and its tags (region, standard) | `sounds[].ipa` | 10 |
| `audio` | `[{ u, n, t? }]`: `u` one URL (the `ogg_url`, else the `mp3_url`; a file with neither is left out), `n` the Commons file name | `sounds[].audio` | 6 |
| `hyph` | hyphenations, parts joined with `‧` | `hyphenations[].parts` | 6 |
| `ety` | `{ text?, tpl[] }`: the etymology text and the structured templates | `etymology_text`, `etymology_templates` | text 600 chars (cut with an ellipsis); 20 templates |
| `rel` | `{ d?, r?, syn?, ant?, hyper?, hypo? }`: the `word` fields of derived, related, synonym, antonym, hypernym and hyponym lists, from the entry and from its senses, without repeats | `derived`, `related`, `synonyms`, `antonyms`, `hypernyms`, `hyponyms` | 30 each |

Etymology templates are kept only for `inh, bor, der, cog, lbor, slbor, clq, calque, af, affix, suffix, prefix, com, compound,
blend, uder, unc, onom` (the rest, `root`, `etymon`, `glossary`, `ncog`, `displaced` and so on, are dropped). A kept template is
`{ k, lang?, form?, gloss? }`: for `inh bor der lbor slbor clq calque uder` the language is argument 2 (the source), the form
argument 3, the gloss `t=`/`gloss=`/argument 5; for `cog` the language is argument 1, the form argument 2, the gloss
`t=`/`gloss=`/argument 4; for `af affix suffix prefix com compound blend` the language is argument 1 and `form` is the parts
(arguments 2 and up) joined with " + "; for `unc` and `onom` only the language. A form of "-" or "?" means none and is left out.

### 2.3 What is skipped, what is dropped, and why

- **Entries with no senses of their own are skipped and counted** (`noSenses` in the build report): an inflected-form line
  (`form_of`) carries only a relation to its lemma. That relation lives in schema 3 (`m`), and `PackRuntime.gloss()` and `entry()`
  follow it one hop (section 4). A sense that carries `form_of` is never a sense in `s`, so a word that is both a form and a word
  keeps only its own senses.
- Lines whose heading is a character, symbol or punctuation are skipped (`non-word`), as in schema 3; lines of another language
  (`lang_code`) are skipped (`wrong-language`); malformed JSON is counted.
- **Dropped from the source** (not needed by any card yet; the raw file stays in `data/dictionaries/`): `head_templates`,
  `inflection_templates` (the template arguments; only the template names are kept, in `tpl`), `etymology_links`, `descendants`,
  `categories`, `links`, `translations`, `bold_text_offsets`, example translations, `rhymes` and homophones, `coordinate_terms`,
  holonyms and meronyms, etymology templates outside the list above, `forms` rows tagged `table-tags` (the table's layout) and
  rows without tags, `raw_tags` of forms.
- Caps are cuts, not rewrites: the first N in source order are kept. A record that hits a cap loses the tail, silently, except for
  the etymology text, which ends in "…".

### 2.4 Tag vocabulary

kaikki tags are kept **verbatim** (sorted within a form). They are Wiktextract's, not a standard: Spanish uses `first-person`,
`singular`, `present`, `indicative`, `vos-form`, `informal`; Albanian uses `indefinite`, `definite`, `nominative`, `accusative`,
`dative`, `ablative`; Hindi uses `direct`, `oblique`, `vocative`; German uses `strong`, `weak`, `mixed` and so on. The same notion
can be spelled differently in two languages and a few tags are not grammar at all (`canonical`, `class`, `Urdu`, `alternative`,
region names). **Mapping these to UD-style features (Case, Number, Person, Tense ...) is the paradigm layer's job later**, per
language, with the unmapped tags reported rather than guessed. Nothing in `full-1` pretends the tags are normalised.

## 3. Reading: `createFullRecordSource(lang, { baseUrl, fetch, cache? })`

`info()` returns the parsed manifest (or undefined when none is installed), `lookup(lemmaKey, pos?)` returns that key's records
(a copy), records of the preferred part of speech first (`pos` is a preference, not a filter). Same caching style as
`createFetchLexiconSource`: manifest read once, a bounded least-recently-used cache of parsed shards (default 24, `cache.maxParsedShards`),
a transient failure (network down, HTTP 5xx) is not remembered and is retried, a 404 or a corrupt answer is. A manifest that
lists no file for a bucket means no request. `lookup` never throws. Keys must already be normalized by the language adapter
(`PackRuntime.entry` does that).

## 4. Runtime: `PackRuntime.gloss` and `PackRuntime.entry`

Both take `(lemma, pos?, forms?)`: `forms` are the dictionary forms a caller that already holds the analyser worked out, else the
normalized lemma and the adapter's `lemmaVariants`. Both return `undefined` on every failure.

- `gloss()` (Level 1): senses of the first form that has any. An entry counts when it has senses or glosses of its own, **even if it
  also carries a form-of relation** (Hindi जाना is "form of जानना" and has 19 senses). When the forms hit only form-only entries,
  the form-of relation is **followed one hop** (the headword's shard is fetched) and the headword's senses are returned with
  `via: { form, lemma, labels }`, the dictionary's own labels verbatim, so the card can say "form of X". The preferred part of speech
  orders the relations; at most 6 headwords are tried.
- `entry()` (Level 2): `{ records, attribution, via? }`. The `full-1` records of the first form that has any; otherwise the same
  one-hop follow through the schema-3 form-of relations, then the headword's full records. `attribution` is the full manifest's
  `source.attribution`.

## 5. Size and delivery

`full-1` is much larger than schema 3 because the tables repeat their tag lists in every form row. Measured 2026-10-10 (bytes on
disk; gzip ratio about 0.09 to 0.11 for most languages, so transfer is about a tenth): see the table in `SOURCE-INVENTORY.md`
section 3. A tag-set table in the manifest (as schema 3 does for form-of labels) would cut the raw size by a large factor; it was
not done because the brief fixes `t` as the tag list. `npm run build` copies `public/` into `dist/`, so a full set under
`public/dict/<lang>/full/` is copied into the production bundle, the extension bundle and the zips unless that is excluded.

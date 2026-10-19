# Source inventory (GoLearn Linguistic Engine V2, Stage 2)

Status: 2026-10-10. What lexical data exists for each language, where it came from, what was built from it, what is hosted, and
what is known to be wrong. Schemas: `LEXICAL-SCHEMA.md`. Coverage figures: `COVERAGE-AUDIT.md`, `baseline-2026-10-10.json`.

## 1. The one source: Wiktionary via kaikki.org (Wiktextract)

| | |
|---|---|
| what | Wiktionary's English edition, one JSON line per language / part-of-speech / etymology, extracted by Wiktextract and published by kaikki.org |
| licence | **CC BY-SA 4.0** (Wiktionary contributors). Share-alike applies to the data and to anything derived from it |
| attribution text (shown wherever the data is shown; in both manifests) | `Wiktionary, via kaikki.org — CC BY-SA 4.0` |
| schema-3 licence string | `CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org)` |
| dump date | every file was published 2026-09-28 (the `Last-Modified` headers kept in `data/dictionaries/headers.txt` for Thai, 17:57:05 GMT, `headers-es.txt` for Spanish, 18:05:39 GMT, and `data/research/kaikki/headers.txt` for Albanian, 18:01:40 GMT; the same date is recorded as `source.lastModified` in the German and Hindi schema-3 manifests, whose headers were not kept) |
| retrieved | 2026-09-30 (Thai), 2026-10-01 (the others); downloaded by an earlier session, not by this work |
| where | `data/dictionaries/` (git-ignored; the repository holds no copy) |

## 2. Per language

| | Albanian `sq` | Thai `th` | Hindi `hi` | German `de` | Spanish `es` |
|---|---|---|---|---|---|
| input file(s) | `kaikki.org-dictionary-Albanian.jsonl.gz` | `kaikki.org-dictionary-Thai.jsonl` | `kaikki.org-dictionary-Hindi.jsonl` (and `.gz`) | `kaikki.org-dictionary-German.jsonl` (and `.gz`) | `kaikki.org-dictionary-Spanish.jsonl` (and `.gz`) |
| bytes | 7,846,113 (gz) | 50,456,126 | 165,746,608 (gz 17,993,921) | 1,085,014,907 (gz 98,334,006) | 1,054,565,864 (gz 95,164,871) |
| lines | 24,262 | 21,020 | 39,220 | 371,261 | 811,049 |
| sha256 (first 12) | 29cf43f3475e | 202acdc93b99 | d8cbd27fc31c | 650a0f3a06c6 | a2cc93aee2b0 |
| schema-3 build (`public/dict/<lang>/`) | `kaikki-sq@2026-09-28`, 91,271 entries, 256 shards, built from the larger `kaikki.org-dictionary-Albanian+tables.jsonl` (128,809 lines; the dump plus the entries `npm run sq:dict-expand` generates from the tables; the extract and that file are in `data/research/kaikki/`, with the dump's headers, Last-Modified 2026-09-28 18:01:40 GMT) | `kaikki-th@2026-09-28`, 20,254 entries, schema 2, 256 shards | `kaikki-hi@2026-09-28`, 38,635 entries, 256 shards | `kaikki-de@2026-09-28`, 357,750 entries, 512 shards | `kaikki-es@2026-09-28`, 808,278 entries, 1,024 shards |
| `full-2` build (`public/dict/<lang>/full/`, plain layout; was `full-1` until 2026-10-17, kept in `data/dictionaries/old-full-1/`) | built | built | built | built | built |
| full: input lines kept as records | 14,471 | 20,860 | 26,036 | 102,649 | 123,933 |
| full: skipped, no senses of their own (inflected-form lines) | 9,702 | 29 | 13,118 | 268,507 | 687,014 |
| full: skipped, non-word | 89 | 131 | 66 | 105 | 102 |
| full: distinct lemma keys | 13,353 | 17,489 | 22,969 | 96,629 | 111,702 |
| with forms (tables) | 11,020 (76.2%) | 8,100 (38.8%) | 21,342 (82.0%) | 94,820 (92.4%) | 100,493 (81.1%) |
| with etymology (text or templates) | 10,194 (70.4%) | 16,607 (79.6%) | 22,149 (85.1%) | 74,871 (72.9%) | 62,396 (50.3%) |
| with IPA | 4,954 (34.2%) | 20,789 (99.7%) | 24,086 (92.5%) | 62,391 (60.8%) | 85,105 (68.7%) |
| with audio (Commons file with a URL) | 87 (0.6%) | 273 (1.3%) | 783 (3.0%) | 74,138 (72.2%) | 35 (0.0%) |
| **before, `full-1`** shards / buckets | 256 / 256 | 256 / 256 | 1,024 / 1,024 | 4,096 / 4,096 | 2,048 / 2,048 |
| `full-1` bytes on disk | 28,753,448 | 11,360,553 | 85,459,250 | 408,991,001 | 244,467,340 |
| `full-1` average / largest shard | 112,318 / 209,920 | 44,377 / 72,645 | 83,456 / 295,508 | 99,851 / 261,199 | 119,369 / 365,650 |
| `full-1` manifest | 5.0 kB | 5.0 kB | 19.1 kB | 74.4 kB | 37.6 kB |
| `full-1` gzip ratio (sampled shards) / transfer estimate | 0.11 / 3.2 MB | 0.28 / 3.1 MB | 0.11 / 9.3 MB | 0.09 / 38 MB | 0.10 / 25 MB |
| **after, `full-2`** shards / buckets | 256 / 256 | 256 / 256 | 512 / 512 | 2,048 / 2,048 | 2,048 / 2,048 |
| `full-2` plain: bytes on disk (shards + manifest) | 10,875,549 | 10,827,906 | 42,700,147 | 138,962,707 | 81,392,828 |
| `full-2` plain: smaller than `full-1` by | 62.2 % | 4.7 % | 50.0 % | 66.0 % | 66.7 % |
| `full-2` gzip at rest: bytes on disk | 2,820,074 | 3,077,185 | 7,616,090 | 30,137,193 | 21,321,736 |
| `full-2` gzip at rest: smaller than `full-1` by | 90.2 % | 72.9 % | 91.1 % | 92.6 % | 91.3 % |
| `full-2` largest shard, plain / gzip | 68.6 kB / 16.0 kB | 68.5 kB / 18.0 kB | 199.1 kB / 28.7 kB | 114.6 kB / 23.3 kB | 82.9 kB / 18.2 kB |
| `full-2` manifest | 3.5 kB | 3.1 kB | 4.0 kB | 7.4 kB | 7.0 kB |
| cold fetch of one lemma (manifest + its shard), `full-1` → `full-2`: stored bytes | 114 kB → 46 kB plain / 15 kB gzip | 49 kB → 44 kB plain / 15.5 kB gzip | 87 kB → 57 kB plain / 15.3 kB gzip | 171 kB → 61 kB plain / 19.1 kB gzip | 151 kB → 44 kB plain / 16.9 kB gzip |
| the same, on the wire (a host that gzips plain JSON, or the `.gz` as stored) | 13.6 → 12.8 kB | 13.5 → 13.6 kB | 11.5 → 12.8 kB | 18.8 → 14.2 kB | 16.8 → 12.2 kB |
| build time (`full-2`) / peak memory | 2.1 s / 444 MB | 1.2 s / 410 MB | 5.4 s / 525 MB | 28 s / 887 MB | 20 s / 815 MB |
| `full-1` build time / peak memory (2026-10-10) | 2.6 s / 473 MB | 1.0 s / 376 MB | 4.8 s / 528 MB | 25.5 s / 806 MB | 19.2 s / 754 MB |

The `full-2` rows are from `npm run dict:build-full -- <lang>` on 2026-10-17 from the same kaikki files (same sha256), and
`npm run dict:verify-full -- <lang> --old <full-1 root> --new public/dict` compared every lemma key and every record of the old and
new folders: **zero differences in all five languages**, counts equal, every key in its hash bucket. Lemmas for the cold-fetch row
are the middle key of the old median-sized shard (llokume, มัลดีฟส์, जलसा, moribund, gúrida). Thai shrinks least in plain form because
it has almost no form tables (39 % of its records have forms), so most of its bytes are text that cannot be shared.

All counts are from `npm run dict:build-full -- <lang>` on 2026-10-10 (one record per kaikki line with senses; a lemma can have
several records, one per part of speech and etymology). The build streams the file line by line (a `.gz` is gunzipped on the
fly) and spills records to 256 temporary files by key hash, so memory is bounded (the Spanish plain file is read at under
800 MB resident).

### Latin `la` (added 2026-10-17)

| | Latin `la` |
|---|---|
| input file | `kaikki-la.jsonl`, the kaikki.org Latin extract (`https://kaikki.org/dictionary/Latin/kaikki.org-dictionary-Latin.jsonl`), kept by the Romance project in `romance-v0/data/dict/` (not copied here: pass `--in`) |
| bytes / lines / sha256 (first 12) | 1,219,776,083 / 892,320 (0 malformed, every line `lang_code: la`) / 22ba74c8c8a0 |
| licence, attribution | CC BY-SA 4.0 (Wiktionary contributors), `Wiktionary, via kaikki.org — CC BY-SA 4.0`, as for the other five. The Romance project's notes say "CC BY-SA 3.0" (Wiktionary's text is dual-licensed); the manifests state 4.0 like the other languages |
| dump date | not recorded by that download (file written 2026-09-22; the fetch log's "size mismatch" is the compressed Content-Length against the decompressed stream, the file is complete and every line parses). The schema-3 manifest carries `retrievedAt: 2026-09-22`; the id and the full manifest's `version` carry the build date, 2026-10-17 |
| schema-3 build | `kaikki-la@2026-10-17`, 997,266 entries under 981,316 distinct keys, 1,024 shards, 71,910,912 bytes, largest 84,000; 20.6 s, 777 MB |
| of those entries | 944,048 are form-of entries (inflected forms and spelling variants, no gloss of their own; 1,107,466 relations, 1,447 label sets); **166,685 of them are spelling-variant entries the build adds** (`uerbum`, `ejus`; `docs/latin/DICTIONARY.md`); 80,571 entries carry pronunciations (168,680 rows: Classical and Ecclesiastical IPA, tags kept) |
| `full-2` build (plain) | 54,221 records under 51,368 lemma keys; 1,024 shards, 58,863,753 bytes, largest 97,864; 16.3 s, 683 MB. As `full-1` (`--schema full-1`): 2,048 shards, 159,258,005 bytes |
| full: skipped | 837,956 inflected-form lines (no senses of their own), 143 non-word (99 characters, 38 symbols, 6 punctuation) |
| with forms (tables) | 52,668 (97.1%) |
| with etymology | 37,823 (69.8%) |
| with IPA | 38,901 (71.7%) |
| with audio | **0**: this extract carries no audio rows |

What is particular to Latin: the headwords of this extract are the page titles, without macrons (`amo`, `verbum`), and the macron form is the
`canonical` row of `forms` (`amō`); the inflection tables are in `forms` (`source`: `declension` or `conjugation`) and stay in the `f` rows
with `s` set; `etymology_number` is a string ("2") and is read as a number for Latin only; a pronunciation row says "Classical-Latin" in its
tags and "modern Italianate Ecclesiastical" in a free-text `note`, which the mapper turns into a verbatim tag; the short IPA of a schema-3
entry is the Classical reading. The Wiktionary heading `conj` maps to `CONJ` (the parser's part-of-speech list has no CCONJ). Keys come from
`src/dict/latin-normalize.ts`, shared with the Latin adapter. Details and tests: `docs/latin/DICTIONARY.md`.

### What is hosted

- **Schema-3 shards of all five languages** are hosted at `https://rookie2401.github.io/go-v0/dict/<lang>/` (all answer 200;
  see `COVERAGE-AUDIT.md` section 2), and Albanian is also shipped inside the extension (`dist/app/dict/sq`).
- **The full records are built locally only; nothing is hosted yet.** As `full-1` they were 780 MB on disk for the five languages
  (409 MB German, 244 MB Spanish), too much for GitHub Pages. As `full-2` they are **285 MB plain or 65 MB gzipped at rest** for all
  five (German 139 / 30 MB, Spanish 81 / 21 MB); with the 122 MB of schema-3 shards the whole `dict/` tree is **407 MB plain or
  187 MB gzipped**, so the full records now fit GitHub Pages in the gzipped layout (+65 MB over what is hosted today), and fit
  plain too but not comfortably. The extension's text-caching shard fetch needs the plain layout until it stores gzip bodies as
  bytes (`LEXICAL-SCHEMA.md` 2b.3). Where to host and how: `docs/ops/DICTIONARIES.md`. `npm run build` copies `public/` into `dist/`
  and into every zip, so the full set under `public/dict` still lands there unless it is excluded.

### Known quality notes

- **Albanian tables are template-generated and some are wrong.** `docs/albanian/STATUS.md`: Wiktionary's tables come from
  templates and include errors ("qeshqesh" for qeshi, "hedhni" for hidhni, "muajtë" for muajt); usage counts outvote the table
  where they are lopsided. `paradigm-sq-2026-10-10.json` counts conflicting cells against the analyser's generator. `full-1`
  keeps the tables verbatim and does not repair them; a card that shows one should say the table is Wiktionary's.
- The Albanian dump has 24,262 lines, of which only 14,471 are records with senses; the schema-3 build's 91,271 entries come from
  the `+tables` expansion (generated form entries), which `full-1` does not contain. A form that only the expansion knows reaches
  its lemma through the schema-3 form-of relation (`gloss`/`entry` follow it).
- Spanish audio is almost absent in the dump (35 files), German audio is on 72% of the records; IPA is missing for about a third of
  Spanish and German records and for two thirds of Albanian ones.
- Thai has no case or tense tables (isolating language): `forms` hold romanizations and alternative spellings (38.8% of the
  records). The headword romanization goes to `rom`.
- Hindi `etymology_text` often begins with the rendered "Etymology tree" block (several lines of the tree, then the prose); it is
  kept verbatim (whitespace collapsed, capped at 600 characters), so the prose can be cut off. The structured `ety.tpl` is the
  cleaner part for Hindi. Hindi tables carry a romanization per form (`r`).
- Wiktionary's `derived` and `related` lists are very long for common words (German `Buch` has 70 related words); `rel` keeps the
  first 30 of each.
- Spanish verb tables include voseo forms (`vos-form`) and both the headline forms (no `source`) and the full conjugation table
  (`source: conjugation`), so a form can appear twice with different tag sets; the cap is 400 forms per record.
- Part of speech: headings the schema-3 mapper does not know (for example "contraction", "abbrev") have no `p`; `h` keeps the
  heading.
- Nothing here has been reviewed by a native speaker; this is Wiktionary's data, unevaluated beyond the availability counts in
  `baseline-2026-10-10.json`.

### Rebuild

```
npm run dict:build-full -- sq          # all of data/dictionaries/kaikki.org-dictionary-Albanian.jsonl[.gz] -> public/dict/sq/full
npm run dict:build-full -- es --limit 50000     # a sample, written to a temporary directory (never over a real build)
npm run dict:build-full -- de --out some/dir --last-modified 2026-09-28
npm run dict:build-full -- de --gzip        # gzip at rest (f-xx.json.gz); the default is plain full-2, which every client reads
npm run dict:build-full -- de --schema full-1   # the old format (still readable)
npm run dict:verify-full -- de --old <old root> --new public/dict   # same records? plus the before/after table
```

The source version and url are taken from the schema-3 manifest in `public/dict/<lang>/` when it exists, else from
`--last-modified` / `--source-url`, else the build date.

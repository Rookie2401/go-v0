# Modern Hebrew form index — build of 2026-10-18

Built by `npm run he:build-modern` from `data/raw/kaikki-he/kaikki.org-dictionary-Hebrew.jsonl` (Wiktionary via kaikki.org, CC BY-SA 4.0; extract last modified 2026-10-03, retrieved 2026-10-17).
Every row is a Wiktionary inflection-table row or a "form of" entry; its labels are kept as written. Nothing was analysed here.

| measure | value |
|---|---|
| input lines | 18,075 |
| entries read (noun, verb, adjective, adverb, pronoun, determiner, preposition, conjunction, numeral, interjection) | 17,382 (693 lines of other headings skipped: roots, suffixes, phrases, characters) |
| entries with an inflection table | 4,214 |
| table rows read | 144,869 |
| "form of" entries | 2,380 |
| distinct form keys | 149,277 (114,376 pointed, 34,901 unpointed) |
| readings | 176,688 |
| lemmas | 14,456 |
| entries whose every sense is labelled Biblical / Mishnaic / Medieval / Modern / Aramaic | 121 / 0 / 9 / 69 / 0 |
| index size | 18.7 MB (public/lexicon/he/modern-index.json, git-ignored) |

## Shards (2026-10-22)

`npm run lexicon:shard -- --set he/modern` cuts this index into 23 shards under `public/lexicon/he/modern/` (git-ignored), 2.7 MB
gzipped against 15.6 MB plain, largest 0.37 MB, prefixes of up to 1 consonants (a key goes to
the longest listed prefix of its letters; '_' holds the keys with no letter of the script). A host loads the shards of the keys it is about to
read (src/adapters/shared/shards.ts; Biblia per chapter, the extension's content script before a lookup); a paradigm or the Variants tab
shows what the loaded shards hold and says so.

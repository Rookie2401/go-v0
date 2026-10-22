# Ancient Greek form index — build of 2026-10-19

Built by `npm run el:build-ancient` from `data/raw/kaikki-grc/kaikki.org-dictionary-AncientGreek.jsonl` (Wiktionary via kaikki.org, CC BY-SA 4.0; extract last modified 2026-10-03, retrieved 2026-10-17).
Every row is a Wiktionary table row (with its table header), an alternative form or a "form of" entry; labels are kept as written. Nothing was analysed here.

| measure | value |
|---|---|
| input lines | 68,196 |
| entries read | 67,371 (825 lines of other headings skipped) |
| entries with an inflection table | 11,552 |
| table rows / alternative forms / "form of" entries | 927,729 / 10,230 / 48,509 |
| distinct form keys | 660,208 |
| readings | 993,307 |
| lemmas | 27,227 |
| entries with a cross-period link (Modern Greek descendant) | 6,706 |
| entries whose every sense carries a period label | el-att 454, el-dor 239, el-hom 969, el-ion 483, el-koi 487, el-aeo 101, el-med 247, el-arc 7 |
| index size | 130.5 MB (public/lexicon/el/ancient-index.json, git-ignored) |

Table headers seen (top 30): Attic declension-2 8,424, Attic declension-3 4,385, Attic declension-1 3,848, aorist 2,495, present 2,470, imperfect 2,236, future 2,183, perfect 1,864, pluperfect 1,036, contracted present 784, contracted imperfect 698, Epic declension-2 618, Epic aorist 604, Epic declension-3 564, Epic imperfect 462, Attic contracted declension-3 448, contracted future 394, Ionic declension-3 320, Ionic declension-2 290, Epic present 286, Epic declension-1 224, Ionic declension-1 158, Epic future 140, Attic present 115, Koine declension-2 98, Attic imperfect 96, Epic perfect 87, Attic aorist 84, future perfect 82, Doric declension-1 78.

## Shards (2026-10-22)

`npm run lexicon:shard -- --set el/ancient` cuts this index into 130 shards under `public/lexicon/el/ancient/` (git-ignored), 12.2 MB
gzipped against 102.5 MB plain, largest 0.47 MB, prefixes of up to 2 bare letters (a key goes to
the longest listed prefix of its letters; '_' holds the keys with no letter of the script). A host loads the shards of the keys it is about to
read (src/adapters/shared/shards.ts; Biblia per chapter, the extension's content script before a lookup); a paradigm or the Variants tab
shows what the loaded shards hold and says so.

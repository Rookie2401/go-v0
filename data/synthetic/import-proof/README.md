# SYNTHETIC DEVELOPMENT MATERIAL for import testing — not learner content

Everything in this folder is invented by the project to exercise the importer (`src/ingest`). It is **not** learner
content, was never reviewed by a speaker of any language, and is **never bundled**: it lives outside `data/corpus`, so
`loadBundledCorpus()` cannot see it, and the app never imports it. Every document id starts with `synthetic-` and every
`source.provenance` says so. The Scripture-shaped files contain only the wording "PLACEHOLDER — not Scripture"; their
verse references exist only to satisfy the schema. The "reviewer" in `10-hold-rights.json` is a labelled fixture, not a person.

Several files are **deliberately invalid** (malformed JSON, missing fields, bad spans, ...). Validate them one at a
time: `npm run corpus:validate -- data/synthetic/import-proof/06-spans-overlap.json`. Validating the folder as one batch
reports the duplicate id of the `04-` pair on purpose.

Run the proof: `npm run corpus:prove` (add `--write` to regenerate `docs/import/PROOF.md` from the actual run). It imports
every case through the real importer into an isolated in-memory store and compares expected with actual outcomes.

| File | Case |
|---|---|
| `01-valid-es.json` | a valid Spanish text, six sentences (also imported a second time, unchanged) |
| `02-malformed.json` | not valid JSON |
| `03-missing-fields.json` | required fields missing (`review`, `topics`, `generated`, `source.attribution`) |
| `04-duplicate-id-a.json`, `04-duplicate-id-b.json` | two different files with the same document id |
| `05-batch-valid.json`, `05-batch-invalid.json` | a batch of one valid and one invalid file |
| `06-spans-out-of-bounds.json` | author span outside the sentence |
| `06-spans-overlap.json` | two spans on the same word |
| `06-spans-grapheme-es.json` | span splits a letter from its combining accent |
| `06-spans-grapheme-hi.json` | span splits a Devanagari conjunct |
| `07-alignment-broken.json` | raw paragraph whose `english` array has the wrong length |
| `08-exact-es.json` | non-NFC, NBSP, edge and double spaces, `« » — … ¿ ¡`, raw paragraph with edge spaces |
| `08-exact-hi-danda.json` | Hindi sentences ending in a danda, one not in NFC (U+0958) |
| `08-exact-th-no-spaces.json` | Thai without spaces, declared and raw (one sentence per line) |
| `09-valid-es-revised.json` | revision of `01`: one sentence changed, one added, five unchanged |
| `10-hold-review.json` | review hold (unreviewed) |
| `10-hold-rights.json` | publication hold (reviewed, rights unverified) |
| `10-scripture-unverified.json` | placeholder claiming to be Scripture, unverified |
| `10-scripture-generated.json` | placeholder claiming to be Scripture and generated (must be rejected) |

All other files have `generated: true`, except the unverified Scripture placeholder (a Scripture document cannot be
generated, which is exactly the `10-scripture-generated.json` case).

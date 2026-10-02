# Albanian validation material (`data/benchmarks/sq/`)

What the Albanian adapter is measured against, and the machinery for a native-reviewed gold set. Package Q7 of
`docs/PLAN13.md`. Code: `src/bench/sq/` (CoNLL-U reader, treebank comparison, gold set), `scripts/sq-eval-ud.mts`,
`scripts/sq-gold.mts`.

## What is here

| | |
|---|---|
| `RESOURCES.json` | the three external treebanks as records (licence, what their READMEs say about how they were made, `use: research-only`, `shipped: false`, where they will live once downloaded). Nothing is downloaded. |
| `gold/SCHEMA.md` | the format of the gold set, the categories and the per-category targets (1,500 sentences in all). |
| `gold/*.jsonl` | the gold set itself. **It does not exist yet.** The directory holds only `.gitkeep` and the schema. |

## What is NOT here

- **No reviewed item.** A native-reviewed gold set of 1,000-2,000 sentences is the goal; today it has zero sentences,
  and `npm run sq:gold -- check` says "no reviewed items yet: nothing is being checked" rather than passing.
  Nothing in this repository fakes one: drafts written by `sq:gold -- draft` are the adapter's own analysis, i.e. the
  machine's opinion, and are never evidence.
- **No treebank.** UD_Albanian-STAF, UD_Albanian-TSA and UD_Gheg-GPS are not downloaded. They need the owner's
  permission, and then go to `data/research/ud/<name>/` (git-ignored). They are validation and reference material only:
  their sentences are never course text, never bundled, never shown to a learner, never copied into `data/corpus/`.

## The treebanks (from their READMEs, read 2026-10-01)

| treebank | content | how lemmas / features were made | licence | in UD since |
|---|---|---|---|---|
| UD_Albanian-STAF | 202 sentences from six works of fiction (1963-2004) | automatic with corrections | CC BY-SA 4.0 | v2.15 |
| UD_Albanian-TSA | 60 sentences, 922 tokens, from Wikipedia | manual | CC BY-SA 4.0 | v2.6 |
| UD_Gheg-GPS | 966 sentences, about 16,000 tokens: spoken retellings of the Pear Stories film by Gheg speakers in Prishtina and Zurich, with code-switching (mostly Swiss German) and disfluencies | manual | CC BY-SA 4.0 | v2.11 |

CC BY-SA 4.0 asks for attribution and for the same licence on adaptations. That is why the treebanks are kept as
research material outside the bundle; a gold item taken from one must be marked `treebank-derived` and carry its
licence (the validator refuses it otherwise). A treebank is not ground truth: STAF's lemmas and features are automatic
with corrections, and GPS is spoken Gheg, not Standard Albanian, so a low score there says nothing about Standard texts.

## Comparing the adapter with a treebank

```
npm run sq:eval-ud -- --treebank data/research/ud/UD_Albanian-TSA --split dev --show 10
npm run sq:eval-ud -- --treebank data/research/ud/UD_Albanian-TSA --split test
```

It prints token boundaries (precision, recall, F1 over offsets), multiword tokens (`ta` = `të` + `e`, `t'i`, `s'ka` ...
against the adapter's `parts`: one token / right number of parts / right lemmas), and, where the boundaries agree, part
of speech (with AUX/VERB and CCONJ/SCONJ confusions listed apart), lemma (equal, with the differing pairs listed, not
called errors), features (a value list that intersects the treebank's does not contradict it) and coverage. Every
percentage comes with its counts. Definitions: the header of `src/bench/sq/compare.ts`.

**Split discipline.** Sentences are split by a stable hash of `sent_id` (FNV-1a; even = dev, odd = test). `dev` may be
looked at and tuned on, and `--show N` lists examples. `test` is reported as it comes: `--show` is refused for it, and so
are the tables that would print words from it. Never tune on `test`. A change that was tried against `test` has used
it up.

## How a reviewer works on the gold set

1. Sentences go in a text file, one per line. `npm run sq:gold -- draft --in sentences.txt --category clitic` writes
   draft items (category keys: see `gold/SCHEMA.md`). Say where the sentences come from with `--source-kind`
   (`reviewer-written`, `course-authored`, `learner-import`, or `treebank-derived` with `--ref` and `--licence`).
2. The reviewer corrects each token in the `.jsonl` (lemma, UPOS, features, parts for fused clitics) following the
   conventions of `src/adapters/albanian/types.ts`.
3. `npm run sq:gold -- accept --id <id> --by "<name>"` records the reviewer and the date. It refuses without a name,
   refuses an item the validator rejects, and refuses a draft left exactly as the machine wrote it unless
   `--confirm-unchanged` is given. The tool records the reviewer's word; it cannot check that they read Albanian.
4. `npm run sq:gold -- status` shows reviewed counts against the targets; `npm run sq:gold -- check` compares the adapter
   with the reviewed items (exit 1 on any regression; drafts and rejected items are skipped and counted).

## Rights isolation, checked by tests

`test/bench/sq-rights.test.ts`: a document with `source.rights: 'research-only'` is not bundled by `bundleDecision`;
no file under `data/corpus/sq/` mentions Universal Dependencies or a `UD_` treebank; every record in `RESOURCES.json`
has `shipped: false` and `use: 'research-only'`.

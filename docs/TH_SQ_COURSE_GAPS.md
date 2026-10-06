# Thai and Albanian course gap recovery

Prepared 2026-10-02. This report covers only acquisition material under
`data/sources/th-gap-recovery/` and `data/sources/sq-gap-recovery/`. It does not
alter a course catalogue, UI, shared library manifest, or the Bible routes.

## Exact gap decision

| Language | Gap before this batch | Prepared material | Honest placement | Remaining gap |
|---|---|---|---|---|
| Thai | No bundled secular beginner/native reading; the 1,189 Scripture chapters and historical literature do not establish an A0–B1 bridge | 45 complete Thai fables, 90 extracted paragraphs, 1,373 whitespace-delimited words (Thai token counts are adapter-specific) | Beginner source candidates / early bridge; Central Thai source wording | Native pedagogical review and a larger modern everyday narrative set remain needed |
| Albanian | 28 modern open reference documents plus 22 generated drafts, but no approved complete beginner narrative set; no Bible acquisition authorized | 8 complete historical fables, 8 paragraphs, 1,616 whitespace-delimited words | Historical/older Albanian bridge only; not modern-standard | Standard Albanian very-easy/easy narratives remain an unfilled A0–B1 slot |

The Albanian set is intentionally not a resolution of the modern-standard gap.
Its source pages contain older orthography and literary varieties (including
Arbëresh or Gheg features). They are preserved as authentic references with a
variety label, rather than normalized or presented as contemporary standard
Albanian.

## Thai: beginner source candidate

The source is [นิทานอีสป](https://th.wikisource.org/wiki/นิทานอีสป), a 2499
Thai funeral reprint by พระยาเมธาธิบดี (สาตร สุทธเสถียร). Its author preface,
dated 22 December R.S. 130 (1911), says that the reader was written with easy
language and short sentences for children after the first reading primer. The
source page lists 45 complete fables; this batch captures all 45, preserving
the Thai text and moral as separate paragraphs. Each item records its exact
Wikisource revision, raw HTML SHA-256, attribution, and extracted content
signature.

The source root records the underlying work as public domain in Thailand under
Thai copyright terms. The cached transcription remains attributed under CC
BY-SA 4.0. No worldwide or United States public-domain status is claimed for
the 1956 reprint. This is a rights and source-fidelity check, not a
Thai-native review or CEFR certification. The batch is ready for a reviewer
and lead integrator to consider; it is not placed in the learner library here.

## Albanian: historical bridge candidates

The candidates are complete fable texts from the [Albanian Wikisource
category](https://wikisource.org/wiki/Category:Sq_Shqip_(Albanian)):

`Bretkosa që deshi të trashej sa një Ka`, `Korbi dhe Dhelpra`, `Lopa, Dhija,
Delja dhe Luani`, `Luani dhe Miu`, `Maçoku dhe Miu plak`, `Millonai, i Biri dhe
një Gomar`, `Ujku dhe Qengji`, and `Zogu dhe Djali`.

The exact revisions and source hashes are in
`data/sources/sq-gap-recovery/source-manifest.json`. The documents retain the
source spelling and wording. Rights are explicitly `unverified`, `canBundle`
is false, and each document is `unreviewed` until jurisdiction, author,
edition, and transcription rights are checked by the lead. No text is
modernized, translated, or treated as a modern-standard lesson.

## Validation and handoff

Run the reproducible acquisition with:

```text
NODE_OPTIONS=--use-system-ca npx tsx scripts/acquire-course-gaps-th-sq.mts --date=2026-10-02
```

The script caches the official Wikisource parse responses under each shelf's
`raw/` directory, regenerates `documents.json`, and writes the shelf-local
manifest and rights evidence. A rerun produced 45 Thai documents and 8
Albanian documents with the counts above. No shared library build or public
catalogue integration was run.

Next review actions are: have a Thai-native reviewer check beginner suitability
and segmentation; have an Albanian reviewer identify the exact historical
variety and assess whether any text is useful as a bridge; and acquire a
separate, rights-clear modern-standard Albanian beginner narrative set. The
Albanian Bible remains deferred.

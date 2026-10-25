# Latin analyser evaluation (`scripts/latin-eval.mts`)

An honest, repeatable measurement of `laAdapter` (`src/adapters/la.ts`) over five corpora, with gold-standard accuracy wherever a gold annotation exists. The owner's target is "near 100 %"; this document measures, it does not flatter. Machine-drafted instrument; no Latinist has checked the equivalence table or the gold mappings.

**The numbers below are a snapshot.** The adapter is being improved in parallel, so every run records the adapter's source fingerprint (SHA-256 of `src/adapters/la.ts` and `src/adapters/latin/**`). Re-run to refresh; the block between the GENERATED markers is rewritten by the script, everything else is hand-written.

## Run it

```
cd C:\Users\CJWal\dev\go-v0
npx vite-node scripts/latin-eval.mts -- --corpus all --gold --json data/review/latin-eval/report.json --misses data/review/latin-eval/misses.json --md docs/latin/EVAL.md
```

About 15 s of work after a slow vite-node start-up. Options: `--corpus vulgate|nt|cicero|vergil|ovid|principia|perseus|perseus-<author>|main|all` (comma list), `--gold` (read PROIEL and Perseus), `--limit N` (first N sentences, deterministic), `--json F`, `--misses F`, `--md F`, `--raw-principia` (do not expand `q;` and `&`). Library: `scripts/latin-eval-lib.mts` (`runEval`); test: `test/latin/eval.test.ts` (300-sentence slice of every corpus on disk, asserts report shape and 0..100 ranges, never an accuracy).

Outputs: `data/review/latin-eval/report.json` (every number, no text), `data/review/latin-eval/misses.json` (per corpus: the commonest unconfirmed / missing forms with a count and one 90-character example, and, with `--gold`, the commonest gold disagreements by lemma, by POS and by feature). The miss file is what the adapter work should be fixed against.

## Method

1. **Text.** Each corpus is cut into sentences (Vulgate: one verse = one sentence; Wikisource and Principia text: split at `.` `?` `!` as in `scripts/corpus-la-build.mts`). Every sentence goes through `tokenize` then `analyze`; only tokens with `isWord` count. Only the first candidate is scored ("first reading"); `lemmaAnyLenient` shows how often some other candidate had the right lemma (the headroom for disambiguation).
2. **Coverage classes** (first candidate): *no reading* = no candidate or no lemma; *unconfirmed guess* = `unconfirmed: true`; *rule-built* = `notes.source === 'rule'` (or `origin: 'rule'`) and not unconfirmed; *lexicon-confirmed* = everything else. "Any reading" = the three non-empty classes. `>1 reading` = more than one candidate.
3. **Gold.** *PROIEL* (Latin NT, Jerome's Vulgate): every token with a form and a verse reference (112,038 annotated tokens; 1,680 empty nodes skipped), grouped by verse and aligned to the Clementine verse by longest common subsequence of folded forms. *Perseus AGLDT* (twelve files, `v2.1/Latin/texts`): scored per author on the treebank's own text (corpus `perseus-<author>`; sentences rebuilt from the gold forms), and, for Cicero / Vergil / Ovid, also aligned onto the on-disk Wikisource texts over the whole work (only runs of 5+ consecutive matching words are kept, so that chance matches of *et* or *in* between unrelated passages do not count). Elliptical inserted nodes, punctuation and unannotated nodes are not gold words. An enclitic *-que / -ve* the treebank splits off is glued back onto its host (neque = ne + que), the host's annotation is scored, and host-lemma + *que* is accepted as a second lemma.
4. **Scores.** Lemma, POS (UPOS), lemma + POS, features. Features are the nine UD-style keys `Case Number Gender Person Tense Mood Voice VerbForm Degree`. *Features subset* = every feature the gold specifies is right (the denominator is the aligned tokens with at least one gold feature). *Strict* and *lenient* as defined by the equivalence table below.
5. **Strict vs lenient.** Strict: the gold as annotated, spelling folded only (case, marks, ligatures, j = i, u = v). Lenient: the explicit equivalence table below, nothing else. The table was written after reading the first error lists (so it is informed by the data), but every entry is a convention between treebanks or a gold-annotation artefact, not a forgiven mistake; real homograph errors (*quod* conjunction read as a pronoun, *cum* preposition read as a conjunction, *hic* "here" read as "this") stay errors. Anyone who disagrees with an entry can delete it from `scripts/latin-eval-lib.mts` and read the strict column.
6. **Speed.** Words per second is `analyze` time only (tokenising, alignment and scoring excluded), after the index is built (`index build` in the run line).

## Corpora and provenance

Files read are listed with SHA-256 in the generated block below. Downloads were made on **2026-10-17** into `C:\Users\CJWal\dev\latin-eval-sources\` (a new directory outside OneDrive; treated as untrusted data: parsed by this script's own regex code, never executed).

| what | URL | licence | notes |
|---|---|---|---|
| Newton, *Philosophiae Naturalis Principia Mathematica* (1687 edition), Latin | https://www.gutenberg.org/cache/epub/28233/pg28233.txt (Project Gutenberg eBook #28233, "Language: Latin", produced by Jonathan Ingram, Keith Edkins and the Online Distributed Proofreading Team; release 2009-03-01) | public domain; the Project Gutenberg licence header and footer are kept in the file `principia/pg28233.txt` | The whole work: Definitiones, Axiomata / Leges motus, Book I section 1 onward, Books II and III, about 100,000 words after cleaning. Language verified before use (Latin text, *Autore Is. Newton*). |
| Perseus / AGLDT Latin Dependency Treebank 2.1 | https://github.com/PerseusDL/treebank_data , directory `v2.1/Latin/texts`, fetched at commit `bf4334f0af5e13d16b04c1cccd6237e683ac6f5f` (the last commit touching `v2.1/Latin` is `5114f221b2ccdb97bb15f78f4557781460824b73`, 2020-12-11); GitHub's file listing is kept as `perseus/_github-listing.json` | CC BY-SA 3.0 US (repository README: "Contents of this repository are licensed under a Creative Commons Attribution-ShareAlike 3.0 United States License"; Perseus Digital Library, Tufts University) | Twelve files: Caesar, Cicero (Catilinarians), Propertius, Sallust, Vergil (Aeneid, part), Ovid (Metamorphoses, part), Petronius, Phaedrus, Res Gestae, Suetonius (Augustus), Tacitus (Annales, part), Jerome (Vulgate, part). Sizes are small: the Aeneid file holds about 2,200 words, the Ovid about 4,100 (see the gold tables). |
| PROIEL Latin NT (Jerome's Vulgate) | held by Vetus V0: `C:\Users\CJWal\dev\vetus-v0\data\proiel\latin-nt.xml` (export 2023-04-20, schema 2.1) | CC BY-NC-SA 4.0 | Not redistributed by this repository; `data/review/latin-eval/` holds only numbers and miss lists (the miss lists carry short example snippets of the public-domain Clementine text and of the public-domain texts, not annotations, apart from gold lemma / tag labels of the disagreements). Non-commercial use only. |
| Clementine Vulgate | `vetus-v0/data/vulgate/lat-clementine.usfx.xml` (seven1m/open-bibles USFX) | public domain (1592) | 35,809 verses, 73 books; the NT is 7,951 verses. |
| Cicero, Vergil, Ovid | `romance-v0/data/la/*.text.json` (Latin Wikisource API responses; licences in `romance-v0/data/corpus-manifest.json`: public domain text, Wikisource edition marks CC BY-SA) | see manifest | Vergil and Ovid are macronised; Aeneid 2, 4, 6 spell consonantal *v* and *j* as *u* / *i*. |

Principia preprocessing (edition convention, not language): see `PRINCIPIA_NOTES` in the library. In short: text from the preface to *FINIS*, hyphenated line breaks rejoined, *q;* (the printer's -que) written *que*, *&* written *et*, formula paragraphs dropped, and diagram labels (single capitals and all-capital groups up to six letters that are not Roman numerals, 7,000+ of them) counted apart and excluded from the word totals. Lower-case point labels (a, b, d ...) cannot be told from words and stay in; so do headings and abbreviations (*Prop.*, *Prob.*, *Lem.*, *gr*, *etc*), which is why Principia's numbers are a little pessimistic. `--raw-principia` shows the text without the `q;` / `&` expansion.

## Results (generated)

<!-- BEGIN GENERATED (scripts/latin-eval.mts --md): do not edit between the markers -->

Run: 2026-10-25T21:50:20.305Z - adapter `adapter-la@1` (source fingerprint 6219833f55d47516, 31 files) - corpora vulgate, nt, cicero, vergil, ovid, principia, perseus-caesar, perseus-cicero, perseus-propertius, perseus-sallust, perseus-vergil, perseus-ovid, perseus-petronius, perseus-phaedrus, perseus-resgestae, perseus-suetonius, perseus-tacitus, perseus-jerome - gold on - limit none - index build 60 ms (excluded from words/s).

### Coverage (no gold needed; first reading of each word token)

| corpus | sentences | word tokens | distinct forms | any reading | lexicon-confirmed | rule-built | unconfirmed guess | no reading | >1 reading | words/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| vulgate | 35,809 | 612,227 | 46,373 | 100.0 % | 97.3 % | 2.6 % | 0.1 % | 0.0 % | 44.5 % | 55,734 |
| nt | 7,951 | 126,563 | 15,704 | 100.0 % | 98.7 % | 1.2 % | 0.1 % | 0.0 % | 44.9 % | 56,060 |
| cicero | 1,072 | 27,221 | 7,895 | 100.0 % | 98.7 % | 0.8 % | 0.5 % | 0.0 % | 53.2 % | 32,715 |
| vergil | 1,082 | 20,535 | 8,160 | 100.0 % | 97.9 % | 0.7 % | 1.4 % | 0.0 % | 52.1 % | 23,091 |
| ovid | 190 | 5,097 | 2,979 | 100.0 % | 97.8 % | 0.9 % | 1.3 % | 0.0 % | 48.6 % | 36,634 |
| principia | 5,672 | 99,976 | 10,211 | 99.7 % | 93.3 % | 2.8 % | 3.5 % | 0.3 % | 48.8 % | 43,917 |
| perseus-caesar | 71 | 1,334 | 767 | 100.0 % | 97.1 % | 1.7 % | 1.2 % | 0.0 % | 53.8 % | 41,445 |
| perseus-cicero | 326 | 5,519 | 2,319 | 100.0 % | 98.8 % | 1.0 % | 0.3 % | 0.0 % | 53.9 % | 53,695 |
| perseus-propertius | 364 | 4,372 | 2,205 | 100.0 % | 96.7 % | 1.2 % | 2.1 % | 0.0 % | 55.0 % | 40,979 |
| perseus-sallust | 699 | 10,751 | 3,979 | 99.9 % | 98.3 % | 0.6 % | 1.0 % | 0.1 % | 52.6 % | 41,342 |
| perseus-vergil | 177 | 2,186 | 1,512 | 100.0 % | 97.7 % | 0.6 % | 1.6 % | 0.0 % | 53.1 % | 45,128 |
| perseus-ovid | 317 | 4,133 | 2,465 | 100.0 % | 97.8 % | 0.9 % | 1.3 % | 0.0 % | 47.1 % | 49,794 |
| perseus-petronius | 1,114 | 11,140 | 4,695 | 99.8 % | 96.0 % | 0.9 % | 2.8 % | 0.2 % | 48.6 % | 39,801 |
| perseus-phaedrus | 582 | 5,345 | 3,078 | 100.0 % | 98.5 % | 1.2 % | 0.3 % | 0.0 % | 51.9 % | 42,255 |
| perseus-resgestae | 116 | 2,616 | 1,250 | 99.8 % | 95.5 % | 1.2 % | 3.1 % | 0.1 % | 49.9 % | 35,748 |
| perseus-suetonius | 346 | 7,002 | 3,773 | 99.9 % | 97.5 % | 1.0 % | 1.3 % | 0.1 % | 51.7 % | 36,895 |
| perseus-tacitus | 197 | 2,881 | 1,790 | 100.0 % | 97.7 % | 1.0 % | 1.3 % | 0.0 % | 55.4 % | 42,040 |
| perseus-jerome | 617 | 8,366 | 2,179 | 100.0 % | 99.2 % | 0.6 % | 0.2 % | 0.0 % | 43.3 % | 65,456 |

"Any reading" = the adapter returned a lemma (lexicon + rule + guess). "Lexicon-confirmed" = the first candidate is not `unconfirmed` and `notes.source` is not `rule`. "Unconfirmed guess" = ending-based guess (`unconfirmed: true`, confidence at most 0.4). Words under confidence 0.6 that are still lexicon-sourced: vulgate 9,466, nt 1,965, cicero 806, vergil 810, ovid 172, principia 3,649, perseus-caesar 34, perseus-cicero 145, perseus-propertius 125, perseus-sallust 303, perseus-vergil 88, perseus-ovid 127, perseus-petronius 285, perseus-phaedrus 169, perseus-resgestae 56, perseus-suetonius 226, perseus-tacitus 96, perseus-jerome 86.

### What the unconfirmed and missing words look like

| corpus | guess + no reading (tokens) | capitalised inside a sentence (names) | ends -que / -ve / -ne | 3 letters or fewer | other | the listed forms (top 300; 100 for treebank-own-text corpora) cover |
|---|---:|---:|---:|---:|---:|---:|
| vulgate | 509 | 144 (28.3 %) | 9 (1.8 %) | 0 (0.0 %) | 356 (69.9 %) | 86.4 % |
| nt | 162 | 83 (51.2 %) | 2 (1.2 %) | 0 (0.0 %) | 77 (47.5 %) | 100.0 % |
| cicero | 136 | 65 (47.8 %) | 5 (3.7 %) | 2 (1.5 %) | 64 (47.1 %) | 100.0 % |
| vergil | 292 | 237 (81.2 %) | 2 (0.7 %) | 7 (2.4 %) | 46 (15.8 %) | 100.0 % |
| ovid | 66 | 47 (71.2 %) | 0 (0.0 %) | 1 (1.5 %) | 18 (27.3 %) | 100.0 % |
| principia | 3,899 | 1,861 (47.7 %) | 10 (0.3 %) | 842 (21.6 %) | 1,186 (30.4 %) | 73.0 % |
| perseus-caesar | 16 | 13 (81.3 %) | 0 (0.0 %) | 0 (0.0 %) | 3 (18.8 %) | 100.0 % |
| perseus-cicero | 14 | 7 (50.0 %) | 0 (0.0 %) | 2 (14.3 %) | 5 (35.7 %) | 100.0 % |
| perseus-propertius | 92 | 82 (89.1 %) | 1 (1.1 %) | 0 (0.0 %) | 9 (9.8 %) | 100.0 % |
| perseus-sallust | 121 | 34 (28.1 %) | 2 (1.6 %) | 1 (0.8 %) | 84 (69.4 %) | 100.0 % |
| perseus-vergil | 36 | 29 (80.6 %) | 1 (2.8 %) | 0 (0.0 %) | 6 (16.7 %) | 100.0 % |
| perseus-ovid | 52 | 40 (76.9 %) | 3 (5.8 %) | 0 (0.0 %) | 9 (17.3 %) | 100.0 % |
| perseus-petronius | 338 | 164 (48.5 %) | 2 (0.6 %) | 4 (1.2 %) | 168 (49.7 %) | 65.7 % |
| perseus-phaedrus | 18 | 12 (66.7 %) | 0 (0.0 %) | 0 (0.0 %) | 6 (33.3 %) | 100.0 % |
| perseus-resgestae | 86 | 57 (66.3 %) | 0 (0.0 %) | 2 (2.3 %) | 27 (31.4 %) | 100.0 % |
| perseus-suetonius | 102 | 73 (71.6 %) | 1 (1.0 %) | 0 (0.0 %) | 28 (27.4 %) | 100.0 % |
| perseus-tacitus | 37 | 26 (70.3 %) | 2 (5.4 %) | 0 (0.0 %) | 9 (24.3 %) | 100.0 % |
| perseus-jerome | 17 | 8 (47.1 %) | 0 (0.0 %) | 0 (0.0 %) | 9 (52.9 %) | 100.0 % |

### Gold accuracy (first reading versus the gold annotation; aligned tokens only)

Strict = gold tag / lemma exactly as annotated (spelling folded: case, marks, ligatures, j = i, u = v). Lenient = the equivalence table below applied. "features subset" = every gold-specified feature of the nine matched, over aligned tokens that carry any gold feature.

| corpus (gold) | gold words | aligned | lemma strict | lemma lenient | lemma any-reading (lenient) | POS strict | POS lenient | lemma+POS strict | lemma+POS lenient | features subset strict | features subset lenient | lemma+POS+features lenient |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| nt (proiel) | 110,384 | 104,345 (94.5 %) | 95.6 % | 97.6 % | 99.5 % | 88.7 % | 98.3 % | 86.2 % | 97.1 % | 47.6 % | 89.6 % | 91.0 % |
| cicero (perseus-aligned) | 5,519 | 5,254 (95.2 %) | 91.7 % | 92.6 % | 97.4 % | 88.6 % | 95.2 % | 84.3 % | 90.4 % | 46.0 % | 89.5 % | 86.3 % |
| vergil (perseus-aligned) | 2,186 | 2,131 (97.5 %) | 89.5 % | 90.0 % | 96.1 % | 89.6 % | 94.6 % | 84.4 % | 87.8 % | 38.7 % | 83.9 % | 81.5 % |
| ovid (perseus-aligned) | 4,132 | 3,529 (85.4 %) | 89.6 % | 90.4 % | 96.0 % | 90.4 % | 94.4 % | 85.9 % | 88.8 % | 42.9 % | 88.5 % | 84.5 % |
| perseus-caesar (perseus-own) | 1,334 | 1,334 (100.0 %) | 87.7 % | 87.9 % | 92.8 % | 91.0 % | 95.3 % | 83.1 % | 86.2 % | 50.8 % | 88.0 % | 81.8 % |
| perseus-cicero (perseus-own) | 5,519 | 5,519 (100.0 %) | 91.6 % | 92.5 % | 97.3 % | 88.7 % | 95.2 % | 84.3 % | 90.4 % | 46.3 % | 89.2 % | 86.0 % |
| perseus-propertius (perseus-own) | 4,372 | 4,372 (100.0 %) | 90.9 % | 91.9 % | 96.1 % | 86.8 % | 95.4 % | 83.0 % | 90.3 % | 36.4 % | 86.5 % | 84.7 % |
| perseus-sallust (perseus-own) | 10,746 | 10,746 (100.0 %) | 89.1 % | 89.7 % | 94.3 % | 89.1 % | 92.5 % | 84.5 % | 87.5 % | 43.0 % | 85.9 % | 81.1 % |
| perseus-vergil (perseus-own) | 2,186 | 2,186 (100.0 %) | 89.1 % | 89.6 % | 95.5 % | 89.6 % | 94.6 % | 84.0 % | 87.5 % | 38.6 % | 84.0 % | 81.3 % |
| perseus-ovid (perseus-own) | 4,132 | 4,132 (100.0 %) | 89.2 % | 89.9 % | 95.5 % | 90.1 % | 94.3 % | 85.5 % | 88.4 % | 42.4 % | 87.9 % | 83.9 % |
| perseus-petronius (perseus-own) | 11,129 | 11,129 (100.0 %) | 88.3 % | 89.5 % | 94.6 % | 88.8 % | 93.0 % | 82.6 % | 87.0 % | 49.8 % | 87.0 % | 82.5 % |
| perseus-phaedrus (perseus-own) | 5,345 | 5,345 (100.0 %) | 92.2 % | 92.7 % | 97.2 % | 91.2 % | 95.8 % | 87.3 % | 90.7 % | 47.8 % | 89.4 % | 85.7 % |
| perseus-resgestae (perseus-own) | 2,613 | 2,613 (100.0 %) | 89.1 % | 89.3 % | 92.2 % | 87.9 % | 91.4 % | 80.8 % | 83.7 % | 40.6 % | 87.4 % | 79.6 % |
| perseus-suetonius (perseus-own) | 7,001 | 7,000 (100.0 %) | 89.9 % | 90.3 % | 94.8 % | 89.5 % | 93.8 % | 84.4 % | 87.6 % | 47.5 % | 88.6 % | 83.9 % |
| perseus-tacitus (perseus-own) | 2,881 | 2,881 (100.0 %) | 90.8 % | 91.0 % | 95.4 % | 88.7 % | 95.2 % | 84.4 % | 88.5 % | 40.0 % | 84.9 % | 82.3 % |
| perseus-jerome (perseus-own) | 8,340 | 8,338 (100.0 %) | 95.5 % | 95.6 % | 98.2 % | 93.5 % | 97.5 % | 91.0 % | 94.8 % | 48.9 % | 89.3 % | 89.4 % |

### Accuracy by how the word was read (lemma+POS lenient; n = aligned tokens)

| corpus | lexicon n | lexicon acc | rule n | rule acc | guess n | guess acc | none n |
|---|---:|---:|---:|---:|---:|---:|---:|
| nt | 103,196 | 97.2 % | 1,082 | 98.9 % | 51 | 9.8 % | 16 |
| cicero | 5,191 | 90.7 % | 52 | 80.8 % | 11 | 18.2 % | 0 |
| vergil | 2,085 | 88.8 % | 14 | 100.0 % | 32 | 18.8 % | 0 |
| ovid | 3,455 | 89.5 % | 33 | 81.8 % | 41 | 34.1 % | 0 |
| perseus-caesar | 1,295 | 87.5 % | 23 | 69.6 % | 16 | 6.3 % | 0 |
| perseus-cicero | 5,451 | 90.6 % | 54 | 85.2 % | 14 | 14.3 % | 0 |
| perseus-propertius | 4,228 | 91.3 % | 52 | 94.2 % | 92 | 44.6 % | 0 |
| perseus-sallust | 10,565 | 88.3 % | 64 | 76.6 % | 109 | 13.8 % | 8 |
| perseus-vergil | 2,136 | 88.6 % | 14 | 100.0 % | 36 | 16.7 % | 0 |
| perseus-ovid | 4,041 | 89.2 % | 39 | 84.6 % | 52 | 28.9 % | 0 |
| perseus-petronius | 10,689 | 89.0 % | 103 | 93.2 % | 314 | 24.5 % | 23 |
| perseus-phaedrus | 5,263 | 91.0 % | 64 | 90.6 % | 17 | 17.6 % | 1 |
| perseus-resgestae | 2,496 | 85.7 % | 32 | 84.4 % | 81 | 24.7 % | 4 |
| perseus-suetonius | 6,826 | 88.6 % | 72 | 94.4 % | 92 | 17.4 % | 10 |
| perseus-tacitus | 2,814 | 89.1 % | 30 | 73.3 % | 36 | 58.3 % | 1 |
| perseus-jerome | 8,271 | 95.0 % | 52 | 78.8 % | 13 | 46.1 % | 2 |

### Per-feature accuracy (strict / lenient; n = aligned tokens whose gold specifies the feature, strict n / lenient n after the skips)

| corpus | Case | Number | Gender | Person | Tense | Mood | Voice | VerbForm | Degree |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| nt | 55.3 / 92.5 (n 51,045 / 51,045) | 92.0 / 95.6 (n 70,266 / 70,040) | 67.1 / 93.9 (n 50,586 / 48,182) | 79.7 / 98.9 (n 28,393 / 22,899) | 93.7 / 95.7 (n 25,592 / 25,592) | 95.3 / 96.3 (n 19,283 / 19,283) | 92.3 / 97.1 (n 25,592 / 25,592) | 97.2 / 97.2 (n 25,690 / 25,690) | 8.1 / 97.0 (n 4,583 / 4,583) |
| cicero | 52.4 / 93.2 (n 2,805 / 2,805) | 92.2 / 95.3 (n 3,570 / 3,545) | 64.2 / 95.3 (n 2,810 / 2,570) | 98.4 / 98.4 (n 760 / 760) | 88.7 / 90.1 (n 1,192 / 1,192) | 93.3 / 94.5 (n 762 / 762) | 90.7 / 91.2 (n 1,088 / 1,088) | 91.3 / 91.3 (n 1,236 / 1,236) | 71.4 / 71.4 (n 84 / 84) |
| vergil | 35.0 / 89.1 (n 1,379 / 1,379) | 89.0 / 89.9 (n 1,676 / 1,666) | 68.7 / 90.5 (n 1,376 / 1,340) | 97.7 / 97.7 (n 300 / 300) | 83.4 / 85.2 (n 505 / 505) | 96.3 / 96.7 (n 301 / 301) | 86.3 / 86.9 (n 467 / 467) | 85.1 / 85.1 (n 511 / 511) | 60.9 / 60.9 (n 23 / 23) |
| ovid | 38.9 / 91.6 (n 2,145 / 2,145) | 92.5 / 93.8 (n 2,795 / 2,786) | 71.3 / 92.7 (n 2,145 / 2,071) | 98.5 / 98.6 (n 648 / 648) | 87.9 / 90.1 (n 937 / 937) | 96.6 / 97.2 (n 648 / 648) | 88.3 / 92.0 (n 937 / 937) | 91.9 / 91.9 (n 938 / 938) | 96.0 / 96.0 (n 25 / 25) |
| perseus-caesar | 52.7 / 91.0 (n 765 / 765) | 88.3 / 93.0 (n 931 / 914) | 67.5 / 93.3 (n 762 / 744) | 100.0 / 100.0 (n 169 / 169) | 91.8 / 92.9 (n 294 / 294) | 100.0 / 100.0 (n 169 / 169) | 92.7 / 93.8 (n 274 / 274) | 92.8 / 92.8 (n 304 / 304) | 58.3 / 58.3 (n 24 / 24) |
| perseus-cicero | 52.6 / 92.7 (n 2,962 / 2,962) | 92.0 / 95.0 (n 3,776 / 3,748) | 64.1 / 95.4 (n 2,972 / 2,719) | 98.4 / 98.4 (n 804 / 804) | 88.5 / 89.9 (n 1,254 / 1,254) | 93.0 / 94.2 (n 806 / 806) | 90.7 / 91.1 (n 1,148 / 1,148) | 91.3 / 91.3 (n 1,303 / 1,303) | 73.9 / 73.9 (n 92 / 92) |
| perseus-propertius | 32.6 / 89.2 (n 2,647 / 2,647) | 90.0 / 91.1 (n 3,276 / 3,273) | 63.5 / 90.5 (n 2,645 / 2,415) | 98.3 / 98.3 (n 630 / 630) | 89.7 / 91.2 (n 1,093 / 1,093) | 94.8 / 96.0 (n 630 / 630) | 91.2 / 91.9 (n 999 / 999) | 92.1 / 92.1 (n 1,101 / 1,101) | 50.9 / 50.9 (n 59 / 59) |
| perseus-sallust | 43.4 / 88.7 (n 6,334 / 6,334) | 89.4 / 91.8 (n 7,692 / 7,617) | 68.0 / 92.6 (n 6,339 / 6,147) | 98.6 / 98.6 (n 1,351 / 1,351) | 88.9 / 89.9 (n 2,297 / 2,297) | 97.2 / 97.8 (n 1,349 / 1,349) | 85.7 / 92.2 (n 2,298 / 2,298) | 93.1 / 93.1 (n 2,293 / 2,293) | 57.4 / 57.4 (n 61 / 61) |
| perseus-vergil | 34.8 / 89.1 (n 1,418 / 1,418) | 88.8 / 89.6 (n 1,724 / 1,714) | 68.5 / 90.4 (n 1,415 / 1,379) | 97.7 / 97.7 (n 309 / 309) | 83.8 / 85.5 (n 518 / 518) | 96.5 / 96.8 (n 310 / 310) | 86.6 / 87.3 (n 479 / 479) | 85.5 / 85.5 (n 524 / 524) | 60.9 / 60.9 (n 23 / 23) |
| perseus-ovid | 38.3 / 91.5 (n 2,490 / 2,490) | 92.3 / 93.5 (n 3,243 / 3,230) | 71.0 / 92.4 (n 2,490 / 2,407) | 98.4 / 98.5 (n 751 / 751) | 87.6 / 89.7 (n 1,091 / 1,091) | 96.8 / 97.3 (n 751 / 751) | 87.1 / 91.5 (n 1,091 / 1,091) | 91.5 / 91.5 (n 1,092 / 1,092) | 96.3 / 96.3 (n 27 / 27) |
| perseus-petronius | 51.0 / 89.0 (n 5,623 / 5,623) | 91.8 / 93.8 (n 7,767 / 7,722) | 66.3 / 92.0 (n 5,632 / 5,252) | 97.4 / 97.5 (n 2,127 / 2,127) | 90.7 / 92.2 (n 2,899 / 2,899) | 95.7 / 96.2 (n 2,124 / 2,124) | 89.1 / 93.8 (n 2,904 / 2,904) | 93.9 / 93.9 (n 2,901 / 2,901) | 90.8 / 90.8 (n 87 / 87) |
| perseus-phaedrus | 44.6 / 93.0 (n 2,985 / 2,985) | 92.8 / 95.7 (n 4,073 / 4,037) | 66.7 / 95.9 (n 2,989 / 2,852) | 98.6 / 98.7 (n 1,084 / 1,084) | 87.6 / 89.9 (n 1,629 / 1,629) | 95.8 / 96.2 (n 1,085 / 1,085) | 91.4 / 93.0 (n 1,460 / 1,460) | 92.9 / 92.9 (n 1,655 / 1,655) | 76.6 / 76.6 (n 77 / 77) |
| perseus-resgestae | 47.9 / 90.7 (n 1,725 / 1,725) | 90.9 / 92.6 (n 1,970 / 1,969) | 69.5 / 92.4 (n 1,727 / 1,693) | 99.2 / 99.2 (n 252 / 252) | 93.5 / 93.8 (n 384 / 384) | 99.2 / 99.2 (n 252 / 252) | 93.6 / 95.6 (n 360 / 360) | 94.7 / 94.7 (n 396 / 396) | 95.2 / 95.2 (n 21 / 21) |
| perseus-suetonius | 53.3 / 93.3 (n 4,070 / 4,070) | 92.9 / 95.1 (n 4,825 / 4,756) | 66.5 / 94.3 (n 4,051 / 3,972) | 99.6 / 99.6 (n 763 / 763) | 88.1 / 89.9 (n 1,440 / 1,440) | 98.3 / 98.3 (n 764 / 764) | 90.2 / 90.6 (n 1,229 / 1,229) | 89.5 / 89.5 (n 1,510 / 1,510) | 80.5 / 80.5 (n 164 / 164) |
| perseus-tacitus | 45.6 / 90.3 (n 1,819 / 1,819) | 90.9 / 92.4 (n 2,060 / 2,050) | 69.0 / 95.4 (n 1,819 / 1,787) | 100.0 / 100.0 (n 241 / 241) | 84.1 / 84.1 (n 528 / 528) | 97.9 / 98.3 (n 243 / 243) | 82.7 / 82.9 (n 462 / 462) | 84.1 / 84.1 (n 553 / 553) | 73.6 / 73.6 (n 87 / 87) |
| perseus-jerome | 55.7 / 92.5 (n 4,458 / 4,458) | 91.0 / 94.8 (n 5,741 / 5,728) | 71.4 / 94.7 (n 4,445 / 4,336) | 98.6 / 98.8 (n 1,280 / 1,280) | 93.0 / 94.7 (n 1,767 / 1,767) | 96.3 / 97.5 (n 1,280 / 1,280) | 94.0 / 96.7 (n 1,768 / 1,768) | 96.9 / 96.9 (n 1,768 / 1,768) | 30.0 / 30.0 (n 10 / 10) |

### The ten commonest part-of-speech errors (lenient classes; gold -> adapter)

**nt**: ADV -> ADJ 268 (15.1 %); NOUN -> ADJ 239 (13.4 %); VERB -> NOUN 166 (9.3 %); NOUN -> VERB 156 (8.8 %); SCONJ -> PRON 155 (8.7 %); ADV -> PRON 118 (6.6 %); ADJ -> NOUN 111 (6.3 %); ADV -> NUM 60 (3.4 %); ADV -> NOUN 50 (2.8 %); SCONJ -> ADP 50 (2.8 %)

**cicero**: ADV -> ADJ 41 (16.1 %); CONJ|SCONJ -> PRON 26 (10.2 %); VERB|AUX -> NOUN 25 (9.8 %); ADV -> PRON 21 (8.3 %); NOUN|PROPN -> VERB 17 (6.7 %); CONJ|SCONJ -> ADV 15 (5.9 %); ADJ|DET -> NOUN 14 (5.5 %); PROPN -> ADJ 12 (4.7 %); CONJ|SCONJ -> ADP 10 (3.9 %); ADJ|DET -> PROPN 9 (3.5 %)

**vergil**: ADJ|DET -> NOUN 19 (16.4 %); NOUN|PROPN -> VERB 12 (10.3 %); ADV -> ADP 11 (9.5 %); VERB|AUX -> NOUN 11 (9.5 %); ADV -> PRON 10 (8.6 %); ADJ|DET -> PROPN 9 (7.8 %); VERB|AUX -> ADJ 7 (6.0 %); ADV -> ADJ 6 (5.2 %); ADV -> NUM 4 (3.5 %); NOUN|PROPN -> ADJ 4 (3.5 %)

**ovid**: NOUN|PROPN -> ADJ 54 (27.1 %); NOUN|PROPN -> VERB 24 (12.1 %); ADJ|DET -> NOUN 18 (9.1 %); ADV -> PRON 15 (7.5 %); VERB|AUX -> NOUN 15 (7.5 %); ADJ|DET -> PROPN 13 (6.5 %); ADV -> ADJ 8 (4.0 %); ADV -> NUM 4 (2.0 %); CONJ|SCONJ -> ADP 4 (2.0 %); NOUN|PROPN -> ADV 4 (2.0 %)

**perseus-caesar**: CONJ|SCONJ -> PRON 8 (12.9 %); NUM -> NOUN 7 (11.3 %); ADV -> ADJ 6 (9.7 %); ADV -> ADP 5 (8.1 %); ADV -> PRON 5 (8.1 %); VERB|AUX -> NOUN 5 (8.1 %); ADV -> NOUN 4 (6.5 %); ADV -> NUM 3 (4.8 %); VERB|AUX -> ADJ 3 (4.8 %); ADJ|DET -> NOUN 2 (3.2 %)

**perseus-cicero**: ADV -> ADJ 43 (16.1 %); CONJ|SCONJ -> PRON 29 (10.9 %); VERB|AUX -> NOUN 26 (9.7 %); ADV -> PRON 21 (7.9 %); NOUN|PROPN -> VERB 18 (6.7 %); CONJ|SCONJ -> ADV 15 (5.6 %); ADJ|DET -> NOUN 14 (5.2 %); PROPN -> ADJ 12 (4.5 %); CONJ|SCONJ -> ADP 11 (4.1 %); NOUN|PROPN -> ADJ 11 (4.1 %)

**perseus-propertius**: ADJ|DET -> PROPN 49 (24.3 %); ADV -> ADJ 17 (8.4 %); ADV -> PRON 17 (8.4 %); ADJ|DET -> NOUN 15 (7.4 %); NOUN|PROPN -> ADJ 12 (5.9 %); VERB|AUX -> NOUN 10 (5.0 %); CONJ|SCONJ -> PRON 9 (4.5 %); NOUN|PROPN -> VERB 9 (4.5 %); INTJ -> ADP 8 (4.0 %); ADJ|DET -> VERB 7 (3.5 %)

**perseus-sallust**: NOUN|PROPN -> ADJ 200 (24.9 %); NOUN|PROPN -> VERB 62 (7.7 %); ADV -> ADJ 57 (7.1 %); PROPN -> ADJ 56 (7.0 %); CONJ|SCONJ -> PRON 51 (6.4 %); ADJ|DET -> PROPN 44 (5.5 %); ADJ|DET -> NOUN 39 (4.9 %); ADV -> PRON 37 (4.6 %); ADV -> ADP 30 (3.7 %); CONJ|SCONJ -> ADV 30 (3.7 %)

**perseus-vergil**: ADJ|DET -> NOUN 18 (15.1 %); NOUN|PROPN -> VERB 13 (10.9 %); VERB|AUX -> NOUN 12 (10.1 %); ADV -> ADP 11 (9.2 %); ADJ|DET -> PROPN 10 (8.4 %); ADV -> PRON 10 (8.4 %); VERB|AUX -> ADJ 7 (5.9 %); ADV -> ADJ 6 (5.0 %); NOUN|PROPN -> ADJ 5 (4.2 %); ADV -> NUM 4 (3.4 %)

**perseus-ovid**: NOUN|PROPN -> ADJ 58 (24.6 %); NOUN|PROPN -> VERB 28 (11.9 %); ADJ|DET -> NOUN 23 (9.8 %); CONJ|SCONJ -> PROPN 16 (6.8 %); ADJ|DET -> PROPN 15 (6.4 %); ADV -> PRON 15 (6.4 %); VERB|AUX -> NOUN 15 (6.4 %); ADV -> ADJ 9 (3.8 %); ADV -> NUM 4 (1.7 %); CONJ|SCONJ -> ADP 4 (1.7 %)

**perseus-petronius**: NOUN|PROPN -> ADJ 136 (17.5 %); ADV -> ADJ 65 (8.3 %); ADJ|DET -> NOUN 64 (8.2 %); NOUN|PROPN -> VERB 61 (7.8 %); VERB|AUX -> NOUN 40 (5.1 %); ADV -> PRON 39 (5.0 %); PROPN -> ADJ 35 (4.5 %); ADV -> CONJ 32 (4.1 %); NOUN|PROPN -> X 30 (3.9 %); ADJ|DET -> PROPN 29 (3.7 %)

**perseus-phaedrus**: ADV -> ADJ 52 (23.0 %); VERB|AUX -> NOUN 21 (9.3 %); NOUN|PROPN -> ADJ 20 (8.8 %); ADV -> PRON 15 (6.6 %); NOUN|PROPN -> VERB 15 (6.6 %); CONJ|SCONJ -> PRON 14 (6.2 %); ADJ|DET -> NOUN 12 (5.3 %); ADJ|DET -> PROPN 10 (4.4 %); ADV -> PROPN 9 (4.0 %); ADJ|DET -> VERB 6 (2.6 %)

**perseus-resgestae**: NOUN|PROPN -> PRON 67 (29.8 %); ADJ|DET -> PROPN 38 (16.9 %); NUM -> NOUN 19 (8.4 %); ADV -> X 17 (7.6 %); NOUN|PROPN -> ADJ 16 (7.1 %); PROPN -> ADJ 14 (6.2 %); ADJ|DET -> NOUN 9 (4.0 %); NOUN|PROPN -> VERB 7 (3.1 %); VERB|AUX -> NOUN 6 (2.7 %); NUM -> X 4 (1.8 %)

**perseus-suetonius**: ADJ|DET -> PROPN 67 (15.6 %); ADV -> ADJ 65 (15.1 %); ADJ|DET -> NOUN 55 (12.8 %); VERB|AUX -> NOUN 36 (8.3 %); PROPN -> ADJ 35 (8.1 %); NOUN|PROPN -> VERB 23 (5.3 %); CONJ|SCONJ -> PRON 22 (5.1 %); ADV -> PRON 21 (4.9 %); NOUN|PROPN -> ADJ 15 (3.5 %); CONJ|SCONJ -> ADP 14 (3.3 %)

**perseus-tacitus**: ADJ|DET -> NOUN 29 (20.9 %); ADV -> ADJ 20 (14.4 %); PROPN -> ADJ 19 (13.7 %); VERB|AUX -> NOUN 12 (8.6 %); NOUN|PROPN -> VERB 10 (7.2 %); ADV -> PRON 8 (5.8 %); NOUN|PROPN -> ADJ 5 (3.6 %); CONJ|SCONJ -> PRON 4 (2.9 %); ADJ|DET -> PROPN 3 (2.2 %); ADJ|DET -> ADV 2 (1.4 %)

**perseus-jerome**: NOUN|PROPN -> ADJ 83 (39.1 %); ADJ|DET -> NOUN 19 (9.0 %); VERB|AUX -> NOUN 18 (8.5 %); NUM -> NOUN 15 (7.1 %); ADV -> NOUN 12 (5.7 %); NOUN|PROPN -> VERB 12 (5.7 %); ADJ|DET -> PROPN 5 (2.4 %); CONJ|SCONJ -> PRON 5 (2.4 %); ADV -> ADJ 4 (1.9 %); CONJ|SCONJ -> PROPN 4 (1.9 %)

### Corpora, sources and licences

| corpus | what | source | licence |
|---|---|---|---|
| vulgate | Clementine Vulgate, whole Bible (73 books) | vetus-v0/data/vulgate/lat-clementine.usfx.xml (seven1m/open-bibles USFX) | public domain (Clementine Vulgate, 1592) |
| nt | Clementine Vulgate, New Testament (27 books) | vetus-v0/data/vulgate/lat-clementine.usfx.xml | public domain; gold PROIEL CC BY-NC-SA 4.0 |
| cicero | Cicero: In Catilinam 1-4, Pro Archia, De amicitia, Somnium Scipionis | romance-v0/data/la/cicero-*.text.json (Latin Wikisource) | public domain text (Wikisource page layout CC BY-SA) |
| vergil | Vergil, Aeneid 1, 2, 4, 6 (macronised) | romance-v0/data/la/vergil-aeneid-{1,2,4,6}.text.json (Latin Wikisource) | public domain text (Wikisource edition CC BY-SA) |
| ovid | Ovid, Metamorphoses 1 (macronised) | romance-v0/data/la/ovid-met-1.text.json (Latin Wikisource) | public domain text (Wikisource edition CC BY-SA) |
| principia | Newton, Philosophiae Naturalis Principia Mathematica (1687) (7,276 diagram labels excluded) | Project Gutenberg eBook #28233, https://www.gutenberg.org/cache/epub/28233/pg28233.txt | public domain; Project Gutenberg licence header kept with the file |
| perseus-caesar | Perseus treebank: Gaius Iulius Caesar: C. Iuli Commentarii Rerum in Gallia Gestarum VII A. Hirti Commentarius VII | PerseusDL/treebank_data v2.1/Latin/texts/phi0448.phi001.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-cicero | Perseus treebank: Marcus Tullius Cicero: M. Tulli Ciceronis Orationes: Recognovit brevique adnotatione critica instruxit Albertus Curtis Clark Collegii Reginae Socius | PerseusDL/treebank_data v2.1/Latin/texts/phi0474.phi013.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-propertius | Perseus treebank: Propertius: Elegies | PerseusDL/treebank_data v2.1/Latin/texts/phi0620.phi001.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-sallust | Perseus treebank: C. Sallusti Crispi: Catilina, Iugurtha, Orationes Et Epistulae Excerptae De Historiis | PerseusDL/treebank_data v2.1/Latin/texts/phi0631.phi001.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-vergil | Perseus treebank: Publius Vergilius Maro: Bucolics, Aeneid, and Georgics Of Vergil | PerseusDL/treebank_data v2.1/Latin/texts/phi0690.phi003.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-ovid | Perseus treebank: Ovid: Metamorphoses | PerseusDL/treebank_data v2.1/Latin/texts/phi0959.phi006.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-petronius | Perseus treebank: Petronius Arbiter: Petronius | PerseusDL/treebank_data v2.1/Latin/texts/phi0972.phi001.perseus-lat1.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-phaedrus | Perseus treebank: Phaedrus, Augusti libertus: Fabulae Aesopiae | PerseusDL/treebank_data v2.1/Latin/texts/phi0975.phi001.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-resgestae | Perseus treebank: anon.: Res Gestae | PerseusDL/treebank_data v2.1/Latin/texts/phi1221.phi007.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-suetonius | Perseus treebank: C. Suetonius Tranquillus: Divus Augustus | PerseusDL/treebank_data v2.1/Latin/texts/phi1348.abo012.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-tacitus | Perseus treebank: Cornelius Tacitus: Annales | PerseusDL/treebank_data v2.1/Latin/texts/phi1351.phi005.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |
| perseus-jerome | Perseus treebank: Jerome: Vulgate Bible | PerseusDL/treebank_data v2.1/Latin/texts/tlg0031.tlg027.perseus-lat1.tb.xml @ bf4334f (scored on the treebank's own text) | CC BY-SA 3.0 US (Perseus Digital Library, Tufts University) |

### Source files used in this run (SHA-256)

| key | file | bytes | SHA-256 |
|---|---|---:|---|
| clementine-usfx | `C:/Users/CJWal/dev/vetus-v0/data/vulgate/lat-clementine.usfx.xml` | 4,652,377 | `5da5f3c07fa6896d4a2b45f5f309c3ece43e554fd059b31b8ae3688bbd182baf` |
| proiel-latin-nt | `C:/Users/CJWal/dev/vetus-v0/data/proiel/latin-nt.xml` | 23,344,223 | `8622b5af6c6e0effc86e64a43a859b959437c305b40fcab32fc93576e5ebe07d` |
| romance-cicero-in-catilinam-1 | `C:/Users/CJWal/dev/romance-v0/data/la/cicero-in-catilinam-1.text.json` | 40,883 | `b981b01d7ecdedc09e746a1cc0839a6761bb999e2b0df611aabb22e40ebcb710` |
| romance-cicero-in-catilinam-2 | `C:/Users/CJWal/dev/romance-v0/data/la/cicero-in-catilinam-2.text.json` | 39,334 | `19f538a8af8acfce537de4be5fe3d396540f6795d1baa0aef4c3e659e84cd257` |
| romance-cicero-in-catilinam-3 | `C:/Users/CJWal/dev/romance-v0/data/la/cicero-in-catilinam-3.text.json` | 40,248 | `33273beb26f03c727710a43900c3c7155cdf02b932acc2f066d1fc3641bb4f39` |
| romance-cicero-in-catilinam-4 | `C:/Users/CJWal/dev/romance-v0/data/la/cicero-in-catilinam-4.text.json` | 34,733 | `44155c3a643f83bd4a600487010b52544d8efc6b46cc4e56a1e3623d24edb4c5` |
| romance-cicero-pro-archia | `C:/Users/CJWal/dev/romance-v0/data/la/cicero-pro-archia.text.json` | 39,353 | `496e339f337f9e0a80e0d62e470114f18810321e7b0ac0be9634b7d488c24dd1` |
| romance-cicero-de-amicitia | `C:/Users/CJWal/dev/romance-v0/data/la/cicero-de-amicitia.text.json` | 105,835 | `e9074cfa2222222ccee600e0bc0e7a6148fb2c206967bd4b466b7f1a59e380af` |
| romance-cicero-somnium-scipionis | `C:/Users/CJWal/dev/romance-v0/data/la/cicero-somnium-scipionis.text.json` | 21,368 | `77baef033d74adf3f5aef8cb7721ec513af132ebfe8c70d318648d38722a5c0b` |
| perseus-cicero | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi0474.phi013.perseus-lat1.tb.xml` | 666,003 | `55b12883b48e5c8489e8cd7ebc0f34fc1892642571121f1783bae5f1df43d24a` |
| romance-vergil-aeneid-1 | `C:/Users/CJWal/dev/romance-v0/data/la/vergil-aeneid-1.text.json` | 73,720 | `66787a6fb73d1fddab17bbd303d379d4bb0addd62d3ac8cad01cd13bb906f9c8` |
| romance-vergil-aeneid-2 | `C:/Users/CJWal/dev/romance-v0/data/la/vergil-aeneid-2.text.json` | 78,214 | `a06f0a44db2843056ad0aa282b0562203e0f213f76f299b983170a9a8d0bdbc9` |
| romance-vergil-aeneid-4 | `C:/Users/CJWal/dev/romance-v0/data/la/vergil-aeneid-4.text.json` | 69,212 | `8c80085e4019b3401b234c87d8272560432d18ddf057893465846874e679c0d6` |
| romance-vergil-aeneid-6 | `C:/Users/CJWal/dev/romance-v0/data/la/vergil-aeneid-6.text.json` | 87,057 | `168a954cfae55460eaba528d43600923d6e643a18cdc42083e540d69bf0aefe1` |
| perseus-vergil | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi0690.phi003.perseus-lat1.tb.xml` | 288,975 | `cb2a94852cd8320e8f4ac63cb941899a7381e581fc62138c52d9eb1bbbed24c0` |
| romance-ovid-met-1 | `C:/Users/CJWal/dev/romance-v0/data/la/ovid-met-1.text.json` | 75,588 | `92c8c661503b5f206f0a61a9ba69962c52db003199b7fc8f8b0dd7ea78fc23e1` |
| perseus-ovid | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi0959.phi006.perseus-lat1.tb.xml` | 726,704 | `3372ca14b792d4e888307b77eb6f4175b0dec4be56d0953d01ac627a8f6c32e1` |
| principia-pg28233 | `C:/Users/CJWal/dev/latin-eval-sources/principia/pg28233.txt` | 851,750 | `a734045637deef5f22ce71d469deb44b19f73583d9576a9646db8dd3431b30ab` |
| perseus-caesar | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi0448.phi001.perseus-lat1.tb.xml` | 217,789 | `74b0fd8486ca71501a5f57c4363bfb321330bb5678923f6dbe08e48075f6dd75` |
| perseus-propertius | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi0620.phi001.perseus-lat1.tb.xml` | 538,755 | `a61ffec0631c8dd46a2109c0a4e7e715d08dd16460dc17829d7b8e3e2a3c2b29` |
| perseus-sallust | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi0631.phi001.perseus-lat1.tb.xml` | 1,323,586 | `07febef0f140f508a1978a94a79d3c82a672a8c2ef094c1e49c63f36ef715ea1` |
| perseus-petronius | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi0972.phi001.perseus-lat1.xml` | 1,451,109 | `edcaa56832a116904905c6fc5bb66dc8fbfd34b8597a38f8ac3ff0f82c7dfa46` |
| perseus-phaedrus | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi0975.phi001.perseus-lat1.tb.xml` | 751,179 | `5e2d99af8fd3a7fd56d7cd14c21cd23271247712785c29155cb6a69d43a4a929` |
| perseus-resgestae | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi1221.phi007.perseus-lat1.tb.xml` | 348,368 | `9130f3e018588eafa7295b717507104cc409d38d887b39d318aae85c460e1760` |
| perseus-suetonius | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi1348.abo012.perseus-lat1.tb.xml` | 828,254 | `e974a30eb87cac19ad4ccedc37f9784d11f663ebab25f6b62134ba703e667aaa` |
| perseus-tacitus | `C:/Users/CJWal/dev/latin-eval-sources/perseus/phi1351.phi005.perseus-lat1.tb.xml` | 358,558 | `eb1cd0d7ea6bfb7a9184e8ac4eb6405d2c6a0e547fde06b4a194a835668696ab` |
| perseus-jerome | `C:/Users/CJWal/dev/latin-eval-sources/perseus/tlg0031.tlg027.perseus-lat1.tb.xml` | 937,434 | `e81b2b6849561bbd720c0c34244cc33aeb3159d6eff3b20db7c7d27fee135820` |

### Equivalence table (lenient score only)

**Lemma groups** (each group counts as one lemma):

| group | why |
|---|---|
| ego = nos | PROIEL lemmatises nos / noster-less plural forms apart from ego; the adapter (and Perseus) give one lemma |
| tu = vos | same for vos / tu |
| sui = se | reflexive pronoun: Perseus and PROIEL use sui or se |
| qui = quis | relative / interrogative / indefinite: PROIEL keeps qui and quis apart, the adapter may give either |
| aliquis = aliqui | indefinite pronoun and adjective |
| quisquam = quicquam | indefinite |
| quidam = quedam | indefinite (inflected stem) |
| ullus = ulla | gender-form lemma |
| is = ea = id | demonstrative lemma written by gender form |
| ipse = ipsa | gender-form lemma |
| idem = eadem | gender-form lemma |
| hic = haec | gender-form lemma |
| ille = illa | gender-form lemma |
| iste = ista | gender-form lemma |
| unus = una | gender-form lemma |
| alius = alia | gender-form lemma |
| neque = nec = que | Perseus lemmatises neque and -que as que |

**Spelling and form rules:**

- ae and oe are written e (caelum = coelum = celum): medieval and Vulgate spellings; ii is written i (eicio = eiicio, Iacob)
- deponent lemma written -or by one side and -o by the other (loquor = loquo; sequor = sequo): the lemma of a verb with a passive-looking form; applies to verbs only
- a gold lemma of an enclitic host is also accepted as host + que / ve (ne + que = neque, uter + que = uterque)
- trailing homograph numbers of the Perseus lemmas (sum1, qui2) are dropped
- a Perseus / PROIEL proper-noun lemma is compared without case

**Part-of-speech classes** (merged in the lenient score):

| class | why |
|---|---|
| NOUN = PROPN | proper / common noun is a convention (Perseus does not mark it) |
| VERB = AUX | sum as copula / auxiliary versus full verb |
| CONJ = SCONJ | Perseus has one conjunction tag; PROIEL splits C- / G- |
| PRON = DET | hic, ille, meus, qui as pronoun or determiner depends on the head, not the form |
| ADJ = NUM | unus, duo, primus: numeral or adjective |

**Word-level POS conventions** (lenient: for a token whose gold lemma is listed, all tags of the class are one tag; homograph errors are not forgiven):

| convention | tags treated as one | lemmas | why |
|---|---|---|---|
| connectives | ADV = CONJ = SCONJ | autem, enim, nam, ergo, igitur, itaque, tamen, at, et, etiam, quoque, sed, vero, quidem, atque, ac, nec, neque, aut, vel, sive, seu, si, nisi, sin, quamquam, quoniam, quia, quasi, velut, sicut, sicuti, ut, ne, ubi, quando, dum, donec, postquam, antequam, priusquam, quam, quomodo, unde, cur, quare, quamvis, licet, tum, tunc, deinde, denique, ideo, proinde, porro, immo, ceterum, verumtamen, verum | PROIEL tags many connectives and relative / subordinating adverbs Df / Dq (adverb); the adapter tags them CONJ / SCONJ, UD Latin tags some CCONJ |
| negation and question particles | ADV = PART | non, ne, nonne, num, nondum, haud, an, utrum, numquid, utinam | non, ne, num, nonne, haud: UD Latin tags them PART, PROIEL Df (adverb) |
| interjections | ADV = INTJ = PART | amen, ecce, o, heu, vae, euge, alleluia, hosanna, en, eia | amen, ecce, o: interjection or adverb |
| pronominal adjectives | ADJ = DET = PRON = NUM | omnis, suus, meus, tuus, noster, vester, alius, alter, quantus, talis, nullus, ullus, totus, solus, ipse, idem, ille, iste, hic, is, quidam, quisque, quivis, quilibet, aliquis, aliqui, multus, plurimus, tantus, qualis, uterque, uter, neuter, ceterus, reliquus, tot, quot, nonnullus, quisquam, cunctus, universus, ambo, unus, qui, quis, quicumque, quicunque, quotquot, paucus, plerusque, alteruter | omnis, suus, meus, alius, ipse, quidam ...: adjective, determiner or pronoun by use, not by form |
| nominal indefinites | NOUN = PRON | nemo, nihil, nihilum, aliquid, quidquam, quicquam, nullus | nemo, nihil: Perseus tags them noun, the adapter pronoun |

Participle / adjective: gold ADJ versus adapter VERB with VerbForm=Part (and the reverse) is one tag in the lenient score.

**Features not scored in lenient** (left out of the lenient denominator, still in the strict one):

- Gender of ego, tu, nos, vos, sui / se: first and second person pronouns have no gender; the gold gives masculine by default
- Number of sui / se: the reflexive has no number of its own
- Person of a non-verb (is, ipse, hic ...) when the adapter gives no Person: the gold marks third person on pronouns, the adapter does not

**Gold tag -> acceptable UPOS in the strict score.** PROIEL: A- ADJ, Df ADV, Dq ADV, Du ADV, S- DET, Ma NUM, Mo NUM, Nb NOUN, Ne PROPN, C- CONJ, G- SCONJ, Pp PRON, Pk PRON, Pc PRON, Pr PRON/DET, Pi PRON/DET, Pd PRON/DET, Px PRON/DET, Py PRON/DET, Ps PRON/DET, Pt PRON/DET, R- ADP, I- INTJ, F- X, V- VERB, N- X, X- X; V- with lemma sum AUX/VERB. Perseus: n NOUN/PROPN, v VERB/AUX, t VERB, a ADJ/DET, d ADV, c CONJ/SCONJ, r ADP, p PRON/DET, m NUM, i INTJ, e INTJ, l DET, g PART, x X; n with a capitalised lemma PROPN; v with lemma sum AUX/VERB.

**Feature rules.** Gold features are the nine UD-style keys; PROIEL / Perseus letters are mapped as in the code (`proielFeats`, `perseusFeats`). Underspecified gold values (PROIEL gender p = Masc/Fem, case c = Gen/Dat, mood e = Ind/Sub ...) are sets: strict needs the adapter's value to be one member (or the adapter's union to equal the set); lenient needs overlap. The adapter's unions ("Acc,Nom,Voc") count as a miss in strict and as a hit in lenient when they contain the gold value. A missing Degree on the adapter's side reads as positive in lenient. A deponent's voice (lemma in -or on either side) is not compared in lenient beyond "the adapter gave a voice".

**Alignment.** Adapter word tokens are aligned to the gold words by a longest-common-subsequence over folded word forms (verse by verse for PROIEL; sentence by sentence for the Perseus text; over the whole work, keeping only runs of five or more consecutive matches, for the on-disk Cicero / Vergil / Ovid). Unaligned words are excluded from accuracy and counted in the "aligned" column.

<!-- END GENERATED -->

## Reading the first baseline (adapter fingerprint 6f8638e8e7c4f143, 2026-10-19)

Read this next to the tables above; the figures move as the adapter lane works, the categories mostly will not.

- **Distance from "near 100 %".** On the New Testament, where the seed lexicon was ranked by Vulgate frequency, the first reading has the right lemma 91.8 % of the time strictly (93.6 % lenient) and lemma + POS 82.0 % strict / 93.0 % lenient; every gold feature right (lenient) 83 %; lemma + POS + features 86 % lenient. On classical Latin it is far lower: Cicero lemma 77 / 78 %, lemma + POS 69 / 76 %; Vergil lemma 65 % and lemma + POS 59 / 62 %; Ovid lemma 68 / 69 %, lemma + POS 64 / 67 %; the other Perseus authors lie between 66 % and 74 % on lemma and 62 % to 71 % on lemma + POS (lenient), and Jerome (Perseus) 92 % / 91 %. Coverage (any reading) is 96 % on the Vulgate, 88 % on Cicero, 77 % on Vergil, 76 % on Ovid, 82 % on Principia. *Any reading is not accuracy*: when the lexicon confirms a word the lemma + POS is right 98 % of the time on the NT and 90-92 % on the classical corpora, but a reading by an ending guess is right only about half the time (46-57 %), so the 5-13 % guessed tokens are mostly errors (table "Accuracy by how the word was read").
- **Missing vocabulary is the first problem.** Most unconfirmed / missing tokens are ordinary common words absent from the seed lexicon (Cicero: *publicus, civis, senatus, consul, periculum, denique, exilium*; Vergil: *fatum, pectus, moenia, sidus, limen, litus, telum, dea, ingens, haud, tot, equidem, uates*; Vulgate: *vasa, habitatores, libro, oleum, ossa, requiem, dexter*), not exotic ones. Hundreds of high-frequency lemmas would move Cicero / Vergil / Ovid most. The "listed forms cover" column says how much of the miss mass the 300 listed forms carry (25-45 % on most corpora; 14 % on the whole Vulgate, whose tail is long).
- **Proper names** are 9-33 % of the unconfirmed tokens (capitalised inside a sentence): Hebrew names with their Vulgate declension (*Judaeorum, Joannes, Edom, Jordanis, Abrahae, Isai, Sedecias*), Greek declension (*Aeneas, Aenean, Dido, Anchises, Phaethon, Priami, Teucri, Danaum*), Roman names (*Catilina, Scaevola, Scipio, Quirites*). The adapter reads them as a guessed PROPN whose lemma is the surface form (*Catilinam* for *Catilina*, *Abraha* for *Abraham*, *Iudaeorus*), so the lemma is wrong even when the POS is right. Roman abbreviated praenomina (*L., M., C.*) are read as numerals (*Lucius*, *Marcus* -> NUM).
- **Poetic and archaic forms:** genitive plural *-um* (*Danaum*), Greek forms of names (*Aeneas / Aenean / Aenea*, *Anchises / Anchisa*, *Dido*), and plain verse vocabulary (*fata, pectore, moenia, sidera, limina, litora, tela, aequora*); macron-marked text is handled (the marks are folded). Vergil and Ovid are the lowest corpora (no reading: 23 % and 24 % of tokens).
- **Enclitics:** words ending *-que / -ve / -ne* without a known host are 2-8 % of the misses (more in verse); the treebanks split the enclitic off and the adapter must find the host.
- **Principia's mathematical and physical vocabulary** (*centrum, punctum, velocitas, distantia, gravitas, spatium, quadratum, rectangulum, proportionalis, duplicata, dimidiata, reciproce, fluidum, resistentia, syzygiae, nodi, quadratura, cometa, sphaera, particula*) accounts for most of its misses; early-modern orthography (*q;*, *&*) is handled by preprocessing (the *ae* ligature is folded by the adapter), not by the adapter, which would see the raw text otherwise (`--raw-principia`). Newton also uses indeclinables and adverbs (*seu, uniformiter, inverse, reciproce*) missing from the lexicon.
- **Part-of-speech (lenient) errors that are not missing words:** a noun read as a verb or the reverse (*vox* -> *voco*, *scriptura* -> *scribo*, *consul* -> *consulo*, *mortuus* -> *morior*, *vivis* -> *vivo*); a pronoun or relative form read for a conjunction or adverb (*quod, quam, quo* -> qui; *cum* preposition / conjunction); adjectives used as nouns or adverbs (*primum, multum, solum, forte, vere*) read as the adjective.
- **Lemma conventions that remain errors in lenient:** *nostri* -> *nos* for *noster*; *vestrum*, *mei* -> *ego* for *meus*; Greek and Hebrew name lemmas; *Maria*; gold lemmas of participles used as nouns.
- **Features (given a right lemma and POS):** the dominant failures are ranking mistakes between homographs (*haec* read Fem Sing Nom where the gold has Neut Plur Acc; *quis* read as dative / ablative plural; *illi*, *ipsi*, *multi*, *filii*, *discipuli*, *pharisaei* read as genitive / dative singular instead of nominative plural; *facere* as a finite passive instead of the infinitive), unions in the adapter's output ("Acc,Nom,Voc", scored as a miss in strict) and a missing `Degree=Pos` (strict only, 6 % for the NT; the lenient column reads absence as positive). The adapter is far better on Number / Tense / Mood / VerbForm than on Case and Gender.
- **What I could not measure:** the whole Vulgate Old Testament has no gold, so its accuracy is unknown (coverage only; the NT figures are the best estimate, probably optimistic because the lexicon was ranked on the Vulgate); Principia has no gold at all; Perseus's Vergil and Ovid files cover only part of the poems, so the aligned scores for those rest on 2,100 and 3,500 words, not whole books.

## Reading the second baseline (adapter fingerprint 6219833f55d47516, 2026-10-25)

The gap work of 2026-10-25 (docs/latin/ADAPTER.md, "The gap work of 2026-10-25"): the Vulgate's names as a lexicon backstop, the capitalised-name
weight, hand-written Vulgate form priors, eight missing Vulgate nouns, loca for locus, three medieval spelling habits. Against the first baseline:

- Vulgate unconfirmed-or-missing tokens 1,067 -> 509; the capitalised ones among them 638 -> 144; lexicon-confirmed 97.2 -> 97.3 %, guesses 0.2 -> 0.1 %.
  NT: 300 -> 162 unconfirmed; lexicon-confirmed 98.5 -> 98.7 %. Classical corpora and the Principia: unchanged to the tenth, apart from Vergil
  (lemma strict 89.8 -> 89.5: three tokens, a name reading now preferred inside a sentence where the gold has the common noun).
- NT gold: lemma lenient 97.5 -> 97.6, lemma any-reading 99.4 -> 99.5, lemma+POS lenient 97.0 -> 97.1. *Maria* (37), *scribis* (16), *laudem*, *legi*
  and *loca* have left the lemma miss list; what remains at the top is convention (quod, Iudaei, mortuus, vester, primum, amplius).
- The Vulgate form priors were written from this evaluation's NT miss list, so the NT rows are no longer blind to them; the names and the
  spelling work were not tuned on gold. Everything else about the method is as in the first baseline.

## Caveats

- Gold is itself imperfect and conventional: PROIEL and Perseus lemmatise and tag some closed-class words differently from one another and from this adapter; the lenient score is a convention-adjusted figure, not the truth, and the strict one is a harsh floor. Gold personal pronouns carry gender and third-person `Person` which the adapter rightly leaves off (lenient skips those; strict counts them).
- Alignment drops 5 % of the NT words and 15 % of Ovid (the Wikisource and Perseus editions differ in readings); unaligned words are not in any accuracy figure.
- First reading only. A parser using the sentence could pick better; `lemmaAnyLenient` (lemma right in some candidate) is the ceiling for pure re-ranking.
- Lenient lemma equivalence is by lemma pair, not by context; a pair like *qui / quis* hides a few real errors.
- Corpus-level gold alignment (Cicero / Vergil / Ovid on Wikisource) and treebank-own-text scoring agree to within a few points, which is the best check I have that the alignment is not inflating anything.
- Word totals depend on the adapter's tokenizer (`isWord`); a change in tokenising moves the denominators.
- The index build time and words per second depend on the machine and on what else is running.

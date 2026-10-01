# Thai benchmarks

Segmentation is a release gate (docs/PLAN6.md, constraint 3). This file holds the benchmarks that gate it. Sections 1 to 3
(word segmentation) are written by package H1, section 4 (reading units, boundary sensitivity) by package H2.

Reproduce everything with `npm run gold:wiktionary` then `npm run bench:words` (about two seconds each). Attribution for
every number and word below that comes from the dictionary source: Wiktionary, via kaikki.org — CC BY-SA 4.0.

## 1 Gold format, conventions and tools for word segmentation

**Gold row** (JSON Lines, one sentence per line; `src/bench/gold/types.ts`):
`{ id, lang: "th", stratum, text, boundaries, source: { title, licence, rights }, tokenizedBy, checkedBy?, checkedAt?, heldOut?, notes? }`.

- `rights` is `rights-safe`, `personal-copy` or `derived-cc-by-sa`. Nothing is inferred: a course document whose rights
  are not clearly safe is drafted as `personal-copy`, and course gold lives under `data/private/` (git-ignored).
- `checkedBy` and `checkedAt` go together and mean a named person corrected and approved the boundaries. A row without
  them is machine-derived; only checked rows count toward the course target.
- Strata: the eight course strata (`stage0`, `mana-mani`, `childrens-literature`, `modern-literary`, `grade8-literary`,
  `regional`, `chotmai`, `scripture`) and, for the dictionary-derived set only, `wiktionary-example` and `wiktionary-quotation`.

**Conventions** (applied by the validator, the metrics and every system):

- `boundaries` are UTF-16 code-unit offsets at which a new word starts, excluding 0, strictly increasing. They lie on
  user-perceived character boundaries, never before a Thai vowel sign or tone mark (ะ ั า ำ ิ ี ึ ื ฺ ุ ู ็ ่ ้ ๊ ๋ ์ ํ), never
  right after a Thai leading vowel (เ แ โ ใ ไ), never on whitespace.
- Whitespace is never a word. A word is the slice between two cuts, trimmed. A cut placed on a space is moved forward to the
  next word start (`canonicalBoundaries`), so "a| b" and "a |b" mean the same.
- Each punctuation mark is a word of its own (the adapter and ICU both emit punctuation as separate tokens). The Wiktionary
  set contains no punctuation (see section 3); the convention matters for the course set.
- The text is NFC, trimmed, without `|`, line breaks or a leading `#`; re-joining the words reproduces the text exactly.

**Editing format** (any text editor): per sentence a header line and a line with `|` between words.

    ## comment lines start with two hashes
    # stage0-1a2b3c4d [held-out]
    ฉัน|รัก|พระเจ้า

`toEditing` / `fromEditing` convert both ways; the round trip is tested, malformed files are reported by line, never guessed.
`validateGold` returns every problem of a row (bad id, lang, stratum, source, boundaries, NFC, edge whitespace, forbidden
characters, rejoin mismatch).

**Systems** share one interface `(text) => boundaries` (`src/bench/words/systems.ts`):

| system | what it is |
| --- | --- |
| `adapter` | the real `thAdapter.tokenize`: ICU dictionary segmentation plus the course compound list (19 words) |
| `icu` | `Intl.Segmenter('th')` alone, no course compounds |
| `dict-mm` | **our own baseline, not an established tokenizer**: maximal matching over the Wiktionary headwords (17,228 Thai-only headwords, multi-word expressions and affixes left out), fewest unknown characters first, then fewest tokens |
| `external:<name>` | a file in the editing format produced by another tool (PyThaiNLP `newmm` or any other) |

**Metrics** (`src/bench/words/metrics.ts`): boundary precision / recall / F1 (micro, overall and per stratum; 0 / 0 counts as 1,
counts are always carried), word-level precision / recall / F1 (a word is right only when both edges are), sentence
exact-match rate. **Every sentence with an error is kept** in `<gold dir>/errors/<system>.errors.jsonl`: gold line, system line
and the differing spans, each classified over-split (system cut where gold has none), under-split (system left out cuts gold has)
or shifted (both).

## 2 Course gold set: the workflow, ready for the first lawful texts

The course set is empty today: no lawful book text has been supplied, and none is downloaded or inferred.
`npm run gold:status` prints sentences per stratum against the target of 500 to 1,000 checked sentences overall and names the
empty strata (today all eight).

1. `npm run gold:draft -- <file.json|file.txt> --stratum <stratum> --n 60 --seed 1 [--held-out]` samples sentences from a
   supplied text (a v2 corpus document, or plain text with a newline between sentences) and writes the adapter's segmentation
   as a DRAFT under `data/private/benchmarks/th/<stratum>/` (git-ignored). The sample is seeded and deterministic; sentences
   already accepted or already drafted are never sampled again; sentences that are not NFC, contain `|`, a line break or
   a leading `#`, or have no Thai are skipped and counted. `--title` and `--rights` override what a plain text cannot say; a
   plain text is `personal-copy` unless told otherwise. An existing draft is never overwritten without `--force`.
2. A person corrects the `|` boundaries in any editor (the draft header says how; letters may not change).
3. `npm run gold:accept -- <draft> --by "Name"` validates and writes `<name>.gold.jsonl` with `checkedBy` / `checkedAt`. It refuses
   without `--by`, refuses a draft nobody changed (compared with a digest recorded in the draft) unless `--confirm-unchanged`,
   refuses invalid boundaries, malformed files, a missing stratum or source, duplicate ids, ids already in the set, and will not
   overwrite a file without `--overwrite`. It prints counts only.
4. `npm run gold:freeze -- --name <id> [--strata a,b] [--held-out-only]` freezes the checked files into
   `data/private/benchmarks/th/frozen/<id>.json`: each file's sha256, sentence and paragraph counts per stratum, who checked
   them and when, the tool versions and a set hash. Rows without `checkedBy` cannot be frozen. A frozen set is immutable:
   `gold:accept` refuses to write into one of its files, and `bench:words -- --frozen <id>` verifies every hash first and
   refuses to run if a file changed.
5. `npm run bench:words -- --frozen <id> --report` runs the systems on the frozen set and writes a dated report (frozen id and
   set hash, who checked, tool and ICU versions, per-stratum boundary and word P / R / F1, exact match, the errors path) to
   `data/private/benchmarks/th/reports/` (local). Without `--frozen`, `--gold <dir>` runs on any gold directory.

**Reading units.** `gold:draft --kind units` samples paragraphs and drafts the adapter's unit boundaries in H2's format
(`src/bench/units/gold.ts`, imported unchanged); `gold:accept --kind units --by "Name"` accepts the corrected draft into
`data/private/benchmarks/th/units/<name>.units.jsonl`; `gold:freeze` puts it in the same manifest; `bench:units -- --gold
data/private/benchmarks/th/units` scores it (run `gold:freeze -- --verify <id>` first: `bench:units` does not check hashes).

The step-by-step procedure for a non-programmer (what text counts, how many sentences, the `|` conventions to decide once, what
to do with a doubtful case, what the results may be used for) is `docs/thai/GOLD_WORKFLOW.md`.

**Held-out sentences** (`--held-out` at draft time, `heldOut: true` in the row) are never printed by any tool. Ordinary runs leave
them out; only an explicit `bench:words --held-out` run evaluates them (and only them), prints numbers only, and writes their
errors, with text, to `<system>.heldout.errors.jsonl` in the git-ignored errors directory. Tune on the ordinary rows, report on
the held-out ones once.

**PyThaiNLP `newmm`: run on 2026-10-01 (results in 3.7).** When this section was first written Python was not installed
and the comparison was pending. The two commands, on a machine with Python:

    python scripts/external/pythainlp_tokenize.py --gold data/benchmarks/th/generated --out data/benchmarks/th/generated/external/newmm.edit.txt
    npm run bench:words -- --external newmm=data/benchmarks/th/generated/external/newmm.edit.txt

(Requirement: Python 3.9 or later and `pip install pythainlp`, in a virtual environment, run by the owner or with the owner's
go-ahead; only the Microsoft Store alias stub exists on this machine, and nothing was run or installed. For the course gold set use
`--gold data/private/benchmarks/th` and `--frozen <id>`; see `docs/thai/GOLD_WORKFLOW.md`, step 7. The script refuses to write a
file if the engine changes the text.) Until that is done, section 3
compares the adapter only with ICU alone and with our own `dict-mm`, and the claim "benchmarked against an established tokenizer"
is not yet met.

## 3 First benchmark: Wiktionary usage examples

### 3.1 How the set is derived

`npm run gold:wiktionary` reads the usage examples of the Thai entries in the kaikki.org extract (source Last-Modified 2026-09-28,
21,020 lines, 6,206 examples). Each example has the Thai `text` and a Paiboon romanization in which the Wiktionary editor put a
space between words, hyphens between the syllables of one word and " · " at phrase breaks. Each romanized word is laid over the text
by dynamic programming (`src/bench/gold/align.ts`): the word at position i must be a headword the text starts with there, and one of
the romanizations the dictionary itself lists for that headword (every reading) must equal the editor's romanized word (hyphens,
case and spaces ignored, tone marks kept). An example is kept only if the whole text is consumed and exactly one sequence of headwords
does it. Output (git-ignored, CC BY-SA): `data/benchmarks/th/generated/wiktionary-examples.gold.jsonl`, with
`tokenizedBy: "Wiktionary editors (romanization word breaks), aligned automatically"` and `rights: derived-cc-by-sa`.

**Aligned: 3,116 of 6,206 examples (50.2 %)**: 2,657 `wiktionary-example` and 459 `wiktionary-quotation`. Not aligned:

| reason | examples |
| --- | ---: |
| a romanized word is no reading of any headword (the word is not a headword, or the editor's spelling differs) | 993 |
| the example has no romanization | 988 |
| the text has digits, Latin letters or punctuation (only Thai letters, marks and spaces are accepted) | 887 |
| every word is known but no sequence of headwords fits text and romanization | 150 |
| the same text as an example already kept | 70 |
| no text | 2 |
| more than one possible alignment | 0 |

### 3.2 What this set is, and what it is not

- **The word division is the Wiktionary editors', a convention that is not the course's.** The editors write long compounds as one
  word (ความขัดแย้ง, ผู้ต้องสงสัย, ประโยชน์ส่วนรวม) and split others (พระ|อาทิตย์, นิร|ภัย), and the same sequence is divided differently
  in different examples (ไม่ใช่ whole in one, ไม่|ใช่ in another). Hence a "wrong" boundary here is often just another convention.
- **Only sentences whose every word is a Wiktionary headword can align**, so the set is made of dictionary words. Systems that use a
  dictionary are favoured, `dict-mm` most of all, since its word list is the very list the sentences were aligned against. The set is
  **not representative of book prose**: sentences are short (median 2 words, 95th percentile 11, longest 40; 62 % have 3 words or fewer),
  mostly noun phrases, and clustered by template: 195 start with ประเทศ and 114 with สาธารณรัฐ (a country name follows). Names,
  loans and numerals that Wiktionary has no entry for are exactly what is missing.
- **`dict-mm` is our own baseline**, written for this benchmark, not an established tokenizer.
- The comparison with PyThaiNLP `newmm` was run later (section 3.7): parity on this set, opposite error profile.
- Nothing here measures the course's own word convention. That needs the course gold set (section 2).

### 3.3 Checking 60 aligned sentences by eye

A deterministic sample (seed 1, `wiktionary-sample.edit.txt`, 60 sentences) was read in full. In all 60 every cut falls between two whole
romanization chunks and no letter is lost or moved; spaces inside the text (for example between a name and a title) are handled and
the boundary sits at the start of the following word. What I could and could not judge: I checked that the alignment reproduces the
editors' word breaks; I cannot judge from the alignment alone whether those breaks are good Thai word division. Seen in the sample:
short noun phrases (a country, a language, a people) dominate; compounds are often kept whole (คณะกรรมการ, ผู้ทรยศ, ประโยชน์ส่วนรวม)
and sometimes split (พระ|อาทิตย์, นิร|ภัย); quotations are longer than the examples. I found no mis-alignment in the 60, which is not a proof for the other 3,056.

### 3.4 Results

Runtime: Node v24.19.0, ICU 78.3 (Unicode 17.0). ICU's dictionary is part of the runtime, so the `icu` and `adapter` rows depend on it.
Percentages. "boundary" counts each cut; "word" counts a word right only if both edges are right; "exact match" is the share of sentences with no error.

| stratum | system | sentences | boundary P | boundary R | boundary F1 | word P | word R | word F1 | exact match |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| wiktionary-example | adapter | 2657 | 83.35 | 96.51 | 89.45 | 77.03 | 85.56 | 81.07 | 66.88 |
| wiktionary-example | icu | 2657 | 82.87 | 96.57 | 89.20 | 76.31 | 85.16 | 80.49 | 65.86 |
| wiktionary-example | dict-mm | 2657 | 99.83 | 91.95 | 95.73 | 94.21 | 88.99 | 91.53 | 83.93 |
| wiktionary-quotation | adapter | 459 | 86.40 | 97.51 | 91.62 | 76.28 | 85.04 | 80.42 | 28.76 |
| wiktionary-quotation | icu | 459 | 86.27 | 97.56 | 91.57 | 76.08 | 84.97 | 80.28 | 28.32 |
| wiktionary-quotation | dict-mm | 459 | 99.57 | 96.28 | 97.90 | 96.22 | 93.38 | 94.78 | 76.47 |
| **all** | adapter | 3116 | 84.49 | 96.89 | 90.27 | 76.79 | 85.39 | 80.86 | 61.26 |
| **all** | icu | 3116 | 84.14 | 96.95 | 90.09 | 76.24 | 85.10 | 80.42 | 60.33 |
| **all** | dict-mm | 3116 | 99.72 | 93.59 | 96.56 | 94.87 | 90.42 | 92.59 | 82.83 |

Error spans (a sentence can hold several):

| system | sentences with an error | over-split spans | under-split spans | shifted spans |
| --- | ---: | ---: | ---: | ---: |
| adapter | 1207 of 3116 | 1308 | 244 | 61 |
| icu | 1236 of 3116 | 1358 | 238 | 61 |
| dict-mm | 535 of 3116 | 3 | 597 | 18 |

**Reading the table, with the caveats above.** Boundary recall of `adapter` and `icu` is high (96.9 %): they rarely miss a cut the editors
made. Their precision is much lower (84.5 %): they cut where the editors kept a word whole. Of the 1,613 error spans of `adapter`:
1,045 (65 %) are splits into pieces that are all themselves headwords, mostly compounds and ความ- / ผู้- / การ- forms the editors
write as one word (ความรัก, ผู้จัดการ, ที่นี่); 263 (16 %) are splits where some piece is not a word at all, that is fragmentation of
words ICU does not know (loan words and place names: สติกเกอร์ → สติ|ก|เกอร์, อาเซอร์ไบจาน → อา|เซ|อร์ไบ|จาน, ปัญจาบ → ปัญจ|าบ), the
one class that is a plain error under any convention; 244 (15 %) are merges of two editor words (ไม่มี, ไม่ใช่, ทำให้, ประเทศไทย),
the reverse convention gap (the hand lexicon itself lists ไม่มี as one word); 61 (4 %) are shifted cuts. A word recurring many times
inflates counts: ประเทศ is split as ประ|เทศ 28 times, in the template "ประเทศ + country name" where ICU lacks the name. The course compound
list moves the adapter very little relative to ICU (boundary F1 90.27 against 90.09; 29 fewer sentences with an error). `dict-mm` scores
highest but this is largely because it is built from the same word list as the gold (its few over-splits, 3 spans, show that
it almost never cuts where the editors kept a word); its errors are 597 merges such as ไม่มี and ไม่ได้, where its fewest-tokens rule picks
the longer headword. None of these figures is a claim about book prose.

### 3.5 The 50 most frequent error patterns per system

Pattern = the editors' words over the differing stretch (¦ marks a boundary) against what the system produced. Ties are ordered
alphabetically; counts are across the 3,116 sentences. Full error cases (text, gold line, system line) stay in
`data/benchmarks/th/generated/errors/` (git-ignored).

#### Most frequent error patterns: adapter

| # | kind | gold (editors) | adapter | count |
| ---: | --- | --- | --- | ---: |
| 1 | over-split | ประเทศ | ประ¦เทศ | 28 |
| 2 | under-split | ไม่¦มี | ไม่มี | 18 |
| 3 | over-split | สาธารณรัฐ | สาธารณ¦รัฐ | 13 |
| 4 | over-split | ราชอาณาจักร | ราช¦อาณาจักร | 12 |
| 5 | over-split | เครื่องบิน | เครื่อง¦บิน | 8 |
| 6 | over-split | ตัวเอง | ตัว¦เอง | 8 |
| 7 | over-split | ที่นี่ | ที่¦นี่ | 8 |
| 8 | over-split | น่ารัก | น่า¦รัก | 8 |
| 9 | over-split | สาธารณรัฐ | สา¦ธารณ¦รัฐ | 8 |
| 10 | under-split | ไม่¦ใช่ | ไม่ใช่ | 8 |
| 11 | over-split | ผู้จัดการ | ผู้¦จัดการ | 7 |
| 12 | over-split | แผ่นดิน | แผ่น¦ดิน | 7 |
| 13 | over-split | มือถือ | มือ¦ถือ | 7 |
| 14 | over-split | ความผิด | ความ¦ผิด | 6 |
| 15 | over-split | ความรัก | ความ¦รัก | 6 |
| 16 | over-split | ที่นั่ง | ที่¦นั่ง | 6 |
| 17 | over-split | หน่วยงาน | หน่วย¦งาน | 6 |
| 18 | under-split | ทำ¦ให้ | ทำให้ | 6 |
| 19 | under-split | ประเทศ¦ไทย | ประเทศไทย | 6 |
| 20 | over-split | การเลือกตั้ง | การ¦เลือก¦ตั้ง | 5 |
| 21 | over-split | คณะกรรมการ | คณะ¦กรรมการ | 5 |
| 22 | over-split | เดินทาง | เดิน¦ทาง | 5 |
| 23 | over-split | เตรียมตัว | เตรียม¦ตัว | 5 |
| 24 | over-split | ทางตัน | ทาง¦ตัน | 5 |
| 25 | over-split | นักท่องเที่ยว | นัก¦ท่อง¦เที่ยว | 5 |
| 26 | over-split | บ้านเมือง | บ้าน¦เมือง | 5 |
| 27 | over-split | ปัญจาบ | ปัญจ¦าบ | 5 |
| 28 | over-split | ผู้ป่วย | ผู้¦ป่วย | 5 |
| 29 | over-split | พระราชบัญญัติ | พระ¦ราช¦บัญญัติ | 5 |
| 30 | over-split | ราชรัฐ | ราช¦รัฐ | 5 |
| 31 | over-split | ลมหายใจ | ลม¦หายใจ | 5 |
| 32 | over-split | ลาออก | ลา¦ออก | 5 |
| 33 | over-split | เลือกตั้ง | เลือก¦ตั้ง | 5 |
| 34 | under-split | มิ¦ได้ | มิได้ | 5 |
| 35 | over-split | เกี่ยวกับ | เกี่ยว¦กับ | 4 |
| 36 | over-split | ความจริง | ความ¦จริง | 4 |
| 37 | over-split | ความรู้ | ความ¦รู้ | 4 |
| 38 | over-split | ความสัมพันธ์ | ความ¦สัมพันธ์ | 4 |
| 39 | over-split | จะตาย | จะ¦ตาย | 4 |
| 40 | over-split | เจ้าหน้าที่ | เจ้า¦หน้าที่ | 4 |
| 41 | over-split | ช่วยเหลือ | ช่วย¦เหลือ | 4 |
| 42 | over-split | ชาวบ้าน | ชาว¦บ้าน | 4 |
| 43 | over-split | ติดเชื้อ | ติด¦เชื้อ | 4 |
| 44 | over-split | ทั้งหลาย | ทั้ง¦หลาย | 4 |
| 45 | over-split | เป็นบ้า | เป็น¦บ้า | 4 |
| 46 | over-split | ไปเรื่อย | ไป¦เรื่อย | 4 |
| 47 | over-split | ผู้อำนวยการ | ผู้¦อำนวย¦การ | 4 |
| 48 | over-split | มอบหมาย | มอบ¦หมาย | 4 |
| 49 | over-split | มีใจ | มี¦ใจ | 4 |
| 50 | over-split | หัวเมือง | หัว¦เมือง | 4 |

#### Most frequent error patterns: icu

| # | kind | gold (editors) | icu | count |
| ---: | --- | --- | --- | ---: |
| 1 | over-split | ประเทศ | ประ¦เทศ | 28 |
| 2 | under-split | ไม่¦มี | ไม่มี | 18 |
| 3 | over-split | สาธารณรัฐ | สาธารณ¦รัฐ | 13 |
| 4 | over-split | ราชอาณาจักร | ราช¦อาณาจักร | 12 |
| 5 | over-split | โรงพยาบาล | โรง¦พยาบาล | 9 |
| 6 | over-split | วันนี้ | วัน¦นี้ | 9 |
| 7 | over-split | เครื่องบิน | เครื่อง¦บิน | 8 |
| 8 | over-split | ตัวเอง | ตัว¦เอง | 8 |
| 9 | over-split | ที่นี่ | ที่¦นี่ | 8 |
| 10 | over-split | น่ารัก | น่า¦รัก | 8 |
| 11 | over-split | ผู้หญิง | ผู้¦หญิง | 8 |
| 12 | over-split | สาธารณรัฐ | สา¦ธารณ¦รัฐ | 8 |
| 13 | under-split | ไม่¦ใช่ | ไม่ใช่ | 8 |
| 14 | over-split | ผู้จัดการ | ผู้¦จัดการ | 7 |
| 15 | over-split | แผ่นดิน | แผ่น¦ดิน | 7 |
| 16 | over-split | พรุ่งนี้ | พรุ่ง¦นี้ | 7 |
| 17 | over-split | มือถือ | มือ¦ถือ | 7 |
| 18 | over-split | ความผิด | ความ¦ผิด | 6 |
| 19 | over-split | ความรัก | ความ¦รัก | 6 |
| 20 | over-split | ที่นั่ง | ที่¦นั่ง | 6 |
| 21 | over-split | หน่วยงาน | หน่วย¦งาน | 6 |
| 22 | under-split | ทำ¦ให้ | ทำให้ | 6 |
| 23 | under-split | ประเทศ¦ไทย | ประเทศไทย | 6 |
| 24 | over-split | การเลือกตั้ง | การ¦เลือก¦ตั้ง | 5 |
| 25 | over-split | คณะกรรมการ | คณะ¦กรรมการ | 5 |
| 26 | over-split | เดินทาง | เดิน¦ทาง | 5 |
| 27 | over-split | เตรียมตัว | เตรียม¦ตัว | 5 |
| 28 | over-split | ทางตัน | ทาง¦ตัน | 5 |
| 29 | over-split | นักท่องเที่ยว | นัก¦ท่อง¦เที่ยว | 5 |
| 30 | over-split | บ้านเมือง | บ้าน¦เมือง | 5 |
| 31 | over-split | ปัญจาบ | ปัญจ¦าบ | 5 |
| 32 | over-split | ผลไม้ | ผล¦ไม้ | 5 |
| 33 | over-split | ผู้ป่วย | ผู้¦ป่วย | 5 |
| 34 | over-split | พระราชบัญญัติ | พระ¦ราช¦บัญญัติ | 5 |
| 35 | over-split | ราชรัฐ | ราช¦รัฐ | 5 |
| 36 | over-split | ลมหายใจ | ลม¦หายใจ | 5 |
| 37 | over-split | ลาออก | ลา¦ออก | 5 |
| 38 | over-split | เลือกตั้ง | เลือก¦ตั้ง | 5 |
| 39 | under-split | มิ¦ได้ | มิได้ | 5 |
| 40 | over-split | เกี่ยวกับ | เกี่ยว¦กับ | 4 |
| 41 | over-split | ความจริง | ความ¦จริง | 4 |
| 42 | over-split | ความรู้ | ความ¦รู้ | 4 |
| 43 | over-split | ความสัมพันธ์ | ความ¦สัมพันธ์ | 4 |
| 44 | over-split | จะตาย | จะ¦ตาย | 4 |
| 45 | over-split | เจ้าหน้าที่ | เจ้า¦หน้าที่ | 4 |
| 46 | over-split | ช่วยเหลือ | ช่วย¦เหลือ | 4 |
| 47 | over-split | ชาวบ้าน | ชาว¦บ้าน | 4 |
| 48 | over-split | ตอนนี้ | ตอน¦นี้ | 4 |
| 49 | over-split | ติดเชื้อ | ติด¦เชื้อ | 4 |
| 50 | over-split | ทั้งหลาย | ทั้ง¦หลาย | 4 |

#### Most frequent error patterns: dict-mm

| # | kind | gold (editors) | dict-mm | count |
| ---: | --- | --- | --- | ---: |
| 1 | under-split | ไม่¦มี | ไม่มี | 15 |
| 2 | under-split | ไม่¦ได้ | ไม่ได้ | 14 |
| 3 | under-split | มา¦จาก | มาจาก | 8 |
| 4 | under-split | ไม่¦ใช่ | ไม่ใช่ | 8 |
| 5 | under-split | วัน¦ที่ | วันที่ | 8 |
| 6 | under-split | ออก¦จาก | ออกจาก | 8 |
| 7 | under-split | ไม่¦ดี | ไม่ดี | 7 |
| 8 | under-split | ทำ¦ให้ | ทำให้ | 6 |
| 9 | under-split | ไม่¦เคย | ไม่เคย | 6 |
| 10 | under-split | ดี¦กว่า | ดีกว่า | 5 |
| 11 | under-split | ผู้¦อื่น | ผู้อื่น | 5 |
| 12 | under-split | สบาย¦ดี | สบายดี | 5 |
| 13 | under-split | ออก¦ไป | ออกไป | 5 |
| 14 | under-split | ของ¦เรา | ของเรา | 4 |
| 15 | under-split | ด้วย¦กัน | ด้วยกัน | 4 |
| 16 | under-split | ได้¦รับ | ได้รับ | 4 |
| 17 | under-split | พวก¦เรา | พวกเรา | 4 |
| 18 | under-split | มา¦ถึง | มาถึง | 4 |
| 19 | under-split | ไม่¦มี¦ใคร | ไม่มีใคร | 4 |
| 20 | under-split | ลง¦โทษ | ลงโทษ | 4 |
| 21 | under-split | กลับ¦บ้าน | กลับบ้าน | 3 |
| 22 | under-split | กลาย¦เป็น | กลายเป็น | 3 |
| 23 | under-split | เข้า¦มา | เข้ามา | 3 |
| 24 | under-split | ความ¦จริง | ความจริง | 3 |
| 25 | under-split | ตั้ง¦แต่ | ตั้งแต่ | 3 |
| 26 | under-split | ทำ¦ตัว | ทำตัว | 3 |
| 27 | under-split | ทุก¦คน | ทุกคน | 3 |
| 28 | under-split | บาง¦คน | บางคน | 3 |
| 29 | under-split | พวก¦เขา | พวกเขา | 3 |
| 30 | under-split | เพื่อ¦ให้ | เพื่อให้ | 3 |
| 31 | under-split | มาก¦กว่า | มากกว่า | 3 |
| 32 | under-split | ยินดี¦ต้อนรับ | ยินดีต้อนรับ | 3 |
| 33 | under-split | ร่าง¦พระราชบัญญัติ | ร่างพระราชบัญญัติ | 3 |
| 34 | under-split | ฤดู¦ร้อน | ฤดูร้อน | 3 |
| 35 | shifted | ได้¦รู้จัก | ได้รู้¦จัก | 2 |
| 36 | under-split | กลิ่น¦หอม | กลิ่นหอม | 2 |
| 37 | under-split | การ¦ผ่าตัด | การผ่าตัด | 2 |
| 38 | under-split | การ¦เรียนรู้ | การเรียนรู้ | 2 |
| 39 | under-split | เกิด¦ขึ้น | เกิดขึ้น | 2 |
| 40 | under-split | ขณะ¦นี้ | ขณะนี้ | 2 |
| 41 | under-split | คง¦จะ | คงจะ | 2 |
| 42 | under-split | คน¦เดียว | คนเดียว | 2 |
| 43 | under-split | ใจ¦ดี | ใจดี | 2 |
| 44 | under-split | ช่อง¦ว่าง | ช่องว่าง | 2 |
| 45 | under-split | ดู¦เหมือน | ดูเหมือน | 2 |
| 46 | under-split | ได้¦มา | ได้มา | 2 |
| 47 | under-split | แต่ง¦ตัว | แต่งตัว | 2 |
| 48 | under-split | โต¦ขึ้น | โตขึ้น | 2 |
| 49 | under-split | ทั่ว¦โลก | ทั่วโลก | 2 |
| 50 | under-split | ทา¦สี | ทาสี | 2 |

### 3.6 Not done

- PyThaiNLP `newmm`: run on 2026-10-01, see 3.7. Other external tools: not run.
- The course gold set (500 to 1,000 checked sentences over eight strata): the tooling is ready and tested, the set is empty.
- No tuning of the adapter, the compound list or any threshold was done on these results.

### 3.7 Comparison with PyThaiNLP `newmm` (run 2026-10-01)

With the owner's go-ahead Python 3.12.10 was installed (winget, per user) and PyThaiNLP 5.3.8 was installed into an
isolated virtual environment inside the project's git-ignored folder (`data/private/venv-thai`). The prepared script
segmented the same 3,116 sentences with `word_tokenize(engine="newmm")` and the benchmark scored it beside the
course tokenizer (Node v24.19.0, ICU 78.3):

| system | boundary P | boundary R | boundary F1 | word F1 | sentences exact |
|---|---:|---:|---:|---:|---:|
| course adapter (ICU + course compounds) | 84.49 | 96.89 | 90.27 | 80.86 | 61.26 |
| ICU alone | 84.14 | 96.95 | 90.09 | 80.42 | 60.33 |
| **PyThaiNLP newmm 5.3.8** | 95.34 | 85.17 | 89.97 | 79.49 | 57.83 |
| our dictionary longest-match baseline | 99.72 | 93.59 | 96.56 | 92.59 | 82.83 |

By stratum, newmm: examples P 94.58 / R 81.88 / F1 87.77 / exact 60.37; quotations P 96.48 / R 90.55 / F1 93.42 /
exact 43.14. Errors: adapter 1,308 over-splits and 244 under-splits; newmm 251 over-splits and 1,333 under-splits.

What this shows: on this set the course tokenizer is **on a par with an established tokenizer** (F1 90.3 against
90.0), with the opposite error profile — the adapter splits compounds the Wiktionary editors kept whole, newmm keeps
whole what they split. What it does not show: which convention is right for the course, or how either behaves on
running book prose. The set is short dictionary examples divided by another project's convention (section 3.2), and
our own longest-match baseline scores highest only because it is built from the same word list as the gold. **The
segmentation gate is still not met**: it needs the human-corrected course gold set.

To repeat: `data\private\venv-thai\Scripts\python.exe scripts\external\pythainlp_tokenize.py --gold
data\benchmarks\th\generated --out data\benchmarks\th\generated\external\newmm.edit.txt`, then `npm run bench:words --
--external newmm=data/benchmarks/th/generated/external/newmm.edit.txt`.

## 4 Reading units and boundary sensitivity

Written by package H2. **Two runs are kept, both on 2026-10-01 and both on the same unchanged constructed set:** the **first run
(splitter as built)** is the record of what the benchmark found; the **second run (after the deterministic fixes)** was made after
the splitter was changed for the deterministic hazards only (abbreviations, times, list markers after a sentence, ellipsis, ฯ,
brackets and short quotations, vocative + particle). The contested hazards were deliberately left alone until real prose is
available. Subsections 4.2 to 4.4 give the first run, each followed by its second-run block.

A reading unit is what the app stores as a `Sentence`. The reader records a unit as seen after a dwell, the learner
model writes one encounter per word form per unit, reading pace divides a unit's words by its dwell, and GoListen cuts
and aligns audio per unit. Thai writes no sentence-final mark, so the splitter (`thAdapter.segmentSentences` =
`segmentThaiSentences` + `segmentThaiProse`) decides all of that. This section measures how it behaves on known hazards
and how far a wrong boundary reaches. **It does not fix anything.**

Run: `npm run bench:units` (constructed set, all systems) · `-- --text <file>` (guards over any text) ·
`-- --sensitivity <file.txt | doc.json | dir | constructed>` (the probe) · `-- --errors <file.json>` (every error) ·
`-- --write-constructed` / `--check-constructed`. Code: `src/bench/units/`; gold:
`data/benchmarks/th/constructed-units.gold.jsonl` (generated from `src/bench/units/constructed.ts`, kept identical by a test).
Gold format: `{ id, lang, stratum, paragraph, unitBoundaries, source, segmentedBy, checkedBy?, checkedAt?, notes? }`, where
`unitBoundaries` are the offsets at which a new unit starts (excluding 0, never on whitespace, same boundary rules as section 1);
the whitespace between two units belongs to the end of the earlier one, so the units re-joined reproduce the paragraph exactly.

### 4.1 What the constructed set is, and is not

107 short Thai paragraphs written by the benchmark author, **machine-drafted, not native-reviewed**
(`segmentedBy: "constructed by the benchmark author (machine-drafted Thai, not native-reviewed)"`, `rights-safe`,
no `checkedBy`). Each is built around one hazard (24 hazards, listed below). The cuts are the author's reading of
where a reader would want a new unit; where Thai writes no mark at all (a plain space between two sentences) the cut
is a judgement and the case's `notes` say so. Conventions that are choices, not facts: a quotation and its reporting
clause are one unit; a quotation of several sentences is cut at its sentence ends; a list marker belongs to its item;
one very long grammatical sentence (`nc-04`, 58 word tokens) is kept whole.

**This is a test of behaviour on known hazards. It is not a measure of accuracy on real prose.** Seventy of the 107
paragraphs are single-unit, so even `paragraph` (no splitting) scores 65 % exact-match; the hazards were chosen to be
awkward, so the adapter's figures below say nothing about how often it is right on a book. The course gold set (real,
lawful, manually checked text) is still to be built, with the same tools.

### 4.2 Result: the `adapter` on the constructed set

#### 4.2.1 First run (splitter as built), 2026-10-01

| system | paragraphs | gold boundaries | predicted | boundary P | boundary R | boundary F1 | paragraph exact-match |
|---|---:|---:|---:|---:|---:|---:|---:|
| adapter | 107 | 43 | 69 | 36.2 | 58.1 | 44.6 | 57/107 (53.3 %) |
| paragraph (bound) | 107 | 43 | 0 | 100.0 (0/0) | 0.0 | 0.0 | 70/107 (65.4 %) |
| spaces (bound) | 107 | 43 | 216 | 19.9 | 100.0 | 33.2 | 26/107 (24.3 %) |

Errors of the adapter: 42 over-splits (a cut the gold does not have), 16 under-splits (a gold cut missed), 2 shifted;
50 of 107 paragraphs differ. By hazard (P / R / F1 in %; "–" = nothing to find or nothing predicted, which the tool counts as 100):

| hazard | n | gold | pred. | P | R | F1 | exact |
|---|---:|---:|---:|---:|---:|---:|---:|
| dialogue-curly | 9 | 8 | 1 | 0 | 0 | 0 | 3/9 |
| dialogue-straight | 5 | 2 | 1 | 0 | 0 | 0 | 2/5 |
| quote-multi | 3 | 3 | 3 | 100 | 100 | 100 | 3/3 |
| speech-tag | 2 | 0 | 0 | – | – | – | 2/2 |
| final-particle | 4 | 4 | 4 | 100 | 100 | 100 | 4/4 |
| vocative-particle | 5 | 0 | 5 | 0 | – | 0 | 0/5 |
| no-marker | 2 | 2 | 0 | – | 0 | 0 | 0/2 |
| ellipsis | 5 | 1 | 4 | 25 | 100 | 40 | 2/5 |
| paiyannoi (ฯ, ฯลฯ) | 3 | 0 | 2 | 0 | – | 0 | 1/3 |
| maiyamok (ๆ) | 3 | 1 | 1 | 100 | 100 | 100 | 3/3 |
| abbreviation | 9 | 0 | 10 | 0 | – | 0 | 0/9 |
| number | 5 | 0 | 0 | – | – | – | 5/5 |
| time | 4 | 0 | 4 | 0 | – | 0 | 0/4 |
| latin | 6 | 1 | 4 | 25 | 100 | 40 | 4/6 |
| list-marker | 3 | 3 | 4 | 0 | 0 | 0 | 0/3 |
| list-comma | 2 | 0 | 0 | – | – | – | 2/2 |
| parenthesis | 4 | 0 | 1 | 0 | – | 0 | 3/4 |
| narrative-clause-space | 5 | 8 | 8 | 62.5 | 62.5 | 62.5 | 1/5 |
| one-word | 3 | 0 | 0 | – | – | – | 3/3 |
| heading-line | 6 | 0 | 1 | 0 | – | 0 | 5/6 |
| hard-break | 7 | 3 | 8 | 37.5 | 100 | 54.5 | 3/7 |
| indentation | 4 | 1 | 1 | 100 | 100 | 100 | 4/4 |
| whitespace | 3 | 2 | 2 | 100 | 100 | 100 | 3/3 |
| end-mark | 5 | 4 | 5 | 80 | 100 | 88.9 | 4/5 |

#### The 50 paragraphs that differ, by hazard (ids are in the gold file; `⟂` marks the cut)

- **Dialogue, turns separated by one space (under-split, 8 cases).** The adapter does not cut between a quotation with its
  reporting clause and the next quotation (`“ไปไหนมา” แม่ถาม ⟂“ไปตลาดครับ” ผมตอบ`): dc-02, 03, 05, 06, 09, ds-01, ds-04, and dc-07
  (which is also over-split, next item). A single space is a boundary only after a bare final particle, and here the particle
  is inside the quotation. Dialogue is the commonest layout of a novel.
- **Cut between a quotation and its reporting clause (over-split, 3).** `“ทำไมมาสายล่ะ?” ⟂ครูถาม`, `"ไปให้พ้น!" ⟂เขาตะโกน`,
  `"ใครน่ะ?" ⟂เขาถาม` (dc-07, ds-05, pu-05): `? ! …` plus closing marks and a space end the span and leave the speech tag as a
  one-word unit. The reverse (`เธอถามว่า “จะไปไหน?” ⟂เขาไม่ตอบ`, pu-04) is right.
- **Vocative particle (over-split, 5 of 5).** `พี่ครับ ⟂ช่วยผมหน่อย`, `คุณครูคะ ⟂หนูขอถามหน่อยค่ะ` (vp-01 to 05, also inside a
  quotation): the particle rule cannot tell an address from a sentence end.
- **Abbreviation full stops (over-split, 9 of 9, 10 cuts).** `ปี พ.ศ. ⟂2565`, `ร.ร. ⟂ของเรา`, `ดร. ⟂สมชาย`, `นพ. ⟂`, `อ. ⟂`, `ก.ค. ⟂`,
  `คุณ ก. ⟂กับคุณ ข.`, `Dr. ⟂Smith`; initials `A. ⟂B. Smith` (la-02); a heading number `บทที่ 12. ⟂ฝนแรก` (hl-06).
- **Times (4 of 4):** `10.30 น. ⟂ที่ห้อง`: `น.` followed by a space is read as a full stop.
- **Numbered and lettered list markers (3 of 3):** `1. ⟂ล้างมือ 2. กินข้าว` leaves the marker alone as a one-word unit (lm-01,
  lm-02); `1) ล้างมือ ⟂2) กินข้าว` is not cut (lm-03).
- **Ellipsis (3 over-split):** a hesitation `“ฉัน… ⟂ฉันไม่รู้”`, `“ฉันคิดว่า…” ⟂เขาพูดเบา ๆ`, and three full stops `รอเดี๋ยว... ⟂` (el-01, 02, 04).
- **ฯ as an abbreviation (2):** `ผู้ว่าฯ ⟂มาเปิดงาน`, `กรุงเทพฯ ⟂เป็น…` (pn-01, 02); ฯลฯ in mid-sentence is handled (pn-03).
- **Hard line break inside a sentence (over-split, 4):** hb-01 to 04; the adapter always cuts at a line break. In the app the
  importer already makes each line a paragraph, so a wrapped sentence is split before the adapter sees it; these cases show the
  splitter's own behaviour. Real breaks (hb-05 to 07: LF, CRLF, blank line) are right.
- **Parenthesis (1):** `(ไปด้วยนะ ⟂ถ้าว่าง)`: a particle space inside brackets cuts (pa-02).
- **English inside Thai (1):** a stop inside a quoted English answer, `"Yes, I do." ⟂แล้วก็ยิ้ม` (la-04).
- **No mark between sentences (under-split, 5):** nm-01, nm-02 and the short narrative paragraphs nc-01, nc-02, nc-05 (two or three
  sentences, one space between them, no particle). Not detectable by the current rules; the gold is the author's reading.
- **A long single sentence (nc-04, 58 word tokens, over-split x3):** the prose divider cuts it at three clause spaces
  (`ทุ่งนา ⟂แล้ว…`, `ที่สูง ⟂เพราะ…`, `กลางคืน ⟂และ…`) by design (spans over 28 words are divided). The gold keeps the sentence whole, so
  this is a recorded trade-off, not only an error. The 68-token four-sentence paragraph nc-03 happens to be cut exactly right.

Right on this set: quotations of several sentences cut at `? !` or after a particle (3/3), bare final particles (4/4), ฯลฯ, ๆ
with spaces, decimals, thousands separators and Thai digits (5/5), commas in lists, one-word paragraphs, indentation of every kind
(4/4), two spaces and a no-break space between sentences (3/3), trailing spaces.

#### 4.2.2 Second run (after the deterministic fixes), 2026-10-01

Same 107 paragraphs, same gold, same tool; only the splitter changed. `paragraph` and `spaces` are unchanged by construction.

| system | paragraphs | gold boundaries | predicted | boundary P | boundary R | boundary F1 | paragraph exact-match |
|---|---:|---:|---:|---:|---:|---:|---:|
| adapter, first run | 107 | 43 | 69 | 36.2 | 58.1 | 44.6 | 57/107 (53.3 %) |
| **adapter, after the fixes** | 107 | 43 | 39 | 61.5 | 55.8 | 58.5 | 80/107 (74.8 %) |
| paragraph (bound) | 107 | 43 | 0 | 100.0 (0/0) | 0.0 | 0.0 | 70/107 (65.4 %) |
| spaces (bound) | 107 | 43 | 216 | 19.9 | 100.0 | 33.2 | 26/107 (24.3 %) |

Errors now: 14 over-splits (from 42), 18 under-splits (from 16), 1 shifted (from 2); 27 of 107 paragraphs differ (from 50). Precision
rose because wrong cuts went; recall fell slightly (58.1 to 55.8 %, 25 correct cuts to 24) because the ellipsis change no longer cuts
after `…` plus a space even where it ends a sentence (el-05, a correct cut before, now missed). By hazard, first run → second run:

| hazard | first run P / R / F1, exact | second run P / R / F1, exact |
|---|---|---|
| vocative-particle | 0 / – / 0, 0/5 | – / – / –, 5/5 |
| abbreviation | 0 / – / 0, 0/9 | – / – / –, 9/9 |
| time | 0 / – / 0, 0/4 | – / – / –, 4/4 |
| paiyannoi (ฯ) | 0 / – / 0, 1/3 | – / – / –, 3/3 |
| parenthesis | 0 / – / 0, 3/4 | – / – / –, 4/4 |
| ellipsis | 25 / 100 / 40, 2/5 | – / 0 / 0, 4/5 |
| latin | 25 / 100 / 40, 4/6 | 33 / 100 / 50, 4/6 |
| list-marker | 0 / 0 / 0, 0/3 | 0 / 0 / 0, 0/3 |
| dialogue-curly | 0 / 0 / 0, 3/9 | 0 / 0 / 0, 3/9 |
| dialogue-straight | 0 / 0 / 0, 2/5 | 0 / 0 / 0, 2/5 |
| no-marker | – / 0 / 0, 0/2 | – / 0 / 0, 0/2 |
| narrative-clause-space | 62.5 / 62.5 / 62.5, 1/5 | 62.5 / 62.5 / 62.5, 1/5 |
| hard-break | 37.5 / 100 / 54.5, 3/7 | 37.5 / 100 / 54.5, 3/7 |
| heading-line | 0 / – / 0, 5/6 | 0 / 100 / 0, 5/6 |
| end-mark | 80 / 100 / 88.9, 4/5 | 80 / 100 / 88.9, 4/5 |

(The other hazards were already at 100 % and are unchanged.)

**The 27 paragraphs that still differ, by hazard (`⟂` marks the cut).**

Left alone on purpose, until real prose can decide them:
- **Dialogue turns separated by a single space (under-split, 8):** dc-02, 03, 05, 06, 09, ds-01, ds-04, and dc-07
  (`“ไปไหนมา” แม่ถาม ⟂“ไปตลาดครับ” ผมตอบ`).
- **A quotation cut from its reporting clause (over-split, 3):** dc-07, ds-05, pu-05 (`"ใครน่ะ?" ⟂เขาถาม`).
- **No mark between two sentences (under-split, 6):** nm-01, nm-02, nc-01, nc-02, nc-05, and el-05 (an ellipsis that ends a sentence,
  `ฝนหยุดแล้ว… ⟂ฟ้าสว่างขึ้นมาก`).
- **List markers in the middle of a paragraph (3):** lm-01 (now shifted: `1. ล้างมือ 2. ⟂กินข้าว`), lm-02, lm-03 (under-split).
- **Hard line breaks inside a sentence (over-split, 4):** hb-01 to 04. Real breaks (hb-05 to 07) are right.
- **Division of a long sentence (nc-04, over-split x3):** the 58-token sentence is still cut at three clause spaces.

Still failing but not on the left-alone list (so open, not decided): **initials `A. B. ⟂Smith`** (la-02), **a stop inside quoted English**
`"Yes, I do." ⟂แล้วก็ยิ้ม` (la-04), and **a chapter number with a full stop** `บทที่ 12. ⟂ฝนแรก` (hl-06).

Fixed: vocative + particle (5/5), abbreviations (9/9), times (4/4), ฯ (3/3), brackets (4/4), ellipsis in the middle of an utterance
(el-01, 02, 04). The list-marker paragraphs are still not cut as the gold has them, but the marker is no longer left alone as a
one-word unit.

**What the remaining figure means.** The gold is machine-drafted by the benchmark author, and the hazards are chosen to be awkward; the
cases left failing are the ones whose right answer is a judgement (dialogue layout, where a sentence ends with no mark, how long a unit
may be). The after-fix figures (F1 58.5, 74.8 % exact-match) are **not a measure of accuracy on book text**, and the improvement from
the first run is an improvement on the hazards the fixes were written for, which are the same hazards the cases were written from.

### 4.3 Guards (no gold needed): unit size, quotations, numbers, abbreviations

#### 4.3.1 First run (splitter as built)

Over the 107 constructed paragraphs; words are ICU word tokens. "Begin / end in quotation" = a unit that starts or ends inside a
quotation that opens and closes in the same paragraph (“ ” « » 「 」 『 』 and straight pairs). The gold row is what a perfect splitter
would give (it divides multi-sentence quotations on purpose, so it is not zero).

| system | units | words/unit median | p95 | max | units over 40 words | one-word units | begin in quotation | end in quotation | split a number | split an abbreviation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| adapter | 176 | 4 | 13 | 23 | 0 | 15 | 6 | 6 | 0 | 11 |
| paragraph | 107 | 7 | 14 | 68 | 2 | 4 | 0 | 0 | 0 | 0 |
| spaces | 323 | 2 | 7 | 18 | 0 | 82 | 10 | 10 | 0 | 11 |
| gold (reference) | 150 | 5 | 12 | 58 | 1 | 5 | 3 | 3 | 0 | 0 |

The adapter makes 176 units where the gold has 150, three times as many one-word units (15 against 5), and cuts 11 abbreviations or initials. No
number was split on this set (the splitter does not cut `3.14` or `1,250`; the number guard is tested on scripted splits, not on
real ones). The `paragraph` bound makes units of up to 68 words. `bench:units --text <file>` prints the same table for any text, with
the first examples of every guard. The abbreviation guard is a heuristic (dotted Thai abbreviations, a short list of titles, a single
capital initial); a lone Thai letter with a dot (`น.`) is not counted because it can end a sentence.

#### 4.3.2 Second run (after the deterministic fixes), 2026-10-01

| system | units | words/unit median | p95 | max | units over 40 words | one-word units | begin in quotation | end in quotation | split a number | split an abbreviation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| adapter, first run | 176 | 4 | 13 | 23 | 0 | 15 | 6 | 6 | 0 | 11 |
| **adapter, after the fixes** | 146 | 5 | 16 | 23 | 0 | 4 | 4 | 4 | 0 | 2 |
| paragraph | 107 | 7 | 14 | 68 | 2 | 4 | 0 | 0 | 0 | 0 |
| spaces | 323 | 2 | 7 | 18 | 0 | 82 | 10 | 10 | 0 | 11 |
| gold (reference) | 150 | 5 | 12 | 58 | 1 | 5 | 3 | 3 | 0 | 0 |

The adapter now makes 146 units (gold 150, first run 176), 4 one-word units (gold 5), and 2 abbreviation splits left (the initials
`A. B.` of la-02). Units that begin or end inside a quotation fell from 6 to 4 (gold 3: it divides multi-sentence quotations on
purpose). No unit is over 40 words and the longest is still 23, because the 58-token sentence is still divided.

### 4.4 Boundary sensitivity: how far a wrong boundary reaches

Method (`src/bench/units/probe.ts`): the same text is imported into separate memory stores through the real importer under different
segmentations, forced with explicit `sentences` in the v2 document. The same reading is replayed through the real GoLearn: every unit
seen once with the dwell the reader would record (`requiredDwellMs`: 220 ms a word, at least 1.5 s, at most 12 s) and, as a control, a
plain 220 ms a word; every tenth word looked up. GoListen plans the audio with the fixture provider (nothing is synthesised).
Segmentations: `adapter` (the raw paragraph is imported and the real splitter cuts it), `paragraph`, `spaces` and, for the constructed
text, `gold`. A document's own authored sentences are not kept (each paragraph is rebuilt from its text so all segmentations cut the
same characters); Scripture is left out.

#### 4.4.1 First run (splitter as built), 2026-10-01

**A. The 100 constructed paragraphs that have no line break, read as a book (822 word tokens; not real prose).**

| dwell | segmentation | units | words/unit max | units at the 12 s cap | WPM (GoLearn) | lookups /100 words | form encounters | audio segments | longest segment (chars) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| reader | gold | 136 | 58 | 1 | 207.6 | 10 | 799 | 136 | 196 |
| reader | adapter | 156 | 23 | 0 | 181.6 | 10 | 808 | 156 | 88 |
| reader | paragraph | 96 | 68 | 2 | 250.0 | 10 | 771 | 96 | 244 |
| reader | spaces | 294 | 18 | 0 | 107.4 | 10 | 821 | 294 | 75 |
| proportional | all four | | | | 272.7 | 10 | | | |

| encounters per word form (307 forms) | forms whose count differs | encounters | absolute change | largest change for one form |
|---|---:|---|---:|---:|
| gold → adapter | 23 | 799 → 808 | 25 (3.1 %) | 2 |
| gold → paragraph | 19 | 799 → 771 | 28 (3.5 %) | 4 |
| gold → spaces | 21 | 799 → 821 | 22 (2.8 %) | 2 |
| adapter → paragraph | 26 | 808 → 771 | 37 (4.6 %) | 5 |
| adapter → spaces | 11 | 808 → 821 | 13 (1.6 %) | 2 |

**B. `data/corpus/th` (the two non-Scripture course texts, 127 word tokens, re-split from their joined paragraphs).** adapter 15 units,
paragraph 10, spaces 23. Form encounters 110 (adapter) → 95 (paragraph; 14 of 46 forms differ, 13.6 %) and → 125 (spaces; 7 forms
differ, one by 7). Audio segments 15 / 10 / 23, longest segment 103 / 149 / 41 characters. GoLearn withholds words per minute for all
(fewer than 30 timed units); the ungated figures under the reader's dwell are 233.5 / 263.9 / 209.2.

**C. `test/integration/fixtures/thai-synthetic-book.txt`:** ten one-sentence paragraphs, 50 word tokens. All three segmentations give
the same 10 units, 50 encounters and 10 audio segments: the fixture cannot show any sensitivity.

#### 4.4.2 Second run (after the deterministic fixes), 2026-10-01

**A. The same 100 constructed paragraphs.** Only the `adapter` row changes (the `paragraph`, `spaces` and `gold` rows are identical to
the first run).

| dwell | segmentation | units | words/unit max | units at the 12 s cap | WPM (GoLearn) | lookups /100 words | form encounters | audio segments | longest segment (chars) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| reader | gold | 136 | 58 | 1 | 207.6 | 10 | 799 | 136 | 196 |
| reader | adapter, first run | 156 | 23 | 0 | 181.6 | 10 | 808 | 156 | 88 |
| reader | **adapter, after the fixes** | 126 | 23 | 0 | 215.1 | 10 | 800 | 126 | 88 |
| reader | paragraph | 96 | 68 | 2 | 250.0 | 10 | 771 | 96 | 244 |
| reader | spaces | 294 | 18 | 0 | 107.4 | 10 | 821 | 294 | 75 |
| proportional | all | | | | 272.7 | 10 | | | |

| encounters per word form (307 forms) | forms whose count differs | encounters | absolute change |  largest change for one form |
|---|---:|---|---:|---:|
| gold → adapter, first run | 23 | 799 → 808 | 25 (3.1 %) | 2 |
| gold → adapter, after the fixes | 15 | 799 → 800 | 17 (2.1 %) | 2 |
| gold → paragraph | 19 | 799 → 771 | 28 (3.5 %) | 4 |
| gold → spaces | 21 | 799 → 821 | 22 (2.8 %) | 2 |
| adapter (after) → paragraph | 19 | 800 → 771 | 29 (3.6 %) | 4 |
| adapter (after) → spaces | 19 | 800 → 821 | 21 (2.6 %) | 2 |

The adapter now makes 126 units where the gold has 136: it has moved from too many units to too few (the single-space dialogue
turns and unmarked sentence boundaries are still joined). Its words per minute under the reader's dwell is 215.1 against the
gold's 207.6 (first run 181.6); the true pace is 272.7 in every case, so the figure is closer to the gold's but still not the
pace. Encounters per word form: 15 forms differ from the gold (first run 23), 17 encounters in total (first run 25).
Audio segments 126 against 136 (first run 156).

**B. `data/corpus/th`:** unchanged by the fixes: adapter 15 units, paragraph 10, spaces 23; encounters 110 / 95 / 125; audio segments
15 / 10 / 23, longest 103 / 149 / 41 characters; GoLearn withholds words per minute (ungated 233.5 / 263.9 / 209.2).

**C. `test/integration/fixtures/thai-synthetic-book.txt`:** unchanged: 10 units, 50 encounters and 10 audio segments under all three
segmentations.

The text below is the first-run reading; the second-run figures above supersede its numbers, not its mechanisms.

What this says, and does not say (first run):

- **Encounter counts move by a few percent** on a text this size: 25 of 799 encounters (3.1 %) differ between the gold and the adapter,
  over 23 of 307 forms, never by more than 2 for one form. The mechanism is exact: a form that occurs twice in one unit is one
  encounter; cut the unit between them and it becomes two. Merging units removes counts, splitting adds them. A form met only a few
  times (what the readiness counts look at) is the one that can cross a threshold. The size depends on how repetitive the text is; the
  constructed paragraphs repeat little, real books repeat names and particles far more, which probably makes the effect larger. Untested.
- **Words per minute is moved by unit size, not only by reading speed.** With the reader's dwell (floor 1.5 s, cap 12 s) and a learner
  who reads at a constant 272.7 words a minute, GoLearn would report 207.6 under the gold units, 181.6 under the adapter's (12.5 %
  lower: more short units, each paid the floor), 250.0 for whole paragraphs (a 68-word paragraph is capped at 12 s) and 107.4 if every
  space split. With dwell proportional to words (no floor, no cap) the figure is 272.7 in every case: the whole effect is the floor
  and the cap. GoLearn also withholds the figure below 30 timed units, so a text divided into fewer than 30 units shows no pace.
- **Lookups per 100 words did not move** (10.0 everywhere on the constructed text): it is a ratio of per-word events, so it is robust
  to boundaries. It would move if lookups were counted per unit.
- **Audio segments equal units.** The adapter cuts 156 segments where the gold has 136, and its longest is 88 characters against 196:
  over-splitting costs many more, shorter clips (each with its own alignment), under-splitting makes long clips. A cut inside a
  quotation puts half a quotation in a clip (guards above).
- The probe replays an idealised reader (every unit seen once, at a fixed pace). It shows how much a segmentation change can move the
  record in principle, not how much it does move for a real learner.

### 4.5 Reproduce

    npx vitest run test/bench/units
    npm run bench:units                                        # constructed set, three systems, guards
    npm run bench:units -- --systems adapter --errors data/benchmarks/th/generated/units-errors.json
    npm run bench:units -- --text <file.txt>                   # guards over any text
    npm run bench:units -- --sensitivity constructed
    npm run bench:units -- --sensitivity data/corpus/th
    npm run bench:units -- --sensitivity test/integration/fixtures/thai-synthetic-book.txt

Editing format for correcting cuts by hand: `# <id> <hazard>`, then one unit per line, a blank line between paragraphs; edge whitespace
and line breaks inside a unit are written ␣ ↵ ␍ ⇥ ⍽ (see `src/bench/units/gold.ts`).

### 4.6 Not done

- No real prose: the course gold set for reading units (dialogue, quotation, abbreviation and paragraphing in the eight strata)
  needs lawful texts; the format and tools are ready (`--gold <file|dir>` takes any file in the gold format).
- The abbreviation and quotation guards are heuristics; the number guard has not fired on any real or constructed splitter output.
- No tuning of the splitter, the thresholds or the advancement model was done on these results. The second run measured a splitter that
  someone else changed; the benchmark package changed no code and no case between the two runs.
- Still failing and left for real prose: single-space dialogue turns, a quotation cut from its reporting clause, no mark between
  sentences, list markers in the middle of a paragraph, hard line breaks, division of a long sentence. Failing and not yet decided: initials,
  a stop in quoted English, a chapter number with a stop.

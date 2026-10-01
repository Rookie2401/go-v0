# Thai gold set: the procedure, step by step

This is the procedure for building the human-checked sets that the Thai segmentation gate needs: **word boundaries** (where
one word ends and the next begins) and **reading units** (how a paragraph is cut into the pieces the reader shows one at a
time). You do not need to program. You need a plain text editor (Notepad is enough), a terminal opened in the project folder
(`C:\Users\CJWal\dev\go-v0`), and a lawful Thai text.

**The one rule.** Nothing a machine produced is ever treated as the right answer. The tools write a *draft* (the adapter's
guess). A draft becomes gold only when a named person has corrected it and accepted it with their name (`--by`). Rows without a
name are refused by the freezing step, so they can never be used as the reference.

What you will end with: 500 to 1,000 checked sentences over eight kinds of text (strata), a frozen copy of them that cannot
change, and a dated report that says how well each system cuts words and reading units.

Everything you create lives under `data/private/benchmarks/th/`, which git ignores. Nothing here is committed or published.

---

## 1. Supply a lawful text

**What counts.** A text you are allowed to use for this purpose: public domain; licensed for it; written by you; or a book you
own and use privately as a personal copy (it stays on this machine, never shared). Scripture is a stratum like any other, but only
an identified, lawfully held translation. If you are unsure of the rights, do not guess: say so with `--rights personal-copy` and
keep it private, or leave the text out. The tools never download anything and never infer rights.

**What shape.** Either
- a plain text file (`.txt`, UTF-8, Thai written without added spaces): one sentence or paragraph per line, or paragraphs
  separated by a blank line; or
- a Go corpus file (`.json`, schema version 2; see `docs/IMPORT.md`), which already says its title and rights.

**Where it goes.** Anywhere on this computer outside the repository's tracked folders is fine; `data/private/` is the usual
place (for example `data/private/texts/mana-mani-ch1.txt`). Never put a book into `docs/`, `public/` or `src/`. Never copy a
book into a chat or an email.

**The eight strata** (the kinds of text the gold set must cover): `stage0` (the first, simplest reading), `mana-mani`,
`childrens-literature`, `modern-literary`, `grade8-literary` (the Thai school reader), `regional` (for example ลูกอีสาน),
`chotmai` (จดหมายจากเมืองไทย) and `scripture`. A text belongs to exactly one stratum; pick the one it represents.

## 2. Draft

Check what exists: `npm run gold:status`. It lists checked sentences per stratum against the target of 500 to 1,000, and which
strata are still empty.

**Word boundaries**, 60 sentences from one text:

    npm run gold:draft -- data/private/texts/mana-mani-ch1.txt --stratum mana-mani --n 60 --seed 1

**Reading units**, 20 paragraphs from the same text:

    npm run gold:draft -- data/private/texts/mana-mani-ch1.txt --stratum mana-mani --kind units --n 20 --seed 1

- `--n` is the sample size. To reach 500 to 1,000 sentences, spread them over the eight strata (roughly 60 to 120 each) and over
  several texts and several chapters of each stratum, so that one author's habits do not dominate. Sampling is random but
  repeatable (`--seed`); it never offers a sentence that is already accepted or already in a draft, so you can draft the same
  text again with another seed to get more.
- `--held-out` (word sentences only) marks the sampled sentences **held out**: the tools never print them, ordinary benchmark
  runs leave them out, and they may be used once, for reporting (step 8). Reserve roughly a third of the sentences of every
  stratum as held out, by drafting them separately: `... --n 30 --seed 7 --held-out`.
- A plain text is recorded as `personal-copy` unless you say otherwise (`--rights rights-safe` for public-domain or licensed
  text) and takes its title from the file name (`--title "Mana Mani, book 1"`).
- The draft is written under `data/private/benchmarks/th/<stratum>/` (words) or `.../units/` (units). The screen shows counts
  only. Open the file it names in your editor. If you run the same command again it refuses to overwrite a draft you may be
  correcting (`--force` replaces it).

## 3. Correct the draft

### Word boundaries (`....draft.txt`)

Each sentence has a header line and one line of text with `|` between words:

    # mana-mani-1a2b3c4d
    มานะ|ไป|โรงเรียน|กับ|มานี

Edit only the `|` marks. Add `|` where a word starts, delete `|` where the machine cut a word you consider one. **Never change,
add or remove a letter**; the tool refuses a draft whose text changed. A space may stay before or after a `|` (the two mean the
same). Lines starting with `##` are comments and can be left alone.

**Decide the conventions once, write them down, then apply them everywhere.** Keep a short file next to your gold,
`data/private/benchmarks/th/CONVENTIONS.txt`, with one line per decision. Two people who disagree on a convention give a
benchmark that measures the disagreement, not the system. Decide at least:

- *Punctuation*: every punctuation mark (quotation marks, brackets, an ellipsis, a full stop) is a word of its own. This is the
  default of the tools (the adapter and ICU both emit punctuation as separate tokens). Decide ๆ (repetition mark), ฯ and ฯลฯ
  explicitly; the draft shows how the adapter treats them, and whatever you decide must be applied to every sentence.
- *Compounds*: when does a compound count as one word? The course teaches some compounds as single words (the adapter keeps a
  short list: ตอนนี้, ทุกคน, โรงพยาบาล, ...). Suggested rule: one word if the course would give it one dictionary entry and one
  gloss (หนังสือพิมพ์, รถไฟ); two words if each part keeps its own meaning and could take another partner (กิน ข้าว).
- *Prefix-like words* (ความ-, การ-, ผู้-, นัก-, ที่-): one word with what follows, or separate? Pick one answer.
- *Names, foreign words and numbers*: a personal name is one word; a loan word is one word; a number in digits is one word;
  a number written in words follows the compound rule.
- *Fixed expressions and particles* (ไม่มี, ทำให้, ครับ/ค่ะ/นะ): decide whether they are separate words.

For the first 100 sentences, apply the conventions and note every hard case in `CONVENTIONS.txt` the moment you decide it.

**A doubtful case.** Do not guess and do not delete it silently. In order: (1) look the word up in the dictionary the reader
uses (the reader's word card) and follow the conventions; (2) if still unsure, ask a second reader and write the decision down;
(3) if it stays undecidable, remove that sentence's two lines from the draft and add its id and the reason to `CONVENTIONS.txt`.
Do not remove hard sentences to make the results look better: that is the most common way to fool a benchmark.

### Reading units (`....units-draft.txt`)

Each paragraph has a header line `# <id> <stratum>`, then one reading unit per line, and a blank line before the next paragraph.
You only move the line breaks: join two units by deleting the break between them, split a unit by inserting one. A space at the
end of a unit is written `␣` (copy the mark from the draft); a line break inside a unit is `↵`. The paragraph text must stay
exactly as it was: the tool refuses a draft whose units no longer re-join to the paragraph. Decide and write down: does a spoken
quotation with its reporting clause make one unit or two? Do ฯ, ฯลฯ and abbreviations such as พ.ศ. end a unit? (They should not
end one in the middle of a date or a number.) Keep the `.meta.json` file that sits beside the draft; accepting needs it.

## 4. Accept with your name

    npm run gold:accept -- data/private/benchmarks/th/mana-mani/mana-mani-ch1.s1.draft.txt --by "Your Name"
    npm run gold:accept -- data/private/benchmarks/th/units/mana-mani-ch1.mana-mani.s1.units-draft.txt --kind units --by "Your Name"

The tool checks every boundary (never inside a letter with its marks, never before a vowel sign or tone mark), writes the gold
file with your name and today's date, and prints counts. It refuses: without `--by`; a draft you did not change (if every
boundary was already right, say so with `--confirm-unchanged`, which is recorded in the file); a malformed or damaged file; a
sentence that is already in the gold set; a file that already exists (`--overwrite`); and **a file that belongs to a frozen
set** (step 5), because a frozen set never changes: write a new file and freeze a new set instead.

Only `--by` records responsibility: never accept a draft you did not read line by line.

## 5. Freeze

When a body of gold is complete enough to measure against, freeze it:

    npm run gold:freeze -- --name mana-2026-10
    npm run gold:freeze -- --name mana-only --strata mana-mani
    npm run gold:freeze -- --name held-out-1 --held-out-only

A freeze writes `data/private/benchmarks/th/frozen/<name>.json`: every gold file with its sha256, the number of sentences and
paragraphs per stratum, who checked them and when, the tool versions, and one **set hash**. From then on, the files in it must
not change. `npm run gold:freeze -- --verify <name>` re-checks them; `npm run gold:freeze -- --list` shows the frozen sets. The
freeze refuses any row without a name. To extend the gold set later, accept new files and freeze a new set (`mana-2026-11`);
never edit a frozen file.

## 6. Run and read the report

    npm run bench:words -- --frozen mana-2026-10 --report
    npm run bench:units -- --gold data/private/benchmarks/th/units

(Run `gold:freeze -- --verify` first for the units: `bench:units` does not check the hashes itself.) The word run verifies every
hash before it starts and refuses to run if a file changed; it prints numbers only and writes a dated report to
`data/private/benchmarks/th/reports/<name>-<date>.md` (local; `--report <path>` chooses another place). The report names the
frozen set and its hash, who checked it, the tool and ICU versions and, for each system (`adapter`, `icu`, `dict-mm` and any
external one), per stratum: boundary precision / recall / F1, word precision / recall / F1 and the share of sentences with no
error. Every sentence with an error is kept in `data/private/benchmarks/th/errors/<name>/<system>.errors.jsonl`.

How to read it: **precision** is how many of the system's cuts were right; **recall** is how many of your cuts it found; a
low-precision, high-recall system cuts too much (over-split), the reverse cuts too little (under-split). The error file shows
each sentence as you cut it and as the system cut it; read the errors, not only the numbers. `dict-mm` is our own baseline, not an
established tokenizer.

## 7. Add an external tokenizer (PyThaiNLP)

An established Thai tokenizer is the right yardstick for "is the adapter any good". **Python is not installed on this machine,
and none of the above needs it.** To get the comparison, the owner (or someone with the owner's go-ahead) must, on a machine
with **Python 3.9 or later**, create a virtual environment and install `pythainlp`:

    python -m venv .venv-thai
    .venv-thai\Scripts\activate
    pip install pythainlp

Then, still in the project folder:

    python scripts/external/pythainlp_tokenize.py --gold data/private/benchmarks/th --out data/private/benchmarks/th/external/newmm.edit.txt
    npm run bench:words -- --frozen mana-2026-10 --external newmm=data/private/benchmarks/th/external/newmm.edit.txt --report

(`--held-out` is accepted by both commands for the held-out rows.) The script refuses to write a file if the tool changed the text of
a sentence. Any other tokenizer works the same way: produce a file in the word editing format (`# id` header, then the sentence with
`|` between words) and pass it with `--external <name>=<file>`. Nothing is installed or run by the project itself.

## 8. What the results may and may not be used for

- **May**: say how well each system cuts words and reading units on these texts; choose between segmentation approaches; find
  the error classes worth fixing (read the errors file); decide whether the segmentation gate is passed, against a bar the owner
  sets *before* looking at the held-out numbers.
- **May not**: tune the adapter, the compound list or any threshold on the held-out sentences (they are used once, to report);
  present machine-derived sets (the Wiktionary set in `docs/thai/BENCHMARKS.md`) as the course's own measurement; present a
  draft, a model's judgment, or a row without a checker's name as ground truth; copy sentences or errors from personal copies
  into the repository or the docs (numbers, and single words as findings, may be copied by the owner's choice).
- A frozen set's numbers are comparable only with the same set hash. A change of ICU or Node version can move the `adapter` and
  `icu` rows; the report says which versions ran.
- Results describe the texts in the set. Eight strata of a few hundred sentences do not describe all Thai.

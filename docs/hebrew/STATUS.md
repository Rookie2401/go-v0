# Hebrew (`he`) — status

Updated 2026-10-18 by the Hebrew/Greek session. Plan: `docs/PLAN14.md`. Everything below is measured by the scripts and tests named; nothing
has been reviewed by a Hebrew scholar or a native speaker.

## What exists

| part | state |
|---|---|
| language | `he` in `LanguageCode`, `LANGUAGE_ROWS` (script Hebr, rtl), course `hebrew` (default target `he-mod`) |
| period varieties | `he-bib`, `he-mish`, `he-med`, `he-mod` (kind `period`, new in `src/core/variety.ts`); `arc-bib` Biblical Aramaic (heritage). `src/adapters/hebrew/varieties.ts` |
| adapter | `adapter-he@1` (`src/adapters/he.ts`, `src/adapters/hebrew/**`): tokenizer (Intl.Segmenter he; maqaf its own token), sentence splitter (sof pasuq, . ! ?), form indexes, OSHB decoder, kaikki tag mapper, prefix peeling by rule, period decision per sentence, transliteration of pointed forms, three production rules, paradigm and variants off the indexes |
| Biblical index | `npm run he:build-biblical` (scripts/he-build-biblical.mts) from the Biblia app's MAM+OSHB data: 39 books, 23,206 verses, 305,452 tokens (143 unaligned skipped, 4,821 Aramaic), **52,687 pointed forms, 56,967 readings, 9,200 lemmas** → `public/lexicon/he/biblical-index.json` (5.1 MB, git-ignored). Core compiled into the adapter: 441 lemmas, 6,994 forms, 7,482 readings, **67.7 % of the Bible's tokens**, 605 kB (`src/adapters/hebrew/generated/biblical-core.ts`). Details: `docs/hebrew/BIBLICAL-INDEX.md` |
| Modern index | `npm run he:build-modern` (scripts/he-build-modern.mts) from kaikki Hebrew (2026-10-03 extract): 17,382 entries, 4,214 with tables, 144,869 table rows + 2,380 form-of entries → **149,277 form keys, 176,688 readings, 14,456 lemmas**, 18.7 MB (`public/lexicon/he/modern-index.json`, git-ignored; not compiled in). Details: `docs/hebrew/MODERN-INDEX.md` |
| pack | `pack:he` experimental (`packages/language-packs/src/packs/he.ts`): 20 validation cases read with the core alone (incl. two that state the core's limits), 7 explained features, 3 constructions, rtl, tutorial `tutorial/he` (3 own steps) |
| tests | `test/adapters/hebrew-biblical.test.ts` (20; the full-index half runs only when the assets are built locally), `test/adapters/hebrew-greek-packs.test.ts` (6), `test/extension/card.variants.test.ts` (4, the Variants pill) |

## How the period is decided (hebrew/analyze.ts `sentencePeriod`)

Cantillation anywhere → Biblical (a Masoretic text) — unless more words have an Aramaic reading than a Hebrew one (then Biblical Aramaic). Else
each recognised word votes once for every period it has a reading in; a clear majority wins; a tie → the caller's declared variety (the reader's
period or the learner's target); still a tie → fully pointed text is Biblical, unpointed is Modern; nothing recognised → declared, else Modern.
Readings of the chosen period go first on every word; none is removed; every reading carries `notes.period` and `notes.periodBasis`.

## Known limits (stated on the card and in the pack)

- A word outside the compiled core has no reading until the host installs the full index assets; the Modern index is never compiled in.
- No parser: homographs within one period (כותבים "they write" / "writers") keep both readings, neither first (the tables carry no frequency).
- An unpointed word reaches pointed Biblical forms through its consonants; the reading says its vowels were inferred.
- Prefix peeling is by rule and low-confidence; a prefix + unknown stem gets nothing.
- Transliteration is a general scheme with Modern letter values; no voice exists for Biblical Hebrew.
- The kaikki Hebrew dictionary is downloaded (data/raw/kaikki-he) but not yet built as dictionary shards (`dict:build --lang he`); the pack declares no dictionary.
- Not done: the extension-page build of Biblia; the hosts' loading of the full index assets outside Biblia; dictionary shards. Done since the first
  draft of this file: GoTell/GoReview period targeting (PLAN14 P4), the Biblia reader shell (P5, `packages/biblia`), and (2026-10-19) the extension
  registration of `he`: `LANGUAGE_META` (page tags he, iw, hbo), the analyser loader and chunk (`dist/analysers/he.js`), the resolver (hbo → the
  Biblical period; Hebrew script detected, shared with Aramaic and Yiddish, so the analyser decides the period), the setup app's language list.

## Audit (2026-10-19)

- **Tanakh read back** (`npm run scripture:audit-first-reading`): `docs/hebrew/SCRIPTURE-AUDIT.md` — the Biblical index is built from these
  texts, so coverage is total by construction; the first reading is the Open Scriptures reading of that very token for 92.6–97.3 % of tokens
  (Genesis 96.3, Exodus 97.3, Psalms 96.0, Isaiah 95.7, Proverbs 92.6, Daniel 95.4, Ezra 96.7 %), with 25–36 % of tokens carrying several
  readings in the period (absolute vs construct state, אֶת object marker vs "with", a name vs the common noun). Every Tanakh verse was read as
  Biblical Hebrew; the Aramaic verses of Daniel (200) and Ezra (67) were read as Biblical Aramaic. In Biblia the source's own reading of the
  tapped token is put first (`ParseContext.gold`); the analyser's reading stays as the alternative.
- No independent Hebrew gold exists in the repository (the Open Scriptures morphology IS the index's source); rabbinic Hebrew has not been
  audited: no Mishnaic text is on disk (permission to fetch one from Sefaria is requested in the owner report).

## Rabbinic audit and the fixes it led to (2026-10-19, later)

- **Mishnah Berakhot and Pirkei Avot** (Sefaria, Torat Emet 357, public domain, pointed; approved download, `data/raw/audit-texts/sefaria`;
  `npm run texts:audit-plain`): `docs/hebrew/RABBINIC-AUDIT.md`. Before the fixes 81.6 % / 80.2 % of word tokens had a reading; after them
  94.6 % / 93.2 %. With nothing declared the sentences read as Biblical (the text is fully pointed) or Modern; with Mishnaic declared, the
  sentences with a Mishnaic-labelled reading read as Mishnaic (73 of 171, 83 of 234). No Mishnaic index exists; what stays uncovered is
  rabbinic lexis and names (שַׁמַּאי, רַבָּן, רַשַּׁאי, הַבְּרִיּוֹת, שָׁעוֹת) and the Aramaic-shaped forms; a tagged rabbinic corpus is what would cover them.
- **Defects found and fixed**: (1) the prefix regexes expected the dagesh BEFORE the vowel point, but NFC puts it after (בְּ is ב + ְ + ּ), so
  בְּ, כְּ and שֶׁ never peeled — any order is accepted now; (2) the article's and שֶׁ's doubling dagesh in the next letter kept the rest
  from matching (שֶׁנֶּאֱמַר) — a variant without it is tried; (3) the Mishnaic masculine plural ־ִין (מְבָרְכִין, חַיָּבִין) had no rule — read
  as the ־ִים form, marked unconfirmed, and counted as Mishnaic evidence for the period; (4) the Name written יי or ה׳ (לַייָ) had no reading
  — the index's readings of the Name, marked as the rabbinic abbreviation; (5) letters as numbers (ג׳, י״ב) had no reading — `gematriaValue`;
  (6) a pointed form the indexes lack as written (שְׁלשָׁה, the defective spelling) got nothing — now matched by its letters, marked
  "pointing differs from the source's form", unconfirmed; (7) the prefix morphemes OSHB cites by a letter (l in לוֹ, b, k, m) had the code
  letter as their headword in the index and on cards — the Biblical index and core were rebuilt with their Hebrew headwords and glosses
  (לְ "to, for"; same core size: 441 lemmas, 6,994 forms).

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
- Not done: dictionary shards. Done 2026-10-22: the full indexes ship to the EXTENSION as shards (`npm run lexicon:shard`: he/biblical 22 shards 1.4 MB,
  he/modern 23 shards 2.7 MB; `dist/lexicon/`, loaded by the content script before a lookup through the analyser chunk's own loader), and the
  period vote weighs an unpointed word's consonant-only Biblical match at half, so unpointed Modern text reads as Modern beside the full Tanakh. Done 2026-10-21: the extension-page build of
  Biblia (`npm run local:build` ends with `biblia:build-ext`; "Open Biblia" on the setup app's reader screen). Done since the first
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

## Modern Hebrew on web pages: the dictionary and the commonest misses (2026-11-13)

The language audit of 2026-11-13 read two Hebrew Wikipedia articles (לחם, מים; 1,000 word tokens) through the card exactly as the
extension reads them, with both full indexes installed. Before: 80.9 % of words had a reading, and the dictionary answered for none
(Hebrew had no dictionary). The commonest misses were not rare words but whole classes:

- **Headword-line forms.** `he:build-modern` read only the inflection TABLES; the plural, construct and feminine forms Wiktionary gives on
  the headword line of an entry without a table (פְּרִי: plural פירות; נְקֻדָּה: construct נקודת־) had no reading. They are read now:
  15,788 more rows, 157,329 form keys (was 149,277).
- **Prepositions with a pronoun suffix** (שלהם, לי, אותו, עליו, ממנו …). Wiktionary has no entry for any of them. A hand table
  (`src/adapters/hebrew/pronominal.ts`: 14 prepositions × 9 persons, AI-drafted, unreviewed) reads them, with a leading ו / ש / כש
  peeled. On unpointed text its reading comes first and any other reading of the same letters stays (שָׁלֵו for שלו); on pointed text
  the Tanakh index keeps the word unless it has no reading.
- **The dictionary.** `dict:build --lang he` now builds the Wiktionary Hebrew dictionary (kaikki-he@2026-10-03, 41,288 entries, 256
  shards, plus 15,902 full records under `full/`), and the pack declares it. The build files every entry also under its POINTED
  spelling and its headword-line forms (`src/dict/hebrew.ts`), because the card asks for the pointed lemma (לֶחֶם) while Wiktionary files
  the entry under the unpointed word (לחם); a spelling-only entry ("defective spelling of נקודה.") becomes a link to the entry it names.
  The adapter's `lemmaVariants` adds the unpointed Wiktionary headword and the bare consonants.

After, on the same 1,000 words: **87.2 %** have a reading, and the dictionary answers for **86.3 %** of them. Regression test:
`test/adapters/hebrew-modern-web.test.ts` (with a floor of 88 % on the opening of the Wikipedia article לחם, fixture CC BY-SA 4.0).
Still missing: words Wiktionary has no entry for (צלזיוס, תרכובת, שאור, גלוטן, תמיסה), participles of verbs without a table (המהווה,
מזוקקים), and the construct of nouns in -ייה (אפיית). Readings are still not ranked: 58 % of words keep several.

**Shipping order.** The pack now declares `dict/he`: installing the Hebrew pack fetches its manifest, and GoReview reads it. The hosted
copy (`dict/he` beside the other dictionaries) must be published before, or together with, any GoLearn or GoReview build from this
change; otherwise a fresh Hebrew install fails with `dictionary-unreachable`, and GoReview counts the 404 as a source failure.

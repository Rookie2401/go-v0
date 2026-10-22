# Greek (`el`) — status

Updated 2026-10-18 by the Hebrew/Greek session. Plan: `docs/PLAN14.md`. Everything below is measured by the scripts and tests named; nothing
has been reviewed by a classicist or a native speaker.

## What exists

| part | state |
|---|---|
| language | `el` in `LanguageCode`, `LANGUAGE_ROWS` (script Grek), course `greek` (default target `el-mod`) |
| period varieties | `el-hom`, `el-att`, `el-koi`, `el-med`, `el-mod` (kind `period`); `el-ion`, `el-dor`, `el-aeo`, `el-arc` (regional, recognised beside Attic); `el-kath` Katharevousa (historical). `src/adapters/greek/varieties.ts` |
| adapter | `adapter-el@1` (`src/adapters/el.ts`, `src/adapters/greek/**`): tokenizer (Intl.Segmenter el), sentence splitter (. ; ! …; the ano teleia is not a break), form indexes keyed polytonic (grave → acute, vowel-length marks dropped) with a diacritic-free fallback, MorphGNT decoder, kaikki tag mapper (table headers carried as `table:<header>` → tense and dialect), period decision per sentence, three pronunciation conventions, four production rules, paradigm and variants off the indexes |
| Koine index | `npm run el:build-koine` (scripts/el-build-koine.mts) from the Biblia app's SBLGNT+MorphGNT data: 27 books, 7,953 verses, 137,554 tokens → **18,056 form keys, 19,315 readings, 5,461 lemmas** (every one with a lexicon entry; Septuagint counts kept), 2.3 MB (`public/lexicon/el/koine-index.json`, git-ignored). Core compiled into the adapter: 461 lemmas, 2,793 forms, 3,163 readings, **80.2 % of the New Testament's tokens**, 295 kB. Details: `docs/greek/KOINE-INDEX.md` |
| Ancient index | `npm run el:build-ancient` (scripts/el-build-kaikki.mts --lang grc) from kaikki Ancient Greek (2026-10-03): 67,371 entries, 10,191 with tables, 852,165 table rows, 7,608 dialectal alternative forms, 48,509 form-of entries → **638,137 form keys, ~922k readings, 27,189 lemmas**, 6,648 entries with a stated Modern Greek descendant; table headers name the dialect (Attic ×16,805, Epic ×2,500, Ionic ×900, Koine ×143, Byzantine ×54 …), 123.5 MB (`public/lexicon/el/ancient-index.json`, git-ignored). Details: `docs/greek/ANCIENT-INDEX.md` |
| Modern index | `npm run el:build-modern` (--lang el) from kaikki Greek: 84,371 entries, 23,988 with tables, 438,186 table rows → **265,701 form keys, 523,185 readings, 33,174 lemmas**, 4,820 with a stated Ancient Greek ancestor, 58.0 MB (`public/lexicon/el/modern-index.json`). Details: `docs/greek/MODERN-INDEX.md` |
| pack | `pack:el` experimental (`packages/language-packs/src/packs/el.ts`): 20 validation cases read with the core alone (incl. two that state the core's limits), 8 explained features, 3 constructions, tutorial `tutorial/el` (3 own steps) |
| tests | `test/adapters/greek-periods.test.ts` (15; the full-index half runs only when the assets are built locally), `test/adapters/hebrew-greek-packs.test.ts` (6) |
| agreement source | Perseus Ancient Greek Dependency Treebank 2.1 downloaded (`data/raw/perseus-treebank`, 34 texts: Homer, Hesiod, Herodotus, Thucydides, Sophocles, Aeschylus, Plato, Polybius, Plutarch …, CC BY-SA 3.0) — **not yet consulted** |

## How the period is decided (greek/analyze.ts `sentencePeriod`)

Polytonic marks anywhere → an ancient period: the one most recognised words have a reading in; a tie → the declared variety, else Koine when
≥ 80 % of the words are New Testament words, else Attic. No polytonic mark: a word starting with a vowel and no breathing is monotonic evidence
→ Modern; a word spelled alike in both systems (λόγος) is evidence of neither → the declared variety decides; otherwise Modern when any word has
a Modern reading. Readings of the chosen period go first; none is removed; every reading carries `notes.period` and `notes.periodBasis`.

## Known limits (stated on the card and in the pack)

- Only the Koine core is compiled in; Ancient and Modern readings need the installed assets. The Ancient asset is 123 MB of JSON and must be
  sharded or compacted before any host ships it (PLAN14 P3 follow-up).
- Without the Modern asset a Modern form may reach a Koine form through its bare letters (είναι → the infinitive εἶναι), honestly marked provisional.
- The Attic/Homeric readings are single-source (Wiktionary tables) until the Perseus treebank agreement run exists.
- Pronunciation is three written conventions; no voice exists for ancient Greek.
- The kaikki Greek dictionaries are downloaded but not built as dictionary shards; the pack declares no dictionary.
- Not done: the Perseus treebank is used for the AUDIT below but not yet as a second source inside the Attic/Homeric readings; dictionary shards;
  sharding of the Ancient asset. Done 2026-10-21: Biblia ships as an extension page (`npm run local:build`, "Open Biblia" on the reader screen). Done since the first draft: GoTell/GoReview period targeting (P4), the Biblia reader shell (P5), and (2026-10-19)
  the extension registration of `el`: `LANGUAGE_META` (page tags el, grc), the analyser loader and chunk (`dist/analysers/el.js`), the resolver
  (grc → Attic, or Koine with a koi / x-koine subtag; Greek script detected), the setup app's language list.

## Audits (2026-10-19)

- **Perseus treebank** (`npm run el:audit-treebank`, independent gold, 3,000 tokens per text, first reading of a lookup ordered by attestation, no
  parser): `docs/greek/TREEBANK-AUDIT.md`. After this audit two defects were fixed and the audit re-run: (1) Homer was read as Attic because an
  Attic reading is the Ancient tables' default — the period decision now counts only DISTINCTIVE evidence (Epic-only readings and Homeric
  shapes: -οιο, -εσσι, -φι, κε(ν), ἄρα, ἠδέ, μιν …), then the declared variety, then the New Testament's vocabulary (a text almost wholly of NT
  words with few words the NT lacks reads as Koine), else Attic; (2) elided words (δ᾽, τ᾽, ἀλλ᾽, ἠδ᾽) were read as letter-numerals — an elision
  rule now restores the vowel (the usual elided words first) and prefers a particle/conjunction/preposition reading for a short stem. Also fixed
  in the index build: a participle headword with no meaning of its own (ὤν) files its table under its verb (εἰμί).
- **New Testament read back** (`npm run scripture:audit-first-reading`): `docs/greek/SCRIPTURE-AUDIT.md` — the Koine index is built from these
  texts, so coverage is total by construction; the first reading is MorphGNT's reading of that very token for 92–95 % of tokens (Matthew 94.6,
  John 95.1, Romans 93.1, Hebrews 93.4, Revelation 92.2 %), with 34–43 % of tokens carrying several readings in the period (the parser's missing
  work: the article's gender and case, καί conjunction vs adverb). In Biblia the source's own reading of the tapped token is put first
  (`ParseContext.gold`), so there the figure is 100 % by construction and the analyser's reading stays as the alternative.
- Attic vs Koine prose (Plato, Thucydides vs Polybius, Plutarch) is NOT told apart by vocabulary: Polybius and Plutarch read as Attic unless
  the learner's target or the reader declares Koine; the card says so in its period line.

## Audit on plain texts and the fixes it led to (2026-10-19, later)

- **Plain texts, no gold** (`npm run texts:audit-plain`): `docs/greek/TEXTS-AUDIT.md` — Aristotle (Nicomachean Ethics, Metaphysics), Plato (Republic),
  Marcus Aurelius, Euclid, Archimedes (Perseus / First1KGreek, CC BY-SA 4.0, `data/raw/audit-texts`, approved downloads), the first 4,000 word
  tokens each. After the fixes below: covered 93.3 / 94.9 / 94.3 / 87.7 / 97.0 / 94.0 %, read as Attic with a few Koine sentences (Marcus and
  Euclid read as Attic: vocabulary cannot tell literary Koine from Attic; the card's period line says so); no sentence of the prose texts is
  read as Homeric except one of the Metaphysics (three Epic-only readings and four marks among 95 words), and none as Modern except one
  one-word sentence of the Republic. What stays uncovered: proper names (Πολέμαρχος, Σιμωνίδης, Κλαζομένιος), rare compounds and
  Aristotle's coinages (γνωρίζειν, πειρατέον), which no Wiktionary table holds.
- **Defects found and fixed** (rules, each reading marked `origin: 'rule'` and saying what it did): (1) an elided stem ending in a vowel
  (διʼ for διά) was refused by the elision regex; (2) an apostrophe set as a separate character by the edition (οὔτ ʼ) left the stem
  unread; (3) crasis (τἀγαθόν, τἆλλα, κἀγώ) had no rule — the coronis on the first vowel now gives τό/τά or καί + the word, trying the
  contraction's circumflex as an acute and ου as ο; (4) Euclid's and Archimedes' diagram labels (ΑΒΓ) and letter-numerals (ιϛʹ, α΄ with
  the keraia split off by the tokenizer) counted as uncovered words — now a label reading (pos X) and a Milesian numeral reading
  (`milesianValue`); (5) capital headings without breathings (ΑΞΙΩΜΑΤΑ) and single letters counted as monotonic evidence and made the
  sentence Modern — no longer; (6) ἄρα (the ordinary inferential particle of Attic prose) was a Homeric mark and made Attic sentences
  Homeric — ἄρα / ἄρ᾽ / τοι are now WEAK marks, counted only beside an Epic-only reading or a strong mark, or when the sentence before
  was Homeric; a Homeric run continues on single evidence; (7) a sentence whose spelling shows neither system (φαίνεται.) was read as
  Modern in a polytonic text — the analyser now remembers the period of the last sentence decided by evidence and reads on in it when
  nothing is declared (`resetElPeriodMemory()` for tests).
- **Treebank audit re-run after the fixes** (`docs/greek/TREEBANK-AUDIT.md`): Iliad 181 of 233 sentences Homeric (was 173), Odyssey 165
  of 230 (161); Euthyphro 2 Homeric sentences (was 4), Sophocles 12 (17), Thucydides 1 (1); Herodotus (Ionic) 63 (56: Ionic shares its
  forms with Epic, and the treebank's Ionic reads as Homeric about a third of the time — a known limit, el-ion is recognised on cards but
  is not a period the decision chooses); lemma and POS agreement unchanged within 0.3 points.

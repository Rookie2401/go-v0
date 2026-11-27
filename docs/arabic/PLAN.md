# Arabic pack: build plan and contract

Branch `feat/arabic-pack`, worktree `C:\Users\CJWal\dev\go-v0-arabic` (never under OneDrive), from master `a822b1ab`. The owner's brief
("GoLearn — Arabic Language Pack Implementation", 2026-11-25) asks for Arabic inside the existing GoLearn architecture: no separate
app, reader, vocabulary store or scheduler, and no dependency on Reading Analysis. Model: the Russian pack (`docs/russian/PLAN.md`,
`AUDIT.md`) for the data design, the Hebrew pack for right-to-left, vowels and two varieties.

## Design in one page

1. **Compiled core** `src/adapters/arabic/generated/core.ts` (`ar-core`): the closed classes and the commonest lemmas with every form.
2. **Sharded full index** `public/lexicon/ar/standard/` (`kaikki-ar-tables`): every conjugation and declension row and form-of page of
   the Wiktionary Arabic extract, gzip shards by letter prefix, loaded on demand (`arabic/shards.ts`).
3. **Dictionary** `public/dict/ar/` by the existing pipeline (`dict:build` …): senses, IPA, the records behind "All forms".
   GitHub Pages is near its size limit: `dict/ar` must stay under about 100 MB (the release manager's condition).
4. **Analyser** `src/adapters/ar.ts` + `src/adapters/arabic/**`: tokens → clitic segmentations → index lookup of the stem → vowels
   compared with the page's → features → sentence ordering → constructions, phrases, shallow syntax, pronunciation.

**Sources (licences checked 2026-11-25).** Shipped: Wiktionary via kaikki.org (CC BY-SA 4.0; the copy at
`C:\Users\CJWal\dev\lisan-v0\data\dict\kaikki-arabic.jsonl`, 519 MB, 78,135 entries, read in place, never copied into git);
hermitdave/FrequencyWords `ar_50k.txt` (CC BY-SA 4.0; surface frequencies, same folder). Local measurement only, never shipped and
nothing derived from it shipped: the Quranic Arabic Corpus morphology (`lisan-v0\data\dict\quran-morphology.txt`; verbatim-only
terms). Not used at all: CAMeL Tools databases (GPL v2 / LDC-derived), UD Arabic-PADT (non-commercial), NYUAD (needs LDC text),
Lane's Lexicon digitizations (licence unclear). CAMeL Morph / CAMeL Tools were evaluated as the brief asks: Python and Rust, 40–700 MB
models, GPL or LDC data; they cannot run in a Manifest V3 extension and their data cannot be shipped. The decision and its cost
(no statistical disambiguator) are stated in the pack's limitations.

## Decisions that bind every package

- **Views of a word** (`arabic/text.ts`, written, tested): printed (never changed) → `arCanon` → `arKey` (no marks, no tatweel;
  hamza seats, ة, ى kept) → `arLoose` (retrieval only) ; vowels packed with `packVocal` / shown with `applyVocal`; printed vowels
  compared with a candidate by `vocalMatch`; `arKeyMap` maps key letters to offsets in the printed word.
- **Index** (`arabic/index-store.ts`, written): key → rows `[lemma, code, vocal]`; lemma rows `[head, gloss, pos, lex, count, root?]`;
  `loose` map; `lookupArabicForm(key)` gives direct hits then loose ones. **The index holds words without clitics.**
- **Lemma string** on a candidate = the VOCALIZED headword (`كِتَاب`, `كَتَبَ`, `عِلْم`), NFC. Repository id `lemma:ar:<head>:<POS>`.
  Homographs stay distinct (عِلْم / عَلَم / عَلِمَ). A verb's lemma is its third-person masculine singular perfect. `lemmaVariants`
  gives the dictionary the unvocalized key.
- **Never credit the wrong lexeme.** An unvocalized word with readings of DIFFERENT lexemes that nothing decides gets a top confidence
  below 0.5, so the item is the form (`form:ar:<key>`), not a lemma. Rules: one lexeme only → 0.90; several lexemes and the page's
  vowels leave one → 0.90; the sentence decides (a governing particle, the article, an attached pronoun, agreement) → 0.75–0.85;
  a closed-class word whose dominant reading is listed in the hand priors → 0.70; undecided → the best ≤ 0.45, all kept.
  A reading reached by the loose fold −0.10 and `notes.spelling = 'restored'`. A clitic segmentation is −0.05 per clitic against a
  whole-word reading of the same key (وجد is the verb before it is و + جد). A guess from a pattern alone ≤ 0.35, `unconfirmed`, no gloss.
- **Vowels shown are labelled.** `notes.vowels`: `source` (the page printed them), `dictionary` (the index's, the page printed none or
  part), `unresolved` (readings disagree and nothing decides). The page is never rewritten.
- **Clitics** (`arabic/clitics.ts`): proclitic chain `[أ] [و|ف] [ب|ك|ل|س] [ال]` (and لل = ل + ال, the emphatic لَ), enclitic pronouns
  (ي ني نا ك كما كم كن ه ها هما هم هن). A segmentation is kept only when the stem is in the index (or the closed-class table) with a
  part of speech the clitics allow: ال and a preposition only on nominals, سـ only on an imperfect verb, ني only on verbs, a
  possessive only on nouns in construct form. Stem spelling before a suffix is undone: ة → ت, ى → ا / ي, وا → و, ون/ين → و/ي,
  the hamza seat. `parts` on the candidate: `prefix` / `stem` / `suffix`, each with its text (a slice of the printed word through
  `arKeyMap`), role and morph. Cards annotate the WHOLE word; the breakdown is inside the card (joining is never broken).
- **Feature keys and values** (UD style): `Case` Nom Acc Gen; `Number` Sing Dual Plur; `Gender` Masc Fem; `Definite` Def Ind Cons
  (construct); `Person` 1 2 3; `Aspect` Perf Imp (the conjugations; time is contextual and only described); `Mood` Ind Sub Jus Imp
  (+ `Mood=Ene` energetic where the source has it); `Voice` Act Pass; `VerbForm` Fin Part Vnoun; `Form` I … X, Iq …;
  `Decl` Trip Dip Indecl; `PluralType` Sound Broken; `Pausal` Yes (the source's "informal" rows: the form without its ending).
  Unions sorted and comma-joined (`Person=2,3`: تَكْتُبُ is "you (m.)" or "she"). An absent vowel never becomes a feature:
  a case the sentence implies is `notes.case = 'inferred: genitive after بـ'`, not `Case=Gen`, unless the page printed the ending.
- **Root**: `notes.root` = the source's root, radicals in order ("ك ت ب"); never derived by stripping letters. Weak-root class
  (`notes.rootClass`: sound, assimilated, hollow, defective, doubly-weak, geminate, hamzated) from the radicals.
- **Varieties**: `ar-msa` (default) and `ar-cla`. A candidate lists `varieties: ['ar-msa','ar-cla']` unless the lemma's `Reg` says
  one. Dialect is never analysed as MSA: common dialect markers (مش، ايه، عايز، بدي، شو، هيك، بتاع، اللي، ليش، وين، كده …) are a
  closed list; a sentence with them is flagged `notes.variety = 'dialect?'` and its readings are capped at 0.45.
- **Honesty**: `support.lemmatization` is `'seed-only'`; nothing 'dependable' beyond tokenization; every limitation in plain words;
  no claim of review by a native speaker or an Arabist. Nothing is invented: a word no source has gets nothing or a marked guess.

## The index build (`scripts/ar-build-index.mts`, `npm run ar:build-index`)

Input: the kaikki file above (`--in`), frequencies `ar_50k.txt` (`--freq`). Output: shards + `manifest.json` under
`public/lexicon/ar/standard/`, `src/adapters/arabic/generated/core.ts`, `docs/arabic/INDEX.md`. Deterministic (`--date`).

1. **Entries.** POS map: noun NOUN, name PROPN, verb VERB, adj ADJ, adv ADV, pron PRON, det DET, article DET, prep ADP, conj CONJ,
   particle PART, num NUM, intj INTJ; others skipped and counted. A lemma entry has a sense without `form_of`/`alt_of`; a form page
   has only those.
2. **Lemma row.** `head` = the `canonical` form (vocalized), NFC through `arCanon`. `gloss` = first non-form-of gloss, cut at `,`/`;`
   to ≤ 80 chars. `lex`: `Gender` (noun), `Form` (verb: from the canonical tags `form-i` …), `Decl` when uniform, `Reg`
   (survey the sense tags and categories first and report what labels exist). `root` from `etymology_templates` `ar-root` /
   `ar-rootbox` arg 1 (also `root` templates; report coverage).
3. **Lemma id** `<head>|<POS>`, `|2` … for a further entry with the same vocalized head and part of speech, in file order.
4. **Table rows.** Every `forms[]` row whose `source` names a table, except `table-tags`, `inflection-template`, `romanization`,
   `canonical`, `-`, forms with a space, rows the source marks as errors. `code` = tags sorted, joined `|`, verbatim.
   `vocal` = `packVocal(form)`; key = `arKey(form)`. Head-line forms (plural, non-past, verbal noun, feminine, elative …) are rows
   too when their own page does not exist as a lemma; say how they are handled.
5. **Form pages** (41k "ar-verb form" pages and others): resolved to their lemma entry by vocalized target; the vocalized form of the
   page is its `canonical` form; tags from the sense. Added only when (key, lemma, vocal) has no table row. The page's analysis in
   `head_templates[0].expansion` may be needed (Lisān's `scripts/dict-lib.mjs` `parseVerbFormExpansion` shows how; read-only).
6. **Row merging for size**: rows of one (key, lemma) whose vowels differ only on the LAST letter (the three cases, definite /
   indefinite / construct endings) may be stored once per distinct (vocal, code); measure first, then decide and document.
   Target: full index ≤ about 15 MB gzip, shards ≤ 1.5 MB raw each.
7. **`loose`**: for every key that differs from `arLoose(key)`, `loose[arLoose(key)]` lists it.
8. **`count`** = round(Σ over the lemma's distinct keys k of freq(k) / number of lemmas holding k), freq from `ar_50k.txt`.
9. **Shards** by `arShardLetters(key)` prefix (1 → 2 → 3 letters while over `--limit`), `_` for none; gzip; `manifest.json`
   (`ShardManifest` of `src/adapters/shared/shards.ts`).
10. **Core**: closed classes with count ≥ 1, then open-class lemmas by count, each with all forms, until `--core-budget`
    (default 500,000 bytes). `stats.tokenCoverage` against `ar_50k.txt` (by frequency mass; note that clitic forms are not keys).
11. **INDEX.md**: the figures, skipped kinds, unresolved targets (top 50), root coverage, register labels found.

## Packages and file ownership

One writer per file. A package edits only its own files, runs only its own tests, never commits, never stashes, never switches
branch, never writes under OneDrive, never downloads. Shared registration lists are the lead's, and wait until Korean is on master.

| Package | Owns | Delivers |
|---|---|---|
| **Lead** | `arabic/{text,index-store,shards,version}.ts`, `src/adapters/ar.ts`, every shared file, `public/dict/ar`, `docs/arabic/{PLAN,AUDIT,REPORT}.md`, package.json | contract, integration, dictionary, release hand-over |
| **A Data** | `scripts/ar-build-index.mts`, `arabic/generated/core.ts`, `public/lexicon/ar/**`, `docs/arabic/INDEX.md`, `test/adapters/arabic-index.test.ts` | the index build above |
| **B Morphology** | `arabic/{tags,describe,clitics,closed,analyze,guess,roots,paradigm}.ts`, `test/adapters/arabic-{tags,clitics,morph}.test.ts` | tag bundle → features; `arSegmentations(key)`; the closed-class table; `arWordCandidates(token)` |
| **C Context** | `arabic/{sentence,government,constructions,phrases,syntax,dialect}.ts`, `test/adapters/arabic-{context,constructions}.test.ts` | `arAnalyze(tokens)`, patterns, phrases, shallow syntax, the dialect flag |
| **D Sound & script** | `arabic/{pronunciation,translit,numbers,speech,production,alphabet}.ts`, `packages/language-packs/src/tutorial/ar.ts`, `test/adapters/arabic-{pronunciation,numbers}.test.ts` | transliteration (scholarly), pronunciation notes (sun letters, hamzat al-waṣl, tāʾ marbūṭa, pausal), number words, speech normalisation, the 28-letter data, the orientation tutorial |
| **S Sprint** | `packages/language-packs/src/alphabet-sprint/{profiles,words}/ar.ts`, `scripts/alphabet-sprint/ar.mts`, `test/alphabet/sprint-ar.test.ts` | the mandatory Alphabet Sprint (the brief's eight stages) |
| **F Quality** | `scripts/ar-eval.mts`, `docs/arabic/EVAL.md`, `test/fixtures/arabic/**`, `test/adapters/arabic-gold.test.ts` | the brief's regression table as fixtures; local measurement against the Quranic corpus; miss lists |

Order: A, D, S start at once; B starts on `tags.ts`, `clitics.ts`, `closed.ts` at once and on `analyze.ts` when A's core exists;
C when B's candidates exist; F writes fixtures at once and measures when B lands.


## Amendments after the first audit (2026-11-25)

An independent audit (the "Arabic auditor" session) read this plan and `text.ts` at cc26468a. Where this section differs from the
text above, this section is the rule.

### Which lexeme a bare spelling credits

Measured by the auditor on the extract weighted by the frequency list: 18.6 % of running words have no lexeme on their bare key,
28.5 % one, 19.3 % two, 10.0 % three and 23.6 % four or more, before any clitic is cut. "Undecided, so no lexeme is credited" alone
would therefore leave قال, كان, شيء, بعد and يوم without their lexeme. Three layers decide, in this order:

1. **Structural priors** (automatic, `analyze.ts`). A rival reading does not make a word undecided when it is marginal against a
   plain reading of another lexeme. Marginal: a passive, imperative, jussive-only, energetic, dual or second-person-feminine cell;
   a first or second person against a third; a reading that needs a clitic cut against a whole word that is a lemma's own citation
   form; a proper name against a common word. Plain: the lemma's head form, a third-person masculine singular active perfect or
   imperfect, a singular or plural noun or adjective cell. One plain lexeme against marginal rivals only: 0.60,
   `notes.identity = 'structural'`.
2. **Reviewed identities** (`identities.json`, read through `identities.ts`). For the most frequent ambiguous keys, one entry each:
   the lemma id that is the main reading (0.70, `notes.identity = 'main'`), or `null` for a pair a reader really has to choose
   between (كتب, علم, ذهب: undecided whatever layer 1 says). A main reading may be a clitic chain ("ف+قَدْ|PART"), so that فقد, وقد,
   وهم, كما and لها lead with the function words. The list is machine-drafted, reviewed word by word by the lead, and says so; a
   key that is not in it gets layer 1 only.
3. **The sentence and the printed vowels** raise or overturn both.

A second segmentation is a rival like any other: the −0.05 a clitic costs only orders readings. Undecided: every reading ≤ 0.45,
`notes.identity = 'undecided'`, and the item is the form.

`count` no longer splits a key's frequency among the lemmas that share it (that gives every homograph the same share). It is the
frequency of the keys a lexeme holds alone, plus the keys the identities list gives it.

### One lemma string per lexeme

- `arHeadForm` (text.ts) is the one spelling of a headword; the build and every hand-written headword go through it, and a test
  over the whole core asserts it.
- Two entries with the same vocalized headword and part of speech (about 400 sets) are ONE vocabulary item: one candidate, the
  glosses of all of them shown and numbered. File order never chooses.
- A participle or verbal noun is its own lexeme. When the source has an entry for it, the verb's table cell is dropped at build
  time; when it has none, the reading's lemma is the cell's own form (كَاتِب), with `notes.derivedFrom` naming the verb. Knowing
  كَتَبَ never marks كاتب.
- `form:ar:<key>` is one unit for every reading of a spelling (كَتَبَ, كُتِبَ, كُتُب), as in Hebrew. Marking it credits no lemma.

### Text

`vocalMatch` compares only what a candidate SAYS: a letter it leaves bare is not evidence, implied vowels count as said, and the
shadda print puts on a sun letter after the article is the article's. Decomposed input keys as composed input does. The Quranic
sukūn and open tanwīn are read as vowels, and `arQuranicSpelling` gives a second, ordinary spelling to look up. A phrase ligature
(ﷺ) is a symbol; a letter written onto a number is a word before the number; ڤ پ چ گ fold to ف ب ج ك for retrieval; a final Persian
yeh is tried as ي and as ى.

### Clitics the chain also covers

لِـ and لَـ on verbs; ني on particles and prepositions; ـتمو before a pronoun; two object pronouns; the vocative يا written onto its
word; fused particles (مما, عما, فيما, ألا, لئلا, كيلا, إنما) and ـئذ words as entries, not cuts.

### What a learner sees

- `Person=2,3` is one reading that says "you (m. sg.) or she", never two readings with the first shown as decided.
- An inferred case is shown, marked inferred (`notes.case`, `notes.caseSource = 'inferred'`).
- A dialect cap needs two markers, or one that Standard Arabic cannot produce.

### Rights

Only the kaikki extract and the frequency list are read by any build. Nothing from Lisān's built dictionary or corpus (its roots
come partly from a GPL corpus; its texts have their own terms). Test sentences are written for the tests. The frequency list is
subtitle text: it orders readings and is never evidence that a spelling is correct.

### Measurement

The Quran is one register, fully vocalized, and the easy case. A figure for unvocalized Modern Standard prose needs its own gold:
UD Arabic-PUD (CC BY-SA 3.0) if the owner allows the download, otherwise at least 1,000 hand-annotated words frozen before the
analyser reads them. Every accuracy figure is reported with the undecided share and the confident-and-wrong share beside it.

### The Classical track

Whether "Classical" is more than a label depends on how many lexemes the source marks as classical or modern only. The index build
reports the count; if it is small, the report and the pack's limitations say that the Classical track has no classical dictionary
behind it, and the owner is told before release.

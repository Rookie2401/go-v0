# Russian pack: build plan and contract

Branch `feat/russian-pack`, worktree `C:\Users\CJWal\dev\go-v0-russian` (never under OneDrive). The audit behind this plan is `docs/russian/AUDIT.md`. The owner's brief asks for a Russian pack inside the existing GoLearn architecture: no separate app, vocabulary store, scheduler or audio service, and no dependency on Reading Analysis.

## Design in one page

Russian follows the Hebrew / Modern Greek model, because the card's lemma comes from the analyser's synchronous `analyze` and the Russian lexicon is far too large to compile in:

1. **Compiled core** `src/adapters/russian/generated/core.ts` (`ru-core`): the closed classes and the commonest lemmas with every form, about 450 KB. A host with no assets still reads ordinary prose.
2. **Sharded full index** `public/lexicon/ru/standard/` (`kaikki-ru-tables`): every inflection-table row and form-of page of the Wiktionary extract, gzip shards by letter prefix, loaded on demand before a lookup (`russian/shards.ts`, the shared loader).
3. **Dictionary** `public/dict/ru/` built by the existing pipeline (`dict:build`, `dict:build-full`, `dict:build-forms`, `dict:build-reverse`): senses, IPA, the full records behind the card's "All forms" table.
4. **Analyser** `src/adapters/ru.ts` + `src/adapters/russian/**`: index lookup → features → context ordering → constructions, phrases, shallow syntax, pronunciation notes.

Single source for lexical facts: Wiktionary via kaikki.org (CC BY-SA 4.0). Nothing is invented: lemma, tags, stress, aspect and aspect partners are the source's. Reading priors (lemma counts) come from UD Russian-GSD train (CC BY-SA 4.0). UD GSD/Taiga/PUD test sets are the independent gold for measurement; SynTagRus (non-commercial) is not used.

### Decisions that bind every package

- **Key** = `ruKey(form)` (`russian/text.ts`): NFC, lower case, U+0301 / U+0300 / soft hyphen removed, ё and й kept. It equals NFC + lower case on unstressed text.
- **ё** is never folded in a key. A text without ё reaches ё-forms through the index's `yo` map; such a reading carries `notes.yo = 'restored'` and both the as-written and the restored readings are kept.
- **Stress** is data on a form row (positions in the key), shown with `withStress`; never part of an identity.
- **Lemma string** on a candidate = the headword's key (unstressed, ё kept): `книга`, `прочитать`, `идти`. It must equal the dictionary headword so the gloss lookup and the Repository id `lemma:ru:<lemma>:<POS>` agree across the card, GoLearn Active and GoReview. Two lexemes written alike (за́мок / замо́к) share that id; the card shows both readings with their stress and gloss. This is a stated limitation.
- **Participles, adverbial participles, short forms, comparatives** are forms of their verb or adjective (lemma = the infinitive / the long masculine nominative), with `VerbForm`, `Variant`, `Degree` features.
- **Aspect** is a lexeme feature (`Aspect=Imp|Perf`, or `Imp,Perf` for a biaspectual verb). Perfective and imperfective verbs are separate lemmas with separate ids; the partner named by the source is shown as a relation, never merged.
- **Feature keys and values** (UD style, the repository's convention; unions are sorted and comma-joined, e.g. `Case=Acc,Nom`):
  `Case` Nom Gen Dat Acc Ins Prep (prepositional), plus Loc (second locative: в лесу́), Par (partitive: ча́ю), Voc;
  `Number` Sing Plur; `Gender` Masc Fem Neut; `Animacy` Anim Inan; `Person` 1 2 3;
  `Tense` Pres Past Fut (the non-past of a perfective verb is Fut, as the source labels it);
  `Mood` Ind Imp; `VerbForm` Fin Inf Part Conv (adverbial participle); `Voice` Act Pass; `Aspect` Imp Perf;
  `Degree` Cmp Sup; `Variant` Short; `Reflex` Yes.
- **Confidence** (the Repository's status rule: high-confidence needs ≥ 0.85 and no different reading within 0.15): a form the index holds as written 0.90; a ё-restored reading 0.88 when the as-written key has no reading, 0.70 beside one; a form the source labels dated / archaic / rare / colloquial 0.10 lower; a hyphenated word read through its parts 0.60; a guess from the ending ≤ 0.40 with `unconfirmed: true` and no gloss. Context rules only reorder readings and lower confidences; they never add, remove or rewrite one.
- **Candidate notes** (strings): `stress` (the form with its acute), `yo` ('restored'), `usage` (the source's labels: 'dated', 'colloquial' …), `partners` (aspect partner headwords, with stress), `context` (why a rule preferred this reading), `source` ('rule' for a rule-made reading). `origin: 'dictionary'`, `sourceId` from `russian/version.ts`.
- **Honesty**: `support.lemmatization` is `'seed-only'` (the compiled core) with the measured figures in the limitations; nothing 'dependable' beyond tokenization; every limitation said in plain words; no claim of review by a native speaker.

## The index build (`scripts/ru-build-index.mts`, `npm run ru:build-index`)

Input `data/dictionaries/kaikki.org-dictionary-Russian.jsonl.gz` (read through `zlib.createGunzip()`), priors `data/raw/ud-ru/ru_gsd-ud-train.conllu`. Output: the shards + `manifest.json` under `public/lexicon/ru/standard/`, `src/adapters/russian/generated/core.ts`, `docs/russian/INDEX.md` (figures). Types: `RussianFormIndex`, `RuLemmaRow`, `RuFormRow` in `russian/index-store.ts`; helpers in `russian/text.ts`. Deterministic: sorted keys, stable row order, `--date` for `built`.

1. **Entries.** Part-of-speech map: noun NOUN, name PROPN, verb VERB, adj ADJ, adv ADV, pron PRON, det DET, prep and postp ADP, conj CONJ, particle PART, num NUM, intj INTJ; every other kind (phrase, proverb, suffix, prefix, combining_form, character, symbol, punct, interfix, infix, prep_phrase) is skipped and counted. A **lemma entry** has at least one sense without `form_of`. A **form page** has only `form_of` senses.
2. **Lemma row.** `head` = the form tagged `canonical` (with its stress), else `word`. `gloss` = the first gloss of the first sense that is not a form-of, cut at a `,` or `;` boundary to at most 80 characters. `lex`: for a noun `Gender` (masculine / feminine / neuter) and `Animacy` (animate / inanimate) from the canonical row's tags; for a verb `Aspect` from the canonical tags (both → `Imp,Perf`), `Reflex=Yes` when the word ends in -ся / -сь, `Subcat=Tran|Intr` from the `table-tags` row when it says so; keys sorted. `partners`: for a verb, the head-line forms tagged exactly `perfective` or `imperfective` (not table rows). `count`: occurrences in GSD train of the lemma (compared through `yoFold(ruKey(…))`) with the same part of speech, where UD AUX counts as VERB and CCONJ as CONJ; when that is 0 for a PRON / DET / CONJ / SCONJ / PART / ADV lemma, the largest count of that lemma under another of those tags (Wiktionary and UD draw the closed classes differently).
3. **Lemma id** `<ruKey(word)>|<POS>`; a further lemma entry of the same word and part of speech gets `|2`, `|3` … in file order.
4. **Table rows.** Every `forms[]` row of a lemma entry whose `source` names a table (declension, conjugation), except rows tagged `table-tags`, `inflection-template`, `class`, `romanization`, `canonical`; except `-`; except a form with no Cyrillic letter (a romanization listed as a form); except a form with a space (the analytic future бу́ду чита́ть is the analyser's construction, not a form); except pre-reform spellings (a form containing ѣ і ѳ ѵ, or ending in ъ) which are counted and left out. Head-line forms tagged `comparative` or `superlative` are rows too; an optional prefix in brackets, `(по)краси́вее`, gives both spellings. `code` = the row's tags, sorted, joined with `|`, verbatim. `stress` = `packStress(stressPositions(form))`.
5. **Form pages.** For each `form_of` sense: the target word (stress kept for matching), the sense's tags minus `form-of`. The target resolves to the lemma entries with the same key and part of speech, preferring those whose head has the same stress positions when several match; with no such lemma entry, to a form page of that key whose own target is a lemma entry (one further hop: читающего → читающий → читать), and the tags of both hops are merged. A form page that owns a table (a participle with its declension) contributes its table rows the same way: lemma = the verb, code = row tags + the page's form-of tags. A page row is added only when the (key, lemma id) pair has no table row yet. Unresolved targets are counted and listed in INDEX.md (top 50).
6. **`yo`**: for every key with ё, `yo[yoFold(key)]` lists it.
7. **Shards**: prefixes of `ruShardLetters(key)` start at one letter and split to two and three while a shard's JSON exceeds `--limit` (default 1,500,000 bytes); `_` for a key with no Russian letter. Each shard is a complete `RussianFormIndex` of its keys (`id: 'kaikki-ru-tables'`, `shard`, its own `codes`, `lemmaIds`, the lemma rows its rows refer to, its `yo` entries), gzip-compressed (`<prefix>.json.gz`). `manifest.json`: `{ schema: 1, id, built, source, shards: { prefix: { file, bytes, keys } }, stats }` (`ShardManifest`).
8. **Core**: every lemma of a closed class (PRON, DET, ADP, CONJ, PART, NUM) with count ≥ 1, then open-class lemmas by descending count, each with all its forms, until the serialized index reaches `--core-budget` (default 450,000 bytes). Emitted like `src/adapters/hebrew/generated/biblical-core.ts`: a header comment with the figures and sources, `export const RU_CORE: RussianFormIndex = {…}` on one line. `stats.tokenCoverage` = the share of GSD train word tokens whose key the core holds.
9. **INDEX.md**: lemma entries by part of speech, keys, rows (table / page / two-hop), skipped kinds, pre-reform rows left out, ё keys, keys with more than one lemma, shard count and bytes (raw and gzip), core figures.

## Packages and file ownership

One writer per file. A package edits only its own files, tests only its own files (`npx vitest run <its files>`; never the whole suite while others work), never commits, never stashes, never switches branch, never touches anything under OneDrive. Type errors are checked by the coordinator's `npx tsc -b`; a package may check its own files with `npx tsc --noEmit --skipLibCheck -p tsconfig.app.json` only when told to. Anything another package provides is coded against this contract; mismatches are reported, not patched in someone else's file.

| Package | Owns | Delivers |
|---|---|---|
| **Lead** (coordinator) | `russian/{text,index-store,shards,version}.ts`, `src/adapters/ru.ts`, every shared file (core lists, packs, extension, GoReview, GoListen, tests that pin the language list), `public/dict/ru`, docs/russian/{AUDIT,PLAN}.md, package.json | contract, integration, dictionary build, release hand-over |
| **A Data** | `scripts/ru-build-index.mts`, `russian/generated/core.ts`, `public/lexicon/ru/**`, `docs/russian/INDEX.md`, `test/adapters/russian-index.test.ts` | the index build above |
| **B Morphology** | `russian/{tags,describe,analyze,closed,guess}.ts`, `test/adapters/russian-{tags,morph}.test.ts` | tag bundle → features; `featuresFromTableTags`, `morphFromTags`, `describeRuMorph`; `ruWordCandidates(token)` (context-free readings from the store, unions, hyphen parts, guesses); the closed-class gaps the index leaves |
| **C Context** | `russian/{sentence,government,constructions,aspect,motion,phrases,syntax}.ts`, `test/adapters/russian-{context,constructions,phrases}.test.ts` | `ruAnalyze(tokens)` (ordering by government, agreement, numerals), `detectRuPatterns`, `detectRuPhrases`, `ruSyntax`, the aspect and motion-verb tables |
| **D Sound & script** | `russian/{pronunciation,translit,numbers,speech,production,alphabet}.ts`, `packages/language-packs/src/tutorial/ru.ts`, `test/adapters/russian-{pronunciation,numbers,production}.test.ts` | pronunciation notes, number words, speech normalisation, production checks, the 33-letter data for the Alphabet deck and Sprint, the orientation tutorial |
| **F Quality** | `scripts/ru-eval-ud.mts`, `docs/russian/EVAL.md`, `test/fixtures/russian/**`, `test/adapters/russian-gold.test.ts` | measurement against UD GSD / Taiga / PUD gold; hand-checked regression fixtures by category; the miss lists that steer B and C |

Order: A, D and F start at once; B starts on `tags.ts` / `describe.ts` at once and on `analyze.ts` when A's core exists; C starts when B's `ruWordCandidates` exists; the lead integrates after the release manager's batch lands and the branch is rebased.

## Phases and gates (the brief's)

1. Foundation: registered, Cyrillic handled, a common word read on a real page through the real card.
2. Core morphology: representative sentences read correctly; independent validation.
3. Aspect, motion verbs, stress, phrases, context.
4. Learning integration: GoLearn Active, Repository ids, marks, sync, GoReview, Alphabet Sprint.
5. Performance and coverage: shard sizes, long pages, measured budgets.
6. Quality and release: full suite, extension build, real browser, licences, push, hand-over to the release manager.

# Albanian course — how it works (2026-10-01)

State of record: `docs/albanian/STATUS.md`. Plan the build followed: `docs/PLAN13.md`. Rights: `docs/albanian/RIGHTS.md`
and `docs/albanian/CANDIDATES.md`. Everything described here is machine-drafted and awaits a native reviewer.

## 1. What the course is

- **Target**: Standard Albanian (`sq`) is the one language the learner acquires. Gheg (`aln`, with `aln-XK`, `aln-AL`),
  the other dialect labels (`als`, `aae`, `aat`) and older spelling (`sq-hist`, `sq-pre1972`, `sq-pre1908`) are for
  recognition: a form is RELATED to its Standard equivalent and labelled, never counted as Standard and never rewritten.
  `sq-ascii` marks a word typed without ë / ç. Policy in code: `ALBANIAN_VARIETY_POLICY = { target: 'sq', within: [] }`.
- **Three surfaces**, as for every course: the reading corpus, Scripture with English rescue, and Testimony Writing.
  GoListen is not a dependency (deferred to V2 for every language).
- **Ladder**: Stage 0 (orthography and ultra-simple Albanian) to Stage 9 and an open stage. A stage describes how its own
  texts are written and carries a help profile; it locks nothing. The lemma and word counts in `ALBANIAN_CORPUS_TARGETS`
  are targets for the people who write the corpus, never gates for the learner.
- **Stage 0** teaches ë, ç and the nine digraphs (dh, gj, ll, nj, rr, sh, th, xh, zh — each one letter of the 36-letter
  alphabet, `SQ_LETTERS`) through whole words in tiny sentences, with real morphology from the first text and no
  romanization.

## 2. From a written word to a reading

`src/adapters/sq.ts` is the adapter; the layers are in `src/adapters/albanian/`.

1. **Closed classes and word list.** A noun is stated as lemma, gender, definite form and plural; a verb as first person
   singular present, aorist and participle; an adjective with or without its linking article. `morph-noun.ts`,
   `morph-adjective.ts`, `morph-verb.ts` generate the forms. Feature names: `types.ts`.
2. **Every reading, not one.** `analyzeSqForm` returns every context-free reading of a form. A form several word classes
   claim (do, pa, para, mirë) keeps all of them and none above 0.6.
3. **Fused short pronouns** (`clitics.ts`): ma, ta, ia, ua, t'i, t'ia, m'u, iu, s'jam … are one written token with `parts`
   (ma = më + e). Only pairs the lists state are taken apart; nothing is invented. The treebank comparison checks the
   decomposition against the treebanks' multiword tokens.
4. **Not Standard as written.** A word typed without ë / ç (`restoreDiacritics`), a Gheg form (`gheg.ts`) or an older
   spelling (`historical.ts`) is read through the Standard form it corresponds to; the reading says so
   (`orthography`, `varieties`) and is less certain. The text itself is never changed.
5. **Guesses.** A word outside the lists gets at most a reading inferred from its ending: `unconfirmed`, no gloss, 0.5
   at most.
6. **Agreement of sources** (`disputed.ts`, generated): a reading the sources do not agree on is capped (section 4).
7. **The sentence** (`sentence*.ts`) orders and narrows; it adds and removes nothing and raises no confidence:
   - the linking article and its adjective, ordinal or possessive are one unit ("e mirë" = *i mirë*): both pieces carry
     the unit's lemma, and the learner model credits one item;
   - the genitive article between two nouns; e / i / të / u / do / po / pa / më / ju by their neighbours;
   - the case a preposition governs; kam / jam + participle; mund / duhet + të; mood from particles; person from a
     subject pronoun.
   What the neighbours do not decide stays a union or a list of competing readings. There is no parser.
8. **Dictionary** (optional, `public/dict/sq`): the importer looks up words the adapter cannot read, checks guessed
   lemmas, and puts a dictionary reading beside the adapter's when it names another word. Such readings are labelled
   as the dictionary's.

Stored with each token (`TokenAnalysis`): the first reading, the alternatives, confidence, the method and source
(`origin`, `sourceId`, `analyzer` = `adapter-sq@5`), and any human correction, which supersedes the machine's.

## 3. Construction memory and writing checks

- `constructions.ts`: 31 patterns (definite ending, linking article, genitive article, clitic doubling, clusters,
  subjunctive, future, conditional, negation, progressive, perfect, non-active, admirative, optative, comparative,
  relative clause, prepositions' cases, modals …), each with the stage it is first taught. A pattern is never more
  certain than the readings it rests on, and 0.5 at most on a disputed or guessed reading.
- `phrases.ts`: 80 phrase rules (greetings, fixed units, verb + preposition frames).
- `production.ts`: ten kinds of check on the learner's own Albanian. Each fires only on its own unambiguous shape; an
  unknown word yields nothing. A Gheg form is called Gheg, not wrong. There are no idiomaticity checks: they need native
  data that does not exist. GoTell says on every suggestion that the checker's coverage is limited.

## 4. "All sources agree": the validation pipeline

Nothing in the word list is trusted because the drafter wrote it. Five sources are asked about every generated reading:

| Source | Says | Counts against a reading when |
| --- | --- | --- |
| UniParser analyzer (offline) | lemma and features of a form | it has the form under this lemma with other features, or only as another word |
| Wiktionary (kaikki extract) | head-line forms, inflection tables, "X of Y" entries | a table that agrees with its own head line has ANOTHER form in the reading's cell |
| UD_Albanian-TSA, -STAF (dev half) | attested token, lemma, features | never (a treebank cannot say a reading does not exist) |
| Corpus word list (31 M words) | how often a form occurs | the list's form hardly occurs and the table's form is in use, ten times as often |

Outcome per reading — `unanimous`, `majority`, `disputed`, `single-source`, `name-unlisted` — by the rule in
`src/bench/sq/agreement.ts`. Differences of naming that are not differences of analysis are listed in
`src/bench/sq/aliases.ts` and in the comparison module's header (non-active-only verbs, citation forms, short pronouns).

```
npm run sq:check-analyzer -- --split all --write   # asks the analyzer; writes data/review/sq/analyzer-check.json
npm run sq:agreement      -- --split all --write   # all sources; writes data/review/sq/source-agreement.json and disputed.ts
npm run sq:check-texts    -- --analyzer            # the course's own texts: every form known, sources agreeing
npm run sq:eval-ud -- --treebank data/research/ud/UD_Albanian-STAF --split dev [--dict public/dict]
```

**Held-out discipline.** Lemmas (and treebank sentences) are split in two by a hash. Rules and the word list are fixed
looking at the `dev` half only; `--show` is refused for `test`; the `--write` runs cover both halves mechanically.

**What a person may override.** `data/review/sq/accepted-differences.json` lets a named form through `sq:check-texts`
with what each source states; `overrides.ts` (empty) is where a reviewer's decision about a reading will live. No
third-party data is ever edited.

## 5. Dictionary

`npm run sq:dict-expand` writes, next to the extract, a file with every line of the extract unchanged plus one "X of Y"
line for each single-word cell of each inflection table that agrees with its own head line; `npm run dict:build -- --in
"data/research/kaikki/kaikki.org-dictionary-Albanian+tables.jsonl" --lang sq --last-modified 2026-09-28 --source-url
https://kaikki.org/dictionary/Albanian/kaikki.org-dictionary-Albanian.jsonl.gz --retrieved 2026-10-01` then builds
`public/dict/sq` (a build output; not committed). Nothing is corrected: a table's own mistake is carried over as the
source's statement. Licence CC BY-SA (Wiktionary contributors, via kaikki.org), named in the manifest and on the word card.

## 6. Corpus, rights and review

- **Rights are enforced by code** (`src/ingest/rights.ts`, `npm run rights:check`, the build): only `course-authored`,
  verified public domain, verified open licence or granted permission can be bundled; `rights-unverified` stays out;
  `research-only`, a learner's own copy and private writing can never be bundled; a document that calls itself
  course-written inside somebody else's work is refused.
- **A work's rights record** (`WorkRights`): country of origin, edition year, scan and transcription sources,
  modernization source, status by jurisdiction, commercial use. Life plus seventy years in Albania does not settle United
  States status; Wikisource is where a text is found, not a licence. Procedure: `docs/albanian/RIGHTS.md`.
- **Historical texts** keep their spelling; `Work.orthography` and `Work.modernization` say what the edition is. A
  modernised edition is a different layer with its own rights.
- **Scripture**: ALB is not bundled (provenance not established). Kristoforidhi's translations are listed as historical
  candidates in Gheg and Tosk, unverified. The learner can read Scripture from an own copy.
- **Review states** of a course text: DRAFT → AUTO_VALIDATED → NEEDS_NATIVE_REVIEW → NATIVE_REVIEWED → APPROVED /
  REJECTED (`src/authoring/states.ts`). The machine can propose AUTO_VALIDATED; only a person moves a text further, and
  only an APPROVED text leaves preview. A text about Christian belief also carries `needs-theological-review`.
- **Authoring**: `npm run authoring:report -- --lang sq` (recurrence, lemmas met once, clustering),
  `npm run authoring:check -- --lang sq` (states). Write, check forms (`sq:check-texts`), read the report, revise.
- **Gold set**: `npm run sq:gold` drafts items; a sentence counts only when a reviewer has accepted it
  (`data/benchmarks/sq/gold/SCHEMA.md`). 0 accepted so far; target 1,500 over 16 categories.

## 7. The learner's own book

"Your Books" imports a .txt or an unprotected .epub as a personal copy: on the device only, never bundled. It is read
with the same help; a word typed without ë / ç is related to the proper spelling; unknown words stay unknown or are
marked guesses; Gheg and older forms are labelled. A protected file is never opened.

## 8. Limits to keep in mind

- The word list is a seed (896 lexemes). On real prose one word in twelve (fiction) to one in eight (Wikipedia) has no
  reading even with the dictionary.
- Sentence rules are few and local. The weakest: `u` before an aorist of an ordinary verb (a "usual" choice only),
  `pa` as a verb, a noun followed by të.
- Gheg is related to Standard word by word through correspondences; it is not analysed as a language of its own.
- No performance work was needed: the engine is pure TypeScript with a 40,000-form cache; no Python runs in the app.
  The analyzer is an offline validation tool.

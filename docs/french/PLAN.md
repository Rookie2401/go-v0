# French pack (`fr`): build plan and contract

Branch `feat/french-pack`, worktree `C:\Users\CJWal\dev\go-v0-french` (never under OneDrive). The owner's brief: "Build and
Integrate the Complete French Language Pack for GoLearn" (2026-11-17). This file is the contract every package builds against.

## What French is in this codebase

One more language pack through the existing interfaces. No new application, database, scheduler, card or audio backend.

| layer | what French adds | model to copy |
|---|---|---|
| analyser | `src/adapters/fr.ts` + `src/adapters/french/**` (a `LanguageAdapter`, `src/core/adapters.ts`) | `src/adapters/es.ts` + `src/adapters/spanish/**` |
| dictionary | `public/dict/fr` built by `npm run dict:build`, `dict:build-forms`, `dict:build-full` from the kaikki.org French extract (Wiktionary, CC BY-SA 4.0) | `public/dict/es` |
| pack | `packages/language-packs/src/packs/fr.ts`, `tutorial/fr.ts`, catalogue and registry lines | `packs/es.ts`, `tutorial/es.ts` |
| extension | `packages/golearn-extension/src/analysers/fr.ts` (a lazy chunk) + one line in each language table | `analysers/es.ts` |
| GoReview, GoListen | one line in each language table; French letters and spelling patterns in the Alphabet deck | the Spanish lines |

Learner knowledge stays in the Repository; identities are the contract's `form:fr:<normalized>` and `lemma:fr:<lemma>:<pos>`
(`packages/repository-contract/src` `unitIds`). The adapter owns no learner state.

## Conventions (binding; also in `src/adapters/french/types.ts`)

**Honesty.** Everything hand-written here is machine-drafted and not checked by a native speaker; say so wherever the Spanish
files say so. A word or rule that is not certain is left out. Never a confident guess: a reading whose lemma the word list does
not hold is `unconfirmed`, confidence 0.6 at most, no gloss. Ambiguity is returned, not resolved by fiat.

**Features.** `VerbForm Fin|Inf|Part`, `Mood Ind|Sub|Cnd|Imp`, `Tense Pres|Imp|Past|Fut` (Imp = imparfait, Past = passé simple;
conditionnel = `Mood Cnd, Tense Pres`; participe passé = `VerbForm Part, Tense Past`; participe présent = `VerbForm Part, Tense Pres`),
`Person 1|2|3`, `Number Sing|Plur`, `Gender Masc|Fem`, `Definite Def|Ind`, `PronType Art|Prs|Dem|Rel|Int|Ind|Neg|Part`, `Poss Yes`,
`Reflex Yes`, `Polarity Neg`, `Case Nom|Acc|Dat` (clitics), `NumType Card|Ord`. Unions are comma lists in alphabetical order.

`Tense` is always read together with `VerbForm`: `Tense Past` is the passé simple on a finite verb and the past participle on `VerbForm Part`.

**Lemmas of the closed classes** follow the dictionary and ordinary grammar, not the UD treebank: je, tu, il, elle, on, nous, vous, ils, elles are
their own lemmas (UD GSD files il/elle/ils/elles under `lui` and je under `moi`); le/la/les/l' → `le` (article and clitic alike); un/une → `un`;
ce/cet/cette/ces → `ce` (the dictionary lists `cet` separately; the pack does not); mon/ma/mes → `mon`; possessive leur/leurs → `leur`.
The UD evaluation therefore reports lemma accuracy with and without pronouns.

**Identity.** `normalizeFr` (`french/orth.ts`): NFC, lower case, typographic apostrophes → `'`, typographic hyphens → `-`. Accents
and ligatures are kept.

**Tokens** (`french/tokenize.ts`):
- an elided word is its own token and keeps the apostrophe: `l'homme` → `l'` · `homme`; `qu'il` → `qu'` · `il`; `jusqu'à` → `jusqu'` · `à`;
  normalized always ends in the straight `'`;
- lexical words with an apostrophe stay whole (`aujourd'hui`, `quelqu'un`, `quelqu'une`, `presqu'île`, `prud'homme`, `d'accord` is NOT one: it is `d'` · `accord`, a phrase unit);
- a hyphenated compound is one token (`peut-être`, `c'est-à-dire`, `grand-mère`, `quatre-vingt-dix`, `celui-ci`, `là-bas`, `rendez-vous`);
- a clitic joined to a verb by a hyphen is its own token without the hyphen, the hyphen a non-word token: `donne-le-moi` →
  `donne` · `-` · `le` · `-` · `moi`; `a-t-il` → `a` · `-` · `t` · `-` · `il`; `est-ce` → `est` · `-` · `ce`; `cet homme-là` → `homme` · `-` · `là`;
- every token slices the input exactly.

**Closed-class forms in the word list** therefore include the elided spellings as forms of their lemma: `l'` (le, la), `d'` (de),
`j'` (je), `m'` `t'` `s'` (me, te, se), `n'` (ne), `c'` `ç'` (ce), `qu'` (que), `jusqu'`, `lorsqu'`, `puisqu'`, `quoiqu'`, and `s'` of `si` before il/ils.

## Files and owners

Each package writes ONLY its own files (Write/Edit tools only, never a shell redirect or sed for source; never git). The lead
(`fr.ts`, registration, dictionary, pack manifest, integration, verification) is the coordinating session.

### Lead
`src/adapters/fr.ts`, `src/adapters/french/types.ts`, `src/adapters/french/orth.ts` (normalize; ORTH may add exports), every
registration line outside `src/adapters/french`, `packages/language-packs/src/packs/fr.ts`, `public/dict/fr`, `docs/french/PLAN.md`.

### ORTH: tokens and sentences
- `french/tokenize.ts`: `export function tokenizeFrench(text: string): RawToken[]` and `export const FRENCH_WHOLE_APOSTROPHE: ReadonlySet<string>`,
  `export const ELIDED: ReadonlySet<string>` (the normalized elided tokens: `l'`, `d'` …), `export const HYPHEN_CLITICS: ReadonlySet<string>`.
- `french/sentences.ts`: `export function segmentFrenchSentences(text: string): Span[]`, `export const FRENCH_ABBREVIATIONS: readonly string[]`
  (M., Mme, Mlle, Dr, etc., p., cf., av. J.-C., n°; « » and dialogue dashes; French spacing before `; : ! ?` including U+00A0 and U+202F).
- `french/speech.ts`: `export function frenchSpeechNormalize(displayText: string, opts?: { isScripture?: boolean }): SpeechNormalizationResult` (over `speechNormalizeGeneric`).
- tests: `test/adapters/french-tokenize.test.ts`, `test/adapters/french-sentences.test.ts`.

### LEX: the word list
- `french/entries.ts`: the row format (copy of `spanish/entries.ts` with French tags): `parseRows`, `buildRows`, `mergeAnnotations`, returning
  `FrAnnotation` (types.ts). Row tags in brackets: variety codes, registers, `h-aspiré`, `être`, `être/avoir`, `pronominal`.
- `french/function-words.ts` → `FUNCTION_ROWS` (every closed-class word with EVERY form, elided forms included; contractions au, aux, du, des with `components`),
  `french/lexicon-verbs.ts` → `VERB_ROWS` (infinitives; auxiliary tag), `french/lexicon-nouns.ts` → `NOUN_ROWS` (gender; irregular plural listed after the bar),
  `french/lexicon-modifiers.ts` → `ADJECTIVE_ROWS` (irregular feminine/plural listed), `ADVERB_ROWS`, `PROPER_ROWS`, `french/varieties.ts` → `FR_VARIETIES`, `FR_LABEL_VARIETIES`, `FR_VARIETY_CODES`.
- target: the closed classes complete; about 600 verbs, 1,200 nouns, 600 adjectives and adverbs chosen by frequency in ordinary and literary prose.
- `scripts/fr-check-lexicon.mts`: every row's lemma, part of speech and gender compared with the kaikki extract (`data/dictionaries/kaikki.org-dictionary-French.jsonl`); prints disagreements; the lists must end with none unexplained.
- test: `test/adapters/french-lexicon.test.ts` (no parse problems, no duplicate, every gender present, the elided forms present).

### MORPH: the engine
- `french/verb-regular.ts`, `french/verb-irregular.ts`, `french/verbs.ts`: `export function conjugateFrench(lemma: string): FrConjugation | undefined`
  (all simple tenses: présent, imparfait, passé simple, futur, conditionnel, subjonctif présent and imparfait, impératif, infinitif, participe présent,
  participe passé in its four agreement forms). Spelling changes of the first group (manger → mangeons, placer → plaçons, appeler → appelle,
  acheter → achète, céder → cède, employer → emploie, payer → paie/paye, envoyer → enverrai), the second group, and the irregular verbs with their
  compounds (être, avoir, aller, faire, dire, pouvoir, vouloir, savoir, devoir, venir, tenir, prendre, mettre, voir, croire, recevoir, connaître,
  partir, sortir, dormir, ouvrir, courir, mourir, naître, vivre, suivre, écrire, lire, boire, plaire, craindre, peindre, joindre, conduire, rire,
  falloir, pleuvoir, valoir, asseoir, battre, vaincre, résoudre, coudre, moudre, conclure, fuir, haïr, acquérir, cueillir, bouillir, vêtir, s'en aller …).
- `french/morph-nominal.ts`: plural and feminine of nouns and adjectives by rule and by exception (cheval → chevaux, journal → journaux, travail → travaux, œil → yeux,
  bal → bals; beau/bel/belle/beaux, nouveau, vieux/vieil/vieille, heureux → heureuse, blanc → blanche, public → publique, long → longue, actif → active …):
  `nominalForms(lemma, pos, gender?)`, `analyzeNominal(form, known, genderOf?)`. A final -s, -x or -z is not assumed to be a plural.
- `french/morphology.ts`: `export function analyzeFrenchForm(form: string, opts?: FrAnalyzeOptions): FrenchAnalysis[]` (analysis by generation: propose lemmas,
  generate, keep the readings whose generated form is the written form; all competing readings returned), `export function describeFrenchMorph(morph, pos?): string`.
- `french/paradigm.ts`: `frenchParadigm(lemma, pos, ctx)`, `frenchCellFeatureSets(...)` (same shape as `spanish/paradigm.ts`).
- `french/table-tags.ts`: `frenchMorphFromTags(tags)`, `frenchFeaturesFromTableTags(tags, pos, form?)`, the used / ignored / rejected tag sets (as `spanish/table-tags.ts`),
  written against the labels the French extract really uses (count them first).
- `scripts/fr-eval-morph.mts`: the engine against the dictionary's own form-of statements, with the held-out discipline of `scripts/eval-es-morph.mts`.
- tests: `test/adapters/french-verbs.test.ts`, `french-nominal.test.ts`, `french-morphology.test.ts`.

### PRON: pronunciation, decoding, orientation
- `french/graphemes.ts`: the spelling patterns of a written word with their usual sounds and how certain each is (ou, oi, au/eau, ai/ei, eu/œu, an/en, on, in/ain/ein, un,
  gn, ch, qu, ç, final silent consonants, final -e, -ent of the third person plural): `export function frenchGraphemes(word: string): FrGrapheme[]`.
- `french/pronunciation.ts`: `export function frenchPronunciation(token: RawToken, analysis?: AnalyzedToken): PronunciationSupport` (notes only; the IPA comes from the
  dictionary, never guessed here), `export const H_ASPIRE: ReadonlySet<string>`, `export function liaison(prev, next): { kind: 'required' | 'optional' | 'forbidden' | 'none'; sound?: string; why: string }`.
- `packages/language-packs/src/tutorial/fr.ts`: `FR_TUTORIAL` (the orientation; its language steps are the optional French Decoding Sprint: six short stages).
- `docs/french/DECODING-SPRINT.md`, and the French rows for GoReview's Alphabet deck handed to the lead as a `LetterRow[]` literal in that document.
- tests: `test/adapters/french-pronunciation.test.ts`.

### QA: independent fixtures (does not read `src/adapters/french`)
- `data/benchmarks/fr/fixtures/*.json`: sentences with the expected lemma, part of speech and features of named words, written from French grammar and checked against
  the dictionary extract and the UD French GSD treebank (`data/research/ud/UD_French-GSD`, CC BY-SA 4.0, evaluation only, never shipped), by category: orthography,
  nominal, verbal, compound tenses and agreement, pronouns and clitics, negation, relatives, literary, ambiguity.
- `scripts/fr-eval-ud.mts`: adapter (and adapter + forms index) against UD GSD dev: lemma, part of speech, features, per category; `test` split reported as it comes.
- `test/adapters/french-fixtures.test.ts`: runs the fixtures; a known limit must fail exactly as recorded (`data/benchmarks/fr/known-limits.json`).

### CONTEXT (second wave, after the lead wires `fr.ts`)
- `french/disambiguate.ts` (`disambiguateFrench(i, tokens, base)`), `french/constructions.ts` (`FRENCH_CONSTRUCTIONS`, `detectFrenchConstructions`),
  `french/phrases.ts` (`PHRASE_UNITS`, `buildPhraseRules`), `french/syntax.ts` (`frenchSyntax`), `french/historical.ts`, `french/production.ts`.
- Construction ids: `passe-compose`, `plus-que-parfait`, `futur-anterieur`, `conditionnel-passe`, `subjonctif-passe`, `passe-anterieur`, `passe-simple`,
  `imparfait`, `futur-simple`, `futur-proche`, `passe-recent`, `etre-en-train-de`, `passive-voice`, `pronominal-verb`, `participle-agreement-etre`,
  `participle-agreement-preceding-object`, `participle-no-agreement`, `negation`, `negation-ne-que`, `negation-ne-dropped`, `object-pronouns`,
  `double-object-pronouns`, `pronoun-y`, `pronoun-en`, `imperative-pronouns`, `inversion-question`, `est-ce-que`, `relative-qui`, `relative-que`,
  `relative-dont`, `relative-ou`, `relative-lequel`, `partitive-article`, `contraction-article`, `elision`, `il-y-a`, `subjunctive-after-que`,
  `literary-subjunctive-imperfect`, `adjective-position`, `gerondif`, `comparative`, `superlative`, `c-est`.
  ONE explanation per id (never per-sentence text in `PatternCandidate.explanation`).

## Gate (lead)

`npx tsc -b`; `npx vitest run test/adapters/french* test/language-packs test/extension test/multilang test/reader-languages test/goreview-app test/golearn-app test/loading test/audit`;
`npm run dict:status`; `npm run ext:build` + the setup app + GoReview extension mode; the real extension in a browser on real French pages.
Rebuilds and deploys go to the release manager session as a REBUILD REQUEST; nothing is pushed to master, gh-pages or Render from here without the owner's yes.

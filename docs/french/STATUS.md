# French pack (`fr`): status of record

Branch `feat/french-pack` (worktree `C:\Users\CJWal\dev\go-v0-french`), from master 985c742b. Built 2026-11-17 from the owner's
brief "Build and Integrate the Complete French Language Pack for GoLearn". **Not merged, not deployed.** Experimental and
unreviewed: every word list, rule, explanation and test judgement in it is AI-drafted, and no native speaker has checked any of it.

Other documents: `PLAN.md` (the contract the packages were built against), `EVALUATION.md` and `EVALUATION.json` (what was
measured), `BROWSER-RUN.md` (the built extension in a real browser), `LEXICON.md` (the lemma list), `DECODING-SPRINT.md`.

## Architecture

French is one more language pack through the existing interfaces. No new application, database, scheduler, card or audio backend.

| piece | where | reuses |
|---|---|---|
| analyser | `src/adapters/fr.ts`, `src/adapters/french/**` | the `LanguageAdapter` contract (`src/core/adapters.ts`), the shared lexicon and phrase matcher |
| dictionary | `public/dict/fr` (shards, forms index, full records) | `npm run dict:build`, `dict:build-forms`, `dict:build-full`, unchanged |
| pack | `packages/language-packs/src/packs/fr.ts`, `tutorial/fr.ts` | `experimentalManifest`, the registry, the catalogue, `installPack` |
| extension | `packages/golearn-extension/src/analysers/fr.ts` + one line in each language table | the lazy analyser chunks, the parser, the card, GoLearn Active |
| GoListen | a French registry and device tags | the device and Azure providers |
| GoReview | the lazy adapter loader, the dictionary list, 69 Alphabet-deck cards | the deck, the scheduler and the screens, untouched |
| Repository | nothing | `form:fr:…` / `lemma:fr:…:POS` units through the existing contract; the service accepts any language id |

Two small generic changes outside French: the analyser loaders wait for a chunk's own `ready` promise when it exports one
(`urlLoader.ts`, `loaders.ts`), and `loadBuiltInAdapter('fr')` waits for the lemma list. French does not depend on Reading Analysis.

## Lexical data

| resource | use | licence |
|---|---|---|
| Wiktionary via kaikki.org, extract of 2026-10-30 (404,127 lines) | the dictionary: 401,953 entries, 300,120 of them inflected forms with their lemma and labels, 129,232 with IPA; forms index 441,895 forms → 104,040 lemmas; 116 MB on disk | CC BY-SA 4.0, attributed on every gloss and in `THIRD-PARTY-NOTICES.md` |
| the same extract | the lemma list inside the analyser: 78,650 lemmas with part of speech and noun gender, no meanings, 1 MB, loaded lazily | CC BY-SA 4.0, attributed in the file and the notices |
| hand word list | about 3,400 lemmas with glosses; the closed classes with every form | owner-authored, AI-drafted; each row checked against the extract for lemma, part of speech and gender (none unexplained) |
| Universal Dependencies French GSD | evaluation only; never shipped or committed | CC BY-SA 4.0 |

Looked at and not used: Lexique (CC BY-SA 4.0; would give a frequency list, which the French dictionary lacks), Lefff and
Morphalou (LGPL-LR; the extract's own form-of data made a second morphological lexicon unnecessary), UD French Sequoia (LGPL-LR).

## Linguistic capabilities, and how far each is validated

| capability | state | evidence |
|---|---|---|
| tokens: elision, both apostrophes, hyphen clitics, compounds, ligatures | done | 52 of 52 orthography cases; 97 % of token boundaries identical to the treebank's |
| verbs: every simple tense, the literary ones, the common irregulars and their compounds | done; about thirty rare or defective verbs not conjugated | 99.4 % of the dictionary's forms on the held-out third; 130 of 130 verb cases |
| nouns and adjectives: plural, feminine, irregulars | done | 98.7 % / 99.2 %; 62 of 62 |
| articles and contractions (au, du, des with their halves; partitive or contraction) | done where a neighbouring word decides | fixtures; contractions' first reading right for 91 % on the treebank |
| compound tenses, participle agreement (être; preceding object; none) | done as patterns over nearby words | 45 of 45; 25 of 25 held out |
| pronouns and clitics, y, en, negation, ne … que, relatives | done as patterns | 101 of 101 first set; 54 of 55 held out as frozen (55 after the auxquels fix) |
| literary French: passé simple, passé antérieur, imperfect subjunctive, literary negation, inversion | done; said to be the tense of written narrative, never "incorrect" | 61 of 62; 29 of 30 held out |
| phrase units (284), shallow syntax, older spelling, checks on learner writing | done, unit-tested; not measured on running text | their own tests |
| pronunciation | written notes on spelling, liaison (required / optional / forbidden), h aspiré; the dictionary's IPA passed through, never generated | unit tests; the shared card does not display notes or IPA yet |
| regional varieties | fr-FR, fr-CA, fr-BE, fr-CH as labels on words the dictionary labels; one learning identity | resolve tests |
| Decoding Sprint | optional, six stages in the orientation, 69 Alphabet-deck cards | structure tests; unreviewed |

## Contextual accuracy

Running text the builders had not looked at (UD French GSD test part, 8,018 words, run once): the first reading has the right lemma
for 92.3 % of words (95.0 % leaving out pronouns, which the treebank lemmatises differently) and the right part of speech for 90.4 %;
mood, tense, person, number and gender agree for 99 % where both state them. Held-out sentences written to test grammar: 213 of 220.

What stays ambiguous, and is said to be: forms that only the meaning of the sentence separates (les fils, je suis, vit, virent,
les vers). Every reading is offered; the commoner one leads.

## GoRepository

Nothing French in it. Marks made on a French card are stored as `ItemMarked` on `lemma:fr:maison:NOUN`; they survive a page reload, a
stopped worker and a browser restart, reach a test account, and come back in a fresh profile signed in to it (BROWSER-RUN steps 7 to 14).
All six states use the shared controls. Knowing a lemma does not credit its forms, and nothing French promotes anything.

## GoReview

French is offered, its dictionary is in the default list, the Alphabet deck has its cards, and the analyser loads on demand.
**Not verified end to end:** GoReview inside the extension builds no card for any language at present, because its candidates call
reaches the device Repository with a null cursor and is refused with 422 (`packages/repository-service/src/api.ts`: only `undefined`
and `''` are dropped from a query; extension messaging turns `undefined` into `null`). Albanian fails identically. Reported to the
release manager; not fixed here because it is shared code another session owns. Until it is fixed a French review has not been seen.
GoReview's home has no photograph for French (the owner has not chosen one); the home draws none.

## Performance

| | measured |
|---|---|
| first French lookup (analyser chunk + lemma list + card) | 175 ms (Spanish, same rig: 60 ms) |
| second lookup / after a stopped worker | 52 ms / 133 ms |
| Active's scan of a 224-word page | 83 ms; French Wikipedia "Paris", 2,580 words: 274 ms |
| analyser in Node | about 7,500 tokens in 10 ms warm; the lemma list parses in about 50 ms |
| `analysers/fr.js` / the lemma-list chunk | 337 KB / 917 KB, both lazy |
| content.js / background.js / app.js | +1.1 KB / +36.1 KB / +37.6 KB against master (manifest, 43 construction texts, orientation); ceilings raised with those figures |

## Testing

`npx tsc -b` clean. Whole suite: see the release section for the last run. French's own: 16 files under `test/adapters/french*`,
five under `test/language-packs/french*`, the fixtures (519 of 524; the five recorded in `known-limits.json`), the held-out fixtures,
the three evaluation scripts, and the browser rig. Every existing test that lists the languages knows `fr`.

Left failing and not French: `test/audit/a11y.css.test.ts` A-C04 (a sign-in style rule; fixed on the release manager's line).

## Release

Committed on `feat/french-pack`. Merging, publishing `public/dict/fr` to the hosted site and rebuilding the extension and GoReview
go through the release manager session, on the owner's word. Before that: rebase onto the new master (Reading Analysis, the Alphabet
Sprint and the Russian and Albanian-dialect branches touch the same language lists; French adds one line at the end of each).

## Limitations

Missing: a frequency list for the French dictionary; a native speaker's review of anything; a photograph for GoReview's home;
display of IPA and pronunciation notes on the card (shared); the Decoding Sprint inside the Alphabet Sprint mechanism (that work is
not on master yet); recordings.

Unverified: a French card reviewed in GoReview (blocked by the shared bug above); real device voices (the rig's browser has none);
French on a phone.

Known weak spots: an adjective read by rule alone when its lemma is in no list (88 %); homographs that need meaning; Spanish text on
a page that declares no language (the shared function words let 2 of 85 Spanish paragraphs reach the 45 % line when no Spanish pack
is installed); a word of another language selected on such a page gets a French card marked as a guess (the shared fallback).

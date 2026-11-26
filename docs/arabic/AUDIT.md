# Arabic pack: what the system already had, and what Arabic had to fit (audit of master a822b1ab, 2026-11-25)

**When this was written, and what it rests on.** A read-only audit of master ran at the start of the work, on 2026-11-25, while the
first Arabic file (the text views) was being drafted and before the index, the analyser or any registration existed. It read how the
Russian (`ba606b70`) and French (`b087f000`) packs were registered and how Hebrew and Greek handle what Arabic shares with them; its
findings decided the design in [PLAN.md](PLAN.md). THIS DOCUMENT was written afterwards, the same evening, from that audit's report
and from what the build then showed. So:

- found by the audit before the code: the table "What was reused as it stood"; the registration checklist; the constraints; and, in
  the list of gaps, the PROBLEM in items 1, 3, 4, 5, 6, 8 and 9 (a key without vowels, cuts with no source boundaries, no root field,
  merged homographs under one dictionary key, the one-pack-per-script rule, the marks `lexicalFamilyKey` strips, the unused
  `display.fontFamily`);
- learned during the build, and written here after the fact: the SCALE of item 2 (the independent auditor measured it on the first
  plan and it changed the design), item 7 (seen when the analyser first produced a union), and the SOLUTION named in every item
  (`headMatches`, the reviewed list and preferences, the page-language rule, the word-analysis cells), each of which was designed
  and built after the audit, not specified by it.

Nothing here is Arabic-specific invention: each point names the existing mechanism Arabic reuses or the one hook it adds.

## What was reused as it stood

| Need | Existing mechanism | Where |
|---|---|---|
| A language as a pack | `LanguagePackManifest`, the pack registry, catalogue, tutorial orientation | `packages/language-packs/src` |
| Analysis of a word | `LanguageAdapter` (tokens, `analyze`, `refine`, patterns, phrases, syntax, pronunciation) and `AnalysisCandidate` with `parts`, `notes`, `confidence`, `unconfirmed` | `src/core/adapters.ts`, `src/core/model.ts` |
| A large form index loaded on demand | the shared shard loader (prefix-named shards, gzip, a bounded number in memory) | `src/adapters/shared/shards.ts` |
| A dictionary | the kaikki pipeline: sense shards, full records, forms index, reverse gloss | `src/dict`, `scripts/dict-*.mts` |
| Vocabulary identity | unit ids `lemma:<lang>:<lemma>:<POS>` (credited at confidence ≥ 0.5) and `form:<lang>:<key>` (below it) | `packages/repository-contract`, `packages/golearn-extension/src/parser` |
| The six knowledge levels, FSRS review | unchanged; an Arabic unit is an ordinary unit | GoRepository, GoReview |
| Varieties of one language | `defineLanguageVarieties` (default, selectable, heritage), the review scope by variety | `packages/repository-contract/src/varieties.ts`, `packages/goreview/src/scheduler/scope.ts` |
| A script course | the Alphabet Sprint engine and its `ScriptProfile` contract | `packages/language-packs/src/alphabet-sprint` |
| Right-to-left text | `directionOf` already listed `ar`; the card isolates every `[lang]` run | `packages/goreview/app/dom.ts`, `packages/golearn-extension/src/popup/card.ts` |
| The English of a verb form | `candidateWordAnalysis` and the English verb realizer | `src/core/word-analysis.ts`, `src/core/english-verb.ts` |

No separate Arabic reader, vocabulary store, review scheduler or page analyser was written, and Reading Analysis is not required
by anything in the pack.

## What the system did not have, and how each gap was closed

1. **A key without vowels and an identity with them.** Hebrew looks a pointed form up and falls back to its consonants. Arabic print
   is unvocalized by default, so the key is the unvocalized form and every reading stores its vowels beside it (`text.ts`,
   `index-store.ts`); the identity is the vocalized headword in one spelling convention (`arHeadForm`).
2. **Half of all running words are spelled like another word.** No other pack meets this at that scale (Korean meets a milder form
   and answers it with reviewed sets). Arabic adds a reviewed list (`identities.json`), the lexeme preferences it implies
   (`generated/preferences.ts`), structural rules and sentence rules; an undecided word is a form unit and credits no lexeme.
3. **Several words inside one written word.** Hebrew's analyser cuts prefixes from source morpheme boundaries; Arabic has no such
   source, so cuts are enumerated by rule (`clitics.ts`) and each is checked against what the attached word allows.
4. **A root.** The candidate has no root field and Hebrew derives one from the lemma's consonants. Arabic takes the root from the
   source entry (its root template or root category) and shows it through the form analysis; nothing is derived from letters.
5. **Dictionary homographs under one key.** `gloss` and `entry` merged every entry under a key, and `pickRecord` took the first of a
   part of speech. One optional adapter hook (`headMatches`) lets Arabic choose the record whose vocalized head is the lemma; no
   other language's lookup changes.
6. **A script that several languages share.** The page rule "a word in a script only one pack reads belongs to that pack" would have
   claimed Persian, Urdu, Pashto, Kurdish and Uyghur pages. Arabic follows the Cyrillic model instead: a declared language first,
   then letters Arabic does not use (tested on the printed text, before any folding), then a function-word share.
7. **One written verb form that is two persons.** The shared projection splits `Person` unions but not `Gender`, which would pair
   the wrong gender. Arabic's word analysis names the real cells and keeps them as one reading.
8. **`lexicalFamilyKey` stripped Latin and Hebrew marks only.** Arabic marks were added without changing another language's key.
9. **Fonts.** `display.fontFamily` of an adapter is read by nothing; the card and GoReview have their own stacks. Arabic gets a
   naskh stack and a larger line height for its runs there, on GoLearn's own surfaces only.

## Where a registration is required

The full checklist (about a hundred files: core lists, every `Record<LanguageCode, …>`, the packs, the extension's analyser chunk
and page-language rules, GoListen, GoReview, and the tests that pin the language list or a bundle size) is the one the Russian audit
wrote ([docs/russian/AUDIT.md](../russian/AUDIT.md)); the Arabic registration followed it and the French commit. It is carried on
the integration branch and joins this branch only after the Korean pack is on master, so that `ar` is added after `ko` in every
ordered list.

## Constraints found

- The dictionary must fit the publishing budget (about 80 MB for `dict/ar`, full records counted at a quarter).
- A value import from the core barrel inside an adapter file drags a retired module in and fails an audit test.
- The bundle ceilings are tests: a pack that grows `content.js` or `background.js` must raise them from a measured build.
- Master itself has failing tests (a Greek manifest, a GoReview account page, an Albanian end-to-end test and others): a pack is
  judged by the failures it adds, compared on the same tree.

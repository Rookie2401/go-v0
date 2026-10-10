# Implementation and release status (Linguistic Engine V2, 2026-10-10)

| stage | content | status | commit(s) |
|---|---|---|---|
| 1 | coverage audit, measured baseline, dictionary delivery repair, card asks the dictionary for every word | done | d1bd3588 |
| 2 | full lexical records (schema `full-1`) for sq es de hi th; `entry()`; form-of following | done; hosting of de/es shards undecided | ed7153c1 |
| 3 | paradigm generation + Wiktionary cross-check for sq es de hi nb nn (th: constructions + segmentation); All forms table with the selected cell | done | ed7153c1 |
| 4 | syntax contract and card section; rules for sq es de hi th nb nn | done | 56d7ed6a, bbedccf3, + es commit |
| 5 | word structure, etymology chain with language names and cognates | done | f07d0045 |
| 6 | progressive card: All forms / Meanings / Origin / Word structure / Sound / Syntax, field states, honest empty states | done | ed7153c1, 56d7ed6a, f07d0045 |
| 7 | Repository field-level states (six states, nine fields, contract revision 3.1), GoReview eligibility | done (queue not rendered; resolver does not call syntax/paradigm itself yet) | f07d0045 |
| 8 | gold sets (dev / hard / unseen per language, syntax gold), scorer, floors as measured | done; all labels AI-judged, unreviewed | f07d0045, bbedccf3 |
| docs | the §XXII list (see below) | done | b851c3d7 and later |

## Documentation index (§XXII of the brief)

| # | item | file |
|---|---|---|
| 1 | linguistic coverage audit | COVERAGE-AUDIT.md, baseline-2026-10-10.json, after-2026-10-10.json |
| 2 | source inventory and licensing | SOURCE-INVENTORY.md |
| 3 | lexical schema | LEXICAL-SCHEMA.md |
| 4 | morphological analyser/generator design | MORPHOLOGY.md, PARADIGMS-{sq,es,de,hi,nb-nn,th}.md |
| 5 | language-specific feature matrices | FEATURE-MATRIX.md |
| 6 | contextual syntax design | SYNTAX.md, SYNTAX-{sq,es,de,hi,th,nb-nn}.md |
| 7 | roots and etymology model | ETYMOLOGY.md |
| 8 | evidence and validation policy | REPOSITORY-STATES.md (§2–4), ENRICHMENT.md (field states on the card) |
| 9 | progressive enrichment architecture | ENRICHMENT.md |
| 10 | GoListen integration | GOLISTEN.md |
| 11 | Go Repository integration | REPOSITORY-STATES.md, packages/repository-linguistics/README.md |
| 12 | GoReview eligibility rules | REPOSITORY-STATES.md (§GoReview), packages/goreview/README.md |
| 13 | gold-standard test methodology | GOLD-SETS.md |
| 14 | before-and-after coverage measurements | V2-REPORT-2026-10-10.md (§ before/after), COVERAGE-AUDIT.md |
| 15 | browser-level verification | BROWSER-VERIFICATION.md |
| 16 | known linguistic limitations | LIMITATIONS.md |
| 17 | implementation and release status | this file |

## Release notes

- Nothing is pushed: the remote carries only `gh-pages`; the owner deploys.
- The extension (`npm run ext:build`) carries the new card and the Albanian rules; other analysers load on demand as before;
  the worker bundle ceiling was raised from 520 to 560 KiB for the Albanian generation modules.
- The dictionary's `full/` shards must be present where the dictionary is served (configured service, the extension's own
  `app/dict` copy, or the hosted fallback) for the deeper sections; without them the card says so.
- Analysis output and adapter versions are unchanged in every language: the gold floors measure today's engine, and the
  bugs the cross-checks found are listed, not fixed.

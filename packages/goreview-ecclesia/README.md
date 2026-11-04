# @go/goreview-ecclesia

GoReview specialised for the **Ecclesia theological library**: Biblical Hebrew (`he`), Biblical Aramaic (`arc`), Koine Greek (`grc`) and Latin (`la`), read in a Scripture reader. **Headless**: this package is contracts and pure functions over the shared engine; Ecclesia designs the interface.

| Module | What it is |
| --- | --- |
| `contract.ts` | The public types Ecclesia codes against (languages, tokens, passages, reading encounters, cards, standings, familiarity, frequency, lexicon, sessions). |
| `languages.ts` | The four profiles: Repository filing (`he`/`he-bib`, `arc`/`arc-bib`, `el`/`el-koi`, `la`), edition ids, sources and licences, per-language defaults. |
| `identity.ts` | Stable unit ids (`lemma:el:λόγος:NOUN`, `form:el:λόγος`, `morph:el:NOUN:Case=Nom|…`), card ids, passage keys and typed Scripture references. |
| `encounters.ts` | Reading encounters → Repository events, idempotent by `encounterId`; text never travels. |
| `cards.ts` | Contextual cards: deterministic card identity plus the Scripture place the word was met. |
| `facts.ts` | `UnitFacts` for GoReview's exercise builders from the reader's own lexicon. |
| `profile.ts` | The six knowledge levels (Repository projection) and the FSRS card schedules (deck fold), side by side. |
| `frequency.ts` | Corpus-frequency contract and constructors; no data shipped. |
| `familiarity.ts` | Next Best Passage: a **provisional** token-share heuristic with the 80–90 % band. |
| `session.ts` | Reading candidates → GoReview intake → planner → session runner; reading-context preference without trapping. |

Nothing of FSRS, the deck fold, intake, the planner, the exercise builders, grading or evidence is re-implemented: it is all imported from `packages/goreview/src`.

Docs: `docs/ecosystem/GOREVIEW-ECCLESIA-ARCHITECTURE.md`, `docs/ecosystem/GOREVIEW-ECCLESIA-INTEGRATION.md`, `docs/ecosystem/GOREVIEW-ECCLESIA-REPORT.md`. Tests: `test/goreview-ecclesia/**` (`npx vitest run test/goreview-ecclesia`).

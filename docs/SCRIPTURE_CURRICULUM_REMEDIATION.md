# Scripture curriculum remediation — 2026-10-04

## Fresh findings

The full installed German, Spanish, Hindi, and Thai libraries each contain all 66 books and 1,189 chapters. Their verse totals are respectively 31,102; 31,084; 31,104; and 31,087. Differences in verse totals belong to the protected translation sources; this change imposes no common verse count.

The resident `data/corpus/{de,es,hi}/bible-1john-1.json` documents are supplemental excerpts: 1 John 1:8–9 plus John 3:16. Their first-reference metadata identifies 1 John 1, but the document is not a complete chapter. The active Scripture tree previously treated these as chapter entries. The prior sentence-length fix prevented the three-sentence passage from hiding a longer complete chapter, but still accepted missing edition metadata as a wildcard and inferred content equivalence from title/place/length. A longer mixed passage or a different text of the same length could still suppress a complete chapter.

## Changes

`src/course/scriptureIntegrity.ts` provides shared explicit canonical addressing, edition-qualified keys, strict same-text identity, verse-reference validation, cross-chapter passage classification, and chapter-order diagnostics. Invalid explicit references cannot silently fall back to a running chapter number in another book.

The active Scripture tree now suppresses only the same text id in the same language. Every distinct id stays reachable, even if title, edition, and sentence count match. Live verse references place mixed-book/chapter excerpts under Other passages, separate from canonical chapter entries. Their text, reader routes, stored progress, source edition, verification, and rights are preserved. The legacy Library surface also uses the shared canonical address resolver.

The build's canon verifier now uses the shared plain-JavaScript canon table and validates source and installed document order, edition identity, duplicate canonical chapter addresses, verse order/duplicates, missing verse addresses, cross-book/chapter contamination, catalog/document chapter consistency, and exact installed wording against the source at every verse address. These checks remain part of the existing build command.

## Verification

- `node scripts/verify-scripture-canon.mjs`: passes all four complete libraries, including exact source/installed wording comparison.
- `npx tsc -b`: initial run passes; a later run reported three errors in concurrently added curriculum scripts, with no Scripture errors. Root integration must rerun the complete typecheck.
- Focused UI, identity, integrity, canon, and verified-Scripture tests: 28 distinct tests pass across six files. The three-language UI regression proves each complete 1 John chapter remains accessible and its mixed-book seed remains accessible under Other passages.

## Limits

This is structural protection and source equality, not new translation or copyright verification. No Scripture wording, translation selection, or rights metadata changed. Catalog rows do not carry verse-level content, so different ids are intentionally retained rather than guessed equivalent; duplicate-looking rows are possible. Single-chapter partial passages may still be shown beside their complete chapter and cannot replace it. Supplemental classification waits for resident verse references; if those cannot be read, the passage stays accessible with its declared chapter position. Albanian's existing legacy Scripture presentation is retained; no full Albanian canon was invented.

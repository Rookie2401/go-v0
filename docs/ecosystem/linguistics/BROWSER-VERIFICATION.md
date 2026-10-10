# Browser-level verification (Linguistic Engine V2)

What was looked at in a browser, how to repeat it, and what it proves. "Verified in the pane" below means the Claude desktop
app's built-in browser pane, driven by the session that built the feature, on 2026-10-10. No native speaker looked at any of it.

## The harness page

`packages/golearn-extension/harness/active.html` is a static page of Albanian course sentences with a stand-in for the
background worker: it answers the content script's messages (`golearn:status`, `golearn:active-profile`, `golearn:gloss`,
`golearn:entry`, `golearn:explain`, …) from the page, so the real content script (`dist/content.harness.js`, built with
`npm run ext:build:harness`) runs exactly as in the extension. The `golearn:entry` answer is the dictionary's real record of
`libër` as the built `full-1` shard holds it (copied from `public/dict/sq/full`), so the deeper sections can be seen without
an installed dictionary.

```bash
npm run ext:build && npm run ext:build:harness
node scripts/local/static-server.cjs packages\golearn-extension 5197
```

Then open `http://localhost:5197/harness/active.html`, keep "GoLearn Active" ticked, and click a word.

## What was verified on 2026-10-10

| step | what was seen | proves |
|---|---|---|
| page load | status line `on · sq · 230 words · met 16, assisted 3, known 4, produced 8 · scan 0.6 ms` and the underlines by knowledge level | GoLearn Active scans the page and the learner model answers from the device |
| click `librin` | card: lemma `libër (NOUN)`, meaning `book`, grammar (clitic doubling), form "definite masculine accusative singular", confidence 0.85 · rule | Level 1 and the gloss (Level 1b) |
| All forms | "16 forms · masculine, definite in -i / -u: 16 both the rules and the dictionary", two tables (singular / plural; indefinite / definite × nominative / accusative / genitive-dative / ablative), `librin` bold and underlined as the selected cell, every cell ✓, the legend, the notes, the sources line | the generated paradigm merged with the dictionary table (`alignTable`, `cellsFor`), the layout and the selection mark |
| Origin | "Borrowed through Late Vulgar Latin (or Old Italian) from Latin liber." with the three template steps and the source line | the etymology comes from the dictionary and is never generated |
| Sound | IPA `/ˈlibəɾ/`, `[ˈlibəɹ]` | the dictionary's IPA reaches the card |
| Meanings / rating row / New to me … | present (verified in the earlier GoLearn Active round) | unchanged |

The same record is exercised end to end through the real worker and the real shards on disk by
`test/extension/entry.integration.test.ts` (`npx vitest run test/extension/entry.integration.test.ts`), which skips honestly
when `public/dict/sq/full` has not been built.

## Not verified in a browser

- The deeper sections for Spanish, German, Hindi, Thai and Norwegian were verified by tests (`test/adapters/*-paradigm*.test.ts`,
  `test/extension/*.test.ts`), not by clicking in a page; the harness page is Albanian.
- The Syntax section with real adapter rules (Stage 4) was verified with a fake adapter in `test/extension/syntax.card.test.ts`;
  the per-language rules land in their own lanes and need a browser pass once the content bundle carries them.
- The real extension in Brave with an installed dictionary was last verified in the GoLearn Active round (meanings, underlines,
  rating). The Level 2 fetch of a `full/` shard from the hosted dictionary location needs the `full/` shards to be published
  under `https://rookie2401.github.io/go-v0/dict/<lang>/full/`, which is the owner's deploy (see SOURCE-INVENTORY.md for the
  size question).

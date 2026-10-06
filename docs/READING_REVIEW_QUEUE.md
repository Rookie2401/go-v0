# Human reading review queue

The current queue contains 126 generated, unreviewed, non-Scripture texts and 15,050 measured target-language words. It is generated from [review-queue.json](../data/benchmarks/reading-ladders/review-queue.json).

| Language | Draft texts | Measured words |
|---|---:|---:|
| de | 34 | 4,540 |
| es | 28 | 3,768 |
| hi | 28 | 4,530 |
| sq | 22 | 960 |
| th | 14 | 1,252 |

Thai uses the adapter’s ICU/compound word tokenization; other language counts use a Unicode-letter approximation. Canonical content signatures identify exact wording and do not approve a draft or certify its level.

Allocate approximately 60–70% of human review to A0–B1 reading, and 20–30% to Albanian/Hindi language quality. Check every target sentence for spelling, grammar, naturalness, intended variety and narrative coherence, then check its English rescue line for faithfulness.

Record an actual native speaker’s review only after that person reads the text:

```text
npm run corpus:review -- data/corpus/th/bridge-thai-bridge-01.json --by "Reviewer Name" --status reviewed --level native --date YYYY-MM-DD --notes "Actual review findings"
```

Use `--level linguistic-check` for a non-native or tool check; it does not publish a generated lesson. Keep generated and machine-drafted provenance. Any wording edits need a new review signature. Appearing in this queue never makes a text reviewed or published.

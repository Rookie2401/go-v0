# The service's memory through GoReview's recovery scan, part by part (2026-11-13)

`NODE_OPTIONS=--expose-gc npx vite-node scripts/loadcheck/service/profile-memory.ts 20000 3500 phases`

One learner, 3,494 words, 20,000 events, a real SQLite file, the service in process. Each part is collected before it runs and sampled after
every request; the figures are what the part ADDS at its peak. Two rounds gave the same numbers, except candidates, whose ranking is kept for 20 s.
The process runs under vite-node here, so only the differences mean anything, not the totals.

| Part of the scan | Heap | Outside the heap | Resident | Answer |
|---|---|---|---|---|
| The vocabulary walk as it was: 35 full unsorted pages | +85 MB | +21 MB | +39 to +44 MB | 8,474 KB of JSON |
| The vocabulary walk now: `detail=light&catalogued=false` | +20 MB | +0 MB | +1 MB | one response |
| `GET /knowledge`, all of it | +27 MB | +53 MB | +60 MB | 6,813 KB of JSON (about 2 KB a row) |
| `GET /candidates`, first page of 200 (ranks the whole list) | +67 MB, then +1 MB while kept | +1 MB | +6 MB | 182 KB of JSON |

What this says:

- The light listing removes the walk's cost almost entirely. Before it, the walk was the largest part of the heap growth.
- What is left is the whole-knowledge read (the largest resident growth: its answer is copied several times on the way out) and the candidate ranking.
  Neither is changed here. The scan runs at most once in ten minutes per learner and language since 5ecd6199, and the compiled service rests at about
  125 MB since 6e04b771, so both fit a 512 MB instance with room. If they ever need to shrink: a language filter and a narrower row for the scan's
  knowledge read, and a ranking that keeps scores instead of whole candidates.

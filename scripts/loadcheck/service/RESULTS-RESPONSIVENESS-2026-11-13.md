# GoLearn's responsiveness while a GoReview home is open (2026-11-13)

`NODE_OPTIONS=--expose-gc npx vite-node scripts/loadcheck/service/responsiveness.ts 20000 3500 30`

The owner asked whether slowing GoReview's recovery scan would hinder GoLearn when it is loaded up. One learner, 3,500 words, 20,000 events,
a real SQLite file, the service in process through its real HTTP handler, on the development PC (Render's 0.5 CPU will be slower in absolute
terms; the comparison is what counts). GoLearn means to send one lookup every 100 ms, and each is timed from the instant it was meant to go, so
time spent queued behind a busy service is counted. Each run lasts 30 s.

- **alone:** no GoReview open.
- **before:** an open home that rebuilds after every live update, as before 5ecd6199. Each rebuild walks every vocabulary page in full, reads the whole knowledge, ranks the candidates, and walks every page again sorted for the word count.
- **after:** this branch. Inside ten minutes of a walk a rebuild asks only for the candidates, and the count comes from the list saved on the device. One "New deck" press half-way through walks afresh.

## On master 1acd500d (the light listing, 8966783c)

| Run | Word card (built on the device) | Lookups recorded: p50 / p95 / max | Home rebuild |
|---|---|---|---|
| alone | 0.74 ms | 12 ms / 20 ms / 62 ms | (none) |
| before | 0.50 ms | 3,559 ms / 6,388 ms / 6,722 ms | 6,691 ms each (5 in 30 s) |
| after | 0.45 ms | 374 ms / 762 ms / 844 ms | 792 ms each (candidates only) |
| after, lookups meant during the New deck walk | | 623 ms / 1,110 ms / 1,110 ms (12 lookups) | the walk took 1,139 ms |

## The same run before the light listing (6e04b771 plus this branch)

| Run | Lookups recorded: p50 / p95 / max | New deck walk |
|---|---|---|
| before | 3,598 ms / 6,571 ms / 7,564 ms | |
| after, outside the walk | 407 ms / 858 ms / 1,080 ms | |
| after, during the walk | 3,552 ms / 6,435 ms / 6,723 ms (68 lookups) | 6,792 ms |

## What this says

- GoLearn's word card is built on the device and never waits for the service in any run: well under a millisecond typically, at most 24 ms.
- The service is single-threaded. While the old home walked the vocabulary, every GoLearn lookup queued behind the walk: half of them waited more than 3.5 s to be recorded. With the throttles the median wait is 0.37 s, about ten times better. The send happens in the background and the reader never waits on it, but it is how long the service takes to answer anyone.
- "New deck" now costs the service about 1.1 s with the light listing. That fits inside the 1.5 s a press waits, so the words just met are normally in the very deck it starts. Without the light listing the walk took 6.8 s and blocked every other request that long, which is why the press is limited to one fresh walk a minute.
- What is left is the candidate ranking, about 0.8 s per home rebuild at this size. In this check the home rebuilds as often as it can (32 times in 30 s), a worst case. If the ranking ever needs to be cheaper: keep the scores rather than whole candidates (RESULTS-MEMORY-2026-11-13.md), or skip a rebuild whose events did not change the candidates.

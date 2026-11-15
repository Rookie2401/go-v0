# Projection engine: `candidates` and `preferences` (2026-11-11)

One learner, 749 words, SQLite file, in process (`scripts/loadcheck/service/profile-engine.ts <events>`; same seeding as bench-service.ts: lookups, then 200 cards with 4 reviews each).
`candidates` is measured after one appended event (so it includes the incremental fold), `preferences` for `sq`. Median of 5 runs; the table below each heading is the last run.
The machine was shared with other sessions, so compare the structure (calls, rows, statements) before the milliseconds.

## Before and after

| | events | wall ms (median of 5) | SQL statements | store calls | event rows read |
|---|---|---|---|---|---|
| candidates, before | 3,000 | 120.8 | 785 | 782 | 4,007 |
| candidates, after  | 3,000 | 20.1 | 46 | 43 | 200 |
| candidates, before | 12,000 | 118.7 | 803 | 800 | 13,007 |
| candidates, after  | 12,000 | 21.2 | 46 | 43 | 200 |
| preferences, before | 3,000 | 41.8 | 11 | 11 | 4,007 |
| preferences, after  | 3,000 | 0.2 | 6 | 6 | 20 |
| preferences, before | 12,000 | 57.8 | 29 | 29 | 13,007 |
| preferences, after  | 12,000 | 0.2 | 6 | 6 | 20 |

(The 200 rows `candidates` still reads are the 200 CardAdded events; 20 rows of `preferences` are the lookups of the newest hour.)

## What each function reads now

- `preferences`: PreferenceChanged, AssistanceRequested, PronunciationPlayed whole (the learner's own settings and requests); SelectionLookedUp and AnalysisShown only in growing windows ending now (1 h, 8 h, 64 h, 512 h, 4,096 h, then all) until one holds a live event: that is the newest `at`, which is all they feed (`updatedAt`). If the learner has any live PronunciationPlayed, those two kinds are read whole, because the audio-first rule needs the FIRST help event of each sentence and the port cannot filter by sentence.
- `candidates`: CardAdded, CardRemoved, ReviewItemInvalidated whole; CardReviewed only from `now - 2 days` (priorReview, the only use of a review's date there). The units of the rows in one `getUnits`. `relationsOf` only for rows with a negative count whose unit is a form (or not in the store). Struggles are read ONLY when some construction has at least `minFailedForms` (3) distinct candidate forms (otherwise the grammaticalLeverage rule cannot fire); then the review kinds whole (a review's validity depends on its card's chain, corrections and retractions) and the non-review struggle kinds from `now - 30 days`. `analysesOfForm` only for the form units `rankCandidates` actually asks for (it is re-run until it asks for nothing new).
- Read strategy (measured with EXPLAIN QUERY PLAN): the language is never sent to the store (it is filtered in the engine) and several kinds with no time bound are read one kind at a time; with a `language_id` term or `kind IN (a, b, c)` SQLite walks the learner's whole log (50 ms for 20 matching rows among 12,000).

## Profile before (3,000 events)

```

candidates after one appended event  (events=3000; median wall 120.8 ms over 5; last run: 115.4 ms, 785 SQL statements, 782 store calls, 4007 event rows read)
  method                    calls     rows       ms
  list                          9     4007     31.2
  getKnowledge                  2     1498     24.5
  relationsOf                 749       22     12.5
  getUnits                      1      750      6.9
  aliasesFor                    2        0        2
  analysesOfForm               14       14      0.6
  listEnrolments                1        1      0.1
  listTombstones                1        0      0.1
  getPack                       1        0        0
  getProjectionCursor           1        1        0
  head                          1        1        0
  store 77.9 ms, engine outside the store 37.5 ms

preferences  (events=3000; median wall 41.8 ms over 5; last run: 40.3 ms, 11 SQL statements, 11 store calls, 4007 event rows read)
  method                    calls     rows       ms
  list                          9     4007     30.5
  getPreferences                1        1      0.1
  listTombstones                1        0        0
  store 30.7 ms, engine outside the store 9.6 ms

```

## Profile before (12,000 events)

```

candidates after one appended event  (events=12000; median wall 118.7 ms over 5; last run: 126.1 ms, 803 SQL statements, 800 store calls, 13007 event rows read)
  method                    calls     rows       ms
  list                         27    13007     44.7
  getKnowledge                  2     1498      9.3
  relationsOf                 749       22      5.7
  getUnits                      1      750      3.5
  aliasesFor                    2        0        1
  analysesOfForm               14       14      0.3
  listTombstones                1        0      0.1
  listEnrolments                1        1        0
  getPack                       1        0        0
  getProjectionCursor           1        1        0
  head                          1        1        0
  store 64.6 ms, engine outside the store 61.6 ms

preferences  (events=12000; median wall 57.8 ms over 5; last run: 56.6 ms, 29 SQL statements, 29 store calls, 13007 event rows read)
  method                    calls     rows       ms
  list                         27    13007     44.8
  getPreferences                1        1      0.1
  listTombstones                1        0        0
  store 45 ms, engine outside the store 11.7 ms

```

## Profile after (3,000 events)

```

candidates after one appended event  (events=3000; median wall 20.1 ms over 5; last run: 20.1 ms, 46 SQL statements, 43 store calls, 200 event rows read)
  method                    calls     rows       ms
  getKnowledge                  2     1498     10.1
  getUnits                      2      750      3.4
  list                          4      200      1.3
  aliasesFor                    2        0      0.6
  relationsOf                  14       22      0.3
  analysesOfForm               14       14      0.2
  listEnrolments                1        1        0
  listTombstones                1        0        0
  getPack                       1        0        0
  getProjectionCursor           1        1        0
  head                          1        1        0
  store 16.1 ms, engine outside the store 4 ms

preferences  (events=3000; median wall 0.2 ms over 5; last run: 0.2 ms, 6 SQL statements, 6 store calls, 20 event rows read)
  method                    calls     rows       ms
  list                          4       20      0.1
  getPreferences                1        1        0
  listTombstones                1        0        0
  store 0.2 ms, engine outside the store 0 ms

```

## Profile after (12,000 events)

```

candidates after one appended event  (events=12000; median wall 21.2 ms over 5; last run: 19 ms, 46 SQL statements, 43 store calls, 200 event rows read)
  method                    calls     rows       ms
  getKnowledge                  2     1498      9.9
  getUnits                      2      750      2.8
  list                          4      200      1.3
  aliasesFor                    2        0      0.6
  relationsOf                  14       22      0.3
  analysesOfForm               14       14      0.2
  listEnrolments                1        1        0
  listTombstones                1        0        0
  getPack                       1        0        0
  getProjectionCursor           1        1        0
  head                          1        1        0
  store 15.2 ms, engine outside the store 3.8 ms

preferences  (events=12000; median wall 0.2 ms over 5; last run: 0.2 ms, 6 SQL statements, 6 store calls, 20 event rows read)
  method                    calls     rows       ms
  list                          4       20      0.2
  getPreferences                1        1        0
  listTombstones                1        0        0
  store 0.2 ms, engine outside the store 0 ms

```

## What still costs

`candidates` at 12,000 events: `getKnowledge` twice (749 rows each, about 23 ms together: once for the stale-alias scan, once for the read), `getUnits` twice (about 7 ms), the engine's own ranking (about 9 ms). All are proportional to the number of words, not to the log. The batch port methods that would remove most of what is left: `relationsOf` / `analysesOfForm` for many ids at once (14 calls each here, hundreds for a learner whose words are forms), and `listEventsBySentence(learnerId, sentenceKeys)` or an `EventFilter.sentenceKey` for the audio-first rule.

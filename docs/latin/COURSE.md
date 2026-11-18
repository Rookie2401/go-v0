# The Latin course path (first slice, 2026-11-13)

What a newcomer to Latin is given, in the shape the other courses use (`docs/STAGE0.md`, `docs/LADDER.md`). Everything here is
**AI-drafted and unreviewed**: Latin has no native speakers, so the review every item needs is a Latinist's. Nothing publishes outside
preview until then (the ladder's publication rule: `audio-ready`, after a named reviewer).

## What exists

| Part | Where | Size | Gate |
|---|---|---|---|
| Orientation (tutorial) | `packages/language-packs/src/tutorial/la.ts` | spelling, Church-Latin sounds, 12 words, 3 sentence patterns, a 6-sentence passage | every word read by the analyser (`test/course/latin-tutorial.test.ts`) |
| Stage 0 | `data/stage0/la/` | 24 steps: 15 scenes (88 lines, 57 checks, 52 production tasks, 19 notes), 4 sound steps, 4 reviews, 2 exit forms, 36 coverage ids | `npm run stage0:validate` 0 errors; every word confirmed with the full lexicon (`test/course/latin-stage0.test.ts`) |
| Ladder, stage a1-1 | `data/ladder/la/` (`ladder.json`, `units/`, `authoring/`, `PLAN.md`) | 12 controlled units, 2,791 running words, mean coverage 86.7 % | `npm run ladder:check -- la`: 0 errors, 19 warnings (advice; no unit padded to clear one); every word confirmed, no writing alarm (`test/course/latin-ladder.test.ts`) |
| Writing checks (GoTell) | `src/adapters/latin/production.ts` | five rules | 0 alarms on all of `data/corpus/la` (`test/course/latin-production.test.ts`) |

The cast is the shared Stage 0 world (`data/stage0/world.json`) with Latin names: Anna, Lucius, Martha, Marcus, Samuel. Stage 0's path hands
over to the first ladder unit (`path.next` → `text:la:la-a1-1-01`), and the ladder starts after Stage 0 (`after: "stage0"`).

Measurement: the ladder gate, `ladder:place` and the CI gate test load the full Latin lexicon before measuring Latin (the analyser
starts from a seed word list; the app loads the full one), so the figures are the app's.

## Where the authentic texts can enter

`ladder:place` after the 12 units (the threshold is 95 % coverage):

| text | after Stage 0 | after unit 12 |
|---|---:|---:|
| Ritchie, *Fabulae Faciles*: Perseus | 28.7 % | 48.0 % |
| Ritchie: Hercules | 23.6 % | 39.2 % |
| Vulgate, John 1 | 40.0 % | 64.6 % |
| Caesar, *Gallic War* 1 | 25.1 % | 38.6 % |

All four are "library, not ladder" for now. Perseus has 329 lemmas in 915 words, 181 of them met once; reaching it needs roughly another
4,000–6,000 words of controlled Latin (stages a1-2 to a2-2) that teach its vocabulary three times each. `data/ladder/la/PLAN.md` names
the lemmas to schedule.

## Not done (next)

- Stages a1-2, a2-1, a2-2 and a `b1-bridge` with Ritchie, the Vulgate chapters and Caesar as authentic units once the gate allows.
- A Latinist's review of every scene, unit, explanation and answer key (lists for the reviewer in `data/ladder/la/PLAN.md` and in the
  Stage 0 report recorded in the commit message of e69ce3b3).
- Recordings: none exist; every audio slot is `needed`.
- The course's shelves (`src/course/latin.ts`) do not yet place ladder units on a shelf for help (Spanish, German and Norwegian register a
  `*_LADDER_SHELF` map in `src/course/catalog.ts`, which another session owns).

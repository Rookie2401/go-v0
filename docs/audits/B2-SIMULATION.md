# From zero to B2? — the simulated student, 2026-10-05/06

> **Superseded on 2026-10-06** by docs/audits/COURSE-AUDIT-2026-10-06.md, which re-runs this student after the five course
> audits, the ladders for all five courses and the library rebuild. The figures below are the baseline it compares against.

**Question.** Starting from zero, could a student reach B2 with this system? If so, is there fluff slowing them down?

**Short answer: no, in none of the five courses — neither as the app is today nor as if every draft were reviewed and
recorded.** On reading alone, Spanish and German have enough text for a B2-level reader to grow from, and the new
Spanish ladder works as designed; but a learner cannot get through it today, the step from the ladder into the library
is still missing, Hindi and Thai are a Bible with little else, Albanian ends after 4,400 words, and nothing in the app
teaches or measures listening or speaking.

## How it was tested

`scripts/simulate-learner.mts` (`src/sim/`): a student who starts from zero and lets the app's real engine choose every
text — bootstrap, Stage 0 through its own service, the ladder path, whole-library recommendations, library texts
imported when opened. The student reads with a fixed rule (a word is known after three encounters; every unknown word
opens the word sheet; a sentence counts as understood without help at ≥ 95 % known words) and takes the first
suggestion it may open, skipping rereads of what it has read (a real student would scroll on). Two modes:
**today** (only what a learner can open now) and **as if reviewed** (every draft open — what the system could do once
reviewers and voices exist). Each run stopped after an hour of computing time (≈ 0.2–0.4 M words), not for lack of text,
except Albanian. Output in the git-ignored `data/research/simulate/`. Reading only: no listening, speaking or writing is
simulated.

## Results

| course | mode | words read | words known | 1,000 known at | 3,250 known at | Scripture share | read at < 90 % known | stop |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Spanish | today | 415 k | 4,367 | 57 k | 299 k | **67 %** | 4 % | time |
| Spanish | as if reviewed | 267 k | 3,884 | 42 k | 206 k | 14 % | 20 % | time |
| German | today | 385 k | 6,319 | 35 k | 164 k | 30 % | 47 % | time |
| German | as if reviewed | 227 k | 4,183 | 35 k | 160 k | 29 % | 53 % | time |
| Hindi | today | 335 k | 3,931 | 36 k | 264 k | **90 %** | 16 % | time |
| Hindi | as if reviewed | 220 k | 3,072 | 35 k | — | 86 % | 22 % | time |
| Thai | today | 416 k | 4,060 | 27 k | 205 k | **93 %** | 10 % | time |
| Thai | as if reviewed | 287 k | 3,614 | 31 k | 215 k | 86 % | 16 % | time |
| Albanian | today | 947 | 74 | — | — | 0 | 100 % | nothing to open |
| Albanian | as if reviewed | 4,402 | 179 | — | — | 0 | 55 % | nothing to open |

(Fewer words in the second mode only means the engine was slower per text in the same hour; compare the milestones.)

**Spanish, today.** After Stage 0 the engine offers two Darío poems (44 % known), then 1 Chronicles, chapter after
chapter: genealogies score as "easy" because names count as known words. Two-thirds of all reading is the Bible.

**Spanish, as if reviewed.** The ladder works: 69 units, 50 k words at 93 % known, ending at 1,039 known words —
exactly the plan. Every milestone comes about 30 % sooner than today and the Bible falls to 14 %. But after the ladder
nothing in the library is within reach: the engine serves the old beginner drafts the ladder already absorbed, then
native texts at a fifth of all reading below 90 % known. The B1 bridge does not exist yet.

**German** has the best gradient without any ladder (Grimm and Guerber tales carry the learner), but half of all reading
is below 90 % known — assisted reading the whole way.

**Hindi and Thai**: whatever the mode, 86–93 % of reading is Scripture, because there is little else.

**Albanian**: the 72-unit A1 ladder is all there is; it ends at 179 known words.

## Could they reach B2?

- **Reading**, by the usual yardsticks (≈ 3,250 words for B2 recognition, ≈ 8,000 for comfortable novels): Spanish and
  German pass 3,250 at 160–300 k words read; at the observed pace (55–100 words read per new word) 8,000 needs roughly
  another 0.7–1.2 M words — which their libraries hold (1.6–1.9 M words that are not Scripture). So reading toward B2 is
  *possible in principle* for Spanish and German, once the ladder is reviewed and a B1 bridge is built. Not for Hindi,
  Thai or Albanian with what exists.
- **Listening**: no native recording exists in any language. B2 listening is not reachable.
- **Speaking**: recorded and self-checked only, never assessed; no interaction.
- **Level**: nothing measures it; the app cannot tell anyone they are B2.

So the answer to the first question is no, and the second ("is there fluff keeping me from B2 sooner") does not yet
arise. But the runs did show what wastes a student's time on the reading route, and it should be removed before it
costs real learners:

## What wastes time (measured)

1. **Name-heavy Scripture chosen as easy reading.** Genealogies and inventories (1 Chronicles, Ezekiel's temple, Exodus
   lists) score high because names count as known; they teach 0–3 new words per 1,000. The engine's Scripture cap limits
   its shortlist, not what the student ends up reading (67 % in Spanish today).
2. **Out-of-reach first texts.** Poems (Darío, 44 %), front matter (*Wilhelm Tell — Front matter*, 17 %), Thai Bible at
   8 %: offered to a learner who knows a few hundred words.
3. **Rereads ranked above new input.** In normal mode the engine looped on rereading an unreadable first text; in
   preview mode its top five suggestions after Stage 0 were rereads of Stage 0 scenes.
4. **Duplicated beginner material.** After the Spanish ladder the engine serves Camino / Honduras drafts that the ladder
   already absorbed (92–100 % known, almost nothing new).
5. **Recycling units that teach nothing new by this measure.** Spanish a2-2-16…20: 5,898 words, no new word known.
   Recycling has value, but five in a row at 100 % is more than the measure can justify.
6. **Writing to the metric.** The ladder's drafters padded units with known words and avoided ordinary words the plan
   had not scheduled (*algo, nadie, todavía, desde, quién, cuándo, lo, le, nos*) to stay above the gate's warning line —
   stilted text a reviewer will have to fix, and a gate setting worth relaxing.

## After the fixes (2026-10-06)

What was done about the list above:

| # | fix | where |
|---|---|---|
| 1 | Recommendation coverage leaves names and numerals out, so a genealogy is no longer "easy"; texts teaching under 1 new word per 100 rank below texts that teach; a soft Scripture cap on what was *read* lately (last 20 texts / 20 k words, above 35 %) | `REACH` in `src/golearn/policy.ts`, `rank.ts`, `recommend.ts` (2b7fec6) |
| 2 | Nothing below 75 % (names left out) is offered while something at or above it exists; with nothing in reach, the closest three are offered and said to be above the learner's level | same |
| 3 | Rereads come after new input in reach, never of the text just read, never of a text read at under 75 % among the last five | same |
| 4 | The 28 Spanish drafts the ladder absorbed are tagged `superseded-by-ladder` and never offered (they stay in the store) | `data/corpus/es/` (6e9b406), `candidates.ts` |
| 5 | Units a2-2-16…20 rewritten: new reading with recycling inside it, instead of five recycling units in a row | `data/ladder/es/units/` (38a7e3a) |
| 6 | The gate's warning for controlled units relaxed from 92 % to 88 % (error stays 85 %), with the rule that a warning is advice, never a target | `src/ladder/policy.ts`, `docs/LADDER.md` (6e9b406) |

Re-run of the simulator, 15 minutes per run, same machine, before → after the engine fixes:

| course | mode | Scripture share | words read per known lemma | 1,000 known at | other |
|---|---|---:|---:|---:|---|
| Spanish | today | 98.9 % → 43.5 % | 84.8 → 60.3 | 56.7 k → 46.8 k | 2,000 known at 113.2 k |
| German | today | 31.6 % → 14.8 % | — | — | 3,250 known at 139.1 k (164 k in the hour run before) |

The front matter and the superseded drafts no longer appear. Genealogies still appear in Spanish *today*, and only
there: among what a learner may open now, nothing else reaches 75 %, so the engine falls back to the closest texts.
That ends when the ladder is reviewed and recorded — the fix is people, not code.

**The answer is unchanged: no.** The fixes shorten the reading route; they do not supply the missing pieces — the
reviewed ladder, the Spanish B1 bridge (planned: `data/ladder/es/PLAN-B1.md`), native recordings, assessed speaking and
a level measurement.

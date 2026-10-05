# Can a learner get from zero to B2 here? — audit of 2026-10-05

**Short answer: not today, in any of the five languages.** Spanish and German have enough text to read one's way to
B2-level *reading* — on paper — but there is no published way in, nothing to listen to, no speaking, and no way for the
app to tell anyone what level they have reached. Hindi and Thai have a whole Bible and little else; Albanian has almost
nothing a learner can see.

What was done: three read-only audits run in parallel (the reading ladder measured with the real adapters; the content
and its rights and review state; the engine and the four skills), then the headline figures recomputed independently
from the probe's output. Nothing in the app was changed. The probe is `scripts/audit-b2-ladder.mts`
(`npx vite-node --config scripts/vite.config.ts scripts/audit-b2-ladder.mts`, ~2½ min; output in the git-ignored
`data/research/audit-b2/`, `summary.md` has every table). Measured on the working tree of 2026-10-05, including the
built library in `public/library/` (git-ignored, built 2026-10-04) and many uncommitted course files from another
tool — **a clean checkout of the repository has none of that library**.

## Yardsticks (all approximate)

- Known-word coverage for reading without help: about 95 % minimum, about 98 % comfortable (Hu & Nation 2000; Laufer &
  Ravenhorst-Kalovski 2010). The word sheet makes lower coverage *assisted* reading, not failure.
- Vocabulary: a B2 learner recognises roughly 3,250–3,750 words (Milton 2010, EFL); reading novels at 98 % needs roughly
  8,000–9,000 word families (Nation 2006). Lemmas met three times (below) are a cruder measure than either.
- Volume: graded-reading programmes assume on the order of a million words read on the way to upper-intermediate (Nation
  & Waring).
- B2 is four skills. Reading is the only one this app's content mainly serves.

## The reading ladder, measured

The order is the one fixed in the code: Stage 0's path, then the course's shelves or grades in order, works within a
shelf as the catalogue sorts them, chapters in order. (The app lets learners pick freely; this is the path a
newcomer is offered.) *Published* = what a learner sees outside preview mode.

| | published words | of which Scripture | published, not Scripture | lemmas met 3× (published) | where the ladder is weak |
|---|---:|---:|---:|---:|---|
| Spanish | 2.63 M | 0.70 M | 1.93 M | 17,508 | no published on-ramp; first 130–200 k words at 84–89 % coverage |
| German | 2.33 M | 0.70 M | 1.63 M | 23,399 | shelves 1–3 are 20 k words at 15–72 %; mid-ladder 91–93 % |
| Hindi | 0.85 M | 0.78 M | 72 k | 6,346 | classes 2–4, 7, 9–12 empty; after class 1, 66–72 % |
| Thai | 0.89 M | 0.86 M | 30 k | 4,855 | grades 2, 4–7, 9 empty; the beginner grade is unpublished |
| Albanian | 307 words | none | 307 | 16 | everything above Stage 0 is unpublished or empty; no Bible |

(Lemma counts from the adapters alone overcount against the dictionary-backed counts by about 3 % for Spanish, 18 % for
German and Hindi, 50 % for Thai, 80 % for Albanian.)

**Spanish.** The Stage 0 scenes and the Camino / Honduras shelf (4,068 words, machine-drafted, unreviewed) are
unpublished, so in normal mode the first text a newcomer is offered is Martí's *La Edad de Oro*, with **3.5 %** of its
words known. Even after the drafts, the first published text sits at 72 %. Shelves 1–2 (fables in verse, Martí, Palma:
200 k words) stay at 84–89 %; reading becomes comfortable (95 % over a 5,000-word window) only after about 270,000
words, and largely because the Reina-Valera Bible (704 k words, 99 % coverage once reached) sits on shelf 4. Vocabulary
milestones: 3,250 lemmas met three times at about 131 k words, 8,000 at about 676 k. All of it is 19th-century,
Golden Age or Bible Spanish: no contemporary prose (modern books are in copyright and not bundled).

**German.** The most gradual ladder (14 shelves, none empty above shelf 0), but shelves 1–3 hold only 20 k words, read
at 15–72 % coverage; Grimm and Hauff on shelf 4 are where reading turns comfortable (95 % after about 147 k words).
Vocabulary: 3,250 lemmas met three times at about 149 k words, 8,000 at about 571 k. A quarter of the non-Scripture texts
are below 90 %.

**Hindi.** Ninety-two Global Digital Library children's books (60 k words, 80 %), then two Premchand stories and a play
at 66–72 %, then nothing secular. Comfortable reading arrives only in Genesis. 8,000 lemmas met three times is never
reached.

**Thai.** Beginner grade 1 (Aesop-based, 10 k words) is unpublished; published secular reading is 156 words at grade 3
and then Vetala tales at grade 8 ("B2" by the course's own label) at 61–79 %. Everything else is the Bible.

**Albanian.** 25.9 k words in all, 307 published. The modern-Albanian Wikipedia set (24 k words) is unpublished because it
is a transformed source awaiting native review. Coverage never reaches 90 %. The only Bible route is an external link.

## Content, rights and review

- **No text in any language is reviewed by a native speaker, and no person is named anywhere as reviewer or rights
  verifier.** The 1,800+ published library texts and the three whole Bibles carry `reviewedBy` values such as
  "acquire-gutenberg-all identity/source-fidelity check" — honestly labelled "no native-speaker quality claim" — and
  the publication rule accepts any non-empty name for a native author's text. Course drafts stay unpublished because they
  are generated. That is why Stage 0 hands a newcomer over to texts they cannot open.
- **Rights are verified by web pages and tools**, not by a person (the project's own rule), and the Gutenberg records
  are United States only. Leads, not legal opinions: Baroja (d. 1956) and Jiménez (d. 1958) are probably still protected
  in Honduras and Spain; Thomas Mann (d. 1955) is borderline in Germany. Five records say "coordinator (AI) … to be
  confirmed by the owner".
- **Audio: no native recording exists** in any language. All 488 Stage 0 lines are waiting for one.
- `docs/READINESS.md` is stale: it says listening is off (`FEATURES.listen` is on since 2026-10-03), the Thai Bible
  blocked and no library shipped.

## The engine and the four skills

| | verdict | evidence |
|---|---|---|
| Choosing the next text (i+1) | partial | ranking by known-word coverage (bands 95 / 88 / 75 %), but Home ranks at most 40 sampled candidates; the whole-ladder `recommend()` is not called by any screen; stages never gate; when texts run out, nothing is offered |
| Learner model | partial | "known" = "Understood" pressed on two sentences without help; "likely familiar" after four help-free views; all self-report; no forgetting or spaced review of words; no frequency data |
| Level estimate / placement / progress test | **missing** | a reading assessment is built (`src/course/readingAssessment.ts`) but not used anywhere; the listening check registers nothing; only Thai shelves carry CEFR labels, as orientation |
| Stage 0 → course | partial | a next step per language exists, but every next text is an unpublished draft; Stage 0's exit answers never reach the learner model |
| Listening | code partial, content **missing** | switched on; only reviewed human recordings count as evidence; there are none; no progression from scripted to natural speech |
| Speaking | **missing** | record, play back, self-check; never scored; no code emits speaking evidence; no speech recognition, no interaction |
| Writing | partial | GoTell's productive engine is real (levels, help ladder, spacing) but covers 15 meaning goals (11 testimony), with 74 unreviewed model wordings and machine checks the docs themselves call limited |
| Help while reading | partial | layered word sheet and English rescue are well designed; word lists 600–2,750 lemmas, machine-drafted; 31–50 grammar constructions per language — far short of B1–B2 grammar; a learner's own book gets no English rescue |

## What would make 0 → B2 possible, in order

1. **An on-ramp that is published.** 50–150 k words per language of graded, contemporary text from Stage 0 to where
   the library becomes readable (Spanish shelf 1 at 84–89 %; German shelf 4; Hindi class 1; Thai and Albanian from
   scratch). The drafts that exist (3.7–5 k words per language) are a start, not a ladder.
2. **A named native reviewer per language**, and a publication rule that requires a person, not a script, before any
   text counts as reviewed. Without this, (1) never reaches a learner.
3. **Native audio**, at least for the on-ramp and Stage 0, then natural speech. B2 listening cannot be reached without it.
4. **Measurement.** A placement and a periodic check (vocabulary size against a frequency list; comprehension questions
   while reading); switch on the reading assessment already built. Only then can the app say "about A2".
5. **The engine over the whole ladder.** Recommend from every text the learner can open, not 40 samples; say what to
   do when a shelf runs out; add spaced review of words met.
6. **Middle-of-the-ladder content for Hindi, Thai and Albanian**, and Bible access for Albanian.
7. **Speaking and interaction.** Outside what the app does today; for a mission team the natural answer is people —
   the app could schedule and record conversation with native speakers rather than pretend to score it.
8. **Rights**: a person verifies each work for the countries that matter (Honduras, Spain, Germany, Albania, India,
   Thailand), starting with the 20th-century authors above.

## What this audit could not measure

Whether the readings are right (no native has checked any), whether the texts suit adults on mission (topic,
register), comprehension itself (only coverage), true frequency-band vocabulary (no frequency list in the repository),
and anything on a real learner. The probe counts what is there; it cannot say that a person who reads it all reaches B2.

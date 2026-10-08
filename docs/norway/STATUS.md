# Team Norway: design and status

Written 2026-10-07 by the lead at the end of the first build (Phases 1–12 of the brief). The specification is
`docs/norway/SPEC.md`; the reconnaissance is under `docs/norway/recon/`; the reproducible corpus audit is
`npm run norway:audit`. Every number here was measured on this date with the commands named beside it. Nothing in
this document claims a native review, a verified right, or a recording: none exists.

## The governing question

*Can a learner with zero Norwegian proceed through published Team Norway texts, in order, and read authentic modern
Norwegian at roughly B2?*

**No.** Nothing in the Norwegian course is published: every text is a machine draft awaiting a named native
reviewer, no work in the catalogue has verified rights, there is no recording, no dictionary, and nothing measures a
level (SPEC §12). What exists is the whole route in draft, with the gates, counts and labels that will let a person
review and publish it honestly, and a learner simulation that shows the draft route carries a learner through its
13,000 words and then runs out of text.

## What was built

| area | state | measured by |
|---|---|---|
| language registration | `nb` (Bokmål) and `nn` (Nynorsk) are `LanguageCode`s; one course `norway-nb` reads `nn` as a companion language (`Course.readsLangs`); the team appears last in onboarding | `test/core/readsLangs.test.ts`, `test/ui/onboarding.test.tsx`; opened in the browser |
| analyzer | `src/adapters/nb.ts`, `nn.ts`, shared engine `src/adapters/norwegian/**` (5,975 lines): tokenizer, function words, nouns (both feminine paradigms), weak and strong verbs, adjectives and comparison, possessives, particle verbs as units, compounds (lexicon-known parts, unconfirmed), 16 constructions, ~55 fixed phrases, historical spelling relations by period, varieties, concept families (~200 nb↔nn rows), production checks (dialect, register, 4 cheap grammar checks), rule-based East reference pronunciation with a listed-word table | 10 `test/adapters/norwegian-*.test.ts` files |
| analyzer accuracy | **blind holdout** (65 sentences written by an agent that never saw the lexicon), first-candidate lemma / POS / both: nb 94.58 % / 93.84 % / 91.87 % (406 words), nn 90.68 % / 94.92 % / 89.83 % (118 words) on the first run; after one fix round that saw the holdout: nb 98.03 % / 99.51 % / 97.54 %, nn 94.92 % / 100 % / 94.92 %. The remaining misses are three deliberate conventions (particle pieces carry the unit lemma; *ha/bli* are VERB unless a participle follows; *som* is PRON). The analyzer's own gold sets score 100 % and are fitted, so they are not quoted as accuracy | `test/adapters/norwegian-holdout.test.ts` (prints the numbers; never fails on them) |
| Stage 0 | `data/stage0/nb/**`: 17 scenes, 5 sound steps, 2 exit forms, 27 path steps, ~112 written forms, every item `ai-drafted` / `unreviewed`; sound steps say there is no official spoken standard | `stage0-validate nb`: 0 errors, 2 warnings (`sult` met once because "er også sulten" still reads as the noun; 122 lines need a native recording) |
| ladder | `data/ladder/nb/**`: 48 controlled units in a1-1 … a2-2 (12,293 words; per stage 2,859 / 2,853 / 3,036 / 3,545), authored from text files (`authoring/build.mjs`), every unit machine-draft; b1-bridge empty by design (needs authentic text, which needs owner-approved downloads: `data/ladder/nb/PLAN.md` §5) | `ladder:check nb`: 0 errors, 24 warnings (11 coverage 84.6–87.8 %, 2 recycling, 11 recurrence); orphans 8 of 340 new lemmas (2.4 %); before the recycling pass: 117 warnings, 36 % orphans |
| corpus seeds | `data/corpus/nb` and `nn`: story-01, dialogue-01, bible-1john-1 each; the Bible excerpts (1 John 1:8-9, John 3:16; 1930 for nb, 1921 Studentmållaget for nn) were read from one web source each (CrossWire study tool), with the URL recorded, `rights-unverified`, no verification record, kept out of the bundle by the rights gate | `rights:check`: nb and nn each 2 bundled (owner-authored), 1 left out, 0 refused |
| catalogue and rights | `data/sources/course-library/nb.json` + `src/course/norwegian.ts`: 17 leads (1930 Bible, 1921 Nynorsk Bible, Biblica Open NT, Hamsun ×2, Undset, Bjørnson ×2, Kielland, Asbjørnsen & Moe 1852, Rolfsen, Garborg, Duun, Aasen, Vinje, Tatoeba ×2), all `rights-unverified`, withheld, with 34 evidence records; streams Modern / Nynorsk / Heritage / Scripture (external link only) | `test/course/norwegianRights.test.ts` (9); `norway:audit`: works the gate would bundle 0 |
| register and GoTell | the Bokmål production check flags Nynorsk forms (`dialect`) and Riksmål/Dano-Norwegian spellings (`register`) with replacements; a recombination whose phrase is met only in historical-variety texts is dropped (generic rule, golden-tested for es/de); nb and nn concept tables, negators, chronology, pronouns and 15 + 15 testimony model sentences, machine-draft | `test/gotell/register.test.ts` (8), `test/gotell/norwegianTables.test.ts` (6) |
| GoListen metadata | `AudioImportManifest` gained optional `speaker{id,native,region,locality,dialect}`, `writtenStandard`, `spokenTranscript[]`, `alignment{unit,method,confidence}`, validated on import and stored; no audio exists; Home says "No recordings in Norwegian (Bokmål) yet" | `test/golisten/importMeta.test.ts` (8) |
| word sheet | a Norwegian word shows the adapter's own rule-based IPA, labelled "Norwegian (Bokmål) rules" (never as a dictionary's), and the concept-family line ("Nynorsk: eg") as information only | `test/ui/norwegianSheet.test.tsx`; seen in the browser on `jeg` |
| curriculum audit | the ladder gate gained two warning-only findings for every language: orphans (new lemmas never met again) and recurrence (intervals that do not widen); all five shipped ladders still report 0 errors (es 117 / de 51 / hi 85 / th 50 / sq 85 warnings, mostly the new advice) | `test/ladder/recurrence.test.ts` (11); `ladder:check` per language |
| learner simulation | `simulate-learner nb --mode preview` (every draft open): 77 texts, 13,236 words, 426 known lemmas (465 met), 65 % of reading below 90 % known, 31 words read per new known word, stopped when no openable text was left (`data/research/simulate/nb-preview.json`) | the real engine over the real bootstrap |
| audit command | `npm run norway:audit`: 71 rows (17 works, 6 documents, 48 units) with standard, variety, era guess (labelled a guess), rights state, evidence count, gate verdict, review status | run on 2026-10-07 |
| regression | the five shipped courses: `npx tsc -b` clean; full suite 393 files, **9,889 tests passed, 2 failed**, both pre-existing and outside Norway (see "Known gaps"); `rights:check`, `check-course-libraries`, `verify-scripture-canon` and all five `ladder:check` runs unchanged at 0 errors | run on 2026-10-07 after the build |

## What the simulation says

The draft route is readable in order: the simulated learner (three meetings make a word known; names and numerals
known from the start) goes through Stage 0, the six seeds and all 48 units and meets 465 lemmas, 426 of them to the
"known" line, in 13,236 words. Two thirds of that reading is below 90 % known, because the controlled units are
written to the gate's 85–88 % coverage line and the learner has nothing easier to alternate with. Then it stops:
there is no bridge and no library. The next limit is content, exactly as for Albanian in the course audit of
2026-10-06, not the engine. B2 is not in reach of this content; the honest standard in SPEC §12 stands.

## What the owner must decide or do (nothing here was done by a tool)

1. **Rights.** Ask Bibelselskapet's rights editor (https://bibel.no/verbum/rettigheter-til-bruk-av-bibeltekst) on what
   basis the 1930 and 1938 translations are "falt i det fri", given that the 1938 reviser died in 1984; and ask a
   Norwegian lawyer whether that statement can be relied on. Until then the Bible seeds stay out of every build.
2. **Downloads** (filename, source, size; none performed): Norsk ordbank Bokmål 2005 and Nynorsk 2012 (nb.no/sprakbanken
   p=30527, p=31088; sizes unlisted), kaikki Bokmål (`kaikki.org-dictionary-NorwegianBokmål.jsonl`, 83.5 MB) and
   Nynorsk (63.5 MB), Språkbanken unigram frequency lists, NB Uttale, SWORD `Norsk` (1.82 MB) and `NorSMB` (1.72 MB),
   the Åpen Bibel repository (~6.2 MB), Gutenberg Hamsun 30027 / 43724 / 43725 and Undset 32245 (<1 MB each), Rolfsen's
   reader part 2 (Runeberg), Tatoeba `nob`/`nno` exports. Without the first four there is no dictionary and the
   lexicon stays hand-authored and bounded to the course vocabulary.
3. **Native reviewers** for Stage 0 (17 scenes), the 48 units (the recall paragraphs titled "Husker du?" are deliberately
   plain), the lexicon's `unverified` cells (listed in the analyzer's data files and in `docs/norway/recon/linguistics-policy.md`
   Part B), the concept-family table, the GoTell tables and model sentences, the East reference pronunciation, and the
   Norway facts in the units (17 May, bunad, Fløyen, Friday taco).
4. **Recordings**: none; GoListen is not a launch dependency, and listening is neither taught nor measured.

## Known gaps and follow-ups

- Nynorsk has only two seed texts, a smaller lexicon (coverage on running Nynorsk will be lower than Bokmål's) and no
  production checks; the library builder has no place for `nn` entries yet (they sit in `nb.json` with `lang: "nn"`).
- GoLearn's coverage and recommendation views filter by the course language, so Nynorsk encounters are kept under `nn`
  but not shown in the Bokmål course's pages (the brief's separate accounting holds; a separate view is a follow-up).
- The word sheet's variety line is hidden under the plain assistance profile the shelves use; the family line is shown
  under every profile.
- The Azure voice ids for `nb-NO` are from memory, unverified; `nn` has no voice.
- The 2001 Språkrådet pronunciation advice and the 2025 norming guidelines could not be fetched; the policy quotes are
  digests and must be re-read on the live pages before they go into learner-facing text.
- Two pre-existing test failures outside Norway remain for the owner: an Albanian source hash recorded before the
  2026-10-06 library rebuild reformatted the file (the text is unchanged; re-taking the hash is the owner's call), and a
  stray quotation mark in one Global Voices attribution in Codex's remediation manifest.

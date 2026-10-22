# Biblia — the Tanakh and the Greek New Testament, read through GoLearn

> **Recreated** from the owner's Biblia app (`C:\Users\CJWal\dev\biblia-v0`, live at rookie2401.github.io/biblia) on the Go parsing
> system (docs/PLAN14.md §6, P5). The TEXTS and their organisation are the Biblia app's; **none of its parsing code is here** — every
> word is read by the Go analysers (`adapter-he`, `adapter-el`), shown on the shared GoLearn card (with the Variants tab), and every
> lookup and self-mark is a Go Repository event, so what a learner reads in Biblia is input to GoReview.

## What it is

| part | state |
|---|---|
| texts | `public/data/he/<Book>.json` (39 books: the Miqra according to the Masorah text, CC BY-SA 4.0, with the Open Scriptures morphology per word, CC BY 4.0), `public/data/el/<Book>.json` (27 books: the SBL Greek New Testament, CC BY 4.0, with MorphGNT per word, CC BY-SA 3.0), `canon.json`, `SOURCES.json` — copied by `npm run biblia:import` from the Biblia app; git-ignored |
| organisation | Biblia's: Tanakh → Torah / Neviʾim / Ketuvim → book → chapters (Hebrew numerals); New Testament → Histories (Gospels, Acts) / Epistles (Paul, General, Revelation) → book → chapters (Greek numerals); the reader shows one chapter, every word tappable, verse numbers in the text's own numerals, Hebrew right-to-left with the choice full Masoretic / points only / consonants |
| parsing | `parseSelection` of the GoLearn parser with the he / el analysers; the full Biblical and Koine indexes (`public/lexicon/{he,el}/*.json`, built by `npm run he:build-biblical` / `el:build-koine`) are installed at start so every word of the text has its source's reading; the reader declares the period (`he-bib` for the Tanakh, `arc-bib` where the chapter is Aramaic, `el-koi` for the New Testament) through `ParseContext.varietyId` |
| card | the shared GoLearn card (`packages/golearn-extension/src/popup/card.ts`): meaning, Go deeper (Form, Syntax, All forms, Meanings, Origin, Word structure), See full sentence, **Variants** (the word across the periods), the knowledge meter, Report |
| events | inside the GoLearn extension (this page served from `chrome-extension://…/biblia/`) the on-device Repository receives `SelectionLookedUp`, `AssistanceRequested`, `ItemMarked` … with `readerId: 'biblia'`, the enrolment's `languageId` he / el and the period as `varietyId`; GoReview's intake then sees them like any GoLearn lookup. Outside the extension the reader works but records nothing, and says so |

## What it is not (yet)

- No dictionary panel of its own: Biblia's BDB / Abbott-Smith HTML entries are not shown; the card's Meanings come from the analysers' glosses
  (BDB / Strong's short glosses for the Tanakh, Dodson / Abbott-Smith / Strong's for the New Testament) until the he / el dictionaries exist.
- No search, vocabulary list or progress screens: vocabulary and knowledge live in the Repository and are shown by GoPractice; Biblia keeps
  only the last position per device.
- No per-token gold hint yet: the source's reading of the very token (the `w` column) reaches the card through the installed full index, which
  carries every reading of that written form; a form the Bible reads two ways is shown with both, the commoner first (PLAN14 follow-up).
- No Septuagint, no Vulgate (the Biblia app moved them to its companion Vetus); no audio beyond GoListen's device voices.

## Run

```
npm run biblia:import                       # copy the texts from the Biblia app (once)
npx vite -c packages/biblia/vite.config.ts  # development server (port 5199)
vite build -c packages/biblia/vite.config.ts                   # packages/biblia/dist
vite build -c packages/biblia/vite.config.ts --mode extension  # packages/golearn-extension/dist/biblia/ (after npm run ext:build)
npm run biblia:build-ext                    # the same; npm run local:build runs it last, so the packaged extension carries Biblia
```

Ancient Greek readings (2026-10-21): the Wiktionary Ancient Greek tables (Attic by default, Epic, Ionic, Koine …; 660,000 forms) are
too large to carry whole, so `npm run el:shard-ancient` cuts them into 130 gzip shards (12 MB, `public/lexicon/el/ancient/`, git-ignored)
and the reader fetches the shards of each chapter's words before rendering it (at most 48 shards kept; the period line says how many).
The Variants tab then shows Attic and Homeric rows for New Testament words; a paradigm shows what the loaded shards hold.

Inside the extension (2026-10-21): `npm run local:build` ends with this build, so `dist/biblia/index.html` ships with the extension and
opens from the setup app's reader screen ("Open Biblia"), where lookups and marks reach the on-device Repository under the Hebrew or
Greek enrolment. The page carries the texts (about 20 MB) and the Biblical and Koine form indexes (about 7 MB); nothing is fetched.

Tests: `npx vitest run test/biblia`.

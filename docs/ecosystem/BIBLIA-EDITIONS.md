# Biblia's translation editions — Hindi, Thai, German, Spanish

Built 2026-11-21. Each is a separate system that works exactly as Biblia does: the same design, navigation, type scale, animations, card and
events, with only what its language and script require changed. Biblia itself is unchanged by them (owner, 2026-11-21: "Make sure that
Biblia remains the same as is"). The Hindi edition has its own document (BIBLIA-HINDI.md); this one covers all four and the three added after it.

| Edition | Text | Licence | Site (repository) |
|---|---|---|---|
| `hi` | Indian Revised Version (IRV) Hindi, 2019 — eBible.org `hin2017` | CC BY-SA 4.0, © Bridge Connectivity Solutions | rookie2401.github.io/biblia-hindi (Rookie2401/biblia-hindi) |
| `th` | Biblica® Open Thai Common Version™, 2025 — Open.Bible | CC BY-SA 4.0, © 2025 Biblica, Inc. (+ trademark notice) | rookie2401.github.io/biblia-thai (Rookie2401/biblia-thai) |
| `de` | Die Schlachter-Bibel 1951 — eBible.org `deu1951` | CC BY 4.0, © 1951 Genfer Bibelgesellschaft | rookie2401.github.io/biblia-german (Rookie2401/biblia-german) |
| `es` | Santa Biblia, Reina-Valera 1909 — eBible.org `spaRV1909` | public domain | rookie2401.github.io/biblia-spanish (Rookie2401/biblia-spanish) |

Albanian ("Bibla e Shenjtë", ALB) is on hold by the owner's decision (2026-11-21): the text the aggregators label public domain (Bible Gateway,
CrossWire `Alb`, the Unbound Bible) names no translator, publisher or year, and may be the Albanian Bible Society's copyrighted 1994 text, which
Wikipedia says is "misleadingly labelled as public domain"; it is not on eBible.org. It waits for a confirmed rights holder.

## Rights, checked 2026-11-21

- Thai: the licence and the copyright notice the publisher requires are in the release itself (`data/sources/th/usx/metadata.xml`,
  `promoVersionInfo` and `copyright`): CC BY-SA 4.0; the notice "Biblica® Open Thai Common Version™ / Copyright © 2025 by Biblica, Inc." (in Thai and
  English) and the trademark line must appear on the title or copyright page — they are on the Sources page, under every chapter and in
  `data/th/SOURCES.json`. Derivative work under the same licence: Biblia's JSON is.
- German: eBible.org's copyright page (and the `copr.htm` in the download): "copyright © 1951 Genfer Bibelgeschellschaft (Geneva Bible Society)"
  [sic], "Creative Commons Attribution license 4.0"; changes must be indicated as not endorsed by the licensor. CrossWire's separate `GerSch`
  module says "Copyrighted; Free non-commercial distribution" — a different grant; Biblia uses eBible's files and eBible's licence. No statement
  from the Genfer Bibelgesellschaft itself was found; the CC BY grant rests on eBible.org's page.
- Spanish: eBible.org's copyright page (and `copr.htm`): "Public Domain … Dominio Público"; published 1909 (pre-1930, public domain in the USA).
- Downloads (owner's yes, 2026-11-21): `deu1951_usfm.zip` 1,541,349 bytes (sha256 c61ecc93…7614076) and `spaRV1909_usfm.zip` 2,384,901 bytes
  (sha256 56937c2b…d949c7a5) from https://ebible.org/Scriptures/, committed under `data/sources/de` and `data/sources/es` with their unpacked
  USFM and copyright pages. The Thai release was already in the repository (`data/sources/th`, committed earlier).

## The texts as Biblia reads them (src/usfm.ts)

One USFM reader for every edition, with an edition's particularities as options (`translation.usfm.options` in src/edition.ts):

- verse wording kept; book introductions, section and parallel-passage headings, speaker labels, footnotes and cross-references left out;
- superscriptions (`\d`, and `\qa` acrostic headings) kept on their own line before their verse; paragraph markers and `\b` become breaks;
- a verse number with no words (a verse modern texts omit, or a slot the source leaves empty where its numbering differs) is left out;
- Hindi: `dropSpans: ['bdit']` (the IRV's inline cross-references); the space after an opening marker kept, as eBible renders it;
- Thai: `markerSpace: 'delimiter'` — the space after an opening marker is only a separator, as the USFM standard has it (`รวม\litl 12 คน`
  reads รวม12 คน);
- German: `dropPatterns` removes the German verse numbers the source prints in brackets inside verses, "(03-2)" (1,404 of them), where its
  numbering differs from the English; Schlachter's own brackets ("[dar]") and "(Pause.)" stay.

Checked: Hindi 31,104 verses and Thai 31,087 verses identical to the verified copies in `data/verified/scripture.json`; Spanish 31,084 verses,
identical but two where the verified copy itself kept `|strong=` markup; German 31,101 verses (no independent copy in the repository): every verse of
13 sample chapters from Genesis 1 to Revelation 22, Psalm 119 included (485 verses), found word for word in eBible.org's own HTML pages of the edition.
The Hindi output of the general reader is byte-identical to the Hindi edition first published.

## What differs per edition (src/edition.ts)

The library tree's names in the language (written for this app, awaiting a native speaker's review; the book names are the edition's own), the
masthead, the chapter word (अध्याय, บทที่, Kapitel, Capítulo), numerals (Devanagari and Thai digits as a choice; German and Spanish have none of
their own), the analyser, the reading-size setting, the attribution, the storage namespace (`biblia-hindi/`, `biblia-thai/`, `biblia-german/`,
`biblia-spanish/`) and the caches (`biblia-<name>-shell-*`, `-data-*`). Type: Hindi ships Tiro Devanagari Hindi; Thai uses the device's own Thai
face (no Thai web font was available without a download); German and Spanish are set in EB Garamond, justified and hyphenated, as Biblia sets Greek.

## GoLearn, the Repository, GoReview

Each edition reads with the analyser the GoLearn extension loads for that language (`packages/golearn-extension/src/analysers/<lang>.ts`
re-exports the same module), records with no variety (as GoLearn records a web page in that language) and enrols (or reuses) the learner's
enrolment for the language (scripts Deva, Thai, Latn). GoReview takes the events in unchanged. GoLearn marks its Thai and German analysers
experimental; the Sources page repeats its words. Known: the Thai analyser cuts พระยาห์เวห์ ("the LORD") as พระ + ยาห์เวห์.

## Build, test, publish

```
npm run biblia:dev-th                                                              # serve one edition (th, de, es, hi)
BIBLIA_SERVICE_URL=https://go-v0.onrender.com npm run biblia:build-standalone-th   # packages/biblia/dist-standalone-th
npx vitest run test/biblia                                                         # editions.test.ts, hindi.test.ts and Biblia's own
```

Publishing: mirror `packages/biblia/dist-standalone-<id>` into a checkout of the edition's repository (keep `.git`, `.nojekyll`, `README.md`),
commit naming the source commit and build id, push; Pages serves `main` at the root. The owner chose (2026-11-21) that this is done directly,
not through the release manager, as these are new targets no other session touches.

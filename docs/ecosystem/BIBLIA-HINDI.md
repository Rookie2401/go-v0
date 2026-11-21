# Biblia — the Hindi edition

Built 2026-11-21. The same Biblia (packages/biblia) over the Hindi Bible: the same design, navigation, type scale, animations, card, account
and events, with only what Hindi and Devanagari require changed. Not yet published: publishing goes through the release manager and needs the
owner's yes (see "Hosting" below).

## The text and its licence

The Indian Revised Version (IRV) Hindi, 2019, from eBible.org (translation id `hin2017`).

- Licence, checked three ways on 2026-11-21: eBible.org's copyright page and details page for hin2017, and the `copr.htm` inside the committed
  download `data/sources/hi/hin2017_usfm.zip`. All three say: "copyright © 2017, 2018, 2019 Bridge Connectivity Solutions", Creative
  Commons Attribution Share-Alike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Source files dated 2023-04-11. The rights record
  is already in the repository (`src/course/bibleAccess.ts`, the `hi` entry).
- What the licence asks, and where Biblia does it:
  - attribution and source: the line under every chapter, the library page and the Sources page name the title, the copyright holder, the
    licence (linked) and eBible.org; `data/hi/SOURCES.json` travels with the text files;
  - changes indicated, not endorsed: `IRV_ATTRIBUTION.changes` in `src/irv.ts`, shown on the Sources page and in `SOURCES.json`;
  - share-alike: Biblia's JSON copy of the text is offered under the same licence (said in `SOURCES.json` and on the Sources page).
- Fidelity: `src/irv.ts` reads the USFM of `data/sources/hi/usfm` (committed) at every build and every dev serve. All 66 books and
  31,104 verses come out identical to the verified copy of the same edition (`data/verified/scripture.json`, read from eBible.org's
  published pages); `test/biblia/hindi.test.ts` compares every verse.
- What is left out: the book introductions, the section headings, the study notes (`\f`) and the cross-references the edition sets apart
  (`\bdit`). Sixteen verses keep a reference printed inside the verse (for example 1 Samuel 8:5 "(प्रेरि. 13:21)"), as eBible.org's own text
  does; they are left as the edition prints them.
- What is kept that the library import drops: the Psalm titles (`\d`, 139 lines; Psalm 88's two lines stay two lines) and the letter names
  of Psalm 119, each on its own quiet line before its verse, its words tappable. A title and its verse are recorded as read separately.
- Paragraphs: the IRV's `\p` / `\m` / `\nb` / `\pi` become Biblia's paragraph breaks, as the Masoretic paragraphs do in the original edition.

## What is the same, what differs

One app, two editions chosen at build time (`src/edition.ts`; `main.ts` reads the build's `__BIBLIA_EDITION__`).

Differs, because of the language and script:
- the library tree: Old Testament (पुराना नियम: Law, History, Poetry & Wisdom, Prophets) and New Testament (नया नियम: Gospels and Acts,
  Epistles and Revelation), in the IRV's order (the Protestant canon); chapters are "अध्याय १";
- the masthead "पवित्र बाइबल" above "Biblia Sacra"; the subtitle says Hindi;
- the analyser: `src/adapters/hi.ts`, the very module the GoLearn extension loads for Hindi pages (its `analysers/hi.ts` re-exports it), so
  the form and lemma units Biblia records and paints are GoLearn's and GoReview's;
- no full Hebrew/Greek indexes or lexicon shards are loaded or shipped;
- Devanagari type: Tiro Devanagari Hindi (SIL OFL 1.1, the Devanagari subset Fontsource publishes, v5.3.0), in `editions/hi/fonts` with its
  licence, declared in `editions/hi/edition-hi.css`, which only the Hindi build links (the original edition's files are unchanged);
- Settings: "Hindi text size" (16–40 px, default 22) in place of the Hebrew and Greek sizes, no "Hebrew text" row; verse numbers default to
  1, 2, 3 as the IRV prints them, with Devanagari digits (१, २, ३) as the other choice; the prose is set ragged-right (justified Devanagari
  left wide gaps in a phone column);
- preferences are kept under `biblia-hi:` (place, open library levels, reading settings), so the two editions on one site keep their own.

The same: the reader, the card (`createCardUI`, not restyled), lookups (`parseSelection` with the verse as context and `biblia:<Book>.<ch>.<v>`
as the source), the events (SelectionLookedUp, one EncounterRecorded per verse read, ItemMarked, assistance), level marks from
`GET /knowledge`, the account screen, the sync status, the offline queue, speech, the service worker's behaviour.

## GoLearn, the Repository, GoReview

- GoLearn: every Devanagari word is a button parsed by the hi analyser. The language evidence is `{ languageId: 'hi', basis: 'override' }`
  with no `varietyId`: Modern Standard Hindi has no variety in the registry (the Hindi varieties there are heritage Awadhi, Braj and Sant
  Bhasha), exactly as GoLearn records a Hindi web page.
- Repository: the recorder enrols (or reuses) the learner's Hindi enrolment, script `Deva`, pack version 1. Events go through the same
  queue and the same account as the original edition; nothing in the Repository service changed.
- GoReview: nothing changed there. It takes `languageId: 'hi'` events from producer surface `biblia-reading` like any other, and its
  reading-relevance keys (`biblia:<Book>.<ch>.<v>`) are language-neutral, so eligible Hindi words enter the existing Hindi queue with the
  existing scheduling.

## Build and test

```
npm run biblia:dev-hi                                                               # serve (port 5199; --port to change)
BIBLIA_SERVICE_URL=https://go-v0.onrender.com npm run biblia:build-standalone-hi    # packages/biblia/dist-standalone-hi (13 MB)
npm run biblia:build-hi                                                             # packages/biblia/dist-hi, without the installable files
npx vitest run test/biblia
```

The build assembles its public folder in `packages/biblia/.edition-hi/` (git-ignored): `public/` without the original texts, the Hindi
manifest, stylesheet and face, and `data/hi/` (66 books, `canon.json`, `SOURCES.json`). A USFM book that does not parse stops the build.

## Hosting (proposed, not done)

As a sub-folder of the published Biblia: `https://rookie2401.github.io/biblia/hi/` (the `gh-pages` branch of Rookie2401/biblia, folder `hi/`),
so it shares the origin, and with it the sign-in, of the original edition.

- Its service worker is scoped to `hi/` and names its caches `biblia-hi-shell-*` / `biblia-hi-data-*`; the original worker's are
  `biblia-shell-*` / `biblia-data-*`. Neither deletes the other's.
- The original edition's worker (scope `/biblia/`) used to answer every navigation under its scope with its own `index.html`, which would
  have shown the original Biblia at `/biblia/hi/`. It now answers only its own page (`''` or `index.html`). The original edition must be
  rebuilt and republished with this change BEFORE the Hindi edition is published, and a device that already has the original installed
  picks the new worker up on its next visit to /biblia/ (the worker checks for updates on every return to the foreground).
- Both rebuilds go to the release manager (session 40f57fca) as a REBUILD REQUEST; publishing needs the owner's yes.

## Limits

- The Hindi analyser's word list is machine-drafted; nothing here has been reviewed by a Hindi scholar or a native speaker. A word it does
  not know shows no meaning.
- The Hindi names of the library's divisions (व्यवस्था, ऐतिहासिक पुस्तकें, काव्य और ज्ञान, भविष्यद्वक्ता, सुसमाचार · प्रेरितों के काम,
  पत्रियाँ · प्रकाशितवाक्य) were written for this app and await a Hindi speaker's review; the book names are the IRV's own (`\toc1`).
- No dictionary panel, search or vocabulary list (as in the original edition: GoReview shows the vocabulary).
- Not part of the GoReview iPhone app or Biblia's own iPhone shell; not an extension page.
- The two editions share the offline queue: with both open in two tabs, both may send the same queued events; the Repository keeps one copy of
  an event by its id.

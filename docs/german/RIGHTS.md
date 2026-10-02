# German course — rights readiness (2026-10-01)

Rules this document applies, without exception:

1. **Recommended is not bundleable.** A work listed in the catalogue is a recommendation until an exact edition has
   passed the review below.
2. **Rights attach to an exact edition, translation and recording**, not to a work. A modern edition of an old text,
   a modern translation, an editor's arrangement of posthumous papers and a reading aloud each carry rights of their
   own.
3. **Unknown means do not ship.** `rights-unverified` and `prohibited-from-bundling` are never bundled; the library
   build tool refuses them.
4. **Old is not a legal basis.** A death year or a publication year is a lead. The evidence is recorded.
5. **A statement for one country is not a worldwide statement.** Jurisdictions checked are named.
6. **A source site's own terms count.** A site may restrict reuse of its files whatever the copyright status of the
   text.
7. **Text and audio are separate.** No German recording is bundled.

Who verified: the entries marked *verified* below were checked by the coordinator (an AI model) against the evidence
listed, on the dates given. That is a careful reading of the sources, not legal advice; the owner should confirm it
before any public release. The records live in code (`src/course/german.ts`, fields of `WorkRights`) and, for texts
fetched by script, beside the text (`data/sources/de/*.source.json`, `data/verified/scripture.json`).

Rights states used in the code and what the owner's brief calls them:

| Brief | Code (`RightsState`) | May be bundled |
|---|---|---|
| verified_public_domain | `verified-public-domain` | yes, with its evidence record |
| verified_open_license | `verified-open-licence` | yes, when the app meets the licence |
| permission_granted | `permission-granted` | yes, with the permission on file |
| (first-party text) | `course-authored` | yes; machine-drafted text still needs review before it is published |
| learner_owned_local | `user-supplied` | never bundled: on the learner's device only |
| recommendation_only | `prohibited-from-bundling`, `recommended-only` | never |
| rights_unknown | `rights-unverified` | never |

## 1. What is bundled, with its evidence

### 1.1 Lutherbibel 1912 — a slice (verified public domain)

| | |
|---|---|
| Work / edition | *Die Bibel nach der deutschen Übersetzung D. Martin Luthers*, the revision of 1912 |
| Exact source | eBible.org, translation id `deu1912`, https://ebible.org/deu1912/ — the chapter pages `GEN01.htm`, `PSA001.htm`, `PSA023.htm`, `MAT01.htm`, `1JN01.htm`, `JHN03.htm` |
| Legal basis | Luther died in 1546; the revision was published in 1912; the distributor's copyright page states "Public Domain" for this text (the build script reads that page and stops if it does not say so) |
| Jurisdictions | as stated by the distributor; not checked country by country. A 1912 publication is out of copyright in the United States (published before 1929); in countries with a term of life plus seventy years the question is the revisers' death dates, which the distributor does not give — **this is the one open point** |
| Attribution / share-alike | none required; the source and edition are named on every text |
| Modifications | none: each verse is identical to the source after Unicode and whitespace normalisation |
| Redistribution | permitted (public domain) |
| Compliance | met: nothing is required; the text names its source |
| Bundled | 71 verses: Genesis 1 (31), Psalm 1 (6), Psalm 23 (6), Matthew 1 (25), 1 John 1:8–9, John 3:16 |
| Verification | `scripts/build-de-scripture.mjs` takes each verse from the page; `scripts/verify-scripture.mjs` extracts it again independently and compares: 71 verses, 0 mismatches; record with URLs in `data/verified/scripture.json` |
| English rescue | World English Bible (eBible.org `eng-web`, public domain), verse by verse |
| Audio | none bundled |

### 1.2 Two tales of the Brothers Grimm, edition of 1857 (verified public domain; transcription under an open licence)

| | Die Sternthaler (KHM 153) | Der süße Brei (KHM 103) |
|---|---|---|
| Edition | *Kinder- und Haus-Märchen*, Große Ausgabe, 7. Auflage (Ausgabe letzter Hand), Band 2, Göttingen: Dieterich, 1857, p. 285 | same edition and volume, p. 90 |
| Exact source | de.wikisource.org, page "Die Sternthaler (1857)", revision 3577237 (2019-11-22) | page "Der süße Brei (1857)", revision 3445434 (2018-10-31) |
| Proofreading | Wikisource state "fertig": proofread twice against the scan; scan page quality 4 of 4 | the same |
| Checksum (sha256 of the text taken) | `1a676af4…78aa6ab` | `bd548682…1b0a0b` |
| Words / sentences | 298 / 11 | 222 / 6 |

- **Legal basis.** Wilhelm Grimm died on 16 December 1859, Jacob Grimm on 20 September 1863; the edition appeared
  in 1857. That is beyond every term in use: life plus 70 years (Germany, EU) ended in 1933, life plus 100 years in
  1963, and the United States treats works published before 1929 as public domain. Jurisdictions checked: DE, EU, US.
- **The transcription.** German Wikisource offers its text under *Creative Commons Attribution-Share Alike 4.0* (the
  site's own rights statement, read by the build script). Whether a faithful transcription of a public-domain text
  is a protected work at all is doubtful; the conservative reading is applied: attribution is given (source, edition
  and licence are named in each text's source line, which the reader shows), and the bundled copy of the
  transcription is offered under the same licence.
- **Source terms.** Wikimedia's terms of use allow reuse with attribution under the stated licence. The text was
  fetched through the public API, once per tale.
- **Modifications.** Page-number marks removed; whitespace normalised; cut into sentences without changing a
  character (the build script reconstructs the source paragraph from the sentences and refuses a difference). The
  spelling of 1857 is kept (daß, gieng, that, Thaler, Armuth).
- **Redistribution.** Permitted. **Compliance:** met as described; the English lines are the course's own.
- **Not yet published.** The English rescue lines were drafted by an AI model and have not been read by a person, so
  both texts stay in preview. The German wording itself is verified against the source.
- **Audio.** None bundled.

### 1.3 First-party texts (course-authored)

Weg 1–3 (22 texts), Gespräche 1 (6), Deutschland — Lesungen 1 (4): written for the course, drafted by an AI model,
owned by the course authors. Bundled, **unreviewed and unpublished**: visible in preview only until a native speaker
has reviewed them (`npm run corpus:review`). Two older seed texts ("Meine Geschichte", "Ein Gespräch") are in the
same state.

## 2. The dictionary (not yet installed)

Planned source: the kaikki.org extract of Wiktionary for German (`kaikki.org-dictionary-German.jsonl.gz`,
98,334,006 bytes; dated 2026-09-28). Wiktionary content is CC BY-SA 4.0 (and GFDL); kaikki.org redistributes it under
the same terms. As for Thai and Spanish it would be a separately attributed layer (never merged into the hand word
list), built into shards that carry the source file name, date, checksum and licence in their manifest, with the
attribution shown in Settings and on every word sheet that uses it. **It has not been downloaded: the owner's
permission for the download is outstanding.** No proprietary dictionary (Duden or other) is used or required.

## 3. Sources that are deliberately not used

- **Projekt Gutenberg-DE** (projekt-gutenberg.org): its terms restrict reuse of the texts it supplies. It may serve
  to find works; no text is taken from it.
- **Modern Bible translations** (Luther 1984 / 2017, Elberfelder revised, Schlachter 2000, Einheitsübersetzung,
  Hoffnung für alle, Neue Genfer Übersetzung, Gute Nachricht, Neues Leben, BasisBibel): they belong to their
  publishers; none is bundled without written permission on file.
- **Internet Archive scans** as such: a scan being online says nothing about the rights in the text.
- **NLP models and corpora**: none is shipped. The German analysis is rule- and lexicon-based (see
  `docs/german/STATUS.md`); if a parser is ever added, the software, the model and the corpus it was trained on each
  need their own licence check.

## 4. Candidates awaiting a rights review (not bundled)

The catalogue lists 55 further works as `candidate` (rights unverified) — Guerber's reader, Busch, Hoffmann's
*Struwwelpeter*, the complete Grimm collection, Bechstein, Hebel, Hauff, Spyri, Bassewitz, Bonsels, Keller, Storm,
Karl May, Eichendorff, Droste-Hülshoff, Hauptmann, Kafka, Stifter, Fontane, E. T. A. Hoffmann, Schnitzler, Kleist,
Büchner, Thomas Mann, Zweig, Goethe, Schiller, Lessing, Novalis, Luther's catechism, Schleiermacher, Bonhoeffer,
Kant, Nietzsche, Rilke, Mommsen, Humboldt, Lilienthal, and the Elberfelder and Schlachter Bibles of 1905.
For each, a review must record before anything is ingested: the exact edition and digital source; who died when,
with the source of that fact; first publication; the term that applies in DE / EU and in the US; whether the
edition adds editorial matter, modernised spelling, illustrations or notes with rights of their own; the source
site's licence and terms; the retrieval date and checksum; the proofreading state. Points already known to need
care are noted on the entries themselves:

- **Posthumous works** (Kafka's *Der Process* and *Das Schloss*, Büchner's *Lenz*, Rilke's *Briefe an einen jungen
  Dichter*): the arrangement, the introduction or the critical text may be an editor's.
- **Authors who died after 1929** (Hauptmann 1946, Bonsels 1952, Thomas Mann 1955, Zweig 1942, Bonhoeffer 1945,
  Schnitzler 1931): the term has run out where it is life plus seventy years, but the United States counts from
  publication for works first published in 1929 or later (Zweig's *Schachnovelle*, 1942; Bonhoeffer's *Nachfolge*,
  1937).
- **Illustrated books** (Busch, *Struwwelpeter*, *Peterchens Mondfahrt*): pictures by another hand have their own
  term.
- **Revised editions** (Karl May after 1912; modernised Luther texts; abridged *Heidi*): each is a different text.

## 5. Recommendation only (never bundled)

Kästner, Preußler, Ende, Funke, and the German translations of *Percy Jackson*, *Harry Potter* and *The Land of
Stories*: in copyright. They appear in the catalogue as "read it from your own copy"; the learner's own `.txt` or
unprotected `.epub` is imported on the device, labelled "Your copy", never uploaded, bundled or published. A
copy-protected file is refused.

## 6. Open questions for the owner

1. Permission to download the German dictionary data (section 2).
2. Confirmation of the Luther 1912 basis outside the United States (section 1.1): the distributor's statement is
   the evidence; the revisers are not named there.
3. Whether the Grimm tales may be published once a person has read the English lines, or whether the English should
   instead be taken from a public-domain translation (Margaret Hunt, 1884) aligned by hand.
4. Which candidates to review first. Recommended: the Grimm collection (same source, same edition, tale by tale),
   then Hebel and Hauff, then Storm's and Keller's novellas.

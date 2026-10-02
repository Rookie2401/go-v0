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
| Legal basis | Luther died in 1546. The revision of 1912 (New Testament December 1912, whole Bible 1913) was commissioned by the Evangelische Kirchenkonferenz and published as a church text; the editions name no reviser. The distributor's copyright page states "Public Domain" (the build script reads that page and stops if it does not say so) |
| Jurisdictions | **Recorded: United States, Germany, EU** (see "The basis for Germany and the EU" below). Not checked: Austria and Switzerland individually; any jurisdiction with a longer term |
| Attribution / share-alike | none required; the source and edition are named on every text |
| Modifications | none: each verse is identical to the source after Unicode and whitespace normalisation |
| Redistribution | permitted (public domain) |
| Compliance | met: nothing is required; the text names its source |
| Bundled | 71 verses: Genesis 1 (31), Psalm 1 (6), Psalm 23 (6), Matthew 1 (25), 1 John 1:8–9, John 3:16 |
| Verification | `scripts/build-de-scripture.mjs` takes each verse from the page; `scripts/verify-scripture.mjs` extracts it again independently and compares: 71 verses, 0 mismatches; record with URLs in `data/verified/scripture.json` |
| English rescue | World English Bible (eBible.org `eng-web`, public domain), verse by verse |
| Audio | none bundled |

**The basis for Germany and the EU** (investigated 2026-10-01 after an outside audit; an AI model's reading of the
sources, not legal advice):

| Evidence | Kind | What it shows |
|---|---|---|
| The Deutsche Bibelgesellschaft's own online edition (https://www.die-bibel.de/bibel/LU12/GEN.1, read 2026-10-01) carries the line "Neu durchgesehen nach dem vom Deutschen Evangelischen Kirchenausschuss genehmigten Text (1912). © der digitalen Ausgabe 1999, 2018 Deutsche Bibelgesellschaft Stuttgart" | primary: the publisher of the Luther Bible | no reviser is named; copyright is claimed in the *digital edition* only, not in the text. (That edition is not our source.) |
| freie-bibel.de: "Die Lizenzabteilung der Deutschen Bibelgesellschaft hat uns am 2014-01-21 bestätigt, dass die Luther 1912 mittlerweile gemeinfrei ist"; and that no list of the revisers with their years of death exists there | secondary: a third party's report of the publisher's statement | the only plausible rights holder is reported to have confirmed that the text is free |
| de.wikipedia.org, "Lutherbibel", section "Die Lutherbibel von 1912 im 21. Jahrhundert": "nicht mehr durch das Urheberrecht geschützt"; reprinted and distributed without permission | tertiary | common understanding; widely reprinted |
| The term for a work published without its authors' names is 70 years from publication (Germany: UrhG § 66; EU: Directive 2006/116/EC Art. 1(3)) | the law's general rule | 1912 / 1913 + 70 years ended in 1983 at the latest |

**What is NOT established**, and stays an open point for the owner: (1) no written statement of the Deutsche
Bibelgesellschaft is on file — only a third party's report of one; (2) the revisers' names and death dates are
unknown; were a reviser identified as an author, life plus seventy years would apply to that contribution; (3) the
origin of eBible.org's digital text (who keyed it) is not stated; (4) Austria, Switzerland and jurisdictions with
longer terms were not checked. **Recommended before a public release in Germany:** one written line from the
Deutsche Bibelgesellschaft's licensing department. The catalogue records the status as public domain for US, DE
and EU *with* this note (`LUTHER_1912_RIGHTS.basis`); if the owner judges the basis insufficient, removing `DE` and
`EU` from `statusByJurisdiction` makes a build released there leave the text out (next paragraph).

**What the machine enforces, and what it does not.** `npm run rights:check` and the production build apply
`src/ingest/rights.ts`. Three facts are kept apart for every public-domain or licensed text: *wording verified*
(the text is its source's text — source fidelity, nothing more), *rights recorded* (the catalogue work says who
established the state and when), and *jurisdictions recorded*. A Scripture text that names its work is held to the
catalogue record; a verified wording alone no longer bundles it. A build or report that names where it is released
(`GO_RELEASE_JURISDICTIONS=US,DE,EU npm run build`, `npm run rights:check -- --release US,DE,EU`) leaves out any
such text without a recorded basis for each of those jurisdictions. Without a release list the build makes no
claim about where it may be distributed, and says so. **Passing the gate means the records are present and
consistent. It is not legal clearance.**

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

## 2. The dictionary

**State on 2026-10-01:** the file named below was downloaded and built into `public/dict/de` (357,750 entries, about
40 MB; both directories are git-ignored) by an agent other than the German session, which neither requested nor
authorised it. Whether it stays, and whether a production build ships it, is the owner's decision (section 6). What
follows describes the source and its terms.

Source: the kaikki.org extract of Wiktionary for German (`kaikki.org-dictionary-German.jsonl.gz`,
98,334,006 bytes; dated 2026-09-28). Wiktionary content is CC BY-SA 4.0 (and GFDL); kaikki.org redistributes it under
the same terms. As for Thai and Spanish it would be a separately attributed layer (never merged into the hand word
list), built into shards that carry the source file name, date, checksum and licence in their manifest, with the
attribution shown in Settings and on every word sheet that uses it (seen in the browser on a learner's imported book:
"Wiktionary, via kaikki.org — CC BY-SA 4.0" and "dictionary meaning, not checked for this sentence"). No proprietary
dictionary (Duden or other) is used or required.

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

The catalogue lists 61 further works as `candidate` (rights unverified) — Guerber's reader, Busch, Hoffmann's
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

1. The German dictionary (section 2): another agent downloaded and built it. Keep it, and ship it in production
   builds, or remove it?
2. Confirmation of the Luther 1912 basis for Germany and the EU (section 1.1, "The basis for Germany and the EU"):
   the evidence is recorded; a written line from the Deutsche Bibelgesellschaft would close it. If the owner judges the
   basis insufficient, removing `DE` and `EU` from the record's `statusByJurisdiction` makes a build released there
   leave the text out.
3. Whether the Grimm tales may be published once a person has read the English lines, or whether the English should
   instead be taken from a public-domain translation (Margaret Hunt, 1884) aligned by hand.
4. Which candidates to review first. Recommended: the Grimm collection (same source, same edition, tale by tale),
   then Hebel and Hauff, then Storm's and Keller's novellas.
5. **Catalogue entries added by another agent (uncommitted on 2026-10-01).** Some thirty German works were marked
   `verified-public-domain` in `src/course/german.ts` on the basis of a Project Gutenberg notice for the United States
   only, with texts in `data/sources/de-prose/` (three of those files are byte-identical under three different
   titles). The German session did not make or review this. By rules 4–6 above a United States notice is a lead for
   Germany and the EU, not a basis; with a release list that includes DE or EU the gate leaves such works out. Among
   them are authors who died after 1929 (Thomas Mann 1955, Zweig 1942, Bonsels 1952, Hauptmann 1946, Rilke 1926):
   each needs its own check, per edition. Decide whether these entries stand, and who verifies them.

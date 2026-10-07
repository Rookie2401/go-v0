# Team Norway recon 3: lawful text sources, rights, and the Bible

Reconnaissance report (Phase 1 of the Team Norway brief), produced by a research agent on 2026-10-07 and reviewed
by the lead. **Nothing was downloaded** (the fetch tool auto-saved one CSV, the eBible catalogue, in its own
tool-results folder; nothing entered the repo). Every page was read through a summarising fetch, so a quote is
only as exact as that digest; one digest was flatly wrong (it invented Norwegian 1930/1921/1904 entries on
eBible.org) and was caught against the raw eBible CSV. Treat anything not marked "primary" or "raw-checked" as
medium confidence. **No rights state in this document is a verification.** A person must verify every work
before it is marked anything but `rights-unverified`.

Lead's review notes:
- The one first-hand rights statement is Bibelselskapet's own page saying the 1930 Bokmål and 1938 Nynorsk
  translations have "falt i det fri". It gives no legal basis, and the sole 1938 reviser (Ragnvald Indrebø) died in
  1984, so the 1938 claim is in tension with life+70. The project will **not** treat either as verified until the
  owner has a written answer from Bibelselskapet or a lawyer. Until then the Scripture plan is: 1930 Bokmål held
  as `rights-unverified` with the evidence recorded; no 1938 text found in digital form anyway.
- No digital 1938 Nynorsk text with a clear licence was found. The CrossWire NorSMB module is the 1921 Nynorsk
  translation, not 1938.
- The CC0 label on the NBdigital archive and Runeberg's "public domain only" policy are compilation-level claims,
  not per-work verification. The brief's rule stands: never infer viewable = redistributable.
- The lawful contemporary sources are share-alike (Wikipedia, Biblica Open NT) or attribution (Tatoeba CC BY 2.0
  FR, NDLA mixed). Contemporary controlled Stage 0 and ladder text will be project-authored, as the brief says.

Norwegian copyright terms, from the current åndsverkloven (2018 act, via lovdata.no, digest):
- § 11: life of the author plus 70 years after the end of the death year.
- § 8: joint works run from the death of the longest-living co-author.
- § 12: anonymous works get 70 years from first publication.
- § 6: a translation is its own protected work.
- § 14: laws, regulations, court decisions and other official acts are unprotected (digest says the same covers government proposals, investigations and statements, and official translations of such texts).
- The "§ 40" in the brief is old-law numbering.
- Practical dates: Hamsun (d. 1952) free from 1 Jan 2023; Undset (d. 1949) from 2020; Duun (d. 1939) from 2010.

---

## 1. BIBLE

### 1a. What Bibelselskapet says about the 1930 and 1938 translations

**Primary statement:** https://bibel.no/verbum/rettigheter-til-bruk-av-bibeltekst (no date on the page).
- It lists the translations Bibelselskapet holds rights to: Bibel 2011 (bokmål and nynorsk), NO78/85, NO78, the 2005 NT, and Biibbal 2019 (North Sami).
- It states that "Oversettelsen av 1938 (nynorsk)", "Oversettelsen av 1930 (bokmål)" and Bibal 1895 (North Sami) have "falt i det fri", i.e. are free to use without permission.
- Confidence that Bibelselskapet currently says this: high.

**It gives no legal basis.** It names no rights holder and no expiry year. It asserts no rights over the digital text, typography or revisions, and none was found anywhere.

**Unresolved tension.**
- Ragnvald Indrebø, the sole reviser of the 1938 Nynorsk Bible, was born 1891 and died 26 June 1984 (https://snl.no/Ragnvald_Indrebø and Wikipedia, digests).
- Under life+70 his 1938 revision would run to the end of 2054, unless the work counts as something else.
- Bibelselskapet's history page says it commissioned him to revise the 1921 text, working 1933–38: https://bibel.no/bibelgaven/bibeldagen/hvordan-markere-bibeldagen/bibelutstilling/beskrivelse-av-bibelutgaver-fra-1550-til-1938.
- The 1930 team named there: Bang and Odland started it; Gustav Jensen and Alexander Seippel contributed; Dr. Alnes was language consultant; Dr. Messel (Hebrew lecturer) joined in 1924. Their death years are not verified.
- Bibelselskapet's "falt i det fri" claim may rest on a basis not found (such as corporate or commissioned authorship).
- Confidence that the 1938 text is lawfully free: **low to medium**. For 1930: medium (death years unchecked).
- Only Bibelselskapet or a Norwegian lawyer can settle this. Written confirmation from Bibelselskapet's rights editor would remove the doubt.

**Other statements that agree with the primary page** (independent claims, not independent legal analysis): Åpen Bibel's README says the 1930 copyright "has expired"; CrossWire marks the 1930 module Public Domain, and the 1921 Nynorsk module too.

**Not asserted:** what happens to the 1930/1938 text when it is retyped or republished. The licensing fees on that page apply to the protected translations.

### 1b. Protected translations and the permission route

Same primary page:
- Protected: Bibel 2011, NO78/85, NO78, NT 2005, Biibbal 2019.
- **Bibel 2024 is not named on that page.** Bibelselskapet describes it as a "smaller revision" of 2011, launched 14 March 2024: https://bibel.no/om-bibelen/hvordan-oversette-bibelen/bibel-2024. Treat 2024 as protected (inference).
- Quotation: "Der en setning ikke gir mening uten at sitatet tas med, er det sitatrett (gjelder mindre avsnitt)." No numeric limit is given.
- Policy: "main principle" of compensation for use, in print and digital (print per page or royalty; digital a royalty on retail price, a per-copy fee, or an annual fee, covering e-book, audiobook, app and film). Rate amounts not verified.
- Free uses listed: personal reading, quotation rights, parish newsletters, links to bibelen.no, and social posts crediting @bibel.no.
- Contact: a "rettighetsredaktør" link; the address is obfuscated and could not be read.
- YouVersion says the same in English for Bibel 2011: https://www.bible.com/versions/119.
- Confidence: high for 2011, 1978/85 and 2005; medium for 2024 (inferred).

### 1c. Digital sources of the 1930 and 1938 texts

**eBible.org has no Norwegian 1930 or 1938 text.** Raw-checked against https://ebible.org/Scriptures/translations.csv.
- The only Norwegian entry is `noblb`, "Biblica Open En Levende Bok: Det Nye Testamentet" (NT only, 27 books, 7,748 verses, updated 2025-05-17). CC BY-SA 4.0; the Biblica trademark must be removed from derivatives. A modern paraphrase, not a historical text.

**CrossWire SWORD module "Norsk" (1930 Bokmål).**
- Raw `.conf`: https://crosswire.org/ftpmirror/pub/sword/raw/mods.d/norsk.conf
- `DistributionLicense=Public Domain`; About: "Text scanned and proofed by H. Priebe and co-workers. Based on the version prepared by Tore Vamraak."; `TextSource=http://unbound.biola.edu/`; version 2.0, 2020-02-08 ("added notes and crossreferences"); 1.82 MB; OSIS XML; Lang=nb.
- Module page: https://crosswire.org/sword/modules/ModInfo.jsp?modName=Norsk
- Completeness: unverified (KJV versification, presumably 66 books). Error rate: not documented. Who wrote the 2020 notes and cross-references is not stated (a small rights question). The PD statement is CrossWire's, not Bibelselskapet's.

**CrossWire "NorSMB" (1921 Nynorsk, Studentmållaget).**
- Raw `.conf`: https://crosswire.org/ftpmirror/pub/sword/raw/mods.d/norsmb.conf
- `DistributionLicense=Public Domain`; `TextSource=http://gamal.nynorsk.no/mu/smio/bibelen/` (host no longer resolves); version 1.0, 2012-01-25; Lang=nn; 1.72 MB.
- An earlier translation, not the 1938 text. Peter Hognestad was main editor (https://www.oversetterleksikon.no/bibelomsetjingar-i-noreg/). Death years of the 1921 contributors not verified.
- **No digital 1938 Nynorsk text with a clear licence was found.**

**scrollmapper/bible_databases** (https://github.com/scrollmapper/bible_databases): lists "Bibelen på Norsk (1930)" and "NorSMB 1921" among 140 translations; repo MIT; per-translation licences not visible; probably a re-package of the CrossWire modules.

**Åpen Bibel** (https://github.com/Ravatsaas/apen-bibel, last push 2026-09-19).
- README: a modernisation of the 1930 text, base "copyright has expired"; contributors waive rights under CC0. The name "Åpen Bibel" is protected.
- 66 book folders; `Tekst/` holds the 1930 baseline text. Per `AGENTS.md`, modernised books so far: Romans, 2 Peter, Micah, Psalms (partial).
- GitHub reports no licence file (CC0 claim only in the README). Baseline provenance undocumented. Quality unaudited. Useful to cross-check the SWORD text, not as a sole source.

**Wikikilden** (https://no.wikisource.org/wiki/Bibelen): no complete public-domain Bible; only some individual books.

**National Library of Norway (NB)**: no.wikipedia's NO30 article cites a digitised copy, URN:NBN:no-nb_digibok_2017091807031. Access tier unknown; Bibelselskapet still sells the 1930 Bible (https://bibel.no/en/nettbutikk/bibel/eldre-oversettelser).

**Not found:** a 1930/1938 USFM file with a licence statement, a YouVersion 1930/1938 entry, a sacred-texts.com page (403).

### 1d. Alternatives

- 1921 Nynorsk Bible: the CrossWire NorSMB module (PD as labelled; translators' death years unchecked).
- 1904 / 1891 Bokmål: 1930 is a "lighter revision" of the 1904 NT and 1891 OT (https://www.katolsk.no/tro/tema/tradisjon/artikler/norske-bibeloversettelser-fra-reformasjonstiden-til-i-dag-2013-en-oversikt). No digital 1904 text with a licence statement found.
- Ivar Aasen's Landsmål NT (1883–89): on Wikikilden (Aasen d. 1896).
- Biblica Open Norwegian NT: CC BY-SA 4.0, modern, from eBible; share-alike on any derivative.

---

## 2. HERITAGE / HISTORICAL TEXT

### Sources and terms

**Project Runeberg** (https://runeberg.org)
- Publishes only works whose authors died more than 70 years ago (https://runeberg.org/admin/copyright.html). "Proofreaders do not get copyright to a novel", but "translators do". Files are DRM-free (https://runeberg.org/admin/decisions.html).
- **No reuse licence for the OCR text is stated**, and nothing is said about editors' prefaces. "DRM-free" and "public domain only" is not an explicit licence grant.

**NB / Nettbiblioteket**
- Licence page: https://www.nb.no/tilgang/lisens/. Public-domain material (PDM) may be copied, changed and spread, including commercially; CC0 the same; CC-BY and CC-BY-SA need credit or share-alike. Protected and Bokhylla material cannot be copied.
- Access page: https://www.nb.no/tilgang/rettigheter/. "Bøker som er falt i det fri" can be downloaded by everyone. "Svært mange bøker utgit i Norge til og med år 2005" are Norway-only (Norwegian IP) under the Bokhylla agreement (Kopinor, 2012): readable on screen, not downloadable.
- **"Viewable at nb.no" does not mean redistributable.** Only items marked free or public domain are. What check NB runs before labelling a book public domain is not verified.

**Språkbanken: Public Domain Texts from NBdigital**
- https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-34/ and https://data.norge.no/en/datasets/f40e75d5-bd94-36ed-b8d0-240221efa76e/public-domain-texts-from-nbdigital.
- 26,344 OCR texts, 10,756 authors and institutions. Text 2.7 GB, HTML 2.8 GB. Licence CC0. Released 2015-05-26, last updated 2026-03-13.
- Downloads: https://www.nb.no/sbfil/tekst/20150526_nbdig_txt01.tar.gz, `..._html01.tar.gz`, README https://www.nb.no/sbfil/dok/20150526_nbdig_lesmeg.txt.
- File names carry year, language code, OCR confidence (0–1) and author, e.g. `digibok_2009032603016-1898-nob-876-Ibsen_Henrik-Brand_et_dramatisk_digt.txt`.
- Language codes are auto-generated: about 13,708 texts "nob", 2,112 "dan"; the README warns the table "may contain errors". A "nob" tag on an 1898 Ibsen text means Dano-Norwegian orthography, not modern Bokmål.
- The README gives no cut-off rule beyond "not subject to copyright restrictions (any longer)". A CC0 label on the compilation does not independently prove each text's status.

**Norwegian Colossal Corpus (NCC)** (https://huggingface.co/datasets/NbAiLab/NCC): newspapers and books CC0 1.0; government/parliament NLOD 2.0; online newspapers CC BY-NC 2.0; Wikipedia CC BY-SA 3.0. Book layer ~862M words, 24,000+ documents, overlapping NBdigital. Newspapers withdrawn since December 2024. Not a good pick.

**Not verified:** NorGramBank and the "leksikografisk bokmålskorpus" access terms.

### Candidate heritage works

All heritage only, not A1. Orthography is Dano-Norwegian unless noted. Where an edition is named, the page said so; "listed" means only an author or index listing was seen.

| # | Work (author, death year, PD in Norway from) | Source and edition | Notes |
|---|---|---|---|
| 1 | Bjørnson, *Fiskerjenten* (1868). d. 1910 | https://runeberg.org/fiskjenten/. NB scan July 2008, 207 pp, OCR from NB, Fraktur original with a normalised version | Heritage; rural tale, simplest Bjørnson register. Proofreading status unclear |
| 2 | Bjørnson, *Arne* (1859). d. 1910 | https://runeberg.org/arneno/. Source: Samlede værker, 3rd ed., Nordisk forlag; spell-checked, not manually proofread | Heritage. Duplicate at https://runeberg.org/bbarne/ |
| 3 | Bjørnson, *Synnøve Solbakken* (1857), *En glad Gut* (1860) | Listed on Runeberg and Wikikilden; text not opened | Verify |
| 4 | Asbjørnsen & Moe, *Norske Folkeeventyr* (1852 ed.). Asbjørnsen d. 1885, Moe d. 1882 | Wikikilden (1852 2nd ed. listed). https://runeberg.org/folkeven/ is a different text: electronic edition 1996 by Kjell Nedrelid, "language style is more modern", source undocumented | **Do not use the Runeberg text as 1840s orthography.** Its normalisation may carry someone else's rights (unverified). Prefer the Wikikilden 1852 text |
| 5 | Ibsen, *Et dukkehjem* (1879). d. 1906 | https://runeberg.org/dukkhjem/. e-text 1996-11-29 | Heritage. Also Gutenberg: *Vildanden* 13041, *Fru Inger til Østråt* 15669, *Gildet på Solhaug* 15291 |
| 6 | Hamsun, *Sult* (1890). d. 1952, PD from 2023 | Gutenberg 30027, first-edition 1890 spelling | "Public domain in the USA" is a US statement; the Norwegian status rests on the 1952 death |
| 7 | Hamsun, *Markens grøde* (1917). d. 1952 | Gutenberg 43724 (part 1), 43725 (part 2) | Heritage, possibly intermediate. Edition and spelling not checked |
| 8 | Undset, *Jenny* (1911). d. 1949, PD from 2020 | Gutenberg 32245 | Heritage |
| 9 | Kielland, *Garman & Worse* (1880). d. 1906 | https://runeberg.org/garmwors/. 4th ed. 1890, scanned 1995 from the 1899 collected works; proofread | Heritage. Also *Skipper Worse* (https://runeberg.org/skipwors/) |
| 10 | Jonas Lie, *Familien paa Gilje* (1883). d. 1908 | Wikikilden author page lists it with full text | Heritage |
| 11 | Skram, *Constance Ring* (1885), *Hellemyrsfolket* (1887–98). d. 1905 | Runeberg lists the titles | Verify |
| 12 | Garborg, *Haugtussa* (1895). d. 1924 | Wikikilden, full text (Landsmål, poetry) | Heritage |
| 13 | Garborg, *Bondestudentar* (1883) | https://runeberg.org/bondestuds/ is the 1936 school edition by Olav Midttun (1883–1972), with notes | Midttun's notes would not be free until 2043. Prefer an 1883 text |
| 14 | Vinje, *Ferdaminni fraa Sumaren 1860* (1861). d. 1870 | Wikikilden | Landsmål, old spelling |
| 15 | Aasen, *Prøver af Landsmaalet i Norge* (1853), *Symra* (1863). d. 1896 | Wikikilden | Landsmål; pre-1901 orthography |
| 16 | Duun, early works (1907–1910). d. 1939, PD from 2010 | Wikikilden author page (four titles). *Juvikfolke*: not found | Nynorsk. Heritage |
| 17 | Obstfelder, *Digte* (1893), *En Præsts Dagbog* (1900). d. 1900 | Wikikilden | Heritage; very short poems |
| 18 | Wergeland, *Den engelske Lods* (Gutenberg 12844), *Jan van Huysums Blomsterstykke* (11293), poems (https://runeberg.org/wergland/). d. 1845 | Gutenberg, Runeberg | Heritage |
| 19 | Rolfsen, *Læsebok for folkeskolen*. d. 1928 | https://runeberg.org/lffrolfsen/2/ (Part 2: 1909 ed., Jacob Dybwad, "Riksmaalsutgave", 320 pp, 140 selections). Parts 3–5 also on Runeberg | Best heritage candidate for a graded ladder. OCR with Tesseract 4.0. **A reader contains texts by many authors; each contributor needs a death year before 1955** |
| 20 | Collett, *Amtmandens Døttre* (1855). d. 1895 | Wikikilden lists only *Skrifter* vol. 5 (1893) via Internet Archive | Verify |

- **Prøysen (d. 1970): not public domain** until the end of 2040.
- Elster, Kinck, Sivle and children's titles were not checked. First-edition vs later-edition spelling was not checked for any title.

**Wikikilden terms**
- Policy page: https://no.wikisource.org/wiki/Wikikilden:Opphavsrett (GFDL wording; may be old). Contributors may upload only public-domain or properly licensed material. Front page: 15,042 texts; texts must be 70 years past the author's death. Author pages carry "Oversettelser eller senere utgaver kan være beskyttet av opphavsretten." The licence of the volunteer transcriptions needs a recheck on the live page.

---

## 3. CONTEMPORARY, OPENLY LICENSED TEXT

| Source | Licence and terms | Modification | Size | Standard | Suitability |
|---|---|---|---|---|---|
| **Norwegian Wikipedia (no)** https://no.wikipedia.org/wiki/Spesial:Statistikk | Wikimedia terms (7 June 2023): **CC BY-SA 4.0 and GFDL** (https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use) | Yes, with attribution and share-alike | 692,191 articles; ~207.5M words | Bokmål | B1–C1 factual prose; derived text must stay CC BY-SA |
| **Nynorsk Wikipedia (nn)** https://nn.wikipedia.org/wiki/Spesial:Statistikk | Same | Same | 180,757 articles; ~43.3M words | Nynorsk | B1–C1 |
| **Wikibøker (no)** | Wikimedia terms | Yes | 968 content pages | Bokmål | Low value |
| **NDLA** https://data.norge.no/nb/datasets/cd3a8d6f-ff65-3332-8a9c-badd79701a65 | Data portal lists the API as **CC BY 4.0**, the website CC BY 3.0 Norway; other digests say CC BY-SA for "most" content, so mixed; check each article's tag | Depends on tag | 17,000+ resources (secondary) | Both | Strong B1–B2 informational text. JSON API. Media may carry other licences |
| **Tatoeba nob / nno** https://tatoeba.org/en/terms_of_use | **CC BY 2.0 FR**, attribution required; some sentences may carry other terms | Yes, with attribution | nob 18,898; nno 12,494 sentences (cached stats, date uncertain) | Both | A1–B1 single sentences, no connected text |
| **African Storybook** https://creativecommons.org/2017/05/22/african-storybook/ | CC BY | Yes | Norwegian count unknown | Both (claimed) | A1–A2; no Norwegian titles seen |
| **StoryWeaver** | CC BY 4.0 | Yes | Not checked (page did not load) | Unknown | Verify |
| **Global Digital Library** https://digitallibrary.io | Creative Commons, per book | Per book | Norwegian availability not confirmed | Unknown | Verify |
| **NLOD data** (public sector) | NLOD 2.0: free use incl. commercial with credit; compatible with CC BY 4.0 (https://spdx.org/licenses/NLOD-2.0) | Yes | Which text sets qualify is not established | Both | § 14: laws and many official reports are unprotected altogether |
| **regjeringen.no** | 403 to fetch; text policy unverified | Unknown | Unknown | Both | Unverified |
| **NB Tale** https://data.norge.no/en/datasets/220ef03e-70e1-3465-a4af-edd6b8390233/nb-tale-speech-database-for-norwegian | **CC0** | Yes | 380 speakers, 24 dialect areas; read + spontaneous speech | Spoken | Later audio work |
| **NST ASR database** | CC0 | Yes | 359,760 utterances, 980 speakers (sbr-54) | Spoken (read dictation) | Audio |
| **NPSC (parliament speech)** | CC0 for sound and transcripts; HF curation CC BY-SA 3.0 | Yes | Not checked | Both | Adult-register parliamentary speech |
| **Klar Tale** (easy-read weekly) | No open licence found | Unknown | Weekly, 12 pages | Bokmål | A2–B1 in style, but commercial: all rights reserved unless permission |
| **NRK, Språkrådet, Global Voices Norwegian** | No licence statement found | Unknown | Unknown | Unknown | Unavailable until proven |

- **Store norske leksikon:** licence not verified (licence page 404).
- **Christian or testimony texts with a CC licence:** the Biblica Open Norwegian NT (CC BY-SA 4.0) is the only one verified. Bibelselskapet and Norsk Bibel 88/07 texts are not open.
- **Graded readers (LES-type):** commercial; no open set verified.

---

## First ten objects to ask the owner to download

Each needs the owner's approval of filename, source and size. Sizes marked "~" are estimates.

1. **SWORD module `Norsk` (1930 Bokmål).** https://crosswire.org/sword/modules/ModInfo.jsp?modName=Norsk; OSIS, 1.73 MB installed, labelled Public Domain. Exact zip name and size not verified.
2. **SWORD module `NorSMB` (1921 Nynorsk).** https://crosswire.org/sword/modules/ModInfo.jsp?modName=NorSMB; 1.64 MB installed, labelled Public Domain.
3. **Åpen Bibel repository** (git clone or zip), https://github.com/Ravatsaas/apen-bibel; ~6.2 MB. Cross-check for item 1, not a sole source.
4. **Gutenberg plain-text files:** Hamsun *Sult* 30027, *Markens grøde* 43724 and 43725, Undset *Jenny* 32245. Each probably under 1 MB.
5. **NBdigital README** https://www.nb.no/sbfil/dok/20150526_nbdig_lesmeg.txt (small). Read first.
6. **NBdigital public-domain archive** `20150526_nbdig_txt01.tar.gz` (https://www.nb.no/sbfil/tekst/20150526_nbdig_txt01.tar.gz); ~2.7 GB unpacked, CC0 label. Only after item 5, and only as a search layer. Ask about disk space first.
7. **Runeberg Rolfsen reader, Part 2** (https://runeberg.org/lffrolfsen/2/); OCR text download. Size unknown, likely a few MB. No stated licence beyond the "public domain only" policy.
8. **Wikikilden Asbjørnsen & Moe 1852 text and Vinje / Aasen / Duun / Garborg pages,** EPUB or PDF from the author pages. Sizes unknown. Licence tag to check on the live page first.
9. **Tatoeba per-language exports** for `nob` and `nno` from the Tatoeba downloads page; likely a few hundred KB each (path and size not verified). CC BY 2.0 FR.
10. **Biblica Open Norwegian NT from eBible** (https://ebible.org/noblb/), USFM or text zip; likely 1–3 MB. CC BY-SA 4.0. Optional.

Deferred: NDLA articles (use the API), the Wikipedia dumps (large, CC BY-SA), NB Tale / NST audio (very large).

---

## Questions only the owner or a lawyer can answer

1. Does Bibelselskapet's "falt i det fri" statement for 1930 and 1938 hold given that the 1938 reviser died in 1984 and the 1930 team's death years are unchecked? Ask Bibelselskapet's rights editor for a written statement, and ask a Norwegian lawyer what basis they rely on.
2. Does Bibelselskapet claim anything over a new digital typesetting of the 1930 text, or over its own cross-references and notes?
3. Is a US-hosted Gutenberg "public domain in the USA" label enough for distribution to Norwegian users?
4. Whether a modernised or normalised edition (Runeberg's Folkeeventyr, the Midttun 1936 school edition) carries a separate editor's right.
5. Whether NB's "public domain" labelling and the CC0 label on the NBdigital archive can be relied on as evidence, or the project must check each author's death year itself.
6. Whether an app that mixes CC BY-SA text with public-domain text must release the combined work under share-alike.
7. Whether Language Council, NRK, Klar Tale and regjeringen.no texts can be licensed.
8. Which orthography eras the course may teach: the heritage texts here are pre-1917 or 1917-era Riksmål and 1901/1917 Landsmål, not today's Bokmål or Nynorsk.
9. Whether the owner wants an explicit written permission from Bibelselskapet even for the "free" 1930/1938 texts, as a precaution.

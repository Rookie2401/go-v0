# Albanian reading library audit

Checked 2026-10-02. The installed Albanian library contains one eligible source work:

| Work | Chapters | Indexed words | Source and rights |
|---|---:|---:|---|
| Modern standard Albanian open reading (`sq-modern-open`) | 27 | 9,647 | Exact revisions from Albanian Wikipedia (`sq.wikipedia.org`), licensed CC BY-SA 4.0; revision URLs and hashes are retained per document in `data/sources/sq-modern-open/source-manifest.json`. |

The source file contains 27 unique, non-generated documents. The public lazy-library build has 27 rows, 27 published documents, one work, and no duplicate IDs. The source review hash now matches the exact bytes used by both `data/sources/course-library/sq.json` and `public/library/sq/provenance.json`.

Two additional cached Wikipedia units (`Familja` and `Shqipëria — Kultura`) remain quarantined in the acquisition cache. The source manifest records inconsistent orthography and they are not eligible for this modern-standard library until a native review resolves that quality issue. They are not counted above.

The literature search did not recover a bundleable Albanian literary work. `data/sources/sq-literature/research.json` records bibliography leads, but no exact edition plus scan/transcription licence passed review. In particular, Naim Frashëri, Çajupi, De Rada, Fishta, Mjeda, Migjeni, Buzuku, Bogdani and other listed candidates remain catalogue recommendations only. Their author dates or a Wikisource lead do not establish rights for a specific edition or transcription. Albanian Bible material remains deferred under the Scripture policy and is not included in this audit.

The installed source's CC BY-SA evidence is `https://sq.wikipedia.org/wiki/Wikipedia:CC_BY-SA` and `https://creativecommons.org/licenses/by-sa/4.0/`. No unresolved licensing issue remains for the 27 installed documents; unresolved licensing is limited to the unbundled literary and Scripture candidates.

Recovered four additional cached sections: Tirana history and institutions, Durrës name origins, and Albanian politics. Separately selected nested sections (Tirana climate and archaeology; Albanian relief and climate) are excluded from their parent readings to avoid presenting the same paragraphs twice. Existing reading IDs are preserved. These are authentic reference readings, not newly recovered fiction.

The religion section was excluded because the available extraction was chart labels rather than usable narrative prose.

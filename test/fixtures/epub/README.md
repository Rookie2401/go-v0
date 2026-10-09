# EPUB fixtures (controlled reader prototype)

Built by `npm run reader:fixture` (`packages/controlled-reader/scripts/make-fixture.mts`); deterministic, so the same inputs give the same bytes. Never edit these files by hand.

| file | what it is | rights |
|---|---|---|
| `udha-sample.epub` | EPUB 3, 3 chapters (22, 18 and 21 sentences), Albanian, `dc:language sq`. Chapter 1 = `udha-1-01` + `udha-1-02`; chapter 2 = `udha-1-03` + `udha-1-04`; chapter 3 = `udha-1-05` + `udha-1-06` from `data/corpus/sq/`. `<em>` and `<span class="w">` are added at deterministic places so that sentences run across inline elements (markup only; the words are the corpus's). | Course-authored controlled Standard Albanian, drafted by an AI model, **unreviewed by a native speaker** (`source.rights: owner-authored`, `source.authorship: generated`, `generated: true` in each source document; the script refuses any other document). Not a published book. |
| `udha-sample.sentences.json` | The corpus's own sentence entries per paragraph per chapter: the ground truth the adapter tests compare against. | Same as above. |
| `rtl-sample.epub` | EPUB 3, one chapter: a heading and 5 short unpointed Hebrew lines, `dc:language he`, `<html dir="rtl">`, spine `page-progression-direction="rtl"`. Written for this fixture (no outside text). One word is wrapped in `<em>` and one in `<span>`. | Written for this repository by the course authors (an AI model); owner-authored. Unreviewed Hebrew: it exists to test direction handling and selection, not as a teaching text. |
| `protected-sample.epub` | **Synthetic** refusal fixture: the Albanian book plus a `META-INF/encryption.xml` that lists `OEBPS/ch1.xhtml` as encrypted. Nothing in it is really encrypted. | Same text as `udha-sample.epub`. It exists only to exercise the DRM refusal; a real protected book is never added to the repo. |

Source documents used (all `rights: owner-authored`, `authorship: generated`): `udha-1-01`, `udha-1-02`, `udha-1-03`, `udha-1-04`, `udha-1-05`, `udha-1-06`. The Bible sample document of the Albanian corpus is never used.

SHA-256 (as built 2026-10-08):

```
1d449fe627152bc5e051641cea3721fd68129f3ff5e2e1f65f2e2b50692db780  udha-sample.epub
fd72d125e4377244e2c94dea6836d295ad2a084161f90b7ac3228c9783079f35  rtl-sample.epub
d977ba35ad4f76404286cbe4f3b5e9d92177d22de52627718ded78bb8f4cf4d4  protected-sample.epub
efcf04e1f2394c74e761ae1daa351b443573f25aa8e2e7b64182d4f24bfc9232  udha-sample.sentences.json
```

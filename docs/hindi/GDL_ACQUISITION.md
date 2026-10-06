# Hindi CC BY reading acquisition

The Global Digital Library (GDL) is the first additional Hindi source that has a source-specific reuse record suitable for the library pipeline. Its licence page says the primary licences are CC BY and CC BY-SA and that each content element is marked with its licence. Its official content API documents reuse, exposes Hindi books without credentials, and records the licence per book.

On 2026-10-01 the API returned 129 Hindi books: 125 marked `CC-BY-4.0` and 4 marked `CC-BY-NC-SA-4.0`. The acquisition script does not infer rights from age, publisher, or availability. It writes the API response first, filters to the exact `CC-BY-4.0` record, and fetches only explicitly selected EPUBs:

| Catalogue coverage | Count | Result |
|---|---:|---|
| Hindi books returned by the official API | 129 | recorded in `catalogue.json` |
| Per-book `CC-BY-4.0` | 125 | eligible for the verified-open-licence collection record |
| Per-book `CC-BY-NC-SA-4.0` | 4 | excluded by the acquisition script |
| Selected EPUBs in the verification run | 125 | downloaded from the official per-book URLs, then moved to ignored `data/private/hi-gdl-epub` after extraction |
| Extracted Hindi source files | 125 | plain-text files plus one attribution JSON per book under `data/sources/hi/gdl` |
| Lazy library build | 124 books / 124 texts / 80,752 words | 124 passed the global source-quality gate; one was refused for replacement characters |

Run `npm run hi:gdl -- --catalogue-only --out data/sources/hi/gdl` to refresh the metadata, or pass `--all` / `--slugs` with URL-encoded API slugs to fetch selected EPUBs and produce `library-manifest.json`. Downloaded EPUBs can be moved to the private ignored directory after extraction. A selected book enters the library manifest only after the existing EPUB and source-quality checks; attribution remains per book, including author, illustrator, translator and publisher where the source provides them. No read-along audio or illustrations are acquired.

The one refused source is `मैं और मेरी दोस्त टीना` (GDL post ID 6161; API slug `%e0%a4%ae%e0%a5%88%e0%a4%82-%e0%a4%94%e0%a4%b0-%e0%a4%ae%e0%a5%87%e0%a4%b0%e0%a5%80-%e0%a4%a6%e0%a5%8b%e0%a4%b8%e0%a5%8d%e0%a4%a4-%e0%a4%9f%e0%a5%80%e0%a4%a8%e0%a4%be`): its EPUB contains three U+FFFD replacement characters in the Hindi story (`replacement-characters`), so the global gate refuses it until the source owner supplies a clean file. No text was repaired or rewritten.

The Hindi course catalogues this as `gdl-hindi-ccby`, a collection index whose selected books retain their own GDL record. StoryWeaver, Literacy Cloud, NCERT and the older Hindi literature candidates remain separate pointers because their current evidence does not establish a lawful bulk acquisition route or an exact reusable edition.

Primary evidence:

- [GDL licence](https://digitallibrary.io/about/license/)
- [GDL content API documentation](https://content.digitallibrary.io/api/)
- [Hindi books API](https://content.digitallibrary.io/wp-json/content-api/v1/books/hi)

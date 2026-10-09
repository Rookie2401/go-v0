# Rights and content-flow boundaries (reader integration)

Status: 2026-10-08. Extends `RIGHTS-AND-PRIVACY-BOUNDARIES.md` to the reader prototype: what text moves where, what
is kept, what never leaves the device, and where each reading environment's rules bite. Not legal advice; items for
expert review are marked.

## 1. The flow of one lookup (as built)

```
learner selects (gesture) ──► adapter.selection()  surface, NFC, in memory
                              adapter.context()    one sentence from the enclosing block, in memory
                              parser               Albanian adapter, in the page's JS, no network
                              card                 closed shadow DOM, textContent only, fixed position
                              store.append()       SelectionLookedUp: itemIds, sentenceKey (FNV hash),
                                                   sourceRef {kind, title ≤120, URL path}, help layers,
                                                   surface only when ≤ 4 words
                              metrics.append()     phase timings, heap numbers; no text
```
Checked by tests: the built scripts contain no network call, no `eval`, no URL; no row ever carries a sentence
(`store.test.ts`, `bundle.test.ts`); the card never mutates page text (`card.test.ts`). Verified in the browser run.

## 2. What is and is not retained

| data | retained? | where | deletable |
|---|---|---|---|
| the selected word or phrase | only when ≤ 4 words, as `surface` in the event | `chrome.storage.local` (installed) / memory (harness) | yes: the action popup's delete, and uninstall |
| the sentence | **no**; its hash (`sentenceKey`) only | event | with the event |
| the page or any passage | **no** | — | — |
| page title and URL path | yes (no host, query or fragment) | event `sourceRef` | with the event |
| timings and heap sizes | yes | metrics rows | yes |
| learner identity | local placeholder (`u-local`, enrolment placeholder, random device id) | storage | yes |

Snippet retention for review (one consented sentence per encounter, deletable per source) is designed in the
Repository document (D4) and **not** built in this prototype.

## 3. Boundaries per environment

| environment | what the product may read | what it must never do | consent and disclosure |
|---|---|---|---|
| ordinary web page | the selection and its enclosing block, after a gesture, on the tab the user activated | run before a gesture; read other tabs; read editable or form fields; persist page text; fetch other pages | store listing + in-product notice: "reads the word you select and its sentence on this page; sends nothing" |
| learner's DRM-free EPUB/TXT in the controlled reader | the file the learner opened, on device | open protected files (refused); sync or export the book; claim it is for purchased protected books | the reader's own note on first open |
| Kindle for Web | nothing from the page; what the learner **copies** (Copy button, publisher-limited) or has in their Notebook, when they choose to paste/import | OCR, glyph mapping, network/cache/state reading, automated page turning, storing credentials, any claim of compatibility | the paste/import screen says what is kept (hash + ids by default) |
| Kobo / Play Books | nothing until a person has reviewed the terms and an authorised session has verified the DOM | write an adapter before that; test on purchased protected titles | — |
| external AI or speech providers | nothing by default | send a passage, a selection or a draft without a consent screen naming what is sent and to whom; no LLM provider is wired | per-feature consent, revocable |

## 4. Rights of the material used in this phase

| material | rights | use |
|---|---|---|
| `test/fixtures/epub/udha-sample.epub`, `.sentences.json`, harness `albanian-article.html` | owner-authored, machine-drafted, unreviewed (`rights: owner-authored`, `authorship: generated` in the corpus) | fixtures and measurement pages; not product content |
| `rtl-sample.epub` (5 Hebrew lines), `scripts.html` sentences | written for these tests by the agents/lead | fixtures only |
| `protected-sample.epub` | synthetic: the udha book plus an `encryption.xml`; nothing is really encrypted | refusal test only; must never be described as a DRM sample from a publisher |
| epub.js 0.3.93 | BSD-2-Clause; dev dependency; audit flag on `@xmldom/xmldom` (unused in browsers) | controlled reader; re-check before any production use |
| the owner's Kindle title | the owner's purchase, read in the owner's session | structure inspected; no text copied; no highlight or note created |
| Wikipedia pages (sq) | CC BY-SA; only loaded in a browser; no text stored | attempted injection target; nothing recorded |

No book text, no passage and no credential was written to the repository, to any log kept, or to these documents.
The Kindle findings quote the reader's **UI** labels (button names) and one dictionary headword that the reader's
own popover displayed; nothing from the book's pages.

## 5. Expert review items added by this phase

1. Whether a user-side extension reading the user's own session falls under Amazon's "data mining, robots, or similar
   data gathering and extraction tools" and "bypass any security" clauses, and Google's "automated means" and
   "bypassing our systems" clauses, when it reads only a selection after a gesture. (The product avoids the question
   for Kindle by reading nothing there; it matters for Play Books and Kobo.)
2. The Chrome Web Store's user-data requirements for an extension that reads page content on demand: privacy policy
   text, prominent disclosure, limited-use certification.
3. `persistentAnnotation.termsReviewed: true` on the controlled reader (the owner's own reader): confirm there are no
   third-party terms (epub.js licence only).
4. Kindle Copy limits and Notebook export terms before any "paste from Kindle" or "import highlights" feature is
   described to users.

## 6. Repository conventions for this phase

- Documents under `docs/ecosystem/`; the research annex under `docs/ecosystem/annex/`.
- Prototype code under `packages/golearn-extension/` and `packages/controlled-reader/`, each README marked PROTOTYPE
  with the production-candidate parts named; harness pages under `packages/golearn-extension/harness/` (disposable).
- Tests under `test/extension/` and `test/controlled-reader/`; fixtures under `test/fixtures/epub/` with provenance
  and SHA-256 in its README.
- Commits by path only; nothing from `work/` or other sessions.

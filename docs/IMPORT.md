# Importing texts into Go

How a text gets from a file into the app: **write → validate → (verify Scripture) → review → import → publish → revise**.
Everything here is enforced by code in `src/ingest/`; the commands are `npm run corpus:*`. The behaviour is not only
described: `npm run corpus:prove` imports clearly marked synthetic files and checks every claim below (see
[Proof](#proof-the-importer-is-exercised-not-just-described)).

| Step | What you do | Command / place |
|---|---|---|
| 1. Write | Start from a template and fill it in | `docs/import/templates/{ci-story,dialogue,scripture}.v2.json` |
| 2. Validate | Find every problem with its path and a hint | `npm run corpus:validate -- <file-or-dir>…` |
| 3. Verify Scripture | Scripture only: compare the wording byte-for-byte with a published source | `node scripts/verify-scripture.mjs` |
| 4. Review | A named person checks the text and records it in `review` | `npm run corpus:review -- <file> --by "<name>"` |
| 5. Import | Put the file in the bundled folder, or use the in-app importer | `data/corpus/<lang>/*.json` · Settings → Content |
| 6. Publish | Nothing to do — the gate computes it from rights, review and (Scripture) verification | `published` + `unpublishedReasons` |
| 7. Revise | Edit the file and import it again; versions, audio and learner history are handled | same as step 5 |

A learner only ever sees **published** texts. Anything else is visible only in the explicitly marked *Preview
unreviewed content* mode, together with the reasons it is not published.

---

## Walkthrough: import → validate → review → publish → revise

The exact order, with the commands. A worked example on a copy of the bundled Spanish story, with the real output
of each command, is in [`docs/import/examples/README.md`](import/examples/README.md). Run commands from the project
root. `<file>` is your document (any folder; keep experiments out of `data/corpus`).

1. **Write the document.** Copy a template from `docs/import/templates/` (`ci-story`, `dialogue` or `scripture`),
   fill it in, and keep the defaults `"review": { "status": "unreviewed" }` and `"needs-native-review"` in
   `editorialTags` if anyone other than a native-speaker reviewer wrote it. Never type Scripture from memory.
2. **Validate.** `npm run corpus:validate -- <file>` (a folder works too). Fix every `ERROR` using its `hint:` until
   the exit code is `0`. For each document the output ends with `would publish: yes|no` and one `missing:` line per
   unmet publication requirement; `no` is expected until step 4 (and, for Scripture, step 3).
3. **Scripture only: verify the wording.** `node scripts/verify-scripture.mjs` (see §3). Without a complete
   `scripture.verification` the review command refuses the document.
4. **Review.** A named reviewer checks the text (§4), then
   `npm run corpus:review -- <file> --by "<name>" [--status reviewed|approved|in-review|rejected] [--date YYYY-MM-DD] [--notes "…"]`.
   It writes the `review` block (including `contentSignature`, which wording the review covers), removes
   `needs-native-review` for `reviewed` / `approved`, changes no text, prints `review covers wording <sig8>` and
   `would publish: yes|no` with any remaining reasons. Without `--by` it refuses (exit `1`). Re-run
   `npm run corpus:validate -- <file>`: it must now say `would publish: yes`.
5. **Import.** In the app, **Settings → Content → Import texts**: choose the `.json` file(s), read the validation
   report, press **Import N document(s)**. (Or place the file in `data/corpus/<lang>/` — only for texts that are
   meant to ship with the app — and run `npm run corpus:check`.) The result per document is `created`, `updated`,
   `unchanged` or `rejected`; a batch with one error imports nothing.
6. **Publish.** Nothing to press: the gate sets `published` at import from the review, the rights and (Scripture)
   the verification. **Settings → Content → Texts on this device** shows Review, Published and, when not published,
   the reasons. Learners see the text as soon as it says Published `yes`.
7. **Revise.** Edit the same file (same `id`, same `source.id`) and repeat step 2: `corpus:validate` now warns
   `review-signature-mismatch` and says `would publish: no` — **a review covers the wording it was given for**, so
   a changed sentence needs a new review (step 4: `npm run corpus:review -- <file> --by "<name>"`, which records the
   new signature). Then import it again as in step 5. The result says `updated` and the content version goes up; the
   edited sentence gets a new id and the old one is retired, unchanged sentences keep their ids, audio and learner
   history. Until the new review is recorded the text is **unpublished** with the reason "the text changed after it was
   reviewed — record a new review"; learners lose it rather than read wording nobody checked. Edits that do not touch a
   sentence text (title, topics, English lines, spans, tags) keep the review valid. **Settings → Content** lists the
   version history of each text (`contentHistory`). Importing the same file again is a no-op.

---

## Proof: the importer is exercised, not just described

`npm run corpus:prove` runs every behaviour in this document on **synthetic development files**
([`data/synthetic/import-proof/`](../data/synthetic/import-proof/README.md): every id starts with `synthetic-`, every
`source.provenance` says "SYNTHETIC DEVELOPMENT MATERIAL for import testing — not learner content", nothing is ever
bundled) through the real importer (`importDocuments`, `validateBatch`, `applyReview`, `contentHistory`) and the real
`corpus:validate` / `corpus:review` commands, against an **isolated in-memory store**: never `data/corpus`, never
IndexedDB. A synthetic learner with real encounters (real GoLearn) and prepared audio (real GoListen, development
fixture) lives in that store, so the revision case shows what a revision keeps. It prints an expected-vs-actual table
and exits `1` on any mismatch; `npm run corpus:prove -- --write` regenerates
[`docs/import/PROOF.md`](import/PROOF.md) from the actual run (never hand-written). The same cases run in the test gate
(`test/ingest/prove.test.ts`).

What the table proves: malformed JSON, missing fields, duplicate ids, a mixed batch, bad spans (out of bounds,
overlapping, splitting a letter+accent or a Hindi conjunct) and a broken translation alignment are rejected with the
documented codes and an actionable hint, and a rejected batch writes **zero rows to any table**; an unchanged re-import
changes nothing; non-NFC text, NBSP, padded and double spaces, `« » — … ¿ ¡`, a Hindi danda and unspaced Thai are stored
byte for byte; a revision gives content version 2, retires exactly the changed sentence, keeps the unchanged sentences'
ids, tokens and analyses, leaves every learner encounter (version 1) in place, reports the current version in
`readingProgress`, marks the audio stale and regenerates only the new sentences; review and rights holds stay
unpublished with their reasons, `applyReview` publishes only the review hold, a reviewed text that is revised without a
new review is unpublished ("changed after it was reviewed") and publishes again after `applyReview`, and unverified or generated "Scripture"
(placeholder wording only) never publishes.

Found and fixed by the proof: a raw paragraph (`{"text": …}`) with leading or trailing whitespace imported without the
`edge-whitespace` warning that a padded declared sentence gets (the text was always stored exactly). It now warns at the
paragraph's `text` path.

---

## 1. The document (schema version 2)

One JSON file is one text. `schemaVersion` must be `2`; any other version is rejected with a message that tells
you what to do (`npm run corpus:migrate` converts the old bundled version-1 files). A `_comment` field anywhere
is ignored by the validator — the templates use it for inline explanations.

```jsonc
{
  "schemaVersion": 2,
  "id": "story-01",                 // stable; the text id is text:<lang>:<id>; [a-z0-9-], starts with a letter/digit
  "lang": "es",                     // es | sq | th | hi | de
  "locale": "es-HN",                // optional BCP-47; its language part must equal lang
  "title": "Mi historia",
  "contentType": "story",           // story | dialogue | nonfiction | scripture | transcript | testimony | generated-prep
  "corpus": { "id": "ci-es", "kind": "comprehensible-input", "title": "…" },   // kind: comprehensible-input | scripture | testimony
  "source": {
    "id": "src:es:story-01",        // unique per source
    "title": "…", "author": "…", "publisher": "…", "url": "…", "edition": "…",   // author…edition optional
    "attribution": "Written by … for the Go course.",   // the learner-visible credit line
    "provenance": "Where the words came from and what has NOT been checked.",
    "rights": "owner-authored",     // public-domain | licensed | owner-authored | generated | user-private | unverified
    "licenseNote": "…",             // optional
    "authorship": "human"           // human | public-domain | licensed | generated | learner
  },
  "review": { "status": "unreviewed" },   // see §4
  "difficulty": "A1",               // optional: A0 A1 A2 B1 B2 C1 native
  "topics": ["mission"],            // learner-facing topics / pathways (shown to learners)
  "editorialTags": ["needs-native-review"],   // editorial state (never shown as a pathway)
  "prepTargets": ["JHN.3.16"],      // verse refs (or text ids) this text helps prepare
  "speakers": { "A": "Ana" },       // optional; dialogue speaker ids → display names
  "generated": false,               // true for machine-generated text (badged in the reader); never for Scripture
  "scripture": { … },               // only for contentType "scripture", see §3
  "english": { "source": "…" },     // required when any English is supplied: where the English came from
  "sections": [ { "title": "…", "chapter": 3, "paragraphs": [ … ] } ]
}
```

`topics`, `editorialTags`, `prepTargets` and `generated` are required (an empty array / `false` is fine). Unknown
fields produce a warning (`unknown-field`), never an error.

### Sections, paragraphs, sentences

A paragraph is one of two forms.

**Declared sentences** — each entry is exactly one sentence (your declaration wins over the adapter's splitter):

```jsonc
{ "sentences": [
    { "id": "s1",                    // optional author id = the sentence's stable key
      "text": "Dios ama al mundo.",  // stored EXACTLY as written
      "english": "God loves the world.",
      "verseRefs": ["JHN.3.16"],     // Scripture: USFM refs; several allowed
      "speaker": "A",                // a key of "speakers"
      "spans": [ … ], "corrections": [ … ] } ],
  "separator": " " }                 // optional: joins the sentences into Paragraph.originalText (default " ")
```

**Raw paragraph** — the language adapter splits the text into sentences:

```jsonc
{ "text": "Hola. Gracias.", "english": ["Hello.", "Thank you."], "verseRefs": ["…"] }
```

If you give `english` for a raw paragraph it must have exactly one entry per sentence the adapter finds
(`english-count-mismatch` tells you how many). Thai has no full stop: the adapter breaks sentences on a newline,
two spaces, `ฯ` or terminal punctuation, or after a final particle followed by a space — a lone space is a clause
pause and never splits. For Thai, put one sentence per line (or declare sentences one by one).

### Exactness

`Sentence.text` and `Paragraph.originalText` are stored **exactly as supplied**: no Unicode normalisation, no
trimming, no whitespace changes, no added spaces (Thai included). Matching uses the derived `normalizedText` and
`Token.normalized`. Two invariants are asserted at import: `originalText.slice(paraStart, paraEnd) === sentence.text`
and `sentence.text.slice(token.start, token.end) === token.surface`. Text that is not NFC or has edge whitespace
(a declared sentence or a raw paragraph) imports with a warning (`not-nfc`, `edge-whitespace`); it is not altered.

### Sentence ids and keys

Every sentence has a **stable key**: your `id` if you gave one, otherwise a hash of its exact text
(`ids.sentenceKey`, with `~n` for the n-th repeat of identical text in the document). The sentence id is
`text:<lang>:<id>/s<key>`. Keys are what GoLearn encounters, GoListen audio and learner history attach to — see §6.
Give sentences an `id` when you expect to edit their wording and want the edit to stay "the same sentence"
in your source file.

### Author analysis: `spans` and `corrections`

Word-level analysis is optional. Both lists refer to **one word** by `start`/`end` UTF-16 offsets into that
sentence's text (`text.slice(start, end)` is the word); offsets must be the exact bounds of a token and lie on
character-cluster boundaries (never inside a letter with its marks, a conjunct or a decomposed accent).

* `spans`: `{start, end, lemma?, pos?, morph?, gloss?, confidence?, alternatives?}` — the author's analysis, stored as
  provenance `lexicon`, analyzer `import@2`, **replacing** the adapter's analysis of that word. `gloss` is the word's
  meaning in this sentence (it does not become the lemma's dictionary gloss). An omitted `confidence` means you are
  certain (stored as 1). `pos` is a UD-style tag: NOUN PROPN VERB AUX ADJ ADV PRON DET ADP CONJ SCONJ PART NUM INTJ
  CLF PUNCT X.
* `corrections`: `{start, end, lemma?, pos?, morph?, gloss?, by, at}` — a reviewed human analysis (`by` a person,
  `at` an ISO date). Stored as provenance `human`, superseding the machine/lexicon row. Removing a correction from
  the file later does **not** delete it: human corrections are never deleted by an import.

### Verse ↔ sentence

Many-to-many: a sentence may carry several `verseRefs` (`["JHN.3.16", "JHN.3.17"]`) and several sentences may
share one. Within a book the references must follow chapter and verse order; a section's `chapter` must match the
chapter of the references inside it. Verse numbers are metadata only — never put `[16]`, `¹⁶` or `<sup>` in `text`.

---

## 2. Validate

```
npm run corpus:validate -- data/corpus/es/story-01.json
npm run corpus:validate -- data/corpus          # a directory is walked recursively
```

Prints, per document, every issue as `path: message [code]` plus a `hint:` saying what to do, the analysis
coverage (share of words the adapter can analyse, and which forms it cannot) and the **publication requirements**:

```
…/story-01.json  [story-01]  0 error(s), 0 warning(s); analysis coverage 100.0% (59/59 words)
        would publish: no
        missing: review status is "unreviewed" — machine-drafted text needs a native-speaker review (…)
```

`would publish: yes` when nothing is missing, otherwise `no` with one `missing:` line per unmet requirement (the same
sentences as `Text.unpublishedReasons`; a document with validation errors also says it would not be imported).
Exit code `1` if any error is found (or nothing was given), `0` otherwise. Warnings and `would publish: no` never
fail the command.

Each issue has `{path, code, message, hint, severity}` (`severity` is `error` or `warning`). The same function
runs in the app's importer (`validateDocument` / `validateBatch` in `src/ingest`).

| Code | Sev. | Meaning and fix |
|---|---|---|
| `not-an-object` | error | The file is not one JSON object. |
| `unsupported-schema-version` | error | Not `schemaVersion: 2`. Convert with `npm run corpus:migrate` or start from a template. |
| `missing-field` | error | A required field is absent (`review`, `topics`, `generated`, `source.attribution`, `sections`, …). |
| `invalid-value` | error | A field has the wrong type or an unknown enum value (`lang`, `contentType`, `rights`, `pos`, `confidence`, …). |
| `invalid-id` | error | Document id or sentence id has forbidden characters. |
| `unknown-field` | warning | A field the importer ignores (typo?). Prefix with `_` to silence. |
| `duplicate-document-id` | error | Two documents in one batch share `lang` + `id`. |
| `duplicate-sentence-id` | error | Two sentences in one document share an `id`. |
| `text-id-conflict` | error | The text id already exists in the store under another `source.id`. Choose another id, or reuse the source id to update it. |
| `language-mismatch` | error* | Fewer than half of the letters are in the script of `lang`. (*a warning for testimony texts) |
| `locale-mismatch` | error | `locale` does not start with `lang`. |
| `empty-sentence` | error | A sentence or paragraph is blank. |
| `no-sentences` | error | A paragraph or the document has no sentences. |
| `english-count-mismatch` | error | A raw paragraph's `english` has a different length from the adapter's sentence count. |
| `unknown-speaker` | error | `speaker` is not declared in `speakers`. |
| `span-empty` · `span-out-of-bounds` · `span-overlap` | error | Bad span/correction offsets (empty, outside the sentence, overlapping another). |
| `span-not-grapheme-boundary` | error | A span starts or ends inside a character cluster. |
| `span-not-on-token` | error | A span is not exactly one word; the hint lists the words and their offsets. |
| `invalid-verse-ref` | error | Not a USFM reference (`BOOK.chapter.verse`, e.g. `JHN.3.16`) or unknown book code. |
| `verse-order` | error | References out of chapter/verse order within a book. |
| `verse-chapter-mismatch` | error | A reference's chapter differs from its section's `chapter`. |
| `missing-verse-refs` | error | A Scripture sentence has no `verseRefs`. |
| `verse-marker-in-text` | error | `[16]`, `¹⁶` or `<sup>` inside Scripture text. |
| `scripture-translation-missing` · `scripture-edition-missing` | error | The `scripture` block lacks translation identity / edition. |
| `scripture-book-invalid` · `scripture-chapter-invalid` | error | `scripture.book` is not a USFM code / `chapter` is not a positive integer. |
| `scripture-corpus` | error | A Scripture text must use a corpus of `kind: "scripture"`. |
| `scripture-generated` | error | Scripture is never generated (`generated`, rights or authorship). |
| `invalid-verification` | error | `scripture.verification` is incomplete (`against`, `checkedAt`, `method`, `by`). |
| `missing-provenance` | error | `source.provenance` is empty. |
| `unverified-without-note` | error | Rights `unverified` but no note saying the text must be replaced / verified. |
| `review-missing-reviewer` | error | `review.status` is `reviewed`/`approved` with no `reviewedBy`. Reviews are never anonymous. |
| `review-signature-mismatch` | warning | `review.contentSignature` differs from the current wording: the text is unpublished until it is reviewed again (`npm run corpus:review`). |
| `not-nfc` · `edge-whitespace` | warning | The text is stored exactly as supplied anyway. |
| `adapter-would-split` | warning | The adapter would split a declared sentence; your declaration wins. |
| `low-analysis-coverage` | warning | Under 60 % of words can be analysed: the text reads fine, but word help will be missing. Add `spans` or extend the lexicon. |

---

## 3. Scripture

A Scripture document needs, beyond the above, a `scripture` block:

```jsonc
"scripture": {
  "translationId": "spaRV1909",        // exact translation identity ("unidentified" only for a sample of unknown origin)
  "translationName": "Reina-Valera 1909",   // → Text.version
  "edition": "1909 revision",
  "book": "1JN", "chapter": 1,         // USFM code + first chapter; every sentence's verseRefs carry the real reference
  "verification": {                    // how the exact wording was established; absent ⇒ never published
    "against": "eBible.org spaRV1909", "url": "https://ebible.org/spaRV1909",
    "checkedAt": "2026-09-30", "method": "byte-comparison",   // byte-comparison | human-proofread | publisher-file
    "by": "scripts/verify-scripture.mjs"
  }
}
```

plus `corpus.kind: "scripture"`, `generated: false`, rights actually established (`public-domain` or `licensed`),
`verseRefs` on every sentence, and a `provenance` saying exactly how the wording was checked. **Never type verse
text from memory** — the bundled samples that were typed from memory turned out to be wrong in every Spanish verse.

### Verifying the wording

`node scripts/verify-scripture.mjs` fetches the published source (eBible.org pages for the translations listed in
its `SOURCES`), extracts each verse, compares it **byte for byte** (after NFC) with the bundled document and writes
the result to `data/verified/scripture.json` (verses, source URLs, rights statement, `checkedAt`, `by`). Add
`--fix` to replace differing wording with the source wording. To bring a new translation in: add an entry to
`SOURCES` in the script (language, document path, `translationId`, name, base URL), run it, then copy the
verification details into the document's `scripture.verification` and set `review` to `reviewed` with
`reviewedBy: "scripts/verify-scripture.mjs"` and `reviewedAt` = the `checkedAt` date. `npm run corpus:check`
re-confirms that the bundled es / de text is byte-identical to `data/verified/scripture.json`. A translation whose
rights the source does not state stays `unverified` (and unpublished).

---

## 4. Review

A text is reviewed by a **named person** (or a verification tool) and the review is recorded in the file:

```json
"review": { "status": "reviewed", "reviewedBy": "Ana Ruiz (native speaker)", "reviewedAt": "2026-02-01",
            "contentSignature": "e04a9e3c545c99f8",
            "notes": "Checked wording, glosses and sentence breaks; fixed two phrasings." }
```

`status`: `unreviewed` (default), `in-review`, `reviewed`, `approved`, `rejected`. Only `reviewed` / `approved`
with a `reviewedBy` count. The importer never invents a review; a reviewed status with no reviewer is a
validation error.

**A review covers the wording it was given for.** `contentSignature` (optional field of schema version 2, written by
`applyReview` / `npm run corpus:review`, never by hand) is a hash of the document's ordered exact sentence texts (a
declared sentence's `text`; a raw paragraph's `text`; `contentSignatureOf(doc)`). Title, topics, tags, English lines,
spans, corrections and the review block itself are not part of it; any change to a sentence text, the order, an
addition or a removal is. For a non-Scripture text the review counts only if the signature is present and equals the
current wording; otherwise the text is unpublished ("the text changed after it was reviewed — record a new review" /
"the review does not say which wording it covers — record it with npm run corpus:review"), and the validator warns
`review-signature-mismatch` when a recorded signature differs. **Scripture is exempt**: its wording is bound by
`scripture.verification` and the byte-for-byte check (`verify-scripture.mjs`, `corpus:check`), not by the signature.
Learner testimonies (`testimonyDocument`) set the signature of the sentences the learner accepted.

What a reviewer checks:

* **Wording**: natural, correct, appropriate for the level (for machine-drafted texts this is the whole point —
  the drafter was not a native speaker).
* **English lines**: accurate and from the declared `english.source`.
* **Sentence breaks**: each declared sentence is one sentence; Thai one per line; dialogue speakers right.
* **Analysis**: spot-check a few word glosses; add `corrections` for wrong ones.
* **Provenance and rights**: `source.provenance`, `rights`, `attribution` are true; `generated` is set honestly.
* **Scripture**: the wording matches the verified source (run the verifier) and the translation/edition are right.

Record the review with the command (it edits only `review` and `editorialTags`, never a text):

```
npm run corpus:review -- <file> --by "Ana Ruiz (native speaker)" [--status reviewed|approved|in-review|rejected] [--date YYYY-MM-DD] [--notes "…"]
```

* `--by` is required (exit `1` without it). `--status` defaults to `reviewed`, `--date` to today.
* `reviewed` / `approved` remove `needs-native-review` from `editorialTags`; `in-review` / `rejected` record who
  and when but keep the tag, and the text stays unpublished.
* Scripture without a complete `scripture.verification` is refused (verification is a separate step, §3).
* The command refuses to write a file that would not validate afterwards (it prints the errors).
* It prints `would publish: yes|no` and, if no, each remaining reason (for example unestablished rights).
* `machine-drafted` and `generated` are **not** touched: edit them by hand once they are no longer true. A generated
  text stays badged in the reader even when published.
* In code: `applyReview(doc, { by, status?, date?, notes? })` from `src/ingest` — pure, returns the new document
  (or the refusals) and the publication decision; the CLI is a thin wrapper.

Then import the file (§6).

---

## 5. Publish: the gate

`computePublished(doc)` (used at every import) sets `Text.published` and `Text.unpublishedReasons`:

```
published  ⇔  review.status ∈ {reviewed, approved} with a named reviewedBy
           ∧  non-Scripture: review.contentSignature equals the signature of the current wording
           ∧  rights established (not "unverified")
           ∧  Scripture only: translationId + edition + a complete verification, and never generated
```

Every failed condition adds one actionable sentence to `unpublishedReasons`, shown by `corpus:validate`, by
`corpus:check` and (in preview mode) by the app. A `generated` text is publishable once reviewed; the reader keeps
badging it. The bundled corpus today: es and de Scripture are verified and published; every story and dialogue is
an unreviewed machine draft (unpublished); sq, th and hi Scripture are unverified samples (unpublished).

---

## 6. Import and re-import

**Bundled folder.** Put the file in `data/corpus/<lang>/<name>.json`. `loadBundledCorpus()` (Vite glob) finds it,
and the app bootstrap imports the whole folder through `importDocuments`. `npm run corpus:check` validates the
bundled corpus as a batch, imports it into a throwaway store twice (the second import must change nothing),
prints every text's publication status and checks the verified Scripture.

**In-app importer.** Settings → Content: choose one or more `.json` files → the validation report (paths and hints)
→ import. The same validator and importer run.

**In code.** `importDocuments(store, registry, docs, { clock? }) → ImportReport`:
per document `{ id, action: 'created' | 'updated' | 'unchanged' | 'rejected', contentVersion, published,
unpublishedReasons, issues, analysisCoverage, sentencesAdded, sentencesRetired }`.
`ingestDocument` / `ingestAll` are thin wrappers that throw `CorpusValidationError` (with `.issues`) when invalid.

Guarantees:

* **Validate everything first.** One document with an error ⇒ **nothing** is imported (every document is reported
  `rejected`; the valid ones carry a note saying the batch is all-or-nothing).
* **Atomic.** All rows are built in memory, then written in one `store.transaction` with the `Text` row **last**,
  so a failed import never leaves a published partial text. Rows left by a failed attempt are cleaned on the next
  import.
* **Repeatable.** Re-importing an unchanged document writes nothing and changes no version (a content signature is
  kept in `meta`). Running an import three times gives identical rows and ids.
* **Versioned.** Edit a sentence's wording and re-import: the changed sentence gets a **new key and id** and the old
  one is **retired** (`retiredInVersion`; its tokens and analyses stay so learner history remains interpretable, its
  English rescue and phrase/pattern occurrences are removed); `Text.contentVersion` bumps; **unchanged sentences
  keep their ids, tokens, human corrections and — through GoListen's text-hash cache keys — their audio**;
  encounters and events are never touched. Reordering sentences also bumps the version (audio manifests are
  ordered). Reverting an edit revives the retired sentence under its original id. A sentence with an author `id`
  keeps that id family: the edited wording becomes `<id>@<contentVersion>`. Rows written under contract v1 (no
  `key`) are retired and replaced on their first re-import. Live sentences are those without `retiredInVersion`.
* **Revision history.** Every import that creates a text or bumps its content version appends one
  `TransformationRecord` (`tool: 'ingest@2'`) to `Text.transformations`, e.g.
  `content version 1 → 2: added [6edcc340ec00], retired [eda7c04aa8b7]; 8 analysis row(s) written`
  (`revived [...]` for retired sentences that came back; long key lists are cut at 20). `contentHistory(text)`
  (from `src/ingest`) returns `Array<{ version, at, summary }>`, oldest first, for the UI. Retired sentences keep
  their tokens and analyses; encounters and events are never touched; re-importing the original after a revision
  revives the original sentence ids (no new ids) while the version still advances.
* **Metadata-only edits** (title, topics, review, rights, English text, verse refs, spans) update the rows but do
  not bump the content version.
* **Other sources are protected.** An id that exists under another `source.id` is `text-id-conflict`.

### Converting version 1 files

`npm run corpus:migrate` converts the bundled version-1 documents in place (already-converted files are left alone;
nothing is written unless every converted document validates). It reads the Scripture verification from
`data/verified/scripture.json` and attaches it only when the bundled wording equals the verified wording.

---

## 7. For developers

* **Testimony revisions.** GoTell materializes each accepted revision as a private Text:
  ```ts
  import { ingestDocument, testimonyDocument } from '../ingest';
  await ingestDocument(store, adapters, testimonyDocument({ userId, lang, n, sentences, acceptedAt }), { clock });
  ```
  The document is `contentType: 'testimony'`, `corpus.kind: 'testimony'`, `rights: 'user-private'`,
  `authorship: 'learner'`, id `testimony-<user>-r<n>` (`testimonyDocumentId`), review `approved` by
  `learner (author)` (the learner accepted their own writing; no editorial review applies), so it is published but
  excluded from lists by `kind`. Sentences are stored exactly as written; a mixed-language draft only warns.
* **Coverage.** `analysisCoverage(tokens, analyses)` (from `src/adapters`, re-exported by `src/ingest`) returns
  `{ words, analysed, coverage, unanalysed }`. Adapters' `support` declarations (shown in Settings → Language
  support) say what each language can honestly do; lemmatization is `seed-only` everywhere — the lexicons cover the
  seed corpus only, so supplied texts will have unanalysed words until `spans` or lexicon entries are added.
* **Files.** `src/ingest/{format,publish,plan,import,review,history,migrate,testimony,index}.ts` · `scripts/corpus-*.mts` ·
  `test/ingest/`.

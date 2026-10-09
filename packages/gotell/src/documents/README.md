# GoTell documents, versions, evidence and privacy

Code: `src/documents/` (stores, versions, codec, text helpers), `src/evidence/` (events), `src/privacy/` (statement, export,
wipe, remote gate). Tests: `test/gotell-documents/`. Imports only the repository contract, `repository-sync` and the
`repository-service` API client (types). Never `src/*`, never GoReview.

## Storage layout

One draft = one `PrivateDocument` in the learner's own account.

| Field | Value |
|---|---|
| `docId` | the `draftId` (a conflict copy is `<draftId>:conflict:<deviceId>:<revision>`) |
| `kind` | `draft`; `testimony` when `record.mode === 'testimony'` |
| `title` | `record.title` (cut at 300 characters; the record keeps the full title) |
| `body` | the JSON of the `DraftRecord`, keys in a fixed order (`encodeRecord`): `draftId, languageId, varietyId?, mode, promptId?, title, text, versions[], assistance[], createdAt, updatedAt` |
| `revision` | server-side, monotonic; `save(record, expectedRevision)` is optimistic |

`load` parses and validates the body leniently (`decodeBody`). A body that is not JSON, or JSON that is not a record, from an
older client becomes `{ text: body, versions: [], assistance: [] }` with the id, language and title of the document. A
record with missing fields opens with defaults. The document id always wins over a `draftId` inside the body.

On a revision conflict `save` returns `{ ok: false, current: { record, revision } }` (with `deleted: true` when the other
side deleted the draft). Any other failure (offline, refused) throws a `DraftStoreError`.

Stores:

- `createDraftStore({ api, identity, now? })`: the remote store above.
- `createLocalDraftStore(area, { identity, now? })`: the offline store, on the sync package's dirty-tracked local documents
  (`doc:<id>` rows). Several saves before a push coalesce into one pending revision. A draft the server never saw is purged
  outright on removal. Because it uses the sync package's rows, `createSyncClient`'s document reconcile sees the same drafts.
- `createSyncingDraftStore({ local, remote, now? })`: saves locally first, then pushes. `pendingPush()` lists unsent
  drafts; `push()`, `pull()` and `sync()` do the rest; `conflicts()` lists conflicts resolved by this instance.

## Conflict copies (never a silent loss)

The syncing store applies `mergeDocument` from `repository-sync`:

- the **remote keeps the docId**; the **local text becomes a new draft** `<draftId>:conflict:<deviceId>:<revision>` titled
  "... (conflict copy from <device>)", pushed like any new draft and synced to every device; the learner merges by hand.
  `save` returns `{ ok: false, current: <the remote record> }` so the editor can show what the docId now holds.
- the same text on both sides is not a conflict (the remote is taken, no copy);
- a local deletion against text written elsewhere after the last sync: the text wins, the deletion is dropped;
- local edits against a remote deletion: the remote (deleted) wins the docId, the local text is kept as a copy;
- `pull()` fetches drafts that are new or newer on the server, and drops clean local drafts that were deleted elsewhere.

## Versions

`newVersion(record, text, judge, deviceId, now, note?)` appends an immutable `DraftVersion` (id `v<n>-<device hash>-<text hash>`),
splits the text into sentences (`splitSentences`), asks `judge(sentenceText, prior, index)` for each sentence's authorship and
assistance levels, and resets `record.assistance` to `[]`. The input record is never modified and earlier versions are
copied, never edited. `prior` is the identical sentence of the previous version (so a carried-over sentence keeps its
authorship and timestamp) or else the sentence at the same position (a revision). `judgeFromAssistance(steps)` is a
conservative default; callers that know which help was shown for which sentence should pass their own judge.

`diffVersions(a, b)` aligns sentences with an LCS and reports `added | removed | changed | unchanged` (removed and added
sentences between matches pair up as `changed`). `restoreVersion(record, versionId, deviceId, now)` appends a NEW version
with the old text and the old sentences' authorship; history is never deleted.

## Export formats

`exportDraft(record, 'json' | 'text' | 'markdown')`:

- `json`: the whole record, every version included;
- `text`: `Title / Language: sq (variety) / Date: YYYY-MM-DD / Versions: n`, a blank line, the current text;
- `markdown`: `# Title`, an italic line with the same facts, the current text.

`exportFileName(record, format)` gives `<title-slug>.json | .md | .txt`. `exportLearnerWriting(api)` exports every private
document of the learner (all kinds, conflict copies included, deleted ones excluded) as one JSON bundle
(`gotell-writing-export`) and one text bundle. It never reads or prints the session token.

## Evidence mapping

`writingEvidence(record, version, identity, now, opts?)` returns `{ events, summary }`. All events are
`producer.app: 'gopractice-tell'`, pass `validateEvent`, and carry no sentence text (sentences are identified by an FNV-1a
`sentenceKey`; the draft by `draftId`).

| Event | Payload | Notes |
|---|---|---|
| `DraftSaved` | `{ draftId, versionId, sentences, wordCount }` | `evidence.quality: 'none'`; dedupe `tell:saved:<draft>:<version>` |
| `ProductionRecorded` (per sentence) | `{ mode, assisted, assistance[], usedCorrectly, authorship, draftId, sentenceKey, wordCount }` | `subject: { itemIds ≤ 24, sentenceKey, draftId, sourceRef: writing }`; dedupe `tell:production:<draft>:<key>:<authorship>` (an unchanged sentence is stored once, however many versions repeat it) |
| `CorrectionAccepted` / `CorrectionRejected` | `{ correctionId, issueIds, categories, meaningChange? }` | `correctionOf` = the earlier event id when known; quality `none` |

| Input | Output |
|---|---|
| `mode` guided / missionary / testimony | `'guided'` |
| `mode` free / narrative | `'free'` |
| `mode` targeted | `'retrieval'` |
| assistance level 1, 2 | `'hint'` |
| level 3, 5 | `'example'` |
| level 4 | `'correction'` |
| level 6 | `'translation'` |
| authorship `independent`, `reproduced-later` | `assisted: false` (unless any help is listed) |
| authorship `after-hint`, `revised-after-feedback` | `assisted: true` |
| authorship `copied-from-model`, `ai-generated` | `assisted: true`, `assistance: ['translation']`, `usedCorrectly: 'unjudged'`, `evidence.quality: 'none'`, no `itemIds`: history, never production credit |

`usedCorrectly` is `'unjudged'` unless the matching sentence of `opts.analysis` has no issues AND the checker covers it
(default: status `verified` or `high-confidence` and an empty `checkerCoverage` line; override with `opts.checkerCovers`), and
then only for `independent`, `after-hint` or `reproduced-later` sentences. An accepted correction never makes it `true`.
A stale analysis (different text) is ignored. `summary` says what was claimed, e.g. "3 sentences recorded as independent,
judged unjudged." and "1 sentence copied from a model: no production credit."

## Privacy rules

- Text lives in the private document and nowhere else: not in an event, a log line, a diagnostic or an export of the learning
  record. `redact(text)` gives lengths only.
- `privacyStatement()` says what is stored where, what is never sent, that team membership gives no access, and what the
  learner can do (export, delete, forget this device).
- `deleteDraft(store, id)` removes the document (the service blanks the body). A conflict copy is its own draft and is
  deleted on its own.
- `forgetDevice(area)` removes `doc:`, `queue:`, `rejected:`, `quarantine:` rows and the sync cursors from this device; other
  keys and the account are untouched.
- `RemoteAssistantGate` / `gateRemoteAssistant(inner, consent, log?)` read `consent.remoteAssistance()` on every call. Without
  consent `propose` throws `RemoteAssistanceNotConsented` before anything is passed on. The optional `log` receives lengths
  and outcomes only.

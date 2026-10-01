# Worked example: import → validate → review → publish → revise

This walks one text through the whole workflow on a **copy** of the bundled Spanish story. Everything happens in a
temporary folder. **Do not review, edit or add anything under `data/corpus/`**: the bundled stories are machine-drafted
and must stay unreviewed until a real native speaker has read them. The reviewer name below ("Ana Ruiz") is a
placeholder for that exercise only.

Run every command from the project root (`C:\Users\CJWal\dev\go-v0`). Paths are shown for a POSIX shell; on Windows
use any temporary folder you like. Output lines are the ones that matter; `…` marks lines left out.

## 0. Make a copy under its own id

```
EX=$(mktemp -d)
sed -e 's/"id": "story-01"/"id": "example-story"/' -e 's/"id": "src:es:story-01"/"id": "src:es:example-story"/'   data/corpus/es/story-01.json > "$EX/story-01.json"
```

The copy gets its own text id (`text:es:example-story`) and source id so that it can never collide with the bundled
`story-01`, which the app re-imports from `data/corpus` at every start. On Windows, copy the file to a temporary folder
and change those two `id` values (line 3 and line 13) in an editor.

## 1. Validate: see what is missing

```
npm run corpus:validate -- "$EX/story-01.json"
```

```
…/story-01.json  [example-story]  0 error(s), 0 warning(s); analysis coverage 100.0% (59/59 words)
        would publish: no
        missing: review status is "unreviewed" — machine-drafted text needs a native-speaker review (set review.status to "reviewed" with reviewedBy and reviewedAt)
corpus:validate - 1 document(s), 0 error(s), 0 warning(s)
```

Exit code `0` (no errors). `would publish: no` is a *requirement report*, not a failure: the text is valid, it simply
has not been reviewed yet. Each `missing:` line is one unmet publication requirement.

## 2. Review: record who checked it

A review needs a name. Without `--by` the command refuses and changes nothing:

```
npm run corpus:review -- "$EX/story-01.json"
```

```
corpus:review - refused …/story-01.json
  REFUSED a review needs a named reviewer [missing-reviewer]
        hint: Pass --by "<name>" (a person, or a verification tool). Reviews are never anonymous and never invented.
```

Exit code `1`. With a reviewer (after a real review of wording, English lines, sentence breaks and glosses, see
`docs/IMPORT.md` §4):

```
npm run corpus:review -- "$EX/story-01.json" --by "Ana Ruiz (native speaker)" --date 2026-10-01 --notes "Checked wording, glosses and sentence breaks."
```

```
corpus:review - …/story-01.json  [example-story]
  review: unreviewed -> reviewed by Ana Ruiz (native speaker) on 2026-10-01 - Checked wording, glosses and sentence breaks.
  removed editorial tag: needs-native-review
  text untouched: sections, sentences and every character of text are byte-identical (10 sentence block(s)); file updated
  note: the text stays marked machine-drafted / generated; the reader keeps badging it
  would publish: yes
next: npm run corpus:validate -- …/story-01.json   then import it (see docs/IMPORT.md)
```

Exit code `0`. Apart from the two ids you changed in step 0, the file's only differences from the bundled story are the
`review` block and the removed `needs-native-review` tag:

```
diff data/corpus/es/story-01.json "$EX/story-01.json"
```

```
3c3
<   "id": "story-01",
---
>   "id": "example-story",
13c13
<     "id": "src:es:story-01",
---
>     "id": "src:es:example-story",
23,24c23,26
<     "status": "unreviewed",
<     "notes": "Drafted by an AI assistant; awaiting native-speaker review."
---
>     "status": "reviewed",
>     "reviewedBy": "Ana Ruiz (native speaker)",
>     "reviewedAt": "2026-10-01",
>     "notes": "Checked wording, glosses and sentence breaks."
32d33
<     "needs-native-review",
```

Other statuses: `--status approved` (same effect as reviewed), `--status in-review` or `rejected` (recorded, but the text
stays unpublished and keeps `needs-native-review`). Scripture is refused until `scripture.verification` exists
(`node scripts/verify-scripture.mjs`); verification is a separate step from review.

## 3. Validate again: the publication requirements are met

```
npm run corpus:validate -- "$EX/story-01.json"
```

```
…/story-01.json  [example-story]  0 error(s), 0 warning(s); analysis coverage 100.0% (59/59 words)
        would publish: yes
corpus:validate - 1 document(s), 0 error(s), 0 warning(s)
```

## 4. Import and publish (in the app)

Start the app (`npm run dev`), open **Settings → Content**, under **Import texts** choose `$EX/story-01.json`, read the
validation report, then press **Import 1 document**. The import result says `created`, version 1, and **Texts on this
device** now lists *Mi historia* with Review `reviewed`, Published `yes`. There is no separate publish action: the gate
computes it (`published ⇔ named reviewer ∧ rights established ∧ Scripture verified`). Turn *Preview unreviewed content*
off to see what a learner sees: the text is in the library.

> The copy has its own id (step 0), so it sits beside the bundled `story-01` instead of replacing it. Texts imported
> through the app live in this browser's storage only; nothing is written to `data/corpus`.

## 5. Revise: edit one sentence and import again

Edit any sentence's `text` in `$EX/story-01.json`, run `npm run corpus:validate` on it, and import it again from
**Settings → Content**. The result says `updated`, version 2, `1 sentence(s) added, 1 retired`. The edited sentence has a
new key and id; the old one is retired (kept with its tokens and analyses); unchanged sentences keep their ids, their
audio and every learner encounter. Changing only metadata (title, topics, review, English lines) updates the text but
does not bump the version. Reverting the edit and importing once more revives the original sentence under its original
id (version 3).

The same three imports without the app, as a throwaway script saved next to the copy (replace the project path with
your checkout's absolute path):

```ts
// $EX/revise.mts  -  run:  npx vite-node "$EX/revise.mts" "$EX/story-01.json"
import fs from 'node:fs';
import { createMemoryStore } from 'C:/Users/CJWal/dev/go-v0/src/core';
import { createAdapterRegistry } from 'C:/Users/CJWal/dev/go-v0/src/adapters';
import { contentHistory, importDocuments } from 'C:/Users/CJWal/dev/go-v0/src/ingest';

const registry = createAdapterRegistry();
const store = createMemoryStore();
const doc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const show = (label: string, r: Awaited<ReturnType<typeof importDocuments>>) => {
  const d = r.documents[0];
  console.log(`${label}: ${d.action}, contentVersion ${d.contentVersion}, +${d.sentencesAdded}/-${d.sentencesRetired} sentence(s), published: ${d.published}`);
};
show('import   ', await importDocuments(store, registry, [doc]));
const edited = structuredClone(doc);
const first = edited.sections[0].paragraphs[0].sentences[0];
first.text = first.text.replace(/\.$/, '') + ' hoy.';
show('re-import', await importDocuments(store, registry, [edited]));
show('revert   ', await importDocuments(store, registry, [doc]));
for (const h of contentHistory((await store.texts.get(`text:${doc.lang}:${doc.id}`))!)) console.log(`v${h.version}  ${h.at}  ${h.summary}`);
```

```
import   : created, contentVersion 1, +10/-0 sentence(s), published: true
re-import: updated, contentVersion 2, +1/-1 sentence(s), published: true
revert   : updated, contentVersion 3, +1/-1 sentence(s), published: true
v1  2026-10-01T02:14:07.746Z  content version 1 (created): 10 sentence(s) [eda7c04aa8b7, c6bfb015988b, …]; 59 analysis row(s) written
v2  2026-10-01T02:14:07.755Z  content version 1 → 2: added [6edcc340ec00], retired [eda7c04aa8b7]; 8 analysis row(s) written
v3  2026-10-01T02:14:07.759Z  content version 2 → 3: revived [eda7c04aa8b7], retired [6edcc340ec00]; 0 analysis row(s) written
```

`v3` shows the original sentence key `eda7c04aa8b7` coming back (`revived`): no new sentence id was minted by the
third import. The timestamps will differ on your machine. The same history is what **Settings → Content** shows per text
(`contentHistory(text)`).

## 6. Clean up

```
rm -r "$EX"
git status --short data/corpus      # prints nothing: the bundled corpus was never touched
```

# GoLearn Active: the dictionary confirms the words the analyser does not know

Status: CONTRACT + BUILD PLAN (2026-10-27). Owner's report: on a German page (marxists.org, the Manifest) the extension
marks about half the words; ordinary words such as *bisherigen*, *Sklave*, *Patrizier*, *Kampf*, *Untergang* get nothing.

## Why (verified)

`packages/golearn-extension/src/active/scan.ts:128` marks a word only when the analyser's best reading is confirmed:
`known = !!best?.lemma && !best.unconfirmed && best.confidence >= 0.5`. The German analyser is the full sentence layer
over the **hand-written word list only** (~2,900 machine-drafted entries plus closed classes; `src/adapters/de.ts:106-111`,
`src/adapters/german/context-base.ts`). A word outside that list gets at best an `unconfirmed` guess, which the gate
rejects, so the extension treats it exactly like a name or a foreign word: no mark, no lemma id, no encounter
(`src/content/active.ts:254`, decided 2026-10-25 so that a Hebrew-and-English page read as German is not underlined
everywhere). The Wiktionary-derived dictionary (kaikki; 808k Spanish entries, similar German) is consulted only for the
card on click (`src/background/gloss.ts`), never while scanning. The packaged extension ships no German dictionary
(`dist/app/dict` holds `sq` only, by design: `test/audit/rights.dist.test.ts`).

## The fix (decided by the coordinator)

A word the analyser cannot confirm is **asked of the dictionary** before it is given up on. The dictionary's own shards
are too heavy for that (German: 512 shards of ~350 KB; a screen of text would touch a hundred of them), so each language
gets a **slim forms index**: form → lemma and part of speech, nothing else, sharded small, served beside the dictionary
(`dict/<lang>/forms/`), fetched by the extension's background through the same location order as the card gloss
(configured service → the extension's own `app/` → the hosted fallback) and cached like the other shards. A form the
dictionary has becomes `known` with ids `[form:<lang>:<normalized>, lemma:<lang>:<lemma>[:<pos>]]`; a form it lacks stays
skipped (names, other languages, typos keep today's behaviour). When no forms index can be reached, scanning behaves
exactly as today.

## Package P1: the forms index (`scripts/build-forms-index.mts`, `src/dict/forms.ts`, `src/dict/publish-node.ts`, `public/dict/<lang>/forms/**`, `test/dict/forms*.test.ts`, one `package.json` script line `dict:build-forms`)

- Build (model: `scripts/build-reverse-gloss.mts` + `src/dict/reverse.ts`, which stream `manifest.shardFiles` with
  `parseShard`/`expandEntry`): for every entry key `form` of every shard: if the entry has form-of rows (`m`), the row is
  `[lemma, pos]` for each distinct lemma; otherwise the entry is its own lemma: row `[written ?? form, pos]`. Dedupe rows
  per form (lemma+pos), keep at most 6. Compact shape: `{ [form]: Array<[lemma: string, pos: string | null]> }`. Keys are
  the adapter-normalized forms exactly as the main shards key them (do not re-normalize). Bucket by `bucketOf(form)`
  (src/dict/format.ts); choose `buckets` per language so that a shard is ≤ ~300 KB raw (de/es likely 128, small
  languages 16–32); file names `f-<hex>.json`; `manifest.json` `{ version: 1, lang, buckets, forms, lemmas, shardFiles,
  builtFrom }`. Build for every language that has `public/dict/<lang>/manifest.json` (de, es, hi, la, sq, th); report
  size, time, forms per language. Memory-bounded like the reverse build (es peaked at 150 MB there).
- Runtime `src/dict/forms.ts` (browser-safe, no fs): constants `FORMS_DIR = 'forms'`, `FORMS_MANIFEST`,
  `formsShardFile(bucket)`, `parseFormsManifest`, `parseFormsShard`; `createFormsSource(lang, { fetch?, base? })` →
  `{ lookupForms(forms: string[]): Promise<Map<string, Array<{ lemma: string; pos?: string }>>> }` that groups the forms
  by bucket, fetches each needed shard once (LRU of 16), returns only the forms it found, returns an empty Map (never
  throws) when the manifest is missing (404), remembers a 404 manifest, retries transient failures on the next call.
- `publish-node.ts`: carry `<lang>/forms/f-*.json` then `<lang>/forms/manifest.json`, only when the folder exists, same
  error/warn rules and summary part as the reverse index (`forms N · M shards`); `--prune` removes stale `f-*.json`.
- Tests: fixture round trip under the OS temp dir (outside OneDrive); bucket grouping fetches each shard once; LRU;
  404 → empty Map; the real de index (skipIf absent, message naming `npm run dict:build-forms`): `bisherigen` →
  lemma `bisherig`; `Klassenkämpfen` → `Klassenkampf`; `Sklave` → `Sklave`; `versteckten` → includes `verstecken` or
  `versteckt`; `kämpfenden` → `kämpfend` or `kämpfen`; `ununterbrochenen` → `ununterbrochen`; and `xyzzy` absent. Report
  which of these the data cannot give, rather than forcing them. Publish tests beside the reverse ones.

## Package P2: the extension (`packages/golearn-extension/src/**`, `test/extension/**`, a section in `docs/ecosystem/GOLEARN-ACTIVE-DESIGN.md`)

- Protocol: a content → background request `{ type: 'golearn:confirm-forms', languageId, forms: string[] }` (normalized
  forms, ≤ 500 per message; the content side splits larger sets) answered with
  `{ forms: Record<string, [lemma: string, pos: string | null] | null>, source?: DictionarySource, reason?: 'no-pack' |
  'no-asset-base' | 'offline' | 'no-index' }`: `null` for a form the index lacks; the first row of the index is the one
  returned (P1 keeps rows in the dictionary's order). Follow the existing message conventions in `src/protocol.ts` and
  the background dispatcher.
- Background: `src/background/forms.ts` — locate the dictionary base exactly as `gloss.ts` does (reuse its `locate` /
  candidates; the forms index lives at `${base}/${manifest.lexical.dictionary.baseUrl}/forms/`), fetch through the same
  caching `shardFetch` (so shards persist in the storage area and are shared with the gloss), build a `createFormsSource`
  per language+base with a fetch bound to that, answer in one round trip. A language whose pack declares no dictionary,
  or whose index answers 404, replies `reason` and an empty map; never throws to the content script.
- Content (`src/content/active.ts` `scanOnce`, `src/active/scan.ts`): after `tokensIn`, collect the tokens the analyser
  did not confirm (`!t.known`, letters only), take their normalized form from `ids[0]`, ask the background once per
  form per tab (a per-instance `Map<formId, lemmaId | null>` remembers answers; `refetch`/re-scan never re-asks), and
  for each hit set `known = true` and push `lemma:<lang>:<lemma>[:<pos>]` — the same id shape as scan.ts:129. Everything
  downstream (learner-model consult, levels, highlights, encounters) then treats the word like any analysed word. Order:
  confirm first, then `consult()` the learner model for the newly known ids. `last` gains `confirmed` (hits) and
  `unconfirmed` (asked, not found) counts; the popup's stats line shows them if it shows `skipped`. When the background
  replies with a `reason`, remember it for the tab's `reason` text ("The dictionary could not be reached, so only the
  course word list underlines words.") without blocking the scan.
- The per-node token cache in scan.ts must not freeze `known`: either store the dictionary answers outside the cache and
  apply them when building ranges, or invalidate cached tokens whose forms got answers. Pick one and test it.
- Tests (`test/extension/active.confirm.test.ts` + extend `active.content.test.ts`): with a fake background that knows
  `{ bisherigen: ['bisherig','ADJ'], Sklave: ['Sklave','NOUN'] }` and a German page, the two words are marked and get
  lemma ids, `xyzzy` and `אֱלֹהִים` stay skipped, the request carries each form once, a second scan sends no request,
  encounters include the confirmed ids; with the background replying `reason: 'offline'`, behaviour equals today's and
  the reason text is set; the Albanian scan test (2026-10-25 name/foreign-word rule) still passes. Background test: the
  location order and 404 handling, mirroring the gloss tests. `npm run ext:build` must succeed; `test/audit/rights.dist`
  must not gain new failures (no forms index is bundled into dist/app).

## Rules

Repo `C:\Users\CJWal\dev\go-v0`; `cd` there first in every shell call; never write under `C:\Users\CJWal\OneDrive`.
Touch only your package's files; write what you need from the other package into
`docs/ecosystem/GOLEARN-ACTIVE-DICTIONARY-REQUESTS.md` under your heading. No `git add`/commit (the coordinator commits
by path). New files with Write, edits with Edit. Run your own tests, then `npx tsc -b`. Report under 40 lines: files,
sizes, test counts, anything you could not do.

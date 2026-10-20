# GoTell redesign: "Your Testimony" with guided help

Status: BUILT 2026-10-20 (four packages in parallel against this contract, then integrated and verified in the browser
against real German reading data). Owner decisions are recorded here verbatim; nothing below reinterprets them. Where the
build departed from the contract, the "As built" section at the end says so.

## What the owner decided

- GoTell has **one prompt for now: "Your Testimony"**. The `/testimony` page is the one GoTell surface. The 15-goal
  Practice page (`/tell`) comes **off the nav** (its link in `Testimony.tsx` goes); its routes and code stay untouched.
- **Guided help** is a learner option, on or off. When on, the editor shows a **faint telegraph of the suggested word**
  (ghost text) drawn from the learner's **known words**. It **never autofills**: no key accepts it. The learner types
  every letter. The suggestion **updates live** as the learner types, so the ghost shrinks letter by letter and switches
  words when the typed letters stop matching.
- A suggestion appears **only once the learner has begun typing a word** (at least one character of it). Nothing is
  shown at a word boundary.
- "Known words" = items the learner has **recognized in reading or better** (`listKnown(userId, lang, 'reading',
  'recognized')`, form items).
- **English in parentheses**: when the learner types `(water)`, the editor supplies the target-language equivalent in
  the same ghost style, right after the `)`. If the learner has never met that word, it is still shown, **marked as new**
  (a visibly different ghost style) and recorded as a looked-up word.
- When the learner has fully typed the supplied word, **the `(water)` text is deleted**, and **the supplied word is shown
  in italics, permanently** (even after the learner typed it), marking it as supplied.

## Decisions the coordinator made (owner may override)

- Ghost text is an overlay behind the textarea, never inserted into the text. Tab / arrows / Enter have no special
  behaviour.
- Ranking: among known words matching the typed prefix, prefer the word that most often **followed the previous word in
  sentences the learner has read** (bigram count), then overall count in those sentences, then level. One ghost at a time.
- The parenthetical lookup works whether guided help is on or off (the learner asked for the word explicitly).
- A parenthetical lookup prefers a dictionary lemma whose form the learner knows; otherwise the highest-frequency lemma,
  shown as the dictionary headword, marked `new`.
- Evidence (GoLearn): a word typed while its ghost was showing is recorded as production kind **`guided`** (light
  assistance: spelling only); a word supplied from a parenthetical is **`supplied`** (dictionary assistance). Both are
  below `independent`. With guided help off and no lookup, words are `independent` as today. Policy becomes `evidence@9`
  (new kinds), which triggers the usual automatic rebuild.
- Thai has no spaces: the "current word" is the last token of `adapter.tokenize(textBeforeCaret)` when the caret sits
  right after it. Hindi/Thai IME: no prediction during composition (`compositionstart`..`compositionend`).

## Shared types (contract; package A owns the file, everyone imports from it)

`src/gotell/predict/types.ts`:

```ts
import type { LanguageCode, LearnerLevel } from '../../core';

/** A half-open character range [start, end) in the editor text. */
export interface Range { start: number; end: number }

/** What the learner was helped with, kept beside the text and shifted on every edit. */
export interface TextAssist {
  /** Words supplied from an English parenthetical: shown in italics for ever. */
  supplied: Range[];
  /** Words the learner typed while a ghost for that word was showing. */
  guided: Range[];
}
export const EMPTY_ASSIST: TextAssist = { supplied: [], guided: [] };

export interface KnownWord {
  /** form item id: form:<lang>:<normalized> */
  itemId: string;
  normalized: string;
  /** The most frequent spelling the learner has read (German nouns keep their capital). */
  surface: string;
  count: number;
  level: LearnerLevel;
}

export interface WordIndex {
  lang: LanguageCode;
  userId: string;
  words: Map<string, KnownWord>;                    // by normalized
  bigrams: Map<string, Map<string, number>>;        // prev normalized → next normalized → count
  builtAt: string;                                  // ISO
  textCount: number;                                // texts scanned
}

export interface Prediction {
  /** The characters already typed (surface, as typed). */
  typed: string;
  /** The full suggested word (its known spelling). */
  surface: string;
  /** What the ghost shows after the caret: surface minus the typed prefix. Never empty. */
  completion: string;
  itemId: string;
  score: number;
}

/** One English-in-parentheses request found right before the caret. */
export interface Parenthetical {
  english: string;      // trimmed, as typed
  start: number;        // offset of '('
  end: number;          // offset after ')'
}

export interface ReverseHit {
  lemma: string;                 // dictionary headword (written form)
  pos?: string;
  frequencyRank?: number;
  /** True when the learner knows this lemma's form (reading ≥ recognized). */
  known: boolean;
}

export interface SuppliedWord {
  english: string;
  surface: string;               // what the ghost shows and what the learner must type
  itemId: string;                // form:<lang>:<normalized(surface)>
  known: boolean;                // false ⇒ ghost style 'new'
}
```

## Package A: prediction engine (`src/gotell/predict/**`, `test/gotell/predict/**`)

- `index.ts`: `buildWordIndex(ctx: { store: AppStore; golearn: Pick<GoLearn,'listKnown'>; adapter: LanguageAdapter }, userId, lang): Promise<WordIndex>`.
  Known = `listKnown(userId, lang, 'reading', 'recognized')` filtered to `itemId.startsWith('form:'+lang+':')`. Texts =
  union of `readingTextIds ?? textIds` over those items. For each text: `store.tokens.where('textId', id)`, grouped by
  `sentenceId`, ordered by `index`; only `isWord` tokens. A known token contributes to `count`, to the surface tally, and to
  `bigrams[prevKnownOrNot?]`: bigram keys use the previous **word** token's normalized form whether or not it is known
  (so "ich" → "glaube" counts even if "ich" is below recognized), but only known next-words are stored.
- `predict.ts`: `predict(index, adapter, textBeforeCaret, opts?: { max?: number }): Prediction[]` (best first; `[]` when
  nothing). Rules: the caret must sit directly after a word token (no trailing whitespace/punctuation); prefix =
  that token's surface, `p = adapter.normalize(prefix)`; candidates = words with `normalized.startsWith(p) &&
  normalized !== p` and `surface.length > prefix.length`; `completion = surface.slice(prefix.length)` (if that is empty
  or the surface does not start with the typed prefix case-insensitively, skip the candidate); score = `10 * bigram(prev,
  cand) + log2(count + 1) + levelBonus` where levelBonus is 0..2 by LEVEL_ORDER. Thai: same rule via tokenize.
- `parenthetical.ts`: `findParenthetical(textBeforeCaret): Parenthetical | null` matches `/\(([A-Za-z][A-Za-z' -]{0,40})\)$/`
  (caret right after `)`); `pendingSupplied(text, paren, caret, target)` returns how much of the target has been typed
  after the parenthetical (`{ typed: string; complete: boolean; broken: boolean }`): typed = text between `paren.end`
  (skipping one optional space) and caret; `complete` when typed equals `target.surface` (case-insensitive compare of
  `adapter.normalize`); `broken` when typed is not a prefix of it.
- `ranges.ts` (pure): `editBetween(oldText, newText): { start: number; removed: number; inserted: number }` (common
  prefix/suffix), `shiftRanges(ranges, edit): Range[]` (ranges entirely before: unchanged; entirely after: shifted;
  overlapping the edit: dropped), `shiftAssist(assist, edit)`, `addRange(ranges, r)`, `rangeAt(ranges, offset)`.
- `applySupplied(text, assist, paren, surface): { text, assist, caret }` deletes `(english)` plus one following space
  and records the supplied word's range (shifted). Pure.
- Tests: fake store seeded with sentences+tokens (see `test/ui/fixtures.ts` seedStory for shapes; or hand-built rows),
  fake listKnown; German capitalization; Thai text without spaces using the real `thAdapter`; prefix-only rule (no ghost
  at a boundary, none for an exact match); live update as letters are typed; bigram preference; ranges shifting on
  insert/delete before/inside/after; parenthetical detection and completion; a bench-style test building an index from
  50 texts × 100 sentences under 1.5 s.

## Package B: English → target reverse index (`scripts/build-reverse-gloss.mts`, `src/dict/reverse.ts`, `public/dict/<lang>/reverse/**`, `test/dict/reverse*.test.ts`)

- Build: for each lang in de, es, hi, sq, th read `public/dict/<lang>/manifest.json`, stream every shard in
  `manifest.shardFiles` with `parseShard`/`expandEntry` (src/dict/format.ts), take entries that have glosses, and from the
  first 3 glosses extract English heads: split on `;` and `,`; drop `(…)`, `[…]`, `{…}`; lower-case; trim; drop a
  leading `to `; keep heads of 1–3 words matching `/^[a-z][a-z' -]*$/`; skip stop-heads (`a`, `the`, `of`, `one`, `that`,
  `which`, `used`, …). Map head → `[written ?? form, pos, frequencyRank ?? null]`, dedupe by (lemma, pos), sort by
  frequencyRank (nulls last), cap 12 per head. Memory-bounded (spill like `build-full.ts` if a single Map exceeds ~1 GB;
  measure es first). Output `public/dict/<lang>/reverse/manifest.json` `{ version, lang, buckets, heads, shardFiles,
  builtFrom }` and `r-<hex>.json` `{ [head]: Array<[lemma, pos, rank|null]> }`, bucket = `bucketOf(head)` from format.ts,
  buckets = 64 (de/es) or 16. Report sizes. Add `"dict:build-reverse": "node --import tsx scripts/build-reverse-gloss.mts"`
  to package.json (one line; the coordinator stages it by hunk) and follow whatever `dict:publish` does for the shards.
  Check whether `public/dict/<lang>/s-*.json` are tracked by git (`git ls-files public/dict/es | head`); the reverse
  shards follow the same practice (tracked or not), and the brief back to the coordinator says which.
- Runtime `src/dict/reverse.ts`: `createReverseSource(lang, { fetch?, base? })` with `lookupEnglish(english: string):
  Promise<Array<{ lemma; pos?; frequencyRank? }>>` (normalizes like the build; also tries the head with a leading `to `
  removed and with a trailing `s` removed), LRU of 8 shards, graceful `[]` when no manifest (nb has none).
- Tests: head extraction cases; a round trip through a small fixture manifest+shard written to a temp dir under the
  scratchpad (never OneDrive); `lookupEnglish('water')` on the real es index returns `agua` first (skip when the built
  index is absent, with a clear message).

## Package C: the editor (`src/ui/testimony/GhostEditor.tsx`, `Testimony.tsx`, `useGuided.ts`, `src/ui/prefs.ts`, `src/index.css`, `test/ui/testimony*.test.tsx`)

- `GhostEditor`: a `<div class="ghost-editor">` holding a backdrop `<div aria-hidden class="ghost-editor__backdrop">` and
  the existing `<textarea class="editor" aria-label="Your testimony" lang=…>`. Backdrop mirrors font, size, line-height,
  padding, wrap and scroll (`white-space: pre-wrap; overflow-wrap: break-word`); textarea `color: transparent;
  caret-color: var(--ink); background: transparent`. Backdrop renders the text with `<i class="supplied">` over
  `assist.supplied` ranges and, at the caret offset, `<span class="ghost">completion</span>` (or `class="ghost
  ghost--new"` for an unknown supplied word; ghost colour `var(--ink-faint)`, new = dotted underline). A trailing `\u200b`
  keeps the last line's height. Scroll of the textarea is copied to the backdrop on `scroll`.
- Props: `value, assist, onChange(next: { text; assist }), lang, ghost: { completion; style: 'known' | 'new' } | null,
  onCaret(offset), composing guard (no `onCaret` prediction between compositionstart/end)`.
- `useGuided(api)` (hook): owns `WordIndex` (built on mount and after each "Save this version", via `buildWordIndex`),
  the pref `guidedHelp`, caret offset, the current `Prediction | null`, the pending parenthetical `{ paren, target:
  SuppliedWord } | null`, and the `guided` bookkeeping: while a prediction for the word under construction is showing,
  remember `{ start: tokenStart, itemId }`; when the learner types a boundary (space/punctuation/newline) and the finished
  word equals the predicted surface (normalized), add its range to `assist.guided`. Parenthetical: on each change, if
  `findParenthetical` matches at the caret and nothing is pending, call `lookupEnglish`, choose the hit (known first by
  checking `index.words` for `adapter.normalize(lemma)`, else first), set pending; show its surface as the ghost (after
  one space in space-separated languages, none for Thai); as the learner types, `pendingSupplied` says typed/complete/
  broken; on `complete`, call `applySupplied` → new text/assist/caret, clear pending, remember the supplied `itemId` for
  the evidence event; on `broken` keep pending but show no ghost; when the parenthetical text itself is edited away, drop
  pending.
- Testimony.tsx: heading **"Your Testimony"**; a checkbox **"Guided help"** (pref `guidedHelp`, default **true**) with
  the one-line note "Shows a faint hint of a word you know as you type it. Nothing is typed for you."; the `/tell` link
  (line ~193) removed; draft save passes `assist` (see Package D's `saveDraft(user, lang, text, { …, assist })`) and
  `acceptRevision(id, text, { assist, supplied: SuppliedWord[] })`.
- Prefs: `guidedHelp: boolean` in `Prefs` + `DEFAULT_PREFS` (true).
- Tests (jsdom; harness `test/ui/harness.tsx`; `type()` does not move the caret, so set `selectionStart` and dispatch
  `input` yourself): ghost shown only after a letter is typed, never at a boundary; ghost shrinks as letters are typed;
  no insertion on Tab/Enter; toggle off hides the ghost; `(water)` shows the supplied word; typing it deletes the
  parenthetical and the word renders inside `<i class="supplied">`; a new word has `ghost--new`; composition suppresses
  prediction; `/tell` link absent; existing testimony tests still pass.

## Package D: evidence (`src/core/model.ts`, `src/core/events.ts`, `src/gotell/service.ts`, `src/gotell/productive/**` if needed, `src/golearn/policy.ts`, `src/golearn/fold.ts`, `src/core/contracts/gotell.ts`, `docs/GOTELL.md`, tests under `test/gotell/**`, `test/golearn/**`)

- `TestimonyDraft.assist?: TextAssist` and `Revision.assist?: TextAssist` (optional, additive). `saveDraft(userId, lang,
  text, opts & { assist?: TextAssist })` stores it; `getDraft` returns it. `acceptRevision(testimonyId, text, opts?:
  { assist?: TextAssist; supplied?: Array<{ english: string; itemId: string; surface: string; known: boolean }> })`.
- `ProductionKind` gains `'guided' | 'supplied'`. `classifySentence` (service.ts ~417-457): a token whose `[start, end)`
  (sentence-relative offsets mapped to full-text offsets) lies inside a `supplied` range → `supplied`; inside a `guided`
  range → `guided`; otherwise as today. `POLICY_VERSION = 'evidence@9'`; `PRODUCTION_ASSISTANCE.guided = 1`,
  `.supplied = 3`; `PRODUCTION_WEIGHTS.guided = 0.7`, `.supplied = 0.4`. Nothing else in the fold changes.
- New event `TestimonyWordSupplied { testimonyId, revisionId, english, itemId, surface, known }` emitted once per supplied
  word at acceptRevision (dedupe `tws:<revisionId>:<itemId>`); it is **not** a fold type (the ProductionRecorded with
  kind `supplied` carries the evidence); it is the audit trail of lookups.
- Keep `TestimonyTextSubmitted` (checking still records no production evidence).
- Tests: classify with ranges; event emission; policy bump triggers rebuild in `test/golearn/rebuild.test.ts` style;
  `test/golearn/evidence.test.ts` expectations updated for `guided`/`supplied` (independent unchanged); the
  byte-identical reading-only invariant (`test/golearn/listeningAudit.test.ts`) still holds.
- `docs/GOTELL.md`: a short "Guided help" section pointing here; the status-of-record table updated.

## Rules for every package

- Repo: `C:\Users\CJWal\dev\go-v0`. **Never write under `C:\Users\CJWal\OneDrive`** (the shell cwd resets there: `cd`
  first). Temp files go in your scratchpad directory.
- Touch only the files your package owns (listed above). Shared files are named with the package that owns the hunk.
  If you need a change in another package's file, write what you need into `docs/GOTELL-GUIDED-REQUESTS.md` under your
  package's heading and stub locally; do not edit the file.
- Do **not** commit, stage or `git add` anything. The coordinator commits by path.
- Write new files with the Write tool and edit with Edit; no heredocs for TypeScript.
- Run only your own tests while building (`npx vitest run <paths>`), then `npx tsc -p tsconfig.json --noEmit` once at the
  end. Report: files written, test counts, anything you could not do, and the exact command the coordinator should run.
- Copy, not invention: wording shown to the learner is plain English; the ghost is called a "hint" in UI text.

## As built (2026-10-20): where the build departed from the contract above

- **Shared shapes live in core.** `Range`, `TextAssist`, `EMPTY_ASSIST` and `SuppliedWord` are in `src/core/assist.ts`
  (core may not import from an engine: the conformance audit `test/audit/conformance.imports.test.ts` enforces it).
  `src/gotell/predict/types.ts` re-exports them; everything else imports from either.
- **Engine.** `predict()` returns one prediction by default (`max` 1). `pendingSupplied(text, paren, caret, target,
  adapter?)` takes the adapter as a fifth argument. In Thai the typed prefix may start inside the last segmenter token
  (`ฉันพ` → prefix `พ`); use `prediction.typed`. The bigram ignores a previous word across a sentence break. A word's
  spelling is the most frequent one it was read with, sentence-initial occurrences counting half (so "Ich" does not
  beat "ich", while "Haus" keeps its capital). Known words never met in the read texts stay in the index with count 0.
- **Editor.** `GhostEditor.onChange` also passes `caret`. A guided range is recorded when the boundary after the hinted
  word is typed (Thai: when the word equals the hinted word). Only single-character edits count, so a pasted word earns no
  guided credit. The parenthetical lookup works with guided help off. A supplied word is "known" when the index holds
  the lemma's normalized form. The `<i class="supplied">` italic is drawn in the backdrop while the transparent textarea
  lays out roman glyphs, so the caret can drift a pixel or two after an italic word on the same line (owner's choice:
  italics). Supplied-word ranges survive reloads (stored on the draft and on each saved version).
- **Evidence.** Inside a range, the kind replaces the suggestion-derived kind only when it is weaker (an `independent`
  token in a guided range becomes `guided`; a `copied` one stays `copied`). `queryItem` counts `guided` and `supplied`
  under `productionEvidence.assisted`. `TestimonyWordSupplied` carries the word as `word` (`surface` is the UI surface).
  `EvidencePolicy.productionWeight` now takes `ProductionKind`.
- **Reverse index.** Rows are `[lemma, pos, rank|null, g, h]` (gloss index, head position), manifest version 2. Ranking:
  `score = primary*2 + tier`, primary 2 for the first head of the first gloss, 1 elsewhere in the first gloss, 0 later;
  tier 2 for rank ≤ 2000, 1 for ≤ 10000, else 0; ties by rank, then g, h, alphabetical. A frequency rank applies only to
  the part of speech listed first for that spelling. Trailing placeholder objects (`something`, `someone`, `oneself`, …)
  are stripped from heads. First hits checked: es hello → hola, water → agua, to believe → creer; de to believe →
  glauben, bread → Brot; th water → น้ำ; hi water → पानी. Sizes: de 5.1 MB, es 5.7 MB, hi 2.2 MB, sq 0.74 MB, th 1.7 MB.
  `public/dict/` is git-ignored, so the reverse shards are built locally (`npm run dict:build-reverse -- --langs
  de,es,hi,sq,th`) and `npm run dict:publish` now carries `<lang>/reverse/**` (shards first, manifest last).
- **Not done / open.** Alternatives for a parenthetical (only the first hit is shown). Showing the learner's known
  inflected form of a supplied lemma (the dictionary headword is shown). Thai and Hindi input methods were tested only
  through the composition guard, not with a real IME. Practice (`/tell`) is unlinked but still routed.

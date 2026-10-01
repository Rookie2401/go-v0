# Readiness — what the system can do with supplied texts today

Three words are used strictly:

- **Implemented** — the code exists and its own tests pass.
- **Verified** — additionally proven end to end: integration tests on the real adapters, importer and engines,
  the generated import proof, and/or a browser flow against the running app.
- **Awaiting external input** — cannot be completed from inside the repository.

This is **not** a production-readiness claim.

## Readiness by language

| | Ingestion | Progress tracking | Linguistic analysis | Scripture | Real speech |
|---|---|---|---|---|---|
| **Spanish** | Verified (proof + browser importer) | Verified (one record on Home, library, reader; version-scoped) | Tokenization dependable; sentence splitting limited; lemma / morphology / phrases **seed lexicon only**; `á`, `dijéremos`, `engañamos` analysed, other historical forms left unanalysed | **Published**: Reina-Valera 1909, 3 verses, byte-verified against eBible.org | **Not verified** — no credentials; nothing synthesized |
| **German** | Verified | Verified (engine); browser checked for Spanish only | Dependable tokenization; separable verbs only `anfangen`; compounds low-confidence; **seed lexicon only** | **Published**: Lutherbibel 1912, 3 verses, byte-verified | Not verified |
| **Albanian** | Verified | as German | ë / ç preserved; inflected forms related; clitics ambiguous in thin context; **seed lexicon only** | **Blocked** — awaiting an approved translation | Not verified |
| **Hindi** | Verified (grapheme-safe spans, danda kept, non-NFC preserved) | as German | Compound verbs only when listed; **seed lexicon only** | **Blocked** | Not verified |
| **Thai** | Verified (no spaces added; sentence break = newline / double space) | as German | Word segmentation **limited** (ICU dictionary + short compound list); **seed lexicon only** | **Blocked** | Not verified |

A course in the team list, or a seeded example, is not evidence of support: this table is. "Seed lexicon only"
means every word of a supplied text is tokenized and tracked, but a word outside the adapter's small lexicon
has no lemma or gloss ("not analysed yet"); analysis can be supplied with the text (`spans`), corrected by a
reviewer (`corrections`), or added to a lexicon. The importer reports analysis coverage per document, and the
preview and the import result now report the same figure.

## The two audited defects

### A. "Seen 0 of 10 · Finished" (reader, library) vs "Seen 4 of 10 · Finished" (Home)

Reproduction: all three surfaces already called the same `readingProgress(userId, textId)` and formatted it with
one function. With identical stored events they agree — reproduced in the running app with a new learner at
every step. I could not make the three disagree for the same state at the same moment, and found no duplicate
events. What produced the audited picture:

1. **No version scope in the record.** Progress counted only live sentences of the current content version and
   silently dropped exposure recorded against retired ones (a revision, or the index-id sentences of a database
   created before stable sentence keys), while "Finished" carried over from any version. That yields
   "Seen 0 of 10 · Finished" with no explanation.
2. **Independent snapshots.** Each surface read once on mount; the reader re-read on a 300 ms timer, the library
   and Home never. A surface opened before a dwell completed showed fewer sentences than one opened afterwards.
3. **A dropped completion** (found while fixing): finishing a revised text in the same sitting as an earlier
   finish was discarded by the dedupe key.

Fix: one canonical record — scope `{learner, language, text, content version}`; `sentencesSeen` and
`sentencesUnderstood` over this version; `finishedAt` only for a completion of this version;
`finishedEarlierVersion`; `earlierVersions` (exposure against retired sentences: kept and reported, never
counted). One hook and one component render it on Home (card and rows), the library and the reader, re-reading
after `golearn.settled()` on every learner event. Wording is identical everywhere: `Seen x of y sentences`,
`Understood x of y (your report)`, `Finished`, `Finished (your mark)` when fewer sentences were seen than the
text has (with the explanation one tap away), `Finished an earlier version — the text has changed since`,
`n more seen in an earlier version`.

### B. "likely familiar" 24 % → 46 % → 3 % when Parallel English was toggled

Reproduced on the real engines (`scripts/probe-parallel-english.mts`): one `EnglishRescueRevealed`, no new views,
no reports. Two causes:

1. **Rule too blunt (the settled 3 %).** The estimate required "no help in the last two encounters", and a
   whole-passage English reveal counted as help for every word of every sentence, so one toggle vetoed the
   estimate of words met help-free dozens of times. Story encounters were never touched.
2. **Reads not serialized with folds (the transient 46 %).** Coverage was read while the fold was still writing,
   on a blind timer. Toggling English off emitted nothing; the next read showed the settled state.

Fix (`evidence@4`): help has a scope. Help with a word, phrase or grammar point vetoes that item's estimate.
English or an explanation for a sentence makes that encounter "read with the English shown" — it can never
demonstrate, and it is not a help-free exposure — but it does not veto an estimate earned elsewhere and never
touches other sentences or sittings. Every read waits for the fold queue. Probe after the fix:
`40 %` before; `28 %` while the fold runs, after it settles, and after a rebuild from the log. The remaining
drop is two words ("que", "y") that had reached the threshold only through the two verses now read with English.
Exposure is still never shown as understanding ("shown 0 %" throughout).

## Import tests actually run

`npm run corpus:prove` — clearly labelled synthetic files in `data/synthetic/import-proof/`, the real importer,
an isolated in-memory store: **14 case groups, 162 checks, 0 mismatches** (`docs/import/PROOF.md` is generated
from the run). The same files through the **in-app importer in a sandbox database**:

| Case | Outcome in the browser |
|---|---|
| Valid text | imported (new), not published (unreviewed); 15 → 16 texts, 106 → 112 sentences |
| Malformed JSON | refused with the parse position and a fix; counts unchanged |
| Unchanged re-import | "unchanged"; counts identical |
| Two files with one id | no import offered; counts unchanged |
| Valid + invalid in one batch | nothing imported; counts unchanged |
| Span outside the sentence | refused with path and fix |
| Broken translation alignment | refused; the hint lists the sentences the adapter found |
| Revised text | "updated, 1 sentence retired"; version 2; 7 live sentences, 2 added |
| Review hold / rights hold | imported, held with the reason |
| Placeholder "Scripture", unverified | imported, held with every missing requirement |
| Placeholder "Scripture", generated | refused |
| Exactness (Spanish, Hindi danda, Thai without spaces) | stored text byte-identical by code point; normalized form differs where it should |
| Review, then revise without review, then review again | published → held ("the text changed after it was reviewed") → published |

Two defects found by these runs and fixed: a raw paragraph with edge whitespace produced no warning; validation
ignored analysis supplied with the file when counting coverage, so preview and result disagreed. One gap closed:
a review now records which wording it covers, and a revised text is held until it is reviewed again
(Scripture is bound by its verification instead). No synthetic text is published or present in the normal library.

## Speech

`npm run speech:check`: `configured: no`; **12 of 12 provider-independent checks pass** (cache keys, requested vs
delivered locale, voice metadata and review gate, content-version invalidation, retry, dead state with visible
reason, partial generation, unconfigured state, fixture and failed playback never eligible, real-speech events
flagged as speech, key never leaked). `REAL SPEECH: NOT VERIFIED`. One defect fixed: the proxy answered an
oversized request before reading it, which could surface as a connection reset instead of the 413.

## The acquisition loop

`test/integration/acquisition-loop.test.ts` passes all twelve steps on the real adapters, importer and engines,
now including "a revised text is held until re-reviewed". In the browser this round (sandbox): import and
validation, review → publish, revise → hold → re-review, reading with real dwell, explicit finish, identical
progress on the three surfaces, Parallel English stability, honest audio state. The remaining steps (word /
phrase / grammar / English help levels, Scripture preparation, testimony draft, suggestion, assisted vs
independent, reload and language switch) were verified in the browser in the previous round and are covered by
the integration test in this one; they were not re-walked in the browser after this round's changes.

## Not verified

- **Real speech**: nothing has ever been synthesized or heard.
- **Progress in the browser for languages other than Spanish** (engine tests cover all five).
- **The estimate rule in a live browser**: the sandbox learner had one sitting, so no estimates existed; the
  rule is proven by the probe and the engine tests, the browser check proves one event and no transient values.
- **In-app backup download and restore, and a provoked storage failure**: automated tests only.
- **Linguistic quality** of the seed texts, GoTell's term tables and the adapters' rules: not native-reviewed.

## Awaiting external input

1. **Native-speaker review** of comprehensible-input texts (none is reviewed; the normal Read list is empty).
2. **Approved Scripture** for Albanian, Hindi and Thai, then `node scripts/verify-scripture.mjs`.
3. **Speech**: `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in `.env.local`, restart, `npm run speech:check`, then
   a human audition of each voice (`src/golisten/QA.md`).
4. **Native review** of GoTell's per-language tables and the adapters' writing rules.
5. **Lexicon growth or supplied analysis** beyond the seed vocabulary.

## Operating instructions

Specification and numbered walkthrough: `docs/IMPORT.md`. Templates: `docs/import/templates/`. Worked example:
`docs/import/examples/README.md`. Proof: `docs/import/PROOF.md`.

```bash
npm run corpus:validate -- path/to/text.json
```
```bash
npm run corpus:review -- path/to/text.json --by "Reviewer Name"
```
```bash
npm run corpus:prove
```
```bash
npm run speech:check
```

Import through Settings → Content, or place the file under `data/corpus/<lang>/`. To try anything without
touching your library, open the app with `?sandbox=<name>` (separate database, bannered).

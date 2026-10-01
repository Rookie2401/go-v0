# Readiness — what the system can do with supplied texts today

Three words are used strictly in this document:

- **Implemented** — the code exists and its own tests pass.
- **Verified** — additionally proven end to end: the integration suite on the real adapters, importer and
  engines, and/or a browser flow against the running app.
- **Awaiting external input** — cannot be completed from inside the repository: approved texts, established
  rights, a native-speaker review, or a speech-provider account.

This is **not** a production-readiness claim.

## Readiness by language

| | Ingestion | Analysis | Scripture | Real speech |
|---|---|---|---|---|
| **Spanish** | Verified (format v2, exact text, review → publish, revision history) | Tokenization dependable; sentence splitting limited; lemma / morphology / phrases **seed lexicon only**; historical forms `á`, `dijéremos`, `engañamos` analysed, others left unanalysed | **Published**: Reina-Valera 1909, 3 verses, byte-verified against eBible.org, public domain | **Not verified.** No provider account, no speech ever produced. Course asks es-HN; the voice table would fall back to es-MX and record it |
| **German** | Verified | Tokenization dependable; inflection related by `relate`; separable verbs only `anfangen`; compounds low-confidence; **seed lexicon only** | **Published**: Lutherbibel 1912, 3 verses, byte-verified, public domain | Not verified |
| **Albanian** | Verified | Tokenization dependable; ë / ç preserved; inflected forms related; clitics ambiguous with thin context; **seed lexicon only** | **Blocked**: unidentified, unverified sample. Awaiting an approved translation with established rights | Not verified |
| **Hindi** | Verified (grapheme-safe spans, danda kept) | Tokenization dependable; compound verbs only when listed; **seed lexicon only** | **Blocked**: unidentified, unverified sample | Not verified |
| **Thai** | Verified (no spaces added; sentence break = newline / double space) | Tokenization **limited** (ICU dictionary + a short compound list); **seed lexicon only** | **Blocked**: unidentified, unverified sample | Not verified |

A course appearing in the team list is not evidence of readiness: the table above is.

"Seed lexicon only" is the main limit for supplied texts. Every word of a supplied text is tokenized, tracked
and readable (form-level learner state needs no lexicon), but a word outside the adapter's small lexicon has no
lemma or gloss: the word card says "not analysed yet" and English rescue stays available per sentence. The
validator and the in-app importer report each document's analysis coverage. Analysis can be supplied with the
text (`spans`), corrected by a reviewer (`corrections`, stored as human rows that survive re-import), or added to
an adapter's lexicon. Analyzer name, version and confidence are stored on every analysis row.

## Reading progress: five things that are never merged

| Notion | What triggers it | Where it shows | What it proves |
|---|---|---|---|
| Displayed / previewed | Opening a text; the preparation panel | nowhere as progress (`TextViewed`) | nothing |
| Reading exposure | A sentence stays ≥ 60 % in view, tab visible, window focused, no preparation panel open, for `max(1.5 s, 0.22 s × words)` | "Seen x of y sentences" | he was exposed to it |
| Explicit completion | The "I have finished reading" button | "Finished" | he says he finished |
| Reported understanding | "Understood" on a sentence, or "All" at the end, without help | "Understood x of y (your report)"; vocabulary "shown" | demonstrated comprehension (self-report) |
| Estimated familiarity | ≥ 4 help-free exposures in ≥ 2 sittings | "likely familiar (estimate)" | an estimate only; never "known" |

Cause of the audited "Read: 0 of 3 → 2 of 3": a sentence used to count after 600 ms on screen whatever its
length, the label said "Read", completion was inferred once everything had been seen, and each page load started
a new session. All four are changed. Duplicates are also stopped a second way: GoLearn derives sittings from
event time (30-minute gap) and keeps one exposure per item + sentence per sitting whatever session id the UI
sends.

## The acquisition loop — verified

`test/integration/acquisition-loop.test.ts` (real adapters, importer, engines) and a browser run on the dev
server with a fresh learner. "Review" in both is a **synthetic review** recorded with the real review function
for the acceptance run; the bundled seed texts themselves remain unreviewed.

| # | Step | Integration test | Browser |
|---|---|---|---|
| 1 | Import and validate a CI text | ✔ | ✔ in-app importer: valid, 100 % analysed, imported, not published, reason shown |
| 2 | Publish only after review | ✔ `applyReview`; text bytes and sentence ids unchanged | ✔ re-import with the review ⇒ published, offered as first text |
| 3 | Read with word / phrase / grammar / English help | ✔ | ✔ "corazón — heart"; "empezar a entender"; preterite note; English line |
| 4 | Accurate, non-duplicated evidence | ✔ rerender, scroll, route revisit, reload, re-import add nothing; second sitting = +1 exposure, still not knowledge | ✔ 82 exposure + 22 assisted encounters with the exact help levels; reload reused the sitting; counts unchanged |
| 5 | Verified Scripture with overlap | ✔ | ✔ RV1909 exact |
| 6 | Shared history → assistance and preparation | ✔ | ✔ "pecado · met, not shown", "Dios · needed help"; preparation open for 6 s ⇒ "Seen 0 of 3", only opened/previewed events |
| 7 | Synthetic testimony | ✔ | ✔ |
| 8 | Restrained, grounded suggestion | ✔ own sentence (negation, chronology) untouched; one repair with its source | ✔ same; meaning help returned "Empecé a entender mi pecado." with its source, and refused an unsupported request with nothing to insert |
| 9 | Assisted ≠ independent | ✔ | ✔ `al` used_with_assistance, `pecado` used_independently |
| 10 | Save, leave, reload, switch language, recover | ✔ | ✔ draft and Version 1 back after reload and a German round trip |
| 11 | Reviewed speech for the accepted version | ✔ unavailable state; with a **test-only stand-in** provider the exact version is synthesized and playback is exposure only | ✔ honest "not available" with the exact configuration instruction. **No real speech was played.** |
| 12 | Revise the imported text | ✔ version 2 and 3, history, retired sentence keeps evidence at version 1, unchanged analysis rows kept, only the changed sentence's audio regenerated, original ids revived on revert | ✔ "updated, 1 sentence retired", version history in Settings, reader "Seen 7 of 10" for the new version |

Rendering was checked in the browser for Thai, Hindi, German and Albanian (every canonical sentence rendered
exactly, tappable words, per-script font stack and line height, no horizontal overflow).

## Not verified

- **Real speech.** Nothing in this repository has ever called a speech service or been listened to. The
  proxy and both Azure adapters are tested against mocked HTTP; the proxy endpoints were also exercised on the
  running dev server in their unconfigured state (status, 401). Voice names, es-HN availability, real error
  bodies and audio quality are unknown.
- **Dwell after closing the preparation panel, in a live browser.** Covered by a jsdom test; the browser pane
  lost visibility during that check, so it was not observed live. (Dwell itself was observed live: 0 → 7 of 10.)
- **In-app backup download / restore and a provoked storage failure** — automated tests only.
- **Linguistic quality** of the seed texts, GoTell's term tables and the adapters' rules: starter sets, not
  native-reviewed.

## Awaiting external input

1. **Native-speaker review of comprehensible-input texts.** None of the ten bundled texts is reviewed, so in
   normal mode the Read list is empty until reviewed texts are supplied. Procedure below.
2. **Approved Scripture for Albanian, Hindi and Thai** (translation identity, edition, established rights), then
   verification with `scripts/verify-scripture.mjs`.
3. **A speech provider**: set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in `.env.local` and restart the
   server (`docs/SPEECH.md`). Then a **voice audition per language** (`src/golisten/QA.md`); until a voice is
   marked reviewed its audio is preview-only and earns nothing.
4. **Native review** of GoTell's per-language tables and the adapters' writing rules.
5. **Lexicon growth or supplied analysis** for vocabulary beyond the seed corpus.

## Supplying a text: exact steps

Full specification: `docs/IMPORT.md`. Templates: `docs/import/templates/`. Worked example:
`docs/import/examples/README.md`.

```bash
npm run corpus:validate -- path/to/my-text.json
```
Prints errors with a path and a fix, the analysis coverage, and `would publish: yes|no` with each missing
requirement.

```bash
npm run corpus:review -- path/to/my-text.json --by "Reviewer Name (native speaker)" --notes "checked 2026-10-02"
```
Records the review in the file. Never changes the text. Refuses without a named reviewer, and refuses Scripture
that has no verification record.

```bash
node scripts/verify-scripture.mjs
```
For Scripture: add the translation to `SOURCES`, then run. It compares byte for byte and writes the record.

Then import: place the file under `data/corpus/<lang>/` and run `npm run corpus:check`, or use
Settings → Content in the app (the preview states whether the file will publish before you import). To revise
a text, edit the file and import it again: unchanged sentences keep their ids, analysis, audio and learner
history; changed sentences are retired and the version history records it.

## Evidence

- `npm run gate` — the whole suite.
- `test/integration/acquisition-loop.test.ts`, `spanish-loop.test.ts`, `compat.test.ts`, `importer-preview.test.ts`.

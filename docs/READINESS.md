# Readiness — what the system can do with supplied texts today

Three words are used strictly in this document:

- **Implemented** — the code exists and its own tests pass.
- **Verified** — additionally proven end to end (integration suite on the real adapters and importer, and/or
  a browser flow against the running app).
- **Awaiting external input** — cannot be completed from inside the repository: it needs approved texts,
  established rights, a native-speaker review, or a speech-provider account.

This is **not** a production-readiness claim. It states what is dependable now and what still stands between
the system and real learner use.

## Readiness by language

| | Ingestion (format v2, exact text, versioning) | Analysis | Scripture | Speech |
|---|---|---|---|---|
| **Spanish** | Verified | Tokenization dependable; sentence splitting limited; lemma / morphology / phrases **seed lexicon only** | **Published**: Reina-Valera 1909, 3 verses, byte-verified against eBible.org, public domain | Awaiting provider + voice audition (course asks es-HN; the adapter's table falls back to es-MX and records it) |
| **German** | Verified | Tokenization dependable; separable verbs only `anfangen`; compounds low-confidence; **seed lexicon only** | **Published**: Lutherbibel 1912, 3 verses, byte-verified against eBible.org, public domain | Awaiting provider + voice audition |
| **Albanian** | Verified | Tokenization dependable; clitics ambiguous with thin context; **seed lexicon only** | **Blocked**: the sample is an unidentified, unverified rendering. Awaiting an approved translation with established rights | Awaiting provider + voice audition |
| **Hindi** | Verified (grapheme-safe spans, danda kept) | Tokenization dependable; compound verbs only when listed; **seed lexicon only** | **Blocked**: unidentified, unverified sample. Awaiting an approved translation | Awaiting provider + voice audition |
| **Thai** | Verified (no spaces added; sentence break = newline / double space) | Tokenization **limited** (ICU dictionary + a short compound list); **seed lexicon only** | **Blocked**: unidentified, unverified sample. Awaiting an approved translation | Awaiting provider + voice audition |

"Seed lexicon only" is the most important limit for supplied texts: each adapter knows the words of the
bundled seed corpus. A supplied text is tokenized, tracked and readable for **every** word (form-level learner
state needs no lexicon), but a word outside the lexicon has no lemma or gloss — the word card says "not
analysed yet" and English rescue remains available per sentence. The validator reports each document's
analysis coverage and lists the unanalysed words. Analysis can be supplied with the text (`spans`), corrected by
a reviewer (`corrections`, stored as human rows that survive re-import), or added to an adapter's lexicon.

## Blockers from the audit — status

| Blocker | Status |
|---|---|
| Testimony drafts disappear | **Verified fixed** in the engine (autosaved per learner + language, survive reload, language switch, stale-tab conflict, restore from a version) — see `spanish-loop` step 8. UI autosave, status line and failure fallback: see the UI section of the summary. |
| Fixture tones create learner evidence | **Verified fixed.** Non-speech and unreviewed audio never produce evidence; legacy fixture events are excluded on rebuild; the audit lists them; nothing is deleted (`spanish-loop` 9b). The fixture is no longer registered outside development preview. |
| Exposure treated as comprehension | **Verified fixed.** Viewing, completing and playing are exposure only. Recognition needs reported understanding without help, an explicit mark, or production (`spanish-loop` 2–3). |
| GoTell meaning help returned an unrelated draft | **Verified fixed.** Built only from the stated meaning and encountered sentences; testimony texts are excluded from retrieval; unsupported meanings are refused with an explanation and nothing to insert. |
| Partial correction presented as complete | **Verified fixed.** One combined fix when every detected issue has one, otherwise `partial` with the remaining issues named; every suggestion states the checker's limits. |
| Independent vs assisted production blurred; re-saving manufactured evidence | **Verified fixed.** Evidence once per item + sentence, ever; checking records nothing; accepted ⇒ assisted; typed after being shown ⇒ copied. |
| Unverified Scripture and unreviewed audio in normal use | **Verified fixed** at the engine level (publication gate, evidence eligibility). The bundled Spanish sample was in fact wrong in all three verses and has been replaced by the verified source wording. |

## What is awaiting external input

1. **Reviewed comprehensible-input texts.** All ten bundled stories/dialogues are machine-drafted and unreviewed,
   so none is published. In normal mode the Read list is empty for every language. Needed: native-speaker review
   of those texts (then set `review` in the file) or supplied, approved texts.
2. **Approved Scripture for Albanian, Hindi and Thai**, with translation identity, edition and established rights.
   Publicly listed candidates the user could approve (not adopted here): eBible.org hosts public-domain or
   openly licensed editions for many languages; each must be chosen deliberately and verified with
   `scripts/verify-scripture.mjs` (add an entry to `SOURCES`).
3. **More Scripture for Spanish and German** if wanted: the verification script works per passage; whole books
   are the same procedure.
4. **A speech provider account.** The Azure Speech adapter is implemented and tested against a mocked service
   only. It has never called the real service: voice names, es-HN availability and browser CORS are unverified.
   A key is entered by the user in Settings; nothing in the repository holds one.
5. **Voice audition per language** by someone who can judge the language (`src/golisten/QA.md` has the
   procedure). Until a voice is marked reviewed its audio is preview-only and earns no listening evidence.
6. **Native review of GoTell's per-language tables** (key theological terms, chronology words, negators) and
   of the adapters' production rules. They are starter sets.
7. **Lexicon growth or supplied analysis** for any text beyond the seed vocabulary (see above).

## How to supply a text

See `docs/IMPORT.md` for the full specification and `docs/import/templates/` for three working templates.

```bash
npm run corpus:validate -- path/to/my-text.json     # actionable errors, analysis coverage
npm run corpus:check                                 # the bundled corpus + re-import + Scripture byte check
node scripts/verify-scripture.mjs                    # Scripture wording against its source
```

Then either place the file under `data/corpus/<lang>/` (bundled at build) or use Settings → Content in the app.
Publication is automatic once the document says it has been reviewed by a named person and its rights are
established; Scripture additionally needs translation identity and a verification record.

## Evidence that backs this document

- `test/integration/spanish-loop.test.ts` — the nine-step Spanish loop.
- `test/integration/compat.test.ts` — five-language import exactness and repeatability, grapheme/span
  integrity, content-version invalidation of analysis and audio with history kept, duplicate-evidence guards,
  the publication gate, learner and language isolation, draft safety, backup and restore, atomic validation.
- `npm run gate` — the whole suite.

# PLAN 2 — readiness for supplied texts

Goal: a dependable system into which texts can be supplied and correctly ingested, analysed, read,
optionally heard, tracked, and used for constrained testimony assistance. Read `docs/ARCHITECTURE.md`,
then every file in `src/core/` (the contract — **changed for this round**, see "Contract v2" below).
`src/core/**`, `docs/PLAN2.md`, `test/integration/**`, `test/core/**`, `scripts/verify-scripture.mjs`,
`data/verified/**` are owned by the coordinator: do not edit them; leave `TODO(contract): …` notes instead.

## Rules for every package (unchanged from PLAN.md)
Own only your listed paths. Tests in `test/<package>/`; run only your own (`npx vitest run test/<package>`);
typecheck with `npx tsc -p tsconfig.app.json --noEmit` and fix errors **in your own files only** (other
packages are mid-migration to contract v2 and will be red). No new npm dependencies. No secrets. No network
at test time (mock `fetch`). Never tokenize with `split(' ')`. Never fabricate timings, confidences,
provenance, reviews or rights. Existing tests must be updated to the new semantics, never weakened. Do not
commit. Final report: exports with signatures, behaviour decisions, test count, open TODOs — short.

## Contract v2 (already in `src/core`)
- `Text`: `locale?`, `tags` = learner-facing topics only, `editorialTags`, `prepTargets`, `reviewStatus`,
  `published` + `unpublishedReasons`, `schemaVersion`, `scripture.{translationId, edition, verification}`.
- `ContentSource`: `attribution`, `provenance`. `ReviewStatus`, `REVIEW_OK`, `SourceVerification`.
- `Sentence`: **stable `key`** (author id or `ids.sentenceKey(exactText, repeat)`), id =
  `ids.sentence(textId, key)`, `index` = order in the current version, `versionAdded`, `retiredInVersion?`,
  `speaker?`, `paraStart/paraEnd`; `Paragraph.originalText`. Production code must never derive order from
  an id (`parseSentenceId().sentenceIndex` is NaN for ingested texts). Live sentences = no `retiredInVersion`.
- `TokenAnalysis.gloss` (contextual meaning). `LanguageAdapter.support: AdapterSupport`.
- `DimensionState`: `exposures`, `estimatedFamiliar`; `evidence` is DEMONSTRATED only. `Encounter.evidenceKind`.
- Events: `ComprehensionReported`; listening events carry `assetId`, `speech`, `voiceReviewed`;
  `ProductionRecorded.sentenceHash`.
- `AudioAsset.isSpeech`; `VoiceConfig.{reviewStatus, providerVersion, isSpeech}`; `TtsProvider.{isSpeech,
  availability()}`; `GoListen.{availability, audioStatus, setVoiceReview}`; `AudioStatus`.
- `TestimonyDraft` + `store.drafts`; `MetaRow` + `store.meta`; `GoTell.{getDraft, saveDraft, clearDraft,
  restoreRevisionAsDraft}`; `GoTellSuggestion.{scope, remainingIssues, checkerCoverage, sources, finalText}`;
  `SuggestionSource`; `IntentProposal.{supported, insertable, limitation, sources, unexpressed}`.
- `PersonalizedCoverage.{estimatedFamiliarCoverage, explanation}`; `ItemKnowledge.{exposureCount,
  assistedCount, demonstratedCount}`; `GoLearn.{policyVersion, ensureCurrent, auditEvidence, explainItem,
  readingProgress}`; `ScriptureReadiness.{gaps, corpusCanPrepare, limitation}`; new recommendation reasons.
- `buildFixtureText` produces approved + published fixtures with index keys (`key = String(index)`).

## Evidence policy v2 (the rule every package must respect)
1. **Exposure is not comprehension.** A sentence on screen, a text opened or completed, audio played:
   `evidenceKind: 'exposure'`, `exposures++`, level at most `encountered`, `evidence` unchanged.
2. **Help is evidence of needing help.** Help events make the encounter `assisted` with its assistance level;
   level at most `recognized_with_help`.
3. **Demonstration** raises recognition: `ComprehensionReported` with degree `all` for a sentence (items of
   that sentence where no sentence-explanation / English rescue was used in that session; items with a gloss
   tap count as assisted, not demonstrated), an explicit `ItemMarked known`, or production (writing/speaking
   dimensions only). `recognized` needs demonstrated evidence from ≥ 2 distinct sentences or sessions.
4. **Estimate, labelled.** `estimatedFamiliar` = ≥ 4 unassisted exposures across ≥ 2 sessions and no help in the
   last 2 encounters. Shown as "likely familiar (estimate)", never as known; coverage reports it separately.
5. **Only reviewed real speech can count for listening.** An audio event counts only if its asset `isSpeech`
   and its voice `reviewStatus ∈ REVIEW_OK`. Fixture tones, unreviewed voices, failed playback: no evidence,
   ever. Legacy events without `speech` are resolved segment → asset (`generation.providerId === 'fixture'`
   or `isSpeech === false` ⇒ excluded). Listening exposure ≠ listening comprehension (same rules 1–4, with
   transcript visibility and replays recorded on the encounter).
6. **Production provenance.** Evidence for an (item, sentenceHash) pair is recorded once, ever. `submitDraft`
   (checking) records nothing. `independent` requires that the learner's own wording contained the item
   before any suggestion for that sentence was shown; accepted ⇒ `assisted`; edited-after-suggestion ⇒
   `assisted`; typed after a suggestion showed it ⇒ `copied`; changed by the learner without the suggested
   wording ⇒ `self-repaired`.
7. **Derived state is rebuildable.** `GoLearn.policyVersion` is stored in `meta` per user; a mismatch triggers
   `rebuild` from the event log. Nothing is deleted from the log; excluded events are reported by `auditEvidence`.
8. **Publication gate.** Normal learner use sees only `published` texts and evidence-eligible audio. Everything
   else is reachable only in an explicitly marked preview mode.

## Verified scripture (coordinator, done)
`node scripts/verify-scripture.mjs` fetched eBible.org `spaRV1909` and `deu1912`, compared byte-for-byte and
wrote `data/verified/scripture.json`. The Spanish sample (model-recalled) was wrong in all three verses and
has been replaced by the source wording; the German matched. Albanian / Thai / Hindi samples have no verified
source and stay blocked.

## Packages (all `model: sonnet`, in parallel)

### A2 — Import contract v2, adapter honesty, corpus migration
Owns: `src/ingest/**`, `src/adapters/**`, `data/corpus/**`, `docs/IMPORT.md`, `docs/import/**`,
`scripts/corpus-*.mts`, `test/ingest/**`, `test/adapters/**`, and the `corpus:*` scripts in package.json.
1. **Format v2** (`src/ingest/format.ts`, `schemaVersion: 2`; any other version is rejected with an actionable
   message). Fields: `id` (stable; text id `text:<lang>:<id>`), `lang`, `locale?`, `title`, `contentType`
   (TextKind), `corpus`, `source {id,title,author?,publisher?,url?,edition?,attribution,provenance,rights,
   licenseNote?,authorship}`, `review {status, reviewedBy?, reviewedAt?, notes?}`, `difficulty?`, `topics[]`
   (learner-facing), `editorialTags[]`, `prepTargets[]`, `speakers? {id: displayName}`, `generated`,
   `scripture? {translationId, translationName, edition, book, chapter, verification?}`, `english? {source}`,
   `sections[].paragraphs[]` — a paragraph is `{sentences:[{id?, text, english?, verseRefs?, speaker?, spans?,
   corrections?}], separator?}` or raw `{text, english?[], verseRefs?}` (adapter-segmented).
   `spans`: author-supplied lexical analysis `[{start,end,lemma?,pos?,morph?,gloss?,confidence?,alternatives?}]`
   (stored as provenance `lexicon`, analyzer `import@2`); `corrections`: reviewed human analyses
   `[{start,end,lemma?,pos?,morph?,gloss?,by,at}]` (stored as provenance `human`, superseding machine rows).
2. **Exactness.** `Sentence.text` and `Paragraph.originalText` are stored exactly as supplied — no NFC, no
   trimming, no whitespace changes (remove the current canonicalisation). Matching uses `normalizedText` /
   `Token.normalized` only. `originalText.slice(paraStart, paraEnd) === sentence.text` and
   `sentence.text.slice(token.start, token.end) === token.surface` are asserted at import.
3. **Validation** (`validateDocument(doc, ctx): ValidationIssue[]` with `{path, code, message, hint,
   severity}`; `validateBatch(docs)`): required fields, duplicate ids (documents in a batch, sentence ids in a
   document, against already-imported texts of another source), language mismatch (text script vs `lang`,
   `locale` prefix vs `lang`), invalid spans (bounds, overlap, empty, not on grapheme boundaries), broken
   alignments (english array length ≠ sentence count, unknown verse/sentence refs, verse refs not in
   book/chapter order), unsupported schema version, scripture requirements (translation identity, edition,
   book/chapter/verse refs, exact provenance, established rights, never generated), rights `unverified`
   without a replace-note. Warnings (not errors): text not NFC, analysis coverage below 60 %.
4. **Import** (`importDocuments(store, registry, docs, opts): Promise<ImportReport>`; keep `ingestDocument` /
   `ingestAll` as thin wrappers): validate everything first; build all rows in memory; write with the `Text`
   row LAST inside `store.transaction` so a failed import never leaves published partial content; clean
   orphans of a previously failed attempt. **Repeatable**: re-importing an unchanged document writes nothing
   and changes no version; a changed sentence gets a new `key`/id, the old one is retired
   (`retiredInVersion`), `contentVersion` bumps, unchanged sentences keep their ids, tokens, human
   corrections and (through GoListen's text-hash cache keys) their audio; encounters are never touched.
   Legacy rows without `key` (index ids from contract v1) are retired and replaced on first re-import.
   Sentence keys: author `id` if given, else `ids.sentenceKey(exactText, repeat)`.
   `computePublished(doc)` implements rule 8 and fills `published` / `unpublishedReasons`.
   Verse ↔ sentence is many-to-many: a sentence may carry several `verseRefs`, several sentences may share one.
   `ImportReport`: per document `{id, action: 'created'|'updated'|'unchanged'|'rejected', contentVersion,
   published, unpublishedReasons, issues, analysisCoverage, sentencesAdded, sentencesRetired}`.
5. **CLI**: `npm run corpus:validate -- <file-or-dir>…` (exit 1 on errors, prints path + hint per issue and
   the analysis coverage), `npm run corpus:check` (bundled corpus), `npm run corpus:migrate` (v1 → v2, used
   once for the bundled docs). Scripts run with `vite-node`.
6. **Templates + instructions**: `docs/import/templates/{ci-story,dialogue,scripture}.v2.json` (valid,
   commented via a `_comment` field the validator ignores) and `docs/IMPORT.md`: the specification, how to
   validate, import (bundled folder or the in-app importer), review (what a reviewer checks, how to record
   it in `review`), publish (the gate), re-import/versioning, scripture verification with
   `scripts/verify-scripture.mjs`.
7. **Bundled corpus → v2.** Stories/dialogues: `review.status: 'unreviewed'`, `editorialTags:
   ['needs-native-review','machine-drafted']`, `topics` from the learner tags, `prepTargets` from the old
   `prep:` tags (as verse refs), `generated: true` ⇒ unpublished. es + de Bible: `scripture.verification` read
   from `data/verified/scripture.json` (do not retype verse text), `translationId`, `edition`,
   `review.status: 'reviewed'` (reviewedBy = the verification script) ⇒ published. sq / th / hi Bible:
   unverified ⇒ unpublished with reasons. A test asserts bundled es/de scripture text equals
   `data/verified/scripture.json` byte for byte.
8. **Adapters.** Add honest `support` to each adapter (lemmatization is `seed-only` everywhere: the lexicons
   cover the seed corpus only; say so in `limitations`). Verify and test: Thai segmentation and sentence
   boundaries never add or need spaces in canonical text; Hindi grapheme integrity (no token or span splits a
   grapheme cluster — check with `Intl.Segmenter('hi',{granularity:'grapheme'})`), combining marks, danda `।`
   and double danda `॥` as sentence/verse punctuation; German inflection and separable constructions; Albanian
   diacritics (ë, ç) preserved in forms and inflected forms related by `relate`; Spanish accents, inflection,
   and historical Scripture forms (`á`, `dijéremos`, `engañamos`) — unknown historical forms stay unanalysed
   (empty candidates) rather than guessed. Spanish `checkProduction` additions needed by GoTell:
   `yo` + infinitive (`Yo creer` → `creo` when the verb is in the lexicon), `yo tiene` → `tengo`, numeral > 1 +
   singular noun (`cinco año` → `años`); each returns its own `ErrorCandidate`. Export
   `analysisCoverage(tokens, analyses)`.
Tests: every validation code; atomicity (a batch with one bad document imports nothing; an injected write
failure leaves no Text row); repeatability (3 imports → identical row counts and ids); edit → version bump,
retired sentence, surviving human correction; exact Unicode/whitespace round-trip incl. non-NFC input; span
and grapheme integrity for all five languages; many-to-many verses; publication gate matrix; CLI exit codes.

### B2 — GoLearn policy v2
Owns: `src/golearn/**`, `test/golearn/**`.
Implement evidence policy v2 rules 1–5, 7, 8 and the new contract methods. `policyVersion = 'evidence@2'`.
- Fold: `SentenceViewed` ⇒ exposure encounters; help ⇒ assisted; `ComprehensionReported` degree `all` ⇒
  demonstrated for the sentence's items (rule 3), other degrees stored for `readingProgress` /
  recommendations only; `TextCompleted` / `TextViewed` / audio plays never raise a level.
- Listening: eligible only per rule 5 (resolve legacy events via segment → asset). `auditEvidence` lists the
  excluded events with reasons; `ensureCurrent` rebuilds when the stored policy version differs (so existing
  fixture-derived state disappears on first run without deleting any event).
- Levels, `estimatedFamiliar`, confidence, and a one-sentence `explanation` on coverage; `explainItem`.
- Coverage: `knownLexicalCoverage` = demonstrated; `estimatedFamiliarCoverage`; `partialCoverage`;
  `unseenCoverage`; bands use demonstrated + estimated and say so. `readingProgress` from events (completion
  is about sentences seen, not vocabulary).
- `queryItem(s)`: fill the new counts; GoTell gates on "encountered" (any exposure), so keep `exists`,
  `encounterCount`, `textIds` exact and cheap.
- Recommendations by actual state, in the learner's current course language only, published texts only unless
  `includeUnpublished`: new learner ⇒ one `first-text` (easiest published CI text; if none is published say so
  in `explanation` and return it as a note with no textId); after a completion ⇒ `next-input` (unread text),
  `reread` (when the last self-report was below `all` or help was heavy), `listen-to-read-text` only when
  `deps.audioEligible?.(textId)` says reviewed real speech exists; input recommendations always sort before
  `rehearse-testimony`; never return an empty list for a learner with completed texts while unread published
  input exists.
- Scripture readiness: `gaps` = content items not demonstrated (status unseen / exposed / needed-help),
  preparatory texts must actually contain gap items (rank by gaps covered), `corpusCanPrepare` +
  `limitation` naming the uncovered gaps when no available text addresses them.
- Isolation: state, coverage and recommendations for (user A, lang X) are unaffected by user B or lang Y;
  switching back restores everything (it is all keyed by user + item id).
Tests: every rule above; fixture exclusion with legacy and new events; rebuild identity; duplicate-evidence
guards (rerender, replay, re-import of the same text must not add encounters); isolation; recommendation
states (new learner, after completion, after testimony, nothing published).

### C2 — GoListen: real-speech readiness
Owns: `src/golisten/**`, `test/golisten/**`.
- No fixture by default: `createGoListen({ providers?, allowFixture?: boolean })`. With no usable real
  provider, `availability()` is `{available:false, reason:'no-provider'|'missing-credentials'}`,
  `audioStatus(textId).state === 'unavailable'`, `ensureAudio` throws an Error named `AudioUnavailable` and
  creates nothing. The fixture (`isSpeech:false`) is registered only with `allowFixture` (tests, preview).
- `AzureSpeechProvider` behind `TtsProvider` (REST `…/cognitiveservices/v1`, SSML body, output
  `riff-24khz-16bit-mono-pcm` so `validateWav` applies; voices per locale from a static table with es-HN
  → es-MX/es-US fallbacks recorded honestly; key + region supplied at construction by the caller at runtime,
  never persisted by this package, never logged). Tests with a mocked `fetch`: success, 401 ⇒
  `missing-credentials`, 429 ⇒ retry with backoff, 5xx ⇒ failed job then dead, network error. State clearly in
  `QA.md` that it is implemented but **unverified against the live service**.
- Record on assets/voices: requested vs delivered locale, voice, provider + version, `isSpeech`, review status;
  alignment provenance unchanged (sentence = by-construction exact; provider marks = provider-marks with
  confidence; never label approximate alignment exact).
- `audioStatus`: unavailable / not-generated / generating / ready / stale (manifest content version < text
  content version, or a live sentence without a ready segment) / failed (with the error) / preview-only
  (non-speech or unreviewed voice); `evidenceEligible` only for reviewed real speech. `setVoiceReview`.
- Listening events (`listeningEmitter`): always fill `assetId`, `speech`, `voiceReviewed` from the segment's
  asset/voice; emit `AudioSegmentCompleted` only when playback of a ready asset actually finished (a failed or
  aborted play emits `AudioAbandoned`), so GoLearn can apply rule 5.
- Cache keys already include voice configuration and text hash; add a test that an edited sentence (new
  sentence key) invalidates only itself and that a voice change regenerates. Testimony versions: audio is
  generated for the exact text of `revision.textId` (already a Text).
- Retries, dead jobs, visible failure reasons via `audioStatus` and `diagnostics`.
Tests across five languages for the unavailable state, fixture confinement (`isSpeech:false`, events carry
`speech:false`), status transitions, stale detection, Azure adapter with mocked fetch, voice review gating.

### D2 — GoTell: usable, honest writing help
Owns: `src/gotell/**`, `test/gotell/**`.
- **Drafts**: `getDraft`, `saveDraft` (upsert `ids.draft(user, lang)`, `seq` increments, `expectedSeq`
  conflict ⇒ Error named `DraftConflict`), `clearDraft`, `restoreRevisionAsDraft`. Drafts are never evidence
  and never versions; `acceptRevision` does not delete the draft (it sets `basedOnRevisionId`).
- **Gate on encountered language** (`ItemKnowledge.exists` / `encounterCount ≥ 1`), not on `recognized`.
  Every suggestion carries `sources`: the exact sentences (text title + excerpt) where the learner met the
  suggested language, from `store.encounters` → sentences → texts. No source ⇒ the item is new ⇒ `expansion`.
- **Honest scope**: collect all `ErrorCandidate`s per sentence. If every one has a replacement, offer ONE
  combined suggestion (`scope: 'fixes-all-detected'`); otherwise each suggestion is `scope: 'partial'` with
  `remainingIssues` naming what it does not fix. `checkerCoverage` always states the checker's limits for the
  language (from `adapter.support.productionChecks` + limitations) — never imply the sentence is now correct.
  Acceptance test: `Yo creer en Dios. Yo tiene cinco año.` (real Spanish adapter, after A2 lands; until then
  a fake adapter with those three rules) ⇒ sentence 1 suggests `Yo creo en Dios.`; sentence 2 one combined
  suggestion `Yo tengo cinco años.` or, if only some rules fire, partial suggestions listing the rest.
- **Meaning preservation**: negation, chronology words and key theological terms in the learner's sentence
  must survive any suggestion; a suggestion that would drop/add/swap one is either blocked or flagged
  `meaningChange` (never silent). Explicit acceptance only; nothing is applied automatically.
- **Intent (`intent`)**: built only from the stated English meaning (+ optional attempt), never from an
  existing draft or revision. Map the English to concepts; retrieve encountered sentences/phrases expressing
  them (phrase occurrences, English rescue lines and lemma glosses of texts the learner has encountered);
  compose the smallest proposal from that wording (e.g. "I began to understand my sin" + encountered
  `Un día empecé a entender mi pecado.` ⇒ `Empecé a entender mi pecado.` with that sentence as source). If
  the meaning (or part of it) has no encountered wording: `supported:false`, `insertable:false`,
  `limitation` explains exactly what is missing, `unexpressed` lists it, no `proposal`.
- **Production provenance** (rule 6): implement exactly; `submitDraft` records no production; evidence once per
  (item, sentenceHash) ever (also across revisions and re-saves); set `ProductionRecorded.sentenceHash`.
- Version history + recovery unchanged (immutable revisions, `diffRevisions`, restore as draft). Rehearsal
  audio stays tied to `revision.textId`.
Tests: draft persistence/conflict/isolation per learner + language; intent cases (supported, partially
unsupported, unsupported; never returns a draft/revision text); scope honesty; meaning preservation
(negation, "cuando era joven", creer/saber); provenance matrix (independent / self-repaired / assisted /
copied / recheck / re-save / same sentence in a later revision ⇒ no new evidence); sources present.

### E2 — UI, persistence, bootstrap
Owns: `src/ui/**`, `src/app/**`, `src/db/**`, `src/main.tsx`, `src/index.css`, `test/ui/**`, `test/db/**`.
Code against the contract and the package briefs above; siblings land in parallel (report assumptions).
- Dexie: schema version 2 (add `drafts`, `meta`, new indexes), upgrade without data loss. Bootstrap: import the
  bundled corpus through the new importer, then `golearn.ensureCurrent(userId)` (policy migration) for the
  active learner; GoListen created without fixture unless the dev preference "development fixture audio" is on.
- **Preview mode**: a persisted preference (off by default) surfaced in Settings as "Preview unreviewed
  content". On: a persistent, unmistakable banner on every screen, unpublished texts listed with their
  `unpublishedReasons`, fixture audio allowed and badged. Off: only published texts; when a language has no
  published text of a kind, say exactly what is awaited (native review, verified Scripture) instead of an
  empty list. Scripture that is unverified is never shown outside preview.
- **Reader**: exposure only on view; a quiet comprehension control — per sentence ("Understood" in the
  sentence row/sheet) and at the end ("How much did you understand? All · Most · Some · Little") emitting
  `ComprehensionReported`; coverage wording separates "Read: 10 of 10 sentences" from vocabulary
  ("shown x % · likely familiar y % (estimate) · met z % · new w %") with the explanation line; word sheet
  shows `explainItem` summary; unanalysed words say "not analysed yet" rather than a guess.
- **Audio**: driven by `golisten.audioStatus`: unavailable ("Audio is not available — no speech provider is
  configured. You can still read."), preview-only (fixture/unreviewed, badged, no evidence), generating,
  failed (reason + retry), stale ("audio is for an earlier version — regenerate"), ready. Player features
  unchanged (sentence replay, speed, loop, paragraph navigation, transcript modes).
- **Home**: recommendations from `golearn.recommend` by state (first text; next input / reread / listen;
  input before testimony rehearsal); never "Open a story to begin" after a completed text.
- **Testimony**: autosave (debounced ~800 ms, and on blur/route change/`visibilitychange`) via
  `gotell.saveDraft`; restore on mount for the active learner + language; a status line ("Saved 12:03" /
  "Saving…" / "Not saved — storage failed. Your text is kept on this page; copy it to be safe." with a
  `localStorage` fallback copy that is offered for recovery on next load); never lose text on language or
  learner switch; "Save this version" stays explicit and separate. Suggestion cards show scope
  ("Fixes everything this checker found" / "Fixes one thing — still to check: …"), `checkerCoverage`, sources
  (title + sentence), meaning-change warnings, explicit Accept / Reject / Edit. Intent box: unsupported ⇒
  explanation and no insert button. History: "Restore as draft". Rehearsal: "Audio for version N" with a
  note when the current draft differs from that version.
- **Settings**: Content (in-app importer: choose `.json` files → validation report with paths and hints →
  import; list of texts with review status / published / reasons), Speech (provider availability, a
  key+region form for the Azure adapter that stores nothing unless the user ticks "remember on this device",
  voice list with review status and an "I have auditioned this voice" control), Language support (adapter
  `support` table with limitations), Backup (export / restore using `src/backup`), Evidence (run
  `auditEvidence`, show excluded events, rebuild).
- Learner + language isolation in every view; switching team and back restores drafts, versions, progress.
Tests (jsdom + fake-indexeddb): draft autosave/restore across remount, language switch and simulated storage
failure; preview gate; comprehension control events; audio status states; recommendation states on Home;
importer UI happy path and a rejected file; Dexie upgrade from a v1 database keeps rows.

### F — Backup / restore and the storage model
Owns: `src/backup/**`, `test/backup/**`, `docs/STORAGE.md`.
`exportLearner(store, userId, opts?: { includeRecordings?: boolean }): Promise<BackupFile>` and
`restoreLearner(store, file, opts?: { mode?: 'merge' | 'replace' }): Promise<RestoreReport>`, plus
`validateBackup(file)`. A backup is versioned JSON (`format: 'go-backup', version: 1`, created date, app
policy version, a content checksum) holding the learner's source-of-truth data: user row, all events of the
user, testimonies, revisions and their private testimony Texts (text/section/paragraph/sentence/token/
analysis rows), drafts, suggestions, recordings metadata and (optionally) recording audio as base64, relevant
`meta`. Not included: corpus texts, generated audio, derived learner state (rebuilt after restore — return
`needsRebuild: true`). Restore is idempotent (events by id and dedupeKey; rows by id; `merge` never
overwrites a newer draft), rejects corrupt/other-version files with actionable errors, never touches other
learners. `docs/STORAGE.md`: every table, what is source of truth vs derived, what a backup contains, privacy
(testimony and recordings never leave the device except by explicit export), how to move devices.
Tests: round-trip into an empty store reproduces events/revisions/drafts exactly; double restore is a no-op;
corrupt file rejected; two learners isolated; recordings optional; restored store + `rebuild` equals original
derived state (use a minimal fold or compare event sets if GoLearn v2 is not yet landed — note it).

## Integration (coordinator)
`test/integration/**` rewritten for policy v2: the Spanish end-to-end loop (import → read with help →
shared history → Scripture preparation → testimony → constrained correction → assisted vs independent →
save / reload / language switch / recovery → audio honest state), five-language compatibility, and the
required regression tests (draft loss, duplicate evidence, import validation, fixture exclusion, Unicode
/ span integrity, content-version invalidation, learner/language isolation). Browser flows on 5196.

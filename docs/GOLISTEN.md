# GoListen recording integration

GoListen uses the existing canonical texts, sentence IDs, asset store, audio manifests, append-only event bus, and independent GoLearn modality folds. The `/listen` library and `/listen/:textId` session routes do not mount Reader. Opening text support explicitly records transcript rescue before navigating into GoLearn.

## The rules, in short

- Only **reviewed human speech** is listening evidence. Synthetic speech plays as practice and is never evidence, whatever its voice review says.
- A **review is a fact a named person establishes**. A learner's upload is the uploader's own statement, not a review.
- **Heard means audibly heard**: observed, unmuted, volume above zero, progress that fits the wall time.
- The app makes **no speech request** unless a speech proxy is configured, and calls Azure from the browser only after an explicit opt-in.
- Listening and reading measures stay separate (GoLearn, `evidence@8`).

## Importing a recording

Import the text through the existing canonical ingestion path first. Then select that exact text in GoListen and supply a PCM WAV and an `AudioImportManifest` JSON file. `test/fixtures/golisten/de-guten-tag.audio.json` is a complete technical example, paired with its canonical text document and real recording.

The manifest identifies the canonical text ID, content version, release ID, SHA-256, Scripture edition when applicable, language, locale, narrator, variety, human/synthetic source, recording and performance permissions, permitted uses, quality state, and sentence coverage. SHA-256 binds the complete ordered current sentence ID/text payload, not a normalized transcript or an excerpt. The release format is `textId@contentVersion`. Import refuses a different release, exact text, language, edition, invalid WAV, invalid or overlapping coverage, and uncleared playback permission. THSV11 is prohibited.

### Who vouches for it: `origin`

`importRecording({ manifest, bytes, origin, reviewer? })` takes a mandatory trust argument.

- **`origin: 'learner'`** is the upload form on `/listen` (the UI always passes it). Everything in the manifest is the uploader's statement. The recording plays on this device, but its quality state is capped at `machine_checked` whatever the manifest says, its voice stays `unreviewed` (a separate `learner-import:` voice and its own segments), no `reviewedAt` is stamped, and the recording and performance text in the rights record is prefixed "Stated by the uploader, not verified". It can never be listening evidence. A `reviewer` argument is refused. Re-importing identical bytes never changes an existing asset or its review.
- **`origin: 'curated'`** is for scripts and course authoring and is not reachable from the UI. `human_reviewed` or `approved` requires a non-empty `reviewer` (a person's name); the review time is stamped on the rights record, the voice becomes `reviewed`, and the reviewer is recorded. A curated import may raise an unreviewed or machine-checked asset (same bytes, same rights) to reviewed; it cannot change anything else about stored bytes.

What the importer declared (`kind`, `qualityState`, rights status) is kept next to what was established, in the `meta` row `golisten-import:<assetId>` (`ImportRecord`: origin, declared values, reviewer, review time). `kind: 'human'` is a declaration; a learner's `human` and `approved` claims are recorded as declared and nothing more. A manifest cannot carry its own rights id or review stamp.

Recording rights and performance permissions are distinct from literary text rights. Playback, streaming, offline storage, redistribution, segmentation, transformation, and synthetic text derivation are separate capabilities. A public-domain text does not clear a modern recording. For synthesis, callers must supply exact-release authorization including text derivative permission and provider retention terms; normal learner pages do not offer unapproved synthesis. The manifest's rights declarations are supplied evidence, not automated legal verification.

Changes that can alter eligibility (an import or re-import, `revokeRights(assetId)`, a voice review change) are announced through `onEligibilityChange`; the app wires it to GoLearn's `invalidateListening(textId?)`, which rebuilds the listening-derived state from the event log.

## Status and evidence eligibility

`audioStatus(textId).evidenceEligible` is true only for **human** assets with `human_reviewed` or `approved` quality, a reviewed voice, approved rights and a current exact binding. A synthetic-only text is `playAllowed` with `evidenceEligible: false` and the reason "Synthetic speech: practice only, not counted as listening." A learner-imported recording is `preview-only`, playable, and says no named reviewer has approved it. A voice audition of synthetic speech decides whether it counts as synthetic practice, never as listening.

## Timing and playback

Human-reviewed sentence ranges support sentence seeking and replay on a shared recording. Import validates canonical IDs, monotonic non-overlapping ranges, duration bounds, and optional source offsets against exact paragraph slices. Checked-only timing falls back to a coarse passage; it never becomes verified fine timing. Existing provider/forced alignment infrastructure remains available. Phrase loops must refer to persisted reviewed alignment IDs and valid ranges.

Playback revalidates current exact binding and permissions; an offline package carries the bytes, rights, exact binding, and valid alignments, and requires explicit offline permission. Text-only reading remains available when audio cannot play. The listener exposes Listen Only, Read + Listen, Listen First, replay, pitch-preserving speed controls, seeking, transcript rescue, and event-backed resume.

## What counts as heard

The player counts a media progress tick as heard only when it carries the time it was observed (`observedAtMs`), the media element is audible (not muted, volume above zero; the UI passes both from the element), and the progress fits the wall time since the previous observed tick at the current rate. A tick without `observedAtMs` counts nothing. The first observed tick of a pass has nothing to measure against and may carry at most 1.5 s. Seeks, restores, and muted or silent playback add no coverage.

A completed pass needs at least 80% observed audible coverage (`audibleCoverageVersion: 'observed-playback@1'`). When a segment has reviewed per-sentence alignments for every one of its sentences, the completion event names `heardSentenceIds`: the sentences of which at least 80% of the aligned range was heard, and GoLearn credits exactly those. Playback intents, seeking, restoring a position, abandoned audio, and duplicate callbacks cannot manufacture completed hearing. Completion is exposure, not comprehension. Transcript assistance and slowed speech remain recorded facts rather than failure labels.

## Evidence in GoLearn

GoLearn keeps reading, listening, writing, and speaking dimensions independently, under `evidence@8`: synthetic speech is never listening evidence; a completion counts only with observed coverage (legacy end-callback completions count for nothing); credit is per sentence (a one-sentence segment at the 80% floor, a longer passage only when essentially complete, or exactly the event's `heardSentenceIds`); a visible transcript is sentence-level help, not a veto on any one item; and listening never changes a reading measure or joins or splits a reading sitting. Machine-checked human recordings record exposure but not quality-eligible evidence. Existing reading histories and private testimony boundaries remain intact. Checkpoint events persist navigation through the ordinary event log without earning mastery. Stored aggregates rebuild from the retained raw event log when the policy changes. GoListen's own per-text progress (`listeningProgress`) applies the same crediting and reports reviewed synthetic speech only on its separate practice line, never in the quality-eligible count.

## Speech requests and keys

By default the app makes no request to `/api/speech/*`: a static deployment has no proxy to ask. The same-origin speech proxy is checked only when it is configured: the `speechProxy` bootstrap option, or the build flag `VITE_SPEECH_PROXY=1` (`speechProxy: false` always skips it). Calling Azure directly from the browser with a key the learner typed is an opt-in in Settings, Advanced ("Use my own Azure key in this browser"), off by default. While it is off a stored key is not read, no provider is built from it, and no request is made with it; switching it off forgets the stored key. The app does not bundle or store a key for the proxy path (the server holds it).

## Protected transfer checks

The assessment infrastructure uses an explicit protected text marker and approved registry entry. Normal text/listening libraries, the library index, and direct reading/listening routes exclude protected material. Availability fails closed without lawful exact-bound reviewed human speech and previously unseen material. Results are learner self-report only, with contamination tracked; no CEFR level is inferred. No production assessment corpus or validated B2 readiness instrument is supplied by this build.

## Coverage and review limits

The real integration fixture is one German greeting with documented Wikimedia Commons PD-self provenance. It is outside the production curriculum, and it is `machine_checked`: it proves a working recording path, not native speech review or listening understanding. The five adapters share this architecture; synthetic waveform contract tests are not native-speaker listening QA. Production corpus recordings, per-language native review, multiple speakers/varieties, and validated unseen comprehension tasks remain content and review work.

Lutherbibel 1912 (German), Reina-Valera 1909 (Spanish), IRV 2019 (Hindi), and Thai Open Contemporary Version 2025 remain exact-edition text candidates. This build supplies no production Scripture recording. Albanian Bible access remains external/text-unavailable in the bundled corpus. THSV11 remains disallowed. Complete lazy Bible chapters are deduplicated by canonical ID rather than by a matching seed passage title.

The existing learner backup format preserves events, including listening facts and checkpoints. It does not export corpus text or GoListen manifests/assets. To resume or recompute rights-gated listening evidence on another device, restore the exact canonical content and reimport its lawful recording; the standalone offline-package API preserves audio bytes and rights/binding/timing metadata. No new audio backup/restore UI is supplied.

Neither course completion nor passage listening establishes B2 readiness.

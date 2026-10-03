# GoListen recording integration

GoListen uses the existing canonical texts, sentence IDs, asset store, audio manifests, append-only event bus, and independent GoLearn modality folds. The `/listen` library and `/listen/:textId` session routes do not mount Reader. Opening text support explicitly records transcript rescue before navigating into GoLearn.

## Importing a recording

Import the text through the existing canonical ingestion path first. Then select that exact text in GoListen and supply a PCM WAV and an `AudioImportManifest` JSON file. `test/fixtures/golisten/de-guten-tag.audio.json` is a complete technical example, paired with its canonical text document and real recording.

The manifest identifies the canonical text ID, content version, release ID, SHA-256, Scripture edition when applicable, language, locale, narrator, variety, human/synthetic source, recording and performance permissions, permitted uses, quality state, and sentence coverage. SHA-256 binds the complete ordered current sentence ID/text payload, not a normalized transcript or an excerpt. The release format is `textId@contentVersion`. Import refuses a different release, exact text, language, edition, invalid WAV, invalid or overlapping coverage, and uncleared playback permission. THSV11 is prohibited.

Recording rights and performance permissions are distinct from literary text rights. Playback, streaming, offline storage, redistribution, segmentation, transformation, and synthetic text derivation are separate capabilities. A public-domain text does not clear a modern recording. For synthesis, callers must supply exact-release authorization including text derivative permission and provider retention terms; normal learner pages do not offer unapproved synthesis.

Quality states describe evidence review independently of file validity and rights. The real German greeting is `machine_checked`: it proves a working recording path, not native speech review or listening understanding. The manifest's quality and rights declarations are supplied evidence, not automated legal or acoustic verification.

## Timing and playback

Human-reviewed sentence ranges support sentence seeking and replay on a shared recording. Import validates canonical IDs, monotonic non-overlapping ranges, duration bounds, and optional source offsets against exact paragraph slices. Checked-only timing falls back to a coarse passage; it never becomes verified fine timing. Existing provider/forced alignment infrastructure remains available. Phrase loops must refer to persisted reviewed alignment IDs and valid ranges.

Playback revalidates current exact binding and permissions; an offline package carries the bytes, rights, exact binding, and valid alignments, and requires explicit offline permission. Text-only reading remains available when audio cannot play. The listener exposes Listen Only, Read + Listen, Listen First, replay, pitch-preserving speed controls, seeking, transcript rescue, and event-backed resume.

## Evidence

New completed-pass events require at least 80% observed audible coverage. Playback intents, seeking, restoring a position, abandoned audio, and duplicate callbacks cannot manufacture completed hearing. Completion is exposure, not comprehension. Transcript assistance and slowed speech remain recorded facts rather than failure labels. Human and synthetic source facts remain separate.

GoLearn keeps reading, listening, writing, and speaking dimensions independently. Human recordings that are merely machine checked can record exposure but cannot grant quality-eligible listening evidence. Lawful synthetic speech also requires explicit voice audition before it can contribute synthetic practice; it never qualifies as human transfer evidence. Existing reading histories and private testimony boundaries remain intact. Checkpoint events persist navigation through the ordinary event log without earning mastery.

Stored GoLearn aggregates upgrade automatically to `evidence@7` and rebuild from the retained raw event log. Legacy completions retain their former completion contract only when current stored audio, rights, review, and exact binding still prove eligibility. New observed-playback events require finite coverage between 80% and 100%. Previously unbound or rights-unproven audio cannot retain quality-eligible listening evidence.

## Protected transfer checks

The assessment infrastructure uses an explicit protected text marker and approved registry entry. Normal text/listening libraries and direct reading/listening routes exclude protected material. Availability fails closed without lawful exact-bound reviewed human speech and previously unseen material. Results are learner self-report only, with contamination tracked; no CEFR level is inferred. No production assessment corpus or validated B2 readiness instrument is supplied by this build.

## Coverage and review limits

The real integration fixture is one German greeting with documented Wikimedia Commons PD-self provenance. It is outside the production curriculum. The five adapters share this architecture; synthetic waveform contract tests are not native-speaker listening QA. Production corpus recordings, per-language native review, multiple speakers/varieties, and validated unseen comprehension tasks remain content and review work.

Lutherbibel 1912 (German), Reina-Valera 1909 (Spanish), IRV 2019 (Hindi), and Thai Open Contemporary Version 2025 remain exact-edition text candidates. This build supplies no production Scripture recording. Albanian Bible access remains external/text-unavailable in the bundled corpus. THSV11 remains disallowed. Complete lazy Bible chapters are deduplicated by canonical ID rather than by a matching seed passage title.

The existing learner backup format preserves events, including listening facts and checkpoints. It does not export corpus text or GoListen manifests/assets. To resume or recompute rights-gated listening evidence on another device, restore the exact canonical content and reimport its lawful recording; the standalone offline-package API preserves audio bytes and rights/binding/timing metadata. No new audio backup/restore UI is supplied.

Run the focused GoListen tests and the complete repository test suite; the accompanying build report records fresh results and distinguishes baseline failures from integration regressions. Neither course completion nor passage listening establishes B2 readiness.

# GoListen QA

The current implementation and its limits are documented in `docs/GOLISTEN.md`. The accompanying build report records fresh test and browser results.

## What is actually exercised

The real German greeting in `test/fixtures/golisten` has documented Commons PD-self provenance. It is imported through the canonical text path, exactly bound to its current release, validated as PCM WAV, played in the browser, and exercised through event logging, progress, replay, rescue, and resume. Its `machine_checked` status describes technical validation only. No native-speaker, performer, acoustic-quality, or comprehension review is asserted. It grants exposure, not quality-eligible listening evidence.

All five real language adapters are exercised through canonical Unicode ingestion and exact binding. Their test waveforms exercise contracts and never constitute native speech QA. FixtureTtsProvider still creates non-speech tones only for explicit preview/tests and cannot earn listening evidence.

AzureSpeechProvider, ProxySpeechProvider, retry/cache/provider alignment, and the server handler are tested with mocked provider responses. This build does not call a live synthesis service or certify any provider's legal terms. Live synthesis requires callers to supply explicit lawful exact-release derivative authorization and provider retention terms. No learner route manufactures that permission.

## Human review and evidence

WAV validity, permission, text identity, alignment review, and speech quality are independent checks. Human recordings need explicit human-reviewed/approved quality before quality-eligible evidence; reviewed authorized synthetic speech contributes separately identified synthetic practice. Neither establishes comprehension or CEFR readiness. New completions need finite observed audible coverage of at least 80%; paused callbacks, seeks, restores, errors, and duplicate end callbacks cannot manufacture a completed pass.

A reviewer must verify the actual recording/voice, exact wording and edition, declared narrator/locale/variety, permission evidence, intelligibility, and timing before changing review metadata. A checkbox or test-only mocked review is not an audition. Dialect differences are recorded facts, not learner errors.

## Remaining verification

Production course and Scripture recordings, per-language native review, multiple narrators and varieties, reviewed connected-speech timing, and validated unseen comprehension tasks remain outstanding. Protected assessment infrastructure fails closed without an approved registry entry and reviewed human speech; no production assessment corpus or assessment UI is supplied. Listening completion, course completion, and synthetic practice do not establish B2.

# GoListen V1 implementation and review — 11 October 2026

Implemented in `C:/Users/CJWal/dev/go-v0`. Three GPT-5.6 Luna specialists worked on backend security, playback/extension integration, and language/assessment quality. The integrating agent independently reviewed their changes, returned incomplete work for correction, and made the final transport, cancellation, privacy, registry, UI, and test fixes. No commits or cloud provisioning were performed. Existing unrelated working-tree changes and the ChatGPT project's read-only `sources/` were preserved.

## Behavior delivered

- The shared GoListen request API supports words, phrases, sentences, explicit voice and variety selection, source-processing permission, local-only consent, cancellation, and playback handles with stop/replay/rate controls. Azure is the default remote pronunciation provider; confirmed local matching system voices remain fallback. An explicit voice/provider preference is respected.
- GoLearn uses the shared providers through privileged background messages. Page code has no network primitive, credential, or storage access. Backend endpoint access is an optional Brave host permission. Azure keys remain server-side; a separate backend bearer token authenticates voice-list and synthesis requests. Missing backend authentication fails closed.
- Local-only mode starts enabled and overrides remote consent. Remote processing requires both consent and source permission. The worker derives the actual reader from the browser-supplied sender URL. Unknown rights stay blocked unless the user declares permission for an exact source origin in trusted setup; a reader prohibition cannot be overridden. Browser vendor cloud voices are not used as the extension's fallback because they cannot enforce the background's source-rights checks.
- Stop, dismissal, replacement, and an out-of-order response cannot start stale audio. Cancellation targets the actual pending request. A late audio URL is released; a withdrawn permission prevents playback. Stop and speed controls are visible on the card. Multiword selections use phrase scope; “Listen to sentence” is an explicit action in the sentence panel.
- Playback completion records exposure with evidence quality `none`, never mastery. Failed and cancelled hearings do not count as completed playback. Text is absent from playback event payloads.
- GoReview and GoPractice qualification uses independently existing human recordings with native review and explicit assessment approval. Availability alone is insufficient; synthetic and demonstration audio stays practice with no listening-evidence weight. Existing audio-first exercise, hidden-answer, playback-completion, and recovery tests passed. No default language registry supplies an approved assessment corpus, so real assessment availability is not claimed.
- Albanian, Honduran Spanish, German, Hindi, Thai, and Norwegian mappings preserve strict language and requested regional matching. Canonical pack standard IDs map to the declared voice tags. Generic Standard Albanian does not substitute for a requested Gheg variety. Norwegian keeps Bokmål and Nynorsk separate and remains device-only. See `LANGUAGE-MAPPING.md`.
- The backend accepts plain text only, escapes SSML internally, requires a valid operation scope and permitted processing, checks voice/locale agreement, validates RIFF/WAVE responses, and caps audio at 4 MB. Limits are configurable for request bytes, text characters, requests/minute, upstream timeout, and daily characters. A disconnected client aborts the upstream request. The daily counter is in memory and resets on process restart; it is not a durable billing quota or a guarantee of free Azure usage.
- ElevenLabs is explicitly deferred to V2. No ElevenLabs dependency, key, or runtime call was introduced.

## Configuration and honest readiness

Configure server-side `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and `GO_SPEECH_AUTH_TOKEN`, plus the exact allowed extension origin for a separate local host. In GoLearn setup → Privacy, save the authenticated speech endpoint and the separate backend access token, declare any source origin for which you have processing permission, grant backend host access, give remote-speech consent, and turn off local-only mode only if desired. Never enter an Azure key in the extension. Setup does not enable consent automatically. See `AZURE-SETUP.md` and `.env.example`.

No Azure key, region, or backend access token was found in the repository environment files or process environment during this run. No Azure account, resource, voice list, synthesis, or paid request was created or tested. The documented voice IDs are catalog mappings, not verified operational voices. Native-speaker review remains missing, especially for Gheg, Honduran regional pronunciation/voseo, and Thai tone quality. Norwegian has no cloud mapping or approved assessment stimuli.

The desktop helper identified a running Brave window with GoLearn installed, but interaction failed with user-input detection, an input timeout, and unavailable input geometry. The current bundle was therefore not reloaded or auditioned in that Brave profile. Built-bundle tests are not a live Brave audio check.

## Validation evidence

Logs are in `work/golisten-v1/`:

- `acceptance-final.log`: 135 suites passed, one skipped; **1,987 tests passed, seven skipped** across shared GoListen, GoReview, GoPractice, extension, backend, and architecture/privacy/evidence audits. The skipped tests require a real installed translation model and are unrelated to Azure.
- `final-touched-checks.log`: **113 passed** after the final plain-text typing fix and sentence-playback regression. These overlap the integration run; do not add the counts together.
- `final-standard-and-package.log`: final canonical-standard/system-voice and freshly packaged extension checks after the last voice-matching adjustment.
- `final-consent-boundary.log`: checks the final consent re-read immediately before sending source text, plus freshly packaged extension/security checks.
- `typecheck-complete.log`: final whole-repository typecheck.
- `local-build-complete.log`: final extension, setup/web, and GoPractice builds. Existing unresolved font warnings remain; the fonts use the declared runtime fallback.
- `release-recheck.log`: **72 passed**, including rebuilt extension size, lazy analyser loading, no page network/credential/storage access, transliteration placement, and real built-script lookup through the background. Final package checks were repeated after the last source change.
- `live-local-transport.json`: a real local HTTP server returned status 200 with `configured: false` to an allowed test extension origin, 401 `auth-required` for unauthenticated voices, and 403 for an untrusted website origin. The test server was stopped afterward. No Azure call was made.
- `full-regression.log`: broad initial run, **15,226 passed / 49 failed / nine skipped**. This ran while integration was changing contracts and is not the final audio result. Audio/contract failures were corrected and rechecked above.
- `corpus-regression-verified.log`: separate partial recheck of the broader source-integrity/import/ladder/UI failures, stopped after the long bootstrap check failed to finish within the review window. Two confirmed source-integrity failures concern an Albanian source hash and a German curriculum source body; those source files were not edited here. Import, origins, ladder and path UI checks passed on this rerun; it is not a complete global regression result.
- `unrelated-regression-recheck.log`: the separate HTTP service performance rerun did not complete within the review window and was stopped. Its original full-run failure remains an unresolved performance result.

The source/build checks passing does not establish Azure pronunciation quality or a fully green whole-repository release gate. Remaining release conditions are live Azure/backend configuration, live Brave playback, qualified language review and assessment recordings, source-integrity repair, and resolution of the HTTP performance result.

## Exact edited source/test/document files

`V1-CHANGED-FILES.txt` is the complete edited-file manifest for this request. Standard generated build outputs were refreshed under `packages/golearn-extension/dist`, `packages/golearn-extension/app/dist-web`, and `packages/goreview/app/dist`; logs and diff snapshots are under `work/golisten-v1`. The baseline diff snapshot was taken after the initial specialist inspection began, so it is an overlap aid, not a pristine checkout. No unrelated changes were staged or committed. The starting repository commit was `441e4634c696e0c4de54286b8c04018906b4fd31`.

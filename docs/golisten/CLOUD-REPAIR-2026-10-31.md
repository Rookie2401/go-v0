# Cloud pronunciation and review loading repair

The Repository now exposes authenticated `/api/speech/status`, `/api/speech/voices`, and `/api/speech/synthesize` routes. Hosted and native clients use their current Repository account session; the Azure subscription key stays in the service environment. The extension retains its separately configured backend and can fall back to account speech after exact-origin access is granted.

Synthesis requires the learner's persisted remote-speech consent and an explicit processing-permission claim. Isolated vocabulary words are accepted. Phrases and sentences must exactly match approved material in the corresponding language pack/tutorial; arbitrary passages and markup are rejected. Withdrawal and revoked account sessions are checked again by the service. Synthetic playback remains practice, never independent listening evidence.

GoReview, GoLearn Share and Biblia retain local-device speech and expose the appropriate remote consent/access controls. Nynorsk does not silently use Bokmål; Latin's existing Italian approximation is labelled. Each device's available local voices still depend on its browser or WebView.

Review home draws the justified deck before starting vocabulary pagination. Paging no longer silently stops at 6,000 records, repeated cursors are detected, and incomplete snapshots are labelled. Facts are fetched with bounded concurrency into an operation-scoped snapshot; the consume window begins after the complete prime and leftover values are cleared. Concurrent vocabulary gloss lookups use a separate provider identity.

Request deadlines remain active through response-body reads. The real application dependency used by live synchronization gives its 25-second wait a 30-second deadline; ordinary API/assets and speech have their own bounds. Audio health probes and extension messages cannot leave text review waiting indefinitely. FSRS, due dates, admission budgets and retained review histories are preserved.

Native and extension review builds default to all six declared sharded dictionaries: Albanian, Spanish, German, Hindi, Thai and Latin. A missing selected dictionary manifest fails the build. Hosted GoReview can set `GOREVIEW_ASSET_BASE=../` and `GOREVIEW_DICT=` to use the complete shared `/go-v0/dict` tree without duplicating it below `/review`. Native builds keep the default `./` base and include their dictionaries locally.

Deployment requires `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in protected server settings, a tested clean source commit, verified release manifests, and a live voice/synthesis check. A healthy Repository endpoint alone does not prove speech delivery. Native builds must pass the existing release preflight and payload checks before TestFlight submission.

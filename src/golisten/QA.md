# GoListen QA

GoListen turns sentences into validated audio assets. This file says what is actually verified, what
is not, and how a person reviews a real voice before a learner's listening can count as evidence.

## Honest status

**No real speech has been generated or heard by anyone, and nothing has been sent to a real speech service.**

- `FixtureTtsProvider` (`id: "fixture"`, `isSpeech: false`) renders sine-tone bursts as a PCM16 mono 22050 Hz
  WAV. It is not speech. It exists only for tests and preview: GoListen does **not even register it** unless
  `createGoListen({ ..., allowFixture: true })` (or `setAllowFixture(true)` at runtime). Everything it makes is
  marked `isSpeech: false` on the asset and the voice, and can never earn learner evidence, reviewed or not.
- `AzureSpeechProvider` (`id: "azure-speech"`, `isSpeech: true`) is implemented and tested **against a mocked
  `fetch` only**. It has never been called against the live Azure service. No Azure voice has been heard.
- `ProxySpeechProvider` (`id: "speech-proxy"`, `isSpeech: true`) talks to the same-origin proxy `server/speechProxy.ts`
  (dev + preview servers; key and region from `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` on the server, never in the
  browser). It and the proxy handler are tested **against mocked HTTP only**; neither has been run against the live
  Azure service, and the proxy has never been exercised by a real browser session. See `docs/SPEECH.md`.
- With no usable real provider (none registered, or no key/region, or offline), `availability()` is
  `{ available: false, reason }`, `audioStatus().state` is `'unavailable'` with a human reason, and
  `ensureAudio` / `ensureSentenceAudio` / `resolveVoice` throw an `Error` named `AudioUnavailable` **before writing
  anything**. Reading and every text feature keep working without audio.
- Every new `VoiceConfig` is `reviewStatus: 'unreviewed'`. Only `setVoiceReview(..., 'reviewed' | 'approved')`,
  called because a person auditioned the voice, changes that. The pipeline never does.

### What counts as evidence (evidence policy v2, rule 5)

Playback earns listening evidence only when **all** hold: the asset is real speech (`AudioAsset.isSpeech`), its voice
is real speech and `reviewStatus ∈ {reviewed, approved}`, and playback of a *ready* asset really finished. GoListen
reports this on every event (`assetId`, `speech`, `voiceReviewed`) and on `audioStatus().evidenceEligible`; GoLearn
decides what the evidence is worth.

### Verified (automated)

Fixture pipeline (tone audio), the Azure adapter, the proxy provider and the proxy handler against a mocked `fetch`. "es sq th hi de" = run for each language.

| Area | What the tests establish |
|---|---|
| WAV encode / validate | Canonical header; measured duration, peak, RMS, leading/trailing silence, silence ratio, clipping; rejects empty, garbage, header-only, truncated, near-silent, all-zero, non-PCM16, too-short, clipped, long edge silence, sample-rate mismatch; never throws. |
| Validation gate | Silent / empty / garbage / MP3 (cannot be validated) / lying-duration provider output is never stored, never becomes an `AudioAsset`, and its segment never becomes `ready`. A ready segment always has existing bytes and `validation.ok`. A silent WAV "from Azure" is rejected the same way. |
| No fixture by default (es sq th hi de) | No provider registered without `allowFixture`; `availability()` = `no-provider`; `audioStatus` = `unavailable` with the "no speech provider is configured" reason; `ensureAudio`, `ensureSentenceAudio`, `resolveVoice` throw `AudioUnavailable`; voices, assets, segments, alignments, manifests and jobs tables stay empty. A real provider with no credentials reports `missing-credentials`. Non-speech providers are unusable without `allowFixture`. Runtime `setAllowFixture` / `unregisterProvider` change availability. |
| Fixture confinement (es sq th hi de) | Fixture voices and assets are `isSpeech: false`, `reviewStatus: unreviewed`; status is `preview-only` forever; marking a fixture voice `reviewed` leaves `approved: false`, `evidenceEligible: false`; listening events carry `speech: false`. Fixture audio left in the store while fixtures are off reports `unavailable` (nothing is deleted). |
| Azure request (es sq th hi de) | URL `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`, POST, `Ocp-Apim-Subscription-Key`, `Content-Type: application/ssml+xml`, `X-Microsoft-OutputFormat: riff-24khz-16bit-mono-pcm`, SSML `<speak><voice name=…>` with XML-escaped text, caller SSML (pronunciation `lang-tag`) wrapped inside the voice element, response inspected as a 24 kHz WAV and `validateWav` applies, no word marks are ever claimed. |
| Azure outcomes (mocked) | 401/403 => `missing-credentials`, job dead at once (a retry cannot help), provider flips to unavailable, remaining jobs wait without consuming attempts, a newly registered provider + `retryDead` recovers. 429 => `rate-limited`, retried, `Retry-After` honoured (else 1 s, 2 s, ... backoff). 5xx => job `failed`, retried, `dead` after `maxAttempts`, segment `failed`, reason shown, `retryDead` recovers. Network error / timeout => retryable `network`. 400/404 => `bad-request`, dead at once. Empty or non-WAV body => `bad-response`. |
| Speech proxy handler (`test/server`) | `status` (configured / unconfigured, never the key, region only when configured); `synthesize` posts SSML with the key header to `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1` asking for `riff-24khz-16bit-mono-pcm`, returns the WAV with delivered-locale headers; Azure 401/403 => 401 `missing-credentials`, 429 => 429 with `Retry-After`, 5xx => 502, other 4xx => 400, timeout / network => 504, non-WAV 200 => 502; unconfigured => 401 without any upstream call; invalid / oversized (413) bodies rejected before upstream; cross-origin (`Origin` != `Host`, `Sec-Fetch-Site` cross-site / same-site) => 403; per-minute rate limit with `Retry-After` and a sliding window; `voices` filtered by language; the key and upstream bodies never appear in any response, header, thrown message, log line or console output, even when the mocked upstream echoes the key; the Node adapter (dev and preview hooks) streams bodies with the size limit, falls through for non-speech paths, reads `.env.local` through `loadEnv` keeping only the two names, and has no `config` / `define` hook. |
| Proxy provider (`ProxySpeechProvider`) | `availability()` from `/api/speech/status` (unconfigured => `missing-credentials` with the exact instruction; no proxy / static host / HTML answer => `no-provider`; network failure => `provider-error` or `offline`); provider version taken from the status response; voices from the proxy with the static table as fallback; synthesize classification identical to the Azure adapter (`missing-credentials` sticky, `rate-limited` + `Retry-After`, `server`, `network` incl. timeouts, `bad-request`, `bad-response`); no credential of any kind in any request; requested vs delivered locale recorded (a live es-HN voice makes the Honduras course exact). Through GoListen with the real handler wired in as the network: five-language generation, 401 => dead at once and recoverable, 429 retry, 5xx => failed => dead => `retryDead`, network error retry. |
| Partial generation | With some sentences ready and others dead: state `failed`, reason `x of y sentences ready; n failed: <first error>`; still-retrying sentences are not counted as failed (`generating`); ready + failed + pending stays `generating` and says all three; `diagnostics(textId).failedSentences` lists id / index / text / error; the manifest stays playable for the ready segments (`playableIndexes`, the player starts at the first ready sentence and never loads a failed one); `retryDead` recovers. |
| Backups | `exportLearner` of a store used with the direct or proxy provider contains no credential string. |
| Secrets | The key lives in a private field; `JSON.stringify(provider)`, enumerable fields, error messages (incl. echoed bodies and network errors), asset/voice/job/manifest/event rows, job logs and `console` output never contain it. |
| Voice honesty (es sq th hi de) | `requestedLocale` (course preference, `es-HN`) vs `actualLocale` (static Azure table has no es-HN, so `es-MX`) and "Fallback accent" note are stored; provider + provider version, `isSpeech`, `reviewStatus` are stored on the voice; the delivered locale, provider id/version and `isSpeech` on the asset. A provider that delivers another locale corrects the voice config. A provider version change re-keys the audio and resets an earlier review to `unreviewed`. |
| `audioStatus` (es sq th hi de) | `unavailable`, `not-generated`, `generating` (with retries and their last error), `ready`, `stale`, `failed` (with the job error), `preview-only`; `evidenceEligible` only for reviewed real speech; status never writes and never throws; a missing provider keeps already-stored reviewed real-speech audio `ready`; queued jobs wait (`unavailable`) while the provider cannot run; failed beats waiting. |
| Stale detection (es sq th hi de) | Stale when `manifest.contentVersion < text.contentVersion`, or when a live sentence has no ready segment (recomputed cache key). Regenerating after a version bump with unchanged sentences synthesizes nothing. |
| Invalidation (es sq th hi de) | An edited sentence (new sentence key, old one `retiredInVersion`) invalidates only itself; retired sentences are never voiced and never count toward completeness; reverting reuses the old audio; a pronunciation-entry version bump re-keys only the sentences that used it; a voice/provider change regenerates and switching back reuses. |
| `setVoiceReview` | Persists the status with a dated note in `qaNote`, mirrors `approved` (never true for non-speech), survives `resolveVoice`, unknown voice throws. Gates `evidenceEligible`. |
| Listening events (es sq th hi de) | Every event carries `assetId`, `speech`, `voiceReviewed` resolved segment -> asset -> voice; completion only for a *ready* asset whose bytes exist, otherwise `AudioAbandoned`; `failed()` and the player's `playbackError` action abandon the pass; without a store the emitter fails closed (`speech: false`). |
| Cache keys | Display-text hash, speech text, lang, actual locale, provider, engine, voice, settings, normalizer version, lexicon version, provider version each change the key; settings order does not; field boundaries are unambiguous. |
| Idempotency | A second `ensureAudio` reuses every segment, synthesizes nothing, creates no job or asset; concurrent calls synthesize once per job. |
| Verse markers | Scripture speech text has no digits; `[16]` in a display text is stripped from speech (adapter path and the pipeline's own safety net, both recorded); the canonical display text is untouched. |
| Jobs | Exponential backoff (`nextAttemptAt`), `maxAttempts` 4 then `dead`, segment `failed`, dead jobs are not silently resurrected (`retryDead` is explicit), retries never create a second asset, stale `running` jobs recover, unusable provider => job skipped, no attempt consumed. |
| Alignment | Sentence alignment is by construction (0..duration, confidence 1). Word alignment exists only from provider marks, only if the provider declares word boundaries, only for marks that exactly cover one adapter token, after sanity checks. Confidence 0.9 (exact) / 0.7 (mapped). Neither the fixture nor Azure yields word alignments. Approximate alignment is never labelled exact. |
| Testimony | Audio for a revision is generated for the exact text of `revision.textId` and reported like any text; text-less sentence segments are content-addressed; empty / punctuation-only text is refused / failed. |
| Player | Pure state machine: next/prev/seek, replay, sentence and phrase loop, speed clamped 0.7-1.25 with `preservesPitch`, four transcript modes, prefetch window, abandonment, `playbackError`, finish/restart. |

### Unverified (needs a real provider and a human)

| Area | Status |
|---|---|
| **Every live voice** (Azure, Google, ElevenLabs, ...) | **Not heard.** Nothing here says any voice sounds correct, natural, or even intelligible. |
| **The proxy against the real service, and in a real browser session** | **Implemented, never called.** Everything listed in the next row applies to the proxy's upstream call too, plus: the live `voices/list` shape, the proxy's 20 s timeout and 30/min limit under real use, and that Vite's dev / preview servers deliver the middleware ahead of their static handling in a real session (verified with a bare Node http server only). |
| **The Azure adapter against the real service** | **Implemented, never called.** Unverified: that the endpoint/headers/SSML are accepted as written; that the voice names in `AZURE_VOICES` exist (names were written from Azure's public voice gallery, not from `voices/list`); that `riff-24khz-16bit-mono-pcm` arrives with a header `inspectWav` reads for every voice; real rate-limit and error bodies; whether a browser may call the endpoint cross-origin (CORS / preflight with the custom headers) from the static site (the proxy path sidesteps this, the direct adapter does not). |
| es-HN | The static table offers es-MX / es-US / es-ES for Spanish, so the Honduras course is voiced with an es-MX voice and labelled "fallback accent". Azure may offer es-HN voices; confirm with `voices/list`, then add them to `AZURE_VOICES` (or pass `voices` to the constructor) and audition. |
| Pronunciation correctness of any word | Unverified. Overrides are applied mechanically. `substitution` works on any provider. `ssml-phoneme` is not claimed for Azure (`phonemeOverrides: false`). `lang-tag` is sent as `<lang xml:lang>` but Azure honours it only for some voices: an entry may be recorded as "used" while the voice ignores it. Treat as unverified until auditioned. |
| Word boundary marks from a real provider | Mapping is proven only with a test provider whose marks are true by construction. Azure REST returns none here. |
| Locale availability | Whether Azure offers `sq-AL`, `hi-IN`, `th-TH` voices under the names in the table for a given subscription/region. |
| MP3 / OGG | Cannot be validated; such audio is refused until a validator exists (`TODO(contract)`). |
| Loudness, noise, clicks, truncated words, voice consistency across a text | No measurement beyond peak / RMS / silence / clipping. |
| Real playback | The player state machine is DOM-free; `HTMLAudioElement` behaviour (`preservesPitch`, gapless advance, prefetch timing, autoplay policy, `error` events calling `playbackError`) belongs to the UI package and a browser. |
| Whether listening helps acquisition | Not evaluated. GoListen reports events only; GoLearn decides evidence. |

## Constructing and registering the Azure provider (UI)

```ts
import { AzureSpeechProvider } from '../golisten';

// key + region come from the Settings form at runtime; nothing here stores them.
golisten.registerProvider(new AzureSpeechProvider({ key, region }));   // replaces an earlier one with the same id
// "Forget key": golisten.unregisterProvider('azure-speech');
// Wrong key later? audioStatus shows 'failed' (missing-credentials); register a new provider, then `retryDead()`.
```

`availability()` for Azure means "a key and region are configured and the last request was not rejected", never
"verified against the live service". Persisting the key (the "remember on this device" option) is the UI package's
decision and outside this package.

## Registering the proxy provider (UI / bootstrap)

```ts
import { ProxySpeechProvider } from '../golisten';

// Same-origin; no key in the browser. Ask the status endpoint first: register only when the server is configured.
const proxy = new ProxySpeechProvider();             // { baseUrl?, fetch? } for tests / another origin
const a = await proxy.availability();                // also learns the provider version from the status answer
if (a.available || a.reason === 'missing-credentials') golisten.registerProvider(proxy);
// a.reason === 'missing-credentials' => show a.detail ("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server.")
// a.reason === 'no-provider'         => no proxy on this host (static site): offer the direct key form under Advanced
// After the learner fixes .env.local and restarts: proxy.resetAuthFailure(); then gl.retryDead().
```

Call `availability()` before registering so `provider.version` is the real one (it feeds cache keys and review resets).

## Audition procedure: how a voice becomes `reviewed`

A voice is evidence-eligible only after a person has listened to it, for that language, and recorded the result.
Do this in preview mode (the preview-only audio is playable there; it earns no evidence until you finish).

1. Register the provider (Settings => Speech), then generate the QA texts: `ensureAudio(textId, { runNow: true })`
   for one text per category below. `audioStatus(textId)` will say `preview-only` with "has not been auditioned yet".
2. Open `diagnostics(textId)`: every segment `ready`, `validation.ok`, `isSpeech: true`, `providerVersion` as
   expected, `requestedLocale` / `actualLocale` as expected (note any fallback accent: for es-HN it is es-MX),
   alignment methods as expected.
3. Listen to every sentence at speed 1.0 and 0.7 (speed change must preserve pitch). Use the category table below;
   be strict about first/last words clipped, verse numbers spoken, names, numbers, the wrong language's rhythm.
4. For each defect: add a reviewed `PronunciationEntry` (`substitution` works on every provider), regenerate (only the
   affected sentences re-key), listen again. Unfixable defects mean the voice is **not** reviewed.
5. Record the decision: `setVoiceReview(voiceConfigId, 'in-review')` while working, then
   `setVoiceReview(voiceConfigId, 'reviewed', '<who>, <what you listened to>, <open issues>')` to pass, or
   `'rejected'` with the reason. The note is appended to `VoiceConfig.qaNote` with the date.
6. Confirm: `audioStatus(textId)` is `ready`, `evidenceEligible: true`. Changing the provider version (`azure-rest@N`
   bump) or swapping the voice re-keys the audio and sets the voice back to `unreviewed`: audition again.
7. A fixture (non-speech) voice cannot be made evidence-eligible by any review.

## Representative QA set (per language)

Each language gets one item per category. Texts are drawn from the bundled corpus wherever possible so the same
strings are reviewed every time; additions are appended, never replaced, so regressions are audible.

| Category | What to check |
|---|---|
| Prose | Natural rhythm across a 3-sentence story passage; sentence-final intonation; no clipped first/last word. |
| Question | Rising/interrogative contour where the language has one (es `¿...?`, de, sq, hi `क्या ...?`, th `ไหม / หรือ`). |
| Dialogue | Two speakers' lines read consecutively: consistent voice, appropriate pauses between lines. |
| Bible | 1 John 1:8-9 and John 3:16 (every course): verse numbers are never spoken; proper names (Jesus, God, John) correct; register is reverent, not chatty. |
| Names | Place and person names from the course country (Honduras/Tegucigalpa, Albania/Tiranë, Thailand/Bangkok, India/Delhi, Germany/Berlin) and Biblical names in the target language. |
| Numbers | Digits, years, ordinals, chapter/verse references spoken in words by the adapter (not by the TTS default). Confirms `speechNormalize`, not the voice. |
| Punctuation | Commas, dashes, quotes, ellipsis, parentheses, the Devanagari danda `।`, Thai sentence-break spaces: pauses where expected, punctuation never read aloud. |
| Long sentence | A 30+ word sentence with subordinate clauses: breath groups, no rushed tail, no provider length truncation. |
| Phonological challenges | See below. |

### Phonological challenges to include

- **es**: trilled `rr` vs tap `r`, `ñ`, `b`/`v`, `j` and `g` before `e/i`, written stress (`perdonó`, `creó`), diphthong/hiatus (`Dios`, `mío`), the es-HN fallback accent (es-MX is delivered until an es-HN voice exists; note the audible difference).
- **sq**: `ë` (schwa) vs `e`, `ç`, `xh`, `gj`, `q`, `sh`, `zh`, `dh` /ð/, `th` /θ/, definite suffixes (`libri`, `zemrën`), clitic-heavy verbs.
- **th**: five tones and vowel length (minimal pairs), aspirated vs unaspirated initials, final stops, no spaces (the TTS must place pauses), polite particles (`ครับ`, `ค่ะ`, `นะ`), repeated-word marker `ๆ`, numerals.
- **hi**: dental vs retroflex stops, aspirated stops, nasalization (`हूँ`), schwa deletion (`समझता`), nukta sounds (`ज़`, `फ़`), conjuncts (`क्षमा`, `ज्ञान`), postposition clitics (`ने`, `को`), danda pause.
- **de**: umlauts `ä ö ü`, ich-/ach-Laut, final devoicing (`Tag`), long vs short vowels, `ß`, `sp`/`st`/`sch`, compound stress, separable-verb stress (`fing ... an`).

## Design notes that affect QA

- Cache keys exclude `contentVersion` by design: one edited sentence must not invalidate its neighbours, and an
  unchanged sentence is reused across revisions and texts. Consequence: a segment's `textId` is the first context
  that created it; look segments up through the manifest (`segmentIds`), not by `textId`.
- Manifests are per (text, voice, content version). `audioStatus` compares the newest manifest of the current voice
  with the text's `contentVersion`, and recomputes each live sentence's cache key to find sentences without audio.
- Sentence order is `Sentence.index` and live sentences are those without `retiredInVersion`; GoListen never parses
  an id for order.
- If a provider delivers a different locale than the voice config promised, the voice config is corrected and cache
  keys (which include the actual locale) change once, regenerating that voice's audio a single time.
- Repeated sentences in one text share one segment; the manifest lists the same segment id at each position.
- A job whose provider is unusable right now is skipped, not failed: no attempt is consumed and `audioStatus` says
  it is waiting.

## Open items

- `TODO(contract)`: `AudioSegment` has no `ownerId`; ownership of testimony audio is enforced by the caller (GoTell `assertOwner`).
- `TODO(contract)`: validators for `audio/mpeg` and `audio/ogg`.
- `TODO(contract)`: `AudioAsset.generation` has no `providerVersion`; it is recorded in `generation.softwareVersion` as `"<golisten>; <provider>@<version>"` and on the `VoiceConfig`.
- `TODO(contract)`: `retryDead`, `setAllowFixture`, `unregisterProvider` and `audioStatus({ voiceConfigId })` exist on `GoListenService` only, not on the `GoListen` interface; the UI needs them for "retry" and runtime provider changes.
- `TODO(integration)`: real adapters' `speechNormalize` must already strip verse markers and expand digits; GoListen only adds a bracket/superscript safety net.
- `TODO(integration)`: the UI owns `HTMLAudioElement` wiring (`preservesPitch = true`, object-URL lifecycle, calling `playbackError` on media errors and `ended` only for a real end), showing the fixture/preview badge, and passing `store` to `listeningEmitter` (without it the emitter fails closed and completions become abandonments).
- `TODO(integration)`: bootstrap must not register a `FixtureTtsProvider` by hand; use `createGoListen({ allowFixture })` (or `setAllowFixture`) driven by the preview preference. A hand-registered fixture stays unusable while `allowFixture` is off.
- Browser CORS for the direct Azure REST endpoint remains unverified; the same-origin proxy (`server/`, `docs/SPEECH.md`) is the path that does not depend on it.

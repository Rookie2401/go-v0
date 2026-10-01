# Speech (GoListen audio)

**No real speech has been produced or auditioned in this repository's history.** Every Azure path described here —
the same-origin proxy and the direct adapter — is verified against **mocked HTTP only**. No request has ever been
sent to the live Azure service, no voice has been heard, and nothing in the audio pipeline claims otherwise. Until a
person has configured a key, generated audio, listened to it and marked the voice reviewed, the app reads without
audio and no playback counts as listening evidence. See `src/golisten/QA.md` for the verified / unverified table. `npm run speech:check` (section 8) re-runs the
provider-independent chain on demand and says, in its last line, whether any real synthesis was attempted.

## 1. Configure it (proxy first)

The default, recommended path keeps the key **out of the browser entirely**.

1. Copy `.env.example` to `.env.local` (git-ignored by the `*.local` rule) and fill in the two values:

   ```
   AZURE_SPEECH_KEY=<your Azure AI Speech key>
   AZURE_SPEECH_REGION=<its region, e.g. westeurope>
   ```

   They may instead be real environment variables of the process that starts the server. Only these two names are read
   (through Vite's `loadEnv`), only by the server process; neither starts with `VITE_`, the plugin sets no `define`, so
   they never reach `import.meta.env` or the bundle.
2. Restart the server (`npm run dev` or `npm run preview`). The plugin `speechProxy()` (`server/speechProxy.ts`) is
   mounted on both.
3. The app asks `GET /api/speech/status`. When it says `configured: true`, bootstrap registers a
   `ProxySpeechProvider` (id `speech-proxy`). Settings => Speech shows the state first: configured (with the region),
   or not configured with the exact instruction *"Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart
   the server."*
4. Generate audio for a text, audition the voice (section 5), mark it reviewed.

### Endpoints (same origin only)

| Endpoint | Answer |
|---|---|
| `GET /api/speech/status` | `{ configured, provider: "azure-speech", providerVersion, region?, format, maxChars }`. Never the key; `region` only when configured. |
| `GET /api/speech/voices?lang=es` | `{ voices: [{ id, name, lang, locale, gender? }] }` from Azure `voices/list`, filtered by language. |
| `POST /api/speech/synthesize` | JSON `{ text \| ssml, voice, locale, format }` (format `riff-24khz-16bit-mono-pcm`) -> `audio/wav` bytes. Headers `x-speech-delivered-locale` (the voice's own locale), `x-speech-requested-locale`, `x-speech-provider-version`. |

Errors are JSON `{ error, message }`: `401 missing-credentials` (not configured, or Azure answered 401/403),
`429 rate-limited` (our limit or Azure's; `Retry-After` in seconds), `502 upstream-error` (Azure 5xx, or a body that is
not a WAV), `504 upstream-timeout` / `upstream-unreachable`, `400 bad-request`, `403 forbidden-origin`,
`413 payload-too-large`, `405`, `404`. Upstream bodies and headers are never forwarded.

Guards: same-origin only (an `Origin` that differs from `Host`, or `Sec-Fetch-Site: cross-site` / `same-site`, is
refused), a 20 kB request body limit, texts up to 5000 characters, 30 requests per minute (voices + synthesize), a 20 s
upstream timeout. The key appears in exactly one place: the `Ocp-Apim-Subscription-Key` header of the request the
server makes to Azure. It is never in a response body or header, an error message or a log line (tested by searching
every output, including what a hostile upstream echoes back).

The proxy exists only on the dev and preview servers. A plain static host (for example GitHub Pages) has no
`/api/speech/*`, and the app reports "no speech proxy at this address".

### Advanced: enter a key directly (no server)

For a static deployment, or a device with no server, Settings => Speech => Advanced accepts a key and region and
registers the direct `AzureSpeechProvider` (id `azure-speech`). Trade-offs, plainly:

- The key then exists in the browser. It is held in memory by default and persisted only if the user ticks "remember
  on this device" (then it sits in this browser's storage, readable by anything running in the page).
- The browser must be allowed to call `https://{region}.tts.speech.microsoft.com` cross-origin with the custom
  headers. Whether it is has **not** been verified; if not, only the proxy works.
- Backups never include it (section 4), but the user is responsible for the device it lives on.

The two providers have different ids, so audio made through one is never mistaken for the other and each keeps its own
voice reviews.

## 2. What is recorded

Per **voice configuration** (`VoiceConfig`): provider id and **provider version** (for the proxy, taken from the status
response, `azure-proxy@1`; for the direct adapter `azure-rest@1`), voice id, `requestedLocale` (what the course asked
for, e.g. `es-HN`) and `actualLocale` (what is delivered), `isSpeech`, `reviewStatus` (always starts `unreviewed`), and
a dated `qaNote` (including "Fallback accent: course asked for es-HN, provider delivers es-MX." when the live or static
voice list has no es-HN voice).

Per **asset** (`AudioAsset`): `isSpeech`, the delivered locale (the voice's own locale as the proxy states it), MIME,
sample rate, channels, duration, checksum, validation result, and `generation` (provider id, engine, voice id, source
and speech text hashes, normalizer version, pronunciation lexicon version, `softwareVersion` =
`"<golisten>; <provider>@<version>"`). Per **segment**: cache key, status, the pronunciation entries used. Per **job**:
attempts, last error, log, next attempt. Alignment is sentence-level by construction; the Azure REST endpoint returns no
word marks and none are ever claimed.

The **key and region are never recorded** by GoListen. The proxy provider knows only the region the server reports.

## 3. Cache keys: what regenerates

A segment's identity is a hash of: the hash of the exact displayed sentence, the speech text sent to the provider, the
language, the delivered locale, provider id, engine, voice id, synthesis settings, normalizer version, the
pronunciation lexicon version and the provider version. The text's content version is deliberately **not** in the key.

Consequences:

- An unchanged sentence is reused across revisions and texts: no request, no cost.
- A **content revision regenerates only the changed sentences** (a new sentence key gives a new hash; the old sentence
  is retired and never voiced).
- Changing the voice, the provider (proxy vs direct), the provider version or a pronunciation entry used by a sentence
  re-keys that audio; switching back reuses it. A provider-version change also resets that voice's review to
  `unreviewed`, because nobody has heard the new audio.

## 4. Backups and secrets

`exportLearner` (`src/backup`) exports the learner's source-of-truth data and never any credential: not the direct key,
not the region, nothing about the proxy's environment. A test builds a store used with each provider and searches the
serialized backup for the key. Generated audio is not exported at all.

## 5. Voice review (how a voice becomes evidence-eligible)

The procedure is in `src/golisten/QA.md` ("Audition procedure"): register the provider, generate the representative QA
texts, check `diagnostics(textId)` (every segment `ready`, `isSpeech: true`, expected provider version and locales),
listen to every sentence at speed 1.0 and 0.7, fix defects with reviewed pronunciation entries, then record the decision
with `setVoiceReview(voiceConfigId, 'reviewed' | 'approved' | 'rejected', note)`. Only reviewed real speech can earn
listening evidence (evidence policy v2, rule 5). The development fixture (tone bursts, `isSpeech: false`, only with
"Preview unreviewed content") is preview-only and can never be made evidence-eligible by any review.

## 6. Every state the learner can see

`audioStatus(textId)` is the single source; the UI shows its `state` and `reason`. Reading always works without audio.

| State | When | What the learner sees (reason, abridged) |
|---|---|---|
| `unavailable` — no provider | No speech provider registered (static host, proxy not found) | "Audio is not available — no speech provider is configured. You can still read." |
| `unavailable` — missing credentials | Proxy says `configured: false`, or a key was rejected (401/403) | "…the speech provider has no working credentials in this session…" plus "Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server." |
| `unavailable` — offline / provider error | Device offline; proxy unreachable or answering 5xx | "…the device is offline…" / "…the speech provider reported an error…" |
| `unavailable` — waiting | Jobs queued while the provider cannot run | "Audio generation is waiting for the speech provider." No attempt is consumed. |
| `not-generated` | Provider usable, nothing generated for this text and voice | "No audio has been generated for this text yet (voice …). Reading works without it." |
| `generating` | Jobs pending or being retried | "Generating audio: x of y ready." plus "k sentences are being retried after an error (…)" |
| `generating` (partial) | Some ready, some failed, some pending | "x of y sentences ready; n failed: <first error>; k still generating." |
| `failed` | A sentence's job died (key rejected, bad request, retries exhausted, invalid audio) | "n of y sentences could not be voiced: <error>. Fix the cause, then retry." |
| `failed` (partial) | Some ready, some failed | "x of y sentences ready; n failed: <first error>. The ready sentences can still be played. Fix the cause, then retry." The ready sentences play; the failed ones are skipped; `diagnostics(textId).failedSentences` lists each failed sentence with its error. |
| `stale` | Audio made for an older content version, or some live sentences have no audio | "This audio was made for version N…" / "k of y sentences … have no audio (the text changed…). Regenerate." |
| `preview-only` | All sentences ready but the audio is fixture tones, or the voice is unreviewed / in review / rejected | "…Preview only: playing it earns no listening evidence until a person auditions it and marks it reviewed." |
| `ready` | All sentences ready, real speech, voice reviewed | none; `evidenceEligible: true` — the only state that can earn listening evidence |

Failure kinds behind the reasons (`TtsProviderError.kind`): `missing-credentials` (never retried), `bad-request` (never
retried), `rate-limited` (retried, `Retry-After` honoured), `server` (retried with backoff, dead after `maxAttempts`),
`network` (retried, includes proxy timeouts), `bad-response` (empty / not a readable WAV; retried). A dead job stays dead
until `retryDead()` (the UI's "retry").

## 7. What is not verified

Nothing in this repository has contacted the live Azure service or the live proxy end to end. Specifically unverified:
that Azure accepts the SSML, headers and `riff-24khz-16bit-mono-pcm` as sent; that the voice names in the static
fallback table exist; the live `voices/list` shape the proxy filters; real 401/429/5xx bodies; browser CORS for the
direct adapter; the proxy's timeout and rate-limit numbers under real load; and every voice's sound and pronunciation.

## 8. The readiness check: `npm run speech:check`

One command, three parts (`scripts/speech-check.mts`; the check functions are in `scripts/speechChecks.ts` and are tested in
`test/server/speechChecks.test.ts`). It reads the environment exactly as the proxy does (`readSpeechEnv`: process
environment, then `.env.local` / `.env`) and never prints, logs or stores the key.

1. **Configuration.** `configured: yes (region <region>)`, or `configured: no — set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in
   .env.local and restart the server` plus which variable is missing. "Configured" is the proxy's own answer (both
   variables present, a well-formed region).
2. **The provider-independent chain**, in process, no network: the real GoListen, the real `ProxySpeechProvider`, whose
   `fetch` is routed to the real `handleSpeechRequest` with a throw-away test key, and a MOCKED upstream that answers with a
   valid PCM16 WAV. Client, proxy handler and pipeline are therefore all the real code; only Azure is pretended. The table
   covers: cache-key composition; requested (`es-HN`) vs delivered (`es-MX`) locale on voice and asset; voice metadata and
   review status (unreviewed => `preview-only`, reviewed => `ready` and evidence-eligible); content-version invalidation
   through the real importer (one edited sentence => `stale`, re-ensure regenerates exactly one segment); retry with backoff
   after 429 / 5xx then success with no duplicate asset; dead after four attempts with the reason in `audioStatus` and
   `diagnostics`; partial generation ("2 of 3 sentences ready; 1 failed", ready sentences playable); the unconfigured
   state with the exact instruction; fixture audio and failed / abandoned playback never evidence-eligible; reviewed real-speech
   playback emitting completion with `speech: true` (exposure only: learner state belongs to GoLearn); and the key appearing
   in no captured output, stored row, event, job log or thrown message (the mocked upstream even echoes it in an error body).
3. **One real synthesis, only when both variables are configured.** The first sentence of the verified Spanish Scripture
   document (`data/corpus/es/bible-1john-1.json`, read from the loaded corpus, never retyped; the same id exists in other
   languages, so the language is part of the selection) is synthesized once through `handleSpeechRequest` against the live
   service, validated with `validateWav`, and its duration, sample rate and delivered locale are printed with the statement
   that a human audition is still required before the voice counts. Without both variables it prints
   `REAL SPEECH: NOT VERIFIED — set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local`.

The exit code is decided by part 2 only, plus part 3 when it was attempted and failed. A passing part 2 proves the code path;
it says nothing about the live service or about how any voice sounds. A passing part 3 proves that valid audio arrived once;
it is **not** an audition and does not mark any voice reviewed.

**Status of this repository, unchanged: no real speech has been produced or auditioned here unless part 3 above actually ran,
with credentials, on someone's machine.** The sample below is from a run without credentials, so part 3 did not run
(each row also prints a measured detail line, omitted here).

```text
== 1. Configuration ==
configured: no — set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server
missing: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION

== 2. Provider-independent chain (real GoListen + ProxySpeechProvider + proxy handler, MOCKED upstream; no network) ==
status  check             detail
PASS    cache-key         cache key composition: changes with text, voice, locale, provider version, settings; stable otherwise
PASS    setup             real chain: import, resolve voice, generate three sentences through the proxy handler
PASS    locale            requested vs delivered locale recorded on voice and asset (course asks es-HN)
PASS    voice-review      voice metadata + review status recorded: unreviewed => preview-only; reviewed => ready and evidence-eligible
PASS    invalidation      content-version invalidation: one edited sentence => stale; re-ensure regenerates exactly one segment
PASS    retry             retry with backoff after 429 then 5xx, then success; no duplicate asset
PASS    dead              dead after max attempts (4) with the reason visible in audioStatus and diagnostics
PASS    partial           partial generation visible ("x of y sentences ready; n failed") and the ready segments playable
PASS    unconfigured      unconfigured proxy => unavailable with the exact instruction; nothing written, nothing sent
PASS    fixture-playback  fixture audio and failed / abandoned playback are never evidence-eligible
PASS    real-playback     reviewed real-speech playback emits completion with speech:true (exposure only; GoLearn decides what it is worth)
PASS    key-secrecy       the key never appears in any output, stored row, event, log line or thrown message

12/12 provider-independent checks passed.
These prove the code path only. They say nothing about the live service or how any voice sounds.

== 3. Real speech ==
REAL SPEECH: NOT VERIFIED — set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local
```

With credentials, part 3 prints instead (values vary):

```text
REAL SPEECH: one synthesis through the proxy handler succeeded
  voice <voice>; requested locale es-HN; delivered locale <locale>
  duration <ms> ms; sample rate 24000 Hz; <n> bytes; validateWav ok
  A human audition is still required before this voice counts: ...
```

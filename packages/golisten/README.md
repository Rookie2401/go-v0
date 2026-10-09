# packages/golisten, the shared pronunciation and phonology subsystem

GoListen is a subsystem of the Go ecosystem (`docs/ecosystem/GO-ECOSYSTEM-CHARTER.md`), not an application. One engine,
two uses: ordinary playback for GoLearn (now) and structured listening assessment for GoReview (next).

It imports only the Repository contract (`../repository-contract/src`). It does not import the extension, the service,
the store or the engine, reads and writes no store, and records nothing: it returns payloads and the caller decides what
to append. `test/golisten/pronounce-boundary.test.ts` enforces the boundary, no console output and no stored credentials.
(The older `src/golisten/` module is a different, retired course-audio pipeline; nothing here depends on it.)

```ts
const golisten = createGoListen({
  registries: defaultRegistries(),                 // sq, es (device + Azure), the de demonstration recording, and hi/th/nb/nn with no voice (honest capability reporting only)
  consent: () => ({ remoteSpeech: learner.allowsRemoteSpeech }),
  // speech, audio, fetch, objectUrl, utterance, now: defaults to the browser's; tests inject fakes
  // speechProxyBase: '/api/speech'                // the same-origin proxy of server/speechHandler.ts
});
const r = await golisten.pronounce({ languageId: 'sq', text: 'mirëdita', kind: 'word' });
if (r.ok) { r.playback.play(); /* r.voice, r.provenance, r.phonetic */ } else { /* r.reason, r.message, r.alternatives */ }
```

`pronounce` never throws and never blocks the reader. Every failure is `ok: false` with a `reason`
(`no-voice | wrong-language-voice | no-consent | provider-error | unsupported-kind | offline`), a message that never
contains the text, and `alternatives` (what the learner can do instead, including the honest gaps). Providers are tried
preferred first, then recorded, device, remote; a request for a specific `voiceId` only ever tries that voice's provider.
When several fail, the most actionable reason leads (`provider-error`, `offline`, `no-consent`, `wrong-language-voice`,
`unsupported-kind`, `no-voice`) and the other messages follow. `phonetics()` works with no audio and no consent.

## Contracts (`src/contracts.ts`)

| contract | what it is |
|---|---|
| `PronunciationRequest` | `languageId, varietyId?, text, kind: word/phrase/sentence, context?, preferred?, rate?`, plus `voiceId?` (one specific voice) and `autoplay?` |
| `PronunciationResult` | `{ ok: true, voice, playback, provenance, phonetic? }` or `{ ok: false, reason, message, alternatives }` |
| `VoiceDescriptor` | `voiceId, languageId, varietyId?, provider, execution: local/remote, synthetic, licence, qualityVerification, knownLimitations, supports, suitableForAssessment, label` |
| `PronunciationProvenance` | `source: device-tts/remote-tts/recording, voiceId, providerId?, generatedFromText, reviewedRecording?, note` |
| `PlaybackHandle` | `play/pause/stop/replay/setRate/dispose`, `state: idle/playing/paused/ended/error`, `replays`, `rate`, `onEnd(cb)`, `durationMs?`. Rate is clamped to 0.5 to 1.5; `replays` counts every hearing after the first |
| `PhoneticDetail` | `ipa?, respelling?, syllables?, stress?, tones?, notes, source` |
| `AudioStimulus`, `AssessmentSource` | the GoReview interface, below |

### The evidence-direction rule

Audio generated from an already selected textual interpretation never validates that interpretation and never yields
listening evidence: the machine said what the text said. Only a reviewed human recording, which exists independently of
the text, can. `isIndependentEvidence(provenance)` is that rule as code: true only for `source: 'recording'` with
`generatedFromText: false` and `reviewedRecording: true`. Every synthetic path (device, remote) is false whatever the
voice's quality, and so is an unreviewed recording such as the German demonstration. Playback itself is exposure, not
comprehension: `events(result, playbackEnded)` returns a `PronunciationPlayed` payload
`{ voice: 'synthetic' | 'recorded', voiceId, durationMs?, repeated }` with `evidence: { quality: 'none' }`, carries no
text, returns `null` when nothing was played, and cannot return a `ListeningAssessed` payload.

## Registry for Albanian (`sq`)

| source | entry | availability | what is claimed |
|---|---|---|---|
| recorded | none | not applicable | No Albanian recordings exist; nothing is claimed |
| device | every installed voice whose language tag is exactly `sq-AL` or `sq` (also written `sq_AL`) | `available` when one exists, else `unavailable` ("none installed") | synthetic, local, unverified. An English or other-language voice is never substituted, and neither is another Albanian region (`sq-XK`) until a registry lists it. A voice that is not `localService` sends the text to the browser vendor, so it needs the same consent as a remote voice |
| remote | `sq-AL-AnilaNeural`, `sq-AL-IlirNeural` (Azure Neural, through the same-origin proxy) | `needs-consent` without consent (no request is made), `needs-key` when the proxy reports no key (or rejects it), `available` when the key exists and the voices list offers the voice, `unavailable` when there is no proxy or no network | synthetic, remote, licence "Microsoft Azure Speech terms (owner's subscription)", `unverified`, `suitableForAssessment: false`. The proxy has only been exercised against a mocked upstream |

Not available for Albanian, honestly: no recording of any kind, no native-reviewed audio and therefore no Albanian
listening evidence, no Albanian device voice on the development machine, no live call to Azure from this repository, no
native review of any synthetic voice, and no stress or whole-word transcription (the phonetic detail lists letter and
digraph values, `ë ç q sh zh xh th dh gj nj ll rr y x c j`, derived from spelling by rule and labelled as unreviewed).

`demoGermanRegistry({ url })` registers the one audio asset in this repository, `test/fixtures/golisten/de-guten-tag.wav`
(Wikimedia Commons De-Guten_Tag.oga, public domain, uploader Beagle Beck), as a recording that says "Guten Tag!" and
nothing else: `unverified`, `suitableForAssessment: false`, labelled "demonstration asset". A recording serves a request
only when its text matches; it never plays for other text. The host serves the file and passes its URL.

Other languages: `deviceRegistry(languageId, langTags, name)` gives a device-only registry with the same strict matching.

## Remote speech rules (`src/providers/remote.ts`)

Nothing is sent unless `consent().remoteSpeech === true`, checked at the moment of each call; without it the result is
`no-consent` and `fetch` is never called. The text goes only in the POST body to `{speechProxyBase}/synthesize`
(`{ text, voice, locale }`, shape of `server/speechHandler.ts`), never in a URL, a log line or an error message. There is
no key in the browser; the proxy holds it. Availability lookups (`/status`, `/voices?lang=sq`) carry no text and are
cached for a minute.

## How GoReview uses the assessment interface

```ts
const src = golisten.assessment();
const stim = await src.prepareStimulus({ languageId: 'sq', kind: 'word', text, itemIds: ['sq:lex:0042'] });
if ('unavailable' in stim) { /* run a written card instead; say why */ }
const playback = src.playbackOf(stim);            // show the answer choices, not the text; playback.play(); the learner may replay
const meta = src.scoringMetadata(stim, playback.replays);   // { voice, hinted, replays, eligibleForEvidence }
const payload = listeningAssessedPayload(stim, meta, { correct, responseMode: 'choice', latencyMs });
const evidence = assessmentEvidence(meta);        // quality 'none' unless the stimulus was a reviewed recording
// append { kind: 'ListeningAssessed', payload, evidence, subject: { itemIds: stim.itemIds } } through the Repository
```

* `answerHidden: true` always; `answerShownBefore: false` always in the payload (the contract refuses anything else).
  Recorded and remote stimuli carry no text; a device stimulus carries the text only in `audio.text` because the voice
  must speak it, and GoReview must not render it before the response. The stimulus `voice` metadata may name a recording's
  source file, so show it only after the response.
* `validity.eligibleForEvidence` is true only for a reviewed human recording (`native-reviewed`) whose registry entry is
  `suitableForAssessment`. Synthetic stimuli still run as listening practice, with `voice: 'synthetic'` in the payload and
  `evidence.quality: 'none'`. `scoringMetadata` re-derives eligibility and cannot be raised by editing the stimulus.
* `hinted` is true when more replays were used than `replaysAllowed` (default 2). Eligible and hinted gives `weak`,
  eligible and unhinted `moderate`; the engine may lower either and never raises it.

## Provenance

Playback state machine, provider shapes and the audio-port idea are adapted from the sibling repository's
`2GoLearn/packages/core/src/listen-engine` (player, playerSession, audioPort, voices, proxyProvider), simplified to this
contract. The device-voice practice label comes from `src/ui/reader/useListen.ts`.

Tests: `test/golisten/pronounce-*.test.ts` (shared fakes in `pronounce-fakes.ts`).

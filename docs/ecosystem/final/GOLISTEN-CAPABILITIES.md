# Current implementation audit

The capability table below is a historical certification snapshot. For the current shared registries, playback,
consent and assessment lifecycle, see `../../golisten/CURRENT-SYSTEM-AUDIT-2026-10-11.md` and
`../../../packages/golisten/README.md`. In particular, the current registry includes device voices for all seven
languages and Azure entries for sq/es/de/hi/th; device voice availability still depends on the user's browser.

# GoListen — three separated capabilities and the voices that exist

Status: 2026-10-09. GoListen (`packages/golisten`) is a shared subsystem, not an application. Sources: `packages/golisten/README.md`,
`packages/golisten/src/registry.ts`, `audit/MODEL-SCHEDULER-LISTEN.md` §5–§6, and the tests named below. I ran
`test/golisten/pronounce-{assessment,boundary,contract,device,recorded,registry,remote}.test.ts`, `test/audit/listen.voices.test.ts` and
`test/audit/listen.evidence.test.ts` on 2026-10-09 at 10:11: 9 files, 119 tests, all passed. No real audio, browser or device was involved in any of them (speech, audio and fetch are fakes).

## 1. The three capabilities

| capability | what it does | what it writes | where it stops |
|---|---|---|---|
| playback | `pronounce()` plays a word, phrase or sentence with a device, remote or recorded voice; never throws, never blocks the reader | `PronunciationPlayed` `{ voice: 'synthetic' or 'recorded', voiceId, durationMs?, repeated }`, `evidence: { quality: 'none' }`, no text; nothing at all if nothing played | exposure only |
| phonological evidence | `phonetics()` gives letter-level notes with no audio and no consent | nothing (display only) | Albanian only has a rule set (letter and digraph values `ë ç q sh zh xh th dh gj nj ll rr y x c j`, labelled unreviewed); Spanish has none in GoListen |
| listening assessment | `assessment()` prepares a stimulus with `answerHidden: true`, scores replays and hints, and builds a `ListeningAssessed` payload for GoReview | `ListeningAssessed` with `answerShownBefore: false` | counts as listening evidence only for a reviewed human recording; nothing that ships qualifies |

## 2. The two rules

**Playback never counts as comprehension.** The engine treats `PronunciationPlayed` and `ListeningCompleted` as exposure only
(`packages/repository-engine/src/evidence.ts`, principle (b)). Tests: `test/audit/listen.evidence.test.ts` "every playback outcome ... is a PronunciationPlayed with evidence quality none, or nothing";
"even a reviewed, suitable human recording is only exposure when merely played"; "50 plays (synthetic and recorded, repeated, with a lying evidence note and a smuggled correct) move exposure only";
`pronounce-contract.test.ts` "is never a ListeningAssessed payload, in any state, for any result"; and the contract refuses a `ListeningAssessed` whose `answerShownBefore` is true (audit L3).

**Synthetic speech never counts as listening evidence.** `isIndependentEvidence(provenance)` is true only for `source: 'recording'`, `generatedFromText: false`, `reviewedRecording: true` — exactly one of 18 combinations
(`listen.evidence.test.ts` "is true for exactly one of the 18 combinations"). The engine weight is `RULES.listening = { recorded: 0.8, synthetic: 0, hintedDiscount: 0.3, selfReportReliability: 0.5 }`
(`evidence.ts` line 48): a `ListeningAssessed` with `voice` other than `recorded` yields no listening observation whatever evidence note the producer attaches (defect D8, fixed; test `listen.evidence.test.ts`
"DEFECT D8 (fixed) ..." and `test/repository/engine/engine.test.ts` line 443). A recording is eligible only if its registry entry is `native-reviewed` **and** `suitableForAssessment`
(`pronounce-assessment.test.ts` "a reviewed human recording marked suitable IS eligible; reviewed but not suitable is not; nothing synthetic ever is"). A forged eligibility flag on a stimulus the source made is overruled
(audit L9), but a different `assessment()` instance with no provenance record takes the descriptor at its word (O2; GoPractice keeps one instance). Chain tested: synthetic moves nothing, hinted moves `assistedRecognition`, a clean reviewed recording moves `listeningRecognition` only.

## 3. Language by language (registries: `defaultRegistries()` in `registry.ts`; audit §5.2)

| language | voice sources registered | validated by tests | demo / fixture | audio-quality verdict |
|---|---|---|---|---|
| sq | device template (tags `sq-AL`, `sq`; strict match, no English or `sq-XK` substitution); Azure `sq-AL-AnilaNeural`, `sq-AL-IlirNeural` (synthetic, remote, unverified, consent plus server key); no recordings | strict matching, consent gating, availability states, no network without consent (`pronounce-device`, `-remote`, `-registry`, `listen.voices`); rule-based letter notes | `test:sq-liber-recording` exists only inside `test/certification/albanian-reference-e2e.test.ts` and `test/gopractice-e2e` (label "TEST asset (not real Albanian audio)") | Not verified by a native speaker. No Albanian recording, no device voice installed on the development machine, Azure never called live (proxy tested against a mock). No listening-evidence audio. |
| es | device template (`es-HN`, `es-419`, `es-MX`, `es-ES`; bare `es` and other varieties not substituted); Azure `es-HN-CarlosNeural`, `es-HN-KarlaNeural`, `es-MX-DaliaNeural`; no recordings | `test/multilang/golisten-gotell.test.ts` (registry data, strict match, consent, proxy listing, pronounce on a fake Spanish voice) | none | Not verified by a native speaker. No phonetic rule set in GoListen. The extension accepts bare `es` and `es-US` voices that GoReview's registry does not (O4). No listening-evidence audio. |
| de | one recording, "Guten Tag!" (Wikimedia Commons, PD-self), phrase only, unverified, not suitable for assessment; no device template in the shared registry; the pack names Azure `de-DE-KatjaNeural`, `de-DE-ConradNeural`, not registered | `pronounce-recorded.test.ts` (plays the fixture, serves only matching text, not independent evidence) | the clip is a demonstration asset ("not a pronunciation resource for German") | Demonstration only; performer not independently verified; reports `available: true` but cannot speak any other text (D7, open). No listening-evidence audio. |
| hi | `noAudioRegistry`: no voice, recording, device template or remote voice; the pack names `hi-IN-SwaraNeural`, `hi-IN-MadhurNeural`, not registered | availability answers "cannot speak" with reasons (`listen.voices` "DEFECT D7 (fixed)") | none | No audio exists. The extension reader can use a device voice tagged `hi` or `hi-IN`; GoReview reports the language not hearable. Not verified. |
| th | as hi; the pack names `th-TH-PremwadeeNeural`, `th-TH-NiwatNeural`, not registered | as hi | none | No audio exists. Extension tags `th`, `th-TH`. Not verified. |
| nb | as hi; the pack names `nb-NO-PernilleNeural`, `nb-NO-FinnNeural`, not registered | as hi, plus the Norwegian rule: `nn-NO` never serves nb; `nb-NO`, `no-NO`, `no` serve nb only | none | No audio exists. Extension tags `nb`, `nb-NO`, `no`, `no-NO`. Not verified. |
| nn | `noAudioRegistry`; the pack names no voice | as nb: `nb-NO`, `no-NO`, `no` are never accepted for nn | none | No audio exists. Extension tags `nn`, `nn-NO`. Not verified. |

Listening-evidence audio exists for none of the seven languages: no registry holds a native-reviewed recording marked suitable for assessment, so every `ListeningAssessed` the product can produce today carries evidence quality `none`
(audit §5.2). Listening practice works only where a voice is available; listening knowledge cannot be estimated for any language.

## 4. Open items that touch GoListen

* D7 (partly fixed): hi, th, nb, nn are still not hearable in GoReview; de reports available for one phrase only.
* D9 fixed, O3 observation: the voice descriptor of the German clip names its source file; it is shown only after the response.
* The speech proxy has no authentication of its own and has never been called against the live service.
* Pack manifests and registry disagree for sq (`deviceVoiceExpected: false` while the registry offers a device template) and for de/hi/th/nb (pack names Azure voices the registry does not hold).
* The README example comment for `defaultRegistries()` still says "sq and the de demonstration" (stale; the function now returns seven registries).

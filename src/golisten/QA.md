# GoListen QA

GoListen turns sentences into validated audio assets. This file says what is actually verified, what
is not, and how a human reviews a real voice before a learner hears it.

## Honest status

**No real speech has been generated or heard by anyone.** The only provider in the repository is
`FixtureTtsProvider` (`id: "fixture"`): it renders short sine-tone bursts, one per word-like chunk, as
a real PCM16 mono 22050 Hz WAV. It is labelled `not speech` everywhere (voice name, engine
`fixture-tone-v1`, `VoiceConfig.qaNote`), never returns word marks, and the UI must badge it
("fixture audio - not speech"). Every `VoiceConfig` is created with `approved: false`; only a human QA
pass flips that, never the pipeline.

### Verified (automated, fixture audio only)

| Area | What the tests establish |
|---|---|
| WAV encode / validate | Canonical header; measured duration, peak, RMS, leading/trailing silence, silence ratio, clipping; rejects empty, garbage, header-only, truncated, near-silent, all-zero, non-PCM16, too-short, clipped, long edge silence, sample-rate mismatch; never throws. |
| Validation gate | Silent / empty / garbage / MP3 (cannot be validated) / lying-duration provider output is never stored, never becomes an `AudioAsset`, and its segment never becomes `ready`. A ready segment always has existing bytes and `validation.ok`. |
| Cache keys | Display-text hash, speech text, lang, actual locale, provider, engine, voice, settings, normalizer version, lexicon version (plus provider version) each change the key; settings order does not; field boundaries are unambiguous. |
| Idempotency | A second `ensureAudio` reuses every segment, synthesizes nothing, creates no job or asset; concurrent calls synthesize once per job. |
| Invalidation | Editing one sentence re-keys only that sentence; reverting the edit reuses the old audio; a pronunciation-entry version bump re-keys only the sentences that used it. |
| Verse markers | Scripture speech text has no digits; `[16]` in a display text is stripped from speech (adapter path and the pipeline's own safety net, both recorded as transformations); the canonical display text is untouched. |
| Locale honesty | `requestedLocale` (course preference, e.g. `es-HN`) vs `actualLocale` (what the voice list offers, `es-419`) are both stored; a provider that delivers another locale is recorded on the asset and corrects the voice config; `approved` survives re-resolution. |
| Jobs | Exponential backoff (`nextAttemptAt`), `maxAttempts` 4 then `dead`, segment `failed`, dead jobs are not silently resurrected (`retryDead` is explicit), retries never create a second asset, stale `running` jobs recover. |
| Alignment | Sentence alignment is by construction (0..duration, confidence 1). Word alignment exists only from provider marks, only if the provider declares word boundaries, only for marks that exactly cover one adapter token, and only after the marks pass sanity checks (inside text and audio, time-ordered, finite). Thai maps onto its segmented tokens. Confidence is 0.9 when the speech text equals the token sequence, 0.7 when mapped through a transformed speech text. The fixture never yields word alignments. |
| Testimony sentences | Text-less segments (`sentenceIds: []`), content-addressed, empty and punctuation-only text refused / failed. |
| Player | Pure state machine: next/prev/seek (segment, sentence, paragraph), replay, sentence and phrase loop (phrase needs a real aligned range), speed clamped 0.7-1.25 with `preservesPitch` on every rate effect, four transcript modes, prefetch window, abandonment, finish/restart. |
| Listening events | Correct dedupe keys (completion once per segment per pass, replay opens a new pass), speed and transcript state carried on every event, end-to-end over a generated manifest. |

All of the above run for es, sq, th, hi and de where the behaviour is language dependent.

### Unverified (needs a real provider and a human)

| Area | Status |
|---|---|
| Every real voice (Azure / Google / ElevenLabs / ...) | **Not built, not heard.** Nothing here says any voice sounds correct, natural, or even intelligible. |
| Pronunciation correctness of any word | Unverified. Overrides are applied mechanically; whether the fix is right is a human judgement. |
| `ssml-phoneme` / `lang-tag` against a real engine | SSML is generated (tested against a fake provider's request), never sent to a real engine. `lexicon` overrides are not applied at all. |
| Word boundary marks from a real provider | Mapping proven only with a test-only provider whose marks are true by construction. Real marks (Thai segmentation differences, SSML offsets shifting text positions) are untested; span-level or sub-token marks are deliberately dropped, not split. |
| Locale availability | Only the fixture's voice list is known. Whether a provider offers `es-HN`, `sq-AL` or `hi-IN` is unknown. |
| MP3 / OGG | Cannot be validated; such a provider's audio will be refused until a validator exists (`TODO(contract)`). |
| Loudness, noise, clicks, truncated words, voice consistency across a text | No measurement beyond peak / RMS / silence / clipping. |
| Real playback | The player state machine is DOM-free; `HTMLAudioElement` behaviour (`preservesPitch`, gapless advance, prefetch timing, autoplay policy) is for the UI package and a browser. |
| Whether listening helps acquisition | Not evaluated. GoListen reports events only; GoLearn decides evidence. |

## Release gate for a real voice

A provider/voice may be marked `approved: true` only after a human reviewer has listened to the set
below for the language, recorded the result in `VoiceConfig.qaNote`, and logged any fix as a
`PronunciationEntry` (reviewed: true). Unapproved voices must be visibly marked in the UI.

## Representative QA set (per language)

Each language gets one item per category. Texts are drawn from the bundled corpus wherever possible so
the same strings are reviewed every time; additions are appended, never replaced, so regressions are
audible. Category, what to listen for, and the language-specific traps:

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

- **es**: trilled `rr` vs tap `r`, `ñ`, `b`/`v`, `j` and `g` before `e/i`, written stress (`perdonó`, `creó`), diphthong/hiatus (`Dios`, `mío`), es-HN fallback accent (es-419 is delivered until es-HN exists; note the audible difference).
- **sq**: `ë` (schwa) vs `e`, `ç`, `xh`, `gj`, `q`, `sh`, `zh`, `dh` /ð/, `th` /θ/, definite suffixes (`libri`, `zemrën`), clitic-heavy verbs.
- **th**: five tones and vowel length (minimal pairs), aspirated vs unaspirated initials, final stops, no spaces (the TTS must place pauses), polite particles (`ครับ`, `ค่ะ`, `นะ`), repeated-word marker `ๆ`, numerals.
- **hi**: dental vs retroflex stops, aspirated stops, nasalization (`हूँ`), schwa deletion (`समझता`), nukta sounds (`ज़`, `फ़`), conjuncts (`क्षमा`, `ज्ञान`), postposition clitics (`ने`, `को`), danda pause.
- **de**: umlauts `ä ö ü`, ich-/ach-Laut, final devoicing (`Tag`), long vs short vowels, `ß`, `sp`/`st`/`sch`, compound stress, separable-verb stress (`fing ... an`).

### Review procedure

1. `ensureAudio` the QA texts with the candidate voice; open `diagnostics()` and confirm every segment
   is `ready`, validation `ok`, `requestedLocale` / `actualLocale` as expected, alignment methods as expected.
2. Listen at speed 1.0 and at 0.7; speed change must preserve pitch (player uses `preservesPitch`).
3. For each defect: fix via a reviewed `PronunciationEntry` (substitution works on every provider;
   `ssml-phoneme` only where `capabilities().phonemeOverrides`), regenerate (only affected sentences re-key), re-listen.
4. Record reviewer, date, voice, and unresolved issues in `VoiceConfig.qaNote`; only then set `approved: true`.

## Design notes that affect QA

- Cache keys exclude `contentVersion` by design: one edited sentence must not invalidate its neighbours,
  and an unchanged sentence is reused across revisions and texts. Consequence: a segment's `textId` is
  the first context that created it; look segments up through the manifest (`segmentIds`), not by `textId`.
- If a provider delivers a different locale than the voice config promised, the voice config is corrected
  and cache keys (which include the actual locale) change once, regenerating that voice's audio a single time.
- Repeated sentences in one text share one segment; the manifest lists the same segment id at each position.

## Open items

- `TODO(contract)`: `AudioSegment` has no `ownerId`; ownership of testimony audio is enforced by the caller (GoTell `assertOwner`).
- `TODO(contract)`: validators for `audio/mpeg` and `audio/ogg`.
- `TODO(integration)`: real adapters' `speechNormalize` must already strip verse markers and expand digits; GoListen only adds a bracket/superscript safety net.
- `TODO(integration)`: the UI owns `HTMLAudioElement` wiring (`preservesPitch = true`), object-URL lifecycle, and showing the fixture badge.

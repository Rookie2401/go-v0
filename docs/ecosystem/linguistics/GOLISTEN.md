# GoListen integration with the card's Sound section (Linguistic Engine V2)

What the card plays, what it shows, and what it does not claim.

## In the page (content script)

`packages/golearn-extension/src/content/voice.ts` is GoListen's **device provider only**: a word is spoken with
`window.speechSynthesis` when the device has a voice whose language tag the registry accepts (`golisten/src/registry.ts`:
Albanian `sq-AL`/`sq`, and the device registry for the other languages); an English voice is never "close enough"; a
voice that is not local needs the learner's remote-speech consent (`remoteConsent`, read each time). Recorded and remote
voices are not played inside web pages by this version, and GoListen's top-level `createGoListen` is not imported, because
it carries the remote provider's network code that must not be in the content bundle (`test/extension/bundle.test.ts`).

Synthetic speech is practice and exposure: it is reported as `PronunciationPlayed` and never as listening evidence
(`FEATURES.listen` in `src/core/config.ts` governs the listening features; the card never writes a listening statement).

The card's "Pronounce (practice)" button and the note under it ("This device has no sq voice (accepted tags: sq-AL, sq)…",
or the voice it used) are unchanged by V2; the worker's `golearn:pronounce-info` reply says whether a device voice may exist
and whether remote consent was given.

## The Sound section (Level 2, `enrich.ts: pronunciationOf`)

| field | source | status shown |
|---|---|---|
| IPA | the dictionary's full record (`ipa[].i`, with its tags: standard, dialect) | `supported-by-source` (Wiktionary, CC BY-SA 4.0) |
| hyphenation, romanisation | the full record (`hyph`, `rom`; Hindi tables carry romanisations per form) | with the IPA |
| recordings | only `https://upload.wikimedia.org/…` files the dictionary names; listed by name, labelled "Wikimedia Commons volunteers, unreviewed" | listed, not auto-played |
| analyser notes | the adapter's letter/stress/tone/schwa notes (`adapter.pronunciation`), Hindi/Thai syllable decoding | `provisional` |
| IPA from rules | only when the dictionary has none and the adapter can transcribe (Norwegian `transcribe`) | `provisional`, tagged "from the analyser's rules" |

Availability measured on 2026-10-10 (200 selections per language, `scripts/probe-linguistic-coverage.mts`): IPA present
sq 80.5 % · es 99.5 · de 96.5 · hi 97 · th 95; audio present sq 9.5 % · es 3.5 · de 97.5 · hi 32 · th 14.

## What is not claimed

- No native pronunciation quality: a device voice is the browser vendor's synthetic voice; a Commons recording is one
  volunteer's reading, not checked for the learner's variety; IPA is the dictionary's transcription of one standard.
- No recording is fetched or played from Commons by the card in this version; the names and URLs are shown so a learner can
  open them. Playing them in-page would need the content bundle to allow that host and the rights note to be shown first.
- Listening evidence (heard = observed, unmuted, volume > 0) is produced only by GoListen's own player, never by the card.

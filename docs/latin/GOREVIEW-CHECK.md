# GoReview with Latin — hands-on check (2026-10-18)

How GoReview (the GoPractice review workspace, installable edition) handles the seventh language, checked in the
desktop app's browser pane against the real local Repository service, not a fake.

## Set-up

- Build: `GOREVIEW_SERVICE_URL=http://127.0.0.1:8790 GOREVIEW_DICT=la GOREVIEW_OUT=<scratch>/goreview-la npx vite build -c packages/goreview/app/vite.config.ts --mode review`
  (the Latin dictionary alone is 130 MB in the build: schema 3 + full-2; see DICTIONARY.md), served by `scripts/local/static-server.cjs` on 127.0.0.1:5200.
- Service: the local Repository on 127.0.0.1:8790, restarted after the Latin pack and analyser were added (an older process does
  not know `la`: `GET /packs?languageId=la` was empty until the restart).
- Learner: a throw-away local account created with `POST /accounts`, enrolled with `POST /enrolments { languageId: 'la', packId: 'pack:la' }`
  (credentials only in the session's scratchpad, never in the repo).
- Vocabulary: sixteen Vulgate forms (Verbum, principio, Deum, lux, vita, hominum, tenebris, lucet, comprehenderunt, Fiat, vidit, bona,
  gratia, pax, peccatum, credo) recorded the way GoLearn's worker records them: `POST /lookup` with the sentence, then
  `SelectionLookedUp` + `ItemMarked` events (`POST /events`, 28 events stored, 0 duplicates). Every lookup resolved to one unit.

## What was seen

| Screen | Result |
|---|---|
| Sign in | the GoLearn account signs in; the home's language kicker reads **Latin** |
| Home | GoTell · Current deck (10 cards ready, deck size 10, Resume / Begin a new deck / Save deck) · Saved decks (1) · My vocab (16 words) |
| Saved decks | **Class Essentials · 28 cards · Latin**, with the note "Written for this class in Church (Ecclesiastical) Latin phrasing and not yet reviewed by a Latinist…"; Practise again / Remove |
| Class Essentials session | 1 of 28, "Recall the meaning", *Salve* → Show answer → *Hello* → Again / Hard / Good / Easy; grading advances to *Vale* |
| My vocab | least-known first: nine Seen (Verbum, comprehenderunt, gratia, hominum, lucet, lux, peccatum, tenebris, vidit), three Recognized (Fiat, pax, principio), two Familiar (Deum, bona), two Known (credo, vita); each with its gloss and History; "In your deck" marks |
| Details (#/review/details) | LATIN · TODAY: due 0, learning 0, new in your deck 14, candidates 0; listening "not available: No Latin recordings are registered; nothing is claimed."; recommended 5 (2 familiar, 1 recognized, 2 seen); FSRS note; cards-per-deck control; resumable sessions |
| Current-deck session | 1 of 10, *bona* → "good, honest, brave, noble, kind, pleasant, right, useful" → grade scale |
| Hear word | before the voice row: "No voices are registered for la."; after it (packages/golisten `LATIN_DEVICE_TAGS`): "This device has no la voice (accepted tags: la, la-VA, it-IT, it). The device offers voices for other languages (en-US, he-IL, hi-IN); none of them is used." — the pane's browser has no Italian voice; a phone or PC with one plays the Italian stand-in |
| Sync line | "Online · nothing waiting · last sync …" |

## Findings

1. **Gloss register.** The gloss GoReview shows is the first sense of the analyser's lexicon row (Whitaker's Words), which is
   sometimes the wrong register for the Vulgate: *gratia* → "popularity/esteem/credit (w/bona); partiality/favoritism" instead of
   "grace, favour"; *credo* leads with "trust, entrust". Handed to the adapter work (sense ordering by register / Wiktionary first).
2. **Voice.** No device ships a Latin voice. An Italian device voice is now the registered, labelled stand-in for the Ecclesiastical
   reading (`LATIN_DEVICE_TAGS = ['la', 'la-VA', 'it-IT', 'it']`); the card and the details page say so. Azure's stand-in is the
   same (it-IT voices in `AZURE_VOICES.la`).
3. **Service restart.** The Repository service must be restarted after a language is added; otherwise `/packs` does not list it
   (lookups still work because the analyser registry is the repo's).
4. **Service worker on http://127.0.0.1** logs "An unknown error occurred when fetching the script" in the pane (a known pane
   limitation, not Latin); the live HTTPS site registers it.

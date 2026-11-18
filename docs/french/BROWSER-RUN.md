# French in the real extension: browser acceptance run

First time French was seen working in the built GoLearn extension, in a real browser. Everything below was read by the rig
(`scripts/loadcheck/golearn/fr.mjs`) from the page, the card's shadow root, `chrome.storage`, the device Repository or the
local service's HTTP API. Nothing is claimed that the rig did not read.

## What was run

- **Rig:** `scripts/loadcheck/golearn/fr.mjs` with the fixture pages in `scripts/loadcheck/golearn/fr-pages/`.
- **Browser:** Brave 1.x headless (`--headless=new`), a throw-away profile under `%TEMP%\loadcheck-golearn-fr`, the extension loaded
  unpacked from a copy of `packages/golearn-extension/dist` whose manifest grants `http(s)://*/*` (as the Active switch's
  permission would) and whose `app/config.json` and `review/config.json` point at a **local** service.
- **Service:** a throw-away `packages/repository-service` on `127.0.0.1:8799` with a temp data folder, a generated test account
  (`fr-rig-<random>@example.test`, random password, never printed). The hosted service was never contacted.
- **Build tested:** `dist/build.json` = `e6479a1c265a-dirty` (the extension bundles built at 2026-11-18T05:14Z from e6479a1c with
  uncommitted changes). The setup page (`--mode options`, `GOLEARN_APP_DICT=sq,fr`, which copies `public/dict/fr` into `dist/app/dict/fr`)
  and GoReview (`--mode extension`, `GOREVIEW_DICT=fr`) were built by this run on that same tree. HEAD moved to 654e1184 during the
  run (another session committed "the analyser chunk waits for the lemma list"); **the extension bundles tested predate that commit.**
  The tree was dirty throughout (other sessions' test and script edits).
- **Run:** the final full run (run 7 of 7; earlier runs were used to fix the rig's selectors). Card readings were identical in
  runs 5 and 7 (compared field by field).

Command:

    cd C:\Users\CJWal\dev\go-v0-french
    set LOADCHECK_BRAVE=C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe
    set LOADCHECK_TMP=%TEMP%\loadcheck-golearn-fr
    node scripts/loadcheck/golearn/fr.mjs

Report: `%TEMP%\loadcheck-golearn-fr\out\report.json`; screenshots `%TEMP%\loadcheck-golearn-fr\out\shots\` (card-ecrites,
card-entra, active-prose, active-mixed, goreview). Three are copied here: `browser-run/card-ecrites.png`, `browser-run/card-entra.png`,
`browser-run/active-mixed.png`.

## Steps

| # | step | result | evidence (read by the rig) |
|---|---|---|---|
| 1 | Install French on the setup page | PASS | Row "French français", level "Experimental, unreviewed"; after Download: "French (France) Downloaded · ready · Reading now"; feedback "French is ready: 23 checks passed, dictionary from this extension's own files". Record `golearn:pack:installed:pack:fr`: version 1, dictionaryManifest true, sampleShard true, 21 validation cases, **0 failures**. (The key is `golearn:pack:installed:…`, not `pack:installed:…` as in runtime.ts: the app prefixes it.) |
| 2 | French as reading language (popup) | PASS | Popup options `fr=French`; line "French is the only language downloaded here; …"; worker state `languageId: fr`, status `languageName: French`. |
| 3 | Prose page resolves to French | PASS | Card host `data-language-id="fr"`, `data-language-basis="document-metadata"` (from `<html lang="fr">`). |
| 4 | 28 lookups on the prose page | PASS (28/28 cards) | Readings and verdicts in the table below. |
| 5 | 11 lookups on the literary page | PASS (11/11 cards) | Table below. Passé simple card: "Passé simple (the past of written narrative) — The past tense of written narrative, common in novels, tales and history books"; features "passé simple (the literary past)". Not called incorrect or archaic. |
| 6 | Pronunciation control | PASS | The control is disabled with the title "No French voice on this device. Add one in the system's speech settings; GoLearn setup, Audio, shows how." on both cards; no crash, no other language's voice. `golearn:pronounce-info`: `deviceVoice: "maybe"`, "Local-only speech: a matching installed voice is required." **No IPA and no written pronunciation notes appear anywhere on the card** for maison (hand list) or jument (dictionary only); see findings. |
| 7 | Mark maison Known, chevaux Familiar | PASS | Buttons pressed `known` / `familiar`; device events `ItemMarked {mark: known}` on `lemma:fr:maison:NOUN`, `ItemMarked {mark: familiar}` on `lemma:fr:cheval:NOUN`. |
| 8 | Marks after page reload and stopped worker | PASS | After reload: maison KNOWN (9× encounters), chevaux FAMILIAR; after `ServiceWorker.stopAllWorkers`: both still pressed. |
| 8b | Marks after `chrome.runtime.reload()` | FAIL (rig/browser, not French) | After the reload the worker did not come back within 15 s and `chrome-extension://<id>/app/index.html` gave `chrome-error://chromewebdata/` six times. The extension, loaded with `--load-extension` in headless Brave, does not survive its own reload here; nothing French is implicated. 8c covers the same question another way. |
| 8c | Marks after the browser restarts on the same profile | PASS | New worker; maison KNOWN, chevaux (cheval) FAMILIAR on a fresh page. |
| 9 | Active on the prose page | PASS | `languages: [fr]`, 224 words scanned, 224 highlight ranges (main world `CSS.highlights`), marked new 154 / seen 68 / familiar 1 / known 1, skipped 0, confirmed 7, unconfirmed 0. maison in `golearn-known`, chevaux in `golearn-familiar`. Dictionary-only words (not in the hand lists): jument seen, boulangerie new, réverbère new, brume new: all four underlined. Popup: "This page (French): 223 words marked." / "224 words read: new 154, seen 68, familiar 1; 1 known." |
| 10 | Mixed page, no `lang` | PASS (Active) | Active: `languages: [fr]`, 45 words scanned, all 45 ranges in the French paragraph; **no English or Spanish word underlined**. But see the lookup finding below. |
| 11 | `lang="en"` page with `<p lang="fr">` | PASS | 18 French words underlined (Ma, sœur, acheté, …), none in the English paragraphs. Lookup of acheté: acheter VERB, basis document-metadata, fr. Lookup of English "walking": "GoLearn cannot tell which language this is, and will not guess … the fr word list recognises only 1 of 28 words around the selection … the page (html-lang) declares "en"". |
| 12 | Real sites | PASS | fr.wikipedia.org/wiki/Paris: `lang=fr`, Active 2580 scanned, 2096 marked, 484 skipped, scan 274 ms; lookup "est" (Paris est la capitale…): être AUX, "He, she, or it is". Wikisource, Contes de Perrault (éd. 1902)/Le petit Chaperon rouge: Active 307 scanned, 288 marked, 18 skipped; lookup "était" (Il était une fois…): être AUX "He, she, or it was". (The `Le_Petit_Chaperon_rouge_(Perrault)` page is an editions list with no text.) |
| 13 | Signed in, marks reach the account | PASS | Account created through the worker (`golearn:create-account`), "Synced to your account as fr-rig-…@example.test"; enrolment `fr`, `pack:fr` v1. Service `GET /events?kinds=ItemMarked`: maison known, cheval familiar, jument known, réverbère familiar, all `lemma:fr:…:NOUN`. `GET /knowledge?languageId=fr`: `lemma:fr:maison:NOUN` known, `lemma:fr:jument:NOUN` known, `lemma:fr:cheval:NOUN` familiar, `lemma:fr:réverbère:NOUN` familiar (with selfMark). Upload reply `waiting: 19` (events in Spanish/Albanian held back: the account has no enrolment in them). |
| 14 | Fresh profile, same account | PASS | `golearn:connect` ok; 1160 events from the account; device knowledge `lemma:fr:maison:NOUN` known, `lemma:fr:jument:NOUN` known, `lemma:fr:cheval:NOUN` familiar, `lemma:fr:réverbère:NOUN` familiar. |
| 15 | GoReview | FAIL | French is offered (select: Spanish, Albanian, French) and My Vocabulary lists French (540 records: seen 536, familiar 2, known 2). No card can be started: home says "On this device only … No new words right now: the service could not be reached, and this device has no earlier list."; New deck: "No other new words are ready right now."; "Save for GoReview" on maison ("Saved for GoReview") then Current Deck: still "No cards ready". The device Repository's own `candidates` for fr answer `ok`, 5 candidates (see the next finding). No card, so no grade and no review event. |
| 16 | Timings and sizes | PASS (measured) | Table below. |
| 17 | Albanian still works | PASS | librin → libër NOUN "book", `data-language-id=sq`. |
| 18 | Console | — | One error in the whole run: `Failed to load resource: net::ERR_FILE_NOT_FOUND chrome-extension://<id>/app/dict/es/manifest.json` (setup page, Spanish install looking in the extension's own files first, expected: it then used the hosted copy). No exception from the page, the content script, the worker or the setup page. |

## Card readings (steps 4 and 5)

Lemma, part of speech, features (the Form line), gloss (the card's first meaning line; "WL" = French word list, "dict" = Wiktionary
via kaikki.org, as the card labels it), constructions (titles in the Grammar layer), verdict against ordinary French grammar.

| word | sentence | lemma | POS | features | gloss | constructions | verdict |
|---|---|---|---|---|---|---|---|
| maison | Sa maison est petite… | maison | NOUN | feminine singular | house, home (WL) | — | RIGHT |
| chevaux | …avait trois chevaux et une belle jument. | cheval | NOUN | masculine plural | horse (WL) | — | RIGHT |
| belle | …une belle jument. | beau | ADJ | feminine singular | beautiful, handsome (WL) | — | RIGHT |
| vieille | …une vieille ferme… | vieux | ADJ | feminine singular | old (WL) | — | RIGHT |
| au | …allée au marché… | au | ADP | masculine singular; parts à + le | to the, at the, in the (à + le) | Contracted article | RIGHT |
| du | …le train du matin… | du | ADP | masculine singular; parts de + le | of the, from the (de + le) | Contracted article; other reading du DET partitive 0.40 | RIGHT |
| l’ | …au bord de l’eau. | le | DET | singular | the | Elision; other reading le PRON 0.55 | RIGHT |
| faisons | nous faisons encore une promenade… | faire | VERB | first person plural, present | We do | — | RIGHT (but see paradigm finding) |
| arrivée | Marie est arrivée à Lyon… | arriver | VERB | past participle, feminine singular | having arrived | Passé composé; Participle agreement with être | RIGHT |
| est | Marie est arrivée… | être | AUX | third person singular, present | He, she, or it is | Passé composé; Participle agreement with être; syntax "auxiliary of arrivée" | RIGHT |
| écrites | Les lettres que j’ai écrites… | écrire | VERB | past participle, feminine plural | having written | Passé composé; Participle agreement with a preceding direct object ("…les lettres que j'ai écrites…") | RIGHT |
| le | Je le vois, ce livre… | le | PRON | third person singular | him, it, them (direct object) | Object pronoun before the verb; syntax obj of vois | RIGHT |
| lui | Je lui parle souvent… | lui | PRON | third person singular | to him, to her; him (after a preposition) | Object pronoun before the verb; syntax iobj of parle | RIGHT |
| y | Oui, j’y vais… | y | PRON | PronType=Prs | there, to it | The pronoun y; Elision | RIGHT (the Elision note belongs to j’, not y; the raw "PronType=Prs" is shown as a feature line) |
| en | J’en prends deux. | en | PRON | PronType=Prs | of it, of them, some; from there | The pronoun en; Elision; syntax "not decided" obl/obj | RIGHT (same two remarks as y) |
| ne | Il ne reste que trois croissants… | ne | PART | Polarity=Neg | not (the first half of the negation) | Ne … que (only): "Ne … que is not a negation" | INCOMPLETE: the gloss and the syntax line ("the first half of the negation of reste") contradict the construction note on the same card |
| que | Il ne reste que trois croissants… | que | ADV | — | only (ne … que) | Ne … que (only) | RIGHT |
| dont | Voici le livre dont je t’ai parlé… | dont | PRON | PronType=Rel | whose, of which, of whom | Relative pronoun dont; syntax "dont stands for of whom / of which … complement of parlé" | RIGHT |
| le | Donne-le-moi… | le | PRON | third person singular | him, it, them (direct object) | Pronouns after a command (donne-le-moi) | RIGHT |
| vienne | Il faut qu’il vienne demain… | venir | VERB | present subjunctive, first or third person singular | to come | Subjunctive after que; syntax ccomp of faut | RIGHT (person left ambiguous although il is the subject) |
| porte (noun) | Ferme la porte… | porte | NOUN | feminine singular | door | —; other readings "porter (VERB) – to carry, to wear" listed three times | RIGHT lemma; INCOMPLETE card: the same alternative repeated 3×, and the syntax could not attach the word (Ferme, an imperative, unplaced) |
| porte (verb) | Paul porte un manteau gris. | porter | VERB | first or third person singular, present | **I carry** | — | WRONG gloss: the subject is Paul (3rd person); the card's meaning line says "I carry" |
| livre (noun) | Voici le livre dont… | livre | NOUN | feminine or masculine singular | book (m); pound (f) | Relative pronoun dont | INCOMPLETE: "le livre" fixes masculine (book); the card leaves both genders and both senses |
| livre (verb) | Le facteur livre les colis… | livrer | VERB | first or third person singular, present | **I deliver** | — | WRONG gloss: subject le facteur (3rd person); "I deliver" |
| A (a-t-il) | A-t-il compris la question ? | avoir | AUX | third person singular, present | He, she, or it has | Passé composé; Question by inversion | RIGHT |
| peut-être | Peut-être. | peut-être | ADV | — | perhaps, maybe | — | RIGHT (one token, hyphen kept) |
| aujourd’hui | Aujourd’hui, Marie… | aujourd'hui | ADV | — | today | — | RIGHT (typographic apostrophe read as one word) |
| cœur | …elle a le cœur content. | cœur | NOUN | masculine singular | heart | — | RIGHT (ligature kept) |
| entra | Le vieux meunier entra… | entrer | VERB | third person singular, passé simple (the literary past) | He, she, or it entered | Passé simple (the past of written narrative) | RIGHT |
| vit | il vit sa fille assise… | voir | VERB | third person singular, passé simple | He, she, or it saw | Passé simple | RIGHT in context (no alternative vivre present offered) |
| fut | il fut saisi d’une grande tristesse | être | AUX | third person singular, passé simple | He, she, or it was | Passive voice (être + past participle) | RIGHT |
| prirent | Les voisins prirent leurs lanternes… | prendre | VERB | third person plural, passé simple | They took | Passé simple | RIGHT |
| répondit | …répondit-elle… | répondre | VERB | third person singular, passé simple | He, she, or it answered | Passé simple | RIGHT (syntax could not attach the incise) |
| fût | il aurait fallu qu’il fût ici | être | AUX | imperfect subjunctive (literary), third person singular | to be; also the auxiliary… | Imperfect subjunctive (literary); Subjunctive after que | RIGHT |
| point | Je ne le sais point | point | ADV | Polarity=Neg | not at all (formal) | Negation (ne … pas), naming "the literary point"; syntax "second half of the negation (ne … point)" | RIGHT |
| trouva | …se trouva fort dépourvue… | trouver | VERB | third person singular, passé simple | He, she, or it found | Passé simple; Pronominal verb (with se) | RIGHT |
| dépourvue | …fort dépourvue… | dépourvu | ADJ | feminine singular | without, lacking in, devoid of; surprise (dict) | — | RIGHT |
| fut | quand la bise fut venue | être | AUX | third person singular, passé simple | He, she, or it was | Passé antérieur (literary); Participle agreement with être | RIGHT |
| cherra | la bobinette cherra | choir | VERB | third person singular, future | He, she, or it will fall [literary] | Futur simple | RIGHT |

Score: 34 RIGHT, 3 INCOMPLETE (ne, porte noun, livre noun), 2 WRONG (the meaning line of porte and livre as verbs).

**Paradigm finding (every verb card):** the "All forms" table lays out INFINITIVE, PARTICIPLE · PRESENT and PARTICIPLE · PAST as
person × number grids with every cell empty ("—"), so the infinitive and the participles are never shown, and the past-participle
heading reads **"PARTICIPLE · PAST (PASSÉ SIMPLE, LITERARY)"** (read on faisons, arrivée and the others). The PLAN's rule that
`Tense Past` means the participle on `VerbForm Part` is not applied to the table headings. The finite tenses are filled and
marked ✓ against the dictionary (faire: fais/faisons…, fis/fîmes…, ferai…, fasse…).

## Mixed-language result (step 10)

Page with no `lang`: a French paragraph (45 words), an English one (≈85 words), a Spanish one (≈80 words); only French downloaded at
that point (Albanian and Spanish were added later, in steps 17 and 16).

- **Active read only the French paragraph as French.** `languages: [fr]`, 45 scanned, 45 underlined, all in `#m-fr`; 0 in `#m-en`,
  0 in `#m-es`; skipped 0 (the other paragraphs were not scanned at all). Popup: "This page (French): 45 words marked."
  (`browser-run/active-mixed.png`).
- **A lookup by selection does not get the same protection.** voisine (French paragraph): voisin NOUN "neighbour", basis
  `detection`. neighbour (English paragraph): a French card, basis `team-default`, "Not in the word list; not in the dictionary
  either." vecina (Spanish paragraph): a French card, basis `team-default`, lemma **"veciner" VERB, kicker "LEMMA (GUESS)"**,
  "No meaning in the word list; not in the dictionary either."
- **Those two lookups were recorded as French units.** Afterwards the device Repository's `candidates` for French begin
  `form:fr:neighbour`, `form:fr:vecina`, `form:fr:a`. An English or Spanish word selected on an undeclared page becomes a French
  item in the learner's record (and a GoReview candidate). On the `lang="en"` page the same selection was refused honestly
  ("cannot tell which language this is, and will not guess"), so the difference is the undeclared page falling back to the
  reading language (`team-default`) instead of detection.

## Timings and sizes (step 16)

| measurement | value |
|---|---|
| first French lookup after page load (analyser chunk + lexicon chunk + card), until the content script answered | 150 ms (the rig's card-time poll keys on the lemma line, which maison's card leaves out because lemma = form, so no separate card time was captured for this one) |
| second French lookup | 50 ms reply, card 55 ms |
| lookup after the worker was stopped | 135 ms |
| Active on the 224-word page | first scan seen by the rig 555 ms after the tab opened; scan 39.9 ms, learner model 109.6 ms |
| Active on fr.wikipedia Paris | 2580 words, scan 274 ms |
| first Spanish lookup (short page, `es` analyser chunk) | 60 ms reply, card 65 ms; second 36 / 39 ms |
| local service start | 6.1 s |
| `dist/analysers/fr.js` | 335,218 bytes |
| its lazy lexicon chunk `shared-LVX0gXcx.js` | 917,504 bytes (static imports 8,278 + 1,094 + 1,233) |
| `es.js` | 230,412 bytes |
| `content.js` / `background.js` | 578,256 / 1,246,452 bytes |

The French first lookup costs about 90 ms more than the Spanish one (the 0.9 MB lemma-list chunk). Spanish was installed with its
dictionary from the hosted copy (`rookie2401.github.io/go-v0/`, a public GET, no account): the extension's own files carry only
sq and fr.

## Console (step 18)

One line in the whole run: `Failed to load resource: net::ERR_FILE_NOT_FOUND chrome-extension://<id>/app/dict/es/manifest.json`
(setup page, during the Spanish install; expected). No exception and no error from French.

## What a learner would notice

- French installs in a second, checks itself (21 of 21 cases) and becomes the reading language; every word they selected gave a card;
  the lookup answered in 0.15 s the first time and about 0.05 s after.
- The cards are mostly right and explain what matters: elision, au/du, agreement with être and with a preceding que, object pronouns
  and their place after a command, y, en, dont, ne … que, the subjunctive after il faut que, the passé simple as the tense of written
  narrative, the passé antérieur and the literary imperfect subjunctive.
- With a verb whose subject is a noun ("Paul porte", "le facteur livre") the meaning line says "I carry", "I deliver".
- "le livre" leaves the learner with "book (m); pound (f)" and both genders.
- The card for ne in "ne … que" says both "not" and "is not a negation".
- Every verb's "All forms" table has three empty grids at the top and calls the past participle "passé simple, literary".
- No IPA and no pronunciation notes anywhere on the card; the speaker button is greyed out and says why (no French voice on this device).
- Underlines on French pages, a French paragraph inside an English page, and Wikipedia / Wikisource work, and English or Spanish
  paragraphs are left alone. But selecting an English or Spanish word on a page that declares no language gives a French card
  (one with an invented lemma "veciner") and adds that word to their French words.
- Marks (Known, Familiar) stick across reloads, a stopped worker, a browser restart, and come back on a second device signed in to
  the same account.
- GoReview offers French and lists their French words, but cannot give them a single French card: "No new words right now: the
  service could not be reached", even after "Save for GoReview".

## Not driven

- The extension's own reload (`chrome.runtime.reload`) leaves the unpacked extension gone in this headless browser (8b); the browser
  restart (8c) was used instead.
- No review grade was given: GoReview never produced a French card (step 15).
- Real device voices: headless Brave has none, so only the "no French voice" path was seen.

## GoReview follow-up

Why step 15 gave no French card. Run on 2026-11-18 after rebuilding the analysers (`--mode analysers`, so `dist/analysers` is the
current source: `fr.js` 335,733 bytes) and GoReview (`--mode extension`, `GOREVIEW_SERVICE_URL=http://127.0.0.1:8799`,
`GOREVIEW_DICT=fr,sq`); `content.js` / `background.js` / the setup page unchanged from the main run. Rig: `fr.mjs "" "" 1,2,15f`
(French vs Albanian, signed out then signed in) and `fr.mjs "" "" 1,2,15g` (the candidates call alone). GoReview's own calls to the
worker were traced by wrapping `chrome.runtime.sendMessage` in its page before it loaded; its network by the protocol.

**Cause:** GoReview inside the extension asks the device Repository for candidates through the worker
(`{type: 'golearn:local-repo', op: 'api', method: 'candidates', args: [enrolmentId, 200, undefined, objectives, undefined]}`).
Extension messaging serialises the `undefined` cursor as `null`; the Repository API client (`packages/repository-service/src/api.ts`,
`call()`, which drops only `undefined` and `''` from the query) then sends `after=null`, and the handler
(`packages/repository-service/src/handler.ts`, `/candidates`) looks for a unit called "null", finds none and refuses:
**422 invalid-query "The candidate list changed. Refresh and try again."** GoReview treats that as an unreachable service
(`candidateSource: 'none'`) and says "No new words right now: the service could not be reached, and this device has no earlier list."

Proof (15g, same device, French enrolment, three words looked up), the same call sent from an extension page:

| args sent | reply |
|---|---|
| `[enrolmentId, 200]` | ok, 3 candidates: `lemma:fr:cheval:NOUN`, `lemma:fr:jument:NOUN`, `lemma:fr:maison:NOUN` |
| `[enrolmentId, 200, undefined]` | 422 "The candidate list changed. Refresh and try again." |
| `[enrolmentId, 200, null]` | 422, same |
| as GoReview sends it (`…, undefined, objectives, undefined`) | 422, same |
| the worker's own `op: 'candidates'` (no args array) | ok, 3 |

**Not French.** Albanian (the built-in pack) fails the same way, signed out and signed in:

| | French | Albanian |
|---|---|---|
| device candidates (worker `op: 'candidates'`), signed out | `lemma:fr:cheval:NOUN`, `lemma:fr:jument:NOUN`, `lemma:fr:réverbère:NOUN` | `lemma:sq:lexoj:VERB`, `lemma:sq:unë:PRON`, `lemma:sq:shtëpi:NOUN` |
| GoReview's `api.candidates` (3 calls each), signed out | 422 "The candidate list changed…" | 422, same |
| GoReview card after "Start", signed out | no card | no card |
| after "Save for GoReview" on four words (all four answered "Saved for GoReview") | no card | no card |
| signed in (local account, both enrolled on the account, upload sent 8, waiting 0) | 422, no card | 422, no card |

What the pages said (verbatim, the same for both languages and both states):
- Home: "CURRENT DECK No cards ready Your active vocabulary collection Nothing to drill right now. No new words right now: the service
  could not be reached, and this device has no earlier list. Due reviews still work offline." There is no `#why-no-new` element in this
  build; the line above is the home's explanation.
- `#/review/details` (Practice candidates): "Candidates could not be fetched (The candidate list changed. Refresh and try again.). The deck
  below still works offline. No candidates are available." No candidate rows, so no exclusion codes: the candidates never reach the
  selection step (knowledge, gloss, allowance and the rest are not involved).
- `#/developer`: "On this device only … SERVICE http://127.0.0.1:8799 … LANGUAGE fr (fr-FR) EVENTS IN THE LOCAL LOG 12 DECK ITEMS 0 …
  FETCH CURSOR / SERVER HEAD 24 / 24 … WHY THESE CARDS … Build selection report". The rig did not press "Build selection report".

**The service address is not involved.** GoReview's start traffic on the network was only its own files
(`review/index.html` 200, `review/config.json` 200, one image); it made no request to any service, in either build. Everything went
to the worker: `listEnrolments`, `identity`, `status`, `listEvents`, `vocabulary` (all answered ok) and `candidates` (422). In device
mode GoReview never uses `config.json`'s `serviceUrl`. (In the main run the rig's copy already had `serviceUrl` 8799; the rebuilt
GoReview with `GOREVIEW_SERVICE_URL=http://127.0.0.1:8799` changed nothing.) "On this device only" while the extension is signed in
is because GoReview keeps its own session; the extension's sign-in does not sign GoReview in.

**Point 4 (a French card, its back, a grade):** not run: no card could be built in any configuration without changing product code.

**For the lead, in one sentence:** GoReview in the extension gets no cards for any language because its `candidates` call to the
device Repository passes an `undefined` cursor that extension messaging turns into `null`, and `api.ts`'s query builder sends it as
`after=null`, which the `/candidates` handler refuses with 422 "The candidate list changed"; dropping `null` as well as `undefined`
in `api.ts` `call()` (or in the worker's `op: 'api'` before calling the method) should fix it. It is not French.

**New in this re-run (current analysers):** the French install now reports **"Downloaded · did not verify"**: 1 of 21 validation cases
fails, verbatim `{"id":"v-sont","pass":false,"got":"être AUX VerbForm=Fin Mood=Ind Tense=Pres Person=3 Number=Plur [conflicted, 2 readings] — differs: status conflicted"}`.
The main run's analysers (before 654e1184) passed all 21.

## The lead's re-run (after the fixes)

The same rig, run again by the coordinating session on the build `3d852824bbc1-dirty` (3d852824 plus the loaders' wait for the lemma
list, committed as 37d06e87): extension, setup page (`GOLEARN_APP_DICT=sq,fr`) and GoReview all rebuilt from the current source.

| step | result |
|---|---|
| 1 install | PASS: "Downloaded · ready" (the `sont` install check that failed in the follow-up run passes: être and avoir are one word) |
| 2, 3 reading language, page language | PASS |
| 4 prose lookups | PASS, 28 of 28. `porte` (Paul porte un manteau): "He, she, or it carries"; `livre` (le facteur livre): "He, she, or it delivers"; `livre` after un: lemma livre, "book"; `ne` in ne … que: "… with que alone: only" |
| 5 literary lookups | PASS, 11 of 11. `vit` in the tale: voir, "He, she, or it saw"; `cherra`: choir, "will fall [literary]"; `prirent`: prendre, "They took" |
| 6 pronunciation | PASS (no French voice on this device, said so) |
| 7, 8, 8c marks and their persistence | PASS |
| 8b the extension's own reload | FAIL as before: the unpacked extension does not come back in headless Brave (not French) |
| 9 Active | PASS: 224 words scanned, all marked; maison known, chevaux familiar |
| 10 mixed page, 11 `<p lang="fr">` in an English page | PASS: no English or Spanish word underlined |
| 12 real sites | PASS |
| 13, 14 account and a fresh profile | PASS |
| 15 GoReview | FAIL as before: the null cursor of the candidates call (every language; reported to the release manager) |
| 16 timings | first French lookup 175 ms (it now waits for the lemma list), second 52 ms, after a stopped worker 133 ms; Active's scan of the 224-word page 83 ms |
| 17 Albanian | PASS |

Card findings of the first run and what became of them:

- "I carry" for a noun subject: fixed (one reading per person; the third leads without je or tu).
- "le livre" as both genders: fixed (the two genders are two readings with their own meanings; the article decides).
- the past participle heading "passé simple, literary": fixed (the label is "past").
- ne in ne … que: its meaning now names "only".
- The three empty grids above a verb's forms (infinitive, participles): the shared card draws a person × number grid for every section
  of a paradigm and lists the forms without a person under "Other forms"; Spanish has the same. Not changed here.
- No IPA and no pronunciation notes on the card: the shared card does not show either for any language (it shows a romanization
  where a script needs one). The French analyser supplies notes and passes the dictionary's IPA through; nothing displays them yet.
- An English or Spanish word selected on a page that declares no language gets a card in the learner's reading language, with a
  reading marked as a guess, and is recorded: that is the shared fallback (`team-default`) for every language, not a French rule.

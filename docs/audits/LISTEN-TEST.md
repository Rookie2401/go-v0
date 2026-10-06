# Does Go give a reader the right sounds? — the listen test, 2026-10-06

**Question (the owner's).** Is GoListen a useful approximation of the speech, so that a reader "hears roughly the right
sounds in their head"? There is no human input yet: no reviewer, no recording.

**Short answer.** GoListen itself gives nothing today. It plays reviewed human recordings, and none exist; it can
synthesize speech only through an Azure key or proxy, and none is configured. The sounds a reader actually gets come from
three other places: the **spelling rules Stage 0 teaches**, the **word sheet's decoding** (Hindi and Thai only), and the
**device's computer voice in Stage 0** (where the device has one). Measured against Wiktionary's pronunciations on the
words a beginner meets first, the written side is good: Thai and Hindi decoding is right for 97–99 % of running words,
and the Spanish and Albanian letter rules for 99.5 % or more. **German is the exception**: what Stage 0 teaches gets only
41–57 % of words right (vowel length, s = z, au, j are never taught). **Stress** is the weak point in Spanish (one rule
never shown) and Albanian (not taught at all). And the **reader is silent** in every language.

## How it was tested

Five measurements, scripts in the session scratchpad (`listen-test/`), nothing heard by anyone:

- **Word sample**: what a beginner reads first — the Stage 0 path, then the Spanish and Albanian ladders in order, or for
  German, Hindi and Thai the texts the simulated learner read (`data/research/simulate/<lang>-preview.json`), up to
  50,000 running words; the most frequent words covering 90 % of them; results weighted by running words.
- **Reference**: Wiktionary IPA from the local kaikki files (`data/dictionaries/`), the exact word, any listed reading
  counts; compared phonemically and leniently (allophones, syllable dots and notation ignored; vowel, consonant, length,
  tone and stress counted). Wiktionary's IPA for Spanish, Hindi and much of Thai is itself generated from spelling, so
  agreement on easy words is partly two rule systems agreeing. Every disagreement class was inspected by hand; that
  triage is a non-native reviewer's, not a native check.
- **Thai and Hindi**: the adapter's `decode` (rules alone) and what the reader's word sheet shows (`decodeFor` with the
  installed dictionary).
- **Spanish, Albanian, German**: those adapters have no decoding. The test is a learner who applies *exactly* the rules
  the app teaches (Stage 0 sound steps, adapter notes), with naive English for anything not taught.
- **Audio**: every place a learner can hear something; the voice picker; `speechNormalize` over 326,020 real sentences
  plus 134 probes; the GoListen tests (`test/golisten`: 395 passed).

## What a reader can hear

| surface | today |
|---|---|
| Stage 0 lines, sound steps, "Hear the model" | the device's computer voice, rate 0.85, labelled practice; nothing if the device has no voice for the language (no button, no notice on that page) |
| Reader, Scripture, word sheet, GoTell, Testimony | nothing; the reader shows "Audio is not available — no speech provider is configured" |
| `/listen` | empty: lists only texts with an imported recording; none ship |
| Stage 0 recorded audio | none: all 778 audio slots are `needed` (es 128, de 120, sq 144, hi 174, th 212) |

On this PC (English and Hebrew voices only) and in the app's embedded browser (no voices at all) every language is
silent. On typical phones, Macs and Edge, Spanish, German, Hindi and Thai Stage 0 would speak; Albanian almost never
(few platforms ship an Albanian voice) — platform availability is general knowledge, not tested on devices.

The voice picker never takes a wrong-*language* voice, but takes a Castilian (es-ES) voice for the Honduran course when
that is all there is — the voice then contradicts the seseo the sound step teaches — and does not show the voice's
locale, prefer offline voices, or accept `es_US`-style tags.

## What a reader can read about sounds — measured

| language | what the app gives | right, running words (beginner sample) | main gaps |
|---|---|---|---|
| Thai | word sheet decodes every word: syllables, class, tone rule, length, IPA | rules alone 95.0 % strict / ~98 % after review of disagreements (4.5 % honestly marked uncertain); as the reader shows it with the dictionary 98.5 % strict, ~100 % after review; Stage 0 104/104 words | Pali/Sanskrit words with unwritten vowels (ข้าพเจ้า, วจนะ), cluster read as final after เ/แ (แปล, แตร) at high confidence, ฤ not decoded |
| Hindi | word sheet decodes every word: which unwritten "a" is said, romanization | ~98 % of words with an unwritten a fully right; 1.8 % marked uncertain (पुत्र, राज्य: honest); 0.2–0.4 % wrong | nasal before a middle consonant keeps an a it should drop (माँगता, ढूँढने); compounds and -ों plurals (सुसमाचार, नियमों); the dictionary's own pronunciation is effectively never used (entry-level IPA on 50 of 38,635 entries) |
| Spanish | Stage 0 sound steps only; the adapter's per-word notes are never shown | sounds 99.9 %; stress 95.5 %; fully right 95.5 % | **stress of words ending in a consonant other than n/s** (señor, usted, hablar, estoy: 4.8 % of running words, always wrong) — the rule exists only in the never-shown notes; with it, ~100 % |
| Albanian | Stage 0 sound steps only; notes never shown | letters 99.5 % (97 % if the final ë must be said) | **stress is taught nowhere**: 65 % right with an English first-syllable habit (~84 % with one simple rule); ai/luan hiatus; "final ë often hardly said" is a weak guide; Wiktionary covers only 62 % of the running words |
| German | Stage 0 sound steps only (4 steps, 18 example words); notes never shown | **41 %** fully right (57 % if reduced unstressed vowels are forgiven); consonants 79 %, vowel length 50 %, stress 96 % | **never taught**: vowel length in open syllables and short words (der, zu, war, gut: wrong in half of all words), s before a vowel = z (sie, so, sein, sich), au, j, reduced -e/-er; the taught "final g = k" gives *könik* for -ig. 82 % of the failures need one of five or six regular rules; Wiktionary IPA for 89 % of running words already ships in the dictionary and is never shown |

Two Stage 0 lessons contradict the app's own decoding: Hindi `hi-snd2` says "only the last [a] falls silent" (wrong for
करता, रहते, लड़का, which `hi-snd8` then teaches correctly), and `hi-snd5` says रुपये is "rup-ye" while the decoder says
rupaye.

## What is wrong with the text a voice would get (`speechNormalize`)

Irrelevant for Stage 0 and the bundled courses (0 of 1,196 Stage 0 lines change), but wrong in the library, which any
future voicing of Scripture or literature would hit: Luther-Bible `[17:1]` verse markers spoken (358 sentences); Hindi
numbers above 20 left as digits; Spanish "uno hermana", "veintiuno años"; German "eins Bruder", years read as cardinals;
unexpanded abbreviations (Vd., pág., S., shek., พ.ศ.); Roman numerals; Strong's markup in two Spanish Bible sentences.

## Verdict

- **GoListen** (the recording player and evidence rules) is sound plumbing with nothing to play. It cannot be judged as
  an approximation of speech until a voice or a recording exists.
- **The written approximation is meritorious** for Thai and Hindi (the decoding is right for nearly every word a
  beginner meets, and it says when it is unsure) and nearly so for Spanish and Albanian *letters*. It is **not** meritorious
  for German yet. It falls short on **stress** in Spanish and Albanian, and on **keeping the sounds in front of the reader**: Spanish, German and
  Albanian readers get nothing per word after Stage 0.
- **Audio**: a reader hears nothing outside Stage 0, and in Stage 0 only what the device happens to have.

## Cheapest steps to "roughly the right sounds", in order

1. Show what already exists: the adapter's pronunciation notes (and Wiktionary's IPA, already in the dictionary shards)
   in the word sheet for Spanish, German and Albanian; teach German open-syllable vowel length, s = z, au, j and the
   reduced -e/-er in Stage 0 (the model learner goes from 41 % to ~90 %); one Stage 0 sentence on Spanish
   consonant-final stress; a stress rule (or per-word stress marks) for Albanian; fix the two Hindi lesson sentences.
2. A "hear this" button in the reader and word sheet using the same device voice as Stage 0, with the voice's locale
   shown, a notice where there is none, and the normalizer fixes above.
3. Pre-render the 778 Stage 0 audio slots once with a neural voice (labelled computer voice, practice only) so every
   device — Albanian included — hears the same thing. Needs the owner to choose a provider and accept its terms.
4. Native recordings through `npm run audio:packet`: the only route to listening evidence.

## Update, 2026-10-06 (later): Codex's work committed, step 1 done

### Codex's work (491b934)

Everything Codex left uncommitted was committed as found, at the owner's request (1,443 files: acquired library
sources and the scripts that fetched them, curriculum remediation, Reading organised by book, the Curriculum page, Home
as a small directory; scratch output left out). What it changes for sound:

- **GoListen plumbing, tightened**: a learner's upload can no longer promote its own timings to reviewed; a recording
  that reached its end is not resumed from an older mid-play position; a recording for a library text that is not yet
  opened is found and listed; listening assessment and reading assessment are kept apart. All of it concerns
  recordings, and there are none, so a reader still hears nothing outside Stage 0.
- **Home lists "GoListen — Understand stories and Scripture by listening"** for every course. On a fresh install that
  page is empty ("No approved listening audio is ready for this language yet"): the entry promises what no course can
  give yet.

The full suite on the committed tree (9,391 tests): 9,373 passed, 18 failed. Five were expectation failures caused by
this session's own earlier commits (the superseded-by-ladder tag in two import tests, the new Home entry in three Home
tests) — fixed in 1dd2493. The other 13 are time-outs in the Stage 0, GoTell and real-engine UI tests; the Stage 0 and
GoTell ones also time out when run alone on plain HEAD (≈ 125 s per test against a 20 s limit) — slow tests, not
wrong answers, but they hide whatever they would check. The four real-engine UI tests time out alone as well (one ran 828 s against its 20 s limit): the app over the real
engines is slow enough in jsdom that these suites no longer check anything — worth its own look.

Measuring the word sheet also found a German importer bug: with the dictionary installed, two course texts (Weg 3,
chapters 1 and 2) cannot be imported — the German adapter's refine step changes a reading and the importer refuses.
Flagged as its own task.

### Step 1 (1984d46, 14ae6a1)

- **Word sheet, Spanish / German / Albanian**: a "How it sounds" section — the dictionary's pronunciation, credited and
  labelled when it is a variety's ("Wiktionary (Tosk): /ˈmiɾə/"), a key for ˈ and ː, and the adapter's notes (Spanish
  stress first). Measured with the real importer on the beginner texts, a pronunciation now shows for **78.6 %** of
  Spanish word tokens (inflected forms such as *está*, *tiene* have none in Wiktionary: they show the stress note),
  **93.4 %** of German and **61.1 %** of Albanian. Thai and Hindi keep their decoding.
- **Stage 0 lessons**: German gets a fifth sound step (long and short vowels by counting consonants, s = z before a
  vowel, j, faint -e/-er) plus au and -ig; Spanish gets the consonant-final stress rule; Albanian gets a stress rule
  (80 % of running polysyllables right against Wiktionary, against 62 % for a first-syllable habit) and loses "say any
  word you see"; the two Hindi sentences now agree with the decoder.

What the same learner model predicts with the new lessons (a projection from the earlier runs, not a new measurement):
German rises from 41–57 % to about **90 %** of words right (the "six rules taught" scenario: open-syllable length,
s = z, au, j, faint -e and -er); Spanish stress from 95.5 % to about **100 %** of referenced words; Albanian stress from
62–65 % to about **80 %**.

| language | sounds a reader gets now |
|---|---|
| Thai, Hindi | per-word decoding, ~98 % right, honest about doubt (unchanged) |
| Spanish | the rules, now complete for stress; per-word IPA on 79 % of words and the stress note on the rest |
| German | five sound steps (projected ~90 %); per-word IPA on 93 % of words |
| Albanian | letters 99.5 %, a stress rule (~80 %); per-word IPA on 61 % of words |
| all | still no audio outside Stage 0; steps 2–4 above remain |

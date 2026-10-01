# PLAN5 — Thai course foundation (packages)

Read first: `docs/THAI_COURSE.md` (design), then the contract files named in your section. The contract is in
`src/core` and is **owned by the coordinator**: do not edit anything under `src/core/**`, `src/course/thai.ts`,
`docs/THAI_COURSE.md`, `docs/PLAN5.md`, `docs/READINESS.md`, `test/integration/**`, `package.json`, `.gitignore`.
If the contract is wrong or missing something, say so in your final report (exact change wanted) and work around it.

## Rules for every package

- Project: `C:\Users\CJWal\dev\go-v0` (Vite 8, React 19, Dexie 4, Vitest 3, TypeScript strict). Never work in OneDrive.
- Other packages are being written **at the same time in the same working tree**. Touch only the files your section
  lists as yours. Files marked STUB were written by the coordinator with the final signatures: the owner replaces the
  body, everyone else codes against the signature.
- Run only your own tests while working: `npx vitest run <your test paths>`. `npx tsc -b` will show errors from other
  packages in flight — fix only errors in your own files. Do not run `npm install`. Do not commit. Do not start a dev
  server.
- Never write patch scripts through shell heredocs or `node -e` (they mangle backticks and escapes). Use the
  Write/Edit tools. Never hand-type Thai in a shell command; put it in files.
- Thai text is NFC, never given spaces, never altered. Token and syllable offsets are UTF-16 code-unit offsets that
  must round-trip (`text.slice(start, end) === surface`).
- Honesty rules that tests must enforce: no silent guesses (uncertain ⇒ low confidence or absent, never a confident
  wrong value); nothing fabricated (no invented frequency, rights, definitions); exposure is not comprehension.
- Comments: match the density and voice of the surrounding code. Learner-facing wording: plain, short, no jargon,
  no exclamation marks, "Go" as the product name.
- Final report (keep it under 300 words): files written, exported names with signatures, test count, anything you
  could not do, any contract change you want, and every place you were unsure of a Thai fact.

---

## A — Thai orthography engine

**Yours:** `src/adapters/thai/orthography.ts` (STUB → real), `src/adapters/thai/orth-exceptions.ts`,
`test/adapters/thai-orthography.test.ts`. **Contract:** `SyllableAnalysis` in `src/core/course.ts`.

Pure, synchronous, dependency-free functions (signatures in the stub):

- `decodeThai(surface)`: split one written Thai word into syllables and decode each: `initial`, `initialClass`,
  `cluster`, `vowel` (written pattern with `◌` for the consonant position, e.g. `เ◌า`, `◌ิ`, `เ◌ีย`), `vowelLength`,
  `final`, `finalSound` (`k p t m n ŋ j w`), `ending` (`open` = long open vowel, counted live; `live`; `dead`),
  `toneMark`, `tone`, `rule` (one plain sentence, e.g. "low-class consonant, dead syllable with a short vowel → high
  tone"), `ipa`, `romanization` (Royal Institute style without tone marks is fine; say which in a comment),
  `confidence`, `start`/`end` offsets into `surface`.
- `decodeThaiRespelling(surface, respelling, ipa?)`: decode a dictionary phonemic respelling such as `ขะ-หฺนม`
  (syllables separated by `-`; phinthu `ฺ` under a consonant = it has no vowel and joins the next consonant: under
  `ห` before a sonorant it is leading ห, otherwise a true cluster; `็` marks a short vowel). The respelling is
  regular by construction, so decode each part with the rule engine. Lay the syllables over `surface` when the
  alignment is obvious (same syllable count as a rule decode, or a single syllable); otherwise `start`/`end` cover
  the whole word for every syllable. When `ipa` is given, `tonesFromIpa` is the authority for tone: on disagreement
  use the IPA tone, set `irregular: true`, cap confidence at 0.7. Mark `irregular: true` whenever the respelling
  differs from the spelling in a way the rules would not produce.
- `tonesFromIpa(ipa)`: `˧`/`˧˧` mid, `˨˩` low, `˥˩` falling, `˦˥` or `˥` high, `˩˩˦` or `˩˦` or `˨˦` rising; one per
  syllable (split on `.` and spaces); `undefined` where no tone letter is found.
- `thaiOrthFeatures(syllables)`: de-duplicated feature keys, only from syllables with confidence ≥ 0.6:
  `class:mid|high|low`, `vowel:<pattern>`, `final:<sound>`, `ending:live|dead`, `mark:mai-ek|mai-tho|mai-tri|mai-chattawa`,
  `rule:<class>+<live|dead-short|dead-long|mai-ek|mai-tho|mai-tri|mai-chattawa>=<tone>`, `lead:ho-nam`, `lead:o-nam`,
  `cluster:<letters>`, `sign:thanthakhat`, `sign:mai-yamok`, `special:ro-han` (รร), `special:rue` (ฤ), `irregular`.
- `describeThaiOrthFeature(key)`: a plain-words label for each key.

Rules to implement (standard Thai orthography):

- Classes — mid: ก จ ด ต ฎ ฏ บ ป อ; high: ข ฃ ฉ ฐ ถ ผ ฝ ศ ษ ส ห; low: all others.
- Tone, no mark: live syllable → mid (mid/low class) or rising (high class); dead syllable → low (mid/high class),
  high (low class, short vowel), falling (low class, long vowel). mai ek: low (mid/high), falling (low).
  mai tho: falling (mid/high), high (low). mai tri: high. mai chattawa: rising.
- Leading ห before ง ญ น ม ย ร ล ว: silent, syllable takes high class. Leading อ in อย่า อยู่ อย่าง อยาก: mid class.
- True clusters (class of the first letter): กร กล กว ขร ขล ขว คร คล คว ตร ปร ปล พร พล ผล (+ loan clusters บร บล ดร ฟร ฟล).
  Pseudo-clusters: ทร = /s/ in native words (ทราย, ทรง), จร สร ศร ซร = first letter only (จริง, สร้าง, ศรี).
- Finals: ก ข ค ฆ → k; จ ช ซ ฎ ฏ ฐ ฑ ฒ ด ต ถ ท ธ ศ ษ ส → t; บ ป พ ฟ ภ → p; น ณ ญ ร ล ฬ → n; ม → m; ง → ŋ; ย → j; ว → w.
- Vowels: every standard written pattern, short and long, including ◌ะ ◌ั ◌า ◌ำ ◌ิ ◌ี ◌ึ ◌ื ◌ุ ◌ู เ◌ะ เ◌็ เ◌ แ◌ะ แ◌็ แ◌ โ◌ะ โ◌
  เ◌าะ ◌็อ ◌อ เ◌อะ เ◌ิ เ◌อ เ◌ียะ เ◌ีย เ◌ือะ เ◌ือ ◌ัวะ ◌ัว ◌ว◌ ใ◌ ไ◌ เ◌า ◌ัย ไ◌ย and the vowel + ย/ว combinations; implicit
  short o between two consonants (คน, นก); implicit short a for a lone consonant (ส in สบาย); รร (a before a final,
  an at the end); ฤ ฤๅ; ◌์ silences its consonant (and a preceding consonant in known patterns such as ◌ทร์ ◌ตร์ ◌ดิ์);
  ๆ and ฯ are signs, not syllables.
- ◌ำ ใ◌ ไ◌ เ◌า are short vowels that end in a sonorant: the syllable is live.
- Class carry-over: an unstressed implicit-a syllable with a mid or high consonant followed by a syllable beginning
  with a low sonorant (ง ญ น ม ย ร ล ว) passes its class on (ขนม → ขะ-หนม, ตลาด → ตะ-หลาด, สนุก, ถนน, อร่อย, จมูก, ฝรั่ง,
  สมุด, ตลก, ขยัน, สนาม, ฉลาด). There are exceptions (mostly Pali/Sanskrit loans such as สมาชิก, สมาคม): put the ones
  you are sure of in `orth-exceptions.ts`, and cap confidence at 0.75 for any carry-over decided by rule.
- `orth-exceptions.ts`: a reviewed-by-you list of common irregular words with their respelling (e.g. น้ำ long vowel,
  เขา / ฉัน / ไหม spoken tone vs written tone — keep the written-rule tone as `tone` and say so in `rule`; ก็; ธรรม;
  จริง; สระ; เพชร; ผลไม้ …). Only words you are certain of. Each decoded through `decodeThaiRespelling`, `irregular: true`.

Confidence: ≥ 0.9 for an unambiguous syllable with an explicit vowel; 0.7–0.85 for implicit vowels in a
one-syllable word; ≤ 0.6 when the syllable division of a polysyllabic word without explicit vowels is a guess;
when the word cannot be parsed return the syllables you are sure of and none of the rest, or `[]`. **A confident
wrong tone is the one unacceptable outcome.**

Acceptance (the coordinator runs its own table; yours should cover at least these, tone per syllable):
mid: กา คา มา ดี ปู งู กิน ใจ ไป ทำ คำ เรา คน ลม ตรง ความ ปลา ครู ไกล กลัว เมือง เรียน เดิน เลย เคย เธอ โรง ·
rising: ขา สี หู ผี หมา หนู หมู หนา หลาย หวาน ไหม หลัง เขา เสือ หัว สวย ฝน ผม ขวา หรือ เหนือ ·
low: กัด จาก บาป ปาก เด็ก ขัด สุก หก ผัก ถูก สิบ ไก่ ป่า ต่อ ข่าว สี่ ใส่ ถั่ว ใหม่ หนึ่ง หมด หนัก หยุด เหล็ก อยู่ อย่า อย่าง อยาก เปล่า เปิด เกิด เกาะ แกะ สด จบ กบ ·
high: คัด รัก นก เล็ก พบ ทุก ยก น้อง ม้า รู้ ร้อน นี้ นั้น แล้ว ซื้อ ช้าง ไม้ ฟ้า น้ำ โต๊ะ จ๊ะ พระ ครับ พริก ครั้ง เท้า เช้า ใช้ เยอะ เพราะ และ มด รถ ·
falling: มาก พูด ชอบ เรียก ลูก โลก ภาพ เลือด แม่ พ่อ ไม่ ที่ ว่า เพื่อน นั่ง ง่าย บ้าน ได้ ข้าว ห้า ต้อง ให้ เก้า ผู้ ด้วย เข้า ถ้า หน้า หญ้า ไหม้ กว้าง ใกล้ กล้วย ใช่ เสื้อ ·
thanthakhat: สัตว์ low · ศุกร์ low · จันทร์ mid · เสาร์ rising · องค์ mid · ศักดิ์ low ·
polysyllabic: หนังสือ rising rising · โรงเรียน mid mid · อาหาร mid rising · ภาษา mid rising · เข้าใจ falling mid ·
นักเรียน high mid · ทำงาน mid mid · ขอบคุณ low mid · ประตู low mid · ประเทศ low falling · ชีวิต mid high ·
ขนม low rising · ตลาด low low · สนุก low low · ถนน low rising · อร่อย low low · จมูก low low · สบาย low mid · สวัสดี low low mid.
Respelling: `decodeThaiRespelling('ขนม', 'ขะ-หฺนม', '/kʰa˨˩.nom˩˩˦/')` → low, rising; `('ตลาด', 'ตะ-หฺลาด', '/ta˨˩.laːt̚˨˩/')` → low, low.

---

## B — Thai lexical layer

**Yours:** `src/adapters/th.ts`, new files under `src/adapters/thai/` except the two owned by A
(`lexicon-core.ts`, `function-words.ts`, `phrases.ts`, `constructions.ts`, `prose.ts`, …), `test/adapters/th.test.ts`
and new `test/adapters/thai-*.test.ts` (not `thai-orthography.test.ts`). **Contract:** `src/core/adapters.ts`
(`AnalysisCandidate.register/role/definition`, `decode`, `decodeWithPronunciation`, `orthFeatures`,
`describeOrthFeature`), `RegisterTag` in `src/core/course.ts`. Read `src/adapters/shared.ts` before you start.

Keep every current export of `th.ts` (`thAdapter`, `thLexicon`, `THAI_COMPOUNDS`, `thaiInitialClass`,
`segmentThaiSentences`, `thNumberToWords`) and keep the existing Thai tests green (`test/adapters/th.test.ts`,
`offsets.test.ts`, `registry.test.ts`, `verification.test.ts`, `speech.test.ts`).

1. **Wire decoding**: `decode`, `decodeWithPronunciation`, `orthFeatures`, `describeOrthFeature` on `thAdapter` from
   `./thai/orthography` (A's module; a stub until A lands — your tests must not depend on its results beyond
   "returns an array"). `pronunciation()` reports tone per syllable from `decode` when confidence ≥ 0.6 and gives a
   transliteration only from the decoder or the lexicon; drop the hand `translit` values that disagree.
2. **Function words with a `role`** (candidate.role, short plain words): aspect and modal markers (กำลัง จะ เคย แล้ว อยู่
   ได้ ต้อง ควร อาจ น่าจะ คง ยัง เพิ่ง), negation, question words and particles (ไหม หรือ หรือเปล่า ใช่ไหม เหรอ ล่ะ), polite and
   mood particles (ครับ ค่ะ คะ จ้ะ จ๊ะ ฮะ นะ สิ ซิ เถอะ หรอก เลย ด้วย ล่ะ น่ะ แหละ ละ), discourse markers and connectives (ก็ แล้วก็
   แต่ แต่ว่า เพราะ เพราะว่า จึง ดังนั้น ถ้า ถึง แม้ว่า ถึงแม้ว่า อย่างไรก็ตาม เมื่อ ขณะที่ หลังจาก ก่อน ทั้งๆ ที่ ส่วน สำหรับ), relative and
   complement markers (ที่ ซึ่ง อัน ว่า ให้), prepositions, pronouns and kin terms used as pronouns with `register`
   (ข้าพเจ้า formal; ดิฉัน formal; ผม ฉัน เรา เขา เธอ มัน ท่าน; หนู child-directed; กู มึง slang; พี่ น้อง ลุง ป้า น้า อา ตา ยาย ปู่ ย่า),
   royal vocabulary (ทรง เสด็จ พระ- → `royal`).
3. **Classifiers**: the common ones (คน ตัว อัน เล่ม ใบ ลูก คัน หลัง ห้อง แผ่น เส้น ดอก ต้น ผืน คู่ ชิ้น ก้อน เม็ด ขวด แก้ว ถ้วย จาน ชาม
   ฉบับ เรื่อง ครั้ง หน องค์ รูป ท่าน ตน สาย ด้าม เครื่อง ลำ ขบวน ซอง กล่อง ถุง ช่อ พวง ฝูง …) with what each counts.
4. **Core vocabulary**: about 300 of the most frequent content words of early reading (family, people, animals, body,
   home, school, food, nature, time, numbers, colours, common verbs and adjectives). Gloss each in a few words.
   Only words and meanings you are certain of. This is a seed lexicon, labelled as such, not native-reviewed.
5. **Phrase units** (PhraseRule, kind per shared.ts): about 60 units whose meaning is not the sum of the parts or
   which always travel together (ไปหา go to see · ไปเที่ยว · กลับบ้าน · ไม่เป็นไร · เป็นอย่างไร · ทำไม · เท่าไร · ด้วยกัน · เหมือนกัน
   · อีกครั้ง · ทันที · นิดหน่อย · ที่สุด · ก็ได้ · ก็แล้วกัน · ไม่ค่อย · ไม่เคย · ยังไม่ · เกือบจะ · ตั้งใจ · ดีใจ · เสียใจ · ตกใจ · เข้าใจ …).
6. **Constructions** (`detectPatterns`, each with a key, title and a one-or-two-sentence explanation with one Thai
   example and its English): กำลัง + VERB (+ อยู่); VERB + อยู่; จะ + VERB; เคย + VERB; VERB + แล้ว; ยังไม่ + VERB; ไม่ได้ + VERB;
   VERB + ได้ / ไม่ได้ (ability); ต้อง / ควร / อยาก + VERB; ถูก / โดน + VERB (passive); ให้ causative; VERB + ให้ (benefactive);
   ที่ relative clause; ว่า complement; ADJ + กว่า; ADJ + ที่สุด; noun + number + classifier; noun + classifier + นี้/นั้น;
   reduplication with ๆ; directional verbs after a verb (ไป มา ขึ้น ลง เข้า ออก); ถ้า … ก็; เพราะ … จึง; การ / ความ nominalizers;
   ไหม / หรือเปล่า / ใช่ไหม questions. Keep the five existing keys. Confidence honest: a detector that fires on a
   lexical coincidence must be below 0.6.
7. **Register**: `register` on candidates for anything that is not ordinary contemporary Central Thai (colloquial,
   formal, literary, archaic, royal, religious, slang, child-directed, and the regional tags when you are sure). A
   handful of well-known Isan and southern words is enough; each must carry the tag.
8. **Long prose spans**: `segmentThaiProse(text): Span[]` in `thai/prose.ts`. `segmentSentences` keeps today's rules;
   afterwards any span with more than 28 word tokens is divided at single spaces into reading units: split at a
   space when the unit so far has ≥ 6 word tokens and the remainder has ≥ 3; never inside quotation marks or
   brackets that open and close within the span, never next to a digit, a Latin-script word, `ๆ`, `ฯ`; prefer a space
   followed by a connective (แต่ แล้ว และ เพราะ จึง ถ้า เมื่อ ส่วน ดังนั้น ก็). Spans must slice the text exactly and cover
   every non-space character in order. Existing short seed sentences must come out exactly as before.
9. Update `SUPPORT` honestly (what is seed-only, what is rule-based, what is not measured).

Tests: every list entry analyses to its role/gloss; each construction fires on its example and not on a near miss;
phrases; register tags; prose segmentation invariants (exact slicing, coverage, no split of short text, determinism);
offsets round-trip on a paragraph of mixed Thai / digits / Latin.

---

## C — Dictionary pipeline and runtime

**Yours:** `scripts/dict-build.mts`, `src/dict/**` (`index.ts` is a STUB → real; keep its two exported functions and
their signatures), `test/dict/**`. **Contract:** `src/core/contracts/lexicon.ts`.

The candidate source is the kaikki.org Wiktionary extract for Thai (JSON Lines, CC BY-SA; **not downloaded** — the
learner's permission is pending). Real entries look like this (observed):

```json
{"word":"ขนม","pos":"noun","lang_code":"th","lang":"Thai",
 "forms":[{"form":"kà-nǒm","tags":["romanization"]}],
 "sounds":[{"other":"ขนม","raw_tags":["Orthographic"],"roman":"kʰ n m"},
           {"other":"ขะ-หฺนม","raw_tags":["Phonemic"],"roman":"kʰ a – h ̥ n m"},
           {"raw_tags":["Paiboon"],"roman":"kà-nǒm","tags":["romanization"]},
           {"raw_tags":["Royal Institute"],"roman":"kha-nom","tags":["romanization"]},
           {"ipa":"/kʰa˨˩.nom˩˩˦/"}],
 "senses":[{"glosses":["sweets; dessert"],"links":[["sweets","sweets"]]},
           {"glosses":["snack"],"synonyms":[{"tags":["childish","colloquial"],"word":"หนม"}]}],
 "etymology_text":"…"}
```

Senses may also carry `tags` (e.g. `colloquial`, `formal`, `archaic`, `slang`, `vulgar`, `royal`, `literary`,
`poetic`, `dialectal`, `Isan`, `Northern`, `Southern`, `childish`, `form-of`, `alt-of`), `raw_glosses`, `topics`,
`classifiers` (shape not confirmed: accept an array of strings or of objects with `classifier` or `word`).
Treat every field as optional and every shape as untrusted.

1. `scripts/dict-build.mts` (`npm run dict:build -- --in <file.jsonl> --lang th [--out public/dict] [--date YYYY-MM-DD]`):
   streams the JSONL line by line (the real file is ~50 MB: never read it whole), maps each line to
   `DictionaryEntry` (normalize the headword with the language adapter's `normalize`; POS map to `PartOfSpeech`;
   up to 6 glosses, first gloss of each sense, in order, de-duplicated; `respelling` = `sounds[].other` whose
   `raw_tags` include `Phonemic`; `ipa`; `romanization` = the Paiboon roman, else the first romanization form;
   `register` from sense tags; `classifiers`; skip entries with no gloss; skip `form-of` / `alt-of` senses unless
   they are the only ones), merges duplicates (same form + POS), and writes `out/<lang>/manifest.json`
   (`DictionaryInfo` + `shards` count + `schema: 1`) and `out/<lang>/s-<hh>.json` shards (bucket = stable hash of
   the form mod 256; shard = `{ [form]: compact entries }`). Prints counts: lines, entries kept, skipped by reason,
   malformed lines (never throws on one bad line). Deterministic output for the same input and `--date`.
   No frequency data exists in this source: `hasFrequency: false`, `frequencyRank` absent. Attribution string:
   "Wiktionary, via kaikki.org — CC BY-SA 4.0" (state in `licence` too).
2. Runtime (`src/dict/index.ts` + helpers): `createMemoryLexiconSource` (keep), `createFetchLexiconSource(lang, {baseUrl = '/dict', fetch})`
   — lazy manifest read (404 or invalid ⇒ `info()` undefined, `lookup` empty; never throws), shard fetch on demand,
   in-memory shard cache, concurrent lookups share one request; `createFileLexiconSource(dir, lang)` for Node (CLI and
   tests; put it in `src/dict/file.ts` so the browser bundle never imports `node:fs`). Export the pure mapper
   (`entryFromKaikki(line: unknown, normalize): DictionaryEntry[]`) and the bucket function for tests.
3. Fixture: `test/dict/fixtures/kaikki-th-sample.jsonl`, about 40 entries **written by you in the real shape**
   (clearly a hand-made fixture: say so in a sibling README) covering: several senses, two POS for one word, a
   classifier, particles, register tags, a form-of entry, a malformed line, an entry without glosses, a duplicate.
4. Tests: mapping (each field), merge, skip reasons, determinism (two builds byte-identical), shard round-trip
   through the file source and through the fetch source with a fake `fetch`, missing manifest, corrupt shard.

Do not download anything.

---

## D — Importer: works, notes, personal copies, dictionary analysis, plain text

**Yours:** `src/ingest/**` (`plaintext.ts` is a STUB → real), `scripts/corpus-convert.mts`, the other
`scripts/corpus-*.mts` only where an option must be passed through, `docs/IMPORT.md` (add sections, keep the rest),
`docs/import/templates/` (one new template), `test/ingest/**`. **Contract:** `Text.workId/chapter/personalCopy`,
`TokenAnalysis.syllables/register/role/definition`, `RightsStatus 'personal-copy'`, `Authorship 'published'` in
`src/core/model.ts`; `ContentNote`, `Work` in `src/core/course.ts`; `LexiconSource` in
`src/core/contracts/lexicon.ts`; `decodeFor` in `src/core/adapters.ts`; tables `notes`, `works` in `src/core/store.ts`.

1. **Format (still schemaVersion 2, all additions optional):**
   - `work?: { slug: string; courseId?: string; chapter?: { index: number; title?: string } }` → `Text.workId =
     ids.work(courseId ?? the first course in COURSES with this language, slug)` and `Text.chapter`. Validation:
     slug `[a-z0-9-]+`; chapter index a positive integer; when the `works` table has rows for that course and the
     slug is not among them → warning `unknown-work` (the context gets an optional `knownWorks?: ReadonlySet<string>`
     of work ids; `importDocuments` fills it from the store).
   - `DocSentence.notes?: DocNote[]` and document-level `notes?: Array<DocNote & { match: string; occurrence?: number }>`
     (anchored to the first — or `occurrence`-th, 1-based — sentence whose exact text contains `match`; no such
     sentence → error `note-anchor-missing`). `DocNote = { kind: ContentNote['kind']; body: string; start?: number;
     end?: number; spans?: Array<{ start; end; label }>; topics?: string[]; provenance?: 'human' | 'machine';
     reviewStatus?: ReviewStatus; by?: string }`. Offsets are within the sentence text and must lie on token
     boundaries (`start`/`end`) or inside the sentence (`spans`). Stored as `ContentNote` rows (`ids.note(textId, key)`,
     key = stable hash of sentence key + kind + body) in the `notes` table, replaced atomically with the text.
     A machine note that is not reviewed is stored but flagged (`reviewStatus: 'unreviewed'`); the UI decides.
2. **Personal copies** (`src/ingest/publish.ts`): a document with `source.rights === 'personal-copy'` is published
   **without a review** iff `source.authorship === 'published'`, `generated !== true`, `contentType !== 'scripture'`,
   and `source.provenance` is non-empty; then `Text.personalCopy = true`. Any other combination with
   `personal-copy` is an error with a clear fix (Scripture: "Scripture is never a personal copy: it must be an
   identified, verified translation"; generated: "generated text is not a published work"). All existing rules stay
   exactly as they are for every other rights value. Add the cases to `publish.test.ts`.
3. **Dictionary analysis**: `ImportOptions.lexicon?: (lang: LanguageCode) => LexiconSource | undefined`.
   `importDocuments` (async) makes a pre-pass per document: tokenize with the adapter, collect the normalized forms
   of word tokens for which `adapter.analyze` returns no candidate, `lookup` them once, and hand the result to
   `planDocument(doc, registry, { dictionary?: Map<string, DictionaryEntry[]>, dictionaryId?: string })` (stay
   synchronous and pure). For such a token the candidates become the dictionary entries: `lemma` = the form,
   `pos`, `gloss` = first two glosses joined with "; ", `register`, `role`, `definition`,
   `notes.respelling` / `notes.ipa` / `notes.romanization` when present, `notes.senses` = remaining glosses,
   `notes.classifiers`; best candidate first (entry order), confidence 0.6 when the form has one POS, 0.45 when
   several (the rest become alternatives); analyzer `dict:<info.id>`; provenance `lexicon`. Adapter lexicon, author
   spans and human corrections always win. The plan signature must include the dictionary id so that installing a
   dictionary re-analyses on the next import. Carry `register`, `role`, `definition` from any candidate (adapter or
   dictionary) onto the stored `TokenAnalysis`. Do **not** store `syllables` (decoded on demand, see `decodeFor`).
   Validation (`validateDocument`) stays dictionary-free; the import report's `analysisCoverage` reflects the
   dictionary.
4. **Plain text** (`plainTextToDocuments`, contract in the stub): exact text preserved; one paragraph per non-empty
   line (`{ text }` raw paragraphs, leading/trailing whitespace of the line trimmed only when it is plain
   indentation — record in `notes` if anything was trimmed); chapter detection `auto`: a line that is only a heading
   such as `บทที่ ๑`, `บทที่ 12`, `ตอนที่ ๓`, `ภาคที่ ๒`, `Chapter 4`, optionally followed by a title on the same line; `none`;
   custom regex. One document per chapter: id `<prefix>-ch<NN>`, `title` "<work title> — <chapter heading>",
   `contentType` from options (default `story`), `corpus` = a per-language "Your books" corpus
   (`{ id: 'personal-<lang>', kind: 'comprehensible-input', title: 'Your books' }` — check the `Corpus['kind']` union
   and use the existing comprehensible-input kind), `source` built from the work (title, author, publisher,
   `rights: 'personal-copy'`, `authorship: 'published'`, attribution "<title> — <author>. Your own copy; not
   distributed.", provenance from `copyNote` or "Supplied by the learner from a personal copy; transcription not
   checked."), `review: { status: 'unreviewed' }`, `generated: false`, `work: { slug, courseId, chapter }`.
   BOM and CRLF handled; text before the first heading becomes chapter 0 "Front matter" only if it has content.
5. **CLI** `npm run corpus:convert -- <book.txt> --lang th --work <slug> [--title …] [--chapters auto|none|<regex>]
   [--copy-note "…"] [--out data/private/<lang>/<slug>]`: looks the work up in `src/course` (`THAI_WORKS`), writes one
   JSON per chapter, validates each with the real validator, prints what it found. Refuses to write inside
   `data/corpus/` ("personal copies are never bundled").
6. `docs/IMPORT.md`: sections "Works and chapters", "Notes", "Your own copy of a book", "Dictionary analysis";
   template `docs/import/templates/personal-copy.v2.json`.
7. Tests for every rule above, plus: re-import unchanged, revise a chapter (version bump, notes replaced), a batch
   of chapters, notes anchoring, dictionary candidates vs adapter lexicon precedence, signature changes with the
   dictionary id, converter exactness (the concatenated paragraph texts reproduce the input lines), Thai digits in
   headings. Keep `corpus:prove` green (`test/ingest/prove.test.ts`).

---

## E — GoLearn course model, catalogue, database

**Yours:** `src/golearn/**`, `src/course/index.ts` (STUB → real), `src/course/catalog.ts`, `src/db/dexie.ts`,
`test/golearn/**`, `test/course/**`, `test/db/**`. **Contract:** `src/core/contracts/golearn.ts` (bottom: the four
new methods and their result types), `src/core/contracts/course.ts`, `src/core/course.ts`, `DecodingRevealed` /
`NoteOpened` in `src/core/events.ts`, `ItemKind 'orth'`, `decodeFor` in `src/core/adapters.ts`.

1. **Database**: Dexie version 3 adds `stages`, `works`, `notes` and the `texts.workId` index (schema is generated
   from `INDEXES`; no data migration needed). Test: a version-2 database opens and keeps its rows.
2. **Catalogue** (`createCourseCatalog({ store, golearn? })`): `install(courseId)` upserts the ladder from
   `src/course/thai.ts` for `thailand-th` (no-op for courses without a ladder); idempotent; a stored work whose
   `rights.verified` or `bibliographyVerified` is true keeps its stored `rights` and bibliography fields.
   `stages`, `works` (spine first, then `order`), `work`, `textsOf` (by `chapter.index`, then title),
   `stageOfText`, `assistanceFor` (text's stage profile; else the profile of `currentStageId`; else
   `DEFAULT_ASSISTANCE`), `currentStage` (stored choice in `meta` key `stage:<userId>:<courseId>` wins; otherwise the
   first stage whose readiness verdict is not `ready-to-advance`; without `golearn`, the first stage),
   `setCurrentStage`.
3. **Orth items**: when a sentence is seen, word tokens also yield `orth` items —
   `adapter.orthFeatures(decodeFor(adapter, surface, analysis))` → `ids.orth(lang, feature)` — folded with the same
   policy as other items (exposure on a dwell-based view, and so on). Cache decodes per form within a fold. Languages
   without `decode` yield none. Orth items must **not** enter word coverage, vocabulary lists, recommendations or
   the estimate for words: check every place that enumerates item kinds.
   `DecodingRevealed` = item-targeted help (level 1) for the form `itemId` **and** for each
   `ids.orth(lang, feature)` in `features`; `romanization: true` is kept on the encounter record (use an existing
   free-form field if there is one, otherwise report the contract change you need) so the audit can show
   romanization dependence. `NoteOpened` has no effect on evidence.
4. **Policy**: `POLICY_VERSION = 'evidence@5'` (derived state is rebuilt from the log as today). A `READINESS` block
   in `policy.ts` holds every threshold below, marked provisional.
5. **`predictDifficulty(userId, textId, opts?)`**: over the live sentences of the text (or `opts.sentenceIds`):
   `coverage` (existing personalised coverage), `predictedCoverage` = shown-known + likely-familiar share of word
   tokens; unknown forms split into `properNouns` (POS PROPN), `newUsefulWords` (occurs ≥ 2 times in this text or in
   the other texts of the same work, or ≥ 3 times across stored texts) and `rareWords` (the rest), each sorted by
   count; `weakPhrases` (phrase items the learner has met whose last two encounters needed item-targeted help);
   `newConstructions` (pattern items never met); `varieties` (count of word tokens per non-`standard` register tag
   on the resolved analysis); `unanalysedWords`; `limits` (always states: "No frequency data: 'useful' means repeated
   in this text, this book or your library"; adds a line when unanalysed words exceed 5 % and when the learner has
   too little history for an estimate); `summary` like "Predicted coverage 94.7 % (an estimate). 18 new useful
   words · 9 rare words · 6 weak phrases · 3 new constructions." Deterministic for identical state.
6. **`readingPace(userId, opts?)`**: from `SentenceViewed.dwellMs` (ignore views without it), word tokens of those
   sentences, lookups (TokenHelpOpened, PhraseHelpOpened, GrammarHelpOpened, DecodingRevealed) and rescues
   (SentenceExplanationRevealed, EnglishRescueRevealed scope sentence/verse) in scope. `wordsPerMinute` only with
   ≥ 30 timed sentences. Dwell is capped by the reader, so this is a rough lower-bound measure: say so in a comment
   and never present it as a score. `trend`: compare the median words-per-minute of the last three sittings with the
   three before (≥ 10 % faster / slower; fewer than six sittings ⇒ `insufficient-data`).
7. **`stageReadiness(userId, courseId, stageId?)`** (default: the catalogue's stored stage or the first): signals —
   `lexical-coverage` (comfortable coverage across the stage's imported texts ≥ 95 %), `lookup-rate` (≤ 4 per 100
   words over the last 300 sentences seen in stage texts), `sentence-rescue-rate` (≤ 5 per 100 sentences, same
   window), `reported-comprehension` (≥ 80 % of reports 'all' or 'most', at least 3 reports), `reading-pace-trend`
   (not `slower`), `unfamiliar-material` (predicted coverage ≥ 90 % on imported texts of the next stage the learner
   has not opened; none imported ⇒ unread texts of this stage ≥ 95 %; none ⇒ `not-available`), `retention` (of items
   first met ≥ 7 days ago and met again in the last 7 days, ≥ 85 % without item-targeted help; at least 30 items),
   `decoding` (pre-reader stage only: DecodingRevealed ≤ 10 per 100 words over the window, and romanization rescues
   0 in the last 100 sentences), `listening` (`not-available` unless reviewed real speech evidence exists). Verdict:
   `insufficient-data` with fewer than 150 sentences seen in the stage or fewer than four signals with data;
   `ready-to-advance` when every signal with data is met and `lexical-coverage` plus at least one of
   `lookup-rate` / `sentence-rescue-rate` have data; otherwise `stay`. Finishing every text never changes the
   verdict by itself (test it). `explanation` in plain words; each signal explains itself with its numbers.
8. **`itemHistory(userId, itemId)`**: first encounter (text title, `workId`, `chapter.index`), counts by text,
   `reading` / `listening` / `production` plain labels from the existing dimension states ("met 23 times, last 4
   without help" style, reuse `explain.ts` wording where it exists), `pronunciation: 'not measured'`, and `lines`
   ready for display ("You first met this in <title>, chapter 7." "Met 23 times in 4 texts." "Reading: likely
   familiar (an estimate)." "Listening: not heard in real speech yet." "Not used in your own writing yet."
   "Pronunciation: not measured.").
9. Tests for all of the above on the memory store with the real Thai adapter where it matters; rebuild-from-log
   equality including orth items; `evidence@4 → @5` migration through `ensureCurrent`.

---

## F1 — Course pages, wiring, import of a personal copy

**Yours:** `src/app/bootstrap.ts`, `src/ui/context.tsx`, `src/ui/App.tsx`, `src/ui/pages/Course.tsx` (new),
`src/ui/course/**` (new, with its own `course.css`), `src/ui/pages/Home.tsx`, `src/ui/pages/Library.tsx`,
`src/ui/library.tsx`, `src/ui/pages/Settings.tsx`, `src/ui/pages/settings/**`, `test/ui/harness.tsx`,
`test/ui/fixtures.ts`, new `test/ui/course*.test.tsx`, and existing UI tests of the pages you change.
**Not yours:** `src/ui/reader/**`, `src/ui/pages/TextPage.tsx` (F2), `src/index.css` (add styles in your own css file).
Look at Home / Library / Settings first and keep their visual language (warm paper, EB Garamond, quiet labels).

1. **Services**: `AppServices` gains `catalog: CourseCatalog` and `lexicon(lang): LexiconSource | undefined`;
   `IngestApi` gains `convertPlainText(text, opts: PlainTextOptions): PlainTextResult`, and `import` / `validate`
   pass the lexicon to the importer. Bootstrap: `createCourseCatalog({ store, golearn })`, `catalog.install(course.id)`
   for the active course at startup and when the course changes, `createFetchLexiconSource(lang)` per language
   (lazy; no request until first use). Update `test/ui/harness.tsx` so every existing UI test still builds services
   (real catalogue on the memory store, memory lexicon).
2. **`/course` — the reading ladder** (only for a course that has stages; otherwise the route redirects home):
   stages in order, the stage the learner is working at open and the rest collapsed (accessible disclosures); each
   stage: label, band when stated, purpose; works grouped as spine / also at this stage / nonfiction / extensive /
   listening; each work: title, author when known, purpose, variety chips (`registers`), and one honest rights line
   from `rights` (e.g. "In copyright (presumed, not verified). Read it from your own copy." / "Rights not
   researched. Read it from your own copy."), never a claim the data does not make. If texts exist for the work:
   "Your copy · n chapters" linking to the first unfinished chapter, with the canonical progress line of each
   chapter (reuse `useReadingProgress` / `ProgressLine`).
3. **Add your copy**: on a work, a file input (`.txt`, `.json`): `.txt` → `ingest.convertPlainText(text, { lang, work,
   copyNote })` → the existing validation preview (documents, chapters found, issues, analysis coverage, would it be
   readable) → explicit confirm → import. The preview states plainly: "This stays on this device. It is not
   uploaded, bundled or shared." Nothing is imported without the confirm. Also accept `.txt` in Settings → Content
   (asks for a title; no work).
4. **Stage**: "You are working at: <stage>" with a quiet "Change" control (`catalog.setCurrentStage`), and a collapsed
   "How is this going?" disclosure showing `golearn.stageReadiness` (each signal with its explanation and status
   words "met / not yet / not enough reading yet / not available") and `golearn.readingPace` in one or two plain
   lines. Advice only: no locks, no badges, no percentages on the stage list, nothing that looks like a score.
5. **Home**: for a course with stages, a "Reading ladder" door with the current stage's label. **Library (Read)**:
   personal copies grouped by work in chapter order, labelled "Your copy".
6. **Settings → Language support**: dictionary line per language from `lexicon(lang).info()` — "No dictionary
   installed: words outside the built-in list show as not analysed" or "<attribution> · <n> entries · built <date>".
7. Tests: ladder renders from the real manifest; rights lines never say "public domain" for unverified data;
   conversion → preview → confirm → chapters appear under the work; cancel imports nothing; stage change persists;
   readiness disclosure with insufficient data; a course without stages has no ladder door.

---

## F2 — Reader: stage-aware word sheet, decoding, notes, difficulty preview

**Yours:** `src/ui/reader/**` (with a new `reader/thai.css` for new styles), `src/ui/pages/TextPage.tsx`,
`test/ui/reader*.test.tsx`, `test/ui/viewing.test.tsx`, `test/ui/comprehension.test.tsx`, new
`test/ui/wordsheet*.test.tsx`. **Not yours:** `src/ui/context.tsx`, `src/app/bootstrap.ts`, `test/ui/harness.tsx` (F1
adds `catalog` and `lexicon` to the services; code against `useApp().catalog` typed as `CourseCatalog`).
Read `Reader.tsx`, `TokenCard.tsx`, `TextPage.tsx`, `src/ui/coverage.tsx` first; keep the bottom sheet and its motion.

1. **Profile**: the reader asks `catalog.assistanceFor({ courseId, textId, currentStageId })` (current stage from
   `catalog.currentStage`). For courses without a ladder this returns `DEFAULT_ASSISTANCE` and the reader must look
   and behave exactly as it does today (existing reader tests stay green unchanged, apart from harness wiring).
2. **Word sheet by layers**: the sheet offers the profile's `layers` in order; "More help" opens the next layer the
   word actually has something for (skip empty layers, but always end at English). Events per layer:
   `LAYER_ASSISTANCE_LEVEL` and the table in `src/core/course.ts` (`DEFAULT_ASSISTANCE` comment). Layers:
   - `gloss` — as today; other senses (analysis `notes.senses`) behind "Other meanings"; a dictionary-sourced gloss
     is labelled "dictionary meaning, not checked for this sentence"; a role (`analysis.role`) reads as what the
     word does here ("softening particle").
   - `decoding` — per syllable: the letters, consonant class, vowel and length, final and live/dead, tone mark, tone,
     and the rule sentence; low-confidence syllables say "uncertain"; nothing decodable ⇒ "Go cannot decode this
     spelling reliably." Use `decodeFor(adapter, token.surface, analysis)`. Opening it emits `DecodingRevealed`
     (features from `adapter.orthFeatures`). When `decodingFirst`, the first tap shows gloss and decoding together and
     emits both events. Romanization appears only behind a "Show romanization (rescue)" button, only when the profile
     says `rescue`, and emits `DecodingRevealed` with `romanization: true`. No romanization anywhere else.
   - `phrase`, `grammar`, `sentence`, `english` — as today.
   - `definition` — `analysis.definition` in the target language when present; layer skipped when absent.
   - `discourse` — for particles / connectives: role plus the pattern explanation when one covers the token.
   - `note` — notes on this sentence (`store.notes`): kind label, body, topics. Emits `NoteOpened`. Unreviewed machine
     notes are shown only in preview mode.
   - `clause-structure` — the sentence's own text with the note's labelled spans underlined and labelled; the text
     itself is never rewritten. Emits `NoteOpened` and `SentenceExplanationRevealed`.
   - `history` — `golearn.itemHistory(userId, formId).lines`. No event.
   - Variety: when the resolved analysis has a non-`standard` register tag, the sheet shows one line under the gloss,
     e.g. "Isan regional word — not ordinary Central Thai", "Royal vocabulary", "Older literary word".
3. **English by profile** (`englishRescue`): `easy` — as today; `secondary` — after the target-language layers;
   `deep` / `on-request` — last in the sheet and behind the reader's own menu; never removed.
4. **Chrome by profile**: `full` as today; `reduced` — progress and coverage panels collapsed into one "Reading
   details" disclosure; `minimal` — the text, its title, and one quiet menu. `defaultHighlight` sets the initial
   highlighting of unknown words (the learner's own preference, once set, wins).
5. **Notes in the text**: a sentence with a visible note gets one subtle mark at its end (keyboard reachable, with
   an accessible name); tapping opens the sheet on the note.
6. **Difficulty preview** on the text page: a collapsed, optional "Preview difficulty" disclosure
   (`golearn.predictDifficulty`): the summary, then the lists (new useful words, rare words, weak phrases, new
   constructions, names, varieties), then `limits` verbatim. Opening it must not emit TextViewed in mode 'open' or
   any exposure. It never blocks or warns against reading.
7. Tests: default profile unchanged; Stage 0 profile shows decoding with the first tap and offers romanization only
   as a rescue; a Grade 9 profile shows no chrome and still reaches English; events per layer; note mark and note
   sheet; clause-structure rendering keeps the sentence text byte-identical; preview emits nothing.

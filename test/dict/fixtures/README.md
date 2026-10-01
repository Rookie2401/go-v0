# Dictionary fixtures

`kaikki-th-sample.jsonl` is a HAND-MADE fixture, not an extract of the real kaikki.org file. It follows the JSON-Lines
shapes observed in the real extract (docs/PLAN5.md package C, docs/PLAN6.md "Facts established") so that the build and
the runtime can be tested without the real file. The glosses, respellings and pronunciations are written for the tests
(many are marked "fixture") and are not a source of Thai facts; do not copy them into a course.

What it covers (the tests count on these exact lines; 71 non-blank lines plus one blank line):

- 59 lines that map to an entry, 58 entries after merging, 50 distinct forms. กิน: two lines with the same
  pronunciation merge, a third with another reading stays its own entry. ใหม่ / ที่ / ไหม / ทรง have several parts of
  speech; นา has two etymology numbers; ไหม as a particle has two entries that differ in pronunciation (none merge).
- ขนม is the example from the brief (forms, sounds with Phonemic / Paiboon / IPA, two senses).
- Real sound-row shapes: Orthographic, Phonemic, Paiboon, Royal Institute, IPA, homophone and audio rows (ไทย);
  `Orthographic/Phonemic` as one tag (ขอบคุณ); variant readings with `Unorthographical` / `Short` labels paired by order
  (นีออน); counts that do not match, kept unpaired (ทดสอบ: two respellings, three IPA readings).
- Senses with topics, raw_tags and example counts (ไทย), a label-first gloss chain (ลาว), `alt_of` headwords (ตุ๊กตุ๊ก),
  a `form-of` only entry (หนม), a real sense plus an `alt-of` sense (แมว).
- Classifiers in the head template expansion (จาน) and, for tolerance, in the older `classifiers` shapes
  (strings, `{classifier}`, `{word}`; entry and sense level).
- Units and non-words: phrase, proverb, prep_phrase, prefix (part of speech X with a role); character, symbol, punct
  (skipped and counted).
- Register: formal, colloquial, slang (with `vulgar`, which has no register tag), royal, religious, Isan, Southern,
  Northern (from `raw_tags`), Northeastern, poetic, obsolete; a line with only vague labels (dialectal, polite, dated,
  humble) gets none.
- ทำ has eight senses with a repeated gloss (capped at six); รัก has only `raw_glosses`.
- Skipped: three entries without glosses (ขาย, ซื้อ, เก่า), one English line (`lang_code` en), one line without `word`.
- Not an entry: one truncated JSON line, one line of plain text (malformed), `[1,2]` and `42` (valid JSON, not objects),
  and a blank line.

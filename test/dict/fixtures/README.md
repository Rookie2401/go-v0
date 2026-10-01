# Dictionary fixtures

`kaikki-th-sample.jsonl` is a HAND-MADE fixture, not an extract of the real kaikki.org file. It follows the JSON-Lines
shape of the real extract (see docs/PLAN5.md, package C) so that the build and the runtime can be tested without
downloading anything. The glosses, respellings and pronunciations are written for the tests and are not a source of
Thai facts; do not copy them into a course.

What it covers (the tests count on these exact lines):

- 42 lines that map to an entry. กิน appears three times (merge; one line is an exact copy), ใหม่ / ที่ / ไหม / ทรง have two
  or three parts of speech, so the dictionary has 40 entries.
- ขนม is the example from the brief (forms, sounds with Phonemic / Paiboon / IPA, two senses).
- หนม has only a `form-of` sense (kept because it is the only one); แมว has a real sense plus an `alt-of` sense that must
  be ignored (including its `archaic` tag).
- Classifiers in the three shapes: entry-level strings, `{classifier}` objects and `{word}` objects (entry and sense level).
- Register tags: formal, colloquial, slang (with `vulgar`, which has no register tag), royal, religious, Isan, Southern,
  Northern (from `raw_tags`).
- ทำ has eight senses with a repeated gloss (capped at six); รัก has only `raw_glosses`.
- Skipped: three entries without glosses (ขาย, ซื้อ, เก่า), one English line (`lang_code` en), one line without `word`.
- Not an entry: one truncated JSON line, one line of plain text (malformed), `[1,2]` and `42` (valid JSON, not objects),
  and a blank line.

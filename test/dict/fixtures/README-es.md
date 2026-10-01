# Spanish dictionary fixture

`kaikki-es-sample.jsonl` is a HAND-MADE fixture, not an extract of the real kaikki.org Spanish file (about 1.05 GB,
never downloaded). It follows the JSON-Lines shape described in docs/PLAN9.md (S3): an inflected form is its own
entry whose senses carry `form_of: [{ word }]` and tags such as `form-of`, `first-person`, `plural`, `preterite`,
`with-voseo`, `Latin-America`, `Spain`; lemma entries carry glosses and region labels in sense tags (`Spain`,
`Latin-America`, `Mexico`, `Honduras`, `Central-America`, `Rioplatense`). The glosses, tags and pronunciations are
written for the tests and may differ from the real file; do not treat them as a source of Spanish facts.

What it covers (the tests count on these exact lines):

- Inflected forms: hablo, hablas (tag `informal`, which is not a register), habláis (Spain), hablás (voseo, lemma spelled
  with a capital in the source), hablado (participle; also an adjective lemma), tengo, tenés, dame (combined form),
  casas (twice, identical: one entry), grandes.
- Two lemmas for one form: fui (ir and ser), sé (saber and ser).
- A word that is both: niña has a lemma sense ("girl") and a form-of sense (feminine singular of niño).
- A form-of sense whose lemma list is garbage (zzz) stays an ordinary sense.
- Region labels on senses kept verbatim (coche, carro, chamba, vos) and region-tagged IPA readings (calle).
- Not entries: a contraction (part of speech absent), a phrase (part of speech X), a character (skipped as a non-word),
  an English line, a line with no senses, a truncated line.

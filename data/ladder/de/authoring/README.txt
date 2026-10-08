Authoring files of the German ladder (b1-bridge and recycling package, 2026-10-08).

Layout: one text file per unit in the folder of its stage: a1-1/, a1-2/, a2-1/, a2-2/ (the 69 units of 2026-10-06, exported from their JSON on
2026-10-08 and then edited here) and b1-bridge/ (the new controlled units de-b1-NN). The authentic units of the bridge have no file: they are
library texts named in bridge-order.json (id, textId, domain, title; a controlled entry names only id + domain, its text is b1-bridge/<id>.txt).

  node data/ladder/de/authoring/build.mjs     writes data/ladder/de/units/*.json (the sections and speakers of every authoring file; all other
                                              fields of an existing unit are kept; new units are created from the template) and rewrites the
                                              b1-bridge entries of ladder.json from bridge-order.json. Run from the repository root.

The JSON is what the app and the gate read; the text files are the source. A reviewer's corrections can be made in the text file and rebuilt, or in the
JSON (then the text file is stale).

Format of a unit file:
  === <unit id> [ | <contentType> | <domain> | <English title> | <German title> | <topics, comma separated> ]   (the | fields are read only for a NEW unit)
  speakers: <id>=<display name>, ...
  note: <text added to review.notes>                      (new units)
  ## <section title>
  [speaker] <German sentence> || <English sentence>       (a line without [speaker] is narration; a blank line starts a new paragraph)
Every line needs " || " and an English rescue line. Every unit stays a machine draft (pipeline.state "machine-draft", review.status "unreviewed").

The recycling pass: each unit may end with a section "## Erinnerst du dich?" (Do you remember?) that brings back the words of the previous units in real
sentences (recall-plan-round1.json, recall-plan-round2.json and recall-plan.json - the last round - say which lemma each section had to carry; kept as a record).

Tools (run from the repository root with `npx vite-node <file> -- <args>`; they read the authoring files, not the built JSON):
  draft.mts <unit id> [--targets a,b,c] [--suggest] [--make-baseline]
                      how one unit reads at its place in the ladder: coverage, new lemmas (EXTRA = not new in baseline.json), lemmas met 1-2 times, the
                      assigned recall slots; --suggest lists what the authentic units that follow still miss. baseline.json = coverage and new
                      lemmas of every unit BEFORE the recycling pass.
  inspect.mts <out.json>   per unit: new lemmas with forms, meetings in the next 6 units (recycling), later meetings (orphans)
  plan.mjs <inspect.json> <out.json> [--to <unit id>] [--unmet 0.23]   distributes the missing meetings over the controlled units of each window
  cands.mts / seen.mts / place-all.mts   cache the lemma counts of the library texts and of the learner, and rank library texts by coverage
  unknown-words.mts [controlled|authentic]   words whose first reading is unconfirmed (candidates for src/adapters/german/lexicon-ladder.ts)

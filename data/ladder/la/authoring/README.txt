Authoring files of the Latin (Church Latin) ladder, stage a1-1 (12 units).

Layout: one text file per unit in the folder of its stage: a1-1/01.txt ... a1-1/12.txt. Run from the repository root:
    node data/ladder/la/authoring/build.mjs
It reads them in name order and writes data/ladder/la/ladder.json and data/ladder/la/units/<id>.json. The JSON is what the app and
the gate read; these files are only the compact source. Edit the text and rebuild; do not edit the units by hand.

Format of a unit file (same as data/ladder/nb/authoring):
  === <unit id> | <contentType> | <domain> | <English title> | <Latin section title> | <topics, comma separated>
  speakers: <id>=<display name>, ...          (optional; the Stage 0 cast is predefined: ana=Anna, luis=Lucius, marta=Martha, nico=Marcus, sam=Samuel)
  note: <text for review.notes>               (optional)
  ## <section title>
  [speaker] <Latin sentence(s)> || <English sentence(s)>
  <Latin narration> || <English narration>
  (a blank line starts a new paragraph)

Names are written in the text in the case the sentence needs (Annae, Marcum, Marthae ...), so there are no {placeholders}.
Every line must contain " || " and an English rescue. Every built unit is a machine draft: pipeline.state "machine-draft",
review.status "unreviewed", generated true; the review needed is a Latinist's.

Checks: npx vite-node scripts/ladder-check.mts -- la ; npx vitest run test/ladder/gate.test.ts test/course/latin-ladder.test.ts

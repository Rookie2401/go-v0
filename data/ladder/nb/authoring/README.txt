Authoring files of the Bokmål ladder (Team Norway package D).

Layout: one text file per unit, in the folder of its stage: a1-1/01.txt ... a2-2/12.txt. node data/ladder/nb/authoring/build.mjs
reads them in name order and writes data/ladder/nb/ladder.json and data/ladder/nb/units/<id>.json. The JSON is what the app and
the gate read; these files are only the compact source. The b1-bridge has no files (see ../PLAN.md, section 5).

Format of a unit file:
  === <unit id> | <contentType> | <domain> | <English title> | <Norwegian section title> | <topics, comma separated>
  speakers: <id>=<display name>, ...          (optional; the cast of Stage 0 is predefined: ana, luis, marta, nico, sam)
  note: <text for review.notes>               (optional)
  ## <section title>
  [speaker] <Norwegian sentence(s)> || <English sentence(s)>
  <Norwegian narration> || <English narration>
  (a blank line starts a new paragraph)

{ana} {luis} {marta} {nico} {sam} {city} are replaced by the Bokmål names in data/stage0/world.json (Anna, Lars, Marta, Nils, Sam;
Bergen), so a renamed cast is a one-line change in the world file. Every line must contain " || " and an English rescue.
Every built unit is a machine draft: pipeline.state "machine-draft", review.status "unreviewed", generated true.

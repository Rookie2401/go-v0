Authoring files of the Bokmål ladder (Team Norway package D).

Layout: one text file per unit, in the folder of its stage: a1-1/01.txt ... b1-bridge/24.txt. node data/ladder/nb/authoring/build.mjs
reads them in name order and writes data/ladder/nb/ladder.json and data/ladder/nb/units/<id>.json. The JSON is what the app and
the gate read; these files are only the compact source. The b1-bridge (level B1) lives in b1-bridge/01.txt ... 24.txt (see ../PLAN.md, section 7); non-cast speakers need a speakers: line, and other names are written plainly.

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

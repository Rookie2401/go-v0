# Testing the Go ecosystem on this PC (Brave + local Repository)

Everything runs locally: the Repository service with a SQLite file, GoPractice and the GoLearn setup page as static
sites, and the GoLearn extension loaded unpacked into Brave. Nothing is deployed and no account leaves this machine.

## 1. Build and start (once per change)

```bash
cd C:\Users\CJWal\dev\go-v0
npm run local:build        # extension (dist/), setup page (dist/app + dist-web/), GoPractice (packages/gopractice/dist)
npm run local:seed         # the six mission teams in data/local-repository
scripts\local\start.cmd    # three windows: service :8790, GoPractice :5199, setup page :5198
```

Check: <http://127.0.0.1:8790/health> answers `{"ok":true,…}`. Stop everything with `scripts\local\stop.cmd`.

## 2. Load the extension into Brave (you do this part; it is a browser setting)

1. Open Brave and go to `brave://extensions`.
2. Switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose `C:\Users\CJWal\dev\go-v0\packages\golearn-extension\dist`.
4. Pin "GoLearn reader" from the puzzle-piece menu. The popup opens the setup page.

If Brave Shields complains on a reading site, the extension still works: it only talks to `127.0.0.1:8790`.

## 3. First run

1. In the popup, open **GoLearn setup** → **Account**: keep the service address `http://127.0.0.1:8790`, create an account (any email, a password of at least 10 characters; it stays on this PC).
2. Back in a terminal: `npm run local:seed -- --member you@example.org` (team membership is a leader's act; this does it for the local database).
3. **Team and language** → Albania → Enrol. **Language pack** → Install Albanian (16 checks). Optionally install Spanish, German, Hindi or Thai (experimental packs, labelled as such).
4. **Orientation**: a short tutorial with real lookups.
5. Read: open any web page in Albanian (for example a public-domain text or the fixture page below), select a word and press **Alt+Shift+G** (or right-click → "Look up with GoLearn", or switch "GoLearn on for this tab" in the popup so selecting a word looks it up). The card shows lemma, meaning, grammar, form, context, confidence, and after a few lookups your own history line.
   - Fixture pages that need no site account: `http://localhost:5198/` serves nothing to read, so use the harness pages served by `node scripts\local\static-server.cjs packages\golearn-extension 5197` → `http://localhost:5197/harness/albanian-article.html` (Albanian article) and `http://localhost:5197/harness/sites/*.html` (the nine reader fixtures).
6. GoPractice: <http://localhost:5199/> → sign in with the same account → **GoReview** shows the candidates from your lookups with their reasons; start a session. **GoTell** → prompts → write, Analyse, Save.
7. Share screen (phone-style path): <http://localhost:5198/#/share> → paste text → pick a word → the card and the encounter.

## 4. What is honest to expect

- Albanian is the reference language (machine-drafted word list and rules, not native-reviewed). German, Hindi and Thai are experimental seed-only analysers; Spanish is minimal.
- No Albanian audio exists; listening items are not offered. "Pronounce" uses a device voice only when Brave has one for the language, and only as practice.
- Kindle, Kobo, readAwrite, MEB and Pratilipi pages are refused by the extension with a one-line reason (blocked, native-only, or terms to be reviewed). Kanah, Tolino, Casa del Libro, Libroteka, Play Books and the Bible sites are unverified on the live site; the extension will try the generic path and say what it could not read.
- Everything synchronises to the local service only; the data lives in `data\local-repository\repository.sqlite`. Export and delete are under GoPractice → Settings and the setup page → Privacy.

## 5. Rebuilding after code changes

`npm run local:build`, then in `brave://extensions` press the reload arrow on "GoLearn reader", and refresh the two local sites.

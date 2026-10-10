# Testing the Go ecosystem on this PC (Brave + local Repository)

Everything runs locally: the GoLearn extension loaded unpacked into Brave (it keeps your lookups, your reviews and your drafts on this
device, with no account), and, only if you want to try the account step, the Repository service with a SQLite file plus the hosted copies of
GoPractice and the setup page as static sites. Nothing is deployed and nothing leaves this machine.

The flow is: **choose a language → install its pack → read → practise.** An account is optional and comes last; it only keeps your
progress across devices. There are no teams and no seeding step.

## 1. Build (once per change)

```bash
cd C:\Users\CJWal\dev\go-v0
npm run local:build                                                   # extension (dist/), setup page (dist/app + dist-web/), hosted GoPractice (packages/gopractice/dist)
npx vite build -c packages/gopractice/vite.config.ts --mode extension # GoPractice as a page of the extension (dist/practice) — run it AFTER local:build
```

`npm run ext:build` (inside `local:build`) empties the extension's `dist/` except `dist/app/`, so `dist/practice/` has to be built after it, every time.

## 2. Load the extension into Brave (you do this part; it is a browser setting)

1. Open Brave and go to `brave://extensions`.
2. Switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose `C:\Users\CJWal\dev\go-v0\packages\golearn-extension\dist`.
4. Pin "GoLearn reader" from the puzzle-piece menu. The popup opens the setup page and has a **Practise** button.

If Brave Shields complains on a reading site, the extension still works: it keeps everything on this device.

## 3. First run, with no account

1. In the popup press **Open GoLearn setup**. **Welcome** → **Choose your language**: six cards (Norwegian, German, Albanian, Hindi, Thai, Spanish), each saying what works, what does not, how far its pack is built and what the audio is. Pick one:
   - Norwegian asks for the written standard, Bokmål or Nynorsk; nothing is preselected.
   - Spanish offers an optional regional preference (Honduras is one).
   - You can add another language later; the list at the top of the screen switches between them.
2. **Install the pack** (Albanian: 16 checks; the others are experimental packs, labelled as such).
3. **Orientation**: a short tutorial for that language with real lookups.
4. **Reader integration**: how to switch GoLearn on for a tab.
5. Read: open any web page in the language (for example a public-domain text, or the fixture pages below), select a word and press **Alt+Shift+G** (or right-click → "Look up with GoLearn", or switch "GoLearn on for this tab" in the popup so selecting a word looks it up). The card shows lemma, meaning, grammar, form, context, confidence, and after a few lookups your own history line.
   - Fixture pages that need no site account: `node scripts\local\static-server.cjs packages\golearn-extension 5197` → `http://localhost:5197/harness/albanian-article.html` (Albanian article) and `http://localhost:5197/harness/sites/*.html` (the nine reader fixtures).
6. Practise: press **Practise** in the popup (or on the setup page's **Status** screen). GoPractice opens as a page of the extension, with no sign-in: **GoReview** shows the candidates from your lookups with their reasons, and you can start a session; **GoTell** → prompts → write, Analyse, Save. The header says **On this device only**.
7. The status screen of the setup page also says **On this device only**.

## 3a. GoLearn Active (read the page before you)

1. In the popup switch on **GoLearn Active**. Brave asks once whether GoLearn may read the pages you visit; say yes (you can withdraw it in the same popup with **Withdraw page access**, or in Brave's extension settings).
2. The page in front gets it at once; any other page that is already open gets it when you reload it. From then on every page you open in the language is read on this device: the words you have met are underlined, dotted and faint for a word only met, dotted for one you understood with help, thin solid for one you recognise, a hairline for one you have produced (the legend is in the popup).
3. Click a word: its card opens with the full analysis, no selection needed. **Speak on click** plays the word when Brave has a voice for the language (none for Albanian).
4. With no lookups yet nothing is underlined: look a few words up first (or practise), then reload the page.
5. Readers that refuse (Kindle, Kobo, readAwrite, MEB, Pratilipi) are never read. A page whose language GoLearn cannot tell is not read either; a click there says so.
   - Harness page with a fixed learner model, no extension needed: `npx vite build -c packages/golearn-extension/vite.config.ts --mode content-harness`, then `node scripts\local\static-server.cjs packages\golearn-extension 5197` → `http://localhost:5197/harness/active.html` (the status line shows the words found, the marks per level and the scan time).

## 4. The account step (optional, only to try it)

An account keeps your progress across devices. Everything above works without it.

```bash
scripts\local\start.cmd    # three windows: service :8790, hosted GoPractice :5199, hosted setup page :5198
```

Check <http://127.0.0.1:8790/health> answers `{"ok":true,…}`. Stop everything with `scripts\local\stop.cmd`.

1. Setup page → **Keep your progress (optional)** (it is the last step; **Not now** skips it): keep the service address `http://127.0.0.1:8790`, create an account (any email, a password of at least 10 characters; it stays on this PC).
2. Creating the account uploads what is already on this device **once**, says how many events, and switches the status to **Synced to your account**. Your language is also enrolled on the account (no team). GoPractice (in the extension) offers the same step through **Keep your progress across devices (optional)** in its header.
3. Signing out returns to **On this device only** and removes nothing. **Privacy → Clear local data** (and GoPractice → Settings → Clear local data) is the explicit way to remove the device's data.
4. The hosted copies still exist: <http://localhost:5199/> (GoPractice) needs an account and says so (it points to the extension's copy, which does not); <http://localhost:5198/#/share> is the phone-style share path (paste text → pick a word → the card and the encounter).

## 5. What is honest to expect

- Albanian is the reference language (machine-drafted word list and rules, not native-reviewed). German, Hindi, Thai and the two Norwegian packs are experimental seed-only analysers; Spanish is minimal.
- No Albanian audio exists; listening items are not offered. "Pronounce" uses a device voice only when Brave has one for the language, and only as practice.
- Kindle, Kobo, readAwrite, MEB and Pratilipi pages are refused by the extension with a one-line reason (blocked, native-only, or terms to be reviewed). Kanah, Tolino, Casa del Libro, Libroteka, Play Books and the Bible sites are unverified on the live site; the extension will try the generic path and say what it could not read.
- Without an account the data lives in the extension's own storage on this PC. With one it also synchronises to the local service only (`data\local-repository\repository.sqlite`). Export and delete are under the setup page → Privacy and GoPractice → Settings.

## 6. Rebuilding after code changes

`npm run local:build`, then `npx vite build -c packages/gopractice/vite.config.ts --mode extension`, then in `brave://extensions` press the reload arrow on "GoLearn reader", and refresh the local pages.

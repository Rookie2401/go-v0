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

1. In the popup press **Open GoLearn setup**. On a first run it opens on **Sign in**: a clean page with an optional account form and a **Continue without an account** button (an account only keeps your progress across devices). Press **Continue without an account**; the app moves to **Choose your languages**.
2. The six languages (Norwegian, German, Albanian, Hindi, Thai, Spanish) are compact rows, each with its level and a **Download language** menu. Open the menu and press **Download …**:
   - Norwegian first asks for the written standard, Bokmål or Nynorsk; nothing is preselected.
   - Spanish offers General or Honduras (an optional regional preference).
   - Downloading installs the pack by itself, on the row: Albanian says "Albanian is ready: 16 checks passed" and the row shows **Downloaded · ready** (the others are experimental packs, labelled as such; all are machine-drafted, not native-reviewed). If a check fails the row says so and offers **Retry**.
   - Download more than one: they all stay enabled. **Reading now** marks the language GoLearn records against; **Use for reading** switches, **Remove** takes a language off this device. What works, what does not, the licences and the checks are under **Details** on each row.
3. The page then says what to do next: open a page in the language and switch on **GoLearn Active** in the extension popup. The cog wheel at the top right opens **Settings**: **Account** (sign-in is covered in section 4) and the advanced screens Sync, Privacy, Diagnostics and updates (which also holds the dictionary address) and **How GoLearn reads pages** (also a small link at the foot of the languages page). **Status** is in the top bar.
4. Read: open any web page in the language (for example a public-domain text, or the fixture pages below), select a word and press **Alt+Shift+G** (or right-click → "Look up with GoLearn", or switch "GoLearn on for this tab" in the popup so selecting a word looks it up). The card shows lemma, meaning, grammar, form, context, confidence, and after a few lookups your own history line.
   - Fixture pages that need no site account: `node scripts\local\static-server.cjs packages\golearn-extension 5197` → `http://localhost:5197/harness/albanian-article.html` (Albanian article) and `http://localhost:5197/harness/sites/*.html` (the nine reader fixtures).
5. Practise: press **Practise** in the popup (or on the setup page's **Status** screen, linked in the top bar). GoPractice opens as a page of the extension, with no sign-in: **GoReview** shows the candidates from your lookups with their reasons, and you can start a session; **GoTell** → prompts → write, Analyse, Save. The header says **On this device only**.
6. The status screen of the setup page also says **On this device only**.

## 3a. GoLearn Active (read the page before you)

1. In the popup switch on **GoLearn Active** (the one switch). Brave asks once whether GoLearn may read the pages you visit; say yes. Switching it off withdraws that access again.
2. The page in front gets it at once; any other page that is already open gets it when you reload it. From then on every page you open in the language is read on this device and every word gets an underline: dashed for a word you have not met yet, dotted and faint for one only met, dotted for one you understood with help, thin solid for one you recognise, a hairline for one you have produced (the legend is in the popup). The popup's "This page" line says how many words were read and marked per level, or why nothing was.
3. Click a word: its card opens with the full analysis, no selection needed; selecting a phrase looks it up too. The word is spoken when Brave has a voice for the language; the popup lists which of your languages have one on this device (none for Albanian anywhere).
4. On the card, "How well do you know it?" offers **New to me**, **I recognise it**, **I can use it**: your mark is recorded, the history line repeats it, and the word's underline changes at once and follows your mark until you mark it again. The words are matched against your history on this device only; nothing of the page is sent anywhere.
5. Readers that refuse (Kindle, Kobo, readAwrite, MEB, Pratilipi) are never read. A page whose language GoLearn cannot tell is not read either; the popup and a click there say so.
   - Harness page with a fixed learner model, no extension needed: `npx vite build -c packages/golearn-extension/vite.config.ts --mode content-harness`, then `node scripts\local\static-server.cjs packages\golearn-extension 5197` → `http://localhost:5197/harness/active.html` (the status line shows the words found, the marks per level and the scan time).

## 4. The account step (optional, only to try it)

An account keeps your progress across devices. Everything above works without it.

```bash
scripts\local\start.cmd    # three windows: service :8790, hosted GoPractice :5199, hosted setup page :5198
```

Check <http://127.0.0.1:8790/health> answers `{"ok":true,…}`. Stop everything with `scripts\local\stop.cmd`.

1. Setup page → cog → Account → **Sign in** (the first page of a first run is the same sign-in page; ignore it with **Continue without an account** to stay on this device; the service address is under the form): keep the service address `http://127.0.0.1:8790`, create an account (any email, a password of at least 10 characters; it stays on this PC).
2. Creating the account moves you to the languages page, which says who you are signed in as. It uploads what is already on this device **once**, says how many events, and switches the status to **Synced to your account**. Your language is also enrolled on the account (no team), and if the account already holds a language its pack is installed for you. GoPractice (in the extension) offers the same step through **Keep your progress across devices (optional)** in its header.
3. Signing out (cog → Account → Sign out of this device) returns to **On this device only** and removes nothing. **Privacy → Clear local data** (and GoPractice → Settings → Clear local data) is the explicit way to remove the device's data.
4. The hosted copies still exist: <http://localhost:5199/> (GoPractice) needs an account and says so (it points to the extension's copy, which does not); <http://localhost:5198/#/share> is the phone-style share path (paste text → pick a word → the card and the encounter).

## 5. What is honest to expect

- Albanian is the reference language (machine-drafted word list and rules, not native-reviewed). German, Hindi, Thai and the two Norwegian packs are experimental seed-only analysers; Spanish is minimal.
- No Albanian audio exists; listening items are not offered. "Pronounce" uses a device voice only when Brave has one for the language, and only as practice.
- Kindle, Kobo, readAwrite, MEB and Pratilipi pages are refused by the extension with a one-line reason (blocked, native-only, or terms to be reviewed). Kanah, Tolino, Casa del Libro, Libroteka, Play Books and the Bible sites are unverified on the live site; the extension will try the generic path and say what it could not read.
- Without an account the data lives in the extension's own storage on this PC. With one it also synchronises to the local service only (`data\local-repository\repository.sqlite`). Export and delete are under the setup page → Privacy and GoPractice → Settings.

## 6. Rebuilding after code changes

`npm run local:build`, then `npx vite build -c packages/gopractice/vite.config.ts --mode extension`, then in `brave://extensions` press the reload arrow on "GoLearn reader", and refresh the local pages.

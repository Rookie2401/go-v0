# Privacy Policy

> **DRAFT — for the owner's review and legal counsel; not in force.** Nothing below is a binding promise until the owner has adopted a final text. Bracketed items [like this] are blanks the owner must fill in or decide.

Drafted 2026-10-17. This policy covers GoLearn (the browser extension and its setup app), GoReview (the review and writing app), and the sync service they use if you create an account.

## The short version

- **Without an account, everything stays on your device.** Nothing is sent anywhere.
- **With an account**, your learning record is copied to a sync service so that it follows you between devices. That is the only reason an account exists.
- We keep **what you looked up, not what you read**. The text of the pages you read is never stored or sent.
- We do not sell or share your information, show advertising, or use third-party analytics or tracking.
- You can download everything we hold about you and delete your account at any time.

## Who is responsible

[OWNER NAME OR ENTITY — to be filled in] operates GoLearn, GoReview and the sync service (the "service"). Contact: [CONTACT EMAIL — to be filled in].

## What is kept on your device

Whether or not you have an account, the apps keep on your device:

- the words and phrases you looked up: the dictionary form, the language, the time, and the kind of lookup;
- for a lookup on a web page, only **hashes** of the sentence and of the page's address (so repeated meetings with a word can be recognised), never the sentence, the page title, the address or the page itself. A hash hides the address from someone reading the record; someone who already has an address could still test whether it matches. Keeping the sentence is a separate switch; it is off, and this version cannot turn it on;
- which reader you used: "an ordinary web page", or the name of a supported reading site (for example Kindle for Web);
- on a supported Bible site, **the Bible reference you were reading, in readable form**: the site, the translation, the book, chapter and verse, and the address of that passage, so that a word can be connected with the passage you met it in. What you read in the Bible can say something about your beliefs; it is not used for anything else;
- for a book in the local reader, its title and your position in the file; for a passage you share into GoLearn, the sending app, the title and the path of the link, never the rest of the link or the text;
- your language choices, installed language packs, settings and privacy switches;
- your reviews, preferences and any drafts you write;
- a random device identifier created the first time the app runs;
- if you are signed in, a sign-in token (never your password).

You can clear this under Privacy → Local data on this device.

## What the sync service keeps, if you create an account

- **Your email address**, used to sign you in, to confirm that it is yours, to reset a forgotten password and to tell you about the account (for example a scheduled deletion). We do not use it for marketing.
- **Your password**, stored only as a salted one-way hash (scrypt). We cannot read it.
- **Your learning record**: the lookup events described above, including the readable Bible references and book titles, your enrolments (which languages you study), knowledge estimates computed from your events, review results, preferences, and the consent choices you made.
- **Your private documents**, such as writing drafts, if you use the writing practice.
- **Reports you send about a word.** If you report that a word was analysed wrongly, the report (the word, what you say it should be, and your reason) stays in your learning record. Whoever reviews the word list reads it, counted with other reports and without your name, and decides whether to correct the word. Your report changes nothing for other learners. A correction a reviewer makes stays in the word list after you delete your account; it holds nothing about you.
- **Devices and sessions**: the device identifier and a label for each device or browser you sign in from, when it was created and when it was last used.
- **Security events** about the account, such as sign-ins, password changes and session revocations, shown to you under Settings.
- **Technical logs**: the service may record request metadata (time, address of the connecting network, route and result) for security and fault-finding. [Retention period — to be decided.]

## What we do not keep

The text of the pages or books you read, the sentences around your lookups, the titles and addresses of ordinary web pages, your contacts, your location, advertising identifiers, or recordings of your voice.

## What is shared

Nothing is shared for advertising or sold. The service depends on a few providers that necessarily handle data on our behalf:

- **Hosting provider.** The sync service and everything it keeps about you are held on Render, on a server in Oregon, USA.
- **App and dictionary hosting.** GoReview and the dictionary files are served from GitHub Pages, which sees the network address of the device fetching them.
- **Network provider.** [Owner to confirm whether the address repo.golearn-global-languages.com passes through Cloudflare or another provider, and delete this line if not.]
- **Email provider.** Confirmation and password-reset emails are sent through [EMAIL PROVIDER — to be filled in], which sees your address and the email.
- **Speech provider, only if you switch it on.** Remote speech is off by default. If you turn it on, the single word, phrase or sentence you ask to hear is sent, through the service or the speech backend you set up, to the text-to-speech provider (Microsoft Azure) to produce audio. Nothing else is sent. Switching it on is recorded as a consent event you can withdraw at any time.

## Dictionary content

The dictionaries in GoLearn's language packs come from several sources. Many are derived from **Wiktionary** (via kaikki.org) and are licensed **CC BY-SA 4.0**; the licence applies to that content, not to your own data or drafts. [The full list of sources and their attribution is still to be completed before this text is adopted.] Language packs are machine-drafted and have not been reviewed by native speakers; they can be wrong.

## Where the service runs

The sync service runs on Render, in Oregon, USA, and is reached at repo.golearn-global-languages.com and go-v0.onrender.com. If it moves, this policy will say where before the move. [International transfers — to be addressed by counsel if users outside that region are accepted.]

## How long we keep things

Until you delete them. Sessions expire after 30 days or sooner if you end them. When you delete your account there is a **14-day grace period** during which nothing is removed and you can cancel by signing in; after that the account and everything the service holds about you are erased. [Backups: how long erased data can remain in backups — to be decided.]

## Your rights

- **Access and portability:** Settings → Download my data gives you one JSON file with everything the service holds about you.
- **Deletion:** Settings → Delete my account, confirmed with your password, as described above.
- **Correction:** you can change your language choices and preferences in the apps. To change your email address, contact us. [Owner to decide whether an in-app change will be offered.]
- **Withdraw consent:** the privacy switches can be turned off at any time.
- **Complain:** you may complain to your local data-protection authority. [Counsel to name the relevant authority.]

## Security

Connections to the service use HTTPS. Passwords are stored hashed. Sessions are separate for each device and can be ended from Settings. No system is perfectly secure; if something goes wrong that affects you, we will tell you. [Breach-notification process — to be decided.]

## Children

GoLearn and GoReview are not directed at children under [13 / 16 — counsel to decide], and we do not knowingly create accounts for them. If you believe a child has made an account, contact us and we will delete it.

## Changes

If this policy changes in a way that matters, the apps will show the new version before it applies to you, and the date at the top will change.

## Contact

[CONTACT NAME AND EMAIL — to be filled in]

---

*Review notes for the owner (delete before publishing):* check that the statements about "no analytics" and "no advertising" are still true of every build; decide the retention of technical logs and backups; name the email provider; confirm whether Cloudflare is in the path; complete the dictionary attribution; decide with counsel whether readable Bible references need explicit consent as data about beliefs; set the minimum age; name the data-protection authority; have counsel review the whole text, including the legal bases that apply where users live.

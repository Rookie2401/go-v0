# Privacy Policy

> **DRAFT — for the owner's review and legal counsel; not in force.** Nothing below is a binding promise until the owner has adopted a final text. Bracketed items [like this] are blanks the owner must fill in or decide.

Drafted 2026-10-17. This policy covers GoLearn (the browser extension and its setup app), GoReview and GoPractice (the review and writing app), and the sync service they use if you create an account.

## The short version

- **Without an account, your learning history stays on your device.** Loading the hosted app or downloading dictionaries still makes network requests. Hosting and content providers receive the connection metadata needed to serve those requests. Optional remote speech is described below.
- **With an account**, your learning record is copied to a sync service so that it follows you between devices. That is the only reason an account exists.
- Ordinary page lookups and GoLearn Active keep **word encounters rather than copies of the pages you read**. If you explicitly enable and use remote speech, the text you ask to hear is sent to that service as described below. Writing drafts are a separate data category.
- We do not sell your information or use it for advertising. Service providers process the data needed for the functions described below. [Confirm the final release's analytics and provider settings before adopting this policy.]
- You can download everything we hold about you and delete your account at any time.

## Who is responsible

Christian Walker, operating GoLearn in Arizona, United States, operates GoLearn, GoReview and the sync service (the "service"). Contact: GoLearntech@outlook.com.

## What is kept on your device

Whether or not you have an account, the apps keep on your device:

- the words and phrases you looked up: the dictionary form, the language, the time, and the kind of lookup;
- for a lookup, only **hashes** of the sentence, the page title and the page path (so repeated meetings with a word can be recognised), never the sentence, title, path or page itself. Keeping the sentence is a separate switch; it is off, and this version cannot turn it on;
- your language choices, installed language packs, settings and privacy switches;
- your reviews, preferences and any drafts you write;
- a random device identifier created the first time the app runs;
- if you are signed in, a sign-in token (never your password).

You can clear this under Privacy → Local data on this device.

## What the sync service keeps, if you create an account

- **Your email address**, used to sign you in, to confirm that it is yours, to reset a forgotten password and to tell you about the account (for example a scheduled deletion). We do not use it for marketing.
- **Your password**, stored only as a salted one-way hash (scrypt). We cannot read it.
- **Your learning record**: the lookup events described above, your enrolments (which languages you study), knowledge estimates computed from your events, review results, preferences, and the consent choices you made.
- **Your private documents**, such as writing drafts, if you use the writing practice.
- **Devices and sessions**: the device identifier and a label for each device or browser you sign in from, when it was created and when it was last used.
- **Security events** about the account, such as sign-ins, password changes and session revocations, shown to you under Settings.
- **Technical logs**: the service may record request metadata (time, address of the connecting network, route and result) for security and fault-finding. [Retention period — to be decided.]

## What we do not keep

Ordinary page lookup and Active scanning do not retain copies of the pages or books you read or the surrounding sentences. They do not collect your contacts, precise location, advertising identifiers or recordings of your voice. Source hashes and learning events are described above; they must not be described as anonymous merely because they are hashed. Optional remote speech sends the requested text, and account-backed writing practice can store your drafts.

## What is shared

Nothing is shared for advertising or sold. The service depends on a few providers that necessarily handle data on our behalf:

- **Hosting and network providers.** The sync service runs on Render in Oregon, United States. Its canonical address is `repo.golearn-global-languages.com`; `go-v0.onrender.com` reaches the same service. Cloudflare supplies DNS for the canonical address. The former tunnel to the owner's computer is no longer the service's hosting path.
- **Email provider.** Confirmation and password-reset emails are sent through Resend, which handles the recipient address and email content to deliver them.
- **Speech provider, only if you switch it on.** Remote speech is off by default. If you turn it on, the single word, phrase or sentence you ask to hear is sent, through the speech backend you set up, to the text-to-speech provider (Microsoft Azure) to produce audio. Nothing else is sent. Switching it on is recorded as a consent event you can withdraw at any time.

## Dictionary content

The dictionaries in GoLearn's language packs are derived from **Wiktionary** (via kaikki.org) and are licensed **CC BY-SA 4.0**. They are shown with their attribution, and the licence applies to that content, not to your own data or drafts. Language packs are machine-drafted and have not been reviewed by native speakers; they can be wrong.

## Where the service runs

The sync service runs on Render in Oregon, United States. The operator is based in Arizona, United States. [International transfers and supported distribution regions remain to be finalized before public release.]

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

The proposed 4+ designation concerns content suitability; it is not a minimum account age or a claim that the service has a separate child-account system. The owner does not want additional reading restrictions beyond the content permitted by the user's browser. Content suitability and browser controls do not establish authorization for account data collection or cloud processing. The release's audience, account eligibility, actual data practices and any applicable parent/guardian notice or consent requirements remain to be resolved before this draft is adopted. Contact GoLearntech@outlook.com about privacy or account data.

## Changes

If this policy changes in a way that matters, the apps will show the new version before it applies to you, and the date at the top will change.

## Contact

Christian Walker, GoLearn — GoLearntech@outlook.com. Arizona, United States.

---

*Review notes for the owner (delete before publishing):* check that the statements about "no analytics" and "no advertising" are still true of every build; decide the retention of technical logs and backups; name the email provider; confirm the final hosting arrangement; set the minimum age; name the data-protection authority; have counsel review the whole text, including the legal bases that apply where users live.

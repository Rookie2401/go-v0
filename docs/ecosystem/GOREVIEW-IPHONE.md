# GoReview on the iPhone

GoReview is the review half of GoPractice: your words, your current deck, your saved decks, spaced review. This is the build
that lives on the phone as its own app. It still gets everything it shows from GoLearn, through the same Repository service
and the same account, and while it is open it hears about new lookups within seconds.

## What the "dev app" is

A **Progressive Web App**, not a store app. The same static site as GoPractice, built in a third mode:

```
npx vite build -c packages/gopractice/vite.config.ts --mode review      ->  packages/gopractice/dist-review/
```

It adds, to the ordinary build: a web manifest ("GoReview", standalone, portrait, starts at `#/review`), icons (an SVG, a 180 px
apple-touch-icon, 192/512 px and a maskable 512), the iOS meta tags (home-screen app, translucent status bar, `viewport-fit=cover`),
safe-area padding for the notch and the home indicator, 44 px touch targets, a **service worker** (the app shell works offline) and
a quiet "Update ready — reload" link. The hosted GoPractice and the GoLearn-extension builds are unchanged and carry none of it
(no manifest, no worker, no registration; an extension page must not register one).

No Mac, no Xcode, no App Store: you host the folder over HTTPS and "Add to Home Screen" from Safari, as with the Western Canon
app (`summa-app/DEPLOY-IPHONE.md`).

Build options (environment variables):

| variable | effect |
| --- | --- |
| `GOPRACTICE_DICT=hi` (comma list: `sq,es,de,hi,th`) | which dictionaries are copied in. The default is all five and the folder is about **880 MB** (de 440, es 296, hi 94, sq 35, th 20): too big for comfort on GitHub Pages (1 GB site limit) and slow to drag to Netlify. Ship only the language(s) you study on the phone, e.g. `GOPRACTICE_DICT=sq,hi`. The exercises read glosses from the dictionary shard by shard. |
| `GOPRACTICE_OUT=<folder>` | build somewhere other than `dist-review/`. |

## Hosting `dist-review/` over HTTPS

iOS only installs a service worker, and only gives a home-screen app its own storage, over **HTTPS**. Two ways, both free:

**Netlify Drop** (a minute, no account needed to publish): open <https://app.netlify.com/drop>, drag the `dist-review` folder (or its
zip) onto the page, wait for the `https://….netlify.app` address. Claim the site with a free account if you want to keep the address and
update it later by dragging a fresh folder onto the same site.

**GitHub Pages**: push the contents of `dist-review/` to a `gh-pages` branch of a repository (an orphan branch holding only the
built files), then Settings -> Pages -> that branch. The app works from a sub-path (`https://<you>.github.io/goreview/`): every
URL in it is relative and the routes are hash routes. Keep the site under the 1 GB limit (see `GOPRACTICE_DICT`).

To publish an update, build again and put the new folder up the same way. Phones that have the app pick the new build up the
next time they open it (see "Updates").

## The service requirement

The app has no data of its own to show: everything comes from your Repository service, over HTTPS, with your account. That service
has to be **reachable from the phone**:

- `http://127.0.0.1:8790` (the address in `config.json`, and what a local run uses) is the computer itself. From a phone it
  does not exist, and a plain `http://` address to any other machine is refused by the app (your password would travel in clear).
- To use it from the phone you need the service on an HTTPS address. Options:
  1. **The Harbor / VPS deploy** you planned (a Linux VPS with a domain, Postgres or the service's SQLite file on disk, TLS in
     front): the proper, always-on answer, and the one where the phone keeps hearing from the desktop while the laptop is closed.
  2. **A development tunnel** to the service running on the laptop (a Cloudflare quick tunnel, `ngrok http 8790`, Tailscale Funnel,
     or similar): an `https://….` address that forwards to `127.0.0.1:8790`. Fine for trying it; the address changes with some tunnels
     and it only works while the laptop and the tunnel are running.
- Tell the app the address one of two ways: put it in `dist-review/config.json` (`"serviceUrl": "https://repository.example.org"`)
  before you host the folder, or type it under "Service address" on the sign-in page of the phone (it is remembered on the phone).
  The service must allow the app's origin (CORS) for the `Authorization` header.
- **No secrets in the repository or in `config.json`.** The service address is public information; a password and a token are
  typed on the phone and live only in that phone's storage. Do not paste tokens, keys or passwords into any file of this repo.

## Add it to the Home Screen

1. On the iPhone open the HTTPS address in **Safari** (it has to be Safari: that is where "Add to Home Screen" installs a web app).
2. Share button -> **Add to Home Screen** -> Add. A "G" icon appears.
3. Open it from the icon, full screen with no Safari bar. First launch asks you to sign in: "GoReview shows what you read with
   GoLearn on the same account." Use the account you use in GoLearn (the phone has no extension, so sign-in is required).
4. Open it once with a network connection so the shell is cached; after that it launches offline.

## What "live" means on iOS

While GoReview is **on screen, online and signed in**, it keeps one request open to the service (`POST /sync/wait`, up to 25 s).
When GoLearn on the desktop pushes a lookup the request answers at once; the app does its normal sync (pull), and the screen you are
on repaints: the home's counts and deck, My vocab, Saved decks, the session summary. The cached profile (your languages) is
dropped, so a language you add in GoLearn shows up too.

- It is **foreground only**. iOS suspends a web app in the background; nothing can arrive then, and without a native app there is no
  background push. The loop stops when the page is hidden (the held request is cancelled) and **restarts when you come back**
  (visibilitychange, `pageshow`, or the network returning) with a fresh catch-up, so what happened while it was away is there in a moment.
- Errors back off 1 s, 2 s, 4 s ... up to 30 s. A service that does not know `/sync/wait` (an older one) makes the app fall back to a
  pull every 60 s. A 60 s pull also runs alongside the live request as a safety net.
- A card you are in the middle of answering is never touched by an update: the box, the text and the choice stay as they are, and a
  summary already on screen is simply drawn again.

## What stays on the phone, offline

The learner's events (their own log, per account), the queue of events waiting to be sent, the saved decks, the preferences, the cached
profile and candidate list, and the **snapshot** of what only the service can compute: My vocab (merged, one line per word, up to 6000
words) and the intake proposals that fill the deck. With no network the home, My vocab and Saved decks come from those; My vocab
says it is showing what the phone saved, and when. Reviews done offline stay in the queue ("Offline · N waiting on this device") and go
out by themselves when the network returns. All of this is in the app's own storage on the phone, per account; signing out with
"forget" or clearing the device's data removes it; another account never sees it.

The service worker keeps the app shell (page, script, styles, fonts, manifest, icons, `config.json`). Dictionary shards are fetched
on first use and kept (at most 400 files, none over 3 MB). **Nothing from the Repository service is ever cached by the worker.**

## Updates

Build, host the new folder. The worker installs the new version beside the old one and **waits**; the app shows a quiet
"Update ready — reload" in the header. Tap it and the phone switches to the new build at once. (It also checks for a new build each
time the app returns to the foreground.)

## How to check it works

1. Phone: open GoReview from the icon, sign in, look at the home ("N cards ready", "My vocab N words").
2. Desktop: read something with GoLearn and look a word up (the same account, the service reachable by both).
3. Phone, still open: the counts change **within a few seconds**, and the word is in My vocab, with no reload.
4. Put the phone in airplane mode: the home, My vocab and Saved decks still show; do a review; the header says
   "Offline · 1 waiting on this device". Switch airplane mode off: it says "Online · nothing waiting" and the desktop sees the review.
5. Lock the phone for a minute, unlock: it catches up on its own.

## Limits

- Foreground only (above). Locking the phone or switching apps pauses live updates until you return.
- iOS may evict the storage of a web app that was never added to the Home Screen after about a week unused; an installed app is exempt.
  Anything not yet sent when that happens is lost, so open the app and let it sync now and then.
- Needs an HTTPS Repository service the phone can reach (a tunnel only while the laptop is on).
- Speech: device voices and pronunciation checking depend on what iOS Safari offers a web app; listening items without a voice are
  asked in writing, as in the desktop app.
- The status bar of a home-screen app is translucent with light text; the app puts a band of ink behind the clock in the light theme so
  it stays legible. If it looks wrong on your phone, change `apple-mobile-web-app-status-bar-style` in `vite.config.ts`.
- The sign-in password is sent to the service address and nowhere else; nothing is sent to any third party.

## Live address (2026-10-17)

The Repository service is reachable at https://repo.golearn-global-languages.com through a named Cloudflare tunnel from the
owner's PC (infra/cloudflare/README.md: tunnel goreview-repository, zone golearn-global-languages.com). Build the installable
edition against it with GOPRACTICE_SERVICE_URL=https://repo.golearn-global-languages.com (the copied config.json gets that
serviceUrl; the source config.json keeps the local address), and use the same address as REPOSITORY_SERVICE_URL for the
next TestFlight build. The PC must still be on and online; the tunnel is not yet installed as a Windows service.

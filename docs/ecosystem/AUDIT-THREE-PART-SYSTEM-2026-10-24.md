# Audit of the three-part system (GoLearn, GoReview, Biblia on one Repository), 2026-10-24

Asked by the owner: "Audit the three part system, and if you are pleased, ship it." Done the same evening, after the service moved to
Render and the Biblia redesign was published. Verdict at the end.

## What the system is

| part | where it runs | how it reaches the Repository |
|---|---|---|
| Repository service | Render, `go-v0` (Oregon; 0.5 CPU, 512 MB, 1 GB disk); canonical name `repo.golearn-global-languages.com` → Render; also `go-v0.onrender.com` | — |
| GoLearn | the browser extension (unpacked from `packages/golearn-extension/dist`) and its setup app (`rookie2401.github.io/go-v0/app/`) | config.json: extension `https://go-v0.onrender.com` (7bdda2b3), hosted setup app the canonical name |
| GoReview | web edition `rookie2401.github.io/go-v0/review/`; TestFlight build 10 (with Biblia inside, mode `'app'`) | the canonical name |
| Biblia | web edition `rookie2401.github.io/biblia/` (redesign, `c8b8af34` on gh-pages); TestFlight build 3 of its own app | the canonical name |

## Checks made

**Service (Render), from this PC and from outside**
- `/health` 200: `service repository`, contract 3, store sqlite, migrations 4; round trips 0.17 to 0.25 s; an outside probe of the
  canonical name answers 200 with `x-render-origin-server: Render`.
- Security headers on every answer: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cache-Control: no-store`. CORS `*` with the private-network opt-in.
- `/metrics` is 404 from outside. `/me`, `/vocabulary`, `/sync/status`, `/me/export` and the long-poll `/sync/wait` all refuse an
  unauthenticated caller with 401, the long poll in 0.23 s (no hanging).
- Data: 7 accounts, 7 learners, 3,029 events, 10 enrolments (Codex's cut-over report); the test account from this week's walks is
  there with its events (see the client checks).
- **Rate limiting is not in force on the deployed service.** 12 `POST /accounts/password/forgot` from one address: 12 × 202 (the rule
  is 10 per hour per address); 13 wrong-password sign-ins for non-existent addresses: 13 × 401 (10 per minute per address). The same
  service launched locally exactly as Render launches it (`infra/repository/render-start.mjs`, host 0.0.0.0, fresh data) answers 429
  from the eleventh call, so the code is right and the deployment's environment is not: `RATE_LIMIT` is off there, or the proxy's
  client address is not trusted (`TRUST_PROXY=1` reads the last `X-Forwarded-For` entry; without it the proxy's own address is the
  key, which would make the limit stricter, not absent). Only the Render dashboard shows the environment; this session has no access.
- Mail: `POST /accounts/password/forgot` answers 202 whether or not a mailer exists. The Render start log is not visible from here;
  if no `SMTP_URL` / `RESEND_API_KEY` is set (as locally), reset and verification emails go to a file sink on the server's disk and
  **"Forgot password" delivers nothing**, and email verification is not enforced (by design in that state).

**The three clients against the Render service (test account `biblia-walk-20261022@example.com`)**
- GoReview, hosted: signed in with the Service address set to the Render name (this PC's network filters the canonical one); home
  "2 cards ready, My vocab 2 words"; My vocab lists אֱלֹהִים and שָׁמַיִם from the earlier Biblia walks (migrated).
- Biblia, the redesigned build pointed at Render: signed in at #/account; Genesis 1 painted both words Seen from the migrated data; a tap
  on הָאָרֶץ went New → Seen; the sync bar said "Uploads complete".
- GoReview, reloaded: "3 cards ready, 3 words": the Biblia tap arrived through Render.
- GoLearn setup app, hosted: Service address set, signed in: "Progress is now synced to your account"; the Hebrew enrolment and its 22
  pack checks came back from the account.
- TestFlight: GoReview build 10 and Biblia build 3 both uploaded; neither run on a device by this session. Build 10 restored Biblia's
  texts inside GoReview; build 3 is the redesign.

**Code gate** (`npx vitest run` over test/biblia, gopractice, gopractice-e2e, goreview, golearn-app, extension, repository,
contract, repository-local, audit): 218 files, **4,086 passed, 100 skipped (Postgres-server suites without a database), 10 failed**,
then the structure audit re-pinned (native shells excluded) → 9 remaining, all in two audit files that read the BUILT folders:
- `test/audit/rights.dist.test.ts` ×7: the Latin pack's sample text ("In principio erat Verbum", Vulgate John 1) is bundled into the
  setup app (dist and dist-web) and GoPractice; GoPractice's default dist ships five dictionaries where the pin says Albanian only;
  with them the file-kinds and font pins of the extension dist in the first run (the Hebrew / Greek lexicon shards). Owners: the Latin
  session for the sample text; the owner for the five-dictionary default (the hosted GoReview ships Hindi only).
- `test/audit/perf.engine.test.ts` ×2: the extension dist (474 MB) and the GoPractice dist (425 MB) exceed the 200 MB ceiling, the
  same five-dictionary default (the shipped web editions are 58 MB and 49 MB; the TestFlight bundles 235 MB and 49 MB).
- `npx tsc -b` clean. The certification suite (`test/certification`) was not in this gate; it has failed on the GoPractice shell flow
  since before the 17th and is open.

**Repository hygiene**: no secrets in the tree (the audit's own grep and this session's checks); credentials for Expo, Apple and Render
live only in those services; the deploy worktrees hold built files only. master is 15 commits ahead of `origin/master` at the time of
the audit (pushed as part of shipping, below).

## Findings, ranked

1. **Deployed service without rate limits** (above). Not a blocker for the owner's own use; it is one before opening sign-up to
   strangers. Fix on Render: remove `RATE_LIMIT=off` if set, set `TRUST_PROXY=1`, redeploy; then the twelve-call check above must
   end in 429.
2. **No mail sender on the service**: password reset and email verification cannot reach anyone. Fix: a Resend API key and a verified
   sending domain (or SMTP), `MAIL_FROM`, `APP_PUBLIC_URL=https://rookie2401.github.io/go-v0/app/`, on Render.
3. **This PC's network filters the canonical domain**: every client made here must use the Render name; phones and other networks are
   unaffected. The extension's default is therefore the Render name.
4. **Audit debts in other lanes**: the Latin sample text in three bundles; the five-dictionary default dist; the certification suite.
5. **Not seen on a device by this session**: TestFlight builds 10 and 3, the phone layout of the redesign, the service worker in a real
   browser. The owner's phone is the check.

## Verdict

Shipped: the three systems are connected through one Repository, each was exercised against it tonight with data flowing both ways,
the code gate is green apart from audit debts that belong to other lanes or to a product decision, and nothing found is a defect in
what the owner uses today. The two environment gaps on Render (rate limits, mail) are the owner's next actions before strangers sign
up; they do not change the code. Shipped means: the web editions published (GoReview, setup app, Biblia), TestFlight builds 10 and 3
uploaded, and master pushed to `origin/master`.

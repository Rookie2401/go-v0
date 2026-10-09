# Rights and platform permissions matrix (reader integration)

Status: 2026-10-09. Prompt 2, platform-research lane. Extends `../RIGHTS-AND-CONTENT-FLOW-BOUNDARIES.md` (which
defines what the product reads and keeps) by asking, platform by platform, whether the platform's own terms or the
data owner's rights permit each of those flows. Evidence and quotations: `PLATFORM-RESEARCH.md` (same folder). Not
legal advice; every "counsel" item is for a person qualified in the relevant jurisdictions.

## 0. How to read this document

- **Technical status** and **legal status** are separate columns and never inferred from each other. Technical
  status is left "to be measured" for the coordinator's browser work; where the coordinator has already looked, the
  cell adds "probed:" with what was reported. **No cell is, or may be, marked "verified".**
- **Legal status** uses exactly: Unverified / Permission required / Blocked / Unsupported.
  - *Unverified*: nothing read forbids it, nothing read permits it, or the key terms could not be read.
  - *Permission required*: a clause or a rights reservation covers a step of the feature, so a written yes comes first.
  - *Blocked*: an operator measure or a measurement stops the feature as designed.
  - *Unsupported*: there is no reading surface of the needed kind.
- Cell vocabulary for the four "what is permitted" columns: **Not addressed** (the terms read do not mention it; that
  is not a permission), **Barred on its face** (a clause says so in terms), **Permission required**, **Unresolved**
  (clauses nearby could be read either way; counsel), **Unread** (the terms could not be read).
- The four interaction models (from `RIGHTS-AND-CONTENT-FLOW-BOUNDARIES.md` section 1 and 2):
  1. *Single-selection lookup*: the learner selects, the page text is read in memory, the card is shown, nothing leaves
     the device (in-browser deterministic analysis).
  2. *Snippet retention*: one consented sentence per encounter kept for review. (The prototype keeps only the sentence
     hash and ids; a sentence hash is addressed in section 3.)
  3. *Remote AI*: the selection or its sentence sent to a remote model.
  4. *Extension distribution*: an extension in a store, described as working on, or targeting, the site.
- Dates are the dates the page was read by this lane (all 2026-10-09 unless stated). Clause wording came through a
  summarising fetch tool and needs a verbatim re-check; quotes are at most 15 words per page except Pratilipi, where
  the brief allows 15 per clause.

## 1. Matrix

| platform | technical status | legal status | terms URL and date read | single-selection lookup | snippet retention | remote AI | extension distribution | fallback |
|---|---|---|---|---|---|---|---|---|
| Google Play Books | to be measured (probed: reader needs a Google account; rendering frame reported cross-origin, annex) | Unverified | `play.google.com/about/play-terms/` (dated 2026-07-29, update effective 2026-11-05); `policies.google.com/terms` (effective 2026-07-30); both read 2026-10-09 | Not addressed (no clause on user-side extensions; "circumvent, disable or defeat" and no-modification clauses are the nearest) | Not addressed for lookup data; publisher copy limits apply to Google's own copy and notes export | Unresolved (Google ToS bars using AI-generated content from services to develop ML models; sending a sentence to an AI is not named) | Unresolved (no store-listing rule found; Google automated-means bar is tied to robots instructions) | Authorised local EPUB (owner upload, DRM-free); browser reading; Google's own Define / Translate |
| Kobo | to be measured (probed: `read.kobo.com` redirects to the apps page without a session) | Unverified | `authorize.kobo.com/terms/termsofuse` and `kobo.com/termsofsales`: **403, unread** on 2026-10-09; annex has search excerpts only (2026-10-08) | Unread | Unread (Terms of Sale excerpt restricts reproduction, unverified) | Unread | Unread | Authorised local EPUB; browser reading after the ToU is read |
| Amazon Kindle for Web | to be measured (measured by lead 2026-10-08: page is a bitmap, `getSelection()` empty) | Blocked (page text); share bridge Unverified | Kindle Store Terms (updated 2026-06-30) and Conditions of Use (updated 2026-08-14), read 2026-10-09 through `digprjsurvey.amazon.com/csad/help/node/201014950` and `.../GLSBYFE9MGKKQXXM` (canonical pages returned 503) | Not addressed for a selection; page text is not reachable anyway; Conditions of Use bar "data mining, robots, or similar data gathering and extraction tools" | Barred in effect for Kindle text (nothing readable); Copy is publisher-limited | Barred for page text (not readable); AI clause in Conditions of Use bars using AI-generated content to develop models | Permission required before any claim of Kindle support (DRM clause: "circumvent any digital rights management system") | Share bridge: the learner copies or pastes what Kindle's own Copy / Notebook yields; no page reading; no OCR (charter) |
| Libroteka | to be measured (no buyer browser reader found; files are PDF / ePUB downloads) | Unsupported (browser); authorised-EPUB route Unverified | `libroteka.al/sq/kushtet-e-perdorimit` (last updated 2023-01-17); privacy `libroteka.al/sq/politikat-e-privatesise` (2021-12-09); read 2026-10-09 | Not addressed (personal use only; licence excludes download, copy, reproduce, resell: tool translation) | Unresolved (reproduction excluded by the licence) | Not addressed | Not addressed | Authorised local EPUB if the bought file is DRM-free (not established); share bridge |
| Kanah | to be measured (probed: reader in a same-origin iframe with plain paragraphs) | Unverified | `kanah.app/terms/terms-of-service` (no date), `kanah.app/terms/privacy-policy`; read 2026-10-09 | Not addressed (no clause on readers copying or on automation found) | Not addressed | Not addressed | Not addressed; no publisher or partner programme described | Browser reading (pending probe); share bridge; authorised local EPUB not applicable |
| Tolino webreader | to be measured (probed: country dialog, then sign-in) | Unverified | tolino webreader / cloud / app terms **not located**; `mytolino.de/rechtliches/` and `mytolino.com/legal/` are device-document indexes (2026-10-09) | Unread | Unread | Unread | Unread | Authorised local EPUB (the owner can upload to the tolino cloud); browser reading |
| Thalia | to be measured | Unverified | AGB `thalia.de/hilfe/rechtliches/agb`: **403**; content known only from a search summary (2026-10-09) | Unresolved (AGB: licence for personal use; no copies for third parties) | Unresolved (copies only to the buyer's own devices) | Unresolved (AGB bars circumventing the limit on its DeepL translation feature, an indication of how machine processing of page text is viewed) | Unread | Via the tolino webreader or the Thalia app; Adobe DRM titles are not for the extension |
| Casa del Libro | to be measured (probed: the reader gates on the Condiciones de uso; web reader `ebooks.casadellibro.com/web/#/books`) | Permission required | Condiciones de uso `casadellibro.com/ayuda/condicionesUso` (undated; footer `v.5.8.26`); Condiciones de contratacion `.../ayuda/condicionesContratacion` (undated, last 16 000 characters unread); both translated by the tool, 2026-10-09 | Unresolved (sales terms: personal use only, no copies, no circumvention; TDM reservation in the site terms) | Barred on its face for copies; TDM reservation | Barred on its face for AI training ("Contents may not be used to train any Artificial Intelligence System", translation); sending a sentence to a model: Permission required | Permission required; robots.txt names AI crawlers explicitly | Browser reading as the retailer provides it; Adobe or Vivlio authorised local EPUB is not available for protected files |
| readAwrite | to be measured (probed: selection blocked by CSS `user-select: none`, context menu disabled on story spans) | Blocked (selection of story text); terms unread | `readawrite.com/?action=term_of_use`: body did not load in three fetches (headings only); cookie policy dated 2020-05-27, read 2026-10-09 | Blocked technically by the operator; terms unread | Unread | Unread | Unread; do not build site-specific code that re-enables selection | Share bridge (learner types or pastes); the app; none for in-page selection |
| MEB | to be measured (probed: no browser reader; installed apps) | Unsupported (browser) | `mebmarket.com/?action=term_of_use` (undated; Thai, tool summary, 2026-10-09) | Not addressed (reading only through the company's apps: clause 2.1, translation) | Barred on its face (clause 1: no copying or reproducing content for gain, translation); personal use only (4.2) | Not addressed | Not addressed; apps-only clause suggests a browser adapter has no surface | Share bridge from the app (undocumented); none for browser |
| Pratilipi (Hindi) | to be measured (probed: read pages fully selectable, plain `<p>` in `.book-content`, `html lang=hi`) | Permission required | `hindi.pratilipi.com/terms-of-service` and `english.pratilipi.com/terms-of-service`, last updated 2026-09-15, read 2026-10-09 | Unresolved (see section 3 below) | Permission required (clauses 5 and 15) | Permission required (clauses 5 and 15) | Permission required (clauses 12 and 16) | Browser reading of unlocked chapters; share bridge; the app for locked chapters (no page access) |
| BibleGateway | to be measured | Permission required (retention, AI, distribution) | Site Terms of Use `biblegateway.com/legal/terms/` (last updated 2025-06-04); Widget terms `/legal/widget-terms/` (undated); read 2026-10-09 | Unresolved (copying list barred except where permitted; quotation allowance with limits; automated-systems bar is aimed at data collection) | Permission required beyond the quotation allowance; per-version copyright | Not addressed in the terms; per-version copyright holders decide | Not addressed; `robots.txt` crawl-delay 15 | Public-domain versions on the page; an API.Bible licence for others |
| YouVersion / bible.com | to be measured | Permission required | `bible.com/terms` ("Last Modified on April 2, 2020"); Platform terms **not read** (script-rendered); read 2026-10-09 | Unresolved ("use any robot, spider, or other automatic device" is the automation bar; personal and non-commercial use) | Permission required; the copyright FAQ says full republishing is not allowed | Not addressed in the terms read; Platform clauses unread | Permission required: the Platform path needs an app key and is non-commercial | The YouVersion Platform route (registered app, per-publisher opt-in); public verse pages for personal reading |
| API.Bible (route for the two above) | n/a (API) | Permission required | `api.bible/terms-and-conditions` (Terms of Service dated 2026-09-03; Acceptable Use 2026-02-25); `care.api.bible/article/405-express-licensing-faqs` ("Last updated on October 1, 2026"); read 2026-10-09 | Display with attribution permitted under a licence (per version) | Caching allowed with a 30-day refresh; storing is licence-bound | Barred on its face for copyrighted text ("Sending copyrighted text to LLMs as prompt context"); public-domain text allowed for runtime prompts | Not addressed except per-version limits (NKJV non-commercial under 5,000 monthly users) | A licensed API plan; public-domain versions only for AI |

## 2. Notes on individual rows

- **Google Play Books.** The Google Terms bar "using automated means to access content" only in the way the page
  ties it to machine-readable instructions such as robots files (tool summary); a gesture-triggered content script is
  not obviously "automated means", but the point is for counsel. Uploaded personal EPUB / PDF files are the
  lawful test material and the likely lawful fallback; purchased titles are not to be used until the review.
- **Kobo.** The only route to the Terms of Use found is the signed-in session; the previous lane and this lane both
  got 403. Until a person reads it, no cell may say anything stronger than Unread.
- **Kindle.** Status carried over from the lead's measurements; this lane adds only the re-read dates. The AI clause
  in the Conditions of Use concerns AI-generated content from Amazon's services and is not a statement on user
  selections.
- **Libroteka.** The licence text excludes downloading, which sits oddly beside a business that delivers downloads;
  counsel should read the Albanian original. No clause on DRM, bots or AI was found.
- **Kanah.** The terms are mostly about uploads and sales; their silence on readers is not a permission.
- **Tolino / Thalia.** The webreader is operated by the tolino alliance; the retailer's AGB govern the purchase. The
  tolino app help says some titles refuse translation because publishers must grant permission, a sign that
  publishers control machine processing of text in at least that feature.
- **Casa del Libro.** The strongest explicit reservation on the list; the site's robots file names AI crawlers
  individually. The previous probe note says the reader gates on the Condiciones de uso page, so a signed-in
  reader session is within those terms.
- **readAwrite.** The CSS block is a deliberate operator measure. This lane reads it as a technical block and as
  evidence of intent, not as a legal conclusion; code that overrides it must not be written without permission.
  The terms body must be read in the browser. The same company's MEB terms are a separate document.
- **MEB.** "Read only through apps on operating systems the company has provided" (clause 2.1, translation) reads as
  designed exclusion of browser readers; the clause is not a statement on a user-side tool.
- **BibleGateway, bible.com.** Public-domain versions (for example Luther 1545 or Reina-Valera Antigua) change the
  copyright analysis but not the site terms; which versions are public domain was not checked in this lane.
- **API.Bible.** The only source on the list that states in terms what may be sent to an LLM: public domain yes,
  copyrighted no.

## 3. Pratilipi: exact clauses and which models need explicit permission

Source: `hindi.pratilipi.com/terms-of-service` (also the English page), "Last updated on 15th September, 2026", read
2026-10-09. Quotes are as returned by the fetch tool, each at most 15 words; **verify verbatim**.

| topic | clause | quote | reading |
|---|---|---|---|
| reproduction | 5 (User Obligations, "Reproduction") | "To not reproduce any Content from the Website/Application" | no republishing of Content elsewhere without written permission |
| automated access | 12 ("Security") | "Not use any manual or automated software" | in a list covering crawling or spidering, bots, automation, probing, circumvention of navigation |
| third-party software | 12 | "any unauthorized third-party software to modify or interfere with the Services" | extensions are not named; this is the nearest wording |
| scraping | 15 ("No Artificial Intelligence (AI) Scraping or Training") | "crawl, scrape, extract, copy, reproduce, download, aggregate, index, store" | binds "Users and third parties"; carve-out only by "the Company's prior written consent" |
| AI / ML use | 15 | "for the purpose of developing, training, pre-training, fine-tuning" | also testing, benchmarking, evaluating, improving AI, LLM, generative or dataset systems |
| personal-use scope | 16 ("Access") | "To access and use the Services solely for the User's personal and non-commercial purposes" | commercial use is outside the licence |

| our interaction model | clauses it touches | needs explicit permission? |
|---|---|---|
| In-browser deterministic analysis of a user selection | 12 (third-party software), 5 (reproduction) only by analogy; nothing leaves the device | **Not named by any clause; a site-targeted adapter or support claim needs explicit permission; a generic tool the user runs on any page is a counsel item.** |
| Retaining a sentence hash | 15 ("store"), tied to AI purposes | **Not named; a one-way hash reproduces nothing; counsel to confirm before it is kept for Pratilipi.** |
| Retaining a snippet | 5, 15 | **Yes: explicit written permission.** |
| Remote AI analysis of the selection or its sentence | 5, 15 | **Yes: explicit written permission**, with a no-retention, no-training undertaking from the AI provider. |
| Commercial distribution of an extension that targets the site | 12, 16 | **Yes: explicit written permission** before distribution or marketing. |

Other facts that bear on the request: no AI-crawler directive in `robots.txt`, and `/read/`, `/read?*`, `/reader/`,
`/reader?*` are disallowed for crawlers; chapters on the one series page opened were locked behind the app (all but a
trailer); permission contacts on the terms page are `hindi@pratilipi.com` and `contact@pratilipi.com`, neither named
for licensing; the Company can restrict or terminate access at its discretion.

## 4. What no platform has said (search 2026-10-09)

No platform on the list states a position on a user-side lookup tool reading a selection in the user's own browser
session. No platform page read describes a share or deep-link mechanism for sending a selected word out of its
reader to another app on Android or iOS; none was assumed. The previous lane's note stands: the closest to a
permission is silence.

## 5. Facts not established (rights-relevant)

- Kobo Terms of Use and Terms of Sale; Thalia AGB (verbatim); tolino webreader, cloud and app terms.
- readAwrite terms body; Kanah terms date.
- YouVersion Platform terms (storage, caching, AI clauses).
- Casa del Libro: last 16 000 characters of the contract terms; whether the reader host has its own terms.
- Whether any DRM-free purchase path exists at Libroteka.
- Thai original of the MEB terms (only a tool translation was read).
- Which Bible versions are public domain per site.

## 6. Questions for counsel

1. Does a gesture-triggered, in-memory read of one selection by a content script fall under "automated means",
   "robots", "data mining" or "unauthorized third-party software" in Google, Amazon, Pratilipi, bible.com and
   BibleGateway terms?
2. Is a one-way sentence hash "stored Content" where a clause bars "store" or "index"?
3. Is one retained, user-consented sentence per encounter a reproduction that the platform's clause or an EU/Thai/
   Indian exception covers (private study, quotation)?
4. Does the Casa del Libro text-and-data-mining reservation reach a transient lookup, and does it reach sending a
   sentence to an AI service?
5. Does an extension that names a site in a store listing change the analysis compared with a generic tool?
6. For readAwrite: is overriding a CSS selection block a circumvention of a technological protection measure?
7. For uploads (Play Books, tolino cloud): does the user's own file bring the analysis into private-copy territory?
8. Chrome Web Store user-data requirements for an extension that reads page content on demand.

## Addendum — terms read in the browser pane by the coordinator (2026-10-09)

Two terms pages the research lane's fetch tool could not read were opened in the Chromium pane (public pages, no sign-in). Summaries, not quotations; a verbatim re-check by counsel is still needed.

| platform | page | what it says (summary) | consequence for GoLearn |
|---|---|---|---|
| readAwrite (MEB Corporation) | `https://www.readawrite.com/?action=term_of_use` (Thai, no "last updated" line) | copyright of published content belongs to the publisher/author; the company does not permit imitation, reproduction or forgery of content and marks and reserves the right to prosecute; no clause on bots, automated access, scripts, extensions, AI or text-and-data mining was found by keyword | copying is not permitted and the site blocks selection by CSS (`user-select: none`): technical status **Blocked**; any retained snippet would need permission; a single-selection lookup is not addressed |
| Kobo (Rakuten Kobo) | `https://authorize.kobo.com/terms/termsofuse` ("Last updated: October 2026") | the licence excludes data mining, robots or similar gathering/extraction methods; forbids page-scrape, robot, spider or other automatic devices; forbids reproducing or circumventing the navigational structure or presentation of the Service; Digital Content is for personal, non-commercial use; no AI/ML or browser-extension clause found by keyword | a user-initiated single-selection lookup is not an automatic device, but an extension that alters the reader's presentation could be read as "circumventing the presentation": **Permission required** (counsel), and `read.kobo.com` stays declined by the generic adapter |

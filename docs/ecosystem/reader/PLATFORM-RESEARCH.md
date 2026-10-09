# Platform research: reading environments for the universal reader integration

Status: 2026-10-09. Prompt 2 (universal ebook reader integration), platform-research lane. Public, official pages only.
Extends `../annex/E-reader-platform-research.md` (Google Play Books, Kobo, Kindle, read 2026-10-08) and does not
repeat it; where this document restates a fact from the annex it says so. The legal side is tabulated in
`RIGHTS-AND-PLATFORM-PERMISSIONS.md`. Nothing here is legal advice. **Nothing here is "verified"**: verification is
the coordinator's browser work (section 17 lists what to probe).

## 0. Method, limits, conventions

- Date of every read below is **2026-10-09** unless the line says "annex, 2026-10-08" (read by the previous lane and
  not re-read) or "search summary" (the fact came from a search-result snippet; the page itself was not fetched).
- No sign-in, account, purchase, download of a book, paywall or DRM bypass, and no story or book text was read for
  this document. Where a public page was opened, only its structure, labels and links were asked for.
- `WebFetch` returns a small model's summary of a page, not raw text. Every quotation below (at most 15 words per
  page, except the Pratilipi clauses, at most 15 words each) is as the tool returned it and **needs a verbatim
  re-check on the live page** before it is relied on. Translations (Thai, Spanish, Albanian, German) are the tool's
  and are marked "(translation)".
- Each platform is written as two separate halves: **Technical capability** (what the interface exposes) and
  **Legal / contractual permission** (what the terms say, or do not say). A statement in one half never implies the
  other.
- Provisional rights-matrix status uses exactly: Unverified / Permission required / Blocked / Unsupported.
  Meaning here: *Unverified* = nothing found that forbids it and nothing that permits it, not yet measured;
  *Permission required* = the terms or the data-rights holder reserve a right the feature would use, so a written
  yes is needed first; *Blocked* = established by measurement or by a clear prohibition; *Unsupported* = there is no
  reading surface of the kind the feature needs.
- Language targets: sq Albanian, de German, es Spanish, th Thai, hi Hindi, nb Norwegian Bokmal. **Corrections to the
  brief:** readAwrite and MEB (mebmarket.com) are Thai services (th), operated by the same company; Pratilipi's
  Hindi site is the hi surface. No platform on the supplied list is nb-specific (see section 16).

## 0.1 Coordinator probe notes folded in (received during this lane; "probed", not "verified")

The coordinator's own live probes of public pages without sign-in (2026-10-09) are recorded here as reported to this
lane; this lane did not repeat them and they are the coordinator's measurements, not this lane's reads.

- Pratilipi: read pages technically fully selectable (plain `<p>` inside `.book-content`, `html lang=hi`).
- readAwrite: selection prevented by CSS (`user-select: none`) and context menu disabled on story spans:
  **technical block** (a deliberate design choice by the operator, relevant to the legal reading in section 10).
- Casa del Libro: the browser reader is gated behind sign-in; the coordinator pointed to `/ayuda/condicionesUso`
  (read in section 9).
- Kanah: reader renders in a same-origin iframe with plain paragraphs; company domain `al.kanah.app`; iOS
  `id1631723729`; Android package `al.kanah.app`.
- Tolino webreader: country dialog, then sign-in. Play Books reader: needs a Google account. `read.kobo.com`
  redirects to the apps page. MEB: no browser reader (installed apps).

## 1. Summary table (one line per platform)

| # | platform | languages served (of our six) | browser reading | native apps found | DRM scheme found | provisional status |
|---|---|---|---|---|---|---|
| 1 | Google Play Books | not established per language; Partner Center accepts all languages (search summary) | yes, `play.google.com/books` (annex) | Android, iOS | "proprietary content protection" (annex) | Unverified |
| 2 | Kobo | store language filters show de, es, hi, nb, th; sq not seen (search summary) | yes, Read Now (annex; help page re-read) | Android, iOS, desktop (annex) | not established | Unverified |
| 3 | Kindle for Web | not established | yes, `read.amazon.com`; text is a bitmap (lead's measurement, 2026-10-08) | iOS, Android, PC/Mac | Amazon DRM (terms reference) | Blocked (page text); share bridge Unverified |
| 4 | Libroteka | sq | no buyer-facing browser reader found; seller-paid "read within the site" option only | none found | none mentioned | Unsupported (browser) |
| 5 | Kanah | 53 app locales listed; Albanian catalogue claimed by third parties only | yes per terms overview and coordinator probe (same-origin iframe, plain paragraphs) | iOS/iPadOS/Mac listing found; Android package `al.kanah.app` (coordinator) | not established | Unverified |
| 6 | Tolino | de (also at, ch; en, nl sites) | yes, webreader | Android, iOS; no PC/Mac app | Adobe DRM named by Thalia terms; not on tolino pages | Unverified |
| 7 | Thalia | de | via tolino webreader and the Thalia app | Thalia "Lesen & Hören" app (search summary) | Adobe DRM, watermarks | Unverified |
| 8 | Casa del Libro | es | yes, `ebooks.casadellibro.com/web/#/books` | Vivlio (Android, iOS) | Adobe DRM and Vivlio ePub | Permission required |
| 9 | readAwrite | th | public story pages; selection blocked by CSS, context menu disabled (coordinator probe) | Android, iOS | not applicable (web stories) | Blocked (selection); terms unread |
| 10 | MEB | th | none found; terms say apps only | Windows, Android (meb+), iOS, Huawei, e-ink | "not encrypted with DRM are not delivered" (translation) | Unsupported (browser) |
| 11 | Pratilipi (Hindi) | hi (12 site languages) | yes, `/read/...`; locked chapters push to the app | Android, iOS | not applicable (platform-gated) | Permission required |
| 12 | BibleGateway | sq 1 version, de 5, es 19, th 3, hi 2, Norwegian 2 (Bokmal not stated) | yes, public passage pages | mobile app (footer link) | none (copyright by version) | Permission required |
| 13 | YouVersion / bible.com | sq 4 versions, nb 8, th 10; de, es, hi language pages exist | yes, public verse pages | Bible App | none (publisher licences) | Permission required |
| 14 | API.Bible (path for 12 and 13) | "145+ languages" (their claim) | n/a (API) | n/a | licence by version | Permission required |

## 2. Google Play Books

- **Website:** play.google.com/books (library); help `support.google.com/googleplay/answer/185545`, `/3165868`,
  `/11012086`.
- **Languages:** Google's help pages give a country list for ebooks (about 75 countries, including Germany and India;
  that page is dated) and no reader-facing language list; the Partner Center policy says books in all languages are
  accepted (both search summaries, 2026-10-09). Per-language catalogue for sq/th/nb: **not established**.
- **Browser reading:** yes. Computer help: open the library at `play.google.com/books`, display options for font,
  size and formatting (re-read 2026-10-09 on `/185545`). Two viewing options, "Original pages" and "Flowing text";
  not every ebook offers both (same page).
- **Native apps:** Android phone and tablet, iPhone and iPad (tabs on the same help page).
- **Uploads:** Computer: "Your books" then "Upload files", `.pdf` or `.epub`, files appear under Uploads. Android:
  EPUB needs no setting, PDF upload needs "Enable PDF uploading". Email attachments can be sent to the app on
  Android and iOS. Bookmarks, highlights and notes for PDFs sync only for PDFs uploaded after 2026-01-20
  (search summary of `/11012086`, 2026-10-09). A community answer gives a 100 MB size cap: not official.
- **Selection / dictionary / annotation (documented):** Android: touch and hold a word, drag sliders, choose a
  colour; with app 2025.1.10 or later, highlight one word then "Define"; "Translate" after selecting text; "Search"
  for book or web (re-read on `/3165868`, 2026-10-09). iPhone/iPad: define works on one word only (search summary).
  The computer tab's define/translate steps were **not retrieved** (still open from the annex). Note: the sibling
  page `support.google.com/books/answer/3165868` is **Google Books** (a different product) and describes Cut /
  Translate for that product; do not conflate.
- **Share / deep link:** no Play Books page found describing sharing a selection to another app on Android or iOS
  (search 2026-10-09). Not assumed. Notes export: Drive folder "Play Books Notes", one doc per book, turned on in
  Play Books Settings (`/3165868`). Publisher copy-paste limits can drop highlights from that export (same page).
- **DRM:** annex: Google "uses proprietary content protection technology" on Android, iOS and Web.
- **Metadata from ordinary page interfaces:** reader at `play.google.com/books/reader` with a rendering frame on
  `books.googleusercontent.com` (annex, third-party code reading); not re-measured. Book id, title and position come
  from the reader URL and page title: **to be measured**.
- **Terms (read 2026-10-09):** Google Play Terms of Service, page dated 2026-07-29, update effective 2026-11-05:
  "for your personal, non-commercial use only" and "circumvent, disable or defeat" (a security-feature clause);
  "attempt to modify any Content" clause; automated means and reverse engineering **not addressed** on that page.
  Google Terms of Service, effective 2026-07-30: automated means bar is tied to machine-readable instructions such as
  robots files; separate bars on bypassing protective measures, reverse engineering the services, and using
  AI-generated content to develop machine-learning models (all paraphrased from the tool's answer).
- **Partner / API path:** a Partner Center exists for publishers; **no reader-side API or integration programme
  found**. (A Books API exists generally; not researched and not claimed.)
- **Technical capability:** web reader reachable; whether selected text is reachable by a content script is unknown
  (rendering frame is reported cross-origin). Upload of an owner-authored EPUB gives a lawful test target.
- **Legal / contractual permission:** the terms read do not address a user-side extension; the circumvention and
  modification clauses are the nearest. Uploaded personal files raise a different, probably lighter, question than
  purchased titles (open question for counsel).
- **Provisional status:** Unverified.
- **Coordinator probe note:** the reader needs a Google account (not signed in by the probe).
- **Probe:** upload the owner EPUB to the owner's library; list iframes and origins; test `getSelection()` in flowing
  and original-pages modes; record the reader's own popup (Define / Translate / Search); check whether the computer
  reader has Define at all; capture URL and title patterns; check the robots file of `play.google.com`.
- **Counsel:** whether a gesture-triggered content script reading a selection from the user's session is "automated
  means" given that clause is robots-conditioned; whether uploads of the user's own files change the analysis.

## 3. Kobo

- **Website:** kobo.com; web reader reached by "Read Now" from My Books (help article `4408228476567`, re-read
  2026-10-09). Reader host `readnow.kobo.com` (annex).
- **Languages:** store language filters list German, Spanish, Hindi, Norwegian and Thai; Albanian **not seen**
  (search summary of store pages, mixed storefronts, some old). Kobo's device page names Norwegian, German and
  Spanish as interface languages and says Devanagari-script books can be read (same search summary).
- **Browser reading:** yes. Browsers named: Chrome, Edge, Firefox, Safari. Not for audiobooks; in Japan only
  fixed-layout books; only titles that support it (help article).
- **Native apps:** Kobo Books app for Android and iOS (help articles named in the search), Kobo Desktop (guide
  exists). The apps page `kobo.com/us/en/p/apps` returned 403 on 2026-10-09.
- **Selection / dictionary / annotation (documented):** Android app: press and hold a word, drag handles, pick a
  colour (help `360017865073`). iOS app: similar (`360017708134`). A Kobo blog post (old) says the dictionary in the
  iOS and Android apps draws on Merriam-Webster with Google and Wikipedia extras, for ePub only, not PDF. The
  eReader guide has a translate dialog; no phone-app translation steps found (search summary). The **web reader help
  page is silent** on highlighting, dictionary, selection and translation (re-read 2026-10-09).
- **Share / deep link:** none found for selected text on Android or iOS. Annotation export is a kobo.com function
  (My Books, Actions, Export Annotations: PDF/HTML/TXT/Markdown, author-approval limits; annex).
- **DRM:** **not established** from a primary source.
- **Metadata from ordinary interfaces:** `readnow.kobo.com` shows an error page without a session (annex). Book id
  and title patterns: to be measured in the owner's session.
- **Terms:** the Terms of Use at `authorize.kobo.com/terms/termsofuse` **returned 403** (2026-10-09, again) and the
  Terms of Sale at `kobo.com/termsofsales` also returned 403. Only the annex's search excerpts exist for the Terms
  of Sale (personal, non-commercial; no reproduction). **No Kobo clause on automation, circumvention or extraction
  has been read.**
- **Partner / API path:** none found for readers. Publisher side (Kobo Writing Life) not researched.
- **Technical capability:** unknown for DOM text; vendor claim of same-origin `srcdoc` iframes is unconfirmed.
- **Legal / contractual permission:** unresolved because the Terms of Use have not been read by anyone.
- **Provisional status:** Unverified.
- **Coordinator probe note:** `read.kobo.com` redirects to the apps page without a session (this lane saw the
  `readnow.kobo.com` error page in the annex; the two hosts are not reconciled).
- **Probe:** owner signs in; iframes, `sandbox`, `srcdoc`; `getSelection()` in the frame; the reader's own popup;
  open the Terms of Use from the signed-in session and read the clauses (the only way found to reach them).
- **Counsel:** after the ToU is read: automation / extraction / third-party software clauses; Terms of Sale
  reproduction clause against a transient in-memory selection.

## 4. Amazon Kindle for Web

Technical findings are the lead's 2026-10-08 measurements (`../KINDLE-INTEGRATION-FINDINGS.md`); this section adds
only today's reads.

- **Website:** read.amazon.com; landing page re-read 2026-10-09: books, magazines and comics; notes and highlights;
  search within a book; "Press and hold a word, and then release for the definition."
- **Languages:** not established.
- **Browser reading:** yes (Kindle for Web). **Native apps:** iOS (App Store), Android (Google Play), PC and Mac
  desktop download (landing page).
- **Selection / dictionary / annotation (documented):** press-and-hold dictionary (landing page). Translation: select
  by dragging, More, Translation, needs a network (search summary of a Kindle features page). Highlights sync across
  apps; Export/Share of notes needs Sync switched on (search summary of Amazon help).
- **Share / deep link:** the Android and iOS share sheet is documented as the way to **send files to** Kindle
  ("Send to Kindle"); nothing found for sharing a selected word **out of** the Kindle app (search summary). Not
  assumed.
- **DRM:** Amazon DRM (referenced by the Kindle Store Terms).
- **Technical capability:** blocked for page text (bitmap, empty `getSelection()`; lead). Copy and Notebook exist.
- **Terms (read 2026-10-09 through the `digprjsurvey.amazon.com` mirror, as in the annex; the canonical
  `amazon.com/gp/help` pages returned 503):**
  Kindle Store Terms, updated 2026-06-30: "circumvent any digital rights management system"; "solely for your
  personal, non-commercial use"; no clause on automated tools or robots found.
  Conditions of Use, updated 2026-08-14: licence excludes "data mining, robots, or similar data gathering and
  extraction tools"; a software clause bars reverse engineering; an agent clause requires identification; an
  AI clause bars using AI-generated content from the services to develop models (paraphrases).
- **Partner / API path:** none for readers found. (Amazon's Kindle Create / KDP are publisher tools.)
- **Legal / contractual permission:** unresolved as in the annex; whether the Conditions of Use software clauses reach
  Kindle for Web or a user-side extension is not stated anywhere read.
- **Provisional status:** Blocked for in-page lookup; the Copy / Notebook share bridge Unverified.
- **Probe:** nothing new beyond the findings document, section 8.
- **Counsel:** Copy limit and Notebook export terms before describing any paste or import feature to users.

## 5. Libroteka (libroteka.al)

- **Website:** libroteka.al, Albanian-language ebook and digital-magazine marketplace (home page read 2026-10-09).
  Site language sq (`/sq/` paths); prices in LEK with USD, EUR, GBP selectors. Audiobooks not mentioned.
- **Languages:** sq interface; catalogue includes translated titles.
- **Formats:** the catalogue filter offers ePub, PDF and a third option "Lexohet brenda faqes" (read within the page);
  the FAQ says purchased books come as PDF or ePUB, mentions Mobi, and recommends ePUB (FAQ read 2026-10-09). Buyers
  download from "Libraria ime" (My Library).
- **Browser reading:** the FAQ describes in-site reading **only as a seller-paid extra** ("a seller can pay an extra
  fee"); it does not describe how a buyer reads in a browser. **Whether a browser reader exists for buyers is not
  established.**
- **Native apps:** none found on the site; the FAQ says no extra program is needed. Two searches (English, Albanian)
  found no Libroteka app (2026-10-09).
- **DRM:** not mentioned on the site pages read or in the terms.
- **Selection / dictionary / annotation:** nothing documented (files are read in the user's own reader).
- **Share / deep link:** none documented.
- **Metadata from ordinary interfaces:** book page pattern `https://libroteka.al/liber/{slug}/{id}`, author
  `/autor/{slug}/{id}`, category `/sq/libra/c/{slug}`; format filter on listing pages; no ISBN or language field on
  cards (listing page read; book pages not opened).
- **Terms:** `libroteka.al/sq/kushtet-e-perdorimit`, last updated 2023-01-17 (tool statement). Licence is limited,
  non-exclusive, revocable; it excludes the right to "shkarkimin, riprodhimin, kopjimin apo rishitjen" (download,
  reproduce, copy, resell: tool's translation); use "vetëm për përdorimin e tij personal" (only personal). Sellers
  hold product rights. No clause on DRM, bots, scraping or AI found. The text on download rights sits oddly beside
  the download instructions in the FAQ: **flag for counsel**.
- **Privacy policy** (`/sq/politikat-e-privatesise`, last updated 2021-12-09 per the tool): data collected on
  registration and purchase; says nothing on copying, automated use, bots, third-party tools or browser extensions.
- **robots.txt:** no Disallow rules, one sitemap (read 2026-10-09).
- **Partner / API path:** none found; sellers register through the site.
- **Technical capability:** local EPUB route plausible if the purchased file is DRM-free (not established);
  browser path unsupported as far as found.
- **Legal / contractual permission:** personal use only; retention of derived data not addressed.
- **Provisional status:** Unsupported (browser reading); authorised local EPUB route Unverified.
- **Probe (needs an authorised purchase by the owner, not by us):** whether a bought file carries Adobe or other
  DRM; whether "read within the page" exists for any title; whether any app exists in the stores.
- **Counsel:** the download exclusion versus the download instructions; whether a DRM-free purchased EPUB read in
  the controlled reader is inside the licence.

## 6. Kanah (kanah.app)

- **Website:** kanah.app is script-rendered: most fetches returned only a title or empty content (2026-10-09). Facts
  below come from the App Store listing, the privacy policy page and the terms pages that did return text.
  Coordinator probe: the reader renders in a same-origin iframe with plain paragraphs; `al.kanah.app` did not
  resolve from this lane (DNS error, 2026-10-09); the Android package `al.kanah.app` Play listing returned no text.
- **Operator:** kanah LLC, Cheyenne, Wyoming (privacy policy).
- **Languages:** the app lists English plus 52 other interface languages including German and Spanish. Albanian
  catalogue claims appear only in third-party directories and one user review (search summary): **not established
  from a Kanah page**. Hindi, Thai, Norwegian catalogue: not established.
- **Content:** ebooks, audiobooks, short stories, summaries; highlight and note export to EPUB or PDF; vocabulary
  lists; offline reading; Send-to-Kindle; tools for authors and publishers to upload content.
- **Browser reading:** the terms overview says the service is available on web and iOS/Android apps
  (`kanah.app/terms/terms-of-service`, 2026-10-09, tool summary); coordinator probe: a same-origin iframe reader with
  plain paragraphs. Reader URL: to be recorded by the coordinator.
- **Native apps:** iPhone, iPad, Mac (Apple silicon), visionOS (App Store listing, version 1.0.17 on 2025-05-30, first
  entry 2023-09-09). Android: **not established**.
- **DRM:** not established. **Identifiers / language metadata:** not exposed on any page read; to be measured.
- **Terms:** the real terms are at **`https://kanah.app/terms/terms-of-service`** (no date on the page; tool
  summary, 2026-10-09). Section 2: users grant kanah a "non-exclusive, worldwide, royalty-free, revocable license"
  for their uploaded content; section 4: sales, fees and withdrawals for ebooks and audiobooks; section 6: uploads
  must not infringe, and users must not interfere with the platform's operation. **No clause on copying by readers,
  automated access, third-party software or AI was found** (absence in a tool summary, not proof of absence).
  `kanah.app/terms` returned a partial version of the same text; `/terms/terms-of-use` returned an empty shell; the
  privacy policy is at `kanah.app/terms/privacy-policy`; the App Store listing links Apple's standard EULA.
- **Partner / API path:** **no formal partner or publisher programme described** in the terms; a self-serve
  author/publisher upload route (upload, manage, track content, earnings) is advertised in the App Store listing.
  No reader-side API found. Contact: info@kanah.app (terms page). A search found no named Albanian publisher deals.
- **Technical capability (probed by coordinator):** same-origin iframe with plain paragraphs, so a content script
  can plausibly read a selection. **Legal / contractual permission:** terms silent on reader-side automation; the
  books inside belong to uploading authors and publishers, whose rights the terms do not describe from the reader's
  side (counsel).
- **Provisional status:** Unverified.
- **Probe:** reader URL and iframe structure; whether selection and copy are enabled; language field and
  identifiers of an Albanian title; whether uploaded titles carry any publisher copy restriction; the Android
  listing.
- **Counsel:** the rights position of author-uploaded content in the reader; absent an automation clause, the
  general copyright and consumer-law position.

## 7. Tolino (mytolino.com / mytolino.de) webreader

- **Website:** mytolino.de (German), mytolino.com (English), mytolino.nl.
- **Languages:** de through Thalia and other German-speaking booksellers (Deutschland, Osterreich, Schweiz
  selector); the catalogue language is the bookseller's.
- **Browser reading:** yes. `webreader.mytolino.com/library/index.html` (link on `mytolino.de/tolino-webreader/`).
  Sign in with the account of the user's tolino bookseller. Reads purchased eBooks, EPUB and PDF the user uploads,
  and plays audiobooks; text-to-speech on about half of titles; fixed-layout comics (pages read 2026-10-09).
  The reader page itself rendered nothing but its title without a session.
- **Native apps:** Android (Google Play `com.mytolino.app`) and iOS (App Store `id944944881`); **no PC or Mac app**,
  the FAQ points computer users to the webreader (re-read).
- **Cloud:** tolino cloud keeps purchases, uploads (ePUB, TXT, PDF), reading position, notes, highlights; up to five
  devices, and a browser session counts (search summary and cloud page).
- **Selection / dictionary / annotation (documented):** the app FAQ describes press-and-hold selection, highlight
  colours, notes and a notes directory, and "Translate" in the context menu for a sentence or paragraph, needs an
  internet connection; some titles refuse translation because publishers must grant permission (FAQ re-read
  2026-10-09). The dictionary is not mentioned on that page; a search summary mentions downloadable dictionaries on
  eReaders and the app. **The webreader's own selection, dictionary and annotation features are not documented on
  any page read.**
- **Share / deep link:** none documented for selected text. The Android/iOS app share sheet for text: not found.
- **DRM:** not on tolino pages. Thalia's terms (section 8) say many titles use Adobe DRM tied to an Adobe ID.
- **Metadata:** reader URL carries language and reseller parameters (page link); book-level URLs: to be measured.
- **Terms:** tolino app, webreader and cloud terms **not found**: `mytolino.de/rechtliches/` is a device-document
  index, `mytolino.com/legal/` is the same; the footer has Impressum, Datenschutz and Open Source only. Each
  bookseller's terms govern the purchase (see Thalia).
- **Partner / API path:** `mytolino.com/sales-cooperation/` exists (search result, bookseller programme); no reader
  API found.
- **Technical capability:** unknown for DOM text in the webreader.
- **Legal / contractual permission:** not established; depends on the bookseller's terms (Thalia, Hugendubel,
  Weltbild...) and on a webreader/cloud terms page not located.
- **Provisional status:** Unverified.
- **Coordinator probe note:** the webreader shows a country dialog, then a sign-in form (no content without
  sign-in).
- **Probe:** owner signs in via Thalia; upload the owner EPUB to the cloud, read it in the webreader; iframes and
  origin; `getSelection()`; the webreader's long-press menu; find the webreader's terms in the signed-in UI.
- **Counsel:** the contractual layer: bookseller AGB versus an undiscovered webreader terms.

## 8. Thalia (thalia.de)

- **Website:** thalia.de. Direct fetches returned **403** (home, AGB, help) on 2026-10-09; the AGB text below is
  from a **search summary** of `thalia.de/hilfe/rechtliches/agb` and must be read on the live page.
- **Languages:** de; also thalia.at (product pages seen).
- **Browser reading / apps:** the tolino webreader, and the Thalia app "Lesen & Hören" (product-page text via
  search summary).
- **DRM:** AGB summary: Adobe DRM on many titles, use only through the Adobe ID stored on the device; titles may carry
  individual watermarks. Product pages: an Adobe ID is needed to read on tolino devices, other eReaders and PC; the
  guide sets up Adobe Digital Editions and a USB transfer.
- **Terms (search summary, 2026-10-09):** a licence, not ownership: a simple, non-transferable right for personal use
  ("ausschliesslich fur den persönlichen Gebrauch"); a once-only download copied to own devices; no editing, no
  copies for third parties, no public access. A translation feature built on DeepL is limited to excerpts that fit
  the visible page and circumvention of that limit is barred. Family sharing up to five household members.
- **Selection / dictionary / annotation:** as tolino (section 7). **Share / deep link:** none documented.
- **Partner / API path:** none found.
- **Technical / legal:** as tolino for the webreader; the Adobe DRM route is a desktop-and-device workflow with no
  browser reading found.
- **Provisional status:** Unverified.
- **Probe:** open the AGB in the browser and copy the digital-content section; confirm whether Adobe DRM titles open
  in the webreader.
- **Counsel:** the DeepL excerpt-limit clause as a signal of how the retailer treats machine processing of page text.

## 9. Casa del Libro (casadellibro.com)

- **Website:** casadellibro.com (Spain, Grupo Planeta). eBooks section `/ebooks`; app page `/app-gratis`.
- **Languages:** es (catalogue in Spanish; other languages possible, not established).
- **Coordinator probe:** the browser reader gates on the Condiciones de uso page
  (`https://www.casadellibro.com/ayuda/condicionesUso`), read below.
- **Browser reading:** yes. Help page `casadellibro.com/ayuda/ayudaEbooks?idtipoproducto=9` (read 2026-10-09) gives
  the reader at `https://ebooks.casadellibro.com/web/#/books` for recent Firefox, Chrome, Opera, Safari. The reader
  host fetched empty (title only), as expected for a script-rendered app.
- **Native apps:** Vivlio Casa del Libro, free, Android (`com.casadellibro.lecturadigital`) and iOS
  (`id6445927450`); Vivlio e-ink readers; computers use Adobe Digital Editions (help page). App Store notes: integrated
  dictionary added in 3.3.0; reviewers say highlighting and notes are missing or weak in the app, one says highlight
  works on the web version (user reviews, not authoritative).
- **DRM:** two schemes: Adobe DRM ePub (Adobe ID, up to 3 downloads) and "Vivlio ePub" (up to 5 registered devices,
  3 device changes a month, online reading one device at a time); 6 downloads across formats (Condiciones de
  contratacion, translation by the tool; the last 16 000 characters of that long page were not read). The help page
  does not mention CARE. **"CARE" is not established as used by this retailer.**
- **Selection / dictionary / annotation:** Vivlio dictionary (App Store notes). Web reader: **not documented**.
- **Share / deep link:** none documented.
- **Metadata:** web reader hash route `#/books`; product URL patterns: to be measured.
- **Terms (translations by the tool, 2026-10-09):** Condiciones de uso (no date; footer `v.5.8.26`): reproduction,
  distribution, commercialisation or transformation of contents is infringement; "Contents may not be used to train
  any Artificial Intelligence System"; express reservation of rights on text and data mining. Condiciones de
  contratacion section II: eBooks only for personal, non-commercial purposes; copying and circumvention of protection
  technology prohibited; selling, renting, lending, distributing prohibited.
- **robots.txt (2026-10-09):** the retailer lists named groups for AI and LLM crawlers (OAI-SearchBot, ChatGPT-User,
  GPTBot, Claude-SearchBot, Claude-User, ClaudeBot, PerplexityBot, MistralAI-User, Amazonbot, Applebot), blocks
  dozens of named scrapers, and blocks most query-string URLs. The reader host's robots not read.
- **Partner / API path:** none for readers found; Grupo Planeta "Oficina de Buenas Practicas" link in the footer.
- **Technical capability:** browser reader exists; DOM access unknown. **Legal:** the strongest explicit machine
  reservation on the list (AI training and TDM), plus copying and circumvention bars in the sales terms.
- **Provisional status:** Permission required.
- **Probe:** owner's own sign-in; the web reader's iframe structure; `getSelection()`; whether the reader offers
  highlight and a dictionary; which DRM a given title uses.
- **Counsel:** whether the TDM reservation (EU DSM Directive Art. 4 style) reaches a transient in-browser analysis of
  one selection; whether it reaches sending a sentence to an AI service.

## 10. readAwrite (readawrite.com)

- **Website:** readawrite.com; operated by MEB Corporation Public Company Limited (footer, 2026). Thai reading and
  writing platform: novels, fan fiction, comics, bestsellers, pre-orders, forums, coin purchases.
- **Languages:** th (interface and content). Translated novels are listed in Thai.
- **Browser reading / story pages:** public story pages at `https://www.readawrite.com/a/<32-character id>`
  (home page, 2026-10-09). The structure of a story page and its chapter pages was **not opened** in this lane.
- **Native apps:** iOS `id1295087414` (developer MEB; display modes normal, sepia, night, dark; adjustable font and
  alignment; chat-style novels "readAchat"; privacy labels recorded) and Android `com.meb.raw2`. The footer's
  Android badge points to a `download_readawrite_plus` action.
- **Selection / dictionary / annotation:** none documented on the store listing.
- **Share / deep link:** none documented.
- **DRM:** none applicable (web stories); chapters may be coin-gated (coins and pre-orders exist).
- **Metadata:** `/a/<id>` URLs; title and meta tags: to be measured. Footer actions as query strings:
  `?action=term_of_use`, `?action=privacy_policy`, `?action=cookie_policy`.
- **Technical block (coordinator probe):** story text is selection-blocked by CSS (`user-select: none`) and the
  context menu is disabled on story spans. That is a deliberate operator measure against copying; a tool that
  overrode it (re-enabling selection, reading text around the block) would be defeating a protective measure and is
  **not** to be built without permission. A user selecting by another route is not something this lane researched.
- **Terms:** `?action=term_of_use` returned **only the title and section headings** (script-rendered body) in three
  fetches on 2026-10-09 (the sub-sections Overview, Privacy Policy, Terms of Service, Cookie Policy, Takedown
  Notice, Other, FAQ are listed with no text beneath); **no clause on copying, automated access or AI could be read
  by this lane**. The coordinator should read it in the browser. The same company's MEB terms (section 11) are
  readable and bar copying content for gain, with personal use only; they are a **different document** and are not
  assumed to govern readAwrite. The cookie policy (dated 2020-05-27) mentions reCAPTCHA and says nothing about
  crawlers. The "Why readAwrite" page (read) has no copying or partner text. The iOS listing links Apple's standard
  terms and a privacy policy on mebmarket.com (that privacy page has no copying or automation statement).
- **robots.txt (2026-10-09):** no Disallow directives; explicit allow for Facebook crawlers; sitemap listed.
- **Partner / API path:** none found; "work with MEB" / publisher routes exist on mebmarket.com.
- **Technical / legal:** story text on public pages is probably in the DOM (unverified); terms unread.
- **Provisional status:** Blocked for selection-based lookup on story text as published (operator CSS block, per
  coordinator probe); the terms are still to be read.
- **Probe:** read the terms body in the browser; confirm the block on a second story; check whether the app offers
  any copy or lookup feature; look for a partner contact.
- **Counsel:** whether bypassing a CSS selection block is "circumventing" under Thai law or the terms (after the
  terms are read); how a permission request should be framed to MEB Corporation.

## 11. MEB (mebmarket.com)

- **Website:** mebmarket.com, Thai ebook store (fiction, comics, magazines, general ebooks, audiobooks, "buffet"
  bundles); age-gated sections; login with Facebook, Line, Apple, Google or meb account.
- **Languages:** th.
- **Browser reading:** **none found.** The "how to read" page lists Windows (installer or Microsoft Store), Android
  (meb+ installed outside Google Play), iOS, Huawei AppGallery, and e-ink readers from Hytexts or B2S with a
  preinstalled app (translation, 2026-10-09). No web reader is mentioned; the page does not say there is none. Terms
  clause 2.1 (translation): books "can be read only through apps on operating systems the company has provided".
- **DRM:** clause 2.2 (translation): original files not encrypted with DRM are not delivered. Scheme not named.
- **Selection / dictionary / annotation:** not documented on pages read. **Share / deep link:** not documented.
- **Metadata:** the shop uses query-string actions (`?action=...`, `?store=...`); book detail sitemaps listed in
  robots.txt (`bookdetail_sitemap1..9.xml`); book page pattern: to be measured.
- **Terms:** `?action=term_of_use`, no date or version, read as a Thai-to-English summary: clause 1 forbids copying,
  reproducing or forging content for gain; clause 4.2 personal use only, no commercial activity; no clause on bots,
  scraping, AI or third-party software found by the tool (summary; Thai original needs a human read).
- **robots.txt:** no Disallow rules; ten sitemaps.
- **Partner / API path:** publisher console (`/publisherconsole_2/`) for sellers; none for readers.
- **Technical / legal:** no browser surface; native-app-only reading is outside a browser extension. The only
  bridges would be an authorised export or the share sheet, neither documented.
- **Provisional status:** Unsupported (browser); share bridge Unverified.
- **Probe:** the Windows app (a desktop app is not a browser, so out of scope for the extension but relevant to a
  clipboard bridge); whether any web reading URL exists for purchased books; Thai read of the terms.
- **Counsel:** whether the "apps only" clause means a browser adapter is a breach by design.

## 12. Pratilipi (hindi.pratilipi.com)

- **Website:** hindi.pratilipi.com, operated by Nasadiya Technologies / Nasadiya Tech. Pvt. Ltd. (App Store seller
  and page footer 2026). Title: "10 lakh+ Hindi Kahaniyan" (home page 2026-10-09). 12 site languages in the language
  selector.
- **Languages:** hi on this subdomain; regional subdomains (bengali., english., ...) via the selector.
- **Browser reading:** yes in part. Series page `/series/{title-slug}-by-{author-slug}-{id}` lists chapters; chapter
  pages are `/read/{title-slug}-{chapter-id}` with an optional `redirectTo` query. On the one series page opened,
  **only the trailer had a preview link; every other chapter showed a lock and a "download the app to read" prompt**
  (structure only; no text read). Whether any chapter is readable in a browser without the app: to be measured.
- **Other URL patterns:** `/pratilipi/...`, `/genres/{slug}`, `/collections/{name}`, `/stories/{slug}`, `/event/{id}`,
  `/help`, `/help/reading`, `/help/writing`, `/help/copyright`.
- **Native apps:** Android and iOS. App Store listing (id1484810435, version 5.5.1): night mode, reading statistics;
  dictionary, translate, offline: **not mentioned**; privacy labels list tracking identifiers and usage data. Home-page
  store badges link to `#`, so no store URL is given on the page.
- **Selection / dictionary / annotation:** none documented. **Share / deep link:** series page offers WhatsApp,
  Facebook, Twitter, copy link (share of a link to the work, not of a selection).
- **DRM:** none; platform-gated access (login, locks, coins).
- **Metadata from ordinary interfaces:** page title pattern "{title} - An online Hindi story written by {author} |
  Pratilipi.com"; ids in URLs; chapter list fields: title, rating, reads, reading time, publish date.
- **robots.txt (2026-10-09):** one group for all agents disallows `/read/`, `/read?*`, `/reader/`, `/reader?*`,
  `/library`, `/collections/`, `/api/`, `/user/`, among others; **no AI-crawler directives**; no sitemap listed.
  That robots rule is aimed at crawlers; a user-gesture tool is not a crawler, but the rule shows the operator does
  not want chapter pages fetched in bulk.
- **Terms of service:** `hindi.pratilipi.com/terms-of-service` and `english.pratilipi.com/terms-of-service`, both
  "Last updated on 15th September, 2026", read 2026-10-09 (the Hindi and English pages agree on the clauses below).
  **Technical status (coordinator probe, not verified):** read pages are fully selectable, plain `<p>` in
  `.book-content`, `html lang=hi`; a technical capability only, silent on permission. All clauses sit under USER OBLIGATIONS (the tool reports that numbering skips 7 and 13).

  | topic | clause | quote (each at most 15 words) | other facts from the page |
  |---|---|---|---|
  | reproduction | 5 Reproduction | "To not reproduce any Content from the Website/Application" | republishing on another platform without written permission, for profit or not |
  | automated access | 12 Security | "Not use any manual or automated software" (crawl/spider list) | the list also bars cheats, exploits, bots, automation and probing; "Not to use cheats, exploits, automation, software, bots, hacks, or any unauthorized third-party software" appears in the English page's fourth bullet |
  | scraping | 15 No AI Scraping or Training | "crawl, scrape, extract, copy, reproduce, download, aggregate, index, store" | binds "Users and third parties"; "without the Company's prior written consent" |
  | AI / machine learning | 15 | "for the purpose of developing, training, pre-training, fine-tuning" | the clause also lists testing, benchmarking, evaluating or improving AI, machine-learning, large-language-model or generative systems; no permission contact named in the clause |
  | extensions / third-party software | 12 (closest) | "any unauthorized third-party software to modify or interfere with the Services" | browser extensions are **not named** anywhere |
  | personal use | 16 Access | "To access and use the Services solely for the User's personal and non-commercial purposes" | |

  Definition: "Content" = Published Works plus Company Content; authors own their works (page paraphrase). The
  Company may restrict or terminate access at its discretion. Contacts on the page: `hindi@pratilipi.com`
  (general), `contact@pratilipi.com` (grievance). Related pages linked in the footer: privacy policy,
  grievance redressal, vulnerability disclosure, hall of fame, Trust Center (`trust.pratilipi.com`, not read).
- **Which of our interaction models needs explicit permission (reading of the clauses; not legal advice):**
  - *In-browser deterministic analysis of a user selection:* no clause addresses it by name; clause 12's "unauthorized
    third-party software" and clause 5 leave it open, so a **site-targeted adapter or any claim of Pratilipi support
    needs explicit permission**; a generic page tool the user chooses to run is unresolved, counsel item.
  - *Retaining a sentence hash:* a one-way hash reproduces nothing and clause 15's "store" is tied to AI purposes;
    **no clause names it**; counsel to confirm before it is kept for Pratilipi.
  - *Retaining a snippet:* clause 5 (reproduction) and clause 15 (copy, store) - **explicit permission required**.
  - *Remote AI analysis of the selection or its sentence:* clause 15 covers use of Content with AI systems for
    improving or evaluating them, clause 5 covers reproducing Content to another service - **explicit written
    permission required**, including a no-retention, no-training undertaking from the AI provider.
  - *Commercial extension distribution that targets the site:* clause 16 limits the Services to personal,
    non-commercial use and clause 12 bars unauthorized third-party software - **explicit permission required**
    before distribution or marketing.
- **Partner / API path:** none found; publisher/author routes only. Permission contacts: the two addresses above,
  not designated for licensing.
- **Provisional status:** Permission required.
- **Probe:** which chapters render in a signed-out browser; DOM text and selection on `/read/` pages; whether the
  site's own selection menu exists; the title/meta tags; (do not sign in, do not unlock chapters).
- **Counsel:** whether the "not named" interactions are inside the licence; wording of a permission request.

## 13. BibleGateway (biblegateway.com)

- **Website:** biblegateway.com (public passage pages; Zondervan/HarperCollins family - not stated in the pages read,
  not claimed).
- **Languages / versions (page `/versions/`, 2026-10-09):** Albanian: Albanian Bible (ALB). German: HOF, LUTH1545,
  NGU-DE, SCH1951, SCH2000. Spanish: 19 versions (RVR1960, NVI, LBLA, DHH, ...). Thai: NTV-BIBLE, ERV-TH, TNCV. Hindi:
  ERV-HI, SHB. Norwegian ("Norsk"): DNB1930, LB; **the page does not say which is Bokmal**.
- **URL scheme:** `https://www.biblegateway.com/passage/?search=<book chapter:verse>&version=<code>`; multiple
  references comma-separated; chapter-only searches return a chapter; parallel versions with a semicolon
  (`version=NIV;NKJV`); `interface=print`; also `/verse/en/<ref>`, `/audio/...`, `/versions/<Version-Name-Slug>/`.
  Version slugs do not always equal the abbreviation. Page title pattern: "book chapter:verse version, opening words
  | Bible Gateway". Meta tags and canonical link: not exposed in the tool's text, to be measured.
- **Browser reading:** the passage page is the reader. **Native app:** "Mobile App" in the footer (not researched).
- **Selection / dictionary / annotation:** none documented beyond site features (not researched); **share / deep
  link:** the passage URL scheme above is the share mechanism; Android/iOS app deep links not established.
- **DRM:** none; each version carries its own copyright notice (NIV credited to Biblica, used by permission).
- **API:** no general API page; the page `/usage/` offers a search form, a "Ref Tag Tool" that links references and
  pops up passage text, and a free Verse-of-the-Day web service, and says nothing on quoting limits or storage.
- **Terms (Site Terms of Use, last updated 2025-06-04):** copying is restricted - the terms list copy, download,
  stream capture, reproduce, archive, upload, modify as barred except where permitted (paraphrase of the tool's
  answer); an automated-systems bar: "Use technology or any automated system such as scripts or bots" (aimed at
  collecting user data and bypassing security); content for "your personal enjoyment"; a quotation allowance
  (verses may be quoted up to a limit, never a whole book and never 25% or more of a work, with initials of the
  version); "different copyright restrictions" per version; AI not addressed. Widget terms (`/legal/widget-terms/`):
  no date, bars modifying or distributing the widgets; storage, API and AI not addressed.
- **robots.txt:** disallows several `/bible/...` path groups and `/user`, `Crawl-delay: 15`, a sitemap index; no
  AI-crawler directives (2026-10-09).
- **Partner / API path:** none for storage or AI found; the widgets and the VOTD web service are the offered tools.
  Permissions for third-party versions rest with the version owners.
- **Technical capability:** public HTML text; a content script can read a selection on the page (as for any web
  page). **Legal:** copying, automation and per-version copyright all bear on retention and AI.
- **Provisional status:** Permission required (retention, AI, extension distribution); single selection lookup
  unresolved.
- **Probe:** a passage page in a public-domain version (e.g. LUTH1545 or an RVA) - selectable DOM text; the printed
  copyright line per version; meta tags; the privacy of the site's own tools (cross-reference popups).
- **Counsel:** which versions are public domain (Luther 1545, Reina-Valera Antigua) versus licensed; whether
  quoting limits transfer to a lookup tool.

## 14. YouVersion / Bible.com

- **Website:** bible.com (Bible App), operated by Life.Church (terms page). Platform: youversion.com/platform and
  platform.youversion.com.
- **URL scheme (verse page, read 2026-10-09):** `/bible/{versionId}/{BOOK}.{chapter}.{verse}.{VERSION}` (example
  version 111 NIV); compare `/bible/compare/{BOOK}.{chapter}.{verse}`; audio `/audio-bible/{versionId}/{BOOK}.{chapter}.{VERSION}`;
  verse images; language pages `/languages/<iso3>` (deu, spa, hin, sqi, nob, tha exist); version list
  `/versions/{ID}-{abbr}-{name-slug}`. Page title pattern "[Passage] ([Version]) - [opening words] - Bible App".
  Meta tags and copyright line: not exposed in the tool's text, to be measured.
- **Languages / versions:** Albanian four versions (e.g. ids 3631, 292, 7, 4400); Norwegian Bokmal eight (e.g. 29, 30,
  102, 115, 121); Thai ten (e.g. 174, 179, 203, 2744); German, Spanish, Hindi listed (counts not shown). Site totals:
  3,823 versions in 2,456 languages.
- **Browser reading / apps:** public verse pages; Bible App (iOS, Android; footer "/app").
- **Selection / dictionary / annotation:** the website and app have their own highlighting; not researched here.
  **Share / deep link:** YouVersion help says bible.com links to specific verses may be shared freely (help article
  `o8t2xmy9q2-copyright`, undated); app deep links: not established.
- **DRM:** none; per-version publisher licences; the copyright holder is shown at the bottom of each chapter (help).
- **Terms (bible.com/terms, "Last Modified on April 2, 2020"):** "use any robot, spider, or other automatic device"
  (also covers automated monitoring or copying); use for "personal and non-commercial use"; all rights not granted
  reserved by Life.Church; AI and extensions not addressed. The page is old; the Platform has its own terms.
- **robots.txt:** disallows `/bible/*/*/` deeper paths (e.g. notes), parallel-reader URLs, search of users and plans;
  no AI-crawler directives, no crawl-delay.
- **Partner / API path:** YouVersion Platform (public beta since December 2025; blog dated 2026-03-31 and
  2026-04-21 read): free registration at platform.youversion.com, an **App Key** per registered app, SDKs for Web,
  React Native, Swift, Kotlin; "nearly 1,500 Bibles and 36 publishers in 1,283 languages"; platform page says it is
  for non-commercial use, apps must be free and carry no ads or paywalled Scripture; each publisher opts in, so not
  every Bible App version is available. A search summary of the developer terms says the licence is limited,
  revocable and non-transferable and does **not** include the Bible texts themselves, which come from the owners.
  The terms page and docs (`platform.youversion.com/terms`, `developers.youversion.com`) are script-rendered and
  returned only titles: **the storage, caching and AI clauses were not read**. The YouVersion copyright FAQ says full
  republishing is not permitted under their licence agreements.
- **Technical capability:** public HTML; a documented, keyed API gives the lawful text path.
  **Legal:** site terms bar robots; the Platform path needs registration and per-version licences.
- **Provisional status:** Permission required.
- **Probe:** read the Platform terms in the browser (the only way found); check the permissions metadata an API
  response exposes per version; verse page DOM and copyright line.
- **Counsel:** storage and AI rights in the Platform agreement; whether Platform non-commercial status fits a paid
  Go product.

## 15. API.Bible (american bible society) - the route for BibleGateway- and YouVersion-type text

- **Website:** api.bible, "a product of the American Bible Society"; free Starter plan (5,000 calls a month, up to 3
  licensed Bibles); "145+ languages" is their claim (home page read 2026-10-09).
- **Terms (api.bible/terms-and-conditions, Terms of Service dated 2026-09-03; Acceptable Use 2026-02-25; Commercial
  Agreement 2025-11-21; Non-Commercial Agreement 2025-09-12):**
  caching allowed but offline copies must be refreshed within 30 days; training generative AI or LLMs on copyright
  content is "strictly prohibited" without written consent from API.Bible and the rights holder; text-to-speech by AI
  of copyright content needs the owner's consent; "systematically extracting data" is barred; per-version limits
  (KJV territories, NKJV non-commercial under 5,000 monthly users; printing at most 100 verses).
- **Express Licensing FAQ (`care.api.bible/article/405-express-licensing-faqs`, "Last updated on October 1, 2026"):**
  public-domain texts may be used for display, caching and runtime LLM prompts; for copyrighted content (Creative
  Commons included) "Sending copyrighted text to LLMs as prompt context." is prohibited, and training is prohibited;
  "Caching is allowed and recommended."; the NIV is not available for commercial licensing; the ESV is not available.
- **Technical / legal:** a keyed, licensed text channel exists; it forbids remote-AI use of copyrighted text, so a
  remote-AI feature on Bible text is limited to public-domain versions on this route.
- **Provisional status:** Permission required (a licence is needed; AI limits are explicit).
- **Counsel:** whether a language-learning lookup that shows a verse is "display" for every version it uses.

## 16. Coverage gap for the six target languages

| language | platforms on the supplied list that serve it | note |
|---|---|---|
| sq | Libroteka, Kanah (claimed), BibleGateway, YouVersion; Kobo: not seen | no mainstream platform on the list clearly carries Albanian |
| de | Tolino, Thalia, Kobo, BibleGateway, YouVersion | |
| es | Casa del Libro, Kobo, BibleGateway, YouVersion | |
| th | MEB, readAwrite, Kobo, BibleGateway, YouVersion | |
| hi | Pratilipi, Kobo, BibleGateway, YouVersion | |
| nb | Kobo, BibleGateway (Bokmal not stated), YouVersion (eight Bokmal versions) | **no nb-specific retailer or story platform was supplied** |

## 17. What the coordinator should probe in the browser (consolidated)

1. Play Books: upload the owner EPUB, iframe origins, `getSelection()` in both modes, the reader's popup,
   `books.googleusercontent.com` frame, `play.google.com` robots.
2. Kobo: signed-in `readnow.kobo.com`, iframes and `srcdoc`, selection; **read the Terms of Use there**.
3. Kindle: nothing new; the share bridge test in findings section 8.
4. Libroteka: is any buyer-facing reader present; file DRM of an owner purchase; app store search.
5. Kanah: does `kanah.app` read books; language field; real terms.
6. Tolino/Thalia: webreader DOM, long-press menu; Thalia AGB digital-content section verbatim.
7. Casa del Libro: `ebooks.casadellibro.com` DOM and selection; the unread tail of the contract terms; which DRM per title.
8. readAwrite: terms body; one free story page structure.
9. MEB: any browser reader; the terms in Thai; clause 2 in context.
10. Pratilipi: signed-out `/read/` DOM and selection; verbatim recheck of clauses 5, 12, 15, 16.
11. BibleGateway and bible.com: public-domain version page DOM, meta tags, copyright lines.
12. YouVersion Platform and API.Bible: read the live terms in a browser; list per-version permission metadata.

## 18. Facts that could not be established

- Kobo Terms of Use and Terms of Sale (403 twice); Kobo apps page (403); DRM scheme.
- Thalia pages (403); the AGB wording is a search summary only; webreader/cloud/app terms (not located).
- Amazon canonical help pages (503); Kindle language coverage; Kindle share-out mechanism on mobile.
- Play Books: computer-tab define/translate; per-language catalogue; share-out mechanism on mobile; any reader API.
- Kanah: Android listing content, language metadata and identifiers, the terms' date, any partner mechanism for
  readers (none described), `al.kanah.app` (does not resolve from this lane).
- Libroteka: buyer browser reader, DRM of delivered files, any native app, book-page metadata.
- readAwrite: the terms body (three fetches returned headings only); any permission contact; whether the CSS block
  is mentioned in the terms.
- MEB: browser reading (absence not proved), file formats, DRM name, Thai terms in the original.
- Pratilipi: which chapters read signed-out; any selection menu; Trust Center contents.
- BibleGateway and bible.com: meta tags, canonical links, copyright lines on pages; app deep links.
- YouVersion Platform and developer docs: storage, caching and AI clauses (script-rendered pages).
- Casa del Libro: last 16 000 characters of the contract terms; CARE use; web reader terms and robots.
- Norwegian Bokmal specifically on BibleGateway.
- Android and iOS share/deep-link mechanisms for a selected word on every app listed: none documented by any
  platform page read.

## 19. Open questions for counsel (cross-platform)

1. A user-side, gesture-triggered content script reading one selection from a site the user is lawfully using:
   "automated means" / "robots" / "data mining" / "unauthorized third-party software" clauses (Google, Amazon,
   Pratilipi, bible.com, BibleGateway).
2. Derived data: a one-way sentence hash kept for spaced repetition versus clauses that bar "store" or "index".
3. Snippet retention for the user's own review (one consented sentence): reproduction clauses (Pratilipi 5,
   Casa del Libro, Libroteka, BibleGateway).
4. Remote AI: sending a selection or sentence to a model provider: Pratilipi 15, Casa del Libro TDM/AI reservation,
   API.Bible's prompt-context prohibition for copyrighted Bible text.
5. Distribution of an extension that names or targets a site (store listing, marketing): Pratilipi 12 and 16,
   Casa del Libro, MEB apps-only clause.
6. Whether reading a user's own uploaded or DRM-free EPUB inside the controlled reader is within each retailer's
   licence (Libroteka download exclusion; Play Books uploads; tolino cloud uploads).
7. The Chrome Web Store user-data requirements for an extension that reads page content on demand (carried over
   from the previous lane's list).

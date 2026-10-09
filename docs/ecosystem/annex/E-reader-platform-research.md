# Annex E — Reader platform research (public sources)

Produced 2026-10-08 by a research agent (Sonnet) under the lead's instructions: public pages only, no logins, no
downloads, no code. Reproduced as delivered, with the agent's own caveats. The lead's live Kindle observations are in
`../KINDLE-INTEGRATION-FINDINGS.md` and take precedence over third-party claims where they conflict. Not legal advice.

---

# Public-source research: Kindle for Web, Kobo Web Reader, Google Play Books web reader as integration surfaces

All fetches and searches were on 2026-10-08, public pages only. No code, downloads or logins. Not legal advice.

**Method caveats**
- WebFetch returns a small model's summary of each page, not raw text. Every quoted clause below needs a verbatim re-check on the live page before it is relied on.
- Direct fetches of these failed with 503 or 403, so those pages are marked "not read": amazon.com help pages (Conditions of Use, Kindle Store Terms, Kindle for Web help) and the Kobo Terms of Use (authorize.kobo.com).
- I read the Amazon pages through the mirror `digprjsurvey.amazon.com/csad/help/node/<id>`. It is an Amazon subdomain but an unusual one, so confirm it matches the canonical page.
- Search results and some store listings loaded only as empty shells, so those are marked "listing not read".
- Tags: **[OWN]** = the platform's own statement. **[3P]** = third-party claim. **[VENDOR]** = a commercial party with an interest in the claim.
- Citation numbers [n] refer to the table at the end.

---

## 1. Kindle for Web (Kindle Cloud Reader, read.amazon.com)

Amazon says "Kindle Cloud Reader is now known as Kindle for Web" [K1][OWN].

### A. Rendering
- **Amazon documents nothing about rendering.** The help pages I could read (Customize, Add Notes, View Notebook) are silent on rendering internals [K2–K4].
- **2011 launch:** Amazon described it as an HTML5 web app [K5][OWN]. Third-party bookmarklets from that era walked nested iframes and unwrapped `span.k4w` elements to get text [K6][3P]. Selection-blocking handlers were reported on the content frames [3P, via search summary of K6].
- **Later move to server-side rendering [3P, undated]:**
  - The ACRExtensions README says the extension no longer works [K7].
  - It reports "only images" reaching the client, with highlights as "empty DIVs with server side provided coordinates" [K7].
  - A gist commenter wrote in Aug 2022: "Now they're rendering all the text out as images" [K6][3P, anecdotal]. Another commenter said OCR works.
- **Oct 2025 reverse-engineering write-up [K8][3P, single author]:**
  - The reader fetches a TAR from `renderer/render` containing `glyphs.json`, `page_data_*.json` and `layout_data_*.json`.
  - Text is stored as glyph IDs, not Unicode. The author says the mapping is randomised roughly every 5 pages.
  - Pages are drawn by `PageImageRenderer.render` to `<canvas>`, converted to blob and `<img>`, with SVG used only for glyph outlines.
- **CastReader (a vendor selling a read-aloud extension) says** book text uses "custom subset fonts whose character mappings are shuffled" [K9][VENDOR]. It reports 184 font alphabets and 361 unique glyphs for one 920-page book [K10][VENDOR/3P]. It also says "Most read-aloud extensions work by taking the text out of the page", and that approach fails on Kindle for Web [K9].
- **The two accounts differ:** K8 describes canvas-to-image rendering, K9 describes scrambled fonts, and neither has been reconciled. Both agree that ordinary DOM text extraction fails on the current reader. Which mechanism applies to which books or versions is unknown.
- **Which books are affected:**
  - Print Replica: the only evidence is third-party/KDP-era. A KDP help page lists supported apps without a web reader [K11, via search summary, not fetched]. A CastReader page cites Amazon documentation as putting print-replica and image-based fixed-layout books outside read-aloud support [K12][VENDOR].
  - Amazon's current statement on whether Kindle for Web opens Print Replica or comics is not established.
  - Amazon's read.amazon.com landing page mentions "magazines, and comics" in the store [K1].

### B. Selection
- **Amazon's own statements:**
  - Selecting text opens a pop-up with a note icon; saving shows a highlight [K3][OWN]. That page does not list the other pop-up options.
  - The landing page says "Press and hold a word, and then release for the definition." [K1][OWN]. This is the dictionary gesture, stated on the Kindle for Web landing page.
  - No Amazon page states how selection relates to `window.getSelection()`.
- **Third-party reports:**
  - The old ACRExtensions used document ranges on the user's selection, which no longer works [K7].
  - Two 2026-04 Chrome Web Store reviews of CastReader say "Hard to select text" and "Need to highlight text and select it" [K13][3P user reviews].
  - Whether `getSelection()` returns usable text on the current reader is not established.
- **Copy limits:**
  - Readwise says publishers require a "copyright export limit" on highlights, typically 10–20% [K14][VENDOR].
  - Glasp says Amazon restricts copy-paste to "1–3% of a book" [K15][VENDOR].
  - The two figures conflict. No Amazon page found states the limit.

### C. Terms (quotes as returned by the fetch tool; verify verbatim)
- **Kindle Store Terms of Use** (updated June 30, 2026, via mirror) [K16][OWN]:
  - DRM circumvention: "attempt to bypass, modify, defeat, or otherwise circumvent any digital rights management system"
  - Scope: "solely for your personal, non-commercial use"
  - Scope: "solely through Kindle Software or as otherwise permitted"
  - Automated access: **silent**
  - Reverse engineering: **silent**
  - Third-party tools or extensions: **silent**
  - Copying by users: not addressed as a restriction (the fetch summary says copying appears only in Amazon's own data use).
- **Amazon Conditions of Use** (updated Aug 14, 2026, via mirror) [K17][OWN]:
  - The license excludes "data mining, robots, or similar data gathering and extraction tools".
  - The Software Terms bar "reverse engineer, decompile or disassemble, tamper with" the software.
  - The Software Terms bar "bypass any security associated with the Amazon Software".
  - An "Agent Terms" section says "Not circumvent or otherwise avoid any measure intended to block, limit, modify, or control" access.
  - **Scope question (open):** the fetched summary does not say whether these cover a browser extension acting on the user's own session, or whether Kindle for Web counts as "Amazon Software". That mapping is not established.

### D. Extension precedents (all claim-only)
- **Kindle Optimizer:** a Chrome extension adding Google Search and Translate on selection [K18][3P]. A search summary says it is now "bought out" and no longer works [3P]. The Kindle Optimizer page itself was not read.
- **Readertools:** a community fork [3P]. Its Chrome Web Store listing did not load, so its claims are unread.
- **Amazon Weblio extension:** a Japanese extension changing dictionary links in Cloud Reader (v1.1, 2013) [3P, via search snippet; listing not read].
- **Glasp:** a Chrome extension that works on the Notes & Highlights page and imports highlights [K15][VENDOR]. It is not a selected-word lookup. The Glasp page did not describe the technique.
- **TextMuncher:** a Firefox add-on that auto-turns pages and captures screenshots [K19][VENDOR]. The default OCR location is unclear in the listing. It requests host access to about 22 Amazon domains and declares website-activity and PII collection. Its listing says "Only use with ebooks you legally own or have permission to access."
- **CastReader:** claims an OCR pipeline of local WebAssembly Tesseract plus a glyph-to-character mapping [K9][K10][VENDOR].
- **Method summary:** DOM reading is reported to have worked only on the old renderer. Current precedents use OCR or screenshots, or read the notebook page. All are claim-only.

### E. Official interfaces
- **Notebook:** Amazon's notebook page gathers notes, highlights and bookmarks [K4][OWN]. It carries no export or limit statement.
- **Export features:** Amazon's help pages on export, email and share were not retrieved.
- **Documented limits:** only the third-party publisher-limit claims above [K14][K15].

### F. Classification

| Level | Public evidence | Reasoning |
|---|---|---|
| Technically possible | Weak, mixed | Current rendering is reported as glyph-ID/canvas or scrambled fonts [K8][K9], so DOM-text lookup is not supported. OCR of the rendered page remains possible per vendors. |
| Demonstrated by someone | Yes, claim-only | OCR and screenshot tools [K9][K19]. DOM-based tools were demonstrated on older renderers [K6][K7]. |
| Permitted by ordinary platform interfaces | Partial | Amazon's own lookup is press-and-hold [K1]. No official selection API or text export for the selected word was found. |
| Contractually or legally uncertain | Yes | DRM-circumvention clause [K16] and data-mining/robots clause [K17] exist. Whether OCR or glyph mapping counts as circumvention or extraction is not decided by any source. |
| Suitable for production | Not supported | No platform statement permits it. All precedents are third-party. |

---

## 2. Kobo Web Reader (readnow.kobo.com, "Read Now")

### A. Rendering
- **Kobo documents nothing about rendering.** The help page covers availability only: signed-in account, "Read Now" button on supporting titles, Chrome/Edge/Firefox/Safari, no audiobooks, and Japan limited to fixed-layout books [N1][OWN].
- **CastReader claims** Kobo "renders each chapter as a separate iframe inside a horizontal spread". It describes same-origin iframes with `srcdoc` HTML, CSS-column pagination, and says `document.body` is empty with text in `iframe.contentDocument` trees [N2][VENDOR].
- **Fixed-layout books** (comics, manga) are the affected case. The help page confirms they are served in Japan [N1], and a Good e-Reader summary mentions per-page loading for comics [3P]. The rendering mechanism for them is not stated.
- **Reflowable DOM text is claim-only.** No platform source and no independent source confirms it.

### B. Selection
- **Jan 2023 review [N3][3P]:** it said there was no way to highlight or look up words in the dictionary.
- **Late-2024 Good e-Reader article (date inferred, not shown) [N4][3P]:** Kobo said it would soon add a four-colour highlighting feature and an Annotations List. It does not mention a dictionary.
- **Kobo's current help page [N1]:** silent on highlights, dictionary and selection.
- **Unknown:** whether platform popups appear, whether `getSelection()` works, and whether copying is limited. No source addresses them.

### C. Terms
- **Kobo Terms of Use were not read** (403 on authorize.kobo.com). So automated access, circumvention, extraction, reverse engineering and third-party tools are **not established** from a primary source.
- **From search-result excerpts of the Terms of Sale (www.kobo.com/termsofsales), not directly fetched [N5][OWN, unverified]:** the Service sells licenses to "Digital Content", for personal and non-commercial use. The excerpt says users may not "modify, transmit, publish... reproduce, create derivative works from, distribute" it. Circumvention and reverse engineering are not mentioned in that excerpt.
- **From a search-result excerpt of the Privacy Policy [N6][OWN, unverified]:** account holders "gain no right to copy or transfer" the content.
- **kobodl README [N7][3P, project author's own interpretation]:** it quotes a provision against forging headers or identifiers. It says it is unclear whether the tool violates the Terms.

### D. Extension precedents (claim-only)
- **Kobo eBook to PDF Downloader (Chrome Web Store, v2.2.0, updated 2026-08-30, 190 users) [N8]:** it clicks "next page" and captures each page as a screenshot, then builds a PDF. It runs on readnow.kobo.com and related Kobo domains. Permissions were not shown on the page. This is screenshot-based, which is a different goal from lookup.
- **CastReader Kobo page [N2]:** DOM text via same-origin iframes. It says it "does not download files, decrypt content, or bypass DRM" [VENDOR claim].
- **eReader Web Tools:** the only evidence is a search summary saying it "copies and translates text on Kindle and Kobo readers" [3P]. The scan page returned 403 and the method is unknown.

### E. Official interfaces
- **Export Annotations on kobo.com:** My Books → Actions → Export Annotations, producing PDF, HTML, TXT or Markdown, downloadable from the Annotations tab [N9][OWN].
- **Limits on export:**
  - Only Kobo or Kobo Plus purchases qualify.
  - "Exporting markups isn't currently supported."
  - It depends on author approval and may not work for every book.
  - Files are kept in the account for 30 days.
- **Not established:** whether the export can be done from the Web Reader itself, and any API.

### F. Classification

| Level | Public evidence | Reasoning |
|---|---|---|
| Technically possible | Plausible, claim-only | The same-origin-iframe description [N2][VENDOR] would make DOM text reachable. Not independently confirmed. |
| Demonstrated by someone | Yes, claim-only | Screenshot-based [N8] and iframe-based [N2] tools exist. |
| Permitted by ordinary platform interfaces | Not shown | Selection and popup behaviour is undocumented. The export route is a separate user-initiated feature [N9]. |
| Contractually or legally uncertain | Yes | The Terms of Use were not read. Terms of Sale excerpts restrict reproduction. |
| Suitable for production | Not supported | |

---

## 3. Google Play Books web reader (play.google.com/books)

### A. Rendering
- **Google documents display modes only.** "Original pages" is a fixed layout usually matching print, and "Flowing text" is reflowable [G1][OWN]. "Not all ebooks offer more than one viewing option." The publisher help says original pages come from a PDF and reflowable from an EPUB [G2][OWN].
- **Frame structure [G3][3P, code reading by a userscript author]:**
  - The reader at `play.google.com/books/reader` posts messages to and from a rendering frame on `books.googleusercontent.com`.
  - The reader reads iframes' `contentDocument` only where same-origin, and cross-origin errors are caught.
  - Inside the rendering frame the script reads `innerText` and `aria-label`, suggesting DOM text there. This is an inference from page-number detection code, not from book text.
  - The script does not read canvas content in reader mode.
- **Not established:** whether original-pages mode uses images/canvas, and any platform statement on architecture.

### B. Selection
- **Help-page statement (Android/iOS tab text, no desktop-tab statement read) [G4][OWN]:** when a list of options appears on highlighting a word, the book is in flowing text mode, which supports define, translate and search. A 2011 Google/third-party post says the same for the web reader (flowing text only, not scanned pages) [G5][3P and Google blog, older].
- **Computer help (search snippet) [G4]:** "In your browser, open a book. Select the words that you want to highlight." Define and translate steps were found only for the apps.
- **Copy limits [OWN]:**
  - Publishers set what share can be copied and pasted. Google recommends at least 10% for sale and at least 20% for rental [G2].
  - Highlights may be missing from the Drive notes if the publisher disabled copy-paste or the limit was exceeded [G4].
  - Google says it "uses proprietary content protection technology in Google readers on Android, iOS and Web" [G6].
- **Not established:** `getSelection()` behaviour. No source covers it.

### C. Terms (verify verbatim)
- **Google Play Terms of Service** (dated July 29, 2026, update effective Nov 5, 2026) [G7][OWN]:
  - Use: "for your personal, non-commercial use only"
  - Circumvention: "attempt to, or assist, authorize or encourage others to circumvent, disable or defeat"
  - Redistribution: "sell, rent, lease, redistribute, broadcast, transmit"
  - Ripping: "use Google Play or any Content in conjunction with any stream-ripping"
  - Modification: "attempt to modify any Content obtained through Google Play"
  - Reverse engineering: **silent** in this page, per the fetch summary
  - Third-party tools: **silent**
  - Data: "You must not collect or harvest any personal data of any user of Google Play" (users' personal data, not book text)
- **Google Terms of Service** (effective July 30, 2026) [G8][OWN]:
  - "using automated means to access content from any of our services"
  - "bypassing our systems or protective measures"
  - "reverse engineering our services or underlying technology"
  - These sit under "Don't abuse our services". Whether they bear on a user-side extension reading the page is not stated.

### D. Extension precedents
- **Legacy "Google Play Books" Chrome extension** (ID mmimngoggfoobjdlefbcabngfnmieonb): a search summary says v1.1.14 last updated 2017-02-08, with highlight, define, translate and search features, and reviews say it no longer works [3P]. The listing itself did not load.
- **Playbook Analytics (Greasy Fork userscript, MIT) [G3]:** it reads URL, title, `innerText` and `aria-label`, plus a frame-to-parent `postMessage`. It tracks reading progress and does not read book text.
- **TTS Ebook Reader (Chrome Web Store):** states it supports Google Play (search summary, 2023, 2.8 rating) [3P]. Its method is unknown.
- **No extension specifically targeting Play Books lookup** was found. General translate-on-selection extensions exist, with no evidence they work in the reader.

### E. Official interfaces
- **Notes, highlights and bookmarks:** synced to a Drive folder "Play Books Notes" as one Google Doc per book [G4][OWN]. Editing the generated doc and adding new notes later can delete the edits.
- **Computer export:** "Annotations → More → Export annotations", with a choice of collections or colours [G9][OWN, search snippet].
- **Limits:** publisher copy-paste limits and DRM, as above. Google lists "Book insights" responses as non-copyable [3P summary].

### F. Classification

| Level | Public evidence | Reasoning |
|---|---|---|
| Technically possible | Plausible, partly evidenced | A cross-origin rendering frame is reported [G3], and extensions can match its origin as the userscript does. Whether it exposes selectable text for book content is not shown. |
| Demonstrated by someone | Weakly | Only a progress-tracking userscript [G3] and a legacy Google extension (listing unread). No lookup tool was found. |
| Permitted by ordinary platform interfaces | Partial | Google's own define/translate appears in flowing-text mode, and the Drive export is official. |
| Contractually or legally uncertain | Yes | Circumvention clause [G7] and automated-access clause [G8] exist. Their application to a user-side extension is not stated. |
| Suitable for production | Not supported | |

---

## 4. Chrome Web Store policies (all platforms)

All quotes below are as returned by the fetch tool; verify verbatim.

- **Program Policies** (page dated 2025-05-22) [C1][OWN]:
  - "If your Product handles any user data, then you must post an accurate and up to date privacy policy."
  - "Extensions may only collect, use, or transmit user data that is necessary"
  - "Request access to the narrowest permissions necessary to implement your Product's features or services."
  - "Don't infringe on the intellectual property rights of others"
  - Scraped content: "They also apply to scraped content or otherwise automatically gathered user data." [C1; the same sentence appears in search-result excerpts of the Limited Use page]
- **Limited Use** (dated 2022-11-01) [C2][OWN]:
  - "Collection and use of web browsing activity is prohibited, except to the extent required"
  - "All other transfers, uses, or sale of user data is completely prohibited"
  - "Do not allow humans to read user data, unless:"
- **User Data FAQ** (page footer says "Last updated 2016-04-23", so it may be stale) [C3][OWN]:
  - It lists "Website content and resources" as an example of user data.
  - It gives "Clipping or scraping content from a website that the user visits" as an example of handling user data.
  - "The prominent disclosure and consent must occur within the Product's user interface."
- **Content scripts:** I found no policy text dedicated to content scripts reading page content. The relevant lines are the user-data ones above (website content counts as user data).
- **Kindle/Kobo/Play Books page content:** no store policy text was found that addresses third-party ebook readers specifically. The policies are silent on this.

---

## Cannot be established from public sources (needs an authorised live session)

1. Current DOM structure of each reader: text nodes, iframe origins, canvas/img use, shadow DOM, and which mechanism applies to which books.
2. For Kindle for Web: whether glyph-ID/canvas rendering applies to all books now, or whether scrambled-font text is present in the DOM for some; Print Replica, comics and children's books behaviour; and the date of the change to server-side rendering.
3. Whether `window.getSelection()` returns text, and whether the platform's own popups appear, in each reader and for each book type. This covers flowing text vs original pages on Play Books and reflowable vs fixed-layout on Kobo.
4. Whether Kobo Web Reader currently has highlights or a dictionary, and when they shipped.
5. Per-book copy and export limits: Kindle's percentage (sources conflict), Play Books per-publisher percentage, Kobo author approval.
6. The text of the Kobo Terms of Use clauses on automated access, circumvention, extraction, reverse engineering and third-party software. The page returned 403.
7. Whether Amazon's Conditions of Use software and agent clauses apply to Kindle for Web and to a user-side extension.
8. Whether any platform treats user-initiated, on-screen, selection-only reading by an extension as within or outside its terms. No source says.
9. Whether the Chrome Web Store would accept an extension of this type; no review precedent was found. Several precedents are listed, but their continued availability and enforcement history are unverified.
10. Whether the Kindle Optimizer and Readertools extension listings still exist. They did not load.
11. Official Amazon pages on Kindle notes export, email and share limits (not retrieved), and any Kindle for Web feature list beyond the help-index pages.
12. Whether Play Books computer help includes define/translate on desktop. The desktop tab text was not retrieved.
13. Stability of all of the above: the Kindle renderer reportedly changed more than once, and nothing in public sources promises stability for any of the three platforms.

---

## Table of citations (all fetched 2026-10-08)

| ID | URL | Title | Type |
|---|---|---|---|
| K1 | https://read.amazon.com/landing | Amazon Kindle landing page ("now known as Kindle for Web", press-and-hold lookup) | OWN |
| K2 | https://digprjsurvey.amazon.com/csad/help/node/GH7AETGPYT6J7RNB | Kindle for Web App Help (index; mirror) | OWN |
| K3 | https://digprjsurvey.amazon.com/csad/help/node/TdBeNrSrTNVBE7vnyP | Add Notes in Kindle for Web (mirror) | OWN |
| K4 | https://digprjsurvey.amazon.com/csad/help/node/TS3oZMNGd9T0s62hVd | View Your Notebook in Kindle for Web (mirror) | OWN |
| K5 | https://press.aboutamazon.com/2011/8/introducing-kindle-cloud-reader | Introducing Kindle Cloud Reader (search result only, not fetched) | OWN |
| K6 | https://gist.github.com/1346968 | Cloud Reader copy bookmarklets, comments 2013–2024 | 3P |
| K7 | https://github.com/ccimpoi/ACRExtensions/blob/master/README.md | ACRExtensions (not working anymore) | 3P |
| K8 | https://noh.am/en/posts/kindle-web-reader-pages/ | Kindle web reader pages (Oct 19, 2025) | 3P |
| K9 | https://castreader.com/kindle-cloud-reader-text-to-speech | CastReader Kindle Cloud Reader TTS (reviewed 2026-05-23) | VENDOR |
| K10 | https://castreader.com/kindle-cloud-reader-not-reading-aloud and https://korben.info/en/amazon-turns-ebooks-into-unreadable-manuscripts.html | CastReader / Korben (Korben returned 403; seen only via search summary) | VENDOR / 3P |
| K11 | https://kdp.amazon.com/help/topic/GMUKXSTBCN6F2TGM | KDP help topics on Print Replica (search result only) | OWN, unread |
| K12 | https://castreader.com/kindle-cloud-reader-not-reading-aloud | Why Kindle for Web not reading aloud | VENDOR |
| K13 | same as K12 (user reviews, 2026-04-10/11) | Chrome Web Store reviews quoted there | 3P |
| K14 | https://help.readwise.io/article/47-why-are-my-kindle-highlights-truncated-ellipses | Why are my Kindle highlights truncated (search summary) | VENDOR |
| K15 | https://glasp.co/posts/how-to-copy-and-paste-kindle-highlights-beyond-the-export-limits | Glasp post (Feb 20, 2026) | VENDOR |
| K16 | https://digprjsurvey.amazon.com/csad/help/node/201014950 | Kindle Store Terms of Use (updated June 30, 2026; mirror) | OWN |
| K17 | https://digprjsurvey.amazon.com/csad/help/node/GLSBYFE9MGKKQXXM | Amazon Conditions of Use (updated Aug 14, 2026; mirror) | OWN |
| K18 | https://chrome.google.com/webstore/detail/afeijlgmanpjidpdpbdjjhphchafgccg and https://chrome.google.com/webstore/detail/aicjkkmjijnlncpkailhjcdfkechjbpl | Kindle extension listings (search results only, not fetched) | 3P |
| K19 | https://addons.mozilla.org/en-US/firefox/addon/textmuncher/ | TextMuncher (v2.0.3, Sep 22, 2026) | VENDOR |
| N1 | https://help.kobo.com/hc/articles/4408228476567 | Kobo Web Reader help | OWN |
| N2 | https://castreader.com/listen-to-kobo | CastReader Kobo page | VENDOR |
| N3 | https://blog.the-ebook-reader.com/2023/01/17/kobo-has-launched-a-new-web-reader-to-read-ebooks-online/ | Kobo web reader launch review (Jan 17, 2023) | 3P |
| N4 | https://goodereader.com/blog/?p=392706 | Good e-Reader Kobo web reader update (undated, around Dec 2024) | 3P |
| N5 | https://www.kobo.com/termsofsales | Kobo Terms of Sale (search excerpt only, not fetched) | OWN, unverified |
| N6 | https://authorize.kobo.com/terms/privacypolicy | Kobo Privacy Policy (search excerpt only, not fetched) | OWN, unverified |
| N7 | https://pypi.org/project/kobodl/0.9.2 | kobodl README | 3P |
| N8 | https://chromewebstore.google.com/detail/idmfhkbkohimddkfdnaicheddbefdhkm | Kobo eBook to PDF Downloader (v2.2.0, Aug 30, 2026) | VENDOR |
| N9 | https://help.kobo.com/hc/en-us/articles/29991333812631-Export-annotations-from-your-books | Export annotations from your books | OWN |
| G1 | https://support.google.com/googleplay/answer/185545 | Buy and read ebooks - Computer | OWN |
| G2 | https://support.google.com/books/partner/answer/166501 and https://support.google.com/books/partner/answer/3316879 | Publisher program policies; display modes | OWN |
| G3 | https://greasyfork.org/scripts/575341-playbook-analytics/code | Playbook Analytics userscript | 3P |
| G4 | https://support.google.com/googleplay/answer/3165868 | Add bookmarks, notes and highlights in an ebook | OWN |
| G5 | https://translate.googleblog.com/2011/05/define-translate-and-search-for-words.html and https://blog.the-ebook-reader.com/2011/05/20/google-ebooks-web-reader-gets-dictionary-translate-and-search | 2011 web reader dictionary/translate (search summaries) | OWN blog (older) / 3P |
| G6 | https://support.google.com/books/partner/answer/166501 | Content protection line (same page as G2) | OWN |
| G7 | https://play.google.com/about/play-terms/ | Google Play Terms of Service (July 29, 2026) | OWN |
| G8 | https://policies.google.com/terms | Google Terms of Service (effective July 30, 2026) | OWN |
| G9 | https://support.google.com/googleplay/answer/3165868 (computer tab, via search snippet) | Export annotations (search-snippet text) | OWN |
| C1 | https://developer.chrome.com/docs/webstore/program-policies/policies | Chrome Web Store Program Policies (2025-05-22) | OWN |
| C2 | https://developer.chrome.com/docs/webstore/program-policies/limited-use | Limited Use (2022-11-01) | OWN |
| C3 | https://developer.chrome.com/docs/webstore/program-policies/user-data-faq | User Data FAQ (footer: 2016-04-23) | OWN |

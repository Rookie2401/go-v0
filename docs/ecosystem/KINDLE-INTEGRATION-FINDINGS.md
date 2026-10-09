# Kindle integration findings

Status: live inspection on 2026-10-08 of Kindle for Web (read.amazon.com) in the owner's own, already signed-in
Chrome session, on a title the owner owns (a Spanish-language commercial novel, 346 pages). The lead drove the
session; no credential was typed, stored or read; no network payload, cache, IndexedDB or script state was inspected;
no book text was copied out of the page. Every observation below is from the rendered DOM as any extension content
script would see it, with `document.querySelector`, `elementsFromPoint`, `window.getSelection()` and a text-node
tree walker. Where a question could not be answered without going beyond that, it says so. Public-source findings
(terms, precedents) are summarised in §6 and documented with citations in `annex/E-reader-platform-research.md`.

## 1. What the reader is (as observed)

- Single-page application built on Ionic (`ION-APP.kr-fullpage-app`, `ION-SPLIT-PANE`, `ION-POPOVER`,
  `ION-HEADER#reader-header`), 30 shadow-DOM hosts (all Ionic UI components), 123 elements while reading.
- The book is rendered by a component rooted at `DIV#kr-renderer.kg-client-root` containing `DIV.kg-view`.
- **The page spread is one bitmap.** Inside `kg-view` there is exactly one `IMG` (`DIV.kg-full-page-img > IMG`)
  with a `blob:` source, natural size 2050 x 1182 px, displayed at 1367 x 788 CSS px covering the two visible pages.
  The renderer subtree has **0 text nodes**, 0 `canvas`, 0 `svg`, 0 `iframe`. Its tag histogram is `{DIV: 8, IMG: 1}`.
- Turning the page (`ArrowRight`) replaced the `IMG` with a new element of the same natural size (element identity
  changed, count stayed 1, renderer text nodes stayed 0; footer read "Page 7 of 346 - 1%").
- Above the renderer sits `DIV.kr-interaction-layer-fullpage > DIV.pagination-container` (height 938 px), the
  topmost element at every point over the text. Pointer events are handled by this layer, not by text.
- The 11 "long" text nodes elsewhere in the document are UI strings (menus, footer), not book text.

Consequence: there is no DOM text to select. The text is visible to the eye only, exactly like a picture. This
matches the third-party reports (annex E, K7/K8) that the reader moved to server-side page rendering; those reports
differ on the mechanism (canvas-to-image vs scrambled fonts), and only the bitmap outcome was observed here.

## 2. Selection behaviour (as observed)

| probe | result |
|---|---|
| `window.getSelection()` before any gesture | `type: "None"`, `rangeCount: 0` |
| double-click on a word (user gesture through the automation cursor) | native selection unchanged (`None`, 0 characters); the reader drew its **own** overlay `DIV.kg-selection` (57 x 26 px, no children, no text) and opened its own `ION-POPOVER.selection-popover` |
| drag across several words on one line | native selection still `None`; three `kg-selection` rectangles (78, 4 and 64 px wide; empty elements); popover opened |
| `Escape` | overlay removed, popover closed |
| `getSelection()` on each of the 30 shadow roots | no selection anywhere |

The reader's popover for a single word offered four highlight colours, **Copy**, **Note**, a dictionary tab
("Español") and "Full Definition". Its dictionary panel is ordinary DOM text (the headword and definition were
readable as the popover's `innerText`). That is the reader's UI, not the book, and it shows the dictionary's
*headword*, not necessarily the learner's exact selection. For the multi-word drag the popover was open but had
rendered no buttons or text after 3 s (loading or no entry; not pursued).

## 3. Answers to the integration questions

| question | answer | evidence |
|---|---|---|
| Can the user select text? | Yes, visually, through the reader's own overlay; **no** as a DOM selection | §2 |
| Can an extension read the selected text? | **No** via `getSelection()` (always empty). The only text that appears is the reader's own dictionary popover headword, nothing for phrases | §2 |
| Can the sentence context be read? | **No.** The page is an image; there are no text nodes | §1 |
| Adjacent context (previous/next sentence)? | No | §1 |
| Stable anchors (locators)? | The reader has positions ("Page 7 of 346", Kindle locations in its UI) but exposes no DOM anchor for a selection; the overlay rectangles are pixels | §1-2 |
| Popup positioning at the selection? | Only from the overlay rectangle (`kg-selection`), an internal class name that can change at any time | §2 |
| Layout changes? | A page turn replaces the image element; any pixel anchor is void after it | §1 |
| Persistent annotation? | The reader's own highlights and notes; no extension API | §2 |
| Offline? | Not tested | - |
| Content restrictions? | The book text is never in the DOM as text; the Copy button is publisher-limited (public sources conflict on the percentage; annex E K14/K15) | §1, annex E |
| Permissions an extension would need? | `activeTab` on read.amazon.com after a user gesture; it would still obtain nothing useful | - |
| User-triggered bridge? | The reader's own **Copy** (clipboard, under publisher limits) and **Notes & Highlights** (`read.amazon.com/notebook`): both official, user-initiated, carrying what the user chose, not sentence context | §2, §4 |
| Does the generic web adapter work here? | **No**, and it must say so: `selection()` returns nothing; the extension shows its "unsupported reader" line | prototype |

## 4. Official surfaces that could serve a selection bridge (not built)

- **Copy** in the selection popover (not clicked in this session, to leave the owner's clipboard untouched). A
  "copy in Kindle, paste into GoLearn" flow is possible as a manual bridge with the clipboard as carrier, without
  sentence context unless the learner copies the sentence, and under Kindle's copy limits.
- **Notes & Highlights** (`read.amazon.com/notebook`): opened in the owner's session. It is an ordinary DOM page
  (28 long text nodes, no iframe, no canvas; ids `kp-notebook-library`, `kp-notebook-annotations-pane`,
  `annotations`), showing "It looks like you haven't created any notes just yet" because the owner has none. A
  highlight the learner makes in Kindle is later visible there as text, which a user-initiated import could read.
  No export control was visible on the empty page (a Settings link only).

Neither bridge yields the sentence around a word unless the learner selects the sentence. Neither is an API; both
are ordinary pages whose structure Amazon can change without notice.

## 5. What was NOT done, deliberately

- No reading of network responses, caches, IndexedDB or JavaScript state of the reader (reconstructing the book from
  application state is forbidden by the directive and by the owner's rule).
- No OCR of the page bitmap (screen-scraping to bypass the reader's restriction is forbidden).
- No clicking of Copy / highlight / note (would write to the owner's clipboard or Kindle account).
- No Print Replica, fixed-layout or comics title (none in the library).
- No Firefox/Safari and no Kindle apps (out of scope: the browser-extension path only).

## 6. Terms and policy position (public sources; see annex E for quotes and URLs)

- The Kindle Store Terms of Use forbid attempts to "bypass, modify, defeat, or otherwise circumvent any digital rights
  management system" and limit use to "personal, non-commercial use" through Kindle software or as otherwise
  permitted; they are silent on extensions and automated access. Amazon's Conditions of Use exclude "data mining,
  robots, or similar data gathering and extraction tools" and forbid bypassing security associated with Amazon
  software. Whether a user-side extension reading the user's own session falls under these is **not stated** by any
  source; a rights lawyer must answer it before any production claim.
- Any technique that reaches the text (OCR of the bitmap, decoding the renderer's glyph data, reading its network
  tar) is at minimum contractually uncertain and is excluded from this product by principle 11 of the charter.
- The Chrome Web Store treats "website content" read by an extension as user data (prominent disclosure and consent
  required; narrowest permissions; no scraped content beyond what the feature needs).

## 7. Classification

**Technically blocked for contextual analysis; selection bridge potentially viable through the reader's own Copy and
Notebook features, unverified end to end; contractually unresolved for anything beyond that.**

The DOM-selection path that works on ordinary pages and on the controlled EPUB reader does not exist here: Kindle
for Web renders pages as bitmaps and keeps the text out of the document. No permitted technique can give an extension
the word under the cursor or its sentence. A product claim of "works in Kindle" would be false. The honest statement
is: GoLearn can receive a word or passage the learner *copies* from Kindle, under Kindle's own copy limits, and can
read highlights the learner has made in their own Kindle notebook, if a user-initiated import is built and verified.

## 8. Manual validation procedure (owner, authorised session)

Precondition: the owner is signed in to read.amazon.com in their own browser with a title they own. Nobody else
enters credentials. Record the date, browser version and the reader footer ("Page x of y").

1. **Bitmap check.** DevTools > Elements, find `#kr-renderer`. Expected: one `IMG` with a `blob:` URL and no text
   nodes. If text nodes appear (Amazon changed the renderer), stop and report; the classification must be redone.
2. **Native selection check.** Double-click a word; in the Console run `window.getSelection().toString().length`.
   Expected `0`. Record the value.
3. **Overlay check.** With the word selected, run `document.querySelectorAll('.kg-selection').length` and list the
   popover buttons. Record them.
4. **Copy bridge.** Select one short sentence, click Copy, paste into a plain text field (the GoLearn demo reader).
   Record whether the pasted text equals the selection and whether Kindle shows a copy-limit notice. Repeat with a
   40-word selection. Delete the pasted text afterwards.
5. **Notebook bridge.** Make one highlight, open `read.amazon.com/notebook`, confirm it shows as text, note any export
   options, then delete the highlight.
6. **Page-turn check.** Press the right arrow and repeat step 1; confirm the `IMG` is a new element.
7. **Print Replica / fixed layout.** If such a title is owned, repeat steps 1-3 on it.
8. Report each step as pass / fail / changed, with screenshots showing only UI chrome.

Until the owner has run steps 4-5, the Copy and Notebook bridges stay "potentially viable, unverified". Steps 1-3
and 6 were performed by the lead on 2026-10-08 with the results in §1-2.

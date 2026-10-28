# Accessibility audit: GoPractice, GoTell, the GoLearn setup app, the lookup card, the action popup (brief §24)

Date: 2026-10-09. Owner of this file and of `test/audit/a11y.*`: the performance and accessibility audit session (its sibling is `PERFORMANCE.md`).
Remediation: 2026-10-09 (same day, a later session). **All 21 defects are fixed** (A-11 and A-14 with a stated limit, section 7); the product code, the stylesheets and the tests below were changed for that. Sections 2 to 6 describe what the audit found BEFORE the remediation; section 7 gives the status and the proving test of each defect.
Suite: `npx vitest run test/audit/a11y.*.test.ts --reporter=dot` → **4 files, 78 tests, all green, none of them `it.fails`** (the 23 defect tests were flipped to plain `it`); more tests for the new behaviour live in `test/goreview-app/a11y-fixes.test.ts` (15), `test/golearn-app/settings.test.ts` (+4), `test/extension/actionPopup.test.ts` (+2) and `test/goreview/exercises/grading.test.ts` (+2).

## How to read this

The checks are static or run in jsdom over the REAL screens (the same rigs as `test/goreview-app`, `test/gotell-ui`, `test/golearn-app`, `test/extension`). Each test states the **correct** behaviour. Where the product does not have it yet the test is written with `it.fails` and its title begins `DEFECT A-nn`: it passes while the defect exists and turns red the day the defect is fixed, which is the signal to delete `.fails`. The title of the rest begins with the check id (A-C… stylesheets, A-K… contrast, A-S… screens, A-D… card and focus, A-U… Unicode).
Every defect test was run once with `.fails` removed to prove it fails on the assertion it names and not on a setup error.

**jsdom is not a screen reader.** It has no accessibility tree, no layout, no cascade for linked stylesheets and no real focus rules for hidden elements. The audit computes a simplified accessible name (aria-labelledby, aria-label, `<label>`, content, `alt`, `value`; `title`/`placeholder` are reported as weak) and says so in section 6. Section 7 lists what a manual NVDA pass must check. The auditor itself is tested (A-S08): on a deliberately broken page it reports 27 findings in 19 rules, so "no findings" elsewhere means something.

| target | how it was mounted | states audited |
|---|---|---|
| GoPractice shell and GoReview (`packages/goreview/app/screens/**`) | `makeRig` / `makeTellRig` (fake service, real app) | sign-in; review home (also with every `<details>` open, and after "Test now"); a session through **all five exercise families**, question and feedback of each; session summary; transfer; history |
| GoTell (`screens/tell/**`) | `makeTellRig` | home; prompts; writer (empty, analysed, with the help ladder open); goals; privacy; Settings |
| GoLearn setup app (`packages/golearn-extension/app/**`) | `test/golearn-app` rig | all ten screens, signed out and signed in (20 states) |
| lookup card (`src/popup/card.ts`, closed shadow root) | `createCardUI` + `parseSelection` | closed, every layer + correction form + More open, message state, no-voice state |
| action popup (`action/popup.html` + `popup.ts`) | the real HTML and `initPopup` over the chrome fake | one state |
| stylesheets | read as files: `gopractice/styles.css`, GoTell `screens/tell/styles.ts`, `app/styles.css`, the CSS literal in `card.ts`, the `<style>` of `popup.html` | 5 sheets |

Total: **51 screen states (30 GoPractice, 20 setup app, 1 popup) and the card's states; 902 interactive controls inspected.**

## 1. Headline

The product was built with accessibility in mind and it shows. On 902 controls in 51 screen states: **no control without an accessible name, no field without a label, no non-native control without a role and tabindex, no positive tabindex, no duplicate id, one `main` and one `h1` per screen, no unnamed navigation landmark, no image without `alt`, status text always in a live region, identity fields carry `autocomplete`, radio groups in the screens are in a fieldset with a legend**. Route changes move focus to the screen (`main#screen`, `tabindex="-1"`) and set the document title; a session moves focus answer box → Next → next answer box; the lookup card takes focus, keeps Tab inside, closes on Escape and gives focus back. Text scaling and dark mode are handled in the two application stylesheets (rem/em except one root declaration, `prefers-color-scheme`, `:focus-visible` 3px ring, transitions only under `prefers-reduced-motion: no-preference`). Devanagari and Thai strings reach every renderer unchanged, with `lang` and `dir` set in GoPractice.

**Status: all twenty-one were fixed on 2026-10-09 (section 7); the paragraph below is the finding as made.** Twenty-one defects, none blocking: one is **serious for the languages it affects** (A-17: the answer normaliser strips a final vowel sign, so a Hindi or Thai answer that differs only in its last sign is graded correct; Hindi and Thai are planned packs, so it is latent today), five concern WCAG Level A/AA criteria that the product misses by design choices (A-08 one-key shortcuts that cannot be turned off, A-11 and A-07 Albanian words with no `lang`, A-03 field boundary contrast, A-09 a ticking clock that cannot be hidden), the rest are low-severity polish.

## 2. Names, labels, structure, ids (`a11y.screens.test.ts`, `a11y.card.test.ts`)

Rules with **no finding on any screen** (A-S11): `control-name`, `field-label`, `role-not-focusable`, `focusable-no-role`, `positive-tabindex`, `duplicate-id`, `main-landmark`, `h1-count`, `nav-name`, `img-alt`, `radio-group-name`, `autocomplete`, `status-not-live`, `script-without-lang`, `target-lang`, `dialog-name`, `empty-heading`.

Findings (all of them; counts are over the 51 states, so one defect appears in several states):

| rule | severity | count | where | defect |
|---|---|---:|---|---|
| `dangling-reference` | serious (by rule) | 2 | Settings: `section#settings-sync` `aria-labelledby="sync-h"`, `section#settings-diagnostics` `aria-labelledby="diag-h"` | A-10 |
| `embedded-target-word` | minor per instance | 43 | review home 17, session 18, transfer 7, GoTell writer 1 | A-11 |
| `repeated-name` | minor | 19 | review home (Dismiss ×10, History ×6, Snooze a day ×6, Suspend ×6), tell prompts (Write with this prompt ×5), setup app home (Change ×5), pack (Install ×3, Re-verify ×3) | A-20 |
| `heading-skip` | minor | 1 | history screen: `h1` then `h3` | A-19 |
| `target-lang` / `embedded-target-word` | serious / minor | 2 | **card**: the selected word (`div.word`) and the lemma row have no `lang` | A-07 |
| `radio-group-name` | moderate | 1 | **card** correction form: the reading choices are not in a fieldset or a labelled radiogroup | A-18 |

Disclosure widgets: the five layer buttons, the correction button and "More" keep `aria-expanded` in step with their panel (A-D04); none has `aria-controls` (A-12).

## 3. Focus, dialogs, keyboard (`a11y.card.test.ts`, `a11y.screens.test.ts`)

| check | result |
|---|---|
| focus order follows the DOM | **pass**: no positive `tabindex` anywhere (0 findings in 51 states), no CSS `order:` or reversed flex direction in any stylesheet; the popup's tab sequence is its DOM sequence |
| visible focus style exists in the CSS | **pass** for GoPractice, GoTell (also for the visually hidden mode radios, through `label:has(input:focus-visible)`), the setup app (`:focus-visible { outline: 3px solid var(--focus) }`) and the card (`button:focus-visible, input:focus-visible { outline: 2px solid }`). The action popup declares none and relies on the browser's default ring (A-C03, check in the browser). Outlines are removed only from containers that receive script focus (`.screen:focus`, `.card:focus`). |
| card: focus moves in, Tab wraps, Escape closes, focus returns | **pass** (A-D06): `show({ focus })` puts focus on the first control, Tab on the last control wraps to the first and Shift+Tab the other way, Escape dismisses and focus returns to the control that had it; the close button and a click outside do the same (A-D07) |
| card opened without the focus option (a selection lookup) | leaves focus on the page; the result goes to a polite live region ("Encounter recorded."). The dialog itself is not announced (A-D08, observation O-03) |
| route change | **pass**: focus on `main#screen`, document title "GoPractice — Settings" / "GoLearn — Privacy" (A-D11, A-D12) |
| session | **pass**: answer box has focus on item 2, Next has focus when the feedback appears (A-D13); Escape skips, 1–4 answer, Space plays; typing in a field is never intercepted |
| entering a session | focus ends on `<main>`, not in the answer box of the first item: the router focuses `main` after the screen has rendered (A-16) |
| GoTell "Delete" on a draft | the row's buttons are hidden and focus is left on a button that no longer exists (A-15) |
| character-key shortcuts | digits 1–4 and Space act from anywhere on the page during a session and there is no setting to turn them off (A-08, WCAG 2.1.4) |
| time | no time limit: the session length is a planning budget, nothing expires. A visible clock updates every second, is not a live region, and cannot be hidden (A-09, WCAG 2.2.2) |

## 4. Language, text scaling, colour

### 4.1 `lang` on target-language text

GoPractice marks target-language text with `lang` and `dir` through one helper (`langProps`): stimulus, sentence gap, choices, typed answer box, reference answer, candidate and deck labels, GoTell sentences and corrections (Hindi, Thai and Albanian all verified: A-U03). The setup app marks the language name and the tutorial sentences. Gaps: the **card** never sets `lang` on the word or lemma (A-07); Albanian words **inside English sentences** (a reason line, "The word is zog.", "Added det to your deck.", the item line "zog · Meaning to word", a transfer measure) are not wrapped (A-11, 43 instances). Both are WCAG 3.1.2 (AA): the screen reader reads the Albanian with the English voice.

### 4.2 Text scaling: font-size units (`a11y.css.test.ts`)

| stylesheet | font-size declarations | px | rem | em | note |
|---|---:|---:|---:|---:|---|
| GoPractice `styles.css` | 19 | **1** | 16 | 2 | the one px is `:root { font: 16px/1.5 … }` |
| GoTell workspace styles | 11 | 0 | 11 | 0 | |
| setup app `styles.css` | 19 | **1** | 16 | 2 | the same root declaration |
| lookup card (shadow DOM) | 16 | **16** | 0 | 0 | 10 px (`.tag`), 11 px (`.brand`), 12 px (`.k`, `.status`, `.feedback`, `.note`, `.more h4`), 13 px (buttons, tables), 14 px, 16 px, 20 px |
| action popup | 7 | **7** | 0 | 0 | 11 px (`.proto`, textarea), 12 px, 13 px, 15 px |

Browser zoom works everywhere (the pages reflow, `width: min(340px, calc(100vw - 16px))` for the card). A root size in px ignores the browser's *default text size* setting (A-01); the card and the popup do so throughout and use text as small as 10–11 px (A-02).

### 4.3 Contrast (WCAG 2.x AA: 4.5:1 text, 3:1 non-text)

Computed from the colour values in the stylesheets (tokens of `:root` and the dark block, `color-mix` composited over the page, `opacity` blended, the literal colours of the card and the popup), light and dark. **146 pairs, 14 fail** (the 5 disabled-control pairs are excluded: disabled controls are exempt).

Pairs that pass (ratio light / dark): body text on page 15.75 / 15.07; on panel 16.89 / 13.63; secondary text (`--muted`) on page 6.23 / 7.51, on panel 6.68 / 6.80, on a notice 6.20 / 5.31; links 6.28–6.73 / 7.08–7.82; primary button 6.84 / 8.09; success 5.99–6.42 / 9.01–9.96; error 7.48–8.02 / 7.90–8.73 (on a notice 7.44 / 6.18); tag 11.33 / 9.90; current navigation 12.44 / 11.29; GoTell issue mark 11.48 / 10.59, diff added 11.75 / 9.70, removed 11.48 / 10.59, assistance step 14.24 / 13.46, warning badge 6.20 / 5.31; focus ring (shell) 4.97–5.33 / 8.76–9.68. Card: text 16.89 / 12.82; its faded lines (`opacity` .65–.85) 5.30–10.66 / 6.28–9.66 (lowest: row key `.k` 5.30 light); tag 6.09 / 7.24; button 14.81 / 10.35; error 8.02 / 7.44. Popup: error 6.57 (light), sub-title/hint/protocol 6.98–10.41 / 8.26–10.71.

Failing pairs:

| pair | light | dark | defect |
|---|---:|---:|---|
| text-field border `--line` on the page (the only visible boundary of an input), GoPractice and setup app | 1.37 | 1.60 | A-03 |
| button border `--line` on a panel, GoPractice and setup app | 1.47 | 1.44 | A-03 |
| card button border | 2.07 | 2.25 | A-03 |
| card focus ring (`#2b6cb0`, the same in both schemes) on the dark card | 5.33 (pass) | **2.79** | A-04 |
| action popup error text and warning status (`#b42318`) on the system dark canvas (`#121212`) | 6.57 (pass) | **2.85** | A-05 |
| a candidate "kept for later" (opacity .75): reason text in `--muted` | **3.55** | 4.77 (pass) | A-06 |
| *excluded, disabled controls (opacity .5)*: ink on panel 3.30 / 4.46; card button 3.20 / 3.86 | | | information |

A forced-colors (Windows High Contrast) rule exists in none of the five stylesheets (O-01).

## 5. Unicode: Devanagari and Thai (`a11y.unicode.test.ts`)

Eight strings written from code points (so no tool can normalise them): four Devanagari (a conjunct with a final vowel sign ी, a nukta form, a conjunct with ZWJ, "kitāb") and four Thai (a word with ไ, "nangsue", a tone mark + sara am, a word ending in a vowel sign ี).

| check | result |
|---|---|
| card: surface, `aria-label`, the sentence, all layers open | **pass** × 8 (A-U01): `.word` equals the NFC input, no `U+FFFD`, every Devanagari/Thai run in the card is a substring of the source sentence, grapheme clusters (`Intl.Segmenter` for hi and th) identical and in order |
| GoPractice review: deck row, candidate labels, stimulus, history | **pass** for hi ×2 and th ×2 (A-U03): label unchanged, the element carries `lang="hi"`/`"th"`, `dir="ltr"`, no `U+FFFD`; the stimulus graphemes equal the input's |
| font stack for the script | `.target-text` names Noto Sans Devanagari, Noto Sans Thai and Noto Naskh Arabic (A-U04); a fallback applies if the user has none installed (not measurable here) |
| typed answer, precomposed vs decomposed nukta | **pass** (A-U05): U+095B typed against the key U+091C U+093C is graded Correct (the normaliser applies NFC) |
| card sets `lang` on the word | **no** (A-U02, defect A-07); `dir="auto"` is set |
| **final vowel sign or tone mark in an answer** | **defect A-17**: `normalizeAnswer` strips every trailing character that is not a letter or number (`/[^\p{L}\p{N}]+$/`), and Devanagari vowel signs and Thai tone marks are combining marks (`\p{M}`). Of the 8 samples 3 are altered: हिन्दी → हिन्द, ज़िन्दगी → ज़िन्दग, สวัสดี → สวัสด. Because the key and the answer are normalised the same way, a wrong answer that differs only in its last sign (हिन्दू for हिन्दी) is graded **correct** (A-17b). Latin-script packs (Albanian, Spanish) are unaffected; `gotell` uses `[\p{L}\p{M}\p{N}]` correctly. |

## 6. Audio-only interactions (`a11y.screens.test.ts` A-S06, `a11y.card.test.ts` A-D05)

| check | result |
|---|---|
| an audio question is a named group with named controls | **pass**: `role="group"` "Audio question"; "Play (Space)", "Replay (Space)", "I could not hear it" are buttons; the replay count is `aria-live="polite"`; the answer options are written |
| non-audio way out | **pass**: "I could not hear it" records nothing and claims nothing; "Include listening practice" is a labelled checkbox in Session controls (A-S07) |
| no voice on the device | **pass**: the review home says "not available: no Albanian voice is installed"; an audio card is then **asked in writing** and counted as reading (never as listening); the planner never fabricates audio |
| the card's Pronounce button without a voice | **pass**: disabled, with the visible note "No Albanian voice is installed on this device."; the card is text-first (meaning, form, grammar, sound notes) and works without audio. The note is not a live region (A-13). |
| transcript hidden before the answer | by design (assessment validity); a deaf learner uses "I could not hear it" or switches listening off |

## 7. Defects and their status

Severity: **serious** = blocks or misleads a user of assistive technology or gives wrong results; **moderate** = fails a WCAG A/AA criterion for a defined group; **low** = polish or best practice.
Status after the remediation of 2026-10-09: **all 21 are Fixed**; A-11 and A-14 are fixed with a stated limit (see their rows and "What is still open" below). Every `it.fails` of the audit was flipped to a plain `it` once its fix was real: **no `it.fails` is left in `a11y.*`**. Where the audit's own test could not see the fix, the test was corrected rather than weakened (A-04, A-05, A-06, A-18, A-D01, A-D10, A-U06: listed under the table).

| id | severity | status | where it was / what was wrong | fix (file) | proving test |
|---|---|---|---|---|---|
| A-01 | low | **Fixed** | `:root { font: 16px/1.5 … }` pinned the base size in px | `font: 100%/1.5 …` in `gopractice/styles.css` and `golearn-extension/app/styles.css` | a11y.css A-01 (both sheets) |
| A-02 | moderate | **Fixed** | all 16 card and 7 popup font sizes were px, down to 10 px | card (`popup/card.ts` CSS): base `0.875em` of the host element (which `all: initial` leaves at the browser's default text size, so it follows the setting; `rem` was not used because a page may set `html { font-size: 62.5% }`), everything else in `em` relative to it, the 10 px tag and 11 px brand raised to about 12 px, card width `24.3em`; popup (`action/popup.html`): `rem` throughout, smallest `0.75rem` (12 px), width `21.25rem` | a11y.css A-02 (no px font size in either sheet); actionPopup "A-02 / A-05" |
| A-03 | moderate | **Fixed** | field and button boundary `--line` 1.37–1.60:1, card button border 2.07–2.25:1 | `--line` is now the boundary of a control (light `#857f72`, dark `#7d7e8a`: 3.65–3.92:1 and 3.99–4.44:1); the old value lives on as the new `--divider` token for cards, rules, table lines and the other decoration (`gopractice/styles.css`, `app/styles.css`, `screens/tell/styles.ts`, where the selectable `.tell-mode` card keeps `--line`); card button border `#857e6e` light / `#8a8b96` dark (3.97:1 / 4.47:1) | a11y.css A-03 |
| A-04 | moderate | **Fixed** | card focus ring one literal blue, 2.79:1 on the dark card | dark block sets `outline: 2px solid #8ec5f5` (8.24:1) in `popup/card.ts` | a11y.css A-04 (the pair now reads the dark rule, see below) |
| A-05 | moderate | **Fixed** | popup `.err` / `.status-line.warn` `#b42318` on the dark canvas 2.85:1 | `@media (prefers-color-scheme: dark) { .err, .status-line.warn { color: #ff9a9a } }` (9.22:1) in `action/popup.html` | a11y.css A-05 (A-K04 now reads the dark rule for the dark scheme) |
| A-06 | low | **Fixed** | `.candidate[data-choice="later"] { opacity: .75 }` took `--muted` to 3.55:1 | the opacity is gone (the "kept for later" tag and a dashed start border mark the state) in `gopractice/styles.css` | a11y.css A-06 (the pair now reads the opacity from the sheet) |
| A-07 | moderate | **Fixed** | card `.word` and lemma without `lang` | `lang` = the card's language on `.word`, the lemma row, the word-by-word lists and the reading choices of the correction form (`popup/card.ts`) | a11y.card A-07, A-D10 |
| A-08 | moderate | **Fixed** | digits 1–4 and Space acted from anywhere, no way to turn them off (2.1.4) | a device switch "Keyboard shortcuts in a session" (default on) in the review preferences form, shown in GoReview home and in Settings (`screens/prefs.ts`, stored per device in `gopractice:ui` by `screens/uiprefs.ts`, not in `ReviewPreferences`, whose clamp lives in `state.ts`); `session.ts` `key()` ignores 1–4 and Space while it is off, and the button labels stop advertising the keys ("Play", "Again", choices without a number). Enter and Esc are not character keys and stay | a11y.screens A-08; gopractice a11y-fixes "turning the shortcuts off…" and "with the shortcuts on…" |
| A-09 | low | **Fixed** | `#session-clock` ticked every second and could not be hidden (2.2.2) | "Hide clock" / "Show clock" button in the session header and a "Show the clock in a session" switch in the preferences (remembered per device); the timer stops writing while hidden (`session.ts`). The clock was never a live region | a11y.screens A-09; gopractice a11y-fixes "the clock can be hidden…" |
| A-10 | moderate | **Fixed** | Settings sync and diagnostics sections lost the id of their heading on repaint | the repainted `h2` keeps `id="sync-h"` / `"diag-h"` (`screens/settings.ts`) | a11y.screens A-10; gopractice a11y-fixes A-10 (after "Sync now") |
| A-11 | moderate | **Fixed (with a limit)** | 43 Albanian words inside English sentences without `lang` | `embedTarget()` in `gopractice/dom.ts` wraps the words in `<span lang dir class="target-text">`; `setStatus()` accepts child lists. Applied to the review home (reasons, "why", rule details, every status sentence, the deck actions), the session ("label · dimension", the explanation, the reasons of "This item", the summary's set-aside, withheld and could-not-be-asked lines), the item history and the transfer measures (`screens/review.ts`, `session.ts`, `history.ts`), the setup app's home and pack labels (names), and the quoted words in GoTell's help steps (`screens/tell/write.ts`: the text between “ ” is target-language text). **Limit:** sentences that come from an engine as one string are marked by matching the words the screen knows (the unit label, and the accepted answers when the answer is in the target language); a target-language word in such a sentence that the screen does not know stays unmarked | a11y.screens A-11 (0 findings over 51 states); gopractice a11y-fixes embedTarget ×3 |
| A-12 | low | **Fixed** | the six card disclosure buttons had no `aria-controls` | ids `panel-l2`…`panel-l5`, `panel-fix`, `panel-more` and `aria-controls` (`popup/card.ts`) | a11y.card A-12 |
| A-13 | low | **Fixed** | the pronunciation note was not a live region | `role="status" aria-live="polite"` on `.pron` (`popup/card.ts`) | a11y.card A-13, A-D01 |
| A-14 | low | **Fixed (with a limit)** | the card trapped Tab without `aria-modal`, nothing said Esc leaves | `aria-modal="true"` when the card took focus (keyboard open, the case where it traps Tab); the close button gets `title="Close (Esc)"` and `aria-keyshortcuts="Escape"` (its name is unchanged). **Limit:** a card opened by selection takes no focus and is deliberately not modal (that would hide the page from a screen-reader user who only selected a word), and the page behind is never made inert (it belongs to the site) | a11y.card A-14 |
| A-15 | moderate | **Fixed** | GoTell "Delete" hid the button that had focus | focus moves to "Keep it" (the safe answer; the confirmation is a named group), "Keep it" returns focus to "Delete", and after "Delete for good" focus goes to the "Your drafts" heading (`screens/tell/home.ts`) | a11y.card A-15 |
| A-16 | low | **Fixed** | the router focused `<main>` after the session had focused the answer box | `app.ts` `show()` keeps focus when the screen already put it on a control inside `<main>` (**outside the list of files named for this work; a three-line change, nothing else in the file was touched**) | a11y.card A-16; gopractice a11y-fixes A-16 |
| A-17 | **serious** (latent) | **Fixed** | `normalizeAnswer` stripped trailing combining marks: हिन्दू passed for हिन्दी | `SURROUNDING` now keeps `\p{M}` at both ends (`goreview/src/grading/normalize.ts`); NFC and the loose Latin rules are unchanged | a11y.unicode A-17, A-17b, A-U06 (0 of 8 samples altered); goreview grading "never strips a combining mark" and "a Hindi or Thai answer that differs only in its last sign is incorrect" |
| A-18 | low | **Fixed** | the correction form's radios were not grouped | `<fieldset><legend>Which reading is right?</legend>` around the readings (`popup/card.ts`) | a11y.card A-18 |
| A-19 | low | **Fixed** | history screen `h1` then `h3` | `fillItemHistory(…, level)`: `h2` on the history screen, `h3` inside a session (`screens/history.ts`) | a11y.screens A-19; gopractice a11y-fixes A-19 |
| A-20 | low | **Fixed** | repeated list actions with one name | `aria-label`s that start with the visible label and add the item: "Dismiss: zog (proposal)", "Dismiss: zog (in your deck)", "Snooze a day: zog (in your deck)", "History of zog", "Test now: zog", "Write with this prompt: <goal>", "Change: Account", "Install Albanian", "Re-verify Albanian" (`screens/review.ts`, `tell/prompts.ts`, `app/screens/home.ts`, `app/screens/pack.ts`) | a11y.screens A-20; golearn-app settings A-20 |
| A-21 | low | **Fixed** | the two-step delete in the popup was silent | a `role="status"` line (`#delete-note`) says what the first click did and what it will do; leaving the button cancels the arming and says "Nothing was deleted." (`action/popup.ts`, `popup.html`) | a11y.screens A-21; actionPopup A-21 |

Tests that were corrected so that they can see the fix (never to hide a remaining defect): A-K04 and the card focus pair of A-K03 read the dark-scheme rule for the dark scheme (they read the light literal for both, so no fix could pass); the "kept for later" pairs read the opacity from the stylesheet instead of the hard-coded 0.75; A-18 used a card without competing readings, so it failed before reaching the grouping check (it now builds a card with two); A-D01 counts three status regions (A-13 adds one); A-D10 and A-U06 pinned the old behaviour and now assert the new.

### What is still open

- **A-11 limit** (above): marking depends on the words the screen knows; the engine strings are not segmented at the source.
- **A-14 limit** (above): not modal when opened by selection; the page behind is not inert.
- **Forced colours (O-01)**, the default focus ring of the action popup (O-02), the card's silence on a selection-only open (O-03) and the manual NVDA pass (section 8) are unchanged; none was in scope.
- The contrast figures are computed from the stylesheet values, not measured on rendered pages; target sizes (2.5.8) are estimated from the CSS (section 8, item 9). The new card sizes (em chain: `0.875em` card, `0.857em`–`0.929em` inside) were checked for the smallest text only by arithmetic (about 12 px at the default size), not by a layout run.

Observations (not tested as defects):

| id | what |
|---|---|
| O-01 | none of the five stylesheets handles `forced-colors: active`. The marks that carry meaning by tint (`.issue-mark` classes, `.tell-step`, badges, `.feedback[data-outcome]` left border) would lose it; the issue list does name each class in text. |
| O-02 | the action popup relies on the browser's default focus ring (A-C03). |
| O-03 | a card opened by selection (no focus move) is not announced as a dialog; the polite status "Encounter recorded." is the only spoken sign. By design (it must not steal focus); a manual NVDA pass should confirm what a screen-reader user hears. |
| O-04 | disabled controls are 3.2–4.46:1; exempt. |
| O-05 | `.issue-mark` variants (error / stylistic / uncertain) differ by tint and border colour only; each is also named in the issue panel. |

## 8. What jsdom cannot verify: the manual NVDA pass

Run with NVDA + Chrome (Windows), keyboard only, light and dark scheme, 200 % zoom and 400 % zoom at 1280 px.

1. **Card**: select a word, press the lookup shortcut. Does NVDA announce the dialog name "GoLearn: <word>" and then the word? Reading order of the rows; is each row's evidence tag ("fact", "analysis", "inference") read as a stray word after every value? Do the five layer buttons announce "collapsed/expanded"? Open the table in "Form": are the `th` cells read with their row? Does Escape return to the page word? Open by selection only (no shortcut): what is spoken?
2. **Pronounce button** disabled with no voice: is the note reached and read? With a voice: does NVDA keep speaking over the synthetic voice (audio focus)?
3. **Feedback after an answer**: `#feedback` is a fresh `aria-live="polite"` section inserted with its text, and focus then moves to Next. Many screen reader/browser pairs do **not** announce a live region inserted with its content, so the outcome ("Correct" / "Not quite") may be silent. Check it; if silent, set `role="status"` on a container that already exists and fill it.
4. **Session**: is the exercise heading/instruction read when a new item appears (focus is on the answer box, not on the instruction)? Do 1–4 and Space interfere with NVDA's own quick keys (browse mode uses 1–6 for headings)? That is the practical form of A-08.
5. **Audio question**: is "Audio question" read on entering the group; is the replay count announced; does the audio play after "Play (Space)" with NVDA running.
6. **GoTell writer**: the analysis panel and the help ladder (Level 1–6): is a new step announced? The issue marks in the text (`.issue-mark`) are visual; is the issue list reachable and ordered?
7. **Setup app**: the step list (`aria-current="page"`, the "not yet" text in `.sr`), the tutorial's selectable demo sentences (selection by keyboard: Shift+arrows in browse mode), the pack install progress (live region?).
8. **Zoom and text size**: 200 % and 400 %: no horizontal scroll, the card stays inside the viewport and scrolls internally; set Chrome's font size to "Very large": GoPractice and the setup app scale (except via A-01), the card and popup do not (A-02).
9. **Target sizes** (WCAG 2.5.8, 24 × 24 CSS px): card `.close` (padding 0 8px, 16 px font ≈ 21 px high), `.btn.small`, the popup buttons (3 px padding, 13 px font ≈ 24 px). Estimated from the CSS, not measured: jsdom has no layout.
10. **Speech input** (Windows Voice Access or Dragon): "click Dismiss" with ten "Dismiss" buttons on the review home (A-20, now fixed: the buttons are "Dismiss: zog (proposal)" and so on, so say the word too).
11. **After the remediation (new, to verify by ear):** with Settings → "Keyboard shortcuts in a session" off, do 1 to 4 and Space leave NVDA's quick keys alone and do the buttons read "Again / Hard / Good / Easy" and "Play"? Is "Hide clock" / "Show clock" announced and does the header stay quiet? Does "Click Delete all rows again…" (popup, `#delete-note`) get spoken on the first click? Is the pronunciation note ("Checking voices…" then the result) spoken? In the correction form is "Which reading is right?" read as the group name of the radios? Does the card, opened by keyboard, announce as a modal dialog and does the close button mention Esc? Are the Albanian words inside English sentences ("Added zog to your deck.", "Why" lines, the summary) read with an Albanian voice, if one is installed? After deleting a GoTell draft, is focus announced on "Your drafts"; after pressing "Delete", on "Keep it"? On the first item of a session, is the answer box announced rather than the page?

## 9. Files and how to run

| file | role |
|---|---|
| `test/audit/a11y.support.ts` | the DOM auditor (`auditDom`, `accessibleName`), the CSS reader (`parseCss`, `fontSizes`), WCAG luminance and contrast with alpha and `color-mix` compositing, the row and finding collectors |
| `test/audit/a11y.css.test.ts` (24 tests) | A-C…, A-K…: stylesheets and contrast; was: defects A-01…A-06, now fixed |
| `test/audit/a11y.screens.test.ts` (16 tests, jsdom) | A-S…: 51 screen states, audio-only, shortcuts, clock, popup; was: defects A-08…A-11, A-19…A-21, now fixed |
| `test/audit/a11y.card.test.ts` (19 tests, jsdom) | A-D…: the card's states, focus behaviour of the card and the shells; was: defects A-07, A-12…A-16, A-18, now fixed |
| `test/audit/a11y.unicode.test.ts` (19 tests, jsdom) | A-U…: Devanagari and Thai; was: defects A-17, A-17b, now fixed |

```
cd /c/Users/CJWal/dev/go-v0
npx vitest run test/audit/a11y.css.test.ts test/audit/a11y.screens.test.ts test/audit/a11y.card.test.ts test/audit/a11y.unicode.test.ts --reporter=dot
A11Y_ROWS_DIR=<dir> npx vitest run test/audit/a11y.*.test.ts     # also writes every row and every finding to <dir>/*.json
npx tsc -b
```

No `it.fails` is left. To see a fix prove itself, revert it and run the named test: the assertion states the correct behaviour (the audit tests failed on the assertion they name while the defect existed; the new E-03 and E-04 tests were also run once with their fix reverted and failed).

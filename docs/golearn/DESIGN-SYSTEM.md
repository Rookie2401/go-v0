# GoLearn interface: design system and information architecture

Written 2026-11-11 with the redesign of GoLearn's own interface (the owner's brief, "Comprehensive GoLearn UI/UX Redesign").
It covers the two surfaces GoLearn owns besides the word card: the **action popup** (`packages/golearn-extension/action/`) and the
**setup application** (`packages/golearn-extension/app/`, which is both the extension's options page and the hosted web app).

**Not covered, and not changed: the word card** (`src/popup/card.ts`). It draws inside its own shadow root with its own stylesheet, so
nothing here reaches it. GoReview, GoTell and My Vocabulary are a separate application (GoPractice) with their own stylesheet.

## The idea

A finely set page. Reading happens somewhere else (on the learner's own pages); GoLearn's interface should be quick to pass through
and say only what the learner needs where they stand. Three rules decide most questions:

1. **One purpose per screen, stated once.** One heading per page (its title). No page repeats what the top bar or another page says.
2. **What needs the learner is in sight; what repeats a control is not.** A status line shows when it has something to say (a warning, a
   step to take). "On", "Off", the name of the language already in the select: kept for a screen reader (`.sr`), hidden from sight.
3. **Depth is one step away, under its own name.** Rarely used things wait in a section that opens (`details.fold`) or on a page under
   Settings. Nothing is hidden behind an unlabelled icon, and nothing essential needs a hover.

## Information architecture

| Before (to 2026-11-10) | After |
| --- | --- |
| Top bar: brand, page title, **Status**, a cog | Top bar: brand, **Languages**, **Settings** (words, the current one underlined). Since 2026-11-26 three symbols at the top right, in GoReview's manner: a globe (Languages), a person (the account), a cog (Settings) |
| **Status** page: language, pack, Practise, five buttons to other pages | Gone. `#/home` leads to Languages, which says where the learner stands |
| **Choose your languages**: two closed sections, LANGUAGE and AUDIO | **Languages** (the home): what you read in; *Your languages*; *More languages* ("Add a language" until 2026-11-26). Nothing closed |
| Audio guide: a closed section under the language list | **Audio**: its own page under Settings, four parts that open, the first open |
| **Settings**: the account, then four links in a sentence each | **Settings**: Account; *Reading* (Audio, Privacy and data, Look up pasted text); *Advanced* (Sync, How GoLearn reads pages, Diagnostics and updates) |
| Signed-in account: five blocks open down the page | Email confirmation in sight; Sessions, Download my data, Delete my account, Security events each open on request |
| **Privacy**: eight boxes, then the whole policy | **Privacy and data**: Explanation, Speech, Off in this version, your data; a backend of your own and the Privacy Policy open on request |
| Way back: a button at the foot, beside a filled "Done" bar | Way back: a link above the heading (`‹ Settings`). "Done — back to reading" stays a bar at the foot, the quiet kind |
| Sign in: a select "What would you like to do?" | Sign in: two words, *Sign in* and *Create an account*, the chosen one underlined |

Routes: `signin`, `languages` (home), `settings`, and under Settings `audio`, `privacy`, `sync`, `reader`, `diagnostics`, `share`,
`terms`; from email links `verify`, `reset`; `help`. Old names (`home`, `status`, `welcome`, `language`, `pack`, `account`,
`tutorial`, `team`) lead to `languages`.

The popup keeps the owner's cut of 2026-10-28 (greeting, the brand as the one way to setup, the one switch *GoLearn Active*, one line
about the page, the legend, the language): no link to GoReview, no sync line. The setup app's Languages page carries the one way to
GoReview ("Go to GoReview", a gold pill with an arrow; "Review your words" until 2026-11-26), shown once a language is downloaded.

The head of the Languages page (the owner, 2026-11-26: "Keep review, the header, and my account. Cut the rest"; "have it say, go to
GoReview"; "Move the account settings to the top right in the manner of GoReview"; "Change the language button from text to a
symbol"): the title and its gold rule, then the pill, then the languages. Cut from the page: the small line above the title, "<language>
is ready" with how to start reading (the tile of the language being read in says "Reading now"; one line stays for a screen reader),
the sentence about the account, the first run's two sentences, and "My words". The account is the person in the top bar
(`#account-link`): signed in it leads to Settings, whose first part is the account, and is named "Account: synced as <email>"; on a
device of its own it leads to the optional sign-in and is named "Account: on this device only. Sign in to keep your progress across
devices (optional)". Each symbol of the bar (`.top-icon`) carries its name as `aria-label` and as its tip.

## Tokens

Defined in `app/styles.css` `:root` (light) and its `prefers-color-scheme: dark` block; the popup's `<style>` repeats the colour tokens
it uses with the same values (`test/extension/designTokens.test.ts` keeps them equal). The values are the contrast-audited ones
(`test/audit/a11y.css.test.ts`); change them there and here together.

| Token | Use |
| --- | --- |
| `--paper`, `--paper-raised` | the page; a form control's ground |
| `--ink`, `--ink-soft`, `--ink-faint` | text; secondary text; labels (all text-safe on paper). `--ink-whisper` is decoration only |
| `--rule`, `--rule-strong`, `--control-line` | hairlines; a stronger rule; borders of controls and buttons |
| `--accent`, `--accent-soft`, `--accent-ink` | the ONE accent: links, the filled button, the rule under the current place |
| `--ok`, `--bad`, `--warn-bg` | success, failure, a warning's ground |
| `--radius` (2px) | every corner: nearly square |
| `--measure` (44rem) | the width of the text column |
| `--gap-1` … `--gap-5` | the scale of space (.35, .65, 1, 1.6, 2.5 rem) |

Type: EB Garamond (shipped, SIL OFL), body 1.125rem / 1.6. `h1` 1.7–2.1rem, sentence case, at the start of the line. `h2` and field
captions are small capitals (.82rem, tracked .14em, `--ink-faint`). A page's opening line may be a `.lede` (1.3rem). Native names of
languages are set with `lang` and `unicode-bidi: isolate`; `font-feature-settings: 'locl' 0` stays, so original-language text keeps
its own forms.

## Components

- **Section** (`.part`, `.card`, `section.sub`): a small-capital label on a hairline, then its content. Never a box, never a box in a box.
- **Section that opens** (`details.fold`): the summary is the section's name with a mark that turns; used for what most learners never open.
- **Buttons**: quiet by default (words on a rule). `.primary` (filled with the accent): at most ONE in a region, the page's own action
  (Continue; a Download that asks a question). `.danger`: cannot be undone. `.small`: inside a row. `.bar`: across the screen, words
  centred. `.linklike`: an action that reads as a link (Cancel, Remove).
- **Two choices** (`.seg`): two words with a rule under the one in force (`aria-pressed`). Not a select.
- **List of places** (`.settings-links`): each row one link, a name (`.nav-title`) and one line of what is there (`.nav-about`), a `›`.
- **Language row** (`.lang-row`): name and native name; one quiet line (the pack's level, in the pack's own words); ONE action at the
  right; Details closed under it. Script codes (Latn, Deva) are not shown.
- **A language's tracks** (`.track-list`, since 2026-11-26; the owner: "Look at the language display of GoReview, please copy it and
  port it over to GoLearn"): the row is a tile that opens. Its face is GoReview's: the name at the start of the line with the native
  name beside it in brackets, "Reading now" above the one being read in, a caret at the end. Opened, it lists the language's tracks
  (Germany, Austria, Switzerland; Biblical, Modern) one to a line under a hairline, the name at the start and the state at the end, the
  line itself the control (`.track-row`): "Download" for a track that is not here, "Use for reading" for one that is, "Reading now" for
  the one in force. A language with one track has one line. A track that is here also has Remove (`.linklike`). Norwegian's written
  standard is GoReview's question (`.standard-choice`): its words, the chosen one underlined in gold, none chosen until the learner
  chooses, and the gold pill under them. No select anywhere in a row. The language being read in stands first and its tile is lighter;
  the second group is headed "More languages", as in GoReview.
- **The Languages page is the exception to this system** (the owner, 2026-11-18: "redesign both of them in line with the design
  philosophy of the homescreen of GoReview"): it wears GoReview's home look in any colour scheme (the stone, leather and brass tokens;
  the title in the home's large serif with a kicker and a short gold rule; each group a kicker between rules; each language a warm tile
  with no outline, the one read in lighter; Download the gold pill; Details and quiet row actions gold links). The rules are the last
  block of `app/styles.css`, scoped to `.screen[data-route="languages"]`; the markup is unchanged. GoReview's own language list
  (`#/setup`) and Account page use the same look (`packages/goreview/app/styles.css`); on Account the languages are compact rows in a
  "Your Account Settings" panel at the foot (PR #20, 2026-11-19, kept by the owner: "Keep codex's redesign").
- **State in a word** (`.tag`): small capitals on a hairline ("Reading now").
- **Notice** (`.notice`): a rule in the accent at the start of the line; `.notice.warn` adds the warning ground.
- **Status line** (`.status`, popup `.status-line`): `role="status"`; takes no room when empty; the warning colour only for a warning.
- **Way back** (`.crumb`): `‹ Settings` above the heading, with the accessible name "Back to Settings".
- **Switch** (popup): a checkbox with `role="switch"`, its name and one line about it at its left.

## Rules for adding to the interface

- A new control needs a reason a learner would give, in their words; a number or an identifier (a build id, a learner id, a count of
  rows) belongs on Diagnostics, in a title, or in "Technical details".
- Do not add a second filled button to a region. Do not add an explanation to a control that is understood without it.
- Keep ids and `data-action` names: the tests and the two apps' messages use them. Restyle freely.
- Nothing a learner needs lives in a `title`: a tooltip is hover-only, so a finger, the keyboard and many screen readers never get it.
  What is secondary opens on a press (the popup's "Word counts" under the page line).
- Anything pressed is at least 24 by 24 CSS px: a summary, a link that stands alone on its line (the way back, the foot links), the
  popup's switch. A link inside a sentence is exempt; a checkbox is pressed through its label.
- Every text size in rem/em; `:focus-visible` is never removed; motion only under `prefers-reduced-motion: no-preference`.
- Check a change in a real extension page, light and dark, at 390px and at desktop width, before calling it done.

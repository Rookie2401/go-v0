# Reading Analysis

2026-11-17. The learner opens a page, presses **Analyse this page** in the GoLearn popup, and is told what share of the
text's word occurrences they already Know:

    87.6% Known
    8,760 of 10,000 words

One number. What stands under it is only what is needed to trust it: what was read, what could not be decided, and
whether the knowledge it rests on is known to be the learner's whole record.

This is a reconstruction. The earlier draft (pull request #9, branch `feat/golearn-reading-analysis`, never merged)
is described in section 9, with what was kept and what was not.

## 1. What it is, and what it is not

It counts. It is not a course, a review, a comprehension test or a reading level. It records nothing: no encounter,
no lookup, no mark, no review, and it changes no level and no schedule.

    Known coverage = (Known occurrences + Automatic occurrences) / all eligible word occurrences

- **By occurrence.** A word the text uses 150 times is 150 of the total, known or not.
- **Known means the two top levels** of the Repository's six (`new, seen, recognized, familiar, known, automatic`):
  Known and Automatic. Familiar and Recognized are not Known.
- **Whole numbers throughout.** The percentage is rounded only where it is shown (one decimal, half up, worked in
  integers: `formatPercent`). A figure that is not 100 is never shown as 100.0.

## 2. The pipeline

    the page in front
      │  popup: "Analyse this page" (the press is the permission)
      ▼
    extract.ts      which text is the text to be read          → text nodes, scope, fingerprint
      ▼
    lexical.ts      the words of the text, counted              → table: word → occurrences
      ▼             (the analyser, then the dictionary's forms index)
    background      snapshot: is the device level with the account?
    reading.ts      classify: every word against the Repository → one verdict per word
      ▼
    coverage.ts     the arithmetic                              → counts, percentage, range
      ▼
    present.ts      what the popup says

Each stage has one input, one output and its own way to fail. A failure is a state with a name, never a number: a
Repository that would not answer does not become 0 %.

| File | Runs in | Does |
|---|---|---|
| `action/reading.ts` | popup | the button, the variety choice (Greek, Hebrew), the polling, the result |
| `src/reading/session.ts` | page | one run at a time: stages, cancel, the kept word table, stale detection |
| `src/reading/extract.ts` | page | the readable text of the document; scope; fingerprint |
| `src/reading/lexical.ts` | page | tokenise, name, count; ask the dictionary; time slices; limits |
| `src/reading/protocol.ts` | all | the messages and shapes |
| `src/background/reading.ts` | worker | grant, snapshot, classify; every check on what comes back |
| `src/reading/classify.ts` | worker | the verdict on one word from its rows (pure) |
| `src/reading/coverage.ts` | page | counts and percentage (pure) |
| `src/reading/present.ts` | popup | every sentence shown (pure) |

### What crosses each line

- popup → page: a language and a text variety.
- page → worker: unit ids only (`form:<lang>:<word>`, `lemma:<lang>:<lemma>:<POS>`), each distinct word once, in no
  order. The page's text never leaves the tab.
- worker → page: a verdict per word and how the snapshot was verified. Never a learner id, a token or a row.
- worker → service: "the learner's events after number N" (the same request a sign-in makes). Nothing about the
  page. The knowledge itself is read from the device's own Repository.

A content script may ask only for a tab an extension page granted (the popup, inside the learner's press), for ten
minutes. So a page cannot make its content script ask about words the learner did not ask to have analysed.

## 3. Which text

The whole readable text the document holds, not the part on screen. What the document does not hold (the next
chapter of a reader that loads one at a time) is not fetched or followed: the scope says what was read.

The rules are the reader registry's and GoLearn Active's:

- a page whose registry entry refuses reading is refused here too, before anything is read;
- a site's own reading area (`containers`) and chrome (`ignore`) are honoured; frames are read only as its frame
  policy allows;
- the scanner's rules decide what a readable text node is (no form fields, scripts, editable regions, GoLearn's own
  card, navigation, banners, footers, menus, dialogs).

And for a count rather than an underline:

- sidebars, forms, search boxes, closed disclosures and advertisement slots are left out;
- text that is not rendered is left out, so a page with a desktop and a hidden mobile copy counts its text once;
- a passage that declares another language (`lang=`) is left out and counted as such; the page-wide `html lang` is
  never taken as proof;
- with no site reading area, the main content (`main`, `article`, `role=main`) is the scope when it holds at least
  half of the readable letters; otherwise the whole page is. The popup says which.

**Change detection.** The text has a fingerprint. If it differs after the run from before it, the run fails with
"the text changed" and no figure. A result already shown is flagged when the page's text no longer matches it (a
reader that swaps its chapter in place at the same address).

**Long texts.** The work is done in slices of about 12 ms with a pause between, and can be cancelled between
slices. There are two stated limits (20,000,000 characters; 400,000 distinct words). Reaching one ends the reading
at a node boundary and the result says "only the first N % of this text was read". There is no silent cap.

## 4. Which words

`wordsOfText` (`src/active/scan.ts`) is the one place that names a page word. GoLearn Active's scanner and Reading
Analysis both call it, so they cannot disagree about which unit a word is.

- every word gets `form:<lang>:<normalised>`;
- a word the analyser reads above the parser's confidence floor gets the lemma id of its best reading (what Active
  uses), and Reading Analysis also carries the lemma id of **every** creditable reading;
- a word the analyser does not have is asked of the language's dictionary (the forms index, in the worker), in
  batches each of which must be answered;
- a word neither has stays in the table with no reading. It is counted in the total and reported as not
  identified. It is never dropped and never guessed.

Eligible words are the word tokens written in the language's own script. Numbers and punctuation are not words.

The table depends on the text and the language pack only. It is kept (in the tab, with the fingerprint and the
analyser's version), so analysing the same text again after the learner's knowledge changed reads the knowledge
again and counts again, without tokenising the text a second time.

All registered languages use this one path: sq, es, de, hi, th, nb, nn, la, he, el, arc.

## 5. What the learner knows of a word

A word's level is `levelOfRows` over its form row and its lemma row: the function GoLearn Active colours the page
with. The learner's own newest mark decides outright; otherwise the highest level either row supports. Reading
Analysis adds no rule of its own about knowledge. Three cases need a rule beyond it, and each is the cautious one.

| Case | Verdict |
|---|---|
| One reading | `known` (Known or Automatic) or `below` with its level |
| Several readings, the learner knows all of them | `known` |
| Several readings, the learner knows none | `below` |
| Several readings, the learner knows some | `ambiguous`: not credited, not called unknown |
| No reading, but a record of that exact form | the form's own row answers |
| No reading and no record | `unidentified` |

**Greek and Hebrew** (`docs/ecosystem/LANGUAGE-VARIETIES.md`). The learner says which variety the text is in (the
popup asks; a page that states one outright, such as `hbo`, is believed; a bare `he` or `el` states nothing). Rows
are read in that variety with `knowledgeInVariety`. A word is credited as Known only when that view says so **and**
the unit's evidence classified in that variety says so by itself (`ownKnowledgeOf`). A word Known only through
records that nothing assigns to a variety, which is every mark and review made before varieties were recorded, is
`unsettled`: shown as "a further N % are Known in your Greek record with no variety recorded", and not counted. A
legacy, language-wide mark never establishes mastery of a particular variety, and what is known in another variety
never counts here.

When there are words that could not be decided, the popup shows the confirmed figure and the range ("Known is
between 85.0% and 90.0%"). It never presents an estimate as the exact figure.

## 6. Repository integrity

The figure is only as good as the knowledge it is counted from. Three things are established, not assumed.

### 6.1 The device holds the whole account history

The extension reads knowledge from the device's own Repository (the same event store and projection engine as the
service, in the worker). **Until this change the device took in the account's history only at sign-in.** The
minute-by-minute sync round pulled other devices' events, counted them and dropped them. So a word marked Known in
GoReview on a phone never reached GoLearn's own record until the next sign-in, and everything read from the device,
the page underlines included, went stale without saying so.

Now:

- `localRepo.catchUp()` brings the device level with the account and says whether it got there. The pull
  (`repository-local/src/transfer.ts`) returns `{ added, complete, afterSeq, head, refused, deletions, removed }`:
  - **the end is the account's head.** A page shorter than asked is not the end while the head lies beyond it;
  - **a page that does not begin after the cursor is not trusted.** It is asked for again, then one event after
    the cursor is asked for by itself. An event before the page's first shows a hole: the page is not taken and
    the pull ends incomplete. (A range the learner deleted looks the same from one answer; two different
    questions tell them apart.)
  - **an event the device's store will not take is remembered** with the cursor (a kind from a newer contract),
    however many there are, and asked for again at every pull. While one is outstanding the device is not level;
  - **what the learner deleted on another device is deleted here.** The event list only says what was added, so
    the account now lists its deletion instructions (`GET /tombstones`) and the device carries out each one it
    has not carried out yet, before it reads the new events. A service that cannot list them (older than this
    change) leaves the device "not level": `deletions-unknown`.
- A sync round that received events recorded by **another** device calls it (the device's own events coming back
  do not), so GoLearn Active benefits as well.
- Every analysis starts with a snapshot that does the same and reports the outcome.

| Snapshot | Meaning |
|---|---|
| `account`, `verified` | the device was brought level with the account for this analysis: a pull reached the head, nothing refused |
| `device`, `verified` | not signed in: this device's record is the whole of it |
| `account`, `unverified` + reason | the account could not be read to its head now; the device's record was used, and the popup says since when it is known to be whole |

Reasons: `offline`, `needs-sign-in` (also when the service answers 401 while the device is being brought level),
`unreachable`, `timeout` (20 s), `incomplete`, `refused-events`, `deletions-unknown`, `mixed-accounts`. Each has its
own sentence in the popup, and each says since when the device is known to have been level, when it ever was.

An unverified figure is shown as "87.6% Known (not verified)" with "A definitive current figure is not available"
and the reason. It is never shown as if it were verified.

**Mixed accounts.** A device has one local learner. Signing in to a second account pulls that account's history
into the same record. That is how a device has always worked and it is not changed here; the accounts a device has
exchanged history with are now remembered (`golearn:local-accounts`), and with more than one the snapshot is
`unverified`, reason `mixed-accounts`, until the device's data is cleared. A device from before the list was kept
has it read once from the markers of its own events (every event sent to an account or taken from one says
which), so two accounts already mixed are found.

**A store that would not open.** A device whose history lives in IndexedDB, and whose IndexedDB will not open,
runs on a memory-only stand-in that does not hold the history. Every word would read as never met. Reading
Analysis gives no figure then ("the vocabulary kept on this device could not be opened"), signed in or not.

**Signed in, but no account to ask** (no service address, a session that cannot be used) is an account that could
not be checked, never "this device is the whole record".

### 6.2 Every word of the text was asked about, and answered

- The page sends the table in batches of at most 400 words. A larger batch is refused, never trimmed.
- The worker asks the Repository about every unit id of a batch in requests of at most 200 ids. Each must be
  answered; one failure refuses the whole batch.
- Every returned row is checked: its id was asked for, it is the device learner's, it is in the language asked
  about, and no id comes back twice. Anything else refuses the batch.
- `asked` and `answered` are returned and must be equal. A unit with no row in an answered request is a verified
  absence ("no record"), which is not the same thing as a failed lookup.
- A batch the worker never answers is asked again twice, then the run fails with "some words could not be checked".
  A partial answer is never counted.
- After counting, the counts must sum to the table's total, or there is no figure.

### 6.3 One figure, one state of knowledge

The Repository has a generation that changes whenever it takes in an event. The snapshot names it; every batch
names it; a batch that arrives after a change is answered `snapshot-changed`, and the page starts the batches again
from a new snapshot (three times, then "your vocabulary kept changing"). A worker restart is a change too.

An event is readable from the moment the store has it, which is before the write's own call returns, and a pull
writes page by page while it runs. So a write is announced before it starts: while one is under way the generation
carries a mark no settled value has. A batch cannot be answered from the middle of a write under a snapshot taken
before or during it.

A row whose level is not one of the six is damaged. It is not re-read by some other rule (the page's older
thresholds would work a level out from its dimensions and could call a Familiar word Known): the batch is refused.

### 6.4 What "100 % agreement" means here

The device's Repository runs the same projection code as the service over the same events. The reconciliation
suite (`test/extension/reading-repository.test.ts`) seeds an account from a second device, signs the extension in,
and compares the extension's answer for every unit with the service's own projection of that account, unit by
unit. Section 8 gives the results. It is a property of the test snapshots; on a learner's own account it holds to
the extent that the two sides run the same projection version, which the service reports and the extension cannot
yet check (section 10, item 3).

## 7. The popup

One part under the language switch: its name, one button, and for Greek and Hebrew a select "This text is". After a
run: the figure, the count, the scope, then one sentence per thing that qualifies the figure, with the verification
last. No chart, no gauge, no reading level. While a run goes on the line says which stage it is in ("Reading the
text of the page…", "Identifying the words… 40%", "Checking your vocabulary…", "Counting…"), and the button is
Cancel. A popup closed during a run and opened again finds the run or its result.

## 8. Verification

See `docs/ecosystem/READING-ANALYSIS-TEST-REPORT.md` for the commands, the counts and what was and was not run.

## 9. The earlier draft (pull request #9)

`feat/golearn-reading-analysis`, 19 commits on a base 66 commits behind master when it was inspected; open, not
merged, not deployed.

Kept as design: started from the popup on demand; the scanner and the real analysers reused; the dictionary's forms
index asked for words the analyser lacks; device-only lookups through the worker; occurrence-weighted counting;
unresolved words kept visible; no events; cancellation; rejection of a text that changed.

Not kept, and why:

| The draft | Why it could not ship |
|---|---|
| Stopped at 100,000 characters and 12,000 tokens | a book is longer; replaced by slicing with stated limits |
| Asked about 60 ids per message through `profile.knowledgeFor`, which **silently slices** to 60 | the path it called trims without saying so; replaced by a path that refuses instead of trimming |
| Treated "the device answered" as "the knowledge is current" | the device was not kept level with the account (6.1); the draft could only say "may not be fully synced" on every signed-in result |
| Invented variety-scoped unit ids (`form:he:he-bib:…`) and changed `buildMarkEvent` to write them | master has since given varieties one model (`varieties.ts`, projection@8); the draft's ids are a second, incompatible one and would have written events no other part of the system reads |
| Required form-level evidence before calling a word Known, so a Known lemma's other forms were only "familiar" | an interpretation of its own, different from the level GoLearn Active shows for the same word |
| Rows went to the content script to be judged there | the compact row a content script may hold has no per-variety data; the verdict is now made in the worker |
| No grant: any content script could ask | a grant per tab from an extension page |
| Two figures (familiar, confidently known) and a meter | one figure |

## 10. Limits

1. **GoLearn Active's underline still shows a Greek or Hebrew word's level across its varieties** (item 1 of
   `LANGUAGE-VARIETIES.md` section 10). Reading Analysis reads the text's variety, so for a word with evidence
   classified in another variety the two can differ. Every other language: identical by construction.
2. **A spelling with several readings is judged more strictly than Active judges it.** Active colours it by its
   best reading. Reading Analysis credits it only when every reading is Known, and otherwise says it is ambiguous.
   Measured on the course samples, 10 to 22 % of tokens have more than one reading in Albanian, Hindi, both
   Norwegians, Hebrew, Greek and Aramaic, so for those languages a learner who knows some homographs will see a
   range rather than a single exact figure.
3. **The extension cannot yet check that the service runs the same projection version as the device.** Both are
   built from one repository, so a deploy of the service and a build of the extension from the same commit agree.
4. **The service must be deployed with this change for a signed-in figure to be verified.** Until it lists
   deletions (`GET /tombstones`), every signed-in analysis says "not verified: your account could not say which
   records you have deleted". The figure itself is still given, from the device's record.
5. **A heading inside `<header>` is not read** (the scanner treats `header` as page chrome, for Active too), so an
   article's title placed there is not in the count.
6. **Only what the document holds is analysed.** A reader that loads one chapter at a time gives a chapter's
   figure. Following or fetching further chapters is not done, on purpose.
7. **A registry entry that refuses a reader refuses Reading Analysis.** Kindle Cloud Reader, Kobo and the other
   refused readers are not read.
8. **Cross-origin frames are not read** (the browser does not allow it, and the registry does not ask).
8a. **What a transport that lies consistently cannot be told from.** A service or proxy that gave the same wrong
    answer to every shape of question about a position could not be told from a range the learner deleted, and a
    Repository that returned fewer rows than it holds could not be told from "no record". The checks catch a wrong
    or short answer to one request; they are not proof against a store that is wrong throughout.
8b. **A sync round does not notice a deletion.** A deletion made on another device reaches this one at the next
    analysis or sign-in, not at the minute's sync round (which is prompted by new events), so GoLearn Active's
    underlines can show a deleted record until then.
9. **Packs with a small built-in word list.** On the course samples the Latin and Hebrew analysers leave about
   29 % of tokens without a reading before the dictionary is asked (Greek 8 %). With the dictionary not downloaded
   or offline those stay unidentified, and the popup says so.
10. **Thai.** Words are found by the pack's own segmenter. Every sample token got a reading, so the rule that an
    unresolved Thai token is never given an invented reading was shown only on a made-up word.

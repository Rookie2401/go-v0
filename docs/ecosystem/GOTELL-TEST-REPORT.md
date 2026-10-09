# GoTell — test report (Prompt 6, Part A)

Status: 2026-10-09, updated after the §5 fixes (counts below are from the re-run after them; the browser walk in §3 was made BEFORE the
fixes and has not been repeated). What ran, with the runner's counts, the acceptance scenario over the real pieces, the browser walk
against the real service, and what the service holds afterwards.

## 1. Automated suites

```
npx tsc -b   # clean for every GoTell file (other lanes' in-flight files may still show errors)
npx vitest run test/gotell-engine test/gotell-prompts test/gotell-documents test/gotell-ui test/gotell-e2e test/gotell test/gopractice test/ecosystem test/audit/security.remoteai.test.ts --reporter=dot
npx vite build -c packages/gopractice/vite.config.ts   # builds; dist/THIRD-PARTY-NOTICES.md is copied
```

| suite | tests | what it proves |
|---|---|---|
| `test/gotell-engine` | 144 | the real Albanian checker on pinned sentences: definiteness, case, agreement, conjugation, particle, dialect (regional), register, an uncertain case; classes; corrections validated (checker clean, nothing added, negation flip flagged as a meaning change and never applied); combined and partial repairs; the six assistance levels in order; Level 6 refused without consent and without a provider, served from a pack sentence when one exists; remote proposals validated and rejected when they add content; authorship judgements; the original text hash unchanged throughout; a language with no checker says so; every step records its sentence (index and hash); authorship judged per sentence (an untouched sentence stays independent; by index; by hash after an insertion; legacy steps fall back to the whole-round rule; copying is judged wherever the text lands); the coverage summary (one line, every limit kept in the details, the checked areas pinned against the real checker) |
| `test/gotell-prompts` | 43 | 47 prompts validate (27 neutral, 20 Albanian variants; all machine-drafted, unreviewed); per-mode filtering; testimony prompts unordered and without first-person content; frames are pack-attested sentences; the writer profile keeps production and recognition apart, finds weak constructions, recurring errors and goals, bands without any CEFR string; guidance for a first-sentences writer gives a pattern and no model paragraph; selection explains itself; goals are read from `label` and from the older `text` |
| `test/gotell-documents` | 58 | one private document per draft with the JSON record; lenient legacy bodies; optimistic conflicts; local store; syncing store with conflict copies (two devices, delete-against-edit both ways); immutable versions, restore as a new version, diffs; three export formats; evidence events validate, carry no text, map authorship as specified, copied/AI sentences get quality `none`; writing export without the token; device cleanup; the remote gate refuses without consent and makes no call; the sentence reference survives the JSON round trip and `judgeFromAssistance` is per sentence; the consent switch writes valid `ConsentGiven` / `ConsentWithdrawn` events (scope `gotell:remote-assistance`), turning on needs its record, turning off is immediate, and through the real assistance ladder there is no remote call before consent and none after withdrawal; only the boolean `true` is consent |
| `test/gotell-ui` | 48 | routes and modes; draft list actions; prompt picker; goals event shape; privacy page; writer: autosave is device-only (no network), Save makes a version and submits evidence without text, Analyse marks issues, the ladder is strictly ordered, Model expression needs a second click and shows a refusal honestly, Accept replaces one sentence and keeps history, Reject records and mutes, meaning-change warning blocks one-click acceptance, versions diff/restore, export, delete, Ctrl+S; the whole flow through the real checker and stores; the coverage is one line with a closed details element holding the whole adapter statement; the accept notice (copied from the model, no production credit) is on screen before the Accept button; hint on one sentence leaves an edited neighbour independent at Save; the privacy page links to the licences; the real shell queue receives `ConsentGiven` then `ConsentWithdrawn` when the switch is flipped |
| `test/gotell/boundary.test.ts` | 6 | `packages/gotell` imports nothing from GoReview or the shell; initialises with an empty log and no deck |
| `test/gotell-e2e/albanian-acceptance.test.ts` | 14 | the §12 scenario (§2) |
| `test/gopractice` (8 files) and `test/ecosystem` | 78 and 7 | the shell still passes with the new workspace; the Settings "Licences and attribution" section (closed until opened, reads the shipped notices, falls back when the file is missing, offline or answered with the app's own page; text is never rendered as markup) |
| `test/audit/security.remoteai.test.ts` | 13 | includes the S-14 case, now a plain `it` (it was `it.fails`): a truthy non-boolean or a Promise from a consent store is not consent |
| whole command above | 589 in 44 files (the S-14 file is counted in it) | all green |

## 2. The §12 acceptance scenario (`test/gotell-e2e/albanian-acceptance.test.ts`)

Real: the Repository service (SQLite, scrypt), the Albanian pack runtime and checker, GoTell's profile, prompts,
guidance, analyzer, assistance, authorship, draft store over the service, versions, evidence and privacy. Fake: the
network (in-process), the clock, a remote assistant that proposes a wrong rewrite.

| steps | what passed |
|---|---|
| 1–2 | profile from the Repository after two GoLearn encounters: band first-sentences, no productive units (reading is not production), no CEFR string; GoTell initialises with no deck, session or review event |
| 3–4 | a mission prompt is selected with a stated reason; guidance has a lead, ≤ 3 suggestions, the honesty line, no model paragraph |
| 5–6 | the learner's text "Unë shkoj te libër. Unë lexoj librin." is accepted; sentence 1 gets a definiteness issue classed grammatically-wrong from the adapter checker; sentence 2 is clean with a coverage line; the text hash is unchanged |
| 7 | Levels 1–2 name the type of problem (definiteness) without revealing the fix |
| 8 | the revision "te libri" is clean; its authorship is after-hint, the untouched sentence independent BECAUSE the hint step records sentence 0 (asserted); an added case: two sentences, hint on sentence 0 only, sentence 1 rewritten → [after-hint, independent] in the version and in the evidence |
| 9 | Level 4 shows "Unë shkoj te libri." with an explanation; the correction is checker-clean and adds nothing; the analysis still holds the learner's text |
| 10–11 | two immutable versions (the attempt, then the revision with per-sentence authorship); the first version is byte-identical after the save; the draft is a private document; no event carries the text |
| 12–13 | evidence: DraftSaved + two ProductionRecorded (after-hint assisted; independent with usedCorrectly true); events validate; the projection gains contextualProduction from the independent clean sentence and assistedRecognition from the hinted one, productiveRetrieval untouched; "words you can use" lists libër |
| 14–15 | the document reopens with both versions at the saved revision; json/text/markdown exports; the all-writing export contains the draft and not the token |
| second learner | no review history at all: profile, testimony prompt ("true for you"), analysis (agreement issue), hint, save, evidence, reopen |
| edge cases | a remote assistant's wrong rewrite (adds content, flips negation) is never shown as a model; the gate refuses without consent; a rejection event validates; an unclear sentence is classed uncertain-analysis; offline save on the device then push once; two devices editing one draft keep both texts (conflict copy); another learner cannot read or delete the document; the owner's deletion removes it |

## 3. Browser walk (Chromium pane, 2026-10-09 16:00–16:05 UTC)

Real service process on `127.0.0.1:8790` (learner ana@albania.test), the built `packages/gopractice/dist` on
`localhost:5199`, real keystrokes for the text and the save.

| step | observed |
|---|---|
| GoTell home | six modes with one-line descriptions; "New draft"; drafts; goals; privacy link; "Online. nothing waiting." |
| Missionary → prompts | category tabs; prompt cards with goal, instruction, difficulty, "machine-drafted, not yet reviewed", cultural notes; "Write with this prompt" |
| writer | prompt and guidance panel (pattern "who does what to what" with the pack's example, "nothing here is a model answer", "words you have only read are not counted"); a textarea with `lang="sq-standard"`, spellcheck off |
| typed "Unë shkoj te libër. Unë lexoj librin." → Analyse | "1 place(s) to look at in 2 sentence(s). Your text has not been changed."; sentence 1 marked "Probably wrong · definiteness, looked at by adapter checker"; sentence 2 "Nothing found here."; the coverage text (verbose; see §5) |
| 1. Identify / 2. Hint | "Possible problem at “libër”: definiteness." / "Definiteness: Albanian adds “the” to the end of the noun … libër is “a book”, libri is “the book”." with their sources |
| Ctrl+S | "Saved to your account · 1 version(s) · Saved as version 1. Evidence: 2 observation(s) sent…"; "What this recorded: … Only counts and hashes were recorded; your text stays in your private document." |
| Versions | "Version 1 · 2 after hint · Compare with current text · Restore — Restoring makes a new version with the old text. Nothing is ever overwritten." |
| 3. Suggest / 4. Show correction | "The checker names “libri” for this spot; compare it with what you wrote. Your sentence has not been changed." / "Revised sentence: “Unë shkoj te libri.” Why: After "te" the noun takes its definite form …"; Accept correction / Reject buttons |
| Reject | the text in the editor unchanged; the issue shown as "rejected, kept muted" |
| service read-back | one private document (kind draft, revision 1) whose body holds version 1 with per-sentence authorship; events `DraftSaved` (quality none) and two `ProductionRecorded` (mode guided, assisted true, assistance hint, usedCorrectly unjudged, authorship after-hint, sentence hashes, item ids), no sentence text anywhere |

## 4. GoTell independence

Verified three ways: the boundary test's import scan, the acceptance test's second learner (no review events exist and
the full workflow runs), and the browser walk (the GoTell page loads with an empty deck and no session).

## 5. Defects and limits found in this phase

Items 1–4 were found by the browser walk and item 5 by the rights audit; all five were fixed afterwards (2026-10-09). They are covered by
the tests in §1; the browser walk itself has NOT been repeated against the fixed build.

1. **Authorship was judged per round, not per sentence — FIXED.** The browser walk recorded the untouched second sentence as
   after-hint. Now every `AssistanceStep` records the sentence it was shown for (`sentenceIndex`, 0-based, and `sentenceHash`); the writer
   session stamps it when it keeps a step, the real engine sets it, and `judgeAuthorship(text, steps, { sentenceIndex })` and
   `judgeFromAssistance` count only the steps that touched that sentence. A sentence no step touched stays independent; a legacy step with
   no sentence reference falls back to the old whole-round rule (it never over-credits); `reproduced-later` and copy detection are
   unchanged. Still open: matching is by position and sentence hash, so when a hinted sentence is deleted and a different one moves into its
   position, that one is judged after-hint (it under-credits, never over-credits).
2. **The coverage text was the adapter's whole limitation list under every analysis — FIXED.** The screen shows one line ("Checked:
   definiteness, case, agreement, conjugation, particles. Not checked: 8 other areas — see details.") and a collapsed "details" element
   holding the headline and every limit in full (`summariseCoverage`, pure, unit-tested). The "checked" list is a hand-kept table for
   Albanian only; a language not in it says the list is not recorded.
3. **Accepting a correction counts as copied and earns no credit; the screen did not say so — FIXED.** One line before the Accept button
   states it and what to do instead (rewrite the sentence yourself).
4. **The remote-consent switch wrote no event — FIXED.** The switch writes `ConsentGiven` / `ConsentWithdrawn` (scope
   `gotell:remote-assistance`, no text) through the shell's event queue; turning on records first and switches on only if the record is
   accepted, turning off takes effect at once. The consent gate (`RemoteAssistantGate`) and the assistance ladder now accept only the
   boolean `true` (audit S-14 closed). Tests: no remote call before consent, none after withdrawal. Still true: no provider is configured,
   so nothing is sent either way; the gate and the records are exercised with test doubles only.
5. **No licences screen — FIXED (audit RIGHTS-AND-ATTRIBUTION open item).** GoPractice Settings has a "Licences and attribution" section that
   shows the shipped `THIRD-PARTY-NOTICES.md`, with a fallback when it cannot be fetched; the GoTell privacy page links to it. The notices
   now give the dictionary's source URL, edition (`kaikki-sq@2026-09-28`: file last-modified 2026-09-28, retrieved and built 2026-10-01),
   SHA-256 and the changes made. Still open: the Wiktionary revision and the exact download address of the `+tables` file are not recorded
   (the notices say so); the word card's own attribution gap and the extension popup are other lanes.
6. The checker misses coordinated subjects, object-without-preposition errors and some agreement cases (engine README); prompts, frames and
   cultural notes are machine-drafted and unreviewed; Albanian only.
7. **Found while fixing, caused by a contract change in another lane.** The Repository now refuses a `text` key anywhere in a payload, and
   an event dated later than the service's clock. GoTell's goal events carried `value.text`; they now carry `value.label` (a free-text key
   the contract allows), and both readers still accept the older `text`. The documents test world's clock now sits after its fixtures' dates.

# GoTell: the writing workspace

GoTell is where a learner writes in the language they are learning, in their own words, and gets help only when they ask
for it. The learner's text is the artefact. A correction is a proposal. Nothing replaces the learner's words unless the
learner presses *Accept*, and the words that were there before stay in the version history.

It lives in GoReview at `#/tell`. The package here has no DOM; the screens are in `packages/goreview/app/screens/tell/`.

## Independence

GoTell is a sibling of GoReview, not a part of it. It starts from the Repository API (item knowledge, private documents,
preferences) and the learner's own local area (device copies of drafts, the offline queue, the local event log for the
learner's own writing events and goals). It never reads or writes a review schedule, a session or anything else of GoReview.
A learner with no review history gets the whole workspace. `test/gotell-ui/workspace.test.ts` scans the imports of the
screens, the engine wiring and `src/workspace` for that, and `test/gotell/boundary.test.ts` scans this package.

## Layout

| Folder | What it holds |
| --- | --- |
| `src/types.ts` | every domain type (modes, prompts, issues, corrections, the ladder, drafts, versions, evidence) |
| `src/engine/` | `createAnalyzer` (checks a draft sentence by sentence), `createAssistance` (the ladder), `judgeAuthorship` |
| `src/prompts/` | the prompt registry, `promptsFor`, `selectPrompt` (with its reason), `guidanceFor` |
| `src/profile/` | `buildWriterProfile`: what the Repository knows about the learner's production, plus their goals |
| `src/documents/` | the draft stores (account, device, syncing), `newVersion`, `restoreVersion`, diff, export |
| `src/evidence/` | `writingEvidence`, `correctionAccepted`, `correctionRejected`: events with hashes and counts, never text |
| `src/privacy/` | the privacy statement, export of everything, deletion, device cleanup, the remote-assistance gate |
| `src/workspace/` | the **port** the screens depend on (`TellEngine`, `TellHost`), the writer session logic, goals, draft helpers |

`packages/goreview/app/tellEngine.ts` is the one file that wires the real modules and the language pack runtime to the port.
A test passes a fake through `tellOverrides.engine` (`packages/goreview/app/screens/tell/overrides.ts`).

## Modes

`free` (no prompt), `guided` (pick a prompt with a goal), `testimony` (prompts shown as an unordered set: write only what is
true for you, skip what does not apply), `missionary`, `narrative`, `targeted`.

*Targeted*: the learner types what they want to say **in English**. That text is used on the device to choose familiar words
and a pack pattern as a frame. It is not sent anywhere, not saved with the draft, not in an event. GoTell does not translate
it. A model for a targeted sentence (Level 6) comes only from a sentence the language pack attests, or from a remote
assistant, and the remote assistant is off (see Privacy).

## The ladder

After *Analyse*, each place the checker found is marked with its class (probably wrong, meaning unclear, acceptable but
awkward, regional variation, register difference, stylistic alternative, uncertain) and a coverage line says what this checker
cannot see. Nothing in the text changes. For each place the learner climbs one step at a time, in order:

1. **Identify**: where to look.
2. **Hint**: the type of problem, in the pack's words.
3. **Suggest**: the word or construction to look at (the replacement is named, not applied).
4. **Show correction**: the revised sentence, why, and a meaning-change warning when there is one.
5. **Alternatives**: other ways, or an honest "none is known".
6. **Model expression**: only on request, and it needs a second, explicit confirmation. It shows where the wording comes from
   (the learner's own earlier sentence, a pack sentence, or a consented remote proposal) and its review state. If none can
   be given the step is shown as *not given*, with the reason.

*Accept correction* (from step 4 on) replaces that one sentence only. If the text had changed since the last version, a
version of the earlier text is made first. A correction that changes the meaning cannot be accepted in one click: the
screen says "this changes the meaning: ... Accept anyway?" and waits for a second click. *Reject* keeps the marker visible but
muted. Both responses are recorded as `CorrectionAccepted` / `CorrectionRejected` events (kind of problem and a sentence
hash, no text). A check is valid for the exact text it was made from; once the text differs it is shown as out of date.

## Authorship

Every saved sentence carries how it came to be: `independent`, `after-hint`, `revised-after-feedback`, `copied-from-model`,
`ai-generated`, `reproduced-later`. It is judged from the steps that were shown, not from a guess. A sentence that equals a
shown correction or model is `copied-from-model` (history, no production credit). That includes a correction the learner
accepted. The evidence summary after *Save* says what was claimed and what was not.

## Storage

- **Autosave** (a few seconds after typing, on leaving the box and on leaving the screen) writes the **device** only, to the
  learner's own area. It never reaches the Repository.
- **Save** makes an immutable version, writes the device copy, then the account (a private document with optimistic
  revisions; a conflict keeps the other device's version open and the learner's own text as a separate draft), then
  submits the writing observation: `submitWriting` when the service answers, otherwise the shell's offline queue. A Save made
  while offline is sent when the learner next opens the workspace online.
- Goals are `PreferenceChanged { key: 'gotell:goal', value: { goalId, text, createdAt, done? }, origin: 'explicit' }` events
  through the shell's queue; the profile builder reads the same convention.
- Keyboard: **Ctrl+S** (or Cmd+S) saves, **Esc** closes open panels and confirmations, Tab goes toolbar, title, prompt, text,
  results. Analysis results are an `aria-live` region.

## Privacy

`#/tell/privacy` states what is kept where and what is never sent, exports every draft with its versions as one file, deletes
or cleans up drafts on the device, and holds the remote-assistance switch (off by default, and it says that no provider is
configured). Drafts the learner deletes are removed from the account and the device.

## What is not here

- **No remote assistant is wired.** The port and the consent gate exist; with no provider, Level 6 can only come from the
  learner's own sentence or the language pack, and otherwise it is refused honestly. Switching consent on changes nothing
  that leaves the device until a provider is added.
- **Albanian (`sq`) only.** Other languages open the workspace, accept writing, versions and saves, and say plainly that they
  cannot be checked yet.
- **Prompts are machine-drafted** and marked as not yet reviewed by a native speaker; pack grammar notes the same.
- No scores, streaks or levels. The profile band is a rough bucket with its basis, never a proficiency label.
- No spell-check or autocorrect in the editor, on purpose: help is something the learner asks for.

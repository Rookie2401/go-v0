# GoTell — architecture as implemented (Prompt 6, Part A)

Status: 2026-10-09 (updated after the §5 fixes of the test report: per-sentence authorship, the one-line coverage, the accept notice,
the consent events and the licences screen). GoTell is the independent writing workspace inside GoPractice. Tests and the browser walk are in
`GOTELL-TEST-REPORT.md`. The writer's text is the artefact; corrections are proposals; authorship is tracked;
nothing is replaced silently.

## 1. The parts

```
packages/gotell/src/
  types.ts        the domain: modes, prompts, writer profile, issues (seven classes), corrections, the six assistance
                  levels, authorship (six kinds), draft records with immutable versions, evidence, the consent-gated remote port
  engine/         analyze (preserve → segment → tokenize → analyse → checker → classify → corrections validated by re-check,
                  no-added-content and meaning-change), assist (the ladder), authorship (judgement rules)
  salvage/        pure pieces adapted from the legacy src/gotell (diff, meaning changes, concepts, coverage, repairs, remote validation)
  prompts/        the registry (47 prompts: 27 language-neutral + 20 Albanian variants), guidance, selection
  profile/        the learner as a writer, read from the Repository (productive vs recognised, weak constructions, recurring errors, goals, band)
  documents/      one private document per draft (JSON record: text + versions + assistance), local store, syncing store with conflict copies
  evidence/       DraftSaved + one qualified ProductionRecorded per sentence, Correction{Accepted,Rejected}; never text
  privacy/        statement, export of all writing, deletion, device cleanup, the remote-assistance gate
  workspace/      the port the screens use
packages/gopractice/screens/tell/   home, prompt picker, writer, goals, privacy; tellEngine.ts wires the real modules
```

Independence (tested): `packages/gotell` imports the contract, the language packs, the sync client and the API
client only; never GoReview, never the shell; it initialises with an empty log, no deck and no session; a learner with
no review history gets the full workflow (acceptance test, second learner).

## 2. The writing loop

1. The writer picks a mode (free, guided, testimony, missionary, narrative, targeted) and, for the guided modes, a
   prompt: a communicative goal with difficulty guidance, vocabulary domains, grammar targets, cultural notes and
   optional pack-attested frames; testimony prompts are an unordered set that say "write what is true for you; skip what
   does not apply"; Scripture prompts ask for the writer's own understanding and supply no doctrine.
2. Guidance comes from the writer's own record (productive units, weak constructions, recurring errors, goals) and the
   pack's machine-drafted grammar notes; never a model paragraph; never a CEFR label.
3. The writer writes. Autosave is device-only. **Analyse** runs the pack's checker; issues are classified
   grammatically-wrong / semantically-unclear / acceptable-but-awkward / regional-variation / register-difference /
   stylistic-alternative / uncertain-analysis (downgraded on low confidence or an uncertain reading; never upgraded),
   each with the pack's hint and explanation. The coverage is one line ("Checked: definiteness, case, agreement, conjugation, particles. Not
   checked: 8 other areas — see details.", from `summariseCoverage`) with the adapter's whole statement and every limit in a collapsed
   "details" element; nothing is dropped, it is only folded away.
4. **Assistance** is a ladder per issue, strictly in order: 1 identify, 2 hint (type of problem), 3 targeted help
   (the word or inflection named, not applied), 4 correction (shown with its explanation; a change of meaning is flagged
   and blocks one-click acceptance), 5 alternatives (variants/register when the pack knows one; otherwise it says none
   is known), 6 model expression only on an explicit second request, from the writer's own earlier independent sentence,
   a clean pack sentence, or (consent-gated; no provider is wired) a remote assistant whose proposal is validated by the
   checker, the no-added-content rule and the meaning-change check before it may be shown.
5. **Accept** replaces one sentence and snapshots the earlier text; **Reject** keeps the issue visible but muted; both
   are recorded as `CorrectionAccepted` / `CorrectionRejected` (ids and categories, never text). Before the Accept button the screen says
   that an accepted correction counts as copied from the model and earns no production credit.
6. **Save** creates an immutable version with per-sentence authorship judged from the steps shown FOR THAT SENTENCE (every
   `AssistanceStep` records its `sentenceIndex` and a hash of its sentence; a sentence no step touched is independent even when its
   neighbour was helped; a legacy step with no sentence reference falls back to the whole-round rule): independent,
   after-hint (levels 1–3), revised-after-feedback (a correction was shown and the text differs), copied-from-model
   (equals a shown correction or model), ai-generated (equals a remote proposal), reproduced-later (an earlier assisted
   sentence written again independently). The draft goes to the account as a private document with optimistic
   revisions; conflicts between devices become conflict copies, never a silent loss.
7. **Evidence**: `DraftSaved` and one `ProductionRecorded` per sentence with `authorship`, `assisted`, the assistance
   kinds and `usedCorrectly` (true only for a sentence the checker covered and found clean; never from an accepted
   correction); copied and AI-generated sentences carry `evidence.quality: 'none'`. The Repository folds these with
   GoLearn's and GoReview's evidence; GoTell assigns no mastery.

## 3. Theological precision

The checker and the meaning-change rules (negation, chronology, key terms, tense) flag any correction that changes
what is said; such a correction is shown with the flag and cannot be accepted in one click. GoTell supplies no
doctrine in prompts or guidance, offers alternatives rather than a single "natural" rewrite when meaning is ambiguous,
and never bundles Scripture; the writer remains the authority over their own testimony.

## 4. Privacy

Drafts are private documents under the learner's account (kind `draft` or `testimony`); nothing is shared with a
team; autosave stays on the device; export (json / text / markdown, and all writing at once) and deletion are the
learner's; remote assistance is off by default and no provider is configured. The switch is a local flag that also writes a `ConsentGiven` /
`ConsentWithdrawn` event (scope `gotell:remote-assistance`, no text) through the shell's event queue: switching on records first and
switches on only if the record is accepted; switching off takes effect at once. The gate in front of a provider and the assistance ladder
both read the switch on every call and accept only the boolean `true`. Events never carry text; diagnostics redact to lengths.
The privacy page links to Settings → "Licences and attribution", which shows the shipped `THIRD-PARTY-NOTICES.md` (the dictionary's
source URL, edition and changes, ts-fsrs) and falls back to a short statement when the file cannot be fetched.

## 5. Honest limits

Albanian only (Spanish loads but has no checker coverage worth the name); the checker misses coordinated subjects,
object-without-preposition errors and some agreement cases (listed in the engine README); prompts, frames and
cultural notes are machine-drafted and unreviewed; accepting a correction wholesale counts as copied, so it earns no
production credit (by design, and now said before the click); a Save during feedback can lose that one unsaved answer if the page dies.
Still open: per-sentence matching is by position and sentence hash, so if a hinted sentence is deleted and another moves into its
position, that one is judged after-hint (conservative: it under-credits); the "checked areas" list is a hand-kept table for Albanian
only (other languages say it is not recorded); no remote provider exists, so the consent record and gate are exercised only with test
doubles; the Wiktionary revision and the exact `+tables` download address of the dictionary are not recorded (said so in the notices).
Goals are stored under the payload key `label` because the contract now refuses a `text` key (older goal events with `text` are still read).

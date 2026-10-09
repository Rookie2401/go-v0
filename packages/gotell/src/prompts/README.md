# GoTell prompts, writer profile and guidance

`registry.ts` holds the writing prompts. A prompt is a communicative goal; it never contains the learner's content.

## Fields (`WritingPrompt`, `../types.ts`)

| Field | Meaning |
|---|---|
| `promptId` | `<category>.<slug>`; a language-specific variant is `<base>.<languageId>` (today `.sq`). |
| `category` | `personal-background`, `mission-communication`, `testimony`, `scripture-theology`, `general`. |
| `languageIds` | `['*']` for a language-neutral instruction; otherwise the languages it is written for. |
| `teams` | Team ids it suits (`albania` …); empty means all. |
| `goal`, `instruction` | English, addressed to the writer ("you"). Never first person, never an example of what to say. |
| `difficulty` | `first-sentences`, `short-paragraph`, `connected-paragraphs`: guidance for the writer, not a level label. |
| `vocabularyDomains` | Topic tags used to find familiar words (`family`, `home`, `faith` …). |
| `grammarTargets` | Pack construction ids or feature keys (`negation-nuk`, `Tense` …). Only on language-specific variants. |
| `culturalNotes` | Short, factual, neutral (forms of address, hospitality, religious plurality). |
| `frames` | Optional pack-attested sentence frames (a pack sentence with one word blanked `___`), shown only on request. Never on testimony or Scripture prompts. |
| `validation` | `{ authorship: 'machine-drafted', reviewed: false, reviewNeeded: 'native speaker / field worker' }`. |
| `section` | Optional topic tag for testimony-style prompts. A tag, never a position. |

## Categories and counts

Personal background 5 · Mission communication 5 · Testimony development 6 · Scripture and theology 6 · General 5 (27 language-neutral prompts), plus 20 Albanian variants (`.sq`) that add grammar targets, frames and cultural notes. For Albanian the variant replaces its neutral base in `promptsFor`.

## Rules

- **No template.** A prompt names what to express. It supplies no model paragraph, no pre-written testimony and no doctrine. Scripture and theology prompts ask for the writer's own understanding; the writer chooses any passage.
- **No fabricated experience.** Instructions are written in the second person. A test checks that no instruction or goal is in the first person.
- **No required order.** Testimony prompts are optional topics in any order. Each says "Write what is true for you; skip what does not apply." The registry has no sequence number; `promptsFor` returns registry order, which carries no meaning.
- **No level labels.** No CEFR string appears in any prompt, note or guidance.
- **Frames are attested.** `validatePrompt` checks that each frame matches a sentence in the pack (tutorial examples, demonstration passage, validation cases).

## Review status

Every prompt, every cultural note and every grammar target is machine-drafted and **unreviewed**. The needed reviewer is a native speaker (Albanian text, frames and notes) and a field worker (mission and testimony wording). Nothing here is to be presented as reviewed until `validation.reviewed` is set by a named reviewer.

## Other modules

- `../profile/profile.ts` builds the `WriterProfile` from the Repository (productive units vs units met only in reading, weak constructions, recurring errors, goals, band with its basis). Goal events: `PreferenceChanged` with `payload.key === 'gotell:goal'`.
- `guidance.ts` builds `Guidance` (lead, at most three suggestions, weak constructions to watch, familiar words, honesty lines) from the profile and a `GuidancePack`; `pack-source.ts` builds that pack object from a language pack's manifest and tutorial.
- `select.ts` chooses a prompt: weak-construction overlap first, then prompts not yet seen, always with a stated reason.

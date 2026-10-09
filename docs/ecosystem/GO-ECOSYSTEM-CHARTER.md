# Go Ecosystem Charter

Status: adopted 2026-10-08 by the owner's directive ("Go ecosystem architectural reset"). This document restates the
product decisions that are now binding, the principles every design must satisfy, and the vocabulary the other
ecosystem documents use. It does not describe the old system; `LEGACY-SALVAGE-AUDIT.md` does that.

## 1. What changed and why

The previous product tried to deliver whole language courses from zero to B2: Stage 0, graded reading ladders,
bundled literary corpora, Scripture libraries, recordings, writing practice. It is retired as a strategy. The
decisive reason is that obtaining, verifying, maintaining and redistributing a large collection of copyrighted
literary and religious text across six languages and several jurisdictions is not a sustainable product; the audit
of 2026-10-07 showed that nothing beyond Scripture and a handful of open libraries could ever be published, and
every unit written was a machine draft waiting for a reviewer who did not exist.

The new product does not own the learner's library. Learners read what they lawfully have: Kindle, Kobo and other
ebook readers, authorised websites, local files they are entitled to use. Go provides a contextual linguistic
intelligence layer that accompanies that reading, a practice application fed by what the learner actually met, and
one shared learner record behind both.

## 2. The two applications

### GoLearn

A lightweight setup, onboarding and settings application whose working surface is a reader extension.

The application proper: establish or connect the learner's Go Repository identity; choose a mission team and target
language; provision the language pack; guide the installation of the supported reader extension; teach the absolute
essentials of the language (short, practical, not an A1 course in disguise); teach the extension by demonstration
(click a word, see lemma and morphology, read the contextual explanation, hear it, see the encounter recorded);
settings for languages, teams, extensions, accounts, privacy and synchronisation.

The extension: identify the words and phrases the learner selects; obtain sentence context when the reader and its
terms permit; analyse them in context; present lemma, meaning, morphology, grammar and phrase information; request
pronunciation from GoListen; record meaningful interactions as learner events; adapt its help to the learner's
evolving knowledge; work without audio; stay out of the reading's way.

### GoPractice

A separate, intentional practice and writing application with two independent workspaces that share only the shell,
authentication, design system and Repository integration.

GoReview: spaced repetition over what the learner has met; intelligent selection of worthwhile material; scheduling
from actual review performance; written recognition and retrieval; auditory recognition through GoListen;
grammatical and phrase-level assessment; feedback into the learner model.

GoTell: independent dynamic writing; personal testimony development; mission-related prompts; contextual grammatical
and lexical help; original composition and correction; its own feedback into the learner model. GoTell is not a
child of GoReview; neither requires the other.

### GoListen (shared subsystem, not an application)

Pronounces words and permissible phrases; supplies phonetic and phonological information; supports contextual
pronunciation analysis; contributes independent listening evidence only when an aligned, reviewed recording exists;
records playback without equating playback with comprehension; and serves GoReview's listening-recognition
exercises. One engine, two uses: ordinary playback and structured listening assessment.

### The Go Repository (shared infrastructure, not an application)

Stores or provides: shared linguistic knowledge; language-pack identities and versions; learner profiles; encounter
evidence; parser results and provenance; reading-, listening- and productive-recognition estimates; review items,
schedules and outcomes; writing activities and corrections; personalised relationships and priorities; sync and
device information; privacy, export and deletion controls. It keeps immutable historical evidence apart from derived
interpretations, and no application overwrites another's evidence.

## 3. Binding principles

1. Two applications only; the browser extension is part of GoLearn.
2. One authoritative learner-data model shared by both applications.
3. Reader independence: no morphology engine coupled to Kindle-specific code.
4. Language independence: no single-language domain architecture.
5. Text-first acquisition: GoLearn is useful without audio.
6. GoListen is an optional shared capability.
7. GoReview and GoTell are independent siblings.
8. No giant bundled literary corpus.
9. No rebuilding of grade-based shelves or the Stage 0–B2 curriculum.
10. No bypassing of digital rights management, ever.
11. No silent bulk extraction of copyrighted ebooks.
12. No persistent shadow copies of commercial books.
13. No automatic transmission of private reading passages or writing to external AI providers without informed
    permission.
14. No false claims about language accuracy, proficiency, reader compatibility or rights clearance.
15. Preserve valuable existing engineering rather than deleting it.

Every learner-facing statement distinguishes an established fact (a dictionary entry with provenance, a reviewed
analysis), an estimated analysis (the parser's best reading with its confidence) and an uncertain inference (a
learner-state estimate with its basis and its limits).

## 4. Evidence discipline (the inferential errors the Repository refuses)

| observation | what it supports | what it does not support |
|---|---|---|
| a page or sentence was displayed | exposure to its words | that any word was read or understood |
| a word was clicked / looked up | the learner met it and wanted help with it | understanding |
| audio was played | exposure in the listening modality (when real speech) | listening comprehension |
| a flashcard was answered correctly once | one retrieval of that item in that context | general fluency, or knowledge in another modality |
| a review was answered correctly repeatedly over widening intervals | retention of that item in that card's form | transfer to unseen contexts |
| a sentence was written and accepted by a checker | production of those items | correctness beyond what the checker can see |

Every derived estimate names the observations behind it and a confidence; a reader of the estimate can always get
back to the events.

## 5. Teams, languages and packs

A mission team is not a language. Independent identifiers exist for organisation/team, language, language variety,
script or orthography, language-pack version, learner enrolment and learner-chosen goals. Illustrative mappings:
Team Albania → Albanian; Team Honduras → Spanish with Honduran regional preferences; Team Germany → German; Team
India → Hindi when selected, without assuming every India team uses Hindi; Team Thailand → Thai; Team Norway →
Norwegian with the written standard (Bokmål / Nynorsk) explicitly configured, never guessed. A learner may change or
add teams and languages without corrupting history. One extension engine with separately installable language packs
is the model; team-branded builds, if wanted, come from the same implementation.

## 6. Vocabulary

- **Language pack**: the versioned, separately installable bundle of a language's analyser, lexicon, dictionary
  references, pronunciation rules and licences.
- **Reader adapter**: the part of the extension that knows one reading environment (a website, an ebook reader's web
  app, a local-file viewer) and how to obtain the selected word and its permitted context there.
- **Encounter**: one meaningful meeting of one item in one sentence context, in one modality, in one sitting;
  derived from events, never emitted.
- **Event**: an immutable record of something the learner did or was shown, with provenance.
- **Derived state**: everything computed from events by a pure, versioned fold; rebuildable on any device.
- **Vertical slice**: the Albanian proof in `IMPLEMENTATION-ROADMAP.md` §2 that must pass before any expansion.

## 7. The documents of this charter

`LEGACY-SALVAGE-AUDIT.md` (what exists and what becomes of it), `GO-REPOSITORY-DESIGN.md` (the shared data model and
its boundaries), `GOLEARN-EXTENSION-STRATEGY.md` (the extension, reader adapters, language packs),
`GOPRACTICE-DESIGN.md` (GoReview and GoTell), `RIGHTS-AND-PRIVACY-BOUNDARIES.md` (decisions per source category and
activity), `IMPLEMENTATION-ROADMAP.md` (sequence, the vertical slice, ownership), `BASELINE-TEST-REPORT.md` (the
measured state of the code before any change).

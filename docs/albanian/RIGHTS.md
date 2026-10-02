# Albanian course — rights procedure (2026-10-01)

The machine-readable truth is `src/course/albanian.ts`. This document explains the rules it follows and the steps a
person takes to change a record.

**Today no external Albanian text is verified.** Of the 30 works in the manifest, three are written for the course
(`course-authored`, machine-drafted, not reviewed by a native speaker), 21 are candidates (`rights-unverified`) and six
are modern books for the learner's own copy (`prohibited-from-bundling`). Nothing external is bundled or published.

## Rules, without exception

1. **Listed is not bundleable.** A work in the catalogue is a candidate or a recommendation until an exact edition has
   passed the review below.
2. **Old is not a legal basis.** "Found online", "old", "on Wikisource" and "probably public domain" are not permissions.
   A date of death or of publication is a lead (`authorDied`, `publicationYear`), never a conclusion.
3. **Unknown means do not ship.** `rights-unverified` and `prohibited-from-bundling` are never bundled.
4. **Rights attach to an exact edition, not to a work** (see "The layers of an old work").
5. **A statement for one country is not a worldwide statement.** The jurisdictions that were actually checked are named
   (`statusByJurisdiction`, `jurisdictions`); one never implies another.
6. **A source site's own terms count** whatever the copyright status of the text (`sourceTerms`).
7. **Text and audio are separate.** No Albanian recording is bundled; audio is not part of V1.

## The brief's classes and the code's states

| The owner's brief | Code (`RightsState`) | May be bundled |
|---|---|---|
| GOLEARN_OWNED | `course-authored` | yes; machine-drafted text still needs native review before it is published |
| OPEN_LICENSE | `verified-open-licence` | yes, with its evidence record, when the app meets the licence |
| PUBLIC_DOMAIN_VERIFIED | `verified-public-domain` | yes, with its evidence record |
| LICENSED | `permission-granted` | yes, with the written permission on file |
| USER_SUPPLIED | `user-supplied` | never: the learner's own lawful copy, on his device only |
| RESEARCH_ONLY | `research-only` | never: a treebank or reference edition kept for validation, never shown as course text |
| BLOCKED | `prohibited-from-bundling` | never |
| UNREVIEWED | `rights-unverified` | never |
| (not in the brief) | `recommended-only` | never: the app only points at the learner's own copy and holds no text |

## What the build enforces

Only the four states in `BUNDLABLE_WORK_STATES` (`src/ingest/rights.ts`) may ship: `verified-public-domain`,
`verified-open-licence`, `permission-granted` and `course-authored`. The rule is enforced by the machine, not by
memory: the Vite rights gate removes or refuses documents while bundling, and `npm run rights:check` applies the same
rule to the repository. A state other than `course-authored` also needs `verifiedBy` and `verifiedAt` on the catalogue
record, or the document is refused. There is no state that means "probably public domain".

## What a verification record contains

A work moves to a verified state only when a person has filled the evidence fields of `WorkRights` (`src/core/course.ts`):

- `state`, `verified: true`, `verifiedBy`, `verifiedAt` — who checked, and when
- `basis` — why we believe the status (death year plus term, licence text, publisher statement), and how sure
- `jurisdiction` and `jurisdictions` — every jurisdiction the basis was checked for; `statusByJurisdiction` — the status found in each ("US", "AL", "EU")
- `sourceRepository` — the repository and the exact page or file the text was taken from
- `licence` — the licence the source states, verbatim, with where it says so; `attributionRequired`, `shareAlike`, `commercialUse`, and `compliance` (how the app as built meets the conditions)
- `modifications` — what was changed on the way in
- `retrievedAt` and `checksum` — when it was retrieved and the sha256 of the retrieved file or page
- `proofreading` — the source's own proofreading state, or "unknown"
- `evidence` — the evidence itself, one statement per line: who died when, which edition, what the source page says
- `sourceTerms` — contractual limits of the source site
- for an old work, the layer fields below: `countryOfOrigin`, `editionYear`, `scanSource`, `transcriptionSource`, `modernizationSource`
- `canModify`, `canStoreOffline`, `canBundleAudio` — what the app may do with the text

## The layers of an old work

An old work is several things at once, and each has its own answer:

1. **The work** — the author's text. Its term depends on the author's death, on where and when it was first published
   (`countryOfOrigin`), and on the country asked about.
2. **The edition** — a particular printing (`editionYear`). Posthumous editions and editors' arrangements can carry
   rights of their own.
3. **The scan** — a library's or a project's image of the edition (`scanSource`). The holder may state terms of use.
4. **The transcription** — the text typed or recognised from the scan (`transcriptionSource`). A modern transcription
   may carry rights the old work does not.
5. **The modernisation** — a normalised or modernised spelling (`modernizationSource`; `Work.modernization`). A new
   spelling is a new text.
6. **The translation** — a translation into Albanian or from it is a work of its own, with its own translator
   (`translatorDied`).
7. **The notes** — introductions, apparatus, glossaries and commentary added by a modern editor.

Kostandin Kristoforidhi's nineteenth-century translations are the example in the manifest: each of the seven layers
above needs its own check before any text could be used.

## Why life plus 70 in Albania does not settle United States status

The Albanian term is commonly the author's life plus 70 years. That is a statement about Albanian law. The United States
counts differently (largely from the date and manner of first publication, with its own rules for works first published
abroad), and a modern edition, transcription or modernised spelling may carry rights that outlast the old work. So an
author who died long ago is a good lead and nothing more. The same applies the other way: an author who died in the
twentieth century (Fan S. Noli, died 1965, is in the manifest) is nowhere near the public domain by a life-plus-70 rule.

## Wikisource is discovery only

Wikisource, like any other library or website, is a place to find a text. It is not a verification: its own label for a
text, the date it states, and the proofreading state of a page are things a verifier records and checks, not conclusions
to copy. A site's label such as "public domain in the United States" does not identify the edition and does not speak
for other countries. That is exactly the position of the Albanian Bible record `bibla-alb` today.

## What a verifier does, step by step

1. Pick one candidate and identify the **exact edition** that will be the source: title, publisher, place, year, editor.
   If this cannot be identified, stop: the candidate stays a candidate.
2. Identify **every layer** in use (scan, transcription, modernisation, translation, notes) and who is responsible for each.
3. Establish the author's (and translator's, and editor's) **dates of death** from a catalogue or the book itself, and
   the **country and year of first publication**.
4. For **each jurisdiction** the app will be distributed in (at least the United States and the source country,
   separately), work out the status and write it down with the reasoning. Record only what was actually checked.
5. Read the **source's own terms** and any licence it states for its transcription or scan; record them verbatim.
6. Decide whether the app's use is covered: bundling, **modifying** (analysis, annotation), storing **offline**,
   commercial use. If a licence is attached, record how the app meets its conditions.
7. Retrieve the text, record `retrievedAt` and the `checksum`, and compare the wording against the source (for Scripture,
   `scripts/verify-scripture.mjs`).
8. Fill the evidence fields, set `state`, `verified: true`, `verifiedBy` and `verifiedAt` in `src/course/albanian.ts`,
   and run `npm run rights:check`. Do not describe a record as verified from memory or from a website's label.
9. If any step cannot be completed, the work stays `rights-unverified`. Nothing is bundled on a partial answer.

## The Albanian Bible commonly labelled ALB

The coordinator read a Bible website's version page on 2026-10-01. It says the text is in the public domain in the
United States and that it has no further information about the version's publication history. That does not identify
the edition, the translator, the year, or the status outside the United States, and a website's label is not a
verification. The record `bibla-alb` therefore stays `rights-unverified` with `statusByJurisdiction: { US: 'unknown' }`.
The three-verse sample in `data/corpus/sq/bible-1john-1.json` is of unidentified origin; it is a technical fixture and
never ships. The policy is in `ALBANIAN_SCRIPTURE_POLICY`.

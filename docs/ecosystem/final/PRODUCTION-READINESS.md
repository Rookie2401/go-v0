# Production readiness — the Albanian reference system (Prompt 6 §26)

Status: 2026-10-09. Twenty gates, each with the evidence that was actually run. A gate is marked only from what was
observed; limits are stated beside the mark. The classification at the end follows from the marks, not the other way
round.

## 1. The gate (whole repository)

```
npx vitest run --reporter=dot
Test Files  2 failed | 566 passed (568)
Tests       2 failed | 13142 passed (13144)       # 368 s under load; one transient "vitest-worker Timeout calling snapshotSaved"
npx tsc -b                                        # exit 0
```

The two failures are the pre-existing retired-corpus integrity tests (`test/bench/sq-library-assets.test.ts`,
`test/content/curriculum-remediation.test.ts`), which bind the retired course's source bytes; they are unrelated to the
two applications and the Repository (ARCHITECTURE-CONFORMANCE: nothing reachable from an app entry depends on them).
They are reported, not excluded. No `it.fails` remains in any audit lane except the P-12 finding.

## 2. The twenty gates

| # | gate | mark | evidence | limit |
|---|---|---|---|---|
| 1 | GoLearn setup works | pass | built setup app against the real service in the browser: account, service address, enrolment refusal then enrolment, pack install (END-TO-END-INTEGRATION §6); `test/golearn-app`, certification steps 1–4 | — |
| 2 | Albanian pack installation works | pass | "Installed Albanian 9. Verified: all 16 checks passed" in the browser; `test/language-packs` | the pack is machine-drafted, unreviewed |
| 3 | Minimal onboarding works | pass | the orientation completed step by step in certification step 4, including the practice lookups; Prompt 4 walk | not re-walked in the browser today |
| 4 | At least one authorized reader integration works | pass, with limits | web pages: real pointer selection and cards on local harness pages with the final content script (READER-COMPATIBILITY-RETEST §2–3); the local EPUB reader prototype (§4) | not verified as an installed extension on a third-party site; Kindle blocked; Kobo unsupported |
| 5 | Contextual parsing is functional and tested | pass | certification steps 6–8; LINGUISTIC-ACCURACY (tokenisation 401/401, lemma 90.4 % strict, morphology exact 70 %, disambiguation 36/41) | accuracy is a model's judgement, not a native speaker's; morphology exactness is the weakest measured layer |
| 6 | Encounters persist | pass | certification steps 10, 38; Prompt 4 browser walk with the worker; today's walk through `/events` | — |
| 7 | GoListen playback behaves honestly | pass | no Albanian voice: the card and GoReview say so and claim nothing; synthetic speech is never listening evidence (weight 0, `listen.evidence`) | — |
| 8 | GoPractice works | pass | built GoPractice in the browser against the real service: sign-in, home, session, summary, sync (END-TO-END-INTEGRATION §6) | — |
| 9 | GoReview generates real exercises | pass | "What does “libër” mean?" from pack facts, graded, with provenance note; 8 exercise families tested; 36/39 review questions judged right (LINGUISTIC-ACCURACY) | built from machine-drafted facts |
| 10 | Scheduling works | pass | ts-fsrs 5.4.2 / FSRS-6.0, frozen vectors, §18 lane (`scheduler.*`), certification step 19 (reps, due) | the model's retention estimate is not validated against learners |
| 11 | Listening assessment is valid where supported | pass, vacuous for Albanian | the software path is valid with a declared fixture (hidden answer, separate estimate); no language has validated audio for evidence today | nowhere supported for real learners yet |
| 12 | Skill dimensions remain separate | pass | certification steps 17, 24, 42; `model.dimensions` | — |
| 13 | GoTell operates independently | pass | import scan, no-history learner, certification step 37 | — |
| 14 | Writing drafts persist | pass | private document revision 1 on the real service from the built app; versions, conflict copies | — |
| 15 | Original authorship is preserved | pass | immutable versions, per-sentence authorship (after-hint / independent) on the real service | authorship by sentence position: a deleted hinted sentence can shift the mark to a neighbour (documented) |
| 16 | The Repository integrates all three evidence sources | pass | three producers in one history; projection folds them; replay equals live state (steps 38–40) | — |
| 17 | Updated knowledge reaches GoLearn | pass | certification step 28 ("You have met this word N times; reading recognition …"); Prompt 5 walk | not re-walked in the browser today |
| 18 | Security tests pass | pass | 341 tests, 0 `it.fails`; S-01…S-14 fixed | a model's adversarial tests, not a professional penetration test |
| 19 | Content rights are documented | pass (documented, not cleared) | RIGHTS-AND-ATTRIBUTION: inventory, licences, attribution, the distribution scan (no retired corpus, no Scripture), THIRD-PARTY-NOTICES shipped | **legal clearance is not claimed**; eight questions for counsel; the repository LICENSE is the owner's choice |
| 20 | Critical end-to-end tests pass | pass | certification 16/16 (43 steps); GoLearn §17, GoReview §21, GoTell §12 reference tests; whole-repository gate above | the two retired-corpus failures are reported |

## 3. Classification

**Functionally complete but not release-ready.**

Every gate holds on its evidence, and the two integration defects the certification itself exposed (the Repository
never learned the reader's units; GoTell never credited correct use) are fixed and re-verified on the real service.
What keeps it from "verified reference implementation complete":

1. **No native-speaker review** of the Albanian word list, rules, explanations, prompts or cultural notes; the measured
   accuracy is a model's judgement.
2. **No Albanian audio**: listening assessment exists as software only.
3. **No verified reader on a third-party site**: the installed extension was not run on a live site; Kindle is blocked
   by design and will stay so without an authorised integration.
4. **Legal review open**: licences are documented, not cleared; the LICENSE file is undecided.
5. **Accessibility verified by static checks**, not by a screen-reader pass (checklist in ACCESSIBILITY.md §8).
6. **Nothing deployed**: the service has run only locally (SQLite file, no TLS); the owner deploys.

## 4. The smallest next steps toward a credible release

1. Load the unpacked extension in Chrome, run READER-COMPATIBILITY-RETEST §6 on `sq.wikipedia.org`, fix what it finds.
2. Obtain one reviewed Albanian recording set (or a licensed voice) and register it; the assessment path is ready.
3. Commission a native-speaker review of the 20 Albanian prompts, the grammar notes and the 401-token accuracy fixture.
4. Decide the LICENSE and answer the eight rights questions with counsel.
5. One NVDA pass over GoPractice and the card (ACCESSIBILITY.md §8).
6. Deploy the service behind TLS with a backup policy that honours erasure, then run the §14 walk against it.

# GoLearn / GoListen system audit — 2026-10-11

The current source of truth is the Go Ecosystem Charter: GoLearn's reader extension and GoPractice are the two
applications; GoListen is their optional shared pronunciation and assessment subsystem. The former course application
under `src/ui` and its different `src/golisten` pipeline remain retired. This work improves the current subsystem and
its hosts rather than rebuilding the former listening application.

## Findings and implementation

| Finding | Resolution |
| --- | --- |
| Pronunciation could start after Stop, dismissal or a newer selection while consent or voices were loading. | Operation generations invalidate stale preparation; the card enables Stop during preparation, ignores stale results and stops speech on replacement. |
| Extension and GoReview accepted different Spanish device voices. | A pure shared tag module now defines all seven languages. Spanish uses es-HN, es-419, es-MX and es-ES. Popup reporting imports only that data, with architecture tests enforcing the boundary. |
| Prepared networked device speech could run after consent withdrawal. | The shared driver checks current consent before start and resume. The extension refreshes consent again before sending speech. |
| Disposing an old handle could cancel a newer utterance through the browser's global speech queue. | Drivers track the active owner per speech engine; replaced handles cannot control it. |
| Duplicate or late terminal callbacks could change completion state or count hearing twice. | A hearing invalidates its callback token on its first end, error or interruption. |
| Unknown or altered assessment metadata could promote listening evidence. | Scoring requires the original unchanged stimulus issued by the stable assessment source and its private authoritative eligibility. |
| Remote audio URLs and prefetched stimuli lacked complete cleanup. | Prepared stimuli have explicit release; playback disposal revokes owned URLs. GoReview releases committed, skipped, rejected and discarded preparation, including unused prefetch. |
| GoPractice could begin stale playback after leaving a prompt. | Playback generations and stimulus identity reject stale asynchronous setup; navigation stops managed audio while preserving an unanswered prompt for reopening. |
| Speech timeout ended at response headers, allowing stalled body downloads. | The server deadline covers JSON/audio consumption and returns upstream-timeout on body aborts. |
| Grade-correction controls repeated the same accessible name. | Each Undo control now names its item, skill and review position. |

## Current capabilities and limits

The shared registry offers strict device-voice templates for Albanian, Spanish, German, Hindi, Thai, Bokmål and
Nynorsk. Remote Azure voice entries exist for sq/es/de/hi/th; remote use requires learner consent and a configured
speech proxy. The German greeting recording remains a demonstration, not a production assessment corpus.
No new voice recordings, native review, Azure credentials or production speech deployment were added by this audit.

Ordinary playback remains exposure, with no comprehension claim. Synthetic speech remains practice, never
independent listening evidence. Only suitable reviewed human recordings may support the corresponding assessment
evidence. Unknown, altered, cross-engine or deserialized raw stimuli fail closed; session recovery prepares fresh
stimuli. Retired Reader/Stage0 direct browser-speech paths are outside the current product entry graph and were
identified for any future reactivation review, without modifying them in this task.

Existing uncommitted translation, language, speech setup and registry work was preserved. The registry expansions
already present when this audit started are existing work, not new accomplishments of this task. No commit, push,
deployment, account change or paid provider call was performed.

## Validation

Final test and build results are recorded in the user-facing audit report supplied with this task. Regression
coverage includes deferred consent/voice loading, stop/dismiss/replacement, consent withdrawal, speech ownership,
duplicate callbacks, assessment tampering, URL release, session reopening and body timeouts. Browser APIs and
provider responses are injected in automated tests; this audit does not claim live native-voice quality or Azure QA.

The final acceptance run passed 923 tests in 50 files. The broader current-product integration passed 1,266 tests
in 89 files, with seven optional live tests skipped. These counts overlap. Type checking, fresh extension/local
application builds and whitespace checks passed. Expected font assets and their licence were verified in build
output despite the build-time font-path warnings.

The older Albanian certification fixture now follows the current contracts: New vocabulary remains excluded from
automatic review, written practice is explicitly learner-requested, audio completes before answering, and review
events restore in their dependency order while independent events are shuffled. The existing evidence audit now
requires unknown-source forgeries to fail rather than preserving its former defect characterization.
The service-performance fixture also explicitly selects its New-stage units for practice; its six-test rerun passed.

The broad repository audit also reproduces two legacy corpus-integrity failures already recorded before this task:
the Albanian source hash in `test/bench/sq-library-assets.test.ts` and a German attribution mismatch in
`test/content/curriculum-remediation.test.ts`. Corpus assets were not changed here. A legacy path test hit its
20-second timeout during the broad run and passed its isolated eight-test rerun with a 60-second import allowance.

The broad 679-file run completed with 15,242 tests passed, 23 failed and nine skipped, plus a worker snapshot-save
timeout. It started before final edits and loaded intermediate versions. The affected current/audit files have
passing final reruns; the two legacy content mismatches remain. This run is not a clean full-suite pass. Later audit
reruns also validate the shared Spanish policy, explicit secondary grammar practice, current projection version and
the zero-as-uncapped session preference.

Three available-model workers completed the execution lanes after the user approved substituting available workers
for unavailable Luna. No Luna workers started. The lead reviewed and integrated the changes and added GoPractice
host cancellation, architecture assertions and this audit documentation.

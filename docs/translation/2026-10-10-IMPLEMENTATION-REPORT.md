# GoLearn Albanian audit and sentence translation

Team routing: Sol lead, three GPT-6 Luna workers, with the user's explicit authorization to substitute GPT-6 Luna for the skill's unavailable GPT-5.6 Luna. Work ran in `C:/Users/CJWal/dev/go-v0`. Implementation commit: `f86d6446`. No push was made.

## Audit and concrete corrections

The previous Sentence view was a list of word-level glosses, explicitly offering no machine translation. The Albanian analyzer failed to bridge the literary Gheg spellings `vuejtun` and `kënaqun`; ending-based fallback could guess unconfirmed nouns. The two exact spelling correspondences now lead to articulated adjective readings for `i vuajtur` and `i kënaqur`. Original written tokens and dialect/spelling evidence remain available. Mismatched linking articles are not merged into these two literary adjective units when a known overt noun rules the article out. This is deliberately restricted to these two forms; existing production-checker agreement diagnostics remain covered.

The exhaustive **inventory** covers 1,352 seed lexemes and 31 construction entries. It counts no empty glosses or empty construction explanations/examples, seven verbs without at least one principal-part field, and two articulated adjectives without explicit variant fields. Those counts are not an expert correctness review of every definition. The built Albanian dictionary indexes 91,271 entries but lacks full headword records for the two Gheg spellings and their Standard participles; the related verbs supply participle and sense information. Dictionary sense tags distinguish transitive, intransitive and reflexive meanings. No missing etymology, IPA, audio, or grammar data was invented. See [the detailed audit](../albanian/2026-10-10-precision-audit.md) and `scripts/sq-precision-audit.mts`.

## Translation behavior and boundaries

Translation is optional and requested by a separate action under See full sentence. It requires a sentence context and a source-language tag. Its provider architecture is independent of dictionary lookup, grammar analysis and Repository events. Results retain provider, language evidence, dialect warnings, and provenance. Literal translation is not offered because the installed providers have no validated literal mode; word glosses remain a separate data type.

The pipeline first checks one precisely scoped scholarly title reference. Robert Elsie's [Migjeni author profile](https://albanianhistory.org/albanianliterature/authors_classical/migjeni.html) supplies the English title rendering. This matches only the full literary title and narrow formatting variants, not extra words, negation, fragments, or a whole paragraph. The card calls it Reference English and attributes it; it is not represented as newly generated model output or proof of general dialect equivalence.

Other Albanian-to-English requests use an installed local Helsinki-NLP model, followed by the browser's local Translator API if available. Two listed Gheg spellings can be supplied in Standard form to the model, with the changes disclosed; the page's sentence remains unchanged. Natural model results are unreviewed and may be wrong. The raw title produced an unrelated translation in both direct model checks and the first live Brave check. Limited spelling preparation improved it but remained inadequate, which motivated the separate sourced reference. See [the unedited title smoke outputs](ALBANIAN_TITLE_SMOKE.md).

The local service uses pinned model revision `10c8d34bcc202e0d8d75bd454b5e34bbea4c2909`, CPU inference, and local-files-only loading. Model downloads happen during explicit setup, not sentence requests. It binds only to loopback, validates the exact extension Origin and Host, and requires a private token. Its endpoints, request bodies, languages, model responses and sizes are checked. Busy inference, malformed requests and missing models fail closed. It neither retains excerpts nor logs text or tokens. Background-only configuration is not a web-accessible resource; the content script holds no endpoint, token, storage access or network call. No new host permission or browser privacy setting was applied.

No remote provider is installed. The architecture gates any future remote provider on trusted reader-registry `remoteProcessing: allowed`, provider authorization and explicit action; unknown/forbidden permissions do not become allowed through page metadata or user-interface spoofing. This implementation is not a review of every publisher's rights, and user consent is not treated as a source licence.

Universal reader selection, per-language lazy loading, the existing manifest permissions, and Repository contracts were preserved. Translation text and output do not enter dictionary events, learner history, metrics, sync or persisted caches. Stale replies after replacement or dismissal cannot alter another card. The personalized build config and approximately 300 MB model weights remain outside Git.

## Verification

| Check | Result |
| --- | --- |
| Initial focused baseline | 300 tests passed, 5 files |
| Albanian adapter and morphology/course checks | 1,298 tests passed, 15 files |
| Final affected system run | 6,459 passed, 172 suites; 1 live opt-in test skipped in that ordinary run |
| Real local model via content bridge, background worker and authenticated HTTP | 1 opt-in integration test passed separately |
| Python service/model suite | 7 tests passed, including real model inference |
| Type checking | passed |
| Production extension build | passed |
| Bundle invariants and lazy loading | passed in the affected run; no content-script networking or credentials |
| Diff whitespace | passed |
| Whole-repository run | 15,133 passed, 9 failed, 3 skipped across 670 suites; one worker `snapshotSaved` timeout |
| Recheck of the failing suites after UI assertion alignment | 39 passed, 6 failed across 5 suites; no unhandled error |

Logs are `work-translation-baseline.log`, `work-translation-affected-complete.log`, `work-translation-live-model-final.log`, `work-translation-typecheck-complete.log`, and `work-translation-build-final.log`. Tests ran on the shared working tree, which includes pre-existing uncommitted work; they are not a clean-checkout certification of this commit alone. The existing worker stub and its previously untracked test were adjusted to compute the actual lexeme count rather than retain a stale number; they remain untracked along with the user's earlier work, rather than being committed wholesale. The pre-existing pronunciation changes, `osht` spelling addition and lean-worker build plugin were also left outside this commit. Intermediate integration failures from provider wiring, fake-fetch injection and agreement changes were corrected before the affected-system green run. Reader-test timer teardown and gesture tests were made lifecycle-aware.

## Brave verification and remaining work

Luna verified the installed unpacked GoLearn 0.1.0 extension at the expected `dist` path and ID. In the active Albanian reader, selecting the user-supplied title word opened the updated adjective definition and form/grammar notes, and an explicit sentence translation reached the local service. Its garbled output was visibly disclosed as unreviewed. No whole publisher passage was retained or sent to a hosted service.

After the final reference build, the extension temporarily was not listed in Brave. The user approved restoring the same local build. On a refreshed Extensions view it reappeared, and Luna reloaded the existing installation rather than installing another copy. The current reader tab had changed to a different sample, so the final title-reference browser check is still in progress; its unit/UI tests, final bundle tests and build pass.

The whole-repository run completed in 523.40 seconds. Its nine failures included an in-progress translation-reference assertion and two obsolete card-heading assertions, now passing in the isolated rerun. The remaining six failures were reproduced without weakening them: an Albanian source SHA mismatch in `test/bench/sq-library-assets.test.ts`; four listening/event-history/access assertions in `test/certification/albanian-reference-e2e.test.ts`; and an attribution punctuation mismatch in `test/content/curriculum-remediation.test.ts`. The full run also had a worker `snapshotSaved` timeout, which did not recur in the targeted rerun. Logs: `work-translation-full-suite.log` and `work-translation-full-failures-recheck.log`. A complete green whole-repository gate is not claimed. The unrelated source documents, rights signatures and listening fixtures were not changed to force a pass.

Additional native review is needed for definitions, grammar judgments, historical/Gheg prose, sense alignment and model translation quality. The implemented reference covers one exact title; broader natural translation and all Albanian language information are not claimed complete.

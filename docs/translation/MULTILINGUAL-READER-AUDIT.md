# Multilingual reader translation audit

This audit covers the reader sentence-translation path for the seven supported source tags (`sq`, `hi`, `es`, `de`, `th`, `nb`, and `nn`) to English. It is a bounded navigation aid, not a language assessment or a certified translation.

## User action and reader behavior

Translation starts only after the learner presses the sentence translation control. The controller requires a parsed sentence context, then sends the selected sentence and its inferred source-language tag to the configured translation engine. A current-card/request guard suppresses stale responses after the card changes or a newer request starts. The result is shown in the sentence section with provider, source-language uncertainty, and machine-generation labeling as applicable. The existing Migjeni exact-title reference remains narrowly attributed; it does not imply that other Albanian text, or any other language, has a scholarly reference translation.

A language override is marked as user-supplied; document/book metadata and inferred values retain their provenance and uncertainty. When language is unknown, the engine fails closed instead of guessing. Sentence fragments are unavailable for translation. Input and output sizes are bounded. Word-gloss output is not presented as a sentence translation.

## Local model coverage

The background accepts only the seven source tags above and target `en`. The first five each use a pinned direct Helsinki-NLP model. Norwegian Bokmål (`nb`) and Nynorsk (`nn`) retain distinct input/provenance tags but share the pinned `opus-mt-tc-big-gmq-en` North Germanic model. Its model card lists `nob` and `nno` among multilingual source forms; the app does not promise variety-specific performance. The IDs, immutable revisions, licenses, and model notes are recorded in [MODEL_CATALOG.md](MODEL_CATALOG.md).

The local service loads only an already-installed snapshot when a request arrives. It does not fetch model files during a reader request. Missing configuration, service, permission, or model state produces an unavailable message and no translation. This audit does not claim live validation of output quality for every supported language.

## Data and permission boundaries

The page/content side sends a translation request through the extension message bridge; it does not receive the service token or call the loopback endpoint itself. The background validates an explicit-request flag, supported source and target tags, and text bounds. It reads the private packaged local configuration on demand, validates the endpoint as the fixed loopback service, checks the existing loopback host permission, and sends a bounded request with the bearer token. Redirects and credentials are disabled. The service response must name the model pinned for the requested source; newer language requests also require the matching source echo and pinned revision. Returned model metadata is taken from the trusted registry, not copied from the response.

Sentence text and translation results are not added to the extension Repository, word-gloss request, learning-event record, or a translation cache. The local service handles the request on the same device. No remote translation provider is enabled by this local reader path. If a future engine is configured to use remote processing, the controller passes only restrictions from the trusted adapter registry; missing or unknown rights fail closed in the translation engine.

## Limits

Machine output may be wrong, incomplete, or awkward. A supported language tag means a pinned model is available; it does not guarantee the sentence, dialect, or register is handled well. In particular, the shared Norwegian model cannot be treated as a guarantee of Bokmål/Nynorsk distinction. Treat output as a reading aid and verify important meanings independently.

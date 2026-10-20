# GoListen V1 language and assessment mapping

GoListen separates “can play something” from “may assess listening”. A device or remote voice is a pronunciation
practice path. It does not establish pronunciation quality, learner mastery, or listening evidence.

| Course language | Device tags accepted | Remote practice locale(s) | V1 quality boundary |
| --- | --- | --- | --- |
| Albanian (`sq`) | `sq-AL`, `sq` | `sq-AL` | No reviewed recording. The course contains Gheg material; `sq`/`sq-AL` does not claim Gheg (`aln`). Gheg assessment requires separately reviewed Gheg recordings. |
| Spanish, Honduras (`es`) | `es-HN`, `es-419`, `es-MX`, `es-ES` | `es-HN`, `es-MX` | Honduras is the target variety. Other Spanish varieties are never silently substituted, and no synthetic voice qualifies evidence. |
| German (`de`) | `de-DE`, `de-AT`, `de-CH`, `de` | `de-DE` | The bundled greeting is a demonstration clip only; it is not an assessment corpus. |
| Hindi (`hi`) | `hi-IN`, `hi` | `hi-IN` | Practice only until a native-reviewed, assessment-approved recording exists. |
| Thai (`th`) | `th-TH`, `th` | `th-TH` | Practice only until a native-reviewed, assessment-approved recording exists. |
| Norwegian Bokmål (`nb`) | `nb-NO`, `nb`, `no-NO`, `no` | none | A Bokmål device voice is never used for Nynorsk. Device speech remains practice only. |
| Norwegian Nynorsk (`nn`) | `nn-NO`, `nn` | none | A Nynorsk device voice is never substituted for Bokmål. Device speech remains practice only. |

An assessment stimulus qualifies only when all of these are true: it is an independently existing recording, the text
matches the registered clip under GoListen's declared text normalization, the recording has native-speaker review, and the registry explicitly marks it suitable for assessment.
Provider availability, a successful playback, a synthetic model, or a review label by itself is insufficient. The V2
voice policy applies to any future ElevenLabs integration: only an explicitly approved ElevenLabs V2 output may be
considered for provider use, and generated speech still cannot become listening evidence without independent validation.

Ordinary playback is exposure. It produces no mastery or listening evidence event. Practice-only audio exercises may be
shown for rehearsal, but their recorded history carries evidence quality `none` and is excluded from listening-quality
measures.

The current Azure voice identifiers are maintained as synthetic fallback practice mappings and should be rechecked
against Microsoft's [language and voice support catalog](https://learn.microsoft.com/azure/ai-services/speech-service/language-support)
before any production rollout. No live provider call or native quality review is implied by this table.

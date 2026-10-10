# Albanian title smoke check

These are unedited outputs from the local Helsinki-NLP model at revision `10c8d34bcc202e0d8d75bd454b5e34bbea4c2909`. The first two are the user-supplied raw and prepared title forms; no human correction was applied to the model output.

| Input form | Model output |
| --- | --- |
| Raw: “Sokrat i vuejtun apo derr i kënaqun?” | “Socrat did they put them on or did the pig satisfy them?” |
| Prepared: “Sokrat i vuajtur apo derr i kënaqur?” | “Socrat suffering or satisfied pig?” |

The prepared spelling improves recognition of the suffering/satisfaction idea, but both outputs lose the title's intended meaning. The raw Gheg forms trigger a fluent but unrelated phrase; the prepared form still drops the article and leaves the construction fragmentary. This model cannot establish reliable grammar, dialect equivalence, or etymology. These are machine outputs, not native-reviewed translations.

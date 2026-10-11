# FSRS personalization

Scheduling uses the maintained MIT-licensed `ts-fsrs` 5.4.2 implementation (FSRS-6). Personalization uses the official MIT-licensed `@open-spaced-repetition/binding` 0.5.0, which requires Node 20 or later. The installed binding's actual API is used; no approximation or hand-tuned optimizer is substituted.

`server/review/optimizer.ts` is a local Node-only operation. It separates languages and retrieval objectives, excludes assistance, corrected events, duplicates and invalid timestamps, and counts delayed independent retrievals rather than same-day clicks. Its initial experimental gate is at least 400 delayed reviews, 50 targets and 60 days, with both failures and successes. These are conservative application safeguards, not scientifically optimal constants. [Anki's current documentation](https://docs.ankiweb.net/manual/deck-options) warns about histories below a few hundred reviews and recommends infrequent optimization.

The oldest 80% of the temporal record supplies training examples. The later 20% supplies validation examples with each target's prior history. The official binding fits parameters and evaluates both the active profile and candidate on the chronological holdout. A candidate is returned only if log loss improves without worsening binned calibration. Nonfinite metrics, inadequate splits and invalid parameters never activate a profile.

An explicit local operator can run:

```powershell
npx vite-node scripts/optimize-goreview.mts repository-export.json candidate.json sq written-recognition
```

The tool reads an existing export and writes a new candidate report without overwriting the input or an existing output. It does not upload learner history or change the active scheduler. There is no automatic production activation or background fitting after a response. Settings provides explicit candidate import and a return-to-defaults action. These append profile assertions to the shared Repository; prior assertions and each grade's exact parameter snapshot remain available for replay. No claim of improved reading comprehension follows from better predicted recall alone.

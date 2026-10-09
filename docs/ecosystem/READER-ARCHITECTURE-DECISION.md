# Reader architecture decision record

Status: decided 2026-10-08 on the evidence of Prompt 2 (feasibility report, capability matrix, Kindle findings,
measurements). Supersedes the open choice in `GOLEARN-EXTENSION-STRATEGY.md` §1. Revisit when any platform's
rendering or terms change, or when a manual validation in §4 returns a different result.

## 1. Options considered

| option | what it means | evidence for | evidence against |
|---|---|---|---|
| a. browser extension first | MV3 content script on the page the learner reads, user-gesture activation, `web-generic` adapter + per-reader adapters | measured: full contextual lookup on real DOM text in 2.5 ms warm; narrow permissions; no copy of any text | does nothing for Kindle (bitmap); installed path and third-party sites unverified in this phase; store review treats page content as user data |
| b. companion app with a selection bridge | a GoLearn page or app that receives what the learner copies/shares from any reader | the only lawful path for Kindle (Copy, Notebook); works for every reader and app, including native ones | no sentence context unless the learner copies it; manual; no anchors |
| c. local controlled reader | our own EPUB/TXT reader with the `epub-local` adapter | measured: full contextual lookup, CFI anchors, pagination, reflow, DRM refusal; needed as the demonstration reader and test foundation anyway | only for DRM-free files the learner has; never for Kindle/Kobo/Play purchases with DRM |
| d. selection-only mode | the extension reads the selection text only, never context | would run anywhere `getSelection()` works | gives up the sentence where it is available; and Kindle has no native selection at all, so it does not even help there |
| e. combination | a + c + b, with d as the declared degraded mode of a | covers every case the evidence allows, each honestly labelled | three surfaces to maintain |

## 2. Decision

**e. Combination, in this order of investment:**

1. **Browser extension first** for ordinary web pages (`web-generic`), because that is where the measured, full
   contextual experience exists and where learners already read. Degraded, declared modes: selection-only where the
   adapter reports `sentenceContext: 'none'` (cross-origin frames; context-menu `selectionText`), and
   `unsupported` with one honest line everywhere else. No ebook-platform adapter is written until a person has
   reviewed that platform's terms and an authorised session has verified the DOM (manual procedures exist for Play
   Books and Kobo).
2. **Controlled local reader** kept as the demonstration reader, the test bed for anchors/pagination/reflow, and the
   learner's reader for DRM-free books they own. It is never offered as a way to read protected purchases.
3. **Selection bridge** (paste/share into GoLearn) as the universal fallback and the *only* Kindle path, labelled
   "what you copy, under the reader's copy limits; sentence context only if you copy the sentence". Kindle Notebook
   import as a later, user-initiated option after the owner's manual validation.

Rejected: OCR or screenshot pipelines, glyph-mapping, reading reader internals or network payloads (charter 11;
directive); any product text claiming Kindle, Kobo or Play Books compatibility before verification; a companion
desktop app as the primary surface (no evidence it beats the extension where text is readable).

## 3. Consequences

- `packages/golearn-extension/src/contract/` and `adapters/webGeneric.ts`, the parser card model, and
  `packages/controlled-reader/src/{adapter,sentences,geometry}.ts` are production candidates; the rest of both packages
  is disposable (card UI will be rebuilt with the app's design; harness pages deleted when the installed-extension
  tests exist).
- The contract moves to its own package (`reader-contract`) so the controlled reader and the extension share it
  without widening the "apps import only `repository-contract`" rule.
- The Go Repository implementation (Prompt 3) proceeds; the reader question does not block it. The encounter event
  shape produced by the prototype (`SelectionLookedUp` with `sentenceKey`, item ids, `sourceRef`) is the one the
  Repository must accept.
- Roadmap phase 4 ("ebook-reader adapters one at a time") is rewritten: Kindle is removed from the adapter list and
  becomes a bridge; Play Books and Kobo stay as candidates gated on the manual procedures and a terms review.
- The extension's store listing, when it exists, must disclose that it reads the selected text and its sentence on
  the page the user is viewing, only after the user's gesture, and sends nothing anywhere.

## 4. What would change this decision

- An authorised Play Books or Kobo session showing DOM text and a terms review allowing a user-side extension → add
  that adapter under the contract.
- Amazon exposing text in Kindle for Web again (manual step 1 of the Kindle procedure fails) → re-run the Kindle
  findings; the bridge stays until then.
- The installed-extension validation (tests document §6) failing on CSP, frames or store policy → fix or demote the
  extension and promote the controlled reader.

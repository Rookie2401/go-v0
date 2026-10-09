# GoLearn — architecture as implemented

Status: 2026-10-08, Prompt 4. This replaces the plan-level parts of `GOLEARN-EXTENSION-STRATEGY.md` with what exists.
Facts about tests and numbers are in `GOLEARN-TEST-REPORT.md`; installation in `GOLEARN-INSTALL-AND-TROUBLESHOOTING.md`.

## 1. The parts

```
packages/golearn-extension/
  src/background/   the privileged side (service worker): session, service config, API client, sync queue + client,
                    learner-model cache, dictionary shards, recorder, message router with sender checks
  src/content/      the content script: capture → context → parse → card → events, one closed-shadow card per page
  src/parser/       the pipeline over the Albanian adapter: tokens, candidates, morphology, constructions, phrases,
                    sentence words, card model with fact / analysis / inference labels
  src/popup/        the layered card (Layer 1–5), pronunciation button (GoListen device provider), review mark,
                    correction form
  action/           the toolbar popup: per-tab switch, connection and sync status, "Open setup"
  app/              the setup / onboarding application = the extension's options page, also built as a hosted web app
packages/golisten/          shared pronunciation subsystem (contracts, registry, providers, assessment interface)
packages/language-packs/    manifests, the Albanian pack runtime/installer/validation/tutorial, planned packs, TEAMS
packages/repository-*       the Go Repository (Prompt 3): the only place learner state lives
```

Boundaries (tested): the extension and the app import the contract, GoListen, the language packs, the sync client and
the typed API client of the service; nothing else. GoListen and the packs import no application. The content script
imports no network or storage code at all (its built bundle is checked for `fetch(`, `XMLHttpRequest`, storage and
token keys).

## 2. The user experience that exists

1. Install or open GoLearn: the extension is loaded from `dist/` (Chrome Web Store later); the setup page is its
   options page and also a hosted web app that can only *explain* how to install the extension.
2. Create or connect a Repository account: the setup page sends email and password to the background worker, which
   talks to the service; the token lives only in the worker's `chrome.storage.local`.
3. Select a mission team (`TEAMS`: Albania, Honduras, Germany, India, Thailand, Norway with an explicit written
   standard) and 4. the language and variety; team and language are separate ids on the enrolment.
5. Install the language pack: the installer checks the dictionary manifest and a shard, runs the pack's 14 validation
   selections through the real analyser, and records the verification; planned packs say so.
6. Enable the reader integration: per tab, from the toolbar button, Alt+Shift+G or the context menu (`activeTab`).
7. Orientation: 15 Albanian steps (letters, sounds, words, two patterns, an original passage, concept cards); the
   practice steps use the real parser and card; skippable and repeatable; its encounters are recorded with
   `producer.surface = 'tutorial'`. 8. The concept cards teach GoLearn itself.
9. Open a page or a DRM-free EPUB in the controlled reader; 10. select a word or phrase; 11. the card; 12. the
   pronunciation button (honest states, see §5); 13. the card stays out of the way (fixed, dismissible, no page
   changes); 14. events queue locally and sync in the worker; 15. after GoPractice writes evidence, the worker refreshes
   its learner-model cache after each sync, and the next lookup reads it.

## 3. The lookup pipeline (content script, measured marks in italics)

capture (`getSelection`, NFC kept, grapheme-safe) → *selectionObtained* → context from the enclosing block via the
ReaderAdapter (full / fragment / none, confidence) → *contextExtracted* → tokenize the sentence (Albanian adapter) →
candidate lemmas → morphology (feature structure, construction ids `morph:sq:<POS>:<features>`) → phrases → syntax
notes (the adapter gives no dependency roles; the card says "role: not available from this analyser") → pronunciation
notes → *parsed* → card shown → *popupPositioned*, *firstInfoShown* → in parallel and never blocking: dictionary gloss
from the worker (*glossArrived*), learner model for the unit ids (*profileArrived*), the encounter event to the worker
(*eventQueued*).

Capability negotiation: the card states what it has ("context: full sentence" / "only the selected word" / "a
fragment"); readers that provide nothing get the one-line unsupported state.

## 4. The layered card

| layer | content | event when opened |
|---|---|---|
| 1 | form, likely meaning (lexicon gloss, then the dictionary's with its CC BY-SA attribution), lemma + POS, morphology line, context line, confidence + provenance, the `inference` learner line, Pronounce | `SelectionLookedUp` + `AnalysisShown` |
| 2 Form | feature table with the pack's plain-language explanations (only features present) | `AssistanceRequested {morphology}` |
| 3 Phrase & syntax | constructions found, phrases, the role line, syntax notes | `AssistanceRequested {example}` |
| 4 Grammar | why the form appears (pack construction explanation; depth label / brief / explanatory from preferences) | `AssistanceRequested {grammar, depth}` |
| 5 English rescue | word-by-word lemma + gloss list; "there is no machine translation" | `AssistanceRequested {translation}` |
| actions | Review this (`ItemMarked saved`), This analysis is wrong (correction form → `AnalysisCorrected` + `POST /corrections`), Pronounce (`PronunciationPlayed` only when audio really played) | |

Adaptive order: when a construction the form realizes has more negative than positive grammar evidence in the
learner model, its hint moves above the meaning; a never-seen word gets the meaning first. Every layer stays reachable.

## 5. GoListen in GoLearn

The device provider only (strict language match: an English voice is never used for Albanian); remote (Azure
`sq-AL-*`, behind consent and the owner's key) and recorded voices are not played from pages in this version because
the content bundle may not contain network code; the registry states for Albanian: no recordings, no device voice on
this machine, remote voices unverified synthetic practice, never evidence. The assessment interface for GoReview is
defined (`AudioStimulus`, `AssessmentSource`, scoring metadata that maps onto `ListeningAssessed`).

## 6. Security boundaries

- Content scripts: messaging only; no storage, no token, no network; page text rendered as text; glosses and
  explanations from the worker rendered as text; unit ids validated by pattern.
- Worker: accepts messages only from this extension (`sender.id`); tabs may send content messages only; pages (the
  setup page, the popup) may also manage the connection; service URL must be https or localhost; dictionary base
  https, localhost or the extension's own origin.
- Permissions: `activeTab`, `scripting`, `storage`, `contextMenus`, `alarms`; no host permissions.
- Events are re-attributed by the worker to the session's learner; without a session they wait under a local
  pseudonymous id and are re-attributed on sign-in; another account's queued events are never sent under the new one.

## 7. What is deliberately not here

No course, shelves, bundled library or Scripture corpus; no automatic logging of visible words; no snippet retention
(switch shown disabled with the reason); no machine translation; no claim of Kindle support (copy/paste only); no
claim of pronunciation quality for Albanian.

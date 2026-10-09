# golearn-share — the mobile share contract

What a passage handed to GoLearn from outside a browser tab becomes. The browser extension owns lookups on web pages; this
package is the same lookup for text that arrives by a share: an Android selection-menu action or share sheet, an iOS share
or Safari extension, a web share target, a pasted clipboard, a deep link.

- `SharedPassage` / `ShareMechanism` — what the sender provides (`text` is used once and never stored).
- `normaliseSharedPassage` — the reader contract's rules: NFC, whole grapheme clusters, whitespace collapsed, at most 80 words
  and 1200 characters. One word or a short phrase becomes `context.kind: 'none'`; a longer passage means the word is unknown
  (`needsWordChoice`), and the context is `'sentence'` (one complete sentence, confidence 0.6) or `'fragment'` (0.4).
- `candidateWords` / `chooseWord` — the learner picks the word; Intl.Segmenter word boundaries, so Thai and Hindi are not cut
  inside a cluster.
- `shareReaderId` — `share-android`, `share-ios`, `share-web`, `clipboard`.
- `sharedSourceRef` — a source reference from the link's path, the title and the sending app; never from the text.
- `encounterFromShare` — the `SelectionLookedUp` event, mirrored from the extension's `buildSelectionEvent` (this package may
  import only `repository-contract`); `test/golearn-share/event.test.ts` imports both and checks they agree.
- `readShareParams` / `passageFromShareParams` / `pastedPassage` — the web target's query and the paste box.

Verified: unit tests in jsdom/node (`test/golearn-share`, `test/golearn-app/share*.test.ts`). Not verified: any native Android or
iOS delivery, or the web share target on a real device. See the plan.

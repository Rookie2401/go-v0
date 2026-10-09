# GoLearn — the setup application and the reader extension

Status: proposed 2026-10-08 (architectural phase). Nothing in this document is implemented; the vertical slice in
`IMPLEMENTATION-ROADMAP.md` §2 is the first proof. Reader compatibility claims are explicitly absent: no reader is
"supported" until the extension has been exercised against that reader's real pages, not a mock (charter principle 14).

## 1. Shape

```
 GoLearn app (setup / onboarding / settings)            GoLearn extension (the working surface)
 ┌──────────────────────────────────────────┐            ┌─────────────────────────────────────────────┐
 │ identity · enrolment · pack install      │  packs,    │ reader adapters (one per environment)       │
 │ extension install guide · essentials     │  settings  │   → selection + permitted context           │
 │ demonstration reader (own lawful text)   │ ◀────────▶ │ context parser (language pack)              │
 │ privacy · sync · accounts                │  events    │   → lemma · morphology · gloss · grammar ·  │
 └──────────────────────────────────────────┘            │     phrases · families · confidence         │
                        │                                 │ GoListen (optional): pronunciation           │
                        ▼                                 │ assistance adaptation (reads learner state)  │
                 Go Repository (local store + sync)  ◀────│ encounter recording (events)                 │
                                                          └─────────────────────────────────────────────┘
```

The application and the extension share one TypeScript codebase and one build; the application also hosts the
**demonstration reader**: a minimal reader of texts the learner lawfully has as local files or pasted text, used for
onboarding, for the vertical slice, and as the fallback environment where no reader adapter exists. It is not a
library and ships no texts beyond the onboarding essentials.

## 2. The extension's contract with a reading environment: `ReaderAdapter`

```ts
interface ReaderAdapter {
  id: string;                       // 'web-generic' | 'local-file' | 'demo-reader' | …
  matches(location: PageDescriptor): boolean;
  capabilities(): { selection: true; context: 'sentence' | 'paragraph' | 'none'; sourceRef: boolean; readback: boolean };
  // Called when the learner selects text. Returns only what the environment and its terms permit.
  selection(): Promise<{ surface: string; range: SelectionRange } | undefined>;
  context(range: SelectionRange): Promise<{ sentence?: string; before?: string; after?: string } | undefined>;
  sourceRef(): Promise<SourceRef | undefined>;   // { kind: 'web' | 'ebook' | 'file', title?, locator? } — never the text
  anchor(range: SelectionRange): DOMAnchor;      // where to show the card without disturbing the page
}
```

Rules every adapter obeys (charter 10–12): never read beyond the visible DOM the learner is looking at; never
request, cache or scroll pages to extract text; never defeat access controls; never persist page text (the
`context` result lives in memory for the lookup and leaves only as a hash plus, with per-source consent, one
sentence as a snippet). An adapter whose environment's terms forbid programmatic reading of the text declares
`context: 'none'` and the extension works from the selected word alone.

The first adapters, in order: `demo-reader` (the app's own reader; the vertical slice), `local-file` (a local
`.txt`/`.epub`-without-DRM file the learner opens in the app's reader), `web-generic` (any ordinary web page: the
selection and its enclosing sentence from the DOM). Ebook-reader web apps come after, each as its own adapter with
its own compatibility test and its own terms review; none is promised here.

## 3. The context parser

The parser is the language pack's analyser applied to the selection and its permitted context, exactly as the
existing adapters analyse a sentence today (`LEGACY-SALVAGE-AUDIT.md` §B): tokenize, analyse with candidates and
confidences, refine readings by neighbouring words, detect phrases and units (a particle verb, a compound), relate
to families and variants, produce pronunciation. The output presented to the learner distinguishes:

| shown as | source | example |
|---|---|---|
| **fact** | a dictionary entry with provenance, a reviewed lexicon row | "*lexikon* — noun, neuter (Wiktionary, CC BY-SA)" |
| **analysis** | the parser's best reading with its confidence and the rule that produced it | "read as *stå opp* (particle verb), confidence 0.8" |
| **inference** | learner-state estimates | "you met this word 4 times; likely familiar (estimate)" |

A word outside the pack's lexicon and dictionary is said to be unknown to the pack; the parser never guesses a
gloss. Compounds split only into known parts and are marked unconfirmed, as today.

## 4. Language packs

A pack is the versioned, separately installable bundle:

```
pack/<lang>@<version>/
  manifest.json        { packId, languageId, version, analyzerId, licences[], attribution[], sizes, digest }
  analyzer/            the adapter code (built from src/adapters/<lang> + shared), its conformance report
  lexicon/             the hand lexicon data (owner/AI-authored; provenance flags preserved)
  dictionary/          sharded entries where the licence allows bundling (kaikki: CC BY-SA, with notice), else refs
  pronunciation/       rules + listed exceptions; dictionary IPA where licensed
  frequency.json       corpus frequency where lawfully computed (today's sidecars came from bundled libraries that
                       are being retired: see RIGHTS-AND-PRIVACY-BOUNDARIES.md §4 before reuse)
  tests/               the pack's gold and holdout sets (only fixtures with clear rights travel with the pack)
```

One extension engine loads any pack; a team-branded distribution is the same build with a preinstalled pack and
enrolment defaults. The pack interface is 2GoLearn's `LanguageAdapter` (required floor + declared capabilities),
which the six existing adapters already approximate; `GOLEARN` and `GoPractice` both consume packs through the
Repository's language-facts layer.

## 5. Assistance adaptation

The extension reads derived state at each lookup (item level, estimate, help history) and adapts: a word the
learner has shown they know gets a compact card (confirm, pronounce); a weak word gets the full card; sentence-level
help (an explanation of the construction, a translation of the sentence when the context is permitted and the
learner asks) is offered after word-level help, never first. Help is recorded as help (assistance level), as today,
and discounts the encounter without penalising the learner.

## 6. Onboarding (short, practical)

1. Identity (local by default; connect later). 2. Team and language; for Norwegian, the written standard. 3. Pack
install with its licences shown. 4. Extension install guide for the learner's browser, with a check that it is
active. 5. Essentials of the language: the writing system where it is not Latin (the Thai and Hindi decoders exist),
the ten most useful sound–spelling rules, greetings and the function words that make any sentence parse; two to
three short screens, not a course. 6. Teach the extension on the demonstration reader with a public-domain or
owner-authored passage: click, parse, explain, hear, see the encounter land in the Repository. 7. Settings.

## 7. What GoLearn does not do

It does not recommend texts, hold a library, grade reading, open a path, bundle Scripture, or keep shelves. The
retired surfaces (Stage 0 beyond the essentials screens, ladders, library pages, catalogue doors, the "Your path"
engine) are not carried; what of their logic survives is listed in `LEGACY-SALVAGE-AUDIT.md`.

## 8. Risks named now

- **Reader terms.** Each ebook environment's terms of use govern whether the extension may read the DOM at all;
  this needs per-environment review before any adapter beyond `web-generic` ships (expert review item).
- **Accuracy claims.** Pack accuracy is stated as measured (blind holdouts per language), with the reviewer status
  of each lexicon; nothing is called verified without a person.
- **Extension store policies** (Chrome Web Store, Firefox AMO) on content scripts that read page text and on
  network calls: the extension sends nothing off-device except, with consent, pronunciation requests to a speech
  provider and sync to the learner's own Repository account.
- **Performance** of the analysers in a content script: the German and Spanish adapters are thousands of lines of
  rule tables; the vertical slice measures lookup latency on the demo reader before any web adapter.

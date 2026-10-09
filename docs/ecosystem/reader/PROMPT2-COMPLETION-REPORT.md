# Prompt 2 (universal reader integration) — completion report

Status: 2026-10-09. The §XIII answers, each pointing at the evidence. Statuses use the brief's closed set.

## 1. Which readers genuinely work

- **Verified**: the controlled local EPUB reader (DRM-free files the learner owns).
- **Partially verified**: ordinary web pages through `web-generic` (real Chromium, harness pages, final content script; not an installed extension on a third-party site); BibleGateway by live probe of the public page plus the fixture (selection, context with markers dropped, Scripture reference captured, no verse text).
- **Fixture-verified only** (site adapter exercised on an owner-authored page modelled on the probed or documented markup; the real site not run): Kanah, Tolino, Casa del Libro/Vivlio, Libroteka, YouVersion, Play Books (cross-origin fallback).
- **Nothing else works yet**: see §3–§5.

## 2. Which languages were actually tested

Albanian, German, Spanish, Hindi and Thai, each through the real analyser in the pane (on-demand chunks) and in the
targeted test lanes (`test/reader-languages`: 122 tests, 107 asserting, 15 documented `it.fails` limits:
`LANGUAGE-PACK-CAPABILITIES.md`). Norwegian stays planned: the resolver and registry accept it, no analyser is wired.
German, Hindi and Thai are installable at an **experimental** level (seed-only lemmatisation, unreviewed) and the
setup app labels them so.

## 3. Which sites expose context

Context (the enclosing sentence) was obtained from: BibleGateway (live probe, top document), Pratilipi (live probe,
but the adapter is disabled), Kanah (live probe, inside its same-origin frame), and the fixtures for Tolino, Vivlio,
Libroteka, YouVersion. Bible.com's chapter reader could not be probed (client error). Play Books gives none (cross-origin
frame, first pass). Kindle gives none (bitmap). readAwrite gives none (selection blocked).

## 4. Which integrations are limited to selected text

Play Books (the browser's `selectionText` on a gesture, no sentence); Kindle's Copy/Notebook bridge and any share
into `#/share` (a shared passage longer than a word is a fragment at reduced confidence); the `share-web` /
clipboard-import path by design.

## 5. Which platforms require permission

Pratilipi (terms of 15 Sept 2026: reproduction, automated software, AI scraping/training, personal use; adapter
disabled), Casa del Libro (AI-training bar, TDM reservation), Kobo (robots/extraction and presentation clauses;
declined), BibleGateway and YouVersion for any retention or LLM use of copyrighted text (public-domain versions
excepted per API.Bible), Google Play (automated-means clause, copy limits). Counsel questions are listed in
`RIGHTS-AND-PLATFORM-PERMISSIONS.md`. No status was marked verified for any of these.

## 6. Which native app features are verified

None. Nothing native exists or was tested. The only working non-browser path today is the web share target and the
`#/share` screen of the hosted setup app (jsdom-tested; the Android Chrome PWA install is a manual step).

## 7. Which are only prospective

Android `ACTION_PROCESS_TEXT`/`ACTION_SEND` receivers, iOS share and Safari web extensions, deep links, local EPUB
reading in a companion, and every per-app sharing cell (Kindle, Kobo, MEB, Pratilipi, Play Books, Apple Books) —
`MOBILE-COMPANION-PLAN.md` marks each as prospective with the documentation read.

## 8. What code was implemented

- `packages/golearn-extension/src/adapters/{registry,siteAdapter,scripture,languageMeta,page}.ts`: a data-driven
  reader registry (14 entries, closed statuses, `termsReview.reviewed: false` everywhere, fallbacks), a configurable
  site adapter over `web-generic`, Scripture reference parsing (URL + verse markup, never text), language metadata
  evidence, a loopback-only fixture hook.
- `packages/golearn-extension/src/contract/language.ts` and `src/language/{resolve,capabilities}.ts`: the language
  resolution ladder (override, book metadata, document metadata, detection, team default; never from one word; a
  declared language no pack covers never falls through to the team default) and the pack capability view.
- `packages/language-packs/src/{capabilities,builtins}.ts`, `packs/experimental.ts`, manifest `level`: packs report
  what they really support; de/hi/th experimental.
- `src/parser/registry.ts`, `src/analysers/*`, Vite `--mode analysers`, `web_accessible_resources`: Albanian inline,
  the other analysers as on-demand chunks (content 338 KB, background 341 KB, chunks 167–406 KB).
- `packages/golearn-share/*` and `app/screens/share.ts` + `manifest.webmanifest`: the mobile share contract and the
  web share target producing the same encounter event as a browser lookup.
- Fixtures `harness/sites/*.html` (9) and tests (registry 42, fixtures 44, controller 21, analyser loading 14,
  resolver 59, capabilities 36, experimental packs 36, reader support 12, languages 122, share 29 + 13).

## 9. What tests ran

Lane suites above; the pane fixture pass (`BROWSER-TEST-REPORT.md` §2); the whole-repository gate (§13 below).

## 10. What failed

- Bible.com chapter reader: client error in the pane (unverified, not a GoLearn fault).
- readAwrite: selection blocked by the site (classified Blocked; not worked around).
- During the fixture pass: an English page fell through to the team default and was parsed as Albanian (fixed in the
  resolver); the site adapter's page URL ignored the fixture hook (fixed, harness-only).
- The integration lane's first attempt stalled once and was resumed; its final run was green.
- 15 analyser limits remain as `it.fails` (German stranded separable prefix tagged ADP, Thai `คนใน` segmentation,
  Hindi readings not narrowed, etc.).

## 11. What needs to change in the Go Repository design

- `sourceRef` needs a first-class `scripture` kind in the contract (today the site adapter and the controller carry it
  through `subject.sourceRef` without the contract enumerating `kind`).
- A `languageBasis`/`languageConfidence` field on `SelectionLookedUp` would let the projection weight encounters whose
  language was resolved by detection or override lower than those with metadata (today it is only in the metrics row).
- `PackInstalled` should carry the pack `level` (experimental vs installable) so the projection can caveat evidence
  from experimental analysers.
- P-12 remains: looked-up surfaces registered in the shared linguistic tables carry no provenance.

## 12. What the next implementation prompt may safely assume

One extension, one registry, one resolver, five analysers loadable on demand, the share contract, and honest statuses.
It may NOT assume: any third-party site verified as an installed extension; any Albanian commercial reader working
(Kanah is the best candidate, unverified); any native sharing; permission from Pratilipi, Casa del Libro, Kobo or the
Bible providers; a Norwegian analyser.

## 13. Gate

See the end of this file (filled after the whole-repository run).

### Whole-repository gate (2026-10-09, `npx vitest run`, 995 s under load)

```
Test Files  6 failed | 579 passed (585)
Tests       7 failed | 13607 passed (13614)
npx tsc -b  exit 0
```

The 7 failures: the 2 pre-existing retired-corpus integrity tests (`test/bench/sq-library-assets.test.ts`,
`test/content/curriculum-remediation.test.ts`), and 5 **timeouts** (20 s each) in legacy course suites under the
16-minute load (`test/ingest/origins.test.ts`, `test/server/goread.test.ts` child-process start, `test/ui/bootstrapSpeech.test.ts`,
`test/ui/pathPage.test.tsx` ×2) plus two transient vitest-worker RPC timeouts. Re-run alone immediately afterwards,
those four files pass: 83 of 83. They are reported, not hidden.

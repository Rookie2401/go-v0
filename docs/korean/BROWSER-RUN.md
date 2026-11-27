# Korean (`ko`) real-browser run, 2026-11-27 (commit `b91ae4a2`)

The built extension in headless Brave `Chrome/158.0.8127.92`, throw-away profiles, a throw-away local Repository service and a generated test account. Nothing beyond 127.0.0.1 was requested in what the rig observed; no console errors.
Rig: `scripts/loadcheck/golearn/ko.mjs`; pages: `scripts/loadcheck/golearn/ko-pages/`. Replaces the record of 2026-11-25 (`ccaad140`).

**Result: every step passed except step 9 (Reading Analysis), which fails on the first try with Active on and succeeds on a second try.**

## Run on 9ade366f (2026-11-27, the rare-rival rule off)

The same rig and build commands, run again by the coordinator. All 18 checks passed (steps 1 to 10, the second-profile gate
checks 12a to 12f); Reading Analysis again answered "knowledge-changing" on its first attempt (380 ms) and succeeded on the
retry (982 ms). The two screenshots (two-words card for 피는; held card for 눈이) were looked at: unchanged, no clipping.
GoReview made two cards from marked words (one fronted 친구에게만, the pack-sentence form noted below) and none from held words.
The record below is the run on b91ae4a2.

## Build

At `b91ae4a2`. The build stamp reads `b91ae4a21d57-dirty`; the only change in the tree at build time was `docs/korean/SWEEP.md` (not this run's edit, no product code).

```
npm run ext:build
GOLEARN_APP_DICT=ko npx vite build -c packages/golearn-extension/app/vite.config.ts --mode options
GOREVIEW_DICT=ko    npx vite build -c packages/goreview/app/vite.config.ts --mode extension
LOADCHECK_BRAVE=<brave.exe> LOADCHECK_TMP=<scratch>/tmp node scripts/loadcheck/golearn/ko.mjs packages/golearn-extension/dist <scratch> [gate|reading]
```

Scratch: `C:\Users\CJWal\dev\tmp-mem\ko-browser2\`. `dist` was deleted afterwards.

## Runs

1. Discarded: the local service had not answered after about 8 minutes, so account creation failed. Stopped by hand. Started alone it answered in 91 s. The rig now waits by clock time (up to 15 min).
2. Full run (service up in 58 s): the table below.
3. `reading` only (setup, then step 9 with Active on): step 9 again, with the retry.

## Steps

| # | Step | Result | Observed |
|---|------|--------|----------|
| 1 | Account; Korean installed on the setup page | PASS | "Korean is ready: 21 checks passed", dictionary from the extension's own files. |
| 2 | Korean once in popup, setup page, GoReview | PASS | GoReview header "Korean"; its Languages page (`#/languages`) lists "Korean (한국어)". |
| 3 | Active on three pages | PASS | narrative 106 words: 86 new, 20 seen. News 111: 104 new, 2 seen, 5 unmarked. Devotion 63: 62 new, 1 seen. |
| 4 | Korean files only when needed | PASS, note | Nothing on an English page with Active on. Korean page: `ko.js` once, lexicon manifest and shards once each. An explicit lookup on the English page still fetches `ko.js` (no lexicon). |
| 5 | Twelve inflected words give cards | PASS | 12 of 12. 눈이 is decided both ways (snow, eye); 배를 after 사과와 stays undecided and now says "Not added to review". |
| 6 | Mark 먹었어요 Known | PASS | One `ItemMarked`, `lemma:ko:먹다:VERB`, no page text. |
| 7, 7b | Sync, new tab, browser restart | PASS | Service holds the event once; the 먹- forms show known, also after the restart. |
| 8 | GoReview, one session | PASS | 10-card session; first front 갈, answer "to go", graded Good; second front 같다. Two answered, then ended early. |
| 9 | Reading Analysis, news page | **FAIL** | Full run: "Your vocabulary kept changing while it was being read. Try again in a moment." Run 3: same on the first try (1.1 s); second try 8 s later done in 1.0 s (111 words: 106 new, 5 unidentified). |
| 10 | Offline, then sync | PASS | Card from local files, mark queued, synced once. |
| 11 | Timings | INFO | First Korean lookup: card 503 ms; warm 217 ms. Active first scan 593 to 775 ms; longest page stall 111 to 168 ms (one over 100 ms on each page). |

### Review gate (step 12: second profile, no account, page `gate.html`)

| # | Check | Result | Observed |
|---|-------|--------|----------|
| 12a | 피는 꽃이 예뻐요: 피는 | PASS | `two-words` block: "The sentence does not decide which of these words this is:" 피 NOUN, blood; 피다 VERB, to bloom. It also shows the hold line. |
| 12b | 눈이 예뻐요: 눈이 | PASS | "Not added to review: The spelling stands for several words and nothing in the sentence decides which, so it is not made a card." |
| 12c | 내일 갈 겁니다: 겁니다 | PASS | 거 NOUN, "thing (spoken form of the bound noun for thing)", not 걸다. Held from review; the hold line names 걸다 as the other possibility. |
| 12d | GoReview offers Korean | PASS | Header and Languages page. |
| 12e | A card from a marked word | PASS | 친구 and 책 (marked Recognized) became cards: fronts 책을 ("book") and 친구에게만 ("friend"). |
| 12f | No card from held words | PASS | 피는 and 눈이 were marked Recognized and are listed as review candidates, as is 겁니다. The session ran to its end with only the two cards above; no `CardAdded` for any held word. |

## Screenshots (looked at)

- `C:\Users\CJWal\dev\tmp-mem\ko-browser2\shot-two-words.png`
- `C:\Users\CJWal\dev\tmp-mem\ko-browser2\shot-held.png`

Both texts fit the card (386 px wide, 1178 x 808 viewport): lines wrap, nothing is clipped or overflows sideways (also measured: none), and both are visible without scrolling. The card scrolls vertically, so the lines below Report are reached by scrolling.

## Faults seen in the product

1. **Reading Analysis fails right after a page opens with Active on** (2 of 2 first tries). Reproduce: Korean installed, signed in, Active on; open `news.html`; after about 2.5 s start Reading Analysis. A second try works. Likely cause, not proven: Active is still recording encounters, so every restart finds the vocabulary changed. The code is shared, not Korean's; other languages were not run. The 2026-11-25 run passed this step.
2. **A GoReview card front can be a form the learner never met.** Reproduce: mark 친구가 in 친구가 책을 읽어요, start GoReview: the front is 친구에게만. In step 8, 가다 shows as 갈. 친구에게만 is the surface of a pack validation case (`packages/language-packs/src/packs/ko.ts`), which is probably where it comes from.
3. **My Vocabulary shows lemma records as internal ids**, e.g. `lemma:ko:책:NOUN`, instead of 책 (both profiles). Form records show the word. Reproduce: look up a word, open GoReview, My Vocabulary.
4. Smaller: on the 눈이 card the same line "eye; eyesight / snow / scale / bud" appears twice (headline and lemma line). GoReview's home explains the three held words as having "no verified facts yet", not as held. 서울시는, 연구팀은, 김민수, 기상청은 are still unmarked by Active and have no meaning.

## Rig changes this run

Account state read from `#account-link`; step 8 reads GoReview's language from the header and `#/languages`; step 12 and `gate.html` added; step 9 retries and records each try; longer wait for the service; `gate` and `reading` modes for rerunning a part.

## Not covered

No phone or touch, no narrow viewport, browser zoom or light theme. No hosted service or real account. One machine, headless Brave only. "Save for GoReview" on a held word was not pressed. Only flip cards were answered. A two-words block with more than two words was not seen. `chrome.runtime.reload()` was not done (a browser restart was). No audio (no Korean voice). Grammar notes were not judged.

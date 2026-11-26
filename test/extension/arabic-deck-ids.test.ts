/**
 * The extension names a page word's unit ids from the reading (active/scan.ts `wordsOfText`; the parser's `itemIdsFor` carries the same condition).
 * A reading the deck gate holds for what it IS (notes.reviewGate = 'yes': a misread, undecided or unlisted word) is credited to its FORM id only; a
 * reading held only for the MEANING the card would show keeps its lemma id (the reading is right: the learner's vocabulary still counts the lemma).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { arAdapter } from '../../src/adapters/ar';
import { heldByReviewGate } from '../../src/adapters/arabic/deck';
import { AR_KNOWN_LIMITS } from '../../src/adapters/arabic/generated/deck-limits';
import { installFullIndex, shardsPresent } from '../../scripts/ar-deck-limits-lib.mts';
import { wordsOfText } from '../../packages/golearn-extension/src/active/scan';

const fixture = JSON.parse(fs.readFileSync(path.resolve('test/fixtures/arabic/deck-audit.json'), 'utf8')) as { sentences: Array<{ text: string }> };

describe('the ids the extension records for a gated Arabic reading', () => {
  it('a reading hold (reviewGate yes) is credited to its form id only', () => {
    // a written form of the generated known-limits list: the analyser credits it (>= 0.5) with the wrong lexeme and the gate holds it as a reading
    const word = Object.keys(AR_KNOWN_LIMITS).filter((k) => !/[\u064B-\u0652]/u.test(k)).find((k) => {
      const top = arAdapter.analyze(arAdapter.tokenize(k))[0]?.candidates[0];
      return !!top && top.confidence >= 0.5 && !top.unconfirmed && !!top.lemma && heldByReviewGate(top);
    });
    expect(word, 'a known-limit form that is credited with confidence and held').toBeDefined();
    const [w] = wordsOfText(word!, arAdapter, 'ar');
    expect(w.ids).toEqual([`form:ar:${word}`]);
    expect(w.known).toBe(false);
  });

  it.skipIf(!shardsPresent())('a meaning hold keeps its lemma id; a reading hold of the same text never has one', () => {
    installFullIndex();
    let meaningHeld = 0;
    let readingHeld = 0;
    for (const s of fixture.sentences) {
      const toks = arAdapter.tokenize(s.text);
      const analysed = arAdapter.analyze(toks);
      const words = wordsOfText(s.text, arAdapter, 'ar');
      const wordAnalyses = analysed.filter((a) => a.token.isWord);
      words.forEach((w, i) => {
        const top = wordAnalyses[i].candidates[0];
        if (!top || top.confidence < 0.5 || top.unconfirmed) return;
        const hasLemma = w.ids.some((id) => id.startsWith('lemma:ar:'));
        if (heldByReviewGate(top)) { readingHeld++; expect(hasLemma, `${w.surface}: ${String(top.notes?.deckLimit)}`).toBe(false); }
        else if (top.notes?.reviewStatus === 'requires-review') { meaningHeld++; expect(hasLemma, `${w.surface}: ${String(top.notes?.deckLimit)}`).toBe(true); }
      });
    }
    expect(meaningHeld).toBeGreaterThan(0);
    expect(readingHeld).toBeGreaterThan(0);
  });
});

// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.resolve(__dirname, '../../packages/goreview/app/styles.css'), 'utf8');

describe('GoReview: Arabic text takes the Arabic stack wherever it is', () => {
  it('has one rule for every element whose lang begins ar, naskh first, with room above and below for the vowel marks', () => {
    const rule = /body \[lang\|='ar'\]\[lang\]\s*\{([^}]*)\}/.exec(css);
    expect(rule, 'a rule for any [lang|=ar]').not.toBeNull();
    expect(rule![1]).toMatch(/font-family:\s*'Noto Naskh Arabic', 'Amiri', 'Scheherazade New', 'Traditional Arabic', 'Arabic Typesetting', 'Geeza Pro', 'Al Bayan', 'Times New Roman'/);
    expect(Number(/line-height:\s*([\d.]+)/.exec(rule![1])![1])).toBeGreaterThanOrEqual(1.8);
  });

  it('beats the card rules that set a tight line height (.flashcard-back .reference, .stimulus) by specificity, and leaves the front unclipped', () => {
    // body + two attribute selectors = (0,2,1); .flashcard-back .reference is (0,2,0)
    expect(css).toMatch(/body \.stimulus\[lang\|='ar'\]\[lang\][^{]*\{[^}]*overflow:\s*visible/);
    expect(css).toMatch(/\.flashcard-back \.reference\s*\{[^}]*line-height:\s*1\.15/); // the rule it has to beat is still there
  });
});

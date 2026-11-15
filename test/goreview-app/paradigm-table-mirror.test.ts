/**
 * GoReview's table builder (packages/goreview/src/facts/paradigm-table.ts) is a copy of the one GoLearn's word card uses
 * (packages/golearn-extension/src/content/enrich.ts): GoReview may not import from the extension
 * (test/audit/conformance.structure.test.ts). This keeps the two identical, character for character, so the table in a card's
 * "This item" is always the table the word card shows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8').replace(/\r\n/g, '\n');
const card = read('packages/golearn-extension/src/content/enrich.ts');
const review = read('packages/goreview/src/facts/paradigm-table.ts');
const fn = (text: string, name: string): string => {
  const start = text.indexOf(`export function ${name}`);
  expect(start, `${name} is missing`).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf('\n}\n', start) + 3);
};
const line = (text: string, prefix: string): string => {
  const start = text.indexOf(prefix);
  expect(start, `${prefix} is missing`).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf('\n', start));
};

describe("GoReview's table builder mirrors the word card's", () => {
  it.each(['pickRecord', 'buildParadigm', 'alignTable', 'formRomanOf', 'selectedCellKeys'])('%s is the same function in both', (name) => {
    expect(fn(review, name)).toBe(fn(card, name));
  });

  it.each(['const WIKTIONARY = ', 'const str = (v: unknown, max = 400)', 'function safe<T>(fn: () => T)'])('the helper "%s" is the same in both', (prefix) => {
    expect(line(review, prefix)).toBe(line(card, prefix));
  });

  it('GoReview does not import the extension to get it', () => {
    expect(read('packages/goreview/app/packFacts.ts')).not.toContain('golearn-extension');
    expect(review).not.toMatch(/from '[^']*golearn-extension/);
  });
});

/**
 * The GoReview builds that bundle their own dictionaries (the extension's review/ and the native release) ship every language whose pack
 * declares a dictionary. On 2026-11-13 Hebrew, Bokmål and Nynorsk began to declare theirs while the default list still named six
 * languages, so the extension's GoReview fetched dict/he from its own folder and got a 404: this keeps the lists and the packs together.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKS } from '../../packages/language-packs/src';

const root = path.resolve(__dirname, '../..');
const defaultList = (file: string): string[] => {
  const m = /process\.env\.GOREVIEW_DICT \?\? '([^']*)'/u.exec(fs.readFileSync(path.join(root, file), 'utf8'));
  expect(m, `${file} names a default GOREVIEW_DICT`).not.toBeNull();
  return m![1].split(',').map((s) => s.trim()).filter(Boolean).sort();
};
const declaring = Object.values(PACKS).filter((p) => p.lexical.dictionary).map((p) => p.languageId).sort();

describe('the dictionaries GoReview bundles by default', () => {
  it.each(['packages/goreview/app/vite.config.ts', 'scripts/goreview-release.mjs'])('%s ships exactly the packs that declare a dictionary', (file) => {
    expect(defaultList(file)).toEqual(declaring);
  });
});

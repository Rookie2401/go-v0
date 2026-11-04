// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildHebrewFormFrequency, gzipHebrewFormFrequency, type HebrewFormFrequencyIndex } from '../../packages/goreview/app/hebrewFrequencyAssets';

const source = { label: 'OSHB', licence: 'CC BY 4.0', url: 'https://example.test/oshb', retrieved: '2026-09-20', note: 'Pointed keys.' };
const index = (forms: HebrewFormFrequencyIndex['forms']): HebrewFormFrequencyIndex => ({ schema: 1, id: 'oshb-tanakh', source, built: '2026-10-19', forms });

describe('Hebrew biblical form frequency build asset', () => {
  it('sums only Hebrew morphology rows and assigns deterministic competition ranks to exact forms', () => {
    const result = buildHebrewFormFrequency(index({
      'אַ': [['1', 'Hxxxx', 10], ['2', 'Hxxxx', 5], ['3', 'Axxxx', 300]],
      'בּ': [['4', 'Hxxxx', 15]],
      'גּ': [['5', 'Hxxxx', 9]],
      'דּ': [['6', 'Axxxx', 500]],
    }));
    expect(result).toMatchObject({ schema: 1, id: 'oshb-tanakh-form-frequency', indexId: 'oshb-tanakh', source, built: '2026-10-19' });
    expect(result.forms).toEqual({ 'אַ': { rank: 1, count: 15 }, 'בּ': { rank: 1, count: 15 }, 'גּ': { rank: 3, count: 9 } });
  });

  it('rejects malformed source counts rather than silently emitting partial metadata', () => {
    expect(() => buildHebrewFormFrequency(index({ 'אַ': [['1', 'Hxxxx', 0]] }))).toThrow(/malformed morphology row/);
    expect(() => buildHebrewFormFrequency(index({ 'אַ': [['1', 'Hxxxx', 1.5]] }))).toThrow(/malformed morphology row/);
  });

  it('builds the deployed gzip sidecar with a known exact-form count and ranks source index as its input', () => {
    const root = path.resolve(__dirname, '../..');
    const sourceIndex = JSON.parse(fs.readFileSync(path.join(root, 'public/lexicon/he/biblical-index.json'), 'utf8')) as HebrewFormFrequencyIndex;
    const asset = JSON.parse(gunzipSync(gzipHebrewFormFrequency(sourceIndex)).toString('utf8')) as ReturnType<typeof buildHebrewFormFrequency>;
    expect(asset.forms['אֶת']).toEqual({ rank: 1, count: 6715 });
    expect(asset.source).toMatchObject({ label: expect.any(String), licence: expect.stringContaining('CC BY'), url: expect.any(String), retrieved: expect.any(String), note: expect.any(String) });
  });
});

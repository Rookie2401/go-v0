import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ARAMAIC_SEED } from '../../src/adapters/aramaic/seed';

describe('Aramaic export contract', () => {
  it('exports the complete qere seed with stable provenance and a reproducible checksum', () => {
    const rows = [...ARAMAIC_SEED];
    expect(rows).toHaveLength(4828);
    expect(rows.every((row) => row.sourceWordId && row.lemmaId && row.morph && row.seg)).toBe(true);
    expect(new Set(rows.map((row) => row.sourceWordId)).size).toBe(rows.length);
    const bookOf = (reference: string) => /^(?:Dan(?:iel)?)/i.test(reference) ? 'DAN' : /^(?:Ezr(?:a)?)/i.test(reference) ? 'EZR' : /^(?:Jer(?:emiah)?)/i.test(reference) ? 'JER' : /^(?:Gen(?:esis)?)/i.test(reference) ? 'GEN' : 'UNKNOWN';
    expect(new Set(rows.map((row) => bookOf(row.reference))).size).toBe(4);
    expect(Object.fromEntries(['DAN', 'EZR', 'JER', 'GEN'].map((book) => [book, rows.filter((row) => bookOf(row.reference) === book).length]))).toEqual({ DAN: 3599, EZR: 1212, JER: 15, GEN: 2 });
    expect(new Set(rows.map((row) => row.glossStatus))).toEqual(new Set(['external', 'unavailable']));
    expect(rows.every((row) => !!row.gloss || row.glossStatus === 'unavailable')).toBe(true);
    expect(rows.every((row) => /^A/.test(row.morph))).toBe(true);
    expect(rows.every((row) => row.seg.split('/').map(Number).reduce((a, b) => a + b, 0) === [...row.surface].filter((char) => /[\u05D0-\u05EA]/u.test(char)).length)).toBe(true);
    expect(new Set(rows.map((row) => row.reference)).size).toBe(269);
    const strong6211b = rows.filter((row) => row.lemmaId.replace(/\s+/g, '').endsWith('6211b'));
    expect(strong6211b.length).toBeGreaterThan(0);
    expect(strong6211b.every((row) => /^A/.test(row.morph) && /grass|herbage/i.test(row.gloss) && !/moth/i.test(row.gloss))).toBe(true);
    const body = JSON.stringify(rows);
    expect(createHash('sha256').update(body).digest('hex')).toMatch(/^[a-f0-9]{64}$/);
  });
});

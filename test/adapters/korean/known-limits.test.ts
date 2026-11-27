// @vitest-environment node
/**
 * The review gate's known-limits list is GENERATED from the common-word sweep's table (scripts/ko-known-limits.mts). This test fails when the
 * generated file and the table are out of step: run `npm run ko:known-limits` after the sweep regenerates its lists.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OUT_PATH, TABLE_PATH, knownLimits, render } from '../../../scripts/ko-known-limits.mts';
import { KO_KNOWN_FRAME_NOUNS, KO_KNOWN_SURFACES } from '../../../src/adapters/korean/generated/known-limits';

describe('the generated known-limits list', () => {
  const table = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  it('is exactly what the sweep table records (run npm run ko:known-limits if this fails)', () => {
    const limits = knownLimits(table);
    expect([...KO_KNOWN_SURFACES]).toEqual(limits.surfaces);
    expect([...KO_KNOWN_FRAME_NOUNS]).toEqual(limits.frameNouns);
    expect(fs.readFileSync(OUT_PATH, 'utf8')).toBe(render(limits));
  });
  it('names every surface of a block and two-sided record, and each frame noun', () => {
    const surfaces = new Set(KO_KNOWN_SURFACES);
    for (const key of table.known as string[]) { const p = key.split('|'); const s = (/^[BCK]$/u.test(p[0]) ? p[2] : p[0]).replace(/@[a-z]+$/u, ''); expect(surfaces.has(s), key).toBe(true); }
    for (const key of table.twoSidedKnown as string[]) expect(surfaces.has(key.split('|')[1]), key).toBe(true);
    // a known check holds ITS written form, not only the headword: 성|s1 holds 성을, 이르다|s1 holds 일러요
    for (const key of table.known as string[]) {
      const p = key.split('|'); const k = /^s([0-9]+)@/u.exec(p[1] ?? '');
      if (p[0].length > 1 || !k) { if (!k || /^[BCKTF]$/u.test(p[0])) continue; }
      const at = table.entries.find((e: { w: string }) => e.w === p[0])?.s?.[Number(k![1])]?.at;
      if (at) expect(surfaces.has(at), key).toBe(true);
    }
    for (const key of table.frameKnown as string[]) expect(new Set(KO_KNOWN_FRAME_NOUNS).has(key.split('|')[1]), key).toBe(true);
  });
});

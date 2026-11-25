// @vitest-environment node
/**
 * A Korean homonym's lemma string carries its number as superscript digits (눈², `lemma:ko:눈²:NOUN`). Compatibility normalisation
 * (NFKC, NFKD) turns ² into 2, which would silently make another item of it. Today the only compatibility normalisation in the
 * product is the password hash; this test fails the day one appears anywhere a lemma or a unit id could pass (found by the linguistic
 * audit of the Korean pack, 2026-11-25).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { koBareLemma, koEntryLabel, koEntryLemma, koHomonymLemma, koHomonymNumber } from '../../../src/adapters/korean/index-store';
import { lemmaEntryLabel } from '../../../packages/repository-contract/src';

const ROOT = join(__dirname, '..', '..', '..');
const ALLOWED = new Set(['packages/repository-service/src/crypto-node.ts']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-web', 'public', 'data', 'coverage', 'ios', 'android', 'build', 'out', 'tmp', 'generated']);

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue; // build output, data and generated tables are not where a lemma is normalised
    const path = join(dir, name);
    let st; try { st = statSync(path); } catch { continue; } // a junction whose target is absent
    if (st.isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name) && !/\.test\.ts$/.test(name)) yield path;
  }
}

describe('a homonym number survives every path a lemma takes', () => {
  it('NFC and NFD keep the superscript; NFKC would not (the reason for this guard)', () => {
    const lemma = koHomonymLemma('눈', 2);
    expect(lemma).toBe('눈²');
    expect(lemma.normalize('NFC')).toBe('눈²');
    expect(koHomonymNumber(lemma.normalize('NFD').normalize('NFC'))).toBe(2);
    expect(lemma.normalize('NFKC')).toBe('눈2');
    expect(koBareLemma(lemma)).toBe('눈');
    expect(koHomonymLemma('배', 12)).toBe('배¹²');
    expect(koHomonymNumber('배¹²')).toBe(12);
  });

  it('the main entry of a set keeps the bare headword; the others carry the source number', () => {
    expect(koEntryLemma({ lemma: '시간', hom: 1, set: 'main' })).toBe('시간');
    expect(koEntryLemma({ lemma: '시간', hom: 3, set: 'other' })).toBe('시간³');
    expect(koEntryLemma({ lemma: '눈', hom: 2, set: 'balanced' })).toBe('눈²');
    expect(koEntryLemma({ lemma: '학교' })).toBe('학교');
  });

  it('the card and the dictionary line label one entry the same way, and never print an internal number', () => {
    for (let n = 1; n <= 120; n++) expect(lemmaEntryLabel('ko', koHomonymLemma('가락', n)), String(n)).toBe(koEntryLabel(n));
    expect(koEntryLabel(2)).toBe('2');
    expect(koEntryLabel(50)).toBe('a');
    expect(koEntryLabel(51)).toBe('b');
    expect(koEntryLabel(91)).toBe('x1');
    expect(lemmaEntryLabel('ko', '눈')).toBeUndefined();
    expect(lemmaEntryLabel('de', 'm²')).toBeUndefined();
  });

  it('no source file but the password hash uses compatibility normalisation', () => {
    const found: string[] = [];
    for (const dir of ['src', 'packages', 'scripts', 'server', 'infra'].filter((d) => existsSync(join(ROOT, d)))) {
      for (const file of sources(join(ROOT, dir))) {
        if (!/NFK[CD]/.test(readFileSync(file, 'utf8'))) continue;
        found.push(relative(ROOT, file).split(sep).join('/'));
      }
    }
    expect(found.filter((f) => !ALLOWED.has(f))).toEqual([]);
  }, 120_000); // a walk of the source tree: slow when builds run beside it
});

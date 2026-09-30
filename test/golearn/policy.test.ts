import { describe, expect, it } from 'vitest';
import type { AssistanceLevel } from '../../src/core';
import { defaultPolicy } from '../../src/golearn';

const levels: AssistanceLevel[] = [0, 1, 2, 3, 4, 5];

describe('defaultPolicy', () => {
  it('reading weight falls with assistance (1.0 → 0.15) and is never zero or negative', () => {
    const w = levels.map((l) => defaultPolicy.readingWeight(l));
    expect(w[0]).toBe(1);
    expect(w[5]).toBe(0.15);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeLessThan(w[i - 1]);
    for (const x of w) expect(x).toBeGreaterThan(0);
  });

  it('listening weight drops for slow speed, replays, transcript and translation, and stays positive', () => {
    const base = { speed: 1, replays: 0, transcriptRevealed: false, translationRevealed: false };
    const w = (o: Partial<typeof base>) => defaultPolicy.listeningWeight({ ...base, ...o });
    expect(w({})).toBe(1);
    expect(w({ speed: 0.7 })).toBeLessThan(w({ speed: 0.85 }));
    expect(w({ speed: 0.85 })).toBeLessThan(w({}));
    expect(w({ speed: 1.25 })).toBeGreaterThanOrEqual(w({}));
    expect(w({ replays: 2 })).toBeLessThan(w({ replays: 1 }));
    expect(w({ transcriptRevealed: true })).toBeLessThan(w({}));
    expect(w({ translationRevealed: true })).toBeLessThan(w({ transcriptRevealed: true }));
    expect(w({ speed: 0.5, replays: 50, transcriptRevealed: true, translationRevealed: true })).toBeGreaterThan(0);
  });

  it('production weight ranks independent > self-repaired > assisted > copied', () => {
    const p = (k: 'independent' | 'self-repaired' | 'assisted' | 'copied') => defaultPolicy.productionWeight(k);
    expect(p('independent')).toBe(1);
    expect(p('independent')).toBeGreaterThan(p('self-repaired'));
    expect(p('self-repaired')).toBeGreaterThan(p('assisted'));
    expect(p('assisted')).toBeGreaterThan(p('copied'));
    expect(p('copied')).toBeGreaterThan(0);
  });

  it('receptive levels follow the documented thresholds', () => {
    const L = (e: number, u: number, a: number) => defaultPolicy.level('reading', e, u, a);
    expect(L(0, 0, 0)).toBe('unseen');
    expect(L(1, 1, 0)).toBe('encountered');
    expect(L(0.15, 0, 1)).toBe('encountered');
    expect(L(1.5, 0, 3)).toBe('recognized_with_help');
    expect(L(3, 1, 2)).toBe('recognized_with_help'); // enough evidence but not enough unassisted encounters
    expect(L(3, 2, 0)).toBe('recognized');
    expect(L(8, 4, 5)).toBe('recognized');
    expect(L(8, 5, 0)).toBe('rapid');
    expect(defaultPolicy.level('listening', 3, 2, 0)).toBe('recognized');
  });

  it('productive levels: assisted-only never reaches used_independently', () => {
    const L = (e: number, u: number, a: number) => defaultPolicy.level('writing', e, u, a);
    expect(L(0, 0, 0)).toBe('unseen');
    expect(L(0.4, 0, 1)).toBe('used_with_assistance');
    expect(L(4, 0, 10)).toBe('used_with_assistance');
    expect(L(1, 1, 0)).toBe('used_independently');
    expect(L(0.8, 1, 0)).toBe('used_independently');
    expect(L(4, 3, 0)).toBe('automatic');
    expect(defaultPolicy.level('speaking', 1, 1, 0)).toBe('used_independently');
  });
});

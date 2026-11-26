/**
 * Rule (b) of the Arabic deck gate at the engine: a bare Arabic form the Repository registers is `requires-review`, so `eligibilityFor` refuses it;
 * every other language's bare form is unchanged (`provisional`, recognition-eligible).
 */
import { describe, expect, it } from 'vitest';
import { resolveSelection } from '../../packages/repository-linguistics/src';
import { eligibilityFor } from '../../packages/repository-engine/src';

const NOW = '2026-11-25T12:00:00.000Z';
const ar = 'أقرأ';

describe('a bare Arabic form is never a review item', () => {
  it('is registered requires-review and the engine refuses it for every dimension', () => {
    const r = resolveSelection({ languageId: 'ar', surface: ar, now: NOW });
    expect(r.units[0].status).toBe('requires-review');
    expect(r.analysis.status).toBe('requires-review');
    for (const d of ['readingRecognition', 'assistedRecognition', 'listeningRecognition'] as const) {
      const e = eligibilityFor(r.units[0], [r.analysis], d);
      expect(e.eligible).toBe(false);
      expect(e.status).toBe('requires-review');
    }
  });

  it('leaves another language\'s bare form as it was (provisional, recognition only)', () => {
    const r = resolveSelection({ languageId: 'xx', surface: 'abc', now: NOW });
    expect(r.units[0].status).toBe('provisional');
    expect(eligibilityFor(r.units[0], [r.analysis], 'readingRecognition').eligible).toBe(true);
  });
});

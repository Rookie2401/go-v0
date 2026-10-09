import { describe, expect, it } from 'vitest';
import { VALIDATION_LEVELS } from '../../packages/repository-contract/src';
import { PACKS, levelOf, validationOf } from '../../packages/language-packs/src';

describe('validationOf: how far a pack’s analysis is validated, from its level and its review status only', () => {
  const m = (status: 'installable' | 'planned', reviewStatus: 'machine-drafted' | 'partly-reviewed' | 'reviewed', level?: 'installable' | 'experimental' | 'planned') =>
    ({ status, ...(level ? { level } : {}), rights: { reviewStatus } });

  it('planned is unsupported, whatever its review status', () => {
    for (const r of ['machine-drafted', 'partly-reviewed', 'reviewed'] as const) expect(validationOf(m('planned', r))).toBe('unsupported');
  });

  it('experimental is experimental, whatever its review status', () => {
    for (const r of ['machine-drafted', 'partly-reviewed', 'reviewed'] as const) expect(validationOf(m('installable', r, 'experimental'))).toBe('experimental');
  });

  it('installable: machine-drafted is unreviewed, partly reviewed is incomplete, reviewed is production-validated', () => {
    expect(validationOf(m('installable', 'machine-drafted'))).toBe('unreviewed');
    expect(validationOf(m('installable', 'partly-reviewed'))).toBe('incomplete');
    expect(validationOf(m('installable', 'reviewed'))).toBe('production-validated');
  });

  it('every real pack maps to one of the Repository’s validation levels, and none is production-validated (no pack has been reviewed)', () => {
    for (const [lang, manifest] of Object.entries(PACKS)) {
      const v = validationOf(manifest);
      expect(VALIDATION_LEVELS as readonly string[], lang).toContain(v);
      expect(v, lang).not.toBe('production-validated');
      expect(levelOf(manifest) === 'planned', lang).toBe(v === 'unsupported');
    }
  });
});

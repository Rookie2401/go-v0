import { describe, expect, it } from 'vitest';
import { SQ_PROFILE } from '../../packages/language-packs/src/alphabet-sprint/profiles/sq';
import { profileChecks } from './sprint-kit';

profileChecks(SQ_PROFILE, { newKeys: [] });

describe('Albanian sprint specifics', () => {
  it('reads xh as one unit, not x + h', () => {
    const deps = SQ_PROFILE.dependencies('xhaxha')!;
    expect(deps).toContain('Xh xh');
    expect(deps).not.toContain('X x');
    expect(deps).not.toContain('H h');
  });
  it('reads sh, rr and ç as units of their own', () => {
    expect(SQ_PROFILE.dependencies('shtëpi')).toEqual(expect.arrayContaining(['Sh sh', 'Ë ë']));
    expect(SQ_PROFILE.dependencies('rrugë')).toContain('Rr rr');
    expect(SQ_PROFILE.dependencies('rrugë')).not.toContain('R r');
    expect(SQ_PROFILE.dependencies('çaj')).toContain('Ç ç');
  });
  it('leaves a word with an unknown letter unmodelled', () => {
    expect(SQ_PROFILE.dependencies('wx1')).toBeUndefined();
  });
});

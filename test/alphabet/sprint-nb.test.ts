import { describe, expect, it } from 'vitest';
import { NB_PROFILE } from '../../src/alphabet/sprint/profiles/nb';
import { NORWEGIAN_NEW_KEYS } from '../../src/alphabet/sprint/profiles/norwegian';
import { profileChecks } from './sprint-kit';

profileChecks(NB_PROFILE, { newKeys: NORWEGIAN_NEW_KEYS });

describe('Bokmål decoding', () => {
  it('needs kj for kjøre, hv for hva, the silent-d rule for land and the soft-k rule for kirke', () => {
    expect(NB_PROFILE.dependencies('kjøre')).toEqual(expect.arrayContaining(['kj', 'Ø ø']));
    expect(NB_PROFILE.dependencies('kjøre')).not.toContain('rule-soft-k');
    expect(NB_PROFILE.dependencies('hva')).toContain('hv');
    expect(NB_PROFILE.dependencies('land')).toContain('rule-silent-d');
    expect(NB_PROFILE.dependencies('kirke')).toContain('rule-soft-k');
  });
  it('cannot model a letter outside the alphabet it teaches', () => { expect(NB_PROFILE.dependencies('zebra')).toBeUndefined(); });
});

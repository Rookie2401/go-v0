import { describe, expect, it } from 'vitest';
import { NN_PROFILE } from '../../src/alphabet/sprint/profiles/nn';
import { NORWEGIAN_NEW_KEYS } from '../../src/alphabet/sprint/profiles/norwegian';
import { profileChecks } from './sprint-kit';

profileChecks(NN_PROFILE, { newKeys: NORWEGIAN_NEW_KEYS });

describe('Nynorsk decoding', () => {
  it('needs kj for kjøpe, hj for hjelpe, the silent-d rule for land and the soft-k rule for kyr', () => {
    expect(NN_PROFILE.dependencies('kjøpe')).toEqual(expect.arrayContaining(['kj', 'Ø ø']));
    expect(NN_PROFILE.dependencies('hjelpe')).toContain('hj');
    expect(NN_PROFILE.dependencies('land')).toContain('rule-silent-d');
    expect(NN_PROFILE.dependencies('kyr')).toContain('rule-soft-k');
  });
  it('uses Nynorsk words, not Bokmål ones', () => {
    const forms = new Set(NN_PROFILE.words.map((w) => w.form));
    expect(forms.has('eg')).toBe(true);
    expect(forms.has('jeg')).toBe(false);
  });
});

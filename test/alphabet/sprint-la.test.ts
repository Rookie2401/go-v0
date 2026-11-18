import { describe, expect, it } from 'vitest';
import { LA_PROFILE } from '../../packages/language-packs/src/alphabet-sprint/profiles/la';
import { profileChecks } from './sprint-kit';

profileChecks(LA_PROFILE, { newKeys: ['ae', 'oe', 'au', 'ch', 'ph', 'th', 'gn', 'rule-ti', 'rule-sc'] });

describe('Latin decoding', () => {
  it('needs ae, not a and e, for caelum, and qu for aqua', () => {
    const d = LA_PROFILE.dependencies('caelum')!;
    expect(d).toContain('ae'); expect(d).not.toContain('A a'); expect(d).not.toContain('E e'); expect(d).toContain('C c');
    expect(LA_PROFILE.dependencies('aqua')).toContain('Q q');
  });
  it('folds macrons, marks ti before a vowel as a rule, and reads consonant i as j', () => {
    expect(LA_PROFILE.dependencies('grātia')).toContain('rule-ti');
    expect(LA_PROFILE.dependencies('iustus')).toContain('J j');
    expect(LA_PROFILE.dependencies('hostia')).not.toContain('rule-ti');
  });
});

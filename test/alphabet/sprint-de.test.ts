import { describe, expect, it } from 'vitest';
import { DE_PROFILE } from '../../packages/language-packs/src/alphabet-sprint/profiles/de';
import { profileChecks } from './sprint-kit';

profileChecks(DE_PROFILE, { newKeys: ['ch', 'sch', 'ei', 'ie', 'eu', 'rule-sp-st', 'rule-final-devoicing', 'rule-long-vowel'] });

describe('German sprint specifics', () => {
  it('needs ie for viel, not i + e', () => {
    const deps = DE_PROFILE.dependencies('viel')!;
    expect(deps).toContain('ie');
    expect(deps).not.toContain('I i');
  });
  it('needs the final-devoicing rule for a word ending in -d or -g, but not for one ending elsewhere', () => {
    expect(DE_PROFILE.dependencies('Kind')).toContain('rule-final-devoicing');
    expect(DE_PROFILE.dependencies('Tag')).toContain('rule-final-devoicing');
    expect(DE_PROFILE.dependencies('Haus')).not.toContain('rule-final-devoicing');
  });
  it('reads sch, sp- and ß correctly', () => {
    expect(DE_PROFILE.dependencies('schon')).toContain('sch');
    expect(DE_PROFILE.dependencies('sprechen')).toEqual(expect.arrayContaining(['rule-sp-st', 'ch']));
    expect(DE_PROFILE.dependencies('groß')).toContain('ß');
  });
  it('treats h after a vowel as a length rule', () => {
    expect(DE_PROFILE.dependencies('sehen')).toContain('rule-long-vowel');
  });
});

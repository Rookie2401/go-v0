import { describe, expect, it } from 'vitest';
import { HI_PROFILE } from '../../src/alphabet/sprint/profiles/hi';
import { profileChecks } from './sprint-kit';

profileChecks(HI_PROFILE, { newKeys: ['rule-inherent-a', 'rule-schwa', 'rule-conjunct'] });

describe('Hindi profile specifics', () => {
  const dep = (w: string) => HI_PROFILE.dependencies(w);
  it('a matra word needs its sign', () => {
    expect(dep('किताब')).toEqual(expect.arrayContaining(['कि', 'क', 'त', 'ब']));
    expect(dep('मेरा')).toEqual(expect.arrayContaining(['के', 'का']));
    expect(dep('मैं')).toEqual(expect.arrayContaining(['कै', 'कं']));
  });
  it('a word with a conjunct needs it', () => {
    expect(dep('स्कूल')).toEqual(expect.arrayContaining(['rule-conjunct', 'स', 'क', 'कू']));
    expect(dep('पत्र')).toEqual(expect.arrayContaining(['rule-conjunct']));
    expect(dep('पत्र')).toContain('त्र');
  });
  it('a word whose final a is not said needs rule-schwa', () => {
    expect(dep('कमल')).toContain('rule-schwa');
    expect(dep('कमल')).toContain('rule-inherent-a');
    expect(dep('का')).not.toContain('rule-schwa');
  });
  it('a nukta letter and an independent vowel are their own units', () => {
    expect(dep('ज़रूर')).toContain('ज़');
    expect(dep('और')).toContain('औ');
  });
  it('returns undefined for non-Devanagari and unmodelled signs', () => {
    expect(dep('hello')).toBeUndefined();
    expect(dep('कh')).toBeUndefined();
    expect(dep('डॉक्टर')).toBeUndefined();
    expect(dep('')).toBeUndefined();
  });
});

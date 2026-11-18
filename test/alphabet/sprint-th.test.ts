import { describe, expect, it } from 'vitest';
import { TH_PROFILE } from '../../src/alphabet/sprint/profiles/th';
import { profileChecks } from './sprint-kit';

profileChecks(TH_PROFILE, { newKeys: ['rule-tone', 'rule-final', 'rule-cluster', 'rule-ho-nam', 'rule-o-nam', 'rule-implicit-vowel'] });

describe('Thai profile specifics', () => {
  it('a plain mid-tone word needs its letters and vowel, no tone rule', () => {
    expect(TH_PROFILE.dependencies('กิน')).toEqual(['ก', '◌ิ', 'น']);
  });
  it('a tone-marked word needs the tone mark and the tone rule', () => {
    const d = TH_PROFILE.dependencies('ท่าน')!;
    expect(d).toEqual(expect.arrayContaining(['ท', '◌า', 'น', '◌่', 'rule-tone']));
  });
  it('a changed final sound needs rule-final; a cluster needs rule-cluster', () => {
    expect(TH_PROFILE.dependencies('ครับ')).toEqual(expect.arrayContaining(['ค', 'ร', 'rule-cluster', 'บ', 'rule-final']));
  });
  it('is undefined for non-Thai text and for empty text', () => {
    expect(TH_PROFILE.dependencies('house')).toBeUndefined();
    expect(TH_PROFILE.dependencies('')).toBeUndefined();
  });
  it('rare consonants are taught late and the notes say tone needs the rules', () => {
    expect(TH_PROFILE.units.find((u) => u.key === 'ฃ')?.difficulty).toBe(3);
    expect(TH_PROFILE.notes).toMatch(/tone/i);
  });
});

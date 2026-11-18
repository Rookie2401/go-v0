import { describe, expect, it } from 'vitest';
import { consonantal } from '../../src/adapters/hebrew/text';
import { ARC_PROFILE } from '../../src/alphabet/sprint/profiles/arc';
import { HE_PROFILE } from '../../src/alphabet/sprint/profiles/he';
import { KEY } from '../../src/alphabet/sprint/profiles/hebrew-script';
import { sprintUnitId } from '../../src/alphabet/sprint/ids';
import { profileChecks } from './sprint-kit';

const newKeys = ARC_PROFILE.units.filter((u) => u.kind !== 'letter' && u.kind !== 'final-form').map((u) => u.key);
profileChecks(ARC_PROFILE, { newKeys });

const deps = (f: string) => ARC_PROFILE.dependencies(f);
const first = (pred: (f: string) => boolean) => ARC_PROFILE.words.map((w) => w.form).find(pred)!;

describe('Biblical Aramaic script rules', () => {
  it('a final form at the end of a word needs the final-form unit', () => {
    const form = first((f) => /[ךםןףץ]/.test([...f].filter((c) => /[א-ת]/.test(c)).at(-1)!));
    const last = [...form].filter((c) => /[א-ת]/.test(c)).at(-1)!;
    expect(deps(form)).toContain(last);
  });
  it('a dagesh needs rule-dagesh; an unpointed word is undefined; cantillation is ignored', () => {
    const form = first((f) => /ּ/.test(f));
    expect(deps(form)).toContain(KEY.dagesh);
    expect(deps(consonantal(form))).toBeUndefined();
    for (const w of ARC_PROFILE.words.slice(0, 40)) {
      const c = [...w.form];
      expect(deps(c[0] + '֖' + c.slice(1).join('') + 'ֽ')).toEqual(deps(w.form));
    }
  });
  it('has its own Aramaic words, not Hebrew ones, and its own card ids', () => {
    expect(ARC_PROFILE.words).not.toBe(HE_PROFILE.words);
    expect(ARC_PROFILE.words.every((w) => w.source.includes('aramaic'))).toBe(true);
    expect(HE_PROFILE.words.every((w) => !w.source.includes('aramaic'))).toBe(true);
    expect(sprintUnitId('arc', 'character', 'ב')).not.toBe(sprintUnitId('he', 'character', 'ב'));
  });
});

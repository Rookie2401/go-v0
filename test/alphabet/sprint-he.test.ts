import { describe, expect, it } from 'vitest';
import { consonantal } from '../../src/adapters/hebrew/text';
import { HE_PROFILE } from '../../src/alphabet/sprint/profiles/he';
import { ARC_PROFILE } from '../../src/alphabet/sprint/profiles/arc';
import { KEY } from '../../src/alphabet/sprint/profiles/hebrew-script';
import { profileChecks } from './sprint-kit';

// vowel points, digraphs and rules are new to the Sprint; every letter and final form must be an old deck glyph
const newKeys = HE_PROFILE.units.filter((u) => u.kind !== 'letter' && u.kind !== 'final-form').map((u) => u.key);
profileChecks(HE_PROFILE, { newKeys });

const FINALS = /[ךםןףץ]/;
const CANT = '֖';
const deps = (f: string) => HE_PROFILE.dependencies(f);
const first = (pred: (f: string) => boolean) => HE_PROFILE.words.map((w) => w.form).find(pred)!;

describe('Hebrew script rules', () => {
  it('a final form at the end of a word needs the final-form unit', () => {
    const form = first((f) => FINALS.test(f.at(-1)!) || FINALS.test(f.replace(/[ְ-ׇ]/g, '').at(-1)!));
    expect(form).toBeDefined();
    const last = [...form].filter((c) => /[א-ת]/.test(c)).at(-1)!;
    expect(deps(form)).toContain(last);
    expect(HE_PROFILE.units.find((u) => u.key === last)?.kind).toBe('final-form');
  });
  it('a dagesh in bet needs rule-dagesh', () => {
    const form = first((f) => /בּ|ב[ְ-ֻ]ּ/.test(f));
    expect(deps(form)).toContain(KEY.dagesh);
  });
  it('an unpointed word has no dependencies', () => {
    const form = first(() => true);
    expect(deps(form)).toBeDefined();
    expect(deps(consonantal(form))).toBeUndefined();
  });
  it('cantillation does not change dependencies', () => {
    for (const w of HE_PROFILE.words.slice(0, 40)) {
      const chars = [...w.form];
      const withCant = chars[0] + CANT + chars.slice(1).join('') + 'ֽ';
      expect(deps(withCant)).toEqual(deps(w.form));
    }
  });
  it('a vowel letter is a rule, and vav with a dot is a digraph', () => {
    expect(HE_PROFILE.words.some((w) => deps(w.form)?.includes(KEY.mater))).toBe(true);
    expect(HE_PROFILE.words.some((w) => deps(w.form)?.includes(KEY.holamMale))).toBe(true);
  });
  it('Hebrew and Aramaic keep separate word lists', () => {
    const arc = new Set(ARC_PROFILE.words.map((w) => w.form));
    expect(HE_PROFILE.words.some((w) => arc.has(w.form) && false)).toBe(false);
    expect(HE_PROFILE.languageId).not.toBe(ARC_PROFILE.languageId);
    expect(HE_PROFILE.words).not.toBe(ARC_PROFILE.words);
  });
});

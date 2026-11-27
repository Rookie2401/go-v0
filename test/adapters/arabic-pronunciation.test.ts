// @vitest-environment node
/**
 * Arabic pronunciation notes, spelling checks and the alphabet data (src/adapters/arabic/{pronunciation,production,alphabet}.ts).
 * Every expectation is the author's own, machine-drafted; no native speaker or Arabist has checked them.
 */
import { describe, expect, it } from 'vitest';
import type { AnalyzedToken, RawToken } from '../../src/core';
import { AR_ALPHABET, AR_DIACRITICS, AR_EXTRAS, AR_FAMILIES, arJoinOf, arShapes } from '../../src/adapters/arabic/alphabet';
import { arPronunciation } from '../../src/adapters/arabic/pronunciation';
import { checkArProduction } from '../../src/adapters/arabic/production';
import { SUN_LETTERS, ARABIC_ALPHABET } from '../../src/adapters/arabic/text';
import { transliterateArabic } from '../../src/adapters/arabic/translit';

const notes = (s: string, v?: string): string => (arPronunciation(s, v).notes ?? []).join('\n');

describe('arPronunciation: a vocalized word', () => {
  it('gives the transliteration and the article rule for a sun letter', () => {
    const p = arPronunciation('الشمس', 'الشَّمْس');
    expect(p.transliteration).toBe('ash-shams');
    expect(p.ipa).toBeUndefined();
    expect(notes('الشمس', 'الشَّمْس')).toMatch(/not said before this sun letter/);
    expect(notes('الشمس', 'الشَّمْس')).toMatch(/hamzat al-waṣl/);
    expect(notes('الشمس', 'الشَّمْس')).toMatch(/said doubled/);
  });
  it('a moon letter keeps the lām', () => {
    expect(arPronunciation('القمر', 'الْقَمَر').transliteration).toBe('al-qamar');
    expect(notes('القمر', 'الْقَمَر')).toMatch(/moon letter the lām of ال is said/);
    expect(notes('القمر', 'الْقَمَر')).toMatch(/ق is a k said far back/);
  });
  it('tāʾ marbūṭa, long vowels, gemination, the final vowel', () => {
    expect(notes('مدرسة', 'مَدْرَسَة')).toMatch(/not read as t in pause \(madrasa\)/);
    expect(notes('كتاب', 'كِتَاب')).toMatch(/long/);
    expect(notes('علم', 'عَلَّمَ')).toMatch(/doubles the consonant \(l\)/);
    expect(notes('علم', 'عَلَّمَ')).toMatch(/case or mood ending/);
    expect(notes('علم', 'عَلَّمَ')).toMatch(/ع is a squeezed/);
  });
  it('emphatic letters, ح and ه, ث and ذ', () => {
    expect(notes('صلاة', 'صَلَاة')).toMatch(/ص is a heavy s/);
    expect(notes('حديث', 'حَدِيث')).toMatch(/ح is a hissed/);
    expect(notes('ذهب', 'ذَهَب')).toMatch(/ذ is th as in this/);
  });
  it('uses the surface when the page itself is fully vowelled', () => expect(arPronunciation('كِتَابٌ').transliteration).toBe('kitābun'));
  it('ignores a vocalized form that is not the same word', () => expect(arPronunciation('كتاب', 'قَلَم').transliteration).toBeUndefined());
  it('says the voice is Modern Standard only and not a recitation, last', () => {
    const n = arPronunciation('كِتَاب').notes!;
    expect(n[n.length - 1]).toMatch(/Modern Standard Arabic only/);
    expect(n[n.length - 1]).toMatch(/not a Classical recitation/);
  });
  it('does not repeat the machine-drafted disclaimer in every word (it is said once, in translit.ts)', () => expect(notes('كتاب', 'كِتَاب')).not.toMatch(/machine/));
});

describe('arPronunciation: an unvocalized word', () => {
  it('gives no transliteration and no invented vowel, and says why', () => {
    const p = arPronunciation('كتاب');
    expect(p.transliteration).toBeUndefined();
    expect(p.notes!.join(' ')).toMatch(/No vowel marks are printed/);
    expect(p.notes!.join(' ')).toMatch(/cannot be told from the spelling/);
  });
  it('tells only what the letters tell', () => {
    expect(notes('مصطفى')).toMatch(/heavy/);
    expect(notes('مصطفى')).toMatch(/alif maqṣūra/);
    expect(notes('مدرسة')).toMatch(/tāʾ marbūṭa/);
    expect(notes('قلب')).toMatch(/ق is a k said far back/);
  });
  it('words the article only as a condition', () => expect(notes('الشمس')).toMatch(/If the first letters ال are the article/));
  it('a non-Arabic string gets nothing', () => expect(arPronunciation('hello')).toEqual({}));
});

const tok = (surface: string, start = 0): RawToken => ({ surface, start, end: start + surface.length, isWord: true, normalized: surface } as RawToken);
const run = (...words: string[]) => {
  let at = 0;
  const tokens = words.map((w) => { const t = tok(w, at); at += w.length + 1; return t; });
  return checkArProduction(tokens, tokens.map(() => ({ candidates: [] }) as unknown as AnalyzedToken), words.join(' '));
};

describe('checkArProduction', () => {
  it('flags a bare hamza in a closed list and offers the fix with exact offsets', () => {
    const r = run('ذهبت', 'الى', 'المدرسة');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ category: 'spelling', tokenIndexes: [1], suggestion: { start: 5, end: 8, replacement: 'إلى' } });
  });
  it('flags ى / ي exchanges in the closed list', () => {
    expect(run('فى')[0].suggestion?.replacement).toBe('في');
    expect(run('هى')[0].suggestion?.replacement).toBe('هي');
    expect(run('الذى')[0].suggestion?.replacement).toBe('الذي');
    expect(run('حتي')[0].suggestion?.replacement).toBe('حتى');
  });
  it('flags هذة and اللة', () => {
    expect(run('هذة')[0].suggestion?.replacement).toBe('هذه');
    expect(run('اللة')[0].suggestion?.replacement).toBe('الله');
  });
  it('ه for ة is a hint with no suggestion and a low confidence, naming the other reading', () => {
    const r = run('مدرسه');
    expect(r[0].suggestion).toBeUndefined();
    expect(r[0].confidence).toBeLessThanOrEqual(0.5);
    expect(r[0].message).toMatch(/his teacher/);
  });
  it('leaves real words and everything else alone: علي, ان, الا, vowelled words, names', () => {
    for (const w of ['علي', 'ان', 'الا', 'مدرسة', 'إلى', 'إِلَى', 'كتاب', 'الـى', 'hello', 'والى']) expect(run(w), w).toEqual([]);
    const tokens = [tok('الى')];
    const name = [{ candidates: [{ pos: 'PROPN' }] }] as unknown as AnalyzedToken[];
    expect(checkArProduction(tokens, name, 'الى')).toEqual([]);
  });
  it('an empty result is not a claim of correctness (documented): the module header says so', () => expect(run('كتبت', 'الرسالة')).toEqual([]));
});

describe('AR_ALPHABET', () => {
  it('has the 28 letters in alphabet order, each with a name, a sound and an example', () => {
    expect(AR_ALPHABET.map((l) => l.letter)).toEqual(ARABIC_ALPHABET);
    expect(AR_ALPHABET.map((l) => l.order)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    for (const l of AR_ALPHABET) {
      expect(l.name.length, l.letter).toBeGreaterThan(2);
      expect(l.sound.length, l.letter).toBeGreaterThan(3);
      expect(l.sound.length, l.letter).toBeLessThanOrEqual(90);
      expect(l.example.word.startsWith(l.letter) || l.letter === 'ا' || l.letter === 'ع', l.letter).toBe(true);
    }
  });
  it('every example is transliterated by translit.ts exactly as the data says, and the letter transliteration appears in it', () => {
    for (const l of AR_ALPHABET) {
      expect(transliterateArabic(l.example.word)?.text, `${l.letter} ${l.example.word}`).toBe(l.example.translit);
    }
    for (const x of AR_EXTRAS) expect(transliterateArabic(x.example.word)?.text, x.letter).toBe(x.example.translit);
    for (const d of AR_DIACRITICS) expect(transliterateArabic(d.example.word)?.text, d.nameTranslit).toBe(d.example.translit);
  });
  it('the six letters that do not join the next one have only isolated and final shapes', () => {
    const six = AR_ALPHABET.filter((l) => l.join === 'right').map((l) => l.letter);
    expect(six).toEqual([...'ادذرزو']);
    for (const l of AR_ALPHABET.filter((x) => x.join === 'right')) {
      expect(l.shapes.initial, l.letter).toBeUndefined();
      expect(l.shapes.medial, l.letter).toBeUndefined();
      expect(l.shapes.final).toBe(`ـ${l.letter}`);
    }
    expect(AR_ALPHABET.filter((l) => l.join === 'dual')).toHaveLength(22);
  });
  it('the shapes of a joining letter are built with the tatweel', () => {
    expect(arShapes('ب')).toEqual({ isolated: 'ب', initial: 'بـ', medial: 'ـبـ', final: 'ـب' });
    expect(arShapes('د')).toEqual({ isolated: 'د', final: 'ـد' });
    expect(arShapes('ء')).toEqual({ isolated: 'ء', final: 'ء' });
    expect(arJoinOf('ى')).toBe('final-only');
  });
  it('sun and moon: 14 sun letters, the same as the article rule', () => {
    const sun = AR_ALPHABET.filter((l) => l.sun).map((l) => l.letter);
    expect(sun).toHaveLength(14);
    expect(new Set(sun)).toEqual(SUN_LETTERS);
  });
  it('the look-alike families cover the letters named, and a letter lists the others of its family', () => {
    expect(AR_FAMILIES.map((f) => f.letters.join(''))).toEqual(['بتثني', 'جحخ', 'دذ', 'رز', 'سش', 'صض', 'طظ', 'عغ', 'فق']);
    const b = AR_ALPHABET.find((l) => l.letter === 'ب')!;
    expect(b.lookAlikes).toEqual([...'تثني']);
    expect(AR_ALPHABET.find((l) => l.letter === 'م')!.lookAlikes).toEqual([]);
  });
  it('the emphatic pairs point both ways', () => {
    const get = (c: string) => AR_ALPHABET.find((l) => l.letter === c)!.emphatic;
    expect(get('س')).toEqual({ role: 'plain', partner: 'ص' });
    expect(get('ص')).toEqual({ role: 'emphatic', partner: 'س' });
    expect(get('ظ')).toEqual({ role: 'emphatic', partner: 'ذ' });
    expect(get('ب')).toBeUndefined();
  });
});

describe('AR_EXTRAS and AR_DIACRITICS', () => {
  it('the extra spellings', () => {
    expect(AR_EXTRAS.map((x) => x.letter)).toEqual(['ء', 'أ', 'إ', 'آ', 'ؤ', 'ئ', 'ة', 'ى', 'ٱ', 'لا']);
    expect(AR_EXTRAS.find((x) => x.letter === 'ئ')!.shapes.medial).toBe('ـئـ');
    expect(AR_EXTRAS.find((x) => x.letter === 'ؤ')!.join).toBe('right');
    expect(AR_EXTRAS.find((x) => x.letter === 'ء')!.join).toBe('none');
  });
  it('the diacritics table: name, function, example, and the mark is exactly one code point', () => {
    expect(AR_DIACRITICS.map((d) => d.nameTranslit.split(' ')[0])).toEqual(['fatḥa', 'ḍamma', 'kasra', 'fatḥatān', 'ḍammatān', 'kasratān', 'sukūn', 'shadda', 'dagger', 'madda']);
    for (const d of AR_DIACRITICS) {
      expect([...d.mark]).toHaveLength(1);
      expect(d.function.length).toBeGreaterThan(10);
      expect(d.example.word).toContain(d.mark === 'ٓ' ? 'آ' : d.mark);
    }
  });
});

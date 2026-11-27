/**
 * Arabic text views (src/adapters/arabic/text.ts): canonical, key, loose, vocalization packing, the printed-against-candidate
 * comparison, offsets back into the printed word, tokens. Marks are written as escapes so nothing invisible hides here.
 */
import { describe, expect, it } from 'vitest';
import {
  applyVocal, arCanon, arKey, arKeyMap, arLoose, arSegmentSentences, arSearchNormalize, arShardLetters, arTokenize, asciiDigits, hasTashkil,
  packVocal, rootRadicals, splitVocal, tashkilLevel, unpackVocal, vocalMatch, FATHA, KASRA, DAMMA, SUKUN, SHADDA, FATHATAN, DAMMATAN, DAGGER_ALIF, TATWEEL,
} from '../../src/adapters/arabic/text';

const kitabun = `ك${KASRA}ت${FATHA}اب${DAMMATAN}`; // كِتَابٌ
const kataba = `ك${FATHA}ت${FATHA}ب${FATHA}`; // كَتَبَ
const kutiba = `ك${DAMMA}ت${KASRA}ب${FATHA}`; // كُتِبَ
const allama = `ع${FATHA}ل${SHADDA}${FATHA}م${FATHA}`; // عَلَّمَ typed shadda first

describe('arCanon and arKey', () => {
  it('puts marks in one order, so the two ways of typing a doubled vowelled letter are one form', () => {
    const other = `ع${FATHA}ل${FATHA}${SHADDA}م${FATHA}`;
    expect(arCanon(allama)).toBe(arCanon(other));
    expect(arKey(allama)).toBe('علم');
  });
  it('removes vowels, tatweel and format characters from the key, and keeps hamza seats, ة and ى', () => {
    expect(arKey(kitabun)).toBe('كتاب');
    expect(arKey(`الجمي${TATWEEL}${TATWEEL}ل`)).toBe('الجميل');
    expect(arKey('أَكَلَ')).toBe('أكل');
    expect(arKey('مَدْرَسَة')).toBe('مدرسة');
    expect(arKey('رَمَى')).toBe('رمى');
    expect(arKey(`ه${DAGGER_ALIF}ذا`)).toBe('هذا');
    expect(arKey('ٱللَّه')).toBe('الله');
  });
  it('turns presentation forms and the lām-alif ligature back into letters, and Persian kāf and yeh into the Arabic ones', () => {
    expect(arKey('ﻻ')).toBe('لا');
    expect(arKey('ﺏﺘﺎﺏ')).toBe('بتاب');
    expect(arKey('کتاب')).toBe('كتاب');
    expect(arKey('فی')).toBe('في');
  });
  it('moves a fatḥatān typed after its alif before it', () => {
    const after = `كتابا${FATHATAN}`;
    const before = `كتاب${FATHATAN}ا`;
    expect(arCanon(after)).toBe(arCanon(before));
  });
  it('the loose fold is for finding candidates only: it merges what the key keeps apart, at the same length', () => {
    expect(arLoose('أكل')).toBe('اكل');
    expect(arLoose('إلى')).toBe('الي');
    expect(arLoose('مدرسة')).toBe('مدرسه');
    expect(arKey('مدرسة')).not.toBe(arKey('مدرسه'));
    expect(arKey('علي')).not.toBe(arKey('على'));
    expect(arLoose('آمن').length).toBe(3);
    expect(arSearchNormalize(' أَكَلَ ')).toBe('اكل');
    expect(arShardLetters('أَكَلَ')).toBe('اكل');
  });
});

describe('vocalization', () => {
  it('packs and restores the vowels of a form, including shadda, tanwīn and the dagger alif', () => {
    for (const f of [kitabun, kataba, kutiba, allama, 'مَكْتَبَة', 'الشَّمْس', `ه${DAGGER_ALIF}ذ${FATHA}ا`, 'هُدًى']) {
      expect(applyVocal(arKey(f), packVocal(f)), f).toBe(arCanon(f));
    }
    expect(packVocal('كتاب')).toBe('');
    expect(applyVocal('كتاب', '')).toBe('كتاب');
    expect(splitVocal(kitabun).marks.map((m) => m.vowel)).toEqual([KASRA, FATHA, '', DAMMATAN]);
    expect(unpackVocal('علم', packVocal(allama))[1]).toEqual({ vowel: FATHA, shadda: true, dagger: false });
  });
  it('says how much of a printed word is vocalized', () => {
    expect(tashkilLevel('كتاب')).toBe('none');
    expect(tashkilLevel(kitabun)).toBe('full');
    expect(tashkilLevel(`ك${DAMMA}تب`)).toBe('partial');
    expect(hasTashkil('كتب')).toBe(false);
    expect(hasTashkil(kutiba)).toBe(true);
  });
  it('compares only what is printed: an unvocalized word agrees with every reading, one printed vowel rules readings out', () => {
    expect(vocalMatch('كتب', 'كتب', packVocal(kataba))).toMatchObject({ compatible: true, agreed: 0 });
    const oneVowel = `ك${DAMMA}تب`; // كُتب
    expect(vocalMatch(oneVowel, 'كتب', packVocal(kutiba))).toMatchObject({ compatible: true, agreed: 1 });
    expect(vocalMatch(oneVowel, 'كتب', packVocal(kataba)).compatible).toBe(false);
    expect(vocalMatch(oneVowel, 'كتب', packVocal(kataba)).conflict).toMatchObject({ at: 0, printed: DAMMA });
    // a printed shadda needs the candidate's
    expect(vocalMatch(`عل${SHADDA}م`, 'علم', packVocal(allama)).compatible).toBe(true);
    expect(vocalMatch(`عل${SHADDA}م`, 'علم', packVocal('عَلِمَ')).compatible).toBe(false);
    // a printed sukūn agrees with a letter the source left bare
    expect(vocalMatch(`مِن${SUKUN}`, 'من', packVocal('مِن')).compatible).toBe(true);
    // the case ending alone
    const acc = `ك${KASRA}ت${FATHA}اب${FATHA}`;
    expect(vocalMatch(acc, 'كتاب', packVocal(kitabun))).toMatchObject({ compatible: false, endingOnly: true });
    // different lengths never match
    expect(vocalMatch('كتاب', 'كتب', '').compatible).toBe(false);
  });
});

describe('offsets, digits, roots', () => {
  it('maps every key letter back to its place in the printed word', () => {
    const printed = `و${FATHA}ب${KASRA}ال${SUKUN}ك${KASRA}ت${FATHA}اب${KASRA}`; // وَبِالْكِتَابِ
    const m = arKeyMap(printed);
    expect(m.key).toBe('وبالكتاب');
    expect(m.starts).toHaveLength(m.key.length);
    for (let i = 0; i < m.key.length; i++) expect(arKey(printed.slice(m.starts[i], m.ends[i]))).toBe(m.key[i]);
    // the stem كتاب (key letters 4..7) as a slice of the printed word keeps its own vowels
    expect(arKey(printed.slice(m.starts[4], m.ends[7]))).toBe('كتاب');
    expect(printed.slice(m.starts[4], m.ends[7])).toContain(KASRA);
  });
  it('reads Arabic-Indic and extended digits, and splits a root into its radicals in order', () => {
    expect(asciiDigits('٣٤ ۵۶ 7')).toBe('34 56 7');
    expect(rootRadicals('ك ت ب')).toEqual(['ك', 'ت', 'ب']);
    expect(rootRadicals(undefined)).toEqual([]);
  });
});

describe('tokens and sentences', () => {
  it('keeps an orthographic word whole with its marks and tatweel; offsets slice the input exactly', () => {
    const text = `و${FATHA}ب${KASRA}الكتاب الجمي${TATWEEL}ل، قرأت 3 كتب ٣ books.`;
    const toks = arTokenize(text);
    for (const t of toks) expect(text.slice(t.start, t.end)).toBe(t.surface);
    const words = toks.filter((t) => t.isWord);
    expect(words.map((t) => t.normalized)).toEqual(['وبالكتاب', 'الجميل', 'قرأت', 'كتب', 'books']);
    expect(toks.filter((t) => !t.isWord).map((t) => t.surface)).toEqual(['،', '3', '٣', '.']);
  });
  it('ends a sentence at the Arabic question mark and the full stop, not at the Arabic comma', () => {
    const text = 'هل قرأت الكتاب؟ نعم، قرأته. هذا جميل';
    expect(arSegmentSentences(text).map((s) => text.slice(s.start, s.end))).toEqual(['هل قرأت الكتاب؟', 'نعم، قرأته.', 'هذا جميل']);
  });
});

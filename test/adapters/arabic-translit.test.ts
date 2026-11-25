// @vitest-environment node
/**
 * Arabic transliteration (src/adapters/arabic/translit.ts). The expected transliterations are the author's own, machine-drafted
 * from general knowledge of Arabic and of the DIN 31635 / ALA-LC convention the module states; no native speaker or Arabist has
 * checked them. The brief's own examples come first.
 */
import { describe, expect, it } from 'vitest';
import { AR_MACHINE_DISCLAIMER, AR_TRANSLIT_CONVENTION, transliterateArabic } from '../../src/adapters/arabic/translit';

const t = (s: string, pausal?: boolean): string | undefined => transliterateArabic(s, pausal ? { pausal: true } : undefined)?.text;

describe('transliterateArabic: the brief’s examples', () => {
  it.each([
    ['الشَّمْس', 'ash-shams'],
    ['الْقَمَر', 'al-qamar'],
    ['كِتَاب', 'kitāb'],
    ['مَدْرَسَة', 'madrasa'],
    ['هُدًى', 'hudan'],
    ['عَلَّمَ', 'ʿallama'],
    ['اِسْتَغْفَرَ', 'istaghfara'],
    ['رَآهُ', 'raʾāhu'],
    ['قُلْ', 'qul'],
  ])('%s → %s', (ar, tr) => expect(t(ar)).toBe(tr));
});

describe('transliterateArabic: letters, long vowels and shadda', () => {
  it.each([
    ['مُحَمَّد', 'muḥammad'],
    ['دُرُوس', 'durūs'],
    ['بَيْت', 'bayt'],
    ['يَوْم', 'yawm'],
    ['شَيْخ', 'shaykh'],
    ['سُورَة', 'sūra'],
    ['قُوَّة', 'quwwa'],
    ['عَرَبِيَّة', 'ʿarabiyya'],
    ['فِي', 'fī'],
    ['لَا', 'lā'],
    ['عِيسَى', 'ʿīsā'],
    ['يَدْعُو', 'yadʿū'],
    ['يَقُولُ', 'yaqūlu'],
    ['كَتَبُوا', 'katabū'],
    ['يَكْتُبُونَ', 'yaktubūna'],
    ['ذَهَبَ', 'dhahaba'],
    ['خَرَجَ', 'kharaja'],
    ['مَكْتَبَة', 'maktaba'],
    ['اِبْن', 'ibn'],
    ['اِسْم', 'ism'],
    ['هَٰذَا', 'hādhā'],
    ['آمَنَ', 'āmana'],
    ['قُرْآن', 'qurʾān'],
  ])('%s → %s', (ar, tr) => expect(t(ar)).toBe(tr));
});

describe('transliterateArabic: hamza', () => {
  it('a hamza at the start is not written, inside and at the end it is ʾ', () => {
    expect(t('أَنَا')).toBe('anā');
    expect(t('إِلَى')).toBe('ilā');
    expect(t('إِسْلَام')).toBe('islām');
    expect(t('مَاء')).toBe('māʾ');
    expect(t('بَدْء')).toBe('badʾ');
    expect(t('فُؤَاد')).toBe('fuʾād');
    expect(t('سُؤَال')).toBe('suʾāl');
  });
  it('the stem after the article drops its initial hamza too', () => expect(t('الْأَرْض')).toBe('al-arḍ'));
});

describe('transliterateArabic: tanwīn and tāʾ marbūṭa', () => {
  it('tanwīn is -un -an -in, and the alif written after fatḥatān adds nothing', () => {
    expect(t('كِتَابٌ')).toBe('kitābun');
    expect(t('كِتَابٍ')).toBe('kitābin');
    expect(t('كِتَابًا')).toBe('kitāban');
    expect(t('سَمَاءً')).toBe('samāʾan');
    expect(t('أَهْلًا')).toBe('ahlan');
  });
  it('tāʾ marbūṭa is t before an ending, not written in pause, h after ā', () => {
    expect(t('مَدْرَسَةُ')).toBe('madrasatu');
    expect(t('مَدْرَسَةً')).toBe('madrasatan');
    expect(t('مَدْرَسَةٍ')).toBe('madrasatin');
    expect(t('صَلَاة')).toBe('ṣalāh');
  });
});

describe('transliterateArabic: the article and the prefixes', () => {
  it('sun letters assimilate and the transliteration writes it; moon letters keep al-', () => {
    expect(t('النُّور')).toBe('an-nūr');
    expect(t('ٱلرَّحْمَٰنِ')).toBe('ar-raḥmāni');
    expect(t('الدَّرْس')).toBe('ad-dars');
    expect(t('الْكِتَاب')).toBe('al-kitāb');
    expect(t('الْعَرَبِيَّة')).toBe('al-ʿarabiyya');
  });
  it('after و ب ل the alif of the article is dropped', () => {
    expect(t('وَالْقَمَر')).toBe('wa-l-qamar');
    expect(t('بِالشَّمْسِ')).toBe('bi-sh-shamsi');
    expect(t('لِلْوَلَدِ')).toBe('li-l-waladi');
  });
  it('Allāh and the relative pronouns are written fused', () => {
    expect(t('ٱللَّهِ')).toBe('Allāhi');
    expect(t('الَّذِي')).toBe('alladhī');
    expect(t('وَالَّذِي')).toBe('wa-lladhī');
  });
  it('several words are done one by one', () => expect(t('بِسْمِ ٱللَّهِ')).toBe('bismi Allāhi'));
});

describe('transliterateArabic: pause', () => {
  it('drops the final short vowel and tanwīn, fatḥatān becomes ā, tāʾ marbūṭa is not t', () => {
    expect(t('كِتَابُ', true)).toBe('kitāb');
    expect(t('كِتَابًا', true)).toBe('kitābā');
    expect(t('مَدْرَسَةٌ', true)).toBe('madrasa');
    expect(t('فَعَلَ', true)).toBe('faʿal');
  });
  it('is applied to the last word only', () => expect(t('بِسْمِ ٱللَّهِ', true)).toBe('bismi Allāh'));
});

describe('transliterateArabic: never guesses', () => {
  it('an unvocalized word has no transliteration', () => {
    for (const w of ['كتاب', 'مدرسة', 'الشمس', 'و', '']) expect(t(w), w).toBeUndefined();
  });
  it('a part-vowelled word (a letter inside with no vowel or sukūn) has none either', () => {
    expect(t('كَتبَ')).toBeUndefined();
    expect(t('مَدرَسَة')).toBeUndefined();
  });
  it('silent letters it does not know are not guessed; other scripts are not transliterated', () => {
    expect(t('مِائَة')).toBeUndefined();
    expect(t('عَمْرٌو')).toBeUndefined();
    expect(t('Hello')).toBeUndefined();
    expect(t('ٱسْمُ')).toBeUndefined(); // an alif waṣla with no mark: its vowel is not printed
    expect(t('1234')).toBeUndefined();
  });
  it('one unvocalized word makes a phrase undefined, not half a phrase', () => expect(t('بِسْمِ الله')).toBeUndefined());
});

describe('transliterateArabic: the auditor’s cases', () => {
  it.each([['أُولَٰئِكَ', 'ulāʾika'], ['أُولُو', 'ulū'], ['أُولَى', 'ulā'], ['ظَبْي', 'ẓaby'], ['دَلْو', 'dalw'], ['وَعْي', 'waʿy'], ['نَفْي', 'nafy'], ['فَتَاة', 'fatāh']])('%s → %s', (a, b) => expect(t(a)).toBe(b));
});

describe('transliterateArabic: the digraph guard', () => {
  it('t, d, s or k before ه with no vowel between gets a prime so it does not read as th, dh, sh, kh', () => {
    expect(t('أَدْهَم')).toBe('adʹham');
    expect(t('مَسْهَل')).toBe('masʹhal');
  });
});

describe('transliterateArabic: notes', () => {
  it('states the convention and the machine-drafted disclaimer once, for the language, not on every word', () => {
    expect(AR_TRANSLIT_CONVENTION).toMatch(/DIN 31635/);
    expect(AR_MACHINE_DISCLAIMER).toMatch(/not been reviewed by a native speaker or an Arabist/);
    expect(transliterateArabic('كِتَاب')!.notes.join(' ')).not.toMatch(/machine|DIN 31635/);
  });
  it('the tāʾ marbūṭa note names the word it is on', () => expect(transliterateArabic('فَتَاة')!.notes.join(' ')).toContain('(fatāh)'));
  it('names the rules that applied', () => {
    expect(transliterateArabic('الشَّمْس')!.notes.join(' ')).toMatch(/assimilated/);
    expect(transliterateArabic('مَدْرَسَة')!.notes.join(' ')).toMatch(/pause/);
    expect(transliterateArabic('أَنَا')!.notes.join(' ')).toMatch(/hamza at the start/);
  });
});

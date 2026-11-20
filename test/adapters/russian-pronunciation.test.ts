// @vitest-environment node
/**
 * Russian transliteration and pronunciation notes. Every note is a rule about THIS word, so each rule is tested with words it applies
 * to and with words it must not fire on. A combining acute is always written as \u0301 here. The examples are the author's own,
 * machine-drafted from general knowledge of Russian; none has been checked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import { ruPronunciation } from '../../src/adapters/russian/pronunciation';
import { ruTransliterate } from '../../src/adapters/russian/translit';

const A = '\u0301';
const notes = (w: string, stress?: number[]): string[] => ruPronunciation(w, stress).notes ?? [];
const has = (w: string, re: RegExp, stress?: number[]): boolean => notes(w, stress).some((n) => re.test(n));

describe('ruTransliterate', () => {
  it('uses the scholarly scheme letter by letter', () => {
    expect(ruTransliterate('щи')).toBe('šči');
    expect(ruTransliterate('чай')).toBe('čaj');
    expect(ruTransliterate('жёлтый')).toBe('žëltyj');
    expect(ruTransliterate('хорошо')).toBe('xorošo');
    expect(ruTransliterate('цирк')).toBe('cirk');
    expect(ruTransliterate('мы')).toBe('my');
    expect(ruTransliterate('это')).toBe('èto');
    expect(ruTransliterate('мать')).toBe('mat\u02b9');
    expect(ruTransliterate('Москва')).toBe('Moskva');
  });

  it('writes j before е, ё at the start of a word, after a vowel, after ь and after ъ, and never after a consonant', () => {
    expect(ruTransliterate('его')).toBe('jego');
    expect(ruTransliterate('ель')).toBe('jel\u02b9');
    expect(ruTransliterate('ёж')).toBe('jëž');
    expect(ruTransliterate('моё')).toBe('mojë');
    expect(ruTransliterate('семья')).toBe('sem\u02b9ja');
    expect(ruTransliterate('подъезд')).toBe('pod\u02bajezd');
    expect(ruTransliterate('мёд')).toBe('mëd');
    expect(ruTransliterate('нет')).toBe('net');
    expect(ruTransliterate('я')).toBe('ja');
    expect(ruTransliterate('юг')).toBe('jug');
  });

  it('marks the stressed vowel with an acute when positions are given, and writes none otherwise', () => {
    expect(ruTransliterate('книгу', [2])).toBe(`kni${A}gu`.normalize('NFC'));
    expect(ruTransliterate('молоко', [5])).toBe(`moloko${A}`.normalize('NFC'));
    expect(ruTransliterate('яблоко', [0])).toBe(`ja${A}bloko`.normalize('NFC'));
    expect(ruTransliterate('язык', [2])).toBe(`jazy${A}k`.normalize('NFC'));
    expect(ruTransliterate('это', [0])).toBe(`è${A}to`);
    expect(ruTransliterate('книгу')).toBe('knigu');
    expect(ruTransliterate('ёлка', [0])).toBe('jëlka'); // ё needs no acute
    expect(ruTransliterate('книгу', [0, 99])).toBe('knigu'); // positions that are not vowels are ignored
  });
});

describe('ruPronunciation: shape', () => {
  it('gives a transliteration and notes, and never an IPA', () => {
    const r = ruPronunciation('книгу', [2]);
    expect(r.transliteration).toBe(`kni${A}gu`.normalize('NFC'));
    expect(r.ipa).toBeUndefined();
    expect(r.ipaSource).toBeUndefined();
    expect(r.notes!.length).toBeGreaterThan(0);
  });
  it('returns nothing for text with no Russian letter', () => {
    expect(ruPronunciation('hello')).toEqual({});
    expect(ruPronunciation('')).toEqual({});
    expect(ruPronunciation('123')).toEqual({});
  });
  it('takes the stress the text writes, and the explicit positions over it', () => {
    expect(ruPronunciation(`кни${A}гу`).transliteration).toBe(`kni${A}gu`.normalize('NFC'));
    expect(ruPronunciation(`кни${A}гу`, [4]).transliteration).toBe(`knigu\u0301`.normalize('NFC'));
  });
  it('every note is a non-empty sentence with no stray placeholder', () => {
    for (const w of ['книгу', 'молоко', 'здравствуйте', 'сегодня', 'чтобы', 'учится', 'подъезд', 'семья', 'жизнь', 'вкус', 'кто-то', 'всё-таки', 'на', 'в', 'я']) {
      for (const n of notes(w)) {
        expect(n.length, `${w}: ${n}`).toBeGreaterThan(10);
        expect(n, w).not.toMatch(/undefined|NaN|\[object/);
        expect(n.trim().endsWith('.') || n.trim().endsWith(')'), `${w}: ${n}`).toBe(true);
      }
      expect(notes(w).length, w).toBeLessThanOrEqual(8);
    }
  });
});

describe('ruPronunciation: stress', () => {
  it('states where the stress falls when it is known', () => {
    expect(notes('книгу', [2])[0]).toBe(`Stress on the 1st syllable: кни${A}гу.`);
    expect(notes('книгу', [4])[0]).toBe(`Stress on the 2nd syllable: книгу${A}.`);
    expect(notes('молоко', [5])[0]).toBe(`Stress on the 3rd syllable: молоко${A}.`);
    expect(notes('яблоко', [0])[0]).toBe(`Stress on the 1st syllable: я${A}блоко.`);
  });
  it('knows ё is stressed without being told', () => {
    expect(notes('жёлтый')[0]).toBe('Stress on the 1st syllable: жёлтый (ё is always stressed).');
  });
  it('says Russian does not write stress when it is not known, and states no rule that depends on stress', () => {
    const n = notes('книгу');
    expect(n[0]).toBe('Russian does not write stress; a dictionary gives it.');
    expect(n.some((x) => /unstressed|Stress on the/.test(x))).toBe(false);
    expect(ruPronunciation('молоко').transliteration).toBe('moloko');
    expect(ruPronunciation('молоко').notes!.some((x) => /unstressed о/.test(x))).toBe(false);
  });
  it('ignores a position that is not a vowel (never invents a stress)', () => {
    expect(notes('книгу', [0])[0]).toBe('Russian does not write stress; a dictionary gives it.');
  });
  it('says nothing about stress for a one-vowel word, and says that a short word has none of its own', () => {
    expect(notes('дом').some((x) => /Stress/.test(x))).toBe(false);
    expect(notes('на')[0]).toBe('A short word like this has no stress of its own: it is said together with the next word.');
    expect(ruPronunciation('на').transliteration).toBe('na');
    expect(notes('в')[0]).toBe('A word with no vowel (like в, к, с) is said together with the next word.');
  });
  it('reports more than one recorded stress as such', () => {
    expect(notes('молоко', [1, 5])[0]).toMatch(/^More than one stress is recorded/);
    expect(notes('молоко', [1, 5]).some((x) => /unstressed о/.test(x))).toBe(false);
  });
  it('shows a hyphenated word whole', () => {
    expect(notes('кто-то', [2])[0]).toBe(`Stress: кто${A}-то.`);
    expect(ruPronunciation('кто-то', [2]).transliteration).toBe(`kto${A}-to`.normalize('NFC'));
  });
});

describe('ruPronunciation: unstressed vowels (only when the stress is known)', () => {
  it('unstressed о is said like а: fires on молоко, not on a stressed о and not without a known stress', () => {
    const n = notes('молоко', [5]);
    expect(n.some((x) => x.includes('the о in syllables 1 and 2 sounds like а'))).toBe(true);
    expect(has('слон', /unstressed о/)).toBe(false); // one vowel, stressed
    expect(has('город', /unstressed о/, [1])).toBe(true); // the second о
    expect(has('нос', /unstressed о/)).toBe(false);
  });
  it('does not claim the reduction after ч or щ', () => {
    expect(has('часы', /unstressed а/, [3])).toBe(false);
  });
  it('unstressed а is weaker', () => {
    expect(has('машина', /An unstressed а/, [3])).toBe(true);
    expect(has('книга', /An unstressed а/, [2])).toBe(true);
    expect(has('голова', /An unstressed а/, [5])).toBe(false); // the only а is the stressed one
  });
  it('unstressed е and я are weak, but not after ж ш ц (those are said like ы)', () => {
    expect(has('река', /An unstressed е or я is weak/, [3])).toBe(true);
    expect(has('язык', /An unstressed е or я is weak/, [2])).toBe(true);
    expect(has('нет', /An unstressed е or я/)).toBe(false);
    expect(has('жена', /An unstressed е or я/, [3])).toBe(false);
    expect(has('жена', /the unstressed е in же is said like ы/, [3])).toBe(true);
    expect(has('шесть', /the stressed е in ше is said like э/)).toBe(true);
    expect(has('жена', /said like э when stressed and like ы when not/)).toBe(true); // stress unknown: both stated, none chosen
  });
});

describe('ruPronunciation: the special words and endings', () => {
  it('г is said в in -ого / -его and in сегодня', () => {
    expect(has('нового', /sounds like но\u0301вово/, [1])).toBe(true);
    expect(has('его', /sounds like ево/)).toBe(true);
    expect(has('какого', /ending -ого/)).toBe(true);
    expect(has('сегодня', /сегодня sounds like севодня/)).toBe(true);
    expect(has('сегодняшний', /севодня/)).toBe(true);
  });
  it('and not in the adverbs and names that keep г', () => {
    for (const w of ['много', 'строго', 'дорого', 'убого', 'немного', 'Диего'.toLowerCase()]) expect(has(w, /ending -ого/), w).toBe(false);
    expect(has('того', /ending -ого/, [3])).toBe(true); // the pronoun
    expect(has('того', /ending -ого/, [1])).toBe(false); // the country, stressed on the first syllable
    expect(has('дома', /ending -ого/)).toBe(false);
  });
  it('ч is said ш in что and the listed words, and not in точно or ночь', () => {
    expect(has('что', /что sounds like што/)).toBe(true);
    expect(has('чтобы', /чтобы sounds like штобы/)).toBe(true);
    expect(has('конечно', /конешно/)).toBe(true);
    expect(has('скучно', /скушно/)).toBe(true);
    expect(has('точно', /is said like ш/)).toBe(false);
    expect(has('ночь', /is said like ш/)).toBe(false);
  });
  it('-тся and -ться are said ца, and only those endings', () => {
    expect(has('учится', /The ending -тся is said like ца: у\u0301чится sounds like у\u0301чица/, [0])).toBe(true);
    expect(has('учиться', /The ending -ться is said like ца: учи\u0301ться sounds like учи\u0301ца/, [2])).toBe(true);
    expect(has('мыться', /-ться/)).toBe(true);
    expect(has('учился', /ending -т?ся|-тся|-ться/)).toBe(false);
    expect(has('вернуться', /-ться/)).toBe(true);
    expect(has('мастер', /-тся|-ться/)).toBe(false);
  });
  it('names the silent consonants of the listed words, in every form of the stem', () => {
    expect(has('здравствуйте', /the first в is not pronounced/, [3])).toBe(true);
    expect(has('солнце', /the л is not pronounced/, [1])).toBe(true);
    expect(has('солнца', /the л is not pronounced/)).toBe(true);
    expect(has('сердце', /the д is not pronounced/)).toBe(true);
    expect(has('лестница', /the т is not pronounced/)).toBe(true);
    expect(has('поздно', /the д is not pronounced/)).toBe(true);
    expect(has('чувство', /the в is not pronounced/)).toBe(true);
    expect(has('праздник', /the з is not pronounced/)).toBe(true);
    expect(has('солома', /not pronounced/)).toBe(false);
    expect(has('здание', /not pronounced/)).toBe(false);
  });
  it('gives no assimilation note inside a silent-letter stem (it would contradict the silent letter)', () => {
    expect(has('здравствуйте', /Before a voiced|Before a voiceless/)).toBe(false);
    expect(has('чувство', /Before a voiced|Before a voiceless/)).toBe(false);
  });
});

describe('ruPronunciation: final devoicing', () => {
  it('says a final voiced consonant is voiceless, with the word respelled', () => {
    expect(has('год', /год sounds like гот/)).toBe(true);
    expect(has('хлеб', /хлеб sounds like хлеп/)).toBe(true);
    expect(has('нож', /нож sounds like нош/)).toBe(true);
    expect(has('глаз', /глаз sounds like глас/)).toBe(true);
    expect(has('лев', /лев sounds like леф/)).toBe(true);
  });
  it('devoices the whole voiced tail of a final cluster', () => {
    expect(has('мозг', /мозг sounds like моск/)).toBe(true);
  });
  it('treats бог separately (х) and does not fire on a voiceless or sonorant ending, a vowelless word, or a proclitic', () => {
    expect(has('бог', /бох/)).toBe(true);
    expect(has('бог', /sounds like бок/)).toBe(false);
    for (const w of ['дом', 'мост', 'рот', 'вода', 'день', 'мать']) expect(has(w, /voiced consonant at the end/), w).toBe(false);
    expect(has('в', /voiced consonant at the end/)).toBe(false);
    for (const w of ['без', 'из', 'под', 'над', 'об']) expect(has(w, /voiced consonant at the end/), w).toBe(false);
  });
});

describe('ruPronunciation: signs and the y-sound', () => {
  it('е ё ю я begin with a y-sound at the start, after a vowel, after ь and after ъ, and not after a consonant', () => {
    expect(has('ёлка', /the ё is said yo/)).toBe(true);
    expect(has('моя', /the я is said ya/, [2])).toBe(true);
    expect(has('его', /the е is said ye/)).toBe(true);
    expect(has('семья', /the я is said ya/)).toBe(true);
    expect(has('подъезд', /the е is said ye/)).toBe(true);
    expect(has('мясо', /y-sound: in/)).toBe(false);
    expect(has('нет', /y-sound: in/)).toBe(false);
    expect(has('книга', /y-sound: in/)).toBe(false);
  });
  it('ь softens the consonant before it and is not a sound', () => {
    expect(has('мать', /The ь is not a sound: it makes the consonant before it soft. In мать the т is soft\./)).toBe(true);
    expect(has('день', /the н is soft/)).toBe(true);
  });
  it('ь after ж ш ч щ is a spelling mark only, and says nothing about softness', () => {
    expect(has('ночь', /only a spelling mark/)).toBe(true);
    expect(has('мышь', /only a spelling mark/)).toBe(true);
    expect(has('ночь', /makes the consonant before it soft/)).toBe(false);
  });
  it('ь before a vowel letter keeps the consonant soft and adds a y-sound', () => {
    expect(has('семья', /ь before я keeps the consonant before it soft and adds a y-sound/)).toBe(true);
    expect(has('вьюга', /ь before ю/)).toBe(true);
  });
  it('ъ separates and keeps the consonant hard', () => {
    expect(has('подъезд', /The ъ is not a sound: it keeps the consonant before it hard/)).toBe(true);
    expect(has('объект', /The ъ is not a sound/)).toBe(true);
    expect(has('дом', /The ъ/)).toBe(false);
  });
});

describe('ruPronunciation: ж ш ц ч щ and the vowels after them', () => {
  it('жи ши ци are said with ы', () => {
    expect(has('жизнь', /so жи is said like жы/)).toBe(true);
    expect(has('шить', /so ши is said like шы/)).toBe(true);
    expect(has('цирк', /so ци is said like цы/)).toBe(true);
    expect(has('жить', /жы/)).toBe(true);
  });
  it('and not on other vowels or other consonants', () => {
    expect(has('жук', /is said like жы/)).toBe(false);
    expect(has('мир', /is said like .ы/)).toBe(false);
    expect(has('чита', /is said like чы/)).toBe(false);
  });
  it('ё after ж and ш is said like о', () => {
    expect(has('жёлтый', /жё sounds like жо/)).toBe(true);
    expect(has('шёл', /шё sounds like шо/)).toBe(true);
    expect(has('чёрный', /sounds like .о\./)).toBe(false);
  });
  it('ч and щ are always soft', () => {
    expect(has('чай', /always soft/)).toBe(true);
    expect(has('борщ', /always soft/)).toBe(true);
    expect(has('дом', /always soft/)).toBe(false);
  });
});

describe('ruPronunciation: assimilation and softness', () => {
  it('a voiced consonant before a voiceless one is said voiceless', () => {
    expect(has('вкус', /in вкус the в before к is said like ф/)).toBe(true);
    expect(has('ложка', /the ж before к is said like ш/)).toBe(true);
  });
  it('a voiceless consonant before a voiced one is said voiced', () => {
    expect(has('сдать', /in сдать the с before д is said like з/)).toBe(true);
    expect(has('отдать', /the т before д is said like д/)).toBe(true);
  });
  it('в never makes a preceding consonant voiced, г is left out, and ь stops the rule', () => {
    expect(has('свой', /Before a voiced/)).toBe(false);
    expect(has('твой', /Before a voiced/)).toBe(false);
    expect(has('легко', /Before a voice/)).toBe(false);
    expect(has('мягкий', /Before a voice/)).toBe(false);
    expect(has('дверь', /Before a voice/)).toBe(false);
  });
  it('a consonant before е ё и ю я is usually soft, with the exceptions named, and not for ж ш ц ч щ', () => {
    expect(has('мясо', /in мя is soft|the м in мя is soft/)).toBe(true);
    expect(has('мир', /the м in ми is soft/)).toBe(true);
    expect(has('жить', /is usually said soft/)).toBe(false);
    expect(has('кафе', /is usually said soft/)).toBe(false);
    expect(has('отель', /is usually said soft/)).toBe(false);
    expect(has('тест', /is usually said soft/)).toBe(false);
    expect(has('мама', /is usually said soft/)).toBe(false);
  });
});

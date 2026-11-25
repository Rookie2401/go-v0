// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  COMPOUND_FINALS, COMPOUND_VOWELS, DOUBLE_CONSONANTS, FINALS, LEADS, VOWELS,
  compose, decompose, finalOf, fromJamo, hasFinal, isCompatJamo, isConjoiningJamo, isHangul, isHangulSyllable, isHanja, koKey, koNormalize,
  koShardLetters, lastSyllable, leadOf, originalSpan, romanizeRespelling, scriptOf, splitCompoundFinal, splitCompoundVowel, syllablesOf,
  toJamo, vowelOf, withFinal, withoutFinal,
} from '../../../src/adapters/korean/hangul';

const ALL: string[] = [];
for (let c = 0xac00; c <= 0xd7a3; c++) ALL.push(String.fromCharCode(c));

describe('tables', () => {
  it('have 19 leads, 21 vowels, 28 finals (the first none), all compatibility jamo', () => {
    expect(LEADS).toHaveLength(19);
    expect(VOWELS).toHaveLength(21);
    expect(FINALS).toHaveLength(28);
    expect(FINALS[0]).toBe('');
    for (const j of [...LEADS, ...VOWELS, ...FINALS.slice(1)]) {
      expect(j).toHaveLength(1);
      expect(isCompatJamo(j)).toBe(true);
    }
    expect(new Set(LEADS).size).toBe(19);
    expect(new Set(VOWELS).size).toBe(21);
    expect(new Set(FINALS).size).toBe(28);
  });
  it('split compound vowels, double consonants and compound finals into their parts', () => {
    expect(Object.keys(COMPOUND_VOWELS)).toHaveLength(7);
    expect(Object.keys(DOUBLE_CONSONANTS)).toHaveLength(5);
    expect(Object.keys(COMPOUND_FINALS)).toHaveLength(11);
    expect(splitCompoundVowel('ㅘ')).toEqual(['ㅗ', 'ㅏ']);
    expect(splitCompoundVowel('ㅢ')).toEqual(['ㅡ', 'ㅣ']);
    expect(splitCompoundVowel('ㅏ')).toBeUndefined();
    expect(splitCompoundFinal('ㄺ')).toEqual(['ㄹ', 'ㄱ']);
    expect(splitCompoundFinal('ㅄ')).toEqual(['ㅂ', 'ㅅ']);
    expect(splitCompoundFinal('ㄱ')).toBeUndefined();
    for (const [k, [a, b]] of Object.entries(COMPOUND_FINALS)) { expect(FINALS).toContain(k); expect(FINALS).toContain(a); expect(FINALS).toContain(b); }
    for (const [k, p] of Object.entries(DOUBLE_CONSONANTS)) { expect(LEADS).toContain(k); expect(LEADS).toContain(p); }
  });
});

describe('arithmetic', () => {
  it('round-trips all 11,172 syllables through decompose/compose and the named accessors', () => {
    expect(ALL).toHaveLength(11172);
    for (const s of ALL) {
      expect(isHangulSyllable(s)).toBe(true);
      const d = decompose(s)!;
      expect(compose(d.l, d.v, d.t)).toBe(s);
      expect(leadOf(s)).toBe(LEADS[d.l]);
      expect(vowelOf(s)).toBe(VOWELS[d.v]);
      expect(finalOf(s)).toBe(FINALS[d.t]);
      expect(hasFinal(s)).toBe(d.t > 0);
      expect(withoutFinal(s)).toBe(compose(d.l, d.v, 0));
      expect(withFinal(withoutFinal(s), FINALS[d.t])).toBe(s);
    }
  });
  it('knows the corners', () => {
    expect(compose(0, 0, 0)).toBe('가');
    expect(compose(18, 20, 27)).toBe('힣');
    expect(decompose('한')).toEqual({ l: 18, v: 0, t: 4 });
    expect(decompose('a')).toBeUndefined();
    expect(decompose('ㄱ')).toBeUndefined();
    expect(decompose('')).toBeUndefined();
    expect(isHangulSyllable('가')).toBe(true);
    expect(isHangulSyllable('ㄱ')).toBe(false);
    expect(isHangulSyllable('힣')).toBe(true);
    expect(String.fromCharCode(0xd7a4)).not.toSatisfy(isHangulSyllable);
  });
  it('named accessors on ordinary syllables', () => {
    expect(leadOf('학')).toBe('ㅎ');
    expect(vowelOf('학')).toBe('ㅏ');
    expect(finalOf('학')).toBe('ㄱ');
    expect(finalOf('가')).toBe('');
    expect(leadOf('x')).toBe('');
    expect(hasFinal('가')).toBe(false);
    expect(hasFinal('밖')).toBe(true);
    expect(withFinal('가', 'ㄴ')).toBe('간');
    expect(withFinal('간', '')).toBe('가');
    expect(withFinal('가', 'ㄸ')).toBe('가');
    expect(withoutFinal('읽')).toBe('이');
    expect(lastSyllable('학교')).toBe('교');
    expect(lastSyllable('KBS')).toBeUndefined();
    expect(lastSyllable('')).toBeUndefined();
    expect(lastSyllable('학교'.normalize('NFD'))).toBe('교');
  });
});

describe('toJamo / fromJamo', () => {
  it('round-trips every syllable', () => {
    for (const s of ALL) {
      const j = toJamo(s);
      expect(j.length).toBe(hasFinal(s) ? 3 : 2);
      expect(fromJamo(j)).toBe(s);
    }
  });
  it('round-trips every syllable in context (followed by a vowel-initial and a consonant-initial syllable)', () => {
    for (const s of ALL) {
      for (const tail of ['아', '가']) expect(fromJamo(toJamo(s + tail))).toBe(s + tail);
    }
  });
  it('passes non-Hangul through and splits per jamo', () => {
    expect(toJamo('한a')).toEqual(['ㅎ', 'ㅏ', 'ㄴ', 'a']);
    expect(toJamo('읽')).toEqual(['ㅇ', 'ㅣ', 'ㄺ']);
    expect(toJamo('학교 2')).toEqual(['ㅎ', 'ㅏ', 'ㄱ', 'ㄱ', 'ㅛ', ' ', '2']);
    expect(fromJamo(toJamo('한국어 KBS가 學校'))).toBe('한국어 KBS가 學校');
  });
  it('recomposes greedily: a consonant before a vowel leads the next syllable; two consonants make a compound final', () => {
    expect(fromJamo([...'ㄱㅏㄱㅏ'])).toBe('가가');
    expect(fromJamo([...'ㄱㅏㄹㄱ'])).toBe('갉');
    expect(fromJamo([...'ㄱㅏㄹㄱㅏ'])).toBe('갈가');
    expect(fromJamo([...'ㅇㅣㄹㄱㅓ'])).toBe('일거');
    expect(fromJamo([...'ㅇㅣㄹㄱ'])).toBe('읽');
    expect(fromJamo([...'ㄱㅗㅏ'])).toBe('과');
    expect(fromJamo([...'ㅇㅏㄴ', 'ㅈ', 'ㄷ'])).toBe('앉ㄷ');
    expect(fromJamo([...'ㅇㅏ', 'ㄴ', 'ㅈ'])).toBe('앉');
    expect(fromJamo([...'ㅏㄱ'])).toBe('ㅏㄱ');
    expect(fromJamo([...'ㄱ'])).toBe('ㄱ');
    expect(fromJamo(['ㄸ', 'ㅏ', 'ㄸ'])).toBe('따ㄸ');
    expect(fromJamo([])).toBe('');
  });
});

describe('classification', () => {
  it('isHangul covers syllables and jamo of every block', () => {
    for (const ch of ['한', 'ㄱ', 'ㅏ', 'ᄀ', 'ᅡ', 'ᆨ', 'ꥠ', 'ힰ', 'ﾡ', 'ￂ']) expect(isHangul(ch)).toBe(true);
    for (const ch of ['a', '漢', '1', '。', '', '😀']) expect(isHangul(ch)).toBe(false);
  });
  it('isCompatJamo / isConjoiningJamo are disjoint block tests', () => {
    expect(isCompatJamo('ㄱ')).toBe(true);
    expect(isCompatJamo('ᄀ')).toBe(false);
    expect(isConjoiningJamo('ᄀ')).toBe(true);
    expect(isConjoiningJamo('ᇿ')).toBe(true);
    expect(isConjoiningJamo('ㄱ')).toBe(false);
    expect(isConjoiningJamo('한')).toBe(false);
  });
  it('isHanja covers the unified, extension A and compatibility blocks', () => {
    for (const ch of ['學', '校', '㐀', '䶿', '一', '鿿', '豈', '﫿']) expect(isHanja(ch)).toBe(true);
    for (const ch of ['가', 'a', '1', 'の', '']) expect(isHanja(ch)).toBe(false);
  });
  it('scriptOf', () => {
    expect(scriptOf('한')).toBe('hangul');
    expect(scriptOf('ㅋ')).toBe('hangul');
    expect(scriptOf('學')).toBe('hanja');
    expect(scriptOf('K')).toBe('latin');
    expect(scriptOf('é')).toBe('latin');
    expect(scriptOf('7')).toBe('digit');
    expect(scriptOf('７')).toBe('digit');
    expect(scriptOf('.')).toBe('other');
    expect(scriptOf('😀')).toBe('other');
    expect(scriptOf('я')).toBe('other');
  });
});

describe('koKey', () => {
  it('composes conjoining jamo to syllables (NFD input)', () => {
    for (const w of ['한', '한국어', '읽다', '꽃', '값이', '쉬워']) expect(koKey(w.normalize('NFD'))).toBe(w);
    expect(koKey('한')).toBe('한');
    expect(koKey('가'.normalize('NFD') + 'ᆨ')).toBe('각'); // an LV syllable plus a conjoining final composes
  });
  it('keeps compatibility jamo as they are', () => {
    expect(koKey('ㅋㅋ')).toBe('ㅋㅋ');
    expect(koKey('ㄱㅏ')).toBe('ㄱㅏ');
    expect(koKey('ㅎㅏㄴ')).toBe('ㅎㅏㄴ');
  });
  it('maps halfwidth jamo to compatibility jamo', () => {
    expect(koKey('ﾡ')).toBe('ㄱ');
    expect(koKey('ﾾ')).toBe('ㅎ');
    expect(koKey('ￂ')).toBe('ㅏ');
    expect(koKey('ￜ')).toBe('ㅣ');
    expect(koKey('ﾡￂ')).toBe('ㄱㅏ'); // not composed into a syllable
  });
  it('folds nothing else: case, Hanja, digits, punctuation stay', () => {
    expect(koKey('KBS가 2024年 學校!')).toBe('KBS가 2024年 學校!');
    expect(koKey('Hello')).toBe('Hello');
    expect(koKey('')).toBe('');
  });
  it('is idempotent', () => {
    for (const s of ['한'.normalize('NFD'), 'ㅋㅋ', 'ﾡ', 'KBS가', '😀']) expect(koKey(koKey(s))).toBe(koKey(s));
  });
});

describe('koNormalize and originalSpan', () => {
  it('has the right shape on precomposed text (identity map)', () => {
    const t = '학교에서';
    const { key, map } = koNormalize(t);
    expect(key).toBe(t);
    expect(map).toEqual([0, 1, 2, 3, 4]);
  });
  it('maps an NFD syllable of three code units to one key unit', () => {
    const t = '한'.normalize('NFD');
    expect(t).toHaveLength(3);
    const { key, map } = koNormalize(t);
    expect(key).toBe('한');
    expect(map).toEqual([0, 3]);
    expect(originalSpan(map, 0, 1)).toEqual([0, 3]);
  });
  it('is correct for NFD Hangul mixed with precomposed Hangul, Hanja, Latin, digits and an emoji', () => {
    const nfd = '한국어'.normalize('NFD');
    const t = `a${nfd}가學K1😀끝`;
    const { key, map } = koNormalize(t);
    expect(key).toBe(koKey(t));
    expect(key).toBe('a한국어가學K1😀끝');
    expect(map).toHaveLength(key.length + 1);
    expect(map[key.length]).toBe(t.length);
    // every non-trailing key unit starts at a character boundary of the original, and the map never goes backwards
    for (let i = 1; i < map.length; i++) expect(map[i]).toBeGreaterThanOrEqual(map[i - 1]);
    // per character
    const spans: Array<[string, string]> = [];
    for (let i = 0; i < key.length; i++) {
      const ch = String.fromCodePoint(key.codePointAt(i)!);
      const [s, e] = originalSpan(map, i, i + ch.length);
      spans.push([ch, t.slice(s, e)]);
      if (ch.length === 2) i++;
    }
    expect(spans).toEqual([
      ['a', 'a'], ['한', '한'.normalize('NFD')], ['국', '국'.normalize('NFD')], ['어', '어'.normalize('NFD')],
      ['가', '가'], ['學', '學'], ['K', 'K'], ['1', '1'], ['😀', '😀'], ['끝', '끝'],
    ]);
  });
  it('maps a surrogate pair as one run', () => {
    const t = 'x😀y';
    const { key, map } = koNormalize(t);
    expect(key).toBe(t);
    expect(map).toEqual([0, 1, 1, 3, 4]);
    expect(originalSpan(map, 1, 2)).toEqual([1, 3]); // half of the pair still covers the whole character
    expect(originalSpan(map, 2, 3)).toEqual([1, 3]);
    expect(originalSpan(map, 1, 3)).toEqual([1, 3]);
  });
  it('a key span covers whole original characters', () => {
    const t = '학교'.normalize('NFD') + '에서';
    const { key, map } = koNormalize(t);
    expect(key).toBe('학교에서');
    const [s, e] = originalSpan(map, 1, 3);
    expect(t.slice(s, e)).toBe('교'.normalize('NFD') + '에');
    expect(originalSpan(map, 0, 4)).toEqual([0, t.length]);
    expect(originalSpan(map, 4, 4)).toEqual([t.length, t.length]);
    expect(originalSpan(map, 2, 2)).toEqual([map[2], map[2]]);
  });
  it('keeps compatibility jamo and halfwidth jamo as single units', () => {
    const t = 'ㅋㅋﾡ';
    const { key, map } = koNormalize(t);
    expect(key).toBe('ㅋㅋㄱ');
    expect(map).toEqual([0, 1, 2, 3]);
  });
  it('composes a conjoining final onto a precomposed syllable and keeps the run whole', () => {
    const t = '각나';
    const { key, map } = koNormalize(t);
    expect(key).toBe('각나');
    expect(map).toEqual([0, 2, 3]);
  });
  it('keeps a base letter and its combining mark in one run', () => {
    const t = 'e\u0301x';
    const { key, map } = koNormalize(t);
    expect(key).toBe('éx');
    expect(map).toEqual([0, 2, 3]);
  });
  it('handles empty text', () => {
    expect(koNormalize('')).toEqual({ key: '', map: [0] });
  });
  it('key always equals koKey for assorted text', () => {
    for (const t of ['', 'a', '한국어', '한국어'.normalize('NFD'), 'ㅋㅋ ㅎㅎ', 'ﾡￂ', 'KBS가 2024년에는 😀 學校에서', '각'.normalize('NFD') + 'ㅏ']) {
      const r = koNormalize(t);
      expect(r.key).toBe(koKey(t));
      expect(r.map).toHaveLength(r.key.length + 1);
      expect(r.map[r.key.length]).toBe(t.length);
    }
  });
});

describe('koShardLetters', () => {
  it('gives lead, vowel and final of the first syllable', () => {
    expect(koShardLetters('학교')).toBe('ㅎㅏㄱ');
    expect(koShardLetters('가다')).toBe('ㄱㅏ');
    expect(koShardLetters('읽다')).toBe('ㅇㅣㄺ');
    expect(koShardLetters('꽃')).toBe('ㄲㅗㅊ');
  });
  it("is '' for Hanja and anything else", () => {
    expect(koShardLetters('學校')).toBe('');
    expect(koShardLetters('KBS')).toBe('');
    expect(koShardLetters('ㅋㅋ')).toBe('');
    expect(koShardLetters('1')).toBe('');
    expect(koShardLetters('')).toBe('');
  });
});

describe('romanizeRespelling', () => {
  it('maps jamo to Revised Romanization', () => {
    expect(romanizeRespelling('가')).toBe('ga');
    expect(romanizeRespelling('실라')).toBe('silla');
    expect(romanizeRespelling('한구거')).toBe('hangugeo');
    expect(romanizeRespelling('의')).toBe('ui');
    expect(romanizeRespelling('옫')).toBe('ot');
    expect(romanizeRespelling('아 a')).toBe('a a');
  });
});

describe('syllablesOf', () => {
  it('names lead, vowel and final of each syllable with RR sounds and original offsets', () => {
    const out = syllablesOf('학교');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ text: '학', start: 0, end: 1, initial: 'ㅎ', vowel: 'ㅏ', vowelSound: 'a', final: 'ㄱ', finalSound: 'k', romanization: 'hak', source: 'rule', confidence: 1 });
    expect(out[1]).toMatchObject({ text: '교', start: 1, end: 2, initial: 'ㄱ', vowel: 'ㅛ', vowelSound: 'yo', romanization: 'gyo' });
    expect(out[1].final).toBeUndefined();
  });
  it('says what a written final is said as', () => {
    const [s] = syllablesOf('꽃');
    expect(s).toMatchObject({ initial: 'ㄲ', vowel: 'ㅗ', final: 'ㅊ', finalSound: 't', romanization: 'kkot' });
    expect(s.rule).toContain('ㄷ');
    expect(syllablesOf('앙')[0]).toMatchObject({ initial: 'ㅇ', finalSound: 'ng', romanization: 'ang' });
    expect(syllablesOf('알')[0].finalSound).toBe('l');
  });
  it('skips non-Hangul and keeps original offsets, including NFD input', () => {
    const t = 'a' + '한'.normalize('NFD') + '1글';
    const out = syllablesOf(t);
    expect(out.map((s) => s.text)).toEqual(['한'.normalize('NFD'), '글']);
    expect(out[0]).toMatchObject({ start: 1, end: 4, initial: 'ㅎ', final: 'ㄴ' });
    expect(out[1]).toMatchObject({ start: 5, end: 6 });
    for (const s of out) expect(t.slice(s.start, s.end)).toBe(s.text);
  });
  it('is empty for text with no syllable', () => {
    expect(syllablesOf('KBS')).toEqual([]);
    expect(syllablesOf('')).toEqual([]);
    expect(syllablesOf('ㅋㅋ')).toEqual([]);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { koKey, koNormalize, originalSpan } from '../../../src/adapters/korean/hangul';
import { koNormalizeSurface, koSearchNormalize, koSegmentSentences, koTokenize } from '../../../src/adapters/korean/text';

const surfaces = (t: string) => koTokenize(t).map((x) => x.surface);
const checkOffsets = (t: string) => { for (const x of koTokenize(t)) expect(t.slice(x.start, x.end)).toBe(x.surface); };

describe('koTokenize', () => {
  it('splits a number from the word it precedes', () => {
    expect(surfaces('2024년에는')).toEqual(['2024', '년에는']);
  });
  it('splits Latin letters from a particle', () => {
    expect(surfaces('KBS가')).toEqual(['KBS', '가']);
  });
  it('keeps Hanja and Hangul in one token', () => {
    expect(surfaces('學校에서')).toEqual(['學校에서']);
    expect(surfaces('學校에서 공부했다')).toEqual(['學校에서', '공부했다']);
  });
  it('whitespace is never a token; each punctuation mark is its own non-word token', () => {
    const t = koTokenize('안녕, 세상! 어때?');
    expect(t.map((x) => x.surface)).toEqual(['안녕', ',', '세상', '!', '어때', '?']);
    expect(t.map((x) => x.isWord)).toEqual([true, false, true, false, true, false]);
    expect(koTokenize('  \n\t ')).toEqual([]);
    expect(koTokenize('')).toEqual([]);
  });
  it('splits punctuation runs mark by mark and treats quotes and brackets as punctuation', () => {
    expect(surfaces('"좋아..." (네)')).toEqual(['"', '좋아', '.', '.', '.', '"', '(', '네', ')']);
    expect(surfaces('끝…')).toEqual(['끝', '…']);
  });
  it('digits are their own token; an inner decimal point or comma stays', () => {
    expect(surfaces('3.14는 1,000과')).toEqual(['3.14', '는', '1,000', '과']);
    const d = koTokenize('2024년')[0];
    expect(d.isWord).toBe(false);
    expect(d.normalized).toBe('2024');
    expect(surfaces('끝.5')).toEqual(['끝', '.', '5']);
  });
  it('Latin letters keep an inner apostrophe or hyphen', () => {
    expect(surfaces("don't e-mail를")).toEqual(["don't", 'e-mail', '를']);
    expect(surfaces('K-pop이')).toEqual(['K-pop', '이']);
    expect(koTokenize('KBS')[0].isWord).toBe(true);
    expect(surfaces('a- b')).toEqual(['a', '-', 'b']);
  });
  it('a word in NFD stays one token whose surface is the original NFD substring', () => {
    const w = '한국어'.normalize('NFD');
    const t = `이것은 ${w}입니다.`;
    const toks = koTokenize(t);
    const k = toks.find((x) => x.surface.startsWith(w.slice(0, 3)))!;
    expect(k.surface).toBe(`${w}입니다`);
    expect(k.normalized).toBe('한국어입니다');
    expect(t.slice(k.start, k.end)).toBe(k.surface);
    expect(koTokenize(w)).toHaveLength(1);
  });
  it('compatibility jamo are word characters of the run', () => {
    expect(surfaces('ㅋㅋㅋ 좋아ㅎㅎ')).toEqual(['ㅋㅋㅋ', '좋아ㅎㅎ']);
    expect(koTokenize('ㅋㅋㅋ')[0].normalized).toBe('ㅋㅋㅋ');
  });
  it('normalized is the key of the surface', () => {
    for (const x of koTokenize('Hello ﾡ 한국어 😀')) expect(x.normalized).toBe(koNormalizeSurface(x.surface));
    expect(koTokenize('ﾡ')[0].normalized).toBe('ㄱ');
  });
  it('an emoji is one non-word token', () => {
    const t = koTokenize('좋아😀');
    expect(t.map((x) => x.surface)).toEqual(['좋아', '😀']);
    expect(t[1].isWord).toBe(false);
  });
  it('other scripts form word tokens of their own', () => {
    expect(surfaces('Привет 안녕')).toEqual(['Привет', '안녕']);
  });
  it('offsets slice the original text exactly, for mixed text', () => {
    for (const t of [
      '2024년에는 KBS가 學校에서 😀 "왜?" 그가 물었다… 3.14!',
      '한국어'.normalize('NFD') + ' 한국어 é x',
      '  앞뒤 공백  ',
      "It's a K-pop 노래입니다.",
      '一二三 가나다',
    ]) checkOffsets(t);
  });
});

describe('koSegmentSentences', () => {
  const texts = (t: string) => koSegmentSentences(t).map((s) => s.text);
  it('splits at . ! ? and closes with following quotes and brackets', () => {
    expect(texts('안녕하세요. 저는 학생입니다! 반갑습니다?')).toEqual(['안녕하세요.', '저는 학생입니다!', '반갑습니다?']);
    expect(texts('"왜?" 그가 물었다.')).toEqual(['"왜?"', '그가 물었다.']);
    expect(texts('(끝.) 다음')).toEqual(['(끝.)', '다음']);
  });
  it('treats runs of terminators as one', () => {
    expect(texts('정말?! 네... 그래요… 좋아요.')).toEqual(['정말?!', '네...', '그래요…', '좋아요.']);
  });
  it('splits at the full-width and CJK terminators without a following space', () => {
    expect(texts('你好。再见！谢谢？')).toEqual(['你好。', '再见！', '谢谢？']);
    expect(texts('오늘은 맑음。내일은 비．')).toEqual(['오늘은 맑음。', '내일은 비．']);
  });
  it('does not split inside a number, a Latin abbreviation token or a date', () => {
    expect(texts('값은 3.14입니다. 네.')).toEqual(['값은 3.14입니다.', '네.']);
    expect(texts('U.S.A에 갔다. 끝.')).toEqual(['U.S.A에 갔다.', '끝.']);
    expect(texts('Dr. Kim이 왔다. 끝.')).toEqual(['Dr. Kim이 왔다.', '끝.']);
    expect(texts('2024. 5. 3 오후에 만났다. 끝.')).toEqual(['2024. 5. 3 오후에 만났다.', '끝.']);
    expect(texts('www.example.com에서 봤다.')).toEqual(['www.example.com에서 봤다.']);
  });
  it('a line break always ends a sentence', () => {
    expect(texts('첫째 줄\n둘째 줄\r\n\r\n셋째 줄.')).toEqual(['첫째 줄', '둘째 줄', '셋째 줄.']);
  });
  it('spans are trimmed slices of the text', () => {
    const t = '  안녕하세요.   저는 학생입니다.  ';
    const spans = koSegmentSentences(t);
    expect(spans).toHaveLength(2);
    for (const s of spans) expect(t.slice(s.start, s.end)).toBe(s.text);
    expect(spans[0].text).toBe('안녕하세요.');
    expect(koSegmentSentences('')).toEqual([]);
    expect(koSegmentSentences('   ')).toEqual([]);
  });
  it('text with no terminator is one sentence; NFD text keeps its offsets', () => {
    expect(texts('끝나지 않는 문장')).toEqual(['끝나지 않는 문장']);
    const t = '한국어'.normalize('NFD') + '. 끝.';
    const spans = koSegmentSentences(t);
    expect(spans).toHaveLength(2);
    expect(spans[0].text).toBe('한국어'.normalize('NFD') + '.');
    expect(t.slice(spans[1].start, spans[1].end)).toBe('끝.');
  });
});

describe('koSearchNormalize', () => {
  it('composes NFD, maps halfwidth jamo, keeps compatibility jamo, collapses and trims whitespace', () => {
    expect(koSearchNormalize(`  ${'한국어'.normalize('NFD')}   공부 `)).toBe('한국어 공부');
    expect(koSearchNormalize('ﾡ')).toBe('ㄱ');
    expect(koSearchNormalize('ㅋㅋ')).toBe('ㅋㅋ');
    expect(koSearchNormalize('')).toBe('');
  });
});

describe('fix batch 1: invisible characters', () => {
  const INV = ['­', '​', '‌', '‍', '⁠', '﻿'];
  it('stay inside a word between two Hangul or Hanja letters', () => {
    for (const c of INV) {
      const t = `한${c}국어`;
      const toks = koTokenize(t);
      expect(toks).toHaveLength(1);
      expect(toks[0].surface).toBe(t);
      expect(toks[0].normalized).toBe('한국어');
      expect(t.slice(toks[0].start, toks[0].end)).toBe(t);
      expect(koKey(t)).toBe('한국어');
      const h = `學${c}校에서`;
      expect(koTokenize(h)).toHaveLength(1);
      expect(koTokenize(`한${c}${c}국`)[0].surface).toBe(`한${c}${c}국`);
    }
  });
  it('at a token edge are skipped like whitespace', () => {
    for (const c of INV) {
      const toks = koTokenize(`${c}한국${c} 어${c}`);
      expect(toks.map((x) => x.surface)).toEqual(['한국', '어']);
      expect(koTokenize(`한국${c}.`).map((x) => x.surface)).toEqual(['한국', '.']);
      expect(koTokenize(`KBS${c}가`).map((x) => x.surface)).toEqual(['KBS', '가']);
      expect(koTokenize(c)).toEqual([]);
    }
  });
  it('koNormalize maps offsets across them', () => {
    for (const c of INV) {
      const t = `가${c}나다`;
      const { key, map } = koNormalize(t);
      expect(key).toBe('가나다');
      expect(map).toEqual([0, 2, 3, 4]);
      expect(originalSpan(map, 0, 3)).toEqual([0, 4]);
      expect(originalSpan(map, 1, 2)).toEqual([2, 3]);
      expect(koNormalize(`${c}가`)).toEqual({ key: '가', map: [1, 2] });
    }
  });
});

describe('fix batch 2: line breaks, quotations and dates', () => {
  const texts = (t: string) => koSegmentSentences(t).map((s) => s.text);
  it('a line break ends a sentence, exactly as the shared splitter (every adapter) does', () => {
    expect(texts('웹에서 가져온 문장이 여기서\n끝납니다. 다음 문장.')).toEqual(['웹에서 가져온 문장이 여기서', '끝납니다.', '다음 문장.']);
  });
  it('a closed quotation continued by a quotative is one sentence', () => {
    expect(texts('"왜?"라고 물었다. 끝.')).toEqual(['"왜?"라고 물었다.', '끝.']);
    expect(texts('"왜?" 라고 물었다. 끝.')).toEqual(['"왜?" 라고 물었다.', '끝.']);
    expect(texts('"가자!"하고 말했다. 끝.')).toEqual(['"가자!"하고 말했다.', '끝.']);
    expect(texts('"가자!"고 말했다.')).toEqual(['"가자!"고 말했다.']);
    expect(texts('"왜?" 고양이가 물었다.')).toEqual(['"왜?"', '고양이가 물었다.']);
    expect(texts('그가 "왜?" 라고 물었다. 나는 모른다.')).toEqual(['그가 "왜?" 라고 물었다.', '나는 모른다.']);
  });
  it('a date is not cut before a Hangul word that continues it', () => {
    expect(texts('2024. 5. 3. 오후에 만났다. 끝.')).toEqual(['2024. 5. 3. 오후에 만났다.', '끝.']);
    expect(texts('2024. 5. 3. 오전 9시.')).toEqual(['2024. 5. 3. 오전 9시.']);
    expect(texts('2024. 5. 3. 일 때문에 왔다.')).toEqual(['2024. 5. 3. 일 때문에 왔다.']);
    expect(texts('정답은 3. 일본에 갔다.')).toEqual(['정답은 3.', '일본에 갔다.']);
  });
});

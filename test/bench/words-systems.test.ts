import { describe, expect, it } from 'vitest';
import { adapterSystem, dictMMSystem, externalSystem, icuSystem, makeDictMM } from '../../src/bench/words/systems';
import { wordsOf } from '../../src/bench/shared';

const mm = (words: string[]) => makeDictMM(new Set(words));

describe('dict-mm (our own baseline: maximal matching over a headword list)', () => {
  it('cuts between known words', () => {
    const text = 'สวัสดีครับ';
    expect(mm(['สวัสดี', 'ครับ'])(text)).toEqual(['สวัสดี'.length]);
  });

  it('prefers the segmentation with fewer tokens, so a listed compound stays whole', () => {
    expect(mm(['ตา', 'กลม', 'ตากลม'])('ตากลม')).toEqual([]);
    expect(mm(['ตา', 'กลม'])('ตากลม')).toEqual([2]);
  });

  it('prefers fewer unknown characters over fewer tokens', () => {
    // ตาก + ลม leaves nothing unknown; ตา + กลม as well, but ตากล + ม would leave ม unknown
    const words = ['ตาก', 'ลม', 'ตา', 'กลม'];
    const cuts = mm(words)('ตากลม');
    expect(wordsOf('ตากลม', cuts).join('')).toBe('ตากลม');
    expect(cuts).toHaveLength(1);
  });

  it('merges adjacent unknown Thai letters into one token and keeps a Latin run whole', () => {
    expect(mm(['ตา'])('ตากขค')).toEqual([2]);
    expect(mm(['ตา'])('ตาabc')).toEqual([2]);
  });

  it('never cuts inside a character cluster, even when the head letter is a listed word', () => {
    expect(mm(['ก'])('กี')).toEqual([]);
    expect(mm(['ก', 'กี'])('กี')).toEqual([]);
    expect(mm(['เก', 'ก'])('เกก').every((b) => b !== 1)).toBe(true);
  });

  it('treats whitespace as a chunk separator, not a word', () => {
    expect(mm(['ตา'])('ตา ตา')).toEqual([3]);
    expect(mm(['ตา'])('ตาตา ตา')).toEqual([2, 5]);
  });

  it('is deterministic and labelled as ours, not as an established tokenizer', () => {
    const sys = dictMMSystem(new Set(['ตา']));
    expect(sys.kind).toBe('ours');
    expect(sys.label).toMatch(/OUR OWN/);
    expect(sys.segment('ตาตา')).toEqual(sys.segment('ตาตา'));
  });
});

describe('adapter and icu', () => {
  const text = 'ฉันรักพระเจ้า';
  it('return sorted, canonical boundaries inside the text', () => {
    for (const sys of [adapterSystem, icuSystem]) {
      const b = sys.segment(text);
      expect([...b].sort((x, y) => x - y)).toEqual(b);
      expect(b.every((x) => x > 0 && x < text.length)).toBe(true);
      expect(wordsOf(text, b).join('')).toBe(text);
    }
  });

  it('the adapter re-joins a course compound that ICU alone may split', () => {
    // 'ตอนนี้' is in THAI_COMPOUNDS: the adapter must never cut inside it
    const t = 'ตอนนี้';
    expect(adapterSystem.segment(t)).toEqual([]);
  });

  it('whitespace is never a word', () => {
    const b = adapterSystem.segment('ฉัน รัก');
    expect(wordsOf('ฉัน รัก', b)).toEqual(['ฉัน', 'รัก']);
    expect(icuSystem.segment('ฉัน รัก')).toEqual(b);
  });
});

describe('external:<name> (a file in the editing format)', () => {
  const file = '## tool output\n\n# s1\nสวัสดี|ครับ\n\n# s2\nตา| |ตา\n';
  const sys = externalSystem('newmm', file);

  it('is read by id, then by text, and canonicalised (a cut on the space equals a cut after it)', () => {
    expect(sys.name).toBe('external:newmm');
    expect(sys.segment('สวัสดีครับ', 's1')).toEqual(['สวัสดี'.length]);
    expect(sys.segment('ตา ตา', 's2')).toEqual([3]);
    expect(sys.segment('สวัสดีครับ')).toEqual(['สวัสดี'.length]);
  });

  it('throws on a sentence it does not have and on changed text, never scoring a gap as "no boundaries"', () => {
    expect(() => sys.segment('ไม่มี', 'zzz')).toThrow(/no segmentation/);
    expect(() => sys.segment('สวัสดีคะ', 's1')).toThrow(/differs/);
  });

  it('refuses a malformed file', () => {
    expect(() => externalSystem('bad', '# s1\n')).toThrow(/no sentence line/);
  });
});

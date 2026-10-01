import { describe, expect, it } from 'vitest';
import {
  fromEditing, parseGoldJsonl, sentenceToEntry, toEditing, toEditingLine, toJsonl, validateGold,
} from '../../src/bench/gold/format';
import type { GoldSentence } from '../../src/bench/gold/types';

/** Build a sentence from words; `seps` are the whitespace strings put between words (default none). */
function sentence(words: string[], seps: string[] = [], extra: Partial<GoldSentence> = {}): GoldSentence {
  let text = '';
  const boundaries: number[] = [];
  words.forEach((w, k) => {
    if (k > 0) { text += seps[k - 1] ?? ''; boundaries.push(text.length); }
    text += w;
  });
  return {
    id: 'g1', lang: 'th', stratum: 'stage0', text, boundaries,
    source: { title: 'test', licence: 'test', rights: 'rights-safe' }, tokenizedBy: 'hand', ...extra,
  };
}

const codes = (s: unknown) => validateGold(s).map((i) => i.code);

describe('editing format', () => {
  it('writes "|" at every boundary and reads it back', () => {
    const s = sentence(['สวัสดี', 'ครับ', 'ผม']);
    const line = toEditingLine(s.text, s.boundaries);
    expect(line).toBe('สวัสดี|ครับ|ผม');
    const back = fromEditing(toEditing([sentenceToEntry(s)]));
    expect(back.problems).toEqual([]);
    expect(back.entries).toEqual([{ id: 'g1', heldOut: false, text: s.text, boundaries: s.boundaries }]);
  });

  it('round-trips sentences with spaces, held-out flags and comments', () => {
    const a = sentence(['เอ็ม', 'บุษราคัม', 'ตอบ'], [' ', ' '], { id: 'a' });
    const b = sentence(['ตา', 'ตา'], [], { id: 'b', heldOut: true });
    const text = toEditing([sentenceToEntry(a), sentenceToEntry(b)], ['a comment with a | pipe']);
    expect(text).toContain('# b [held-out]');
    const back = fromEditing(text);
    expect(back.problems).toEqual([]);
    expect(back.entries.map((e) => [e.id, e.heldOut, e.text, e.boundaries])).toEqual([
      ['a', false, a.text, a.boundaries], ['b', true, b.text, b.boundaries],
    ]);
  });

  it('a "|" before or after a space means the same', () => {
    const x = fromEditing('# s\nตา |ตา\n').entries[0];
    const y = fromEditing('# s\nตา| ตา\n').entries[0];
    expect(x.text).toBe('ตา ตา');
    expect(x.boundaries).toEqual([3]);
    expect(y.boundaries).toEqual([3]);
  });

  it('reports malformed files instead of guessing', () => {
    expect(fromEditing('ตา|ตา\n').problems[0]).toMatch(/without a "# <id>" header/);
    expect(fromEditing('# s\n').problems[0]).toMatch(/no sentence line/);
    expect(fromEditing('# s\nตา||ตา\n').problems[0]).toMatch(/empty word/);
    expect(fromEditing('# s\n|ตาตา\n').problems[0]).toMatch(/empty word/);
    expect(fromEditing('# s\nตาตา|\n').problems[0]).toMatch(/empty word/);
    expect(fromEditing('# s\nตา|ตา\n\n# s\nตา\n').problems.join()).toMatch(/duplicate id/);
    expect(fromEditing('#\nตา\n').problems[0]).toMatch(/malformed header/);
  });

  it('accepts CRLF and a leading BOM', () => {
    const r = fromEditing('﻿## c\r\n\r\n# s\r\nตา|ตา\r\n');
    expect(r.problems).toEqual([]);
    expect(r.entries[0].boundaries).toEqual([2]);
  });
});

describe('validator', () => {
  it('accepts a good sentence, with spaces too', () => {
    expect(validateGold(sentence(['สวัสดี', 'ครับ']))).toEqual([]);
    expect(validateGold(sentence(['ตา', 'ตา', 'ตา'], [' ', ''], { checkedBy: 'A. Reader', checkedAt: '2026-10-01' }))).toEqual([]);
  });

  it('refuses boundaries outside the text, unsorted or repeated', () => {
    const s = sentence(['ตา', 'ตา']);
    expect(codes({ ...s, boundaries: [0] })).toContain('boundaries-not-increasing');
    expect(codes({ ...s, boundaries: [s.text.length] })).toContain('bad-boundary');
    expect(codes({ ...s, boundaries: [99] })).toContain('bad-boundary');
    const t = sentence(['ตา', 'ตา', 'ตา']);
    expect(codes({ ...t, boundaries: [4, 2] })).toContain('boundaries-not-increasing');
    expect(codes({ ...t, boundaries: [2, 2] })).toContain('boundaries-not-increasing');
    expect(codes({ ...s, boundaries: [1.5] })).toContain('bad-boundaries');
  });

  it('refuses a boundary inside a character cluster or before a vowel sign, tone mark or ำ', () => {
    const s = sentence(['เกี่ยว', 'กับ']);
    expect(codes({ ...s, boundaries: [2] })).toContain('bad-boundary'); // between ก and ี
    expect(codes({ ...s, boundaries: [3] })).toContain('bad-boundary'); // before the tone mark
    expect(codes({ ...s, boundaries: [1] })).toContain('bad-boundary'); // right after the leading vowel เ
    expect(codes({ ...s, boundaries: [6] })).toEqual([]);
    const am = sentence(['ทำ', 'ตา']);
    expect(codes({ ...am, boundaries: [1] })).toContain('bad-boundary'); // before ำ
    const pair = sentence(['a𝒳b', 'c']);
    expect(codes({ ...pair, boundaries: [2] })).toContain('bad-boundary'); // inside a surrogate pair
  });

  it('refuses a boundary on whitespace, and text with edge whitespace, "|" or a line break', () => {
    const s = sentence(['ตา', 'ตา'], [' ']);
    expect(codes({ ...s, boundaries: [2] })).toContain('bad-boundary'); // on the space
    expect(codes(sentence(['ตา', 'ตา'], [], { text: ' ตาตา', boundaries: [3] }))).toContain('edge-whitespace');
    expect(codes(sentence(['ตา', 'ตา'], [], { text: 'ตา|ตา', boundaries: [3] }))).toContain('forbidden-character');
    expect(codes(sentence(['ตา', 'ตา'], [], { text: 'ตา\nตา', boundaries: [3] }))).toContain('forbidden-character');
  });

  it('refuses text that is not NFC', () => {
    const s = sentence(['ก', 'ข'], [], { text: 'éx', boundaries: [] });
    expect(codes(s)).toContain('not-nfc');
  });

  it('refuses missing provenance, a bad stratum or rights, and half a check', () => {
    const s = sentence(['ตา', 'ตา']);
    expect(codes({ ...s, tokenizedBy: '' })).toContain('missing-tokenizedBy');
    expect(codes({ ...s, stratum: 'nope' })).toContain('bad-stratum');
    expect(codes({ ...s, source: { title: 'x', licence: 'y', rights: 'whatever' } })).toContain('bad-source');
    expect(codes({ ...s, lang: 'es' })).toContain('bad-lang');
    expect(codes({ ...s, checkedBy: 'A' })).toContain('checked-incomplete');
    expect(codes({ ...s, heldOut: 'yes' })).toContain('bad-heldOut');
    expect(codes('x')).toEqual(['not-an-object']);
  });

  it('JSON Lines: round-trips valid rows and reports invalid or duplicate ones by line', () => {
    const a = sentence(['ตา', 'ตา'], [], { id: 'a' });
    const b = sentence(['ตา', 'ตา'], [], { id: 'b', checkedBy: 'N', checkedAt: '2026-10-01', heldOut: true });
    const ok = parseGoldJsonl(toJsonl([a, b]));
    expect(ok.problems).toEqual([]);
    expect(ok.sentences).toEqual([a, b]);
    const bad = parseGoldJsonl(`${JSON.stringify(a)}\nnot json\n${JSON.stringify({ ...a, id: 'c', boundaries: [1] })}\n${JSON.stringify(a)}\n`, 'f');
    expect(bad.sentences.map((s) => s.id)).toEqual(['a']);
    expect(bad.problems).toHaveLength(3);
    expect(bad.problems[0]).toMatch(/f line 2: not JSON/);
    expect(bad.problems[1]).toMatch(/f line 3/);
    expect(bad.problems[2]).toMatch(/duplicate id a/);
  });
});

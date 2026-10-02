/**
 * Tests of the CoNLL-U reader. test/bench/fixtures/sq-sample.conllu is HAND-MADE for these tests (twelve short
 * Standard Albanian sentences written by the package author, with multiword tokens, an empty node and SpaceAfter=No).
 * It is NOT an extract of any treebank: no Universal Dependencies sentence is in this repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConllu } from '../../src/bench/sq/conllu';

const sample = fs.readFileSync(path.resolve('test/bench/fixtures/sq-sample.conllu'), 'utf8');
const sentences = parseConllu(sample);
const byId = (id: string) => sentences.find((s) => s.id === id)!;

const row = (...c: string[]) => c.join('\t');

describe('parseConllu on the hand-made sample', () => {
  it('reads twelve sentences with their ids and texts', () => {
    expect(sentences).toHaveLength(12);
    expect(byId('sample-1').text).toBe('Unë kam një libër.');
    expect(sentences.every((s) => s.textFrom === 'comment')).toBe(true);
  });

  it('reads a word line: lemma, UPOS, features, head, relation', () => {
    const w = byId('sample-1').words[1];
    expect(w).toMatchObject({ id: 2, form: 'kam', lemma: 'kam', upos: 'VERB', head: 0, deprel: 'root' });
    expect(w.feats).toEqual({ Mood: 'Ind', Number: 'Sing', Person: '1', Tense: 'Pres', VerbForm: 'Fin', Voice: 'Act' });
    expect(w.xpos).toBeUndefined(); // _ = absent
  });

  it('reads multiword tokens once, with their component words', () => {
    const s = byId('sample-3'); // Ai ta dha.
    expect(s.words.map((w) => w.form)).toEqual(['Ai', 'të', 'e', 'dha', '.']);
    expect(s.tokens.map((t) => t.form)).toEqual(['Ai', 'ta', 'dha', '.']);
    const ta = s.tokens[1];
    expect(ta.multiword).toBe(true);
    expect(ta.words.map((w) => w.form)).toEqual(['të', 'e']);
    expect(s.tokens[0].multiword).toBe(false);
    expect(s.tokens[0].words).toHaveLength(1);
  });

  it('finds at least four multiword tokens of the kinds the adapter must handle', () => {
    const mwt = sentences.flatMap((s) => s.tokens).filter((t) => t.multiword).map((t) => t.form);
    expect(mwt).toEqual(expect.arrayContaining(['ta', "t'i", "S'ka", 'Ma', 'ma']));
    expect(mwt.length).toBeGreaterThanOrEqual(4);
    expect(byId('sample-7').tokens[1].words.map((w) => w.form)).toEqual(['të', 'i']);
  });

  it('gives each surface token its offsets in the text', () => {
    for (const s of sentences) {
      for (const t of s.tokens) expect(s.text.slice(t.start, t.end)).toBe(t.form);
    }
    const s = byId('sample-7');
    expect(s.tokens.map((t) => [t.start, t.end])).toEqual([[0, 3], [4, 7], [8, 15], [15, 16]]);
  });

  it('skips empty nodes (they are not words)', () => {
    const s = byId('sample-12');
    expect(s.words.map((w) => w.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.words.find((w) => w.form === 'kam' && w.id === 5)).toBeUndefined();
    expect(s.tokens.map((t) => t.form)).toEqual(['Unë', 'kam', 'librin', 'dhe', 'ti', 'çantën', '.']);
  });

  it('honours SpaceAfter=No when rebuilding the surface text', () => {
    const s = byId('sample-11');
    expect(s.rebuilt).toBe('"Mirëdita," tha ai.');
    expect(s.rebuilt).toBe(s.text);
    expect(s.words[0].spaceAfter).toBe(false);
    expect(s.words[3].spaceAfter).toBe(true);
    for (const x of sentences) expect(x.rebuilt).toBe(x.text);
  });
});

describe('parseConllu on small inputs', () => {
  it('numbers sentences without a sent_id and takes the text from the tokens when there is no # text', () => {
    const text = [
      row('1', 'Po', 'po', 'INTJ', '_', '_', '0', 'root', '_', 'SpaceAfter=No'),
      row('2', '.', '.', 'PUNCT', '_', '_', '1', 'punct', '_', '_'),
      '',
      row('1', 'Jo', 'jo', 'INTJ', '_', '_', '0', 'root', '_', '_'),
    ].join('\n');
    const s = parseConllu(text);
    expect(s.map((x) => x.id)).toEqual(['s1', 's2']);
    expect(s[0]).toMatchObject({ text: 'Po.', textFrom: 'rebuilt' });
    expect(s[0].tokens.map((t) => [t.start, t.end])).toEqual([[0, 2], [2, 3]]);
  });

  it('falls back to the rebuilt text when the forms cannot be walked through # text', () => {
    const text = ['# text = something else entirely', row('1', 'Po', 'po', 'INTJ', '_', '_', '0', 'root', '_', '_')].join('\n');
    const [s] = parseConllu(text);
    expect(s.textFrom).toBe('rebuilt');
    expect(s.text).toBe('Po');
    expect(s.comments.text).toBe('something else entirely');
  });

  it('accepts CRLF line ends, a byte-order mark and comment-only blocks, and NFC-normalizes', () => {
    const decomposed = 'ë'; // ë as e + combining diaeresis
    const text = `﻿# newdoc id = x\r\n\r\n# sent_id = a\r\n${row('1', `${decomposed}`, `${decomposed}`, 'X', '_', '_', '0', 'root', '_', '_')}\r\n`;
    const s = parseConllu(text);
    expect(s).toHaveLength(1);
    expect(s[0].words[0].form).toBe('ë');
  });

  it('returns nothing for an empty file', () => {
    expect(parseConllu('')).toEqual([]);
    expect(parseConllu('\n\n')).toEqual([]);
  });

  it('names the line of a malformed row', () => {
    const bad = ['# sent_id = x', row('1', 'Po', 'po', 'INTJ', '_', '_', '0', 'root', '_')].join('\n'); // nine columns
    expect(() => parseConllu(bad)).toThrow(/line 2: expected 10 tab-separated columns, found 9/);

    const badFeats = ['', row('1', 'Po', 'po', 'INTJ', '_', 'Case', '0', 'root', '_', '_')].join('\n');
    expect(() => parseConllu(badFeats)).toThrow(/line 2: FEATS entry "Case"/);

    const badHead = [row('1', 'Po', 'po', 'INTJ', '_', '_', 'x', 'root', '_', '_')].join('\n');
    expect(() => parseConllu(badHead)).toThrow(/line 1: HEAD "x"/);

    const badId = [row('one', 'Po', 'po', 'INTJ', '_', '_', '0', 'root', '_', '_')].join('\n');
    expect(() => parseConllu(badId)).toThrow(/line 1: ID "one"/);
  });

  it('refuses ids that do not run 1, 2, 3 and ranges that make no sense', () => {
    const gap = [row('1', 'a', 'a', 'X', '_', '_', '0', 'root', '_', '_'), row('3', 'b', 'b', 'X', '_', '_', '1', 'dep', '_', '_')].join('\n');
    expect(() => parseConllu(gap)).toThrow(/line 2: word id 3 where 2 was expected/);

    const past = [row('1-2', 'ab', '_', '_', '_', '_', '_', '_', '_', '_'), row('1', 'a', 'a', 'X', '_', '_', '0', 'root', '_', '_')].join('\n');
    expect(() => parseConllu(past)).toThrow(/line 1: multiword range 1-2 runs past the last word/);

    const same = [row('1-1', 'a', '_', '_', '_', '_', '_', '_', '_', '_'), row('1', 'a', 'a', 'X', '_', '_', '0', 'root', '_', '_')].join('\n');
    expect(() => parseConllu(same)).toThrow(/at least two words/);
  });
});

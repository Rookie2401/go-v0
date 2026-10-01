import { describe, expect, it } from 'vitest';
import { alignExample, makeHeadwordIndex, normRoman, romanWords } from '../../src/bench/gold/align';
import { buildWiktionaryGold } from '../../src/bench/gold/wiktionary';
import { validateGold } from '../../src/bench/gold/format';

/** headword → the romanizations the dictionary lists (any spelling; they are normalized here). */
const index = (rows: Record<string, string[]>) =>
  makeHeadwordIndex(new Map(Object.entries(rows).map(([w, rs]) => [w, new Set(rs.map(normRoman))])));

const IDX = index({
  'ภาษา': ['paa-sǎa'],
  'ไทย': ['tai'],
  'ภาษาไทย': ['paa-sǎa-tai'],
  'เรา': ['rao'],
  'รัก': ['rák'],
  'เธอ': ['təə'],
  'ที่นี่': ['tîi-nîi'],
  'ที่': ['tîi'],
  'นี่': ['nîi'],
});

describe('normRoman / romanWords', () => {
  it('ignores hyphens, case and spaces; keeps tone marks', () => {
    expect(normRoman('Paa-sǎa')).toBe('paasǎa');
    expect(normRoman('paa-sǎa')).not.toBe(normRoman('paa-saa'));
  });

  it('splits on spaces and drops the phrase-break dot and bare punctuation', () => {
    expect(romanWords('rao rák · təə ...')).toEqual(['rao', 'rák', 'təə']);
    expect(romanWords('“mii” yùu')).toEqual(['“mii”', 'yùu']);
  });
});

describe('alignExample', () => {
  it('lays the editors\' words over the text', () => {
    const r = alignExample('เรารักเธอ', 'rao rák təə', IDX);
    expect(r).toEqual({ ok: true, boundaries: [3, 6], words: ['เรา', 'รัก', 'เธอ'] });
  });

  it('a hyphenated chunk is ONE word: the editors\' convention decides, not the dictionary\'s other entries', () => {
    expect(alignExample('ภาษาไทย', 'paa-sǎa-tai', IDX)).toMatchObject({ ok: true, boundaries: [], words: ['ภาษาไทย'] });
    expect(alignExample('ภาษาไทย', 'paa-sǎa tai', IDX)).toMatchObject({ ok: true, boundaries: ['ภาษา'.length] });
    expect(alignExample('ที่นี่', 'tîi-nîi', IDX)).toMatchObject({ ok: true, boundaries: [] });
    expect(alignExample('ที่นี่', 'tîi nîi', IDX)).toMatchObject({ ok: true, boundaries: ['ที่'.length] });
  });

  it('skips spaces in the text and puts the boundary at the start of the next word', () => {
    const r = alignExample('เรา รัก เธอ', 'rao · rák · təə', IDX);
    expect(r).toEqual({ ok: true, boundaries: [4, 8], words: ['เรา', 'รัก', 'เธอ'] });
    expect(validateGold({
      id: 'x', lang: 'th', stratum: 'wiktionary-example', text: 'เรา รัก เธอ', boundaries: [4, 8],
      source: { title: 't', licence: 'l', rights: 'derived-cc-by-sa' }, tokenizedBy: 'test',
    })).toEqual([]);
  });

  it('refuses when a romanized word is no headword reading at all', () => {
    expect(alignExample('เรารัก', 'rao zzz', IDX)).toMatchObject({ ok: false, reason: 'roman-word-not-a-headword-reading', detail: 'zzz' });
  });

  it('refuses when all words are known but no sequence of headwords fits the text', () => {
    expect(alignExample('รักเรา', 'rao rák', IDX)).toEqual({ ok: false, reason: 'no-consistent-path' });
    expect(alignExample('เรารักเธอ', 'rao rák', IDX)).toEqual({ ok: false, reason: 'no-consistent-path' }); // text left over
    expect(alignExample('เรา', 'rao rák', IDX)).toEqual({ ok: false, reason: 'no-consistent-path' }); // roman left over
  });

  it('refuses an ambiguous alignment (two different sequences of headwords fit)', () => {
    const amb = index({ 'ก': ['a'], 'กข': ['a'], 'ขค': ['b'], 'ค': ['b'] });
    expect(alignExample('กขค', 'a b', amb)).toEqual({ ok: false, reason: 'ambiguous' });
    // the same words with only one way through are fine
    expect(alignExample('กขค', 'a b', index({ 'ก': ['a'], 'ขค': ['b'] }))).toMatchObject({ ok: true, boundaries: [1] });
  });

  it('refuses text with digits, Latin letters or punctuation, and missing text or roman', () => {
    expect(alignExample('เรา7', 'rao jèt', IDX)).toEqual({ ok: false, reason: 'not-thai-text' });
    expect(alignExample('เรา,รัก', 'rao rák', IDX)).toEqual({ ok: false, reason: 'not-thai-text' });
    expect(alignExample('เรา', undefined, IDX)).toEqual({ ok: false, reason: 'no-roman' });
    expect(alignExample(undefined, 'rao', IDX)).toEqual({ ok: false, reason: 'no-text' });
    expect(alignExample('เรา', ' · ', IDX)).toEqual({ ok: false, reason: 'empty-roman' });
  });

  it('never ends a word where a vowel sign would be orphaned', () => {
    // 'ก' is a headword, but 'กี' is not: ก|ี would orphan the vowel
    const odd = index({ 'ก': ['a'], 'ี': ['b'] });
    expect(alignExample('กี', 'a b', odd).ok).toBe(false);
  });

  it('any listed reading of a headword may match', () => {
    const two = index({ 'ที่': ['tîi', 'tî'] });
    expect(alignExample('ที่', 'tî', two).ok).toBe(true);
    expect(alignExample('ที่', 'tîi', two).ok).toBe(true);
  });
});

describe('buildWiktionaryGold', () => {
  const examples = [
    { headword: 'เรา', type: 'example', text: 'เรารักเธอ', roman: 'rao rák təə' },
    { headword: 'รัก', type: 'quotation', text: 'เรา รัก', roman: 'rao · rák' },
    { headword: 'รัก', type: 'example', text: 'เรารักเธอ', roman: 'rao rák təə' }, // duplicate text
    { headword: 'เรา', type: 'example', text: 'เรารัก' }, // no roman
    { headword: 'เรา', type: 'example', text: 'เรารัก 5', roman: 'rao rák hâa' }, // digit
    { headword: 'เรา', type: 'example', text: 'เรารัก', roman: 'rao zzz' },
  ];
  const r = buildWiktionaryGold(examples, IDX);

  it('keeps the aligned ones, with strata by type and honest provenance', () => {
    expect(r.sentences).toHaveLength(2);
    expect(r.sentences.map((s) => s.stratum)).toEqual(['wiktionary-example', 'wiktionary-quotation']);
    for (const s of r.sentences) {
      expect(s.source.rights).toBe('derived-cc-by-sa');
      expect(s.source.licence).toMatch(/CC BY-SA 4\.0/);
      expect(s.tokenizedBy).toBe('Wiktionary editors (romanization word breaks), aligned automatically');
      expect(s.checkedBy).toBeUndefined();
      expect(validateGold(s)).toEqual([]);
    }
  });

  it('accounts for every example that did not align', () => {
    expect(r.stats.examples).toBe(6);
    expect(r.stats.aligned).toBe(2);
    expect(r.stats.rejected).toEqual({
      'duplicate-text': 1, 'no-roman': 1, 'not-thai-text': 1, 'roman-word-not-a-headword-reading': 1,
    });
    expect(r.rejected).toHaveLength(4);
    expect(Object.values(r.stats.rejected).reduce((a, b) => a + b, 0) + r.stats.aligned).toBe(r.stats.examples);
  });

  it('is deterministic', () => {
    expect(buildWiktionaryGold(examples, IDX)).toEqual(r);
  });
});

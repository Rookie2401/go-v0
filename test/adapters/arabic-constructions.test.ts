/**
 * Grammar patterns (constructions.ts), phrases (phrases.ts) and shallow syntax (syntax.ts) of Arabic. Each pattern has a sentence where it
 * fires and one where it must not. Sentences are the test author's own. Mini fixture index; the full shards (describe.skipIf) for the words
 * the fixture lacks (numbers, elatives).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AR_CONSTRUCTIONS, detectArPatterns } from '../../src/adapters/arabic/constructions';
import { installArabicIndex, resetArabicIndexes, type ArabicFormIndex } from '../../src/adapters/arabic/index-store';
import { detectArPhrases } from '../../src/adapters/arabic/phrases';
import { arAnalyze } from '../../src/adapters/arabic/sentence';
import { arSyntax } from '../../src/adapters/arabic/syntax';
import { arTokenize } from '../../src/adapters/arabic/text';

const mini = JSON.parse(fs.readFileSync(new URL('./arabic-mini-index.json', import.meta.url), 'utf8')) as ArabicFormIndex;
const MANIFEST = path.resolve('public/lexicon/ar/standard/manifest.json');
beforeAll(() => { resetArabicIndexes(); installArabicIndex(mini); });
afterAll(() => resetArabicIndexes());

const patterns = (t: string) => { const k = arTokenize(t); return detectArPatterns(k, arAnalyze(k)); };
const keys = (t: string): string[] => patterns(t).map((p) => p.key);

describe('the table', () => {
  it('every pattern has an id, a title and an explanation; ids are unique', () => {
    expect(new Set(AR_CONSTRUCTIONS.map((c) => c.id)).size).toBe(AR_CONSTRUCTIONS.length);
    for (const c of AR_CONSTRUCTIONS) { expect(c.id).toMatch(/^ar-/); expect(c.label.length).toBeGreaterThan(5); expect(c.explain.length).toBeGreaterThan(40); }
  });
  it('every key a detection returns is in the table, with its words and a confidence', () => {
    const ids = new Set(AR_CONSTRUCTIONS.map((c) => c.id));
    for (const t of ['كتاب الطالب', 'لم يذهب', 'لن يذهب', 'كان الطالب جميل', 'إن الطالب جميل', 'قد ذهب', 'سوف يذهب', 'هذا الكتاب']) {
      for (const p of patterns(t)) {
        expect(ids.has(p.key), p.key).toBe(true);
        expect(p.tokenIndexes.length).toBeGreaterThan(0);
        expect(p.confidence).toBeGreaterThanOrEqual(0.4);
        expect(p.confidence).toBeLessThanOrEqual(0.8);
        expect(p.explanation.length).toBeGreaterThan(40);
      }
    }
  });
});

describe('patterns: positive and negative', () => {
  it('construct', () => {
    expect(patterns('كتاب الطالب').find((p) => p.key === 'ar-construct')?.tokenIndexes).toEqual([0, 1]);
    expect(keys('كتاب جديد')).not.toContain('ar-construct');
    expect(keys('الكتاب الطالب')).not.toContain('ar-construct');
  });
  it('negation with the mood each takes', () => {
    expect(keys('لم يذهب')).toContain('ar-neg-lam');
    expect(keys('لن يذهب')).toContain('ar-neg-lan');
    expect(keys('لا يذهب')).toContain('ar-neg-la');
    expect(keys('لم الطالب')).not.toContain('ar-neg-lam');
    expect(keys('لن الطالب')).not.toContain('ar-neg-lan');
    expect(keys('لَا تَذْهَبْ')).toContain('ar-prohibition');
    expect(keys('لَا يَذْهَبُ')).not.toContain('ar-prohibition');
    expect(keys('ليس الطالب جميلا')).toContain('ar-neg-laysa');
  });
  it('the future, قد + perfect and + imperfect', () => {
    expect(keys('سوف يذهب')).toContain('ar-future');
    expect(keys('سوف الطالب')).not.toContain('ar-future');
    expect(keys('قَدْ ذَهَبَ')).toContain('ar-qad-perfect');
    expect(keys('قَدْ يَذْهَبُ')).toContain('ar-qad-imperfect');
    expect(keys('قَدْ يَذْهَبُ')).not.toContain('ar-qad-perfect');
  });
  it('كان and إن', () => {
    expect(keys('كان الطالب جميل')).toContain('ar-kana');
    expect(keys('كان الطالب في البيت')).not.toContain('ar-kana');
    expect(keys('كان يذهب')).toContain('ar-kana-imperfect');
    expect(keys('إِنَّ الطَّالِبَ جَمِيلٌ')).toContain('ar-inna');
    expect(keys('إِنْ يَذْهَبْ')).not.toContain('ar-inna');
  });
  it('subjunctive particles, conditionals, the relative clause', () => {
    expect(keys('أَنْ يَذْهَبَ')).toContain('ar-subjunctive');
    expect(keys('لَنْ يَذْهَبَ')).not.toContain('ar-subjunctive');
    expect(keys('إِذَا ذَهَبَ الطَّالِبُ')).toContain('ar-conditional');
    expect(keys('هَلْ ذَهَبَ الطَّالِبُ')).not.toContain('ar-conditional');
    expect(keys('الكتاب الذي قرأ')).toContain('ar-relative');
    expect(keys('الكتاب جديد')).not.toContain('ar-relative');
  });
  it('the demonstrative and the adjective; the passive only where the vowels show it', () => {
    expect(keys('هذا الكتاب')).toContain('ar-demonstrative');
    expect(keys('الطالب الجديد')).toContain('ar-noun-adjective');
    expect(keys('الطالب جديدا')).not.toContain('ar-noun-adjective');
    expect(keys('كُتِبَ الدَّرْسُ')).toContain('ar-passive');
    expect(keys('كتب الدرس')).not.toContain('ar-passive');
  });
});

describe('phrases', () => {
  const ph = (t: string) => { const k = arTokenize(t); return detectArPhrases(k, arAnalyze(k)); };
  it('a dictionary headword is found as a run of words; a clitic may be written onto the first one', () => {
    const a = ph('ذهب من أجل العلم');
    expect(a.find((p) => p.display === 'من أجل')?.tokenIndexes).toEqual([1, 2]);
    expect(ph('ذهب ومن أجل العلم').some((p) => p.display === 'من أجل' && p.tokenIndexes[0] === 1)).toBe(true);
  });
  it('NEGATIVE: the words apart, in another order, or across a comma, are not the phrase', () => {
    expect(ph('من العلم أجل')).toEqual([]);
    expect(ph('أجل من')).toEqual([]);
    expect(ph('من، أجل')).toEqual([]);
  });
  it("every phrase carries the dictionary's own gloss and its pattern", () => {
    const p = ph('من أجل')[0];
    expect(p.gloss).toMatch(/sake|because/);
    expect(p.pattern).toHaveLength(2);
  });
});

describe('shallow syntax (not a parser)', () => {
  const sx = (t: string) => { const k = arTokenize(t); return { k, s: arSyntax(k, arAnalyze(k)) }; };
  it('preposition → its noun (case); construct second term → first (nmod); adjective → noun (amod); demonstrative → noun (det)', () => {
    expect(sx('في البيت').s?.relations.find((r) => r.relation === 'case')).toMatchObject({ dependent: 0, head: 1 });
    expect(sx('كتاب الطالب').s?.relations.find((r) => r.relation === 'nmod')).toMatchObject({ dependent: 1, head: 0 });
    expect(sx('الطالب الجديد').s?.relations.find((r) => r.relation === 'amod')).toMatchObject({ dependent: 1, head: 0 });
    expect(sx('هذا الكتاب').s?.relations.find((r) => r.relation === 'det')).toMatchObject({ dependent: 0, head: 1 });
  });
  it('particle → verb; pronoun and subject → verb; every relation says what it relied on and carries a status', () => {
    expect(sx('لم يذهب').s?.relations.find((r) => r.relation === 'advmod')).toMatchObject({ dependent: 0, head: 1 });
    expect(sx('هو يكتب').s?.relations.find((r) => r.relation === 'nsubj')).toMatchObject({ dependent: 0, head: 1 });
    const v = sx('كتب الطالب الكتاب').s!;
    expect(v.relations.find((r) => r.relation === 'nsubj')?.dependent).toBe(1);
    expect(v.relations.find((r) => r.relation === 'obj')?.dependent).toBe(2);
    for (const r of v.relations) { expect(r.basis.length).toBeGreaterThan(0); expect(r.status).toBe('generated'); }
  });
  it('NEGATIVE: no relation across a comma, no object for a verb with one noun, nothing for a lone word; the notes say it is no parser', () => {
    expect(sx('في، البيت').s?.relations.find((r) => r.relation === 'case')).toBeUndefined();
    expect(sx('كتب الطالب').s?.relations.find((r) => r.relation === 'obj')).toBeUndefined();
    const lone = sx('الطالب').s!;
    expect(lone.relations).toEqual([]);
    expect(lone.notes.join(' ')).toMatch(/not a parser/);
  });
});

describe.skipIf(!fs.existsSync(MANIFEST))('with the full index: numbers, the elative', () => {
  beforeAll(() => {
    resetArabicIndexes();
    const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { shards: Record<string, { file: string }> };
    for (const s of Object.values(man.shards)) installArabicIndex(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve('public/lexicon/ar/standard', s.file))).toString('utf8')) as ArabicFormIndex);
  });
  afterAll(() => resetArabicIndexes());
  it('numbers: 3–10, 11–99, 100 each with their rule; NEGATIVE: one and two agree like adjectives', () => {
    expect(keys('ثلاثة كتب')).toContain('ar-number-3-10');
    expect(keys('عشرون طالبا')).toContain('ar-number-11-99');
    expect(patterns('أحد عشر كوكبا').find((p) => p.key === 'ar-number-11-99')?.tokenIndexes).toEqual([0, 1, 2]);
    expect(keys('مئة كتاب')).toContain('ar-number-100');
    expect(keys('كتاب واحد')).not.toContain('ar-number-3-10');
  });
  it('the elative: + مِنْ is a comparative', () => {
    expect(keys('هو أكبر من أخيه')).toContain('ar-comparative');
    expect(keys('هذا كتاب أكبر')).not.toContain('ar-comparative');
  });
  it('syntax: a number is the nummod of its noun', () => {
    const k = arTokenize('ثلاثة كتب');
    expect(arSyntax(k, arAnalyze(k))?.relations.find((r) => r.relation === 'nummod')).toMatchObject({ dependent: 0, head: 1 });
  });
});

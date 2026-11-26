/**
 * The two sentence flags (src/adapters/arabic/dialect.ts) and what the sentence layer does with them: a dialect sentence is not read as
 * Standard Arabic (every reading capped at 0.45), a sentence in Persian or Urdu letters credits nothing. Sentences are the test author's own.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzedToken } from '../../src/core/adapters';
import { arDialectSignals, arForeignScript } from '../../src/adapters/arabic/dialect';
import { installArabicIndex, resetArabicIndexes, type ArabicFormIndex } from '../../src/adapters/arabic/index-store';
import { arAnalyze } from '../../src/adapters/arabic/sentence';
import { arTokenize } from '../../src/adapters/arabic/text';

const mini = JSON.parse(fs.readFileSync(new URL('./arabic-mini-index.json', import.meta.url), 'utf8')) as ArabicFormIndex;
beforeAll(() => { resetArabicIndexes(); installArabicIndex(mini); });
afterAll(() => resetArabicIndexes());

const sig = (t: string) => arDialectSignals(arTokenize(t));
const all = (a: AnalyzedToken[]) => a.flatMap((x) => x.candidates);
const credited = (a: AnalyzedToken[]) => all(a).filter((c) => c.confidence >= 0.5 && !c.unconfirmed && c.lemma);

describe('arDialectSignals', () => {
  it('one marker Standard Arabic cannot produce flags the sentence, with its variety', () => {
    expect(sig('هو مش هنا')).toMatchObject({ variety: 'egyptian', markers: ['مش'] });
    expect(sig('شو اسمك')?.variety).toBe('levantine');
    expect(sig('هذا ديال الأستاذ')?.variety).toBe('maghrebi');
    expect(sig('شلون الحال')?.variety).toBe('iraqi');
  });
  it('two different markers flag even when each alone is a Standard word or a clitic chain (ليش، وين)', () => {
    expect(sig('ليش وين')).toBeDefined();
    expect(sig('وين بدك تروح')?.variety).toBe('levantine');
  });
  it('NEGATIVE: one weak marker never flags (ليش، وين، هواية، الحين، كمان)', () => {
    for (const t of ['ليش', 'وين البيت', 'هواية جميلة', 'قرأ الحين', 'عزف على كمان']) expect(sig(t), t).toBeUndefined();
  });
  it('NEGATIVE: a Standard sentence with look-alikes inside longer words is untouched', () => {
    for (const t of ['مشاهدة الأفلام هواية جميلة', 'شوقي يحب الشعر', 'عايشت الحرب في المدينة']) expect(sig(t), t).toBeUndefined();
  });
  it('the Egyptian negation ما … ـش and a بـ-prefixed imperfect count as weak markers (the latter only when the caller says the word is not Standard)', () => {
    expect(sig('ما كتبتش الدرس مش هنا')).toBeDefined();
    const opts = { isStandardKey: () => false, isImperfectKey: (k: string) => k === 'يكتب' };
    expect(arDialectSignals(arTokenize('بيكتب وين'), opts)).toBeDefined();
    expect(arDialectSignals(arTokenize('بيكتب'), opts)).toBeUndefined();
    expect(arDialectSignals(arTokenize('بيكتب وين'), { isStandardKey: () => true, isImperfectKey: () => true })).toBeUndefined();
  });
});

describe('a dialect sentence in the analyser', () => {
  const a = arAnalyze(arTokenize('انا مش عايز اروح هناك دلوقتي'));
  it('every reading is capped at 0.45 and flagged; nothing is credited', () => {
    expect(credited(a)).toEqual([]);
    for (const c of all(a)) {
      expect(c.confidence).toBeLessThanOrEqual(0.45);
      expect(c.notes?.variety).toBe('dialect?');
      expect(c.notes?.dialect).toBe('egyptian');
      expect(c.notes?.context).toBe('dialect sentence: not read as Standard Arabic');
    }
  });
  it('a marker the lexicon does not know still shows what it is: one uncredited reading without a lemma', () => {
    const w = a.filter((x) => x.token.surface === 'عايز')[0];
    expect(w.candidates).toHaveLength(1);
    expect(w.candidates[0]).toMatchObject({ unconfirmed: true });
    expect(w.candidates[0].lemma).toBeUndefined();
  });
  it('the Levantine example is flagged too, and the Classical variety switches the flag off', () => {
    expect(credited(arAnalyze(arTokenize('شو بدك تاكل هلق')))).toEqual([]);
    const cla = arAnalyze(arTokenize('هو مش هنا'), { varietyId: 'ar-cla' });
    expect(all(cla).some((c) => c.notes?.variety === 'dialect?')).toBe(false);
  });
  it('NEGATIVE: a Standard sentence beside a dialect one is not touched (flags are per sentence)', () => {
    const b = arAnalyze(arTokenize('هو مش هنا. في البيت'));
    const std = b.filter((x) => x.token.start > 8 && x.token.isWord);
    for (const c of std.flatMap((x) => x.candidates)) expect(c.notes?.variety).toBeUndefined();
  });
});

describe('arForeignScript', () => {
  it('Persian, Urdu: letters Arabic never uses (or Persian-only borrowed ones in a third of the words)', () => {
    expect(arForeignScript(arTokenize('پدرم در کتابخانه چای نوشید'))).toContain('Persian');
    expect(arForeignScript(arTokenize('او گفت که پدرش آمد'))).toBeDefined();
    expect(arForeignScript(arTokenize('یہ کتاب ہے'))).toBeDefined();
  });
  it('NEGATIVE: one ک or ی typed in an Arabic sentence, one پ in a place name, and plain Arabic are not flagged', () => {
    expect(arForeignScript(arTokenize('الکتاب الجديد في البيت'))).toBeUndefined();
    expect(arForeignScript(arTokenize('سافر إلى پاريس بالطائرة'))).toBeUndefined();
    expect(arForeignScript(arTokenize('هذا كتاب جديد'))).toBeUndefined();
  });
  it('a Persian-letters text with no Arabic-only sign and no article: flagged by the majority of ک / ی', () => {
    expect(arForeignScript(arTokenize('کتاب کهنه را دیدم'))).toBeDefined();
  });
});

describe('a foreign-script sentence in the analyser', () => {
  it('every reading is unconfirmed, at 0.35 or less, "not Arabic"; nothing is credited', () => {
    const a = arAnalyze(arTokenize('پدرم چای هذا'));
    expect(credited(a)).toEqual([]);
    const cs = all(a);
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      expect(c.unconfirmed).toBe(true);
      expect(c.confidence).toBeLessThanOrEqual(0.35);
      expect(String(c.notes?.context)).toContain('not Arabic');
    }
  });
  it('NEGATIVE: an Arabic sentence with one ک typo is read as Arabic', () => {
    const a = arAnalyze(arTokenize('هذا الکتاب جديد'));
    expect(all(a).some((c) => c.unconfirmed && c.notes?.notArabic)).toBe(false);
    expect(all(a).length).toBeGreaterThan(0);
  });
});

// ───────────────────────────── the real shards ─────────────────────────────

import path from 'node:path';
import zlib from 'node:zlib';
import { AR_ANALYZER } from '../../src/adapters/arabic/version';
import { arRefine } from '../../src/adapters/arabic/sentence';

const MANIFEST = path.resolve('public/lexicon/ar/standard/manifest.json');
describe.skipIf(!fs.existsSync(MANIFEST))('an Egyptian line with the full index (the real-browser failure)', () => {
  const LINE = 'إحنا مش عارفين ليه الشارع زحمة النهارده، وعايز كل واحد يروح بيته بدري.';
  beforeAll(() => {
    resetArabicIndexes();
    const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { shards: Record<string, { file: string }> };
    for (const s of Object.values(man.shards)) installArabicIndex(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve('public/lexicon/ar/standard', s.file))).toString('utf8')) as ArabicFormIndex);
  });
  afterAll(() => resetArabicIndexes());

  it('the markers are the list\'s, whatever readings the index has for the same letters (مش is also مَشَّ)', () => {
    const s = arDialectSignals(arTokenize(LINE));
    expect(s?.variety).toBe('egyptian');
    expect(s?.markers).toEqual(expect.arrayContaining(['إحنا', 'مش', 'ليه', 'النهارده', 'وعايز']));
  });
  it('every word carries notes.variety = dialect? and nothing is credited, including words the lexicon cannot read', () => {
    const a = arAnalyze(arTokenize(LINE));
    const wordsOnly = a.filter((x) => x.token.isWord);
    expect(wordsOnly.length).toBe(13);
    for (const w of wordsOnly) {
      expect(w.candidates.length, w.token.surface).toBeGreaterThan(0);
      for (const c of w.candidates) { expect(c.notes?.variety, w.token.surface).toBe('dialect?'); expect(c.confidence, w.token.surface).toBeLessThan(0.5); }
    }
  });
  it('through arRefine, with the importer\'s lists handed in as `given`, the flag still lowers and annotates them', () => {
    const toks = arTokenize(LINE);
    const first = arAnalyze(toks);
    // the importer put a dictionary's readings (here: the word level's own, at 0.9) on every word and says they are given
    const handed: AnalyzedToken[] = first.map((x) => (x.token.isWord ? { ...x, candidates: x.candidates.map((c) => ({ ...c, confidence: 0.9, notes: { ...c.notes, variety: undefined, context: undefined } as Record<string, string> })) } : x));
    const given = new Set(handed.map((x, i) => (x.token.isWord ? i : -1)).filter((i) => i >= 0));
    const out = arRefine(toks, handed, new Set([AR_ANALYZER]), given);
    for (const [i, w] of out.entries()) {
      if (!w.token.isWord) continue;
      for (const c of w.candidates) { expect(c.notes?.variety, w.token.surface).toBe('dialect?'); expect(c.confidence, `${w.token.surface} #${i}`).toBeLessThanOrEqual(0.45); }
    }
  });
  it('NEGATIVE: a Standard sentence with ONE look-alike (the verb مَشَّ, ليه as a name) stays Standard', () => {
    const a = arAnalyze(arTokenize('مشَّ الرجل الصغير عظم السمكة في المطبخ'));
    expect(a.flatMap((x) => x.candidates).some((c) => c.notes?.variety === 'dialect?')).toBe(false);
  });
});

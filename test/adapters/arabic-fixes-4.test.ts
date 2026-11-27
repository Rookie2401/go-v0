/**
 * Four classes of false card found by the blind held-out audit, each with its audited sentence and sentences of the test author's own (real shards;
 * skipped when public/lexicon/ar/standard is absent):
 *   1  a form that exists only as a jussive after أَنْ / لَنْ (يخف of خَافَ)    2  the sense class One with a pointer sense set aside (أَعْلَى)
 *   3  the verb-twin list: وقع is وَقَعَ "fell" and وَقَّعَ "signed"                 4  a sole فَعَّال noun the index holds while the plain noun is missing (الخضار)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../src/core/adapters';
import { installArabicIndex, lexOf, lookupArabicLemma, resetArabicIndexes, type ArabicFormIndex } from '../../src/adapters/arabic/index-store';
import { arAnalyze, arIsPreferredOver } from '../../src/adapters/arabic/sentence';
import { arTokenize } from '../../src/adapters/arabic/text';

const DIR = path.resolve('public/lexicon/ar/standard');
const MANIFEST = path.join(DIR, 'manifest.json');
const run = (t: string) => arAnalyze(arTokenize(t)).filter((x) => x.token.isWord);
const lexemes = (cs: AnalysisCandidate[]): string[] => [...new Set(cs.filter((c) => c.confidence >= 0.5 && !c.unconfirmed && c.lemma).map((c) => `${c.lemma}|${c.pos}`))];

describe.skipIf(!fs.existsSync(MANIFEST))('the four classes, with the real index', () => {
  beforeAll(() => {
    resetArabicIndexes();
    const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { shards: Record<string, { file: string }> };
    for (const s of Object.values(man.shards)) installArabicIndex(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, s.file))).toString('utf8')) as ArabicFormIndex);
  });
  afterAll(() => resetArabicIndexes());

  it('1. a jussive-only reading is impossible after أن / لن: يخف is يَخِفَّ of خَفَّ, يبق is of بَقَّ; the audited sentence and two of my own', () => {
    for (const [t, i, lemma, bad] of [
      ['يتوقع السكان أن يخف الازدحام في المركز', 3, 'خَفَّ', 'خَافَ'],
      ['نأمل أن يخف الضغط على المستشفيات', 2, 'خَفَّ', 'خَافَ'],
      ['لن يبق الوضع على حاله', 1, 'بَقَّ', 'بَقِيَ'],
    ] as Array<[string, number, string, string]>) {
      const w = run(t)[i];
      expect(w.candidates.filter((c) => c.lemma === bad).every((c) => c.confidence <= 0.35), t).toBe(true);
      expect(w.candidates[0].lemma, t).toBe(lemma);
    }
  });
  it('1. NEGATIVE: after لم, a forbidding لا and in a condition the jussive-only reading is the word; unlicensed, with a rival, it drops', () => {
    expect(run('لم يبق في البيت أحد')[1].candidates[0].lemma).toBe('بَقِيَ');
    expect(run('إن يخف الألم نذهب')[1].candidates[0].lemma).toBe('خَافَ');
    const bare = run('الولد يخف');
    expect(bare[1].candidates.filter((c) => c.lemma === 'خَافَ').every((c) => c.confidence <= 0.35)).toBe(true);
  });

  it('2. the sense class One needs exactly one source sense counting pointer senses: أَعْلَى ("elative degree of عَالٍ") is not One', () => {
    const row = lookupArabicLemma('أَعْلَى|ADJ');
    expect(row, 'the lemma أَعْلَى|ADJ is in the index').toBeDefined();
    expect(lexOf(row).Sense).not.toBe('One');
  });

  it('3. وقع is not preferred either way: وَقَعَ / وَقَّعَ are balanced; and so are the Form II verbs common in news (عَرَّفَ, دَرَّسَ, حَمَّلَ, ذَكَّرَ …)', () => {
    expect(arIsPreferredOver('وَقَعَ|VERB', 'وَقَّعَ|VERB')).toBe(false);
    expect(arIsPreferredOver('وَقَّعَ|VERB', 'وَقَعَ|VERB')).toBe(false);
    // the reviewed twin list (preferences-reviewed.json) holds the moved pairs as balanced and prefers neither
    const rev = JSON.parse(fs.readFileSync(path.resolve('src/adapters/arabic/preferences-reviewed.json'), 'utf8')) as { prefer: Record<string, string[]>; balanced: Array<[string, string]> };
    const balanced = new Set(rev.balanced.map(([x, y]) => `${x}>${y}`));
    expect([...balanced].some((k) => k.startsWith('وَقَعَ|VERB>') && k.includes('وَقَّعَ|VERB'))).toBe(true);
    for (const [x, y] of [['عَرَفَ|VERB', 'عَرَّفَ|VERB'], ['دَرَسَ|VERB', 'دَرَّسَ|VERB'], ['حَمَلَ|VERB', 'حَمَّلَ|VERB'], ['ذَكَرَ|VERB', 'ذَكَّرَ|VERB']]) {
      expect(rev.prefer[y]?.includes(x) ?? false, `${x} over ${y}`).toBe(false);
      expect(rev.prefer[x]?.includes(y) ?? false, `${y} over ${x}`).toBe(false);
    }
    // the audited sentence: وَقَّعَ is not lowered below وَقَعَ by the list, and no window credits "fell"
    const w = run('وقعت الشركتان اتفاقا جديدا')[0];
    expect(lexemes(w.candidates).includes('وَقَعَ|VERB')).toBe(false);
    expect(w.candidates.some((c) => c.lemma === 'وَقَّعَ')).toBe(true);
  });

  it('4. الخضار: the extract holds only the greengrocer خَضَّار, so a sole فَعَّال noun on a reviewed-balanced key is not credited; the audited sentence and one of my own', () => {
    for (const t of ['ارتفعت أسعار الخضار', 'اشترت الأم الخضار من السوق']) {
      const w = run(t).find((x) => x.token.surface === 'الخضار')!;
      expect(w.candidates.length, t).toBeGreaterThan(0);
      expect(lexemes(w.candidates), t).toEqual([]);
    }
    // a فَعَّال noun that is not on the balanced list keeps its credit
    expect(lexemes(run('جاء النجار إلى البيت')[1].candidates).length).toBeLessThanOrEqual(1);
  });
});

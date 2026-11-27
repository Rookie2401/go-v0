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

// ───────────────────────────── batch 2: six false readings from the second blind text ─────────────────────────────

describe.skipIf(!fs.existsSync(MANIFEST))('batch 2 with the real index', () => {
  beforeAll(() => {
    resetArabicIndexes();
    const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { shards: Record<string, { file: string }> };
    for (const s of Object.values(man.shards)) installArabicIndex(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, s.file))).toString('utf8')) as ArabicFormIndex);
  });
  afterAll(() => resetArabicIndexes());
  const word = (t: string, surface: string): AnalysisCandidate[] => run(t).find((x) => x.token.surface === surface)!.candidates;
  const credited = (cs: AnalysisCandidate[]): string[] => lexemes(cs);

  it('1. no question أ stands between لم / لن and the verb: لم أيأس is not أَسِيَ (the audited sentence and two of mine)', () => {
    for (const [t, w] of [['لم أجد عملا في الأسبوع الأول لكنني لم أيأس وواصلت البحث', 'أيأس'], ['لن أيأس من النجاح', 'أيأس'], ['لم أيأس أبدا من الحياة', 'أيأس']] as Array<[string, string]>) {
      const cs = word(t, w);
      expect(cs.filter((c) => c.parts?.some((q) => q.kind === 'prefix' && /question/.test(q.role ?? ''))).every((c) => c.confidence < 0.5), t).toBe(true);
      expect(credited(cs).includes('أَسِيَ|VERB|'), t).toBe(false);
    }
  });
  it('2. after أن / لا a perfect reading is excluded: تدخلوا is not تَدَخَّلَ (Form V); a Form I / IV / II imperfect leads; بعد أن + a perfect is untouched', () => {
    for (const t of ['ضعوا هداياكم قبل أن تدخلوا إلى الصالة', 'يجب أن تدخلوا بهدوء', 'لا تدخلوا الغرفة']) {
      const cs = word(t, 'تدخلوا');
      expect(cs.filter((c) => c.lemma === 'تَدَخَّلَ').every((c) => c.confidence <= 0.35), t).toBe(true);
      expect(cs[0].lemma, t).not.toBe('تَدَخَّلَ');
    }
    expect(word('بعد أن دخلوا البيت ذهبوا', 'دخلوا').some((c) => c.confidence >= 0.5)).toBe(true);
  });
  it('3. homonym siblings: تزال is held only by the second زَالَ, so the reading carries ITS meaning and a note (the lead\'s "to disappear" is wrong)', () => {
    for (const t of ['بنيت هذه القلعة قبل ثمانمائة سنة ولا تزال أسوارها قوية', 'لا تزال المدينة جميلة', 'لا تزال الأسعار مرتفعة']) {
      const c = word(t, 'تزال')[0];
      expect(c.lemma, t).toBe('زَالَ');
      expect(c.notes?.siblingNotLead, t).toBe('yes');
      expect(c.gloss, t).not.toBe('to disappear');
    }
  });
  it('4/5. a citation form that is also a broken plural / a feminine of another lexeme is never decided on a prior: السرقة, المقصورة (the audited sentences and two of mine each)', () => {
    for (const [t, w] of [['اتهمت الشرطة رجلين بهذه السرقة', 'السرقة'], ['عقوبة السرقة شديدة', 'السرقة'], ['انتشرت السرقة في المدينة', 'السرقة'],
      ['لم يكن في المقصورة مكان فارغ', 'المقصورة'], ['جلس في المقصورة الأولى', 'المقصورة'], ['دخل المقصورة', 'المقصورة']] as Array<[string, string]>) {
      expect(credited(word(t, w)), t).toEqual([]);
    }
  });
  it('4/5. controls: الكلاب, المدرسة and the plain adjectives read as before (a noun with its own count is still decided)', () => {
    expect(word('الكلاب في الشارع', 'الكلاب')[0]).toMatchObject({ lemma: 'كَلْب', pos: 'NOUN' });
    expect(word('الكلاب في الشارع', 'الكلاب')[0].confidence).toBeGreaterThanOrEqual(0.5);
    expect(word('ذهب إلى المدرسة', 'المدرسة')[0]).toMatchObject({ lemma: 'مَدْرَسَة' });
    expect(word('المدينة الكبيرة', 'الكبيرة')[0].lemma).toBe('كَبِير');
  });
  it('6. a cut that needs TWO attached pronouns never leads: واتركه is وَ + اُتْرُكْ + هُ (the audited sentence and two of mine); واذهب فاكتب وافعل still read', () => {
    for (const [t, w] of [['أضف قليلا من الملح إلى الأرز واتركه يغلي عشر دقائق', 'واتركه'], ['خذ الكتاب واتركها هناك', 'واتركها'], ['اشرب الماء واتركه', 'واتركه']] as Array<[string, string]>) {
      const cs = word(t, w);
      expect(cs[0].lemma, t).toBe('تَرَكَ');
      expect(cs.filter((c) => (c.parts ?? []).filter((q) => q.kind === 'suffix').length >= 2).every((c) => c.confidence <= 0.35), t).toBe(true);
    }
    for (const [w, lemma] of [['واذهب', 'ذَهَبَ'], ['فاكتب', 'كَتَبَ'], ['وافعل', 'فَعَلَ']]) expect(word(`${w} الآن`, w)[0], w).toMatchObject({ lemma, confidence: 0.85 });
  });
  it('7. the reviewed-choice picker takes the sense whose alternative IS the keyword: صَبَاح is "morning"', () => {
    expect(lookupArabicLemma('صَبَاح|NOUN')?.[1]).toBe('morning');
  });
});

// ───────────────────────────── batch 3: five named faults of the third blind text ─────────────────────────────

describe.skipIf(!fs.existsSync(MANIFEST))('batch 3 with the real index', () => {
  beforeAll(() => {
    resetArabicIndexes();
    const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { shards: Record<string, { file: string }> };
    for (const s of Object.values(man.shards)) installArabicIndex(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, s.file))).toString('utf8')) as ArabicFormIndex);
  });
  afterAll(() => resetArabicIndexes());
  const word = (t: string, surface: string): AnalysisCandidate[] => run(t).find((x) => x.token.surface === surface)!.candidates;

  it('1. a gloss alternative ends at a spaced dash or an opening quotation mark: عُنْوَان is "title"', () => {
    expect(lookupArabicLemma('عُنْوَان|NOUN')?.[1]).toBe('title');
    for (const id of ['الخَبِير|PROPN', 'القَابِض|PROPN']) { const g = lookupArabicLemma(id)?.[1] ?? ''; expect(g, id).not.toMatch(/["“]/); }
  });
  it('2. إذا is إِذَا "if", never إِذَنْ reached through the tanwin spelling إذًا (the audited sentence and two of mine)', () => {
    for (const t of ['إذا ارتفع الماء بعد الأمطار الغزيرة فسيغمر الحقول', 'إذا حضر المدير بدأ الاجتماع', 'إذا نجح الطالب فرح أهله']) {
      const cs = word(t, 'إذا');
      expect(cs.filter((c) => c.lemma === 'إِذَنْ').every((c) => c.confidence < 0.5), t).toBe(true);
      expect(cs[0].lemma, t).toBe('إِذَا');
    }
  });
  it('3. ما before زال and its sisters is not "what" (no credit to the pronoun); elsewhere ما is not touched', () => {
    for (const [t, w] of [['ما زال الطلاب يتبادلون القصص الجديدة', 'ما'], ['ما زالت المدينة جميلة', 'ما'], ['ما يزال الوضع صعبا', 'ما']] as Array<[string, string]>) {
      const cs = word(t, w);
      expect(cs.filter((c) => c.pos === 'PRON' && c.lemma === 'مَا').every((c) => c.confidence < 0.5), t).toBe(true);
    }
    expect(String(word('ما هذا الشيء', 'ما')[0].notes?.context ?? '')).not.toContain('زَالَ');
  });
  it('4. عجب is a Form I / Form IV twin: لم يعجبني is not decided for عَجِبَ (the audited sentence and two of mine)', () => {
    for (const [t, w] of [['لم يعجبني الفيلم لأن قصته طويلة', 'يعجبني'], ['لم يعجبها الكتاب', 'يعجبها'], ['لم يعجبنا المطعم', 'يعجبنا']] as Array<[string, string]>) {
      expect(word(t, w).filter((c) => c.lemma === 'عَجِبَ').every((c) => c.confidence < 0.5), t).toBe(true);
    }
    // a pair the reviewed preferences hold still decides: لم يكتب is كَتَبَ
    expect(word('لم يكتب الطالب', 'يكتب')[0]).toMatchObject({ lemma: 'كَتَبَ', confidence: 0.8 });
  });
});

/**
 * The clitics of the written Arabic word (src/adapters/arabic/clitics.ts): the cuts a key structurally allows (no lexicon), the spellings
 * a stem hides, and which part of speech each clitic allows. Pure functions: nothing is installed here.
 */
import { describe, expect, it } from 'vitest';
import { AR_PRONOUNS, arEncliticAllows, arProcliticAllows, arSegmentations, arStemKeys, AR_PROCLITICS, type ArSegmentation } from '../../src/adapters/arabic/clitics';

const cut = (key: string, ids: string[], stem: string, enc?: string[]): ArSegmentation | undefined =>
  arSegmentations(key).find((s) => s.proclitics.map((c) => c.id).join(',') === ids.join(',') && s.stemKey === stem && (s.enclitics.map((p) => p.text).join(',') === (enc ?? []).join(',')));

describe('arSegmentations: every structurally possible cut, the whole word first', () => {
  it('the whole word is always first and has no clitic', () => {
    for (const w of ['كتب', 'وبالكتاب', 'فسيكتبونها', 'بيت', 'ب', 'كل']) {
      const s = arSegmentations(w)[0];
      expect(s.proclitics, w).toEqual([]);
      expect(s.enclitics, w).toEqual([]);
      expect(s.stemKey, w).toBe(w);
      expect(s.stemKeys[0], w).toBe(w);
    }
  });
  it('وبالكتاب is و + ب + ال + كتاب: four parts with their key spans', () => {
    const s = cut('وبالكتاب', ['wa', 'bi', 'al'], 'كتاب')!;
    expect(s).toBeDefined();
    expect(s.proclSpans).toEqual([[0, 1], [1, 2], [2, 4]]);
    expect(s.stemSpan).toEqual([4, 8]);
  });
  it('فسيكتبونها is ف + س + يكتبون + ها', () => {
    const s = cut('فسيكتبونها', ['fa', 'sa'], 'يكتبون', ['ها'])!;
    expect(s).toBeDefined();
    expect(s.enclitic?.morph).toEqual({ Person: '3', Number: 'Sing', Gender: 'Fem' });
    expect(s.encliticSpans).toEqual([[8, 10]]);
  });
  it('لل is ل + ال with ONE lām showing: للكتاب = ل [0,1) + ال [1,2) + كتاب', () => {
    const s = cut('للكتاب', ['li', 'al'], 'كتاب')!;
    expect(s).toBeDefined();
    expect(s.proclSpans).toEqual([[0, 1], [1, 2]]);
  });
  it('the question hamza أ comes first and before the conjunction', () => {
    expect(cut('أفكتبت', ['a', 'fa'], 'كتبت')).toBeDefined();
  });
  it('a stem is at least two letters: كل is never ك + ل, and a lone letter has no cut', () => {
    expect(arSegmentations('كل').every((s) => s.proclitics.length === 0)).toBe(true);
    expect(arSegmentations('ب')).toHaveLength(1);
  });
  it('بيت IS cut structurally as ب + يت (the lexicon, not this file, rejects it unless يت is a word)', () => {
    expect(cut('بيت', ['bi'], 'يت')).toBeDefined();
  });
  it('two attached pronouns after a verb: أعطانيها = أعطا + ني + ها', () => {
    const s = cut('أعطانيها', [], 'أعطا', ['ني', 'ها'])!;
    expect(s).toBeDefined();
    expect(s.enclitic?.text).toBe('ها');
  });
  it('the ending of a longer pronoun wins over a shorter one only as a separate cut (كم / ك, هم / ه)', () => {
    expect(cut('كتابكم', [], 'كتاب', ['كم'])).toBeDefined();
    expect(cut('كتابكم', [], 'كتابك', ['م'])).toBeUndefined();
  });
});

describe('stem spellings the clitics hide', () => {
  const stems = (key: string, ids: string[], enc: string[]): string[] => cut(key, ids, arSegmentations(key).find((s) => s.enclitics.map((p) => p.text).join(',') === enc.join(',') && s.proclitics.map((c) => c.id).join(',') === ids.join(','))!.stemKey, enc)?.stemKeys ?? [];
  it('ة → ت before a pronoun: مدرسته → مدرسة', () => { expect(stems('مدرسته', [], ['ه'])).toContain('مدرسة'); });
  it('ى → ا / ي: رماه → رمى, عليه → على', () => { expect(stems('رماه', [], ['ه'])).toContain('رمى'); expect(stems('عليه', [], ['ه'])).toContain('على'); });
  it('وا → و: كتبوه → كتبوا; ون → و: معلموه → معلمون; ين → ي: معلميه → معلمين', () => {
    expect(stems('كتبوه', [], ['ه'])).toContain('كتبوا');
    expect(stems('معلموه', [], ['ه'])).toContain('معلمون');
    expect(stems('معلميه', [], ['ه'])).toContain('معلمين');
  });
  it('the ـتمو of the 2nd person plural: كتبتموه → كتبتم', () => { expect(stems('كتبتموه', [], ['ه'])).toContain('كتبتم'); });
  it('the hamza seat: رآه → رأى; the five nouns: أبوه → أب', () => {
    expect(stems('رآه', [], ['ه'])).toContain('رأى');
    expect(stems('أبوه', [], ['ه'])).toContain('أب');
  });
  it('without a pronoun nothing is undone', () => { expect(arSegmentations('مدرسة')[0].stemKeys).toEqual(['مدرسة']); });
  it('arStemKeys is every stem of every cut (the shard loader reads it)', () => {
    const keys = arStemKeys('وبالكتاب');
    expect(keys).toContain('وبالكتاب');
    expect(keys).toContain('كتاب');
    expect(keys).toContain('بالكتاب');
  });
});

describe('what the clitics allow', () => {
  const noun = { pos: 'NOUN', morph: { Definite: 'Cons' } };
  const verbImp = { pos: 'VERB', morph: { VerbForm: 'Fin', Aspect: 'Imp', Mood: 'Ind,Jus,Sub' } };
  const verbPerf = { pos: 'VERB', morph: { VerbForm: 'Fin', Aspect: 'Perf', Mood: 'Ind' } };
  it('ال and the prepositions ب ك ل only on nominals', () => {
    expect(arProcliticAllows(AR_PROCLITICS.al, noun).ok).toBe(true);
    expect(arProcliticAllows(AR_PROCLITICS.al, verbPerf).ok).toBe(false);
    expect(arProcliticAllows(AR_PROCLITICS.bi, verbImp).ok).toBe(false);
    expect(arProcliticAllows(AR_PROCLITICS.ka, noun).ok).toBe(true);
  });
  it('سـ only on an imperfect indicative verb, and it fixes the mood', () => {
    expect(arProcliticAllows(AR_PROCLITICS.sa, verbImp)).toMatchObject({ ok: true, patch: { Mood: 'Ind' } });
    expect(arProcliticAllows(AR_PROCLITICS.sa, verbPerf).ok).toBe(false);
    expect(arProcliticAllows(AR_PROCLITICS.sa, noun).ok).toBe(false);
  });
  it('لِـ on a verb: with the subjunctive or the jussive; لَـ before a perfect; on a noun it is the preposition', () => {
    expect(arProcliticAllows(AR_PROCLITICS.li, verbImp)).toMatchObject({ ok: true, patch: { Mood: 'Jus,Sub' } });
    expect(arProcliticAllows(AR_PROCLITICS.li, { pos: 'VERB', morph: { VerbForm: 'Fin', Aspect: 'Imp', Mood: 'Sub' } }).role).toContain('purpose');
    expect(arProcliticAllows(AR_PROCLITICS.li, verbPerf).ok).toBe(true);
    expect(arProcliticAllows(AR_PROCLITICS.li, noun).ok).toBe(true);
  });
  it('و ف and the question أ go before anything', () => {
    for (const t of [noun, verbImp, verbPerf, { pos: 'PART', morph: {} }]) {
      expect(arProcliticAllows(AR_PROCLITICS.wa, t).ok).toBe(true);
      expect(arProcliticAllows(AR_PROCLITICS.a, t).ok).toBe(true);
    }
  });
  const pron = (t: string): (typeof AR_PRONOUNS)[number] => AR_PRONOUNS.find((p) => p.text === t)!;
  it('a possessive pronoun only on a noun in construct state (and on a preposition); the 1st person object ني only on verbs and particles', () => {
    expect(arEncliticAllows(pron('ه'), noun)).toMatchObject({ ok: true, patch: { Definite: 'Cons' } });
    expect(arEncliticAllows(pron('ه'), { pos: 'NOUN', morph: { Definite: 'Ind' } }).ok).toBe(false);
    expect(arEncliticAllows(pron('ه'), { pos: 'ADP', morph: {} }).ok).toBe(true);
    expect(arEncliticAllows(pron('ني'), verbPerf).ok).toBe(true);
    expect(arEncliticAllows(pron('ني'), noun).ok).toBe(false);
    expect(arEncliticAllows(pron('ي'), verbPerf).ok).toBe(false);
    expect(arEncliticAllows(pron('ي'), noun).ok).toBe(true);
  });
  it('إِنَّ and its sisters take a pronoun as their subject (إنني لكنه ليتني); other particles do not', () => {
    expect(arEncliticAllows(pron('ني'), { pos: 'PART', morph: {}, lemmaKey: 'إن' }).ok).toBe(true);
    expect(arEncliticAllows(pron('ه'), { pos: 'PART', morph: {}, lemmaKey: 'هل' }).ok).toBe(false);
  });
  it('two pronouns after a verb: the inner one must be an object pronoun, a noun takes only one', () => {
    expect(arEncliticAllows(pron('نا'), verbPerf, true).ok).toBe(true);
    expect(arEncliticAllows(pron('ه'), noun, true).ok).toBe(false);
  });
  it('the pronoun table: person, number, gender and a plain English gloss', () => {
    expect(pron('هم').morph).toEqual({ Person: '3', Number: 'Plur', Gender: 'Masc' });
    expect(pron('كما').morph).toEqual({ Person: '2', Number: 'Dual' });
    expect(pron('نا').english).toContain('us');
  });
});

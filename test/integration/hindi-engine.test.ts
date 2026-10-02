/**
 * Coordinator's test of the Hindi engines against tables the packages did not see (hindi-tables.ts): written units,
 * pronunciation (where the unwritten a is and is not said), transliteration, and word forms by rule.
 * The tables are a model's judgement, not a native speaker's; see their header.
 */
import { describe, expect, it } from 'vitest';
import type { PartOfSpeech } from '../../src/core';
import { analyzeHindiForm, describeHindiMorph, inflectHindi } from '../../src/adapters/hindi/morphology';
import { decodeHindi, describeHindiOrthFeature, hindiOrthFeatures } from '../../src/adapters/hindi/pronunciation';
import { aksharas, hindiSearchForm, hindiSpellingVariants } from '../../src/adapters/hindi/script';
import { transliterateHindi } from '../../src/adapters/hindi/translit';
import { AKSHARAS, FORMS, FUSED, LEMMAS, NONSENSE, SAID_CORE, SAID_FINAL_CLUSTER, SAID_HARD } from './hindi-tables';

/** A transliteration reduced to bare Latin letters: conventions differ, the sounds and their order do not. */
const skeleton = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]/g, '');
const nfc = (s: string) => s.normalize('NFC');

const said = (word: string) => {
  const units = decodeHindi(nfc(word));
  const t = transliterateHindi(nfc(word));
  const sure = units.length > 0 && units.every((u) => u.confidence >= 0.6 && u.inherentVowel !== 'uncertain');
  return { units, text: skeleton(t.text), confidence: t.confidence, sure };
};

const knownLemma = (lemma: string, pos?: PartOfSpeech): boolean => !!LEMMAS[lemma] && (pos === undefined || LEMMAS[lemma].pos === pos || (pos === 'VERB' && LEMMAS[lemma].pos === 'AUX') || (pos === 'AUX' && LEMMAS[lemma].pos === 'VERB'));
const lemmaInfo = (lemma: string, pos: PartOfSpeech) => {
  const l = LEMMAS[lemma];
  return l ? { pos, gender: l.gender, invariant: l.invariant, ergative: l.ergative } : undefined;
};
const analyse = (form: string) => analyzeHindiForm(nfc(form), { knownLemma, lemmaInfo });
const holds = (morph: Record<string, string>, want: Record<string, string>): boolean =>
  Object.entries(want).every(([k, v]) => morph[k] !== undefined && morph[k].split(',').some((x) => v.split(',').includes(x)));

describe('Hindi: written units', () => {
  it.each(AKSHARAS)('%s is %s', (word, units) => {
    expect(aksharas(nfc(word)).map((a) => a.text).join('·')).toBe(nfc(units));
  });

  it('the units tile the word exactly, for every word of the tables', () => {
    for (const [word] of [...SAID_CORE, ...SAID_HARD]) {
      const w = nfc(word);
      const list = aksharas(w);
      expect(list.map((a) => a.text).join(''), word).toBe(w);
      list.forEach((a, i) => { expect(w.slice(a.start, a.end), word).toBe(a.text); if (i > 0) expect(a.start).toBe(list[i - 1].end); });
    }
  });

  it('keeps the nukta: ज़ and ज are different letters, and the words stay different forms', () => {
    const z = aksharas(nfc('ज़रा'))[0];
    const j = aksharas(nfc('जरा'))[0];
    expect(z.signs).toContain('nukta');
    expect(j.signs).not.toContain('nukta');
    expect(nfc('सज़ा')).not.toBe(nfc('सजा')); // punishment / decorated: two words
  });

  it('search form folds what a searcher does not type, and only for search', () => {
    expect(hindiSearchForm(nfc('हिन्दी'))).toBe(hindiSearchForm(nfc('हिंदी')));
    expect(hindiSearchForm(nfc('ज़रूर'))).toBe(hindiSearchForm(nfc('जरूर')));
    expect(hindiSearchForm(nfc('माँ'))).toBe(hindiSearchForm(nfc('मां')));
    const once = hindiSearchForm(nfc('ज़िंदगी'));
    expect(hindiSearchForm(once)).toBe(once);
  });

  it('spelling variants relate the same word, both ways, and never a different word', () => {
    const pairs: Array<[string, string]> = [['हिंदी', 'हिन्दी'], ['गई', 'गयी'], ['चाहिए', 'चाहिये'], ['ज़रूरत', 'जरूरत'], ['यहाँ', 'यहां'], ['संबंध', 'सम्बन्ध']];
    for (const [a, b] of pairs) {
      expect(hindiSpellingVariants(nfc(a)), a).toContain(nfc(b));
      expect(hindiSpellingVariants(nfc(b)), b).toContain(nfc(a));
    }
    expect(hindiSpellingVariants(nfc('कमल'))).toEqual([]);
    expect(hindiSpellingVariants(nfc('पढ़ना'))).not.toContain(nfc('पढना')); // ढ़ and ढ are different letters
    expect(hindiSpellingVariants(nfc('में'))).not.toContain(nfc('मे'));
  });
});

describe('Hindi: how a written word is said', () => {
  it.each(SAID_CORE)('%s is said %s, with confidence', (word, expected) => {
    const r = said(word);
    expect(r.text).toBe(expected);
    expect(r.sure, `${word} should be read with confidence`).toBe(true);
  });

  it.each(SAID_HARD)('%s: %s, or an honest "uncertain" — never another reading with confidence', (word, expected) => {
    const r = said(word);
    if (r.sure) expect(r.text).toBe(expected);
    else expect(r.confidence).toBeLessThan(0.8);
  });

  it.each(SAID_FINAL_CLUSTER)('%s ends in a cluster: %s or %s', (word, without, withA) => {
    const r = said(word);
    expect([without, withA]).toContain(r.text);
  });

  it('never supplies the unwritten a after every consonant', () => {
    expect(said('कमल').text).not.toBe('kamala');
    expect(said('लड़का').text).not.toBe('laraka');
    const units = decodeHindi(nfc('कमल'));
    expect(units[units.length - 1].inherentVowel).toBe('dropped');
    expect(units[0].inherentVowel).toBe('pronounced');
  });

  it('states source, rule and confidence on every unit, and no tone or ending', () => {
    for (const [word] of SAID_CORE.slice(0, 40)) {
      for (const u of decodeHindi(nfc(word))) {
        expect(['rule', 'exception-list']).toContain(u.source);
        expect(u.confidence).toBeGreaterThan(0);
        expect(u.confidence).toBeLessThanOrEqual(1);
        expect(u.ending).toBeUndefined();
        expect(u.tone).toBeUndefined();
        if (u.inherentVowel === 'dropped') expect(u.rule, word).toBeTruthy();
      }
    }
  });

  it('gives writing-system items with plain descriptions', () => {
    const f = hindiOrthFeatures(decodeHindi(nfc('प्रार्थना')));
    expect(f.length).toBeGreaterThan(3);
    expect(f.some((k) => k.startsWith('conjunct:'))).toBe(true);
    for (const k of f) expect(describeHindiOrthFeature(k)).not.toBe(k);
    expect(hindiOrthFeatures(decodeHindi(nfc('ज़रूर')))).toContain('sign:nukta');
    expect(hindiOrthFeatures(decodeHindi(nfc('कमल')))).toContain('rule:final-a-dropped');
  });
});

describe('Hindi: word forms by rule', () => {
  it.each(FORMS)('%s → %s (%s) %j', (form, lemma, pos, want) => {
    const readings = analyse(form).filter((r) => r.lemma === nfc(lemma) && (r.pos === pos || (pos === 'VERB' && r.pos === 'AUX')));
    expect(readings.length, `${form}: no reading of ${lemma}; got ${analyse(form).map((r) => `${r.lemma}/${r.pos}`).join(', ') || 'nothing'}`).toBeGreaterThan(0);
    expect(readings.some((r) => holds(r.morph, want)), `${form}: ${JSON.stringify(readings.map((r) => r.morph))}`).toBe(true);
    expect(readings.every((r) => r.lemmaKnown)).toBe(true);
    expect(readings.every((r) => r.rule.length > 0)).toBe(true);
  });

  it.each(FUSED)('%s is %s + %s (%s), one word in two parts', (form, lemma, post, kase) => {
    const r = analyse(form).find((x) => x.lemma === nfc(lemma) && (x.parts?.length ?? 0) === 2);
    expect(r, `${form}: ${JSON.stringify(analyse(form).map((x) => [x.lemma, x.parts?.map((p) => p.text)]))}`).toBeDefined();
    const f = nfc(form);
    expect(r!.parts!.map((p) => f.slice(p.start, p.end)).join('')).toBe(f);
    expect(r!.parts![1].text).toBe(nfc(post));
    expect(r!.morph.Case).toBe(kase);
  });

  it('लड़के is two readings, not one blurred one', () => {
    const r = analyse('लड़के').filter((x) => x.lemma === nfc('लड़का'));
    expect(r.some((x) => x.morph.Number === 'Sing' && x.morph.Case === 'Obl')).toBe(true);
    expect(r.some((x) => x.morph.Number === 'Plur' && x.morph.Case === 'Dir')).toBe(true);
  });

  it('a lemma the word list does not hold is a marked guess, capped, and never confident', () => {
    const guesses = analyzeHindiForm(nfc('टहलता'), { knownLemma: () => false });
    expect(guesses.length).toBeGreaterThan(0);
    expect(guesses.length).toBeLessThanOrEqual(4);
    expect(guesses[0].lemma).toBe(nfc('टहलना'));
    for (const g of guesses) { expect(g.lemmaKnown).toBe(false); expect(g.confidence).toBeLessThanOrEqual(0.6); }
  });

  it.each(NONSENSE)('%s gets no confident reading', (word) => {
    for (const r of analyzeHindiForm(nfc(word), { knownLemma })) expect(r.confidence).toBeLessThanOrEqual(0.6);
  });

  it('generation and analysis agree: every generated form analyses back to its lemma', () => {
    for (const [lemma, info] of Object.entries(LEMMAS)) {
      const pos = info.pos as PartOfSpeech;
      const forms = inflectHindi(nfc(lemma), pos, { pos, gender: info.gender, invariant: info.invariant, ergative: info.ergative });
      expect(forms.length, lemma).toBeGreaterThan(0);
      for (const f of forms) {
        const back = analyse(f.form).filter((r) => r.lemma === nfc(lemma));
        expect(back.length, `${lemma}: generated ${f.form} does not analyse back`).toBeGreaterThan(0);
      }
    }
  });

  it('describes features in words a reader can use', () => {
    expect(describeHindiMorph({ Gender: 'Fem', Number: 'Sing', Aspect: 'Perf', VerbForm: 'Part' }, 'VERB').toLowerCase()).toMatch(/feminine/);
    expect(describeHindiMorph({ Number: 'Plur', Case: 'Obl', Gender: 'Masc' }, 'NOUN').toLowerCase()).toMatch(/oblique/);
    expect(describeHindiMorph({ Mood: 'Imp', Polite: 'Form' }, 'VERB').toLowerCase()).toMatch(/polite|आप/);
    expect(describeHindiMorph({ Tense: 'Fut', Person: '1', Number: 'Sing' }, 'VERB')).not.toMatch(/Tense|Person=/);
  });
});

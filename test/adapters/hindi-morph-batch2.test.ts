import { describe, expect, it } from 'vitest';
import { analyzeHindiForm, inflectHindi } from '../../src/adapters/hindi/morphology';
import { NOUNS, OPTS, expectReading, expectTiling, read } from './hindi-morph-helpers';

type Row = [form: string, lemma: string, want: Record<string, string>];
type PRow = [form: string, lemma: string, want: Record<string, string>, parts?: [string, string]];
const D = 'Dir', O = 'Obl', V = 'Voc', S = 'Sing', P = 'Plur', M = 'Masc', F = 'Fem';
const mk = (g: string, n: string, c: string) => ({ Gender: g, Number: n, Case: c });

describe('fused genitives and the indefinite pronoun', () => {
  it('जो / कौन / कोई / सब + का के की: lemma is the direct form, parts stem + का (clitic ADP), Case=Gen, the agreement as separate readings', () => {
    const rows: Array<[string, string, string[], Array<Record<string, string>>]> = [
      ['जिसका', 'जो', ['जिस', 'का'], [{ Gender: M, Number: S }]], ['जिनका', 'जो', ['जिन', 'का'], [{ Gender: M, Number: S }]],
      ['जिसके', 'जो', ['जिस', 'के'], [{ Gender: M, Number: S }, { Gender: M, Number: P }]], ['जिनके', 'जो', ['जिन', 'के'], [{ Gender: M, Number: P }]],
      ['जिसकी', 'जो', ['जिस', 'की'], [{ Gender: F, Number: S }, { Gender: F, Number: P }]], ['जिनकी', 'जो', ['जिन', 'की'], [{ Gender: F, Number: P }]],
      ['किसका', 'कौन', ['किस', 'का'], [{ Gender: M, Number: S }]], ['किनके', 'कौन', ['किन', 'के'], [{ Gender: M, Number: P }]], ['किसकी', 'कौन', ['किस', 'की'], [{ Gender: F, Number: S }]],
      ['किनकी', 'कौन', ['किन', 'की'], [{ Gender: F, Number: P }]],
      ['किसीका', 'कोई', ['किसी', 'का'], [{ Gender: M, Number: S }]], ['किसीके', 'कोई', ['किसी', 'के'], [{ Gender: M, Number: P }]], ['किसीकी', 'कोई', ['किसी', 'की'], [{ Gender: F, Number: S }]],
      ['सबका', 'सब', ['सब', 'का'], [{ Gender: M, Number: S }]], ['सबकी', 'सब', ['सब', 'की'], [{ Gender: F, Number: S }]],
    ];
    for (const [form, lemma, parts, agr] of rows) {
      const r = read(form).filter((a) => a.lemma === lemma && a.morph.Case === 'Gen');
      expect(r.length, form).toBeGreaterThanOrEqual(agr.length);
      for (const want of agr) expect(r.some((a) => Object.entries(want).every(([k, v]) => a.morph[k] === v)), `${form} ${JSON.stringify(want)}`).toBe(true);
      for (const a of r) {
        expect(a.pos, form).toBe('PRON');
        expectTiling(form, a);
        expect(a.parts!.map((p) => p.text), form).toEqual(parts);
        expect(a.parts![0].kind).toBe('stem');
        expect(a.parts![1]).toMatchObject({ kind: 'clitic', pos: 'ADP', lemma: 'का' });
      }
    }
  });

  it('the indefinite oblique किसी and the honorific plurals fuse with ने को से में पर', () => {
    const rows: PRow[] = [
      ['किसीने', 'कोई', { Case: 'Erg' }, ['किसी', 'ने']], ['किसीको', 'कोई', { Case: 'Dat' }, ['किसी', 'को']], ['किसीसे', 'कोई', { Case: 'Obl' }, ['किसी', 'से']],
      ['किसीमें', 'कोई', { Case: 'Obl' }, ['किसी', 'में']], ['किसीपर', 'कोई', { Case: 'Obl' }, ['किसी', 'पर']],
      ['किनको', 'कौन', { Case: 'Dat', Number: P }, ['किन', 'को']], ['किनमें', 'कौन', { Case: 'Obl' }, ['किन', 'में']], ['किनपर', 'कौन', { Case: 'Obl' }, ['किन', 'पर']],
      ['जिनसे', 'जो', { Case: 'Obl', Number: P }, ['जिन', 'से']], ['जिनपर', 'जो', { Case: 'Obl' }, ['जिन', 'पर']], ['जिनमें', 'जो', { Case: 'Obl' }, ['जिन', 'में']],
      ['जिन्होंने', 'जो', { Case: 'Erg', Number: P }, ['जिन्हों', 'ने']], ['किन्होंने', 'कौन', { Case: 'Erg', Number: P }, ['किन्हों', 'ने']],
      ['जिन्हें', 'जो', { Case: 'Dat', Number: P }], ['किन्हें', 'कौन', { Case: 'Dat', Number: P }],
    ];
    for (const [form, lemma, want, parts] of rows) {
      const a = read(form).filter((x) => x.pos === 'PRON' && x.lemma === lemma).find((x) => Object.entries(want).every(([k, v]) => x.morph[k] === v));
      expect(a, form).toBeTruthy();
      if (parts) { expectTiling(form, a!); expect(a!.parts!.map((p) => p.text)).toEqual(parts); }
    }
  });
});

describe('X + वाला written as one word', () => {
  const WALA: Array<[form: string, lemma: string, parts: [string, string], want: Record<string, string>]> = [
    ['देनेवाला', 'देना', ['देने', 'वाला'], mk(M, S, D)], ['देनेवाले', 'देना', ['देने', 'वाले'], mk(M, S, O)], ['देनेवाले', 'देना', ['देने', 'वाले'], mk(M, P, D)],
    ['देनेवाले', 'देना', ['देने', 'वाले'], mk(M, P, O)], ['देनेवाली', 'देना', ['देने', 'वाली'], { Gender: F, Number: S }], ['देनेवाली', 'देना', ['देने', 'वाली'], { Gender: F, Number: P }],
    ['देनेवालों', 'देना', ['देने', 'वालों'], mk(M, P, O)], ['देनेवालियों', 'देना', ['देने', 'वालियों'], mk(F, P, O)],
    ['करनेवाला', 'करना', ['करने', 'वाला'], mk(M, S, D)], ['खानेवाले', 'खाना', ['खाने', 'वाले'], mk(M, P, D)], ['पढ़नेवाली', 'पढ़ना', ['पढ़ने', 'वाली'], { Gender: F, Number: S }],
    ['जानेवालों', 'जाना', ['जाने', 'वालों'], mk(M, P, O)], ['आनेवाला', 'आना', ['आने', 'वाला'], mk(M, S, D)],
    // a noun, direct or oblique, + वाला
    ['बीजवाला', 'बीज', ['बीज', 'वाला'], mk(M, S, D)], ['बीजवाले', 'बीज', ['बीज', 'वाले'], mk(M, P, D)], ['घरवाली', 'घर', ['घर', 'वाली'], { Gender: F, Number: S }],
    ['घरवालों', 'घर', ['घर', 'वालों'], mk(M, P, O)], ['लड़केवाला', 'लड़का', ['लड़के', 'वाला'], mk(M, S, D)], ['लड़कियोंवाली', 'लड़की', ['लड़कियों', 'वाली'], { Gender: F, Number: S }],
  ];

  it(`${WALA.length} rows: ONE confident reading per agreement cell, lemma the BASE, pos ADJ, parts tile the form`, () => {
    for (const [form, lemma, parts, want] of WALA) {
      const a = expectReading(form, lemma, 'ADJ', want);
      expect(a.lemmaKnown, form).toBe(true);
      expect(a.confidence, form).toBeGreaterThanOrEqual(0.8);
      expectTiling(form, a);
      expect(a.parts!.map((p) => p.text), form).toEqual(parts);
      expect(a.parts![0]).toMatchObject({ kind: 'stem', lemma });
      expect(a.parts![1]).toMatchObject({ kind: 'clitic', lemma: 'वाला', pos: 'ADJ' });
      expect(a.rule, form).toMatch(/also written as two words/);
      expect(read(form).filter((x) => x.lemma === lemma && x.pos === 'ADJ' && JSON.stringify(x.morph) === JSON.stringify(a.morph)), form).toHaveLength(1);
      expect(read(form).some((x) => x.lemma.endsWith('वाला')), form).toBe(false);
    }
    expect(read('देनेवाला')[0].rule).toContain('the one who …s / that which …s');
    expect(read('बीजवाला')[0].rule).toContain('having / of / the one with');
  });

  it('a base nobody vouched for: at most one unconfirmed guess (≤ 0.6, no gloss) with the same parts, never a lemma like रेंगनेवाला', () => {
    for (const [form, lemma, parts] of [['रेंगनेवाला', 'रेंगना', ['रेंगने', 'वाला']], ['रेंगनेवाले', 'रेंगना', ['रेंगने', 'वाले']], ['चमकनेवाली', 'चमकना', ['चमकने', 'वाली']], ['रेंगनेवालों', 'रेंगना', ['रेंगने', 'वालों']]] as const) {
      for (const o of [OPTS, {}]) {
        const r = analyzeHindiForm(form, o);
        expect(r.length, form).toBeGreaterThan(0);
        expect(r[0].lemma, form).toBe(lemma);
        expect(r[0].pos).toBe('ADJ');
        expect(r[0].lemmaKnown).toBe(false);
        expect(r[0].confidence).toBeLessThanOrEqual(0.6);
        expectTiling(form, r[0]);
        expect(r[0].parts!.map((p) => p.text)).toEqual(parts);
        expect(r.some((a) => /वाल[ाेीि]?$/.test(a.lemma)), form).toBe(false);
      }
    }
    const nounBase = analyzeHindiForm('सिनेमावाला', {});
    expect(nounBase[0]).toMatchObject({ lemma: 'सिनेमा', pos: 'ADJ', lemmaKnown: false });
    expect(nounBase[0].confidence).toBeLessThanOrEqual(0.6);
    expectTiling('सिनेमावाला', nounBase[0]);
  });

  it('the word वाला on its own, and ग्वाला, are not split', () => {
    expect(read('वाला').every((a) => !a.parts)).toBe(true);
    expect(read('ग्वाला').every((a) => !a.parts)).toBe(true);
  });
});

describe('masculine nouns in an independent -आ after a vowel sign (कौआ, कुआँ)', () => {
  it('oblique singular / direct plural in ए (with the nasal mark where the lemma has it), oblique plural in ओं', () => {
    const rows: Row[] = [
      ['कौआ', 'कौआ', mk(M, S, D)], ['कौए', 'कौआ', mk(M, S, O)], ['कौए', 'कौआ', mk(M, P, D)], ['कौओं', 'कौआ', mk(M, P, O)], ['कौओ', 'कौआ', mk(M, P, V)],
      ['कुआँ', 'कुआँ', mk(M, S, D)], ['कुएँ', 'कुआँ', mk(M, S, O)], ['कुएँ', 'कुआँ', mk(M, P, D)], ['कुएं', 'कुआँ', mk(M, P, D)], ['कुओं', 'कुआँ', mk(M, P, O)],
      ['सुए', 'सुआ', mk(M, P, D)], ['सुओं', 'सुआ', mk(M, P, O)],
    ];
    for (const [form, lemma, want] of rows) expectReading(form, lemma, 'NOUN', want);
    expect(inflectHindi('कौआ', 'NOUN', NOUNS['कौआ']).map((x) => x.form)).toEqual(expect.arrayContaining(['कौए', 'कौओं']));
    expect(inflectHindi('कुआँ', 'NOUN', NOUNS['कुआँ']).map((x) => x.form)).toEqual(expect.arrayContaining(['कुएँ', 'कुओं']));
    // the feminine type keeps its own rule
    expectReading('दुआएँ', 'दुआ', 'NOUN', mk(F, P, D));
  });

  it('no lemma in -या is invented, with the word list or without', () => {
    for (const w of ['कौए', 'कौओं', 'कुएँ', 'कुओं', 'सुए']) {
      for (const o of [OPTS, {}]) expect(analyzeHindiForm(w, o).filter((a) => a.pos === 'NOUN' || a.pos === 'ADJ').some((a) => a.lemma.endsWith('या')), w).toBe(false);
    }
    expect(analyzeHindiForm('कौओं', {}).some((a) => a.lemma === 'कौआ')).toBe(true);
  });
});

describe('abstract nouns in -ता / -पन / -पना from a vouched adjective or noun', () => {
  const o = OPTS;
  it('-ता: the first guess is a feminine noun whole-word lemma, notes.derivedFrom the base, ahead of the verb guess', () => {
    for (const [form, lemma, base, want] of [
      ['समानता', 'समानता', 'समान', mk(F, S, D)], ['समानताएँ', 'समानता', 'समान', mk(F, P, D)], ['समानताएं', 'समानता', 'समान', mk(F, P, D)], ['समानताओं', 'समानता', 'समान', mk(F, P, O)],
      ['सुंदरता', 'सुंदरता', 'सुंदर', mk(F, S, D)], ['सुंदरताओं', 'सुंदरता', 'सुंदर', mk(F, P, O)], ['पागलता', 'पागलता', 'पागल', mk(F, S, D)],
    ] as const) {
      const r = analyzeHindiForm(form, o);
      expect(r[0], form).toMatchObject({ lemma, pos: 'NOUN', lemmaKnown: false, notes: { derivedFrom: base } });
      expect(r[0].confidence).toBeLessThanOrEqual(0.6);
      expect(r[0].rule).toContain(`abstract noun from ${base} + -ता`);
      expectReading(form, lemma, 'NOUN', want, o);
      expect(r.findIndex((a) => a.pos === 'VERB'), form).toBeLessThan(0);
      expect(Object.keys(r[0])).not.toContain('gloss');
    }
  });

  it('a vouched -ता lemma is confident; a verb the list vouches for is not an abstract noun; no base, no abstract noun', () => {
    const vouched = { knownLemma: (l: string, p?: string) => (l === 'समानता' && (!p || p === 'NOUN')) || OPTS.knownLemma!(l, p as never) };
    const a = analyzeHindiForm('समानता', vouched)[0];
    expect(a).toMatchObject({ lemma: 'समानता', pos: 'NOUN', lemmaKnown: true });
    expect(a.confidence).toBeGreaterThanOrEqual(0.7);
    expect(analyzeHindiForm('समानताओं', vouched)[0]).toMatchObject({ lemma: 'समानता', lemmaKnown: true });
    expect(read('करता')[0]).toMatchObject({ lemma: 'करना', pos: 'VERB' });
    expect(read('चलता').every((x) => !x.notes)).toBe(true);
    expect(analyzeHindiForm('रास्ता', o).every((x) => !x.notes)).toBe(true);
  });

  it('-पन and -पना (masculine) by the same rule', () => {
    for (const [form, lemma, base, want] of [
      ['भोलापन', 'भोलापन', 'भोला', mk(M, S, D)], ['भोलापन', 'भोलापन', 'भोला', mk(M, P, D)], ['भोलापनों', 'भोलापन', 'भोला', mk(M, P, O)],
      ['पागलपन', 'पागलपन', 'पागल', mk(M, S, D)], ['भोलापना', 'भोलापना', 'भोला', mk(M, S, D)], ['भोलापने', 'भोलापना', 'भोला', mk(M, S, O)],
    ] as const) {
      const r = analyzeHindiForm(form, o);
      expect(r[0], form).toMatchObject({ lemma, pos: 'NOUN', lemmaKnown: false, notes: { derivedFrom: base } });
      expect(r[0].rule).toContain(`abstract noun from ${base} + -`);
      expectReading(form, lemma, 'NOUN', want, o);
    }
  });
});

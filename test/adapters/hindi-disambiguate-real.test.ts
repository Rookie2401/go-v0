/**
 * The neighbour rules on the REAL adapter: the order of readings the word list and the engine give, over real sentences.
 * Every reading is kept; the chosen one keeps its confidence; the others are marked down to 0.4 at most.
 */
import { describe, expect, it } from 'vitest';
import { hiAdapter } from '../../src/adapters/hi';

function readings(sentence: string, surface: string, nth = 0) {
  const tokens = hiAdapter.tokenize(sentence.normalize('NFC'));
  const analyses = hiAdapter.analyze(tokens);
  const idx = tokens.map((t, i) => (t.surface === surface ? i : -1)).filter((i) => i >= 0)[nth];
  if (idx === undefined) throw new Error(`no ${surface} in ${sentence}`);
  return analyses[idx].candidates;
}
const has = (c: { morph: Record<string, string> } | undefined, k: string, v: string): boolean => (c?.morph[k] ?? '').split(',').includes(v);

describe('the order of readings in real sentences', () => {
  it('रहा / रहे / रही: the progressive auxiliary first after a bare stem, "stayed" first otherwise; nothing is dropped', () => {
    for (const [s, w] of [['वह खा रहा है।', 'रहा'], ['माँ गा रही थी।', 'रही'], ['वे बोल ही रहे थे।', 'रहे'], ['वह नहीं आ रहा।', 'रहा']] as const) {
      const r = readings(s, w);
      expect(has(r[0], 'Aspect', 'Prog'), s).toBe(true);
      expect(r.some((c) => has(c, 'Aspect', 'Perf')), `${s}: the perfective reading is kept`).toBe(true);
      expect(r.slice(1).every((c) => c.confidence <= 0.4), s).toBe(true);
      expect(typeof r[0].notes?.context, s).toBe('string');
    }
    const stayed = readings('वह घर पर रहा।', 'रहा');
    expect(has(stayed[0], 'Aspect', 'Perf')).toBe(true);
    expect(stayed.some((c) => has(c, 'Aspect', 'Prog'))).toBe(true);
    expect(stayed.filter((c) => has(c, 'Aspect', 'Prog')).every((c) => c.confidence <= 0.4)).toBe(true);
  });

  it('a stem that is also a noun is the stem before रहा', () => {
    const r = readings('बच्चे खेल रहे हैं।', 'खेल');
    expect(has(r[0], 'VerbForm', 'Stem')).toBe(true);
    expect(r.some((c) => c.pos === 'NOUN')).toBe(true);
  });

  it('बच्चे: direct plural without a postposition, oblique singular with one, with the agreeing words following', () => {
    expect(has(readings('बच्चे कहानी सुन रहे हैं।', 'बच्चे')[0], 'Case', 'Dir')).toBe(true);
    expect(has(readings('बच्चे को कहानी सुनाओ।', 'बच्चे')[0], 'Case', 'Obl')).toBe(true);
    expect(has(readings('बच्चे ही को कहानी सुनाओ।', 'बच्चे')[0], 'Case', 'Obl')).toBe(true);
    expect(has(readings('बच्चों के लिए।', 'बच्चों')[0], 'Case', 'Obl')).toBe(true);
    // both readings are always there
    const r = readings('बच्चे कहानी सुन रहे हैं।', 'बच्चे');
    expect(r.some((c) => has(c, 'Case', 'Obl'))).toBe(true);
    expect(r.some((c) => has(c, 'Case', 'Dir'))).toBe(true);
  });

  it('the adjective keeps its place: the list reading with no case is not demoted by the case rule', () => {
    expect(readings('वह शुरू करता है।', 'शुरू')[0].pos).not.toBe(undefined);
    const r = readings('अच्छे बच्चे खेल रहे हैं।', 'अच्छे');
    expect(r[0].pos).toBe('ADJ');
  });

  it('a vocative-only noun reading (करो = "tax", vocative plural) does not outrank the verb', () => {
    expect(readings('तुम काम शुरू करो।', 'करो')[0].pos).toBe('VERB');
  });

  it('a stem with nothing joining it is not the stem: the participle of the base verb', () => {
    expect(readings('इनाम मिला।', 'मिला')[0].lemma).toBe('मिलना');
    expect(readings('वह चला गया।', 'चला')[0].lemma).toBe('चलना');
  });

  it('adjective / noun homograph आम by glosses; feminine noun / participle बोली; खाना as the object', () => {
    expect(readings('वह आम खाता है।', 'आम')[0].pos).toBe('NOUN');
    expect(readings('वह आम लोग हैं।', 'आम')[0].pos).toBe('ADJ');
    expect(readings('वह बोली।', 'बोली')[0].pos).toBe('VERB');
    expect(readings('यह उसकी बोली है।', 'बोली')[0].pos).toBe('NOUN');
    expect(readings('मैं खाना खाता हूँ।', 'खाना')[0].pos).toBe('NOUN');
  });

  it('a subjunctive that is spelled like a participle takes the subjunctive after शायद / ताकि / जब तक … न', () => {
    for (const [s, w] of [['शायद वह आए।', 'आए'], ['जब तक वह न आए, मैं रुकूँगा।', 'आए']] as const) {
      const r = readings(s, w);
      expect(r.some((c) => has(c, 'Mood', 'Sub')), s).toBe(true);
    }
  });

  it('the order is a pure function of the sentence: analysing twice gives the same readings', () => {
    const s = 'बच्चे कहानी सुन रहे हैं।';
    expect(readings(s, 'रहे')).toEqual(readings(s, 'रहे'));
  });
});

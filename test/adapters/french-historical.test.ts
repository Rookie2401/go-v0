/**
 * Older French spelling (src/adapters/french/historical.ts). Machine-drafted rules: every rule is shown on a real form through the
 * adapter (the modern lemma tagged fr-hist, the modern spelling in notes.modern), and the guards are shown on stubs of `solid`.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../src/core';
import { frAdapter } from '../../src/adapters/fr';
import { HISTORICAL_EXACT, HISTORICAL_RULES, historicalReadings } from '../../src/adapters/french/historical';

/** The adapter's candidates for one word of a sentence. */
function readWord(sentence: string, word: string): AnalysisCandidate[] {
  const tokens = frAdapter.tokenize(sentence);
  const analyses = frAdapter.analyze(tokens);
  const i = tokens.findIndex((t) => t.isWord && t.normalized === word);
  expect(i, `${word} in ${sentence}`).toBeGreaterThanOrEqual(0);
  return analyses[i].candidates;
}

const hist = (cands: AnalysisCandidate[]) => cands.filter((c) => c.varieties?.includes('fr-hist'));

/** [sentence, the written form, the modern spelling, the modern lemma] */
const THROUGH_ADAPTER: ReadonlyArray<readonly [string, string, string, string]> = [
  ['Il avoit un chat.', 'avoit', 'avait', 'avoir'],
  ['Elle étoit belle.', 'étoit', 'était', 'être'],
  ['Ils feroient bien.', 'feroient', 'feraient', 'faire'],
  ['Les enfans jouent.', 'enfans', 'enfants', 'enfant'],
  ['Ses parens sont venus.', 'parens', 'parents', 'parent'],
  ['Il y a long tems de cela.', 'tems', 'temps', 'temps'],
  ['Le roy est mort.', 'roy', 'roi', 'roi'],
  ['Il parle à luy.', 'luy', 'lui', 'lui'],
  ['Il étoit icy.', 'icy', 'ici', 'ici'],
  ['Ce n\'est pas vray.', 'vray', 'vrai', 'vrai'],
  ['J\'ay un chat.', 'ay', 'ai', 'avoir'],
  ['Il vouloit estre roi.', 'estre', 'être', 'être'],
  ['Elle estoit là.', 'estoit', 'était', 'être'],
  ['La mesme chose.', 'mesme', 'même', 'même'],
  ['Il veut sçavoir.', 'sçavoir', 'savoir', 'savoir'],
  ['Il a vû le chat.', 'vû', 'vu', 'voir'],
  ['Il avoit la foiblesse de le croire.', 'avoit', 'avait', 'avoir'],
];

describe('older spelling through the adapter', () => {
  it.each(THROUGH_ADAPTER)('%s', (sentence, written, modern, lemma) => {
    const cands = readWord(sentence, written.normalize('NFC'));
    const h = hist(cands).filter((c) => c.notes?.modern === modern);
    expect(h.length, `${written}: ${JSON.stringify(cands.map((c) => [c.lemma, c.notes?.modern]))}`).toBeGreaterThan(0);
    expect(h.some((c) => c.lemma === lemma), `${written} → ${modern} lemma ${lemma}`).toBe(true);
    const first = h[0];
    expect(first.register).toContain('historical');
    expect(first.confidence).toBeLessThanOrEqual(0.6);
    expect(typeof first.notes?.historical).toBe('string');
  });

  it('a combined case names both rules (estoit: the s and the oi)', () => {
    const h = hist(readWord('Elle estoit là.', 'estoit'));
    const rule = String(h[0].notes?.historical);
    expect(rule).toMatch(/circumflex/);
    expect(rule).toMatch(/oi for ai/);
    expect(h[0].notes?.modern).toBe('était');
  });

  it('a modern word is not tagged as old', () => {
    for (const [sentence, word] of [['Il avait un chat.', 'avait'], ['Le roi est mort.', 'roi'], ['Les enfants jouent.', 'enfants'], ['Il était là.', 'était'], ['Il parle à François.', 'françois'], ['Il est soit riche.', 'soit']] as const) {
      expect(hist(readWord(sentence, word))).toEqual([]);
    }
  });

  it('a form whose modern spelling the word list does not know stays unexplained by history', () => {
    const cands = readWord('Il parle du glouboulouy.', 'glouboulouy');
    expect(hist(cands)).toEqual([]);
  });
});

/** A stub of the adapter's `solid`: these modern spellings are words, nothing else is. */
function stubSolid(words: Record<string, Partial<AnalysisCandidate>[]>) {
  return (modern: string): AnalysisCandidate[] => (words[modern] ?? []).map((c) => ({ lemma: modern, pos: 'NOUN', morph: {}, confidence: 0.9, ...c }) as AnalysisCandidate);
}

describe('historicalReadings with a stub of solid', () => {
  const solid = stubSolid({
    avait: [{ lemma: 'avoir', pos: 'AUX', morph: { VerbForm: 'Fin', Tense: 'Imp' } }],
    était: [{ lemma: 'être', pos: 'AUX', morph: { VerbForm: 'Fin', Tense: 'Imp' } }],
    être: [{ lemma: 'être', pos: 'AUX', morph: { VerbForm: 'Inf' } }],
    enfants: [{ lemma: 'enfant', pos: 'NOUN', morph: { Number: 'Plur' } }],
    temps: [{ lemma: 'temps', pos: 'NOUN', morph: { Number: 'Sing' } }],
    roi: [{ lemma: 'roi', pos: 'NOUN', morph: { Number: 'Sing' } }],
    même: [{ lemma: 'même', pos: 'ADJ', morph: {} }],
    savoir: [{ lemma: 'savoir', pos: 'VERB', morph: { VerbForm: 'Inf' } }],
    vu: [{ lemma: 'voir', pos: 'VERB', morph: { VerbForm: 'Part', Tense: 'Past' } }],
    connaissait: [{ lemma: 'connaître', pos: 'VERB', morph: { VerbForm: 'Fin', Tense: 'Imp' } }],
    sait: [{ lemma: 'savoir', pos: 'VERB', morph: { VerbForm: 'Fin' } }],
    soit: [{ lemma: 'être', pos: 'AUX', morph: { VerbForm: 'Fin', Mood: 'Sub' } }],
    mêmes: [{ lemma: 'même', pos: 'ADJ', morph: { Number: 'Plur' } }],
    lundis: [{ lemma: 'lundi', pos: 'NOUN', morph: { Number: 'Plur' } }],
    bontés: [{ lemma: 'bonté', pos: 'NOUN', morph: { Number: 'Plur' } }],
    plans: [{ lemma: 'plan', pos: 'NOUN', morph: { Number: 'Plur' } }],
    plants: [{ lemma: 'plant', pos: 'NOUN', morph: { Number: 'Plur' } }],
    français: [{ lemma: 'français', pos: 'ADJ', morph: {} }],
    siècle: [{ lemma: 'siècle', pos: 'NOUN', morph: { Number: 'Sing' } }],
    dait: [], // not a word
  });

  it.each([
    ['avoit', 'avait', /oi for ai/],
    ['étoit', 'était', /oi for ai/],
    ['enfans', 'enfants', /-ans, -ens/],
    ['tems', 'temps', /no p/],
    ['roy', 'roi', /y for i/],
    ['estre', 'être', /circumflex/],
    ['mesme', 'même', /circumflex/],
    ['sçavoir', 'savoir', /sç for s/],
    ['vû', 'vu', /circumflex on the participle/],
    ['mesmes', 'mêmes', /plural/],
    ['bontez', 'bontés', /-tez for -tés/],
    ['françois', 'français', /oi for ai/],
    ['siécle', 'siècle', /é for è/],
  ])('%s → %s', (form, modern, rule) => {
    const r = historicalReadings(form, solid);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].modern).toBe(modern);
    expect(r[0].rule).toMatch(rule);
    expect(r[0].rule).toContain(`${form} → ${modern}`);
    expect(r[0].reading.lemma).toBeTruthy();
  });

  it('combines rules: estoit names both, connoissoit is two oi rules and the table needs neither', () => {
    const e = historicalReadings('estoit', solid);
    expect(e[0].modern).toBe('était');
    expect(e[0].rule).toMatch(/circumflex/);
    expect(e[0].rule).toMatch(/oi for ai/);
    const c = historicalReadings('connoissoit', solid);
    expect(c[0].modern).toBe('connaissait');
    expect(c[0].rule).toMatch(/before -ss-/);
    expect(c[0].rule).toMatch(/imperfect and conditional endings/);
  });

  it('returns [] for a modern word (it is itself read)', () => {
    expect(historicalReadings('avait', solid)).toEqual([]);
    expect(historicalReadings('soit', solid)).toEqual([]); // soit → sait would be a word, but soit is read
    expect(historicalReadings('plans', solid)).toEqual([]); // plans → plants would be a word, but plans is read
    expect(historicalReadings('lundis', solid)).toEqual([]);
  });

  it('returns [] when the modern spelling is not a word (solid rejects it)', () => {
    expect(historicalReadings('doit', solid)).toEqual([]); // doit → dait is not a word
    expect(historicalReadings('xyzoit', solid)).toEqual([]);
    expect(historicalReadings('glouboulouy', solid)).toEqual([]);
    expect(historicalReadings('', solid)).toEqual([]);
  });

  it('a general rule keeps only the readings that fit it: -ans must give a plural noun or adjective', () => {
    const singularOnly = stubSolid({ romants: [{ lemma: 'romant', pos: 'NOUN', morph: { Number: 'Sing' } }] });
    expect(historicalReadings('romans', singularOnly)).toEqual([]);
  });

  it('the -oit ending must give a verb form (or a nationality), not any word', () => {
    const noun = stubSolid({ cait: [{ lemma: 'cait', pos: 'NOUN', morph: {} }] });
    expect(historicalReadings('coit', noun)).toEqual([]);
  });

  it('the written form is never changed: the result names the modern word beside it', () => {
    const r = historicalReadings('estoit', solid);
    expect(r.every((x) => x.modern !== 'estoit')).toBe(true);
  });

  it('a very old spelling the rules do not cover is not guessed (faict, dict)', () => {
    expect(historicalReadings('faict', stubSolid({ fait: [{ lemma: 'faire', pos: 'VERB', morph: {} }] }))).toEqual([]);
  });
});

describe('the exact table', () => {
  it('has a modern spelling and at least one rule for every entry, and no entry maps to itself', () => {
    const entries = Object.entries(HISTORICAL_EXACT);
    expect(entries.length).toBeGreaterThanOrEqual(110);
    for (const [written, e] of entries) {
      expect(e.modern, written).not.toBe(written);
      expect(e.rules.length, written).toBeGreaterThan(0);
      for (const r of e.rules) expect(HISTORICAL_RULES[r], `${written}: ${r}`).toBeTruthy();
    }
  });
  it('covers the common words the brief names', () => {
    for (const w of ['avoit', 'estre', 'teste', 'mesme', 'isle', 'hoste', 'forest', 'beste', 'feste', 'maistre', 'goust', 'coste', 'tost', 'plustost', 'aussi-tost', 'foible', 'monnoie', 'françois', 'anglois', 'roy', 'moy', 'luy', 'icy', 'celuy', 'vray', 'amy', 'ay', 'tems', 'long-tems', 'sçavoir', 'sçait', 'vû', 'pû', 'sû', 'eû']) {
      if (w === 'avoit') continue; // avoit is the general -oit rule, not a table word
      expect(HISTORICAL_EXACT[w], w).toBeDefined();
    }
  });
  it('the modern side of the table is lower case NFC and shows the accent where the s-for-accent rule is named', () => {
    for (const [written, e] of Object.entries(HISTORICAL_EXACT)) {
      expect(e.modern, written).toBe(e.modern.normalize('NFC').toLowerCase());
      if (e.rules.includes('s-circ')) expect(e.modern, written).toMatch(/[âêîôûé]/u);
    }
  });
});

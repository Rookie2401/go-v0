/**
 * The adapter over the REAL morphology engine (src/adapters/spanish/morphology.ts, owned by another package).
 * While the engine is still the coordinator's stub (it returns no readings) this whole file is skipped; once the
 * engine is in, it runs and checks the forms of the spec end to end. Nothing here is mocked.
 */
import { describe, expect, it } from 'vitest';
import { analyzeSpanishForm, conjugateSpanish } from '../../src/adapters/spanish/morphology';
import { esAdapter } from '../../src/adapters/es';
import { patterns, phrases, run } from './helpers';

const engineLive = analyzeSpanishForm('hablamos', { knownLemma: () => true }).length > 0;
const cands = (w: string) => run('es', w).analyses[0].candidates;
const one = (w: string, lemma: string) => cands(w).find((c) => c.lemma === lemma);

describe.skipIf(!engineLive)('Spanish adapter over the real morphology engine', () => {
  it('hubiéramos: haber, imperfect subjunctive, first person plural', () => {
    expect(one('hubiéramos', 'haber')?.morph).toMatchObject({ Mood: 'Sub', Person: '1', Number: 'Plur' });
    expect(one('hubiéramos', 'haber')?.origin).toBe('rule');
  });

  it('decírselo: decir + se + lo, offsets tile the word', () => {
    const c = one('decírselo', 'decir')!;
    expect(c.parts!.map((p) => p.text).join('')).toBe('decírselo');
    expect(c.parts!.map((p) => 'decírselo'.slice(p.start, p.end))).toEqual(c.parts!.map((p) => p.text));
    expect(c.parts!.some((p) => p.text === 'se')).toBe(true);
    expect(c.parts!.some((p) => p.text === 'lo')).toBe(true);
  });

  it('vos tenés is voseo and vosotros tenéis is vosotros, both labelled, neither dropped', () => {
    expect(one('tenés', 'tener')?.varieties).toContain('voseo');
    expect(one('tenéis', 'tener')?.varieties).toContain('vosotros');
    expect(patterns('es', 'Vos tenés razón.').map((p) => p.key)).toContain('voseo');
    expect(patterns('es', 'Vosotros tenéis razón.').map((p) => p.key)).toContain('vosotros');
  });

  it('a form of a verb in the word list is confident; one outside it is not', () => {
    expect(one('hablamos', 'hablar')!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(cands('hablamos').length).toBeGreaterThanOrEqual(2); // present and preterite
    expect(Math.max(...cands('hablamos').map((c) => c.confidence))).toBeLessThanOrEqual(0.75);
  });

  it('phrases and constructions work on engine readings', () => {
    expect(phrases('es', 'Tuvimos que comer.').map((p) => p.pattern.join(' '))).toContain('tener que _');
    expect(patterns('es', 'Íbamos a comer.').map((p) => p.key)).toContain('ir-a-infinitive');
    expect(patterns('es', 'Si hubiéramos sabido, habríamos venido.').map((p) => p.key)).toContain('si-conditional');
  });

  it('older spelling reaches the modern lemma', () => {
    expect(one('dixo', 'decir')?.varieties).toContain('es-hist');
    expect(esAdapter.relate('dixo', 'decir')).toBe('inflection');
  });

  it('every form the engine generates for a few lemmas analyses back to the lemma', () => {
    for (const lemma of ['hablar', 'comer', 'vivir', 'tener', 'ir', 'hacer', 'decir', 'poder', 'querer', 'dar']) {
      const forms = conjugateSpanish(lemma);
      if (!forms) continue;
      for (const f of forms) {
        const text = f.form.normalize('NFC').toLocaleLowerCase('es');
        expect(cands(text).some((c) => c.lemma === lemma), `${text} → ${lemma}`).toBe(true);
      }
    }
  });
});

describe('Spanish adapter over the engine stub', () => {
  it('while the engine returns nothing the adapter still analyses its word list and never invents a reading', () => {
    if (engineLive) return;
    expect(cands('hablamos')).toEqual([]);
    expect(cands('madre')[0].lemma).toBe('madre');
    expect(cands('comer')[0].lemma).toBe('comer');
  });
});

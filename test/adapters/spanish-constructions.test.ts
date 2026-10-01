/**
 * Spanish phrase units and constructions. The morphology engine is replaced by a stand-in (spanish-engine-double.ts)
 * that knows the inflected forms these sentences use, so the tests check what the detectors do with analyses, not
 * what the engine says.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/adapters/spanish/morphology', async () => await import('./spanish-engine-double'));

import { PHRASE_UNITS, buildPhraseRules } from '../../src/adapters/spanish/phrases';
import { SPANISH_CONSTRUCTIONS } from '../../src/adapters/spanish/constructions';
import { patterns, phrases, run } from './helpers';

const keys = (text: string) => patterns('es', text).map((p) => p.key);
const units = (text: string) => phrases('es', text).map((p) => p.pattern.join(' '));

describe('Spanish constructions', () => {
  it('lists the constructions of the plan, each with a key, a title, an explanation with a Spanish example and its English', () => {
    const want = ['imperfect', 'preterite', 'enclitic-pronoun', 'personal-a', 'ir-a-infinitive', 'perfect-tense', 'estar-gerund', 'llevar-gerund', 'acabar-de', 'tener-que', 'se-impersonal',
      'gustar-type', 'aunque-subjunctive', 'si-conditional', 'para-que-subjunctive', 'cuando-subjunctive', 'querer-que-subjunctive', 'comparison', 'ser-estar-adjective',
      'double-object-pronouns', 'voseo', 'vosotros', 'future-subjunctive'];
    expect(SPANISH_CONSTRUCTIONS.map((c) => c.key)).toEqual(want);
    expect(new Set(want).size).toBe(want.length);
    for (const c of SPANISH_CONSTRUCTIONS) {
      expect(c.title.length, c.key).toBeGreaterThan(5);
      expect(c.explanation.length, c.key).toBeGreaterThan(60);
      expect(c.explanation, c.key).toMatch(/"[^"]+"|→/u); // a Spanish example, quoted
      expect(c.explanation, c.key).not.toMatch(/!/);
      expect(c.example.es.length).toBeGreaterThan(3);
      expect(c.example.en.length).toBeGreaterThan(3);
      expect(c.nearMiss.length, c.key).toBeGreaterThanOrEqual(1);
    }
  });

  for (const c of SPANISH_CONSTRUCTIONS) {
    it(`${c.key}: fires on its example, not on a near miss`, () => {
      expect(keys(c.example.es), c.example.es).toContain(c.key);
      for (const miss of c.nearMiss) expect(keys(miss), miss).not.toContain(c.key);
    });
  }

  it('the existing keys are kept, with the same behaviour on the old examples', () => {
    expect(keys('Yo no creía en Dios.')).toContain('imperfect');
    expect(keys('Dios perdonó mi pecado.')).toContain('preterite');
    expect(keys('Yo amo a Dios.')).toContain('personal-a');
    expect(keys('Quiero entenderlo.')).toContain('enclitic-pronoun');
    expect(keys('perdona a todos')).toContain('personal-a');
  });

  it('personal a is not fired for a place or for a thing', () => {
    expect(keys('Voy a Roma.')).not.toContain('personal-a');
    expect(keys('Amo a la vida.')).not.toContain('personal-a');
  });

  it('token indexes point at the words of the construction', () => {
    const r = run('es', 'Voy a comer.');
    const p = patterns('es', 'Voy a comer.').find((x) => x.key === 'ir-a-infinitive')!;
    expect(p.tokenIndexes.map((i) => r.tokens[i].surface)).toEqual(['Voy', 'a', 'comer']);
    expect(p.confidence).toBeGreaterThan(0.6);
  });

  it('the subjunctive constructions need the subjunctive: the same frame with the indicative does not fire', () => {
    expect(keys('Aunque tenga miedo, voy.')).toContain('aunque-subjunctive');
    expect(keys('Aunque tiene miedo, va.')).not.toContain('aunque-subjunctive');
    expect(keys('Quiero que tenga paz.')).toContain('querer-que-subjunctive');
    expect(keys('Creo que tiene paz.')).not.toContain('querer-que-subjunctive');
  });

  it('si + imperfect subjunctive is more certain when the conditional follows', () => {
    const withCond = patterns('es', 'Si tuviera tiempo, viajaría.').find((p) => p.key === 'si-conditional')!;
    const alone = patterns('es', 'Si tuviera tiempo.').find((p) => p.key === 'si-conditional')!;
    expect(withCond.confidence).toBeGreaterThan(alone.confidence);
  });

  it('voseo, vosotros and the future subjunctive are named as such', () => {
    const vos = patterns('es', 'Vos tenés razón.').filter((p) => p.key === 'voseo');
    expect(vos.length).toBeGreaterThanOrEqual(2); // the pronoun and the verb form
    expect(SPANISH_CONSTRUCTIONS.find((c) => c.key === 'voseo')!.explanation).toMatch(/Honduras/);
    expect(SPANISH_CONSTRUCTIONS.find((c) => c.key === 'vosotros')!.title).toMatch(/Spain/);
    expect(SPANISH_CONSTRUCTIONS.find((c) => c.key === 'vosotros')!.explanation).toMatch(/not your default/);
    expect(SPANISH_CONSTRUCTIONS.find((c) => c.key === 'future-subjunctive')!.title).toMatch(/older Spanish/);
    expect(keys('Si dijéremos que no tenemos pecado.')).toContain('future-subjunctive');
  });

  it('decírselo: two attached pronouns are the double-object construction as well as the attached-pronoun one', () => {
    expect(keys('decírselo')).toEqual(expect.arrayContaining(['enclitic-pronoun', 'double-object-pronouns']));
  });

  it('a sentence with nothing in it fires nothing', () => {
    expect(patterns('es', 'Mesa.')).toEqual([]);
    expect(patterns('es', '')).toEqual([]);
  });
});

describe('Spanish phrase units', () => {
  const rules = buildPhraseRules();

  it('lists well over 120 units, each with a gloss, a kind and a display; none twice', () => {
    expect(PHRASE_UNITS.length).toBeGreaterThanOrEqual(120);
    const ids = rules.map((r) => r.pattern.join(' '));
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of rules) {
      expect(r.gloss.length, r.display).toBeGreaterThan(2);
      expect(['collocation', 'formula', 'idiom', 'frame', 'construction']).toContain(r.kind);
      expect(r.display.length).toBeGreaterThan(3);
      expect(r.variants.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('the named units are there', () => {
    const ids = new Set(rules.map((r) => r.pattern.join(' ')));
    for (const want of ['tener que _', 'acabar de _', 'darse cuenta de', 'a pesar de', 'por lo tanto', 'tener ganas de', 'por supuesto', 'sin embargo', 'a veces', 'de repente',
      'en seguida', 'tal vez', 'a lo mejor', 'por favor', 'de nada', 'hacer falta', 'echar de menos', 'tener razón', 'volver a _', 'dejar de _', 'ponerse a _', 'llegar a _']) {
      expect(ids.has(want), want).toBe(true);
    }
  });

  it('every unit is found in a sentence made of its own words (a verb in the infinitive, a reflexive one with its pronoun attached)', () => {
    const missing: string[] = [];
    for (const [spec] of PHRASE_UNITS) {
      const words = spec.replace(/~/gu, '').split(' ').map((w) => (w === '_' ? 'comer' : w === '*' ? 'casa' : w.replace('(se)', 'se')));
      const text = words.join(' ');
      const r = run('es', text);
      const found = phrases('es', text);
      const id = rules.find((x) => x.display === found.find((f) => f.tokenIndexes[0] === 0)?.display)?.pattern.join(' ');
      const wanted = buildPhraseRules([[spec, 'x', 'formula']])[0].pattern.join(' ');
      if (!found.some((f) => f.pattern.join(' ') === wanted)) missing.push(`${spec} → "${text}" (${id ?? 'none'}; ${r.tokens.length} tokens)`);
    }
    expect(missing).toEqual([]);
  });

  it('inflected verbs match through the lemma, and an object pronoun before the verb is tolerated', () => {
    expect(units('Tengo que comer.')).toContain('tener que _');
    expect(units('Voy a comer.')).toContain('ir a _');
    expect(units('Acabo de comer.')).toContain('acabar de _');
    expect(units('Me di cuenta de todo.')).toContain('darse cuenta de');
    expect(units('Quiero dejar de comer.')).toContain('dejar de _');
    expect(units('Tengo muchas ganas de comer.')).toContain('tener ganas de');
    expect(units('Tienes toda la razón.')).toContain('tener razón');
    expect(units('Hay que comer.')).toContain('haber que _');
  });

  it('volver a + infinitive is not volver a + noun', () => {
    expect(units('Quiero volver a comer.')).toContain('volver a _');
    expect(units('Quiero volver a casa.')).not.toContain('volver a _'); // casa is also a verb form to the rules, but not an infinitive
    expect(units('Voy a casa.')).not.toContain('ir a _');
  });

  it('a unit reports the tokens it covers, with a confidence that drops when words intervene', () => {
    const near = phrases('es', 'Tengo ganas de comer.').find((p) => p.display === 'tener ganas de')!;
    const far = phrases('es', 'Tengo muchas ganas de comer.').find((p) => p.display === 'tener ganas de')!;
    expect(near.gloss).toBe('to feel like (doing or having)');
    expect(far.confidence).toBeLessThan(near.confidence);
    expect(far.tokenIndexes).toEqual([0, 2, 3]); // the modifier between is skipped, not part of the unit
  });

  it('fixed expressions need all their words, in order', () => {
    expect(units('Sin embargo, no voy.')).toContain('sin embargo');
    expect(units('Embargo sin fin.')).not.toContain('sin embargo');
    expect(units('A pesar de todo, voy.')).toContain('a pesar de');
    expect(units('Por favor, ven.')).toContain('por favor');
  });

  it('the three older phrases still work', () => {
    expect(units('Cuando era joven, yo no entendía.')).toContain('cuando ser joven');
    expect(units('Un día empecé a entender mi pecado.')).toContain('empezar a entender');
    expect(units('Yo creía en Dios.')).toContain('creer en _');
  });
});

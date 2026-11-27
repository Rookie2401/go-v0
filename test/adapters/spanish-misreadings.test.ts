/**
 * Confident misreadings of the Spanish adapter (deck-gate follow-up): a noun that shares its spelling with a verb or
 * adverb form, read from its neighbours. Every rule has sentences of its shape and a counter-example it must leave alone.
 */
import { describe, expect, it } from 'vitest';
import type { RawToken } from '../../src/core';
import { esAdapter as es } from '../../src/adapters/es';

/** The readings of `word` in `text`, best first: "lemma/POS". */
function read(text: string, word: string): Array<{ key: string; confidence: number }> {
  const tokens: RawToken[] = es.tokenize(text);
  const analyzed = es.analyze(tokens);
  const i = tokens.findIndex((t) => t.isWord && t.normalized === word);
  expect(i).toBeGreaterThanOrEqual(0);
  return analyzed[i].candidates.map((c) => ({ key: `${c.lemma}/${c.pos}`, confidence: c.confidence }));
}
const first = (text: string, word: string) => read(text, word)[0].key;
/** Both readings stand within 0.15: undecided downstream. */
const confidentGap = (text: string, word: string) => { const r = read(text, word); return r.length < 2 ? 1 : r[0].confidence - r[1].confidence; };

describe('a noun after a determiner is not the verb form it spells (caso, gusto, marca)', () => {
  it.each([
    ['El caso todavía se investiga.', 'caso', 'caso/NOUN'],
    ['No es un caso difícil.', 'caso', 'caso/NOUN'],
    ['Con mucho gusto, señora.', 'gusto', 'gusto/NOUN'],
    ['Tiene buen gusto para la ropa.', 'gusto', 'gusto/NOUN'],
    ['Terminó con su mejor marca personal.', 'marca', 'marca/NOUN'],
    ['La marca de ropa es famosa.', 'marca', 'marca/NOUN'],
  ])('%s', (text, word, want) => {
    expect(first(text, word)).toBe(want);
    expect(confidentGap(text, word)).toBeGreaterThan(0.15);
  });
  it('after a subject pronoun the same spelling stays the verb', () => {
    expect(first('Ella marca el número.', 'marca')).toBe('marcar/VERB');
    expect(first('Yo gusto de leer.', 'gusto')).toBe('gustar/VERB');
  });
});

describe('after haber a feminine or plural form is the noun (haber comida)', () => {
  it.each([
    ['Va a haber comida para todos.', 'comida'],
    ['Habrá comida en la fiesta.', 'comida'],
    ['Había comidas típicas en la plaza.', 'comidas'],
  ])('%s', (text, word) => {
    expect(first(text, word).endsWith('/NOUN')).toBe(true);
  });
  it('a masculine participle after haber is still the participle', () => {
    expect(first('Ya ha comido.', 'comido')).toBe('comer/VERB');
    expect(first('Hemos cenado temprano.', 'cenado')).toBe('cenar/VERB');
  });
});

describe('derecho: straight ahead after a verb of going on, otherwise the noun', () => {
  it.each([
    ['Siga derecho por la calle principal.', 'derecho'],
    ['Sigue derecho hasta el semáforo.', 'derecho'],
    ['Vamos todo derecho hasta el río.', 'derecho'],
  ])('%s', (text, word) => {
    expect(first(text, word)).toBe('derecho/ADV');
    expect(confidentGap(text, word)).toBeGreaterThan(0.15);
  });
  it.each([
    ['Tiene derecho a votar.', 'derecho'],
    ['Estudia derecho en la universidad.', 'derecho'],
    ['Es un derecho de todos.', 'derecho'],
  ])('%s stays the noun', (text, word) => {
    expect(first(text, word)).toBe('derecho/NOUN');
    expect(confidentGap(text, word)).toBeGreaterThan(0.15);
  });
});

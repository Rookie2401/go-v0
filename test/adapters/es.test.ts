import { describe, expect, it } from 'vitest';
import { adapter, applySuggestion, best, errors, patterns, phrases, run, words } from './helpers';
import { esNumberToWords } from '../../src/adapters/es';

const es = adapter('es');

describe('Spanish adapter', () => {
  it('tokenizes punctuation apart from words (no split on spaces)', () => {
    const r = run('es', '¿Cómo estás, Ana?');
    expect(r.tokens.map((t) => t.surface)).toEqual(['¿', 'Cómo', 'estás', ',', 'Ana', '?']);
    expect(words(r)).toEqual(['Cómo', 'estás', 'Ana']);
  });

  it('keeps accents in the form identity and is case-insensitive', () => {
    expect(es.normalize('Entendía')).toBe('entendía');
    expect(es.normalize('Entendia')).not.toBe(es.normalize('Entendía'));
    // a word without its accent is NOT in the lexicon: uncertainty, not a guess
    for (const c of run('es', 'entendia').analyses[0].candidates) expect(c.confidence).toBeLessThanOrEqual(0.6); // none, or a rule guess
  });

  it('analyses conjugated forms from the lexicon paradigm', () => {
    const r = run('es', 'Yo no entendía, pero empecé a entender.');
    const a = best(r, 'entendía');
    expect(a.lemma).toBe('entender');
    expect(a.morph.Tense).toBe('Imp');
    expect(a.morph.Person).toBe('1,3'); // honest: imperfect 1sg/3sg are the same form
    const e = best(r, 'empecé');
    expect(e.lemma).toBe('empezar');
    expect(e.morph).toMatchObject({ Tense: 'Past', Aspect: 'Perf', Person: '1' });
  });

  it('records gender and number of lexicon nouns and articles', () => {
    const r = run('es', 'Las cosas y el pecado.');
    expect(best(r, 'cosas').morph).toMatchObject({ Gender: 'Fem', Number: 'Plur' });
    expect(best(r, 'pecado').morph).toMatchObject({ Gender: 'Masc', Number: 'Sing' });
    expect(best(r, 'Las').morph).toMatchObject({ Definite: 'Def', Gender: 'Fem', Number: 'Plur' });
  });

  it('splits clitics on a lexicon infinitive into notes, keeps the whole word as the form', () => {
    const r = run('es', 'Quiero entenderlo y perdonarnos.');
    const a = best(r, 'entenderlo');
    expect(a.lemma).toBe('entender');
    expect(a.notes).toMatchObject({ stem: 'entender', clitics: ['lo'] });
    expect(a.confidence).toBeLessThan(0.9);
    expect(r.tokens[indexOfToken(r, 'entenderlo')].normalized).toBe('entenderlo');
    expect(best(r, 'perdonarnos').notes).toMatchObject({ clitics: ['nos'] });
    expect(patterns('es', 'Quiero entenderlo.').map((p) => p.key)).toContain('enclitic-pronoun');
    // the word list now holds comprar, so the same rule applies to it; a stem the list does not hold is not guessed
    expect(best(run('es', 'comprarlo'), 'comprarlo')).toMatchObject({ lemma: 'comprar', notes: { clitics: ['lo'] } });
    for (const c of run('es', 'zapatearlo').analyses[0].candidates) expect(c.confidence).toBeLessThanOrEqual(0.6); // only a rule reading, never a confident one
    // the pieces of the word are reported with offsets inside it
    expect(best(r, 'entenderlo').parts).toEqual([
      expect.objectContaining({ text: 'entender', start: 0, end: 8, lemma: 'entender' }),
      expect.objectContaining({ text: 'lo', start: 8, end: 10 }),
    ]);
  });

  it('detects the three target phrases (also with a pronoun inside and in the Bible word order)', () => {
    expect(phrases('es', 'Cuando era joven, yo no entendía.').map((p) => p.pattern.join(' '))).toContain('cuando ser joven');
    expect(phrases('es', 'Cuando yo era joven, sí.').map((p) => p.pattern.join(' '))).toContain('cuando ser joven');
    expect(phrases('es', 'Un día empecé a entender mi pecado.').map((p) => p.pattern.join(' '))).toContain('empezar a entender');
    expect(phrases('es', 'Yo creía en Dios.').map((p) => p.pattern.join(' '))).toContain('creer en _');
    const bible = phrases('es', 'para que todo aquel que en él cree, no se pierda');
    expect(bible.map((p) => p.pattern.join(' '))).toContain('creer en _');
  });

  it('detects imperfect, preterite and personal a', () => {
    expect(patterns('es', 'Yo no creía en Dios.').map((p) => p.key)).toContain('imperfect');
    expect(patterns('es', 'Dios perdonó mi pecado.').map((p) => p.key)).toContain('preterite');
    expect(patterns('es', 'Yo amo a Dios.').map((p) => p.key)).toContain('personal-a');
  });

  it('segments sentences without splitting on abbreviations', () => {
    const t = 'Hola, Sr. López. ¿Cómo está? Bien.';
    expect(es.segmentSentences(t).map((s) => s.text)).toEqual(['Hola, Sr. López.', '¿Cómo está?', 'Bien.']);
  });

  it('search normalization ignores accents but not ñ', () => {
    expect(es.searchNormalize('Corazón')).toBe('corazon');
    expect(es.searchNormalize('Año')).toBe('año');
  });

  it('gives stress and letter notes', () => {
    const r = run('es', 'corazón');
    const p = es.pronunciation(r.tokens[0], r.analyses[0]);
    expect(p.notes?.join(' ')).toMatch(/accented vowel/);
  });

  describe('checkProduction', () => {
    it('flags article–noun gender disagreement with a suggestion', () => {
      const e = errors('es', 'la pecado');
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('agreement');
      expect(e[0].confidence).toBeGreaterThan(0.6);
      expect(applySuggestion('la pecado', e[0].suggestion!)).toBe('el pecado');
      expect(applySuggestion('Los casa', errors('es', 'Los casa')[0].suggestion!)).toBe('La casa');
    });
    it('flags yo + third-person verb, suggests the first-person form when the lexicon has it', () => {
      const e = errors('es', 'Yo tiene paz.');
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('conjugation');
      expect(applySuggestion('Yo tiene paz.', e[0].suggestion!)).toBe('Yo tengo paz.');
      // no first-person form known → still flagged, but no suggestion and lower confidence
      const e2 = errors('es', 'Yo da paz.');
      expect(e2[0].suggestion).toBeUndefined();
      expect(e2[0].confidence).toBeLessThan(0.7);
    });
    it('flags missing contractions', () => {
      const e = errors('es', 'Voy a el mundo.');
      expect(e[0].category).toBe('morphology');
      expect(applySuggestion('Voy a el mundo.', e[0].suggestion!)).toBe('Voy al mundo.');
    });
    it('stays silent on correct sentences and on unknown words', () => {
      for (const s of ['Yo no creo en Dios.', 'El pecado de Dios.', 'Yo tengo una casa.', 'Mi cacharro es el mejor.']) expect(errors('es', s)).toEqual([]);
    });
  });

  describe('speechNormalize', () => {
    it('expands numbers and abbreviations, strips verse markers, never transliterates', () => {
      const r = es.speechNormalize('Sr. López leyó [16] ¹⁶ 21 versículos y 2021 años, 100% seguro.', { isScripture: true });
      expect(r.speechText).toBe('señor López leyó veintiuno versículos y dos mil veintiuno años, cien por ciento seguro.');
      expect(r.normalizerVersion).toBe('speech-es@1');
      expect(r.transformations.length).toBeGreaterThan(2);
    });
    it('number words', () => {
      expect([0, 3, 16, 21, 22, 100, 101, 1000, 21000, 1999].map((n) => esNumberToWords(n))).toEqual([
        'cero', 'tres', 'dieciséis', 'veintiuno', 'veintidós', 'cien', 'ciento uno', 'mil', 'veintiún mil', 'mil novecientos noventa y nueve']);
      expect(esNumberToWords(1e7)).toBeNull();
    });
  });
});

function indexOfToken(r: ReturnType<typeof run>, surface: string) {
  return r.tokens.findIndex((t) => t.surface === surface);
}

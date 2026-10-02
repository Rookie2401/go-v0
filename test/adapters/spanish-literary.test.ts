/**
 * What a printed Spanish book of the 19th century has that the course texts do not (found by running Galdós' Marianela
 * through the import planner, scripts/probe-es-book.mts): a pronoun written after a conjugated verb (díjole, hallábase,
 * sentose), the accent of the older spelling on such words (oyóse, déme), italics marked with underscores, and the
 * dialogue dash written as two hyphens.
 *
 * Every word and sentence is written here; none comes from the book.
 */
import { describe, expect, it } from 'vitest';
import { esAdapter as es } from '../../src/adapters/es';
import { analyzeSpanishForm } from '../../src/adapters/spanish/morphology';

const KNOWN = new Set(['decir', 'hallar', 'oír', 'sentar', 'detener', 'dar', 'ver', 'ser', 'ir', 'pasar', 'rodar', 'levantar', 'creer', 'mirar', 'cantar']);
const read = (form: string) => analyzeSpanishForm(form, { knownLemma: (l) => KNOWN.has(l) });
const first = (text: string, surface: string) => {
  const tokens = es.tokenize(text);
  const analyzed = es.analyze(tokens);
  const i = tokens.findIndex((t) => t.surface === surface);
  expect(i, `${surface} in "${text}"`).toBeGreaterThanOrEqual(0);
  return analyzed[i].candidates[0];
};

describe('a pronoun after a conjugated verb (the engine)', () => {
  it('reads the verb and the pronoun where the accent shows the joint', () => {
    for (const [form, lemma, verb, pronouns] of [
      ['díjole', 'decir', 'díjo', ['le']], ['hallábase', 'hallar', 'hallába', ['se']], ['detúvose', 'detener', 'detúvo', ['se']],
      ['dijéronme', 'decir', 'dijéron', ['me']], ['creeríase', 'creer', 'creería', ['se']], ['díjoselo', 'decir', 'díjo', ['se', 'lo']],
      ['miráronse', 'mirar', 'miráron', ['se']],
    ] as const) {
      const r = read(form);
      expect(r.length, form).toBeGreaterThan(0);
      for (const a of r) {
        expect(a.lemma, form).toBe(lemma);
        expect(a.afterFinite, form).toBe(true);
        expect(a.confidence, form).toBe(0.6);
        expect(a.morph.VerbForm, form).toBe('Fin');
        expect(['Ind', 'Cnd'], form).toContain(a.morph.Mood);
        expect(a.parts!.map((p) => p.text), form).toEqual([verb, ...pronouns]);
        expect(a.rule, form).toMatch(/after a conjugated verb/);
      }
    }
  });

  it('reads it, lower, where today\'s spelling writes no accent (sentó + se = sentose)', () => {
    for (const [form, lemma] of [['sentose', 'sentar'], ['oyose', 'oír'], ['diome', 'dar'], ['viose', 'ver']] as const) {
      const r = read(form);
      expect(r.map((a) => a.lemma), form).toEqual([lemma]);
      expect(r[0].afterFinite, form).toBe(true);
      expect(r[0].confidence, form).toBe(0.5);
      expect(r[0].morph.Tense, form).toBe('Past');
    }
  });

  it('reads the older spelling, which keeps the verb\'s accent (oyóse, dióme), and says so', () => {
    for (const [form, lemma] of [['oyóse', 'oír'], ['dióme', 'dar'], ['sentóse', 'sentar']] as const) {
      const r = read(form);
      expect(r.map((a) => a.lemma), form).toEqual([lemma]);
      expect(r[0].afterFinite, form).toBe(true);
      expect(r[0].rule, form).toMatch(/accent of the older spelling/);
    }
    // a command in the older spelling is still a command, at the command's confidence
    const deme = read('déme');
    expect(deme).toHaveLength(1);
    expect(deme[0].morph.Mood).toBe('Imp');
    expect(deme[0].afterFinite).toBeUndefined();
    expect(deme[0].rule).toMatch(/accent of the older spelling/);
    expect(deme[0].parts!.map((p) => p.text)).toEqual(['dé', 'me']);
  });

  it('is not offered where the writing is a word the lexicon vouches for, or an ordinary verb with pronouns', () => {
    // fuese: the subjunctive of ser / ir, not fue + se
    expect(read('fuese').every((a) => !a.afterFinite && a.morph.Mood === 'Sub')).toBe(true);
    // dame, pásalo: commands
    for (const form of ['dame', 'pásalo']) expect(read(form).every((a) => !a.afterFinite && a.morph.Mood === 'Imp'), form).toBe(true);
    // an unaccented …os is a plural noun far more often than a verb + os: no reading "pasé + os", "rodé + os"
    for (const form of ['paseos', 'rodeos']) expect(read(form).some((a) => a.afterFinite), form).toBe(false);
  });

  it('"se" alone does not make a tú command: levántase is se levanta', () => {
    const r = read('levántase');
    expect(r).toHaveLength(1);
    expect(r[0].morph).toMatchObject({ Mood: 'Ind', Tense: 'Pres', Person: '3', Number: 'Sing' });
    expect(r[0].afterFinite).toBe(true);
    // with te it is the command, as before
    expect(read('levántate').map((a) => a.morph.Mood)).toEqual(['Imp']);
  });

  it('a lemma nobody vouched for is guessed this way only where the joint shows, or for a preterite in -ó with se / le / les / me / nos', () => {
    const none = (form: string) => analyzeSpanishForm(form, { knownLemma: () => false });
    expect(none('zurrábase').some((a) => a.afterFinite && a.lemma === 'zurrar')).toBe(true);
    expect(none('zurrose').some((a) => a.afterFinite && a.lemma === 'zurrar')).toBe(true);
    // pistola is not "pistó + la", manola is not "manó + la"
    for (const form of ['pistola', 'manola', 'canela']) expect(none(form).some((a) => a.afterFinite), form).toBe(false);
  });
});

describe('a pronoun after a conjugated verb (the adapter)', () => {
  it('is a reading from the shape of the word alone: shown with its parts and the word list\'s gloss, open to a dictionary\'s decision', () => {
    const c = first('Entonces díjole que no.', 'díjole');
    expect(c).toMatchObject({ lemma: 'decir', pos: 'VERB', unconfirmed: true, confidence: 0.6, origin: 'rule' });
    expect(c.gloss).toBeTruthy();
    expect(c.notes).toMatchObject({ enclisis: 'after a conjugated verb', lemmaStatus: 'in the word list' });
    expect(c.parts!.map((p) => [p.text, p.pos])).toEqual([['díjo', 'VERB'], ['le', 'PRON']]);
  });

  it('a word of the list keeps its reading: los paseos is the noun', () => {
    expect(first('Los paseos son largos.', 'paseos')).toMatchObject({ lemma: 'paseo', pos: 'NOUN' });
    expect(first('Fuese lo que fuese.', 'fuese').morph.Mood).toBe('Sub');
  });
});

describe('se + an indirect object after the verb (se me, se le)', () => {
  it('partiéndoseme, échesele: three parts, the verb reading unchanged', () => {
    for (const [form, verb, mood] of [['partiéndoseme', 'partiéndo', undefined], ['échesele', 'éche', 'Imp']] as const) {
      const c = first(`Y ${form} todo.`, form);
      expect(c.parts!.map((p) => p.text), form).toEqual([verb, 'se', form.slice(-2)]);
      expect(c.parts!.slice(1).map((p) => p.role), form).toEqual(['reflexive', 'indirect object pronoun']);
      expect(c.unconfirmed, form).toBeUndefined();
      if (mood) expect(c.morph.Mood, form).toBe(mood);
    }
    // se + lo keeps its roles: the indirect object written se, then the direct object
    expect(first('Quiero decírselo.', 'decírselo').parts!.slice(1).map((p) => p.role)).toEqual(['indirect object pronoun', 'direct object pronoun']);
  });

  it('representábasele: after a conjugated verb too', () => {
    const c = first('Entonces representábasele todo.', 'representábasele');
    expect(c).toMatchObject({ lemma: 'representar', unconfirmed: true });
    expect(c.parts!.map((p) => p.text)).toEqual(['representába', 'se', 'le']);
  });
});

describe('a word on no list, written with a capital inside the sentence', () => {
  it('is first guessed to be a name: a guess, without a gloss, below the line of "possibly"', () => {
    for (const [text, word] of [['La Zurbela salió temprano.', 'Zurbela'], ['Vino de Aldeazurba ayer.', 'Aldeazurba'], ['Dijo Zelipín que no.', 'Zelipín']] as const) {
      const c = first(text, word);
      expect(c, word).toMatchObject({ lemma: word, pos: 'PROPN', unconfirmed: true, confidence: 0.5, origin: 'rule' });
      expect(c.gloss, word).toBeUndefined();
      expect(c.notes?.rule, word).toMatch(/probably a name/);
    }
  });

  it('the guesses from its ending stay, after it and below it', () => {
    const tokens = es.tokenize('La Zurbela salió.');
    const cands = es.analyze(tokens)[1].candidates;
    expect(cands[0].pos).toBe('PROPN');
    expect(cands.length).toBeGreaterThan(1);
    expect(cands.slice(1).every((c) => c.unconfirmed === true && c.confidence < cands[0].confidence)).toBe(true);
  });

  it('not at the opening of a sentence, not for a word the list holds, not for a word in capitals', () => {
    expect(first('Zurbela salió temprano.', 'Zurbela')?.pos).not.toBe('PROPN');
    expect(first('—Zurbela salió.', 'Zurbela')?.pos).not.toBe('PROPN');
    expect(first('El Señor es bueno y la Iglesia también.', 'Iglesia')).toMatchObject({ lemma: 'iglesia', pos: 'NOUN' });
    expect(first('Dijo ZURBELA que no.', 'ZURBELA')?.pos).not.toBe('PROPN');
  });

  it('refine gives the same reading as analyze', () => {
    const tokens = es.tokenize('La Zurbela salió temprano.');
    const analyzed = es.analyze(tokens);
    const refined = es.refine!(tokens, analyzed, new Set([analyzed[0].analyzer]));
    expect(refined).toEqual(analyzed);
  });
});

describe('Roman numerals in running text', () => {
  it('Felipe II, el siglo XIX, Carlos V, Alfonso X: a number with its value', () => {
    for (const [text, word, value] of [['Felipe II reinó entonces.', 'II', 2], ['Era el siglo XIX.', 'XIX', 19], ['Carlos V lo supo.', 'V', 5], ['Alfonso X escribió.', 'X', 10], ['Luis XIV y el tomo XLII.', 'XLII', 42]] as const) {
      const c = first(text, word);
      expect(c, word).toMatchObject({ lemma: word, pos: 'NUM', gloss: `${value} (Roman numeral)`, origin: 'rule' });
      expect(c.unconfirmed, word).toBeUndefined();
    }
  });

  it('not a word of the list written in capitals, not an initial, not lower case', () => {
    expect(first('YO LO VI AYER.', 'VI')).toMatchObject({ lemma: 'ver', pos: 'VERB' });
    expect(first('Vino D. Juan.', 'D')?.pos).not.toBe('NUM');
    expect(first('Dijo C que no.', 'C')?.pos).not.toBe('NUM');
    expect(first('Dijo L que no.', 'L')?.pos).not.toBe('NUM');
    expect(first('Dijo xix que no.', 'xix')?.pos).not.toBe('NUM');
    expect(first('Dijo IIII que no.', 'IIII')?.pos).not.toBe('NUM');
  });
});

describe('old contractions (desta, deste, della) in running text', () => {
  it('stay "de + …" whatever stands before them: no guessed verb beside them to be put first', () => {
    for (const [text, word] of [
      ['No se desta manera.', 'desta'], ['Que deste modo se hace.', 'deste'], ['Y desta suerte lo dijo.', 'desta'], ['Me habló della ayer.', 'della'], ['Se rieron dellos.', 'dellos'],
    ] as const) {
      const tokens = es.tokenize(text);
      const cands = es.analyze(tokens)[tokens.findIndex((t) => t.surface === word)].candidates;
      expect(cands[0], text).toMatchObject({ lemma: 'de', pos: 'ADP' });
      expect(cands[0].unconfirmed, text).toBeUndefined();
      expect(cands.some((c) => c.unconfirmed === true), text).toBe(false);
      expect(cands[0].parts?.map((p) => p.text).join('+'), text).toBe(`de+${word.slice(2)}`);
    }
  });
});

describe('plain-text editions: italics in underscores, the dash as two hyphens', () => {
  it('an underscore at the edge of a word is a mark of its own, never part of the word; offsets stay exact', () => {
    const text = 'Dijo _adelante_, _siempre adelante_ y nada más.';
    const tokens = es.tokenize(text);
    for (const t of tokens) expect(text.slice(t.start, t.end)).toBe(t.surface);
    expect(tokens.filter((t) => t.isWord).map((t) => t.surface)).toEqual(['Dijo', 'adelante', 'siempre', 'adelante', 'y', 'nada', 'más']);
    expect(tokens.filter((t) => t.surface === '_')).toHaveLength(4);
    expect(tokens.filter((t) => t.surface === '_').every((t) => !t.isWord)).toBe(true);
    expect(first(text, 'adelante')).toMatchObject({ lemma: 'adelante', pos: 'ADV' });
  });

  it('an underscore inside a word stays in it', () => {
    const tokens = es.tokenize('El archivo mi_nota existe.');
    expect(tokens.map((t) => t.surface)).toContain('mi_nota');
  });

  it('--pregunta Marvin: the reporting verb after a dash written as two hyphens', () => {
    expect(first('--¿Quién es?--pregunta Marvin.', 'pregunta')).toMatchObject({ lemma: 'preguntar', pos: 'VERB' });
    // the same sentence with the real dash, as before
    expect(first('—¿Quién es? —pregunta Marvin.', 'pregunta')).toMatchObject({ lemma: 'preguntar', pos: 'VERB' });
    // and a single hyphen is not a dash: la pregunta stays the noun after an article
    expect(first('Esa es la pregunta.', 'pregunta')).toMatchObject({ lemma: 'pregunta', pos: 'NOUN' });
  });

  it('a reporting clause after "?--" stays in the sentence of the question', () => {
    const text = '--¿Quién es?--preguntó Marvin. Nadie contestó.';
    const spans = es.segmentSentences(text);
    expect(spans.map((s) => s.text)).toEqual(['--¿Quién es?--preguntó Marvin.', 'Nadie contestó.']);
  });
});

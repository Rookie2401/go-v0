/**
 * How the adapter uses the morphology engine, tested against a stand-in for it (spanish-engine-double.ts): the order
 * of the layers, provenance, confidence, parts, varieties, older spelling. Not what the real engine says about a form
 * (spanish-real-engine.test.ts does that when the engine is in).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/adapters/spanish/morphology', async () => await import('./spanish-engine-double'));

import { esAdapter, ES_SOURCE_IDS } from '../../src/adapters/es';
import { run } from './helpers';

const cands = (w: string) => run('es', w).analyses[0].candidates;
const one = (w: string, lemma: string, pos?: string) => cands(w).find((c) => c.lemma === lemma && (!pos || c.pos === pos));

describe('Spanish adapter wiring: hand lexicon → engine → nothing', () => {
  it('a hand hit is first and is labelled hand; the engine is not asked to overrule it', () => {
    expect(cands('madre')[0]).toMatchObject({ lemma: 'madre', origin: 'hand', sourceId: ES_SOURCE_IDS.hand });
    expect(cands('es')).toHaveLength(1);
    expect(one('es', 'ser')).toMatchObject({ origin: 'hand', confidence: expect.any(Number) });
    // libros is listed by hand as well as readable by the rules: one reading, not two
    expect(cands('libros')).toHaveLength(1);
    expect(cands('libros')[0].origin).toBe('hand');
  });

  it('a form the lexicon lacks goes to the engine: rule origin, rules source, a confirmed lemma at 0.8 or more, with a gloss', () => {
    const c = one('habla', 'hablar')!;
    expect(c).toMatchObject({ pos: 'VERB', origin: 'rule', sourceId: ES_SOURCE_IDS.rules, gloss: 'to speak, talk' });
    expect(c.confidence).toBeGreaterThanOrEqual(0.8);
    expect(c.notes).toMatchObject({ source: 'rule', lemmaStatus: 'in the word list' });
    expect(c.morph).toMatchObject({ Person: '3', Number: 'Sing', Tense: 'Pres' });
  });

  it('knownLemma is answered from the lexicon: an unknown lemma stays at 0.6 or less and says so, with no gloss', () => {
    const c = one('zapatear', 'zapatear')!;
    expect(c.confidence).toBeLessThanOrEqual(0.6);
    expect(c.notes).toMatchObject({ lemmaStatus: 'inferred by the rules' });
    expect(c.gloss).toBeUndefined();
    expect(c).toMatchObject({ origin: 'rule', sourceId: ES_SOURCE_IDS.rules });
    expect(c.sourceId).toBe('adapter-es@4:rules');
  });

  it('nothing the engine and the lexicon both lack is guessed; non-words and punctuation have no candidates', () => {
    expect(cands('zzyzx')).toEqual([]);
    expect(cands('entendia')).toEqual([]);
    const r = run('es', 'Hola, Ana.');
    expect(r.analyses[1].candidates).toEqual([]);
  });

  it('several readings are all returned, best first', () => {
    const c = cands('hablamos');
    expect(c).toHaveLength(2);
    expect(c.map((x) => x.morph.Tense).sort()).toEqual(['Past', 'Pres']);
    expect(cands('fue').map((x) => x.lemma).sort()).toEqual(['ir', 'ser']);
  });

  it('a content word in the list and a verb form the engine reads: the list reading is first, capped at 0.75, the other follows below it', () => {
    const c = cands('casa');
    expect(c.map((x) => `${x.lemma}/${x.pos}`)).toEqual(['casa/NOUN', 'casar/VERB']);
    expect(c[0].confidence).toBeLessThanOrEqual(0.75);
    expect(c[1].confidence).toBeLessThan(c[0].confidence);
    expect(c[0].origin).toBe('hand');
    expect(c[1].origin).toBe('rule');
  });

  it('a closed-class word does not give way to a verb reading (para, not parar), except the few that are both (como)', () => {
    expect(cands('para').map((x) => x.lemma)).toEqual(['para']);
    const como = cands('como');
    expect(como.map((x) => x.lemma)).toEqual(['como', 'comer']);
    expect(como[0].confidence).toBeLessThanOrEqual(0.75);
  });

  it('nouns and adjectives the engine inflects are glossed from the lexicon', () => {
    expect(one('grandes', 'grande')).toMatchObject({ pos: 'ADJ', gloss: 'big, large; great', origin: 'rule' });
    expect(one('buena', 'bueno')?.morph).toMatchObject({ Gender: 'Fem', Number: 'Sing' });
    expect(cands('tardes')[0]).toMatchObject({ lemma: 'tarde', pos: 'NOUN' });
  });
});

describe('Spanish adapter wiring: parts, varieties', () => {
  it('attached pronouns come as parts that tile the word', () => {
    const r = run('es', 'decírselo');
    const c = r.analyses[0].candidates[0];
    expect(c).toMatchObject({ lemma: 'decir', pos: 'VERB' });
    expect(c.parts!.map((p) => p.text)).toEqual(['decír', 'se', 'lo']);
    expect(c.parts!.map((p) => p.role)).toEqual([undefined, 'indirect object pronoun', 'direct object pronoun']);
    expect(c.parts!.map((p) => 'decírselo'.slice(p.start, p.end))).toEqual(['decír', 'se', 'lo']);
    expect(c.parts!.map((p) => p.text).join('')).toBe('decírselo');
  });

  it('a lexicon infinitive with a pronoun keeps its own parts when the engine says nothing about it', () => {
    const c = cands('entenderlo')[0];
    expect(c.parts!.map((p) => p.text)).toEqual(['entender', 'lo']);
    expect(c.origin).toBe('rule');
    expect(c.notes).toMatchObject({ stem: 'entender', clitics: ['lo'] });
  });

  it('comprarlo: the engine settles it (parts with a role), the list knows the verb', () => {
    const c = cands('comprarlo')[0];
    expect(c).toMatchObject({ lemma: 'comprar', gloss: 'to buy' });
    expect(c.notes).toMatchObject({ clitics: ['lo'] });
    expect(c.parts!.map((p) => p.role)).toEqual([undefined, 'direct object pronoun']);
  });

  it('voseo and vosotros forms keep their variety tags; the form is never reported as the learner default', () => {
    expect(one('tenés', 'tener')?.varieties).toEqual(['voseo']);
    expect(one('hablás', 'hablar')?.varieties).toEqual(['voseo']);
    expect(one('tenéis', 'tener')?.varieties).toEqual(['vosotros']);
    expect(one('hablad', 'hablar')?.varieties).toEqual(['vosotros']);
  });

  it('a regional lemma passes its tag to the forms the engine reads', () => {
    expect(one('manejo', 'manejar')?.varieties).toEqual(['es-419']);
    expect(one('habla', 'hablar')?.varieties).toBeUndefined();
  });

  it('hubiéramos and the other forms of the spec reach the sheet as engine readings', () => {
    expect(one('hubiéramos', 'haber')?.morph).toMatchObject({ Mood: 'Sub', Tense: 'Imp', Person: '1', Number: 'Plur' });
  });
});

describe('Spanish adapter wiring: older spelling is recognised, never normalised', () => {
  const hist = (w: string) => {
    const r = run('es', w);
    expect(r.tokens[0].surface).toBe(w); // the text is the text
    return r.analyses[0].candidates;
  };

  it('á é ó as a, e, o: the modern lemma, es-hist, notes.modern, lower confidence', () => {
    for (const [old, lemma, pos] of [['á', 'a', 'ADP'], ['é', 'e', 'CONJ'], ['ó', 'o', 'CONJ']] as const) {
      const c = hist(old).find((x) => x.lemma === lemma && x.pos === pos)!;
      expect(c, old).toBeDefined();
      expect(c.varieties).toEqual(['es-hist']);
      expect(c.register).toContain('historical');
      expect(c.notes).toMatchObject({ modern: lemma, source: 'rule' });
      expect(c.confidence).toBeLessThanOrEqual(0.7);
      expect(c.origin).toBe('rule');
    }
  });

  it('fué, dió: the accent monosyllable; the engine reads the modern form', () => {
    expect(hist('fué').map((c) => c.lemma).sort()).toEqual(['ir', 'ser']);
    expect(hist('fué')[0]).toMatchObject({ varieties: ['es-hist'], notes: { modern: 'fue' } });
    expect(hist('dió')[0]).toMatchObject({ lemma: 'dar', notes: { modern: 'dio' } });
  });

  it('x for j (dixo, baxo), ç (coraçon), qua- (quatro), vn / vna, ss (assi)', () => {
    expect(hist('dixo')[0]).toMatchObject({ lemma: 'decir', varieties: ['es-hist'], notes: { modern: 'dijo', historical: 'x for j' } });
    expect(hist('baxo').some((c) => c.lemma === 'bajo' && c.notes?.modern === 'bajo')).toBe(true);
    expect(hist('coraçon')[0]).toMatchObject({ lemma: 'corazón', notes: { modern: 'corazón' } });
    expect(String(hist('coraçon')[0].notes?.historical)).toMatch(/accent restored/);
    expect(hist('quatro')[0]).toMatchObject({ lemma: 'cuatro', pos: 'NUM' });
    expect(hist('vn')[0]).toMatchObject({ lemma: 'un', notes: { modern: 'un' } });
    expect(hist('vna')[0]).toMatchObject({ lemma: 'una', notes: { modern: 'una' } });
    expect(hist('assi')[0]).toMatchObject({ lemma: 'así', notes: { modern: 'así' } });
  });

  it('f- for h- (fazer → hacer) needs two changes and says so; the confidence is lower again', () => {
    const c = hist('fazer')[0];
    expect(c).toMatchObject({ lemma: 'hacer', notes: { modern: 'hacer' } });
    expect(c.confidence).toBeLessThanOrEqual(0.5);
    expect(String(c.notes?.historical)).toMatch(/f- for h-.*z before e or i for c/);
  });

  it('i for j (iamas), agora, mesmo', () => {
    expect(hist('iamas')[0]).toMatchObject({ lemma: 'jamás', notes: { modern: 'jamás' } });
    expect(hist('agora')[0]).toMatchObject({ lemma: 'ahora' });
    expect(hist('mesmo')[0]).toMatchObject({ lemma: 'mismo' });
  });

  it('old contractions: deste = de este, dél = de él, as two parts', () => {
    const c = hist('deste')[0];
    expect(c.parts!.map((p) => [p.text, p.start, p.end, p.lemma])).toEqual([['de', 0, 2, 'de'], ['ste', 2, 5, 'este']]);
    expect(c.notes).toMatchObject({ modern: 'de este' });
    expect(hist('dél')[0].parts!.map((p) => p.lemma)).toEqual(['de', 'él']);
  });

  it('the future subjunctive of the list is older Spanish whoever produced it', () => {
    const c = hist('dijéremos')[0];
    expect(c).toMatchObject({ lemma: 'decir', varieties: ['es-hist'] });
    expect(c.register).toContain('historical');
  });

  it('a modern word is never taken for an old one; an unaccented modern word stays unanalysed', () => {
    expect(hist('fijo')).toEqual([]); // not hijo
    expect(hist('fallo')).toEqual([]);
    expect(hist('corazon')).toEqual([]);
    expect(hist('exacto')).toEqual([]);
    expect(hist('casa')[0].varieties).toBeUndefined();
  });

  it('a rewrite that gives nothing the adapter knows gives nothing', () => {
    expect(hist('xyzzy')).toEqual([]);
    expect(hist('çzx')).toEqual([]);
  });

  it('relate follows older spelling and engine readings to the lemma', () => {
    expect(esAdapter.relate('dixo', 'decir')).toBe('inflection');
    expect(esAdapter.relate('á', 'a')).toBe('inflection');
    expect(esAdapter.relate('hablamos', 'hablar')).toBe('inflection');
    expect(esAdapter.relate('Él', 'el')).toBe('none');
    expect(esAdapter.relate('mesa', 'silla')).toBe('none');
  });
});

describe('Spanish adapter wiring: morphFromTags and describeMorph', () => {
  it('dictionary tags become features; unknown tags are ignored, not guessed', () => {
    expect(esAdapter.morphFromTags!(['first-person', 'plural', 'imperfect', 'subjunctive'])).toEqual({ VerbForm: 'Fin', Person: '1', Number: 'Plur', Tense: 'Imp', Mood: 'Sub' });
    expect(esAdapter.morphFromTags!(['feminine', 'singular'])).toEqual({ Gender: 'Fem', Number: 'Sing' });
    expect(esAdapter.morphFromTags!(['past', 'participle', 'masculine'])).toEqual({ VerbForm: 'Part', Gender: 'Masc' }); // "past" belongs to the participle: not a finite tense
    expect(esAdapter.morphFromTags!(['preterite', 'third-person', 'singular'])).toEqual({ Tense: 'Past', Person: '3', Number: 'Sing' });
    expect(esAdapter.morphFromTags!(['obsolete', 'dialectal'])).toEqual({});
    expect(esAdapter.morphFromTags!([])).toEqual({});
  });

  it('describeMorph is the engine\'s', () => {
    expect(esAdapter.describeMorph!({ Person: '1', Number: 'Plur' })).toBe('double: Person=1 Number=Plur');
  });
});

describe('Spanish adapter wiring: offsets and sentences keep round-tripping with the engine on', () => {
  it('every token slices the sentence exactly, whatever the analysis says', () => {
    const text = 'Vos tenés razón, decírselo es dificil. ¿Qué dixo el señor? ¡Fué á casa!';
    for (const s of esAdapter.segmentSentences(text)) {
      expect(text.slice(s.start, s.end)).toBe(s.text);
      const toks = esAdapter.tokenize(s.text);
      for (const t of toks) expect(s.text.slice(t.start, t.end)).toBe(t.surface);
      const an = esAdapter.analyze(toks);
      expect(an).toHaveLength(toks.length);
      an.forEach((a, i) => { if (!toks[i].isWord) expect(a.candidates).toEqual([]); });
    }
  });
});

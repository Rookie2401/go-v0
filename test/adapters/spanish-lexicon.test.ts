/**
 * The Spanish hand lexicon: every entry analyses, the closed classes are complete, regional words are tagged both ways,
 * nothing is listed twice. These tests read the adapter as it ships and do not depend on the morphology engine.
 */
import { describe, expect, it } from 'vitest';
import { esAdapter, esLexicon, esLexiconProblems, esLexiconStats, ES_SOURCE_IDS } from '../../src/adapters/es';
import { ES_VARIETIES, ES_VARIETY_CODES, REGIONAL_PAIRS } from '../../src/adapters/spanish/varieties';
import { buildRows, parseRows } from '../../src/adapters/spanish/entries';
import { run } from './helpers';

const cands = (w: string) => run('es', w).analyses[0].candidates;
const reading = (w: string, lemma: string, pos?: string) => cands(w).find((c) => c.lemma === lemma && (!pos || c.pos === pos));

describe('Spanish lexicon: size and integrity', () => {
  it('holds about 1,500 lemmas or more, none listed twice', () => {
    expect(esLexiconStats.lemmas).toBeGreaterThanOrEqual(1500);
    expect(esLexiconStats.duplicates).toEqual([]);
    expect(esLexiconStats.byPos.VERB).toBeGreaterThanOrEqual(330);
    expect(esLexiconStats.byPos.NOUN).toBeGreaterThanOrEqual(550);
    expect(esLexiconStats.byPos.ADJ).toBeGreaterThanOrEqual(180);
  });

  it('every entry has a gloss, and every form analyses back to its own lemma and part of speech', () => {
    const bad: string[] = [];
    for (const e of esLexicon.entries) {
      if (!e.gloss.trim() || /\.$/.test(e.gloss) || /[A-Z]{3}/.test(e.gloss)) bad.push(`${e.lemma}: gloss`);
      for (const f of e.forms) {
        if (!cands(f.form).some((c) => c.lemma === e.lemma && c.pos === e.pos)) bad.push(`${f.form} → ${e.lemma}/${e.pos}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('verbs are infinitives with an infinitive form; nouns carry a gender; adjectives in -o are masculine singular', () => {
    for (const e of esLexicon.entries) {
      if (e.pos === 'VERB') {
        expect(e.lemma, e.lemma).toMatch(/(ar|er|ir|ír)$/u);
        expect(e.forms.some((f) => f.morph.VerbForm === 'Inf'), e.lemma).toBe(true);
      }
      if (e.pos === 'NOUN') expect(e.forms.every((f) => f.morph.Gender !== undefined), e.lemma).toBe(true);
      if (e.pos === 'ADJ' && e.lemma.endsWith('o')) expect(e.forms[0].morph.Gender, e.lemma).toBe('Masc');
    }
  });

  it('the row format refuses a malformed line instead of dropping a word', () => {
    expect(() => parseRows('# NOUN\ncasa/f: house')).toThrow(/lemma = gloss/);
    expect(() => parseRows('# NOUN\ncasa/f = house [es-XX!]')).toThrow(/unknown tag/);
    expect(() => parseRows('casa/f = house')).toThrow(/before any section/);
    expect(() => parseRows('# NOPE\n')).toThrow(/unknown part of speech/);
    expect(parseRows('# NOUN\ncobija/f = blanket [es-419 colloquial]')[0]).toMatchObject({ lemma: 'cobija', gender: 'f', varieties: ['es-419'], register: ['colloquial'] });
  });

  it('every row of the word-list files is read: no row was skipped as malformed', () => {
    // a broken row fails here, by file and line, and not the loading of the adapter (and with it of every language)
    expect(esLexiconProblems).toEqual([]);
  });

  it('given a list to report to, the row reader skips a bad row, says where and what, and keeps the good ones', () => {
    const problems: string[] = [];
    const rows = parseRows('# NOUN\ncasa/f = house\nmesa/f: table\nsilla/f =chair\n# NOPE\nperro/m = dog\n# ADJ\nrojo = red [es-XX!]\nverde = green', 'sample', problems);
    expect(rows.map((r) => r.lemma)).toEqual(['casa', 'verde']);
    expect(problems).toEqual([
      'sample:3: expected "lemma = gloss"',
      'sample:4: expected "lemma = gloss"',
      'sample:5: unknown part of speech "NOPE"',
      'sample:6: a row before any section header', // the lines under a bad header are not filed under the section before it
      'sample:8: unknown tag "es-XX!"',
    ]);
    // forms that cannot be built are reported too, and the other rows are built
    const built = buildRows(parseRows('# DET\neste = this | este:m sg dem\n# NOUN\ncasa/f = house', 'sample'), new Set(), problems);
    expect(built.entries.map((e) => e.lemma)).toEqual(['este', 'casa']);
    expect(problems).toHaveLength(5);
  });

  it('the older hand paradigms still work and the lexicon keeps them first', () => {
    expect(reading('entendí', 'entender')?.morph).toMatchObject({ Tense: 'Past', Aspect: 'Perf', Person: '1' });
    expect(reading('tenga', 'tener')?.morph).toMatchObject({ Mood: 'Sub' });
    expect(reading('hay', 'haber')?.morph).toMatchObject({ Person: '3', Number: 'Sing' });
    expect(reading('aquellas', 'aquel')?.morph).toMatchObject({ Gender: 'Fem', Number: 'Plur' });
    expect(esLexicon.entries[0].lemma).toBe('ser');
  });

  it('an entry with the same lemma and part of speech as the older list is not added twice', () => {
    const tener = esLexicon.entries.filter((e) => e.lemma === 'tener');
    expect(tener).toHaveLength(1);
    expect(cands('tener')).toHaveLength(1);
    expect(cands('tener')[0].confidence).toBeGreaterThan(0.9);
  });
});

describe('Spanish lexicon: the closed classes are complete', () => {
  const must: Record<string, string[]> = {
    DET: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'vuestro', 'vuestras', 'este', 'esta', 'esto', 'estos', 'estas',
      'ese', 'esa', 'eso', 'esos', 'esas', 'cada', 'otro', 'otra', 'otros', 'otras', 'varios', 'algún', 'alguna', 'algunos', 'ningún', 'ninguna', 'mucho', 'mucha', 'muchos', 'muchas',
      'poco', 'poca', 'pocos', 'pocas', 'todo', 'toda', 'todos', 'todas', 'cualquier', 'ambos', 'cuánto', 'cuántas', 'cuyo', 'mío', 'tuya', 'suyos'],
    PRON: ['yo', 'tú', 'vos', 'usted', 'ustedes', 'él', 'ella', 'nosotros', 'nosotras', 'vosotros', 'vosotras', 'ellos', 'ellas', 'me', 'te', 'lo', 'le', 'nos', 'os', 'se', 'les',
      'mí', 'ti', 'conmigo', 'contigo', 'algo', 'alguien', 'nadie', 'nada', 'qué', 'quién', 'quiénes', 'cuál', 'cuáles', 'quien', 'cual', 'aquel'],
    ADP: ['a', 'ante', 'bajo', 'con', 'contra', 'de', 'desde', 'durante', 'en', 'entre', 'hacia', 'hasta', 'para', 'por', 'según', 'sin', 'sobre', 'tras', 'al', 'del'],
    CONJ: ['y', 'e', 'o', 'u', 'ni', 'pero', 'sino', 'pues'],
    SCONJ: ['que', 'si', 'porque', 'cuando', 'aunque', 'mientras', 'como'],
    ADV: ['dónde', 'cuándo', 'cómo', 'donde', 'aquí', 'allí', 'ahí', 'ahora', 'hoy', 'ayer', 'siempre', 'nunca', 'ya', 'muy', 'más', 'menos', 'también', 'tampoco', 'bien', 'mal', 'no'],
    NUM: ['cero', 'uno', 'dos', 'tres', 'diez', 'once', 'quince', 'veinte', 'veintiuno', 'treinta', 'noventa', 'cien', 'ciento', 'doscientas', 'quinientos', 'mil', 'millón'],
  };
  for (const [pos, words] of Object.entries(must)) {
    it(`${pos}: ${words.length} words`, () => {
      const missing = words.filter((w) => !cands(w).some((c) => c.pos === pos));
      expect(missing).toEqual([]);
    });
  }

  it('vos, vosotros and their forms carry the variety tag; usted(es) and tú do not', () => {
    for (const w of ['vos']) expect(reading(w, 'vos')?.varieties).toEqual(['voseo']);
    for (const w of ['vosotros', 'vosotras', 'os', 'vuestro', 'vuestra']) expect(cands(w)[0].varieties, w).toEqual(['vosotros']);
    for (const w of ['usted', 'ustedes', 'tú', 'nosotros']) expect(cands(w)[0].varieties, w).toBeUndefined();
  });

  it('gender, number and person of pronouns and determiners are recorded', () => {
    expect(reading('ella', 'ella')?.morph).toMatchObject({ Person: '3', Number: 'Sing', Gender: 'Fem' });
    expect(reading('vosotros', 'vosotros')?.morph).toMatchObject({ Person: '2', Number: 'Plur' });
    expect(reading('usted', 'usted')?.morph).toMatchObject({ Polite: 'Form' });
    expect(reading('muchas', 'mucho', 'DET')?.morph).toMatchObject({ Gender: 'Fem', Number: 'Plur' });
    expect(reading('esas', 'ese')?.morph).toMatchObject({ PronType: 'Dem', Gender: 'Fem', Number: 'Plur' });
  });

  it('mucho and tarde keep both readings; the neighbour decides which comes first', () => {
    const adv = run('es', 'Ella habla mucho.');
    expect(adv.analyses[2].candidates[0].pos).toBe('ADV');
    const det = run('es', 'Ella tiene mucho dinero.');
    const i = det.tokens.findIndex((t) => t.surface === 'mucho');
    expect(det.analyses[i].candidates[0].pos).toBe('DET');
    expect(run('es', 'por la tarde').analyses[2].candidates[0].pos).toBe('NOUN');
    expect(run('es', 'Llegó tarde.').analyses[1].candidates[0].pos).toBe('ADV');
    // both list readings stay available, first; any further reading comes from the rules (a verb form of tardar for tarde)
    for (const [w, pair] of [['mucho', ['ADV', 'DET']], ['tarde', ['ADV', 'NOUN']]] as const) {
      const c = cands(w);
      expect(c.filter((x) => x.origin === 'hand').map((x) => x.pos).sort(), w).toEqual(pair);
      expect(c.slice(0, 2).every((x) => x.origin === 'hand'), w).toBe(true);
      for (const extra of c.slice(2)) expect(extra.origin, w).toBe('rule');
    }
  });

  it('al and del are two parts, with offsets inside the word', () => {
    const al = reading('al', 'al')!;
    expect(al.parts).toEqual([
      expect.objectContaining({ text: 'a', start: 0, end: 1, lemma: 'a', pos: 'ADP' }),
      expect.objectContaining({ text: 'l', start: 1, end: 2, lemma: 'el', pos: 'DET' }),
    ]);
    const del = cands('del')[0];
    expect(del.parts?.map((p) => [p.text, p.start, p.end, p.lemma])).toEqual([['de', 0, 2, 'de'], ['l', 2, 3, 'el']]);
  });
});

describe('Spanish lexicon: regional words, both ways', () => {
  it('every regional pair is listed on both sides: a tagged word has its tag, a general word has none', () => {
    for (const pair of REGIONAL_PAIRS) {
      expect(pair.forms.length, pair.concept).toBeGreaterThanOrEqual(2);
      for (const f of pair.forms) {
        const v = cands(f.lemma)[0]?.varieties;
        if (f.variety) expect(v, `${pair.concept}: ${f.lemma}`).toContain(f.variety);
        else expect(v, `${pair.concept}: ${f.lemma} is general Spanish`).toBeUndefined();
      }
    }
    const tagged = REGIONAL_PAIRS.flatMap((p) => p.forms).filter((f) => f.variety);
    expect(tagged.filter((f) => f.variety === 'es-ES').length).toBeGreaterThanOrEqual(4);
    expect(tagged.filter((f) => f.variety !== 'es-ES').length).toBeGreaterThanOrEqual(10);
  });

  it('es-ES is only for words that are not in ordinary use in Latin America; general words with a Latin American alternative carry a note, not a tag', () => {
    const v = (w: string) => cands(w)[0].varieties;
    for (const w of ['ordenador', 'zumo', 'patata', 'móvil']) expect(v(w), w).toEqual(['es-ES']);
    for (const w of ['coche', 'conducir', 'coger', 'gafas', 'melocotón', 'alubia', 'cacahuete', 'gamba', 'pajita', 'enfadado', 'enfadar', 'aparcar']) expect(v(w), w).toBeUndefined();
    for (const e of esLexicon.entries) if (e.forms.length && (cands(e.forms[0].form)[0]?.varieties ?? []).includes('es-ES')) expect(['ordenador', 'zumo', 'patata', 'móvil']).toContain(e.lemma);
    expect(cands('coche')[0].gloss).toMatch(/Latin America/);
    expect(cands('conducir')[0].gloss).toMatch(/general Spanish/);
    expect(cands('coger')[0].gloss).toMatch(/vulgar sense/);
    expect(cands('coger')[0].gloss).not.toMatch(/Hondura/);
  });

  it('the named examples: computadora / ordenador, carro / coche, jugo / zumo, celular / móvil, manejar / conducir, papa / patata', () => {
    const v = (w: string) => cands(w)[0].varieties;
    expect([v('ordenador'), v('computadora')]).toEqual([['es-ES'], ['es-419']]);
    expect([v('coche'), v('carro')]).toEqual([undefined, ['es-419']]);
    expect([v('zumo'), v('jugo')]).toEqual([['es-ES'], ['es-419']]);
    expect([v('móvil'), v('celular')]).toEqual([['es-ES'], ['es-419']]);
    expect([v('conducir'), v('manejar')]).toEqual([undefined, ['es-419']]);
    expect([v('patata'), v('papa')]).toEqual([['es-ES'], ['es-419']]);
  });

  it('Honduran and Central American words carry es-HN or es-CA; informal ones are marked colloquial, not slang', () => {
    for (const w of ['cipote', 'catracho', 'baleada', 'lempira']) expect(cands(w)[0].varieties, w).toEqual(['es-HN']);
    for (const w of ['pulpería', 'pisto', 'chele', 'lapicero']) expect(cands(w)[0].varieties, w).toEqual(['es-CA']);
    for (const w of ['cipote', 'catracho', 'pisto', 'chele']) expect(cands(w)[0].register, w).toEqual(['colloquial']);
    expect(cands('baleada')[0].register).toBeUndefined();
    for (const e of esLexicon.entries) expect(cands(e.forms[0].form).some((c) => c.register?.includes('slang')), e.lemma).toBe(false);
  });

  it('an ordinary word has no variety tag', () => {
    for (const w of ['casa', 'madre', 'comer', 'bueno', 'hoy', 'perro']) expect(cands(w)[0].varieties, w).toBeUndefined();
  });

  it('tags are known codes; counts by variety are what the lexicon claims', () => {
    for (const code of Object.keys(esLexiconStats.byVariety)) expect(ES_VARIETY_CODES).toContain(code);
    expect(esLexiconStats.byVariety['es-HN']).toBeGreaterThanOrEqual(6);
    expect(esLexiconStats.byVariety['es-CA']).toBeGreaterThanOrEqual(4);
    expect(esLexiconStats.byVariety['es-419']).toBeGreaterThanOrEqual(15);
    expect(esLexiconStats.byVariety['es-ES']).toBe(4);
    expect(esLexiconStats.byVariety.voseo).toBe(1); // only the pronoun vos; the verb forms are tagged by the morphology engine
  });

  it('a variety of the adapter is defined for every code, and the Honduran target sits inside Central America and Latin America', () => {
    expect(esAdapter.varieties).toBe(ES_VARIETIES);
    for (const code of ['es-HN', 'es-CA', 'es-419', 'es-MX', 'es-CAR', 'es-AND', 'es-AR', 'es-ES', 'es-hist', 'voseo', 'vosotros']) expect(esAdapter.varieties![code]?.code).toBe(code);
    expect(esAdapter.varieties!['es-HN'].parent).toBe('es-CA');
    expect(esAdapter.varieties!['es-CA'].parent).toBe('es-419');
    expect(esAdapter.varieties!['es-hist'].kind).toBe('historical');
    expect(esAdapter.varieties!.voseo.kind).toBe('feature');
  });
});

describe('Spanish adapter: provenance', () => {
  it('every candidate says where it came from; all sources are machine-drafted', () => {
    const r = run('es', 'Yo amo a mi madre y entenderlo.');
    for (const a of r.analyses) for (const c of a.candidates) {
      expect(['hand', 'rule']).toContain(c.origin);
      expect(Object.keys(esAdapter.sources!)).toContain(c.sourceId);
    }
    expect(cands('madre')[0]).toMatchObject({ origin: 'hand', sourceId: ES_SOURCE_IDS.hand });
    expect(Object.values(esAdapter.sources!).every((s) => s.reviewStatus === 'machine-drafted')).toBe(true);
    expect(esAdapter.sources![ES_SOURCE_IDS.hand].origin).toBe('hand');
    expect(esAdapter.sources![ES_SOURCE_IDS.rules].origin).toBe('rule');
    expect(ES_SOURCE_IDS.hand).toBe('adapter-es@7:hand');
  });

  it('the support record is honest: seed-only lemmatization, nothing dependable beyond tokenization, limits stated', () => {
    const s = esAdapter.support;
    expect(s.lemmatization).toBe('seed-only');
    for (const k of ['sentenceSegmentation', 'lemmatization', 'morphology', 'phraseDetection', 'productionChecks'] as const) expect(s[k]).not.toBe('dependable');
    expect(s.limitations.join(' ')).toMatch(/machine-drafted/);
    expect(s.limitations.join(' ')).toMatch(/not been checked by a native speaker/);
    expect(s.limitations.join(' ')).toMatch(/inferred/);
  });
});

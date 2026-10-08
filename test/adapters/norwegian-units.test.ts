/**
 * Particle verbs as multiword units, and the inseparable prefixes. The expectations are MACHINE-DRAFTED, pending native review
 * (written by the model that built the analyzer; not checked by a native speaker).
 */
import { describe, expect, it } from 'vitest';
import { NB_UNITS, findUnits } from '../../src/adapters/norwegian/units';
import { adapter, run } from './helpers';

const unitOf = (lang: 'nb' | 'nn', text: string) => {
  const r = run(lang, text);
  return r.analyses.map((a) => a.candidates[0]).map((c, i) => ({ i, surface: r.tokens[i].surface, lemma: c?.lemma, pos: c?.pos, unit: c?.unit, confidence: c?.confidence }));
};

describe('particle verbs (units)', () => {
  it('stå opp: both pieces carry the unit lemma, the verb is the head', () => {
    const u = unitOf('nb', 'Jeg står opp klokka sju.');
    expect(u[1]).toMatchObject({ lemma: 'stå opp', pos: 'VERB' });
    expect(u[2]).toMatchObject({ lemma: 'stå opp', pos: 'ADV' });
    expect(u[1].unit).toMatchObject({ head: 1, pieces: [1, 2], role: 'head', display: 'stå opp' });
    expect(u[2].unit).toMatchObject({ head: 1, pieces: [1, 2], role: 'particle' });
    expect(u[1].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('the ordinary reading stays behind the unit reading', () => {
    const r = run('nb', 'Jeg står opp.');
    expect(r.analyses[1].candidates.map((c) => c.lemma)).toEqual(expect.arrayContaining(['stå opp', 'stå']));
    expect(r.analyses[1].candidates[0].lemma).toBe('stå opp');
  });

  it('a pronoun object stands before the particle (slår den på)', () => {
    const u = unitOf('nb', 'Han slår den på.');
    expect(u[1].lemma).toBe('slå på');
    expect(u[3].lemma).toBe('slå på');
    expect(u[2].lemma).toBe('den');
  });

  it('a noun object either side of the particle (slår på TV-en / slår TV-en på)', () => {
    expect(unitOf('nb', 'Han slår på kaffen.')[1].lemma).toBe('slå på');
    const u = unitOf('nb', 'Han slår kaffen på.');
    expect(u[1].lemma).toBe('slå på');
    expect(u[1].confidence!).toBeLessThan(0.86);
  });

  it('adverbs between the verb and the particle, inversion, a subordinate clause, an infinitive and a participle', () => {
    expect(unitOf('nb', 'Jeg står alltid opp tidlig.')[1].lemma).toBe('stå opp');
    expect(unitOf('nb', 'Klokka sju står jeg opp.')[2].lemma).toBe('stå opp');
    expect(unitOf('nb', 'Jeg vet at han står opp.')[5].lemma).toBe('stå opp');
    expect(unitOf('nb', 'Jeg skal stå opp.')[2].lemma).toBe('stå opp');
    expect(unitOf('nb', 'Jeg har stått opp.')[2].lemma).toBe('stå opp');
  });

  it('the particle may be up to four tokens away; further than that is no unit', () => {
    expect(unitOf('nb', 'Hun finner snart den gamle gode boka ut.')[1].lemma).not.toBe('finne ut');
    expect(unitOf('nb', 'Vi finner det snart ut.')[1].lemma).toBe('finne ut');
  });

  it('a clause boundary ends the search', () => {
    expect(unitOf('nb', 'Han går, ut er han ikke.')[1].lemma).not.toBe('gå ut');
    expect(unitOf('nb', 'Han står og leser opp teksten.')[1].lemma).not.toBe('stå opp');
  });

  it('a preposition that takes an object (se på bilen) is not a unit', () => {
    const u = unitOf('nb', 'Jeg ser på bilen.');
    expect(u[1].unit).toBeUndefined();
    expect(u[1].lemma).toBe('se');
  });

  it('reflexive units (ta på seg, sette seg ned) take the pronoun as a third piece', () => {
    const u = unitOf('nb', 'Hun tok på seg jakken.');
    expect(u[1]).toMatchObject({ lemma: 'ta på seg', pos: 'VERB' });
    expect(u[2].lemma).toBe('ta på seg');
    expect(u[3]).toMatchObject({ lemma: 'ta på seg', pos: 'PRON' });
    expect(u[1].unit!.pieces).toEqual([1, 2, 3]);
    const s = unitOf('nb', 'Han satte seg ned.');
    expect(s[1].lemma).toBe('sette seg ned');
  });

  it('the Nynorsk adapter has its own list (sjå ut, kome tilbake)', () => {
    expect(unitOf('nn', 'Ho ser ut som mor.')[1].lemma).toBe('sjå ut');
    expect(unitOf('nn', 'Han kjem tilbake i morgon.')[1].lemma).toBe('kome tilbake');
  });

  it('the unit list has the recon examples (B5)', () => {
    const shown = new Set(NB_UNITS.map((u) => u.display));
    for (const d of ['stå opp', 'finne ut', 'gå ut', 'komme tilbake', 'gi opp', 'slå på', 'slå av', 'ta på seg', 'skrive ned', 'se ut']) expect(shown.has(d), d).toBe(true);
  });

  it('inseparable prefixes (be-, for-, mis-, er-) never split and are not units', () => {
    for (const w of ['forstå', 'bestille', 'forlate', 'bekjenne']) {
      const c = adapter('nb').analyze(adapter('nb').tokenize(w))[0].candidates[0];
      expect(c.unit, w).toBeUndefined();
    }
    const fs = adapter('nb').analyze(adapter('nb').tokenize('forstår'))[0].candidates[0];
    expect(fs.parts?.map((p) => [p.text, p.kind])).toEqual([['for', 'prefix'], ['står', 'stem']]);
    expect(findUnits([{ normalized: 'forstår', isWord: true, verbLemmas: ['forstå'], finite: true, nominal: false, conj: false }, { normalized: 'opp', isWord: true, verbLemmas: [], finite: false, nominal: false, conj: false }], NB_UNITS)).toEqual([]);
  });

  it('constructions: a particle verb is reported as a pattern', () => {
    const r = run('nb', 'Jeg står opp klokka sju.');
    const keys = adapter('nb').detectPatterns(r.tokens, r.analyses).map((p) => p.key);
    expect(keys).toContain('particle-verb');
  });
});

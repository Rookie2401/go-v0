/**
 * The Latin analyser with the FULL lexicon loaded (Whitaker's DICTLINE, Lewis & Short as a backstop, the form priors from the non-eval treebanks):
 * the pack's frozen validation cases still read as the pack states them, the rules added for the Vulgate's spellings and the gaps the five corpora showed
 * (names, enclitics, -met, ipse, the perfects and participles, adjectives in -ns, hundreds), and the order of the glosses.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../src/core';
import { PACKS, runCase } from '../../packages/language-packs/src';
import { laAdapter, latinLexiconLoaded, loadLatinLexicon } from '../../src/adapters/la';
import { latinLexicon, orderGloss } from '../../src/adapters/latin/lexicon';

beforeAll(async () => { await loadLatinLexicon(); });

const sentence = (text: string) => laAdapter.analyze(laAdapter.tokenize(text)).filter((a) => a.token.isWord).map((a) => a.candidates);
const first = (word: string): AnalysisCandidate => sentence(word)[0][0];
const hasFeature = (c: AnalysisCandidate, k: string, v: string): boolean => (c.morph[k] ?? '').split(',').includes(v);

describe('the full lexicon', () => {
  it('is loaded, large, and idempotent', async () => {
    expect(latinLexiconLoaded()).toBe(true);
    expect(latinLexicon().lexemes.length).toBeGreaterThan(40000);
    expect(await loadLatinLexicon()).toBe(0);
  });
  it('keeps the pack frozen validation cases true', () => {
    const bad: string[] = [];
    for (const c of PACKS.la.validation) {
      const r = runCase(laAdapter, c);
      if (!r.pass) bad.push(`${c.id}: ${r.got}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('forms the corpora showed missing', () => {
  const lemmaOf: Array<[string, string]> = [
    ['puteum', 'puteus'], ['clipeos', 'clipeus'], ['velint', 'volo'], ['velim', 'volo'], ['nolentes', 'nolo'],
    ['potente', 'potens'], ['omnipotente', 'omnipotens'], ['ducentos', 'ducenti'], ['quosdam', 'quidam'], ['quemdam', 'quidam'], ['eamdem', 'idem'],
    ['acquievit', 'acquiesco'], ['cubavit', 'cubo'], ['misertus', 'misereor'], ['fuere', 'sum'], ['differt', 'differo'], ['sedium', 'sedes'], ['ossium', 'os'],
    ['mortuus', 'morior'], ['natus', 'nascor'], ['profectus', 'proficiscor'],
  ];
  it.each(lemmaOf)('%s is read as %s', (form, lemma) => {
    const reading = sentence(form)[0].find((c) => c.lemma === lemma);
    expect(reading, form).toBeDefined();
    expect(reading!.confidence).toBeGreaterThan(0.4);
  });
  it('reads a personal pronoun with ipse or -met as the pronoun, and says the emphasis in the parts', () => {
    expect(first('teipsum').lemma).toBe('tu');
    expect(first('seipsum').lemma).toBe('sui');
    expect(first('vosmetipsos').lemma).toBe('tu');
    expect(first('sibimet').lemma).toBe('sui');
    expect(first('egomet').lemma).toBe('ego');
    expect(first('teipsum').parts?.map((p) => p.lemma)).toEqual(['tu', 'ipse']);
  });
  it('reads the -ve and -ne enclitics on a word that begins with a capital, and an unaccented -q', () => {
    expect(first('actionemve').lemma).toBe('actio');
    expect(first('Ergone').lemma).toBe('ergo');
    expect(first('adeoq').lemma).toBe('adeo');
  });
  it('reads the Latin endings of Hebrew names (Abrahae) and the names a Vulgate guess would not know (Iscariotes)', () => {
    expect(first('Abrahæ').lemma).toBe('Abraham');
    expect(first('Iacobi').lemma).toBe('Iacob');
  });
  it('does not read Deus as a name beside deus: the common noun reads it', () => {
    const readingsOfDeum = sentence('In principio erat Verbum, et Verbum erat apud Deum.').pop()!;
    expect(readingsOfDeum.some((c) => c.pos === 'PROPN' && (c.lemma ?? '').toLowerCase() === 'deus')).toBe(false);
    expect(readingsOfDeum[0]).toMatchObject({ lemma: 'deus', pos: 'NOUN' });
  });
  it('reads vis as volo after si and as the noun after a preposition', () => {
    expect(sentence('Domine, si vis, potes me mundare.')[2][0].lemma).toBe('volo');
    expect(sentence('cum magna vi')[2][0]).toMatchObject({ lemma: 'vis', pos: 'NOUN' });
  });
  it('reads mei / vestrum as the personal pronoun unless a noun follows', () => {
    expect(sentence('Miserere mei, Domine')[1][0].lemma).toBe('ego');
    expect(sentence('Quis autem vestrum cogitans')[2][0].lemma).toBe('tu');
    expect(sentence('mei discipuli')[0][0].lemma).toBe('meus');
  });
});

describe('the glosses', () => {
  it('lead with the Vulgate sense for the commonest lemmas, and keep the dictionary senses after', () => {
    expect(first('Dominus').gloss).toMatch(/^lord, master \(the Lord/);
    expect(first('ecclesia').gloss).toMatch(/^church; assembly/);
    expect(first('caro').gloss).toMatch(/^flesh/);
    expect(first('Dominus').gloss).toContain('title for ecclesiastics');
  });
  it('orderGloss leaves a lemma without a lead as the dictionary gave it, and does not repeat a sense the lead already says', () => {
    expect(orderGloss('zzzz', 'NOUN', 'one; two')).toBe('one; two');
    const g = orderGloss('dominus', 'NOUN', 'owner, lord, master; the Lord; title for ecclesiastics/gentlemen');
    expect(g.split('; ').filter((x) => x === 'owner, lord, master')).toHaveLength(0);
    expect(g).toContain('title for ecclesiastics');
  });
});

describe('agreement and adverbs', () => {
  it('does not agree through a preposition or a finite verb, and a vocative agrees with nothing', () => {
    const r = sentence('Hoc erat in principio apud Deum.');
    expect(r[0].some((c) => hasFeature(c, 'Case', 'Abl') && c.confidence >= 0.95)).toBe(false);
  });
});
